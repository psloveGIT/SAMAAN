import type {
  CategoryStore,
  CustomFormSubmission,
  DetailedEntry,
  GcvDocumentRecord,
  GeneralEntry,
  MaterialEstimateRecord,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportRecord,
  PackingStatusMeta,
  PeriodicInspectionRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
  TrashRecord,
} from './types.ts';

export type HistoryRecordScope =
  | 'general'
  | 'detailed'
  | 'transit'
  | 'trash'
  | 'opiInvitations'
  | 'siteEntryMinutes'
  | 'opiMinutes'
  | 'osdrReports'
  | 'substitutions'
  | 'gcvDocuments'
  | 'mivDocuments'
  | 'materialEstimates'
  | 'periodicInspections'
  | 'customFormSubmissions';

export type HistoryRecordEntity =
  | GeneralEntry
  | DetailedEntry
  | TransitEntry
  | TrashRecord
  | OpiInvitationRecord
  | SiteEntryMinutesRecord
  | OpiMinutesRecord
  | OsdrReportRecord
  | SubstitutionRecord
  | GcvDocumentRecord
  | MivDocumentRecord
  | MaterialEstimateRecord
  | PeriodicInspectionRecord
  | CustomFormSubmission;

export type HistoryChange =
  | {
      scope: HistoryRecordScope;
      op: 'insert';
      id: string;
      after: HistoryRecordEntity;
    }
  | {
      scope: HistoryRecordScope;
      op: 'update';
      id: string;
      before: HistoryRecordEntity;
      after: HistoryRecordEntity;
    }
  | {
      scope: HistoryRecordScope;
      op: 'delete';
      id: string;
      before: HistoryRecordEntity;
      index?: number;
    }
  | {
      scope: 'categories';
      before: CategoryStore;
      after: CategoryStore;
    }
  | {
      scope: 'packingMeta';
      key: string;
      before?: PackingStatusMeta;
      after?: PackingStatusMeta;
    };

export interface HistoryCommand {
  id: string;
  timestamp: string;
  labelFa: string;
  labelEn: string;
  user: string;
  changes: HistoryChange[];
}

export interface HistoryEntryPreview {
  id: string;
  timestamp: string;
  labelFa: string;
  labelEn: string;
  user: string;
  changeCount: number;
}

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  nextUndoLabelFa: string | null;
  nextUndoLabelEn: string | null;
  nextRedoLabelFa: string | null;
  nextRedoLabelEn: string | null;
  undoStack: HistoryEntryPreview[];
  redoStack: HistoryEntryPreview[];
}

export interface UndoableDatabaseSlice {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  trash: TrashRecord[];
  categories: CategoryStore;
  packingMeta: Record<string, PackingStatusMeta>;
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

export interface ApplyHistoryResult {
  command: HistoryCommand;
  touchedScopes: Set<HistoryRecordScope | 'categories' | 'packingMeta'>;
}

export interface AutoUndoRouteSpec {
  labelFa: string;
  labelEn: string;
  deepScopes: HistoryRecordScope[];
  shallowScopes: HistoryRecordScope[];
  trackCategories?: boolean;
  trackPackingMeta?: boolean;
}

export interface AutoUndoSnapshot {
  spec: AutoUndoRouteSpec;
  startSeq: number;
  deepBefore: Partial<Record<HistoryRecordScope, Array<{ id: string }>>>;
  shallowBefore: Partial<Record<HistoryRecordScope, Array<Record<string, unknown> & { id: string }>>>;
  categoriesBefore?: CategoryStore;
  packingMetaBefore?: Record<string, PackingStatusMeta>;
}

const ALL_OPERATIONAL_SCOPES: HistoryRecordScope[] = [
  'opiInvitations',
  'siteEntryMinutes',
  'opiMinutes',
  'osdrReports',
  'substitutions',
  'gcvDocuments',
  'mivDocuments',
  'materialEstimates',
  'periodicInspections',
  'customFormSubmissions',
];

function cloneObj<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val)) as T;
}

function getCollection(
  db: UndoableDatabaseSlice,
  scope: HistoryRecordScope,
): Array<{ id: string }> {
  if (!Array.isArray(db[scope])) {
    (db as unknown as Record<string, unknown>)[scope] = [];
  }
  return db[scope] as Array<{ id: string }>;
}

function shallowRecordChanged(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return true;
  for (let i = 0; i < keysA.length; i += 1) {
    const k = keysA[i];
    if (a[k] !== b[k]) return true;
  }
  return false;
}

