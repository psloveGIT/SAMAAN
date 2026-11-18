import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Calculator,
  Calendar,
  ChevronDown,
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
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Scale,
  Search,
  Shield,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
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
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  onOpenNewPacking,
  onOpenAiAssistant,
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
    logout,
    formatDate,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [changePwOpen, setChangePwOpen] = React.useState(false);
  const [projectModalOpen, setProjectModalOpen] = React.useState(false);
  const [navQuery, setNavQuery] = React.useState('');

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
          { key: 'employers', label: t.nav.employers, icon: <Palette className="w-4 h-4 shrink-0" /> },
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
  const activeTitle = allNavItems.find((n) => n.key === activeTab)?.label || t.nav.dashboard;
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const todayFormatted = formatDate(getTodayIso());

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
          sidebarCollapsed ? 'w-64 lg:w-[68px]' : 'w-64'
        } ${
          mobileMenuOpen
            ? 'translate-x-0'
            : prefs.language === 'fa'
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className={`${sidebarCollapsed ? 'lg:p-2.5 p-3.5' : 'p-3.5'} flex-1 min-h-0 flex flex-col gap-3`}>
          {/* Brand Header & Collapse Controls */}
          <div
            className={`flex items-center pb-2.5 border-b border-[var(--border-subtle)] shrink-0 ${
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
            className={`w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] flex items-center transition-colors shrink-0 ${
              sidebarCollapsed ? 'lg:justify-center lg:h-10 lg:px-0 px-3 py-2 justify-between gap-2 text-start' : 'px-3 py-2 justify-between gap-2 text-start'
            }`}
          >
            <div className={`flex items-center gap-2 min-w-0 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
              <Building2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {isFa ? 'پروژه فعال' : 'Active Project'}
                </div>
                <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {activeProject?.name || (isFa ? 'پروژه پیش‌فرض' : 'Default Project')}
                </div>
                <div className="text-[10px] text-[var(--accent-primary)] truncate">
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
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-2.5 pointer-events-none" />
            <input
              type="text"
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder={isFa ? 'دسترسی سریع به فرم یا بخش...' : 'Quick filter menu...'}
              className="w-full h-8 ps-8 pe-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            {navQuery && (
              <button
                type="button"
                onClick={() => setNavQuery('')}
                title={isFa ? 'پاک کردن' : 'Clear'}
                className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] absolute top-1/2 -translate-y-1/2 end-2"
              >
                <X className="w-3 h-3" />
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
                        return (
                          <button
                            key={item.key}
                            type="button"
                            title={item.label}
                            onClick={() => {
                              onTabChange(item.key);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full h-8 rounded-lg flex items-center text-xs transition-colors whitespace-nowrap ${
                              sidebarCollapsed
                                ? 'lg:justify-center lg:px-0 px-2.5 gap-2.5'
                                : 'px-2.5 gap-2.5'
                            } ${
                              isActive
                                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] font-medium'
                            }`}
                          >
                            {item.icon}
                            <span className={`truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                              {item.label}
                            </span>
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

        {/* User Preferences & Account Controls */}
        <div className={`${sidebarCollapsed ? 'lg:p-2.5 p-3' : 'p-3'} border-t border-[var(--border-subtle)] space-y-2.5 shrink-0`}>
          {/* Independent Language, Calendar, Theme, Eye Comfort Switches */}
          <div className={`grid gap-1.5 ${sidebarCollapsed ? 'lg:grid-cols-1 grid-cols-2' : 'grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => setLanguage(prefs.language === 'fa' ? 'en' : 'fa')}
              title={t.controls.language}
              className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>
                {prefs.language === 'fa' ? 'English' : 'فارسی'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCalendar(prefs.calendar === 'jalali' ? 'gregorian' : 'jalali')}
              title={t.controls.calendar}
              className={`h-7 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap ${
                sidebarCollapsed ? 'lg:hidden' : ''
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{prefs.calendar === 'jalali' ? t.controls.jalali : t.controls.gregorian}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
              title={prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}
              className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              {prefs.theme === 'light' ? (
                <Moon className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Sun className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>
                {prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setEyeComfort(!prefs.eyeComfort)}
              title={t.controls.eyeComfortTooltip}
              className={`h-7 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                sidebarCollapsed ? 'lg:hidden' : ''
              } ${
                prefs.eyeComfort
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.controls.eyeComfort}</span>
            </button>
          </div>

          {user && (
            <div
              className={`pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 ${
                sidebarCollapsed ? 'lg:flex-col lg:justify-center justify-between' : 'justify-between'
              }`}
            >
              <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <div className="text-xs font-semibold truncate">{user.fullName}</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  {user.username} ·{' '}
                  {user.role === 'admin'
                    ? t.auth.roleAdmin
                    : user.role === 'operator'
                      ? t.auth.roleOperator
                      : t.auth.roleViewer}
                </div>
              </div>
              <div className={`flex items-center gap-0.5 shrink-0 ${sidebarCollapsed ? 'lg:flex-col' : ''}`}>
                <button
                  type="button"
                  onClick={() => setChangePwOpen(true)}
                  title={t.auth.changePassword}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)]"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={logout}
                  title={t.controls.logout}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--status-danger)]"
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
        {/* Strict 3-zone Top Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 lg:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-sm lg:text-base font-bold text-[var(--text-primary)] truncate">
              {activeTitle}
            </h2>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setProjectModalOpen(true)}
              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] font-semibold flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{activeProject?.name || t.brandFull}</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>{todayFormatted}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenAiAssistant && (
              <button
                type="button"
                onClick={onOpenAiAssistant}
                className="h-9 px-3 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
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
                className="h-9 px-3 sm:px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
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
