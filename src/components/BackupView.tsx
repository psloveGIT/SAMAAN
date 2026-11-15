import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  HardDrive,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import {
  deleteIndexedDbSnapshot,
  downloadJsonBackup,
  listIndexedDbSnapshots,
  saveSnapshotToIndexedDb,
} from '../lib/indexedDbBackup.ts';
import type { LocalBackupSnapshotRecord } from '../lib/indexedDbBackup.ts';
import { parseSpreadsheetFile } from '../shared/spreadsheetImport.ts';
import type { DatabaseSnapshot } from '../shared/types.ts';

interface BackupViewProps {
  onRestored: () => void;
}

interface PreviewResponse {
  scope: 'general' | 'detailed' | 'transit';
  totalRows: number;
  skippedEmpty: number;
  duplicateRowNos: number;
  duplicateRecordsCount: number;
  duplicateSamples: string[];
  sample: Record<string, unknown>[];
}

interface CommitResponse {
  scope: 'general' | 'detailed' | 'transit';
  imported: number;
  replaced: number;
  skipped: number;
  transitAutoArrived: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupView: React.FC<BackupViewProps> = ({ onRestored }) => {
  const { prefs, user, notify, formatTimestamp, triggerAutoSnapshot, activeProjectId, activeProject } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';
  const canImport = user?.role === 'admin' || user?.role === 'operator';

  // Offline Backup & Restore state
  const [snapshots, setSnapshots] = useState<LocalBackupSnapshotRecord[]>([]);
  const [busy, setBusy] = useState(false);

  // Unified Spreadsheet / CSV / JSON Import state
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetsMap, setSheetsMap] = useState<Record<string, string[][]>>({});
  const [importScope, setImportScope] = useState<'auto' | 'general' | 'detailed' | 'transit'>('auto');
  const [assumedCalendar, setAssumedCalendar] = useState<'jalali' | 'gregorian'>('jalali');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'replace' | 'skip'>('skip');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<CommitResponse | null>(null);
  const [importing, setImporting] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await listIndexedDbSnapshots(activeProjectId);
      setSnapshots(list);
    } catch {
      // IndexedDB unavailable
    }
  }, [activeProjectId]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const runPreview = useCallback(
    async (
      matrix: string[][],
      scopeVal: 'auto' | 'general' | 'detailed' | 'transit',
      calVal: 'jalali' | 'gregorian',
    ) => {
      if (!matrix || matrix.length === 0) return;
      try {
        const res = await apiRequest<PreviewResponse>('/api/import/preview', {
          method: 'POST',
          body: JSON.stringify({
            matrix,
            scope: scopeVal === 'auto' ? undefined : scopeVal,
            assumedCalendar: calVal,
          }),
        });
        setPreview(res);
      } catch (err) {
        if (err instanceof ApiError) notify('error', err.message);
      }
    },
    [notify],
  );

  const handleSelectDataFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportResult(null);
    setPreview(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setFileName(parsed.fileName);
      setSheetNames(parsed.sheetNames);
      setSheetsMap(parsed.sheets);
      setSelectedSheet(parsed.defaultSheet);
      const matrix = parsed.sheets[parsed.defaultSheet] || [];
      await runPreview(matrix, importScope, assumedCalendar);
    } catch (err) {
      notify(
        'error',
        err instanceof Error
          ? err.message
          : isFa
            ? 'خطا در خواندن فایل ورودی.'
            : 'Failed to parse input file.',
      );
    }
  };

  const handleSheetChange = async (nextSheet: string) => {
    setSelectedSheet(nextSheet);
    setImportResult(null);
    const matrix = sheetsMap[nextSheet] || [];
    await runPreview(matrix, importScope, assumedCalendar);
  };

  const handleScopeOrCalendarChange = async (
    nextScope: 'auto' | 'general' | 'detailed' | 'transit',
    nextCal: 'jalali' | 'gregorian',
  ) => {
    setImportScope(nextScope);
    setAssumedCalendar(nextCal);
    const matrix = sheetsMap[selectedSheet] || [];
    if (matrix.length > 0) {
      await runPreview(matrix, nextScope, nextCal);
    }
  };

  const handleCommitImport = async () => {
    const matrix = sheetsMap[selectedSheet] || [];
    if (matrix.length === 0) return;
    setImporting(true);
    try {
      const res = await apiRequest<CommitResponse>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          matrix,
          scope: importScope === 'auto' ? undefined : importScope,
          assumedCalendar,
          duplicateRecordPolicy: duplicatePolicy,
        }),
      });
      setImportResult(res);
      notify(
        'success',
        isFa
          ? `عملیات تکمیل شد: ${res.imported} جدید، ${res.replaced} جایگزین، ${res.skipped} رد شده.`
          : `Import completed: ${res.imported} imported, ${res.replaced} replaced, ${res.skipped} skipped.`,
      );
      triggerAutoSnapshot(`Import (${res.scope})`);
      onRestored();
      await runPreview(matrix, importScope, assumedCalendar);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setImporting(false);
    }
  };

  const clearImportSelection = () => {
    setFileName('');
    setSheetNames([]);
    setSelectedSheet('');
    setSheetsMap({});
    setPreview(null);
    setImportResult(null);
  };

  const handleManualSnapshot = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      await saveSnapshotToIndexedDb(
        snapshot,
        'manual',
        isFa ? 'اسنپ‌شات دستی مدیر/کاربر' : 'Manual Snapshot',
        activeProjectId,
      );
      notify('success', isFa ? 'نسخه پشتیبان ذخیره شد.' : 'Snapshot saved.');
      loadSnapshots();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadLiveJson = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      const safeSlug = (activeProject?.code || activeProjectId).replace(/[^a-zA-Z0-9_-]+/g, '-');
      downloadJsonBackup(snapshot, `samaan-backup-${safeSlug}`);
      notify('success', isFa ? 'فایل پشتیبان دانلود شد.' : 'Backup file downloaded.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshot: DatabaseSnapshot) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await apiRequest('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      notify('success', isFa ? 'اطلاعات از نسخه پشتیبان بازیابی شد.' : 'Data restored from backup.');
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DatabaseSnapshot;
      await handleRestoreSnapshot(parsed);
    } catch {
      notify('error', isFa ? 'فایل پشتیبان معتبر نیست.' : 'Invalid backup JSON file.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Section 1: Data Import from Excel / CSV / JSON with duplicate detection */}
      {canImport && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>
                  {isFa
                    ? 'ورود و بازیابی اطلاعات از فایل (Excel، CSV، JSON)'
                    : 'Import & Restore Data from File (Excel, CSV, JSON)'}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {isFa
                  ? 'بارگذاری فایل‌های اکسل (.xlsx / .xls)، CSV، TSV یا JSON به همراه شناسایی هوشمند داده‌های تکراری (انتخاب جایگزینی یا رد کردن).'
                  : 'Upload Excel (.xlsx / .xls), CSV, TSV, or JSON files with duplicate detection (Replace or Skip).'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {fileName && (
                <button
                  type="button"
                  onClick={clearImportSelection}
                  className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
                >
                  {isFa ? 'پاک کردن فایل' : 'Clear File'}
                </button>
              )}
              <label className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'انتخاب فایل اکسل / CSV / JSON' : 'Choose Excel / CSV / JSON'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.ods,.csv,.tsv,.json,.txt"
                  onChange={handleSelectDataFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'بخش مقصد' : 'Target Dataset'}
              </label>
              <select
                value={importScope}
                onChange={(e) =>
                  handleScopeOrCalendarChange(
                    e.target.value as 'auto' | 'general' | 'detailed' | 'transit',
                    assumedCalendar,
                  )
                }
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="auto">{isFa ? 'تشخیص خودکار از ستون‌ها' : 'Auto-Detect Columns'}</option>
                <option value="general">{isFa ? 'ثبت کلی تجهیزات (جنرال)' : 'General Equipment'}</option>
                <option value="detailed">{isFa ? 'ثبت جزئیات تجهیزات (دیتیل)' : 'Detailed Equipment'}</option>
                <option value="transit">{isFa ? 'تجهیزات در راه (Transit)' : 'In-Transit Equipment'}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تقویم تاریخ‌های فایل' : 'Source Date Calendar'}
              </label>
              <select
                value={assumedCalendar}
                onChange={(e) =>
                  handleScopeOrCalendarChange(
                    importScope,
                    e.target.value as 'jalali' | 'gregorian',
                  )
                }
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="jalali">{isFa ? 'شمسی (جلالی)' : 'Jalali (Shamsi)'}</option>
                <option value="gregorian">{isFa ? 'میلادی' : 'Gregorian'}</option>
              </select>
            </div>

            {sheetNames.length > 1 && (
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  {isFa ? 'انتخاب شیت اکسل' : 'Excel Sheet'}
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {fileName && preview && (
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold">
                  {isFa ? `پیش‌نمایش فایل: ${fileName}` : `Preview: ${fileName}`} ·{' '}
                  <span className="text-[var(--accent-primary)]">
                    {preview.scope === 'general'
                      ? isFa ? 'بخش کلی (جنرال)' : 'General'
                      : preview.scope === 'detailed'
                        ? isFa ? 'بخش جزئیات' : 'Detailed'
                        : isFa ? 'در راه' : 'In-Transit'}
                  </span>
                </div>
                <div className="text-[var(--text-secondary)] tabular-nums">
                  {isFa
                    ? `${preview.totalRows.toLocaleString('fa-IR')} ردیف معتبر یافت شد`
                    : `${preview.totalRows} valid row(s) detected`}
                </div>
              </div>

              {preview.duplicateRecordsCount > 0 && (
                <div className="p-3.5 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] space-y-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-[var(--status-warning)]">
                        {isFa
                          ? `${preview.duplicateRecordsCount.toLocaleString('fa-IR')} رکورد تکراری با اطلاعات فعلی شناسایی شد.`
                          : `${preview.duplicateRecordsCount} duplicate record(s) match existing database entries.`}
                      </div>
                      {preview.duplicateSamples.length > 0 && (
                        <div className="text-[11px] text-[var(--text-secondary)] tabular-nums" dir="ltr">
                          {preview.duplicateSamples.join(' | ')}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--text-primary)]">
                        {isFa
                          ? 'لطفاً نحوه برخورد با رکوردهای تکراری را انتخاب کنید:'
                          : 'Choose how to handle duplicate records:'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 ps-6">
                    <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="dupPolicy"
                        checked={duplicatePolicy === 'replace'}
                        onChange={() => setDuplicatePolicy('replace')}
                      />
                      <span>{isFa ? 'جایگزینی با اطلاعات جدید فایل' : 'Replace existing records'}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="dupPolicy"
                        checked={duplicatePolicy === 'skip'}
                        onChange={() => setDuplicatePolicy('skip')}
                      />
                      <span>{isFa ? 'رد کردن ردیف‌های تکراری' : 'Skip duplicates'}</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={importing || preview.totalRows === 0}
                  onClick={handleCommitImport}
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {importing
                    ? isFa ? 'در حال ثبت...' : 'Importing...'
                    : isFa ? 'تأیید و ثبت اطلاعات در نرم‌افزار' : 'Confirm & Import Data'}
                </button>
              </div>
            </div>
          )}

          {importResult && (
            <div className="p-3.5 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/50 text-xs flex flex-wrap items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
              <span className="font-semibold tabular-nums">
                {isFa
                  ? `نتیجه بارگذاری: ${importResult.imported.toLocaleString('fa-IR')} ردیف جدید · ${importResult.replaced.toLocaleString('fa-IR')} جایگزین‌شده · ${importResult.skipped.toLocaleString('fa-IR')} رد شده`
                  : `Result: ${importResult.imported} imported · ${importResult.replaced} replaced · ${importResult.skipped} skipped`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Offline Backups & Full JSON Restore */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold">
              {isFa ? 'پشتیبان‌گیری و بازیابی کامل پروژه (JSON و اسنپ‌شات آفلاین)' : 'Full Project Backup & Restore (JSON & Offline Snapshots)'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {isFa
                ? 'اسنپ‌شات‌ها به‌صورت خودکار پس از عملیات‌های مهم و هر ۱۰ دقیقه در حافظه آفلاین مرورگر ذخیره می‌شوند.'
                : 'Snapshots are saved automatically to local browser IndexedDB after major actions and every 10 minutes.'}
            </p>
            {isStaticFallbackMode() && (
              <p className="text-[11px] font-medium text-[var(--accent-primary)] mt-1.5">
                {isFa
                  ? 'در حال اجرا در حالت استاتیک مرورگر: برای انتقال یا اشتراک داده‌های پروژه، فایل پشتیبان JSON را دانلود کنید.'
                  : 'Running in Static Browser Mode: Download a JSON backup to transfer project data.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleManualSnapshot}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isFa ? 'ثبت اسنپ‌شات فوری' : 'Save Snapshot Now'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadLiveJson}
              className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'دانلود فایل پشتیبان (JSON)' : 'Export JSON Backup'}</span>
            </button>
            {isAdmin && (
              <label className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازیابی از فایل پشتیبان (JSON)' : 'Restore from JSON File'}</span>
                <input type="file" accept=".json,application/json" onChange={handleUploadRestore} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Saved Snapshots List */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center gap-2 text-sm font-bold">
          <HardDrive className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>{isFa ? 'نسخه‌های ذخیره شده در حافظه مرورگر' : 'Saved Offline Snapshots'}</span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            {isFa ? 'هنوز اسنپ‌شاتی ذخیره نشده است.' : 'No offline snapshots stored yet.'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold flex items-center gap-2">
                    <span>{snap.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      ({snap.trigger === 'auto' ? (isFa ? 'خودکار' : 'Auto') : (isFa ? 'دستی' : 'Manual')})
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {formatTimestamp(snap.createdAt)} · {formatBytes(snap.byteSize)} ·{' '}
                    {isFa
                      ? `جنرال: ${snap.counts.general} · دیتیل: ${snap.counts.detailed} · در راه: ${snap.counts.transit}`
                      : `General: ${snap.counts.general} · Detailed: ${snap.counts.detailed} · Transit: ${snap.counts.transit}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadJsonBackup(snap.snapshot, 'samaan-snapshot')}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreSnapshot(snap.snapshot)}
                      className="h-8 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بازیابی' : 'Restore'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteIndexedDbSnapshot(snap.id);
                      loadSnapshots();
                    }}
                    className="p-1.5 rounded-lg text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
