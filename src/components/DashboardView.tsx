import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  FileSpreadsheet,
  PackageCheck,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { formatMonthLabel } from '../shared/jalali.ts';
import type { DetailedComputed, SelectionFormulaSummary } from '../shared/types.ts';
import type { NavTabKey } from './Layout.tsx';

interface AnalyticsPayload {
  counts: {
    generalRows: number;
    detailedRows: number;
    transitRows: number;
    uniquePackings: number;
    uniquePackages: number;
    closedPackings: number;
    shortageItemsCount: number;
    damagedItemsCount: number;
  };
  totals: SelectionFormulaSummary;
  transitByStatus: { status: string; count: number }[];
  byIsland: {
    name: string;
    generalCount: number;
    detailedCount: number;
    shortageQty: number;
    mapnaStock: number;
    contractorStock: number;
  }[];
  monthlyTrend: {
    monthKey: string;
    generalRows: number;
    detailedRows: number;
    grossWeight: number;
  }[];
  topShortages: DetailedComputed[];
  topDamaged: DetailedComputed[];
}

interface DashboardViewProps {
  refreshSignal: number;
  onNavigate: (tab: NavTabKey) => void;
  onOpenNewPacking: () => void;
  onInspectDetailedShipment: (shipmentNo: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  refreshSignal,
  onNavigate,
  onOpenNewPacking,
  onInspectDetailedShipment,
}) => {
  const { prefs, t, formatDate, user } = useApp();
  const isFa = prefs.language === 'fa';
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest<AnalyticsPayload>(`/api/analytics?calendar=${prefs.calendar}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prefs.calendar, refreshSignal]);

  const fmt = (n: number) =>
    n.toLocaleString(isFa ? 'fa-IR' : 'en-US', { maximumFractionDigits: 2 });

  if (loading && !data) {
    return (
      <div className="py-16 text-center text-sm text-[var(--text-muted)]">
        {t.controls.loading}
      </div>
    );
  }

  const isEmpty =
    data &&
    data.counts.generalRows === 0 &&
    data.counts.detailedRows === 0 &&
    data.counts.transitRows === 0;

  if (isEmpty) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center max-w-2xl mx-auto my-8 space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
          <PackageCheck className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold">{t.brandFull}</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t.controls.emptyStartHint}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {(user?.role === 'admin' || user?.role === 'operator') && (
            <>
              <button
                type="button"
                onClick={onOpenNewPacking}
                className="h-10 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{t.controls.newPacking}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('importCsv')}
                className="h-10 px-5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{t.controls.goToImport}</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxTrendVal = Math.max(
    1,
    ...data.monthlyTrend.map((m) => m.generalRows + m.detailedRows),
  );

  const kpis: { label: string; value: string; sub?: string; tone?: 'danger' | 'accent' }[] = [
    {
      label: isFa ? 'پکینگ لیست‌های یکتا' : 'Unique Packing Lists',
      value: fmt(data.counts.uniquePackings),
      sub:
        data.counts.closedPackings > 0
          ? isFa
            ? `${fmt(data.counts.closedPackings)} پکینگ بسته‌شده`
            : `${fmt(data.counts.closedPackings)} closed`
          : undefined,
    },
    {
      label: isFa ? 'ردیف‌های کلی / نگله' : 'General Package Rows',
      value: fmt(data.counts.generalRows),
      sub:
        data.counts.uniquePackages > 0
          ? isFa
            ? `${fmt(data.counts.uniquePackages)} نگله یکتا`
            : `${fmt(data.counts.uniquePackages)} unique packages`
          : undefined,
    },
    {
      label: isFa ? 'اقلام متریال' : 'Detailed Material Lines',
      value: fmt(data.counts.detailedRows),
      sub:
        data.counts.transitRows > 0
          ? isFa
            ? `${fmt(data.counts.transitRows)} مورد در راه`
            : `${fmt(data.counts.transitRows)} in-transit`
          : undefined,
    },
    {
      label: t.headers.mapnaInventory,
      value: fmt(data.totals.mapnaInventorySum),
      sub:
        data.totals.contractorInventorySum > 0
          ? `${t.headers.contractorInventory}: ${fmt(data.totals.contractorInventorySum)}`
          : undefined,
      tone: 'accent',
    },
    ...(data.counts.shortageItemsCount > 0
      ? [
          {
            label: isFa ? 'اقلام دارای کسری' : 'Items with Shortage',
            value: fmt(data.counts.shortageItemsCount),
            sub: `${t.headers.shortage}: ${fmt(data.totals.shortageSum)}`,
            tone: 'danger' as const,
          },
        ]
      : []),
    ...(data.counts.damagedItemsCount > 0
      ? [
          {
            label: isFa ? 'اقلام آسیب‌دیده' : 'Damaged Items',
            value: fmt(data.counts.damagedItemsCount),
            sub: `${t.headers.damagedQty}: ${fmt(data.totals.damagedQtySum)}`,
            tone: 'danger' as const,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between"
          >
            <div className="text-xs font-medium text-[var(--text-secondary)]">{k.label}</div>
            <div
              className={`mt-2 text-2xl font-bold tabular-nums ${
                k.tone === 'danger'
                  ? 'text-[var(--status-danger)]'
                  : k.tone === 'accent'
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-primary)]'
              }`}
            >
              {k.value}
            </div>
            {k.sub && (
              <div className="mt-1 text-[11px] text-[var(--text-muted)] tabular-nums">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend in Active Calendar */}
        <div className="lg:col-span-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold">
                {isFa ? 'روند ورود ماهانه اقلام' : 'Monthly Arrival Activity'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {prefs.calendar === 'jalali'
                  ? isFa
                    ? 'گروه‌بندی خودکار بر اساس ماه‌های هجری شمسی'
                    : 'Grouped dynamically by Jalali calendar months'
                  : isFa
                    ? 'گروه‌بندی خودکار بر اساس ماه‌های میلادی'
                    : 'Grouped dynamically by Gregorian calendar months'}
              </p>
            </div>
          </div>

          {data.monthlyTrend.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              {t.controls.noData}
            </div>
          ) : (
            <div className="space-y-3">
              {data.monthlyTrend.map((m) => {
                const total = m.generalRows + m.detailedRows;
                const pct = Math.max(4, Math.round((total / maxTrendVal) * 100));
                return (
                  <div key={m.monthKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">
                        {formatMonthLabel(m.monthKey, prefs.calendar, prefs.language)}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {m.generalRows > 0 && `${isFa ? 'کلی:' : 'General:'} ${fmt(m.generalRows)}`}
                        {m.generalRows > 0 && m.detailedRows > 0 && ' · '}
                        {m.detailedRows > 0 && `${isFa ? 'جزئیات:' : 'Detail:'} ${fmt(m.detailedRows)}`}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transit Pipeline & Totals */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5">
          <div>
            <h3 className="text-sm font-bold mb-3">
              {isFa ? 'وضعیت محموله‌های در راه' : 'In-Transit Pipeline'}
            </h3>
            {data.transitByStatus.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">{t.controls.noData}</p>
            ) : (
              <div className="space-y-2">
                {data.transitByStatus.map((row) => (
                  <div
                    key={row.status}
                    className="flex items-center justify-between py-1.5 border-b border-[var(--border-subtle)] last:border-0 text-xs"
                  >
                    <span className="font-medium text-[var(--text-secondary)]">{row.status}</span>
                    <span className="font-bold tabular-nums">{fmt(row.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(data.totals.grossWeightSum > 0 || data.totals.freightCostSum > 0) && (
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2 text-xs">
              <h4 className="font-bold text-[var(--text-primary)]">
                {isFa ? 'خلاصه وزن و حمل' : 'Weight & Freight Totals'}
              </h4>
              {data.totals.grossWeightSum > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{t.headers.grossWeight}</span>
                  <span className="font-semibold tabular-nums">{fmt(data.totals.grossWeightSum)}</span>
                </div>
              )}
              {data.totals.netWeightSum > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{t.headers.netWeight}</span>
                  <span className="font-semibold tabular-nums">{fmt(data.totals.netWeightSum)}</span>
                </div>
              )}
              {data.totals.freightCostSum > 0 && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">{t.headers.freightCost}</span>
                  <span className="font-semibold tabular-nums text-[var(--accent-primary)]">
                    {fmt(data.totals.freightCostSum)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Island Breakdown Table (Hides empty columns/zeroes cleanly) */}
      {data.byIsland.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {isFa ? 'تفکیک موجودی بر اساس جزیره' : 'Inventory by Island'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 text-start font-semibold">{t.headers.island}</th>
                  <th className="py-2.5 px-4 text-end font-semibold">
                    {isFa ? 'ردیف‌های کلی' : 'General Rows'}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold">
                    {isFa ? 'ردیف‌های جزئیات' : 'Detailed Rows'}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold">{t.headers.mapnaInventory}</th>
                  <th className="py-2.5 px-4 text-end font-semibold">
                    {t.headers.contractorInventory}
                  </th>
                  {data.byIsland.some((i) => i.shortageQty > 0) && (
                    <th className="py-2.5 px-4 text-end font-semibold text-[var(--status-danger)]">
                      {t.headers.shortage}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.byIsland.map((isl) => (
                  <tr key={isl.name} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-semibold">{isl.name}</td>
                    <td className="py-2.5 px-4 text-end tabular-nums">
                      {isl.generalCount > 0 ? fmt(isl.generalCount) : ''}
                    </td>
                    <td className="py-2.5 px-4 text-end tabular-nums">
                      {isl.detailedCount > 0 ? fmt(isl.detailedCount) : ''}
                    </td>
                    <td className="py-2.5 px-4 text-end tabular-nums font-medium text-[var(--accent-primary)]">
                      {isl.mapnaStock > 0 ? fmt(isl.mapnaStock) : ''}
                    </td>
                    <td className="py-2.5 px-4 text-end tabular-nums">
                      {isl.contractorStock > 0 ? fmt(isl.contractorStock) : ''}
                    </td>
                    {data.byIsland.some((i) => i.shortageQty > 0) && (
                      <td className="py-2.5 px-4 text-end tabular-nums font-semibold text-[var(--status-danger)]">
                        {isl.shortageQty > 0 ? fmt(isl.shortageQty) : ''}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shortage & Damaged Alerts (Only rendered when items exist, hiding empty fields) */}
      {(data.topShortages.length > 0 || data.topDamaged.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.topShortages.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-danger)]">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isFa ? 'اقلام دارای کسری فعال' : 'Active Shortage Alerts'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('detailed')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                >
                  <span>{isFa ? 'مشاهده همه' : 'View All'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {data.topShortages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onInspectDetailedShipment(item.shipmentNo)}
                    className="w-full px-5 py-3 text-start hover:bg-[var(--bg-subtle)]/60 flex items-center justify-between gap-4 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate bidi-plaintext">
                        {item.description || item.generalDescription}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums flex flex-wrap gap-x-2 bidi-plaintext">
                        <span dir="ltr">{item.shipmentNo}</span>
                        {item.packageNo && <span dir="ltr">· {item.packageNo}</span>}
                        {item.arrivalDate && <span dir="ltr">· {formatDate(item.arrivalDate)}</span>}
                        {item.mtoRef && <span dir="ltr">· MTO: {item.mtoRef}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-bold tabular-nums">
                        {t.headers.shortage}: {fmt(item.shortage)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.topDamaged.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-warning)]">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{isFa ? 'اقلام آسیب‌دیده ثبت‌شده' : 'Damaged Items'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('detailed')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1"
                >
                  <span>{isFa ? 'مشاهده همه' : 'View All'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {data.topDamaged.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onInspectDetailedShipment(item.shipmentNo)}
                    className="w-full px-5 py-3 text-start hover:bg-[var(--bg-subtle)]/60 flex items-center justify-between gap-4 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {item.description || item.generalDescription}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                        {item.shipmentNo}
                        {item.packageNo ? ` · ${item.packageNo}` : ''}
                        {item.arrivalDate ? ` · ${formatDate(item.arrivalDate)}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs font-bold tabular-nums">
                      {t.headers.damagedQty}: {fmt(item.damagedQty || 0)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
