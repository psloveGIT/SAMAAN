import type {
  BuiltInFormKey,
  CustomEmployerForm,
  EmployerCustomConfig,
  EmployerFormTemplate,
  EmployerLogoAsset,
  EmployerProfile,
  EmployerUploadedForm,
  FormColumnOverride,
  FormExtraField,
  FormHeaderLayout,
  FormPaperOrientation,
  FormSignatureBox,
  ProjectInfo,
  UploadedFormDataSource,
  UploadedFormFileType,
  UploadedFormPrintSettings,
  UploadedFormTableColumnBinding,
} from './types.ts';

export interface ResolvedEmployerProfile {
  id: string;
  isConfigured: boolean;
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
  address?: string;
  phone?: string;
  contractRef?: string;
  logos: EmployerLogoAsset[];
  formTemplates: Partial<Record<BuiltInFormKey, EmployerFormTemplate>>;
  customForms: CustomEmployerForm[];
  uploadedForms: EmployerUploadedForm[];
  hideDocCodes: boolean;
}

export interface BuiltInFormDefinition {
  key: BuiltInFormKey;
  titleFa: string;
  titleEn: string;
  codeSuffix: string;
  defaultOrientation: FormPaperOrientation;
  defaultHeaderLayout: FormHeaderLayout;
  defaultIntroText?: string;
  defaultFooterCopyText?: string;
  defaultColumns: { key: string; label: string }[];
  defaultSignatures: FormSignatureBox[];
}

export const DEFAULT_EMPLOYER_ID = '';

