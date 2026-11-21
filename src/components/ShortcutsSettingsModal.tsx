import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Keyboard,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  DEFAULT_SHORTCUT_MAP,
  SHORTCUT_DEFINITIONS,
  eventToCombo,
  findShortcutConflict,
  isValidCustomShortcutCombo,
  splitComboKeys,
  type ShortcutActionId,
  type ShortcutCategory,
  type ShortcutDefinition,
} from '../shared/shortcuts.ts';

interface ShortcutsSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: ShortcutCategory[] = ['editing', 'table', 'navigation', 'workspace'];

export const ShortcutsSettingsModal: React.FC<ShortcutsSettingsModalProps> = ({ open, onClose }) => {
  const { prefs, shortcuts, setShortcut, resetShortcut, resetAllShortcuts, notify } = useApp();
  const isFa = prefs.language === 'fa';

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ShortcutCategory | 'all'>('all');
  const [capturingId, setCapturingId] = useState<ShortcutActionId | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{
    actionId: ShortcutActionId;
    combo: string;
    conflictDef: ShortcutDefinition;
  } | null>(null);

  // Inform global keyboard listener while recording a custom binding
  useEffect(() => {
    const win = window as unknown as { __samaanCapturingShortcut?: boolean };
    win.__samaanCapturingShortcut = Boolean(open && capturingId);
    return () => {
      win.__samaanCapturingShortcut = false;
    };
  }, [open, capturingId]);

  useEffect(() => {
    if (!open) {
      setCapturingId(null);
      setCaptureError(null);
      setPendingConflict(null);
    }
  }, [open]);

  // Live key capture handler
  useEffect(() => {
    if (!open || !capturingId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setCapturingId(null);
        setCaptureError(null);
        setPendingConflict(null);
        return;
      }

      const combo = eventToCombo(e);
      if (!combo) return; // Only modifier pressed so far

      if (!isValidCustomShortcutCombo(combo)) {
        setCaptureError(
          isFa
            ? 'لطفاً از ترکیب Ctrl یا Alt همراه با یک کلید (یا کلیدهای F1 تا F12) استفاده کنید.'
            : 'Please combine Ctrl or Alt with a key (or use F1–F12).',
        );
        return;
      }

      const conflict = findShortcutConflict(capturingId, combo, shortcuts);
      if (conflict) {
        setCaptureError(null);
        setPendingConflict({
          actionId: capturingId,
          combo,
          conflictDef: conflict,
        });
        setCapturingId(null);
        return;
      }

      setShortcut(capturingId, combo);
      setCapturingId(null);
      setCaptureError(null);
      setPendingConflict(null);
      notify(
        'success',
        isFa ? `کلید میانبر جدید (${combo}) ذخیره شد.` : `Shortcut updated to ${combo}.`,
      );
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, capturingId, shortcuts, setShortcut, notify, isFa]);

  const categoryLabels: Record<ShortcutCategory | 'all', string> = useMemo(
    () => ({
      all: isFa ? 'همه کلیدها' : 'All Shortcuts',
      editing: isFa ? 'ویرایش و بازگردانی' : 'Editing & Undo/Redo',
      table: isFa ? 'جست‌وجو و عملیات جدول' : 'Search & Table Actions',
      navigation: isFa ? 'ناوبری سریع بخش‌ها' : 'Quick Navigation',
      workspace: isFa ? 'ابزارها و محیط کار' : 'Workspace & Tools',
    }),
    [isFa],
  );

  const customizedCount = useMemo(
    () =>
      SHORTCUT_DEFINITIONS.filter((def) => shortcuts[def.id] !== DEFAULT_SHORTCUT_MAP[def.id]).length,
    [shortcuts],
  );

  const filteredDefs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SHORTCUT_DEFINITIONS.filter((def) => {
      if (activeCategory !== 'all' && def.category !== activeCategory) return false;
      if (!q) return true;
      const currentCombo = (shortcuts[def.id] || '').toLowerCase();
      return (
        def.labelFa.toLowerCase().includes(q) ||
        def.labelEn.toLowerCase().includes(q) ||
        def.descriptionFa.toLowerCase().includes(q) ||
        def.descriptionEn.toLowerCase().includes(q) ||
        currentCombo.includes(q)
      );
    });
  }, [query, activeCategory, shortcuts]);

  const groupedDefs = useMemo(() => {
    const groups: Array<{ cat: ShortcutCategory; items: ShortcutDefinition[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const items = filteredDefs.filter((d) => d.category === cat);
      if (items.length > 0) groups.push({ cat, items });
    }
    return groups;
  }, [filteredDefs]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !capturingId) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isFa ? 'تنظیمات کلیدهای میانبر' : 'Keyboard Shortcuts Settings'}
        className="w-full max-w-3xl max-h-[88dvh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Keyboard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
                {isFa ? 'تنظیمات کلیدهای میانبر صفحه‌کلید' : 'Keyboard Shortcuts Settings'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {isFa
                  ? 'کلیدهای میانبر را مشاهده کرده یا بر اساس عادت کاری خود شخصی‌سازی کنید'
                  : 'View or customize keyboard shortcuts to match your workflow'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isFa ? 'بستن' : 'Close'}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Persian/English Keyboard Info Banner + Filter Bar */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 space-y-2.5 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] bg-[var(--accent-soft)]/50 border border-[var(--accent-primary)]/20 rounded-lg px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
            <span>
              {isFa
                ? 'تمامی کلیدهای میانبر در هر دو حالت کیبورد فارسی و انگلیسی بدون نیاز به تغییر زبان ویندوز عمل می‌کنند (مثلاً Ctrl+Z حتی با کیبورد فارسی).'
                : 'All shortcuts are physical-key aware and work seamlessly on both Persian and English keyboard layouts.'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isFa ? 'جست‌وجوی عملیات یا کلید میانبر...' : 'Search action or key combo...'}
                className="w-full h-9 ps-9 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {(['all', ...CATEGORY_ORDER] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`h-8 px-2.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    activeCategory === cat
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {categoryLabels[cat]}
                </button>
              ))}
            </div>
          </div>

          {captureError && (
            <div className="flex items-center gap-2 text-xs text-[var(--status-danger)] bg-[var(--status-danger)]/10 border border-[var(--status-danger)]/30 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{captureError}</span>
            </div>
          )}

          {pendingConflict && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--status-warning)]/12 border border-[var(--status-warning)]/40 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2 text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0" />
                <span>
                  {isFa
                    ? `کلید «${pendingConflict.combo}» هم‌اکنون برای «${pendingConflict.conflictDef.labelFa}» تنظیم شده است. آیا می‌خواهید جایگزین و جابه‌جا شود؟`
                    : `"${pendingConflict.combo}" is already assigned to "${pendingConflict.conflictDef.labelEn}". Swap bindings?`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShortcut(
                      pendingConflict.actionId,
                      pendingConflict.combo,
                      pendingConflict.conflictDef.id,
                    );
                    notify(
                      'success',
                      isFa
                        ? `کلید میانبر (${pendingConflict.combo}) جابه‌جا و ذخیره شد.`
                        : `Swapped shortcut to ${pendingConflict.combo}.`,
                    );
                    setPendingConflict(null);
                  }}
                  className="h-7 px-2.5 rounded-md bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-[11px] font-semibold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isFa ? 'جایگزینی و جابه‌جایی' : 'Swap & Assign'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConflict(null)}
                  className="h-7 px-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)]"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Shortcut List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {groupedDefs.map(({ cat, items }) => (
            <section key={cat} className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--accent-primary)] pb-1 border-b border-[var(--border-subtle)]">
                {categoryLabels[cat]}
              </h4>
              <div className="divide-y divide-[var(--border-subtle)]/60 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/40 overflow-hidden">
                {items.map((def) => {
                  const currentCombo = shortcuts[def.id] || '';
                  const isCustom = currentCombo !== DEFAULT_SHORTCUT_MAP[def.id];
                  const isCapturing = capturingId === def.id;
                  const keys = splitComboKeys(currentCombo);

                  return (
                    <div
                      key={def.id}
                      data-shortcut-row={def.id}
                      className={`px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                        isCapturing ? 'bg-[var(--accent-soft)]/70' : 'hover:bg-[var(--bg-subtle)]/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {isFa ? def.labelFa : def.labelEn}
                          </span>
                          {isCustom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold">
                              {isFa ? 'سفارشی' : 'Custom'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {isFa ? def.descriptionFa : def.descriptionEn}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isCapturing ? (
                          <div className="flex items-center gap-2">
                            <span className="h-7 px-3 rounded-lg border border-dashed border-[var(--accent-primary)] bg-[var(--bg-surface)] text-[11px] font-semibold text-[var(--accent-primary)] flex items-center animate-pulse">
                              {isFa
                                ? 'ترکیب کلید جدید را فشار دهید... (Esc لغو)'
                                : 'Press new key combo... (Esc to cancel)'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setCapturingId(null);
                                setCaptureError(null);
                              }}
                              className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                            >
                              {isFa ? 'لغو' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <>
                            <div
                              dir="ltr"
                              className="flex items-center gap-1 min-w-[84px] justify-end"
                            >
                              {keys.length > 0 ? (
                                keys.map((k, idx) => (
                                  <React.Fragment key={`${k}-${idx}`}>
                                    {idx > 0 && (
                                      <span className="text-[10px] text-[var(--text-muted)]">+</span>
                                    )}
                                    <kbd className="px-2 py-0.5 min-w-[26px] text-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[11px] font-mono font-semibold text-[var(--text-primary)] shadow-[0_1px_0_var(--border-subtle)]">
                                      {k}
                                    </kbd>
                                  </React.Fragment>
                                ))
                              ) : (
                                <span className="text-[11px] text-[var(--text-muted)]">
                                  {isFa ? 'غیرفعال' : 'Unbound'}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              data-edit-shortcut={def.id}
                              onClick={() => {
                                setCaptureError(null);
                                setPendingConflict(null);
                                setCapturingId(def.id);
                              }}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[11px] font-medium transition-colors"
                            >
                              {isFa ? 'تغییر کلید' : 'Change'}
                            </button>

                            <div className="w-7 shrink-0 flex items-center justify-center">
                              {isCustom && (
                                <button
                                  type="button"
                                  data-reset-shortcut={def.id}
                                  onClick={() => {
                                    resetShortcut(def.id);
                                    notify(
                                      'info',
                                      isFa
                                        ? `کلید «${def.labelFa}» به پیش‌فرض (${DEFAULT_SHORTCUT_MAP[def.id]}) بازگردانده شد.`
                                        : `Reset "${def.labelEn}" to ${DEFAULT_SHORTCUT_MAP[def.id]}.`,
                                    );
                                  }}
                                  title={
                                    isFa
                                      ? `بازنشانی به پیش‌فرض (${DEFAULT_SHORTCUT_MAP[def.id]})`
                                      : `Reset to default (${DEFAULT_SHORTCUT_MAP[def.id]})`
                                  }
                                  className="h-7 w-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {groupedDefs.length === 0 && (
            <div className="py-10 text-center text-xs text-[var(--text-muted)]">
              {isFa ? 'هیچ کلید میانبری مطابق جست‌وجو یافت نشد.' : 'No matching shortcuts found.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={customizedCount === 0}
            onClick={() => {
              resetAllShortcuts();
              setPendingConflict(null);
              setCaptureError(null);
              notify(
                'info',
                isFa
                  ? 'تمامی کلیدهای میانبر به حالت پیش‌فرض سامانه بازگردانده شدند.'
                  : 'All shortcuts reset to system defaults.',
              );
            }}
            className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 disabled:pointer-events-none text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {isFa
                ? `بازگردانی همه به حالت پیش‌فرض${customizedCount > 0 ? ` (${customizedCount})` : ''}`
                : `Reset All to Defaults${customizedCount > 0 ? ` (${customizedCount})` : ''}`}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold transition-colors"
          >
            {isFa ? 'بستن' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
