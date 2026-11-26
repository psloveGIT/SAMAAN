import type {
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  ProjectInfo,
} from './types.ts';
import type { PlantDocNumberConfig } from './docNumbering.ts';
import { validatePlantAbbreviation } from './docNumbering.ts';
import { formatHeaderProjectTitle, stripProjectWord } from './opiInvitation.ts';
import { resolveSupplierPrefix } from './substitution.ts';

export const MD1_OPI_MINUTES_FORM_CODE = 'MD1EX-FQP02/06-03';
export const MD1_OPI_MINUTES_COMPANY_NAME = 'شركت احداث و توسعه نيروگاه‌هاي مپنا – توسعه يك (MD1)';
export const MD1_OPI_MINUTES_TITLE_FA = 'صورتجلسه گشايش و بازرسي بسته ها';
export const MD1_OPI_MINUTES_TITLE_EN = 'OPI – Minutes Of Meeting';
export const MD1_OPI_MINUTES_STATEMENT =
  'بسته  (Package)هاي بالا در حضور نمايندگان كارفرما، مشاور، مپنا و انباردار OPI شد و اقلام موجود برابر با Packing List هاي پيوست، تحويل انبارگرديد.';
export const MD1_OPI_MINUTES_COMPLIANT_LABEL =
  'محموله ي بالا فاقد هرگونه مغايرت و آسيب ديدگي مي باشد.';
export const MD1_OPI_MINUTES_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمیباشد.';
export const MD1_OPI_MINUTES_COPY_TEXT =
  'رونوشت: معاونت تأمین تجهیزات، فروشنده، دستگاه نظارت، كارفرما';

export const MD1_MER_FORM_CODE = 'MD1EX-FQP02/12-03';
export const MD1_MER_TITLE_FA = 'گزارش مغايرت، كسري و آسيب ديدگي (مشاهده شده حین OPI)';
export const MD1_MER_TITLE_EN = 'Material Exceptions Report';
export const MD1_MER_COPY_TEXT =
  'رونوشت: معاونت تامين تجهيزات ، فروشنده، دستگاه نظارت، كارفرما';

export type MerDiscrepancyCategory = 'shortage' | 'damaged';

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

function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Returns OPI Invitations that do NOT yet have an OPI Minutes record issued for them.
 * When editing an existing OPI Minute, its linked invitation remains available.
 */
export function filterOpenInvitationsForMinutes(
  invitations: readonly OpiInvitationRecord[],
  existingMinutes: readonly OpiMinutesRecord[],
  editingMinuteId?: string | null,
): OpiInvitationRecord[] {
  const usedInvNos = new Set<string>();
  for (const m of existingMinutes) {
    if (editingMinuteId && m.id === editingMinuteId) continue;
    const invKey = normToken(m.invitationNo);
    const minKey = normToken(m.minutesNo);
    if (invKey) usedInvNos.add(invKey);
    if (minKey) usedInvNos.add(minKey);
  }
  return invitations.filter((inv) => {
    const key = normToken(inv.invitationNo);
    if (!key) return false;
    return !usedInvNos.has(key);
  });
}

export interface OpiMinutesAutoFill {
  minutesNo: string; // Rule 1-4: selected invitationNo
  invitationNo: string; // Rule 1-11: selected invitationNo
  date: string; // Rule 1-2 & 1-19: selected invitation date
  time: string; // Rule 1-18: selected invitation time
  location: string; // Rule 1-20: selected invitation location
  headerProjectTitle: string; // Rule 1-1: e.g. "پروژه نکا"
  projectBareName: string; // Rule 1-9: e.g. "نکا"
  supplier: string; // Rule 1-5: General supplier
  system: string; // Rule 1-6: General system
  island: string; // Rule 1-7: General island
  unit: string; // Rule 1-8: General unit
  contractNo: string; // Rule 1-10: activeProject.contractRef or blank
  purchasePackageNo: string; // Rule 1-12: General purchasePackageNo
  packingNos: string[];
  packingListNo: string;
  items: OpiInvitationLineItem[]; // Rules 1-13..1-17
}

/**
 * Rules 1-1 through 1-20 of MD1EX-FQP02/06-03:
 * Builds complete auto-filled OPI Minutes header & rows from a selected OPI Invitation
 * and its underlying General Equipment entries.
 */
