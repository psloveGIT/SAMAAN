import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AuthGate } from './components/AuthGate.tsx';
import { BackupView } from './components/BackupView.tsx';
import { BalanceView } from './components/BalanceView.tsx';
import { CategoryManagerView } from './components/CategoryManagerView.tsx';
import { CsvImportView } from './components/CsvImportView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DetailedView } from './components/DetailedView.tsx';
import { GcvView } from './components/GcvView.tsx';
import { GeneralView } from './components/GeneralView.tsx';
import { GlobalSearchView } from './components/GlobalSearchView.tsx';
import { Layout } from './components/Layout.tsx';
import type { NavTabKey } from './components/Layout.tsx';
import { MaterialEstimationView } from './components/MaterialEstimationView.tsx';
import { MivView } from './components/MivView.tsx';
import { OpiMinutesView } from './components/OpiMinutesView.tsx';
import { OpiView } from './components/OpiView.tsx';
import { PackingWizardModal } from './components/PackingWizardModal.tsx';
import { SiteEntryMinutesView } from './components/SiteEntryMinutesView.tsx';
import { SmrView } from './components/SmrView.tsx';
import { StocktakeView } from './components/StocktakeView.tsx';
import { StorageLabelView } from './components/StorageLabelView.tsx';
import { SubstitutionView } from './components/SubstitutionView.tsx';
import { TransitView } from './components/TransitView.tsx';
import { TrashView } from './components/TrashView.tsx';
import { UsersAuditView } from './components/UsersAuditView.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { apiRequest } from './lib/api.ts';
import type { CategoryStore, TransitEntry } from './shared/types.ts';

const EMPTY_CATEGORIES: CategoryStore = {
  island: [],
  system: [],
  subSystem: [],
  unit: [],
  supplier: [],
  dispatchLocation: [],
  storageLocation: [],
  carrierContractor: [],
};

