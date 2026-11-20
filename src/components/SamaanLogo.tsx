import React from 'react';
import { useApp } from '../context/AppContext.tsx';

export type LogoSize = 'sm' | 'md' | 'lg';

interface SamaanLogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

const SIZE_MAP: Record<LogoSize, { box: string; title: string; sub: string }> = {
  sm: { box: 'w-8 h-8', title: 'text-sm', sub: 'text-[10px]' },
  md: { box: 'w-9 h-9', title: 'text-[15px]', sub: 'text-[10.5px]' },
  lg: { box: 'w-12 h-12', title: 'text-lg', sub: 'text-xs' },
};

export const SamaanLogo: React.FC<SamaanLogoProps> = ({
  size = 'md',
  showWordmark = true,
  showSubtitle = false,
  className = '',
}) => {
  const { prefs, t } = useApp();
  const dims = SIZE_MAP[size];

  const markSvg = (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${dims.box} shrink-0 select-none drop-shadow-[0_2px_6px_rgba(13,122,114,0.22)]`}
      role="img"
      aria-label={prefs.language === 'fa' ? 'لوگوی سمان' : 'SAMAAN Logo'}
    >
      {/* Clean geometric tile */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="var(--accent-primary)"
      />
      <rect
        x="2.75"
        y="2.75"
        width="42.5"
        height="42.5"
        rx="11.25"
        stroke="var(--accent-contrast)"
        strokeOpacity="0.18"
        strokeWidth="1.25"
      />

      {/* Isometric warehouse crate facets */}
      <path
        d="M24 9L37 16.5L24 24L11 16.5L24 9Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.22"
      />
      <path
        d="M11 16.5L24 24V39L11 31.5V16.5Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.12"
      />
      <path
        d="M37 16.5L24 24V39L37 31.5V16.5Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.05"
      />

      {/* Crisp structural ribs */}
      <path
        d="M24 9L37 16.5V31.5L24 39L11 31.5V16.5L24 9Z"
        stroke="var(--accent-contrast)"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M11 16.5L24 24M37 16.5L24 24M24 24V39"
        stroke="var(--accent-contrast)"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Stylized energy bolt */}
      <path
        d="M26 14L17.5 25H23.2L22.2 34L30.5 23H24.8L26 14Z"
        fill="var(--accent-contrast)"
        stroke="var(--accent-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );

  if (!showWordmark) {
    return markSvg;
  }

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      {markSvg}
      <div className="min-w-0 leading-tight">
        <div
          className={`${dims.title} font-extrabold tracking-tight text-[var(--text-primary)] truncate`}
        >
          {t.brandShort}
        </div>
        {showSubtitle && (
          <div className={`${dims.sub} font-medium text-[var(--text-muted)] tracking-wide truncate mt-0.5`}>
            {t.brandCode}
          </div>
        )}
      </div>
    </div>
  );
};
