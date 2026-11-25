import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import { resolveEmployerLogoSrc } from '../lib/employerLogoCache.ts';
import {
  DEFAULT_SUPPLY_URGENCY,
  MD1_SUBSTITUTION_COPY_TEXT,
  MD1_SUBSTITUTION_FORM_CODE,
  MD1_SUBSTITUTION_QA_NOTICE,
  MD1_SUBSTITUTION_TITLE_FA,
  buildReplacementAgreementText,
  buildReplacementCauseLines,
  uniqueJoinedValues,
} from '../shared/substitution.ts';
import {
  computeAutoColumnWidths,
  type AutoColumnDescriptor,
} from '../shared/printAutoLayout.ts';
import type { SubstitutionLineItem, SubstitutionRecord } from '../shared/types.ts';

const DEFAULT_MD1_LOGO_PATH = './assets/aistudio/______________8a639368.png';

const SUB_TABLE_COLUMNS: readonly AutoColumnDescriptor[] = [
  { key: 'itemNo', header: 'Item No.', kind: 'compact', minPercent: 6, maxPercent: 11 },
  { key: 'pn', header: 'شماره بسته (PN)', kind: 'code', minPercent: 9, maxPercent: 16 },
  { key: 'desc', header: 'شرح مواد/ تجهیزات', kind: 'fluid', minPercent: 22, maxPercent: 40 },
  { key: 'tag', header: 'Tag No.', kind: 'code', minPercent: 8, maxPercent: 16 },
  { key: 'qty', header: 'تعداد', kind: 'compact', minPercent: 5, maxPercent: 9 },
  { key: 'drawing', header: 'شماره نقشه', kind: 'compact', minPercent: 7, maxPercent: 12 },
  { key: 'remarks', header: 'توضیحات', kind: 'fluid', minPercent: 12, maxPercent: 28 },
];

export interface OfficialSubstitutionSheetProps {
  rec: SubstitutionRecord;
  formatDate: (iso: string) => string;
}

function getSectionARows(rec: SubstitutionRecord): SubstitutionLineItem[] {
  if (Array.isArray(rec.originalItems) && rec.originalItems.length > 0) {
    return rec.originalItems;
  }
  return [
    {
      detailedId: rec.detailedId,
      itemNo: rec.itemNo || '',
      shipmentNo: rec.shipmentNo || '',
      packageNo: rec.packageNo || '',
      description: rec.originalDescription || '',
      itemCode: rec.originalItemCode || '',
      qty: rec.qty,
      countingUnit: rec.countingUnit,
      drawingNo: '',
      remarks: rec.originalRemarks || '',
    },
  ];
}

function getSectionBRows(rec: SubstitutionRecord): SubstitutionLineItem[] {
  if (Array.isArray(rec.substituteItems) && rec.substituteItems.length > 0) {
    return rec.substituteItems;
  }
  return [
    {
      detailedId: '',
      itemNo: rec.itemNo || '',
      shipmentNo: rec.substitutePackageNo || rec.shipmentNo || '',
      packageNo: rec.substitutePackageNo || '',
      description: `${rec.substituteDescription || ''}${rec.substituteSize ? ` (${rec.substituteSize})` : ''}`,
      itemCode: rec.substituteItemCode || '',
      qty: rec.qty,
      countingUnit: rec.countingUnit,
      drawingNo: '',
      remarks: rec.substituteRemarks || '',
    },
  ];
}

