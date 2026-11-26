import { normalizeDigits } from './jalali.ts';

export type FilterOperator = 'contains' | 'equals' | 'not_equals' | 'gte' | 'lte' | 'not_empty';

export type FilterConnector = 'AND' | 'OR';

export interface CustomFieldFilter {
  field: string;
  op: FilterOperator;
  value: string;
  connector?: FilterConnector;
}

export interface FilterFieldOption {
  key: string;
  labelFa: string;
  labelEn: string;
  isNumeric?: boolean;
}

export const GENERAL_FILTER_FIELDS: FilterFieldOption[] = [
  { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.' },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'packageType', labelFa: 'نوع بسته‌بندی', labelEn: 'Package Type' },
  { key: 'itemCount', labelFa: 'تعداد اقلام نگله', labelEn: 'Package Item Count', isNumeric: true },
  { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description' },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier' },
  { key: 'dispatchLocation', labelFa: 'محل ارسال', labelEn: 'Dispatch Location' },
  { key: 'employerEntryMinutesNo', labelFa: 'شماره صورتجلسه ورود کارفرما', labelEn: 'Employer Entry Minutes No.' },
  { key: 'mapnaEntryMinutesNo', labelFa: 'شماره صورتجلسه ورود مپنا', labelEn: 'MAPNA Entry Minutes No.' },
  { key: 'releaseNo', labelFa: 'Release Note', labelEn: 'Release Note' },
  { key: 'island', labelFa: 'جزیره', labelEn: 'Island' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'grossWeight', labelFa: 'وزن پکینگ ناخالص', labelEn: 'Gross Weight', isNumeric: true },
  { key: 'netWeight', labelFa: 'وزن پکینگ خالص', labelEn: 'Net Weight', isNumeric: true },
  { key: 'weighbridgeWeight', labelFa: 'وزن باسکول سایت/بارنامه', labelEn: 'Weighbridge Weight', isNumeric: true },
  { key: 'lengthCm', labelFa: 'طول (متر)', labelEn: 'Length (m)', isNumeric: true },
  { key: 'widthCm', labelFa: 'عرض (متر)', labelEn: 'Width (m)', isNumeric: true },
  { key: 'heightCm', labelFa: 'ارتفاع (متر)', labelEn: 'Height (m)', isNumeric: true },
  { key: 'billOfLadingNo', labelFa: 'شماره بارنامه', labelEn: 'Waybill No.' },
  { key: 'vehicleNo', labelFa: 'شماره خودرو', labelEn: 'Vehicle No.' },
  { key: 'freightCost', labelFa: 'مبلغ کرایه حمل (ریال)', labelEn: 'Freight Cost (IRR)', isNumeric: true },
  { key: 'driverName', labelFa: 'نام راننده', labelEn: 'Driver Name' },
  { key: 'purchasePackageNo', labelFa: 'شماره بسته خرید', labelEn: 'Purchase Package No.' },
  { key: 'opiInvitationNo', labelFa: 'شماره دعوتنامه OPI', labelEn: 'OPI Invitation No.' },
];

export const DETAILED_FILTER_FIELDS: FilterFieldOption[] = [
  { key: 'shipmentNo', labelFa: 'شماره محموله / پکینگ لیست', labelEn: 'Shipment / Packing No.' },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'itemNo', labelFa: 'شماره آیتم', labelEn: 'Item No.' },
  { key: 'generalDescription', labelFa: 'شرح کلی', labelEn: 'General Description' },
  { key: 'description', labelFa: 'شرح کالا', labelEn: 'Description' },
  { key: 'size', labelFa: 'اندازه', labelEn: 'Size' },
  { key: 'itemCode', labelFa: 'کد کالا', labelEn: 'Item Code' },
  { key: 'mtoRef', labelFa: 'MTO', labelEn: 'MTO' },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier' },
  { key: 'origin', labelFa: 'مبدا', labelEn: 'Origin' },
  { key: 'island', labelFa: 'جزیره', labelEn: 'Island' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'countingUnit', labelFa: 'واحد شمارش', labelEn: 'Counting Unit' },
  { key: 'packingQty', labelFa: 'مقدار پکینگ', labelEn: 'Packing Qty', isNumeric: true },
  { key: 'actualQty', labelFa: 'مقدار واقعی', labelEn: 'Actual Qty', isNumeric: true },
  { key: 'shortage', labelFa: 'کسری', labelEn: 'Shortage', isNumeric: true },
  { key: 'damagedQty', labelFa: 'آسیب دیده', labelEn: 'Damaged Qty', isNumeric: true },
  { key: 'mapnaInventory', labelFa: 'موجودی کارفرما', labelEn: 'Employer Stock', isNumeric: true },
  { key: 'contractorInventory', labelFa: 'موجودی پیمانکار', labelEn: 'Contractor Stock', isNumeric: true },
  { key: 'storageLocation', labelFa: 'محل نگهداری', labelEn: 'Storage Location' },
  { key: 'opiNo', labelFa: 'شماره دعوتنامه', labelEn: 'Invitation No.' },
  { key: 'merNo', labelFa: 'شماره کسری/مغایرت', labelEn: 'Discrepancy/Shortage No.' },
  { key: 'merStatus', labelFa: 'وضعیت کسری/مغایرت', labelEn: 'Discrepancy/Shortage Status' },
  { key: 'notes', labelFa: 'توضیحات تجهیز', labelEn: 'Equipment Notes' },
  { key: 'repNo', labelFa: 'شماره جایگزینی', labelEn: 'Substitution No.' },
  { key: 'repStatus', labelFa: 'وضعیت جایگزینی', labelEn: 'Substitution Status' },
  { key: 'repReprocured', labelFa: 'تأمین مجدد جایگزین شده', labelEn: 'Reprocured Replacement' },
  { key: 'itemCategory', labelFa: 'دسته‌بندی تخصصی قلم', labelEn: 'Item Classification' },
  { key: 'chemicalType', labelFa: 'نوع ماده شیمیایی', labelEn: 'Chemical Type' },
  { key: 'productionDate', labelFa: 'تاریخ تولید', labelEn: 'Production Date' },
  { key: 'expirationDate', labelFa: 'تاریخ انقضاء', labelEn: 'Expiration Date' },
  { key: 'gcvReceiptNo', labelFa: 'شماره رسید مصرف', labelEn: 'Consumption Receipt No.' },
  { key: 'mivContractorNo', labelFa: 'شماره حواله', labelEn: 'MIV Issue No.' },
  { key: 'mivReceiver', labelFa: 'تحویل گیرنده (حواله)', labelEn: 'MIV Receiver' },
  { key: 'smrDeliverer', labelFa: 'تحویل آورنده (برگشتی)', labelEn: 'Returned By' },
  { key: 'materialBalanceNo', labelFa: 'شماره بالانس متریال', labelEn: 'Material Balance No.' },
  { key: 'balanceStatus', labelFa: 'وضعیت بالانس متریال', labelEn: 'Material Balance Status' },
  { key: 'stocktakeStatus', labelFa: 'وضعیت انبارگردانی', labelEn: 'Stocktake Status' },
  { key: 'receiver', labelFa: 'تحویل گیرنده', labelEn: 'Receiver' },
];