/**
 * Computes minimal insert/update/delete HistoryChange deltas between two arrays of keyed records
 * using deep JSON comparison (intended for operational collections with nested item arrays).
 */
export function diffCollectionRecords<T extends { id: string }>(
  scope: HistoryRecordScope,
  beforeList: T[] | undefined,
  afterList: T[] | undefined,
): HistoryChange[] {
  const before = Array.isArray(beforeList) ? beforeList : [];
  const after = Array.isArray(afterList) ? afterList : [];
  const beforeMap = new Map<string, { item: T; index: number }>();
  for (let i = 0; i < before.length; i += 1) {
    beforeMap.set(before[i].id, { item: before[i], index: i });
  }
  const afterMap = new Map<string, T>();
  for (let i = 0; i < after.length; i += 1) {
    afterMap.set(after[i].id, after[i]);
  }

  const changes: HistoryChange[] = [];
  for (let i = 0; i < before.length; i += 1) {
    const prev = before[i];
    if (!afterMap.has(prev.id)) {
      changes.push({
        scope,
        op: 'delete',
        id: prev.id,
        before: prev as unknown as HistoryRecordEntity,
        index: i,
      });
    }
  }
  for (let i = 0; i < after.length; i += 1) {
    const next = after[i];
    const prevRec = beforeMap.get(next.id);
    if (!prevRec) {
      changes.push({
        scope,
        op: 'insert',
        id: next.id,
        after: next as unknown as HistoryRecordEntity,
      });
    } else if (JSON.stringify(prevRec.item) !== JSON.stringify(next)) {
      changes.push({
        scope,
        op: 'update',
        id: next.id,
        before: prevRec.item as unknown as HistoryRecordEntity,
        after: next as unknown as HistoryRecordEntity,
      });
    }
  }
  return changes;
}

/**
 * Fast O(N) shallow delta diff for large collections (general / detailed / transit / trash)
 * without JSON.stringify overhead on unchanged records.
 */
export function diffShallowCollectionRecords<T extends Record<string, unknown> & { id: string }>(
  scope: HistoryRecordScope,
  beforeList: T[],
  afterList: T[],
): HistoryChange[] {
  const beforeMap = new Map<string, { item: T; index: number }>();
  for (let i = 0; i < beforeList.length; i += 1) {
    beforeMap.set(beforeList[i].id, { item: beforeList[i], index: i });
  }
  const afterMap = new Map<string, T>();
  for (let i = 0; i < afterList.length; i += 1) {
    afterMap.set(afterList[i].id, afterList[i]);
  }

  const changes: HistoryChange[] = [];
  for (let i = 0; i < beforeList.length; i += 1) {
    const prev = beforeList[i];
    if (!afterMap.has(prev.id)) {
      changes.push({
        scope,
        op: 'delete',
        id: prev.id,
        before: prev as unknown as HistoryRecordEntity,
        index: i,
      });
    }
  }
  for (let i = 0; i < afterList.length; i += 1) {
    const next = afterList[i];
    const prevRec = beforeMap.get(next.id);
    if (!prevRec) {
      changes.push({
        scope,
        op: 'insert',
        id: next.id,
        after: next as unknown as HistoryRecordEntity,
      });
    } else if (shallowRecordChanged(prevRec.item, next)) {
      changes.push({
        scope,
        op: 'update',
        id: next.id,
        before: prevRec.item as unknown as HistoryRecordEntity,
        after: next as unknown as HistoryRecordEntity,
      });
    }
  }
  return changes;
}

/**
 * Maps any mutating API route across the entire app to its minimal Undo/Redo tracking spec.
 * Returns null for read-only, auth, AI, history, or already explicitly-tracked routes if desired.
 */
