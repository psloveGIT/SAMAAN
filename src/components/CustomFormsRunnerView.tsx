import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  FileText,
  PackageSearch,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { resolveEmployerLogoById } from '../shared/employers.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  CustomEmployerForm,
  CustomFormSubmission,
  DetailedComputed,
  GeneralEntry,
} from '../shared/types.ts';
import {
  OfficialFormHeader,
  OfficialFormSignatures,
} from './OfficialSheetHeader.tsx';

interface CustomFormsRunnerViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
  onOpenEmployerStudio: () => void;
}

export const CustomFormsRunnerView: React.FC<CustomFormsRunnerViewProps> = ({
  refreshSignal,
  onDataChanged,
  onOpenEmployerStudio,
}) => {
  const { user, prefs, activeProject, activeEmployer, formatDate, notify, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const customForms = activeEmployer.customForms || [];
  const [selectedFormId, setSelectedFormId] = useState<string>(() => customForms[0]?.id || '');
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);
  const [generalRows, setGeneralRows] = useState<GeneralEntry[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedComputed[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [packingListNo, setPackingListNo] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<CustomFormSubmission | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!customForms.some((c) => c.id === selectedFormId)) {
      setSelectedFormId(customForms[0]?.id || '');
    }
  }, [customForms, selectedFormId]);

  const activeForm: CustomEmployerForm | null = useMemo(
    () => customForms.find((c) => c.id === selectedFormId) || customForms[0] || null,
    [customForms, selectedFormId],
  );

  const loadData = useCallback(async () => {
    try {
      const res = await apiRequest<{
        submissions?: CustomFormSubmission[];
        generalEntries?: GeneralEntry[];
        detailedItems?: DetailedComputed[];
      }>('/api/custom-forms');
      setSubmissions(res.submissions || []);
      setGeneralRows(res.generalEntries || []);
      setDetailedRows(res.detailedItems || []);
    } catch {
      // Ignore transient error
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const packingOptions = useMemo(() => {
    const unique = new Set<string>();
    generalRows.forEach((g) => {
      if (g.packingListNo) unique.add(g.packingListNo);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [generalRows]);

  const initDraftFromForm = useCallback(
    (form: CustomEmployerForm, sub?: CustomFormSubmission | null) => {
      if (sub) {
        setEditingId(sub.id);
        setDocNo(sub.docNo);
        setDate(sub.date);
        setPackingListNo(sub.packingListNo || '');
        setFieldValues(sub.fieldValues || {});
        setRows(sub.rows || []);
        setNotes(sub.notes || '');
        return;
      }
      setEditingId(null);
      setDocNo(`CF-${Date.now().toString().slice(-4)}`);
      setDate(getTodayIso());
      setPackingListNo('');
      const initialFields: Record<string, string> = {};
      form.headerFields.forEach((hf) => {
        if (hf.dataBinding === 'projectName') {
          initialFields[hf.id] = activeProject?.name || '';
        } else if (hf.dataBinding === 'arrivalDate') {
          initialFields[hf.id] = formatDate(getTodayIso());
        } else {
          initialFields[hf.id] = hf.defaultValue || '';
        }
      });
      setFieldValues(initialFields);
      const count = form.defaultRowCount || 5;
      const emptyRows = Array.from({ length: count }, (_, idx) => {
        const obj: Record<string, string> = {};
        form.tableColumns.forEach((c) => {
          obj[c.id] = c.dataBinding === 'rowNo' ? String(idx + 1) : '';
        });
        return obj;
      });
      setRows(emptyRows);
      setNotes('');
    },
    [activeProject?.name, formatDate],
  );

  useEffect(() => {
    if (activeForm && !activeSubmission && !editingId) {
      initDraftFromForm(activeForm, null);
    }
  }, [activeForm, activeSubmission, editingId, initDraftFromForm]);

  const handleLinkPacking = (pkNo: string) => {
    setPackingListNo(pkNo);
    if (!activeForm || !pkNo) return;
    const genMatches = generalRows.filter((g) => g.packingListNo === pkNo);
    const detMatches = detailedRows.filter((d) => d.shipmentNo === pkNo);
    const firstGen = genMatches[0];

    setFieldValues((prev) => {
      const next = { ...prev };
      activeForm.headerFields.forEach((hf) => {
        if (hf.dataBinding === 'projectName') next[hf.id] = activeProject?.name || next[hf.id] || '';
        if (hf.dataBinding === 'packingListNo') next[hf.id] = pkNo;
        if (hf.dataBinding === 'supplier') next[hf.id] = firstGen?.supplier || detMatches[0]?.supplier || '';
        if (hf.dataBinding === 'arrivalDate')
          next[hf.id] = formatDate(firstGen?.arrivalDate || detMatches[0]?.arrivalDate || getTodayIso());
        if (hf.dataBinding === 'island') next[hf.id] = firstGen?.island || detMatches[0]?.island || '';
        if (hf.dataBinding === 'system') next[hf.id] = firstGen?.system || detMatches[0]?.system || '';
        if (hf.dataBinding === 'unit') next[hf.id] = firstGen?.unit || detMatches[0]?.unit || '';
      });
      return next;
    });

    if (activeForm.hasTable && (detMatches.length > 0 || genMatches.length > 0)) {
      const populated =
        detMatches.length > 0
          ? detMatches.map((d, idx) => {
              const rowObj: Record<string, string> = {};
              activeForm.tableColumns.forEach((col) => {
                if (col.dataBinding === 'rowNo') rowObj[col.id] = String(idx + 1);
                else if (col.dataBinding === 'description') rowObj[col.id] = d.description || d.generalDescription || '';
                else if (col.dataBinding === 'itemCode') rowObj[col.id] = d.itemCode || '';
                else if (col.dataBinding === 'packageNo') rowObj[col.id] = d.packageNo || '';
                else if (col.dataBinding === 'qty') rowObj[col.id] = String(d.effectiveActualQty ?? d.packingQty ?? '');
                else if (col.dataBinding === 'unit') rowObj[col.id] = d.countingUnit || '';
                else if (col.dataBinding === 'remarks') rowObj[col.id] = d.notes || '';
                else rowObj[col.id] = '';
              });
              return rowObj;
            })
          : genMatches.map((g, idx) => {
              const rowObj: Record<string, string> = {};
              activeForm.tableColumns.forEach((col) => {
                if (col.dataBinding === 'rowNo') rowObj[col.id] = String(idx + 1);
                else if (col.dataBinding === 'description') rowObj[col.id] = g.itemDescription || '';
                else if (col.dataBinding === 'packageNo') rowObj[col.id] = g.packageNo || '';
                else if (col.dataBinding === 'qty') rowObj[col.id] = String(g.itemCount ?? '');
                else if (col.dataBinding === 'remarks') rowObj[col.id] = g.supplier || '';
                else rowObj[col.id] = '';
              });
              return rowObj;
            });
      setRows(populated);
    }
  };

  const handleSave = async () => {
    if (!activeForm) return;
    if (!docNo.trim()) {
      notify('error', isFa ? 'شماره سند را وارد کنید.' : 'Document No. is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        formId: activeForm.id,
        formTitle: activeForm.titleFa,
        docNo: docNo.trim(),
        date,
        packingListNo: packingListNo || undefined,
        fieldValues,
        rows,
        notes,
      };
      const res = editingId
        ? await apiRequest<{ submission: CustomFormSubmission }>(`/api/custom-forms/${encodeURIComponent(editingId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ submission: CustomFormSubmission }>('/api/custom-forms', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      setActiveSubmission(res.submission);
      setEditingId(res.submission.id);
      await loadData();
      onDataChanged();
      await triggerAutoSnapshot(`Custom Form ${res.submission.docNo}`);
      notify('success', isFa ? `فرم «${res.submission.docNo}» ذخیره شد.` : `Saved ${res.submission.docNo}`);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/custom-forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (activeSubmission?.id === id) {
        setActiveSubmission(null);
        if (activeForm) initDraftFromForm(activeForm, null);
      }
      await loadData();
      onDataChanged();
      notify('success', isFa ? 'رکورد فرم حذف شد.' : 'Record deleted.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  if (customForms.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
        <FilePlus2 className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          {isFa
            ? 'برای کارفرمای فعلی هنوز فرم اختصاصی جدیدی طراحی نشده است'
            : 'No custom forms designed for the active employer yet'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] max-w-lg mx-auto">
          {isFa
            ? 'ابتدا از بخش «مدیریت کارفرمایان و طراحی فرم» کارفرمای مورد نظر را انتخاب کرده و در تب «سازنده فرم‌های اختصاصی جدید»، فرم‌های مورد نیاز نیروگاه خود را بسازید.'
            : 'Open Employer & Form Studio to build bespoke forms for this power plant.'}
        </p>
        <button
          type="button"
          onClick={onOpenEmployerStudio}
          className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>{isFa ? 'ورود به طراحی کارفرما و فرم‌ها' : 'Open Form Studio'}</span>
        </button>
      </div>
    );
  }

  const filteredSubmissions = submissions.filter((s) => s.formId === activeForm?.id);

  return (
    <div className="space-y-4">
      {/* Top Form Selector + Controls */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {customForms.map((cf) => (
            <button
              key={cf.id}
              type="button"
              onClick={() => {
                setSelectedFormId(cf.id);
                setActiveSubmission(null);
                initDraftFromForm(cf, null);
              }}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                activeForm?.id === cf.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{cf.titleFa}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && activeForm && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveSubmission(null);
                  initDraftFromForm(activeForm, null);
                }}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'رکورد جدید' : 'New Entry'}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? (isFa ? 'در حال ذخیره...' : 'Saving...') : isFa ? 'ذخیره فرم' : 'Save Form'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="h-9 px-3 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isFa ? 'چاپ A4' : 'Print A4'}</span>
          </button>
        </div>
      </div>

      {/* Saved Submissions Bar */}
      {filteredSubmissions.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-2 print:hidden">
          <div className="text-xs font-bold text-[var(--text-secondary)]">
            {isFa ? 'اسناد ثبت‌شده برای این فرم:' : 'Saved Submissions:'}
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredSubmissions.map((sub) => (
              <div
                key={sub.id}
                className={`h-8 px-2.5 rounded-lg border flex items-center gap-2 text-xs ${
                  editingId === sub.id
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] font-semibold'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubmission(sub);
                    if (activeForm) initDraftFromForm(activeForm, sub);
                  }}
                  className="hover:underline"
                >
                  {sub.docNo} · {formatDate(sub.date)}
                </button>
                {canEdit &&
                  (confirmDeleteId === sub.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id)}
                        className="text-[11px] text-[var(--status-danger)] font-bold"
                      >
                        {isFa ? 'تأیید' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[11px] text-[var(--text-muted)]"
                      >
                        {isFa ? 'لغو' : 'No'}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(sub.id)}
                      className="text-[var(--status-danger)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor Controls Bar (Metadata + Packing Link) */}
      {activeForm && canEdit && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 print:hidden">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              {isFa ? 'شماره سند *' : 'Doc No. *'}
            </label>
            <input
              type="text"
              dir="ltr"
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              {isFa ? 'تاریخ (ISO)' : 'Date'}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              <span className="inline-flex items-center gap-1">
                <PackageSearch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>{isFa ? 'اتصال و پرکردن خودکار از پکینگ لیست (اختیاری)' : 'Auto-fill from Packing List'}</span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={packingListNo}
                onChange={(e) => handleLinkPacking(e.target.value)}
                dir="ltr"
                className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
              >
                <option value="">
                  {isFa ? '-- انتخاب شماره پکینگ لیست برای پرکردن خودکار --' : '-- Select Packing List --'}
                </option>
                {packingOptions.map((pk) => (
                  <option key={pk} value={pk}>
                    {pk}
                  </option>
                ))}
              </select>
              {packingListNo && (
                <button
                  type="button"
                  onClick={() => handleLinkPacking('')}
                  title={isFa ? 'پاک کردن انتخاب' : 'Clear selection'}
                  className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable A4 Sheet */}
      {activeForm && (
        <div
          className={`a4-sheet-container mx-auto bg-white text-black p-5 border border-[var(--border-subtle)] rounded-xl shadow-xs space-y-3 print:border-none print:shadow-none print:p-0 ${
            activeForm.orientation === 'landscape' ? 'max-w-[297mm]' : 'max-w-[210mm]'
          }`}
        >
          <OfficialFormHeader
            employer={activeEmployer}
            titleFa={activeForm.titleFa}
            titleEn={activeForm.titleEn}
            docCode={activeForm.docCode}
            revisionText={activeForm.revisionText}
            imsSubtitle={activeForm.imsSubtitle}
            headerLayout={activeForm.headerLayout}
            primaryLogo={resolveEmployerLogoById(
              activeEmployer,
              activeForm.primaryLogoId || '__default__',
              true,
            )}
            secondaryLogo={resolveEmployerLogoById(
              activeEmployer,
              activeForm.secondaryLogoId || '__none__',
              false,
            )}
            accentColor={activeForm.accentColor}
            rightMetaSlot={
              <>
                <div className="px-2 py-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">شماره فرم:</span>
                  <span dir="ltr" className="font-mono font-bold">
                    {docNo}
                  </span>
                </div>
                <div className="px-2 py-1 flex items-center justify-between gap-2">
                  <span className="font-semibold">تاریخ:</span>
                  <span dir="ltr" className="font-mono">
                    {formatDate(date)}
                  </span>
                </div>
              </>
            }
          />

          {/* Dynamic Header Fields */}
          {activeForm.headerFields.length > 0 && (
            <div
              dir="rtl"
              className="grid grid-cols-2 border border-black divide-x divide-x-reverse divide-y divide-black text-[11px]"
            >
              {activeForm.headerFields.map((hf) => (
                <div key={hf.id} className="px-2 py-1.5 flex items-center gap-2">
                  <span className="font-bold shrink-0">{hf.label}:</span>
                  <input
                    type="text"
                    readOnly={!canEdit}
                    value={fieldValues[hf.id] || ''}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [hf.id]: e.target.value }))
                    }
                    className="flex-1 bg-transparent border-b border-dotted border-slate-400 focus:border-black focus:outline-none text-[11px] print:border-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Dynamic Table */}
          {activeForm.hasTable && activeForm.tableColumns.length > 0 && (
            <div className="space-y-1.5">
              <table dir="rtl" className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="bg-slate-100">
                    {activeForm.tableColumns.map((col) => (
                      <th
                        key={col.id}
                        style={col.widthPercent ? { width: `${col.widthPercent}%` } : undefined}
                        className="border border-black px-2 py-1.5 text-center font-bold"
                      >
                        {col.label}
                      </th>
                    ))}
                    {canEdit && <th className="border border-black w-8 print:hidden" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((rowObj, rIdx) => (
                    <tr key={rIdx}>
                      {activeForm.tableColumns.map((col) => (
                        <td key={col.id} className="border border-black p-1 align-middle">
                          <input
                            type="text"
                            readOnly={!canEdit}
                            value={rowObj[col.id] ?? ''}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === rIdx ? { ...r, [col.id]: e.target.value } : r,
                                ),
                              )
                            }
                            className="w-full bg-transparent text-[11px] text-center focus:outline-none"
                          />
                        </td>
                      ))}
                      {canEdit && (
                        <td className="border border-black text-center print:hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((prev) => prev.filter((_, i) => i !== rIdx))
                            }
                            className="text-red-600 p-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const obj: Record<string, string> = {};
                    activeForm.tableColumns.forEach((c) => {
                      obj[c.id] = c.dataBinding === 'rowNo' ? String(rows.length + 1) : '';
                    });
                    setRows((prev) => [...prev, obj]);
                  }}
                  className="h-7 px-2.5 rounded border border-slate-300 text-[11px] font-semibold hover:bg-slate-50 flex items-center gap-1 print:hidden"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isFa ? 'افزودن ردیف' : 'Add Row'}</span>
                </button>
              )}
            </div>
          )}

          {activeForm.bodyText && (
            <div dir="rtl" className="p-2 border border-black text-[11px] leading-relaxed bg-slate-50/60">
              {activeForm.bodyText}
            </div>
          )}

          {(notes || canEdit) && (
            <div dir="rtl" className="border border-black p-2 text-[11px]">
              <span className="font-bold">{isFa ? 'توضیحات تکمیلی: ' : 'Notes: '}</span>
              <input
                type="text"
                readOnly={!canEdit}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full mt-1 bg-transparent border-b border-dotted border-slate-400 focus:outline-none print:border-none"
              />
            </div>
          )}

          <OfficialFormSignatures
            signatures={activeForm.signatures}
            borderColor={activeForm.accentColor}
          />

          {activeForm.footerNote && (
            <div dir="rtl" className="text-[10px] text-black/75 pt-1">
              {activeForm.footerNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
