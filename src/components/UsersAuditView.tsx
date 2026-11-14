import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { AuditLogEntry, UserAccount, UserRole } from '../shared/types.ts';
import { ChangePasswordModal } from './ChangePasswordModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface AuditResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function generateRandomPassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export const UsersAuditView: React.FC = () => {
  const { prefs, t, user, formatTimestamp, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';
  const auditSectionRef = useRef<HTMLDivElement | null>(null);

  // Self-service password modal
  const [changeOwnPwOpen, setChangeOwnPwOpen] = useState(false);

  // Audit Log state
  const [auditQuery, setAuditQuery] = useState('');
  const [auditScope, setAuditScope] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);

  // Users state (admin only)
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'' | UserRole>('');
  const [userStatusFilter, setUserStatusFilter] = useState<'' | 'active' | 'disabled'>('');

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [newMustChangePw, setNewMustChangePw] = useState(false);

  // Edit User Modal
  const [editTarget, setEditTarget] = useState<UserAccount | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('operator');
  const [editActive, setEditActive] = useState(true);
  const [editMustChangePw, setEditMustChangePw] = useState(false);

  // Admin Reset Password Modal
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetMustChangePw, setResetMustChangePw] = useState(true);

  // Delete User Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

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

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter && u.role !== userRoleFilter) return false;
      if (userStatusFilter === 'active' && !u.active) return false;
      if (userStatusFilter === 'disabled' && u.active) return false;
      if (q) {
        const hay = `${u.username} ${u.fullName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  const activeCount = useMemo(() => users.filter((u) => u.active).length, [users]);
  const adminCount = useMemo(() => users.filter((u) => u.role === 'admin' && u.active).length, [users]);

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
          mustChangePassword: newMustChangePw,
        }),
      });
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      setNewMustChangePw(false);
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
      notify(
        'success',
        !target.active
          ? isFa ? 'حساب کاربری فعال شد.' : 'User activated.'
          : isFa ? 'حساب کاربری غیرفعال شد.' : 'User disabled.',
      );
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
      notify('success', isFa ? 'نقش کاربر به‌روزرسانی شد.' : 'User role updated.');
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const openEditUserModal = (target: UserAccount) => {
    setEditTarget(target);
    setEditUsername(target.username);
    setEditFullName(target.fullName);
    setEditRole(target.role);
    setEditActive(target.active);
    setEditMustChangePw(Boolean(target.mustChangePassword));
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await apiRequest(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          username: editUsername,
          fullName: editFullName,
          role: editRole,
          active: editActive,
          mustChangePassword: editMustChangePw,
        }),
      });
      notify('success', isFa ? 'مشخصات کاربر ذخیره شد.' : 'User details updated.');
      setEditTarget(null);
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const openResetPasswordModal = (target: UserAccount) => {
    setResetTarget(target);
    setResetPassword('');
    setResetConfirm('');
    setShowResetPassword(false);
    setResetMustChangePw(true);
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 4) {
      notify('error', t.auth.passwordMinLength);
      return;
    }
    if (resetPassword !== resetConfirm) {
      notify('error', t.auth.passwordMismatch);
      return;
    }

    try {
      await apiRequest(`/api/users/${resetTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          password: resetPassword,
          mustChangePassword: resetMustChangePw,
        }),
      });
      notify(
        'success',
        isFa
          ? `رمز عبور کاربر ${resetTarget.username} تغییر یافت.`
          : `Password updated for ${resetTarget.username}.`,
      );
      setResetTarget(null);
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `حساب کاربری ${deleteTarget.username} حذف شد.`
          : `User ${deleteTarget.username} deleted.`,
      );
      setDeleteTarget(null);
      loadUsers();
      loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const jumpToUserActivity = (username: string) => {
    setAuditQuery(username);
    setPage(1);
    auditSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-6">
      {/* My Account & Self-Service Password Card (All Roles) */}
      {user && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold">
              <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'حساب کاربری و امنیت من' : 'My Account & Security'}</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-[var(--text-primary)]">{user.fullName}</span>
              <span dir="ltr" className="text-[var(--text-muted)]">@{user.username}</span>
              <span>·</span>
              <span>
                {user.role === 'admin'
                  ? t.auth.roleAdmin
                  : user.role === 'operator'
                    ? t.auth.roleOperator
                    : t.auth.roleViewer}
              </span>
              {user.lastLoginAt && (
                <>
                  <span>·</span>
                  <span className="text-[var(--text-muted)] tabular-nums">
                    {t.auth.lastLogin}: {formatTimestamp(user.lastLoginAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setChangeOwnPwOpen(true)}
            className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-2"
          >
            <KeyRound className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>{t.auth.changePassword}</span>
          </button>
        </div>
      )}

      {/* Admin User Management */}
      {isAdmin && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'مدیریت کاربران و نقش‌های دسترسی' : 'User & Role Management'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)] tabular-nums">
              <span>
                {isFa ? 'کل کاربران:' : 'Total:'} <strong className="text-[var(--text-primary)]">{users.length}</strong>
              </span>
              <span>
                {isFa ? 'فعال:' : 'Active:'} <strong className="text-[var(--status-success)]">{activeCount}</strong>
              </span>
              <span>
                {t.auth.roleAdmin}: <strong className="text-[var(--accent-primary)]">{adminCount}</strong>
              </span>
            </div>
          </div>

          {/* Add New User Form */}
          <form onSubmit={handleCreateUser} className="p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-3">
            <div className="text-xs font-semibold text-[var(--text-secondary)]">
              {isFa ? 'افزودن کاربر جدید' : 'Add New User'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <input
                type="text"
                required
                dir="ltr"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t.auth.username}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-left"
              />
              <input
                type="text"
                dir="auto"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder={t.auth.fullName}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
              />
              <div className="relative flex items-center">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.auth.password}
                  className="w-full h-9 ps-3 pe-16 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-left"
                />
                <div className="absolute end-1.5 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    title={isFa ? 'نمایش/مخفی کردن' : 'Show/Hide'}
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPassword(generateRandomPassword());
                      setShowNewPassword(true);
                    }}
                    className="p-1 text-[var(--accent-primary)] hover:opacity-80"
                    title={t.auth.generatePassword}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
              >
                <option value="operator">{t.auth.roleOperator}</option>
                <option value="viewer">{t.auth.roleViewer}</option>
                <option value="admin">{t.auth.roleAdmin}</option>
              </select>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.controls.add}</span>
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={newMustChangePw}
                onChange={(e) => setNewMustChangePw(e.target.checked)}
              />
              <span>{t.auth.forcePasswordChange}</span>
            </label>
          </form>

          {/* Search & Filter Users */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-2.5" />
              <input
                type="text"
                dir="auto"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={isFa ? 'جستجو نام یا نام کاربری...' : 'Search name or username...'}
                className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
            </div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value as '' | UserRole)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? 'همه نقش‌ها' : 'All Roles'}</option>
              <option value="admin">{t.auth.roleAdmin}</option>
              <option value="operator">{t.auth.roleOperator}</option>
              <option value="viewer">{t.auth.roleViewer}</option>
            </select>
            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value as '' | 'active' | 'disabled')}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
              <option value="active">{isFa ? 'فعال' : 'Active'}</option>
              <option value="disabled">{isFa ? 'غیرفعال' : 'Disabled'}</option>
            </select>
          </div>

          {/* Users List */}
          <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden text-xs">
            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-muted)]">{t.controls.noData}</div>
            ) : (
              filteredUsers.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <div key={u.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--bg-subtle)]/30">
                    <div className="space-y-1 min-w-[200px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm bidi-plaintext">{u.fullName}</span>
                        <span dir="ltr" className="text-[var(--text-muted)] tabular-nums">@{u.username}</span>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[10px] font-bold">
                            {isFa ? 'شما' : 'You'}
                          </span>
                        )}
                        {u.mustChangePassword && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[10px] font-semibold">
                            {isFa ? 'نیازمند تغییر رمز' : 'Password Reset Pending'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                        <span>
                          {t.auth.createdAt}: {formatTimestamp(u.createdAt)}
                        </span>
                        <span>
                          {t.auth.lastLogin}: {u.lastLoginAt ? formatTimestamp(u.lastLoginAt) : t.auth.neverLoggedIn}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => changeUserRole(u, e.target.value as UserRole)}
                        className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs disabled:opacity-50"
                      >
                        <option value="admin">{t.auth.roleAdmin}</option>
                        <option value="operator">{t.auth.roleOperator}</option>
                        <option value="viewer">{t.auth.roleViewer}</option>
                      </select>

                      <button
                        type="button"
                        disabled={isSelf}
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

                      <button
                        type="button"
                        onClick={() => openEditUserModal(u)}
                        title={t.auth.editUser}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">{t.controls.edit}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openResetPasswordModal(u)}
                        title={t.auth.resetPassword}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center gap-1"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">{t.auth.resetPassword}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => jumpToUserActivity(u.username)}
                        title={t.auth.viewUserActivity}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center gap-1"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => setDeleteTarget(u)}
                        title={t.auth.deleteUser}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)] disabled:opacity-35 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Exact User Action Audit Log */}
      <div
        ref={auditSectionRef}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden"
      >
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

      {/* Self-service Change Password Modal */}
      <ChangePasswordModal
        open={changeOwnPwOpen}
        onClose={() => setChangeOwnPwOpen(false)}
      />

      {/* Admin Edit User Modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold">{t.auth.editUser}</h3>
              <button type="button" onClick={() => setEditTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.auth.username} *
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.auth.fullName} *
                </label>
                <input
                  type="text"
                  required
                  dir="auto"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'نقش دسترسی' : 'Role'}
                </label>
                <select
                  value={editRole}
                  disabled={editTarget.id === user?.id}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs disabled:opacity-50"
                >
                  <option value="admin">{t.auth.roleAdmin}</option>
                  <option value="operator">{t.auth.roleOperator}</option>
                  <option value="viewer">{t.auth.roleViewer}</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={editTarget.id === user?.id}
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <span>{isFa ? 'حساب کاربری فعال است' : 'Account is active'}</span>
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editMustChangePw}
                    onChange={(e) => setEditMustChangePw(e.target.checked)}
                  />
                  <span>{t.auth.forcePasswordChange}</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reset User Password Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold">{t.auth.resetPassword}</h3>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {resetTarget.fullName} ({resetTarget.username})
                </div>
              </div>
              <button type="button" onClick={() => setResetTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveResetPassword} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    {t.auth.newPassword} *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const generated = generateRandomPassword();
                      setResetPassword(generated);
                      setResetConfirm(generated);
                      setShowResetPassword(true);
                    }}
                    className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{t.auth.generatePassword}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    dir="ltr"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full h-9 ps-3 pe-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((v) => !v)}
                    className="absolute end-2.5 top-2 text-[var(--text-muted)]"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.auth.confirmPassword} *
                </label>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  required
                  minLength={4}
                  dir="ltr"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm text-left"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={resetMustChangePw}
                  onChange={(e) => setResetMustChangePw(e.target.checked)}
                />
                <span>{t.auth.forcePasswordChange}</span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--status-danger)]">{t.auth.deleteUser}</h3>
              <button type="button" onClick={() => setDeleteTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `آیا از حذف حساب کاربری «${deleteTarget.fullName}» (@${deleteTarget.username}) اطمینان دارید؟ سوابق فعالیت ثبت‌شده این کاربر در دفترچه وقایع همچنان حفظ خواهد شد.`
                : `Are you sure you want to delete user "${deleteTarget.fullName}" (@${deleteTarget.username})? Historical audit log entries for this user will remain intact.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.controls.delete}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
