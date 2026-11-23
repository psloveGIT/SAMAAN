import { normalizeDigits } from './jalali.ts';
import type { DetailedComputed } from './types.ts';

export interface WarehouseLocationRule {
  code: string;
  warehouseFa: string;
}

/**
 * Exact 20 Warehouse mapping rules for MD1 Storage Label (MD1EX-FQP02/14-01).
 * Ordered from most-specific multi-character codes down to single-character "S"
 * so codes like "SITE" or compound locations like "W1-S2" never falsely match "S".
 */
export const WAREHOUSE_LOCATION_RULES: readonly WarehouseLocationRule[] = [
  // 5-char & 4-char codes
  { code: 'Mapna', warehouseFa: 'اتاق تأمین تجهیزات' },
  { code: 'WNNC', warehouseFa: 'انبار نصب نیرو ساختمان' },
  { code: 'WNNE', warehouseFa: 'انبار نصب نیرو نصب' },
  { code: 'SITE', warehouseFa: 'سایت' },
  { code: 'Meco', warehouseFa: 'اتاق مکو' },
  { code: 'Tuga', warehouseFa: 'اتاق توگا' },
  // 2-char codes
  { code: 'W1', warehouseFa: 'انبار روباز' },
  { code: 'W2', warehouseFa: 'انبار باسکول' },
  { code: 'W3', warehouseFa: 'انبار ساحل' },
  { code: 'CA', warehouseFa: 'کانتینر A' },
  { code: 'CB', warehouseFa: 'کانتینر B' },
  { code: 'CC', warehouseFa: 'کانتینر C' },
  { code: 'CD', warehouseFa: 'کانتینر D' },
  { code: 'CE', warehouseFa: 'کانتینر E' },
  { code: 'CF', warehouseFa: 'کانتینر F' },
  { code: 'CG', warehouseFa: 'کانتینر G' },
  { code: 'CH', warehouseFa: 'کانتینر H' },
  { code: 'CR', warehouseFa: 'اتاق ابزار دقیق' },
  { code: 'PR', warehouseFa: 'اتاق مواد شیمیایی' },
  // 1-char code MUST be evaluated last
  { code: 'S', warehouseFa: 'سوله‌ی سر پوشیده' },
] as const;

export const MD1_STORAGE_LABEL_FORM_CODE = 'MD1EX-FQP02/14-01';
export const MD1_STORAGE_LABEL_QA_NOTICE =
  'Notice: This form is controlled by Q.A discipline and every change have to be with Q.A permission.';

/**
 * Resolves the Persian warehouse name from the Detailed table's "محل نگهداری" (storageLocation) column.
 * Supports case-insensitive matching and Persian/Arabic digit normalization (e.g., W۱ -> W1).
 *
 * Pass 1 matches standalone or digit-suffixed tokens (e.g. "PR" in "PR-Chem", "S" in "S12" or "S-04")
 * so codes inside unrelated English words (like "CH" in "Chem" or "S" in "Shelf") never steal a match.
 * Pass 2 falls back to specificity-ordered substring matching for unseparated strings (e.g. "انبارW2").
 */
export function resolveWarehouseFromLocation(storageLocation?: string | null): string {
  const raw = normalizeDigits(String(storageLocation || '')).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();

  // Pass 1: exact token or code+digits boundary match (not preceded or followed by an ASCII letter)
  for (const rule of WAREHOUSE_LOCATION_RULES) {
    const codeUpper = rule.code.toUpperCase();
    const pattern = new RegExp(`(^|[^A-Z])${codeUpper}($|[^A-Z])`);
    if (pattern.test(upper)) {
      return rule.warehouseFa;
    }
  }

  // Pass 2: specificity-ordered substring fallback
  for (const rule of WAREHOUSE_LOCATION_RULES) {
    if (upper.includes(rule.code.toUpperCase())) {
      return rule.warehouseFa;
    }
  }
  return '';
}

/**
 * Formats the "SYSTEM" field: system outside parentheses and subSystem inside parentheses.
 * Example: "Turbine (Lube Oil)"
 */
export function formatStorageLabelSystem(
  system?: string | null,
  subSystem?: string | null,
): string {
  const sys = String(system || '').trim();
  const sub = String(subSystem || '').trim();
  if (sys && sub) return `${sys} (${sub})`;
  if (sys) return sys;
  if (sub) return `(${sub})`;
  return '';
}

/**
 * Formats the "Package No." field: shipmentNo outside parentheses and packageNo inside parentheses.
 * Example: "PK-100 (PKG-02)"
 */
export function formatStorageLabelPackageNo(
  shipmentNo?: string | null,
  packageNo?: string | null,
): string {
  const ship = String(shipmentNo || '').trim();
  const pkg = String(packageNo || '').trim();
  if (ship && pkg) return `${ship} (${pkg})`;
  if (ship) return ship;
  if (pkg) return `(${pkg})`;
  return '';
}

export interface Md1StorageLabelData {
  id: string;
  project: string;
  warehouse: string;
  tagNo: string;
  description: string;
  system: string;
  packageNo: string;
  itemNo: string;
  location: string;
  vendor: string;
  drumNumber: string;
}

/**
 * Maps a Detailed Equipment row + active Project Name into the exact fields of MD1EX-FQP02/14-01.
 */
export function buildMd1StorageLabelData(
  item: Pick<
    DetailedComputed,
    | 'id'
    | 'itemCode'
    | 'description'
    | 'system'
    | 'subSystem'
    | 'shipmentNo'
    | 'packageNo'
    | 'itemNo'
    | 'storageLocation'
    | 'supplier'
    | 'notes'
  >,
  projectName?: string | null,
): Md1StorageLabelData {
  return {
    id: item.id,
    project: String(projectName || '').trim(),
    warehouse: resolveWarehouseFromLocation(item.storageLocation),
    tagNo: String(item.itemCode || '').trim(),
    description: String(item.description || '').trim(),
    system: formatStorageLabelSystem(item.system, item.subSystem),
    packageNo: formatStorageLabelPackageNo(item.shipmentNo, item.packageNo),
    itemNo: String(item.itemNo || '').trim(),
    location: String(item.storageLocation || '').trim(),
    vendor: String(item.supplier || '').trim(),
    drumNumber: String(item.notes || '').trim(),
  };
}

export type QuadA4Page<T> = [T | null, T | null, T | null, T | null];

/**
 * Packs labels into strict 4-slot A4 pages (2x2 grid).
 * Whether 1 label or 1,000 labels are selected, EVERY A4 page always contains exactly 4 fixed-size slots
 * so single/partial pages keep exact quarter-A4 form dimensions rather than stretching.
 */
export function chunkStorageLabelsToA4QuadPages<T>(
  items: readonly T[],
  copiesPerItem = 1,
): Array<QuadA4Page<T>> {
  const safeCopies = Math.max(1, Math.min(20, Math.floor(Number(copiesPerItem) || 1)));
  if (!items || items.length === 0) return [];

  const expanded: T[] = [];
  for (const item of items) {
    for (let c = 0; c < safeCopies; c += 1) {
      expanded.push(item);
    }
  }

  const pages: Array<QuadA4Page<T>> = [];
  for (let i = 0; i < expanded.length; i += 4) {
    pages.push([
      expanded[i] ?? null,
      expanded[i + 1] ?? null,
      expanded[i + 2] ?? null,
      expanded[i + 3] ?? null,
    ]);
  }
  return pages;
}
