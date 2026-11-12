import { normalizeDigits, parseFlexibleDateToIso } from './jalali.ts';
import type { CalendarMode, DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

export type ImportScope = 'general' | 'detailed' | 'transit';

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
  const s = (val || '').replace(/\s+/g, ' ').trim();
  if (s === '-' || s === '—') return '';
  return s;
}

function parseNum(val: string | undefined): number | null {
  const raw = normalizeDigits((val || '').trim())
    .replace(/,/g, '')
    .replace(/٬/g, '')
    .trim();
  if (!raw || raw === '-' || raw === '—') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeHeaderText(h: string): string {
  return (h || '').replace(/\s+/g, ' ').trim();
}

export function detectCsvScope(matrix: string[][]): ImportScope | null {
  const previewText = matrix
    .slice(0, 8)
    .map((r) => r.join(' '))
    .join(' ');
  if (previewText.includes('شماره صورتجلسه ورود') || previewText.includes('وزن پکینگ')) {
    return 'general';
  }
  if (
    previewText.includes('مقدار پکینگ') ||
    previewText.includes('شماره بالانس متریال') ||
    previewText.includes('شماره رسید')
  ) {
    return 'detailed';
  }
  if (
    previewText.includes('در دست حمل') ||
    previewText.includes('رلیزنت') ||
    previewText.includes('علی الحساب')
  ) {
    return 'transit';
  }
  return null;
}

function findDataStartAndHeaders(
  matrix: string[][],
  scope: ImportScope,
): { headerMap: Record<string, number>; dataStartIndex: number } {
  const headerRows = matrix.slice(0, Math.min(6, matrix.length));
  const combinedCols: string[] = [];
  const maxCols = Math.max(...headerRows.map((r) => r.length), 0);

  let dataStartIndex = 0;
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

  if (dataStartIndex === 0) {
    dataStartIndex = 4;
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

  return { headerMap, dataStartIndex };
}

function findCol(
  combinedCols: string[],
  candidates: string[],
  fallbackIndex?: number,
): number {
  for (const cand of candidates) {
    const idx = combinedCols.findIndex((h) => h.includes(cand));
    if (idx !== -1) return idx;
  }
  return fallbackIndex !== undefined ? fallbackIndex : -1;
}

export function parseGeneralCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
): { rows: Omit<GeneralEntry, 'id'>[]; skippedEmpty: number } {
  const { dataStartIndex } = findDataStartAndHeaders(matrix, 'general');
  const headerSlice = matrix.slice(0, dataStartIndex);
  const maxCols = Math.max(...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length), 28);
  const combinedCols: string[] = [];
  for (let c = 0; c < maxCols; c += 1) {
    combinedCols[c] = headerSlice
      .map((r) => normalizeHeaderText(r[c] || ''))
      .filter((t) => t && !/^\d+$/.test(t))
      .join(' | ');
  }

  const idxRowNo = findCol(combinedCols, ['ردیف'], 0);
  const idxArrivalDate = findCol(combinedCols, ['تاریخ ورود'], 1);
  const idxReleaseNo = findCol(combinedCols, ['شماره رلیز'], 2);
  const idxReleaseDate = findCol(combinedCols, ['| تاریخ', 'تاریخ'], 3);
  const idxSupplier = findCol(combinedCols, ['تامین کننده'], 4);
  const idxDispatch = findCol(combinedCols, ['محل ارسال'], 5);
  const idxEmployerMin = findCol(combinedCols, ['کارفرما'], 6);
  const idxMapnaMin = findCol(combinedCols, ['مپنا'], 7);
  const idxPackingList = findCol(combinedCols, ['شماره پکینگ لیست'], 8);
  const idxPackageNo = findCol(combinedCols, ['شماره نگله'], 9);
  const idxDesc = findCol(combinedCols, ['شرح کالا'], 10);
  const idxIsland = findCol(combinedCols, ['جزیره'], 11);
  const idxSystem = findCol(combinedCols, ['سیستم'], 12);
  const idxSubSystem = findCol(combinedCols, ['ساب سیستم'], 13);
  const idxUnit = findCol(combinedCols, ['واحد'], 14);
  const idxGross = findCol(combinedCols, ['ناخالص'], 15);
  const idxNet = findCol(combinedCols, ['خالص'], 16);
  const idxLen = findCol(combinedCols, ['طول'], 17);
  const idxWidth = findCol(combinedCols, ['عرض'], 18);
  const idxHeight = findCol(combinedCols, ['ارتفاع'], 19);
  const idxWaybill = findCol(combinedCols, ['شماره بارنامه'], 20);
  const idxVehicle = findCol(combinedCols, ['شماره خودرو'], 21);
  const idxWeighbridge = findCol(combinedCols, ['وزن باسکول'], 22);
  const idxFreight = findCol(combinedCols, ['مبلغ کرایه حمل'], 23);
  const idxOpiNo = findCol(combinedCols, ['شماره دعوتنامه OPI'], 24);
  const idxOpiDate = findCol(combinedCols, ['تاریخ دعوتنامه OPI'], 25);
  const idxDriver = findCol(combinedCols, ['نام راننده'], 26);

  const now = new Date().toISOString();
  const rows: Omit<GeneralEntry, 'id'>[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r];
    const packingListNo = cleanStr(line[idxPackingList]);
    const itemDescription = cleanStr(line[idxDesc]);
    const packageNo = cleanStr(line[idxPackageNo]);
    if (!packingListNo && !itemDescription && !packageNo) {
      skippedEmpty += 1;
      continue;
    }

    const rawRowNo = normalizeDigits(cleanStr(line[idxRowNo]));
    rows.push({
      rowNo: rawRowNo,
      arrivalDate: parseFlexibleDateToIso(line[idxArrivalDate] || '', assumedCalendar),
      releaseNo: cleanStr(line[idxReleaseNo]),
      releaseDate: parseFlexibleDateToIso(line[idxReleaseDate] || '', assumedCalendar),
      supplier: cleanStr(line[idxSupplier]),
      dispatchLocation: cleanStr(line[idxDispatch]),
      employerEntryMinutesNo: cleanStr(line[idxEmployerMin]),
      mapnaEntryMinutesNo: cleanStr(line[idxMapnaMin]),
      packingListNo,
      packageNo,
      itemDescription,
      island: cleanStr(line[idxIsland]),
      system: cleanStr(line[idxSystem]),
      subSystem: cleanStr(line[idxSubSystem]),
      unit: cleanStr(line[idxUnit]),
      grossWeight: parseNum(line[idxGross]),
      netWeight: parseNum(line[idxNet]),
      lengthCm: parseNum(line[idxLen]),
      widthCm: parseNum(line[idxWidth]),
      heightCm: parseNum(line[idxHeight]),
      billOfLadingNo: cleanStr(line[idxWaybill]),
      vehicleNo: cleanStr(line[idxVehicle]),
      weighbridgeWeight: parseNum(line[idxWeighbridge]),
      freightCost: parseNum(line[idxFreight]),
      opiInvitationNo: cleanStr(line[idxOpiNo]),
      opiInvitationDate: parseFlexibleDateToIso(line[idxOpiDate] || '', assumedCalendar),
      driverName: cleanStr(line[idxDriver]),
      createdAt: now,
      updatedAt: now,
      createdBy,
    });
  }

  return { rows, skippedEmpty };
}

