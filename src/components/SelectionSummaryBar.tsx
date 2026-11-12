import React from 'react';
import { Calculator, Download, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { SelectionFormulaSummary } from '../shared/types.ts';

interface SelectionSummaryBarProps {
  scope: 'general' | 'detailed' | 'transit';
  selectedCount: number;
  summary: SelectionFormulaSummary;
  isFilteredFallback: boolean;
  onClearSelection: () => void;
  onExportSelected: () => void;
}

function fmtNum(n: number, lang: 'fa' | 'en'): string {
  return n.toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 3 });
}

export const SelectionSummaryBar: React.FC<SelectionSummaryBarProps> = ({
  scope,
  selectedCount,
  summary,
  isFilteredFallback,
  onClearSelection,
  onExportSelected,
}) => {
  const { prefs, t } = useApp();
  const isFa = prefs.language === 'fa';

  const metrics: { label: string; value: number; highlight?: 'danger' | 'accent' }[] = [];

  if (scope === 'general') {
    if (summary.grossWeightSum)
      metrics.push({ label: t.headers.grossWeight, value: summary.grossWeightSum });
    if (summary.netWeightSum)
      metrics.push({ label: t.headers.netWeight, value: summary.netWeightSum });
    if (summary.weighbridgeWeightSum)
      metrics.push({ label: t.headers.weighbridgeWeight, value: summary.weighbridgeWeightSum });
    if (summary.freightCostSum)
      metrics.push({ label: t.headers.freightCost, value: summary.freightCostSum, highlight: 'accent' });
  } else if (scope === 'detailed') {
    if (summary.packingQtySum)
      metrics.push({ label: t.headers.packingQty, value: summary.packingQtySum });
    if (summary.actualQtySum)
      metrics.push({ label: t.headers.actualQty, value: summary.actualQtySum });
    if (summary.shortageSum)
      metrics.push({ label: t.headers.shortage, value: summary.shortageSum, highlight: 'danger' });
    if (summary.surplusSum)
      metrics.push({ label: t.headers.surplus, value: summary.surplusSum });
    if (summary.damagedQtySum)
      metrics.push({ label: t.headers.damagedQty, value: summary.damagedQtySum, highlight: 'danger' });
    if (summary.gcvDeliveredSum)
      metrics.push({ label: t.headers.gcvDeliveredQty, value: summary.gcvDeliveredSum });
    metrics.push({ label: t.headers.mapnaInventory, value: summary.mapnaInventorySum, highlight: 'accent' });
    metrics.push({ label: t.headers.contractorInventory, value: summary.contractorInventorySum });
    if (summary.mivContractorQtySum)
      metrics.push({ label: t.headers.mivContractorQty, value: summary.mivContractorQtySum });
  } else {
    if (summary.transitAmountSum)
      metrics.push({ label: t.headers.amount, value: summary.transitAmountSum, highlight: 'accent' });
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-primary)]">
          <Calculator className="w-4 h-4" />
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
                className={`font-semibold tabular-nums ${
                  m.highlight === 'danger'
                    ? 'text-[var(--status-danger)]'
                    : m.highlight === 'accent'
                      ? 'text-[var(--accent-primary)]'
                      : 'text-[var(--text-primary)]'
                }`}
              >
                {fmtNum(m.value, prefs.language)}
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
            className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] flex items-center gap-1 whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t.controls.clearSelection}</span>
          </button>
        )}
        <button
          type="button"
          onClick={onExportSelected}
          className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.controls.exportCsv}</span>
        </button>
      </div>
    </div>
  );
};
