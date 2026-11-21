import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileUp,
  PackageSearch,
  Plus,
  Printer,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import {
  DEFAULT_UPLOADED_FORM_PRINT_SETTINGS,
  resolveEmployerLogoById,
} from '../shared/employers.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { buildPrintPageRule } from '../shared/printPageCss.ts';
import type {
  CustomEmployerForm,
  CustomFormSubmission,
  DetailedComputed,
  EmployerUploadedForm,
  GeneralEntry,
  SiteEntryMinutesRecord,
  TransitEntry,
  UploadedFormDataSource,
  UploadedFormPrintSettings,
} from '../shared/types.ts';
import {
  base64ToBlobUrl,
  buildUploadedFormContextData,
  exportFilledExcel,
  exportFilledWord,
} from '../shared/uploadedFormEngine.ts';
import {
  OfficialFormHeader,
  OfficialFormSignatures,
} from './OfficialSheetHeader.tsx';
import { UploadedFormA4Sheet } from './UploadedFormA4Sheet.tsx';

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

  const uploadedForms = activeEmployer.uploadedForms || [];
  const customForms = activeEmployer.customForms || [];

  const [selectedUploadedId, setSelectedUploadedId] = useState<string>(() => uploadedForms[0]?.id || '');
  const [selectedLegacyId, setSelectedLegacyId] = useState<string>(() => customForms[0]?.id || '');

  // Shared warehouse datasets for auto-filling uploaded forms
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);
  const [generalRows, setGeneralRows] = useState<GeneralEntry[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedComputed[]>([]);
  const [serverPackings, setServerPackings] = useState<string[]>([]);
  const [siteEntryRows, setSiteEntryRows] = useState<SiteEntryMinutesRecord[]>([]);
  const [transitRows, setTransitRows] = useState<TransitEntry[]>([]);

  // Uploaded form runner controls
  const [dataSourceOverride, setDataSourceOverride] = useState<UploadedFormDataSource | ''>('');
  const [selectedPackingNo, setSelectedPackingNo] = useState<string>('');
  const [selectedSiteEntryId, setSelectedSiteEntryId] = useState<string>('');
  const [manualFieldOverrides, setManualFieldOverrides] = useState<Record<string, string>>({});
  const [printOverrides, setPrintOverrides] = useState<Partial<UploadedFormPrintSettings>>({});
  const [showCalibration, setShowCalibration] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Legacy form state (kept only for employers with legacy manual forms and no uploaded forms)
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
    if (uploadedForms.length > 0 && !uploadedForms.some((f) => f.id === selectedUploadedId)) {
      setSelectedUploadedId(uploadedForms[0].id);
      setDataSourceOverride('');
      setPrintOverrides({});
      setManualFieldOverrides({});
    }
  }, [uploadedForms, selectedUploadedId]);

  useEffect(() => {
    if (customForms.length > 0 && !customForms.some((c) => c.id === selectedLegacyId)) {
      setSelectedLegacyId(customForms[0].id);
    }
  }, [customForms, selectedLegacyId]);

  const activeUploadedForm: EmployerUploadedForm | null = useMemo(
    () => uploadedForms.find((f) => f.id === selectedUploadedId) || uploadedForms[0] || null,
    [uploadedForms, selectedUploadedId],
  );

  const activeLegacyForm: CustomEmployerForm | null = useMemo(
    () => customForms.find((c) => c.id === selectedLegacyId) || customForms[0] || null,
    [customForms, selectedLegacyId],
  );

  const loadData = useCallback(async (packingParam = '') => {
    try {
      const pkQs = packingParam ? `&packing=${encodeURIComponent(packingParam)}` : '';
      const [cfRes, seRes, trRes] = await Promise.allSettled([
        apiRequest<{
          submissions?: CustomFormSubmission[];
          generalEntries?: GeneralEntry[];
          detailedItems?: DetailedComputed[];
          packings?: string[];
        }>(`/api/custom-forms?compact=1&limit=120${pkQs}`),
        apiRequest<{ minutes?: SiteEntryMinutesRecord[]; records?: SiteEntryMinutesRecord[] }>('/api/site-entry?compact=1&limit=80'),
        apiRequest<{ items?: TransitEntry[] }>('/api/transit?page=1&pageSize=120'),
      ]);

      if (cfRes.status === 'fulfilled') {
        setSubmissions(cfRes.value.submissions || []);
        setGeneralRows(cfRes.value.generalEntries || []);
        setDetailedRows(cfRes.value.detailedItems || []);
        if (cfRes.value.packings) setServerPackings(cfRes.value.packings);
      }
      if (seRes.status === 'fulfilled') {
        setSiteEntryRows(seRes.value.minutes || seRes.value.records || []);
      }
      if (trRes.status === 'fulfilled') {
        setTransitRows(trRes.value.items || []);
      }
    } catch {
      // Ignore transient load failures
    }
  }, []);

  useEffect(() => {
    loadData(selectedPackingNo);
  }, [loadData, refreshSignal, selectedPackingNo]);

  const packingOptions = useMemo(() => {
    const unique = new Set<string>(serverPackings);
    generalRows.forEach((g) => {
      if (g.packingListNo) unique.add(g.packingListNo);
    });
    detailedRows.forEach((d) => {
      if (d.shipmentNo) unique.add(d.shipmentNo);
    });
    transitRows.forEach((t) => {
      if (t.packingListNo) unique.add(t.packingListNo);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [serverPackings, generalRows, detailedRows, transitRows]);

  const effectiveSource: UploadedFormDataSource =
    dataSourceOverride || activeUploadedForm?.dataSource || 'general';

  const effectiveSources: UploadedFormDataSource[] = useMemo(() => {
    if (dataSourceOverride) return [dataSourceOverride];
    if (activeUploadedForm?.dataSources && activeUploadedForm.dataSources.length > 0) {
      return activeUploadedForm.dataSources;
    }
    return [effectiveSource];
  }, [dataSourceOverride, activeUploadedForm?.dataSources, effectiveSource]);

  const effectiveUploadedForm: EmployerUploadedForm | null = useMemo(() => {
    if (!activeUploadedForm) return null;
    return {
      ...activeUploadedForm,
      dataSource: effectiveSource,
      dataSources: effectiveSources,
      printSettings: {
        ...(activeUploadedForm.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS),
        ...printOverrides,
      },
    };
  }, [activeUploadedForm, effectiveSource, effectiveSources, printOverrides]);

  const selectedSiteEntryRecord = useMemo(
    () => siteEntryRows.find((r) => r.id === selectedSiteEntryId) || null,
    [siteEntryRows, selectedSiteEntryId],
  );

  const boundContextData = useMemo(() => {
    if (!effectiveUploadedForm) {
      return { headerTokens: {} as Record<string, string>, lineRows: [] as Array<Record<string, string>> };
    }
    return buildUploadedFormContextData({
      project: activeProject,
      employer: activeEmployer,
      calendar: prefs.calendar,
      dataSource: effectiveSource,
      dataSources: effectiveSources,
      siteEntry: selectedSiteEntryRecord,
      packingListNo: selectedPackingNo,
      generalRows,
      detailedRows,
      transitRows,
      manualOverrides: manualFieldOverrides,
    });
  }, [
    effectiveUploadedForm,
    activeProject,
    activeEmployer,
    prefs.calendar,
    effectiveSource,
    effectiveSources,
    selectedSiteEntryRecord,
    selectedPackingNo,
    generalRows,
    detailedRows,
    transitRows,
    manualFieldOverrides,
  ]);

  const handleDownloadFilled = async () => {
    if (!effectiveUploadedForm) return;
    setExporting(true);
    try {
      if (effectiveUploadedForm.fileType === 'excel') {
        await exportFilledExcel(
          effectiveUploadedForm,
          boundContextData.headerTokens,
          boundContextData.lineRows,
        );
        notify('success', isFa ? 'فایل اکسل پرشده آماده و دانلود شد.' : 'Filled Excel downloaded.');
      } else if (
        effectiveUploadedForm.fileType === 'word' &&
        effectiveUploadedForm.fileName.toLowerCase().endsWith('.docx')
      ) {
        await exportFilledWord(effectiveUploadedForm, boundContextData.headerTokens);
        notify('success', isFa ? 'فایل ورد پرشده آماده و دانلود شد.' : 'Filled Word document downloaded.');
      } else {
        const url = base64ToBlobUrl(
          effectiveUploadedForm.fileDataBase64,
          effectiveUploadedForm.mimeType,
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = effectiveUploadedForm.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      notify('error', isFa ? 'خطا در آماده‌سازی فایل خروجی.' : 'Failed to export filled document.');
    } finally {
      setExporting(false);
    }
  };

  // Legacy builder helpers
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
    if (uploadedForms.length === 0 && activeLegacyForm && !activeSubmission && !editingId) {
      initDraftFromForm(activeLegacyForm, null);
    }
  }, [uploadedForms.length, activeLegacyForm, activeSubmission, editingId, initDraftFromForm]);

  const handleLinkPackingLegacy = (pkNo: string) => {
    setPackingListNo(pkNo);
    if (!activeLegacyForm || !pkNo) return;
    const genMatches = generalRows.filter((g) => g.packingListNo === pkNo);
    const detMatches = detailedRows.filter((d) => d.shipmentNo === pkNo);
    const firstGen = genMatches[0];

    setFieldValues((prev) => {
      const next = { ...prev };
      activeLegacyForm.headerFields.forEach((hf) => {
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

    if (activeLegacyForm.hasTable && (detMatches.length > 0 || genMatches.length > 0)) {
      const populated =
        detMatches.length > 0
          ? detMatches.map((d, idx) => {
              const rowObj: Record<string, string> = {};
              activeLegacyForm.tableColumns.forEach((col) => {
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
              activeLegacyForm.tableColumns.forEach((col) => {
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

  const handleSaveLegacy = async () => {
    if (!activeLegacyForm) return;
    if (!docNo.trim()) {
      notify('error', isFa ? 'شماره سند را وارد کنید.' : 'Document No. is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        formId: activeLegacyForm.id,
        formTitle: activeLegacyForm.titleFa,
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

  const handleDeleteLegacy = async (id: string) => {
    try {
      await apiRequest(`/api/custom-forms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (activeSubmission?.id === id) {
        setActiveSubmission(null);
        if (activeLegacyForm) initDraftFromForm(activeLegacyForm, null);
      }
      await loadData();
      onDataChanged();
      notify('success', isFa ? 'رکورد فرم حذف شد.' : 'Record deleted.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Empty State (Neither Uploaded nor Legacy Forms Exist)
  if (uploadedForms.length === 0 && customForms.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
        <FileUp className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          {isFa
            ? 'برای کارفرمای فعلی هنوز فرم رسمی شرکتی آپلود نشده است'
            : 'No official company forms uploaded for the active employer yet'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] max-w-xl mx-auto leading-relaxed">
          {isFa
            ? 'از بخش «مدیریت کارفرمایان و فرم‌های شرکتی»، فرم‌های آماده شرکت خود را با فرمت Excel (.xlsx)، Word (.docx)، PDF یا تصویر وارد کنید تا اطلاعات سامانه به‌صورت خودکار در آن‌ها قرار گرفته و با تنظیمات A4 چاپ یا دانلود شوند.'
            : 'Open Employer & Forms Studio to upload coded Excel, Word, PDF, or Image forms for this plant.'}
        </p>
        <button
          type="button"
          onClick={onOpenEmployerStudio}
          className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>{isFa ? 'آپلود و مدیریت فرم‌های کارفرما' : 'Open Employer Forms Studio'}</span>
        </button>
      </div>
    );
  }

  // Primary Experience: Uploaded Official Company Forms Runner
  if (uploadedForms.length > 0 && effectiveUploadedForm) {
    const printPortal =
      effectiveUploadedForm.fileType !== 'pdf'
        ? createPortal(
            <div id="samaan-form-print-root">
              <style>{`
                @media screen {
                  #samaan-form-print-root { display: none !important; }
                }
                @media print {
                  ${buildPrintPageRule(effectiveUploadedForm.printSettings.orientation, isFa, '6mm')}
                  body > *:not(#samaan-form-print-root) {
                    display: none !important;
                  }
                  #samaan-form-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                }
              `}</style>
              <UploadedFormA4Sheet
                form={effectiveUploadedForm}
                employer={activeEmployer}
                headerTokens={boundContextData.headerTokens}
                lineRows={boundContextData.lineRows}
                isFa={isFa}
                forPrint
              />
            </div>,
            document.body,
          )
        : null;

    return (
      <div className="space-y-4">
        {/* Form Selector + Primary Actions */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {uploadedForms.map((uf) => (
              <button
                key={uf.id}
                type="button"
                onClick={() => {
                  setSelectedUploadedId(uf.id);
                  setDataSourceOverride('');
                  setPrintOverrides({});
                  setManualFieldOverrides({});
                }}
                className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                  effectiveUploadedForm.id === uf.id
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{uf.titleFa}</span>
                {uf.formCode && (
                  <span className="text-[10px] opacity-80 font-mono" dir="ltr">
                    {uf.formCode}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCalibration((v) => !v)}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                showCalibration
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{isFa ? 'تنظیمات چاپ و ارتفاع سطر' : 'Print Calibration'}</span>
            </button>

            <button
              type="button"
              disabled={exporting}
              onClick={handleDownloadFilled}
              className="h-9 px-3 rounded-lg border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {effectiveUploadedForm.fileType === 'excel'
                  ? isFa
                    ? 'دانلود Excel پرشده'
                    : 'Download Filled XLSX'
                  : effectiveUploadedForm.fileType === 'word' &&
                      effectiveUploadedForm.fileName.toLowerCase().endsWith('.docx')
                    ? isFa
                      ? 'دانلود Word پرشده'
                      : 'Download Filled DOCX'
                    : isFa
                      ? 'دانلود فایل فرم'
                      : 'Download File'}
              </span>
            </button>

            {effectiveUploadedForm.fileType !== 'pdf' && (
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isFa ? 'چاپ مستقیم A4' : 'Print A4'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Record / Packing List Auto-Fill Controls */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                {isFa ? 'بخش منبع اطلاعات:' : 'Data Source:'}
              </label>
              <select
                value={effectiveSource}
                onChange={(e) => {
                  setDataSourceOverride(e.target.value as UploadedFormDataSource);
                  setSelectedPackingNo('');
                  setSelectedSiteEntryId('');
                }}
                className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="general">{isFa ? 'ثبت کلی تجهیزات (Packing Lists)' : 'General Equipment'}</option>
                <option value="siteEntry">{isFa ? 'صورتجلسات ورود کالا (Site Entry)' : 'Site Entry Minutes'}</option>
                <option value="detailed">{isFa ? 'ثبت جزئیات تجهیزات (Detailed)' : 'Detailed Equipment'}</option>
                <option value="transit">{isFa ? 'تجهیزات در راه (Transit)' : 'In-Transit'}</option>
                <option value="manual">{isFa ? 'تکمیل دستی متغیرها' : 'Manual Entry'}</option>
              </select>
            </div>

            {effectiveSource === 'siteEntry' ? (
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  <span className="inline-flex items-center gap-1">
                    <PackageSearch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'انتخاب صورتجلسه ورود جهت پرکردن خودکار فرم:' : 'Select Site Entry Minutes:'}</span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedSiteEntryId}
                    onChange={(e) => setSelectedSiteEntryId(e.target.value)}
                    className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="">
                      {isFa ? '-- انتخاب صورتجلسه ورود ثبت‌شده --' : '-- Select Site Entry Record --'}
                    </option>
                    {siteEntryRows.map((rec) => (
                      <option key={rec.id} value={rec.id}>
                        {rec.minutesNo} | {formatDate(rec.arrivalDate || rec.date)} | {rec.packingListNos.join(', ')}
                      </option>
                    ))}
                  </select>
                  {selectedSiteEntryId && (
                    <button
                      type="button"
                      onClick={() => setSelectedSiteEntryId('')}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : effectiveSource !== 'manual' ? (
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  <span className="inline-flex items-center gap-1">
                    <PackageSearch className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{isFa ? 'انتخاب شماره پکینگ لیست جهت خواندن و قرارگیری خودکار اطلاعات در فرم:' : 'Select Packing List No. to Populate Form:'}</span>
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedPackingNo}
                    onChange={(e) => setSelectedPackingNo(e.target.value)}
                    dir="ltr"
                    className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono"
                  >
                    <option value="">
                      {isFa ? '-- انتخاب شماره پکینگ لیست --' : '-- Select Packing List --'}
                    </option>
                    {packingOptions.map((pk) => (
                      <option key={pk} value={pk}>
                        {pk}
                      </option>
                    ))}
                  </select>
                  {selectedPackingNo && (
                    <button
                      type="button"
                      onClick={() => setSelectedPackingNo('')}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Detected Template Token Manual Adjustments */}
          {(effectiveUploadedForm.detectedTokens || []).length > 0 && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                {isFa ? 'مقادیر متغیرهای درون فرم (قابل ویرایش پیش از چاپ یا دانلود):' : 'Form Placeholder Values:'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {(effectiveUploadedForm.detectedTokens || []).map((tok) => {
                  const boundKey = effectiveUploadedForm.tokenBindings?.[tok];
                  const autoVal = boundKey
                    ? boundContextData.headerTokens[boundKey] || ''
                    : boundContextData.headerTokens[tok] || '';
                  return (
                    <div key={tok}>
                      <label className="block text-[10px] font-mono text-[var(--text-muted)] mb-0.5 truncate" dir="ltr">
                        {`{{${tok}}}`}
                      </label>
                      <input
                        type="text"
                        value={manualFieldOverrides[tok] ?? autoVal}
                        onChange={(e) =>
                          setManualFieldOverrides((prev) => ({
                            ...prev,
                            [tok]: e.target.value,
                            ...(boundKey ? { [boundKey]: e.target.value } : {}),
                          }))
                        }
                        className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Inline Print & Row Height Calibration */}
          {showCalibration && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5 bg-[var(--bg-canvas)] p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
                  {isFa ? 'کالیبراسیون سریع پرینت و سطرهای جدول (این جلسه)' : 'Session Print Calibration'}
                </span>
                <button
                  type="button"
                  onClick={() => setPrintOverrides({})}
                  className="text-[11px] text-[var(--text-secondary)] hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{isFa ? 'بازگشت به تنظیمات کارفرما' : 'Reset'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                    {isFa ? 'جهت A4' : 'Orientation'}
                  </label>
                  <select
                    value={effectiveUploadedForm.printSettings.orientation}
                    onChange={(e) =>
                      setPrintOverrides((p) => ({
                        ...p,
                        orientation: e.target.value as 'portrait' | 'landscape',
                      }))
                    }
                    className="w-full h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                  >
                    <option value="portrait">{isFa ? 'عمودی' : 'Portrait'}</option>
                    <option value="landscape">{isFa ? 'افقی' : 'Landscape'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                    {isFa ? 'فونت (pt)' : 'Font (pt)'}
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={20}
                    value={effectiveUploadedForm.printSettings.fontSizePt}
                    onChange={(e) =>
                      setPrintOverrides((p) => ({
                        ...p,
                        fontSizePt: Math.min(20, Math.max(6, Number(e.target.value) || 10)),
                      }))
                    }
                    className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                    {isFa ? 'مقیاس (%)' : 'Scale (%)'}
                  </label>
                  <input
                    type="number"
                    min={40}
                    max={150}
                    value={effectiveUploadedForm.printSettings.scalePercent}
                    onChange={(e) =>
                      setPrintOverrides((p) => ({
                        ...p,
                        scalePercent: Math.min(150, Math.max(40, Number(e.target.value) || 100)),
                      }))
                    }
                    className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-mono text-center"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] pt-4 cursor-pointer font-semibold text-[var(--accent-primary)] col-span-2 sm:col-span-1">
                  <input
                    type="checkbox"
                    checked={effectiveUploadedForm.printSettings.autoRowHeight}
                    onChange={(e) =>
                      setPrintOverrides((p) => ({ ...p, autoRowHeight: e.target.checked }))
                    }
                  />
                  <span>{isFa ? 'ارتفاع سطر خودکار' : 'AutoFit Rows'}</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={effectiveUploadedForm.printSettings.showGridlines}
                    onChange={(e) =>
                      setPrintOverrides((p) => ({ ...p, showGridlines: e.target.checked }))
                    }
                  />
                  <span>{isFa ? 'خطوط جدول' : 'Gridlines'}</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Live Calibrated A4 Preview */}
        <UploadedFormA4Sheet
          form={effectiveUploadedForm}
          employer={activeEmployer}
          headerTokens={boundContextData.headerTokens}
          lineRows={boundContextData.lineRows}
          isFa={isFa}
        />

        {printPortal}
      </div>
    );
  }

  // Fallback for Legacy Manually-Designed Custom Forms (if employer only has old customForms)
  const filteredSubmissions = submissions.filter((s) => s.formId === activeLegacyForm?.id);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {customForms.map((cf) => (
            <button
              key={cf.id}
              type="button"
              onClick={() => {
                setSelectedLegacyId(cf.id);
                setActiveSubmission(null);
                initDraftFromForm(cf, null);
              }}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                activeLegacyForm?.id === cf.id
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
          {canEdit && activeLegacyForm && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveSubmission(null);
                  initDraftFromForm(activeLegacyForm, null);
                }}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'رکورد جدید' : 'New Entry'}</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveLegacy}
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
                    if (activeLegacyForm) initDraftFromForm(activeLegacyForm, sub);
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
                        onClick={() => handleDeleteLegacy(sub.id)}
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

      {activeLegacyForm && canEdit && (
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
                onChange={(e) => handleLinkPackingLegacy(e.target.value)}
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
                  onClick={() => handleLinkPackingLegacy('')}
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

      {activeLegacyForm && (
        <div
          className={`a4-sheet-container mx-auto bg-white text-black p-5 border border-[var(--border-subtle)] rounded-xl shadow-xs space-y-3 print:border-none print:shadow-none print:p-0 ${
            activeLegacyForm.orientation === 'landscape' ? 'max-w-[297mm]' : 'max-w-[210mm]'
          }`}
        >
          <OfficialFormHeader
            employer={activeEmployer}
            titleFa={activeLegacyForm.titleFa}
            titleEn={activeLegacyForm.titleEn}
            docCode={activeLegacyForm.docCode}
            revisionText={activeLegacyForm.revisionText}
            imsSubtitle={activeLegacyForm.imsSubtitle}
            headerLayout={activeLegacyForm.headerLayout}
            primaryLogo={resolveEmployerLogoById(
              activeEmployer,
              activeLegacyForm.primaryLogoId || '__default__',
              true,
            )}
            secondaryLogo={resolveEmployerLogoById(
              activeEmployer,
              activeLegacyForm.secondaryLogoId || '__none__',
              false,
            )}
            accentColor={activeLegacyForm.accentColor}
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

          {activeLegacyForm.headerFields.length > 0 && (
            <div
              dir="rtl"
              className="grid grid-cols-2 border border-black divide-x divide-x-reverse divide-y divide-black text-[11px]"
            >
              {activeLegacyForm.headerFields.map((hf) => (
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

          {activeLegacyForm.hasTable && activeLegacyForm.tableColumns.length > 0 && (
            <div className="space-y-1.5">
              <table dir="rtl" className="w-full border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="bg-slate-100">
                    {activeLegacyForm.tableColumns.map((col) => (
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
                      {activeLegacyForm.tableColumns.map((col) => (
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
                    activeLegacyForm.tableColumns.forEach((c) => {
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

          {activeLegacyForm.bodyText && (
            <div dir="rtl" className="p-2 border border-black text-[11px] leading-relaxed bg-slate-50/60">
              {activeLegacyForm.bodyText}
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
            signatures={activeLegacyForm.signatures}
            borderColor={activeLegacyForm.accentColor}
          />

          {activeLegacyForm.footerNote && (
            <div dir="rtl" className="text-[10px] text-black/75 pt-1">
              {activeLegacyForm.footerNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
