import React from 'react';
import { History, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

export type OperationalViewMode = 'create' | 'history';

export interface OperationalViewModeTabsProps {
  mode?: OperationalViewMode;
  viewMode?: OperationalViewMode;
  onChange: (mode: OperationalViewMode) => void;
  historyCount: number;
  canEdit?: boolean;
  canCreate?: boolean;
  isFa?: boolean;
  isEditing?: boolean;
  createLabelFa?: string;
  createLabelEn?: string;
  historyLabelFa?: string;
  historyLabelEn?: string;
  testIdPrefix?: string;
}

/**
 * Standardized Form / History mode switcher shared across ALL current and future
 * operational forms so users always have a consistent button to switch to form history.
 */
export const OperationalViewModeTabs: React.FC<OperationalViewModeTabsProps> = ({
  mode,
  viewMode,
  onChange,
  historyCount,
  canEdit,
  canCreate,
  isFa: isFaProp,
  isEditing = false,
  createLabelFa,
  createLabelEn,
  historyLabelFa = 'سابقه فرم‌ها',
  historyLabelEn = 'Form History',
  testIdPrefix = 'form',
}) => {
  const { prefs } = useApp();
  const isFa = isFaProp ?? prefs.language === 'fa';
  const activeMode: OperationalViewMode = mode ?? viewMode ?? 'create';
  const allowCreate = canEdit ?? canCreate ?? true;
  const resolvedCreateFa = createLabelFa ?? (isEditing ? 'ویرایش فرم' : 'ثبت فرم جدید');
  const resolvedCreateEn = createLabelEn ?? (isEditing ? 'Edit Form' : 'New Form');

  return (
    <div
      role="tablist"
      aria-label={isFa ? 'تغییر نمای فرم و سابقه' : 'Switch between form and history'}
      className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] shrink-0"
    >
      {allowCreate && (
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'create'}
          data-testid={`${testIdPrefix}-tab-create`}
          onClick={() => onChange('create')}
          className={`h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeMode === 'create'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isFa ? resolvedCreateFa : resolvedCreateEn}</span>
        </button>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={activeMode === 'history'}
        data-testid={`${testIdPrefix}-tab-history`}
        onClick={() => onChange('history')}
        className={`h-8 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
          activeMode === 'history'
            ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <History className="w-3.5 h-3.5" />
        <span className="tabular-nums">
          {isFa ? `${historyLabelFa} (${historyCount})` : `${historyLabelEn} (${historyCount})`}
        </span>
      </button>
    </div>
  );
};
