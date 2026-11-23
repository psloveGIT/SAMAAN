import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  CornerUpLeft,
  DatabaseZap,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  FolderTree,
  Globe,
  HardDriveDownload,
  History,
  KeyRound,
  Keyboard,
  ListChecks,
  Lock,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  Scale,
  Search,
  Shield,
  Sparkles,
  SpellCheck2,
  Sun,
  Tag,
  Trash2,
  Truck,
  Undo2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  getNetworkModeState,
  subscribeNetworkMode,
  type NetworkModeState,
} from '../lib/api.ts';
import { APP_VERSION } from '../shared/appVersion.ts';
import {
  isOperationalFormSection,
  resolveOperationalSectionAccess,
} from '../shared/formAccess.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { ChangePasswordModal } from './ChangePasswordModal.tsx';
import { ProjectManagerModal } from './ProjectManagerModal.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { SamaanLogo } from './SamaanLogo.tsx';

export type NavTabKey =
  | 'dashboard'
  | 'siteEntry'
  | 'general'
  | 'detailed'
  | 'transit'
  | 'opi'
  | 'opiMinutes'
  | 'gcv'
  | 'miv'
  | 'smr'
  | 'substitution'
  | 'materialEstimation'
  | 'balance'
  | 'stocktake'
  | 'storageLabel'
  | 'customForms'
  | 'employers'
  | 'search'
  | 'categories'
  | 'trash'
  | 'usersAudit'
  | 'backup'
  | 'databasePurge';

type NavGroupId = 'core' | 'operations' | 'planning' | 'admin';

const GROUPS_STORAGE_KEY = 'samaan_sidebar_groups_v1';
const COLLAPSED_STORAGE_KEY = 'samaan_sidebar_collapsed_v1';

