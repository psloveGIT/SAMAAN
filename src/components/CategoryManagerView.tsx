import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Lock, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { formatDisplayNumber } from '../shared/jalali.ts';
import { DEFAULT_TRANSIT_STATUSES } from '../shared/normalizers.ts';
import type { CategoryGroupKey, CategoryStore } from '../shared/types.ts';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';

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
    { key: 'origin', label: t.categories.origin },
    { key: 'storageLocation', label: t.categories.storageLocation },
    { key: 'carrierContractor', label: t.categories.carrierContractor },
    { key: 'countingUnit', label: t.categories.countingUnit },
    { key: 'packageType', label: t.categories.packageType },
    { key: 'generalDescription', label: t.categories.generalDescription },
    { key: 'stocktakeStatus', label: t.categories.stocktakeStatus },
    { key: 'transitStatus', label: t.categories.transitStatus },
    { key: 'receiver', label: t.categories.receiver },
    { key: 'merStatus', label: t.categories.merStatus },
    { key: 'repStatus', label: t.categories.repStatus },
    { key: 'balanceStatus', label: t.categories.balanceStatus },
    { key: 'chemicalType', label: t.categories.chemicalType },
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
          ? `تغییر نام/ادغام انجام شد (${formatDisplayNumber(res.updatedCount, 'fa')} رکورد به‌روزرسانی شد).`
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
  const isProtectedTransitDefault = (val: string) =>
    activeGroup === 'transitStatus' && (DEFAULT_TRANSIT_STATUSES as readonly string[]).includes(val);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Group Selector */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-1 h-fit lg:max-h-[78vh] lg:overflow-y-auto">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => { setActiveGroup(g.key); setFilterText(''); }}
            className={`w-full px-3 py-2 rounded-lg text-start text-xs font-medium flex items-center justify-between transition-colors ${
              activeGroup === g.key
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <span>{g.label}</span>
            <span className="tabular-nums text-[11px] opacity-80">
              {formatDisplayNumber((data?.categories[g.key] || []).length, prefs.language)}
            </span>
          </button>
        ))}
      </div>

      {/* Category Values Manager */}
      <div className="lg:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        {activeGroup === 'transitStatus' && (
          <div className="rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)] px-3.5 py-2.5 text-xs text-[var(--text-primary)] leading-relaxed">
            {isFa
              ? 'سه وضعیت پیش‌فرض «در دست ارسال»، «در دست بازرسی» و «رسیده» به‌عنوان دسته‌های اصلی بخش در راه ثابت هستند و هنگام ورود فایل یا ثبت پکینگ، وضعیت‌ها به‌صورت خودکار به یکی از این سه دسته تبدیل می‌شوند. در صورت نیاز می‌توانید وضعیت‌های سفارشی جدیدی نیز در اینجا اضافه کنید.'
              : 'The 3 default statuses ("در دست ارسال", "در دست بازرسی", "رسیده") are core categories for In-Transit shipments and incoming records normalize into them automatically. You can add additional custom statuses here.'}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInputWithClear
            value={filterText}
            onChange={setFilterText}
            placeholder={isFa ? 'فیلتر در مقادیر دسته‌بندی...' : 'Filter category values...'}
            className="flex-1 min-w-[200px]"
            inputClassName="text-xs"
          />

          {canEdit && (
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <input
                type="text"
                dir={!newValue ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={isFa ? 'نام مقدار جدید...' : 'New category value...'}
                className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
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
            currentValues.map((val) => {
              const locked = isProtectedTransitDefault(val);
              return (
                <div
                  key={val}
                  className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--bg-subtle)]/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold">{val}</span>
                    {locked && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[10px] text-[var(--text-muted)]">
                        <Lock className="w-2.5 h-2.5" />
                        <span>{isFa ? 'پیش‌فرض سیستمی' : 'System Default'}</span>
                      </span>
                    )}
                    {(currentCounts[val] || 0) > 0 && (
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        ({formatDisplayNumber(currentCounts[val], prefs.language)} {isFa ? 'رکورد' : 'records'})
                      </span>
                    )}
                  </div>
                  {canEdit && !locked && (
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
              );
            })
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
                dir={!renameValue ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
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
