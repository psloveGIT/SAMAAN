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
  md: { box: 'w-9 h-9', title: 'text-sm', sub: 'text-[11px]' },
  lg: { box: 'w-12 h-12', title: 'text-base', sub: 'text-xs' },
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
      className={`${dims.box} shrink-0 select-none`}
      role="img"
      aria-label={prefs.language === 'fa' ? 'لوگوی سمان' : 'SAMAAN Logo'}
    >
      {/* Emblem container */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="11"
        fill="var(--accent-primary)"
      />
      <rect
        x="2.75"
        y="2.75"
        width="42.5"
        height="42.5"
        rx="10.25"
        stroke="var(--accent-contrast)"
        strokeOpacity="0.2"
        strokeWidth="1.5"
      />

      {/* Isometric warehouse crate facets */}
      <path
        d="M24 8.5L37.5 16.25L24 24L10.5 16.25L24 8.5Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.2"
      />
      <path
        d="M10.5 16.25L24 24V39.5L10.5 31.75V16.25Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.11"
      />
      <path
        d="M37.5 16.25L24 24V39.5L37.5 31.75V16.25Z"
        fill="var(--accent-contrast)"
        fillOpacity="0.05"
      />

      {/* Isometric crate outline & inner structural ribs */}
      <path
        d="M24 8.5L37.5 16.25V31.75L24 39.5L10.5 31.75V16.25L24 8.5Z"
        stroke="var(--accent-contrast)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 16.25L24 24M37.5 16.25L24 24M24 24V39.5"
        stroke="var(--accent-contrast)"
        strokeOpacity="0.48"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Power plant energy core / stylized 'S' bolt */}
      <path
        d="M26 13.5L17 25H23L22 34.5L31 23H25L26 13.5Z"
        fill="var(--accent-contrast)"
        stroke="var(--accent-primary)"
        strokeWidth="2.2"
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
      <div className="min-w-0">
        <div
          className={`${dims.title} font-bold tracking-tight text-[var(--text-primary)] truncate`}
        >
          {t.brandShort}
        </div>
        {showSubtitle && (
          <div className={`${dims.sub} text-[var(--text-muted)] truncate`}>
            {t.brandCode}
          </div>
        )}
      </div>
    </div>
  );
};
