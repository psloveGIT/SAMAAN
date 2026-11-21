import { extractChemicalDatesFromTexts } from './chemicalDates.ts';
import {
  detectCsvScope,
  makeId,
  parseDetailedCsv,
  parseGeneralCsv,
  parseTransitCsv,
} from './csvParser.ts';
import { roundQty, toNum } from './formulas.ts';
import { normalizeDigits, parseFlexibleDateToIso } from './jalali.ts';
import {
  inferItemClassification,
  normalizeCountingUnitToFa,
  normalizeTransitStatus,
} from './normalizers.ts';
import {
  analyzeImportDelta,
  hasRecordMeaningfulChanges,
  type ImportDeltaSummary,
} from './importDelta.ts';
import { buildDetailedDupKey, buildGeneralDupKey, buildTransitDupKey } from './tableQuery.ts';
import type {
  CalendarMode,
  CustomFormSubmission,
  DatabaseSnapshot,
  DetailedEntry,
  DocumentLineItem,
  GcvDocumentRecord,
  GeneralEntry,
  MaterialEstimateRecord,
  MivDocType,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
  PeriodicInspectionAnswer,
  PeriodicInspectionRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
} from './types.ts';

export type ImportableDatabase = Omit<DatabaseSnapshot, 'exportedAt' | 'version' | 'auditLogs'> & {
  version?: number;
  exportedAt?: string;
  auditLogs?: DatabaseSnapshot['auditLogs'];
};

export type CoreImportScope = 'general' | 'detailed' | 'transit';

export type OperationalImportScope =
  | 'siteEntryMinutes'
  | 'opiInvitations'
  | 'opiMinutes'
  | 'osdrReports'
  | 'gcvDocuments'
  | 'mivDocuments'
  | 'substitutions'
  | 'materialEstimates'
  | 'materialBalance'
  | 'periodicInspections'
  | 'stocktake'
  | 'customFormSubmissions';

export type ExtendedImportScope = CoreImportScope | OperationalImportScope;

export interface ExtendedScopeMeta {
  scope: ExtendedImportScope;
  isCore: boolean;
  labelFa: string;
  labelEn: string;
  shortFa: string;
  shortEn: string;
  order: number;
}

export const EXTENDED_SCOPE_META: Record<ExtendedImportScope, ExtendedScopeMeta> = {
  transit: {
    scope: 'transit',
    isCore: true,
    labelFa: 'کالاهای در راه',
    labelEn: 'In-Transit Goods',
    shortFa: 'در راه',
    shortEn: 'In-Transit',
    order: 1,
  },
  general: {
    scope: 'general',
    isCore: true,
    labelFa: 'ثبت کلی محموله‌ها',
    labelEn: 'General Manifest',
    shortFa: 'ثبت کلی',
    shortEn: 'General',
    order: 2,
  },
  detailed: {
    scope: 'detailed',
    isCore: true,
    labelFa: 'ثبت جزئیات تجهیزات',
    labelEn: 'Detailed Equipment Inventory',
    shortFa: 'ثبت جزئیات',
    shortEn: 'Detailed',
    order: 3,
  },
  siteEntryMinutes: {
    scope: 'siteEntryMinutes',
    isCore: false,
    labelFa: 'صورتجلسه ورود کالا به کارگاه',
    labelEn: 'Site Entry Minutes',
    shortFa: 'صورتجلسه ورود',
    shortEn: 'Site Entry',
    order: 4,
  },
  opiInvitations: {
    scope: 'opiInvitations',
    isCore: false,
    labelFa: 'دعوتنامه گشایش و بازرسی بسته‌ها',
    labelEn: 'OPI Invitation',
    shortFa: 'دعوتنامه بازرسی',
    shortEn: 'OPI Invite',
    order: 5,
  },
  opiMinutes: {
    scope: 'opiMinutes',
    isCore: false,
    labelFa: 'صورتجلسه گشایش و بازرسی بسته‌ها',
    labelEn: 'OPI Opening & Inspection Minutes',
    shortFa: 'صورتجلسه بازرسی',
    shortEn: 'OPI Minutes',
    order: 6,
  },
  osdrReports: {
    scope: 'osdrReports',
    isCore: false,
    labelFa: 'گزارش مغایرت، کسری و آسیب‌دیدگی',
    labelEn: 'Discrepancy & Damage Report (MER / OSDR)',
    shortFa: 'گزارش کسری و مغایرت',
    shortEn: 'MER / OSDR',
    order: 7,
  },
  gcvDocuments: {
    scope: 'gcvDocuments',
    isCore: false,
    labelFa: 'رسید مصرف مستقیم کالا',
    labelEn: 'Direct Consumption Voucher (GCV)',
    shortFa: 'رسید مصرف مستقیم',
    shortEn: 'GCV Receipt',
    order: 8,
  },
  mivDocuments: {
    scope: 'mivDocuments',
    isCore: false,
    labelFa: 'حواله انبار و فرم ارجاع کالا',
    labelEn: 'Issue Voucher & Return Form (MIV / SMR)',
    shortFa: 'حواله و ارجاع کالا',
    shortEn: 'MIV / SMR',
    order: 9,
  },
  substitutions: {
    scope: 'substitutions',
    isCore: false,
    labelFa: 'فرم‌های جایگزینی تجهیزات',
    labelEn: 'Equipment Substitution Forms',
    shortFa: 'جایگزینی تجهیزات',
    shortEn: 'Substitution',
    order: 10,
  },
  materialEstimates: {
    scope: 'materialEstimates',
    isCore: false,
    labelFa: 'برآورد تجهیزات',
    labelEn: 'Material Estimation (MTO)',
    shortFa: 'برآورد تجهیزات',
    shortEn: 'MTO Estimate',
    order: 11,
  },
  materialBalance: {
    scope: 'materialBalance',
    isCore: false,
    labelFa: 'گزارش موازنه و کنترل مصرف مواد',
    labelEn: 'Material Balance & Consumption Report',
    shortFa: 'موازنه مواد',
    shortEn: 'Material Balance',
    order: 12,
  },
  stocktake: {
    scope: 'stocktake',
    isCore: false,
    labelFa: 'انبارگردانی و وضعیت اقلام',
    labelEn: 'Stocktake (Item Status)',
    shortFa: 'انبارگردانی',
    shortEn: 'Stocktake',
    order: 13,
  },
  periodicInspections: {
    scope: 'periodicInspections',
    isCore: false,
    labelFa: 'بازدید ادواری انبار',
    labelEn: 'Periodic Warehouse Inspection',
    shortFa: 'بازدید ادواری',
    shortEn: 'Periodic Inspection',
    order: 14,
  },
  customFormSubmissions: {
    scope: 'customFormSubmissions',
    isCore: false,
    labelFa: 'فرم‌های اختصاصی ثبت‌شده کارفرما',
    labelEn: 'Custom Employer Forms',
    shortFa: 'فرم‌های اختصاصی',
    shortEn: 'Custom Forms',
    order: 15,
  },
};

export const ALL_EXTENDED_SCOPES: ExtendedImportScope[] = Object.values(EXTENDED_SCOPE_META)
  .sort((a, b) => a.order - b.order)
  .map((m) => m.scope);

export function isOperationalScope(scope: string): scope is OperationalImportScope {
  return scope in EXTENDED_SCOPE_META && !EXTENDED_SCOPE_META[scope as ExtendedImportScope].isCore;
}

export function isExtendedScope(scope: string): scope is ExtendedImportScope {
  return scope in EXTENDED_SCOPE_META;
}

export interface StocktakeImportRow {
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  itemCode: string;
  description: string;
  stocktakeStatus: string;
  stocktakeDate: string;
  stocktakeInfo: string;
  storageLocation?: string;
}

export interface MaterialBalanceImportItem {
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  itemCode: string;
  description: string;
}

export interface MaterialBalanceImportRow {
  reportNo: string;
  balanceStatus: string;
  items: MaterialBalanceImportItem[];
  itemCount: number;
}

export interface ParsedOperationalResult {
  scope: OperationalImportScope;
  records: Record<string, unknown>[];
  skippedEmpty: number;
  warnings: string[];
}

export interface OperationalLinkCounts {
  general: number;
  detailed: number;
  transit: number;
}

export interface OperationalPreviewResult {
  scope: OperationalImportScope;
  totalRows: number;
  skippedEmpty: number;
  duplicateDbCount: number;
  duplicateSamples: string[];
  estimatedLinks: OperationalLinkCounts;
  sample: Record<string, unknown>[];
  parsedRecords: Record<string, unknown>[];
  warnings: string[];
  deltaSummary?: ImportDeltaSummary;
}

export interface OperationalCommitResult {
  scope: OperationalImportScope;
  imported: number;
  replaced: number;
  skipped: number;
  unchangedSkipped?: number;
  linkedGeneral: number;
  linkedDetailed: number;
  linkedTransit: number;
  warnings: string[];
}

// ---------------- NORMALIZATION HELPERS ----------------

function preserveNewlinesRaw(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\r\n?/g, '\n')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim();
}

function normKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

function normMatchKey(v: unknown): string {
  return normalizeDigits(normKey(v)).toLowerCase();
}

function normHeader(h: unknown): string {
  return normalizeDigits(normKey(h))
    .toLowerCase()
    .replace(/[_\-.:()（）/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumberVal(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = normalizeDigits(String(v ?? ''))
    .replace(/[,،٬\s]/g, '')
    .trim();
  if (!s || s === '-' || s === '—') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBoolVal(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = normHeader(v);
  return ['true', '1', 'yes', 'ok', 'بله', 'دارد', 'تایید', 'تأیید', 'انجام شده', '+'].includes(s);
}

function parseDateVal(v: unknown, cal: CalendarMode): string {
  const s = normKey(v);
  if (!s) return '';
  return parseFlexibleDateToIso(s, cal) || s;
}

function splitListValues(v: unknown): string[] {
  if (Array.isArray(v)) {
    return Array.from(new Set(v.map((x) => normKey(x)).filter(Boolean)));
  }
  const s = preserveNewlinesRaw(v);
  if (!s) return [];
  return Array.from(
    new Set(
      s
        .split(/[,،;|/\n]+/)
        .map((x) => normKey(x))
        .filter(Boolean),
    ),
  );
}

function appendUniqueRef(existing: string | undefined, nextVal: string): string {
  const cleanNext = normKey(nextVal);
  if (!cleanNext) return normKey(existing);
  const parts = normKey(existing)
    .split(/\s*[،,;/|\n]+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.some((p) => normMatchKey(p) === normMatchKey(cleanNext))) {
    parts.push(cleanNext);
  }
  return parts.join(' / ');
}

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return v;
    }
  }
  return v;
}

function matchMivDocTypeText(s: string): MivDocType | null {
  if (!s) return null;
  if (s.includes('miv_mapna') || s.includes('miv mapna')) return 'miv_mapna';
  if (s.includes('miv_contractor') || s.includes('miv contractor')) return 'miv_contractor';
  if (s.includes('smr_mapna') || s.includes('smr mapna')) return 'smr_mapna';
  if (s.includes('smr_contractor') || s.includes('smr contractor')) return 'smr_contractor';

  const hasMapna = s.includes('مپنا') || s.includes('mapna') || s.includes('تجهیزات');
  const hasSmr = s.includes('smr') || s.includes('ارجاع') || s.includes('برگشت') || s.includes('return');
  const hasMiv = s.includes('miv') || s.includes('حواله') || s.includes('تحویل');

  if (hasSmr && !hasMiv) return hasMapna ? 'smr_mapna' : 'smr_contractor';
  if (hasMiv && !hasSmr) return hasMapna ? 'miv_mapna' : 'miv_contractor';
  if (hasSmr && hasMiv) return null; // ambiguous combined sheet title like "حواله MIV و SMR"
  return null;
}

function normalizeMivDocType(raw: unknown, sheetHint = ''): MivDocType {
  const fromRow = matchMivDocTypeText(normHeader(raw));
  if (fromRow) return fromRow;
  const fromSheet = matchMivDocTypeText(normHeader(sheetHint));
  if (fromSheet) return fromSheet;
  return 'miv_contractor';
}

function normalizeDiscrepancyType(raw: unknown): OsdrReportItem['discrepancyType'] {
  const s = normHeader(raw);
  const hasDamage = s.includes('damage') || s.includes('آسیب') || s.includes('خراب') || s.includes('شکست');
  const hasShortage = s.includes('short') || s.includes('کسر') || s.includes('ناقص');
  if (hasDamage && hasShortage) return 'shortage_and_damaged';
  if (hasDamage) return 'damaged';
  if (s.includes('surplus') || s.includes('excess') || s.includes('اضاف') || s.includes('مازاد')) return 'surplus';
  return 'shortage';
}

function normalizeSubstitutionStatus(raw: unknown): SubstitutionRecord['status'] {
  const s = normHeader(raw);
  if (
    s.includes('execut') ||
    s.includes('done') ||
    s.includes('closed') ||
    s.includes('close') ||
    s.includes('بسته') ||
    s.includes('مختومه') ||
    s.includes('اجرا') ||
    s.includes('تحویل') ||
    s.includes('تکمیل')
  ) {
    return 'executed';
  }
  if (s.includes('approv') || s.includes('تایید') || s.includes('تأیید') || s.includes('مصوب')) {
    return 'approved';
  }
  return 'pending';
}

// ---------------- SCOPE AUTO-DETECTION ----------------

function normalizeHintToScope(hint?: string): ExtendedImportScope | null {
  if (!hint) return null;
  const h = normHeader(hint);
  if (!h) return null;
  if (isExtendedScope(hint.trim())) return hint.trim() as ExtendedImportScope;

  // Direct Persian & English sheet/section name matching
  if (
    h.includes('siteentry') ||
    h.includes('site entry') ||
    h.includes('arrival notice') ||
    h.includes('صورتجلسه ورود') ||
    h.includes('ورود کالا به کارگاه') ||
    h.includes('ورود به کارگاه')
  ) {
    return 'siteEntryMinutes';
  }
  if (h.includes('opiinvitation') || h.includes('opi invite') || h.includes('دعوتنامه') || (h.includes('invitation') && h.includes('opi'))) {
    return 'opiInvitations';
  }
  if (h.includes('opiminutes') || h.includes('opi minutes') || h.includes('صورتجلسه opi') || h.includes('صورتجلسه گشایش') || h.includes('گشایش و بازرسی')) {
    return 'opiMinutes';
  }
  if (h.includes('osdr') || h.includes('mer') || h.includes('مغایرت') || h.includes('کسری و آسیب') || h.includes('آسیب دیدگی') || h.includes('discrepancy')) {
    return 'osdrReports';
  }
  if (h.includes('gcv') || h.includes('rahkaran') || h.includes('راهکاران') || h.includes('مصرف مستقیم') || h.includes('رسید مصرف') || h.includes('direct consumption')) {
    return 'gcvDocuments';
  }
  if (h.includes('miv') || h.includes('smr') || h.includes('mrv') || h.includes('حواله') || h.includes('فرم ارجاع') || h.includes('ارجاع کالا') || h.includes('issue voucher')) {
    return 'mivDocuments';
  }
  if (h.includes('substitut') || h.includes('جایگزین') || h === 'rep' || h.includes('فرم rep') || h.includes('replacement')) {
    return 'substitutions';
  }
  if (h.includes('materialbalance') || h.includes('material balance') || h.includes('bmr') || h.includes('بالانس') || h.includes('موازنه')) {
    return 'materialBalance';
  }
  if (h.includes('materialestimat') || h.includes('mto') || h.includes('برآورد') || h.includes('estimat')) {
    return 'materialEstimates';
  }
  if (h.includes('periodic') || h.includes('بازدید ادواری') || h.includes('چک لیست بازدید') || h.includes('چک لیست انبار')) {
    return 'periodicInspections';
  }
  if (h.includes('stocktake') || h.includes('انبارگردانی') || h.includes('انبار گردانی')) {
    return 'stocktake';
  }
  if (h.includes('customform') || h.includes('custom form') || h.includes('فرم اختصاصی') || h.includes('فرم های اختصاصی')) {
    return 'customFormSubmissions';
  }
  if (h === 'general' || h.includes('ثبت کلی') || h.includes('جنرال') || h.includes('manifest')) {
    return 'general';
  }
  if (h === 'detailed' || h.includes('جزئیات') || h.includes('دیتیل') || h.includes('inventory')) {
    return 'detailed';
  }
  if (h === 'transit' || h.includes('در راه') || h.includes('در دست حمل')) {
    return 'transit';
  }
  return null;
}

export interface ScoredScopeResult {
  scores: Record<ExtendedImportScope, number>;
  sheetScope: ExtendedImportScope | null;
  coreDetected: ExtendedImportScope | null;
  hintScope: ExtendedImportScope | null;
}

export function scoreExtendedScopes(
  matrix: string[][],
  sheetName?: string,
  sectionHint?: string,
  structuredRecords?: Record<string, unknown>[],
): ScoredScopeResult {
  const hintScope = normalizeHintToScope(sectionHint);

  // Build normalized header/key corpus from structured JSON keys OR first 6 rows of matrix
  const keyTokens: string[] = [];
  if (Array.isArray(structuredRecords) && structuredRecords.length > 0) {
    for (const r of structuredRecords.slice(0, 5)) {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r)) keyTokens.push(normHeader(k));
      }
    }
  }
  const headerRowsText = (matrix || [])
    .slice(0, 6)
    .map((r) => r.map((c) => normHeader(c)).join(' | '))
    .join(' | ');
  const corpus = `${keyTokens.join(' | ')} | ${headerRowsText}`;

  const sheetScope = normalizeHintToScope(sheetName);

  // Score every operational scope + core scope
  const scores: Record<ExtendedImportScope, number> = {
    transit: 0,
    general: 0,
    detailed: 0,
    siteEntryMinutes: 0,
    opiInvitations: 0,
    opiMinutes: 0,
    osdrReports: 0,
    gcvDocuments: 0,
    mivDocuments: 0,
    substitutions: 0,
    materialEstimates: 0,
    materialBalance: 0,
    periodicInspections: 0,
    stocktake: 0,
    customFormSubmissions: 0,
  };

  if (hintScope) {
    scores[hintScope] += 15;
  }

  if (sheetScope) {
    // Give strong prior weight to explicit sheet name (unless headers contradict strongly)
    scores[sheetScope] += 7;
  }

  const addIf = (scope: ExtendedImportScope, patterns: string[], weight: number) => {
    for (const p of patterns) {
      if (corpus.includes(p)) {
        scores[scope] += weight;
        return;
      }
    }
  };

  // --- Core Tables ---
  const coreDetected = matrix && matrix.length > 0 ? detectCsvScope(matrix) : null;
  if (coreDetected) scores[coreDetected] += 4;
  addIf('general', ['وزن ناخالص', 'grossweight', 'gross weight'], 3);
  addIf('general', ['وزن باسکول', 'weighbridgeweight', 'weighbridge'], 3);
  addIf('general', ['کرایه حمل', 'freightcost', 'freight'], 3);
  addIf('general', ['شماره صورتجلسه کارفرما', 'employerentryminutesno'], 3);
  addIf('general', ['شماره صورتجلسه مپنا', 'mapnaentryminutesno'], 2);

  addIf('detailed', ['مقدار پکینگ', 'packingqty', 'packing qty'], 3);
  addIf('detailed', ['شماره بالانس متریال', 'materialbalanceno', 'material balance'], 4);
  addIf('detailed', ['شرح کلی', 'generaldescription', 'general description'], 2);
  addIf('detailed', ['شماره miv پیمانکار', 'mivcontractorno', 'شماره حواله'], 4);
  addIf('detailed', ['شماره smr مپنا', 'smrmapnano', 'شماره برگشتی به انبار کارفرما'], 4);

  addIf('transit', ['شماره رلیزنت', 'releasenetno', 'release net'], 4);
  addIf('transit', ['شماره علی الحساب', 'interimno', 'interim no'], 4);
  addIf('transit', ['اعلام حمل به مپنا', 'mapnashippingnotice', 'shipping notice'], 4);
  addIf('transit', ['وضعیت کلی', 'overallstatus', 'overall status'], 3);
  addIf('transit', ['کد تامین تجهیزات', 'equipmentsupplycode'], 3);

  // --- Rule 1: Site Entry Minutes (صورتجلسه ورود کالا به کارگاه) ---
  addIf('siteEntryMinutes', ['entrytype', 'نوع ورود', 'موقت', 'دائم'], 4);
  addIf('siteEntryMinutes', ['goodsusage', 'کاربری کالا', 'تجهیز کارگاه'], 4);
  addIf('siteEntryMinutes', ['trafficlocation', 'محل تردد'], 4);
  addIf('siteEntryMinutes', ['mapnasecurity', 'نگهبانی مپنا', 'حراست'], 4);
  addIf('siteEntryMinutes', ['conditionstatus', 'وضعیت ظاهری', 'سالم'], 3);
  addIf('siteEntryMinutes', ['warehousekeeper', 'انباردار کارگاه'], 3);
  addIf(
    'siteEntryMinutes',
    [
      'minutesno',
      'mapnaentryminutesno',
      'employerentryminutesno',
      'شماره صورتجلسه ورود',
      'شماره صورتجلسه مپنا',
      'شماره صورتجلسه کارفرما',
      'شماره صورتجلسه',
      'صورتجلسه ورود',
      'arrival notice',
      'an no',
    ],
    5,
  );
  addIf('siteEntryMinutes', ['packinglistnos', 'لیست پکینگ'], 3);

  // --- Rule 2: OPI Invitations & OPI Minutes (دعوتنامه و صورتجلسه گشایش و بازرسی) ---
  addIf(
    'opiInvitations',
    [
      'invitationno',
      'opino',
      'opi no',
      'شماره دعوتنامه',
      'شماره دعوتنامه opi',
      'شماره opi',
      'دعوتنامه بازرسی',
      'دعوتنامه گشایش',
      'opi invitation',
    ],
    6,
  );
  addIf('opiInvitations', ['packingnos', 'پکینگ های دعوتنامه'], 4);
  addIf('opiInvitations', ['installercontractor', 'پیمانکار نصب'], 2);
  addIf('opiInvitations', ['issuedate', 'opidate', 'تاریخ صدور دعوتنامه', 'تاریخ دعوتنامه', 'تاریخ opi', 'ساعت بازرسی', 'زمان بازرسی'], 3);
  addIf('opiInvitations', ['supplierrep', 'نماینده فروشنده'], 2);

  addIf('opiMinutes', ['resultstatus', 'نتیجه بازرسی', 'وضعیت بازرسی'], 5);
  addIf('opiMinutes', ['mapnainspector', 'بازرس مپنا'], 4);
  addIf('opiMinutes', ['employerinspector', 'بازرس کارفرما'], 4);
  addIf('opiMinutes', ['contractorinspector', 'بازرس پیمانکار'], 3);
  addIf('opiMinutes', ['qcinspector', 'بازرس qc', 'کنترل کیفیت'], 2);
  addIf('opiMinutes', ['packagenos', 'نگله های بازرسی'], 3);
  addIf(
    'opiMinutes',
    [
      'شماره صورتجلسه opi',
      'شماره صورتجلسه گشایش',
      'opi minutes',
      'opino',
      'opi no',
      'شماره opi',
      'شماره دعوتنامه',
      'شماره دعوتنامه opi',
      'دعوتنامه بازرسی',
      'گشایش بسته',
    ],
    6,
  );

  // --- OSDR / MER Reports (گزارش مغایرت، کسری و آسیب‌دیدگی) ---
  addIf('osdrReports', ['reportno', 'merno', 'شماره گزارش مغایرت', 'شماره mer', 'شماره گزارش mer', 'شماره osdr', 'شماره کسری مغایرت'], 5);
  addIf('osdrReports', ['discrepancytype', 'نوع مغایرت'], 6);
  addIf('osdrReports', ['discrepancyqty', 'مقدار مغایرت', 'تعداد مغایرت'], 6);
  addIf('osdrReports', ['opiminutesno', 'شماره صورتجلسه opi مرتبط'], 4);
  addIf('osdrReports', ['کسری و آسیب', 'گزارش مغایرت', 'osdr'], 5);

  // --- Rule 3: GCV Documents (رسید مصرف مستقیم کالا) ---
  addIf(
    'gcvDocuments',
    [
      'receiptno',
      'gcvreceiptno',
      'شماره رسید gcv',
      'شماره رسید مصرف',
      'شماره رسید راهکاران',
      'رسید راهکاران',
      'شماره رسید',
      'gcv no',
      'rahkaran',
      'راهکاران',
    ],
    5,
  );
  addIf('gcvDocuments', ['purchaserequestno', 'شماره درخواست خرید', 'درخواست خرید'], 4);
  addIf('gcvDocuments', ['purchaseby', 'خرید توسط'], 4);
  addIf('gcvDocuments', ['buyername', 'نام خریدار', 'کارپرداز'], 4);
  addIf('gcvDocuments', ['receivermanager', 'مدیر تحویل گیرنده'], 4);
  addIf('gcvDocuments', ['mapnasitemanager', 'مدیر کارگاه مپنا'], 3);
  addIf('gcvDocuments', ['مصرف مستقیم', 'gcv', 'تعداد رسید مصرف', 'gcvdeliveredqty'], 4);

  // --- Rules 4 & 5: MIV / SMR Documents (حواله انبار و فرم ارجاع) ---
  addIf('mivDocuments', ['doctype', 'نوع سند', 'نوع حواله', 'نوع فرم حواله'], 5);
  addIf(
    'mivDocuments',
    [
      'docno',
      'mivcontractorno',
      'mivmapnano',
      'smrcontractorno',
      'smrmapnano',
      'شماره حواله',
      'شماره فرم ارجاع',
      'شماره برگشتی',
      'شماره miv',
      'شماره smr',
      'شماره mrv',
      'miv no',
      'smr no',
      'mrv no',
      'material issue voucher',
    ],
    5,
  );
  addIf('mivDocuments', ['returnreason', 'علت ارجاع', 'دلیل برگشت', 'تحویل آورنده'], 5);
  addIf('mivDocuments', ['requestedqty', 'مقدار درخواستی', 'تعداد درخواستی'], 4);
  addIf('mivDocuments', ['installationdept', 'واحد نصب'], 4);
  addIf('mivDocuments', ['installerrep', 'نماینده نصب'], 3);
  addIf('mivDocuments', ['techoffice', 'دفتر فنی'], 3);
  addIf('mivDocuments', ['requester', 'درخواست کننده'], 3);

  // --- Rule 6: Substitutions (فرم‌های جایگزینی تجهیزات) ---
  addIf('substitutions', ['substitutedescription', 'شرح کالای جایگزین', 'مشخصات کالای جایگزین', 'کالای جایگزین'], 7);
  addIf('substitutions', ['substituteitemcode', 'کد کالای جایگزین'], 6);
  addIf('substitutions', ['originaldescription', 'شرح کالای اصلی', 'کالای اصلی'], 4);
  addIf('substitutions', ['reprocureby', 'تامین مجدد توسط', 'تامین مجدد جایگزین شده', 'تأمین مجدد جایگزین شده'], 5);
  addIf('substitutions', ['costborneby', 'هزینه به عهده'], 5);
  addIf(
    'substitutions',
    [
      'repno',
      'rep no',
      'دلیل جایگزینی',
      'شماره سند جایگزینی',
      'شماره جایگزینی',
      'شماره rep',
      'فرم جایگزینی',
      'replacement form',
      'replacement no',
      'substitution',
    ],
    6,
  );
  addIf('substitutions', ['repstatus', 'وضعیت جایگزینی', 'وضعیت rep', 'توضیحات جایگزینی', 'توضیحات rep'], 4);
  addIf('substitutions', ['merncrno', 'شماره mer ncr'], 4);

  // --- Rule 7: Material Balance Reports (گزارش موازنه و کنترل مصرف مواد / BMR) ---
  addIf(
    'materialBalance',
    [
      'materialbalanceno',
      'material balance',
      'شماره بالانس متریال',
      'شماره بالانس',
      'شماره موازنه',
      'موازنه مواد',
      'گزارش موازنه',
      'کنترل مصرف مواد',
      'bmr no',
      'شماره bmr',
      'bmr',
      'balance material report',
    ],
    6,
  );
  addIf('materialBalance', ['balancestatus', 'وضعیت بالانس', 'وضعیت موازنه', 'bmr status'], 4);

  // --- Material Estimates (برآورد تجهیزات MTO) ---
  addIf('materialEstimates', ['estimatedqty', 'مقدار برآورد', 'تعداد برآورد', 'مقدار mto'], 7);
  addIf('materialEstimates', ['mtocode', 'کد mto', 'شماره mto'], 6);
  addIf('materialEstimates', ['priority', 'اولویت', 'حیاتی'], 3);
  addIf('materialEstimates', ['برآورد تجهیزات', 'برآورد کالا'], 5);

  // --- Periodic Inspections (بازدید ادواری انبار) ---
  addIf('periodicInspections', ['inspectiondate', 'تاریخ بازدید ادواری', 'تاریخ بازدید'], 5);
  addIf('periodicInspections', ['supervisorname', 'نام سرپرست', 'سرپرست انبار'], 5);
  addIf('periodicInspections', ['questionkey', 'کد سوال', 'شماره سوال', 'بند چک لیست'], 6);
  addIf('periodicInspections', ['inspectorssignatory', 'بازرسان', 'امضای بازرس'], 4);
  addIf('periodicInspections', ['sitesupervisorsignatory', 'سرپرست کارگاه'], 4);
  addIf('periodicInspections', ['projectmanagersignatory', 'مدیر پروژه'], 3);
  addIf('periodicInspections', ['answers', 'پاسخ چک لیست', 'نتیجه چک لیست'], 4);

  // --- Stocktake (انبارگردانی اقلام) ---
  addIf('stocktake', ['stocktakestatus', 'وضعیت انبارگردانی', 'نتیجه انبارگردانی'], 6);
  addIf('stocktake', ['stocktakedate', 'تاریخ انبارگردانی', 'تاریخ آخرین انبارگردانی'], 6);
  addIf('stocktake', ['stocktakeinfo', 'شرح انبارگردانی', 'اطلاعات انبارگردانی'], 4);

  // --- Custom Employer Forms (فرم‌های اختصاصی ثبت‌شده کارفرما) ---
  addIf('customFormSubmissions', ['formid', 'شناسه فرم', 'کد فرم اختصاصی'], 6);
  addIf('customFormSubmissions', ['formtitle', 'عنوان فرم', 'نام فرم اختصاصی', 'نام فرم'], 6);
  addIf('customFormSubmissions', ['fieldvalues', 'مقادیر فیلدها', 'فیلدهای فرم'], 6);
  addIf('customFormSubmissions', ['فرم اختصاصی', 'custom form'], 5);

  // Disambiguate detailed master table vs operational sub-forms when many detailed columns are present
  if (scores.detailed >= 10 && !sheetScope) {
    scores.detailed += 4;
  }

  return { scores, sheetScope, coreDetected, hintScope };
}

