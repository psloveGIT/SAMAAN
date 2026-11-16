import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
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

export const IranianPlateInput: React.FC<IranianPlateInputProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';

  const [parts, setParts] = useState<IranianPlateParts>(() => parseIranianPlate(value));
  const lastEmittedRef = useRef<string>(value || '');

  const midRef = useRef<HTMLInputElement | null>(null);
  const letterRef = useRef<HTMLSelectElement | null>(null);
  const rightRef = useRef<HTMLInputElement | null>(null);

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

  const handleClear = () => {
    const empty: IranianPlateParts = { left2: '', mid3: '', letter: 'ع', right2: '' };
    setParts(empty);
    lastEmittedRef.current = '';
    onChange('');
  };

  const hasAnyValue = Boolean(parts.left2 || parts.mid3 || parts.right2 || value);

  return (
    <div
      dir="ltr"
      className="flex items-center h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden focus-within:border-[var(--accent-primary)]"
    >
      <div className="h-full px-1.5 bg-blue-700 text-white text-[9px] font-bold flex flex-col items-center justify-center leading-tight shrink-0 select-none">
        <span>IR</span>
        <span>IRAN</span>
      </div>

      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        value={parts.left2}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 2);
          commitParts({ ...parts, left2: val });
          if (val.length === 2) midRef.current?.focus();
        }}
        aria-label="Plate left 2 digits"
        className="w-12 min-w-[2.75rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-e border-[var(--border-subtle)]"
      />

      <span className="px-1.5 text-[11px] font-semibold text-[var(--text-secondary)] shrink-0 select-none">
        ایران
      </span>

      <input
        ref={midRef}
        type="text"
        inputMode="numeric"
        maxLength={3}
        disabled={disabled}
        value={parts.mid3}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 3);
          commitParts({ ...parts, mid3: val });
          if (val.length === 3) letterRef.current?.focus();
        }}
        aria-label="Plate middle 3 digits"
        className="w-14 min-w-[3.25rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-s border-e border-[var(--border-subtle)]"
      />

      <select
        ref={letterRef}
        disabled={disabled}
        value={parts.letter}
        onChange={(e) => {
          commitParts({ ...parts, letter: e.target.value });
          rightRef.current?.focus();
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

      <input
        ref={rightRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        value={parts.right2}
        onChange={(e) => {
          const val = sanitizeDigitsOnly(e.target.value).slice(0, 2);
          commitParts({ ...parts, right2: val });
        }}
        aria-label="Plate right 2 digits"
        className="w-12 min-w-[2.75rem] px-1 h-full text-center text-sm font-bold text-[var(--text-primary)] tabular-nums bg-transparent focus:outline-none border-s border-[var(--border-subtle)]"
      />

      {hasAnyValue && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          title={isFa ? 'پاک کردن پلاک' : 'Clear plate'}
          className="px-2 h-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
