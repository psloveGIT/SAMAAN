import * as XLSX from 'xlsx';
import { parseCsvMatrix } from './csvParser.ts';

export interface StructuredSheetPayload {
  sheetName: string;
  sectionHint?: string;
  records: Record<string, unknown>[];
}

export interface ParsedSpreadsheetFile {
  fileName: string;
  sheetNames: string[];
  sheets: Record<string, string[][]>;
  structuredSheets?: Record<string, StructuredSheetPayload>;
  defaultSheet: string;
}

const KNOWN_JSON_SECTION_KEYS: Array<{ key: string; sheetLabel: string; hint: string }> = [
  { key: 'transit', sheetLabel: 'در راه (Transit)', hint: 'transit' },
  { key: 'general', sheetLabel: 'ثبت کلی (General)', hint: 'general' },
  { key: 'detailed', sheetLabel: 'ثبت جزئیات (Detailed)', hint: 'detailed' },
  { key: 'siteEntryMinutes', sheetLabel: 'صورتجلسه ورود کالا', hint: 'siteEntryMinutes' },
  { key: 'opiInvitations', sheetLabel: 'دعوتنامه OPI', hint: 'opiInvitations' },
  { key: 'opiMinutes', sheetLabel: 'صورتجلسه OPI', hint: 'opiMinutes' },
  { key: 'osdrReports', sheetLabel: 'گزارش مغایرت MER', hint: 'osdrReports' },
  { key: 'gcvDocuments', sheetLabel: 'رسید مصرف مستقیم GCV', hint: 'gcvDocuments' },
  { key: 'mivDocuments', sheetLabel: 'حواله و ارجاع MIV/SMR', hint: 'mivDocuments' },
  { key: 'substitutions', sheetLabel: 'فرم جایگزینی تجهیزات', hint: 'substitutions' },
  { key: 'materialEstimates', sheetLabel: 'برآورد تجهیزات MTO', hint: 'materialEstimates' },
  { key: 'periodicInspections', sheetLabel: 'بازدید ادواری انبار', hint: 'periodicInspections' },
  { key: 'stocktake', sheetLabel: 'انبارگردانی', hint: 'stocktake' },
  { key: 'customFormSubmissions', sheetLabel: 'فرم‌های اختصاصی کارفرما', hint: 'customFormSubmissions' },
];

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10);
  }
  if (Array.isArray(cell)) {
    return cell
      .map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : String(item ?? '')))
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell);
    } catch {
      return String(cell);
    }
  }
  return String(cell).trim();
}

export function jsonRecordsToMatrix(records: Record<string, unknown>[]): string[][] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const headerSet = new Set<string>();
  for (const row of records) {
    if (row && typeof row === 'object') {
      for (const k of Object.keys(row)) headerSet.add(k);
    }
  }
  const headers = Array.from(headerSet);
  const matrix: string[][] = [headers];
  for (const row of records) {
    matrix.push(headers.map((h) => cellToString(row?.[h])));
  }
  return matrix;
}

/**
 * Parses Excel (.xlsx, .xls, .ods), CSV, TSV, or JSON (single array or multi-section object) files
 * into clean string[][] matrices plus structured JSON records when available.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheetFile> {
  const name = file.name || 'data';
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const sheets: Record<string, string[][]> = {};
    const structuredSheets: Record<string, StructuredSheetPayload> = {};
    const sheetNames: string[] = [];

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Multi-section JSON object (e.g., SAMAAN export or custom multi-form JSON)
      for (const sec of KNOWN_JSON_SECTION_KEYS) {
        const val = (parsed as Record<string, unknown>)[sec.key];
        if (Array.isArray(val) && val.length > 0) {
          const objRows = val.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
          if (objRows.length > 0) {
            sheetNames.push(sec.sheetLabel);
            sheets[sec.sheetLabel] = jsonRecordsToMatrix(objRows);
            structuredSheets[sec.sheetLabel] = {
              sheetName: sec.sheetLabel,
              sectionHint: sec.hint,
              records: objRows,
            };
          }
        }
      }

      if (sheetNames.length > 0) {
        return {
          fileName: name,
          sheetNames,
          sheets,
          structuredSheets,
          defaultSheet: sheetNames[0],
        };
      }

      // Single-section envelope like { scope/type, records/rows/items/data: [...] }
      const rawArr =
        (Array.isArray(parsed.records) && parsed.records) ||
        (Array.isArray(parsed.rows) && parsed.rows) ||
        (Array.isArray(parsed.documents) && parsed.documents) ||
        (Array.isArray(parsed.submissions) && parsed.submissions) ||
        (Array.isArray(parsed.invitations) && parsed.invitations) ||
        (Array.isArray(parsed.minutes) && parsed.minutes) ||
        (Array.isArray(parsed.items) && parsed.items) ||
        (Array.isArray(parsed.data) && parsed.data) ||
        [parsed];
      const objRows = (rawArr as unknown[]).filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'),
      );
      const hint =
        typeof parsed.scope === 'string'
          ? parsed.scope
          : typeof parsed.type === 'string'
            ? parsed.type
            : undefined;
      return {
        fileName: name,
        sheetNames: ['JSON'],
        sheets: { JSON: jsonRecordsToMatrix(objRows) },
        structuredSheets: {
          JSON: {
            sheetName: 'JSON',
            sectionHint: hint,
            records: objRows,
          },
        },
        defaultSheet: 'JSON',
      };
    }

    const arr = Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : [];
    const matrix = jsonRecordsToMatrix(arr);
    return {
      fileName: name,
      sheetNames: ['JSON'],
      sheets: { JSON: matrix },
      structuredSheets: {
        JSON: {
          sheetName: 'JSON',
          records: arr,
        },
      },
      defaultSheet: 'JSON',
    };
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = await file.text();
    const normalized = lower.endsWith('.tsv')
      ? text.replace(/\t/g, ',')
      : text;
    const matrix = parseCsvMatrix(normalized);
    return {
      fileName: name,
      sheetNames: ['Sheet1'],
      sheets: { Sheet1: matrix },
      defaultSheet: 'Sheet1',
    };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheets: Record<string, string[][]> = {};
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });
    const cleaned = aoa
      .map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
      .filter((row) => row.some((c) => c !== ''));
    sheets[sheetName] = cleaned;
  }

  const defaultSheet = workbook.SheetNames[0] || 'Sheet1';
  return {
    fileName: name,
    sheetNames: workbook.SheetNames,
    sheets,
    defaultSheet,
  };
}

/**
 * Converts a string[][] matrix into compact CSV text for sending to /api/import/* or AI extractor.
 */
export function matrixToCsvText(matrix: string[][], maxRows?: number): string {
  const slice = maxRows ? matrix.slice(0, maxRows) : matrix;
  return slice
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(','),
    )
    .join('\n');
}
