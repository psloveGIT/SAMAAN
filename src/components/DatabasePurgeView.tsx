import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Database,
  Download,
  Lock,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import {
  deleteIndexedDbSnapshot,
  downloadJsonBackup,
  listIndexedDbSnapshots,
} from '../lib/indexedDbBackup.ts';
import type {
  DatabasePurgeResponse,
  DatabaseSectionSummaryItem,
  DatabaseSnapshot,
  PurgeableSectionKey,
} from '../shared/types.ts';

interface DatabasePurgeViewProps {
  refreshSignal: number;
  onPurged: () => void;
}

interface SectionDescriptor {
  key: PurgeableSectionKey;
  group: 'inventory' | 'operations' | 'system';
  labelFa: string;
  labelEn: string;
  descFa: string;
  descEn: string;
}

const SECTION_DESCRIPTORS: SectionDescriptor[] = [
  {
    key: 'general',
    group: 'inventory',
    labelFa: 'ثبت کلی تجهیزات',
    labelEn: 'General Equipment & Packing Status',
    descFa: 'فهرست پکینگ لیست‌ها، نگله‌ها، ابعاد، وزن و وضعیت بسته‌شدن پکینگ‌ها',
    descEn: 'Packing lists, packages, weights, dimensions, and closure status',
  },
  {
    key: 'detailed',
    group: 'inventory',
    labelFa: 'ثبت جزئیات تجهیزات',
    labelEn: 'Detailed Equipment Items',
    descFa: 'اقلام، کد کالا، مقادیر واقعی/کسری/آسیب، وضعیت کسری/مغایرت، جایگزینی و موجودی',
    descEn: 'Line items, item codes, actual/shortage/damaged qty, MER/REP & stock',
  },
  {
    key: 'transit',
    group: 'inventory',
    labelFa: 'تجهیزات در راه',
    labelEn: 'In-Transit Equipment',
    descFa: 'محموله‌های در مسیر، بارنامه‌ها، علی‌الحساب و وضعیت ارسال',
    descEn: 'Shipments in transit, waybills, interim notes, and status',
  },
  {
    key: 'siteEntryMinutes',
    group: 'operations',
    labelFa: 'صورتجلسه ورود کالا به کارگاه',
    labelEn: 'Site Material Entry Minutes',
    descFa: 'صورتجلسه‌های ثبت‌شده ورود خودرو و تجهیزات به کارگاه',
    descEn: 'Recorded workshop gate & site material arrival minutes',
  },
  {
    key: 'opiInvitations',
    group: 'operations',
    labelFa: 'دعوتنامه گشایش و بازرسی بسته‌ها',
    labelEn: 'OPI Inspection Invitations',
    descFa: 'دعوتنامه‌های صادرشده برای بازرسی پکینگ لیست‌ها',
    descEn: 'Issued package opening & inspection invitations',
  },
  {
    key: 'opiMinutes',
    group: 'operations',
    labelFa: 'صورتجلسه گشایش و بازرسی بسته‌ها',
    labelEn: 'OPI Inspection Minutes',
    descFa: 'نتایج صورتجلسه‌های بازرسی و تطبیق اقلام',
    descEn: 'Recorded opening & package inspection minutes',
  },
  {
    key: 'osdrReports',
    group: 'operations',
    labelFa: 'گزارش مغایرت، کسری و آسیب‌دیدگی',
    labelEn: 'Discrepancy / MER Reports',
    descFa: 'گزارش‌های کسری، اضافی و آسیب‌دیدگی اقلام بازرسی‌شده',
    descEn: 'Shortage, surplus, and damaged equipment reports',
  },
  {
    key: 'gcvDocuments',
    group: 'operations',
    labelFa: 'رسید مصرف مستقیم کالا',
    labelEn: 'Direct Consumption Receipts (GCV)',
    descFa: 'اسناد رسید مستقیم تحویل به مصرف‌کنندگان',
    descEn: 'Direct material consumption receipts',
  },
  {
    key: 'mivDocuments',
    group: 'operations',
    labelFa: 'حواله انبار و فرم ارجاع',
    labelEn: 'Warehouse Issue & Return (MIV / SMR)',
    descFa: 'درخواست‌ها و حواله‌های خروج و ارجاع کالا بین انبار و پیمانکار',
    descEn: 'Material issue vouchers and return notes',
  },
  {
    key: 'substitutions',
    group: 'operations',
    labelFa: 'فرم‌های جایگزینی تجهیزات',
    labelEn: 'Equipment Substitution Records',
    descFa: 'سوابق جایگزینی قطعات و تجهیزات با اقلام معادل',
    descEn: 'Equipment & spare part substitution records',
  },
  {
    key: 'bmrDocuments',
    group: 'operations',
    labelFa: 'گزارش موازنه و کنترل مصرف مواد (BMR)',
    labelEn: 'Balance of Material Reports (BMR)',
    descFa: 'گزارش‌های موازنه و کنترل مصرف مواد صادرشده برای پیمانکاران نصب',
    descEn: 'Issued balance of material and consumption control reports',
  },
  {
    key: 'materialEstimates',
    group: 'operations',
    labelFa: 'برآورد تجهیزات',
    labelEn: 'Equipment Estimation (MTO)',
    descFa: 'فهرست برآورد مهندسی و مقادیر هدف متریال',
    descEn: 'Engineering MTO estimates and target quantities',
  },
  {
    key: 'periodicInspections',
    group: 'operations',
    labelFa: 'انبارگردانی و بازدید ادواری',
    labelEn: 'Periodic Stocktake & Inspections',
    descFa: 'چک‌لیست‌ها و گزارش‌های ثبت‌شده بازدید ادواری انبار',
    descEn: 'Periodic warehouse inspection checklists',
  },
  {
    key: 'customFormSubmissions',
    group: 'operations',
    labelFa: 'فرم‌های اختصاصی ثبت‌شده کارفرما',
    labelEn: 'Custom Employer Form Submissions',
    descFa: 'اسناد پرشده برای فرم‌های اختصاصی هر کارفرما (فایل‌های آپلودشده حفظ می‌شوند)',
    descEn: 'Saved custom form submissions (uploaded form files are preserved)',
  },
  {
    key: 'categories',
    group: 'system',
    labelFa: 'دسته‌بندی‌ها و فهرست‌های پایه',
    labelEn: 'Categories & Lookup Lists',
    descFa: 'فهرست جزیره‌ها، سیستم‌ها، تامین‌کنندگان، واحدها و محل‌های نگهداری',
    descEn: 'Islands, systems, suppliers, units, and storage locations',
  },
  {
    key: 'trash',
    group: 'system',
    labelFa: 'سطل بازیافت',
    labelEn: 'Recycle Bin',
    descFa: 'رکوردهای حذف‌شده موقت که در سطل بازیافت نگهداری می‌شوند',
    descEn: 'Soft-deleted records currently stored in recycle bin',
  },
  {
    key: 'auditLogs',
    group: 'system',
    labelFa: 'تاریخچه ثبت وقایع',
    labelEn: 'Audit Logs',
    descFa: 'گزارش تاریخچه فعالیت کاربران در پروژه (این عملیات مجدداً ثبت می‌شود)',
    descEn: 'Historical action log (a new audit entry is recorded for this purge)',
  },
];

