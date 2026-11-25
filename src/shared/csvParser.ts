import { extractChemicalDatesFromTexts } from './chemicalDates.ts';
import { normalizeRepStatus } from './docNumbering.ts';
import { normalizeDigits, parseFlexibleDateToIso } from './jalali.ts';
import { inferItemClassification, normalizeCountingUnitToFa, normalizeTransitStatus } from './normalizers.ts';
import type {
  CalendarMode,
  DetailedEntry,
  GeneralEntry,
  ImportRejectedRecord,
  TransitEntry,
} from './types.ts';

export type ImportScope = 'general' | 'detailed' | 'transit';

export interface ImportColumnDef {
  key: string;
  labelFa: string;
  labelEn: string;
  required?: boolean;
  isDate?: boolean;
  isNumeric?: boolean;
}

export const GENERAL_IMPORT_COLUMNS: ImportColumnDef[] = [
  { key: 'rowNo', labelFa: 'ردیف', labelEn: 'Row No.' },
  { key: 'arrivalDate', labelFa: 'تاریخ ورود', labelEn: 'Arrival Date', isDate: true },
  { key: 'releaseNo', labelFa: 'شماره Release Note', labelEn: 'Release Note No.' },
  { key: 'releaseDate', labelFa: 'تاریخ Release Note', labelEn: 'Release Note Date', isDate: true },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier', required: true },
  { key: 'dispatchLocation', labelFa: 'محل ارسال', labelEn: 'Dispatch Location', required: true },
  { key: 'employerEntryMinutesNo', labelFa: 'شماره صورتجلسه کارفرما', labelEn: 'Employer Entry Minutes No.' },
  { key: 'mapnaEntryMinutesNo', labelFa: 'شماره صورتجلسه مپنا', labelEn: 'MAPNA Entry Minutes No.' },
  { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.', required: true },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.', required: true },
  { key: 'packageType', labelFa: 'نوع بسته‌بندی', labelEn: 'Package Type' },
  { key: 'itemCount', labelFa: 'تعداد اقلام نگله', labelEn: 'Package Item Count', isNumeric: true },
  { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description', required: true },
  { key: 'island', labelFa: 'جزیره', labelEn: 'Island' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'grossWeight', labelFa: 'وزن ناخالص (kg)', labelEn: 'Gross Weight (kg)', isNumeric: true },
  { key: 'netWeight', labelFa: 'وزن خالص (kg)', labelEn: 'Net Weight (kg)', isNumeric: true },
  { key: 'lengthCm', labelFa: 'طول (متر)', labelEn: 'Length (m)', isNumeric: true },
  { key: 'widthCm', labelFa: 'عرض (متر)', labelEn: 'Width (m)', isNumeric: true },
  { key: 'heightCm', labelFa: 'ارتفاع (متر)', labelEn: 'Height (m)', isNumeric: true },
  { key: 'billOfLadingNo', labelFa: 'شماره بارنامه', labelEn: 'Waybill No.' },
  { key: 'vehicleNo', labelFa: 'شماره خودرو', labelEn: 'Vehicle No.' },
  { key: 'weighbridgeWeight', labelFa: 'وزن باسکول (kg)', labelEn: 'Weighbridge Weight (kg)', isNumeric: true },
  { key: 'freightCost', labelFa: 'کرایه حمل (ریال)', labelEn: 'Freight Cost (IRR)', isNumeric: true },
  { key: 'opiInvitationNo', labelFa: 'شماره دعوتنامه OPI', labelEn: 'OPI Invitation No.' },
  { key: 'opiInvitationDate', labelFa: 'تاریخ دعوتنامه OPI', labelEn: 'OPI Invitation Date', isDate: true },
  { key: 'driverName', labelFa: 'نام راننده', labelEn: 'Driver Name' },
];

export const DETAILED_IMPORT_COLUMNS: ImportColumnDef[] = [
  { key: 'rowNo', labelFa: 'ردیف', labelEn: 'Row No.' },
  { key: 'arrivalDate', labelFa: 'تاریخ ورود', labelEn: 'Arrival Date', isDate: true },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier' },
  { key: 'origin', labelFa: 'مبدا', labelEn: 'Origin' },
  { key: 'shipmentNo', labelFa: 'شماره محموله / پکینگ', labelEn: 'Shipment / Packing No.', required: true },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'itemNo', labelFa: 'شماره آیتم', labelEn: 'Item No.', required: true },
  { key: 'generalDescription', labelFa: 'شرح کلی', labelEn: 'General Description' },
  { key: 'description', labelFa: 'شرح', labelEn: 'Description', required: true },
  { key: 'size', labelFa: 'اندازه', labelEn: 'Size' },
  { key: 'itemCode', labelFa: 'کد کالا', labelEn: 'Item Code' },
  { key: 'itemCategory', labelFa: 'دسته‌بندی تخصصی قلم', labelEn: 'Item Classification' },
  { key: 'chemicalType', labelFa: 'نوع ماده شیمیایی', labelEn: 'Chemical Type' },
  { key: 'productionDate', labelFa: 'تاریخ تولید', labelEn: 'Production Date', isDate: true },
  { key: 'expirationDate', labelFa: 'تاریخ انقضاء', labelEn: 'Expiration Date', isDate: true },
  { key: 'packingQty', labelFa: 'مقدار پکینگ', labelEn: 'Packing Qty', isNumeric: true },
  { key: 'actualQty', labelFa: 'مقدار واقعی', labelEn: 'Actual Qty', isNumeric: true },
  { key: 'shortage', labelFa: 'کسری', labelEn: 'Shortage', isNumeric: true },
  { key: 'surplus', labelFa: 'اضافی', labelEn: 'Surplus', isNumeric: true },
  { key: 'damagedQty', labelFa: 'آسیب دیده', labelEn: 'Damaged Qty', isNumeric: true },
  { key: 'mtoRef', labelFa: 'MTO', labelEn: 'MTO' },
  { key: 'repNo', labelFa: 'شماره جایگزینی', labelEn: 'Substitution No.' },
  { key: 'repStatus', labelFa: 'وضعیت جایگزینی', labelEn: 'Substitution Status' },
  { key: 'repReprocured', labelFa: 'تأمین مجدد جایگزین شده', labelEn: 'Reprocured Replacement' },
  { key: 'repDescription', labelFa: 'توضیحات جایگزینی', labelEn: 'Substitution Description' },
  { key: 'countingUnit', labelFa: 'واحد شمارش', labelEn: 'Counting Unit' },
  { key: 'island', labelFa: 'جزیره', labelEn: 'Island' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'opiNo', labelFa: 'شماره دعوتنامه', labelEn: 'Invitation No.' },
  { key: 'opiDate', labelFa: 'تاریخ دعوتنامه', labelEn: 'Invitation Date', isDate: true },
  { key: 'merNo', labelFa: 'شماره کسری/مغایرت', labelEn: 'Discrepancy/Shortage No.' },
  { key: 'merStatus', labelFa: 'وضعیت کسری/مغایرت', labelEn: 'Discrepancy/Shortage Status' },
  { key: 'merDescription', labelFa: 'توضیحات کسری/مغایرت', labelEn: 'Shortage/Discrepancy Notes' },
  { key: 'notes', labelFa: 'توضیحات تجهیز', labelEn: 'Equipment Notes' },
  { key: 'materialBalanceNo', labelFa: 'شماره بالانس متریال', labelEn: 'Material Balance No.' },
  { key: 'balanceStatus', labelFa: 'وضعیت بالانس متریال', labelEn: 'Material Balance Status' },
  { key: 'storageLocation', labelFa: 'محل نگهداری', labelEn: 'Storage Location' },
  { key: 'gcvReceiptNo', labelFa: 'شماره رسید مصرف', labelEn: 'Consumption Receipt No.' },
  { key: 'receiver', labelFa: 'تحویل گیرنده', labelEn: 'Receiver' },
  { key: 'gcvDeliveredQty', labelFa: 'تعداد رسید مصرف', labelEn: 'Consumption Receipt Qty', isNumeric: true },
  { key: 'mivContractorNo', labelFa: 'شماره حواله', labelEn: 'MIV Issue No.' },
  { key: 'mivContractorDate', labelFa: 'تاریخ حواله', labelEn: 'MIV Issue Date', isDate: true },
  { key: 'mivContractorQty', labelFa: 'مجموع تعداد تحویل شده با حواله', labelEn: 'Total MIV Issued Qty', isNumeric: true },
  { key: 'mivReceiver', labelFa: 'تحویل گیرنده (حواله)', labelEn: 'MIV Receiver' },
  { key: 'smrContractorNo', labelFa: 'شماره برگشتی به انبار پیمانکار', labelEn: 'Return to Contractor WH No.' },
  { key: 'smrContractorDate', labelFa: 'تاریخ برگشتی (پیمانکار)', labelEn: 'Contractor Return Date', isDate: true },
  { key: 'smrContractorQty', labelFa: 'مجموع تعداد برگشتی (پیمانکار)', labelEn: 'Total Contractor Returned Qty', isNumeric: true },
  { key: 'smrContractorNote', labelFa: 'توضیحات برگشتی (پیمانکار)', labelEn: 'Contractor Return Note' },
  { key: 'smrMapnaNo', labelFa: 'شماره برگشتی به انبار کارفرما', labelEn: 'Return to Employer WH No.' },
  { key: 'smrMapnaDate', labelFa: 'تاریخ برگشتی (کارفرما)', labelEn: 'Employer Return Date', isDate: true },
  { key: 'smrMapnaQty', labelFa: 'مجموع تعداد برگشتی (کارفرما)', labelEn: 'Total Employer Returned Qty', isNumeric: true },
  { key: 'smrMapnaNote', labelFa: 'توضیحات برگشتی (کارفرما)', labelEn: 'Employer Return Note' },
  { key: 'smrDeliverer', labelFa: 'تحویل آورنده', labelEn: 'Returned By' },
  { key: 'stocktakeStatus', labelFa: 'وضعیت انبارگردانی', labelEn: 'Stocktake Status' },
  { key: 'stocktakeDate', labelFa: 'تاریخ آخرین انبارگردانی', labelEn: 'Last Stocktake Date', isDate: true },
];