const SamaanWorkspace: React.FC = () => {
  const { user, loadingAuth, toasts, dismissToast, t } = useApp();
  const [activeTab, setActiveTab] = useState<NavTabKey>('dashboard');
  const [categories, setCategories] = useState<CategoryStore>(EMPTY_CATEGORIES);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Packing Wizard Modal state
  const [packingModalOpen, setPackingModalOpen] = useState(false);
  const [transitPrefill, setTransitPrefill] = useState<TransitEntry | null>(null);
  const [prefillPackingNo, setPrefillPackingNo] = useState<string>('');

  // Cross-tab navigation filters (General -> Detailed, Dashboard -> Detailed)
  const [detailedShipmentFilter, setDetailedShipmentFilter] = useState('');
  const [detailedPackageFilter, setDetailedPackageFilter] = useState('');
  const [detailedAutoOpenToken, setDetailedAutoOpenToken] = useState(0);

  const bumpRefresh = useCallback(() => {
    setRefreshSignal((s) => s + 1);
  }, []);

  const loadCategories = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ categories: CategoryStore }>('/api/categories');
      setCategories(res.categories);
    } catch {
      // Ignore
    }
  }, [user]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, refreshSignal]);

  const openNewPacking = (packingNo = '') => {
    setTransitPrefill(null);
    setPrefillPackingNo(packingNo);
    setPackingModalOpen(true);
  };

  const openFromTransit = (entry: TransitEntry) => {
    setTransitPrefill(entry);
    setPrefillPackingNo('');
    setPackingModalOpen(true);
  };

  const jumpToDetailed = (shipmentNo: string, packageNo = '') => {
    setDetailedShipmentFilter(shipmentNo);
    setDetailedPackageFilter(packageNo);
    setActiveTab('detailed');
  };

  const goToDetailedCreate = (packingNo: string, packageNo = '') => {
    setDetailedShipmentFilter(packingNo);
    setDetailedPackageFilter(packageNo);
    setDetailedAutoOpenToken((n) => n + 1);
    setPackingModalOpen(false);
    setActiveTab('detailed');
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-muted)]">
        {t.controls.loading}
      </div>
    );
  }

  return (
    <>
      {!user ? (
        <AuthGate />
      ) : (
        <Layout
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab !== 'detailed') {
              setDetailedShipmentFilter('');
              setDetailedPackageFilter('');
            }
            setActiveTab(tab);
          }}
          onOpenNewPacking={() => openNewPacking('')}
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              refreshSignal={refreshSignal}
              onNavigate={setActiveTab}
              onOpenNewPacking={() => openNewPacking('')}
              onInspectDetailedShipment={(pk) => jumpToDetailed(pk)}
            />
          )}

          {activeTab === 'siteEntry' && (
            <SiteEntryMinutesView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'general' && (
            <GeneralView
              categories={categories}
              refreshSignal={refreshSignal}
              onDataChanged={bumpRefresh}
              onOpenNewPacking={openNewPacking}
              onOpenLinkedDetailed={jumpToDetailed}
            />
          )}

          {activeTab === 'detailed' && (
            <DetailedView
              categories={categories}
              refreshSignal={refreshSignal}
              initialShipmentFilter={detailedShipmentFilter}
              initialPackageFilter={detailedPackageFilter}
              autoOpenToken={detailedAutoOpenToken}
              onConsumeAutoOpen={() => setDetailedAutoOpenToken(0)}
              onDataChanged={bumpRefresh}
            />
          )}

          {activeTab === 'transit' && (
            <TransitView
              categories={categories}
              refreshSignal={refreshSignal}
              onDataChanged={bumpRefresh}
              onConvertToGeneral={openFromTransit}
            />
          )}

          {activeTab === 'opi' && (
            <OpiView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'opiMinutes' && (
            <OpiMinutesView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'gcv' && (
            <GcvView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'miv' && (
            <MivView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'smr' && (
            <SmrView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'substitution' && (
            <SubstitutionView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'materialEstimation' && (
            <MaterialEstimationView
              categories={categories}
              refreshSignal={refreshSignal}
              onDataChanged={bumpRefresh}
            />
          )}

          {activeTab === 'balance' && (
            <BalanceView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'stocktake' && (
            <StocktakeView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'storageLabel' && (
            <StorageLabelView refreshSignal={refreshSignal} />
          )}

          {activeTab === 'search' && (
            <GlobalSearchView onJumpToDetailed={jumpToDetailed} />
          )}

          {activeTab === 'categories' && (
            <CategoryManagerView
              refreshSignal={refreshSignal}
              onCategoriesUpdated={bumpRefresh}
            />
          )}

          {activeTab === 'trash' && (
            <TrashView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
          )}

          {activeTab === 'importCsv' && <CsvImportView onImportDone={bumpRefresh} />}

          {activeTab === 'usersAudit' && <UsersAuditView />}

          {activeTab === 'backup' && <BackupView onRestored={bumpRefresh} />}

          <PackingWizardModal
            open={packingModalOpen}
            onClose={() => setPackingModalOpen(false)}
            onSaved={bumpRefresh}
            onGoToDetailed={goToDetailedCreate}
            categories={categories}
            prefillFromTransit={transitPrefill}
            prefillPackingNo={prefillPackingNo}
          />
        </Layout>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 end-4 z-[60] space-y-2 max-w-sm print:hidden">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-xl border shadow-lg text-xs font-medium flex items-center justify-between gap-3 bg-[var(--bg-elevated)] ${
                toast.type === 'error'
                  ? 'border-[var(--status-danger)] text-[var(--status-danger)]'
                  : toast.type === 'warning'
                    ? 'border-[var(--status-warning)] text-[var(--status-warning)]'
                    : 'border-[var(--accent-primary)] text-[var(--text-primary)]'
              }`}
            >
              <span className="bidi-plaintext">{toast.text}</span>
              <button type="button" onClick={() => dismissToast(toast.id)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <SamaanWorkspace />
    </AppProvider>
  );
}
