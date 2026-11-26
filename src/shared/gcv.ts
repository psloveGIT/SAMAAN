import type {
  DetailedComputed,
  DetailedEntry,
  DocumentLineItem,
  GeneralEntry,
  ProjectInfo,
} from './types.ts';
import {
  extractPlantDocConfig,
  generateNextPlantAwareDocNo,
} from './docNumbering.ts';
import { formatHeaderProjectTitle } from './opiInvitation.ts';

export const MD1_GCV_FORM_CODE = 'MD1EX-FQP02/11-03';
export const MD1_GCV_COMPANY_NAME = 'شركت احداث و توسعه نيروگاه‌هاي مپنا – توسعه يك (MD1)';
export const MD1_GCV_TITLE_FA = 'رسيد مصرف مستقيم كالا';
export const MD1_GCV_TITLE_EN = 'Not-Stored Goods Consumption Voucher';
export const MD1_GCV_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمیباشد.';
export const MD1_GCV_COPY_TEXT =
  'رونوشت: معاونت تامين ، امور مالي، واحد كنترل كالا و انبار، پيمانكار نصب';

export type GcvPurchaseByOption = 'tehran_proc' | 'site_admin' | 'contractor_supplier';

export const GCV_PURCHASE_BY_OPTIONS: ReadonlyArray<{
  value: GcvPurchaseByOption;
  labelFa: string;
  labelEn: string;
}> = [
  { value: 'tehran_proc', labelFa: 'تداركات تهران', labelEn: 'Tehran Procurement' },
  { value: 'site_admin', labelFa: 'مالي- اداري كارگاه', labelEn: 'Site Finance / Admin' },
  { value: 'contractor_supplier', labelFa: 'پیمانکار تامین کننده', labelEn: 'Supplier Contractor' },
] as const;

export interface GcvHeaderAutoFill {
  headerProjectTitle: string; // Rule 1-1: e.g. "پروژه نکا"
  supplier: string; // Rule 1-4: supplier from Detailed
  releaseNoteNo: string; // Rule 1-7: Release Note from linked General
  islandSystem: string; // Rule 1-9: "<island>/<system>" from Detailed
  waybillNo: string; // Rule 1-10: Bill of Lading No. from linked General
}

function normToken(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function uniqueJoined(values: Array<string | undefined | null>, sep = ' ، '): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out.join(sep);
}

function preserveMultiline(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

/**
 * Filters Detailed rows to those that do NOT yet have a GCV receipt number ("شماره رسید مصرف"),
 * except when editing an existing GCV receipt (in which case rows belonging to that receipt remain eligible).
 */
export function filterEligibleDetailedForGcv<T extends Pick<DetailedEntry, 'gcvReceiptNo'>>(
  items: readonly T[],
  editingReceiptNo?: string | null,
): T[] {
  const editNorm = normToken(editingReceiptNo);
  return items.filter((d) => {
    const existing = String(d.gcvReceiptNo || '').trim();
    if (!existing) return true;
    if (!editNorm) return false;
    const tokens = existing
      .split(/[\n,،;؛|]+/)
      .map((s) => normToken(s))
      .filter(Boolean);
    return tokens.includes(editNorm);
  });
}

/**
 * Rule 1-9: Formats "<island>/<system>" pairs from Detailed rows as "@/@".
 */
export function formatIslandSystemPairs(
  rows: ReadonlyArray<Pick<DetailedEntry, 'island' | 'system'>>,
): string {
  const pairs: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const isl = String(r.island || '').trim();
    const sys = String(r.system || '').trim();
    if (!isl && !sys) continue;
    const formatted = isl && sys ? `${isl}/${sys}` : isl || sys;
    const key = formatted.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(formatted);
    }
  }
  return pairs.join(' ، ');
}

/**
 * Rules 1-1, 1-4, 1-7, 1-9, 1-10: Auto-fills GCV header metadata from selected Detailed rows,
 * linked General Equipment entries (for Release Note & Bill of Lading No.), and active project.
 */
export function buildGcvHeaderAutoFill(
  selectedRows: ReadonlyArray<Pick<DetailedEntry, 'shipmentNo' | 'packageNo' | 'supplier' | 'island' | 'system'>>,
  generalEntries: ReadonlyArray<Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'releaseNo' | 'billOfLadingNo' | 'supplier'>>,
  activeProject?: Pick<ProjectInfo, 'name'> | null,
): GcvHeaderAutoFill {
  const generalByPacking = new Map<string, Array<Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'releaseNo' | 'billOfLadingNo' | 'supplier'>>>();
  for (const g of generalEntries) {
    const pkKey = normToken(g.packingListNo);
    if (!pkKey) continue;
    let bucket = generalByPacking.get(pkKey);
    if (!bucket) {
      bucket = [];
      generalByPacking.set(pkKey, bucket);
    }
    bucket.push(g);
  }

  const releaseNotes: string[] = [];
  const waybills: string[] = [];
  const suppliers: string[] = [];

  for (const row of selectedRows) {
    if (row.supplier?.trim()) suppliers.push(row.supplier.trim());
    const pkKey = normToken(row.shipmentNo);
    const pkgKey = normToken(row.packageNo);
    const genBucket = generalByPacking.get(pkKey) || [];
    const matchedGens = pkgKey
      ? genBucket.filter((g) => !g.packageNo?.trim() || normToken(g.packageNo) === pkgKey)
      : genBucket;
    const effectiveGens = matchedGens.length > 0 ? matchedGens : genBucket;
    for (const g of effectiveGens) {
      if (g.releaseNo?.trim()) releaseNotes.push(g.releaseNo.trim());
      if (g.billOfLadingNo?.trim()) waybills.push(g.billOfLadingNo.trim());
      if (!row.supplier?.trim() && g.supplier?.trim()) suppliers.push(g.supplier.trim());
    }
  }

  return {
    headerProjectTitle: formatHeaderProjectTitle(activeProject?.name),
    supplier: uniqueJoined(suppliers),
    releaseNoteNo: uniqueJoined(releaseNotes),
    islandSystem: formatIslandSystemPairs(selectedRows),
    waybillNo: uniqueJoined(waybills),
  };
}

