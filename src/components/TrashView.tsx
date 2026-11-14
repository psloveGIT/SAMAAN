import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { TrashRecord } from '../shared/types.ts';

interface TrashViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatTimestamp, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<TrashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeTarget, setPurgeTarget] = useState<TrashRecord | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TrashRecord | null>(null);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...(scope ? { scope } : {}),
        ...(q ? { q } : {}),
      });
      const res = await apiRequest<{ items: TrashRecord[] }>(`/api/trash?${params.toString()}`);
      setItems(res.items || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [scope, q, notify]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash, refreshSignal]);

  const executeRestore = async (item: TrashRecord, restoreDetailed: boolean) => {
    try {
      const qs = restoreDetailed ? '?restoreDetailed=true' : '?restoreDetailed=false';
      const res = await apiRequest<{ restoredDetailedCount?: number }>(
        `/api/trash/${item.id}/restore${qs}`,
        { method: 'POST' },
      );
      const restoredDetailedCount = res.restoredDetailedCount || 0;
      notify(
        'success',
        isFa
          ? restoredDetailedCount > 0
            ? `ردیف «${item.targetLabel}» و ${restoredDetailedCount.toLocaleString('fa-IR')} ردیف جزئیات مرتبط بازیابی شدند.`
            : `ردیف «${item.targetLabel}» با موفقیت بازیابی شد.`
          : restoredDetailedCount > 0
            ? `Restored "${item.targetLabel}" along with ${restoredDetailedCount} linked Detailed rows.`
            : `Restored "${item.targetLabel}".`,
      );
      setRestoreTarget(null);
      triggerAutoSnapshot(`Restore ${item.targetLabel}`);
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleRestoreClick = (item: TrashRecord) => {
    if (item.scope === 'general' && (item.linkedTrashDetailedCount || 0) > 0) {
      setRestoreTarget(item);
      return;
    }
    executeRestore(item, false);
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    try {
      await apiRequest(`/api/trash/${purgeTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa ? 'ردیف به‌صورت دائمی حذف شد.' : 'Record permanently deleted.',
      );
      setPurgeTarget(null);
      onDataChanged();
      loadTrash();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const scopeLabel = (s: TrashRecord['scope']) => {
    if (s === 'general') return t.nav.general;
    if (s === 'detailed') return t.nav.detailed;
    return t.nav.transit;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center flex-1 min-w-[240px] h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isFa ? 'جستجو در موارد حذف‌شده...' : 'Search deleted items...'}
            className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
          />
        </div>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
        >
          <option value="">{isFa ? 'همه بخش‌ها' : 'All Scopes'}</option>
          <option value="general">{t.nav.general}</option>
          <option value="detailed">{t.nav.detailed}</option>
          <option value="transit">{t.nav.transit}</option>
        </select>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 text-start">{isFa ? 'بخش' : 'Scope'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'مشخصات ردیف' : 'Record'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'حذف توسط' : 'Deleted By'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'زمان حذف' : 'Deleted At'}</th>
                <th className="py-2.5 px-4 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[var(--text-muted)]">
                    {isFa ? 'سطل بازیافت خالی است.' : 'Recycle Bin is empty.'}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const linkedCount = item.linkedTrashDetailedCount || 0;
                  return (
                    <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[11px] font-semibold">
                          {scopeLabel(item.scope)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold tabular-nums bidi-plaintext">{item.targetLabel}</div>
                        {item.scope === 'general' && linkedCount > 0 && (
                          <div className="text-[11px] text-[var(--accent-primary)] mt-0.5 tabular-nums">
                            {isFa
                              ? `دارای ${linkedCount.toLocaleString('fa-IR')} ردیف جزئیات حذف‌شده مرتبط`
                              : `${linkedCount} linked Detailed row(s) in Recycle Bin`}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">{item.deletedBy}</td>
                      <td className="py-2.5 px-4 tabular-nums text-[var(--text-muted)]">
                        {formatTimestamp(item.deletedAt)}
                      </td>
                      <td className="py-2.5 px-4 text-end">
                        {canEdit && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRestoreClick(item)}
                              className="h-7 px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90 text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{t.controls.restore}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPurgeTarget(item)}
                              className="h-7 px-2.5 rounded-lg hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-[11px] font-medium inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{t.controls.purge}</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cascade Restore Confirmation Modal */}
      {restoreTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setRestoreTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {isFa ? 'بازیابی ردیف‌های جزئیات مرتبط' : 'Restore Linked Detailed Rows?'}
              </h3>
              <button type="button" onClick={() => setRestoreTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `برای ردیف «${restoreTarget.targetLabel}»، تعداد ${(restoreTarget.linkedTrashDetailedCount || 0).toLocaleString('fa-IR')} ردیف جزئیات (دیتیل) مرتبط نیز در سطل بازیافت وجود دارد. آیا ردیف‌های جزئیات مرتبط هم هم‌زمان بازیابی شوند؟`
                : `Record "${restoreTarget.targetLabel}" has ${restoreTarget.linkedTrashDetailedCount || 0} linked Detailed row(s) in the Recycle Bin. Do you want to restore those linked Detailed rows as well?`}
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                onClick={() => executeRestore(restoreTarget, false)}
                className="h-9 px-4 rounded-lg border border-[var(--border-strong)] text-xs font-semibold hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'فقط بازیابی ثبت کلی' : 'Restore General Only'}
              </button>
              <button
                type="button"
                onClick={() => executeRestore(restoreTarget, true)}
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازیابی کلی + جزئیات مرتبط' : 'Restore General & Linked Detailed'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Purge Confirmation */}
      {purgeTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPurgeTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--status-danger)]">
                {isFa ? 'حذف دائمی و غیرقابل بازگشت' : 'Permanent Delete'}
              </h3>
              <button type="button" onClick={() => setPurgeTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isFa
                ? `آیا از حذف دائمی «${purgeTarget.targetLabel}» مطمئن هستید؟ این عمل قابل بازگردانی نخواهد بود.`
                : `Permanently delete "${purgeTarget.targetLabel}"? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPurgeTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmPurge}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold"
              >
                {t.controls.purge}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
