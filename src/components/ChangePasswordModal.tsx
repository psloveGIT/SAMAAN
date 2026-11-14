import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { UserAccount } from '../shared/types.ts';

interface ChangePasswordModalProps {
  open: boolean;
  forced?: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  open,
  forced = false,
  onClose,
}) => {
  const { t, user, setAuthenticatedUser, notify, logout } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setError('');
      setBusy(false);
    }
  }, [open]);

  if (!open || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 4) {
      setError(t.auth.passwordMinLength);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; user: UserAccount }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        },
      );
      setAuthenticatedUser(res.user);
      notify('success', t.auth.passwordChanged);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => {
        if (!forced) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{t.auth.changePassword}</h3>
              <div className="text-[11px] text-[var(--text-muted)]">
                {user.fullName} ({user.username})
              </div>
            </div>
          </div>
          {!forced && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {forced && (
          <div className="p-3 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] text-xs text-[var(--status-warning)] font-medium flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t.auth.mustChangeNotice}</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t.auth.currentPassword} *
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                required
                dir="ltr"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-9 ps-3 pe-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute end-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t.auth.newPassword} *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={4}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-9 ps-3 pe-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute end-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {t.auth.confirmPassword} *
            </label>
            <input
              type={showNew ? 'text' : 'password'}
              required
              minLength={4}
              dir="ltr"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            {forced ? (
              <button
                type="button"
                onClick={logout}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.logout}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
            >
              {t.controls.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
