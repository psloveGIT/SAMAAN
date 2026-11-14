import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditLogEntry,
  CategoryGroupKey,
  CategoryStore,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  GcvDocumentRecord,
  GeneralEntry,
  MivDocumentRecord,
  OpiInvitationRecord,
  PackingStatusMeta,
  TransitEntry,
  TrashRecord,
  UserAccount,
} from '../shared/types.ts';
import { computeDetailedEntry } from '../shared/formulas.ts';
import { normalizeDigits } from '../shared/jalali.ts';
import type { StoredUser } from './auth.ts';

export interface PersistedDatabase {
  version: number;
  sessionSecret: string;
  users: StoredUser[];
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  packingMeta: Record<string, PackingStatusMeta>;
  categories: CategoryStore;
  auditLogs: AuditLogEntry[];
  trash: TrashRecord[];
  opiInvitations: OpiInvitationRecord[];
  gcvDocuments: GcvDocumentRecord[];
  mivDocuments: MivDocumentRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'samaan-db.json');

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

function createEmptyDb(): PersistedDatabase {
  return {
    version: 2,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    users: [],
    general: [],
    detailed: [],
    transit: [],
    packingMeta: {},
    categories: createEmptyCategories(),
    auditLogs: [],
    trash: [],
    opiInvitations: [],
    gcvDocuments: [],
    mivDocuments: [],
  };
}

export function normKey(v: string | undefined | null): string {
  return (v || '').trim();
}