export const TRANSIT_FILTER_FIELDS: FilterFieldOption[] = [
  { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.' },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'overallStatus', labelFa: 'وضعیت کلی', labelEn: 'Overall Status' },
  { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description' },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier' },
  { key: 'dispatchLocation', labelFa: 'محل ارسال', labelEn: 'Dispatch Location' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'carrierContractor', labelFa: 'پیمانکار حمل', labelEn: 'Carrier Contractor' },
  { key: 'billOfLadingNo', labelFa: 'شماره بارنامه', labelEn: 'Waybill No.' },
  { key: 'releaseNetNo', labelFa: 'شماره رلیزنت', labelEn: 'Release Net No.' },
  { key: 'interimNo', labelFa: 'شماره علی الحساب', labelEn: 'Interim No.' },
  { key: 'amount', labelFa: 'مبلغ (ریال)', labelEn: 'Amount (IRR)', isNumeric: true },
];

export function parsePackingNosParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v || '').trim()).filter(Boolean);
      }
    } catch {
      // Fallback
    }
  }
  return trimmed
    .split(/[,،|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCustomFiltersParam(raw: string | null | undefined): CustomFieldFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is CustomFieldFilter => Boolean(f && typeof f.field === 'string' && f.field.trim()))
      .map((f) => ({
        field: f.field.trim(),
        op: f.op || 'contains',
        value: String(f.value ?? '').trim(),
        connector: f.connector === 'OR' ? ('OR' as const) : ('AND' as const),
      }))
      .filter((f) => f.op === 'not_empty' || f.value !== '');
  } catch {
    return [];
  }
}

