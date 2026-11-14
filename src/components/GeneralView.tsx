import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  EyeOff,
  Link2,
  Lock,
  LockOpen,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv } from '../lib/csvExport.ts';
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import type {
  CategoryStore,
  GeneralEntry,
  PackingStatusMeta,
  SelectionFormulaSummary,
} from '../shared/types.ts';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
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
  const [page, setPage] = useState(1);
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const [data, setData] = useState<GeneralListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneralRowView>>({});
  const [inspected, setInspected] = useState<GeneralRowView | null>(null);
  const [editing, setEditing] = useState<GeneralRowView | null>(null);
  const [ackClosedEdit, setAckClosedEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GeneralRowView | null>(null);

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
      });
      const res = await apiRequest<GeneralListResponse>(`/api/general?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, q, island, system, subSystem, unit, supplier, fromDate, toDate, notify]);

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
      { key: 'itemDescription', header: t.headers.itemDescription, get: (r: GeneralRowView) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: GeneralRowView) => r.supplier },
      { key: 'dispatchLocation', header: t.headers.dispatchLocation, get: (r: GeneralRowView) => r.dispatchLocation },
      { key: 'employerEntryMinutesNo', header: t.headers.employerEntryMinutesNo, get: (r: GeneralRowView) => r.employerEntryMinutesNo },
      { key: 'mapnaEntryMinutesNo', header: t.headers.mapnaEntryMinutesNo, get: (r: GeneralRowView) => r.mapnaEntryMinutesNo },
      { key: 'releaseNo', header: t.headers.releaseNo, get: (r: GeneralRowView) => r.releaseNo },
      { key: 'releaseDate', header: t.headers.releaseDate, isDate: true, get: (r: GeneralRowView) => r.releaseDate },
      { key: 'island', header: t.headers.island, get: (r: GeneralRowView) => r.island },
      { key: 'system', header: t.headers.system, get: (r: GeneralRowView) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, get: (r: GeneralRowView) => r.subSystem },
      { key: 'unit', header: t.headers.unit, get: (r: GeneralRowView) => r.unit },
      { key: 'grossWeight', header: t.headers.grossWeight, isNum: true, get: (r: GeneralRowView) => r.grossWeight },
      { key: 'netWeight', header: t.headers.netWeight, isNum: true, get: (r: GeneralRowView) => r.netWeight },
      { key: 'lengthCm', header: t.headers.lengthCm, isNum: true, get: (r: GeneralRowView) => r.lengthCm },
      { key: 'widthCm', header: t.headers.widthCm, isNum: true, get: (r: GeneralRowView) => r.widthCm },
      { key: 'heightCm', header: t.headers.heightCm, isNum: true, get: (r: GeneralRowView) => r.heightCm },
      { key: 'billOfLadingNo', header: t.headers.billOfLadingNo, get: (r: GeneralRowView) => r.billOfLadingNo },
      { key: 'vehicleNo', header: t.headers.vehicleNo, get: (r: GeneralRowView) => r.vehicleNo },
      { key: 'weighbridgeWeight', header: t.headers.weighbridgeWeight, isNum: true, get: (r: GeneralRowView) => r.weighbridgeWeight },
      { key: 'freightCost', header: t.headers.freightCost, isNum: true, get: (r: GeneralRowView) => r.freightCost },
      { key: 'opiInvitationNo', header: t.headers.opiInvitationNo, get: (r: GeneralRowView) => r.opiInvitationNo },
      { key: 'opiInvitationDate', header: t.headers.opiInvitationDate, isDate: true, get: (r: GeneralRowView) => r.opiInvitationDate },
      { key: 'driverName', header: t.headers.driverName, get: (r: GeneralRowView) => r.driverName },
    ],
    [t],
  );

  const visibleColumns = useMemo(() => {
    if (!hideEmptyCols || items.length === 0) return columns;
    return columns.filter((col) =>
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const { rowNo: _ignored, ...rest } = editing;
      const effectiveReleaseDate = editing.releaseNo.trim()
        ? (editing.releaseDate || editing.arrivalDate)
        : editing.arrivalDate;
      await apiRequest(`/api/general/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...rest,
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
      if (err instanceof ApiError) notify('error', err.message);
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
      filename: 'samaan-general',
      calendar: prefs.calendar,
      hideEmptyColumns: hideEmptyCols,
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter & Search Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-[240px] h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t.controls.searchPlaceholder}
              className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
            />
          </div>

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
          onExportSelected={handleExport}
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
                      {canEdit && (
                        <div className="inline-flex items-center gap-1">
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
                            onClick={() => {
                              setEditing({ ...row });
                              setAckClosedEdit(false);
                            }}
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
                        </div>
                      )}
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
                      <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                        {formatted}
                      </div>
                    </div>
                  );
                })}
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
                    {t.headers.packageNo}
                  </label>
                  <input
                    type="text"
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
                    dir={isFa && !editing.employerEntryMinutesNo ? 'rtl' : 'ltr'}
                    value={editing.employerEntryMinutesNo}
                    onChange={(e) => setEditing({ ...editing, employerEntryMinutesNo: e.target.value })}
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
                    {t.headers.itemDescription}
                  </label>
                  <input
                    type="text"
                    dir={!editing.itemDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.itemDescription}
                    onChange={(e) => setEditing({ ...editing, itemDescription: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.island}
                  </label>
                  <input
                    type="text"
                    dir={!editing.island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.island}
                    onChange={(e) => setEditing({ ...editing, island: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.system}
                  </label>
                  <input
                    type="text"
                    dir={!editing.system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.system}
                    onChange={(e) => setEditing({ ...editing, system: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.subSystem}
                  </label>
                  <input
                    type="text"
                    dir={!editing.subSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.subSystem}
                    onChange={(e) => setEditing({ ...editing, subSystem: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.unit}
                  </label>
                  <input
                    type="text"
                    dir={!editing.unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.unit}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.supplier}
                  </label>
                  <input
                    type="text"
                    dir={!editing.supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.supplier}
                    onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.dispatchLocation}
                  </label>
                  <input
                    type="text"
                    dir={!editing.dispatchLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={editing.dispatchLocation}
                    onChange={(e) => setEditing({ ...editing, dispatchLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.grossWeight}
                  </label>
                  <input
                    type="number"
                    step="any"
                    dir={isFa && (editing.grossWeight === null || editing.grossWeight === undefined) ? 'rtl' : 'ltr'}
                    value={editing.grossWeight ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        grossWeight: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && (editing.grossWeight === null || editing.grossWeight === undefined) ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.netWeight}
                  </label>
                  <input
                    type="number"
                    step="any"
                    dir={isFa && (editing.netWeight === null || editing.netWeight === undefined) ? 'rtl' : 'ltr'}
                    value={editing.netWeight ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        netWeight: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && (editing.netWeight === null || editing.netWeight === undefined) ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.freightCost}
                  </label>
                  <input
                    type="number"
                    step="any"
                    dir={isFa && (editing.freightCost === null || editing.freightCost === undefined) ? 'rtl' : 'ltr'}
                    value={editing.freightCost ?? ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        freightCost: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && (editing.freightCost === null || editing.freightCost === undefined) ? 'text-right' : 'text-left'
                    }`}
                  />
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
    </div>
  );
};