export function buildOpiMinutesAutoFill(
  invitation: OpiInvitationRecord,
  generalEntries: readonly GeneralEntry[],
  activeProject?: Pick<ProjectInfo, 'name' | 'contractRef'> | null,
  rowRemarksByIdx: Readonly<Record<number, string>> = {},
): OpiMinutesAutoFill {
  const invPkNorms = new Set((invitation.packingNos || []).map(normToken).filter(Boolean));
  const invGenIds = new Set(invitation.generalIds || []);
  const matchedGenerals = generalEntries.filter((g) => {
    if (invGenIds.size > 0 && invGenIds.has(g.id)) return true;
    if (invPkNorms.size > 0 && invPkNorms.has(normToken(g.packingListNo))) return true;
    return false;
  });

  const supplier = uniqueJoined([invitation.supplier, ...matchedGenerals.map((g) => g.supplier)]);
  const system = uniqueJoined([invitation.system, ...matchedGenerals.map((g) => g.system)]);
  const island = uniqueJoined([invitation.island, ...matchedGenerals.map((g) => g.island)]);
  const unit = uniqueJoined([invitation.unit, ...matchedGenerals.map((g) => g.unit)]);
  const purchasePackageNo = uniqueJoined([
    invitation.purchasePackageNo,
    ...matchedGenerals.map((g) => g.purchasePackageNo),
  ]);
  const contractNo = (activeProject?.contractRef || invitation.contractNo || '').trim();
  const projectRaw = (activeProject?.name || invitation.projectName || '').trim();

  const baseItems: OpiInvitationLineItem[] =
    invitation.items && invitation.items.length > 0
      ? invitation.items.map((it, idx) => ({
          itemNo: String(idx + 1),
          packingListNo: (it.packingListNo || '').trim(),
          packageNo: (it.packageNo || '').trim(),
          description: (it.description || '').trim(),
          uom: (it.uom || '').trim(),
          remarks: rowRemarksByIdx[idx] !== undefined ? rowRemarksByIdx[idx].trim() : (it.remarks || '').trim(),
        }))
      : matchedGenerals.map((g, idx) => ({
          itemNo: String(idx + 1),
          packingListNo: (g.packingListNo || '').trim(),
          packageNo: (g.packageNo || '').trim(),
          description: (g.itemDescription || '').trim(),
          uom: (g.packageType || '').trim(),
          remarks: rowRemarksByIdx[idx] !== undefined ? rowRemarksByIdx[idx].trim() : '',
        }));

  const packingNos = Array.from(
    new Set([
      ...(invitation.packingNos || []).map((s) => s.trim()).filter(Boolean),
      ...baseItems.map((it) => it.packingListNo).filter(Boolean),
    ]),
  );

  return {
    minutesNo: (invitation.invitationNo || '').trim(),
    invitationNo: (invitation.invitationNo || '').trim(),
    date: (invitation.date || '').trim(),
    time: (invitation.time || '').trim(),
    location: (invitation.location || '').trim(),
    headerProjectTitle: formatHeaderProjectTitle(projectRaw),
    projectBareName: stripProjectWord(projectRaw),
    supplier,
    system,
    island,
    unit,
    contractNo,
    purchasePackageNo,
    packingNos,
    packingListNo: packingNos.join(' ، '),
    items: baseItems,
  };
}

/**
 * Generates unique MER document number matching MD1EX-FQP02/12-03 Rule 1-1:
 *   `<PLANT_ABBR>-<SUPPLIER_CODE>-####` (TUGA->TU, MECO->ME, PARS->PS, other->2-letter abbr)
 * Strictly avoids colliding with ANY existing document number across the entire project.
 */
export function generateMerReportNo(
  supplierName: string | undefined | null,
  allUsedDocNos: readonly string[],
  plantConfig?: PlantDocNumberConfig | null,
  padWidth = 4,
): string {
  const supplierPrefix = resolveSupplierPrefix(supplierName);
  const abbrCheck = validatePlantAbbreviation(plantConfig?.plantAbbreviation);
  const plantAbbr = abbrCheck.valid && abbrCheck.normalized ? abbrCheck.normalized : '';
  const prefix = plantAbbr ? `${plantAbbr}-${supplierPrefix}` : supplierPrefix;

  const escapedSupplier = supplierPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seqMatcher = new RegExp(`^(?:[A-Z]{2,3}-)?${escapedSupplier}-(\\d+)$`, 'i');

  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of allUsedDocNos) {
    const clean = normToken(rawNo);
    if (!clean) continue;
    used.add(clean);
    const m = clean.match(seqMatcher);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }

  let next = maxSeq + 1;
  let candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  }
  return candidate;
}

