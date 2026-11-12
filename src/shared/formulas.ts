import type {
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
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

export function computeDetailedEntry(entry: DetailedEntry): DetailedComputed {
  const packingQty = toNum(entry.packingQty);
  const actualQty = toNum(entry.actualQty);
  const damagedQty = toNum(entry.damagedQty);
  const backfilledQty = roundQty(
    (entry.shortageBackfills || []).reduce((acc, b) => acc + toNum(b.qty), 0),
  );

  const initialShortage = Math.max(0, roundQty(packingQty - actualQty));
  const shortage = Math.max(0, roundQty(initialShortage - backfilledQty));
  const surplus = Math.max(0, roundQty(actualQty + backfilledQty - packingQty));
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
  };

  for (const g of general) {
    summary.grossWeightSum = roundQty(summary.grossWeightSum + toNum(g.grossWeight));
    summary.netWeightSum = roundQty(summary.netWeightSum + toNum(g.netWeight));
    summary.weighbridgeWeightSum = roundQty(
      summary.weighbridgeWeightSum + toNum(g.weighbridgeWeight),
    );
    summary.freightCostSum = roundQty(summary.freightCostSum + toNum(g.freightCost));
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
  }

  for (const t of transit) {
    summary.transitAmountSum = roundQty(summary.transitAmountSum + toNum(t.amount));
  }

  return summary;
}
