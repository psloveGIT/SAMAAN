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
} from '../shared/formulas.ts';
import { getMonthKeyFromIso, normalizeDigits } from '../shared/jalali.ts';
import type {
  AuditLogEntry,
  CalendarMode,
  CategoryGroupKey,
  CategoryStore,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  PackingStatusMeta,
  ShortageBackfillRecord,
  TransitEntry,
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
    version: 1,
    currentUserId: null,
    users: [],
    general: [],
    detailed: [],
    transit: [],
    packingMeta: {},
    categories: createEmptyCategories(),
    auditLogs: [],
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

async function getDb(): Promise<StaticDatabase> {
  if (cachedDb) return cachedDb;
  const idb = await openDb();
  const loaded = await new Promise<StaticDatabase | null>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => resolve((req.result as StaticDatabase) || null);
    req.onerror = () => reject(req.error);
  });
  idb.close();
  cachedDb = loaded || createEmptyDb();
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
  };
}

function normKey(v: string | undefined | null): string {
  return (v || '').trim();
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
  const used = new Set(arr.map((x) => normKey(x.rowNo)).filter(Boolean));
  let maxNum = 0;
  for (const r of used) {
    const n = Number(r);
    if (Number.isInteger(n) && n > maxNum) maxNum = n;
  }
  let candidate = maxNum + 1;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
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

  const currentUserObj = db.currentUserId
    ? db.users.find((u) => u.id === db.currentUserId && u.active) || null
    : null;

  const requireAuth = (allowed?: UserRole[]): StaticUser => {
    if (!currentUserObj) throw new StaticEngineError('Authentication required', 401);
    if (allowed && !allowed.includes(currentUserObj.role)) {
      throw new StaticEngineError('Insufficient permissions', 403);
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
    if (db.users.length > 0) throw new StaticEngineError('System is already initialized', 400);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || username).trim();
    if (!username || password.length < 4) {
      throw new StaticEngineError('Username and password (min 4 chars) are required', 400);
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
      throw new StaticEngineError('نام کاربری یا رمز عبور اشتباه است / Invalid credentials', 401);
    }
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
    if (!username || password.length < 4) {
      throw new StaticEngineError('Username and password (min 4 chars) are required', 400);
    }
    if (db.users.some((u) => u.username.toLowerCase() === username)) {
      throw new StaticEngineError('نام کاربری تکراری است / Username already exists', 409);
    }
    const created: StaticUser = {
      id: makeId(),
      username,
      fullName,
      role,
      active: true,
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
    if (!target) throw new StaticEngineError('User not found', 404);
    if (body.fullName !== undefined) target.fullName = String(body.fullName).trim();
    if (body.role !== undefined) target.role = body.role as UserRole;
    if (typeof body.active === 'boolean') target.active = body.active;
    if (typeof body.password === 'string' && body.password.length >= 4) {
      target.passwordHash = await hashBrowserPassword(body.password);
    }
    addAudit(db, sanitizeUser(admin), 'UPDATE_USER', 'user', target.id, `ویرایش حساب کاربری ${target.username}`);
    await saveDb(db);
    return { user: sanitizeUser(target) } as T;
  }

  // ---------------- PACKING CHECK & CLOSURE ----------------
  if (pathname === '/api/packing/check' && method === 'GET') {
    requireAuth();
    const packingNo = normKey(query.get('packingNo'));
    const packageNo = normKey(query.get('packageNo'));
    const rowNo = normalizeDigits(normKey(query.get('rowNo')));
    const scope = (query.get('scope') || 'general') as 'general' | 'detailed' | 'transit';
    const excludeId = query.get('excludeId') || undefined;

    const genMatches = packingNo ? db.general.filter((g) => normKey(g.packingListNo) === packingNo) : [];
    const detMatches = packingNo ? db.detailed.filter((d) => normKey(d.shipmentNo) === packingNo) : [];
    const transitMatches = packingNo ? db.transit.filter((t) => normKey(t.packingListNo) === packingNo) : [];
    const existingPackages = Array.from(
      new Set([
        ...genMatches.map((g) => normKey(g.packageNo)).filter(Boolean),
        ...detMatches.map((d) => normKey(d.packageNo)).filter(Boolean),
      ]),
    );
    const meta = packingNo ? db.packingMeta[packingNo] : undefined;

    return {
      packingNo,
      existsInGeneral: genMatches.length > 0,
      existsInDetailed: detMatches.length > 0,
      existsInTransit: transitMatches.length > 0,
      generalCount: genMatches.length,
      detailedCount: detMatches.length,
      existingPackages,
      packageExistsUnderPacking: packageNo ? existingPackages.includes(packageNo) : false,
      isClosed: Boolean(meta?.isClosed),
      closedAt: meta?.closedAt || null,
      closedBy: meta?.closedBy || null,
      rowNoTaken: rowNo ? isRowNoTaken(db, scope, rowNo, excludeId) : false,
      nextSuggestedRowNo: nextSuggestedRowNo(db, scope),
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
      const linkedDetails = pk ? db.detailed.filter((d) => normKey(d.shipmentNo) === pk) : [];
      const detailedCount = linkedDetails.filter(
        (d) => !g.packageNo || normKey(d.packageNo) === normKey(g.packageNo),
      ).length;
      const hasLinkedShortage = linkedDetails.some((d) => computeDetailedEntry(d).hasShortage);
      return {
        ...g,
        packingClosed: Boolean(pk && db.packingMeta[pk]?.isClosed),
        detailedCount,
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
    const detailedItems = (body.detailedItems as Partial<DetailedEntry>[]) || [];

    if (!pk) throw new StaticEngineError('شماره پکینگ لیست الزامی است / Packing List No. is required', 400);
    if (!entries.length) throw new StaticEngineError('حداقل یک نگله/آیتم باید ثبت شود', 400);

    const existingGen = db.general.filter((g) => normKey(g.packingListNo) === pk);
    const existingDet = db.detailed.filter((d) => normKey(d.shipmentNo) === pk);
    if (db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      throw new StaticEngineError('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 409, 'CLOSED_PACKING_WARNING');
    }
    if ((existingGen.length > 0 || existingDet.length > 0) && !isContinuation) {
      throw new StaticEngineError('شماره پکینگ لیست تکراری است. آیا ادامه همان پکینگ لیست قبلی است؟', 409, 'DUPLICATE_PACKING_PROMPT');
    }

    const existingPackages = new Set(existingGen.map((g) => normKey(g.packageNo)).filter(Boolean));
    const batchRowNos = new Set<string>();
    const preparedGeneral: GeneralEntry[] = [];
    const now = new Date().toISOString();

    for (const raw of entries) {
      const rowNo = normalizeDigits(normKey(raw.rowNo)) || nextSuggestedRowNo(db, 'general');
      if (isRowNoTaken(db, 'general', rowNo) || batchRowNos.has(rowNo)) {
        throw new StaticEngineError(`شماره ردیف ${rowNo} تکراری است. ستون ردیف باید یکتا باشد.`, 409, 'DUPLICATE_ROW_NO');
      }
      batchRowNos.add(rowNo);
      const pkgNo = normKey(raw.packageNo);
      if (isContinuation && existingGen.length > 0 && (!pkgNo || existingPackages.has(pkgNo))) {
        throw new StaticEngineError(`برای ادامه پکینگ لیست ${pk}، باید شماره نگله جدید و متفاوت وارد کنید.`, 409, 'DUPLICATE_PACKAGE_ON_CONTINUATION');
      }
      preparedGeneral.push({
        id: makeId(),
        rowNo,
        arrivalDate: normKey(raw.arrivalDate),
        releaseNo: normKey(raw.releaseNo),
        releaseDate: normKey(raw.releaseDate),
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: normKey(raw.employerEntryMinutesNo),
        mapnaEntryMinutesNo: normKey(raw.mapnaEntryMinutesNo),
        packingListNo: pk,
        packageNo: pkgNo,
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

    const preparedDetailed: DetailedEntry[] = [];
    if (detailedItems.length > 0) {
      let autoCounter = Number(nextSuggestedRowNo(db, 'detailed'));
      for (const d of detailedItems) {
        while (isRowNoTaken(db, 'detailed', String(autoCounter))) autoCounter += 1;
        const dRowNo = normalizeDigits(normKey(d.rowNo)) || String(autoCounter++);
        preparedDetailed.push({
          id: makeId(),
          rowNo: dRowNo,
          arrivalDate: normKey(d.arrivalDate || preparedGeneral[0].arrivalDate),
          supplier: normKey(d.supplier || preparedGeneral[0].supplier),
          origin: normKey(d.origin || preparedGeneral[0].dispatchLocation),
          shipmentNo: pk,
          packageNo: normKey(d.packageNo || preparedGeneral[0].packageNo),
          itemNo: normKey(d.itemNo),
          generalDescription: normKey(d.generalDescription || preparedGeneral[0].itemDescription),
          description: normKey(d.description || preparedGeneral[0].itemDescription),
          size: normKey(d.size),
          itemCode: normKey(d.itemCode),
          packingQty: d.packingQty ?? null,
          actualQty: d.actualQty ?? null,
          damagedQty: d.damagedQty ?? null,
          mtoRef: normKey(d.mtoRef),
          repNo: normKey(d.repNo),
          repStatus: normKey(d.repStatus),
          repDescription: normKey(d.repDescription),
          countingUnit: normKey(d.countingUnit),
          island: normKey(d.island || preparedGeneral[0].island),
          system: normKey(d.system || preparedGeneral[0].system),
          subSystem: normKey(d.subSystem || preparedGeneral[0].subSystem),
          unit: normKey(d.unit || preparedGeneral[0].unit),
          opiNo: normKey(d.opiNo || preparedGeneral[0].opiInvitationNo),
          opiDate: normKey(d.opiDate || preparedGeneral[0].opiInvitationDate),
          merNo: normKey(d.merNo),
          merStatus: normKey(d.merStatus),
          notes: normKey(d.notes),
          materialBalanceNo: normKey(d.materialBalanceNo),
          balanceStatus: normKey(d.balanceStatus),
          storageLocation: normKey(d.storageLocation),
          gcvReceiptNo: normKey(d.gcvReceiptNo),
          receiver: normKey(d.receiver),
          gcvDeliveredQty: d.gcvDeliveredQty ?? null,
          mivContractorNo: normKey(d.mivContractorNo),
          mivContractorDate: normKey(d.mivContractorDate),
          mivContractorQty: d.mivContractorQty ?? null,
          smrContractorNo: normKey(d.smrContractorNo),
          smrContractorDate: normKey(d.smrContractorDate),
          smrContractorQty: d.smrContractorQty ?? null,
          smrContractorNote: normKey(d.smrContractorNote),
          smrMapnaNo: normKey(d.smrMapnaNo),
          smrMapnaDate: normKey(d.smrMapnaDate),
          smrMapnaQty: d.smrMapnaQty ?? null,
          smrMapnaNote: normKey(d.smrMapnaNote),
          mivMapnaNo: normKey(d.mivMapnaNo),
          mivMapnaDate: normKey(d.mivMapnaDate),
          mivMapnaQty: d.mivMapnaQty ?? null,
          stocktakeInfo: normKey(d.stocktakeInfo),
          shortageBackfills: [],
          createdAt: now,
          updatedAt: now,
          createdBy: u.username,
        });
      }
    }

    db.general.unshift(...preparedGeneral);
    if (preparedDetailed.length > 0) db.detailed.unshift(...preparedDetailed);
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
    return { createdGeneral: preparedGeneral, createdDetailedCount: preparedDetailed.length, transitUpdated } as T;
  }

  if (pathname.startsWith('/api/general/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.general.find((g) => g.id === id);
    if (!item) throw new StaticEngineError('Record not found', 404);
    const pk = normKey((body.packingListNo as string) ?? item.packingListNo);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 409, 'CLOSED_PACKING_WARNING');
    }
    if (body.rowNo !== undefined) {
      const clean = normalizeDigits(normKey(String(body.rowNo)));
      if (!clean || isRowNoTaken(db, 'general', clean, item.id)) {
        throw new StaticEngineError('شماره ردیف باید یکتا و غیرخالی باشد', 409);
      }
      item.rowNo = clean;
    }
    const { acknowledgeClosed: _ack, ...patch } = body;
    Object.assign(item, { ...patch, rowNo: item.rowNo, updatedAt: new Date().toISOString() });
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
    if (idx === -1) throw new StaticEngineError('Record not found', 404);
    const [removed] = db.general.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_GENERAL', 'general', `${removed.packingListNo} (#${removed.rowNo})`, `حذف ردیف جنرال ${removed.rowNo}`);
    await saveDb(db);
    return { ok: true } as T;
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
        d.receiver, d.mivContractorNo, d.smrContractorNo, d.smrMapnaNo, d.mivMapnaNo, d.storageLocation,
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
    if (!pk) throw new StaticEngineError('شماره محموله / پکینگ لیست الزامی است', 400);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 409, 'CLOSED_PACKING_WARNING');
    }
    const rowNo = normalizeDigits(normKey(String(body.rowNo || ''))) || nextSuggestedRowNo(db, 'detailed');
    if (isRowNoTaken(db, 'detailed', rowNo)) {
      throw new StaticEngineError(`شماره ردیف ${rowNo} تکراری است. ستون ردیف باید یکتا باشد.`, 409, 'DUPLICATE_ROW_NO');
    }
    const now = new Date().toISOString();
    const { acknowledgeClosed: _ack, ...raw } = body;
    const created: DetailedEntry = {
      ...(raw as unknown as DetailedEntry),
      id: makeId(),
      rowNo,
      shipmentNo: pk,
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.detailed.unshift(created);
    rebuildCategories(db);
    const transitUpdated = syncTransitArrival(db, pk, sanitizeUser(u));
    addAudit(db, sanitizeUser(u), 'CREATE_DETAILED', 'detailed', `${pk} (#${rowNo})`, `ثبت آیتم جزئیات ردیف ${rowNo}`);
    await saveDb(db);
    return { item: computeDetailedEntry(created), transitUpdated } as T;
  }

  if (pathname.startsWith('/api/detailed/') && pathname.endsWith('/backfill') && method === 'POST') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.slice('/api/detailed/'.length, -'/backfill'.length);
    const item = db.detailed.find((d) => d.id === id);
    if (!item) throw new StaticEngineError('Record not found', 404);
    const qty = Number(body.qty);
    if (!qty || qty <= 0) throw new StaticEngineError('تعداد جبران کسری باید بزرگتر از صفر باشد', 400);
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
    if (!item) throw new StaticEngineError('Record not found', 404);
    const pk = normKey((body.shipmentNo as string) ?? item.shipmentNo);
    if (db.packingMeta[pk]?.isClosed && !body.acknowledgeClosed) {
      throw new StaticEngineError('این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 409, 'CLOSED_PACKING_WARNING');
    }
    if (body.rowNo !== undefined) {
      const clean = normalizeDigits(normKey(String(body.rowNo)));
      if (!clean || isRowNoTaken(db, 'detailed', clean, item.id)) {
        throw new StaticEngineError('شماره ردیف باید یکتا و غیرخالی باشد', 409);
      }
      item.rowNo = clean;
    }
    const { acknowledgeClosed: _ack, ...patch } = body;
    Object.assign(item, { ...patch, rowNo: item.rowNo, updatedAt: new Date().toISOString() });
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
    if (idx === -1) throw new StaticEngineError('Record not found', 404);
    const [removed] = db.detailed.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_DETAILED', 'detailed', `${removed.shipmentNo} (#${removed.rowNo})`, `حذف ردیف جزئیات ${removed.rowNo}`);
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
    const rowNo = normalizeDigits(normKey(String(body.rowNo || ''))) || nextSuggestedRowNo(db, 'transit');
    const pk = normKey(String(body.packingListNo || ''));
    const alreadyInWarehouse =
      pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
    const now = new Date().toISOString();
    const created: TransitEntry = {
      ...(body as unknown as TransitEntry),
      id: makeId(),
      rowNo,
      packingListNo: pk,
      overallStatus: alreadyInWarehouse ? 'رسیده' : normKey(String(body.overallStatus || '')) || 'در دست ارسال',
      linkedGeneralPackingNo: alreadyInWarehouse ? pk : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: u.username,
    };
    db.transit.unshift(created);
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'CREATE_TRANSIT', 'transit', pk || rowNo, `ثبت محموله در راه ${pk || rowNo}`);
    await saveDb(db);
    return { item: created } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'PATCH') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const item = db.transit.find((t) => t.id === id);
    if (!item) throw new StaticEngineError('Record not found', 404);
    Object.assign(item, { ...body, updatedAt: new Date().toISOString() });
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'UPDATE_TRANSIT', 'transit', item.packingListNo || item.rowNo, `ویرایش محموله در راه`);
    await saveDb(db);
    return { item } as T;
  }

  if (pathname.startsWith('/api/transit/') && method === 'DELETE') {
    const u = requireAuth(['admin', 'operator']);
    const id = pathname.split('/').pop()!;
    const idx = db.transit.findIndex((t) => t.id === id);
    if (idx === -1) throw new StaticEngineError('Record not found', 404);
    const [removed] = db.transit.splice(idx, 1);
    addAudit(db, sanitizeUser(u), 'DELETE_TRANSIT', 'transit', removed.packingListNo || removed.rowNo, `حذف ردیف در راه`);
    await saveDb(db);
    return { ok: true } as T;
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
      d.rowNo, d.shipmentNo, d.packageNo, d.generalDescription, d.description, d.itemCode, d.mtoRef,
      d.supplier, d.gcvReceiptNo, d.mivContractorNo, d.smrContractorNo, d.materialBalanceNo, d.balanceStatus, d.storageLocation,
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
    if (!db.categories[group] || !val) throw new StaticEngineError('Invalid category', 400);
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
    if (!db.categories[group] || !from || !to) throw new StaticEngineError('Invalid rename', 400);
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
    const policy = (body.duplicateRowPolicy as 'auto_reassign' | 'skip') || 'auto_reassign';

    let imported = 0;
    let skipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();

    if (targetScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, u.username);
      let nextAuto = Number(nextSuggestedRowNo(db, 'general'));
      const seen = new Set(db.general.map((g) => normKey(g.rowNo)).filter(Boolean));
      for (const r of parsed.rows) {
        let rowNo = r.rowNo;
        if (!rowNo || seen.has(rowNo)) {
          if (policy === 'skip') { skipped += 1; continue; }
          while (seen.has(String(nextAuto))) nextAuto += 1;
          rowNo = String(nextAuto++);
        }
        seen.add(rowNo);
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        db.general.push({ ...r, rowNo, id: makeId() });
        imported += 1;
      }
    } else if (targetScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, u.username);
      let nextAuto = Number(nextSuggestedRowNo(db, 'detailed'));
      const seen = new Set(db.detailed.map((d) => normKey(d.rowNo)).filter(Boolean));
      for (const r of parsed.rows) {
        let rowNo = r.rowNo;
        if (!rowNo || seen.has(rowNo)) {
          if (policy === 'skip') { skipped += 1; continue; }
          while (seen.has(String(nextAuto))) nextAuto += 1;
          rowNo = String(nextAuto++);
        }
        seen.add(rowNo);
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        db.detailed.push({ ...r, rowNo, id: makeId() });
        imported += 1;
      }
    } else {
      const parsed = parseTransitCsv(matrix, cal, u.username);
      let nextAuto = Number(nextSuggestedRowNo(db, 'transit'));
      const seen = new Set(db.transit.map((t) => normKey(t.rowNo)).filter(Boolean));
      for (const r of parsed.rows) {
        while (seen.has(String(nextAuto))) nextAuto += 1;
        const rowNo = String(nextAuto++);
        seen.add(rowNo);
        const pk = normKey(r.packingListNo);
        const arrived = pk && (db.general.some((g) => normKey(g.packingListNo) === pk) || db.detailed.some((d) => normKey(d.shipmentNo) === pk));
        db.transit.push({
          ...r,
          rowNo,
          id: makeId(),
          overallStatus: arrived ? 'رسیده' : r.overallStatus,
          linkedGeneralPackingNo: arrived ? pk : undefined,
        });
        imported += 1;
      }
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
    rebuildCategories(db);
    addAudit(db, sanitizeUser(u), 'RESTORE_SNAPSHOT', 'backup', 'database', `بازیابی نسخه پشتیبان در مرورگر`);
    await saveDb(db);
    return {
      ok: true,
      counts: { general: db.general.length, detailed: db.detailed.length, transit: db.transit.length },
    } as T;
  }

  throw new StaticEngineError(`Unsupported endpoint: ${pathname}`, 404);
}