/**
 * Finds all Detailed Equipment rows belonging to an OPI Invitation's packing lists
 * (and package numbers when narrowed on the invitation's line items).
 */
export function findDetailedRowsForInvitation<T extends Pick<DetailedEntry, 'shipmentNo' | 'packageNo'>>(
  invitation: Pick<OpiInvitationRecord, 'packingNos' | 'items'>,
  detailedItems: readonly T[],
): T[] {
  const pkSet = new Set<string>();
  for (const pk of invitation.packingNos || []) {
    const n = normToken(pk);
    if (n) pkSet.add(n);
  }
  for (const it of invitation.items || []) {
    const n = normToken(it.packingListNo);
    if (n) pkSet.add(n);
  }
  if (pkSet.size === 0) return [];
  return detailedItems.filter((d) => pkSet.has(normToken(d.shipmentNo)));
}

export interface MerDraftInput {
  detailed: Pick<
    DetailedComputed,
    'id' | 'shipmentNo' | 'packageNo' | 'itemNo' | 'itemCode' | 'description' | 'generalDescription' | 'countingUnit' | 'packingQty'
  >;
  category: MerDiscrepancyCategory; // 'shortage' ("کسری") or 'damaged' ("مغایرت/آسیب‌دیدگی")
  discrepantQty: number; // numeric >= 0 (can be 0)
  discrepancyText?: string; // Rule 1-20 Discrepancy column
  remark?: string; // Rule 1-21 Remark column
}

/**
 * Rules 1-12 through 1-21 of MD1EX-FQP02/12-03:
 * Builds official MER report item rows:
 * - Package Quantity (1-17): Detailed packingQty
 * - Discrepant Quantity (1-19): numeric >= 0 entered by user
 * - Received Quantity (1-18): Math.max(0, Package Quantity - Discrepant Quantity)
 * - Discrepancy (1-20): category label + optional user discrepancy text
 * - Remark (1-21): user remark
 */
export function buildMerReportItem(input: MerDraftInput): OsdrReportItem {
  const pkgQty = Number.isFinite(Number(input.detailed.packingQty))
    ? Math.max(0, Number(input.detailed.packingQty))
    : 0;
  const rawDisc = Number(input.discrepantQty);
  const discrepantQty = Number.isFinite(rawDisc) && rawDisc >= 0 ? roundQty(rawDisc) : 0;
  const receivedQty = Math.max(0, roundQty(pkgQty - discrepantQty));

  const isShortage = input.category === 'shortage';
  const defaultReason = isShortage ? 'کسری' : 'مغایرت/آسیب‌دیدگی';
  const cleanReason = (input.discrepancyText || '').trim() || defaultReason;
  const cleanRemark = (input.remark || '').trim();

  return {
    detailedId: input.detailed.id,
    shipmentNo: (input.detailed.shipmentNo || '').trim(),
    packageNo: (input.detailed.packageNo || '').trim(),
    itemNo: (input.detailed.itemNo || '').trim(),
    description: (input.detailed.description || input.detailed.generalDescription || '').trim(),
    itemCode: (input.detailed.itemCode || '').trim(),
    countingUnit: (input.detailed.countingUnit || '').trim(),
    packingQty: pkgQty,
    actualQty: receivedQty,
    shortage: isShortage ? discrepantQty : 0,
    surplus: 0,
    damagedQty: isShortage ? 0 : discrepantQty,
    discrepantQty,
    discrepancyType: isShortage ? 'shortage' : 'damaged',
    discrepancyReason: cleanReason,
    remarks: cleanRemark,
  };
}

/**
 * Formats the combined "توضیحات کسری/مغایرت" (`merDescription`) synced into Detailed Equipment
 * when a MER is issued for a discrepant row.
 */
export function buildDetailedMerDescription(item: Pick<OsdrReportItem, 'discrepancyReason' | 'discrepancyType' | 'remarks'>): string {
  const reason = (item.discrepancyReason || '').trim() || (item.discrepancyType === 'shortage' ? 'کسری' : 'مغایرت/آسیب‌دیدگی');
  const rem = (item.remarks || '').trim();
  if (rem && rem !== reason) return `${reason} - ${rem}`;
  return reason || rem;
}
