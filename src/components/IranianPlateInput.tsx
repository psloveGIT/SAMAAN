import React, { useEffect, useRef, useState } from 'react';
import {
  formatIranianPlate,
  IRANIAN_PLATE_LETTERS,
  type IranianPlateParts,
  parseIranianPlate,
  sanitizeDigitsOnly,
} from '../shared/validation.ts';

interface IranianPlateInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

/**
 * Iranian license plate input with natural right-to-left typing & Tab order:
 * 1. right2 (2 digits before Persian letter) → auto-advances to letter
 * 2. letter (Persian plate letter) → auto-advances to mid3
 * 3. mid3 (3 digits after letter) → auto-advances to left2
 * 4. left2 (final 2 Iran/province digits) → auto-advances to next form field
 * Visual appearance remains authentic LTR: [IR] [left2] ایران [mid3] [letter] [right2]
 * via flex-row-reverse so DOM order matches right-to-left focus & Tab sequence.
 */
export const IranianPlateInput: React.FC<IranianPlateInputProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [parts, setParts] = useState<IranianPlateParts>(() => parseIranianPlate(value));
  const lastEmittedRef = useRef<string>(value || '');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLInputElement | null>(null);
  const letterRef = useRef<HTMLSelectElement | null>(null);
  const midRef = useRef<HTMLInputElement | null>(null);
  const leftRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const incoming = value || '';
    if (incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      setParts(parseIranianPlate(incoming));
    }
  }, [value]);

  const commitParts = (nextParts: IranianPlateParts) => {
    setParts(nextParts);
    const formatted = formatIranianPlate(nextParts);
    lastEmittedRef.current = formatted;
    onChange(formatted);
  };

  const advanceAfterPlate = () => {
    const root = containerRef.current;
    if (!root) return;
    const scope = root.closest('form') || document.body;
    const focusables = Array.from(
      scope.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      ),
    ).filter((el) => el.offsetParent !== null);
    const lastIdx = leftRef.current ? focusables.indexOf(leftRef.current) : -1;
    if (lastIdx >= 0 && lastIdx + 1 < focusables.length) {
      focusables[lastIdx + 1]?.focus();
    } else {
      leftRef.current?.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      dir="ltr"
      data-testid="iranian-plate-input"
      className="flex flex-row-reverse items-center h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden focus-within:border-[var(--accent-primary)]"
    >
      {/* 1. Rightmost 2 digits (first in RTL typing & Tab order) */}
      <input
        ref={rightRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        data-testid="plate-right2"
        value={parts.right2}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 2);
          commitParts({ ...parts, right2: val });
          if (val.length === 2) letterRef.current?.focus();
        }}
        aria-label="Plate right 2 digits"
        className="flex-1 min-w-[2.5rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-s border-[var(--border-subtle)]"
      />

      {/* 2. Persian letter (second in RTL typing & Tab order) */}
      <select
        ref={letterRef}
        disabled={disabled}
        data-testid="plate-letter"
        value={parts.letter}
        onChange={(e) => {
          commitParts({ ...parts, letter: e.target.value });
          midRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace') {
            e.preventDefault();
            rightRef.current?.focus();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            midRef.current?.focus();
          }
        }}
        aria-label="Plate Persian letter"
        className="h-full px-1.5 text-sm font-bold text-[var(--text-primary)] bg-transparent focus:outline-none text-center cursor-pointer"
      >
        {!IRANIAN_PLATE_LETTERS.includes(parts.letter as (typeof IRANIAN_PLATE_LETTERS)[number]) && (
          <option value={parts.letter}>{parts.letter}</option>
        )}
        {IRANIAN_PLATE_LETTERS.map((ltr) => (
          <option key={ltr} value={ltr}>
            {ltr}
          </option>
        ))}
      </select>

      {/* 3. Middle 3 digits (third in RTL typing & Tab order) */}
      <input
        ref={midRef}
        type="text"
        inputMode="numeric"
        maxLength={3}
        disabled={disabled}
        data-testid="plate-mid3"
        value={parts.mid3}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 3);
          commitParts({ ...parts, mid3: val });
          if (val.length === 3) leftRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && parts.mid3.length === 0) {
            letterRef.current?.focus();
          }
        }}
        aria-label="Plate middle 3 digits"
        className="flex-[1.3] min-w-[3.1rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-s border-e border-[var(--border-subtle)]"
      />

      {/* Iran separator label */}
      <span className="px-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shrink-0 select-none">
        ایران
      </span>

      {/* 4. Leftmost 2 Iran/province digits (fourth & final in RTL typing & Tab order) */}
      <input
        ref={leftRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        data-testid="plate-left2"
        value={parts.left2}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 2);
          commitParts({ ...parts, left2: val });
          if (val.length === 2) {
            advanceAfterPlate();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && parts.left2.length === 0) {
            midRef.current?.focus();
          }
        }}
        aria-label="Plate left 2 digits"
        className="flex-1 min-w-[2.5rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-e border-[var(--border-subtle)]"
      />

      {/* Far-left IR badge */}
      <div className="h-full px-1.5 bg-blue-700 text-white text-[9px] font-bold flex flex-col items-center justify-center leading-tight shrink-0 select-none">
        <span>IR</span>
        <span>IRAN</span>
      </div>
    </div>
  );
};
