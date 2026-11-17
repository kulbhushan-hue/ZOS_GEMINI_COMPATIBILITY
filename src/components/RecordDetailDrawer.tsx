import { Bot, ExternalLink, X } from 'lucide-react';
import type { CompatibilityRecord, ZosVersionKey } from '../types/compatibility';
import { CompatibilityStatusLabel, PtfStatusLabel } from './StatusCell';

interface RecordDetailDrawerProps {
  record: CompatibilityRecord | null;
  onClose: () => void;
  onAskBot: (record: CompatibilityRecord) => void;
}

const MATRIX_ORDER: ZosVersionKey[] = ['V3R2', 'V3R1', 'V2R5', 'V2R4', 'V2R3'];

export function RecordDetailDrawer({ record, onClose, onAskBot }: RecordDetailDrawerProps) {
  if (!record) return null;

  const verifyUrl = record.reportUrl || record.portalFallbackUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Compatibility details for ${record.product}`}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-10 w-full max-w-xl bg-white border-l border-slate-200 h-full overflow-y-auto flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 bg-white sticky top-0 z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{record.normalizedVendor}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Record #{record.recordNumber}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{record.version}</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mt-1 truncate">{record.product}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Close detail drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Multi-z/OS Version Matrix */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">z/OS Compatibility Matrix</h3>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
              {MATRIX_ORDER.map((vKey) => {
                const cell = record.matrix[vKey];
                return (
                  <div key={vKey} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-slate-800 w-16 tabular-nums">
                        {cell.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {cell.verifiedInWorkbook ? 'Workbook verified' : 'Check vendor portal'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {cell.ptfs.length > 0 && (
                        <span className="font-mono text-xs text-slate-700 tabular-nums">
                          {cell.ptfs.join(', ')}
                        </span>
                      )}
                      <CompatibilityStatusLabel status={cell.status} label={cell.statusText} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* PTF Register for this Product */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Required & Referenced PTFs</h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {record.ptfs.length} {record.ptfs.length === 1 ? 'PTF' : 'PTFs'}
              </span>
            </div>

            {record.ptfs.length > 0 ? (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                {record.ptfs.map((ptf) => (
                  <div key={`${ptf.id}-${ptf.recordNumber}`} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {ptf.id}
                        </span>
                        <span className="text-xs text-slate-500">·</span>
                        <span className="text-xs text-slate-600">{ptf.targetZos}</span>
                      </div>
                      <PtfStatusLabel status={ptf.status} label={ptf.statusLabel} />
                    </div>
                    {ptf.fmid && (
                      <div className="text-xs text-slate-500 font-mono tabular-nums">FMID: {ptf.fmid}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600">
                {record.ptfRequiredRaw || 'No specific PTF numbers listed in workbook for this release.'}
              </div>
            )}
          </section>

          {/* Technical Identifiers & Comments */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Workbook Metadata & Notes</h3>
            <dl className="border border-slate-200 rounded-lg divide-y divide-slate-200 text-sm">
              <div className="px-4 py-2.5 grid grid-cols-3 gap-3">
                <dt className="text-xs font-medium text-slate-500">FIXCAT / Message ID</dt>
                <dd className="col-span-2 font-mono text-xs text-slate-800 break-all">
                  {record.messageId || '—'}
                </dd>
              </div>
              <div className="px-4 py-2.5 grid grid-cols-3 gap-3">
                <dt className="text-xs font-medium text-slate-500">FMIDs</dt>
                <dd className="col-span-2 font-mono text-xs text-slate-800">
                  {record.fmids.length > 0 ? record.fmids.join(', ') : '—'}
                </dd>
              </div>
              <div className="px-4 py-2.5 grid grid-cols-3 gap-3">
                <dt className="text-xs font-medium text-slate-500">No-Login / MFA</dt>
                <dd className="col-span-2 text-xs text-slate-700">
                  Public: {record.availableWithoutLogin || '—'} · MFA: {record.mfaRequired || '—'}
                </dd>
              </div>
              <div className="px-4 py-2.5 grid grid-cols-3 gap-3">
                <dt className="text-xs font-medium text-slate-500">Raw PTF Field</dt>
                <dd className="col-span-2 text-xs text-slate-700 whitespace-pre-line">
                  {record.ptfRequiredRaw || '—'}
                </dd>
              </div>
              <div className="px-4 py-2.5 grid grid-cols-3 gap-3">
                <dt className="text-xs font-medium text-slate-500">Comments</dt>
                <dd className="col-span-2 text-xs text-slate-700 whitespace-pre-line">
                  {record.comments || '—'}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 sticky bottom-0">
          {verifyUrl ? (
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
            >
              <span>Open Vendor Portal</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : (
            <span className="text-xs text-slate-400">No direct portal link</span>
          )}

          <button
            type="button"
            onClick={() => {
              onAskBot(record);
              onClose();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Analyze in Bot</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
