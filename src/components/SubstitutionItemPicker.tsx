import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, FilterX, Square } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { DETAILED_FILTER_FIELDS, type CustomFieldFilter } from '../shared/customFilters.ts';
import type { DetailedComputed } from '../shared/types.ts';
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { MultiPackingAndFieldFilter } from './MultiPackingAndFieldFilter.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar } from './TablePaginationBar.tsx';

interface DetailedPickerResponse {
  items: DetailedComputed[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets?: Record<string, string[]>;
}

interface SubstitutionItemPickerProps {
  /** When true, only loads Detailed rows with positive Employer OR Contractor stock (`hasAnyStock=true`). */
  stockOnly?: boolean;
  /** Signal to refetch rows (e.g. after a mutation). */
  refreshSignal: number;
  /** Currently selected Detailed rows keyed by id. */
  selectedMap: Record<string, DetailedComputed>;
  /** Toggle one row in or out of selection. */
  onToggleRow: (item: DetailedComputed) => void;
  /** Select or unselect all rows on the current page. */
  onTogglePage: (rows: DetailedComputed[], allSelected: boolean) => void;
  /** Test id prefix to distinguish Section A vs Section B pickers. */
  testIdPrefix: string;
}

export const SubstitutionItemPicker: React.FC<SubstitutionItemPickerProps> = ({
  stockOnly = false,
  refreshSignal,
  selectedMap,
  onToggleRow,
  onTogglePage,
  testIdPrefix,
}) => {
  const { prefs, t, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [q, setQ] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [data, setData] = useState<DetailedPickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeqRef = useRef(0);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (stockOnly) params.set('hasAnyStock', 'true');
    if (q.trim()) params.set('q', q.trim());
    if (selectedPackings.length > 0) {
      params.set('packingNos', JSON.stringify(selectedPackings));
    }
    if (customFilters.length > 0) {
      params.set('customFilters', JSON.stringify(customFilters));
    }
    if (Object.keys(colFilters).length > 0) {
      params.set('colFilters', JSON.stringify(colFilters));
      params.set('calendar', prefs.calendar);
    }
    if (sortBy && sortDir) {
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
    }
    return params;
  }, [stockOnly, q, selectedPackings, customFilters, colFilters, prefs.calendar, sortBy, sortDir]);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const params = buildFilterParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await apiRequest<DetailedPickerResponse>(`/api/detailed?${params.toString()}`);
      if (seq === loadSeqRef.current) {
        setData(res);
      }
    } catch (err) {
      if (seq === loadSeqRef.current && err instanceof ApiError) {
        notify('error', err.message);
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [buildFilterParams, page, pageSize, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, q ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [loadData, refreshSignal, q]);

  const rows = data?.items || [];
  const totalRows = data?.total || 0;
  const totalPages = data?.totalPages || 1;
  const allPageSelected = rows.length > 0 && rows.every((item) => Boolean(selectedMap[item.id]));

  const hasActiveFilters = Boolean(
    q.trim() ||
      selectedPackings.length > 0 ||
      customFilters.length > 0 ||
      Object.keys(colFilters).length > 0 ||
      sortBy,
  );

  const handleClearFilters = () => {
    setQ('');
    setSelectedPackings([]);
    setCustomFilters([]);
    setColFilters({});
    setSortBy('');
    setSortDir('');
    setPage(1);
  };

  const handleApplyColFilter = useCallback((colKey: string, allowed: string[] | undefined) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (allowed === undefined) delete next[colKey];
      else next[colKey] = allowed;
      return next;
    });
    setPage(1);
  }, []);

  const handleSortChange = useCallback((colKey: string, dir: 'asc' | 'desc' | null) => {
    if (!dir) {
      setSortBy('');
      setSortDir('');
    } else {
      setSortBy(colKey);
      setSortDir(dir);
    }
    setPage(1);
  }, []);

  const renderColHeader = (colKey: string, label: string) => (
    <ExcelColumnFilter
      scope="detailed"
      colKey={colKey}
      label={label}
      calendar={prefs.calendar}
      lang={prefs.language}
      activeValues={colFilters[colKey]}
      sortDir={sortBy === colKey ? (sortDir || null) : null}
      refreshSignal={refreshSignal}
      onApplyFilter={handleApplyColFilter}
      onSortChange={handleSortChange}
    />
  );

  return (
    <div className="space-y-2.5" data-testid={`${testIdPrefix}-picker`}>
      {/* Detailed-Equipment-Grade Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px]">
          <SearchInputWithClear
            value={q}
            onChange={(val) => {
              setQ(val);
              setPage(1);
            }}
            placeholder={
              stockOnly
                ? isFa
                  ? 'جستجو در کالاهای دارای موجودی (شماره محموله، کد کالا، شرح، انبار...)'
                  : 'Search in-stock items (packing, item code, description, location...)'
                : isFa
                  ? 'جستجو در جزئیات تجهیزات (شماره محموله، آیتم، کد کالا، شرح، تامین‌کننده...)'
                  : 'Search detailed equipment (packing, item no, tag, description, supplier...)'
            }
          />
        </div>

        <MultiPackingAndFieldFilter
          fields={DETAILED_FILTER_FIELDS}
          selectedPackings={selectedPackings}
          onChangePackings={(next) => {
            setSelectedPackings(next);
            setPage(1);
          }}
          customFilters={customFilters}
          onChangeCustomFilters={(next) => {
            setCustomFilters(next);
            setPage(1);
          }}
          compact
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>{isFa ? 'پاک‌سازی فیلترها' : 'Clear Filters'}</span>
          </button>
        )}
      </div>

      {/* Filterable Multi-Select Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <StickyTableWrapper maxHeightClass="max-h-[320px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="w-10 px-2.5 py-2 text-center">
                  <button
                    type="button"
                    aria-label={isFa ? 'انتخاب همه ردیف‌های این صفحه' : 'Toggle all rows on page'}
                    onClick={() => onTogglePage(rows, allPageSelected)}
                    className="p-0.5 rounded hover:bg-[var(--bg-surface)] text-[var(--accent-primary)] inline-flex items-center justify-center"
                  >
                    {allPageSelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                  </button>
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('shipmentNo', isFa ? 'پکینگ / محموله' : 'Packing / Shipment')}
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('itemNo', isFa ? 'شماره آیتم' : 'Item No.')}
                </th>
                <th className="px-2.5 py-2 text-start min-w-[200px]">
                  {renderColHeader('description', isFa ? 'شرح کالا / تجهیز' : 'Description')}
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('itemCode', isFa ? 'کد / تگ کالا' : 'Tag / Code')}
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('supplier', isFa ? 'تأمین‌کننده' : 'Supplier')}
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('unit', isFa ? 'واحد' : 'Unit')}
                </th>
                <th className="px-2.5 py-2 text-start whitespace-nowrap">
                  {renderColHeader('system', isFa ? 'سیستم' : 'System')}
                </th>
                {stockOnly ? (
                  <>
                    <th className="px-2.5 py-2 text-center whitespace-nowrap">
                      {renderColHeader('mapnaInventory', isFa ? 'موجودی کارفرما' : 'Employer Stock')}
                    </th>
                    <th className="px-2.5 py-2 text-center whitespace-nowrap">
                      {renderColHeader('contractorInventory', isFa ? 'موجودی پیمانکار' : 'Contractor Stock')}
                    </th>
                    <th className="px-2.5 py-2 text-start whitespace-nowrap">
                      {renderColHeader('storageLocation', isFa ? 'محل نگهداری' : 'Storage Location')}
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-2.5 py-2 text-start whitespace-nowrap">
                      {renderColHeader('receiver', isFa ? 'تحویل‌گیرنده / پیمانکار نصب' : 'Receiver / Installer')}
                    </th>
                    <th className="px-2.5 py-2 text-start whitespace-nowrap">
                      {renderColHeader('merNo', isFa ? 'شماره کسری/مغایرت (MER)' : 'MER / OSDR No.')}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={stockOnly ? 11 : 10} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={stockOnly ? 11 : 10} className="py-8 text-center text-[var(--text-muted)]">
                    {stockOnly
                      ? isFa
                        ? 'کالایی با موجودی فعال (کارفرما یا پیمانکار) با این فیلتر یافت نشد.'
                        : 'No items with available employer or contractor stock match this filter.'
                      : isFa
                        ? 'ردیفی با این فیلتر در جزئیات تجهیزات یافت نشد.'
                        : 'No matching rows in detailed equipment.'}
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const checked = Boolean(selectedMap[item.id]);
                  return (
                    <tr
                      key={item.id}
                      data-testid={`${testIdPrefix}-row-${item.id}`}
                      onClick={() => onToggleRow(item)}
                      className={`cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[var(--accent-soft)]/70'
                          : 'hover:bg-[var(--bg-subtle)]/55'
                      }`}
                    >
                      <td className="px-2.5 py-2 text-center">
                        <input
                          type="checkbox"
                          data-testid={`${testIdPrefix}-checkbox-${item.id}`}
                          aria-label={`${item.shipmentNo} ${item.itemNo} ${item.description}`}
                          checked={checked}
                          onChange={() => onToggleRow(item)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
                        />
                      </td>
                      <td dir="ltr" className="px-2.5 py-2 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        {item.shipmentNo}
                      </td>
                      <td dir="ltr" className="px-2.5 py-2 font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                        {item.itemNo || '—'}
                      </td>
                      <td className="px-2.5 py-2 text-[var(--text-primary)] bidi-plaintext max-w-[280px] truncate" title={item.description}>
                        {item.description || item.generalDescription}
                      </td>
                      <td dir="ltr" className="px-2.5 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                        {item.itemCode || '—'}
                      </td>
                      <td className="px-2.5 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {item.supplier || '—'}
                      </td>
                      <td className="px-2.5 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {item.unit || '—'}
                      </td>
                      <td className="px-2.5 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                        {item.system || '—'}
                      </td>
                      {stockOnly ? (
                        <>
                          <td className="px-2.5 py-2 text-center tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                            {item.mapnaInventory}
                          </td>
                          <td className="px-2.5 py-2 text-center tabular-nums font-bold text-sky-700 dark:text-sky-400">
                            {item.contractorInventory}
                          </td>
                          <td className="px-2.5 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                            {item.storageLocation || '—'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2.5 py-2 text-[var(--text-secondary)] whitespace-nowrap">
                            {item.receiver || '—'}
                          </td>
                          <td dir="ltr" className="px-2.5 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                            {item.merNo || '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        <TablePaginationBar
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          total={totalRows}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          lang={prefs.language}
        />
      </div>
    </div>
  );
};
