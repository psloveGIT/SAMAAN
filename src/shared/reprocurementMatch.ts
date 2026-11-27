import type { DetailedComputed, SubstitutionRecord } from './types.ts';
import { toAsciiDigitsOnly } from './docNumbering.ts';

export interface ReprocurementCandidate {
  detailedId: string;
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  itemCode: string;
  description: string;
  countingUnit: string;
  unit: string;
  system: string;
  repNo: string;
  repStatus: string;
  repDescription: string;
  merNo: string;
  merStatus: string;
  merDescription: string;
  packingQty: number;
  shortage: number;
  damagedQty: number;
  /** Relevant quantity to compare with newly registered packingQty for auto-close */
  targetQty: number;
  /** Matched linked substitution record ID if applicable */
  substitutionId?: string;
  /** Reasons this row appeared in Suggested */
  matchReasons: Array<'exact_code' | 'last5_digits' | 'description_keyword'>;
}

export interface ReprocurementMatchGroups {
  suggested: ReprocurementCandidate[];
  others: ReprocurementCandidate[];
}

export interface ReprocurementSourceInput {
  itemCode?: string;
  description?: string;
  generalDescription?: string;
  excludeDetailedId?: string;
}

const DESCRIPTION_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'unit', 'item', 'set', 'pcs', 'type', 'size', 'part', 'parts', 'box',
  'عدد', 'دستگاه', 'مجموعه', 'قطعه', 'قطعات', 'کالا', 'تجهیز', 'تجهیزات', 'واحد', 'بخش', 'شماره', 'مدل', 'نوع', 'برای', 'با', 'در', 'از', 'به',
]);

export function extractLast5Digits(code: string | undefined | null): string {
  const digits = toAsciiDigitsOnly(String(code || '')).replace(/\D/g, '');
  if (digits.length < 5) return '';
  return digits.slice(-5);
}

