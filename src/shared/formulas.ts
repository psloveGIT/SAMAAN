import { getTodayIso } from './jalali.ts';
import type {
  DetailedComputed,
  DetailedEntry,
  ExpiringChemicalNotice,
  GeneralEntry,
  IslandPackingCount,
  SelectionFormulaSummary,
  TransitEntry,
} from './types.ts';

export function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function toNum(val: number | null | undefined): number {
  if (val === null || val === undefined || !Number.isFinite(val)) return 0;
  return val;
}

const CLOSED_STATUS_REGEX =
  /^(بسته|تکمیل|بسته‌شده|خاتمه|خاتمه‌یافته|مختومه|closed|close|done|resolved|completed|approved)$/i;

export function isMerOpen(entry: Pick<DetailedEntry, 'merNo' | 'merStatus'>): boolean {
  const no = (entry.merNo || '').trim();
  const st = (entry.merStatus || '').trim();
  if (!no && !st) return false;
  if (!st) return Boolean(no);
  return !CLOSED_STATUS_REGEX.test(st);
}

export function isRepOpen(entry: Pick<DetailedEntry, 'repNo' | 'repStatus'>): boolean {
  const no = (entry.repNo || '').trim();
  const st = (entry.repStatus || '').trim();
  if (!no && !st) return false;
  if (!st) return Boolean(no);
  return !CLOSED_STATUS_REGEX.test(st);
}

export function normalizeIslandBucket(raw: string | undefined | null): { key: string; label: string } {
  const cleaned = (raw || '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') {
    return { key: '__other__', label: 'سایر' };
  }
  return { key: cleaned.toLowerCase(), label: cleaned };
}