export function resolveAutoUndoSpec(
  method: string,
  pathname: string,
): AutoUndoRouteSpec | null {
  const m = (method || 'GET').toUpperCase();
  if (m !== 'POST' && m !== 'PATCH' && m !== 'PUT' && m !== 'DELETE') return null;

  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/ai/') ||
    pathname.startsWith('/api/history/') ||
    pathname.startsWith('/api/import/preview') ||
    pathname.startsWith('/api/backup/')
  ) {
    return null;
  }

  const actionVerbFa =
    m === 'POST' ? 'ثبت' : m === 'DELETE' ? 'حذف' : 'ویرایش';
  const actionVerbEn =
    m === 'POST' ? 'Create' : m === 'DELETE' ? 'Delete' : 'Update';

  // Packing close / reopen
  if (pathname.startsWith('/api/packing/') && (pathname.endsWith('/close') || pathname.endsWith('/reopen'))) {
    const closing = pathname.endsWith('/close');
    return {
      labelFa: closing ? 'بستن پکینگ لیست' : 'بازگشایی پکینگ لیست',
      labelEn: closing ? 'Close Packing List' : 'Reopen Packing List',
      deepScopes: [],
      shallowScopes: [],
      trackPackingMeta: true,
    };
  }

  // Trash restore (single & bulk - auto-tracked in static engine, skipped in server if already pushed)
  if (pathname === '/api/trash/bulk-restore' && m === 'POST') {
    return {
      labelFa: 'بازیابی گروهی از سطل بازیافت',
      labelEn: 'Bulk Restore from Trash',
      deepScopes: [],
      shallowScopes: ['general', 'detailed', 'transit', 'trash'],
    };
  }
  if (pathname.startsWith('/api/trash/') && pathname.endsWith('/restore') && m === 'POST') {
    return {
      labelFa: 'بازیابی ردیف از سطل بازیافت',
      labelEn: 'Restore Row from Trash',
      deepScopes: [],
      shallowScopes: ['general', 'detailed', 'transit', 'trash'],
    };
  }

  // Trash permanent delete (single & bulk)
  if (pathname === '/api/trash/bulk-delete' && m === 'POST') {
    return {
      labelFa: 'حذف دائمی گروهی از سطل بازیافت',
      labelEn: 'Bulk Permanent Delete from Trash',
      deepScopes: [],
      shallowScopes: ['trash'],
    };
  }
  if (pathname.startsWith('/api/trash/') && m === 'DELETE') {
    return {
      labelFa: 'حذف دائمی ردیف از سطل بازیافت',
      labelEn: 'Permanently Delete Row from Trash',
      deepScopes: [],
      shallowScopes: ['trash'],
    };
  }

  // Site Entry Minutes
  if (pathname === '/api/site-entry' || pathname.startsWith('/api/site-entry/')) {
    return {
      labelFa: `${actionVerbFa} صورتجلسه ورود به سایت`,
      labelEn: `${actionVerbEn} Site Entry Minute`,
      deepScopes: ['siteEntryMinutes'],
      shallowScopes: ['general', 'transit'],
    };
  }

  // OPI Invitations & Results
  if (pathname === '/api/opi/results' && m === 'POST') {
    return {
      labelFa: 'ثبت نتایج بازرسی و گشایش بسته‌ها (OPI)',
      labelEn: 'Record OPI Inspection Results',
      deepScopes: ['opiInvitations'],
      shallowScopes: ['detailed', 'general'],
    };
  }
  if (pathname === '/api/opi' || pathname.startsWith('/api/opi/')) {
    return {
      labelFa: `${actionVerbFa} دعوتنامه گشایش بسته‌ها (OPI)`,
      labelEn: `${actionVerbEn} OPI Invitation`,
      deepScopes: ['opiInvitations'],
      shallowScopes: ['detailed', 'general'],
    };
  }

  // OPI Minutes
  if (pathname === '/api/opi-minutes' || pathname.startsWith('/api/opi-minutes/')) {
    return {
      labelFa: `${actionVerbFa} صورتجلسه گشایش بسته‌ها`,
      labelEn: `${actionVerbEn} OPI Minute`,
      deepScopes: ['opiMinutes', 'opiInvitations'],
      shallowScopes: ['detailed'],
    };
  }

  // OSDR Reports
  if (pathname === '/api/osdr' || pathname.startsWith('/api/osdr/')) {
    return {
      labelFa: `${actionVerbFa} گزارش مغایرت و کسری (OSDR)`,
      labelEn: `${actionVerbEn} OSDR Report`,
      deepScopes: ['osdrReports'],
      shallowScopes: ['detailed'],
    };
  }

  // GCV Documents
  if (pathname === '/api/gcv' || pathname.startsWith('/api/gcv/')) {
    return {
      labelFa: `${actionVerbFa} رسید ورود به انبار (GCV)`,
      labelEn: `${actionVerbEn} Warehouse Receipt (GCV)`,
      deepScopes: ['gcvDocuments'],
      shallowScopes: ['detailed'],
    };
  }

  // MIV / SMR Documents
  if (pathname === '/api/miv' || pathname.startsWith('/api/miv/')) {
    return {
      labelFa: `${actionVerbFa} حواله خروج / برگشت کالا (MIV / SMR)`,
      labelEn: `${actionVerbEn} Material Issue / Return (MIV / SMR)`,
      deepScopes: ['mivDocuments'],
      shallowScopes: ['detailed'],
    };
  }

  // Substitutions (REP)
  if (pathname === '/api/substitutions' || pathname.startsWith('/api/substitutions/')) {
    return {
      labelFa: `${actionVerbFa} جایگزینی تجهیزات (REP)`,
      labelEn: `${actionVerbEn} Equipment Substitution (REP)`,
      deepScopes: ['substitutions'],
      shallowScopes: ['detailed'],
    };
  }

  // Material Estimations
  if (pathname === '/api/estimations' || pathname.startsWith('/api/estimations/')) {
    return {
      labelFa: `${actionVerbFa} برآورد متریال`,
      labelEn: `${actionVerbEn} Material Estimation`,
      deepScopes: ['materialEstimates'],
      shallowScopes: [],
    };
  }

  // Balance assign
  if (pathname === '/api/balance/assign' && m === 'POST') {
    return {
      labelFa: 'ثبت و بروزرسانی بالانس تجهیزات',
      labelEn: 'Update Equipment Balance',
      deepScopes: [],
      shallowScopes: ['detailed'],
      trackCategories: true,
    };
  }

  // Stocktake assign
  if (pathname === '/api/stocktake/assign' && m === 'POST') {
    return {
      labelFa: 'ثبت وضعیت انبارگردانی',
      labelEn: 'Update Stocktake Status',
      deepScopes: [],
      shallowScopes: ['detailed'],
      trackCategories: true,
    };
  }

  // Periodic Inspections
  if (pathname === '/api/periodic-inspections' || pathname.startsWith('/api/periodic-inspections/')) {
    return {
      labelFa: `${actionVerbFa} گزارش بازدید دوره‌ای`,
      labelEn: `${actionVerbEn} Periodic Inspection`,
      deepScopes: ['periodicInspections'],
      shallowScopes: ['detailed'],
    };
  }

  // Custom Form Submissions
  if (pathname === '/api/custom-forms' || pathname.startsWith('/api/custom-forms/')) {
    return {
      labelFa: `${actionVerbFa} فرم اختصاصی کارفرما`,
      labelEn: `${actionVerbEn} Custom Employer Form`,
      deepScopes: ['customFormSubmissions'],
      shallowScopes: [],
    };
  }

  // Category rename/merge (PATCH)
  if (pathname.startsWith('/api/categories/') && m === 'PATCH') {
    return {
      labelFa: 'ویرایش / ادغام دسته‌بندی',
      labelEn: 'Rename / Merge Category',
      deepScopes: [],
      shallowScopes: ['general', 'detailed', 'transit'],
      trackCategories: true,
    };
  }

  // Import commit (core + operational forms)
  if (pathname === '/api/import/commit' && m === 'POST') {
    return {
      labelFa: 'ورود اطلاعات و فرم‌ها از فایل',
      labelEn: 'Import Records & Forms from File',
      deepScopes: [...ALL_OPERATIONAL_SCOPES],
      shallowScopes: ['general', 'detailed', 'transit'],
      trackCategories: true,
      trackPackingMeta: true,
    };
  }

  // Multi-sheet / multi-section auto-workbook import
  if (pathname === '/api/import/auto-workbook' && m === 'POST') {
    return {
      labelFa: 'ورود خودکار چندبخشی از فایل',
      labelEn: 'Auto Multi-Section Workbook Import',
      deepScopes: [...ALL_OPERATIONAL_SCOPES],
      shallowScopes: ['general', 'detailed', 'transit'],
      trackCategories: true,
      trackPackingMeta: true,
    };
  }

  // Database section purge
  if (pathname === '/api/database/purge' && m === 'POST') {
    return {
      labelFa: 'پاک‌سازی بخش‌های دیتابیس',
      labelEn: 'Purge Database Sections',
      deepScopes: [...ALL_OPERATIONAL_SCOPES],
      shallowScopes: ['general', 'detailed', 'transit', 'trash'],
      trackCategories: true,
      trackPackingMeta: true,
    };
  }

  return null;
}

