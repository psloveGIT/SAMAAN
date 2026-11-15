import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Link2,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { type CustomFieldFilter, GENERAL_FILTER_FIELDS } from '../shared/customFilters.ts';
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import type {
  CategoryStore,
  GeneralEntry,
  PackingStatusMeta,
  SelectionFormulaSummary,
} from '../shared/types.ts';
import {
  formatThousands,
  hasEnglishLetters,
  hasPersianLetters,
  isValidDecimalNumber,
  isValidDigitsOnly,
  PACKAGE_TYPE_OPTIONS_EN,
  PACKAGE_TYPE_OPTIONS_FA,
  parseNumericInput,
  sanitizeDecimalOnly,
  sanitizeDigitsOnly,
} from '../shared/validation.ts';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { IranianPlateInput } from './IranianPlateInput.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { MultiPackingAndFieldFilter } from './MultiPackingAndFieldFilter.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';

interface GeneralRowView extends GeneralEntry {
  packingClosed?: boolean;
  detailedCount?: number;
  hasLinkedShortage?: boolean;
}

interface GeneralListResponse {
  items: GeneralRowView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filteredSummary: SelectionFormulaSummary;
  packingMeta: Record<string, PackingStatusMeta>;
}

interface GeneralViewProps {
  categories: CategoryStore;
  refreshSignal: number;
  onDataChanged: () => void;
  onOpenNewPacking: (prefillPackingNo?: string) => void;
  onOpenLinkedDetailed: (packingNo: string, packageNo: string) => void;
}

