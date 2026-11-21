import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { ResolvedEmployerProfile } from './employers.ts';
import { DEFAULT_UPLOADED_FORM_PRINT_SETTINGS } from './employers.ts';
import { formatIsoDate, getTodayIso } from './jalali.ts';
import type {
  BuiltInFormKey,
  CalendarMode,
  DetailedComputed,
  EmployerUploadedForm,
  GeneralEntry,
  ProjectInfo,
  SiteEntryMinutesRecord,
  TransitEntry,
  UploadedFormDataSource,
  UploadedFormFileType,
  UploadedFormFormulaDetection,
  UploadedFormPrintSettings,
  UploadedFormTableColumnBinding,
} from './types.ts';

export interface SamaanFieldOption {
  key: string;
  labelFa: string;
  labelEn: string;
  aliases: string[];
}

export interface UploadedDataSourceOption {
  value: UploadedFormDataSource;
  labelFa: string;
  labelEn: string;
}

export const UPLOADED_FORM_DATA_SOURCE_OPTIONS: UploadedDataSourceOption[] = [
  { value: 'general', labelFa: 'ثبت کلی تجهیزات و پکینگ لیست', labelEn: 'General / Packing List' },
  { value: 'detailed', labelFa: 'ثبت جزئیات تجهیزات (اقلام و موجودی)', labelEn: 'Detailed Equipment Items' },
  { value: 'transit', labelFa: 'تجهیزات در راه', labelEn: 'In-Transit Equipment' },
  { value: 'siteEntry', labelFa: 'صورتجلسه ورود کالا به کارگاه', labelEn: 'Site Entry Minutes' },
  { value: 'opi', labelFa: 'دعوتنامه گشایش و بازرسی (OPI)', labelEn: 'OPI Invitation' },
  { value: 'opiMinutes', labelFa: 'صورتجلسه گشایش و بازرسی / گزارش مغایرت (MER)', labelEn: 'OPI Minutes / MER' },
  { value: 'gcv', labelFa: 'رسید مصرف مستقیم کالا (GCV)', labelEn: 'Direct Consumption Receipt (GCV)' },
  { value: 'miv', labelFa: 'حواله انبار (MIV)', labelEn: 'Material Issue Voucher (MIV)' },
  { value: 'smr', labelFa: 'فرم ارجاع / برگشت متریال (SMR)', labelEn: 'Store Material Return (SMR)' },
  { value: 'substitution', labelFa: 'فرم جایگزینی تجهیزات (REP)', labelEn: 'Equipment Substitution (REP)' },
  { value: 'balance', labelFa: 'بالانس متریال و انبارگردانی', labelEn: 'Material Balance & Stocktake' },
  { value: 'manual', labelFa: 'ورود دستی مقادیر در زمان پرینت', labelEn: 'Manual Entry Only' },
];