/**
 * Captures lightweight before-state for an auto-tracked route before execution.
 */
export function captureAutoUndoState(
  db: UndoableDatabaseSlice,
  history: WarehouseHistoryManager,
  spec: AutoUndoRouteSpec,
): AutoUndoSnapshot {
  const deepBefore: Partial<Record<HistoryRecordScope, Array<{ id: string }>>> = {};
  for (const sc of spec.deepScopes) {
    const arr = getCollection(db, sc);
    deepBefore[sc] = cloneObj(arr);
  }

  const shallowBefore: Partial<Record<HistoryRecordScope, Array<Record<string, unknown> & { id: string }>>> = {};
  for (const sc of spec.shallowScopes) {
    const arr = getCollection(db, sc);
    const copy = new Array<Record<string, unknown> & { id: string }>(arr.length);
    for (let i = 0; i < arr.length; i += 1) {
      copy[i] = { ...(arr[i] as unknown as Record<string, unknown>) } as Record<string, unknown> & { id: string };
    }
    shallowBefore[sc] = copy;
  }

  return {
    spec,
    startSeq: history.getSeq(),
    deepBefore,
    shallowBefore,
    categoriesBefore: spec.trackCategories ? cloneObj(db.categories) : undefined,
    packingMetaBefore: spec.trackPackingMeta ? cloneObj(db.packingMeta) : undefined,
  };
}

