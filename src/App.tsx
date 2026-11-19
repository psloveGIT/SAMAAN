import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { AiAssistantDrawer } from './components/AiAssistantDrawer.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { Layout } from './components/Layout.tsx';
import type { NavTabKey } from './components/Layout.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { PackingWizardModal } from './components/PackingWizardModal.tsx';
import { ShortcutsSettingsModal } from './components/ShortcutsSettingsModal.tsx';
import { SpellCheckAssistant } from './components/SpellCheckAssistant.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { apiRequest } from './lib/api.ts';
import type { CategoryStore, TransitEntry } from './shared/types.ts';
import { DEFAULT_TRANSIT_STATUSES } from './shared/normalizers.ts';
import {
  SHORTCUT_DEFINITIONS,
  isEditableTarget,
  matchesShortcutEvent,
} from './shared/shortcuts.ts';

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
  origin: [],
  storageLocation: [],
  carrierContractor: [],
  countingUnit: [],
  packageType: [],
  generalDescription: [],
  stocktakeStatus: [],
  transitStatus: [...DEFAULT_TRANSIT_STATUSES],
  receiver: [],
  merStatus: [],
  repStatus: [],
  balanceStatus: [],
  chemicalType: [],
};

const SamaanWorkspace: React.FC = () => {
  const {
    user,
    loadingAuth,
    toasts,
    dismissToast,
    t,
    prefs,
    activeProjectId,
    shortcuts,
    performUndo,
    performRedo,
    refreshHistoryStatus,
    setTheme,
    setLanguage,
    notify,
  } = useApp();
  const [activeTab, setActiveTab] = useState<NavTabKey>('dashboard');
  const [categories, setCategories] = useState<CategoryStore>(EMPTY_CATEGORIES);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Packing Wizard Modal & Drawers state
  const [packingModalOpen, setPackingModalOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [transitPrefill, setTransitPrefill] = useState<TransitEntry | null>(null);
  const [prefillPackingNo, setPrefillPackingNo] = useState<string>('');

  // Cross-tab navigation filters (General -> Detailed, Dashboard -> Detailed)
  const [detailedShipmentFilter, setDetailedShipmentFilter] = useState('');
  const [detailedPackageFilter, setDetailedPackageFilter] = useState('');
  const [detailedAutoOpenToken, setDetailedAutoOpenToken] = useState(0);

  const bumpRefresh = useCallback(() => {
    setRefreshSignal((s) => s + 1);
  }, []);

  // Automatically refresh active views whenever Undo or Redo is executed
  useEffect(() => {
    const onHistoryApplied = () => {
      bumpRefresh();
    };
    window.addEventListener('samaan:history-applied', onHistoryApplied);
    return () => window.removeEventListener('samaan:history-applied', onHistoryApplied);
  }, [bumpRefresh]);

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
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, reg) {
        reg?.update().catch(() => {});
      },
    });
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const prefetch = () => {
      void import('./components/GeneralView.tsx');
      void import('./components/DetailedView.tsx');
      void import('./components/TransitView.tsx');
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prefetch, 400);
    return () => window.clearTimeout(timer);
  }, [user]);

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

  // Global Excel-style customizable keyboard shortcuts handler
  useEffect(() => {
    if (!user) return;
    const canEditUser = user.role === 'admin' || user.role === 'operator';
    const isFa = prefs.language === 'fa';

    const switchTabClean = (tab: NavTabKey) => {
      if (tab !== 'detailed') {
        setDetailedShipmentFilter('');
        setDetailedPackageFilter('');
      }
      setActiveTab(tab);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const win = window as unknown as { __samaanCapturingShortcut?: boolean };
      if (win.__samaanCapturingShortcut) return;

      // Escape closes top-most open modal/drawer
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        if (shortcutsModalOpen) {
          e.preventDefault();
          setShortcutsModalOpen(false);
          return;
        }
        if (aiDrawerOpen) {
          e.preventDefault();
          setAiDrawerOpen(false);
          return;
        }
        if (packingModalOpen) {
          e.preventDefault();
          setPackingModalOpen(false);
          return;
        }
        return;
      }

      const inEditable = isEditableTarget(e.target);

      for (const def of SHORTCUT_DEFINITIONS) {
        const combo = shortcuts[def.id];
        if (!combo) continue;
        if (!matchesShortcutEvent(e, combo)) continue;

        // Inside text inputs, skip shortcuts that should yield to native text editing (like Ctrl+Z / Ctrl+Y)
        if (inEditable && !def.allowInInputs) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        switch (def.id) {
          case 'undo':
            if (canEditUser) void performUndo();
            return;
          case 'redo':
            if (canEditUser) void performRedo();
            return;
          case 'save': {
            const ev = new CustomEvent('samaan:shortcut-action', {
              cancelable: true,
              detail: { action: 'save' },
            });
            const notHandled = window.dispatchEvent(ev);
            if (notHandled) {
              // Auto-submit the topmost visible modal form if present
              const forms = Array.from(document.querySelectorAll('form'));
              const topForm = forms[forms.length - 1];
              if (topForm && typeof topForm.requestSubmit === 'function') {
                topForm.requestSubmit();
              }
            }
            return;
          }
          case 'find': {
            const ev = new CustomEvent('samaan:shortcut-action', {
              cancelable: true,
              detail: { action: 'find' },
            });
            const notHandled = window.dispatchEvent(ev);
            if (notHandled) {
              const mainEl = document.querySelector('main');
              const searchInput = mainEl?.querySelector<HTMLInputElement>(
                'input[data-samaan-search="true"], input[type="search"], input[placeholder*="جست"], input[placeholder*="Search"], input[placeholder*="search"]',
              );
              if (searchInput) {
                searchInput.focus();
                searchInput.select();
              } else {
                switchTabClean('search');
              }
            }
            return;
          }
          case 'newPacking':
            if (canEditUser) openNewPacking('');
            return;
          case 'exportExcel': {
            const ev = new CustomEvent('samaan:shortcut-action', {
              cancelable: true,
              detail: { action: 'exportExcel' },
            });
            const notHandled = window.dispatchEvent(ev);
            if (notHandled) {
              notify(
                'info',
                isFa
                  ? 'خروجی اکسل در این صفحه فعال نیست یا از دکمه خروجی بالای جدول استفاده کنید.'
                  : 'Excel export shortcut is available on data table views.',
              );
            }
            return;
          }
          case 'print': {
            const ev = new CustomEvent('samaan:shortcut-action', {
              cancelable: true,
              detail: { action: 'print' },
            });
            const notHandled = window.dispatchEvent(ev);
            if (notHandled) {
              window.print();
            }
            return;
          }
          case 'clearFilters': {
            window.dispatchEvent(
              new CustomEvent('samaan:shortcut-action', {
                cancelable: true,
                detail: { action: 'clearFilters' },
              }),
            );
            return;
          }
          case 'refreshData':
            bumpRefresh();
            void refreshHistoryStatus();
            notify('info', isFa ? 'اطلاعات بروزرسانی شد.' : 'Data refreshed.');
            return;
          case 'aiAssistant':
            setAiDrawerOpen((v) => !v);
            return;
          case 'shortcutsSettings':
            setShortcutsModalOpen((v) => !v);
            return;
          case 'navDashboard':
            switchTabClean('dashboard');
            return;
          case 'navGeneral':
            switchTabClean('general');
            return;
          case 'navDetailed':
            switchTabClean('detailed');
            return;
          case 'navTransit':
            switchTabClean('transit');
            return;
          case 'navGlobalSearch':
            switchTabClean('search');
            return;
          case 'navCategories':
            switchTabClean('categories');
            return;
          case 'navTrash':
            switchTabClean('trash');
            return;
          case 'toggleTheme':
            setTheme(prefs.theme === 'light' ? 'dark' : 'light');
            return;
          case 'toggleLanguage':
            setLanguage(prefs.language === 'fa' ? 'en' : 'fa');
            return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    user,
    shortcuts,
    prefs.language,
    prefs.theme,
    shortcutsModalOpen,
    aiDrawerOpen,
    packingModalOpen,
    performUndo,
    performRedo,
    bumpRefresh,
    refreshHistoryStatus,
    setTheme,
    setLanguage,
    notify,
  ]);

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
          onOpenAiAssistant={() => setAiDrawerOpen(true)}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
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
          <AiAssistantDrawer open={aiDrawerOpen} onClose={() => setAiDrawerOpen(false)} />
          <ShortcutsSettingsModal
            open={shortcutsModalOpen}
            onClose={() => setShortcutsModalOpen(false)}
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
      <SpellCheckAssistant />
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