export const DatabasePurgeView: React.FC<DatabasePurgeViewProps> = ({
  refreshSignal,
  onPurged,
}) => {
  const { user, prefs, notify, activeProject, activeProjectId } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';

  const [countsMap, setCountsMap] = useState<Partial<Record<PurgeableSectionKey, number>>>({});
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<PurgeableSectionKey>>(new Set());

  // Security Confirmation Modal State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'single' | 'selected' | 'all'>('selected');
  const [pendingSections, setPendingSections] = useState<PurgeableSectionKey[]>([]);
  const [confirmAckChecked, setConfirmAckChecked] = useState(false);
  const [alsoPurgeSnapshots, setAlsoPurgeSnapshots] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [purging, setPurging] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ items: DatabaseSectionSummaryItem[] }>(
        '/api/database/sections-summary',
      );
      const next: Partial<Record<PurgeableSectionKey, number>> = {};
      for (const item of res.items || []) {
        next[item.key] = item.count;
      }
      setCountsMap(next);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshSignal, activeProjectId]);

  const totalRecordsCount = useMemo(
    () => SECTION_DESCRIPTORS.reduce((sum, s) => sum + (countsMap[s.key] || 0), 0),
    [countsMap],
  );

  const selectedRecordsCount = useMemo(
    () => Array.from(selectedKeys).reduce((sum, k) => sum + (countsMap[k] || 0), 0),
    [selectedKeys, countsMap],
  );

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
        <div className="w-12 h-12 rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)] mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)]">
          {isFa ? 'دسترسی محدود — ویژه مدیر کل' : 'Restricted Access — Admin Only'}
        </h3>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {isFa
            ? 'صفحه حذف و پاکسازی پایگاه داده تنها برای حساب کاربری با نقش مدیر کل قابل مشاهده و اجرا است.'
            : 'Database purge and reset operations are strictly restricted to Administrator accounts.'}
        </p>
      </div>
    );
  }

  const toggleKey = (key: PurgeableSectionKey) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedKeys(new Set(SECTION_DESCRIPTORS.map((s) => s.key)));
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
  };

  const openConfirmation = (mode: 'single' | 'selected' | 'all', keys: PurgeableSectionKey[]) => {
    if (keys.length === 0) return;
    setPendingMode(mode);
    setPendingSections(keys);
    setConfirmAckChecked(false);
    setAlsoPurgeSnapshots(false);
    setTypedPhrase('');
    setConfirmModalOpen(true);
  };

  const isFullWipeTarget =
    pendingMode === 'all' || pendingSections.length === SECTION_DESCRIPTORS.length;

  const expectedPhraseFa = isFullWipeTarget ? 'حذف کل پایگاه داده' : 'حذف اطلاعات';
  const expectedPhraseEn = isFullWipeTarget ? 'DELETE ALL' : 'DELETE';

  const normalizedTyped = typedPhrase
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
  const isPhraseValid = isFullWipeTarget
    ? normalizedTyped === 'حذف کل پایگاه داده' ||
      normalizedTyped === 'حذف کل دیتابیس' ||
      normalizedTyped.toUpperCase() === 'DELETE ALL'
    : normalizedTyped === 'حذف اطلاعات' ||
      normalizedTyped.toUpperCase() === 'DELETE' ||
      normalizedTyped === 'حذف کل پایگاه داده' ||
      normalizedTyped === 'حذف کل دیتابیس' ||
      normalizedTyped.toUpperCase() === 'DELETE ALL';

  const handleDownloadPrePurgeBackup = async () => {
    setBackingUp(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      const safeSlug = (activeProject?.code || activeProjectId).replace(/[^a-zA-Z0-9_-]+/g, '-');
      downloadJsonBackup(snapshot, `samaan-pre-purge-${safeSlug}`);
      notify(
        'success',
        isFa
          ? 'نسخه پشتیبان کامل پیش از حذف دانلود شد.'
          : 'Pre-purge JSON backup downloaded.',
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleExecutePurge = async () => {
    if (!confirmAckChecked || !isPhraseValid || pendingSections.length === 0) return;
    setPurging(true);
    try {
      const res = await apiRequest<DatabasePurgeResponse>('/api/database/purge', {
        method: 'POST',
        body: JSON.stringify({
          sections: pendingSections,
          wipeAll: isFullWipeTarget,
          confirmationText: normalizedTyped,
        }),
      });

      if (alsoPurgeSnapshots) {
        try {
          const snaps = await listIndexedDbSnapshots(activeProjectId);
          for (const snap of snaps) {
            await deleteIndexedDbSnapshot(snap.id);
          }
        } catch {
          // ignore IndexedDB errors
        }
      }

      setConfirmModalOpen(false);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        res.purgedSections.forEach((k) => next.delete(k));
        return next;
      });
      await loadSummary();
      onPurged();
      notify(
        'success',
        isFa
          ? `پاکسازی با موفقیت انجام شد: ${res.purgedSections.length.toLocaleString('fa-IR')} بخش و مجموع ${res.totalDeleted.toLocaleString('fa-IR')} رکورد حذف شد.`
          : `Purge completed: ${res.purgedSections.length} section(s), ${res.totalDeleted} record(s) permanently deleted.`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setPurging(false);
    }
  };

  const groups: Array<{
    id: 'inventory' | 'operations' | 'system';
    titleFa: string;
    titleEn: string;
  }> = [
    {
      id: 'inventory',
      titleFa: 'بخش‌های اصلی موجودی و ورود کالا',
      titleEn: 'Core Inventory & Arrival Tables',
    },
    {
      id: 'operations',
      titleFa: 'فرم‌های عملیاتی، بازرسی و گزارش‌ها',
      titleEn: 'Operational Forms, Inspections & Reports',
    },
    {
      id: 'system',
      titleFa: 'پایه‌ها، سطل بازیافت و ثبت وقایع',
      titleEn: 'Lookups, Recycle Bin & Logs',
    },
  ];

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Executive Warning & Master Action Bar */}
      <div className="rounded-xl border border-[var(--status-danger)]/40 bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[var(--status-danger)] shrink-0" />
              <span>
                {isFa
                  ? 'مدیریت امنیتی و حذف پایگاه داده بخش‌های پروژه'
                  : 'Secure Database Purge & Section Reset'}
              </span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `این صفحه فقط در اختیار مدیر کل است. می‌توانید هر بخش را به‌صورت جداگانه پاک کنید، چند بخش دلخواه را هم‌زمان انتخاب کنید یا کل داده‌های پروژه فعال («${activeProject?.name || activeProjectId}») را پاکسازی نمایید. حساب‌های کاربری، فهرست پروژه‌ها و تنظیمات کارفرمایان حفظ می‌شوند.`
                : `Restricted to Administrators. Purge individual sections, multi-select custom tables, or wipe all operational data for the active project ("${activeProject?.name || activeProjectId}"). User accounts, projects, and employer profiles and uploaded forms are preserved.`}
            </p>
            <div className="text-[11px] text-[var(--text-muted)] tabular-nums pt-0.5 flex flex-wrap items-center gap-2">
              <span>
                {isFa
                  ? `کل رکوردهای ثبت‌شده در پروژه فعال: ${totalRecordsCount.toLocaleString('fa-IR')} رکورد`
                  : `Total records in active project: ${totalRecordsCount}`}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isFa
                  ? `انتخاب‌شده: ${selectedKeys.size.toLocaleString('fa-IR')} بخش (${selectedRecordsCount.toLocaleString('fa-IR')} رکورد)`
                  : `Selected: ${selectedKeys.size} section(s) (${selectedRecordsCount} records)`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'بروزرسانی شمارنده' : 'Refresh Counts'}</span>
            </button>

            <button
              type="button"
              disabled={selectedKeys.size === 0}
              onClick={() => openConfirmation('selected', Array.from(selectedKeys))}
              className="h-9 px-3.5 rounded-lg border border-[var(--status-danger)] text-[var(--status-danger)] bg-[var(--status-danger-bg)] hover:opacity-90 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {isFa
                  ? `حذف بخش‌های انتخاب‌شده (${selectedKeys.size.toLocaleString('fa-IR')})`
                  : `Purge Selected (${selectedKeys.size})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                openConfirmation(
                  'all',
                  SECTION_DESCRIPTORS.map((s) => s.key),
                )
              }
              className="h-9 px-4 rounded-lg bg-[var(--status-danger)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isFa ? 'حذف کل پایگاه داده پروژه' : 'Wipe Entire Project DB'}</span>
            </button>
          </div>
        </div>

        {/* Multi-select Quick Toolbar */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="h-7 px-2.5 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1.5"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'انتخاب همه بخش‌ها' : 'Select All Sections'}</span>
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedKeys.size === 0}
              className="h-7 px-2.5 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>{isFa ? 'لغو انتخاب همه' : 'Clear Selection'}</span>
            </button>
          </div>

          <button
            type="button"
            disabled={backingUp}
            onClick={handleDownloadPrePurgeBackup}
            className="h-7 px-3 rounded-md border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>
              {isFa
                ? 'دانلود نسخه پشتیبان کامل (JSON) پیش از پاکسازی'
                : 'Download JSON Backup First'}
            </span>
          </button>
        </div>
      </div>

      {/* Grouped Structured Table of All Sections */}
      {groups.map((grp) => {
        const items = SECTION_DESCRIPTORS.filter((d) => d.group === grp.id);
        return (
          <div
            key={grp.id}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/50 text-xs font-bold text-[var(--text-primary)]">
              {isFa ? grp.titleFa : grp.titleEn}
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {items.map((item) => {
                const count = countsMap[item.key] ?? 0;
                const isChecked = selectedKeys.has(item.key);
                return (
                  <div
                    key={item.key}
                    className={`px-5 py-3 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      isChecked ? 'bg-[var(--status-danger-bg)]/40' : 'hover:bg-[var(--bg-subtle)]/40'
                    }`}
                  >
                    <label className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleKey(item.key)}
                        className="mt-1 rounded border-[var(--border-strong)] accent-[var(--status-danger)]"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          {isFa ? item.labelFa : item.labelEn}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {isFa ? item.descFa : item.descEn}
                        </div>
                      </div>
                    </label>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                        {isFa
                          ? `${count.toLocaleString('fa-IR')} رکورد`
                          : `${count.toLocaleString()} records`}
                      </span>

                      <button
                        type="button"
                        onClick={() => openConfirmation('single', [item.key])}
                        className="h-8 px-3 rounded-lg border border-[var(--status-danger)]/50 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'حذف این بخش' : 'Purge Section'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Security Confirmation Modal with Explicit Question & Typed Confirmation Phrase */}
      {confirmModalOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55 p-4 print:hidden"
          onClick={() => !purging && setConfirmModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--status-danger)]/60 bg-[var(--bg-surface)] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--status-danger-bg)] text-[var(--status-danger)] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--status-danger)]">
                    {isFa
                      ? 'تایید امنیتی: آیا مطمئن هستید که می‌خواهید پایگاه داده حذف شود؟'
                      : 'Security Confirmation: Are you sure you want to delete this database data?'}
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {isFa
                      ? `پروژه فعال: «${activeProject?.name || activeProjectId}» — این عملیات دائمی است و اطلاعات حذف‌شده قابل بازگردانی از سطل بازیافت نخواهند بود.`
                      : `Active Project: "${activeProject?.name || activeProjectId}" — This operation is permanent and cannot be undone from the recycle bin.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={purging}
                onClick={() => setConfirmModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary of target sections */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 max-h-40 overflow-y-auto space-y-1 text-xs">
              <div className="text-[11px] font-bold text-[var(--text-muted)] mb-1">
                {isFa
                  ? `بخش‌های انتخاب‌شده برای حذف (${pendingSections.length.toLocaleString('fa-IR')} مورد):`
                  : `Sections scheduled for deletion (${pendingSections.length}):`}
              </div>
              {pendingSections.map((secKey) => {
                const desc = SECTION_DESCRIPTORS.find((d) => d.key === secKey);
                const cnt = countsMap[secKey] ?? 0;
                return (
                  <div
                    key={secKey}
                    className="flex items-center justify-between gap-2 text-[11px] py-0.5"
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {desc ? (isFa ? desc.labelFa : desc.labelEn) : secKey}
                    </span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      {isFa ? `${cnt.toLocaleString('fa-IR')} رکورد` : `${cnt} records`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Quick Backup Option */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 text-xs">
              <span className="text-[11px] text-[var(--text-secondary)]">
                {isFa
                  ? 'پیشنهاد امنیتی: پیش از حذف نسخه پشتیبان بگیرید'
                  : 'Safety recommendation: Export backup before purging'}
              </span>
              <button
                type="button"
                disabled={backingUp || purging}
                onClick={handleDownloadPrePurgeBackup}
                className="h-7 px-2.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
              >
                <Download className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>{isFa ? 'دانلود پشتیبان JSON' : 'Export JSON'}</span>
              </button>
            </div>

            {/* Mandatory Checkboxes */}
            <div className="space-y-2 text-xs">
              <label className="flex items-start gap-2 cursor-pointer font-medium text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={confirmAckChecked}
                  onChange={(e) => setConfirmAckChecked(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border-strong)] accent-[var(--status-danger)]"
                />
                <span>
                  {isFa
                    ? 'بله، مطمئن هستم که می‌خواهم اطلاعات انتخاب‌شده به‌طور کامل از پایگاه داده حذف شوند.'
                    : 'Yes, I confirm that I want to permanently delete the selected database sections.'}
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-[11px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={alsoPurgeSnapshots}
                  onChange={(e) => setAlsoPurgeSnapshots(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--border-strong)] accent-[var(--status-danger)]"
                />
                <span>
                  {isFa
                    ? 'اسنپ‌شات‌های آفلاین ذخیره‌شده در حافظه مرورگر برای این پروژه نیز هم‌زمان پاک شوند.'
                    : 'Also delete local browser offline snapshots for this project.'}
                </span>
              </label>
            </div>

            {/* Mandatory Security Phrase Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[var(--text-primary)]">
                {isFa ? (
                  <>
                    برای تایید نهایی، عبارت{' '}
                    <span className="font-mono text-[var(--status-danger)] px-1" dir="rtl">
                      {expectedPhraseFa}
                    </span>{' '}
                    (یا{' '}
                    <span className="font-mono text-[var(--status-danger)] px-1" dir="ltr">
                      {expectedPhraseEn}
                    </span>
                    ) را در کادر زیر تایپ کنید:
                  </>
                ) : (
                  <>
                    To confirm permanently, type{' '}
                    <span className="font-mono text-[var(--status-danger)] px-1">
                      {expectedPhraseEn}
                    </span>{' '}
                    below:
                  </>
                )}
              </label>
              <input
                type="text"
                value={typedPhrase}
                onChange={(e) => setTypedPhrase(e.target.value)}
                placeholder={isFa ? expectedPhraseFa : expectedPhraseEn}
                autoFocus
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--status-danger)]"
              />
              {typedPhrase.length > 0 && !isPhraseValid && (
                <p className="text-[11px] text-[var(--status-danger)]">
                  {isFa
                    ? `عبارت واردشده مطابقت ندارد. لطفاً دقیقاً «${expectedPhraseFa}» یا «${expectedPhraseEn}» را بنویسید.`
                    : `Phrase does not match "${expectedPhraseEn}".`}
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={purging}
                onClick={() => setConfirmModalOpen(false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={purging || !confirmAckChecked || !isPhraseValid}
                onClick={handleExecutePurge}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {purging
                    ? isFa ? 'در حال پاکسازی...' : 'Purging...'
                    : isFa ? 'تایید و حذف نهایی اطلاعات' : 'Confirm Permanent Deletion'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