export const TRANSIT_IMPORT_COLUMNS: ImportColumnDef[] = [
  { key: 'arrivalDate', labelFa: 'تاریخ ورود', labelEn: 'Arrival Date', isDate: true },
  { key: 'overallStatus', labelFa: 'وضعیت کلی', labelEn: 'Overall Status' },
  { key: 'inspectionRequest', labelFa: 'درخواست بازرسی', labelEn: 'Inspection Request' },
  { key: 'releaseNetNo', labelFa: 'شماره رلیزنت', labelEn: 'Release Net No.' },
  { key: 'releaseNetDate', labelFa: 'تاریخ رلیزنت', labelEn: 'Release Net Date', isDate: true },
  { key: 'mapnaShippingNotice', labelFa: 'اعلام حمل به مپنا', labelEn: 'MAPNA Shipping Notice' },
  { key: 'interimNo', labelFa: 'شماره علی الحساب', labelEn: 'Interim No.' },
  { key: 'interimDate', labelFa: 'تاریخ علی الحساب', labelEn: 'Interim Date', isDate: true },
  { key: 'supplier', labelFa: 'تامین کننده', labelEn: 'Supplier' },
  { key: 'dispatchLocation', labelFa: 'محل ارسال', labelEn: 'Dispatch Location' },
  { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.', required: true },
  { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
  { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description' },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System' },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System' },
  { key: 'unit', labelFa: 'واحد', labelEn: 'Unit' },
  { key: 'equipmentSupplyCode', labelFa: 'کد تامین تجهیزات', labelEn: 'Equipment Supply Code' },
  { key: 'carrierContractor', labelFa: 'پیمانکار حمل', labelEn: 'Carrier Contractor' },
  { key: 'billOfLadingNo', labelFa: 'شماره بارنامه', labelEn: 'Waybill No.' },
  { key: 'amount', labelFa: 'مبلغ (ریال)', labelEn: 'Amount (IRR)', isNumeric: true },
];

export function getImportColumnsForScope(scope: ImportScope): ImportColumnDef[] {
  if (scope === 'general') return GENERAL_IMPORT_COLUMNS;
  if (scope === 'detailed') return DETAILED_IMPORT_COLUMNS;
  return TRANSIT_IMPORT_COLUMNS;
}

export function makeId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * RFC-4180 CSV parser supporting UTF-8 BOM, multiline quoted cells, and escaped quotes.
 */
export function parseCsvMatrix(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

function cleanStr(val: string | undefined): string {
  const raw = val || '';
  if (!raw.trim()) return '';
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^\S\r\n]+/g, ' ')
        .trim()
        .replace(/(^|[^\d.])(\d{2,4})\.(\d{1,2})\.(\d{1,2})(?!\d|\.)/g, (_m, prefix: string, p1: string, p2: string, p3: string) => {
          const pad2 = (n: string) => (n.length === 1 ? `0${n}` : n);
          return `${prefix}${p1}/${pad2(p2)}/${pad2(p3)}`;
        }),
    )
    .filter((l) => l !== '' && l !== '-' && l !== '—');
  return lines.join('\n');
}

