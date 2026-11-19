export type Language = 'fa' | 'en';
export type CalendarMode = 'jalali' | 'gregorian';
export type ThemeMode = 'light' | 'dark';
export type UserRole = 'admin' | 'operator' | 'viewer';

export type EmployerId = string;

export interface EmployerLogoAsset {
  id: string;
  label: string;
  dataUrl: string;
  isDefault?: boolean;
}

export type BuiltInFormKey =
  | 'siteEntry'
  | 'opi'
  | 'opiMinutes'
  | 'mer'
  | 'gcv'
  | 'miv'
  | 'smr'
  | 'substitution'
  | 'balance'
  | 'stocktake'
  | 'storageLabel';

export type FormHeaderLayout =
  | 'classic_right_logo'
  | 'split_dual_logo'
  | 'left_logo'
  | 'minimal_no_logo';

export type FormPaperOrientation = 'portrait' | 'landscape';

export interface FormColumnOverride {
  key: string;
  label?: string;
  visible?: boolean;
}

export interface FormSignatureBox {
  id: string;
  label: string;
  subtitle?: string;
}

export interface FormExtraField {
  id: string;
  label: string;
  defaultValue?: string;
}

export interface EmployerFormTemplate {
  formKey: BuiltInFormKey;
  enabled?: boolean;
  titleFa?: string;
  titleEn?: string;
  companyTitleOverride?: string;
  imsSubtitleOverride?: string;
  docCode?: string;
  hideDocCode?: boolean;
  revisionText?: string;
  headerLayout?: FormHeaderLayout;
  primaryLogoId?: string;
  secondaryLogoId?: string;
  accentColor?: string;
  orientation?: FormPaperOrientation;
  introText?: string;
  footerCopyText?: string;
  columnOverrides?: FormColumnOverride[];
  extraMetaFields?: FormExtraField[];
  signatures?: FormSignatureBox[];
  showSignatures?: boolean;
}

export interface CustomFormFieldDef {
  id: string;
  label: string;
  fieldType: 'text' | 'date' | 'number' | 'checkbox';
  dataBinding?:
    | 'none'
    | 'projectName'
    | 'packingListNo'
    | 'supplier'
    | 'arrivalDate'
    | 'island'
    | 'system'
    | 'unit';
  defaultValue?: string;
}

export interface CustomFormColumnDef {
  id: string;
  label: string;
  widthPercent?: number;
  dataBinding?:
    | 'none'
    | 'rowNo'
    | 'description'
    | 'itemCode'
    | 'packageNo'
    | 'qty'
    | 'unit'
    | 'remarks';
}

