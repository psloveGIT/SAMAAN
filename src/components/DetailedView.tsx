import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  EyeOff,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv } from '../lib/csvExport.ts';
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  CategoryStore,
  DetailedComputed,
  DetailedEntry,
  SelectionFormulaSummary,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';

interface DetailedListResponse {
  items: DetailedComputed[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filteredSummary: SelectionFormulaSummary;
}

interface DetailedViewProps {
  categories: CategoryStore;
  refreshSignal: number;
  initialShipmentFilter?: string;
  initialPackageFilter?: string;
  onDataChanged: () => void;
}

function emptyDetailedDraft(rowNo = ''): Partial<DetailedEntry> {
  return {
    rowNo,
    arrivalDate: getTodayIso(),
    supplier: '',
    origin: '',
    shipmentNo: '',
    packageNo: '',
    itemNo: '',
    generalDescription: '',
    description: '',
    size: '',
    itemCode: '',
    packingQty: null,
    actualQty: null,
    damagedQty: null,
    mtoRef: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: '',
    island: '',
    system: '',
    subSystem: '',
    unit: '',
    opiNo: '',
    opiDate: '',
    merNo: '',
    merStatus: '',
    notes: '',
    materialBalanceNo: '',
    balanceStatus: '',
    storageLocation: '',
    gcvReceiptNo: '',
    receiver: '',
    gcvDeliveredQty: null,
    mivContractorNo: '',
    mivContractorDate: '',
    mivContractorQty: null,
    smrContractorNo: '',
    smrContractorDate: '',
    smrContractorQty: null,
    smrContractorNote: '',
    smrMapnaNo: '',
    smrMapnaDate: '',
    smrMapnaQty: null,
    smrMapnaNote: '',
    mivMapnaNo: '',
    mivMapnaDate: '',
    mivMapnaQty: null,
    stocktakeInfo: '',
  };
}

export const DetailedView: React.FC<DetailedViewProps> = ({
  categories,
  refreshSignal,
  initialShipmentFilter = '',
  initialPackageFilter = '',
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState(initialShipmentFilter);
  const [packageFilter, setPackageFilter] = useState(initialPackageFilter);
  const [island, setIsland] = useState('');
  const [system, setSystem] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [damagedOnly, setDamagedOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const [data, setData] = useState<DetailedListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});
  const [inspected, setInspected] = useState<DetailedComputed | null>(null);

  // Add/Edit Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DetailedEntry>>(emptyDetailedDraft());
  const [closedWarningVisible, setClosedWarningVisible] = useState(false);
  const [ackClosed, setAckClosed] = useState(false);
  const [rowError, setRowError] = useState('');

  // Shortage Backfill Modal
  const [backfillTarget, setBackfillTarget] = useState<DetailedComputed | null>(null);
  const [backfillQty, setBackfillQty] = useState('');
  const [backfillDate, setBackfillDate] = useState(getTodayIso());
  const [backfillShipmentNo, setBackfillShipmentNo] = useState('');
  const [backfillPackageNo, setBackfillPackageNo] = useState('');
  const [backfillNote, setBackfillNote] = useState('');

  useEffect(() => {
    setShipmentFilter(initialShipmentFilter);
    setPackageFilter(initialPackageFilter);
    setPage(1);
  }, [initialShipmentFilter, initialPackageFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        ...(q ? { q } : {}),
        ...(shipmentFilter ? { shipmentNo: shipmentFilter } : {}),
        ...(packageFilter ? { packageNo: packageFilter } : {}),
        ...(island ? { island } : {}),
        ...(system ? { system } : {}),
        ...(storageLocation ? { storageLocation } : {}),
        ...(shortageOnly ? { shortageOnly: 'true' } : {}),
        ...(damagedOnly ? { damagedOnly: 'true' } : {}),
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
      });
      const res = await apiRequest<DetailedListResponse>(`/api/detailed?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    q,
    shipmentFilter,
    packageFilter,
    island,
    system,
    storageLocation,
    shortageOnly,
    damagedOnly,
    fromDate,
    toDate,
    notify,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const items = data?.items || [];
  const selectedRows = Object.values(selectedMap);
  const activeSummary = useMemo(() => {
    if (selectedRows.length > 0) {
      return computeSelectionFormulaSummary({ detailed: selectedRows });
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
  }, [selectedRows, data]);

  // Note: کد راهکاران removed; آسیب دیده & MTO added; وضعیت بالانس placed right next to شماره بالانس متریال!
  const columns = useMemo(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, isNum: true, get: (r: DetailedComputed) => r.rowNo },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, get: (r: DetailedComputed) => r.arrivalDate },
      { key: 'shipmentNo', header: t.headers.shipmentNo, get: (r: DetailedComputed) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, get: (r: DetailedComputed) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, get: (r: DetailedComputed) => r.itemNo },
      { key: 'generalDescription', header: t.headers.generalDescription, get: (r: DetailedComputed) => r.generalDescription },
      { key: 'description', header: t.headers.description, get: (r: DetailedComputed) => r.description },
      { key: 'size', header: t.headers.size, get: (r: DetailedComputed) => r.size },
      { key: 'itemCode', header: t.headers.itemCode, get: (r: DetailedComputed) => r.itemCode },
      { key: 'mtoRef', header: t.headers.mtoRef, get: (r: DetailedComputed) => r.mtoRef },
      { key: 'packingQty', header: t.headers.packingQty, isNum: true, get: (r: DetailedComputed) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, isNum: true, get: (r: DetailedComputed) => r.actualQty },
      { key: 'shortage', header: t.headers.shortage, isNum: true, get: (r: DetailedComputed) => (r.shortage > 0 ? r.shortage : null) },
      { key: 'surplus', header: t.headers.surplus, isNum: true, get: (r: DetailedComputed) => (r.surplus > 0 ? r.surplus : null) },
      { key: 'damagedQty', header: t.headers.damagedQty, isNum: true, get: (r: DetailedComputed) => r.damagedQty },
      { key: 'countingUnit', header: t.headers.countingUnit, get: (r: DetailedComputed) => r.countingUnit },
      { key: 'repNo', header: t.headers.repNo, get: (r: DetailedComputed) => r.repNo },
      { key: 'repStatus', header: t.headers.repStatus, get: (r: DetailedComputed) => r.repStatus },
      { key: 'repDescription', header: t.headers.repDescription, get: (r: DetailedComputed) => r.repDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: DetailedComputed) => r.supplier },
      { key: 'origin', header: t.headers.origin, get: (r: DetailedComputed) => r.origin },
      { key: 'island', header: t.headers.island, get: (r: DetailedComputed) => r.island },
      { key: 'system', header: t.headers.system, get: (r: DetailedComputed) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, get: (r: DetailedComputed) => r.subSystem },
      { key: 'unit', header: t.headers.unit, get: (r: DetailedComputed) => r.unit },
      { key: 'opiNo', header: t.headers.opiNo, get: (r: DetailedComputed) => r.opiNo },
      { key: 'opiDate', header: t.headers.opiDate, isDate: true, get: (r: DetailedComputed) => r.opiDate },
      { key: 'merNo', header: t.headers.merNo, get: (r: DetailedComputed) => r.merNo },
      { key: 'merStatus', header: t.headers.merStatus, get: (r: DetailedComputed) => r.merStatus },
      { key: 'storageLocation', header: t.headers.storageLocation, get: (r: DetailedComputed) => r.storageLocation },
      { key: 'gcvReceiptNo', header: t.headers.gcvReceiptNo, get: (r: DetailedComputed) => r.gcvReceiptNo },
      { key: 'receiver', header: t.headers.receiver, get: (r: DetailedComputed) => r.receiver },
      { key: 'gcvDeliveredQty', header: t.headers.gcvDeliveredQty, isNum: true, get: (r: DetailedComputed) => r.gcvDeliveredQty },
      { key: 'mapnaInventory', header: t.headers.mapnaInventory, isNum: true, get: (r: DetailedComputed) => r.mapnaInventory },
      { key: 'mivContractorNo', header: t.headers.mivContractorNo, get: (r: DetailedComputed) => r.mivContractorNo },
      { key: 'mivContractorDate', header: t.headers.mivContractorDate, isDate: true, get: (r: DetailedComputed) => r.mivContractorDate },
      { key: 'mivContractorQty', header: t.headers.mivContractorQty, isNum: true, get: (r: DetailedComputed) => r.mivContractorQty },
      { key: 'contractorInventory', header: t.headers.contractorInventory, isNum: true, get: (r: DetailedComputed) => r.contractorInventory },
      { key: 'smrContractorNo', header: t.headers.smrContractorNo, get: (r: DetailedComputed) => r.smrContractorNo },
      { key: 'smrContractorDate', header: t.headers.smrContractorDate, isDate: true, get: (r: DetailedComputed) => r.smrContractorDate },
      { key: 'smrContractorQty', header: t.headers.smrContractorQty, isNum: true, get: (r: DetailedComputed) => r.smrContractorQty },
      // وضعیت بالانس right next to شماره بالانس متریال!
      { key: 'materialBalanceNo', header: t.headers.materialBalanceNo, get: (r: DetailedComputed) => r.materialBalanceNo },
      { key: 'balanceStatus', header: t.headers.balanceStatus, get: (r: DetailedComputed) => r.balanceStatus },
      { key: 'smrMapnaNo', header: t.headers.smrMapnaNo, get: (r: DetailedComputed) => r.smrMapnaNo },
      { key: 'smrMapnaDate', header: t.headers.smrMapnaDate, isDate: true, get: (r: DetailedComputed) => r.smrMapnaDate },
      { key: 'smrMapnaQty', header: t.headers.smrMapnaQty, isNum: true, get: (r: DetailedComputed) => r.smrMapnaQty },
      { key: 'mivMapnaNo', header: t.headers.mivMapnaNo, get: (r: DetailedComputed) => r.mivMapnaNo },
      { key: 'mivMapnaDate', header: t.headers.mivMapnaDate, isDate: true, get: (r: DetailedComputed) => r.mivMapnaDate },
      { key: 'mivMapnaQty', header: t.headers.mivMapnaQty, isNum: true, get: (r: DetailedComputed) => r.mivMapnaQty },
      { key: 'stocktakeInfo', header: t.headers.stocktakeInfo, get: (r: DetailedComputed) => r.stocktakeInfo },
      { key: 'notes', header: t.headers.notes, get: (r: DetailedComputed) => r.notes },
    ],
    [t],
  );

  // Strictly hide columns that have zero populated values in the displayed slice
  const visibleColumns = useMemo(() => {
    if (!hideEmptyCols || items.length === 0) return columns;
    return columns.filter((col) =>
      items.some((row) => {
        const val = col.get(row);
        return val !== null && val !== undefined && String(val).trim() !== '';
      }),
    );
  }, [columns, items, hideEmptyCols]);

  const openCreateModal = async () => {
    setEditingId(null);
    setClosedWarningVisible(false);
    setAckClosed(false);
    setRowError('');
    try {
      const check = await apiRequest<{ nextSuggestedRowNo: string; isClosed: boolean }>(
        `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(shipmentFilter)}`,
      );
      setDraft({
        ...emptyDetailedDraft(check.nextSuggestedRowNo),
        shipmentNo: shipmentFilter,
        packageNo: packageFilter,
      });
      setClosedWarningVisible(check.isClosed);
    } catch {
      setDraft({
        ...emptyDetailedDraft(''),
        shipmentNo: shipmentFilter,
        packageNo: packageFilter,
      });
    }
    setFormModalOpen(true);
  };

  const openEditModal = async (row: DetailedComputed) => {
    setEditingId(row.id);
    setDraft({ ...row });
    setRowError('');
    setAckClosed(false);
    try {
      const check = await apiRequest<{ isClosed: boolean }>(
        `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(row.shipmentNo)}`,
      );
      setClosedWarningVisible(check.isClosed);
    } catch {
      setClosedWarningVisible(false);
    }
    setFormModalOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setRowError('');
    try {
      const payload = { ...draft, acknowledgeClosed: ackClosed };
      if (editingId) {
        await apiRequest(`/api/detailed/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'آیتم جزئیات ویرایش شد.' : 'Detailed item updated.');
      } else {
        await apiRequest('/api/detailed', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'آیتم جزئیات ثبت شد.' : 'Detailed item created.');
      }
      setFormModalOpen(false);
      triggerAutoSnapshot(`Detailed ${draft.shipmentNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CLOSED_PACKING_WARNING') {
          setClosedWarningVisible(true);
        }
        setRowError(err.message);
      }
    }
  };

  const handleSubmitBackfill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backfillTarget) return;
    const qtyNum = Number(backfillQty);
    if (!qtyNum || qtyNum <= 0) return;

    try {
      await apiRequest(`/api/detailed/${backfillTarget.id}/backfill`, {
        method: 'POST',
        body: JSON.stringify({
          qty: qtyNum,
          arrivalDate: backfillDate,
          shipmentNo: backfillShipmentNo.trim() || backfillTarget.shipmentNo,
          packageNo: backfillPackageNo.trim(),
          note: backfillNote.trim(),
        }),
      });
      notify(
        'success',
        isFa ? 'جبران کسری با موفقیت ثبت شد.' : 'Shortage fulfillment recorded.',
      );
      setBackfillTarget(null);
      setBackfillQty('');
      setBackfillNote('');
      triggerAutoSnapshot(`Backfill ${backfillTarget.rowNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleDelete = async (row: DetailedComputed) => {
    try {
      await apiRequest(`/api/detailed/${row.id}`, { method: 'DELETE' });
      notify('success', isFa ? `ردیف ${row.rowNo} حذف شد.` : `Row ${row.rowNo} deleted.`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const toggleRow = (row: DetailedComputed) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  };

  const toggleAllOnPage = () => {
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

  const handleExport = () => {
    const rowsToExport = selectedRows.length > 0 ? selectedRows : items;
    exportRowsToCsv({
      rows: rowsToExport,
      columns: columns.map((c) => ({
        key: c.key,
        header: c.header,
        isDate: c.isDate,
        getValue: c.get,
      })),
      filename: 'samaan-detailed',
      calendar: prefs.calendar,
      hideEmptyColumns: hideEmptyCols,
    });
  };

  const numInput = (val: number | null | undefined) => (val === null || val === undefined ? '' : String(val));
  const parseOptNum = (s: string): number | null => (s.trim() === '' ? null : Number(s));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-2.5" />
            <input
              type="text"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t.controls.searchPlaceholder}
              className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setShortageOnly((v) => !v); setPage(1); }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                shortageOnly
                  ? 'border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t.shortage.hasShortageBadge}</span>
            </button>

            <button
              type="button"
              onClick={() => { setDamagedOnly((v) => !v); setPage(1); }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                damagedOnly
                  ? 'border-[var(--status-warning)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t.shortage.hasDamagedBadge}</span>
            </button>

            <button
              type="button"
              onClick={() => setHideEmptyCols((v) => !v)}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                hideEmptyCols
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>{hideEmptyCols ? t.controls.hideEmptyCols : t.controls.showAllCols}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت آیتم جزئیات' : 'Add Detailed Item'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          <input
            type="text"
            dir="ltr"
            value={shipmentFilter}
            onChange={(e) => { setShipmentFilter(e.target.value); setPage(1); }}
            placeholder={t.headers.shipmentNo}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
          />
          <input
            type="text"
            dir="ltr"
            value={packageFilter}
            onChange={(e) => { setPackageFilter(e.target.value); setPage(1); }}
            placeholder={t.headers.packageNo}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
          />
          <select
            value={island}
            onChange={(e) => { setIsland(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.island}: {t.controls.all}</option>
            {categories.island.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={system}
            onChange={(e) => { setSystem(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.system}: {t.controls.all}</option>
            {categories.system.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={storageLocation}
            onChange={(e) => { setStorageLocation(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.storageLocation}: {t.controls.all}</option>
            {categories.storageLocation.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <JalaliDateInput
            value={fromDate}
            onChange={(v) => { setFromDate(v); setPage(1); }}
            placeholder={t.controls.fromDate}
          />
          <JalaliDateInput
            value={toDate}
            onChange={(v) => { setToDate(v); setPage(1); }}
            placeholder={t.controls.toDate}
          />
        </div>
      </div>

      {/* Formula Selection Summary Bar */}
      {(items.length > 0 || selectedRows.length > 0) && (
        <SelectionSummaryBar
          scope="detailed"
          selectedCount={selectedRows.length}
          summary={activeSummary}
          isFilteredFallback={selectedRows.length === 0}
          onClearSelection={() => setSelectedMap({})}
          onExportSelected={handleExport}
        />
      )}

      {/* Detailed Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]))}
                    onChange={toggleAllOnPage}
                  />
                </th>
                <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'وضعیت کسری / آسیب' : 'Alerts'}
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                      col.isNum ? 'text-end' : 'text-start'
                    }`}
                  >
                    {col.header}
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
                  <td colSpan={visibleColumns.length + 3} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 3} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setInspected(row)}
                    className={`cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors ${
                      row.hasShortage ? 'bg-[var(--status-danger-bg)]/45' : ''
                    }`}
                  >
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMap[row.id])}
                        onChange={() => toggleRow(row)}
                      />
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {row.hasShortage && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-bold tabular-nums">
                            <AlertTriangle className="w-3 h-3" />
                            <span>
                              {t.headers.shortage}: {row.shortage.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
                            </span>
                          </span>
                        )}
                        {row.hasDamaged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-bold tabular-nums">
                            <AlertTriangle className="w-3 h-3" />
                            <span>
                              {t.headers.damagedQty}: {(row.damagedQty || 0).toLocaleString(isFa ? 'fa-IR' : 'en-US')}
                            </span>
                          </span>
                        )}
                      </div>
                    </td>

                    {visibleColumns.map((col) => {
                      const raw = col.get(row);
                      const display = col.isDate
                        ? formatDate(String(raw || ''))
                        : typeof raw === 'number'
                          ? raw.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                          : raw || '';
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-3 whitespace-nowrap max-w-[260px] truncate tabular-nums ${
                            col.isNum ? 'text-end' : 'text-start'
                          } ${
                            col.key === 'shortage' && row.hasShortage
                              ? 'font-bold text-[var(--status-danger)]'
                              : col.key === 'mapnaInventory'
                                ? 'font-semibold text-[var(--accent-primary)]'
                                : ''
                          }`}
                          title={String(display)}
                        >
                          {display}
                        </td>
                      );
                    })}

                    <td className="py-2 px-3 whitespace-nowrap text-end" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <div className="inline-flex items-center gap-1">
                          {row.hasShortage && (
                            <button
                              type="button"
                              onClick={() => {
                                setBackfillTarget(row);
                                setBackfillQty(String(row.shortage));
                                setBackfillShipmentNo(row.shipmentNo);
                                setBackfillPackageNo(row.packageNo);
                                setBackfillDate(getTodayIso());
                              }}
                              className="px-2 py-1 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] hover:opacity-90 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <PackagePlus className="w-3 h-3" />
                              <span>{t.shortage.backfillBtn}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="tabular-nums">
              {isFa
                ? `صفحه ${data.page.toLocaleString('fa-IR')} از ${data.totalPages.toLocaleString('fa-IR')} (${data.total.toLocaleString('fa-IR')} رکورد)`
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

      {/* Item Inspector Drawer — Strictly hides empty fields */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setInspected(null)}>
          <div
            className="w-full max-w-xl bg-[var(--bg-surface)] h-full overflow-y-auto p-6 border-s border-[var(--border-subtle)] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold">
                  {inspected.description || inspected.generalDescription}
                </h3>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {t.headers.shipmentNo}: {inspected.shipmentNo}
                  {inspected.packageNo ? ` · ${t.headers.packageNo}: ${inspected.packageNo}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => setInspected(null)} className="p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {inspected.hasShortage && canEdit && (
              <div className="p-3.5 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-[var(--status-danger)] tabular-nums">
                  {t.shortage.remainingShortage}: {inspected.shortage}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBackfillTarget(inspected);
                    setBackfillQty(String(inspected.shortage));
                    setBackfillShipmentNo(inspected.shipmentNo);
                    setBackfillPackageNo(inspected.packageNo);
                    setBackfillDate(getTodayIso());
                    setInspected(null);
                  }}
                  className="h-8 px-3 rounded-lg bg-[var(--status-danger)] text-white text-xs font-medium"
                >
                  {t.shortage.backfillBtn}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {columns
                .filter((c) => {
                  const val = c.get(inspected);
                  return val !== null && val !== undefined && String(val).trim() !== '';
                })
                .map((c) => {
                  const raw = c.get(inspected);
                  const formatted = c.isDate
                    ? formatDate(String(raw || ''))
                    : typeof raw === 'number'
                      ? raw.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                      : String(raw);
                  return (
                    <div
                      key={c.key}
                      className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                    >
                      <div className="text-[11px] text-[var(--text-muted)]">{c.header}</div>
                      <div className="text-xs font-semibold mt-0.5 tabular-nums break-words">
                        {formatted}
                      </div>
                    </div>
                  );
                })}
            </div>

            {inspected.shortageBackfills && inspected.shortageBackfills.length > 0 && (
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <h4 className="text-xs font-bold">{t.shortage.backfillHistory}</h4>
                <div className="space-y-2">
                  {inspected.shortageBackfills.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold tabular-nums">
                          +{b.qty} · {b.shipmentNo}
                          {b.packageNo ? ` (${b.packageNo})` : ''}
                        </div>
                        {b.note && <div className="text-[11px] text-[var(--text-muted)]">{b.note}</div>}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {formatDate(b.arrivalDate)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortage Backfill Modal */}
      {backfillTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{t.shortage.backfillTitle}</h3>
              <button type="button" onClick={() => setBackfillTarget(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs space-y-1">
              <div className="font-semibold">{backfillTarget.description || backfillTarget.generalDescription}</div>
              <div className="text-[var(--status-danger)] font-bold tabular-nums">
                {t.shortage.remainingShortage}: {backfillTarget.shortage}
              </div>
            </div>
            <form onSubmit={handleSubmitBackfill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillQty} *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  dir="ltr"
                  value={backfillQty}
                  onChange={(e) => setBackfillQty(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums"
                />
              </div>
              <JalaliDateInput
                label={t.shortage.backfillDate}
                value={backfillDate}
                onChange={setBackfillDate}
              />
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillShipmentNo}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={backfillShipmentNo}
                  onChange={(e) => setBackfillShipmentNo(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillPackageNo}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={backfillPackageNo}
                  onChange={(e) => setBackfillPackageNo(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillNote}
                </label>
                <input
                  type="text"
                  value={backfillNote}
                  onChange={(e) => setBackfillNote(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBackfillTarget(null)}
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

      {/* Create / Edit Detailed Modal */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingId ? t.controls.edit : isFa ? 'ثبت آیتم جزئیات (دیتیل)' : 'Add Detailed Item'}
              </h3>
              <button type="button" onClick={() => setFormModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto space-y-4">
              {closedWarningVisible && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] space-y-2 text-xs">
                  <div className="font-bold text-[var(--status-danger)]">{t.packing.closedWarningTitle}</div>
                  <p>{t.packing.closedWarningBody}</p>
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackClosed}
                      onChange={(e) => setAckClosed(e.target.checked)}
                    />
                    <span>{t.packing.acknowledgeClosed}</span>
                  </label>
                </div>
              )}

              {rowError && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
                  {rowError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.rowNo} *</label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={draft.rowNo || ''}
                    onChange={(e) => setDraft({ ...draft, rowNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={draft.arrivalDate || ''}
                  onChange={(v) => setDraft({ ...draft, arrivalDate: v })}
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.shipmentNo} *</label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={draft.shipmentNo || ''}
                    onChange={(e) => setDraft({ ...draft, shipmentNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.packageNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.packageNo || ''}
                    onChange={(e) => setDraft({ ...draft, packageNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.itemNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.itemNo || ''}
                    onChange={(e) => setDraft({ ...draft, itemNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.itemCode}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.itemCode || ''}
                    onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.mtoRef}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.mtoRef || ''}
                    onChange={(e) => setDraft({ ...draft, mtoRef: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.size}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.size || ''}
                    onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.generalDescription}</label>
                  <input
                    type="text"
                    value={draft.generalDescription || ''}
                    onChange={(e) => setDraft({ ...draft, generalDescription: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.description}</label>
                  <input
                    type="text"
                    value={draft.description || ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.packingQty}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={numInput(draft.packingQty)}
                    onChange={(e) => setDraft({ ...draft, packingQty: parseOptNum(e.target.value) })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.actualQty}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={numInput(draft.actualQty)}
                    onChange={(e) => setDraft({ ...draft, actualQty: parseOptNum(e.target.value) })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.damagedQty}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={numInput(draft.damagedQty)}
                    onChange={(e) => setDraft({ ...draft, damagedQty: parseOptNum(e.target.value) })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.countingUnit}</label>
                  <input
                    type="text"
                    value={draft.countingUnit || ''}
                    onChange={(e) => setDraft({ ...draft, countingUnit: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.island}</label>
                  <input
                    type="text"
                    value={draft.island || ''}
                    onChange={(e) => setDraft({ ...draft, island: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.system}</label>
                  <input
                    type="text"
                    value={draft.system || ''}
                    onChange={(e) => setDraft({ ...draft, system: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.subSystem}</label>
                  <input
                    type="text"
                    value={draft.subSystem || ''}
                    onChange={(e) => setDraft({ ...draft, subSystem: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.storageLocation}</label>
                  <input
                    type="text"
                    value={draft.storageLocation || ''}
                    onChange={(e) => setDraft({ ...draft, storageLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.gcvReceiptNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.gcvReceiptNo || ''}
                    onChange={(e) => setDraft({ ...draft, gcvReceiptNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.receiver}</label>
                  <input
                    type="text"
                    value={draft.receiver || ''}
                    onChange={(e) => setDraft({ ...draft, receiver: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.gcvDeliveredQty}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={numInput(draft.gcvDeliveredQty)}
                    onChange={(e) => setDraft({ ...draft, gcvDeliveredQty: parseOptNum(e.target.value) })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.mivContractorNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.mivContractorNo || ''}
                    onChange={(e) => setDraft({ ...draft, mivContractorNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.mivContractorQty}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={numInput(draft.mivContractorQty)}
                    onChange={(e) => setDraft({ ...draft, mivContractorQty: parseOptNum(e.target.value) })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                {/* Balance Status directly next to Material Balance No. */}
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.materialBalanceNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.materialBalanceNo || ''}
                    onChange={(e) => setDraft({ ...draft, materialBalanceNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.balanceStatus}</label>
                  <input
                    type="text"
                    value={draft.balanceStatus || ''}
                    onChange={(e) => setDraft({ ...draft, balanceStatus: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.stocktakeInfo}</label>
                  <input
                    type="text"
                    value={draft.stocktakeInfo || ''}
                    onChange={(e) => setDraft({ ...draft, stocktakeInfo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
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
    </div>
  );
};
