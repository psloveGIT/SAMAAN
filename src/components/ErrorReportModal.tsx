import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bug,
  CheckCircle2,
  CloudOff,
  Download,
  FileJson,
  FileText,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { APP_VERSION } from '../shared/appVersion.ts';
import { sanitizeErrorReportInput } from '../shared/diagnostics.ts';
import type { DiagnosticLogEntry, ErrorReportRecord } from '../shared/types.ts';
import {
  clearDiagnosticLogs,
  downloadDiagnosticsFile,
  getDiagnosticLogs,
  getStoredErrorReports,
  submitErrorReportToServer,
  subscribeDiagnostics,
  syncPendingErrorReports,
} from '../lib/diagnostics.ts';

interface ErrorReportModalProps {
  open: boolean;
  onClose: () => void;
  activeSection?: string;
}

export const ErrorReportModal: React.FC<ErrorReportModalProps> = ({
  open,
  onClose,
  activeSection = 'dashboard',
}) => {
  const { prefs, activeProject, user, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [tab, setTab] = useState<'report' | 'logs'>('report');
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>(() => getDiagnosticLogs());
  const [reports, setReports] = useState<ErrorReportRecord[]>(() => getStoredErrorReports());

  // User bug report form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ErrorReportRecord['category']>('bug');
  const [section, setSection] = useState(activeSection || 'dashboard');
  const [severity, setSeverity] = useState<ErrorReportRecord['severity']>('medium');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [attachLogs, setAttachLogs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSection(activeSection || 'dashboard');
    setLogs(getDiagnosticLogs());
    setReports(getStoredErrorReports());
    return subscribeDiagnostics(() => {
      setLogs(getDiagnosticLogs());
      setReports(getStoredErrorReports());
    });
  }, [open, activeSection]);

  if (!open) return null;

  const pendingSyncCount = reports.filter((r) => !r.syncedToServer).length;

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const check = sanitizeErrorReportInput({
      title,
      category,
      section,
      severity,
      description,
      stepsToReproduce,
    });
    if (!check.valid) {
      setFormError(isFa ? check.errorFa || '' : check.errorEn || '');
      return;
    }

    setSubmitting(true);
    try {
      const report: ErrorReportRecord = {
        id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        title: check.title,
        category: check.category,
        section: check.section,
        severity: check.severity,
        description: check.description,
        stepsToReproduce: check.stepsToReproduce || undefined,
        attachLogs,
        logs: attachLogs ? getDiagnosticLogs().slice(0, 60) : undefined,
        projectName: activeProject?.name || '',
        username: user?.username || '',
        appVersion: APP_VERSION,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        syncedToServer: false,
      };

      const res = await submitErrorReportToServer(report);
      setReports(getStoredErrorReports());
      setTitle('');
      setDescription('');
      setStepsToReproduce('');

      if (res.synced) {
        notify(
          'success',
          isFa
            ? 'گزارش خطا با موفقیت ثبت و به سرور ارسال شد.'
            : 'Error report submitted and sent to server.',
        );
      } else {
        notify(
          'info',
          isFa
            ? 'گزارش خطا در حافظه دستگاه ذخیره شد و پس از برقراری ارتباط به سرور ارسال می‌شود. می‌توانید فایل آن را نیز دانلود کنید.'
            : 'Report saved locally and queued for server sync. You can also download the log file now.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLogsOnlyToServer = async () => {
    setSubmitting(true);
    try {
      const currentLogs = getDiagnosticLogs();
      const report: ErrorReportRecord = {
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        title: isFa ? `ارسال خودکار لاگ‌های سیستم (${currentLogs.length} مورد)` : `System Diagnostic Logs (${currentLogs.length})`,
        category: 'freeze_crash',
        section: activeSection || 'system',
        severity: currentLogs.some((l) => l.severity === 'critical') ? 'critical' : 'medium',
        description: isFa
          ? `ارسال بسته لاگ عیب‌یابی خودکار شامل ${currentLogs.length} رویداد ثبت‌شده در سامانه سمان.`
          : `Automated diagnostics bundle containing ${currentLogs.length} recorded events.`,
        attachLogs: true,
        logs: currentLogs.slice(0, 100),
        projectName: activeProject?.name || '',
        username: user?.username || '',
        appVersion: APP_VERSION,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        syncedToServer: false,
      };
      const res = await submitErrorReportToServer(report);
      setReports(getStoredErrorReports());
      if (res.synced) {
        notify('success', isFa ? 'لاگ‌های عیب‌یابی به سرور ارسال شد.' : 'Diagnostic logs sent to server.');
      } else {
        notify(
          'info',
          isFa
            ? 'سرور در دسترس نیست؛ لاگ در صف ارسال ذخیره شد.'
            : 'Server unreachable; diagnostics queued for sync.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncPending = async () => {
    setSyncingAll(true);
    try {
      const count = await syncPendingErrorReports();
      setReports(getStoredErrorReports());
      notify(
        count > 0 ? 'success' : 'info',
        count > 0
          ? isFa
            ? `${count} گزارش در صف با موفقیت به سرور ارسال شد.`
            : `${count} queued report(s) synced to server.`
          : isFa
          ? 'همه گزارش‌ها همگام هستند یا سرور در حال حاضر در دسترس نیست.'
          : 'All reports are synced or server is currently offline.',
      );
    } finally {
      setSyncingAll(false);
    }
  };

  const sectionOptions = [
    { value: 'dashboard', label: isFa ? 'داشبورد و صفحه‌ی اصلی' : 'Dashboard / Home' },
    { value: 'general', label: isFa ? 'جدول جنرال (اطلاعات محموله‌ها)' : 'General Inventory' },
    { value: 'detailed', label: isFa ? 'ثبت جزئیات تجهیزات' : 'Detailed Equipment' },
    { value: 'substitution', label: isFa ? 'جایگزینی تجهیزات' : 'Substitution' },
    { value: 'miv', label: isFa ? 'حواله انبار (MIV)' : 'MIV' },
    { value: 'gcv', label: isFa ? 'رسید مصرف (GCV)' : 'GCV' },
    { value: 'smr', label: isFa ? 'برگشت متریال (SMR)' : 'SMR' },
    { value: 'storageLabel', label: isFa ? 'برچسب انبارش کالا' : 'Storage Labels' },
    { value: 'employers', label: isFa ? 'مدیریت کارفرمایان' : 'Employers Studio' },
    { value: 'backup', label: isFa ? 'پشتیبان‌گیری / بازیابی فایل' : 'Backup / Restore' },
    { value: 'print', label: isFa ? 'چاپ و خروجی‌ها' : 'Printing & Exports' },
    { value: 'other', label: isFa ? 'سایر بخش‌ها' : 'Other' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isFa ? 'گزارش خطا و لاگ عیب‌یابی' : 'Error Reporting & Diagnostics'}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold">
                {isFa ? 'سامانه گزارش خطا و لاگ عیب‌یابی' : 'Error Reporting & Diagnostics'}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? `نسخه ${APP_VERSION} • ثبت خودکار هنگ/فریز/خطا و گزارش اشکالات کاربری`
                  : `v${APP_VERSION} • Automatic crash/freeze logger & user issue reporting`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFa ? 'بستن پنجره گزارش خطا' : 'Close error report modal'}
            className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('report')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                tab === 'report'
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              {isFa ? 'گزارش اشکال توسط کاربر' : 'Report a Bug'}
              {reports.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[10px]">{reports.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                tab === 'logs'
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {isFa ? 'لاگ خودکار خطا و هنگ' : 'Auto Crash & Freeze Logs'}
              <span className="px-1.5 py-0.5 rounded-md bg-black/15 text-[10px]">{logs.length}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => downloadDiagnosticsFile({ format: 'json', projectName: activeProject?.name })}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--bg-subtle)]"
              title={isFa ? 'دانلود فایل کامل JSON' : 'Download full JSON diagnostics'}
            >
              <FileJson className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              JSON
            </button>
            <button
              type="button"
              onClick={() => downloadDiagnosticsFile({ format: 'txt', projectName: activeProject?.name })}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold hover:bg-[var(--bg-subtle)]"
              title={isFa ? 'دانلود فایل متنی TXT' : 'Download readable TXT diagnostics'}
            >
              <FileText className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              TXT
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'report' ? (
            <>
              <form onSubmit={handleSubmitReport} className="space-y-3.5">
                {formError && (
                  <div className="flex items-center gap-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'نوع مشکل' : 'Category'}
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ErrorReportRecord['category'])}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                    >
                      <option value="bug">{isFa ? 'باگ / عملکرد اشتباه' : 'Functional Bug'}</option>
                      <option value="freeze_crash">{isFa ? 'هنگ کردن / فریز شدن برنامه' : 'Freeze / Crash'}</option>
                      <option value="print_export">{isFa ? 'مشکل چاپ یا خروجی' : 'Print / Export'}</option>
                      <option value="ui_layout">{isFa ? 'مشکل ظاهری / نمایشی' : 'UI / Layout'}</option>
                      <option value="data_sync">{isFa ? 'ذخیره‌سازی / بازیابی اطلاعات' : 'Data / Sync'}</option>
                      <option value="other">{isFa ? 'سایر موارد' : 'Other'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'بخش مربوطه' : 'Affected Section'}
                    </label>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                    >
                      {sectionOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'شدت مشکل' : 'Severity'}
                    </label>
                    <select
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as ErrorReportRecord['severity'])}
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                    >
                      <option value="low">{isFa ? 'کم' : 'Low'}</option>
                      <option value="medium">{isFa ? 'متوسط' : 'Medium'}</option>
                      <option value="high">{isFa ? 'زیاد' : 'High'}</option>
                      <option value="critical">{isFa ? 'بحرانی (توقف کار)' : 'Critical'}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'عنوان کوتاه اشکال' : 'Short Summary'}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isFa ? 'مثلاً: عدم نمایش ردیف جدید در سابقه فرم جایگزینی' : 'e.g. Print button does nothing on iOS PWA'}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شرح دقیق خطا یا اشکال مشاهده‌شده *' : 'Detailed Description *'}
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      isFa
                        ? 'توضیح دهید دقیقاً چه اتفاقی افتاد و انتظار داشتید چه رخ دهد...'
                        : 'Explain what happened and what you expected...'
                    }
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'مراحل بازتولید مشکل (اختیاری)' : 'Steps to Reproduce (optional)'}
                  </label>
                  <textarea
                    rows={2}
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    placeholder={
                      isFa
                        ? '۱- وارد بخش ... شدم  ۲- روی دکمه ... کلیک کردم'
                        : '1. Open section ... 2. Click ...'
                    }
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-xs outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attachLogs}
                    onChange={(e) => setAttachLogs(e.target.checked)}
                    className="rounded border-[var(--border-strong)] accent-[var(--accent-primary)]"
                  />
                  <span>
                    {isFa
                      ? `ضمیمه کردن خودکار لاگ‌های خطا/هنگ و مشخصات دستگاه (${logs.length} رویداد)`
                      : `Attach automatic crash/freeze logs & device info (${logs.length} events)`}
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => downloadDiagnosticsFile({ format: 'json', projectName: activeProject?.name })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold hover:bg-[var(--bg-subtle)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isFa ? 'دانلود فایل گزارش' : 'Download Report File'}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting
                      ? isFa
                        ? 'در حال ثبت و ارسال...'
                        : 'Submitting...'
                      : isFa
                      ? 'ثبت و ارسال به سرور'
                      : 'Submit & Send to Server'}
                  </button>
                </div>
              </form>

              {/* Saved User Reports History */}
              {reports.length > 0 && (
                <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[var(--text-secondary)]">
                      {isFa ? `گزارش‌های ثبت‌شده (${reports.length})` : `Submitted Reports (${reports.length})`}
                    </h3>
                    {pendingSyncCount > 0 && (
                      <button
                        type="button"
                        disabled={syncingAll}
                        onClick={() => void handleSyncPending()}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-[11px] font-bold hover:bg-amber-500/25"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingAll ? 'animate-spin' : ''}`} />
                        {isFa ? `ارسال مجدد صف (${pendingSyncCount})` : `Retry Sync (${pendingSyncCount})`}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {reports.map((rep) => (
                      <div
                        key={rep.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[var(--text-primary)] truncate">{rep.title}</div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2 whitespace-pre-line">
                            {rep.description}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                            <span>{new Date(rep.createdAt).toLocaleString(isFa ? 'fa-IR' : 'en-US')}</span>
                            <span>•</span>
                            <span>{rep.section}</span>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                            rep.syncedToServer
                              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {rep.syncedToServer ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              {isFa ? 'ارسال شده' : 'Sent'}
                            </>
                          ) : (
                            <>
                              <CloudOff className="w-3 h-3" />
                              {isFa ? 'در صف ارسال' : 'Queued'}
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 p-3">
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {isFa
                    ? 'تمامی خطاهای جاوااسکریپت، خطاهای ارتباط با سرور و فریز/هنگ‌های بیش از ۲.۵ ثانیه به صورت خودکار در این لیست ثبت می‌شوند.'
                    : 'Runtime errors, failed API requests, crashes, and UI freezes (>2.5s) are automatically captured here.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSendLogsOnlyToServer()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isFa ? 'ارسال لاگ‌ها به سرور' : 'Send Logs to Server'}
                  </button>
                  {logs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        clearDiagnosticLogs();
                        setLogs([]);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isFa ? 'پاک‌سازی' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>

              {logs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-8 text-center text-xs text-[var(--text-muted)]">
                  {isFa
                    ? 'تاکنون هیچ خطا یا هنگ سیستمی ثبت نشده است.'
                    : 'No automatic errors, crashes, or UI freezes have been recorded.'}
                </div>
              ) : (
                <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                  {logs.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              entry.kind === 'ui_freeze'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {entry.kind}
                          </span>
                          <span className="text-[var(--text-muted)] text-[10px]">{entry.section}</span>
                        </span>
                        <span dir="ltr" className="text-[10px] text-[var(--text-muted)] font-mono">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div dir="ltr" className="font-mono text-[11px] text-[var(--text-primary)] break-all">
                        {entry.message}
                      </div>
                      {entry.details && (
                        <div dir="ltr" className="font-mono text-[10px] text-[var(--text-muted)] break-all">
                          {entry.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
