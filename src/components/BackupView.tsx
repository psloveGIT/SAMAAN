import React, { useCallback, useEffect, useState } from 'react';
import { Download, HardDrive, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import {
  deleteIndexedDbSnapshot,
  downloadJsonBackup,
  listIndexedDbSnapshots,
  saveSnapshotToIndexedDb,
} from '../lib/indexedDbBackup.ts';
import type { LocalBackupSnapshotRecord } from '../lib/indexedDbBackup.ts';
import type { DatabaseSnapshot } from '../shared/types.ts';

interface BackupViewProps {
  onRestored: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupView: React.FC<BackupViewProps> = ({ onRestored }) => {
  const { prefs, user, notify, formatTimestamp } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';

  const [snapshots, setSnapshots] = useState<LocalBackupSnapshotRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const list = await listIndexedDbSnapshots();
      setSnapshots(list);
    } catch {
      // IndexedDB unavailable
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const handleManualSnapshot = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      await saveSnapshotToIndexedDb(
        snapshot,
        'manual',
        isFa ? 'اسنپ‌شات دستی مدیر/کاربر' : 'Manual Snapshot',
      );
      notify('success', isFa ? 'نسخه پشتیبان در IndexedDB ذخیره شد.' : 'Snapshot saved to IndexedDB.');
      loadSnapshots();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadLiveJson = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      downloadJsonBackup(snapshot, 'samaan-full-backup');
      notify('success', isFa ? 'فایل پشتیبان دانلود شد.' : 'Backup file downloaded.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshot: DatabaseSnapshot) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await apiRequest('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      notify('success', isFa ? 'پایگاه داده از نسخه پشتیبان بازیابی شد.' : 'Database restored.');
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DatabaseSnapshot;
      await handleRestoreSnapshot(parsed);
    } catch {
      notify('error', isFa ? 'فایل پشتیبان معتبر نیست.' : 'Invalid backup JSON file.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold">
              {isFa ? 'پشتیبان‌گیری خودکار آفلاین (IndexedDB) و خروجی دستی' : 'Local IndexedDB Snapshots & Manual Export'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {isFa
                ? 'اسنپ‌شات‌ها به‌صورت خودکار پس از عملیات‌های مهم و هر ۱۰ دقیقه در حافظه آفلاین مرورگر ذخیره می‌شوند.'
                : 'Snapshots are saved automatically to local browser IndexedDB after major actions and every 10 minutes.'}
            </p>
            {isStaticFallbackMode() && (
              <p className="text-[11px] font-medium text-[var(--accent-primary)] mt-1.5">
                {isFa
                  ? 'در حال اجرا در حالت استاتیک مرورگر (GitHub Pages): برای انتقال یا ارسال داده‌های تست به سرور اصلی، فایل پشتیبان JSON را دانلود کنید.'
                  : 'Running in Static Browser Mode (GitHub Pages): Download a JSON backup to share or transfer test data to your local server.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleManualSnapshot}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isFa ? 'ثبت اسنپ‌شات فوری' : 'Save Snapshot Now'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadLiveJson}
              className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'دانلود فایل پشتیبان (JSON)' : 'Export JSON Backup'}</span>
            </button>
            {isAdmin && (
              <label className="h-9 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازیابی از فایل' : 'Restore from File'}</span>
                <input type="file" accept=".json,application/json" onChange={handleUploadRestore} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Saved Snapshots List */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center gap-2 text-sm font-bold">
          <HardDrive className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>{isFa ? 'نسخه‌های ذخیره شده در IndexedDB مرورگر' : 'Saved IndexedDB Snapshots'}</span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            {isFa ? 'هنوز اسنپ‌شاتی در IndexedDB ذخیره نشده است.' : 'No IndexedDB snapshots stored yet.'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold flex items-center gap-2">
                    <span>{snap.label}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      ({snap.trigger === 'auto' ? (isFa ? 'خودکار' : 'Auto') : (isFa ? 'دستی' : 'Manual')})
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {formatTimestamp(snap.createdAt)} · {formatBytes(snap.byteSize)} ·{' '}
                    {isFa
                      ? `جنرال: ${snap.counts.general} · دیتیل: ${snap.counts.detailed} · در راه: ${snap.counts.transit}`
                      : `General: ${snap.counts.general} · Detailed: ${snap.counts.detailed} · Transit: ${snap.counts.transit}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadJsonBackup(snap.snapshot, 'samaan-snapshot')}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleRestoreSnapshot(snap.snapshot)}
                      className="h-8 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بازیابی' : 'Restore'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteIndexedDbSnapshot(snap.id);
                      loadSnapshots();
                    }}
                    className="p-1.5 rounded-lg text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
