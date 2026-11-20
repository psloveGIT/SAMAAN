import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
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
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import { formatDisplayNumber, formatMultiValueCell } from '../shared/jalali.ts';
import { EMPTY_CELL_TOKEN } from '../shared/tableQuery.ts';
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
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { IranianPlateInput } from './IranianPlateInput.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar } from './TablePaginationBar.tsx';

interface GeneralRowView extends GeneralEntry {
  packingClosed?: boolean;
  detailedCount?: number;
  hasLinkedShortage?: boolean;
  hasLinkedDamaged?: boolean;
  hasLinkedDiscrepancy?: boolean;
  hasLinkedReplaced?: boolean;
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

interface GeneralColDef {
  key: string;
  header: string;
  isNum?: boolean;
  isDate?: boolean;
  hideInTable?: boolean;
  get: (r: GeneralRowView) => string | number | null | undefined;
}

interface GeneralTableRowProps {
  row: GeneralRowView;
  visibleColumns: GeneralColDef[];
  isSelected: boolean;
  canEdit: boolean;
  isFa: boolean;
  calendar: 'jalali' | 'gregorian';
  lang: 'fa' | 'en';
  closedBadgeLabel: string;
  closePackingBtnLabel: string;
  reopenPackingBtnLabel: string;
  editLabel: string;
  deleteLabel: string;
  onToggleRow: (row: GeneralRowView) => void;
  onInspect: (row: GeneralRowView) => void;
  onOpenLinkedDetailed: (packingNo: string, packageNo: string) => void;
  onTogglePackingClosed: (packingNo: string, currentlyClosed: boolean) => void;
  onEdit: (row: GeneralRowView) => void;
  onDelete: (row: GeneralRowView) => void;
}

const GeneralTableRow = React.memo<GeneralTableRowProps>(({
  row,
  visibleColumns,
  isSelected,
  canEdit,
  isFa,
  calendar,
  lang,
  closedBadgeLabel,
  closePackingBtnLabel,
  reopenPackingBtnLabel,
  editLabel,
  deleteLabel,
  onToggleRow,
  onInspect,
  onOpenLinkedDetailed,
  onTogglePackingClosed,
  onEdit,
  onDelete,
}) => (
  <tr
    onClick={() => onInspect(row)}
    className="cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors"
  >
    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleRow(row)}
      />
    </td>

    {visibleColumns.map((col) => {
      const rawVal = col.get(row);
      const displayVal =
        typeof rawVal === 'number'
          ? formatDisplayNumber(rawVal, lang)
          : formatMultiValueCell(rawVal, {
              isDate: Boolean(col.isDate),
              calendar,
              lang,
            });
      return (
        <td
          key={col.key}
          className={`py-1.5 px-2 whitespace-pre-line align-top max-w-[205px] leading-snug tabular-nums bidi-plaintext ${
            col.isNum ? 'text-end' : 'text-start'
          }`}
          title={String(displayVal)}
        >
          {displayVal}
        </td>
      );
    })}

    <td className="py-1.5 px-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        {row.packingClosed ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-[11px] font-semibold">
            <Lock className="w-3 h-3" />
            <span>{closedBadgeLabel}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{isFa ? 'باز / در جریان' : 'Open / Active'}</span>
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

    <td className="py-2 px-3 whitespace-nowrap text-end" onClick={(e) => e.stopPropagation()}>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onInspect(row)}
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
                onClick={() => onTogglePackingClosed(row.packingListNo, Boolean(row.packingClosed))}
                title={row.packingClosed ? reopenPackingBtnLabel : closePackingBtnLabel}
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
              onClick={() => onEdit(row)}
              className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
              title={editLabel}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(row)}
              className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
              title={deleteLabel}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </td>
  </tr>
));

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

  const [island, setIsland] = useState('');
  const [system, setSystem] = useState('');
  const [subSystem, setSubSystem] = useState('');
  const [unit, setUnit] = useState('');
  const [dispatchLocation, setDispatchLocation] = useState('');
  const [packageType, setPackageType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showExtraCols, setShowExtraCols] = useState(false);

  const [data, setData] = useState<GeneralListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneralRowView>>({});
  const [allFilteredIds, setAllFilteredIds] = useState<string[] | null>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [printRowsOverride, setPrintRowsOverride] = useState<GeneralRowView[] | null>(null);
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

  // Bulk Edit / Bulk Delete
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkPatch, setBulkPatch] = useState({
    arrivalDate: '',
    supplier: '',
    dispatchLocation: '',
    island: '',
    system: '',
    subSystem: '',
    unit: '',
    releaseNo: '',
    releaseDate: '',
    billOfLadingNo: '',
    vehicleNo: '',
    driverName: '',
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteCascade, setBulkDeleteCascade] = useState(false);

  const buildFilterParams = useCallback(() => {
    return new URLSearchParams({
      ...(island ? { island } : {}),
      ...(system ? { system } : {}),
      ...(subSystem ? { subSystem } : {}),
      ...(unit ? { unit } : {}),
      ...(dispatchLocation ? { dispatchLocation } : {}),
      ...(packageType ? { packageType } : {}),
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate } : {}),
      ...(Object.keys(colFilters).length > 0
        ? { colFilters: JSON.stringify(colFilters), calendar: prefs.calendar }
        : {}),
      ...(sortBy && sortDir ? { sortBy, sortDir } : {}),
    });
  }, [
    island,
    system,
    subSystem,
    unit,
    dispatchLocation,
    packageType,
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
      params.set('pageSize', String(pageSize));
      const res = await apiRequest<GeneralListResponse>(`/api/general?${params.toString()}`);
      if (seq === loadSeqRef.current) {
        setData(res);
      }
    } catch (err) {
      if (seq === loadSeqRef.current && err instanceof ApiError) notify('error', err.message);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [page, pageSize, buildFilterParams, notify]);

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
  }, [allFilteredIds, selectedRows, data]);

  const columns = useMemo<GeneralColDef[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, isNum: true, get: (r: GeneralRowView) => r.rowNo },
      { key: 'packingListNo', header: t.headers.packingListNo, get: (r: GeneralRowView) => r.packingListNo },
      { key: 'packageNo', header: t.headers.packageNo, get: (r: GeneralRowView) => r.packageNo },
      { key: 'itemDescription', header: t.headers.itemDescription, get: (r: GeneralRowView) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: GeneralRowView) => r.supplier },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, hideInTable: true, get: (r: GeneralRowView) => r.arrivalDate },
      { key: 'packageType', header: t.headers.packageType, hideInTable: true, get: (r: GeneralRowView) => r.packageType },
      { key: 'itemCount', header: t.headers.itemCount, isNum: true, hideInTable: true, get: (r: GeneralRowView) => r.itemCount },
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
    return showExtraCols ? columns : columns.filter((col) => !col.hideInTable);
  }, [columns, showExtraCols]);

  const printColumns = useMemo(
    () =>
      columns.map((c) => ({
        key: c.key,
        header: c.header,
        isDate: c.isDate,
        getValue: c.get,
      })),
    [columns],
  );

  const defaultPrintColKeys = useMemo(
    () => visibleColumns.map((c) => c.key),
    [visibleColumns],
  );

  const printRows = useMemo(
    () => printRowsOverride ?? (selectedRows.length > 0 ? selectedRows : items),
    [printRowsOverride, selectedRows, items],
  );

  const clearSelection = useCallback(() => {
    setSelectedMap({});
    setAllFilteredIds(null);
  }, []);

  const handleSortChange = useCallback((k: string, dir: 'asc' | 'desc' | null) => {
    setSortBy(dir ? k : '');
    setSortDir(dir || '');
    setPage(1);
  }, []);

  const handleApplyColFilter = useCallback(
    (k: string, vals: string[] | undefined) => {
      setColFilters((prev) => {
        const next = { ...prev };
        if (vals === undefined) delete next[k];
        else next[k] = vals;
        return next;
      });
      clearSelection();
      setPage(1);
    },
    [clearSelection],
  );

  const allFilteredIdsRef = useRef<string[] | null>(allFilteredIds);
  allFilteredIdsRef.current = allFilteredIds;

  const toggleRow = useCallback((row: GeneralRowView) => {
    if (allFilteredIdsRef.current !== null) {
      setAllFilteredIds((prevIds) => {
        if (prevIds === null) return null;
        const nextIds = prevIds.includes(row.id)
          ? prevIds.filter((id) => id !== row.id)
          : [...prevIds, row.id];
        return nextIds.length > 0 ? nextIds : null;
      });
      return;
    }
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
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
  }, [allFilteredIds, clearSelection, items, selectedMap]);

  const toggleSelectAllTable = useCallback(async () => {
    if (allFilteredIds !== null) {
      clearSelection();
      return;
    }
    setSelectingAll(true);
    try {
      const params = buildFilterParams();
      params.set('allIds', 'true');
      const res = await apiRequest<{ ids: string[]; total: number }>(`/api/general?${params.toString()}`);
      setAllFilteredIds(res.ids || []);
      setSelectedMap({});
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSelectingAll(false);
    }
  }, [allFilteredIds, buildFilterParams, clearSelection, notify]);

  const handleOpenPrint = useCallback(async () => {
    if (allFilteredIds !== null) {
      if (data && data.totalPages <= 1) {
        setPrintRowsOverride(items.filter((r) => selectedIdSet.has(r.id)));
      } else {
        try {
          const params = buildFilterParams();
          params.set('all', 'true');
          const res = await apiRequest<GeneralListResponse>(`/api/general?${params.toString()}`);
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
  }, [allFilteredIds, buildFilterParams, data, items, notify, selectedIdSet]);

  useEffect(() => {
    const onShortcutAction = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'print' || action === 'exportExcel') {
        e.preventDefault();
        void handleOpenPrint();
      } else if (action === 'clearFilters') {
        e.preventDefault();
        setColFilters({});
        setSortBy('');
        setPage(1);
        notify('info', isFa ? 'فیلترهای جدول پاک شد.' : 'Table filters cleared.');
      }
    };
    window.addEventListener('samaan:shortcut-action', onShortcutAction);
    return () => window.removeEventListener('samaan:shortcut-action', onShortcutAction);
  }, [handleOpenPrint, isFa, notify]);

  const handleTogglePackingClosed = useCallback(async (packingNo: string, currentlyClosed: boolean) => {
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
  }, [isFa, loadData, notify, onDataChanged]);

  const openEditRow = useCallback((row: GeneralRowView) => {
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
  }, [isFa]);

  const handleInspectRow = useCallback((row: GeneralRowView) => {
    setInspected(row);
  }, []);

  const handleDeleteTarget = useCallback((row: GeneralRowView) => {
    setDeleteTarget(row);
  }, []);

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
      const effectiveReleaseDate = (editing.releaseNo || '').trim()
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
      const res = await apiRequest<{ ok: boolean; updatedCount: number }>('/api/general/bulk', {
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
        arrivalDate: '', supplier: '', dispatchLocation: '', island: '', system: '', subSystem: '',
        unit: '', releaseNo: '', releaseDate: '', billOfLadingNo: '', vehicleNo: '', driverName: '',
      });
      clearSelection();
      triggerAutoSnapshot('Bulk Edit General');
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
      const res = await apiRequest<{ ok: boolean; deletedCount: number; trashedDetailedCount?: number }>(
        '/api/general/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            ids: selectedIds,
            cascadeDetailed: bulkDeleteCascade,
          }),
        },
      );
      notify(
        'success',
        isFa
          ? `${formatDisplayNumber(res.deletedCount, 'fa')} ردیف به سطل بازیافت منتقل شد${
              res.trashedDetailedCount ? ` (${formatDisplayNumber(res.trashedDetailedCount, 'fa')} ردیف جزئیات نیز حذف شد)` : ''
            }.`
          : `Moved ${res.deletedCount} row(s) to Recycle Bin.`,
      );
      setBulkDeleteOpen(false);
      setBulkDeleteCascade(false);
      clearSelection();
      triggerAutoSnapshot('Bulk Delete General');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const editPackageTypeOptions = useMemo(() => {
    const base = isFa ? PACKAGE_TYPE_OPTIONS_FA : PACKAGE_TYPE_OPTIONS_EN;
    const set = new Set<string>(base);
    for (const v of categories.packageType || []) {
      const trimmed = String(v || '').trim();
      if (trimmed) set.add(trimmed);
    }
    return Array.from(set);
  }, [isFa, categories.packageType]);

  const hasHiddenFilters = Boolean(
    dispatchLocation || packageType || island || system || subSystem || unit || fromDate || toDate,
  );

  const clearHiddenFilters = () => {
    setDispatchLocation('');
    setPackageType('');
    setIsland('');
    setSystem('');
    setSubSystem('');
    setUnit('');
    setFromDate('');
    setToDate('');
    clearSelection();
    setPage(1);
  };

  return (
    <div className="space-y-4 samaan-animate-in">
      {/* Hidden-Field Filters & Actions Toolbar */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-4.5 space-y-3">
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
                onClick={() => onOpenNewPacking()}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.controls.newPacking}</span>
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
            value={dispatchLocation}
            onChange={(e) => { setDispatchLocation(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.dispatchLocation}: {t.controls.all}</option>
            {categories.dispatchLocation.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={packageType}
            onChange={(e) => { setPackageType(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.packageType}: {t.controls.all}</option>
            {editPackageTypeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={island}
            onChange={(e) => { setIsland(e.target.value); clearSelection(); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.island}: {t.controls.all}</option>
            {categories.island.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

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

      {/* Formula Selection Summary Bar */}
      {(items.length > 0 || selectedCount > 0) && (
        <SelectionSummaryBar
          scope="general"
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
          className={`rounded-2xl border px-4.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-[var(--shadow-card)] ${
            selectedCount > 0
              ? 'border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {(() => {
              const allOnPageSelected =
                allFilteredIds !== null
                  ? items.length > 0 && items.every((r) => selectedIdSet.has(r.id))
                  : items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]));
              return (
                <button
                  type="button"
                  onClick={toggleAllOnPage}
                  disabled={items.length === 0}
                  className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                    allOnPageSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  <span>
                    {allOnPageSelected
                      ? isFa
                        ? 'لغو انتخاب صفحه'
                        : 'Unselect Page'
                      : isFa
                        ? 'انتخاب صفحه'
                        : 'Select Page'}
                  </span>
                </button>
              );
            })()}
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

      {/* Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-x-clip">
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
                      scope="general"
                      colKey={col.key}
                      label={col.header}
                      calendar={prefs.calendar}
                      lang={prefs.language}
                      isNum={col.isNum}
                      activeValues={colFilters[col.key]}
                      sortDir={sortBy === col.key ? (sortDir || null) : null}
                      refreshSignal={refreshSignal}
                      onSortChange={handleSortChange}
                      onApplyFilter={handleApplyColFilter}
                    />
                  </th>
                ))}
                <th className="py-2.5 px-3 text-start font-semibold whitespace-nowrap">
                  {isFa ? 'وضعیت اتمام پکینگ / جزئیات' : 'Packing Completion / Details'}
                </th>
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
                  <GeneralTableRow
                    key={row.id}
                    row={row}
                    visibleColumns={visibleColumns}
                    isSelected={allFilteredIds !== null ? selectedIdSet.has(row.id) : Boolean(selectedMap[row.id])}
                    canEdit={canEdit}
                    isFa={isFa}
                    calendar={prefs.calendar}
                    lang={prefs.language}
                    closedBadgeLabel={t.packing.closedBadge}
                    closePackingBtnLabel={t.packing.closePackingBtn}
                    reopenPackingBtnLabel={t.packing.reopenPackingBtn}
                    editLabel={t.controls.edit}
                    deleteLabel={t.controls.delete}
                    onToggleRow={toggleRow}
                    onInspect={handleInspectRow}
                    onOpenLinkedDetailed={onOpenLinkedDetailed}
                    onTogglePackingClosed={handleTogglePackingClosed}
                    onEdit={openEditRow}
                    onDelete={handleDeleteTarget}
                  />
                ))
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        {/* Pagination */}
        <TablePaginationBar
          page={data?.page || page}
          totalPages={data?.totalPages || 1}
          total={data?.total || 0}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            clearSelection();
            setPage(1);
          }}
          lang={prefs.language}
        />
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
              {(
                [
                  {
                    title: isFa ? 'مشخصات محموله و پکینگ' : 'Shipment & Packing Info',
                    keys: ['rowNo', 'packingListNo', 'packageNo', 'packageType', 'itemCount', 'itemDescription', 'supplier', 'dispatchLocation'],
                  },
                  {
                    title: isFa ? 'موقعیت فنی و دسته‌بندی' : 'Technical Classification',
                    keys: ['island', 'system', 'subSystem', 'unit', 'arrivalDate'],
                  },
                  {
                    title: isFa ? 'ابعاد، اوزان و کرایه حمل' : 'Dimensions, Weights & Freight',
                    keys: ['grossWeight', 'netWeight', 'weighbridgeWeight', 'lengthCm', 'widthCm', 'heightCm', 'freightCost'],
                  },
                  {
                    title: isFa ? 'حمل‌ونقل، صورتجلسات ورود و بازرسی' : 'Logistics, Minutes & Inspection',
                    keys: ['employerEntryMinutesNo', 'mapnaEntryMinutesNo', 'releaseNo', 'releaseDate', 'billOfLadingNo', 'vehicleNo', 'driverName', 'opiInvitationNo', 'opiInvitationDate'],
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
                      releaseDate: (editing.releaseNo || '').trim() ? editing.releaseDate : v,
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
                    value={editing.releaseNo || ''}
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
                  disabled={!(editing.releaseNo || '').trim()}
                  value={(editing.releaseNo || '').trim() ? editing.releaseDate : editing.arrivalDate}
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
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.island}</label>
                  <input
                    type="text"
                    value={bulkPatch.island}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, island: e.target.value }))}
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
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.driverName}</label>
                  <input
                    type="text"
                    value={bulkPatch.driverName}
                    onChange={(e) => setBulkPatch((p) => ({ ...p, driverName: e.target.value }))}
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
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={bulkDeleteCascade}
                onChange={(e) => setBulkDeleteCascade(e.target.checked)}
              />
              <span>
                {isFa
                  ? 'حذف ردیف‌های جزئیات مرتبط با این پکینگ‌ها'
                  : 'Also delete linked detailed equipment rows'}
              </span>
            </label>
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
        title={t.nav.general}
        rows={printRows}
        columns={printColumns}
        defaultSelectedKeys={defaultPrintColKeys}
      />
    </div>
  );
};
