import {
  computeDetailedEntry,
  computeSelectionFormulaSummary,
  getExpiringChemicals,
  isMerOpen,
  isRepOpen,
  roundQty,
} from './formulas.ts';
import { formatDisplayNumber, getMonthKeyFromIso, normalizeDigits } from './jalali.ts';
import { formatCountingUnit, normalizeTransitStatus } from './normalizers.ts';
import type {
  DetailedComputed,
  DetailedEntry,
  GcvDocumentRecord,
  GeneralEntry,
  Language,
  MaterialEstimateRecord,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportRecord,
  PeriodicInspectionRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
} from './types.ts';

export interface WarehouseQueryDb {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  detailedComputed?: DetailedComputed[];
  transit: TransitEntry[];
  gcvDocuments?: GcvDocumentRecord[];
  mivDocuments?: MivDocumentRecord[];
  opiInvitations?: OpiInvitationRecord[];
  opiMinutes?: OpiMinutesRecord[];
  siteEntryMinutes?: SiteEntryMinutesRecord[];
  osdrReports?: OsdrReportRecord[];
  substitutions?: SubstitutionRecord[];
  materialEstimates?: MaterialEstimateRecord[];
  periodicInspections?: PeriodicInspectionRecord[];
}

export interface WarehouseOverviewMetrics {
  generalRows: number;
  detailedRows: number;
  transitRows: number;
  uniquePackings: number;
  uniquePackages: number;
  grossWeightTons: number;
  netWeightTons: number;
  freightCostSum: number;
  shortageItemsCount: number;
  shortageQtySum: number;
  damagedItemsCount: number;
  openMerCount: number;
  openRepCount: number;
  opiPendingCount: number;
  expiringChemicalsCount: number;
  transitArrivedPackingsCount: number;
  transitShippingPackingsCount: number;
  transitInspectionPackingsCount: number;
  mainStockRowsCount: number;
  contractorStockRowsCount: number;
  specialToolsCount: number;
  chemicalsCount: number;
  sparePartsCount: number;
  documents: {
    siteEntryMinutes: number;
    opiInvitations: number;
    opiMinutes: number;
    osdrReports: number;
    gcvDocuments: number;
    mivDocuments: number;
    substitutions: number;
    materialEstimates: number;
    periodicInspections: number;
  };
}

export interface UnitStockSummary {
  unit: string;
  rowCount: number;
  packingQtySum: number;
  actualQtySum: number;
  effectiveActualQtySum: number;
  mainWarehouseStockSum: number;
  contractorStockSum: number;
  totalSiteStockSum: number;
  shortageSum: number;
  damagedQtySum: number;
  gcvDeliveredSum: number;
  mivContractorQtySum: number;
  mivMapnaQtySum: number;
}

export interface DetailedSearchItemView {
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  generalDescription: string;
  size: string;
  itemCode: string;
  countingUnit: string;
  packingQty: number | null;
  actualQty: number | null;
  mainWarehouseStock: number;
  contractorStock: number;
  shortage: number;
  damagedQty: number;
  storageLocation: string;
  island: string;
  system: string;
  subSystem: string;
  unit: string;
  supplier: string;
  arrivalDate: string;
  opiNo: string;
  opiPending: boolean;
  merNo: string;
  merStatus: string;
  repNo: string;
  repStatus: string;
  itemCategory: string;
  chemicalType: string;
  expirationDate: string;
  mivContractorNo: string;
  mivContractorQty: number | null;
  mivMapnaNo: string;
  mivMapnaQty: number | null;
  notes: string;
}

export interface SearchWarehouseItemsParams {
  query?: string;
  size?: string;
  itemCode?: string;
  packingListNo?: string;
  supplier?: string;
  island?: string;
  system?: string;
  storageLocation?: string;
  itemCategory?: '' | 'special_tools' | 'chemicals' | 'spare_parts';
  statusFilter?:
    | 'all'
    | 'in_stock'
    | 'main_stock'
    | 'contractor_stock'
    | 'shortage'
    | 'damaged'
    | 'open_mer'
    | 'open_rep'
    | 'opi_pending';
  scope?: 'detailed' | 'general' | 'transit' | 'all';
  limit?: number;
}

export interface SearchWarehouseItemsResult {
  queryApplied: string;
  exactMatch: boolean;
  totalDetailedMatches: number;
  rowsWithMainStock: number;
  rowsWithContractorStock: number;
  shortageRowsCount: number;
  damagedRowsCount: number;
  opiPendingRowsCount: number;
  totalsByUnit: UnitStockSummary[];
  uniquePackingsCount: number;
  uniquePackings: string[];
  storageLocations: string[];
  suppliers: string[];
  islands: string[];
  sizesFound: string[];
  detailedItems: DetailedSearchItemView[];
  closestSuggestions: DetailedSearchItemView[];
  totalGeneralMatches: number;
  generalGrossWeightTons: number;
  generalNetWeightTons: number;
  generalItems: Array<{
    packingListNo: string;
    packageNo: string;
    itemDescription: string;
    supplier: string;
    island: string;
    system: string;
    arrivalDate: string;
    grossWeight: number | null;
    netWeight: number | null;
    billOfLadingNo: string;
  }>;
  totalTransitMatches: number;
  transitItems: Array<{
    packingListNo: string;
    packageNo: string;
    itemDescription: string;
    supplier: string;
    overallStatus: string;
    arrivalDate: string;
    system: string;
    billOfLadingNo: string;
  }>;
}

// Nominal Pipe Size (inch) <-> DN (mm) equivalence map
const INCH_TO_DN: Record<string, string[]> = {
  '0.5': ['dn15', 'dn 15', '1/2"', '1/2 inch', '1/2in', '15mm', '15 mm'],
  '1/2': ['dn15', 'dn 15', '0.5"', '1/2"', '1/2 inch', '15mm', '15 mm'],
  '0.75': ['dn20', 'dn 20', '3/4"', '3/4 inch', '3/4in', '20mm', '20 mm'],
  '3/4': ['dn20', 'dn 20', '0.75"', '3/4"', '3/4 inch', '20mm', '20 mm'],
  '1': ['dn25', 'dn 25', '25mm', '25 mm'],
  '1.25': ['dn32', 'dn 32', '1-1/4"', '32mm', '32 mm'],
  '1.5': ['dn40', 'dn 40', '1-1/2"', '40mm', '40 mm'],
  '1-1/2': ['dn40', 'dn 40', '1.5"', '40mm', '40 mm'],
  '2': ['dn50', 'dn 50', '50mm', '50 mm'],
  '2.5': ['dn65', 'dn 65', '2-1/2"', '65mm', '65 mm'],
  '3': ['dn80', 'dn 80', '80mm', '80 mm'],
  '4': ['dn100', 'dn 100', '100mm', '100 mm'],
  '5': ['dn125', 'dn 125', '125mm', '125 mm'],
  '6': ['dn150', 'dn 150', '150mm', '150 mm'],
  '8': ['dn200', 'dn 200', '200mm', '200 mm'],
  '10': ['dn250', 'dn 250', '250mm', '250 mm'],
  '12': ['dn300', 'dn 300', '300mm', '300 mm'],
  '14': ['dn350', 'dn 350', '350mm', '350 mm'],
  '16': ['dn400', 'dn 400', '400mm', '400 mm'],
  '18': ['dn450', 'dn 450', '450mm', '450 mm'],
  '20': ['dn500', 'dn 500', '500mm', '500 mm'],
  '24': ['dn600', 'dn 600', '600mm', '600 mm'],
  '30': ['dn750', 'dn 750', '750mm', '750 mm'],
  '36': ['dn900', 'dn 900', '900mm', '900 mm'],
};

const DN_TO_INCH: Record<string, string> = {
  '15': '1/2',
  '20': '3/4',
  '25': '1',
  '32': '1.25',
  '40': '1.5',
  '50': '2',
  '65': '2.5',
  '80': '3',
  '100': '4',
  '125': '5',
  '150': '6',
  '200': '8',
  '250': '10',
  '300': '12',
  '350': '14',
  '400': '16',
  '450': '18',
  '500': '20',
  '600': '24',
  '750': '30',
  '900': '36',
};

