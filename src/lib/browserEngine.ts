import {
  detectCsvScope,
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
  roundQty,
  toNum,
} from '../shared/formulas.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from '../shared/generalDescription.ts';
import { getMonthKeyFromIso, normalizeDigits } from '../shared/jalali.ts';
import { sortDetailedEntries, sortGeneralEntries } from '../shared/sorting.ts';
import type {
  AuditLogEntry,
  CalendarMode,
  CategoryGroupKey,
  CategoryStore,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  DocumentLineItem,
  GcvDocumentRecord,
  GeneralEntry,
  MaterialEstimateRecord,
  MivDocType,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
  PackingStatusMeta,
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
}

const DB_NAME = 'samaan_static_db';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const RECORD_KEY = 'primary';

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
    storageLocation: [],
    carrierContractor: [],
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
  };
}

let cachedDb: StaticDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
  const total = db.transit.length;
  for (let i = 0; i < total; i += 1) {
    db.transit[i].rowNo = String(i + 1);
  }
}

async function getDb(): Promise<StaticDatabase> {
  if (cachedDb) return cachedDb;
  const idb = await openDb();
  const loaded = await new Promise<Partial<StaticDatabase> | null>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => resolve((req.result as Partial<StaticDatabase>) || null);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  const empty = createEmptyDb();
  cachedDb = loaded
    ? {
        ...empty,
        ...loaded,
        categories: { ...createEmptyCategories(), ...(loaded.categories || {}) },
        trash: Array.isArray(loaded.trash) ? loaded.trash : [],
        opiInvitations: Array.isArray(loaded.opiInvitations) ? loaded.opiInvitations : [],
        siteEntryMinutes: Array.isArray(loaded.siteEntryMinutes) ? loaded.siteEntryMinutes : [],
        opiMinutes: Array.isArray(loaded.opiMinutes) ? loaded.opiMinutes : [],
        osdrReports: Array.isArray(loaded.osdrReports) ? loaded.osdrReports : [],
        substitutions: Array.isArray(loaded.substitutions) ? loaded.substitutions : [],
        gcvDocuments: Array.isArray(loaded.gcvDocuments) ? loaded.gcvDocuments : [],
        mivDocuments: Array.isArray(loaded.mivDocuments) ? loaded.mivDocuments : [],
        materialEstimates: Array.isArray(loaded.materialEstimates) ? loaded.materialEstimates : [],
      }
    : empty;
  renumberScope(cachedDb, 'general');
  renumberScope(cachedDb, 'detailed');
  renumberScope(cachedDb, 'transit');
  return cachedDb;
}

