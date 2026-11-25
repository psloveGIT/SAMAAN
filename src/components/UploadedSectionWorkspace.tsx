import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { triggerAppPrint } from '../lib/print.ts';
import { createPortal } from 'react-dom';
import {
  Download,
  FileSpreadsheet,
  FileUp,
  Printer,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { DEFAULT_UPLOADED_FORM_PRINT_SETTINGS } from '../shared/employers.ts';
import {
  getOperationalFormSectionMeta,
  type OperationalFormSectionKey,
} from '../shared/formAccess.ts';
import { buildPrintPageRule } from '../shared/printPageCss.ts';
import type {
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
import { UploadedFormA4Sheet } from './UploadedFormA4Sheet.tsx';

interface UploadedSectionWorkspaceProps {
  sectionKey: OperationalFormSectionKey;
  uploadedForms: EmployerUploadedForm[];
  refreshSignal: number;
  onGoToUploadForms: (sectionKey: OperationalFormSectionKey) => void;
}

export const UploadedSectionWorkspace: React.FC<UploadedSectionWorkspaceProps> = ({
  sectionKey,
  uploadedForms,
  refreshSignal,
  onGoToUploadForms,
}) => {
  const { prefs, activeProject, activeEmployer, formatDate, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const meta = getOperationalFormSectionMeta(sectionKey);

  const [selectedFormId, setSelectedFormId] = useState<string>(() => uploadedForms[0]?.id || '');
  const [generalRows, setGeneralRows] = useState<GeneralEntry[]>([]);
  const [detailedRows, setDetailedRows] = useState<DetailedComputed[]>([]);
  const [serverPackings, setServerPackings] = useState<string[]>([]);
  const [siteEntryRows, setSiteEntryRows] = useState<SiteEntryMinutesRecord[]>([]);
  const [transitRows, setTransitRows] = useState<TransitEntry[]>([]);

  const [selectedPackingNo, setSelectedPackingNo] = useState<string>('');
  const [selectedSiteEntryId, setSelectedSiteEntryId] = useState<string>('');
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [printOverrides, setPrintOverrides] = useState<Partial<UploadedFormPrintSettings>>({});
  const [showCalibration, setShowCalibration] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (uploadedForms.length > 0 && !uploadedForms.some((f) => f.id === selectedFormId)) {
      setSelectedFormId(uploadedForms[0].id);
      setPrintOverrides({});
      setManualOverrides({});
    }
  }, [uploadedForms, selectedFormId]);

  const activeForm = useMemo(
    () => uploadedForms.find((f) => f.id === selectedFormId) || uploadedForms[0] || null,
    [uploadedForms, selectedFormId],
  );

  const loadData = useCallback(async (packingParam = '') => {
    try {
      const pkQs = packingParam ? `&packing=${encodeURIComponent(packingParam)}` : '';
      const [cfRes, seRes, trRes] = await Promise.allSettled([
        apiRequest<{
          generalEntries?: GeneralEntry[];
          detailedItems?: DetailedComputed[];
          packings?: string[];
        }>(`/api/custom-forms?compact=1&limit=120${pkQs}`),
        apiRequest<{ minutes?: SiteEntryMinutesRecord[]; records?: SiteEntryMinutesRecord[] }>(
          '/api/site-entry?compact=1&limit=80',
        ),
        apiRequest<{ items?: TransitEntry[] }>('/api/transit?page=1&pageSize=120'),
      ]);

      if (cfRes.status === 'fulfilled') {
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
      // ignore transient load failures
    }
  }, []);

  useEffect(() => {
    void loadData(selectedPackingNo);
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
    activeForm?.dataSource || meta.defaultDataSource || 'general';

  const effectiveSources: UploadedFormDataSource[] = useMemo(() => {
    if (activeForm?.dataSources && activeForm.dataSources.length > 0) {
      return activeForm.dataSources;
    }
    return [effectiveSource];
  }, [activeForm?.dataSources, effectiveSource]);

  const effectiveForm: EmployerUploadedForm | null = useMemo(() => {
    if (!activeForm) return null;
    return {
      ...activeForm,
      dataSource: effectiveSource,
      dataSources: effectiveSources,
      printSettings: {
        ...(activeForm.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS),
        ...printOverrides,
      },
    };
  }, [activeForm, effectiveSource, effectiveSources, printOverrides]);

  const selectedSiteEntryRecord = useMemo(
    () => siteEntryRows.find((r) => r.id === selectedSiteEntryId) || null,
    [siteEntryRows, selectedSiteEntryId],
  );

  const boundContextData = useMemo(() => {
    if (!effectiveForm) {
      return {
        headerTokens: {} as Record<string, string>,
        lineRows: [] as Array<Record<string, string>>,
      };
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
      manualOverrides,
    });
  }, [
    effectiveForm,
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
    manualOverrides,
  ]);

  if (!effectiveForm) return null;

  const ps = effectiveForm.printSettings;
  const isLandscape = ps.orientation === 'landscape';

  const handlePrint = () => {
    triggerAppPrint();
  };

  const handleExportFile = async () => {
    setExporting(true);
    try {
      const safeName = (effectiveForm.titleFa || effectiveForm.fileName || 'form').replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
      if (effectiveForm.fileType === 'excel') {
        await exportFilledExcel(
          effectiveForm,
          boundContextData.headerTokens,
          boundContextData.lineRows,
        );
        notify('success', isFa ? 'فایل اکسل پرشده آماده و دانلود شد.' : 'Filled Excel downloaded.');
      } else if (
        effectiveForm.fileType === 'word' &&
        effectiveForm.fileName.toLowerCase().endsWith('.docx')
      ) {
        await exportFilledWord(effectiveForm, boundContextData.headerTokens);
        notify('success', isFa ? 'فایل ورد پرشده آماده و دانلود شد.' : 'Filled Word downloaded.');
      } else {
        const url = base64ToBlobUrl(effectiveForm.fileDataBase64, effectiveForm.mimeType);
        const a = document.createElement('a');
        a.href = url;
        a.download = effectiveForm.fileName || `${safeName}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (err) {
      notify(
        'error',
        err instanceof Error
          ? err.message
          : isFa
            ? 'خطا در خروجی گرفتن از فایل فرم.'
            : 'Failed to export form file.',
      );
    } finally {
      setExporting(false);
    }
  };

  const printPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <div className="hidden print:block samaan-custom-print-root">
            <style>{buildPrintPageRule(isLandscape ? 'landscape' : 'portrait', true)}</style>
            <UploadedFormA4Sheet
              form={effectiveForm}
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
    <div
      data-testid={`uploaded-section-workspace-${sectionKey}`}
      className="space-y-4 print:hidden"
    >
      {printPortal}

      {/* Section Header */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
              {isFa ? meta.titleFa : meta.titleEn}
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              {activeEmployer.shortName || activeEmployer.nameFa}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
            {isFa
              ? `فرم فعال این بخش: ${effectiveForm.titleFa} (${effectiveForm.fileName})`
              : `Active uploaded form: ${effectiveForm.titleFa} (${effectiveForm.fileName})`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onGoToUploadForms(sectionKey)}
            className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>{isFa ? 'مدیریت / تعویض فرم' : 'Manage Form'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCalibration((v) => !v)}
            className={`h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
              showCalibration
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{isFa ? 'تنظیمات چاپ' : 'Print Settings'}</span>
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportFile()}
            className="h-9 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isFa ? 'دانلود فایل پرشده' : 'Download Filled'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isFa ? 'چاپ فرم (A4)' : 'Print Form (A4)'}</span>
          </button>
        </div>
      </div>

      {/* Multi-form Switcher (if user uploaded more than one form for this section) */}
      {uploadedForms.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {uploadedForms.map((uf) => (
            <button
              key={uf.id}
              type="button"
              onClick={() => {
                setSelectedFormId(uf.id);
                setPrintOverrides({});
                setManualOverrides({});
              }}
              className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                uf.id === effectiveForm.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{uf.titleFa}</span>
            </button>
          ))}
        </div>
      )}

      {/* Data Selector & Optional Manual Token Inputs */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              {isFa ? 'انتخاب شماره پکینگ لیست (اتصال خودکار داده‌ها)' : 'Select Packing List No.'}
            </label>
            <select
              value={selectedPackingNo}
              onChange={(e) => setSelectedPackingNo(e.target.value)}
              className="w-full h-9 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? '-- همه / بدون فیلتر --' : '-- All / No Filter --'}</option>
              {packingOptions.map((pk) => (
                <option key={pk} value={pk}>
                  {pk}
                </option>
              ))}
            </select>
          </div>

          {siteEntryRows.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                {isFa ? 'انتخاب رکورد صورتجلسه ورود (اختیاری)' : 'Select Site Entry Record'}
              </label>
              <select
                value={selectedSiteEntryId}
                onChange={(e) => setSelectedSiteEntryId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{isFa ? '-- انتخاب کنید --' : '-- Select --'}</option>
                {siteEntryRows.map((se) => (
                  <option key={se.id} value={se.id}>
                    {se.minutesNo} — {formatDate(se.date)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {Object.keys(manualOverrides).length > 0 && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setManualOverrides({})}
                className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازنشانی مقادیر دستی' : 'Reset Manual Values'}</span>
              </button>
            </div>
          )}
        </div>

        {(effectiveForm.detectedTokens || []).length > 0 && (
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="text-[11px] font-bold text-[var(--text-secondary)]">
              {isFa ? 'مقادیر متغیرهای فرم (قابل ویرایش قبل از چاپ):' : 'Editable Form Fields:'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {(effectiveForm.detectedTokens || []).map((tok) => (
                <div key={tok}>
                  <label className="block text-[10.5px] font-mono text-[var(--text-muted)] mb-0.5 truncate">
                    {`{{${tok}}}`}
                  </label>
                  <input
                    type="text"
                    value={manualOverrides[tok] ?? boundContextData.headerTokens[tok] ?? ''}
                    onChange={(e) =>
                      setManualOverrides((prev) => ({ ...prev, [tok]: e.target.value }))
                    }
                    className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {showCalibration && (
          <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                {isFa ? 'جهت صفحه' : 'Orientation'}
              </label>
              <select
                value={ps.orientation}
                onChange={(e) =>
                  setPrintOverrides((p) => ({
                    ...p,
                    orientation: e.target.value as 'portrait' | 'landscape',
                  }))
                }
                className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="portrait">{isFa ? 'عمودی (Portrait)' : 'Portrait'}</option>
                <option value="landscape">{isFa ? 'افقی (Landscape)' : 'Landscape'}</option>
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                {isFa ? 'اندازه فونت (pt)' : 'Font Size (pt)'}
              </label>
              <input
                type="number"
                min={6}
                max={20}
                value={ps.fontSizePt}
                onChange={(e) =>
                  setPrintOverrides((p) => ({
                    ...p,
                    fontSizePt: Math.min(20, Math.max(6, Number(e.target.value) || 10)),
                  }))
                }
                className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-center"
              />
            </div>
            <div>
              <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                {isFa ? 'مقیاس چاپ (%)' : 'Scale (%)'}
              </label>
              <input
                type="number"
                min={40}
                max={150}
                value={ps.scalePercent}
                onChange={(e) =>
                  setPrintOverrides((p) => ({
                    ...p,
                    scalePercent: Math.min(150, Math.max(40, Number(e.target.value) || 100)),
                  }))
                }
                className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-center"
              />
            </div>
            <label className="flex items-center gap-2 text-xs pt-5 cursor-pointer text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={ps.fitToPageWidth}
                onChange={(e) =>
                  setPrintOverrides((p) => ({ ...p, fitToPageWidth: e.target.checked }))
                }
              />
              <span>{isFa ? 'تنظیم عرض صفحه' : 'Fit to page width'}</span>
            </label>
          </div>
        )}
      </div>

      {/* Live A4 Sheet */}
      <UploadedFormA4Sheet
        form={effectiveForm}
        employer={activeEmployer}
        headerTokens={boundContextData.headerTokens}
        lineRows={boundContextData.lineRows}
        isFa={isFa}
        onOrientationChange={(orientation) =>
          setPrintOverrides((prev) => ({ ...prev, orientation }))
        }
      />
    </div>
  );
};
