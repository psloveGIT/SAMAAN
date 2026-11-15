import React from 'react';
import { Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

interface SearchInputWithClearProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  dir?: 'rtl' | 'ltr' | 'auto';
}

export const SearchInputWithClear: React.FC<SearchInputWithClearProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  onKeyDown,
  autoFocus,
  dir,
}) => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const effectiveDir = dir ?? (!value ? (isFa ? 'rtl' : 'ltr') : 'auto');

  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-[var(--text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
      <input
        type="text"
        dir={effectiveDir}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`w-full h-9 ps-9 pe-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${inputClassName}`}
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          title={isFa ? 'پاک کردن جستجو' : 'Clear search'}
          aria-label={isFa ? 'پاک کردن جستجو' : 'Clear search'}
          className="absolute top-1/2 -translate-y-1/2 end-1.5 w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