function parseNum(val: string | undefined): number | null {
  const raw = normalizeDigits((val || '').trim())
    .replace(/,/g, '')
    .replace(/،/g, '')
    .replace(/٬/g, '')
    .trim();
  if (!raw || raw === '-' || raw === '—') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeaderText(h: string): string {
  return (h || '').replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
}

function normalizeItemCategory(raw: string | undefined): DetailedEntry['itemCategory'] {
  const s = normalizeHeaderText(raw || '').toLowerCase();
  if (!s) return '';
  if (s.includes('شیمی') || s.includes('chemical')) return 'chemicals';
  if (s.includes('ابزار') || s.includes('tool')) return 'special_tools';
  if (s.includes('یدک') || s.includes('spare')) return 'spare_parts';
  return '';
}

export function detectCsvScope(matrix: string[][]): ImportScope | null {
  const previewText = matrix
    .slice(0, 8)
    .map((r) => r.join(' '))
    .join(' ')
    .toLowerCase();
  if (
    previewText.includes('شماره صورتجلسه ورود') ||
    previewText.includes('وزن پکینگ') ||
    previewText.includes('مبلغ کرایه حمل') ||
    previewText.includes('employer entry minutes') ||
    previewText.includes('weighbridge')
  ) {
    return 'general';
  }
  if (
    previewText.includes('مقدار پکینگ') ||
    previewText.includes('شماره بالانس متریال') ||
    previewText.includes('شماره رسید') ||
    previewText.includes('شرح کلی') ||
    previewText.includes('packing qty') ||
    previewText.includes('item code')
  ) {
    return 'detailed';
  }
  if (
    previewText.includes('در دست حمل') ||
    previewText.includes('در دست ارسال') ||
    previewText.includes('رلیزنت') ||
    previewText.includes('علی الحساب') ||
    previewText.includes('overall status')
  ) {
    return 'transit';
  }
  return null;
}

function findDataStartAndHeaders(
  matrix: string[][],
  scope: ImportScope,
): { headerMap: Record<string, number>; combinedCols: string[]; dataStartIndex: number } {
  const headerRows = matrix.slice(0, Math.min(6, matrix.length));
  const combinedCols: string[] = [];
  const maxCols = Math.max(...headerRows.map((r) => r.length), 0);

  let dataStartIndex = -1;
  for (let r = 0; r < Math.min(10, matrix.length); r += 1) {
    const first = normalizeDigits(cleanStr(matrix[r][0]));
    const second = normalizeDigits(cleanStr(matrix[r][1]));
    if (
      (scope === 'general' || scope === 'detailed') &&
      /^\d+$/.test(first) &&
      (/\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/.test(second) || r >= 3)
    ) {
      const rowJoined = matrix[r].slice(0, 5).map((x) => normalizeDigits(x)).join(',');
      if (!rowJoined.startsWith('1,2,3,4')) {
        dataStartIndex = r;
        break;
      }
    }
    if (scope === 'transit' && /\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/.test(first)) {
      dataStartIndex = r;
      break;
    }
  }

  if (dataStartIndex <= 0) {
    const row0Text = (matrix[0] || []).join(' ').toLowerCase();
    const looksLikeHeader =
      row0Text.includes('پکینگ') ||
      row0Text.includes('packing') ||
      row0Text.includes('شرح') ||
      row0Text.includes('description') ||
      row0Text.includes('تاریخ') ||
      row0Text.includes('date') ||
      row0Text.includes('supplier') ||
      row0Text.includes('تامین') ||
      row0Text.includes('تأمین') ||
      row0Text.includes('محموله') ||
      row0Text.includes('آیتم') ||
      row0Text.includes('item');
    dataStartIndex = looksLikeHeader ? 1 : Math.min(4, Math.max(1, matrix.length - 1));
  }

  const headerSlice = matrix.slice(0, dataStartIndex);
  for (let c = 0; c < maxCols; c += 1) {
    const parts = headerSlice
      .map((r) => normalizeHeaderText(r[c] || ''))
      .filter((txt) => txt && !/^\d+$/.test(txt));
    combinedCols[c] = parts.join(' | ');
  }

  const headerMap: Record<string, number> = {};
  for (let c = 0; c < combinedCols.length; c += 1) {
    const h = combinedCols[c];
    if (h) headerMap[h] = c;
  }

  return { headerMap, combinedCols, dataStartIndex };
}

interface FindColOptions {
  fallbackIndex?: number;
  excludeSubstrings?: string[];
}

/**
 * Resolves column index cleanly using exact-segment matching BEFORE substring matching,
 * and enforces excludeSubstrings (e.g., "شرح" never accidentally matches "شرح کلی").
 */
function findCol(
  combinedCols: string[],
  candidates: string[],
  optionsOrFallback?: number | FindColOptions,
): number {
  const opts: FindColOptions =
    typeof optionsOrFallback === 'number'
      ? { fallbackIndex: optionsOrFallback }
      : optionsOrFallback || {};
  const excludes = (opts.excludeSubstrings || []).map((e) => normalizeHeaderText(e).toLowerCase());

  const isExcluded = (header: string): boolean => {
    if (excludes.length === 0) return false;
    const hLow = header.toLowerCase();
    return excludes.some((ex) => hLow.includes(ex));
  };

  // Pass 1: exact segment match (separated by ' | ') or exact full header match
  for (const cand of candidates) {
    const cNorm = normalizeHeaderText(cand).toLowerCase();
    if (!cNorm) continue;
    const exactIdx = combinedCols.findIndex((h) => {
      if (!h || isExcluded(h)) return false;
      const hNorm = normalizeHeaderText(h).toLowerCase();
      if (hNorm === cNorm) return true;
      const segs = hNorm.split('|').map((s) => s.trim());
      return segs.includes(cNorm);
    });
    if (exactIdx !== -1) return exactIdx;
  }

  // Pass 2: substring match respecting exclusions
  for (const cand of candidates) {
    const cNorm = normalizeHeaderText(cand).toLowerCase();
    if (!cNorm) continue;
    const subIdx = combinedCols.findIndex((h) => {
      if (!h || isExcluded(h)) return false;
      return normalizeHeaderText(h).toLowerCase().includes(cNorm);
    });
    if (subIdx !== -1) return subIdx;
  }

  return opts.fallbackIndex !== undefined ? opts.fallbackIndex : -1;
}

function resolveIdx(
  explicitMapping: Record<string, number> | undefined,
  key: string,
  autoIdx: number,
): number {
  if (explicitMapping && Object.prototype.hasOwnProperty.call(explicitMapping, key)) {
    const val = explicitMapping[key];
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 ? val : -1;
  }
  return autoIdx;
}

function getAutoGeneralMapping(combinedCols: string[]): Record<string, number> {
  const defs: Array<{
    key: string;
    candidates: string[];
    fallback: number;
    excludeSubstrings?: string[];
  }> = [
    { key: 'rowNo', candidates: ['ردیف', 'row no', 'row'], fallback: 0 },
    { key: 'arrivalDate', candidates: ['تاریخ ورود', 'arrival date'], fallback: 1 },
    { key: 'releaseNo', candidates: ['شماره رلیز', 'release note', 'release no'], fallback: 2 },
    {
      key: 'releaseDate',
      candidates: ['تاریخ release', 'تاریخ رلیز', 'release date', 'تاریخ'],
      fallback: 3,
      excludeSubstrings: ['ورود', 'دعوتنامه', 'opi'],
    },
    { key: 'supplier', candidates: ['تامین کننده', 'تأمین کننده', 'supplier'], fallback: 4 },
    { key: 'dispatchLocation', candidates: ['محل ارسال', 'dispatch location'], fallback: 5 },
    { key: 'employerEntryMinutesNo', candidates: ['صورتجلسه ورود کارفرما', 'صورتجلسه کارفرما', 'کارفرما', 'employer'], fallback: 6 },
    {
      key: 'mapnaEntryMinutesNo',
      candidates: ['صورتجلسه ورود کالا', 'صورتجلسه ورود', 'صورتجلسه مپنا', 'مپنا', 'mapna'],
      fallback: 7,
      excludeSubstrings: ['کارفرما', 'employer', 'تاریخ', 'date'],
    },
    { key: 'packingListNo', candidates: ['شماره پکینگ لیست', 'پکینگ لیست', 'packing list'], fallback: 8 },
    { key: 'packageNo', candidates: ['شماره نگله', 'package no'], fallback: 9 },
    { key: 'packageType', candidates: ['نوع بسته بندی', 'نوع بسته‌بندی', 'package type'], fallback: -1 },
    { key: 'itemCount', candidates: ['تعداد اقلام نگله', 'تعداد اقلام', 'item count'], fallback: -1 },
    { key: 'itemDescription', candidates: ['شرح کالا', 'item description', 'شرح'], fallback: 10 },
    { key: 'island', candidates: ['جزیره', 'island'], fallback: 11 },
    { key: 'system', candidates: ['سیستم', 'system'], fallback: 12, excludeSubstrings: ['ساب', 'sub'] },
    { key: 'subSystem', candidates: ['ساب سیستم', 'sub-system', 'subsystem'], fallback: 13 },
    { key: 'unit', candidates: ['واحد', 'unit'], fallback: 14, excludeSubstrings: ['شمارش', 'counting'] },
    { key: 'grossWeight', candidates: ['ناخالص', 'gross weight'], fallback: 15 },
    { key: 'netWeight', candidates: ['خالص', 'net weight'], fallback: 16, excludeSubstrings: ['ناخالص', 'gross'] },
    { key: 'lengthCm', candidates: ['طول', 'length'], fallback: 17 },
    { key: 'widthCm', candidates: ['عرض', 'width'], fallback: 18 },
    { key: 'heightCm', candidates: ['ارتفاع', 'height'], fallback: 19 },
    { key: 'billOfLadingNo', candidates: ['شماره بارنامه', 'بارنامه', 'waybill'], fallback: 20 },
    { key: 'vehicleNo', candidates: ['شماره خودرو', 'پلاک', 'vehicle'], fallback: 21 },
    { key: 'weighbridgeWeight', candidates: ['وزن باسکول', 'weighbridge'], fallback: 22 },
    { key: 'freightCost', candidates: ['مبلغ کرایه حمل', 'کرایه حمل', 'freight'], fallback: 23 },
    { key: 'opiInvitationNo', candidates: ['شماره دعوتنامه opi', 'opi invitation no'], fallback: 24 },
    { key: 'opiInvitationDate', candidates: ['تاریخ دعوتنامه opi', 'opi invitation date'], fallback: 25 },
    { key: 'driverName', candidates: ['نام راننده', 'راننده', 'driver'], fallback: 26 },
  ];

  const mapped: Record<string, number> = {};
  const claimed = new Set<number>();
  for (const d of defs) {
    const idx = findCol(combinedCols, d.candidates, {
      fallbackIndex: -1,
      excludeSubstrings: d.excludeSubstrings,
    });
    mapped[d.key] = idx;
    if (idx >= 0) claimed.add(idx);
  }

  // Only fall back to legacy fixed column positions on full-width (>=20 col) spreadsheets and never steal a matched header
  const allowPositionalFallback = combinedCols.length >= 20;
  if (allowPositionalFallback) {
    for (const d of defs) {
      if (mapped[d.key] === -1 && d.fallback >= 0 && d.fallback < combinedCols.length && !claimed.has(d.fallback)) {
        mapped[d.key] = d.fallback;
      }
    }
  }
  return mapped;
}

function getAutoDetailedMapping(combinedCols: string[]): Record<string, number> {
  const hasRahkaran = combinedCols.some((h) => h.includes('کد راهکاران'));
  const offset = hasRahkaran ? 0 : -1;

  const defs: Array<{
    key: string;
    candidates?: string[];
    fallback: number;
    excludeSubstrings?: string[];
  }> = [
    { key: 'rowNo', candidates: ['ردیف', 'row no'], fallback: 0 },
    { key: 'arrivalDate', candidates: ['تاریخ ورود', 'arrival date'], fallback: 1 },
    { key: 'supplier', candidates: ['تامین کننده', 'تأمین کننده', 'supplier'], fallback: 2 },
    { key: 'origin', candidates: ['مبدا', 'مبدأ', 'origin'], fallback: 3 },
    { key: 'shipmentNo', candidates: ['شماره محموله', 'شماره پکینگ لیست', 'shipment no', 'packing list'], fallback: 4 },
    { key: 'packageNo', candidates: ['شماره نگله', 'package no'], fallback: 5 },
    { key: 'itemNo', candidates: ['شماره آیتم', 'item no'], fallback: 6 },
    { key: 'generalDescription', candidates: ['شرح کلی', 'general description'], fallback: 7 },
    {
      key: 'description',
      candidates: ['شرح کالا', 'شرح', 'description'],
      fallback: 8,
      excludeSubstrings: ['شرح کلی', 'general description', 'توضیحات'],
    },
    { key: 'size', candidates: ['اندازه', 'سایز', 'size'], fallback: 9 },
    { key: 'itemCode', candidates: ['کد کالا', 'item code'], fallback: 10 },
    { key: 'itemCategory', candidates: ['دسته بندی تخصصی', 'نوع قلم', 'item classification', 'item category'], fallback: -1 },
    { key: 'chemicalType', candidates: ['نوع ماده شیمیایی', 'ماده شیمیایی', 'chemical type'], fallback: -1 },
    {
      key: 'productionDate',
      candidates: ['تاریخ تولید', 'production date', 'mfg date'],
      fallback: -1,
      excludeSubstrings: ['انبارگردانی', 'انبار گردانی', 'stocktake', 'ورود', 'arrival', 'انقضا', 'exp', 'دعوتنامه', 'opi', 'حواله', 'miv', 'برگشت', 'smr'],
    },
    {
      key: 'expirationDate',
      candidates: ['تاریخ انقضا', 'تاریخ انقضاء', 'expiration date', 'expiry date'],
      fallback: -1,
      excludeSubstrings: ['انبارگردانی', 'انبار گردانی', 'stocktake', 'ورود', 'arrival', 'تولید', 'production', 'mfg'],
    },
    { key: 'packingQty', candidates: ['مقدار پکینگ', 'packing qty'], fallback: 12 + offset },
    { key: 'actualQty', candidates: ['مقدار واقعی', 'actual qty'], fallback: 13 + offset },
    { key: 'shortage', candidates: ['کسری', 'مقدار کسری', 'shortage'], fallback: -1, excludeSubstrings: ['شماره', 'وضعیت', 'توضیحات', 'mer'] },
    { key: 'surplus', candidates: ['اضافی', 'مقدار اضافی', 'surplus'], fallback: -1 },
    { key: 'damagedQty', candidates: ['آسیب دیده', 'damaged qty'], fallback: -1 },
    { key: 'mtoRef', candidates: ['mto'], fallback: -1 },
    { key: 'repNo', candidates: ['شماره جایگزینی', 'شماره rep', 'rep no', 'substitution no'], fallback: 16 + offset },
    { key: 'repStatus', candidates: ['وضعیت جایگزینی', 'وضعیت rep', 'rep status', 'substitution status'], fallback: 17 + offset },
    { key: 'repReprocured', candidates: ['تامین مجدد جایگزین شده', 'تأمین مجدد جایگزین شده', 'reprocured'], fallback: -1 },
    { key: 'repDescription', candidates: ['توضیحات جایگزینی', 'توضیحات rep', 'rep description', 'substitution description'], fallback: 18 + offset },
    { key: 'countingUnit', candidates: ['واحد شمارش', 'counting unit'], fallback: 19 + offset },
    { key: 'island', candidates: ['جزیره', 'island'], fallback: 20 + offset },
    { key: 'system', candidates: ['سیستم', 'system'], fallback: 21 + offset, excludeSubstrings: ['ساب', 'sub'] },
    { key: 'subSystem', candidates: ['ساب سیستم', 'sub-system', 'subsystem'], fallback: 22 + offset },
    { key: 'unit', candidates: ['واحد', 'unit'], fallback: 23 + offset, excludeSubstrings: ['شمارش', 'counting'] },
    { key: 'opiNo', candidates: ['شماره دعوتنامه', 'شماره opi', 'opi no', 'invitation no'], fallback: 24 + offset },
    { key: 'opiDate', candidates: ['تاریخ دعوتنامه', 'تاریخ opi', 'opi date', 'invitation date'], fallback: 25 + offset },
    { key: 'merNo', candidates: ['شماره کسری/مغایرت', 'شماره mer', 'mer no', 'discrepancy'], fallback: 26 + offset },
    { key: 'merStatus', candidates: ['وضعیت کسری/مغایرت', 'وضعیت mer', 'mer status'], fallback: 27 + offset },
    {
      key: 'merDescription',
      candidates: ['توضیحات کسری/مغایرت', 'توضیحات کسری', 'توضیحات مغایرت', 'توضیحات mer', 'mer description', 'shortage notes', 'discrepancy notes'],
      fallback: -1,
    },
    {
      key: 'notes',
      candidates: ['توضیحات تجهیز', 'توضیحات', 'equipment notes', 'notes'],
      fallback: 28 + offset,
      excludeSubstrings: ['rep', 'جایگزینی', 'smr', 'برگشتی', 'کسری', 'مغایرت', 'mer'],
    },
    { key: 'balanceStatus', candidates: ['وضعیت بالانس', 'وضعیت موازنه', 'وضعیت کنترل مصرف', 'balance status', 'bmr status'], fallback: 29 + offset },
    { key: 'storageLocation', candidates: ['محل نگهداری', 'storage location'], fallback: 30 + offset },
    { key: 'gcvReceiptNo', candidates: ['شماره رسید مصرف', 'شماره رسید', 'gcv', 'receipt no'], fallback: 31 + offset },
    { key: 'receiver', candidates: ['تحویل گیرنده', 'receiver'], fallback: 32 + offset, excludeSubstrings: ['حواله', 'miv'] },
    { key: 'gcvDeliveredQty', candidates: ['تعداد رسید مصرف', 'مقدار تحویل شده gcv', 'مقدار تحویل شده', 'gcv delivered'], fallback: 33 + offset },
    {
      key: 'mivContractorNo',
      candidates: ['شماره حواله انبار پیمانکار', 'شماره حواله پیمانکار', 'شماره حواله', 'شماره miv پیمانکار', 'miv پیمانکار', 'شماره miv'],
      fallback: 35 + offset,
      excludeSubstrings: ['مپنا', 'mapna', 'کارفرما', 'employer'],
    },
    {
      key: 'mivContractorDate',
      candidates: ['تاریخ حواله انبار پیمانکار', 'تاریخ حواله پیمانکار', 'تاریخ حواله', 'تاریخ miv پیمانکار', 'تاریخ miv'],
      fallback: 36 + offset,
      excludeSubstrings: ['مپنا', 'mapna', 'کارفرما', 'employer'],
    },
    {
      key: 'mivContractorQty',
      candidates: ['مقدار حواله انبار پیمانکار', 'تعداد حواله انبار پیمانکار', 'مجموع تعداد تحویل شده با حواله', 'مقدار miv پیمانکار', 'مقدار miv'],
      fallback: 37 + offset,
      excludeSubstrings: ['مپنا', 'mapna', 'کارفرما', 'employer'],
    },
    { key: 'mivReceiver', candidates: ['تحویل گیرنده (حواله)', 'تحویل گیرنده حواله', 'miv receiver'], fallback: -1 },
    { key: 'smrContractorNo', candidates: ['شماره برگشتی به انبار پیمانکار', 'شماره smr پیمانکار'], fallback: 39 + offset },
    { key: 'smrContractorDate', candidates: ['تاریخ برگشتی به انبار پیمانکار', 'تاریخ smr پیمانکار', 'تاریخ برگشتی'], fallback: 40 + offset, excludeSubstrings: ['مپنا', 'mapna', 'کارفرما', 'employer'] },
    { key: 'smrContractorQty', candidates: ['مقدار برگشتی به انبار پیمانکار', 'تعداد برگشتی به انبار پیمانکار', 'مقدار smr پیمانکار', 'مجموع تعداد برگشتی'], fallback: 41 + offset, excludeSubstrings: ['مپنا', 'mapna', 'کارفرما', 'employer'] },
    { key: 'smrContractorNote', candidates: ['توضیحات برگشتی به انبار پیمانکار', 'توضیحات smr پیمانکار'], fallback: 42 + offset },
    { key: 'materialBalanceNo', candidates: ['شماره بالانس متریال', 'شماره بالانس', 'شماره موازنه', 'موازنه مواد', 'گزارش موازنه', 'شماره گزارش موازنه', 'material balance no', 'bmr no'], fallback: 43 + offset },
    { key: 'smrMapnaNo', candidates: ['شماره برگشتی به انبار کارفرما', 'شماره smr مپنا'], fallback: 44 + offset },
    { key: 'smrMapnaDate', candidates: ['تاریخ برگشتی به انبار کارفرما', 'تاریخ smr مپنا'], fallback: 45 + offset },
    { key: 'smrMapnaQty', candidates: ['مقدار برگشتی به انبار کارفرما', 'تعداد برگشتی به انبار کارفرما', 'مقدار smr مپنا'], fallback: 46 + offset },
    { key: 'smrMapnaNote', candidates: ['توضیحات برگشتی به انبار کارفرما', 'توضیحات smr مپنا'], fallback: 47 + offset },
    { key: 'smrDeliverer', candidates: ['تحویل آورنده', 'returned by', 'smr deliverer'], fallback: -1 },
    { key: 'mivMapnaNo', candidates: ['شماره حواله انبار کارفرما', 'شماره حواله کارفرما', 'شماره miv مپنا', 'miv مپنا'], fallback: 48 + offset },
    { key: 'mivMapnaDate', candidates: ['تاریخ حواله انبار کارفرما', 'تاریخ حواله کارفرما', 'تاریخ miv مپنا'], fallback: 49 + offset },
    { key: 'mivMapnaQty', candidates: ['مقدار حواله انبار کارفرما', 'تعداد حواله انبار کارفرما', 'مقدار miv مپنا'], fallback: 50 + offset },
    { key: 'stocktakeStatus', candidates: ['وضعیت انبارگردانی', 'وضعیت انبار گردانی', 'stocktake status'], fallback: -1 },
    { key: 'stocktakeDate', candidates: ['تاریخ آخرین انبارگردانی', 'تاریخ انبارگردانی', 'تاریخ انبار گردانی', 'last stocktake date', 'stocktake date'], fallback: -1 },
    {
      key: 'stocktakeInfo',
      candidates: ['انبار گردانی', 'انبارگردانی', 'stocktake'],
      fallback: 51 + offset,
      excludeSubstrings: ['وضعیت', 'status', 'تاریخ', 'date'],
    },
  ];

  const mapped: Record<string, number> = {};
  const claimed = new Set<number>();
  for (const d of defs) {
    const idx = d.candidates
      ? findCol(combinedCols, d.candidates, {
          fallbackIndex: -1,
          excludeSubstrings: d.excludeSubstrings,
        })
      : -1;
    mapped[d.key] = idx;
    if (idx >= 0) claimed.add(idx);
  }

  // Only fall back to legacy fixed column positions on full-width (>=45 non-empty header cols) spreadsheets and never steal a matched header
  const nonEmptyHeaderCount = combinedCols.filter((h) => normalizeHeaderText(h) !== '').length;
  const allowPositionalFallback = nonEmptyHeaderCount >= 45;
  if (allowPositionalFallback) {
    for (const d of defs) {
      if (mapped[d.key] === -1 && d.fallback >= 0 && d.fallback < combinedCols.length && !claimed.has(d.fallback)) {
        mapped[d.key] = d.fallback;
        claimed.add(d.fallback);
      }
    }
  }
  return mapped;
}

function getAutoTransitMapping(combinedCols: string[]): Record<string, number> {
  return {
    arrivalDate: findCol(combinedCols, ['تاریخ ورود', 'arrival date'], 0),
    overallStatus: findCol(combinedCols, ['وضعیت کلی', 'overall status'], 1),
    inspectionRequest: findCol(combinedCols, ['درخواست بازرسی', 'inspection request'], 2),
    releaseNetNo: findCol(combinedCols, ['شماره رلیزنت', 'release net no'], 3),
    releaseNetDate: findCol(combinedCols, ['تاریخ رلیزنت', 'release net date'], 4),
    mapnaShippingNotice: findCol(combinedCols, ['اعلام حمل به مپنا', 'shipping notice'], 5),
    interimNo: findCol(combinedCols, ['شماره علی الحساب', 'interim no'], 6),
    interimDate: findCol(combinedCols, ['تاریخ علی الحساب', 'interim date'], 7),
    supplier: findCol(combinedCols, ['تامین کننده', 'تأمین کننده', 'supplier'], 8),
    dispatchLocation: findCol(combinedCols, ['محل ارسال', 'dispatch location'], 9),
    packingListNo: findCol(combinedCols, ['شماره پکینگ لیست', 'packing list'], 10),
    packageNo: findCol(combinedCols, ['شماره نگله', 'package no'], 11),
    itemDescription: findCol(combinedCols, ['شرح کالا', 'item description'], 12),
    system: findCol(combinedCols, ['سیستم', 'system'], { fallbackIndex: 13, excludeSubstrings: ['ساب', 'sub'] }),
    subSystem: findCol(combinedCols, ['ساب سیستم', 'sub-system'], 14),
    unit: findCol(combinedCols, ['واحد', 'unit'], 15),
    equipmentSupplyCode: findCol(combinedCols, ['کد تامین تجهیزات', 'supply code'], 16),
    carrierContractor: findCol(combinedCols, ['پیمانکار حمل', 'carrier contractor'], 17),
    billOfLadingNo: findCol(combinedCols, ['شماره بارنامه', 'waybill'], 18),
    amount: findCol(combinedCols, ['مبلغ', 'amount'], 19),
  };
}

export interface InspectedMatrixColumns {
  scope: ImportScope;
  dataStartIndex: number;
  fileColumns: { index: number; header: string; samples: string[] }[];
  targetFields: ImportColumnDef[];
  mapping: Record<string, number>;
}

export function inspectMatrixColumns(
  matrix: string[][],
  explicitScope?: ImportScope,
): InspectedMatrixColumns {
  const scope = explicitScope || detectCsvScope(matrix) || 'general';
  const { combinedCols, dataStartIndex } = findDataStartAndHeaders(matrix, scope);
  const maxCols = Math.max(
    combinedCols.length,
    ...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length),
    0,
  );
  const paddedCols: string[] = [];
  for (let c = 0; c < maxCols; c += 1) {
    paddedCols[c] = combinedCols[c] || '';
  }

  const autoMap =
    scope === 'general'
      ? getAutoGeneralMapping(paddedCols)
      : scope === 'detailed'
        ? getAutoDetailedMapping(paddedCols)
        : getAutoTransitMapping(paddedCols);

  const sanitizedMap: Record<string, number> = {};
  for (const [k, idx] of Object.entries(autoMap)) {
    sanitizedMap[k] = idx >= 0 && idx < maxCols ? idx : -1;
  }

  const fileColumns = Array.from({ length: maxCols }, (_, c) => {
    const samples: string[] = [];
    for (let r = dataStartIndex; r < Math.min(matrix.length, dataStartIndex + 3); r += 1) {
      const val = cleanStr(matrix[r]?.[c]);
      if (val) samples.push(val);
    }
    return {
      index: c,
      header: paddedCols[c] || `ستون ${c + 1}`,
      samples,
    };
  });

  return {
    scope,
    dataStartIndex,
    fileColumns,
    targetFields: getImportColumnsForScope(scope),
    mapping: sanitizedMap,
  };
}

