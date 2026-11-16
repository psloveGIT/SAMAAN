import { normalizeDigits } from './jalali.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

/**
 * Natural numeric-aware comparator (handles Persian & English digits, empty strings sorted last).
 */
export function naturalCompare(aRaw: string | undefined | null, bRaw: string | undefined | null): number {
  const a = normalizeDigits((aRaw || '').trim());
  const b = normalizeDigits((bRaw || '').trim());
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  if (/^\d+(\.\d+)?$/.test(a) && /^\d+(\.\d+)?$/.test(b) && Number.isFinite(aNum) && Number.isFinite(bNum)) {
    if (aNum !== bNum) return aNum - bNum;
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function dateCompareAsc(aRaw: string | undefined | null, bRaw: string | undefined | null): number {
  const a = normalizeDigits((aRaw || '').trim());
  const b = normalizeDigits((bRaw || '').trim());
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

/**
 * Sorts General entries deterministically:
 * 1. Arrival Date (تاریخ ورود)
 * 2. Packing List No. (شماره پکینگ لیست)
 * 3. Package No. (شماره نگله)
 * Tie-breakers: createdAt, id
 */
export function sortGeneralEntries(rows: GeneralEntry[]): GeneralEntry[] {
  return rows.sort((a, b) => {
    const byDate = dateCompareAsc(a.arrivalDate, b.arrivalDate);
    if (byDate !== 0) return byDate;

    const byPacking = naturalCompare(a.packingListNo, b.packingListNo);
    if (byPacking !== 0) return byPacking;

    const byPkg = naturalCompare(a.packageNo, b.packageNo);
    if (byPkg !== 0) return byPkg;

    return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
  });
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
  return rows.sort((a, b) => {
    const byDate = dateCompareAsc(a.arrivalDate, b.arrivalDate);
    if (byDate !== 0) return byDate;

    const byShipment = naturalCompare(a.shipmentNo, b.shipmentNo);
    if (byShipment !== 0) return byShipment;

    const byPkg = naturalCompare(a.packageNo, b.packageNo);
    if (byPkg !== 0) return byPkg;

    const byItem = naturalCompare(a.itemNo, b.itemNo);
    if (byItem !== 0) return byItem;

    return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
  });
}

/**
 * Sorts In-Transit entries deterministically:
 * 1. Overall Status (وضعیت کلی)
 * 2. Arrival Date (تاریخ ورود)
 * Tie-breakers: Packing List No., Package No., createdAt, id
 */
export function sortTransitEntries(rows: TransitEntry[]): TransitEntry[] {
  return rows.sort((a, b) => {
    const stA = (a.overallStatus || '').trim();
    const stB = (b.overallStatus || '').trim();
    if (!stA && stB) return 1;
    if (stA && !stB) return -1;
    const byStatus = stA.localeCompare(stB, 'fa');
    if (byStatus !== 0) return byStatus;

    const byDate = dateCompareAsc(a.arrivalDate, b.arrivalDate);
    if (byDate !== 0) return byDate;

    const byPacking = naturalCompare(a.packingListNo, b.packingListNo);
    if (byPacking !== 0) return byPacking;

    const byPkg = naturalCompare(a.packageNo, b.packageNo);
    if (byPkg !== 0) return byPkg;

    return (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);
  });
}