/**
 * Automatically detects whether a spreadsheet matrix / structured JSON records belong to
 * one of the 3 core tables or one of the 11 operational/custom form collections.
 */
export function detectExtendedScope(
  matrix: string[][],
  sheetName?: string,
  sectionHint?: string,
  structuredRecords?: Record<string, unknown>[],
): ExtendedImportScope | null {
  const { scores, sheetScope, coreDetected, hintScope } = scoreExtendedScopes(
    matrix,
    sheetName,
    sectionHint,
    structuredRecords,
  );
  if (hintScope) return hintScope;

  let bestScope: ExtendedImportScope | null = null;
  let bestScore = 0;
  for (const s of ALL_EXTENDED_SCOPES) {
    if (scores[s] > bestScore) {
      bestScore = scores[s];
      bestScope = s;
    }
  }
  return bestScore >= 3 ? bestScope : sheetScope || coreDetected || null;
}

// ---------------- COLUMN / OBJECT EXTRACTION HELPERS ----------------

function findHeaderRowIndex(matrix: string[][]): number {
  const maxScan = Math.min(6, matrix.length);
  let bestRow = 0;
  let bestNonEmpty = -1;
  for (let r = 0; r < maxScan; r += 1) {
    const row = matrix[r] || [];
    const nonEmpty = row.filter((c) => normKey(c) !== '').length;
    const textJoined = row.map(normHeader).join(' ');
    const hasHeaderWord =
      textJoined.includes('شماره') ||
      textJoined.includes('تاریخ') ||
      textJoined.includes('شرح') ||
      textJoined.includes('پکینگ') ||
      textJoined.includes('تامین') ||
      textJoined.includes('no') ||
      textJoined.includes('date') ||
      textJoined.includes('desc') ||
      textJoined.includes('item') ||
      textJoined.includes('packing') ||
      textJoined.includes('form') ||
      textJoined.includes('qty');
    const score = nonEmpty + (hasHeaderWord ? 6 : 0);
    if (score > bestNonEmpty) {
      bestNonEmpty = score;
      bestRow = r;
    }
  }
  return bestRow;
}

// ---------------- O(1) HEADER SCHEMA & FORMULA METADATA ----------------

const ROW_SCHEMA_SYM = Symbol('samaanRowSchema');
const ROW_FORMULAS_SYM = Symbol('samaanRowFormulas');

interface ParsedHeaderKey {
  raw: string;
  displayHeader: string;
  norm: string;
  base: string;
  index: string;
  colIdx: number;
}

interface RowHeaderSchema {
  headers: string[];
  parsed: ParsedHeaderKey[];
  byRaw: Map<string, ParsedHeaderKey>;
  aliasCache: Map<string, string[]>;
}

type EnrichedRow = Record<string, unknown> & {
  [ROW_SCHEMA_SYM]?: RowHeaderSchema;
  [ROW_FORMULAS_SYM]?: Record<string, string>;
};

function buildRowHeaderSchema(headers: Array<{ raw: string; displayHeader: string; colIdx: number }>): RowHeaderSchema {
  const parsed: ParsedHeaderKey[] = [];
  const byRaw = new Map<string, ParsedHeaderKey>();
  for (const h of headers) {
    const norm = normHeader(h.displayHeader);
    const { base, index } = splitHeaderTrailingIndex(h.displayHeader);
    const entry: ParsedHeaderKey = {
      raw: h.raw,
      displayHeader: h.displayHeader,
      norm,
      base,
      index,
      colIdx: h.colIdx,
    };
    parsed.push(entry);
    byRaw.set(h.raw, entry);
  }
  return {
    headers: headers.map((h) => h.raw),
    parsed,
    byRaw,
    aliasCache: new Map(),
  };
}

function getOrBuildRowSchema(row: Record<string, unknown>): RowHeaderSchema {
  const enriched = row as EnrichedRow;
  if (enriched[ROW_SCHEMA_SYM]) return enriched[ROW_SCHEMA_SYM]!;
  const keys = Object.keys(row);
  const schema = buildRowHeaderSchema(
    keys.map((k, idx) => ({ raw: k, displayHeader: k, colIdx: idx })),
  );
  return schema;
}

function getCellFormula(row: Record<string, unknown>, colKey: string): string | undefined {
  const enriched = row as EnrichedRow;
  return enriched[ROW_FORMULAS_SYM]?.[colKey];
}

function matrixToRowObjects(
  matrix: string[][],
  formulaMap?: Record<string, string>,
): { headers: string[]; rows: Record<string, unknown>[]; skippedEmpty: number } {
  if (!matrix || matrix.length === 0) return { headers: [], rows: [], skippedEmpty: 0 };
  const hdrIdx = findHeaderRowIndex(matrix);
  const seenCounts = new Map<string, number>();
  const headerDefs: Array<{ raw: string; displayHeader: string; colIdx: number }> = [];
  const rawHeaderRow = matrix[hdrIdx] || [];

  for (let i = 0; i < rawHeaderRow.length; i += 1) {
    const displayHeader = normKey(rawHeaderRow[i]) || `col_${i + 1}`;
    const prev = seenCounts.get(displayHeader) || 0;
    seenCounts.set(displayHeader, prev + 1);
    const uniqueRaw = prev === 0 ? displayHeader : `${displayHeader}__col${i + 1}`;
    headerDefs.push({ raw: uniqueRaw, displayHeader, colIdx: i });
  }

  const schema = buildRowHeaderSchema(headerDefs);
  const hasFormulas = Boolean(formulaMap && Object.keys(formulaMap).length > 0);
  const rows: Record<string, unknown>[] = [];
  let skippedEmpty = 0;

  for (let r = hdrIdx + 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    let hasVal = false;
    for (let c = 0; c < line.length; c += 1) {
      if (line[c] && normKey(line[c]) !== '') {
        hasVal = true;
        break;
      }
    }
    if (!hasVal) {
      skippedEmpty += 1;
      continue;
    }
    const obj: EnrichedRow = {};
    let rowFormulas: Record<string, string> | undefined;
    for (let c = 0; c < headerDefs.length; c += 1) {
      const rawKey = headerDefs[c].raw;
      obj[rawKey] = line[c] ?? '';
      if (hasFormulas) {
        const f = formulaMap![`${r}:${c}`];
        if (f) {
          if (!rowFormulas) rowFormulas = {};
          rowFormulas[rawKey] = f;
        }
      }
    }
    Object.defineProperty(obj, ROW_SCHEMA_SYM, { value: schema, enumerable: false });
    if (rowFormulas) {
      Object.defineProperty(obj, ROW_FORMULAS_SYM, { value: rowFormulas, enumerable: false });
    }
    rows.push(obj);
  }
  return { headers: headerDefs.map((h) => h.raw), rows, skippedEmpty };
}

function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const schema = getOrBuildRowSchema(row);
  const cacheKey = aliases.join('\u0001');
  let matchingCols = schema.aliasCache.get(cacheKey);
  if (!matchingCols) {
    matchingCols = [];
    const seen = new Set<string>();
    // Pass 1: exact normalized match
    for (const alias of aliases) {
      const a = normHeader(alias);
      for (const pk of schema.parsed) {
        if (pk.norm === a && !seen.has(pk.raw)) {
          seen.add(pk.raw);
          matchingCols.push(pk.raw);
        }
      }
    }
    // Pass 2: substring match
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (a.length < 3) continue;
      for (const pk of schema.parsed) {
        if (pk.norm.includes(a) && !seen.has(pk.raw)) {
          seen.add(pk.raw);
          matchingCols.push(pk.raw);
        }
      }
    }
    schema.aliasCache.set(cacheKey, matchingCols);
  }

  for (const colKey of matchingCols) {
    const val = row[colKey];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }
  return undefined;
}

function strField(row: Record<string, unknown>, aliases: string[], fallback = ''): string {
  const v = getField(row, aliases);
  return normKey(v) || fallback;
}

function numField(row: Record<string, unknown>, aliases: string[], fallback: number | null = null): number | null {
  const v = getField(row, aliases);
  const n = parseNumberVal(v);
  return n !== null ? n : fallback;
}

function dateField(row: Record<string, unknown>, aliases: string[], cal: CalendarMode, fallback = ''): string {
  const v = getField(row, aliases);
  return parseDateVal(v, cal) || fallback;
}

/**
 * Finds an adjacent column relative to `anchorColIdx` in a sheet row whose normalized header
 * matches any pattern in `patterns` (or passes an optional value check).
 */
function findAdjacentColumnKey(
  schema: RowHeaderSchema,
  anchorColIdx: number,
  offsets: number[],
  patterns: string[],
  excludePatterns: string[] = [],
): string | undefined {
  for (const off of offsets) {
    const targetIdx = anchorColIdx + off;
    if (targetIdx < 0 || targetIdx >= schema.parsed.length) continue;
    const pk = schema.parsed[targetIdx];
    if (!pk) continue;
    if (excludePatterns.some((ex) => {
      const nex = normHeader(ex);
      return nex && pk.norm.includes(nex);
    })) {
      continue;
    }
    for (const pat of patterns) {
      const np = normHeader(pat);
      if (np && (pk.norm === np || (np.length >= 2 && pk.norm.includes(np)))) {
        return pk.raw;
      }
    }
  }
  return undefined;
}

// ---------------- MULTI-VALUE & MULTI-COLUMN DOCUMENT EXTRACTION ----------------

interface ExtractedDocTriplet {
  docNo: string;
  date: string;
  qty: number | null;
  party: string;
  note: string;
  status?: string;
  reprocured?: string;
  docTypeHint?: MivDocType;
  anchorColIdx?: number;
}

/**
 * Splits a cell containing one or multiple document numbers (newline, comma, Arabic comma,
 * semicolon, pipe, or spaced slash / slash between two doc tokens) without breaking dates.
 */
export function splitMultiDocValues(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => splitMultiDocValues(item));
  }
  const s = preserveNewlinesRaw(raw);
  if (!s) return [];
  const primaryParts = s
    .split(/[\n،,;|]+/)
    .map((p) => normKey(p))
    .filter((p) => Boolean(p) && p !== '-' && p !== '—' && p !== '--');

  const out: string[] = [];
  for (const part of primaryParts) {
    // Split on spaced slash " / " always
    if (/\s+\/\s+/.test(part)) {
      for (const sub of part.split(/\s+\/\s+/)) {
        const clean = normKey(sub);
        if (clean && clean !== '-' && clean !== '—') out.push(clean);
      }
      continue;
    }
    // Split on tight "/" only when it looks like multiple doc codes (e.g. MIV-101/MIV-102 or GCV-1/GCV-2)
    // and NOT a date like 1404/01/15 or a single code like FQP/01
    if (part.includes('/')) {
      const slashParts = part.split('/').map((x) => normKey(x)).filter(Boolean);
      const looksLikeDate = /^\d{2,4}\/\d{1,2}\/\d{1,4}$/.test(normalizeDigits(part));
      const allLookLikeSeparateDocs =
        slashParts.length >= 2 &&
        slashParts.every((sp) => /[a-zA-Z\u0600-\u06ff]/.test(sp) && /\d/.test(normalizeDigits(sp)) && sp.length >= 4);
      if (!looksLikeDate && allLookLikeSeparateDocs) {
        out.push(...slashParts);
        continue;
      }
    }
    out.push(part);
  }
  return out;
}

function splitMultiDateValues(raw: unknown, cal: CalendarMode): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => parseDateVal(x, cal)).filter(Boolean);
  }
  const s = preserveNewlinesRaw(raw);
  if (!s) return [];
  return s
    .split(/[\n،,;|]+|\s+[-–—]\s+/)
    .map((p) => parseDateVal(p, cal))
    .filter(Boolean);
}

/**
 * Parses Excel addition formulas (e.g. "=2+3+5", "=(1.5+2.5)+4", "=SUM(2,3,5)") or string
 * expressions ("2+3+5") into an ordered array of numeric summands for 1-to-1 mapping with
 * vertically stacked MIV/SMR document numbers. Falls back to multi-line numeric splitting.
 */
export function splitFormulaOrMultiNumValues(raw: unknown, formula?: string): Array<number | null> {
  const exprSource = (formula && formula.trim()) || (typeof raw === 'string' && /[=+]/.test(raw) ? raw.trim() : '');
  if (exprSource) {
    const normExpr = normalizeDigits(exprSource).replace(/\s+/g, '');
    // Match =SUM(a,b,c) or SUM(a;b;c)
    const sumMatch = normExpr.match(/^=?sum\(([^)]+)\)$/i);
    if (sumMatch) {
      const args = sumMatch[1]
        .split(/[,;+]+/)
        .map((p) => parseNumberVal(p))
        .filter((n): n is number => n !== null);
      if (args.length >= 2) return args;
    }
    // Match =2+3+5 or 2+3+5 or =(2+3)+5
    const stripped = normExpr.replace(/^=/, '').replace(/[()]/g, '');
    if (stripped.includes('+')) {
      const parts = stripped.split('+').map((p) => parseNumberVal(p));
      if (parts.length >= 2 && parts.every((n) => n !== null)) {
        return parts;
      }
    }
  }
  return splitMultiNumValues(raw);
}

