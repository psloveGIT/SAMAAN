import { computeDetailedEntry, isMerOpen, isRepOpen, roundQty } from './formulas.ts';
import { convertDotDatesToSlash, formatIsoDate, normalizeDigits } from './jalali.ts';
import type {
  CalendarMode,
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  SiteEntryMinutesRecord,
  TransitEntry,
  TrashRecord,
} from './types.ts';

export const EMPTY_CELL_TOKEN = '__EMPTY__';

const FA_NUMERIC_COLLATOR = new Intl.Collator('fa', { numeric: true, sensitivity: 'base' });

export interface DistinctColumnValue {
  token: string;
  label: string;
  count: number;
}

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
  'deletedDate',
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

export interface PreparedPackageToken {
  raw: string;
  digitsOnly: number | null;
  suffixDigits: number | null;
}

export interface PreparedPackageInfo {
  norm: string;
  compact: string;
  isPureDigits: boolean;
  tokens: PreparedPackageToken[];
}

function parsePackageToken(t: string): PreparedPackageToken {
  if (/^\d+$/.test(t)) {
    return { raw: t, digitsOnly: Number(t), suffixDigits: null };
  }
  const m = t.match(/^[a-z\u0600-\u06ff]+0*(\d+)$/);
  if (m) {
    return { raw: t, digitsOnly: null, suffixDigits: Number(m[1]) };
  }
  return { raw: t, digitsOnly: null, suffixDigits: null };
}

