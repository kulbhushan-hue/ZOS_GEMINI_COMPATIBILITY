import fs from 'node:fs';
import path from 'node:path';
import type {
  CatalogSummary,
  CompatibilityRecord,
  CompatibilityStatus,
  PtfEntry,
  PtfInstallStatus,
  VendorPortal,
  ZosMatrixCell,
  ZosVersionKey,
} from '../src/types/compatibility.ts';

interface RawRecord {
  recordNumber: number;
  fields: Record<string, string>;
}

const ZOS_VERSIONS: Array<{ key: ZosVersionKey; label: string; shortLabel: string }> = [
  { key: 'V3R2', label: 'z/OS 3.2 (V3R2)', shortLabel: 'z/OS 3.2' },
  { key: 'V3R1', label: 'z/OS 3.1 (V3R1)', shortLabel: 'z/OS 3.1' },
  { key: 'V2R5', label: 'z/OS 2.5 (V2R5)', shortLabel: 'z/OS 2.5' },
  { key: 'V2R4', label: 'z/OS 2.4 (V2R4)', shortLabel: 'z/OS 2.4' },
  { key: 'V2R3', label: 'z/OS 2.3 (V2R3)', shortLabel: 'z/OS 2.3' },
];

const KNOWN_FIELD_KEYS = [
  'Vendor',
  'vendor',
  'Product',
  'Version',
  'VRM',
  'R3.2 Compatible (Y)Yes or (N)No',
  'If Yes, PTF Required?',
  'Link to verify compatibility report',
  'Messsage ID to identify Product version',
  'Information Available without login',
  'If No -Need MFA to Login ?',
  'Comments/Link',
  'End of Support Date  (EOS)',
  'Latest Version',
];

export function normalizeVendorName(raw: string): string {
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower.includes('broadcom')) return 'Broadcom Inc.';
  if (lower.includes('bmc')) return 'BMC Software';
  if (lower === 'ibm' || lower.startsWith('ibm ')) return 'IBM';
  if (lower.includes('precis') || lower.includes('precies')) return 'Precisely';
  if (lower.includes('rocket') || lower === 'asg') return 'Rocket Software, Inc.';
  if (lower.includes('vanguard')) return 'VANGUARD Integrity Prof.';
  if (lower.includes('levi ray')) return 'Levi Ray & Shoup, Inc.';
  if (lower.includes('compute (bridgend)')) return 'Compute (Bridgend) Ltd.';
  if (lower.includes('data kinetics')) return 'Data Kinetics Ltd';
  if (lower.includes('opentext')) return 'OpenText Corporation';
  if (lower.includes('fis')) return 'FIS';
  if (lower.includes('cisco')) return 'Cisco Systems, Inc.';
  return v;
}