export function parseDetailedCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
): { rows: Omit<DetailedEntry, 'id'>[]; skippedEmpty: number } {
  const { dataStartIndex } = findDataStartAndHeaders(matrix, 'detailed');
  const headerSlice = matrix.slice(0, dataStartIndex);
  const maxCols = Math.max(...matrix.slice(0, Math.min(20, matrix.length)).map((r) => r.length), 52);
  const combinedCols: string[] = [];
  for (let c = 0; c < maxCols; c += 1) {
    combinedCols[c] = headerSlice
      .map((r) => normalizeHeaderText(r[c] || ''))
      .filter((t) => t && !/^\d+$/.test(t))
      .join(' | ');
  }

  const hasRahkaran = combinedCols.some((h) => h.includes('کد راهکاران'));
  const offset = hasRahkaran ? 0 : -1;

  const idxRowNo = findCol(combinedCols, ['ردیف'], 0);
  const idxArrivalDate = findCol(combinedCols, ['تاریخ ورود'], 1);
  const idxSupplier = findCol(combinedCols, ['تامین کننده'], 2);
  const idxOrigin = findCol(combinedCols, ['مبدا'], 3);
  const idxShipmentNo = findCol(combinedCols, ['شماره محموله'], 4);
  const idxPackageNo = findCol(combinedCols, ['شماره نگله'], 5);
  const idxItemNo = findCol(combinedCols, ['شماره آیتم'], 6);
  const idxGenDesc = findCol(combinedCols, ['شرح کلی'], 7);
  const idxDesc = findCol(combinedCols, ['| شرح'], 8);
  const idxSize = findCol(combinedCols, ['سایز'], 9);
  const idxItemCode = findCol(combinedCols, ['کد کالا'], 10);
  const idxPackingQty = findCol(combinedCols, ['مقدار پکینگ'], 12 + offset);
  const idxActualQty = findCol(combinedCols, ['مقدار واقعی'], 13 + offset);
  const idxDamagedQty = findCol(combinedCols, ['آسیب دیده']);
  const idxMto = findCol(combinedCols, ['MTO']);
  const idxRepNo = findCol(combinedCols, ['شماره REP'], 16 + offset);
  const idxRepStatus = findCol(combinedCols, ['وضعیت REP'], 17 + offset);
  const idxRepDesc = findCol(combinedCols, ['توضیحات REP'], 18 + offset);
  const idxCountingUnit = findCol(combinedCols, ['واحد شمارش'], 19 + offset);
  const idxIsland = findCol(combinedCols, ['جزیره'], 20 + offset);
  const idxSystem = findCol(combinedCols, ['سیستم'], 21 + offset);
  const idxSubSystem = findCol(combinedCols, ['ساب سیستم'], 22 + offset);
  const idxUnit = findCol(combinedCols, ['| واحد'], 23 + offset);
  const idxOpiNo = findCol(combinedCols, ['شماره OPI'], 24 + offset);
  const idxOpiDate = findCol(combinedCols, ['تاریخ OPI'], 25 + offset);
  const idxMerNo = findCol(combinedCols, ['شماره MER'], 26 + offset);
  const idxMerStatus = findCol(combinedCols, ['وضعیت MER'], 27 + offset);
  const idxNotes = findCol(combinedCols, ['| توضیحات'], 28 + offset);
  const idxBalanceStatus = findCol(combinedCols, ['وضعیت بالانس'], 29 + offset);
  const idxStorageLoc = findCol(combinedCols, ['محل نگهداری'], 30 + offset);
  const idxGcvNo = findCol(combinedCols, ['GCV'], 31 + offset);
  const idxReceiver = findCol(combinedCols, ['تحویل گیرنده'], 32 + offset);
  const idxGcvQty = findCol(combinedCols, ['GCV |', 'مقدار تحویل شده'], 33 + offset);
  const idxMivConNo = findCol(combinedCols, ['پیمانکار', 'شماره MIV'], 35 + offset);
  const idxMivConDate = 36 + offset;
  const idxMivConQty = 37 + offset;
  const idxSmrConNo = 39 + offset;
  const idxSmrConDate = 40 + offset;
  const idxSmrConQty = 41 + offset;
  const idxSmrConNote = 42 + offset;
  const idxBalNo = findCol(combinedCols, ['شماره بالانس متریال'], 43 + offset);
  const idxSmrMapNo = 44 + offset;
  const idxSmrMapDate = 45 + offset;
  const idxSmrMapQty = 46 + offset;
  const idxSmrMapNote = 47 + offset;
  const idxMivMapNo = 48 + offset;
  const idxMivMapDate = 49 + offset;
  const idxMivMapQty = 50 + offset;
  const idxStocktake = findCol(combinedCols, ['انبار گردانی', 'تاریخ تولید'], 51 + offset);

  const now = new Date().toISOString();
  const rows: Omit<DetailedEntry, 'id'>[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r];
    const shipmentNo = cleanStr(line[idxShipmentNo]);
    const description = cleanStr(line[idxDesc]);
    const generalDescription = cleanStr(line[idxGenDesc]);
    if (!shipmentNo && !description && !generalDescription) {
      skippedEmpty += 1;
      continue;
    }

    rows.push({
      rowNo: normalizeDigits(cleanStr(line[idxRowNo])),
      arrivalDate: parseFlexibleDateToIso(line[idxArrivalDate] || '', assumedCalendar),
      supplier: cleanStr(line[idxSupplier]),
      origin: cleanStr(line[idxOrigin]),
      shipmentNo,
      packageNo: cleanStr(line[idxPackageNo]),
      itemNo: cleanStr(line[idxItemNo]),
      generalDescription,
      description,
      size: cleanStr(line[idxSize]),
      itemCode: cleanStr(line[idxItemCode]),
      packingQty: parseNum(line[idxPackingQty]),
      actualQty: parseNum(line[idxActualQty]),
      damagedQty: idxDamagedQty >= 0 ? parseNum(line[idxDamagedQty]) : null,
      mtoRef: idxMto >= 0 ? cleanStr(line[idxMto]) : '',
      repNo: cleanStr(line[idxRepNo]),
      repStatus: cleanStr(line[idxRepStatus]),
      repDescription: cleanStr(line[idxRepDesc]),
      countingUnit: cleanStr(line[idxCountingUnit]),
      island: cleanStr(line[idxIsland]),
      system: cleanStr(line[idxSystem]),
      subSystem: cleanStr(line[idxSubSystem]),
      unit: cleanStr(line[idxUnit]),
      opiNo: cleanStr(line[idxOpiNo]),
      opiDate: parseFlexibleDateToIso(line[idxOpiDate] || '', assumedCalendar),
      merNo: cleanStr(line[idxMerNo]),
      merStatus: cleanStr(line[idxMerStatus]),
      notes: cleanStr(line[idxNotes]),
      materialBalanceNo: cleanStr(line[idxBalNo]),
      balanceStatus: cleanStr(line[idxBalanceStatus]),
      storageLocation: cleanStr(line[idxStorageLoc]),
      gcvReceiptNo: cleanStr(line[idxGcvNo]),
      receiver: cleanStr(line[idxReceiver]),
      gcvDeliveredQty: parseNum(line[idxGcvQty]),
      mivContractorNo: cleanStr(line[idxMivConNo]),
      mivContractorDate: parseFlexibleDateToIso(line[idxMivConDate] || '', assumedCalendar),
      mivContractorQty: parseNum(line[idxMivConQty]),
      smrContractorNo: cleanStr(line[idxSmrConNo]),
      smrContractorDate: parseFlexibleDateToIso(line[idxSmrConDate] || '', assumedCalendar),
      smrContractorQty: parseNum(line[idxSmrConQty]),
      smrContractorNote: cleanStr(line[idxSmrConNote]),
      smrMapnaNo: cleanStr(line[idxSmrMapNo]),
      smrMapnaDate: parseFlexibleDateToIso(line[idxSmrMapDate] || '', assumedCalendar),
      smrMapnaQty: parseNum(line[idxSmrMapQty]),
      smrMapnaNote: cleanStr(line[idxSmrMapNote]),
      mivMapnaNo: cleanStr(line[idxMivMapNo]),
      mivMapnaDate: parseFlexibleDateToIso(line[idxMivMapDate] || '', assumedCalendar),
      mivMapnaQty: parseNum(line[idxMivMapQty]),
      stocktakeInfo: cleanStr(line[idxStocktake]),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy,
    });
  }

  return { rows, skippedEmpty };
}

