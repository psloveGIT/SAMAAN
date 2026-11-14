import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Printer, Search, Square, Tag } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { DetailedComputed } from '../shared/types.ts';

interface StorageLabelViewProps {
  refreshSignal: number;
}

interface LabelFieldToggles {
  shipmentNo: boolean;
  packageNo: boolean;
  itemNo: boolean;
  itemCode: boolean;
  size: boolean;
  qty: boolean;
  storageLocation: boolean;
  arrivalDate: boolean;
  islandSystem: boolean;
}

export const StorageLabelView: React.FC<StorageLabelViewProps> = ({ refreshSignal }) => {
  const { prefs, t, notify, formatDate } = useApp();
  const isFa = prefs.language === 'fa';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [items, setItems] = useState<DetailedComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [colsPerRow, setColsPerRow] = useState<2 | 3>(2);
  const [fields, setFields] = useState<LabelFieldToggles>({
    shipmentNo: true,
    packageNo: true,
    itemNo: true,
    itemCode: true,
    size: true,
    qty: true,
    storageLocation: true,
    arrivalDate: true,
    islandSystem: false,
  });

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

  const knownLocations = useMemo(
    () => Array.from(new Set(items.map((i) => i.storageLocation).filter(Boolean))),
    [items],
  );

  const filtered = useMemo(() => {
    if (!locationFilter) return items;
    return items.filter((i) => i.storageLocation === locationFilter);
  }, [items, locationFilter]);

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id));
    setSelectedIds(allSelected ? [] : filtered.map((i) => i.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectedItems = useMemo(
    () => filtered.filter((i) => selectedIds.includes(i.id)),
    [filtered, selectedIds],
  );

  const labelsToRender = useMemo(
    () => (selectedItems.length > 0 ? selectedItems : filtered.slice(0, 12)),
    [selectedItems, filtered],
  );

  const toggleField = (k: keyof LabelFieldToggles) => {
    setFields((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const handlePrintLabels = () => {
    if (selectedItems.length === 0) {
      notify('warning', isFa ? 'حداقل یک کالا را برای چاپ برچسب انتخاب کنید.' : 'Select at least one item to print labels.');
      return;
    }
    window.print();
  };

  const printPortal =
    selectedItems.length > 0
      ? createPortal(
          <div id="samaan-label-print-root" dir={isFa ? 'rtl' : 'ltr'}>
            <style>{`
              @media screen {
                #samaan-label-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 8mm;
                }
                body > *:not(#samaan-label-print-root) {
                  display: none !important;
                }
                #samaan-label-print-root {
                  display: block !important;
                  background: #ffffff !important;
                  color: #0f172a !important;
                  font-family: 'Vazirmatn', system-ui, sans-serif;
                }
                .label-grid-2 {
                  display: grid;
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                  gap: 6mm;
                }
                .label-grid-3 {
                  display: grid;
                  grid-template-columns: repeat(3, minmax(0, 1fr));
                  gap: 4mm;
                }
                .label-card {
                  border: 1.5px solid #0f172a;
                  border-radius: 4px;
                  padding: 6px 8px;
                  break-inside: avoid;
                  page-break-inside: avoid;
                  font-size: 9.5px;
                  line-height: 1.35;
                }
              }
            `}</style>
            <div className={colsPerRow === 2 ? 'label-grid-2' : 'label-grid-3'}>
              {selectedItems.map((item) => (
                <div key={item.id} className="label-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '3px', marginBottom: '4px', fontWeight: 700 }}>
                    <span>{t.brandShort}</span>
                    {fields.storageLocation && <span>{item.storageLocation || '—'}</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '10.5px', marginBottom: '4px' }}>
                    {item.description || item.generalDescription}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px' }}>
                    {fields.shipmentNo && (
                      <div>
                        <strong>{isFa ? 'پکینگ:' : 'Packing:'}</strong>{' '}
                        <span dir="ltr">{item.shipmentNo}</span>
                      </div>
                    )}
                    {fields.packageNo && (
                      <div>
                        <strong>{isFa ? 'نگله:' : 'Pkg:'}</strong>{' '}
                        <span dir="ltr">{item.packageNo}</span>
                      </div>
                    )}
                    {fields.itemNo && (
                      <div>
                        <strong>{isFa ? 'آیتم:' : 'Item:'}</strong>{' '}
                        <span dir="ltr">{item.itemNo}</span>
                      </div>
                    )}
                    {fields.itemCode && (
                      <div>
                        <strong>{isFa ? 'کد:' : 'Code:'}</strong>{' '}
                        <span dir="ltr">{item.itemCode || '—'}</span>
                      </div>
                    )}
                    {fields.size && item.size && (
                      <div>
                        <strong>{isFa ? 'سایز:' : 'Size:'}</strong>{' '}
                        <span dir="ltr">{item.size}</span>
                      </div>
                    )}
                    {fields.qty && (
                      <div>
                        <strong>{isFa ? 'تعداد:' : 'Qty:'}</strong>{' '}
                        <span>{item.opiPending ? item.packingQty ?? '-' : item.mapnaInventory} {item.countingUnit}</span>
                      </div>
                    )}
                    {fields.arrivalDate && item.arrivalDate && (
                      <div>
                        <strong>{isFa ? 'ورود:' : 'Date:'}</strong>{' '}
                        <span dir="ltr">{formatDate(item.arrivalDate)}</span>
                      </div>
                    )}
                    {fields.islandSystem && (item.island || item.system) && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <strong>{isFa ? 'جزیره/سیستم:' : 'Island/Sys:'}</strong>{' '}
                        <span>{[item.island, item.system, item.unit].filter(Boolean).join(' / ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  const fieldToggleList: { key: keyof LabelFieldToggles; label: string }[] = [
    { key: 'shipmentNo', label: t.headers.shipmentNo },
    { key: 'packageNo', label: t.headers.packageNo },
    { key: 'itemNo', label: t.headers.itemNo },
    { key: 'itemCode', label: t.headers.itemCode },
    { key: 'size', label: t.headers.size },
    { key: 'qty', label: isFa ? 'تعداد / موجودی' : 'Qty / Stock' },
    { key: 'storageLocation', label: t.headers.storageLocation },
    { key: 'arrivalDate', label: t.headers.arrivalDate },
    { key: 'islandSystem', label: `${t.headers.island} / ${t.headers.system}` },
  ];

  return (
    <div className="space-y-6">
      {printPortal}

      {/* Label Configuration */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Tag className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{t.nav.storageLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {isFa ? 'چیدمان برچسب در صفحه:' : 'Labels per row:'}
            </span>
            <button
              type="button"
              onClick={() => setColsPerRow(2)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium ${
                colsPerRow === 2
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {isFa ? '۲ ستونه (درشت)' : '2 Columns'}
            </button>
            <button
              type="button"
              onClick={() => setColsPerRow(3)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium ${
                colsPerRow === 3
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {isFa ? '۳ ستونه (متراکم)' : '3 Columns'}
            </button>

            <button
              type="button"
              onClick={handlePrintLabels}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>
                {isFa
                  ? `چاپ ${selectedItems.length.toLocaleString('fa-IR')} برچسب`
                  : `Print ${selectedItems.length} Labels`}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {fieldToggleList.map((f) => {
            const active = fields[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleField(f.key)}
                className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'border-[var(--accent-primary)]/40 bg-[var(--bg-canvas)] text-[var(--text-primary)] font-medium'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {active ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Item Selection Table */}
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
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.storageLocation}: {t.controls.all}</option>
            {knownLocations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0">
              <tr>
                <th className="py-2.5 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id))}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.packageNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.itemNo}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.description}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.itemCode}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.storageLocation}</th>
                <th className="py-2.5 px-3 text-end">{isFa ? 'مقدار' : 'Qty'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                    <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                    <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                    <td className="py-2 px-3 max-w-[220px] truncate bidi-plaintext">
                      {item.description || item.generalDescription}
                    </td>
                    <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemCode || '-'}</td>
                    <td className="py-2 px-3 bidi-plaintext">{item.storageLocation || '-'}</td>
                    <td className="py-2 px-3 text-end tabular-nums font-semibold">
                      {item.opiPending ? item.packingQty ?? '-' : item.mapnaInventory} {item.countingUnit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Preview */}
      {labelsToRender.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[var(--text-secondary)]">
            {selectedItems.length > 0
              ? isFa ? 'پیش‌نمایش برچسب‌های انتخاب‌شده' : 'Selected Storage Labels Preview'
              : isFa ? 'پیش‌نمایش نمونه برچسب انبارش کالا (جهت چاپ موارد موردنظر را تیک بزنید)' : 'Sample Label Preview (check items above to print)'}
          </h3>
          <div className={`grid gap-3 ${colsPerRow === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {labelsToRender.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border-2 border-[var(--border-strong)] bg-[var(--bg-surface)] p-3.5 text-xs space-y-2"
              >
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5 font-bold">
                  <span className="text-[var(--accent-primary)]">{t.brandShort}</span>
                  {fields.storageLocation && (
                    <span className="bidi-plaintext text-[11px]">
                      {item.storageLocation || (isFa ? 'محل نامشخص' : 'No Location')}
                    </span>
                  )}
                </div>
                <div className="font-bold text-xs bidi-plaintext line-clamp-2">
                  {item.description || item.generalDescription}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {fields.shipmentNo && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'پکینگ:' : 'Packing:'}</span>{' '}
                      <span dir="ltr" className="font-semibold tabular-nums">{item.shipmentNo}</span>
                    </div>
                  )}
                  {fields.packageNo && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'نگله:' : 'Pkg:'}</span>{' '}
                      <span dir="ltr" className="font-semibold tabular-nums">{item.packageNo}</span>
                    </div>
                  )}
                  {fields.itemNo && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'آیتم:' : 'Item:'}</span>{' '}
                      <span dir="ltr" className="font-semibold tabular-nums">{item.itemNo}</span>
                    </div>
                  )}
                  {fields.itemCode && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'کد:' : 'Code:'}</span>{' '}
                      <span dir="ltr" className="font-semibold tabular-nums">{item.itemCode || '—'}</span>
                    </div>
                  )}
                  {fields.size && item.size && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'سایز:' : 'Size:'}</span>{' '}
                      <span dir="ltr" className="font-semibold">{item.size}</span>
                    </div>
                  )}
                  {fields.qty && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'تعداد:' : 'Qty:'}</span>{' '}
                      <span className="font-semibold tabular-nums">
                        {item.opiPending ? item.packingQty ?? '-' : item.mapnaInventory} {item.countingUnit}
                      </span>
                    </div>
                  )}
                  {fields.arrivalDate && item.arrivalDate && (
                    <div>
                      <span className="text-[var(--text-muted)]">{isFa ? 'ورود:' : 'Date:'}</span>{' '}
                      <span dir="ltr" className="tabular-nums">{formatDate(item.arrivalDate)}</span>
                    </div>
                  )}
                  {fields.islandSystem && (item.island || item.system) && (
                    <div className="col-span-2">
                      <span className="text-[var(--text-muted)]">{isFa ? 'جزیره/سیستم:' : 'Island/Sys:'}</span>{' '}
                      <span>{[item.island, item.system, item.unit].filter(Boolean).join(' / ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
