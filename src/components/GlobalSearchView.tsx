import React, { useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { DetailedComputed, GeneralEntry, TransitEntry } from '../shared/types.ts';

interface SearchResponse {
  general: GeneralEntry[];
  detailed: DetailedComputed[];
  transit: TransitEntry[];
}

interface GlobalSearchViewProps {
  onJumpToDetailed: (shipmentNo: string, packageNo: string) => void;
}

export const GlobalSearchView: React.FC<GlobalSearchViewProps> = ({ onJumpToDetailed }) => {
  const { prefs, t, formatDate, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest<SearchResponse>(
        `/api/search?q=${encodeURIComponent(query.trim())}&limit=50`,
      );
      setResults(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={runSearch}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap gap-3"
      >
        <div className="flex items-center flex-1 min-w-[260px] h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            dir={!query ? (isFa ? 'rtl' : 'ltr') : 'auto'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.controls.searchPlaceholder}
            className="flex-1 min-w-0 h-full bg-transparent text-sm bidi-plaintext focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="h-10 px-6 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold"
        >
          {loading ? t.controls.loading : isFa ? 'جستجو در کل پایگاه داده' : 'Search All Records'}
        </button>
      </form>

      {results && (
        <div className="space-y-6">
          {/* General Matches */}
          {results.general.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] text-sm font-bold">
                {t.nav.general} ({results.general.length})
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.general.map((g) => (
                  <div key={g.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
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
                      onClick={() => onJumpToDetailed(g.packingListNo, g.packageNo)}
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
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] text-sm font-bold">
                {t.nav.detailed} ({results.detailed.length})
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.detailed.map((d) => (
                  <div
                    key={d.id}
                    className={`p-4 flex flex-wrap items-center justify-between gap-3 text-xs ${
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
                      onClick={() => onJumpToDetailed(d.shipmentNo, d.packageNo)}
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
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] text-sm font-bold">
                {t.nav.transit} ({results.transit.length})
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {results.transit.map((tr) => (
                  <div key={tr.id} className="p-4 text-xs space-y-1">
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
    </div>
  );
};
