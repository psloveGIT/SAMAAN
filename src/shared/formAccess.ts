import type { ResolvedEmployerProfile } from './employers.ts';
import type {
  BuiltInFormKey,
  EmployerProfile,
  EmployerUploadedForm,
  UploadedFormDataSource,
} from './types.ts';

/**
 * Exact 9 operational form sections in SAMAAN ("عملیات انبار").
 */
export const OPERATIONAL_FORM_SECTION_KEYS = [
  'siteEntry',
  'opi',
  'opiMinutes',
  'gcv',
  'miv',
  'smr',
  'substitution',
  'balance',
  'storageLabel',
] as const;

export type OperationalFormSectionKey = (typeof OPERATIONAL_FORM_SECTION_KEYS)[number];

export interface OperationalFormSectionMeta {
  order: number;
  key: OperationalFormSectionKey;
  titleFa: string;
  titleEn: string;
  shortCode: string;
  defaultDataSource: UploadedFormDataSource;
}

export const OPERATIONAL_FORM_SECTIONS: readonly OperationalFormSectionMeta[] = [
  {
    order: 1,
    key: 'siteEntry',
    titleFa: 'صورتجلسه ورود کالا و تجهیزات به کارگاه',
    titleEn: 'Site Entry Minutes of Material & Equipment',
    shortCode: 'SE',
    defaultDataSource: 'siteEntry',
  },
  {
    order: 2,
    key: 'opi',
    titleFa: 'دعوتنامه گشایش و بازرسی بسته ها',
    titleEn: 'OPI Invitation',
    shortCode: 'OPI',
    defaultDataSource: 'opi',
  },
  {
    order: 3,
    key: 'opiMinutes',
    titleFa: 'صورتجلسه گشایش و بازرسی بسته‌ها',
    titleEn: 'OPI Minutes & Material Exception Report',
    shortCode: 'OPI-M',
    defaultDataSource: 'opiMinutes',
  },
  {
    order: 4,
    key: 'gcv',
    titleFa: 'رسید مصرف مستقیم کالا',
    titleEn: 'Direct Consumption Voucher (GCV)',
    shortCode: 'GCV',
    defaultDataSource: 'gcv',
  },
  {
    order: 5,
    key: 'miv',
    titleFa: 'درخواست کالا از انبار و حواله انبار',
    titleEn: 'Material Issue Voucher (MIV)',
    shortCode: 'MIV',
    defaultDataSource: 'miv',
  },
  {
    order: 6,
    key: 'smr',
    titleFa: 'فرم ارجاع قطعات، کالا و تجهیزات',
    titleEn: 'Surplus Material Return (SMR)',
    shortCode: 'SMR',
    defaultDataSource: 'smr',
  },
  {
    order: 7,
    key: 'substitution',
    titleFa: 'جایگزینی تجهیزات',
    titleEn: 'Equipment Substitution Form',
    shortCode: 'REP',
    defaultDataSource: 'substitution',
  },
  {
    order: 8,
    key: 'balance',
    titleFa: 'گزارش موازنه و کنترل مصرف مواد',
    titleEn: 'Material Balance Report',
    shortCode: 'BMR',
    defaultDataSource: 'balance',
  },
  {
    order: 9,
    key: 'storageLabel',
    titleFa: 'برچسب انبارش کالا',
    titleEn: 'Storage Label',
    shortCode: 'LBL',
    defaultDataSource: 'detailed',
  },
] as const;

/**
 * Registry of sections that ship with a redesigned built-in default form per employer.
 *
 * - All previously bundled legacy default forms have been removed cleanly.
 * - New default forms for "مپنا توسعه یک" (mapna-md1) are registered here one by one
 *   as each official form file is delivered and its section is redesigned.
 * - "مپنا توسعه دو" (mapna-md2), "مپنا توسعه سه" (mapna-md3), and all custom employers
 *   have no built-in default forms and unlock each section once the user uploads its form.
 */
