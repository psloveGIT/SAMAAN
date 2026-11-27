import type { DetailedComputed, SubstitutionLineItem } from './types.ts';
import {
  buildSequentialDocNoMatcher,
  formatDocumentNumberWithPlantCode,
  type PlantDocNumberConfig,
} from './docNumbering.ts';

function normalizeDigits(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export const MD1_SUBSTITUTION_FORM_CODE = 'MD1EX-FQP02/10-03';
export const MD1_SUBSTITUTION_TITLE_FA = 'فرم درخواست جایگزینی مواد و تجهیزات';
export const MD1_SUBSTITUTION_QA_NOTICE =
  'توجه : این فرم تحت کنترل واحد QA می‌باشد و هرگونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA می‌باشد.';
export const MD1_SUBSTITUTION_COPY_TEXT = 'رونوشت: معاونت تأمین، فروشنده، پیمانکار نصب';
export const DEFAULT_SUPPLY_URGENCY = 'عادی';
export const SUPPLY_URGENCY_OPTIONS = ['عادی', 'اضطراری'] as const;
export type SupplyUrgencyValue = (typeof SUPPLY_URGENCY_OPTIONS)[number];
export const SUBSTITUTION_DEFAULT_COST_BEARERS = [
  'نصب نیرو نصب',
  'نصب نیرو ساختمان',
  'مپنا توسعه یک',
  'توگا',
  'مکو',
  'پارس',
] as const;

/**
 * Common Persian -> Latin transliteration map for generating deterministic 2-letter
 * English uppercase supplier prefixes when a supplier name is written in Persian.
 */
const PERSIAN_TO_LATIN: Record<string, string> = {
  ا: 'A',
  آ: 'A',
  أ: 'A',
  إ: 'E',
  ب: 'B',
  پ: 'P',
  ت: 'T',
  ث: 'S',
  ج: 'J',
  چ: 'C',
  ح: 'H',
  خ: 'K',
  د: 'D',
  ذ: 'Z',
  ر: 'R',
  ز: 'Z',
  ژ: 'Z',
  س: 'S',
  ش: 'S',
  ص: 'S',
  ض: 'Z',
  ط: 'T',
  ظ: 'Z',
  ع: 'A',
  غ: 'G',
  ف: 'F',
  ق: 'G',
  ک: 'K',
  ك: 'K',
  گ: 'G',
  ل: 'L',
  م: 'M',
  ن: 'N',
  و: 'V',
  ه: 'H',
  ة: 'H',
  ی: 'Y',
  ي: 'Y',
};

const KNOWN_SUPPLIER_PREFIXES: Array<{ pattern: RegExp; prefix: string }> = [
  // Official explicit rules from MD1EX-FQP02/10-03 specification:
  { pattern: /\bTUGA\b|توگا/i, prefix: 'TU' },
  { pattern: /\bMECO\b|مکو/i, prefix: 'ME' },
  { pattern: /\bPARS\b|پارس/i, prefix: 'PS' },
  // Common power-plant suppliers for clean intuitive 2-letter codes:
  { pattern: /\bMAPNA\b|مپنا/i, prefix: 'MP' },
  { pattern: /\bMD1\b|توسعه\s*یک/i, prefix: 'M1' },
  { pattern: /\bMD2\b|توسعه\s*دو/i, prefix: 'M2' },
  { pattern: /\bMD3\b|توسعه\s*سه/i, prefix: 'M3' },
  { pattern: /\bSIEMENS\b|زیمنس/i, prefix: 'SI' },
  { pattern: /\bANSALDO\b|آنسالدو/i, prefix: 'AN' },
  { pattern: /\bMONENCO\b|موننکو/i, prefix: 'MO' },
  { pattern: /\bTAVANIR\b|توانیر/i, prefix: 'TV' },
  { pattern: /\bIRAN\s*TRANSFO\b|ایران\s*ترانسفو/i, prefix: 'IT' },
  { pattern: /\bAZARAB\b|آذرآب/i, prefix: 'AZ' },
  { pattern: /\bMACHINE\s*SAZI\b|ماشین\s*سازی/i, prefix: 'MS' },
];

function transliteratePersianWord(word: string): string {
  let out = '';
  for (const ch of word) {
    if (/[A-Za-z]/.test(ch)) {
      out += ch.toUpperCase();
    } else if (PERSIAN_TO_LATIN[ch]) {
      out += PERSIAN_TO_LATIN[ch];
    }
  }
  return out;
}

/**
 * Resolves a 2-character English uppercase supplier prefix for substitution numbering:
 * - TUGA -> TU
 * - MECO -> ME
 * - PARS -> PS
 * - Any other supplier -> deterministic 2-letter uppercase abbreviation.
 */
export function resolveSupplierPrefix(supplierName?: string | null): string {
  const clean = (supplierName || '').trim();
  if (!clean) return 'GN';

  for (const rule of KNOWN_SUPPLIER_PREFIXES) {
    if (rule.pattern.test(clean)) {
      return rule.prefix;
    }
  }

  // Extract Latin tokens first if present
  const latinTokens = clean
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => t.replace(/[^A-Za-z]/g, '').toUpperCase())
    .filter(Boolean);

  if (latinTokens.length >= 2) {
    return `${latinTokens[0][0]}${latinTokens[1][0]}`;
  }
  if (latinTokens.length === 1) {
    const tok = latinTokens[0];
    if (tok.length >= 2) return tok.slice(0, 2);
    return `${tok}X`;
  }

  // Transliterate Persian / non-Latin tokens
  const persianTokens = clean
    .split(/[\s\-_/،,()]+/)
    .map((t) => transliteratePersianWord(t))
    .filter(Boolean);

  if (persianTokens.length >= 2) {
    return `${persianTokens[0][0]}${persianTokens[1][0]}`;
  }
  if (persianTokens.length === 1) {
    const tok = persianTokens[0];
    if (tok.length >= 2) return tok.slice(0, 2);
    return `${tok}X`;
  }

  return 'GN';
}