export function parseGeneralCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
  explicitMapping?: Record<string, number>,
): { rows: Omit<GeneralEntry, 'id'>[]; skippedEmpty: number; rejectedRows: ImportRejectedRecord[] } {
  const { dataStartIndex, combinedCols } = findDataStartAndHeaders(matrix, 'general');
  const maxCols = Math.max(...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length), 28);
  const paddedCols = [...combinedCols];
  while (paddedCols.length < maxCols) paddedCols.push('');
  const auto = getAutoGeneralMapping(paddedCols);
  const col = (k: string) => resolveIdx(explicitMapping, k, auto[k] ?? -1);

  const idxRowNo = col('rowNo');
  const idxArrivalDate = col('arrivalDate');
  const idxReleaseNo = col('releaseNo');
  const idxReleaseDate = col('releaseDate');
  const idxSupplier = col('supplier');
  const idxDispatch = col('dispatchLocation');
  const idxEmployerMin = col('employerEntryMinutesNo');
  const idxMapnaMin = col('mapnaEntryMinutesNo');
  const idxPackingList = col('packingListNo');
  const idxPackageNo = col('packageNo');
  const idxPackageType = col('packageType');
  const idxItemCount = col('itemCount');
  const idxDesc = col('itemDescription');
  const idxIsland = col('island');
  const idxSystem = col('system');
  const idxSubSystem = col('subSystem');
  const idxUnit = col('unit');
  const idxGross = col('grossWeight');
  const idxNet = col('netWeight');
  const idxLen = col('lengthCm');
  const idxWidth = col('widthCm');
  const idxHeight = col('heightCm');
  const idxWaybill = col('billOfLadingNo');
  const idxVehicle = col('vehicleNo');
  const idxWeighbridge = col('weighbridgeWeight');
  const idxFreight = col('freightCost');
  const idxOpiNo = col('opiInvitationNo');
  const idxOpiDate = col('opiInvitationDate');
  const idxDriver = col('driverName');

  const now = new Date().toISOString();
  const rows: Omit<GeneralEntry, 'id'>[] = [];
  const rejectedRows: ImportRejectedRecord[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAnyValue = line.some((cell) => cleanStr(cell) !== '');
    if (!hasAnyValue) {
      skippedEmpty += 1;
      continue;
    }

    const packingListNo = idxPackingList >= 0 ? cleanStr(line[idxPackingList]) : '';
    const itemDescription = idxDesc >= 0 ? cleanStr(line[idxDesc]) : '';
    const packageNo = idxPackageNo >= 0 ? cleanStr(line[idxPackageNo]) : '';
    const rawRowNo = idxRowNo >= 0 ? normalizeDigits(cleanStr(line[idxRowNo])) : '';

    const record: Omit<GeneralEntry, 'id'> = {
      rowNo: rawRowNo,
      arrivalDate: idxArrivalDate >= 0 ? parseFlexibleDateToIso(line[idxArrivalDate] || '', assumedCalendar) : '',
      releaseNo: idxReleaseNo >= 0 ? cleanStr(line[idxReleaseNo]) : '',
      releaseDate: idxReleaseDate >= 0 ? parseFlexibleDateToIso(line[idxReleaseDate] || '', assumedCalendar) : '',
      supplier: idxSupplier >= 0 ? cleanStr(line[idxSupplier]) : '',
      dispatchLocation: idxDispatch >= 0 ? cleanStr(line[idxDispatch]) : '',
      employerEntryMinutesNo: idxEmployerMin >= 0 ? cleanStr(line[idxEmployerMin]) : '',
      mapnaEntryMinutesNo: idxMapnaMin >= 0 ? cleanStr(line[idxMapnaMin]) : '',
      packingListNo,
      packageNo,
      packageType: idxPackageType >= 0 ? cleanStr(line[idxPackageType]) : '',
      itemCount: idxItemCount >= 0 ? parseNum(line[idxItemCount]) : null,
      itemDescription,
      island: idxIsland >= 0 ? cleanStr(line[idxIsland]) : '',
      system: idxSystem >= 0 ? cleanStr(line[idxSystem]) : '',
      subSystem: idxSubSystem >= 0 ? cleanStr(line[idxSubSystem]) : '',
      unit: idxUnit >= 0 ? cleanStr(line[idxUnit]) : '',
      grossWeight: idxGross >= 0 ? parseNum(line[idxGross]) : null,
      netWeight: idxNet >= 0 ? parseNum(line[idxNet]) : null,
      lengthCm: idxLen >= 0 ? parseNum(line[idxLen]) : null,
      widthCm: idxWidth >= 0 ? parseNum(line[idxWidth]) : null,
      heightCm: idxHeight >= 0 ? parseNum(line[idxHeight]) : null,
      billOfLadingNo: idxWaybill >= 0 ? cleanStr(line[idxWaybill]) : '',
      vehicleNo: idxVehicle >= 0 ? cleanStr(line[idxVehicle]) : '',
      weighbridgeWeight: idxWeighbridge >= 0 ? parseNum(line[idxWeighbridge]) : null,
      freightCost: idxFreight >= 0 ? parseNum(line[idxFreight]) : null,
      opiInvitationNo: idxOpiNo >= 0 ? cleanStr(line[idxOpiNo]) : '',
      opiInvitationDate: idxOpiDate >= 0 ? parseFlexibleDateToIso(line[idxOpiDate] || '', assumedCalendar) : '',
      driverName: idxDriver >= 0 ? cleanStr(line[idxDriver]) : '',
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (!packingListNo && !itemDescription && !packageNo) {
      rejectedRows.push({
        id: makeId(),
        scope: 'general',
        sourceRowIndex: r + 1,
        reasonCode: 'missing_required',
        reasonFa: 'ردیف دارای مقادیر متنی/عددی در فایل است اما فیلدهای کلیدی (شماره پکینگ لیست، شماره نگله یا شرح کالا) خالی است یا ستون اشتباه نگاشت شده.',
        reasonEn: 'Row contains non-empty cells but key identifiers (Packing List No., Package No., and Item Description) are all empty or mis-mapped.',
        canForceReplace: false,
        canForceAdd: true,
        canEditAndRetry: true,
        rawRow: line.map((c) => cleanStr(c)).filter(Boolean).slice(0, 8),
        parsedRow: record as unknown as Record<string, unknown>,
      });
      continue;
    }

    rows.push(record);
  }

  return { rows, skippedEmpty, rejectedRows };
}