export const BUILT_IN_FORM_DEFINITIONS: BuiltInFormDefinition[] = [
  {
    key: 'siteEntry',
    titleFa: 'صورتجلسه ورود کالا و تجهیزات به کارگاه',
    titleEn: 'Site Entry Minutes of Material & Equipment',
    codeSuffix: '15-01',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: ۱- درخواست‌کننده / پیمانکار   ۲- واحد تأمین تجهیزات   ۳- حراست کارگاه',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'description', label: 'شرح کالا / مشخصات فنی' },
      { key: 'packingListNo', label: 'شماره پکینگ لیست / بارنامه' },
      { key: 'packageNo', label: 'شماره بسته / نگله' },
      { key: 'dimensions', label: 'ابعاد (متر)' },
      { key: 'qty', label: 'تعداد' },
      { key: 'unit', label: 'واحد' },
      { key: 'netWeight', label: 'وزن خالص (کیلوگرم)' },
      { key: 'grossWeight', label: 'وزن ناخالص (کیلوگرم)' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-sec', label: 'حراست و انتظامات کارگاه', subtitle: 'نام، تاریخ و امضاء' },
      { id: 'sig-qc', label: 'QC / دفتر فنی', subtitle: 'نام، تاریخ و امضاء' },
      { id: 'sig-hse', label: 'HSE', subtitle: 'نام، تاریخ و امضاء' },
      { id: 'sig-sup', label: 'تأمین تجهیزات', subtitle: 'نام، تاریخ و امضاء' },
      { id: 'sig-rep', label: 'نماینده کارفرما / دستگاه نظارت', subtitle: 'نام، تاریخ و امضاء' },
    ],
  },
  {
    key: 'opi',
    titleFa: 'دعوتنامه بازرسی گشایش بسته‌ها (OPI)',
    titleEn: 'OPI Inspection Invitation',
    codeSuffix: '02-03',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: کنترل کیفیت، تأمین تجهیزات، انبار کارگاه',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemNo', label: 'شماره قلم' },
      { key: 'packingListNo', label: 'شماره پکینگ' },
      { key: 'packageNo', label: 'شماره نگله' },
      { key: 'description', label: 'شرح کالا و تجهیزات' },
      { key: 'uom', label: 'واحد' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-req', label: 'درخواست‌کننده / انبار', subtitle: 'نام و امضاء' },
      { id: 'sig-qc', label: 'کنترل کیفیت (QC)', subtitle: 'نام و امضاء' },
      { id: 'sig-client', label: 'نماینده کارفرما / مشاور', subtitle: 'نام و امضاء' },
    ],
  },
  {
    key: 'opiMinutes',
    titleFa: 'صورتجلسه گشایش و بازرسی بسته‌ها',
    titleEn: 'OPI – Minutes Of Meeting',
    codeSuffix: '06-03',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultIntroText:
      'بسته‌های فوق در حضور نمایندگان کارفرما، مشاور، کنترل کیفیت و انباردار بازگشایی و بازرسی شد و اقلام موجود مطابق پکینگ لیست پیوست تحویل انبار گردید.',
    defaultFooterCopyText: 'رونوشت: ۱- نماینده کارفرما   ۲- کنترل کیفیت   ۳- انبار کارگاه',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemNo', label: 'شماره قلم' },
      { key: 'packingListNo', label: 'پکینگ لیست' },
      { key: 'packageNo', label: 'شماره بسته' },
      { key: 'description', label: 'شرح کالا' },
      { key: 'uom', label: 'واحد' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-wh', label: 'انباردار کارگاه', subtitle: 'نام و امضاء' },
      { id: 'sig-qc', label: 'بازرس / کنترل کیفیت', subtitle: 'نام و امضاء' },
      { id: 'sig-sup', label: 'تأمین تجهیزات', subtitle: 'نام و امضاء' },
      { id: 'sig-client', label: 'نماینده کارفرما', subtitle: 'نام و امضاء' },
    ],
  },
  {
    key: 'mer',
    titleFa: 'گزارش مغایرت، کسری و آسیب‌دیدگی کالا (MER)',
    titleEn: 'Material Exception Report (MER)',
    codeSuffix: '06-03',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultColumns: [
      { key: 'row', label: '#' },
      { key: 'packageNo', label: 'شماره بسته' },
      { key: 'itemNo', label: 'شماره قلم' },
      { key: 'description', label: 'شرح کالا / تجهیز' },
      { key: 'packingQty', label: 'پکینگ' },
      { key: 'actualQty', label: 'واقعی' },
      { key: 'shortage', label: 'کسری' },
      { key: 'damagedQty', label: 'آسیب‌دیده' },
      { key: 'remarks', label: 'توضیحات' },
    ],
    defaultSignatures: [
      { id: 'sig-wh', label: 'مسئول انبار' },
      { id: 'sig-qc', label: 'کنترل کیفیت / بازرسی' },
      { id: 'sig-client', label: 'نماینده کارفرما / دستگاه نظارت' },
    ],
  },
  {
    key: 'gcv',
    titleFa: 'رسید مصرف مستقیم کالا',
    titleEn: 'Not-Stored Goods Consumption Voucher',
    codeSuffix: '11-03',
    defaultOrientation: 'landscape',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: معاونت تأمین، امور مالی، واحد کنترل کالا و انبار، پیمانکار نصب',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemCode', label: 'کد کالا / پکینگ' },
      { key: 'description', label: 'شرح کالا و مشخصات' },
      { key: 'unit', label: 'واحد' },
      { key: 'qty', label: 'مقدار' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-wh', label: 'انباردار' },
      { id: 'sig-sup', label: 'تأمین تجهیزات' },
      { id: 'sig-rec', label: 'تحویل گیرنده / پیمانکار نصب' },
      { id: 'sig-pm', label: 'مدیر پروژه / سرپرست کارگاه' },
    ],
  },
  {
    key: 'miv',
    titleFa: 'درخواست کالا از انبار و حواله انبار',
    titleEn: 'Material Issue Voucher (MIV)',
    codeSuffix: '05-03',
    defaultOrientation: 'landscape',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: ۱- دفتر فنی   ۲- تأمین تجهیزات   ۳- انبار   ۴- تحویل گیرنده',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemCode', label: 'کد کالا' },
      { key: 'description', label: 'شرح کالا' },
      { key: 'unit', label: 'واحد' },
      { key: 'requestedQty', label: 'تعداد درخواستی' },
      { key: 'deliveredQty', label: 'تعداد تحویلی' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-req', label: 'درخواست‌کننده' },
      { id: 'sig-tech', label: 'تایید دفتر فنی' },
      { id: 'sig-wh', label: 'مسئول انبار' },
      { id: 'sig-rec', label: 'تحویل گیرنده' },
    ],
  },
  {
    key: 'smr',
    titleFa: 'فرم ارجاع قطعات، کالا و تجهیزات مازاد',
    titleEn: 'Surplus Material Return Form',
    codeSuffix: '08-03',
    defaultOrientation: 'landscape',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: واحد تأمین تجهیزات، پیمانکار نصب، دفتر فنی، انبار',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemCode', label: 'کد کالا' },
      { key: 'description', label: 'شرح کالا' },
      { key: 'unit', label: 'واحد' },
      { key: 'qty', label: 'مقدار برگشتی' },
      { key: 'remarks', label: 'علت برگشت / ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-inst', label: 'پیمانکار نصب' },
      { id: 'sig-qc', label: 'کنترل کیفیت' },
      { id: 'sig-wh', label: 'مسئول انبار' },
      { id: 'sig-sup', label: 'تأمین تجهیزات' },
    ],
  },
  {
    key: 'substitution',
    titleFa: 'صورتجلسه جایگزینی تجهیزات',
    titleEn: 'Replacement Form',
    codeSuffix: '10-03',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: واحد تأمین، فروشنده / سازنده، پیمانکار نصب',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'description', label: 'شرح کالا / تجهیز' },
      { key: 'itemCode', label: 'کد فنی' },
      { key: 'qty', label: 'تعداد' },
      { key: 'remarks', label: 'ملاحظات' },
    ],
    defaultSignatures: [
      { id: 'sig-sup', label: 'واحد تأمین تجهیزات' },
      { id: 'sig-qc', label: 'کنترل کیفیت / دفتر فنی' },
      { id: 'sig-inst', label: 'پیمانکار نصب / راه‌اندازی' },
      { id: 'sig-client', label: 'نماینده کارفرما' },
    ],
  },
  {
    key: 'balance',
    titleFa: 'گزارش موازنه و کنترل مصرف مواد',
    titleEn: 'Balance of Material Report',
    codeSuffix: '09-03',
    defaultOrientation: 'landscape',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'رونوشت: دفتر فنی کارگاه، کنترل پروژه، انبار مرکزی',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'itemCode', label: 'کد کالا' },
      { key: 'description', label: 'شرح کالا' },
      { key: 'mtoQty', label: 'برآورد (MTO)' },
      { key: 'receivedQty', label: 'ورودی کل' },
      { key: 'issuedQty', label: 'خروجی / مصرف' },
      { key: 'stockQty', label: 'موجودی انبار' },
      { key: 'variance', label: 'مغایرت / بالانس' },
    ],
    defaultSignatures: [
      { id: 'sig-wh', label: 'انباردار' },
      { id: 'sig-sup', label: 'تأمین تجهیزات' },
      { id: 'sig-tech', label: 'دفتر فنی' },
      { id: 'sig-inst', label: 'واحد نصب' },
    ],
  },
  {
    key: 'stocktake',
    titleFa: 'چک لیست بازدید ادواری انبار',
    titleEn: 'Periodic Warehouse Inspection Checklist',
    codeSuffix: '07-03',
    defaultOrientation: 'landscape',
    defaultHeaderLayout: 'classic_right_logo',
    defaultFooterCopyText: 'این فرم پس از تکمیل توسط سرپرست انبار در پرونده نظارت و کنترل کیفیت بایگانی می‌گردد.',
    defaultColumns: [
      { key: 'row', label: 'ردیف' },
      { key: 'item', label: 'موضوع بازرسی / بند چک‌لیست' },
      { key: 'status', label: 'وضعیت انطباق' },
      { key: 'action', label: 'اقدام اصلاحی / توضیحات' },
    ],
    defaultSignatures: [
      { id: 'sig-wh', label: 'سرپرست / مسئول انبار' },
      { id: 'sig-qc', label: 'نماینده کنترل کیفیت' },
      { id: 'sig-hse', label: 'نماینده HSE' },
    ],
  },
  {
    key: 'storageLabel',
    titleFa: 'برچسب انبارش کالا',
    titleEn: 'Storage Label',
    codeSuffix: '14-01',
    defaultOrientation: 'portrait',
    defaultHeaderLayout: 'classic_right_logo',
    defaultColumns: [
      { key: 'itemCode', label: 'Item Code' },
      { key: 'description', label: 'Description' },
      { key: 'packingNo', label: 'Packing No.' },
      { key: 'location', label: 'Location / Rack' },
    ],
    defaultSignatures: [],
  },
];