/**
 * Generates the next sequential substitution number in the exact `XX-####` format
 * (or plant-abbreviation prefixed/infixed `NK-XX-####` / `XX-NK-####` when enabled)
 * scoped per 2-letter supplier prefix.
 */
export function generateNextSubstitutionDocNo(
  supplierName: string | undefined | null,
  existingDocNos: readonly string[],
  plantConfig?: PlantDocNumberConfig | null,
): string {
  const prefix = resolveSupplierPrefix(supplierName);
  const matcher = buildSequentialDocNoMatcher(prefix);
  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of existingDocNos) {
    const normalized = normalizeDigits(String(rawNo || '')).trim().toUpperCase();
    if (!normalized) continue;
    used.add(normalized);
    const match = normalized.match(matcher);
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let next = maxSeq + 1;
  let candidate = formatDocumentNumberWithPlantCode(
    prefix,
    String(next).padStart(4, '0'),
    plantConfig,
  );
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = formatDocumentNumberWithPlantCode(
      prefix,
      String(next).padStart(4, '0'),
      plantConfig,
    );
  }
  return candidate;
}

/**
 * Generates the next sequential auto-issued Warehouse Issue Voucher (MIV) number
 * (e.g. `MIV-0001`, `NK-MIV-0001`, or `MIV-NK-0001`), avoiding collisions with any existing MIV numbers.
 */
export function generateNextAutoMivDocNo(
  existingMivDocNos: readonly string[],
  plantConfig?: PlantDocNumberConfig | null,
): string {
  const matcher = buildSequentialDocNoMatcher('MIV');
  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of existingMivDocNos) {
    const normalized = normalizeDigits(String(rawNo || '')).trim().toUpperCase();
    if (!normalized) continue;
    used.add(normalized);
    const m = normalized.match(matcher);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) {
        maxSeq = n;
      }
    }
  }

  let next = maxSeq + 1;
  let candidate = formatDocumentNumberWithPlantCode(
    'MIV',
    String(next).padStart(4, '0'),
    plantConfig,
  );
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = formatDocumentNumberWithPlantCode(
      'MIV',
      String(next).padStart(4, '0'),
      plantConfig,
    );
  }
  return candidate;
}

