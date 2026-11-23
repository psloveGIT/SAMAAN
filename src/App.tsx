import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { AiAssistantDrawer } from './components/AiAssistantDrawer.tsx';
import { AppUpdateManager } from './components/AppUpdateManager.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { BackupView } from './components/BackupView.tsx';
import { BalanceView } from './components/BalanceView.tsx';
import { CategoryManagerView } from './components/CategoryManagerView.tsx';
import { CustomFormsRunnerView } from './components/CustomFormsRunnerView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { DatabasePurgeView } from './components/DatabasePurgeView.tsx';
import { DetailedView } from './components/DetailedView.tsx';
import { EmployersStudioView } from './components/EmployersStudioView.tsx';
import { GcvView } from './components/GcvView.tsx';
import { GeneralView } from './components/GeneralView.tsx';
import { GlobalSearchView } from './components/GlobalSearchView.tsx';
import { Layout } from './components/Layout.tsx';
import type { NavTabKey } from './components/Layout.tsx';
import { MaterialEstimationView } from './components/MaterialEstimationView.tsx';
import { MivView } from './components/MivView.tsx';
import { OperationalFormGate } from './components/OperationalFormGate.tsx';
import { OpiMinutesView } from './components/OpiMinutesView.tsx';
import { OpiView } from './components/OpiView.tsx';
import { PackingWizardModal } from './components/PackingWizardModal.tsx';
import { ShortcutsSettingsModal } from './components/ShortcutsSettingsModal.tsx';
import { SiteEntryMinutesView } from './components/SiteEntryMinutesView.tsx';
import { SmrView } from './components/SmrView.tsx';
import { SpellCheckAssistant } from './components/SpellCheckAssistant.tsx';
import { StocktakeView } from './components/StocktakeView.tsx';
import { StorageLabelView } from './components/StorageLabelView.tsx';
import { SubstitutionView } from './components/SubstitutionView.tsx';
import { TransitView } from './components/TransitView.tsx';
import { TrashView } from './components/TrashView.tsx';
import { UploadedSectionWorkspace } from './components/UploadedSectionWorkspace.tsx';
import { UsersAuditView } from './components/UsersAuditView.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { apiRequest } from './lib/api.ts';
import {
  resolveOperationalSectionAccess,
  type OperationalFormSectionKey,
} from './shared/formAccess.ts';
import type { CategoryStore, TransitEntry } from './shared/types.ts';
import { DEFAULT_TRANSIT_STATUSES } from './shared/normalizers.ts';
import {
  SHORTCUT_DEFINITIONS,
  isEditableTarget,
  matchesShortcutEvent,
} from './shared/shortcuts.ts';

