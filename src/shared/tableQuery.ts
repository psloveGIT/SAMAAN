import { convertDotDatesToSlash, formatIsoDate, normalizeDigits } from './jalali.ts';
import type {
  CalendarMode,
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  SiteEntryMinutesRecord,
  TransitEntry,
} from './types.ts';

export const EMPTY_CELL_TOKEN = '__EMPTY__';

export const DATE_COLUMN_KEYS = new Set<string>([
  'arrivalDate',
  'releaseDate',
  'opiInvitationDate',
  'opiDate',
  'mivContractorDate',
  'smrContractorDate',
  'smrMapnaDate',
  'mivMapnaDate',
  'stocktakeDate',
  'productionDate',
  'expirationDate',
  'releaseNetDate',
  'interimDate',
]);

function normKey(s: string | undefined | null): string {
  return String(s || '').trim();
}

export function normDupPart(val: unknown): string {
  return normalizeDigits(String(val ?? ''))
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Duplicate key check for General import:
 * packingListNo, packageNo, itemDescription, supplier, dispatchLocation,
 * arrivalDate, system, subSystem, unit, mapnaEntryMinutesNo.
 */
export function buildGeneralDupKey(
  r: Partial<
    Pick<
      GeneralEntry,
      | 'packingListNo'
      | 'packageNo'
      | 'itemDescription'
      | 'supplier'
      | 'dispatchLocation'
      | 'arrivalDate'
      | 'system'
      | 'subSystem'
      | 'unit'
      | 'mapnaEntryMinutesNo'
    >
  >,
): string {
  const parts = [
    normDupPart(r.packingListNo),
    normDupPart(r.packageNo),
    normDupPart(r.itemDescription),
    normDupPart(r.supplier),
    normDupPart(r.dispatchLocation),
    normDupPart(r.arrivalDate),
    normDupPart(r.system),
    normDupPart(r.subSystem),
    normDupPart(r.unit),
    normDupPart(r.mapnaEntryMinutesNo),
  ];
  if (!parts[0] && !parts[2] && !parts[9]) return '';
  return parts.join('||');
}

/**
 * Duplicate key check for Detailed import:
 * shipmentNo (Packing List), packageNo, itemNo, description, itemCode,
 * supplier, system, subSystem, unit, origin.
 */
export function buildDetailedDupKey(
  r: Partial<
    Pick<
      DetailedEntry,
      | 'shipmentNo'
      | 'packageNo'
      | 'itemNo'
      | 'description'
      | 'itemCode'
      | 'supplier'
      | 'system'
      | 'subSystem'
      | 'unit'
      | 'origin'
    >
  >,
): string {
  const parts = [
    normDupPart(r.shipmentNo),
    normDupPart(r.packageNo),
    normDupPart(r.itemNo),
    normDupPart(r.description),
    normDupPart(r.itemCode),
    normDupPart(r.supplier),
    normDupPart(r.system),
    normDupPart(r.subSystem),
    normDupPart(r.unit),
    normDupPart(r.origin),
  ];
  if (!parts[0] && !parts[3]) return '';
  return parts.join('||');
}

/**
 * Duplicate key check for Transit import:
 * packingListNo, packageNo, itemDescription, overallStatus, arrivalDate,
 * mapnaShippingNotice, supplier, dispatchLocation, system, subSystem,
 * unit, releaseNetNo, interimNo.
 */
export function buildTransitDupKey(
  r: Partial<
    Pick<
      TransitEntry,
      | 'packingListNo'
      | 'packageNo'
      | 'itemDescription'
      | 'overallStatus'
      | 'arrivalDate'
      | 'mapnaShippingNotice'
      | 'supplier'
      | 'dispatchLocation'
      | 'system'
      | 'subSystem'
      | 'unit'
      | 'releaseNetNo'
      | 'interimNo'
    >
  >,
): string {
  const parts = [
    normDupPart(r.packingListNo),
    normDupPart(r.packageNo),
    normDupPart(r.itemDescription),
    normDupPart(r.overallStatus),
    normDupPart(r.arrivalDate),
    normDupPart(r.mapnaShippingNotice),
    normDupPart(r.supplier),
    normDupPart(r.dispatchLocation),
    normDupPart(r.system),
    normDupPart(r.subSystem),
    normDupPart(r.unit),
    normDupPart(r.releaseNetNo),
    normDupPart(r.interimNo),
  ];
  if (!parts[0] && !parts[2] && !parts[3]) return '';
  return parts.join('||');
}

export type ColFilterMap = Record<string, string[]>;

export function parseColFiltersParam(raw: string | undefined | null): ColFilterMap {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ColFilterMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const cleanK = k.trim();
      if (!cleanK || !Array.isArray(v)) continue;
      out[cleanK] = v.map((item) => String(item));
    }
    return out;
  } catch {
    return {};
  }
}

