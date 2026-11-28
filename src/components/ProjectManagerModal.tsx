import React, { useState } from 'react';
import {
  Building2,
  Check,
  Database,
  Edit3,
  FileText,
  FolderPlus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError } from '../lib/api.ts';
import { resolveEmployerLogoSrc } from '../lib/employerLogoCache.ts';
import {
  formatDocumentNumberWithPlantCode,
  sanitizePlantAbbreviation,
  validatePlantAbbreviation,
} from '../shared/docNumbering.ts';
import {
  DEFAULT_EMPLOYER_ID,
  isBuiltInEmployerId,
  resolveEmployerProfile,
} from '../shared/employers.ts';
import type { EmployerId, PlantAbbreviationPosition } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';
import { DeveloperFormRequestPanel } from './DeveloperFormRequestPanel.tsx';

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
    isSuperuser,
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
  const [newPlantAbbreviation, setNewPlantAbbreviation] = useState('');
  const [newUsePlantAbbr, setNewUsePlantAbbr] = useState(false);
  const [newPlantAbbrPos, setNewPlantAbbrPos] = useState<PlantAbbreviationPosition>('prefix');
  const [newContractRef, setNewContractRef] = useState('');
  const [newEmployerId, setNewEmployerId] = useState<EmployerId>(DEFAULT_EMPLOYER_ID);
  const [copyUsers, setCopyUsers] = useState(Boolean(user));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editPlantAbbreviation, setEditPlantAbbreviation] = useState('');
  const [editUsePlantAbbr, setEditUsePlantAbbr] = useState(false);
  const [editPlantAbbrPos, setEditPlantAbbrPos] = useState<PlantAbbreviationPosition>('prefix');
  const [editContractRef, setEditContractRef] = useState('');
  const [editEmployerId, setEditEmployerId] = useState<EmployerId>(DEFAULT_EMPLOYER_ID);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [requestEmployerModalOpen, setRequestEmployerModalOpen] = useState(false);

  const builtInEmployers = employers.filter((e) => e.isBuiltIn || isBuiltInEmployerId(e.id));

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
          ? `پروژه فعال به «${target?.name || id}» (${targetEmp.isConfigured ? `کارفرما: ${targetEmp.nameFa}` : 'بدون کارفرما'}) تغییر یافت.`
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
    const abbrCheck = validatePlantAbbreviation(newPlantAbbreviation);
    if (!abbrCheck.valid) {
      notify('error', (isFa ? abbrCheck.errorFa : abbrCheck.errorEn) || '');
      return;
    }
    setCreating(true);
    try {
      const created = await createProject({
        name: newName.trim(),
        code: newCode.trim() || undefined,
        plantAbbreviation: abbrCheck.normalized,
        usePlantAbbreviationInDocs: Boolean(abbrCheck.normalized && newUsePlantAbbr),
        plantAbbreviationPosition: newPlantAbbrPos,
        contractRef: newContractRef.trim() || undefined,
        employerId: newEmployerId,
        copyUsers: Boolean(user && copyUsers),
        autoSwitch: true,
      });
      const createdEmp = resolveEmployerProfile(created, employers);
      setNewName('');
      setNewCode('');
      setNewPlantAbbreviation('');
      setNewUsePlantAbbr(false);
      setNewPlantAbbrPos('prefix');
      setNewContractRef('');
      setNewEmployerId(DEFAULT_EMPLOYER_ID);
      notify(
        'success',
        isFa
          ? `پروژه «${created.name}» ${createdEmp.isConfigured ? `با کارفرمای «${createdEmp.nameFa}»` : ''} ایجاد و فعال شد.`
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
    const abbrCheck = validatePlantAbbreviation(editPlantAbbreviation);
    if (!abbrCheck.valid) {
      notify('error', (isFa ? abbrCheck.errorFa : abbrCheck.errorEn) || '');
      return;
    }
    setBusyId(id);
    try {
      await renameProject(id, {
        name: editName.trim(),
        code: editCode.trim() || undefined,
        plantAbbreviation: abbrCheck.normalized,
        usePlantAbbreviationInDocs: Boolean(abbrCheck.normalized && editUsePlantAbbr),
        plantAbbreviationPosition: editPlantAbbrPos,
        contractRef: editContractRef.trim(),
        employerId: editEmployerId,
      });
      const updatedEmp = resolveEmployerProfile({ employerId: editEmployerId }, employers);
      setEditingId(null);
      notify(
        'success',
        isFa
          ? `تنظیمات پروژه و کارفرمای «${updatedEmp.nameFa}» با موفقیت به‌روزرسانی شد.`
          : `Project settings and employer "${updatedEmp.nameEn}" updated.`,
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
                {isSuperuser
                  ? isFa
                    ? 'مدیریت پروژه‌ها و انتخاب کارفرما'
                    : 'Manage Projects & Assign Employers'
                  : isFa
                    ? 'انتخاب پروژه فعال'
                    : 'Switch Active Project'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {isSuperuser && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenEmployersPage) {
                      onClose();
                      onOpenEmployersPage();
                    } else {
                      setRequestEmployerModalOpen(true);
                    }
                  }}
                  className="h-8 px-3 rounded-lg border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>
                    {onOpenEmployersPage
                      ? isFa
                        ? 'کارفرمایان و درخواست فرم'
                        : 'Employers & Form Requests'
                      : isFa
                        ? 'درخواست کارفرمای جدید'
                        : 'Request New Employer'}
                  </span>
                </button>
              )}
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
                {isSuperuser
                  ? isFa
                    ? 'انتخاب پروژه فعال:'
                    : 'Select Active Project:'
                  : isFa
                    ? 'پروژه‌های مجاز تخصیص‌یافته به حساب شما:'
                    : 'Your Assigned Projects:'}
              </div>
              <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                {projects.map((p) => {
                  const isActive = p.id === activeProjectId;
                  const isEditing = isSuperuser && editingId === p.id;
                  const isConfirmingDel = isSuperuser && confirmDeleteId === p.id;
                  const isDefault = Boolean(p.isDefault || p.id === 'default');
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder={isFa ? 'نام پروژه (مثلاً: نیروگاه نکا)' : 'Project name (e.g. Neka Power Plant)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              maxLength={3}
                              data-testid="project-edit-plant-abbr-input"
                              value={editPlantAbbreviation}
                              onChange={(e) => setEditPlantAbbreviation(sanitizePlantAbbreviation(e.target.value))}
                              placeholder={isFa ? 'مخفف نیروگاه (۲-۳ حرف، مثل NK)' : 'Plant Abbr (2-3 letters, e.g. NK)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono uppercase focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editContractRef}
                              onChange={(e) => setEditContractRef(e.target.value)}
                              placeholder={isFa ? 'کد / شماره قرارداد مرجع (اختیاری)' : 'Reference Contract No. (optional)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={editCode}
                              onChange={(e) => setEditCode(e.target.value)}
                              placeholder={isFa ? 'کد پروژه (اختیاری)' : 'Project Code (optional)'}
                              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <div className="sm:col-span-2 flex items-center gap-1">
                              <select
                                data-testid="project-edit-employer-select"
                                aria-label={isFa ? 'انتخاب کارفرما' : 'Select employer'}
                                value={editEmployerId}
                                onChange={(e) => setEditEmployerId(e.target.value)}
                                className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                              >
                                {builtInEmployers.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.nameFa} {emp.shortName ? `(${emp.shortName})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {editPlantAbbreviation.length >= 2 && (
                            <div className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2">
                              <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-primary)] cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  data-testid="project-edit-use-plant-abbr-checkbox"
                                  checked={editUsePlantAbbr}
                                  onChange={(e) => setEditUsePlantAbbr(e.target.checked)}
                                  className="w-3.5 h-3.5 accent-[var(--accent-primary)]"
                                />
                                <span>
                                  {isFa
                                    ? 'درج مخفف نیروگاه در شماره‌گذاری فرم‌ها'
                                    : 'Include plant abbreviation in document numbers'}
                                </span>
                              </label>
                              {editUsePlantAbbr && (
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]/70">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      data-testid="project-edit-plant-abbr-pos-prefix"
                                      onClick={() => setEditPlantAbbrPos('prefix')}
                                      className={`h-6 px-2 rounded border text-[10.5px] font-semibold ${
                                        editPlantAbbrPos === 'prefix'
                                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      {isFa ? 'ابتدای شماره' : 'At Start'}
                                    </button>
                                    <button
                                      type="button"
                                      data-testid="project-edit-plant-abbr-pos-before"
                                      onClick={() => setEditPlantAbbrPos('before_number')}
                                      className={`h-6 px-2 rounded border text-[10.5px] font-semibold ${
                                        editPlantAbbrPos === 'before_number'
                                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      {isFa ? 'قبل از عدد ردیف' : 'Before Number'}
                                    </button>
                                  </div>
                                  <span dir="ltr" className="text-[11px] font-mono font-bold text-[var(--accent-primary)]">
                                    {formatDocumentNumberWithPlantCode('TU', '0001', {
                                      plantAbbreviation: editPlantAbbreviation,
                                      usePlantAbbreviationInDocs: true,
                                      plantAbbreviationPosition: editPlantAbbrPos,
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              data-testid="project-edit-save-btn"
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
                            {resolvedEmp.logos.length > 0 ? (
                              <div className="w-11 h-8 rounded-lg border border-[var(--border-subtle)] bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                                <img
                                  src={resolveEmployerLogoSrc(resolvedEmp.logos[0].dataUrl)}
                                  alt={resolvedEmp.shortName || resolvedEmp.nameFa}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>
                            ) : (
                              <Database
                                className={`w-4 h-4 shrink-0 ${
                                  isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                                }`}
                              />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                                <span className="truncate">{p.name}</span>
                                {p.plantAbbreviation && (
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                                  >
                                    {p.plantAbbreviation}
                                  </span>
                                )}
                                {p.code && (
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                  >
                                    {p.code}
                                  </span>
                                )}
                                {p.contractRef && (
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]"
                                  >
                                    {p.contractRef}
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
                                      ? 'بدون کارفرما'
                                      : 'No Employer Assigned'}
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

                            {isSuperuser && (
                              <button
                                type="button"
                                data-testid={`project-edit-btn-${p.id}`}
                                aria-label={isFa ? 'ویرایش پروژه و کارفرما' : 'Edit project & employer'}
                                title={isFa ? 'ویرایش پروژه و کارفرما' : 'Edit project & employer'}
                                onClick={() => {
                                  setEditingId(p.id);
                                  setEditName(p.name);
                                  setEditCode(p.code || '');
                                  setEditPlantAbbreviation(p.plantAbbreviation || '');
                                  setEditUsePlantAbbr(Boolean(p.usePlantAbbreviationInDocs));
                                  setEditPlantAbbrPos(p.plantAbbreviationPosition || 'prefix');
                                  setEditContractRef(p.contractRef || '');
                                  setEditEmployerId(p.employerId || DEFAULT_EMPLOYER_ID);
                                }}
                                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {isSuperuser &&
                              !isDefault &&
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

            {/* Create New Project Form (SUPERUSER ONLY) */}
            {isSuperuser && (
              <form
                onSubmit={handleCreate}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 p-4 space-y-3"
              >
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                <FolderPlus className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'ایجاد پروژه جدید و انتخاب کارفرما' : 'Create New Project & Assign Employer'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نام پروژه *' : 'Project Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={isFa ? 'مثلاً: نیروگاه نکا' : 'e.g. Neka Power Plant'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'مخفف نیروگاه (۲ تا ۳ حرف انگلیسی)' : 'Plant Abbr. (2-3 letters)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    maxLength={3}
                    data-testid="project-new-plant-abbr-input"
                    value={newPlantAbbreviation}
                    onChange={(e) => setNewPlantAbbreviation(sanitizePlantAbbreviation(e.target.value))}
                    placeholder="NK"
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono uppercase focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                {newPlantAbbreviation.length >= 2 && (
                  <div className="sm:col-span-12 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2">
                    <label className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--text-primary)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="project-new-use-plant-abbr-checkbox"
                        checked={newUsePlantAbbr}
                        onChange={(e) => setNewUsePlantAbbr(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[var(--accent-primary)]"
                      />
                      <span>
                        {isFa
                          ? 'درج مخفف نیروگاه در شماره‌گذاری خودکار فرم‌ها و اسناد'
                          : 'Include plant abbreviation in automatic document numbers'}
                      </span>
                    </label>
                    {newUsePlantAbbr && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]/70">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNewPlantAbbrPos('prefix')}
                            className={`h-7 px-2.5 rounded-md border text-[11px] font-semibold ${
                              newPlantAbbrPos === 'prefix'
                                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {isFa ? 'ابتدای شماره' : 'At Start'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPlantAbbrPos('before_number')}
                            className={`h-7 px-2.5 rounded-md border text-[11px] font-semibold ${
                              newPlantAbbrPos === 'before_number'
                                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {isFa ? 'قبل از عدد ردیف' : 'Before Number'}
                          </button>
                        </div>
                        <span dir="ltr" className="text-[11px] font-mono font-bold text-[var(--accent-primary)]">
                          {formatDocumentNumberWithPlantCode('TU', '0001', {
                            plantAbbreviation: newPlantAbbreviation,
                            usePlantAbbreviationInDocs: true,
                            plantAbbreviationPosition: newPlantAbbrPos,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کارفرما' : 'Employer'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={newEmployerId}
                      onChange={(e) => setNewEmployerId(e.target.value)}
                      className="flex-1 h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium focus:outline-none focus:border-[var(--accent-primary)]"
                    >
                      {builtInEmployers.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nameFa} {emp.shortName ? `(${emp.shortName})` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      title={isFa ? 'درخواست افزودن کارفرمای جدید به سازنده' : 'Request New Employer from Developer'}
                      onClick={() => setRequestEmployerModalOpen(true)}
                      className="h-9 px-2.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-soft)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)] text-[var(--accent-primary)] text-xs font-semibold shrink-0 flex items-center gap-1 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isFa ? 'درخواست کارفرما' : 'Request'}</span>
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کد / شماره قرارداد مرجع (اختیاری)' : 'Reference Contract Code / No. (optional)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newContractRef}
                    onChange={(e) => setNewContractRef(e.target.value)}
                    placeholder={isFa ? 'مثال: MD1-NEKA-1404' : 'e.g. CON-2026-01'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div className="sm:col-span-12">
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کد اختصاری پروژه (اختیاری)' : 'Project Short Code (optional)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="PP-01"
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                  />
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
                            ? 'بدون کارفرما'
                            : 'No Employer Assigned'}
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
            )}
          </div>
        </div>
      </div>

      {/* Inline Request New Employer Modal when triggered inside Project Manager */}
      {isSuperuser && requestEmployerModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                {isFa
                  ? 'درخواست تعریف کارفرمای جدید و ارسال فرم‌ها به سازنده'
                  : 'Request New Employer & Submit Forms to Developer'}
              </span>
              <button
                type="button"
                aria-label={isFa ? 'بستن' : 'Close'}
                onClick={() => setRequestEmployerModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              <DeveloperFormRequestPanel
                compact
                defaultRequestType="new_employer"
                onSubmitted={() => setRequestEmployerModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