async function saveDb(db: StaticDatabase): Promise<void> {
  cachedDb = db;
  const idb = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(db, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  idb.close();
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

function registerCategoryValue(db: StaticDatabase, group: CategoryGroupKey, rawVal: string | undefined | null) {
  const val = normKey(rawVal);
  if (!val || val === '-' || val === '—') return;
  const arr = db.categories[group];
  if (!arr.includes(val)) {
    arr.push(val);
    arr.sort((a, b) => a.localeCompare(b, 'fa'));
  }
}

function rebuildCategories(db: StaticDatabase) {
  for (const g of db.general) {
    registerCategoryValue(db, 'island', g.island);
    registerCategoryValue(db, 'system', g.system);
    registerCategoryValue(db, 'subSystem', g.subSystem);
    registerCategoryValue(db, 'unit', g.unit);
    registerCategoryValue(db, 'supplier', g.supplier);
    registerCategoryValue(db, 'dispatchLocation', g.dispatchLocation);
  }
  for (const d of db.detailed) {
    registerCategoryValue(db, 'island', d.island);
    registerCategoryValue(db, 'system', d.system);
    registerCategoryValue(db, 'subSystem', d.subSystem);
    registerCategoryValue(db, 'unit', d.unit);
    registerCategoryValue(db, 'supplier', d.supplier);
    registerCategoryValue(db, 'dispatchLocation', d.origin);
    registerCategoryValue(db, 'storageLocation', d.storageLocation);
  }
  for (const t of db.transit) {
    registerCategoryValue(db, 'system', t.system);
    registerCategoryValue(db, 'subSystem', t.subSystem);
    registerCategoryValue(db, 'unit', t.unit);
    registerCategoryValue(db, 'supplier', t.supplier);
    registerCategoryValue(db, 'dispatchLocation', t.dispatchLocation);
    registerCategoryValue(db, 'carrierContractor', t.carrierContractor);
  }
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
  let updated = 0;
  const now = new Date().toISOString();
  for (const t of db.transit) {
    if (normKey(t.packingListNo) === pk) {
      const st = normKey(t.overallStatus);
      if (st !== 'رسیده' && st.toLowerCase() !== 'arrived') {
        t.overallStatus = 'رسیده';
        t.linkedGeneralPackingNo = pk;
        t.updatedAt = now;
        updated += 1;
      }
    }
  }
  if (updated > 0) {
    addAudit(
      db,
      user,
      'AUTO_TRANSIT_ARRIVED',
      'transit',
      pk,
      `تغییر خودکار وضعیت کلی ${updated} ردیف در راه برای پکینگ لیست ${pk} به «رسیده»`,
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

function isMapnaMinutesTaken(db: StaticDatabase, minutesNo: string, excludeId?: string): boolean {
  const clean = normalizeDigits(normKey(minutesNo)).toLowerCase();
  if (!clean) return false;
  return db.general.some(
    (g) => g.id !== excludeId && normalizeDigits(normKey(g.mapnaEntryMinutesNo)).toLowerCase() === clean,
  );
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
  if (!latest) return { shipmentNo: '', packageNo: '', countingUnit: 'PC' };
  return {
    shipmentNo: normKey(latest.shipmentNo),
    packageNo: normKey(latest.packageNo),
    countingUnit: normKey(latest.countingUnit) || 'PC',
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
  if (!fromDate && !toDate) return true;
  if (!isoDate) return false;
  if (fromDate && isoDate < fromDate) return false;
  if (toDate && isoDate > toDate) return false;
  return true;
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

export async function handleStaticApiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const db = await getDb();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.searchParams;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {};
  const headers = (options.headers as Record<string, string>) || {};
  const langHeader = String(headers['X-Samaan-Lang'] || headers['x-samaan-lang'] || '').toLowerCase();

  const currentUserObj = db.currentUserId
    ? db.users.find((u) => u.id === db.currentUserId && u.active) || null
    : null;

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
    await saveDb(db);
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
    await saveDb(db);
    return { user: sanitizeUser(found) } as T;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    if (currentUserObj) {
      addAudit(db, sanitizeUser(currentUserObj), 'LOGOUT', 'auth', currentUserObj.id, `خروج کاربر ${currentUserObj.fullName} (${currentUserObj.username})`);
    }
    db.currentUserId = null;
    await saveDb(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/auth/preferences' && method === 'PATCH') {
    const u = requireAuth();
    u.preferences = { ...u.preferences, ...(body as Partial<UserPreferences>) };
    await saveDb(db);
    return { user: sanitizeUser(u) } as T;
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
    await saveDb(db);
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
    await saveDb(db);
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
    await saveDb(db);
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
    await saveDb(db);
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
    await saveDb(db);
    return { meta: db.packingMeta[packingNo] } as T;
  }

  if (pathname.startsWith('/api/packing/') && pathname.endsWith('/reopen') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const packingNo = decodeURIComponent(pathname.slice('/api/packing/'.length, -'/reopen'.length));
    db.packingMeta[packingNo] = { packingNo, isClosed: false };
    addAudit(db, sanitizeUser(u), 'REOPEN_PACKING', 'packing', packingNo, `بازگشایی وضعیت پکینگ لیست ${packingNo}`);
    await saveDb(db);
    return { meta: db.packingMeta[packingNo] } as T;
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
    const packingListNo = normKey(query.get('packingListNo'));
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(200, Math.max(10, Number(query.get('pageSize') || 50)));

    const filtered = db.general.filter((g) => {
      if (island && g.island !== island) return false;
      if (system && g.system !== system) return false;
      if (subSystem && g.subSystem !== subSystem) return false;
      if (unit && g.unit !== unit) return false;
      if (supplier && g.supplier !== supplier) return false;
      if (packingListNo && normKey(g.packingListNo) !== packingListNo) return false;
      if (!inDateRange(g.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          g.rowNo, g.packingListNo, g.packageNo, g.itemDescription, g.supplier,
          g.dispatchLocation, g.employerEntryMinutesNo, g.mapnaEntryMinutesNo,
          g.releaseNo, g.billOfLadingNo, g.vehicleNo, g.driverName,
          g.opiInvitationNo, g.island, g.system, g.subSystem, g.unit,
        ],
        q,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((g) => {
      const pk = normKey(g.packingListNo);
      const pkg = normKey(g.packageNo);
      const linkedDetails = pk ? db.detailed.filter((d) => normKey(d.shipmentNo) === pk) : [];
      const matchingPkgDetails = linkedDetails.filter((d) => !pkg || normKey(d.packageNo) === pkg);
      const hasLinkedShortage = matchingPkgDetails.some((d) => computeDetailedEntry(d).hasShortage);
      return {
        ...g,
        packingClosed: Boolean(pk && db.packingMeta[pk]?.isClosed),
        detailedCount: matchingPkgDetails.length,
        hasLinkedShortage,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary: computeSelectionFormulaSummary({ general: filtered }),
      packingMeta: db.packingMeta,
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
      if (cleanMapnaMinutes) {
        const lowerKey = cleanMapnaMinutes.toLowerCase();
        if (isMapnaMinutesTaken(db, cleanMapnaMinutes) || batchMapnaMinutes.has(lowerKey)) {
          throw new StaticEngineError(
            errMsg(
              `شماره صورتجلسه ورود مپنا «${cleanMapnaMinutes}» تکراری است.`,
              `MAPNA Entry Minutes No. "${cleanMapnaMinutes}" already exists.`,
            ),
            409,
            'DUPLICATE_MAPNA_MINUTES',
          );
        }
        batchMapnaMinutes.add(lowerKey);
      }

      const cleanArrival = normKey(raw.arrivalDate);
      const cleanReleaseNo = normKey(raw.releaseNo);
      const cleanReleaseDate = cleanReleaseNo ? (normKey(raw.releaseDate) || cleanArrival) : cleanArrival;
      const parsedItemCount =
        raw.itemCount !== undefined && raw.itemCount !== null && Number.isFinite(Number(raw.itemCount)) && Number(raw.itemCount) > 0
          ? Math.floor(Number(raw.itemCount))
          : null;

      preparedGeneral.push({
        id: makeId(),
        rowNo: '0',
        arrivalDate: cleanArrival,
        releaseNo: cleanReleaseNo,
        releaseDate: cleanReleaseDate,
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: normKey(raw.employerEntryMinutesNo),
        mapnaEntryMinutesNo: cleanMapnaMinutes,
        packingListNo: pk,
        packageNo: pkgNo,
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
    const transitUpdated = syncTransitArrival(db, pk, sanitizeUser(u));
    addAudit(
      db,
      sanitizeUser(u),
      isContinuation ? 'CONTINUE_PACKING_GENERAL' : 'CREATE_PACKING_GENERAL',
      'general',
      pk,
      `${isContinuation ? 'ادامه ثبت روی پکینگ لیست' : 'ثبت پکینگ لیست جدید'} ${pk} (${preparedGeneral.length} ردیف)`,
    );
    await saveDb(db);
    return { createdGeneral: preparedGeneral, createdDetailedCount: 0, transitUpdated } as T;
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
      const cleanMin = normalizeDigits(normKey(patch.mapnaEntryMinutesNo));
      if (cleanMin && isMapnaMinutesTaken(db, cleanMin, item.id)) {
        throw new StaticEngineError(
          errMsg(
            `شماره صورتجلسه ورود مپنا «${cleanMin}» تکراری است.`,
            `MAPNA Entry Minutes No. "${cleanMin}" already exists.`,
          ),
          409,
          'DUPLICATE_MAPNA_MINUTES',
        );
      }
      patch.mapnaEntryMinutesNo = cleanMin;
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

    Object.assign(item, {
      ...patch,
      releaseNo: finalReleaseNo,
      releaseDate: finalReleaseDate,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    renumberScope(db, 'general');
    rebuildCategories(db);
    const transitUpdated = syncTransitArrival(db, item.packingListNo, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'UPDATE_GENERAL', 'general', `${item.packingListNo} (#${item.rowNo})`, `ویرایش ردیف جنرال ${item.rowNo}`);
    await saveDb(db);
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

    db.trash.unshift({
      id: makeId(),
      scope: 'general',
      deletedAt: now,
      deletedBy,
      targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
      data: removed,
    });

    let trashedDetailedCount = 0;
    if (cascadeDetailed) {
      const pk = normKey(removed.packingListNo);
      const pkg = normKey(removed.packageNo);
      const remaining: DetailedEntry[] = [];
      for (const d of db.detailed) {
        if (normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg)) {
          trashedDetailedCount += 1;
          db.trash.unshift({
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          });
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
    addAudit(db, sanitizeUser(u), 'DELETE_GENERAL', 'general', `${removed.packingListNo} (#${removed.rowNo})`, `انتقال ردیف جنرال ${removed.rowNo} به سطل بازیافت`);
    await saveDb(db);
    return { ok: true, trashedDetailedCount } as T;
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
    const storageLocation = query.get('storageLocation') || '';
    const shipmentNo = normKey(query.get('shipmentNo'));
    const packageNo = normKey(query.get('packageNo'));
    const shortageOnly = query.get('shortageOnly') === 'true';
    const damagedOnly = query.get('damagedOnly') === 'true';
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(200, Math.max(10, Number(query.get('pageSize') || 50)));

    const computedAll: DetailedComputed[] = [];
    for (const d of db.detailed) {
      if (island && d.island !== island) continue;
      if (system && d.system !== system) continue;
      if (subSystem && d.subSystem !== subSystem) continue;
      if (unit && d.unit !== unit) continue;
      if (supplier && d.supplier !== supplier) continue;
      if (storageLocation && d.storageLocation !== storageLocation) continue;
      if (shipmentNo && normKey(d.shipmentNo) !== shipmentNo) continue;
      if (packageNo && normKey(d.packageNo) !== packageNo) continue;
      if (!inDateRange(d.arrivalDate, fromDate, toDate)) continue;
      if (!matchSearch([
        d.rowNo, d.shipmentNo, d.packageNo, d.itemNo, d.generalDescription, d.description,
        d.itemCode, d.mtoRef, d.supplier, d.origin, d.island, d.system, d.subSystem, d.unit,
        d.opiNo, d.merNo, d.repNo, d.materialBalanceNo, d.balanceStatus, d.gcvReceiptNo,
        d.receiver, d.mivContractorNo, d.smrContractorNo, d.smrMapnaNo, d.mivMapnaNo,
        d.storageLocation, d.stocktakeStatus,
      ], q)) continue;
      const comp = computeDetailedEntry(d);
      if (shortageOnly && !comp.hasShortage) continue;
      if (damagedOnly && !comp.hasDamaged) continue;
      computedAll.push(comp);
    }

    const total = computedAll.length;
    const start = (page - 1) * pageSize;
    return {
      items: computedAll.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary: computeSelectionFormulaSummary({ detailed: computedAll }),
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
    const rawGenDesc = normKey(rawDet.generalDescription);
    const resolvedGeneralDesc = rawGenDesc
      ? formatGeneralDescriptionCase(rawGenDesc)
      : inferGeneralDescription(cleanDescription);

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
      repDescription: normKey(rawDet.repDescription),
      countingUnit: normKey(rawDet.countingUnit),
      island: normKey(rawDet.island) || shared?.island || '',
      system: normKey(rawDet.system) || shared?.system || '',
      subSystem: normKey(rawDet.subSystem) || shared?.subSystem || '',
      unit: normKey(rawDet.unit) || shared?.unit || '',
      opiNo: normKey(rawDet.opiNo),
      opiDate: normKey(rawDet.opiDate),
      merNo: normKey(rawDet.merNo),
      merStatus: normKey(rawDet.merStatus),
      notes: normKey(rawDet.notes),
      materialBalanceNo: normKey(rawDet.materialBalanceNo),
      balanceStatus: normKey(rawDet.balanceStatus),
      storageLocation: normKey(rawDet.storageLocation),
      gcvReceiptNo: normKey(rawDet.gcvReceiptNo),
      receiver: normKey(rawDet.receiver),
      gcvDeliveredQty: rawDet.gcvDeliveredQty ?? null,
      mivContractorNo: normKey(rawDet.mivContractorNo),
      mivContractorDate: normKey(rawDet.mivContractorDate),
      mivContractorQty: rawDet.mivContractorQty ?? null,
      smrContractorNo: normKey(rawDet.smrContractorNo),
      smrContractorDate: normKey(rawDet.smrContractorDate),
      smrContractorQty: rawDet.smrContractorQty ?? null,
      smrContractorNote: normKey(rawDet.smrContractorNote),
      smrMapnaNo: normKey(rawDet.smrMapnaNo),
      smrMapnaDate: normKey(rawDet.smrMapnaDate),
      smrMapnaQty: rawDet.smrMapnaQty ?? null,
      smrMapnaNote: normKey(rawDet.smrMapnaNote),
      mivMapnaNo: normKey(rawDet.mivMapnaNo),
      mivMapnaDate: normKey(rawDet.mivMapnaDate),
      mivMapnaQty: rawDet.mivMapnaQty ?? null,
      stocktakeInfo: normKey(rawDet.stocktakeInfo),
      stocktakeStatus: normKey(rawDet.stocktakeStatus),
      stocktakeDate: normKey(rawDet.stocktakeDate),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.detailed.unshift(created);
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    const transitUpdated = syncTransitArrival(db, pk, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'CREATE_DETAILED', 'detailed', `${pk} / ${pkgNo || '-'} (#${itemNo})`, `ثبت آیتم جزئیات ردیف ${created.rowNo}`);
    await saveDb(db);
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
    await saveDb(db);
    return { item: computed, transitUpdated } as T;
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

    Object.assign(item, {
      ...patch,
      shipmentNo: pk,
      packageNo: nextPkg,
      itemNo: nextItemNo,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    renumberScope(db, 'detailed');
    rebuildCategories(db);
    const transitUpdated = syncTransitArrival(db, item.shipmentNo, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'UPDATE_DETAILED', 'detailed', `${item.shipmentNo} (#${item.rowNo})`, `ویرایش آیتم جزئیات ${item.rowNo}`);
    await saveDb(db);
    return { item: computeDetailedEntry(item), transitUpdated } as T;
  }

  if (pathname.startsWith('/api/detailed/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.detailed.findIndex((d) => d.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const [removed] = db.detailed.splice(idx, 1);
    db.trash.unshift({
      id: makeId(),
      scope: 'detailed',
      deletedAt: new Date().toISOString(),
      deletedBy: u.fullName || u.username,
      targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
      data: removed,
    });
    renumberScope(db, 'detailed');
    addAudit(db, sanitizeUser(u), 'DELETE_DETAILED', 'detailed', `${removed.shipmentNo} (#${removed.rowNo})`, `انتقال ردیف جزئیات ${removed.rowNo} به سطل بازیافت`);
    await saveDb(db);
    return { ok: true } as T;
  }

  // ---------------- TRANSIT ----------------
  if (pathname === '/api/transit' && method === 'GET') {
    requireAuth();
    const q = query.get('q') || '';
    const status = query.get('status') || '';
    const supplier = query.get('supplier') || '';
    const system = query.get('system') || '';
    const fromDate = query.get('fromDate') || '';
    const toDate = query.get('toDate') || '';
    const page = Math.max(1, Number(query.get('page') || 1));
    const pageSize = Math.min(200, Math.max(10, Number(query.get('pageSize') || 50)));

    const filtered = db.transit.filter((t) => {
      if (status && t.overallStatus !== status) return false;
      if (supplier && t.supplier !== supplier) return false;
      if (system && t.system !== system) return false;
      if (!inDateRange(t.arrivalDate, fromDate, toDate)) return false;
      return matchSearch([
        t.rowNo, t.overallStatus, t.packingListNo, t.packageNo, t.itemDescription,
        t.supplier, t.dispatchLocation, t.releaseNetNo, t.interimNo, t.system,
        t.subSystem, t.unit, t.equipmentSupplyCode, t.carrierContractor, t.billOfLadingNo,
      ], q);
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary: computeSelectionFormulaSummary({ transit: filtered }),
    } as T;
  }

  if (pathname === '/api/transit' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const pk = normKey(String(body.packingListNo || ''));
    const alreadyInWarehouse =
      pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
    const now = new Date().toISOString();
    const { rowNo: _ignoredRow, ...raw } = body;
    const created: TransitEntry = {
      ...(raw as unknown as TransitEntry),
      id: makeId(),
      rowNo: '0',
      packingListNo: pk,
      overallStatus: alreadyInWarehouse ? 'رسیده' : normKey(String(body.overallStatus || '')) || 'در دست ارسال',
      linkedGeneralPackingNo: alreadyInWarehouse ? pk : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.transit.unshift(created);
    renumberScope(db, 'transit');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'CREATE_TRANSIT', 'transit', pk || created.rowNo, `ثبت محموله در راه ${pk || created.rowNo}`);
    await saveDb(db);
    return { item: created } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.transit.find((t) => t.id === id);
    if (!item) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const { rowNo: _ignoredRow, ...patch } = body;
    Object.assign(item, { ...patch, rowNo: item.rowNo, updatedAt: new Date().toISOString() });
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'UPDATE_TRANSIT', 'transit', item.packingListNo || item.rowNo, `ویرایش محموله در راه`);
    await saveDb(db);
    return { item } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.transit.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('رکورد یافت نشد', 'Record not found'), 404);
    const [removed] = db.transit.splice(idx, 1);
    db.trash.unshift({
      id: makeId(),
      scope: 'transit',
      deletedAt: new Date().toISOString(),
      deletedBy: u.fullName || u.username,
      targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
      data: removed,
    });
    renumberScope(db, 'transit');
    addAudit(db, sanitizeUser(u), 'DELETE_TRANSIT', 'transit', removed.packingListNo || removed.rowNo, `انتقال ردیف در راه به سطل بازیافت`);
    await saveDb(db);
    return { ok: true } as T;
  }

  // ---------------- RECYCLE BIN / TRASH ----------------
  if (pathname === '/api/trash' && method === 'GET') {
    requireAuth();
    const scope = query.get('scope') || '';
    const q = query.get('q') || '';
    const detailedTrash = db.trash.filter((t) => t.scope === 'detailed');
    const items = db.trash
      .filter((item) => {
        if (scope && item.scope !== scope) return false;
        return matchSearch([item.targetLabel, item.deletedBy, item.scope], q);
      })
      .map((item) => {
        if (item.scope !== 'general') return item;
        const g = item.data as GeneralEntry;
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const linkedTrashDetailedCount = pk
          ? detailedTrash.filter((dt) => {
              const d = dt.data as DetailedEntry;
              return normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            }).length
          : 0;
        return { ...item, linkedTrashDetailedCount };
      });
    return { items } as T;
  }

  if (pathname.startsWith('/api/trash/') && pathname.endsWith('/restore') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.slice('/api/trash/'.length, -'/restore'.length);
    const idx = db.trash.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('آیتم در سطل بازیافت یافت نشد', 'Trash item not found'), 404);
    const restoreDetailed = query.get('restoreDetailed') === 'true';
    const entry = db.trash[idx];
    let restoredDetailedCount = 0;

    if (entry.scope === 'general') {
      const g = entry.data as GeneralEntry;
      if (g.mapnaEntryMinutesNo && isMapnaMinutesTaken(db, g.mapnaEntryMinutesNo)) {
        throw new StaticEngineError(
          errMsg(
            `شماره صورتجلسه ورود مپنا «${g.mapnaEntryMinutesNo}» در حال حاضر در سیستم فعال است و امکان بازیابی مستقیم وجود ندارد.`,
            `MAPNA Entry Minutes No. "${g.mapnaEntryMinutesNo}" is already active and cannot be restored directly.`,
          ),
          409,
        );
      }
      db.trash.splice(idx, 1);
      db.general.unshift({ ...g, updatedAt: new Date().toISOString() });
      renumberScope(db, 'general');

      if (restoreDetailed) {
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const remainingTrash: TrashRecord[] = [];
        for (const tr of db.trash) {
          if (tr.scope === 'detailed') {
            const d = tr.data as DetailedEntry;
            const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            if (matches && !(d.itemNo && isDetailedItemNoTaken(db, d.shipmentNo, d.packageNo, d.itemNo))) {
              db.detailed.unshift({ ...d, updatedAt: new Date().toISOString() });
              restoredDetailedCount += 1;
              continue;
            }
          }
          remainingTrash.push(tr);
        }
        db.trash = remainingTrash;
        if (restoredDetailedCount > 0) {
          renumberScope(db, 'detailed');
        }
      }
    } else if (entry.scope === 'detailed') {
      const d = entry.data as DetailedEntry;
      if (d.itemNo && isDetailedItemNoTaken(db, d.shipmentNo, d.packageNo, d.itemNo)) {
        throw new StaticEngineError(
          errMsg(
            `شماره آیتم ${d.itemNo} در محموله ${d.shipmentNo} / نگله ${d.packageNo || '-'} قبلاً وجود دارد.`,
            `Item No. ${d.itemNo} already exists under Shipment ${d.shipmentNo} / Package ${d.packageNo || '-'}.`,
          ),
          409,
        );
      }
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
    await saveDb(db);
    return { ok: true, restoredDetailedCount } as T;
  }

  if (pathname.startsWith('/api/trash/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.trash.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError(errMsg('آیتم در سطل بازیافت یافت نشد', 'Trash item not found'), 404);
    const [purged] = db.trash.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'PURGE_TRASH', 'trash', purged.targetLabel, `حذف دائمی ${purged.targetLabel}`);
    await saveDb(db);
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
      generalEntries: db.general,
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    } as T;
  }

  if (pathname === '/api/site-entry' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo);
    const cleanDate = normKey(raw.date);
    const cleanPackings = Array.from(new Set((raw.packingListNos || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg(
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
        400,
      );
    }
    const record: SiteEntryMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      date: cleanDate,
      packingListNos: cleanPackings,
      supplier: normKey(raw.supplier),
      driverName: normKey(raw.driverName),
      vehicleNo: normKey(raw.vehicleNo),
      waybillNo: normKey(raw.waybillNo),
      warehouseKeeper: normKey(raw.warehouseKeeper),
      employerRep: normKey(raw.employerRep),
      mapnaRep: normKey(raw.mapnaRep),
      conditionStatus: raw.conditionStatus || 'healthy',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.siteEntryMinutes.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_SITE_ENTRY_MINUTES', 'siteEntry', cleanNo, `ثبت صورتجلسه ورود کالا به کارگاه شماره ${cleanNo}`);
    await saveDb(db);
    return { record } as T;
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
      detailedItems: db.detailed.map(computeDetailedEntry),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    } as T;
  }

  if (pathname === '/api/opi' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const cleanNo = normKey(String(body.invitationNo || ''));
    const cleanDate = normKey(String(body.date || ''));
    const cleanPackings = Array.from(new Set(((body.packingNos as string[]) || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      throw new StaticEngineError(
        errMsg('شماره دعوتنامه، تاریخ و حداقل یک پکینگ لیست الزامی است', 'Invitation No., date, and at least one Packing List are required'),
        400,
      );
    }
    const record: OpiInvitationRecord = {
      id: makeId(),
      invitationNo: cleanNo,
      date: cleanDate,
      time: normKey(String(body.time || '')) || '09:00',
      packingNos: cleanPackings,
      location: normKey(String(body.location || '')),
      notes: normKey(String(body.notes || '')),
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
    await saveDb(db);
    return { invitation: record } as T;
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
    await saveDb(db);
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
      detailedItems: db.detailed.map(computeDetailedEntry),
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
    const record: OpiMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      invitationNo: normKey(raw.invitationNo),
      date: cleanDate,
      packingListNo: cleanPacking,
      packageNos: Array.from(new Set((raw.packageNos || []).map(normKey).filter(Boolean))),
      location: normKey(raw.location),
      mapnaInspector: normKey(raw.mapnaInspector),
      employerInspector: normKey(raw.employerInspector),
      contractorInspector: normKey(raw.contractorInspector),
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
    await saveDb(db);
    return { record } as T;
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
    addAudit(db, sanitizeUser(u), 'CREATE_OSDR_REPORT', 'osdr', cleanNo, `ثبت گزارش مغایرت، کسری و آسیب‌دیدگی شماره ${cleanNo}`);
    await saveDb(db);
    return { report: record } as T;
  }

  // ---------------- GCV ----------------
  if (pathname === '/api/gcv' && method === 'GET') {
    requireAuth();
    return {
      documents: db.gcvDocuments,
      detailedItems: db.detailed.map(computeDetailedEntry),
    } as T;
  }

  if (pathname === '/api/gcv' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const cleanNo = normKey(String(body.receiptNo || ''));
    const cleanReceiver = normKey(String(body.receiver || ''));
    const items = (body.items as Array<{ detailedId: string; qty: number }>) || [];
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
            `مقدار تحویلی (${qty}) بیشتر از موجودی مپنا (${comp.mapnaInventory}) است.`,
            `Delivered qty (${qty}) exceeds MAPNA stock (${comp.mapnaInventory}).`,
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
      date: normKey(String(body.date || '')),
      receiver: cleanReceiver,
      notes: normKey(String(body.notes || '')),
      items: lineItems,
      createdAt: now,
      createdBy: u.fullName || u.username,
    };
    db.gcvDocuments.unshift(doc);
    addAudit(db, sanitizeUser(u), 'CREATE_GCV_RECEIPT', 'gcv', cleanNo, `ثبت رسید مصرف مستقیم کالا شماره ${cleanNo}`);
    await saveDb(db);
    return { document: doc } as T;
  }

  // ---------------- MIV & SMR ----------------
  if (pathname === '/api/miv' && method === 'GET') {
    requireAuth();
    return {
      documents: db.mivDocuments,
      detailedItems: db.detailed.map(computeDetailedEntry),
    } as T;
  }

  if (pathname === '/api/miv' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const docType = body.docType as MivDocType;
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!validTypes.includes(docType)) {
      throw new StaticEngineError(errMsg('نوع فرم معتبر نیست', 'Invalid document type'), 400);
    }
    const cleanNo = normKey(String(body.docNo || ''));
    const cleanDate = normKey(String(body.date || ''));
    const items = (body.items as Array<{ detailedId: string; qty: number }>) || [];
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
            `تعداد (${qty}) از موجودی مپنا (${comp.mapnaInventory}) بیشتر است.`,
            `Qty (${qty}) exceeds MAPNA stock (${comp.mapnaInventory}).`,
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
      });
    }

    const now = new Date().toISOString();
    const cleanNotes = normKey(String(body.notes || ''));
    for (const line of lineItems) {
      const d = db.detailed.find((x) => x.id === line.detailedId)!;
      if (docType === 'miv_contractor') {
        d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
        d.mivContractorDate = cleanDate || d.mivContractorDate;
        d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + line.qty);
      } else if (docType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
      } else if (docType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
      } else if (docType === 'miv_mapna') {
        d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
        d.mivMapnaDate = cleanDate || d.mivMapnaDate;
        d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + line.qty);
      }
      d.updatedAt = now;
    }

    const doc: MivDocumentRecord = {
      id: makeId(),
      docType,
      docNo: cleanNo,
      date: cleanDate,
      party: normKey(String(body.party || '')),
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
    await saveDb(db);
    return { document: doc } as T;
  }

  // ---------------- SUBSTITUTION ----------------
  if (pathname === '/api/substitutions' && method === 'GET') {
    requireAuth();
    return {
      records: db.substitutions,
      detailedItems: db.detailed.map(computeDetailedEntry),
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
      originalDescription: d.description || d.generalDescription,
      originalItemCode: d.itemCode,
      substituteDescription: cleanSubDesc,
      substituteItemCode: normKey(raw.substituteItemCode),
      substituteSize: normKey(raw.substituteSize),
      qty: numQty,
      countingUnit: d.countingUnit || 'PC',
      reason: cleanReason,
      approvedBy: normKey(raw.approvedBy),
      status: raw.status || 'pending',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: u.fullName || u.username,
    };
    db.substitutions.unshift(record);
    addAudit(db, sanitizeUser(u), 'CREATE_SUBSTITUTION', 'substitution', cleanNo, `ثبت فرم جایگزینی شماره ${cleanNo}`);
    await saveDb(db);
    return { record } as T;
  }

  if (pathname.startsWith('/api/substitutions/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.substitutions.find((s) => s.id === id);
    if (!rec) throw new StaticEngineError(errMsg('سند جایگزینی یافت نشد', 'Substitution record not found'), 404);
    if (body.status) rec.status = body.status as SubstitutionRecord['status'];
    if (body.approvedBy !== undefined) rec.approvedBy = normKey(String(body.approvedBy));
    if (body.notes !== undefined) rec.notes = normKey(String(body.notes));
    addAudit(db, sanitizeUser(u), 'UPDATE_SUBSTITUTION', 'substitution', rec.docNo, `تغییر وضعیت جایگزینی شماره ${rec.docNo}`);
    await saveDb(db);
    return { record: rec } as T;
  }

  // ---------------- MATERIAL ESTIMATION (MTO) ----------------
  if (pathname === '/api/estimations' && method === 'GET') {
    requireAuth();
    return {
      records: db.materialEstimates,
      detailedItems: db.detailed.map(computeDetailedEntry),
    } as T;
  }

  if (pathname === '/api/estimations' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const raw = body as Partial<MaterialEstimateRecord>;
    const cleanDesc = normKey(raw.description);
    const estQty = toNum(raw.estimatedQty) ?? 0;
    if (!cleanDesc) {
      throw new StaticEngineError(errMsg('شرح متریال برآورد الزامی است', 'Estimated material description is required'), 400);
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
      countingUnit: normKey(raw.countingUnit) || 'PC',
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
      `ثبت ردیف برآورد متریال: ${record.description}`,
    );
    await saveDb(db);
    return { record } as T;
  }

  if (pathname.startsWith('/api/estimations/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const rec = db.materialEstimates.find((e) => e.id === id);
    if (!rec) {
      throw new StaticEngineError(errMsg('ردیف برآورد متریال یافت نشد', 'Material estimation record not found'), 404);
    }
    const raw = body as Partial<MaterialEstimateRecord>;
    if (raw.description !== undefined) {
      const cleanDesc = normKey(raw.description);
      if (!cleanDesc) {
        throw new StaticEngineError(errMsg('شرح متریال برآورد الزامی است', 'Estimated material description is required'), 400);
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
    if (raw.countingUnit !== undefined) rec.countingUnit = normKey(raw.countingUnit) || 'PC';
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
      `ویرایش ردیف برآورد متریال: ${rec.description}`,
    );
    await saveDb(db);
    return { record: rec } as T;
  }

  if (pathname.startsWith('/api/estimations/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.materialEstimates.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new StaticEngineError(errMsg('ردیف برآورد متریال یافت نشد', 'Material estimation record not found'), 404);
    }
    const [removed] = db.materialEstimates.splice(idx, 1);
    addAudit(
      db,
      sanitizeUser(u),
      'DELETE_ESTIMATION',
      'estimation',
      removed.mtoCode || removed.itemCode || removed.description.slice(0, 32),
      `حذف ردیف برآورد متریال: ${removed.description}`,
    );
    await saveDb(db);
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
    await saveDb(db);
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
      throw new StaticEngineError(errMsg('انتخاب اقلام و وضعیت انبارگردانی الزامی است', 'Items and stocktake status are required'), 400);
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
    addAudit(db, sanitizeUser(u), 'ASSIGN_STOCKTAKE', 'stocktake', cleanStatus, `ثبت وضعیت انبارگردانی «${cleanStatus}» برای ${updatedCount} ردیف`);
    await saveDb(db);
    return { ok: true, updatedCount } as T;
  }

  // ---------------- SEARCH ----------------
  if (pathname === '/api/search' && method === 'GET') {
    requireAuth();
    const q = (query.get('q') || '').trim();
    const limit = Math.min(100, Number(query.get('limit') || 40));
    if (!q) return { general: [], detailed: [], transit: [] } as T;

    const general = db.general.filter((g) => matchSearch([
      g.rowNo, g.packingListNo, g.packageNo, g.itemDescription, g.supplier, g.dispatchLocation,
      g.employerEntryMinutesNo, g.mapnaEntryMinutesNo, g.billOfLadingNo, g.driverName, g.island, g.system,
    ], q)).slice(0, limit);

    const detailed = db.detailed.filter((d) => matchSearch([
      d.rowNo, d.shipmentNo, d.packageNo, d.itemNo, d.generalDescription, d.description, d.itemCode, d.mtoRef,
      d.supplier, d.gcvReceiptNo, d.mivContractorNo, d.smrContractorNo, d.materialBalanceNo, d.balanceStatus, d.storageLocation, d.stocktakeStatus,
    ], q)).slice(0, limit).map(computeDetailedEntry);

    const transit = db.transit.filter((t) => matchSearch([
      t.rowNo, t.packingListNo, t.packageNo, t.itemDescription, t.supplier, t.overallStatus,
      t.releaseNetNo, t.interimNo, t.billOfLadingNo, t.carrierContractor,
    ], q)).slice(0, limit);

    return { general, detailed, transit } as T;
  }

  // ---------------- CATEGORIES ----------------
  if (pathname === '/api/categories' && method === 'GET') {
    requireAuth();
    const counts: Record<CategoryGroupKey, Record<string, number>> = {
      island: {}, system: {}, subSystem: {}, unit: {}, supplier: {},
      dispatchLocation: {}, storageLocation: {}, carrierContractor: {},
    };
    const bump = (group: CategoryGroupKey, v: string) => {
      const k = normKey(v);
      if (k) counts[group][k] = (counts[group][k] || 0) + 1;
    };
    for (const g of db.general) {
      bump('island', g.island); bump('system', g.system); bump('subSystem', g.subSystem);
      bump('unit', g.unit); bump('supplier', g.supplier); bump('dispatchLocation', g.dispatchLocation);
    }
    for (const d of db.detailed) {
      bump('island', d.island); bump('system', d.system); bump('subSystem', d.subSystem);
      bump('unit', d.unit); bump('supplier', d.supplier); bump('dispatchLocation', d.origin);
      bump('storageLocation', d.storageLocation);
    }
    for (const t of db.transit) {
      bump('system', t.system); bump('subSystem', t.subSystem); bump('unit', t.unit);
      bump('supplier', t.supplier); bump('dispatchLocation', t.dispatchLocation);
      bump('carrierContractor', t.carrierContractor);
    }
    return { categories: db.categories, counts } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const val = normKey(String(body.value || ''));
    if (!db.categories[group] || !val) throw new StaticEngineError(errMsg('گروه یا مقدار نامعتبر است', 'Invalid category group or value'), 400);
    registerCategoryValue(db, group, val);
    addAudit(db, sanitizeUser(u), 'ADD_CATEGORY', 'category', `${group}:${val}`, `افزودن دسته‌بندی «${val}»`);
    await saveDb(db);
    return { categories: db.categories } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const from = normKey(String(body.oldValue || ''));
    const to = normKey(String(body.newValue || ''));
    if (!db.categories[group] || !from || !to) throw new StaticEngineError(errMsg('مقادیر تغییر نام نامعتبر است', 'Invalid rename request'), 400);
    let updatedCount = 0;
    for (const g of db.general) {
      if (group === 'island' && g.island === from) { g.island = to; updatedCount += 1; }
      if (group === 'system' && g.system === from) { g.system = to; updatedCount += 1; }
      if (group === 'subSystem' && g.subSystem === from) { g.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && g.unit === from) { g.unit = to; updatedCount += 1; }
      if (group === 'supplier' && g.supplier === from) { g.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && g.dispatchLocation === from) { g.dispatchLocation = to; updatedCount += 1; }
    }
    for (const d of db.detailed) {
      if (group === 'island' && d.island === from) { d.island = to; updatedCount += 1; }
      if (group === 'system' && d.system === from) { d.system = to; updatedCount += 1; }
      if (group === 'subSystem' && d.subSystem === from) { d.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && d.unit === from) { d.unit = to; updatedCount += 1; }
      if (group === 'supplier' && d.supplier === from) { d.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && d.origin === from) { d.origin = to; updatedCount += 1; }
      if (group === 'storageLocation' && d.storageLocation === from) { d.storageLocation = to; updatedCount += 1; }
    }
    for (const t of db.transit) {
      if (group === 'system' && t.system === from) { t.system = to; updatedCount += 1; }
      if (group === 'subSystem' && t.subSystem === from) { t.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && t.unit === from) { t.unit = to; updatedCount += 1; }
      if (group === 'supplier' && t.supplier === from) { t.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && t.dispatchLocation === from) { t.dispatchLocation = to; updatedCount += 1; }
      if (group === 'carrierContractor' && t.carrierContractor === from) { t.carrierContractor = to; updatedCount += 1; }
    }
    db.categories[group] = db.categories[group].filter((v) => v !== from);
    registerCategoryValue(db, group, to);
    addAudit(db, sanitizeUser(u), 'RENAME_MERGE_CATEGORY', 'category', `${group}:${from}->${to}`, `تغییر نام/ادغام «${from}» به «${to}»`);
    await saveDb(db);
    return { categories: db.categories, updatedCount } as T;
  }

  if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
    const u = requireAuth(['admin']);
    const group = pathname.split('/').pop() as CategoryGroupKey;
    const val = normKey(query.get('value'));
    db.categories[group] = db.categories[group].filter((v) => v !== val);
    addAudit(db, sanitizeUser(u), 'DELETE_CATEGORY', 'category', `${group}:${val}`, `حذف «${val}»`);
    await saveDb(db);
    return { categories: db.categories } as T;
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

    const byIslandMap: Record<string, { name: string; generalCount: number; detailedCount: number; shortageQty: number; mapnaStock: number; contractorStock: number }> = {};
    for (const g of db.general) {
      const isl = normKey(g.island) || 'سایر';
      if (!byIslandMap[isl]) byIslandMap[isl] = { name: isl, generalCount: 0, detailedCount: 0, shortageQty: 0, mapnaStock: 0, contractorStock: 0 };
      byIslandMap[isl].generalCount += 1;
    }
    for (const d of detailedComputed) {
      const isl = normKey(d.island) || 'سایر';
      if (!byIslandMap[isl]) byIslandMap[isl] = { name: isl, generalCount: 0, detailedCount: 0, shortageQty: 0, mapnaStock: 0, contractorStock: 0 };
      byIslandMap[isl].detailedCount += 1;
      byIslandMap[isl].shortageQty += d.shortage;
      byIslandMap[isl].mapnaStock += d.mapnaInventory;
      byIslandMap[isl].contractorStock += d.contractorInventory;
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
      },
      totals: {
        ...generalSummary,
        ...detailedSummary,
        transitAmountSum: transitSummary.transitAmountSum,
      },
      transitByStatus: Object.entries(transitByStatus).map(([status, count]) => ({ status, count })),
      byIsland: Object.values(byIslandMap).sort((a, b) => (b.generalCount + b.detailedCount) - (a.generalCount + a.detailedCount)).slice(0, 8),
      monthlyTrend: Object.values(monthBuckets).sort((a, b) => a.monthKey.localeCompare(b.monthKey)).slice(-12),
      topShortages: shortageItems.slice(0, 8),
      topDamaged: damagedItems.slice(0, 8),
    } as T;
  }

  // ---------------- IMPORT ----------------
  if (pathname === '/api/import/preview' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const csvText = String(body.csvText || '');
    const matrix = parseCsvMatrix(csvText);
    const detectedScope = (body.scope as ImportScope | undefined) || detectCsvScope(matrix) || 'general';
    const cal = (body.assumedCalendar as CalendarMode) || 'jalali';

    if (detectedScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, u.username);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && isRowNoTaken(db, 'general', r.rowNo)).length;
      return { scope: 'general', totalRows: parsed.rows.length, skippedEmpty: parsed.skippedEmpty, duplicateRowNos, sample: parsed.rows.slice(0, 5) } as T;
    }
    if (detectedScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, u.username);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && isRowNoTaken(db, 'detailed', r.rowNo)).length;
      return { scope: 'detailed', totalRows: parsed.rows.length, skippedEmpty: parsed.skippedEmpty, duplicateRowNos, sample: parsed.rows.slice(0, 5) } as T;
    }
    const parsed = parseTransitCsv(matrix, cal, u.username);
    return { scope: 'transit', totalRows: parsed.rows.length, skippedEmpty: parsed.skippedEmpty, duplicateRowNos: 0, sample: parsed.rows.slice(0, 5) } as T;
  }

  if (pathname === '/api/import/commit' && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const csvText = String(body.csvText || '');
    const matrix = parseCsvMatrix(csvText);
    const targetScope = (body.scope as ImportScope | undefined) || detectCsvScope(matrix) || 'general';
    const cal = (body.assumedCalendar as CalendarMode) || 'jalali';

    let imported = 0;
    const skipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();

    if (targetScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, u.username);
      for (const r of parsed.rows) {
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        db.general.push({ ...r, id: makeId() });
        imported += 1;
      }
      renumberScope(db, 'general');
    } else if (targetScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, u.username);
      for (const r of parsed.rows) {
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        db.detailed.push({
          ...r,
          id: makeId(),
          generalDescription: r.generalDescription
            ? formatGeneralDescriptionCase(r.generalDescription)
            : inferGeneralDescription(r.description),
        });
        imported += 1;
      }
      renumberScope(db, 'detailed');
    } else {
      const parsed = parseTransitCsv(matrix, cal, u.username);
      for (const r of parsed.rows) {
        const pk = normKey(r.packingListNo);
        const arrived = pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
        db.transit.push({
          ...r,
          id: makeId(),
          overallStatus: arrived ? 'رسیده' : r.overallStatus,
          linkedGeneralPackingNo: arrived ? pk : undefined,
        });
        imported += 1;
      }
      renumberScope(db, 'transit');
    }

    rebuildCategories(db);
    for (const pk of touchedPackings) {
      transitAutoArrived += syncTransitArrival(db, pk, sanitizeUser(u));
    }
    addAudit(db, sanitizeUser(u), 'IMPORT_CSV', 'import', targetScope, `ورود فایل CSV (${targetScope}): ${imported} ردیف ثبت شد`);
    await saveDb(db);
    return { scope: targetScope, imported, skipped, transitAutoArrived } as T;
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
    } as DatabaseSnapshot as T;
  }

  if (pathname === '/api/backup/restore' && method === 'POST') {
    const u = requireAuth(['admin']);
    const snap = body as unknown as DatabaseSnapshot;
    db.general = Array.isArray(snap.general) ? snap.general : [];
    db.detailed = Array.isArray(snap.detailed) ? snap.detailed : [];
    db.transit = Array.isArray(snap.transit) ? snap.transit : [];
    db.packingMeta = snap.packingMeta || {};
    db.categories = { ...createEmptyCategories(), ...(snap.categories || {}) };
    if (Array.isArray(snap.auditLogs)) db.auditLogs = snap.auditLogs;
    db.trash = Array.isArray(snap.trash) ? snap.trash : [];
    db.opiInvitations = Array.isArray(snap.opiInvitations) ? snap.opiInvitations : [];
    db.siteEntryMinutes = Array.isArray(snap.siteEntryMinutes) ? snap.siteEntryMinutes : [];
    db.opiMinutes = Array.isArray(snap.opiMinutes) ? snap.opiMinutes : [];
    db.osdrReports = Array.isArray(snap.osdrReports) ? snap.osdrReports : [];
    db.substitutions = Array.isArray(snap.substitutions) ? snap.substitutions : [];
    db.gcvDocuments = Array.isArray(snap.gcvDocuments) ? snap.gcvDocuments : [];
    db.mivDocuments = Array.isArray(snap.mivDocuments) ? snap.mivDocuments : [];
    db.materialEstimates = Array.isArray(snap.materialEstimates) ? snap.materialEstimates : [];
    renumberScope(db, 'general');
    renumberScope(db, 'detailed');
    renumberScope(db, 'transit');
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'RESTORE_SNAPSHOT', 'backup', 'database', `بازیابی نسخه پشتیبان در مرورگر`);
    await saveDb(db);
    return {
      ok: true,
      counts: { general: db.general.length, detailed: db.detailed.length, transit: db.transit.length },
    } as T;
  }

  throw new StaticEngineError(errMsg(`مسیر پشتیبانی نمی‌شود: ${pathname}`, `Unsupported endpoint: ${pathname}`), 404);
}
