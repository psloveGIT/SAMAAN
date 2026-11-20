import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDisplayNumber } from '../shared/jalali.ts';

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;

export function useClientPagination<T>(items: T[], defaultPageSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    total,
    totalPages,
    pageItems,
  };
}

interface TablePaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
  lang: 'fa' | 'en';
  options?: readonly number[];
  compact?: boolean;
}

export const TablePaginationBar: React.FC<TablePaginationBarProps> = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  lang,
  options = PAGE_SIZE_OPTIONS,
  compact = false,
}) => {
  const isFa = lang === 'fa';
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);
  const startIndex = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(total, safePage * pageSize);

  return (
    <div
      className={`${
        compact ? 'px-4 py-2.5' : 'px-4.5 py-3'
      } border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/45 flex flex-wrap items-center justify-between gap-2.5 text-xs text-[var(--text-secondary)] print:hidden`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="tabular-nums font-medium">
          {total === 0
            ? isFa
              ? '۰ ردیف'
              : '0 rows'
            : isFa
              ? `نمایش ${formatDisplayNumber(startIndex, 'fa')} تا ${formatDisplayNumber(endIndex, 'fa')} از ${formatDisplayNumber(total, 'fa')} ردیف (صفحه ${formatDisplayNumber(safePage, 'fa')} از ${formatDisplayNumber(safeTotalPages, 'fa')})`
              : `Showing ${formatDisplayNumber(startIndex, 'en')}–${formatDisplayNumber(endIndex, 'en')} of ${formatDisplayNumber(total, 'en')} rows (Page ${safePage} of ${safeTotalPages})`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={isFa ? 'تعداد ردیف در صفحه' : 'Rows per page'}
          value={pageSize}
          onChange={(e) => {
            const val = Number(e.target.value) || 50;
            onPageSizeChange(val);
          }}
          className="h-8 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium tabular-nums"
        >
          {options.map((sz) => (
            <option key={sz} value={sz}>
              {isFa ? `${formatDisplayNumber(sz, 'fa')} ردیف در صفحه` : `${sz} rows / page`}
            </option>
          ))}
        </select>

        {safeTotalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              aria-label={isFa ? 'صفحه قبل' : 'Previous page'}
              className="h-8 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              {isFa ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <span className="px-2 tabular-nums font-semibold text-[var(--text-primary)]">
              {isFa
                ? `${formatDisplayNumber(safePage, 'fa')} / ${formatDisplayNumber(safeTotalPages, 'fa')}`
                : `${safePage} / ${safeTotalPages}`}
            </span>
            <button
              type="button"
              disabled={safePage >= safeTotalPages}
              onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
              aria-label={isFa ? 'صفحه بعد' : 'Next page'}
              className="h-8 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 inline-flex items-center justify-center transition-colors"
            >
              {isFa ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