export function matchesMultiPacking(
  recordPackingNo: string | undefined | null,
  selectedPackings: string[],
): boolean {
  if (!selectedPackings || selectedPackings.length === 0) return true;
  const val = normalizeDigits(String(recordPackingNo || '')).trim().toLowerCase();
  if (!val) return false;
  return selectedPackings.some((p) => normalizeDigits(p).trim().toLowerCase() === val);
}

function normalizeItemCategoryToken(val: string): string {
  const s = val.replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();
  if (!s || s === 'standard' || s.includes('عادی') || s.includes('استاندارد')) return 'standard';
  if (s === 'special_tools' || s.includes('ابزار') || s.includes('tool')) return 'special_tools';
  if (s === 'chemicals' || s.includes('شیمی') || s.includes('chemical')) return 'chemicals';
  if (s === 'spare_parts' || s.includes('یدک') || s.includes('spare')) return 'spare_parts';
  return s;
}

function evaluateSingleFilter(record: Record<string, unknown>, f: CustomFieldFilter): boolean {
  const rawVal = record[f.field];
  const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();
  const normVal = normalizeDigits(strVal).toLowerCase();
  const normTarget = normalizeDigits(f.value).toLowerCase().trim();

  if (f.field === 'itemCategory') {
    const recCat = normalizeItemCategoryToken(strVal);
    if (f.op === 'not_empty') return true;
    const targetCat = normalizeItemCategoryToken(f.value);
    if (f.op === 'equals' || f.op === 'contains') return recCat === targetCat;
    if (f.op === 'not_equals') return recCat !== targetCat;
    return true;
  }

  if (f.op === 'not_empty') {
    return Boolean(strVal);
  }
  if (f.op === 'contains') {
    return normVal.includes(normTarget);
  }
  if (f.op === 'equals') {
    return normVal === normTarget;
  }
  if (f.op === 'not_equals') {
    return normVal !== normTarget;
  }
  if (f.op === 'gte' || f.op === 'lte') {
    const nVal = Number(normVal.replace(/[,،٬]/g, ''));
    const nTarget = Number(normTarget.replace(/[,،٬]/g, ''));
    if (!Number.isFinite(nVal) || !Number.isFinite(nTarget)) return false;
    if (f.op === 'gte') return nVal >= nTarget;
    return nVal <= nTarget;
  }
  return true;
}

export function matchesCustomFilters(
  record: Record<string, unknown>,
  filters: CustomFieldFilter[],
): boolean {
  if (!filters || filters.length === 0) return true;
  let acc = evaluateSingleFilter(record, filters[0]);
  for (let i = 1; i < filters.length; i += 1) {
    const f = filters[i];
    const matched = evaluateSingleFilter(record, f);
    if (f.connector === 'OR') {
      acc = acc || matched;
    } else {
      acc = acc && matched;
    }
  }
  return acc;
}