export function getRowFilterToken(
  row: Record<string, unknown>,
  colKey: string,
  calendar: CalendarMode = 'jalali',
): string {
  const raw = row[colKey];
  if (raw === null || raw === undefined) return EMPTY_CELL_TOKEN;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : EMPTY_CELL_TOKEN;
  }
  const str = String(raw).trim();
  if (!str || str === '-' || str === '—') return EMPTY_CELL_TOKEN;
  if (DATE_COLUMN_KEYS.has(colKey)) {
    const formatted = formatIsoDate(str, calendar).trim();
    return formatted || EMPTY_CELL_TOKEN;
  }
  return convertDotDatesToSlash(str);
}

export function matchesColFilters(
  row: Record<string, unknown>,
  colFilters: ColFilterMap,
  calendar: CalendarMode = 'jalali',
): boolean {
  const entries = Object.entries(colFilters);
  if (entries.length === 0) return true;
  for (const [colKey, allowed] of entries) {
    if (!Array.isArray(allowed)) continue;
    const token = getRowFilterToken(row, colKey, calendar);
    if (!allowed.includes(token)) return false;
  }
  return true;
}

export function sortRowsByColumn<T extends Record<string, unknown>>(
  rows: T[],
  sortBy: string,
  sortDir: 'asc' | 'desc',
): T[] {
  if (!sortBy) return rows;
  const factor = sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];
    const aEmpty = va === null || va === undefined || String(va).trim() === '';
    const bEmpty = vb === null || vb === undefined || String(vb).trim() === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * factor;
    }
    const sa = normalizeDigits(String(va).trim());
    const sb = normalizeDigits(String(vb).trim());
    const na = Number(sa);
    const nb = Number(sb);
    if (sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb) && !DATE_COLUMN_KEYS.has(sortBy)) {
      return (na - nb) * factor;
    }
    return sa.localeCompare(sb, 'fa', { numeric: true, sensitivity: 'base' }) * factor;
  });
}

export function collectDistinctColumnValues(
  rows: Record<string, unknown>[],
  colKey: string,
  calendar: CalendarMode = 'jalali',
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(getRowFilterToken(row, colKey, calendar));
  }
  const hasEmpty = set.has(EMPTY_CELL_TOKEN);
  set.delete(EMPTY_CELL_TOKEN);
  const sorted = Array.from(set).sort((a, b) =>
    normalizeDigits(a).localeCompare(normalizeDigits(b), 'fa', { numeric: true, sensitivity: 'base' }),
  );
  if (hasEmpty) sorted.push(EMPTY_CELL_TOKEN);
  return sorted;
}

export function checkDateRangeMulti(isoOrMulti: string, fromDate: string, toDate: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!isoOrMulti) return false;
  const parts = isoOrMulti
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some((d) => {
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}

/**
 * Validates that selected packings share a single unified arrivalDate in General,
 * resolves the canonical arrival date and default releaseNoteNo ('تأیید صورتجلسه‌ی ورود').
 */
export function resolveSiteEntryArrivalAndRelease(
  packingListNos: string[],
  rawReleaseNoteNo: string | undefined,
  generalEntries: GeneralEntry[],
  transitEntries: TransitEntry[],
): {
  errorFa?: string;
  errorEn?: string;
  resolvedArrivalDate: string;
  resolvedReleaseNoteNo: string;
} {
  const pkSet = new Set(packingListNos.map((p) => normKey(p)).filter(Boolean));
  const matchingGeneral = generalEntries.filter((g) => pkSet.has(normKey(g.packingListNo)));
  const arrivalDates = Array.from(
    new Set(
      matchingGeneral
        .map((g) => normKey(g.arrivalDate).split(/\r?\n/)[0]?.trim() || '')
        .filter(Boolean),
    ),
  );

  if (arrivalDates.length > 1) {
    return {
      errorFa:
        'پکینگ‌لیست‌های انتخاب‌شده دارای تاریخ ورود متفاوت هستند. هر صورتجلسه ورود به کارگاه فقط باید برای یک تاریخ ورود واحد ثبت شود.',
      errorEn:
        'Selected Packing Lists have different arrival dates. Each Site Entry Minutes record must belong to a single arrival date.',
      resolvedArrivalDate: '',
      resolvedReleaseNoteNo: '',
    };
  }

  let resolvedReleaseNoteNo = normKey(rawReleaseNoteNo);
  if (!resolvedReleaseNoteNo) {
    const genRel = matchingGeneral.find((g) => normKey(g.releaseNo))?.releaseNo;
    const trRel = transitEntries.find((t) => pkSet.has(normKey(t.packingListNo)) && normKey(t.releaseNetNo))?.releaseNetNo;
    resolvedReleaseNoteNo = normKey(genRel || trRel) || 'تأیید صورتجلسه‌ی ورود';
  }

  return {
    resolvedArrivalDate: arrivalDates[0] || '',
    resolvedReleaseNoteNo,
  };
}

export type QueryScope = 'general' | 'detailed' | 'transit';
export type ScopeRowAny = GeneralEntry | DetailedComputed | TransitEntry | SiteEntryMinutesRecord;