export interface CustomEmployerForm {
  id: string;
  titleFa: string;
  titleEn?: string;
  docCode?: string;
  revisionText?: string;
  imsSubtitle?: string;
  headerLayout: FormHeaderLayout;
  primaryLogoId?: string;
  secondaryLogoId?: string;
  orientation: FormPaperOrientation;
  accentColor?: string;
  headerFields: CustomFormFieldDef[];
  hasTable: boolean;
  tableColumns: CustomFormColumnDef[];
  defaultRowCount?: number;
  bodyText?: string;
  signatures: FormSignatureBox[];
  footerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomFormSubmission {
  id: string;
  formId: string;
  formTitle: string;
  docNo: string;
  date: string;
  packingListNo?: string;
  fieldValues: Record<string, string>;
  rows: Array<Record<string, string>>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type UploadedFormFileType = 'excel' | 'word' | 'pdf' | 'image';

export type UploadedFormDataSource =
  | 'siteEntry'
  | 'general'
  | 'detailed'
  | 'transit'
  | 'manual';

export interface UploadedFormPrintSettings {
  orientation: FormPaperOrientation;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  fontSizePt: number;
  scalePercent: number;
  showGridlines: boolean;
  autoRowHeight: boolean;
  minRowHeightPx: number;
  fitToPageWidth: boolean;
}

export interface UploadedFormTableColumnBinding {
  colIndex: number;
  headerLabel: string;
  fieldKey: string;
}

export interface EmployerUploadedForm {
  id: string;
  titleFa: string;
  titleEn?: string;
  formCode?: string;
  fileName: string;
  fileType: UploadedFormFileType;
  mimeType: string;
  fileDataBase64: string;
  sheetName?: string;
  detectedTokens?: string[];
  tokenBindings?: Record<string, string>;
  dataSource: UploadedFormDataSource;
  printSettings: UploadedFormPrintSettings;
  tableStartRowIndex?: number;
  tableColumnBindings?: UploadedFormTableColumnBinding[];
  primaryLogoId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerProfile {
  id: string;
  nameFa: string;
  nameEn?: string;
  companyFullName: string;
  companyFullNameEn?: string;
  shortName: string;
  badgeCode?: string;
  imsSubtitle?: string;
  docCodePrefix?: string;
  hideDocCodes?: boolean;
  securityLabel?: string;
  equipmentSupplyLabel?: string;
  techOfficeLabel?: string;
  installationLabel?: string;
  inspectorLabel?: string;
  address?: string;
  phone?: string;
  contractRef?: string;
  notes?: string;
  logos: EmployerLogoAsset[];
  formTemplates: Partial<Record<BuiltInFormKey, EmployerFormTemplate>>;
  customForms: CustomEmployerForm[];
  uploadedForms?: EmployerUploadedForm[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployerCustomConfig {
  companyFullName?: string;
  shortName?: string;
  docCodePrefix?: string;
  imsSubtitle?: string;
  logoDataUrl?: string;
  hideDocCodes?: boolean;
}

export interface ProjectInfo {
  id: string;
  name: string;
  code?: string;
  employerId?: EmployerId;
  employerConfig?: EmployerCustomConfig;
  createdAt: string;
}

export interface UserPreferences {
  language: Language;
  calendar: CalendarMode;
  theme: ThemeMode;
  eyeComfort: boolean;
  spellCheck?: boolean;
  shortcuts?: Record<string, string>;
}

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
}

export interface PackingStatusMeta {
  packingNo: string;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  closureNote?: string;
}

export interface GeneralEntry {
  id: string;
  rowNo: string; // ردیف (Auto-numbered 1..N)
  arrivalDate: string; // تاریخ ورود (ISO YYYY-MM-DD when parseable)
  releaseNo: string; // Release Note
  releaseDate: string; // تاریخ Release Note (defaults to arrivalDate if Release Note is empty)
  supplier: string; // تامین کننده
  dispatchLocation: string; // محل ارسال
  employerEntryMinutesNo: string; // شماره صورتجلسه ورود کارفرما
  mapnaEntryMinutesNo: string; // شماره صورتجلسه ورود مپنا (Unique)
  packingListNo: string; // شماره پکینگ لیست
  packageNo: string; // شماره نگله
  packageType?: string; // نوع بسته‌بندی
  itemCount?: number | null; // تعداد اقلام نگله
  itemDescription: string; // شرح کالا
  island: string; // جزیره
  system: string; // سیستم
  subSystem: string; // ساب سیستم
  unit: string; // واحد
  grossWeight: number | null; // وزن پکینگ ناخالص
  netWeight: number | null; // وزن پکینگ خالص
  lengthCm: number | null; // طول
  widthCm: number | null; // عرض
  heightCm: number | null; // ارتفاع
  billOfLadingNo: string; // شماره بارنامه
  vehicleNo: string; // شماره خودرو
  weighbridgeWeight: number | null; // وزن باسکول سایت/بارنامه
  freightCost: number | null; // مبلغ کرایه حمل
  opiInvitationNo: string; // شماره دعوتنامه OPI
  opiInvitationDate: string; // تاریخ دعوتنامه OPI
  driverName: string; // نام راننده
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ShortageBackfillRecord {
  id: string;
  qty: number;
  arrivalDate: string; // ISO YYYY-MM-DD
  shipmentNo: string; // Can be duplicate or separate شماره محموله
  packageNo: string;
  note: string;
  recordedBy: string;
  recordedAt: string;
}

export interface DetailedEntry {
  id: string;
  rowNo: string; // ردیف (Auto-numbered 1..N)
  arrivalDate: string; // تاریخ ورود
  supplier: string; // تامین کننده
  origin: string; // مبدا
  shipmentNo: string; // شماره محموله (links to شماره پکینگ لیست in جنرال)
  packageNo: string; // شماره نگله
  itemNo: string; // شماره آیتم (Unique per shipmentNo + packageNo)
  generalDescription: string; // شرح کلی
  description: string; // شرح
  size: string; // سایز
  itemCode: string; // کد کالا
  packingQty: number | null; // مقدار پکینگ
  actualQty: number | null; // مقدار واقعی (Populated via OPI result; null = pending OPI)
  damagedQty: number | null; // آسیب دیده (Populated via OPI result)
  mtoRef: string; // MTO
  repNo: string; // شماره REP
  repStatus: string; // وضعیت REP
  repDescription: string; // توضیحات REP
  countingUnit: string; // واحد شمارش
  island: string; // جزیره
  system: string; // سیستم
  subSystem: string; // ساب سیستم
  unit: string; // واحد
  opiNo: string; // شماره OPI
  opiDate: string; // تاریخ OPI
  merNo: string; // شماره MER
  merStatus: string; // وضعیت MER
  notes: string; // توضیحات
  materialBalanceNo: string; // شماره بالانس متریال
  balanceStatus: string; // وضعیت بالانس
  storageLocation: string; // محل نگهداری
  gcvReceiptNo: string; // شماره رسید GCV-Rahkaran
  receiver: string; // تحویل گیرنده
  gcvDeliveredQty: number | null; // مقدار تحویل شده
  mivContractorNo: string; // شماره MIV پیمانکار
  mivContractorDate: string; // تاریخ MIV پیمانکار
  mivContractorQty: number | null; // تعداد تحویل شده پیمانکار
  smrContractorNo: string; // شماره SMR پیمانکار
  smrContractorDate: string; // تاریخ SMR پیمانکار
  smrContractorQty: number | null; // تعداد SMR پیمانکار
  smrContractorNote: string; // توضیحات SMR پیمانکار
  smrMapnaNo: string; // شماره SMR مپنا
  smrMapnaDate: string; // تاریخ SMR مپنا
  smrMapnaQty: number | null; // تعداد SMR مپنا
  smrMapnaNote: string; // توضیحات SMR مپنا
  mivMapnaNo: string; // شماره MIV مپنا
  mivMapnaDate: string; // تاریخ MIV مپنا
  mivMapnaQty: number | null; // تعداد تحویل شده مپنا
  stocktakeInfo: string; // انبار گردانی / تاریخ تولید
  stocktakeStatus?: string; // وضعیت انبارگردانی
  stocktakeDate?: string; // تاریخ وضعیت انبارگردانی
  itemCategory?: '' | 'special_tools' | 'chemicals' | 'spare_parts'; // نوع قلم: ابزار مخصوص / مواد شیمیایی / لوازم یدکی
  chemicalType?: string; // نوع ماده شیمیایی
  productionDate?: string; // تاریخ تولید ماده شیمیایی (ISO YYYY-MM-DD)
  expirationDate?: string; // تاریخ انقضاء ماده شیمیایی (ISO YYYY-MM-DD)
  shortageBackfills: ShortageBackfillRecord[]; // Later deliveries filling کسری
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface DetailedComputed extends DetailedEntry {
  initialShortage: number;
  backfilledQty: number;
  shortage: number; // کسری باقیمانده
  surplus: number; // اضافی
  effectiveActualQty: number;
  mapnaInventory: number; // موجودی مپنا
  contractorInventory: number; // موجودی پیمانکار
  hasShortage: boolean;
  hasDamaged: boolean;
  opiPending: boolean;
}

export interface TransitEntry {
  id: string;
  rowNo: string;
  arrivalDate: string; // تاریخ ورود
  overallStatus: string; // وضعیت کلی
  inspectionRequest: string; // درخواست بازرسی
  releaseNetNo: string; // رلیزنت - شماره
  releaseNetDate: string; // رلیزنت - تاریخ
  mapnaShippingNotice: string; // اعلام حمل به مپنا
  interimNo: string; // علی الحساب - شماره
  interimDate: string; // علی الحساب - تاریخ
  supplier: string; // تامین کننده
  dispatchLocation: string; // محل ارسال
  packingListNo: string; // شماره پکینگ لیست
  packageNo: string; // شماره نگله
  itemDescription: string; // شرح کالا
  system: string; // سیستم
  subSystem: string; // ساب سیستم
  unit: string; // واحد
  equipmentSupplyCode: string; // کد تامین تجهیزات
  carrierContractor: string; // پیمانکار حمل
  billOfLadingNo: string; // شماره بارنامه
  amount: number | null; // مبلغ
  linkedGeneralPackingNo?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface TrashRecord {
  id: string;
  scope: 'general' | 'detailed' | 'transit';
  deletedAt: string;
  deletedBy: string;
  targetLabel: string;
  data: GeneralEntry | DetailedEntry | TransitEntry;
  linkedTrashDetailedCount?: number;
}

export interface OpiInvitationLineItem {
  itemNo: string;
  packingListNo: string;
  packageNo: string;
  description: string;
  uom: string;
  remarks: string;
}

export interface OpiInvitationRecord {
  id: string;
  invitationNo: string;
  issueDate?: string; // تاریخ صدور دعوتنامه در سربرگ
  date: string; // ISO YYYY-MM-DD (تاریخ بازرسی)
  time: string; // HH:mm
  packingNos: string[];
  location?: string;
  projectName?: string;
  system?: string;
  island?: string;
  unit?: string;
  supplier?: string;
  contractNo?: string;
  purchasePackageNo?: string;
  items?: OpiInvitationLineItem[];
  installerContractor?: string;
  supplierRep?: string;
  equipmentSupply?: string;
  employerRep?: string;
  notes?: string;
  status: 'issued' | 'completed';
  createdAt: string;
  createdBy: string;
}

export interface SiteEntryLineItem {
  description: string;
  packingListNo: string;
  packageNo: string;
  dimensions: string;
  qty: string;
  unit: string;
  netWeight: string;
  grossWeight: string;
  remarks: string;
}

export interface SiteEntryMinutesRecord {
  id: string;
  minutesNo: string; // Arrival Notice No / شماره صورتجلسه
  releaseNoteNo?: string; // Release Note No
  projectName?: string; // پروژه
  entryType?: 'permanent' | 'temporary'; // ورود دائم / ورود موقت
  goodsUsage?: 'project' | 'site_equip' | 'general'; // کاربرد کالا
  contractNo?: string; // شماره قرارداد
  date: string; // ISO YYYY-MM-DD
  arrivalDate?: string; // تاریخ ورود ISO YYYY-MM-DD
  packingListNos: string[];
  supplier?: string; // نام پیمانکار / درخواست کننده
  unit?: string; // واحد
  system?: string; // سیستم
  island?: string; // جزیره
  origin?: string; // مبدا
  carrierCompany?: string; // شرکت حمل کننده
  trafficLocation?: string; // محل تردد / تخلیه و بارگیری
  vehicleType?: string; // وسیله نقلیه
  driverName?: string;
  vehicleNo?: string;
  waybillNo?: string;
  items?: SiteEntryLineItem[];
  warehouseKeeper?: string; // انباردار / پیمانکار
  contractorManager?: string; // مدیر پروژه / سرپرست کارگاه پیمانکار
  mapnaSecurity?: string; // انتظامات مپنا
  qcChecked?: boolean; // تیک QC / دفتر فنی
  qcTechOffice?: string; // QC / دفتر فنی
  hseChecked?: boolean; // تیک HSE
  hseOfficer?: string; // HSE
  equipmentSupply?: string; // تامین تجهیزات
  employerRep?: string; // نماینده کارفرما / نماینده دستگاه نظارت
  mapnaRep?: string; // legacy alias kept for backwards compatibility
  conditionStatus: 'healthy' | 'shortage_suspected' | 'damaged_apparent';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface OpiMinutesRecord {
  id: string;
  minutesNo: string;
  invitationNo?: string;
  date: string; // ISO YYYY-MM-DD
  time?: string; // ساعت
  packingListNo: string;
  packageNos: string[];
  projectName?: string;
  supplier?: string;
  system?: string;
  island?: string;
  unit?: string;
  contractNo?: string;
  purchasePackageNo?: string;
  items?: OpiInvitationLineItem[];
  merNo?: string;
  location?: string;
  storekeeper?: string;
  mapnaInspector?: string;
  sellerRep?: string;
  employerInspector?: string;
  contractorInspector?: string;
  qcInspector?: string;
  resultStatus: 'compliant' | 'has_discrepancy';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface OsdrReportItem {
  detailedId: string;
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  itemCode: string;
  countingUnit: string;
  packingQty: number;
  actualQty: number;
  shortage: number;
  surplus: number;
  damagedQty: number;
  discrepancyType: 'shortage' | 'damaged' | 'surplus' | 'shortage_and_damaged';
  remarks?: string;
}

export interface OsdrReportRecord {
  id: string;
  reportNo: string;
  date: string; // ISO YYYY-MM-DD
  opiMinutesNo?: string;
  packingListNo: string;
  supplier?: string;
  items: OsdrReportItem[];
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface SubstitutionRecord {
  id: string;
  docNo: string;
  date: string; // ISO YYYY-MM-DD
  detailedId: string;
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  projectName?: string;
  contractNo?: string;
  system?: string;
  island?: string;
  unit?: string;
  supplier?: string;
  supplyUrgency?: string;
  installerContractor?: string;
  mivNo?: string;
  merNcrNo?: string;
  originalDescription: string;
  originalItemCode: string;
  originalDrawingNo?: string;
  originalRemarks?: string;
  substitutePackageNo?: string;
  substituteDescription: string;
  substituteItemCode: string;
  substituteSize?: string;
  substituteDrawingNo?: string;
  substituteRemarks?: string;
  qty: number;
  countingUnit: string;
  reason: string;
  supplierNotes?: string;
  reprocureBy?: string;
  costBorneBy?: string;
  approvedBy?: string;
  mapnaRep?: string;
  installerSignatory?: string;
  supplierSignatory?: string;
  status: 'pending' | 'approved' | 'executed';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface DocumentLineItem {
  detailedId: string;
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  qty: number;
  technicalInfo?: string;
  tagNo?: string;
  codeNo?: string;
  location?: string;
  requestedQty?: number;
  uom?: string;
  opiNo?: string;
  returnReason?: string;
  remark?: string;
}

export interface GcvDocumentRecord {
  id: string;
  receiptNo: string;
  date: string;
  receiver: string;
  projectName?: string;
  purchaseRequestNo?: string;
  supplier?: string;
  buyerName?: string;
  purchasePackageNo?: string;
  releaseNoteNo?: string;
  purchaseBy?: 'tehran_proc' | 'site_admin' | 'contractor_supplier';
  islandSystem?: string;
  waybillNo?: string;
  storekeeper?: string;
  receiverManager?: string;
  equipmentSupply?: string;
  mapnaSiteManager?: string;
  notes?: string;
  items: DocumentLineItem[];
  createdAt: string;
  createdBy: string;
}

export type MivDocType = 'miv_contractor' | 'smr_contractor' | 'smr_mapna' | 'miv_mapna';

export interface MivDocumentRecord {
  id: string;
  docType: MivDocType;
  docNo: string;
  date: string;
  party?: string;
  projectName?: string;
  contractNo?: string;
  purchasePackageNo?: string;
  supplier?: string;
  releaseNoteNo?: string;
  islandSystem?: string;
  unit?: string;
  receiptNo?: string;
  storekeeper?: string;
  equipmentSupply?: string;
  techOffice?: string;
  installationDept?: string;
  qcInspector?: string;
  installerRep?: string;
  requester?: string;
  receiver?: string;
  notes?: string;
  items: DocumentLineItem[];
  createdAt: string;
  createdBy: string;
}

export interface MaterialEstimateRecord {
  id: string;
  mtoCode: string;
  generalDescription: string;
  description: string;
  itemCode: string;
  size: string;
  countingUnit: string;
  estimatedQty: number;
  island: string;
  system: string;
  subSystem: string;
  unit: string;
  priority: 'normal' | 'critical';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PeriodicInspectionAnswer {
  questionKey: string;
  status: '+' | '-' | '';
  remarks: string;
}

export interface PeriodicInspectionRecord {
  id: string;
  projectName: string;
  inspectionDate: string;
  supervisorName: string;
  inspectorsSignatory: string;
  siteSupervisorSignatory: string;
  projectManagerSignatory: string;
  copyTo: string;
  answers: PeriodicInspectionAnswer[];
  createdAt: string;
  createdBy: string;
}

export type CategoryGroupKey =
  | 'island'
  | 'system'
  | 'subSystem'
  | 'unit'
  | 'supplier'
  | 'dispatchLocation'
  | 'origin'
  | 'storageLocation'
  | 'carrierContractor'
  | 'countingUnit'
  | 'packageType'
  | 'generalDescription'
  | 'stocktakeStatus'
  | 'transitStatus'
  | 'receiver'
  | 'merStatus'
  | 'repStatus'
  | 'balanceStatus'
  | 'chemicalType';

export interface CategoryStore {
  island: string[];
  system: string[];
  subSystem: string[];
  unit: string[];
  supplier: string[];
  dispatchLocation: string[];
  origin: string[];
  storageLocation: string[];
  carrierContractor: string[];
  countingUnit: string[];
  packageType: string[];
  generalDescription: string[];
  stocktakeStatus: string[];
  transitStatus: string[];
  receiver: string[];
  merStatus: string[];
  repStatus: string[];
  balanceStatus: string[];
  chemicalType: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO UTC timestamp
  userId: string;
  username: string;
  userFullName: string;
  role: UserRole;
  action: string;
  scope:
    | 'auth'
    | 'general'
    | 'detailed'
    | 'transit'
    | 'packing'
    | 'siteEntry'
    | 'opi'
    | 'opiMinutes'
    | 'osdr'
    | 'gcv'
    | 'miv'
    | 'smr'
    | 'substitution'
    | 'estimation'
    | 'balance'
    | 'stocktake'
    | 'periodicInspection'
    | 'customForm'
    | 'employer'
    | 'trash'
    | 'category'
    | 'import'
    | 'backup'
    | 'history'
    | 'user';
  targetId: string;
  summary: string;
}

export type ImportRejectionReasonCode =
  | 'missing_required'
  | 'duplicate_db'
  | 'duplicate_in_file'
  | 'invalid_data';

export interface ImportRejectedRecord {
  id: string;
  scope: 'general' | 'detailed' | 'transit';
  sourceRowIndex?: number;
  reasonCode: ImportRejectionReasonCode;
  reasonFa: string;
  reasonEn: string;
  existingSummary?: string;
  canForceReplace?: boolean;
  canForceAdd?: boolean;
  canEditAndRetry?: boolean;
  rawRow?: string[];
  parsedRow: Record<string, unknown>;
}

export interface ExpiringChemicalNotice {
  id: string;
  shipmentNo: string;
  packageNo: string;
  itemNo: string;
  description: string;
  chemicalType: string;
  productionDate: string;
  expirationDate: string;
  daysRemaining: number;
}

export interface IslandPackingCount {
  island: string;
  packingCount: number;
  rowCount: number;
}

export interface SelectionFormulaSummary {
  count: number;
  grossWeightSum: number;
  netWeightSum: number;
  weighbridgeWeightSum: number;
  freightCostSum: number;
  packingQtySum: number;
  actualQtySum: number;
  effectiveActualQtySum: number;
  shortageSum: number;
  surplusSum: number;
  damagedQtySum: number;
  gcvDeliveredSum: number;
  mapnaInventorySum: number;
  contractorInventorySum: number;
  mivContractorQtySum: number;
  smrContractorQtySum: number;
  smrMapnaQtySum: number;
  mivMapnaQtySum: number;
  transitAmountSum: number;
  uniquePackingsCount?: number;
  transitArrivedPackingsCount?: number;
  transitShippingPackingsCount?: number;
  transitInspectionPackingsCount?: number;
  packingsByIsland?: IslandPackingCount[];
  openMerCount?: number;
  openRepCount?: number;
  shortageOrDamagedCount?: number;
  expiringChemicals?: ExpiringChemicalNotice[];
}

export interface DatabaseSnapshot {
  version: number;
  exportedAt: string;
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  packingMeta: Record<string, PackingStatusMeta>;
  categories: CategoryStore;
  auditLogs: AuditLogEntry[];
  trash?: TrashRecord[];
  opiInvitations?: OpiInvitationRecord[];
  siteEntryMinutes?: SiteEntryMinutesRecord[];
  opiMinutes?: OpiMinutesRecord[];
  osdrReports?: OsdrReportRecord[];
  substitutions?: SubstitutionRecord[];
  gcvDocuments?: GcvDocumentRecord[];
  mivDocuments?: MivDocumentRecord[];
  materialEstimates?: MaterialEstimateRecord[];
  periodicInspections?: PeriodicInspectionRecord[];
  customFormSubmissions?: CustomFormSubmission[];
}

export type PurgeableSectionKey =
  | 'general'
  | 'detailed'
  | 'transit'
  | 'siteEntryMinutes'
  | 'opiInvitations'
  | 'opiMinutes'
  | 'osdrReports'
  | 'gcvDocuments'
  | 'mivDocuments'
  | 'substitutions'
  | 'materialEstimates'
  | 'periodicInspections'
  | 'customFormSubmissions'
  | 'categories'
  | 'trash'
  | 'auditLogs';

export interface DatabaseSectionSummaryItem {
  key: PurgeableSectionKey;
  count: number;
}

export interface DatabasePurgeResponse {
  ok: boolean;
  purgedSections: PurgeableSectionKey[];
  deletedCounts: Partial<Record<PurgeableSectionKey, number>>;
  totalDeleted: number;
}