export function parseDetailedCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
  explicitMapping?: Record<string, number>,
): { rows: Omit<DetailedEntry, 'id'>[]; skippedEmpty: number; rejectedRows: ImportRejectedRecord[] } {
  const { dataStartIndex, combinedCols } = findDataStartAndHeaders(matrix, 'detailed');
  const maxCols = Math.max(...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length), 52);
  const paddedCols = [...combinedCols];
  while (paddedCols.length < maxCols) paddedCols.push('');
  const auto = getAutoDetailedMapping(paddedCols);
  const col = (k: string) => resolveIdx(explicitMapping, k, auto[k] ?? -1);

  const idxRowNo = col('rowNo');
  const idxArrivalDate = col('arrivalDate');
  const idxSupplier = col('supplier');
  const idxOrigin = col('origin');
  const idxShipmentNo = col('shipmentNo');
  const idxPackageNo = col('packageNo');
  const idxItemNo = col('itemNo');
  const idxGenDesc = col('generalDescription');
  const idxDesc = col('description');
  const idxSize = col('size');
  const idxItemCode = col('itemCode');
  const idxItemCategory = col('itemCategory');
  const idxChemicalType = col('chemicalType');
  const idxProductionDate = col('productionDate');
  const idxExpirationDate = col('expirationDate');
  const idxPackingQty = col('packingQty');
  const idxActualQty = col('actualQty');
  const idxShortage = col('shortage');
  const idxSurplus = col('surplus');
  const idxDamagedQty = col('damagedQty');
  const idxMto = col('mtoRef');
  const idxRepNo = col('repNo');
  const idxRepStatus = col('repStatus');
  const idxRepReprocured = col('repReprocured');
  const idxRepDesc = col('repDescription');
  const idxCountingUnit = col('countingUnit');
  const idxIsland = col('island');
  const idxSystem = col('system');
  const idxSubSystem = col('subSystem');
  const idxUnit = col('unit');
  const idxOpiNo = col('opiNo');
  const idxOpiDate = col('opiDate');
  const idxMerNo = col('merNo');
  const idxMerStatus = col('merStatus');
  const idxMerDesc = col('merDescription');
  const idxNotes = col('notes');
  const idxBalanceStatus = col('balanceStatus');
  const idxStorageLoc = col('storageLocation');
  const idxGcvNo = col('gcvReceiptNo');
  const idxReceiver = col('receiver');
  const idxGcvQty = col('gcvDeliveredQty');
  const idxMivConNo = col('mivContractorNo');
  const idxMivConDate = col('mivContractorDate');
  const idxMivConQty = col('mivContractorQty');
  const idxMivReceiver = col('mivReceiver');
  const idxSmrConNo = col('smrContractorNo');
  const idxSmrConDate = col('smrContractorDate');
  const idxSmrConQty = col('smrContractorQty');
  const idxSmrConNote = col('smrContractorNote');
  const idxBalNo = col('materialBalanceNo');
  const idxSmrMapNo = col('smrMapnaNo');
  const idxSmrMapDate = col('smrMapnaDate');
  const idxSmrMapQty = col('smrMapnaQty');
  const idxSmrMapNote = col('smrMapnaNote');
  const idxSmrDeliverer = col('smrDeliverer');
  const idxMivMapNo = col('mivMapnaNo');
  const idxMivMapDate = col('mivMapnaDate');
  const idxMivMapQty = col('mivMapnaQty');
  const idxStocktakeStatus = col('stocktakeStatus');
  const idxStocktakeDate = col('stocktakeDate');
  const idxStocktake = col('stocktakeInfo');

  const now = new Date().toISOString();
  const rows: Omit<DetailedEntry, 'id'>[] = [];
  const rejectedRows: ImportRejectedRecord[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAnyValue = line.some((cell) => cleanStr(cell) !== '');
    if (!hasAnyValue) {
      skippedEmpty += 1;
      continue;
    }

    const shipmentNo = idxShipmentNo >= 0 ? cleanStr(line[idxShipmentNo]) : '';
    const description = idxDesc >= 0 ? cleanStr(line[idxDesc]) : '';
    const generalDescription = idxGenDesc >= 0 ? cleanStr(line[idxGenDesc]) : '';
    const notesVal = idxNotes >= 0 ? cleanStr(line[idxNotes]) : '';

    const rawChemicalType = idxChemicalType >= 0 ? cleanStr(line[idxChemicalType]) : '';
    const parsedCat = idxItemCategory >= 0 ? normalizeItemCategory(line[idxItemCategory]) : '';
    const inferred = !parsedCat
      ? inferItemClassification(description, notesVal, generalDescription)
      : { itemCategory: parsedCat, chemicalType: '' };
    const itemCategory = parsedCat || (rawChemicalType ? 'chemicals' : inferred.itemCategory);
    const chemicalType = rawChemicalType || (itemCategory === 'chemicals' ? inferred.chemicalType : '');

    const packingQtyVal = idxPackingQty >= 0 ? parseNum(line[idxPackingQty]) : null;
    const rawActualQtyVal = idxActualQty >= 0 ? parseNum(line[idxActualQty]) : null;
    const parsedShortageVal = idxShortage >= 0 ? parseNum(line[idxShortage]) : null;
    const parsedSurplusVal = idxSurplus >= 0 ? parseNum(line[idxSurplus]) : null;

    let actualQtyVal = rawActualQtyVal;
    if (actualQtyVal === null && packingQtyVal !== null) {
      if (parsedShortageVal !== null && parsedShortageVal > 0) {
        actualQtyVal = Math.max(0, packingQtyVal - parsedShortageVal);
      } else if (parsedSurplusVal !== null && parsedSurplusVal > 0) {
        actualQtyVal = packingQtyVal + parsedSurplusVal;
      }
    }

    let productionDateVal = idxProductionDate >= 0 ? parseFlexibleDateToIso(line[idxProductionDate] || '', assumedCalendar) : '';
    let expirationDateVal = idxExpirationDate >= 0 ? parseFlexibleDateToIso(line[idxExpirationDate] || '', assumedCalendar) : '';
    const stocktakeInfoVal = idxStocktake >= 0 ? cleanStr(line[idxStocktake]) : '';
    const stocktakeStatusVal = idxStocktakeStatus >= 0 ? cleanStr(line[idxStocktakeStatus]) : '';
    const stocktakeDateVal = idxStocktakeDate >= 0 ? parseFlexibleDateToIso(line[idxStocktakeDate] || '', assumedCalendar) : '';
    if (itemCategory === 'chemicals' && (!productionDateVal || !expirationDateVal)) {
      const extracted = extractChemicalDatesFromTexts(
        [notesVal, description, generalDescription],
        assumedCalendar,
      );
      if (!productionDateVal && extracted.productionDate) productionDateVal = extracted.productionDate;
      if (!expirationDateVal && extracted.expirationDate) expirationDateVal = extracted.expirationDate;
    }

    const record: Omit<DetailedEntry, 'id'> & { shortage?: number | null; surplus?: number | null } = {
      rowNo: idxRowNo >= 0 ? normalizeDigits(cleanStr(line[idxRowNo])) : '',
      arrivalDate: idxArrivalDate >= 0 ? parseFlexibleDateToIso(line[idxArrivalDate] || '', assumedCalendar) : '',
      supplier: idxSupplier >= 0 ? cleanStr(line[idxSupplier]) : '',
      origin: idxOrigin >= 0 ? cleanStr(line[idxOrigin]) : '',
      shipmentNo,
      packageNo: idxPackageNo >= 0 ? cleanStr(line[idxPackageNo]) : '',
      itemNo: idxItemNo >= 0 ? cleanStr(line[idxItemNo]) : '',
      generalDescription,
      description,
      size: idxSize >= 0 ? cleanStr(line[idxSize]) : '',
      itemCode: idxItemCode >= 0 ? cleanStr(line[idxItemCode]) : '',
      itemCategory,
      chemicalType,
      productionDate: productionDateVal,
      expirationDate: expirationDateVal,
      packingQty: packingQtyVal,
      actualQty: actualQtyVal,
      damagedQty: idxDamagedQty >= 0 ? parseNum(line[idxDamagedQty]) : null,
      mtoRef: idxMto >= 0 ? cleanStr(line[idxMto]) : '',
      repNo: idxRepNo >= 0 ? cleanStr(line[idxRepNo]) : '',
      repStatus: normalizeRepStatus(
        idxRepStatus >= 0 ? cleanStr(line[idxRepStatus]) : '',
        Boolean(idxRepNo >= 0 && cleanStr(line[idxRepNo])),
      ),
      repReprocured: idxRepReprocured >= 0 ? cleanStr(line[idxRepReprocured]) : '',
      repDescription: idxRepDesc >= 0 ? cleanStr(line[idxRepDesc]) : '',
      countingUnit: idxCountingUnit >= 0 ? normalizeCountingUnitToFa(cleanStr(line[idxCountingUnit])) : '',
      island: idxIsland >= 0 ? cleanStr(line[idxIsland]) : '',
      system: idxSystem >= 0 ? cleanStr(line[idxSystem]) : '',
      subSystem: idxSubSystem >= 0 ? cleanStr(line[idxSubSystem]) : '',
      unit: idxUnit >= 0 ? cleanStr(line[idxUnit]) : '',
      opiNo: idxOpiNo >= 0 ? cleanStr(line[idxOpiNo]) : '',
      opiDate: idxOpiDate >= 0 ? parseFlexibleDateToIso(line[idxOpiDate] || '', assumedCalendar) : '',
      merNo: idxMerNo >= 0 ? cleanStr(line[idxMerNo]) : '',
      merStatus: idxMerStatus >= 0 ? cleanStr(line[idxMerStatus]) : '',
      merDescription: idxMerDesc >= 0 ? cleanStr(line[idxMerDesc]) : '',
      notes: notesVal,
      materialBalanceNo: idxBalNo >= 0 ? cleanStr(line[idxBalNo]) : '',
      balanceStatus: idxBalanceStatus >= 0 ? cleanStr(line[idxBalanceStatus]) : '',
      storageLocation: idxStorageLoc >= 0 ? cleanStr(line[idxStorageLoc]) : '',
      gcvReceiptNo: idxGcvNo >= 0 ? cleanStr(line[idxGcvNo]) : '',
      receiver: idxReceiver >= 0 ? cleanStr(line[idxReceiver]) : '',
      gcvDeliveredQty: idxGcvQty >= 0 ? parseNum(line[idxGcvQty]) : null,
      mivContractorNo: idxMivConNo >= 0 ? cleanStr(line[idxMivConNo]) : '',
      mivContractorDate: idxMivConDate >= 0 ? parseFlexibleDateToIso(line[idxMivConDate] || '', assumedCalendar) : '',
      mivContractorQty: idxMivConQty >= 0 ? parseNum(line[idxMivConQty]) : null,
      mivReceiver: idxMivReceiver >= 0 ? cleanStr(line[idxMivReceiver]) : '',
      smrContractorNo: idxSmrConNo >= 0 ? cleanStr(line[idxSmrConNo]) : '',
      smrContractorDate: idxSmrConDate >= 0 ? parseFlexibleDateToIso(line[idxSmrConDate] || '', assumedCalendar) : '',
      smrContractorQty: idxSmrConQty >= 0 ? parseNum(line[idxSmrConQty]) : null,
      smrContractorNote: idxSmrConNote >= 0 ? cleanStr(line[idxSmrConNote]) : '',
      smrMapnaNo: idxSmrMapNo >= 0 ? cleanStr(line[idxSmrMapNo]) : '',
      smrMapnaDate: idxSmrMapDate >= 0 ? parseFlexibleDateToIso(line[idxSmrMapDate] || '', assumedCalendar) : '',
      smrMapnaQty: idxSmrMapQty >= 0 ? parseNum(line[idxSmrMapQty]) : null,
      smrMapnaNote: idxSmrMapNote >= 0 ? cleanStr(line[idxSmrMapNote]) : '',
      smrDeliverer: idxSmrDeliverer >= 0 ? cleanStr(line[idxSmrDeliverer]) : '',
      mivMapnaNo: idxMivMapNo >= 0 ? cleanStr(line[idxMivMapNo]) : '',
      mivMapnaDate: idxMivMapDate >= 0 ? parseFlexibleDateToIso(line[idxMivMapDate] || '', assumedCalendar) : '',
      mivMapnaQty: idxMivMapQty >= 0 ? parseNum(line[idxMivMapQty]) : null,
      stocktakeInfo: stocktakeInfoVal,
      ...(stocktakeStatusVal ? { stocktakeStatus: stocktakeStatusVal } : {}),
      ...(stocktakeDateVal ? { stocktakeDate: stocktakeDateVal } : {}),
      shortageBackfills: [],
      ...(idxShortage >= 0 && parsedShortageVal !== null ? { shortage: parsedShortageVal } : {}),
      ...(idxSurplus >= 0 && parsedSurplusVal !== null ? { surplus: parsedSurplusVal } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (!shipmentNo && !description && !generalDescription) {
      rejectedRows.push({
        id: makeId(),
        scope: 'detailed',
        sourceRowIndex: r + 1,
        reasonCode: 'missing_required',
        reasonFa: 'ردیف دارای داده است اما فیلدهای اصلی (شماره محموله/پکینگ، شرح یا شرح کلی) خالی هستند یا ستون اشتباه نگاشت شده‌اند.',
        reasonEn: 'Row contains data but key identifiers (Shipment No., Description, and General Description) are empty or mis-mapped.',
        canForceReplace: false,
        canForceAdd: true,
        canEditAndRetry: true,
        rawRow: line.map((c) => cleanStr(c)).filter(Boolean).slice(0, 8),
        parsedRow: record as unknown as Record<string, unknown>,
      });
      continue;
    }

    rows.push(record);
  }

  return { rows, skippedEmpty, rejectedRows };
}

export function parseTransitCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
  explicitMapping?: Record<string, number>,
): { rows: Omit<TransitEntry, 'id'>[]; skippedEmpty: number; rejectedRows: ImportRejectedRecord[] } {
  const { dataStartIndex, combinedCols } = findDataStartAndHeaders(matrix, 'transit');
  const maxCols = Math.max(...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length), 20);
  const paddedCols = [...combinedCols];
  while (paddedCols.length < maxCols) paddedCols.push('');
  const auto = getAutoTransitMapping(paddedCols);
  const col = (k: string) => resolveIdx(explicitMapping, k, auto[k] ?? -1);

  const idxArrivalDate = col('arrivalDate');
  const idxOverallStatus = col('overallStatus');
  const idxInspectionReq = col('inspectionRequest');
  const idxReleaseNetNo = col('releaseNetNo');
  const idxReleaseNetDate = col('releaseNetDate');
  const idxShippingNotice = col('mapnaShippingNotice');
  const idxInterimNo = col('interimNo');
  const idxInterimDate = col('interimDate');
  const idxSupplier = col('supplier');
  const idxDispatch = col('dispatchLocation');
  const idxPackingList = col('packingListNo');
  const idxPackageNo = col('packageNo');
  const idxItemDescription = col('itemDescription');
  const idxSystem = col('system');
  const idxSubSystem = col('subSystem');
  const idxUnit = col('unit');
  const idxSupplyCode = col('equipmentSupplyCode');
  const idxCarrier = col('carrierContractor');
  const idxWaybill = col('billOfLadingNo');
  const idxAmount = col('amount');

  const now = new Date().toISOString();
  const rows: Omit<TransitEntry, 'id'>[] = [];
  const rejectedRows: ImportRejectedRecord[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAnyValue = line.some((cell) => cleanStr(cell) !== '');
    if (!hasAnyValue) {
      skippedEmpty += 1;
      continue;
    }

    const packingListNo = idxPackingList >= 0 ? cleanStr(line[idxPackingList]) : '';
    const itemDescription = idxItemDescription >= 0 ? cleanStr(line[idxItemDescription]) : '';
    const rawOverallStatus = idxOverallStatus >= 0 ? cleanStr(line[idxOverallStatus]) : '';
    const overallStatus = rawOverallStatus ? normalizeTransitStatus(rawOverallStatus) : '';

    const record: Omit<TransitEntry, 'id'> = {
      rowNo: String(rows.length + 1),
      arrivalDate: idxArrivalDate >= 0 ? parseFlexibleDateToIso(line[idxArrivalDate] || '', assumedCalendar) : '',
      overallStatus: overallStatus || 'در دست ارسال',
      inspectionRequest: idxInspectionReq >= 0 ? cleanStr(line[idxInspectionReq]) : '',
      releaseNetNo: idxReleaseNetNo >= 0 ? cleanStr(line[idxReleaseNetNo]) : '',
      releaseNetDate: idxReleaseNetDate >= 0 ? parseFlexibleDateToIso(line[idxReleaseNetDate] || '', assumedCalendar) : '',
      mapnaShippingNotice: idxShippingNotice >= 0 ? cleanStr(line[idxShippingNotice]) : '',
      interimNo: idxInterimNo >= 0 ? cleanStr(line[idxInterimNo]) : '',
      interimDate: idxInterimDate >= 0 ? parseFlexibleDateToIso(line[idxInterimDate] || '', assumedCalendar) : '',
      supplier: idxSupplier >= 0 ? cleanStr(line[idxSupplier]) : '',
      dispatchLocation: idxDispatch >= 0 ? cleanStr(line[idxDispatch]) : '',
      packingListNo,
      packageNo: idxPackageNo >= 0 ? cleanStr(line[idxPackageNo]) : '',
      itemDescription,
      system: idxSystem >= 0 ? cleanStr(line[idxSystem]) : '',
      subSystem: idxSubSystem >= 0 ? cleanStr(line[idxSubSystem]) : '',
      unit: idxUnit >= 0 ? cleanStr(line[idxUnit]) : '',
      equipmentSupplyCode: idxSupplyCode >= 0 ? cleanStr(line[idxSupplyCode]) : '',
      carrierContractor: idxCarrier >= 0 ? cleanStr(line[idxCarrier]) : '',
      billOfLadingNo: idxWaybill >= 0 ? cleanStr(line[idxWaybill]) : '',
      amount: idxAmount >= 0 ? parseNum(line[idxAmount]) : null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    if (!packingListNo && !itemDescription && !overallStatus) {
      rejectedRows.push({
        id: makeId(),
        scope: 'transit',
        sourceRowIndex: r + 1,
        reasonCode: 'missing_required',
        reasonFa: 'ردیف دارای داده است اما فیلدهای کلیدی (شماره پکینگ لیست، شرح کالا و وضعیت کلی) خالی هستند.',
        reasonEn: 'Row contains data but key identifiers (Packing List No., Item Description, and Overall Status) are empty.',
        canForceReplace: false,
        canForceAdd: true,
        canEditAndRetry: true,
        rawRow: line.map((c) => cleanStr(c)).filter(Boolean).slice(0, 8),
        parsedRow: record as unknown as Record<string, unknown>,
      });
      continue;
    }

    rows.push(record);
  }

  return { rows, skippedEmpty, rejectedRows };
}
