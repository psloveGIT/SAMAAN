import React, { useMemo, useState } from 'react';
import { CheckSquare, FilterX, Square } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  GENERAL_FILTER_FIELDS,
  matchesCustomFilters,
  matchesMultiPacking,
  type CustomFieldFilter,
} from '../shared/customFilters.ts';
import { compileColFilters, matchesCompiledColFilters } from '../shared/tableQuery.ts';
import { sortGeneralEntries } from '../shared/sorting.ts';
import type { GeneralEntry } from '../shared/types.ts';
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { MultiPackingAndFieldFilter } from './MultiPackingAndFieldFilter.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface OpiGeneralPickerProps {
  /** Eligible General Equipment rows (already filtered to exclude rows with opiInvitationNo). */
  rows: GeneralEntry[];
  /** Loading state from parent OpiView. */
  loading?: boolean;
  /** Currently selected General rows keyed by id. */
  selectedMap: Record<string, GeneralEntry>;
  /** Toggle one row in or out of selection. */
  onToggleRow: (row: GeneralEntry) => void;
  /** Select or deselect a batch of rows (current page or all filtered). */
  onToggleBatch: (rows: GeneralEntry[], allSelected: boolean) => void;
  /** Signal for ExcelColumnFilter facets refresh. */
  refreshSignal?: number;
  /** Test id prefix. */
  testIdPrefix?: string;
}

const FA_COLLATOR = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });

