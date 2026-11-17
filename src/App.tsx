import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Download,
  Globe,
  Layers,
  ListChecks,
  Menu,
  X,
} from 'lucide-react';
import { BotWorkspace } from './components/BotWorkspace';
import { MatrixExplorer } from './components/MatrixExplorer';
import { PtfRegister } from './components/PtfRegister';
import { RecordDetailDrawer } from './components/RecordDetailDrawer';
import { VendorPortals } from './components/VendorPortals';
import type {
  CatalogSummary,
  CompatibilityRecord,
  PtfEntry,
  VendorPortal,
  ZosVersionKey,
} from './types/compatibility';
import { exportMatrixCsv, exportPtfsCsv } from './utils/exportCsv';

type NavView = 'bot' | 'matrix' | 'ptfs' | 'portals';

interface CatalogPayload {
  summary: CatalogSummary;
  records: CompatibilityRecord[];
  ptfs: PtfEntry[];
  portals: VendorPortal[];
}

const NAV_ITEMS: Array<{ id: NavView; label: string; icon: typeof Bot }> = [
  { id: 'bot', label: 'Bot & Query', icon: Bot },
  { id: 'matrix', label: 'Compatibility Matrix', icon: Layers },
  { id: 'ptfs', label: 'PTF Register', icon: ListChecks },
  { id: 'portals', label: 'Vendor Portals', icon: Globe },
];

export default function App() {
  const [activeView, setActiveView] = useState<NavView>('bot');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Shared Bot query state so "View Products" or "Analyze in Bot" routes seamlessly
  const [botVendor, setBotVendor] = useState('ALL');
  const [botProduct, setBotProduct] = useState('');
  const [botZos, setBotZos] = useState<ZosVersionKey>('V3R2');

  const [selectedRecord, setSelectedRecord] = useState<CompatibilityRecord | null>(null);
  const [exportableRecords, setExportableRecords] = useState<CompatibilityRecord[]>([]);
  const [exportablePtfs, setExportablePtfs] = useState<PtfEntry[]>([]);

  const fetchCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/catalog');
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = (await res.json()) as CatalogPayload;
      setCatalog(data);
      setExportableRecords(data.records);
      setExportablePtfs(data.ptfs);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load compatibility catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  function handleExport() {
    if (!catalog) return;
    if (activeView === 'ptfs') {
      exportPtfsCsv(exportablePtfs);
    } else {
      exportMatrixCsv(exportableRecords.length > 0 ? exportableRecords : catalog.records);
    }
  }

  function handleAskBotFromRecord(rec: CompatibilityRecord) {
    setBotVendor(rec.normalizedVendor);
    setBotProduct(rec.product);
    setBotZos('V3R2');
    setActiveView('bot');
  }

  function handlePortalFilter(vendor: string) {
    setBotVendor(vendor);
    setBotProduct('');
    setActiveView('bot');
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="h-14 px-5 border-b border-slate-200 flex items-center">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            zCompat Matrix
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {catalog && (
          <div className="p-4 border-t border-slate-200 space-y-2.5 text-xs">
            <div className="text-slate-500 font-medium">Workbook Coverage</div>
            <div className="space-y-1.5 font-mono tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Products</span>
                <span className="font-semibold text-slate-900">{catalog.summary.totalRecords}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>R3.2 Compatible</span>
                <span className="font-semibold text-emerald-700">
                  {catalog.summary.compatibleCount + catalog.summary.ptfRequiredCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>PTF Entries</span>
                <span className="font-semibold text-amber-700">{catalog.ptfs.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Vendors</span>
                <span className="font-semibold text-slate-900">{catalog.summary.totalUniqueVendors}</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 bg-white border-r border-slate-200 h-full flex flex-col">
            <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                zCompat Matrix
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">ISV Compatibility</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeNavMeta.label}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={!catalog}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{activeView === 'ptfs' ? 'Export PTF CSV' : 'Export Matrix CSV'}</span>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1280px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-40 bg-white border border-slate-200 rounded-xl" />
              <div className="h-80 bg-white border border-slate-200 rounded-xl" />
            </div>
          ) : loadError || !catalog ? (
            <div className="bg-white border border-red-200 rounded-xl p-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-900">Failed to Load Compatibility Dataset</h2>
                <p className="text-xs text-slate-600">{loadError || 'Unknown error occurred.'}</p>
                <button
                  type="button"
                  onClick={() => void fetchCatalog()}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeView === 'bot' && (
                <BotWorkspace
                  records={catalog.records}
                  vendors={catalog.summary.vendors}
                  zosVersions={catalog.summary.zosVersions}
                  selectedVendor={botVendor}
                  setSelectedVendor={setBotVendor}
                  selectedProduct={botProduct}
                  setSelectedProduct={setBotProduct}
                  selectedZos={botZos}
                  setSelectedZos={setBotZos}
                  onSelectRecord={setSelectedRecord}
                  onFilteredRecordsChange={setExportableRecords}
                />
              )}

              {activeView === 'matrix' && (
                <MatrixExplorer
                  records={catalog.records}
                  vendors={catalog.summary.vendors}
                  zosVersions={catalog.summary.zosVersions}
                  onSelectRecord={setSelectedRecord}
                  onFilteredChange={setExportableRecords}
                />
              )}

              {activeView === 'ptfs' && (
                <PtfRegister
                  ptfs={catalog.ptfs}
                  vendors={catalog.summary.vendors}
                  onFilteredChange={setExportablePtfs}
                />
              )}

              {activeView === 'portals' && (
                <VendorPortals portals={catalog.portals} onFilterByVendor={handlePortalFilter} />
              )}
            </>
          )}
        </main>
      </div>

      <RecordDetailDrawer
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onAskBot={handleAskBotFromRecord}
      />
    </div>
  );
}