export const SAMAAN_BINDABLE_FIELDS: SamaanFieldOption[] = [
  { key: 'projectName', labelFa: 'نام پروژه', labelEn: 'Project Name', aliases: ['نام پروژه', 'پروژه', 'project', 'projectname', 'نام طرح'] },
  { key: 'contractNo', labelFa: 'شماره قرارداد', labelEn: 'Contract No.', aliases: ['شماره قرارداد', 'قرارداد', 'contract', 'contractno'] },
  { key: 'employerName', labelFa: 'نام کارفرما / شرکت', labelEn: 'Employer Name', aliases: ['کارفرما', 'نام کارفرما', 'شرکت', 'employer', 'company'] },
  { key: 'todayDate', labelFa: 'تاریخ روز', labelEn: 'Current Date', aliases: ['تاریخ روز', 'امروز', 'today', 'currentdate'] },
  { key: 'docNo', labelFa: 'شماره سند / فرم', labelEn: 'Document No.', aliases: ['شماره سند', 'شماره فرم', 'docno', 'formno'] },
  { key: 'minutesNo', labelFa: 'شماره صورتجلسه ورود', labelEn: 'Site Entry Minutes No.', aliases: ['شماره صورتجلسه', 'شماره صورتجلسه ورود', 'صورتجلسه ورود', 'صورتجلسه', 'minutesno', 'arrivalnoticeno', 'mapnaentryminutesno'] },
  { key: 'employerEntryMinutesNo', labelFa: 'شماره صورتجلسه ورود کارفرما', labelEn: 'Employer Entry Minutes No.', aliases: ['صورتجلسه ورود کارفرما', 'شماره صورتجلسه کارفرما', 'employerentryminutesno'] },
  { key: 'releaseNoteNo', labelFa: 'شماره Release Note', labelEn: 'Release Note No.', aliases: ['releasenote', 'release', 'رلیزنت', 'شماره ترخیص', 'releasenoteno'] },
  { key: 'packingListNo', labelFa: 'شماره پکینگ لیست / محموله', labelEn: 'Packing List No.', aliases: ['شماره پکینگ', 'پکینگ لیست', 'شماره پکینگ لیست', 'شماره محموله', 'packing', 'packingno', 'packinglistno', 'shipmentno'] },
  { key: 'packageNo', labelFa: 'شماره نگله / بسته', labelEn: 'Package No.', aliases: ['شماره نگله', 'شماره بسته', 'نگله', 'packageno', 'pkgno'] },
  { key: 'arrivalDate', labelFa: 'تاریخ ورود', labelEn: 'Arrival Date', aliases: ['تاریخ ورود', 'تاریخ', 'arrivaldate', 'date'] },
  { key: 'supplier', labelFa: 'تأمین‌کننده / پیمانکار', labelEn: 'Supplier', aliases: ['تامین کننده', 'تأمین‌کننده', 'فروشنده', 'پیمانکار', 'supplier', 'vendor'] },
  { key: 'origin', labelFa: 'مبدأ / محل ارسال', labelEn: 'Origin / Dispatch', aliases: ['مبدا', 'مبدأ', 'محل ارسال', 'origin', 'dispatch'] },
  { key: 'island', labelFa: 'جزیره', labelEn: 'Island', aliases: ['جزیره', 'island'] },
  { key: 'system', labelFa: 'سیستم', labelEn: 'System', aliases: ['سیستم', 'system'] },
  { key: 'subSystem', labelFa: 'ساب سیستم', labelEn: 'Sub-System', aliases: ['ساب سیستم', 'زیرسیستم', 'subsystem'] },
  { key: 'unit', labelFa: 'واحد / بلوک', labelEn: 'Unit', aliases: ['واحد', 'بلوک', 'unit'] },
  { key: 'waybillNo', labelFa: 'شماره بارنامه', labelEn: 'Waybill No.', aliases: ['شماره بارنامه', 'بارنامه', 'waybill', 'waybillno', 'bl'] },
  { key: 'vehicleNo', labelFa: 'شماره خودرو', labelEn: 'Vehicle No.', aliases: ['شماره خودرو', 'پلاک', 'خودرو', 'vehicleno', 'plate'] },
  { key: 'driverName', labelFa: 'نام راننده', labelEn: 'Driver Name', aliases: ['نام راننده', 'راننده', 'driver', 'drivername'] },
  { key: 'grossWeight', labelFa: 'وزن ناخالص (kg)', labelEn: 'Gross Weight', aliases: ['وزن ناخالص', 'ناخالص', 'grossweight'] },
  { key: 'netWeight', labelFa: 'وزن خالص (kg)', labelEn: 'Net Weight', aliases: ['وزن خالص', 'خالص', 'netweight'] },
  { key: 'weighbridgeWeight', labelFa: 'وزن باسکول (kg)', labelEn: 'Weighbridge Weight', aliases: ['وزن باسکول', 'باسکول', 'weighbridgeweight'] },
  { key: 'freightCost', labelFa: 'مبلغ کرایه حمل', labelEn: 'Freight Cost', aliases: ['کرایه حمل', 'مبلغ کرایه', 'freightcost'] },
  { key: 'dimensions', labelFa: 'ابعاد (طول×عرض×ارتفاع)', labelEn: 'Dimensions', aliases: ['ابعاد', 'طول و عرض', 'dimensions'] },
  { key: 'rowNo', labelFa: 'ردیف', labelEn: 'Row #', aliases: ['ردیف', 'شماره ردیف', 'row', 'rowno', 'no'] },
  { key: 'itemNo', labelFa: 'شماره آیتم / قلم', labelEn: 'Item No.', aliases: ['شماره آیتم', 'شماره قلم', 'آیتم', 'itemno'] },
  { key: 'itemCode', labelFa: 'کد کالا / فنی', labelEn: 'Item Code', aliases: ['کد کالا', 'کد فنی', 'تگ', 'itemcode', 'tag', 'code'] },
  { key: 'generalDescription', labelFa: 'شرح کلی', labelEn: 'General Desc', aliases: ['شرح کلی', 'generaldescription'] },
  { key: 'description', labelFa: 'شرح کالا / تجهیز', labelEn: 'Description', aliases: ['شرح کالا', 'شرح', 'شرح تجهیز', 'description', 'desc'] },
  { key: 'size', labelFa: 'اندازه / سایز', labelEn: 'Size', aliases: ['اندازه', 'سایز', 'size'] },
  { key: 'countingUnit', labelFa: 'واحد شمارش', labelEn: 'UOM', aliases: ['واحد شمارش', 'واحد اندازه گیری', 'uom', 'countingunit'] },
  { key: 'packingQty', labelFa: 'مقدار پکینگ / تعداد بسته', labelEn: 'Packing Qty', aliases: ['تعداد پکینگ', 'مقدار پکینگ', 'تعداد', 'مقدار', 'qty', 'packingqty'] },
  { key: 'actualQty', labelFa: 'مقدار واقعی (تحویلی)', labelEn: 'Actual Qty', aliases: ['مقدار واقعی', 'تعداد واقعی', 'actualqty'] },
  { key: 'shortage', labelFa: 'کسری', labelEn: 'Shortage', aliases: ['کسری', 'shortage'] },
  { key: 'surplus', labelFa: 'اضافی', labelEn: 'Surplus', aliases: ['اضافی', 'مازاد', 'surplus'] },
  { key: 'damagedQty', labelFa: 'آسیب‌دیده', labelEn: 'Damaged Qty', aliases: ['آسیب دیده', 'آسیب‌دیده', 'خسارت', 'damaged', 'damagedqty'] },
  { key: 'mapnaInventory', labelFa: 'موجودی کارفرما', labelEn: 'Employer Stock', aliases: ['موجودی کارفرما', 'موجودی انبار کارفرما', 'موجودی مپنا', 'موجودی انبار اصلی', 'mapnainventory', 'employerstock'] },
  { key: 'contractorInventory', labelFa: 'موجودی پیمانکار', labelEn: 'Contractor Stock', aliases: ['موجودی پیمانکار', 'موجودی انبار پیمانکار', 'contractorinventory', 'contractorstock'] },
  { key: 'storageLocation', labelFa: 'محل نگهداری', labelEn: 'Storage Location', aliases: ['محل نگهداری', 'لوکیشن', 'انبار', 'location', 'storagelocation'] },
  { key: 'opiNo', labelFa: 'شماره دعوتنامه (OPI)', labelEn: 'OPI Invitation No.', aliases: ['شماره دعوتنامه', 'شماره opi', 'دعوتنامه', 'opino', 'opiinvitationno'] },
  { key: 'opiDate', labelFa: 'تاریخ دعوتنامه (OPI)', labelEn: 'OPI Invitation Date', aliases: ['تاریخ دعوتنامه', 'تاریخ opi', 'opidate', 'opiinvitationdate'] },
  { key: 'merNo', labelFa: 'شماره کسری/مغایرت (MER)', labelEn: 'MER / OSDR No.', aliases: ['شماره mer', 'شماره کسری', 'شماره مغایرت', 'mer', 'merno', 'osdr'] },
  { key: 'merStatus', labelFa: 'وضعیت کسری/مغایرت (MER)', labelEn: 'MER Status', aliases: ['وضعیت mer', 'وضعیت کسری', 'وضعیت مغایرت', 'merstatus'] },
  { key: 'gcvReceiptNo', labelFa: 'شماره رسید مصرف (GCV)', labelEn: 'GCV Receipt No.', aliases: ['شماره رسید مصرف', 'شماره رسید', 'شماره gcv', 'gcv', 'gcvreceiptno'] },
  { key: 'gcvDeliveredQty', labelFa: 'تعداد رسید مصرف (GCV)', labelEn: 'GCV Delivered Qty', aliases: ['تعداد رسید مصرف', 'مقدار رسید مصرف', 'مقدار تحویل شده', 'gcvdeliveredqty', 'gcvqty'] },
  { key: 'receiver', labelFa: 'تحویل گیرنده', labelEn: 'Receiver', aliases: ['تحویل گیرنده', 'گیرنده', 'receiver', 'mivreceiver'] },
  { key: 'mivContractorNo', labelFa: 'شماره حواله (MIV)', labelEn: 'MIV Voucher No.', aliases: ['شماره حواله', 'حواله انبار', 'شماره miv', 'miv', 'mivno', 'mivcontractorno'] },
  { key: 'mivContractorDate', labelFa: 'تاریخ حواله (MIV)', labelEn: 'MIV Date', aliases: ['تاریخ حواله', 'تاریخ miv', 'mivdate', 'mivcontractordate'] },
  { key: 'mivContractorQty', labelFa: 'مقدار حواله (MIV)', labelEn: 'MIV Issued Qty', aliases: ['مقدار حواله', 'تعداد حواله', 'تعداد تحویل شده با حواله', 'mivqty', 'mivcontractorqty'] },
  { key: 'smrContractorNo', labelFa: 'شماره برگشتی به انبار پیمانکار (SMR)', labelEn: 'SMR Contractor No.', aliases: ['شماره برگشتی به انبار پیمانکار', 'شماره برگشتی پیمانکار', 'شماره smr پیمانکار', 'smrcontractorno', 'smrno'] },
  { key: 'smrContractorDate', labelFa: 'تاریخ برگشتی پیمانکار (SMR)', labelEn: 'SMR Contractor Date', aliases: ['تاریخ برگشتی پیمانکار', 'تاریخ smr پیمانکار', 'smrcontractordate'] },
  { key: 'smrContractorQty', labelFa: 'مقدار برگشتی پیمانکار (SMR)', labelEn: 'SMR Contractor Qty', aliases: ['مقدار برگشتی پیمانکار', 'تعداد برگشتی پیمانکار', 'smrcontractorqty', 'smrqty'] },
  { key: 'smrMapnaNo', labelFa: 'شماره برگشتی به انبار کارفرما (SMR)', labelEn: 'SMR Employer No.', aliases: ['شماره برگشتی به انبار کارفرما', 'شماره برگشتی کارفرما', 'شماره برگشتی مپنا', 'smrmapnano'] },
  { key: 'smrMapnaDate', labelFa: 'تاریخ برگشتی کارفرما (SMR)', labelEn: 'SMR Employer Date', aliases: ['تاریخ برگشتی کارفرما', 'تاریخ برگشتی مپنا', 'smrmapnadate'] },
  { key: 'smrMapnaQty', labelFa: 'مقدار برگشتی کارفرما (SMR)', labelEn: 'SMR Employer Qty', aliases: ['مقدار برگشتی کارفرما', 'تعداد برگشتی کارفرما', 'smrmapnaqty'] },
  { key: 'smrDeliverer', labelFa: 'تحویل آورنده (برگشت متریال)', labelEn: 'Deliverer (SMR)', aliases: ['تحویل آورنده', 'برگرداننده', 'deliverer', 'smrdeliverer'] },
  { key: 'repNo', labelFa: 'شماره جایگزینی (REP)', labelEn: 'Substitution No. (REP)', aliases: ['شماره جایگزینی', 'شماره rep', 'repno', 'substitutionno'] },
  { key: 'repStatus', labelFa: 'وضعیت جایگزینی (REP)', labelEn: 'Substitution Status', aliases: ['وضعیت جایگزینی', 'وضعیت rep', 'repstatus'] },
  { key: 'repReprocured', labelFa: 'تأمین مجدد جایگزین شده', labelEn: 'Reprocured Substitution', aliases: ['تامین مجدد جایگزین شده', 'تأمین مجدد جایگزین شده', 'تامین مجدد', 'repreprocured'] },
  { key: 'repDescription', labelFa: 'توضیحات جایگزینی (REP)', labelEn: 'Substitution Notes', aliases: ['توضیحات جایگزینی', 'توضیحات rep', 'repdescription'] },
  { key: 'mtoRef', labelFa: 'مرجع MTO', labelEn: 'MTO Reference', aliases: ['mto', 'mtoref', 'مرجع mto', 'برآورد تجهیزات'] },
  { key: 'materialBalanceNo', labelFa: 'شماره بالانس متریال', labelEn: 'Material Balance No.', aliases: ['شماره بالانس', 'شماره بالانس متریال', 'materialbalanceno', 'bmr'] },
  { key: 'balanceStatus', labelFa: 'وضعیت بالانس', labelEn: 'Balance Status', aliases: ['وضعیت بالانس', 'balancestatus'] },
  { key: 'stocktakeStatus', labelFa: 'وضعیت انبارگردانی', labelEn: 'Stocktake Status', aliases: ['وضعیت انبارگردانی', 'انبارگردانی', 'stocktakestatus'] },
  { key: 'stocktakeDate', labelFa: 'تاریخ انبارگردانی', labelEn: 'Stocktake Date', aliases: ['تاریخ انبارگردانی', 'stocktakedate'] },
  { key: 'chemicalType', labelFa: 'نوع ماده شیمیایی', labelEn: 'Chemical Type', aliases: ['نوع ماده شیمیایی', 'ماده شیمیایی', 'chemicaltype'] },
  { key: 'expirationDate', labelFa: 'تاریخ انقضاء', labelEn: 'Expiration Date', aliases: ['تاریخ انقضا', 'تاریخ انقضاء', 'expirationdate', 'expiry'] },
  { key: 'overallStatus', labelFa: 'وضعیت کلی', labelEn: 'Overall Status', aliases: ['وضعیت کلی', 'وضعیت', 'overallstatus', 'status'] },
  { key: 'remarks', labelFa: 'توضیحات / ملاحظات', labelEn: 'Remarks', aliases: ['ملاحظات', 'توضیحات', 'شرح تکمیلی', 'remarks', 'notes'] },
];

export interface ParsedExcelMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ParsedExcelModel {
  sheetNames: string[];
  activeSheetName: string;
  rows: string[][];
  merges: ParsedExcelMerge[];
  colWidthsPx: number[];
  templateRowHeightsPx: (number | undefined)[];
  detectedTokens: string[];
  detectedFormulas: UploadedFormFormulaDetection[];
}