export function preparePackageInfo(raw: string | undefined | null): PreparedPackageInfo {
  const norm = normDupPart(raw);
  if (!norm) {
    return { norm: '', compact: '', isPureDigits: false, tokens: [] };
  }
  const compact = norm.replace(/[^a-z0-9\u0600-\u06ff]/g, '');
  const tokens = norm
    .split(/[\s,،;|/\\\-_+().:]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(parsePackageToken);
  return {
    norm,
    compact,
    isPureDigits: /^\d+$/.test(compact),
    tokens,
  };
}

function preparedTokensEqual(a: PreparedPackageToken, b: PreparedPackageToken): boolean {
  if (a.raw === b.raw) return true;
  if (a.digitsOnly !== null && b.digitsOnly !== null) {
    return a.digitsOnly === b.digitsOnly;
  }
  if (a.suffixDigits !== null && b.digitsOnly !== null) {
    return a.suffixDigits === b.digitsOnly;
  }
  if (b.suffixDigits !== null && a.digitsOnly !== null) {
    return b.suffixDigits === a.digitsOnly;
  }
  return false;
}

export function matchesPreparedPackage(
  cand: PreparedPackageInfo,
  query: PreparedPackageInfo,
): boolean {
  if (!query.norm) return true;
  if (!cand.norm) return false;
  if (cand.norm === query.norm) return true;
  if (cand.compact && query.compact && cand.compact === query.compact) return true;

  for (let i = 0; i < query.tokens.length; i += 1) {
    const qt = query.tokens[i];
    for (let j = 0; j < cand.tokens.length; j += 1) {
      if (preparedTokensEqual(cand.tokens[j], qt)) return true;
    }
  }

  if (!query.isPureDigits && query.compact.length >= 2 && cand.compact.includes(query.compact)) {
    return true;
  }
  if (!cand.isPureDigits && cand.compact.length >= 2 && query.compact.includes(cand.compact)) {
    return true;
  }
  return false;
}

/**
 * Flexible package number matching between General and Detailed entries.
 * Handles cases where General contains "PKG-01", "1-2", "1/3", "Box 01"
 * while Detailed contains "1", "01", "PKG1", etc., without false positives
 * such as "1" matching "10" or "11".
 */
export function matchesPackagePartial(
  candidatePkg: string | undefined | null,
  queryPkg: string | undefined | null,
): boolean {
  const qNorm = normDupPart(queryPkg);
  if (!qNorm) return true;
  const cNorm = normDupPart(candidatePkg);
  if (!cNorm) return false;
  if (cNorm === qNorm) return true;
  return matchesPreparedPackage(preparePackageInfo(cNorm), preparePackageInfo(qNorm));
}

export interface GeneralLinkedStatus {
  detailedCount: number;
  hasLinkedShortage: boolean;
  hasLinkedDamaged: boolean;
  hasLinkedDiscrepancy: boolean;
  hasLinkedReplaced: boolean;
}

const EMPTY_LINKED_STATUS: GeneralLinkedStatus = {
  detailedCount: 0,
  hasLinkedShortage: false,
  hasLinkedDamaged: false,
  hasLinkedDiscrepancy: false,
  hasLinkedReplaced: false,
};

interface PkgGroupSummary {
  preparedPkg: PreparedPackageInfo;
  count: number;
  hasShortage: boolean;
  hasDamaged: boolean;
  hasDiscrepancy: boolean;
  hasReplaced: boolean;
}

interface PkBucketSummary {
  groups: PkgGroupSummary[];
  allInPk: GeneralLinkedStatus;
  byNorm: Map<string, number[]>;
  byCompact: Map<string, number[]>;
  byTokenRaw: Map<string, number[]>;
  byDigitsOnly: Map<number, number[]>;
  bySuffixDigits: Map<number, number[]>;
  byCompactBigram: Map<string, number[]> | null;
  byCompactTrigram: Map<string, number[]> | null;
  byNonPureLen2: Map<string, number[]>;
  byNonPureLastTrigram: Map<string, number[]>;
}

function pushIdx<K>(map: Map<K, number[]>, key: K, idx: number): void {
  let list = map.get(key);
  if (!list) {
    list = [idx];
    map.set(key, list);
  } else if (list[list.length - 1] !== idx) {
    list.push(idx);
  }
}

function buildPkBucketIndexes(groups: PkgGroupSummary[]): Omit<PkBucketSummary, 'groups' | 'allInPk'> {
  const byNorm = new Map<string, number[]>();
  const byCompact = new Map<string, number[]>();
  const byTokenRaw = new Map<string, number[]>();
  const byDigitsOnly = new Map<number, number[]>();
  const bySuffixDigits = new Map<number, number[]>();
  const byNonPureLen2 = new Map<string, number[]>();
  const byNonPureLastTrigram = new Map<string, number[]>();

  for (let idx = 0; idx < groups.length; idx += 1) {
    const p = groups[idx].preparedPkg;
    if (p.norm) pushIdx(byNorm, p.norm, idx);
    if (p.compact) pushIdx(byCompact, p.compact, idx);

    for (let t = 0; t < p.tokens.length; t += 1) {
      const tok = p.tokens[t];
      pushIdx(byTokenRaw, tok.raw, idx);
      if (tok.digitsOnly !== null) pushIdx(byDigitsOnly, tok.digitsOnly, idx);
      if (tok.suffixDigits !== null) pushIdx(bySuffixDigits, tok.suffixDigits, idx);
    }

    const cLen = p.compact.length;
    if (cLen >= 2 && !p.isPureDigits) {
      if (cLen === 2) {
        pushIdx(byNonPureLen2, p.compact, idx);
      } else {
        pushIdx(byNonPureLastTrigram, p.compact.slice(cLen - 3), idx);
      }
    }
  }

  return {
    byNorm,
    byCompact,
    byTokenRaw,
    byDigitsOnly,
    bySuffixDigits,
    byCompactBigram: null,
    byCompactTrigram: null,
    byNonPureLen2,
    byNonPureLastTrigram,
  };
}

function getBucketBigramIndex(bucket: PkBucketSummary): Map<string, number[]> {
  if (bucket.byCompactBigram) return bucket.byCompactBigram;
  const map = new Map<string, number[]>();
  for (let idx = 0; idx < bucket.groups.length; idx += 1) {
    const c = bucket.groups[idx].preparedPkg.compact;
    const cLen = c.length;
    if (cLen >= 2) {
      for (let j = 0; j <= cLen - 2; j += 1) {
        pushIdx(map, c.slice(j, j + 2), idx);
      }
    }
  }
  bucket.byCompactBigram = map;
  return map;
}

function getBucketTrigramIndex(bucket: PkBucketSummary): Map<string, number[]> {
  if (bucket.byCompactTrigram) return bucket.byCompactTrigram;
  const map = new Map<string, number[]>();
  for (let idx = 0; idx < bucket.groups.length; idx += 1) {
    const c = bucket.groups[idx].preparedPkg.compact;
    const cLen = c.length;
    if (cLen >= 3) {
      for (let j = 0; j <= cLen - 3; j += 1) {
        pushIdx(map, c.slice(j, j + 3), idx);
      }
    }
  }
  bucket.byCompactTrigram = map;
  return map;
}

/**
 * Builds an O(D) indexed + memoized linker resolving Detailed status flags for General rows.
 * Optionally restricts indexing to `onlyForPkNorms` when enriching a paginated slice.
 */
export function createGeneralDetailedLinker(
  detailedRows: DetailedEntry[],
  substitutedIds: Set<string>,
  onlyForPkNorms?: Set<string>,
): (packingListNo: string | undefined | null, packageNo: string | undefined | null) => GeneralLinkedStatus {
  const rawByPk = new Map<string, DetailedEntry[]>();
  for (let i = 0; i < detailedRows.length; i += 1) {
    const d = detailedRows[i];
    const pkNorm = normDupPart(d.shipmentNo);
    if (!pkNorm) continue;
    if (onlyForPkNorms && !onlyForPkNorms.has(pkNorm)) continue;
    let list = rawByPk.get(pkNorm);
    if (!list) {
      list = [];
      rawByPk.set(pkNorm, list);
    }
    list.push(d);
  }

  const preparedBuckets = new Map<string, PkBucketSummary>();
  const resultCache = new Map<string, GeneralLinkedStatus>();

  const getBucket = (pkNorm: string): PkBucketSummary | null => {
    const cached = preparedBuckets.get(pkNorm);
    if (cached) return cached;
    const rawList = rawByPk.get(pkNorm);
    if (!rawList || rawList.length === 0) return null;

    const groupMap = new Map<string, PkgGroupSummary>();
    let totalCount = 0;
    let allShortage = false;
    let allDamaged = false;
    let allDiscrepancy = false;
    let allReplaced = false;

    for (let i = 0; i < rawList.length; i += 1) {
      const d = rawList[i];
      const c = computeDetailedEntry(d);
      const hasShortage = c.hasShortage;
      const hasDamaged = c.hasDamaged;
      const hasDiscrepancy =
        isMerOpen(c) ||
        Boolean(normKey(c.merNo) || normKey(c.merStatus)) ||
        hasShortage ||
        hasDamaged;
      const hasReplaced =
        isRepOpen(c) ||
        Boolean(normKey(c.repNo) || normKey(c.repStatus)) ||
        substitutedIds.has(c.id);

      totalCount += 1;
      if (hasShortage) allShortage = true;
      if (hasDamaged) allDamaged = true;
      if (hasDiscrepancy) allDiscrepancy = true;
      if (hasReplaced) allReplaced = true;

      const pkgNorm = normDupPart(d.packageNo);
      let grp = groupMap.get(pkgNorm);
      if (!grp) {
        grp = {
          preparedPkg: preparePackageInfo(pkgNorm),
          count: 0,
          hasShortage: false,
          hasDamaged: false,
          hasDiscrepancy: false,
          hasReplaced: false,
        };
        groupMap.set(pkgNorm, grp);
      }
      grp.count += 1;
      if (hasShortage) grp.hasShortage = true;
      if (hasDamaged) grp.hasDamaged = true;
      if (hasDiscrepancy) grp.hasDiscrepancy = true;
      if (hasReplaced) grp.hasReplaced = true;
    }

    const groups = Array.from(groupMap.values());
    const indexes = buildPkBucketIndexes(groups);
    const summary: PkBucketSummary = {
      groups,
      allInPk: {
        detailedCount: totalCount,
        hasLinkedShortage: allShortage,
        hasLinkedDamaged: allDamaged,
        hasLinkedDiscrepancy: allDiscrepancy,
        hasLinkedReplaced: allReplaced,
      },
      ...indexes,
    };
    preparedBuckets.set(pkNorm, summary);
    rawByPk.delete(pkNorm);
    return summary;
  };

  return (packingListNo, packageNo) => {
    const pkNorm = normDupPart(packingListNo);
    if (!pkNorm) return EMPTY_LINKED_STATUS;
    const pkgNorm = normDupPart(packageNo);
    const cacheKey = `${pkNorm}\0${pkgNorm}`;
    const cached = resultCache.get(cacheKey);
    if (cached) return cached;

    const bucket = getBucket(pkNorm);
    if (!bucket) {
      resultCache.set(cacheKey, EMPTY_LINKED_STATUS);
      return EMPTY_LINKED_STATUS;
    }

    if (!pkgNorm) {
      resultCache.set(cacheKey, bucket.allInPk);
      return bucket.allInPk;
    }

    const queryPkg = preparePackageInfo(pkgNorm);
    let detailedCount = 0;
    let hasLinkedShortage = false;
    let hasLinkedDamaged = false;
    let hasLinkedDiscrepancy = false;
    let hasLinkedReplaced = false;

    const accumGroup = (grp: PkgGroupSummary) => {
      detailedCount += grp.count;
      if (grp.hasShortage) hasLinkedShortage = true;
      if (grp.hasDamaged) hasLinkedDamaged = true;
      if (grp.hasDiscrepancy) hasLinkedDiscrepancy = true;
      if (grp.hasReplaced) hasLinkedReplaced = true;
    };

    // Fast path for small buckets where full scan is trivial
    if (bucket.groups.length <= 16) {
      for (let i = 0; i < bucket.groups.length; i += 1) {
        const grp = bucket.groups[i];
        if (matchesPreparedPackage(grp.preparedPkg, queryPkg)) {
          accumGroup(grp);
        }
      }
    } else {
      const matchedIndices = new Set<number>();
      const addList = (list: number[] | undefined) => {
        if (!list) return;
        for (let i = 0; i < list.length; i += 1) {
          matchedIndices.add(list[i]);
        }
      };

      // 1. Exact norm & compact
      addList(bucket.byNorm.get(queryPkg.norm));
      if (queryPkg.compact) {
        addList(bucket.byCompact.get(queryPkg.compact));
      }

      // 2. Token matches
      for (let i = 0; i < queryPkg.tokens.length; i += 1) {
        const qt = queryPkg.tokens[i];
        addList(bucket.byTokenRaw.get(qt.raw));
        if (qt.digitsOnly !== null) {
          addList(bucket.byDigitsOnly.get(qt.digitsOnly));
          addList(bucket.bySuffixDigits.get(qt.digitsOnly));
        }
        if (qt.suffixDigits !== null) {
          addList(bucket.byDigitsOnly.get(qt.suffixDigits));
        }
      }

      // 3a. Non-pure-digit query substring contained in cand.compact
      const qCompact = queryPkg.compact;
      if (!queryPkg.isPureDigits && qCompact.length >= 2) {
        if (qCompact.length === 2) {
          const list = getBucketBigramIndex(bucket).get(qCompact);
          if (list) {
            for (let i = 0; i < list.length; i += 1) {
              const idx = list[i];
              if (!matchedIndices.has(idx) && bucket.groups[idx].preparedPkg.compact.includes(qCompact)) {
                matchedIndices.add(idx);
              }
            }
          }
        } else {
          // Pick the rarest 3-gram of queryPkg.compact to minimize candidates
          const trigramIndex = getBucketTrigramIndex(bucket);
          let rarestList: number[] | undefined;
          let impossible = false;
          for (let j = 0; j <= qCompact.length - 3; j += 1) {
            const list = trigramIndex.get(qCompact.slice(j, j + 3));
            if (!list) {
              impossible = true;
              break;
            }
            if (!rarestList || list.length < rarestList.length) {
              rarestList = list;
            }
          }
          if (!impossible && rarestList) {
            for (let i = 0; i < rarestList.length; i += 1) {
              const idx = rarestList[i];
              if (!matchedIndices.has(idx) && bucket.groups[idx].preparedPkg.compact.includes(qCompact)) {
                matchedIndices.add(idx);
              }
            }
          }
        }
      }

      // 3b. Non-pure-digit cand.compact contained in query.compact
      if (qCompact.length >= 2) {
        for (let j = 0; j <= qCompact.length - 2; j += 1) {
          const bgList = bucket.byNonPureLen2.get(qCompact.slice(j, j + 2));
          if (bgList) {
            for (let i = 0; i < bgList.length; i += 1) {
              matchedIndices.add(bgList[i]);
            }
          }
        }
        if (qCompact.length >= 3) {
          for (let j = 0; j <= qCompact.length - 3; j += 1) {
            const tgList = bucket.byNonPureLastTrigram.get(qCompact.slice(j, j + 3));
            if (tgList) {
              for (let i = 0; i < tgList.length; i += 1) {
                const idx = tgList[i];
                if (!matchedIndices.has(idx)) {
                  const candCompact = bucket.groups[idx].preparedPkg.compact;
                  if (qCompact.includes(candCompact)) {
                    matchedIndices.add(idx);
                  }
                }
              }
            }
          }
        }
      }

      for (const idx of matchedIndices) {
        accumGroup(bucket.groups[idx]);
      }
    }

    const out: GeneralLinkedStatus = {
      detailedCount,
      hasLinkedShortage,
      hasLinkedDamaged,
      hasLinkedDiscrepancy,
      hasLinkedReplaced,
    };
    resultCache.set(cacheKey, out);
    return out;
  };
}

export function normNumDupPart(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(roundQty(val)) : '';
  }
  const cleaned = normalizeDigits(String(val))
    .replace(/[,،٬\s]/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';
  const n = Number(cleaned);
  if (Number.isFinite(n)) return String(roundQty(n));
  return normDupPart(val);
}

/**
 * Duplicate key check for General import:
 * packingListNo, packageNo, itemDescription, supplier, dispatchLocation,
 * arrivalDate, system, subSystem, unit, mapnaEntryMinutesNo,
 * billOfLadingNo, vehicleNo, driverName, freightCost, lengthCm, widthCm, heightCm.
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
      | 'billOfLadingNo'
      | 'vehicleNo'
      | 'driverName'
      | 'freightCost'
      | 'lengthCm'
      | 'widthCm'
      | 'heightCm'
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
    normDupPart(r.billOfLadingNo),
    normDupPart(r.vehicleNo),
    normDupPart(r.driverName),
    normNumDupPart(r.freightCost),
    normNumDupPart(r.lengthCm),
    normNumDupPart(r.widthCm),
    normNumDupPart(r.heightCm),
  ];
  if (!parts[0] && !parts[2] && !parts[9]) return '';
  return parts.join('||');
}

/**
 * Duplicate key check for Detailed import:
 * shipmentNo (Packing List), packageNo, itemNo, description, itemCode,
 * supplier, system, subSystem, unit, origin, shortage, surplus.
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
      | 'packingQty'
      | 'actualQty'
      | 'damagedQty'
      | 'shortageBackfills'
    >
  > & {
    shortage?: number | null;
    surplus?: number | null;
  },
): string {
  const computed = computeDetailedEntry({
    packingQty: r.packingQty ?? null,
    actualQty: r.actualQty ?? null,
    damagedQty: r.damagedQty ?? null,
    shortageBackfills: Array.isArray(r.shortageBackfills) ? r.shortageBackfills : [],
  } as DetailedEntry);
  const shortageVal =
    typeof r.shortage === 'number' && Number.isFinite(r.shortage)
      ? roundQty(r.shortage)
      : computed.shortage;
  const surplusVal =
    typeof r.surplus === 'number' && Number.isFinite(r.surplus)
      ? roundQty(r.surplus)
      : computed.surplus;

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
    normNumDupPart(shortageVal),
    normNumDupPart(surplusVal),
  ];
  if (!parts[0] && !parts[3]) return '';
  return parts.join('||');
}

/**
 * Duplicate key check for Transit import:
 * packingListNo, packageNo, itemDescription, overallStatus, arrivalDate,
 * mapnaShippingNotice, supplier, dispatchLocation, system, subSystem,
 * unit, releaseNetNo, interimNo, billOfLadingNo.
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
      | 'billOfLadingNo'
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
    normDupPart(r.billOfLadingNo),
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

export type CompiledColFilter = [string, Set<string>];

export function compileColFilters(colFilters: ColFilterMap): CompiledColFilter[] {
  const out: CompiledColFilter[] = [];
  for (const [colKey, allowed] of Object.entries(colFilters)) {
    if (!Array.isArray(allowed)) continue;
    out.push([colKey, new Set(allowed)]);
  }
  return out;
}

export function matchesCompiledColFilters(
  row: Record<string, unknown>,
  compiled: CompiledColFilter[],
  calendar: CalendarMode = 'jalali',
): boolean {
  if (compiled.length === 0) return true;
  for (let i = 0; i < compiled.length; i += 1) {
    const [colKey, allowedSet] = compiled[i];
    const token = getRowFilterToken(row, colKey, calendar);
    if (!allowedSet.has(token)) return false;
  }
  return true;
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
  const isDateCol = DATE_COLUMN_KEYS.has(sortBy);
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
    if (sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb) && !isDateCol) {
      return (na - nb) * factor;
    }
    return FA_NUMERIC_COLLATOR.compare(sa, sb) * factor;
  });
}

export function collectDistinctColumnValues(
  rows: Record<string, unknown>[],
  colKey: string,
  calendar: CalendarMode = 'jalali',
): DistinctColumnValue[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const token = getRowFilterToken(row, colKey, calendar);
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const emptyCount = counts.get(EMPTY_CELL_TOKEN) || 0;
  counts.delete(EMPTY_CELL_TOKEN);
  const sortedTokens = Array.from(counts.keys()).sort((a, b) =>
    FA_NUMERIC_COLLATOR.compare(normalizeDigits(a), normalizeDigits(b)),
  );
  const result: DistinctColumnValue[] = sortedTokens.map((token) => ({
    token,
    label: token,
    count: counts.get(token) || 0,
  }));
  if (emptyCount > 0) {
    result.push({
      token: EMPTY_CELL_TOKEN,
      label: '',
      count: emptyCount,
    });
  }
  return result;
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

export type QueryScope = 'general' | 'detailed' | 'transit' | 'trash';
export type ScopeRowAny = GeneralEntry | DetailedComputed | TransitEntry | SiteEntryMinutesRecord;

export interface TrashProjectedRow extends Record<string, unknown> {
  id: string;
  scope: TrashRecord['scope'];
  targetLabel: string;
  packingNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  supplier: string;
  island: string;
  deletedBy: string;
  deletedAt: string;
  deletedDate: string;
}

export function projectTrashRowForQuery(item: TrashRecord): TrashProjectedRow {
  const d = item.data as Partial<GeneralEntry & DetailedEntry & TransitEntry>;
  const packingNo =
    item.scope === 'detailed'
      ? normKey(d.shipmentNo)
      : normKey(d.packingListNo);
  const packageNo = normKey(d.packageNo);
  const itemNo = item.scope === 'detailed' ? normKey(d.itemNo) : '';
  const description =
    item.scope === 'detailed'
      ? normKey(d.description || d.generalDescription)
      : normKey(d.itemDescription);
  const supplier = normKey(d.supplier);
  const island = normKey(d.island);
  const deletedDate = item.deletedAt ? item.deletedAt.slice(0, 10) : '';
  return {
    id: item.id,
    scope: item.scope,
    targetLabel: item.targetLabel,
    packingNo,
    packageNo,
    itemNo,
    description,
    supplier,
    island,
    deletedBy: item.deletedBy,
    deletedAt: item.deletedAt,
    deletedDate,
  };
}

/**
 * Computes linked deleted Detailed counts for General trash items in O(M) instead of O(N*M).
 */
export function buildTrashLinkedDetailedCounts(trash: TrashRecord[]): {
  getLinkedCount: (item: TrashRecord) => number;
  scopeCounts: { all: number; general: number; detailed: number; transit: number };
} {
  const byPk = new Map<string, number>();
  const byPkPkg = new Map<string, number>();
  const scopeCounts = { all: trash.length, general: 0, detailed: 0, transit: 0 };

  for (let i = 0; i < trash.length; i += 1) {
    const tr = trash[i];
    if (tr.scope === 'general') scopeCounts.general += 1;
    else if (tr.scope === 'detailed') {
      scopeCounts.detailed += 1;
      const d = tr.data as DetailedEntry;
      const pk = normKey(d.shipmentNo);
      if (pk) {
        byPk.set(pk, (byPk.get(pk) || 0) + 1);
        const pkg = normKey(d.packageNo);
        if (pkg) {
          const composite = `${pk}\u0000${pkg}`;
          byPkPkg.set(composite, (byPkPkg.get(composite) || 0) + 1);
        }
      }
    } else if (tr.scope === 'transit') {
      scopeCounts.transit += 1;
    }
  }

  return {
    scopeCounts,
    getLinkedCount(item: TrashRecord): number {
      if (item.scope !== 'general') return 0;
      const g = item.data as GeneralEntry;
      const pk = normKey(g.packingListNo);
      if (!pk) return 0;
      const pkg = normKey(g.packageNo);
      return pkg ? (byPkPkg.get(`${pk}\u0000${pkg}`) || 0) : (byPk.get(pk) || 0);
    },
  };
}

