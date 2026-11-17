import React, { useState } from 'react';
import {
  Building2,
  Check,
  Database,
  Edit3,
  FileText,
  FolderPlus,
  Palette,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import { DEFAULT_EMPLOYER_ID, resolveEmployerProfile } from '../shared/employers.ts';
import type { EmployerId } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';
import { EmployersStudioWorkspace } from './EmployersStudioView.tsx';

interface ProjectManagerModalProps {
  open: boolean;
  onClose: () => void;
  onOpenEmployersPage?: () => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  open,
  onClose,
  onOpenEmployersPage,
}) => {
  const {
    user,
    prefs,
    projects,
    employers,
    activeProjectId,
    switchProject,
    createProject,
    renameProject,
    deleteProject,
    notify,
  } = useApp();
  const isFa = prefs.language === 'fa';

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newEmployerId, setNewEmployerId] = useState<EmployerId>(DEFAULT_EMPLOYER_ID);
  const [copyUsers, setCopyUsers] = useState(Boolean(user));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEmployerId, setEditEmployerId] = useState<EmployerId>(DEFAULT_EMPLOYER_ID);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [studioModalOpen, setStudioModalOpen] = useState(false);
  const [studioAssignTarget, setStudioAssignTarget] = useState<'new' | 'edit'>('new');

  if (!open) return null;

  const handleSelect = async (id: string) => {
    if (id === activeProjectId) {
      onClose();
      return;
    }
    setBusyId(id);
    try {
      await switchProject(id);
      const target = projects.find((p) => p.id === id);
      const targetEmp = resolveEmployerProfile(target, employers);
      notify(
        'info',
        isFa
          ? `پروژه فعال به «${target?.name || id}» (${targetEmp.isConfigured ? `کارفرما: ${targetEmp.nameFa}` : 'حالت خام'}) تغییر یافت.`
          : `Switched to "${target?.name || id}".`,
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await createProject({
        name: newName.trim(),
        code: newCode.trim() || undefined,
        employerId: newEmployerId,
        copyUsers: Boolean(user && copyUsers),
        autoSwitch: true,
      });
      const createdEmp = resolveEmployerProfile(created, employers);
      setNewName('');
      setNewCode('');
      setNewEmployerId(DEFAULT_EMPLOYER_ID);
      notify(
        'success',
        isFa
          ? `پروژه «${created.name}» ${createdEmp.isConfigured ? `با کارفرمای «${createdEmp.nameFa}»` : '(در حالت خام)'} ایجاد و فعال شد.`
          : `Project "${created.name}" created.`,
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return;
    setBusyId(id);
    try {
      await renameProject(id, {
        name: editName.trim(),
        code: editCode.trim() || undefined,
        employerId: editEmployerId,
      });
      setEditingId(null);
      notify(
        'success',
        isFa ? 'مشخصات پروژه و کارفرما با موفقیت به‌روزرسانی شد.' : 'Project and employer updated.',
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteProject(id);
      setConfirmDeleteId(null);
      notify('success', isFa ? 'پروژه و پایگاه داده آن حذف شد.' : 'Project and its database deleted.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const newResolvedEmployer = resolveEmployerProfile({ employerId: newEmployerId }, employers);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'مدیریت پروژه‌ها و انتخاب کارفرما' : 'Manage Projects & Assign Employers'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenEmployersPage) {
                    onClose();
                    onOpenEmployersPage();
                  } else {
                    setStudioAssignTarget('new');
                    setStudioModalOpen(true);
                  }
                }}
                className="h-8 px-3 rounded-lg border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Palette className="w-3.5 h-3.5" />
                <span>{isFa ? 'طراحی کارفرما و فرم‌ها' : 'Employer & Form Studio'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5 overflow-y-auto space-y-5">
            {/* Existing Projects List */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[var(--text-secondary)]">
                {isFa ? 'انتخاب پروژه فعال:' : 'Select Active Project:'}
              </div>
              <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                {projects.map((p) => {
                  const isActive = p.id === activeProjectId;
                  const isEditing = editingId === p.id;
                  const isConfirmingDel = confirmDeleteId === p.id;
                  const isDefault = p.id === 'default';
                  const resolvedEmp = resolveEmployerProfile(p, employers);

                  return (
                    <div
                      key={p.id}
                      className={`p-3 flex flex-wrap items-center justify-between gap-3 ${
                        isActive ? 'bg-[var(--accent-soft)]' : 'bg-[var(--bg-surface)]'
                      }`}
                    >
                      {isEditing ? (
                        <div className="w-full space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder={isFa ? 'نام پروژه' : 'Project name'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editCode}
                              onChange={(e) => setEditCode(e.target.value)}
                              placeholder={isFa ? 'کد پروژه (اختیاری)' : 'Code (optional)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <div className="flex items-center gap-1">
                              <select
                                value={editEmployerId}
                                onChange={(e) => setEditEmployerId(e.target.value)}
                                className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                              >
                                <option value="">
                                  {isFa ? 'بدون کارفرما (حالت خام)' : 'Unassigned (Neutral)'}
                                </option>
                                {employers.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.nameFa}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                title={isFa ? 'افزودن / ویرایش کارفرما' : 'Manage Employers'}
                                onClick={() => {
                                  setStudioAssignTarget('edit');
                                  setStudioModalOpen(true);
                                }}
                                className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--accent-primary)]"
                              >
                                <Palette className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => handleSaveEdit(p.id)}
                              className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                            >
                              {isFa ? 'ذخیره تغییرات' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] text-xs"
                            >
                              {isFa ? 'لغو' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyId === p.id}
                            onClick={() => handleSelect(p.id)}
                            className="flex-1 min-w-[200px] flex items-center gap-2.5 text-start"
                          >
                            <Database
                              className={`w-4 h-4 shrink-0 ${
                                isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                                <span className="truncate">{p.name}</span>
                                {p.code && (
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                  >
                                    {p.code}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span>
                                  {resolvedEmp.isConfigured
                                    ? isFa
                                      ? `کارفرما: ${resolvedEmp.nameFa}`
                                      : `Employer: ${resolvedEmp.nameEn}`
                                    : isFa
                                      ? 'بدون کارفرما (قالب عمومی خام)'
                                      : 'Neutral (No Employer Assigned)'}
                                </span>
                                {resolvedEmp.docCodePrefix && (
                                  <>
                                    <span>·</span>
                                    <span dir="ltr" className="font-mono text-[10px]">
                                      {resolvedEmp.docCodePrefix}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1.5">
                            {isActive ? (
                              <span className="h-7 px-2.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-[11px] font-semibold flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                <span>{isFa ? 'فعال' : 'Active'}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => handleSelect(p.id)}
                                className="h-7 px-2.5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold"
                              >
                                {isFa ? 'ورود به پروژه' : 'Switch'}
                              </button>
                            )}

                            <button
                              type="button"
                              title={isFa ? 'ویرایش پروژه و کارفرما' : 'Edit project & employer'}
                              onClick={() => {
                                setEditingId(p.id);
                                setEditName(p.name);
                                setEditCode(p.code || '');
                                setEditEmployerId(p.employerId || DEFAULT_EMPLOYER_ID);
                              }}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {!isDefault &&
                              (isConfirmingDel ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busyId === p.id}
                                    onClick={() => handleConfirmDelete(p.id)}
                                    className="h-7 px-2 rounded-lg bg-[var(--status-danger)] text-white text-[11px] font-semibold"
                                  >
                                    {isFa ? 'تأیید حذف' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] text-[11px]"
                                  >
                                    {isFa ? 'انصراف' : 'No'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  title={isFa ? 'حذف پروژه' : 'Delete project'}
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  className="p-1.5 rounded-lg text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Create New Project Form */}
            <form
              onSubmit={handleCreate}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 p-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <FolderPlus className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'ایجاد پروژه جدید و انتخاب کارفرما' : 'Create New Project & Assign Employer'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام پروژه *' : 'Project Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={isFa ? 'مثال: پروژه احداث نیروگاه...' : 'e.g. Combined Cycle Power Plant'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کد پروژه / شماره قرارداد' : 'Project Code / Contract No.'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="PP-01 / C-..."
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کارفرما (از فهرست تعریف‌شده)' : 'Employer'}
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={newEmployerId}
                      onChange={(e) => setNewEmployerId(e.target.value)}
                      className="flex-1 h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                    >
                      <option value="">
                        {isFa ? 'بدون کارفرما (حالت خام)' : 'Unassigned (Neutral)'}
                      </option>
                      {employers.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nameFa}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title={isFa ? 'تعریف کارفرمای جدید' : 'Add Employer'}
                      onClick={() => {
                        setStudioAssignTarget('new');
                        setStudioModalOpen(true);
                      }}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--accent-primary)] text-xs font-semibold shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Employer Summary Strip */}
              <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {newResolvedEmployer.logos.length > 0 && (
                    <div className="shrink-0 p-1 rounded border border-[var(--border-subtle)] bg-white">
                      <EmployerFormLogo employer={newResolvedEmployer} height={34} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                      <span className="truncate">
                        {newResolvedEmployer.isConfigured
                          ? isFa
                            ? newResolvedEmployer.nameFa
                            : newResolvedEmployer.nameEn
                          : isFa
                            ? 'بدون کارفرما — قالب عمومی بدون لوگو و عنوان شرکت'
                            : 'Neutral Default — No company logo or preset'}
                      </span>
                    </div>
                    {newResolvedEmployer.companyFullName && (
                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                        {newResolvedEmployer.companyFullName}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {user && (
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={copyUsers}
                    onChange={(e) => setCopyUsers(e.target.checked)}
                  />
                  <span>
                    {isFa
                      ? 'کپی حساب‌های کاربری فعلی به پروژه جدید (بدون کپی کردن داده‌های انبار و فرم‌ها)'
                      : 'Copy current user accounts to the new project (without warehouse records)'}
                  </span>
                </label>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ایجاد و ورود به پروژه' : 'Create & Switch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Inline Employer Studio Modal when triggered inside Project Manager */}
      {studioModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'محیط اختصاصی تعریف کارفرما و طراحی فرم‌ها' : 'Employer & Custom Form Studio'}
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
                onAssignEmployer={(empId) => {
                  if (studioAssignTarget === 'edit') {
                    setEditEmployerId(empId);
                  } else {
                    setNewEmployerId(empId);
                  }
                  setStudioModalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