export const GeneralView: React.FC<GeneralViewProps> = ({
  categories,
  refreshSignal,
  onDataChanged,
  onOpenNewPacking,
  onOpenLinkedDetailed,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [island, setIsland] = useState('');
  const [system, setSystem] = useState('');
  const [subSystem, setSubSystem] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [page, setPage] = useState(1);
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const [data, setData] = useState<GeneralListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneralRowView>>({});
  const [inspected, setInspected] = useState<GeneralRowView | null>(null);
  const [editing, setEditing] = useState<GeneralRowView | null>(null);
  const [editError, setEditError] = useState('');
  const [editNums, setEditNums] = useState({
    itemCount: '',
    grossWeight: '',
    netWeight: '',
    weighbridgeWeight: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    freightCost: '',
  });
  const [ackClosedEdit, setAckClosedEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GeneralRowView | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        ...(q ? { q } : {}),
        ...(island ? { island } : {}),
        ...(system ? { system } : {}),
        ...(subSystem ? { subSystem } : {}),
        ...(unit ? { unit } : {}),
        ...(supplier ? { supplier } : {}),
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
        ...(selectedPackings.length > 0 ? { packingNos: JSON.stringify(selectedPackings) } : {}),
        ...(customFilters.length > 0 ? { customFilters: JSON.stringify(customFilters) } : {}),
      });
      const res = await apiRequest<GeneralListResponse>(`/api/general?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, q, island, system, subSystem, unit, supplier, fromDate, toDate, selectedPackings, customFilters, notify]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const items = data?.items || [];
  const selectedRows = Object.values(selectedMap);
  const activeSummary = useMemo(() => {
    if (selectedRows.length > 0) {
      return computeSelectionFormulaSummary({ general: selectedRows });
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

  const columns = useMemo(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, isNum: true, get: (r: GeneralRowView) => r.rowNo },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, get: (r: GeneralRowView) => r.arrivalDate },
      { key: 'packingListNo', header: t.headers.packingListNo, get: (r: GeneralRowView) => r.packingListNo },
      { key: 'packageNo', header: t.headers.packageNo, get: (r: GeneralRowView) => r.packageNo },
      { key: 'packageType', header: t.headers.packageType, hideInTable: true, get: (r: GeneralRowView) => r.packageType },
      { key: 'itemCount', header: t.headers.itemCount, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.itemCount },
      { key: 'itemDescription', header: t.headers.itemDescription, get: (r: GeneralRowView) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: GeneralRowView) => r.supplier },
      { key: 'dispatchLocation', header: t.headers.dispatchLocation, hideInTable: true, get: (r: GeneralRowView) => r.dispatchLocation },
      { key: 'employerEntryMinutesNo', header: t.headers.employerEntryMinutesNo, hideInTable: true, get: (r: GeneralRowView) => r.employerEntryMinutesNo },
      { key: 'mapnaEntryMinutesNo', header: t.headers.mapnaEntryMinutesNo, hideInTable: true, get: (r: GeneralRowView) => r.mapnaEntryMinutesNo },
      { key: 'releaseNo', header: t.headers.releaseNo, hideInTable: true, get: (r: GeneralRowView) => r.releaseNo },
      { key: 'releaseDate', header: t.headers.releaseDate, isDate: true, hideInTable: true, get: (r: GeneralRowView) => r.releaseDate },
      { key: 'island', header: t.headers.island, hideInTable: true, get: (r: GeneralRowView) => r.island },
      { key: 'system', header: t.headers.system, hideInTable: true, get: (r: GeneralRowView) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, hideInTable: true, get: (r: GeneralRowView) => r.subSystem },
      { key: 'unit', header: t.headers.unit, hideInTable: true, get: (r: GeneralRowView) => r.unit },
      { key: 'grossWeight', header: t.headers.grossWeight, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.grossWeight },
      { key: 'netWeight', header: t.headers.netWeight, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.netWeight },
      { key: 'lengthCm', header: t.headers.lengthCm, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.lengthCm },
      { key: 'widthCm', header: t.headers.widthCm, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.widthCm },
      { key: 'heightCm', header: t.headers.heightCm, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.heightCm },
      { key: 'billOfLadingNo', header: t.headers.billOfLadingNo, hideInTable: true, get: (r: GeneralRowView) => r.billOfLadingNo },
      { key: 'vehicleNo', header: t.headers.vehicleNo, hideInTable: true, get: (r: GeneralRowView) => r.vehicleNo },
      { key: 'weighbridgeWeight', header: t.headers.weighbridgeWeight, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.weighbridgeWeight },
      { key: 'freightCost', header: t.headers.freightCost, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.freightCost },
      { key: 'opiInvitationNo', header: t.headers.opiInvitationNo, hideInTable: true, get: (r: GeneralRowView) => r.opiInvitationNo },
      { key: 'opiInvitationDate', header: t.headers.opiInvitationDate, isDate: true, hideInTable: true, get: (r: GeneralRowView) => r.opiInvitationDate },
      { key: 'driverName', header: t.headers.driverName, hideInTable: true, get: (r: GeneralRowView) => r.driverName },
    ],
    [t],
  );

  const visibleColumns = useMemo(() => {
    const tableCols = columns.filter((col) => !col.hideInTable);
    if (!hideEmptyCols || items.length === 0) return tableCols;
    return tableCols.filter((col) =>
      items.some((row) => {
        const val = col.get(row);
        return val !== null && val !== undefined && String(val).trim() !== '';
      }),
    );
  }, [columns, items, hideEmptyCols]);

  const toggleRow = (row: GeneralRowView) => {
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

  const handleTogglePackingClosed = async (packingNo: string, currentlyClosed: boolean) => {
    try {
      const endpoint = currentlyClosed
        ? `/api/packing/${encodeURIComponent(packingNo)}/reopen`
        : `/api/packing/${encodeURIComponent(packingNo)}/close`;
      await apiRequest(endpoint, { method: 'POST', body: JSON.stringify({}) });
      notify(
        'success',
        currentlyClosed
          ? isFa
            ? `پکینگ لیست ${packingNo} بازگشایی شد.`
            : `Packing ${packingNo} reopened.`
          : isFa
            ? `پکینگ لیست ${packingNo} به‌عنوان رسیده کامل / بسته شده ثبت شد.`
            : `Packing ${packingNo} marked as closed.`,
      );
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const openEditRow = (row: GeneralRowView) => {
    setEditing({ ...row });
    setAckClosedEdit(false);
    setEditError('');
    setEditNums({
      itemCount: row.itemCount !== null && row.itemCount !== undefined ? String(row.itemCount) : '',
      grossWeight: row.grossWeight !== null && row.grossWeight !== undefined ? String(row.grossWeight) : '',
      netWeight: row.netWeight !== null && row.netWeight !== undefined ? String(row.netWeight) : '',
      weighbridgeWeight: row.weighbridgeWeight !== null && row.weighbridgeWeight !== undefined ? String(row.weighbridgeWeight) : '',
      lengthCm: row.lengthCm !== null && row.lengthCm !== undefined ? String(row.lengthCm) : '',
      widthCm: row.widthCm !== null && row.widthCm !== undefined ? String(row.widthCm) : '',
      heightCm: row.heightCm !== null && row.heightCm !== undefined ? String(row.heightCm) : '',
      freightCost: row.freightCost !== null && row.freightCost !== undefined ? formatThousands(row.freightCost, isFa) : '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditError('');

    if (!editing.supplier?.trim() || !editing.dispatchLocation?.trim()) {
      setEditError(isFa ? 'تامین‌کننده و محل ارسال نمی‌توانند خالی بمانند.' : 'Supplier and Dispatch Location are required.');
      return;
    }
    if (!editing.packageNo?.trim() || !(editing.packageType || '').trim() || !editing.itemDescription?.trim()) {
      setEditError(isFa ? 'شماره نگله، نوع بسته‌بندی و شرح کالا نمی‌توانند خالی بمانند.' : 'Package No., Package Type, and Item Description are required.');
      return;
    }
    if (isFa && hasEnglishLetters(editing.packageType || '')) {
      setEditError('در زبان فارسی، نوع بسته‌بندی فقط باید به فارسی نوشته شود.');
      return;
    }
    if (!isFa && hasPersianLetters(editing.packageType || '')) {
      setEditError('In English mode, Package Type must be in English only.');
      return;
    }
    const cnt = parseNumericInput(editNums.itemCount);
    if (cnt === null || cnt < 1 || !Number.isInteger(cnt)) {
      setEditError(isFa ? 'تعداد اقلام نگله الزامی و باید عدد صحیح مثبت باشد.' : 'Package item count must be a positive integer.');
      return;
    }
    if (!editing.island?.trim() || !editing.system?.trim() || !editing.subSystem?.trim() || !editing.unit?.trim()) {
      setEditError(isFa ? 'جزیره، سیستم، ساب‌سیستم و واحد نمی‌توانند خالی بمانند.' : 'Island, System, Sub-System, and Unit are required.');
      return;
    }
    if (editing.employerEntryMinutesNo?.trim() && !isValidDigitsOnly(editing.employerEntryMinutesNo)) {
      setEditError(isFa ? 'شماره صورتجلسه ورود کارفرما فقط باید عدد باشد.' : 'Employer Entry Minutes No. must be digits only.');
      return;
    }
    if (
      (editNums.grossWeight.trim() && !isValidDecimalNumber(editNums.grossWeight)) ||
      (editNums.netWeight.trim() && !isValidDecimalNumber(editNums.netWeight)) ||
      (editNums.weighbridgeWeight.trim() && !isValidDecimalNumber(editNums.weighbridgeWeight)) ||
      (editNums.lengthCm.trim() && !isValidDecimalNumber(editNums.lengthCm)) ||
      (editNums.widthCm.trim() && !isValidDecimalNumber(editNums.widthCm)) ||
      (editNums.heightCm.trim() && !isValidDecimalNumber(editNums.heightCm))
    ) {
      setEditError(isFa ? 'اوزان و ابعاد (متر) فقط باید عدد باشند.' : 'Weights and dimensions must be numeric.');
      return;
    }

    try {
      const { rowNo: _ignored, ...rest } = editing;
      const effectiveReleaseDate = editing.releaseNo.trim()
        ? (editing.releaseDate || editing.arrivalDate)
        : editing.arrivalDate;
      await apiRequest(`/api/general/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...rest,
          employerEntryMinutesNo: sanitizeDigitsOnly(editing.employerEntryMinutesNo || ''),
          itemCount: cnt,
          grossWeight: parseNumericInput(editNums.grossWeight),
          netWeight: parseNumericInput(editNums.netWeight),
          weighbridgeWeight: parseNumericInput(editNums.weighbridgeWeight),
          lengthCm: parseNumericInput(editNums.lengthCm),
          widthCm: parseNumericInput(editNums.widthCm),
          heightCm: parseNumericInput(editNums.heightCm),
          freightCost: parseNumericInput(editNums.freightCost),
          releaseDate: effectiveReleaseDate,
          acknowledgeClosed: ackClosedEdit,
        }),
      });
      notify('success', isFa ? 'ردیف با موفقیت ویرایش شد.' : 'Entry updated.');
      setEditing(null);
      setAckClosedEdit(false);
      triggerAutoSnapshot(`Edit General ${editing.rowNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(err.message);
        notify('error', err.message);
      }
    }
  };

  const handleConfirmDelete = async (cascadeDetailed: boolean) => {
    if (!deleteTarget) return;
    try {
      const res = await apiRequest<{ ok: boolean; trashedDetailedCount?: number }>(
        `/api/general/${deleteTarget.id}?cascadeDetailed=${cascadeDetailed ? 'true' : 'false'}`,
        { method: 'DELETE' },
      );
      notify(
        'success',
        isFa
          ? `ردیف ${deleteTarget.rowNo} به سطل بازیافت منتقل شد${
              res.trashedDetailedCount ? ` (${res.trashedDetailedCount} ردیف جزئیات نیز حذف شد)` : ''
            }.`
          : `Row ${deleteTarget.rowNo} moved to Recycle Bin.`,
      );
      setDeleteTarget(null);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const editPackageTypeOptions = isFa ? PACKAGE_TYPE_OPTIONS_FA : PACKAGE_TYPE_OPTIONS_EN;

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInputWithClear
            value={q}
            onChange={(val) => {
              setQ(val);
              setPage(1);
            }}
            placeholder={t.controls.searchPlaceholder}
            className="flex-1 min-w-[240px]"
          />

          <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => onOpenNewPacking()}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.controls.newPacking}</span>
              </button>
            )}
          </div>
        </div>

        <MultiPackingAndFieldFilter
          fields={GENERAL_FILTER_FIELDS}
          selectedPackings={selectedPackings}
          onChangePackings={(next) => {
            setSelectedPackings(next);
            setPage(1);
          }}
          customFilters={customFilters}
          onChangeCustomFilters={(next) => {
            setCustomFilters(next);
            setPage(1);
          }}
          compact
        />

        {/* Category & Date Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
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
            value={subSystem}
            onChange={(e) => { setSubSystem(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.subSystem}: {t.controls.all}</option>
            {categories.subSystem.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={unit}
            onChange={(e) => { setUnit(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.unit}: {t.controls.all}</option>
            {categories.unit.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={supplier}
            onChange={(e) => { setSupplier(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.supplier}: {t.controls.all}</option>
            {categories.supplier.map((v) => <option key={v} value={v}>{v}</option>)}
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
          scope="general"
          selectedCount={selectedRows.length}
          summary={activeSummary}
          isFilteredFallback={selectedRows.length === 0}
          onClearSelection={() => setSelectedMap({})}
          onPrintSelected={() => setPrintOpen(true)}
        />
      )}

      {/* Table */}
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
                    aria-label={t.controls.selectAllPage}
                  />
                </th>
                <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'وضعیت پکینگ / جزئیات' : 'Status / Link'}
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
                      row.hasLinkedShortage ? 'bg-[var(--status-danger-bg)]/40' : ''
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
                        {row.packingClosed && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-medium">
                            <Lock className="w-3 h-3" />
                            <span>{t.packing.closedBadge}</span>
                          </span>
                        )}
                        {row.hasLinkedShortage && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-semibold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{t.shortage.hasShortageBadge}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenLinkedDetailed(row.packingListNo, row.packageNo)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] text-[11px] font-medium text-[var(--accent-primary)]"
                        >
                          <Link2 className="w-3 h-3" />
                          <span className="tabular-nums">
                            {isFa ? 'جزئیات' : 'Details'}
                            {row.detailedCount ? ` (${row.detailedCount})` : ''}
                          </span>
                        </button>
                      </div>
                    </td>

                    {visibleColumns.map((col) => {
                      const rawVal = col.get(row);
                      const displayVal = col.isDate
                        ? formatDate(String(rawVal || ''))
                        : typeof rawVal === 'number'
                          ? rawVal.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                          : rawVal || '';
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-3 whitespace-nowrap max-w-[260px] truncate tabular-nums bidi-plaintext ${
                            col.isNum ? 'text-end' : 'text-start'
                          }`}
                          title={String(displayVal)}
                        >
                          {displayVal}
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
                            {row.packingListNo && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleTogglePackingClosed(row.packingListNo, Boolean(row.packingClosed))
                                }
                                title={
                                  row.packingClosed
                                    ? t.packing.reopenPackingBtn
                                    : t.packing.closePackingBtn
                                }
                                className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                              >
                                {row.packingClosed ? (
                                  <LockOpen className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditRow(row)}
                              className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                              title={t.controls.edit}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                              title={t.controls.delete}
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
        </div>

        {/* Pagination */}
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

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'تایید حذف ردیف جنرال' : 'Confirm General Record Deletion'}
        itemLabel={
          deleteTarget
            ? `${t.headers.packingListNo}: ${deleteTarget.packingListNo || '-'} · ${t.headers.packageNo}: ${deleteTarget.packageNo || '-'}`
            : ''
        }
        linkedDetailedCount={deleteTarget?.detailedCount || 0}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Item Inspector Drawer — Strictly hides all empty fields */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setInspected(null)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-surface)] h-full overflow-y-auto p-6 border-s border-[var(--border-subtle)] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold bidi-plaintext">
                  {inspected.itemDescription || inspected.packingListNo}
                </h3>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums bidi-plaintext">
                  {t.headers.packingListNo}: {inspected.packingListNo} · {t.headers.packageNo}: {inspected.packageNo}
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

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenLinkedDetailed(inspected.packingListNo, inspected.packageNo);
                  setInspected(null);
                }}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{t.packing.viewDetailsLink}</span>
              </button>

              {canEdit && inspected.packingListNo && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenNewPacking(inspected.packingListNo);
                    setInspected(null);
                  }}
                  className="h-9 px-3 rounded-lg border border-[var(--border-strong)] text-xs font-medium flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isFa ? 'افزودن نگله جدید به این پکینگ' : 'Continue Packing List'}</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
                  {isFa ? 'مشخصات پایه محموله' : 'Primary Shipment Info'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {columns
                    .filter((c) => {
                      if (c.hideInTable) return false;
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
                          <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                            {formatted}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {columns.some((c) => {
                if (!c.hideInTable) return false;
                const val = c.get(inspected);
                return val !== null && val !== undefined && String(val).trim() !== '';
              }) && (
                <div>
                  <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
                    {isFa ? 'اطلاعات حمل، ابعاد، صورتجلسات و OPI' : 'Minutes, Weights, Dimensions & Logistics'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {columns
                      .filter((c) => {
                        if (!c.hideInTable) return false;
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
                            <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                              {formatted}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold tabular-nums">
                {t.controls.edit} · {t.headers.rowNo} {editing.rowNo} ({t.headers.packingListNo}: {editing.packingListNo})
              </h3>
              <button type="button" onClick={() => setEditing(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4">
              {editing.packingClosed && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] space-y-2 text-xs">
                  <div className="font-bold text-[var(--status-danger)]">
                    {t.packing.closedWarningTitle}
                  </div>
                  <p>{t.packing.closedWarningBody}</p>
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={ackClosedEdit}
                      onChange={(e) => setAckClosedEdit(e.target.checked)}
                    />
                    <span>{t.packing.acknowledgeClosed}</span>
                  </label>
                </div>
              )}

              {editError && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs font-medium text-[var(--status-danger)]">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={editing.arrivalDate}
                  onChange={(v) =>
                    setEditing({
                      ...editing,
                      arrivalDate: v,
                      releaseDate: editing.releaseNo.trim() ? editing.releaseDate : v,
                    })
                  }
                />
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packageNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !editing.packageNo ? 'rtl' : 'ltr'}
                    value={editing.packageNo}
                    onChange={(e) => setEditing({ ...editing, packageNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !editing.packageNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packageType} *
                  </label>
                  <input
                    type="text"
                    required
                    list="samaan-general-package-types"
                    dir={isFa ? 'rtl' : 'ltr'}
                    value={editing.packageType || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isFa && hasEnglishLetters(val)) {
                        setEditError('در زبان فارسی، نوع بسته‌بندی فقط باید به فارسی نوشته شود.');
                        return;
                      }
                      if (!isFa && hasPersianLetters(val)) {
                        setEditError('In English mode, Package Type must be entered in English only.');
                        return;
                      }
                      setEditError('');
                      setEditing({ ...editing, packageType: val });
                    }}
                    placeholder={isFa ? 'صندوق چوبی / پالت / کارتن...' : 'Wooden Box / Pallet / Crate...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="samaan-general-package-types">
                    {editPackageTypeOptions.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.itemCount} *
                  </label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    dir={isFa && !editNums.itemCount ? 'rtl' : 'ltr'}
                    value={editNums.itemCount}
                    onChange={(e) => setEditNums({ ...editNums, itemCount: sanitizeDigitsOnly(e.target.value) })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.itemCount ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.mapnaEntryMinutesNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !editing.mapnaEntryMinutesNo ? 'rtl' : 'ltr'}
                    value={editing.mapnaEntryMinutesNo}
                    onChange={(e) => setEditing({ ...editing, mapnaEntryMinutesNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !editing.mapnaEntryMinutesNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.employerEntryMinutesNo}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir={isFa && !editing.employerEntryMinutesNo ? 'rtl' : 'ltr'}
                    value={editing.employerEntryMinutesNo}
                    onChange={(e) =>
                      setEditing({ ...editing, employerEntryMinutesNo: sanitizeDigitsOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !editing.employerEntryMinutesNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.releaseNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !editing.releaseNo ? 'rtl' : 'ltr'}
                    value={editing.releaseNo}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        releaseNo: e.target.value,
                        releaseDate: e.target.value.trim() ? editing.releaseDate : editing.arrivalDate,
                      })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !editing.releaseNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <JalaliDateInput
                  label={t.headers.releaseDate}
                  disabled={!editing.releaseNo.trim()}
                  value={editing.releaseNo.trim() ? editing.releaseDate : editing.arrivalDate}
                  onChange={(v) => setEditing({ ...editing, releaseDate: v })}
                />

                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.itemDescription} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.itemDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.itemDescription}
                    onChange={(e) => setEditing({ ...editing, itemDescription: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.island} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.island}
                    onChange={(e) => setEditing({ ...editing, island: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.system} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.system}
                    onChange={(e) => setEditing({ ...editing, system: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.subSystem} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.subSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.subSystem}
                    onChange={(e) => setEditing({ ...editing, subSystem: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.unit} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.unit}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.supplier} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.supplier}
                    onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.dispatchLocation} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!editing.dispatchLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.dispatchLocation}
                    onChange={(e) => setEditing({ ...editing, dispatchLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.billOfLadingNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !editing.billOfLadingNo ? 'rtl' : 'ltr'}
                    value={editing.billOfLadingNo || ''}
                    onChange={(e) => setEditing({ ...editing, billOfLadingNo: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext ${
                      isFa && !editing.billOfLadingNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.vehicleNo}
                  </label>
                  <IranianPlateInput
                    value={editing.vehicleNo || ''}
                    onChange={(next) => setEditing({ ...editing, vehicleNo: next })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.driverName}
                  </label>
                  <input
                    type="text"
                    dir={!editing.driverName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.driverName || ''}
                    onChange={(e) => setEditing({ ...editing, driverName: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.weighbridgeWeight}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.weighbridgeWeight ? 'rtl' : 'ltr'}
                    value={editNums.weighbridgeWeight}
                    onChange={(e) =>
                      setEditNums({ ...editNums, weighbridgeWeight: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.weighbridgeWeight ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.grossWeight}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.grossWeight ? 'rtl' : 'ltr'}
                    value={editNums.grossWeight}
                    onChange={(e) =>
                      setEditNums({ ...editNums, grossWeight: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.grossWeight ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.netWeight}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.netWeight ? 'rtl' : 'ltr'}
                    value={editNums.netWeight}
                    onChange={(e) =>
                      setEditNums({ ...editNums, netWeight: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.netWeight ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.lengthCm}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.lengthCm ? 'rtl' : 'ltr'}
                    value={editNums.lengthCm}
                    onChange={(e) =>
                      setEditNums({ ...editNums, lengthCm: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.lengthCm ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.widthCm}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.widthCm ? 'rtl' : 'ltr'}
                    value={editNums.widthCm}
                    onChange={(e) =>
                      setEditNums({ ...editNums, widthCm: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.widthCm ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.heightCm}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    dir={isFa && !editNums.heightCm ? 'rtl' : 'ltr'}
                    value={editNums.heightCm}
                    onChange={(e) =>
                      setEditNums({ ...editNums, heightCm: sanitizeDecimalOnly(e.target.value) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.heightCm ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.freightCost}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir={isFa && !editNums.freightCost ? 'rtl' : 'ltr'}
                    value={editNums.freightCost}
                    onChange={(e) =>
                      setEditNums({ ...editNums, freightCost: formatThousands(e.target.value, isFa) })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !editNums.freightCost ? 'text-right' : 'text-left'
                    }`}
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {isFa ? 'تمامی مبالغ به ریال می‌باشد' : 'Amounts are in Rials (IRR)'}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
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

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.general}
        rows={selectedRows.length > 0 ? selectedRows : items}
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
