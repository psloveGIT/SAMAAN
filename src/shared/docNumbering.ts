import type { Language, PlantAbbreviationPosition, ProjectInfo } from './types.ts';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

const DIGIT_TO_ASCII: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function toAsciiDigitsOnly(raw: string): string {
  return String(raw || '').replace(/[۰-۹٠-٩]/g, (ch) => DIGIT_TO_ASCII[ch] ?? ch);
}

/**
 * Formats digits in a display string according to UI language:
 * - 'fa': Persian digits (۰-۹)
 * - 'en': English/ASCII digits (0-9)
 */
export function formatDigitsByLang(text: string | number | null | undefined, lang: Language): string {
  if (text === null || text === undefined) return '';
  const ascii = toAsciiDigitsOnly(String(text));
  if (lang === 'fa') {
    return ascii.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
  }
  return ascii;
}

/**
 * Sanitizes live user input for the power plant abbreviation ("مخفف نیروگاه"):
 * keeps only uppercase English letters A-Z, max 3 characters.
 */
export function sanitizePlantAbbreviation(raw: string | undefined | null): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
}

export interface PlantAbbreviationValidation {
  valid: boolean;
  normalized: string;
  errorFa?: string;
  errorEn?: string;
}

/**
 * Validates the power plant abbreviation:
 * optional when empty; when non-empty must be strictly 2 or 3 uppercase English letters.
 */
export function validatePlantAbbreviation(raw: string | undefined | null): PlantAbbreviationValidation {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }
  const upper = trimmed.toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(upper)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'مخفف نیروگاه باید دقیقاً ۲ یا ۳ حرف انگلیسی باشد (مثال: NK یا BND).',
      errorEn: 'Power plant abbreviation must be 2 or 3 English letters (e.g., NK or BND).',
    };
  }
  return { valid: true, normalized: upper };
}

export interface PlantDocNumberConfig {
  plantAbbreviation?: string | null;
  usePlantAbbreviationInDocs?: boolean | null;
  plantAbbreviationPosition?: PlantAbbreviationPosition | null;
}

export function extractPlantDocConfig(
  project?: Pick<
    ProjectInfo,
    'plantAbbreviation' | 'usePlantAbbreviationInDocs' | 'plantAbbreviationPosition'
  > | null,
): PlantDocNumberConfig | undefined {
  if (!project) return undefined;
  return {
    plantAbbreviation: project.plantAbbreviation,
    usePlantAbbreviationInDocs: project.usePlantAbbreviationInDocs,
    plantAbbreviationPosition: project.plantAbbreviationPosition,
  };
}

/**
 * Formats a document number using optional power plant abbreviation settings:
 * - Off / empty abbreviation: `${docPrefix}-${seqStr}` (e.g. `TU-0001`, `MIV-0001`)
 * - Position 'prefix' (ابتدای شماره فرم): `${abbr}-${docPrefix}-${seqStr}` (e.g. `NK-TU-0001`)
 * - Position 'before_number' (قبل از شماره): `${docPrefix}-${abbr}-${seqStr}` (e.g. `TU-NK-0001`)
 */
export function formatDocumentNumberWithPlantCode(
  docPrefix: string,
  seqStr: string,
  config?: PlantDocNumberConfig | null,
): string {
  const cleanPrefix = String(docPrefix || '').trim();
  const cleanSeq = String(seqStr || '').trim();
  const abbrCheck = validatePlantAbbreviation(config?.plantAbbreviation);
  const useAbbr = Boolean(config?.usePlantAbbreviationInDocs) && abbrCheck.valid && Boolean(abbrCheck.normalized);

  if (!useAbbr) {
    return cleanPrefix ? `${cleanPrefix}-${cleanSeq}` : cleanSeq;
  }

  const abbr = abbrCheck.normalized;
  const pos: PlantAbbreviationPosition =
    config?.plantAbbreviationPosition === 'before_number' ? 'before_number' : 'prefix';

  if (!cleanPrefix) {
    return `${abbr}-${cleanSeq}`;
  }
  if (pos === 'before_number') {
    return `${cleanPrefix}-${abbr}-${cleanSeq}`;
  }
  return `${abbr}-${cleanPrefix}-${cleanSeq}`;
}

/**
 * Builds a regex that matches sequential numbers for a given docPrefix regardless of
 * whether an optional 2-3 letter plant abbreviation appears before or after docPrefix.
 */
export function buildSequentialDocNoMatcher(docPrefix: string): RegExp {
  const escaped = docPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:[A-Z]{2,3}-)?${escaped}-(?:[A-Z]{2,3}-)?(\\d+)$`, 'i');
}

/**
 * Generates the next sequential document number for any operational form prefix
 * (e.g., MIV, SMR, GCV, OPI, SE, MER, etc.), respecting plant abbreviation configuration.
 */
export function generateNextPlantAwareDocNo(
  docPrefix: string,
  existingDocNos: readonly string[],
  config?: PlantDocNumberConfig | null,
  padWidth = 4,
): string {
  const matcher = buildSequentialDocNoMatcher(docPrefix);
  const used = new Set<string>();
  let maxSeq = 0;

  for (const rawNo of existingDocNos) {
    const normalized = toAsciiDigitsOnly(String(rawNo || '')).trim().toUpperCase();
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
    docPrefix,
    String(next).padStart(padWidth, '0'),
    config,
  );
  while (used.has(candidate.toUpperCase())) {
    next += 1;
    candidate = formatDocumentNumberWithPlantCode(
      docPrefix,
      String(next).padStart(padWidth, '0'),
      config,
    );
  }
  return candidate;
}

/**
 * Preserves intentional multi-line line breaks (\n) from Excel/CSV/forms
 * while normalizing CRLF/CR and collapsing redundant horizontal spaces/tabs per line.
 */
export function preserveMultilineText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028|\u2029/g, '\n');

  const lines = str
    .split('\n')
    .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim());

  // Trim leading/trailing empty lines while keeping internal line breaks
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

/**
 * Enforces the strict two-state Substitution Status ("باز" / "بسته") across UI and file import.
 */
export function normalizeRepStatus(raw: unknown, hasRepNo = false): '' | 'باز' | 'بسته' {
  const clean = String(raw ?? '').trim().toLowerCase();
  if (!clean) {
    return hasRepNo ? 'باز' : '';
  }
  if (
    clean === 'بسته' ||
    clean === 'closed' ||
    clean === 'close' ||
    clean === 'done' ||
    clean === 'completed' ||
    clean === 'تکمیل شده' ||
    clean === 'بسته شده' ||
    clean === 'تامین شده' ||
    clean === 'تأمین شده'
  ) {
    return 'بسته';
  }
  if (
    clean === 'باز' ||
    clean === 'open' ||
    clean === 'pending' ||
    clean === 'active' ||
    clean === 'اجرا شده' ||
    clean === 'در دست بررسی' ||
    clean === 'تایید شده' ||
    clean === 'تأیید شده' ||
    clean === 'در انتظار تایید' ||
    clean === 'در انتظار تأیید'
  ) {
    return 'باز';
  }
  return hasRepNo ? 'باز' : 'باز';
}
