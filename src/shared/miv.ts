import {
  extractPlantDocConfig,
  preserveMultilineText,
  toAsciiDigitsOnly,
  validatePlantAbbreviation,
  type PlantDocNumberConfig,
} from './docNumbering.ts';
import { roundQty } from './formulas.ts';
import type { DetailedComputed, DocumentLineItem, ProjectInfo } from './types.ts';

/**
 * Normalizes Persian/Arabic characters and spacing for contractor abbreviation lookup.
 */
function normalizeContractorKey(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/[\u200c\u200d\u00a0]/g, ' ') // ZWNJ / ZWJ / NBSP -> space
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/ء/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface ContractorRule {
  code: string;
  patterns: string[];
}

/**
 * Exact contractor abbreviation rules per MD1EX-FQP02/05-03 specification (1-22-1 to 1-22-15).
 */
const CONTRACTOR_ABBR_RULES: readonly ContractorRule[] = [
  { code: 'NNE', patterns: ['نصب نیرو نصب', 'نصب نيرو نصب', 'نصب‌نیرو‌نصب', 'nne'] },
  { code: 'OXN', patterns: ['اکسین صنعت', 'اکسین‌صنعت', 'oxn', 'oxin'] },
  { code: 'ALA', patterns: ['اعلا نیرو', 'اعلاء نیرو', 'اعلانیرو', 'ala'] },
  { code: 'IRT', patterns: ['ایران ترانسفورمر', 'ایران ترانسفو', 'ایران‌ترانسفورمر', 'irt', 'iran transformer'] },
  { code: 'OM', patterns: ['بهره بردار', 'بهرهبردار', 'بهره‌بردار', 'om', 'o m'] },
  { code: 'PSE', patterns: ['پالا سازه انرژی', 'پالاسازه انرژی', 'پالا سازه', 'pse'] },
  { code: 'KHJ', patterns: ['خواجوی', 'خواجویی', 'khj', 'khajavi', 'khajooi'] },
  { code: 'TU', patterns: ['توگا', 'توربین سازی مپنا', 'tuga', 'toga', 'tu'] },
  { code: 'HABA', patterns: ['حریق بان', 'حریقبان', 'حریق‌بان', 'haba', 'harighban'] },
  { code: 'FAB', patterns: ['فابکو', 'فابكو', 'fabco', 'fab'] },
  { code: 'MECO', patterns: ['مکو', 'مكو', 'meco'] },
  { code: 'MAHAM', patterns: ['مهام شرق', 'مهام‌شرق', 'maham'] },
  {
    code: 'NNC',
    patterns: [
      'صبن نیرو ساختمان',
      'صبا نیرو ساختمان',
      'نصب نیرو ساختمان',
      'صنعت نیرو ساختمان',
      'صبن‌نیرو‌ساختمان',
      'nnc',
    ],
  },
  // 1-22-13: کارفرما یا مپنا -> MD1 (placed after specific MAPNA subsidiaries like توگا/فابکو/مکو)
  { code: 'MD1', patterns: ['کارفرما', 'مپنا', 'توسعه یک', 'md1', 'mapna'] },
];

const PERSIAN_TO_LATIN_CHAR: Record<string, string> = {
  ا: 'A',
  ب: 'B',
  پ: 'P',
  ت: 'T',
  ث: 'S',
  ج: 'J',
  چ: 'CH',
  ح: 'H',
  خ: 'KH',
  د: 'D',
  ذ: 'Z',
  ر: 'R',
  ز: 'Z',
  ژ: 'ZH',
  س: 'S',
  ش: 'SH',
  ص: 'S',
  ض: 'Z',
  ط: 'T',
  ظ: 'Z',
  ع: 'A',
  غ: 'GH',
  ف: 'F',
  ق: 'GH',
  ک: 'K',
  گ: 'G',
  ل: 'L',
  م: 'M',
  ن: 'N',
  و: 'V',
  ه: 'H',
  ی: 'Y',
};

