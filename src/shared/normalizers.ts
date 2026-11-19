import type { Language } from './types.ts';

export const DEFAULT_TRANSIT_STATUSES = [
  'در دست ارسال',
  'در دست بازرسی',
  'رسیده',
] as const;

export type DefaultTransitStatus = (typeof DEFAULT_TRANSIT_STATUSES)[number];

export const PERSIAN_COUNTING_UNIT_SUGGESTIONS: string[] = [
  'عدد',
  'ست',
  'متر',
  'مترمربع',
  'مترمکعب',
  'کیلوگرم',
  'گرم',
  'تن',
  'لیتر',
  'جفت',
  'بسته',
  'جعبه',
  'کارتن',
  'رول',
  'ورق',
  'کیت',
  'شاخه',
  'بشکه',
  'قوطی',
  'بطری',
  'کیسه',
  'باندل',
  'پالت',
  'قرقره',
  'پارت',
  'سیلندر',
  'گالن',
  'سطل',
  'تیوب',
  'مجموعه',
];

function normalizePersianChars(raw: string): string {
  return raw
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COUNTING_UNIT_EN_TO_FA: Record<string, string> = {
  // Pieces / Each / Numbers
  pc: 'عدد',
  pcs: 'عدد',
  pce: 'عدد',
  pces: 'عدد',
  piece: 'عدد',
  pieces: 'عدد',
  ea: 'عدد',
  each: 'عدد',
  no: 'عدد',
  nos: 'عدد',
  num: 'عدد',
  number: 'عدد',
  unit: 'عدد',
  units: 'عدد',
  item: 'عدد',
  items: 'عدد',
  qty: 'عدد',
  // Sets / Kits / Assemblies
  set: 'ست',
  sets: 'ست',
  kit: 'کیت',
  kits: 'کیت',
  assy: 'مجموعه',
  assembly: 'مجموعه',
  // Length
  m: 'متر',
  mt: 'متر',
  mtr: 'متر',
  mtrs: 'متر',
  meter: 'متر',
  meters: 'متر',
  metre: 'متر',
  metres: 'متر',
  cm: 'سانتی‌متر',
  mm: 'میلی‌متر',
  ft: 'فوت',
  feet: 'فوت',
  foot: 'فوت',
  in: 'اینچ',
  inch: 'اینچ',
  inches: 'اینچ',
  km: 'کیلومتر',
  length: 'شاخه',
  lengths: 'شاخه',
  len: 'شاخه',
  bar: 'شاخه',
  bars: 'شاخه',
  rod: 'شاخه',
  rods: 'شاخه',
  pipe: 'شاخه',
  pipes: 'شاخه',
  // Area & Volume
  m2: 'مترمربع',
  sqm: 'مترمربع',
  'sq.m': 'مترمربع',
  sqmt: 'مترمربع',
  m3: 'مترمکعب',
  cbm: 'مترمکعب',
  'cu.m': 'مترمکعب',
  // Weight / Mass
  kg: 'کیلوگرم',
  kgs: 'کیلوگرم',
  kilo: 'کیلوگرم',
  kilos: 'کیلوگرم',
  kilogram: 'کیلوگرم',
  kilograms: 'کیلوگرم',
  g: 'گرم',
  gr: 'گرم',
  gm: 'گرم',
  gram: 'گرم',
  grams: 'گرم',
  mg: 'میلی‌گرم',
  ton: 'تن',
  tons: 'تن',
  tonne: 'تن',
  tonnes: 'تن',
  lb: 'پوند',
  lbs: 'پوند',
  // Liquids / Containers
  l: 'لیتر',
  lt: 'لیتر',
  ltr: 'لیتر',
  ltrs: 'لیتر',
  liter: 'لیتر',
  liters: 'لیتر',
  litre: 'لیتر',
  litres: 'لیتر',
  ml: 'میلی‌لیتر',
  gal: 'گالن',
  gallon: 'گالن',
  gallons: 'گالن',
  drum: 'بشکه',
  drums: 'بشکه',
  dm: 'بشکه',
  barrel: 'بشکه',
  barrels: 'بشکه',
  can: 'قوطی',
  cans: 'قوطی',
  tin: 'قوطی',
  tins: 'قوطی',
  bottle: 'بطری',
  bottles: 'بطری',
  btl: 'بطری',
  btls: 'بطری',
  jar: 'شیشه',
  jars: 'شیشه',
  tube: 'تیوب',
  tubes: 'تیوب',
  bucket: 'سطل',
  buckets: 'سطل',
  pail: 'سطل',
  pails: 'سطل',
  cyl: 'سیلندر',
  cylinder: 'سیلندر',
  cylinders: 'سیلندر',
  // Pairs / Packaging / Bulk
  pair: 'جفت',
  pairs: 'جفت',
  pr: 'جفت',
  prs: 'جفت',
  box: 'جعبه',
  boxes: 'جعبه',
  bx: 'جعبه',
  case: 'جعبه',
  cases: 'جعبه',
  pack: 'بسته',
  packs: 'بسته',
  pk: 'بسته',
  pkg: 'بسته',
  pkgs: 'بسته',
  packet: 'بسته',
  packets: 'بسته',
  package: 'بسته',
  packages: 'بسته',
  ctn: 'کارتن',
  ctns: 'کارتن',
  carton: 'کارتن',
  cartons: 'کارتن',
  bag: 'کیسه',
  bags: 'کیسه',
  bg: 'کیسه',
  sack: 'کیسه',
  sacks: 'کیسه',
  roll: 'رول',
  rolls: 'رول',
  rl: 'رول',
  coil: 'رول',
  coils: 'رول',
  reel: 'قرقره',
  reels: 'قرقره',
  spool: 'قرقره',
  spools: 'قرقره',
  sheet: 'ورق',
  sheets: 'ورق',
  sh: 'ورق',
  sht: 'ورق',
  shts: 'ورق',
  plate: 'ورق',
  plates: 'ورق',
  bundle: 'باندل',
  bundles: 'باندل',
  bdl: 'باندل',
  pallet: 'پالت',
  pallets: 'پالت',
  plt: 'پالت',
  lot: 'پارت',
  lots: 'پارت',
  // Persian spacing/spelling variants
  'کیلو گرم': 'کیلوگرم',
  'متر مربع': 'مترمربع',
  'متر مکعب': 'مترمکعب',
  'سانتی متر': 'سانتی‌متر',
  'میلی متر': 'میلی‌متر',
  'میلی لیتر': 'میلی‌لیتر',
  'میلی گرم': 'میلی‌گرم',
  دستگاه: 'دستگاه',
  حلقه: 'حلقه',
  عددی: 'عدد',
};

/**
 * Converts English/abbreviated counting units (PC, PCs, EA, M, MTR, SET, KG, L, ...)
 * to their standard Persian warehouse unit names. Preserves already-Persian or unknown units.
 */
export function normalizeCountingUnitToFa(raw: string | undefined | null): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';

  const exactKey = cleaned.toLowerCase().replace(/\.+$/, '').trim();
  if (COUNTING_UNIT_EN_TO_FA[exactKey]) {
    return COUNTING_UNIT_EN_TO_FA[exactKey];
  }

  // Try stripping periods and spaces (e.g. "P.C.S", "SQ. M", "M^2", "M²")
  const compact = exactKey
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\^/g, '')
    .replace(/[.\s_-]+/g, '');
  if (COUNTING_UNIT_EN_TO_FA[compact]) {
    return COUNTING_UNIT_EN_TO_FA[compact];
  }

  // Try removing trailing "(s)" e.g. "PC(s)" or "Set(s)"
  const withoutParenS = exactKey.replace(/\(s\)$/i, '').replace(/[.\s_-]+/g, '');
  if (COUNTING_UNIT_EN_TO_FA[withoutParenS]) {
    return COUNTING_UNIT_EN_TO_FA[withoutParenS];
  }

  return cleaned;
}

