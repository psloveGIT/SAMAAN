import { normalizeDigits } from './jalali.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

const NATURAL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const FA_COLLATOR = new Intl.Collator('fa');
const PURE_NUM_RE = /^\d+(\.\d+)?$/;

function normVal(raw: string | undefined | null): string {
  const s = (raw || '').trim();
  return s ? normalizeDigits(s) : '';
}

function comparePreNormalizedNatural(a: string, aNum: number | null, b: string, bNum: number | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (aNum !== null && bNum !== null && aNum !== bNum) {
    return aNum - bNum;
  }
  return NATURAL_COLLATOR.compare(a, b);
}

function comparePreNormalizedDate(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

function toFinitePureNum(s: string): number | null {
  if (!s || !PURE_NUM_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Natural numeric-aware comparator (handles Persian & English digits, empty strings sorted last).
 */
export function naturalCompare(aRaw: string | undefined | null, bRaw: string | undefined | null): number {
  const a = normVal(aRaw);
  const b = normVal(bRaw);
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const aNum = toFinitePureNum(a);
  const bNum = toFinitePureNum(b);
  if (aNum !== null && bNum !== null && aNum !== bNum) {
    return aNum - bNum;
  }

  return NATURAL_COLLATOR.compare(a, b);
}

/**
 * Sorts General entries deterministically:
 * 1. Arrival Date (تاریخ ورود)
 * 2. Packing List No. (شماره پکینگ لیست)
 * 3. Package No. (شماره نگله)
 * Tie-breakers: createdAt, id
 */
export function sortGeneralEntries(rows: GeneralEntry[]): GeneralEntry[] {
  if (rows.length <= 1) return rows;
  const keyed = rows.map((row) => {
    const pk = normVal(row.packingListNo);
    const pkg = normVal(row.packageNo);
    return {
      row,
      date: normVal(row.arrivalDate),
      pk,
      pkNum: toFinitePureNum(pk),
      pkg,
      pkgNum: toFinitePureNum(pkg),
      createdAt: row.createdAt || '',
      id: row.id || '',
    };
  });
  keyed.sort((a, b) => {
    const byDate = comparePreNormalizedDate(a.date, b.date);
    if (byDate !== 0) return byDate;

    const byPacking = comparePreNormalizedNatural(a.pk, a.pkNum, b.pk, b.pkNum);
    if (byPacking !== 0) return byPacking;

    const byPkg = comparePreNormalizedNatural(a.pkg, a.pkgNum, b.pkg, b.pkgNum);
    if (byPkg !== 0) return byPkg;

    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  for (let i = 0; i < keyed.length; i += 1) {
    rows[i] = keyed[i].row;
  }
  return rows;
}

/**
 * Sorts Detailed entries deterministically:
 * 1. Arrival Date (تاریخ ورود)
 * 2. Shipment / Packing List No. (شماره پکینگ / محموله)
 * 3. Package No. (شماره نگله)
 * 4. Item No. (شماره آیتم)
 * Tie-breakers: createdAt, id
 */
export function sortDetailedEntries(rows: DetailedEntry[]): DetailedEntry[] {
  if (rows.length <= 1) return rows;
  const keyed = rows.map((row) => {
    const ship = normVal(row.shipmentNo);
    const pkg = normVal(row.packageNo);
    const item = normVal(row.itemNo);
    return {
      row,
      date: normVal(row.arrivalDate),
      ship,
      shipNum: toFinitePureNum(ship),
      pkg,
      pkgNum: toFinitePureNum(pkg),
      item,
      itemNum: toFinitePureNum(item),
      createdAt: row.createdAt || '',
      id: row.id || '',
    };
  });
  keyed.sort((a, b) => {
    const byDate = comparePreNormalizedDate(a.date, b.date);
    if (byDate !== 0) return byDate;

    const byShipment = comparePreNormalizedNatural(a.ship, a.shipNum, b.ship, b.shipNum);
    if (byShipment !== 0) return byShipment;

    const byPkg = comparePreNormalizedNatural(a.pkg, a.pkgNum, b.pkg, b.pkgNum);
    if (byPkg !== 0) return byPkg;

    const byItem = comparePreNormalizedNatural(a.item, a.itemNum, b.item, b.itemNum);
    if (byItem !== 0) return byItem;

    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  for (let i = 0; i < keyed.length; i += 1) {
    rows[i] = keyed[i].row;
  }
  return rows;
}

/**
 * Sorts In-Transit entries deterministically:
 * 1. Overall Status (وضعیت کلی)
 * 2. Arrival Date (تاریخ ورود)
 * Tie-breakers: Packing List No., Package No., createdAt, id
 */
export function sortTransitEntries(rows: TransitEntry[]): TransitEntry[] {
  if (rows.length <= 1) return rows;
  const keyed = rows.map((row) => {
    const pk = normVal(row.packingListNo);
    const pkg = normVal(row.packageNo);
    return {
      row,
      st: (row.overallStatus || '').trim(),
      date: normVal(row.arrivalDate),
      pk,
      pkNum: toFinitePureNum(pk),
      pkg,
      pkgNum: toFinitePureNum(pkg),
      createdAt: row.createdAt || '',
      id: row.id || '',
    };
  });
  keyed.sort((a, b) => {
    if (a.st !== b.st) {
      if (!a.st) return 1;
      if (!b.st) return -1;
      const byStatus = FA_COLLATOR.compare(a.st, b.st);
      if (byStatus !== 0) return byStatus;
    }

    const byDate = comparePreNormalizedDate(a.date, b.date);
    if (byDate !== 0) return byDate;

    const byPacking = comparePreNormalizedNatural(a.pk, a.pkNum, b.pk, b.pkNum);
    if (byPacking !== 0) return byPacking;

    const byPkg = comparePreNormalizedNatural(a.pkg, a.pkgNum, b.pkg, b.pkgNum);
    if (byPkg !== 0) return byPkg;

    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  for (let i = 0; i < keyed.length; i += 1) {
    rows[i] = keyed[i].row;
  }
  return rows;
}
