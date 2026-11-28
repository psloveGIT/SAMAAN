import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Mail,
  MessageSquareCode,
  Moon,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { sanitizeIranPhoneInput, validateAndFormatIranPhone } from '../shared/iranPhone.ts';
import { normalizeDigits } from '../shared/jalali.ts';
import type { UserAccount } from '../shared/types.ts';
import { SamaanLogo } from './SamaanLogo.tsx';

interface CaptchaData {
  captchaId: string;
  svg: string;
  expiresInSeconds: number;
}

interface CatalogEmployer {
  id: string;
  nameFa: string;
  nameEn: string;
  shortName: string;
}

interface CatalogProject {
  id: string;
  name: string;
  code: string;
  employerId: string;
}

export const AuthGate: React.FC = () => {
  const {
    needsSetup,
    prefs,
    setLanguage,
    setTheme,
    setAuthenticatedUser,
    refreshAuth,
    notify,
  } = useApp();

  const isFa = prefs.language === 'fa';

  // Primary tabs: Tab 1 (ورود به سامانه) vs Tab 2 (ثبت‌نام و درخواست اشتراک)
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  // Login sub-mode: Mode A (رمز عبور) vs Mode B (ورود با پیامک)
  const [loginMode, setLoginMode] = useState<'password' | 'sms'>('password');

  // Shared SVG CAPTCHA state
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaText, setCaptchaText] = useState('');

  // Login Mode A state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login Mode B (SMS OTP) state
  const [smsPhone, setSmsPhone] = useState('');
  const [smsStep, setSmsStep] = useState<'phone' | 'code'>('phone');
  const [smsCode, setSmsCode] = useState('');
  const [smsCountdown, setSmsCountdown] = useState(0);

  // Offline TOTP 2FA challenge step (shared by Mode A and Mode B)
  const [totpChallengeToken, setTotpChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Tab 2 Registration state
  const [catalogEmployers, setCatalogEmployers] = useState<CatalogEmployer[]>([]);
  const [catalogProjects, setCatalogProjects] = useState<CatalogProject[]>([]);
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regEmployerId, setRegEmployerId] = useState('');
  const [regProjectIds, setRegProjectIds] = useState<string[]>([]);
  const [regStep, setRegStep] = useState<'form' | 'otp' | 'done'>('form');
  const [regOtpCode, setRegOtpCode] = useState('');
  const [regCountdown, setRegCountdown] = useState(0);
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  // First-run Superuser Bootstrap state (only shown if DB has 0 superusers and .env SUPERUSER_* not set)
  const [bootFirstName, setBootFirstName] = useState('');
  const [bootLastName, setBootLastName] = useState('');
  const [bootPhone, setBootPhone] = useState('');
  const [bootEmail, setBootEmail] = useState('');
  const [bootPassword, setBootPassword] = useState('');
  const [bootConfirm, setBootConfirm] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const data = await apiRequest<CaptchaData>('/api/auth/captcha');
      setCaptcha(data);
      setCaptchaText('');
    } catch {
      // Keep previous captcha if network error
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  const loadRegistrationCatalog = useCallback(async () => {
    try {
      const res = await apiRequest<{
        employers: CatalogEmployer[];
        projects: CatalogProject[];
      }>('/api/auth/registration-catalog');
      setCatalogEmployers(res.employers || []);
      setCatalogProjects(res.projects || []);
      if (!regEmployerId && res.employers?.length) {
        setRegEmployerId(res.employers[0].id);
      }
    } catch {
      // Ignore catalog fetch error
    }
  }, [regEmployerId]);

  useEffect(() => {
    if (!needsSetup) {
      void loadCaptcha();
      void loadRegistrationCatalog();
    }
  }, [needsSetup, loadCaptcha, loadRegistrationCatalog]);

  // Refresh CAPTCHA whenever user switches primary tabs or login mode
  useEffect(() => {
    if (!needsSetup) {
      setError('');
      void loadCaptcha();
    }
  }, [activeTab, loginMode, needsSetup, loadCaptcha]);

  // Countdown timers for SMS OTP resend
  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = setTimeout(() => setSmsCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);

  useEffect(() => {
    if (regCountdown <= 0) return;
    const timer = setTimeout(() => setRegCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [regCountdown]);

  const employerProjects = useMemo(
    () => catalogProjects.filter((p) => p.employerId === regEmployerId),
    [catalogProjects, regEmployerId],
  );

  // Reset selected projects when employer changes so selections always match chosen employer
  const handleEmployerChange = (nextEmployerId: string) => {
    setRegEmployerId(nextEmployerId);
    setRegProjectIds([]);
  };

  const toggleRequestedProject = (projectId: string) => {
    setRegProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  };

  const completeLogin = async (loggedInUser: UserAccount) => {
    setAuthenticatedUser(loggedInUser);
    await refreshAuth();
    notify(
      'success',
      isFa ? `خوش آمدید، ${loggedInUser.fullName}` : `Welcome back, ${loggedInUser.fullName}`,
    );
  };

  // ---------------- FIRST-RUN SUPERUSER BOOTSTRAP ----------------
  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const phoneCheck = validateAndFormatIranPhone(bootPhone);
    if (!phoneCheck.valid || phoneCheck.kind !== 'mobile') {
      setError(
        isFa
          ? 'شماره موبایل معتبر ایران وارد کنید (مانند 09123456789).'
          : 'Enter a valid Iranian mobile number (e.g. 09123456789).',
      );
      return;
    }
    if (bootPassword.length < 6) {
      setError(isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد.' : 'Password must be at least 6 characters.');
      return;
    }
    if (bootPassword !== bootConfirm) {
      setError(isFa ? 'رمز عبور و تکرار آن یکسان نیستند.' : 'Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/bootstrap-superuser', {
        method: 'POST',
        body: JSON.stringify({
          firstName: bootFirstName.trim(),
          lastName: bootLastName.trim(),
          phone: phoneCheck.normalized,
          email: bootEmail.trim().toLowerCase(),
          password: bootPassword,
          preferences: prefs,
        }),
      });
      await completeLogin(res.user);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------------- TAB 1 MODE A: PASSWORD LOGIN ----------------
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!captcha?.captchaId || !captchaText.trim()) {
      setError(isFa ? 'لطفاً کد امنیتی (کپچا) را وارد کنید.' : 'Please enter the security CAPTCHA.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{
        user?: UserAccount;
        requiresTotp?: boolean;
        challengeToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          captchaId: captcha.captchaId,
          captchaText: normalizeDigits(captchaText).trim(),
        }),
      });

      if (res.requiresTotp && res.challengeToken) {
        setTotpChallengeToken(res.challengeToken);
        setTotpCode('');
        return;
      }
      if (res.user) {
        await completeLogin(res.user);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(isFa ? 'خطا در ورود به سامانه' : 'Login failed');
      }
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  // ---------------- TAB 1 MODE B: SMS OTP LOGIN ----------------
  const handleRequestLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const phoneCheck = validateAndFormatIranPhone(smsPhone);
    if (!phoneCheck.valid || phoneCheck.kind !== 'mobile') {
      setError(
        isFa
          ? 'شماره موبایل معتبر ایران وارد کنید (مانند 09123456789).'
          : 'Enter a valid Iranian mobile number (e.g. 09123456789).',
      );
      return;
    }
    if (!captcha?.captchaId || !captchaText.trim()) {
      setError(isFa ? 'لطفاً کد امنیتی (کپچا) را وارد کنید.' : 'Please enter the security CAPTCHA.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        phone: string;
        expiresInSeconds: number;
        provider: string;
      }>('/api/auth/login/otp/request', {
        method: 'POST',
        body: JSON.stringify({
          phone: phoneCheck.normalized,
          captchaId: captcha.captchaId,
          captchaText: normalizeDigits(captchaText).trim(),
        }),
      });
      setSmsPhone(res.phone);
      setSmsCode('');
      setSmsStep('code');
      setSmsCountdown(60);
      notify(
        'info',
        isFa
          ? `کد تایید ۶ رقمی به شماره ${res.phone} ارسال شد.`
          : `Verification code sent to ${res.phone}.`,
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanCode = normalizeDigits(smsCode).replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError(isFa ? 'کد تایید پیامکی باید ۶ رقم باشد.' : 'Enter the 6-digit SMS code.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{
        user?: UserAccount;
        requiresTotp?: boolean;
        challengeToken?: string;
      }>('/api/auth/login/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: smsPhone,
          code: cleanCode,
        }),
      });
      if (res.requiresTotp && res.challengeToken) {
        setTotpChallengeToken(res.challengeToken);
        setTotpCode('');
        return;
      }
      if (res.user) {
        await completeLogin(res.user);
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------------- TOTP 2FA CHALLENGE VERIFICATION ----------------
  const handleVerifyTotpChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpChallengeToken) return;
    setError('');
    const clean = normalizeDigits(totpCode).replace(/\D/g, '');
    if (clean.length !== 6) {
      setError(isFa ? 'کد ۶ رقمی Google Authenticator را وارد کنید.' : 'Enter the 6-digit 2FA code.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ user: UserAccount }>('/api/auth/login/totp', {
        method: 'POST',
        body: JSON.stringify({
          challengeToken: totpChallengeToken,
          totpCode: clean,
        }),
      });
      setTotpChallengeToken(null);
      await completeLogin(res.user);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------------- TAB 2: REGISTRATION & SUBSCRIPTION REQUEST ----------------
  const handleRegisterRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneCheck = validateAndFormatIranPhone(regPhone);
    if (!phoneCheck.valid || phoneCheck.kind !== 'mobile') {
      setError(
        isFa
          ? 'شماره موبایل معتبر ایران وارد کنید (مانند 09123456789).'
          : 'Enter a valid Iranian mobile number (e.g. 09123456789).',
      );
      return;
    }
    if (regPassword.length < 6) {
      setError(isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد.' : 'Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError(isFa ? 'رمز عبور و تکرار آن مطابقت ندارند.' : 'Passwords do not match.');
      return;
    }
    if (!regEmployerId) {
      setError(isFa ? 'لطفاً کارفرمای مورد نظر را انتخاب کنید.' : 'Please select an employer.');
      return;
    }
    if (regProjectIds.length === 0) {
      setError(
        isFa
          ? 'حداقل یک پروژه مرتبط با کارفرمای انتخاب‌شده را تیک بزنید.'
          : 'Select at least one project for the chosen employer.',
      );
      return;
    }
    if (!captcha?.captchaId || !captchaText.trim()) {
      setError(isFa ? 'لطفاً کد امنیتی (کپچا) را وارد کنید.' : 'Please enter the security CAPTCHA.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; phone: string; expiresInSeconds: number }>(
        '/api/auth/register/request-otp',
        {
          method: 'POST',
          body: JSON.stringify({
            firstName: regFirstName.trim(),
            lastName: regLastName.trim(),
            phone: phoneCheck.normalized,
            email: regEmail.trim().toLowerCase(),
            password: regPassword,
            requestedEmployerId: regEmployerId,
            requestedProjectIds: regProjectIds,
            captchaId: captcha.captchaId,
            captchaText: normalizeDigits(captchaText).trim(),
          }),
        },
      );
      setRegPhone(res.phone);
      setRegOtpCode('');
      setRegStep('otp');
      setRegCountdown(60);
      notify(
        'info',
        isFa
          ? `کد تایید پیامکی برای احراز مالکیت به شماره ${res.phone} ارسال شد.`
          : `Verification SMS sent to ${res.phone}.`,
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanCode = normalizeDigits(regOtpCode).replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError(isFa ? 'کد تایید ۶ رقمی پیامکی را وارد کنید.' : 'Enter the 6-digit SMS code.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        status: string;
        messageFa: string;
        messageEn: string;
      }>('/api/auth/register/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
          phone: regPhone,
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          requestedEmployerId: regEmployerId,
          requestedProjectIds: regProjectIds,
          code: cleanCode,
        }),
      });
      setRegSuccessMsg(
        isFa
          ? res.messageFa ||
              'شماره موبایل شما تایید شد. درخواست اشتراک شما ثبت گردید و پس از تایید مدیر سامانه فعال می‌شود.'
          : res.messageEn,
      );
      setRegStep('done');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const renderCaptchaField = (testIdPrefix: string) => (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--text-secondary)]">
        {isFa ? 'کد امنیتی (کپچا) *' : 'Security CAPTCHA *'}
      </label>
      <div className="flex items-center gap-2">
        <div
          data-testid={`${testIdPrefix}-captcha-svg`}
          className="h-12 w-[156px] shrink-0 rounded-xl border border-[var(--border-subtle)] bg-slate-100 overflow-hidden flex items-center justify-center select-none"
          dangerouslySetInnerHTML={{
            __html: captcha?.svg || '',
          }}
        />
        <button
          type="button"
          data-testid={`${testIdPrefix}-captcha-refresh`}
          onClick={() => void loadCaptcha()}
          disabled={captchaLoading}
          title={isFa ? 'تازه‌سازی کد امنیتی' : 'Refresh CAPTCHA'}
          className="h-12 w-10 shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${captchaLoading ? 'animate-spin' : ''}`} />
        </button>
        <input
          type="text"
          required
          autoComplete="off"
          dir="ltr"
          maxLength={6}
          data-testid={`${testIdPrefix}-captcha-input`}
          value={captchaText}
          onChange={(e) => setCaptchaText(normalizeDigits(e.target.value))}
          placeholder={isFa ? 'کد تصویر' : 'Enter code'}
          className="flex-1 min-w-0 h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-sm font-mono font-bold tracking-[0.2em] uppercase placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:normal-case focus:outline-none focus:border-[var(--accent-primary)]"
        />
      </div>
    </div>
  );

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="min-h-[100dvh] bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col justify-center items-center p-4 sm:p-6"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
        {/* Top Brand Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 flex items-center justify-between gap-3">
          <SamaanLogo size="md" showWordmark showSubtitle />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLanguage(isFa ? 'en' : 'fa')}
              title={isFa ? 'English' : 'فارسی'}
              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'EN' : 'فا'}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(prefs.theme === 'light' ? 'dark' : 'light')}
              title={prefs.theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] flex items-center justify-center"
            >
              {prefs.theme === 'light' ? (
                <Moon className="w-3.5 h-3.5" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              )}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* First-Run Superuser Bootstrap (when no SUPERUSER is seeded via .env yet) */}
          {needsSetup ? (
            <form onSubmit={handleBootstrapSubmit} className="space-y-4" data-testid="superuser-bootstrap-form">
              <div className="p-3.5 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)]/50 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent-primary)]">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isFa
                      ? 'راه‌اندازی اولیه حساب مدیر ارشد سامانه (Superuser)'
                      : 'Initial Superuser Account Bootstrap'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {isFa
                    ? 'متغیرهای SUPERUSER_* در فایل محیطی (.env) تنظیم نشده‌اند. حساب مدیر ارشد سامانه را برای مدیریت پروژه‌ها، کارفرمایان و تایید درخواست‌های اشتراک ایجاد کنید.'
                    : 'SUPERUSER_* environment variables are not configured. Create the initial Superuser account to manage projects, employers, and approve user subscriptions.'}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام *' : 'First Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={bootFirstName}
                    onChange={(e) => setBootFirstName(e.target.value)}
                    placeholder={isFa ? 'مثال: محمدرضا' : 'First name'}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام خانوادگی *' : 'Last Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={bootLastName}
                    onChange={(e) => setBootLastName(e.target.value)}
                    placeholder={isFa ? 'مثال: ذوقی' : 'Last name'}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره موبایل *' : 'Mobile Number *'}
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={bootPhone}
                    onChange={(e) => setBootPhone(sanitizeIranPhoneInput(e.target.value))}
                    placeholder="09123456789"
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'ایمیل *' : 'Email *'}
                  </label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={bootEmail}
                    onChange={(e) => setBootEmail(e.target.value)}
                    placeholder="admin@samaanapp.ir"
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'رمز عبور (حداقل ۶ کاراکتر) *' : 'Password (min 6 chars) *'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    dir="ltr"
                    value={bootPassword}
                    onChange={(e) => setBootPassword(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'تکرار رمز عبور *' : 'Confirm Password *'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    dir="ltr"
                    value={bootConfirm}
                    onChange={(e) => setBootConfirm(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isFa ? 'ایجاد حساب مدیر ارشد و ورود' : 'Create Superuser & Sign In'}</span>
              </button>
            </form>
          ) : totpChallengeToken ? (
            /* ---------------- OFFLINE TOTP 2FA CHALLENGE STEP ---------------- */
            <form onSubmit={handleVerifyTotpChallenge} className="space-y-4" data-testid="totp-challenge-form">
              <div className="p-4 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)]/50 space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--accent-primary)]">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{isFa ? 'تایید دو مرحله‌ای (Google Authenticator)' : 'Two-Factor Verification'}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {isFa
                    ? 'کد ۶ رقمی نمایش‌داده‌شده در اپلیکیشن Google Authenticator یا Aegis را برای تکمیل ورود وارد کنید.'
                    : 'Enter the 6-digit code from Google Authenticator or Aegis to finish signing in.'}
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'کد ۶ رقمی تایید دو مرحله‌ای *' : '6-Digit TOTP Code *'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  dir="ltr"
                  maxLength={6}
                  autoFocus
                  data-testid="totp-challenge-input"
                  value={totpCode}
                  onChange={(e) => setTotpCode(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-xl font-mono font-bold tracking-[0.35em] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTotpChallengeToken(null);
                    setTotpCode('');
                    setError('');
                    void loadCaptcha();
                  }}
                  className="h-11 px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold hover:bg-[var(--bg-subtle)]"
                >
                  {isFa ? 'بازگشت' : 'Back'}
                </button>
                <button
                  type="submit"
                  disabled={busy || totpCode.length !== 6}
                  className="flex-1 h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold disabled:opacity-50"
                >
                  {isFa ? 'تایید کد و ورود به سامانه' : 'Verify & Sign In'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Primary Tabs: ورود به سامانه | ثبت‌نام و درخواست اشتراک */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <button
                  type="button"
                  data-testid="auth-tab-login"
                  onClick={() => {
                    setActiveTab('login');
                    setError('');
                  }}
                  className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'login'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ورود به سامانه' : 'Sign In'}</span>
                </button>
                <button
                  type="button"
                  data-testid="auth-tab-register"
                  onClick={() => {
                    setActiveTab('register');
                    setRegStep('form');
                    setError('');
                  }}
                  className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'register'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ثبت‌نام و درخواست اشتراک' : 'Register & Request Access'}</span>
                </button>
              </div>

              {error && (
                <div
                  data-testid="auth-error-banner"
                  className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium leading-relaxed"
                >
                  {error}
                </div>
              )}

              {/* ---------------- TAB 1: ورود به سامانه ---------------- */}
              {activeTab === 'login' && (
                <div className="space-y-4">
                  {/* Login Mode Toggle: Mode A (رمز عبور) | Mode B (ورود با پیامک) */}
                  <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
                    <button
                      type="button"
                      data-testid="login-mode-password"
                      onClick={() => {
                        setLoginMode('password');
                        setSmsStep('phone');
                        setError('');
                      }}
                      className={`flex-1 h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        loginMode === 'password'
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isFa ? 'ورود با رمز عبور' : 'Password Login'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="login-mode-sms"
                      onClick={() => {
                        setLoginMode('sms');
                        setSmsStep('phone');
                        setError('');
                      }}
                      className={`flex-1 h-9 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        loginMode === 'sms'
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      <MessageSquareCode className="w-3.5 h-3.5" />
                      <span>{isFa ? 'ورود با پیامک' : 'SMS OTP Login'}</span>
                    </button>
                  </div>

                  {/* Mode A: Phone or Email + Password + CAPTCHA */}
                  {loginMode === 'password' && (
                    <form onSubmit={handlePasswordLogin} className="space-y-3.5" data-testid="login-password-form">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'شماره موبایل یا ایمیل *' : 'Mobile Number or Email *'}
                        </label>
                        <div className="flex items-center h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)]">
                          <Mail className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <input
                            type="text"
                            required
                            autoComplete="username"
                            dir="ltr"
                            data-testid="login-identifier-input"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            placeholder="09123456789 / user@example.com"
                            className="flex-1 min-w-0 h-full bg-transparent text-sm focus:outline-none text-left"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'رمز عبور *' : 'Password *'}
                        </label>
                        <div className="flex items-center h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)]">
                          <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            autoComplete="current-password"
                            dir="ltr"
                            data-testid="login-password-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="flex-1 min-w-0 h-full bg-transparent text-sm focus:outline-none text-left"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            aria-label={isFa ? 'نمایش یا مخفی کردن رمز عبور' : 'Toggle password visibility'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {renderCaptchaField('login')}

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="login-submit-btn"
                        className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>{busy ? (isFa ? 'در حال بررسی...' : 'Signing in...') : (isFa ? 'ورود به سامانه' : 'Sign In')}</span>
                      </button>
                    </form>
                  )}

                  {/* Mode B: Iranian Pattern SMS OTP Login */}
                  {loginMode === 'sms' && smsStep === 'phone' && (
                    <form onSubmit={handleRequestLoginOtp} className="space-y-3.5" data-testid="login-sms-request-form">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'شماره موبایل ثبت‌شده *' : 'Registered Mobile Number *'}
                        </label>
                        <div className="flex items-center h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)]">
                          <Phone className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                          <input
                            type="tel"
                            required
                            dir="ltr"
                            data-testid="login-sms-phone-input"
                            value={smsPhone}
                            onChange={(e) => setSmsPhone(sanitizeIranPhoneInput(e.target.value))}
                            placeholder="09123456789"
                            className="flex-1 min-w-0 h-full bg-transparent text-sm font-mono focus:outline-none text-left"
                          />
                        </div>
                      </div>

                      {renderCaptchaField('sms-login')}

                      <button
                        type="submit"
                        disabled={busy}
                        data-testid="login-sms-send-btn"
                        className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <MessageSquareCode className="w-4 h-4" />
                        <span>{busy ? (isFa ? 'در حال ارسال...' : 'Sending...') : (isFa ? 'دریافت کد تایید پیامکی' : 'Send SMS Code')}</span>
                      </button>
                    </form>
                  )}

                  {loginMode === 'sms' && smsStep === 'code' && (
                    <form onSubmit={handleVerifyLoginOtp} className="space-y-3.5" data-testid="login-sms-verify-form">
                      <div className="p-3 rounded-xl bg-[var(--accent-soft)]/50 border border-[var(--accent-primary)]/25 text-xs text-[var(--text-secondary)]">
                        {isFa
                          ? `کد تایید ۶ رقمی به شماره ${smsPhone} ارسال شد. لطفاً کد دریافتی را وارد کنید.`
                          : `Enter the 6-digit SMS code sent to ${smsPhone}.`}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'کد تایید پیامکی *' : 'SMS Verification Code *'}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                          dir="ltr"
                          maxLength={6}
                          autoFocus
                          data-testid="login-sms-code-input"
                          value={smsCode}
                          onChange={(e) => setSmsCode(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-xl font-mono font-bold tracking-[0.35em] focus:outline-none focus:border-[var(--accent-primary)]"
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                        <button
                          type="button"
                          onClick={() => {
                            setSmsStep('phone');
                            setSmsCode('');
                            void loadCaptcha();
                          }}
                          className="text-[var(--accent-primary)] font-semibold hover:underline"
                        >
                          {isFa ? 'تغییر شماره موبایل / ارسال مجدد' : 'Change number / Resend'}
                        </button>
                        {smsCountdown > 0 && (
                          <span className="tabular-nums">
                            {isFa ? `${smsCountdown} ثانیه تا ارسال مجدد` : `Resend in ${smsCountdown}s`}
                          </span>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={busy || smsCode.length !== 6}
                        data-testid="login-sms-verify-btn"
                        className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold disabled:opacity-50"
                      >
                        {isFa ? 'تایید کد و ورود به سامانه' : 'Verify Code & Sign In'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* ---------------- TAB 2: ثبت‌نام و درخواست اشتراک ---------------- */}
              {activeTab === 'register' && regStep === 'form' && (
                <form onSubmit={handleRegisterRequestOtp} className="space-y-3.5" data-testid="register-form">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نام *' : 'First Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        data-testid="reg-first-name-input"
                        value={regFirstName}
                        onChange={(e) => setRegFirstName(e.target.value)}
                        placeholder={isFa ? 'مثال: علی' : 'First name'}
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نام خانوادگی *' : 'Last Name *'}
                      </label>
                      <input
                        type="text"
                        required
                        data-testid="reg-last-name-input"
                        value={regLastName}
                        onChange={(e) => setRegLastName(e.target.value)}
                        placeholder={isFa ? 'مثال: رضایی' : 'Last name'}
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شماره موبایل *' : 'Mobile Number *'}
                      </label>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        data-testid="reg-phone-input"
                        value={regPhone}
                        onChange={(e) => setRegPhone(sanitizeIranPhoneInput(e.target.value))}
                        placeholder="09123456789"
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'ایمیل *' : 'Email *'}
                      </label>
                      <input
                        type="email"
                        required
                        dir="ltr"
                        data-testid="reg-email-input"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="name@company.ir"
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'رمز عبور (حداقل ۶ کاراکتر) *' : 'Password (min 6 chars) *'}
                      </label>
                      <div className="flex items-center h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 gap-1.5 focus-within:border-[var(--accent-primary)]">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          dir="ltr"
                          data-testid="reg-password-input"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((v) => !v)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'تکرار رمز عبور *' : 'Confirm Password *'}
                      </label>
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        dir="ltr"
                        data-testid="reg-confirm-password-input"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  {/* Dependent Employer -> Multi-Project Selection */}
                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 space-y-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span>{isFa ? 'انتخاب کارفرمای مورد نظر *' : 'Select Requested Employer *'}</span>
                      </label>
                      <select
                        required
                        data-testid="reg-employer-select"
                        value={regEmployerId}
                        onChange={(e) => handleEmployerChange(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold focus:outline-none focus:border-[var(--accent-primary)]"
                      >
                        {catalogEmployers.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {isFa ? emp.nameFa : emp.nameEn} {emp.shortName ? `(${emp.shortName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                          <Users className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>
                            {isFa
                              ? 'انتخاب یک یا چند پروژه مورد نظر *'
                              : 'Select One or More Requested Projects *'}
                          </span>
                        </label>
                        <span className="text-[10.5px] text-[var(--accent-primary)] font-semibold tabular-nums">
                          {isFa
                            ? `${regProjectIds.length} مورد انتخاب‌شده`
                            : `${regProjectIds.length} selected`}
                        </span>
                      </div>

                      {employerProjects.length === 0 ? (
                        <div className="p-2.5 rounded-lg border border-dashed border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] text-center">
                          {isFa
                            ? 'پروژه‌ای برای این کارفرما ثبت نشده است.'
                            : 'No projects are registered for this employer.'}
                        </div>
                      ) : (
                        <div
                          className="max-h-36 overflow-y-auto space-y-1.5 pe-1"
                          data-testid="reg-projects-checkbox-list"
                        >
                          {employerProjects.map((proj) => {
                            const checked = regProjectIds.includes(proj.id);
                            return (
                              <label
                                key={proj.id}
                                className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                  checked
                                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70 font-semibold text-[var(--text-primary)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    data-testid={`reg-project-checkbox-${proj.id}`}
                                    checked={checked}
                                    onChange={() => toggleRequestedProject(proj.id)}
                                    className="w-4 h-4 accent-[var(--accent-primary)] shrink-0"
                                  />
                                  <span className="truncate">{proj.name}</span>
                                </span>
                                {proj.code && (
                                  <span dir="ltr" className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                                    {proj.code}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {renderCaptchaField('register')}

                  <button
                    type="submit"
                    disabled={busy}
                    data-testid="reg-request-otp-btn"
                    className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <MessageSquareCode className="w-4 h-4" />
                    <span>
                      {busy
                        ? isFa
                          ? 'در حال ارسال کد تایید...'
                          : 'Sending verification code...'
                        : isFa
                          ? 'ارسال کد تایید پیامکی و ادامه'
                          : 'Send SMS Verification Code'}
                    </span>
                  </button>
                </form>
              )}

              {activeTab === 'register' && regStep === 'otp' && (
                <form onSubmit={handleRegisterVerifyOtp} className="space-y-4" data-testid="register-otp-form">
                  <div className="p-3.5 rounded-xl bg-[var(--accent-soft)]/50 border border-[var(--accent-primary)]/30 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {isFa
                      ? `برای تایید مالکیت شماره موبایل، کد ۶ رقمی به شماره ${regPhone} پیامک شد. کد را در کادر زیر وارد کنید.`
                      : `A 6-digit verification code was sent to ${regPhone}. Enter it below to complete your subscription request.`}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'کد تایید پیامکی *' : 'SMS Verification Code *'}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      dir="ltr"
                      maxLength={6}
                      autoFocus
                      data-testid="reg-otp-input"
                      value={regOtpCode}
                      onChange={(e) => setRegOtpCode(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-xl font-mono font-bold tracking-[0.35em] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <button
                      type="button"
                      onClick={() => {
                        setRegStep('form');
                        setRegOtpCode('');
                        void loadCaptcha();
                      }}
                      className="text-[var(--accent-primary)] font-semibold hover:underline"
                    >
                      {isFa ? 'ویرایش اطلاعات / ارسال مجدد' : 'Edit details / Resend'}
                    </button>
                    {regCountdown > 0 && (
                      <span className="tabular-nums">
                        {isFa ? `${regCountdown} ثانیه تا ارسال مجدد` : `Resend in ${regCountdown}s`}
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={busy || regOtpCode.length !== 6}
                    data-testid="reg-verify-otp-btn"
                    className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-sm font-bold disabled:opacity-50"
                  >
                    {isFa ? 'تایید شماره موبایل و ثبت درخواست اشتراک' : 'Verify Phone & Submit Request'}
                  </button>
                </form>
              )}

              {activeTab === 'register' && regStep === 'done' && (
                <div className="space-y-4 py-2 text-center" data-testid="register-success-box">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)] leading-relaxed px-2">
                    {regSuccessMsg}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('login');
                      setRegStep('form');
                      setRegFirstName('');
                      setRegLastName('');
                      setRegPhone('');
                      setRegEmail('');
                      setRegPassword('');
                      setRegConfirmPassword('');
                      setRegProjectIds([]);
                      setRegOtpCode('');
                      setError('');
                    }}
                    className="h-10 px-6 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-bold"
                  >
                    {isFa ? 'بازگشت به صفحه ورود' : 'Back to Sign In'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
