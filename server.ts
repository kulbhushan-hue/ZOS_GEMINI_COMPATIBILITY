import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { loadCompatibilityDataset, normalizeVendorName } from './server/dataParser.ts';
import type { CompatibilityRecord, PtfEntry, ZosVersionKey } from './src/types/compatibility.ts';

const app = express();
app.use(express.json({ limit: '2mb' }));

const dataset = loadCompatibilityDataset();

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add your Gemini API key in AI Studio Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_/:.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveVendorAlias(rawVendor: string): string {
  const trimmed = rawVendor.trim();
  if (!trimmed || trimmed === 'ALL') return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'ca' || lower.includes('broadcom')) return 'Broadcom Inc.';
  if (lower.includes('compuware') || lower.includes('bmc')) return 'BMC Software';
  if (lower.includes('syncsort') || lower.includes('precis')) return 'Precisely';
  if (lower.includes('asg') || lower.includes('rocket')) return 'Rocket Software, Inc.';
  if (lower.includes('vanguard')) return 'VANGUARD Integrity Prof.';
  return normalizeVendorName(trimmed);
}

function filterRecords(params: {
  vendor?: string;
  product?: string;
  zosVersion?: ZosVersionKey;
  status?: string;
  onlyWithPtfs?: boolean;
}): CompatibilityRecord[] {
  const { vendor, product, status, onlyWithPtfs } = params;
  const vendorResolved = vendor && vendor !== 'ALL' ? resolveVendorAlias(vendor).toLowerCase() : '';
  const productNorm = normalizeSearchText(product || '');
  const productTokens = productNorm
    .split(' ')
    .filter((t) => t.length > 0 && t !== 'all' && t !== 'products');

  const exactAndMatches = dataset.records.filter((rec) => {
    if (vendorResolved) {
      const recV = rec.normalizedVendor.toLowerCase();
      const rawV = rec.vendor.toLowerCase();
      if (recV !== vendorResolved && !recV.includes(vendorResolved) && !rawV.includes(vendorResolved)) {
        return false;
      }
    }

    if (productTokens.length > 0) {
      const hay = normalizeSearchText(
        `${rec.product} ${rec.version} ${rec.comments} ${rec.messageId} ${rec.ptfs.map((p) => p.id).join(' ')}`
      );
      if (!productTokens.every((tok) => hay.includes(tok))) return false;
    }

    if (status && status !== 'ALL') {
      if (status === 'compatible_any') {
        if (rec.status !== 'compatible' && rec.status !== 'compatible_ptf') return false;
      } else if (status === 'incompatible_any') {
        if (rec.status !== 'incompatible' && rec.status !== 'upgrade_available') return false;
      } else if (rec.status !== status) {
        return false;
      }
    }

    if (onlyWithPtfs) {
      if (rec.ptfs.length === 0 && !/ptf/i.test(rec.ptfRequiredRaw)) return false;
    }

    return true;
  });

  // Sort exact product-name matches first, then records with PTFs
  return exactAndMatches.sort((a, b) => {
    if (productNorm) {
      const aExact = normalizeSearchText(a.product) === productNorm ? 1 : 0;
      const bExact = normalizeSearchText(b.product) === productNorm ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aStarts = normalizeSearchText(a.product).startsWith(productNorm) ? 1 : 0;
      const bStarts = normalizeSearchText(b.product).startsWith(productNorm) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
    }
    if (a.ptfs.length !== b.ptfs.length) return b.ptfs.length - a.ptfs.length;
    return a.recordNumber - b.recordNumber;
  });
}

