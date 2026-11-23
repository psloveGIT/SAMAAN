/**
 * Strict field sanitization & validation rules for Employer Contact & Social fields.
 * All fields are optional when empty, and strictly validated when non-empty.
 */

export interface FieldValidationResult {
  valid: boolean;
  normalized: string;
  errorFa?: string;
  errorEn?: string;
}

export interface IranFixedPhoneParts {
  provinceCode: string;
  subscriber: string;
}

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function toAsciiDigits(input: string): string {
  return String(input || '').replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_DIGIT_MAP[ch] ?? ch);
}

/**
 * Keeps only Persian, Arabic, or ASCII digits up to maxLen characters.
 */
export function sanitizeDigitsOnly(input: string, maxLen: number): string {
  const only = String(input || '').replace(/[^0-9۰-۹٠-٩]/g, '');
  return only.slice(0, maxLen);
}

/**
 * Province / area code: 2 digits, no leading zero (Persian/Arabic/ASCII digits accepted).
 */
export function sanitizeProvinceCodeInput(input: string): string {
  let digits = String(input || '').replace(/[^0-9۰-۹٠-٩]/g, '');
  // Strip any leading zero (English, Persian, or Arabic)
  digits = digits.replace(/^[0۰٠]+/, '');
  return digits.slice(0, 2);
}

/**
 * Parses a stored fixed-line phone/fax value into its 2-digit province code and 8-digit subscriber number.
 */
export function parseIranFixedPhoneParts(stored: string | undefined): IranFixedPhoneParts {
  const raw = String(stored || '').trim();
  if (!raw) return { provinceCode: '', subscriber: '' };

  // Handle exact serialized form "+98-<province>-<subscriber>" (preserves empty province when typing subscriber first)
  const serializedMatch = raw.match(/^\+98-([0-9۰-۹٠-٩]{0,2})-([0-9۰-۹٠-٩]{0,8})$/);
  if (serializedMatch) {
    return {
      provinceCode: sanitizeProvinceCodeInput(serializedMatch[1] || ''),
      subscriber: sanitizeDigitsOnly(serializedMatch[2] || '', 8),
    };
  }

  // Handle spaced/dashed "+98 XX XXXXXXXX"
  const explicitMatch = raw.match(/^\+?98[\s\-–—]+([0-9۰-۹٠-٩]{1,2})[\s\-–—]+([0-9۰-۹٠-٩]{1,8})$/);
  if (explicitMatch) {
    return {
      provinceCode: sanitizeProvinceCodeInput(explicitMatch[1] || ''),
      subscriber: sanitizeDigitsOnly(explicitMatch[2] || '', 8),
    };
  }

  let digits = toAsciiDigits(raw).replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98') && digits.length >= 10) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 10) digits = digits.slice(1);

  if (digits.length === 0) return { provinceCode: '', subscriber: '' };
  const provinceCode = sanitizeProvinceCodeInput(digits.slice(0, 2));
  const subscriber = sanitizeDigitsOnly(digits.slice(2), 8);
  return { provinceCode, subscriber };
}

/**
 * Serializes province code and subscriber number into stored string.
 * Returns '' if both parts are empty.
 */
export function serializeIranFixedPhoneParts(provinceCode: string, subscriber: string): string {
  const p = provinceCode.trim();
  const s = subscriber.trim();
  if (!p && !s) return '';
  return `+98-${p}-${s}`;
}

/**
 * Validates Iranian fixed phone / fax: +98 (fixed) + 2-digit province code without leading zero + 8-digit number.
 */
export function validateIranFixedPhoneParts(
  provinceCode: string,
  subscriber: string,
  labelFa = 'شماره تلفن',
  labelEn = 'Phone number',
): FieldValidationResult {
  const pRaw = provinceCode.trim();
  const sRaw = subscriber.trim();
  if (!pRaw && !sRaw) {
    return { valid: true, normalized: '' };
  }

  const p = toAsciiDigits(pRaw);
  const s = toAsciiDigits(sRaw);

  if (!/^[1-9][0-9]$/.test(p)) {
    return {
      valid: false,
      normalized: '',
      errorFa: `${labelFa}: کد استان باید دقیقاً ۲ رقم و بدون صفر ابتدایی باشد.`,
      errorEn: `${labelEn}: Province code must be 2 digits with no leading zero.`,
    };
  }

  if (!/^[0-9]{8}$/.test(s)) {
    return {
      valid: false,
      normalized: '',
      errorFa: `${labelFa}: بخش شماره باید دقیقاً ۸ رقم عددی باشد.`,
      errorEn: `${labelEn}: Subscriber number must be exactly 8 digits.`,
    };
  }

  return {
    valid: true,
    normalized: `+98-${p}-${s}`,
  };
}

/**
 * Validates Iranian 10-digit postal code (digits only, Persian or English accepted).
 */
export function validatePostalCode(input: string | undefined): FieldValidationResult {
  const raw = String(input || '').trim();
  if (!raw) return { valid: true, normalized: '' };

  const ascii = toAsciiDigits(raw);
  if (!/^[0-9]+$/.test(ascii)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'کدپستی باید فقط شامل اعداد (فارسی یا انگلیسی) باشد.',
      errorEn: 'Postal code must contain digits only.',
    };
  }

  if (ascii.length !== 10) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'کدپستی باید دقیقاً ۱۰ رقم باشد.',
      errorEn: 'Postal code must be exactly 10 digits.',
    };
  }

  return { valid: true, normalized: ascii };
}

