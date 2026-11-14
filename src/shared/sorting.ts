import { normalizeDigits } from './jalali.ts';
import type { DetailedEntry, GeneralEntry } from './types.ts';

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
 * 2. MAPNA Entry Minutes No. (شماره صورتجلسه ورود مپنا)
 * Tie-breakers: Packing List No., Package No., createdAt, id
 */
export function sortGeneralEntries(rows: GeneralEntry[]): GeneralEntry[] {
  return rows.sort((a, b) => {
    const byDate = dateCompareAsc(a.arrivalDate, b.arrivalDate);
    if (byDate !== 0) return byDate;

    const byMapna = naturalCompare(a.mapnaEntryMinutesNo, b.mapnaEntryMinutesNo);
    if (byMapna !== 0) return byMapna;

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
