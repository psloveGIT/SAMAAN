import React, { useState } from 'react';
import { Calendar, Eye, Globe, Lock, Moon, ShieldCheck, Sun, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import type { UserAccount } from '../shared/types.ts';
import { SamaanLogo } from './SamaanLogo.tsx';

export const AuthGate: React.FC = () => {
  const {
    needsSetup,
    prefs,
    t,
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
  const [errorMsg, setErrorMsg] = useState('');

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
          prefs.language === 'fa'
            ? 'حساب مدیر کل سمان ایجاد شد و وارد سامانه شدید.'
            : 'Administrator account created. Welcome to SAMAAN.',
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
            onClick={() => setLanguage(prefs.language === 'fa' ? 'en' : 'fa')}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5 hover:bg-[var(--bg-subtle)] whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{prefs.language === 'fa' ? 'English' : 'فارسی'}</span>
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
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <SamaanLogo size="lg" showWordmark={false} />
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-primary)]">
                {needsSetup ? <UserPlus className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span className="truncate">{t.brandFull}</span>
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
              {prefs.language === 'fa'
                ? 'حالت آزمایشی استاتیک (GitHub Pages): داده‌ها و حساب‌ها در حافظه IndexedDB همین مرورگر ذخیره می‌شوند.'
                : 'Static Browser Mode (GitHub Pages): Data & accounts persist locally in this browser’s IndexedDB.'}
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
                dir={!fullName ? (prefs.language === 'fa' ? 'rtl' : 'ltr') : 'auto'}
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
              dir={prefs.language === 'fa' && !username ? 'rtl' : 'ltr'}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                prefs.language === 'fa' && !username ? 'text-right' : 'text-left'
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
              dir={prefs.language === 'fa' && !password ? 'rtl' : 'ltr'}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] ${
                prefs.language === 'fa' && !password ? 'text-right' : 'text-left'
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
        {prefs.language === 'fa'
          ? 'سمان (SAMAAN) — سامانه آفلاین مدیریت انبارهای نیروگاهی'
          : 'SAMAAN — Offline Power Plant Warehouse Management System'}
      </div>
    </div>
  );
};