/**
 * Formats a counting unit for display according to the active UI language.
 * In Persian ('fa'), automatically renders English abbreviations in Persian.
 */
export function formatCountingUnit(raw: string | undefined | null, lang: Language): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';
  if (lang === 'fa') {
    return normalizeCountingUnitToFa(cleaned);
  }
  return cleaned;
}

/**
 * Normalizes any In-Transit overall status text to one of the 3 canonical statuses:
 * - 'در دست ارسال'
 * - 'در دست بازرسی'
 * - 'رسیده'
 *
 * If `allowedCustomStatuses` includes an exact normalized match for a user-added
 * custom category from Category Management, that custom category is preserved.
 */
export function normalizeTransitStatus(
  raw: string | undefined | null,
  allowedCustomStatuses?: string[],
): string {
  const cleaned = normalizePersianChars(String(raw ?? ''));
  if (!cleaned || cleaned === '-' || cleaned === '—') {
    return 'در دست ارسال';
  }

  // 1. Exact match against the 3 canonical statuses
  if (cleaned === 'رسیده') return 'رسیده';
  if (cleaned === 'در دست بازرسی') return 'در دست بازرسی';
  if (cleaned === 'در دست ارسال') return 'در دست ارسال';

  // 2. Preserve explicitly configured custom categories (excluding legacy 'پایان' which maps to 'رسیده')
  if (Array.isArray(allowedCustomStatuses) && allowedCustomStatuses.length > 0) {
    const lowerCleaned = cleaned.toLowerCase();
    for (const custom of allowedCustomStatuses) {
      const cNorm = normalizePersianChars(custom);
      if (!cNorm || cNorm === 'پایان') continue;
      if (cNorm.toLowerCase() === lowerCleaned) {
        return cNorm;
      }
    }
  }

  const lower = cleaned.toLowerCase();

  // 3. Map arrived / completed / finished synonyms -> 'رسیده'
  if (
    cleaned.includes('رسید') ||
    cleaned.includes('پایان') ||
    cleaned.includes('تکمیل') ||
    cleaned.includes('تحویل') ||
    cleaned.includes('ورود') ||
    cleaned.includes('وارد') ||
    cleaned.includes('انبار') ||
    cleaned.includes('تخلیه') ||
    cleaned.includes('بسته') ||
    lower.includes('arrived') ||
    lower.includes('deliver') ||
    lower.includes('done') ||
    lower.includes('finish') ||
    lower.includes('complet') ||
    lower.includes('receiv') ||
    lower.includes('closed')
  ) {
    return 'رسیده';
  }

  // 4. Map inspection synonyms -> 'در دست بازرسی'
  if (
    cleaned.includes('بازرس') ||
    cleaned.includes('ممیزی') ||
    cleaned.includes('کنترل') ||
    cleaned.includes('تست') ||
    cleaned.includes('آزمون') ||
    cleaned.includes('رلیز') ||
    lower.includes('inspect') ||
    lower.includes('qc') ||
    lower.includes('test') ||
    lower.includes('audit')
  ) {
    return 'در دست بازرسی';
  }

  // 5. Map dispatch / shipping / in-transit / fallback -> 'در دست ارسال'
  return 'در دست ارسال';
}

export function isTransitArrivedStatus(raw: string | undefined | null): boolean {
  return normalizeTransitStatus(raw) === 'رسیده';
}

export function getTransitStatusOptions(configured?: string[]): string[] {
  const result: string[] = [...DEFAULT_TRANSIT_STATUSES];
  if (Array.isArray(configured)) {
    for (const raw of configured) {
      const clean = normalizePersianChars(raw);
      if (!clean || clean === 'پایان' || result.includes(clean)) continue;
      result.push(clean);
    }
  }
  return result;
}
