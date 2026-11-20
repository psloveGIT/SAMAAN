import type { DatabaseSnapshot } from '../shared/types.ts';

const DB_NAME = 'samaan_offline_backups';
const DB_VERSION = 2;
const PAYLOAD_STORE = 'snapshots';
const META_STORE = 'snapshot_meta';
const MAX_SNAPSHOTS_PER_PROJECT = 12;

export interface LocalBackupSnapshotMeta {
  id: string;
  projectId?: string;
  createdAt: string;
  label: string;
  trigger: 'auto' | 'manual';
  byteSize: number;
  counts: {
    general: number;
    detailed: number;
    transit: number;
  };
}

export interface LocalBackupSnapshotRecord extends LocalBackupSnapshotMeta {
  snapshot: DatabaseSnapshot;
}

interface StoredPayloadRecord {
  id: string;
  projectId?: string;
  snapshot: DatabaseSnapshot;
  // Legacy v1 fields may exist on records created before DB_VERSION 2
  createdAt?: string;
  label?: string;
  trigger?: 'auto' | 'manual';
  byteSize?: number;
  counts?: {
    general: number;
    detailed: number;
    transit: number;
  };
}

let migrationChecked = false;

function openBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAYLOAD_STORE)) {
        db.createObjectStore(PAYLOAD_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        const metaStore = db.createObjectStore(META_STORE, { keyPath: 'id' });
        metaStore.createIndex('by_project', 'projectId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function estimateSnapshotBytes(snapshot: DatabaseSnapshot): number {
  const totalRows =
    (snapshot.general?.length || 0) +
    (snapshot.detailed?.length || 0) +
    (snapshot.transit?.length || 0);
  // Avoid blocking JSON.stringify on very large snapshots (e.g., 20k+ rows or base64 images)
  if (totalRows <= 1500) {
    try {
      return new Blob([JSON.stringify(snapshot)]).size;
    } catch {
      // fall through to fast estimation
    }
  }
  let bytes = 4096;
  bytes += (snapshot.general?.length || 0) * 620;
  bytes += (snapshot.detailed?.length || 0) * 950;
  bytes += (snapshot.transit?.length || 0) * 480;
  bytes += (snapshot.trash?.length || 0) * 700;
  bytes += (snapshot.auditLogs?.length || 0) * 260;
  if (Array.isArray(snapshot.detailed)) {
    for (const d of snapshot.detailed) {
      if (d.itemImage) bytes += d.itemImage.length;
    }
  }
  return bytes;
}

/**
 * One-time migration for legacy v1 records (which stored full snapshot blobs inline without snapshot_meta).
 * Runs via cursor (one record at a time) ONLY when snapshot_meta is empty and snapshots is non-empty.
 */
async function ensureV1MetadataMigrated(db: IDBDatabase): Promise<void> {
  if (migrationChecked) return;
  migrationChecked = true;
  if (!db.objectStoreNames.contains(META_STORE) || !db.objectStoreNames.contains(PAYLOAD_STORE)) {
    return;
  }

  const [metaCount, payloadCount] = await new Promise<[number, number]>((resolve, reject) => {
    const tx = db.transaction([META_STORE, PAYLOAD_STORE], 'readonly');
    const r1 = tx.objectStore(META_STORE).count();
    const r2 = tx.objectStore(PAYLOAD_STORE).count();
    let c1 = 0;
    let c2 = 0;
    r1.onsuccess = () => {
      c1 = r1.result;
    };
    r2.onsuccess = () => {
      c2 = r2.result;
    };
    tx.oncomplete = () => resolve([c1, c2]);
    tx.onerror = () => reject(tx.error);
  });

  if (metaCount > 0 || payloadCount === 0) return;

  // Migrate metadata record-by-record via cursor so we never hold all blobs in RAM simultaneously
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, PAYLOAD_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    const payloadStore = tx.objectStore(PAYLOAD_STORE);
    const cursorReq = payloadStore.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      const val = cursor.value as StoredPayloadRecord;
      const snap = val.snapshot;
      const meta: LocalBackupSnapshotMeta = {
        id: val.id,
        projectId: (val.projectId || 'default').trim() || 'default',
        createdAt: val.createdAt || new Date().toISOString(),
        label: val.label || 'اسنپ‌شات ذخیره‌شده',
        trigger: val.trigger === 'manual' ? 'manual' : 'auto',
        byteSize: typeof val.byteSize === 'number' ? val.byteSize : snap ? estimateSnapshotBytes(snap) : 0,
        counts: val.counts || {
          general: snap?.general?.length || 0,
          detailed: snap?.detailed?.length || 0,
          transit: snap?.transit?.length || 0,
        },
      };
      metaStore.put(meta);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listMetaFromOpenDb(
  db: IDBDatabase,
  projectId?: string,
): Promise<LocalBackupSnapshotMeta[]> {
  await ensureV1MetadataMigrated(db);
  const rows = await new Promise<LocalBackupSnapshotMeta[]>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const st = tx.objectStore(META_STORE);
    let req: IDBRequest<LocalBackupSnapshotMeta[]>;
    if (projectId && st.indexNames.contains('by_project')) {
      req = st.index('by_project').getAll(projectId);
    } else {
      req = st.getAll();
    }
    req.onsuccess = () => resolve((req.result as LocalBackupSnapshotMeta[]) || []);
    req.onerror = () => reject(req.error);
  });

  const filtered = projectId
    ? rows.filter((r) => (r.projectId || 'default') === projectId)
    : rows;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSnapshotToIndexedDb(
  snapshot: DatabaseSnapshot,
  trigger: 'auto' | 'manual',
  label: string,
  projectId = 'default',
): Promise<LocalBackupSnapshotMeta> {
  const cleanProjectId = (projectId || 'default').trim() || 'default';
  const db = await openBackupDb();
  try {
    await ensureV1MetadataMigrated(db);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const meta: LocalBackupSnapshotMeta = {
      id,
      projectId: cleanProjectId,
      createdAt: new Date().toISOString(),
      label,
      trigger,
      byteSize: estimateSnapshotBytes(snapshot),
      counts: {
        general: snapshot.general?.length || 0,
        detailed: snapshot.detailed?.length || 0,
        transit: snapshot.transit?.length || 0,
      },
    };
    const payload: StoredPayloadRecord = {
      id,
      projectId: cleanProjectId,
      snapshot,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, PAYLOAD_STORE], 'readwrite');
      tx.objectStore(META_STORE).put(meta);
      tx.objectStore(PAYLOAD_STORE).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Retain at most MAX_SNAPSHOTS_PER_PROJECT latest snapshots per project using ONLY lightweight metadata
    const projectList = await listMetaFromOpenDb(db, cleanProjectId);
    if (projectList.length > MAX_SNAPSHOTS_PER_PROJECT) {
      const toDelete = projectList.slice(MAX_SNAPSHOTS_PER_PROJECT);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([META_STORE, PAYLOAD_STORE], 'readwrite');
        const metaStore = tx.objectStore(META_STORE);
        const payloadStore = tx.objectStore(PAYLOAD_STORE);
        for (const old of toDelete) {
          metaStore.delete(old.id);
          payloadStore.delete(old.id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    return meta;
  } finally {
    db.close();
  }
}

/**
 * Instant metadata-only listing of saved IndexedDB snapshots (~2-10ms, zero full-blob deserialization).
 */
export async function listIndexedDbSnapshots(projectId?: string): Promise<LocalBackupSnapshotMeta[]> {
  const db = await openBackupDb();
  try {
    return await listMetaFromOpenDb(db, projectId);
  } finally {
    db.close();
  }
}

/**
 * Lazily fetches the full DatabaseSnapshot payload for a single snapshot ID on demand (Restore / Download JSON).
 */
export async function getIndexedDbSnapshotPayload(id: string): Promise<DatabaseSnapshot | null> {
  const db = await openBackupDb();
  try {
    const rec = await new Promise<StoredPayloadRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(PAYLOAD_STORE, 'readonly');
      const req = tx.objectStore(PAYLOAD_STORE).get(id);
      req.onsuccess = () => resolve(req.result as StoredPayloadRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    return rec?.snapshot ?? null;
  } finally {
    db.close();
  }
}

export async function deleteIndexedDbSnapshot(id: string): Promise<void> {
  const db = await openBackupDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([META_STORE, PAYLOAD_STORE], 'readwrite');
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(PAYLOAD_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function downloadJsonBackup(snapshot: DatabaseSnapshot, filenamePrefix = 'samaan-backup'): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