export type WordBlock =
  | { type: 'paragraph'; text: string; isHeading?: boolean; align?: 'left' | 'right' | 'center' }
  | { type: 'table'; rows: string[][] };

export interface ParsedWordModel {
  blocks: WordBlock[];
  detectedTokens: string[];
  rawText: string;
}

export function normalizeMatchText(v: string): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[_\-.\s:()/\u200c]+/g, '');
}

export function matchTokenToFieldKey(tokenOrHeader: string): string | undefined {
  const norm = normalizeMatchText(tokenOrHeader);
  if (!norm) return undefined;
  for (const field of SAMAAN_BINDABLE_FIELDS) {
    if (normalizeMatchText(field.key) === norm) return field.key;
    if (normalizeMatchText(field.labelFa) === norm) return field.key;
    if (normalizeMatchText(field.labelEn) === norm) return field.key;
    for (const alias of field.aliases) {
      if (normalizeMatchText(alias) === norm) return field.key;
    }
  }
  return undefined;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bytes = base64ToUint8Array(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export function detectUploadedFileType(fileName: string, mimeType: string): UploadedFormFileType | null {
  const lower = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm') || lower.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('excel')) {
    return 'excel';
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || mime.includes('wordprocessingml') || mime.includes('msword')) {
    return 'word';
  }
  if (lower.endsWith('.pdf') || mime === 'application/pdf') {
    return 'pdf';
  }
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg') ||
    mime.startsWith('image/')
  ) {
    return 'image';
  }
  return null;
}

export function extractTokensFromText(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const regex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const token = match[1].trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
    match = regex.exec(text);
  }
  return tokens;
}

export function replaceTokensInText(
  text: string,
  tokenMap: Record<string, string>,
  tokenBindings?: Record<string, string>,
): string {
  if (!text || !text.includes('{{')) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, rawName: string) => {
    const cleanName = rawName.trim();
    const boundKey = tokenBindings?.[cleanName];
    if (boundKey && tokenMap[boundKey] !== undefined) {
      return tokenMap[boundKey];
    }
    if (tokenMap[cleanName] !== undefined) {
      return tokenMap[cleanName];
    }
    const guessedKey = matchTokenToFieldKey(cleanName);
    if (guessedKey && tokenMap[guessedKey] !== undefined) {
      return tokenMap[guessedKey];
    }
    const norm = normalizeMatchText(cleanName);
    for (const [k, v] of Object.entries(tokenMap)) {
      if (normalizeMatchText(k) === norm) return v;
    }
    return full;
  });
}

// In-memory LRU cache to prevent expensive XLSX.read() on every keystroke/re-render
const EXCEL_MODEL_CACHE_MAX = 14;
const excelModelCache = new Map<string, ParsedExcelModel>();

function makeExcelCacheKey(base64: string, sheetName?: string, maxRows = 120, maxCols = 28): string {
  const len = base64.length;
  const head = base64.slice(0, 64);
  const mid = len > 200 ? base64.slice(Math.floor(len / 2), Math.floor(len / 2) + 32) : '';
  const tail = len > 64 ? base64.slice(-32) : '';
  return `${len}:${head}:${mid}:${tail}|${sheetName || ''}|${maxRows}x${maxCols}`;
}

export function clearExcelModelCache(): void {
  excelModelCache.clear();
}

