import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import {
  formatIranianPlate,
  IRANIAN_PLATE_LETTERS,
  parseIranianPlate,
  sanitizeDigitsOnly,
} from '../shared/validation.ts';

interface IranianPlateInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

/**
 * Structured Iranian license plate input in left-to-right plate order:
 * e.g.  [60] ایران [985] [ع] [14]  =>  "60 ایران 985 ع 14"
 */
export const IranianPlateInput: React.FC<IranianPlateInputProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const parts = parseIranianPlate(value);

  const updatePart = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    onChange(formatIranianPlate(next));
  };

  return (
    <div className="space-y-1">
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
          onChange={(e) => updatePart({ left2: sanitizeDigitsOnly(e.target.value).slice(0, 2) })}
          placeholder="60"
          aria-label="Plate region 2 digits"
          className="w-10 h-full text-center text-sm font-bold tabular-nums bg-transparent focus:outline-none border-e border-[var(--border-subtle)]"
        />

        <span className="px-1.5 text-[10px] font-semibold text-[var(--text-secondary)] shrink-0 select-none">
          ایران
        </span>

        <input
          type="text"
          inputMode="numeric"
          maxLength={3}
          disabled={disabled}
          value={parts.mid3}
          onChange={(e) => updatePart({ mid3: sanitizeDigitsOnly(e.target.value).slice(0, 3) })}
          placeholder="985"
          aria-label="Plate 3 digits"
          className="w-12 h-full text-center text-sm font-bold tabular-nums bg-transparent focus:outline-none border-s border-e border-[var(--border-subtle)]"
        />

        <select
          disabled={disabled}
          value={parts.letter}
          onChange={(e) => updatePart({ letter: e.target.value })}
          aria-label="Plate Persian letter"
          className="h-full px-1 text-sm font-bold bg-transparent focus:outline-none text-center cursor-pointer"
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
          type="text"
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          value={parts.right2}
          onChange={(e) => updatePart({ right2: sanitizeDigitsOnly(e.target.value).slice(0, 2) })}
          placeholder="14"
          aria-label="Plate right 2 digits"
          className="w-10 h-full text-center text-sm font-bold tabular-nums bg-transparent focus:outline-none border-s border-[var(--border-subtle)]"
        />

        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            title={isFa ? 'پاک کردن پلاک' : 'Clear plate'}
            className="px-1.5 h-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="text-[10px] text-[var(--text-muted)] tabular-nums" dir="ltr">
        {isFa ? 'فرمت پلاک از چپ به راست: ۶۰ ایران ۹۸۵ ع ۱۴' : 'LTR plate format: 60 ایران 985 ع 14'}
      </div>
    </div>
  );
};
