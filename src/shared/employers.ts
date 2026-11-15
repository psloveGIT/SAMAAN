import type { EmployerCustomConfig, EmployerId, ProjectInfo } from './types.ts';

export type EmployerLogoType = 'md1' | 'mapna_generic' | 'neutral' | 'custom';

export interface EmployerPreset {
  id: EmployerId;
  nameFa: string;
  nameEn: string;
  companyFullName: string;
  companyFullNameEn: string;
  shortName: string;
  badgeCode: string;
  securityLabel: string;
  equipmentSupplyLabel: string;
  techOfficeLabel: string;
  installationLabel: string;
  inspectorLabel: string;
  imsSubtitle: string;
  docCodePrefix: string;
  formPackTitleFa: string;
  formPackTitleEn: string;
  logoType: EmployerLogoType;
}

export interface ResolvedEmployerProfile extends EmployerPreset {
  logoDataUrl?: string;
  hideDocCodes: boolean;
}

export const DEFAULT_EMPLOYER_ID: EmployerId = 'mapna_md1';

export const EMPLOYER_PRESETS: EmployerPreset[] = [
  {
    id: 'mapna_md1',
    nameFa: 'مپنا توسعه یک (MD1)',
    nameEn: 'MAPNA Development 1 (MD1)',
    companyFullName: 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)',
    companyFullNameEn: 'MAPNA Power Plant Construction & Development Co. – MD1',
    shortName: 'توسعه یک',
    badgeCode: 'MD1',
    securityLabel: 'انتظامات مپنا',
    equipmentSupplyLabel: 'تأمین تجهیزات توسعه یک',
    techOfficeLabel: 'دفتر فنی توسعه یک',
    installationLabel: 'بخش نصب توسعه یک',
    inspectorLabel: 'نماینده مپنا / توسعه یک',
    imsSubtitle: 'مستندات سیستم مدیریت یکپارچه',
    docCodePrefix: 'MD1EX-FQP02',
    formPackTitleFa: 'فرم‌های رسمی شرکت مپنا توسعه یک (سری MD1EX-FQP02)',
    formPackTitleEn: 'MAPNA MD1 Official Form Suite (MD1EX-FQP02)',
    logoType: 'md1',
  },
  {
    id: 'mapna_md2',
    nameFa: 'مپنا توسعه دو (MD2)',
    nameEn: 'MAPNA Development 2 (MD2)',
    companyFullName: 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه دو (MD2)',
    companyFullNameEn: 'MAPNA Power Plant Construction & Development Co. – MD2',
    shortName: 'توسعه دو',
    badgeCode: 'MD2',
    securityLabel: 'انتظامات کارگاه / مپنا',
    equipmentSupplyLabel: 'تأمین تجهیزات توسعه دو',
    techOfficeLabel: 'دفتر فنی توسعه دو',
    installationLabel: 'بخش نصب توسعه دو',
    inspectorLabel: 'نماینده مپنا / توسعه دو',
    imsSubtitle: 'مستندات سیستم مدیریت یکپارچه',
    docCodePrefix: 'MD2EX-FQP02',
    formPackTitleFa: 'فرم‌های رسمی شرکت مپنا توسعه دو (سری MD2EX-FQP02)',
    formPackTitleEn: 'MAPNA MD2 Official Form Suite (MD2EX-FQP02)',
    logoType: 'mapna_generic',
  },
  {
    id: 'mapna_md3',
    nameFa: 'مپنا توسعه سه (MD3)',
    nameEn: 'MAPNA Development 3 (MD3)',
    companyFullName: 'شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه سه (MD3)',
    companyFullNameEn: 'MAPNA Power Plant Construction & Development Co. – MD3',
    shortName: 'توسعه سه',
    badgeCode: 'MD3',
    securityLabel: 'انتظامات کارگاه / مپنا',
    equipmentSupplyLabel: 'تأمین تجهیزات توسعه سه',
    techOfficeLabel: 'دفتر فنی توسعه سه',
    installationLabel: 'بخش نصب توسعه سه',
    inspectorLabel: 'نماینده مپنا / توسعه سه',
    imsSubtitle: 'مستندات سیستم مدیریت یکپارچه',
    docCodePrefix: 'MD3EX-FQP02',
    formPackTitleFa: 'فرم‌های رسمی شرکت مپنا توسعه سه (سری MD3EX-FQP02)',
    formPackTitleEn: 'MAPNA MD3 Official Form Suite (MD3EX-FQP02)',
    logoType: 'mapna_generic',
  },
  {
    id: 'mapna_meco',
    nameFa: 'مپنا - مهندسی و ساخت (MECO)',
    nameEn: 'MAPNA Engineering & Construction (MECO)',
    companyFullName: 'شرکت مهندسی و ساخت نیروگاه‌های مپنا (MECO)',
    companyFullNameEn: 'MAPNA Power Plant Engineering & Construction Co. (MECO)',
    shortName: 'مپنا (MECO)',
    badgeCode: 'MECO',
    securityLabel: 'انتظامات کارگاه',
    equipmentSupplyLabel: 'تأمین تجهیزات کارفرما',
    techOfficeLabel: 'دفتر فنی کارفرما',
    installationLabel: 'بخش نصب و اجرا',
    inspectorLabel: 'نماینده کارفرما (MECO)',
    imsSubtitle: 'مستندات کنترل کیفیت و انبارداری',
    docCodePrefix: 'MECO-FQP02',
    formPackTitleFa: 'فرم‌های استاندارد شرکت مهندسی و ساخت مپنا (MECO)',
    formPackTitleEn: 'MAPNA MECO Form Suite (MECO-FQP02)',
    logoType: 'mapna_generic',
  },
  {
    id: 'tavanir',
    nameFa: 'توانیر / کارفرمای دولتی نیروگاهی',
    nameEn: 'Tavanir / Power Utility Client',
    companyFullName: 'شرکت مدیریت تولید، انتقال و توزیع نیروی برق ایران (توانیر)',
    companyFullNameEn: 'Iran Power Generation, Transmission & Distribution Co. (TAVANIR)',
    shortName: 'کارفرما (توانیر)',
    badgeCode: 'TAVANIR',
    securityLabel: 'حراست و انتظامات کارگاه',
    equipmentSupplyLabel: 'واحد تأمین تجهیزات کارفرما',
    techOfficeLabel: 'دفتر فنی و نظارت کارفرما',
    installationLabel: 'واحد نصب و بهره‌برداری',
    inspectorLabel: 'نماینده کارفرما / دستگاه نظارت',
    imsSubtitle: 'مستندات مدیریت کالا و انبار کارگاه',
    docCodePrefix: 'TAV-FQP02',
    formPackTitleFa: 'فرم‌های استاندارد کارفرمای نیروگاهی توانیر (سری TAV-FQP02)',
    formPackTitleEn: 'Tavanir Power Plant Form Suite',
    logoType: 'neutral',
  },
  {
    id: 'custom',
    nameFa: 'سایر کارفرمایان (سربرگ و فرم سفارشی)',
    nameEn: 'Custom Employer (Custom Header & Forms)',
    companyFullName: 'شرکت کارفرمای پروژه',
    companyFullNameEn: 'Project Client / Employer',
    shortName: 'کارفرما',
    badgeCode: 'CLIENT',
    securityLabel: 'حراست و انتظامات کارگاه',
    equipmentSupplyLabel: 'واحد تأمین تجهیزات کارفرما',
    techOfficeLabel: 'دفتر فنی کارفرما',
    installationLabel: 'واحد نصب و اجرا',
    inspectorLabel: 'نماینده کارفرما / دستگاه نظارت',
    imsSubtitle: 'مستندات مدیریت کیفیت و انبارداری کارگاه',
    docCodePrefix: 'WH-FQP02',
    formPackTitleFa: 'فرم‌های اختصاصی کارفرمای سفارشی',
    formPackTitleEn: 'Custom Employer Form Suite',
    logoType: 'neutral',
  },
];