export const OpiGeneralPicker: React.FC<OpiGeneralPickerProps> = ({
  rows,
  loading = false,
  selectedMap,
  onToggleRow,
  onToggleBatch,
  refreshSignal = 0,
  testIdPrefix = 'opi-picker',
}) => {
  const { prefs, t, formatDate } = useApp();
  const isFa = prefs.language === 'fa';

  const [q, setQ] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');

  const compiledColFilters = useMemo(() => compileColFilters(colFilters), [colFilters]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = rows.filter((g) => {
      if (selectedPackings.length > 0 && !matchesMultiPacking(g.packingListNo, selectedPackings)) {
        return false;
      }
      if (
        customFilters.length > 0 &&
        !matchesCustomFilters(g as unknown as Record<string, unknown>, customFilters)
      ) {
        return false;
      }
      if (
        compiledColFilters.length > 0 &&
        !matchesCompiledColFilters(
          g as unknown as Record<string, unknown>,
          compiledColFilters,
          prefs.calendar,
        )
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        g.rowNo,
        g.packingListNo,
        g.packageNo,
        g.packageType || '',
        g.purchasePackageNo || '',
        g.itemDescription,
        g.supplier,
        g.dispatchLocation,
        g.island,
        g.system,
        g.subSystem,
        g.unit,
        g.arrivalDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });

    if (sortBy && sortDir) {
      const dir = sortDir === 'asc' ? 1 : -1;
      return [...matched].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
        return FA_COLLATOR.compare(av, bv) * dir;
      });
    }
    return sortGeneralEntries(matched);
  }, [rows, q, selectedPackings, customFilters, compiledColFilters, prefs.calendar, sortBy, sortDir]);

  const pagination = useClientPagination(filteredRows, 25);
  const pageRows = pagination.pageItems;
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => Boolean(selectedMap[r.id]));
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => Boolean(selectedMap[r.id]));

  const hasActiveFilters = Boolean(
    q.trim() ||
      selectedPackings.length > 0 ||
      customFilters.length > 0 ||
      Object.keys(colFilters).length > 0 ||
      sortBy,
  );

  const clearAllFilters = () => {
    setQ('');
    setSelectedPackings([]);
    setCustomFilters([]);
    setColFilters({});
    setSortBy('');
    setSortDir('');
    pagination.setPage(1);
  };

  const handleSortChange = (colKey: string, dir: 'asc' | 'desc' | null) => {
    if (!dir) {
      setSortBy('');
      setSortDir('');
    } else {
      setSortBy(colKey);
      setSortDir(dir);
    }
    pagination.setPage(1);
  };

  const handleApplyColFilter = (colKey: string, allowedValues: string[] | undefined) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (!allowedValues) delete next[colKey];
      else next[colKey] = allowedValues;
      return next;
    });
    pagination.setPage(1);
  };

  const renderColHeader = (colKey: string, label: string, isNum = false) => (
    <ExcelColumnFilter
      scope="general"
      colKey={colKey}
      label={label}
      calendar={prefs.calendar}
      lang={prefs.language}
      isNum={isNum}
      activeValues={colFilters[colKey]}
      sortDir={sortBy === colKey && sortDir ? sortDir : null}
      refreshSignal={refreshSignal}
      onSortChange={handleSortChange}
      onApplyFilter={handleApplyColFilter}
    />
  );

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-container`}>
      {/* Search + Multi-Packing & Custom Filters (General Equipment Grade) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px]">
          <SearchInputWithClear
            value={q}
            onChange={(val) => {
              setQ(val);
              pagination.setPage(1);
            }}
            placeholder={
              isFa
                ? 'جستجو در پکینگ لیست، شماره نگله، شرح کالا، تامین‌کننده، سیستم، جزیره، بسته خرید...'
                : 'Search packing list, package no., description, supplier, system, island, purchase pkg...'
            }
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1.5"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>{isFa ? 'پاک‌سازی فیلترها' : 'Reset Filters'}</span>
          </button>
        )}

        {filteredRows.length > 0 && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-select-all-filtered-btn`}
            onClick={() => onToggleBatch(filteredRows, allFilteredSelected)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5"
          >
            {allFilteredSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            ) : (
              <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
            <span>
              {allFilteredSelected
                ? isFa
                  ? `لغو انتخاب همه (${filteredRows.length})`
                  : `Deselect All (${filteredRows.length})`
                : isFa
                  ? `انتخاب همه فیلترشده (${filteredRows.length})`
                  : `Select All Filtered (${filteredRows.length})`}
            </span>
          </button>
        )}
      </div>

      <MultiPackingAndFieldFilter
        fields={GENERAL_FILTER_FIELDS}
        selectedPackings={selectedPackings}
        onChangePackings={(next) => {
          setSelectedPackings(next);
          pagination.setPage(1);
        }}
        customFilters={customFilters}
        onChangeCustomFilters={(next) => {
          setCustomFilters(next);
          pagination.setPage(1);
        }}
        compact
      />

      {/* Eligible General Equipment Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <StickyTableWrapper>
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-2.5 w-10 text-center">
                  <button
                    type="button"
                    data-testid={`${testIdPrefix}-select-page-btn`}
                    aria-label={isFa ? 'انتخاب همه ردیف‌های صفحه' : 'Select all rows on page'}
                    onClick={() => onToggleBatch(pageRows, allPageSelected)}
                    className="inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
                  >
                    {allPageSelected ? (
                      <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('packingListNo', t.headers.packingListNo)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('packageNo', t.headers.packageNo)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('itemDescription', t.headers.itemDescription)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('packageType', t.headers.packageType)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('supplier', t.headers.supplier)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('purchasePackageNo', t.headers.purchasePackageNo)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('island', t.headers.island)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('system', t.headers.system)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('unit', t.headers.unit)}
                </th>
                <th className="py-2 px-2.5 text-start whitespace-nowrap">
                  {renderColHeader('arrivalDate', t.headers.arrivalDate)}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-[var(--text-muted)]">
                    {rows.length === 0
                      ? isFa
                        ? 'هیچ ردیف فاقد «شماره دعوتنامه OPI» در جدول ثبت کلی تجهیزات وجود ندارد.'
                        : 'No General Equipment rows without an OPI Invitation No. are available.'
                      : t.controls.noData}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const isSelected = Boolean(selectedMap[row.id]);
                  return (
                    <tr
                      key={row.id}
                      data-testid={`${testIdPrefix}-row-${row.id}`}
                      onClick={() => onToggleRow(row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-soft)]/55 hover:bg-[var(--accent-soft)]/75'
                          : 'hover:bg-[var(--bg-subtle)]/45'
                      }`}
                    >
                      <td className="py-2 px-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          data-testid={`${testIdPrefix}-check-${row.id}`}
                          aria-label={`${row.packingListNo || ''} ${row.packageNo || ''}`.trim() || row.id}
                          checked={isSelected}
                          onChange={() => onToggleRow(row)}
                          className="w-4 h-4 accent-[var(--accent-primary)] cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                        {row.packingListNo || '—'}
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                        {row.packageNo || '—'}
                      </td>
                      <td
                        className="py-2 px-2.5 max-w-[260px] truncate bidi-plaintext font-medium text-[var(--text-primary)]"
                        title={row.itemDescription}
                      >
                        {row.itemDescription || '—'}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                        {row.packageType || '—'}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                        {row.supplier || '—'}
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                        {row.purchasePackageNo || '—'}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                        {row.island || '—'}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                        {row.system || '—'}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                        {row.unit || '—'}
                      </td>
                      <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                        {row.arrivalDate ? formatDate(row.arrivalDate) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        <TablePaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          lang={prefs.language}
        />
      </div>
    </div>
  );
};
