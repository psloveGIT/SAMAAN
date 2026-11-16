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
  { key: 'opiInvitationNo', labelFa: 'شماره دعوتنامه OPI', labelEn: 'OPI Invitation No.' },
];

export const DETAILED_FILTER_FIELDS: FilterFieldOption[] = [
  { key: 'shipmentNo', labelFa: 'شماره محموله / پکینگ لیست', labelEn: 'Shipment / Packing No.' },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'itemNo', labelFa: 'شماره آیتم', labelEn: 'Item No.' },
  { key: 'generalDescription', labelFa: 'شرح کلی', labelEn: 'General Description' },
  { key: 'description', labelFa: 'شرح کالا', labelEn: 'Description' },
  { key: 'size', labelFa: 'سایز', labelEn: 'Size' },
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
  { key: 'mapnaInventory', labelFa: 'موجودی مپنا', labelEn: 'MAPNA Stock', isNumeric: true },
  { key: 'contractorInventory', labelFa: 'موجودی پیمانکار', labelEn: 'Contractor Stock', isNumeric: true },
  { key: 'storageLocation', labelFa: 'محل نگهداری', labelEn: 'Storage Location' },
  { key: 'opiNo', labelFa: 'شماره OPI', labelEn: 'OPI No.' },
  { key: 'merNo', labelFa: 'شماره MER', labelEn: 'MER No.' },
  { key: 'merStatus', labelFa: 'وضعیت MER', labelEn: 'MER Status' },
  { key: 'repNo', labelFa: 'شماره REP', labelEn: 'REP No.' },
  { key: 'repStatus', labelFa: 'وضعیت REP', labelEn: 'REP Status' },
  { key: 'itemCategory', labelFa: 'دسته‌بندی تخصصی قلم', labelEn: 'Item Classification' },
  { key: 'chemicalType', labelFa: 'نوع ماده شیمیایی', labelEn: 'Chemical Type' },
  { key: 'productionDate', labelFa: 'تاریخ تولید', labelEn: 'Production Date' },
  { key: 'expirationDate', labelFa: 'تاریخ انقضاء', labelEn: 'Expiration Date' },
  { key: 'gcvReceiptNo', labelFa: 'شماره رسید', labelEn: 'Receipt No.' },
  { key: 'mivContractorNo', labelFa: 'شماره MIV', labelEn: 'MIV No.' },
  { key: 'materialBalanceNo', labelFa: 'شماره بالانس متریال', labelEn: 'Material Balance No.' },
  { key: 'balanceStatus', labelFa: 'وضعیت بالانس', labelEn: 'Balance Status' },
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

function evaluateSingleFilter(record: Record<string, unknown>, f: CustomFieldFilter): boolean {
  const rawVal = record[f.field];
  const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();
  const normVal = normalizeDigits(strVal).toLowerCase();
  const normTarget = normalizeDigits(f.value).toLowerCase().trim();

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
