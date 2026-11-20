import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ClipboardList,
  FileSpreadsheet,
  FlaskConical,
  PackageCheck,
  Plus,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { buildYearMonths, formatDisplayNumber, formatMonthLabel } from '../shared/jalali.ts';
import { formatCountingUnit } from '../shared/normalizers.ts';
import type {
  DetailedComputed,
  ExpiringChemicalNotice,
  SelectionFormulaSummary,
} from '../shared/types.ts';
import type { NavTabKey } from './Layout.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface OpenMerRepItem extends DetailedComputed {
  countingUnit: string;
}

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
    openMerCount?: number;
    openRepCount?: number;
    expiringChemicalsCount?: number;
  };
  totals: SelectionFormulaSummary & {
    grossWeightTons?: number;
    netWeightTons?: number;
  };
  transitByStatus: { status: string; count: number }[];
  byIsland: {
    name: string;
    generalCount: number;
    detailedCount: number;
    shortageQty: number;
    shortageRowCount?: number;
    mapnaStock: number;
    contractorStock: number;
  }[];
  availableYears?: string[];
  selectedYear?: string;
  allMonthlyBuckets?: {
    monthKey: string;
    generalRows: number;
    detailedRows: number;
    grossWeight: number;
  }[];
  monthlyTrend: {
    monthKey: string;
    generalRows: number;
    detailedRows: number;
    grossWeight: number;
  }[];
  topShortages: DetailedComputed[];
  topDamaged: DetailedComputed[];
  openMerItems?: OpenMerRepItem[];
  openRepItems?: OpenMerRepItem[];
  expiringChemicals?: ExpiringChemicalNotice[];
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
  const [selectedYear, setSelectedYear] = useState<string>('');
  const byIslandList = useMemo(() => data?.byIsland || [], [data]);
  const islandPagination = useClientPagination(byIslandList, 25);

  useEffect(() => {
    setLoading(true);
    apiRequest<AnalyticsPayload>(`/api/analytics?calendar=${prefs.calendar}`)
      .then((res) => {
        setData(res);
        setSelectedYear((prev) => {
          if (prev && res.availableYears?.includes(prev)) return prev;
          return res.selectedYear || res.availableYears?.[0] || '';
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prefs.calendar, refreshSignal]);

  const fmt = (n: number, maxFrac = 2) =>
    formatDisplayNumber(n, prefs.language, { maximumFractionDigits: maxFrac });

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
                onClick={() => onNavigate('backup')}
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

  const grossTons = data.totals.grossWeightTons ?? (data.totals.grossWeightSum || 0) / 1000;
  const netTons = data.totals.netWeightTons ?? (data.totals.netWeightSum || 0) / 1000;
  const openMerCount = data.counts.openMerCount ?? data.totals.openMerCount ?? 0;
  const openRepCount = data.counts.openRepCount ?? data.totals.openRepCount ?? 0;
  const openMerItems = data.openMerItems || [];
  const openRepItems = data.openRepItems || [];
  const expiringChemicals = data.expiringChemicals || data.totals.expiringChemicals || [];

  const availableYears = data.availableYears || [];
  const activeYear =
    selectedYear && availableYears.includes(selectedYear)
      ? selectedYear
      : data.selectedYear || availableYears[0] || '';

  const activeMonthlyTrend = (() => {
    if (activeYear && data.allMonthlyBuckets) {
      const byMk = new Map(data.allMonthlyBuckets.map((m) => [m.monthKey, m]));
      return buildYearMonths(activeYear, prefs.calendar).map(
        (mk) => byMk.get(mk) || { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 },
      );
    }
    return data.monthlyTrend;
  })();

  const maxTrendVal = Math.max(
    1,
    ...activeMonthlyTrend.map((m) => m.generalRows + m.detailedRows),
  );

  const kpis: { label: string; value: string; sub?: string; tone?: 'danger' | 'warning' | 'accent'; compactValue?: boolean }[] = [
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
      label: isFa ? 'شماره نگله‌های یکتا' : 'Unique Package Numbers',
      value: fmt(data.counts.uniquePackages),
    },
    {
      label: isFa ? 'ردیف‌های کلی تجهیزات' : 'General Equipment Rows',
      value: fmt(data.counts.generalRows),
    },
    {
      label: isFa ? 'ردیف‌های جزئیات تجهیزات' : 'Detailed Equipment Rows',
      value: fmt(data.counts.detailedRows),
    },
    {
      label: isFa ? 'جمع وزن خالص (تن)' : 'Total Net Weight (Tons)',
      value: `${fmt(netTons, 3)} ${isFa ? 'تن' : 't'}`,
      sub: isFa
        ? `وزن ناخالص: ${fmt(grossTons, 3)} تن`
        : `Gross Weight: ${fmt(grossTons, 3)} tons`,
      tone: 'accent',
      compactValue: true,
    },
    {
      label: isFa ? 'اقلام دارای کسری' : 'Items with Shortage',
      value: fmt(data.counts.shortageItemsCount),
      tone: data.counts.shortageItemsCount > 0 ? 'danger' : undefined,
    },
    {
      label: isFa ? 'اقلام دارای مغایرت یا آسیب‌دیدگی' : 'Discrepancy / Damaged Items',
      value: fmt(openMerCount),
      tone: openMerCount > 0 ? 'warning' : undefined,
    },
    {
      label: isFa ? 'اقلام جایگزین شده' : 'Replaced Items',
      value: fmt(openRepCount),
      tone: openRepCount > 0 ? 'warning' : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-col justify-between overflow-hidden"
          >
            <div className="text-xs font-medium text-[var(--text-secondary)] leading-snug">{k.label}</div>
            <div
              className={`mt-2 font-bold tabular-nums break-words ${
                k.compactValue || k.value.length > 10 ? 'text-lg sm:text-xl leading-tight' : 'text-2xl'
              } ${
                k.tone === 'danger'
                  ? 'text-[var(--status-danger)]'
                  : k.tone === 'warning'
                    ? 'text-[var(--status-warning)]'
                    : k.tone === 'accent'
                      ? 'text-[var(--accent-primary)]'
                      : 'text-[var(--text-primary)]'
              }`}
            >
              {k.value}
            </div>
            {k.sub && (
              <div className="mt-1 text-[11px] text-[var(--text-muted)] tabular-nums break-words">{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Chemical Expiration Warning Alert */}
      {expiringChemicals.length > 0 && (
        <div className="rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-danger)]">
              <FlaskConical className="w-4 h-4 shrink-0" />
              <span>
                {isFa
                  ? `هشدار انقضای مواد شیمیایی (${fmt(expiringChemicals.length)} قلم زیر یک ماه تا انقضاء)`
                  : `Chemical Expiration Warnings (${fmt(expiringChemicals.length)} item(s) < 1 month)`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('detailed')}
              className="text-xs font-semibold text-[var(--status-danger)] hover:underline flex items-center gap-1"
            >
              <span>{isFa ? 'بررسی در جزئیات' : 'Review in Detailed'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {expiringChemicals.slice(0, 6).map((chem) => (
              <button
                key={chem.id}
                type="button"
                onClick={() => onInspectDetailedShipment(chem.shipmentNo)}
                className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-danger)]/30 text-start hover:bg-[var(--bg-subtle)]/70 flex items-center justify-between gap-2 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{chem.chemicalType || chem.description}</div>
                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums" dir="ltr">
                    {chem.shipmentNo} · {chem.packageNo || '-'} · #{chem.itemNo || '-'}
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded bg-[var(--status-danger)] text-white text-[11px] font-bold tabular-nums">
                  {chem.daysRemaining < 0
                    ? isFa
                      ? `منقضی (${fmt(Math.abs(chem.daysRemaining))} روز)`
                      : `Expired`
                    : isFa
                      ? `${fmt(chem.daysRemaining)} روز`
                      : `${fmt(chem.daysRemaining)}d`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend in Active Calendar */}
        <div className="lg:col-span-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold">
                {isFa ? 'روند ورود ماهانه اقلام' : 'Monthly Arrival Activity'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {prefs.calendar === 'jalali'
                  ? isFa
                    ? 'گروه‌بندی بر اساس ۱۲ ماه سال هجری شمسی'
                    : '12-month view by Jalali calendar year'
                  : isFa
                    ? 'گروه‌بندی بر اساس ۱۲ ماه سال میلادی'
                    : '12-month view by Gregorian calendar year'}
              </p>
            </div>
            {availableYears.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-muted)]">
                  {isFa ? 'سال:' : 'Year:'}
                </label>
                <select
                  aria-label={isFa ? 'انتخاب سال روند ماهانه' : 'Select Year'}
                  value={activeYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold tabular-nums"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeMonthlyTrend.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              {t.controls.noData}
            </div>
          ) : (
            <div className="space-y-3">
              {activeMonthlyTrend.map((m) => {
                const total = m.generalRows + m.detailedRows;
                const pct = total > 0 ? Math.max(4, Math.round((total / maxTrendVal) * 100)) : 0;
                return (
                  <div key={m.monthKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">
                        {formatMonthLabel(m.monthKey, prefs.calendar, prefs.language)}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {total === 0 ? (
                          isFa ? '۰' : '0'
                        ) : (
                          <>
                            {m.generalRows > 0 && `${isFa ? 'کلی:' : 'General:'} ${fmt(m.generalRows)}`}
                            {m.generalRows > 0 && m.detailedRows > 0 && ' · '}
                            {m.detailedRows > 0 && `${isFa ? 'جزئیات:' : 'Detail:'} ${fmt(m.detailedRows)}`}
                          </>
                        )}
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

        {/* Transit Pipeline */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
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
        </div>
      </div>

      {/* Active Monitoring Panels (Shortages, Expiring Chemicals, Replaced, Discrepancy/Damaged) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* اقلام دارای کسری فعال */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-danger)]">
              <AlertTriangle className="w-4 h-4" />
              <span>
                {isFa
                  ? `اقلام دارای کسری فعال (${fmt(data.counts.shortageItemsCount)})`
                  : `Active Shortage Items (${fmt(data.counts.shortageItemsCount)})`}
              </span>
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
          {data.topShortages.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
              {isFa ? 'اقلام دارای کسری فعالی یافت نشد.' : 'No active shortage items.'}
            </div>
          ) : (
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
                      {item.countingUnit ? ` ${formatCountingUnit(item.countingUnit, prefs.language)}` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* مواد شیمیایی با تاریخ انقضای زیر یک ماه */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-danger)]">
              <FlaskConical className="w-4 h-4" />
              <span>
                {isFa
                  ? `مواد شیمیایی با تاریخ انقضای زیر یک ماه (${fmt(expiringChemicals.length)})`
                  : `Chemicals Expiring Within 1 Month (${fmt(expiringChemicals.length)})`}
              </span>
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
          {expiringChemicals.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
              {isFa ? 'ماده شیمیایی با انقضای زیر یک ماه یافت نشد.' : 'No chemicals expiring within 1 month.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {expiringChemicals.map((chem) => (
                <button
                  key={chem.id}
                  type="button"
                  onClick={() => onInspectDetailedShipment(chem.shipmentNo)}
                  className="w-full px-5 py-3 text-start hover:bg-[var(--bg-subtle)]/60 flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate bidi-plaintext">
                      {chem.chemicalType || chem.description}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums flex flex-wrap gap-x-2 bidi-plaintext">
                      <span dir="ltr">{chem.shipmentNo}</span>
                      {chem.packageNo && <span dir="ltr">· {chem.packageNo}</span>}
                      {chem.itemNo && <span dir="ltr">· #{chem.itemNo}</span>}
                      {chem.expirationDate && <span dir="ltr">· {formatDate(chem.expirationDate)}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-bold tabular-nums">
                    {chem.daysRemaining < 0
                      ? isFa
                        ? `منقضی (${fmt(Math.abs(chem.daysRemaining))} روز)`
                        : `Expired (${fmt(Math.abs(chem.daysRemaining))}d)`
                      : isFa
                        ? `${fmt(chem.daysRemaining)} روز مانده`
                        : `${fmt(chem.daysRemaining)}d left`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* اقلام جایگزین شده فعال */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-warning)]">
              <ClipboardList className="w-4 h-4" />
              <span>
                {isFa
                  ? `اقلام جایگزین شده فعال (${fmt(openRepCount)})`
                  : `Active Replaced Items (${fmt(openRepCount)})`}
              </span>
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
          {openRepItems.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
              {isFa ? 'اقلام جایگزین‌شده فعالی یافت نشد.' : 'No active replaced items.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {openRepItems.map((item) => {
                const qtyVal = item.effectiveActualQty || item.packingQty || 0;
                return (
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
                        {item.repNo && <span dir="ltr">· REP: {item.repNo}</span>}
                        {item.repStatus && <span>· {item.repStatus}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs font-bold tabular-nums">
                      {isFa ? `تعداد: ${fmt(qtyVal)}` : `Qty: ${fmt(qtyVal)}`}
                      {item.countingUnit ? ` ${formatCountingUnit(item.countingUnit, prefs.language)}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* اقلام دارای مغایرت یا آسیب‌دیدگی فعال */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--status-warning)]">
              <ClipboardList className="w-4 h-4" />
              <span>
                {isFa
                  ? `اقلام دارای مغایرت یا آسیب‌دیدگی فعال (${fmt(openMerCount)})`
                  : `Active Discrepancy or Damaged Items (${fmt(openMerCount)})`}
              </span>
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
          {openMerItems.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">
              {isFa ? 'اقلام دارای مغایرت یا آسیب‌دیدگی فعالی یافت نشد.' : 'No active discrepancy or damaged items.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {openMerItems.map((item) => {
                const qtyVal =
                  (item.damagedQty && item.damagedQty > 0 ? item.damagedQty : 0) ||
                  (item.shortage && item.shortage > 0 ? item.shortage : 0) ||
                  item.effectiveActualQty ||
                  item.packingQty ||
                  0;
                return (
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
                        {item.merNo && <span dir="ltr">· MER: {item.merNo}</span>}
                        {item.merStatus && <span>· {item.merStatus}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs font-bold tabular-nums">
                      {isFa ? `تعداد: ${fmt(qtyVal)}` : `Qty: ${fmt(qtyVal)}`}
                      {item.countingUnit ? ` ${formatCountingUnit(item.countingUnit, prefs.language)}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Island Breakdown Table */}
      {data.byIsland.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-bold">
              {isFa ? 'تفکیک اقلام و موجودی بر اساس جزیره' : 'Breakdown by Island'}
            </h3>
          </div>
          <StickyTableWrapper>
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-4 text-start font-semibold whitespace-nowrap">{t.headers.island}</th>
                  <th className="py-2.5 px-4 text-end font-semibold whitespace-nowrap">
                    {isFa ? 'ردیف‌های کلی' : 'General Rows'}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold whitespace-nowrap">
                    {isFa ? 'ردیف‌های جزئیات' : 'Detailed Rows'}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold text-[var(--status-danger)] whitespace-nowrap">
                    {isFa ? 'تعداد ردیف دارای کسری' : 'Shortage Rows Count'}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold whitespace-nowrap">
                    {t.headers.mapnaInventory}
                  </th>
                  <th className="py-2.5 px-4 text-end font-semibold whitespace-nowrap">
                    {t.headers.contractorInventory}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {islandPagination.pageItems.map((isl) => {
                  const rowShortageCount = isl.shortageRowCount ?? 0;
                  return (
                    <tr key={isl.name} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="py-2.5 px-4 font-semibold whitespace-nowrap">{isl.name}</td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {fmt(isl.generalCount)}
                      </td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {fmt(isl.detailedCount)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-end tabular-nums font-semibold ${
                          rowShortageCount > 0 ? 'text-[var(--status-danger)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {fmt(rowShortageCount)}
                      </td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {fmt(isl.mapnaStock)}
                      </td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {fmt(isl.contractorStock)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </StickyTableWrapper>
          <TablePaginationBar
            page={islandPagination.page}
            totalPages={islandPagination.totalPages}
            total={islandPagination.total}
            pageSize={islandPagination.pageSize}
            onPageChange={islandPagination.setPage}
            onPageSizeChange={islandPagination.setPageSize}
            lang={prefs.language}
            compact
          />
        </div>
      )}

      {/* Damaged Items Summary if any */}
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
                  {item.countingUnit ? ` ${formatCountingUnit(item.countingUnit, prefs.language)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
