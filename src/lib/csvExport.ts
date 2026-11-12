import { formatIsoDate } from '../shared/jalali.ts';
import type { CalendarMode } from '../shared/types.ts';

function escapeCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumnDef<T> {
  key: string;
  header: string;
  isDate?: boolean;
  getValue: (row: T) => string | number | null | undefined;
}

export function exportRowsToCsv<T>(params: {
  rows: T[];
  columns: CsvColumnDef<T>[];
  filename: string;
  calendar: CalendarMode;
  hideEmptyColumns?: boolean;
}): void {
  const { rows, columns, filename, calendar, hideEmptyColumns = true } = params;
  const activeCols = hideEmptyColumns
    ? columns.filter((col) =>
        rows.some((r) => {
          const v = col.getValue(r);
          return v !== null && v !== undefined && String(v).trim() !== '';
        }),
      )
    : columns;

  const headerLine = activeCols.map((c) => escapeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    activeCols
      .map((col) => {
        const raw = col.getValue(row);
        if (col.isDate && typeof raw === 'string' && raw.trim()) {
          return escapeCell(formatIsoDate(raw, calendar));
        }
        return escapeCell(raw);
      })
      .join(','),
  );

  // UTF-8 BOM ensures Excel opens Persian characters cleanly
  const content = `\uFEFF${[headerLine, ...lines].join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
