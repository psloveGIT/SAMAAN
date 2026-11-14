import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Printer, Scale, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { DetailedComputed } from '../shared/types.ts';

interface BalanceViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const BALANCE_STATUS_OPTIONS = [
  'Balanced',
  'Open / Pending',
  'Shortage Claim',
  'Closed',
  'تایید شده',
  'در دست بررسی',
  'مغایرت',
];

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

  const filtered = useMemo(() => {
    if (!statusFilter) return items;
    if (statusFilter === '__EMPTY__') return items.filter((i) => !i.balanceStatus);
    return items.filter((i) => i.balanceStatus === statusFilter);
  }, [items, statusFilter]);

  const knownStatuses = useMemo(
    () => Array.from(new Set(items.map((i) => i.balanceStatus).filter(Boolean))),
    [items],
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
        isFa ? 'شماره بالانس یا وضعیت بالانس را وارد کنید.' : 'Enter Balance No. or Status.',
      );
      return;
    }

    try {
      const res = await apiRequest<{ updatedCount: number }>('/api/balance/assign', {
        method: 'POST',
        body: JSON.stringify({
          detailedIds: selectedIds,
          materialBalanceNo,
          balanceStatus,
        }),
      });
      notify(
        'success',
        isFa
          ? `بالانس متریال برای ${res.updatedCount} قلم ثبت شد.`
          : `Material Balance assigned to ${res.updatedCount} items.`,
      );
      setSelectedIds([]);
      triggerAutoSnapshot(`Balance ${materialBalanceNo || balanceStatus}`);
      onDataChanged();
      loadItems();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleAssign}
          className="print:hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Scale className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'تخصیص شماره و وضعیت بالانس متریال' : 'Assign Material Balance'}</span>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.controls.print}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.materialBalanceNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={materialBalanceNo}
                onChange={(e) => setMaterialBalanceNo(e.target.value)}
                placeholder="MB-2026-01"
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-left tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.balanceStatus}
              </label>
              <input
                type="text"
                dir="auto"
                list="balance-status-datalist"
                value={balanceStatus}
                onChange={(e) => setBalanceStatus(e.target.value)}
                placeholder={isFa ? 'تایید شده / در دست بررسی...' : 'Balanced / Pending...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <datalist id="balance-status-datalist">
                {BALANCE_STATUS_OPTIONS.map((opt) => (
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
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden print-sheet">
        <div className="p-4 border-b border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 print:hidden">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-2.5" />
            <input
              type="text"
              dir="auto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.controls.searchPlaceholder}
              className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
            />
          </div>

          <input
            type="text"
            dir="ltr"
            value={shipmentFilter}
            onChange={(e) => setShipmentFilter(e.target.value)}
            placeholder={t.headers.shipmentNo}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-left tabular-nums"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.balanceStatus}: {t.controls.all}</option>
            <option value="__EMPTY__">{isFa ? 'بدون وضعیت بالانس' : 'Unassigned'}</option>
            {knownStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                {canEdit && (
                  <th className="py-2.5 px-3 w-9 print:hidden">
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
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                    {canEdit && (
                      <td className="py-2 px-3 print:hidden">
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
                    <td className="py-2 px-3 bidi-plaintext">{item.balanceStatus || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
