import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { AuthGate } from './components/AuthGate.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { Layout } from './components/Layout.tsx';
import type { NavTabKey } from './components/Layout.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { PackingWizardModal } from './components/PackingWizardModal.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { apiRequest } from './lib/api.ts';
import type { CategoryStore, TransitEntry } from './shared/types.ts';

const BackupView = lazy(() => import('./components/BackupView.tsx').then((m) => ({ default: m.BackupView })));
const BalanceView = lazy(() => import('./components/BalanceView.tsx').then((m) => ({ default: m.BalanceView })));
const CategoryManagerView = lazy(() => import('./components/CategoryManagerView.tsx').then((m) => ({ default: m.CategoryManagerView })));
const CustomFormsRunnerView = lazy(() => import('./components/CustomFormsRunnerView.tsx').then((m) => ({ default: m.CustomFormsRunnerView })));
const DatabasePurgeView = lazy(() => import('./components/DatabasePurgeView.tsx').then((m) => ({ default: m.DatabasePurgeView })));
const DetailedView = lazy(() => import('./components/DetailedView.tsx').then((m) => ({ default: m.DetailedView })));
const EmployersStudioView = lazy(() => import('./components/EmployersStudioView.tsx').then((m) => ({ default: m.EmployersStudioView })));
const GcvView = lazy(() => import('./components/GcvView.tsx').then((m) => ({ default: m.GcvView })));
const GeneralView = lazy(() => import('./components/GeneralView.tsx').then((m) => ({ default: m.GeneralView })));
const GlobalSearchView = lazy(() => import('./components/GlobalSearchView.tsx').then((m) => ({ default: m.GlobalSearchView })));
const MaterialEstimationView = lazy(() => import('./components/MaterialEstimationView.tsx').then((m) => ({ default: m.MaterialEstimationView })));
const MivView = lazy(() => import('./components/MivView.tsx').then((m) => ({ default: m.MivView })));
const OpiMinutesView = lazy(() => import('./components/OpiMinutesView.tsx').then((m) => ({ default: m.OpiMinutesView })));
const OpiView = lazy(() => import('./components/OpiView.tsx').then((m) => ({ default: m.OpiView })));
const SiteEntryMinutesView = lazy(() => import('./components/SiteEntryMinutesView.tsx').then((m) => ({ default: m.SiteEntryMinutesView })));
const SmrView = lazy(() => import('./components/SmrView.tsx').then((m) => ({ default: m.SmrView })));
const StocktakeView = lazy(() => import('./components/StocktakeView.tsx').then((m) => ({ default: m.StocktakeView })));
const StorageLabelView = lazy(() => import('./components/StorageLabelView.tsx').then((m) => ({ default: m.StorageLabelView })));
const SubstitutionView = lazy(() => import('./components/SubstitutionView.tsx').then((m) => ({ default: m.SubstitutionView })));
const TransitView = lazy(() => import('./components/TransitView.tsx').then((m) => ({ default: m.TransitView })));
const TrashView = lazy(() => import('./components/TrashView.tsx').then((m) => ({ default: m.TrashView })));
const UsersAuditView = lazy(() => import('./components/UsersAuditView.tsx').then((m) => ({ default: m.UsersAuditView })));

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
  const { user, loadingAuth, toasts, dismissToast, t, activeProjectId } = useApp();
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
  }, [loadCategories, refreshSignal, activeProjectId]);

  useEffect(() => {
    if (user && user.role !== 'admin' && activeTab === 'databasePurge') {
      setActiveTab('dashboard');
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      registerSW({ immediate: true });
    }
  }, []);

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
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-muted)]">
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
          key={activeProjectId}
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
          <Suspense
            fallback={
              <div className="py-16 text-center text-xs text-[var(--text-muted)]">
                {t.controls.loading}
              </div>
            }
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

          {activeTab === 'customForms' && (
            <CustomFormsRunnerView
              refreshSignal={refreshSignal}
              onDataChanged={bumpRefresh}
              onOpenEmployerStudio={() => setActiveTab('employers')}
            />
          )}

          {activeTab === 'employers' && <EmployersStudioView />}

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

          {activeTab === 'usersAudit' && <UsersAuditView />}

          {activeTab === 'backup' && <BackupView onRestored={bumpRefresh} />}

          {activeTab === 'databasePurge' && (
            <DatabasePurgeView refreshSignal={refreshSignal} onPurged={bumpRefresh} />
          )}
          </Suspense>

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
      <OfflineIndicator />
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