function parseWorksheetRecords(sectionText: string): RawRecord[] {
  const lines = sectionText.split(/\r?\n/);
  const records: RawRecord[] = [];
  let current: RawRecord | null = null;
  let lastKey: string | null = null;

  for (const line of lines) {
    const recMatch = /^RECORD\s+(\d+)\s*$/.exec(line);
    if (recMatch) {
      if (current) records.push(current);
      current = { recordNumber: Number(recMatch[1]), fields: {} };
      lastKey = null;
      continue;
    }
    if (!current) continue;

    // Check if line starts with a known field key followed by optional spaces and ':'
    let matchedKey: string | null = null;
    let matchedValue = '';
    for (const key of KNOWN_FIELD_KEYS) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}\\s*:(.*)$`);
      const m = regex.exec(line);
      if (m) {
        matchedKey = key;
        matchedValue = m[1].trim();
        break;
      }
    }

    if (matchedKey) {
      current.fields[matchedKey] = matchedValue;
      lastKey = matchedKey;
    } else if (lastKey && line.trim() !== '' && !/^={10,}$/.test(line) && !/^WORKSHEET:/.test(line)) {
      current.fields[lastKey] = `${current.fields[lastKey]}\n${line.trim()}`.trim();
    }
  }
  if (current) records.push(current);
  return records;
}

function extractPtfIds(text: string): string[] {
  if (!text) return [];
  const regex = /\b(LU\d{5}|RO\d{5}|SO\d{5}|RI\d{5}|BQQ\d{4}|BPQ\d{4}|TMT\d{4}|(?:AAF|ACF|CFF|VJD|VJC|SBH)\d{3}[A-Z]|(?:UI|UJ|UO|PH|OA|UA)\d{5})\b/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

function extractFmids(text: string): string[] {
  if (!text) return [];
  const regex = /\bFMID\s+([A-Z0-9]{7})\b/gi;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1].toUpperCase());
  }
  return Array.from(found);
}

function inferPtfStatus(ptfId: string, ptfRaw: string, comments: string): { status: PtfInstallStatus; label: string } {
  const idLower = ptfId.toLowerCase();
  const commentsNormalized = comments.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const ptfRawLower = ptfRaw.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').toLowerCase();

  // Split comments into clauses around "and", ";", "//"
  const clauses = commentsNormalized
    .split(/(?:\band\b|;|\/\/)+/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    if (!clause.includes(idLower)) continue;

    // Look at text right after the PTF ID (or group containing slash/comma-separated PTF IDs)
    const afterIdMatch = new RegExp(`${idLower}(?:\\s*[/,]\\s*[a-z0-9]+)*\\s+([^.]*)`).exec(clause);
    const tail = afterIdMatch ? afterIdMatch[1].trim() : '';

    if (/^(?:is\s+|are\s+)?superseded\b/.test(tail)) {
      return { status: 'superseded', label: 'Superseded' };
    }
    if (/^(?:are\s+|is\s+)?not\s+(?:applied|installed)\b/.test(tail)) {
      return { status: 'not_applied', label: 'Not Applied' };
    }
    if (/^(?:are\s+|is\s+)?not\s+available\b/.test(tail)) {
      return { status: 'not_available', label: 'Not Available' };
    }
    if (/^(?:is\s+|are\s+)?(?:applied|installed)\b/.test(tail)) {
      return { status: 'applied', label: 'Applied' };
    }
    if (/^(?:is\s+|are\s+)?available\b/.test(tail)) {
      return { status: 'available', label: 'Available' };
    }
    // Check explicit "... which is required for ... is available / is not available"
    if (/which is required for[^.]*\bis not available\b/.test(tail)) {
      return { status: 'not_available', label: 'Not Available' };
    }
    if (/which is required for[^.]*\bis available\b/.test(tail)) {
      return { status: 'available', label: 'Available' };
    }
  }

  // Handle Record 15 ("PTFs are not installed" in ptfRaw, while comments talk about z/OS V3R2 data not available)
  if (ptfRawLower.includes('not installed') || ptfRawLower.includes('not applied')) {
    return { status: 'not_applied', label: 'Not Applied' };
  }
  if (ptfRawLower.includes('not available')) {
    return { status: 'not_available', label: 'Not Available' };
  }

  // Fallback to whole-record comment cues when single PTF or uniform status
  if (commentsNormalized.includes('ptfs are not installed') || commentsNormalized.includes('ptfs not installed')) {
    return { status: 'not_applied', label: 'Not Applied' };
  }
  if (commentsNormalized.includes('ptfs is installed') || commentsNormalized.includes('ptfs are installed')) {
    return { status: 'applied', label: 'Applied' };
  }
  if (ptfRawLower.includes(idLower) && commentsNormalized.includes('not applied') && !commentsNormalized.includes(idLower)) {
    return { status: 'not_applied', label: 'Not Applied' };
  }
  if (ptfRawLower.includes('available') && !ptfRawLower.includes('not available')) {
    return { status: 'available', label: 'Available' };
  }
  if (ptfRawLower.includes(idLower) && !commentsNormalized.includes(idLower)) {
    return { status: 'required', label: 'Required' };
  }
  return { status: 'required', label: 'Required' };
}

function inferTargetZosForPtf(ptfId: string, ptfRaw: string, messageId: string, comments: string): string {
  const combined = `${ptfRaw} ${messageId} ${comments}`;
  if (/z\/?os\.?v3r1|z\/os\s*3\.1/i.test(combined) && !/v3r2|3\.2/i.test(ptfRaw)) {
    if (/v3r1/i.test(comments) || /v3r1/i.test(messageId)) return 'z/OS 3.1 (V3R1)';
  }
  if (/z\/?os\.?v2r5|z\/os\s*2\.5/i.test(combined)) {
    return 'z/OS 2.5 (V2R5)';
  }
  if (/cics\.?v6r2/i.test(messageId)) {
    return 'z/OS 3.2 · CICS V6R2';
  }
  if (/bqq5939/i.test(ptfId)) {
    return 'z/OS 3.2 · Db2 V13.1';
  }
  if (/bqq7350|bqq6106/i.test(ptfId)) {
    return 'z/OS 3.2 · IMS 15.x';
  }
  if (/sbh217a/i.test(ptfId)) {
    return 'z/OS 3.2 · CTS 6.3';
  }
  if (/sbh233a/i.test(ptfId)) {
    return 'z/OS 3.2 · MQ 9.4.x';
  }
  return 'z/OS 3.2 (V3R2)';
}

function classifyStatus(
  rawCompat: string,
  ptfIds: string[],
  ptfRaw: string
): { status: CompatibilityStatus; label: string; upgradeRecommendation?: string } {
  const cleaned = rawCompat.trim();
  const lower = cleaned.toLowerCase();

  if (!cleaned) {
    if (ptfIds.length > 0 || /ptf/i.test(ptfRaw)) {
      return { status: 'compatible_ptf', label: 'PTF Required' };
    }
    return { status: 'unassessed', label: 'Unassessed' };
  }

  if (lower === 'yes' || lower === 'y') {
    if (ptfIds.length > 0 || (/ptf/i.test(ptfRaw) && !/not found|no ptf/i.test(ptfRaw))) {
      return { status: 'compatible_ptf', label: 'Compatible (PTF Req.)' };
    }
    return { status: 'compatible', label: 'Compatible' };
  }

  if (lower.includes('no info')) {
    return { status: 'no_info', label: 'No Info' };
  }

  if (lower.startsWith('no')) {
    const upgradeMatch = /(V\d+\s+IS\s+AVAILABLE|Compatible with Zos\s*[\d.]+)/i.exec(cleaned);
    if (upgradeMatch) {
      return {
        status: 'upgrade_available',
        label: 'Upgrade Needed',
        upgradeRecommendation: upgradeMatch[1].trim(),
      };
    }
    return { status: 'incompatible', label: 'Incompatible' };
  }

  return { status: 'unassessed', label: cleaned };
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function buildMatrixForRecord(
  status: CompatibilityStatus,
  statusLabel: string,
  ptfs: PtfEntry[],
  ptfRaw: string,
  messageId: string,
  comments: string,
  rawCompat: string
): Record<ZosVersionKey, ZosMatrixCell> {
  const combined = `${messageId} ${comments} ${ptfRaw} ${rawCompat}`;
  const allPtfIds = ptfs.map((p) => p.id);

  const v3r2Ptfs = ptfs
    .filter((p) => p.targetZos.includes('3.2') || !p.targetZos.includes('3.1') && !p.targetZos.includes('2.5'))
    .map((p) => p.id);

  const v3r1Ptfs = ptfs
    .filter((p) => p.targetZos.includes('3.1'))
    .map((p) => p.id);

  const v2r5Ptfs = ptfs
    .filter((p) => p.targetZos.includes('2.5'))
    .map((p) => p.id);

  const v3r2Cell: ZosMatrixCell = {
    zosVersion: 'V3R2',
    label: 'z/OS 3.2',
    status,
    statusText: statusLabel,
    ptfs: v3r2Ptfs.length > 0 ? v3r2Ptfs : (status === 'compatible_ptf' ? allPtfIds : []),
    verifiedInWorkbook: status !== 'unassessed',
    note: comments || ptfRaw || undefined,
  };

  let v3r1Cell: ZosMatrixCell = {
    zosVersion: 'V3R1',
    label: 'z/OS 3.1',
    status: 'unassessed',
    statusText: 'Verify Portal',
    ptfs: [],
    verifiedInWorkbook: false,
  };
  if (v3r1Ptfs.length > 0 || /v3r1|z\/os\s*3\.1/i.test(combined)) {
    v3r1Cell = {
      zosVersion: 'V3R1',
      label: 'z/OS 3.1',
      status: v3r1Ptfs.length > 0 ? 'compatible_ptf' : 'compatible',
      statusText: v3r1Ptfs.length > 0 ? 'PTF Required' : 'Compatible',
      ptfs: v3r1Ptfs,
      verifiedInWorkbook: true,
      note: 'Referenced in workbook FIXCAT/comments',
    };
  } else if (status === 'compatible' || status === 'compatible_ptf') {
    v3r1Cell = {
      zosVersion: 'V3R1',
      label: 'z/OS 3.1',
      status: 'compatible',
      statusText: 'Check Portal (3.2 OK)',
      ptfs: [],
      verifiedInWorkbook: false,
      note: 'z/OS 3.2 compatible; verify z/OS 3.1 service level',
    };
  }

  let v2r5Cell: ZosMatrixCell = {
    zosVersion: 'V2R5',
    label: 'z/OS 2.5',
    status: 'unassessed',
    statusText: 'Verify Portal',
    ptfs: [],
    verifiedInWorkbook: false,
  };
  if (v2r5Ptfs.length > 0 || /v2r5|z\/os\s*2\.5/i.test(combined)) {
    v2r5Cell = {
      zosVersion: 'V2R5',
      label: 'z/OS 2.5',
      status: v2r5Ptfs.length > 0 ? 'compatible_ptf' : 'compatible',
      statusText: v2r5Ptfs.length > 0 ? 'PTF Required' : 'Compatible',
      ptfs: v2r5Ptfs,
      verifiedInWorkbook: true,
      note: 'Explicitly referenced for z/OS V2R5 in workbook',
    };
  }

  const v2r4Cell: ZosMatrixCell = {
    zosVersion: 'V2R4',
    label: 'z/OS 2.4',
    status: 'unassessed',
    statusText: 'Verify Portal',
    ptfs: [],
    verifiedInWorkbook: false,
  };

  let v2r3Cell: ZosMatrixCell = {
    zosVersion: 'V2R3',
    label: 'z/OS 2.3',
    status: 'unassessed',
    statusText: 'Verify Portal',
    ptfs: [],
    verifiedInWorkbook: false,
  };
  if (/zos\s*2\.3|v2r3/i.test(combined)) {
    v2r3Cell = {
      zosVersion: 'V2R3',
      label: 'z/OS 2.3',
      status: 'compatible',
      statusText: 'Compatible (2.3)',
      ptfs: [],
      verifiedInWorkbook: true,
      note: 'Explicitly noted as compatible with z/OS 2.3',
    };
  }

  return {
    V3R2: v3r2Cell,
    V3R1: v3r1Cell,
    V2R5: v2r5Cell,
    V2R4: v2r4Cell,
    V2R3: v2r3Cell,
  };
}

export interface ParsedDataset {
  records: CompatibilityRecord[];
  ptfs: PtfEntry[];
  portals: VendorPortal[];
  summary: CatalogSummary;
}

export function loadCompatibilityDataset(): ParsedDataset {
  const dataPath = path.resolve(process.cwd(), 'public/assets/aistudio/ISV_Compatibility_assessment_Data_00732e17.txt');
  const rawText = fs.readFileSync(dataPath, 'utf-8');

  const sheet1Match = /WORKSHEET:\s*Sheet1([\s\S]*?)WORKSHEET:\s*Sheet2/.exec(rawText);
  const sheet2Match = /WORKSHEET:\s*Sheet2([\s\S]*?)WORKSHEET:\s*data/.exec(rawText);
  const dataMatch = /WORKSHEET:\s*data([\s\S]*)$/.exec(rawText);

  const sheet1Raw = sheet1Match ? parseWorksheetRecords(sheet1Match[1]) : [];
  const sheet2Raw = sheet2Match ? parseWorksheetRecords(sheet2Match[1]) : [];
  const dataRaw = dataMatch ? parseWorksheetRecords(dataMatch[1]) : [];

  // Map Sheet1 portal URLs by normalized vendor
  const portalMap = new Map<string, { url: string; noLogin: string; mfa: string; originalVendor: string; notes: string }>();
  for (const r of sheet1Raw) {
    const v = r.fields['vendor'] || r.fields['Vendor'] || '';
    if (!v) continue;
    const norm = normalizeVendorName(v);
    const link = r.fields['Link to verify compatibility report'] || '';
    const notes = isUrl(link) ? '' : link;
    portalMap.set(norm, {
      url: isUrl(link) ? link : '',
      noLogin: r.fields['Information Available without login'] || 'Unknown',
      mfa: r.fields['If No -Need MFA to Login ?'] || 'No',
      originalVendor: v,
      notes,
    });
  }
  // Rocket fallback if ASG mentioned Rocket
  if (portalMap.has('Rocket Software, Inc.') && !portalMap.get('Rocket Software, Inc.')?.url) {
    portalMap.set('Rocket Software, Inc.', {
      url: 'https://my.rocketsoftware.com/RocketCommunity/s/product-compatibility',
      noLogin: 'No (Customer Portal)',
      mfa: 'Check Portal',
      originalVendor: 'Rocket / ASG',
      notes: 'ASG is part of Rocket Software',
    });
  }

  // Track Sheet2 inventory keys
  const sheet2Keys = new Set<string>();
  for (const r of sheet2Raw) {
    const vendor = normalizeVendorName(r.fields['Vendor'] || '');
    const product = (r.fields['Product'] || '').trim().toLowerCase();
    const vrm = (r.fields['VRM'] || '').trim().toLowerCase();
    if (vendor && product) {
      sheet2Keys.add(`${vendor}|${product}|${vrm}`);
      sheet2Keys.add(`${vendor}|${product}`);
    }
  }

  // Index raw data records by recordNumber so cross-references like "same as line no 25,26" can resolve
  const rawByNum = new Map<number, RawRecord>();
  for (const r of dataRaw) {
    rawByNum.set(r.recordNumber, r);
  }

  const records: CompatibilityRecord[] = [];
  const allPtfs: PtfEntry[] = [];

  for (const r of dataRaw) {
    const vendorRaw = (r.fields['Vendor'] || '').trim();
    const productRaw = (r.fields['Product'] || '').trim();
    if (!vendorRaw && !productRaw) continue; // skip empty RECORD 4

    const normVendor = normalizeVendorName(vendorRaw);
    const version = (r.fields['Version'] || '').trim();
    let compatRaw = (r.fields['R3.2 Compatible (Y)Yes or (N)No'] || '').trim();
    let ptfRequiredRaw = (r.fields['If Yes, PTF Required?'] || '').trim();
    let reportLink = (r.fields['Link to verify compatibility report'] || '').trim();
    let messageId = (r.fields['Messsage ID to identify Product version'] || '').trim();
    let noLogin = (r.fields['Information Available without login'] || '').trim();
    let mfa = (r.fields['If No -Need MFA to Login ?'] || '').trim();
    let comments = (r.fields['Comments/Link'] || '').trim();

    // Resolve "same as line no 25,26" cross-references
    const refMatch = /same as line no\s+([\d,\s]+)/i.exec(compatRaw);
    if (refMatch) {
      const nums = refMatch[1]
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
      // Prefer the matching version line (usually the second number, e.g., 26 for V4)
      const targetRef =
        nums
          .map((n) => rawByNum.get(n))
          .find((ref) => ref && (ref.fields['Version'] || '').trim() === version) ||
        rawByNum.get(nums[nums.length - 1]);

      if (targetRef) {
        compatRaw = (targetRef.fields['R3.2 Compatible (Y)Yes or (N)No'] || '').trim();
        ptfRequiredRaw = (targetRef.fields['If Yes, PTF Required?'] || '').trim();
        reportLink = (targetRef.fields['Link to verify compatibility report'] || '').trim();
        messageId = (targetRef.fields['Messsage ID to identify Product version'] || '').trim();
        noLogin = (targetRef.fields['Information Available without login'] || '').trim();
        mfa = (targetRef.fields['If No -Need MFA to Login ?'] || '').trim();
        const refComments = (targetRef.fields['Comments/Link'] || '').trim();
        comments = refComments ? `${refComments} (Cross-referenced from Record ${targetRef.recordNumber})` : `Cross-referenced from Record ${targetRef.recordNumber}`;
      }
    }

    const portalInfo = portalMap.get(normVendor);
    const validReportUrl = isUrl(reportLink) ? reportLink : '';
    const portalFallbackUrl = portalInfo?.url || '';

    // Combine text to extract PTFs
    const ptfSourceText = `${ptfRequiredRaw}\n${comments}`;
    const extractedPtfIds = extractPtfIds(ptfSourceText);
    const fmids = extractFmids(ptfSourceText);

    const ptfEntries: PtfEntry[] = extractedPtfIds.map((ptfId) => {
      const inferred = inferPtfStatus(ptfId, ptfRequiredRaw, comments);
      const targetZos = inferTargetZosForPtf(ptfId, ptfRequiredRaw, messageId, comments);
      const entry: PtfEntry = {
        id: ptfId,
        vendor: normVendor,
        product: productRaw,
        version: version || 'Unspecified',
        recordNumber: r.recordNumber,
        targetZos,
        status: inferred.status,
        statusLabel: inferred.label,
        fmid: fmids[0],
        fixcat: messageId || undefined,
        contextNote: ptfRequiredRaw || comments || 'Listed in workbook',
        reportUrl: validReportUrl || portalFallbackUrl || undefined,
      };
      allPtfs.push(entry);
      return entry;
    });

    const classified = classifyStatus(compatRaw, extractedPtfIds, ptfRequiredRaw);
    const matrix = buildMatrixForRecord(
      classified.status,
      classified.label,
      ptfEntries,
      ptfRequiredRaw,
      messageId,
      comments,
      compatRaw
    );

    const keyWithVrm = `${normVendor}|${productRaw.toLowerCase()}|${version.toLowerCase()}`;
    const keyNoVrm = `${normVendor}|${productRaw.toLowerCase()}`;

    records.push({
      id: `rec-${r.recordNumber}`,
      recordNumber: r.recordNumber,
      vendor: vendorRaw,
      normalizedVendor: normVendor,
      product: productRaw,
      version: version || '—',
      rawCompatibility: compatRaw || '—',
      status: classified.status,
      statusLabel: classified.label,
      ptfRequiredRaw,
      ptfs: ptfEntries,
      fmids,
      reportUrl: validReportUrl,
      portalFallbackUrl,
      messageId,
      availableWithoutLogin: noLogin || portalInfo?.noLogin || '—',
      mfaRequired: mfa || portalInfo?.mfa || '—',
      comments: comments || (!validReportUrl && reportLink ? reportLink : ''),
      upgradeRecommendation: classified.upgradeRecommendation,
      matrix,
      inSheet2Inventory: sheet2Keys.has(keyWithVrm) || sheet2Keys.has(keyNoVrm),
    });
  }

  // Build Vendor Portal directory combining Sheet1 & aggregated stats
  const vendorStatsMap = new Map<string, { total: number; compat: number; ptfs: number }>();
  for (const rec of records) {
    const cur = vendorStatsMap.get(rec.normalizedVendor) || { total: 0, compat: 0, ptfs: 0 };
    cur.total += 1;
    if (rec.status === 'compatible' || rec.status === 'compatible_ptf') cur.compat += 1;
    cur.ptfs += rec.ptfs.length;
    vendorStatsMap.set(rec.normalizedVendor, cur);
  }

  const portals: VendorPortal[] = Array.from(vendorStatsMap.entries())
    .map(([normVendor, stats]) => {
      const p = portalMap.get(normVendor);
      const firstRecWithUrl = records.find((rec) => rec.normalizedVendor === normVendor && rec.reportUrl);
      return {
        vendor: p?.originalVendor || normVendor,
        normalizedVendor: normVendor,
        reportUrl: p?.url || firstRecWithUrl?.reportUrl || '',
        availableWithoutLogin: p?.noLogin || 'Check Vendor',
        mfaRequired: p?.mfa || 'Check Vendor',
        notes: p?.notes || (p ? 'Official compatibility lookup portal' : 'Vendor inventory tracked in workbook'),
        productCount: stats.total,
        compatibleCount: stats.compat,
        ptfCount: stats.ptfs,
      };
    })
    .sort((a, b) => b.productCount - a.productCount);

  const uniqueVendorList = Array.from(new Set(records.map((r) => r.normalizedVendor))).sort((a, b) =>
    a.localeCompare(b)
  );
  const uniquePtfIds = new Set(allPtfs.map((p) => p.id));

  const summary: CatalogSummary = {
    totalRecords: records.length,
    totalSheet2Inventory: sheet2Raw.length,
    totalUniqueVendors: uniqueVendorList.length,
    totalUniquePtfs: uniquePtfIds.size,
    compatibleCount: records.filter((r) => r.status === 'compatible').length,
    ptfRequiredCount: records.filter((r) => r.status === 'compatible_ptf').length,
    incompatibleCount: records.filter((r) => r.status === 'incompatible' || r.status === 'upgrade_available').length,
    noInfoCount: records.filter((r) => r.status === 'no_info').length,
    unassessedCount: records.filter((r) => r.status === 'unassessed').length,
    vendors: uniqueVendorList,
    zosVersions: ZOS_VERSIONS,
  };

  return {
    records,
    ptfs: allPtfs,
    portals,
    summary,
  };
}