// Bilingual power-plant warehouse synonym groups
const SYNONYM_GROUPS: string[][] = [
  ['pipe', 'pipes', 'piping', 'tube', 'tubing', 'لوله', 'لوله ها', 'پایپ'],
  ['valve', 'valves', 'شیر', 'شیرآلات', 'ولو', 'والو'],
  ['gate', 'کشویی', 'گیت'],
  ['globe', 'کروی', 'گلوب'],
  ['check', 'یکطرفه', 'چک'],
  ['ball', 'توپی', 'بال'],
  ['butterfly', 'پروانه ای', 'پروانه'],
  ['safety', 'relief', 'اطمینان', 'ایمنی'],
  ['control', 'کنترل', 'کنترلی'],
  ['flange', 'flanges', 'فلنج', 'فلنچ'],
  ['elbow', 'elbows', 'زانو', 'زانویی'],
  ['tee', 'tees', 'سه راهی', 'سه راه'],
  ['reducer', 'reducers', 'تبدیل', 'ردیوسر'],
  ['gasket', 'gaskets', 'گسکت', 'واشر'],
  ['bolt', 'bolts', 'stud', 'studbolt', 'پیچ', 'بولت', 'استادبولت'],
  ['nut', 'nuts', 'مهره'],
  ['washer', 'washers', 'واشر'],
  ['cable', 'cables', 'کابل'],
  ['wire', 'wires', 'سیم'],
  ['pump', 'pumps', 'پمپ'],
  ['motor', 'motors', 'موتور', 'الکتروموتور'],
  ['bearing', 'bearings', 'بلبرینگ', 'برینگ', 'یاتاقان'],
  ['filter', 'filters', 'فیلتر'],
  ['sensor', 'sensors', 'سنسور', 'حسگر'],
  ['transmitter', 'transmitters', 'ترانسمیتر'],
  ['gauge', 'gage', 'گیج', 'فشارسنج', 'دماسنج'],
  ['switch', 'switches', 'سوئیچ', 'سوییچ', 'کلید'],
  ['breaker', 'breakers', 'بریکر'],
  ['transformer', 'transformers', 'ترانس', 'ترانسفورماتور'],
  ['turbine', 'turbines', 'توربین'],
  ['generator', 'generators', 'ژنراتور'],
  ['boiler', 'hrsg', 'بویلر', 'دیگ بخار'],
  ['compressor', 'compressors', 'کمپرسور'],
  ['oil', 'روغن'],
  ['grease', 'گریس'],
  ['paint', 'primer', 'coating', 'رنگ', 'پرایمر'],
  ['chemical', 'chemicals', 'شیمیایی'],
  ['wrench', 'spanner', 'آچار'],
  ['tool', 'tools', 'ابزار'],
  ['spare', 'spares', 'یدکی'],
  ['seal', 'seals', 'سیل', 'آب بند'],
  ['hose', 'hoses', 'شلنگ', 'شیلنگ'],
  ['clamp', 'clamps', 'بست', 'کلمپ'],
  ['support', 'supports', 'ساپورت', 'پایه'],
  ['insulation', 'عایق'],
  ['plate', 'sheet', 'ورق'],
  ['grating', 'گریتینگ'],
  ['electrode', 'الکترود'],
  ['steel', 'فولاد', 'فولادی', 'استیل'],
  ['stainless', 'ss', 'استنلس'],
  ['carbon', 'cs', 'کربن'],
  ['seamless', 'smls', 'مانیسمان', 'بدون درز'],
  ['panel', 'cabinet', 'تابلو', 'پنل'],
  ['relay', 'رله'],
  ['fuse', 'فیوز'],
  ['lamp', 'light', 'چراغ', 'لامپ'],
  ['fan', 'blower', 'فن', 'بلوئر'],
  ['heater', 'هیتر', 'گرمکن'],
  ['cooler', 'کولر', 'خنک کن'],
  ['heat exchanger', 'exchanger', 'مبدل'],
  ['tank', 'vessel', 'مخزن'],
  ['coupling', 'کوپلینگ'],
  ['fitting', 'fittings', 'اتصالات', 'فیتینگ'],
  ['nozzle', 'نازل'],
  ['manifold', 'منیفولد'],
  ['strainer', 'استرینر', 'صافی'],
  ['trap', 'تله بخار'],
  ['actuator', 'اکچویتور', 'عملگر'],
];

const SYNONYM_LOOKUP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    const key = normalizeSearchText(term);
    SYNONYM_LOOKUP.set(key, group.map((g) => normalizeSearchText(g)));
  }
}

