import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { CategoryGroupKey, CategoryStore } from '../shared/types.ts';

interface CategoriesPayload {
  categories: CategoryStore;
  counts: Record<CategoryGroupKey, Record<string, number>>;
}

interface CategoryManagerViewProps {
  refreshSignal: number;
  onCategoriesUpdated: () => void;
}

export const CategoryManagerView: React.FC<CategoryManagerViewProps> = ({
  refreshSignal,
  onCategoriesUpdated,
}) => {
  const { prefs, t, user, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const isAdmin = user?.role === 'admin';

  const groups: { key: CategoryGroupKey; label: string }[] = [
    { key: 'island', label: t.categories.island },
    { key: 'system', label: t.categories.system },
    { key: 'subSystem', label: t.categories.subSystem },
    { key: 'unit', label: t.categories.unit },
    { key: 'supplier', label: t.categories.supplier },
    { key: 'dispatchLocation', label: t.categories.dispatchLocation },
    { key: 'storageLocation', label: t.categories.storageLocation },
    { key: 'carrierContractor', label: t.categories.carrierContractor },
  ];

  const [activeGroup, setActiveGroup] = useState<CategoryGroupKey>('island');
  const [filterText, setFilterText] = useState('');
  const [newValue, setNewValue] = useState('');
  const [data, setData] = useState<CategoriesPayload | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiRequest<CategoriesPayload>('/api/categories');
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  }, [notify]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories, refreshSignal]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) return;
    try {
      await apiRequest(`/api/categories/${activeGroup}`, {
        method: 'POST',
        body: JSON.stringify({ value: newValue.trim() }),
      });
      setNewValue('');
      notify('success', isFa ? 'دسته‌بندی جدید اضافه شد.' : 'Category added.');
      onCategoriesUpdated();
      loadCategories();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    try {
      const res = await apiRequest<{ updatedCount: number }>(`/api/categories/${activeGroup}`, {
        method: 'PATCH',
        body: JSON.stringify({ oldValue: renameTarget, newValue: renameValue.trim() }),
      });
      notify(
        'success',
        isFa
          ? `تغییر نام/ادغام انجام شد (${res.updatedCount} رکورد به‌روزرسانی شد).`
          : `Renamed/merged (${res.updatedCount} records updated).`,
      );
      setRenameTarget(null);
      setRenameValue('');
      onCategoriesUpdated();
      loadCategories();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleDelete = async (val: string) => {
    try {
      await apiRequest(`/api/categories/${activeGroup}?value=${encodeURIComponent(val)}`, {
        method: 'DELETE',
      });
      notify('success', isFa ? 'مقدار حذف شد.' : 'Removed.');
      onCategoriesUpdated();
      loadCategories();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const currentValues = (data?.categories[activeGroup] || []).filter((v) =>
    v.toLowerCase().includes(filterText.trim().toLowerCase()),
  );
  const currentCounts = data?.counts[activeGroup] || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Group Selector */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1 h-fit">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => { setActiveGroup(g.key); setFilterText(''); }}
            className={`w-full px-3 py-2.5 rounded-lg text-start text-xs font-medium flex items-center justify-between transition-colors ${
              activeGroup === g.key
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <span>{g.label}</span>
            <span className="tabular-nums text-[11px] opacity-80">
              {(data?.categories[g.key] || []).length}
            </span>
          </button>
        ))}
      </div>

      {/* Category Values Manager */}
      <div className="lg:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-2.5" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={isFa ? 'فیلتر در مقادیر دسته‌بندی...' : 'Filter category values...'}
              className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            />
          </div>

          {canEdit && (
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={isFa ? 'نام مقدار جدید...' : 'New category value...'}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              />
              <button
                type="submit"
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.controls.add}</span>
              </button>
            </form>
          )}
        </div>

        <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
          {currentValues.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">{t.controls.noData}</div>
          ) : (
            currentValues.map((val) => (
              <div
                key={val}
                className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--bg-subtle)]/50"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{val}</span>
                  {(currentCounts[val] || 0) > 0 && (
                    <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      ({currentCounts[val]} {isFa ? 'رکورد' : 'records'})
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setRenameTarget(val); setRenameValue(val); }}
                      title={isFa ? 'تغییر نام یا ادغام' : 'Rename / Merge'}
                      className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDelete(val)}
                        className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rename / Merge Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {isFa ? 'تغییر نام / ادغام دسته‌بندی' : 'Rename or Merge Category'}
              </h3>
              <button type="button" onClick={() => setRenameTarget(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isFa
                ? `تمامی رکوردهای دارای «${renameTarget}» به مقدار جدید منتقل می‌شوند.`
                : `All records using "${renameTarget}" will be updated to the new name.`}
            </p>
            <form onSubmit={handleRename} className="space-y-3">
              <input
                type="text"
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
