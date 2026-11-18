import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpZA, Check, ChevronDown, Filter, Search, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { EMPTY_CELL_TOKEN } from '../shared/tableQuery.ts';

interface RawColumnValueItem {
  token?: unknown;
  label?: unknown;
  count?: unknown;
}

interface ColumnValuesResponse {
  column?: string;
  values: Array<string | RawColumnValueItem>;
}

interface ExcelColumnFilterProps {
  scope: 'general' | 'detailed' | 'transit';
  colKey: string;
  label: string;
  calendar: 'jalali' | 'gregorian';
  lang: 'fa' | 'en';
  isNum?: boolean;
  activeValues?: string[];
  sortDir?: 'asc' | 'desc' | null;
  refreshSignal?: number;
  onSortChange: (colKey: string, dir: 'asc' | 'desc' | null) => void;
  onApplyFilter: (colKey: string, allowedValues: string[] | undefined) => void;
}

export const ExcelColumnFilter: React.FC<ExcelColumnFilterProps> = ({
  scope,
  colKey,
  label,
  calendar,
  lang,
  isNum = false,
  activeValues,
  sortDir = null,
  refreshSignal = 0,
  onSortChange,
  onApplyFilter,
}) => {
  const isFa = lang === 'fa';
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Array<{ token: string; label: string; count: number }>>([]);
  const [search, setSearch] = useState('');
  const [draftChecked, setDraftChecked] = useState<Set<string>>(new Set());
  const [addToExisting, setAddToExisting] = useState(false);
  const [renderLimit, setRenderLimit] = useState(200);

  const hasFilter = activeValues !== undefined;
  const isActive = hasFilter || sortDir !== null;

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const popW = 280;
      const popH = 390;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = isFa ? rect.right - popW : rect.left;
      if (left + popW > vw - 12) left = vw - popW - 12;
      if (left < 12) left = 12;
      let top = rect.bottom + 6;
      if (top + popH > vh - 12) {
        top = Math.max(12, rect.top - popH - 6);
      }
      setPos({ top, left });
    }
  }, [open, isFa]);

  const activeValuesRef = useRef(activeValues);
  activeValuesRef.current = activeValues;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSearch('');
    setAddToExisting(false);
    setRenderLimit(200);
    apiRequest<ColumnValuesResponse>(
      `/api/column-values?scope=${scope}&column=${encodeURIComponent(colKey)}&calendar=${calendar}`,
    )
      .then((res) => {
        if (cancelled) return;
        const rawVals = Array.isArray(res?.values) ? res.values : [];
        const vals = rawVals.map((v) => {
          if (typeof v === 'string') {
            return {
              token: v,
              label: v === EMPTY_CELL_TOKEN ? '' : v,
              count: 0,
            };
          }
          const tok = String(v?.token ?? '');
          const lbl = String(v?.label ?? (tok === EMPTY_CELL_TOKEN ? '' : tok));
          const cnt = typeof v?.count === 'number' && Number.isFinite(v.count) ? v.count : 0;
          return { token: tok, label: lbl, count: cnt };
        });
        setOptions(vals);
        const currentActive = activeValuesRef.current;
        if (currentActive === undefined) {
          setDraftChecked(new Set(vals.map((v) => v.token)));
        } else {
          setDraftChecked(new Set(currentActive));
        }
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, scope, colKey, calendar, refreshSignal]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) => opt.label.toLowerCase().includes(q) || opt.token.toLowerCase().includes(q),
    );
  }, [options, search]);

  const allVisibleChecked =
    filteredOptions.length > 0 && filteredOptions.every((o) => draftChecked.has(o.token));

  const toggleSelectAllVisible = () => {
    setDraftChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        filteredOptions.forEach((o) => next.delete(o.token));
      } else {
        filteredOptions.forEach((o) => next.add(o.token));
      }
      return next;
    });
  };

  const toggleToken = (token: string) => {
    setDraftChecked((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const handleApply = () => {
    const visibleSet = new Set(filteredOptions.map((o) => o.token));
    const checkedVisible = filteredOptions.filter((o) => draftChecked.has(o.token)).map((o) => o.token);

    let nextAllowed: Set<string>;
    if (search.trim()) {
      if (addToExisting && activeValues !== undefined) {
        nextAllowed = new Set([...activeValues, ...checkedVisible]);
      } else {
        // Only keep items checked within current search results
        nextAllowed = new Set(checkedVisible);
      }
    } else {
      nextAllowed = new Set(Array.from(draftChecked).filter((tok) => visibleSet.has(tok) || options.some((o) => o.token === tok)));
    }

    if (options.length > 0 && nextAllowed.size >= options.length) {
      onApplyFilter(colKey, undefined);
    } else {
      onApplyFilter(colKey, Array.from(nextAllowed));
    }
    setOpen(false);
  };

  const handleClearColFilter = () => {
    onApplyFilter(colKey, undefined);
    setOpen(false);
  };

  return (
    <div className={`inline-flex items-center gap-1 max-w-full ${isNum ? 'flex-row-reverse' : ''}`}>
      <span className="truncate">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={isFa ? `فیلتر و مرتب‌سازی: ${label}` : `Filter & Sort: ${label}`}
        className={`p-0.5 rounded border transition-colors shrink-0 ${
          isActive
            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
            : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface)] text-[var(--text-muted)]'
        }`}
      >
        {hasFilter ? <Filter className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            dir={isFa ? 'rtl' : 'ltr'}
            style={{ top: pos.top, left: pos.left, width: 280, maxHeight: 'calc(100vh - 24px)' }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[90] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-xl text-xs text-[var(--text-primary)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center justify-between gap-2">
              <span className="font-bold truncate">{label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sort Controls */}
            <div className="p-2 border-b border-[var(--border-subtle)] space-y-1">
              <button
                type="button"
                onClick={() => {
                  onSortChange(colKey, sortDir === 'asc' ? null : 'asc');
                  setOpen(false);
                }}
                className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-[11px] font-medium transition-colors ${
                  sortDir === 'asc'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-bold'
                    : 'hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ArrowDownAZ className="w-3.5 h-3.5" />
                  <span>{isFa ? 'مرتب‌سازی صعودی (قدیمی به جدید / A→Z)' : 'Sort Ascending (A → Z)'}</span>
                </span>
                {sortDir === 'asc' && <Check className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSortChange(colKey, sortDir === 'desc' ? null : 'desc');
                  setOpen(false);
                }}
                className={`w-full px-2 py-1.5 rounded-lg flex items-center justify-between text-[11px] font-medium transition-colors ${
                  sortDir === 'desc'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-bold'
                    : 'hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ArrowUpZA className="w-3.5 h-3.5" />
                  <span>{isFa ? 'مرتب‌سازی نزولی (جدید به قدیمی / Z→A)' : 'Sort Descending (Z → A)'}</span>
                </span>
                {sortDir === 'desc' && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Search Input inside Popover */}
            <div className="p-2 border-b border-[var(--border-subtle)] space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-2 start-2.5 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isFa ? 'جستجو در مقادیر ستون...' : 'Search values...'}
                  className="w-full h-7 ps-8 pe-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="p-0.5 absolute top-1.5 end-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {search.trim() !== '' && hasFilter && (
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--accent-primary)] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addToExisting}
                    onChange={(e) => setAddToExisting(e.target.checked)}
                  />
                  <span>
                    {isFa ? 'افزودن انتخاب فعلی به فیلتر قبلی' : 'Add current selection to filter'}
                  </span>
                </label>
              )}
            </div>

            {/* Distinct Values Checkboxes */}
            <div className="flex-1 min-h-0 max-h-48 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                  {isFa ? 'در حال بارگذاری مقادیر...' : 'Loading values...'}
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                  {isFa ? 'موردی یافت نشد' : 'No matching values'}
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer font-semibold text-[11px] border-b border-[var(--border-subtle)] pb-1.5 mb-1">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={toggleSelectAllVisible}
                    />
                    <span>{isFa ? '(انتخاب همه)' : '(Select All)'}</span>
                  </label>
                  {filteredOptions.slice(0, renderLimit).map((opt) => {
                    const isBlank = opt.token === EMPTY_CELL_TOKEN;
                    const safeCount = typeof opt.count === 'number' && Number.isFinite(opt.count) ? opt.count : 0;
                    return (
                      <label
                        key={opt.token}
                        className="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-[var(--bg-subtle)] cursor-pointer text-[11px]"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={draftChecked.has(opt.token)}
                            onChange={() => toggleToken(opt.token)}
                          />
                          <span
                            className={`truncate bidi-plaintext ${
                              isBlank ? 'italic text-[var(--text-muted)]' : ''
                            }`}
                            title={opt.label}
                          >
                            {isBlank ? (isFa ? '(خالی)' : '(Blanks)') : opt.label}
                          </span>
                        </span>
                        {safeCount > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">
                            {safeCount.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
                          </span>
                        )}
                      </label>
                    );
                  })}
                  {filteredOptions.length > renderLimit && (
                    <button
                      type="button"
                      onClick={() => setRenderLimit((n) => n + 200)}
                      className="w-full py-1.5 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium text-[var(--accent-primary)] text-center"
                    >
                      {isFa
                        ? `نمایش موارد بیشتر (${(filteredOptions.length - renderLimit).toLocaleString('fa-IR')} مورد باقی‌مانده)`
                        : `Show more (${filteredOptions.length - renderLimit} remaining)`}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            <div className="px-2.5 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)] flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!hasFilter}
                onClick={handleClearColFilter}
                className="h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] disabled:opacity-40 hover:bg-[var(--bg-canvas)]"
              >
                {isFa ? 'حذف فیلتر' : 'Clear'}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-7 px-2.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] hover:bg-[var(--bg-canvas)]"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-7 px-3 rounded bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-[11px] font-semibold"
                >
                  {isFa ? 'اعمال' : 'OK'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