export function normKey(s: string | undefined | null): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeSearchText(raw: string | undefined | null): string {
  return normalizeDigits(String(raw ?? ''))
    .replace(/[\u200c\u200b\u0640]/g, ' ')
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[“”″״]|''|′′/g, '"')
    .replace(/[‘’′]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getDetailedComputedList(db: WarehouseQueryDb): DetailedComputed[] {
  if (db.detailedComputed && db.detailedComputed.length === db.detailed.length) {
    return db.detailedComputed;
  }
  return db.detailed.map(computeDetailedEntry);
}

interface ParsedTermGroup {
  raw: string;
  kind: 'size' | 'word';
  variants: string[];
  numericValue?: string;
}

/**
 * Extracts technical size patterns (e.g. `8"`, `8 inch`, `۸ اینچ`, `DN200`, `1/2"`, `200mm`, `3x120`)
 * and normal keyword tokens with bilingual engineering synonyms.
 */
export function parseSearchTerms(query: string): ParsedTermGroup[] {
  let text = normalizeSearchText(query);
  if (!text) return [];

  const groups: ParsedTermGroup[] = [];

  // 1) Extract inch size expressions: e.g. 8", 8 inch, 8 in, 8 اینچ, 8 اینچی, 1/2", 1-1/2"
  text = text.replace(
    /(?:^|(?<=[\s(,/-]))(\d+(?:[./-]\d+)?)\s*(?:"|inch(?:es)?\b|in\b|اینچی?)(?=$|[\s),.;:؟?!/-])/gi,
    (_full, numRaw: string) => {
      const num = numRaw.trim();
      const variants = new Set<string>([
        `${num}"`,
        `${num} "`,
        `${num} inch`,
        `${num}inch`,
        `${num} in`,
        `${num}in`,
        `${num} اینچ`,
        `${num}اینچ`,
      ]);
      const dnAlts = INCH_TO_DN[num];
      if (dnAlts) {
        for (const alt of dnAlts) variants.add(alt);
      }
      groups.push({
        raw: `${num}"`,
        kind: 'size',
        variants: Array.from(variants),
        numericValue: num,
      });
      return ' ';
    },
  );

  // 2) Extract DN size expressions: e.g. DN200, DN 200
  text = text.replace(
    /(?:^|(?<=[\s(,/-]))dn\s*(\d+)(?=$|[\s),.;:؟?!/-])/gi,
    (_full, dnNum: string) => {
      const variants = new Set<string>([`dn${dnNum}`, `dn ${dnNum}`, `${dnNum}mm`, `${dnNum} mm`]);
      const inch = DN_TO_INCH[dnNum];
      if (inch) {
        variants.add(`${inch}"`);
        variants.add(`${inch} inch`);
        variants.add(`${inch}in`);
        variants.add(`${inch} اینچ`);
      }
      groups.push({
        raw: `DN${dnNum}`,
        kind: 'size',
        variants: Array.from(variants),
        numericValue: inch || dnNum,
      });
      return ' ';
    },
  );

  // 3) Extract mm / cm / kv / kw / bar / amp size/rating expressions: e.g. 200mm, 3x120
  text = text.replace(
    /(?:^|(?<=[\s(,/-]))(\d+(?:\.\d+)?)\s*(mm2?|cm|kv|kw|mw|bar|psi|amp|a|v|hz|kg|lit|l)\b/gi,
    (_full, num: string, unit: string) => {
      const u = unit.toLowerCase();
      const variants = new Set<string>([`${num}${u}`, `${num} ${u}`]);
      if (u === 'mm' && DN_TO_INCH[num]) {
        const inch = DN_TO_INCH[num];
        variants.add(`dn${num}`);
        variants.add(`dn ${num}`);
        variants.add(`${inch}"`);
        variants.add(`${inch} inch`);
      }
      groups.push({
        raw: `${num}${u}`,
        kind: 'size',
        variants: Array.from(variants),
        numericValue: num,
      });
      return ' ';
    },
  );

  // 4) Remaining tokens (keep hyphens/x/slashes inside codes like PL-100 or 3x120)
  const rawTokens = text
    .split(/[\s،,.;:؟?!()[\]{}]+/)
    .map((t) => t.replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter(Boolean);

  for (const tok of rawTokens) {
    if (tok.length < 1) continue;
    // Skip single non-numeric punctuation chars
    if (tok.length === 1 && !/\d/.test(tok)) continue;

    // Check synonyms
    const syns = SYNONYM_LOOKUP.get(tok);
    if (syns) {
      groups.push({
        raw: tok,
        kind: 'word',
        variants: syns,
      });
    } else {
      // Also handle simple English plural stripping (e.g., pipes -> pipe, valves -> valve)
      const variants = new Set<string>([tok]);
      if (tok.length > 3 && tok.endsWith('s') && !tok.endsWith('ss')) {
        const singular = tok.slice(0, -1);
        variants.add(singular);
        const singSyns = SYNONYM_LOOKUP.get(singular);
        if (singSyns) {
          for (const s of singSyns) variants.add(s);
        }
      }
      groups.push({
        raw: tok,
        kind: /^\d+(?:[./-]\d+)?$/.test(tok) ? 'size' : 'word',
        variants: Array.from(variants),
        numericValue: /^\d+(?:[./-]\d+)?$/.test(tok) ? tok : undefined,
      });
    }
  }

  return groups;
}

function matchesVariantWithBoundaries(haystack: string, variant: string, isSize: boolean): boolean {
  if (!variant) return false;
  // For size variants or short numeric tokens, enforce digit boundaries so "8\"" never matches "18\"" or "80"
  if (isSize || /^\d/.test(variant) || variant.length <= 3) {
    const startsDigit = /^\d/.test(variant);
    const endsDigit = /\d$/.test(variant);
    const startsAlpha = /^[a-z]/.test(variant);
    const endsAlpha = /[a-z]$/.test(variant);

    const prefix = startsDigit ? '(?<![0-9.])' : startsAlpha ? '(?<![a-z])' : '';
    const suffix = endsDigit ? '(?![0-9.])' : endsAlpha ? '(?![a-z])' : '';
    const re = new RegExp(`${prefix}${escapeRegExp(variant)}${suffix}`, 'i');
    return re.test(haystack);
  }
  return haystack.includes(variant);
}

/**
 * Matches a parsed term group against the row's full haystack and dedicated size field.
 * For inch sizes like `8"`, if the dedicated `size` column itself is just `"8"` or `"8\""`, it matches!
 */
function matchesTermGroup(group: ParsedTermGroup, fullHaystack: string, sizeFieldNorm: string): boolean {
  for (const v of group.variants) {
    if (matchesVariantWithBoundaries(fullHaystack, v, group.kind === 'size')) {
      return true;
    }
  }
  // If user searched `8"` and the dedicated `size` column literally contains `8` (without quote), accept it!
  if (group.kind === 'size' && group.numericValue && sizeFieldNorm) {
    const bareRe = new RegExp(`(?<![0-9./-])${escapeRegExp(group.numericValue)}(?![0-9./-])`);
    if (bareRe.test(sizeFieldNorm)) {
      return true;
    }
  }
  return false;
}

function buildDetailedHaystack(d: DetailedComputed): { full: string; descAndSize: string; sizeNorm: string } {
  const sizeNorm = normalizeSearchText(d.size);
  const descAndSize = normalizeSearchText(
    `${d.description} ${d.generalDescription} ${d.size} ${d.itemCode} ${d.chemicalType || ''}`,
  );
  const full = normalizeSearchText(
    [
      d.shipmentNo,
      d.packageNo,
      d.itemNo,
      d.description,
      d.generalDescription,
      d.size,
      d.itemCode,
      d.supplier,
      d.island,
      d.system,
      d.subSystem,
      d.unit,
      d.storageLocation,
      d.notes,
      d.chemicalType,
      d.merNo,
      d.repNo,
      d.opiNo,
      d.mtoRef,
      d.gcvReceiptNo,
      d.mivContractorNo,
      d.mivMapnaNo,
      d.receiver,
    ].join(' '),
  );
  return { full, descAndSize, sizeNorm };
}

function toDetailedItemView(d: DetailedComputed, lang: Language): DetailedSearchItemView {
  return {
    shipmentNo: d.shipmentNo || '',
    packageNo: d.packageNo || '',
    itemNo: d.itemNo || '',
    description: d.description || '',
    generalDescription: d.generalDescription || '',
    size: d.size || '',
    itemCode: d.itemCode || '',
    countingUnit: formatCountingUnit(d.countingUnit, lang) || d.countingUnit || '',
    packingQty: d.packingQty,
    actualQty: d.actualQty,
    mainWarehouseStock: roundQty(d.mapnaInventory),
    contractorStock: roundQty(d.contractorInventory),
    shortage: roundQty(d.shortage),
    damagedQty: roundQty(d.damagedQty ?? 0),
    storageLocation: d.storageLocation || '',
    island: d.island || '',
    system: d.system || '',
    subSystem: d.subSystem || '',
    unit: d.unit || '',
    supplier: d.supplier || '',
    arrivalDate: d.arrivalDate || '',
    opiNo: d.opiNo || '',
    opiPending: d.opiPending,
    merNo: d.merNo || '',
    merStatus: d.merStatus || '',
    repNo: d.repNo || '',
    repStatus: d.repStatus || '',
    itemCategory: d.itemCategory || '',
    chemicalType: d.chemicalType || '',
    expirationDate: d.expirationDate || '',
    mivContractorNo: d.mivContractorNo || '',
    mivContractorQty: d.mivContractorQty,
    mivMapnaNo: d.mivMapnaNo || '',
    mivMapnaQty: d.mivMapnaQty,
    notes: d.notes || '',
  };
}

export function aggregateDetailedStockByUnit(rows: DetailedComputed[], lang: Language = 'fa'): UnitStockSummary[] {
  const byUnit = new Map<string, UnitStockSummary>();
  const fallbackUnit = lang === 'en' ? 'Unspecified' : 'بدون واحد';

  for (const d of rows) {
    const formatted = formatCountingUnit(d.countingUnit, lang) || normKey(d.countingUnit) || fallbackUnit;
    let bucket = byUnit.get(formatted);
    if (!bucket) {
      bucket = {
        unit: formatted,
        rowCount: 0,
        packingQtySum: 0,
        actualQtySum: 0,
        effectiveActualQtySum: 0,
        mainWarehouseStockSum: 0,
        contractorStockSum: 0,
        totalSiteStockSum: 0,
        shortageSum: 0,
        damagedQtySum: 0,
        gcvDeliveredSum: 0,
        mivContractorQtySum: 0,
        mivMapnaQtySum: 0,
      };
      byUnit.set(formatted, bucket);
    }
    bucket.rowCount += 1;
    bucket.packingQtySum = roundQty(bucket.packingQtySum + (d.packingQty ?? 0));
    bucket.actualQtySum = roundQty(bucket.actualQtySum + (d.actualQty ?? 0));
    bucket.effectiveActualQtySum = roundQty(bucket.effectiveActualQtySum + d.effectiveActualQty);
    bucket.mainWarehouseStockSum = roundQty(bucket.mainWarehouseStockSum + d.mapnaInventory);
    bucket.contractorStockSum = roundQty(bucket.contractorStockSum + d.contractorInventory);
    bucket.totalSiteStockSum = roundQty(bucket.mainWarehouseStockSum + bucket.contractorStockSum);
    bucket.shortageSum = roundQty(bucket.shortageSum + d.shortage);
    bucket.damagedQtySum = roundQty(bucket.damagedQtySum + (d.damagedQty ?? 0));
    bucket.gcvDeliveredSum = roundQty(bucket.gcvDeliveredSum + (d.gcvDeliveredQty ?? 0));
    bucket.mivContractorQtySum = roundQty(bucket.mivContractorQtySum + (d.mivContractorQty ?? 0));
    bucket.mivMapnaQtySum = roundQty(bucket.mivMapnaQtySum + (d.mivMapnaQty ?? 0));
  }

  return Array.from(byUnit.values()).sort((a, b) => b.rowCount - a.rowCount);
}

/**
 * Tool 1: High-level live KPIs across all warehouse sections and documents.
 */
export function getWarehouseOverview(db: WarehouseQueryDb): WarehouseOverviewMetrics {
  const detailedComputed = getDetailedComputedList(db);
  const shortageItems = detailedComputed.filter((d) => d.hasShortage);
  const damagedItems = detailedComputed.filter((d) => d.hasDamaged);
  const openMer = detailedComputed.filter((d) => isMerOpen(d));
  const openRep = detailedComputed.filter((d) => isRepOpen(d));
  const opiPending = detailedComputed.filter((d) => d.opiPending);
  const expiringChemicals = getExpiringChemicals(detailedComputed, 30);

  const uniquePackings = new Set<string>();
  const uniquePackages = new Set<string>();
  for (const g of db.general) {
    const pk = normKey(g.packingListNo);
    const pkg = normKey(g.packageNo);
    if (pk) uniquePackings.add(pk);
    if (pk || pkg) uniquePackages.add(`${pk}::${pkg}`);
  }
  for (const d of detailedComputed) {
    const pk = normKey(d.shipmentNo);
    if (pk) uniquePackings.add(pk);
  }

  let mainStockRowsCount = 0;
  let contractorStockRowsCount = 0;
  let specialToolsCount = 0;
  let chemicalsCount = 0;
  let sparePartsCount = 0;
  for (const d of detailedComputed) {
    if (d.mapnaInventory > 0) mainStockRowsCount += 1;
    if (d.contractorInventory > 0) contractorStockRowsCount += 1;
    if (d.itemCategory === 'special_tools') specialToolsCount += 1;
    else if (d.itemCategory === 'chemicals') chemicalsCount += 1;
    else if (d.itemCategory === 'spare_parts') sparePartsCount += 1;
  }

  const transitSummary = computeSelectionFormulaSummary({ transit: db.transit });
  const generalSummary = computeSelectionFormulaSummary({ general: db.general });
  const detailedSummary = computeSelectionFormulaSummary({ detailed: detailedComputed });

  return {
    generalRows: db.general.length,
    detailedRows: db.detailed.length,
    transitRows: db.transit.length,
    uniquePackings: uniquePackings.size,
    uniquePackages: uniquePackages.size,
    grossWeightTons: roundQty(generalSummary.grossWeightSum / 1000),
    netWeightTons: roundQty(generalSummary.netWeightSum / 1000),
    freightCostSum: generalSummary.freightCostSum,
    shortageItemsCount: shortageItems.length,
    shortageQtySum: detailedSummary.shortageSum,
    damagedItemsCount: damagedItems.length,
    openMerCount: openMer.length,
    openRepCount: openRep.length,
    opiPendingCount: opiPending.length,
    expiringChemicalsCount: expiringChemicals.length,
    transitArrivedPackingsCount: transitSummary.transitArrivedPackingsCount || 0,
    transitShippingPackingsCount: transitSummary.transitShippingPackingsCount || 0,
    transitInspectionPackingsCount: transitSummary.transitInspectionPackingsCount || 0,
    mainStockRowsCount,
    contractorStockRowsCount,
    specialToolsCount,
    chemicalsCount,
    sparePartsCount,
    documents: {
      siteEntryMinutes: db.siteEntryMinutes?.length || 0,
      opiInvitations: db.opiInvitations?.length || 0,
      opiMinutes: db.opiMinutes?.length || 0,
      osdrReports: db.osdrReports?.length || 0,
      gcvDocuments: db.gcvDocuments?.length || 0,
      mivDocuments: db.mivDocuments?.length || 0,
      substitutions: db.substitutions?.length || 0,
      materialEstimates: db.materialEstimates?.length || 0,
      periodicInspections: db.periodicInspections?.length || 0,
    },
  };
}

/**
 * Tool 2: Deep multi-criteria bilingual item search & exact stock aggregator.
 */
export function searchWarehouseItems(
  db: WarehouseQueryDb,
  params: SearchWarehouseItemsParams,
  lang: Language = 'fa',
): SearchWarehouseItemsResult {
  const detailedComputed = getDetailedComputedList(db);
  const scope = params.scope || 'all';
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));

  const queryRaw = normKey(params.query);
  const queryGroups = parseSearchTerms(queryRaw);
  const sizeGroups = params.size ? parseSearchTerms(params.size) : [];
  const itemCodeNorm = normalizeSearchText(params.itemCode);
  const packingNorm = normalizeSearchText(params.packingListNo);
  const supplierNorm = normalizeSearchText(params.supplier);
  const islandNorm = normalizeSearchText(params.island);
  const systemNorm = normalizeSearchText(params.system);
  const locationNorm = normalizeSearchText(params.storageLocation);
  const categoryFilter = params.itemCategory || '';
  const statusFilter = params.statusFilter || 'all';

  const exactDetailedScored: Array<{ row: DetailedComputed; score: number }> = [];
  const partialDetailedScored: Array<{ row: DetailedComputed; score: number }> = [];
  const phraseNorm = normalizeSearchText(queryRaw);

  if (scope === 'all' || scope === 'detailed') {
    for (const d of detailedComputed) {
      // Structured hard filters
      if (packingNorm && !normalizeSearchText(d.shipmentNo).includes(packingNorm)) continue;
      if (supplierNorm && !normalizeSearchText(d.supplier).includes(supplierNorm)) continue;
      if (islandNorm && !normalizeSearchText(d.island).includes(islandNorm)) continue;
      if (systemNorm && !normalizeSearchText(`${d.system} ${d.subSystem}`).includes(systemNorm)) continue;
      if (locationNorm && !normalizeSearchText(d.storageLocation).includes(locationNorm)) continue;
      if (itemCodeNorm && !normalizeSearchText(d.itemCode).includes(itemCodeNorm)) continue;
      if (categoryFilter && d.itemCategory !== categoryFilter) continue;

      if (statusFilter === 'in_stock' && d.mapnaInventory <= 0 && d.contractorInventory <= 0) continue;
      if (statusFilter === 'main_stock' && d.mapnaInventory <= 0) continue;
      if (statusFilter === 'contractor_stock' && d.contractorInventory <= 0) continue;
      if (statusFilter === 'shortage' && !d.hasShortage) continue;
      if (statusFilter === 'damaged' && !d.hasDamaged) continue;
      if (statusFilter === 'open_mer' && !isMerOpen(d)) continue;
      if (statusFilter === 'open_rep' && !isRepOpen(d)) continue;
      if (statusFilter === 'opi_pending' && !d.opiPending) continue;

      const { full, descAndSize, sizeNorm } = buildDetailedHaystack(d);

      // Explicit size parameter must match if provided
      if (sizeGroups.length > 0 && !sizeGroups.every((sg) => matchesTermGroup(sg, full, sizeNorm))) {
        continue;
      }

      if (queryGroups.length === 0) {
        exactDetailedScored.push({ row: d, score: 10 });
        continue;
      }

      let matchedCount = 0;
      let score = 0;
      for (const grp of queryGroups) {
        if (matchesTermGroup(grp, descAndSize, sizeNorm)) {
          matchedCount += 1;
          score += grp.kind === 'size' ? 25 : 20;
        } else if (matchesTermGroup(grp, full, sizeNorm)) {
          matchedCount += 1;
          score += grp.kind === 'size' ? 12 : 8;
        }
      }

      if (matchedCount === queryGroups.length) {
        if (phraseNorm && descAndSize.includes(phraseNorm)) score += 40;
        if (d.mapnaInventory > 0 || d.contractorInventory > 0) score += 3;
        exactDetailedScored.push({ row: d, score });
      } else if (matchedCount > 0 && queryGroups.length > 1) {
        // Keep partial matches only for closestSuggestions if exact match turns up empty
        // Prefer rows matching non-size core noun terms (e.g. matching "Pipe" when "Pipe 8\"" has 0 rows)
        const nonSizeMatched = queryGroups.some(
          (g) => g.kind === 'word' && matchesTermGroup(g, descAndSize, sizeNorm),
        );
        if (nonSizeMatched) {
          partialDetailedScored.push({ row: d, score: score + matchedCount * 10 });
        }
      }
    }
  }

  exactDetailedScored.sort((a, b) => b.score - a.score || b.row.mapnaInventory - a.row.mapnaInventory);
  const matchedDetailedRows = exactDetailedScored.map((x) => x.row);

  let closestSuggestions: DetailedSearchItemView[] = [];
  if (matchedDetailedRows.length === 0 && partialDetailedScored.length > 0) {
    partialDetailedScored.sort((a, b) => b.score - a.score || b.row.mapnaInventory - a.row.mapnaInventory);
    closestSuggestions = partialDetailedScored.slice(0, 8).map((x) => toDetailedItemView(x.row, lang));
  }

  const uniquePackingsSet = new Set<string>();
  const locationsSet = new Set<string>();
  const suppliersSet = new Set<string>();
  const islandsSet = new Set<string>();
  const sizesSet = new Set<string>();
  let rowsWithMainStock = 0;
  let rowsWithContractorStock = 0;
  let shortageRowsCount = 0;
  let damagedRowsCount = 0;
  let opiPendingRowsCount = 0;

  for (const d of matchedDetailedRows) {
    if (normKey(d.shipmentNo)) uniquePackingsSet.add(normKey(d.shipmentNo));
    if (normKey(d.storageLocation)) locationsSet.add(normKey(d.storageLocation));
    if (normKey(d.supplier)) suppliersSet.add(normKey(d.supplier));
    if (normKey(d.island)) islandsSet.add(normKey(d.island));
    if (normKey(d.size)) sizesSet.add(normKey(d.size));
    if (d.mapnaInventory > 0) rowsWithMainStock += 1;
    if (d.contractorInventory > 0) rowsWithContractorStock += 1;
    if (d.hasShortage) shortageRowsCount += 1;
    if (d.hasDamaged) damagedRowsCount += 1;
    if (d.opiPending) opiPendingRowsCount += 1;
  }

  // General matches
  const matchedGeneral: GeneralEntry[] = [];
  if (scope === 'all' || scope === 'general') {
    for (const g of db.general) {
      if (packingNorm && !normalizeSearchText(g.packingListNo).includes(packingNorm)) continue;
      if (supplierNorm && !normalizeSearchText(g.supplier).includes(supplierNorm)) continue;
      if (islandNorm && !normalizeSearchText(g.island).includes(islandNorm)) continue;
      if (systemNorm && !normalizeSearchText(`${g.system} ${g.subSystem}`).includes(systemNorm)) continue;

      const hay = normalizeSearchText(
        `${g.packingListNo} ${g.packageNo} ${g.itemDescription} ${g.supplier} ${g.island} ${g.system} ${g.subSystem} ${g.unit} ${g.billOfLadingNo} ${g.releaseNo} ${g.mapnaEntryMinutesNo}`,
      );
      if (sizeGroups.length > 0 && !sizeGroups.every((sg) => matchesTermGroup(sg, hay, ''))) continue;
      if (queryGroups.length > 0 && !queryGroups.every((qg) => matchesTermGroup(qg, hay, ''))) continue;
      matchedGeneral.push(g);
    }
  }

  // Transit matches
  const matchedTransit: TransitEntry[] = [];
  if (scope === 'all' || scope === 'transit') {
    for (const t of db.transit) {
      if (packingNorm && !normalizeSearchText(t.packingListNo).includes(packingNorm)) continue;
      if (supplierNorm && !normalizeSearchText(t.supplier).includes(supplierNorm)) continue;
      if (systemNorm && !normalizeSearchText(`${t.system} ${t.subSystem}`).includes(systemNorm)) continue;

      const hay = normalizeSearchText(
        `${t.packingListNo} ${t.packageNo} ${t.itemDescription} ${t.supplier} ${t.overallStatus} ${t.system} ${t.subSystem} ${t.billOfLadingNo} ${t.carrierContractor} ${t.mapnaShippingNotice}`,
      );
      if (sizeGroups.length > 0 && !sizeGroups.every((sg) => matchesTermGroup(sg, hay, ''))) continue;
      if (queryGroups.length > 0 && !queryGroups.every((qg) => matchesTermGroup(qg, hay, ''))) continue;
      matchedTransit.push(t);
    }
  }

  const genGrossSum = matchedGeneral.reduce((acc, g) => acc + (g.grossWeight ?? 0), 0);
  const genNetSum = matchedGeneral.reduce((acc, g) => acc + (g.netWeight ?? 0), 0);

  return {
    queryApplied: queryRaw || params.size || params.packingListNo || params.supplier || params.island || '',
    exactMatch: matchedDetailedRows.length > 0 || matchedGeneral.length > 0 || matchedTransit.length > 0,
    totalDetailedMatches: matchedDetailedRows.length,
    rowsWithMainStock,
    rowsWithContractorStock,
    shortageRowsCount,
    damagedRowsCount,
    opiPendingRowsCount,
    totalsByUnit: aggregateDetailedStockByUnit(matchedDetailedRows, lang),
    uniquePackingsCount: uniquePackingsSet.size,
    uniquePackings: Array.from(uniquePackingsSet).slice(0, 20),
    storageLocations: Array.from(locationsSet).slice(0, 20),
    suppliers: Array.from(suppliersSet).slice(0, 15),
    islands: Array.from(islandsSet).slice(0, 15),
    sizesFound: Array.from(sizesSet).slice(0, 20),
    detailedItems: matchedDetailedRows.slice(0, limit).map((d) => toDetailedItemView(d, lang)),
    closestSuggestions,
    totalGeneralMatches: matchedGeneral.length,
    generalGrossWeightTons: roundQty(genGrossSum / 1000),
    generalNetWeightTons: roundQty(genNetSum / 1000),
    generalItems: matchedGeneral.slice(0, Math.min(limit, 15)).map((g) => ({
      packingListNo: g.packingListNo,
      packageNo: g.packageNo,
      itemDescription: g.itemDescription,
      supplier: g.supplier,
      island: g.island,
      system: g.system,
      arrivalDate: g.arrivalDate,
      grossWeight: g.grossWeight,
      netWeight: g.netWeight,
      billOfLadingNo: g.billOfLadingNo,
    })),
    totalTransitMatches: matchedTransit.length,
    transitItems: matchedTransit.slice(0, Math.min(limit, 15)).map((t) => ({
      packingListNo: t.packingListNo,
      packageNo: t.packageNo,
      itemDescription: t.itemDescription,
      supplier: t.supplier,
      overallStatus: normalizeTransitStatus(t.overallStatus) || t.overallStatus,
      arrivalDate: t.arrivalDate,
      system: t.system,
      billOfLadingNo: t.billOfLadingNo,
    })),
  };
}

/**
 * Tool 3: 360-degree lookup of a specific packing list number across all modules and documents.
 */
export function getPackingListDetails(
  db: WarehouseQueryDb,
  packingListNo: string,
  lang: Language = 'fa',
) {
  const target = normalizeSearchText(packingListNo);
  const detailedComputed = getDetailedComputedList(db);

  const matchPacking = (val: string | undefined | null) => {
    const n = normalizeSearchText(val);
    if (!n || !target) return false;
    return n === target || n.includes(target);
  };

  // Prefer exact packing match first; fall back to substring if no exact match exists
  let genRows = db.general.filter((g) => normalizeSearchText(g.packingListNo) === target);
  let detRows = detailedComputed.filter((d) => normalizeSearchText(d.shipmentNo) === target);
  let trRows = db.transit.filter((t) => normalizeSearchText(t.packingListNo) === target);

  if (genRows.length === 0 && detRows.length === 0 && trRows.length === 0) {
    genRows = db.general.filter((g) => matchPacking(g.packingListNo));
    detRows = detailedComputed.filter((d) => matchPacking(d.shipmentNo));
    trRows = db.transit.filter((t) => matchPacking(t.packingListNo));
  }

  const genSummary = computeSelectionFormulaSummary({ general: genRows });
  const matchedPackings = Array.from(
    new Set([
      ...genRows.map((g) => normKey(g.packingListNo)),
      ...detRows.map((d) => normKey(d.shipmentNo)),
      ...trRows.map((t) => normKey(t.packingListNo)),
    ].filter(Boolean)),
  );

  const relatedSiteEntry = (db.siteEntryMinutes || [])
    .filter((r) => (r.packingListNos || []).some((p) => matchPacking(p)))
    .map((r) => ({ minutesNo: r.minutesNo, date: r.date, conditionStatus: r.conditionStatus, supplier: r.supplier }));

  const relatedOpiInv = (db.opiInvitations || [])
    .filter((r) => (r.packingNos || []).some((p) => matchPacking(p)))
    .map((r) => ({ invitationNo: r.invitationNo, date: r.date, status: r.status }));

  const relatedOpiMin = (db.opiMinutes || [])
    .filter((r) => matchPacking(r.packingListNo))
    .map((r) => ({ minutesNo: r.minutesNo, date: r.date, resultStatus: r.resultStatus, merNo: r.merNo }));

  const relatedOsdr = (db.osdrReports || [])
    .filter((r) => matchPacking(r.packingListNo))
    .map((r) => ({ reportNo: r.reportNo, date: r.date, itemsCount: r.items?.length || 0 }));

  const relatedGcv = (db.gcvDocuments || [])
    .filter((r) => (r.items || []).some((it) => matchPacking(it.shipmentNo)))
    .map((r) => ({ receiptNo: r.receiptNo, date: r.date, receiver: r.receiver, itemsCount: r.items?.length || 0 }));

  const relatedMiv = (db.mivDocuments || [])
    .filter((r) => (r.items || []).some((it) => matchPacking(it.shipmentNo)))
    .map((r) => ({ docNo: r.docNo, docType: r.docType, date: r.date, party: r.party || r.receiver || '', itemsCount: r.items?.length || 0 }));

  const relatedSubs = (db.substitutions || [])
    .filter((r) => matchPacking(r.shipmentNo))
    .map((r) => ({ docNo: r.docNo, date: r.date, status: r.status, originalDescription: r.originalDescription, substituteDescription: r.substituteDescription }));

  return {
    found: genRows.length > 0 || detRows.length > 0 || trRows.length > 0,
    queriedPackingListNo: packingListNo,
    matchedPackings: matchedPackings.slice(0, 10),
    generalCount: genRows.length,
    detailedCount: detRows.length,
    transitCount: trRows.length,
    grossWeightTons: roundQty(genSummary.grossWeightSum / 1000),
    netWeightTons: roundQty(genSummary.netWeightSum / 1000),
    freightCostSum: genSummary.freightCostSum,
    shortageItemsCount: detRows.filter((d) => d.hasShortage).length,
    damagedItemsCount: detRows.filter((d) => d.hasDamaged).length,
    openMerCount: detRows.filter((d) => isMerOpen(d)).length,
    openRepCount: detRows.filter((d) => isRepOpen(d)).length,
    opiPendingCount: detRows.filter((d) => d.opiPending).length,
    totalsByUnit: aggregateDetailedStockByUnit(detRows, lang),
    suppliers: Array.from(new Set([...genRows.map((g) => g.supplier), ...detRows.map((d) => d.supplier)].filter(Boolean))),
    islands: Array.from(new Set([...genRows.map((g) => g.island), ...detRows.map((d) => d.island)].filter(Boolean))),
    storageLocations: Array.from(new Set(detRows.map((d) => d.storageLocation).filter(Boolean))),
    generalPackages: genRows.slice(0, 15).map((g) => ({
      packingListNo: g.packingListNo,
      packageNo: g.packageNo,
      itemDescription: g.itemDescription,
      arrivalDate: g.arrivalDate,
      grossWeight: g.grossWeight,
      netWeight: g.netWeight,
      billOfLadingNo: g.billOfLadingNo,
    })),
    detailedItems: detRows.slice(0, 25).map((d) => toDetailedItemView(d, lang)),
    transitRecords: trRows.slice(0, 10).map((t) => ({
      packingListNo: t.packingListNo,
      packageNo: t.packageNo,
      overallStatus: normalizeTransitStatus(t.overallStatus) || t.overallStatus,
      arrivalDate: t.arrivalDate,
      supplier: t.supplier,
    })),
    documents: {
      siteEntryMinutes: relatedSiteEntry,
      opiInvitations: relatedOpiInv,
      opiMinutes: relatedOpiMin,
      osdrReports: relatedOsdr,
      gcvDocuments: relatedGcv,
      mivDocuments: relatedMiv,
      substitutions: relatedSubs,
    },
  };
}

export type AggregateGroupBy =
  | 'island'
  | 'supplier'
  | 'system'
  | 'subSystem'
  | 'unit'
  | 'storageLocation'
  | 'generalDescription'
  | 'itemCategory'
  | 'countingUnit'
  | 'overallStatus'
  | 'arrivalMonth'
  | 'arrivalYear';

export interface AggregateWarehouseParams {
  groupBy: AggregateGroupBy;
  scope?: 'detailed' | 'general' | 'transit';
  island?: string;
  supplier?: string;
  system?: string;
  year?: string;
  sortBy?: 'rows' | 'mainStockRows' | 'contractorStockRows' | 'shortageRows' | 'damagedRows' | 'grossWeight' | 'netWeight' | 'freightCost';
  limit?: number;
}

/**
 * Tool 4: Dynamic GROUP BY analytics across Detailed, General, or Transit.
 */
export function aggregateWarehouseByField(
  db: WarehouseQueryDb,
  params: AggregateWarehouseParams,
  lang: Language = 'fa',
) {
  const scope = params.scope || (params.groupBy === 'overallStatus' ? 'transit' : 'detailed');
  const limit = Math.min(30, Math.max(1, Number(params.limit) || 15));
  const unknownLabel = lang === 'en' ? 'Unspecified' : 'نامشخص';
  const islandFilter = normalizeSearchText(params.island);
  const supplierFilter = normalizeSearchText(params.supplier);
  const systemFilter = normalizeSearchText(params.system);
  const yearFilter = normalizeDigits(String(params.year || '')).trim();

  const extractDateBucket = (iso: string | undefined | null, mode: 'month' | 'year') => {
    const mk = getMonthKeyFromIso(iso || '', lang === 'fa' ? 'jalali' : 'gregorian');
    if (!mk) return unknownLabel;
    return mode === 'year' ? mk.slice(0, 4) : mk;
  };

  if (scope === 'general') {
    const groups = new Map<
      string,
      { key: string; rows: number; uniquePackings: Set<string>; grossWeightKg: number; netWeightKg: number; freightCost: number }
    >();
    for (const g of db.general) {
      if (islandFilter && !normalizeSearchText(g.island).includes(islandFilter)) continue;
      if (supplierFilter && !normalizeSearchText(g.supplier).includes(supplierFilter)) continue;
      if (systemFilter && !normalizeSearchText(g.system).includes(systemFilter)) continue;
      if (yearFilter && !extractDateBucket(g.arrivalDate, 'year').startsWith(yearFilter)) continue;

      let key = unknownLabel;
      if (params.groupBy === 'island') key = normKey(g.island) || unknownLabel;
      else if (params.groupBy === 'supplier') key = normKey(g.supplier) || unknownLabel;
      else if (params.groupBy === 'system') key = normKey(g.system) || unknownLabel;
      else if (params.groupBy === 'subSystem') key = normKey(g.subSystem) || unknownLabel;
      else if (params.groupBy === 'unit') key = normKey(g.unit) || unknownLabel;
      else if (params.groupBy === 'arrivalMonth') key = extractDateBucket(g.arrivalDate, 'month');
      else if (params.groupBy === 'arrivalYear') key = extractDateBucket(g.arrivalDate, 'year');
      else key = normKey(g.island) || unknownLabel;

      let cur = groups.get(key);
      if (!cur) {
        cur = { key, rows: 0, uniquePackings: new Set(), grossWeightKg: 0, netWeightKg: 0, freightCost: 0 };
        groups.set(key, cur);
      }
      cur.rows += 1;
      if (normKey(g.packingListNo)) cur.uniquePackings.add(normKey(g.packingListNo));
      cur.grossWeightKg += g.grossWeight ?? 0;
      cur.netWeightKg += g.netWeight ?? 0;
      cur.freightCost += g.freightCost ?? 0;
    }

    const sortBy = params.sortBy || 'rows';
    const items = Array.from(groups.values())
      .map((x) => ({
        group: x.key,
        rows: x.rows,
        uniquePackings: x.uniquePackings.size,
        grossWeightTons: roundQty(x.grossWeightKg / 1000),
        netWeightTons: roundQty(x.netWeightKg / 1000),
        freightCostSum: roundQty(x.freightCost),
      }))
      .sort((a, b) => {
        if (sortBy === 'grossWeight') return b.grossWeightTons - a.grossWeightTons;
        if (sortBy === 'netWeight') return b.netWeightTons - a.netWeightTons;
        if (sortBy === 'freightCost') return b.freightCostSum - a.freightCostSum;
        return b.rows - a.rows;
      });

    return {
      scope: 'general',
      groupBy: params.groupBy,
      totalGroups: items.length,
      groups: items.slice(0, limit),
    };
  }

  if (scope === 'transit') {
    const groups = new Map<string, { key: string; rows: number; uniquePackings: Set<string>; amountSum: number }>();
    for (const t of db.transit) {
      if (supplierFilter && !normalizeSearchText(t.supplier).includes(supplierFilter)) continue;
      if (systemFilter && !normalizeSearchText(t.system).includes(systemFilter)) continue;
      if (yearFilter && !extractDateBucket(t.arrivalDate, 'year').startsWith(yearFilter)) continue;

      let key = unknownLabel;
      if (params.groupBy === 'overallStatus') key = normalizeTransitStatus(t.overallStatus) || normKey(t.overallStatus) || unknownLabel;
      else if (params.groupBy === 'supplier') key = normKey(t.supplier) || unknownLabel;
      else if (params.groupBy === 'system') key = normKey(t.system) || unknownLabel;
      else if (params.groupBy === 'unit') key = normKey(t.unit) || unknownLabel;
      else if (params.groupBy === 'arrivalMonth') key = extractDateBucket(t.arrivalDate, 'month');
      else if (params.groupBy === 'arrivalYear') key = extractDateBucket(t.arrivalDate, 'year');
      else key = normalizeTransitStatus(t.overallStatus) || unknownLabel;

      let cur = groups.get(key);
      if (!cur) {
        cur = { key, rows: 0, uniquePackings: new Set(), amountSum: 0 };
        groups.set(key, cur);
      }
      cur.rows += 1;
      if (normKey(t.packingListNo)) cur.uniquePackings.add(normKey(t.packingListNo));
      cur.amountSum += t.amount ?? 0;
    }

    const items = Array.from(groups.values())
      .map((x) => ({
        group: x.key,
        rows: x.rows,
        uniquePackings: x.uniquePackings.size,
        amountSum: roundQty(x.amountSum),
      }))
      .sort((a, b) => b.rows - a.rows);

    return {
      scope: 'transit',
      groupBy: params.groupBy,
      totalGroups: items.length,
      groups: items.slice(0, limit),
    };
  }

  // Detailed scope
  const detailedComputed = getDetailedComputedList(db);
  const categoryLabels: Record<string, string> =
    lang === 'en'
      ? { special_tools: 'Special Tools', chemicals: 'Chemicals', spare_parts: 'Spare Parts', '': 'Standard Equipment' }
      : { special_tools: 'ابزارهای مخصوص', chemicals: 'مواد شیمیایی', spare_parts: 'لوازم یدکی', '': 'تجهیز عادی / استاندارد' };

  const groups = new Map<
    string,
    {
      key: string;
      rows: number;
      uniquePackings: Set<string>;
      mainStockRows: number;
      contractorStockRows: number;
      shortageRows: number;
      damagedRows: number;
      openMerRows: number;
      openRepRows: number;
      opiPendingRows: number;
    }
  >();

  for (const d of detailedComputed) {
    if (islandFilter && !normalizeSearchText(d.island).includes(islandFilter)) continue;
    if (supplierFilter && !normalizeSearchText(d.supplier).includes(supplierFilter)) continue;
    if (systemFilter && !normalizeSearchText(d.system).includes(systemFilter)) continue;
    if (yearFilter && !extractDateBucket(d.arrivalDate, 'year').startsWith(yearFilter)) continue;

    let key = unknownLabel;
    if (params.groupBy === 'island') key = normKey(d.island) || unknownLabel;
    else if (params.groupBy === 'supplier') key = normKey(d.supplier) || unknownLabel;
    else if (params.groupBy === 'system') key = normKey(d.system) || unknownLabel;
    else if (params.groupBy === 'subSystem') key = normKey(d.subSystem) || unknownLabel;
    else if (params.groupBy === 'unit') key = normKey(d.unit) || unknownLabel;
    else if (params.groupBy === 'storageLocation') key = normKey(d.storageLocation) || unknownLabel;
    else if (params.groupBy === 'generalDescription') key = normKey(d.generalDescription) || unknownLabel;
    else if (params.groupBy === 'itemCategory') key = categoryLabels[d.itemCategory || ''] || unknownLabel;
    else if (params.groupBy === 'countingUnit') key = formatCountingUnit(d.countingUnit, lang) || unknownLabel;
    else if (params.groupBy === 'arrivalMonth') key = extractDateBucket(d.arrivalDate, 'month');
    else if (params.groupBy === 'arrivalYear') key = extractDateBucket(d.arrivalDate, 'year');

    let cur = groups.get(key);
    if (!cur) {
      cur = {
        key,
        rows: 0,
        uniquePackings: new Set(),
        mainStockRows: 0,
        contractorStockRows: 0,
        shortageRows: 0,
        damagedRows: 0,
        openMerRows: 0,
        openRepRows: 0,
        opiPendingRows: 0,
      };
      groups.set(key, cur);
    }
    cur.rows += 1;
    if (normKey(d.shipmentNo)) cur.uniquePackings.add(normKey(d.shipmentNo));
    if (d.mapnaInventory > 0) cur.mainStockRows += 1;
    if (d.contractorInventory > 0) cur.contractorStockRows += 1;
    if (d.hasShortage) cur.shortageRows += 1;
    if (d.hasDamaged) cur.damagedRows += 1;
    if (isMerOpen(d)) cur.openMerRows += 1;
    if (isRepOpen(d)) cur.openRepRows += 1;
    if (d.opiPending) cur.opiPendingRows += 1;
  }

  const sortBy = params.sortBy || 'rows';
  const items = Array.from(groups.values())
    .map((x) => ({
      group: x.key,
      rows: x.rows,
      uniquePackings: x.uniquePackings.size,
      mainStockRows: x.mainStockRows,
      contractorStockRows: x.contractorStockRows,
      shortageRows: x.shortageRows,
      damagedRows: x.damagedRows,
      openMerRows: x.openMerRows,
      openRepRows: x.openRepRows,
      opiPendingRows: x.opiPendingRows,
    }))
    .sort((a, b) => {
      if (sortBy === 'mainStockRows') return b.mainStockRows - a.mainStockRows;
      if (sortBy === 'contractorStockRows') return b.contractorStockRows - a.contractorStockRows;
      if (sortBy === 'shortageRows') return b.shortageRows - a.shortageRows;
      if (sortBy === 'damagedRows') return b.damagedRows - a.damagedRows;
      return b.rows - a.rows;
    });

  return {
    scope: 'detailed',
    groupBy: params.groupBy,
    totalGroups: items.length,
    groups: items.slice(0, limit),
  };
}

export type OperationalAlertType =
  | 'shortages'
  | 'damaged'
  | 'open_mer'
  | 'open_rep'
  | 'opi_pending'
  | 'expiring_chemicals'
  | 'special_tools'
  | 'spare_parts'
  | 'chemicals'
  | 'transit_shipping'
  | 'transit_inspection'
  | 'transit_arrived';

/**
 * Tool 5: Query operational alerts and special categories.
 */
export function queryOperationalAlerts(
  db: WarehouseQueryDb,
  params: {
    alertType: OperationalAlertType;
    island?: string;
    supplier?: string;
    days?: number;
    limit?: number;
  },
  lang: Language = 'fa',
) {
  const limit = Math.min(40, Math.max(1, Number(params.limit) || 20));
  const islandFilter = normalizeSearchText(params.island);
  const supplierFilter = normalizeSearchText(params.supplier);
  const detailedComputed = getDetailedComputedList(db);

  const filterDetailed = (list: DetailedComputed[]) =>
    list.filter((d) => {
      if (islandFilter && !normalizeSearchText(d.island).includes(islandFilter)) return false;
      if (supplierFilter && !normalizeSearchText(d.supplier).includes(supplierFilter)) return false;
      return true;
    });

  if (params.alertType === 'expiring_chemicals') {
    const days = Math.max(1, Number(params.days) || 30);
    const items = getExpiringChemicals(filterDetailed(detailedComputed), days);
    return {
      alertType: params.alertType,
      daysWindow: days,
      totalCount: items.length,
      items: items.slice(0, limit),
    };
  }

  if (
    params.alertType === 'transit_shipping' ||
    params.alertType === 'transit_inspection' ||
    params.alertType === 'transit_arrived'
  ) {
    const targetStatus =
      params.alertType === 'transit_shipping'
        ? 'در دست ارسال'
        : params.alertType === 'transit_inspection'
          ? 'در دست بازرسی'
          : 'رسیده';
    const matched = db.transit.filter((t) => {
      if (normalizeTransitStatus(t.overallStatus) !== targetStatus) return false;
      if (supplierFilter && !normalizeSearchText(t.supplier).includes(supplierFilter)) return false;
      return true;
    });
    const uniquePackings = new Set(matched.map((t) => normKey(t.packingListNo)).filter(Boolean));
    return {
      alertType: params.alertType,
      statusLabel: targetStatus,
      totalRows: matched.length,
      uniquePackingsCount: uniquePackings.size,
      items: matched.slice(0, limit).map((t) => ({
        packingListNo: t.packingListNo,
        packageNo: t.packageNo,
        itemDescription: t.itemDescription,
        supplier: t.supplier,
        arrivalDate: t.arrivalDate,
        system: t.system,
        overallStatus: targetStatus,
      })),
    };
  }

  let matched: DetailedComputed[] = [];
  if (params.alertType === 'shortages') {
    matched = filterDetailed(detailedComputed.filter((d) => d.hasShortage)).sort((a, b) => b.shortage - a.shortage);
  } else if (params.alertType === 'damaged') {
    matched = filterDetailed(detailedComputed.filter((d) => d.hasDamaged)).sort(
      (a, b) => (b.damagedQty ?? 0) - (a.damagedQty ?? 0),
    );
  } else if (params.alertType === 'open_mer') {
    matched = filterDetailed(detailedComputed.filter((d) => isMerOpen(d)));
  } else if (params.alertType === 'open_rep') {
    matched = filterDetailed(detailedComputed.filter((d) => isRepOpen(d)));
  } else if (params.alertType === 'opi_pending') {
    matched = filterDetailed(detailedComputed.filter((d) => d.opiPending));
  } else if (params.alertType === 'special_tools') {
    matched = filterDetailed(detailedComputed.filter((d) => d.itemCategory === 'special_tools'));
  } else if (params.alertType === 'spare_parts') {
    matched = filterDetailed(detailedComputed.filter((d) => d.itemCategory === 'spare_parts'));
  } else if (params.alertType === 'chemicals') {
    matched = filterDetailed(detailedComputed.filter((d) => d.itemCategory === 'chemicals'));
  }

  return {
    alertType: params.alertType,
    totalCount: matched.length,
    totalsByUnit: aggregateDetailedStockByUnit(matched, lang),
    items: matched.slice(0, limit).map((d) => toDetailedItemView(d, lang)),
  };
}

export type DocumentSearchType =
  | 'all'
  | 'gcv'
  | 'miv'
  | 'opi_invitation'
  | 'opi_minutes'
  | 'site_entry'
  | 'osdr'
  | 'substitution'
  | 'material_estimate'
  | 'periodic_inspection';

/**
 * Tool 6: Search across warehouse official documents (GCV, MIV/SMR, OPI, Site Entry, OSDR, Substitutions, Estimates, Inspections).
 */
export function searchWarehouseDocuments(
  db: WarehouseQueryDb,
  params: { docType?: DocumentSearchType; query?: string; limit?: number },
) {
  const docType = params.docType || 'all';
  const limit = Math.min(30, Math.max(1, Number(params.limit) || 15));
  const groups = parseSearchTerms(params.query || '');

  const matchesDoc = (fields: Array<string | undefined | null>) => {
    if (groups.length === 0) return true;
    const hay = normalizeSearchText(fields.filter(Boolean).join(' '));
    return groups.every((g) => matchesTermGroup(g, hay, ''));
  };

  const results: Array<Record<string, unknown>> = [];

  if (docType === 'all' || docType === 'gcv') {
    for (const r of db.gcvDocuments || []) {
      const itemText = (r.items || []).map((it) => `${it.shipmentNo} ${it.description} ${it.codeNo || ''}`).join(' ');
      if (matchesDoc([r.receiptNo, r.receiver, r.supplier, r.waybillNo, r.notes, itemText])) {
        results.push({
          type: 'GCV',
          docNo: r.receiptNo,
          date: r.date,
          receiver: r.receiver,
          supplier: r.supplier || '',
          itemsCount: r.items?.length || 0,
        });
      }
    }
  }

  if (docType === 'all' || docType === 'miv') {
    for (const r of db.mivDocuments || []) {
      const itemText = (r.items || []).map((it) => `${it.shipmentNo} ${it.description} ${it.codeNo || ''}`).join(' ');
      if (matchesDoc([r.docNo, r.docType, r.party, r.receiver, r.requester, r.supplier, r.notes, itemText])) {
        results.push({
          type: r.docType.toUpperCase(),
          docNo: r.docNo,
          date: r.date,
          party: r.party || r.receiver || r.requester || '',
          supplier: r.supplier || '',
          itemsCount: r.items?.length || 0,
        });
      }
    }
  }

  if (docType === 'all' || docType === 'opi_invitation') {
    for (const r of db.opiInvitations || []) {
      if (matchesDoc([r.invitationNo, (r.packingNos || []).join(' '), r.supplier, r.island, r.system, r.notes])) {
        results.push({
          type: 'OPI_INVITATION',
          docNo: r.invitationNo,
          date: r.date,
          status: r.status,
          packingNos: r.packingNos,
          supplier: r.supplier || '',
        });
      }
    }
  }

  if (docType === 'all' || docType === 'opi_minutes') {
    for (const r of db.opiMinutes || []) {
      if (matchesDoc([r.minutesNo, r.packingListNo, r.merNo, r.supplier, r.island, r.notes])) {
        results.push({
          type: 'OPI_MINUTES',
          docNo: r.minutesNo,
          date: r.date,
          packingListNo: r.packingListNo,
          resultStatus: r.resultStatus,
          merNo: r.merNo || '',
        });
      }
    }
  }

  if (docType === 'all' || docType === 'site_entry') {
    for (const r of db.siteEntryMinutes || []) {
      if (matchesDoc([r.minutesNo, (r.packingListNos || []).join(' '), r.supplier, r.waybillNo, r.driverName, r.notes])) {
        results.push({
          type: 'SITE_ENTRY',
          docNo: r.minutesNo,
          date: r.date,
          packingListNos: r.packingListNos,
          conditionStatus: r.conditionStatus,
          supplier: r.supplier || '',
        });
      }
    }
  }

  if (docType === 'all' || docType === 'osdr') {
    for (const r of db.osdrReports || []) {
      const itemText = (r.items || []).map((it) => `${it.description} ${it.itemCode}`).join(' ');
      if (matchesDoc([r.reportNo, r.packingListNo, r.supplier, r.notes, itemText])) {
        results.push({
          type: 'OSDR',
          docNo: r.reportNo,
          date: r.date,
          packingListNo: r.packingListNo,
          supplier: r.supplier || '',
          itemsCount: r.items?.length || 0,
        });
      }
    }
  }

  if (docType === 'all' || docType === 'substitution') {
    for (const r of db.substitutions || []) {
      if (
        matchesDoc([
          r.docNo,
          r.shipmentNo,
          r.originalDescription,
          r.substituteDescription,
          r.originalItemCode,
          r.substituteItemCode,
          r.supplier,
          r.reason,
        ])
      ) {
        results.push({
          type: 'SUBSTITUTION',
          docNo: r.docNo,
          date: r.date,
          shipmentNo: r.shipmentNo,
          status: r.status,
          originalDescription: r.originalDescription,
          substituteDescription: r.substituteDescription,
          qty: r.qty,
        });
      }
    }
  }

  if (docType === 'all' || docType === 'material_estimate') {
    for (const r of db.materialEstimates || []) {
      if (matchesDoc([r.mtoCode, r.description, r.generalDescription, r.itemCode, r.size, r.island, r.system])) {
        results.push({
          type: 'MATERIAL_ESTIMATE',
          mtoCode: r.mtoCode,
          description: r.description,
          size: r.size,
          estimatedQty: r.estimatedQty,
          countingUnit: r.countingUnit,
          priority: r.priority,
        });
      }
    }
  }

  if (docType === 'all' || docType === 'periodic_inspection') {
    for (const r of db.periodicInspections || []) {
      if (matchesDoc([r.projectName, r.inspectionDate, r.supervisorName])) {
        results.push({
          type: 'PERIODIC_INSPECTION',
          projectName: r.projectName,
          date: r.inspectionDate,
          supervisorName: r.supervisorName,
        });
      }
    }
  }

  return {
    docType,
    query: params.query || '',
    totalMatches: results.length,
    documents: results.slice(0, limit),
  };
}

/**
 * Helper to format a compact Markdown table for item search responses (used by local engine).
 */
export function formatDetailedItemsMarkdownTable(items: DetailedSearchItemView[], lang: Language): string {
  if (items.length === 0) return '';
  const isFa = lang !== 'en';
  const f = (n: number) => formatDisplayNumber(n, lang);

  const header = isFa
    ? '| پکینگ / نگله | شرح کالا | سایز | موجودی انبار اصلی | موجودی پیمانکار | کسری | محل نگهداری |'
    : '| Packing / Pkg | Description | Size | Main Stock | Contractor Stock | Shortage | Location |';
  const sep = '|---|---|---|---|---|---|---|';

  const rows = items.map((it) => {
    const u = it.countingUnit ? ` ${it.countingUnit}` : '';
    const pkg = `${it.shipmentNo || '-'}${it.packageNo ? ` / ${it.packageNo}` : ''}`;
    const desc = (it.description || it.generalDescription || '-').replace(/\|/g, '/').slice(0, 65);
    const sz = (it.size || '-').replace(/\|/g, '/');
    const loc = (it.storageLocation || it.island || '-').replace(/\|/g, '/');
    return `| ${pkg} | ${desc} | ${sz} | ${f(it.mainWarehouseStock)}${u} | ${f(it.contractorStock)}${u} | ${f(it.shortage)}${u} | ${loc} |`;
  });

  return [header, sep, ...rows].join('\n');
}
