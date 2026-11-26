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
import type { OpenOpiInvitationItem } from '../shared/opiInvitation.ts';
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
    openOpiCount?: number;
  };
  totals: SelectionFormulaSummary & {
    grossWeightTons?: number;
    netWeightTons?: number;
  };
  transitByStatus: { status: string; count: number }[];
  openOpiInvitations?: OpenOpiInvitationItem[];
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
      <div className="samaan-animate-in rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-10 text-center max-w-2xl mx-auto my-8 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mx-auto">
          <PackageCheck className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold tracking-tight">{t.brandFull}</h3>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-lg mx-auto">
          {t.controls.emptyStartHint}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {(user?.role === 'admin' || user?.role === 'operator') && (
            <>
              <button
                type="button"
                onClick={onOpenNewPacking}
                className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2 shadow-[0_1px_2px_rgba(13,122,114,0.28)] transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t.controls.newPacking}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('backup')}
                className="h-10 px-5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-2 transition-colors"
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

  const primaryKpis = kpis.slice(0, 4);
  const secondaryKpis = kpis.slice(4, 8);

  const renderUnifiedStrip = (
    items: typeof kpis,
    keyPrefix: string,
  ) => (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((k, idx) => {
          const dotColor =
            k.tone === 'danger'
              ? 'bg-[var(--status-danger)]'
              : k.tone === 'warning'
                ? 'bg-[var(--status-warning)]'
                : k.tone === 'accent'
                  ? 'bg-[var(--accent-primary)]'
                  : 'bg-[var(--border-strong)]';
          const cellBorder = [
            idx < 3 ? 'border-b sm:border-b-0' : '',
            idx < 2 ? 'sm:border-b lg:border-b-0' : '',
            idx % 2 === 0 ? 'sm:border-e' : '',
            idx < 3 ? 'lg:border-e' : 'lg:border-e-0',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={`${keyPrefix}-${k.label}`}
              className={`min-w-0 px-5 py-4.5 flex flex-col justify-between border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]/35 transition-colors ${cellBorder}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
                <span className="text-xs font-medium text-[var(--text-secondary)] leading-snug truncate">
                  {k.label}
                </span>
              </div>
              <div
                className={`mt-2.5 font-bold tracking-tight tabular-nums break-words ${
                  k.compactValue || k.value.length > 10 ? 'text-xl sm:text-[22px] leading-tight' : 'text-2xl sm:text-[26px] leading-none'
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
              {k.sub ? (
                <div className="mt-1.5 text-[11px] text-[var(--text-muted)] tabular-nums break-words">
                  {k.sub}
                </div>
              ) : (
                <div className="mt-1.5 text-[11px] text-transparent select-none" aria-hidden="true">
                  ·
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const getTransitStatusDot = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('رسیده') || s.includes('arriv')) return 'bg-[var(--status-success)]';
    if (s.includes('ارسال') || s.includes('ship') || s.includes('transit')) return 'bg-[var(--status-warning)]';
    return 'bg-[var(--accent-primary)]';
  };

  return (
    <div className="space-y-5 samaan-animate-in">
      {/* Unified Single-Elevation KPI Strips */}
      <div className="space-y-3.5">
        {renderUnifiedStrip(primaryKpis, 'primary')}
        {renderUnifiedStrip(secondaryKpis, 'secondary')}
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly Trend in Active Calendar */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">
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
                  className="h-8 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold tabular-nums"
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
            <div className="space-y-2">
              {activeMonthlyTrend.map((m) => {
                const total = m.generalRows + m.detailedRows;
                const pct = total > 0 ? Math.max(4, Math.round((total / maxTrendVal) * 100)) : 0;
                return (
                  <div key={m.monthKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={total > 0 ? 'font-semibold text-[var(--text-primary)]' : 'font-normal text-[var(--text-muted)]'}>
                        {formatMonthLabel(m.monthKey, prefs.calendar, prefs.language)}
                      </span>
                      <span className={`text-[11px] tabular-nums ${total > 0 ? 'font-semibold text-[var(--accent-primary)]' : 'text-[var(--text-muted)]/70'}`}>
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
                    <div className="h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Stack: Transit Pipeline + Open OPI Invitations */}
        <div className="flex flex-col gap-5">
          {/* Transit Pipeline */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-5 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-bold tracking-tight">
                {isFa ? 'وضعیت محموله‌های در راه' : 'In-Transit Pipeline'}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('transit')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-0.5"
              >
                <span>{isFa ? 'جزئیات' : 'Details'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {data.transitByStatus.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-6 text-xs text-[var(--text-muted)]">
                {t.controls.noData}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {data.transitByStatus.map((row) => (
                  <div
                    key={row.status}
                    className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getTransitStatusDot(row.status)}`} />
                      <span className="font-medium text-[var(--text-secondary)] truncate">{row.status}</span>
                    </div>
                    <span className="font-bold text-sm text-[var(--text-primary)] tabular-nums">
                      {fmt(row.count)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open OPI Invitations (دعوتنامه‌های باز) */}
          <div
            data-testid="dashboard-open-opi-section"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-5 flex flex-col flex-1"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    (data.openOpiInvitations?.length || 0) > 0
                      ? 'bg-[var(--status-warning)]'
                      : 'bg-[var(--status-success)]'
                  }`}
                />
                <h3 className="text-sm font-bold tracking-tight truncate">
                  {isFa
                    ? `دعوتنامه‌های باز (${fmt(data.openOpiInvitations?.length || 0)})`
                    : `Open OPI Invitations (${fmt(data.openOpiInvitations?.length || 0)})`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('opi')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-0.5 shrink-0"
              >
                <span>{isFa ? 'دعوتنامه‌ها' : 'Invitations'}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {!data.openOpiInvitations || data.openOpiInvitations.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-6 text-xs text-[var(--text-muted)] text-center">
                {isFa ? 'هیچ دعوتنامه بازی وجود ندارد.' : 'No open OPI invitations.'}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)] max-h-64 overflow-y-auto">
                {data.openOpiInvitations.map((inv) => (
                  <div
                    key={inv.invitationNo}
                    data-testid="dashboard-open-opi-row"
                    className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div
                        dir="ltr"
                        className="font-mono font-bold text-[var(--text-primary)] truncate text-left"
                      >
                        {inv.invitationNo}
                      </div>
                      {inv.missingDetailedPackings.length > 0 && (
                        <div
                          className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 bidi-plaintext"
                          title={inv.missingDetailedPackings.join('، ')}
                        >
                          {isFa ? 'پکینگ:' : 'Packing:'}{' '}
                          <span dir="ltr" className="tabular-nums">
                            {inv.missingDetailedPackings.join('، ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      dir="ltr"
                      className="text-[11.5px] font-semibold text-[var(--text-secondary)] tabular-nums shrink-0"
                    >
                      {inv.date ? formatDate(inv.date) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Monitoring Panels (Shortages, Expiring Chemicals, Replaced, Discrepancy/Damaged) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* اقلام دارای کسری فعال */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--status-danger)]" />
              <AlertTriangle className="w-4 h-4 text-[var(--status-danger)]" />
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

        {/* مواد شیمیایی منقضی‌شده و در شرف انقضا */}
        {(() => {
          const expiredCount = expiringChemicals.filter((c) => c.daysRemaining < 0).length;
          const nearCount = expiringChemicals.length - expiredCount;
          return (
            <div
              data-testid="dashboard-chemicals-card"
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden"
            >
              <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <FlaskConical className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
                  <span>
                    {isFa
                      ? `مواد شیمیایی منقضی‌شده و در شرف انقضا (${fmt(expiringChemicals.length)})`
                      : `Expired & Expiring Chemicals (${fmt(expiringChemicals.length)})`}
                  </span>
                  {expiredCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600/15 text-rose-700 dark:text-rose-300 border border-rose-600/30 text-[11px] font-bold tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                      {isFa ? `${fmt(expiredCount)} منقضی` : `${fmt(expiredCount)} expired`}
                    </span>
                  )}
                  {nearCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 text-[11px] font-bold tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {isFa ? `${fmt(nearCount)} در شرف انقضا` : `${fmt(nearCount)} expiring soon`}
                    </span>
                  )}
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
                  {isFa
                    ? 'ماده شیمیایی موجود در انبار که منقضی یا در شرف انقضا باشد، یافت نشد.'
                    : 'No in-stock expired or expiring chemicals found.'}
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] max-h-[340px] overflow-y-auto">
                  {expiringChemicals.map((chem) => {
                    const isExpired = chem.daysRemaining < 0;
                    return (
                      <button
                        key={chem.id}
                        type="button"
                        onClick={() => onInspectDetailedShipment(chem.shipmentNo)}
                        className={`w-full px-5 py-3 text-start flex items-center justify-between gap-4 transition-colors border-s-4 ${
                          isExpired
                            ? 'border-s-rose-600 bg-rose-500/[0.04] hover:bg-rose-500/[0.09]'
                            : 'border-s-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.09]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate bidi-plaintext text-[var(--text-primary)]">
                            {chem.description || chem.chemicalType || '-'}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums flex flex-wrap gap-x-2 bidi-plaintext">
                            <span dir="ltr">{chem.shipmentNo}</span>
                            {chem.packageNo && <span dir="ltr">· {chem.packageNo}</span>}
                            {chem.itemNo && <span dir="ltr">· #{chem.itemNo}</span>}
                            {chem.expirationDate && <span dir="ltr">· {formatDate(chem.expirationDate)}</span>}
                            {chem.chemicalType && chem.description && chem.chemicalType !== chem.description && (
                              <span>· {chem.chemicalType}</span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-0.5 rounded-md text-xs font-bold tabular-nums ${
                            isExpired
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {isExpired
                            ? isFa
                              ? `منقضی (${fmt(Math.abs(chem.daysRemaining))} روز)`
                              : `Expired (${fmt(Math.abs(chem.daysRemaining))}d)`
                            : chem.daysRemaining === 0
                              ? isFa
                                ? 'انقضاء امروز'
                                : 'Expires Today'
                              : isFa
                                ? `${fmt(chem.daysRemaining)} روز مانده`
                                : `${fmt(chem.daysRemaining)}d left`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* اقلام جایگزین شده فعال */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />
              <ClipboardList className="w-4 h-4 text-[var(--status-warning)]" />
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
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />
              <ClipboardList className="w-4 h-4 text-[var(--status-warning)]" />
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
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-x-clip">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-tight">
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
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="w-2 h-2 rounded-full bg-[var(--status-warning)]" />
              <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
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
