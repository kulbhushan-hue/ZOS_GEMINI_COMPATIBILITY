import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import type { PtfEntry, PtfInstallStatus } from '../types/compatibility';
import { PtfStatusLabel } from './StatusCell';

interface PtfRegisterProps {
  ptfs: PtfEntry[];
  vendors: string[];
  onFilteredChange: (ptfs: PtfEntry[]) => void;
}

export function PtfRegister({ ptfs, vendors, onFilteredChange }: PtfRegisterProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  const counts = useMemo(() => {
    return {
      total: ptfs.length,
      applied: ptfs.filter((p) => p.status === 'applied').length,
      notApplied: ptfs.filter((p) => p.status === 'not_applied').length,
      available: ptfs.filter((p) => p.status === 'available').length,
      superseded: ptfs.filter((p) => p.status === 'superseded').length,
      notAvailable: ptfs.filter((p) => p.status === 'not_available').length,
    };
  }, [ptfs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ptfs.filter((p) => {
      if (vendorFilter !== 'ALL' && p.vendor !== vendorFilter) return false;
      if (statusFilter !== 'ALL' && p.status !== (statusFilter as PtfInstallStatus)) return false;
      if (q) {
        const hay = `${p.id} ${p.vendor} ${p.product} ${p.targetZos} ${p.fixcat || ''} ${p.fmid || ''} ${p.contextNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ptfs, search, statusFilter, vendorFilter]);

  useEffect(() => {
    onFilteredChange(filtered);
  }, [filtered, onFilteredChange]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">SMP/E PTF Register</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Extracted Program Temporary Fixes across Broadcom, BMC, and Compuware z/OS compatibility records.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono tabular-nums">
            <span>Total: <strong className="text-slate-900">{counts.total}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Applied: <strong className="text-emerald-700">{counts.applied}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Not Applied: <strong className="text-red-700">{counts.notApplied}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Superseded: <strong className="text-slate-700">{counts.superseded}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PTF ID (e.g. LU17113, BQQ5939, AAF963Y), product, or FIXCAT..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-4">
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

          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All PTF Statuses</option>
              <option value="not_applied">Not Applied (Action Needed)</option>
              <option value="applied">Applied / Installed</option>
              <option value="available">Available</option>
              <option value="superseded">Superseded</option>
              <option value="not_available">Not Available</option>
              <option value="required">Required</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No PTFs match the active filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4 whitespace-nowrap">PTF ID</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Vendor</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Product &amp; VRM</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Target z/OS / Subsystem</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">FMID / FIXCAT</th>
                  <th className="py-2.5 px-4 whitespace-nowrap text-right">Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((ptf, idx) => (
                  <tr key={`${ptf.id}-${ptf.recordNumber}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {ptf.id}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <PtfStatusLabel status={ptf.status} label={ptf.statusLabel} />
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{ptf.vendor}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{ptf.product}</div>
                      <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {ptf.version} · Record #{ptf.recordNumber}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{ptf.targetZos}</td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 max-w-[260px] truncate">
                      {ptf.fmid ? `FMID ${ptf.fmid}` : ptf.fixcat || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {ptf.reportUrl ? (
                        <a
                          href={ptf.reportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-700 hover:underline font-medium"
                        >
                          <span>Portal</span>
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
      </div>
    </div>
  );
}