function splitMultiNumValues(raw: unknown): Array<number | null> {
  if (Array.isArray(raw)) {
    return raw.map((x) => parseNumberVal(x));
  }
  const s = preserveNewlinesRaw(raw);
  if (!s) return [];
  const parts = s
    .split(/[\n،,;|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => parseNumberVal(p));
}

function splitHeaderTrailingIndex(rawKey: string): { base: string; index: string } {
  const norm = normHeader(rawKey);
  // Match trailing index like "شماره حواله 1", "شماره حواله 2", "miv no 1", "docno2"
  const mSpace = norm.match(/^(.*?)\s+(?:#|no|num|شماره)?\s*(\d{1,2})$/i);
  if (mSpace && mSpace[1].trim().length >= 2) {
    return { base: mSpace[1].trim(), index: mSpace[2] };
  }
  const mCompact = norm.match(/^([a-z\u0600-\u06ff]+?)(\d{1,2})$/i);
  if (mCompact && mCompact[1].length >= 3) {
    return { base: mCompact[1].trim(), index: mCompact[2] };
  }
  return { base: norm, index: '' };
}

function headerMatchesAliases(base: string, aliases: string[], excludeAliases: string[] = []): boolean {
  if (!base) return false;
  for (const ex of excludeAliases) {
    const nex = normHeader(ex);
    if (nex && base.includes(nex)) return false;
  }
  for (const al of aliases) {
    const nal = normHeader(al);
    if (!nal) continue;
    if (base === nal || (nal.length >= 3 && base.includes(nal))) {
      return true;
    }
  }
  return false;
}

/**
 * Dynamically discovers ALL single, multi-value (newline/comma/slash), repeated/numbered,
 * AND adjacent-column document groups (with Excel formula support for quantities) inside a row.
 */
function extractMultiDocTriplets(
  row: Record<string, unknown>,
  config: {
    docNoAliases: string[];
    dateAliases?: string[];
    qtyAliases?: string[];
    partyAliases?: string[];
    noteAliases?: string[];
    statusAliases?: string[];
    reprocuredAliases?: string[];
    excludeAliases?: string[];
    docTypeHint?: MivDocType;
    enableAdjacentLookup?: boolean;
  },
  cal: CalendarMode,
): ExtractedDocTriplet[] {
  const schema = getOrBuildRowSchema(row);
  const parsedKeys = schema.parsed;

  // Find ALL columns matching docNoAliases (supporting multiple distinct columns even without trailing numbers)
  const docCols: ParsedHeaderKey[] = [];
  for (const pk of parsedKeys) {
    if (!headerMatchesAliases(pk.base, config.docNoAliases, config.excludeAliases)) continue;
    docCols.push(pk);
  }

  if (docCols.length === 0) return [];

  const docColIndices = new Set(docCols.map((d) => d.colIdx));

  const findCompanionCol = (
    anchor: ParsedHeaderKey,
    aliases: string[] | undefined,
    adjacentFallbackPatterns?: string[],
  ): { colKey: string; val: unknown } | undefined => {
    // Pass 1: Adjacent columns right next to anchor (if enabled & multiple doc cols or generic neighbor exists)
    if (config.enableAdjacentLookup) {
      for (const off of [1, 2, 3, -1]) {
        const tIdx = anchor.colIdx + off;
        if (tIdx < 0 || tIdx >= parsedKeys.length) continue;
        if (docColIndices.has(tIdx)) continue;
        const pk = parsedKeys[tIdx];
        if (!pk) continue;
        // Stop scanning right if another doc column sits between anchor and tIdx
        if (off > 1 && docColIndices.has(anchor.colIdx + 1)) continue;
        if (off > 2 && docColIndices.has(anchor.colIdx + 2)) continue;
        const matchList = adjacentFallbackPatterns && adjacentFallbackPatterns.length > 0
          ? [...(aliases || []), ...adjacentFallbackPatterns]
          : aliases || [];
        if (matchList.length > 0 && headerMatchesAliases(pk.base, matchList, config.excludeAliases)) {
          const v = row[pk.raw];
          const f = getCellFormula(row, pk.raw);
          if ((v !== undefined && v !== null && normKey(v) !== '') || Boolean(f)) {
            return { colKey: pk.raw, val: v };
          }
        }
      }
    }

    if (!aliases || aliases.length === 0) return undefined;
    // Pass 2: exact same trailing index
    for (const pk of parsedKeys) {
      if (pk.index !== anchor.index) continue;
      if (headerMatchesAliases(pk.base, aliases, config.excludeAliases)) {
        const v = row[pk.raw];
        const f = getCellFormula(row, pk.raw);
        if ((v !== undefined && v !== null && normKey(v) !== '') || Boolean(f)) {
          return { colKey: pk.raw, val: v };
        }
      }
    }
    // Pass 3: unindexed fallback (when anchor has a trailing index like "1", "2")
    if (anchor.index !== '') {
      for (const pk of parsedKeys) {
        if (pk.index !== '') continue;
        if (headerMatchesAliases(pk.base, aliases, config.excludeAliases)) {
          const v = row[pk.raw];
          const f = getCellFormula(row, pk.raw);
          if ((v !== undefined && v !== null && normKey(v) !== '') || Boolean(f)) {
            return { colKey: pk.raw, val: v };
          }
        }
      }
    }
    return undefined;
  };

  docCols.sort((a, b) => {
    if (a.index !== b.index) {
      if (a.index === '') return -1;
      if (b.index === '') return 1;
      return Number(a.index) - Number(b.index);
    }
    return a.colIdx - b.colIdx;
  });

  const triplets: ExtractedDocTriplet[] = [];
  for (const anchor of docCols) {
    const docNos = splitMultiDocValues(row[anchor.raw]);
    if (docNos.length === 0) continue;

    const dateHit = findCompanionCol(anchor, config.dateAliases, ['تاریخ', 'date']);
    const qtyHit = findCompanionCol(anchor, config.qtyAliases, ['تعداد', 'مقدار', 'qty', 'quantity']);
    const partyHit = findCompanionCol(anchor, config.partyAliases, ['تحویل گیرنده', 'تحویل آورنده', 'گیرنده', 'receiver', 'deliverer']);
    const noteHit = findCompanionCol(anchor, config.noteAliases, ['توضیحات', 'ملاحظات', 'notes', 'remarks']);
    const statusHit = config.statusAliases
      ? findCompanionCol(anchor, config.statusAliases, ['وضعیت', 'status'])
      : undefined;
    const reprocHit = config.reprocuredAliases
      ? findCompanionCol(anchor, config.reprocuredAliases, ['تامین مجدد', 'تأمین مجدد', 'reprocured'])
      : undefined;

    const dates = splitMultiDateValues(dateHit?.val, cal);
    const qtyFormula = qtyHit ? getCellFormula(row, qtyHit.colKey) : undefined;
    const qtys = splitFormulaOrMultiNumValues(qtyHit?.val, qtyFormula);
    const parties = splitMultiDocValues(partyHit?.val);
    const statuses = splitMultiDocValues(statusHit?.val);
    const reprocuredVals = splitMultiDocValues(reprocHit?.val);
    const noteStr = normKey(noteHit?.val);

    for (let i = 0; i < docNos.length; i += 1) {
      const docNo = docNos[i];
      if (!docNo) continue;
      const dateVal = dates[i] || dates[0] || '';
      const qtyVal =
        qtys[i] !== undefined && qtys[i] !== null
          ? qtys[i]
          : docNos.length === 1 && qtys[0] !== undefined
            ? qtys[0]
            : null;
      const partyVal = parties[i] || parties[0] || '';
      const statusVal = statuses[i] || statuses[0] || '';
      const reprocVal = reprocuredVals[i] || reprocuredVals[0] || '';
      triplets.push({
        docNo,
        date: dateVal,
        qty: qtyVal,
        party: partyVal,
        note: noteStr,
        status: statusVal,
        reprocured: reprocVal,
        docTypeHint: config.docTypeHint,
        anchorColIdx: anchor.colIdx,
      });
    }
  }

  return triplets;
}

// ---------------- PARSERS FOR ALL 12 OPERATIONAL / CUSTOM FORMS ----------------

export function parseOperationalFormInput(params: {
  scope: OperationalImportScope;
  matrix?: string[][];
  formulaMap?: Record<string, string>;
  structuredRecords?: Record<string, unknown>[];
  preparsedRows?: { rows: Record<string, unknown>[]; skippedEmpty: number };
  sheetName?: string;
  assumedCalendar: CalendarMode;
  actorName: string;
}): ParsedOperationalResult {
  const { scope, matrix, formulaMap, structuredRecords, preparsedRows, sheetName = '', assumedCalendar, actorName } = params;
  const now = new Date().toISOString();
  const todayIso = now.slice(0, 10);
  const warnings: string[] = [];

  let sourceRows: Record<string, unknown>[] = [];
  let skippedEmpty = 0;

  if (preparsedRows) {
    sourceRows = preparsedRows.rows;
    skippedEmpty = preparsedRows.skippedEmpty;
  } else if (Array.isArray(structuredRecords) && structuredRecords.length > 0) {
    sourceRows = structuredRecords.filter((r) => r && typeof r === 'object');
  } else if (Array.isArray(matrix) && matrix.length > 0) {
    const converted = matrixToRowObjects(matrix, formulaMap);
    sourceRows = converted.rows;
    skippedEmpty = converted.skippedEmpty;
  }

  if (sourceRows.length === 0) {
    return { scope, records: [], skippedEmpty, warnings };
  }

  // ---- RULE 1: SITE ENTRY MINUTES (صورتجلسه ورود کالا به کارگاه) ----
  if (scope === 'siteEntryMinutes') {
    const byKey = new Map<string, SiteEntryMinutesRecord>();
    let seq = 1;
    const primarySiteEntryDocAliases = [
      'minutesNo',
      'mapnaEntryMinutesNo',
      'شماره صورتجلسه ورود',
      'شماره صورتجلسه مپنا',
      'شماره صورتجلسه',
      'صورتجلسه ورود',
      'arrival notice no',
      'arrival notice',
      'an no',
      'شماره سند',
    ];
    const employerSiteEntryDocAliases = ['employerEntryMinutesNo', 'شماره صورتجلسه کارفرما', 'شماره صورتجلسه ورود کارفرما'];
    const siteEntryDocAliases = [...primarySiteEntryDocAliases, ...employerSiteEntryDocAliases];
    const rowSchema0 = sourceRows.length > 0 ? getOrBuildRowSchema(sourceRows[0]) : null;
    const hasPrimarySiteEntryCol = Boolean(
      rowSchema0?.parsed.some(
        (pk) =>
          headerMatchesAliases(pk.base, primarySiteEntryDocAliases) &&
          !pk.base.includes('کارفرما') &&
          !pk.base.includes('employer'),
      ),
    );
    const hasDocNoCol = Boolean(
      rowSchema0?.parsed.some((pk) => headerMatchesAliases(pk.base, siteEntryDocAliases)),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: hasPrimarySiteEntryCol ? primarySiteEntryDocAliases : siteEntryDocAliases,
          excludeAliases: hasPrimarySiteEntryCol ? ['کارفرما', 'employer'] : undefined,
          dateAliases: ['date', 'arrivalDate', 'تاریخ صورتجلسه', 'تاریخ ورود', 'تاریخ'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const fallbackNo = strField(row, ['minutesNo', 'mapnaEntryMinutesNo', 'شماره صورتجلسه ورود', 'شماره صورتجلسه مپنا', 'شماره صورتجلسه', 'شماره صورتجلسه کارفرما', 'شماره سند']);
      const rawPackings = getField(row, ['packingListNos', 'packingListNo', 'shipmentNo', 'پکینگ لیست', 'شماره پکینگ لیست', 'لیست پکینگ', 'شماره محموله']);
      const packings = splitListValues(rawPackings);
      const baseDate = dateField(row, ['date', 'تاریخ صورتجلسه', 'تاریخ'], assumedCalendar);
      const baseArrival = dateField(row, ['arrivalDate', 'تاریخ ورود'], assumedCalendar, baseDate || todayIso);

      const docsToProcess: Array<{ docNo: string; date: string }> =
        extractedDocs.length > 0
          ? extractedDocs.map((t) => ({ docNo: t.docNo, date: t.date || baseDate }))
          : fallbackNo
            ? [{ docNo: fallbackNo, date: baseDate }]
            : !hasDocNoCol && (packings.length > 0 || strField(row, ['supplier', 'تامین کننده', 'driverName', 'نام راننده']))
              ? [{ docNo: packings[0] ? `SE-${packings[0]}` : `SE-IMP-${seq++}`, date: baseDate }]
              : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const parsedItems: NonNullable<SiteEntryMinutesRecord['items']> = [];
      if (Array.isArray(rawItems)) {
        for (const it of rawItems) {
          if (it && typeof it === 'object') {
            const obj = it as Record<string, unknown>;
            parsedItems.push({
              description: normKey(obj.description),
              packingListNo: normKey(obj.packingListNo),
              packageNo: normKey(obj.packageNo),
              dimensions: normKey(obj.dimensions),
              qty: normKey(obj.qty),
              unit: normalizeCountingUnitToFa(normKey(obj.unit)),
              netWeight: normKey(obj.netWeight),
              grossWeight: normKey(obj.grossWeight),
              remarks: normKey(obj.remarks),
            });
          }
        }
      } else {
        const itemDesc = strField(row, ['itemDescription', 'description', 'شرح کالا', 'شرح تجهیزات', 'شرح']);
        const itemPkg = strField(row, ['packageNo', 'شماره نگله', 'نگله']);
        const itemQty = strField(row, ['qty', 'itemCount', 'تعداد اقلام', 'تعداد', 'مقدار']);
        const netW = strField(row, ['netWeight', 'وزن خالص']);
        const grossW = strField(row, ['grossWeight', 'وزن ناخالص']);
        const lenCm = strField(row, ['lengthCm', 'طول']);
        const widCm = strField(row, ['widthCm', 'عرض']);
        const hgtCm = strField(row, ['heightCm', 'ارتفاع']);
        const dims = strField(row, ['dimensions', 'ابعاد']) || (lenCm || widCm || hgtCm ? `${lenCm || '-'}×${widCm || '-'}×${hgtCm || '-'}` : '');
        if (itemDesc || itemPkg || itemQty || packings.length > 0 || netW || grossW) {
          parsedItems.push({
            description: itemDesc,
            packingListNo: packings[0] || '',
            packageNo: itemPkg,
            dimensions: dims,
            qty: itemQty,
            unit: normalizeCountingUnitToFa(strField(row, ['countingUnit', 'uom', 'واحد شمارش', 'packageType', 'نوع بسته بندی'])),
            netWeight: netW,
            grossWeight: grossW,
            remarks: strField(row, ['remarks', 'ملاحظات']),
          });
        }
      }

      const rowWaybill = strField(row, ['waybillNo', 'billOfLadingNo', 'شماره بارنامه', 'بارنامه']);
      const rowVehicle = strField(row, ['vehicleNo', 'شماره خودرو', 'پلاک']);
      const rowSupplier = strField(row, ['supplier', 'تامین کننده', 'تأمین کننده']);
      const rowOrigin = strField(row, ['origin', 'dispatchLocation', 'مبدا', 'محل ارسال']);
      const rowDriver = strField(row, ['driverName', 'نام راننده', 'راننده']);
      const rowWeighbridge = numField(row, ['weighbridgeWeight', 'وزن باسکول']);
      const rowEmployerMinutes = strField(row, [
        'employerEntryMinutesNo',
        'شماره صورتجلسه ورود کارفرما',
        'صورتجلسه ورود کارفرما',
        'شماره صورتجلسه کارفرما',
      ]);

      for (const docItem of docsToProcess) {
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const arrivalDate = baseArrival || date || todayIso;
        const key = normMatchKey(effectiveNo);
        let existing = byKey.get(key);
        if (!existing) {
          const rawEntryType = normHeader(getField(row, ['entryType', 'نوع ورود']));
          const rawUsage = normHeader(getField(row, ['goodsUsage', 'کاربری کالا']));
          const rawCond = normHeader(getField(row, ['conditionStatus', 'وضعیت ظاهری', 'وضعیت بسته']));
          existing = {
            id: makeId(),
            minutesNo: effectiveNo,
            releaseNoteNo: strField(row, ['releaseNoteNo', 'releaseNo', 'شماره رلیز', 'شماره release note']),
            projectName: strField(row, ['projectName', 'نام پروژه', 'پروژه']),
            entryType: rawEntryType.includes('temp') || rawEntryType.includes('موقت') ? 'temporary' : 'permanent',
            goodsUsage:
              rawUsage.includes('site') || rawUsage.includes('تجهیز')
                ? 'site_equip'
                : rawUsage.includes('general') || rawUsage.includes('عمومی')
                  ? 'general'
                  : 'project',
            contractNo: strField(row, ['contractNo', 'شماره قرارداد', 'قرارداد']),
            date: date || arrivalDate || todayIso,
            arrivalDate: arrivalDate || date || todayIso,
            packingListNos: [...packings],
            supplier: rowSupplier,
            unit: strField(row, ['unit', 'واحد']),
            system: strField(row, ['system', 'سیستم']),
            island: strField(row, ['island', 'جزیره']),
            origin: rowOrigin,
            carrierCompany: strField(row, ['carrierCompany', 'carrierContractor', 'شرکت حمل', 'پیمانکار حمل']),
            trafficLocation: strField(row, ['trafficLocation', 'محل تردد']),
            vehicleType: strField(row, ['vehicleType', 'نوع خودرو']),
            driverName: rowDriver,
            vehicleNo: rowVehicle,
            waybillNo: rowWaybill,
            weighbridgeWeight: rowWeighbridge,
            employerEntryMinutesNo: rowEmployerMinutes,
            items: parsedItems.length > 0 ? [...parsedItems] : undefined,
            warehouseKeeper: strField(row, ['warehouseKeeper', 'انباردار']),
            contractorManager: strField(row, ['contractorManager', 'مدیر پیمانکار']),
            mapnaSecurity: strField(row, ['mapnaSecurity', 'نگهبانی مپنا', 'حراست']),
            qcChecked: parseBoolVal(getField(row, ['qcChecked', 'تایید qc'])),
            qcTechOffice: strField(row, ['qcTechOffice', 'دفتر فنی']),
            hseChecked: parseBoolVal(getField(row, ['hseChecked', 'تایید hse'])),
            hseOfficer: strField(row, ['hseOfficer', 'مسئول hse']),
            equipmentSupply: strField(row, ['equipmentSupply', 'تامین تجهیزات']),
            employerRep: strField(row, ['employerRep', 'نماینده کارفرما']),
            mapnaRep: strField(row, ['mapnaRep', 'نماینده مپنا']),
            conditionStatus:
              rawCond.includes('damage') || rawCond.includes('آسیب')
                ? 'damaged_apparent'
                : rawCond.includes('short') || rawCond.includes('partial') || rawCond.includes('کسر') || rawCond.includes('ناقص')
                  ? 'shortage_suspected'
                  : 'healthy',
            notes: strField(row, ['notes', 'توضیحات']),
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, existing);
        } else {
          existing.packingListNos = Array.from(new Set([...existing.packingListNos, ...packings]));
          if (!existing.waybillNo && rowWaybill) existing.waybillNo = rowWaybill;
          if (!existing.vehicleNo && rowVehicle) existing.vehicleNo = rowVehicle;
          if (!existing.supplier && rowSupplier) existing.supplier = rowSupplier;
          if (!existing.origin && rowOrigin) existing.origin = rowOrigin;
          if (!existing.driverName && rowDriver) existing.driverName = rowDriver;
          if ((existing.weighbridgeWeight === null || existing.weighbridgeWeight === undefined) && rowWeighbridge !== null) {
            existing.weighbridgeWeight = rowWeighbridge;
          }
          if (!existing.employerEntryMinutesNo && rowEmployerMinutes) existing.employerEntryMinutesNo = rowEmployerMinutes;
          if (!existing.arrivalDate && arrivalDate) existing.arrivalDate = arrivalDate;
          if (parsedItems.length > 0) {
            existing.items = [...(existing.items || []), ...parsedItems];
          }
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULE 2A: OPI INVITATIONS (دعوتنامه گشایش و بازرسی بسته‌ها) ----
  if (scope === 'opiInvitations') {
    const byKey = new Map<string, OpiInvitationRecord>();
    let seq = 1;
    const opiInvDocAliases = [
      'invitationNo',
      'opiInvitationNo',
      'opiNo',
      'opi no',
      'شماره دعوتنامه opi',
      'شماره دعوتنامه بازرسی',
      'شماره دعوتنامه',
      'شماره opi',
      'دعوتنامه بازرسی',
      'دعوتنامه گشایش',
      'شماره صورتجلسه opi',
      'opi invitation',
      'شماره سند',
    ];
    const hasDocNoCol = sourceRows.length > 0 && getOrBuildRowSchema(sourceRows[0]).parsed.some((pk) =>
      headerMatchesAliases(pk.base, opiInvDocAliases),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: opiInvDocAliases,
          dateAliases: ['date', 'opiInvitationDate', 'opiDate', 'تاریخ بازرسی', 'تاریخ دعوتنامه', 'تاریخ opi', 'تاریخ'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const packings = splitListValues(
        getField(row, ['packingNos', 'packingListNos', 'packingListNo', 'shipmentNo', 'شماره پکینگ لیست', 'پکینگ لیست', 'لیست پکینگ', 'شماره محموله']),
      );
      const baseDate = dateField(row, ['date', 'opiInvitationDate', 'opiDate', 'تاریخ بازرسی', 'تاریخ دعوتنامه', 'تاریخ opi', 'تاریخ'], assumedCalendar, todayIso);
      const baseIssueDate = dateField(row, ['issueDate', 'تاریخ صدور'], assumedCalendar, baseDate);

      const docsToProcess =
        extractedDocs.length > 0
          ? extractedDocs.map((t) => ({ docNo: t.docNo, date: t.date || baseDate }))
          : !hasDocNoCol && packings.length > 0
            ? [{ docNo: `OPI-INV-${seq++}`, date: baseDate }]
            : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const parsedItems: NonNullable<OpiInvitationRecord['items']> = [];
      if (Array.isArray(rawItems)) {
        for (const it of rawItems) {
          if (it && typeof it === 'object') {
            const obj = it as Record<string, unknown>;
            parsedItems.push({
              itemNo: normKey(obj.itemNo),
              packingListNo: normKey(obj.packingListNo),
              packageNo: normKey(obj.packageNo),
              description: normKey(obj.description),
              uom: normalizeCountingUnitToFa(normKey(obj.uom)),
              remarks: normKey(obj.remarks),
            });
          }
        }
      } else {
        const desc = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
        const pkg = strField(row, ['packageNo', 'شماره نگله']);
        const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
        if (desc || pkg || itemNo) {
          parsedItems.push({
            itemNo,
            packingListNo: packings[0] || '',
            packageNo: pkg,
            description: desc,
            uom: normalizeCountingUnitToFa(strField(row, ['uom', 'countingUnit', 'واحد شمارش'])),
            remarks: strField(row, ['remarks', 'ملاحظات']),
          });
        }
      }

      for (const docItem of docsToProcess) {
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const issueDate = baseIssueDate || date;
        const key = normMatchKey(effectiveNo);

        let existing = byKey.get(key);
        if (!existing) {
          const rawSt = normHeader(getField(row, ['status', 'وضعیت']));
          existing = {
            id: makeId(),
            invitationNo: effectiveNo,
            issueDate,
            date,
            time: strField(row, ['time', 'ساعت', 'زمان بازرسی'], '09:00'),
            packingNos: [...packings],
            location: strField(row, ['location', 'محل بازرسی', 'مکان']),
            projectName: strField(row, ['projectName', 'نام پروژه', 'پروژه']),
            system: strField(row, ['system', 'سیستم']),
            island: strField(row, ['island', 'جزیره']),
            unit: strField(row, ['unit', 'واحد']),
            supplier: strField(row, ['supplier', 'تامین کننده', 'تأمین کننده']),
            contractNo: strField(row, ['contractNo', 'شماره قرارداد']),
            purchasePackageNo: strField(row, ['purchasePackageNo', 'پکیج خرید', 'شماره پکیج خرید']),
            items: parsedItems.length > 0 ? [...parsedItems] : undefined,
            installerContractor: strField(row, ['installerContractor', 'پیمانکار نصب']),
            supplierRep: strField(row, ['supplierRep', 'نماینده فروشنده']),
            equipmentSupply: strField(row, ['equipmentSupply', 'تامین تجهیزات']),
            employerRep: strField(row, ['employerRep', 'نماینده کارفرما']),
            notes: strField(row, ['notes', 'توضیحات']),
            status: rawSt.includes('complet') || rawSt.includes('تکمیل') || rawSt.includes('انجام') ? 'completed' : 'issued',
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, existing);
        } else {
          existing.packingNos = Array.from(new Set([...existing.packingNos, ...packings]));
          if ((!existing.date || existing.date === todayIso) && docItem.date) existing.date = docItem.date;
          if (parsedItems.length > 0) existing.items = [...(existing.items || []), ...parsedItems];
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULE 2B: OPI MINUTES (صورتجلسه گشایش و بازرسی OPI) ----
  if (scope === 'opiMinutes') {
    const byKey = new Map<string, OpiMinutesRecord>();
    let seq = 1;
    const dedicatedOpiMinAliases = [
      'minutesNo',
      'شماره صورتجلسه opi',
      'شماره صورتجلسه گشایش',
      'شماره صورتجلسه',
      'opi minutes',
    ];
    const sharedOpiMinAliases = [
      ...dedicatedOpiMinAliases,
      'opiNo',
      'opi no',
      'invitationNo',
      'opiInvitationNo',
      'شماره دعوتنامه opi',
      'شماره دعوتنامه بازرسی',
      'شماره دعوتنامه',
      'شماره opi',
    ];
    const opiRowSchema0 = sourceRows.length > 0 ? getOrBuildRowSchema(sourceRows[0]) : null;
    const hasDedicatedOpiMinCol = Boolean(
      opiRowSchema0?.parsed.some((pk) => headerMatchesAliases(pk.base, dedicatedOpiMinAliases)),
    );
    const activeOpiMinAliases = hasDedicatedOpiMinCol ? dedicatedOpiMinAliases : sharedOpiMinAliases;
    const hasDocNoCol = Boolean(
      opiRowSchema0?.parsed.some((pk) => headerMatchesAliases(pk.base, activeOpiMinAliases)),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: activeOpiMinAliases,
          excludeAliases: hasDedicatedOpiMinCol ? ['دعوتنامه', 'invitation'] : undefined,
          dateAliases: ['date', 'opiDate', 'opiInvitationDate', 'تاریخ opi', 'تاریخ دعوتنامه', 'تاریخ بازرسی', 'تاریخ'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const packingListNo = strField(row, ['packingListNo', 'shipmentNo', 'شماره پکینگ لیست', 'پکینگ لیست', 'شماره محموله']);
      const baseDate = dateField(row, ['date', 'opiDate', 'opiInvitationDate', 'تاریخ opi', 'تاریخ دعوتنامه', 'تاریخ بازرسی', 'تاریخ'], assumedCalendar, todayIso);
      const packageNos = splitListValues(getField(row, ['packageNos', 'packageNo', 'شماره نگله', 'نگله ها']));

      const docsToProcess =
        extractedDocs.length > 0
          ? extractedDocs.map((t) => ({ docNo: t.docNo, date: t.date || baseDate }))
          : !hasDocNoCol && packingListNo
            ? [{ docNo: `OPI-MIN-${seq++}`, date: baseDate }]
            : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const parsedItems: NonNullable<OpiMinutesRecord['items']> = [];
      if (Array.isArray(rawItems)) {
        for (const it of rawItems) {
          if (it && typeof it === 'object') {
            const obj = it as Record<string, unknown>;
            parsedItems.push({
              itemNo: normKey(obj.itemNo),
              packingListNo: normKey(obj.packingListNo) || packingListNo,
              packageNo: normKey(obj.packageNo),
              description: normKey(obj.description),
              uom: normalizeCountingUnitToFa(normKey(obj.uom)),
              remarks: normKey(obj.remarks),
            });
          }
        }
      } else {
        const desc = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
        const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
        if (desc || packageNos.length > 0 || itemNo) {
          parsedItems.push({
            itemNo,
            packingListNo,
            packageNo: packageNos[0] || '',
            description: desc,
            uom: normalizeCountingUnitToFa(strField(row, ['uom', 'countingUnit', 'واحد شمارش'])),
            remarks: strField(row, ['remarks', 'ملاحظات']),
          });
        }
      }

      for (const docItem of docsToProcess) {
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const key = normMatchKey(effectiveNo);

        let existing = byKey.get(key);
        if (!existing) {
          const rawRes = normHeader(getField(row, ['resultStatus', 'نتیجه بازرسی', 'وضعیت بازرسی', 'نتیجه']));
          const merNo = strField(row, ['merNo', 'شماره mer', 'شماره کسری/مغایرت', 'گزارش مغایرت']);
          existing = {
            id: makeId(),
            minutesNo: effectiveNo,
            invitationNo: strField(row, ['invitationNo', 'opiInvitationNo', 'شماره دعوتنامه']) || effectiveNo,
            date,
            time: strField(row, ['time', 'ساعت']),
            packingListNo,
            packageNos: [...packageNos],
            projectName: strField(row, ['projectName', 'نام پروژه', 'پروژه']),
            supplier: strField(row, ['supplier', 'تامین کننده', 'تأمین کننده']),
            system: strField(row, ['system', 'سیستم']),
            island: strField(row, ['island', 'جزیره']),
            unit: strField(row, ['unit', 'واحد']),
            contractNo: strField(row, ['contractNo', 'شماره قرارداد']),
            purchasePackageNo: strField(row, ['purchasePackageNo', 'پکیج خرید']),
            items: parsedItems.length > 0 ? [...parsedItems] : undefined,
            merNo,
            location: strField(row, ['location', 'محل بازرسی']),
            storekeeper: strField(row, ['storekeeper', 'انباردار']),
            mapnaInspector: strField(row, ['mapnaInspector', 'بازرس مپنا']),
            sellerRep: strField(row, ['sellerRep', 'نماینده فروشنده']),
            employerInspector: strField(row, ['employerInspector', 'بازرس کارفرما']),
            contractorInspector: strField(row, ['contractorInspector', 'بازرس پیمانکار']),
            qcInspector: strField(row, ['qcInspector', 'بازرس qc', 'کنترل کیفیت']),
            resultStatus:
              rawRes.includes('discrep') || rawRes.includes('مغایر') || rawRes.includes('کسر') || rawRes.includes('آسیب') || Boolean(merNo)
                ? 'has_discrepancy'
                : 'compliant',
            notes: strField(row, ['notes', 'توضیحات']),
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, existing);
        } else {
          existing.packageNos = Array.from(new Set([...existing.packageNos, ...packageNos]));
          if ((!existing.date || existing.date === todayIso) && docItem.date) existing.date = docItem.date;
          if (parsedItems.length > 0) existing.items = [...(existing.items || []), ...parsedItems];
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- 4. OSDR / MER REPORTS (گزارش مغایرت، کسری و آسیب‌دیدگی) ----
  if (scope === 'osdrReports') {
    const byKey = new Map<string, OsdrReportRecord>();
    let seq = 1;
    const osdrDocAliases = ['reportNo', 'merNo', 'شماره گزارش مغایرت', 'شماره کسری مغایرت', 'شماره کسری/مغایرت', 'شماره mer', 'شماره گزارش', 'شماره osdr'];
    const hasDocNoCol = sourceRows.length > 0 && getOrBuildRowSchema(sourceRows[0]).parsed.some((pk) =>
      headerMatchesAliases(pk.base, osdrDocAliases),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: osdrDocAliases,
          dateAliases: ['date', 'تاریخ گزارش', 'تاریخ mer', 'تاریخ'],
          qtyAliases: ['discrepancyQty', 'مقدار مغایرت', 'تعداد مغایرت'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const packingListNo = strField(row, ['packingListNo', 'shipmentNo', 'شماره پکینگ لیست', 'شماره محموله', 'پکینگ لیست']);
      const baseDate = dateField(row, ['date', 'تاریخ گزارش', 'تاریخ'], assumedCalendar, todayIso);

      const docsToProcess =
        extractedDocs.length > 0
          ? extractedDocs
          : !hasDocNoCol && packingListNo
            ? [{ docNo: `MER-IMP-${seq++}`, date: baseDate, qty: null, party: '', note: '' }]
            : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const buildItems = (overrideDiscQty: number | null): OsdrReportItem[] => {
        const parsedItems: OsdrReportItem[] = [];
        if (Array.isArray(rawItems)) {
          for (const it of rawItems) {
            if (it && typeof it === 'object') {
              const obj = it as Record<string, unknown>;
              const pQty = parseNumberVal(obj.packingQty) ?? 0;
              const aQty = parseNumberVal(obj.actualQty) ?? 0;
              const dType = normalizeDiscrepancyType(obj.discrepancyType);
              const fallbackDisc = parseNumberVal(obj.discrepancyQty) ?? 0;
              const shortage = parseNumberVal(obj.shortage) ?? (dType === 'shortage' || dType === 'shortage_and_damaged' ? (fallbackDisc || Math.max(0, roundQty(pQty - aQty))) : 0);
              const surplus = parseNumberVal(obj.surplus) ?? (dType === 'surplus' ? (fallbackDisc || Math.max(0, roundQty(aQty - pQty))) : 0);
              const damagedQty = parseNumberVal(obj.damagedQty) ?? (dType === 'damaged' || dType === 'shortage_and_damaged' ? fallbackDisc : 0);
              parsedItems.push({
                detailedId: normKey(obj.detailedId),
                shipmentNo: normKey(obj.shipmentNo) || packingListNo,
                packageNo: normKey(obj.packageNo),
                itemNo: normKey(obj.itemNo),
                itemCode: normKey(obj.itemCode),
                description: normKey(obj.description),
                countingUnit: normalizeCountingUnitToFa(normKey(obj.countingUnit || obj.uom || 'عدد')),
                packingQty: pQty,
                actualQty: aQty,
                shortage,
                surplus,
                damagedQty,
                discrepancyType: dType,
                remarks: normKey(obj.remarks),
              });
            }
          }
        } else {
          const packingQty = numField(row, ['packingQty', 'مقدار پکینگ']);
          const actualQty = numField(row, ['actualQty', 'مقدار واقعی']);
          const damagedRaw = numField(row, ['damagedQty', 'مقدار آسیب دیده', 'آسیب دیده']);
          const shortageRaw = numField(row, ['shortage', 'کسری', 'مقدار کسری']);
          const surplusRaw = numField(row, ['surplus', 'اضافی', 'مقدار اضافی']);
          const explicitDiscType = getField(row, ['discrepancyType', 'نوع مغایرت']);
          let discType: OsdrReportItem['discrepancyType'] = explicitDiscType ? normalizeDiscrepancyType(explicitDiscType) : 'shortage';
          const discQtyRaw = overrideDiscQty ?? numField(row, ['discrepancyQty', 'مقدار مغایرت', 'تعداد مغایرت']);

          const pQty = packingQty ?? 0;
          const aQty = actualQty ?? (packingQty !== null ? Math.max(0, roundQty(packingQty - (shortageRaw ?? (discType === 'shortage' ? (discQtyRaw ?? 0) : 0)))) : 0);
          let shortage = shortageRaw ?? (packingQty !== null && actualQty !== null ? Math.max(0, roundQty(packingQty - actualQty)) : 0);
          let surplus = surplusRaw ?? (packingQty !== null && actualQty !== null ? Math.max(0, roundQty(actualQty - packingQty)) : 0);
          let damagedQty = damagedRaw ?? 0;

          if (discQtyRaw !== null && discQtyRaw > 0) {
            if (discType === 'damaged' && damagedQty === 0) damagedQty = discQtyRaw;
            else if (discType === 'surplus' && surplus === 0) surplus = discQtyRaw;
            else if (discType === 'shortage' && shortage === 0) shortage = discQtyRaw;
            else if (discType === 'shortage_and_damaged') {
              if (shortage === 0) shortage = discQtyRaw;
              if (damagedQty === 0) damagedQty = discQtyRaw;
            }
          }
          if (!explicitDiscType) {
            if (damagedQty > 0 && shortage > 0) discType = 'shortage_and_damaged';
            else if (damagedQty > 0) discType = 'damaged';
            else if (surplus > 0) discType = 'surplus';
            else discType = 'shortage';
          }

          const itemDesc = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
          const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
          const itemCode = strField(row, ['itemCode', 'کد کالا']);
          const packageNo = strField(row, ['packageNo', 'شماره نگله']);
          if (itemDesc || itemNo || itemCode || packageNo || shortage > 0 || surplus > 0 || damagedQty > 0) {
            parsedItems.push({
              detailedId: strField(row, ['detailedId']),
              shipmentNo: packingListNo,
              packageNo,
              itemNo,
              itemCode,
              description: itemDesc,
              countingUnit: normalizeCountingUnitToFa(strField(row, ['countingUnit', 'uom', 'واحد شمارش'], 'عدد')),
              packingQty: pQty,
              actualQty: aQty,
              shortage,
              surplus,
              damagedQty,
              discrepancyType: discType,
              remarks: strField(row, ['remarks', 'شرح مغایرت', 'ملاحظات']),
            });
          }
        }
        return parsedItems;
      };

      for (const docItem of docsToProcess) {
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const key = normMatchKey(effectiveNo);
        const parsedItems = buildItems(docItem.qty);

        let existing = byKey.get(key);
        if (!existing) {
          existing = {
            id: makeId(),
            reportNo: effectiveNo,
            date,
            opiMinutesNo: strField(row, ['opiMinutesNo', 'opiNo', 'شماره صورتجلسه opi', 'شماره opi']),
            packingListNo,
            supplier: strField(row, ['supplier', 'تامین کننده', 'تأمین کننده']),
            items: parsedItems,
            notes: strField(row, ['notes', 'توضیحات']),
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, existing);
        } else if (parsedItems.length > 0) {
          existing.items.push(...parsedItems);
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULE 3: GCV DOCUMENTS (رسید مصرف مستقیم کالا) ----
  if (scope === 'gcvDocuments') {
    const byKey = new Map<string, GcvDocumentRecord>();
    let seq = 1;
    const gcvDocAliases = [
      'receiptNo',
      'gcvReceiptNo',
      'شماره رسید gcv',
      'شماره رسید مصرف',
      'شماره رسید راهکاران',
      'رسید راهکاران',
      'شماره رسید',
      'gcv no',
      'rahkaran',
      'راهکاران',
      'شماره سند',
    ];
    const hasDocNoCol = sourceRows.length > 0 && getOrBuildRowSchema(sourceRows[0]).parsed.some((pk) =>
      headerMatchesAliases(pk.base, gcvDocAliases),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: gcvDocAliases,
          dateAliases: ['date', 'تاریخ رسید مصرف', 'تاریخ رسید راهکاران', 'تاریخ رسید', 'تاریخ gcv', 'تاریخ'],
          qtyAliases: ['gcvDeliveredQty', 'تعداد رسید مصرف', 'مقدار تحویل شده', 'تعداد تحویلی', 'qty', 'تعداد', 'مقدار'],
          partyAliases: ['receiver', 'تحویل گیرنده', 'گیرنده'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const baseReceiver = strField(row, ['receiver', 'تحویل گیرنده', 'گیرنده']);
      const baseDate = dateField(row, ['date', 'تاریخ رسید مصرف', 'تاریخ رسید راهکاران', 'تاریخ رسید', 'تاریخ'], assumedCalendar, todayIso);

      const docsToProcess =
        extractedDocs.length > 0
          ? extractedDocs
          : !hasDocNoCol && baseReceiver
            ? [{ docNo: `GCV-IMP-${seq++}`, date: baseDate, qty: null, party: baseReceiver, note: '' }]
            : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const buildGcvItems = (overrideQty: number | null): DocumentLineItem[] => {
        const parsedItems: DocumentLineItem[] = [];
        if (Array.isArray(rawItems)) {
          for (const it of rawItems) {
            if (it && typeof it === 'object') {
              const obj = it as Record<string, unknown>;
              parsedItems.push({
                detailedId: normKey(obj.detailedId),
                shipmentNo: normKey(obj.shipmentNo || obj.packingListNo),
                packageNo: normKey(obj.packageNo),
                itemNo: normKey(obj.itemNo),
                description: normKey(obj.description),
                qty: parseNumberVal(obj.qty) ?? 1,
                technicalInfo: normKey(obj.technicalInfo),
                tagNo: normKey(obj.tagNo || obj.itemCode),
                uom: normalizeCountingUnitToFa(normKey(obj.uom)),
                remark: normKey(obj.remark || obj.remarks),
              });
            }
          }
        } else {
          const shipmentNo = strField(row, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست', 'پکینگ لیست']);
          const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
          const desc = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
          const qty = overrideQty ?? numField(row, ['qty', 'gcvDeliveredQty', 'تعداد رسید مصرف', 'مقدار تحویل شده', 'تعداد تحویلی', 'تعداد', 'مقدار'], 1) ?? 1;
          if (shipmentNo || itemNo || desc) {
            parsedItems.push({
              detailedId: strField(row, ['detailedId']),
              shipmentNo,
              packageNo: strField(row, ['packageNo', 'شماره نگله']),
              itemNo,
              description: desc,
              qty: qty > 0 ? qty : 1,
              technicalInfo: strField(row, ['technicalInfo', 'size', 'سایز', 'اندازه', 'مشخصات فنی']),
              tagNo: strField(row, ['tagNo', 'itemCode', 'کد کالا', 'تگ']),
              uom: normalizeCountingUnitToFa(strField(row, ['uom', 'countingUnit', 'واحد شمارش'])),
              remark: strField(row, ['remark', 'remarks', 'ملاحظات']),
            });
          }
        }
        return parsedItems;
      };

      for (const docItem of docsToProcess) {
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const receiver = docItem.party || baseReceiver || 'مصرف مستقیم کارگاه';
        const key = normMatchKey(effectiveNo);
        const parsedItems = buildGcvItems(docItem.qty);

        let existing = byKey.get(key);
        if (!existing) {
          const rawPb = normHeader(getField(row, ['purchaseBy', 'خرید توسط']));
          existing = {
            id: makeId(),
            receiptNo: effectiveNo,
            date,
            receiver,
            projectName: strField(row, ['projectName', 'نام پروژه', 'پروژه']),
            purchaseRequestNo: strField(row, ['purchaseRequestNo', 'شماره درخواست خرید', 'درخواست خرید']),
            supplier: strField(row, ['supplier', 'تامین کننده', 'تأمین کننده']),
            buyerName: strField(row, ['buyerName', 'نام خریدار', 'کارپرداز']),
            purchasePackageNo: strField(row, ['purchasePackageNo', 'پکیج خرید']),
            releaseNoteNo: strField(row, ['releaseNoteNo', 'شماره رلیز']),
            purchaseBy:
              rawPb.includes('site') || rawPb.includes('کارگاه')
                ? 'site_admin'
                : rawPb.includes('contractor') || rawPb.includes('پیمانکار')
                  ? 'contractor_supplier'
                  : rawPb.includes('tehran') || rawPb.includes('تهران')
                    ? 'tehran_proc'
                    : undefined,
            islandSystem: strField(row, ['islandSystem', 'جزیره و سیستم', 'سیستم']),
            waybillNo: strField(row, ['waybillNo', 'شماره بارنامه']),
            storekeeper: strField(row, ['storekeeper', 'انباردار']),
            receiverManager: strField(row, ['receiverManager', 'مدیر تحویل گیرنده'], receiver),
            equipmentSupply: strField(row, ['equipmentSupply', 'تامین تجهیزات']),
            mapnaSiteManager: strField(row, ['mapnaSiteManager', 'مدیر کارگاه مپنا']),
            notes: strField(row, ['notes', 'توضیحات']),
            items: parsedItems,
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, existing);
        } else {
          if ((!existing.date || existing.date === todayIso) && docItem.date) existing.date = docItem.date;
          if (parsedItems.length > 0) existing.items.push(...parsedItems);
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULES 4 & 5: MIV / SMR DOCUMENTS (حواله انبار و فرم ارجاع) ----
  if (scope === 'mivDocuments') {
    const byKey = new Map<string, MivDocumentRecord>();
    let seq = 1;
    for (const row of sourceRows) {
      const explicitDocTypeRaw = getField(row, ['docType', 'نوع سند', 'نوع حواله', 'نوع فرم']);
      const hasExplicitDocTypeCol = explicitDocTypeRaw !== undefined && normKey(explicitDocTypeRaw) !== '';
      const defaultDocType = normalizeMivDocType(explicitDocTypeRaw, sheetName);
      const shipmentNo = strField(row, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست']);
      const baseDate = dateField(row, ['date', 'تاریخ حواله', 'تاریخ ارجاع', 'تاریخ'], assumedCalendar, todayIso);

      // Extract ALL typed MIV/SMR columns in the SAME row (numbered cols, multi-value vertical cells, adjacent cols, AND Excel addition formulas!)
      let triplets: Array<ExtractedDocTriplet & { resolvedType: MivDocType }> = [];

      if (hasExplicitDocTypeCol) {
        const genericDocs = extractMultiDocTriplets(
          row,
          {
            docNoAliases: ['docNo', 'mivNo', 'smrNo', 'mrvNo', 'شماره حواله', 'شماره فرم ارجاع', 'شماره برگشتی', 'شماره سند', 'شماره miv', 'شماره smr', 'شماره mrv'],
            dateAliases: ['date', 'تاریخ حواله', 'تاریخ ارجاع', 'تاریخ برگشتی', 'تاریخ'],
            qtyAliases: ['qty', 'مقدار تحویلی', 'مقدار ارجاع', 'مقدار حواله', 'تعداد حواله', 'تعداد تحویل', 'تعداد', 'مقدار'],
            partyAliases: ['party', 'receiver', 'تحویل گیرنده', 'تحویل آورنده', 'پیمانکار', 'طرف مقابل'],
            noteAliases: ['returnReason', 'علت ارجاع', 'دلیل برگشت', 'notes', 'توضیحات'],
            enableAdjacentLookup: true,
          },
          assumedCalendar,
        );
        triplets = genericDocs.map((t) => ({ ...t, resolvedType: defaultDocType }));
      } else {
        // Multi-family detection: a master sheet can have MIV Contractor + MIV Employer/Mapna + SMR Contractor + SMR Employer/Mapna columns simultaneously!
        const mivContractorDocs = extractMultiDocTriplets(
          row,
          {
            docNoAliases: [
              'mivContractorNo',
              'شماره miv پیمانکار',
              'شماره حواله پیمانکار',
              'شماره حواله',
              'شماره miv',
              'miv no',
              'mivNo',
              'material issue voucher',
              'docNo',
            ],
            dateAliases: ['mivContractorDate', 'تاریخ miv پیمانکار', 'تاریخ حواله پیمانکار', 'تاریخ حواله', 'تاریخ miv', 'date', 'تاریخ'],
            qtyAliases: [
              'mivContractorQty',
              'مجموع تعداد تحویل شده با حواله',
              'تعداد تحویل شده با حواله',
              'مقدار حواله پیمانکار',
              'تعداد حواله پیمانکار',
              'مقدار حواله',
              'تعداد حواله',
              'مقدار تحویلی',
              'تعداد تحویل',
              'qty',
              'تعداد',
              'مقدار',
            ],
            partyAliases: ['mivReceiver', 'تحویل گیرنده حواله', 'تحویل گیرنده', 'party', 'پیمانکار'],
            excludeAliases: ['مپنا', 'mapna', 'کارفرما', 'employer', 'برگشت', 'ارجاع', 'smr', 'mrv', 'return'],
            enableAdjacentLookup: true,
          },
          assumedCalendar,
        );
        const mivMapnaDocs = extractMultiDocTriplets(
          row,
          {
            docNoAliases: [
              'mivMapnaNo',
              'شماره miv مپنا',
              'شماره miv کارفرما',
              'شماره حواله مپنا',
              'شماره حواله کارفرما',
              'شماره حواله انبار کارفرما',
              'شماره حواله انبار مپنا',
              'employer miv',
              'mapna miv',
            ],
            dateAliases: ['mivMapnaDate', 'تاریخ miv مپنا', 'تاریخ miv کارفرما', 'تاریخ حواله مپنا', 'تاریخ حواله کارفرما'],
            qtyAliases: ['mivMapnaQty', 'مقدار حواله مپنا', 'تعداد حواله مپنا', 'مقدار حواله کارفرما', 'تعداد حواله کارفرما', 'تعداد miv مپنا', 'تعداد miv کارفرما'],
            partyAliases: ['mivReceiver', 'تحویل گیرنده حواله', 'تحویل گیرنده', 'party'],
            excludeAliases: ['برگشت', 'ارجاع', 'smr', 'mrv', 'return'],
            enableAdjacentLookup: true,
          },
          assumedCalendar,
        );
        const smrContractorDocs = extractMultiDocTriplets(
          row,
          {
            docNoAliases: [
              'smrContractorNo',
              'شماره smr پیمانکار',
              'شماره mrv پیمانکار',
              'شماره برگشتی به انبار پیمانکار',
              'شماره برگشتی پیمانکار',
              'شماره ارجاع پیمانکار',
              'شماره فرم ارجاع',
              'شماره ارجاع',
              'شماره برگشتی',
              'شماره smr',
              'شماره mrv',
              'smr no',
              'mrv no',
              'smrNo',
            ],
            dateAliases: ['smrContractorDate', 'تاریخ برگشتی پیمانکار', 'تاریخ برگشتی به انبار پیمانکار', 'تاریخ ارجاع پیمانکار', 'تاریخ ارجاع', 'تاریخ smr', 'تاریخ mrv'],
            qtyAliases: ['smrContractorQty', 'مقدار برگشتی پیمانکار', 'تعداد برگشتی پیمانکار', 'مقدار برگشتی به انبار پیمانکار', 'تعداد برگشتی', 'مقدار ارجاع', 'تعداد ارجاع'],
            partyAliases: ['smrDeliverer', 'تحویل آورنده', 'party', 'پیمانکار'],
            noteAliases: ['smrContractorNote', 'توضیحات برگشتی پیمانکار', 'علت ارجاع', 'دلیل برگشت'],
            excludeAliases: ['مپنا', 'mapna', 'کارفرما', 'employer'],
            enableAdjacentLookup: true,
          },
          assumedCalendar,
        );
        const smrMapnaDocs = extractMultiDocTriplets(
          row,
          {
            docNoAliases: [
              'smrMapnaNo',
              'شماره smr مپنا',
              'شماره smr کارفرما',
              'شماره mrv مپنا',
              'شماره mrv کارفرما',
              'شماره برگشتی به انبار کارفرما',
              'شماره برگشتی به انبار مپنا',
              'شماره برگشتی کارفرما',
              'شماره ارجاع کارفرما',
              'شماره ارجاع مپنا',
              'employer smr',
              'mapna smr',
            ],
            dateAliases: ['smrMapnaDate', 'تاریخ برگشتی کارفرما', 'تاریخ برگشتی مپنا', 'تاریخ برگشتی به انبار کارفرما', 'تاریخ ارجاع کارفرما'],
            qtyAliases: ['smrMapnaQty', 'مقدار برگشتی کارفرما', 'تعداد برگشتی کارفرما', 'مقدار برگشتی مپنا', 'تعداد برگشتی مپنا', 'مقدار برگشتی به انبار کارفرما'],
            partyAliases: ['smrDeliverer', 'تحویل آورنده', 'party'],
            noteAliases: ['smrMapnaNote', 'توضیحات برگشتی کارفرما', 'توضیحات برگشتی مپنا', 'علت ارجاع'],
            excludeAliases: ['پیمانکار', 'contractor'],
            enableAdjacentLookup: true,
          },
          assumedCalendar,
        );

        for (const t of mivContractorDocs) triplets.push({ ...t, resolvedType: defaultDocType === 'miv_mapna' ? 'miv_mapna' : 'miv_contractor' });
        for (const t of mivMapnaDocs) triplets.push({ ...t, resolvedType: 'miv_mapna' });
        for (const t of smrContractorDocs) triplets.push({ ...t, resolvedType: 'smr_contractor' });
        for (const t of smrMapnaDocs) triplets.push({ ...t, resolvedType: 'smr_mapna' });
      }

      if (triplets.length === 0) {
        if (!shipmentNo && !strField(row, ['description', 'شرح کالا'])) {
          skippedEmpty += 1;
          continue;
        }
        // Only generate synthetic docNo if there is an explicit docType column on a dedicated MIV sheet
        if (hasExplicitDocTypeCol) {
          triplets.push({
            docNo: `${defaultDocType.toUpperCase()}-${seq++}`,
            date: baseDate,
            qty: null,
            party: '',
            note: '',
            resolvedType: defaultDocType,
          });
        } else {
          skippedEmpty += 1;
          continue;
        }
      }

      const rawItems = parseMaybeJson(getField(row, ['items', 'اقلام']));
      const buildMivItems = (overrideQty: number | null, overrideNote: string): DocumentLineItem[] => {
        const parsedItems: DocumentLineItem[] = [];
        if (Array.isArray(rawItems)) {
          for (const it of rawItems) {
            if (it && typeof it === 'object') {
              const obj = it as Record<string, unknown>;
              parsedItems.push({
                detailedId: normKey(obj.detailedId),
                shipmentNo: normKey(obj.shipmentNo || obj.packingListNo),
                packageNo: normKey(obj.packageNo),
                itemNo: normKey(obj.itemNo),
                description: normKey(obj.description),
                qty: parseNumberVal(obj.qty) ?? 1,
                requestedQty: parseNumberVal(obj.requestedQty) ?? undefined,
                technicalInfo: normKey(obj.technicalInfo),
                tagNo: normKey(obj.tagNo || obj.itemCode),
                codeNo: normKey(obj.codeNo || obj.itemCode),
                location: normKey(obj.location),
                uom: normalizeCountingUnitToFa(normKey(obj.uom)),
                opiNo: normKey(obj.opiNo),
                returnReason: normKey(obj.returnReason),
                remark: normKey(obj.remark || obj.remarks),
              });
            }
          }
        } else {
          const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
          const desc = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
          const qty = overrideQty ?? numField(row, ['qty', 'مقدار تحویلی', 'مقدار ارجاع', 'مقدار حواله', 'تعداد', 'مقدار'], 1) ?? 1;
          const reqQty = numField(row, ['requestedQty', 'مقدار درخواستی', 'تعداد درخواستی']);
          if (shipmentNo || itemNo || desc) {
            parsedItems.push({
              detailedId: strField(row, ['detailedId']),
              shipmentNo,
              packageNo: strField(row, ['packageNo', 'شماره نگله']),
              itemNo,
              description: desc,
              qty: qty > 0 ? qty : 1,
              requestedQty: reqQty !== null && reqQty > 0 ? reqQty : qty > 0 ? qty : 1,
              technicalInfo: strField(row, ['technicalInfo', 'size', 'سایز', 'اندازه']),
              tagNo: strField(row, ['tagNo', 'itemCode', 'کد کالا']),
              codeNo: strField(row, ['codeNo', 'itemCode', 'کد کالا']),
              location: strField(row, ['location', 'storageLocation', 'محل نگهداری']),
              uom: normalizeCountingUnitToFa(strField(row, ['uom', 'countingUnit', 'واحد شمارش'])),
              opiNo: strField(row, ['opiNo', 'شماره opi', 'شماره دعوتنامه']),
              returnReason: overrideNote || strField(row, ['returnReason', 'علت ارجاع', 'دلیل برگشت']),
              remark: strField(row, ['remark', 'remarks', 'ملاحظات']),
            });
          }
        }
        return parsedItems;
      };

      for (const docItem of triplets) {
        const docType = docItem.resolvedType;
        const effectiveNo = docItem.docNo;
        const date = docItem.date || baseDate;
        const key = `${docType}|${normMatchKey(effectiveNo)}`;
        const parsedItems = buildMivItems(docItem.qty, docItem.note);

        const existing = byKey.get(key);
        if (!existing) {
          const created: MivDocumentRecord = {
            id: makeId(),
            docType,
            docNo: effectiveNo,
            date,
            party:
              docItem.party ||
              (docType.startsWith('smr')
                ? strField(row, ['deliverer', 'smrDeliverer', 'تحویل آورنده', 'party', 'طرف مقابل', 'پیمانکار'])
                : strField(row, ['party', 'طرف مقابل', 'پیمانکار', 'واحد گیرنده', 'تحویل گیرنده'])),
            projectName: strField(row, ['projectName', 'نام پروژه', 'پروژه']),
            contractNo: strField(row, ['contractNo', 'شماره قرارداد']),
            purchasePackageNo: strField(row, ['purchasePackageNo', 'پکیج خرید']),
            supplier: strField(row, ['supplier', 'تامین کننده']),
            releaseNoteNo: strField(row, ['releaseNoteNo', 'شماره رلیز']),
            islandSystem: strField(row, ['islandSystem', 'جزیره و سیستم', 'سیستم']),
            unit: strField(row, ['unit', 'واحد']),
            receiptNo: strField(row, ['receiptNo', 'شماره رسید']),
            storekeeper: strField(row, ['storekeeper', 'انباردار']),
            equipmentSupply: strField(row, ['equipmentSupply', 'تامین تجهیزات']),
            techOffice: strField(row, ['techOffice', 'دفتر فنی']),
            installationDept: strField(row, ['installationDept', 'واحد نصب']),
            qcInspector: strField(row, ['qcInspector', 'کنترل کیفیت']),
            installerRep: strField(row, ['installerRep', 'نماینده نصب']),
            requester: strField(row, ['requester', 'درخواست کننده']),
            receiver:
              docItem.party ||
              strField(row, ['receiver', 'mivReceiver', 'deliverer', 'smrDeliverer', 'تحویل گیرنده حواله', 'تحویل گیرنده', 'تحویل آورنده']),
            notes: docItem.note || strField(row, ['notes', 'توضیحات']),
            items: parsedItems,
            createdAt: now,
            createdBy: actorName,
          };
          byKey.set(key, created);
        } else {
          if ((!existing.date || existing.date === todayIso) && docItem.date) existing.date = docItem.date;
          if (parsedItems.length > 0) existing.items.push(...parsedItems);
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULE 6: SUBSTITUTIONS (فرم‌های جایگزینی تجهیزات) ----
  if (scope === 'substitutions') {
    const byKey = new Map<string, SubstitutionRecord>();
    let seq = 1;
    const subDocAliases = [
      'docNo',
      'repNo',
      'rep no',
      'replacement no',
      'replacement form',
      'شماره فرم جایگزینی',
      'شماره سند جایگزینی',
      'شماره جایگزینی',
      'شماره rep',
      'شماره فرم',
      'شماره سند',
    ];
    const hasDocNoCol = sourceRows.length > 0 && getOrBuildRowSchema(sourceRows[0]).parsed.some((pk) =>
      headerMatchesAliases(pk.base, subDocAliases),
    );
    for (const row of sourceRows) {
      const extractedDocs = extractMultiDocTriplets(
        row,
        {
          docNoAliases: subDocAliases,
          dateAliases: ['date', 'تاریخ جایگزینی', 'تاریخ'],
          qtyAliases: ['qty', 'تعداد جایگزینی', 'تعداد', 'مقدار'],
          statusAliases: ['status', 'repStatus', 'وضعیت جایگزینی', 'وضعیت rep', 'وضعیت'],
          reprocuredAliases: ['repReprocured', 'reprocured', 'تأمین مجدد جایگزین شده', 'تامین مجدد جایگزین شده', 'تامین مجدد'],
          noteAliases: ['repDescription', 'توضیحات جایگزینی', 'توضیحات rep', 'notes', 'توضیحات'],
          enableAdjacentLookup: true,
        },
        assumedCalendar,
      );
      const subDesc = strField(row, ['substituteDescription', 'شرح کالای جایگزین', 'مشخصات کالای جایگزین', 'کالای جایگزین']);
      const origDesc = strField(row, ['originalDescription', 'description', 'شرح کالای اصلی', 'شرح کالا', 'شرح']);
      const baseDate = dateField(row, ['date', 'تاریخ جایگزینی', 'تاریخ'], assumedCalendar, todayIso);

      const docsToProcess =
        extractedDocs.length > 0
          ? extractedDocs
          : !hasDocNoCol && (subDesc || origDesc)
            ? [{ docNo: `SUB-IMP-${seq++}`, date: baseDate, qty: null, party: '', note: '', status: '', reprocured: '' }]
            : [];

      if (docsToProcess.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      for (const docItem of docsToProcess) {
        const qty = docItem.qty ?? numField(row, ['qty', 'تعداد جایگزینی', 'تعداد', 'مقدار'], 1) ?? 1;
        const rawStatusVal = docItem.status || getField(row, ['repStatus', 'status', 'وضعیت جایگزینی', 'وضعیت rep', 'وضعیت']);
        const rawReproc = docItem.reprocured || strField(row, ['repReprocured', 'reprocured', 'تأمین مجدد جایگزین شده', 'تامین مجدد جایگزین شده']);
        const rawNotes = docItem.note || strField(row, ['repDescription', 'توضیحات جایگزینی', 'توضیحات rep', 'notes', 'توضیحات']);
        const key = normMatchKey(docItem.docNo);
        const existing = byKey.get(key);

        if (!existing) {
          byKey.set(key, {
            id: makeId(),
            docNo: docItem.docNo,
            date: docItem.date || baseDate,
            detailedId: strField(row, ['detailedId']),
            shipmentNo: strField(row, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست', 'پکینگ لیست مبدا', 'پکینگ لیست']),
            packageNo: strField(row, ['packageNo', 'شماره نگله']),
            itemNo: strField(row, ['itemNo', 'شماره آیتم']),
            projectName: strField(row, ['projectName', 'نام پروژه']),
            contractNo: strField(row, ['contractNo', 'شماره قرارداد']),
            system: strField(row, ['system', 'سیستم']),
            island: strField(row, ['island', 'جزیره']),
            unit: strField(row, ['unit', 'واحد', 'واحد مبدا']),
            supplier: strField(row, ['supplier', 'تامین کننده']),
            supplyUrgency: strField(row, ['supplyUrgency', 'فوریت تامین']),
            installerContractor: strField(row, ['installerContractor', 'پیمانکار نصب']),
            mivNo: strField(row, ['mivNo', 'شماره miv']),
            merNcrNo: strField(row, ['merNcrNo', 'merNo', 'شماره mer', 'شماره کسری/مغایرت']),
            originalDescription: origDesc,
            originalItemCode: strField(row, ['originalItemCode', 'itemCode', 'کد کالای اصلی', 'کد کالا']),
            originalDrawingNo: strField(row, ['originalDrawingNo', 'شماره نقشه اصلی']),
            originalRemarks: strField(row, ['originalRemarks', 'ملاحظات کالای اصلی']),
            substitutePackageNo: strField(row, ['substitutePackageNo', 'نگله جایگزین']),
            substituteDescription: subDesc || origDesc || '-',
            substituteItemCode: strField(row, ['substituteItemCode', 'کد کالای جایگزین']),
            substituteSize: strField(row, ['substituteSize', 'سایز جایگزین', 'اندازه جایگزین']),
            substituteDrawingNo: strField(row, ['substituteDrawingNo', 'شماره نقشه جایگزین']),
            substituteRemarks: strField(row, ['substituteRemarks', 'ملاحظات جایگزین']),
            qty: qty > 0 ? qty : 1,
            countingUnit: normalizeCountingUnitToFa(strField(row, ['countingUnit', 'uom', 'واحد شمارش'])) || 'عدد',
            reason: strField(row, ['reason', 'دلیل جایگزینی', 'علت جایگزینی'], rawNotes || 'جایگزینی تجهیز'),
            supplierNotes: strField(row, ['supplierNotes', 'توضیحات تامین کننده']),
            reprocureBy: strField(row, ['reprocureBy', 'تامین مجدد توسط']),
            reprocured: rawReproc,
            costBorneBy: strField(row, ['costBorneBy', 'هزینه به عهده']),
            approvedBy: strField(row, ['approvedBy', 'تایید کننده']),
            mapnaRep: strField(row, ['mapnaRep', 'نماینده مپنا']),
            installerSignatory: strField(row, ['installerSignatory', 'امضای پیمانکار نصب']),
            supplierSignatory: strField(row, ['supplierSignatory', 'امضای فروشنده']),
            status: normalizeSubstitutionStatus(rawStatusVal),
            notes: rawNotes,
            createdAt: now,
            createdBy: actorName,
          });
        } else {
          // Group identical substitution numbers across rows into ONE record
          existing.qty = roundQty((existing.qty || 0) + (qty > 0 ? qty : 1));
          if (origDesc && !existing.originalDescription.includes(origDesc)) {
            existing.originalDescription = existing.originalDescription
              ? `${existing.originalDescription} | ${origDesc}`
              : origDesc;
          }
          if (rawNotes && !existing.notes?.includes(rawNotes)) {
            existing.notes = existing.notes ? `${existing.notes} | ${rawNotes}` : rawNotes;
          }
          if (!existing.reprocured && rawReproc) existing.reprocured = rawReproc;
          if (rawStatusVal && existing.status === 'pending') {
            existing.status = normalizeSubstitutionStatus(rawStatusVal);
          }
        }
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- RULE 7: MATERIAL BALANCE REPORT (گزارش موازنه و کنترل مصرف مواد / BMR) ----
  if (scope === 'materialBalance') {
    const byKey = new Map<string, MaterialBalanceImportRow>();
    const bmrDocAliases = [
      'materialBalanceNo',
      'material balance no',
      'material balance',
      'bmrNo',
      'bmr no',
      'bmr',
      'شماره بالانس متریال',
      'شماره بالانس',
      'شماره موازنه',
      'شماره گزارش موازنه',
      'موازنه مواد',
      'گزارش موازنه',
      'کنترل مصرف مواد',
      'شماره bmr',
      'بالانس متریال',
    ];
    const bmrStatusPatterns = [
      'balanceStatus',
      'balance status',
      'bmr status',
      'وضعیت بالانس',
      'وضعیت موازنه',
      'وضعیت کنترل مصرف',
      'وضعیت',
      'status',
    ];

    for (const row of sourceRows) {
      const schema = getOrBuildRowSchema(row);
      const docCols = schema.parsed.filter((pk) => headerMatchesAliases(pk.base, bmrDocAliases));
      if (docCols.length === 0) {
        skippedEmpty += 1;
        continue;
      }

      const shipmentNo = strField(row, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست']);
      const packageNo = strField(row, ['packageNo', 'شماره نگله']);
      const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
      const itemCode = strField(row, ['itemCode', 'کد کالا']);
      const description = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح']);

      let foundAny = false;
      for (const anchor of docCols) {
        const reportNos = splitMultiDocValues(row[anchor.raw]);
        if (reportNos.length === 0) continue;
        foundAny = true;

        // Rule 7 explicitly requires checking NEXT OR PREVIOUS adjacent column for status!
        const adjStatusColKey = findAdjacentColumnKey(
          schema,
          anchor.colIdx,
          [1, -1, 2, -2],
          bmrStatusPatterns,
          ['مر', 'mer', 'rep', 'جایگزین', 'انبارگردانی', 'stocktake'],
        );
        const rawStatusVal = adjStatusColKey
          ? row[adjStatusColKey]
          : getField(row, ['balanceStatus', 'وضعیت بالانس', 'وضعیت موازنه', 'bmr status']);
        const statusVals = splitMultiDocValues(rawStatusVal);

        for (let i = 0; i < reportNos.length; i += 1) {
          const reportNo = reportNos[i];
          const balanceStatus = statusVals[i] || statusVals[0] || '';
          const key = normMatchKey(reportNo);
          let existing = byKey.get(key);
          const itemObj: MaterialBalanceImportItem = {
            shipmentNo,
            packageNo,
            itemNo,
            itemCode,
            description,
          };
          if (!existing) {
            existing = {
              reportNo,
              balanceStatus,
              items: shipmentNo || itemCode || description ? [itemObj] : [],
              itemCount: shipmentNo || itemCode || description ? 1 : 0,
            };
            byKey.set(key, existing);
          } else {
            if (!existing.balanceStatus && balanceStatus) existing.balanceStatus = balanceStatus;
            if (shipmentNo || itemCode || description) {
              existing.items.push(itemObj);
              existing.itemCount = existing.items.length;
            }
          }
        }
      }

      if (!foundAny) {
        skippedEmpty += 1;
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- 8. MATERIAL ESTIMATES (برآورد تجهیزات MTO) ----
  if (scope === 'materialEstimates') {
    const out: MaterialEstimateRecord[] = [];
    for (const row of sourceRows) {
      const description = strField(row, ['description', 'itemDescription', 'شرح کالا', 'شرح تجهیزات', 'شرح']);
      const mtoCode = strField(row, ['mtoCode', 'mtoRef', 'شماره برآورد mto', 'شماره برآورد', 'کد برآورد', 'کد mto', 'شماره mto', 'mto']);
      const itemCode = strField(row, ['itemCode', 'کد کالا']);
      if (!description && !mtoCode && !itemCode) {
        skippedEmpty += 1;
        continue;
      }
      const cleanDesc = description || mtoCode || itemCode;
      const rawGen = strField(row, ['generalDescription', 'شرح کلی']);
      const estQty = numField(row, ['estimatedQty', 'qty', 'مقدار برآورد', 'تعداد برآورد', 'مقدار', 'تعداد'], 1) ?? 1;
      const rawPrio = normHeader(getField(row, ['priority', 'اولویت']));
      out.push({
        id: makeId(),
        mtoCode,
        generalDescription: rawGen,
        description: cleanDesc,
        itemCode,
        size: strField(row, ['size', 'اندازه', 'سایز']),
        countingUnit: normalizeCountingUnitToFa(strField(row, ['countingUnit', 'uom', 'واحد شمارش'])) || 'عدد',
        estimatedQty: roundQty(estQty > 0 ? estQty : 1),
        island: strField(row, ['island', 'جزیره']),
        system: strField(row, ['system', 'سیستم']),
        subSystem: strField(row, ['subSystem', 'ساب سیستم']),
        unit: strField(row, ['unit', 'واحد']),
        priority: rawPrio.includes('crit') || rawPrio.includes('حیاتی') || rawPrio.includes('بحران') || rawPrio.includes('فوری') ? 'critical' : 'normal',
        notes: strField(row, ['notes', 'توضیحات']),
        createdAt: now,
        updatedAt: now,
        createdBy: actorName,
      });
    }
    return { scope, records: out as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- 9A. PERIODIC INSPECTIONS (بازدید ادواری انبار - چک‌لیست) ----
  if (scope === 'periodicInspections') {
    const byKey = new Map<string, PeriodicInspectionRecord>();
    for (const row of sourceRows) {
      const inspectionDate = dateField(row, ['inspectionDate', 'date', 'تاریخ بازدید ادواری', 'تاریخ بازدید', 'تاریخ'], assumedCalendar, todayIso);
      const projectName = strField(row, ['projectName', 'نام پروژه', 'پروژه']);
      const supervisorName = strField(row, ['supervisorName', 'نام سرپرست', 'سرپرست انبار']);
      const qKey = strField(row, ['questionKey', 'کد سوال', 'شماره سوال', 'بند']);

      if (!inspectionDate && !projectName && !supervisorName && !qKey && !getField(row, ['answers'])) {
        skippedEmpty += 1;
        continue;
      }

      const groupKey = `${normMatchKey(inspectionDate)}|${normMatchKey(projectName)}|${normMatchKey(supervisorName)}`;
      const rawAnswers = parseMaybeJson(getField(row, ['answers', 'پاسخ ها', 'پاسخ چک لیست']));
      const parsedAnswers: PeriodicInspectionAnswer[] = [];
      if (Array.isArray(rawAnswers)) {
        for (const a of rawAnswers) {
          if (a && typeof a === 'object') {
            const obj = a as Record<string, unknown>;
            const rawSt = normKey(obj.status);
            parsedAnswers.push({
              questionKey: normKey(obj.questionKey),
              status: rawSt === '+' || rawSt === 'مثبت' || rawSt === 'بله' ? '+' : rawSt === '-' || rawSt === 'منفی' || rawSt === 'خیر' ? '-' : '',
              remarks: normKey(obj.remarks),
            });
          }
        }
      } else if (qKey) {
        const rawSt = normKey(getField(row, ['status', 'وضعیت', 'نتیجه']));
        parsedAnswers.push({
          questionKey: qKey,
          status: rawSt === '+' || rawSt === 'مثبت' || rawSt === 'بله' || rawSt === 'ok' ? '+' : rawSt === '-' || rawSt === 'منفی' || rawSt === 'خیر' ? '-' : '',
          remarks: strField(row, ['remarks', 'توضیحات', 'ملاحظات']),
        });
      }

      let existing = byKey.get(groupKey);
      if (!existing) {
        existing = {
          id: makeId(),
          projectName,
          inspectionDate: inspectionDate || todayIso,
          supervisorName,
          inspectorsSignatory: strField(row, ['inspectorsSignatory', 'بازرسان', 'امضای بازرسان']),
          siteSupervisorSignatory: strField(row, ['siteSupervisorSignatory', 'سرپرست کارگاه']),
          projectManagerSignatory: strField(row, ['projectManagerSignatory', 'مدیر پروژه']),
          copyTo: strField(row, ['copyTo', 'رونوشت']),
          answers: parsedAnswers,
          createdAt: now,
          createdBy: actorName,
        };
        byKey.set(groupKey, existing);
      } else if (parsedAnswers.length > 0) {
        existing.answers.push(...parsedAnswers);
      }
    }
    return { scope, records: Array.from(byKey.values()) as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- 9B. STOCKTAKE (انبارگردانی اقلام جزئیات) ----
  if (scope === 'stocktake') {
    const out: StocktakeImportRow[] = [];
    for (const row of sourceRows) {
      const shipmentNo = strField(row, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست']);
      const packageNo = strField(row, ['packageNo', 'شماره نگله']);
      const itemNo = strField(row, ['itemNo', 'شماره آیتم']);
      const itemCode = strField(row, ['itemCode', 'کد کالا']);
      const description = strField(row, ['description', 'شرح کالا', 'شرح']);
      const stocktakeStatus = strField(row, ['stocktakeStatus', 'وضعیت انبارگردانی', 'نتیجه انبارگردانی', 'وضعیت']);
      const stocktakeDate = dateField(row, ['stocktakeDate', 'date', 'تاریخ انبارگردانی', 'تاریخ'], assumedCalendar);
      const stocktakeInfo = strField(row, ['stocktakeInfo', 'شرح انبارگردانی', 'اطلاعات انبارگردانی', 'انبارگردانی', 'توضیحات']);
      const storageLocation = strField(row, ['storageLocation', 'location', 'محل نگهداری', 'محل دپو', 'محل استقرار', 'انبار']);

      if (!shipmentNo && !itemCode && !description) {
        skippedEmpty += 1;
        continue;
      }
      out.push({
        shipmentNo,
        packageNo,
        itemNo,
        itemCode,
        description,
        stocktakeStatus: stocktakeStatus || (stocktakeInfo ? 'بازدید و تایید شده' : 'موجود و تایید شده'),
        stocktakeDate: stocktakeDate || todayIso,
        stocktakeInfo: stocktakeInfo || (stocktakeStatus ? `${stocktakeStatus}${stocktakeDate ? ` (${stocktakeDate})` : ''}` : ''),
        storageLocation: storageLocation || undefined,
      });
    }
    return { scope, records: out as unknown as Record<string, unknown>[], skippedEmpty, warnings };
  }

  // ---- 10. CUSTOM EMPLOYER FORMS (فرم‌های اختصاصی ثبت‌شده کارفرما) ----
  const byKey = new Map<string, CustomFormSubmission>();
  let seq = 1;
  const standardKeys = new Set([
    'id', 'formid', 'formtitle', 'docno', 'date', 'packinglistno', 'shipmentno',
    'fieldvalues', 'rows', 'notes', 'createdat', 'updatedat', 'createdby',
    'شناسه فرم', 'عنوان فرم', 'نام فرم', 'شماره سند', 'تاریخ', 'شماره پکینگ لیست', 'توضیحات',
  ]);

  for (const row of sourceRows) {
    const formTitle = strField(row, ['formTitle', 'عنوان فرم', 'نام فرم اختصاصی', 'نام فرم'], sheetName || 'فرم اختصاصی کارفرما');
    const formId = strField(
      row,
      ['formId', 'شناسه فرم', 'کد فرم'],
      `custom-${normMatchKey(formTitle).replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '') || 'form'}`,
    );
    const docNo = strField(row, ['docNo', 'شماره سند', 'شماره فرم', 'شماره']);
    const packingListNo = strField(row, ['packingListNo', 'shipmentNo', 'شماره پکینگ لیست', 'شماره محموله', 'پکینگ لیست']);
    const date = dateField(row, ['date', 'تاریخ فرم', 'تاریخ سند', 'تاریخ'], assumedCalendar, todayIso);
    const notes = strField(row, ['notes', 'توضیحات']);

    // Extract fieldValues (from explicit object/JSON or remaining dynamic columns)
    const rawFv = parseMaybeJson(getField(row, ['fieldValues', 'مقادیر فیلدها']));
    const fieldValues: Record<string, string> = {};
    if (rawFv && typeof rawFv === 'object' && !Array.isArray(rawFv)) {
      for (const [k, v] of Object.entries(rawFv as Record<string, unknown>)) {
        const cleanV = normKey(v);
        if (cleanV) fieldValues[k] = cleanV;
      }
    } else {
      for (const [k, v] of Object.entries(row)) {
        if (standardKeys.has(normHeader(k))) continue;
        const cleanV = normKey(v);
        if (cleanV) fieldValues[k] = cleanV;
      }
    }

    const rawSubRows = parseMaybeJson(getField(row, ['rows', 'ردیف ها', 'جدول اقلام']));
    const subRows: Array<Record<string, string>> = [];
    if (Array.isArray(rawSubRows)) {
      for (const sr of rawSubRows) {
        if (sr && typeof sr === 'object') {
          const cleanRow: Record<string, string> = {};
          for (const [k, v] of Object.entries(sr as Record<string, unknown>)) {
            cleanRow[k] = normKey(v);
          }
          subRows.push(cleanRow);
        }
      }
    }

    if (!docNo && !packingListNo && Object.keys(fieldValues).length === 0 && subRows.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    const effectiveDocNo = docNo || `CF-IMP-${seq++}`;
    const key = `${normMatchKey(formId)}|${normMatchKey(effectiveDocNo)}`;
    let existing = byKey.get(key);
    if (!existing) {
      existing = {
        id: makeId(),
        formId,
        formTitle,
        docNo: effectiveDocNo,
        date,
        packingListNo,
        fieldValues,
        rows: subRows,
        notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorName,
      };
      byKey.set(key, existing);
    } else {
      existing.fieldValues = { ...existing.fieldValues, ...fieldValues };
      if (subRows.length > 0) existing.rows = [...existing.rows, ...subRows];
      if (!existing.packingListNo && packingListNo) existing.packingListNo = packingListNo;
    }
  }

  return {
    scope: 'customFormSubmissions',
    records: Array.from(byKey.values()) as unknown as Record<string, unknown>[],
    skippedEmpty,
    warnings,
  };
}

// ---------------- FAST INDEXES FOR CROSS-LINKING ----------------

interface CoreLinkIndexes {
  generalByPacking: Map<string, GeneralEntry[]>;
  transitByPacking: Map<string, TransitEntry[]>;
  detailedById: Map<string, DetailedEntry>;
  detailedByPacking: Map<string, DetailedEntry[]>;
  detailedByComposite: Map<string, DetailedEntry>;
  detailedByShipItem: Map<string, DetailedEntry>;
  detailedByItemCode: Map<string, DetailedEntry[]>;
}

function buildCoreLinkIndexes(db: ImportableDatabase): CoreLinkIndexes {
  const generalByPacking = new Map<string, GeneralEntry[]>();
  for (const g of db.general || []) {
    const pk = normMatchKey(g.packingListNo);
    if (!pk) continue;
    const arr = generalByPacking.get(pk) || [];
    arr.push(g);
    generalByPacking.set(pk, arr);
  }

  const transitByPacking = new Map<string, TransitEntry[]>();
  for (const t of db.transit || []) {
    const pk = normMatchKey(t.packingListNo);
    if (!pk) continue;
    const arr = transitByPacking.get(pk) || [];
    arr.push(t);
    transitByPacking.set(pk, arr);
  }

  const detailedById = new Map<string, DetailedEntry>();
  const detailedByPacking = new Map<string, DetailedEntry[]>();
  const detailedByComposite = new Map<string, DetailedEntry>();
  const detailedByShipItem = new Map<string, DetailedEntry>();
  const detailedByItemCode = new Map<string, DetailedEntry[]>();

  for (const d of db.detailed || []) {
    detailedById.set(d.id, d);
    const pk = normMatchKey(d.shipmentNo);
    const pkg = normMatchKey(d.packageNo);
    const item = normMatchKey(d.itemNo);
    const code = normMatchKey(d.itemCode);

    if (pk) {
      const arr = detailedByPacking.get(pk) || [];
      arr.push(d);
      detailedByPacking.set(pk, arr);
      if (item) {
        const comp = `${pk}|${pkg}|${item}`;
        if (!detailedByComposite.has(comp)) detailedByComposite.set(comp, d);
        const shipItem = `${pk}|${item}`;
        if (!detailedByShipItem.has(shipItem)) detailedByShipItem.set(shipItem, d);
      }
    }
    if (code) {
      const arr = detailedByItemCode.get(code) || [];
      arr.push(d);
      detailedByItemCode.set(code, arr);
    }
  }

  return {
    generalByPacking,
    transitByPacking,
    detailedById,
    detailedByPacking,
    detailedByComposite,
    detailedByShipItem,
    detailedByItemCode,
  };
}

function findMatchingDetailedItem(
  idx: CoreLinkIndexes,
  criteria: {
    detailedId?: string;
    shipmentNo?: string;
    packageNo?: string;
    itemNo?: string;
    itemCode?: string;
    description?: string;
  },
): DetailedEntry | null {
  if (criteria.detailedId && idx.detailedById.has(criteria.detailedId)) {
    return idx.detailedById.get(criteria.detailedId)!;
  }
  const pk = normMatchKey(criteria.shipmentNo);
  const pkg = normMatchKey(criteria.packageNo);
  const item = normMatchKey(criteria.itemNo);
  const code = normMatchKey(criteria.itemCode);
  const desc = normMatchKey(criteria.description);

  if (pk && item) {
    const exact = idx.detailedByComposite.get(`${pk}|${pkg}|${item}`);
    if (exact) return exact;
    const byShipItem = idx.detailedByShipItem.get(`${pk}|${item}`);
    if (byShipItem) return byShipItem;
  }

  if (pk && code) {
    const candidates = idx.detailedByPacking.get(pk) || [];
    const hit = candidates.find((d) => normMatchKey(d.itemCode) === code);
    if (hit) return hit;
  }

  if (pk && desc) {
    const candidates = idx.detailedByPacking.get(pk) || [];
    const hit = candidates.find(
      (d) => normMatchKey(d.description) === desc || normMatchKey(d.description).includes(desc) || desc.includes(normMatchKey(d.description)),
    );
    if (hit) return hit;
  }

  if (code) {
    const byCode = idx.detailedByItemCode.get(code);
    if (byCode && byCode.length > 0) return byCode[0];
  }

  if (pk && !item && !code && !desc) {
    const candidates = idx.detailedByPacking.get(pk) || [];
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

// ---------------- PREVIEW WITH CROSS-LINK ESTIMATION ----------------

export function previewOperationalFormImport(params: {
  db: ImportableDatabase;
  scope: OperationalImportScope;
  matrix?: string[][];
  formulaMap?: Record<string, string>;
  structuredRecords?: Record<string, unknown>[];
  preparsedRows?: { rows: Record<string, unknown>[]; skippedEmpty: number };
  prebuiltIndexes?: CoreLinkIndexes;
  skipDelta?: boolean;
  sheetName?: string;
  assumedCalendar: CalendarMode;
  actorName: string;
}): OperationalPreviewResult {
  const parsed = parseOperationalFormInput(params);
  const idx = params.prebuiltIndexes || buildCoreLinkIndexes(params.db);
  const { db, scope } = params;

  const duplicateSamples: string[] = [];
  let duplicateDbCount = 0;
  const linkedGeneralIds = new Set<string>();
  const linkedDetailedIds = new Set<string>();
  const linkedTransitIds = new Set<string>();

  const existingSiteEntryKeys = new Set((db.siteEntryMinutes || []).map((r) => normMatchKey(r.minutesNo)));
  const existingOpiInvKeys = new Set((db.opiInvitations || []).map((r) => normMatchKey(r.invitationNo)));
  const existingOpiMinKeys = new Set((db.opiMinutes || []).map((r) => normMatchKey(r.minutesNo)));
  const existingOsdrKeys = new Set((db.osdrReports || []).map((r) => normMatchKey(r.reportNo)));
  const existingGcvKeys = new Set((db.gcvDocuments || []).map((r) => normMatchKey(r.receiptNo)));
  const existingMivKeys = new Set((db.mivDocuments || []).map((r) => `${r.docType}|${normMatchKey(r.docNo)}`));
  const existingSubKeys = new Set((db.substitutions || []).map((r) => normMatchKey(r.docNo)));
  const existingMtoKeys = new Set(
    (db.materialEstimates || []).map((r) => `${normMatchKey(r.mtoCode)}|${normMatchKey(r.itemCode)}|${normMatchKey(r.description)}`),
  );
  const existingPeriodicKeys = new Set(
    (db.periodicInspections || []).map((r) => `${normMatchKey(r.inspectionDate)}|${normMatchKey(r.projectName)}`),
  );
  const existingCustomKeys = new Set(
    (db.customFormSubmissions || []).map((r) => `${normMatchKey(r.formId)}|${normMatchKey(r.docNo)}`),
  );

  for (const raw of parsed.records) {
    if (scope === 'siteEntryMinutes') {
      const r = raw as unknown as SiteEntryMinutesRecord;
      if (existingSiteEntryKeys.has(normMatchKey(r.minutesNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.minutesNo);
      }
      for (const pk of r.packingListNos || []) {
        const k = normMatchKey(pk);
        for (const g of idx.generalByPacking.get(k) || []) linkedGeneralIds.add(g.id);
        for (const t of idx.transitByPacking.get(k) || []) linkedTransitIds.add(t.id);
        for (const d of idx.detailedByPacking.get(k) || []) linkedDetailedIds.add(d.id);
      }
    } else if (scope === 'opiInvitations') {
      const r = raw as unknown as OpiInvitationRecord;
      if (existingOpiInvKeys.has(normMatchKey(r.invitationNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.invitationNo);
      }
      for (const pk of r.packingNos || []) {
        const k = normMatchKey(pk);
        for (const g of idx.generalByPacking.get(k) || []) linkedGeneralIds.add(g.id);
        for (const d of idx.detailedByPacking.get(k) || []) linkedDetailedIds.add(d.id);
      }
    } else if (scope === 'opiMinutes') {
      const r = raw as unknown as OpiMinutesRecord;
      if (existingOpiMinKeys.has(normMatchKey(r.minutesNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.minutesNo);
      }
      const k = normMatchKey(r.packingListNo);
      for (const g of idx.generalByPacking.get(k) || []) linkedGeneralIds.add(g.id);
      for (const d of idx.detailedByPacking.get(k) || []) {
        if (!r.packageNos.length || r.packageNos.some((p) => normMatchKey(p) === normMatchKey(d.packageNo))) {
          linkedDetailedIds.add(d.id);
        }
      }
    } else if (scope === 'osdrReports') {
      const r = raw as unknown as OsdrReportRecord;
      if (existingOsdrKeys.has(normMatchKey(r.reportNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.reportNo);
      }
      const pk = normMatchKey(r.packingListNo);
      for (const g of idx.generalByPacking.get(pk) || []) linkedGeneralIds.add(g.id);
      for (const it of r.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: it.detailedId,
          shipmentNo: r.packingListNo,
          packageNo: it.packageNo,
          itemNo: it.itemNo,
          itemCode: it.itemCode,
          description: it.description,
        });
        if (d) linkedDetailedIds.add(d.id);
      }
    } else if (scope === 'gcvDocuments') {
      const r = raw as unknown as GcvDocumentRecord;
      if (existingGcvKeys.has(normMatchKey(r.receiptNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.receiptNo);
      }
      for (const it of r.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: it.detailedId,
          shipmentNo: it.shipmentNo,
          packageNo: it.packageNo,
          itemNo: it.itemNo,
          itemCode: it.tagNo,
          description: it.description,
        });
        if (d) {
          linkedDetailedIds.add(d.id);
          for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) linkedGeneralIds.add(g.id);
        }
      }
    } else if (scope === 'mivDocuments') {
      const r = raw as unknown as MivDocumentRecord;
      if (existingMivKeys.has(`${r.docType}|${normMatchKey(r.docNo)}`)) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.docNo);
      }
      for (const it of r.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: it.detailedId,
          shipmentNo: it.shipmentNo,
          packageNo: it.packageNo,
          itemNo: it.itemNo,
          itemCode: it.codeNo || it.tagNo,
          description: it.description,
        });
        if (d) {
          linkedDetailedIds.add(d.id);
          for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) linkedGeneralIds.add(g.id);
        }
      }
    } else if (scope === 'substitutions') {
      const r = raw as unknown as SubstitutionRecord;
      if (existingSubKeys.has(normMatchKey(r.docNo))) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.docNo);
      }
      const d = findMatchingDetailedItem(idx, {
        detailedId: r.detailedId,
        shipmentNo: r.shipmentNo,
        packageNo: r.packageNo,
        itemNo: r.itemNo,
        itemCode: r.originalItemCode,
        description: r.originalDescription,
      });
      if (d) {
        linkedDetailedIds.add(d.id);
        for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) linkedGeneralIds.add(g.id);
      }
    } else if (scope === 'materialEstimates') {
      const r = raw as unknown as MaterialEstimateRecord;
      const k = `${normMatchKey(r.mtoCode)}|${normMatchKey(r.itemCode)}|${normMatchKey(r.description)}`;
      if (existingMtoKeys.has(k)) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.mtoCode || r.description);
      }
      const d = findMatchingDetailedItem(idx, {
        itemCode: r.itemCode,
        description: r.description,
      });
      if (d) linkedDetailedIds.add(d.id);
      if (r.mtoCode) {
        for (const det of db.detailed || []) {
          if (normMatchKey(det.mtoRef) === normMatchKey(r.mtoCode)) linkedDetailedIds.add(det.id);
        }
      }
    } else if (scope === 'periodicInspections') {
      const r = raw as unknown as PeriodicInspectionRecord;
      if (existingPeriodicKeys.has(`${normMatchKey(r.inspectionDate)}|${normMatchKey(r.projectName)}`)) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.inspectionDate);
      }
    } else if (scope === 'materialBalance') {
      const r = raw as unknown as MaterialBalanceImportRow;
      const existingBmr = (db.detailed || []).some((d) => normMatchKey(d.materialBalanceNo) === normMatchKey(r.reportNo));
      if (existingBmr) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.reportNo);
      }
      for (const it of r.items || []) {
        const d = findMatchingDetailedItem(idx, {
          shipmentNo: it.shipmentNo,
          packageNo: it.packageNo,
          itemNo: it.itemNo,
          itemCode: it.itemCode,
          description: it.description,
        });
        if (d) {
          linkedDetailedIds.add(d.id);
          for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) linkedGeneralIds.add(g.id);
        }
      }
    } else if (scope === 'stocktake') {
      const r = raw as unknown as StocktakeImportRow;
      const d = findMatchingDetailedItem(idx, {
        shipmentNo: r.shipmentNo,
        packageNo: r.packageNo,
        itemNo: r.itemNo,
        itemCode: r.itemCode,
        description: r.description,
      });
      if (d) linkedDetailedIds.add(d.id);
    } else if (scope === 'customFormSubmissions') {
      const r = raw as unknown as CustomFormSubmission;
      if (existingCustomKeys.has(`${normMatchKey(r.formId)}|${normMatchKey(r.docNo)}`)) {
        duplicateDbCount += 1;
        if (duplicateSamples.length < 5) duplicateSamples.push(r.docNo);
      }
      const pk = normMatchKey(r.packingListNo);
      if (pk) {
        for (const g of idx.generalByPacking.get(pk) || []) linkedGeneralIds.add(g.id);
        for (const d of idx.detailedByPacking.get(pk) || []) linkedDetailedIds.add(d.id);
        for (const t of idx.transitByPacking.get(pk) || []) linkedTransitIds.add(t.id);
      }
    }
  }

  // Compute smart delta summary against existing DB records (skipped during fast Step 1->2 workbook scan)
  let deltaSummary: ImportDeltaSummary | undefined;
  const computeOpDelta = (
    existingArr: Record<string, unknown>[],
    keyFn: (r: Record<string, unknown>) => string,
  ): ImportDeltaSummary => {
    const analysis = analyzeImportDelta({
      incomingRows: parsed.records,
      existingRows: existingArr,
      getIncomingKey: (r) => keyFn(r),
      getExistingKey: (r) => keyFn(r),
    });
    return {
      isIdentical: analysis.isIdentical,
      newCount: analysis.newCount,
      modifiedCount: analysis.modifiedCount,
      unchangedCount: analysis.unchangedCount,
      totalIncoming: analysis.totalIncoming,
      changedFieldsSample: analysis.changedFieldsSample,
    };
  };

  if (!params.skipDelta) {
    if (scope === 'siteEntryMinutes') {
      deltaSummary = computeOpDelta((db.siteEntryMinutes || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.minutesNo));
    } else if (scope === 'opiInvitations') {
      deltaSummary = computeOpDelta((db.opiInvitations || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.invitationNo));
    } else if (scope === 'opiMinutes') {
      deltaSummary = computeOpDelta((db.opiMinutes || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.minutesNo));
    } else if (scope === 'osdrReports') {
      deltaSummary = computeOpDelta((db.osdrReports || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.reportNo));
    } else if (scope === 'gcvDocuments') {
      deltaSummary = computeOpDelta((db.gcvDocuments || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.receiptNo));
    } else if (scope === 'mivDocuments') {
      deltaSummary = computeOpDelta((db.mivDocuments || []) as unknown as Record<string, unknown>[], (r) => `${String(r.docType || '')}|${normMatchKey(r.docNo)}`);
    } else if (scope === 'substitutions') {
      deltaSummary = computeOpDelta((db.substitutions || []) as unknown as Record<string, unknown>[], (r) => normMatchKey(r.docNo));
    } else if (scope === 'materialEstimates') {
      deltaSummary = computeOpDelta((db.materialEstimates || []) as unknown as Record<string, unknown>[], (r) => `${normMatchKey(r.mtoCode)}|${normMatchKey(r.itemCode)}|${normMatchKey(r.description)}`);
    } else if (scope === 'periodicInspections') {
      deltaSummary = computeOpDelta((db.periodicInspections || []) as unknown as Record<string, unknown>[], (r) => `${normMatchKey(r.inspectionDate)}|${normMatchKey(r.projectName)}`);
    } else if (scope === 'customFormSubmissions') {
      deltaSummary = computeOpDelta((db.customFormSubmissions || []) as unknown as Record<string, unknown>[], (r) => `${normMatchKey(r.formId)}|${normMatchKey(r.docNo)}`);
    }
  }

  return {
    scope,
    totalRows: parsed.records.length,
    skippedEmpty: parsed.skippedEmpty,
    duplicateDbCount,
    duplicateSamples,
    estimatedLinks: {
      general: linkedGeneralIds.size,
      detailed: linkedDetailedIds.size,
      transit: linkedTransitIds.size,
    },
    sample: parsed.records.slice(0, 8),
    parsedRecords: parsed.records,
    warnings: parsed.warnings,
    deltaSummary,
  };
}

// ---------------- COMMIT + FULL CROSS-LINKING ENGINE ----------------

function registerCategoryVal(list: string[] | undefined, val: string): void {
  const clean = normKey(val);
  if (!clean || !Array.isArray(list)) return;
  if (!list.some((x) => normMatchKey(x) === normMatchKey(clean))) {
    list.push(clean);
  }
}

/**
 * Commits parsed operational/custom form records into `db` AND automatically cross-links
 * every record with `db.general`, `db.detailed`, and `db.transit` tables.
 */
export function commitOperationalFormImport(params: {
  db: ImportableDatabase;
  scope: OperationalImportScope;
  matrix?: string[][];
  formulaMap?: Record<string, string>;
  structuredRecords?: Record<string, unknown>[];
  sheetName?: string;
  assumedCalendar: CalendarMode;
  duplicateRecordPolicy: 'replace' | 'skip' | 'delta';
  actorName: string;
}): OperationalCommitResult {
  const { db, scope, duplicateRecordPolicy, actorName } = params;
  const parsed = parseOperationalFormInput(params);
  const idx = buildCoreLinkIndexes(db);
  const now = new Date().toISOString();

  // Ensure all operational arrays exist on db
  if (!Array.isArray(db.siteEntryMinutes)) db.siteEntryMinutes = [];
  if (!Array.isArray(db.opiInvitations)) db.opiInvitations = [];
  if (!Array.isArray(db.opiMinutes)) db.opiMinutes = [];
  if (!Array.isArray(db.osdrReports)) db.osdrReports = [];
  if (!Array.isArray(db.gcvDocuments)) db.gcvDocuments = [];
  if (!Array.isArray(db.mivDocuments)) db.mivDocuments = [];
  if (!Array.isArray(db.substitutions)) db.substitutions = [];
  if (!Array.isArray(db.materialEstimates)) db.materialEstimates = [];
  if (!Array.isArray(db.periodicInspections)) db.periodicInspections = [];
  if (!Array.isArray(db.customFormSubmissions)) db.customFormSubmissions = [];
  if (!db.packingMeta) db.packingMeta = {};

  let imported = 0;
  let replaced = 0;
  let skipped = 0;
  let unchangedSkipped = 0;
  const linkedGeneralIds = new Set<string>();
  const linkedDetailedIds = new Set<string>();
  const linkedTransitIds = new Set<string>();
  const warnings = [...parsed.warnings];

  const shouldSkipUnchanged = (existingRec: unknown, incomingRec: unknown): boolean => {
    if (duplicateRecordPolicy !== 'delta' || !existingRec) return false;
    if (!hasRecordMeaningfulChanges(existingRec as Record<string, unknown>, incomingRec as Record<string, unknown>)) {
      unchangedSkipped += 1;
      skipped += 1;
      return true;
    }
    return false;
  };

  // ---- 1. SITE ENTRY MINUTES ----
  if (scope === 'siteEntryMinutes') {
    for (const raw of parsed.records as unknown as SiteEntryMinutesRecord[]) {
      const existing = db.siteEntryMinutes.find((x) => normMatchKey(x.minutesNo) === normMatchKey(raw.minutesNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      // Cross-link with General & Transit
      for (const pk of raw.packingListNos || []) {
        const k = normMatchKey(pk);
        const genMatches = idx.generalByPacking.get(k) || [];
        for (const g of genMatches) {
          if (!raw.supplier && g.supplier) raw.supplier = g.supplier;
          if (!raw.origin && g.dispatchLocation) raw.origin = g.dispatchLocation;
          if (!raw.island && g.island) raw.island = g.island;
          if (!raw.system && g.system) raw.system = g.system;
          if (!raw.unit && g.unit) raw.unit = g.unit;
          if (!raw.releaseNoteNo && g.releaseNo) raw.releaseNoteNo = g.releaseNo;
          if (!raw.waybillNo && g.billOfLadingNo) raw.waybillNo = g.billOfLadingNo;
          if (!raw.vehicleNo && g.vehicleNo) raw.vehicleNo = g.vehicleNo;
          if (!raw.driverName && g.driverName) raw.driverName = g.driverName;
          if ((raw.weighbridgeWeight === null || raw.weighbridgeWeight === undefined) && g.weighbridgeWeight !== null && g.weighbridgeWeight !== undefined) {
            raw.weighbridgeWeight = g.weighbridgeWeight;
          }
          if (!raw.employerEntryMinutesNo && g.employerEntryMinutesNo) raw.employerEntryMinutesNo = g.employerEntryMinutesNo;

          if (!normKey(g.mapnaEntryMinutesNo) || duplicateRecordPolicy === 'replace') {
            g.mapnaEntryMinutesNo = raw.minutesNo;
          }
          if (raw.employerEntryMinutesNo && (!normKey(g.employerEntryMinutesNo) || duplicateRecordPolicy === 'replace')) {
            g.employerEntryMinutesNo = raw.employerEntryMinutesNo;
          }
          if (raw.weighbridgeWeight !== null && raw.weighbridgeWeight !== undefined && (g.weighbridgeWeight === null || g.weighbridgeWeight === undefined)) {
            g.weighbridgeWeight = raw.weighbridgeWeight;
          }
          if (!normKey(g.arrivalDate) && raw.arrivalDate) g.arrivalDate = raw.arrivalDate;
          if (!normKey(g.billOfLadingNo) && raw.waybillNo) g.billOfLadingNo = raw.waybillNo;
          if (!normKey(g.vehicleNo) && raw.vehicleNo) g.vehicleNo = raw.vehicleNo;
          if (!normKey(g.driverName) && raw.driverName) g.driverName = raw.driverName;
          g.updatedAt = now;
          linkedGeneralIds.add(g.id);
        }

        const trMatches = idx.transitByPacking.get(k) || [];
        for (const t of trMatches) {
          if (!raw.supplier && t.supplier) raw.supplier = t.supplier;
          if (!raw.origin && t.dispatchLocation) raw.origin = t.dispatchLocation;
          if (!raw.carrierCompany && t.carrierContractor) raw.carrierCompany = t.carrierContractor;
          if (!raw.releaseNoteNo && t.releaseNetNo) raw.releaseNoteNo = t.releaseNetNo;

          t.overallStatus = 'رسیده';
          t.linkedGeneralPackingNo = pk;
          if (!normKey(t.arrivalDate) && raw.arrivalDate) t.arrivalDate = raw.arrivalDate;
          t.updatedAt = now;
          linkedTransitIds.add(t.id);
        }

        for (const d of idx.detailedByPacking.get(k) || []) {
          if (!normKey(d.arrivalDate) && raw.arrivalDate) {
            d.arrivalDate = raw.arrivalDate;
            d.updatedAt = now;
          }
          linkedDetailedIds.add(d.id);
        }

        if (pk && !db.packingMeta[pk]) {
          db.packingMeta[pk] = {
            packingNo: pk,
            isClosed: true,
            closedAt: now,
            closedBy: actorName,
          };
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.siteEntryMinutes.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 2. OPI INVITATIONS ----
  else if (scope === 'opiInvitations') {
    for (const raw of parsed.records as unknown as OpiInvitationRecord[]) {
      const existing = db.opiInvitations.find((x) => normMatchKey(x.invitationNo) === normMatchKey(raw.invitationNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      for (const pk of raw.packingNos || []) {
        const k = normMatchKey(pk);
        const genMatches = idx.generalByPacking.get(k) || [];
        for (const g of genMatches) {
          if (!raw.supplier && g.supplier) raw.supplier = g.supplier;
          if (!raw.island && g.island) raw.island = g.island;
          if (!raw.system && g.system) raw.system = g.system;
          if (!raw.unit && g.unit) raw.unit = g.unit;
          g.opiInvitationNo = raw.invitationNo;
          g.opiInvitationDate = raw.date;
          g.updatedAt = now;
          linkedGeneralIds.add(g.id);
        }
        if ((!raw.items || raw.items.length === 0) && genMatches.length > 0) {
          raw.items = genMatches.map((g, gi) => ({
            itemNo: String(gi + 1),
            packingListNo: g.packingListNo,
            packageNo: g.packageNo,
            description: g.itemDescription,
            uom: 'بسته',
            remarks: '',
          }));
        }
        for (const d of idx.detailedByPacking.get(k) || []) {
          if (!normKey(d.opiNo) || duplicateRecordPolicy === 'replace') {
            d.opiNo = raw.invitationNo;
            d.opiDate = raw.date;
            d.updatedAt = now;
          }
          linkedDetailedIds.add(d.id);
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.opiInvitations.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 3. OPI MINUTES ----
  else if (scope === 'opiMinutes') {
    for (const raw of parsed.records as unknown as OpiMinutesRecord[]) {
      const existing = db.opiMinutes.find((x) => normMatchKey(x.minutesNo) === normMatchKey(raw.minutesNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      const pk = normMatchKey(raw.packingListNo);
      const genMatches = idx.generalByPacking.get(pk) || [];
      for (const g of genMatches) {
        if (!raw.supplier && g.supplier) raw.supplier = g.supplier;
        if (!raw.island && g.island) raw.island = g.island;
        if (!raw.system && g.system) raw.system = g.system;
        if (!raw.unit && g.unit) raw.unit = g.unit;
        if (raw.invitationNo && !normKey(g.opiInvitationNo)) {
          g.opiInvitationNo = raw.invitationNo;
          g.opiInvitationDate = g.opiInvitationDate || raw.date;
          g.updatedAt = now;
        }
        linkedGeneralIds.add(g.id);
      }

      if (raw.invitationNo) {
        const inv = db.opiInvitations.find((x) => normMatchKey(x.invitationNo) === normMatchKey(raw.invitationNo));
        if (inv) inv.status = 'completed';
      } else if (pk) {
        for (const inv of db.opiInvitations) {
          if (inv.packingNos.some((p) => normMatchKey(p) === pk)) inv.status = 'completed';
        }
      }

      const pkgFilter = new Set((raw.packageNos || []).map(normMatchKey).filter(Boolean));
      for (const d of idx.detailedByPacking.get(pk) || []) {
        if (pkgFilter.size === 0 || pkgFilter.has(normMatchKey(d.packageNo))) {
          d.opiNo = raw.minutesNo;
          d.opiDate = raw.date || d.opiDate;
          if (raw.merNo) {
            d.merNo = appendUniqueRef(d.merNo, raw.merNo);
            if (!normKey(d.merStatus)) d.merStatus = 'باز';
          }
          d.updatedAt = now;
          linkedDetailedIds.add(d.id);
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.opiMinutes.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 4. OSDR / MER REPORTS ----
  else if (scope === 'osdrReports') {
    for (const raw of parsed.records as unknown as OsdrReportRecord[]) {
      const existing = db.osdrReports.find((x) => normMatchKey(x.reportNo) === normMatchKey(raw.reportNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      const pk = normMatchKey(raw.packingListNo);
      for (const g of idx.generalByPacking.get(pk) || []) {
        if (!raw.supplier && g.supplier) raw.supplier = g.supplier;
        linkedGeneralIds.add(g.id);
      }

      for (const item of raw.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: item.detailedId,
          shipmentNo: raw.packingListNo,
          packageNo: item.packageNo,
          itemNo: item.itemNo,
          itemCode: item.itemCode,
          description: item.description,
        });
        if (d) {
          item.detailedId = d.id;
          if (!item.packageNo) item.packageNo = d.packageNo;
          if (!item.itemNo) item.itemNo = d.itemNo;
          if (!item.itemCode) item.itemCode = d.itemCode;
          if (!item.description) item.description = d.description || d.generalDescription;
          if (!item.packingQty && d.packingQty !== null) item.packingQty = d.packingQty;
          if (!item.countingUnit && d.countingUnit) item.countingUnit = d.countingUnit;
          if (!raw.supplier && d.supplier) raw.supplier = d.supplier;

          d.merNo = appendUniqueRef(d.merNo, raw.reportNo);
          if (!normKey(d.merStatus)) d.merStatus = 'باز';
          if (Number.isFinite(item.actualQty) && (item.actualQty > 0 || item.shortage > 0 || item.packingQty > 0)) {
            d.actualQty = item.actualQty;
          } else if (item.shortage > 0 && d.packingQty !== null && d.actualQty === null) {
            d.actualQty = Math.max(0, roundQty(d.packingQty - item.shortage));
          }
          if (item.damagedQty > 0) {
            d.damagedQty = Math.max(toNum(d.damagedQty), item.damagedQty);
          }
          if (raw.opiMinutesNo && !normKey(d.opiNo)) {
            d.opiNo = raw.opiMinutesNo;
          }
          d.updatedAt = now;
          linkedDetailedIds.add(d.id);
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.osdrReports.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 5. GCV DOCUMENTS ----
  else if (scope === 'gcvDocuments') {
    for (const raw of parsed.records as unknown as GcvDocumentRecord[]) {
      const existing = db.gcvDocuments.find((x) => normMatchKey(x.receiptNo) === normMatchKey(raw.receiptNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      // If replacing an existing GCV doc, rollback its previous qty delta on linked detailed items first
      if (existing) {
        for (const oldLine of existing.items || []) {
          const oldDet = idx.detailedById.get(oldLine.detailedId);
          if (oldDet) {
            oldDet.gcvDeliveredQty = Math.max(0, roundQty(toNum(oldDet.gcvDeliveredQty) - oldLine.qty));
          }
        }
      }

      for (const line of raw.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: line.detailedId,
          shipmentNo: line.shipmentNo,
          packageNo: line.packageNo,
          itemNo: line.itemNo,
          itemCode: line.tagNo,
          description: line.description,
        });
        if (d) {
          line.detailedId = d.id;
          line.shipmentNo = d.shipmentNo;
          line.packageNo = d.packageNo;
          line.itemNo = d.itemNo;
          if (!line.description) line.description = d.description || d.generalDescription;
          if (!line.technicalInfo) line.technicalInfo = d.size || '';
          if (!line.tagNo) line.tagNo = d.itemCode || '';
          if (!line.uom) line.uom = d.countingUnit || '';
          if (!raw.supplier && d.supplier) raw.supplier = d.supplier;
          if (!raw.islandSystem && (d.island || d.system)) raw.islandSystem = [d.island, d.system].filter(Boolean).join(' / ');

          // Avoid double-adding if already linked in detailed without an existing GCV doc record
          const alreadyHasRef = !existing && normKey(d.gcvReceiptNo)
            .split(/\s*[،,;/|\n]+\s*/)
            .some((p) => normMatchKey(p) === normMatchKey(raw.receiptNo));
          d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, raw.receiptNo);
          if (raw.receiver) d.receiver = raw.receiver;
          if (!alreadyHasRef) {
            d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + line.qty);
          }
          d.updatedAt = now;
          linkedDetailedIds.add(d.id);

          for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) {
            if (!raw.waybillNo && g.billOfLadingNo) raw.waybillNo = g.billOfLadingNo;
            if (!raw.releaseNoteNo && g.releaseNo) raw.releaseNoteNo = g.releaseNo;
            linkedGeneralIds.add(g.id);
          }
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.gcvDocuments.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 6. MIV / SMR DOCUMENTS ----
  else if (scope === 'mivDocuments') {
    for (const raw of parsed.records as unknown as MivDocumentRecord[]) {
      const existing = db.mivDocuments.find(
        (x) => x.docType === raw.docType && normMatchKey(x.docNo) === normMatchKey(raw.docNo),
      );
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      // Rollback old quantities on replace to prevent double-counting
      if (existing) {
        for (const oldLine of existing.items || []) {
          const oldDet = idx.detailedById.get(oldLine.detailedId);
          if (!oldDet) continue;
          if (existing.docType === 'miv_contractor') {
            oldDet.mivContractorQty = Math.max(0, roundQty(toNum(oldDet.mivContractorQty) - oldLine.qty));
          } else if (existing.docType === 'smr_contractor') {
            oldDet.smrContractorQty = Math.max(0, roundQty(toNum(oldDet.smrContractorQty) - oldLine.qty));
          } else if (existing.docType === 'smr_mapna') {
            oldDet.smrMapnaQty = Math.max(0, roundQty(toNum(oldDet.smrMapnaQty) - oldLine.qty));
          } else if (existing.docType === 'miv_mapna') {
            oldDet.mivMapnaQty = Math.max(0, roundQty(toNum(oldDet.mivMapnaQty) - oldLine.qty));
          }
        }
      }

      for (const line of raw.items || []) {
        const d = findMatchingDetailedItem(idx, {
          detailedId: line.detailedId,
          shipmentNo: line.shipmentNo,
          packageNo: line.packageNo,
          itemNo: line.itemNo,
          itemCode: line.codeNo || line.tagNo,
          description: line.description,
        });
        if (d) {
          line.detailedId = d.id;
          line.shipmentNo = d.shipmentNo;
          line.packageNo = d.packageNo;
          line.itemNo = d.itemNo;
          if (!line.description) line.description = d.description || d.generalDescription;
          if (!line.technicalInfo) line.technicalInfo = d.size || '';
          if (!line.tagNo) line.tagNo = d.itemCode || '';
          if (!line.codeNo) line.codeNo = d.itemCode || '';
          if (!line.location) line.location = d.storageLocation || '';
          if (!line.uom) line.uom = d.countingUnit || '';
          if (!line.opiNo) line.opiNo = d.opiNo || '';
          if (!raw.supplier && d.supplier) raw.supplier = d.supplier;
          if (!raw.unit && d.unit) raw.unit = d.unit;
          if (!raw.islandSystem && (d.island || d.system)) raw.islandSystem = [d.island, d.system].filter(Boolean).join(' / ');

          const checkAlreadyRef = (fieldVal: string) =>
            !existing &&
            normKey(fieldVal)
              .split(/\s*[،,;/|\n]+\s*/)
              .some((p) => normMatchKey(p) === normMatchKey(raw.docNo));

          if (raw.docType === 'miv_contractor') {
            const dupRef = checkAlreadyRef(d.mivContractorNo);
            d.mivContractorNo = appendUniqueRef(d.mivContractorNo, raw.docNo);
            d.mivContractorDate = raw.date || d.mivContractorDate;
            if (!dupRef) d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + line.qty);
          } else if (raw.docType === 'smr_contractor') {
            const dupRef = checkAlreadyRef(d.smrContractorNo);
            d.smrContractorNo = appendUniqueRef(d.smrContractorNo, raw.docNo);
            d.smrContractorDate = raw.date || d.smrContractorDate;
            if (!dupRef) d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
            if (raw.notes || line.returnReason) d.smrContractorNote = raw.notes || line.returnReason || d.smrContractorNote;
          } else if (raw.docType === 'smr_mapna') {
            const dupRef = checkAlreadyRef(d.smrMapnaNo);
            d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, raw.docNo);
            d.smrMapnaDate = raw.date || d.smrMapnaDate;
            if (!dupRef) d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
            if (raw.notes || line.returnReason) d.smrMapnaNote = raw.notes || line.returnReason || d.smrMapnaNote;
          } else if (raw.docType === 'miv_mapna') {
            const dupRef = checkAlreadyRef(d.mivMapnaNo);
            d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, raw.docNo);
            d.mivMapnaDate = raw.date || d.mivMapnaDate;
            if (!dupRef) d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + line.qty);
          }
          d.updatedAt = now;
          linkedDetailedIds.add(d.id);

          for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) {
            if (!raw.releaseNoteNo && g.releaseNo) raw.releaseNoteNo = g.releaseNo;
            linkedGeneralIds.add(g.id);
          }
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.mivDocuments.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 7. SUBSTITUTIONS ----
  else if (scope === 'substitutions') {
    for (const raw of parsed.records as unknown as SubstitutionRecord[]) {
      const existing = db.substitutions.find((x) => normMatchKey(x.docNo) === normMatchKey(raw.docNo));
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      const d = findMatchingDetailedItem(idx, {
        detailedId: raw.detailedId,
        shipmentNo: raw.shipmentNo,
        packageNo: raw.packageNo,
        itemNo: raw.itemNo,
        itemCode: raw.originalItemCode,
        description: raw.originalDescription,
      });
      if (d) {
        raw.detailedId = d.id;
        raw.shipmentNo = d.shipmentNo;
        raw.packageNo = d.packageNo;
        raw.itemNo = d.itemNo;
        if (!raw.originalDescription) raw.originalDescription = d.description || d.generalDescription;
        if (!raw.originalItemCode) raw.originalItemCode = d.itemCode;
        if (!raw.system) raw.system = d.system || '';
        if (!raw.island) raw.island = d.island || '';
        if (!raw.unit) raw.unit = d.unit || '';
        if (!raw.supplier) raw.supplier = d.supplier || '';
        if (!raw.mivNo) raw.mivNo = d.mivContractorNo || d.mivMapnaNo || '';
        if (!raw.merNcrNo) raw.merNcrNo = d.merNo || d.repNo || '';
        if (d.countingUnit) raw.countingUnit = normalizeCountingUnitToFa(d.countingUnit) || raw.countingUnit;

        d.repNo = appendUniqueRef(d.repNo, raw.docNo);
        d.repStatus =
          raw.status === 'executed'
            ? 'اجرا شده'
            : raw.status === 'approved'
              ? 'تایید شده'
              : d.repStatus || 'در دست بررسی';
        if (raw.substituteDescription) {
          d.repDescription = raw.substituteDescription;
        }
        d.updatedAt = now;
        linkedDetailedIds.add(d.id);

        for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) {
          linkedGeneralIds.add(g.id);
        }
      }

      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.substitutions.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 8. MATERIAL ESTIMATES (MTO) ----
  else if (scope === 'materialEstimates') {
    for (const raw of parsed.records as unknown as MaterialEstimateRecord[]) {
      const matchKey = `${normMatchKey(raw.mtoCode)}|${normMatchKey(raw.itemCode)}|${normMatchKey(raw.description)}`;
      const existing = db.materialEstimates.find(
        (x) => `${normMatchKey(x.mtoCode)}|${normMatchKey(x.itemCode)}|${normMatchKey(x.description)}` === matchKey,
      );
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      // Cross-link with Detailed rows by itemCode, mtoCode, or description
      const matchedDetailed: DetailedEntry[] = [];
      if (raw.itemCode) {
        for (const d of idx.detailedByItemCode.get(normMatchKey(raw.itemCode)) || []) {
          matchedDetailed.push(d);
        }
      }
      if (matchedDetailed.length === 0 && raw.mtoCode) {
        const mc = normMatchKey(raw.mtoCode);
        for (const d of db.detailed || []) {
          if (normMatchKey(d.mtoRef) === mc) matchedDetailed.push(d);
        }
      }
      if (matchedDetailed.length === 0 && raw.description) {
        const descKey = normMatchKey(raw.description);
        const sizeKey = normMatchKey(raw.size);
        for (const d of db.detailed || []) {
          if (normMatchKey(d.description) === descKey && (!sizeKey || normMatchKey(d.size) === sizeKey)) {
            matchedDetailed.push(d);
          }
        }
      }

      for (const d of matchedDetailed) {
        if (!raw.island && d.island) raw.island = d.island;
        if (!raw.system && d.system) raw.system = d.system;
        if (!raw.subSystem && d.subSystem) raw.subSystem = d.subSystem;
        if (!raw.unit && d.unit) raw.unit = d.unit;
        if (raw.mtoCode && (!normKey(d.mtoRef) || duplicateRecordPolicy === 'replace')) {
          d.mtoRef = raw.mtoCode;
          d.updatedAt = now;
        }
        linkedDetailedIds.add(d.id);
      }

      if (db.categories) {
        registerCategoryVal(db.categories.island, raw.island);
        registerCategoryVal(db.categories.system, raw.system);
        registerCategoryVal(db.categories.subSystem, raw.subSystem);
        registerCategoryVal(db.categories.unit, raw.unit);
      }

      if (existing) {
        Object.assign(existing, {
          ...raw,
          id: existing.id,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: now,
        });
        replaced += 1;
      } else {
        db.materialEstimates.unshift({ ...raw, id: makeId(), createdAt: now, updatedAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- 9A. PERIODIC INSPECTIONS ----
  else if (scope === 'periodicInspections') {
    for (const raw of parsed.records as unknown as PeriodicInspectionRecord[]) {
      const existing = db.periodicInspections.find(
        (x) =>
          normMatchKey(x.inspectionDate) === normMatchKey(raw.inspectionDate) &&
          normMatchKey(x.projectName) === normMatchKey(raw.projectName),
      );
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;
      if (existing) {
        Object.assign(existing, { ...raw, id: existing.id, createdAt: existing.createdAt, createdBy: existing.createdBy });
        replaced += 1;
      } else {
        db.periodicInspections.unshift({ ...raw, id: makeId(), createdAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  // ---- RULE 7: MATERIAL BALANCE REPORT (گزارش موازنه و کنترل مصرف مواد / BMR) ----
  else if (scope === 'materialBalance') {
    for (const raw of parsed.records as unknown as MaterialBalanceImportRow[]) {
      let matchedAny = false;
      let hadExisting = false;
      for (const it of raw.items || []) {
        const d = findMatchingDetailedItem(idx, {
          shipmentNo: it.shipmentNo,
          packageNo: it.packageNo,
          itemNo: it.itemNo,
          itemCode: it.itemCode,
          description: it.description,
        });
        if (!d) continue;
        matchedAny = true;
        const alreadyHas = Boolean(normKey(d.materialBalanceNo));
        if (alreadyHas) hadExisting = true;
        if (alreadyHas && duplicateRecordPolicy === 'skip') {
          continue;
        }
        if (
          alreadyHas &&
          duplicateRecordPolicy === 'delta' &&
          normMatchKey(d.materialBalanceNo) === normMatchKey(raw.reportNo) &&
          (!raw.balanceStatus || normMatchKey(d.balanceStatus) === normMatchKey(raw.balanceStatus))
        ) {
          continue;
        }
        d.materialBalanceNo = raw.reportNo;
        if (raw.balanceStatus) d.balanceStatus = raw.balanceStatus;
        d.updatedAt = now;
        linkedDetailedIds.add(d.id);
        for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) {
          linkedGeneralIds.add(g.id);
        }
      }
      if (db.categories && raw.balanceStatus) {
        registerCategoryVal(db.categories.balanceStatus, raw.balanceStatus);
      }
      if (!matchedAny) {
        skipped += 1;
        warnings.push(`گزارش موازنه (${raw.reportNo}) قلم متناظری در جدول جزئیات نداشت.`);
      } else if (hadExisting) {
        replaced += 1;
      } else {
        imported += 1;
      }
    }
  }

  // ---- 9B. STOCKTAKE (DIRECT LINK TO DETAILED) ----
  else if (scope === 'stocktake') {
    for (const raw of parsed.records as unknown as StocktakeImportRow[]) {
      const d = findMatchingDetailedItem(idx, {
        shipmentNo: raw.shipmentNo,
        packageNo: raw.packageNo,
        itemNo: raw.itemNo,
        itemCode: raw.itemCode,
        description: raw.description,
      });
      if (!d) {
        skipped += 1;
        warnings.push(
          `قلم انبارگردانی (${raw.shipmentNo || raw.itemCode || raw.description}) در جدول جزئیات یافت نشد.`,
        );
        continue;
      }
      const hadStocktake = Boolean(normKey(d.stocktakeStatus) || normKey(d.stocktakeInfo));
      if (hadStocktake && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (
        hadStocktake &&
        duplicateRecordPolicy === 'delta' &&
        normMatchKey(d.stocktakeStatus) === normMatchKey(raw.stocktakeStatus) &&
        (!raw.stocktakeDate || normMatchKey(d.stocktakeDate) === normMatchKey(raw.stocktakeDate)) &&
        (!raw.storageLocation || normMatchKey(d.storageLocation) === normMatchKey(raw.storageLocation))
      ) {
        unchangedSkipped += 1;
        skipped += 1;
        continue;
      }
      d.stocktakeStatus = raw.stocktakeStatus;
      if (raw.stocktakeDate) d.stocktakeDate = raw.stocktakeDate;
      d.stocktakeInfo = raw.stocktakeInfo || `${raw.stocktakeStatus}${raw.stocktakeDate ? ` (${raw.stocktakeDate})` : ''}`;
      if (raw.storageLocation) d.storageLocation = raw.storageLocation;
      d.updatedAt = now;
      linkedDetailedIds.add(d.id);
      for (const g of idx.generalByPacking.get(normMatchKey(d.shipmentNo)) || []) {
        linkedGeneralIds.add(g.id);
      }
      if (hadStocktake) replaced += 1;
      else imported += 1;
    }
  }

  // ---- 10. CUSTOM EMPLOYER FORMS ----
  else if (scope === 'customFormSubmissions') {
    for (const raw of parsed.records as unknown as CustomFormSubmission[]) {
      // Try auto-extracting packingListNo from fieldValues if not explicitly set
      if (!raw.packingListNo && raw.fieldValues) {
        for (const [fk, fv] of Object.entries(raw.fieldValues)) {
          const nfk = normHeader(fk);
          if ((nfk.includes('packing') || nfk.includes('پکینگ') || nfk.includes('محموله')) && normKey(fv)) {
            raw.packingListNo = normKey(fv);
            break;
          }
        }
      }

      const existing = db.customFormSubmissions.find(
        (x) => normMatchKey(x.formId) === normMatchKey(raw.formId) && normMatchKey(x.docNo) === normMatchKey(raw.docNo),
      );
      if (existing && duplicateRecordPolicy === 'skip') {
        skipped += 1;
        continue;
      }
      if (shouldSkipUnchanged(existing, raw)) continue;

      const pk = normMatchKey(raw.packingListNo);
      if (pk) {
        for (const g of idx.generalByPacking.get(pk) || []) linkedGeneralIds.add(g.id);
        for (const d of idx.detailedByPacking.get(pk) || []) linkedDetailedIds.add(d.id);
        for (const t of idx.transitByPacking.get(pk) || []) linkedTransitIds.add(t.id);
      }

      if (existing) {
        Object.assign(existing, {
          ...raw,
          id: existing.id,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
          updatedAt: now,
        });
        replaced += 1;
      } else {
        db.customFormSubmissions.unshift({ ...raw, id: makeId(), createdAt: now, updatedAt: now, createdBy: actorName });
        imported += 1;
      }
    }
  }

  return {
    scope,
    imported,
    replaced,
    skipped,
    unchangedSkipped,
    linkedGeneral: linkedGeneralIds.size,
    linkedDetailed: linkedDetailedIds.size,
    linkedTransit: linkedTransitIds.size,
    warnings: warnings.slice(0, 20),
  };
}

// ---------------- UNIFIED MULTI-SHEET / MULTI-SECTION AUTO-WORKBOOK ENGINE ----------------

export interface AutoWorkbookSheetInput {
  name: string;
  matrix?: string[][];
  formulaMap?: Record<string, string>;
  structuredRecords?: Record<string, unknown>[];
  sectionHint?: string;
  forcedScope?: ExtendedImportScope;
  columnMapping?: Record<string, number>;
}

export interface DetectedScopeCandidate {
  scope: ExtendedImportScope;
  isOperational: boolean;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  isPrimary: boolean;
  rowCount: number;
  duplicateDbCount: number;
  estimatedLinks: OperationalLinkCounts;
  warnings: string[];
}

export interface AutoWorkbookPreviewSection {
  sheetName: string;
  scope: ExtendedImportScope | null;
  isOperational: boolean;
  rowCount: number;
  duplicateDbCount: number;
  estimatedLinks: OperationalLinkCounts;
  warnings: string[];
  candidates?: DetectedScopeCandidate[];
}

export interface AutoWorkbookCommitSection {
  sheetName: string;
  scope: ExtendedImportScope;
  isOperational: boolean;
  imported: number;
  replaced: number;
  skipped: number;
  unchangedSkipped?: number;
  linkedGeneral: number;
  linkedDetailed: number;
  linkedTransit: number;
  warnings: string[];
}

export interface AutoWorkbookCommitSummary {
  ok: true;
  sections: AutoWorkbookCommitSection[];
  totals: {
    imported: number;
    replaced: number;
    skipped: number;
    unchangedSkipped?: number;
    linkedGeneral: number;
    linkedDetailed: number;
    linkedTransit: number;
  };
}

function parseCoreStructuredGeneral(
  records: Record<string, unknown>[],
  cal: CalendarMode,
  actorName: string,
): Omit<GeneralEntry, 'id'>[] {
  const now = new Date().toISOString();
  const out: Omit<GeneralEntry, 'id'>[] = [];
  for (const r of records) {
    const packingListNo = strField(r, ['packingListNo', 'شماره پکینگ لیست', 'پکینگ لیست']);
    const packageNo = strField(r, ['packageNo', 'شماره نگله']);
    const itemDescription = strField(r, ['itemDescription', 'description', 'شرح کالا', 'شرح']);
    if (!packingListNo && !packageNo && !itemDescription) continue;
    out.push({
      rowNo: strField(r, ['rowNo', 'ردیف']),
      arrivalDate: dateField(r, ['arrivalDate', 'تاریخ ورود'], cal),
      releaseNo: strField(r, ['releaseNo', 'releaseNoteNo', 'شماره رلیز']),
      releaseDate: dateField(r, ['releaseDate', 'تاریخ رلیز'], cal),
      supplier: strField(r, ['supplier', 'تامین کننده']),
      dispatchLocation: strField(r, ['dispatchLocation', 'origin', 'محل ارسال', 'مبدا']),
      employerEntryMinutesNo: strField(r, ['employerEntryMinutesNo', 'شماره صورتجلسه کارفرما']),
      mapnaEntryMinutesNo: strField(r, ['mapnaEntryMinutesNo', 'شماره صورتجلسه مپنا']),
      packingListNo,
      packageNo,
      packageType: strField(r, ['packageType', 'نوع بسته بندی']),
      itemCount: numField(r, ['itemCount', 'تعداد اقلام']),
      itemDescription,
      island: strField(r, ['island', 'جزیره']),
      system: strField(r, ['system', 'سیستم']),
      subSystem: strField(r, ['subSystem', 'ساب سیستم']),
      unit: strField(r, ['unit', 'واحد']),
      grossWeight: numField(r, ['grossWeight', 'وزن ناخالص']),
      netWeight: numField(r, ['netWeight', 'وزن خالص']),
      lengthCm: numField(r, ['lengthCm', 'طول']),
      widthCm: numField(r, ['widthCm', 'عرض']),
      heightCm: numField(r, ['heightCm', 'ارتفاع']),
      billOfLadingNo: strField(r, ['billOfLadingNo', 'waybillNo', 'شماره بارنامه']),
      vehicleNo: strField(r, ['vehicleNo', 'شماره خودرو']),
      weighbridgeWeight: numField(r, ['weighbridgeWeight', 'وزن باسکول']),
      freightCost: numField(r, ['freightCost', 'کرایه حمل']),
      opiInvitationNo: strField(r, ['opiInvitationNo', 'شماره دعوتنامه opi']),
      opiInvitationDate: dateField(r, ['opiInvitationDate', 'تاریخ دعوتنامه opi'], cal),
      driverName: strField(r, ['driverName', 'نام راننده']),
      createdAt: now,
      updatedAt: now,
      createdBy: actorName,
    });
  }
  return out;
}

function parseCoreStructuredDetailed(
  records: Record<string, unknown>[],
  cal: CalendarMode,
  actorName: string,
): Omit<DetailedEntry, 'id'>[] {
  const now = new Date().toISOString();
  const out: Omit<DetailedEntry, 'id'>[] = [];
  for (const r of records) {
    const shipmentNo = strField(r, ['shipmentNo', 'packingListNo', 'شماره محموله', 'شماره پکینگ لیست']);
    const description = strField(r, ['description', 'itemDescription', 'شرح کالا', 'شرح']);
    const generalDescriptionRaw = strField(r, ['generalDescription', 'شرح کلی']);
    if (!shipmentNo && !description && !generalDescriptionRaw) continue;
    const notesVal = strField(r, ['notes', 'توضیحات']);
    const genDesc = generalDescriptionRaw;
    const rawCat = strField(r, ['itemCategory']) as DetailedEntry['itemCategory'];
    const rawChem = strField(r, ['chemicalType']);
    const inferred = !rawCat ? inferItemClassification(description, notesVal, genDesc) : { itemCategory: rawCat, chemicalType: '' };
    const itemCategory = rawCat || (rawChem ? 'chemicals' : inferred.itemCategory);
    const chemicalType = rawChem || (itemCategory === 'chemicals' ? inferred.chemicalType : '');
    let productionDate = dateField(r, ['productionDate', 'تاریخ تولید'], cal);
    let expirationDate = dateField(r, ['expirationDate', 'تاریخ انقضا', 'تاریخ انقضاء'], cal);
    const stocktakeInfo = strField(r, ['stocktakeInfo', 'انبارگردانی']);
    if (itemCategory === 'chemicals' && (!productionDate || !expirationDate)) {
      const extracted = extractChemicalDatesFromTexts(
        [notesVal, description, genDesc],
        cal,
      );
      if (!productionDate && extracted.productionDate) productionDate = extracted.productionDate;
      if (!expirationDate && extracted.expirationDate) expirationDate = extracted.expirationDate;
    }
    out.push({
      rowNo: strField(r, ['rowNo', 'ردیف']),
      arrivalDate: dateField(r, ['arrivalDate', 'تاریخ ورود'], cal),
      supplier: strField(r, ['supplier', 'تامین کننده']),
      origin: strField(r, ['origin', 'مبدا']),
      shipmentNo,
      packageNo: strField(r, ['packageNo', 'شماره نگله']),
      itemNo: strField(r, ['itemNo', 'شماره آیتم']),
      generalDescription: genDesc,
      description,
      size: strField(r, ['size', 'اندازه', 'سایز']),
      itemCode: strField(r, ['itemCode', 'کد کالا']),
      itemCategory,
      chemicalType,
      productionDate,
      expirationDate,
      packingQty: numField(r, ['packingQty', 'مقدار پکینگ']),
      actualQty: numField(r, ['actualQty', 'مقدار واقعی']),
      damagedQty: numField(r, ['damagedQty', 'آسیب دیده']),
      mtoRef: strField(r, ['mtoRef', 'mto']),
      repNo: strField(r, ['repNo', 'شماره جایگزینی', 'شماره rep']),
      repStatus: strField(r, ['repStatus', 'وضعیت جایگزینی', 'وضعیت rep']),
      repReprocured: strField(r, ['repReprocured', 'تأمین مجدد جایگزین شده', 'تامین مجدد جایگزین شده']),
      repDescription: strField(r, ['repDescription', 'توضیحات جایگزینی', 'توضیحات rep']),
      countingUnit: normalizeCountingUnitToFa(strField(r, ['countingUnit', 'واحد شمارش'])),
      island: strField(r, ['island', 'جزیره']),
      system: strField(r, ['system', 'سیستم']),
      subSystem: strField(r, ['subSystem', 'ساب سیستم']),
      unit: strField(r, ['unit', 'واحد']),
      opiNo: strField(r, ['opiNo', 'شماره دعوتنامه', 'شماره opi']),
      opiDate: dateField(r, ['opiDate', 'تاریخ دعوتنامه', 'تاریخ opi'], cal),
      merNo: strField(r, ['merNo', 'شماره کسری/مغایرت', 'شماره mer']),
      merStatus: strField(r, ['merStatus', 'وضعیت کسری/مغایرت', 'وضعیت mer']),
      notes: notesVal,
      materialBalanceNo: strField(r, ['materialBalanceNo', 'شماره بالانس متریال', 'شماره موازنه', 'موازنه مواد', 'گزارش موازنه']),
      balanceStatus: strField(r, ['balanceStatus', 'وضعیت بالانس', 'وضعیت موازنه']),
      storageLocation: strField(r, ['storageLocation', 'محل نگهداری']),
      gcvReceiptNo: strField(r, ['gcvReceiptNo', 'شماره رسید مصرف', 'شماره رسید']),
      receiver: strField(r, ['receiver', 'تحویل گیرنده']),
      gcvDeliveredQty: numField(r, ['gcvDeliveredQty', 'تعداد رسید مصرف', 'مقدار تحویل شده gcv']),
      mivContractorNo: strField(r, ['mivContractorNo', 'شماره حواله']),
      mivContractorDate: dateField(r, ['mivContractorDate', 'تاریخ حواله'], cal),
      mivContractorQty: numField(r, ['mivContractorQty', 'مجموع تعداد تحویل شده با حواله']),
      mivReceiver: strField(r, ['mivReceiver', 'تحویل گیرنده حواله']),
      smrContractorNo: strField(r, ['smrContractorNo', 'شماره برگشتی به انبار پیمانکار']),
      smrContractorDate: dateField(r, ['smrContractorDate'], cal),
      smrContractorQty: numField(r, ['smrContractorQty']),
      smrContractorNote: strField(r, ['smrContractorNote']),
      smrMapnaNo: strField(r, ['smrMapnaNo', 'شماره برگشتی به انبار کارفرما']),
      smrMapnaDate: dateField(r, ['smrMapnaDate'], cal),
      smrMapnaQty: numField(r, ['smrMapnaQty']),
      smrMapnaNote: strField(r, ['smrMapnaNote']),
      smrDeliverer: strField(r, ['smrDeliverer', 'تحویل آورنده']),
      mivMapnaNo: strField(r, ['mivMapnaNo']),
      mivMapnaDate: dateField(r, ['mivMapnaDate'], cal),
      mivMapnaQty: numField(r, ['mivMapnaQty']),
      stocktakeInfo,
      stocktakeStatus: strField(r, ['stocktakeStatus', 'وضعیت انبارگردانی']),
      stocktakeDate: dateField(r, ['stocktakeDate', 'تاریخ آخرین انبارگردانی', 'تاریخ انبارگردانی'], cal),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: actorName,
    });
  }
  return out;
}

function parseCoreStructuredTransit(
  records: Record<string, unknown>[],
  cal: CalendarMode,
  actorName: string,
): Omit<TransitEntry, 'id'>[] {
  const now = new Date().toISOString();
  const out: Omit<TransitEntry, 'id'>[] = [];
  for (const r of records) {
    const packingListNo = strField(r, ['packingListNo', 'شماره پکینگ لیست']);
    const itemDescription = strField(r, ['itemDescription', 'description', 'شرح کالا']);
    const overallStatus = strField(r, ['overallStatus', 'وضعیت کلی']);
    if (!packingListNo && !itemDescription && !overallStatus) continue;
    out.push({
      rowNo: strField(r, ['rowNo', 'ردیف']),
      arrivalDate: dateField(r, ['arrivalDate', 'تاریخ ورود'], cal),
      overallStatus,
      inspectionRequest: strField(r, ['inspectionRequest', 'درخواست بازرسی']),
      releaseNetNo: strField(r, ['releaseNetNo', 'شماره رلیزنت']),
      releaseNetDate: dateField(r, ['releaseNetDate', 'تاریخ رلیزنت'], cal),
      mapnaShippingNotice: strField(r, ['mapnaShippingNotice', 'اعلام حمل به مپنا']),
      interimNo: strField(r, ['interimNo', 'شماره علی الحساب']),
      interimDate: dateField(r, ['interimDate', 'تاریخ علی الحساب'], cal),
      supplier: strField(r, ['supplier', 'تامین کننده']),
      dispatchLocation: strField(r, ['dispatchLocation', 'محل ارسال']),
      packingListNo,
      packageNo: strField(r, ['packageNo', 'شماره نگله']),
      itemDescription,
      system: strField(r, ['system', 'سیستم']),
      subSystem: strField(r, ['subSystem', 'ساب سیستم']),
      unit: strField(r, ['unit', 'واحد']),
      equipmentSupplyCode: strField(r, ['equipmentSupplyCode', 'کد تامین تجهیزات']),
      carrierContractor: strField(r, ['carrierContractor', 'پیمانکار حمل']),
      billOfLadingNo: strField(r, ['billOfLadingNo', 'شماره بارنامه']),
      amount: numField(r, ['amount', 'مبلغ']),
      createdAt: now,
      updatedAt: now,
      createdBy: actorName,
    });
  }
  return out;
}

interface SharedAutoPreviewCache {
  linkIndexes: CoreLinkIndexes;
  generalDupKeys: Set<string>;
  detailedDupKeys: Set<string>;
  transitDupKeys: Set<string>;
}

function buildSharedAutoPreviewCache(db: ImportableDatabase): SharedAutoPreviewCache {
  return {
    linkIndexes: buildCoreLinkIndexes(db),
    generalDupKeys: new Set((db.general || []).map((g) => buildGeneralDupKey(g)).filter(Boolean)),
    detailedDupKeys: new Set((db.detailed || []).map((d) => buildDetailedDupKey(d)).filter(Boolean)),
    transitDupKeys: new Set((db.transit || []).map((t) => buildTransitDupKey(t)).filter(Boolean)),
  };
}

function evaluateSingleScopeForSheet(params: {
  db: ImportableDatabase;
  sheet: AutoWorkbookSheetInput;
  scope: ExtendedImportScope;
  assumedCalendar: CalendarMode;
  actorName: string;
  preparsedRows?: { rows: Record<string, unknown>[]; skippedEmpty: number };
  sharedCache?: SharedAutoPreviewCache;
}): {
  isOperational: boolean;
  rowCount: number;
  duplicateDbCount: number;
  estimatedLinks: OperationalLinkCounts;
  warnings: string[];
} {
  const { db, sheet: s, scope, assumedCalendar, actorName, preparsedRows, sharedCache } = params;
  if (isOperationalScope(scope)) {
    const prev = previewOperationalFormImport({
      db,
      scope,
      matrix: s.matrix,
      formulaMap: s.formulaMap,
      structuredRecords: s.structuredRecords,
      preparsedRows,
      prebuiltIndexes: sharedCache?.linkIndexes,
      skipDelta: true,
      sheetName: s.name,
      assumedCalendar,
      actorName,
    });
    return {
      isOperational: true,
      rowCount: prev.totalRows,
      duplicateDbCount: prev.duplicateDbCount,
      estimatedLinks: prev.estimatedLinks,
      warnings: prev.warnings,
    };
  }

  if (scope === 'general') {
    const rows = s.structuredRecords?.length
      ? parseCoreStructuredGeneral(s.structuredRecords, assumedCalendar, actorName)
      : parseGeneralCsv(s.matrix || [], assumedCalendar, actorName, s.columnMapping).rows;
    const dbKeys = sharedCache?.generalDupKeys || new Set(db.general.map((g) => buildGeneralDupKey(g)).filter(Boolean));
    const dupCount = rows.filter((r) => {
      const k = buildGeneralDupKey(r);
      return Boolean(k && dbKeys.has(k));
    }).length;
    return {
      isOperational: false,
      rowCount: rows.length,
      duplicateDbCount: dupCount,
      estimatedLinks: { general: 0, detailed: 0, transit: 0 },
      warnings: [],
    };
  }

  if (scope === 'detailed') {
    const rows = s.structuredRecords?.length
      ? parseCoreStructuredDetailed(s.structuredRecords, assumedCalendar, actorName)
      : parseDetailedCsv(s.matrix || [], assumedCalendar, actorName, s.columnMapping).rows;
    const dbKeys = sharedCache?.detailedDupKeys || new Set(db.detailed.map((d) => buildDetailedDupKey(d)).filter(Boolean));
    const dupCount = rows.filter((r) => {
      const k = buildDetailedDupKey(r);
      return Boolean(k && dbKeys.has(k));
    }).length;
    return {
      isOperational: false,
      rowCount: rows.length,
      duplicateDbCount: dupCount,
      estimatedLinks: { general: 0, detailed: 0, transit: 0 },
      warnings: [],
    };
  }

  const rows = s.structuredRecords?.length
    ? parseCoreStructuredTransit(s.structuredRecords, assumedCalendar, actorName)
    : parseTransitCsv(s.matrix || [], assumedCalendar, actorName, s.columnMapping).rows;
  const dbKeys = sharedCache?.transitDupKeys || new Set(db.transit.map((t) => buildTransitDupKey(t)).filter(Boolean));
  const dupCount = rows.filter((r) => {
    const k = buildTransitDupKey(r);
    return Boolean(k && dbKeys.has(k));
  }).length;
  return {
    isOperational: false,
    rowCount: rows.length,
    duplicateDbCount: dupCount,
    estimatedLinks: { general: 0, detailed: 0, transit: 0 },
    warnings: [],
  };
}

/**
 * Detects ALL candidate target sections that have matching columns & real rows inside a single sheet.
 * Enables a single sheet (e.g., Detailed + Stocktake + OPI/MER/MIV/GCV/BMR) to be mapped to one or
 * multiple user-confirmed sections of the software.
 */
export function detectCandidateScopesForSheet(params: {
  db: ImportableDatabase;
  sheet: AutoWorkbookSheetInput;
  assumedCalendar: CalendarMode;
  actorName: string;
  sharedCache?: SharedAutoPreviewCache;
}): DetectedScopeCandidate[] {
  const { db, sheet: s, assumedCalendar, actorName } = params;
  const sharedCache = params.sharedCache || buildSharedAutoPreviewCache(db);
  const { scores, sheetScope, coreDetected, hintScope } = scoreExtendedScopes(
    s.matrix || [],
    s.name,
    s.sectionHint,
    s.structuredRecords,
  );

  const primaryScope =
    s.forcedScope ||
    detectExtendedScope(s.matrix || [], s.name, s.sectionHint, s.structuredRecords);

  const candidateScopes = new Set<ExtendedImportScope>();
  if (primaryScope) candidateScopes.add(primaryScope);
  if (hintScope) candidateScopes.add(hintScope);
  if (sheetScope) candidateScopes.add(sheetScope);
  if (coreDetected) candidateScopes.add(coreDetected);

  // Include all other scopes with meaningful header signal (score >= 4) so multi-section sheets are surfaced
  for (const sc of ALL_EXTENDED_SCOPES) {
    if (scores[sc] >= 4) {
      candidateScopes.add(sc);
    }
  }

  // Build row objects + O(1) header schema ONCE for all operational candidates of this sheet!
  const hasOperationalCandidate = Array.from(candidateScopes).some((sc) => isOperationalScope(sc));
  const preparsedRows =
    hasOperationalCandidate && !s.structuredRecords?.length && Array.isArray(s.matrix) && s.matrix.length > 0
      ? matrixToRowObjects(s.matrix, s.formulaMap)
      : undefined;

  const evaluated: DetectedScopeCandidate[] = [];
  for (const sc of candidateScopes) {
    const res = evaluateSingleScopeForSheet({
      db,
      sheet: s,
      scope: sc,
      assumedCalendar,
      actorName,
      preparsedRows,
      sharedCache,
    });
    const isPrimary = sc === primaryScope;
    // Keep non-primary candidates only when they genuinely extract >= 1 record from the sheet
    if (!isPrimary && res.rowCount === 0) continue;
    const scoreVal = scores[sc] || (isPrimary ? 4 : 0);
    const confidence: 'high' | 'medium' | 'low' =
      scoreVal >= 8 || isPrimary ? 'high' : scoreVal >= 5 ? 'medium' : 'low';
    evaluated.push({
      scope: sc,
      isOperational: res.isOperational,
      score: scoreVal,
      confidence,
      isPrimary,
      rowCount: res.rowCount,
      duplicateDbCount: res.duplicateDbCount,
      estimatedLinks: res.estimatedLinks,
      warnings: res.warnings,
    });
  }

  evaluated.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return EXTENDED_SCOPE_META[a.scope].order - EXTENDED_SCOPE_META[b.scope].order;
  });

  return evaluated;
}

export function previewAutoWorkbook(params: {
  db: ImportableDatabase;
  sheets: AutoWorkbookSheetInput[];
  assumedCalendar: CalendarMode;
  actorName: string;
}): { detectedSheets: AutoWorkbookPreviewSection[] } {
  const { db, sheets, assumedCalendar, actorName } = params;
  const sharedCache = buildSharedAutoPreviewCache(db);
  const results: AutoWorkbookPreviewSection[] = [];

  for (const s of sheets) {
    const candidates = detectCandidateScopesForSheet({
      db,
      sheet: s,
      assumedCalendar,
      actorName,
      sharedCache,
    });
    const primary = candidates[0] || null;

    if (!primary) {
      results.push({
        sheetName: s.name,
        scope: null,
        isOperational: false,
        rowCount: Math.max(0, (s.structuredRecords?.length || (s.matrix?.length ? s.matrix.length - 1 : 0))),
        duplicateDbCount: 0,
        estimatedLinks: { general: 0, detailed: 0, transit: 0 },
        warnings: ['نوع این شیت به صورت خودکار تشخیص داده نشد؛ می‌توانید بخش مقصد آن را دستی انتخاب کنید.'],
        candidates: [],
      });
      continue;
    }

    results.push({
      sheetName: s.name,
      scope: primary.scope,
      isOperational: primary.isOperational,
      rowCount: primary.rowCount,
      duplicateDbCount: primary.duplicateDbCount,
      estimatedLinks: primary.estimatedLinks,
      warnings: primary.warnings,
      candidates,
    });
  }

  results.sort((a, b) => {
    const oa = a.scope ? EXTENDED_SCOPE_META[a.scope].order : 999;
    const ob = b.scope ? EXTENDED_SCOPE_META[b.scope].order : 999;
    return oa - ob;
  });

  return { detectedSheets: results };
}

/**
 * Commits ALL detected sheets (core + operational/custom forms) in strict dependency order:
 * transit -> general -> detailed -> siteEntry -> opiInvitations -> opiMinutes -> osdr -> gcv -> miv -> substitutions -> mto -> materialBalance -> stocktake -> periodic -> customForms.
 * Guarantees that operational forms immediately cross-link to newly imported AND pre-existing core rows!
 */
export function commitAutoWorkbook(params: {
  db: ImportableDatabase;
  sheets: AutoWorkbookSheetInput[];
  assumedCalendar: CalendarMode;
  duplicateRecordPolicy: 'replace' | 'skip' | 'delta';
  actorName: string;
}): AutoWorkbookCommitSummary {
  const { db, sheets, assumedCalendar, duplicateRecordPolicy, actorName } = params;
  const now = new Date().toISOString();

  const resolved: Array<{ input: AutoWorkbookSheetInput; scope: ExtendedImportScope }> = [];
  for (const s of sheets) {
    const scope =
      s.forcedScope ||
      detectExtendedScope(s.matrix || [], s.name, s.sectionHint, s.structuredRecords);
    if (scope) resolved.push({ input: s, scope });
  }

  // Sort in exact dependency order so core tables exist before operational forms link to them
  resolved.sort((a, b) => EXTENDED_SCOPE_META[a.scope].order - EXTENDED_SCOPE_META[b.scope].order);

  const sections: AutoWorkbookCommitSection[] = [];
  const touchedPackings = new Set<string>();

  for (const { input, scope } of resolved) {
    if (isOperationalScope(scope)) {
      const res = commitOperationalFormImport({
        db,
        scope,
        matrix: input.matrix,
        formulaMap: input.formulaMap,
        structuredRecords: input.structuredRecords,
        sheetName: input.name,
        assumedCalendar,
        duplicateRecordPolicy,
        actorName,
      });
      sections.push({
        sheetName: input.name,
        scope,
        isOperational: true,
        imported: res.imported,
        replaced: res.replaced,
        skipped: res.skipped,
        unchangedSkipped: res.unchangedSkipped || 0,
        linkedGeneral: res.linkedGeneral,
        linkedDetailed: res.linkedDetailed,
        linkedTransit: res.linkedTransit,
        warnings: res.warnings,
      });
      continue;
    }

    // Core table commit
    let imported = 0;
    let replaced = 0;
    let skipped = 0;
    let unchangedSkipped = 0;
    let linkedTransit = 0;

    if (scope === 'transit') {
      const rows = input.structuredRecords?.length
        ? parseCoreStructuredTransit(input.structuredRecords, assumedCalendar, actorName)
        : parseTransitCsv(input.matrix || [], assumedCalendar, actorName, input.columnMapping).rows;
      const dbByKey = new Map<string, TransitEntry>();
      for (const t of db.transit) {
        const k = buildTransitDupKey(t);
        if (k) dbByKey.set(k, t);
      }
      for (const r of rows) {
        const pk = normKey(r.packingListNo);
        const arrived = Boolean(
          pk &&
            (db.general.some((g) => normMatchKey(g.packingListNo) === normMatchKey(pk)) ||
              db.detailed.some((d) => normMatchKey(d.shipmentNo) === normMatchKey(pk))),
        );
        const normStatus = arrived
          ? 'رسیده'
          : normalizeTransitStatus(r.overallStatus, db.categories?.transitStatus);
        const k = buildTransitDupKey(r);
        const existing = k ? dbByKey.get(k) : undefined;
        if (existing) {
          if (duplicateRecordPolicy === 'skip') {
            skipped += 1;
            continue;
          }
          if (duplicateRecordPolicy === 'delta' && !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, { ...r, overallStatus: normStatus } as unknown as Record<string, unknown>)) {
            unchangedSkipped += 1;
            skipped += 1;
            continue;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            overallStatus: normStatus,
            linkedGeneralPackingNo: arrived ? pk : existing.linkedGeneralPackingNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
        } else {
          const created: TransitEntry = {
            ...r,
            id: makeId(),
            overallStatus: normStatus,
            linkedGeneralPackingNo: arrived ? pk : undefined,
            createdAt: now,
            updatedAt: now,
            createdBy: actorName,
          };
          if (k) dbByKey.set(k, created);
          db.transit.push(created);
          imported += 1;
        }
      }
      db.transit.forEach((item, i) => {
        item.rowNo = String(i + 1);
      });
    } else if (scope === 'general') {
      const rows = input.structuredRecords?.length
        ? parseCoreStructuredGeneral(input.structuredRecords, assumedCalendar, actorName)
        : parseGeneralCsv(input.matrix || [], assumedCalendar, actorName, input.columnMapping).rows;
      const dbByKey = new Map<string, GeneralEntry>();
      for (const g of db.general) {
        const k = buildGeneralDupKey(g);
        if (k) dbByKey.set(k, g);
      }
      for (const r of rows) {
        const k = buildGeneralDupKey(r);
        const existing = k ? dbByKey.get(k) : undefined;
        if (existing) {
          if (duplicateRecordPolicy === 'skip') {
            skipped += 1;
            continue;
          }
          if (duplicateRecordPolicy === 'delta' && !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>)) {
            unchangedSkipped += 1;
            skipped += 1;
            continue;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
        } else {
          const created: GeneralEntry = {
            ...r,
            id: makeId(),
            createdAt: now,
            updatedAt: now,
            createdBy: actorName,
          };
          if (k) dbByKey.set(k, created);
          db.general.push(created);
          imported += 1;
        }
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
      }
      db.general.forEach((item, i) => {
        item.rowNo = String(i + 1);
      });
    } else if (scope === 'detailed') {
      const rows = input.structuredRecords?.length
        ? parseCoreStructuredDetailed(input.structuredRecords, assumedCalendar, actorName)
        : parseDetailedCsv(input.matrix || [], assumedCalendar, actorName, input.columnMapping).rows;
      const dbByKey = new Map<string, DetailedEntry>();
      for (const d of db.detailed) {
        const k = buildDetailedDupKey(d);
        if (k) dbByKey.set(k, d);
      }
      for (const r of rows) {
        const k = buildDetailedDupKey(r);
        const existing = k ? dbByKey.get(k) : undefined;
        if (existing) {
          if (duplicateRecordPolicy === 'skip') {
            skipped += 1;
            continue;
          }
          if (duplicateRecordPolicy === 'delta' && !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, { ...r, countingUnit: normalizeCountingUnitToFa(r.countingUnit) } as unknown as Record<string, unknown>)) {
            unchangedSkipped += 1;
            skipped += 1;
            continue;
          }
          Object.assign(existing, {
            ...r,
            countingUnit: normalizeCountingUnitToFa(r.countingUnit),
            id: existing.id,
            rowNo: existing.rowNo,
            shortageBackfills: existing.shortageBackfills || [],
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
        } else {
          const created: DetailedEntry = {
            ...r,
            countingUnit: normalizeCountingUnitToFa(r.countingUnit),
            shortageBackfills: r.shortageBackfills || [],
            id: makeId(),
            createdAt: now,
            updatedAt: now,
            createdBy: actorName,
          };
          if (k) dbByKey.set(k, created);
          db.detailed.push(created);
          imported += 1;
        }
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
      }
      db.detailed.forEach((item, i) => {
        item.rowNo = String(i + 1);
      });
    }

    // Sync transit auto-arrival for touched general/detailed packings immediately before operational forms run
    if ((scope === 'general' || scope === 'detailed') && touchedPackings.size > 0) {
      for (const pkRaw of touchedPackings) {
        const pkNorm = normMatchKey(pkRaw);
        if (!pkNorm) continue;
        if (!db.packingMeta[pkRaw]) {
          db.packingMeta[pkRaw] = {
            packingNo: pkRaw,
            isClosed: true,
            closedAt: now,
            closedBy: actorName,
          };
        }
        for (const t of db.transit) {
          if (normMatchKey(t.packingListNo) === pkNorm && t.overallStatus !== 'رسیده') {
            t.overallStatus = 'رسیده';
            t.linkedGeneralPackingNo = pkRaw;
            t.updatedAt = now;
            linkedTransit += 1;
          }
        }
      }
    }

    sections.push({
      sheetName: input.name,
      scope,
      isOperational: false,
      imported,
      replaced,
      skipped,
      unchangedSkipped,
      linkedGeneral: 0,
      linkedDetailed: 0,
      linkedTransit,
      warnings: [],
    });
  }

  const totals = sections.reduce(
    (acc, s) => ({
      imported: acc.imported + s.imported,
      replaced: acc.replaced + s.replaced,
      skipped: acc.skipped + s.skipped,
      unchangedSkipped: (acc.unchangedSkipped || 0) + (s.unchangedSkipped || 0),
      linkedGeneral: acc.linkedGeneral + s.linkedGeneral,
      linkedDetailed: acc.linkedDetailed + s.linkedDetailed,
      linkedTransit: acc.linkedTransit + s.linkedTransit,
    }),
    { imported: 0, replaced: 0, skipped: 0, unchangedSkipped: 0, linkedGeneral: 0, linkedDetailed: 0, linkedTransit: 0 },
  );

  return { ok: true, sections, totals };
}

