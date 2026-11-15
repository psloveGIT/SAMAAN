import * as XLSX from 'xlsx';
import { parseCsvMatrix } from './csvParser.ts';

export interface ParsedSpreadsheetFile {
  fileName: string;
  sheetNames: string[];
  sheets: Record<string, string[][]>;
  defaultSheet: string;
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    return cell.toISOString().slice(0, 10);
  }
  return String(cell).trim();
}

function jsonRecordsToMatrix(records: Record<string, unknown>[]): string[][] {
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
 * Parses Excel (.xlsx, .xls, .ods), CSV, TSV, or JSON array files into clean string[][] matrices.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheetFile> {
  const name = file.name || 'data';
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rows)
        ? parsed.rows
        : Array.isArray(parsed?.general)
          ? parsed.general
          : [];
    const matrix = jsonRecordsToMatrix(arr as Record<string, unknown>[]);
    return {
      fileName: name,
      sheetNames: ['JSON'],
      sheets: { JSON: matrix },
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
