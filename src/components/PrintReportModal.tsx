import React, { useEffect, useMemo, useState } from 'react';
import { triggerAppPrint } from '../lib/print.ts';
import { createPortal } from 'react-dom';
import { CheckSquare, Printer, Square, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { formatDisplayNumber, formatIsoDate } from '../shared/jalali.ts';
import {
  computeAutoColumnWidths,
  type AutoColumnDescriptor,
} from '../shared/printAutoLayout.ts';
export interface PrintColumnDef<T> {
  key: string;
  header: string;
  isDate?: boolean;
  getValue: (row: T) => string | number | null | undefined;
}

interface PrintReportModalProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  columns: PrintColumnDef<T>[];
  rows: T[];
  defaultSelectedKeys?: string[];
}

export function PrintReportModal<T>({
  open,
  onClose,
  title,
  subtitle,
  columns,
  rows,
  defaultSelectedKeys,
}: PrintReportModalProps<T>) {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const nonEmptyKeys = columns
      .filter((col) =>
        rows.some((r) => {
          const v = col.getValue(r);
          return v !== null && v !== undefined && String(v).trim() !== '';
        }),
      )
      .map((c) => c.key);

    if (defaultSelectedKeys && defaultSelectedKeys.length > 0) {
      setSelectedKeys(defaultSelectedKeys);
    } else if (nonEmptyKeys.length > 0) {
      setSelectedKeys(nonEmptyKeys);
    } else {
      setSelectedKeys(columns.map((c) => c.key));
    }
  }, [open, columns, rows, defaultSelectedKeys]);

  const activeColumns = useMemo(
    () => (open ? columns.filter((c) => selectedKeys.includes(c.key)) : []),
    [open, columns, selectedKeys],
  );

  const nonEmptyColumnKeys = useMemo(
    () =>
      open
        ? columns
            .filter((col) =>
              rows.some((r) => {
                const v = col.getValue(r);
                return v !== null && v !== undefined && String(v).trim() !== '';
              }),
            )
            .map((c) => c.key)
        : [],
    [open, columns, rows],
  );

  const autoColLayout = useMemo(() => {
    if (!open || activeColumns.length === 0) {
      return { widthsPercent: [] as number[], recommendedFontPx: 9.5 };
    }
    const descriptors: AutoColumnDescriptor[] = activeColumns.map((col) => {
      const sampleRow = rows.find((r) => {
        const v = col.getValue(r);
        return v !== null && v !== undefined && String(v).trim() !== '';
      });
      const sampleVal = sampleRow ? col.getValue(sampleRow) : '';
      const isCompact = Boolean(col.isDate) || typeof sampleVal === 'number';
      return {
        key: col.key,
        header: col.header,
        kind: isCompact ? 'compact' : 'fluid',
      };
    });
    const sampleRows = rows.slice(0, 120).map((row) =>
      activeColumns.map((col) => {
        const raw = col.getValue(row);
        if (col.isDate && typeof raw === 'string' && raw.trim()) {
          return formatIsoDate(raw, prefs.calendar);
        }
        return raw === null || raw === undefined ? '' : String(raw);
      }),
    );
    return computeAutoColumnWidths(descriptors, sampleRows, { baseFontPx: 9.5, minFontPx: 7.4 });
  }, [open, activeColumns, rows, prefs.calendar]);

  if (!open) return null;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const formattedToday = formatIsoDate(todayIso, prefs.calendar);

  const handlePrint = () => {
    if (activeColumns.length === 0) return;
    triggerAppPrint();
  };

  const printPortal = createPortal(
    <div id="samaan-print-root" data-samaan-print-portal="true" dir={isFa ? 'rtl' : 'ltr'}>
      <style>{`
        @media screen {
          #samaan-print-root { display: none !important; }
        }
        @media print {
          @page {
            size: A4 ${orientation};
            margin: 8mm 8mm 11mm 8mm;
            background: #ffffff;
            @bottom-center {
              content: ${isFa ? '"صفحه: " counter(page) " از " counter(pages)' : '"Page: " counter(page) " of " counter(pages)'};
              font-family: 'Vazirmatn', 'Plus Jakarta Sans', system-ui, sans-serif;
              font-size: 8.5pt;
              font-weight: 600;
              color: #334155;
              direction: ${isFa ? 'rtl' : 'ltr'};
            }
          }
          :root, html, html.dark, html.eye-comfort, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
          }
          body > #root,
          body > *:not(#samaan-print-root) {
            display: none !important;
            visibility: hidden !important;
          }
          #samaan-print-root {
            display: block !important;
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-family: 'Vazirmatn', system-ui, sans-serif;
            font-size: 9.5px;
            line-height: 1.45;
            width: 100% !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #samaan-print-root table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: auto !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          #samaan-print-root thead {
            display: table-header-group !important;
          }
          #samaan-print-root tfoot {
            display: table-footer-group !important;
          }
          #samaan-print-root tbody {
            display: table-row-group !important;
          }
          #samaan-print-root tr {
            height: auto !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #samaan-print-root th,
          #samaan-print-root td {
            border: 1px solid #cbd5e1;
            padding: 4px 5px;
            text-align: center;
            vertical-align: middle;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            height: auto !important;
          }
          #samaan-print-root th {
            background: #f1f5f9 !important;
            font-weight: 700;
            white-space: nowrap;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #samaan-print-root td.samaan-print-num {
            width: 1%;
            white-space: nowrap;
          }
          #samaan-print-root tr:nth-child(even) td {
            background: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div style={{ marginBottom: '10px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{subtitle}</div>}
        </div>
        <div style={{ fontSize: '10px', color: '#334155', textAlign: isFa ? 'left' : 'right' }}>
          <div>{isFa ? 'سامانه مدیریت انبار سمان' : 'SAMAAN Warehouse Management'}</div>
          <div>
            {isFa ? 'تاریخ چاپ:' : 'Print Date:'} {formattedToday} · {isFa ? 'تعداد ردیف:' : 'Rows:'} {rows.length}
          </div>
        </div>
      </div>

      <table
        className="samaan-dynamic-table"
        style={{ fontSize: `${autoColLayout.recommendedFontPx}px` }}
      >
        <colgroup>
          {autoColLayout.widthsPercent.map((pct, i) => (
            <col key={activeColumns[i]?.key || i} style={{ width: `${pct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {activeColumns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {activeColumns.map((col) => {
                const raw = col.getValue(row);
                const val =
                  col.isDate && typeof raw === 'string' && raw.trim()
                    ? formatIsoDate(raw, prefs.calendar)
                    : typeof raw === 'number'
                      ? formatDisplayNumber(raw, prefs.language)
                      : raw === null || raw === undefined || String(raw).trim() === ''
                        ? '—'
                        : String(raw).replace(/\u066B/g, '.');
                const isCompact = typeof raw === 'number' || Boolean(col.isDate) || val.length <= 16;
                return (
                  <td
                    key={col.key}
                    className={isCompact ? 'samaan-print-num tabular-nums' : 'bidi-plaintext'}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body,
  );

  return (
    <>
      {printPortal}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Printer className="w-4 h-4 text-[var(--accent-primary)]" />
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {isFa ? 'تنظیمات چاپ گزارش' : 'Print Report Configuration'}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {title} · <span className="tabular-nums">{rows.length}</span> {isFa ? 'ردیف' : 'rows'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedKeys(columns.map((c) => c.key))}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                >
                  {isFa ? 'انتخاب همه ستون‌ها' : 'Select All Columns'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys(nonEmptyColumnKeys)}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                >
                  {isFa ? 'فقط ستون‌های دارای مقدار' : 'Non-Empty Only'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys([])}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                >
                  {isFa ? 'لغو انتخاب همه' : 'Select None'}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--text-muted)]">{isFa ? 'جهت صفحه:' : 'Page:'}</span>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    orientation === 'landscape'
                      ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  {isFa ? 'افقی' : 'Landscape'}
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    orientation === 'portrait'
                      ? 'bg-[var(--accent-subtle)] border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  {isFa ? 'عمودی' : 'Portrait'}
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                {isFa
                  ? `ستون‌های قابل چاپ (${selectedKeys.length} از ${columns.length} ستون انتخاب شده):`
                  : `Columns to print (${selectedKeys.length} of ${columns.length} selected):`}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40">
                {columns.map((col) => {
                  const checked = selectedKeys.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleKey(col.key)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-start border transition-colors ${
                        checked
                          ? 'bg-[var(--bg-surface)] border-[var(--accent-primary)]/40 text-[var(--text-primary)] font-medium'
                          : 'bg-transparent border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-surface)]/60'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{col.header}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 p-3">
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                {isFa ? 'پیش‌نمایش ستون‌ها و ۵ ردیف اول:' : 'Preview (first 5 rows):'}
              </div>
              {activeColumns.length === 0 ? (
                <p className="text-xs text-[var(--status-danger)] py-2">
                  {isFa ? 'حداقل یک ستون برای چاپ انتخاب کنید.' : 'Select at least one column to print.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                        {activeColumns.map((col) => (
                          <th key={col.key} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-b border-[var(--border-subtle)]/50">
                          {activeColumns.map((col) => {
                            const raw = col.getValue(r);
                            const v =
                              col.isDate && typeof raw === 'string' && raw.trim()
                                ? formatIsoDate(raw, prefs.calendar)
                                : typeof raw === 'number'
                                  ? formatDisplayNumber(raw, prefs.language)
                                  : raw === null || raw === undefined || String(raw).trim() === ''
                                    ? '—'
                                    : String(raw).replace(/\u066B/g, '.');
                            return (
                              <td key={col.key} className="px-2 py-1 whitespace-nowrap max-w-[160px] truncate">
                                {v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              {isFa ? 'انصراف' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={activeColumns.length === 0 || rows.length === 0}
              onClick={handlePrint}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-2"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isFa ? 'چاپ گزارش' : 'Print Report'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
