import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { DetailedComputed } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface StocktakeViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const STOCKTAKE_STATUS_PRESETS = [
  'شمارش شده - مطابق',
  'شمارش شده - دارای مغایرت',
  'در حال شمارش',
  'تایید نهایی انبارگردانی',
  'Counted - Matched',
  'Counted - Discrepancy',
  'In Progress',
  'Verified',
];

export const StocktakeView: React.FC<StocktakeViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [items, setItems] = useState<DetailedComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [stocktakeStatus, setStocktakeStatus] = useState('');
  const [stocktakeDate, setStocktakeDate] = useState(getTodayIso());
  const [stocktakeInfo, setStocktakeInfo] = useState('');

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

  const toggleAll = () => {
    const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
    setSelectedIds(allSelected ? [] : items.map((i) => i.id));
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
    if (!stocktakeStatus.trim()) {
      notify('warning', isFa ? 'وضعیت انبارگردانی را مشخص کنید.' : 'Stocktake status is required.');
      return;
    }

    try {
      const res = await apiRequest<{ updatedCount: number }>('/api/stocktake/assign', {
        method: 'POST',
        body: JSON.stringify({
          detailedIds: selectedIds,
          stocktakeStatus,
          stocktakeDate,
          stocktakeInfo,
        }),
      });
      notify(
        'success',
        isFa
          ? `وضعیت انبارگردانی برای ${res.updatedCount} قلم ثبت شد.`
          : `Stocktake status recorded for ${res.updatedCount} items.`,
      );
      setSelectedIds([]);
      setStocktakeInfo('');
      triggerAutoSnapshot(`Stocktake ${stocktakeStatus}`);
      onDataChanged();
      loadItems();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const countedTotal = useMemo(
    () => items.filter((i) => Boolean(i.stocktakeStatus)).length,
    [items],
  );

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleAssign}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ClipboardCheck className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'ثبت وضعیت و تاریخ انبارگردانی' : 'Assign Stocktake Status & Date'}</span>
            </div>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {isFa
                ? `${countedTotal.toLocaleString('fa-IR')} از ${items.length.toLocaleString('fa-IR')} قلم دارای وضعیت`
                : `${countedTotal} of ${items.length} items updated`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.stocktakeStatus} *
              </label>
              <input
                type="text"
                required
                dir={!stocktakeStatus ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                list="stocktake-status-presets"
                value={stocktakeStatus}
                onChange={(e) => setStocktakeStatus(e.target.value)}
                placeholder={isFa ? 'شمارش شده - مطابق...' : 'Counted - Matched...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <datalist id="stocktake-status-presets">
                {STOCKTAKE_STATUS_PRESETS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <JalaliDateInput
              label={`${t.headers.stocktakeDate} *`}
              value={stocktakeDate}
              onChange={setStocktakeDate}
            />

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'یادداشت انبارگردانی (اختیاری)' : 'Stocktake Note (optional)'}
              </label>
              <input
                type="text"
                dir={!stocktakeInfo ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={stocktakeInfo}
                onChange={(e) => setStocktakeInfo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
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

      {/* Items Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="flex items-center h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
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
            className={`h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
              isFa && !shipmentFilter ? 'text-right' : 'text-left'
            }`}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                {canEdit && (
                  <th className="py-2.5 px-3 w-9">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every((i) => selectedIds.includes(i.id))}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.packageNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.itemNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.description}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.storageLocation}</th>
                <th className="py-2.5 px-3 text-end">{t.headers.mapnaInventory}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.stocktakeStatus}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.stocktakeDate}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
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
                    <td className="py-2 px-3 bidi-plaintext">{item.storageLocation || '-'}</td>
                    <td className="py-2 px-3 text-end tabular-nums font-semibold text-[var(--accent-primary)]">
                      {item.opiPending ? '-' : item.mapnaInventory}
                    </td>
                    <td className="py-2 px-3 bidi-plaintext font-medium">
                      {item.stocktakeStatus || '-'}
                    </td>
                    <td className="py-2 px-3 tabular-nums" dir="ltr">
                      {item.stocktakeDate ? formatDate(item.stocktakeDate) : '-'}
                    </td>
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
