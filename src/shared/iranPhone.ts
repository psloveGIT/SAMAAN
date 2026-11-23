import { normalizeDigits } from './jalali.ts';

export interface IranPhoneValidationResult {
  valid: boolean;
  formatted: string;
  normalized: string;
  kind: 'mobile' | 'landline' | 'multi' | 'empty' | 'invalid';
  errorFa?: string;
  errorEn?: string;
}

/**
 * Strips non-digit characters (preserving optional leading +) after converting
 * Persian/Arabic digits to ASCII.
 */
function stripToIranDigits(raw: string): string {
  const ascii = normalizeDigits(raw || '').trim();
  if (!ascii) return '';
  let digits = ascii.replace(/[^\d+]/g, '');
  if (digits.startsWith('+98')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('0098')) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('98') && digits.length >= 11 && digits.length <= 12) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '0' + digits;
  }
  return digits.replace(/\+/g, '');
}

function formatSingleIranPhone(digits: string): {
  valid: boolean;
  formatted: string;
  kind: 'mobile' | 'landline' | 'invalid';
} {
  // Iranian mobile: 09XXXXXXXXX (11 digits)
  if (/^09\d{9}$/.test(digits)) {
    return {
      valid: true,
      formatted: `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`,
      kind: 'mobile',
    };
  }

  // Iranian landline with 3-digit area code (e.g. 021, 031, 051, 071, 011, 041, 061, 086, ...)
  // Total 11 digits: 0[1-8]\d + 8 local digits, OR 4-digit internal/short service numbers like 021-XXXXXXX (10 digits)
  if (/^0[1-8]\d{8,9}$/.test(digits)) {
    const area = digits.slice(0, 3);
    const local = digits.slice(3);
    return {
      valid: true,
      formatted: `${area}-${local}`,
      kind: 'landline',
    };
  }

  // Local 8-digit landline without area code (optional convenience — still flagged or formatted if needed,
  // but strict Iran format requires leading 0 area code or 09 mobile prefix)
  return {
    valid: false,
    formatted: digits,
    kind: 'invalid',
  };
}

function normalizeRtlAreaCode(rawPart: string): string {
  const ascii = normalizeDigits(rawPart || '').trim();
  // Match RTL reversed landline like "45357000–021" or "88795447 –021" or "88857450 021"
  const rtlMatch = ascii.match(/^(\d{7,8})\s*[-–—\s]\s*(0[1-8]\d)$/);
  if (rtlMatch) {
    return `${rtlMatch[2]}${rtlMatch[1]}`;
  }
  return ascii;
}

/**
 * Formats and validates an Iranian phone number string (supports single or multiple
 * slash/comma/'و'-separated Iranian mobile or landline numbers, e.g. "0912-345-6789",
 * "021-88776655 / 0912-345-6789", or "02182980000 و 02182980001").
 * Empty string is considered valid (optional field); callers requiring non-empty check separately.
 */
export function validateAndFormatIranPhone(rawInput: string | null | undefined): IranPhoneValidationResult {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { valid: true, formatted: '', normalized: '', kind: 'empty' };
  }

  const parts = trimmed
    .split(/(?:[\/،,;|\n]+|\s+و\s+)/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { valid: true, formatted: '', normalized: '', kind: 'empty' };
  }

  const formattedParts: string[] = [];
  const normalizedParts: string[] = [];
  let mobileCount = 0;
  let landlineCount = 0;

  for (const part of parts) {
    const digits = stripToIranDigits(normalizeRtlAreaCode(part));
    const checked = formatSingleIranPhone(digits);
    if (!checked.valid) {
      return {
        valid: false,
        formatted: trimmed,
        normalized: digits,
        kind: 'invalid',
        errorFa:
          'فرمت شماره تلفن ایران معتبر نیست. نمونه صحیح: 0912-345-6789 (موبایل) یا 021-88776655 (تلفن ثابت با پیش‌شماره).',
        errorEn:
          'Invalid Iranian phone format. Examples: 0912-345-6789 (mobile) or 021-88776655 (landline with area code).',
      };
    }
    formattedParts.push(checked.formatted);
    normalizedParts.push(digits);
    if (checked.kind === 'mobile') mobileCount += 1;
    else landlineCount += 1;
  }

  return {
    valid: true,
    formatted: formattedParts.join(' / '),
    normalized: normalizedParts.join(' / '),
    kind: parts.length > 1 ? 'multi' : mobileCount > 0 ? 'mobile' : 'landline',
  };
}

/**
 * Live input sanitizer: normalizes Persian/Arabic digits, restricts to valid phone characters,
 * and allows Persian 'و' separator for multiple phone numbers.
 */
export function sanitizeIranPhoneInput(raw: string): string {
  const ascii = normalizeDigits(raw || '');
  return ascii.replace(/[^0-9+\-–—\s/،,()و]/g, '');
}
