import { toGregorian, normalizeDigits, parseFlexibleDateToIso } from './jalali.ts';
import type { CalendarMode } from './types.ts';

export interface ExtractedChemicalDates {
  productionDate: string;
  expirationDate: string;
}

const EN_MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const FA_MONTHS: Record<string, number> = {
  فروردین: 1,
  اردیبهشت: 2,
  خرداد: 3,
  تیر: 4,
  مرداد: 5,
  امرداد: 5,
  شهریور: 6,
  مهر: 7,
  آبان: 8,
  ابان: 8,
  آذر: 9,
  اذر: 9,
  دی: 10,
  بهمن: 11,
  اسفند: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildGregorianIso(year: number, month: number, day: number): string {
  if (year < 1970 || year > 2100 || month < 1 || month > 12) return '';
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const safeDay = Math.min(Math.max(1, day), maxDay);
  return `${year}-${pad2(month)}-${pad2(safeDay)}`;
}

function buildJalaliIso(jy: number, jm: number, jd: number): string {
  if (jy < 1350 || jy > 1490 || jm < 1 || jm > 12) return '';
  const safeDay = Math.min(Math.max(1, jd), jm <= 6 ? 31 : jm <= 11 ? 30 : 29);
  const { gy, gm, gd } = toGregorian(jy, jm, safeDay);
  return buildGregorianIso(gy, gm, gd);
}

function addMonthsToIso(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCMonth(d.getUTCMonth() + months);
  return buildGregorianIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function normalizeCandidateText(raw: string): string {
  return normalizeDigits(raw || '')
    .replace(/\u200c/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses a single date expression extracted after a Production/Expiration keyword.
 * Supports:
 *  - Full YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD (Jalali 1350..1490 or Gregorian 1970..2100)
 *  - Full DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
 *  - Month/Year: MM/YYYY, YYYY/MM, MM-YYYY, YYYY-MM (Jalali or Gregorian)
 *  - Named English months: "Jun 2026", "15 June 2026", "2026 Jun 15", "2026-Jun"
 *  - Named Persian months: "15 مهر 1404", "مهر 1404", "اردیبهشت ۱۴۰۵"
 */
export function parseSingleDateSnippet(
  snippet: string,
  assumedCalendar: CalendarMode = 'jalali',
  preferEndOfMonth = false,
): string {
  const clean = normalizeCandidateText(snippet);
  if (!clean) return '';

  // 1) English named month patterns: "15 Jun 2026", "Jun 15, 2026", "Jun 2026", "2026 Jun 15"
  const enMonthNames = Object.keys(EN_MONTHS).join('|');
  const enDmy = new RegExp(`\\b(\\d{1,2})[\\s./-]*(${enMonthNames})[\\s.,/-]*(\\d{4})\\b`, 'i').exec(clean);
  if (enDmy) {
    return buildGregorianIso(Number(enDmy[3]), EN_MONTHS[enDmy[2].toLowerCase()], Number(enDmy[1]));
  }
  const enMdy = new RegExp(`\\b(${enMonthNames})[\\s./-]+(\\d{1,2})[,\\s./-]+(\\d{4})\\b`, 'i').exec(clean);
  if (enMdy) {
    return buildGregorianIso(Number(enMdy[3]), EN_MONTHS[enMdy[1].toLowerCase()], Number(enMdy[2]));
  }
  const enYmd = new RegExp(`\\b(\\d{4})[\\s./-]+(${enMonthNames})(?:[\\s./-]+(\\d{1,2}))?\\b`, 'i').exec(clean);
  if (enYmd) {
    const y = Number(enYmd[1]);
    const mo = EN_MONTHS[enYmd[2].toLowerCase()];
    const day = enYmd[3] ? Number(enYmd[3]) : preferEndOfMonth ? 31 : 1;
    return buildGregorianIso(y, mo, day);
  }
  const enMy = new RegExp(`\\b(${enMonthNames})[\\s.,/-]+(\\d{4})\\b`, 'i').exec(clean);
  if (enMy) {
    const mo = EN_MONTHS[enMy[1].toLowerCase()];
    const y = Number(enMy[2]);
    return buildGregorianIso(y, mo, preferEndOfMonth ? 31 : 1);
  }

  // 2) Persian named month patterns: "15 مهر 1404" or "مهر 1404" or "1404 مهر 15"
  const faMonthNames = Object.keys(FA_MONTHS).join('|');
  const faDmy = new RegExp(`(?:(\\d{1,2})\\s+)?(${faMonthNames})\\s*(?:ماه\\s*)?(\\d{4})`).exec(clean);
  if (faDmy) {
    const jm = FA_MONTHS[faDmy[2]];
    const jy = Number(faDmy[3]);
    const jd = faDmy[1] ? Number(faDmy[1]) : preferEndOfMonth ? (jm <= 6 ? 31 : jm <= 11 ? 30 : 29) : 1;
    return buildJalaliIso(jy, jm, jd);
  }

  // 3) Full numeric 3-part date: YYYY/MM/DD or DD/MM/YYYY
  const ymd = /\b(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\b/.exec(clean);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y >= 1350 && y <= 1490) return buildJalaliIso(y, m, d);
    if (y >= 1970 && y <= 2100) return buildGregorianIso(y, m, d);
  }

  const dmy = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\b/.exec(clean);
  if (dmy) {
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const y = Number(dmy[3]);
    const isJalali = y >= 1350 && y <= 1490;
    const isGreg = y >= 1970 && y <= 2100;
    if (isJalali || isGreg) {
      let month = p2;
      let day = p1;
      if (p2 > 12 && p1 <= 12) {
        month = p1;
        day = p2;
      }
      return isJalali ? buildJalaliIso(y, month, day) : buildGregorianIso(y, month, day);
    }
  }

  // 4) 2-digit year 3-part date: YY/MM/DD (Jalali e.g. 04/05/12 -> 1404/05/12) or DD/MM/YY (Gregorian)
  const twoYearYmd = /\b(\d{2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\b/.exec(clean);
  if (twoYearYmd) {
    const a = Number(twoYearYmd[1]);
    const b = Number(twoYearYmd[2]);
    const c = Number(twoYearYmd[3]);
    if (assumedCalendar === 'jalali' && (a >= 90 || a <= 15) && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      const jy = a >= 90 ? 1300 + a : 1400 + a;
      return buildJalaliIso(jy, b, c);
    }
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      const gy = 2000 + c;
      if (gy >= 2000 && gy <= 2060) return buildGregorianIso(gy, b, a);
    }
  }

  // 5) Month & 4-digit Year: YYYY/MM or MM/YYYY
  const ym = /\b(\d{4})\s*[/.-]\s*(\d{1,2})\b/.exec(clean);
  if (ym) {
    const y = Number(ym[1]);
    const mo = Number(ym[2]);
    if (mo >= 1 && mo <= 12) {
      if (y >= 1350 && y <= 1490) {
        return buildJalaliIso(y, mo, preferEndOfMonth ? (mo <= 6 ? 31 : mo <= 11 ? 30 : 29) : 1);
      }
      if (y >= 1970 && y <= 2100) {
        return buildGregorianIso(y, mo, preferEndOfMonth ? 31 : 1);
      }
    }
  }

  const my = /\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/.exec(clean);
  if (my) {
    const mo = Number(my[1]);
    const y = Number(my[2]);
    if (mo >= 1 && mo <= 12) {
      if (y >= 1350 && y <= 1490) {
        return buildJalaliIso(y, mo, preferEndOfMonth ? (mo <= 6 ? 31 : mo <= 11 ? 30 : 29) : 1);
      }
      if (y >= 1970 && y <= 2100) {
        return buildGregorianIso(y, mo, preferEndOfMonth ? 31 : 1);
      }
    }
  }

  // 6) Fallback to flexible parser on the first token-like date chunk
  const fallback = parseFlexibleDateToIso(clean, assumedCalendar);
  return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : '';
}

const PROD_LABEL_RE =
  /(?:تاریخ\s*تولید|تاریخ\s*ساخت|تولید(?:\s*شده)?|تاريخ\s*توليد|mfg\.?\s*date|mfd\.?\s*date|prod(?:uction)?\.?\s*date|manufactur(?:e|ing|ed)\s*date|date\s*of\s*manufactur(?:e|ing)|\bmfg\b|\bmfd\b|\bprod\b|\bdom\b|\bp\.?d\.?\b)\s*[:：=\-]?\s*([^\n;|،,()[\]]{4,32})/gi;

const EXP_LABEL_RE =
  /(?:تاریخ\s*انقض[اءا]?|تاريخ\s*انقض[اءا]?|انقض[اءا]|مهلت\s*مصرف|معتبر\s*تا|اعتبار\s*تا|exp(?:iration|iry)?\.?\s*date|best\s*before|valid\s*(?:until|thru|through|to)|use\s*by|date\s*of\s*expir(?:y|ation)|\bexp(?:iry)?\b|\bdoe\b|\be\.?d\.?\b)\s*[:：=\-]?\s*([^\n;|،,()[\]]{4,32})/gi;

const SHELF_LIFE_RE =
  /(?:shelf\s*life|عمر\s*انبار(?:داری)?|مدت\s*(?:مصرف|اعتبار|انقض[اءا]?))\s*[:：=\-]?\s*(\d{1,3})\s*(years?|yrs?|y|months?|mos?|m|سال|ماه)/i;

/**
 * Automatically extracts chemical Production Date (تاریخ تولید) and Expiration Date (تاریخ انقضاء)
 * from free-text fields (notes, description, generalDescription, stocktakeInfo, raw import cells)
 * in both Persian (Jalali & Persian month names) and English (Gregorian & English month names).
 */
export function extractChemicalDatesFromTexts(
  texts: Array<string | null | undefined>,
  assumedCalendar: CalendarMode = 'jalali',
): ExtractedChemicalDates {
  let productionDate = '';
  let expirationDate = '';
  let shelfLifeMonths: number | null = null;

  for (const raw of texts) {
    const clean = normalizeCandidateText(raw || '');
    if (!clean) continue;

    if (!productionDate) {
      PROD_LABEL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PROD_LABEL_RE.exec(clean)) !== null) {
        if (/انبار\s*گردانی|stocktake|گزارش/i.test(m[1])) continue;
        const parsed = parseSingleDateSnippet(m[1], assumedCalendar, false);
        if (parsed) {
          productionDate = parsed;
          break;
        }
      }
    }

    if (!expirationDate) {
      EXP_LABEL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = EXP_LABEL_RE.exec(clean)) !== null) {
        if (/انبار\s*گردانی|stocktake|گزارش/i.test(m[1])) continue;
        const parsed = parseSingleDateSnippet(m[1], assumedCalendar, true);
        if (parsed) {
          expirationDate = parsed;
          break;
        }
      }
    }

    if (shelfLifeMonths === null) {
      const sl = SHELF_LIFE_RE.exec(clean);
      if (sl) {
        const num = Number(sl[1]);
        const unit = sl[2].toLowerCase();
        if (Number.isFinite(num) && num > 0) {
          if (unit.startsWith('y') || unit === 'سال') shelfLifeMonths = num * 12;
          else shelfLifeMonths = num;
        }
      }
    }

    if (productionDate && expirationDate) break;
  }

  // If productionDate + shelfLife are found without an explicit expirationDate, compute expirationDate
  if (productionDate && !expirationDate && shelfLifeMonths !== null) {
    expirationDate = addMonthsToIso(productionDate, shelfLifeMonths);
  }

  return { productionDate, expirationDate };
}
