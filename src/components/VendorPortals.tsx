import { ExternalLink } from 'lucide-react';
import type { VendorPortal } from '../types/compatibility';

interface VendorPortalsProps {
  portals: VendorPortal[];
  onFilterByVendor: (vendor: string) => void;
}

export function VendorPortals({ portals, onFilterByVendor }: VendorPortalsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-lg font-semibold text-slate-900">ISV Vendor Compatibility Portals</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Official compatibility verification links from Sheet1 combined with product &amp; PTF coverage across the workbook.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4 whitespace-nowrap">Vendor</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Products</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">R3.2 Compatible</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">PTFs Tracked</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Public Access</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Notes / Portal Link</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Matrix</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {portals.map((portal) => (
                <tr key={portal.normalizedVendor} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                    {portal.normalizedVendor}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {portal.productCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                    {portal.compatibleCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {portal.ptfCount}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {portal.availableWithoutLogin}
                  </td>
                  <td className="py-3 px-4">
                    {portal.reportUrl ? (
                      <a
                        href={portal.reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-700 hover:underline font-medium max-w-[320px] truncate"
                      >
                        <span className="truncate">{portal.reportUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="text-slate-500">{portal.notes}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onFilterByVendor(portal.normalizedVendor)}
                      className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                    >
                      View Products
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
