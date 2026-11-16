import React from 'react';
import { resolveEmployerLogoById } from '../shared/employers.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';
import type { EmployerLogoAsset } from '../shared/types.ts';

interface EmployerFormLogoProps {
  employer: ResolvedEmployerProfile;
  logo?: EmployerLogoAsset;
  logoId?: string;
  height?: number;
  maxWidth?: number;
  showPlaceholder?: boolean;
}

export const EmployerFormLogo: React.FC<EmployerFormLogoProps> = ({
  employer,
  logo,
  logoId,
  height = 54,
  maxWidth = 130,
  showPlaceholder = false,
}) => {
  const chosenLogo =
    logo || (logoId ? resolveEmployerLogoById(employer, logoId, false) : resolveEmployerLogoById(employer, '__default__', true));

  if (chosenLogo?.dataUrl) {
    return (
      <img
        src={chosenLogo.dataUrl}
        alt={chosenLogo.label || employer.companyFullName || employer.nameFa}
        referrerPolicy="no-referrer"
        style={{
          height: `${height}px`,
          width: 'auto',
          maxWidth: `${maxWidth}px`,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    );
  }

  if (!showPlaceholder) {
    return null;
  }

  const label = employer.isConfigured ? employer.badgeCode || employer.shortName : 'CLIENT';
  return (
    <div
      style={{
        height: `${height}px`,
        minWidth: '72px',
        padding: '0 6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        color: '#0f172a',
        border: '1px dashed #cbd5e1',
        borderRadius: '4px',
      }}
    >
      <svg width="26" height="20" viewBox="0 0 36 28" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="30" height="22" rx="3" stroke="#475569" strokeWidth="2" />
        <path d="M9 18L15 10L20 16L24 12L28 18" stroke="#0369a1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div
        style={{
          fontSize: '8.5px',
          fontWeight: 700,
          lineHeight: 1.1,
          color: '#334155',
          maxWidth: `${maxWidth - 10}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
};
