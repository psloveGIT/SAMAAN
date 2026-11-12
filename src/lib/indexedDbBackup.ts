import type { DatabaseSnapshot } from '../shared/types.ts';

const DB_NAME = 'samaan_offline_backups';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

export interface LocalBackupSnapshotRecord {
  id: string;
  createdAt: string;
  label: string;
  trigger: 'auto' | 'manual';
  byteSize: number;
  counts: {
    general: number;
    detailed: number;
    transit: number;
  };
  snapshot: DatabaseSnapshot;
}

function openBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSnapshotToIndexedDb(
  snapshot: DatabaseSnapshot,
  trigger: 'auto' | 'manual',
  label: string,
): Promise<LocalBackupSnapshotRecord> {
  const db = await openBackupDb();
  const serialized = JSON.stringify(snapshot);
  const record: LocalBackupSnapshotRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    label,
    trigger,
    byteSize: new Blob([serialized]).size,
    counts: {
      general: snapshot.general.length,
      detailed: snapshot.detailed.length,
      transit: snapshot.transit.length,
    },
    snapshot,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const st = tx.objectStore(STORE_NAME);
    st.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Retain at most 12 latest snapshots so IndexedDB stays fast and bounded
  const all = await listIndexedDbSnapshots();
  if (all.length > 12) {
    const toDelete = all.slice(12);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const st = tx.objectStore(STORE_NAME);
      for (const old of toDelete) {
        st.delete(old.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  db.close();
  return record;
}

export async function listIndexedDbSnapshots(): Promise<LocalBackupSnapshotRecord[]> {
  const db = await openBackupDb();
  const rows = await new Promise<LocalBackupSnapshotRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const st = tx.objectStore(STORE_NAME);
    const req = st.getAll();
    req.onsuccess = () => resolve((req.result as LocalBackupSnapshotRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteIndexedDbSnapshot(id: string): Promise<void> {
  const db = await openBackupDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
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
