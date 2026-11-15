import React, { useMemo, useState } from 'react';
import { AlertTriangle, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import {
  type CustomFieldFilter,
  DETAILED_FILTER_FIELDS,
  type FilterFieldOption,
  GENERAL_FILTER_FIELDS,
  TRANSIT_FILTER_FIELDS,
} from '../shared/customFilters.ts';
import type { DetailedComputed, GeneralEntry, TransitEntry } from '../shared/types.ts';
import { MultiPackingAndFieldFilter } from './MultiPackingAndFieldFilter.tsx';
import { type PrintColumnDef, PrintReportModal } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';

interface SearchResponse {
  general: GeneralEntry[];
  detailed: DetailedComputed[];
  transit: TransitEntry[];
}

interface GlobalSearchViewProps {
  onJumpToDetailed: (shipmentNo: string, packageNo: string) => void;
}

type PrintScope = 'general' | 'detailed' | 'transit' | null;

type InspectedRecord =
  | { kind: 'general'; row: GeneralEntry }
  | { kind: 'detailed'; row: DetailedComputed }
  | { kind: 'transit'; row: TransitEntry }
  | null;

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({ onJumpToDetailed }) => {
  const { prefs, t, formatDate, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const [query, setQuery] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [inspected, setInspected] = useState<InspectedRecord>(null);
  const [printScope, setPrintScope] = useState<PrintScope>(null);

  const combinedFields = useMemo<FilterFieldOption[]>(() => {
    const map = new Map<string, FilterFieldOption>();
    for (const f of [...GENERAL_FILTER_FIELDS, ...DETAILED_FILTER_FIELDS, ...TRANSIT_FILTER_FIELDS]) {
      if (!map.has(f.key)) map.set(f.key, f);
    }
    return Array.from(map.values());
  }, []);

  const executeSearch = async (
    qVal = query,
    packingsVal = selectedPackings,
    filtersVal = customFilters,
  ) => {
    if (!qVal.trim() && packingsVal.length === 0 && filtersVal.length === 0) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: qVal.trim(),
        limit: '200',
        ...(packingsVal.length > 0 ? { packingNos: JSON.stringify(packingsVal) } : {}),
        ...(filtersVal.length > 0 ? { customFilters: JSON.stringify(filtersVal) } : {}),
      });
      const res = await apiRequest<SearchResponse>(`/api/search?${params.toString()}`);
      setResults(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSearch();
  };

  const generalPrintCols = useMemo<PrintColumnDef<GeneralEntry>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, getValue: (r) => r.arrivalDate },
      { key: 'packingListNo', header: t.headers.packingListNo, getValue: (r) => r.packingListNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'packageType', header: t.headers.packageType, getValue: (r) => r.packageType },
      { key: 'itemCount', header: t.headers.itemCount, getValue: (r) => r.itemCount },
      { key: 'itemDescription', header: t.headers.itemDescription, getValue: (r) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier },
      { key: 'dispatchLocation', header: t.headers.dispatchLocation, getValue: (r) => r.dispatchLocation },
      { key: 'island', header: t.headers.island, getValue: (r) => r.island },
      { key: 'system', header: t.headers.system, getValue: (r) => r.system },
      { key: 'freightCost', header: t.headers.freightCost, getValue: (r) => r.freightCost },
    ],
    [t],
  );

  const detailedPrintCols = useMemo<PrintColumnDef<DetailedComputed>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'description', header: t.headers.description, getValue: (r) => r.description || r.generalDescription },
      { key: 'itemCode', header: t.headers.itemCode, getValue: (r) => r.itemCode },
      { key: 'packingQty', header: t.headers.packingQty, getValue: (r) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, getValue: (r) => r.actualQty },
      { key: 'shortage', header: t.headers.shortage, getValue: (r) => r.shortage },
      { key: 'mapnaInventory', header: t.headers.mapnaInventory, getValue: (r) => r.mapnaInventory },
      { key: 'storageLocation', header: t.headers.storageLocation, getValue: (r) => r.storageLocation },
    ],
    [t],
  );

  const transitPrintCols = useMemo<PrintColumnDef<TransitEntry>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, getValue: (r) => r.arrivalDate },
      { key: 'overallStatus', header: t.headers.overallStatus, getValue: (r) => r.overallStatus },
      { key: 'packingListNo', header: t.headers.packingListNo, getValue: (r) => r.packingListNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemDescription', header: t.headers.itemDescription, getValue: (r) => r.itemDescription },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier },
      { key: 'amount', header: t.headers.amount, getValue: (r) => r.amount },
    ],
    [t],
  );

  const inspectedEntries = useMemo(() => {
    if (!inspected) return [];
    const headerRecord = t.headers as Record<string, string>;
    const rowObj = inspected.row as unknown as Record<string, unknown>;
    return Object.entries(rowObj)
      .filter(([k, val]) => {
        if (k === 'id' || k === 'createdBy' || k === 'updatedBy' || k === 'shortageBackfills') return false;
        return val !== null && val !== undefined && String(val).trim() !== '';
      })
      .map(([k, val]) => {
        const label = headerRecord[k] || k;
        const isDate = k.toLowerCase().includes('date');
        const display = isDate
          ? formatDate(String(val))
          : typeof val === 'number'
            ? val.toLocaleString(isFa ? 'fa-IR' : 'en-US')
            : String(val);
        return { key: k, label, display };
      });
  }, [inspected, t.headers, formatDate, isFa]);

  return (
    <div className="space-y-6">
      <form
        onSubmit={runSearch}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3"
      >
        <div className="flex flex-wrap gap-3">
          <SearchInputWithClear
            value={query}
            onChange={(val) => {
              setQuery(val);
              if (!val && selectedPackings.length === 0 && customFilters.length === 0) {
                setResults(null);
              }
            }}
            placeholder={t.controls.searchPlaceholder}
            className="flex-1 min-w-[260px]"
            inputClassName="h-10"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-10 px-6 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold"
          >
            {loading ? t.controls.loading : isFa ? 'جستجو در کل پایگاه داده' : 'Search All Records'}
          </button>
        </div>

        <MultiPackingAndFieldFilter
          fields={combinedFields}
          selectedPackings={selectedPackings}
          onChangePackings={(next) => {
            setSelectedPackings(next);
            if (next.length > 0 || query.trim() || customFilters.length > 0) {
              executeSearch(query, next, customFilters);
            } else {
              setResults(null);
            }
          }}
          customFilters={customFilters}
          onChangeCustomFilters={(next) => {
            setCustomFilters(next);
            if (next.length > 0 || query.trim() || selectedPackings.length > 0) {
              executeSearch(query, selectedPackings, next);
            } else {
              setResults(null);
            }
          }}
          compact
        />
      </form>

      {results && (
        <div className="space-y-6">
          {/* General Matches */}
          {results.general.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <span className="text-sm font-bold">
                  {t.nav.general} ({results.general.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')})
                </span>
                <button
                  type="button"
                  onClick={() => setPrintScope('general')}
                  className="h-8 px-3 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.controls.printReport}</span>
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.general.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => setInspected({ kind: 'general', row: g })}
                    className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-bold bidi-plaintext">{g.itemDescription}</div>
                      <div className="text-[var(--text-muted)] tabular-nums flex flex-wrap gap-x-3 gap-y-1 bidi-plaintext">
                        <span>{t.headers.rowNo}: {g.rowNo}</span>
                        {g.packingListNo && <span>{t.headers.packingListNo}: <span dir="ltr">{g.packingListNo}</span></span>}
                        {g.packageNo && <span>{t.headers.packageNo}: <span dir="ltr">{g.packageNo}</span></span>}
                        {g.arrivalDate && <span>{t.headers.arrivalDate}: <span dir="ltr">{formatDate(g.arrivalDate)}</span></span>}
                        {g.supplier && <span>{g.supplier}</span>}
                        {g.island && <span>{g.island} / {g.system}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToDetailed(g.packingListNo, g.packageNo);
                      }}
                      className="h-8 px-3 rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--accent-primary)]"
                    >
                      {t.packing.viewDetailsLink}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Matches */}
          {results.detailed.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <span className="text-sm font-bold">
                  {t.nav.detailed} ({results.detailed.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')})
                </span>
                <button
                  type="button"
                  onClick={() => setPrintScope('detailed')}
                  className="h-8 px-3 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.controls.printReport}</span>
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.detailed.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setInspected({ kind: 'detailed', row: d })}
                    className={`p-4 flex flex-wrap items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors ${
                      d.hasShortage ? 'bg-[var(--status-danger-bg)]/40' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-2 bidi-plaintext">
                        <span>{d.description || d.generalDescription}</span>
                        {d.hasShortage && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{t.headers.shortage}: {d.shortage}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[var(--text-muted)] tabular-nums flex flex-wrap gap-x-3 gap-y-1 bidi-plaintext">
                        <span>{t.headers.rowNo}: {d.rowNo}</span>
                        {d.shipmentNo && <span>{t.headers.shipmentNo}: <span dir="ltr">{d.shipmentNo}</span></span>}
                        {d.packageNo && <span>{t.headers.packageNo}: <span dir="ltr">{d.packageNo}</span></span>}
                        {d.itemCode && <span>{t.headers.itemCode}: <span dir="ltr">{d.itemCode}</span></span>}
                        {d.mtoRef && <span>MTO: <span dir="ltr">{d.mtoRef}</span></span>}
                        {d.arrivalDate && <span dir="ltr">{formatDate(d.arrivalDate)}</span>}
                        {d.storageLocation && <span>{t.headers.storageLocation}: {d.storageLocation}</span>}
                        <span>{t.headers.mapnaInventory}: {d.mapnaInventory}</span>
                        {d.contractorInventory > 0 && (
                          <span>{t.headers.contractorInventory}: {d.contractorInventory}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToDetailed(d.shipmentNo, d.packageNo);
                      }}
                      className="h-8 px-3 rounded-lg border border-[var(--border-strong)] text-xs font-medium text-[var(--accent-primary)]"
                    >
                      {isFa ? 'نمایش در جدول جزئیات' : 'Open in Detailed'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transit Matches */}
          {results.transit.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <span className="text-sm font-bold">
                  {t.nav.transit} ({results.transit.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')})
                </span>
                <button
                  type="button"
                  onClick={() => setPrintScope('transit')}
                  className="h-8 px-3 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.controls.printReport}</span>
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.transit.map((tr) => (
                  <div
                    key={tr.id}
                    onClick={() => setInspected({ kind: 'transit', row: tr })}
                    className="p-4 text-xs space-y-1 cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors"
                  >
                    <div className="font-bold bidi-plaintext">
                      {tr.itemDescription} ·{' '}
                      <span className="text-[var(--accent-primary)]">{tr.overallStatus}</span>
                    </div>
                    <div className="text-[var(--text-muted)] tabular-nums flex flex-wrap gap-x-3 gap-y-1 bidi-plaintext">
                      {tr.packingListNo && <span>{t.headers.packingListNo}: <span dir="ltr">{tr.packingListNo}</span></span>}
                      {tr.packageNo && <span>{t.headers.packageNo}: <span dir="ltr">{tr.packageNo}</span></span>}
                      {tr.arrivalDate && <span dir="ltr">{formatDate(tr.arrivalDate)}</span>}
                      {tr.supplier && <span>{tr.supplier}</span>}
                      {tr.carrierContractor && <span>{tr.carrierContractor}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.general.length === 0 &&
            results.detailed.length === 0 &&
            results.transit.length === 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-10 text-center text-xs text-[var(--text-muted)]">
                {t.controls.noData}
              </div>
            )}
        </div>
      )}

      {/* Row Detail Inspector Drawer */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setInspected(null)}>
          <div
            className="w-full max-w-lg bg-[var(--bg-surface)] h-full overflow-y-auto p-6 border-s border-[var(--border-subtle)] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold bidi-plaintext">
                  {inspected.kind === 'general'
                    ? t.nav.general
                    : inspected.kind === 'detailed'
                      ? t.nav.detailed
                      : t.nav.transit}
                </h3>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {isFa ? 'مشاهده کامل اطلاعات سطر' : 'Full Record Details'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {inspectedEntries.map((item) => (
                <div
                  key={item.key}
                  className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                >
                  <div className="text-[11px] text-[var(--text-muted)]">{item.label}</div>
                  <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                    {item.display}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {printScope === 'general' && results && (
        <PrintReportModal
          open
          onClose={() => setPrintScope(null)}
          title={t.nav.general}
          rows={results.general}
          columns={generalPrintCols}
        />
      )}
      {printScope === 'detailed' && results && (
        <PrintReportModal
          open
          onClose={() => setPrintScope(null)}
          title={t.nav.detailed}
          rows={results.detailed}
          columns={detailedPrintCols}
        />
      )}
      {printScope === 'transit' && results && (
        <PrintReportModal
          open
          onClose={() => setPrintScope(null)}
          title={t.nav.transit}
          rows={results.transit}
          columns={transitPrintCols}
        />
      )}
    </div>
  );
};
