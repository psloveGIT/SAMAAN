import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightCircle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import { formatDisplayNumber, formatMultiValueCell, getTodayIso } from '../shared/jalali.ts';
import { getTransitStatusOptions } from '../shared/normalizers.ts';
import { EMPTY_CELL_TOKEN } from '../shared/tableQuery.ts';
import type { CategoryStore, SelectionFormulaSummary, TransitEntry } from '../shared/types.ts';
import { formatThousands, parseNumericInput } from '../shared/validation.ts';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';

interface TransitListResponse {
  items: TransitEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filteredSummary: SelectionFormulaSummary;
}

interface TransitViewProps {
  categories: CategoryStore;
  refreshSignal: number;
  onDataChanged: () => void;
  onConvertToGeneral: (entry: TransitEntry) => void;
}

export const TransitView: React.FC<TransitViewProps> = ({
  categories,
  refreshSignal,
  onDataChanged,
  onConvertToGeneral,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [system, setSystem] = useState('');
  const [subSystem, setSubSystem] = useState('');
  const [unit, setUnit] = useState('');
  const [dispatchLocation, setDispatchLocation] = useState('');
  const [carrierContractor, setCarrierContractor] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');
  const [page, setPage] = useState(1);
  const [showExtraCols, setShowExtraCols] = useState(false);

  const [data, setData] = useState<TransitListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, TransitEntry>>({});
  const [allFilteredIds, setAllFilteredIds] = useState<string[] | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [printRowsOverride, setPrintRowsOverride] = useState<TransitEntry[] | null>(null);
  const [inspected, setInspected] = useState<TransitEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TransitEntry>>({});
  const [amountInput, setAmountInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TransitEntry | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // Bulk Edit / Bulk Delete
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPatch, setBulkPatch] = useState({
    arrivalDate: '',
    overallStatus: '',
    supplier: '',
    dispatchLocation: '',
    system: '',
    subSystem: '',
    unit: '',
    carrierContractor: '',
    releaseNetNo: '',
    releaseNetDate: '',
    interimNo: '',
    interimDate: '',
    billOfLadingNo: '',
  });

  const transitStatusOptions = useMemo(
    () => getTransitStatusOptions(categories.transitStatus),
    [categories.transitStatus],
  );

  const buildFilterParams = useCallback(() => {
    return new URLSearchParams({
      ...(system ? { system } : {}),
      ...(subSystem ? { subSystem } : {}),
      ...(unit ? { unit } : {}),
      ...(dispatchLocation ? { dispatchLocation } : {}),
      ...(carrierContractor ? { carrierContractor } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
      ...(Object.keys(colFilters).length > 0
        ? { colFilters: JSON.stringify(colFilters), calendar: prefs.calendar }
        : {}),
      ...(sortBy && sortDir ? { sortBy, sortDir } : {}),
    });
  }, [
    system,
    subSystem,
    unit,
    dispatchLocation,
    carrierContractor,
    fromDate,
    toDate,
    colFilters,
    prefs.calendar,
    sortBy,
    sortDir,
  ]);

  const loadSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const params = buildFilterParams();
      params.set('page', String(page));
      params.set('pageSize', '50');
      const res = await apiRequest<TransitListResponse>(`/api/transit?${params.toString()}`);
      if (seq === loadSeqRef.current) {
        setData(res);
      }
    } catch (err) {
      if (seq === loadSeqRef.current && err instanceof ApiError) notify('error', err.message);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [page, buildFilterParams, notify]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const items = data?.items || [];
  const selectedRows = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedIds = useMemo(
    () => (allFilteredIds !== null ? allFilteredIds : selectedRows.map((r) => r.id)),
    [allFilteredIds, selectedRows],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  const activeSummary = useMemo(() => {
    if (allFilteredIds !== null) {
      return (
        data?.filteredSummary || {
          count: 0,
          grossWeightSum: 0,
          netWeightSum: 0,
          weighbridgeWeightSum: 0,
          freightCostSum: 0,
          packingQtySum: 0,
          actualQtySum: 0,
          effectiveActualQtySum: 0,
          shortageSum: 0,
          surplusSum: 0,
          damagedQtySum: 0,
          gcvDeliveredSum: 0,
          mapnaInventorySum: 0,
          contractorInventorySum: 0,
          mivContractorQtySum: 0,
          smrContractorQtySum: 0,
          smrMapnaQtySum: 0,
          mivMapnaQtySum: 0,
          transitAmountSum: 0,
        }
      );
    }
    if (selectedRows.length > 0) {
      return computeSelectionFormulaSummary({ transit: selectedRows });
    }
    return (
      data?.filteredSummary || {
        count: 0,
        grossWeightSum: 0,
        netWeightSum: 0,
        weighbridgeWeightSum: 0,
        freightCostSum: 0,
        packingQtySum: 0,
        actualQtySum: 0,
        effectiveActualQtySum: 0,
        shortageSum: 0,
        surplusSum: 0,
        damagedQtySum: 0,
        gcvDeliveredSum: 0,
        mapnaInventorySum: 0,
        contractorInventorySum: 0,
        mivContractorQtySum: 0,
        smrContractorQtySum: 0,
        smrMapnaQtySum: 0,
        mivMapnaQtySum: 0,
        transitAmountSum: 0,
      }
    );
  }, [allFilteredIds, selectedRows, data]);

  const columns = useMemo(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, isNum: true, get: (r: TransitEntry) => r.rowNo },
      { key: 'overallStatus', header: t.headers.overallStatus, get: (r: TransitEntry) => r.overallStatus },
      { key: 'packingListNo', header: t.headers.packingListNo, get: (r: TransitEntry) => r.packingListNo },
      { key: 'itemDescription', header: t.headers.itemDescription, get: (r: TransitEntry) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: TransitEntry) => r.supplier },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, hideInTable: true, get: (r: TransitEntry) => r.arrivalDate },
      { key: 'packageNo', header: t.headers.packageNo, hideInTable: true, get: (r: TransitEntry) => r.packageNo },
      { key: 'dispatchLocation', header: t.headers.dispatchLocation, hideInTable: true, get: (r: TransitEntry) => r.dispatchLocation },
      { key: 'inspectionRequest', header: t.headers.inspectionRequest, hideInTable: true, get: (r: TransitEntry) => r.inspectionRequest },
      { key: 'releaseNetNo', header: t.headers.releaseNetNo, hideInTable: true, get: (r: TransitEntry) => r.releaseNetNo },
      { key: 'releaseNetDate', header: t.headers.releaseNetDate, isDate: true, hideInTable: true, get: (r: TransitEntry) => r.releaseNetDate },
      { key: 'mapnaShippingNotice', header: t.headers.mapnaShippingNotice, hideInTable: true, get: (r: TransitEntry) => r.mapnaShippingNotice },
      { key: 'interimNo', header: t.headers.interimNo, hideInTable: true, get: (r: TransitEntry) => r.interimNo },
      { key: 'interimDate', header: t.headers.interimDate, isDate: true, hideInTable: true, get: (r: TransitEntry) => r.interimDate },
      { key: 'system', header: t.headers.system, hideInTable: true, get: (r: TransitEntry) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, hideInTable: true, get: (r: TransitEntry) => r.subSystem },
      { key: 'unit', header: t.headers.unit, hideInTable: true, get: (r: TransitEntry) => r.unit },
      { key: 'equipmentSupplyCode', header: t.headers.equipmentSupplyCode, hideInTable: true, get: (r: TransitEntry) => r.equipmentSupplyCode },
      { key: 'carrierContractor', header: t.headers.carrierContractor, hideInTable: true, get: (r: TransitEntry) => r.carrierContractor },
      { key: 'billOfLadingNo', header: t.headers.billOfLadingNo, hideInTable: true, get: (r: TransitEntry) => r.billOfLadingNo },
      { key: 'amount', header: t.headers.amount, isNum: true, hideInTable: true, get: (r: TransitEntry) => r.amount },
    ],
    [t],
  );

  const visibleColumns = useMemo(() => {
    return showExtraCols ? columns : columns.filter((col) => !col.hideInTable);
  }, [columns, showExtraCols]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { rowNo: _ignored, ...rest } = draft;
      const payload = {
        ...rest,
        amount: parseNumericInput(amountInput),
      };
      if (editingId) {
        await apiRequest(`/api/transit/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'رکورد در راه ویرایش شد.' : 'Transit item updated.');
      } else {
        await apiRequest('/api/transit', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'رکورد در راه ثبت شد.' : 'Transit item created.');
      }
      setModalOpen(false);
      triggerAutoSnapshot('Transit update');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/transit/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', isFa ? 'به سطل بازیافت منتقل شد.' : 'Moved to Recycle Bin.');
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      setSelectedMap((prev) => {
        if (!prev[deletedId]) return prev;
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      setAllFilteredIds((prev) => {
        if (!prev) return prev;
        const next = prev.filter((id) => id !== deletedId);
        return next.length > 0 ? next : null;
      });
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const clearSelection = useCallback(() => {
    setSelectedMap({});
    setAllFilteredIds(null);
  }, []);

  const toggleRow = (row: TransitEntry) => {
    if (allFilteredIds !== null) {
      const nextIds = allFilteredIds.includes(row.id)
        ? allFilteredIds.filter((id) => id !== row.id)
        : [...allFilteredIds, row.id];
      setAllFilteredIds(nextIds.length > 0 ? nextIds : null);
      return;
    }
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  };

  const toggleAllOnPage = () => {
    if (allFilteredIds !== null) {
      clearSelection();
      return;
    }
    const allSelected = items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]));
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allSelected) {
        for (const r of items) delete next[r.id];
      } else {
        for (const r of items) next[r.id] = r;
      }
      return next;
    });
  };

  const toggleSelectAllTable = async () => {
    if (allFilteredIds !== null) {
      clearSelection();
      return;
    }
    setSelectingAll(true);
    try {
      const params = buildFilterParams();
      params.set('allIds', 'true');
      const res = await apiRequest<{ ids: string[]; total: number }>(`/api/transit?${params.toString()}`);
      setAllFilteredIds(res.ids || []);
      setSelectedMap({});
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSelectingAll(false);
    }
  };

  const handleOpenPrint = async () => {
    if (allFilteredIds !== null) {
      if (data && data.totalPages <= 1) {
        setPrintRowsOverride(items.filter((r) => selectedIdSet.has(r.id)));
      } else {
        try {
          const params = buildFilterParams();
          params.set('all', 'true');
          const res = await apiRequest<TransitListResponse>(`/api/transit?${params.toString()}`);
          const idSet = new Set(allFilteredIds);
          setPrintRowsOverride((res.items || []).filter((r) => idSet.has(r.id)));
        } catch (err) {
          if (err instanceof ApiError) notify('error', err.message);
          return;
        }
      }
    } else {
      setPrintRowsOverride(null);
    }
    setPrintOpen(true);
  };

  const handleBulkEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    const cleanPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(bulkPatch)) {
      if (typeof v === 'string' && v.trim()) {
        cleanPatch[k] = v.trim();
      }
    }
    if (Object.keys(cleanPatch).length === 0) {
      notify('error', isFa ? 'حداقل یک فیلد را برای ویرایش گروهی پر کنید.' : 'Enter at least one field to update.');
      return;
    }
    setBulkBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; updatedCount: number }>('/api/transit/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: selectedIds, patch: cleanPatch }),
      });
      notify(
        'success',
        isFa
          ? `ویرایش گروهی برای ${formatDisplayNumber(res.updatedCount, 'fa')} ردیف انجام شد.`
          : `Updated ${res.updatedCount} rows.`,
      );
      setBulkEditOpen(false);
      setBulkPatch({
        arrivalDate: '',
        overallStatus: '',
        supplier: '',
        dispatchLocation: '',
        system: '',
        subSystem: '',
        unit: '',
        carrierContractor: '',
        releaseNetNo: '',
        releaseNetDate: '',
        interimNo: '',
        interimDate: '',
        billOfLadingNo: '',
      });
      clearSelection();
      triggerAutoSnapshot('Bulk Edit Transit');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; deletedCount: number }>('/api/transit/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      notify(
        'success',
        isFa
          ? `${formatDisplayNumber(res.deletedCount, 'fa')} ردیف به سطل بازیافت منتقل شد.`
          : `Moved ${res.deletedCount} row(s) to Recycle Bin.`,
      );
      setBulkDeleteOpen(false);
      clearSelection();
      triggerAutoSnapshot('Bulk Delete Transit');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const hasHiddenFilters = Boolean(
    system || subSystem || unit || dispatchLocation || carrierContractor || fromDate || toDate,
  );

  const clearHiddenFilters = () => {
    setSystem('');
    setSubSystem('');
    setUnit('');
    setDispatchLocation('');
    setCarrierContractor('');
    setFromDate('');
    setToDate('');
    clearSelection();
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {isFa ? 'فیلتر فیلدهای تکمیلی (ستون‌های مخفی جدول)' : 'Filters for Additional (Hidden) Columns'}
            </span>
            {hasHiddenFilters && (
              <button
                type="button"
                onClick={clearHiddenFilters}
                className="h-7 px-2.5 rounded-md border border-[var(--status-danger)]/30 bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-semibold flex items-center gap-1 hover:opacity-90"
              >
                <X className="w-3 h-3" />
                <span>{isFa ? 'پاک‌کردن فیلترها' : 'Clear Filters'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExtraCols((v) => !v)}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                showExtraCols
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {showExtraCols ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showExtraCols ? t.controls.showAllCols : t.controls.hideEmptyCols}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ arrivalDate: getTodayIso(), overallStatus: 'در دست ارسال' });
                  setAmountInput('');
                  setModalOpen(true);
                }}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت محموله در راه' : 'Add In-Transit Shipment'}</span>
              </button>
            )}
          </div>
        </div>

        {(Object.keys(colFilters).length > 0 || (sortBy && sortDir)) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="font-semibold text-[var(--text-secondary)]">
              {isFa ? 'فیلترهای فعال ستون‌ها:' : 'Active Column Filters:'}
            </span>
            {Object.entries(colFilters).map(([key, vals]) => {
              const colDef = columns.find((c) => c.key === key);
              const previewText = vals
                .slice(0, 2)
                .map((v) => (v === EMPTY_CELL_TOKEN ? (isFa ? '(خالی)' : '(Blank)') : v))
                .join('، ');
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)] font-medium"
                >
                  <span>
                    {colDef?.header || key}: {previewText}
                    {vals.length > 2 ? ` (+${formatDisplayNumber(vals.length - 2, prefs.language)})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setColFilters((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                      clearSelection();
                      setPage(1);
                    }}
                    className="hover:opacity-75"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {sortBy && sortDir && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
                <span>
                  {isFa ? 'مرتب‌سازی:' : 'Sort:'} {columns.find((c) => c.key === sortBy)?.header || sortBy} ({sortDir === 'asc' ? '↑' : '↓'})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSortBy('');
                    setSortDir('');
                    setPage(1);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setColFilters({});
                setSortBy('');
                setSortDir('');
                clearSelection();
                setPage(1);
              }}
              className="px-2 py-0.5 rounded text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] font-semibold"
            >
              {isFa ? 'پاک‌کردن همه' : 'Clear All'}
            </button>
          </div>
        )}

        {/* Hidden-Field Category & Date Filters (not present in default visible table) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2.5">
          <select
            value={system}
            onChange={(e) => { setSystem(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.system}: {t.controls.all}</option>
            {categories.system.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={subSystem}
            onChange={(e) => { setSubSystem(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.subSystem}: {t.controls.all}</option>
            {categories.subSystem.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={unit}
            onChange={(e) => { setUnit(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.unit}: {t.controls.all}</option>
            {categories.unit.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={dispatchLocation}
            onChange={(e) => { setDispatchLocation(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.dispatchLocation}: {t.controls.all}</option>
            {categories.dispatchLocation.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={carrierContractor}
            onChange={(e) => { setCarrierContractor(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.carrierContractor}: {t.controls.all}</option>
            {categories.carrierContractor.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <JalaliDateInput
            value={fromDate}
            onChange={(v) => { setFromDate(v); clearSelection(); setPage(1); }}
            placeholder={t.controls.fromDate}
          />
          <JalaliDateInput
            value={toDate}
            onChange={(v) => { setToDate(v); clearSelection(); setPage(1); }}
            placeholder={t.controls.toDate}
          />
        </div>
      </div>

      {(items.length > 0 || selectedCount > 0) && (
        <SelectionSummaryBar
          scope="transit"
          selectedCount={selectedCount}
          summary={activeSummary}
          isFilteredFallback={selectedCount === 0}
          onClearSelection={clearSelection}
          onPrintSelected={handleOpenPrint}
        />
      )}

      {/* Select-All Table Bar & Bulk Operations Bar */}
      {(data?.total || 0) > 0 && (
        <div
          className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
            selectedCount > 0
              ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-soft)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                disabled={selectingAll}
                checked={allFilteredIds !== null && allFilteredIds.length > 0 && allFilteredIds.length >= (data?.total || 0)}
                onChange={toggleSelectAllTable}
              />
              <span>
                {isFa
                  ? `انتخاب کل ردیف‌های جدول (${formatDisplayNumber(data?.total || 0, 'fa')} ردیف)`
                  : `Select all table rows (${formatDisplayNumber(data?.total || 0, 'en')} rows)`}
              </span>
            </label>
            {selectedCount > 0 && (
              <span className="font-bold text-[var(--accent-primary)] tabular-nums">
                {isFa
                  ? `— ${formatDisplayNumber(selectedCount, 'fa')} ردیف انتخاب شده است`
                  : `— ${selectedCount} row(s) selected`}
              </span>
            )}
          </div>
          {canEdit && selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkEditOpen(true)}
                className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isFa ? 'ویرایش گروهی' : 'Bulk Edit'}</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="h-8 px-3 rounded-lg bg-[var(--status-danger)] text-white font-semibold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFa ? 'حذف گروهی' : 'Bulk Delete'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
        <StickyTableWrapper>
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={
                      allFilteredIds !== null
                        ? items.length > 0 && items.every((r) => selectedIdSet.has(r.id))
                        : items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]))
                    }
                    onChange={toggleAllOnPage}
                    aria-label={t.controls.selectAllPage}
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                      col.isNum ? 'text-end' : 'text-start'
                    }`}
                  >
                    <ExcelColumnFilter
                      scope="transit"
                      colKey={col.key}
                      label={col.header}
                      calendar={prefs.calendar}
                      lang={prefs.language}
                      isNum={col.isNum}
                      activeValues={colFilters[col.key]}
                      sortDir={sortBy === col.key ? (sortDir || null) : null}
                      refreshSignal={refreshSignal}
                      onSortChange={(k, dir) => {
                        setSortBy(dir ? k : '');
                        setSortDir(dir || '');
                        setPage(1);
                      }}
                      onApplyFilter={(k, vals) => {
                        setColFilters((prev) => {
                          const next = { ...prev };
                          if (vals === undefined) delete next[k];
                          else next[k] = vals;
                          return next;
                        });
                        clearSelection();
                        setPage(1);
                      }}
                    />
                  </th>
                ))}
                <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                  {isFa ? 'عملیات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setInspected(row)}
                    className="cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors"
                  >
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={allFilteredIds !== null ? selectedIdSet.has(row.id) : Boolean(selectedMap[row.id])}
                        onChange={() => toggleRow(row)}
                      />
                    </td>
                    {visibleColumns.map((col) => {
                      const raw = col.get(row);
                      const display =
                        typeof raw === 'number'
                          ? formatDisplayNumber(raw, prefs.language)
                          : formatMultiValueCell(raw, {
                              isDate: Boolean(col.isDate),
                              calendar: prefs.calendar,
                              lang: prefs.language,
                            });
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-3 whitespace-pre-line align-top max-w-[260px] leading-relaxed tabular-nums bidi-plaintext ${
                            col.isNum ? 'text-end' : 'text-start'
                          } ${
                            col.key === 'overallStatus' && row.overallStatus === 'رسیده'
                              ? 'font-semibold text-[var(--status-success)]'
                              : ''
                          }`}
                          title={String(display)}
                        >
                          {display}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 whitespace-nowrap text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInspected(row)}
                          title={isFa ? 'مشاهده اطلاعات کامل سطر' : 'Inspect Row Details'}
                          className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            {(row.overallStatus || '').trim() !== 'رسیده' && (
                              <button
                                type="button"
                                onClick={() => onConvertToGeneral(row)}
                                className="px-2 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold flex items-center gap-1"
                              >
                                <ArrowRightCircle className="w-3 h-3" />
                                <span>{isFa ? 'ثبت در تجهیزات کلی' : 'Register in General'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              title={t.controls.edit}
                              aria-label={t.controls.edit}
                              onClick={() => {
                                setEditingId(row.id);
                                setDraft({ ...row });
                                setAmountInput(
                                  row.amount !== null && row.amount !== undefined
                                    ? formatThousands(row.amount, isFa)
                                    : '',
                                );
                                setModalOpen(true);
                              }}
                              className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title={t.controls.delete}
                              aria-label={t.controls.delete}
                              onClick={() => setDeleteTarget(row)}
                              className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="tabular-nums">
              {isFa
                ? `صفحه ${formatDisplayNumber(data.page, 'fa')} از ${formatDisplayNumber(data.totalPages, 'fa')} (${formatDisplayNumber(data.total, 'fa')} رکورد)`
                : `Page ${data.page} of ${data.totalPages} (${data.total} records)`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-row Inspector Drawer */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setInspected(null)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-surface)] h-full overflow-y-auto p-6 border-s border-[var(--border-subtle)] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold bidi-plaintext">
                  {inspected.itemDescription || inspected.packingListNo || t.nav.transit}
                </h3>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums bidi-plaintext">
                  {t.headers.rowNo}: {inspected.rowNo}
                  {inspected.packingListNo ? ` · ${t.headers.packingListNo}: ${inspected.packingListNo}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {(
                [
                  {
                    title: isFa ? 'مشخصات محموله و وضعیت کلی' : 'Shipment & Status Overview',
                    keys: ['rowNo', 'overallStatus', 'packingListNo', 'packageNo', 'itemDescription', 'arrivalDate'],
                  },
                  {
                    title: isFa ? 'اسناد بازرسی، رلیزنت و علی‌الحساب' : 'Inspection, Release Net & Interim Docs',
                    keys: ['inspectionRequest', 'releaseNetNo', 'releaseNetDate', 'mapnaShippingNotice', 'interimNo', 'interimDate'],
                  },
                  {
                    title: isFa ? 'موقعیت فنی، تامین و اطلاعات حمل / مالی' : 'Technical Location, Carrier & Amount',
                    keys: ['supplier', 'dispatchLocation', 'system', 'subSystem', 'unit', 'equipmentSupplyCode', 'carrierContractor', 'billOfLadingNo', 'amount'],
                  },
                ] as const
              ).map((group) => (
                <div key={group.title}>
                  <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
                    {group.title}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {group.keys.map((colKey) => {
                      const c = columns.find((col) => col.key === colKey);
                      if (!c) return null;
                      const raw = c.get(inspected);
                      const formatted =
                        typeof raw === 'number'
                          ? formatDisplayNumber(raw, prefs.language)
                          : formatMultiValueCell(raw, {
                              isDate: Boolean(c.isDate),
                              calendar: prefs.calendar,
                              lang: prefs.language,
                            });
                      const isBlank = formatted === '';
                      return (
                        <div
                          key={c.key}
                          className={`p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] ${
                            c.key === 'itemDescription' ? 'sm:col-span-2' : ''
                          }`}
                        >
                          <div className="text-[11px] text-[var(--text-muted)]">{c.header}</div>
                          <div className={`text-xs font-semibold mt-0.5 tabular-nums whitespace-pre-line break-words bidi-plaintext ${isBlank ? 'text-[var(--text-muted)]' : ''}`}>
                            {isBlank ? '—' : formatted}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'تایید حذف ردیف در راه' : 'Confirm In-Transit Deletion'}
        itemLabel={
          deleteTarget
            ? `${t.headers.packingListNo}: ${deleteTarget.packingListNo || '-'} · #${deleteTarget.rowNo}`
            : ''
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingId ? t.controls.edit : isFa ? 'ثبت محموله در راه' : 'New In-Transit Entry'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={draft.arrivalDate || ''}
                  onChange={(v) => setDraft({ ...draft, arrivalDate: v })}
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.overallStatus}</label>
                  <select
                    value={draft.overallStatus || 'در دست ارسال'}
                    onChange={(e) => setDraft({ ...draft, overallStatus: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    {transitStatusOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.packingListNo}</label>
                  <input
                    type="text"
                    dir={isFa && !draft.packingListNo ? 'rtl' : 'ltr'}
                    value={draft.packingListNo || ''}
                    onChange={(e) => setDraft({ ...draft, packingListNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !draft.packingListNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.packageNo}</label>
                  <input
                    type="text"
                    dir={isFa && !draft.packageNo ? 'rtl' : 'ltr'}
                    value={draft.packageNo || ''}
                    onChange={(e) => setDraft({ ...draft, packageNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !draft.packageNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.itemDescription}</label>
                  <input
                    type="text"
                    dir={!draft.itemDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.itemDescription || ''}
                    onChange={(e) => setDraft({ ...draft, itemDescription: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.supplier}</label>
                  <input
                    type="text"
                    dir={!draft.supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.supplier || ''}
                    onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.dispatchLocation}</label>
                  <input
                    type="text"
                    dir={!draft.dispatchLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.dispatchLocation || ''}
                    onChange={(e) => setDraft({ ...draft, dispatchLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.releaseNetNo}</label>
                  <input
                    type="text"
                    dir={isFa && !draft.releaseNetNo ? 'rtl' : 'ltr'}
                    value={draft.releaseNetNo || ''}
                    onChange={(e) => setDraft({ ...draft, releaseNetNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !draft.releaseNetNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <JalaliDateInput
                  label={t.headers.releaseNetDate}
                  value={draft.releaseNetDate || ''}
                  onChange={(v) => setDraft({ ...draft, releaseNetDate: v })}
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.interimNo}</label>
                  <input
                    type="text"
                    dir={isFa && !draft.interimNo ? 'rtl' : 'ltr'}
                    value={draft.interimNo || ''}
                    onChange={(e) => setDraft({ ...draft, interimNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !draft.interimNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <JalaliDateInput
                  label={t.headers.interimDate}
                  value={draft.interimDate || ''}
                  onChange={(v) => setDraft({ ...draft, interimDate: v })}
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.carrierContractor}</label>
                  <input
                    type="text"
                    dir={!draft.carrierContractor ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.carrierContractor || ''}
                    onChange={(e) => setDraft({ ...draft, carrierContractor: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.billOfLadingNo}</label>
                  <input
                    type="text"
                    dir={isFa && !draft.billOfLadingNo ? 'rtl' : 'ltr'}
                    value={draft.billOfLadingNo || ''}
                    onChange={(e) => setDraft({ ...draft, billOfLadingNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !draft.billOfLadingNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.amount}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir={isFa && !amountInput ? 'rtl' : 'ltr'}
                    value={amountInput}
                    onChange={(e) => setAmountInput(formatThousands(e.target.value, isFa))}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !amountInput ? 'text-right' : 'text-left'
                    }`}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {isFa ? 'مبلغ به ریال می‌باشد' : 'Amount is in Rials (IRR)'}
                  </p>
                </div>
              </div>
              <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold tabular-nums">
                {isFa
                  ? `ویرایش گروهی (${formatDisplayNumber(selectedCount, 'fa')} ردیف)`
                  : `Bulk Edit (${selectedCount} rows)`}
              </h3>
              <button type="button" onClick={() => setBulkEditOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBulkEditSubmit} className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                {isFa
                  ? 'فقط فیلدهایی که مقدار آن‌ها را وارد کنید در تمام ردیف‌های انتخاب‌شده به‌روزرسانی می‌شوند؛ فیلدهای خالی بدون تغییر باقی می‌مانند.'
                  : 'Only fields you fill in will be updated across all selected rows; empty fields remain unchanged.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={bulkPatch.arrivalDate}
                  onChange={(v) => setBulkPatch((p) => ({ ...p, arrivalDate: v }))}
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.overallStatus}</label>
                  <select
                    value={bulkPatch.overallStatus}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, overallStatus: e.target.value }))}
                    className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  >
                    <option value="">{isFa ? '-- بدون تغییر --' : '-- No Change --'}</option>
                    {transitStatusOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.supplier}</label>
                  <input
                    type="text"
                    value={bulkPatch.supplier}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, supplier: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.dispatchLocation}</label>
                  <input
                    type="text"
                    value={bulkPatch.dispatchLocation}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, dispatchLocation: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.system}</label>
                  <input
                    type="text"
                    value={bulkPatch.system}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, system: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.subSystem}</label>
                  <input
                    type="text"
                    value={bulkPatch.subSystem}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, subSystem: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.unit}</label>
                  <input
                    type="text"
                    value={bulkPatch.unit}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, unit: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.carrierContractor}</label>
                  <input
                    type="text"
                    value={bulkPatch.carrierContractor}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, carrierContractor: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkEditOpen(false)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  disabled={bulkBusy}
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {isFa ? 'تأیید و اعمال تغییرات گروهی' : 'Confirm & Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <h3 className="text-sm font-bold text-[var(--status-danger)]">
              {isFa ? 'تأیید حذف گروهی ردیف‌ها' : 'Confirm Bulk Deletion'}
            </h3>
            <p className="text-xs text-[var(--text-primary)]">
              {isFa
                ? `آیا از انتقال ${formatDisplayNumber(selectedCount, 'fa')} ردیف انتخاب‌شده به سطل بازیافت مطمئن هستید؟`
                : `Are you sure you want to move ${selectedCount} selected row(s) to the Recycle Bin?`}
            </p>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={handleBulkDeleteConfirm}
                className="h-9 px-5 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold disabled:opacity-50"
              >
                {isFa ? 'تأیید حذف گروهی' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintRowsOverride(null); }}
        title={t.nav.transit}
        rows={printRowsOverride ?? (selectedRows.length > 0 ? selectedRows : items)}
        columns={columns.map((c) => ({
          key: c.key,
          header: c.header,
          isDate: c.isDate,
          getValue: c.get,
        }))}
        defaultSelectedKeys={visibleColumns.map((c) => c.key)}
      />
    </div>
  );
};
