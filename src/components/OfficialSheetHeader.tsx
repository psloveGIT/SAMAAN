import React from 'react';
import type { ResolvedBuiltInFormDesign, ResolvedEmployerProfile } from '../shared/employers.ts';
import type { EmployerLogoAsset, FormHeaderLayout, FormSignatureBox } from '../shared/types.ts';
import { EmployerFormLogo } from './EmployerFormLogo.tsx';

interface OfficialFormHeaderProps {
  employer: ResolvedEmployerProfile;
  design?: ResolvedBuiltInFormDesign;
  titleFa?: string;
  titleEn?: string;
  docCode?: string;
  revisionText?: string;
  companyTitle?: string;
  imsSubtitle?: string;
  headerLayout?: FormHeaderLayout;
  primaryLogo?: EmployerLogoAsset;
  secondaryLogo?: EmployerLogoAsset;
  accentColor?: string;
  rightMetaSlot?: React.ReactNode;
  compact?: boolean;
}

export const OfficialFormHeader: React.FC<OfficialFormHeaderProps> = ({
  employer,
  design,
  titleFa,
  titleEn,
  docCode,
  revisionText,
  companyTitle,
  imsSubtitle,
  headerLayout,
  primaryLogo,
  secondaryLogo,
  accentColor,
  rightMetaSlot,
  compact = false,
}) => {
  const layout = headerLayout || design?.headerLayout || 'classic_right_logo';
  const resolvedCompany = companyTitle ?? design?.companyTitle ?? employer.companyFullName ?? '';
  const resolvedTitleFa = titleFa ?? design?.titleFa ?? '';
  const resolvedTitleEn = titleEn ?? design?.titleEn ?? '';
  const resolvedIms = imsSubtitle ?? design?.imsSubtitle ?? employer.imsSubtitle ?? '';
  const resolvedDocCode = docCode ?? design?.docCode ?? '';
  const resolvedRev = revisionText ?? design?.revisionText ?? '';
  const pLogo = primaryLogo ?? design?.primaryLogo;
  const sLogo = secondaryLogo ?? design?.secondaryLogo;
  const borderCol = accentColor || design?.accentColor || '#000000';
  const logoHeight = compact ? 42 : 52;

  const showPrimary = layout !== 'minimal_no_logo' && Boolean(pLogo?.dataUrl);
  const showSecondary = layout === 'split_dual_logo' && Boolean(sLogo?.dataUrl);

  const logoCell = (logoAsset?: EmployerLogoAsset) => (
    <div
      style={{ borderColor: borderCol }}
      className="w-32 shrink-0 p-2 flex items-center justify-center bg-white"
    >
      <EmployerFormLogo employer={employer} logo={logoAsset} height={logoHeight} />
    </div>
  );

  const centerBlock = (
    <div className="flex-1 min-w-0 p-2 text-center flex flex-col justify-center">
      {resolvedCompany && (
        <div className="text-[12px] font-bold tracking-tight text-black leading-tight">
          {resolvedCompany}
        </div>
      )}
      {resolvedTitleFa && (
        <div className="text-[13px] font-extrabold text-black mt-0.5 leading-snug">
          {resolvedTitleFa}
        </div>
      )}
      {resolvedTitleEn && (
        <div dir="ltr" className="text-[10.5px] font-bold text-black/80 mt-0.5 leading-tight">
          {resolvedTitleEn}
        </div>
      )}
      {resolvedIms && (
        <div className="text-[10px] font-semibold text-black/70 mt-0.5">
          {resolvedIms}
        </div>
      )}
    </div>
  );

  const metaCell =
    rightMetaSlot || resolvedDocCode || resolvedRev ? (
      <div
        style={{ borderColor: borderCol }}
        className="w-52 shrink-0 text-[10px] flex flex-col justify-center divide-y divide-black/70"
      >
        {rightMetaSlot}
        {resolvedDocCode && (
          <div className="px-2 py-1 flex items-center justify-between gap-2 bg-slate-50">
            <span className="font-semibold">کد مدرک:</span>
            <span dir="ltr" className="font-mono font-bold text-[10.5px]">
              {resolvedDocCode}
            </span>
          </div>
        )}
        {resolvedRev && (
          <div className="px-2 py-0.5 flex items-center justify-between gap-2">
            <span className="font-semibold">بازنگری:</span>
            <span dir="ltr" className="font-mono font-semibold text-[10px]">
              {resolvedRev}
            </span>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div
      dir="rtl"
      style={{ borderColor: borderCol }}
      className="border-2 flex items-stretch bg-white text-black"
    >
      {layout === 'left_logo' ? (
        <>
          {metaCell && (
            <div style={{ borderColor: borderCol }} className="border-e flex">
              {metaCell}
            </div>
          )}
          {centerBlock}
          {showPrimary && (
            <div style={{ borderColor: borderCol }} className="border-s flex">
              {logoCell(pLogo)}
            </div>
          )}
        </>
      ) : layout === 'split_dual_logo' ? (
        <>
          {showPrimary && (
            <div style={{ borderColor: borderCol }} className="border-e flex">
              {logoCell(pLogo)}
            </div>
          )}
          {centerBlock}
          {showSecondary ? (
            <div style={{ borderColor: borderCol }} className="border-s flex">
              {logoCell(sLogo)}
            </div>
          ) : null}
          {metaCell && (
            <div style={{ borderColor: borderCol }} className="border-s flex">
              {metaCell}
            </div>
          )}
        </>
      ) : (
        <>
          {showPrimary && (
            <div style={{ borderColor: borderCol }} className="border-e flex">
              {logoCell(pLogo)}
            </div>
          )}
          {centerBlock}
          {metaCell && (
            <div style={{ borderColor: borderCol }} className="border-s flex">
              {metaCell}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const OfficialExtraMetaStrip: React.FC<{
  design: ResolvedBuiltInFormDesign;
  borderColor?: string;
  inset?: boolean;
}> = ({ design, borderColor, inset = false }) => {
  if (!design.extraMetaFields || design.extraMetaFields.length === 0) return null;
  const col = borderColor || design.accentColor || '#000000';
  return (
    <div
      dir="rtl"
      style={{ borderColor: col }}
      className={`${
        inset ? 'border-b' : 'border-x-2 border-b'
      } grid grid-cols-2 sm:grid-cols-4 divide-x divide-x-reverse divide-black/70 bg-slate-50/60 text-[10px] text-black`}
    >
      {design.extraMetaFields.map((field) => (
        <div key={field.id} className="px-2 py-1 flex items-center justify-between gap-2">
          <span className="font-bold shrink-0">{field.label}:</span>
          <span className="font-medium truncate">{field.defaultValue || '________'}</span>
        </div>
      ))}
    </div>
  );
};

export const OfficialFormSignatures: React.FC<{
  signatures: FormSignatureBox[];
  showSignatures?: boolean;
  borderColor?: string;
  values?: Record<string, string>;
}> = ({ signatures, showSignatures = true, borderColor = '#000000', values }) => {
  if (!showSignatures || !signatures || signatures.length === 0) return null;
  const cols = signatures.length <= 2 ? 2 : signatures.length === 3 ? 3 : signatures.length === 4 ? 4 : 5;
  return (
    <div
      dir="rtl"
      style={{
        borderColor,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
      className="grid border border-black divide-x divide-x-reverse divide-black text-[10px] text-black bg-white"
    >
      {signatures.map((sig) => (
        <div key={sig.id} className="p-2 flex flex-col justify-between min-h-[68px]">
          <div className="font-bold text-center border-b border-black/30 pb-1">
            {sig.label}
          </div>
          {values?.[sig.id] ? (
            <div className="text-center font-semibold py-1">{values[sig.id]}</div>
          ) : (
            <div className="h-6" />
          )}
          <div className="text-[9px] text-black/60 text-center">
            {sig.subtitle || 'نام، تاریخ و امضاء'}
          </div>
        </div>
      ))}
    </div>
  );
};

export const OfficialFormFooter: React.FC<{
  design: ResolvedBuiltInFormDesign;
  extraRight?: string;
}> = ({ design, extraRight }) => {
  if (!design.footerCopyText && !design.docCode && !extraRight) return null;
  return (
    <div
      dir="rtl"
      className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-black/80 px-1"
    >
      <span>{design.footerCopyText}</span>
      <span dir="ltr" className="font-mono text-[9px]">
        {[design.docCode, design.revisionText, extraRight].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
};

interface BuiltInSheetHeaderRowProps {
  employer: ResolvedEmployerProfile;
  design: ResolvedBuiltInFormDesign;
  projectTitle?: string;
  extraCenterSlot?: React.ReactNode;
  leftMetaSlot?: React.ReactNode;
  logoHeight?: number;
  compact?: boolean;
}

export const BuiltInSheetHeaderRow: React.FC<BuiltInSheetHeaderRowProps> = ({
  employer,
  design,
  projectTitle,
  extraCenterSlot,
  leftMetaSlot,
  logoHeight = 54,
  compact = false,
}) => {
  const layout = design.headerLayout;
  const borderCol = design.accentColor || '#000000';
  const showPrimary = layout !== 'minimal_no_logo' && Boolean(design.primaryLogo?.dataUrl);
  const showSecondary = layout === 'split_dual_logo' && Boolean(design.secondaryLogo?.dataUrl);

  const primaryCell = showPrimary ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '4px' : '6px',
      }}
    >
      <EmployerFormLogo employer={employer} logo={design.primaryLogo} height={logoHeight} />
      {design.imsSubtitle && (
        <div
          style={{
            fontSize: '7.5px',
            fontWeight: 700,
            marginTop: '3px',
            color: '#334155',
            whiteSpace: 'nowrap',
          }}
        >
          {design.imsSubtitle}
        </div>
      )}
    </div>
  ) : null;

  const secondaryCell = showSecondary ? (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '4px' : '6px',
      }}
    >
      <EmployerFormLogo employer={employer} logo={design.secondaryLogo} height={logoHeight} />
    </div>
  ) : null;

  const centerBlock = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        lineHeight: 1.55,
        padding: compact ? '2px 6px' : '4px 10px',
        flex: 1,
        minWidth: 0,
      }}
    >
      {design.companyTitle && (
        <div style={{ fontSize: compact ? '10.5px' : '12px', fontWeight: 700 }}>
          {design.companyTitle}
        </div>
      )}
      {projectTitle && (
        <div style={{ fontSize: compact ? '10px' : '11.5px', fontWeight: 700 }}>
          {projectTitle}
        </div>
      )}
      {design.titleFa && (
        <div style={{ fontSize: compact ? '12.5px' : '14px', fontWeight: 800, marginTop: '2px' }}>
          {design.titleFa}
        </div>
      )}
      {design.titleEn && (
        <div dir="ltr" style={{ fontSize: compact ? '10.5px' : '11.5px', fontWeight: 700, marginTop: '1px' }}>
          {design.titleEn}
        </div>
      )}
      {extraCenterSlot}
    </div>
  );

  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1.5px solid ${borderCol}`,
        padding: compact ? '4px 8px' : '5px 10px',
        gap: '8px',
      }}
    >
      {layout === 'left_logo' ? (
        <>
          {leftMetaSlot && (
            <div style={{ minWidth: '175px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {leftMetaSlot}
            </div>
          )}
          {centerBlock}
          {primaryCell && (
            <div style={{ width: '120px', flexShrink: 0, borderRight: `1px solid ${borderCol}` }}>
              {primaryCell}
            </div>
          )}
        </>
      ) : layout === 'split_dual_logo' ? (
        <>
          {primaryCell && <div style={{ width: '115px', flexShrink: 0 }}>{primaryCell}</div>}
          {centerBlock}
          {secondaryCell && <div style={{ width: '115px', flexShrink: 0 }}>{secondaryCell}</div>}
          {leftMetaSlot && (
            <div style={{ minWidth: '175px', flexShrink: 0, borderRight: `1px solid ${borderCol}`, paddingRight: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {leftMetaSlot}
            </div>
          )}
        </>
      ) : (
        <>
          {primaryCell && <div style={{ width: '120px', flexShrink: 0 }}>{primaryCell}</div>}
          {centerBlock}
          {leftMetaSlot && (
            <div style={{ minWidth: '175px', flexShrink: 0, borderRight: `1px solid ${borderCol}`, paddingRight: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {leftMetaSlot}
            </div>
          )}
        </>
      )}
    </div>
  );
};

