import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  Eye,
  FolderPlus,
  Globe,
  Lock,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import { APP_VERSION } from '../shared/appVersion.ts';
import {
  DEFAULT_EMPLOYER_ID,
  isBuiltInEmployerId,
  resolveEmployerProfile,
} from '../shared/employers.ts';
import type { EmployerId, UserAccount } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';
import { EmployersStudioWorkspace } from './EmployersStudioView.tsx';
import { ProjectManagerModal } from './ProjectManagerModal.tsx';
import { SamaanLogo } from './SamaanLogo.tsx';

function isPlaceholderProjectName(name: string | undefined): boolean {
  const clean = (name || '').trim();
  return !clean || clean === 'پروژه پیش‌فرض' || clean === 'پروژه پیش‌فرض (اصلی)';
}

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

  const [selectedEmployerId, setSelectedEmployerId] = useState<EmployerId>(
    () => activeProject?.employerId || DEFAULT_EMPLOYER_ID,
  );
  const [projectName, setProjectName] = useState<string>(() =>
    isPlaceholderProjectName(activeProject?.name) ? '' : activeProject?.name || '',
  );
  const [contractRef, setContractRef] = useState<string>(() => activeProject?.contractRef || '');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newEmployerModalOpen, setNewEmployerModalOpen] = useState(false);

  const isFa = prefs.language === 'fa';

  useEffect(() => {
    if (!activeProject) return;
    setSelectedEmployerId(activeProject.employerId || DEFAULT_EMPLOYER_ID);
    setProjectName(isPlaceholderProjectName(activeProject.name) ? '' : activeProject.name);
    setContractRef(activeProject.contractRef || '');
  }, [activeProject?.id]);

  const orderedEmployers = useMemo(() => {
    const builtIns = employers.filter((e) => e.isBuiltIn || isBuiltInEmployerId(e.id));
    const customs = employers.filter((e) => !e.isBuiltIn && !isBuiltInEmployerId(e.id));
    return [...builtIns, ...customs];
  }, [employers]);

  const selectedEmployerObj = useMemo(
    () => orderedEmployers.find((e) => e.id === selectedEmployerId) || orderedEmployers[0],
    [orderedEmployers, selectedEmployerId],
  );

  const handleSelectEmployerCard = async (empId: EmployerId) => {
    setSelectedEmployerId(empId);
    if (!activeProject || !needsSetup) return;
    try {
      await renameProject(activeProject.id, {
        name: projectName.trim() || activeProject.name,
        code: activeProject.code,
        contractRef: contractRef.trim() || undefined,
        employerId: empId,
      });
    } catch {
      // Final persistence happens on submit
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (needsSetup) {
      const cleanProjectName = projectName.trim();
      if (!cleanProjectName) {
        setErrorMsg(
          isFa
            ? 'لطفاً نام پروژه را وارد کنید (مثلاً: نیروگاه نکا).'
            : 'Please enter the project name (e.g. Neka Power Plant).',
        );
        return;
      }
      if (!selectedEmployerId) {
        setErrorMsg(
          isFa
            ? 'لطفاً یکی از کارفرماهای پیش‌فرض را انتخاب کنید یا کارفرمای جدید تعریف نمایید.'
            : 'Please select an employer or define a new one.',
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (needsSetup) {
        const cleanProjectName = projectName.trim();
        const cleanContractRef = contractRef.trim() || undefined;
        if (activeProject) {
          await renameProject(activeProject.id, {
            name: cleanProjectName,
            code: activeProject.code,
            contractRef: cleanContractRef,
            employerId: selectedEmployerId,
          });
        }
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
            ? `پروژه «${cleanProjectName}» با کارفرمای «${selectedEmployerObj?.nameFa || ''}» راه‌اندازی شد.`
            : `Project "${cleanProjectName}" initialized.`,
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
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg-canvas)] text-[var(--text-primary)] p-3.5 sm:p-6">
      {/* Top Preference Controls */}
      <header className="max-w-4xl w-full mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
        <SamaanLogo size="sm" showWordmark />

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLanguage(isFa ? 'en' : 'fa')}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] sm:text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{isFa ? 'English' : 'فارسی'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCalendar(prefs.calendar === 'jalali' ? 'gregorian' : 'jalali')}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] sm:text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{prefs.calendar === 'jalali' ? t.controls.jalali : t.controls.gregorian}</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] sm:text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap transition-colors"
          >
            {prefs.theme === 'light' ? (
              <Moon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{prefs.theme === 'light' ? t.controls.darkMode : t.controls.lightMode}</span>
          </button>

          <button
            type="button"
            onClick={() => setEyeComfort(!prefs.eyeComfort)}
            title={t.controls.eyeComfortTooltip}
            className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border text-[11px] sm:text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              prefs.eyeComfort
                ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">{t.controls.eyeComfort}</span>
          </button>
        </div>
      </header>

      {/* Main Auth / Initial Setup Card */}
      <main className="w-full max-w-4xl mx-auto my-4 sm:my-6">
        {needsSetup ? (
          <form
            onSubmit={handleSubmit}
            className="samaan-animate-in rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-float)] overflow-hidden"
          >
            {/* Compact Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  {isFa ? 'راه‌اندازی اولیه سامانه' : 'Initial System Setup'}
                </h1>
                <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5">
                  {isFa
                    ? 'کارفرما و نام پروژه را مشخص کرده و حساب مدیر سامانه را ایجاد کنید.'
                    : 'Choose the employer, enter the project name, and create the admin account.'}
                </p>
              </div>

              {projects.length > 1 && (
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(true)}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 whitespace-nowrap"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'مدیریت پروژه‌ها' : 'Manage Projects'}</span>
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs font-medium text-[var(--status-danger)]">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[var(--border-subtle)]">
              {/* Step 1: Compact Employer Selector + Project Info */}
              <div className="lg:col-span-7 p-4 sm:p-5 space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xs sm:text-[13px] font-bold text-[var(--text-primary)]">
                      {isFa ? '۱. انتخاب کارفرمای پروژه' : '1. Project Employer'}
                    </h2>
                    <button
                      type="button"
                      data-testid="auth-define-new-employer-btn"
                      onClick={() => setNewEmployerModalOpen(true)}
                      className="h-7 px-2.5 rounded-lg border border-dashed border-[var(--accent-primary)]/60 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isFa ? 'تعریف کارفرمای جدید' : 'New Employer'}</span>
                    </button>
                  </div>

                  {/* Sleek Compact Selectable Employer Options (No oversized icons) */}
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    role="radiogroup"
                    aria-label={isFa ? 'انتخاب کارفرما' : 'Select Employer'}
                  >
                    {orderedEmployers.map((emp) => {
                      const isSelected = selectedEmployerId === emp.id;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          data-testid={`auth-employer-card-${emp.id}`}
                          onClick={() => void handleSelectEmployerCard(emp.id)}
                          className={`group h-11 px-3 rounded-xl border text-start transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]/25'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                                  : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {emp.nameFa}
                            </span>
                          </div>
                          {emp.shortName && (
                            <span
                              dir="ltr"
                              className={`font-mono text-[11px] font-semibold shrink-0 ${
                                isSelected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {emp.shortName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Project Name & Optional Contract Reference */}
                <div className="pt-3.5 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="auth-project-name"
                      className="block text-[11px] font-semibold text-[var(--text-primary)] mb-1"
                    >
                      {isFa ? 'نام پروژه *' : 'Project Name *'}
                    </label>
                    <input
                      id="auth-project-name"
                      type="text"
                      required
                      data-testid="auth-project-name-input"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder={isFa ? 'مثلاً: نیروگاه نکا' : 'e.g. Neka Power Plant'}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="auth-contract-ref"
                      className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      {isFa ? 'کد / شماره قرارداد مرجع (اختیاری)' : 'Reference Contract No. (Optional)'}
                    </label>
                    <input
                      id="auth-contract-ref"
                      type="text"
                      dir="ltr"
                      data-testid="auth-contract-ref-input"
                      value={contractRef}
                      onChange={(e) => setContractRef(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs sm:text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Admin Account Creation */}
              <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-4 bg-[var(--bg-canvas)]/35">
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <h2 className="text-xs sm:text-[13px] font-bold text-[var(--text-primary)]">
                      {isFa ? '۲. ایجاد حساب مدیر سامانه' : '2. Administrator Account'}
                    </h2>
                  </div>

                  {isStaticFallbackMode() && (
                    <div className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {isFa
                        ? 'حالت اجرای محلی مرورگر: اطلاعات پروژه و کارفرما در حافظه مرورگر ذخیره می‌شود.'
                        : 'Local Browser Mode: Project and employer data persist in browser storage.'}
                    </div>
                  )}

                  <div>
                    <label htmlFor="setup-fullname" className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      {t.auth.fullName}
                    </label>
                    <input
                      id="setup-fullname"
                      type="text"
                      required
                      dir={!fullName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm text-[var(--text-primary)] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                    <div>
                      <label htmlFor="setup-username" className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.auth.username}
                      </label>
                      <input
                        id="setup-username"
                        type="text"
                        required
                        dir={isFa && !username ? 'rtl' : 'ltr'}
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                          isFa && !username ? 'text-right' : 'text-left'
                        }`}
                      />
                    </div>

                    <div>
                      <label htmlFor="setup-password" className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.auth.password}
                      </label>
                      <input
                        id="setup-password"
                        type="password"
                        required
                        minLength={4}
                        dir={isFa && !password ? 'rtl' : 'ltr'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                          isFa && !password ? 'text-right' : 'text-left'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {selectedEmployerObj && (
                    <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between gap-2 px-0.5">
                      <span>{isFa ? 'کارفرمای انتخاب‌شده:' : 'Selected Employer:'}</span>
                      <span className="font-bold text-[var(--text-primary)] truncate">
                        {selectedEmployerObj.nameFa}
                        {selectedEmployerObj.shortName ? ` (${selectedEmployerObj.shortName})` : ''}
                      </span>
                    </div>
                  )}

                  <button
                    type="submit"
                    data-testid="auth-submit-btn"
                    disabled={submitting}
                    className="w-full h-10 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isFa ? 'راه‌اندازی پروژه و ورود به سامانه' : 'Initialize Project & Sign In'}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          /* Returning Login Card */
          <div className="samaan-animate-in max-w-[440px] w-full mx-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-float)] p-5 sm:p-7">
            {/* Active Project & Employer Summary */}
            <div className="mb-5 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 space-y-2.5">
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
                  : [{ id: 'default', name: 'پروژه پیش‌فرض', employerId: DEFAULT_EMPLOYER_ID, createdAt: '' }]
                ).map((p) => {
                  const emp = resolveEmployerProfile(p, employers);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {emp.isConfigured ? ` — ${emp.nameFa} (${emp.shortName})` : ''}
                    </option>
                  );
                })}
              </select>

              {activeEmployer.isConfigured && (
                <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2.5">
                  {activeEmployer.logos.length > 0 && (
                    <div className="shrink-0 px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] bg-white">
                      <EmployerFormLogo employer={activeEmployer} height={24} maxWidth={92} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {activeEmployer.nameFa} · <span dir="ltr" className="font-mono text-[var(--accent-primary)]">{activeEmployer.shortName}</span>
                    </div>
                    {activeProject?.contractRef && (
                      <div className="text-[10.5px] text-[var(--text-muted)] truncate">
                        {isFa ? `قرارداد: ${activeProject.contractRef}` : `Contract: ${activeProject.contractRef}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="flex items-center gap-2.5 mb-2">
                <SamaanLogo size="md" showWordmark={false} />
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="truncate">{activeProject ? activeProject.name : t.brandFull}</span>
                  </div>
                  <h1 className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{t.auth.loginTitle}</h1>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">{t.auth.loginSubtitle}</p>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs font-medium text-[var(--status-danger)]">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="login-username" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.auth.username}
                </label>
                <input
                  id="login-username"
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
                <label htmlFor="login-password" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.auth.password}
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  minLength={4}
                  dir={isFa && !password ? 'rtl' : 'ltr'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                    isFa && !password ? 'text-right' : 'text-left'
                  }`}
                />
              </div>

              <button
                type="submit"
                data-testid="auth-submit-btn"
                disabled={submitting}
                className="w-full h-10 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                <span>{t.auth.signIn}</span>
              </button>
            </form>
          </div>
        )}
      </main>

      <footer
        data-testid="auth-footer-version"
        className="max-w-4xl w-full mx-auto text-center text-[11px] sm:text-xs text-[var(--text-muted)]"
      >
        {isFa ? (
          <>
            سمان — سامانه جامع مدیریت انبارهای نیروگاهی ورژن{' '}
            <span dir="ltr" className="inline-block font-mono tabular-nums">
              {APP_VERSION}
            </span>
          </>
        ) : (
          <>
            SAMAAN — Power Plant Warehouse Management System v
            <span dir="ltr" className="inline-block font-mono tabular-nums">
              {APP_VERSION}
            </span>
          </>
        )}
      </footer>

      <ProjectManagerModal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} />

      {/* Define New Employer Modal directly from Login / Onboarding */}
      {newEmployerModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {isFa ? 'تعریف کارفرمای جدید (لوگو و آپلود فرم)' : 'Define New Employer (Logo & Form Upload)'}
                </span>
              </div>
              <button
                type="button"
                aria-label={isFa ? 'بستن' : 'Close'}
                onClick={() => setNewEmployerModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 sm:p-5 overflow-y-auto">
              <EmployersStudioWorkspace
                compact
                initialMode="new"
                onAssignEmployer={async (empId) => {
                  await handleSelectEmployerCard(empId);
                  setNewEmployerModalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