export class SamaanStore {
  public db: PersistedDatabase;
  public generalRowNos = new Set<string>();
  public detailedRowNos = new Set<string>();
  public transitRowNos = new Set<string>();
  public generalByPacking = new Map<string, GeneralEntry[]>();
  public detailedByPacking = new Map<string, DetailedEntry[]>();
  public transitByPacking = new Map<string, TransitEntry[]>();

  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.db = this.loadFromDisk();
    this.rebuildIndexes();
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_FILE)) {
        const empty = createEmptyDb();
        this.writeAtomic(empty);
        return empty;
      }
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;
      const empty = createEmptyDb();
      return {
        version: parsed.version || 2,
        sessionSecret: parsed.sessionSecret || empty.sessionSecret,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        general: Array.isArray(parsed.general) ? parsed.general : [],
        detailed: Array.isArray(parsed.detailed) ? parsed.detailed : [],
        transit: Array.isArray(parsed.transit) ? parsed.transit : [],
        packingMeta: parsed.packingMeta || {},
        categories: {
          ...createEmptyCategories(),
          ...(parsed.categories || {}),
        },
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        trash: Array.isArray(parsed.trash) ? parsed.trash : [],
        opiInvitations: Array.isArray(parsed.opiInvitations) ? parsed.opiInvitations : [],
        gcvDocuments: Array.isArray(parsed.gcvDocuments) ? parsed.gcvDocuments : [],
        mivDocuments: Array.isArray(parsed.mivDocuments) ? parsed.mivDocuments : [],
      };
    } catch (err) {
      console.error('Failed to load local database file, starting fresh:', err);
      return createEmptyDb();
    }
  }

  private writeAtomic(data: PersistedDatabase): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  }

  public saveImmediate(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeAtomic(this.db);
  }

  public scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeAtomic(this.db);
    }, 300);
  }

  /**
   * Automatically numbers rows 1..N sequentially (newest at index 0 = N, oldest at bottom = 1).
   */
  public renumberScope(scope: 'general' | 'detailed' | 'transit'): void {
    const arr =
      scope === 'general'
        ? this.db.general
        : scope === 'detailed'
          ? this.db.detailed
          : this.db.transit;
    const total = arr.length;
    for (let i = 0; i < total; i += 1) {
      arr[i].rowNo = String(total - i);
    }
  }

  public rebuildIndexes(): void {
    this.generalRowNos.clear();
    this.detailedRowNos.clear();
    this.transitRowNos.clear();
    this.generalByPacking.clear();
    this.detailedByPacking.clear();
    this.transitByPacking.clear();

    for (const g of this.db.general) {
      const rn = normKey(g.rowNo);
      if (rn) this.generalRowNos.add(rn);
      const pk = normKey(g.packingListNo);
      if (pk) {
        const list = this.generalByPacking.get(pk) || [];
        list.push(g);
        this.generalByPacking.set(pk, list);
      }
      this.registerCategoriesFromFields({
        island: g.island,
        system: g.system,
        subSystem: g.subSystem,
        unit: g.unit,
        supplier: g.supplier,
        dispatchLocation: g.dispatchLocation,
      });
    }

    for (const d of this.db.detailed) {
      const rn = normKey(d.rowNo);
      if (rn) this.detailedRowNos.add(rn);
      const pk = normKey(d.shipmentNo);
      if (pk) {
        const list = this.detailedByPacking.get(pk) || [];
        list.push(d);
        this.detailedByPacking.set(pk, list);
      }
      this.registerCategoriesFromFields({
        island: d.island,
        system: d.system,
        subSystem: d.subSystem,
        unit: d.unit,
        supplier: d.supplier,
        dispatchLocation: d.origin,
        storageLocation: d.storageLocation,
      });
    }

    for (const t of this.db.transit) {
      const rn = normKey(t.rowNo);
      if (rn) this.transitRowNos.add(rn);
      const pk = normKey(t.packingListNo);
      if (pk) {
        const list = this.transitByPacking.get(pk) || [];
        list.push(t);
        this.transitByPacking.set(pk, list);
      }
      this.registerCategoriesFromFields({
        system: t.system,
        subSystem: t.subSystem,
        unit: t.unit,
        supplier: t.supplier,
        dispatchLocation: t.dispatchLocation,
        carrierContractor: t.carrierContractor,
      });
    }
  }

  public registerCategoryValue(group: CategoryGroupKey, rawVal: string | undefined | null): void {
    const val = normKey(rawVal);
    if (!val || val === '-' || val === '—') return;
    const arr = this.db.categories[group];
    if (!arr.includes(val)) {
      arr.push(val);
      arr.sort((a, b) => a.localeCompare(b, 'fa'));
    }
  }

  public registerCategoriesFromFields(fields: Partial<Record<CategoryGroupKey, string>>): void {
    (Object.keys(fields) as CategoryGroupKey[]).forEach((k) => {
      this.registerCategoryValue(k, fields[k]);
    });
  }

  public nextSuggestedRowNo(scope: 'general' | 'detailed' | 'transit'): string {
    const arr =
      scope === 'general'
        ? this.db.general
        : scope === 'detailed'
          ? this.db.detailed
          : this.db.transit;
    return String(arr.length + 1);
  }

  public isRowNoTaken(scope: 'general' | 'detailed' | 'transit', rowNo: string, excludeId?: string): boolean {
    const target = normKey(rowNo);
    if (!target) return false;
    const arr =
      scope === 'general'
        ? this.db.general
        : scope === 'detailed'
          ? this.db.detailed
          : this.db.transit;
    return arr.some((item) => normKey(item.rowNo) === target && item.id !== excludeId);
  }

  public isMapnaMinutesTaken(minutesNo: string, excludeId?: string): boolean {
    const clean = normalizeDigits(normKey(minutesNo)).toLowerCase();
    if (!clean) return false;
    return this.db.general.some(
      (g) => g.id !== excludeId && normalizeDigits(normKey(g.mapnaEntryMinutesNo)).toLowerCase() === clean,
    );
  }

  public isDetailedItemNoTaken(
    shipmentNo: string,
    packageNo: string,
    itemNo: string,
    excludeId?: string,
  ): boolean {
    const pk = normKey(shipmentNo).toLowerCase();
    const pkg = normKey(packageNo).toLowerCase();
    const itm = normalizeDigits(normKey(itemNo)).toLowerCase();
    if (!pk || !itm) return false;
    return this.db.detailed.some(
      (d) =>
        d.id !== excludeId &&
        normKey(d.shipmentNo).toLowerCase() === pk &&
        normKey(d.packageNo).toLowerCase() === pkg &&
        normalizeDigits(normKey(d.itemNo)).toLowerCase() === itm,
    );
  }

  public getNextSuggestedItemNo(shipmentNo: string, packageNo: string): string {
    const pk = normKey(shipmentNo).toLowerCase();
    const pkg = normKey(packageNo).toLowerCase();
    if (!pk) return '1';
    const matching = this.db.detailed.filter(
      (d) =>
        normKey(d.shipmentNo).toLowerCase() === pk &&
        (!pkg || normKey(d.packageNo).toLowerCase() === pkg),
    );
    if (matching.length === 0) return '1';
    let maxNum = 0;
    for (const d of matching) {
      const parsed = Number(normalizeDigits(normKey(d.itemNo)));
      if (Number.isInteger(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
    let candidate = maxNum + 1;
    while (this.isDetailedItemNoTaken(shipmentNo, packageNo, String(candidate))) {
      candidate += 1;
    }
    return String(candidate);
  }

  public getGeneralSharedInfo(packingNo: string, packageNo?: string) {
    const pk = normKey(packingNo);
    if (!pk) return null;
    const list = this.generalByPacking.get(pk) || [];
    if (list.length === 0) return null;
    const pkg = normKey(packageNo);
    const exact = pkg ? list.find((g) => normKey(g.packageNo) === pkg) : undefined;
    const match = exact || list[0];
    return {
      arrivalDate: match.arrivalDate,
      supplier: match.supplier,
      dispatchLocation: match.dispatchLocation,
      island: match.island,
      system: match.system,
      subSystem: match.subSystem,
      unit: match.unit,
      itemDescription: match.itemDescription,
      packageNo: match.packageNo,
      packagesForPacking: Array.from(new Set(list.map((g) => normKey(g.packageNo)).filter(Boolean))),
    };
  }

  public getLastDetailedDefaults() {
    const latest = this.db.detailed[0];
    if (!latest) return { shipmentNo: '', packageNo: '', countingUnit: 'PC' };
    return {
      shipmentNo: normKey(latest.shipmentNo),
      packageNo: normKey(latest.packageNo),
      countingUnit: normKey(latest.countingUnit) || 'PC',
    };
  }

  public addAudit(params: {
    user: UserAccount;
    action: string;
    scope: AuditLogEntry['scope'];
    targetId: string;
    summary: string;
  }): void {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      userId: params.user.id,
      username: params.user.username,
      userFullName: params.user.fullName,
      role: params.user.role,
      action: params.action,
      scope: params.scope,
      targetId: params.targetId,
      summary: params.summary,
    };
    this.db.auditLogs.unshift(entry);
    if (this.db.auditLogs.length > 50000) {
      this.db.auditLogs.length = 50000;
    }
  }

  /**
   * Automatically updates `در راه` (In-Transit) status to `رسیده` when a Packing List No.
   * is entered in `جنرال` or `دیتیل`.
   */
  public syncTransitArrival(packingNo: string, user: UserAccount): number {
    const pk = normKey(packingNo);
    if (!pk) return 0;
    const matches = this.transitByPacking.get(pk);
    if (!matches || matches.length === 0) return 0;

    let updated = 0;
    const now = new Date().toISOString();
    for (const t of matches) {
      const st = normKey(t.overallStatus);
      if (st !== 'رسیده' && st.toLowerCase() !== 'arrived') {
        t.overallStatus = 'رسیده';
        t.linkedGeneralPackingNo = pk;
        t.updatedAt = now;
        updated += 1;
      }
    }
    if (updated > 0) {
      this.addAudit({
        user,
        action: 'AUTO_TRANSIT_ARRIVED',
        scope: 'transit',
        targetId: pk,
        summary: `تغییر خودکار وضعیت کلی ${updated} ردیف در راه برای پکینگ لیست ${pk} به «رسیده»`,
      });
    }
    return updated;
  }

  public getDetailedComputedList(): DetailedComputed[] {
    return this.db.detailed.map(computeDetailedEntry);
  }

  public exportSnapshot(): DatabaseSnapshot {
    return {
      version: this.db.version,
      exportedAt: new Date().toISOString(),
      general: this.db.general,
      detailed: this.db.detailed,
      transit: this.db.transit,
      packingMeta: this.db.packingMeta,
      categories: this.db.categories,
      auditLogs: this.db.auditLogs,
      trash: this.db.trash,
      opiInvitations: this.db.opiInvitations,
      gcvDocuments: this.db.gcvDocuments,
      mivDocuments: this.db.mivDocuments,
    };
  }

  public restoreSnapshot(snapshot: DatabaseSnapshot, user: UserAccount): void {
    this.db.general = Array.isArray(snapshot.general) ? snapshot.general : [];
    this.db.detailed = Array.isArray(snapshot.detailed) ? snapshot.detailed : [];
    this.db.transit = Array.isArray(snapshot.transit) ? snapshot.transit : [];
    this.db.packingMeta = snapshot.packingMeta || {};
    this.db.categories = {
      ...createEmptyCategories(),
      ...(snapshot.categories || {}),
    };
    if (Array.isArray(snapshot.auditLogs)) {
      this.db.auditLogs = snapshot.auditLogs;
    }
    this.db.trash = Array.isArray(snapshot.trash) ? snapshot.trash : [];
    this.db.opiInvitations = Array.isArray(snapshot.opiInvitations) ? snapshot.opiInvitations : [];
    this.db.gcvDocuments = Array.isArray(snapshot.gcvDocuments) ? snapshot.gcvDocuments : [];
    this.db.mivDocuments = Array.isArray(snapshot.mivDocuments) ? snapshot.mivDocuments : [];
    this.rebuildIndexes();
    this.addAudit({
      user,
      action: 'RESTORE_SNAPSHOT',
      scope: 'backup',
      targetId: 'database',
      summary: `بازیابی کامل نسخه پشتیبان (${this.db.general.length} جنرال، ${this.db.detailed.length} دیتیل، ${this.db.transit.length} در راه)`,
    });
    this.saveImmediate();
  }
}

export const store = new SamaanStore();
