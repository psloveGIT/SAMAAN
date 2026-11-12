export type Language = 'fa' | 'en';
export type CalendarMode = 'jalali' | 'gregorian';
export type ThemeMode = 'light' | 'dark';
export type UserRole = 'admin' | 'operator' | 'viewer';

export interface UserPreferences {
  language: Language;
  calendar: CalendarMode;
  theme: ThemeMode;
  eyeComfort: boolean;
}

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  preferences: UserPreferences;
  createdAt: string;
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
  rowNo: string; // ردیف (Unique)
  arrivalDate: string; // تاریخ ورود (ISO YYYY-MM-DD when parseable)
  releaseNo: string; // شماره رلیز
  releaseDate: string; // تاریخ
  supplier: string; // تامین کننده
  dispatchLocation: string; // محل ارسال
  employerEntryMinutesNo: string; // شماره صورتجلسه ورود کارفرما
  mapnaEntryMinutesNo: string; // شماره صورتجلسه ورود مپنا
  packingListNo: string; // شماره پکینگ لیست
  packageNo: string; // شماره نگله
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
  rowNo: string; // ردیف (Unique)
  arrivalDate: string; // تاریخ ورود
  supplier: string; // تامین کننده
  origin: string; // مبدا
  shipmentNo: string; // شماره محموله (links to شماره پکینگ لیست in جنرال)
  packageNo: string; // شماره نگله
  itemNo: string; // شماره آیتم
  generalDescription: string; // شرح کلی
  description: string; // شرح
  size: string; // سایز
  itemCode: string; // کد کالا (کد راهکاران removed per user request)
  packingQty: number | null; // مقدار پکینگ
  actualQty: number | null; // مقدار واقعی
  damagedQty: number | null; // آسیب دیده (added per user request)
  mtoRef: string; // MTO (added per user request)
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
  balanceStatus: string; // وضعیت بالانس (kept adjacent to شماره بالانس متریال)
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
}

export interface TransitEntry {
  id: string;
  rowNo: string;
  arrivalDate: string; // تاریخ ورود
  overallStatus: string; // وضعیت کلی ('در دست بازرسی' | 'در دست ارسال' | 'پایان' | 'رسیده' | ...)
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

export type CategoryGroupKey =
  | 'island'
  | 'system'
  | 'subSystem'
  | 'unit'
  | 'supplier'
  | 'dispatchLocation'
  | 'storageLocation'
  | 'carrierContractor';

export interface CategoryStore {
  island: string[];
  system: string[];
  subSystem: string[];
  unit: string[];
  supplier: string[];
  dispatchLocation: string[];
  storageLocation: string[];
  carrierContractor: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO UTC timestamp
  userId: string;
  username: string;
  userFullName: string;
  role: UserRole;
  action: string;
  scope: 'auth' | 'general' | 'detailed' | 'transit' | 'packing' | 'category' | 'import' | 'backup' | 'user';
  targetId: string;
  summary: string;
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
}
