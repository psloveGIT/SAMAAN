import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Eye,
  FolderPlus,
  Globe,
  Lock,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import { resolveEmployerProfile } from '../shared/employers.ts';
import type { EmployerId, UserAccount } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';
import { EmployersStudioWorkspace } from './EmployersStudioView.tsx';
import { ProjectManagerModal } from './ProjectManagerModal.tsx';
import { SamaanLogo } from './SamaanLogo.tsx';

export const AuthGate: React.FC = () => {
  const {
    needsSetup,
    prefs,
    t,
    projects,
    employers,
    activeProjectId,
    activeProject,
    activeEmployer,
    switchProject,
    renameProject,
    setLanguage,
    setCalendar,
    setTheme,
    setEyeComfort,
    setAuthenticatedUser,
    notify,
  } = useApp();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingEmployer, setUpdatingEmployer] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [studioModalOpen, setStudioModalOpen] = useState(false);

  const isFa = prefs.language === 'fa';

  const handleEmployerChangeOnGate = async (nextEmployerId: EmployerId) => {
    if (!activeProject || !needsSetup) return;
    setUpdatingEmployer(true);
    try {
      await renameProject(activeProject.id, {
        name: activeProject.name,
        code: activeProject.code,
        employerId: nextEmployerId,
      });
      const chosen = employers.find((e) => e.id === nextEmployerId);
      notify(
        'info',
        isFa
          ? chosen
            ? `کارفرمای پروژه به «${chosen.nameFa}» تغییر یافت و فرم‌های اختصاصی آن بارگذاری شد.`
            : 'پروژه در حالت خام بدون کارفرما قرار گرفت.'
          : chosen
            ? `Project employer set to "${chosen.nameEn || chosen.nameFa}".`
            : 'Project reset to neutral template.',
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setUpdatingEmployer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      if (needsSetup) {
        const res = await apiRequest<{ user: UserAccount }>('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            fullName: fullName || username,
            preferences: prefs,
          }),
        });
        setAuthenticatedUser(res.user);
        notify(
          'success',
          isFa
            ? `حساب مدیر کل برای «${activeProject?.name || 'پروژه'}» ایجاد شد.`
            : `Administrator account created for "${activeProject?.name || 'project'}". Welcome to SAMAAN.`,
        );
      } else {
        const res = await apiRequest<{ user: UserAccount }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        setAuthenticatedUser(res.user);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Authentication failed';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] text-[var(--text-primary)] p-6">
      {/* Top Preference Controls */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-4">
        <SamaanLogo size="md" showWordmark />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLanguage(isFa ? 'en' : 'fa')}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{isFa ? 'English' : 'فارسی'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCalendar(prefs.calendar === 'jalali' ? 'gregorian' : 'jalali')}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{prefs.calendar === 'jalali' ? t.controls.jalali : t.controls.gregorian}</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
          >
            {prefs.theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            <span>{prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}</span>
          </button>

          <button
            type="button"
            onClick={() => setEyeComfort(!prefs.eyeComfort)}
            title={t.controls.eyeComfortTooltip}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              prefs.eyeComfort
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{t.controls.eyeComfort}</span>
          </button>
        </div>
      </div>

      {/* Login / Setup Card */}
      <div className="max-w-md w-full mx-auto my-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-7">
        {/* Initial Project & Employer Selector Box */}
        <div className="mb-5 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
              <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'انتخاب پروژه' : 'Select Project'}</span>
            </label>
            <button
              type="button"
              onClick={() => setProjectModalOpen(true)}
              className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>{isFa ? 'پروژه جدید / مدیریت' : 'New / Manage'}</span>
            </button>
          </div>
          <select
            value={activeProjectId}
            onChange={(e) => switchProject(e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          >
            {(projects.length > 0
              ? projects
              : [{ id: 'default', name: 'پروژه پیش‌فرض (اصلی)', createdAt: '' }]
            ).map((p) => {
              const emp = resolveEmployerProfile(p, employers);
              return (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ''} —{' '}
                  {emp.isConfigured
                    ? isFa
                      ? `کارفرما: ${emp.nameFa}`
                      : `Client: ${emp.nameEn}`
                    : isFa
                      ? 'حالت خام'
                      : 'Raw Default'}
                </option>
              );
            })}
          </select>

          {/* Employer Selector / Studio Trigger */}
          <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {isFa ? 'کارفرمای پروژه:' : 'Project Employer:'}
              </span>
              {needsSetup ? (
                <button
                  type="button"
                  onClick={() => setStudioModalOpen(true)}
                  className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                >
                  <Palette className="w-3 h-3" />
                  <span>{isFa ? 'افزودن / طراحی کارفرما' : 'Create / Design Employer'}</span>
                </button>
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">
                  {isFa ? '(قابل مدیریت پس از ورود)' : '(Editable after login)'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeEmployer.logos.length > 0 && (
                <div className="shrink-0 p-1 rounded border border-[var(--border-subtle)] bg-white">
                  <EmployerFormLogo employer={activeEmployer} height={28} />
                </div>
              )}
              {needsSetup ? (
                <select
                  value={activeEmployer.id}
                  disabled={updatingEmployer}
                  onChange={(e) => handleEmployerChangeOnGate(e.target.value)}
                  className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="">
                    {isFa ? 'بدون کارفرما (نرم‌افزار خام عمومی)' : 'No Employer (Neutral Raw Mode)'}
                  </option>
                  {employers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nameFa}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {activeEmployer.isConfigured
                      ? isFa
                        ? activeEmployer.nameFa
                        : activeEmployer.nameEn
                      : isFa
                        ? 'بدون کارفرما (قالب عمومی خام)'
                        : 'Neutral Template'}
                  </div>
                  {activeEmployer.companyFullName && (
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      {activeEmployer.companyFullName}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <SamaanLogo size="lg" showWordmark={false} />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-primary)]">
                {needsSetup ? <UserPlus className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span className="truncate">
                  {activeProject ? activeProject.name : t.brandFull}
                </span>
              </div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                {needsSetup ? t.auth.setupTitle : t.auth.loginTitle}
              </h1>
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {needsSetup ? t.auth.setupSubtitle : t.auth.loginSubtitle}
          </p>
          {isStaticFallbackMode() && (
            <div className="mt-3 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-secondary)]">
              {isFa
                ? 'حالت آفلاین مرورگر: داده‌های هر نیروگاه و قالب‌های کارفرمایان در حافظه IndexedDB مرورگر ذخیره می‌شوند.'
                : 'Offline Browser Mode: Plant data & employer templates persist in browser IndexedDB.'}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs font-medium text-[var(--status-danger)]">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsSetup && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.auth.fullName}
              </label>
              <input
                type="text"
                required
                dir={!fullName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t.auth.username}
            </label>
            <input
              type="text"
              required
              dir={isFa && !username ? 'rtl' : 'ltr'}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                isFa && !username ? 'text-right' : 'text-left'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t.auth.password}
            </label>
            <input
              type="password"
              required
              minLength={4}
              dir={isFa && !password ? 'rtl' : 'ltr'}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                isFa && !password ? 'text-right' : 'text-left'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <Lock className="w-4 h-4" />
            <span>{needsSetup ? t.auth.createAdmin : t.auth.signIn}</span>
          </button>
        </form>
      </div>

      <div className="max-w-5xl w-full mx-auto text-center text-xs text-[var(--text-muted)]">
        {isFa
          ? 'سمان (SAMAAN) — سامانه جامع و عمومی مدیریت انبارهای نیروگاهی'
          : 'SAMAAN — General-Purpose Power Plant Warehouse Management System'}
      </div>

      <ProjectManagerModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} />

      {studioModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'تعریف کارفرما، آپلود لوگوها و طراحی فرم‌ها' : 'Employer & Form Studio'}
              </span>
              <button
                type="button"
                onClick={() => setStudioModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <EmployersStudioWorkspace
                compact
                onAssignEmployer={async (empId) => {
                  await handleEmployerChangeOnGate(empId);
                  setStudioModalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
