import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, Shield, UserCheck, UserX } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { AuditLogEntry, UserAccount, UserRole } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface AuditResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const UsersAuditView: React.FC = () => {
  const { prefs, t, user, formatTimestamp, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';

  // Audit Log state
  const [auditQuery, setAuditQuery] = useState('');
  const [auditScope, setAuditScope] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);

  // Users state (admin only)
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');

  const loadAudit = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '40',
        ...(auditQuery ? { q: auditQuery } : {}),
        ...(auditScope ? { scope: auditScope } : {}),
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
      });
      const res = await apiRequest<AuditResponse>(`/api/audit?${params.toString()}`);
      setAuditData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  }, [page, auditQuery, auditScope, fromDate, toDate, notify]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiRequest<{ users: UserAccount[] }>('/api/users');
      setUsers(res.users);
    } catch {
      // Ignore
    }
  }, [isAdmin]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          fullName: newFullName || newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      notify('success', isFa ? 'حساب کاربری جدید ایجاد شد.' : 'User created.');
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const toggleUserActive = async (target: UserAccount) => {
    try {
      await apiRequest(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !target.active }),
      });
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const changeUserRole = async (target: UserAccount, role: UserRole) => {
    try {
      await apiRequest(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin User Management */}
      {isAdmin && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isFa ? 'مدیریت کاربران و نقش‌های دسترسی' : 'User & Role Management'}</span>
          </div>

          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <input
              type="text"
              required
              dir="ltr"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder={t.auth.username}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />
            <input
              type="text"
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder={t.auth.fullName}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />
            <input
              type="password"
              required
              minLength={4}
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t.auth.password}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="operator">{t.auth.roleOperator}</option>
              <option value="viewer">{t.auth.roleViewer}</option>
              <option value="admin">{t.auth.roleAdmin}</option>
            </select>
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.controls.add}</span>
            </button>
          </form>

          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden text-xs">
            {users.map((u) => (
              <div key={u.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-semibold">{u.fullName}</span>
                  <span className="text-[var(--text-muted)] ms-2 tabular-nums">({u.username})</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    disabled={u.id === user?.id}
                    onChange={(e) => changeUserRole(u, e.target.value as UserRole)}
                    className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs disabled:opacity-50"
                  >
                    <option value="admin">{t.auth.roleAdmin}</option>
                    <option value="operator">{t.auth.roleOperator}</option>
                    <option value="viewer">{t.auth.roleViewer}</option>
                  </select>
                  <button
                    type="button"
                    disabled={u.id === user?.id}
                    onClick={() => toggleUserActive(u)}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 disabled:opacity-40 ${
                      u.active
                        ? 'border-[var(--status-success)] text-[var(--status-success)]'
                        : 'border-[var(--status-danger)] text-[var(--status-danger)]'
                    }`}
                  >
                    {u.active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                    <span>{u.active ? (isFa ? 'فعال' : 'Active') : (isFa ? 'غیرفعال' : 'Disabled')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exact User Action Audit Log */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {isFa ? 'دفترچه ثبت دقیق فعالیت کاربران' : 'User Activity Audit Log'}
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              {prefs.calendar === 'jalali'
                ? isFa ? 'تاریخ و ساعت شمسی' : 'Jalali Timestamps'
                : isFa ? 'تاریخ و ساعت میلادی' : 'Gregorian Timestamps'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-2.5" />
              <input
                type="text"
                dir="auto"
                value={auditQuery}
                onChange={(e) => { setAuditQuery(e.target.value); setPage(1); }}
                placeholder={isFa ? 'جستجو کاربر، عملیات، شناسه...' : 'Search user, action, target...'}
                className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
            </div>

            <select
              value={auditScope}
              onChange={(e) => { setAuditScope(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? 'همه بخش‌ها' : 'All Scopes'}</option>
              <option value="general">{t.nav.general}</option>
              <option value="detailed">{t.nav.detailed}</option>
              <option value="transit">{t.nav.transit}</option>
              <option value="opi">{t.nav.opi}</option>
              <option value="gcv">{t.nav.gcv}</option>
              <option value="miv">{t.nav.miv}</option>
              <option value="balance">{t.nav.balance}</option>
              <option value="stocktake">{t.nav.stocktake}</option>
              <option value="trash">{t.nav.trash}</option>
              <option value="packing">{isFa ? 'وضعیت پکینگ' : 'Packing Closure'}</option>
              <option value="category">{t.nav.categories}</option>
              <option value="import">{t.nav.importCsv}</option>
              <option value="backup">{t.nav.backup}</option>
              <option value="auth">{isFa ? 'ورود و خروج' : 'Auth'}</option>
              <option value="user">{isFa ? 'کاربران' : 'Users'}</option>
            </select>

            <JalaliDateInput
              value={fromDate}
              onChange={(v) => { setFromDate(v); setPage(1); }}
              placeholder={t.controls.fromDate}
            />
            <JalaliDateInput
              value={toDate}
              onChange={(v) => { setToDate(v); setPage(1); }}
              placeholder={t.controls.toDate}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'تاریخ و ساعت دقیق' : 'Date & Time'}
                </th>
                <th className="py-2.5 px-4 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'کاربر' : 'User'}
                </th>
                <th className="py-2.5 px-4 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'عملیات' : 'Action'}
                </th>
                <th className="py-2.5 px-4 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'شناسه' : 'Target'}
                </th>
                <th className="py-2.5 px-4 text-start font-semibold">
                  {isFa ? 'جزئیات فعالیت' : 'Summary'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {(auditData?.items || []).map((log) => (
                <tr key={log.id} className="hover:bg-[var(--bg-subtle)]/50">
                  <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-[var(--text-secondary)]">
                    {formatTimestamp(log.timestamp)}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap font-medium">
                    {log.userFullName} ({log.username})
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap text-[var(--accent-primary)] font-semibold">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap tabular-nums bidi-plaintext">{log.targetId}</td>
                  <td className="py-2.5 px-4 bidi-plaintext">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {auditData && auditData.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="tabular-nums">
              {isFa
                ? `صفحه ${auditData.page.toLocaleString('fa-IR')} از ${auditData.totalPages.toLocaleString('fa-IR')}`
                : `Page ${auditData.page} of ${auditData.totalPages}`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              <button
                type="button"
                disabled={page >= auditData.totalPages}
                onClick={() => setPage((p) => Math.min(auditData.totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