export function parseTransitCsv(
  matrix: string[][],
  assumedCalendar: CalendarMode,
  createdBy: string,
): { rows: Omit<TransitEntry, 'id'>[]; skippedEmpty: number } {
  const { dataStartIndex } = findDataStartAndHeaders(matrix, 'transit');
  const now = new Date().toISOString();
  const rows: Omit<TransitEntry, 'id'>[] = [];
  let skippedEmpty = 0;

  for (let r = dataStartIndex; r < matrix.length; r += 1) {
    const line = matrix[r];
    const packingListNo = cleanStr(line[10]);
    const itemDescription = cleanStr(line[12]);
    const overallStatus = cleanStr(line[1]);
    if (!packingListNo && !itemDescription && !overallStatus) {
      skippedEmpty += 1;
      continue;
    }

    rows.push({
      rowNo: String(rows.length + 1),
      arrivalDate: parseFlexibleDateToIso(line[0] || '', assumedCalendar),
      overallStatus,
      inspectionRequest: cleanStr(line[2]),
      releaseNetNo: cleanStr(line[3]),
      releaseNetDate: parseFlexibleDateToIso(line[4] || '', assumedCalendar),
      mapnaShippingNotice: cleanStr(line[5]),
      interimNo: cleanStr(line[6]),
      interimDate: parseFlexibleDateToIso(line[7] || '', assumedCalendar),
      supplier: cleanStr(line[8]),
      dispatchLocation: cleanStr(line[9]),
      packingListNo,
      packageNo: cleanStr(line[11]),
      itemDescription,
      system: cleanStr(line[13]),
      subSystem: cleanStr(line[14]),
      unit: cleanStr(line[15]),
      equipmentSupplyCode: cleanStr(line[16]),
      carrierContractor: cleanStr(line[17]),
      billOfLadingNo: cleanStr(line[18]),
      amount: parseNum(line[19]),
      createdAt: now,
      updatedAt: now,
      createdBy,
    });
  }

  return { rows, skippedEmpty };
}