export function isValidEmployerId(raw: unknown): raw is EmployerId {
  return typeof raw === 'string' && EMPLOYER_PRESETS.some((p) => p.id === raw);
}

export function sanitizeEmployerConfig(raw?: EmployerCustomConfig | null): EmployerCustomConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cleaned: EmployerCustomConfig = {};
  if (typeof raw.companyFullName === 'string' && raw.companyFullName.trim()) {
    cleaned.companyFullName = raw.companyFullName.trim();
  }
  if (typeof raw.shortName === 'string' && raw.shortName.trim()) {
    cleaned.shortName = raw.shortName.trim();
  }
  if (typeof raw.docCodePrefix === 'string' && raw.docCodePrefix.trim()) {
    cleaned.docCodePrefix = raw.docCodePrefix.trim();
  }
  if (typeof raw.imsSubtitle === 'string' && raw.imsSubtitle.trim()) {
    cleaned.imsSubtitle = raw.imsSubtitle.trim();
  }
  if (typeof raw.logoDataUrl === 'string' && raw.logoDataUrl.startsWith('data:image/')) {
    cleaned.logoDataUrl = raw.logoDataUrl;
  }
  if (typeof raw.hideDocCodes === 'boolean') {
    cleaned.hideDocCodes = raw.hideDocCodes;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

export function resolveEmployerProfile(
  project?: Pick<ProjectInfo, 'employerId' | 'employerConfig'> | null,
): ResolvedEmployerProfile {
  const employerId: EmployerId = isValidEmployerId(project?.employerId)
    ? project!.employerId
    : DEFAULT_EMPLOYER_ID;
  const base = EMPLOYER_PRESETS.find((p) => p.id === employerId) || EMPLOYER_PRESETS[0];
  const cfg = project?.employerConfig;

  if (!cfg) {
    return {
      ...base,
      hideDocCodes: false,
    };
  }

  const shortName = cfg.shortName?.trim() || base.shortName;
  const companyFullName = cfg.companyFullName?.trim() || base.companyFullName;
  const docCodePrefix = cfg.docCodePrefix?.trim() || base.docCodePrefix;
  const imsSubtitle = cfg.imsSubtitle?.trim() || base.imsSubtitle;
  const hasCustomLogo = Boolean(cfg.logoDataUrl && cfg.logoDataUrl.startsWith('data:image/'));

  return {
    ...base,
    companyFullName,
    shortName,
    equipmentSupplyLabel:
      employerId === 'custom' && cfg.shortName?.trim()
        ? `تأمین تجهیزات ${shortName}`
        : base.equipmentSupplyLabel,
    techOfficeLabel:
      employerId === 'custom' && cfg.shortName?.trim()
        ? `دفتر فنی ${shortName}`
        : base.techOfficeLabel,
    installationLabel:
      employerId === 'custom' && cfg.shortName?.trim()
        ? `بخش نصب ${shortName}`
        : base.installationLabel,
    inspectorLabel:
      employerId === 'custom' && cfg.shortName?.trim()
        ? `نماینده ${shortName}`
        : base.inspectorLabel,
    imsSubtitle,
    docCodePrefix,
    logoType: hasCustomLogo ? 'custom' : base.logoType,
    logoDataUrl: hasCustomLogo ? cfg.logoDataUrl : undefined,
    hideDocCodes: Boolean(cfg.hideDocCodes),
    formPackTitleFa:
      employerId === 'custom'
        ? `فرم‌های اختصاصی ${companyFullName}${docCodePrefix ? ` (${docCodePrefix})` : ''}`
        : base.formPackTitleFa,
  };
}

/**
 * Generates an employer-specific document code such as "MD1EX-FQP02/15-01".
 */
export function getEmployerFormCode(
  profile: ResolvedEmployerProfile,
  suffix: string,
): string {
  if (profile.hideDocCodes) return '';
  const cleanSuffix = suffix.replace(/^\/+/, '');
  const prefix = (profile.docCodePrefix || 'FQP02').replace(/\/+$/, '');
  return `${prefix}/${cleanSuffix}`;
}
