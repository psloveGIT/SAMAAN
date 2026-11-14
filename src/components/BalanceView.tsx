import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Printer, Scale, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import type { DetailedComputed } from '../shared/types.ts';
import { PrintReportModal } from './PrintReportModal.tsx';

interface BalanceViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const BALANCE_STATUS_PAIRS: { fa: string; en: string }[] = [
  { fa: 'تایید شده', en: 'Balanced' },
  { fa: 'در دست بررسی', en: 'Open / Pending' },
  { fa: 'مغایرت / کسری', en: 'Shortage Claim' },
  { fa: 'مختومه', en: 'Closed' },
];

export function localizeBalanceStatus(raw: string | undefined, isFa: boolean): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const lower = val.toLowerCase();
  if (val === 'مغایرت') return isFa ? 'مغایرت / کسری' : 'Shortage Claim';
  for (const pair of BALANCE_STATUS_PAIRS) {
    if (pair.fa === val || pair.en.toLowerCase() === lower) {
      return isFa ? pair.fa : pair.en;
    }
  }
  return val;
}

export const BalanceView: React.FC<BalanceViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<DetailedComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  const [materialBalanceNo, setMaterialBalanceNo] = useState('');
  const [balanceStatus, setBalanceStatus] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '200',
        ...(q ? { q } : {}),
        ...(shipmentFilter ? { shipmentNo: shipmentFilter } : {}),
      });
      const res = await apiRequest<{ items: DetailedComputed[] }>(
        `/api/detailed?${params.toString()}`,
      );
      setItems(res.items || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [q, shipmentFilter, notify]);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshSignal]);

  const statusPresets = useMemo(
    () => BALANCE_STATUS_PAIRS.map((p) => (isFa ? p.fa : p.en)),
    [isFa],
  );

  const filtered = useMemo(() => {
    if (!statusFilter) return items;
    if (statusFilter === '__EMPTY__') return items.filter((i) => !i.balanceStatus);
    return items.filter((i) => localizeBalanceStatus(i.balanceStatus, isFa) === statusFilter);
  }, [items, statusFilter, isFa]);

  const knownStatuses = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((i) => localizeBalanceStatus(i.balanceStatus, isFa))
            .filter(Boolean),
        ),
      ),
    [items, isFa],
  );

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((i) => i.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم انتخاب کنید.' : 'Select at least one item.');
      return;
    }
    if (!materialBalanceNo.trim() && !balanceStatus.trim()) {
      notify(
        'warning',
        isFa ? 'شماره موازنه یا وضعیت را وارد کنید.' : 'Enter Balance No. or Status.',
      );
      return;
    }

    try {
      const normalizedStatus = localizeBalanceStatus(balanceStatus, isFa);
      const res = await apiRequest<{ updatedCount: number }>('/api/balance/assign', {
        method: 'POST',
        body: JSON.stringify({
          detailedIds: selectedIds,
          materialBalanceNo,
          balanceStatus: normalizedStatus,
        }),
      });
      notify(
        'success',
        isFa
          ? `گزارش موازنه و کنترل مصرف مواد برای ${res.updatedCount.toLocaleString('fa-IR')} قلم ثبت شد.`
          : `Material balance assigned to ${res.updatedCount} items.`,
      );
      setSelectedIds([]);
      triggerAutoSnapshot(`Balance ${materialBalanceNo || normalizedStatus}`);
      onDataChanged();
      loadItems();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<CsvColumnDef<DetailedComputed>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'description', header: t.headers.description, getValue: (r) => r.description || r.generalDescription },
      { key: 'itemCode', header: t.headers.itemCode, getValue: (r) => r.itemCode },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'packingQty', header: t.headers.packingQty, getValue: (r) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, getValue: (r) => r.actualQty },
      { key: 'shortage', header: t.headers.shortage, getValue: (r) => (r.shortage > 0 ? r.shortage : 0) },
      { key: 'damagedQty', header: t.headers.damagedQty, getValue: (r) => r.damagedQty },
      { key: 'mapnaInventory', header: t.headers.mapnaInventory, getValue: (r) => (r.opiPending ? '' : r.mapnaInventory) },
      { key: 'contractorInventory', header: t.headers.contractorInventory, getValue: (r) => (r.opiPending ? '' : r.contractorInventory) },
      { key: 'materialBalanceNo', header: t.headers.materialBalanceNo, getValue: (r) => r.materialBalanceNo },
      {
        key: 'balanceStatus',
        header: t.headers.balanceStatus,
        getValue: (r) => localizeBalanceStatus(r.balanceStatus, isFa),
      },
    ],
    [t, isFa],
  );

  const printRows = useMemo(
    () => (selectedIds.length > 0 ? filtered.filter((r) => selectedIds.includes(r.id)) : filtered),
    [filtered, selectedIds],
  );

  const handleExportCsv = () => {
    exportRowsToCsv({
      rows: printRows,
      columns: reportColumns,
      filename: 'samaan-material-balance',
      calendar: prefs.calendar,
      hideEmptyColumns: true,
    });
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleAssign}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Scale className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.balance}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.materialBalanceNo}
              </label>
              <input
                type="text"
                dir={isFa && !materialBalanceNo ? 'rtl' : 'ltr'}
                value={materialBalanceNo}
                onChange={(e) => setMaterialBalanceNo(e.target.value)}
                placeholder="MB-2026-01"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !materialBalanceNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.balanceStatus}
              </label>
              <input
                type="text"
                dir={!balanceStatus ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                list="balance-status-datalist"
                value={balanceStatus}
                onChange={(e) => setBalanceStatus(e.target.value)}
                placeholder={isFa ? 'تایید شده / در دست بررسی...' : 'Balanced / Pending...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <datalist id="balance-status-datalist">
                {statusPresets.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>

            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isFa
                  ? `ثبت برای ${selectedIds.length.toLocaleString('fa-IR')} قلم`
                  : `Apply to ${selectedIds.length} Items`}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Filters & Selection Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-2.5">
          <div className="flex items-center flex-1 min-w-[200px] h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.controls.searchPlaceholder}
              className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
            />
          </div>

          <input
            type="text"
            dir={isFa && !shipmentFilter ? 'rtl' : 'ltr'}
            value={shipmentFilter}
            onChange={(e) => setShipmentFilter(e.target.value)}
            placeholder={t.headers.shipmentNo}
            className={`h-9 w-44 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
              isFa && !shipmentFilter ? 'text-right' : 'text-left'
            }`}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.balanceStatus}: {t.controls.all}</option>
            <option value="__EMPTY__">{isFa ? 'بدون وضعیت موازنه' : 'Unassigned'}</option>
            {knownStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.controls.exportCsv}</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.controls.printReport}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                {canEdit && (
                  <th className="py-2.5 px-3 w-9">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id))}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.packageNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.itemNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.description}</th>
                <th className="py-2.5 px-3 text-end">{t.headers.packingQty}</th>
                <th className="py-2.5 px-3 text-end">{t.headers.actualQty}</th>
                <th className="py-2.5 px-3 text-end">{t.headers.shortage}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.materialBalanceNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.balanceStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const localizedStatus = localizeBalanceStatus(item.balanceStatus, isFa);
                  return (
                    <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                      {canEdit && (
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleOne(item.id)}
                          />
                        </td>
                      )}
                      <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                      <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                      <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                      <td className="py-2 px-3 max-w-[220px] truncate bidi-plaintext">
                        {item.description || item.generalDescription}
                      </td>
                      <td className="py-2 px-3 text-end tabular-nums">{item.packingQty ?? '-'}</td>
                      <td className="py-2 px-3 text-end tabular-nums">
                        {item.actualQty ?? '-'}
                      </td>
                      <td
                        className={`py-2 px-3 text-end tabular-nums ${
                          item.hasShortage ? 'font-bold text-[var(--status-danger)]' : ''
                        }`}
                      >
                        {item.shortage > 0 ? item.shortage : '-'}
                      </td>
                      <td className="py-2 px-3 tabular-nums font-medium" dir="ltr">
                        {item.materialBalanceNo || '-'}
                      </td>
                      <td className="py-2 px-3 bidi-plaintext">{localizedStatus || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.balance}
        columns={reportColumns}
        rows={printRows}
      />
    </div>
  );
};