function extractRecordsFromQuestion(
  question: string,
  vendorFilter?: string,
  productFilter?: string
): CompatibilityRecord[] {
  const qLower = question.toLowerCase();

  // Check if a specific PTF ID is mentioned anywhere in productFilter or question
  const ptfQueryMatch = /\b(LU\d{5}|RO\d{5}|SO\d{5}|RI\d{5}|BQQ\d{4}|TMT\d{4}|(?:AAF|ACF|CFF|VJD|VJC|SBH)\d{3}[A-Z])\b/i.exec(
    `${productFilter || ''} ${question}`
  );
  if (ptfQueryMatch) {
    const targetPtf = ptfQueryMatch[1].toUpperCase();
    const byPtf = dataset.records.filter((r) => r.ptfs.some((p) => p.id === targetPtf));
    if (byPtf.length > 0) return byPtf;
  }

  // If explicit vendor or product filter is provided, use it first
  const hasExplicitProduct = Boolean(productFilter && productFilter.trim() && productFilter.trim().toLowerCase() !== 'all');
  const hasExplicitVendor = Boolean(vendorFilter && vendorFilter !== 'ALL');

  let candidates = filterRecords({
    vendor: vendorFilter,
    product: productFilter,
  });

  if (hasExplicitVendor || hasExplicitProduct) {
    // Refine within explicit filter if the question narrows by status (e.g. "unapplied", "incompatible")
    if (qLower.includes('unapplied') || qLower.includes('not applied') || qLower.includes('not installed')) {
      const unapplied = candidates.filter((r) => r.ptfs.some((p) => p.status === 'not_applied'));
      if (unapplied.length > 0) return unapplied;
    }
    if (qLower.includes('incompatible') || qLower.includes('upgrade')) {
      const incompat = candidates.filter((r) => r.status === 'incompatible' || r.status === 'upgrade_available');
      if (incompat.length > 0) return incompat;
    }
    return candidates;
  }

  // Natural-language query with ALL vendors and empty product filter
  const aliasMatches: Array<{ pattern: RegExp; vendor: string }> = [
    { pattern: /\b(broadcom|ca\s+\w+)\b/i, vendor: 'Broadcom Inc.' },
    { pattern: /\b(bmc|compuware)\b/i, vendor: 'BMC Software' },
    { pattern: /\bibm\b/i, vendor: 'IBM' },
    { pattern: /\b(precisely|preciesly|syncsort)\b/i, vendor: 'Precisely' },
    { pattern: /\b(rocket|asg)\b/i, vendor: 'Rocket Software, Inc.' },
    { pattern: /\bvanguard\b/i, vendor: 'VANGUARD Integrity Prof.' },
  ];

  const matchedVendor =
    aliasMatches.find((a) => a.pattern.test(question))?.vendor ||
    dataset.summary.vendors.find((v) => {
      const firstWord = v.toLowerCase().split(/[\s,.]+/)[0];
      return firstWord.length >= 3 && qLower.includes(firstWord);
    });

  const stopWords = new Set([
    'what', 'which', 'list', 'show', 'give', 'find', 'tell', 'are', 'the', 'for', 'with',
    'and', 'all', 'ptf', 'ptfs', 'zos', 'z/os', 'version', 'versions', 'compatible',
    'compatibility', 'matrix', 'required', 'need', 'needed', 'not', 'applied', 'installed',
    'product', 'products', 'vendor', 'vendors', 'status', 'report', 'check', 'about',
    '3.2', '3.1', '2.5', '2.4', '2.3', 'v3r2', 'v3r1', 'v2r5', 'v2r4', 'v2r3', 'r3.2', 'on', 'in', 'of', 'is',
    'how', 'can', 'use', 'missing', 'upgrade', 'upgrades',
  ]);

  const tokens = normalizeSearchText(question)
    .split(' ')
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  if (qLower.includes('unapplied') || qLower.includes('not applied') || qLower.includes('not installed')) {
    const unapplied = dataset.records.filter(
      (r) => (!matchedVendor || r.normalizedVendor === matchedVendor) && r.ptfs.some((p) => p.status === 'not_applied')
    );
    if (unapplied.length > 0) return unapplied;
  }

  if (qLower.includes('incompatible') || qLower.includes('upgrade')) {
    const incompat = dataset.records.filter(
      (r) =>
        (!matchedVendor || r.normalizedVendor === matchedVendor) &&
        (r.status === 'incompatible' || r.status === 'upgrade_available')
    );
    if (incompat.length > 0) return incompat;
  }

  if (matchedVendor && tokens.length <= 1) {
    return dataset.records
      .filter((r) => r.normalizedVendor === matchedVendor)
      .sort((a, b) => b.ptfs.length - a.ptfs.length);
  }

  if (tokens.length > 0) {
    const scored = dataset.records
      .map((rec) => {
        const prodNorm = normalizeSearchText(rec.product);
        const hay = normalizeSearchText(
          `${rec.normalizedVendor} ${rec.product} ${rec.version} ${rec.ptfRequiredRaw} ${rec.comments} ${rec.messageId}`
        );
        let score = 0;
        if (matchedVendor && rec.normalizedVendor === matchedVendor) score += 6;
        for (const tok of tokens) {
          if (prodNorm.includes(tok)) score += 5;
          else if (hay.includes(tok)) score += 1;
        }
        if (qLower.includes('ptf') && rec.ptfs.length > 0) score += 2;
        return { rec, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      return scored.slice(0, 40).map((x) => x.rec);
    }
  }

  return candidates.sort((a, b) => b.ptfs.length - a.ptfs.length);
}

function buildDeterministicReport(
  matchedRecords: CompatibilityRecord[],
  vendor: string,
  product: string,
  zosVersion: ZosVersionKey
): { answerMarkdown: string; recommendedAction: string } {
  const zosLabel = dataset.summary.zosVersions.find((z) => z.key === zosVersion)?.label || zosVersion;
  const matchedPtfs = matchedRecords.flatMap((r) => r.ptfs);
  const notAppliedPtfs = matchedPtfs.filter((p) => p.status === 'not_applied');
  const appliedPtfs = matchedPtfs.filter((p) => p.status === 'applied');
  const incompatCount = matchedRecords.filter(
    (r) => r.status === 'incompatible' || r.status === 'upgrade_available'
  ).length;
  const compatCount = matchedRecords.filter(
    (r) => r.status === 'compatible' || r.status === 'compatible_ptf'
  ).length;

  const lines: string[] = [];
  lines.push(
    `### Workbook Match Summary (${vendor === 'ALL' ? 'All Vendors' : vendor}${
      product ? ` · ${product}` : ''
    } · ${zosLabel})`
  );
  lines.push(
    `Matched **${matchedRecords.length}** product entries: **${compatCount}** compatible on z/OS 3.2, **${incompatCount}** incompatible/upgrade-needed, and **${matchedPtfs.length}** PTF references (**${notAppliedPtfs.length}** Not Applied, **${appliedPtfs.length}** Applied).`
  );

  if (matchedPtfs.length > 0) {
    lines.push('');
    lines.push('### Required & Tracked PTFs');
    lines.push('| PTF ID | Status | Product & Version | Target z/OS / Subsystem |');
    lines.push('| :--- | :--- | :--- | :--- |');
    for (const p of matchedPtfs.slice(0, 25)) {
      lines.push(`| \`${p.id}\` | **${p.statusLabel}** | ${p.product} (${p.version}) | ${p.targetZos} |`);
    }
    if (matchedPtfs.length > 25) {
      lines.push(`\n*Showing 25 of ${matchedPtfs.length} matched PTFs — see the Matched PTFs tab below for the full list.*`);
    }
  } else {
    lines.push('');
    lines.push('No explicit PTF numbers are listed for the matched product entries in the workbook.');
  }

  const upgradeRecs = matchedRecords.filter((r) => r.upgradeRecommendation);
  if (upgradeRecs.length > 0) {
    lines.push('');
    lines.push('### Version Upgrade Notes');
    for (const u of upgradeRecs.slice(0, 8)) {
      lines.push(`- **${u.product} (${u.version})**: ${u.upgradeRecommendation}`);
    }
  }

  let recommendedAction = 'Review the matched compatibility matrix rows and verify vendor portals where marked.';
  if (notAppliedPtfs.length > 0) {
    const ids = Array.from(new Set(notAppliedPtfs.map((p) => p.id))).slice(0, 6).join(', ');
    recommendedAction = `Schedule SMP/E APPLY for ${notAppliedPtfs.length} unapplied PTF(s): ${ids}${
      notAppliedPtfs.length > 6 ? ' (and others listed below)' : ''
    }.`;
  } else if (upgradeRecs.length > 0) {
    recommendedAction = `Plan product upgrades for ${upgradeRecs.length} incompatible version(s) where newer compatible releases are available.`;
  } else if (appliedPtfs.length > 0) {
    recommendedAction = `All ${appliedPtfs.length} tracked PTF(s) in this selection are already applied.`;
  }

  return {
    answerMarkdown: lines.join('\n'),
    recommendedAction,
  };
}

app.get('/api/catalog', (_req, res) => {
  res.json(dataset);
});

app.get('/api/matrix', (req, res) => {
  const vendor = typeof req.query.vendor === 'string' ? req.query.vendor : undefined;
  const product = typeof req.query.product === 'string' ? req.query.product : undefined;
  const zosVersion = (typeof req.query.zosVersion === 'string' ? req.query.zosVersion : 'V3R2') as ZosVersionKey;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const onlyWithPtfs = req.query.onlyWithPtfs === 'true';

  const records = filterRecords({ vendor, product, zosVersion, status, onlyWithPtfs });
  const ptfs: PtfEntry[] = records.flatMap((r) => r.ptfs);
  res.json({ records, ptfs, count: records.length });
});

app.post('/api/bot/instant', (req, res) => {
  const {
    vendor = 'ALL',
    product = '',
    zosVersion = 'V3R2',
    question = '',
  } = req.body as {
    vendor?: string;
    product?: string;
    zosVersion?: ZosVersionKey;
    question?: string;
  };

  const effectiveQ =
    question.trim() || `${vendor} ${product} ${zosVersion}`;
  const matchedRecords = extractRecordsFromQuestion(effectiveQ, vendor, product);
  const matchedPtfs = matchedRecords.flatMap((r) => r.ptfs);
  const report = buildDeterministicReport(matchedRecords, vendor, product, zosVersion);

  res.json({
    ...report,
    matchedRecords,
    matchedPtfs,
    queryMeta: {
      vendor,
      product: product || 'All Products',
      zosVersion,
      question: effectiveQ,
    },
  });
});

app.post('/api/bot/ask', async (req, res) => {
  try {
    const {
      vendor = 'ALL',
      product = '',
      zosVersion = 'V3R2',
      question = '',
      history = [],
    } = req.body as {
      vendor?: string;
      product?: string;
      zosVersion?: ZosVersionKey;
      question?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    const userQuestion =
      question.trim() ||
      `Analyze compatibility and list all required PTFs for vendor "${vendor}", product "${product || 'All Products'}", on ${zosVersion}.`;

    const matchedRecords = extractRecordsFromQuestion(userQuestion, vendor, product);
    const matchedPtfs = matchedRecords.flatMap((r) => r.ptfs);

    // Compact top 25 records for fast, accurate Gemini synthesis
    const contextRecords = matchedRecords.slice(0, 25).map((r) => ({
      rec: r.recordNumber,
      vendor: r.normalizedVendor,
      product: r.product,
      ver: r.version,
      r32: r.statusLabel,
      targetZosCell: r.matrix[zosVersion]?.statusText || r.statusLabel,
      ptfs: r.ptfs.map((p) => `${p.id} (${p.statusLabel}, ${p.targetZos})`),
      fmid: r.fmids.length > 0 ? r.fmids : undefined,
      fixcat: r.messageId || undefined,
      upgrade: r.upgradeRecommendation || undefined,
      note: r.comments ? r.comments.slice(0, 180) : undefined,
      url: r.reportUrl || r.portalFallbackUrl || undefined,
    }));

    const ai = createGeminiClient();

    const systemInstruction = `You are a Principal z/OS Mainframe ISV Compatibility Engineer.
Answer concisely using ONLY the provided workbook records.
Rules:
1. Never invent PTF numbers, FMIDs, or statuses.
2. Always include a Markdown table of exact PTFs (PTF ID, Status, Product & Version, Target z/OS/Subsystem) when PTFs exist in the records.
3. Highlight whether required PTFs are Applied, Not Applied, Superseded, Available, or Not Available.
4. For non-3.2 z/OS versions (V3R1, V2R5, V2R4, V2R3), state what is explicitly verified in the workbook vs. requiring vendor portal verification.
5. Keep response crisp and direct.`;

    const recentHistory = Array.isArray(history)
      ? history
          .slice(-2)
          .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content.slice(0, 300)}`)
          .join('\n')
      : '';

    const promptPayload = `Target: Vendor=${vendor}, Product=${product || 'All'}, z/OS=${zosVersion}
Matches=${matchedRecords.length}, PTFs=${matchedPtfs.length}
${recentHistory ? `Prior context:\n${recentHistory}\n` : ''}Question: ${userQuestion}
Records: ${JSON.stringify(contextRecords)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: promptPayload,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answerMarkdown: {
              type: Type.STRING,
              description:
                'Concise Markdown answer summarizing compatibility for the requested z/OS version and listing all matched PTFs with status and verification link.',
            },
            recommendedAction: {
              type: Type.STRING,
              description:
                'One concise sentence stating the exact SMP/E PTF apply or product upgrade next step.',
            },
          },
          required: ['answerMarkdown', 'recommendedAction'],
        },
      },
    });

    const parsedJson = JSON.parse((response.text ?? '{}').trim()) as {
      answerMarkdown?: string;
      recommendedAction?: string;
    };

    res.json({
      answerMarkdown:
        parsedJson.answerMarkdown ||
        buildDeterministicReport(matchedRecords, vendor, product, zosVersion).answerMarkdown,
      recommendedAction:
        parsedJson.recommendedAction ||
        buildDeterministicReport(matchedRecords, vendor, product, zosVersion).recommendedAction,
      matchedRecords,
      matchedPtfs,
      queryMeta: {
        vendor,
        product: product || 'All Products',
        zosVersion,
        question: userQuestion,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query Gemini AI service.';
    console.error('Error in /api/bot/ask:', err);
    const statusCode = message.includes('GEMINI_API_KEY') ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`zCompat Matrix server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
