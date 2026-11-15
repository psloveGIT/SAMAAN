import React, { useState } from 'react';
import {
  Building2,
  Check,
  Database,
  Edit3,
  FileText,
  FolderPlus,
  ImagePlus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import {
  DEFAULT_EMPLOYER_ID,
  EMPLOYER_PRESETS,
  resolveEmployerProfile,
} from '../shared/employers.ts';
import type { EmployerCustomConfig, EmployerId } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';

interface ProjectManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({ open, onClose }) => {
  const {
    user,
    prefs,
    projects,
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
  const [newCustomConfig, setNewCustomConfig] = useState<EmployerCustomConfig>({});
  const [copyUsers, setCopyUsers] = useState(Boolean(user));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEmployerId, setEditEmployerId] = useState<EmployerId>(DEFAULT_EMPLOYER_ID);
  const [editCustomConfig, setEditCustomConfig] = useState<EmployerCustomConfig>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!open) return null;

  const readLogoFile = (file: File, onLoaded: (dataUrl: string) => void) => {
    if (file.size > 1024 * 1024 * 1.5) {
      notify(
        'error',
        isFa ? 'حجم تصویر لوگو نباید بیشتر از ۱.۵ مگابایت باشد.' : 'Logo file size must be under 1.5MB.',
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        onLoaded(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelect = async (id: string) => {
    if (id === activeProjectId) {
      onClose();
      return;
    }
    setBusyId(id);
    try {
      await switchProject(id);
      const target = projects.find((p) => p.id === id);
      const targetEmp = resolveEmployerProfile(target);
      notify(
        'info',
        isFa
          ? `پروژه فعال به «${target?.name || id}» (کارفرما: ${targetEmp.nameFa}) تغییر یافت.`
          : `Switched to "${target?.name || id}" (Client: ${targetEmp.nameEn}).`,
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
        employerConfig: newEmployerId === 'custom' ? newCustomConfig : undefined,
        copyUsers: Boolean(user && copyUsers),
        autoSwitch: true,
      });
      const createdEmp = resolveEmployerProfile(created);
      setNewName('');
      setNewCode('');
      setNewEmployerId(DEFAULT_EMPLOYER_ID);
      setNewCustomConfig({});
      notify(
        'success',
        isFa
          ? `پروژه «${created.name}» با فرم‌های اختصاصی «${createdEmp.nameFa}» ایجاد و فعال شد.`
          : `Project "${created.name}" created with "${createdEmp.nameEn}" forms.`,
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
        employerConfig: editEmployerId === 'custom' ? editCustomConfig : {},
      });
      setEditingId(null);
      notify(
        'success',
        isFa ? 'مشخصات پروژه و کارفرما با موفقیت به‌روزرسانی شد.' : 'Project and employer settings updated.',
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

  const newResolvedEmployer = resolveEmployerProfile({
    employerId: newEmployerId,
    employerConfig: newEmployerId === 'custom' ? newCustomConfig : undefined,
  });

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-[var(--accent-primary)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'مدیریت پروژه‌ها، کارفرمایان و فرم‌های اختصاصی' : 'Manage Projects, Employers & Form Suites'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? 'هر پروژه علاوه بر پایگاه داده مجزا، کارفرمای مخصوص خود را دارد و فرم‌های رسمی بر اساس کارفرمای انتخابی بارگذاری می‌شوند.'
                  : 'Each project has an isolated database and loads the official forms tailored to its selected employer.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
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
                const resolvedEmp = resolveEmployerProfile(p);

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
                          <select
                            value={editEmployerId}
                            onChange={(e) => setEditEmployerId(e.target.value as EmployerId)}
                            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                          >
                            {EMPLOYER_PRESETS.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {isFa ? `کارفرما: ${emp.nameFa}` : `Client: ${emp.nameEn}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {editEmployerId === 'custom' && (
                          <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={editCustomConfig.companyFullName || ''}
                              onChange={(e) =>
                                setEditCustomConfig((prev) => ({ ...prev, companyFullName: e.target.value }))
                              }
                              placeholder={isFa ? 'نام کامل شرکت کارفرما در سربرگ فرم‌ها' : 'Employer Full Company Title'}
                              className="sm:col-span-2 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                            />
                            <input
                              type="text"
                              value={editCustomConfig.shortName || ''}
                              onChange={(e) =>
                                setEditCustomConfig((prev) => ({ ...prev, shortName: e.target.value }))
                              }
                              placeholder={isFa ? 'نام کوتاه (در امضاها)' : 'Short Name'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editCustomConfig.docCodePrefix || ''}
                              onChange={(e) =>
                                setEditCustomConfig((prev) => ({ ...prev, docCodePrefix: e.target.value }))
                              }
                              placeholder={isFa ? 'پیشوند کد فرم (مثلاً SAB-FQP02)' : 'Doc Prefix (e.g. SAB-FQP02)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                            />
                            <label className="sm:col-span-2 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                              <span className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-subtle)]">
                                <ImagePlus className="w-3.5 h-3.5" />
                                <span>{isFa ? 'آپلود لوگو (اختیاری)' : 'Upload Logo'}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      readLogoFile(file, (dataUrl) =>
                                        setEditCustomConfig((prev) => ({ ...prev, logoDataUrl: dataUrl })),
                                      );
                                    }
                                  }}
                                />
                              </span>
                              {editCustomConfig.logoDataUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditCustomConfig((prev) => ({ ...prev, logoDataUrl: undefined }))
                                  }
                                  className="text-[11px] text-[var(--status-danger)] hover:underline"
                                >
                                  {isFa ? 'حذف لوگو' : 'Remove'}
                                </button>
                              )}
                            </label>
                          </div>
                        )}

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
                                {isFa
                                  ? `کارفرما: ${resolvedEmp.id === 'custom' ? resolvedEmp.companyFullName : resolvedEmp.nameFa}`
                                  : `Employer: ${resolvedEmp.id === 'custom' ? resolvedEmp.companyFullName : resolvedEmp.nameEn}`}
                              </span>
                              <span>·</span>
                              <span dir="ltr" className="font-mono text-[10px]">
                                {resolvedEmp.docCodePrefix}
                              </span>
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
                              setEditCustomConfig(p.employerConfig || {});
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
              <span>{isFa ? 'ایجاد پروژه جدید با دیتابیس و فرم‌های کارفرمای مستقل' : 'Create New Project with Employer Form Suite'}</span>
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
                  placeholder={isFa ? 'مثال: نیروگاه نکا، نیروگاه سبزوار' : 'e.g. Neka Power Plant'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'کد پروژه (اختیاری)' : 'Code (Optional)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="NEKA"
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  {isFa ? 'کارفرما (انتخاب پکیج فرم‌ها)' : 'Employer (Form Suite)'}
                </label>
                <select
                  value={newEmployerId}
                  onChange={(e) => setNewEmployerId(e.target.value as EmployerId)}
                  className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {EMPLOYER_PRESETS.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {isFa ? emp.nameFa : emp.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {newEmployerId === 'custom' && (
              <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={newCustomConfig.companyFullName || ''}
                  onChange={(e) =>
                    setNewCustomConfig((prev) => ({ ...prev, companyFullName: e.target.value }))
                  }
                  placeholder={isFa ? 'نام کامل شرکت کارفرما در سربرگ فرم‌ها' : 'Employer Full Company Title'}
                  className="sm:col-span-2 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
                <input
                  type="text"
                  value={newCustomConfig.shortName || ''}
                  onChange={(e) =>
                    setNewCustomConfig((prev) => ({ ...prev, shortName: e.target.value }))
                  }
                  placeholder={isFa ? 'نام کوتاه کارفرما در امضاها' : 'Short Name'}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={newCustomConfig.docCodePrefix || ''}
                  onChange={(e) =>
                    setNewCustomConfig((prev) => ({ ...prev, docCodePrefix: e.target.value }))
                  }
                  placeholder={isFa ? 'پیشوند کد فرم‌ها (مثلاً WH-FQP02)' : 'Form Code Prefix'}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
                <label className="sm:col-span-2 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-subtle)]">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{isFa ? 'آپلود لوگوی کارفرما (اختیاری)' : 'Upload Employer Logo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          readLogoFile(file, (dataUrl) =>
                            setNewCustomConfig((prev) => ({ ...prev, logoDataUrl: dataUrl })),
                          );
                        }
                      }}
                    />
                  </span>
                  {newCustomConfig.logoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewCustomConfig((prev) => ({ ...prev, logoDataUrl: undefined }))
                      }
                      className="text-[11px] text-[var(--status-danger)] hover:underline"
                    >
                      {isFa ? 'حذف لوگو' : 'Remove'}
                    </button>
                  )}
                </label>
              </div>
            )}

            {/* Employer Form Pack Preview Strip */}
            <div className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="shrink-0 p-1 rounded border border-[var(--border-subtle)] bg-white">
                  <EmployerFormLogo employer={newResolvedEmployer} height={34} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                    <span className="truncate">
                      {isFa ? newResolvedEmployer.formPackTitleFa : newResolvedEmployer.formPackTitleEn}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">
                    {newResolvedEmployer.companyFullName}
                  </div>
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
  );
};