export const OfficialSubstitutionSheet: React.FC<OfficialSubstitutionSheetProps> = ({
  rec,
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const projectName = (rec.projectName || activeProject?.name || '').trim();
  const unitText = (rec.unit || '').trim();
  const sectionARows = getSectionARows(rec);
  const sectionBRows = getSectionBRows(rec);
  const unitA = uniqueJoinedValues(sectionARows.map((r) => r.unit)) || unitText;
  const unitB = uniqueJoinedValues(sectionBRows.map((r) => r.unit)) || unitText;
  const causeLines = buildReplacementCauseLines(rec.reason, rec.reprocureBy);
  const agreementText = buildReplacementAgreementText(rec.reprocureBy, rec.costBorneBy);

  const rawLogo = activeEmployer?.logos?.[0]?.dataUrl || DEFAULT_MD1_LOGO_PATH;
  const logoSrc = resolveEmployerLogoSrc(rawLogo);

  const renderSectionTable = (rows: SubstitutionLineItem[], keyPrefix: string) => {
    const minRows = Math.max(rows.length, 3);
    const displayRows: (SubstitutionLineItem | null)[] = [
      ...rows,
      ...Array.from({ length: Math.max(0, minRows - rows.length) }, () => null),
    ];

    const matrix = rows.map((r) => [
      r.itemNo || '',
      r.shipmentNo || '',
      r.description || '',
      r.itemCode || '',
      String(r.qty ?? ''),
      '',
      r.remarks || '',
    ]);
    const layout = computeAutoColumnWidths(SUB_TABLE_COLUMNS, matrix, {
      baseFontPx: 9.3,
      minFontPx: 7.8,
    });

    return (
      <table
        dir="rtl"
        className="samaan-dynamic-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: `${layout.recommendedFontPx}px`,
          tableLayout: 'auto',
        }}
      >
        <colgroup>
          {layout.widthsPercent.map((pct, i) => (
            <col key={SUB_TABLE_COLUMNS[i].key} style={{ width: `${pct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700, textAlign: 'center' }}>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}>
              <span dir="ltr">Item No.</span>
            </th>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '4px 3px', lineHeight: 1.3 }}>
              <div>شماره بسته</div>
              <div dir="ltr">(PN)</div>
            </th>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 5px' }}>
              شرح مواد/ تجهیزات
            </th>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '4px 3px' }}>
              <span dir="ltr">Tag No.</span>
            </th>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}>
              تعداد
            </th>
            <th style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}>
              شماره نقشه
            </th>
            <th style={{ borderBottom: '1px solid #000000', padding: '5px 5px' }}>
              توضیحات
            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, idx) => (
            <tr key={`${keyPrefix}-${idx}`}>
              <td
                dir="ltr"
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 3px',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                  height: 'auto',
                  minHeight: '24px',
                }}
              >
                {row ? row.itemNo || '' : '\u00A0'}
              </td>
              <td
                dir="ltr"
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 3px',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                }}
              >
                {row ? row.shipmentNo || '' : ''}
              </td>
              <td
                className="bidi-plaintext"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 5px',
                  textAlign: 'right',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-line',
                }}
              >
                {row ? row.description || '' : ''}
              </td>
              <td
                dir="ltr"
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 3px',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                }}
              >
                {row ? row.itemCode || '' : ''}
              </td>
              <td
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 3px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                {row ? row.qty : ''}
              </td>
              <td
                dir="ltr"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '5px 3px',
                  textAlign: 'center',
                }}
              >
                {/* Rules 1-18 & 1-25: Drawing No. intentionally left blank */}
                {''}
              </td>
              <td
                className="bidi-plaintext"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '5px 5px',
                  textAlign: 'right',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-line',
                }}
              >
                {row ? row.remarks || '' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div
      dir="rtl"
      data-testid="official-substitution-sheet"
      className="samaan-a4-portrait"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Outer Official Frame */}
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Official Header Row: Logo (Right) | Title & Project (Center) | DocNo & Date (Left) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 2.2fr 1.2fr',
            borderBottom: '1.5px solid #000000',
            minHeight: '76px',
          }}
        >
          {/* Right: MD1 Employer Logo */}
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '3px',
            }}
          >
            {logoSrc && (
              <img
                src={logoSrc}
                alt={activeEmployer?.nameFa || 'مپنا توسعه یک'}
                style={{ maxHeight: '46px', maxWidth: '135px', objectFit: 'contain' }}
              />
            )}
            <div style={{ fontSize: '8.5px', fontWeight: 700 }}>
              سیستم مدیریت یکپارچه
            </div>
          </div>

          {/* Center: Official Form Title & Project Name (Rule 1-1) */}
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '5px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 800, lineHeight: 1.4 }}>
              {MD1_SUBSTITUTION_TITLE_FA}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700 }}>
              {projectName ? `پروژه ${projectName}` : 'پروژه ...............................'}
            </div>
          </div>

          {/* Left: Substitution No (Rule 1-2) & Date (Rule 1-3) */}
          <div
            style={{
              padding: '7px 9px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '7px',
              fontSize: '9.8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>شماره جایگزینی:</span>
              <span dir="ltr" className="tabular-nums font-bold" style={{ fontWeight: 800 }}>
                {rec.docNo}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>تاریخ:</span>
              <span dir="ltr" className="tabular-nums" style={{ fontWeight: 700 }}>
                {formatDate(rec.date)}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata Block Row 1 (Rules 1-4 to 1-8) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr 0.85fr 0.7fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.2px',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>شماره قرارداد/ درخواست خرید: </span>
            <span dir="ltr" className="tabular-nums bidi-plaintext">
              {rec.contractNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>سیستم: </span>
            <span className="bidi-plaintext">{rec.system || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>جزیره: </span>
            <span className="bidi-plaintext">{rec.island || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>واحد: </span>
            <span className="bidi-plaintext">{unitText}</span>
          </div>
          <div style={{ padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>تامین کننده: </span>
            <span className="bidi-plaintext">{rec.supplier || ''}</span>
          </div>
        </div>

        {/* Metadata Block Row 2 (Rules 1-9 to 1-12) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1.35fr 1.1fr 1.1fr',
            borderBottom: '1.2px solid #000000',
            fontSize: '9.2px',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>فوریت تامین (عادی/اضطراری): </span>
            <span style={{ fontWeight: 700 }}>{rec.supplyUrgency || DEFAULT_SUPPLY_URGENCY}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>پیمانکار نصب: </span>
            <span className="bidi-plaintext">{rec.installerContractor || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>شماره حواله: </span>
            <span dir="ltr" className="tabular-nums font-bold">
              {rec.mivNo || ''}
            </span>
          </div>
          <div style={{ padding: '5px 6px' }}>
            <span style={{ fontWeight: 700 }}>شماره NCR/MER: </span>
            <span dir="ltr" className="tabular-nums bidi-plaintext">
              {rec.merNcrNo || ''}
            </span>
          </div>
        </div>

        {/* Section A Header & Table (Rules 1-13 to 1-19) */}
        <div
          data-testid="sub-sheet-section-a-heading"
          style={{
            backgroundColor: '#f3f4f6',
            borderBottom: '1px solid #000000',
            padding: '5px 8px',
            fontSize: '9.6px',
            fontWeight: 700,
          }}
        >
          مواد / تجهیزات مشخص شده در ذیل مربوط به واحد شماره{' '}
          <span className="bidi-plaintext">
            {unitA || '...............'}
          </span>{' '}
          نیازمند تعویض می باشند:
        </div>
        {renderSectionTable(sectionARows, 'secA')}

        {/* Section B Header & Table (Rules 1-20 to 1-26) */}
        <div
          data-testid="sub-sheet-section-b-heading"
          style={{
            backgroundColor: '#f3f4f6',
            borderBottom: '1px solid #000000',
            padding: '5px 8px',
            fontSize: '9.6px',
            fontWeight: 700,
          }}
        >
          مواد / تجهیزات مشخص شده ما فوق با اقلام ذیل جهت واحد شماره{' '}
          <span className="bidi-plaintext">{unitB || '...............'}</span>{' '}
          تعویض شدند:
        </div>
        {renderSectionTable(sectionBRows, 'secB')}

        {/* Rule 1-27: Cause of Replacement (Reason + Re-supplier on separate lines, without extra prefix) */}
        <div
          dir="rtl"
          data-testid="sub-sheet-cause-box"
          style={{
            borderBottom: '1px solid #000000',
            padding: '7px 9px',
            minHeight: '58px',
            fontSize: '9.4px',
            lineHeight: 1.75,
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: '2px' }}>علت تعویض:</div>
          {causeLines.map((line, idx) => (
            <div key={idx} dir="rtl" style={{ textAlign: 'right', paddingRight: '6px', whiteSpace: 'pre-line' }}>
              {line}
            </div>
          ))}
        </div>

        {/* Rule 1-28: Supplier Comments (Optional — blank when empty) */}
        <div
          dir="rtl"
          style={{
            borderBottom: '1px solid #000000',
            padding: '7px 9px',
            minHeight: '52px',
            fontSize: '9.4px',
            lineHeight: 1.7,
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: '2px' }}>توضیحات تامین کننده:</div>
          {rec.supplierNotes?.trim() ? (
            <div dir="rtl" style={{ textAlign: 'right', paddingRight: '6px', whiteSpace: 'pre-wrap' }}>
              {rec.supplierNotes.trim()}
            </div>
          ) : (
            <div style={{ height: '20px' }}>{'\u00A0'}</div>
          )}
        </div>

        {/* Rule 1-29: Agreement Paragraph */}
        <div
          className="samaan-keep-together"
          style={{
            borderBottom: '1px solid #000000',
            padding: '8px 10px',
            fontSize: '9.6px',
            fontWeight: 600,
            lineHeight: 1.9,
            textAlign: 'justify',
          }}
        >
          {agreementText}
        </div>

        {/* Rule 1-29: 3-Column Signatures */}
        <div
          className="samaan-keep-together"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            minHeight: '84px',
            fontSize: '9.4px',
          }}
        >
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 9px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 800 }}>توسعه یک مپنا:</div>
            <div style={{ fontSize: '8.8px', color: '#374151' }}>نام و امضاء / تاریخ:</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 9px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 800 }}>پیمانکار نصب/ راه اندازی:</div>
            <div style={{ fontSize: '8.8px', color: '#374151' }}>نام و امضاء / تاریخ:</div>
          </div>

          <div
            style={{
              padding: '6px 9px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 800 }}>تامین کننده:</div>
            <div style={{ fontSize: '8.8px', color: '#374151' }}>نام و امضاء / تاریخ:</div>
          </div>
        </div>
      </div>

      {/* Bottom QA Notice, Copy Line & Form Code */}
      <div
        className="samaan-keep-together"
        style={{
          marginTop: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          fontSize: '8.4px',
          color: '#111827',
        }}
      >
        <div style={{ fontWeight: 600 }}>{MD1_SUBSTITUTION_QA_NOTICE}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span style={{ fontWeight: 700 }}>{MD1_SUBSTITUTION_COPY_TEXT}</span>
          <span dir="ltr" className="tabular-nums" style={{ fontWeight: 800, fontSize: '9px' }}>
            {MD1_SUBSTITUTION_FORM_CODE}
          </span>
        </div>
      </div>
    </div>
  );
};