export function getBuiltInFormDefinition(key: BuiltInFormKey): BuiltInFormDefinition {
  return BUILT_IN_FORM_DEFINITIONS.find((d) => d.key === key) || BUILT_IN_FORM_DEFINITIONS[0];
}

export function sanitizeEmployerLogo(raw: unknown): EmployerLogoAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmployerLogoAsset>;
  const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl.trim() : '';
  if (!dataUrl.startsWith('data:image/')) return null;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `logo-${Date.now()}`;
  const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : 'لوگوی کارفرما';
  return {
    id,
    label,
    dataUrl,
    isDefault: Boolean(r.isDefault),
  };
}

export function sanitizeFormTemplate(raw: unknown): EmployerFormTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmployerFormTemplate>;
  if (!r.formKey || !BUILT_IN_FORM_DEFINITIONS.some((d) => d.key === r.formKey)) return null;

  const columnOverrides: FormColumnOverride[] | undefined = Array.isArray(r.columnOverrides)
    ? r.columnOverrides
        .filter((c) => c && typeof c.key === 'string' && c.key.trim())
        .map((c) => ({
          key: c.key.trim(),
          label: typeof c.label === 'string' ? c.label.trim() : undefined,
          visible: typeof c.visible === 'boolean' ? c.visible : true,
        }))
    : undefined;

  const extraMetaFields: FormExtraField[] | undefined = Array.isArray(r.extraMetaFields)
    ? r.extraMetaFields
        .filter((f) => f && typeof f.label === 'string' && f.label.trim())
        .map((f, idx) => ({
          id: typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `meta-${idx}`,
          label: f.label.trim(),
          defaultValue: typeof f.defaultValue === 'string' ? f.defaultValue.trim() : '',
        }))
    : undefined;

  const signatures: FormSignatureBox[] | undefined = Array.isArray(r.signatures)
    ? r.signatures
        .filter((s) => s && typeof s.label === 'string' && s.label.trim())
        .map((s, idx) => ({
          id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sig-${idx}`,
          label: s.label.trim(),
          subtitle: typeof s.subtitle === 'string' && s.subtitle.trim() ? s.subtitle.trim() : undefined,
        }))
    : undefined;

  return {
    formKey: r.formKey,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    titleFa: typeof r.titleFa === 'string' && r.titleFa.trim() ? r.titleFa.trim() : undefined,
    titleEn: typeof r.titleEn === 'string' && r.titleEn.trim() ? r.titleEn.trim() : undefined,
    companyTitleOverride:
      typeof r.companyTitleOverride === 'string' && r.companyTitleOverride.trim()
        ? r.companyTitleOverride.trim()
        : undefined,
    imsSubtitleOverride:
      typeof r.imsSubtitleOverride === 'string' && r.imsSubtitleOverride.trim()
        ? r.imsSubtitleOverride.trim()
        : undefined,
    docCode: typeof r.docCode === 'string' && r.docCode.trim() ? r.docCode.trim() : undefined,
    hideDocCode: typeof r.hideDocCode === 'boolean' ? r.hideDocCode : undefined,
    revisionText:
      typeof r.revisionText === 'string' && r.revisionText.trim() ? r.revisionText.trim() : undefined,
    headerLayout: r.headerLayout,
    primaryLogoId:
      typeof r.primaryLogoId === 'string' && r.primaryLogoId.trim() ? r.primaryLogoId.trim() : undefined,
    secondaryLogoId:
      typeof r.secondaryLogoId === 'string' && r.secondaryLogoId.trim() ? r.secondaryLogoId.trim() : undefined,
    accentColor:
      typeof r.accentColor === 'string' && r.accentColor.trim() ? r.accentColor.trim() : undefined,
    orientation: r.orientation === 'landscape' || r.orientation === 'portrait' ? r.orientation : undefined,
    introText: typeof r.introText === 'string' && r.introText.trim() ? r.introText.trim() : undefined,
    footerCopyText:
      typeof r.footerCopyText === 'string' && r.footerCopyText.trim() ? r.footerCopyText.trim() : undefined,
    columnOverrides,
    extraMetaFields,
    signatures,
    showSignatures: typeof r.showSignatures === 'boolean' ? r.showSignatures : undefined,
  };
}

export function sanitizeCustomForm(raw: unknown): CustomEmployerForm | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CustomEmployerForm>;
  const titleFa = typeof r.titleFa === 'string' ? r.titleFa.trim() : '';
  if (!titleFa) return null;
  const now = new Date().toISOString();
  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `cform-${Date.now()}`,
    titleFa,
    titleEn: typeof r.titleEn === 'string' && r.titleEn.trim() ? r.titleEn.trim() : undefined,
    docCode: typeof r.docCode === 'string' && r.docCode.trim() ? r.docCode.trim() : undefined,
    revisionText:
      typeof r.revisionText === 'string' && r.revisionText.trim() ? r.revisionText.trim() : undefined,
    imsSubtitle:
      typeof r.imsSubtitle === 'string' && r.imsSubtitle.trim() ? r.imsSubtitle.trim() : undefined,
    headerLayout: r.headerLayout || 'classic_right_logo',
    primaryLogoId:
      typeof r.primaryLogoId === 'string' && r.primaryLogoId.trim() ? r.primaryLogoId.trim() : undefined,
    secondaryLogoId:
      typeof r.secondaryLogoId === 'string' && r.secondaryLogoId.trim() ? r.secondaryLogoId.trim() : undefined,
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    accentColor:
      typeof r.accentColor === 'string' && r.accentColor.trim() ? r.accentColor.trim() : undefined,
    headerFields: Array.isArray(r.headerFields)
      ? r.headerFields
          .filter((f) => f && typeof f.label === 'string' && f.label.trim())
          .map((f, idx) => ({
            id: typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `cf-${idx}`,
            label: f.label.trim(),
            fieldType:
              f.fieldType === 'date' || f.fieldType === 'number' || f.fieldType === 'checkbox'
                ? f.fieldType
                : 'text',
            dataBinding: f.dataBinding || 'none',
            defaultValue: typeof f.defaultValue === 'string' ? f.defaultValue : '',
          }))
      : [],
    hasTable: r.hasTable !== false,
    tableColumns: Array.isArray(r.tableColumns)
      ? r.tableColumns
          .filter((c) => c && typeof c.label === 'string' && c.label.trim())
          .map((c, idx) => ({
            id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `col-${idx}`,
            label: c.label.trim(),
            widthPercent:
              typeof c.widthPercent === 'number' && Number.isFinite(c.widthPercent)
                ? c.widthPercent
                : undefined,
            dataBinding: c.dataBinding || 'none',
          }))
      : [],
    defaultRowCount:
      typeof r.defaultRowCount === 'number' && r.defaultRowCount >= 1 && r.defaultRowCount <= 30
        ? Math.round(r.defaultRowCount)
        : 8,
    bodyText: typeof r.bodyText === 'string' && r.bodyText.trim() ? r.bodyText.trim() : undefined,
    signatures: Array.isArray(r.signatures)
      ? r.signatures
          .filter((s) => s && typeof s.label === 'string' && s.label.trim())
          .map((s, idx) => ({
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `csig-${idx}`,
            label: s.label.trim(),
            subtitle: typeof s.subtitle === 'string' && s.subtitle.trim() ? s.subtitle.trim() : undefined,
          }))
      : [],
    footerNote: typeof r.footerNote === 'string' && r.footerNote.trim() ? r.footerNote.trim() : undefined,
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : now,
  };
}

export const DEFAULT_UPLOADED_FORM_PRINT_SETTINGS: UploadedFormPrintSettings = {
  orientation: 'portrait',
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  fontSizePt: 10,
  scalePercent: 100,
  showGridlines: true,
  autoRowHeight: true,
  minRowHeightPx: 24,
  fitToPageWidth: true,
};

export function sanitizeUploadedForm(raw: unknown): EmployerUploadedForm | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmployerUploadedForm>;
  const titleFa = typeof r.titleFa === 'string' ? r.titleFa.trim() : '';
  const fileName = typeof r.fileName === 'string' ? r.fileName.trim() : '';
  const fileDataBase64 = typeof r.fileDataBase64 === 'string' ? r.fileDataBase64.trim() : '';
  if (!titleFa || !fileDataBase64) return null;

  const validTypes: UploadedFormFileType[] = ['excel', 'word', 'pdf', 'image'];
  const fileType: UploadedFormFileType = validTypes.includes(r.fileType as UploadedFormFileType)
    ? (r.fileType as UploadedFormFileType)
    : 'excel';

  const validSources: UploadedFormDataSource[] = ['siteEntry', 'general', 'detailed', 'transit', 'manual'];
  const dataSource: UploadedFormDataSource = validSources.includes(r.dataSource as UploadedFormDataSource)
    ? (r.dataSource as UploadedFormDataSource)
    : 'general';

  const psRaw = (r.printSettings || {}) as Partial<UploadedFormPrintSettings>;
  const clamp = (val: unknown, min: number, max: number, fallback: number) =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback;

  const printSettings: UploadedFormPrintSettings = {
    orientation: psRaw.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginTopMm: clamp(psRaw.marginTopMm, 0, 40, 10),
    marginRightMm: clamp(psRaw.marginRightMm, 0, 40, 10),
    marginBottomMm: clamp(psRaw.marginBottomMm, 0, 40, 10),
    marginLeftMm: clamp(psRaw.marginLeftMm, 0, 40, 10),
    fontSizePt: clamp(psRaw.fontSizePt, 6, 20, 10),
    scalePercent: clamp(psRaw.scalePercent, 40, 150, 100),
    showGridlines: typeof psRaw.showGridlines === 'boolean' ? psRaw.showGridlines : true,
    autoRowHeight: typeof psRaw.autoRowHeight === 'boolean' ? psRaw.autoRowHeight : true,
    minRowHeightPx: clamp(psRaw.minRowHeightPx, 16, 120, 24),
    fitToPageWidth: typeof psRaw.fitToPageWidth === 'boolean' ? psRaw.fitToPageWidth : true,
  };

  const tokenBindings: Record<string, string> = {};
  if (r.tokenBindings && typeof r.tokenBindings === 'object') {
    for (const [k, v] of Object.entries(r.tokenBindings)) {
      if (typeof k === 'string' && typeof v === 'string' && k.trim() && v.trim()) {
        tokenBindings[k.trim()] = v.trim();
      }
    }
  }

  const tableColumnBindings: UploadedFormTableColumnBinding[] = Array.isArray(r.tableColumnBindings)
    ? r.tableColumnBindings
        .filter((c) => c && typeof c.colIndex === 'number' && typeof c.fieldKey === 'string')
        .map((c) => ({
          colIndex: c.colIndex,
          headerLabel: typeof c.headerLabel === 'string' ? c.headerLabel.trim() : `Col ${c.colIndex + 1}`,
          fieldKey: c.fieldKey.trim(),
        }))
    : [];

  const now = new Date().toISOString();
  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `uform-${Date.now()}`,
    titleFa,
    titleEn: typeof r.titleEn === 'string' && r.titleEn.trim() ? r.titleEn.trim() : undefined,
    formCode: typeof r.formCode === 'string' && r.formCode.trim() ? r.formCode.trim() : undefined,
    fileName: fileName || `${titleFa}.xlsx`,
    fileType,
    mimeType: typeof r.mimeType === 'string' && r.mimeType.trim() ? r.mimeType.trim() : 'application/octet-stream',
    fileDataBase64,
    sheetName: typeof r.sheetName === 'string' && r.sheetName.trim() ? r.sheetName.trim() : undefined,
    detectedTokens: Array.isArray(r.detectedTokens)
      ? r.detectedTokens.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : undefined,
    tokenBindings: Object.keys(tokenBindings).length > 0 ? tokenBindings : undefined,
    dataSource,
    printSettings,
    tableStartRowIndex:
      typeof r.tableStartRowIndex === 'number' && Number.isFinite(r.tableStartRowIndex) && r.tableStartRowIndex >= 0
        ? Math.floor(r.tableStartRowIndex)
        : undefined,
    tableColumnBindings: tableColumnBindings.length > 0 ? tableColumnBindings : undefined,
    primaryLogoId: typeof r.primaryLogoId === 'string' && r.primaryLogoId.trim() ? r.primaryLogoId.trim() : undefined,
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : undefined,
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : now,
  };
}

export function sanitizeEmployerProfile(raw: unknown): EmployerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<EmployerProfile>;
  const nameFa = typeof r.nameFa === 'string' ? r.nameFa.trim() : '';
  const companyFullName =
    typeof r.companyFullName === 'string' && r.companyFullName.trim()
      ? r.companyFullName.trim()
      : nameFa;
  if (!nameFa && !companyFullName) return null;

  const logos: EmployerLogoAsset[] = Array.isArray(r.logos)
    ? r.logos.map(sanitizeEmployerLogo).filter((x): x is EmployerLogoAsset => Boolean(x))
    : [];
  if (logos.length > 0 && !logos.some((l) => l.isDefault)) {
    logos[0].isDefault = true;
  }

  const formTemplates: Partial<Record<BuiltInFormKey, EmployerFormTemplate>> = {};
  if (r.formTemplates && typeof r.formTemplates === 'object') {
    for (const [k, v] of Object.entries(r.formTemplates)) {
      const sanitized = sanitizeFormTemplate({ ...(v as object), formKey: k });
      if (sanitized) {
        formTemplates[sanitized.formKey] = sanitized;
      }
    }
  }

  const customForms: CustomEmployerForm[] = Array.isArray(r.customForms)
    ? r.customForms.map(sanitizeCustomForm).filter((x): x is CustomEmployerForm => Boolean(x))
    : [];

  const uploadedForms: EmployerUploadedForm[] = Array.isArray(r.uploadedForms)
    ? r.uploadedForms.map(sanitizeUploadedForm).filter((x): x is EmployerUploadedForm => Boolean(x))
    : [];

  const shortName =
    typeof r.shortName === 'string' && r.shortName.trim()
      ? r.shortName.trim()
      : nameFa || companyFullName;
  const now = new Date().toISOString();

  return {
    id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `emp-${Date.now()}`,
    nameFa: nameFa || companyFullName,
    nameEn: typeof r.nameEn === 'string' && r.nameEn.trim() ? r.nameEn.trim() : undefined,
    companyFullName: companyFullName || nameFa,
    companyFullNameEn:
      typeof r.companyFullNameEn === 'string' && r.companyFullNameEn.trim()
        ? r.companyFullNameEn.trim()
        : undefined,
    shortName,
    badgeCode: typeof r.badgeCode === 'string' && r.badgeCode.trim() ? r.badgeCode.trim() : undefined,
    imsSubtitle:
      typeof r.imsSubtitle === 'string' && r.imsSubtitle.trim() ? r.imsSubtitle.trim() : undefined,
    docCodePrefix:
      typeof r.docCodePrefix === 'string' && r.docCodePrefix.trim()
        ? r.docCodePrefix.trim()
        : undefined,
    hideDocCodes: Boolean(r.hideDocCodes),
    securityLabel:
      typeof r.securityLabel === 'string' && r.securityLabel.trim()
        ? r.securityLabel.trim()
        : undefined,
    equipmentSupplyLabel:
      typeof r.equipmentSupplyLabel === 'string' && r.equipmentSupplyLabel.trim()
        ? r.equipmentSupplyLabel.trim()
        : undefined,
    techOfficeLabel:
      typeof r.techOfficeLabel === 'string' && r.techOfficeLabel.trim()
        ? r.techOfficeLabel.trim()
        : undefined,
    installationLabel:
      typeof r.installationLabel === 'string' && r.installationLabel.trim()
        ? r.installationLabel.trim()
        : undefined,
    inspectorLabel:
      typeof r.inspectorLabel === 'string' && r.inspectorLabel.trim()
        ? r.inspectorLabel.trim()
        : undefined,
    address: typeof r.address === 'string' && r.address.trim() ? r.address.trim() : undefined,
    phone: typeof r.phone === 'string' && r.phone.trim() ? r.phone.trim() : undefined,
    contractRef:
      typeof r.contractRef === 'string' && r.contractRef.trim() ? r.contractRef.trim() : undefined,
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : undefined,
    logos,
    formTemplates,
    customForms,
    uploadedForms,
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : now,
  };
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

export function createNeutralEmployerProfile(): ResolvedEmployerProfile {
  return {
    id: '',
    isConfigured: false,
    nameFa: 'بدون کارفرما (حالت خام عمومی)',
    nameEn: 'Unassigned (Neutral Template)',
    companyFullName: '',
    companyFullNameEn: '',
    shortName: 'کارفرما',
    badgeCode: '',
    securityLabel: 'حراست و انتظامات کارگاه',
    equipmentSupplyLabel: 'واحد تأمین تجهیزات',
    techOfficeLabel: 'دفتر فنی و کنترل کیفیت',
    installationLabel: 'واحد نصب و بهره‌برداری',
    inspectorLabel: 'نماینده کارفرما / دستگاه نظارت',
    imsSubtitle: '',
    docCodePrefix: '',
    logos: [],
    formTemplates: {},
    customForms: [],
    uploadedForms: [],
    hideDocCodes: true,
  };
}

export function resolveEmployerProfile(
  project?: Pick<ProjectInfo, 'employerId' | 'employerConfig'> | null,
  employers: EmployerProfile[] = [],
): ResolvedEmployerProfile {
  const empId = (project?.employerId || '').trim();
  const matched = empId ? employers.find((e) => e.id === empId) : undefined;

  if (matched) {
    const shortName = matched.shortName || matched.nameFa;
    return {
      id: matched.id,
      isConfigured: true,
      nameFa: matched.nameFa,
      nameEn: matched.nameEn || matched.nameFa,
      companyFullName: matched.companyFullName || matched.nameFa,
      companyFullNameEn: matched.companyFullNameEn || matched.nameEn || matched.companyFullName,
      shortName,
      badgeCode: matched.badgeCode || shortName,
      securityLabel: matched.securityLabel || 'حراست و انتظامات کارگاه',
      equipmentSupplyLabel: matched.equipmentSupplyLabel || `تأمین تجهیزات ${shortName}`,
      techOfficeLabel: matched.techOfficeLabel || `دفتر فنی ${shortName}`,
      installationLabel: matched.installationLabel || `واحد نصب ${shortName}`,
      inspectorLabel: matched.inspectorLabel || `نماینده ${shortName}`,
      imsSubtitle: matched.imsSubtitle || '',
      docCodePrefix: matched.docCodePrefix || '',
      address: matched.address,
      phone: matched.phone,
      contractRef: matched.contractRef,
      logos: matched.logos || [],
      formTemplates: matched.formTemplates || {},
      customForms: matched.customForms || [],
      uploadedForms: matched.uploadedForms || [],
      hideDocCodes: Boolean(matched.hideDocCodes),
    };
  }

  // Fallback for legacy inline project config if user uploaded one directly on project
  const cfg = project?.employerConfig;
  if (cfg && (cfg.companyFullName || cfg.shortName || cfg.logoDataUrl)) {
    const shortName = cfg.shortName?.trim() || 'کارفرما';
    const logos: EmployerLogoAsset[] = cfg.logoDataUrl
      ? [{ id: 'legacy-logo', label: 'لوگوی کارفرما', dataUrl: cfg.logoDataUrl, isDefault: true }]
      : [];
    return {
      ...createNeutralEmployerProfile(),
      id: empId || 'inline-custom',
      isConfigured: true,
      nameFa: cfg.companyFullName?.trim() || shortName,
      nameEn: cfg.companyFullName?.trim() || shortName,
      companyFullName: cfg.companyFullName?.trim() || shortName,
      companyFullNameEn: cfg.companyFullName?.trim() || shortName,
      shortName,
      badgeCode: shortName,
      imsSubtitle: cfg.imsSubtitle?.trim() || '',
      docCodePrefix: cfg.docCodePrefix?.trim() || '',
      logos,
      hideDocCodes: Boolean(cfg.hideDocCodes),
    };
  }

  return createNeutralEmployerProfile();
}

export function resolveEmployerLogoById(
  employer: ResolvedEmployerProfile,
  logoId?: string,
  fallbackToDefault = true,
): EmployerLogoAsset | undefined {
  if (!employer.logos || employer.logos.length === 0) return undefined;
  if (logoId === '__none__') return undefined;
  if (logoId && logoId !== '__default__') {
    const exact = employer.logos.find((l) => l.id === logoId);
    if (exact) return exact;
  }
  if (!fallbackToDefault) return undefined;
  return employer.logos.find((l) => l.isDefault) || employer.logos[0];
}

export function getEmployerFormCode(
  profile: ResolvedEmployerProfile,
  suffix: string,
  formKey?: BuiltInFormKey,
): string {
  const tpl = formKey ? profile.formTemplates?.[formKey] : undefined;
  if (tpl?.hideDocCode) return '';
  if (tpl?.docCode?.trim()) return tpl.docCode.trim();
  if (profile.hideDocCodes || !profile.docCodePrefix.trim()) return '';
  const cleanSuffix = suffix.replace(/^\/+/, '');
  const prefix = profile.docCodePrefix.trim().replace(/\/+$/, '');
  return `${prefix}/${cleanSuffix}`;
}

export interface ResolvedBuiltInFormDesign {
  definition: BuiltInFormDefinition;
  template?: EmployerFormTemplate;
  companyTitle: string;
  companyTitleEn: string;
  titleFa: string;
  titleEn: string;
  imsSubtitle: string;
  docCode: string;
  revisionText: string;
  headerLayout: FormHeaderLayout;
  primaryLogo?: EmployerLogoAsset;
  secondaryLogo?: EmployerLogoAsset;
  accentColor: string;
  orientation: FormPaperOrientation;
  introText?: string;
  footerCopyText: string;
  extraMetaFields: FormExtraField[];
  showSignatures: boolean;
  signatures: FormSignatureBox[];
  columnLabel: (key: string, defaultLabel?: string) => string;
  isColumnVisible: (key: string) => boolean;
}

export function resolveBuiltInFormDesign(
  employer: ResolvedEmployerProfile,
  formKey: BuiltInFormKey,
): ResolvedBuiltInFormDesign {
  const def = getBuiltInFormDefinition(formKey);
  const tpl = employer.formTemplates?.[formKey];

  const primaryLogo = resolveEmployerLogoById(
    employer,
    tpl?.primaryLogoId || '__default__',
    true,
  );
  const secondaryLogo = resolveEmployerLogoById(
    employer,
    tpl?.secondaryLogoId || '__none__',
    false,
  );

  const colMap = new Map<string, FormColumnOverride>();
  if (tpl?.columnOverrides) {
    for (const c of tpl.columnOverrides) {
      colMap.set(c.key, c);
    }
  }

  return {
    definition: def,
    template: tpl,
    companyTitle: tpl?.companyTitleOverride?.trim() || employer.companyFullName || '',
    companyTitleEn: employer.companyFullNameEn || '',
    titleFa: tpl?.titleFa?.trim() || def.titleFa,
    titleEn: tpl?.titleEn?.trim() || def.titleEn,
    imsSubtitle: tpl?.imsSubtitleOverride?.trim() || employer.imsSubtitle || '',
    docCode: getEmployerFormCode(employer, def.codeSuffix, formKey),
    revisionText: tpl?.revisionText?.trim() || '',
    headerLayout: tpl?.headerLayout || def.defaultHeaderLayout,
    primaryLogo,
    secondaryLogo,
    accentColor: tpl?.accentColor?.trim() || '#000000',
    orientation: tpl?.orientation || def.defaultOrientation,
    introText: tpl?.introText?.trim() || def.defaultIntroText,
    footerCopyText: tpl?.footerCopyText?.trim() || def.defaultFooterCopyText || '',
    extraMetaFields: tpl?.extraMetaFields || [],
    showSignatures: tpl?.showSignatures !== false,
    signatures:
      tpl?.signatures && tpl.signatures.length > 0
        ? tpl.signatures
        : def.defaultSignatures,
    columnLabel: (key: string, defaultLabel?: string) => {
      const ov = colMap.get(key);
      if (ov?.label?.trim()) return ov.label.trim();
      if (defaultLabel) return defaultLabel;
      return def.defaultColumns.find((d) => d.key === key)?.label || key;
    },
    isColumnVisible: (key: string) => {
      const ov = colMap.get(key);
      return ov ? ov.visible !== false : true;
    },
  };
}
