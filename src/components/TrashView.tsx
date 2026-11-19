import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FilterX,
  Loader2,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { formatDisplayNumber } from '../shared/jalali.ts';
import { formatCountingUnit } from '../shared/normalizers.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry, TrashRecord } from '../shared/types.ts';
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';
import type { PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';

interface TrashViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface TrashScopeCounts {
  all: number;
  general: number;
  detailed: number;
  transit: number;
}

interface TrashListResponse {
  items: TrashRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  scopeCounts: TrashScopeCounts;
}

function getTrashFieldSummary(item: TrashRecord): {
  packingNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  supplier: string;
  island: string;
} {
  const d = item.data as Partial<GeneralEntry & DetailedEntry & TransitEntry>;
  return {
    packingNo: item.scope === 'detailed' ? d.shipmentNo || '' : d.packingListNo || '',
    packageNo: d.packageNo || '',
    itemNo: item.scope === 'detailed' ? d.itemNo || '' : '',
    description:
      item.scope === 'detailed'
        ? d.description || d.generalDescription || ''
        : d.itemDescription || '',
    supplier: d.supplier || '',
    island: d.island || '',
  };
}

export const TrashView: React.FC<TrashViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, formatTimestamp, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const fmtNum = (n: number) => formatDisplayNumber(n, prefs.language);

  const [scope, setScope] = useState<'' | 'general' | 'detailed' | 'transit'>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [items, setItems] = useState<TrashRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scopeCounts, setScopeCounts] = useState<TrashScopeCounts>({
    all: 0,
    general: 0,
    detailed: 0,
    transit: 0,
  });
  const [loading, setLoading] = useState(true);

  // Selection state (supports selecting all 20,000+ filtered IDs cleanly)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAllMatching, setSelectingAllMatching] = useState(false);

  // Modals & action states
  const [inspectTarget, setInspectTarget] = useState<TrashRecord | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TrashRecord | null>(null);
  const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);
  const [bulkRestoreLinked, setBulkRestoreLinked] = useState(true);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  // Debounce search input so 20k+ row tables stay instant
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const buildQueryParams = useCallback(
    (extras?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (scope) params.set('scope', scope);
      if (q.trim()) params.set('q', q.trim());
      if (Object.keys(colFilters).length > 0) {
        params.set('colFilters', JSON.stringify(colFilters));
      }
      params.set('calendar', prefs.calendar);
      if (sortBy && sortDir) {
        params.set('sortBy', sortBy);
        params.set('sortDir', sortDir);
      }
      if (extras) {
        for (const [k, v] of Object.entries(extras)) {
          params.set(k, v);
        }
      }
      return params;
    },
    [scope, q, colFilters, prefs.calendar, sortBy, sortDir],
  );

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildQueryParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await apiRequest<TrashListResponse>(`/api/trash?${params.toString()}`);
      setItems(res.items || []);
      setTotal(res.total ?? (res.items || []).length);
      setTotalPages(res.totalPages ?? 1);
      if (res.page && res.page !== page) setPage(res.page);
      if (res.scopeCounts) {
        setScopeCounts(res.scopeCounts);
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams, page, pageSize, notify]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash, refreshSignal]);

  const activeFilterCount = Object.keys(colFilters).length + (sortBy ? 1 : 0) + (q.trim() ? 1 : 0);

  const handleSortChange = useCallback((colKey: string, dir: 'asc' | 'desc' | null) => {
    if (!dir) {
      setSortBy('');
      setSortDir(null);
    } else {
      setSortBy(colKey);
      setSortDir(dir);
    }
    setPage(1);
  }, []);

  const handleApplyColFilter = useCallback((colKey: string, allowed: string[] | undefined) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (allowed === undefined) delete next[colKey];
      else next[colKey] = allowed;
      return next;
    });
    setPage(1);
  }, []);

  const handleClearAllFilters = () => {
    setQInput('');
    setQ('');
    setColFilters({});
    setSortBy('');
    setSortDir(null);
    setPage(1);
  };

  // Selection helpers
  const allOnPageSelected = items.length > 0 && items.every((it) => selectedIds.has(it.id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        items.forEach((it) => next.delete(it.id));
      } else {
        items.forEach((it) => next.add(it.id));
      }
      return next;
    });
  };

  const handleSelectAllMatching = async () => {
    if (total === 0) return;
    setSelectingAllMatching(true);
    try {
      const params = buildQueryParams({ idsOnly: 'true' });
      const res = await apiRequest<{ ids: string[]; total: number }>(`/api/trash?${params.toString()}`);
      setSelectedIds(new Set(res.ids || []));
      notify(
        'info',
        isFa
          ? `تعداد ${fmtNum((res.ids || []).length)} ردیف انتخاب شد.`
          : `Selected ${fmtNum((res.ids || []).length)} matching row(s).`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSelectingAllMatching(false);
    }
  };

  // Single restore / purge
  const executeRestore = async (item: TrashRecord, restoreDetailed: boolean) => {
    setBusyAction(true);
    try {
      const qs = restoreDetailed ? '?restoreDetailed=true' : '?restoreDetailed=false';
      const res = await apiRequest<{ restoredDetailedCount?: number }>(
        `/api/trash/${item.id}/restore${qs}`,
        { method: 'POST' },
      );
      const restoredDetailedCount = res.restoredDetailedCount || 0;
      notify(
        'success',
        isFa
          ? restoredDetailedCount > 0
            ? `ردیف «${item.targetLabel}» و ${fmtNum(restoredDetailedCount)} ردیف جزئیات مرتبط بازیابی شدند.`
            : `ردیف «${item.targetLabel}» با موفقیت بازیابی شد.`
          : restoredDetailedCount > 0
            ? `Restored "${item.targetLabel}" along with ${restoredDetailedCount} linked Detailed rows.`
            : `Restored "${item.targetLabel}".`,
      );
      setRestoreTarget(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      triggerAutoSnapshot(`Restore ${item.targetLabel}`);
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRestoreClick = (item: TrashRecord) => {
    if (item.scope === 'general' && (item.linkedTrashDetailedCount || 0) > 0) {
      setRestoreTarget(item);
      return;
    }
    executeRestore(item, false);
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    setBusyAction(true);
    try {
      await apiRequest(`/api/trash/${purgeTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa ? 'ردیف به‌صورت دائمی حذف شد.' : 'Record permanently deleted.',
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(purgeTarget.id);
        return next;
      });
      setPurgeTarget(null);
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyAction(false);
    }
  };

  // Bulk restore & bulk permanent delete
  const handleConfirmBulkRestore = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBusyAction(true);
    try {
      const res = await apiRequest<{
        restoredCount: number;
        restoredDetailedCount: number;
        skippedConflicts: number;
      }>('/api/trash/bulk-restore', {
        method: 'POST',
        body: JSON.stringify({ ids, restoreDetailed: bulkRestoreLinked }),
      });
      const partsFa = [`${fmtNum(res.restoredCount)} ردیف بازیابی شد`];
      if (res.restoredDetailedCount > 0) {
        partsFa.push(`${fmtNum(res.restoredDetailedCount)} ردیف جزئیات مرتبط`);
      }
      if (res.skippedConflicts > 0) {
        partsFa.push(`${fmtNum(res.skippedConflicts)} مورد تکراری رد شد`);
      }
      const partsEn = [`Restored ${fmtNum(res.restoredCount)} row(s)`];
      if (res.restoredDetailedCount > 0) {
        partsEn.push(`${fmtNum(res.restoredDetailedCount)} linked detailed row(s)`);
      }
      if (res.skippedConflicts > 0) {
        partsEn.push(`${fmtNum(res.skippedConflicts)} duplicate conflict(s) skipped`);
      }
      notify('success', isFa ? partsFa.join(' · ') : partsEn.join(' · '));
      setBulkRestoreOpen(false);
      setSelectedIds(new Set());
      triggerAutoSnapshot(`Bulk Restore ${res.restoredCount} rows`);
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmBulkPurge = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBusyAction(true);
    try {
      const res = await apiRequest<{ deletedCount: number }>('/api/trash/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      notify(
        'success',
        isFa
          ? `تعداد ${fmtNum(res.deletedCount)} ردیف به‌صورت دائمی از سطل بازیافت حذف شد.`
          : `Permanently deleted ${fmtNum(res.deletedCount)} row(s) from Recycle Bin.`,
      );
      setBulkPurgeOpen(false);
      setSelectedIds(new Set());
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusyAction(false);
    }
  };

  const scopeLabel = useCallback(
    (s: TrashRecord['scope']) => {
      if (s === 'general') return t.nav.general;
      if (s === 'detailed') return t.nav.detailed;
      return t.nav.transit;
    },
    [t.nav.detailed, t.nav.general, t.nav.transit],
  );

  const scopeTabs: Array<{ key: '' | 'general' | 'detailed' | 'transit'; label: string; count: number }> = [
    { key: '', label: isFa ? 'همه بخش‌ها' : 'All Scopes', count: scopeCounts.all },
    { key: 'general', label: t.nav.general, count: scopeCounts.general },
    { key: 'detailed', label: t.nav.detailed, count: scopeCounts.detailed },
    { key: 'transit', label: t.nav.transit, count: scopeCounts.transit },
  ];

  const printColumns = useMemo<PrintColumnDef<TrashRecord>[]>(
    () => [
      { key: 'scope', header: isFa ? 'بخش' : 'Scope', getValue: (r) => scopeLabel(r.scope) },
      { key: 'packingNo', header: t.headers.packingListNo, getValue: (r) => getTrashFieldSummary(r).packingNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => getTrashFieldSummary(r).packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => getTrashFieldSummary(r).itemNo },
      { key: 'description', header: t.headers.description, getValue: (r) => getTrashFieldSummary(r).description },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => getTrashFieldSummary(r).supplier },
      { key: 'island', header: t.headers.island, getValue: (r) => getTrashFieldSummary(r).island },
      { key: 'deletedBy', header: isFa ? 'حذف توسط' : 'Deleted By', getValue: (r) => r.deletedBy },
      { key: 'deletedAt', header: isFa ? 'زمان حذف' : 'Deleted At', getValue: (r) => formatTimestamp(r.deletedAt) },
    ],
    [isFa, scopeLabel, t.headers, formatTimestamp],
  );

  const printRows = useMemo(() => {
    if (selectedIds.size > 0) {
      const selectedOnPage = items.filter((it) => selectedIds.has(it.id));
      if (selectedOnPage.length > 0) return selectedOnPage;
    }
    return items;
  }, [items, selectedIds]);

  const inspectFields = useMemo(() => {
    if (!inspectTarget) return [];
    const d = inspectTarget.data as Partial<GeneralEntry & DetailedEntry & TransitEntry>;
    const rows: Array<{ label: string; value: string }> = [
      { label: isFa ? 'بخش مبدا' : 'Scope', value: scopeLabel(inspectTarget.scope) },
      { label: isFa ? 'شناسه نمایشی' : 'Record Label', value: inspectTarget.targetLabel },
      { label: isFa ? 'حذف توسط' : 'Deleted By', value: inspectTarget.deletedBy },
      { label: isFa ? 'زمان حذف' : 'Deleted At', value: formatTimestamp(inspectTarget.deletedAt) },
    ];
    if (d.arrivalDate) rows.push({ label: t.headers.arrivalDate, value: formatDate(d.arrivalDate) });
    if (inspectTarget.scope === 'detailed' && d.shipmentNo) {
      rows.push({ label: t.headers.shipmentNo, value: d.shipmentNo });
    } else if (d.packingListNo) {
      rows.push({ label: t.headers.packingListNo, value: d.packingListNo });
    }
    if (d.packageNo) rows.push({ label: t.headers.packageNo, value: d.packageNo });
    if (d.itemNo) rows.push({ label: t.headers.itemNo, value: d.itemNo });
    if (d.generalDescription) rows.push({ label: t.headers.generalDescription, value: d.generalDescription });
    if (d.description || d.itemDescription) {
      rows.push({ label: t.headers.description, value: d.description || d.itemDescription || '' });
    }
    if (d.itemCode) rows.push({ label: t.headers.itemCode, value: d.itemCode });
    if (d.size) rows.push({ label: t.headers.size, value: d.size });
    if (d.packingQty !== undefined && d.packingQty !== null) {
      const unitStr = formatCountingUnit(d.countingUnit, prefs.language);
      rows.push({
        label: t.headers.packingQty,
        value: `${fmtNum(d.packingQty)}${unitStr ? ` ${unitStr}` : ''}`,
      });
    }
    if (d.actualQty !== undefined && d.actualQty !== null) {
      rows.push({ label: t.headers.actualQty, value: fmtNum(d.actualQty) });
    }
    if (d.grossWeight !== undefined && d.grossWeight !== null) {
      rows.push({ label: t.headers.grossWeight, value: `${fmtNum(d.grossWeight)} kg` });
    }
    if (d.netWeight !== undefined && d.netWeight !== null) {
      rows.push({ label: t.headers.netWeight, value: `${fmtNum(d.netWeight)} kg` });
    }
    if (d.supplier) rows.push({ label: t.headers.supplier, value: d.supplier });
    if (d.island) rows.push({ label: t.headers.island, value: d.island });
    if (d.system) rows.push({ label: t.headers.system, value: d.system });
    if (d.subSystem) rows.push({ label: t.headers.subSystem, value: d.subSystem });
    if (d.unit) rows.push({ label: t.headers.unit, value: d.unit });
    if (d.overallStatus) rows.push({ label: t.headers.overallStatus, value: d.overallStatus });
    if (d.storageLocation) rows.push({ label: t.headers.storageLocation, value: d.storageLocation });
    if (d.notes) rows.push({ label: t.headers.notes, value: d.notes });
    return rows;
  }, [inspectTarget, isFa, scopeLabel, formatTimestamp, formatDate, t.headers, prefs.language]);

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(total, page * pageSize);

  return (
    <div className="space-y-4">
      {/* Scope Summary Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {scopeTabs.map((tab) => {
          const active = scope === tab.key;
          return (
            <button
              key={tab.key || 'all'}
              type="button"
              onClick={() => {
                setScope(tab.key);
                setPage(1);
                setSelectedIds(new Set());
              }}
              className={`rounded-xl border px-3.5 py-2.5 text-start transition-colors flex items-center justify-between gap-2 ${
                active
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)]'
              }`}
            >
              <span className="text-xs font-bold truncate">{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-extrabold tabular-nums ${
                  active
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {fmtNum(tab.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Page Size & Utilities Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInputWithClear
            value={qInput}
            onChange={setQInput}
            placeholder={
              isFa
                ? 'جستجو در پکینگ لیست، نگله، شماره آیتم، شرح کالا، تامین‌کننده، جزیره یا کاربر حذف‌کننده...'
                : 'Search packing list, package, item no., description, supplier, island, or deleted by...'
            }
            className="flex-1 min-w-[240px]"
            inputClassName="text-xs"
          />

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label={isFa ? 'تعداد ردیف در صفحه' : 'Rows per page'}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
          >
            {[50, 100, 200, 500].map((sz) => (
              <option key={sz} value={sz}>
                {isFa ? `${fmtNum(sz)} ردیف در صفحه` : `${sz} / page`}
              </option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium inline-flex items-center gap-1.5 text-[var(--status-danger)]"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>{t.controls.clearFilters}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            disabled={items.length === 0}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-50 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.controls.printReport}</span>
          </button>
        </div>

        {/* Selection & Bulk Actions Bar */}
        {canEdit && total > 0 && (
          <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectPage}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>{allOnPageSelected ? (isFa ? 'لغو انتخاب صفحه' : 'Unselect Page') : t.controls.selectAllPage}</span>
              </button>

              <button
                type="button"
                disabled={selectingAllMatching}
                onClick={handleSelectAllMatching}
                className="h-8 px-2.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {selectingAllMatching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckSquare className="w-3.5 h-3.5" />
                )}
                <span>
                  {isFa
                    ? `انتخاب کل ردیف‌های جدول (${fmtNum(total)})`
                    : `Select All Matching (${fmtNum(total)})`}
                </span>
              </button>

              {selectedIds.size > 0 && (
                <>
                  <span className="text-xs font-bold text-[var(--accent-primary)] tabular-nums px-1">
                    {fmtNum(selectedIds.size)} {t.controls.selectedCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                  >
                    {t.controls.clearSelection}
                  </button>
                </>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkRestoreOpen(true)}
                  className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isFa
                      ? `بازیابی گروهی (${fmtNum(selectedIds.size)})`
                      : `Bulk Restore (${fmtNum(selectedIds.size)})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkPurgeOpen(true)}
                  className="h-8 px-3 rounded-lg bg-[var(--status-danger)] hover:opacity-90 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isFa
                      ? `حذف دائمی گروهی (${fmtNum(selectedIds.size)})`
                      : `Bulk Permanent Delete (${fmtNum(selectedIds.size)})`}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Paginated Recycle Bin Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
        <StickyTableWrapper>
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                {canEdit && (
                  <th className="py-2.5 px-2 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectPage}
                      aria-label={t.controls.selectAllPage}
                    />
                  </th>
                )}
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="scope"
                    label={isFa ? 'بخش' : 'Scope'}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.scope}
                    sortDir={sortBy === 'scope' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="packingNo"
                    label={t.headers.packingListNo}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.packingNo}
                    sortDir={sortBy === 'packingNo' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="packageNo"
                    label={t.headers.packageNo}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.packageNo}
                    sortDir={sortBy === 'packageNo' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="itemNo"
                    label={t.headers.itemNo}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.itemNo}
                    sortDir={sortBy === 'itemNo' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start min-w-[160px]">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="description"
                    label={t.headers.description}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.description}
                    sortDir={sortBy === 'description' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="supplier"
                    label={t.headers.supplier}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.supplier}
                    sortDir={sortBy === 'supplier' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="island"
                    label={t.headers.island}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.island}
                    sortDir={sortBy === 'island' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="deletedBy"
                    label={isFa ? 'حذف توسط' : 'Deleted By'}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.deletedBy}
                    sortDir={sortBy === 'deletedBy' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2 text-start whitespace-nowrap">
                  <ExcelColumnFilter
                    scope="trash"
                    colKey="deletedDate"
                    label={isFa ? 'زمان حذف' : 'Deleted At'}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    activeValues={colFilters.deletedDate}
                    sortDir={sortBy === 'deletedDate' ? sortDir : null}
                    refreshSignal={refreshSignal}
                    onSortChange={handleSortChange}
                    onApplyFilter={handleApplyColFilter}
                  />
                </th>
                <th className="py-2.5 px-2.5 text-end whitespace-nowrap sticky end-0 bg-[var(--bg-subtle)] border-s border-[var(--border-subtle)] z-10">
                  {isFa ? 'عملیات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="py-12 text-center text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                      <span>{t.controls.loading}</span>
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 11 : 10} className="py-12 text-center text-[var(--text-muted)]">
                    {activeFilterCount > 0 || scope
                      ? isFa
                        ? 'هیچ ردیف حذف‌شده‌ای مطابق با فیلتر فعلی یافت نشد.'
                        : 'No deleted rows match the active filter.'
                      : isFa
                        ? 'سطل بازیافت خالی است.'
                        : 'Recycle Bin is empty.'}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const linkedCount = item.linkedTrashDetailedCount || 0;
                  const f = getTrashFieldSummary(item);
                  const isChecked = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-[var(--bg-subtle)]/40 ${isChecked ? 'bg-[var(--accent-soft)]/40' : ''}`}
                    >
                      {canEdit && (
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(item.id)}
                          />
                        </td>
                      )}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[11px] font-semibold">
                          {scopeLabel(item.scope)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap font-semibold tabular-nums bidi-plaintext">
                        {f.packingNo || '-'}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap tabular-nums bidi-plaintext">
                        {f.packageNo || '-'}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap tabular-nums bidi-plaintext">
                        {f.itemNo || '-'}
                      </td>
                      <td className="py-2.5 px-2 max-w-[220px]">
                        <div className="truncate bidi-plaintext font-medium" title={f.description || item.targetLabel}>
                          {f.description || item.targetLabel}
                        </div>
                        {item.scope === 'general' && linkedCount > 0 && (
                          <div className="text-[11px] text-[var(--accent-primary)] mt-0.5 tabular-nums">
                            {isFa
                              ? `دارای ${fmtNum(linkedCount)} ردیف جزئیات حذف‌شده مرتبط`
                              : `${fmtNum(linkedCount)} linked Detailed row(s) in Recycle Bin`}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap max-w-[130px] truncate bidi-plaintext" title={f.supplier}>
                        {f.supplier || '-'}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {f.island || '-'}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">{item.deletedBy}</td>
                      <td className="py-2.5 px-2 whitespace-nowrap tabular-nums text-[var(--text-muted)]">
                        {formatTimestamp(item.deletedAt)}
                      </td>
                      <td className="py-2.5 px-2.5 text-end whitespace-nowrap sticky end-0 bg-[var(--bg-surface)] border-s border-[var(--border-subtle)]">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectTarget(item)}
                            title={isFa ? 'مشاهده جزئیات کامل' : 'Inspect details'}
                            className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[11px] inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => handleRestoreClick(item)}
                                className="h-7 px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90 text-[11px] font-semibold inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{t.controls.restore}</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => setPurgeTarget(item)}
                                className="h-7 px-2 rounded-lg hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-medium inline-flex items-center gap-1"
                                title={t.controls.purge}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-[var(--text-muted)] tabular-nums">
            {total > 0
              ? isFa
                ? `نمایش ${fmtNum(startIndex)} تا ${fmtNum(endIndex)} از ${fmtNum(total)} ردیف حذف‌شده`
                : `Showing ${fmtNum(startIndex)}–${fmtNum(endIndex)} of ${fmtNum(total)} deleted rows`
              : isFa
                ? '۰ ردیف'
                : '0 rows'}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(1)}
              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 hover:bg-[var(--bg-subtle)]"
              title={isFa ? 'صفحه اول' : 'First page'}
            >
              {isFa ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 hover:bg-[var(--bg-subtle)] inline-flex items-center gap-1"
            >
              {isFa ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
              <span>{isFa ? 'قبلی' : 'Prev'}</span>
            </button>

            <span className="px-2.5 font-semibold tabular-nums text-[var(--text-primary)]">
              {isFa
                ? `صفحه ${fmtNum(page)} از ${fmtNum(totalPages)}`
                : `Page ${fmtNum(page)} of ${fmtNum(totalPages)}`}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 hover:bg-[var(--bg-subtle)] inline-flex items-center gap-1"
            >
              <span>{isFa ? 'بعدی' : 'Next'}</span>
              {isFa ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(totalPages)}
              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] disabled:opacity-40 hover:bg-[var(--bg-subtle)]"
              title={isFa ? 'صفحه آخر' : 'Last page'}
            >
              {isFa ? <ChevronsLeft className="w-3.5 h-3.5" /> : <ChevronsRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Row Details Modal */}
      {inspectTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setInspectTarget(null)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                {isFa ? 'جزئیات ردیف حذف‌شده' : 'Deleted Record Details'}
              </h3>
              <button type="button" onClick={() => setInspectTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {inspectFields.map((row) => (
                <div
                  key={row.label}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2"
                >
                  <div className="text-[10px] text-[var(--text-muted)]">{row.label}</div>
                  <div className="font-semibold text-[var(--text-primary)] mt-0.5 break-words bidi-plaintext">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.close}
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const target = inspectTarget;
                    setInspectTarget(null);
                    handleRestoreClick(target);
                  }}
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.controls.restore}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Single Cascade Restore Confirmation Modal */}
      {restoreTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !busyAction && setRestoreTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'بازیابی ردیف‌های جزئیات مرتبط' : 'Restore Linked Detailed Rows?'}
              </h3>
              <button type="button" disabled={busyAction} onClick={() => setRestoreTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `برای ردیف «${restoreTarget.targetLabel}»، تعداد ${fmtNum(restoreTarget.linkedTrashDetailedCount || 0)} ردیف جزئیات (دیتیل) مرتبط نیز در سطل بازیافت وجود دارد. آیا ردیف‌های جزئیات مرتبط هم هم‌زمان بازیابی شوند؟`
                : `Record "${restoreTarget.targetLabel}" has ${restoreTarget.linkedTrashDetailedCount || 0} linked Detailed row(s) in the Recycle Bin. Do you want to restore those linked Detailed rows as well?`}
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setRestoreTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => executeRestore(restoreTarget, false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-strong)] text-xs font-semibold hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'فقط بازیابی ثبت کلی تجهیزات' : 'Restore General Equipment Only'}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => executeRestore(restoreTarget, true)}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
              >
                {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{isFa ? 'بازیابی ثبت کلی و جزئیات مرتبط' : 'Restore General & Linked Detailed'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Restore Confirmation Modal */}
      {bulkRestoreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !busyAction && setBulkRestoreOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'تایید بازیابی گروهی از سطل بازیافت' : 'Confirm Bulk Restore'}
              </h3>
              <button type="button" disabled={busyAction} onClick={() => setBulkRestoreOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `تعداد ${fmtNum(selectedIds.size)} ردیف انتخاب‌شده به جداول اصلی سامانه بازگردانده می‌شوند. مواردی که شماره آیتم تکراری داشته باشند برای حفظ یکپارچگی داده‌ها رد خواهند شد.`
                : `${fmtNum(selectedIds.size)} selected row(s) will be restored to their original tables. Any duplicate item numbers will be safely skipped.`}
            </p>
            {(scope === '' || scope === 'general') && (
              <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5">
                <input
                  type="checkbox"
                  checked={bulkRestoreLinked}
                  onChange={(e) => setBulkRestoreLinked(e.target.checked)}
                />
                <span>
                  {isFa
                    ? 'بازیابی هم‌زمان ردیف‌های جزئیات مرتبط با رکوردهای ثبت کلی'
                    : 'Also restore linked Detailed rows for selected General records'}
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setBulkRestoreOpen(false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleConfirmBulkRestore}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>
                  {busyAction
                    ? isFa ? 'در حال بازیابی...' : 'Restoring...'
                    : isFa ? `تایید بازیابی (${fmtNum(selectedIds.size)})` : `Restore (${fmtNum(selectedIds.size)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Permanent Purge Confirmation */}
      {purgeTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !busyAction && setPurgeTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--status-danger)]">
                {isFa ? 'حذف دائمی و غیرقابل بازگشت' : 'Permanent Delete'}
              </h3>
              <button type="button" disabled={busyAction} onClick={() => setPurgeTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isFa
                ? `آیا از حذف دائمی «${purgeTarget.targetLabel}» مطمئن هستید؟ این عمل قابل بازگردانی نخواهد بود.`
                : `Permanently delete "${purgeTarget.targetLabel}"? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setPurgeTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleConfirmPurge}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {busyAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t.controls.purge}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Permanent Purge Confirmation */}
      {bulkPurgeOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !busyAction && setBulkPurgeOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--status-danger)]">
                {isFa ? 'حذف دائمی گروهی' : 'Bulk Permanent Delete'}
              </h3>
              <button type="button" disabled={busyAction} onClick={() => setBulkPurgeOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `آیا از حذف دائمی ${fmtNum(selectedIds.size)} ردیف انتخاب‌شده از سطل بازیافت مطمئن هستید؟ این عمل غیرقابل بازگشت است.`
                : `Permanently delete ${fmtNum(selectedIds.size)} selected row(s) from the Recycle Bin? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setBulkPurgeOpen(false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={handleConfirmBulkPurge}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {busyAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>
                  {isFa ? `حذف دائمی (${fmtNum(selectedIds.size)})` : `Delete Permanently (${fmtNum(selectedIds.size)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Report Modal */}
      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.trash}
        subtitle={
          isFa
            ? `صفحه ${fmtNum(page)} از ${fmtNum(totalPages)} · مجموع ${fmtNum(total)} ردیف`
            : `Page ${fmtNum(page)} of ${fmtNum(totalPages)} · Total ${fmtNum(total)} rows`
        }
        columns={printColumns}
        rows={printRows}
      />
    </div>
  );
};
