import { normalizeDigits } from './jalali.ts';

export const IRANIAN_PLATE_LETTERS = [
  'ع',
  'ب',
  'ت',
  'ج',
  'د',
  'س',
  'ص',
  'ط',
  'ق',
  'ل',
  'م',
  'ن',
  'و',
  'ه',
  'ی',
  'الف',
  'پ',
  'ث',
  'ز',
  'ش',
  'ف',
  'ک',
  'گ',
  'ژ',
] as const;

export const PACKAGE_TYPE_OPTIONS_FA = [
  'صندوق چوبی',
  'جعبه مشبک',
  'پالت',
  'باندل',
  'کارتن',
  'قرقره / درام',
  'اسکید',
  'کانتینر',
  'فله',
] as const;

export const PACKAGE_TYPE_OPTIONS_EN = [
  'Wooden Box',
  'Crate',
  'Pallet',
  'Bundle',
  'Carton',
  'Drum',
  'Skid',
  'Container',
  'Loose',
] as const;

/**
 * Normalizes Persian/Arabic digits to ASCII and strips all non-digit characters.
 */
export function sanitizeDigitsOnly(raw: string): string {
  return normalizeDigits(raw || '').replace(/[^0-9]/g, '');
}

/**
 * Normalizes Persian/Arabic digits to ASCII and allows digits + at most one decimal dot.
 */
export function sanitizeDecimalOnly(raw: string): string {
  const norm = normalizeDigits(raw || '').replace(/[^\d.]/g, '');
  const parts = norm.split('.');
  if (parts.length <= 1) return norm;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

/**
 * Formats integer digits in groups of 3 using '،' (Persian) or ',' (English).
 */
export function formatThousands(raw: string | number | null | undefined, isFa: boolean): string {
  if (raw === null || raw === undefined) return '';
  const digits = sanitizeDigitsOnly(String(raw));
  if (!digits) return '';
  const sep = isFa ? '،' : ',';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * Parses numeric input that may contain Persian digits or ',' / '،' / '٬' separators.
 */
export function parseNumericInput(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = normalizeDigits(String(raw))
    .replace(/[,،٬\s]/g, '')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function isValidDigitsOnly(raw: string): boolean {
  const norm = normalizeDigits((raw || '').trim());
  return norm === '' || /^\d+$/.test(norm);
}

export function isValidDecimalNumber(raw: string): boolean {
  const norm = normalizeDigits((raw || '').trim()).replace(/[,،٬]/g, '');
  return norm === '' || /^\d+(\.\d+)?$/.test(norm);
}

export function hasEnglishLetters(raw: string): boolean {
  return /[A-Za-z]/.test(raw || '');
}

export function hasPersianLetters(raw: string): boolean {
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(raw || '');
}

export interface IranianPlateParts {
  left2: string; // e.g. 60
  mid3: string; // e.g. 985
  letter: string; // e.g. ع
  right2: string; // e.g. 14
}

/**
 * Parses a plate string such as "60 ایران 985 ع 14" (or partial input like "60 ایران ع").
 */
export function parseIranianPlate(raw: string | undefined): IranianPlateParts {
  const s = normalizeDigits((raw || '').trim());
  if (!s) {
    return { left2: '', mid3: '', letter: 'ع', right2: '' };
  }
  const match = s.match(/^(\d{1,2})\s*(?:ایران|IRAN|IR)?\s*(\d{1,3})\s*([\u0600-\u06FF]+|[A-Za-z]+)\s*(\d{1,2})$/i);
  if (match) {
    return {
      left2: match[1],
      mid3: match[2],
      letter: match[3],
      right2: match[4],
    };
  }
  const alt = s.match(/^(\d{1,2})\s*([\u0600-\u06FF]+|[A-Za-z]+)\s*(\d{1,3})\s*(?:ایران|IRAN|IR)\s*(\d{1,2})$/i);
  if (alt) {
    return {
      left2: alt[4],
      mid3: alt[3],
      letter: alt[2],
      right2: alt[1],
    };
  }
  // Permissive partial parse: e.g. "60|985|ع|14" or "60 ایران 985 ع" or "60 ایران ع"
  const tokens = s.replace(/\s+/g, ' ').split(' ');
  const iranIdx = tokens.findIndex((t) => /^(ایران|iran|ir)$/i.test(t));
  if (iranIdx !== -1) {
    const before = tokens.slice(0, iranIdx).join('');
    const after = tokens.slice(iranIdx + 1);
    const digitsBefore = sanitizeDigitsOnly(before).slice(0, 2);
    let mid3 = '';
    let letter = 'ع';
    let right2 = '';
    for (const tok of after) {
      if (!mid3 && /^\d{1,3}$/.test(tok) && after.indexOf(tok) === 0) {
        mid3 = tok.slice(0, 3);
      } else if (/^[\u0600-\u06FF]+|[A-Za-z]+$/.test(tok) && !/^\d+$/.test(tok)) {
        letter = tok;
      } else if (/^\d+$/.test(tok)) {
        right2 = tok.slice(0, 2);
      }
    }
    return { left2: digitsBefore, mid3, letter, right2 };
  }
  return { left2: '', mid3: '', letter: 'ع', right2: '' };
}

export function formatIranianPlate(parts: IranianPlateParts): string {
  const l2 = sanitizeDigitsOnly(parts.left2).slice(0, 2);
  const m3 = sanitizeDigitsOnly(parts.mid3).slice(0, 3);
  const r2 = sanitizeDigitsOnly(parts.right2).slice(0, 2);
  const ltr = (parts.letter || '').trim() || 'ع';
  if (!l2 && !m3 && !r2) return '';
  return `${l2} ایران ${m3} ${ltr} ${r2}`.replace(/\s+/g, ' ').trim();
}
