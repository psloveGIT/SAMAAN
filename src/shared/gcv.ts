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
export const MD1_GCV_COMPANY_NAME = 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)';
export const MD1_GCV_TITLE_FA = 'رسید مصرف مستقیم کالا';
export const MD1_GCV_TITLE_EN = 'Not-Stored Goods Consumption Voucher';
export const MD1_GCV_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA می‌باشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.';
export const MD1_GCV_COPY_TEXT =
  'رونوشت: معاونت تأمین، امور مالی، واحد کنترل کالا و انبار، پیمانکار نصب';

export type GcvPurchaseByOption = 'tehran_proc' | 'site_admin' | 'contractor_supplier';

export const GCV_PURCHASE_BY_OPTIONS: ReadonlyArray<{
  value: GcvPurchaseByOption;
  labelFa: string;
  labelEn: string;
}> = [
  { value: 'tehran_proc', labelFa: 'تدارکات تهران', labelEn: 'Tehran Procurement' },
  { value: 'site_admin', labelFa: 'مالی- اداری کارگاه', labelEn: 'Site Finance / Admin' },
  { value: 'contractor_supplier', labelFa: 'پیمانکار تأمین کننده', labelEn: 'Supplier Contractor' },
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
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u00a0]/g, ' ')
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
    let foundRelease = false;
    let foundWaybill = false;
    for (const g of effectiveGens) {
      if (g.releaseNo?.trim()) {
        releaseNotes.push(g.releaseNo.trim());
        foundRelease = true;
      }
      if (g.billOfLadingNo?.trim()) {
        waybills.push(g.billOfLadingNo.trim());
        foundWaybill = true;
      }
      if (!row.supplier?.trim() && g.supplier?.trim()) suppliers.push(g.supplier.trim());
    }
    // Fallback to sibling General rows of the same Packing List if the matched package row lacked releaseNo/billOfLadingNo
    if ((!foundRelease || !foundWaybill) && genBucket.length > effectiveGens.length) {
      for (const g of genBucket) {
        if (!foundRelease && g.releaseNo?.trim()) releaseNotes.push(g.releaseNo.trim());
        if (!foundWaybill && g.billOfLadingNo?.trim()) waybills.push(g.billOfLadingNo.trim());
      }
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

export type GcvGroupFieldKey =
  | 'arrivalDate'
  | 'billOfLadingNo'
  | 'system'
  | 'island'
  | 'supplier'
  | 'unit';

export const GCV_GROUP_FIELD_LABELS: Record<GcvGroupFieldKey, string> = {
  arrivalDate: 'تاریخ ورود',
  billOfLadingNo: 'شماره بارنامه',
  system: 'سیستم',
  island: 'جزیره',
  supplier: 'تأمین کننده',
  unit: 'واحد',
};

export interface GcvRowGroupProfile {
  arrivalDate: string;
  billOfLadingNo: string;
  system: string;
  subSystem: string;
  island: string;
  supplier: string;
  unit: string;
}

export interface GcvCompatibilityResult {
  compatible: boolean;
  mismatchedFields: GcvGroupFieldKey[];
  mismatchedLabelsFa: string[];
  referenceProfile: GcvRowGroupProfile | null;
}

function normGroupVal(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolves the 7 GCV grouping attributes for a Detailed Equipment row
 * (looking up `billOfLadingNo` from its matching General Equipment row when present).
 */
export function getGcvRowGroupProfile(
  row: Pick<
    DetailedEntry,
    'shipmentNo' | 'packageNo' | 'arrivalDate' | 'system' | 'subSystem' | 'island' | 'supplier' | 'unit'
  >,
  generalEntries: ReadonlyArray<
    Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'billOfLadingNo' | 'arrivalDate' | 'supplier'>
  > = [],
): GcvRowGroupProfile {
  const pkKey = normToken(row.shipmentNo);
  const pkgKey = normToken(row.packageNo);
  const matchingGens = pkKey
    ? generalEntries.filter((g) => normToken(g.packingListNo) === pkKey)
    : [];
  const exactGens = pkgKey
    ? matchingGens.filter((g) => !g.packageNo?.trim() || normToken(g.packageNo) === pkgKey)
    : matchingGens;
  const effectiveGens = exactGens.length > 0 ? exactGens : matchingGens;

  const billOfLadingNo = uniqueJoined(effectiveGens.map((g) => g.billOfLadingNo));
  const arrivalDate =
    String(row.arrivalDate || '').trim() ||
    uniqueJoined(effectiveGens.map((g) => g.arrivalDate));
  const supplier =
    String(row.supplier || '').trim() ||
    uniqueJoined(effectiveGens.map((g) => g.supplier));

  return {
    arrivalDate,
    billOfLadingNo,
    system: String(row.system || '').trim(),
    subSystem: String(row.subSystem || '').trim(),
    island: String(row.island || '').trim(),
    supplier,
    unit: String(row.unit || '').trim(),
  };
}

/**
 * Enforces the 6-field identical grouping rule for issuing a single GCV form:
 * All selected items must share identical `arrivalDate`, `billOfLadingNo`, `system`,
 * `island`, `supplier`, and `unit` (subSystem is intentionally unrestricted).
 */
export function checkGcvRowsCompatibility(
  rows: ReadonlyArray<
    Pick<
      DetailedEntry,
      'shipmentNo' | 'packageNo' | 'arrivalDate' | 'system' | 'subSystem' | 'island' | 'supplier' | 'unit'
    >
  >,
  generalEntries: ReadonlyArray<
    Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'billOfLadingNo' | 'arrivalDate' | 'supplier'>
  > = [],
): GcvCompatibilityResult {
  if (rows.length === 0) {
    return {
      compatible: true,
      mismatchedFields: [],
      mismatchedLabelsFa: [],
      referenceProfile: null,
    };
  }
  const referenceProfile = getGcvRowGroupProfile(rows[0], generalEntries);
  if (rows.length === 1) {
    return {
      compatible: true,
      mismatchedFields: [],
      mismatchedLabelsFa: [],
      referenceProfile,
    };
  }

  const keys: GcvGroupFieldKey[] = [
    'arrivalDate',
    'billOfLadingNo',
    'system',
    'island',
    'supplier',
    'unit',
  ];
  const mismatchedSet = new Set<GcvGroupFieldKey>();
  for (let i = 1; i < rows.length; i += 1) {
    const prof = getGcvRowGroupProfile(rows[i], generalEntries);
    for (const k of keys) {
      if (normGroupVal(prof[k]) !== normGroupVal(referenceProfile[k])) {
        mismatchedSet.add(k);
      }
    }
  }
  const mismatchedFields = keys.filter((k) => mismatchedSet.has(k));
  return {
    compatible: mismatchedFields.length === 0,
    mismatchedFields,
    mismatchedLabelsFa: mismatchedFields.map((k) => GCV_GROUP_FIELD_LABELS[k]),
    referenceProfile,
  };
}

/**
 * Rules 1-11 through 1-20: Builds exact MD1EX-FQP02/11-03 line items from selected Detailed rows.
 * - Item No. (1-11): sequential 1..N (rendered in sheet)
 * - PL/Package No. (1-12): Detailed shipmentNo + packageNo ("شماره محموله / شماره نگله")
 * - Package Item (1-13): Detailed itemNo ("شماره آیتم")
 * - Description (1-14): Detailed description ("شرح")
 * - Technical info/Size (1-15): Detailed size ("اندازه")
 * - Tag No. (1-16): Detailed itemCode ("کد کالا")
 * - UOM (1-17): Detailed countingUnit ("واحد شمارش")
 * - Quantity (1-18): Detailed actualQty ("مقدار واقعی")
 * - Remark (1-20): Detailed notes ("توضیحات تجهیز") + userRemark stacked underneath
 */
export function buildGcvLineItems(
  selectedRows: ReadonlyArray<Pick<
    DetailedComputed,
    'id' | 'shipmentNo' | 'packageNo' | 'itemNo' | 'itemCode' | 'description' | 'generalDescription' | 'size' | 'countingUnit' | 'packingQty' | 'actualQty' | 'notes'
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
      tagNo: (d.itemCode || '').trim(),
      uom: (d.countingUnit || '').trim(),
      qty: formQty,
      equipmentNotes,
      userRemark,
      remark: combineGcvRemark(equipmentNotes, userRemark),
    };
  });
}

/**
 * Formats the combined "PL/Package No." display value from shipmentNo ("شماره محموله")
 * and packageNo ("شماره نگله").
 */
export function formatGcvPlPackageNo(
  shipmentNo: string | undefined | null,
  packageNo: string | undefined | null,
): string {
  const s = String(shipmentNo || '').trim();
  const p = String(packageNo || '').trim();
  if (s && p) return `${s} / ${p}`;
  return s || p;
}

/**
 * Generates a unique, plant-aware GCV receipt number (e.g. NK-GCV-0001)
 * checked against existing GCV document numbers.
 */
export function generateGcvReceiptNo(
  existingGcvDocNos: readonly string[],
  activeProject?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): string {
  return generateNextPlantAwareDocNo('GCV', existingGcvDocNos, extractPlantDocConfig(activeProject));
}
