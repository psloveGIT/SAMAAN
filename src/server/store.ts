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
  GeneralEntry,
  PackingStatusMeta,
  TransitEntry,
  UserAccount,
} from '../shared/types.ts';
import { computeDetailedEntry } from '../shared/formulas.ts';
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
    version: 1,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    users: [],
    general: [],
    detailed: [],
    transit: [],
    packingMeta: {},
    categories: createEmptyCategories(),
    auditLogs: [],
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
        version: parsed.version || 1,
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
    const existingSet =
      scope === 'general'
        ? this.generalRowNos
        : scope === 'detailed'
          ? this.detailedRowNos
          : this.transitRowNos;
    let maxNum = 0;
    for (const rn of existingSet) {
      const parsed = Number(rn);
      if (Number.isInteger(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
    let candidate = maxNum + 1;
    while (existingSet.has(String(candidate))) {
      candidate += 1;
    }
    return String(candidate);
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