const PERSIAN_STOP_WORDS = new Set([
  'شرکت',
  'مهندسی',
  'صنعتی',
  'سهامی',
  'خاص',
  'عام',
  'گروه',
  'پیمانکار',
  'پیمانکاری',
  'تامین',
  'تجهیزات',
  'تولیدی',
  'بازرگانی',
  'فنی',
  'بین',
  'المللی',
  'و',
]);

const LATIN_STOP_WORDS = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'ltd',
  'llc',
  'gmbh',
  'group',
  'eng',
  'engineering',
  'industrial',
  'industries',
  'int',
  'international',
  'the',
  'and',
  'of',
  'for',
]);

function transliteratePersianWord(word: string): string {
  let out = '';
  for (let i = 0; i < word.length; i += 1) {
    const ch = word[i];
    if (/[a-zA-Z]/.test(ch)) {
      out += ch.toUpperCase();
      continue;
    }
    const mapped = PERSIAN_TO_LATIN_CHAR[ch];
    if (mapped) {
      out += mapped;
    }
  }
  return out;
}

/**
 * Generates a deterministic 2-5 letter English uppercase abbreviation for arbitrary
 * Persian or English contractor/supplier names (Rule 1-22-16).
 */
export function deriveFallbackContractorAbbr(rawName: string): string {
  const norm = normalizeContractorKey(rawName);
  if (!norm) return 'GEN';

  const rawWords = norm.split(' ').filter(Boolean);
  const meaningfulWords = rawWords.filter(
    (w) => !PERSIAN_STOP_WORDS.has(w) && !LATIN_STOP_WORDS.has(w),
  );
  const words = meaningfulWords.length > 0 ? meaningfulWords : rawWords;

  // Case 1: Already a short English acronym (2-5 uppercase/latin letters)
  if (words.length === 1 && /^[a-z]{2,5}$/i.test(words[0])) {
    return words[0].toUpperCase();
  }

  // Case 2: Multiple words -> take clean initials (up to 4 letters, or 2-3 if fewer words)
  if (words.length >= 2) {
    const initials = words
      .map((w) => {
        const lat = /^[a-z]+$/i.test(w) ? w.toUpperCase() : transliteratePersianWord(w);
        return lat.slice(0, 1);
      })
      .join('')
      .replace(/[^A-Z]/g, '');

    if (initials.length >= 2 && initials.length <= 4) {
      return initials;
    }
    if (initials.length > 4) {
      return initials.slice(0, 4);
    }
  }

  // Case 3: Single word (or insufficient initials) -> transliterate and extract consonants / leading letters (3-4 chars)
  const combined = words
    .map((w) => (/^[a-z]+$/i.test(w) ? w.toUpperCase() : transliteratePersianWord(w)))
    .join('')
    .replace(/[^A-Z]/g, '');

  if (combined.length <= 4 && combined.length >= 2) {
    return combined;
  }
  if (combined.length > 4) {
    // Keep first letter + consonants from rest to form a compact 3-4 letter abbreviation
    const first = combined[0];
    const consonants = combined
      .slice(1)
      .replace(/[AEIOU]/g, '')
      .replace(/(.)\1+/g, '$1');
    const candidate = (first + consonants).slice(0, 4);
    if (candidate.length >= 3) return candidate;
    return combined.slice(0, 3);
  }
  if (combined.length === 1) {
    return `${combined}X`;
  }
  return 'GEN';
}

/**
 * Resolves the exact contractor/requester abbreviation code per rules 1-22-1 through 1-22-16.
 */
export function resolveContractorAbbreviation(contractorName: string | undefined | null): string {
  const norm = normalizeContractorKey(contractorName);
  if (!norm) return 'MD1';

  const compact = norm.replace(/\s+/g, '');

  for (const rule of CONTRACTOR_ABBR_RULES) {
    for (const pat of rule.patterns) {
      const pNorm = normalizeContractorKey(pat);
      const pCompact = pNorm.replace(/\s+/g, '');
      if (
        norm === pNorm ||
        compact === pCompact ||
        norm.includes(pNorm) ||
        (pCompact.length >= 4 && compact.includes(pCompact))
      ) {
        return rule.code;
      }
    }
  }

  return deriveFallbackContractorAbbr(contractorName || '');
}