export function extractMeaningfulKeywords(text: string | undefined | null): string[] {
  const normalized = toAsciiDigitsOnly(String(text || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 3 && !DESCRIPTION_STOPWORDS.has(t));
  return Array.from(new Set(tokens));
}

function evaluateMatchReasons(
  source: ReprocurementSourceInput,
  candidateItemCode: string,
  candidateDescription: string,
): Array<'exact_code' | 'last5_digits' | 'description_keyword'> {
  const reasons: Array<'exact_code' | 'last5_digits' | 'description_keyword'> = [];

  const srcCode = toAsciiDigitsOnly(String(source.itemCode || '')).trim().toLowerCase();
  const candCode = toAsciiDigitsOnly(String(candidateItemCode || '')).trim().toLowerCase();

  if (srcCode && candCode && srcCode === candCode) {
    reasons.push('exact_code');
  }

  const srcLast5 = extractLast5Digits(srcCode);
  const candLast5 = extractLast5Digits(candCode);
  if (srcLast5 && candLast5 && srcLast5 === candLast5 && !reasons.includes('exact_code')) {
    reasons.push('last5_digits');
  }

  const srcKeywords = extractMeaningfulKeywords(`${source.description || ''} ${source.generalDescription || ''}`);
  if (srcKeywords.length > 0) {
    const candKeywordSet = new Set(extractMeaningfulKeywords(candidateDescription));
    const shared = srcKeywords.filter((kw) => candKeywordSet.has(kw));
    if (shared.length > 0) {
      reasons.push('description_keyword');
    }
  }

  return reasons;
}

function rankReasons(reasons: Array<'exact_code' | 'last5_digits' | 'description_keyword'>): number {
  let score = 0;
  if (reasons.includes('exact_code')) score += 100;
  if (reasons.includes('last5_digits')) score += 50;
  if (reasons.includes('description_keyword')) score += 10;
  return score;
}

/**
 * Splits all Detailed rows with an open substitution (`repStatus === 'باز'`)
 * into `suggested` (exact itemCode, matching last 5 digits, or description keyword overlap)
 * and `others`.
 */
export function matchOpenSubstitutions(
  source: ReprocurementSourceInput,
  detailedRows: ReadonlyArray<DetailedComputed>,
  substitutions: ReadonlyArray<SubstitutionRecord> = [],
): ReprocurementMatchGroups {
  const suggested: ReprocurementCandidate[] = [];
  const others: ReprocurementCandidate[] = [];

  // Map detailedId / repNo -> substitution qty & id
  const subByDocNo = new Map<string, SubstitutionRecord>();
  const subQtyByDetailedId = new Map<string, { qty: number; subId: string }>();

  for (const sub of substitutions) {
    if (sub.docNo) {
      subByDocNo.set(sub.docNo.trim().toUpperCase(), sub);
    }
    for (const line of [...(sub.substituteItems || []), ...(sub.originalItems || [])]) {
      if (line.detailedId && !subQtyByDetailedId.has(line.detailedId)) {
        subQtyByDetailedId.set(line.detailedId, { qty: line.qty || sub.qty || 0, subId: sub.id });
      }
    }
    if (sub.detailedId && !subQtyByDetailedId.has(sub.detailedId)) {
      subQtyByDetailedId.set(sub.detailedId, { qty: sub.qty || 0, subId: sub.id });
    }
  }

  for (const row of detailedRows) {
    if (source.excludeDetailedId && row.id === source.excludeDetailedId) continue;
    const status = (row.repStatus || '').trim();
    if (status !== 'باز') continue;

    const firstRepNo = (row.repNo || '').split(/[،,\n/]+/)[0]?.trim() || '';
    const linkedByRow = subQtyByDetailedId.get(row.id);
    const linkedByDoc = firstRepNo ? subByDocNo.get(firstRepNo.toUpperCase()) : undefined;
    const targetQty = linkedByRow?.qty || linkedByDoc?.qty || row.packingQty || 0;
    const substitutionId = linkedByRow?.subId || linkedByDoc?.id;

    const reasons = evaluateMatchReasons(
      source,
      row.itemCode || '',
      `${row.description || ''} ${row.generalDescription || ''}`,
    );

    const cand: ReprocurementCandidate = {
      detailedId: row.id,
      shipmentNo: row.shipmentNo || '',
      packageNo: row.packageNo || '',
      itemNo: row.itemNo || '',
      itemCode: row.itemCode || '',
      description: row.description || row.generalDescription || '',
      countingUnit: row.countingUnit || '',
      unit: row.unit || '',
      system: row.system || '',
      repNo: row.repNo || '',
      repStatus: status,
      repDescription: row.repDescription || '',
      merNo: row.merNo || '',
      merStatus: row.merStatus || '',
      merDescription: row.merDescription || '',
      packingQty: row.packingQty ?? 0,
      shortage: row.shortage ?? 0,
      damagedQty: row.damagedQty ?? 0,
      targetQty,
      substitutionId,
      matchReasons: reasons,
    };

    if (reasons.length > 0) {
      suggested.push(cand);
    } else {
      others.push(cand);
    }
  }

  suggested.sort((a, b) => rankReasons(b.matchReasons) - rankReasons(a.matchReasons));
  return { suggested, others };
}

/**
 * Splits all Detailed rows with active shortage or damaged quantity
 * (`(shortage > 0 || damagedQty > 0) && merStatus !== 'بسته'`)
 * into `suggested` and `others`.
 */
export function matchOpenShortages(
  source: ReprocurementSourceInput,
  detailedRows: ReadonlyArray<DetailedComputed>,
): ReprocurementMatchGroups {
  const suggested: ReprocurementCandidate[] = [];
  const others: ReprocurementCandidate[] = [];

  for (const row of detailedRows) {
    if (source.excludeDetailedId && row.id === source.excludeDetailedId) continue;
    const shortage = Math.max(0, Number(row.shortage ?? 0));
    const damaged = Math.max(0, Number(row.damagedQty ?? 0));
    const merStatus = (row.merStatus || '').trim();
    if (shortage <= 0 && damaged <= 0) continue;
    if (merStatus === 'بسته' || merStatus.toLowerCase() === 'closed') continue;

    const reasons = evaluateMatchReasons(
      source,
      row.itemCode || '',
      `${row.description || ''} ${row.generalDescription || ''}`,
    );

    const cand: ReprocurementCandidate = {
      detailedId: row.id,
      shipmentNo: row.shipmentNo || '',
      packageNo: row.packageNo || '',
      itemNo: row.itemNo || '',
      itemCode: row.itemCode || '',
      description: row.description || row.generalDescription || '',
      countingUnit: row.countingUnit || '',
      unit: row.unit || '',
      system: row.system || '',
      repNo: row.repNo || '',
      repStatus: row.repStatus || '',
      repDescription: row.repDescription || '',
      merNo: row.merNo || '',
      merStatus,
      merDescription: row.merDescription || '',
      packingQty: row.packingQty ?? 0,
      shortage,
      damagedQty: damaged,
      targetQty: shortage + damaged,
      matchReasons: reasons,
    };

    if (reasons.length > 0) {
      suggested.push(cand);
    } else {
      others.push(cand);
    }
  }

  suggested.sort((a, b) => rankReasons(b.matchReasons) - rankReasons(a.matchReasons));
  return { suggested, others };
}

/**
 * Exact substitution re-procurement sentence appended on a new line to `repDescription`:
 * `شماره جایگزینی {repNo} با شماره پکینگ {shipmentNo} و به تعداد {packingQty} تأمین گردید.`
 */
export function buildSubstitutionReprocurementNote(
  repNo: string,
  shipmentNo: string,
  packingQty: number | string,
): string {
  const cleanRepNo = (repNo || '').trim() || '-';
  const cleanShip = (shipmentNo || '').trim() || '-';
  const cleanQty = String(packingQty ?? '').trim() || '0';
  return `شماره جایگزینی ${cleanRepNo} با شماره پکینگ ${cleanShip} و به تعداد ${cleanQty} تأمین گردید.`;
}

/**
 * Exact shortage re-procurement sentence appended on a new line to `merDescription`:
 * `تعداد {packingQty} {countingUnit} با شماره پکینگ {shipmentNo} تأمین گردید.`
 */
export function buildShortageReprocurementNote(
  packingQty: number | string,
  countingUnit: string | undefined | null,
  shipmentNo: string,
): string {
  const cleanQty = String(packingQty ?? '').trim() || '0';
  const cleanUnit = (countingUnit || '').trim();
  const cleanShip = (shipmentNo || '').trim() || '-';
  return cleanUnit
    ? `تعداد ${cleanQty} ${cleanUnit} با شماره پکینگ ${cleanShip} تأمین گردید.`
    : `تعداد ${cleanQty} با شماره پکینگ ${cleanShip} تأمین گردید.`;
}

/**
 * Appends `newLine` on a new line below `existing` without deleting existing content.
 * Avoids exact duplicate lines if triggered twice.
 */
export function appendMultilineLine(existing: string | undefined | null, newLine: string): string {
  const cleanNew = (newLine || '').trim();
  const cleanExisting = (existing || '').replace(/\r\n/g, '\n').trim();
  if (!cleanNew) return cleanExisting;
  if (!cleanExisting) return cleanNew;
  const existingLines = cleanExisting.split('\n').map((l) => l.trim());
  if (existingLines.includes(cleanNew)) return cleanExisting;
  return `${cleanExisting}\n${cleanNew}`;
}

export function shouldCloseSubstitution(newPackingQty: number | null | undefined, subQty: number | null | undefined): boolean {
  const a = Number(newPackingQty ?? 0);
  const b = Number(subQty ?? 0);
  return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && Math.abs(a - b) < 1e-6;
}

export function shouldCloseShortage(
  newPackingQty: number | null | undefined,
  shortage: number | null | undefined,
  damagedQty: number | null | undefined,
): boolean {
  const a = Number(newPackingQty ?? 0);
  const target = Math.max(0, Number(shortage ?? 0)) + Math.max(0, Number(damagedQty ?? 0));
  return Number.isFinite(a) && a > 0 && target > 0 && Math.abs(a - target) < 1e-6;
}

/**
 * Checks whether a re-procurement item's quantity plus the shortage row's existing actualQty
 * equals (or covers) the shortage row's packingQty, in which case "دارای کسری" should be cleared.
 */
export function shouldResolveShortageBadge(
  newPackingQty: number | null | undefined,
  targetActualQty: number | null | undefined,
  targetPackingQty: number | null | undefined,
): boolean {
  const newQty = Number(newPackingQty ?? 0);
  const actual = Number(targetActualQty ?? 0);
  const packing = Number(targetPackingQty ?? 0);
  if (!Number.isFinite(newQty) || !Number.isFinite(actual) || !Number.isFinite(packing)) return false;
  if (newQty <= 0 || packing <= 0) return false;
  return Math.abs(newQty + actual - packing) < 1e-6 || newQty + actual >= packing - 1e-6;
}

/**
 * Formats the text written into the NEW re-procurement item's "توضیحات کسری/مغایرت" (merDescription):
 *   "تأمین کسری پکینگ <shortagePackingNo>"
 */
export function buildNewItemShortageReprocDescription(
  shortagePackingNos: ReadonlyArray<string | undefined | null>,
): string {
  const unique = Array.from(
    new Set(
      shortagePackingNos
        .map((s) => String(s || '').trim())
        .filter(Boolean),
    ),
  );
  if (unique.length === 0) return '';
  return `تأمین کسری پکینگ ${unique.join(' ، ')}`;
}

