import { extractChemicalDatesFromTexts } from '../shared/chemicalDates.ts';
import {
  detectCsvScope,
  inspectMatrixColumns,
  makeId,
  parseCsvMatrix,
  parseDetailedCsv,
  parseGeneralCsv,
  parseTransitCsv,
} from '../shared/csvParser.ts';
import type { ImportScope } from '../shared/csvParser.ts';
import {
  computeDetailedEntry,
  computeSelectionFormulaSummary,
  getExpiringChemicals,
  isMerOpen,
  isRepOpen,
  normalizeIslandBucket,
  roundQty,
  toNum,
} from '../shared/formulas.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from '../shared/generalDescription.ts';
import { buildYearMonths, getMonthKeyFromIso, normalizeDigits } from '../shared/jalali.ts';
import {
  collectUniquePackings,
  queryOpsDetailed,
  queryOpsGeneral,
  queryOpsTransit,
  slimDetailedForOps,
} from '../shared/opsProjection.ts';
import {
  DEFAULT_TRANSIT_STATUSES,
  getTransitStatusOptions,
  inferItemClassification,
  normalizeCountingUnitToFa,
  normalizeTransitStatus,
} from '../shared/normalizers.ts';
import {
  answerLocalWarehouseQuestion,
  classifyItemLocally,
  runLocalWarehouseAnalysis,
} from '../shared/localAiEngine.ts';
import { sortDetailedEntries, sortGeneralEntries, sortTransitEntries } from '../shared/sorting.ts';
import {
  matchesCustomFilters,
  matchesMultiPacking,
  parseCustomFiltersParam,
  parsePackingNosParam,
} from '../shared/customFilters.ts';
import { extractEquipmentOffline } from '../shared/smartExtractor.ts';
import { getLocalVersionPayload } from '../shared/appVersion.ts';
import { analyzeImportDelta, hasRecordMeaningfulChanges } from '../shared/importDelta.ts';
import {
  applyCategoryDelete,
  applyCategoryRename,
  computeCategoryCounts,
  registerCategoryTokens,
  sanitizeCategoryStore,
} from '../shared/categoryCascade.ts';
import {
  commitAutoWorkbook,
  commitOperationalFormImport,
  detectExtendedScope,
  EXTENDED_SCOPE_META,
  isOperationalScope,
  previewAutoWorkbook,
  previewOperationalFormImport,
  type AutoWorkbookSheetInput,
  type ExtendedImportScope,
} from '../shared/operationalFormImport.ts';
import {
  captureAutoUndoState,
  commitAutoUndoDiff,
  resolveAutoUndoSpec,
  WarehouseHistoryManager,
  type HistoryChange,
} from '../shared/undoHistory.ts';
import {
  buildActiveDupKeySets,
  buildTrashEntryDupKey,
  isTrashRestoreDuplicate,
} from '../shared/trashRestore.ts';
import {
  buildDetailedDupKey,
  buildGeneralDupKey,
  buildTransitDupKey,
  buildTrashLinkedDetailedCounts,
  checkDateRangeMulti,
  collectDistinctColumnValues,
  compileColFilters,
  createGeneralDetailedLinker,
  matchesColFilters,
  matchesCompiledColFilters,
  matchesPackagePartial,
  matchesPreparedPackage,
  normDupPart,
  parseColFiltersParam,
  preparePackageInfo,
  projectTrashRowForQuery,
  resolveSiteEntryArrivalAndRelease,
  sortRowsByColumn,
} from '../shared/tableQuery.ts';
import { isValidDigitsOnly } from '../shared/validation.ts';
import {
  DEFAULT_EMPLOYER_ID,
  ensureDefaultEmployers,
  isBuiltInEmployerId,
  sanitizeEmployerConfig,
  sanitizeEmployerProfile,
} from '../shared/employers.ts';
import type {
  AuditLogEntry,
  CalendarMode,
  CategoryGroupKey,
  CategoryStore,
  CustomFormSubmission,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  DocumentLineItem,
  EmployerCustomConfig,
  EmployerId,
  EmployerProfile,
  GcvDocumentRecord,
  GeneralEntry,
  ImportRejectedRecord,
  Language,
  MaterialEstimateRecord,
  MivDocType,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
  PackingStatusMeta,
  PeriodicInspectionRecord,
  ProjectInfo,
  PurgeableSectionKey,
  DatabaseSectionSummaryItem,
  ShortageBackfillRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
  TrashRecord,
  UserAccount,
  UserPreferences,
  UserRole,
} from '../shared/types.ts';

interface StaticUser extends UserAccount {
  passwordHash: string;
}

interface StaticDatabase {
  version: number;
  currentUserId: string | null;
  users: StaticUser[];
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  packingMeta: Record<string, PackingStatusMeta>;
  categories: CategoryStore;
  auditLogs: AuditLogEntry[];
  trash: TrashRecord[];
  opiInvitations: OpiInvitationRecord[];
  siteEntryMinutes: SiteEntryMinutesRecord[];
  opiMinutes: OpiMinutesRecord[];
  osdrReports: OsdrReportRecord[];
  substitutions: SubstitutionRecord[];
  gcvDocuments: GcvDocumentRecord[];
  mivDocuments: MivDocumentRecord[];
  materialEstimates: MaterialEstimateRecord[];
  periodicInspections: PeriodicInspectionRecord[];
  customFormSubmissions: CustomFormSubmission[];
}

const DB_NAME = 'samaan_static_db';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const RECORD_KEY = 'primary';
const PROJECTS_REGISTRY_KEY = 'projects_registry';
const EMPLOYERS_REGISTRY_KEY = 'employers_registry';
const DEFAULT_PROJECT_ID = 'default';

const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'fa',
  calendar: 'jalali',
  theme: 'light',
  eyeComfort: false,
};

function createEmptyCategories(): CategoryStore {
  return {
    island: [],
    system: [],
    subSystem: [],
    unit: [],
    supplier: [],
    dispatchLocation: [],
    origin: [],
    storageLocation: [],
    carrierContractor: [],
    countingUnit: [],
    packageType: [],
    generalDescription: [],
    stocktakeStatus: [],
    transitStatus: [...DEFAULT_TRANSIT_STATUSES],
    receiver: [],
    merStatus: [],
    repStatus: [],
    balanceStatus: [],
    chemicalType: [],
  };
}

function createEmptyDb(): StaticDatabase {
  return {
    version: 3,
    currentUserId: null,
    users: [],
    general: [],
    detailed: [],
    transit: [],
    packingMeta: {},
    categories: createEmptyCategories(),
    auditLogs: [],
    trash: [],
    opiInvitations: [],
    siteEntryMinutes: [],
    opiMinutes: [],
    osdrReports: [],
    substitutions: [],
    gcvDocuments: [],
    mivDocuments: [],
    materialEstimates: [],
    periodicInspections: [],
    customFormSubmissions: [],
  };
}

const cachedDbs = new Map<string, StaticDatabase>();
let cachedProjects: ProjectInfo[] | null = null;
let cachedEmployers: EmployerProfile[] | null = null;
let idbUnavailable = false;

function openDb(): Promise<IDBDatabase | null> {
  if (idbUnavailable || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null, markUnavailable = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (markUnavailable) idbUnavailable = true;
      resolve(db);
    };
    const timer = setTimeout(() => {
      finish(null, true);
    }, 3500);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch {
          // Ignore upgrade error
        }
      };
      req.onblocked = () => finish(null, false);
      req.onsuccess = () => finish(req.result, false);
      req.onerror = () => finish(null, true);
    } catch {
      finish(null, true);
    }
  });
}

function idbGet<T>(idb: IDBDatabase | null, key: string): Promise<T | null> {
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        idb.close();
      } catch {
        // ignore
      }
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), 3000);
    try {
      const tx = idb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => finish((req.result as T) ?? null);
      req.onerror = () => finish(null);
      tx.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

function idbPut(idb: IDBDatabase | null, key: string, value: unknown): Promise<void> {
  if (!idb) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        idb.close();
      } catch {
        // ignore
      }
      resolve();
    };
    const timer = setTimeout(finish, 3500);
    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}

function idbDelete(idb: IDBDatabase | null, key: string): Promise<void> {
  if (!idb) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        idb.close();
      } catch {
        // ignore
      }
      resolve();
    };
    const timer = setTimeout(finish, 3000);
    try {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}

function projectRecordKey(projectId: string): string {
  return projectId === DEFAULT_PROJECT_ID ? RECORD_KEY : `project:${projectId}`;
}

async function getProjects(): Promise<ProjectInfo[]> {
  if (cachedProjects) return cachedProjects;
  const idb = await openDb();
  const loaded = await idbGet<ProjectInfo[]>(idb, PROJECTS_REGISTRY_KEY);
  if (Array.isArray(loaded) && loaded.length > 0) {
    cachedProjects = loaded.map((p) => ({
      ...p,
      contractRef: typeof p.contractRef === 'string' && p.contractRef.trim() ? p.contractRef.trim() : undefined,
      employerId: typeof p.employerId === 'string' && p.employerId.trim() ? p.employerId.trim() : DEFAULT_EMPLOYER_ID,
      employerConfig: sanitizeEmployerConfig(p.employerConfig),
    }));
    if (!cachedProjects.some((p) => p.id === DEFAULT_PROJECT_ID)) {
      cachedProjects.unshift({
        id: DEFAULT_PROJECT_ID,
        name: 'پروژه پیش‌فرض',
        code: '',
        contractRef: undefined,
        employerId: DEFAULT_EMPLOYER_ID,
        createdAt: new Date().toISOString(),
      });
    }
    return cachedProjects;
  }
  cachedProjects = [
    {
      id: DEFAULT_PROJECT_ID,
      name: 'پروژه پیش‌فرض',
      code: '',
      contractRef: undefined,
      employerId: DEFAULT_EMPLOYER_ID,
      createdAt: new Date().toISOString(),
    },
  ];
  await saveProjects(cachedProjects);
  return cachedProjects;
}

async function saveProjects(list: ProjectInfo[]): Promise<void> {
  cachedProjects = list;
  const idb = await openDb();
  await idbPut(idb, PROJECTS_REGISTRY_KEY, list);
}

async function getEmployers(): Promise<EmployerProfile[]> {
  if (cachedEmployers) return cachedEmployers;
  const idb = await openDb();
  const loaded = await idbGet<EmployerProfile[]>(idb, EMPLOYERS_REGISTRY_KEY);
  const sanitized = Array.isArray(loaded)
    ? loaded.map(sanitizeEmployerProfile).filter((e): e is EmployerProfile => Boolean(e))
    : [];
  cachedEmployers = ensureDefaultEmployers(sanitized);
  if (!Array.isArray(loaded) || sanitized.length !== cachedEmployers.length) {
    await saveEmployers(cachedEmployers);
  }
  return cachedEmployers;
}

async function saveEmployers(list: EmployerProfile[]): Promise<void> {
  cachedEmployers = ensureDefaultEmployers(list);
  const idb = await openDb();
  await idbPut(idb, EMPLOYERS_REGISTRY_KEY, cachedEmployers);
}

async function resolveProjectId(rawId?: string): Promise<string> {
  const list = await getProjects();
  const clean = (rawId || '').trim();
  if (clean && list.some((p) => p.id === clean)) return clean;
  return DEFAULT_PROJECT_ID;
}

function renumberScope(db: StaticDatabase, scope: 'general' | 'detailed' | 'transit') {
  if (scope === 'general') {
    db.general = sortGeneralEntries(db.general);
    for (let i = 0; i < db.general.length; i += 1) {
      db.general[i].rowNo = String(i + 1);
    }
    return;
  }
  if (scope === 'detailed') {
    db.detailed = sortDetailedEntries(db.detailed);
    for (let i = 0; i < db.detailed.length; i += 1) {
      db.detailed[i].rowNo = String(i + 1);
    }
    return;
  }
  db.transit = sortTransitEntries(db.transit);
  for (let i = 0; i < db.transit.length; i += 1) {
    db.transit[i].rowNo = String(i + 1);
  }
}

async function getDb(projectId = DEFAULT_PROJECT_ID): Promise<StaticDatabase> {
  const existing = cachedDbs.get(projectId);
  if (existing) return existing;
  const idb = await openDb();
  const key = projectRecordKey(projectId);
  const loaded = await idbGet<Partial<StaticDatabase>>(idb, key);
  const empty = createEmptyDb();
  const mergedCats: CategoryStore = loaded
    ? {
        ...createEmptyCategories(),
        ...(loaded.categories || {}),
        transitStatus: getTransitStatusOptions(loaded.categories?.transitStatus),
      }
    : createEmptyCategories();
  const hydrated: StaticDatabase = loaded
    ? {
        ...empty,
        ...loaded,
        detailed: (Array.isArray(loaded.detailed) ? loaded.detailed : []).map((d) => ({
          ...d,
          countingUnit: normalizeCountingUnitToFa(d.countingUnit),
        })),
        transit: (Array.isArray(loaded.transit) ? loaded.transit : []).map((t) => ({
          ...t,
          overallStatus: normalizeTransitStatus(t.overallStatus, mergedCats.transitStatus),
        })),
        categories: mergedCats,
        trash: Array.isArray(loaded.trash) ? loaded.trash : [],
        opiInvitations: Array.isArray(loaded.opiInvitations) ? loaded.opiInvitations : [],
        siteEntryMinutes: Array.isArray(loaded.siteEntryMinutes) ? loaded.siteEntryMinutes : [],
        opiMinutes: Array.isArray(loaded.opiMinutes) ? loaded.opiMinutes : [],
        osdrReports: Array.isArray(loaded.osdrReports) ? loaded.osdrReports : [],
        substitutions: Array.isArray(loaded.substitutions) ? loaded.substitutions : [],
        gcvDocuments: Array.isArray(loaded.gcvDocuments) ? loaded.gcvDocuments : [],
        mivDocuments: Array.isArray(loaded.mivDocuments) ? loaded.mivDocuments : [],
        materialEstimates: Array.isArray(loaded.materialEstimates) ? loaded.materialEstimates : [],
        periodicInspections: Array.isArray(loaded.periodicInspections) ? loaded.periodicInspections : [],
        customFormSubmissions: Array.isArray(loaded.customFormSubmissions) ? loaded.customFormSubmissions : [],
      }
    : empty;
  renumberScope(hydrated, 'general');
  renumberScope(hydrated, 'detailed');
  renumberScope(hydrated, 'transit');
  rebuildCategories(hydrated);
  cachedDbs.set(projectId, hydrated);
  return hydrated;
}

async function saveDb(db: StaticDatabase, projectId = DEFAULT_PROJECT_ID): Promise<void> {
  cachedDbs.set(projectId, db);
  const idb = await openDb();
  await idbPut(idb, projectRecordKey(projectId), db);
}

async function deleteProjectDb(projectId: string): Promise<void> {
  if (projectId === DEFAULT_PROJECT_ID) return;
  cachedDbs.delete(projectId);
  const idb = await openDb();
  await idbDelete(idb, projectRecordKey(projectId));
}

const OFFLINE_SESSION_CACHE_KEY = 'samaan_offline_session_user_v1';

function readCachedOfflineSessionUser(): UserAccount | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OFFLINE_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserAccount>;
    if (parsed && typeof parsed.id === 'string' && typeof parsed.username === 'string' && parsed.role) {
      return parsed as UserAccount;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function clearOfflineSessionUser(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(OFFLINE_SESSION_CACHE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function syncOfflineSessionUser(
  user: UserAccount | null,
  projectId = DEFAULT_PROJECT_ID,
): Promise<void> {
  if (!user) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFLINE_SESSION_CACHE_KEY, JSON.stringify(user));
    }
  } catch {
    // Ignore storage quota errors
  }
  try {
    const resolved = await resolveProjectId(projectId);
    const db = await getDb(resolved);
    let existing = db.users.find(
      (u) => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase(),
    );
    if (!existing) {
      existing = {
        ...user,
        active: true,
        passwordHash: '',
        preferences: user.preferences || { ...DEFAULT_PREFERENCES },
        createdAt: user.createdAt || new Date().toISOString(),
      };
      db.users.push(existing);
    } else {
      existing.fullName = user.fullName;
      existing.role = user.role;
      existing.active = true;
      if (user.preferences) existing.preferences = { ...existing.preferences, ...user.preferences };
    }
    db.currentUserId = existing.id;
    await saveDb(db, resolved);
  } catch {
    // Best-effort offline session sync
  }
}