interface ErrorBoundaryProps {
  resetKey?: string;
  isFa?: boolean;
  onResetToDashboard?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error',
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      const isFa = this.props.isFa !== false;
      return (
        <div className="my-8 mx-auto max-w-lg rounded-2xl border border-[var(--status-danger)]/40 bg-[var(--bg-surface)] p-6 text-center space-y-4 shadow-sm">
          <div className="w-11 h-11 mx-auto rounded-full bg-[var(--status-danger-bg)] text-[var(--status-danger)] flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {isFa ? 'خطا در نمایش این بخش' : 'Error rendering this section'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {isFa
                ? 'در بارگذاری این صفحه خطای غیرمنتظره‌ای رخ داد. می‌توانید دوباره تلاش کنید یا به داشبورد بازگردید.'
                : 'An unexpected error occurred while rendering this view. You can retry or return to the dashboard.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isFa ? 'تلاش مجدد' : 'Try Again'}</span>
            </button>
            {this.props.onResetToDashboard && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                  this.props.onResetToDashboard?.();
                }}
                className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-primary)]"
              >
                {isFa ? 'بازگشت به داشبورد' : 'Return to Dashboard'}
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    activeEmployer,
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
  const [employerStudioTarget, setEmployerStudioTarget] = useState<{
    employerId?: string;
    section?: 'profile' | 'forms';
    formSection?: OperationalFormSectionKey | null;
    token: number;
  }>({ token: 0 });

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

  const openEmployerFormUpload = useCallback(
    (sectionKey?: OperationalFormSectionKey) => {
      setEmployerStudioTarget({
        employerId: activeEmployer.id || undefined,
        section: 'forms',
        formSection: sectionKey || null,
        token: Date.now(),
      });
      setActiveTab('employers');
    },
    [activeEmployer.id],
  );

  const renderOperationalFormSection = (
    sectionKey: OperationalFormSectionKey,
    builtInView: React.ReactNode,
  ) => {
    const access = resolveOperationalSectionAccess(activeEmployer, sectionKey);
    if (!access.hasAccess) {
      return (
        <OperationalFormGate
          key={`gate:${activeEmployer.id}:${sectionKey}`}
          sectionKey={sectionKey}
          onGoToUploadForms={openEmployerFormUpload}
          onSelectSection={(targetKey) => setActiveTab(targetKey)}
        />
      );
    }
    if (access.mode === 'uploaded') {
      return (
        <UploadedSectionWorkspace
          key={`uploaded:${activeEmployer.id}:${sectionKey}`}
          sectionKey={sectionKey}
          uploadedForms={access.uploadedForms}
          refreshSignal={refreshSignal}
          onGoToUploadForms={openEmployerFormUpload}
        />
      );
    }
    return <React.Fragment key={`builtin:${activeEmployer.id}:${sectionKey}`}>{builtInView}</React.Fragment>;
  };

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

  // Global customizable keyboard shortcuts handler
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
                  ? 'خروجی جدول در این صفحه فعال نیست یا از دکمه خروجی بالای جدول استفاده کنید.'
                  : 'Table export shortcut is available on data table views.',
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
          onNetworkModeChanged={bumpRefresh}
        >
          <AppErrorBoundary
            resetKey={`${activeTab}:${activeProjectId}:${activeEmployer.id}:${refreshSignal}`}
            isFa={prefs.language === 'fa'}
            onResetToDashboard={() => setActiveTab('dashboard')}
          >
            {activeTab === 'dashboard' && (
              <DashboardView
                refreshSignal={refreshSignal}
                onNavigate={setActiveTab}
                onOpenNewPacking={() => openNewPacking('')}
                onInspectDetailedShipment={(pk) => jumpToDetailed(pk)}
              />
            )}

            {activeTab === 'siteEntry' &&
              renderOperationalFormSection(
                'siteEntry',
                <SiteEntryMinutesView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
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

            {activeTab === 'opi' &&
              renderOperationalFormSection(
                'opi',
                <OpiView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'opiMinutes' &&
              renderOperationalFormSection(
                'opiMinutes',
                <OpiMinutesView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'gcv' &&
              renderOperationalFormSection(
                'gcv',
                <GcvView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'miv' &&
              renderOperationalFormSection(
                'miv',
                <MivView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'smr' &&
              renderOperationalFormSection(
                'smr',
                <SmrView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'substitution' &&
              renderOperationalFormSection(
                'substitution',
                <SubstitutionView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'materialEstimation' && (
              <MaterialEstimationView
                categories={categories}
                refreshSignal={refreshSignal}
                onDataChanged={bumpRefresh}
              />
            )}

            {activeTab === 'balance' &&
              renderOperationalFormSection(
                'balance',
                <BalanceView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />,
              )}

            {activeTab === 'stocktake' && (
              <StocktakeView refreshSignal={refreshSignal} onDataChanged={bumpRefresh} />
            )}

            {activeTab === 'storageLabel' &&
              renderOperationalFormSection(
                'storageLabel',
                <StorageLabelView refreshSignal={refreshSignal} />,
              )}

            {activeTab === 'customForms' && (
              <CustomFormsRunnerView
                refreshSignal={refreshSignal}
                onDataChanged={bumpRefresh}
                onOpenEmployerStudio={() => openEmployerFormUpload()}
              />
            )}

            {activeTab === 'employers' && (
              <EmployersStudioView
                initialEmployerId={employerStudioTarget.employerId}
                initialSection={employerStudioTarget.section}
                initialFormSection={employerStudioTarget.formSection}
                navigationToken={employerStudioTarget.token}
                onOpenFormSection={(sectionKey) => setActiveTab(sectionKey)}
              />
            )}

            {activeTab === 'search' && (
              <GlobalSearchView refreshSignal={refreshSignal} onJumpToDetailed={jumpToDetailed} />
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

            {activeTab === 'usersAudit' && <UsersAuditView refreshSignal={refreshSignal} />}

            {activeTab === 'backup' && <BackupView onRestored={bumpRefresh} />}

            {activeTab === 'databasePurge' && (
              <DatabasePurgeView refreshSignal={refreshSignal} onPurged={bumpRefresh} />
            )}
          </AppErrorBoundary>

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
      <AppUpdateManager />
    </>
  );
};

export default function App() {
  return (
    <AppErrorBoundary isFa={true}>
      <AppProvider>
        <SamaanWorkspace />
      </AppProvider>
    </AppErrorBoundary>
  );
}