interface LayoutProps {
  activeTab: NavTabKey;
  onTabChange: (tab: NavTabKey) => void;
  onOpenNewPacking: () => void;
  onOpenAiAssistant?: () => void;
  onOpenShortcuts?: () => void;
  onNetworkModeChanged?: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  onOpenNewPacking,
  onOpenAiAssistant,
  onOpenShortcuts,
  onNetworkModeChanged,
  children,
}) => {
  const {
    user,
    prefs,
    t,
    activeProject,
    activeEmployer,
    setLanguage,
    setCalendar,
    setTheme,
    setEyeComfort,
    setSpellCheck,
    shortcuts,
    historyStatus,
    historyBusy,
    performUndo,
    performRedo,
    refreshAuth,
    notify,
    logout,
    formatDate,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [changePwOpen, setChangePwOpen] = React.useState(false);
  const [projectModalOpen, setProjectModalOpen] = React.useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = React.useState(false);
  const [navQuery, setNavQuery] = React.useState('');
  const [pendingUpdateInfo, setPendingUpdateInfo] = React.useState<{
    hasPendingUpdate: boolean;
    mode: 'none' | 'live_update' | 'reopen_whats_new';
    targetVersion: string;
  }>({ hasPendingUpdate: false, mode: 'none', targetVersion: APP_VERSION });
  const historyMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [networkState, setNetworkState] = React.useState<NetworkModeState>(() => getNetworkModeState());

  const prevStaticFallbackRef = React.useRef<boolean>(networkState.staticFallback);

  React.useEffect(() => {
    setNetworkState(getNetworkModeState());
    return subscribeNetworkMode(setNetworkState);
  }, []);

  React.useEffect(() => {
    if (prevStaticFallbackRef.current !== networkState.staticFallback) {
      prevStaticFallbackRef.current = networkState.staticFallback;
      void refreshAuth().then(() => {
        onNetworkModeChanged?.();
      });
    }
  }, [networkState.staticFallback, refreshAuth, onNetworkModeChanged]);

  React.useEffect(() => {
    const onUpdateStatus = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          hasPendingUpdate?: boolean;
          mode?: 'none' | 'live_update' | 'reopen_whats_new';
          targetVersion?: string;
        }>
      ).detail;
      setPendingUpdateInfo({
        hasPendingUpdate: Boolean(detail?.hasPendingUpdate),
        mode: detail?.mode || 'none',
        targetVersion: detail?.targetVersion || APP_VERSION,
      });
    };
    window.addEventListener('samaan:update-status', onUpdateStatus);
    return () => window.removeEventListener('samaan:update-status', onUpdateStatus);
  }, []);

  React.useEffect(() => {
    if (!historyMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setHistoryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [historyMenuOpen]);

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [openGroups, setOpenGroups] = React.useState<Record<NavGroupId, boolean>>(() => {
    try {
      const saved = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Record<NavGroupId, boolean>>;
        return {
          core: parsed.core ?? true,
          operations: parsed.operations ?? false,
          planning: parsed.planning ?? false,
          admin: parsed.admin ?? false,
        };
      }
    } catch {
      // ignore
    }
    return {
      core: true,
      operations: false,
      planning: false,
      admin: false,
    };
  });

  const isFa = prefs.language === 'fa';

  const navGroups: {
    id: NavGroupId;
    groupLabel: string;
    items: { key: NavTabKey; label: string; icon: React.ReactNode }[];
  }[] = React.useMemo(
    () => [
      {
        id: 'core',
        groupLabel: t.navGroups.core,
        items: [
          { key: 'dashboard', label: t.nav.dashboard, icon: <BarChart3 className="w-4 h-4 shrink-0" /> },
          { key: 'general', label: t.nav.general, icon: <Boxes className="w-4 h-4 shrink-0" /> },
          { key: 'detailed', label: t.nav.detailed, icon: <ListChecks className="w-4 h-4 shrink-0" /> },
          { key: 'transit', label: t.nav.transit, icon: <Truck className="w-4 h-4 shrink-0" /> },
        ],
      },
      {
        id: 'operations',
        groupLabel: t.navGroups.operations,
        items: [
          { key: 'siteEntry', label: t.nav.siteEntry, icon: <ClipboardSignature className="w-4 h-4 shrink-0" /> },
          { key: 'opi', label: t.nav.opi, icon: <FileText className="w-4 h-4 shrink-0" /> },
          { key: 'opiMinutes', label: t.nav.opiMinutes, icon: <ClipboardCheck className="w-4 h-4 shrink-0" /> },
          { key: 'gcv', label: t.nav.gcv, icon: <FileCheck2 className="w-4 h-4 shrink-0" /> },
          { key: 'miv', label: t.nav.miv, icon: <ClipboardList className="w-4 h-4 shrink-0" /> },
          { key: 'smr', label: t.nav.smr, icon: <CornerUpLeft className="w-4 h-4 shrink-0" /> },
          { key: 'substitution', label: t.nav.substitution, icon: <ArrowLeftRight className="w-4 h-4 shrink-0" /> },
          { key: 'balance', label: t.nav.balance, icon: <Scale className="w-4 h-4 shrink-0" /> },
          { key: 'storageLabel', label: t.nav.storageLabel, icon: <Tag className="w-4 h-4 shrink-0" /> },
        ],
      },
      {
        id: 'planning',
        groupLabel: t.navGroups.planning,
        items: [
          { key: 'materialEstimation', label: t.nav.materialEstimation, icon: <Calculator className="w-4 h-4 shrink-0" /> },
          { key: 'stocktake', label: t.nav.stocktake, icon: <ClipboardCheck className="w-4 h-4 shrink-0" /> },
          { key: 'customForms', label: t.nav.customForms, icon: <FilePlus2 className="w-4 h-4 shrink-0" /> },
        ],
      },
      {
        id: 'admin',
        groupLabel: t.navGroups.admin,
        items: [
          { key: 'employers', label: t.nav.employers, icon: <Building2 className="w-4 h-4 shrink-0" /> },
          { key: 'search', label: t.nav.search, icon: <Search className="w-4 h-4 shrink-0" /> },
          { key: 'categories', label: t.nav.categories, icon: <FolderTree className="w-4 h-4 shrink-0" /> },
          { key: 'trash', label: t.nav.trash, icon: <Trash2 className="w-4 h-4 shrink-0" /> },
          { key: 'usersAudit', label: t.nav.usersAudit, icon: <Shield className="w-4 h-4 shrink-0" /> },
          { key: 'backup', label: t.nav.backup, icon: <HardDriveDownload className="w-4 h-4 shrink-0" /> },
          ...(user?.role === 'admin'
            ? [
                {
                  key: 'databasePurge' as NavTabKey,
                  label: t.nav.databasePurge,
                  icon: <DatabaseZap className="w-4 h-4 shrink-0 text-[var(--status-danger)]" />,
                },
              ]
            : []),
        ],
      },
    ],
    [t, user?.role],
  );

  // Automatically expand the group that holds the currently active tab
  React.useEffect(() => {
    const owner = navGroups.find((g) => g.items.some((item) => item.key === activeTab));
    if (owner) {
      setOpenGroups((prev) => {
        if (prev[owner.id]) return prev;
        const next = { ...prev, [owner.id]: true };
        try {
          localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, [activeTab, navGroups]);

  const toggleGroup = (id: NavGroupId) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };

  const normalizedQuery = navQuery.trim().toLowerCase();
  const allNavItems = navGroups.flatMap((g) => g.items);
  const activeGroup = navGroups.find((g) => g.items.some((item) => item.key === activeTab));
  const activeTitle = allNavItems.find((n) => n.key === activeTab)?.label || t.nav.dashboard;
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const todayFormatted = formatDate(getTodayIso());
  const userInitial = (user?.fullName || user?.username || 'U').trim().charAt(0).toUpperCase();

  const projectSummaryLabel = `${activeProject?.name || (isFa ? 'پروژه پیش‌فرض' : 'Default Project')} · ${
    activeEmployer.isConfigured
      ? activeEmployer.shortName || activeEmployer.nameFa
      : isFa
        ? 'حالت خام'
        : 'Raw'
  }`;

  return (
    <div className="min-h-[100dvh] flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden print:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 z-50 h-[100dvh] shrink-0 border-e border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between transition-all duration-200 print:hidden ${
          sidebarCollapsed ? 'w-64 lg:w-[70px]' : 'w-[264px]'
        } ${
          mobileMenuOpen
            ? 'translate-x-0'
            : prefs.language === 'fa'
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className={`${sidebarCollapsed ? 'lg:p-2.5 p-4' : 'p-4'} flex-1 min-h-0 flex flex-col gap-3.5`}>
          {/* Brand Header & Collapse Controls */}
          <div
            className={`flex items-center pb-3 border-b border-[var(--border-subtle)] shrink-0 ${
              sidebarCollapsed ? 'lg:justify-center justify-between' : 'justify-between gap-2'
            }`}
          >
            <div className={sidebarCollapsed ? 'lg:hidden' : 'block'}>
              <SamaanLogo size="md" showWordmark showSubtitle />
            </div>
            {sidebarCollapsed && (
              <div className="hidden lg:block">
                <SamaanLogo size="sm" showWordmark={false} showSubtitle={false} />
              </div>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                title={
                  sidebarCollapsed
                    ? isFa ? 'باز کردن منو' : 'Expand sidebar'
                    : isFa ? 'جمع کردن منو (نمای آیکونی)' : 'Collapse sidebar'
                }
                className="hidden lg:flex p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
              >
                {isFa ? (
                  sidebarCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />
                ) : (
                  sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Project Selector */}
          <button
            type="button"
            onClick={() => setProjectModalOpen(true)}
            title={projectSummaryLabel}
            className={`w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/75 hover:bg-[var(--bg-subtle)]/80 hover:border-[var(--border-strong)] flex items-center transition-all shrink-0 ${
              sidebarCollapsed ? 'lg:justify-center lg:h-10 lg:px-0 px-3 py-2.5 justify-between gap-2 text-start' : 'px-3 py-2.5 justify-between gap-2 text-start'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
              {activeEmployer.logos.length > 0 && activeEmployer.logos[0]?.dataUrl ? (
                <div className="w-9 h-8 rounded-lg bg-white border border-[var(--border-subtle)] p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src={activeEmployer.logos[0].dataUrl}
                    alt={activeEmployer.shortName || activeEmployer.nameFa}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
              )}
              <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <div className="text-[10px] font-medium text-[var(--text-muted)]">
                  {isFa ? 'پروژه فعال' : 'Active Project'}
                </div>
                <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {activeProject?.name || (isFa ? 'پروژه پیش‌فرض' : 'Default Project')}
                </div>
                <div className="text-[10.5px] text-[var(--accent-primary)] font-medium truncate">
                  {activeEmployer.isConfigured
                    ? isFa
                      ? `کارفرما: ${activeEmployer.shortName || activeEmployer.nameFa}`
                      : `Client: ${activeEmployer.shortName || activeEmployer.nameEn}`
                    : isFa
                      ? 'کارفرما: تعیین‌نشده (خام)'
                      : 'Employer: Unassigned (Raw)'}
                </div>
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`} />
          </button>

          {/* Instant Menu Search Filter (visible in expanded / mobile drawer) */}
          <div className={`relative shrink-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder={isFa ? 'دسترسی سریع به فرم یا بخش...' : 'Quick filter menu...'}
              className="w-full h-9 ps-8.5 pe-7 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            {navQuery && (
              <button
                type="button"
                onClick={() => setNavQuery('')}
                title={isFa ? 'پاک کردن' : 'Clear'}
                className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] absolute top-1/2 -translate-y-1/2 end-2.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scrollable Accordion / Icon Navigation */}
          <nav className="flex-1 min-h-0 overflow-y-auto space-y-2 pe-0.5">
            {navGroups.map((group, gIdx) => {
              const filteredItems = normalizedQuery
                ? group.items.filter(
                    (it) =>
                      it.label.toLowerCase().includes(normalizedQuery) ||
                      it.key.toLowerCase().includes(normalizedQuery),
                  )
                : group.items;

              if (normalizedQuery && filteredItems.length === 0) {
                return null;
              }

              const isExpanded = Boolean(normalizedQuery) || openGroups[group.id];
              const hasActiveItem = group.items.some((it) => it.key === activeTab);

              return (
                <div
                  key={group.id}
                  className={
                    sidebarCollapsed && gIdx > 0
                      ? 'lg:pt-2 lg:border-t lg:border-[var(--border-subtle)] space-y-0.5'
                      : 'space-y-0.5'
                  }
                >
                  {/* Group Accordion Header (Hidden in desktop icon-rail mode) */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-start transition-colors hover:bg-[var(--bg-subtle)]/70 ${
                      sidebarCollapsed ? 'lg:hidden' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-[11px] font-bold truncate ${
                          hasActiveItem ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {group.groupLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[var(--text-muted)]">
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-150 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Group Items */}
                  {(isExpanded || sidebarCollapsed) && (
                    <div
                      className={`space-y-0.5 ${
                        !isExpanded && sidebarCollapsed ? 'hidden lg:block' : ''
                      }`}
                    >
                      {filteredItems.map((item) => {
                        const isActive = activeTab === item.key;
                        const formAccess = isOperationalFormSection(item.key)
                          ? resolveOperationalSectionAccess(activeEmployer, item.key)
                          : null;
                        const isLockedForm = Boolean(formAccess && !formAccess.hasAccess);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            data-testid={`nav-tab-${item.key}`}
                            title={
                              isLockedForm
                                ? `${item.label} — ${isFa ? 'نیاز به آپلود فرم' : 'Form upload required'}`
                                : item.label
                            }
                            onClick={() => {
                              onTabChange(item.key);
                              setMobileMenuOpen(false);
                            }}
                            className={`relative w-full h-9 rounded-xl flex items-center text-[12.5px] transition-all whitespace-nowrap ${
                              sidebarCollapsed
                                ? 'lg:justify-center lg:px-0 px-3 gap-2.5'
                                : 'px-3 gap-2.5'
                            } ${
                              isActive
                                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/80 hover:text-[var(--text-primary)] font-medium'
                            }`}
                          >
                            {isActive && !sidebarCollapsed && (
                              <span
                                aria-hidden="true"
                                className="absolute start-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--accent-primary)]"
                              />
                            )}
                            {item.icon}
                            <span className={`truncate flex-1 text-start ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                              {item.label}
                            </span>
                            {isLockedForm && !sidebarCollapsed && (
                              <Lock
                                aria-label={isFa ? 'نیاز به آپلود فرم' : 'Requires form upload'}
                                className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]/75"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {normalizedQuery &&
              navGroups.every(
                (g) =>
                  g.items.filter(
                    (it) =>
                      it.label.toLowerCase().includes(normalizedQuery) ||
                      it.key.toLowerCase().includes(normalizedQuery),
                  ).length === 0,
              ) && (
                <div className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">
                  {isFa ? 'موردی در منو یافت نشد.' : 'No matching menu items.'}
                </div>
              )}
          </nav>
        </div>

        {/* Compact Scandinavian Utility Dock & User Profile */}
        <div className={`${sidebarCollapsed ? 'lg:p-2.5 p-3.5' : 'p-3.5'} border-t border-[var(--border-subtle)] space-y-2.5 shrink-0 bg-[var(--bg-surface)]`}>
          {/* Sleek Compact 6-Icon Quick Controls Dock */}
          <div
            className={`grid gap-1 p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/80 ${
              sidebarCollapsed ? 'lg:grid-cols-1 grid-cols-6' : 'grid-cols-6'
            }`}
          >
            <button
              type="button"
              onClick={() => setLanguage(prefs.language === 'fa' ? 'en' : 'fa')}
              title={`${t.controls.language}: ${prefs.language === 'fa' ? 'تغییر به English' : 'Switch to فارسی'}`}
              className="h-8 rounded-lg text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] flex items-center justify-center gap-0.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className={`text-[9.5px] font-bold ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                {prefs.language === 'fa' ? 'EN' : 'فا'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCalendar(prefs.calendar === 'jalali' ? 'gregorian' : 'jalali')}
              title={`${t.controls.calendar}: ${prefs.calendar === 'jalali' ? t.controls.jalali : t.controls.gregorian}`}
              className={`h-8 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors ${
                sidebarCollapsed ? 'lg:hidden' : ''
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
            </button>

            <button
              type="button"
              data-testid="sidebar-theme-toggle-btn"
              onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
              title={prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}
              aria-label={prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}
              className="h-8 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
            >
              {prefs.theme === 'light' ? (
                <Moon className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Sun className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setEyeComfort(!prefs.eyeComfort)}
              title={t.controls.eyeComfortTooltip}
              aria-pressed={prefs.eyeComfort}
              className={`h-8 rounded-lg flex items-center justify-center transition-colors ${
                sidebarCollapsed ? 'lg:hidden' : ''
              } ${
                prefs.eyeComfort
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSpellCheck(prefs.spellCheck === false)}
              title={`${t.controls.spellCheckTooltip} (${prefs.spellCheck !== false ? (isFa ? 'فعال' : 'ON') : (isFa ? 'خاموش' : 'OFF')})`}
              aria-pressed={prefs.spellCheck !== false}
              className={`h-8 rounded-lg flex items-center justify-center transition-colors ${
                sidebarCollapsed ? 'lg:hidden' : ''
              } ${
                prefs.spellCheck !== false
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SpellCheck2 className="w-3.5 h-3.5 shrink-0" />
            </button>

            <div
              role="status"
              aria-live="polite"
              data-testid="sidebar-network-status-icon"
              data-network-state={networkState.isOffline ? 'offline' : 'online'}
              title={
                networkState.isOffline
                  ? isFa
                    ? 'وضعیت اتصال به سرور: آفلاین'
                    : 'Server Connection: Offline'
                  : isFa
                    ? 'وضعیت اتصال به سرور: آنلاین'
                    : 'Server Connection: Online'
              }
              aria-label={
                networkState.isOffline
                  ? isFa
                    ? 'وضعیت اتصال: آفلاین'
                    : 'Connection status: Offline'
                  : isFa
                    ? 'وضعیت اتصال: آنلاین'
                    : 'Connection status: Online'
              }
              className={`h-8 rounded-lg flex items-center justify-center cursor-default select-none transition-colors ${
                networkState.isOffline
                  ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                  : 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
              }`}
            >
              {networkState.isOffline ? (
                <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Wifi className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
            </div>
          </div>

          {/* Quiet Version / Update Status & Shortcuts Inline Row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="sidebar-update-status-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                window.dispatchEvent(new Event('samaan:open-changelog'));
              }}
              title={
                pendingUpdateInfo.hasPendingUpdate
                  ? pendingUpdateInfo.mode === 'reopen_whats_new'
                    ? isFa
                      ? `برنامه به نسخه ${pendingUpdateInfo.targetVersion} بروزرسانی شده است — برای مشاهده تغییرات کلیک کنید`
                      : `Updated to v${pendingUpdateInfo.targetVersion} — click to view changes`
                    : isFa
                      ? `بروزرسانی آماده است (${pendingUpdateInfo.targetVersion}) — برای مشاهده تغییرات کلیک کنید`
                      : `Update available (v${pendingUpdateInfo.targetVersion}) — click to view changes`
                  : isFa
                    ? `نسخه برنامه ${APP_VERSION} — بررسی بروزرسانی و تاریخچه تغییرات`
                    : `Version ${APP_VERSION} — Check updates & changelog`
              }
              className={`flex-1 h-8 px-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                sidebarCollapsed ? 'lg:px-0' : ''
              } ${
                pendingUpdateInfo.hasPendingUpdate
                  ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                  : 'border-[var(--border-subtle)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative flex items-center justify-center shrink-0">
                <RefreshCw className="w-3.5 h-3.5" />
                {pendingUpdateInfo.hasPendingUpdate && (
                  <span className="absolute -top-0.5 -end-0.5 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                )}
              </span>
              <span className={`truncate tabular-nums ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                {pendingUpdateInfo.hasPendingUpdate
                  ? pendingUpdateInfo.mode === 'reopen_whats_new'
                    ? isFa
                      ? `تغییرات نسخه ${pendingUpdateInfo.targetVersion}`
                      : `What's New (v${pendingUpdateInfo.targetVersion})`
                    : isFa
                      ? `بروزرسانی آماده (${pendingUpdateInfo.targetVersion})`
                      : `Update Ready (v${pendingUpdateInfo.targetVersion})`
                  : isFa
                    ? `نسخه ${APP_VERSION}`
                    : `v${APP_VERSION}`}
              </span>
            </button>

            {onOpenShortcuts && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenShortcuts();
                }}
                title={`${isFa ? 'تنظیمات کلیدهای میانبر' : 'Keyboard Shortcuts'} (${shortcuts.shortcutsSettings || 'Ctrl+/'})`}
                className={`h-8 w-8 rounded-xl border border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center justify-center shrink-0 transition-colors ${
                  sidebarCollapsed ? 'lg:hidden' : ''
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {user && (
            <div
              className={`pt-2.5 border-t border-[var(--border-subtle)] flex items-center gap-2.5 ${
                sidebarCollapsed ? 'lg:flex-col lg:justify-center justify-between' : 'justify-between'
              }`}
            >
              <div className={`flex items-center gap-2.5 min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] font-bold text-xs flex items-center justify-center shrink-0 border border-[var(--accent-primary)]/20">
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">{user.fullName}</div>
                  <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                    {user.role === 'admin'
                      ? t.auth.roleAdmin
                      : user.role === 'operator'
                        ? t.auth.roleOperator
                        : t.auth.roleViewer}
                  </div>
                </div>
              </div>
              <div className={`flex items-center gap-0.5 shrink-0 ${sidebarCollapsed ? 'lg:flex-col' : ''}`}>
                <button
                  type="button"
                  onClick={() => setChangePwOpen(true)}
                  title={t.auth.changePassword}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)] transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={logout}
                  title={t.controls.logout}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
        {/* Crisp Architectural Top Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 lg:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/92 backdrop-blur-md flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Excel-style Quick Access Undo / Redo Toolbar */}
            {canEdit && (
              <div ref={historyMenuRef} className="relative flex items-center shrink-0">
                <div
                  dir="ltr"
                  className="flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-0.5"
                >
                  <button
                    type="button"
                    data-testid="topbar-undo-btn"
                    disabled={!historyStatus.canUndo || historyBusy}
                    onClick={() => {
                      void performUndo();
                    }}
                    aria-label={isFa ? 'بازگردانی' : 'Undo'}
                    title={
                      historyStatus.canUndo
                        ? isFa
                          ? `بازگردانی: ${historyStatus.nextUndoLabelFa} (${shortcuts.undo || 'Ctrl+Z'})`
                          : `Undo: ${historyStatus.nextUndoLabelEn} (${shortcuts.undo || 'Ctrl+Z'})`
                        : isFa
                          ? `بازگردانی (${shortcuts.undo || 'Ctrl+Z'}) — موردی برای بازگردانی نیست`
                          : `Undo (${shortcuts.undo || 'Ctrl+Z'}) — Nothing to undo`
                    }
                    className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>

                  <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" aria-hidden="true" />

                  <button
                    type="button"
                    data-testid="topbar-redo-btn"
                    disabled={!historyStatus.canRedo || historyBusy}
                    onClick={() => {
                      void performRedo();
                    }}
                    aria-label={isFa ? 'انجام مجدد' : 'Redo'}
                    title={
                      historyStatus.canRedo
                        ? isFa
                          ? `انجام مجدد: ${historyStatus.nextRedoLabelFa} (${shortcuts.redo || 'Ctrl+Y'})`
                          : `Redo: ${historyStatus.nextRedoLabelEn} (${shortcuts.redo || 'Ctrl+Y'})`
                        : isFa
                          ? `انجام مجدد (${shortcuts.redo || 'Ctrl+Y'}) — موردی برای انجام مجدد نیست`
                          : `Redo (${shortcuts.redo || 'Ctrl+Y'}) — Nothing to redo`
                    }
                    className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="topbar-history-dropdown-btn"
                    onClick={() => setHistoryMenuOpen((v) => !v)}
                    aria-label={isFa ? 'تاریخچه عملیات' : 'Action History'}
                    title={isFa ? 'مشاهده تاریخچه بازگردانی و انجام مجدد' : 'View Undo / Redo History'}
                    className={`h-7 px-1 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors ${
                      historyMenuOpen ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]' : ''
                    }`}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </div>

                {historyMenuOpen && (
                  <div className="absolute top-full mt-1.5 start-0 z-50 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl p-2.5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
                      <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        {isFa ? 'تاریخچه عملیات' : 'Action History'}
                      </span>
                      <span dir="ltr" className="text-[10px] font-mono text-[var(--text-muted)]">
                        {shortcuts.undo || 'Ctrl+Z'} / {shortcuts.redo || 'Ctrl+Y'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                        {isFa
                          ? `قابل بازگردانی (${historyStatus.undoCount})`
                          : `Undo Stack (${historyStatus.undoCount})`}
                      </div>
                      {historyStatus.undoStack.length === 0 ? (
                        <div className="text-[11px] text-[var(--text-muted)] py-1">
                          {isFa ? 'عملیاتی ثبت نشده است.' : 'No recorded actions yet.'}
                        </div>
                      ) : (
                        <div className="max-h-36 overflow-y-auto space-y-1">
                          {historyStatus.undoStack.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={idx !== 0 || historyBusy}
                              onClick={() => {
                                setHistoryMenuOpen(false);
                                void performUndo();
                              }}
                              className={`w-full px-2 py-1.5 rounded-lg text-start flex items-center justify-between gap-2 ${
                                idx === 0
                                  ? 'bg-[var(--accent-soft)]/70 text-[var(--text-primary)] hover:bg-[var(--accent-soft)] font-medium'
                                  : 'text-[var(--text-muted)] opacity-75 cursor-default'
                              }`}
                            >
                              <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                              {idx === 0 && (
                                <Undo2 className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {historyStatus.redoStack.length > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-[var(--border-subtle)]">
                        <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                          {isFa
                            ? `قابل انجام مجدد (${historyStatus.redoCount})`
                            : `Redo Stack (${historyStatus.redoCount})`}
                        </div>
                        <div className="max-h-28 overflow-y-auto space-y-1">
                          {historyStatus.redoStack.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              disabled={idx !== 0 || historyBusy}
                              onClick={() => {
                                setHistoryMenuOpen(false);
                                void performRedo();
                              }}
                              className={`w-full px-2 py-1.5 rounded-lg text-start flex items-center justify-between gap-2 ${
                                idx === 0
                                  ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)] font-medium'
                                  : 'text-[var(--text-muted)] opacity-75 cursor-default'
                              }`}
                            >
                              <span className="truncate">{isFa ? item.labelFa : item.labelEn}</span>
                              {idx === 0 && (
                                <Redo2 className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clean Breadcrumb Title */}
            <div className="flex items-center gap-1.5 min-w-0">
              {activeGroup && (
                <span className="hidden xl:inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] shrink-0">
                  <span>{activeGroup.groupLabel}</span>
                  {isFa ? (
                    <ChevronLeft className="w-3.5 h-3.5 opacity-60" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  )}
                </span>
              )}
              <h2 className="text-sm lg:text-[15px] font-bold tracking-tight text-[var(--text-primary)] truncate">
                {activeTitle}
              </h2>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setProjectModalOpen(true)}
              className="h-8 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{activeProject?.name || t.brandFull}</span>
            </button>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span className="font-medium">{todayFormatted}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenShortcuts && (
              <button
                type="button"
                data-testid="topbar-shortcuts-btn"
                onClick={onOpenShortcuts}
                title={`${isFa ? 'کلیدهای میانبر و شخصی‌سازی' : 'Keyboard Shortcuts & Settings'} (${shortcuts.shortcutsSettings || 'Ctrl+/'})`}
                className="hidden sm:flex h-9 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Keyboard className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="hidden xl:inline">{isFa ? 'میانبرها' : 'Shortcuts'}</span>
              </button>
            )}
            {onOpenAiAssistant && (
              <button
                type="button"
                onClick={onOpenAiAssistant}
                title={`${isFa ? 'دستیار هوشمند' : 'AI Assistant'} (${shortcuts.aiAssistant || 'Ctrl+K'})`}
                className="h-9 px-3 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)] hover:bg-[var(--accent-primary)]/18 text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isFa ? 'دستیار هوشمند' : 'AI Assistant'}</span>
              </button>
            )}
            <PWAInstallButton />
            {canEdit && (
              <button
                type="button"
                onClick={onOpenNewPacking}
                title={`${t.controls.newPacking} (${shortcuts.newPacking || 'Alt+N'})`}
                className="h-9 px-3.5 sm:px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-[0_1px_2px_rgba(13,122,114,0.28)] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t.controls.newPacking}</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 min-w-0 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>

      <ChangePasswordModal
        open={changePwOpen || Boolean(user?.mustChangePassword)}
        forced={Boolean(user?.mustChangePassword)}
        onClose={() => setChangePwOpen(false)}
      />

      <ProjectManagerModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onOpenEmployersPage={() => {
          onTabChange('employers');
          setMobileMenuOpen(false);
        }}
      />
    </div>
  );
};