/**
 * Computes exact minimal deltas after a route mutates `db` and pushes them to `history`
 * (only if the route didn't already push its own explicit history entry).
 */
export function commitAutoUndoDiff(
  db: UndoableDatabaseSlice,
  history: WarehouseHistoryManager,
  snapshot: AutoUndoSnapshot,
  user: string,
): HistoryCommand | null {
  if (history.getSeq() !== snapshot.startSeq) {
    return null;
  }

  const changes: HistoryChange[] = [];

  for (const sc of snapshot.spec.deepScopes) {
    const beforeArr = snapshot.deepBefore[sc] || [];
    const afterArr = getCollection(db, sc);
    const diff = diffCollectionRecords(sc, beforeArr, afterArr);
    for (let i = 0; i < diff.length; i += 1) changes.push(diff[i]);
  }

  for (const sc of snapshot.spec.shallowScopes) {
    const beforeArr = snapshot.shallowBefore[sc] || [];
    const afterArr = getCollection(db, sc) as unknown as Array<Record<string, unknown> & { id: string }>;
    const diff = diffShallowCollectionRecords(sc, beforeArr, afterArr);
    for (let i = 0; i < diff.length; i += 1) changes.push(diff[i]);
  }

  if (snapshot.spec.trackCategories && snapshot.categoriesBefore) {
    if (JSON.stringify(snapshot.categoriesBefore) !== JSON.stringify(db.categories)) {
      changes.push({
        scope: 'categories',
        before: snapshot.categoriesBefore,
        after: cloneObj(db.categories),
      });
    }
  }

  if (snapshot.spec.trackPackingMeta && snapshot.packingMetaBefore) {
    const allKeys = new Set<string>([
      ...Object.keys(snapshot.packingMetaBefore),
      ...Object.keys(db.packingMeta || {}),
    ]);
    for (const key of allKeys) {
      const prev = snapshot.packingMetaBefore[key];
      const next = db.packingMeta?.[key];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        changes.push({
          scope: 'packingMeta',
          key,
          before: prev ? cloneObj(prev) : undefined,
          after: next ? cloneObj(next) : undefined,
        });
      }
    }
  }

  if (changes.length === 0) return null;

  return history.push({
    labelFa: snapshot.spec.labelFa,
    labelEn: snapshot.spec.labelEn,
    user,
    changes,
  });
}

function applySingleChangeForward(
  db: UndoableDatabaseSlice,
  change: HistoryChange,
): void {
  if (change.scope === 'categories') {
    db.categories = cloneObj(change.after);
    return;
  }
  if (change.scope === 'packingMeta') {
    if (change.after === undefined) {
      delete db.packingMeta[change.key];
    } else {
      db.packingMeta[change.key] = cloneObj(change.after);
    }
    return;
  }

  const arr = getCollection(db, change.scope);
  if (change.op === 'insert') {
    const existingIdx = arr.findIndex((item) => item.id === change.id);
    if (existingIdx >= 0) {
      arr[existingIdx] = cloneObj(change.after);
    } else {
      arr.push(cloneObj(change.after));
    }
    return;
  }
  if (change.op === 'update') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr[idx] = cloneObj(change.after);
    } else {
      arr.push(cloneObj(change.after));
    }
    return;
  }
  if (change.op === 'delete') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
  }
}

