import React from 'react';
import { MD1_STACKED_LOGO } from '../lib/assets.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';

interface EmployerFormLogoProps {
  employer: ResolvedEmployerProfile;
  height?: number;
}

export const EmployerFormLogo: React.FC<EmployerFormLogoProps> = ({
  employer,
  height = 54,
}) => {
  if (employer.logoType === 'custom' && employer.logoDataUrl) {
    return (
      <img
        src={employer.logoDataUrl}
        alt={employer.companyFullName}
        style={{ height: `${height}px`, width: 'auto', maxWidth: '120px', objectFit: 'contain', display: 'block' }}
      />
    );
  }

  if (employer.logoType === 'md1') {
    return (
      <img
        src={MD1_STACKED_LOGO}
        alt={employer.companyFullName}
        style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
      />
    );
  }

  if (employer.logoType === 'mapna_generic') {
    const code = employer.badgeCode || 'MAPNA';
    return (
      <div
        style={{
          height: `${height}px`,
          minWidth: '82px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          color: '#0f172a',
        }}
      >
        <svg
          width="36"
          height="26"
          viewBox="0 0 40 28"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 22L14 6L20 15L26 6L36 22" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 25H38" stroke="#0369a1" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div
          dir="ltr"
          style={{
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            lineHeight: 1.1,
            color: '#0f172a',
          }}
        >
          MAPNA · {code}
        </div>
        <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#334155', lineHeight: 1.1 }}>
          گروه مپنا ({employer.shortName})
        </div>
      </div>
    );
  }

  // Neutral / Tavanir / Custom without uploaded image
  const badgeText = employer.badgeCode || 'CLIENT';
  return (
    <div
      style={{
        height: `${height}px`,
        minWidth: '82px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        color: '#0f172a',
      }}
    >
      <svg
        width="32"
        height="26"
        viewBox="0 0 36 28"
        fill="none"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="30" height="22" rx="3" stroke="#0f172a" strokeWidth="2" />
        <path d="M9 17L15 9L20 15L24 11L28 17" stroke="#0369a1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div
        style={{
          fontSize: '9px',
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#0f172a',
          maxWidth: '110px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {employer.shortName || badgeText}
      </div>
    </div>
  );
};
