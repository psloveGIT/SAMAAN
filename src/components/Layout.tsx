import React from 'react';
import {
  BarChart3,
  Boxes,
  Calendar,
  Eye,
  FileSpreadsheet,
  FolderTree,
  Globe,
  HardDriveDownload,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Shield,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { getTodayIso } from '../shared/jalali.ts';
import { SamaanLogo } from './SamaanLogo.tsx';

export type NavTabKey =
  | 'dashboard'
  | 'general'
  | 'detailed'
  | 'transit'
  | 'search'
  | 'categories'
  | 'importCsv'
  | 'usersAudit'
  | 'backup';

interface LayoutProps {
  activeTab: NavTabKey;
  onTabChange: (tab: NavTabKey) => void;
  onOpenNewPacking: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  onOpenNewPacking,
  children,
}) => {
  const {
    user,
    prefs,
    t,
    setLanguage,
    setCalendar,
    setTheme,
    setEyeComfort,
    logout,
    formatDate,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navItems: { key: NavTabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: t.nav.dashboard, icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'general', label: t.nav.general, icon: <Boxes className="w-4 h-4" /> },
    { key: 'detailed', label: t.nav.detailed, icon: <ListChecks className="w-4 h-4" /> },
    { key: 'transit', label: t.nav.transit, icon: <Truck className="w-4 h-4" /> },
    { key: 'search', label: t.nav.search, icon: <Search className="w-4 h-4" /> },
    { key: 'categories', label: t.nav.categories, icon: <FolderTree className="w-4 h-4" /> },
    { key: 'importCsv', label: t.nav.importCsv, icon: <FileSpreadsheet className="w-4 h-4" /> },
    { key: 'usersAudit', label: t.nav.usersAudit, icon: <Shield className="w-4 h-4" /> },
    { key: 'backup', label: t.nav.backup, icon: <HardDriveDownload className="w-4 h-4" /> },
  ];

  const activeTitle = navItems.find((n) => n.key === activeTab)?.label || t.nav.dashboard;
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const todayFormatted = formatDate(getTodayIso());

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed lg:sticky top-0 z-50 h-screen w-64 shrink-0 border-e border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen
            ? 'translate-x-0'
            : prefs.language === 'fa'
              ? 'translate-x-full lg:translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 overflow-y-auto">
          <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-[var(--border-subtle)]">
            <SamaanLogo size="md" showWordmark showSubtitle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onTabChange(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full h-10 px-3 rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Preferences & Account Controls */}
        <div className="p-4 border-t border-[var(--border-subtle)] space-y-3">
          {/* Independent Language, Calendar, Theme, Eye Comfort Switches */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setLanguage(prefs.language === 'fa' ? 'en' : 'fa')}
              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{prefs.language === 'fa' ? 'English' : 'فارسی'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCalendar(prefs.calendar === 'jalali' ? 'gregorian' : 'jalali')}
              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{prefs.calendar === 'jalali' ? t.controls.jalali : t.controls.gregorian}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
            >
              {prefs.theme === 'light' ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5" />
              )}
              <span>{prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}</span>
            </button>

            <button
              type="button"
              onClick={() => setEyeComfort(!prefs.eyeComfort)}
              title={t.controls.eyeComfortTooltip}
              className={`h-8 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                prefs.eyeComfort
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="truncate">{t.controls.eyeComfort}</span>
            </button>
          </div>

          {user && (
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div className="min-w-0">
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
              <button
                type="button"
                onClick={logout}
                title={t.controls.logout}
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--status-danger)] shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Strict 3-zone Top Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 lg:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-8">
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
            <span>{t.brandFull}</span>
            <span aria-hidden="true">·</span>
            <span>{todayFormatted}</span>
          </div>

          <div className="flex items-center shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={onOpenNewPacking}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{t.controls.newPacking}</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
