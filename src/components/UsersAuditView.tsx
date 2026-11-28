import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  FolderKanban,
  History,
  KeyRound,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type {
  AdminManagedUser,
  AppUserStatus,
  AuditLogEntry,
  ProjectInfo,
} from '../shared/types.ts';
import { ChangePasswordModal } from './ChangePasswordModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar } from './TablePaginationBar.tsx';
import { TotpSecurityModal } from './TotpSecurityModal.tsx';

interface AuditResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface AdminEmployerSummary {
  id: string;
  nameFa: string;
  nameEn: string;
  shortName?: string;
}

interface AdminUsersResponse {
  users: AdminManagedUser[];
  projects: ProjectInfo[];
  employers: AdminEmployerSummary[];
}

interface UsersAuditViewProps {
  refreshSignal?: number;
}

export const UsersAuditView: React.FC<UsersAuditViewProps> = ({ refreshSignal = 0 }) => {
  const { prefs, t, user, isSuperuser, formatTimestamp, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const auditSectionRef = useRef<HTMLDivElement | null>(null);

  // Self-service modals
  const [changeOwnPwOpen, setChangeOwnPwOpen] = useState(false);
  const [totpModalOpen, setTotpModalOpen] = useState(false);

  // Audit Log state
  const [auditQuery, setAuditQuery] = useState('');
  const [auditScope, setAuditScope] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);

  // Superuser Subscription Approval & Multi-Project Access Panel state
  const [managedUsers, setManagedUsers] = useState<AdminManagedUser[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const [allEmployers, setAllEmployers] = useState<AdminEmployerSummary[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [statusTab, setStatusTab] = useState<'ALL' | AppUserStatus>('PENDING');
  const [userSearch, setUserSearch] = useState('');
  const [draftProjectIds, setDraftProjectIds] = useState<Record<string, string[]>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminManagedUser | null>(null);

  const loadAudit = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
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
  }, [page, pageSize, auditQuery, auditScope, fromDate, toDate, notify]);

  const loadAdminUsers = useCallback(async () => {
    if (!isSuperuser) return;
    setLoadingAdmin(true);
    try {
      const res = await apiRequest<AdminUsersResponse>('/api/admin/users');
      setManagedUsers(res.users || []);
      setAllProjects(res.projects || []);
      setAllEmployers(res.employers || []);
      setDraftProjectIds((prev) => {
        const next: Record<string, string[]> = {};
        for (const u of res.users || []) {
          // For PENDING users without explicit assignments yet, pre-fill checkboxes with requested projects
          if (u.status === 'PENDING' && u.assignedProjectIds.length === 0 && u.requestedProjectIds.length > 0) {
            next[u.id] = prev[u.id] ?? [...u.requestedProjectIds];
          } else {
            next[u.id] = [...u.assignedProjectIds];
          }
        }
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoadingAdmin(false);
    }
  }, [isSuperuser, notify]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit, refreshSignal]);

  useEffect(() => {
    void loadAdminUsers();
  }, [loadAdminUsers, refreshSignal]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const u of managedUsers) {
      if (u.status === 'PENDING') pending += 1;
      else if (u.status === 'APPROVED') approved += 1;
      else if (u.status === 'REJECTED') rejected += 1;
    }
    return { pending, approved, rejected, total: managedUsers.length };
  }, [managedUsers]);

  // If no pending requests on first load, switch gracefully only if user hasn't interacted yet
  const autoSwitchedTabRef = useRef(false);
  useEffect(() => {
    if (!autoSwitchedTabRef.current && managedUsers.length > 0) {
      autoSwitchedTabRef.current = true;
      if (statusCounts.pending === 0 && statusTab === 'PENDING') {
        setStatusTab('ALL');
      }
    }
  }, [managedUsers.length, statusCounts.pending, statusTab]);

  const projectsByEmployer = useMemo(() => {
    const employerMap = new Map<string, AdminEmployerSummary>();
    for (const e of allEmployers) {
      employerMap.set(e.id, e);
    }
    const groups = new Map<string, { employerLabel: string; projects: ProjectInfo[] }>();
    for (const p of allProjects) {
      const empId = p.employerId || 'unassigned';
      const emp = employerMap.get(empId);
      const label = emp
        ? isFa
          ? `${emp.nameFa}${emp.shortName ? ` (${emp.shortName})` : ''}`
          : `${emp.nameEn}${emp.shortName ? ` (${emp.shortName})` : ''}`
        : isFa
          ? 'بدون کارفرما'
          : 'Unassigned';
      const bucket = groups.get(empId) || { employerLabel: label, projects: [] };
      bucket.projects.push(p);
      groups.set(empId, bucket);
    }
    return Array.from(groups.entries()).map(([employerId, value]) => ({
      employerId,
      employerLabel: value.employerLabel,
      projects: value.projects,
    }));
  }, [allProjects, allEmployers, isFa]);

  const employerLookup = useMemo(() => {
    const map = new Map<string, AdminEmployerSummary>();
    for (const e of allEmployers) map.set(e.id, e);
    return map;
  }, [allEmployers]);

  const projectLookup = useMemo(() => {
    const map = new Map<string, ProjectInfo>();
    for (const p of allProjects) map.set(p.id, p);
    return map;
  }, [allProjects]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return managedUsers.filter((u) => {
      if (statusTab !== 'ALL' && u.status !== statusTab) return false;
      if (q) {
        const hay = `${u.fullName} ${u.firstName} ${u.lastName} ${u.phone} ${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [managedUsers, statusTab, userSearch]);

  const toggleDraftProject = (userId: string, projectId: string) => {
    setDraftProjectIds((prev) => {
      const current = prev[userId] || [];
      const next = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId];
      return { ...prev, [userId]: next };
    });
  };

  const applyRequestedProjects = (u: AdminManagedUser) => {
    const validRequested = u.requestedProjectIds.filter((id) => projectLookup.has(id));
    setDraftProjectIds((prev) => ({ ...prev, [u.id]: validRequested }));
  };

  const selectAllProjectsForUser = (userId: string) => {
    setDraftProjectIds((prev) => ({
      ...prev,
      [userId]: allProjects.map((p) => p.id),
    }));
  };

  const clearProjectsForUser = (userId: string) => {
    setDraftProjectIds((prev) => ({
      ...prev,
      [userId]: [],
    }));
  };

  const handleUpdateAccess = async (
    target: AdminManagedUser,
    nextStatus?: AppUserStatus,
  ) => {
    const selectedIds = draftProjectIds[target.id] ?? target.assignedProjectIds;
    if ((nextStatus === 'APPROVED' || (!nextStatus && target.status === 'APPROVED')) && selectedIds.length === 0) {
      notify(
        'warning',
        isFa
          ? 'برای تایید یا فعال نگه‌داشتن کاربر، حداقل یک پروژه را برای دسترسی انتخاب کنید.'
          : 'Select at least one project before approving this user.',
      );
      return;
    }

    setBusyUserId(target.id);
    try {
      await apiRequest(`/api/admin/users/${target.id}/access`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(nextStatus ? { status: nextStatus } : {}),
          projectIds: selectedIds,
        }),
      });
      notify(
        'success',
        nextStatus === 'APPROVED'
          ? isFa
            ? `حساب «${target.fullName}» تایید و به ${selectedIds.length} پروژه متصل شد.`
            : `"${target.fullName}" approved with ${selectedIds.length} project(s).`
          : nextStatus === 'REJECTED'
            ? isFa
              ? `درخواست یا حساب «${target.fullName}» رد / تعلیق شد و نشست‌های فعال آن باطل گردید.`
              : `"${target.fullName}" rejected / suspended.`
            : isFa
              ? `دسترسی پروژه‌های «${target.fullName}» با موفقیت ذخیره شد (${selectedIds.length} پروژه).`
              : `Updated project access for "${target.fullName}".`,
      );
      await loadAdminUsers();
      await loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setBusyUserId(deleteTarget.id);
    try {
      await apiRequest(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `حساب کاربری «${deleteTarget.fullName}» حذف شد.`
          : `User "${deleteTarget.fullName}" deleted.`,
      );
      setDeleteTarget(null);
      await loadAdminUsers();
      await loadAudit();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyUserId(null);
    }
  };

  const jumpToUserActivity = (queryText: string) => {
    setAuditQuery(queryText);
    setPage(1);
    auditSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasUnsavedProjectDiff = (u: AdminManagedUser): boolean => {
    const draft = [...(draftProjectIds[u.id] ?? u.assignedProjectIds)].sort();
    const saved = [...u.assignedProjectIds].sort();
    if (draft.length !== saved.length) return true;
    return draft.some((id, idx) => id !== saved[idx]);
  };

  return (
    <div className="space-y-6">
      {/* My Account & Self-Service Security Card (All Roles) */}
      {user && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'حساب کاربری و امنیت من' : 'My Account & Security'}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                  isSuperuser
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {isSuperuser
                  ? isFa
                    ? 'مدیر ارشد سامانه (SUPERUSER)'
                    : 'SUPERUSER'
                  : isFa
                    ? 'کاربر سامانه (USER)'
                    : 'USER'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${
                  user.totpEnabled
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {user.totpEnabled ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                <span>
                  {user.totpEnabled
                    ? isFa
                      ? '2FA فعال'
                      : '2FA Enabled'
                    : isFa
                      ? '2FA غیرفعال'
                      : '2FA Disabled'}
                </span>
              </span>
            </div>

            <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-[var(--text-primary)]">{user.fullName}</span>
              {user.phone && (
                <span dir="ltr" className="inline-flex items-center gap-1 text-[var(--text-muted)] font-mono">
                  <Phone className="w-3 h-3" />
                  {user.phone}
                </span>
              )}
              {user.email && (
                <span dir="ltr" className="inline-flex items-center gap-1 text-[var(--text-muted)] font-mono">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </span>
              )}
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="account-totp-btn"
              onClick={() => setTotpModalOpen(true)}
              className={`h-9 px-4 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors ${
                user.totpEnabled
                  ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15'
                  : 'border-[var(--accent-primary)]/45 bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                {isFa ? 'تنظیمات تایید دو مرحله‌ای (2FA)' : '2FA Authenticator Settings'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setChangeOwnPwOpen(true)}
              className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-2"
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{t.auth.changePassword}</span>
            </button>
          </div>
        </div>
      )}

      {/* SUPERUSER ONLY: Subscription Approval & Multi-Project Access Panel */}
      {isSuperuser && (
        <div
          data-testid="superuser-approval-panel"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>
                  {isFa
                    ? 'پنل تایید درخواست‌های اشتراک و تخصیص چندپروژه‌ای کاربران'
                    : 'Subscription Approval & Multi-Project User Access'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? 'درخواست‌های ثبت‌نام جدید را بررسی کرده، یک یا چند پروژه مجاز را از طریق چک‌باکس تخصیص دهید و حساب کاربر را تایید یا رد کنید.'
                  : 'Review registration requests, assign one or multiple projects via checkboxes, and approve or reject accounts.'}
              </p>
            </div>

            <button
              type="button"
              disabled={loadingAdmin}
              onClick={() => void loadAdminUsers()}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingAdmin ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'بروزرسانی لیست' : 'Refresh'}</span>
            </button>
          </div>

          {/* Status Filter Tabs & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-1 gap-1">
              {(
                [
                  {
                    key: 'PENDING' as const,
                    label: isFa ? 'در انتظار تایید' : 'Pending',
                    count: statusCounts.pending,
                    highlight: statusCounts.pending > 0,
                  },
                  {
                    key: 'APPROVED' as const,
                    label: isFa ? 'تایید شده' : 'Approved',
                    count: statusCounts.approved,
                    highlight: false,
                  },
                  {
                    key: 'REJECTED' as const,
                    label: isFa ? 'رد شده' : 'Rejected',
                    count: statusCounts.rejected,
                    highlight: false,
                  },
                  {
                    key: 'ALL' as const,
                    label: isFa ? 'همه کاربران' : 'All Users',
                    count: statusCounts.total,
                    highlight: false,
                  },
                ]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  data-testid={`admin-users-tab-${tab.key}`}
                  onClick={() => setStatusTab(tab.key)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    statusTab === tab.key
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                      statusTab === tab.key
                        ? 'bg-white/20 text-white'
                        : tab.highlight
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="w-full sm:w-72">
              <SearchInputWithClear
                value={userSearch}
                onChange={setUserSearch}
                placeholder={isFa ? 'جستجو نام، موبایل یا ایمیل...' : 'Search name, phone or email...'}
                inputClassName="text-xs"
              />
            </div>
          </div>

          {/* Managed Users Cards */}
          <div className="space-y-3">
            {filteredUsers.length === 0 ? (
              <div className="py-10 rounded-xl border border-dashed border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)]">
                {statusTab === 'PENDING'
                  ? isFa
                    ? 'درخواست ثبت‌نام در انتظار تاییدی وجود ندارد.'
                    : 'No pending registration requests.'
                  : t.controls.noData}
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isTargetSuperuser = u.role === 'SUPERUSER';
                const isBusy = busyUserId === u.id;
                const selectedIds = draftProjectIds[u.id] ?? u.assignedProjectIds;
                const dirty = !isTargetSuperuser && hasUnsavedProjectDiff(u);
                const reqEmployer = u.requestedEmployerId
                  ? employerLookup.get(u.requestedEmployerId)
                  : undefined;

                return (
                  <div
                    key={u.id}
                    data-testid={`admin-user-card-${u.id}`}
                    className={`rounded-xl border p-4 space-y-3.5 transition-colors ${
                      u.status === 'PENDING'
                        ? 'border-amber-500/40 bg-amber-500/[0.03]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55'
                    }`}
                  >
                    {/* Header Row: Identity & Status Badges */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[var(--text-primary)] bidi-plaintext">
                            {u.fullName}
                          </span>

                          {isTargetSuperuser ? (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[10.5px] font-bold">
                              {isFa ? 'مدیر ارشد سامانه' : 'SUPERUSER'}
                            </span>
                          ) : u.status === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10.5px] font-bold">
                              <Clock className="w-3 h-3" />
                              {isFa ? 'در انتظار تایید' : 'PENDING'}
                            </span>
                          ) : u.status === 'APPROVED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              {isFa ? 'تایید شده' : 'APPROVED'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10.5px] font-bold">
                              <UserX className="w-3 h-3" />
                              {isFa ? 'رد / تعلیق شده' : 'REJECTED'}
                            </span>
                          )}

                          {u.phoneVerified && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10.5px] font-semibold">
                              <Check className="w-3 h-3" />
                              {isFa ? 'موبایل تایید شده' : 'Phone Verified'}
                            </span>
                          )}

                          {u.totpEnabled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-semibold">
                              <ShieldCheck className="w-3 h-3" />
                              2FA
                            </span>
                          )}
                        </div>

                        <div className="text-[11.5px] text-[var(--text-secondary)] flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span dir="ltr" className="inline-flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3 text-[var(--text-muted)]" />
                            {u.phone}
                          </span>
                          <span dir="ltr" className="inline-flex items-center gap-1 font-mono">
                            <Mail className="w-3 h-3 text-[var(--text-muted)]" />
                            {u.email}
                          </span>
                          <span className="text-[var(--text-muted)] tabular-nums">
                            {t.auth.createdAt}: {formatTimestamp(u.createdAt)}
                          </span>
                          {u.approvedBy && u.approvedAt && (
                            <span className="text-[var(--text-muted)] tabular-nums">
                              {isFa ? 'تایید توسط:' : 'Approved by:'} {u.approvedBy} ({formatTimestamp(u.approvedAt)})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => jumpToUserActivity(u.email || u.phone)}
                          title={t.auth.viewUserActivity}
                          className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs flex items-center gap-1"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        {!isTargetSuperuser && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setDeleteTarget(u)}
                            title={t.auth.deleteUser}
                            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs flex items-center gap-1 disabled:opacity-40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Requested Employer & Projects Summary (for regular users) */}
                    {!isTargetSuperuser && (reqEmployer || u.requestedProjectIds.length > 0) && (
                      <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
                          <Building2 className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                          <span className="font-semibold text-[var(--text-primary)]">
                            {isFa ? 'درخواست ثبت‌نام کاربر:' : 'Requested during signup:'}
                          </span>
                          {reqEmployer && (
                            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium">
                              {isFa ? reqEmployer.nameFa : reqEmployer.nameEn}
                            </span>
                          )}
                          {u.requestedProjectIds.map((pid) => {
                            const proj = projectLookup.get(pid);
                            return (
                              <span
                                key={pid}
                                className="px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold"
                              >
                                {proj ? proj.name : pid}
                              </span>
                            );
                          })}
                        </div>
                        {u.requestedProjectIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => applyRequestedProjects(u)}
                            className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline"
                          >
                            {isFa ? 'اعمال پروژه‌های درخواستی' : 'Apply requested projects'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Multi-Project Access Checkboxes (for regular users) */}
                    {isTargetSuperuser ? (
                      <div className="text-[11.5px] text-[var(--text-muted)] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        <span>
                          {isFa
                            ? 'مدیر ارشد سامانه به تمامی پروژه‌ها، کارفرمایان و تنظیمات دسترسی کامل دارد.'
                            : 'Superuser has unrestricted access to all projects, employers, and settings.'}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                            <FolderKanban className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            <span>
                              {isFa
                                ? `پروژه‌های مجاز این کاربر (${selectedIds.length} انتخاب‌شده):`
                                : `Assigned Projects (${selectedIds.length} selected):`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px]">
                            <button
                              type="button"
                              onClick={() => selectAllProjectsForUser(u.id)}
                              className="font-semibold text-[var(--accent-primary)] hover:underline"
                            >
                              {isFa ? 'انتخاب همه' : 'Select all'}
                            </button>
                            <button
                              type="button"
                              onClick={() => clearProjectsForUser(u.id)}
                              className="font-medium text-[var(--text-muted)] hover:underline"
                            >
                              {isFa ? 'پاک کردن انتخاب' : 'Clear'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                          {projectsByEmployer.map((group) => (
                            <div
                              key={group.employerId}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 space-y-1.5"
                            >
                              <div className="text-[10.5px] font-bold text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]/70 truncate">
                                {group.employerLabel}
                              </div>
                              <div className="space-y-1">
                                {group.projects.map((proj) => {
                                  const checked = selectedIds.includes(proj.id);
                                  const wasRequested = u.requestedProjectIds.includes(proj.id);
                                  return (
                                    <label
                                      key={proj.id}
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                        checked
                                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                                          : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        data-testid={`user-${u.id}-project-${proj.id}`}
                                        checked={checked}
                                        onChange={() => toggleDraftProject(u.id, proj.id)}
                                        className="w-3.5 h-3.5 accent-[var(--accent-primary)] shrink-0"
                                      />
                                      <span className="truncate flex-1">{proj.name}</span>
                                      {wasRequested && (
                                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                                          {isFa ? 'درخواستی' : 'Req'}
                                        </span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Approval / Access Action Buttons */}
                        <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-end gap-2">
                          {u.status !== 'APPROVED' && (
                            <button
                              type="button"
                              data-testid={`admin-approve-user-${u.id}`}
                              disabled={isBusy || selectedIds.length === 0}
                              onClick={() => void handleUpdateAccess(u, 'APPROVED')}
                              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-45 transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>
                                {isFa
                                  ? `تایید و فعال‌سازی حساب (${selectedIds.length} پروژه)`
                                  : `Approve Account (${selectedIds.length} projects)`}
                              </span>
                            </button>
                          )}

                          {u.status === 'APPROVED' && (
                            <button
                              type="button"
                              data-testid={`admin-save-projects-${u.id}`}
                              disabled={isBusy || !dirty || selectedIds.length === 0}
                              onClick={() => void handleUpdateAccess(u)}
                              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold flex items-center gap-1.5 disabled:opacity-45 transition-colors"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>{isFa ? 'ذخیره دسترسی پروژه‌ها' : 'Save Project Access'}</span>
                            </button>
                          )}

                          {u.status !== 'REJECTED' && (
                            <button
                              type="button"
                              data-testid={`admin-reject-user-${u.id}`}
                              disabled={isBusy}
                              onClick={() => void handleUpdateAccess(u, 'REJECTED')}
                              className="h-9 px-3.5 rounded-lg border border-[var(--status-danger)]/50 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-45 transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>
                                {u.status === 'PENDING'
                                  ? isFa
                                    ? 'رد درخواست'
                                    : 'Reject'
                                  : isFa
                                    ? 'تعلیق حساب'
                                    : 'Suspend'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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
                ? isFa
                  ? 'تاریخ و ساعت شمسی'
                  : 'Jalali Timestamps'
                : isFa
                  ? 'تاریخ و ساعت میلادی'
                  : 'Gregorian Timestamps'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <SearchInputWithClear
              value={auditQuery}
              onChange={(next) => {
                setAuditQuery(next);
                setPage(1);
              }}
              placeholder={isFa ? 'جستجو کاربر، عملیات، شناسه...' : 'Search user, action, target...'}
              inputClassName="text-xs"
            />

            <select
              value={auditScope}
              onChange={(e) => {
                setAuditScope(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? 'همه بخش‌ها' : 'All Scopes'}</option>
              <option value="siteEntry">{t.nav.siteEntry}</option>
              <option value="general">{t.nav.general}</option>
              <option value="detailed">{t.nav.detailed}</option>
              <option value="transit">{t.nav.transit}</option>
              <option value="opi">{t.nav.opi}</option>
              <option value="opiMinutes">{t.nav.opiMinutes}</option>
              <option value="osdr">{isFa ? 'گزارش مغایرت (MER)' : 'MER Reports'}</option>
              <option value="gcv">{t.nav.gcv}</option>
              <option value="miv">{t.nav.miv}</option>
              <option value="smr">{t.nav.smr}</option>
              <option value="substitution">{t.nav.substitution}</option>
              <option value="estimation">{t.nav.materialEstimation}</option>
              <option value="balance">{t.nav.balance}</option>
              <option value="stocktake">{t.nav.stocktake}</option>
              <option value="trash">{t.nav.trash}</option>
              <option value="packing">{isFa ? 'وضعیت پکینگ' : 'Packing Closure'}</option>
              <option value="category">{t.nav.categories}</option>
              <option value="import">{isFa ? 'بارگذاری فایل (Excel / CSV)' : 'File Import'}</option>
              <option value="backup">{t.nav.backup}</option>
              <option value="auth">{isFa ? 'ورود و خروج' : 'Auth'}</option>
              <option value="user">{isFa ? 'کاربران' : 'Users'}</option>
            </select>

            <JalaliDateInput
              value={fromDate}
              onChange={(v) => {
                setFromDate(v);
                setPage(1);
              }}
              placeholder={t.controls.fromDate}
            />
            <JalaliDateInput
              value={toDate}
              onChange={(v) => {
                setToDate(v);
                setPage(1);
              }}
              placeholder={t.controls.toDate}
            />
          </div>
        </div>

        <StickyTableWrapper>
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
        </StickyTableWrapper>

        <TablePaginationBar
          page={auditData?.page || page}
          totalPages={auditData?.totalPages || 1}
          total={auditData?.total || 0}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          lang={prefs.language}
        />
      </div>

      {/* Self-service Change Password Modal */}
      <ChangePasswordModal
        open={changeOwnPwOpen}
        onClose={() => setChangeOwnPwOpen(false)}
      />

      {/* Self-service Offline TOTP 2FA Modal */}
      <TotpSecurityModal
        open={totpModalOpen}
        onClose={() => setTotpModalOpen(false)}
      />

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
                ? `آیا از حذف حساب کاربری «${deleteTarget.fullName}» (${deleteTarget.phone}) اطمینان دارید؟ دسترسی کاربر به تمام پروژه‌ها قطع شده و سوابق ثبت‌شده در دفترچه وقایع همچنان حفظ خواهد شد.`
                : `Are you sure you want to delete user "${deleteTarget.fullName}" (${deleteTarget.phone})? All project access and sessions will be revoked while historical audit logs remain intact.`}
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
                disabled={busyUserId === deleteTarget.id}
                onClick={() => void handleConfirmDeleteUser()}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
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