/**
 * Validates email format requiring "@" and a valid domain + TLD (e.g. .com, .ir, .org, etc.).
 */
export function validateEmail(input: string | undefined): FieldValidationResult {
  const raw = String(input || '').trim();
  if (!raw) return { valid: true, normalized: '' };

  if (/\s/.test(raw)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'پست الکترونیکی نباید شامل فاصله باشد.',
      errorEn: 'Email address cannot contain spaces.',
    };
  }

  const atParts = raw.split('@');
  if (atParts.length !== 2 || !atParts[0] || !atParts[1]) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'پست الکترونیکی باید دارای علامت «@» و دامنه معتبر باشد.',
      errorEn: 'Email address must contain "@" and a valid domain.',
    };
  }

  const [local, domain] = atParts;
  if (
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !/^[a-zA-Z0-9._%+-]+$/.test(local)
  ) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'بخش نام کاربری پست الکترونیکی معتبر نیست.',
      errorEn: 'Email local part is invalid.',
    };
  }

  const domainRegex =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,24}$/;

  if (!domainRegex.test(domain)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'دامنه و پسوند پست الکترونیکی معتبر نیست (باید به پسوند معتبر مانند com. ختم شود).',
      errorEn: 'Email domain and TLD (e.g. .com) are invalid.',
    };
  }

  return { valid: true, normalized: raw };
}

/**
 * Sanitizes Instagram username input: strips leading "@" or URL prefix, keeps only [a-zA-Z0-9._], max 30 chars.
 */
export function sanitizeInstagramInput(input: string): string {
  let cleaned = String(input || '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/\/.*$/, '');
  cleaned = cleaned.replace(/[^a-zA-Z0-9._]/g, '');
  return cleaned.slice(0, 30);
}

/**
 * Validates Instagram username rules:
 * - Only English letters, digits, dots (.), and underscores (_)
 * - 2 to 30 characters
 * - Cannot start or end with a dot (.)
 * - Cannot contain consecutive dots (..)
 * - Must include at least one English letter
 */
export function validateInstagramUsername(input: string | undefined): FieldValidationResult {
  const raw = String(input || '').trim().replace(/^@+/, '');
  if (!raw) return { valid: true, normalized: '' };

  if (!/^[a-zA-Z0-9._]+$/.test(raw)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری اینستاگرام فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه (.) و زیرخط (_) باشد.',
      errorEn: 'Instagram username may only contain letters, numbers, periods, and underscores.',
    };
  }

  if (raw.length < 2 || raw.length > 30) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری اینستاگرام باید بین ۲ تا ۳۰ کاراکتر باشد.',
      errorEn: 'Instagram username must be between 2 and 30 characters.',
    };
  }

  if (raw.startsWith('.') || raw.endsWith('.') || raw.includes('..')) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری اینستاگرام نمی‌تواند با نقطه شروع یا تمام شود یا دو نقطه پشت‌سرهم داشته باشد.',
      errorEn: 'Instagram username cannot start/end with a period or contain consecutive periods.',
    };
  }

  if (!/[a-zA-Z]/.test(raw)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری اینستاگرام باید حداقل شامل یک حرف انگلیسی باشد.',
      errorEn: 'Instagram username must contain at least one English letter.',
    };
  }

  return { valid: true, normalized: raw };
}

/**
 * Sanitizes LinkedIn username input: strips LinkedIn URL prefixes, keeps only [a-zA-Z0-9-], max 100 chars.
 */
export function sanitizeLinkedInInput(input: string): string {
  let cleaned = String(input || '')
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in|company)\//i, '')
    .replace(/^@+/, '')
    .replace(/\/.*$/, '');
  cleaned = cleaned.replace(/[^a-zA-Z0-9-]/g, '');
  return cleaned.slice(0, 100);
}

/**
 * Validates LinkedIn username rules:
 * - Only English letters, digits, and hyphens (-)
 * - 3 to 100 characters
 * - Cannot start or end with a hyphen (-)
 * - Cannot contain consecutive hyphens (--)
 * - Must include at least one English letter
 */
export function validateLinkedInUsername(input: string | undefined): FieldValidationResult {
  const raw = String(input || '').trim();
  if (!raw) return { valid: true, normalized: '' };

  if (!/^[a-zA-Z0-9-]+$/.test(raw)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری لینکدین فقط می‌تواند شامل حروف انگلیسی، عدد و خط تیره (-) باشد.',
      errorEn: 'LinkedIn username may only contain English letters, numbers, and hyphens (-).',
    };
  }

  if (raw.length < 3 || raw.length > 100) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری لینکدین باید بین ۳ تا ۱۰۰ کاراکتر باشد.',
      errorEn: 'LinkedIn username must be between 3 and 100 characters.',
    };
  }

  if (raw.startsWith('-') || raw.endsWith('-') || raw.includes('--')) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری لینکدین نمی‌تواند با خط تیره شروع یا تمام شود یا دو خط تیره پشت‌سرهم داشته باشد.',
      errorEn: 'LinkedIn username cannot start/end with a hyphen or contain consecutive hyphens.',
    };
  }

  if (!/[a-zA-Z]/.test(raw)) {
    return {
      valid: false,
      normalized: '',
      errorFa: 'نام کاربری لینکدین باید حداقل شامل یک حرف انگلیسی باشد.',
      errorEn: 'LinkedIn username must contain at least one English letter.',
    };
  }

  return { valid: true, normalized: raw };
}
