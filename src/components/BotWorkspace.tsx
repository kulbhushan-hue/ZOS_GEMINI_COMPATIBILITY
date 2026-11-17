import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import type {
  BotStructuredResponse,
  CompatibilityRecord,
  PtfEntry,
  ZosVersionKey,
} from '../types/compatibility';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CompatibilityStatusLabel, PtfStatusLabel } from './StatusCell';

interface BotWorkspaceProps {
  records: CompatibilityRecord[];
  vendors: string[];
  zosVersions: Array<{ key: ZosVersionKey; label: string; shortLabel: string }>;
  selectedVendor: string;
  setSelectedVendor: (v: string) => void;
  selectedProduct: string;
  setSelectedProduct: (p: string) => void;
  selectedZos: ZosVersionKey;
  setSelectedZos: (z: ZosVersionKey) => void;
  onSelectRecord: (rec: CompatibilityRecord) => void;
  onFilteredRecordsChange: (recs: CompatibilityRecord[]) => void;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  source?: 'workbook' | 'ai';
  content: string;
  recommendedAction?: string;
  meta?: {
    vendor: string;
    product: string;
    zosVersion: ZosVersionKey;
  };
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_/:.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PRESET_QUERIES: Array<{
  label: string;
  vendor: string;
  product: string;
  zos: ZosVersionKey;
  question: string;
}> = [
  {
    label: 'Broadcom z/OS 3.2 PTFs',
    vendor: 'Broadcom Inc.',
    product: '',
    zos: 'V3R2',
    question: 'List all Broadcom products for z/OS 3.2 with their required PTFs, installation status, and FIXCAT IDs.',
  },
  {
    label: 'BMC Abend-Aid PTFs',
    vendor: 'BMC Software',
    product: 'Abend-Aid',
    zos: 'V3R2',
    question: 'Check compatibility and list all PTFs needed for BMC Abend-Aid products on z/OS 3.2.',
  },
  {
    label: 'Unapplied PTFs Audit',
    vendor: 'ALL',
    product: '',
    zos: 'V3R2',
    question: 'Which products across all vendors have required PTFs that are currently Not Applied or Not Installed on z/OS 3.2?',
  },
  {
    label: 'IBM z/OS 3.2 Upgrades',
    vendor: 'IBM',
    product: '',
    zos: 'V3R2',
    question: 'List IBM products that are incompatible or require a version upgrade on z/OS 3.2.',
  },
];

export function BotWorkspace({
  records,
  vendors,
  zosVersions,
  selectedVendor,
  setSelectedVendor,
  selectedProduct,
  setSelectedProduct,
  selectedZos,
  setSelectedZos,
  onSelectRecord,
  onFilteredRecordsChange,
}: BotWorkspaceProps) {
  const [questionInput, setQuestionInput] = useState('');
  const [onlyPtfs, setOnlyPtfs] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'matrix' | 'ptfs'>('matrix');

  // Product suggestions filtered by selected vendor
  const productOptions = useMemo(() => {
    const source =
      selectedVendor === 'ALL'
        ? records
        : records.filter((r) => r.normalizedVendor === selectedVendor);
    return Array.from(new Set(source.map((r) => r.product))).sort((a, b) => a.localeCompare(b));
  }, [records, selectedVendor]);

  // Live deterministic match set for the Matrix & PTF tabs
  const liveMatches = useMemo(() => {
    const prodTokens = normalizeText(selectedProduct)
      .split(' ')
      .filter((t) => t.length > 0 && t !== 'all' && t !== 'products');

    return records.filter((r) => {
      if (selectedVendor !== 'ALL' && r.normalizedVendor !== selectedVendor) {
        return false;
      }
      if (prodTokens.length > 0) {
        const hay = normalizeText(
          `${r.product} ${r.version} ${r.comments} ${r.messageId} ${r.ptfs.map((p) => p.id).join(' ')}`
        );
        if (!prodTokens.every((tok) => hay.includes(tok))) return false;
      }
      if (onlyPtfs && r.ptfs.length === 0) {
        return false;
      }
      return true;
    });
  }, [records, selectedVendor, selectedProduct, onlyPtfs]);

  useEffect(() => {
    onFilteredRecordsChange(liveMatches);
  }, [liveMatches, onFilteredRecordsChange]);

  const livePtfs: PtfEntry[] = useMemo(() => {
    return liveMatches.flatMap((r) => r.ptfs);
  }, [liveMatches]);

  async function runBotQuery(override?: {
    vendor?: string;
    product?: string;
    zos?: ZosVersionKey;
    question?: string;
  }) {
    const targetVendor = override?.vendor ?? selectedVendor;
    const targetProduct = override?.product ?? selectedProduct;
    const targetZos = override?.zos ?? selectedZos;
    const rawQuestion = (override?.question ?? questionInput).trim();

    const effectiveQuestion =
      rawQuestion ||
      `Check compatibility and list all required PTFs for ${
        targetVendor === 'ALL' ? 'all vendors' : targetVendor
      }${targetProduct ? ` (${targetProduct})` : ''} on ${
        zosVersions.find((z) => z.key === targetZos)?.label || targetZos
      }.`;

    setAiNotice(null);

    const userTurnId = `u-${Date.now()}`;
    const userTurn: ChatTurn = {
      id: userTurnId,
      role: 'user',
      content: effectiveQuestion,
      meta: {
        vendor: targetVendor,
        product: targetProduct || 'All Products',
        zosVersion: targetZos,
      },
    };
    setChatTurns((prev) => [...prev, userTurn]);

    // 1. Instant deterministic workbook report (< 20ms)
    try {
      const instantRes = await fetch('/api/bot/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: targetVendor,
          product: targetProduct,
          zosVersion: targetZos,
          question: effectiveQuestion,
        }),
      });
      if (instantRes.ok) {
        const instantData = (await instantRes.json()) as BotStructuredResponse;
        setChatTurns((prev) => [
          ...prev,
          {
            id: `wb-${Date.now()}`,
            role: 'assistant',
            source: 'workbook',
            content: instantData.answerMarkdown,
            recommendedAction: instantData.recommendedAction,
          },
        ]);
      }
    } catch {
      // Continue to AI query even if instant endpoint had a transient issue
    }

    // 2. Fast Gemini AI synthesis (ThinkingLevel.LOW)
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/bot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: targetVendor,
          product: targetProduct,
          zosVersion: targetZos,
          question: effectiveQuestion,
          history: chatTurns.slice(-2).map((t) => ({ role: t.role, content: t.content })),
        }),
      });

      const payload = (await res.json()) as BotStructuredResponse & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || `AI request failed with status ${res.status}`);
      }

      setChatTurns((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          source: 'ai',
          content: payload.answerMarkdown,
          recommendedAction: payload.recommendedAction,
        },
      ]);
      if (!override?.question) {
        setQuestionInput('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to reach Gemini AI service.';
      setAiNotice(msg);
    } finally {
      setIsAiLoading(false);
    }
  }

  function handlePreset(preset: (typeof PRESET_QUERIES)[number]) {
    setSelectedVendor(preset.vendor);
    setSelectedProduct(preset.product);
    setSelectedZos(preset.zos);
    setQuestionInput(preset.question);
    void runBotQuery({
      vendor: preset.vendor,
      product: preset.product,
      zos: preset.zos,
      question: preset.question,
    });
  }

  function handleReset() {
    setSelectedVendor('ALL');
    setSelectedProduct('');
    setSelectedZos('V3R2');
    setOnlyPtfs(false);
    setQuestionInput('');
    setChatTurns([]);
    setAiNotice(null);
  }

  return (
    <div className="space-y-6">
      {/* Structured Query Console */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              ISV Compatibility &amp; PTF Assessment Bot
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a vendor, product, and target z/OS release for instant PTF lookup, matrix generation, and AI analysis.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Filters</span>
          </button>
        </div>

        {/* 3 Core Inputs: Vendor, Product, z/OS Version */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4">
            <label htmlFor="bot-vendor" className="block text-xs font-medium text-slate-700 mb-1.5">
              Vendor
            </label>
            <select
              id="bot-vendor"
              value={selectedVendor}
              onChange={(e) => {
                setSelectedVendor(e.target.value);
                setSelectedProduct('');
              }}
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              <option value="ALL">All Vendors ({vendors.length})</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label htmlFor="bot-product" className="block text-xs font-medium text-slate-700 mb-1.5">
              Product Name, Keyword, or PTF ID
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="bot-product"
                type="text"
                list="product-suggestions"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                placeholder={
                  selectedVendor === 'ALL'
                    ? 'e.g. Abend-Aid, CA 1, LU17113, Db2, Syncsort...'
                    : `Filter ${selectedVendor} products or PTF ID...`
                }
                className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              <datalist id="product-suggestions">
                {productOptions.map((prod) => (
                  <option key={prod} value={prod} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="bot-zos" className="block text-xs font-medium text-slate-700 mb-1.5">
              Target z/OS Version
            </label>
            <select
              id="bot-zos"
              value={selectedZos}
              onChange={(e) => setSelectedZos(e.target.value as ZosVersionKey)}
              className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              {zosVersions.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Natural Language Prompt + Submit */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runBotQuery();
          }}
          className="flex flex-col sm:flex-row gap-3 pt-1"
        >
          <div className="relative flex-1">
            <Bot
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask a question (e.g. What PTFs are unapplied for Broadcom on z/OS 3.2?)..."
              className="w-full h-10 pl-9 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={isAiLoading}
            className="h-10 px-5 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isAiLoading ? 'Synthesizing...' : 'Analyze & List PTFs'}</span>
          </button>
        </form>

        {/* Quick Preset Queries */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-500 mr-1">Quick prompts:</span>
          {PRESET_QUERIES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePreset(preset)}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {/* Bot Assessment Transcript Area */}
      {(chatTurns.length > 0 || isAiLoading || aiNotice) && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">Compatibility &amp; PTF Assessment</h2>
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              {liveMatches.length} matching records · {livePtfs.length} PTFs
            </div>
          </div>

          <div className="p-5 space-y-5">
            {chatTurns.map((turn) =>
              turn.role === 'user' ? (
                <div key={turn.id} className="pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                    <span className="font-semibold text-slate-700">Query</span>
                    {turn.meta && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{turn.meta.vendor === 'ALL' ? 'All Vendors' : turn.meta.vendor}</span>
                        <span aria-hidden="true">·</span>
                        <span>{turn.meta.product}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{turn.meta.zosVersion}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{turn.content}</p>
                </div>
              ) : (
                <div key={turn.id} className="space-y-3 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    {turn.source === 'workbook' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        <span className="text-emerald-800">Exact Workbook Lookup</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                        <span className="text-blue-800">AI Engineering Summary</span>
                      </>
                    )}
                  </div>
                  {turn.recommendedAction && (
                    <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800">
                      <span className="font-semibold text-slate-900">Recommended Action: </span>
                      <span>{turn.recommendedAction}</span>
                    </div>
                  )}
                  <MarkdownRenderer content={turn.content} />
                </div>
              )
            )}

            {isAiLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
                <span>Generating AI engineering summary...</span>
              </div>
            )}

            {aiNotice && (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">AI Summary Unavailable (Exact Workbook Lookup Active)</p>
                  <p className="text-amber-800 mt-0.5">{aiNotice}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Instant Live Compatibility Matrix & PTF Breakdown */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'matrix'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Compatibility Matrix ({liveMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ptfs')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'ptfs'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Matched PTFs ({livePtfs.length})
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyPtfs}
              onChange={(e) => setOnlyPtfs(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>Only show products with PTFs</span>
          </label>
        </div>

        {activeTab === 'matrix' ? (
          liveMatches.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">No matching ISV products found</p>
              <p className="text-xs text-slate-500">
                Try clearing the product keyword filter or switching Vendor to All Vendors.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Show All Products
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4 whitespace-nowrap">Vendor</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Product &amp; VRM</th>
                    <th
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        selectedZos === 'V2R3' ? 'bg-blue-50/70 text-blue-900' : ''
                      }`}
                    >
                      z/OS 2.3
                    </th>
                    <th
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        selectedZos === 'V2R5' ? 'bg-blue-50/70 text-blue-900' : ''
                      }`}
                    >
                      z/OS 2.5
                    </th>
                    <th
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        selectedZos === 'V3R1' ? 'bg-blue-50/70 text-blue-900' : ''
                      }`}
                    >
                      z/OS 3.1
                    </th>
                    <th
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        selectedZos === 'V3R2' ? 'bg-blue-50/70 text-blue-900' : ''
                      }`}
                    >
                      z/OS 3.2
                    </th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Required PTFs</th>
                    <th className="py-2.5 px-4 whitespace-nowrap text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {liveMatches.slice(0, 100).map((rec) => (
                    <tr
                      key={rec.id}
                      onClick={() => onSelectRecord(rec)}
                      className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap max-w-[160px] truncate">
                        {rec.normalizedVendor}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{rec.product}</div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          {rec.version} · #{rec.recordNumber}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap ${
                          selectedZos === 'V2R3' ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <CompatibilityStatusLabel
                          status={rec.matrix.V2R3.status}
                          label={rec.matrix.V2R3.statusText}
                          compact
                        />
                      </td>
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap ${
                          selectedZos === 'V2R5' ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <CompatibilityStatusLabel
                          status={rec.matrix.V2R5.status}
                          label={rec.matrix.V2R5.statusText}
                          compact
                        />
                      </td>
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap ${
                          selectedZos === 'V3R1' ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <CompatibilityStatusLabel
                          status={rec.matrix.V3R1.status}
                          label={rec.matrix.V3R1.statusText}
                          compact
                        />
                      </td>
                      <td
                        className={`py-2.5 px-3 whitespace-nowrap ${
                          selectedZos === 'V3R2' ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <CompatibilityStatusLabel
                          status={rec.matrix.V3R2.status}
                          label={rec.matrix.V3R2.statusText}
                          compact
                        />
                      </td>
                      <td className="py-2.5 px-4 max-w-[240px]">
                        {rec.ptfs.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {rec.ptfs.map((p) => (
                              <div key={p.id} className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                  {p.id}
                                </span>
                                <span className="text-slate-400">·</span>
                                <PtfStatusLabel status={p.status} label={p.statusLabel} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">
                            {rec.ptfRequiredRaw ? rec.ptfRequiredRaw : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                          <span>Inspect</span>
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {liveMatches.length > 100 && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                  Showing first 100 of {liveMatches.length} matching rows. Narrow filters or switch to Compatibility Matrix view to browse all rows.
                </div>
              )}
            </div>
          )
        ) : livePtfs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">No explicit PTF numbers in current selection</p>
            <p className="text-xs text-slate-500">
              Select Broadcom Inc., BMC Software, or clear the product filter to inspect all 43 tracked PTF entries.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 whitespace-nowrap">PTF ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Vendor</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Product &amp; Version</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Target z/OS / Subsystem</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">FIXCAT / Message ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap text-right">Portal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {livePtfs.map((ptf, idx) => (
                  <tr key={`${ptf.id}-${ptf.recordNumber}-${idx}`} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {ptf.id}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <PtfStatusLabel status={ptf.status} label={ptf.statusLabel} />
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{ptf.vendor}</td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium text-slate-900">{ptf.product}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="font-mono text-slate-600 tabular-nums">{ptf.version}</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{ptf.targetZos}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 max-w-[260px] truncate">
                      {ptf.fixcat || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {ptf.reportUrl ? (
                        <a
                          href={ptf.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium"
                        >
                          <span>Verify</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
