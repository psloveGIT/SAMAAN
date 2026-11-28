import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  QrCode,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { normalizeDigits } from '../shared/jalali.ts';
import type { UserAccount } from '../shared/types.ts';

interface TotpSecurityModalProps {
  open: boolean;
  onClose: () => void;
}

export const TotpSecurityModal: React.FC<TotpSecurityModalProps> = ({ open, onClose }) => {
  const { prefs, user, setAuthenticatedUser, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [step, setStep] = useState<'overview' | 'setup' | 'disable'>('overview');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStep('overview');
      setQrDataUrl('');
      setManualSecret('');
      setTotpCode('');
      setCurrentPassword('');
      setShowPassword(false);
      setError('');
      setBusy(false);
    }
  }, [open]);

  if (!open || !user) return null;

  const isEnabled = Boolean(user.totpEnabled);

  const handleStartSetup = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{ qrDataUrl: string; secret: string; otpauthUri: string }>(
        '/api/auth/totp/setup',
        { method: 'POST' },
      );
      setQrDataUrl(res.qrDataUrl);
      setManualSecret(res.secret);
      setTotpCode('');
      setStep('setup');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const clean = normalizeDigits(totpCode).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setError(isFa ? 'کد ۶ رقمی معتبر وارد کنید.' : 'Enter a valid 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; user: UserAccount }>('/api/auth/totp/enable', {
        method: 'POST',
        body: JSON.stringify({ code: clean }),
      });
      setAuthenticatedUser(res.user);
      notify(
        'success',
        isFa
          ? 'احراز هویت دو مرحله‌ای (Google Authenticator / Aegis) با موفقیت فعال شد.'
          : 'Two-factor authentication (TOTP) enabled.',
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const clean = normalizeDigits(totpCode).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setError(isFa ? 'کد ۶ رقمی معتبر وارد کنید.' : 'Enter a valid 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; user: UserAccount }>('/api/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, code: clean }),
      });
      setAuthenticatedUser(res.user);
      notify(
        'info',
        isFa ? 'احراز هویت دو مرحله‌ای غیرفعال شد.' : 'Two-factor authentication disabled.',
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCopySecret = async () => {
    if (!manualSecret) return;
    try {
      await navigator.clipboard.writeText(manualSecret);
      notify('info', isFa ? 'کلید مخفی کپی شد.' : 'Secret key copied.');
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="totp-security-modal"
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {isFa ? 'احراز هویت دو مرحله‌ای آفلاین (2FA)' : 'Offline Two-Factor Auth (TOTP 2FA)'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Google Authenticator / Aegis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
            {error}
          </div>
        )}

        {step === 'overview' && (
          <div className="space-y-4">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                isEnabled
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                {isEnabled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                )}
                <span>
                  {isEnabled
                    ? isFa
                      ? 'وضعیت فعلی: فعال و محافظت‌شده'
                      : 'Status: Enabled & Protected'
                    : isFa
                      ? 'وضعیت فعلی: غیرفعال'
                      : 'Status: Disabled'}
                </span>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? 'با فعال‌سازی احراز هویت دو مرحله‌ای آفلاین، علاوه بر رمز عبور یا پیامک، کد ۶ رقمی تولیدشده توسط اپلیکیشن‌های Google Authenticator یا Aegis (بدون نیاز به اینترنت) هنگام ورود درخواست می‌شود. کلید مخفی به صورت رمزنگاری‌شده (AES-256-GCM) ذخیره می‌گردد.'
                : 'When enabled, a 6-digit offline TOTP code from Google Authenticator or Aegis is required on login. Secrets are encrypted at rest with AES-256-GCM.'}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'بستن' : 'Close'}
              </button>
              {isEnabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setStep('disable');
                  }}
                  className="h-9 px-4 rounded-xl bg-[var(--status-danger)] text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  <span>{isFa ? 'غیرفعال‌سازی 2FA' : 'Disable 2FA'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleStartSetup}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{isFa ? 'راه‌اندازی و نمایش QR Code' : 'Setup & Show QR Code'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'setup' && (
          <form onSubmit={handleConfirmEnable} className="space-y-4">
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? '۱. بارکد زیر را در اپلیکیشن Google Authenticator یا Aegis اسکن کنید (کاملاً آفلاین):'
                : '1. Scan this QR code in Google Authenticator or Aegis:'}
            </div>

            {qrDataUrl && (
              <div className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-[var(--border-subtle)] bg-white">
                <img
                  src={qrDataUrl}
                  alt="TOTP QR Code"
                  className="w-48 h-48 object-contain"
                />
                <div className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-800">
                  <code dir="ltr" className="text-[11px] font-mono break-all select-all">
                    {manualSecret}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    title={isFa ? 'کپی کلید دستی' : 'Copy secret'}
                    className="p-1 rounded hover:bg-slate-200 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? '۲. کد ۶ رقمی نمایش‌داده‌شده در اپلیکیشن را وارد کنید *' : '2. Enter 6-digit code from your app *'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                dir="ltr"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full h-11 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-lg font-mono tracking-[0.35em] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep('overview')}
                className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium"
              >
                {isFa ? 'بازگشت' : 'Back'}
              </button>
              <button
                type="submit"
                disabled={busy || totpCode.length !== 6}
                className="h-9 px-5 rounded-xl bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
              >
                {isFa ? 'تایید و فعال‌سازی' : 'Verify & Enable'}
              </button>
            </div>
          </form>
        )}

        {step === 'disable' && (
          <form onSubmit={handleConfirmDisable} className="space-y-3.5">
            <p className="text-xs text-[var(--text-secondary)]">
              {isFa
                ? 'برای غیرفعال‌سازی احراز هویت دو مرحله‌ای، رمز عبور فعلی و کد ۶ رقمی فعلی اپلیکیشن را وارد کنید.'
                : 'Enter your current password and current 6-digit authenticator code to disable 2FA.'}
            </p>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'رمز عبور فعلی *' : 'Current Password *'}
              </label>
              <div className="flex items-center h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2">
                <KeyRound className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'کد ۶ رقمی Google Authenticator *' : '6-Digit Authenticator Code *'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                dir="ltr"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full h-11 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-center text-lg font-mono tracking-[0.35em] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('overview')}
                className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busy || totpCode.length !== 6 || !currentPassword}
                className="h-9 px-4 rounded-xl bg-[var(--status-danger)] text-white text-xs font-semibold disabled:opacity-50"
              >
                {isFa ? 'تایید غیرفعال‌سازی' : 'Confirm Disable'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
