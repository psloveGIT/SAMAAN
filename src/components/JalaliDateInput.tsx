import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  formatIsoDate,
  getTodayIso,
  GREGORIAN_MONTH_NAMES_EN,
  GREGORIAN_MONTH_NAMES_FA,
  gregorianMonthLength,
  isIsoDateString,
  JALALI_MONTH_NAMES_EN,
  JALALI_MONTH_NAMES_FA,
  jalaliMonthLength,
  parseFlexibleDateToIso,
  toGregorian,
  toJalali,
} from '../shared/jalali.ts';

interface JalaliDateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const JalaliDateInput: React.FC<JalaliDateInputProps> = ({
  value,
  onChange,
  placeholder,
  label,
  className = '',
  disabled = false,
}) => {
  const { prefs } = useApp();
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const todayIso = getTodayIso();
  const activeIso = isIsoDateString(value) ? value : parseFlexibleDateToIso(value, prefs.calendar);

  const getInitialView = () => {
    const base = isIsoDateString(activeIso) ? activeIso : todayIso;
    const [gy, gm, gd] = base.split('-').map(Number);
    if (prefs.calendar === 'jalali') {
      const j = toJalali(gy, gm, gd);
      return { year: j.jy, month: j.jm };
    }
    return { year: gy, month: gm };
  };

  const [view, setView] = useState(getInitialView);

  useEffect(() => {
    setTextInput(value ? formatIsoDate(value, prefs.calendar) : '');
  }, [value, prefs.calendar]);

  useEffect(() => {
    if (open) {
      setView(getInitialView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefs.calendar]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const monthNames =
    prefs.calendar === 'jalali'
      ? prefs.language === 'fa'
        ? JALALI_MONTH_NAMES_FA
        : JALALI_MONTH_NAMES_EN
      : prefs.language === 'fa'
        ? GREGORIAN_MONTH_NAMES_FA
        : GREGORIAN_MONTH_NAMES_EN;

  const daysInMonth =
    prefs.calendar === 'jalali'
      ? jalaliMonthLength(view.year, view.month)
      : gregorianMonthLength(view.year, view.month);

  // First day of month weekday (Saturday=0 in Persian week, Sunday=0 in Gregorian)
  const firstDayOffset = (() => {
    let gYear = view.year;
    let gMonth = view.month;
    let gDay = 1;
    if (prefs.calendar === 'jalali') {
      const g = toGregorian(view.year, view.month, 1);
      gYear = g.gy;
      gMonth = g.gm;
      gDay = g.gd;
    }
    const jsDay = new Date(gYear, gMonth - 1, gDay).getDay(); // 0=Sun..6=Sat
    return prefs.calendar === 'jalali' ? (jsDay + 1) % 7 : jsDay;
  })();

  const weekdayHeaders =
    prefs.calendar === 'jalali'
      ? prefs.language === 'fa'
        ? ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']
        : ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr']
      : prefs.language === 'fa'
        ? ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']
        : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      return { year: y, month: m };
    });
  };

  const selectDay = (day: number) => {
    let iso = '';
    if (prefs.calendar === 'jalali') {
      const g = toGregorian(view.year, view.month, day);
      iso = `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
    } else {
      iso = `${view.year}-${pad2(view.month)}-${pad2(day)}`;
    }
    onChange(iso);
    setOpen(false);
  };

  const selectedParts = (() => {
    if (!isIsoDateString(activeIso)) return null;
    const [gy, gm, gd] = activeIso.split('-').map(Number);
    if (prefs.calendar === 'jalali') {
      const j = toJalali(gy, gm, gd);
      return { year: j.jy, month: j.jm, day: j.jd };
    }
    return { year: gy, month: gm, day: gd };
  })();

  const handleManualBlur = () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const parsed = parseFlexibleDateToIso(trimmed, prefs.calendar);
    if (isIsoDateString(parsed)) {
      onChange(parsed);
      setTextInput(formatIsoDate(parsed, prefs.calendar));
    } else {
      onChange(trimmed);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] focus-within:border-[var(--accent-primary)] transition-colors overflow-hidden">
        <input
          type="text"
          dir="ltr"
          disabled={disabled}
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onBlur={handleManualBlur}
          placeholder={placeholder || (prefs.calendar === 'jalali' ? '1404/01/15' : '2025-04-04')}
          className={`flex-1 min-w-0 h-full px-2.5 bg-transparent text-xs sm:text-sm tabular-nums text-[var(--text-primary)] focus:outline-none ${
            prefs.language === 'fa' ? 'text-right' : 'text-left'
          }`}
        />
        <div className="flex items-center gap-0.5 pe-1 shrink-0">
          {textInput && !disabled && (
            <button
              type="button"
              onClick={() => {
                setTextInput('');
                onChange('');
              }}
              aria-label="Clear date"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle calendar"
            className="p-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)] transition-colors"
          >
            <CalendarIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute end-0 z-50 mt-1.5 w-72 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            >
              {prefs.language === 'fa' ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
              {monthNames[view.month - 1]} {view.year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            >
              {prefs.language === 'fa' ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--text-muted)] mb-1">
            {weekdayHeaders.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected =
                selectedParts?.year === view.year &&
                selectedParts?.month === view.month &&
                selectedParts?.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`h-8 rounded-lg text-xs font-medium tabular-nums transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
              className="px-2.5 py-1 rounded-md text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] font-medium"
            >
              {prefs.language === 'fa' ? 'امروز' : 'Today'}
            </button>
            <span className="text-[11px] text-[var(--text-muted)]">
              {prefs.calendar === 'jalali'
                ? prefs.language === 'fa'
                  ? 'تقویم شمسی'
                  : 'Jalali'
                : prefs.language === 'fa'
                  ? 'تقویم میلادی'
                  : 'Gregorian'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