/**
 * Sanitizes live user input for quantity fields so ONLY digits (Persian/Arabic/English)
 * and at most one decimal dot are allowed.
 */
export function sanitizeNumericQtyInput(raw: string): string {
  const normalized = normalizeDigits(String(raw || ''))
    .replace(/[,،\s]/g, '')
    .replace(/\//g, '.');
  let result = '';
  let hasDot = false;
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if (ch === '.' && !hasDot) {
      hasDot = true;
      result += '.';
    }
  }
  return result;
}

/**
 * Strictly parses a positive number from user input (supports Persian/Arabic/English digits).
 * Returns `null` if empty, contains non-numeric characters, is NaN/Infinity, or <= 0.
 */
export function parseStrictPositiveNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const normalized = normalizeDigits(String(raw)).trim();
  if (!normalized) return null;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Returns true if a Detailed Equipment item currently has positive available stock
 * in either Employer warehouse (`mapnaInventory > 0`) or Contractor warehouse (`contractorInventory > 0`).
 */
export function hasAvailableSiteStock(
  item: Pick<DetailedComputed, 'opiPending' | 'mapnaInventory' | 'contractorInventory'>,
): boolean {
  if (item.opiPending) return false;
  return item.mapnaInventory > 0 || item.contractorInventory > 0;
}

export type ReplacementStockSource = 'mapna' | 'contractor';

/**
 * Determines the default stock pool for issuing a replacement item.
 */
export function getDefaultStockSource(
  item: Pick<DetailedComputed, 'mapnaInventory' | 'contractorInventory'>,
): ReplacementStockSource {
  if (item.mapnaInventory > 0) return 'mapna';
  return 'contractor';
}

export function getAvailableStockForSource(
  item: Pick<DetailedComputed, 'mapnaInventory' | 'contractorInventory'>,
  source: ReplacementStockSource,
): number {
  return source === 'mapna' ? Math.max(0, item.mapnaInventory) : Math.max(0, item.contractorInventory);
}

export function uniqueJoinedValues(values: Array<string | undefined | null>, sep = ' / '): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const raw of values) {
    const clean = (raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(clean);
    }
  }
  return ordered.join(sep);
}

function uniqueJoined(values: Array<string | undefined | null>): string {
  return uniqueJoinedValues(values, ' / ');
}

export interface SubstitutionHeaderMeta {
  projectName: string;
  contractNo: string;
  system: string;
  island: string;
  unit: string;
  supplier: string;
  supplyUrgency: string;
  installerContractor: string;
  mivNo: string;
  merNcrNo: string;
}

/**
 * Aggregates MD1EX-FQP02/10-03 header metadata (rules 1-1 through 1-12)
 * from the active project and the selected Section «الف» items.
 */
export function buildSubstitutionHeaderMeta(
  originalItems: ReadonlyArray<
    Pick<
      SubstitutionLineItem,
      'system' | 'island' | 'unit' | 'supplier' | 'receiver' | 'merNo'
    >
  >,
  options: {
    projectName?: string | null;
    contractRef?: string | null;
    supplyUrgency?: string | null;
    mivNo?: string | null;
  },
): SubstitutionHeaderMeta {
  return {
    projectName: (options.projectName || '').trim(),
    contractNo: (options.contractRef || '').trim(),
    system: uniqueJoined(originalItems.map((i) => i.system)),
    island: uniqueJoined(originalItems.map((i) => i.island)),
    unit: uniqueJoined(originalItems.map((i) => i.unit)),
    supplier: uniqueJoined(originalItems.map((i) => i.supplier)),
    supplyUrgency: (options.supplyUrgency || '').trim() || DEFAULT_SUPPLY_URGENCY,
    installerContractor: uniqueJoined(originalItems.map((i) => i.receiver)),
    mivNo: (options.mivNo || '').trim(),
    merNcrNo: uniqueJoined(originalItems.map((i) => i.merNo)),
  };
}

