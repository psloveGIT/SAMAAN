import React, { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { CalendarMode } from '../shared/types.ts';

interface PreviewResult {
  scope: 'general' | 'detailed' | 'transit';
  totalRows: number;
  skippedEmpty: number;
  duplicateRowNos: number;
  sample: Record<string, unknown>[];
}

interface CsvImportViewProps {
  onImportDone: () => void;
}

export const CsvImportView: React.FC<CsvImportViewProps> = ({ onImportDone }) => {
  const { prefs, notify, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';

  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [scope, setScope] = useState<'auto' | 'general' | 'detailed' | 'transit'>('auto');
  const [assumedCalendar, setAssumedCalendar] = useState<CalendarMode>('jalali');
  const [duplicateRowPolicy, setDuplicateRowPolicy] = useState<'auto_reassign' | 'skip'>(
    'auto_reassign',
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    scope: string;
    imported: number;
    skipped: number;
    transitAutoArrived: number;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCommitResult(null);
    const text = await file.text();
    setCsvText(text);
    setLoading(true);
    try {
      const res = await apiRequest<PreviewResult>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          csvText: text,
          scope: scope === 'auto' ? undefined : scope,
          assumedCalendar,
        }),
      });
      setPreview(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshPreview = async () => {
    if (!csvText) return;
    setLoading(true);
    try {
      const res = await apiRequest<PreviewResult>('/api/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          csvText,
          scope: scope === 'auto' ? undefined : scope,
          assumedCalendar,
        }),
      });
      setPreview(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!csvText) return;
    setLoading(true);
    try {
      const res = await apiRequest<{
        scope: string;
        imported: number;
        skipped: number;
        transitAutoArrived: number;
      }>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          csvText,
          scope: scope === 'auto' ? undefined : scope,
          assumedCalendar,
          duplicateRowPolicy,
        }),
      });
      setCommitResult(res);
      setPreview(null);
      notify(
        'success',
        isFa
          ? `${res.imported} ردیف با موفقیت وارد سامانه شد.`
          : `Imported ${res.imported} rows successfully.`,
      );
      triggerAutoSnapshot(`CSV Import ${res.scope}`);
      onImportDone();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold">
            {isFa ? 'ویزارد ورود فایل‌های CSV (جنرال، دیتیل، در راه)' : 'Multi-Sheet CSV Import Wizard'}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {isFa
              ? 'فایل‌های CSV اکسل خود را انتخاب کنید. سامانه سرستون‌های چندردیفه، اعداد ویرگول‌دار و تاریخ‌های شمسی/میلادی را به‌صورت خودکار شناسایی و تطبیق می‌دهد.'
              : 'Upload General, Detailed, or In-Transit CSV files. Multi-row headers, comma-formatted numbers, and Jalali/Gregorian dates are mapped automatically.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {isFa ? 'نوع فایل CSV' : 'Sheet Type'}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'auto' | 'general' | 'detailed' | 'transit')}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="auto">{isFa ? 'تشخیص خودکار از سرستون' : 'Auto-detect'}</option>
              <option value="general">{isFa ? 'جنرال (کلی)' : 'General'}</option>
              <option value="detailed">{isFa ? 'دیتیل (جزئیات متریال)' : 'Detailed'}</option>
              <option value="transit">{isFa ? 'در راه (در دست حمل)' : 'In-Transit'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {isFa ? 'تقویم تاریخ‌های داخل فایل' : 'Date Format in CSV'}
            </label>
            <select
              value={assumedCalendar}
              onChange={(e) => setAssumedCalendar(e.target.value as CalendarMode)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="jalali">{isFa ? 'شمسی (مثل 03.10.15)' : 'Jalali (e.g. 03.10.15)'}</option>
              <option value="gregorian">{isFa ? 'میلادی (YYYY-MM-DD)' : 'Gregorian (YYYY-MM-DD)'}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {isFa ? 'سیاست ردیف (ردیف یکتا) تکراری' : 'Duplicate Row No. Policy'}
            </label>
            <select
              value={duplicateRowPolicy}
              onChange={(e) => setDuplicateRowPolicy(e.target.value as 'auto_reassign' | 'skip')}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="auto_reassign">
                {isFa ? 'تخصیص شماره ردیف یکتای جدید' : 'Auto-assign next unique Row No.'}
              </option>
              <option value="skip">
                {isFa ? 'نادیده‌گرفتن ردیف‌های تکراری' : 'Skip duplicate Row No.'}
              </option>
            </select>
          </div>
        </div>

        <label className="block border-2 border-dashed border-[var(--border-strong)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--accent-primary)] transition-colors">
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
          <Upload className="w-7 h-7 mx-auto text-[var(--accent-primary)] mb-2" />
          <div className="text-sm font-semibold">
            {fileName || (isFa ? 'برای انتخاب فایل CSV کلیک کنید' : 'Click to select a CSV file')}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {isFa ? 'پشتیبانی از فایل‌های حجیم ۲۰,۰۰۰+ ردیف' : 'Supports large 20,000+ row spreadsheets'}
          </div>
        </label>

        {csvText && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={refreshPreview}
              disabled={loading}
              className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
            >
              {isFa ? 'به‌روزرسانی پیش‌نمایش' : 'Refresh Preview'}
            </button>
          </div>
        )}
      </div>

      {preview && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <FileSpreadsheet className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>
                {isFa ? 'پیش‌نمایش فایل:' : 'Preview:'} {preview.scope.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] tabular-nums flex flex-wrap gap-4">
              <span>{isFa ? 'ردیف‌های معتبر:' : 'Valid Rows:'} {preview.totalRows.toLocaleString(isFa ? 'fa-IR' : 'en-US')}</span>
              <span>{isFa ? 'ردیف‌های خالی ردشده:' : 'Empty Skipped:'} {preview.skippedEmpty}</span>
              {preview.duplicateRowNos > 0 && (
                <span className="text-[var(--status-warning)]">
                  {isFa ? 'تداخل شماره ردیف:' : 'Row No. Collisions:'} {preview.duplicateRowNos}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || preview.totalRows === 0}
              onClick={handleCommit}
              className="h-10 px-6 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold"
            >
              {loading
                ? isFa ? 'در حال ثبت...' : 'Importing...'
                : isFa
                  ? `تایید و ثبت ${preview.totalRows.toLocaleString('fa-IR')} ردیف در پایگاه داده`
                  : `Import ${preview.totalRows} Rows into Database`}
            </button>
          </div>
        </div>
      )}

      {commitResult && (
        <div className="rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)] p-5 flex items-start gap-3 text-xs text-[var(--status-success)]">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">
              {isFa ? 'ورود داده‌ها با موفقیت کامل شد' : 'CSV Import Completed'}
            </div>
            <div className="tabular-nums">
              {isFa
                ? `تعداد ثبت‌شده: ${commitResult.imported.toLocaleString('fa-IR')} · ردشده: ${commitResult.skipped} · به‌روزرسانی خودکار وضعیت در راه به رسیده: ${commitResult.transitAutoArrived}`
                : `Imported: ${commitResult.imported} · Skipped: ${commitResult.skipped} · Auto-updated In-Transit to Arrived: ${commitResult.transitAutoArrived}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