function daysBetweenIso(fromIso: string, toIso: string): number | null {
  const normFrom = fromIso.trim().replace(/\//g, '-');
  const normTo = toIso.trim().replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(normTo)) {
    return null;
  }
  const fromMs = Date.parse(`${normFrom}T00:00:00Z`);
  const toMs = Date.parse(`${normTo}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export function getExpiringChemicals(
  entries: DetailedEntry[],
  thresholdDays = 30,
  todayIso: string = getTodayIso(),
): ExpiringChemicalNotice[] {
  const alerts: ExpiringChemicalNotice[] = [];
  for (const d of entries) {
    const expIso = (d.expirationDate || '').trim();
    const isChemical = d.itemCategory === 'chemicals' || Boolean((d.chemicalType || '').trim()) || Boolean(expIso);
    if (!isChemical || !expIso) continue;
    const days = daysBetweenIso(todayIso, expIso);
    if (days !== null && days <= thresholdDays) {
      alerts.push({
        id: d.id,
        shipmentNo: d.shipmentNo || '',
        packageNo: d.packageNo || '',
        itemNo: d.itemNo || '',
        description: d.description || d.generalDescription || '',
        chemicalType: d.chemicalType || '',
        productionDate: d.productionDate || '',
        expirationDate: expIso,
        daysRemaining: days,
      });
    }
  }
  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return alerts;
}

export function computeDetailedEntry(entry: DetailedEntry): DetailedComputed {
  const packingQty = toNum(entry.packingQty);
  const opiRecorded = entry.actualQty !== null && entry.actualQty !== undefined && Number.isFinite(entry.actualQty);
  const actualQty = opiRecorded ? Number(entry.actualQty) : 0;
  const damagedQty = toNum(entry.damagedQty);
  const backfilledQty = roundQty(
    (entry.shortageBackfills || []).reduce((acc, b) => acc + toNum(b.qty), 0),
  );

  // Shortage/surplus only exist after actualQty has been recorded via OPI!
  // Leaving actualQty empty (null) in initial registration MUST NOT report a false shortage.
  const initialShortage = opiRecorded ? Math.max(0, roundQty(packingQty - actualQty)) : 0;
  const shortage = opiRecorded ? Math.max(0, roundQty(initialShortage - backfilledQty)) : 0;
  const surplus = opiRecorded ? Math.max(0, roundQty(actualQty + backfilledQty - packingQty)) : 0;
  const effectiveActualQty = roundQty(actualQty + backfilledQty);

  const gcvDeliveredQty = toNum(entry.gcvDeliveredQty);
  const mivContractorQty = toNum(entry.mivContractorQty);
  const smrContractorQty = toNum(entry.smrContractorQty);
  const smrMapnaQty = toNum(entry.smrMapnaQty);
  const mivMapnaQty = toNum(entry.mivMapnaQty);

  // موجودی مپنا: مقدار واقعی مؤثر - تحویلی GCV + برگشت به مپنا (SMR مپنا) - حواله برگشتی از مپنا
  const mapnaInventory = Math.max(
    0,
    roundQty(effectiveActualQty - gcvDeliveredQty + smrMapnaQty - mivMapnaQty),
  );

  // موجودی پیمانکار: تحویلی GCV - حواله مصرف MIV پیمانکار + برگشت به انبار پیمانکار (SMR پیمانکار) - برگشت به انبار مپنا
  const contractorInventory = Math.max(
    0,
    roundQty(gcvDeliveredQty - mivContractorQty + smrContractorQty - smrMapnaQty),
  );

  return {
    ...entry,
    initialShortage,
    backfilledQty,
    shortage,
    surplus,
    effectiveActualQty,
    mapnaInventory,
    contractorInventory,
    hasShortage: shortage > 0,
    hasDamaged: damagedQty > 0,
    opiPending: !opiRecorded,
  };
}

export function computeSelectionFormulaSummary(params: {
  general?: GeneralEntry[];
  detailed?: DetailedComputed[];
  transit?: TransitEntry[];
}): SelectionFormulaSummary {
  const general = params.general || [];
  const detailed = params.detailed || [];
  const transit = params.transit || [];

  const summary: SelectionFormulaSummary = {
    count: general.length + detailed.length + transit.length,
    grossWeightSum: 0,
    netWeightSum: 0,
    weighbridgeWeightSum: 0,
    freightCostSum: 0,
    packingQtySum: 0,
    actualQtySum: 0,
    effectiveActualQtySum: 0,
    shortageSum: 0,
    surplusSum: 0,
    damagedQtySum: 0,
    gcvDeliveredSum: 0,
    mapnaInventorySum: 0,
    contractorInventorySum: 0,
    mivContractorQtySum: 0,
    smrContractorQtySum: 0,
    smrMapnaQtySum: 0,
    mivMapnaQtySum: 0,
    transitAmountSum: 0,
    packingsByIsland: [],
    openMerCount: 0,
    openRepCount: 0,
    shortageOrDamagedCount: 0,
    expiringChemicals: [],
  };

  const islandPackingsMap = new Map<string, { packings: Set<string>; rowCount: number }>();

  for (const g of general) {
    summary.grossWeightSum = roundQty(summary.grossWeightSum + toNum(g.grossWeight));
    summary.netWeightSum = roundQty(summary.netWeightSum + toNum(g.netWeight));
    summary.weighbridgeWeightSum = roundQty(
      summary.weighbridgeWeightSum + toNum(g.weighbridgeWeight),
    );
    summary.freightCostSum = roundQty(summary.freightCostSum + toNum(g.freightCost));

    const island = (g.island || '').trim() || 'سایر';
    const pk = (g.packingListNo || '').trim().toLowerCase() || g.id;
    let bucket = islandPackingsMap.get(island);
    if (!bucket) {
      bucket = { packings: new Set<string>(), rowCount: 0 };
      islandPackingsMap.set(island, bucket);
    }
    bucket.packings.add(pk);
    bucket.rowCount += 1;
  }

  if (general.length > 0) {
    const byIsland: IslandPackingCount[] = [];
    for (const [island, info] of islandPackingsMap.entries()) {
      byIsland.push({
        island,
        packingCount: info.packings.size,
        rowCount: info.rowCount,
      });
    }
    byIsland.sort((a, b) => b.packingCount - a.packingCount || b.rowCount - a.rowCount);
    summary.packingsByIsland = byIsland;
  }

  for (const d of detailed) {
    summary.packingQtySum = roundQty(summary.packingQtySum + toNum(d.packingQty));
    summary.actualQtySum = roundQty(summary.actualQtySum + toNum(d.actualQty));
    summary.effectiveActualQtySum = roundQty(
      summary.effectiveActualQtySum + d.effectiveActualQty,
    );
    summary.shortageSum = roundQty(summary.shortageSum + d.shortage);
    summary.surplusSum = roundQty(summary.surplusSum + d.surplus);
    summary.damagedQtySum = roundQty(summary.damagedQtySum + toNum(d.damagedQty));
    summary.gcvDeliveredSum = roundQty(summary.gcvDeliveredSum + toNum(d.gcvDeliveredQty));
    summary.mapnaInventorySum = roundQty(summary.mapnaInventorySum + d.mapnaInventory);
    summary.contractorInventorySum = roundQty(
      summary.contractorInventorySum + d.contractorInventory,
    );
    summary.mivContractorQtySum = roundQty(
      summary.mivContractorQtySum + toNum(d.mivContractorQty),
    );
    summary.smrContractorQtySum = roundQty(
      summary.smrContractorQtySum + toNum(d.smrContractorQty),
    );
    summary.smrMapnaQtySum = roundQty(summary.smrMapnaQtySum + toNum(d.smrMapnaQty));
    summary.mivMapnaQtySum = roundQty(summary.mivMapnaQtySum + toNum(d.mivMapnaQty));

    if (isMerOpen(d)) {
      summary.openMerCount = (summary.openMerCount || 0) + 1;
    }
    if (isRepOpen(d)) {
      summary.openRepCount = (summary.openRepCount || 0) + 1;
    }
    if (d.hasShortage || d.hasDamaged) {
      summary.shortageOrDamagedCount = (summary.shortageOrDamagedCount || 0) + 1;
    }
  }

  if (detailed.length > 0) {
    summary.expiringChemicals = getExpiringChemicals(detailed, 30);
  }

  for (const t of transit) {
    summary.transitAmountSum = roundQty(summary.transitAmountSum + toNum(t.amount));
  }

  return summary;
}
