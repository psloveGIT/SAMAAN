import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRightCircle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  EyeOff,
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
import type { CategoryStore, SelectionFormulaSummary, TransitEntry } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';

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

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [supplier, setSupplier] = useState('');
  const [system, setSystem] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const [data, setData] = useState<TransitListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, TransitEntry>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<TransitEntry>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(supplier ? { supplier } : {}),
        ...(system ? { system } : {}),
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
      });
      const res = await apiRequest<TransitListResponse>(`/api/transit?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, q, status, supplier, system, fromDate, toDate, notify]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const items = data?.items || [];
  const selectedRows = Object.values(selectedMap);
  const activeSummary = useMemo(() => {
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
  }, [selectedRows, data]);

  const columns = useMemo(
    () => [
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, get: (r: TransitEntry) => r.arrivalDate },
      { key: 'overallStatus', header: t.headers.overallStatus, get: (r: TransitEntry) => r.overallStatus },
      { key: 'packingListNo', header: t.headers.packingListNo, get: (r: TransitEntry) => r.packingListNo },
      { key: 'packageNo', header: t.headers.packageNo, get: (r: TransitEntry) => r.packageNo },
      { key: 'itemDescription', header: t.headers.itemDescription, get: (r: TransitEntry) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: TransitEntry) => r.supplier },
      { key: 'dispatchLocation', header: t.headers.dispatchLocation, get: (r: TransitEntry) => r.dispatchLocation },
      { key: 'inspectionRequest', header: t.headers.inspectionRequest, get: (r: TransitEntry) => r.inspectionRequest },
      { key: 'releaseNetNo', header: t.headers.releaseNetNo, get: (r: TransitEntry) => r.releaseNetNo },
      { key: 'releaseNetDate', header: t.headers.releaseNetDate, isDate: true, get: (r: TransitEntry) => r.releaseNetDate },
      { key: 'mapnaShippingNotice', header: t.headers.mapnaShippingNotice, get: (r: TransitEntry) => r.mapnaShippingNotice },
      { key: 'interimNo', header: t.headers.interimNo, get: (r: TransitEntry) => r.interimNo },
      { key: 'interimDate', header: t.headers.interimDate, isDate: true, get: (r: TransitEntry) => r.interimDate },
      { key: 'system', header: t.headers.system, get: (r: TransitEntry) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, get: (r: TransitEntry) => r.subSystem },
      { key: 'unit', header: t.headers.unit, get: (r: TransitEntry) => r.unit },
      { key: 'equipmentSupplyCode', header: t.headers.equipmentSupplyCode, get: (r: TransitEntry) => r.equipmentSupplyCode },
      { key: 'carrierContractor', header: t.headers.carrierContractor, get: (r: TransitEntry) => r.carrierContractor },
      { key: 'billOfLadingNo', header: t.headers.billOfLadingNo, get: (r: TransitEntry) => r.billOfLadingNo },
      { key: 'amount', header: t.headers.amount, isNum: true, get: (r: TransitEntry) => r.amount },
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiRequest(`/api/transit/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(draft),
        });
        notify('success', isFa ? 'رکورد در راه ویرایش شد.' : 'Transit item updated.');
      } else {
        await apiRequest('/api/transit', {
          method: 'POST',
          body: JSON.stringify(draft),
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

  const handleDelete = async (row: TransitEntry) => {
    try {
      await apiRequest(`/api/transit/${row.id}`, { method: 'DELETE' });
      notify('success', isFa ? 'حذف شد.' : 'Deleted.');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const toggleRow = (row: TransitEntry) => {
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
      filename: 'samaan-transit',
      calendar: prefs.calendar,
      hideEmptyColumns: hideEmptyCols,
    });
  };

  return (
    <div className="space-y-4">
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
                onClick={() => {
                  setEditingId(null);
                  setDraft({ arrivalDate: getTodayIso(), overallStatus: 'در دست ارسال' });
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.overallStatus}: {t.controls.all}</option>
            <option value="در دست بازرسی">در دست بازرسی</option>
            <option value="در دست ارسال">در دست ارسال</option>
            <option value="رسیده">رسیده</option>
            <option value="پایان">پایان</option>
          </select>

          <select
            value={supplier}
            onChange={(e) => { setSupplier(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.supplier}: {t.controls.all}</option>
            {categories.supplier.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          <select
            value={system}
            onChange={(e) => { setSystem(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.system}: {t.controls.all}</option>
            {categories.system.map((v) => <option key={v} value={v}>{v}</option>)}
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

      {(items.length > 0 || selectedRows.length > 0) && (
        <SelectionSummaryBar
          scope="transit"
          selectedCount={selectedRows.length}
          summary={activeSummary}
          isFilteredFallback={selectedRows.length === 0}
          onClearSelection={() => setSelectedMap({})}
          onExportSelected={handleExport}
        />
      )}

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
                  <tr key={row.id} className="hover:bg-[var(--bg-subtle)]/60 transition-colors">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMap[row.id])}
                        onChange={() => toggleRow(row)}
                      />
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
                          className={`py-2 px-3 whitespace-nowrap max-w-[240px] truncate tabular-nums ${
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
                    <td className="py-2 px-3 whitespace-nowrap text-end">
                      {canEdit && (
                        <div className="inline-flex items-center gap-1">
                          {row.overallStatus !== 'رسیده' && (
                            <button
                              type="button"
                              onClick={() => onConvertToGeneral(row)}
                              className="px-2 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold flex items-center gap-1"
                            >
                              <ArrowRightCircle className="w-3 h-3" />
                              <span>{isFa ? 'انتقال به جنرال' : 'Mark Arrived'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row.id);
                              setDraft({ ...row });
                              setModalOpen(true);
                            }}
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
                    <option value="در دست بازرسی">در دست بازرسی</option>
                    <option value="در دست ارسال">در دست ارسال</option>
                    <option value="پایان">پایان</option>
                    <option value="رسیده">رسیده</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.packingListNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.packingListNo || ''}
                    onChange={(e) => setDraft({ ...draft, packingListNo: e.target.value })}
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
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.itemDescription}</label>
                  <input
                    type="text"
                    value={draft.itemDescription || ''}
                    onChange={(e) => setDraft({ ...draft, itemDescription: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.supplier}</label>
                  <input
                    type="text"
                    value={draft.supplier || ''}
                    onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.dispatchLocation}</label>
                  <input
                    type="text"
                    value={draft.dispatchLocation || ''}
                    onChange={(e) => setDraft({ ...draft, dispatchLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.releaseNetNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.releaseNetNo || ''}
                    onChange={(e) => setDraft({ ...draft, releaseNetNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
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
                    dir="ltr"
                    value={draft.interimNo || ''}
                    onChange={(e) => setDraft({ ...draft, interimNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
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
                    value={draft.carrierContractor || ''}
                    onChange={(e) => setDraft({ ...draft, carrierContractor: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.billOfLadingNo}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={draft.billOfLadingNo || ''}
                    onChange={(e) => setDraft({ ...draft, billOfLadingNo: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">{t.headers.amount}</label>
                  <input
                    type="number"
                    step="any"
                    dir="ltr"
                    value={draft.amount ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, amount: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums"
                  />
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
    </div>
  );
};