/**
 * Generates the official MIV document number per Rule 1-22:
 *   `<PLANT_ABBR>-<CONTRACTOR_ABBR>-MIV-####` (e.g. `NK-NNE-MIV-0001`)
 * If no plant abbreviation is configured, falls back cleanly to `<CONTRACTOR_ABBR>-MIV-####`.
 */
export function generateMivDocumentNo(
  contractorName: string | undefined | null,
  existingDocNos: readonly string[],
  plantConfig?: PlantDocNumberConfig | null,
  padWidth = 4,
): string {
  const contractorAbbr = resolveContractorAbbreviation(contractorName);
  const abbrCheck = validatePlantAbbreviation(plantConfig?.plantAbbreviation);
  const plantAbbr = abbrCheck.valid && abbrCheck.normalized ? abbrCheck.normalized : '';

  const prefix = plantAbbr ? `${plantAbbr}-${contractorAbbr}-MIV` : `${contractorAbbr}-MIV`;
  const escapedContractor = contractorAbbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seqMatcher = new RegExp(
    `^(?:[A-Z]{2,3}-)?${escapedContractor}-MIV-(\\d+)$`,
    'i',
  );

  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of existingDocNos) {
    const clean = toAsciiDigitsOnly(String(rawNo || '')).trim().toUpperCase();
    if (!clean) continue;
    used.add(clean);
    const m = clean.match(seqMatcher);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }

  let next = maxSeq + 1;
  let candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = `${prefix}-${String(next).padStart(padWidth, '0')}`;
  }
  return candidate;
}

/**
 * Strictly sanitizes numeric quantity inputs (digits + optional single decimal point).
 * Converts Persian/Arabic numerals to ASCII digits and strips all letters/symbols.
 */
export function sanitizeNumericQtyInput(raw: string): string {
  const ascii = toAsciiDigitsOnly(String(raw || ''));
  let result = '';
  let hasDot = false;
  for (let i = 0; i < ascii.length; i += 1) {
    const ch = ascii[i];
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if ((ch === '.' || ch === '/' || ch === '٫') && !hasDot) {
      hasDot = true;
      result += result.length === 0 ? '0.' : '.';
    }
  }
  return result;
}

/**
 * Merges an item's existing Detailed Equipment `notes` ("توضیحات تجهیز") with an optional
 * MIV-specific user remark. If equipmentNotes already exists, userRemark is placed on a new line below it.
 */
export function buildMivLineRemark(
  equipmentNotes: string | undefined | null,
  userRemark: string | undefined | null,
): string {
  const base = preserveMultilineText(equipmentNotes);
  const extra = preserveMultilineText(userRemark);
  if (!base && !extra) return '';
  if (!base) return extra;
  if (!extra) return base;
  if (base === extra || base.endsWith(`\n${extra}`)) return base;
  if (extra.startsWith(`${base}\n`)) return extra;
  return `${base}\n${extra}`;
}

export type MivStockSourcePreference = 'auto' | 'employer' | 'contractor';

export interface MivStockDeductionResult {
  valid: boolean;
  totalAvailable: number;
  deductedFromMapna: number;
  deductedFromContractor: number;
  errorFa?: string;
  errorEn?: string;
}

/**
 * Computes exact stock deduction across Employer ("کارفرما / مپنا") and Contractor ("پیمانکار")
 * warehouses while strictly enforcing Rule 1-17-1:
 *   `qty <= mapnaInventory + contractorInventory`.
 */
