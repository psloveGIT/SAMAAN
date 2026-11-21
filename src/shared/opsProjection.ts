import type { DetailedComputed, DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

function normLower(val: string | undefined | null): string {
  return (val || '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function slimDetailedForOps(d: DetailedComputed): DetailedComputed {
  if (!d.itemImage && !d.itemImageThumb) return d;
  const { itemImage: _img, itemImageThumb: _thumb, ...rest } = d;
  return rest;
}

export function collectUniquePackings(
  general: GeneralEntry[],
  detailed?: Array<Pick<DetailedEntry, 'shipmentNo'>>,
): string[] {
  const set = new Set<string>();
  for (const g of general) {
    const pk = (g.packingListNo || '').trim();
    if (pk) set.add(pk);
  }
  if (detailed) {
    for (const d of detailed) {
      const pk = (d.shipmentNo || '').trim();
      if (pk) set.add(pk);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fa'));
}

export interface OpsQueryOpts {
  compact?: boolean;
  packing?: string;
  packings?: string[];
  search?: string;
  limit?: number;
  onlyDiscrepancy?: boolean;
  stockFilter?: 'employer' | 'contractor' | 'any' | '';
}

function buildPackingSet(packing?: string, packings?: string[]): Set<string> | null {
  const list: string[] = [];
  if (packing && packing.trim()) list.push(normLower(packing));
  if (packings && packings.length > 0) {
    for (const p of packings) {
      const n = normLower(p);
      if (n) list.push(n);
    }
  }
  return list.length > 0 ? new Set(list) : null;
}

export function queryOpsDetailed(
  list: DetailedComputed[],
  opts: OpsQueryOpts,
): DetailedComputed[] {
  const pkSet = buildPackingSet(opts.packing, opts.packings);
  const q = normLower(opts.search);

  if (!opts.compact && !pkSet && !q && !opts.onlyDiscrepancy && !opts.stockFilter) {
    const out: DetailedComputed[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      out.push(slimDetailedForOps(list[i]));
    }
    return out;
  }

  const maxCap = pkSet ? Math.max(opts.limit || 500, 500) : Math.max(10, Math.min(500, opts.limit || 80));
  const out: DetailedComputed[] = [];

  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (pkSet && !pkSet.has(normLower(d.shipmentNo))) continue;
    if (opts.stockFilter === 'employer' && d.mapnaInventory <= 0) continue;
    if (opts.stockFilter === 'contractor' && d.contractorInventory <= 0) continue;
    if (opts.stockFilter === 'any' && d.mapnaInventory <= 0 && d.contractorInventory <= 0) continue;
    if (opts.onlyDiscrepancy && !d.hasShortage && !d.hasDamaged && d.surplus <= 0) continue;
    if (q) {
      const hay = normLower(
        `${d.shipmentNo} ${d.packageNo} ${d.itemNo} ${d.description} ${d.generalDescription} ${d.itemCode} ${d.mtoRef} ${d.storageLocation} ${d.supplier} ${d.system} ${d.island}`,
      );
      if (!hay.includes(q)) continue;
    }
    out.push(slimDetailedForOps(d));
    if (out.length >= maxCap) break;
  }
  return out;
}

export function queryOpsGeneral(
  list: GeneralEntry[],
  opts: Pick<OpsQueryOpts, 'compact' | 'packing' | 'packings' | 'search' | 'limit'>,
): GeneralEntry[] {
  const pkSet = buildPackingSet(opts.packing, opts.packings);
  const q = normLower(opts.search);

  if (!opts.compact && !pkSet && !q) {
    return [...list].reverse();
  }

  const maxCap = pkSet ? Math.max(opts.limit || 500, 500) : Math.max(10, Math.min(500, opts.limit || 80));
  const out: GeneralEntry[] = [];

  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    if (pkSet && !pkSet.has(normLower(g.packingListNo))) continue;
    if (q) {
      const hay = normLower(
        `${g.packingListNo} ${g.packageNo} ${g.itemDescription} ${g.supplier} ${g.dispatchLocation} ${g.island} ${g.system} ${g.unit} ${g.billOfLadingNo}`,
      );
      if (!hay.includes(q)) continue;
    }
    out.push(g);
    if (out.length >= maxCap) break;
  }
  return out;
}

export function queryOpsTransit(
  list: TransitEntry[],
  opts: Pick<OpsQueryOpts, 'compact' | 'packing' | 'packings' | 'search' | 'limit'>,
): TransitEntry[] {
  const pkSet = buildPackingSet(opts.packing, opts.packings);
  const q = normLower(opts.search);

  if (!opts.compact && !pkSet && !q) {
    return [...list].reverse();
  }

  const maxCap = pkSet ? Math.max(opts.limit || 300, 300) : Math.max(10, Math.min(300, opts.limit || 80));
  const out: TransitEntry[] = [];

  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (pkSet && !pkSet.has(normLower(t.packingListNo))) continue;
    if (q) {
      const hay = normLower(`${t.packingListNo} ${t.itemDescription} ${t.supplier} ${t.overallStatus}`);
      if (!hay.includes(q)) continue;
    }
    out.push(t);
    if (out.length >= maxCap) break;
  }
  return out;
}
