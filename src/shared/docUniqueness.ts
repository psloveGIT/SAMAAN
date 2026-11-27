import type { DatabaseSnapshot, SignedScanAttachment } from './types.ts';

export type UniqueDocScope =
  | 'opi'
  | 'miv'
  | 'substitutions'
  | 'siteEntry'
  | 'opiMinutes'
  | 'osdr'
  | 'gcv'
  | 'customForms';

export interface UsedDocNoEntry {
  scope: UniqueDocScope | 'trash';
  id: string;
  docNo: string;
}

export interface UniqueDocNoCheckResult {
  ok: boolean;
  normalizedKey: string;
  conflict?: UsedDocNoEntry;
  errorFa?: string;
  errorEn?: string;
}

/**
 * Normalizes any document number into a canonical comparison key:
 * converts Persian (۰-۹) and Arabic (٠-٩) digits to ASCII, trims,
 * collapses inner whitespace, and uppercases.
 */
export function normalizeDocNoKey(raw: string | undefined | null): string {
  return String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const SCOPE_LABEL_FA: Record<UniqueDocScope | 'trash', string> = {
  opi: 'دعوتنامه OPI',
  miv: 'حواله انبار / برگشت کالا (MIV/SMR)',
  substitutions: 'فرم جایگزینی تجهیزات',
  siteEntry: 'صورتجلسه ورود کالا به سایت',
  opiMinutes: 'صورتجلسه گشایش و بازرسی (OPI)',
  osdr: 'گزارش کسری و آسیب‌دیدگی (OSDR)',
  gcv: 'رسید مصرف مستقیم (GCV)',
  customForms: 'فرم سفارشی',
  trash: 'سطل زباله',
};

const SCOPE_LABEL_EN: Record<UniqueDocScope | 'trash', string> = {
  opi: 'OPI Invitation',
  miv: 'MIV / SMR Document',
  substitutions: 'Substitution Form',
  siteEntry: 'Site Entry Minutes',
  opiMinutes: 'OPI Minutes',
  osdr: 'OSDR Report',
  gcv: 'Direct Consumption Voucher (GCV)',
  customForms: 'Custom Form',
  trash: 'Trash',
};

const TRASH_SCOPE_MAP: Record<UniqueDocScope, ReadonlyArray<string>> = {
  opi: ['opi', 'opiInvitations'],
  miv: ['miv', 'mivDocuments'],
  substitutions: ['substitutions'],
  siteEntry: ['siteEntry', 'siteEntryMinutes'],
  opiMinutes: ['opiMinutes'],
  osdr: ['osdr', 'osdrReports'],
  gcv: ['gcv', 'gcvDocuments'],
  customForms: ['customForms', 'customFormSubmissions'],
};

/**
 * Collects used document numbers for a specific form section (`scope`), OR across all sections
 * if `scope` is omitted. Uniqueness is enforced strictly within each form section independently
 * (e.g. NK-TU-0001 cannot be duplicated inside OPI Invitations, but CAN be used in MER).
 */
export function collectAllUsedDocNos(
  db: Partial<DatabaseSnapshot>,
  options?: {
    scope?: UniqueDocScope;
    excludeScope?: UniqueDocScope;
    excludeId?: string;
    excludeIds?: readonly string[];
    allowPairedOpiInvitationNo?: string;
  },
): Map<string, UsedDocNoEntry> {
  const excludedSet = new Set<string>(options?.excludeIds || []);
  if (options?.excludeId) excludedSet.add(options.excludeId);
  const excludeScope = options?.excludeScope;
  const targetScope = options?.scope;
  const pairedOpiKey = options?.allowPairedOpiInvitationNo
    ? normalizeDocNoKey(options.allowPairedOpiInvitationNo)
    : '';

  const map = new Map<string, UsedDocNoEntry>();

  const register = (scope: UniqueDocScope | 'trash', id: string, rawDocNo: string | undefined | null) => {
    if (excludeScope === scope && excludedSet.has(id)) return;
    const key = normalizeDocNoKey(rawDocNo);
    if (!key) return;
    if (scope === 'opi' && pairedOpiKey && key === pairedOpiKey) return;
    if (!map.has(key)) {
      map.set(key, { scope, id, docNo: String(rawDocNo || '').trim() });
    }
  };

  if (!targetScope || targetScope === 'opi') {
    for (const r of db.opiInvitations || []) register('opi', r.id, r.invitationNo);
  }
  if (!targetScope || targetScope === 'miv') {
    for (const r of db.mivDocuments || []) register('miv', r.id, r.docNo);
  }
  if (!targetScope || targetScope === 'substitutions') {
    for (const r of db.substitutions || []) register('substitutions', r.id, r.docNo);
  }
  if (!targetScope || targetScope === 'siteEntry') {
    for (const r of db.siteEntryMinutes || []) register('siteEntry', r.id, r.minutesNo);
  }
  if (!targetScope || targetScope === 'opiMinutes') {
    for (const r of db.opiMinutes || []) register('opiMinutes', r.id, r.minutesNo);
  }
  if (!targetScope || targetScope === 'osdr') {
    for (const r of db.osdrReports || []) register('osdr', r.id, r.reportNo);
  }
  if (!targetScope || targetScope === 'gcv') {
    for (const r of db.gcvDocuments || []) register('gcv', r.id, r.receiptNo);
  }
  if (!targetScope || targetScope === 'customForms') {
    for (const r of db.customFormSubmissions || []) register('customForms', r.id, r.docNo);
  }

  // Only check Trash items belonging to the same section when targetScope is provided
  const allowedTrashScopes = targetScope ? new Set(TRASH_SCOPE_MAP[targetScope]) : null;
  for (const item of db.trash || []) {
    const rawItem = item as unknown as Record<string, unknown>;
    const itemScope = String(rawItem?.scope || '');
    if (allowedTrashScopes && !allowedTrashScopes.has(itemScope)) continue;
    const payload = (rawItem?.data ?? rawItem?.payload) as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') continue;
    const candidates = targetScope
      ? targetScope === 'opi'
        ? [payload.invitationNo]
        : targetScope === 'miv'
          ? [payload.docNo]
          : targetScope === 'substitutions'
            ? [payload.docNo]
            : targetScope === 'siteEntry'
              ? [payload.minutesNo]
              : targetScope === 'opiMinutes'
                ? [payload.minutesNo]
                : targetScope === 'osdr'
                  ? [payload.reportNo]
                  : targetScope === 'gcv'
                    ? [payload.receiptNo]
                    : [payload.docNo]
      : [
          payload.docNo,
          payload.invitationNo,
          payload.minutesNo,
          payload.reportNo,
          payload.receiptNo,
        ];
    for (const rawCand of candidates) {
      if (typeof rawCand !== 'string' || !rawCand.trim()) continue;
      for (const token of rawCand.split(/[,،]+/)) {
        if (token.trim()) register('trash', item.id, token);
      }
    }
  }

  return map;
}

/**
 * Returns used document numbers for a specific section (or all sections if scope is omitted).
 */
export function getAllUsedDocNumbers(
  db: Partial<DatabaseSnapshot>,
  scope?: UniqueDocScope,
): string[] {
  return Array.from(collectAllUsedDocNos(db, scope ? { scope } : undefined).values()).map((e) => e.docNo);
}

/**
 * Asserts that `rawDocNo` is unique within the specified form section (`options.scope`),
 * or globally if `options.scope` is omitted.
 */
export function assertUniqueDocNo(
  db: Partial<DatabaseSnapshot>,
  rawDocNo: string | undefined | null,
  options?: {
    scope?: UniqueDocScope;
    excludeScope?: UniqueDocScope;
    excludeId?: string;
    excludeIds?: readonly string[];
    allowPairedOpiInvitationNo?: string;
  },
): UniqueDocNoCheckResult {
  const normalizedKey = normalizeDocNoKey(rawDocNo);
  if (!normalizedKey) {
    return {
      ok: false,
      normalizedKey: '',
      errorFa: 'شماره سند / فرم الزامی است.',
      errorEn: 'Document / form number is required.',
    };
  }
  const effectiveScope = options?.scope ?? options?.excludeScope;
  const used = collectAllUsedDocNos(db, {
    ...options,
    scope: effectiveScope,
  });
  const conflict = used.get(normalizedKey);
  if (conflict) {
    const scopeNameFa = effectiveScope ? SCOPE_LABEL_FA[effectiveScope] : SCOPE_LABEL_FA[conflict.scope];
    const scopeNameEn = effectiveScope ? SCOPE_LABEL_EN[effectiveScope] : SCOPE_LABEL_EN[conflict.scope];
    return {
      ok: false,
      normalizedKey,
      conflict,
      errorFa: `شماره فرم «${String(rawDocNo || '').trim()}» در بخش «${scopeNameFa}» تکراری است. شماره هر فرم در هر بخش باید یکتا باشد.`,
      errorEn: `Form number "${String(rawDocNo || '').trim()}" is already used in ${scopeNameEn}. Every form number within a section must be unique.`,
    };
  }
  return { ok: true, normalizedKey };
}

export const ALLOWED_SIGNED_SCAN_MIMES = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export const MAX_SIGNED_SCAN_BYTES = 10 * 1024 * 1024; // 10 MB

export function sanitizeSignedScanFilename(rawName: string | undefined | null): string {
  const cleaned = String(rawName || 'signed-form')
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'signed-form').slice(0, 140);
}