export function computeMivStockDeduction(
  qty: number,
  mapnaInventory: number,
  contractorInventory: number,
  preference: MivStockSourcePreference = 'auto',
): MivStockDeductionResult {
  const safeMapna = Math.max(0, roundQty(Number(mapnaInventory) || 0));
  const safeContractor = Math.max(0, roundQty(Number(contractorInventory) || 0));
  const totalAvailable = roundQty(safeMapna + safeContractor);
  const safeQty = roundQty(Number(qty) || 0);

  if (!Number.isFinite(safeQty) || safeQty <= 0) {
    return {
      valid: false,
      totalAvailable,
      deductedFromMapna: 0,
      deductedFromContractor: 0,
      errorFa: 'تعداد باید عددی بزرگ‌تر از صفر باشد.',
      errorEn: 'Quantity must be a number greater than zero.',
    };
  }

  if (safeQty > totalAvailable) {
    return {
      valid: false,
      totalAvailable,
      deductedFromMapna: 0,
      deductedFromContractor: 0,
      errorFa: `تعداد درخواستی (${safeQty}) از مجموع موجودی انبارهای کارفرما و پیمانکار (${totalAvailable}) بیشتر است.`,
      errorEn: `Requested quantity (${safeQty}) exceeds total Employer + Contractor stock (${totalAvailable}).`,
    };
  }

  // Only one warehouse has stock -> deduct strictly from that warehouse
  if (safeMapna > 0 && safeContractor <= 0) {
    return {
      valid: true,
      totalAvailable,
      deductedFromMapna: safeQty,
      deductedFromContractor: 0,
    };
  }
  if (safeContractor > 0 && safeMapna <= 0) {
    return {
      valid: true,
      totalAvailable,
      deductedFromMapna: 0,
      deductedFromContractor: safeQty,
    };
  }

  // Both warehouses have stock -> honor preference first, spill remainder if needed
  if (preference === 'employer') {
    const fromMapna = Math.min(safeMapna, safeQty);
    const fromContractor = roundQty(safeQty - fromMapna);
    return {
      valid: true,
      totalAvailable,
      deductedFromMapna: fromMapna,
      deductedFromContractor: fromContractor,
    };
  }

  // 'contractor' or 'auto': deduct from Contractor stock first, then Employer stock
  const fromContractor = Math.min(safeContractor, safeQty);
  const fromMapna = roundQty(safeQty - fromContractor);
  return {
    valid: true,
    totalAvailable,
    deductedFromMapna: fromMapna,
    deductedFromContractor: fromContractor,
  };
}

export interface MivHeaderAutoFill {
  projectName: string;
  contractNo: string;
  party: string;
  contractorForDocNo: string;
  islandSystem: string;
  unit: string;
  receiptNo: string;
}

function uniqueNonEmpty(values: Array<string | undefined | null>, sep = ' ، '): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const clean = String(v || '').trim();
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
 * Automatically derives MIV header fields from selected Detailed Equipment items
 * and active Project settings (Rules 1-1, 1-3, 1-5, 1-6, 1-7, 1-8, 1-22).
 */
export function buildMivHeaderAutoFill(
  selectedItems: readonly DetailedComputed[],
  activeProject?: Pick<
    ProjectInfo,
    'name' | 'contractRef' | 'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): MivHeaderAutoFill {
  const projectName = (activeProject?.name || '').trim();
  // Rule 1-3: strictly use contractRef ("کد / شماره قرارداد مرجع"); leave empty if absent
  const contractNo = (activeProject?.contractRef || '').trim();
  // Rule 1-5: پیمانکار/درخواست کننده = "تحویل گیرنده" (receiver) from Detailed Equipment
  const party = uniqueNonEmpty(selectedItems.map((it) => it.receiver));
  const contractorForDocNo =
    selectedItems.map((it) => (it.receiver || '').trim()).find(Boolean) ||
    selectedItems.map((it) => (it.supplier || '').trim()).find(Boolean) ||
    '';

  // Rule 1-6: سیستم/جزیره = "@/@" (system/island)
  const sysIslandPairs = selectedItems
    .map((it) => {
      const sys = (it.system || '').trim();
      const isl = (it.island || '').trim();
      if (sys && isl) return `${sys}/${isl}`;
      return sys || isl;
    })
    .filter(Boolean);
  const islandSystem = uniqueNonEmpty(sysIslandPairs);

  // Rule 1-7: واحد
  const unit = uniqueNonEmpty(selectedItems.map((it) => it.unit));
  // Rule 1-8: شماره رسید = شماره رسید مصرف (gcvReceiptNo)
  const receiptNo = uniqueNonEmpty(selectedItems.map((it) => it.gcvReceiptNo));

  return {
    projectName,
    contractNo,
    party,
    contractorForDocNo,
    islandSystem,
    unit,
    receiptNo,
  };
}

