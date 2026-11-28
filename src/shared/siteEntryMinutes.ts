import type {
  GeneralEntry,
  ProjectInfo,
  SiteEntryLineItem,
} from './types.ts';
import {
  extractPlantDocConfig,
  generateNextPlantAwareDocNo,
} from './docNumbering.ts';
import { formatHeaderProjectTitle } from './opiInvitation.ts';

export const MD1_SITE_ENTRY_FORM_CODE = 'MD1EX-FQP02/15-01';
export const MD1_SITE_ENTRY_COMPANY_NAME = 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)';
export const MD1_SITE_ENTRY_TITLE_FA = 'صورتجلسه ورود کالا و تجهیزات به کارگاه';
export const MD1_SITE_ENTRY_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA می‌باشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.';
export const MD1_SITE_ENTRY_COPY_TEXT =
  'رونوشت: انبارداری، تامین تجهیزات توسعه یک، انتظامات';

export type SiteEntryGoodsUsage = 'project' | 'site_equip' | 'general';

export const SITE_ENTRY_GOODS_USAGE_OPTIONS: ReadonlyArray<{
  value: SiteEntryGoodsUsage;
  labelFa: string;
  labelEn: string;
}> = [
  { value: 'project', labelFa: 'کالای پروژه', labelEn: 'Project Goods' },
  { value: 'site_equip', labelFa: 'کالای تجهیز کارگاه', labelEn: 'Site Equipment' },
  { value: 'general', labelFa: 'مصرف عمومی', labelEn: 'General Consumption' },
] as const;

export interface SiteEntryHeaderAutoFill {
  headerProjectTitle: string; // Rule 1-1: e.g. "پروژه نکا"
  arrivalDate: string; // Rule 1-2: تاریخ ورود from General Equipment
  requester: string; // Rule 1-3: درخواست کننده (fallback supplier)
  contractNo: string; // Rule 1-4: کد قرارداد پروژه (یا خالی)
  system: string; // Rule 1-6: سیستم
  island: string; // Rule 1-7: جزیره
  unit: string; // Rule 1-8: واحد
  vehicleModel: string; // Rule 1-9: مدل وسیله نقلیه
  vehicleNo: string; // Rule 1-10: شماره خودرو
  waybillNo: string; // Rule 1-11: شماره بارنامه
  driverName: string; // Rule 1-12: نام راننده
  releaseNoteNo: string;
  origin: string;
  weighbridgeWeight: number | null;
  packingListNos: string[];
  generalIds: string[];
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
 * Formats package dimensions (Length × Width × Height) from General Equipment.
 */
export function formatSiteEntryDimensions(
  entry: Pick<GeneralEntry, 'lengthCm' | 'widthCm' | 'heightCm'>,
): string {
  const parts = [entry.lengthCm, entry.widthCm, entry.heightCm]
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (parts.length === 0) return '';
  return parts.join(' × ');
}

/**
 * Rules 1-1 through 1-12: Auto-fills Site Entry Minutes header & transport fields
 * from selected General Equipment rows and the active project profile.
 */
export function buildSiteEntryHeaderAutoFill(
  selectedRows: ReadonlyArray<GeneralEntry>,
  activeProject?: Pick<ProjectInfo, 'name' | 'code' | 'contractRef'> | null,
): SiteEntryHeaderAutoFill {
  const first = selectedRows[0];
  const packingListNos = Array.from(
    new Set(selectedRows.map((r) => String(r.packingListNo || '').trim()).filter(Boolean)),
  );
  const generalIds = selectedRows.map((r) => r.id).filter(Boolean);

  // Rule 1-3: Requester from General ("درخواست کننده"), falling back to supplier if empty
  const requesters = selectedRows.map((r) => (r.requester || '').trim()).filter(Boolean);
  const suppliers = selectedRows.map((r) => (r.supplier || '').trim()).filter(Boolean);

  // Rule 1-2: Arrival date from General ("تاریخ ورود")
  const arrivalDate =
    selectedRows.map((r) => (r.arrivalDate || '').trim()).find(Boolean) || '';

  return {
    headerProjectTitle: formatHeaderProjectTitle(activeProject?.name),
    arrivalDate,
    requester: uniqueJoined(requesters.length > 0 ? requesters : suppliers),
    contractNo: String(activeProject?.contractRef || activeProject?.code || '').trim(),
    system: uniqueJoined(selectedRows.map((r) => r.system)),
    island: uniqueJoined(selectedRows.map((r) => r.island)),
    unit: uniqueJoined(selectedRows.map((r) => r.unit)),
    vehicleModel: uniqueJoined(selectedRows.map((r) => r.vehicleModel)),
    vehicleNo: uniqueJoined(selectedRows.map((r) => r.vehicleNo)),
    waybillNo: uniqueJoined(selectedRows.map((r) => r.billOfLadingNo)),
    driverName: uniqueJoined(selectedRows.map((r) => r.driverName)),
    releaseNoteNo: uniqueJoined(selectedRows.map((r) => r.releaseNo)),
    origin: uniqueJoined(selectedRows.map((r) => r.dispatchLocation)),
    weighbridgeWeight:
      first && typeof first.weighbridgeWeight === 'number' ? first.weighbridgeWeight : null,
    packingListNos,
    generalIds,
  };
}

/**
 * Rules 1-13 through 1-22: Builds the official Site Entry Minutes table rows
 * from selected General Equipment rows + optional per-row user remarks.
 */
export function buildSiteEntryLineItems(
  selectedRows: ReadonlyArray<GeneralEntry>,
  remarksByGeneralId?: Record<string, string>,
): SiteEntryLineItem[] {
  return selectedRows.map((row) => {
    const pkgCount =
      typeof row.packageCount === 'number' && Number.isFinite(row.packageCount) && row.packageCount > 0
        ? String(row.packageCount)
        : '1';
    return {
      generalId: row.id,
      description: String(row.itemDescription || '').trim(),
      packingListNo: String(row.packingListNo || '').trim(),
      packageNo: String(row.packageNo || '').trim(),
      dimensions: formatSiteEntryDimensions(row),
      qty: pkgCount,
      unit: String(row.packageType || '').trim(),
      netWeight:
        typeof row.netWeight === 'number' && Number.isFinite(row.netWeight)
          ? String(row.netWeight)
          : '',
      grossWeight:
        typeof row.grossWeight === 'number' && Number.isFinite(row.grossWeight)
          ? String(row.grossWeight)
          : '',
      remarks: String(remarksByGeneralId?.[row.id] || '').trim(),
    };
  });
}

/**
 * Generates the next unique sequential Site Entry Minutes number (e.g. NK-SE-0001 or SE-0001).
 */
export function generateSiteEntryMinutesNo(
  existingMinutesNos: readonly string[],
  activeProject?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): string {
  const cfg = extractPlantDocConfig(activeProject);
  return generateNextPlantAwareDocNo('SE', existingMinutesNos, cfg, 4);
}

/**
 * Checks whether a General Equipment row already has a Warehouse Entry Minutes No.
 */
export function hasSiteEntryMinutes(entry: Pick<GeneralEntry, 'mapnaEntryMinutesNo'>): boolean {
  return Boolean(String(entry.mapnaEntryMinutesNo || '').trim());
}
