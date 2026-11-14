import type { CalendarMode, Language } from './types.ts';

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

const JALALI_BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = JALALI_BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = JALALI_BREAKS[0];
  let jm = 0;
  let jump = 0;
  let n = 0;

  if (jy < jp || jy >= JALALI_BREAKS[bl - 1]) {
    return { leap: 0, gy, march: 20 };
  }

  for (let i = 1; i < bl; i += 1) {
    jm = JALALI_BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm = 0;
  let jd = 0;

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function gregorianMonthLength(gy: number, gm: number): number {
  return new Date(gy, gm, 0).getDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

/**
 * Parses Jalali (e.g. "03.10.15", "1403/10/15", "1403-10-15") or Gregorian ("2025-01-04", "2025/01/04")
 * into canonical ISO YYYY-MM-DD (Gregorian). Returns original trimmed string if non-date text (like "-").
 */
export function parseFlexibleDateToIso(rawInput: string, assumedCalendar: CalendarMode = 'jalali'): string {
  const cleaned = normalizeDigits((rawInput || '').trim());
  if (!cleaned || cleaned === '-' || cleaned === '—') return '';

  // Already ISO YYYY-MM-DD (Gregorian > 1900)
  const parts = cleaned.split(/[./-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return rawInput.trim();

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return rawInput.trim();

  let [y, m, d] = nums;
  if (m > 12 || d > 31) return rawInput.trim();

  // Heuristic: 2-digit year like "03" -> 1403 (Jalali) or 2024 (if gregorian)
  if (y < 100) {
    if (assumedCalendar === 'jalali' || y <= 50) {
      y = 1400 + y;
      const g = toGregorian(y, m, d);
      return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
    }
    y = 2000 + y;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // Jalali 4-digit year (1300-1599)
  if (y >= 1300 && y <= 1599) {
    const g = toGregorian(y, m, d);
    return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  }

  // Gregorian 4-digit year (1900-2200)
  if (y >= 1900 && y <= 2200) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return rawInput.trim();
}

export function isIsoDateString(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

export function formatIsoDate(isoOrRaw: string, calendar: CalendarMode, shortJalali = false): string {
  const trimmed = (isoOrRaw || '').trim();
  if (!trimmed || trimmed === '-') return '';

  let iso = trimmed;
  if (!isIsoDateString(iso)) {
    iso = parseFlexibleDateToIso(trimmed, 'jalali');
    if (!isIsoDateString(iso)) return trimmed;
  }

  const [gy, gm, gd] = iso.split('-').map(Number);
  if (calendar === 'gregorian') {
    return `${gy}/${pad2(gm)}/${pad2(gd)}`;
  }

  const j = toJalali(gy, gm, gd);
  const yearStr = shortJalali ? pad2(j.jy % 100) : String(j.jy);
  return `${yearStr}/${pad2(j.jm)}/${pad2(j.jd)}`;
}

export function formatTimestampByCalendar(
  isoTimestamp: string,
  calendar: CalendarMode,
  lang: Language,
): string {
  if (!isoTimestamp) return '';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return isoTimestamp;

  const gy = dt.getFullYear();
  const gm = dt.getMonth() + 1;
  const gd = dt.getDate();
  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());
  const ss = pad2(dt.getSeconds());

  if (calendar === 'gregorian') {
    const datePart = `${gy}/${pad2(gm)}/${pad2(gd)}`;
    return lang === 'fa' ? `${datePart} · ${hh}:${mm}:${ss}` : `${datePart} ${hh}:${mm}:${ss}`;
  }

  const j = toJalali(gy, gm, gd);
  const datePart = `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`;
  return `${datePart} · ${hh}:${mm}:${ss}`;
}

export function getMonthKeyFromIso(isoOrRaw: string, calendar: CalendarMode): string {
  const trimmed = (isoOrRaw || '').trim();
  if (!trimmed) return '';
  const iso = isIsoDateString(trimmed) ? trimmed : parseFlexibleDateToIso(trimmed, 'jalali');
  if (!isIsoDateString(iso)) return '';
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (calendar === 'gregorian') {
    return `${gy}-${pad2(gm)}`;
  }
  const j = toJalali(gy, gm, gd);
  return `${j.jy}/${pad2(j.jm)}`;
}

export const JALALI_MONTH_NAMES_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const JALALI_MONTH_NAMES_EN = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand',
];

export const GREGORIAN_MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const GREGORIAN_MONTH_NAMES_FA = [
  'ژانویه',
  'فوریه',
  'مارس',
  'آوریل',
  'مه',
  'ژوئن',
  'ژوئیه',
  'اوت',
  'سپتامبر',
  'اکتبر',
  'نوامبر',
  'دسامبر',
];

export function formatMonthLabel(monthKey: string, calendar: CalendarMode, lang: Language): string {
  if (!monthKey) return '';
  const [yStr, mStr] = monthKey.split(/[/-]/);
  const mIdx = Number(mStr) - 1;
  if (mIdx < 0 || mIdx > 11) return monthKey;
  if (calendar === 'jalali') {
    const mName = lang === 'fa' ? JALALI_MONTH_NAMES_FA[mIdx] : JALALI_MONTH_NAMES_EN[mIdx];
    return `${mName} ${yStr}`;
  }
  const mName = lang === 'fa' ? GREGORIAN_MONTH_NAMES_FA[mIdx] : GREGORIAN_MONTH_NAMES_EN[mIdx];
  return `${mName} ${yStr}`;
}

export function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