export function buildMivPlantDocConfig(
  project?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): PlantDocNumberConfig | undefined {
  return extractPlantDocConfig(project);
}

export interface MivPaginatedPage {
  pageNumber: number;
  totalPages: number;
  startIndex: number;
  rows: (DocumentLineItem | null)[];
}

/**
 * Estimates visual row height in abstract "line units" so multiline descriptions and remarks
 * never cause A4 Landscape overflow across printed pages.
 */
function estimateMivRowUnits(item: DocumentLineItem): number {
  const desc = preserveMultilineText(item.description || '');
  const remark = preserveMultilineText(item.remark || '');
  const tech = preserveMultilineText(item.technicalInfo || '');

  const estimateLines = (text: string, charsPerLine: number): number => {
    if (!text) return 1;
    return text.split('\n').reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
  };

  const descLines = estimateLines(desc, 34);
  const remarkLines = estimateLines(remark, 26);
  const techLines = estimateLines(tech, 18);
  const maxLines = Math.max(1, descLines, remarkLines, techLines);
  // Base row consumes 1 unit, each additional wrapped/multiline line adds 0.55 units
  return 1 + (maxLines - 1) * 0.55;
}

/**
 * Splits MIV line items into exact A4 Landscape printable pages so every page displays
 * accurate `صفحه X از Y` (Rule 1-4) with header, table, and signature block fitting cleanly.
 */
export function paginateMivRows(
  items: readonly DocumentLineItem[],
  options?: { maxUnitsPerPage?: number; minRowsSinglePage?: number; minRowsPerPage?: number },
): MivPaginatedPage[] {
  const maxUnitsPerPage = options?.maxUnitsPerPage ?? 9.5;
  const minRowsSinglePage = options?.minRowsSinglePage ?? 9;
  const minRowsPerPage = options?.minRowsPerPage ?? 6;

  if (!items || items.length === 0) {
    return [
      {
        pageNumber: 1,
        totalPages: 1,
        startIndex: 0,
        rows: Array.from({ length: minRowsSinglePage }, () => null),
      },
    ];
  }

  const rawPages: { startIndex: number; items: DocumentLineItem[] }[] = [];
  let currentItems: DocumentLineItem[] = [];
  let currentUnits = 0;
  let currentStart = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const units = estimateMivRowUnits(item);
    if (currentItems.length > 0 && currentUnits + units > maxUnitsPerPage) {
      rawPages.push({ startIndex: currentStart, items: currentItems });
      currentItems = [item];
      currentUnits = units;
      currentStart = i;
    } else {
      currentItems.push(item);
      currentUnits += units;
    }
  }
  if (currentItems.length > 0) {
    rawPages.push({ startIndex: currentStart, items: currentItems });
  }

  const totalPages = rawPages.length;
  return rawPages.map((pg, idx) => {
    const targetMin = totalPages === 1 ? minRowsSinglePage : minRowsPerPage;
    const usedUnits = pg.items.reduce((sum, it) => sum + estimateMivRowUnits(it), 0);
    const remainingSlotUnits = Math.max(0, Math.floor(maxUnitsPerPage - usedUnits));
    const desiredPad = Math.max(0, targetMin - pg.items.length);
    const padCount = Math.min(desiredPad, remainingSlotUnits);

    return {
      pageNumber: idx + 1,
      totalPages,
      startIndex: pg.startIndex,
      rows: [...pg.items, ...Array.from({ length: padCount }, () => null)],
    };
  });
}