function inferFormulaSuggestedFieldKey(formula: string, adjacentLabel: string): string | undefined {
  const byLabel = matchTokenToFieldKey(adjacentLabel);
  if (byLabel) return byLabel;

  const upper = formula.toUpperCase();
  if (/VLOOKUP|XLOOKUP|INDEX\s*\(|MATCH\s*\(/.test(upper)) {
    return matchTokenToFieldKey(adjacentLabel) || 'description';
  }
  if (/^SUM\s*\(/i.test(upper)) {
    const lbl = normalizeMatchText(adjacentLabel);
    if (lbl.includes('وزنناخالص') || lbl.includes('gross')) return 'grossWeight';
    if (lbl.includes('وزنخالص') || lbl.includes('net')) return 'netWeight';
    if (lbl.includes('حواله') || lbl.includes('miv')) return 'mivContractorQty';
    if (lbl.includes('رسید') || lbl.includes('gcv')) return 'gcvDeliveredQty';
    if (lbl.includes('برگشتی') || lbl.includes('smr')) return 'smrContractorQty';
    if (lbl.includes('کسری') || lbl.includes('short')) return 'shortage';
    if (lbl.includes('آسیب') || lbl.includes('damag')) return 'damagedQty';
    return 'packingQty';
  }
  if (/-/.test(upper) && !/TODAY|DATE/.test(upper)) {
    const lbl = normalizeMatchText(adjacentLabel);
    if (lbl.includes('موجودیپیمانکار')) return 'contractorInventory';
    if (lbl.includes('موجودیکارفرما') || lbl.includes('موجودی')) return 'mapnaInventory';
    return 'shortage';
  }
  if (/TODAY\s*\(|NOW\s*\(/i.test(upper)) {
    return 'todayDate';
  }
  if (/ROW\s*\(/i.test(upper)) {
    return 'rowNo';
  }
  return undefined;
}

export function parseExcelSheetModel(
  base64: string,
  requestedSheetName?: string,
  maxRows = 120,
  maxCols = 28,
): ParsedExcelModel {
  const cacheKey = makeExcelCacheKey(base64, requestedSheetName, maxRows, maxCols);
  const cached = excelModelCache.get(cacheKey);
  if (cached) {
    // Refresh LRU order
    excelModelCache.delete(cacheKey);
    excelModelCache.set(cacheKey, cached);
    return cached;
  }

  const bytes = base64ToUint8Array(base64);
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true, cellFormula: true });
  const sheetNames = wb.SheetNames || [];
  const activeSheetName =
    requestedSheetName && sheetNames.includes(requestedSheetName)
      ? requestedSheetName
      : sheetNames[0] || '';

  if (!activeSheetName) {
    const emptyModel: ParsedExcelModel = {
      sheetNames: [],
      activeSheetName: '',
      rows: [],
      merges: [],
      colWidthsPx: [],
      templateRowHeightsPx: [],
      detectedTokens: [],
      detectedFormulas: [],
    };
    return emptyModel;
  }

  const ws = wb.Sheets[activeSheetName];
  const ref = ws['!ref'] || 'A1:A1';
  const range = XLSX.utils.decode_range(ref);

  let lastNonEmptyRow = 0;
  let lastNonEmptyCol = 0;
  const rowUpper = Math.min(range.e.r, maxRows - 1);
  const colUpper = Math.min(range.e.c, maxCols - 1);

  const rawRows: string[][] = [];
  const tokenSet = new Set<string>();
  const rawFormulaCells: Array<{ r: number; c: number; cellRef: string; formula: string }> = [];

  for (let r = 0; r <= rowUpper; r += 1) {
    const rowArr: string[] = [];
    for (let c = 0; c <= colUpper; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      const str = cell ? (cell.w !== undefined ? String(cell.w) : cell.v !== undefined ? String(cell.v) : '') : '';
      const formulaStr = cell && typeof cell.f === 'string' ? cell.f.trim() : '';
      if (formulaStr) {
        lastNonEmptyRow = Math.max(lastNonEmptyRow, r);
        lastNonEmptyCol = Math.max(lastNonEmptyCol, c);
        if (rawFormulaCells.length < 60) {
          rawFormulaCells.push({ r, c, cellRef: addr, formula: formulaStr });
        }
      }
      if (str.trim() !== '') {
        lastNonEmptyRow = Math.max(lastNonEmptyRow, r);
        lastNonEmptyCol = Math.max(lastNonEmptyCol, c);
        for (const t of extractTokensFromText(str)) tokenSet.add(t);
      }
      rowArr.push(str);
    }
    rawRows.push(rowArr);
  }

  const merges: ParsedExcelMerge[] = Array.isArray(ws['!merges'])
    ? ws['!merges'].filter((m) => m.s.r <= rowUpper && m.s.c <= colUpper)
    : [];

  for (const m of merges) {
    lastNonEmptyRow = Math.max(lastNonEmptyRow, Math.min(m.e.r, rowUpper));
    lastNonEmptyCol = Math.max(lastNonEmptyCol, Math.min(m.e.c, colUpper));
  }

  const finalRowsCount = Math.max(1, lastNonEmptyRow + 1);
  const finalColsCount = Math.max(1, lastNonEmptyCol + 1);
  const trimmedRows = rawRows.slice(0, finalRowsCount).map((row) => row.slice(0, finalColsCount));

  // Resolve adjacent labels & suggested SAMAAN field keys for detected Excel formulas
  const detectedFormulas: UploadedFormFormulaDetection[] = rawFormulaCells.map(({ r, c, cellRef, formula }) => {
    const above = r > 0 ? (trimmedRows[r - 1]?.[c] || '').trim() : '';
    const left = c > 0 ? (trimmedRows[r]?.[c - 1] || '').trim() : '';
    const right = c + 1 < finalColsCount ? (trimmedRows[r]?.[c + 1] || '').trim() : '';
    // Also check nearest non-empty header above in the same column
    let headerAbove = above;
    if (!headerAbove) {
      for (let rr = r - 1; rr >= Math.max(0, r - 6); rr -= 1) {
        const candidate = (trimmedRows[rr]?.[c] || '').trim();
        if (candidate && !/^[\d.,/\-\s]+$/.test(candidate)) {
          headerAbove = candidate;
          break;
        }
      }
    }
    const label = [headerAbove, left, right].find((txt) => txt && !/^[\d.,/\-\s]+$/.test(txt)) || '';
    const suggestedFieldKey = inferFormulaSuggestedFieldKey(formula, label);
    return {
      cellRef,
      rowIndex: r,
      colIndex: c,
      formula: formula.startsWith('=') ? formula : `=${formula}`,
      label: label || undefined,
      suggestedFieldKey,
      boundFieldKey: suggestedFieldKey,
    };
  });

  const colsMeta = Array.isArray(ws['!cols']) ? ws['!cols'] : [];
  const colWidthsPx: number[] = [];
  for (let c = 0; c < finalColsCount; c += 1) {
    const meta = colsMeta[c];
    let widthPx = 0;
    if (meta && typeof meta.wpx === 'number' && meta.wpx > 0) {
      widthPx = meta.wpx;
    } else if (meta && typeof meta.wch === 'number' && meta.wch > 0) {
      widthPx = Math.round(meta.wch * 7.6 + 10);
    } else {
      let maxLen = 8;
      for (let r = 0; r < finalRowsCount; r += 1) {
        const len = (trimmedRows[r]?.[c] || '').length;
        const isMergedWide = merges.some(
          (m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c && m.e.c > m.s.c,
        );
        if (!isMergedWide && len > maxLen) maxLen = Math.min(len, 38);
      }
      widthPx = Math.round(Math.min(260, Math.max(58, maxLen * 7.5 + 16)));
    }
    colWidthsPx.push(Math.max(42, Math.min(360, widthPx)));
  }

  const rowsMeta = Array.isArray(ws['!rows']) ? ws['!rows'] : [];
  const templateRowHeightsPx: (number | undefined)[] = [];
  for (let r = 0; r < finalRowsCount; r += 1) {
    const rm = rowsMeta[r];
    if (rm && typeof rm.hpx === 'number' && rm.hpx > 0) {
      templateRowHeightsPx.push(rm.hpx);
    } else if (rm && typeof rm.hpt === 'number' && rm.hpt > 0) {
      templateRowHeightsPx.push(Math.round(rm.hpt * 1.333));
    } else {
      templateRowHeightsPx.push(undefined);
    }
  }

  const result: ParsedExcelModel = {
    sheetNames,
    activeSheetName,
    rows: trimmedRows,
    merges,
    colWidthsPx,
    templateRowHeightsPx,
    detectedTokens: Array.from(tokenSet),
    detectedFormulas,
  };

  if (excelModelCache.size >= EXCEL_MODEL_CACHE_MAX) {
    const oldestKey = excelModelCache.keys().next().value;
    if (oldestKey) excelModelCache.delete(oldestKey);
  }
  excelModelCache.set(cacheKey, result);
  return result;
}

/**
 * Dynamically computes auto-fitted row height in pixels from cell text lengths,
 * explicit newlines, spanned column widths, and font size — behaving like Excel AutoFit.
 */
export function calculateAutoRowHeightPx(
  cells: string[],
  colWidthsPx: number[],
  fontSizePt: number,
  minRowHeightPx: number,
  colSpans?: number[],
): number {
  const fontPx = Math.max(8, fontSizePt) * 1.333;
  const lineHeightPx = fontPx * 1.48;
  const avgCharPx = fontPx * 0.56;
  let maxLines = 1;

  for (let c = 0; c < cells.length; c += 1) {
    const text = (cells[c] || '').trim();
    if (!text) continue;
    const span = Math.max(1, colSpans?.[c] || 1);
    let cellWidthPx = 0;
    for (let s = 0; s < span; s += 1) {
      cellWidthPx += colWidthsPx[c + s] || 90;
    }
    const usableWidthPx = Math.max(24, cellWidthPx - 12);
    const charsPerLine = Math.max(4, Math.floor(usableWidthPx / avgCharPx));

    const explicitLines = text.split(/\r?\n/);
    let totalWrapped = 0;
    for (const seg of explicitLines) {
      totalWrapped += Math.max(1, Math.ceil(seg.length / charsPerLine));
    }
    if (totalWrapped > maxLines) {
      maxLines = totalWrapped;
    }
  }

  const computed = Math.ceil(maxLines * lineHeightPx + 10);
  return Math.max(minRowHeightPx, computed);
}

function getDirectParagraphText(pEl: Element): string {
  const tNodes = Array.from(pEl.getElementsByTagName('*')).filter((el) => el.localName === 't' || el.localName === 'br' || el.localName === 'tab');
  let out = '';
  for (const n of tNodes) {
    if (n.localName === 'br') out += '\n';
    else if (n.localName === 'tab') out += '  ';
    else out += n.textContent || '';
  }
  return out;
}

export async function parseWordDocModel(
  base64: string,
  tokenMap?: Record<string, string>,
  tokenBindings?: Record<string, string>,
  lineRows?: Array<Record<string, string>>,
): Promise<ParsedWordModel> {
  const bytes = base64ToUint8Array(base64);
  const zip = await JSZip.loadAsync(bytes);
  const xmlFiles = Object.keys(zip.files).filter(
    (name) => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name),
  );

  const tokenSet = new Set<string>();
  const parser = new DOMParser();

  const applyReplace = (txt: string) =>
    tokenMap ? replaceTokensInText(txt, tokenMap, tokenBindings) : txt;

  // Scan headers/footers for tokens too
  const extraTexts: string[] = [];
  for (const name of xmlFiles) {
    if (name.toLowerCase() === 'word/document.xml') continue;
    const xmlStr = await zip.files[name].async('string');
    const doc = parser.parseFromString(xmlStr, 'application/xml');
    const paras = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'p');
    for (const p of paras) {
      const txt = getDirectParagraphText(p).trim();
      if (!txt) continue;
      for (const tok of extractTokensFromText(txt)) tokenSet.add(tok);
      extraTexts.push(applyReplace(txt));
    }
  }

  const mainFile = zip.files['word/document.xml'];
  if (!mainFile) {
    return { blocks: [], detectedTokens: Array.from(tokenSet), rawText: extraTexts.join('\n') };
  }

  const mainXml = await mainFile.async('string');
  const mainDoc = parser.parseFromString(mainXml, 'application/xml');
  const body = Array.from(mainDoc.getElementsByTagName('*')).find((el) => el.localName === 'body');

  const blocks: WordBlock[] = [];
  if (extraTexts.length > 0) {
    blocks.push({ type: 'paragraph', text: extraTexts.join(' | '), isHeading: true, align: 'center' });
  }

  if (body) {
    for (const child of Array.from(body.children)) {
      if (child.localName === 'p') {
        const raw = getDirectParagraphText(child);
        for (const tok of extractTokensFromText(raw)) tokenSet.add(tok);
        const pStyle = Array.from(child.getElementsByTagName('*')).find((el) => el.localName === 'pStyle');
        const styleVal = pStyle?.getAttribute('w:val') || pStyle?.getAttribute('val') || '';
        const jcEl = Array.from(child.getElementsByTagName('*')).find((el) => el.localName === 'jc');
        const jc = jcEl?.getAttribute('w:val') || jcEl?.getAttribute('val') || '';
        const align: 'left' | 'right' | 'center' | undefined =
          jc === 'center' ? 'center' : jc === 'left' ? 'left' : jc === 'right' ? 'right' : undefined;
        const replaced = applyReplace(raw);
        if (replaced.trim() || blocks.length > 0) {
          blocks.push({
            type: 'paragraph',
            text: replaced,
            isHeading: /heading|title/i.test(styleVal),
            align,
          });
        }
      } else if (child.localName === 'tbl') {
        const trList = Array.from(child.children).filter((el) => el.localName === 'tr');
        const rows: string[][] = [];
        for (const tr of trList) {
          const tcList = Array.from(tr.children).filter((el) => el.localName === 'tc');
          const rowCells: string[] = [];
          let isRepeaterTemplateRow = false;
          for (const tc of tcList) {
            const pEls = Array.from(tc.children).filter((el) => el.localName === 'p');
            const cellText = pEls.map((p) => getDirectParagraphText(p)).join('\n');
            for (const tok of extractTokensFromText(cellText)) tokenSet.add(tok);
            if (/\{\{\s*(rowNo|description|itemCode|itemNo|packageNo|packingQty|actualQty|shortage|damagedQty|countingUnit)\s*\}\}/i.test(cellText)) {
              isRepeaterTemplateRow = true;
            }
            rowCells.push(cellText);
          }
          if (isRepeaterTemplateRow && lineRows && lineRows.length > 0 && tokenMap) {
            for (const line of lineRows) {
              const mergedMap = { ...tokenMap, ...line };
              rows.push(rowCells.map((ct) => replaceTokensInText(ct, mergedMap, tokenBindings)));
            }
          } else {
            rows.push(rowCells.map((ct) => applyReplace(ct)));
          }
        }
        if (rows.length > 0) {
          blocks.push({ type: 'table', rows });
        }
      }
    }
  }

  return {
    blocks,
    detectedTokens: Array.from(tokenSet),
    rawText: blocks
      .map((b) => (b.type === 'paragraph' ? b.text : b.rows.map((r) => r.join(' ')).join('\n')))
      .join('\n'),
  };
}

export function inferTableColumnBindingsFromExcel(model: ParsedExcelModel): {
  tableStartRowIndex?: number;
  tableColumnBindings: UploadedFormTableColumnBinding[];
} {
  let bestRowIdx = -1;
  let bestMatches: UploadedFormTableColumnBinding[] = [];

  for (let r = 0; r < Math.min(model.rows.length, 40); r += 1) {
    const row = model.rows[r] || [];
    const matches: UploadedFormTableColumnBinding[] = [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = (row[c] || '').trim();
      if (!cell) continue;
      // Check {{token}} inside cell or header name match
      const toks = extractTokensFromText(cell);
      const tokenMatch = toks.length > 0 ? matchTokenToFieldKey(toks[0]) : undefined;
      const headerMatch = matchTokenToFieldKey(cell);
      const resolved = tokenMatch || headerMatch;
      if (resolved) {
        matches.push({ colIndex: c, headerLabel: cell, fieldKey: resolved });
      }
    }
    if (matches.length >= 2 && matches.length > bestMatches.length) {
      bestMatches = matches;
      bestRowIdx = r;
    }
  }

  if (bestRowIdx >= 0 && bestMatches.length >= 2) {
    const firstRowCells = model.rows[bestRowIdx] || [];
    const containsToken = firstRowCells.some((c) => c.includes('{{'));
    return {
      tableStartRowIndex: containsToken ? bestRowIdx : bestRowIdx + 1,
      tableColumnBindings: bestMatches,
    };
  }
  return { tableStartRowIndex: undefined, tableColumnBindings: [] };
}

export interface TargetSectionDetectionResult {
  section: BuiltInFormKey | 'custom_standalone';
  confidence: 'high' | 'medium' | 'low';
  reasonFa: string;
  reasonEn: string;
  suggestedDataSources: UploadedFormDataSource[];
}

export function detectTargetOperationalSection(
  fileName: string,
  textSamples: string[],
  detectedTokens: string[] = [],
  tableColumnBindings: UploadedFormTableColumnBinding[] = [],
): TargetSectionDetectionResult {
  const combinedRaw = [
    fileName,
    ...textSamples.slice(0, 60),
    ...detectedTokens,
    ...tableColumnBindings.map((b) => `${b.headerLabel} ${b.fieldKey}`),
  ]
    .join(' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();

  const rules: Array<{
    section: BuiltInFormKey;
    patterns: RegExp[];
    dataSources: UploadedFormDataSource[];
    reasonFa: string;
    reasonEn: string;
  }> = [
    {
      section: 'siteEntry',
      patterns: [/صورتجلسه\s*ورود|ورود\s*کالا|arrival\s*notice|site\s*entry|fqp02\/15-01|gate\s*pass/i],
      dataSources: ['siteEntry', 'general'],
      reasonFa: 'مطابقت عنوان/ساختار فایل با «صورتجلسه ورود کالا به کارگاه»',
      reasonEn: 'Matched keywords/layout for Site Entry Minutes',
    },
    {
      section: 'opi',
      patterns: [/دعوتنامه\s*گشایش|دعوتنامه\s*بازرسی|opi\s*invitation|invitation\s*for\s*open|بازرسی\s*بسته/i],
      dataSources: ['opi', 'general'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «دعوتنامه گشایش و بازرسی (OPI)»',
      reasonEn: 'Matched keywords for OPI Invitation',
    },
    {
      section: 'mer',
      patterns: [/گزارش\s*مغایرت|کسری\s*و\s*آسیب|\bmer\b|\bosdr\b|discrepancy\s*report|shortage\s*and\s*damage/i],
      dataSources: ['opiMinutes', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «گزارش مغایرت، کسری و آسیب‌دیدگی (MER/OSDR)»',
      reasonEn: 'Matched keywords for MER / OSDR Discrepancy Report',
    },
    {
      section: 'opiMinutes',
      patterns: [/صورتجلسه\s*گشایش|صورتجلسه\s*بازرسی|opi\s*minutes|\bmom\b|open\s*package\s*inspection/i],
      dataSources: ['opiMinutes', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «صورتجلسه گشایش و بازرسی (OPI)»',
      reasonEn: 'Matched keywords for OPI Inspection Minutes',
    },
    {
      section: 'gcv',
      patterns: [/رسید\s*مصرف\s*مستقیم|رسید\s*مصرف|\bgcv\b|goods\s*consumption|direct\s*consumption/i],
      dataSources: ['gcv', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «رسید مصرف مستقیم کالا (GCV)»',
      reasonEn: 'Matched keywords for Direct Consumption Receipt (GCV)',
    },
    {
      section: 'smr',
      patterns: [/فرم\s*ارجاع|برگشت\s*متریال|برگشتی\s*به\s*انبار|\bsmr\b|material\s*return|store\s*return/i],
      dataSources: ['smr', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «فرم ارجاع / برگشت متریال (SMR)»',
      reasonEn: 'Matched keywords for Material Return Form (SMR)',
    },
    {
      section: 'miv',
      patterns: [/حواله\s*انبار|حواله\s*خروج|\bmiv\b|material\s*issue\s*voucher/i],
      dataSources: ['miv', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «حواله انبار (MIV)»',
      reasonEn: 'Matched keywords for Material Issue Voucher (MIV)',
    },
    {
      section: 'substitution',
      patterns: [/جایگزینی\s*تجهیز|فرم\s*جایگزینی|\brep\b|substitution|replacement\s*request/i],
      dataSources: ['substitution', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «فرم جایگزینی تجهیزات (REP)»',
      reasonEn: 'Matched keywords for Equipment Substitution (REP)',
    },
    {
      section: 'balance',
      patterns: [/بالانس\s*متریال|\bbmr\b|material\s*balance|تراز\s*متریال/i],
      dataSources: ['balance', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «فرم بالانس متریال»',
      reasonEn: 'Matched keywords for Material Balance',
    },
    {
      section: 'stocktake',
      patterns: [/انبارگردانی|بازدید\s*ادواری|stocktake|periodic\s*inspection|inventory\s*count/i],
      dataSources: ['balance', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «فرم انبارگردانی و بازدید ادواری»',
      reasonEn: 'Matched keywords for Stocktake & Periodic Inspection',
    },
    {
      section: 'storageLabel',
      patterns: [/لیبل\s*نگهداری|برچسب\s*تجهیز|کارت\s*شناسایی\s*بسته|storage\s*label|package\s*tag/i],
      dataSources: ['general', 'detailed'],
      reasonFa: 'مطابقت عنوان/ستون‌ها با «لیبل و کارت شناسایی انبار»',
      reasonEn: 'Matched keywords for Storage Label',
    },
  ];

  for (const rule of rules) {
    let hitCount = 0;
    for (const pat of rule.patterns) {
      if (pat.test(combinedRaw)) hitCount += 1;
    }
    if (hitCount > 0) {
      return {
        section: rule.section,
        confidence: fileName.toLowerCase().match(rule.patterns[0]) ? 'high' : 'medium',
        reasonFa: rule.reasonFa,
        reasonEn: rule.reasonEn,
        suggestedDataSources: rule.dataSources,
      };
    }
  }

  // Fallback heuristic based on table columns
  const boundKeys = new Set(tableColumnBindings.map((b) => b.fieldKey));
  if (boundKeys.has('mivContractorNo') || boundKeys.has('mivContractorQty')) {
    return {
      section: 'miv',
      confidence: 'medium',
      reasonFa: 'تشخیص بر اساس ستون‌های حواله انبار (MIV) در جدول فایل',
      reasonEn: 'Detected from MIV columns in worksheet',
      suggestedDataSources: ['miv', 'detailed'],
    };
  }
  if (boundKeys.has('gcvReceiptNo') || boundKeys.has('gcvDeliveredQty')) {
    return {
      section: 'gcv',
      confidence: 'medium',
      reasonFa: 'تشخیص بر اساس ستون‌های رسید مصرف (GCV) در جدول فایل',
      reasonEn: 'Detected from GCV columns in worksheet',
      suggestedDataSources: ['gcv', 'detailed'],
    };
  }
  if (boundKeys.has('smrContractorNo') || boundKeys.has('smrMapnaNo')) {
    return {
      section: 'smr',
      confidence: 'medium',
      reasonFa: 'تشخیص بر اساس ستون‌های برگشت متریال (SMR) در جدول فایل',
      reasonEn: 'Detected from SMR columns in worksheet',
      suggestedDataSources: ['smr', 'detailed'],
    };
  }
  if (boundKeys.has('shortage') || boundKeys.has('damagedQty') || boundKeys.has('merNo')) {
    return {
      section: 'mer',
      confidence: 'medium',
      reasonFa: 'تشخیص بر اساس ستون‌های کسری، آسیب‌دیدگی و MER',
      reasonEn: 'Detected from shortage/damaged/MER columns',
      suggestedDataSources: ['opiMinutes', 'detailed'],
    };
  }

  return {
    section: 'custom_standalone',
    confidence: 'low',
    reasonFa: 'فرم اختصاصی مستقل (لطفاً بخش عملیاتی مرتبط را انتخاب و تأیید کنید)',
    reasonEn: 'Standalone custom form (please select & confirm matching operational section)',
    suggestedDataSources: ['general', 'detailed'],
  };
}

export async function parseUploadedFormFile(
  file: File,
  defaultSource: UploadedFormDataSource = 'general',
): Promise<EmployerUploadedForm> {
  const mimeType = file.type || 'application/octet-stream';
  const fileType = detectUploadedFileType(file.name, mimeType);
  if (!fileType) {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود. از فایل‌های اکسل (.xlsx/.xls)، ورد (.docx)، پی‌دی‌اف (.pdf) یا تصویر استفاده کنید.');
  }

  const buf = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  const titleBase = file.name.replace(/\.[^.]+$/, '').trim() || file.name;
  const now = new Date().toISOString();

  let sheetName: string | undefined;
  let detectedTokens: string[] = [];
  const tokenBindings: Record<string, string> = {};
  let tableStartRowIndex: number | undefined;
  let tableColumnBindings: UploadedFormTableColumnBinding[] | undefined;
  let detectedFormulas: UploadedFormFormulaDetection[] | undefined;
  const textSamples: string[] = [];

  if (fileType === 'excel') {
    const model = parseExcelSheetModel(base64);
    sheetName = model.activeSheetName || undefined;
    detectedTokens = model.detectedTokens;
    detectedFormulas = model.detectedFormulas;
    const inferred = inferTableColumnBindingsFromExcel(model);
    tableStartRowIndex = inferred.tableStartRowIndex;
    tableColumnBindings = inferred.tableColumnBindings;
    for (let r = 0; r < Math.min(model.rows.length, 25); r += 1) {
      const joined = (model.rows[r] || []).filter(Boolean).join(' ').trim();
      if (joined) textSamples.push(joined);
    }
  } else if (fileType === 'word' && file.name.toLowerCase().endsWith('.docx')) {
    const model = await parseWordDocModel(base64);
    detectedTokens = model.detectedTokens;
    if (model.rawText) textSamples.push(model.rawText.slice(0, 1200));
  }

  for (const tok of detectedTokens) {
    const guessed = matchTokenToFieldKey(tok);
    if (guessed) {
      tokenBindings[tok] = guessed;
    }
  }

  const detectedSection = detectTargetOperationalSection(
    file.name,
    textSamples,
    detectedTokens,
    tableColumnBindings || [],
  );

  const formCodeMatch = titleBase.match(/([A-Z]{2,6}[-_/][A-Z0-9\-_/]{2,})/i);
  const effectiveSources: UploadedFormDataSource[] =
    detectedSection.suggestedDataSources.length > 0
      ? detectedSection.suggestedDataSources
      : [defaultSource];

  return {
    id: `uform-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    titleFa: titleBase,
    titleEn: '',
    formCode: formCodeMatch ? formCodeMatch[1] : '',
    fileName: file.name,
    fileType,
    mimeType,
    fileDataBase64: base64,
    sheetName,
    detectedTokens,
    tokenBindings: Object.keys(tokenBindings).length > 0 ? tokenBindings : undefined,
    dataSource: effectiveSources[0] || defaultSource,
    dataSources: effectiveSources,
    targetAppSection: detectedSection.section,
    targetSectionConfidence: detectedSection.confidence,
    targetSectionReasonFa: detectedSection.reasonFa,
    targetSectionReasonEn: detectedSection.reasonEn,
    targetSectionConfirmed: false,
    detectedFormulas: detectedFormulas && detectedFormulas.length > 0 ? detectedFormulas : undefined,
    printSettings: { ...DEFAULT_UPLOADED_FORM_PRINT_SETTINGS },
    tableStartRowIndex,
    tableColumnBindings: tableColumnBindings && tableColumnBindings.length > 0 ? tableColumnBindings : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UploadedFormContextInput {
  project?: ProjectInfo | null;
  employer: ResolvedEmployerProfile;
  calendar: CalendarMode;
  dataSource: UploadedFormDataSource;
  dataSources?: UploadedFormDataSource[];
  siteEntry?: SiteEntryMinutesRecord | null;
  packingListNo?: string;
  generalRows: GeneralEntry[];
  detailedRows: DetailedComputed[];
  transitRows: TransitEntry[];
  docNo?: string;
  manualOverrides?: Record<string, string>;
}

export function buildUploadedFormContextData(input: UploadedFormContextInput): {
  headerTokens: Record<string, string>;
  lineRows: Array<Record<string, string>>;
} {
  const { project, employer, calendar, dataSource, dataSources, siteEntry, packingListNo, generalRows, detailedRows, transitRows, docNo, manualOverrides } = input;
  const fmt = (iso?: string) => (iso ? formatIsoDate(iso, calendar) : '');
  const activeSources: UploadedFormDataSource[] =
    dataSources && dataSources.length > 0 ? dataSources : [dataSource];
  const primarySource = activeSources[0] || dataSource;
  const usesSiteEntry = activeSources.includes('siteEntry');
  const usesTransit = activeSources.includes('transit');
  const usesDetailedOps = activeSources.some((s) =>
    ['detailed', 'opi', 'opiMinutes', 'gcv', 'miv', 'smr', 'substitution', 'balance'].includes(s),
  );

  const targetPk = (
    usesSiteEntry && siteEntry
      ? siteEntry.packingListNos?.[0] || packingListNo || ''
      : packingListNo || ''
  ).trim();

  const matchingGen = targetPk
    ? generalRows.filter((g) => (g.packingListNo || '').trim() === targetPk)
    : [];
  const matchingDet = targetPk
    ? detailedRows.filter((d) => (d.shipmentNo || '').trim() === targetPk)
    : [];
  const matchingTransit = targetPk
    ? transitRows.filter((t) => (t.packingListNo || '').trim() === targetPk || (t.linkedGeneralPackingNo || '').trim() === targetPk)
    : [];

  const firstGen = matchingGen[0];
  const firstDet = matchingDet[0];
  const firstTr = matchingTransit[0];

  const headerTokens: Record<string, string> = {
    projectName: project?.name || '',
    contractNo: project?.code || employer.contractRef || '',
    employerName: employer.companyFullName || employer.nameFa || '',
    todayDate: fmt(getTodayIso()),
    docNo: docNo || siteEntry?.minutesNo || firstDet?.mivContractorNo || firstDet?.gcvReceiptNo || '',
    minutesNo: siteEntry?.minutesNo || firstGen?.mapnaEntryMinutesNo || firstGen?.employerEntryMinutesNo || '',
    employerEntryMinutesNo: firstGen?.employerEntryMinutesNo || '',
    releaseNoteNo: siteEntry?.releaseNoteNo || firstGen?.releaseNo || firstTr?.releaseNetNo || '',
    packingListNo:
      usesSiteEntry && siteEntry?.packingListNos?.length
        ? siteEntry.packingListNos.join(' / ')
        : targetPk,
    packageNo:
      Array.from(
        new Set([
          ...matchingGen.map((g) => g.packageNo).filter(Boolean),
          ...matchingDet.map((d) => d.packageNo).filter(Boolean),
          ...matchingTransit.map((t) => t.packageNo).filter(Boolean),
        ]),
      ).join('، '),
    arrivalDate: fmt(siteEntry?.arrivalDate || siteEntry?.date || firstGen?.arrivalDate || firstDet?.arrivalDate || firstTr?.arrivalDate),
    supplier: siteEntry?.supplier || firstGen?.supplier || firstDet?.supplier || firstTr?.supplier || '',
    origin: siteEntry?.origin || firstGen?.dispatchLocation || firstDet?.origin || firstTr?.dispatchLocation || '',
    island: siteEntry?.island || firstGen?.island || firstDet?.island || '',
    system: siteEntry?.system || firstGen?.system || firstDet?.system || firstTr?.system || '',
    subSystem: firstGen?.subSystem || firstDet?.subSystem || firstTr?.subSystem || '',
    unit: siteEntry?.unit || firstGen?.unit || firstDet?.unit || firstTr?.unit || '',
    waybillNo: siteEntry?.waybillNo || firstGen?.billOfLadingNo || firstTr?.billOfLadingNo || '',
    vehicleNo: siteEntry?.vehicleNo || firstGen?.vehicleNo || '',
    driverName: siteEntry?.driverName || firstGen?.driverName || '',
    grossWeight: firstGen?.grossWeight != null ? String(firstGen.grossWeight) : '',
    netWeight: firstGen?.netWeight != null ? String(firstGen.netWeight) : '',
    weighbridgeWeight: firstGen?.weighbridgeWeight != null ? String(firstGen.weighbridgeWeight) : '',
    freightCost: firstGen?.freightCost != null ? String(firstGen.freightCost) : '',
    dimensions:
      firstGen && (firstGen.lengthCm != null || firstGen.widthCm != null || firstGen.heightCm != null)
        ? `${firstGen.lengthCm ?? '-'}×${firstGen.widthCm ?? '-'}×${firstGen.heightCm ?? '-'}`
        : '',
    opiNo: firstDet?.opiNo || firstGen?.opiInvitationNo || '',
    opiDate: fmt(firstDet?.opiDate || firstGen?.opiInvitationDate),
    merNo: firstDet?.merNo || '',
    merStatus: firstDet?.merStatus || '',
    gcvReceiptNo: firstDet?.gcvReceiptNo || '',
    gcvDeliveredQty: firstDet?.gcvDeliveredQty != null ? String(firstDet.gcvDeliveredQty) : '',
    receiver: firstDet?.mivReceiver || firstDet?.receiver || '',
    mivContractorNo: firstDet?.mivContractorNo || '',
    mivContractorDate: fmt(firstDet?.mivContractorDate),
    mivContractorQty: firstDet?.mivContractorQty != null ? String(firstDet.mivContractorQty) : '',
    smrContractorNo: firstDet?.smrContractorNo || '',
    smrContractorDate: fmt(firstDet?.smrContractorDate),
    smrContractorQty: firstDet?.smrContractorQty != null ? String(firstDet.smrContractorQty) : '',
    smrMapnaNo: firstDet?.smrMapnaNo || '',
    smrMapnaDate: fmt(firstDet?.smrMapnaDate),
    smrMapnaQty: firstDet?.smrMapnaQty != null ? String(firstDet.smrMapnaQty) : '',
    smrDeliverer: firstDet?.smrDeliverer || '',
    repNo: firstDet?.repNo || '',
    repStatus: firstDet?.repStatus || '',
    repReprocured: firstDet?.repReprocured || '',
    repDescription: firstDet?.repDescription || '',
    mtoRef: firstDet?.mtoRef || '',
    materialBalanceNo: firstDet?.materialBalanceNo || '',
    balanceStatus: firstDet?.balanceStatus || '',
    stocktakeStatus: firstDet?.stocktakeStatus || '',
    stocktakeDate: fmt(firstDet?.stocktakeDate),
    chemicalType: firstDet?.chemicalType || '',
    expirationDate: fmt(firstDet?.expirationDate),
    overallStatus: firstTr?.overallStatus || '',
    remarks: siteEntry?.notes || firstDet?.notes || '',
  };

  if (manualOverrides) {
    for (const [k, v] of Object.entries(manualOverrides)) {
      if (v !== undefined && v !== '') {
        headerTokens[k] = v;
      }
    }
  }

  let lineRows: Array<Record<string, string>> = [];

  if (primarySource === 'siteEntry' && siteEntry?.items && siteEntry.items.length > 0) {
    lineRows = siteEntry.items.map((it, idx) => ({
      ...headerTokens,
      rowNo: String(idx + 1),
      description: it.description || '',
      packingListNo: it.packingListNo || targetPk,
      packageNo: it.packageNo || '',
      dimensions: it.dimensions || '',
      packingQty: it.qty || '',
      countingUnit: it.unit || '',
      netWeight: it.netWeight || '',
      grossWeight: it.grossWeight || '',
      remarks: it.remarks || '',
    }));
  } else if (primarySource === 'transit' && matchingTransit.length > 0) {
    lineRows = matchingTransit.map((t, idx) => ({
      ...headerTokens,
      rowNo: String(idx + 1),
      packingListNo: t.packingListNo || '',
      packageNo: t.packageNo || '',
      description: t.itemDescription || '',
      supplier: t.supplier || '',
      origin: t.dispatchLocation || '',
      arrivalDate: fmt(t.arrivalDate),
      overallStatus: t.overallStatus || '',
      releaseNoteNo: t.releaseNetNo || '',
      system: t.system || '',
      subSystem: t.subSystem || '',
      unit: t.unit || '',
      waybillNo: t.billOfLadingNo || '',
      remarks: t.mapnaShippingNotice || '',
    }));
  } else if (matchingDet.length > 0 && (usesDetailedOps || primarySource === 'general' || usesSiteEntry)) {
    // Enrich detailed rows with General package dimensions/weights if both general & detailed are bound
    const genByPkg = new Map<string, GeneralEntry>();
    for (const g of matchingGen) {
      if (g.packageNo) genByPkg.set(g.packageNo.trim().toLowerCase(), g);
    }
    lineRows = matchingDet.map((d, idx) => {
      const gMatch = genByPkg.get((d.packageNo || '').trim().toLowerCase()) || firstGen;
      return {
        ...headerTokens,
        rowNo: String(idx + 1),
        packingListNo: d.shipmentNo || targetPk,
        packageNo: d.packageNo || '',
        itemNo: d.itemNo || '',
        itemCode: d.itemCode || '',
        generalDescription: d.generalDescription || '',
        description: d.description || d.generalDescription || '',
        size: d.size || '',
        countingUnit: d.countingUnit || '',
        packingQty: d.packingQty != null ? String(d.packingQty) : '',
        actualQty: d.effectiveActualQty != null ? String(d.effectiveActualQty) : '',
        shortage: d.shortage ? String(d.shortage) : '0',
        surplus: d.surplus ? String(d.surplus) : '0',
        damagedQty: d.damagedQty ? String(d.damagedQty) : '0',
        mapnaInventory: String(d.mapnaInventory ?? 0),
        contractorInventory: String(d.contractorInventory ?? 0),
        storageLocation: d.storageLocation || '',
        opiNo: d.opiNo || gMatch?.opiInvitationNo || '',
        opiDate: fmt(d.opiDate || gMatch?.opiInvitationDate),
        merNo: d.merNo || '',
        merStatus: d.merStatus || '',
        gcvReceiptNo: d.gcvReceiptNo || '',
        gcvDeliveredQty: d.gcvDeliveredQty != null ? String(d.gcvDeliveredQty) : '',
        receiver: d.mivReceiver || d.receiver || '',
        mivContractorNo: d.mivContractorNo || '',
        mivContractorDate: fmt(d.mivContractorDate),
        mivContractorQty: d.mivContractorQty != null ? String(d.mivContractorQty) : '',
        smrContractorNo: d.smrContractorNo || '',
        smrContractorDate: fmt(d.smrContractorDate),
        smrContractorQty: d.smrContractorQty != null ? String(d.smrContractorQty) : '',
        smrMapnaNo: d.smrMapnaNo || '',
        smrMapnaDate: fmt(d.smrMapnaDate),
        smrMapnaQty: d.smrMapnaQty != null ? String(d.smrMapnaQty) : '',
        smrDeliverer: d.smrDeliverer || '',
        repNo: d.repNo || '',
        repStatus: d.repStatus || '',
        repReprocured: d.repReprocured || '',
        repDescription: d.repDescription || '',
        mtoRef: d.mtoRef || '',
        materialBalanceNo: d.materialBalanceNo || '',
        balanceStatus: d.balanceStatus || '',
        stocktakeStatus: d.stocktakeStatus || '',
        stocktakeDate: fmt(d.stocktakeDate),
        chemicalType: d.chemicalType || '',
        expirationDate: fmt(d.expirationDate),
        netWeight: gMatch?.netWeight != null ? String(gMatch.netWeight) : headerTokens.netWeight,
        grossWeight: gMatch?.grossWeight != null ? String(gMatch.grossWeight) : headerTokens.grossWeight,
        remarks: d.notes || '',
      };
    });
  } else if (matchingGen.length > 0) {
    lineRows = matchingGen.map((g, idx) => ({
      ...headerTokens,
      rowNo: String(idx + 1),
      packingListNo: g.packingListNo || '',
      packageNo: g.packageNo || '',
      description: g.itemDescription || '',
      packingQty: g.itemCount != null ? String(g.itemCount) : '',
      netWeight: g.netWeight != null ? String(g.netWeight) : '',
      grossWeight: g.grossWeight != null ? String(g.grossWeight) : '',
      dimensions:
        g.lengthCm != null || g.widthCm != null || g.heightCm != null
          ? `${g.lengthCm ?? '-'}×${g.widthCm ?? '-'}×${g.heightCm ?? '-'}`
          : '',
      supplier: g.supplier || '',
      origin: g.dispatchLocation || '',
      arrivalDate: fmt(g.arrivalDate),
      opiNo: g.opiInvitationNo || '',
      opiDate: fmt(g.opiInvitationDate),
      remarks: g.mapnaEntryMinutesNo || '',
    }));
  } else if (usesTransit && matchingTransit.length > 0) {
    lineRows = matchingTransit.map((t, idx) => ({
      ...headerTokens,
      rowNo: String(idx + 1),
      packingListNo: t.packingListNo || '',
      packageNo: t.packageNo || '',
      description: t.itemDescription || '',
      supplier: t.supplier || '',
      overallStatus: t.overallStatus || '',
    }));
  }

  return { headerTokens, lineRows };
}

export interface RenderedExcelResult {
  model: ParsedExcelModel;
  displayRows: string[][];
  rowHeightsPx: number[];
  injectedRowIndices: Set<number>;
  effectiveMerges: ParsedExcelMerge[];
}

export function buildRenderedExcelGrid(
  form: EmployerUploadedForm,
  headerTokens: Record<string, string>,
  lineRows: Array<Record<string, string>>,
): RenderedExcelResult {
  const model = parseExcelSheetModel(form.fileDataBase64, form.sheetName);
  const ps = form.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS;
  const colCount = Math.max(model.colWidthsPx.length, 1);

  const replacedBaseRows = model.rows.map((row) =>
    row.map((cell) => replaceTokensInText(cell, headerTokens, form.tokenBindings)),
  );

  // Apply bound formula cells from form.detectedFormulas when user bound them to a SAMAAN field
  if (form.detectedFormulas && form.detectedFormulas.length > 0) {
    for (const fItem of form.detectedFormulas) {
      const targetKey = fItem.boundFieldKey;
      if (!targetKey) continue;
      const val = headerTokens[targetKey];
      if (
        val !== undefined &&
        val !== '' &&
        fItem.rowIndex >= 0 &&
        fItem.rowIndex < replacedBaseRows.length &&
        fItem.colIndex >= 0 &&
        fItem.colIndex < colCount
      ) {
        replacedBaseRows[fItem.rowIndex][fItem.colIndex] = val;
      }
    }
  }

  const injectedRowIndices = new Set<number>();
  let finalRows: string[][] = [];
  let effectiveMerges: ParsedExcelMerge[] = model.merges;

  const bindings = form.tableColumnBindings || [];
  const startRow = form.tableStartRowIndex;

  if (
    typeof startRow === 'number' &&
    startRow >= 0 &&
    bindings.length > 0 &&
    lineRows.length > 0
  ) {
    const before = replacedBaseRows.slice(0, startRow);
    const templateRow = replacedBaseRows[startRow] || Array(colCount).fill('');
    const consumesTemplateRow = templateRow.some((c) => c.includes('{{'));
    const afterStart = consumesTemplateRow ? startRow + 1 : startRow;

    // Preserve index mapping for non-empty footer rows after injection so merges stay aligned
    const afterRaw = replacedBaseRows.slice(afterStart);
    const afterKept: string[][] = [];
    const oldRowToNewRow = new Map<number, number>();
    for (let i = 0; i < before.length; i += 1) {
      oldRowToNewRow.set(i, i);
    }

    const populatedRows = lineRows.map((line) => {
      const mergedMap = { ...headerTokens, ...line };
      const rowArr = templateRow.map((cell) =>
        cell.includes('{{') ? replaceTokensInText(cell, mergedMap, form.tokenBindings) : '',
      );
      for (const b of bindings) {
        if (b.colIndex >= 0 && b.colIndex < colCount) {
          const val = mergedMap[b.fieldKey];
          if (val !== undefined) {
            rowArr[b.colIndex] = val;
          }
        }
      }
      return rowArr;
    });

    const footerStartNewIdx = before.length + populatedRows.length;
    for (let i = 0; i < afterRaw.length; i += 1) {
      if (afterRaw[i].some((c) => c.trim() !== '')) {
        oldRowToNewRow.set(afterStart + i, footerStartNewIdx + afterKept.length);
        afterKept.push(afterRaw[i]);
      }
    }

    finalRows = [...before, ...populatedRows, ...afterKept];
    for (let i = 0; i < populatedRows.length; i += 1) {
      injectedRowIndices.add(before.length + i);
    }

    // Re-map template merges so header & footer merges never break after row injection
    effectiveMerges = [];
    for (const m of model.merges) {
      const newStartR = oldRowToNewRow.get(m.s.r);
      const newEndR = oldRowToNewRow.get(m.e.r);
      if (newStartR !== undefined && newEndR !== undefined && newEndR >= newStartR) {
        // Ensure no injected row falls inside this merge
        let overlapsInjected = false;
        for (let rr = newStartR; rr <= newEndR; rr += 1) {
          if (injectedRowIndices.has(rr)) {
            overlapsInjected = true;
            break;
          }
        }
        if (!overlapsInjected) {
          effectiveMerges.push({
            s: { r: newStartR, c: m.s.c },
            e: { r: newEndR, c: m.e.c },
          });
        }
      }
    }
  } else {
    finalRows = replacedBaseRows;
  }

  // Compute span map for merges on final rows
  const rowHeightsPx = finalRows.map((row, rIdx) => {
    const colSpans = row.map((_, cIdx) => {
      if (injectedRowIndices.has(rIdx)) return 1;
      const m = effectiveMerges.find((mg) => mg.s.r === rIdx && mg.s.c === cIdx);
      return m ? m.e.c - m.s.c + 1 : 1;
    });

    if (!ps.autoRowHeight) {
      return model.templateRowHeightsPx[rIdx] || ps.minRowHeightPx;
    }
    return calculateAutoRowHeightPx(
      row,
      model.colWidthsPx,
      ps.fontSizePt,
      ps.minRowHeightPx,
      colSpans,
    );
  });

  return {
    model,
    displayRows: finalRows,
    rowHeightsPx,
    injectedRowIndices,
    effectiveMerges,
  };
}

export async function exportFilledExcel(
  form: EmployerUploadedForm,
  headerTokens: Record<string, string>,
  lineRows: Array<Record<string, string>>,
  downloadName?: string,
): Promise<void> {
  const bytes = base64ToUint8Array(form.fileDataBase64);
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const sheetName =
    form.sheetName && wb.SheetNames.includes(form.sheetName)
      ? form.sheetName
      : wb.SheetNames[0];
  if (!sheetName) return;

  const ws = wb.Sheets[sheetName];
  const ps: UploadedFormPrintSettings = form.printSettings || DEFAULT_UPLOADED_FORM_PRINT_SETTINGS;
  const rendered = buildRenderedExcelGrid(form, headerTokens, lineRows);
  const colCount = rendered.model.colWidthsPx.length;

  // Apply placeholder substitutions on existing cells
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const cell = ws[key];
    if (cell && typeof cell.v === 'string' && cell.v.includes('{{')) {
      const next = replaceTokensInText(cell.v, headerTokens, form.tokenBindings);
      cell.v = next;
      cell.w = next;
      cell.t = 's';
    }
  }

  // Write dynamic table rows if configured
  const bindings = form.tableColumnBindings || [];
  if (typeof form.tableStartRowIndex === 'number' && bindings.length > 0 && lineRows.length > 0) {
    rendered.displayRows.forEach((rowArr, r) => {
      if (!rendered.injectedRowIndices.has(r)) return;
      rowArr.forEach((val, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        ws[addr] = { t: 's', v: val, w: val };
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, rendered.displayRows.length - 1), c: Math.max(0, colCount - 1) },
    });
  }

  // Apply dynamically auto-fitted row heights in Excel points (1px ≈ 0.75pt)
  if (ps.autoRowHeight) {
    ws['!rows'] = rendered.rowHeightsPx.map((px) => ({
      hpt: Math.max(14, Math.ceil(px * 0.75)),
    }));
  }

  // Apply A4 print setup & margins
  ws['!margins'] = {
    left: ps.marginLeftMm / 25.4,
    right: ps.marginRightMm / 25.4,
    top: ps.marginTopMm / 25.4,
    bottom: ps.marginBottomMm / 25.4,
    header: 0.3,
    footer: 0.3,
  };
  (ws as Record<string, unknown>)['!pageSetup'] = {
    paperSize: 9, // A4
    orientation: ps.orientation,
    scale: ps.fitToPageWidth ? undefined : ps.scalePercent,
    fitToWidth: ps.fitToPageWidth ? 1 : 0,
    fitToHeight: 0,
  };

  const outArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([outArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName || `filled-${form.fileName.replace(/\.[^.]+$/, '')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportFilledWord(
  form: EmployerUploadedForm,
  headerTokens: Record<string, string>,
  downloadName?: string,
): Promise<void> {
  const bytes = base64ToUint8Array(form.fileDataBase64);
  const zip = await JSZip.loadAsync(bytes);
  const xmlFiles = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name),
  );

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  for (const name of xmlFiles) {
    const rawXml = await zip.files[name].async('string');
    const doc = parser.parseFromString(rawXml, 'application/xml');
    const paras = Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === 'p');

    let changed = false;
    for (const p of paras) {
      const fullText = getDirectParagraphText(p);
      if (!fullText.includes('{{')) continue;
      const runs = Array.from(p.children).filter((el) => el.localName === 'r');
      if (runs.length === 0) continue;

      // Consolidate runs containing split {{...}} tokens so XML formatting is preserved while values replace cleanly
      const runTexts = runs.map((r) => {
        const ts = Array.from(r.getElementsByTagName('*')).filter((n) => n.localName === 't');
        return ts.map((t) => t.textContent || '').join('');
      });

      const firstRunHasToken = runTexts.some((rt) => /\{\{[^{}]+\}\}/.test(rt));
      if (firstRunHasToken) {
        runs.forEach((r) => {
          const ts = Array.from(r.getElementsByTagName('*')).filter((n) => n.localName === 't');
          ts.forEach((t) => {
            if (t.textContent && t.textContent.includes('{{')) {
              t.textContent = replaceTokensInText(t.textContent, headerTokens, form.tokenBindings);
              changed = true;
            }
          });
        });
      }

      // Check if tokens are split across multiple runs inside this paragraph
      const afterSinglePass = getDirectParagraphText(p);
      if (afterSinglePass.includes('{{')) {
        const replacedWhole = replaceTokensInText(afterSinglePass, headerTokens, form.tokenBindings);
        if (replacedWhole !== afterSinglePass) {
          // Put merged text into first run's first <w:t> and clear remaining <w:t> nodes
          const firstTs = Array.from(runs[0].getElementsByTagName('*')).filter((n) => n.localName === 't');
          if (firstTs[0]) {
            firstTs[0].setAttribute('xml:space', 'preserve');
            firstTs[0].textContent = replacedWhole;
            for (let i = 1; i < firstTs.length; i += 1) firstTs[i].textContent = '';
            for (let r = 1; r < runs.length; r += 1) {
              const otherTs = Array.from(runs[r].getElementsByTagName('*')).filter((n) => n.localName === 't');
              otherTs.forEach((t) => {
                t.textContent = '';
              });
            }
            changed = true;
          }
        }
      }
    }

    if (changed) {
      zip.file(name, serializer.serializeToString(doc));
    } else if (rawXml.includes('{{')) {
      const fallback = rawXml.replace(/\{\{\s*([^{}<]+?)\s*\}\}/g, (full, nameStr: string) =>
        escapeXml(replaceTokensInText(`{{${nameStr}}}`, headerTokens, form.tokenBindings)),
      );
      zip.file(name, fallback);
    }
  }

  const outBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(outBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName || `filled-${form.fileName.replace(/\.[^.]+$/, '')}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
