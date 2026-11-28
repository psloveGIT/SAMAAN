import type {
  DetailedComputed,
  DetailedEntry,
  DocumentLineItem,
  GeneralEntry,
  ProjectInfo,
} from './types.ts';
import { resolveContractorAbbreviation } from './miv.ts';
import { formatHeaderProjectTitle } from './opiInvitation.ts';
import { getTodayIso } from './jalali.ts';

export const MD1_SMR_FORM_CODE = 'MD1EX-FQP02/08-03';
export const MD1_SMR_COMPANY_NAME = 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)';
export const MD1_SMR_TITLE_FA = 'فرم ارجاع قطعات، کالا و تجهیزات مازاد';
export const MD1_SMR_TITLE_EN = 'Surplus Material Return Form';
export const MD1_SMR_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA می‌باشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.';
export const MD1_SMR_COPY_TEXT =
  'رونوشت: معاونت تأمین تجهیزات، پیمانکار نصب، دفتر فنی';

export type SmrWarehouseTarget = 'smr_mapna' | 'smr_contractor';
export type SmrReasonMode = 'shared' | 'per_row';

export interface SmrHeaderAutoFill {
  headerProjectTitle: string; // Rule 1-1
  supplier: string; // Rule 1-5: تامین کننده from General (fallback Detailed)
  purchasePackageNo: string; // Rule 1-6: شماره بسته خرید from General
  island: string; // Rule 1-7: جزیره from General (fallback Detailed)
  installerContractor: string; // Rule 1-7: تحویل گیرنده from Detailed (fallback mivReceiver)
  releaseNoteNo: string; // Rule 1-7: Release Note from General
  date: string; // Rule 1-9: today ISO date
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

function uniqueJoined(values: Array<string | undefined | null>, sep = '، '): string {
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

/**
 * Rule 1-8 (and sub-rules 1-8-1 through 1-8-16):
 * Generates unique SMR document number in exact format `<PLANT>-<CONTRACTOR>-SMR-####`
 * (or `<CONTRACTOR>-SMR-####` when plantAbbr is empty), incrementing strictly from the
 * highest existing SMR sequence number for the same prefix (starting at 0001).
 */
export function generateSmrDocNo(
  contractorName: string | undefined | null,
  existingSmrNos: readonly string[],
  activeProject?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): string {
  const plantAbbr = String(activeProject?.plantAbbreviation || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  const contractorAbbr = resolveContractorAbbreviation(contractorName);
  const prefix = plantAbbr ? `${plantAbbr}-${contractorAbbr}-SMR` : `${contractorAbbr}-SMR`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d+)$`, 'i');

  let maxNum = 0;
  for (const raw of existingSmrNos) {
    const clean = String(raw || '').trim();
    const m = clean.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

/**
 * Rules 1-1, 1-5, 1-6, 1-7, 1-9: Auto-fills SMR header fields from selected Detailed rows,
 * linked General Equipment entries, and active project.
 */
export function buildSmrHeaderAutoFill(
  selectedRows: ReadonlyArray<Pick<DetailedEntry, 'shipmentNo' | 'packageNo' | 'supplier' | 'island' | 'receiver' | 'mivReceiver'>>,
  generalEntries: ReadonlyArray<Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'supplier' | 'purchasePackageNo' | 'island' | 'releaseNo'>>,
  activeProject?: Pick<ProjectInfo, 'name'> | null,
  todayIso?: string,
): SmrHeaderAutoFill {
  const generalByPacking = new Map<
    string,
    Array<Pick<GeneralEntry, 'packingListNo' | 'packageNo' | 'supplier' | 'purchasePackageNo' | 'island' | 'releaseNo'>>
  >();
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

  const suppliers: string[] = [];
  const purchasePackages: string[] = [];
  const islands: string[] = [];
  const installers: string[] = [];
  const releaseNotes: string[] = [];

  for (const row of selectedRows) {
    const pkKey = normToken(row.shipmentNo);
    const pkgKey = normToken(row.packageNo);
    const genBucket = generalByPacking.get(pkKey) || [];
    const matchedGens = pkgKey
      ? genBucket.filter((g) => !g.packageNo?.trim() || normToken(g.packageNo) === pkgKey)
      : genBucket;
    const effectiveGens = matchedGens.length > 0 ? matchedGens : genBucket;

    let foundSupplier = false;
    let foundPurchasePkg = false;
    let foundIsland = false;
    let foundRelease = false;

    for (const g of effectiveGens) {
      if (g.supplier?.trim()) {
        suppliers.push(g.supplier.trim());
        foundSupplier = true;
      }
      if (g.purchasePackageNo?.trim()) {
        purchasePackages.push(g.purchasePackageNo.trim());
        foundPurchasePkg = true;
      }
      if (g.island?.trim()) {
        islands.push(g.island.trim());
        foundIsland = true;
      }
      if (g.releaseNo?.trim()) {
        releaseNotes.push(g.releaseNo.trim());
        foundRelease = true;
      }
    }

    // Sibling General rows fallback within same Packing List
    if ((!foundPurchasePkg || !foundRelease || !foundSupplier || !foundIsland) && genBucket.length > effectiveGens.length) {
      for (const g of genBucket) {
        if (!foundSupplier && g.supplier?.trim()) suppliers.push(g.supplier.trim());
        if (!foundPurchasePkg && g.purchasePackageNo?.trim()) purchasePackages.push(g.purchasePackageNo.trim());
        if (!foundIsland && g.island?.trim()) islands.push(g.island.trim());
        if (!foundRelease && g.releaseNo?.trim()) releaseNotes.push(g.releaseNo.trim());
      }
    }

    if (!foundSupplier && row.supplier?.trim()) suppliers.push(row.supplier.trim());
    if (!foundIsland && row.island?.trim()) islands.push(row.island.trim());

    const rec = String(row.receiver || row.mivReceiver || '').trim();
    if (rec) installers.push(rec);
  }

  return {
    headerProjectTitle: formatHeaderProjectTitle(activeProject?.name),
    supplier: uniqueJoined(suppliers),
    purchasePackageNo: uniqueJoined(purchasePackages),
    island: uniqueJoined(islands),
    installerContractor: uniqueJoined(installers),
    releaseNoteNo: uniqueJoined(releaseNotes),
    date: todayIso || getTodayIso(),
  };
}

/**
 * Rule 1-16: Returns the maximum allowed return quantity for a Detailed row.
 * Uses `actualQty` ("مقدار واقعی"), falling back to `packingQty` if `actualQty` is null.
 */
export function getSmrMaxReturnQty(
  row: Pick<DetailedEntry, 'actualQty' | 'packingQty'>,
): number {
  if (row.actualQty !== null && row.actualQty !== undefined && Number.isFinite(Number(row.actualQty))) {
    return Math.max(0, Number(row.actualQty));
  }
  if (row.packingQty !== null && row.packingQty !== undefined && Number.isFinite(Number(row.packingQty))) {
    return Math.max(0, Number(row.packingQty));
  }
  return 0;
}

/**
 * Rule 1-16: Validates that the user's Returned Quantity is > 0 and does not exceed `actualQty`.
 */
export function validateSmrReturnQty(
  qty: number,
  row: Pick<DetailedEntry, 'actualQty' | 'packingQty' | 'shipmentNo' | 'packageNo' | 'itemNo'>,
): { ok: boolean; maxQty: number; errorFa?: string; errorEn?: string } {
  const maxQty = getSmrMaxReturnQty(row);
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      ok: false,
      maxQty,
      errorFa: `تعداد برگشتی برای ردیف ${row.shipmentNo}/${row.packageNo}/${row.itemNo} باید عددی بزرگ‌تر از صفر باشد.`,
      errorEn: `Returned quantity for ${row.shipmentNo}/${row.packageNo}/${row.itemNo} must be greater than zero.`,
    };
  }
  if (maxQty > 0 && qty > maxQty + 1e-9) {
    return {
      ok: false,
      maxQty,
      errorFa: `تعداد برگشتی (${qty}) برای ردیف ${row.shipmentNo}/${row.packageNo}/${row.itemNo} نمی‌تواند بیشتر از مقدار واقعی (${maxQty}) باشد.`,
      errorEn: `Returned quantity (${qty}) for ${row.shipmentNo}/${row.packageNo}/${row.itemNo} cannot exceed actual quantity (${maxQty}).`,
    };
  }
  return { ok: true, maxQty };
}

/**
 * Resolves the return reason ("دلیل عودت") for a row depending on whether the user
 * chose a single shared reason across all rows or individual per-row reasons.
 */
export function resolveSmrRowReason(
  mode: SmrReasonMode,
  sharedReason: string,
  perRowReasons: Record<string, string>,
  rowId: string,
): string {
  if (mode === 'shared') {
    return String(sharedReason || '').trim();
  }
  return String(perRowReasons[rowId] || '').trim();
}

/**
 * Rules 1-10 through 1-17: Builds a standardized SMR DocumentLineItem from a Detailed row.
 */
export function buildSmrLineItem(
  row: Pick<DetailedComputed, 'id' | 'shipmentNo' | 'packageNo' | 'itemNo' | 'itemCode' | 'description' | 'generalDescription' | 'countingUnit'>,
  qty: number,
  returnReason: string,
  remark: string,
): DocumentLineItem {
  return {
    detailedId: row.id,
    shipmentNo: String(row.shipmentNo || '').trim(),
    packageNo: String(row.packageNo || '').trim(),
    itemNo: String(row.itemNo || '').trim(),
    tagNo: String(row.itemCode || '').trim(),
    description: String(row.description || row.generalDescription || '').trim(),
    uom: String(row.countingUnit || '').trim(),
    qty,
    returnReason: String(returnReason || '').trim(),
    remark: String(remark || '').trim(),
  };
}
