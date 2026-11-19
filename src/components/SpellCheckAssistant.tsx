import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookPlus, Check, SpellCheck2, Sparkles, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  addWordToCustomDictionary,
  applyAllSpellCorrections,
  applySpellCorrection,
  checkTextSpelling,
  loadCustomDictionary,
} from '../shared/spellCheck.ts';
import type { SpellIssue } from '../shared/spellCheck.ts';

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

const IGNORED_INPUT_TYPES = new Set([
  'password',
  'number',
  'date',
  'datetime-local',
  'time',
  'email',
  'url',
  'tel',
  'hidden',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
  'submit',
  'button',
]);

function isSpellCheckableTarget(el: EventTarget | null): el is EditableEl {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled && el.dataset.noSpellcheck !== 'true';
  }
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (IGNORED_INPUT_TYPES.has(type)) return false;
    return !el.readOnly && !el.disabled && el.dataset.noSpellcheck !== 'true';
  }
  return false;
}

/**
 * Sets value on a controlled React input/textarea and triggers React's onChange synthetic event.
 */
function setNativeInputValue(el: EditableEl, nextValue: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(el, nextValue);
  } else {
    el.value = nextValue;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const SpellCheckAssistant: React.FC = () => {
  const { prefs, notify } = useApp();
  const isFa = prefs.language === 'fa';
  const enabled = prefs.spellCheck !== false;

  const activeElRef = useRef<EditableEl | null>(null);
  const timerRef = useRef<number | null>(null);
  const [issues, setIssues] = useState<SpellIssue[]>([]);
  const [dismissedValue, setDismissedValue] = useState<string>('');
  const [customDictVersion, setCustomDictVersion] = useState(0);

  const runCheck = useCallback((el: EditableEl | null) => {
    if (!el || !enabled || !document.contains(el)) {
      setIssues([]);
      return;
    }
    const text = el.value || '';
    if (text.trim().length < 2) {
      setIssues([]);
      return;
    }
    const dict = loadCustomDictionary();
    const found = checkTextSpelling(text, dict);
    setIssues(found.slice(0, 8));
  }, [enabled]);

  // Apply native spellcheck attribute globally when preference toggles
  useEffect(() => {
    const applyAttr = () => {
      document.documentElement.setAttribute('spellcheck', enabled ? 'true' : 'false');
      document.querySelectorAll<EditableEl>('input, textarea').forEach((el) => {
        if (isSpellCheckableTarget(el)) {
          el.spellcheck = enabled;
        }
      });
    };
    applyAttr();
    if (!enabled) {
      setIssues([]);
      activeElRef.current = null;
    } else if (activeElRef.current) {
      runCheck(activeElRef.current);
    }
  }, [enabled, runCheck]);

  // Listen to focus/input across the app
  useEffect(() => {
    if (!enabled) return;

    const scheduleCheck = (el: EditableEl) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        runCheck(el);
      }, 180);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isSpellCheckableTarget(e.target)) {
        const el = e.target;
        el.spellcheck = true;
        activeElRef.current = el;
        setDismissedValue('');
        scheduleCheck(el);
      }
    };

    const onInput = (e: Event) => {
      if (isSpellCheckableTarget(e.target)) {
        const el = e.target;
        activeElRef.current = el;
        setDismissedValue('');
        scheduleCheck(el);
      }
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('input', onInput, true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [enabled, runCheck, customDictVersion]);

  const handleApplyOne = (issue: SpellIssue, replacement: string) => {
    const el = activeElRef.current;
    if (!el || !document.contains(el)) return;
    const next = applySpellCorrection(el.value, issue, replacement);
    setNativeInputValue(el, next);
    el.focus();
    runCheck(el);
  };

  const handleApplyAll = () => {
    const el = activeElRef.current;
    if (!el || !document.contains(el) || issues.length === 0) return;
    const next = applyAllSpellCorrections(el.value, issues);
    setNativeInputValue(el, next);
    el.focus();
    runCheck(el);
  };

  const handleAddToDict = (word: string) => {
    addWordToCustomDictionary(word);
    setCustomDictVersion((v) => v + 1);
    notify(
      'info',
      isFa ? `واژه «${word}» به واژه‌نامه شخصی افزوده شد.` : `Added "${word}" to custom dictionary.`,
    );
    if (activeElRef.current) {
      runCheck(activeElRef.current);
    }
  };

  const activeVal = activeElRef.current?.value || '';
  if (!enabled || issues.length === 0 || (dismissedValue && dismissedValue === activeVal)) {
    return null;
  }

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      onMouseDown={(e) => {
        // Keep focus on the active input when clicking suggestions
        e.preventDefault();
      }}
      className="fixed bottom-4 start-4 z-[65] w-[min(92vw,420px)] rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--bg-surface)]/95 backdrop-blur-md shadow-2xl p-3 space-y-2.5 print:hidden"
    >
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-primary)]">
          <SpellCheck2 className="w-4 h-4 shrink-0" />
          <span>{isFa ? 'پیشنهاد تصحیح املایی' : 'Spell Check Suggestions'}</span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[10px] tabular-nums">
            {issues.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {issues.length > 1 && (
            <button
              type="button"
              onClick={handleApplyAll}
              className="h-6 px-2 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-[10px] font-semibold inline-flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>{isFa ? 'اصلاح همه' : 'Fix All'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissedValue(activeVal)}
            title={isFa ? 'بستن موقت' : 'Dismiss'}
            className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pe-0.5">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-[var(--status-danger)] line-through decoration-dotted bidi-plaintext">
                {issue.word}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{isFa ? '←' : '→'}</span>
              <div className="flex flex-wrap items-center gap-1">
                {issue.suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => handleApplyOne(issue, sug)}
                    className="h-6 px-2 rounded-md border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)] text-[var(--accent-primary)] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors bidi-plaintext"
                  >
                    <Check className="w-3 h-3 shrink-0" />
                    <span>{sug}</span>
                  </button>
                ))}
              </div>
            </div>

            {issue.reason === 'spelling' && (
              <button
                type="button"
                onClick={() => handleAddToDict(issue.word)}
                title={isFa ? 'افزودن به واژه‌نامه شخصی' : 'Add to Dictionary'}
                className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] shrink-0"
              >
                <BookPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
