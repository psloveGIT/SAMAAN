import { inferGeneralDescription } from './generalDescription.ts';
import { getTodayIso, normalizeDigits, parseFlexibleDateToIso } from './jalali.ts';
import { normalizeCountingUnitToFa } from './normalizers.ts';
import { parseCsvMatrix, parseDetailedCsv, parseGeneralCsv } from './csvParser.ts';
import type { CalendarMode, DetailedEntry } from './types.ts';

export interface SmartGeneralPackageLine {
  packageNo?: string;
  packageType?: string;
  itemCount?: number | null;
  itemDescription?: string;
  island?: string;
  system?: string;
  subSystem?: string;
  unit?: string;
  grossWeight?: number | null;
  netWeight?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface GeneralAiExtractionResult {
  summary?: string;
  packingListNo?: string;
  arrivalDate?: string;
  releaseNo?: string;
  releaseDate?: string;
  supplier?: string;
  dispatchLocation?: string;
  employerEntryMinutesNo?: string;
  mapnaEntryMinutesNo?: string;
  billOfLadingNo?: string;
  vehicleNo?: string;
  weighbridgeWeight?: number | null;
  freightCost?: number | null;
  opiInvitationNo?: string;
  opiInvitationDate?: string;
  driverName?: string;
  packages?: SmartGeneralPackageLine[];
  offlineFallback?: boolean;
  missingFields?: string[];
}

export interface DetailedAiExtractionResult {
  summary?: string;
  shipmentNo?: string;
  packageNo?: string;
  arrivalDate?: string;
  supplier?: string;
  origin?: string;
  island?: string;
  system?: string;
  subSystem?: string;
  unit?: string;
  storageLocation?: string;
  receiver?: string;
  items?: Array<{
    itemNo?: string;
    description?: string;
    generalDescription?: string;
    itemCode?: string;
    size?: string;
    packingQty?: number | null;
    countingUnit?: string;
    itemCategory?: DetailedEntry['itemCategory'];
    chemicalType?: string;
    productionDate?: string;
    expirationDate?: string;
    notes?: string;
  }>;
  offlineFallback?: boolean;
  missingFields?: string[];
}

function cleanText(raw: string): string {
  return normalizeDigits(raw || '')
    .replace(/\u200c/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractRegexGroup(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const val = m[1].trim().replace(/[،,.;:]+$/, '').trim();
      if (val) return val;
    }
  }
  return '';
}

function extractNumberGroup(text: string, patterns: RegExp[]): number | null {
  const s = extractRegexGroup(text, patterns);
  if (!s) return null;
  const clean = normalizeDigits(s).replace(/[,،٬\s]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function extractVehiclePlate(text: string): string {
  const m = text.match(
    /(\d{1,2})\s*(?:ایران|iran|ir)?\s*(\d{3})\s*([\u0600-\u06FF])\s*(\d{2})/i,
  );
  if (m) {
    return `${m[1]} ایران ${m[2]} ${m[3]} ${m[4]}`;
  }
  return extractRegexGroup(text, [
    /(?:پلاک|شماره خودرو|خودرو|vehicle(?:\s*no)?|plate)\s*[:：=]?\s*([^\n،,]+)/i,
  ]);
}

function decodeBase64ToText(base64Data: string, mimeType = ''): string {
  try {
    const cleaned = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const binary =
      typeof atob === 'function'
        ? atob(cleaned)
        : Buffer.from(cleaned, 'base64').toString('latin1');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (mimeType.includes('pdf') || binary.startsWith('%PDF')) {
      // Extract readable literal strings / UTF-8 fragments from PDF stream
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const chunks: string[] = [];
      const parenRe = /\(([^()]{2,200})\)/g;
      let match: RegExpExecArray | null = parenRe.exec(decoded);
      while (match) {
        const inner = match[1].replace(/\\([()\\])/g, '$1').trim();
        if (/[A-Za-z0-9\u0600-\u06FF]/.test(inner)) {
          chunks.push(inner);
        }
        match = parenRe.exec(decoded);
      }
      if (chunks.length > 0) return chunks.join('\n');
      return decoded.replace(/[^\x20-\x7E\u0600-\u06FF\n]/g, ' ');
    }

    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function detectDateInText(text: string, calendar: CalendarMode = 'jalali'): string {
  const m = text.match(/(?:تاریخ(?:\s+ورود)?|arrival\s*date|date)\s*[:：=]?\s*([0-9\u06F0-\u06F9]{2,4}[./-][0-9\u06F0-\u06F9]{1,2}[./-][0-9\u06F0-\u06F9]{1,2}|امروز|today)/i);
  if (m && m[1]) {
    const raw = m[1].trim();
    if (raw === 'امروز' || raw.toLowerCase() === 'today') return getTodayIso();
    const parsed = parseFlexibleDateToIso(raw, calendar);
    if (parsed) return parsed;
  }
  const bare = text.match(/\b(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/);
  if (bare) {
    return parseFlexibleDateToIso(bare[1], calendar);
  }
  if (/امروز|\btoday\b/i.test(text)) {
    return getTodayIso();
  }
  return '';
}

function tryTabularParse(
  text: string,
  target: 'general' | 'detailed',
  calendar: CalendarMode,
): GeneralAiExtractionResult | DetailedAiExtractionResult | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  // Detect tab or comma separated lines
  const isTsv = lines[0].includes('\t') && lines[1].includes('\t');
  const isCsv = lines[0].includes(',') && lines[1].includes(',');
  if (!isTsv && !isCsv) return null;

  const matrix = isTsv
    ? lines.map((l) => l.split('\t').map((c) => c.trim()))
    : parseCsvMatrix(text);

  if (matrix.length < 2) return null;

  if (target === 'general') {
    const parsed = parseGeneralCsv(matrix, calendar, 'smart-offline');
    if (parsed.rows.length === 0) return null;
    const first = parsed.rows[0];
    return {
      summary: `استخراج ${parsed.rows.length} نگله از فایل جدولی`,
      packingListNo: first.packingListNo,
      arrivalDate: first.arrivalDate,
      releaseNo: first.releaseNo,
      releaseDate: first.releaseDate,
      supplier: first.supplier,
      dispatchLocation: first.dispatchLocation,
      employerEntryMinutesNo: first.employerEntryMinutesNo,
      mapnaEntryMinutesNo: first.mapnaEntryMinutesNo,
      billOfLadingNo: first.billOfLadingNo,
      vehicleNo: first.vehicleNo,
      weighbridgeWeight: first.weighbridgeWeight,
      freightCost: first.freightCost,
      opiInvitationNo: first.opiInvitationNo,
      opiInvitationDate: first.opiInvitationDate,
      driverName: first.driverName,
      packages: parsed.rows.map((r) => ({
        packageNo: r.packageNo,
        packageType: r.packageType,
        itemCount: r.itemCount,
        itemDescription: r.itemDescription,
        island: r.island,
        system: r.system,
        subSystem: r.subSystem,
        unit: r.unit,
        grossWeight: r.grossWeight,
        netWeight: r.netWeight,
        lengthCm: r.lengthCm,
        widthCm: r.widthCm,
        heightCm: r.heightCm,
      })),
      offlineFallback: true,
    };
  }

  const parsed = parseDetailedCsv(matrix, calendar, 'smart-offline');
  if (parsed.rows.length === 0) return null;
  const first = parsed.rows[0];
  return {
    summary: `استخراج ${parsed.rows.length} قلم از فایل جدولی`,
    shipmentNo: first.shipmentNo,
    packageNo: first.packageNo,
    arrivalDate: first.arrivalDate,
    supplier: first.supplier,
    origin: first.origin,
    island: first.island,
    system: first.system,
    subSystem: first.subSystem,
    unit: first.unit,
    storageLocation: first.storageLocation,
    receiver: first.receiver,
    items: parsed.rows.map((r) => ({
      itemNo: r.itemNo,
      description: r.description,
      generalDescription: r.generalDescription || inferGeneralDescription(r.description),
      itemCode: r.itemCode,
      size: r.size,
      packingQty: r.packingQty,
      countingUnit: r.countingUnit || 'PC',
      itemCategory: r.itemCategory || '',
      chemicalType: r.chemicalType || '',
      productionDate: r.productionDate || '',
      expirationDate: r.expirationDate || '',
      notes: r.notes,
    })),
    offlineFallback: true,
  };
}

/**
 * Fully offline deterministic extractor supporting voice commands, pasted/uploaded text,
 * CSV/TSV files, and basic PDF text extraction — works without any network or API key.
 */
export function extractEquipmentOffline(params: {
  target: 'general' | 'detailed';
  mode?: 'file' | 'scan' | 'voice';
  textData?: string;
  base64Data?: string;
  mimeType?: string;
  calendar?: CalendarMode;
}): GeneralAiExtractionResult | DetailedAiExtractionResult {
  const calendar = params.calendar || 'jalali';
  const combinedRaw = [
    params.textData || '',
    params.base64Data ? decodeBase64ToText(params.base64Data, params.mimeType) : '',
  ]
    .filter(Boolean)
    .join('\n');

  const tabular = tryTabularParse(combinedRaw, params.target, calendar);
  if (tabular) return tabular;

  const text = cleanText(combinedRaw);
  const stopLookahead =
    '(?=\\s*(?:تامین|تأمین|محل ارسال|مبدا|تاریخ|نگله|پکیج|نوع بسته|تعداد اقلام|تعداد|مقدار|شرح کلی|شرح|جزیره|سیستم|ساب سیستم|واحد|بارنامه|پلاک|خودرو|راننده|کرایه|وزن|طول|عرض|ارتفاع|کد کالا|سایز|صورتجلسه|مواد|انقضا|تولید|supplier|origin|dispatch|package|packing|item|qty|quantity|island|system|unit|weight|$|\\n|،|,))';

  const packingListNo = extractRegexGroup(text, [
    new RegExp(`(?:شماره\\s*)?(?:پکینگ\\s*لیست|پکینگ|محموله|packing\\s*list(?:\\s*no)?|shipment(?:\\s*no)?|pl)\\s*[:：=#]?\\s*([A-Za-z0-9_/-]+)`, 'i'),
  ]);
  const packageNo = extractRegexGroup(text, [
    new RegExp(`(?:شماره\\s*)?(?:نگله|بسته|package\\s*(?:no|#)?|pkg)\\s*[:：=#]?\\s*([A-Za-z0-9_/-]+)`, 'i'),
  ]);
  const supplier = extractRegexGroup(text, [
    new RegExp(`(?:تامین\\s*کننده|تأمین\\s*کننده|فروشنده|supplier|vendor)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const dispatchLocation = extractRegexGroup(text, [
    new RegExp(`(?:محل\\s*ارسال|مبدا|مبدأ|شهر\\s*ارسال|dispatch(?:\\s*location)?|origin|from)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const arrivalDate = detectDateInText(text, calendar);
  const island = extractRegexGroup(text, [
    new RegExp(`(?:جزیره|island)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const subSystem = extractRegexGroup(text, [
    new RegExp(`(?:ساب\\s*سیستم|sub\\s*-?\\s*system)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const system = extractRegexGroup(text, [
    new RegExp(`(?:سیستم|system)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const unit = extractRegexGroup(text, [
    new RegExp(`(?:واحد\\s*نیروگاهی|واحد|unit)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);

  if (params.target === 'general') {
    const packageType = extractRegexGroup(text, [
      new RegExp(`(?:نوع\\s*بسته\\s*بندی|بسته\\s*بندی|package\\s*type)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
    ]);
    const itemCount = extractNumberGroup(text, [
      /(?:تعداد\s*اقلام\s*نگله|تعداد\s*اقلام|item\s*count)\s*[:：=]?\s*([\d,،.]+)/i,
    ]);
    const itemDescription = extractRegexGroup(text, [
      new RegExp(`(?:شرح\\s*کالا|توضیح\\s*کالا|کالا|description)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
    ]);
    const grossWeight = extractNumberGroup(text, [
      /(?:وزن\s*(?:پکینگ\s*)?ناخالص|gross(?:\s*weight)?)\s*[:：=]?\s*([\d,،.]+)/i,
    ]);
    const netWeight = extractNumberGroup(text, [
      /(?:وزن\s*(?:پکینگ\s*)?خالص|net(?:\s*weight)?)\s*[:：=]?\s*([\d,،.]+)/i,
    ]);
    const lengthCm = extractNumberGroup(text, [/(?:طول|length)\s*[:：=]?\s*([\d.]+)/i]);
    const widthCm = extractNumberGroup(text, [/(?:عرض|width)\s*[:：=]?\s*([\d.]+)/i]);
    const heightCm = extractNumberGroup(text, [/(?:ارتفاع|height)\s*[:：=]?\s*([\d.]+)/i]);
    const employerEntryMinutesNo = extractRegexGroup(text, [
      /(?:صورتجلسه(?:\s*ورود)?\s*کارفرما|employer\s*minutes(?:\s*no)?)\s*[:：=]?\s*(\d+)/i,
    ]);
    const mapnaEntryMinutesNo = extractRegexGroup(text, [
      /(?:صورتجلسه(?:\s*ورود)?\s*مپنا|mapna\s*minutes(?:\s*no)?)\s*[:：=]?\s*(\d+)/i,
    ]);
    const billOfLadingNo = extractRegexGroup(text, [
      /(?:شماره\s*بارنامه|بارنامه|waybill|bl)\s*[:：=#]?\s*([A-Za-z0-9_/-]+)/i,
    ]);
    const vehicleNo = extractVehiclePlate(text);
    const freightCost = extractNumberGroup(text, [
      /(?:مبلغ\s*کرایه\s*حمل|کرایه\s*حمل|freight(?:\s*cost)?)\s*[:：=]?\s*([\d,،٬]+)/i,
    ]);
    const driverName = extractRegexGroup(text, [
      new RegExp(`(?:نام\\s*راننده|راننده|driver)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
    ]);

    const pkgLine: SmartGeneralPackageLine = {
      packageNo: packageNo || (packingListNo ? '1' : ''),
      packageType,
      itemCount,
      itemDescription: itemDescription || (!packingListNo && text.length < 180 ? text : ''),
      island,
      system,
      subSystem,
      unit,
      grossWeight,
      netWeight,
      lengthCm,
      widthCm,
      heightCm,
    };

    return {
      summary: 'استخراج آفلاین مشخصات پکینگ لیست (پیش از ثبت می‌توانید فیلدها را بررسی و تکمیل کنید)',
      packingListNo,
      arrivalDate,
      supplier,
      dispatchLocation,
      employerEntryMinutesNo,
      mapnaEntryMinutesNo,
      billOfLadingNo,
      vehicleNo,
      freightCost,
      driverName,
      packages: [pkgLine],
      offlineFallback: true,
    };
  }

  // Detailed target extraction
  const itemNo = extractRegexGroup(text, [
    /(?:شماره\s*آیتم|آیتم|ردیف\s*آیتم|item\s*(?:no|#))\s*[:：=#]?\s*([A-Za-z0-9_/-]+)/i,
  ]) || '1';
  const description = extractRegexGroup(text, [
    new RegExp(`(?:شرح\\s*کالا|شرح\\s*دقیق|شرح|description)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const generalDescription =
    extractRegexGroup(text, [
      new RegExp(`(?:شرح\\s*کلی|general\\s*description)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
    ]) || inferGeneralDescription(description);
  const itemCode = extractRegexGroup(text, [
    /(?:کد\s*کالا|item\s*code|tag(?:\s*no)?)\s*[:：=#]?\s*([A-Za-z0-9_./-]+)/i,
  ]);
  const size = extractRegexGroup(text, [
    new RegExp(`(?:سایز|ابعاد|size)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const packingQty = extractNumberGroup(text, [
    /(?:مقدار\s*پکینگ|تعداد|مقدار|qty|quantity)\s*[:：=]?\s*([\d,،.]+)/i,
  ]);
  const countingUnit =
    normalizeCountingUnitToFa(
      extractRegexGroup(text, [
        /(?:واحد\s*شمارش|uom|counting\s*unit)\s*[:：=]?\s*([A-Za-z\u0600-\u06FF]+)/i,
      ]),
    ) || 'عدد';

  let itemCategory: DetailedEntry['itemCategory'] = '';
  if (/ماده\s*شیمیایی|مواد\s*شیمیایی|chemical/i.test(text)) itemCategory = 'chemicals';
  else if (/ابزار\s*(?:های\s*)?مخصوص|special\s*tool/i.test(text)) itemCategory = 'special_tools';
  else if (/لوازم\s*یدکی|قطعه\s*یدکی|spare\s*part/i.test(text)) itemCategory = 'spare_parts';

  const chemicalType = extractRegexGroup(text, [
    new RegExp(`(?:نوع\\s*ماده\\s*شیمیایی|ماده\\s*شیمیایی|chemical\\s*type)\\s*[:：=]?\\s*([^\\n]+?)${stopLookahead}`, 'i'),
  ]);
  const prodRaw = extractRegexGroup(text, [
    /(?:تاریخ\s*تولید|production\s*date|mfg)\s*[:：=]?\s*([0-9\u06F0-\u06F9]{2,4}[./-][0-9\u06F0-\u06F9]{1,2}[./-][0-9\u06F0-\u06F9]{1,2})/i,
  ]);
  const expRaw = extractRegexGroup(text, [
    /(?:تاریخ\s*انقضا(?:ء)?|انقضا(?:ء)?|exp(?:iration)?(?:\s*date)?)\s*[:：=]?\s*([0-9\u06F0-\u06F9]{2,4}[./-][0-9\u06F0-\u06F9]{1,2}[./-][0-9\u06F0-\u06F9]{1,2})/i,
  ]);

  return {
    summary: 'استخراج آفلاین اقلام تجهیز (پیش از ثبت می‌توانید فیلدهای ناقص را تکمیل کنید)',
    shipmentNo: packingListNo,
    packageNo,
    arrivalDate,
    supplier,
    origin: dispatchLocation,
    island,
    system,
    subSystem,
    unit,
    items: [
      {
        itemNo,
        description: description || (!packingListNo && text.length < 180 ? text : ''),
        generalDescription,
        itemCode,
        size,
        packingQty,
        countingUnit,
        itemCategory,
        chemicalType,
        productionDate: prodRaw ? parseFlexibleDateToIso(prodRaw, calendar) : '',
        expirationDate: expRaw ? parseFlexibleDateToIso(expRaw, calendar) : '',
      },
    ],
    offlineFallback: true,
  };
}