export const BUILT_IN_EMPLOYER_DEFAULT_FORMS: Record<string, readonly OperationalFormSectionKey[]> = {
  'mapna-md1': ['storageLabel', 'substitution', 'miv', 'opi', 'gcv', 'opiMinutes'],
  'mapna-md2': [],
  'mapna-md3': [],
};

export type OperationalSectionAccessMode = 'locked' | 'builtin' | 'uploaded';

export interface OperationalSectionAccessResult {
  sectionKey: OperationalFormSectionKey;
  hasAccess: boolean;
  mode: OperationalSectionAccessMode;
  hasBuiltInDefault: boolean;
  uploadedForms: EmployerUploadedForm[];
}

export interface EmployerFormSectionsSummary {
  totalCount: number;
  unlockedCount: number;
  lockedCount: number;
  sections: Array<OperationalSectionAccessResult & { meta: OperationalFormSectionMeta }>;
}

export function isOperationalFormSection(key: string): key is OperationalFormSectionKey {
  return (OPERATIONAL_FORM_SECTION_KEYS as readonly string[]).includes(key);
}

export function getOperationalFormSectionMeta(
  sectionKey: OperationalFormSectionKey,
): OperationalFormSectionMeta {
  return (
    OPERATIONAL_FORM_SECTIONS.find((s) => s.key === sectionKey) || OPERATIONAL_FORM_SECTIONS[0]
  );
}

export function hasBuiltInDefaultForm(
  employerId: string | undefined | null,
  sectionKey: OperationalFormSectionKey,
): boolean {
  const cleanId = (employerId || '').trim();
  if (!cleanId) return false;
  const list = BUILT_IN_EMPLOYER_DEFAULT_FORMS[cleanId];
  return Array.isArray(list) && list.includes(sectionKey);
}

export function matchesOperationalFormSection(
  targetSection: BuiltInFormKey | 'custom_standalone' | undefined,
  sectionKey: OperationalFormSectionKey,
): boolean {
  if (!targetSection || targetSection === 'custom_standalone') return false;
  if (targetSection === sectionKey) return true;
  if (sectionKey === 'opiMinutes' && targetSection === 'mer') return true;
  return false;
}

export function getUploadedFormsForSection(
  employer: Pick<EmployerProfile | ResolvedEmployerProfile, 'uploadedForms'> | null | undefined,
  sectionKey: OperationalFormSectionKey,
): EmployerUploadedForm[] {
  const forms = employer?.uploadedForms || [];
  return forms.filter((uf) => matchesOperationalFormSection(uf.targetAppSection, sectionKey));
}

export function resolveOperationalSectionAccess(
  employer: Pick<EmployerProfile | ResolvedEmployerProfile, 'id' | 'uploadedForms'> | null | undefined,
  sectionKey: OperationalFormSectionKey,
): OperationalSectionAccessResult {
  const builtIn = hasBuiltInDefaultForm(employer?.id, sectionKey);

  if (builtIn) {
    return {
      sectionKey,
      hasAccess: true,
      mode: 'builtin',
      hasBuiltInDefault: true,
      uploadedForms: [],
    };
  }

  return {
    sectionKey,
    hasAccess: false,
    mode: 'locked',
    hasBuiltInDefault: false,
    uploadedForms: [],
  };
}

export function getEmployerFormSectionsSummary(
  employer: Pick<EmployerProfile | ResolvedEmployerProfile, 'id' | 'uploadedForms'> | null | undefined,
): EmployerFormSectionsSummary {
  const sections = OPERATIONAL_FORM_SECTIONS.map((meta) => ({
    ...resolveOperationalSectionAccess(employer, meta.key),
    meta,
  }));
  const unlockedCount = sections.filter((s) => s.hasAccess).length;
  return {
    totalCount: sections.length,
    unlockedCount,
    lockedCount: sections.length - unlockedCount,
    sections,
  };
}
