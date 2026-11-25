import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { triggerAppPrint } from '../lib/print.ts';
import { createPortal } from 'react-dom';
import {
  Download,
  FilePlus2,
  FileSpreadsheet,
  FileUp,
  PackageSearch,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { DEFAULT_UPLOADED_FORM_PRINT_SETTINGS } from '../shared/employers.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
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

interface CustomFormsRunnerViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
  onOpenEmployerStudio: () => void;
}

export const CustomFormsRunnerView: React.FC<CustomFormsRunnerViewProps> = ({
  refreshSignal,
  onOpenEmployerStudio,
}) => {
  const { prefs, activeProject, activeEmployer, formatDate, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const uploadedForms = activeEmployer.uploadedForms || [];
  const [selectedUploadedId, setSelectedUploadedId] = useState<string>(() => uploadedForms[0]?.id || '');

  // Shared warehouse datasets for auto-filling uploaded forms
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

  useEffect(() => {
    if (uploadedForms.length > 0 && !uploadedForms.some((f) => f.id === selectedUploadedId)) {
      setSelectedUploadedId(uploadedForms[0].id);
      setDataSourceOverride('');
      setPrintOverrides({});
      setManualFieldOverrides({});
    }
  }, [uploadedForms, selectedUploadedId]);

  const activeUploadedForm: EmployerUploadedForm | null = useMemo(
    () => uploadedForms.find((f) => f.id === selectedUploadedId) || uploadedForms[0] || null,
    [uploadedForms, selectedUploadedId],
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
        notify('success', isFa ? 'فایل فرم پرشده آماده و دانلود شد.' : 'Filled spreadsheet form downloaded.');
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

  if (uploadedForms.length === 0 || !effectiveUploadedForm) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
        <FileUp className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          {isFa
            ? 'برای کارفرمای فعلی هنوز فایلی در بخش فرم‌های آپلودشده ثبت نشده است'
            : 'No uploaded company forms registered for the active employer yet'}
        </h3>
        <p className="text-xs text-[var(--text-muted)] max-w-xl mx-auto leading-relaxed">
          {isFa
            ? 'از بخش «مدیریت کارفرمایان»، می‌توانید فرم‌های اختصاصی کارفرما را در قالب اکسل، ورد، پی‌دی‌اف یا تصویر آپلود کنید تا اطلاعات سامانه به‌صورت خودکار در آن‌ها قرار گرفته و با تنظیمات A4 چاپ یا دانلود شوند.'
            : 'Open Employers Management to upload Excel, Word, PDF, or image forms for this employer.'}
        </p>
        <button
          type="button"
          onClick={onOpenEmployerStudio}
          className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>{isFa ? 'رفتن به مدیریت کارفرمایان و آپلود فرم' : 'Open Employers & Upload Form'}</span>
        </button>
      </div>
    );
  }

  const printPortal =
    effectiveUploadedForm.fileType !== 'pdf'
      ? createPortal(
          <div id="samaan-custom-form-print-root" data-samaan-print-portal="true">
            <style>
              {buildIsolatedPrintPortalCss('samaan-custom-form-print-root', {
                orientation: effectiveUploadedForm.printSettings.orientation,
                isFa,
                marginMm: 12,
              })}
            </style>
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
                  ? 'دانلود فایل فرم پرشده'
                  : 'Download Filled Form'
                : effectiveUploadedForm.fileType === 'word' &&
                    effectiveUploadedForm.fileName.toLowerCase().endsWith('.docx')
                  ? isFa
                    ? 'دانلود سند پرشده'
                    : 'Download Filled Document'
                  : isFa
                    ? 'دانلود فایل فرم'
                    : 'Download File'}
            </span>
          </button>

          {effectiveUploadedForm.fileType !== 'pdf' && (
            <button
              type="button"
              onClick={() => triggerAppPrint()}
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
              <option value="general">{isFa ? 'ثبت کلی تجهیزات' : 'General Equipment'}</option>
              <option value="siteEntry">{isFa ? 'صورتجلسات ورود کالا' : 'Site Entry Minutes'}</option>
              <option value="detailed">{isFa ? 'ثبت جزئیات تجهیزات' : 'Detailed Equipment'}</option>
              <option value="transit">{isFa ? 'تجهیزات در راه' : 'In-Transit'}</option>
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
                  <span>
                    {isFa
                      ? 'انتخاب شماره پکینگ لیست جهت خواندن و قرارگیری خودکار اطلاعات در فرم:'
                      : 'Select Packing List No. to Populate Form:'}
                  </span>
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
                    <label
                      className="block text-[10px] font-mono text-[var(--text-muted)] mb-0.5 truncate"
                      dir="ltr"
                    >
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
};