async function hashBrowserPassword(password: string, existingSalt?: string): Promise<string> {
  const salt = existingSalt || makeId().replace(/-/g, '').slice(0, 16);
  const enc = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${salt}:${hex}`;
}

async function verifyBrowserPassword(password: string, stored: string): Promise<boolean> {
  const [salt] = stored.split(':');
  if (!salt) return false;
  const attempt = await hashBrowserPassword(password, salt);
  return attempt === stored;
}

function sanitizeUser(u: StaticUser): UserAccount {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    active: u.active,
    preferences: u.preferences,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    mustChangePassword: Boolean(u.mustChangePassword),
  };
}

function normKey(v: string | undefined | null): string {
  return (v || '').trim();
}

function appendUniqueRef(existing: string, nextRef: string): string {
  const cleanExisting = normKey(existing);
  const cleanNext = normKey(nextRef);
  if (!cleanNext) return cleanExisting;
  if (!cleanExisting) return cleanNext;
  const parts = cleanExisting.split(',').map((s) => s.trim());
  if (parts.includes(cleanNext)) return cleanExisting;
  return `${cleanExisting}, ${cleanNext}`;
}

function removeRefToken(existing: string, token: string): string {
  const cleanExisting = normKey(existing);
  const cleanToken = normKey(token);
  if (!cleanExisting || !cleanToken) return cleanExisting;
  const parts = cleanExisting
    .split(/[,،|]+/)
    .map((s) => normKey(s))
    .filter((s) => s && s !== cleanToken);
  return Array.from(new Set(parts)).join(', ');
}

function registerCategoryValue(db: StaticDatabase, group: CategoryGroupKey, rawVal: string | undefined | null) {
  registerCategoryTokens(db.categories, group, rawVal);
}

function rebuildCategories(db: StaticDatabase) {
  for (const g of db.general) {
    registerCategoryValue(db, 'island', g.island);
    registerCategoryValue(db, 'system', g.system);
    registerCategoryValue(db, 'subSystem', g.subSystem);
    registerCategoryValue(db, 'unit', g.unit);
    registerCategoryValue(db, 'supplier', g.supplier);
    registerCategoryValue(db, 'dispatchLocation', g.dispatchLocation);
    registerCategoryValue(db, 'packageType', g.packageType);
  }
  for (const d of db.detailed) {
    registerCategoryValue(db, 'island', d.island);
    registerCategoryValue(db, 'system', d.system);
    registerCategoryValue(db, 'subSystem', d.subSystem);
    registerCategoryValue(db, 'unit', d.unit);
    registerCategoryValue(db, 'supplier', d.supplier);
    registerCategoryValue(db, 'origin', d.origin);
    registerCategoryValue(db, 'storageLocation', d.storageLocation);
    registerCategoryValue(db, 'countingUnit', d.countingUnit);
    registerCategoryValue(db, 'generalDescription', d.generalDescription);
    registerCategoryValue(db, 'stocktakeStatus', d.stocktakeStatus);
    registerCategoryValue(db, 'receiver', d.receiver);
    registerCategoryValue(db, 'merStatus', d.merStatus);
    registerCategoryValue(db, 'repStatus', d.repStatus);
    registerCategoryValue(db, 'balanceStatus', d.balanceStatus);
    registerCategoryValue(db, 'chemicalType', d.chemicalType);
  }
  for (const t of db.transit) {
    registerCategoryValue(db, 'system', t.system);
    registerCategoryValue(db, 'subSystem', t.subSystem);
    registerCategoryValue(db, 'unit', t.unit);
    registerCategoryValue(db, 'supplier', t.supplier);
    registerCategoryValue(db, 'dispatchLocation', t.dispatchLocation);
    registerCategoryValue(db, 'carrierContractor', t.carrierContractor);
    registerCategoryValue(db, 'transitStatus', t.overallStatus);
  }
  sanitizeCategoryStore(db.categories);
}

function addAudit(
  db: StaticDatabase,
  user: UserAccount,
  action: string,
  scope: AuditLogEntry['scope'],
  targetId: string,
  summary: string,
) {
  db.auditLogs.unshift({
    id: makeId(),
    timestamp: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    userFullName: user.fullName,
    role: user.role,
    action,
    scope,
    targetId,
    summary,
  });
  if (db.auditLogs.length > 50000) db.auditLogs.length = 50000;
}

function syncTransitArrival(db: StaticDatabase, packingNo: string, user: UserAccount): number {
  const pk = normKey(packingNo);
  if (!pk) return 0;
  const genArrival = db.general.find((g) => normKey(g.packingListNo) === pk && normKey(g.arrivalDate))?.arrivalDate || '';
  let updated = 0;
  const now = new Date().toISOString();
  for (const t of db.transit) {
    if (normKey(t.packingListNo) === pk) {
      const st = normKey(t.overallStatus);
      const needsStatus = st !== 'رسیده';
      const needsDate = Boolean(genArrival && normKey(t.arrivalDate) !== normKey(genArrival));
      if (needsStatus || needsDate) {
        if (needsStatus) t.overallStatus = 'رسیده';
        if (genArrival) t.arrivalDate = genArrival;
        t.linkedGeneralPackingNo = pk;
        t.updatedAt = now;
        updated += 1;
      }
    }
  }
  if (updated > 0) {
    renumberScope(db, 'transit');
    addAudit(
      db,
      user,
      'AUTO_TRANSIT_ARRIVED',
      'transit',
      pk,
      `به‌روزرسانی خودکار وضعیت «رسیده» و تاریخ ورود برای ${updated} ردیف در راه (پکینگ ${pk})`,
    );
  }
  return updated;
}

function nextSuggestedRowNo(db: StaticDatabase, scope: 'general' | 'detailed' | 'transit'): string {
  const arr = scope === 'general' ? db.general : scope === 'detailed' ? db.detailed : db.transit;
  return String(arr.length + 1);
}

function isRowNoTaken(
  db: StaticDatabase,
  scope: 'general' | 'detailed' | 'transit',
  rowNo: string,
  excludeId?: string,
): boolean {
  const target = normKey(rowNo);
  if (!target) return false;
  const arr = scope === 'general' ? db.general : scope === 'detailed' ? db.detailed : db.transit;
  return arr.some((item) => normKey(item.rowNo) === target && item.id !== excludeId);
}

function isMapnaMinutesTaken(_db: StaticDatabase, _minutesNo: string, _excludeId?: string): boolean {
  return false;
}

function isDetailedItemNoTaken(
  db: StaticDatabase,
  shipmentNo: string,
  packageNo: string,
  itemNo: string,
  excludeId?: string,
): boolean {
  const pk = normKey(shipmentNo).toLowerCase();
  const pkg = normKey(packageNo).toLowerCase();
  const itm = normalizeDigits(normKey(itemNo)).toLowerCase();
  if (!pk || !itm) return false;
  return db.detailed.some(
    (d) =>
      d.id !== excludeId &&
      normKey(d.shipmentNo).toLowerCase() === pk &&
      normKey(d.packageNo).toLowerCase() === pkg &&
      normalizeDigits(normKey(d.itemNo)).toLowerCase() === itm,
  );
}

function getNextSuggestedItemNo(db: StaticDatabase, shipmentNo: string, packageNo: string): string {
  const pk = normKey(shipmentNo).toLowerCase();
  const pkg = normKey(packageNo).toLowerCase();
  if (!pk) return '1';
  const matching = db.detailed.filter(
    (d) => normKey(d.shipmentNo).toLowerCase() === pk && (!pkg || normKey(d.packageNo).toLowerCase() === pkg),
  );
  if (matching.length === 0) return '1';
  let maxNum = 0;
  for (const d of matching) {
    const parsed = Number(normalizeDigits(normKey(d.itemNo)));
    if (Number.isInteger(parsed) && parsed > maxNum) maxNum = parsed;
  }
  let candidate = maxNum + 1;
  while (isDetailedItemNoTaken(db, shipmentNo, packageNo, String(candidate))) candidate += 1;
  return String(candidate);
}

function getGeneralSharedInfo(db: StaticDatabase, packingNo: string, packageNo?: string) {
  const pk = normKey(packingNo);
  if (!pk) return null;
  const list = db.general.filter((g) => normKey(g.packingListNo) === pk);
  if (list.length === 0) return null;
  const pkg = normKey(packageNo);
  const exact = pkg ? list.find((g) => normKey(g.packageNo) === pkg) : undefined;
  const match = exact || list[0];
  const packageCounts: Record<string, number | null> = {};
  for (const g of list) {
    const p = normKey(g.packageNo);
    if (p) packageCounts[p] = g.itemCount ?? null;
  }
  const existingDetailedCount = db.detailed.filter(
    (d) => normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg),
  ).length;

  return {
    arrivalDate: match.arrivalDate,
    supplier: match.supplier,
    dispatchLocation: match.dispatchLocation,
    island: match.island,
    system: match.system,
    subSystem: match.subSystem,
    unit: match.unit,
    packageNo: match.packageNo,
    expectedItemCount: match.itemCount ?? null,
    existingDetailedCount,
    packageCounts,
    packagesForPacking: Array.from(new Set(list.map((g) => normKey(g.packageNo)).filter(Boolean))),
  };
}

function getLastDetailedDefaults(db: StaticDatabase) {
  let latest: DetailedEntry | undefined = db.detailed[0];
  for (const d of db.detailed) {
    if (!latest || (d.createdAt || '') > (latest.createdAt || '')) {
      latest = d;
    }
  }
  if (!latest) return { shipmentNo: '', packageNo: '', countingUnit: 'عدد' };
  return {
    shipmentNo: normKey(latest.shipmentNo),
    packageNo: normKey(latest.packageNo),
    countingUnit: normalizeCountingUnitToFa(latest.countingUnit) || 'عدد',
  };
}

function matchSearch(haystackParts: (string | number | null | undefined)[], q: string): boolean {
  if (!q) return true;
  const needle = normalizeDigits(q).toLowerCase().trim();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const combined = normalizeDigits(
    haystackParts.filter((p) => p !== null && p !== undefined && p !== '').join(' '),
  ).toLowerCase();
  return tokens.every((tok) => combined.includes(tok));
}

function inDateRange(isoDate: string, fromDate: string, toDate: string): boolean {
  return checkDateRangeMulti(isoDate, fromDate, toDate);
}

export class StaticEngineError extends Error {
  public status: number;
  public code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const projectHistories = new Map<string, WarehouseHistoryManager>();
function getProjectHistory(projectId: string): WarehouseHistoryManager {
  let mgr = projectHistories.get(projectId);
  if (!mgr) {
    mgr = new WarehouseHistoryManager(50);
    projectHistories.set(projectId, mgr);
  }
  return mgr;
}

export async function handleStaticApiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const headers = (options.headers as Record<string, string>) || {};
  const projectHeader = String(headers['X-Samaan-Project'] || headers['x-samaan-project'] || '').trim();
  const activeProjectId = await resolveProjectId(projectHeader);
  const db = await getDb(activeProjectId);
  const history = getProjectHistory(activeProjectId);
  let currentUserObj = db.currentUserId
    ? db.users.find((u) => u.id === db.currentUserId && u.active) || null
    : null;
  if (!currentUserObj && pathname !== '/api/auth/logout') {
    const cachedUser = readCachedOfflineSessionUser();
    if (cachedUser) {
      let matched = db.users.find(
        (u) => u.id === cachedUser.id || u.username.toLowerCase() === cachedUser.username.toLowerCase(),
      );
      if (!matched) {
        matched = {
          ...cachedUser,
          active: true,
          passwordHash: '',
          preferences: cachedUser.preferences || { ...DEFAULT_PREFERENCES },
          createdAt: cachedUser.createdAt || new Date().toISOString(),
        };
        db.users.push(matched);
      } else {
        matched.active = true;
      }
      db.currentUserId = matched.id;
      currentUserObj = matched;
      void saveDb(db, activeProjectId);
    }
  }

  const autoUndoSpec = resolveAutoUndoSpec(method, pathname);
  const snapshot =
    autoUndoSpec && currentUserObj && ['admin', 'operator'].includes(currentUserObj.role)
      ? captureAutoUndoState(db, history, autoUndoSpec)
      : null;

  const result = await handleStaticApiRequestInner<T>(
    url,
    options,
    parsedUrl,
    activeProjectId,
    db,
    history,
    currentUserObj,
  );

  if (snapshot) {
    commitAutoUndoDiff(
      db,
      history,
      snapshot,
      currentUserObj?.fullName || currentUserObj?.username || 'system',
    );
  }
  return result;
}

async function handleStaticApiRequestInner<T>(
  _url: string,
  options: RequestInit,
  parsedUrl: URL,
  activeProjectId: string,
  db: StaticDatabase,
  history: WarehouseHistoryManager,
  currentUserObj: StaticUser | null,
): Promise<T> {
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.searchParams;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {};
  const headers = (options.headers as Record<string, string>) || {};
  const langHeader = String(headers['X-Samaan-Lang'] || headers['x-samaan-lang'] || '').toLowerCase();
  const saveActiveDb = (targetDb: StaticDatabase = db) => saveDb(targetDb, activeProjectId);

  const isEn = langHeader
    ? langHeader === 'en'
    : currentUserObj?.preferences?.language === 'en';
  const errMsg = (fa: string, en: string) => (isEn ? en : fa);

  const requireAuth = (allowed?: UserRole[]): StaticUser => {
    if (!currentUserObj) {
      throw new StaticEngineError(errMsg('احراز هویت الزامی است', 'Authentication required'), 401);
    }
    if (allowed && !allowed.includes(currentUserObj.role)) {
      throw new StaticEngineError(errMsg('سطح دسترسی کافی نیست', 'Insufficient permissions'), 403);
    }
    return currentUserObj;
  };

  // ---------------- HEALTH CHECK ----------------
  if (pathname === '/api/health' && method === 'GET') {
    return { ok: true } as T;
  }

  // ---------------- APP VERSION ----------------
  if (pathname === '/api/app/version' && method === 'GET') {
    return getLocalVersionPayload() as T;
  }

  // ---------------- PROJECTS ----------------
  if (pathname === '/api/projects' && method === 'GET') {
    const projects = await getProjects();
    return { projects, activeProjectId } as T;
  }

  if (pathname === '/api/projects' && method === 'POST') {
    const projects = await getProjects();
    const cleanName = normKey(String(body.name || ''));
    const cleanCode = normKey(String(body.code || ''));
    const cleanContractRef = normKey(String(body.contractRef || ''));
    const rawEmployerId = body.employerId;
    const employerId: EmployerId =
      typeof rawEmployerId === 'string' && rawEmployerId.trim()
        ? rawEmployerId.trim()
        : DEFAULT_EMPLOYER_ID;
    const employerConfig = sanitizeEmployerConfig(body.employerConfig as EmployerCustomConfig | undefined);
    const copyUsers = Boolean(body.copyUsers && currentUserObj);
    if (!cleanName) {
      throw new StaticEngineError(errMsg('نام پروژه الزامی است', 'Project name is required'), 400);
    }
    if (projects.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new StaticEngineError(
        errMsg('پروژه‌ای با این نام قبلاً ثبت شده است', 'A project with this name already exists'),
        409,
      );
    }
    const newId = `prj_${makeId().replace(/-/g, '').slice(0, 12)}`;
    const created: ProjectInfo = {
      id: newId,
      name: cleanName,
      code: cleanCode || undefined,
      contractRef: cleanContractRef || undefined,
      employerId,
      employerConfig,
      createdAt: new Date().toISOString(),
    };
    const nextDb = createEmptyDb();
    if (copyUsers) {
      nextDb.users = db.users.map((u) => ({ ...u }));
      if (currentUserObj) {
        nextDb.currentUserId = currentUserObj.id;
      }
    }
    await saveDb(nextDb, newId);
    const updatedList = [...projects, created];
    await saveProjects(updatedList);
    return { project: created, projects: updatedList } as T;
  }

  if (pathname.startsWith('/api/projects/') && method === 'PATCH') {
    const targetId = pathname.split('/').pop()!;
    const projects = await getProjects();
    const targetProj = projects.find((p) => p.id === targetId);
    if (!targetProj) {
      throw new StaticEngineError(errMsg('پروژه یافت نشد', 'Project not found'), 404);
    }
    const targetDb = await getDb(targetId);
    if (targetDb.users.length > 0 && (!currentUserObj || !['admin', 'operator'].includes(currentUserObj.role))) {
      throw new StaticEngineError(
        errMsg('دسترسی برای ویرایش پروژه مجاز نیست', 'Permission denied to update project'),
        currentUserObj ? 403 : 401,
      );
    }
    if (body.name !== undefined) {
      const cleanName = normKey(String(body.name || ''));
      if (!cleanName) {
        throw new StaticEngineError(errMsg('نام پروژه الزامی است', 'Project name is required'), 400);
      }
      targetProj.name = cleanName;
    }
    if (body.code !== undefined) {
      targetProj.code = normKey(String(body.code || '')) || undefined;
    }
    if (body.contractRef !== undefined) {
      targetProj.contractRef = normKey(String(body.contractRef || '')) || undefined;
    }
    if (body.employerId !== undefined) {
      targetProj.employerId = typeof body.employerId === 'string' ? body.employerId.trim() : '';
    }
    if (body.employerConfig !== undefined) {
      targetProj.employerConfig = sanitizeEmployerConfig(body.employerConfig as EmployerCustomConfig | undefined);
    }
    await saveProjects(projects);
    return { project: targetProj, projects } as T;
  }

  if (pathname.startsWith('/api/projects/') && method === 'DELETE') {
    const targetId = pathname.split('/').pop()!;
    if (targetId === DEFAULT_PROJECT_ID) {
      throw new StaticEngineError(
        errMsg('پروژه پیش‌فرض قابل حذف نیست (می‌توانید نام آن را ویرایش کنید)', 'Default project cannot be deleted (you can rename it)'),
        400,
      );
    }
    const projects = await getProjects();
    if (!projects.some((p) => p.id === targetId)) {
      throw new StaticEngineError(errMsg('پروژه یافت نشد', 'Project not found'), 404);
    }
    const targetDb = await getDb(targetId);
    if (targetDb.users.length > 0 && (!currentUserObj || currentUserObj.role !== 'admin')) {
      throw new StaticEngineError(
        errMsg('حذف پروژه دارای کاربر فقط توسط مدیر کل مجاز است', 'Only administrators can delete an initialized project'),
        currentUserObj ? 403 : 401,
      );
    }
    const updatedList = projects.filter((p) => p.id !== targetId);
    await saveProjects(updatedList);
    await deleteProjectDb(targetId);
    return { ok: true, projects: updatedList } as T;
  }

  // ---------------- EMPLOYERS & FORM TEMPLATES ----------------
  if (pathname === '/api/employers' && method === 'GET') {
    const employers = await getEmployers();
    return { employers } as T;
  }

  if (pathname === '/api/employers' && method === 'POST') {
    if (db.users.length > 0 && (!currentUserObj || !['admin', 'operator'].includes(currentUserObj.role))) {
      throw new StaticEngineError(
        errMsg('دسترسی برای ایجاد کارفرما مجاز نیست', 'Permission denied to create employer'),
        currentUserObj ? 403 : 401,
      );
    }
    const employers = await getEmployers();
    const id = `emp-${makeId().replace(/-/g, '').slice(0, 10)}`;
    const created = sanitizeEmployerProfile({ ...body, id, isBuiltIn: false });
    if (!created) {
      throw new StaticEngineError(errMsg('نام کارفرما الزامی است', 'Employer name is required'), 400);
    }
    const updated = [...employers, created];
    await saveEmployers(updated);
    return { employer: created, employers: await getEmployers() } as T;
  }

  if (pathname.startsWith('/api/employers/') && method === 'PATCH') {
    if (db.users.length > 0 && (!currentUserObj || !['admin', 'operator'].includes(currentUserObj.role))) {
      throw new StaticEngineError(
        errMsg('دسترسی برای ویرایش کارفرما مجاز نیست', 'Permission denied to update employer'),
        currentUserObj ? 403 : 401,
      );
    }
    const targetId = pathname.split('/').pop()!;
    const employers = await getEmployers();
    const idx = employers.findIndex((e) => e.id === targetId);
    if (idx === -1) {
      throw new StaticEngineError(errMsg('کارفرما یافت نشد', 'Employer not found'), 404);
    }
    const prev = employers[idx];
    const sanitized = sanitizeEmployerProfile({
      ...prev,
      ...body,
      id: prev.id,
      isBuiltIn: Boolean(prev.isBuiltIn || isBuiltInEmployerId(prev.id)),
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!sanitized) {
      throw new StaticEngineError(errMsg('نام کارفرما نامعتبر است', 'Invalid employer data'), 400);
    }
    const updatedList = [...employers];
    updatedList[idx] = sanitized;
    await saveEmployers(updatedList);
    return { employer: sanitized, employers: await getEmployers() } as T;
  }

  if (pathname.startsWith('/api/employers/') && method === 'DELETE') {
    if (db.users.length > 0 && (!currentUserObj || currentUserObj.role !== 'admin')) {
      throw new StaticEngineError(
        errMsg('حذف کارفرما فقط توسط مدیر کل مجاز است', 'Only administrators can delete an employer'),
        currentUserObj ? 403 : 401,
      );
    }
    const targetId = pathname.split('/').pop()!;
    if (isBuiltInEmployerId(targetId)) {
      throw new StaticEngineError(
        errMsg('کارفرماهای پیش‌فرض سامانه قابل حذف نیستند', 'Built-in default employers cannot be deleted'),
        400,
      );
    }
    const employers = await getEmployers();
    const targetEmp = employers.find((e) => e.id === targetId);
    if (!targetEmp) {
      throw new StaticEngineError(errMsg('کارفرما یافت نشد', 'Employer not found'), 404);
    }
    if (targetEmp.isBuiltIn) {
      throw new StaticEngineError(
        errMsg('کارفرماهای پیش‌فرض سامانه قابل حذف نیستند', 'Built-in default employers cannot be deleted'),
        400,
      );
    }
    const updatedList = employers.filter((e) => e.id !== targetId);
    await saveEmployers(updatedList);
    const projects = await getProjects();
    let changedProj = false;
    const nextProjects = projects.map((p) => {
      if (p.employerId === targetId) {
        changedProj = true;
        return { ...p, employerId: DEFAULT_EMPLOYER_ID };
      }
      return p;
    });
    if (changedProj) {
      await saveProjects(nextProjects);
    }
    return { ok: true, employers: await getEmployers(), projects: nextProjects } as T;
  }

  // ---------------- CUSTOM FORM SUBMISSIONS ----------------
  if (pathname === '/api/custom-forms' && method === 'GET') {
    requireAuth();
    const formIdFilter = normKey(query.get('formId'));
    const q = normKey(query.get('q'));
    const compact = query.get('compact') === '1';
    const packingFilter = normKey(query.get('packing'));
    const limit = Math.min(500, Math.max(10, Number(query.get('limit') || 120) || 120));
    const submissions = (db.customFormSubmissions || []).filter((sub) => {
      if (formIdFilter && sub.formId !== formIdFilter) return false;
      if (q) {
        return matchSearch([sub.formTitle, sub.docNo, sub.packingListNo, sub.notes, ...Object.values(sub.fieldValues || {})], q);
      }
      return true;
    });
    const packings = collectUniquePackings(db.general, db.detailed);
    const generalEntries = compact
      ? queryOpsGeneral(db.general, { compact: true, packing: packingFilter, limit })
      : [...db.general].reverse();
    const detailedItems = compact
      ? queryOpsDetailed(db.detailed.map(computeDetailedEntry), { compact: true, packing: packingFilter, limit })
      : [...db.detailed.map(computeDetailedEntry)].reverse().map(slimDetailedForOps);
    return {
      submissions: [...submissions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      generalEntries,
      detailedItems,
      packings,
    } as T;
  }

  if (pathname === '/api/custom-forms' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const formId = normKey(String(body.formId || ''));
    const formTitle = normKey(String(body.formTitle || ''));
    const docNo = normKey(String(body.docNo || ''));
    const date = normKey(String(body.date || ''));
    if (!formId || !docNo) {
      throw new StaticEngineError(errMsg('فرم و شماره سند الزامی است', 'Form ID and document number are required'), 400);
    }
    const now = new Date().toISOString();
    const record: CustomFormSubmission = {
      id: makeId(),
      formId,
      formTitle: formTitle || formId,
      docNo,
      date: date || now.slice(0, 10),
      packingListNo: normKey(String(body.packingListNo || '')),
      fieldValues: (body.fieldValues && typeof body.fieldValues === 'object' ? body.fieldValues : {}) as Record<string, string>,
      rows: (Array.isArray(body.rows) ? body.rows : []) as Array<Record<string, string>>,
      notes: normKey(String(body.notes || '')),
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    if (!db.customFormSubmissions) db.customFormSubmissions = [];
    db.customFormSubmissions.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_CUSTOM_FORM', 'customForm', record.id, `ثبت فرم اختصاصی «${record.formTitle}» (${record.docNo})`);
    await saveActiveDb();
    return { submission: record } as T;
  }

  if (pathname.startsWith('/api/custom-forms/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const targetId = pathname.split('/').pop()!;
    const list = db.customFormSubmissions || [];
    const target = list.find((s) => s.id === targetId);
    if (!target) {
      throw new StaticEngineError(errMsg('سند یافت نشد', 'Submission not found'), 404);
    }
    if (body.docNo !== undefined) target.docNo = normKey(String(body.docNo || ''));
    if (body.date !== undefined) target.date = normKey(String(body.date || ''));
    if (body.packingListNo !== undefined) target.packingListNo = normKey(String(body.packingListNo || ''));
    if (body.fieldValues && typeof body.fieldValues === 'object') {
      target.fieldValues = body.fieldValues as Record<string, string>;
    }
    if (Array.isArray(body.rows)) target.rows = body.rows as Array<Record<string, string>>;
    if (body.notes !== undefined) target.notes = normKey(String(body.notes || ''));
    target.updatedAt = new Date().toISOString();
    addAudit(db, sanitizeUser(u), 'UPDATE_CUSTOM_FORM', 'customForm', target.id, `ویرایش فرم اختصاصی «${target.formTitle}» (${target.docNo})`);
    await saveActiveDb();
    return { submission: target } as T;
  }

  if (pathname.startsWith('/api/custom-forms/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const targetId = pathname.split('/').pop()!;
    const list = db.customFormSubmissions || [];
    const idx = list.findIndex((s) => s.id === targetId);
    if (idx === -1) {
      throw new StaticEngineError(errMsg('سند یافت نشد', 'Submission not found'), 404);
    }
    const [removed] = list.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_CUSTOM_FORM', 'customForm', removed.id, `حذف فرم اختصاصی «${removed.formTitle}» (${removed.docNo})`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- AUTH ----------------
  if (pathname === '/api/auth/status' && method === 'GET') {
    return {
      needsSetup: db.users.length === 0,
      user: currentUserObj ? sanitizeUser(currentUserObj) : null,
    } as T;
  }

  if (pathname === '/api/auth/setup' && method === 'POST') {
    if (db.users.length > 0) {
      throw new StaticEngineError(errMsg('سامانه قبلاً راه‌اندازی شده است', 'System is already initialized'), 400);
    }
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || username).trim();
    if (!username || password.length < 4) {
      throw new StaticEngineError(
        errMsg('نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
        400,
      );
    }
    const newUser: StaticUser = {
      id: makeId(),
      username,
      fullName,
      role: 'admin',
      active: true,
      passwordHash: await hashBrowserPassword(password),
      preferences: { ...DEFAULT_PREFERENCES, ...((body.preferences as Partial<UserPreferences>) || {}) },
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    db.currentUserId = newUser.id;
    addAudit(db, sanitizeUser(newUser), 'INITIAL_ADMIN_SETUP', 'auth', newUser.id, `راه‌اندازی اولیه سیستم و ایجاد مدیر کل (${newUser.username})`);
    await saveActiveDb();
    return { user: sanitizeUser(newUser) } as T;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const found = db.users.find((u) => u.username.toLowerCase() === username);
    if (!found || !found.active || !(await verifyBrowserPassword(password, found.passwordHash))) {
      throw new StaticEngineError(
        errMsg('نام کاربری یا رمز عبور اشتباه است یا حساب غیرفعال است', 'Invalid credentials or inactive account'),
        401,
      );
    }
    found.lastLoginAt = new Date().toISOString();
    db.currentUserId = found.id;
    addAudit(db, sanitizeUser(found), 'LOGIN', 'auth', found.id, `ورود کاربر ${found.fullName} (${found.username})`);
    await saveActiveDb();
    return { user: sanitizeUser(found) } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (currentUserObj) {
      addAudit(db, sanitizeUser(currentUserObj), 'LOGOUT', 'auth', currentUserObj.id, `خروج کاربر ${currentUserObj.fullName} (${currentUserObj.username})`);
    }
    db.currentUserId = null;
    await saveActiveDb();
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/preferences' && method === 'PATCH') {
    const u = requireAuth();
    u.preferences = { ...u.preferences, ...(body as Partial<UserPreferences>) };
    await saveActiveDb();
    return { user: sanitizeUser(u) } as T;
  }

  // ---------------- UNDO / REDO HISTORY ----------------
  if (pathname === '/api/history/status' && method === 'GET') {
    requireAuth();
    return history.getStatus() as T;
  }

  if (pathname === '/api/history/undo' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const result = history.undo(db);
    if (!result) {
      throw new StaticEngineError(errMsg('عملیاتی برای بازگردانی وجود ندارد.', 'Nothing to undo.'), 400);
    }
    if (result.touchedScopes.has('general')) renumberScope(db, 'general');
    if (result.touchedScopes.has('detailed')) renumberScope(db, 'detailed');
    if (result.touchedScopes.has('transit')) renumberScope(db, 'transit');
    if (!result.touchedScopes.has('categories')) rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'UNDO_ACTION', 'history', result.command.id, `بازگردانی عملیات (Undo): ${result.command.labelFa}`);
    await saveActiveDb();
    return {
      ok: true,
      undone: { labelFa: result.command.labelFa, labelEn: result.command.labelEn },
      status: history.getStatus(),
    } as T;
  }

  if (pathname === '/api/history/redo' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const result = history.redo(db);
    if (!result) {
      throw new StaticEngineError(errMsg('عملیاتی برای انجام مجدد وجود ندارد.', 'Nothing to redo.'), 400);
    }
    if (result.touchedScopes.has('general')) renumberScope(db, 'general');
    if (result.touchedScopes.has('detailed')) renumberScope(db, 'detailed');
    if (result.touchedScopes.has('transit')) renumberScope(db, 'transit');
    if (!result.touchedScopes.has('categories')) rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'REDO_ACTION', 'history', result.command.id, `انجام مجدد عملیات (Redo): ${result.command.labelFa}`);
    await saveActiveDb();
    return {
      ok: true,
      redone: { labelFa: result.command.labelFa, labelEn: result.command.labelEn },
      status: history.getStatus(),
    } as T;
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const u = requireAuth();
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || !(await verifyBrowserPassword(currentPassword, u.passwordHash))) {
      throw new StaticEngineError(errMsg('رمز عبور فعلی صحیح نیست', 'Current password is incorrect'), 401);
    }
    if (newPassword.length < 4) {
      throw new StaticEngineError(
        errMsg('رمز عبور جدید باید حداقل ۴ کاراکتر باشد', 'New password must be at least 4 characters'),
        400,
      );
    }
    u.passwordHash = await hashBrowserPassword(newPassword);
    u.mustChangePassword = false;
    addAudit(db, sanitizeUser(u), 'CHANGE_OWN_PASSWORD', 'auth', u.id, `تغییر رمز عبور توسط کاربر ${u.fullName} (${u.username})`);
    await saveActiveDb();
    return { ok: true, user: sanitizeUser(u) } as T;
  }

  // ---------------- USERS ----------------
  if (pathname === '/api/users' && method === 'GET') {
    requireAuth(['admin']);
    return { users: db.users.map(sanitizeUser) } as T;
  }

  if (pathname === '/api/users' && method === 'POST') {
    const admin = requireAuth(['admin']);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || username).trim();
    const role = (body.role as UserRole) || 'operator';
    const active = typeof body.active === 'boolean' ? body.active : true;
    const mustChangePassword = Boolean(body.mustChangePassword);
    if (!username || password.length < 4) {
      throw new StaticEngineError(
        errMsg('نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
        400,
      );
    }
    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      throw new StaticEngineError(errMsg('نام کاربری تکراری است', 'Username already exists'), 409);
    }
    const created: StaticUser = {
      id: makeId(),
      username,
      fullName,
      role,
      active,
      mustChangePassword,
      passwordHash: await hashBrowserPassword(password),
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: new Date().toISOString(),
    };
    db.users.push(created);
    addAudit(db, sanitizeUser(admin), 'CREATE_USER', 'user', created.id, `ایجاد کاربر جدید: ${created.username} با نقش ${created.role}`);
    await saveActiveDb();
    return { user: sanitizeUser(created) } as T;
  }

  if (pathname.startsWith('/api/users/') && method === 'PATCH') {
    const admin = requireAuth(['admin']);
    const targetId = pathname.split('/').pop()!;
    const target = db.users.find((u) => u.id === targetId);
    if (!target) throw new StaticEngineError(errMsg('کاربر یافت نشد', 'User not found'), 404);

    const nextRole = (body.role as UserRole) ?? target.role;
    const nextActive = typeof body.active === 'boolean' ? body.active : target.active;
    if (target.id === admin.id && (nextRole !== 'admin' || !nextActive)) {
      throw new StaticEngineError(
        errMsg('امکان غیرفعال‌سازی یا تغییر نقش حساب کاربری خودتان وجود ندارد', 'Cannot deactivate or demote your own account'),
        400,
      );
    }
    if (target.role === 'admin' && target.active && (nextRole !== 'admin' || !nextActive)) {
      const otherActiveAdmins = db.users.filter((u) => u.id !== target.id && u.role === 'admin' && u.active);
      if (otherActiveAdmins.length === 0) {
        throw new StaticEngineError(
          errMsg('حداقل یک مدیر کل فعال باید در سامانه باقی بماند', 'At least one active admin must remain'),
          400,
        );
      }
    }

    if (body.username !== undefined) {
      const cleanUsername = String(body.username).trim().toLowerCase();
      if (!cleanUsername) {
        throw new StaticEngineError(errMsg('نام کاربری نمی‌تواند خالی باشد', 'Username cannot be empty'), 400);
      }
      if (db.users.some((u) => u.id !== target.id && u.username.toLowerCase() === cleanUsername)) {
        throw new StaticEngineError(errMsg('نام کاربری تکراری است', 'Username already exists'), 409);
      }
      target.username = cleanUsername;
    }
    if (body.fullName !== undefined) target.fullName = String(body.fullName).trim() || target.username;
    if (body.role !== undefined) target.role = body.role as UserRole;
    if (typeof body.active === 'boolean') target.active = body.active;
    if (typeof body.mustChangePassword === 'boolean') target.mustChangePassword = body.mustChangePassword;

    let passwordReset = false;
    if (typeof body.password === 'string' && body.password !== '') {
      if (body.password.length < 4) {
        throw new StaticEngineError(errMsg('رمز عبور باید حداقل ۴ کاراکتر باشد', 'Password must be at least 4 characters'), 400);
      }
      target.passwordHash = await hashBrowserPassword(body.password);
      passwordReset = true;
    }

    addAudit(
      db,
      sanitizeUser(admin),
      passwordReset ? 'ADMIN_RESET_PASSWORD' : 'UPDATE_USER',
      'user',
      target.id,
      passwordReset
        ? `تغییر رمز عبور کاربر ${target.username} توسط مدیر`
        : `ویرایش حساب کاربری ${target.username}`,
    );
    await saveActiveDb();
    return { user: sanitizeUser(target) } as T;
  }

  if (pathname.startsWith('/api/users/') && method === 'DELETE') {
    const admin = requireAuth(['admin']);
    const targetId = pathname.split('/').pop()!;
    const idx = db.users.findIndex((u) => u.id === targetId);
    if (idx === -1) throw new StaticEngineError(errMsg('کاربر یافت نشد', 'User not found'), 404);
    const target = db.users[idx];
    if (target.id === admin.id) {
      throw new StaticEngineError(
        errMsg('امکان حذف حساب کاربری خودتان وجود ندارد', 'Cannot delete your own account'),
        400,
      );
    }
    if (target.role === 'admin' && target.active) {
      const otherActiveAdmins = db.users.filter((u) => u.id !== target.id && u.role === 'admin' && u.active);
      if (otherActiveAdmins.length === 0) {
        throw new StaticEngineError(
          errMsg('حداقل یک مدیر کل فعال باید در سامانه باقی بماند', 'Cannot delete the last active admin'),
          400,
        );
      }
    }
    db.users.splice(idx, 1);
    addAudit(db, sanitizeUser(admin), 'DELETE_USER', 'user', target.id, `حذف حساب کاربری ${target.fullName} (${target.username})`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- PACKING CHECK, LOOKUP & CLOSURE ----------------
  if (pathname === '/api/packing/check' && method === 'GET') {
    requireAuth();
    const packingNo = normKey(query.get('packingNo'));
    const packageNo = normKey(query.get('packageNo'));
    const itemNo = normalizeDigits(normKey(query.get('itemNo')));
    const mapnaMinutesNo = normalizeDigits(normKey(query.get('mapnaMinutesNo')));
    const scope = (query.get('scope') || 'general') as 'general' | 'detailed' | 'transit';
    const excludeId = query.get('excludeId') || undefined;

    const genMatches = packingNo ? db.general.filter((g) => normKey(g.packingListNo) === packingNo) : [];
    const detMatches = packingNo ? db.detailed.filter((d) => normKey(d.shipmentNo) === packingNo) : [];
    const transitMatches = packingNo ? db.transit.filter((t) => normKey(t.packingListNo) === packingNo) : [];
    const generalPackages = Array.from(new Set(genMatches.map((g) => normKey(g.packageNo)).filter(Boolean)));
    const existingPackages = Array.from(
      new Set([
        ...generalPackages,
        ...detMatches.map((d) => normKey(d.packageNo)).filter(Boolean),
      ]),
    );
    const meta = packingNo ? db.packingMeta[packingNo] : undefined;
    const linkedGeneral = packingNo ? getGeneralSharedInfo(db, packingNo, packageNo) : null;
    const tFirst = transitMatches[0];
    const linkedTransit = tFirst
      ? {
          packingListNo: tFirst.packingListNo,
          packageNo: tFirst.packageNo,
          arrivalDate: tFirst.arrivalDate,
          releaseNetNo: tFirst.releaseNetNo,
          releaseNetDate: tFirst.releaseNetDate,
          supplier: tFirst.supplier,
          dispatchLocation: tFirst.dispatchLocation,
          system: tFirst.system,
          subSystem: tFirst.subSystem,
          unit: tFirst.unit,
          billOfLadingNo: tFirst.billOfLadingNo,
          amount: tFirst.amount,
          itemDescription: tFirst.itemDescription,
        }
      : null;

    return {
      packingNo,
      existsInGeneral: genMatches.length > 0,
      existsInDetailed: detMatches.length > 0,
      existsInTransit: transitMatches.length > 0,
      generalCount: genMatches.length,
      detailedCount: detMatches.length,
      generalPackages,
      existingPackages,
      packageExistsUnderPacking: packageNo ? generalPackages.includes(packageNo) : false,
      isClosed: Boolean(meta?.isClosed),
      closedAt: meta?.closedAt || null,
      closedBy: meta?.closedBy || null,
      mapnaMinutesTaken: mapnaMinutesNo ? isMapnaMinutesTaken(db, mapnaMinutesNo, excludeId) : false,
      itemNoTaken: packingNo && itemNo ? isDetailedItemNoTaken(db, packingNo, packageNo, itemNo, excludeId) : false,
      nextSuggestedItemNo: packingNo ? getNextSuggestedItemNo(db, packingNo, packageNo) : '1',
      linkedGeneral,
      linkedTransit,
      lastDetailedDefaults: getLastDetailedDefaults(db),
      rowNoTaken: false,
      nextSuggestedRowNo: nextSuggestedRowNo(db, scope),
    } as T;
  }

  if (pathname === '/api/general/lookup' && method === 'GET') {
    requireAuth();
    const packingNo = normKey(query.get('packingNo'));
    const packageNo = normKey(query.get('packageNo'));
    const packings = Array.from(new Set(db.general.map((g) => normKey(g.packingListNo)).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'fa'),
    );
    const shared = packingNo ? getGeneralSharedInfo(db, packingNo, packageNo) : null;
    return {
      packings,
      packagesForPacking: shared?.packagesForPacking || [],
      shared,
      lastDetailedDefaults: getLastDetailedDefaults(db),
    } as T;
  }

  if (pathname.startsWith('/api/packing/') && pathname.endsWith('/close') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const packingNo = decodeURIComponent(pathname.slice('/api/packing/'.length, -'/close'.length));
    db.packingMeta[packingNo] = {
      packingNo,
      isClosed: true,
      closedAt: new Date().toISOString(),
      closedBy: u.fullName || u.username,
      closureNote: String(body.note || '').trim(),
    };
    addAudit(db, sanitizeUser(u), 'CLOSE_PACKING', 'packing', packingNo, `اعلام رسیدن کامل و بستن پکینگ لیست ${packingNo}`);
    await saveActiveDb();
    return { meta: db.packingMeta[packingNo] } as T;
  }

  if (pathname.startsWith('/api/packing/') && pathname.endsWith('/reopen') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const packingNo = decodeURIComponent(pathname.slice('/api/packing/'.length, -'/reopen'.length));
    db.packingMeta[packingNo] = { packingNo, isClosed: false };
    addAudit(db, sanitizeUser(u), 'REOPEN_PACKING', 'packing', packingNo, `بازگشایی وضعیت پکینگ لیست ${packingNo}`);
    await saveActiveDb();
    return { meta: db.packingMeta[packingNo] } as T;
  }

  if (pathname === '/api/column-values' && method === 'GET') {
    requireAuth();
    const scope = query.get('scope') || 'general';
    const column = (query.get('column') || '').trim();
    const calendar: CalendarMode = query.get('calendar') === 'gregorian' ? 'gregorian' : 'jalali';
    if (!column) return { column: '', values: [] } as T;
    const sourceRows: Record<string, unknown>[] =
      scope === 'detailed'
        ? (db.detailed.map(computeDetailedEntry) as unknown as Record<string, unknown>[])
        : scope === 'transit'
          ? (db.transit as unknown as Record<string, unknown>[])
          : scope === 'trash'
            ? (db.trash.map(projectTrashRowForQuery) as unknown as Record<string, unknown>[])
            : (db.general as unknown as Record<string, unknown>[]);
    return { column, values: collectDistinctColumnValues(sourceRows, column, calendar) } as T;
  }

  // ---------------- GENERAL ----------------
  if (pathname === '/api/general' && method === 'GET') {
    requireAuth();
    const q = query.get('q') || '';
    const island = query.get('island') || '';
    const system = query.get('system') || '';
    const subSystem = query.get('subSystem') || '';
    const unit = query.get('unit') || '';
    const supplier = query.get('supplier') || '';
    const dispatchLocation = query.get('dispatchLocation') || '';
    const packageType = query.get('packageType') || '';
    const packingListNo = normKey(query.get('packingListNo'));
    const packingNos = parsePackingNosParam(query.get('packingNos'));
    const customFilters = parseCustomFiltersParam(query.get('customFilters'));
    const colFilters = parseColFiltersParam(query.get('colFilters'));
    const calendar: CalendarMode = query.get('calendar') === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = (query.get('sortBy') || '').trim();
    const sortDir: 'asc' | 'desc' = query.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const shortageOnly = query.get('shortageOnly') === 'true';
    const damagedOnly = query.get('damagedOnly') === 'true';
    const discrepancyOnly = query.get('discrepancyOnly') === 'true';
    const replacedOnly = query.get('replacedOnly') === 'true';
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const fetchAll = query.get('all') === 'true';
    const allIds = query.get('allIds') === 'true';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(query.get('pageSize') || 50)));

    const substitutedIds = new Set(
      (db.substitutions || []).map((s) => s.detailedId).filter(Boolean),
    );
    const compiledColFilters = compileColFilters(colFilters);
    const pkFilterNorm = packingListNo ? normDupPart(packingListNo) : '';

    const baseFiltered = db.general.filter((g) => {
      if (island && g.island !== island) return false;
      if (system && g.system !== system) return false;
      if (subSystem && g.subSystem !== subSystem) return false;
      if (unit && g.unit !== unit) return false;
      if (supplier && g.supplier !== supplier) return false;
      if (dispatchLocation && g.dispatchLocation !== dispatchLocation) return false;
      if (packageType && (g.packageType || '') !== packageType) return false;
      if (pkFilterNorm && normDupPart(g.packingListNo) !== pkFilterNorm) return false;
      if (!matchesMultiPacking(g.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(g as unknown as Record<string, unknown>, customFilters)) return false;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(g as unknown as Record<string, unknown>, compiledColFilters, calendar)) return false;
      if (!inDateRange(g.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          g.rowNo, g.packingListNo, g.packageNo, g.packageType || '', g.itemDescription, g.supplier,
          g.dispatchLocation, g.employerEntryMinutesNo, g.mapnaEntryMinutesNo,
          g.releaseNo, g.billOfLadingNo, g.vehicleNo, g.driverName,
          g.opiInvitationNo, g.island, g.system, g.subSystem, g.unit,
        ],
        q,
      );
    });

    const needsLinkedFilter = shortageOnly || damagedOnly || discrepancyOnly || replacedOnly;
    const isPackingClosed = (rawPk: string | undefined | null): boolean => {
      const pk = normKey(rawPk);
      if (!pk) return false;
      return Boolean(db.packingMeta[pk]?.isClosed);
    };

    if (needsLinkedFilter) {
      const resolveLinked = createGeneralDetailedLinker(db.detailed, substitutedIds);
      const enrichedRaw = [];
      for (let i = 0; i < baseFiltered.length; i += 1) {
        const g = baseFiltered[i];
        const linked = resolveLinked(g.packingListNo, g.packageNo);
        if (shortageOnly && !linked.hasLinkedShortage) continue;
        if (damagedOnly && !linked.hasLinkedDamaged) continue;
        if (discrepancyOnly && !linked.hasLinkedDiscrepancy) continue;
        if (replacedOnly && !linked.hasLinkedReplaced) continue;
        enrichedRaw.push({
          ...g,
          packingClosed: isPackingClosed(g.packingListNo),
          ...linked,
        });
      }

      const filtered = sortBy
        ? (sortRowsByColumn(enrichedRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as typeof enrichedRaw)
        : [...enrichedRaw].reverse();

      const total = filtered.length;
      const filteredSummary = computeSelectionFormulaSummary({ general: filtered });

      if (allIds) {
        return {
          ids: filtered.map((g) => g.id),
          total,
          filteredSummary,
        } as T;
      }

      const start = (page - 1) * pageSize;
      return {
        items: fetchAll ? filtered : filtered.slice(start, start + pageSize),
        total,
        page: fetchAll ? 1 : page,
        pageSize: fetchAll ? Math.max(1, total) : pageSize,
        totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
        filteredSummary,
        packingMeta: {},
      } as T;
    }

    const sortedBase = sortBy
      ? (sortRowsByColumn(baseFiltered as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as GeneralEntry[])
      : [...baseFiltered].reverse();

    const total = sortedBase.length;
    const filteredSummary = computeSelectionFormulaSummary({ general: sortedBase });

    if (allIds) {
      return {
        ids: sortedBase.map((g) => g.id),
        total,
        filteredSummary,
      } as T;
    }

    const start = (page - 1) * pageSize;
    const pageRows = fetchAll ? sortedBase : sortedBase.slice(start, start + pageSize);
    const pagePkNorms = fetchAll
      ? undefined
      : new Set(pageRows.map((g) => normDupPart(g.packingListNo)).filter(Boolean));
    const resolveLinked = createGeneralDetailedLinker(db.detailed, substitutedIds, pagePkNorms);

    const items = pageRows.map((g) => ({
      ...g,
      packingClosed: isPackingClosed(g.packingListNo),
      ...resolveLinked(g.packingListNo, g.packageNo),
    }));

    return {
      items,
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
      packingMeta: {},
    } as T;
  }

  if (pathname === '/api/general/batch' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const pk = normKey(String(body.packingListNo || ''));
    const isContinuation = Boolean(body.isContinuation);
    const acknowledgeClosed = Boolean(body.acknowledgeClosed);
    const entries = (body.entries as Partial<GeneralEntry>[]) || [];

    if (!pk) throw new StaticEngineError(errMsg('شماره پکینگ لیست الزامی است', 'Packing List No. is required'), 400);
    if (!entries.length) {
      throw new StaticEngineError(errMsg('حداقل یک نگله/آیتم باید ثبت شود', 'At least one package/item must be provided'), 400);
    }

    const existingGen = db.general.filter((g) => normKey(g.packingListNo) === pk);
    if (db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      throw new StaticEngineError(
        errMsg('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
        409,
        'CLOSED_PACKING_WARNING',
      );
    }
    if (existingGen.length > 0 && !isContinuation) {
      throw new StaticEngineError(
        errMsg('شماره پکینگ لیست تکراری است. آیا ادامه همان پکینگ لیست قبلی است؟', 'Packing List No. already exists. Continue under the existing packing list?'),
        409,
        'DUPLICATE_PACKING_PROMPT',
      );
    }

    const existingPackages = new Set(existingGen.map((g) => normKey(g.packageNo)).filter(Boolean));
    const batchMapnaMinutes = new Set<string>();
    const preparedGeneral: GeneralEntry[] = [];
    const now = new Date().toISOString();

    for (const raw of entries) {
      const pkgNo = normKey(raw.packageNo);
      if (!pkgNo || !normKey(raw.supplier) || !normKey(raw.dispatchLocation) || !normKey(raw.packageType) || !normKey(raw.itemDescription) || !normKey(raw.island) || !normKey(raw.system) || !normKey(raw.subSystem) || !normKey(raw.unit)) {
        throw new StaticEngineError(
          errMsg(
            'فیلدهای تأمین‌کننده، محل ارسال، شماره پکینگ، شماره نگله، نوع بسته‌بندی، تعداد اقلام نگله، شرح کالا، جزیره، سیستم، ساب‌سیستم و واحد نباید خالی بمانند.',
            'Supplier, Dispatch Location, Packing List No., Package No., Package Type, Package Item Count, Description, Island, System, Sub-System, and Unit are required.',
          ),
          400,
        );
      }

      const cleanEmployerMinutes = normalizeDigits(normKey(raw.employerEntryMinutesNo));
      if (cleanEmployerMinutes && !isValidDigitsOnly(cleanEmployerMinutes)) {
        throw new StaticEngineError(
          errMsg('شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.', 'Employer Entry Minutes No. must contain digits only.'),
          400,
        );
      }

      if (isContinuation && existingGen.length > 0 && (!pkgNo || existingPackages.has(pkgNo))) {
        throw new StaticEngineError(
          errMsg(
            `برای ادامه پکینگ لیست ${pk}، باید شماره نگله جدید و متفاوت وارد کنید.`,
            `To continue Packing List ${pk}, please enter a new distinct Package No.`,
          ),
          409,
          'DUPLICATE_PACKAGE_ON_CONTINUATION',
        );
      }

      const cleanMapnaMinutes = normalizeDigits(normKey(raw.mapnaEntryMinutesNo));

      const cleanArrival = normKey(raw.arrivalDate);
      const cleanReleaseNo = normKey(raw.releaseNo);
      const cleanReleaseDate = cleanReleaseNo ? (normKey(raw.releaseDate) || cleanArrival) : cleanArrival;
      const parsedItemCount =
        raw.itemCount !== undefined && raw.itemCount !== null && Number.isFinite(Number(raw.itemCount)) && Number(raw.itemCount) > 0
          ? Math.floor(Number(raw.itemCount))
          : null;
      if (!parsedItemCount || parsedItemCount <= 0) {
        throw new StaticEngineError(
          errMsg(
            'تعداد اقلام نگله الزامی و باید عدد صحیح بزرگ‌تر از صفر باشد.',
            'Package Item Count is required and must be a positive integer.',
          ),
          400,
        );
      }

      preparedGeneral.push({
        id: makeId(),
        rowNo: '0',
        arrivalDate: cleanArrival,
        releaseNo: cleanReleaseNo,
        releaseDate: cleanReleaseDate,
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: cleanEmployerMinutes,
        mapnaEntryMinutesNo: cleanMapnaMinutes,
        packingListNo: pk,
        packageNo: pkgNo,
        packageType: normKey(raw.packageType),
        itemCount: parsedItemCount,
        itemDescription: normKey(raw.itemDescription),
        island: normKey(raw.island),
        system: normKey(raw.system),
        subSystem: normKey(raw.subSystem),
        unit: normKey(raw.unit),
        grossWeight: raw.grossWeight ?? null,
        netWeight: raw.netWeight ?? null,
        lengthCm: raw.lengthCm ?? null,
        widthCm: raw.widthCm ?? null,
        heightCm: raw.heightCm ?? null,
        billOfLadingNo: normKey(raw.billOfLadingNo),
        vehicleNo: normKey(raw.vehicleNo),
        weighbridgeWeight: raw.weighbridgeWeight ?? null,
        freightCost: raw.freightCost ?? null,
        opiInvitationNo: normKey(raw.opiInvitationNo),
        opiInvitationDate: normKey(raw.opiInvitationDate),
        driverName: normKey(raw.driverName),
        createdAt: now,
        updatedAt: now,
        createdBy: u.username,
      });
    }

    db.general.unshift(...preparedGeneral);
    renumberScope(db, 'general');
    rebuildCategories(db);
    history.push({
      labelFa: `ثبت کلی پکینگ ${pk} (${preparedGeneral.length} ردیف)`,
      labelEn: `Add General Packing ${pk} (${preparedGeneral.length} rows)`,
      user: u.fullName || u.username,
      changes: preparedGeneral.map((g) => ({ scope: 'general', op: 'insert', id: g.id, after: g })),
    });
    const transitUpdated = syncTransitArrival(db, pk, sanitizeUser(u));
    addAudit(
      db,
      sanitizeUser(u),
      isContinuation ? 'CONTINUE_PACKING_GENERAL' : 'CREATE_PACKING_GENERAL',
      'general',
      pk,
      `${isContinuation ? 'ادامه ثبت روی پکینگ لیست' : 'ثبت پکینگ لیست جدید'} ${pk} (${preparedGeneral.length} ردیف)`,
    );
    await saveActiveDb();
    return { createdGeneral: preparedGeneral, createdDetailedCount: 0, transitUpdated } as T;
  }

  if (pathname === '/api/general/bulk' && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const patch = (body.patch || {}) as Partial<GeneralEntry>;
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('شناسه ردیف‌ها الزامی است', 'Row IDs are required'), 400);
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof GeneralEntry)[] = [
      'arrivalDate', 'releaseNo', 'releaseDate', 'supplier', 'dispatchLocation',
      'employerEntryMinutesNo', 'packageType', 'island', 'system', 'subSystem',
      'unit', 'billOfLadingNo', 'vehicleNo', 'opiInvitationNo', 'opiInvitationDate', 'driverName',
    ];
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        cleanPatch[k] = normKey(String(patch[k]));
      }
    }
    if (cleanPatch.employerEntryMinutesNo && !isValidDigitsOnly(String(cleanPatch.employerEntryMinutesNo))) {
      throw new StaticEngineError(errMsg('شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.', 'Employer Entry Minutes No. must contain digits only.'), 400);
    }
    if (patch.freightCost !== undefined && patch.freightCost !== null && Number.isFinite(Number(patch.freightCost))) {
      cleanPatch.freightCost = Number(patch.freightCost);
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    const touchedPackings = new Set<string>();
    const historyChanges: HistoryChange[] = [];
    for (const g of db.general) {
      if (!idSet.has(g.id)) continue;
      const before = { ...g };
      Object.assign(g, cleanPatch, { updatedAt: now });
      historyChanges.push({ scope: 'general', op: 'update', id: g.id, before, after: { ...g } });
      if (g.packingListNo) touchedPackings.add(g.packingListNo);
      updatedCount += 1;
    }
    renumberScope(db, 'general');
    rebuildCategories(db);
    if (historyChanges.length > 0) {
      history.push({
        labelFa: `ویرایش گروهی ${updatedCount} ردیف کلی`,
        labelEn: `Bulk Edit ${updatedCount} General Rows`,
        user: u.fullName || u.username,
        changes: historyChanges,
      });
    }
    let transitUpdated = 0;
    for (const pk of touchedPackings) {
      transitUpdated += syncTransitArrival(db, pk, sanitizeUser(u));
    }
    addAudit(db, sanitizeUser(u), 'BULK_UPDATE_GENERAL', 'general', `${updatedCount} rows`, `ویرایش گروهی ${updatedCount} ردیف در ثبت کلی تجهیزات`);
    await saveActiveDb();
    return { ok: true, updatedCount, transitUpdated } as T;
  }

  if (pathname.startsWith('/api/general/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.general.find((g) => g.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const pk = normKey((body.packingListNo as string) ?? item.packingListNo);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError(
        errMsg('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
        409,
        'CLOSED_PACKING_WARNING',
      );
    }
    const { acknowledgeClosed: _ack, rowNo: _ignoredRow, ...patch } = body as Partial<GeneralEntry> & { acknowledgeClosed?: boolean };
    if (patch.mapnaEntryMinutesNo !== undefined) {
      patch.mapnaEntryMinutesNo = normalizeDigits(normKey(patch.mapnaEntryMinutesNo));
    }

    if (patch.employerEntryMinutesNo !== undefined) {
      const cleanEmp = normalizeDigits(normKey(patch.employerEntryMinutesNo));
      if (cleanEmp && !isValidDigitsOnly(cleanEmp)) {
        throw new StaticEngineError(
          errMsg('شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.', 'Employer Entry Minutes No. must contain digits only.'),
          400,
        );
      }
      patch.employerEntryMinutesNo = cleanEmp;
    }

    if (patch.packageType !== undefined) {
      patch.packageType = normKey(patch.packageType);
    }
    if (patch.itemCount !== undefined) {
      patch.itemCount =
        patch.itemCount !== null && Number.isFinite(Number(patch.itemCount)) && Number(patch.itemCount) > 0
          ? Math.floor(Number(patch.itemCount))
          : null;
    }

    const finalArrival = normKey(patch.arrivalDate ?? item.arrivalDate);
    const finalReleaseNo = normKey(patch.releaseNo ?? item.releaseNo);
    const finalReleaseDate = finalReleaseNo ? (normKey(patch.releaseDate ?? item.releaseDate) || finalArrival) : finalArrival;

    const beforeGeneral = { ...item };
    Object.assign(item, {
      ...patch,
      releaseNo: finalReleaseNo,
      releaseDate: finalReleaseDate,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    renumberScope(db, 'general');
    rebuildCategories(db);
    history.push({
      labelFa: `ویرایش ردیف کلی ${item.packingListNo || item.rowNo}`,
      labelEn: `Edit General Row ${item.packingListNo || item.rowNo}`,
      user: u.fullName || u.username,
      changes: [{ scope: 'general', op: 'update', id: item.id, before: beforeGeneral, after: { ...item } }],
    });
    const transitUpdated = syncTransitArrival(db, item.packingListNo, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'UPDATE_GENERAL', 'general', `${item.packingListNo} (#${item.rowNo})`, `ویرایش ردیف جنرال ${item.rowNo}`);
    await saveActiveDb();
    return { item, transitUpdated } as T;
  }

  if (pathname.startsWith('/api/general/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.general.findIndex((g) => g.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const cascadeDetailed = query.get('cascadeDetailed') === 'true';
    const [removed] = db.general.splice(idx, 1);
    const now = new Date().toISOString();
    const deletedBy = u.fullName || u.username;
    const historyChanges: HistoryChange[] = [
      { scope: 'general', op: 'delete', id: removed.id, before: removed, index: idx },
    ];
    const gTrash: TrashRecord = {
      id: makeId(),
      scope: 'general',
      deletedAt: now,
      deletedBy,
      targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
      data: removed,
    };
    db.trash.unshift(gTrash);
    historyChanges.push({ scope: 'trash', op: 'insert', id: gTrash.id, after: gTrash });

    let trashedDetailedCount = 0;
    if (cascadeDetailed) {
      const pk = normKey(removed.packingListNo);
      const pkg = normKey(removed.packageNo);
      const remaining: DetailedEntry[] = [];
      for (let di = 0; di < db.detailed.length; di += 1) {
        const d = db.detailed[di];
        if (normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg)) {
          trashedDetailedCount += 1;
          const dTrash: TrashRecord = {
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          };
          db.trash.unshift(dTrash);
          historyChanges.push({ scope: 'detailed', op: 'delete', id: d.id, before: d, index: di });
          historyChanges.push({ scope: 'trash', op: 'insert', id: dTrash.id, after: dTrash });
        } else {
          remaining.push(d);
        }
      }
      if (trashedDetailedCount > 0) {
        db.detailed = remaining;
        renumberScope(db, 'detailed');
      }
    }

    renumberScope(db, 'general');
    history.push({
      labelFa: `حذف ردیف کلی ${removed.packingListNo || removed.rowNo}`,
      labelEn: `Delete General Row ${removed.packingListNo || removed.rowNo}`,
      user: deletedBy,
      changes: historyChanges,
    });
    addAudit(db, sanitizeUser(u), 'DELETE_GENERAL', 'general', `${removed.packingListNo} (#${removed.rowNo})`, `انتقال ردیف جنرال ${removed.rowNo} به سطل بازیافت`);
    await saveActiveDb();
    return { ok: true, trashedDetailedCount } as T;
  }

  // (PATCH /api/general/bulk handled above /api/general/:id to avoid route shadowing)

  if (pathname === '/api/general/bulk-delete' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const cascadeDetailed = Boolean(body.cascadeDetailed);
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion'), 400);
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = u.fullName || u.username;
    const removedRows: GeneralEntry[] = [];
    db.general = db.general.filter((g) => {
      if (idSet.has(g.id)) {
        removedRows.push(g);
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      db.trash.unshift({
        id: makeId(),
        scope: 'general',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
        data: removed,
      });
    }
    let trashedDetailedCount = 0;
    if (cascadeDetailed && removedRows.length > 0) {
      const pairs = new Set(removedRows.map((r) => `${normKey(r.packingListNo).toLowerCase()}::${normKey(r.packageNo).toLowerCase()}`));
      const packingsNoPkg = new Set(removedRows.filter((r) => !normKey(r.packageNo)).map((r) => normKey(r.packingListNo).toLowerCase()));
      db.detailed = db.detailed.filter((d) => {
        const pk = normKey(d.shipmentNo).toLowerCase();
        const pkg = normKey(d.packageNo).toLowerCase();
        if (pairs.has(`${pk}::${pkg}`) || packingsNoPkg.has(pk)) {
          trashedDetailedCount += 1;
          db.trash.unshift({
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          });
          return false;
        }
        return true;
      });
      if (trashedDetailedCount > 0) renumberScope(db, 'detailed');
    }
    renumberScope(db, 'general');
    addAudit(db, sanitizeUser(u), 'BULK_DELETE_GENERAL', 'general', `${removedRows.length} rows`, `حذف گروهی ${removedRows.length} ردیف از ثبت کلی`);
    await saveActiveDb();
    return { ok: true, deletedCount: removedRows.length, trashedDetailedCount } as T;
  }

  // ---------------- DETAILED ----------------
  if (pathname === '/api/detailed' && method === 'GET') {
    requireAuth();
    const q = query.get('q') || '';
    const island = query.get('island') || '';
    const system = query.get('system') || '';
    const subSystem = query.get('subSystem') || '';
    const unit = query.get('unit') || '';
    const supplier = query.get('supplier') || '';
    const origin = query.get('origin') || '';
    const storageLocation = query.get('storageLocation') || '';
    const itemCategory = query.get('itemCategory') || '';
    const shipmentNo = normKey(query.get('shipmentNo'));
    const packageNo = normKey(query.get('packageNo'));
    const packingNos = parsePackingNosParam(query.get('packingNos'));
    const customFilters = parseCustomFiltersParam(query.get('customFilters'));
    const colFilters = parseColFiltersParam(query.get('colFilters'));
    const calendar: CalendarMode = query.get('calendar') === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = (query.get('sortBy') || '').trim();
    const sortDir: 'asc' | 'desc' = query.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const shortageOnly = query.get('shortageOnly') === 'true';
    const damagedOnly = query.get('damagedOnly') === 'true';
    const discrepancyOnly = query.get('discrepancyOnly') === 'true';
    const replacedOnly = query.get('replacedOnly') === 'true';
    const hasEmployerStock = query.get('hasEmployerStock') === 'true';
    const hasContractorStock = query.get('hasContractorStock') === 'true';
    const chemicalExpiry = (query.get('chemicalExpiry') || '').trim();
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const fetchAll = query.get('all') === 'true';
    const allIds = query.get('allIds') === 'true';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(query.get('pageSize') || 50)));

    const allExpiringChems = getExpiringChemicals(db.detailed.map(computeDetailedEntry), 30);
    const expiredChemIds = new Set<string>();
    const expiringSoonChemIds = new Set<string>();
    for (const c of allExpiringChems) {
      if (c.daysRemaining < 0) expiredChemIds.add(c.id);
      else expiringSoonChemIds.add(c.id);
    }
    const chemicalAlertSummary = {
      expiredCount: expiredChemIds.size,
      expiringSoonCount: expiringSoonChemIds.size,
      totalAlertCount: allExpiringChems.length,
    };

    const substitutedIds = new Set(
      (db.substitutions || []).map((s) => s.detailedId).filter(Boolean),
    );
    const shipmentFilterNorm = shipmentNo ? normDupPart(shipmentNo) : '';
    const preparedPkgFilter = packageNo ? preparePackageInfo(packageNo) : null;
    const compiledColFilters = compileColFilters(colFilters);

    const computedRaw: DetailedComputed[] = [];
    for (const d of db.detailed) {
      if (island && d.island !== island) continue;
      if (system && d.system !== system) continue;
      if (subSystem && d.subSystem !== subSystem) continue;
      if (unit && d.unit !== unit) continue;
      if (supplier && d.supplier !== supplier) continue;
      if (origin && d.origin !== origin) continue;
      if (storageLocation && d.storageLocation !== storageLocation) continue;
      if (itemCategory && (itemCategory === 'standard' ? Boolean(d.itemCategory) : (d.itemCategory || '') !== itemCategory)) continue;
      if (shipmentFilterNorm && normDupPart(d.shipmentNo) !== shipmentFilterNorm) continue;
      if (preparedPkgFilter && !matchesPreparedPackage(preparePackageInfo(d.packageNo), preparedPkgFilter)) continue;
      if (!matchesMultiPacking(d.shipmentNo, packingNos)) continue;
      if (!inDateRange(d.arrivalDate, fromDate, toDate)) continue;
      if (!matchSearch([
        d.rowNo, d.shipmentNo, d.packageNo, d.itemNo, d.generalDescription, d.description,
        d.itemCode, d.mtoRef, d.supplier, d.origin, d.island, d.system, d.subSystem, d.unit,
        d.opiNo, d.merNo, d.repNo, d.materialBalanceNo, d.balanceStatus, d.gcvReceiptNo,
        d.receiver, d.mivContractorNo, d.smrContractorNo, d.smrMapnaNo, d.mivMapnaNo,
        d.storageLocation, d.notes, d.stocktakeStatus, d.chemicalType || '', d.itemCategory || '',
      ], q)) continue;
      const comp = computeDetailedEntry(d);
      if (!matchesCustomFilters(comp as unknown as Record<string, unknown>, customFilters)) continue;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(comp as unknown as Record<string, unknown>, compiledColFilters, calendar)) continue;
      if (shortageOnly && !comp.hasShortage) continue;
      if (damagedOnly && !comp.hasDamaged) continue;
      if (
        discrepancyOnly &&
        !isMerOpen(comp) &&
        !normKey(comp.merNo) &&
        !normKey(comp.merStatus) &&
        !comp.hasShortage &&
        !comp.hasDamaged
      ) {
        continue;
      }
      if (
        replacedOnly &&
        !isRepOpen(comp) &&
        !normKey(comp.repNo) &&
        !normKey(comp.repStatus) &&
        !substitutedIds.has(comp.id)
      ) {
        continue;
      }
      if (hasEmployerStock && (comp.opiPending || comp.mapnaInventory <= 0)) continue;
      if (hasContractorStock && (comp.opiPending || comp.contractorInventory <= 0)) continue;
      if (chemicalExpiry === 'expired' && !expiredChemIds.has(comp.id)) continue;
      if (chemicalExpiry === 'expiring_soon' && !expiringSoonChemIds.has(comp.id)) continue;
      if (chemicalExpiry === 'all' && !expiredChemIds.has(comp.id) && !expiringSoonChemIds.has(comp.id)) continue;
      computedRaw.push(comp);
    }

    const computedAll = sortBy
      ? (sortRowsByColumn(computedRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as DetailedComputed[])
      : [...computedRaw].reverse();

    const total = computedAll.length;
    const filteredSummary = computeSelectionFormulaSummary({ detailed: computedAll });

    if (allIds) {
      return {
        ids: computedAll.map((d) => d.id),
        total,
        filteredSummary,
        chemicalAlertSummary,
      } as T;
    }

    const start = (page - 1) * pageSize;
    const rawSlice = fetchAll ? computedAll : computedAll.slice(start, start + pageSize);
    const items = rawSlice.map(({ itemImage: _fullImg, ...rest }) => rest);
    return {
      items,
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
      chemicalAlertSummary,
    } as T;
  }

  if (pathname.startsWith('/api/detailed/') && pathname.endsWith('/image') && method === 'GET') {
    requireAuth(['admin', 'operator', 'viewer']);
    const id = pathname.slice('/api/detailed/'.length, -'/image'.length);
    const item = db.detailed.find((d) => d.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    return {
      id: item.id,
      hasImage: Boolean(item.itemImage || item.itemImageThumb),
      itemImage: item.itemImage || '',
      itemImageThumb: item.itemImageThumb || '',
    } as T;
  }

  if (pathname.startsWith('/api/detailed/') && pathname.endsWith('/image') && method === 'PUT') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.slice('/api/detailed/'.length, -'/image'.length);
    const item = db.detailed.find((d) => d.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const rawImg = typeof body.itemImage === 'string' && body.itemImage.startsWith('data:image/') ? body.itemImage : '';
    const rawThumb =
      rawImg && typeof body.itemImageThumb === 'string' && body.itemImageThumb.startsWith('data:image/')
        ? body.itemImageThumb
        : rawImg;
    const beforeDetailed = { ...item };
    if (rawImg) {
      item.itemImage = rawImg;
      item.itemImageThumb = rawThumb;
    } else {
      delete item.itemImage;
      delete item.itemImageThumb;
    }
    item.updatedAt = new Date().toISOString();
    history.push({
      labelFa: rawImg
        ? `تغییر تصویر آیتم جزئیات ${item.shipmentNo} (#${item.itemNo || item.rowNo})`
        : `حذف تصویر آیتم جزئیات ${item.shipmentNo} (#${item.itemNo || item.rowNo})`,
      labelEn: rawImg
        ? `Update Photo for Detailed Item ${item.shipmentNo} (#${item.itemNo || item.rowNo})`
        : `Remove Photo for Detailed Item ${item.shipmentNo} (#${item.itemNo || item.rowNo})`,
      user: u.fullName || u.username,
      changes: [{ scope: 'detailed', op: 'update', id: item.id, before: beforeDetailed, after: { ...item } }],
    });
    addAudit(
      db,
      sanitizeUser(u),
      rawImg ? 'UPDATE_DETAILED_IMAGE' : 'REMOVE_DETAILED_IMAGE',
      'detailed',
      `${item.shipmentNo} (#${item.rowNo})`,
      rawImg ? `ثبت/ویرایش تصویر آیتم ${item.rowNo}` : `حذف تصویر آیتم ${item.rowNo}`,
    );
    await saveActiveDb();
    const { itemImage: _omitted, ...computedLite } = computeDetailedEntry(item);
    return {
      ok: true,
      hasImage: Boolean(rawImg),
      item: computedLite,
      itemImage: rawImg,
      itemImageThumb: rawThumb,
    } as T;
  }

  if (pathname === '/api/detailed' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const pk = normKey(String(body.shipmentNo || ''));
    if (!pk) throw new StaticEngineError(errMsg('شماره محموله / پکینگ لیست الزامی است', 'Shipment / Packing List No. is required'), 400);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError(
        errMsg('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
        409,
        'CLOSED_PACKING_WARNING',
      );
    }

    const pkgNo = normKey(String(body.packageNo || ''));
    const itemNo = normalizeDigits(normKey(String(body.itemNo || ''))) || getNextSuggestedItemNo(db, pk, pkgNo);
    if (isDetailedItemNoTaken(db, pk, pkgNo, itemNo)) {
      throw new StaticEngineError(
        errMsg(
          `شماره آیتم ${itemNo} برای پکینگ «${pk}» و نگله «${pkgNo || '-'}» تکراری است.`,
          `Item No. ${itemNo} already exists for Packing "${pk}" and Package "${pkgNo || '-'}".`,
        ),
        409,
        'DUPLICATE_ITEM_NO',
      );
    }

    const shared = getGeneralSharedInfo(db, pk, pkgNo);
    const now = new Date().toISOString();
    const { acknowledgeClosed: _ack, rowNo: _ignoredRow, ...raw } = body;
    const rawDet = raw as Partial<DetailedEntry>;
    const cleanDescription = normKey(rawDet.description);
    const cleanNotes = normKey(rawDet.notes);
    const rawGenDesc = normKey(rawDet.generalDescription);
    const resolvedGeneralDesc = rawGenDesc
      ? formatGeneralDescriptionCase(rawGenDesc)
      : inferGeneralDescription(cleanDescription);
    const rawChemType = normKey(rawDet.chemicalType);
    const inferredCls = !rawDet.itemCategory
      ? inferItemClassification(cleanDescription, cleanNotes, resolvedGeneralDesc)
      : { itemCategory: rawDet.itemCategory, chemicalType: '' };
    const resolvedItemCategory = rawDet.itemCategory || (rawChemType ? 'chemicals' : inferredCls.itemCategory);
    const resolvedChemType = rawChemType || (resolvedItemCategory === 'chemicals' ? inferredCls.chemicalType : '');
    let resolvedProdDate = normKey(rawDet.productionDate);
    let resolvedExpDate = normKey(rawDet.expirationDate);
    if (resolvedItemCategory === 'chemicals' && (!resolvedProdDate || !resolvedExpDate)) {
      const extDates = extractChemicalDatesFromTexts([cleanNotes, cleanDescription, resolvedGeneralDesc], 'jalali');
      if (!resolvedProdDate && extDates.productionDate) resolvedProdDate = extDates.productionDate;
      if (!resolvedExpDate && extDates.expirationDate) resolvedExpDate = extDates.expirationDate;
    }

    const created: DetailedEntry = {
      id: makeId(),
      rowNo: '0',
      arrivalDate: normKey(rawDet.arrivalDate) || shared?.arrivalDate || '',
      supplier: normKey(rawDet.supplier) || shared?.supplier || '',
      origin: normKey(rawDet.origin) || shared?.dispatchLocation || '',
      shipmentNo: pk,
      packageNo: pkgNo,
      itemNo,
      generalDescription: resolvedGeneralDesc,
      description: cleanDescription,
      size: normKey(rawDet.size),
      itemCode: normKey(rawDet.itemCode),
      packingQty: rawDet.packingQty ?? null,
      actualQty: rawDet.actualQty ?? null,
      damagedQty: rawDet.damagedQty ?? null,
      mtoRef: normKey(rawDet.mtoRef),
      repNo: normKey(rawDet.repNo),
      repStatus: normKey(rawDet.repStatus),
      repReprocured: normKey(rawDet.repReprocured),
      repDescription: normKey(rawDet.repDescription),
      countingUnit: normalizeCountingUnitToFa(rawDet.countingUnit),
      island: normKey(rawDet.island) || shared?.island || '',
      system: normKey(rawDet.system) || shared?.system || '',
      subSystem: normKey(rawDet.subSystem) || shared?.subSystem || '',
      unit: normKey(rawDet.unit) || shared?.unit || '',
      opiNo: normKey(rawDet.opiNo),
      opiDate: normKey(rawDet.opiDate),
      merNo: normKey(rawDet.merNo),
      merStatus: normKey(rawDet.merStatus),
      notes: cleanNotes,
      materialBalanceNo: normKey(rawDet.materialBalanceNo),
      balanceStatus: normKey(rawDet.balanceStatus),
      storageLocation: normKey(rawDet.storageLocation),
      gcvReceiptNo: normKey(rawDet.gcvReceiptNo),
      receiver: normKey(rawDet.receiver),
      gcvDeliveredQty: rawDet.gcvDeliveredQty ?? null,
      mivContractorNo: normKey(rawDet.mivContractorNo),
      mivContractorDate: normKey(rawDet.mivContractorDate),
      mivContractorQty: rawDet.mivContractorQty ?? null,
      mivReceiver: normKey(rawDet.mivReceiver),
      smrContractorNo: normKey(rawDet.smrContractorNo),
      smrContractorDate: normKey(rawDet.smrContractorDate),
      smrContractorQty: rawDet.smrContractorQty ?? null,
      smrContractorNote: normKey(rawDet.smrContractorNote),
      smrMapnaNo: normKey(rawDet.smrMapnaNo),
      smrMapnaDate: normKey(rawDet.smrMapnaDate),
      smrMapnaQty: rawDet.smrMapnaQty ?? null,
      smrMapnaNote: normKey(rawDet.smrMapnaNote),
      smrDeliverer: normKey(rawDet.smrDeliverer),
      mivMapnaNo: normKey(rawDet.mivMapnaNo),
      mivMapnaDate: normKey(rawDet.mivMapnaDate),
      mivMapnaQty: rawDet.mivMapnaQty ?? null,
      stocktakeInfo: normKey(rawDet.stocktakeInfo),
      stocktakeStatus: normKey(rawDet.stocktakeStatus),
      stocktakeDate: normKey(rawDet.stocktakeDate),
      itemCategory: resolvedItemCategory,
      chemicalType: resolvedChemType,
      productionDate: resolvedProdDate,
      expirationDate: resolvedExpDate,
      ...(typeof rawDet.itemImage === 'string' && rawDet.itemImage.startsWith('data:image/')
        ? {
            itemImage: rawDet.itemImage,
            itemImageThumb:
              typeof rawDet.itemImageThumb === 'string' && rawDet.itemImageThumb.startsWith('data:image/')
                ? rawDet.itemImageThumb
                : rawDet.itemImage,
          }
        : {}),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.detailed.unshift(created);
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    history.push({
      labelFa: `ثبت ردیف جزئیات ${pk} / #${itemNo}`,
      labelEn: `Add Detailed Item ${pk} / #${itemNo}`,
      user: u.fullName || u.username,
      changes: [{ scope: 'detailed', op: 'insert', id: created.id, after: created }],
    });
    const transitUpdated = syncTransitArrival(db, pk, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'CREATE_DETAILED', 'detailed', `${pk} / ${pkgNo || '-'} (#${itemNo})`, `ثبت آیتم جزئیات ردیف ${created.rowNo}`);
    await saveActiveDb();
    return { item: computeDetailedEntry(created), transitUpdated } as T;
  }

  if (pathname.startsWith('/api/detailed/') && pathname.endsWith('/backfill') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.slice('/api/detailed/'.length, -'/backfill'.length);
    const item = db.detailed.find((d) => d.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const qty = Number(body.qty);
    if (!qty || qty <= 0) {
      throw new StaticEngineError(errMsg('تعداد جبران کسری باید بزرگتر از صفر باشد', 'Fulfilled quantity must be greater than zero'), 400);
    }
    const rec: ShortageBackfillRecord = {
      id: makeId(),
      qty,
      arrivalDate: normKey(String(body.arrivalDate || '')),
      shipmentNo: normKey(String(body.shipmentNo || '')) || item.shipmentNo,
      packageNo: normKey(String(body.packageNo || '')) || item.packageNo,
      note: normKey(String(body.note || '')),
      recordedBy: u.fullName || u.username,
      recordedAt: new Date().toISOString(),
    };
    item.shortageBackfills = [...(item.shortageBackfills || []), rec];
    item.updatedAt = new Date().toISOString();
    const computed = computeDetailedEntry(item);
    const transitUpdated = syncTransitArrival(db, rec.shipmentNo, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'BACKFILL_SHORTAGE', 'detailed', `${item.shipmentNo} (#${item.rowNo})`, `جبران کسری به مقدار ${qty}`);
    await saveActiveDb();
    return { item: computed, transitUpdated } as T;
  }

  if (pathname === '/api/detailed/bulk' && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const patch = (body.patch || {}) as Partial<DetailedEntry>;
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('شناسه ردیف‌ها الزامی است', 'Row IDs are required'), 400);
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof DetailedEntry)[] = [
      'arrivalDate', 'supplier', 'origin', 'island', 'system', 'subSystem', 'unit',
      'countingUnit', 'storageLocation', 'receiver', 'notes', 'itemCategory',
      'chemicalType', 'productionDate', 'expirationDate', 'merStatus', 'repStatus', 'repReprocured',
      'balanceStatus', 'mivReceiver', 'smrDeliverer',
    ];
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        cleanPatch[k] = k === 'countingUnit'
          ? normalizeCountingUnitToFa(String(patch[k]))
          : normKey(String(patch[k]));
      }
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    const historyChanges: HistoryChange[] = [];
    for (const d of db.detailed) {
      if (!idSet.has(d.id)) continue;
      const before = { ...d };
      Object.assign(d, cleanPatch, { updatedAt: now });
      historyChanges.push({ scope: 'detailed', op: 'update', id: d.id, before, after: { ...d } });
      updatedCount += 1;
    }
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    if (historyChanges.length > 0) {
      history.push({
        labelFa: `ویرایش گروهی ${updatedCount} ردیف جزئیات`,
        labelEn: `Bulk Edit ${updatedCount} Detailed Rows`,
        user: u.fullName || u.username,
        changes: historyChanges,
      });
    }
    addAudit(db, sanitizeUser(u), 'BULK_UPDATE_DETAILED', 'detailed', `${updatedCount} rows`, `ویرایش گروهی ${updatedCount} ردیف در ثبت جزئیات تجهیزات`);
    await saveActiveDb();
    return { ok: true, updatedCount } as T;
  }

  if (pathname.startsWith('/api/detailed/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.detailed.find((d) => d.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const pk = normKey((body.shipmentNo as string) ?? item.shipmentNo);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError(
        errMsg('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
        409,
        'CLOSED_PACKING_WARNING',
      );
    }
    const { acknowledgeClosed: _ack, rowNo: _ignoredRow, ...patch } = body as Partial<DetailedEntry> & { acknowledgeClosed?: boolean };
    const nextPkg = normKey(patch.packageNo ?? item.packageNo);
    const nextItemNo = normalizeDigits(normKey(patch.itemNo ?? item.itemNo));
    if (nextItemNo && isDetailedItemNoTaken(db, pk, nextPkg, nextItemNo, item.id)) {
      throw new StaticEngineError(
        errMsg(
          `شماره آیتم ${nextItemNo} برای پکینگ «${pk}» و نگله «${nextPkg || '-'}» تکراری است.`,
          `Item No. ${nextItemNo} already exists for Packing "${pk}" and Package "${nextPkg || '-'}".`,
        ),
        409,
        'DUPLICATE_ITEM_NO',
      );
    }

    if (patch.generalDescription !== undefined) {
      patch.generalDescription = formatGeneralDescriptionCase(patch.generalDescription);
    }
    if (patch.countingUnit !== undefined) {
      patch.countingUnit = normalizeCountingUnitToFa(patch.countingUnit);
    }

    const beforeDetailed = { ...item };
    const { itemImage: patchImage, itemImageThumb: patchThumb, ...restPatch } = patch;
    Object.assign(item, {
      ...restPatch,
      shipmentNo: pk,
      packageNo: nextPkg,
      itemNo: nextItemNo,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    if (patchImage !== undefined) {
      if (typeof patchImage === 'string' && patchImage.startsWith('data:image/')) {
        item.itemImage = patchImage;
        item.itemImageThumb =
          typeof patchThumb === 'string' && patchThumb.startsWith('data:image/')
            ? patchThumb
            : patchImage;
      } else {
        delete item.itemImage;
        delete item.itemImageThumb;
      }
    }
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    history.push({
      labelFa: `ویرایش ردیف جزئیات ${item.shipmentNo} (#${item.rowNo})`,
      labelEn: `Edit Detailed Row ${item.shipmentNo} (#${item.rowNo})`,
      user: u.fullName || u.username,
      changes: [{ scope: 'detailed', op: 'update', id: item.id, before: beforeDetailed, after: { ...item } }],
    });
    const transitUpdated = syncTransitArrival(db, item.shipmentNo, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'UPDATE_DETAILED', 'detailed', `${item.shipmentNo} (#${item.rowNo})`, `ویرایش آیتم جزئیات ${item.rowNo}`);
    await saveActiveDb();
    return { item: computeDetailedEntry(item), transitUpdated } as T;
  }

  if (pathname.startsWith('/api/detailed/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.detailed.findIndex((d) => d.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const [removed] = db.detailed.splice(idx, 1);
    const dTrash: TrashRecord = {
      id: makeId(),
      scope: 'detailed',
      deletedAt: new Date().toISOString(),
      deletedBy: u.fullName || u.username,
      targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
      data: removed,
    };
    db.trash.unshift(dTrash);
    renumberScope(db, 'detailed');
    history.push({
      labelFa: `حذف ردیف جزئیات ${removed.shipmentNo} (#${removed.rowNo})`,
      labelEn: `Delete Detailed Row ${removed.shipmentNo} (#${removed.rowNo})`,
      user: u.fullName || u.username,
      changes: [
        { scope: 'detailed', op: 'delete', id: removed.id, before: removed, index: idx },
        { scope: 'trash', op: 'insert', id: dTrash.id, after: dTrash },
      ],
    });
    addAudit(db, sanitizeUser(u), 'DELETE_DETAILED', 'detailed', `${removed.shipmentNo} (#${removed.rowNo})`, `انتقال ردیف جزئیات ${removed.rowNo} به سطل بازیافت`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // (PATCH /api/detailed/bulk handled above /api/detailed/:id to avoid route shadowing)

  if (pathname === '/api/detailed/bulk-delete' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion'), 400);
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = u.fullName || u.username;
    const removedRows: DetailedEntry[] = [];
    db.detailed = db.detailed.filter((d) => {
      if (idSet.has(d.id)) {
        removedRows.push(d);
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      db.trash.unshift({
        id: makeId(),
        scope: 'detailed',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
        data: removed,
      });
    }
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'BULK_DELETE_DETAILED', 'detailed', `${removedRows.length} rows`, `حذف گروهی ${removedRows.length} ردیف از ثبت جزئیات`);
    await saveActiveDb();
    return { ok: true, deletedCount: removedRows.length } as T;
  }

  // ---------------- TRANSIT ----------------
  if (pathname === '/api/transit' && method === 'GET') {
    requireAuth();
    const q = query.get('q') || '';
    const status = query.get('status') || '';
    const supplier = query.get('supplier') || '';
    const system = query.get('system') || '';
    const subSystem = query.get('subSystem') || '';
    const unit = query.get('unit') || '';
    const dispatchLocation = query.get('dispatchLocation') || '';
    const carrierContractor = query.get('carrierContractor') || '';
    const packingNos = parsePackingNosParam(query.get('packingNos'));
    const customFilters = parseCustomFiltersParam(query.get('customFilters'));
    const colFilters = parseColFiltersParam(query.get('colFilters'));
    const calendar: CalendarMode = query.get('calendar') === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = (query.get('sortBy') || '').trim();
    const sortDir: 'asc' | 'desc' = query.get('sortDir') === 'desc' ? 'desc' : 'asc';
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const fetchAll = query.get('all') === 'true';
    const allIds = query.get('allIds') === 'true';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(query.get('pageSize') || 50)));

    const compiledColFilters = compileColFilters(colFilters);
    const filteredRaw = db.transit.filter((t) => {
      if (status && t.overallStatus !== status) return false;
      if (supplier && t.supplier !== supplier) return false;
      if (system && t.system !== system) return false;
      if (subSystem && t.subSystem !== subSystem) return false;
      if (unit && t.unit !== unit) return false;
      if (dispatchLocation && t.dispatchLocation !== dispatchLocation) return false;
      if (carrierContractor && t.carrierContractor !== carrierContractor) return false;
      if (!matchesMultiPacking(t.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(t as unknown as Record<string, unknown>, customFilters)) return false;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(t as unknown as Record<string, unknown>, compiledColFilters, calendar)) return false;
      if (!inDateRange(t.arrivalDate, fromDate, toDate)) return false;
      return matchSearch([
        t.rowNo, t.overallStatus, t.packingListNo, t.packageNo, t.itemDescription,
        t.supplier, t.dispatchLocation, t.releaseNetNo, t.interimNo, t.system,
        t.subSystem, t.unit, t.equipmentSupplyCode, t.carrierContractor, t.billOfLadingNo,
      ], q);
    });

    const filtered = sortBy
      ? (sortRowsByColumn(filteredRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as TransitEntry[])
      : [...filteredRaw].reverse();

    const total = filtered.length;
    const filteredSummary = computeSelectionFormulaSummary({ transit: filtered });

    if (allIds) {
      return {
        ids: filtered.map((t) => t.id),
        total,
        filteredSummary,
      } as T;
    }

    const start = (page - 1) * pageSize;
    return {
      items: fetchAll ? filtered : filtered.slice(start, start + pageSize),
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
    } as T;
  }

  if (pathname === '/api/transit' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const pk = normKey(String(body.packingListNo || ''));
    const alreadyInWarehouse =
      pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
    const now = new Date().toISOString();
    const { rowNo: _ignoredRow, ...raw } = body;
    const requestedStatus = normalizeTransitStatus(
      String(body.overallStatus || ''),
      db.categories.transitStatus,
    );
    const resolvedStatus = alreadyInWarehouse ? 'رسیده' : requestedStatus;
    const created: TransitEntry = {
      ...(raw as unknown as TransitEntry),
      id: makeId(),
      rowNo: '0',
      packingListNo: pk,
      overallStatus: resolvedStatus,
      linkedGeneralPackingNo: alreadyInWarehouse ? pk : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.transit.unshift(created);
    renumberScope(db, 'transit');
    rebuildCategories(db);
    history.push({
      labelFa: `ثبت محموله در راه ${pk || created.rowNo}`,
      labelEn: `Add In-Transit Shipment ${pk || created.rowNo}`,
      user: u.fullName || u.username,
      changes: [{ scope: 'transit', op: 'insert', id: created.id, after: created }],
    });
    addAudit(db, sanitizeUser(u), 'CREATE_TRANSIT', 'transit', pk || created.rowNo, `ثبت محموله در راه ${pk || created.rowNo}`);
    await saveActiveDb();
    return { item: created } as T;
  }

  if (pathname === '/api/transit/bulk' && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const patch = (body.patch || {}) as Partial<TransitEntry>;
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('شناسه ردیف‌ها الزامی است', 'Row IDs are required'), 400);
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof TransitEntry)[] = [
      'arrivalDate', 'overallStatus', 'inspectionRequest', 'releaseNetNo', 'releaseNetDate',
      'mapnaShippingNotice', 'interimNo', 'interimDate', 'supplier', 'dispatchLocation',
      'system', 'subSystem', 'unit', 'equipmentSupplyCode', 'carrierContractor', 'billOfLadingNo',
    ];
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        cleanPatch[k] = k === 'overallStatus'
          ? normalizeTransitStatus(String(patch[k]), db.categories.transitStatus)
          : normKey(String(patch[k]));
      }
    }
    if (patch.amount !== undefined && patch.amount !== null && Number.isFinite(Number(patch.amount))) {
      cleanPatch.amount = Number(patch.amount);
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const t of db.transit) {
      if (!idSet.has(t.id)) continue;
      Object.assign(t, cleanPatch, { updatedAt: now });
      updatedCount += 1;
    }
    renumberScope(db, 'transit');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'BULK_UPDATE_TRANSIT', 'transit', `${updatedCount} rows`, `ویرایش گروهی ${updatedCount} ردیف در بخش در راه`);
    await saveActiveDb();
    return { ok: true, updatedCount } as T;
  }

  if (pathname === '/api/transit/bulk-delete' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion'), 400);
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = u.fullName || u.username;
    const removedRows: TransitEntry[] = [];
    db.transit = db.transit.filter((t) => {
      if (idSet.has(t.id)) {
        removedRows.push(t);
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      db.trash.unshift({
        id: makeId(),
        scope: 'transit',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
        data: removed,
      });
    }
    renumberScope(db, 'transit');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'BULK_DELETE_TRANSIT', 'transit', `${removedRows.length} rows`, `حذف گروهی ${removedRows.length} ردیف از بخش در راه`);
    await saveActiveDb();
    return { ok: true, deletedCount: removedRows.length } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.transit.find((t) => t.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const { rowNo: _ignoredRow, ...patch } = body as Partial<TransitEntry>;
    if (patch.overallStatus !== undefined) {
      patch.overallStatus = normalizeTransitStatus(patch.overallStatus, db.categories.transitStatus);
    }
    const beforeTransit = { ...item };
    Object.assign(item, { ...patch, rowNo: item.rowNo, updatedAt: new Date().toISOString() });
    renumberScope(db, 'transit');
    rebuildCategories(db);
    history.push({
      labelFa: `ویرایش محموله در راه ${item.packingListNo || item.rowNo}`,
      labelEn: `Edit In-Transit ${item.packingListNo || item.rowNo}`,
      user: u.fullName || u.username,
      changes: [{ scope: 'transit', op: 'update', id: item.id, before: beforeTransit, after: { ...item } }],
    });
    addAudit(db, sanitizeUser(u), 'UPDATE_TRANSIT', 'transit', item.packingListNo || item.rowNo, `ویرایش محموله در راه`);
    await saveActiveDb();
    return { item } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.transit.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const [removed] = db.transit.splice(idx, 1);
    const tTrash: TrashRecord = {
      id: makeId(),
      scope: 'transit',
      deletedAt: new Date().toISOString(),
      deletedBy: u.fullName || u.username,
      targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
      data: removed,
    };
    db.trash.unshift(tTrash);
    renumberScope(db, 'transit');
    history.push({
      labelFa: `حذف محموله در راه ${removed.packingListNo || removed.rowNo}`,
      labelEn: `Delete In-Transit ${removed.packingListNo || removed.rowNo}`,
      user: u.fullName || u.username,
      changes: [
        { scope: 'transit', op: 'delete', id: removed.id, before: removed, index: idx },
        { scope: 'trash', op: 'insert', id: tTrash.id, after: tTrash },
      ],
    });
    addAudit(db, sanitizeUser(u), 'DELETE_TRANSIT', 'transit', removed.packingListNo || removed.rowNo, `انتقال ردیف در راه به سطل بازیافت`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- RECYCLE BIN / TRASH ----------------
  if (pathname === '/api/trash' && method === 'GET') {
    requireAuth();
    const scope = (query.get('scope') || '').trim();
    const q = query.get('q') || '';
    const colFilters = parseColFiltersParam(query.get('colFilters'));
    const calendar: CalendarMode = query.get('calendar') === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = (query.get('sortBy') || '').trim();
    const sortDir = query.get('sortDir') === 'asc' ? 'asc' : query.get('sortDir') === 'desc' ? 'desc' : '';
    const idsOnly = query.get('idsOnly') === 'true';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(500, Math.max(10, Number(query.get('pageSize') || 50)));

    const { getLinkedCount, scopeCounts } = buildTrashLinkedDetailedCounts(db.trash);
    const hasColFilters = Object.keys(colFilters).length > 0;
    const compiledColFilters = hasColFilters ? compileColFilters(colFilters) : null;
    const needProjection = hasColFilters || Boolean(sortBy) || Boolean(q.trim());

    const matchedEntries: Array<{ item: TrashRecord; projected?: Record<string, unknown> }> = [];
    for (let i = 0; i < db.trash.length; i += 1) {
      const item = db.trash[i];
      if (scope && item.scope !== scope) continue;
      if (needProjection) {
        const proj = projectTrashRowForQuery(item);
        if (
          q.trim() &&
          !matchSearch(
            [
              item.targetLabel,
              item.deletedBy,
              item.scope,
              proj.packingNo,
              proj.packageNo,
              proj.itemNo,
              proj.description,
              proj.supplier,
              proj.island,
            ],
            q,
          )
        ) {
          continue;
        }
        if (compiledColFilters && !matchesCompiledColFilters(proj, compiledColFilters, calendar)) {
          continue;
        }
        matchedEntries.push({ item, projected: proj });
      } else {
        matchedEntries.push({ item });
      }
    }

    if (sortBy && sortDir) {
      const projectedList = matchedEntries.map((entry, idx) => ({
        ...(entry.projected || projectTrashRowForQuery(entry.item)),
        __origIdx: idx,
      }));
      const sorted = sortRowsByColumn(projectedList, sortBy, sortDir);
      const reordered: typeof matchedEntries = new Array(sorted.length);
      for (let i = 0; i < sorted.length; i += 1) {
        reordered[i] = matchedEntries[Number(sorted[i].__origIdx)];
      }
      matchedEntries.length = 0;
      matchedEntries.push(...reordered);
    }

    const total = matchedEntries.length;
    if (idsOnly) {
      return {
        ids: matchedEntries.map((e) => e.item.id),
        total,
        scopeCounts,
      } as T;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const slice = matchedEntries.slice(start, start + pageSize);
    const items = slice.map(({ item }) =>
      item.scope === 'general'
        ? { ...item, linkedTrashDetailedCount: getLinkedCount(item) }
        : item,
    );

    return {
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      scopeCounts,
    } as T;
  }

  if (pathname === '/api/trash/bulk-restore' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const restoreDetailed = Boolean(body.restoreDetailed);
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('هیچ ردیفی برای بازیابی انتخاب نشده است', 'No rows selected for restore'), 400);
    }

    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const activeDupKeys = buildActiveDupKeySets(db);

    const restoredGeneral: GeneralEntry[] = [];
    const restoredDetailed: DetailedEntry[] = [];
    const restoredTransit: TransitEntry[] = [];
    const linkedGeneralPairs: Array<{ pk: string; pkg: string }> = [];
    const remainingAfterPrimary: TrashRecord[] = [];
    let restoredCount = 0;
    let restoredDetailedCount = 0;
    let skippedConflicts = 0;

    for (let i = 0; i < db.trash.length; i += 1) {
      const entry = db.trash[i];
      if (!idSet.has(entry.id)) {
        remainingAfterPrimary.push(entry);
        continue;
      }
      const dupKey = buildTrashEntryDupKey(entry.scope, entry.data);
      if (entry.scope === 'general') {
        const g = entry.data as GeneralEntry;
        if (dupKey && activeDupKeys.general.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.general.add(dupKey);
        restoredGeneral.push({ ...g, updatedAt: now });
        restoredCount += 1;
        if (restoreDetailed) {
          const pk = normKey(g.packingListNo);
          if (pk) linkedGeneralPairs.push({ pk, pkg: normKey(g.packageNo) });
        }
      } else if (entry.scope === 'detailed') {
        const d = entry.data as DetailedEntry;
        if (dupKey && activeDupKeys.detailed.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.detailed.add(dupKey);
        restoredDetailed.push({ ...d, updatedAt: now });
        restoredCount += 1;
      } else {
        const t = entry.data as TransitEntry;
        if (dupKey && activeDupKeys.transit.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.transit.add(dupKey);
        restoredTransit.push({ ...t, updatedAt: now });
        restoredCount += 1;
      }
    }

    let finalRemainingTrash = remainingAfterPrimary;
    if (restoreDetailed && linkedGeneralPairs.length > 0) {
      const exactPairs = new Set<string>();
      const wholePackings = new Set<string>();
      for (const pair of linkedGeneralPairs) {
        if (pair.pkg) exactPairs.add(`${pair.pk}\u0000${pair.pkg}`);
        else wholePackings.add(pair.pk);
      }
      const nextRemaining: TrashRecord[] = [];
      for (let i = 0; i < remainingAfterPrimary.length; i += 1) {
        const tr = remainingAfterPrimary[i];
        if (tr.scope === 'detailed') {
          const d = tr.data as DetailedEntry;
          const pk = normKey(d.shipmentNo);
          const pkg = normKey(d.packageNo);
          const matches = wholePackings.has(pk) || exactPairs.has(`${pk}\u0000${pkg}`);
          if (matches) {
            const detKey = buildDetailedDupKey(d);
            if (!detKey || !activeDupKeys.detailed.has(detKey)) {
              if (detKey) activeDupKeys.detailed.add(detKey);
              restoredDetailed.push({ ...d, updatedAt: now });
              restoredDetailedCount += 1;
              continue;
            }
          }
        }
        nextRemaining.push(tr);
      }
      finalRemainingTrash = nextRemaining;
    }

    db.trash = finalRemainingTrash;
    if (restoredGeneral.length > 0) {
      db.general = [...restoredGeneral, ...db.general];
      renumberScope(db, 'general');
    }
    if (restoredDetailed.length > 0) {
      db.detailed = [...restoredDetailed, ...db.detailed];
      renumberScope(db, 'detailed');
    }
    if (restoredTransit.length > 0) {
      db.transit = [...restoredTransit, ...db.transit];
      renumberScope(db, 'transit');
    }
    rebuildCategories(db);
    addAudit(
      db,
      sanitizeUser(u),
      'BULK_RESTORE_TRASH',
      'trash',
      `${restoredCount} rows`,
      `بازیابی گروهی ${restoredCount} ردیف از سطل بازیافت${
        restoredDetailedCount > 0 ? ` همراه با ${restoredDetailedCount} ردیف جزئیات مرتبط` : ''
      }${skippedConflicts > 0 ? ` (${skippedConflicts} مورد تکراری رد شد)` : ''}`,
    );
    await saveActiveDb();
    return { ok: true, restoredCount, restoredDetailedCount, skippedConflicts } as T;
  }

  if (pathname === '/api/trash/bulk-delete' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (ids.length === 0) {
      throw new StaticEngineError(errMsg('هیچ ردیفی برای حذف دائمی انتخاب نشده است', 'No rows selected for permanent deletion'), 400);
    }
    const idSet = new Set(ids);
    const before = db.trash.length;
    db.trash = db.trash.filter((item) => !idSet.has(item.id));
    const deletedCount = before - db.trash.length;
    addAudit(db, sanitizeUser(u), 'BULK_PURGE_TRASH', 'trash', `${deletedCount} rows`, `حذف دائمی گروهی ${deletedCount} ردیف از سطل بازیافت`);
    await saveActiveDb();
    return { ok: true, deletedCount } as T;
  }

  if (pathname.startsWith('/api/trash/') && pathname.endsWith('/restore') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.slice('/api/trash/'.length, -'/restore'.length);
    const idx = db.trash.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('آیتم در سطل بازیافت یافت نشد', 'Trash item not found'), 404);
    const restoreDetailed = query.get('restoreDetailed') === 'true';
    const entry = db.trash[idx];
    let restoredDetailedCount = 0;

    if (isTrashRestoreDuplicate(entry, db)) {
      if (entry.scope === 'general') {
        const g = entry.data as GeneralEntry;
        throw new StaticEngineError(
          errMsg(
            `این ردیف تجهیزات کلی (پکینگ ${g.packingListNo || '-'} / نگله ${g.packageNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول ثبت کلی وجود دارد.`,
            `This general row (Packing ${g.packingListNo || '-'} / Package ${g.packageNo || '-'}) already exists in the General register according to duplicate rules.`,
          ),
          409,
        );
      }
      if (entry.scope === 'detailed') {
        const d = entry.data as DetailedEntry;
        throw new StaticEngineError(
          errMsg(
            `این ردیف جزئیات (محموله ${d.shipmentNo || '-'} / نگله ${d.packageNo || '-'} / آیتم ${d.itemNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول جزئیات وجود دارد.`,
            `This detailed row (Shipment ${d.shipmentNo || '-'} / Package ${d.packageNo || '-'} / Item ${d.itemNo || '-'}) already exists in the Detailed register according to duplicate rules.`,
          ),
          409,
        );
      }
      const t = entry.data as TransitEntry;
      throw new StaticEngineError(
        errMsg(
          `این محموله در راه (پکینگ ${t.packingListNo || '-'} / نگله ${t.packageNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول محموله‌های در راه وجود دارد.`,
          `This in-transit row (Packing ${t.packingListNo || '-'} / Package ${t.packageNo || '-'}) already exists in the In-Transit register according to duplicate rules.`,
        ),
        409,
      );
    }

    if (entry.scope === 'general') {
      const g = entry.data as GeneralEntry;
      db.trash.splice(idx, 1);
      db.general.unshift({ ...g, updatedAt: new Date().toISOString() });
      renumberScope(db, 'general');

      if (restoreDetailed) {
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const existingDetKeys = new Set<string>();
        for (const d of db.detailed) {
          const dk = buildDetailedDupKey(d);
          if (dk) existingDetKeys.add(dk);
        }
        const restoredLinked: DetailedEntry[] = [];
        const remainingTrash: TrashRecord[] = [];
        for (const tr of db.trash) {
          if (tr.scope === 'detailed') {
            const d = tr.data as DetailedEntry;
            const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            const detKey = buildDetailedDupKey(d);
            if (matches && (!detKey || !existingDetKeys.has(detKey))) {
              if (detKey) existingDetKeys.add(detKey);
              restoredLinked.push({ ...d, updatedAt: new Date().toISOString() });
              restoredDetailedCount += 1;
              continue;
            }
          }
          remainingTrash.push(tr);
        }
        db.trash = remainingTrash;
        if (restoredLinked.length > 0) {
          db.detailed = [...restoredLinked, ...db.detailed];
          renumberScope(db, 'detailed');
        }
      }
    } else if (entry.scope === 'detailed') {
      const d = entry.data as DetailedEntry;
      db.trash.splice(idx, 1);
      db.detailed.unshift({ ...d, updatedAt: new Date().toISOString() });
      renumberScope(db, 'detailed');
    } else {
      const t = entry.data as TransitEntry;
      db.trash.splice(idx, 1);
      db.transit.unshift({ ...t, updatedAt: new Date().toISOString() });
      renumberScope(db, 'transit');
    }
    rebuildCategories(db);
    addAudit(
      db,
      sanitizeUser(u),
      'RESTORE_TRASH',
      'trash',
      entry.targetLabel,
      `بازیابی ردیف ${entry.scope} (${entry.targetLabel})${
        restoredDetailedCount > 0 ? ` همراه با ${restoredDetailedCount} ردیف جزئیات` : ''
      }`,
    );
    await saveActiveDb();
    return { ok: true, restoredDetailedCount } as T;
  }

  if (pathname.startsWith('/api/trash/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.trash.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('آیتم در سطل بازیافت یافت نشد', 'Trash item not found'), 404);
    const [purged] = db.trash.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'PURGE_TRASH', 'trash', purged.targetLabel, `حذف دائمی ${purged.targetLabel}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- SITE ENTRY MINUTES ----------------
  if (pathname === '/api/site-entry' && method === 'GET') {
    requireAuth();
    const packingsSet = new Set<string>();
    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    return {
      minutes: db.siteEntryMinutes,
      generalEntries: [...db.general].reverse(),
      transitEntries: [...db.transit].reverse(),
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    } as T;
  }

  if (pathname === '/api/site-entry' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo);
    const cleanPackings = Array.from(new Set((raw.packingListNos || []).map(normKey).filter(Boolean)));
    const resolvedArrival = resolveSiteEntryArrivalAndRelease(
      cleanPackings,
      raw.releaseNoteNo,
      db.general,
      db.transit,
    );
    if (resolvedArrival.errorFa) {
      throw new StaticEngineError(
        errMsg(resolvedArrival.errorFa, resolvedArrival.errorEn || resolvedArrival.errorFa),
        400,
      );
    }
    const cleanDate = resolvedArrival.resolvedArrivalDate || normKey(raw.date);
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg(
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
        400,
      );
    }
    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            description: normKey(it?.description),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            dimensions: normKey(it?.dimensions),
            qty: normKey(it?.qty),
            unit: normKey(it?.unit),
            netWeight: normKey(it?.netWeight),
            grossWeight: normKey(it?.grossWeight),
            remarks: normKey(it?.remarks),
          }))
          .filter(
            (it) =>
              it.description ||
              it.packingListNo ||
              it.packageNo ||
              it.dimensions ||
              it.qty ||
              it.unit ||
              it.netWeight ||
              it.grossWeight ||
              it.remarks,
          )
      : undefined;

    const record: SiteEntryMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      releaseNoteNo: resolvedArrival.resolvedReleaseNoteNo,
      projectName: normKey(raw.projectName),
      entryType: raw.entryType === 'temporary' ? 'temporary' : 'permanent',
      goodsUsage:
        raw.goodsUsage === 'site_equip' || raw.goodsUsage === 'general' ? raw.goodsUsage : 'project',
      contractNo: normKey(raw.contractNo),
      date: cleanDate,
      arrivalDate: resolvedArrival.resolvedArrivalDate || normKey(raw.arrivalDate) || cleanDate,
      packingListNos: cleanPackings,
      supplier: normKey(raw.supplier),
      unit: normKey(raw.unit),
      system: normKey(raw.system),
      island: normKey(raw.island),
      origin: normKey(raw.origin),
      carrierCompany: normKey(raw.carrierCompany),
      trafficLocation: normKey(raw.trafficLocation),
      vehicleType: normKey(raw.vehicleType),
      driverName: normKey(raw.driverName),
      vehicleNo: normKey(raw.vehicleNo),
      waybillNo: normKey(raw.waybillNo),
      items: cleanItems,
      warehouseKeeper: normKey(raw.warehouseKeeper),
      contractorManager: normKey(raw.contractorManager),
      mapnaSecurity: normKey(raw.mapnaSecurity),
      qcChecked: Boolean(raw.qcChecked),
      qcTechOffice: normKey(raw.qcTechOffice),
      hseChecked: Boolean(raw.hseChecked),
      hseOfficer: normKey(raw.hseOfficer),
      equipmentSupply: normKey(raw.equipmentSupply) || normKey(raw.mapnaRep),
      employerRep: normKey(raw.employerRep),
      mapnaRep: normKey(raw.mapnaRep) || normKey(raw.equipmentSupply),
      conditionStatus: raw.conditionStatus || 'healthy',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.siteEntryMinutes.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_SITE_ENTRY_MINUTES', 'siteEntry', cleanNo, `ثبت صورتجلسه ورود کالا به کارگاه شماره ${cleanNo}`);
    await saveActiveDb();
    return { record } as T;
  }

  if (pathname.startsWith('/api/site-entry/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.siteEntryMinutes.find((r) => r.id === id);
    if (!rec) throw new StaticEngineError(errMsg('صورتجلسه ورود کالا یافت نشد', 'Site entry minutes record not found'), 404);
    const raw = body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo ?? rec.minutesNo);
    const cleanPackings = Array.from(
      new Set(((raw.packingListNos !== undefined ? raw.packingListNos : rec.packingListNos) || []).map(normKey).filter(Boolean)),
    );
    const resolvedArrival = resolveSiteEntryArrivalAndRelease(
      cleanPackings,
      raw.releaseNoteNo !== undefined ? raw.releaseNoteNo : rec.releaseNoteNo,
      db.general,
      db.transit,
    );
    if (resolvedArrival.errorFa) {
      throw new StaticEngineError(
        errMsg(resolvedArrival.errorFa, resolvedArrival.errorEn || resolvedArrival.errorFa),
        400,
      );
    }
    const cleanDate = resolvedArrival.resolvedArrivalDate || normKey(raw.date ?? rec.date);
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg(
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
        400,
      );
    }
    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          description: normKey(it?.description),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          dimensions: normKey(it?.dimensions),
          qty: normKey(it?.qty),
          unit: normKey(it?.unit),
          netWeight: normKey(it?.netWeight),
          grossWeight: normKey(it?.grossWeight),
          remarks: normKey(it?.remarks),
        }))
        .filter(
          (it) =>
            it.description ||
            it.packingListNo ||
            it.packageNo ||
            it.dimensions ||
            it.qty ||
            it.unit ||
            it.netWeight ||
            it.grossWeight ||
            it.remarks,
        );
    }
    rec.minutesNo = cleanNo;
    rec.releaseNoteNo = resolvedArrival.resolvedReleaseNoteNo;
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.entryType === 'permanent' || raw.entryType === 'temporary') rec.entryType = raw.entryType;
    if (raw.goodsUsage === 'project' || raw.goodsUsage === 'site_equip' || raw.goodsUsage === 'general') {
      rec.goodsUsage = raw.goodsUsage;
    }
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    rec.date = cleanDate;
    rec.arrivalDate = resolvedArrival.resolvedArrivalDate || normKey(raw.arrivalDate ?? rec.arrivalDate) || cleanDate;
    rec.packingListNos = cleanPackings;
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.origin !== undefined) rec.origin = normKey(raw.origin);
    if (raw.carrierCompany !== undefined) rec.carrierCompany = normKey(raw.carrierCompany);
    if (raw.trafficLocation !== undefined) rec.trafficLocation = normKey(raw.trafficLocation);
    if (raw.vehicleType !== undefined) rec.vehicleType = normKey(raw.vehicleType);
    if (raw.driverName !== undefined) rec.driverName = normKey(raw.driverName);
    if (raw.vehicleNo !== undefined) rec.vehicleNo = normKey(raw.vehicleNo);
    if (raw.waybillNo !== undefined) rec.waybillNo = normKey(raw.waybillNo);
    if (raw.warehouseKeeper !== undefined) rec.warehouseKeeper = normKey(raw.warehouseKeeper);
    if (raw.contractorManager !== undefined) rec.contractorManager = normKey(raw.contractorManager);
    if (raw.mapnaSecurity !== undefined) rec.mapnaSecurity = normKey(raw.mapnaSecurity);
    if (raw.qcChecked !== undefined) rec.qcChecked = Boolean(raw.qcChecked);
    if (raw.qcTechOffice !== undefined) rec.qcTechOffice = normKey(raw.qcTechOffice);
    if (raw.hseChecked !== undefined) rec.hseChecked = Boolean(raw.hseChecked);
    if (raw.hseOfficer !== undefined) rec.hseOfficer = normKey(raw.hseOfficer);
    if (raw.equipmentSupply !== undefined) {
      rec.equipmentSupply = normKey(raw.equipmentSupply);
      rec.mapnaRep = normKey(raw.equipmentSupply);
    } else if (raw.mapnaRep !== undefined) {
      rec.mapnaRep = normKey(raw.mapnaRep);
    }
    if (raw.employerRep !== undefined) rec.employerRep = normKey(raw.employerRep);
    if (raw.conditionStatus) rec.conditionStatus = raw.conditionStatus;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);

    addAudit(db, sanitizeUser(u), 'UPDATE_SITE_ENTRY_MINUTES', 'siteEntry', cleanNo, `ویرایش صورتجلسه ورود کالا به کارگاه شماره ${cleanNo}`);
    await saveActiveDb();
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/site-entry/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.siteEntryMinutes.findIndex((r) => r.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('صورتجلسه ورود کالا یافت نشد', 'Site entry minutes record not found'), 404);
    const [removed] = db.siteEntryMinutes.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_SITE_ENTRY_MINUTES', 'siteEntry', removed.minutesNo, `حذف صورتجلسه ورود کالا به کارگاه شماره ${removed.minutesNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- OPI ----------------
  if (pathname === '/api/opi' && method === 'GET') {
    requireAuth();
    const packingsSet = new Set<string>();
    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    return {
      invitations: db.opiInvitations,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      generalEntries: [...db.general].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    } as T;
  }

  if (pathname === '/api/opi' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<OpiInvitationRecord>;
    const cleanNo = normKey(raw.invitationNo);
    const cleanDate = normKey(raw.date);
    const cleanPackings = Array.from(new Set((raw.packingNos || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg('شماره دعوتنامه، تاریخ و حداقل یک پکینگ لیست الزامی است', 'Invitation No., date, and at least one Packing List are required'),
        400,
      );
    }
    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            itemNo: normKey(it?.itemNo),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            description: normKey(it?.description),
            uom: normKey(it?.uom),
            remarks: normKey(it?.remarks),
          }))
          .filter(
            (it) =>
              it.itemNo ||
              it.packingListNo ||
              it.packageNo ||
              it.description ||
              it.uom ||
              it.remarks,
          )
      : undefined;

    const record: OpiInvitationRecord = {
      id: makeId(),
      invitationNo: cleanNo,
      issueDate: normKey(raw.issueDate) || cleanDate,
      date: cleanDate,
      time: normKey(raw.time) || '09:00',
      packingNos: cleanPackings,
      location: normKey(raw.location),
      projectName: normKey(raw.projectName),
      system: normKey(raw.system),
      island: normKey(raw.island),
      unit: normKey(raw.unit),
      supplier: normKey(raw.supplier),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      items: cleanItems,
      installerContractor: normKey(raw.installerContractor),
      supplierRep: normKey(raw.supplierRep),
      equipmentSupply: normKey(raw.equipmentSupply),
      employerRep: normKey(raw.employerRep),
      notes: normKey(raw.notes),
      status: 'issued',
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.opiInvitations.unshift(record);
    const now = new Date().toISOString();
    for (const g of db.general) {
      if (cleanPackings.includes(normKey(g.packingListNo))) {
        g.opiInvitationNo = cleanNo;
        g.opiInvitationDate = cleanDate;
        g.updatedAt = now;
      }
    }
    for (const d of db.detailed) {
      if (cleanPackings.includes(normKey(d.shipmentNo))) {
        d.opiNo = cleanNo;
        d.opiDate = cleanDate;
        d.updatedAt = now;
      }
    }
    addAudit(db, sanitizeUser(u), 'ISSUE_OPI_INVITATION', 'opi', cleanNo, `صدور دعوتنامه OPI شماره ${cleanNo}`);
    await saveActiveDb();
    return { invitation: record } as T;
  }

  if (pathname.startsWith('/api/opi/') && pathname !== '/api/opi/results' && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.opiInvitations.find((x) => x.id === id);
    if (!rec) throw new StaticEngineError(errMsg('دعوتنامه OPI یافت نشد', 'OPI invitation not found'), 404);
    const raw = body as Partial<OpiInvitationRecord>;
    const cleanNo = normKey(raw.invitationNo ?? rec.invitationNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const cleanPackings = Array.from(
      new Set(((raw.packingNos !== undefined ? raw.packingNos : rec.packingNos) || []).map(normKey).filter(Boolean)),
    );
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg('شماره دعوتنامه، تاریخ و حداقل یک پکینگ لیست الزامی است', 'Invitation No., date, and at least one Packing List are required'),
        400,
      );
    }

    const oldNo = normKey(rec.invitationNo);
    const oldPackings = [...rec.packingNos];
    const now = new Date().toISOString();

    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (oldPackings.includes(pk) && normKey(g.opiInvitationNo) === oldNo && !cleanPackings.includes(pk)) {
        const fallback = db.opiInvitations.find((inv) => inv.id !== rec.id && inv.packingNos.includes(pk));
        g.opiInvitationNo = fallback ? fallback.invitationNo : '';
        g.opiInvitationDate = fallback ? fallback.date : '';
        g.updatedAt = now;
      }
      if (cleanPackings.includes(pk)) {
        g.opiInvitationNo = cleanNo;
        g.opiInvitationDate = cleanDate;
        g.updatedAt = now;
      }
    }
    for (const d of db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (oldPackings.includes(pk) && normKey(d.opiNo) === oldNo && !cleanPackings.includes(pk) && d.actualQty == null) {
        const fallback = db.opiInvitations.find((inv) => inv.id !== rec.id && inv.packingNos.includes(pk));
        d.opiNo = fallback ? fallback.invitationNo : '';
        d.opiDate = fallback ? fallback.date : '';
        d.updatedAt = now;
      }
      if (cleanPackings.includes(pk) && (d.actualQty == null || normKey(d.opiNo) === oldNo || !normKey(d.opiNo))) {
        d.opiNo = cleanNo;
        d.opiDate = cleanDate;
        d.updatedAt = now;
      }
    }

    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          itemNo: normKey(it?.itemNo),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          description: normKey(it?.description),
          uom: normKey(it?.uom),
          remarks: normKey(it?.remarks),
        }))
        .filter(
          (it) =>
            it.itemNo ||
            it.packingListNo ||
            it.packageNo ||
            it.description ||
            it.uom ||
            it.remarks,
        );
    }

    rec.invitationNo = cleanNo;
    if (raw.issueDate !== undefined) rec.issueDate = normKey(raw.issueDate) || cleanDate;
    rec.date = cleanDate;
    if (raw.time !== undefined) rec.time = normKey(raw.time) || '09:00';
    rec.packingNos = cleanPackings;
    if (raw.location !== undefined) rec.location = normKey(raw.location);
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) rec.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.installerContractor !== undefined) rec.installerContractor = normKey(raw.installerContractor);
    if (raw.supplierRep !== undefined) rec.supplierRep = normKey(raw.supplierRep);
    if (raw.equipmentSupply !== undefined) rec.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.employerRep !== undefined) rec.employerRep = normKey(raw.employerRep);
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);
    if (raw.status === 'issued' || raw.status === 'completed') rec.status = raw.status;

    addAudit(db, sanitizeUser(u), 'UPDATE_OPI_INVITATION', 'opi', cleanNo, `ویرایش دعوتنامه OPI شماره ${cleanNo}`);
    await saveActiveDb();
    return { invitation: rec } as T;
  }

  if (pathname.startsWith('/api/opi/') && pathname !== '/api/opi/results' && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.opiInvitations.findIndex((x) => x.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('دعوتنامه OPI یافت نشد', 'OPI invitation not found'), 404);
    const [removed] = db.opiInvitations.splice(idx, 1);
    const oldNo = normKey(removed.invitationNo);
    const now = new Date().toISOString();
    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (removed.packingNos.includes(pk) && normKey(g.opiInvitationNo) === oldNo) {
        const fallback = db.opiInvitations.find((inv) => inv.packingNos.includes(pk));
        g.opiInvitationNo = fallback ? fallback.invitationNo : '';
        g.opiInvitationDate = fallback ? fallback.date : '';
        g.updatedAt = now;
      }
    }
    for (const d of db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (removed.packingNos.includes(pk) && normKey(d.opiNo) === oldNo && d.actualQty == null) {
        const fallback = db.opiInvitations.find((inv) => inv.packingNos.includes(pk));
        d.opiNo = fallback ? fallback.invitationNo : '';
        d.opiDate = fallback ? fallback.date : '';
        d.updatedAt = now;
      }
    }
    addAudit(db, sanitizeUser(u), 'DELETE_OPI_INVITATION', 'opi', removed.invitationNo, `حذف دعوتنامه OPI شماره ${removed.invitationNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  if (pathname === '/api/opi/results' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const results = (body.results as Array<{
      detailedId: string;
      actualQty: number | null;
      damagedQty?: number | null;
      repNo?: string;
      repStatus?: string;
      repDescription?: string;
      notes?: string;
    }>) || [];
    if (!results.length) {
      throw new StaticEngineError(errMsg('حداقل یک قلم انتخاب کنید', 'Select at least one item'), 400);
    }
    const now = new Date().toISOString();
    const cleanOpiNo = normKey(String(body.opiNo || ''));
    const cleanOpiDate = normKey(String(body.opiDate || ''));
    let updatedCount = 0;

    for (const r of results) {
      const d = db.detailed.find((x) => x.id === r.detailedId);
      if (!d) continue;
      if (r.actualQty !== undefined && r.actualQty !== null && Number.isFinite(r.actualQty)) {
        d.actualQty = r.actualQty;
      }
      if (r.damagedQty !== undefined && r.damagedQty !== null && Number.isFinite(r.damagedQty)) {
        d.damagedQty = r.damagedQty;
      }
      if (cleanOpiNo) d.opiNo = cleanOpiNo;
      if (cleanOpiDate) d.opiDate = cleanOpiDate;
      if (r.repNo !== undefined) d.repNo = normKey(r.repNo);
      if (r.repStatus !== undefined) d.repStatus = normKey(r.repStatus);
      if (r.repDescription !== undefined) d.repDescription = normKey(r.repDescription);
      if (r.notes !== undefined && normKey(r.notes)) d.notes = normKey(r.notes);
      d.updatedAt = now;
      updatedCount += 1;
    }

    if (body.invitationId) {
      const inv = db.opiInvitations.find((x) => x.id === String(body.invitationId));
      if (inv) inv.status = 'completed';
    }
    addAudit(db, sanitizeUser(u), 'RECORD_OPI_RESULTS', 'opi', cleanOpiNo || 'OPI', `ثبت نتایج OPI برای ${updatedCount} قلم`);
    await saveActiveDb();
    return { ok: true, updatedCount } as T;
  }

  // ---------------- OPI MINUTES & OSDR ----------------
  if (pathname === '/api/opi-minutes' && method === 'GET') {
    requireAuth();
    const packingsSet = new Set<string>();
    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    return {
      minutes: db.opiMinutes,
      osdrReports: db.osdrReports,
      invitations: db.opiInvitations,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      generalEntries: [...db.general].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    } as T;
  }

  if (pathname === '/api/opi-minutes' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<OpiMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo);
    const cleanDate = normKey(raw.date);
    const cleanPacking = normKey(raw.packingListNo);
    if (!cleanNo || !cleanDate || !cleanPacking) {
      throw new StaticEngineError(
        errMsg('شماره صورتجلسه، تاریخ و شماره پکینگ لیست الزامی است', 'Minutes No., date, and Packing List No. are required'),
        400,
      );
    }
    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            itemNo: normKey(it?.itemNo),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            description: normKey(it?.description),
            uom: normKey(it?.uom),
            remarks: normKey(it?.remarks),
          }))
          .filter(
            (it) =>
              it.itemNo ||
              it.packingListNo ||
              it.packageNo ||
              it.description ||
              it.uom ||
              it.remarks,
          )
      : undefined;

    const record: OpiMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      invitationNo: normKey(raw.invitationNo),
      date: cleanDate,
      time: normKey(raw.time),
      packingListNo: cleanPacking,
      packageNos: Array.from(new Set((raw.packageNos || []).map(normKey).filter(Boolean))),
      projectName: normKey(raw.projectName),
      supplier: normKey(raw.supplier),
      system: normKey(raw.system),
      island: normKey(raw.island),
      unit: normKey(raw.unit),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      items: cleanItems,
      merNo: normKey(raw.merNo),
      location: normKey(raw.location),
      storekeeper: normKey(raw.storekeeper),
      mapnaInspector: normKey(raw.mapnaInspector),
      sellerRep: normKey(raw.sellerRep) || normKey(raw.contractorInspector),
      employerInspector: normKey(raw.employerInspector),
      contractorInspector: normKey(raw.contractorInspector) || normKey(raw.sellerRep),
      qcInspector: normKey(raw.qcInspector),
      resultStatus: raw.resultStatus || 'compliant',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    if (record.invitationNo) {
      const inv = db.opiInvitations.find((x) => normKey(x.invitationNo) === record.invitationNo);
      if (inv) inv.status = 'completed';
    }
    db.opiMinutes.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_OPI_MINUTES', 'opiMinutes', cleanNo, `ثبت صورتجلسه گشایش و بازرسی بسته‌ها شماره ${cleanNo}`);
    await saveActiveDb();
    return { record } as T;
  }

  if (pathname.startsWith('/api/opi-minutes/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.opiMinutes.find((r) => r.id === id);
    if (!rec) throw new StaticEngineError(errMsg('صورتجلسه گشایش و بازرسی یافت نشد', 'OPI minutes record not found'), 404);
    const raw = body as Partial<OpiMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo ?? rec.minutesNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const cleanPacking = normKey(raw.packingListNo ?? rec.packingListNo);
    if (!cleanNo || !cleanDate || !cleanPacking) {
      throw new StaticEngineError(
        errMsg('شماره صورتجلسه، تاریخ و شماره پکینگ لیست الزامی است', 'Minutes No., date, and Packing List No. are required'),
        400,
      );
    }
    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          itemNo: normKey(it?.itemNo),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          description: normKey(it?.description),
          uom: normKey(it?.uom),
          remarks: normKey(it?.remarks),
        }))
        .filter(
          (it) =>
            it.itemNo ||
            it.packingListNo ||
            it.packageNo ||
            it.description ||
            it.uom ||
            it.remarks,
        );
    }
    rec.minutesNo = cleanNo;
    if (raw.invitationNo !== undefined) rec.invitationNo = normKey(raw.invitationNo);
    rec.date = cleanDate;
    if (raw.time !== undefined) rec.time = normKey(raw.time);
    rec.packingListNo = cleanPacking;
    if (Array.isArray(raw.packageNos)) {
      rec.packageNos = Array.from(new Set(raw.packageNos.map(normKey).filter(Boolean)));
    }
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) rec.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.merNo !== undefined) rec.merNo = normKey(raw.merNo);
    if (raw.location !== undefined) rec.location = normKey(raw.location);
    if (raw.storekeeper !== undefined) rec.storekeeper = normKey(raw.storekeeper);
    if (raw.mapnaInspector !== undefined) rec.mapnaInspector = normKey(raw.mapnaInspector);
    if (raw.sellerRep !== undefined) {
      rec.sellerRep = normKey(raw.sellerRep);
      rec.contractorInspector = normKey(raw.sellerRep);
    } else if (raw.contractorInspector !== undefined) {
      rec.contractorInspector = normKey(raw.contractorInspector);
    }
    if (raw.employerInspector !== undefined) rec.employerInspector = normKey(raw.employerInspector);
    if (raw.qcInspector !== undefined) rec.qcInspector = normKey(raw.qcInspector);
    if (raw.resultStatus === 'compliant' || raw.resultStatus === 'has_discrepancy') rec.resultStatus = raw.resultStatus;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);

    if (rec.invitationNo) {
      const inv = db.opiInvitations.find((x) => normKey(x.invitationNo) === rec.invitationNo);
      if (inv) inv.status = 'completed';
    }
    addAudit(db, sanitizeUser(u), 'UPDATE_OPI_MINUTES', 'opiMinutes', cleanNo, `ویرایش صورتجلسه گشایش و بازرسی بسته‌ها شماره ${cleanNo}`);
    await saveActiveDb();
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/opi-minutes/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.opiMinutes.findIndex((r) => r.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('صورتجلسه گشایش و بازرسی یافت نشد', 'OPI minutes record not found'), 404);
    const [removed] = db.opiMinutes.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_OPI_MINUTES', 'opiMinutes', removed.minutesNo, `حذف صورتجلسه گشایش و بازرسی بسته‌ها شماره ${removed.minutesNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  if (pathname === '/api/osdr' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const cleanNo = normKey(String(body.reportNo || ''));
    const cleanDate = normKey(String(body.date || ''));
    const cleanPacking = normKey(String(body.packingListNo || ''));
    const items = (body.items as OsdrReportItem[]) || [];
    if (!cleanNo || !cleanDate || !cleanPacking || items.length === 0) {
      throw new StaticEngineError(
        errMsg(
          'شماره گزارش مغایرت، تاریخ، شماره پکینگ و حداقل یک قلم مغایرت الزامی است',
          'Report No., date, Packing List No., and at least one discrepancy item are required',
        ),
        400,
      );
    }
    const record: OsdrReportRecord = {
      id: makeId(),
      reportNo: cleanNo,
      date: cleanDate,
      opiMinutesNo: normKey(String(body.opiMinutesNo || '')),
      packingListNo: cleanPacking,
      supplier: normKey(String(body.supplier || '')),
      items,
      notes: normKey(String(body.notes || '')),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.osdrReports.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_OSDR_REPORT', 'osdr', cleanNo, `ثبت گزارش مغایرت، کسری و آسیب‌دیدگی (MER) شماره ${cleanNo}`);
    await saveActiveDb();
    return { report: record } as T;
  }

  if (pathname.startsWith('/api/osdr/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.osdrReports.find((r) => r.id === id);
    if (!rec) throw new StaticEngineError(errMsg('گزارش مغایرت MER یافت نشد', 'MER report not found'), 404);
    const raw = body as Partial<OsdrReportRecord>;
    const cleanNo = normKey(raw.reportNo ?? rec.reportNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const cleanPacking = normKey(raw.packingListNo ?? rec.packingListNo);
    const nextItems = raw.items !== undefined ? raw.items : rec.items;
    if (!cleanNo || !cleanDate || !cleanPacking || !Array.isArray(nextItems) || nextItems.length === 0) {
      throw new StaticEngineError(
        errMsg(
          'شماره گزارش مغایرت، تاریخ، شماره پکینگ و حداقل یک قلم مغایرت الزامی است',
          'Report No., date, Packing List No., and at least one discrepancy item are required',
        ),
        400,
      );
    }
    rec.reportNo = cleanNo;
    rec.date = cleanDate;
    if (raw.opiMinutesNo !== undefined) rec.opiMinutesNo = normKey(raw.opiMinutesNo);
    rec.packingListNo = cleanPacking;
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    rec.items = nextItems;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);

    addAudit(db, sanitizeUser(u), 'UPDATE_OSDR_REPORT', 'osdr', cleanNo, `ویرایش گزارش مغایرت MER شماره ${cleanNo}`);
    await saveActiveDb();
    return { report: rec } as T;
  }

  if (pathname.startsWith('/api/osdr/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.osdrReports.findIndex((r) => r.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('گزارش مغایرت MER یافت نشد', 'MER report not found'), 404);
    const [removed] = db.osdrReports.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_OSDR_REPORT', 'osdr', removed.reportNo, `حذف گزارش مغایرت MER شماره ${removed.reportNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- GCV ----------------
  if (pathname === '/api/gcv' && method === 'GET') {
    requireAuth();
    return {
      documents: db.gcvDocuments,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      generalEntries: [...db.general].reverse(),
    } as T;
  }

  if (pathname === '/api/gcv' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<GcvDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        technicalInfo?: string;
        tagNo?: string;
        uom?: string;
        remark?: string;
      }>;
    };
    const cleanNo = normKey(raw.receiptNo);
    const cleanReceiver = normKey(raw.receiver);
    const items = raw.items || [];
    if (!cleanNo || !cleanReceiver || !items.length) {
      throw new StaticEngineError(
        errMsg('شماره رسید، تحویل‌گیرنده و حداقل یک قلم کالا الزامی است', 'Receipt No., receiver, and at least one item are required'),
        400,
      );
    }

    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new StaticEngineError(errMsg('تعداد تحویلی باید بزرگتر از صفر باشد', 'Delivered quantity must be greater than zero'), 400);
      }
      const d = db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) throw new StaticEngineError(errMsg('آیتم یافت نشد', 'Item not found'), 404);
      const comp = computeDetailedEntry(d);
      if (comp.opiPending) {
        throw new StaticEngineError(
          errMsg(
            `برای آیتم ${d.itemNo || d.rowNo} هنوز OPI ثبت نشده است.`,
            `Item ${d.itemNo || d.rowNo} is pending OPI / Actual Qty.`,
          ),
          400,
        );
      }
      if (qty > comp.mapnaInventory) {
        throw new StaticEngineError(
          errMsg(
            `مقدار تحویلی (${qty}) بیشتر از موجودی انبار اصلی (${comp.mapnaInventory}) است.`,
            `Delivered qty (${qty}) exceeds Main Warehouse stock (${comp.mapnaInventory}).`,
          ),
          400,
        );
      }
      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemCode || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        remark: normKey(reqItem.remark) || '',
      });
    }

    const now = new Date().toISOString();
    for (const line of lineItems) {
      const d = db.detailed.find((x) => x.id === line.detailedId)!;
      d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, cleanNo);
      d.receiver = cleanReceiver;
      d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + line.qty);
      d.updatedAt = now;
    }

    const doc: GcvDocumentRecord = {
      id: makeId(),
      receiptNo: cleanNo,
      date: normKey(raw.date),
      receiver: cleanReceiver,
      projectName: normKey(raw.projectName),
      purchaseRequestNo: normKey(raw.purchaseRequestNo),
      supplier: normKey(raw.supplier),
      buyerName: normKey(raw.buyerName),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      releaseNoteNo: normKey(raw.releaseNoteNo),
      purchaseBy:
        raw.purchaseBy === 'site_admin' || raw.purchaseBy === 'contractor_supplier'
          ? raw.purchaseBy
          : raw.purchaseBy === 'tehran_proc'
            ? 'tehran_proc'
            : undefined,
      islandSystem: normKey(raw.islandSystem),
      waybillNo: normKey(raw.waybillNo),
      storekeeper: normKey(raw.storekeeper),
      receiverManager: normKey(raw.receiverManager) || cleanReceiver,
      equipmentSupply: normKey(raw.equipmentSupply),
      mapnaSiteManager: normKey(raw.mapnaSiteManager),
      notes: normKey(raw.notes),
      items: lineItems,
      createdAt: now,
      createdBy: u.fullName || u.username,
    };
    db.gcvDocuments.unshift(doc);
    addAudit(db, sanitizeUser(u), 'CREATE_GCV_RECEIPT', 'gcv', cleanNo, `ثبت رسید مصرف مستقیم کالا شماره ${cleanNo}`);
    await saveActiveDb();
    return { document: doc } as T;
  }

  if (pathname.startsWith('/api/gcv/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const existing = db.gcvDocuments.find((doc) => doc.id === id);
    if (!existing) throw new StaticEngineError(errMsg('رسید GCV یافت نشد', 'GCV document not found'), 404);
    const raw = body as Partial<GcvDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        technicalInfo?: string;
        tagNo?: string;
        uom?: string;
        remark?: string;
      }>;
    };
    const cleanNo = normKey(raw.receiptNo ?? existing.receiptNo);
    const cleanReceiver = normKey(raw.receiver ?? existing.receiver);
    const items = raw.items || [];
    if (!cleanNo || !cleanReceiver || !items.length) {
      throw new StaticEngineError(
        errMsg('شماره رسید، تحویل‌گیرنده و حداقل یک قلم کالا الزامی است', 'Receipt No., receiver, and at least one item are required'),
        400,
      );
    }

    const oldQtyByDetailedId = new Map<string, number>();
    for (const oldLine of existing.items) {
      oldQtyByDetailedId.set(oldLine.detailedId, roundQty((oldQtyByDetailedId.get(oldLine.detailedId) || 0) + oldLine.qty));
    }

    const nextLines: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new StaticEngineError(errMsg('تعداد تحویلی باید بزرگتر از صفر باشد', 'Delivered quantity must be greater than zero'), 400);
      }
      const d = db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) throw new StaticEngineError(errMsg('آیتم یافت نشد', 'Item not found'), 404);
      const oldQtyForItem = oldQtyByDetailedId.get(d.id) || 0;
      const revertedItem: DetailedEntry = {
        ...d,
        gcvDeliveredQty: Math.max(0, roundQty(toNum(d.gcvDeliveredQty) - oldQtyForItem)),
      };
      const comp = computeDetailedEntry(revertedItem);
      if (comp.opiPending) {
        throw new StaticEngineError(
          errMsg(`برای آیتم ${d.itemNo || d.rowNo} هنوز OPI ثبت نشده است.`, `Item ${d.itemNo || d.rowNo} is pending OPI / Actual Qty.`),
          400,
        );
      }
      if (qty > comp.mapnaInventory) {
        throw new StaticEngineError(
          errMsg(
            `مقدار تحویلی (${qty}) بیشتر از موجودی انبار اصلی (${comp.mapnaInventory}) است.`,
            `Delivered qty (${qty}) exceeds Main Warehouse stock (${comp.mapnaInventory}).`,
          ),
          400,
        );
      }
      nextLines.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemCode || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        remark: normKey(reqItem.remark) || '',
      });
    }

    const now = new Date().toISOString();
    const otherDocs = db.gcvDocuments.filter((doc) => doc.id !== existing.id);
    for (const oldLine of existing.items) {
      const d = db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      d.gcvDeliveredQty = Math.max(0, roundQty(toNum(d.gcvDeliveredQty) - oldLine.qty));
      d.gcvReceiptNo = removeRefToken(d.gcvReceiptNo, existing.receiptNo);
      if (d.gcvDeliveredQty === 0) {
        const remainingDoc = otherDocs.find((doc) => doc.items.some((it) => it.detailedId === d.id));
        d.receiver = remainingDoc ? remainingDoc.receiver : '';
      }
      d.updatedAt = now;
    }

    for (const line of nextLines) {
      const d = db.detailed.find((x) => x.id === line.detailedId)!;
      d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, cleanNo);
      d.receiver = cleanReceiver;
      d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + line.qty);
      d.updatedAt = now;
    }

    existing.receiptNo = cleanNo;
    if (raw.date !== undefined) existing.date = normKey(raw.date);
    existing.receiver = cleanReceiver;
    if (raw.projectName !== undefined) existing.projectName = normKey(raw.projectName);
    if (raw.purchaseRequestNo !== undefined) existing.purchaseRequestNo = normKey(raw.purchaseRequestNo);
    if (raw.supplier !== undefined) existing.supplier = normKey(raw.supplier);
    if (raw.buyerName !== undefined) existing.buyerName = normKey(raw.buyerName);
    if (raw.purchasePackageNo !== undefined) existing.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.releaseNoteNo !== undefined) existing.releaseNoteNo = normKey(raw.releaseNoteNo);
    if (raw.purchaseBy !== undefined) {
      existing.purchaseBy =
        raw.purchaseBy === 'site_admin' || raw.purchaseBy === 'contractor_supplier' || raw.purchaseBy === 'tehran_proc'
          ? raw.purchaseBy
          : undefined;
    }
    if (raw.islandSystem !== undefined) existing.islandSystem = normKey(raw.islandSystem);
    if (raw.waybillNo !== undefined) existing.waybillNo = normKey(raw.waybillNo);
    if (raw.storekeeper !== undefined) existing.storekeeper = normKey(raw.storekeeper);
    existing.receiverManager = normKey(raw.receiverManager) || cleanReceiver;
    if (raw.equipmentSupply !== undefined) existing.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.mapnaSiteManager !== undefined) existing.mapnaSiteManager = normKey(raw.mapnaSiteManager);
    if (raw.notes !== undefined) existing.notes = normKey(raw.notes);
    existing.items = nextLines;

    addAudit(db, sanitizeUser(u), 'UPDATE_GCV_RECEIPT', 'gcv', cleanNo, `ویرایش رسید مصرف مستقیم کالا شماره ${cleanNo}`);
    await saveActiveDb();
    return { document: existing } as T;
  }

  if (pathname.startsWith('/api/gcv/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.gcvDocuments.findIndex((doc) => doc.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رسید GCV یافت نشد', 'GCV document not found'), 404);
    const [removed] = db.gcvDocuments.splice(idx, 1);
    const now = new Date().toISOString();
    for (const oldLine of removed.items) {
      const d = db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      d.gcvDeliveredQty = Math.max(0, roundQty(toNum(d.gcvDeliveredQty) - oldLine.qty));
      d.gcvReceiptNo = removeRefToken(d.gcvReceiptNo, removed.receiptNo);
      const remainingDoc = db.gcvDocuments.find((doc) => doc.items.some((it) => it.detailedId === d.id));
      if (d.gcvDeliveredQty === 0 && !remainingDoc) {
        d.receiver = '';
      } else if (remainingDoc && d.receiver === removed.receiver) {
        d.receiver = remainingDoc.receiver;
      }
      d.updatedAt = now;
    }
    addAudit(db, sanitizeUser(u), 'DELETE_GCV_RECEIPT', 'gcv', removed.receiptNo, `حذف رسید مصرف مستقیم کالا شماره ${removed.receiptNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- MIV & SMR ----------------
  if (pathname === '/api/miv' && method === 'GET') {
    requireAuth();
    return {
      documents: db.mivDocuments,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      generalEntries: [...db.general].reverse(),
    } as T;
  }

  if (pathname === '/api/miv' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<MivDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        requestedQty?: number;
        technicalInfo?: string;
        tagNo?: string;
        codeNo?: string;
        location?: string;
        uom?: string;
        opiNo?: string;
        returnReason?: string;
        remark?: string;
      }>;
    };
    const docType = raw.docType as MivDocType;
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!validTypes.includes(docType)) {
      throw new StaticEngineError(errMsg('نوع فرم معتبر نیست', 'Invalid document type'), 400);
    }
    const cleanNo = normKey(String(raw.docNo || ''));
    const cleanDate = normKey(String(raw.date || ''));
    const items = raw.items || [];
    if (!cleanNo || !items.length) {
      throw new StaticEngineError(errMsg('شماره سند و حداقل یک قلم کالا الزامی است', 'Document No. and at least one item are required'), 400);
    }

    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new StaticEngineError(errMsg('تعداد باید بزرگتر از صفر باشد', 'Quantity must be greater than zero'), 400);
      }
      const d = db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) throw new StaticEngineError(errMsg('آیتم یافت نشد', 'Item not found'), 404);
      const comp = computeDetailedEntry(d);
      if ((docType === 'miv_contractor' || docType === 'smr_mapna') && qty > comp.contractorInventory) {
        throw new StaticEngineError(
          errMsg(
            `تعداد (${qty}) از موجودی پیمانکار (${comp.contractorInventory}) بیشتر است.`,
            `Qty (${qty}) exceeds Contractor stock (${comp.contractorInventory}).`,
          ),
          400,
        );
      }
      if (docType === 'miv_mapna' && qty > comp.mapnaInventory) {
        throw new StaticEngineError(
          errMsg(
            `تعداد (${qty}) از موجودی انبار اصلی (${comp.mapnaInventory}) بیشتر است.`,
            `Qty (${qty}) exceeds Main Warehouse stock (${comp.mapnaInventory}).`,
          ),
          400,
        );
      }
      const reqQtyNum = Number(reqItem.requestedQty);
      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
        requestedQty: Number.isFinite(reqQtyNum) && reqQtyNum > 0 ? reqQtyNum : qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemCode || '',
        codeNo: normKey(reqItem.codeNo) || d.itemCode || '',
        location: normKey(reqItem.location) || d.storageLocation || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        opiNo: normKey(reqItem.opiNo) || d.opiNo || '',
        returnReason: normKey(reqItem.returnReason) || '',
        remark: normKey(reqItem.remark) || '',
      });
    }

    const now = new Date().toISOString();
    const cleanNotes = normKey(String(raw.notes || ''));
    const cleanReceiver = normKey(raw.receiver);
    const cleanDeliveredBy = normKey(raw.deliveredBy);
    for (const line of lineItems) {
      const d = db.detailed.find((x) => x.id === line.detailedId)!;
      if (docType === 'miv_contractor') {
        d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
        d.mivContractorDate = cleanDate || d.mivContractorDate;
        d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + line.qty);
        if (cleanReceiver) d.mivReceiver = appendUniqueRef(d.mivReceiver || '', cleanReceiver);
      } else if (docType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
        if (cleanDeliveredBy) d.smrDeliverer = appendUniqueRef(d.smrDeliverer || '', cleanDeliveredBy);
      } else if (docType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
        if (cleanDeliveredBy) d.smrDeliverer = appendUniqueRef(d.smrDeliverer || '', cleanDeliveredBy);
      } else if (docType === 'miv_mapna') {
        d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
        d.mivMapnaDate = cleanDate || d.mivMapnaDate;
        d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + line.qty);
        if (cleanReceiver) d.mivReceiver = appendUniqueRef(d.mivReceiver || '', cleanReceiver);
      }
      d.updatedAt = now;
    }

    const doc: MivDocumentRecord = {
      id: makeId(),
      docType,
      docNo: cleanNo,
      date: cleanDate,
      party: normKey(String(raw.party || '')),
      projectName: normKey(raw.projectName),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      supplier: normKey(raw.supplier),
      releaseNoteNo: normKey(raw.releaseNoteNo),
      islandSystem: normKey(raw.islandSystem),
      unit: normKey(raw.unit),
      receiptNo: normKey(raw.receiptNo),
      storekeeper: normKey(raw.storekeeper),
      equipmentSupply: normKey(raw.equipmentSupply),
      techOffice: normKey(raw.techOffice),
      installationDept: normKey(raw.installationDept),
      qcInspector: normKey(raw.qcInspector),
      installerRep: normKey(raw.installerRep),
      requester: normKey(raw.requester),
      receiver: cleanReceiver,
      deliveredBy: cleanDeliveredBy,
      notes: cleanNotes,
      items: lineItems,
      createdAt: now,
      createdBy: u.fullName || u.username,
    };
    db.mivDocuments.unshift(doc);
    addAudit(
      db,
      sanitizeUser(u),
      `CREATE_${docType.toUpperCase()}`,
      docType.startsWith('smr') ? 'smr' : 'miv',
      cleanNo,
      `ثبت فرم ${docType} شماره ${cleanNo}`,
    );
    await saveActiveDb();
    return { document: doc } as T;
  }

  if (pathname.startsWith('/api/miv/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const existing = db.mivDocuments.find((doc) => doc.id === id);
    if (!existing) throw new StaticEngineError(errMsg('سند MIV / SMR یافت نشد', 'MIV / SMR document not found'), 404);
    const raw = body as Partial<MivDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        requestedQty?: number;
        technicalInfo?: string;
        tagNo?: string;
        codeNo?: string;
        location?: string;
        uom?: string;
        opiNo?: string;
        returnReason?: string;
        remark?: string;
      }>;
    };
    const nextDocType = (raw.docType || existing.docType) as MivDocType;
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!validTypes.includes(nextDocType)) {
      throw new StaticEngineError(errMsg('نوع فرم معتبر نیست', 'Invalid document type'), 400);
    }
    const cleanNo = normKey(raw.docNo ?? existing.docNo);
    const cleanDate = normKey(raw.date ?? existing.date);
    const items = raw.items || [];
    if (!cleanNo || !items.length) {
      throw new StaticEngineError(errMsg('شماره سند و حداقل یک قلم کالا الزامی است', 'Document No. and at least one item are required'), 400);
    }

    const oldQtyByDetailedId = new Map<string, number>();
    for (const oldLine of existing.items) {
      oldQtyByDetailedId.set(oldLine.detailedId, roundQty((oldQtyByDetailedId.get(oldLine.detailedId) || 0) + oldLine.qty));
    }

    const nextLines: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new StaticEngineError(errMsg('تعداد باید بزرگتر از صفر باشد', 'Quantity must be greater than zero'), 400);
      }
      const d = db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) throw new StaticEngineError(errMsg('آیتم یافت نشد', 'Item not found'), 404);
      const oldQtyForItem = oldQtyByDetailedId.get(d.id) || 0;
      const simulated: DetailedEntry = { ...d };
      if (oldQtyForItem > 0) {
        if (existing.docType === 'miv_contractor') {
          simulated.mivContractorQty = Math.max(0, roundQty(toNum(simulated.mivContractorQty) - oldQtyForItem));
        } else if (existing.docType === 'smr_contractor') {
          simulated.smrContractorQty = Math.max(0, roundQty(toNum(simulated.smrContractorQty) - oldQtyForItem));
        } else if (existing.docType === 'smr_mapna') {
          simulated.smrMapnaQty = Math.max(0, roundQty(toNum(simulated.smrMapnaQty) - oldQtyForItem));
        } else if (existing.docType === 'miv_mapna') {
          simulated.mivMapnaQty = Math.max(0, roundQty(toNum(simulated.mivMapnaQty) - oldQtyForItem));
        }
      }
      const comp = computeDetailedEntry(simulated);
      if ((nextDocType === 'miv_contractor' || nextDocType === 'smr_mapna') && qty > comp.contractorInventory) {
        throw new StaticEngineError(
          errMsg(
            `تعداد (${qty}) از موجودی پیمانکار (${comp.contractorInventory}) بیشتر است.`,
            `Qty (${qty}) exceeds Contractor stock (${comp.contractorInventory}).`,
          ),
          400,
        );
      }
      if (nextDocType === 'miv_mapna' && qty > comp.mapnaInventory) {
        throw new StaticEngineError(
          errMsg(
            `تعداد (${qty}) از موجودی انبار اصلی (${comp.mapnaInventory}) بیشتر است.`,
            `Qty (${qty}) exceeds Main Warehouse stock (${comp.mapnaInventory}).`,
          ),
          400,
        );
      }
      const reqQtyNum = Number(reqItem.requestedQty);
      nextLines.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
        requestedQty: Number.isFinite(reqQtyNum) && reqQtyNum > 0 ? reqQtyNum : qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemCode || '',
        codeNo: normKey(reqItem.codeNo) || d.itemCode || '',
        location: normKey(reqItem.location) || d.storageLocation || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        opiNo: normKey(reqItem.opiNo) || d.opiNo || '',
        returnReason: normKey(reqItem.returnReason) || '',
        remark: normKey(reqItem.remark) || '',
      });
    }

    const now = new Date().toISOString();
    const otherDocs = db.mivDocuments.filter((doc) => doc.id !== existing.id);
    const affectedDetailedIds = new Set<string>();
    for (const oldLine of existing.items) {
      const d = db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      affectedDetailedIds.add(d.id);
      if (existing.docType === 'miv_contractor') {
        d.mivContractorQty = Math.max(0, roundQty(toNum(d.mivContractorQty) - oldLine.qty));
        d.mivContractorNo = removeRefToken(d.mivContractorNo, existing.docNo);
        if (d.mivContractorQty === 0 && !otherDocs.some((od) => od.docType === 'miv_contractor' && od.items.some((it) => it.detailedId === d.id))) {
          d.mivContractorDate = '';
        }
      } else if (existing.docType === 'smr_contractor') {
        d.smrContractorQty = Math.max(0, roundQty(toNum(d.smrContractorQty) - oldLine.qty));
        d.smrContractorNo = removeRefToken(d.smrContractorNo, existing.docNo);
        if (d.smrContractorQty === 0 && !otherDocs.some((od) => od.docType === 'smr_contractor' && od.items.some((it) => it.detailedId === d.id))) {
          d.smrContractorDate = '';
        }
      } else if (existing.docType === 'smr_mapna') {
        d.smrMapnaQty = Math.max(0, roundQty(toNum(d.smrMapnaQty) - oldLine.qty));
        d.smrMapnaNo = removeRefToken(d.smrMapnaNo, existing.docNo);
        if (d.smrMapnaQty === 0 && !otherDocs.some((od) => od.docType === 'smr_mapna' && od.items.some((it) => it.detailedId === d.id))) {
          d.smrMapnaDate = '';
        }
      } else if (existing.docType === 'miv_mapna') {
        d.mivMapnaQty = Math.max(0, roundQty(toNum(d.mivMapnaQty) - oldLine.qty));
        d.mivMapnaNo = removeRefToken(d.mivMapnaNo, existing.docNo);
        if (d.mivMapnaQty === 0 && !otherDocs.some((od) => od.docType === 'miv_mapna' && od.items.some((it) => it.detailedId === d.id))) {
          d.mivMapnaDate = '';
        }
      }
      d.updatedAt = now;
    }

    const cleanNotes = normKey(raw.notes ?? existing.notes);
    const nextReceiver = raw.receiver !== undefined ? normKey(raw.receiver) : normKey(existing.receiver);
    const nextDeliveredBy = raw.deliveredBy !== undefined ? normKey(raw.deliveredBy) : normKey(existing.deliveredBy);
    for (const line of nextLines) {
      const d = db.detailed.find((x) => x.id === line.detailedId)!;
      affectedDetailedIds.add(d.id);
      if (nextDocType === 'miv_contractor') {
        d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
        d.mivContractorDate = cleanDate || d.mivContractorDate;
        d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + line.qty);
      } else if (nextDocType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
      } else if (nextDocType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
      } else if (nextDocType === 'miv_mapna') {
        d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
        d.mivMapnaDate = cleanDate || d.mivMapnaDate;
        d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + line.qty);
      }
      d.updatedAt = now;
    }

    existing.docType = nextDocType;
    existing.docNo = cleanNo;
    existing.date = cleanDate;
    if (raw.party !== undefined) existing.party = normKey(raw.party);
    if (raw.projectName !== undefined) existing.projectName = normKey(raw.projectName);
    if (raw.contractNo !== undefined) existing.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) existing.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.supplier !== undefined) existing.supplier = normKey(raw.supplier);
    if (raw.releaseNoteNo !== undefined) existing.releaseNoteNo = normKey(raw.releaseNoteNo);
    if (raw.islandSystem !== undefined) existing.islandSystem = normKey(raw.islandSystem);
    if (raw.unit !== undefined) existing.unit = normKey(raw.unit);
    if (raw.receiptNo !== undefined) existing.receiptNo = normKey(raw.receiptNo);
    if (raw.storekeeper !== undefined) existing.storekeeper = normKey(raw.storekeeper);
    if (raw.equipmentSupply !== undefined) existing.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.techOffice !== undefined) existing.techOffice = normKey(raw.techOffice);
    if (raw.installationDept !== undefined) existing.installationDept = normKey(raw.installationDept);
    if (raw.qcInspector !== undefined) existing.qcInspector = normKey(raw.qcInspector);
    if (raw.installerRep !== undefined) existing.installerRep = normKey(raw.installerRep);
    if (raw.requester !== undefined) existing.requester = normKey(raw.requester);
    existing.receiver = nextReceiver;
    existing.deliveredBy = nextDeliveredBy;
    existing.notes = cleanNotes;
    existing.items = nextLines;

    for (const detId of affectedDetailedIds) {
      const d = db.detailed.find((x) => x.id === detId);
      if (!d) continue;
      if (existing.docType.startsWith('miv') || nextDocType.startsWith('miv')) {
        const mivReceivers = Array.from(
          new Set(
            db.mivDocuments
              .filter((doc) => (doc.docType === 'miv_contractor' || doc.docType === 'miv_mapna') && doc.items.some((it) => it.detailedId === detId))
              .map((doc) => normKey(doc.receiver))
              .filter(Boolean),
          ),
        );
        d.mivReceiver = mivReceivers.join(' , ');
      }
      if (existing.docType.startsWith('smr') || nextDocType.startsWith('smr')) {
        const smrDeliverers = Array.from(
          new Set(
            db.mivDocuments
              .filter((doc) => (doc.docType === 'smr_contractor' || doc.docType === 'smr_mapna') && doc.items.some((it) => it.detailedId === detId))
              .map((doc) => normKey(doc.deliveredBy))
              .filter(Boolean),
          ),
        );
        d.smrDeliverer = smrDeliverers.join(' , ');
      }
    }

    addAudit(
      db,
      sanitizeUser(u),
      `UPDATE_${nextDocType.toUpperCase()}`,
      nextDocType.startsWith('smr') ? 'smr' : 'miv',
      cleanNo,
      `ویرایش فرم ${nextDocType} شماره ${cleanNo}`,
    );
    await saveActiveDb();
    return { document: existing } as T;
  }

  if (pathname.startsWith('/api/miv/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.mivDocuments.findIndex((doc) => doc.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('سند MIV / SMR یافت نشد', 'MIV / SMR document not found'), 404);
    const [removed] = db.mivDocuments.splice(idx, 1);
    const now = new Date().toISOString();
    for (const oldLine of removed.items) {
      const d = db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      if (removed.docType === 'miv_contractor') {
        d.mivContractorQty = Math.max(0, roundQty(toNum(d.mivContractorQty) - oldLine.qty));
        d.mivContractorNo = removeRefToken(d.mivContractorNo, removed.docNo);
        const rem = db.mivDocuments.find((doc) => doc.docType === 'miv_contractor' && doc.items.some((it) => it.detailedId === d.id));
        if (d.mivContractorQty === 0 && !rem) d.mivContractorDate = '';
        else if (rem && d.mivContractorDate === removed.date) d.mivContractorDate = rem.date;
      } else if (removed.docType === 'smr_contractor') {
        d.smrContractorQty = Math.max(0, roundQty(toNum(d.smrContractorQty) - oldLine.qty));
        d.smrContractorNo = removeRefToken(d.smrContractorNo, removed.docNo);
        const rem = db.mivDocuments.find((doc) => doc.docType === 'smr_contractor' && doc.items.some((it) => it.detailedId === d.id));
        if (d.smrContractorQty === 0 && !rem) {
          d.smrContractorDate = '';
          if (d.smrContractorNote === removed.notes) d.smrContractorNote = '';
        } else if (rem && d.smrContractorDate === removed.date) {
          d.smrContractorDate = rem.date;
        }
      } else if (removed.docType === 'smr_mapna') {
        d.smrMapnaQty = Math.max(0, roundQty(toNum(d.smrMapnaQty) - oldLine.qty));
        d.smrMapnaNo = removeRefToken(d.smrMapnaNo, removed.docNo);
        const rem = db.mivDocuments.find((doc) => doc.docType === 'smr_mapna' && doc.items.some((it) => it.detailedId === d.id));
        if (d.smrMapnaQty === 0 && !rem) {
          d.smrMapnaDate = '';
          if (d.smrMapnaNote === removed.notes) d.smrMapnaNote = '';
        } else if (rem && d.smrMapnaDate === removed.date) {
          d.smrMapnaDate = rem.date;
        }
      } else if (removed.docType === 'miv_mapna') {
        d.mivMapnaQty = Math.max(0, roundQty(toNum(d.mivMapnaQty) - oldLine.qty));
        d.mivMapnaNo = removeRefToken(d.mivMapnaNo, removed.docNo);
        const rem = db.mivDocuments.find((doc) => doc.docType === 'miv_mapna' && doc.items.some((it) => it.detailedId === d.id));
        if (d.mivMapnaQty === 0 && !rem) d.mivMapnaDate = '';
        else if (rem && d.mivMapnaDate === removed.date) d.mivMapnaDate = rem.date;
      }
      if (removed.docType === 'miv_contractor' || removed.docType === 'miv_mapna') {
        const remReceivers = Array.from(
          new Set(
            db.mivDocuments
              .filter((doc) => (doc.docType === 'miv_contractor' || doc.docType === 'miv_mapna') && doc.items.some((it) => it.detailedId === d.id))
              .map((doc) => normKey(doc.receiver))
              .filter(Boolean),
          ),
        );
        d.mivReceiver = remReceivers.join(' , ');
      } else if (removed.docType === 'smr_contractor' || removed.docType === 'smr_mapna') {
        const remDeliverers = Array.from(
          new Set(
            db.mivDocuments
              .filter((doc) => (doc.docType === 'smr_contractor' || doc.docType === 'smr_mapna') && doc.items.some((it) => it.detailedId === d.id))
              .map((doc) => normKey(doc.deliveredBy))
              .filter(Boolean),
          ),
        );
        d.smrDeliverer = remDeliverers.join(' , ');
      }
      d.updatedAt = now;
    }
    addAudit(
      db,
      sanitizeUser(u),
      `DELETE_${removed.docType.toUpperCase()}`,
      removed.docType.startsWith('smr') ? 'smr' : 'miv',
      removed.docNo,
      `حذف فرم ${removed.docType} شماره ${removed.docNo}`,
    );
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- SUBSTITUTION ----------------
  if (pathname === '/api/substitutions' && method === 'GET') {
    requireAuth();
    return {
      records: db.substitutions,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
      generalEntries: [...db.general].reverse(),
    } as T;
  }

  if (pathname === '/api/substitutions' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<SubstitutionRecord>;
    const cleanNo = normKey(raw.docNo);
    const cleanDate = normKey(raw.date);
    const cleanSubDesc = normKey(raw.substituteDescription);
    const cleanReason = normKey(raw.reason);
    const d = db.detailed.find((x) => x.id === raw.detailedId);
    if (!cleanNo || !cleanDate || !d || !cleanSubDesc || !cleanReason) {
      throw new StaticEngineError(
        errMsg(
          'شماره سند جایگزینی، تاریخ، کالای اصلی، مشخصات کالای جایگزین و دلیل جایگزینی الزامی است',
          'Document No., date, original item, substitute description, and reason are required',
        ),
        400,
      );
    }
    const numQty = Number(raw.qty);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      throw new StaticEngineError(errMsg('تعداد جایگزینی باید بزرگتر از صفر باشد', 'Substitution quantity must be greater than zero'), 400);
    }
    const record: SubstitutionRecord = {
      id: makeId(),
      docNo: cleanNo,
      date: cleanDate,
      detailedId: d.id,
      shipmentNo: d.shipmentNo,
      packageNo: d.packageNo,
      itemNo: d.itemNo,
      projectName: normKey(raw.projectName),
      contractNo: normKey(raw.contractNo),
      system: normKey(raw.system) || d.system || '',
      island: normKey(raw.island) || d.island || '',
      unit: normKey(raw.unit) || d.unit || '',
      supplier: normKey(raw.supplier) || d.supplier || '',
      supplyUrgency: normKey(raw.supplyUrgency),
      installerContractor: normKey(raw.installerContractor),
      mivNo: normKey(raw.mivNo) || d.mivContractorNo || d.mivMapnaNo || '',
      merNcrNo: normKey(raw.merNcrNo) || d.merNo || d.repNo || '',
      originalDescription: d.description || d.generalDescription,
      originalItemCode: d.itemCode,
      originalDrawingNo: normKey(raw.originalDrawingNo),
      originalRemarks: normKey(raw.originalRemarks),
      substitutePackageNo: normKey(raw.substitutePackageNo),
      substituteDescription: cleanSubDesc,
      substituteItemCode: normKey(raw.substituteItemCode),
      substituteSize: normKey(raw.substituteSize),
      substituteDrawingNo: normKey(raw.substituteDrawingNo),
      substituteRemarks: normKey(raw.substituteRemarks),
      qty: numQty,
      countingUnit: normalizeCountingUnitToFa(d.countingUnit) || 'عدد',
      reason: cleanReason,
      supplierNotes: normKey(raw.supplierNotes),
      reprocureBy: normKey(raw.reprocureBy),
      costBorneBy: normKey(raw.costBorneBy),
      approvedBy: normKey(raw.approvedBy),
      mapnaRep: normKey(raw.mapnaRep) || normKey(raw.approvedBy),
      installerSignatory: normKey(raw.installerSignatory),
      supplierSignatory: normKey(raw.supplierSignatory),
      status: raw.status || 'pending',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.substitutions.unshift(record);
    d.repNo = appendUniqueRef(d.repNo, cleanNo);
    if (record.status === 'approved') d.repStatus = 'تأیید شده';
    else if (record.status === 'executed') d.repStatus = 'اجرا شده';
    else if (!d.repStatus) d.repStatus = 'در انتظار تأیید';
    if (record.reprocureBy) d.repReprocured = record.reprocureBy;
    if (record.substituteDescription) d.repDescription = record.substituteDescription;
    d.updatedAt = record.createdAt;
    addAudit(db, sanitizeUser(u), 'CREATE_SUBSTITUTION', 'substitution', cleanNo, `ثبت فرم جایگزینی شماره ${cleanNo}`);
    await saveActiveDb();
    return { record } as T;
  }

  if (pathname.startsWith('/api/substitutions/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.substitutions.find((s) => s.id === id);
    if (!rec) throw new StaticEngineError(errMsg('سند جایگزینی یافت نشد', 'Substitution record not found'), 404);
    const raw = body as Partial<SubstitutionRecord>;
    if (raw.docNo !== undefined) {
      const cleanNo = normKey(raw.docNo);
      if (!cleanNo) throw new StaticEngineError(errMsg('شماره سند جایگزینی الزامی است', 'Document No. is required'), 400);
      rec.docNo = cleanNo;
    }
    if (raw.date !== undefined) {
      const cleanDate = normKey(raw.date);
      if (!cleanDate) throw new StaticEngineError(errMsg('تاریخ سند جایگزینی الزامی است', 'Date is required'), 400);
      rec.date = cleanDate;
    }
    if (raw.detailedId !== undefined && raw.detailedId !== rec.detailedId) {
      const d = db.detailed.find((x) => x.id === raw.detailedId);
      if (!d) throw new StaticEngineError(errMsg('کالای اصلی یافت نشد', 'Original detailed item not found'), 404);
      rec.detailedId = d.id;
      rec.shipmentNo = d.shipmentNo;
      rec.packageNo = d.packageNo;
      rec.itemNo = d.itemNo;
      rec.originalDescription = d.description || d.generalDescription;
      rec.originalItemCode = d.itemCode;
      rec.countingUnit = normalizeCountingUnitToFa(d.countingUnit) || 'عدد';
    }
    if (raw.qty !== undefined) {
      const numQty = Number(raw.qty);
      if (!Number.isFinite(numQty) || numQty <= 0) {
        throw new StaticEngineError(errMsg('تعداد جایگزینی باید بزرگتر از صفر باشد', 'Substitution quantity must be greater than zero'), 400);
      }
      rec.qty = numQty;
    }
    if (raw.substituteDescription !== undefined) {
      const cleanSubDesc = normKey(raw.substituteDescription);
      if (!cleanSubDesc) throw new StaticEngineError(errMsg('مشخصات کالای جایگزین الزامی است', 'Substitute description is required'), 400);
      rec.substituteDescription = cleanSubDesc;
    }
    if (raw.reason !== undefined) {
      const cleanReason = normKey(raw.reason);
      if (!cleanReason) throw new StaticEngineError(errMsg('دلیل جایگزینی الزامی است', 'Reason is required'), 400);
      rec.reason = cleanReason;
    }
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.supplyUrgency !== undefined) rec.supplyUrgency = normKey(raw.supplyUrgency);
    if (raw.installerContractor !== undefined) rec.installerContractor = normKey(raw.installerContractor);
    if (raw.mivNo !== undefined) rec.mivNo = normKey(raw.mivNo);
    if (raw.merNcrNo !== undefined) rec.merNcrNo = normKey(raw.merNcrNo);
    if (raw.originalDrawingNo !== undefined) rec.originalDrawingNo = normKey(raw.originalDrawingNo);
    if (raw.originalRemarks !== undefined) rec.originalRemarks = normKey(raw.originalRemarks);
    if (raw.substitutePackageNo !== undefined) rec.substitutePackageNo = normKey(raw.substitutePackageNo);
    if (raw.substituteItemCode !== undefined) rec.substituteItemCode = normKey(raw.substituteItemCode);
    if (raw.substituteSize !== undefined) rec.substituteSize = normKey(raw.substituteSize);
    if (raw.substituteDrawingNo !== undefined) rec.substituteDrawingNo = normKey(raw.substituteDrawingNo);
    if (raw.substituteRemarks !== undefined) rec.substituteRemarks = normKey(raw.substituteRemarks);
    if (raw.supplierNotes !== undefined) rec.supplierNotes = normKey(raw.supplierNotes);
    if (raw.reprocureBy !== undefined) rec.reprocureBy = normKey(raw.reprocureBy);
    if (raw.costBorneBy !== undefined) rec.costBorneBy = normKey(raw.costBorneBy);
    if (raw.approvedBy !== undefined) rec.approvedBy = normKey(raw.approvedBy);
    if (raw.mapnaRep !== undefined) rec.mapnaRep = normKey(raw.mapnaRep);
    if (raw.installerSignatory !== undefined) rec.installerSignatory = normKey(raw.installerSignatory);
    if (raw.supplierSignatory !== undefined) rec.supplierSignatory = normKey(raw.supplierSignatory);
    if (raw.status) rec.status = raw.status;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);

    const linkedDet = db.detailed.find((x) => x.id === rec.detailedId);
    if (linkedDet) {
      linkedDet.repNo = appendUniqueRef(linkedDet.repNo, rec.docNo);
      if (rec.status === 'approved') linkedDet.repStatus = 'تأیید شده';
      else if (rec.status === 'executed') linkedDet.repStatus = 'اجرا شده';
      else linkedDet.repStatus = 'در انتظار تأیید';
      if (rec.reprocureBy) linkedDet.repReprocured = rec.reprocureBy;
      if (rec.substituteDescription) linkedDet.repDescription = rec.substituteDescription;
      linkedDet.updatedAt = new Date().toISOString();
    }

    addAudit(db, sanitizeUser(u), 'UPDATE_SUBSTITUTION', 'substitution', rec.docNo, `ویرایش فرم جایگزینی شماره ${rec.docNo}`);
    await saveActiveDb();
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/substitutions/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.substitutions.findIndex((s) => s.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('سند جایگزینی یافت نشد', 'Substitution record not found'), 404);
    const [removed] = db.substitutions.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_SUBSTITUTION', 'substitution', removed.docNo, `حذف فرم جایگزینی شماره ${removed.docNo}`);
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- MATERIAL ESTIMATION (MTO) ----------------
  if (pathname === '/api/estimations' && method === 'GET') {
    requireAuth();
    return {
      records: db.materialEstimates,
      detailedItems: [...db.detailed.map(computeDetailedEntry)].reverse(),
    } as T;
  }

  if (pathname === '/api/estimations' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<MaterialEstimateRecord>;
    const cleanDesc = normKey(raw.description);
    const estQty = toNum(raw.estimatedQty) ?? 0;
    if (!cleanDesc) {
      throw new StaticEngineError(errMsg('شرح تجهیزات برآورد الزامی است', 'Estimated equipment description is required'), 400);
    }
    if (estQty <= 0) {
      throw new StaticEngineError(errMsg('مقدار برآورد باید بزرگتر از صفر باشد', 'Estimated quantity must be greater than zero'), 400);
    }
    const cleanGeneralDesc = normKey(raw.generalDescription)
      ? formatGeneralDescriptionCase(normKey(raw.generalDescription))
      : inferGeneralDescription(cleanDesc);
    const now = new Date().toISOString();
    const record: MaterialEstimateRecord = {
      id: makeId(),
      mtoCode: normKey(raw.mtoCode),
      generalDescription: cleanGeneralDesc,
      description: cleanDesc,
      itemCode: normKey(raw.itemCode),
      size: normKey(raw.size),
      countingUnit: normalizeCountingUnitToFa(raw.countingUnit) || 'عدد',
      estimatedQty: roundQty(estQty),
      island: normKey(raw.island),
      system: normKey(raw.system),
      subSystem: normKey(raw.subSystem),
      unit: normKey(raw.unit),
      priority: raw.priority === 'critical' ? 'critical' : 'normal',
      notes: normKey(raw.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: u.fullName || u.username,
    };
    db.materialEstimates.unshift(record);
    registerCategoryValue(db, 'island', record.island);
    registerCategoryValue(db, 'system', record.system);
    registerCategoryValue(db, 'subSystem', record.subSystem);
    registerCategoryValue(db, 'unit', record.unit);
    addAudit(
      db,
      sanitizeUser(u),
      'CREATE_ESTIMATION',
      'estimation',
      record.mtoCode || record.itemCode || record.description.slice(0, 32),
      `ثبت ردیف برآورد تجهیزات: ${record.description}`,
    );
    await saveActiveDb();
    return { record } as T;
  }

  if (pathname.startsWith('/api/estimations/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.materialEstimates.find((e) => e.id === id);
    if (!rec) {
      throw new StaticEngineError(errMsg('ردیف برآورد تجهیزات یافت نشد', 'Equipment estimation record not found'), 404);
    }
    const raw = body as Partial<MaterialEstimateRecord>;
    if (raw.description !== undefined) {
      const cleanDesc = normKey(raw.description);
      if (!cleanDesc) {
        throw new StaticEngineError(errMsg('شرح تجهیزات برآورد الزامی است', 'Estimated equipment description is required'), 400);
      }
      rec.description = cleanDesc;
    }
    if (raw.generalDescription !== undefined) {
      const cleanGen = normKey(raw.generalDescription);
      rec.generalDescription = cleanGen
        ? formatGeneralDescriptionCase(cleanGen)
        : inferGeneralDescription(rec.description);
    }
    if (raw.estimatedQty !== undefined) {
      const qty = toNum(raw.estimatedQty) ?? 0;
      if (qty <= 0) {
        throw new StaticEngineError(errMsg('مقدار برآورد باید بزرگتر از صفر باشد', 'Estimated quantity must be greater than zero'), 400);
      }
      rec.estimatedQty = roundQty(qty);
    }
    if (raw.mtoCode !== undefined) rec.mtoCode = normKey(raw.mtoCode);
    if (raw.itemCode !== undefined) rec.itemCode = normKey(raw.itemCode);
    if (raw.size !== undefined) rec.size = normKey(raw.size);
    if (raw.countingUnit !== undefined) rec.countingUnit = normalizeCountingUnitToFa(raw.countingUnit) || 'عدد';
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.subSystem !== undefined) rec.subSystem = normKey(raw.subSystem);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.priority === 'normal' || raw.priority === 'critical') rec.priority = raw.priority;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);
    rec.updatedAt = new Date().toISOString();

    registerCategoryValue(db, 'island', rec.island);
    registerCategoryValue(db, 'system', rec.system);
    registerCategoryValue(db, 'subSystem', rec.subSystem);
    registerCategoryValue(db, 'unit', rec.unit);
    addAudit(
      db,
      sanitizeUser(u),
      'UPDATE_ESTIMATION',
      'estimation',
      rec.mtoCode || rec.itemCode || rec.description.slice(0, 32),
      `ویرایش ردیف برآورد تجهیزات: ${rec.description}`,
    );
    await saveActiveDb();
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/estimations/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.materialEstimates.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new StaticEngineError(errMsg('ردیف برآورد تجهیزات یافت نشد', 'Equipment estimation record not found'), 404);
    }
    const [removed] = db.materialEstimates.splice(idx, 1);
    addAudit(
      db,
      sanitizeUser(u),
      'DELETE_ESTIMATION',
      'estimation',
      removed.mtoCode || removed.itemCode || removed.description.slice(0, 32),
      `حذف ردیف برآورد تجهیزات: ${removed.description}`,
    );
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- MATERIAL BALANCE ----------------
  if (pathname === '/api/balance/assign' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const detailedIds = (body.detailedIds as string[]) || [];
    const cleanNo = normKey(String(body.materialBalanceNo || ''));
    const cleanStatus = normKey(String(body.balanceStatus || ''));
    if (!detailedIds.length) {
      throw new StaticEngineError(errMsg('حداقل یک آیتم انتخاب کنید', 'Select at least one item'), 400);
    }
    if (!cleanNo && !cleanStatus) {
      throw new StaticEngineError(errMsg('شماره موازنه یا وضعیت موازنه الزامی است', 'Balance No. or Balance Status is required'), 400);
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = db.detailed.find((x) => x.id === id);
      if (!d) continue;
      if (cleanNo) d.materialBalanceNo = cleanNo;
      if (cleanStatus) d.balanceStatus = cleanStatus;
      d.updatedAt = now;
      updatedCount += 1;
    }
    addAudit(db, sanitizeUser(u), 'ASSIGN_MATERIAL_BALANCE', 'balance', cleanNo || cleanStatus, `ثبت موازنه مواد برای ${updatedCount} ردیف`);
    await saveActiveDb();
    return { ok: true, updatedCount } as T;
  }

  // ---------------- STOCKTAKE ----------------
  if (pathname === '/api/stocktake/assign' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const detailedIds = (body.detailedIds as string[]) || [];
    const cleanStatus = normKey(String(body.stocktakeStatus || ''));
    const cleanDate = normKey(String(body.stocktakeDate || ''));
    const cleanInfo = normKey(String(body.stocktakeInfo || ''));
    if (!detailedIds.length || !cleanStatus) {
      throw new StaticEngineError(errMsg('انتخاب اقلام و وضعیت انبارگردانی و بازدید ادواری الزامی است', 'Items and stocktake & periodic inspection status are required'), 400);
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = db.detailed.find((x) => x.id === id);
      if (!d) continue;
      d.stocktakeStatus = cleanStatus;
      if (cleanDate) d.stocktakeDate = cleanDate;
      d.stocktakeInfo = cleanInfo || (cleanDate ? `${cleanStatus} (${cleanDate})` : cleanStatus);
      d.updatedAt = now;
      updatedCount += 1;
    }
    addAudit(db, sanitizeUser(u), 'ASSIGN_STOCKTAKE', 'stocktake', cleanStatus, `ثبت وضعیت انبارگردانی و بازدید ادواری «${cleanStatus}» برای ${updatedCount} ردیف`);
    await saveActiveDb();
    return { ok: true, updatedCount } as T;
  }

  // ---------------- PERIODIC INSPECTION CHECKLIST ----------------
  if (pathname === '/api/periodic-inspections' && method === 'GET') {
    requireAuth();
    return { records: db.periodicInspections } as T;
  }

  if (pathname === '/api/periodic-inspections' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<PeriodicInspectionRecord>;
    const cleanDate = normKey(raw.inspectionDate);
    if (!cleanDate) {
      throw new StaticEngineError(errMsg('تاریخ بازدید ادواری الزامی است', 'Inspection date is required'), 400);
    }
    const answers = Array.isArray(raw.answers)
      ? raw.answers.map((a) => ({
          questionKey: normKey(a?.questionKey),
          status: (a?.status === '+' || a?.status === '-' ? a.status : '') as '+' | '-' | '',
          remarks: normKey(a?.remarks),
        }))
      : [];

    const record: PeriodicInspectionRecord = {
      id: makeId(),
      projectName: normKey(raw.projectName),
      inspectionDate: cleanDate,
      supervisorName: normKey(raw.supervisorName),
      inspectorsSignatory: normKey(raw.inspectorsSignatory),
      siteSupervisorSignatory: normKey(raw.siteSupervisorSignatory),
      projectManagerSignatory: normKey(raw.projectManagerSignatory),
      copyTo: normKey(raw.copyTo),
      answers,
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.periodicInspections.unshift(record);
    addAudit(
      db,
      sanitizeUser(u),
      'CREATE_PERIODIC_INSPECTION',
      'periodicInspection',
      cleanDate,
      `ثبت چک‌لیست بازدید ادواری انبار مورخ ${cleanDate}`,
    );
    await saveActiveDb();
    return { record } as T;
  }

  if (pathname.startsWith('/api/periodic-inspections/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.periodicInspections.find((r) => r.id === id);
    if (!rec) throw new StaticEngineError(errMsg('سابقه بازدید ادواری یافت نشد', 'Periodic inspection record not found'), 404);
    const raw = body as Partial<PeriodicInspectionRecord>;
    const cleanDate = normKey(raw.inspectionDate ?? rec.inspectionDate);
    if (!cleanDate) {
      throw new StaticEngineError(errMsg('تاریخ بازدید ادواری الزامی است', 'Inspection date is required'), 400);
    }
    rec.inspectionDate = cleanDate;
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.supervisorName !== undefined) rec.supervisorName = normKey(raw.supervisorName);
    if (raw.inspectorsSignatory !== undefined) rec.inspectorsSignatory = normKey(raw.inspectorsSignatory);
    if (raw.siteSupervisorSignatory !== undefined) rec.siteSupervisorSignatory = normKey(raw.siteSupervisorSignatory);
    if (raw.projectManagerSignatory !== undefined) rec.projectManagerSignatory = normKey(raw.projectManagerSignatory);
    if (raw.copyTo !== undefined) rec.copyTo = normKey(raw.copyTo);
    if (Array.isArray(raw.answers)) {
      rec.answers = raw.answers.map((a) => ({
        questionKey: normKey(a?.questionKey),
        status: (a?.status === '+' || a?.status === '-' ? a.status : '') as '+' | '-' | '',
        remarks: normKey(a?.remarks),
      }));
    }
    addAudit(
      db,
      sanitizeUser(u),
      'UPDATE_PERIODIC_INSPECTION',
      'periodicInspection',
      cleanDate,
      `ویرایش چک‌لیست بازدید ادواری انبار مورخ ${cleanDate}`,
    );
    await saveActiveDb();
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/periodic-inspections/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.periodicInspections.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new StaticEngineError(errMsg('سابقه بازدید ادواری یافت نشد', 'Periodic inspection record not found'), 404);
    }
    const [removed] = db.periodicInspections.splice(idx, 1);
    addAudit(
      db,
      sanitizeUser(u),
      'DELETE_PERIODIC_INSPECTION',
      'periodicInspection',
      removed.inspectionDate,
      `حذف چک‌لیست بازدید ادواری مورخ ${removed.inspectionDate}`,
    );
    await saveActiveDb();
    return { ok: true } as T;
  }

  // ---------------- SEARCH ----------------
  if (pathname === '/api/search' && method === 'GET') {
    requireAuth();
    const q = (query.get('q') || '').trim();
    const packingNos = parsePackingNosParam(query.get('packingNos'));
    const customFilters = parseCustomFiltersParam(query.get('customFilters'));
    const limit = Math.min(200, Number(query.get('limit') || 40));
    if (!q && packingNos.length === 0 && customFilters.length === 0) {
      return { general: [], detailed: [], transit: [] } as T;
    }

    const general = db.general.filter((g) => {
      if (!matchesMultiPacking(g.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(g as unknown as Record<string, unknown>, customFilters)) return false;
      return matchSearch([
        g.rowNo, g.packingListNo, g.packageNo, g.packageType || '', g.itemDescription, g.supplier, g.dispatchLocation,
        g.employerEntryMinutesNo, g.mapnaEntryMinutesNo, g.billOfLadingNo, g.vehicleNo, g.driverName, g.island, g.system, g.subSystem, g.unit,
      ], q);
    }).reverse().slice(0, limit);

    const detailed = db.detailed.filter((d) => {
      if (!matchesMultiPacking(d.shipmentNo, packingNos)) return false;
      return matchSearch([
        d.rowNo, d.shipmentNo, d.packageNo, d.itemNo, d.generalDescription, d.description, d.itemCode, d.mtoRef,
        d.supplier, d.gcvReceiptNo, d.mivContractorNo, d.smrContractorNo, d.materialBalanceNo, d.balanceStatus, d.storageLocation, d.stocktakeStatus,
      ], q);
    }).map(computeDetailedEntry).filter((c) => matchesCustomFilters(c as unknown as Record<string, unknown>, customFilters)).reverse().slice(0, limit);

    const transit = db.transit.filter((t) => {
      if (!matchesMultiPacking(t.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(t as unknown as Record<string, unknown>, customFilters)) return false;
      return matchSearch([
        t.rowNo, t.packingListNo, t.packageNo, t.itemDescription, t.supplier, t.overallStatus,
        t.releaseNetNo, t.interimNo, t.billOfLadingNo, t.carrierContractor,
      ], q);
    }).reverse().slice(0, limit);

    return { general, detailed, transit } as T;
  }

  // ---------------- CATEGORIES ----------------
  if (pathname === '/api/categories' && method === 'GET') {
    requireAuth();
    sanitizeCategoryStore(db.categories);
    const counts = computeCategoryCounts(db);
    return { categories: db.categories, counts } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const rawVal = String(body.value || '');
    const val = group === 'countingUnit' ? normalizeCountingUnitToFa(rawVal) : normKey(rawVal);
    if (!db.categories[group] || !val) throw new StaticEngineError(errMsg('گروه یا مقدار نامعتبر است', 'Invalid category group or value'), 400);
    if (group === 'transitStatus' && val === 'پایان') {
      throw new StaticEngineError(errMsg('وضعیت «پایان» به‌صورت خودکار به «رسیده» تبدیل می‌شود.', 'Legacy status "پایان" maps automatically to "رسیده".'), 400);
    }
    registerCategoryValue(db, group, val);
    addAudit(db, sanitizeUser(u), 'ADD_CATEGORY', 'category', `${group}:${val}`, `افزودن دسته‌بندی «${val}»`);
    await saveActiveDb();
    return { categories: db.categories } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const from = normKey(String(body.oldValue || ''));
    const rawTo = String(body.newValue || '');
    const to = group === 'countingUnit' ? normalizeCountingUnitToFa(rawTo) : normKey(rawTo);
    if (!db.categories[group] || !from || !to) throw new StaticEngineError(errMsg('مقادیر تغییر نام نامعتبر است', 'Invalid rename request'), 400);
    if (group === 'transitStatus' && (DEFAULT_TRANSIT_STATUSES as readonly string[]).includes(from)) {
      throw new StaticEngineError(errMsg('سه وضعیت اصلی در راه قابل تغییر نام نیستند.', 'The 3 core In-Transit statuses cannot be renamed.'), 400);
    }
    const updatedCount = applyCategoryRename(db, group, from, to);
    addAudit(db, sanitizeUser(u), 'RENAME_MERGE_CATEGORY', 'category', `${group}:${from}->${to}`, `تغییر نام/ادغام «${from}» به «${to}» (${updatedCount} رکورد به‌روزرسانی شد)`);
    await saveActiveDb();
    return { categories: db.categories, updatedCount } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
    const u = requireAuth(['admin']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const val = normKey(query.get('value'));
    if (group === 'transitStatus' && (DEFAULT_TRANSIT_STATUSES as readonly string[]).includes(val)) {
      throw new StaticEngineError(errMsg('سه وضعیت اصلی در راه قابل حذف نیستند.', 'The 3 core In-Transit statuses cannot be deleted.'), 400);
    }
    const updatedCount = applyCategoryDelete(db, group, val);
    addAudit(db, sanitizeUser(u), 'DELETE_CATEGORY', 'category', `${group}:${val}`, `حذف «${val}» (${updatedCount} رکورد به‌روزرسانی شد)`);
    await saveActiveDb();
    return { categories: db.categories, updatedCount } as T;
  }

  // ---------------- ANALYTICS ----------------
  if (pathname === '/api/analytics' && method === 'GET') {
    requireAuth();
    const calendar = (query.get('calendar') || 'jalali') as CalendarMode;
    const uniquePackings = new Set<string>();
    const uniquePackages = new Set<string>();
    let closedPackingsCount = 0;

    for (const g of db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) uniquePackings.add(pk);
      const ng = normKey(g.packageNo);
      if (ng) uniquePackages.add(`${pk}::${ng}`);
    }
    for (const d of db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) uniquePackings.add(pk);
    }
    for (const pk of uniquePackings) {
      if (db.packingMeta[pk]?.isClosed) closedPackingsCount += 1;
    }

    const detailedComputed = db.detailed.map(computeDetailedEntry);
    const shortageItems = detailedComputed.filter((d) => d.hasShortage);
    const damagedItems = detailedComputed.filter((d) => d.hasDamaged);
    const generalSummary = computeSelectionFormulaSummary({ general: db.general });
    const detailedSummary = computeSelectionFormulaSummary({ detailed: detailedComputed });
    const transitSummary = computeSelectionFormulaSummary({ transit: db.transit });

    const transitByStatus: Record<string, number> = {};
    for (const t of db.transit) {
      const st = normKey(t.overallStatus) || 'نامشخص';
      transitByStatus[st] = (transitByStatus[st] || 0) + 1;
    }

    const byIslandMap: Record<
      string,
      {
        name: string;
        generalCount: number;
        detailedCount: number;
        shortageRowCount: number;
        shortageQty: number;
        mapnaStock: number;
        contractorStock: number;
      }
    > = {};
    for (const g of db.general) {
      const bucket = normalizeIslandBucket(g.island);
      if (!byIslandMap[bucket.key]) {
        byIslandMap[bucket.key] = {
          name: bucket.label,
          generalCount: 0,
          detailedCount: 0,
          shortageRowCount: 0,
          shortageQty: 0,
          mapnaStock: 0,
          contractorStock: 0,
        };
      }
      byIslandMap[bucket.key].generalCount += 1;
    }
    for (const d of detailedComputed) {
      const bucket = normalizeIslandBucket(d.island);
      if (!byIslandMap[bucket.key]) {
        byIslandMap[bucket.key] = {
          name: bucket.label,
          generalCount: 0,
          detailedCount: 0,
          shortageRowCount: 0,
          shortageQty: 0,
          mapnaStock: 0,
          contractorStock: 0,
        };
      }
      byIslandMap[bucket.key].detailedCount += 1;
      if (d.hasShortage) {
        byIslandMap[bucket.key].shortageRowCount += 1;
      }
      byIslandMap[bucket.key].shortageQty = roundQty(byIslandMap[bucket.key].shortageQty + d.shortage);
      if (!d.opiPending && d.mapnaInventory > 0) {
        byIslandMap[bucket.key].mapnaStock += 1;
      }
      if (!d.opiPending && d.contractorInventory > 0) {
        byIslandMap[bucket.key].contractorStock += 1;
      }
    }

    const monthBuckets: Record<string, { monthKey: string; generalRows: number; detailedRows: number; grossWeight: number }> = {};
    for (const g of db.general) {
      const mk = getMonthKeyFromIso(g.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      monthBuckets[mk].generalRows += 1;
      monthBuckets[mk].grossWeight += g.grossWeight || 0;
    }
    for (const d of db.detailed) {
      const mk = getMonthKeyFromIso(d.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      monthBuckets[mk].detailedRows += 1;
    }

    const allMonthlyBuckets = Object.values(monthBuckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const availableYears = Array.from(
      new Set(allMonthlyBuckets.map((m) => m.monthKey.slice(0, 4)).filter((y) => /^\d{4}$/.test(y))),
    ).sort((a, b) => b.localeCompare(a));
    const requestedYear = normalizeDigits((query.get('year') || '').trim());
    const selectedYear =
      requestedYear && availableYears.includes(requestedYear)
        ? requestedYear
        : availableYears[0] || '';
    const monthlyTrend = selectedYear
      ? buildYearMonths(selectedYear, calendar).map(
          (mk) => monthBuckets[mk] || { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 },
        )
      : allMonthlyBuckets.slice(-12);

    const openMerItems = detailedComputed
      .filter((d) => isMerOpen(d))
      .map((d) => ({
        id: d.id,
        rowNo: d.rowNo,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        merNo: d.merNo,
        merStatus: d.merStatus,
        packingQty: d.packingQty,
        actualQty: d.actualQty,
        effectiveActualQty: d.effectiveActualQty,
        damagedQty: d.damagedQty,
        shortage: d.shortage,
        countingUnit: d.countingUnit,
      }));
    const openRepItems = detailedComputed
      .filter((d) => isRepOpen(d))
      .map((d) => ({
        id: d.id,
        rowNo: d.rowNo,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        repNo: d.repNo,
        repStatus: d.repStatus,
        packingQty: d.packingQty,
        actualQty: d.actualQty,
        effectiveActualQty: d.effectiveActualQty,
        damagedQty: d.damagedQty,
        shortage: d.shortage,
        countingUnit: d.countingUnit,
      }));
    const expiringChemicals = getExpiringChemicals(detailedComputed, 30);

    return {
      counts: {
        generalRows: db.general.length,
        detailedRows: db.detailed.length,
        transitRows: db.transit.length,
        uniquePackings: uniquePackings.size,
        uniquePackages: uniquePackages.size,
        closedPackings: closedPackingsCount,
        shortageItemsCount: shortageItems.length,
        damagedItemsCount: damagedItems.length,
        openMerCount: openMerItems.length,
        openRepCount: openRepItems.length,
        expiringChemicalsCount: expiringChemicals.length,
      },
      totals: {
        ...detailedSummary,
        grossWeightSum: generalSummary.grossWeightSum,
        netWeightSum: generalSummary.netWeightSum,
        weighbridgeWeightSum: generalSummary.weighbridgeWeightSum,
        freightCostSum: generalSummary.freightCostSum,
        packingsByIsland: generalSummary.packingsByIsland,
        grossWeightTons: roundQty(generalSummary.grossWeightSum / 1000),
        netWeightTons: roundQty(generalSummary.netWeightSum / 1000),
        transitAmountSum: transitSummary.transitAmountSum,
      },
      transitByStatus: Object.entries(transitByStatus).map(([status, count]) => ({ status, count })),
      byIsland: Object.values(byIslandMap).sort((a, b) => (b.generalCount + b.detailedCount) - (a.generalCount + a.detailedCount)),
      availableYears,
      selectedYear,
      allMonthlyBuckets,
      monthlyTrend,
      topShortages: [...shortageItems].reverse().slice(0, 12),
      topDamaged: [...damagedItems].reverse().slice(0, 12),
      openMerItems: [...openMerItems].reverse().slice(0, 20),
      openRepItems: [...openRepItems].reverse().slice(0, 20),
      expiringChemicals,
    } as T;
  }

  // ---------------- IMPORT & AI FALLBACK ----------------
  const generalDupKey = (r: Partial<GeneralEntry>) => buildGeneralDupKey(r);

  const detailedDupKey = (r: Partial<DetailedEntry>) => buildDetailedDupKey(r);

  const transitDupKey = (r: Partial<TransitEntry>) => buildTransitDupKey(r);

  if (pathname === '/api/import/preview' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const csvText = String(body.csvText || '');
    const rawMatrix = body.matrix as string[][] | undefined;
    const formulaMap = body.formulaMap as Record<string, string> | undefined;
    const structuredRecords = Array.isArray(body.structuredRecords)
      ? (body.structuredRecords as Record<string, unknown>[])
      : undefined;
    const sheetName = typeof body.sheetName === 'string' ? body.sheetName : undefined;
    const sectionHint = typeof body.sectionHint === 'string' ? body.sectionHint : undefined;
    const matrix = Array.isArray(rawMatrix) && rawMatrix.length > 0 ? rawMatrix : csvText ? parseCsvMatrix(csvText) : [];
    const cal = (body.assumedCalendar as CalendarMode) || 'jalali';
    const detectedExtended: ExtendedImportScope =
      (body.scope as ExtendedImportScope | undefined) ||
      detectExtendedScope(matrix, sheetName, sectionHint, structuredRecords) ||
      (matrix.length > 0 ? detectCsvScope(matrix) : null) ||
      'general';

    const PREVIEW_ROW_CAP = 100;

    if (isOperationalScope(detectedExtended)) {
      const opPrev = previewOperationalFormImport({
        db,
        scope: detectedExtended,
        matrix,
        formulaMap,
        structuredRecords,
        sheetName,
        assumedCalendar: cal,
        actorName: u.fullName || u.username,
      });
      return {
        scope: detectedExtended,
        isOperational: true,
        totalRows: opPrev.totalRows,
        skippedEmpty: opPrev.skippedEmpty,
        parseRejectedRows: [],
        duplicateRowNos: 0,
        duplicateDbCount: opPrev.duplicateDbCount,
        duplicateInFileCount: 0,
        duplicateRecordsCount: opPrev.duplicateDbCount,
        duplicateSamples: opPrev.duplicateSamples,
        estimatedLinks: opPrev.estimatedLinks,
        warnings: opPrev.warnings,
        sample: opPrev.sample,
        parsedRows: opPrev.parsedRecords.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: opPrev.parsedRecords.length > PREVIEW_ROW_CAP,
        deltaSummary: opPrev.deltaSummary,
      } as T;
    }

    const detectedScope = detectedExtended as ImportScope;
    const columnMapping = body.columnMapping as Record<string, number> | undefined;
    const columnInspection = inspectMatrixColumns(matrix, detectedScope);
    const activeMapping = columnMapping || columnInspection.mapping;

    const analyzeDuplicates = <ItemT,>(
      rows: ItemT[],
      existingArr: ItemT[],
      keyFn: (item: ItemT) => string,
      formatLabel: (item: ItemT) => string,
    ) => {
      const dbKeys = new Set(existingArr.map(keyFn).filter(Boolean));
      const seenInFile = new Set<string>();
      const dbDuplicates: ItemT[] = [];
      const inFileDuplicates: ItemT[] = [];
      for (const r of rows) {
        const k = keyFn(r);
        if (!k) continue;
        if (dbKeys.has(k)) {
          dbDuplicates.push(r);
        } else if (seenInFile.has(k)) {
          inFileDuplicates.push(r);
        } else {
          seenInFile.add(k);
        }
      }
      const allDups = [...dbDuplicates, ...inFileDuplicates];
      return {
        duplicateDbCount: dbDuplicates.length,
        duplicateInFileCount: inFileDuplicates.length,
        duplicateRecordsCount: allDups.length,
        duplicateSamples: allDups.slice(0, 5).map(formatLabel),
      };
    };

    if (detectedScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, u.username, activeMapping);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && isRowNoTaken(db, 'general', r.rowNo)).length;
      const dupStats = analyzeDuplicates(
        parsed.rows as GeneralEntry[],
        db.general,
        generalDupKey,
        (r) => `${r.packingListNo || '-'} / ${r.packageNo || r.mapnaEntryMinutesNo || '-'}`,
      );
      const deltaAnalysis = analyzeImportDelta({
        incomingRows: parsed.rows as unknown as Record<string, unknown>[],
        existingRows: db.general as unknown as Record<string, unknown>[],
        getIncomingKey: (r) => generalDupKey(r as Partial<GeneralEntry>),
        getExistingKey: (r) => generalDupKey(r as Partial<GeneralEntry>),
        getKeyLabel: (r) => `${String(r.packingListNo || '-')} / ${String(r.packageNo || '-')}`,
      });
      return {
        scope: 'general',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        parseRejectedRows: parsed.rejectedRows,
        duplicateRowNos,
        ...dupStats,
        deltaSummary: {
          isIdentical: deltaAnalysis.isIdentical,
          newCount: deltaAnalysis.newCount,
          modifiedCount: deltaAnalysis.modifiedCount,
          unchangedCount: deltaAnalysis.unchangedCount,
          totalIncoming: deltaAnalysis.totalIncoming,
          changedFieldsSample: deltaAnalysis.changedFieldsSample,
        },
        sample: parsed.rows.slice(0, 5),
        parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
        columnInspection: { ...columnInspection, mapping: activeMapping },
      } as T;
    }
    if (detectedScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, u.username, activeMapping);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && isRowNoTaken(db, 'detailed', r.rowNo)).length;
      const dupStats = analyzeDuplicates(
        parsed.rows as DetailedEntry[],
        db.detailed,
        detailedDupKey,
        (r) => `${r.shipmentNo || '-'} / ${r.packageNo || '-'} / #${r.itemNo || '-'}`,
      );
      const deltaAnalysis = analyzeImportDelta({
        incomingRows: parsed.rows as unknown as Record<string, unknown>[],
        existingRows: db.detailed as unknown as Record<string, unknown>[],
        getIncomingKey: (r) => detailedDupKey(r as Partial<DetailedEntry>),
        getExistingKey: (r) => detailedDupKey(r as Partial<DetailedEntry>),
        getKeyLabel: (r) => `${String(r.shipmentNo || '-')} / ${String(r.packageNo || '-')} / #${String(r.itemNo || '-')}`,
      });
      return {
        scope: 'detailed',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        parseRejectedRows: parsed.rejectedRows,
        duplicateRowNos,
        ...dupStats,
        deltaSummary: {
          isIdentical: deltaAnalysis.isIdentical,
          newCount: deltaAnalysis.newCount,
          modifiedCount: deltaAnalysis.modifiedCount,
          unchangedCount: deltaAnalysis.unchangedCount,
          totalIncoming: deltaAnalysis.totalIncoming,
          changedFieldsSample: deltaAnalysis.changedFieldsSample,
        },
        sample: parsed.rows.slice(0, 5),
        parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
        columnInspection: { ...columnInspection, mapping: activeMapping },
      } as T;
    }
    const parsed = parseTransitCsv(matrix, cal, u.username, activeMapping);
    const dupStats = analyzeDuplicates(
      parsed.rows as TransitEntry[],
      db.transit,
      transitDupKey,
      (r) => `${r.packingListNo || '-'} / ${r.packageNo || '-'}`,
    );
    const deltaAnalysis = analyzeImportDelta({
      incomingRows: parsed.rows as unknown as Record<string, unknown>[],
      existingRows: db.transit as unknown as Record<string, unknown>[],
      getIncomingKey: (r) => transitDupKey(r as Partial<TransitEntry>),
      getExistingKey: (r) => transitDupKey(r as Partial<TransitEntry>),
      getKeyLabel: (r) => `${String(r.packingListNo || '-')} / ${String(r.packageNo || '-')}`,
    });
    return {
      scope: 'transit',
      totalRows: parsed.rows.length,
      skippedEmpty: parsed.skippedEmpty,
      parseRejectedRows: parsed.rejectedRows,
      duplicateRowNos: 0,
      ...dupStats,
      deltaSummary: {
        isIdentical: deltaAnalysis.isIdentical,
        newCount: deltaAnalysis.newCount,
        modifiedCount: deltaAnalysis.modifiedCount,
        unchangedCount: deltaAnalysis.unchangedCount,
        totalIncoming: deltaAnalysis.totalIncoming,
        changedFieldsSample: deltaAnalysis.changedFieldsSample,
      },
      sample: parsed.rows.slice(0, 5),
      parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
      parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
      columnInspection: { ...columnInspection, mapping: activeMapping },
    } as T;
  }

  if (pathname === '/api/import/commit' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const csvText = String(body.csvText || '');
    const rawMatrix = body.matrix as string[][] | undefined;
    const formulaMap = body.formulaMap as Record<string, string> | undefined;
    const structuredRecords = Array.isArray(body.structuredRecords)
      ? (body.structuredRecords as Record<string, unknown>[])
      : undefined;
    const sheetName = typeof body.sheetName === 'string' ? body.sheetName : undefined;
    const sectionHint = typeof body.sectionHint === 'string' ? body.sectionHint : undefined;
    const editedRows = Array.isArray(body.editedRows) ? (body.editedRows as Record<string, unknown>[]) : undefined;
    const columnMapping = body.columnMapping as Record<string, number> | undefined;
    const matrix = Array.isArray(rawMatrix) && rawMatrix.length > 0 ? rawMatrix : csvText ? parseCsvMatrix(csvText) : [];
    const hasEdited = Boolean(editedRows && editedRows.length > 0);
    const cal = (body.assumedCalendar as CalendarMode) || 'jalali';
    const dupPolicy: 'replace' | 'skip' | 'delta' =
      body.duplicateRecordPolicy === 'replace'
        ? 'replace'
        : body.duplicateRecordPolicy === 'delta'
          ? 'delta'
          : 'skip';
    const resolvedExtended: ExtendedImportScope =
      (body.scope as ExtendedImportScope | undefined) ||
      detectExtendedScope(matrix, sheetName, sectionHint, structuredRecords) ||
      (matrix.length > 0 ? detectCsvScope(matrix) : null) ||
      'general';

    if (isOperationalScope(resolvedExtended)) {
      const opResult = commitOperationalFormImport({
        db,
        scope: resolvedExtended,
        matrix,
        formulaMap,
        structuredRecords: hasEdited ? editedRows : structuredRecords,
        sheetName,
        assumedCalendar: cal,
        duplicateRecordPolicy: dupPolicy,
        actorName: u.fullName || u.username,
      });
      rebuildCategories(db);
      const meta = EXTENDED_SCOPE_META[resolvedExtended];
      addAudit(
        db,
        sanitizeUser(u),
        'IMPORT_OPERATIONAL_FORM',
        'import',
        resolvedExtended,
        `ورود خودکار «${meta.labelFa}»: ${opResult.imported} جدید، ${opResult.replaced} جایگزین، ${opResult.skipped} رد شد`,
      );
      await saveActiveDb();
      return {
        scope: resolvedExtended,
        isOperational: true,
        imported: opResult.imported,
        replaced: opResult.replaced,
        skipped: opResult.skipped,
        unchangedSkipped: opResult.unchangedSkipped || 0,
        parseRejectedCount: 0,
        blankRowsSkipped: 0,
        transitAutoArrived: opResult.linkedTransit,
        linkedGeneral: opResult.linkedGeneral,
        linkedDetailed: opResult.linkedDetailed,
        linkedTransit: opResult.linkedTransit,
        warnings: opResult.warnings,
        rejectedRecords: [],
      } as T;
    }

    const targetScope = resolvedExtended as ImportScope;
    const forceAdd = Boolean(body.forceAddDuplicates);
    const collectParseRejects = body.includeParserRejections !== false && matrix.length > 0;

    let imported = 0;
    let replaced = 0;
    let skipped = 0;
    let unchangedSkipped = 0;
    let blankRowsSkipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();
    const rejectedRecords: ImportRejectedRecord[] = [];
    const now = new Date().toISOString();

    if (targetScope === 'general') {
      const parseResult = matrix.length > 0
        ? parseGeneralCsv(matrix, cal, u.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<GeneralEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, GeneralEntry>();
      for (const g of db.general) {
        const k = generalDupKey(g);
        if (k) dbByKey.set(k, g);
      }
      const batchByKey = new Map<string, GeneralEntry>();

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.packingListNo) || normKey(r.packageNo) || normKey(r.itemDescription));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'general',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره پکینگ لیست، شماره نگله و شرح کالا همگی خالی هستند؛ ردیف برای جلوگیری از ثبت اطلاعات ناقص رد شد.',
            reasonEn: 'Packing List No., Package No., and Item Description are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const k = generalDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.packingListNo || '-'} / ${r.packageNo || r.mapnaEntryMinutesNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'general',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `رکورد با کلید «${labelKey}» قبلاً در پایگاه داده (ردیف ${existingDb.rowNo || '-'}) ثبت شده است و با تنظیم «رد کردن تکراری‌ها» وارد نشد.`
                : `رکورد با کلید «${labelKey}» بیش از یک بار درون همین فایل تکرار شده و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `Key "${labelKey}" already exists in database (Row ${existingDb.rowNo || '-'}) and was skipped.`
                : `Key "${labelKey}" appeared earlier in the same file and was skipped.`,
              existingSummary: `${existing.packingListNo || '-'} | نگله ${existing.packageNo || '-'} | ${existing.itemDescription || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          if (dupPolicy === 'delta' && !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>)) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          if (r.packingListNo) touchedPackings.add(r.packingListNo);
          return;
        }
        const created: GeneralEntry = { ...r, createdAt: r.createdAt || now, updatedAt: now, createdBy: r.createdBy || u.username, id: makeId() };
        if (k && !forceAdd) batchByKey.set(k, created);
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        db.general.push(created);
        imported += 1;
      });
      renumberScope(db, 'general');
    } else if (targetScope === 'detailed') {
      const parseResult = matrix.length > 0
        ? parseDetailedCsv(matrix, cal, u.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<DetailedEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, DetailedEntry>();
      for (const d of db.detailed) {
        const k = detailedDupKey(d);
        if (k) dbByKey.set(k, d);
      }
      const batchByKey = new Map<string, DetailedEntry>();

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.shipmentNo) || normKey(r.description) || normKey(r.generalDescription));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'detailed',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره محموله/پکینگ، شرح کلی و شرح کالا همگی خالی هستند و ردیف رد شد.',
            reasonEn: 'Shipment No., General Description, and Description are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const k = detailedDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        const genDesc = r.generalDescription || '';
        const rawChem = normKey(r.chemicalType);
        const inferredCls = !r.itemCategory
          ? inferItemClassification(r.description, r.notes, genDesc)
          : { itemCategory: r.itemCategory, chemicalType: '' };
        const resolvedItemCategory = r.itemCategory || (rawChem ? 'chemicals' : inferredCls.itemCategory);
        const resolvedChemicalType = rawChem || (resolvedItemCategory === 'chemicals' ? inferredCls.chemicalType : '');
        let resolvedProdDate = normKey(r.productionDate);
        let resolvedExpDate = normKey(r.expirationDate);
        if (resolvedItemCategory === 'chemicals' && (!resolvedProdDate || !resolvedExpDate)) {
          const extDates = extractChemicalDatesFromTexts(
            [r.notes, r.description, genDesc],
            cal,
          );
          if (!resolvedProdDate && extDates.productionDate) resolvedProdDate = extDates.productionDate;
          if (!resolvedExpDate && extDates.expirationDate) resolvedExpDate = extDates.expirationDate;
        }
        const {
          shortage: _impShortage,
          surplus: _impSurplus,
          ...cleanDetailedRow
        } = r as Omit<DetailedEntry, 'id'> & { shortage?: number | null; surplus?: number | null };
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.shipmentNo || '-'} / ${r.packageNo || '-'} / #${r.itemNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'detailed',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `قلم با کلید «${labelKey}» قبلاً در پایگاه داده (ردیف ${existingDb.rowNo || '-'}) وجود دارد و با سیاست «رد کردن تکراری‌ها» ثبت نشد.`
                : `قلم با کلید «${labelKey}» در همین فایل تکرار شده است و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `Item "${labelKey}" already exists in database (Row ${existingDb.rowNo || '-'}) and was skipped.`
                : `Item "${labelKey}" was duplicated inside the same file and skipped.`,
              existingSummary: `${existing.shipmentNo || '-'} | نگله ${existing.packageNo || '-'} | آیتم ${existing.itemNo || '-'} | ${existing.description || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          if (
            dupPolicy === 'delta' &&
            !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, {
              ...cleanDetailedRow,
              countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
              generalDescription: genDesc,
              itemCategory: resolvedItemCategory,
              chemicalType: resolvedChemicalType,
              productionDate: resolvedProdDate,
              expirationDate: resolvedExpDate,
            } as unknown as Record<string, unknown>)
          ) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...cleanDetailedRow,
            countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
            generalDescription: genDesc,
            itemCategory: resolvedItemCategory,
            chemicalType: resolvedChemicalType,
            productionDate: resolvedProdDate,
            expirationDate: resolvedExpDate,
            id: existing.id,
            rowNo: existing.rowNo,
            shortageBackfills: existing.shortageBackfills || [],
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
          return;
        }
        const created: DetailedEntry = {
          ...cleanDetailedRow,
          countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
          generalDescription: genDesc,
          itemCategory: resolvedItemCategory,
          chemicalType: resolvedChemicalType,
          productionDate: resolvedProdDate,
          expirationDate: resolvedExpDate,
          shortageBackfills: r.shortageBackfills || [],
          createdAt: r.createdAt || now,
          updatedAt: now,
          createdBy: r.createdBy || u.username,
          id: makeId(),
        };
        if (k && !forceAdd) batchByKey.set(k, created);
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        db.detailed.push(created);
        imported += 1;
      });
      renumberScope(db, 'detailed');
    } else {
      const parseResult = matrix.length > 0
        ? parseTransitCsv(matrix, cal, u.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<TransitEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, TransitEntry>();
      for (const t of db.transit) {
        const k = transitDupKey(t);
        if (k) dbByKey.set(k, t);
      }
      const batchByKey = new Map<string, TransitEntry>();

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.packingListNo) || normKey(r.itemDescription) || normKey(r.overallStatus));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'transit',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره پکینگ لیست، شرح کالا و وضعیت کلی همگی خالی هستند و ردیف رد شد.',
            reasonEn: 'Packing List No., Item Description, and Overall Status are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const pk = normKey(r.packingListNo);
        const arrived = pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
        const k = transitDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.packingListNo || '-'} / ${r.packageNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'transit',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `محموله در راه با کلید «${labelKey}» قبلاً در پایگاه داده ثبت شده و رد شد.`
                : `محموله با کلید «${labelKey}» در همین فایل تکرار شده و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `In-transit key "${labelKey}" already exists in database and was skipped.`
                : `In-transit key "${labelKey}" appeared earlier in the same file and was skipped.`,
              existingSummary: `${existing.packingListNo || '-'} | نگله ${existing.packageNo || '-'} | ${existing.itemDescription || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          const normalizedStatus = normalizeTransitStatus(
            r.overallStatus,
            db.categories.transitStatus,
          );
          const resolvedStatus = arrived ? 'رسیده' : normalizedStatus;
          if (
            dupPolicy === 'delta' &&
            !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, {
              ...r,
              overallStatus: resolvedStatus,
            } as unknown as Record<string, unknown>)
          ) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            overallStatus: resolvedStatus,
            linkedGeneralPackingNo: arrived ? pk : r.linkedGeneralPackingNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          return;
        }
        const normalizedStatus = normalizeTransitStatus(
          r.overallStatus,
          db.categories.transitStatus,
        );
        const resolvedStatus = arrived ? 'رسیده' : normalizedStatus;
        const created: TransitEntry = {
          ...r,
          createdAt: r.createdAt || now,
          updatedAt: now,
          createdBy: r.createdBy || u.username,
          id: makeId(),
          overallStatus: resolvedStatus,
          linkedGeneralPackingNo: arrived ? pk : undefined,
        };
        if (k && !forceAdd) batchByKey.set(k, created);
        db.transit.push(created);
        imported += 1;
      });
      renumberScope(db, 'transit');
    }

    rebuildCategories(db);
    const actorName = u.fullName || u.username;
    for (const pkRaw of touchedPackings) {
      const cleanPk = normKey(pkRaw);
      if (cleanPk && (targetScope === 'general' || targetScope === 'detailed') && !db.packingMeta[cleanPk]) {
        db.packingMeta[cleanPk] = {
          packingNo: cleanPk,
          isClosed: true,
          closedAt: now,
          closedBy: actorName,
          closureNote: 'بسته‌شدن پیش‌فرض هنگام ورود اطلاعات از فایل',
        };
      }
      transitAutoArrived += syncTransitArrival(db, pkRaw, sanitizeUser(u));
    }
    addAudit(
      db,
      sanitizeUser(u),
      forceAdd ? 'IMPORT_RECOVERY_FORCE_ADD' : 'IMPORT_DATA',
      'import',
      targetScope,
      `بارگذاری فایل (${targetScope}): ${imported} ردیف جدید، ${replaced} جایگزین، ${skipped} رد شد`,
    );
    await saveActiveDb();
    return {
      scope: targetScope,
      imported,
      replaced,
      skipped,
      unchangedSkipped,
      parseRejectedCount: collectParseRejects ? rejectedRecords.filter((r) => r.reasonCode === 'missing_required').length : 0,
      blankRowsSkipped,
      transitAutoArrived,
      rejectedRecords,
    } as T;
  }

  if (pathname === '/api/import/auto-workbook' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const sheets = (body.sheets as AutoWorkbookSheetInput[]) || [];
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw new StaticEngineError(errMsg('شیتی برای تحلیل و ورود ارسال نشده است', 'No sheets provided for auto-import'), 400);
    }
    const cal = (body.assumedCalendar as CalendarMode) || 'jalali';
    const dupPolicy: 'replace' | 'skip' | 'delta' =
      body.duplicateRecordPolicy === 'replace'
        ? 'replace'
        : body.duplicateRecordPolicy === 'delta'
          ? 'delta'
          : 'skip';
    const actorName = u.fullName || u.username;

    if (body.dryRun) {
      return previewAutoWorkbook({
        db,
        sheets,
        assumedCalendar: cal,
        actorName,
      }) as T;
    }

    const summary = commitAutoWorkbook({
      db,
      sheets,
      assumedCalendar: cal,
      duplicateRecordPolicy: dupPolicy,
      actorName,
    });
    rebuildCategories(db);
    addAudit(
      db,
      sanitizeUser(u),
      'IMPORT_AUTO_WORKBOOK',
      'import',
      `${summary.sections.length}_sections`,
      `ورود خودکار چندبخشی (${summary.sections.length} بخش): ${summary.totals.imported} جدید، ${summary.totals.replaced} جایگزین، ${summary.totals.skipped} رد شد`,
    );
    await saveActiveDb();
    return summary as T;
  }

  if (pathname === '/api/ai/extract-equipment' && method === 'POST') {
    requireAuth(['admin', 'operator']);
    const target = (body.target as 'general' | 'detailed') || 'general';
    const mode = (body.mode as 'file' | 'scan' | 'voice') || 'voice';
    const textData = typeof body.textData === 'string' ? body.textData : '';
    const base64Data = typeof body.base64Data === 'string' ? body.base64Data : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    if (!textData && !base64Data) {
      throw new StaticEngineError(errMsg('داده‌ای برای تحلیل ارسال نشده است', 'No input data provided for extraction'), 400);
    }
    const result = extractEquipmentOffline({ target, mode, textData, base64Data, mimeType });
    return { result } as T;
  }

  if (pathname === '/api/ai/assistant' && method === 'POST') {
    requireAuth(['admin', 'operator', 'viewer']);
    const question = String(body.prompt || body.message || '').trim();
    const lang: Language = body.lang === 'en' ? 'en' : 'fa';
    if (!question) {
      throw new StaticEngineError(errMsg('پرسش نمی‌تواند خالی باشد', 'Prompt cannot be empty'), 400);
    }
    const result = answerLocalWarehouseQuestion(
      {
        general: db.general,
        detailed: db.detailed,
        transit: db.transit,
        gcvDocuments: db.gcvDocuments,
        mivDocuments: db.mivDocuments,
        opiInvitations: db.opiInvitations,
        opiMinutes: db.opiMinutes,
        siteEntryMinutes: db.siteEntryMinutes,
        osdrReports: db.osdrReports,
        substitutions: db.substitutions,
        materialEstimates: db.materialEstimates,
        periodicInspections: db.periodicInspections,
      },
      question,
      lang,
    );
    return result as T;
  }

  if (pathname === '/api/ai/analyze-warehouse' && method === 'POST') {
    requireAuth(['admin', 'operator', 'viewer']);
    const lang: Language = body.lang === 'en' ? 'en' : 'fa';
    const result = runLocalWarehouseAnalysis(
      {
        general: db.general,
        detailed: db.detailed,
        transit: db.transit,
        gcvDocuments: db.gcvDocuments,
        mivDocuments: db.mivDocuments,
        opiInvitations: db.opiInvitations,
        opiMinutes: db.opiMinutes,
        siteEntryMinutes: db.siteEntryMinutes,
        osdrReports: db.osdrReports,
        substitutions: db.substitutions,
        materialEstimates: db.materialEstimates,
        periodicInspections: db.periodicInspections,
      },
      lang,
    );
    return result as T;
  }

  if (pathname === '/api/ai/classify-item' && method === 'POST') {
    requireAuth(['admin', 'operator']);
    const description = String(body.description || '').trim();
    const size = String(body.size || '').trim();
    const itemCode = String(body.itemCode || '').trim();
    const lang: Language = body.lang === 'en' ? 'en' : 'fa';
    if (!description) {
      throw new StaticEngineError(errMsg('شرح کالا برای دسته‌بندی الزامی است', 'Item description is required for classification'), 400);
    }
    const classification = classifyItemLocally(description, size, itemCode, lang);
    return { classification } as T;
  }

  // ---------------- AUDIT & BACKUP ----------------
  if (pathname === '/api/audit' && method === 'GET') {
    requireAuth();
    const q = query.get('q') || '';
    const scope = query.get('scope') || '';
    const username = query.get('username') || '';
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(200, Math.max(20, Number(query.get('pageSize') || 50)));

    const filtered = db.auditLogs.filter((log) => {
      if (scope && log.scope !== scope) return false;
      if (username && log.username !== username) return false;
      if (!inDateRange(log.timestamp.slice(0, 10), fromDate, toDate)) return false;
      return matchSearch([log.username, log.userFullName, log.action, log.scope, log.targetId, log.summary], q);
    });
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    } as T;
  }

  if (pathname === '/api/backup/snapshot' && method === 'GET') {
    requireAuth();
    return {
      version: db.version,
      exportedAt: new Date().toISOString(),
      general: db.general,
      detailed: db.detailed,
      transit: db.transit,
      packingMeta: db.packingMeta,
      categories: db.categories,
      auditLogs: db.auditLogs,
      trash: db.trash,
      opiInvitations: db.opiInvitations,
      siteEntryMinutes: db.siteEntryMinutes,
      opiMinutes: db.opiMinutes,
      osdrReports: db.osdrReports,
      substitutions: db.substitutions,
      gcvDocuments: db.gcvDocuments,
      mivDocuments: db.mivDocuments,
      materialEstimates: db.materialEstimates,
      periodicInspections: db.periodicInspections,
      customFormSubmissions: db.customFormSubmissions,
    } as DatabaseSnapshot as T;
  }

  if (pathname === '/api/backup/restore' && method === 'POST') {
    const u = requireAuth(['admin']);
    const snap = body as unknown as DatabaseSnapshot;
    const nextCats: CategoryStore = {
      ...createEmptyCategories(),
      ...(snap.categories || {}),
      transitStatus: getTransitStatusOptions(snap.categories?.transitStatus),
    };
    db.general = Array.isArray(snap.general) ? snap.general : [];
    db.detailed = (Array.isArray(snap.detailed) ? snap.detailed : []).map((d) => ({
      ...d,
      countingUnit: normalizeCountingUnitToFa(d.countingUnit),
    }));
    db.transit = (Array.isArray(snap.transit) ? snap.transit : []).map((t) => ({
      ...t,
      overallStatus: normalizeTransitStatus(t.overallStatus, nextCats.transitStatus),
    }));
    db.packingMeta = snap.packingMeta || {};
    db.categories = nextCats;
    if (Array.isArray(snap.auditLogs)) db.auditLogs = snap.auditLogs;
    db.trash = Array.isArray(snap.trash) ? snap.trash : [];
    db.opiInvitations = Array.isArray(snap.opiInvitations) ? snap.opiInvitations : [];
    db.siteEntryMinutes = Array.isArray(snap.siteEntryMinutes) ? snap.siteEntryMinutes : [];
    db.opiMinutes = Array.isArray(snap.opiMinutes) ? snap.opiMinutes : [];
    db.osdrReports = Array.isArray(snap.osdrReports) ? snap.osdrReports : [];
    db.substitutions = Array.isArray(snap.substitutions) ? snap.substitutions : [];
    db.gcvDocuments = Array.isArray(snap.gcvDocuments) ? snap.gcvDocuments : [];
    db.mivDocuments = Array.isArray(snap.mivDocuments) ? snap.mivDocuments : [];
    db.materialEstimates = (Array.isArray(snap.materialEstimates) ? snap.materialEstimates : []).map((m) => ({
      ...m,
      countingUnit: normalizeCountingUnitToFa(m.countingUnit),
    }));
    db.periodicInspections = Array.isArray(snap.periodicInspections) ? snap.periodicInspections : [];
    db.customFormSubmissions = Array.isArray(snap.customFormSubmissions) ? snap.customFormSubmissions : [];
    renumberScope(db, 'general');
    renumberScope(db, 'detailed');
    renumberScope(db, 'transit');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'RESTORE_SNAPSHOT', 'backup', 'database', `بازیابی نسخه پشتیبان در مرورگر`);
    await saveActiveDb();
    return {
      ok: true,
      counts: { general: db.general.length, detailed: db.detailed.length, transit: db.transit.length },
    } as T;
  }

  if (pathname === '/api/database/sections-summary' && method === 'GET') {
    requireAuth(['admin']);
    const categoriesCount = Object.values(db.categories).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
    const items: DatabaseSectionSummaryItem[] = [
      { key: 'general', count: db.general.length },
      { key: 'detailed', count: db.detailed.length },
      { key: 'transit', count: db.transit.length },
      { key: 'siteEntryMinutes', count: db.siteEntryMinutes.length },
      { key: 'opiInvitations', count: db.opiInvitations.length },
      { key: 'opiMinutes', count: db.opiMinutes.length },
      { key: 'osdrReports', count: db.osdrReports.length },
      { key: 'gcvDocuments', count: db.gcvDocuments.length },
      { key: 'mivDocuments', count: db.mivDocuments.length },
      { key: 'substitutions', count: db.substitutions.length },
      { key: 'materialEstimates', count: db.materialEstimates.length },
      { key: 'periodicInspections', count: db.periodicInspections.length },
      { key: 'customFormSubmissions', count: db.customFormSubmissions.length },
      { key: 'categories', count: categoriesCount },
      { key: 'trash', count: db.trash.length },
      { key: 'auditLogs', count: db.auditLogs.length },
    ];
    return { items } as T;
  }

  if (pathname === '/api/database/purge' && method === 'POST') {
    const u = requireAuth(['admin']);
    const rawSections = Array.isArray(body.sections) ? (body.sections as PurgeableSectionKey[]) : [];
    const wipeAll = Boolean(body.wipeAll);
    const confirmationText = String(body.confirmationText || '');

    const allKeys: PurgeableSectionKey[] = [
      'general',
      'detailed',
      'transit',
      'siteEntryMinutes',
      'opiInvitations',
      'opiMinutes',
      'osdrReports',
      'gcvDocuments',
      'mivDocuments',
      'substitutions',
      'materialEstimates',
      'periodicInspections',
      'customFormSubmissions',
      'categories',
      'trash',
      'auditLogs',
    ];
    const validKeySet = new Set<string>(allKeys);
    const selected: PurgeableSectionKey[] = wipeAll
      ? [...allKeys]
      : Array.from(new Set(rawSections.filter((k): k is PurgeableSectionKey => validKeySet.has(k))));

    if (selected.length === 0) {
      throw new StaticEngineError(errMsg('حداقل یک بخش برای حذف انتخاب کنید.', 'Select at least one section to purge.'), 400);
    }

    const normConfirm = confirmationText
      .replace(/\u200c/g, ' ')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim();
    const upperConfirm = normConfirm.toUpperCase();
    const isFullWipe = wipeAll || selected.length === allKeys.length;
    const validConfirm = isFullWipe
      ? normConfirm === 'حذف کل پایگاه داده' || normConfirm === 'حذف کل دیتابیس' || upperConfirm === 'DELETE ALL'
      : normConfirm === 'حذف اطلاعات' ||
        upperConfirm === 'DELETE' ||
        normConfirm === 'حذف کل پایگاه داده' ||
        normConfirm === 'حذف کل دیتابیس' ||
        upperConfirm === 'DELETE ALL';

    if (!validConfirm) {
      throw new StaticEngineError(
        errMsg(
          isFullWipe
            ? 'عبارت امنیتی اشتباه است. برای حذف کل پایگاه داده باید «حذف کل پایگاه داده» یا «DELETE ALL» را تایپ کنید.'
            : 'عبارت امنیتی اشتباه است. برای تایید حذف باید «حذف اطلاعات» یا «DELETE» را تایپ کنید.',
          isFullWipe
            ? 'Invalid confirmation phrase. Type "DELETE ALL" to wipe all sections.'
            : 'Invalid confirmation phrase. Type "DELETE" to confirm section purge.',
        ),
        400,
      );
    }

    const deletedCounts: Partial<Record<PurgeableSectionKey, number>> = {};
    let totalDeleted = 0;

    for (const sec of selected) {
      switch (sec) {
        case 'general':
          deletedCounts.general = db.general.length;
          totalDeleted += db.general.length;
          db.general = [];
          db.packingMeta = {};
          break;
        case 'detailed':
          deletedCounts.detailed = db.detailed.length;
          totalDeleted += db.detailed.length;
          db.detailed = [];
          break;
        case 'transit':
          deletedCounts.transit = db.transit.length;
          totalDeleted += db.transit.length;
          db.transit = [];
          break;
        case 'siteEntryMinutes':
          deletedCounts.siteEntryMinutes = db.siteEntryMinutes.length;
          totalDeleted += db.siteEntryMinutes.length;
          db.siteEntryMinutes = [];
          break;
        case 'opiInvitations':
          deletedCounts.opiInvitations = db.opiInvitations.length;
          totalDeleted += db.opiInvitations.length;
          db.opiInvitations = [];
          break;
        case 'opiMinutes':
          deletedCounts.opiMinutes = db.opiMinutes.length;
          totalDeleted += db.opiMinutes.length;
          db.opiMinutes = [];
          break;
        case 'osdrReports':
          deletedCounts.osdrReports = db.osdrReports.length;
          totalDeleted += db.osdrReports.length;
          db.osdrReports = [];
          break;
        case 'gcvDocuments':
          deletedCounts.gcvDocuments = db.gcvDocuments.length;
          totalDeleted += db.gcvDocuments.length;
          db.gcvDocuments = [];
          break;
        case 'mivDocuments':
          deletedCounts.mivDocuments = db.mivDocuments.length;
          totalDeleted += db.mivDocuments.length;
          db.mivDocuments = [];
          break;
        case 'substitutions':
          deletedCounts.substitutions = db.substitutions.length;
          totalDeleted += db.substitutions.length;
          db.substitutions = [];
          break;
        case 'materialEstimates':
          deletedCounts.materialEstimates = db.materialEstimates.length;
          totalDeleted += db.materialEstimates.length;
          db.materialEstimates = [];
          break;
        case 'periodicInspections':
          deletedCounts.periodicInspections = db.periodicInspections.length;
          totalDeleted += db.periodicInspections.length;
          db.periodicInspections = [];
          break;
        case 'customFormSubmissions':
          deletedCounts.customFormSubmissions = db.customFormSubmissions.length;
          totalDeleted += db.customFormSubmissions.length;
          db.customFormSubmissions = [];
          break;
        case 'categories': {
          const catCount = Object.values(db.categories).reduce((s, arr) => s + arr.length, 0);
          deletedCounts.categories = catCount;
          totalDeleted += catCount;
          db.categories = createEmptyCategories();
          break;
        }
        case 'trash':
          deletedCounts.trash = db.trash.length;
          totalDeleted += db.trash.length;
          db.trash = [];
          break;
        case 'auditLogs':
          deletedCounts.auditLogs = db.auditLogs.length;
          totalDeleted += db.auditLogs.length;
          db.auditLogs = [];
          break;
      }
    }

    if (!selected.includes('categories')) {
      rebuildCategories(db);
    }
    addAudit(
      db,
      sanitizeUser(u),
      isFullWipe ? 'PURGE_ALL_DATABASE' : 'PURGE_DATABASE_SECTIONS',
      'backup',
      selected.join(','),
      `پاکسازی امنیتی پایگاه داده توسط مدیر کل (${selected.length} بخش، مجموع ${totalDeleted} رکورد حذف شد): ${selected.join('، ')}`,
    );
    await saveActiveDb();

    return {
      ok: true,
      purgedSections: selected,
      deletedCounts,
      totalDeleted,
    } as T;
  }

  throw new StaticEngineError(errMsg(`مسیر پشتیبانی نمی‌شود: ${pathname}`, `Unsupported endpoint: ${pathname}`), 404);
}