function applySingleChangeReverse(
  db: UndoableDatabaseSlice,
  change: HistoryChange,
): void {
  if (change.scope === 'categories') {
    db.categories = cloneObj(change.before);
    return;
  }
  if (change.scope === 'packingMeta') {
    if (change.before === undefined) {
      delete db.packingMeta[change.key];
    } else {
      db.packingMeta[change.key] = cloneObj(change.before);
    }
    return;
  }

  const arr = getCollection(db, change.scope);
  if (change.op === 'insert') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
    return;
  }
  if (change.op === 'update') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr[idx] = cloneObj(change.before);
    } else {
      arr.push(cloneObj(change.before));
    }
    return;
  }
  if (change.op === 'delete') {
    const existingIdx = arr.findIndex((item) => item.id === change.id);
    if (existingIdx >= 0) {
      arr[existingIdx] = cloneObj(change.before);
    } else if (
      typeof change.index === 'number' &&
      change.index >= 0 &&
      change.index <= arr.length
    ) {
      arr.splice(change.index, 0, cloneObj(change.before));
    } else {
      arr.push(cloneObj(change.before));
    }
  }
}

/**
 * Delta-based in-memory Undo/Redo stack per project.
 * Stores only mutated records (insert/update/delete deltas), never cloning 25k+ rows.
 */
export class WarehouseHistoryManager {
  private undoStack: HistoryCommand[] = [];
  private redoStack: HistoryCommand[] = [];
  private readonly maxDepth: number;
  private seq = 0;

  constructor(maxDepth = 50) {
    this.maxDepth = Math.max(1, maxDepth);
  }

  public getSeq(): number {
    return this.seq;
  }

  public push(input: {
    labelFa: string;
    labelEn: string;
    user: string;
    changes: HistoryChange[];
  }): HistoryCommand | null {
    if (!input.changes || input.changes.length === 0) return null;
    this.seq += 1;
    const cmd: HistoryCommand = {
      id: `hist_${Date.now()}_${this.seq}`,
      timestamp: new Date().toISOString(),
      labelFa: input.labelFa,
      labelEn: input.labelEn,
      user: input.user || 'system',
      changes: input.changes.map((c) => cloneObj(c)),
    };
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    // Any new mutation clears the redo stack (standard Excel behavior)
    this.redoStack = [];
    return cmd;
  }

  public undo(db: UndoableDatabaseSlice): ApplyHistoryResult | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;

    const touchedScopes = new Set<HistoryRecordScope | 'categories' | 'packingMeta'>();
    // Apply reverse changes in reverse chronological order
    for (let i = cmd.changes.length - 1; i >= 0; i -= 1) {
      const ch = cmd.changes[i];
      applySingleChangeReverse(db, ch);
      touchedScopes.add(ch.scope);
    }

    this.redoStack.push(cmd);
    if (this.redoStack.length > this.maxDepth) {
      this.redoStack.shift();
    }
    return { command: cmd, touchedScopes };
  }

  public redo(db: UndoableDatabaseSlice): ApplyHistoryResult | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;

    const touchedScopes = new Set<HistoryRecordScope | 'categories' | 'packingMeta'>();
    // Apply forward changes in original order
    for (let i = 0; i < cmd.changes.length; i += 1) {
      const ch = cmd.changes[i];
      applySingleChangeForward(db, ch);
      touchedScopes.add(ch.scope);
    }

    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    return { command: cmd, touchedScopes };
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getStatus(previewLimit = 10): HistoryStatus {
    const topUndo = this.undoStack[this.undoStack.length - 1] || null;
    const topRedo = this.redoStack[this.redoStack.length - 1] || null;
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      nextUndoLabelFa: topUndo ? topUndo.labelFa : null,
      nextUndoLabelEn: topUndo ? topUndo.labelEn : null,
      nextRedoLabelFa: topRedo ? topRedo.labelFa : null,
      nextRedoLabelEn: topRedo ? topRedo.labelEn : null,
      undoStack: this.undoStack
        .slice(-previewLimit)
        .reverse()
        .map((c) => ({
          id: c.id,
          timestamp: c.timestamp,
          labelFa: c.labelFa,
          labelEn: c.labelEn,
          user: c.user,
          changeCount: c.changes.length,
        })),
      redoStack: this.redoStack
        .slice(-previewLimit)
        .reverse()
        .map((c) => ({
          id: c.id,
          timestamp: c.timestamp,
          labelFa: c.labelFa,
          labelEn: c.labelEn,
          user: c.user,
          changeCount: c.changes.length,
        })),
    };
  }
}
