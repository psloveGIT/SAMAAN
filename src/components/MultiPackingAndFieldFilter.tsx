import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type {
  CustomFieldFilter,
  FilterConnector,
  FilterFieldOption,
  FilterOperator,
} from '../shared/customFilters.ts';
import { getTranslations } from '../shared/i18n.ts';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';

interface MultiPackingAndFieldFilterProps {
  fields: FilterFieldOption[];
  selectedPackings: string[];
  onChangePackings: (next: string[]) => void;
  customFilters: CustomFieldFilter[];
  onChangeCustomFilters: (next: CustomFieldFilter[]) => void;
  compact?: boolean;
}

export const MultiPackingAndFieldFilter: React.FC<MultiPackingAndFieldFilterProps> = ({
  fields,
  selectedPackings,
  onChangePackings,
  customFilters,
  onChangeCustomFilters,
  compact = false,
}) => {
  const { prefs, activeProjectId } = useApp();
  const isFa = prefs.language === 'fa';

  const [knownPackings, setKnownPackings] = useState<string[]>([]);
  const [packingPickerOpen, setPackingPickerOpen] = useState(false);
  const [packingSearch, setPackingSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Draft condition state
  const [draftConnector, setDraftConnector] = useState<FilterConnector>('AND');
  const [draftField, setDraftField] = useState<string>(fields[0]?.key || '');
  const [draftOp, setDraftOp] = useState<FilterOperator>('contains');
  const [draftVal, setDraftVal] = useState('');

  useEffect(() => {
    apiRequest<{ packings: string[] }>('/api/general/lookup')
      .then((res) => setKnownPackings(res.packings || []))
      .catch(() => setKnownPackings([]));
  }, [activeProjectId]);

  useEffect(() => {
    if (fields.length > 0 && !fields.some((f) => f.key === draftField)) {
      setDraftField(fields[0].key);
    }
  }, [fields, draftField]);

  const filteredPackings = useMemo(() => {
    const q = packingSearch.trim().toLowerCase();
    if (!q) return knownPackings;
    return knownPackings.filter((p) => p.toLowerCase().includes(q));
  }, [knownPackings, packingSearch]);

  const togglePacking = (pk: string) => {
    if (selectedPackings.includes(pk)) {
      onChangePackings(selectedPackings.filter((x) => x !== pk));
    } else {
      onChangePackings([...selectedPackings, pk]);
    }
  };

  const addCustomFilter = () => {
    if (!draftField) return;
    if (draftOp !== 'not_empty' && !draftVal.trim()) return;
    const next: CustomFieldFilter = {
      field: draftField,
      op: draftOp,
      value: draftOp === 'not_empty' ? '' : draftVal.trim(),
      connector: customFilters.length > 0 ? draftConnector : 'AND',
    };
    onChangeCustomFilters([...customFilters, next]);
    setDraftVal('');
  };

  const removeCustomFilter = (idx: number) => {
    const remaining = customFilters.filter((_, i) => i !== idx);
    if (remaining.length > 0 && remaining[0].connector !== 'AND') {
      remaining[0] = { ...remaining[0], connector: 'AND' };
    }
    onChangeCustomFilters(remaining);
  };

  const toggleConditionConnector = (idx: number) => {
    onChangeCustomFilters(
      customFilters.map((f, i) =>
        i === idx
          ? { ...f, connector: f.connector === 'OR' ? 'AND' : 'OR' }
          : f,
      ),
    );
  };

  const opLabel = (op: FilterOperator) => {
    if (isFa) {
      if (op === 'contains') return 'شامل';
      if (op === 'equals') return 'مساوی با';
      if (op === 'not_equals') return 'مخالف با';
      if (op === 'gte') return 'بزرگتر یا مساوی (>=)';
      if (op === 'lte') return 'کوچکتر یا مساوی (<=)';
      return 'خالی نباشد';
    }
    if (op === 'contains') return 'Contains';
    if (op === 'equals') return 'Equals';
    if (op === 'not_equals') return 'Not equals';
    if (op === 'gte') return '>=';
    if (op === 'lte') return '<=';
    return 'Is not empty';
  };

  const t = getTranslations(prefs.language);

  const formatFilterValue = (field: string, value: string) => {
    if (field === 'itemCategory') {
      if (!value || value === 'standard') return t.itemCategories.standard;
      if (value === 'special_tools') return t.itemCategories.special_tools;
      if (value === 'chemicals') return t.itemCategories.chemicals;
      if (value === 'spare_parts') return t.itemCategories.spare_parts;
    }
    return value;
  };

  const fieldLabel = (key: string) => {
    const f = fields.find((x) => x.key === key);
    return f ? (isFa ? f.labelFa : f.labelEn) : key;
  };

  const activeCount = selectedPackings.length + customFilters.length;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Multi-packing selector dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPackingPickerOpen((v) => !v)}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors ${
              selectedPackings.length > 0
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <span>
              {isFa
                ? `انتخاب چند پکینگ لیست${selectedPackings.length > 0 ? ` (${selectedPackings.length.toLocaleString('fa-IR')})` : ''}`
                : `Select Packing Lists${selectedPackings.length > 0 ? ` (${selectedPackings.length})` : ''}`}
            </span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {packingPickerOpen && (
            <div className="absolute z-40 mt-1.5 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl p-2.5 space-y-2">
              <SearchInputWithClear
                value={packingSearch}
                onChange={setPackingSearch}
                placeholder={isFa ? 'جستجوی شماره پکینگ...' : 'Filter packing numbers...'}
              />

              <div className="flex items-center justify-between text-[11px] px-1">
                <button
                  type="button"
                  onClick={() => onChangePackings(filteredPackings)}
                  className="text-[var(--accent-primary)] hover:underline"
                >
                  {isFa ? 'انتخاب همه نمایش‌داده‌شده‌ها' : 'Select shown'}
                </button>
                <button
                  type="button"
                  onClick={() => onChangePackings([])}
                  className="text-[var(--text-muted)] hover:text-[var(--status-danger)]"
                >
                  {isFa ? 'پاک کردن انتخاب‌ها' : 'Clear all'}
                </button>
              </div>

              <div className="max-h-52 overflow-y-auto divide-y divide-[var(--border-subtle)]/60">
                {filteredPackings.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                    {isFa ? 'پکینگ لیستی یافت نشد.' : 'No packing lists found.'}
                  </div>
                ) : (
                  filteredPackings.map((pk) => {
                    const checked = selectedPackings.includes(pk);
                    return (
                      <button
                        key={pk}
                        type="button"
                        onClick={() => togglePacking(pk)}
                        className="w-full px-2 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-[var(--bg-subtle)] rounded-md text-start"
                      >
                        <span className="font-medium tabular-nums" dir="ltr">
                          {pk}
                        </span>
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--accent-contrast)]'
                              : 'border-[var(--border-strong)]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="pt-1 border-t border-[var(--border-subtle)] flex justify-end">
                <button
                  type="button"
                  onClick={() => setPackingPickerOpen(false)}
                  className="h-7 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-medium"
                >
                  {isFa ? 'تأیید و بستن' : 'Done'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toggle custom field filter builder */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
            expanded || customFilters.length > 0
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>
            {isFa
              ? `فیلتر فیلدهای دلخواه (و / یا)${customFilters.length > 0 ? ` (${customFilters.length.toLocaleString('fa-IR')})` : ''}`
              : `Custom Field Filters (AND/OR)${customFilters.length > 0 ? ` (${customFilters.length})` : ''}`}
          </span>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              onChangePackings([]);
              onChangeCustomFilters([]);
            }}
            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--bg-subtle)] flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>{isFa ? 'حذف فیلترهای چندگانه' : 'Reset multi-filters'}</span>
          </button>
        )}
      </div>

      {/* Selected packing chips & active custom filters */}
      {(selectedPackings.length > 0 || customFilters.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedPackings.map((pk) => (
            <span
              key={pk}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-medium"
            >
              <span className="tabular-nums" dir="ltr">
                {pk}
              </span>
              <button
                type="button"
                onClick={() => togglePacking(pk)}
                className="hover:text-[var(--status-danger)]"
                aria-label={`Remove ${pk}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {customFilters.map((f, idx) => (
            <React.Fragment key={`${f.field}-${f.op}-${idx}`}>
              {idx > 0 && (
                <button
                  type="button"
                  onClick={() => toggleConditionConnector(idx)}
                  title={isFa ? 'تغییر عملگر منطقی (و / یا)' : 'Toggle AND / OR'}
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-bold transition-colors ${
                    f.connector === 'OR'
                      ? 'border-[var(--status-warning)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                      : 'border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  }`}
                >
                  {f.connector === 'OR' ? (isFa ? 'یا (OR)' : 'OR') : isFa ? 'و (AND)' : 'AND'}
                </button>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs">
                <span className="font-semibold text-[var(--text-primary)]">{fieldLabel(f.field)}</span>
                <span className="text-[var(--text-muted)]">{opLabel(f.op)}</span>
                {f.op !== 'not_empty' && (
                  <span className="font-semibold text-[var(--accent-primary)] bidi-plaintext">
                    {formatFilterValue(f.field, f.value)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeCustomFilter(idx)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-danger)]"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Custom field filter builder row */}
      {(expanded || !compact) && expanded && (
        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-end gap-2">
          {customFilters.length > 0 && (
            <div className="min-w-[110px]">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'رابط منطقی' : 'Logic'}
              </label>
              <select
                value={draftConnector}
                onChange={(e) => setDraftConnector(e.target.value as FilterConnector)}
                className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold"
              >
                <option value="AND">{isFa ? 'و (AND)' : 'AND'}</option>
                <option value="OR">{isFa ? 'یا (OR)' : 'OR'}</option>
              </select>
            </div>
          )}

          <div className="min-w-[170px] flex-1">
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              {isFa ? 'فیلد مورد نظر' : 'Field'}
            </label>
            <select
              value={draftField}
              onChange={(e) => {
                const nextField = e.target.value;
                setDraftField(nextField);
                if (nextField === 'itemCategory') {
                  setDraftOp('equals');
                  setDraftVal('standard');
                } else if (draftField === 'itemCategory') {
                  setDraftVal('');
                }
              }}
              className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {isFa ? f.labelFa : f.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
              {isFa ? 'شرط فیلتر' : 'Condition'}
            </label>
            <select
              value={draftOp}
              onChange={(e) => setDraftOp(e.target.value as FilterOperator)}
              className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
            >
              <option value="contains">{opLabel('contains')}</option>
              <option value="equals">{opLabel('equals')}</option>
              <option value="not_equals">{opLabel('not_equals')}</option>
              <option value="gte">{opLabel('gte')}</option>
              <option value="lte">{opLabel('lte')}</option>
              <option value="not_empty">{opLabel('not_empty')}</option>
            </select>
          </div>

          {draftOp !== 'not_empty' && (
            <div className="min-w-[180px] flex-1">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                {isFa ? 'مقدار' : 'Value'}
              </label>
              {draftField === 'itemCategory' ? (
                <select
                  value={draftVal || 'standard'}
                  onChange={(e) => setDraftVal(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                >
                  <option value="standard">{t.itemCategories.standard}</option>
                  <option value="special_tools">{t.itemCategories.special_tools}</option>
                  <option value="chemicals">{t.itemCategories.chemicals}</option>
                  <option value="spare_parts">{t.itemCategories.spare_parts}</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={draftVal}
                  onChange={(e) => setDraftVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomFilter();
                    }
                  }}
                  placeholder={isFa ? 'مقدار فیلتر را وارد کنید...' : 'Enter filter value...'}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                />
              )}
            </div>
          )}

          <button
            type="button"
            onClick={addCustomFilter}
            className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isFa ? 'افزودن شرط' : 'Add Filter'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
