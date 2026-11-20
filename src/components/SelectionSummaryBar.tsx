import React from 'react';
import { AlertTriangle, Calculator, FlaskConical, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatDisplayNumber } from '../shared/jalali.ts';
import type { SelectionFormulaSummary } from '../shared/types.ts';

interface SelectionSummaryBarProps {
  scope: 'general' | 'detailed' | 'transit';
  selectedCount: number;
  summary: SelectionFormulaSummary;
  isFilteredFallback: boolean;
  onClearSelection: () => void;
  onPrintSelected?: () => void;
}

function fmtNum(n: number, lang: 'fa' | 'en'): string {
  return formatDisplayNumber(n, lang, { maximumFractionDigits: 3 });
}

const SelectionSummaryBarInner: React.FC<SelectionSummaryBarProps> = ({
  scope,
  selectedCount,
  summary,
  isFilteredFallback,
  onClearSelection,
  onPrintSelected,
}) => {
  const { prefs, t, formatDate } = useApp();
  const isFa = prefs.language === 'fa';

  const metrics: { label: string; value: number; unit?: string; highlight?: 'danger' | 'warning' | 'accent' }[] = [];

  if (scope === 'general') {
    metrics.push({
      label: t.headers.grossWeight,
      value: summary.grossWeightSum,
      unit: isFa ? 'کیلوگرم' : 'kg',
    });
    metrics.push({
      label: t.headers.netWeight,
      value: summary.netWeightSum,
      unit: isFa ? 'کیلوگرم' : 'kg',
    });
    if (summary.freightCostSum) {
      metrics.push({
        label: t.headers.freightCost,
        value: summary.freightCostSum,
        unit: isFa ? 'ریال' : 'IRR',
        highlight: 'accent',
      });
    }
  } else if (scope === 'detailed') {
    metrics.push({
      label: isFa ? 'دارای وضعیت MER باز' : 'Open MER Items',
      value: summary.openMerCount ?? 0,
      highlight: (summary.openMerCount ?? 0) > 0 ? 'warning' : undefined,
    });
    metrics.push({
      label: isFa ? 'دارای وضعیت REP باز' : 'Open REP Items',
      value: summary.openRepCount ?? 0,
      highlight: (summary.openRepCount ?? 0) > 0 ? 'warning' : undefined,
    });
    metrics.push({
      label: isFa ? 'دارای کسری و یا آسیب' : 'Shortage / Damaged Items',
      value: summary.shortageOrDamagedCount ?? 0,
      highlight: (summary.shortageOrDamagedCount ?? 0) > 0 ? 'danger' : undefined,
    });
    if (summary.damagedQtySum) {
      metrics.push({ label: t.headers.damagedQty, value: summary.damagedQtySum, highlight: 'danger' });
    }
    metrics.push({
      label: t.headers.packingQty,
      value: summary.uniquePackingsCount ?? 0,
      unit: isFa ? 'پکینگ' : 'packings',
    });
  } else {
    metrics.push({
      label: isFa ? 'پکینگ‌های رسیده' : 'Arrived Packings',
      value: summary.transitArrivedPackingsCount ?? 0,
      highlight: (summary.transitArrivedPackingsCount ?? 0) > 0 ? 'accent' : undefined,
    });
    metrics.push({
      label: isFa ? 'پکینگ‌های در دست ارسال' : 'In-Transit Packings',
      value: summary.transitShippingPackingsCount ?? 0,
      highlight: (summary.transitShippingPackingsCount ?? 0) > 0 ? 'warning' : undefined,
    });
    metrics.push({
      label: isFa ? 'پکینگ‌های در دست بازرسی' : 'Under Inspection Packings',
      value: summary.transitInspectionPackingsCount ?? 0,
    });
    if (summary.transitAmountSum) {
      metrics.push({ label: t.headers.amount, value: summary.transitAmountSum, highlight: 'accent' });
    }
  }

  const expiringChemicals = scope === 'detailed' ? summary.expiringChemicals || [] : [];
  const packingsByIsland = scope === 'general' ? summary.packingsByIsland || [] : [];

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] px-4.5 py-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-primary)]">
            <Calculator className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">
              {isFilteredFallback
                ? isFa
                  ? `خروجی فرمول کل نتایج فیلتر (${fmtNum(summary.count, prefs.language)} ردیف)`
                  : `Filtered Totals (${fmtNum(summary.count, prefs.language)} rows)`
                : isFa
                  ? `خروجی فرمول ردیف‌های منتخب (${fmtNum(selectedCount, prefs.language)} ردیف)`
                  : `Selected Rows Formula Output (${fmtNum(selectedCount, prefs.language)} rows)`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {metrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5 text-xs">
                <span className="text-[var(--text-muted)]">{m.label}:</span>
                <span
                  className={`font-bold tabular-nums ${
                    m.highlight === 'danger'
                      ? 'text-[var(--status-danger)]'
                      : m.highlight === 'warning'
                        ? 'text-[var(--status-warning)]'
                        : m.highlight === 'accent'
                          ? 'text-[var(--accent-primary)]'
                          : 'text-[var(--text-primary)]'
                  }`}
                >
                  {fmtNum(m.value, prefs.language)}
                  {m.unit ? ` ${m.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isFilteredFallback && (
            <button
              type="button"
              onClick={onClearSelection}
              className="h-8 px-3 rounded-xl border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] flex items-center gap-1 whitespace-nowrap transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.controls.clearSelection}</span>
            </button>
          )}
          {onPrintSelected && (
            <button
              type="button"
              onClick={onPrintSelected}
              className="h-8 px-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-[0_1px_2px_rgba(13,122,114,0.22)] transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.controls.printReport}</span>
            </button>
          )}
        </div>
      </div>

      {/* General: Packings Count by Island */}
      {packingsByIsland.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-subtle)]/70 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-[var(--text-secondary)]">
            {isFa ? 'تعداد پکینگ‌های واردشده به تفکیک جزیره:' : 'Entered Packings by Island:'}
          </span>
          {packingsByIsland.map((entry) => (
            <span
              key={entry.island}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]"
            >
              <span className="font-medium">{entry.island}:</span>
              <span className="font-bold text-[var(--accent-primary)] tabular-nums">
                {fmtNum(entry.packingCount, prefs.language)} {isFa ? 'پکینگ' : 'packings'}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Detailed: Chemical Expiration Warning Banner (< 1 month) */}
      {expiringChemicals.length > 0 && (
        <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--status-danger)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>
              {isFa
                ? `هشدار انقضای مواد شیمیایی (${fmtNum(expiringChemicals.length, prefs.language)} قلم با مهلت کمتر از یک ماه یا منقضی‌شده)`
                : `Chemical Expiration Alert (${expiringChemicals.length} item(s) expiring within 30 days or expired)`}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px]">
            {expiringChemicals.map((chem) => (
              <div
                key={chem.id}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)]/90 border border-[var(--status-danger)]/30 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-bold text-[var(--text-primary)]">
                    {chem.chemicalType || chem.description || '-'}
                  </span>
                  <span className="text-[var(--text-muted)] ms-2 tabular-nums" dir="ltr">
                    [{chem.shipmentNo} / {chem.packageNo || '-'} / #{chem.itemNo || '-'}]
                  </span>
                  {chem.description && chem.chemicalType && (
                    <div className="text-[10px] text-[var(--text-secondary)] truncate">
                      {chem.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                  <span className="text-[var(--text-secondary)]">
                    {isFa ? 'انقضاء:' : 'Exp:'} {formatDate(chem.expirationDate)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--status-danger)] text-white font-bold">
                    {chem.daysRemaining < 0
                      ? isFa
                        ? `منقضی (${fmtNum(Math.abs(chem.daysRemaining), prefs.language)} روز قبل)`
                        : `Expired (${Math.abs(chem.daysRemaining)}d ago)`
                      : chem.daysRemaining === 0
                        ? isFa
                          ? 'انقضاء امروز'
                          : 'Expires Today'
                        : isFa
                          ? `${fmtNum(chem.daysRemaining, prefs.language)} روز مانده`
                          : `${chem.daysRemaining}d left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const SelectionSummaryBar = React.memo(SelectionSummaryBarInner);