/**
 * Builds the Cause of Replacement lines shown under «علت تعویض:»:
 * Line 1: exact replacement reason text (without any "دلیل تعویض قطعات:" prefix)
 * Line 2: تأمین کننده مجدد (when specified)
 */
export function buildReplacementCauseLines(reason?: string | null, reprocureBy?: string | null): string[] {
  const lines: string[] = [];
  const cleanReason = (reason || '').replace(/\r\n/g, '\n').trim();
  const cleanReprocure = (reprocureBy || '').trim();
  if (cleanReason) {
    lines.push(cleanReason);
  }
  if (cleanReprocure) {
    lines.push(`تأمین کننده مجدد: ${cleanReprocure}`);
  }
  return lines;
}

/**
 * Builds the exact multiline text written to `repDescription` in Detailed Equipment
 * (strictly the exact text printed under «علت تعویض:»).
 */
export function buildReplacementDetailedDescription(
  reason?: string | null,
  reprocureBy?: string | null,
): string {
  return buildReplacementCauseLines(reason, reprocureBy).join('\n');
}

/**
 * Removes a specific reference token (e.g. a substitution docNo or MIV docNo) from a comma/Persian-comma separated field.
 */
export function removeRefTokenFromList(raw: string | undefined | null, tokenToRemove: string): string {
  const target = (tokenToRemove || '').trim().toLowerCase();
  if (!target) return (raw || '').trim();
  const parts = String(raw || '')
    .split(/[،,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const remaining = parts.filter((p) => p.toLowerCase() !== target);
  return remaining.join('، ');
}

/**
 * Removes a multiline block (or legacy prefixed block) belonging to a deleted/edited substitution from `repDescription`.
 */
export function stripSubstitutionBlockFromText(
  existing: string | undefined | null,
  docNo: string,
  reason?: string | null,
  reprocureBy?: string | null,
): string {
  const cleanExisting = String(existing || '').replace(/\r\n/g, '\n').trim();
  if (!cleanExisting) return '';

  const exactBlock = buildReplacementDetailedDescription(reason, reprocureBy).trim();
  const linesToRemove = new Set<string>();
  if (exactBlock) {
    for (const l of exactBlock.split('\n')) {
      const t = l.trim();
      if (t) linesToRemove.add(t);
    }
  }
  const cleanReason = (reason || '').trim();
  if (cleanReason) {
    linesToRemove.add(`دلیل تعویض قطعات: ${cleanReason}`);
  }

  const normalizedDoc = (docNo || '').trim().toLowerCase();
  const keptLines = cleanExisting
    .split('\n')
    .map((l) => l.trim())
    .filter((line) => {
      if (!line) return false;
      if (linesToRemove.has(line)) return false;
      if (normalizedDoc && line.toLowerCase().includes(normalizedDoc)) return false;
      return true;
    });

  return keptLines.join('\n').trim();
}

/**
 * Builds the exact official MD1EX-FQP02/10-03 agreement paragraph (rule 1-29).
 */
export function buildReplacementAgreementText(
  reprocureBy?: string | null,
  costBorneBy?: string | null,
): string {
  const cleanReprocure = (reprocureBy || '').trim() || '..................';
  const cleanCost = (costBorneBy || '').trim() || '..................';
  return `امضاء کنندگان ذیل توافق و تایید نمودند که مواد/ تجهیزات تعیین شده در(ب) می توانند به جای اقلام قید شده در(الف) مورد استفاده قرار بگیرند، از سوی دیگر مواد/ تجهیزات جایگزین می بایست توسط ${cleanReprocure} مجددا تهیه شده و هزینه های ذیربط توسط ${cleanCost} می بایست پرداخت شوند.`;
}