export function validateSignedScanPayload(raw: Partial<SignedScanAttachment> | null | undefined): {
  ok: boolean;
  attachment?: SignedScanAttachment;
  errorFa?: string;
  errorEn?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      errorFa: 'فایل اسکن معتبر ارسال نشده است.',
      errorEn: 'No valid scan payload provided.',
    };
  }

  const mimeType = String(raw.mimeType || '').trim().toLowerCase();
  if (!ALLOWED_SIGNED_SCAN_MIMES.has(mimeType)) {
    return {
      ok: false,
      errorFa: 'فرمت فایل مجاز نیست. لطفاً فایل PDF یا تصویر (PNG / JPG / WebP) بارگذاری کنید.',
      errorEn: 'Unsupported file format. Please upload a PDF or image (PNG / JPG / WebP).',
    };
  }

  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  const rawBase64 = String(raw.dataBase64 || '').trim().replace(/^data:[^;]+;base64,/i, '');
  if (!rawBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(rawBase64)) {
    return {
      ok: false,
      errorFa: 'محتوای فایل اسکن معتبر نیست.',
      errorEn: 'Invalid base64 scan content.',
    };
  }

  const cleanBase64 = rawBase64.replace(/[\r\n]/g, '');
  const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4) - (cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_SIGNED_SCAN_BYTES) {
    return {
      ok: false,
      errorFa: 'حجم فایل اسکن باید کمتر از ۱۰ مگابایت باشد.',
      errorEn: 'Signed scan file must be smaller than 10 MB.',
    };
  }

  return {
    ok: true,
    attachment: {
      fileName: sanitizeSignedScanFilename(raw.fileName),
      mimeType: normalizedMime,
      sizeBytes: estimatedBytes,
      dataBase64: cleanBase64,
      uploadedAt: raw.uploadedAt || new Date().toISOString(),
      uploadedBy: raw.uploadedBy ? String(raw.uploadedBy).trim().slice(0, 120) : undefined,
    },
  };
}
