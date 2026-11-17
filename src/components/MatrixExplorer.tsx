import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { CompatibilityRecord, CompatibilityStatus, ZosVersionKey } from '../types/compatibility';
import { CompatibilityStatusLabel, PtfStatusLabel } from './StatusCell';

interface MatrixExplorerProps {
  records: CompatibilityRecord[];
  vendors: string[];
  zosVersions: Array<{ key: ZosVersionKey; label: string; shortLabel: string }>;
  onSelectRecord: (rec: CompatibilityRecord) => void;
  onFilteredChange: (recs: CompatibilityRecord[]) => void;
}

export function MatrixExplorer({
  records,
  vendors,
  zosVersions,
  onSelectRecord,
  onFilteredChange,
}: MatrixExplorerProps) {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [targetZos, setTargetZos] = useState<ZosVersionKey>('V3R2');
  const [onlyWithPtfs, setOnlyWithPtfs] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (vendorFilter !== 'ALL' && r.normalizedVendor !== vendorFilter) return false;
      if (onlyWithPtfs && r.ptfs.length === 0) return false;
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'compatible_any') {
          if (r.status !== 'compatible' && r.status !== 'compatible_ptf') return false;
        } else if (statusFilter === 'incompatible_any') {
          if (r.status !== 'incompatible' && r.status !== 'upgrade_available') return false;
        } else if (r.status !== (statusFilter as CompatibilityStatus)) {
          return false;
        }
      }
      if (q) {
        const hay = `${r.normalizedVendor} ${r.product} ${r.version} ${r.ptfRequiredRaw} ${r.messageId} ${r.comments}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, vendorFilter, statusFilter, onlyWithPtfs]);

  useEffect(() => {
    onFilteredChange(filtered);
  }, [filtered, onFilteredChange]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Full z/OS Compatibility Matrix</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete assessment grid across {records.length} ISV product entries and 5 z/OS releases.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-600 tabular-nums">
            Showing {filtered.length} of {records.length} records
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, PTF ID, FIXCAT, or comment..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Vendors</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="compatible_any">Compatible (All)</option>
              <option value="compatible_ptf">PTF Required</option>
              <option value="incompatible_any">Incompatible / Upgrade</option>
              <option value="no_info">No Info</option>
              <option value="unassessed">Unassessed</option>
            </select>
          </div>

          <div className="md:col-span-3 flex items-center justify-between gap-2">
            <select
              value={targetZos}
              onChange={(e) => setTargetZos(e.target.value as ZosVersionKey)}
              className="flex-1 h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {zosVersions.map((z) => (
                <option key={z.key} value={z.key}>
                  Focus: {z.shortLabel}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={onlyWithPtfs}
                onChange={(e) => setOnlyWithPtfs(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span>PTFs Only</span>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No compatibility records match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 whitespace-nowrap">#</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Vendor</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Product</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">VRM</th>
                  <th className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V2R3' ? 'bg-blue-50/80 text-blue-900' : ''}`}>z/OS 2.3</th>
                  <th className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V2R5' ? 'bg-blue-50/80 text-blue-900' : ''}`}>z/OS 2.5</th>
                  <th className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V3R1' ? 'bg-blue-50/80 text-blue-900' : ''}`}>z/OS 3.1</th>
                  <th className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V3R2' ? 'bg-blue-50/80 text-blue-900' : ''}`}>z/OS 3.2</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">PTFs</th>
                  <th className="py-2.5 px-4 whitespace-nowrap text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((rec) => (
                  <tr
                    key={rec.id}
                    onClick={() => onSelectRecord(rec)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                      {rec.recordNumber}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap max-w-[160px] truncate">
                      {rec.normalizedVendor}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900 max-w-[240px] truncate">
                      {rec.product}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {rec.version}
                    </td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V2R3' ? 'bg-blue-50/40' : ''}`}>
                      <CompatibilityStatusLabel status={rec.matrix.V2R3.status} label={rec.matrix.V2R3.statusText} compact />
                    </td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V2R5' ? 'bg-blue-50/40' : ''}`}>
                      <CompatibilityStatusLabel status={rec.matrix.V2R5.status} label={rec.matrix.V2R5.statusText} compact />
                    </td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V3R1' ? 'bg-blue-50/40' : ''}`}>
                      <CompatibilityStatusLabel status={rec.matrix.V3R1.status} label={rec.matrix.V3R1.statusText} compact />
                    </td>
                    <td className={`py-2.5 px-3 whitespace-nowrap ${targetZos === 'V3R2' ? 'bg-blue-50/40' : ''}`}>
                      <CompatibilityStatusLabel status={rec.matrix.V3R2.status} label={rec.matrix.V3R2.statusText} compact />
                    </td>
                    <td className="py-2.5 px-4">
                      {rec.ptfs.length > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {rec.ptfs.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1">
                              <span className="font-mono font-semibold text-slate-800 tabular-nums">{p.id}</span>
                              <PtfStatusLabel status={p.status} label={p.statusLabel} />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
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
          </div>
        )}
      </div>
    </div>
  );
}