/**
 * Rule 1-20: Places Detailed Equipment's `notes` ("توضیحات تجهیز") on top
 * and the user's optional per-row remark directly underneath it.
 */
export function combineGcvRemark(
  equipmentNotes: string | undefined | null,
  userRemark: string | undefined | null,
): string {
  const eq = preserveMultiline(equipmentNotes);
  const usr = preserveMultiline(userRemark);
  if (eq && usr) {
    if (eq === usr) return eq;
    return `${eq}\n${usr}`;
  }
  return eq || usr || '';
}

/**
 * Resolves the numeric quantity for GCV issuance:
 * - Form Quantity column (Rule 1-18): Detailed "مقدار واقعی" (falls back to packingQty if actualQty is null).
 * - Detailed table sync ("تعداد رسید مصرف"): Detailed "مقدار پکینگ" (falls back to actualQty if packingQty is null).
 */
export function resolveGcvQuantities(
  row: Pick<DetailedEntry, 'packingQty' | 'actualQty'>,
): { formQty: number; syncDeliveredQty: number } {
  const hasActual = row.actualQty !== null && row.actualQty !== undefined && Number.isFinite(Number(row.actualQty));
  const hasPacking = row.packingQty !== null && row.packingQty !== undefined && Number.isFinite(Number(row.packingQty));
  const actual = hasActual ? Number(row.actualQty) : 0;
  const packing = hasPacking ? Number(row.packingQty) : 0;
  const formQty = hasActual ? actual : packing;
  const syncDeliveredQty = hasPacking ? packing : formQty;
  return { formQty, syncDeliveredQty };
}

/**
 * Rules 1-11 through 1-20: Builds exact MD1EX-FQP02/11-03 line items from selected Detailed rows.
 * - Item No. (1-11): sequential 1..N (rendered in sheet)
 * - PL/Package No. (1-12): Detailed shipmentNo ("شماره محموله")
 * - Package Item (1-13): Detailed packageNo ("شماره نگله")
 * - Description (1-14): Detailed description ("شرح")
 * - Technical info/Size (1-15): Detailed size ("اندازه")
 * - Tag No. (1-16): Detailed itemNo ("شماره آیتم")
 * - UOM (1-17): Detailed countingUnit ("واحد شمارش")
 * - Quantity (1-18): Detailed actualQty ("مقدار واقعی")
 * - Remark (1-20): Detailed notes ("توضیحات تجهیز") + userRemark stacked underneath
 */
export function buildGcvLineItems(
  selectedRows: ReadonlyArray<Pick<
    DetailedComputed,
    'id' | 'shipmentNo' | 'packageNo' | 'itemNo' | 'description' | 'generalDescription' | 'size' | 'countingUnit' | 'packingQty' | 'actualQty' | 'notes'
  >>,
  userRemarksById: Readonly<Record<string, string>> = {},
): DocumentLineItem[] {
  return selectedRows.map((d) => {
    const { formQty } = resolveGcvQuantities(d);
    const equipmentNotes = preserveMultiline(d.notes);
    const userRemark = preserveMultiline(userRemarksById[d.id] || '');
    return {
      detailedId: d.id,
      shipmentNo: (d.shipmentNo || '').trim(),
      packageNo: (d.packageNo || '').trim(),
      itemNo: (d.itemNo || '').trim(),
      description: preserveMultiline(d.description || d.generalDescription),
      technicalInfo: (d.size || '').trim(),
      tagNo: (d.itemNo || '').trim(),
      uom: (d.countingUnit || '').trim(),
      qty: formQty,
      equipmentNotes,
      userRemark,
      remark: combineGcvRemark(equipmentNotes, userRemark),
    };
  });
}

/**
 * Generates a unique, plant-aware GCV receipt number (e.g. NK-GCV-0001)
 * checked against ALL existing project document numbers.
 */
export function generateGcvReceiptNo(
  allUsedDocNos: readonly string[],
  activeProject?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): string {
  return generateNextPlantAwareDocNo('GCV', allUsedDocNos, extractPlantDocConfig(activeProject));
}
