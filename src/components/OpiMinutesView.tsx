import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileWarning,
  Pencil,
  Printer,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { triggerAppPrint } from '../lib/print.ts';
import { extractPlantDocConfig } from '../shared/docNumbering.ts';
import { getEmployerFormCode, resolveBuiltInFormDesign } from '../shared/employers.ts';
import { formatHeaderProjectTitle, stripProjectWord } from '../shared/opiInvitation.ts';
import {
  buildMerReportItem,
  buildOpiMinutesAutoFill,
  computeMerReceivedQty,
  filterOpenInvitationsForMinutes,
  findDetailedRowsForInvitation,
  generateMerReportNo,
  MD1_MER_COPY_TEXT,
  MD1_MER_FORM_CODE,
  MD1_MER_TITLE_EN,
  MD1_MER_TITLE_FA,
  MD1_OPI_MINUTES_COMPANY_NAME,
  MD1_OPI_MINUTES_COMPLIANT_LABEL,
  MD1_OPI_MINUTES_COPY_TEXT,
  MD1_OPI_MINUTES_FORM_CODE,
  MD1_OPI_MINUTES_QA_NOTICE,
  MD1_OPI_MINUTES_STATEMENT,
  MD1_OPI_MINUTES_TITLE_EN,
  MD1_OPI_MINUTES_TITLE_FA,
  type MerDiscrepancyCategory,
} from '../shared/opiMinutes.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import type {
  DetailedComputed,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { BuiltInSheetHeaderRow, OfficialExtraMetaStrip } from './OfficialSheetHeader.tsx';
import {
  OperationalViewModeTabs,
  type OperationalViewMode,
} from './OperationalViewModeTabs.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface OpiMinutesApiResponse {
  minutes: OpiMinutesRecord[];
  osdrReports: OsdrReportRecord[];
  invitations: OpiInvitationRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  packings?: string[];
  allUsedDocNos?: string[];
}

interface OpiMinutesViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface MerRowDraft {
  checked: boolean;
  category: MerDiscrepancyCategory;
  discrepantQty: string;
  discrepancyText: string;
  remark: string;
}

const MomCheckSquare: React.FC<{ checked?: boolean }> = ({ checked }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '13px',
      height: '13px',
      border: '1.3px solid #000000',
      backgroundColor: '#ffffff',
      flexShrink: 0,
    }}
  >
    {checked && (
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M1.5 5.2L4 7.7L8.5 2.3"
          stroke="#000000"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);

/* ============================================================================
 * OFFICIAL MD1EX-FQP02/06-03 SHEET — OPI MINUTES OF MEETING (PORTRAIT A4)
 * ============================================================================ */
interface OfficialOpiMinutesSheetProps {
  record: OpiMinutesRecord;
  formatDate: (iso: string) => string;
  pageBreakAfter?: boolean;
}

export const OfficialOpiMinutesSheet: React.FC<OfficialOpiMinutesSheetProps> = ({
  record,
  formatDate,
  pageBreakAfter = false,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'opiMinutes');
  const isMd1Default = activeEmployer.id === 'mapna-md1' && !design.template;
  const formCode = isMd1Default
    ? MD1_OPI_MINUTES_FORM_CODE
    : design.docCode || MD1_OPI_MINUTES_FORM_CODE;

  const effectiveDesign = useMemo(
    () =>
      isMd1Default
        ? {
            ...design,
            companyTitle: MD1_OPI_MINUTES_COMPANY_NAME,
            titleFa: MD1_OPI_MINUTES_TITLE_FA,
            titleEn: MD1_OPI_MINUTES_TITLE_EN,
            docCode: MD1_OPI_MINUTES_FORM_CODE,
            footerCopyText: MD1_OPI_MINUTES_COPY_TEXT,
          }
        : design,
    [design, isMd1Default],
  );

  const rawProjectName = record.projectName?.trim() || activeProject?.name || '';
  const projectHeaderTitle = formatHeaderProjectTitle(rawProjectName);
  const projectBareName = stripProjectWord(rawProjectName);

  const resolvedItems: OpiInvitationLineItem[] = record.items || [];
  const minRows = 8;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: Array<OpiInvitationLineItem | null> = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
  ];

  const sellerName = record.sellerRep || record.contractorInspector || '';

  return (
    <div
      dir="rtl"
      data-testid="official-opi-minutes-sheet"
      className={`samaan-a4-portrait samaan-print-sheet-portrait${pageBreakAfter ? ' samaan-print-page-break' : ''}`}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Upper Main Frame */}
      <div style={{ border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={effectiveDesign}
          projectTitle={projectHeaderTitle}
          leftMetaSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                fontSize: '9.8px',
                fontWeight: 700,
                textAlign: 'right',
                gap: '16px',
                height: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>شماره OPI :</span>
                <span dir="ltr" className="tabular-nums" style={{ fontWeight: 800 }}>
                  {record.minutesNo || record.invitationNo}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>تاریخ OPI :</span>
                <span dir="ltr" className="tabular-nums">
                  {formatDate(record.date)}
                </span>
              </div>
            </div>
          }
        />
        <OfficialExtraMetaStrip
          design={effectiveDesign}
          inset
          borderColor={effectiveDesign.accentColor}
        />

        {/* Metadata Strip Row 1 (5 columns RTL: تامین کننده | سیستم | جزیره | واحد | پروژه) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.6px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{record.supplier || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>سیستم: </strong>
            <span className="bidi-plaintext">{record.system || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{record.island || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{record.unit || ''}</span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span className="bidi-plaintext">{projectBareName}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (3 columns RTL: شماره قرارداد/درخواست خرید | شماره دعوتنامه OPI | شماره بسته خرید) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.25fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.6px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره قرارداد/درخواست خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.contractNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره دعوتنامه OPI: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.invitationNo || record.minutesNo || ''}
            </span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.purchasePackageNo || ''}
            </span>
          </div>
        </div>

        {/* 6-Column LTR Items Table */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.4px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                Item
                <br />
                No.
              </th>
              <th
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 5px',
                  fontWeight: 700,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                Packing List
                <br />
                No.
              </th>
              <th
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 5px',
                  fontWeight: 700,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                Package
                <br />
                No.
              </th>
              <th
                dir="rtl"
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                شرح (کالا/تجهیز)
              </th>
              <th
                dir="rtl"
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                واحد
                <br />
                <span dir="ltr">(UOM)</span>
              </th>
              <th
                dir="rtl"
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                توضیحات
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => (
              <tr key={idx}>
                <td
                  className="tabular-nums samaan-col-compact"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 4px',
                    textAlign: 'center',
                  }}
                >
                  {row ? row.itemNo || String(idx + 1) : '\u00A0'}
                </td>
                <td
                  className="tabular-nums samaan-col-code"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 5px',
                    textAlign: 'center',
                  }}
                >
                  {row?.packingListNo || ''}
                </td>
                <td
                  className="tabular-nums samaan-col-code"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 5px',
                    textAlign: 'center',
                  }}
                >
                  {row?.packageNo || ''}
                </td>
                <td
                  dir="auto"
                  className="bidi-plaintext samaan-col-fluid"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 6px',
                    textAlign: 'center',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {row?.description || ''}
                </td>
                <td
                  dir="auto"
                  className="samaan-col-compact"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 4px',
                    textAlign: 'center',
                  }}
                >
                  {row?.uom || ''}
                </td>
                <td
                  dir="auto"
                  className="bidi-plaintext samaan-col-fluid"
                  style={{
                    borderBottom: '1px solid #000000',
                    padding: '4px 6px',
                    textAlign: 'center',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {row?.remarks || ''}
                </td>
              </tr>
            ))}
            {/* Schedule Header & Value Rows inside same 6-col LTR table so dividers align strictly with Package No.|شرح کالا and شرح کالا|واحد (UOM) */}
            <tr style={{ backgroundColor: '#e5e7eb', fontSize: '10px', fontWeight: 700 }}>
              <td
                colSpan={3}
                dir="rtl"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  textAlign: 'center',
                }}
              >
                محل انجام OPI
              </td>
              <td
                colSpan={1}
                dir="rtl"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  textAlign: 'center',
                }}
              >
                تاریخ
              </td>
              <td
                colSpan={2}
                dir="rtl"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '5px 6px',
                  textAlign: 'center',
                }}
              >
                ساعت
              </td>
            </tr>
            <tr style={{ fontSize: '10px', fontWeight: 600 }}>
              <td
                colSpan={3}
                dir="rtl"
                className="bidi-plaintext"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '7px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {record.location || ''}
              </td>
              <td
                colSpan={1}
                dir="ltr"
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '7px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {formatDate(record.date)}
              </td>
              <td
                colSpan={2}
                dir="ltr"
                className="tabular-nums"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '7px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {record.time || ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Official Statement, Checkboxes (right-side / start in RTL) & Other Notes */}
        <div
          style={{
            padding: '10px 14px 14px',
            fontSize: '10px',
            lineHeight: 1.95,
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 600 }}>{MD1_OPI_MINUTES_STATEMENT}</div>

          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              paddingRight: '8px',
            }}
          >
            <div
              data-testid="opi-minutes-sheet-compliant"
              data-checked={record.resultStatus === 'compliant' ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '8px',
              }}
            >
              <MomCheckSquare checked={record.resultStatus === 'compliant'} />
              <span>{MD1_OPI_MINUTES_COMPLIANT_LABEL}</span>
            </div>

            <div
              data-testid="opi-minutes-sheet-discrepancy"
              data-checked={record.resultStatus === 'has_discrepancy' ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '8px',
              }}
            >
              <MomCheckSquare checked={record.resultStatus === 'has_discrepancy'} />
              <span>
                {record.merNo?.trim() ? (
                  <>
                    محموله‌ی بالا دارای مغایرت، برابر فرم{' '}
                    <span dir="ltr" className="tabular-nums" style={{ fontWeight: 700 }}>
                      MER No. {record.merNo.trim()}
                    </span>{' '}
                    است.
                  </>
                ) : (
                  'محموله‌ی بالا دارای مغایرت است.'
                )}
              </span>
            </div>
          </div>

          <div style={{ marginTop: '10px', minHeight: '62px' }}>
            <div style={{ fontWeight: 700 }}>سایر توضیحات:</div>
            {record.notes && (
              <div
                className="bidi-plaintext"
                style={{ marginTop: '4px', fontSize: '9.6px', whiteSpace: 'pre-line' }}
              >
                {record.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lower Signature, QA Notice & Enclosed Footer Frame */}
      <div
        className="samaan-keep-together"
        style={{
          border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}`,
          marginTop: '10px',
        }}
      >
        <div
          style={{
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            padding: '4px 8px',
            fontSize: '10.5px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          امضا
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            minHeight: '76px',
            borderBottom: '1px solid #000000',
            fontSize: '9.4px',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>انباردار:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }}>{record.storekeeper || ''}</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>
                {isMd1Default ? 'تأمین تجهیزات توسعه یک :' : `${activeEmployer.equipmentSupplyLabel} :`}
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }}>{record.mapnaInspector || ''}</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>فروشنده:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }}>{sellerName}</div>
          </div>

          <div
            style={{
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>دستگاه نظارت یا کارفرما:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }}>{record.employerInspector || ''}</div>
          </div>
        </div>

        {/* Right-Aligned QA Control Notice */}
        <div
          dir="rtl"
          data-testid="opi-minutes-qa-notice"
          style={{
            padding: '4px 10px',
            fontSize: '8.3px',
            fontWeight: 600,
            textAlign: 'right',
            borderBottom: '1px solid #000000',
          }}
        >
          {effectiveDesign.template?.introText || MD1_OPI_MINUTES_QA_NOTICE}
        </div>

        {/* Enclosed Footer */}
        <div
          dir="rtl"
          style={{
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '8.8px',
            fontWeight: 700,
          }}
        >
          <span>{effectiveDesign.footerCopyText || MD1_OPI_MINUTES_COPY_TEXT}</span>
          <span dir="ltr" className="tabular-nums">
            {[formCode, effectiveDesign.revisionText].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * OFFICIAL MD1EX-FQP02/12-03 SHEET — MATERIAL EXCEPTIONS REPORT (LANDSCAPE A4)
 * ============================================================================ */
interface OfficialMerSheetProps {
  report: OsdrReportRecord;
  formatDate: (iso: string) => string;
}

export const OfficialMerSheet: React.FC<OfficialMerSheetProps> = ({ report, formatDate }) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'mer');
  const isMd1Default = activeEmployer.id === 'mapna-md1' && !design.template;
  const merFormCode = isMd1Default ? MD1_MER_FORM_CODE : design.docCode || MD1_MER_FORM_CODE;

  const effectiveDesign = useMemo(
    () =>
      isMd1Default
        ? {
            ...design,
            companyTitle: MD1_OPI_MINUTES_COMPANY_NAME,
            titleFa: MD1_MER_TITLE_FA,
            titleEn: MD1_MER_TITLE_EN,
            docCode: MD1_MER_FORM_CODE,
            footerCopyText: MD1_MER_COPY_TEXT,
          }
        : design,
    [design, isMd1Default],
  );

  const rawProjectName = report.projectName?.trim() || activeProject?.name || '';
  const projectHeaderTitle = formatHeaderProjectTitle(rawProjectName);
  const projectBareName = stripProjectWord(rawProjectName);

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, report.items.length);
  const paddedRows: Array<OsdrReportItem | null> = [
    ...report.items,
    ...Array.from({ length: Math.max(0, totalDisplayRows - report.items.length) }, () => null),
  ];

  return (
    <div
      dir="rtl"
      data-testid="official-mer-sheet"
      className="samaan-a4-landscape samaan-print-sheet-landscape"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Upper Main Frame */}
      <div style={{ border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={effectiveDesign}
          projectTitle={projectHeaderTitle}
          compact
          leftMetaSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                textAlign: 'right',
                gap: '14px',
                height: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>شماره MER:</span>
                <span dir="ltr" className="tabular-nums" style={{ fontWeight: 800 }}>
                  {report.reportNo}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>تاریخ MER:</span>
                <span dir="ltr" className="tabular-nums">
                  {formatDate(report.date)}
                </span>
              </div>
            </div>
          }
        />
        <OfficialExtraMetaStrip
          design={effectiveDesign}
          inset
          borderColor={effectiveDesign.accentColor}
        />

        {/* Metadata Strip Row 1 (5 columns RTL: شماره قرارداد/ درخواست خرید | سیستم | جزیره | واحد | پروژه) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr 1fr 0.9fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.5px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>شماره قرارداد/ درخواست خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {report.contractNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>سیستم: </strong>
            <span className="bidi-plaintext">{report.system || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{report.island || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{report.unit || ''}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span className="bidi-plaintext">{projectBareName}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (4 columns RTL: تامین کننده | Packing List No. | OPI Date | OPI No.) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.25fr 1.35fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.5px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{report.supplier || ''}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>Packing List No.: </strong>
            <span className="tabular-nums">{report.packingListNo || ''}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>OPI Date: </strong>
            <span className="tabular-nums">{formatDate(report.opiDate || report.date)}</span>
          </div>
          <div dir="ltr" style={{ padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>OPI No.: </strong>
            <span className="tabular-nums">{report.opiNo || report.opiMinutesNo || ''}</span>
          </div>
        </div>

        {/* 10-Column LTR MER Table (Rules 1-12..1-21) */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Package Item
              </th>
              <th
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Tag No.
              </th>
              <th
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                PL/Package No.
              </th>
              <th
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  textAlign: 'center',
                }}
              >
                Description
              </th>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                UOM
              </th>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Package Quantity
              </th>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Received Quantity
              </th>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Discrepant Quantity
              </th>
              <th
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 5px',
                  textAlign: 'center',
                }}
              >
                Discrepancy
              </th>
              <th
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '5px 5px',
                  textAlign: 'center',
                }}
              >
                Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((line, idx) => {
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              const plPkgText = line
                ? [line.shipmentNo, line.packageNo].filter(Boolean).join(' / ')
                : '';
              const discQty = line
                ? line.discrepantQty !== undefined
                  ? line.discrepantQty
                  : line.discrepancyType === 'shortage'
                    ? line.shortage
                    : line.damagedQty
                : '';
              const discReason = line
                ? line.discrepancyReason || String(discQty)
                : '';

              return (
                <tr key={line ? `${line.detailedId}-${idx}` : `empty-mer-${idx}`}>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {line ? line.itemNo || String(idx + 1) : '\u00A0'}
                  </td>
                  <td
                    className="tabular-nums samaan-col-code"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {line?.itemCode || ''}
                  </td>
                  <td
                    className="tabular-nums samaan-col-code"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {plPkgText}
                  </td>
                  <td
                    dir="auto"
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 6px',
                      textAlign: 'center',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {line?.description || ''}
                  </td>
                  <td
                    dir="auto"
                    className="samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {line?.countingUnit || ''}
                  </td>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {line !== null ? line.packingQty : ''}
                  </td>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {line !== null ? line.actualQty : ''}
                  </td>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {line !== null ? discQty : ''}
                  </td>
                  <td
                    dir="auto"
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 5px',
                      textAlign: 'center',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {discReason}
                  </td>
                  <td
                    dir="auto"
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottomBorder,
                      padding: '4px 5px',
                      textAlign: 'center',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {line?.remarks || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lower 5-Box Signatures, QA Notice & Enclosed Footer Frame */}
      <div
        className="samaan-keep-together"
        style={{
          border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}`,
          marginTop: '10px',
        }}
      >
        <div
          style={{
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            padding: '4px 8px',
            fontSize: '10.5px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          امضاء
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            minHeight: '74px',
            borderBottom: '1px solid #000000',
            fontSize: '9.2px',
            textAlign: 'right',
          }}
        >
          {[
            'انباردار:',
            isMd1Default ? 'تأمین تجهیزات توسعه یک :' : `${activeEmployer.equipmentSupplyLabel} :`,
            'فروشنده:',
            'دستگاه نظارت:',
            'کارفرما:',
          ].map((label, idx, arr) => (
            <div
              key={label}
              style={{
                borderLeft: idx < arr.length - 1 ? '1px solid #000000' : 'none',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{label}</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
              </div>
              <div style={{ height: '14px' }} />
            </div>
          ))}
        </div>

        {/* Right-Aligned QA Control Notice */}
        <div
          dir="rtl"
          data-testid="mer-qa-notice"
          style={{
            padding: '4px 10px',
            fontSize: '8.3px',
            fontWeight: 600,
            textAlign: 'right',
            borderBottom: '1px solid #000000',
          }}
        >
          {effectiveDesign.template?.introText || MD1_OPI_MINUTES_QA_NOTICE}
        </div>

        {/* Enclosed Copy & Form Code Footer */}
        <div
          dir="rtl"
          style={{
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '8.8px',
            fontWeight: 700,
          }}
        >
          <span>{effectiveDesign.footerCopyText || MD1_MER_COPY_TEXT}</span>
          <span dir="ltr" className="tabular-nums">
            {[merFormCode, effectiveDesign.revisionText].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * MAIN VIEW — OPI MINUTES (MD1EX-FQP02/06-03) + LINKED MER (MD1EX-FQP02/12-03)
 * ============================================================================ */
export const OpiMinutesView: React.FC<OpiMinutesViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const {
    prefs,
    t,
    user,
    notify,
    formatDate,
    triggerAutoSnapshot,
    activeEmployer,
    activeProject,
    historyStatus,
    historyBusy,
    performUndo,
    performRedo,
  } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const formCode = getEmployerFormCode(activeEmployer, '06-03') || MD1_OPI_MINUTES_FORM_CODE;

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [historySubTab, setHistorySubTab] = useState<'minutes' | 'mer'>('minutes');
  const [data, setData] = useState<OpiMinutesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Create / Edit workflow state
  const [invSearch, setInvSearch] = useState('');
  const [selectedInvId, setSelectedInvId] = useState<string>('');
  const [rowRemarks, setRowRemarks] = useState<Record<number, string>>({});
  const [otherNotes, setOtherNotes] = useState('');
  const [resultStatus, setResultStatus] = useState<'compliant' | 'has_discrepancy'>('compliant');

  // Conditional MER state (when resultStatus === 'has_discrepancy')
  const [merReportNo, setMerReportNo] = useState('');
  const [merReportNoTouched, setMerReportNoTouched] = useState(false);
  const [merRowSearch, setMerRowSearch] = useState('');
  const [merDrafts, setMerDrafts] = useState<Record<string, MerRowDraft>>({});

  // Edit / Delete / Print / Scan state
  const [editingMinutes, setEditingMinutes] = useState<OpiMinutesRecord | null>(null);
  const [editingStandaloneMer, setEditingStandaloneMer] = useState<OsdrReportRecord | null>(null);
  const [standaloneMerReportNo, setStandaloneMerReportNo] = useState('');
  const [standaloneMerDate, setStandaloneMerDate] = useState('');
  const [standaloneMerNotes, setStandaloneMerNotes] = useState('');
  const [standaloneMerItems, setStandaloneMerItems] = useState<
    Array<{
      item: OsdrReportItem;
      category: MerDiscrepancyCategory;
      discrepantQty: string;
      remarks: string;
    }>
  >([]);
  const [savingStandaloneMer, setSavingStandaloneMer] = useState(false);
  const [deleteMinutesTarget, setDeleteMinutesTarget] = useState<OpiMinutesRecord | null>(null);
  const [deleteMerTarget, setDeleteMerTarget] = useState<OsdrReportRecord | null>(null);
  const [printBundle, setPrintBundle] = useState<{
    minutes: OpiMinutesRecord | null;
    mer: OsdrReportRecord | null;
  } | null>(null);
  const [printBundleWasUndone, setPrintBundleWasUndone] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [printReportOpen, setPrintReportOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<{
    collection: 'opiMinutes' | 'osdr';
    id: string;
    label: string;
    signedScan?: OpiMinutesRecord['signedScan'];
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<OpiMinutesApiResponse>('/api/opi-minutes');
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  // Keep Print Preview modal synced with Post-Print Undo/Redo
  useEffect(() => {
    if (!printBundle || !data) return;
    if (printBundle.minutes) {
      const foundMin = (data.minutes || []).find((m) => m.id === printBundle.minutes?.id);
      const foundMer = foundMin?.linkedMerId
        ? (data.osdrReports || []).find((r) => r.id === foundMin.linkedMerId) || null
        : foundMin?.merNo
          ? (data.osdrReports || []).find((r) => r.reportNo === foundMin.merNo) || null
          : null;
      if (foundMin) {
        setPrintBundleWasUndone(false);
        if (foundMin !== printBundle.minutes || foundMer !== printBundle.mer) {
          setPrintBundle({ minutes: foundMin, mer: foundMer });
        }
      } else {
        setPrintBundleWasUndone(true);
      }
    } else if (printBundle.mer) {
      const foundMer = (data.osdrReports || []).find((r) => r.id === printBundle.mer?.id);
      if (foundMer) {
        setPrintBundleWasUndone(false);
        if (foundMer !== printBundle.mer) setPrintBundle({ minutes: null, mer: foundMer });
      } else {
        setPrintBundleWasUndone(true);
      }
    }
  }, [data, printBundle]);

  // Keep scanTarget synced
  useEffect(() => {
    if (!scanTarget || !data) return;
    if (scanTarget.collection === 'opiMinutes') {
      const updated = (data.minutes || []).find((m) => m.id === scanTarget.id);
      if (updated && updated.signedScan !== scanTarget.signedScan) {
        setScanTarget({ ...scanTarget, signedScan: updated.signedScan });
      }
    } else {
      const updated = (data.osdrReports || []).find((r) => r.id === scanTarget.id);
      if (updated && updated.signedScan !== scanTarget.signedScan) {
        setScanTarget({ ...scanTarget, signedScan: updated.signedScan });
      }
    }
  }, [data, scanTarget]);

  const openInvitations = useMemo(
    () =>
      filterOpenInvitationsForMinutes(
        data?.invitations || [],
        data?.minutes || [],
        editingMinutes?.id,
      ),
    [data?.invitations, data?.minutes, editingMinutes?.id],
  );

  const filteredOpenInvitations = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return openInvitations;
    return openInvitations.filter((inv) =>
      [
        inv.invitationNo,
        inv.date,
        inv.location,
        inv.supplier,
        inv.system,
        inv.island,
        ...(inv.packingNos || []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [openInvitations, invSearch]);

  const selectedInvitation = useMemo<OpiInvitationRecord | null>(() => {
    if (!selectedInvId) return null;
    const found = (data?.invitations || []).find(
      (i) => i.id === selectedInvId || i.invitationNo === selectedInvId,
    );
    if (found) return found;
    // Fallback synthesis when editing an older/imported OPI Minutes whose invitation record was deleted
    if (editingMinutes && selectedInvId === editingMinutes.id) {
      return {
        id: editingMinutes.id,
        invitationNo: editingMinutes.invitationNo || editingMinutes.minutesNo,
        date: editingMinutes.date,
        time: editingMinutes.time || '',
        location: editingMinutes.location || '',
        packingNos: editingMinutes.packingNos || [editingMinutes.packingListNo].filter(Boolean),
        projectName: editingMinutes.projectName,
        supplier: editingMinutes.supplier,
        system: editingMinutes.system,
        island: editingMinutes.island,
        unit: editingMinutes.unit,
        contractNo: editingMinutes.contractNo,
        purchasePackageNo: editingMinutes.purchasePackageNo,
        items: editingMinutes.items,
        status: 'completed',
        createdAt: editingMinutes.createdAt,
        createdBy: editingMinutes.createdBy,
      };
    }
    return null;
  }, [selectedInvId, data?.invitations, editingMinutes]);

  const autoFill = useMemo(() => {
    if (!selectedInvitation) return null;
    return buildOpiMinutesAutoFill(
      selectedInvitation,
      data?.generalEntries || [],
      activeProject,
      rowRemarks,
    );
  }, [selectedInvitation, data?.generalEntries, activeProject, rowRemarks]);

  const invitationDetailedRows = useMemo(() => {
    if (!selectedInvitation) return [];
    return findDetailedRowsForInvitation(selectedInvitation, data?.detailedItems || []);
  }, [selectedInvitation, data?.detailedItems]);

  const filteredMerDetailedRows = useMemo(() => {
    const q = merRowSearch.trim().toLowerCase();
    if (!q) return invitationDetailedRows;
    return invitationDetailedRows.filter((d) =>
      [d.shipmentNo, d.packageNo, d.itemNo, d.itemCode, d.description, d.generalDescription]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [invitationDetailedRows, merRowSearch]);

  const suggestedMerNo = useMemo(() => {
    const supplier = autoFill?.supplier || selectedInvitation?.supplier || '';
    const existingMerNos = (data?.osdrReports || []).map((r) => r.reportNo);
    return generateMerReportNo(supplier, existingMerNos, extractPlantDocConfig(activeProject));
  }, [autoFill?.supplier, selectedInvitation?.supplier, data?.osdrReports, activeProject]);

  // Auto-populate unique MER number when user picks has_discrepancy
  useEffect(() => {
    if (resultStatus === 'has_discrepancy' && !merReportNoTouched && suggestedMerNo) {
      setMerReportNo(suggestedMerNo);
    }
  }, [resultStatus, merReportNoTouched, suggestedMerNo]);

  const selectedMerCount = useMemo(
    () => Object.values(merDrafts).filter((d) => d.checked).length,
    [merDrafts],
  );

  const handleSelectInvitation = (inv: OpiInvitationRecord) => {
    setSelectedInvId(inv.id);
    const initialRemarks: Record<number, string> = {};
    (inv.items || []).forEach((it, idx) => {
      if (it.remarks) initialRemarks[idx] = it.remarks;
    });
    setRowRemarks(initialRemarks);
    setOtherNotes('');
    setResultStatus('compliant');
    setMerDrafts({});
    setMerReportNo('');
    setMerReportNoTouched(false);
    setMerRowSearch('');
  };

  const resetForm = useCallback(() => {
    setEditingMinutes(null);
    setSelectedInvId('');
    setRowRemarks({});
    setOtherNotes('');
    setResultStatus('compliant');
    setMerReportNo('');
    setMerReportNoTouched(false);
    setMerRowSearch('');
    setMerDrafts({});
  }, []);

  const findLinkedMer = useCallback(
    (rec: OpiMinutesRecord): OsdrReportRecord | null => {
      const reports = data?.osdrReports || [];
      if (rec.linkedMerId) {
        const byId = reports.find((r) => r.id === rec.linkedMerId);
        if (byId) return byId;
      }
      if (rec.merNo) {
        const byNo = reports.find((r) => r.reportNo === rec.merNo);
        if (byNo) return byNo;
      }
      const byMinId = reports.find((r) => r.opiMinutesId === rec.id);
      if (byMinId) return byMinId;
      return null;
    },
    [data?.osdrReports],
  );

  const startEditMinutes = (rec: OpiMinutesRecord) => {
    setViewMode('create');
    setEditingMinutes(rec);
    const inv = (data?.invitations || []).find(
      (i) => (rec.invitationId && i.id === rec.invitationId) || i.invitationNo === rec.invitationNo,
    );
    setSelectedInvId(inv ? inv.id : rec.id);

    const nextRemarks: Record<number, string> = {};
    (rec.items || []).forEach((it, idx) => {
      nextRemarks[idx] = it.remarks || '';
    });
    setRowRemarks(nextRemarks);
    setOtherNotes(rec.notes || '');
    setResultStatus(rec.resultStatus || 'compliant');

    const linkedMer = findLinkedMer(rec);
    if (linkedMer) {
      setMerReportNo(linkedMer.reportNo);
      setMerReportNoTouched(true);
      const nextDrafts: Record<string, MerRowDraft> = {};
      for (const item of linkedMer.items || []) {
        const discQty =
          item.discrepantQty !== undefined
            ? item.discrepantQty
            : item.discrepancyType === 'shortage'
              ? item.shortage
              : item.damagedQty;
        nextDrafts[item.detailedId] = {
          checked: true,
          category: item.discrepancyType === 'shortage' ? 'shortage' : 'damaged',
          discrepantQty: String(discQty ?? 0),
          discrepancyText: item.discrepancyReason || '',
          remark: item.remarks || '',
        };
      }
      setMerDrafts(nextDrafts);
    } else {
      setMerReportNo(rec.merNo || '');
      setMerReportNoTouched(Boolean(rec.merNo));
      setMerDrafts({});
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const findLinkedMinutesForMer = useCallback(
    (rep: OsdrReportRecord): OpiMinutesRecord | null => {
      const minutes = data?.minutes || [];
      if (rep.opiMinutesId) {
        const byId = minutes.find((m) => m.id === rep.opiMinutesId);
        if (byId) return byId;
      }
      const byLinkedMerId = minutes.find((m) => m.linkedMerId === rep.id);
      if (byLinkedMerId) return byLinkedMerId;
      if (rep.reportNo) {
        const byMerNo = minutes.find((m) => m.merNo === rep.reportNo);
        if (byMerNo) return byMerNo;
      }
      if (rep.opiMinutesNo) {
        const byMinNo = minutes.find((m) => m.minutesNo === rep.opiMinutesNo);
        if (byMinNo) return byMinNo;
      }
      return null;
    },
    [data?.minutes],
  );

  const startEditMer = (rep: OsdrReportRecord) => {
    const linkedMin = findLinkedMinutesForMer(rep);
    if (linkedMin) {
      startEditMinutes(linkedMin);
      return;
    }
    setEditingStandaloneMer(rep);
    setStandaloneMerReportNo(rep.reportNo);
    setStandaloneMerDate(rep.date);
    setStandaloneMerNotes(rep.notes || '');
    setStandaloneMerItems(
      (rep.items || []).map((item) => {
        const cat: MerDiscrepancyCategory =
          item.discrepancyType === 'shortage' ? 'shortage' : 'damaged';
        const disc =
          item.discrepantQty !== undefined
            ? item.discrepantQty
            : cat === 'shortage'
              ? item.shortage
              : item.damagedQty;
        return {
          item,
          category: cat,
          discrepantQty: String(disc ?? 0),
          remarks: item.remarks || '',
        };
      }),
    );
  };

  const handleSaveStandaloneMer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStandaloneMer) return;
    const cleanNo = standaloneMerReportNo.trim();
    if (!cleanNo) {
      notify(
        'warning',
        isFa ? 'شماره گزارش مغایرت (MER) الزامی است.' : 'MER Report No. is required.',
      );
      return;
    }
    const nextItems: OsdrReportItem[] = [];
    for (const row of standaloneMerItems) {
      const parsedQty = Number(row.discrepantQty === '' ? 0 : row.discrepantQty);
      if (!Number.isFinite(parsedQty) || parsedQty < 0) {
        notify(
          'warning',
          isFa
            ? `مقدار مغایرت/کسری برای آیتم ${row.item.itemNo || row.item.packageNo} باید عددی و غیرمنفی باشد.`
            : `Discrepant Quantity for item ${row.item.itemNo || row.item.packageNo} must be a non-negative number.`,
        );
        return;
      }
      const pkgQty = Number(row.item.packingQty ?? 0);
      const safeDisc = Math.max(0, Math.round((parsedQty + Number.EPSILON) * 1000) / 1000);
      const recvQty = computeMerReceivedQty(pkgQty, row.category, safeDisc);
      nextItems.push({
        ...row.item,
        actualQty: recvQty,
        shortage: row.category === 'shortage' ? safeDisc : 0,
        surplus: 0,
        damagedQty: row.category === 'damaged' ? safeDisc : 0,
        discrepantQty: safeDisc,
        discrepancyType: row.category,
        discrepancyReason: String(safeDisc),
        remarks: row.remarks.trim(),
      });
    }

    setSavingStandaloneMer(true);
    try {
      const res = await apiRequest<{ report: OsdrReportRecord }>(
        `/api/osdr/${editingStandaloneMer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            reportNo: cleanNo,
            date: standaloneMerDate || editingStandaloneMer.date,
            packingListNo: editingStandaloneMer.packingListNo,
            items: nextItems,
            notes: standaloneMerNotes.trim(),
          }),
        },
      );
      notify(
        'success',
        isFa
          ? `گزارش مغایرت شماره ${res.report.reportNo} ویرایش و همگام‌سازی شد.`
          : `MER Report ${res.report.reportNo} updated and synced.`,
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              osdrReports: (prev.osdrReports || []).map((r) =>
                r.id === res.report.id ? res.report : r,
              ),
            }
          : prev,
      );
      setEditingStandaloneMer(null);
      setPrintBundleWasUndone(false);
      setPrintBundle({ minutes: null, mer: res.report });
      triggerAutoSnapshot(`Edit MER ${res.report.reportNo}`);
      onDataChanged();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSavingStandaloneMer(false);
    }
  };

  const toggleMerRow = (row: DetailedComputed) => {
    setMerDrafts((prev) => {
      const existing = prev[row.id];
      if (existing?.checked) {
        return { ...prev, [row.id]: { ...existing, checked: false } };
      }
      return {
        ...prev,
        [row.id]: existing
          ? { ...existing, checked: true, discrepancyText: existing.discrepantQty }
          : {
              checked: true,
              category: 'shortage',
              discrepantQty: '1',
              discrepancyText: '1',
              remark: '',
            },
      };
    });
  };

  const updateMerDraft = (rowId: string, patch: Partial<MerRowDraft>) => {
    setMerDrafts((prev) => {
      const cur: MerRowDraft = prev[rowId] || {
        checked: true,
        category: 'shortage',
        discrepantQty: '0',
        discrepancyText: '0',
        remark: '',
      };
      const merged: MerRowDraft = { ...cur, ...patch };
      if (patch.discrepantQty !== undefined) {
        merged.discrepancyText = patch.discrepantQty;
      }
      return { ...prev, [rowId]: merged };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvitation || !autoFill) {
      notify(
        'warning',
        isFa ? 'ابتدا یک دعوتنامه گشایش باز را انتخاب کنید.' : 'Please select an open OPI Invitation first.',
      );
      return;
    }

    let merPayload: Partial<OsdrReportRecord> | undefined;
    let finalMerNo = '';

    if (resultStatus === 'has_discrepancy') {
      finalMerNo = (merReportNo || suggestedMerNo).trim();
      if (!finalMerNo) {
        notify(
          'warning',
          isFa ? 'شماره گزارش مغایرت (MER) الزامی است.' : 'MER Report No. is required.',
        );
        return;
      }

      const checkedRows = invitationDetailedRows.filter((d) => merDrafts[d.id]?.checked);
      if (checkedRows.length === 0) {
        notify(
          'warning',
          isFa
            ? 'حداقل یک ردیف دارای کسری یا مغایرت/آسیب‌دیدگی را تیک بزنید.'
            : 'Please select at least one discrepant item for the MER report.',
        );
        return;
      }

      const merItems: OsdrReportItem[] = [];
      for (const row of checkedRows) {
        const draft = merDrafts[row.id];
        const parsedQty = Number(draft.discrepantQty === '' ? 0 : draft.discrepantQty);
        if (!Number.isFinite(parsedQty) || parsedQty < 0) {
          notify(
            'warning',
            isFa
              ? `مقدار Discrepant Quantity برای آیتم ${row.itemNo || row.packageNo} باید عددی و غیرمنفی باشد.`
              : `Discrepant Quantity for item ${row.itemNo || row.packageNo} must be a non-negative number.`,
          );
          return;
        }
        merItems.push(
          buildMerReportItem({
            detailed: row,
            category: draft.category,
            discrepantQty: parsedQty,
            discrepancyText: draft.discrepancyText,
            remark: draft.remark,
          }),
        );
      }

      merPayload = {
        reportNo: finalMerNo,
        date: autoFill.date,
        opiMinutesNo: autoFill.minutesNo,
        opiNo: autoFill.invitationNo,
        opiDate: autoFill.date,
        packingListNo: autoFill.packingListNo,
        projectName: activeProject?.name || selectedInvitation.projectName || '',
        contractNo: autoFill.contractNo,
        system: autoFill.system,
        island: autoFill.island,
        unit: autoFill.unit,
        supplier: autoFill.supplier,
        items: merItems,
        notes: otherNotes.trim(),
      };
    }

    const payload = {
      minutesNo: autoFill.minutesNo,
      invitationId: selectedInvitation.id,
      invitationNo: autoFill.invitationNo,
      date: autoFill.date,
      time: autoFill.time,
      location: autoFill.location,
      packingListNo: autoFill.packingListNo,
      packingNos: autoFill.packingNos,
      packageNos: Array.from(new Set(autoFill.items.map((it) => it.packageNo).filter(Boolean))),
      projectName: activeProject?.name || selectedInvitation.projectName || '',
      supplier: autoFill.supplier,
      system: autoFill.system,
      island: autoFill.island,
      unit: autoFill.unit,
      contractNo: autoFill.contractNo,
      purchasePackageNo: autoFill.purchasePackageNo,
      items: autoFill.items,
      resultStatus,
      merNo: finalMerNo,
      notes: otherNotes.trim(),
      merPayload: resultStatus === 'has_discrepancy' ? merPayload : null,
    };

    setSubmitting(true);
    try {
      if (editingMinutes) {
        const res = await apiRequest<{ record: OpiMinutesRecord; merReport?: OsdrReportRecord }>(
          `/api/opi-minutes/${editingMinutes.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        );
        notify(
          'success',
          res.merReport
            ? isFa
              ? `صورتجلسه ${res.record.minutesNo} و گزارش مغایرت ${res.merReport.reportNo} ویرایش و همگام‌سازی شدند.`
              : `OPI Minutes ${res.record.minutesNo} and MER ${res.merReport.reportNo} updated.`
            : isFa
              ? `صورتجلسه گشایش شماره ${res.record.minutesNo} ویرایش شد.`
              : `OPI Minutes ${res.record.minutesNo} updated.`,
        );
        resetForm();
        setData((prev) =>
          prev
            ? {
                ...prev,
                minutes: (prev.minutes || []).map((m) =>
                  m.id === res.record.id ? res.record : m,
                ),
                osdrReports: res.merReport
                  ? (prev.osdrReports || []).some((r) => r.id === res.merReport!.id)
                    ? (prev.osdrReports || []).map((r) =>
                        r.id === res.merReport!.id ? res.merReport! : r,
                      )
                    : [res.merReport, ...(prev.osdrReports || [])]
                  : prev.osdrReports || [],
              }
            : prev,
        );
        setPrintBundleWasUndone(false);
        setPrintBundle({ minutes: res.record, mer: res.merReport || null });
        triggerAutoSnapshot(`Edit OPI Minutes ${res.record.minutesNo}`);
        onDataChanged();
        await loadData();
      } else {
        const res = await apiRequest<{ record: OpiMinutesRecord; merReport?: OsdrReportRecord }>(
          '/api/opi-minutes',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
        notify(
          'success',
          res.merReport
            ? isFa
              ? `صورتجلسه ${res.record.minutesNo} همراه با گزارش مغایرت ${res.merReport.reportNo} صادر و در جدول جزئیات ثبت شد.`
              : `OPI Minutes ${res.record.minutesNo} and MER ${res.merReport.reportNo} issued and synced.`
            : isFa
              ? `صورتجلسه گشایش شماره ${res.record.minutesNo} صادر و در جدول جزئیات ثبت شد.`
              : `OPI Minutes ${res.record.minutesNo} issued and synced to Detailed Equipment.`,
        );
        resetForm();
        setData((prev) =>
          prev
            ? {
                ...prev,
                minutes: [
                  res.record,
                  ...(prev.minutes || []).filter((m) => m.id !== res.record.id),
                ],
                osdrReports: res.merReport
                  ? [
                      res.merReport,
                      ...(prev.osdrReports || []).filter((r) => r.id !== res.merReport!.id),
                    ]
                  : prev.osdrReports || [],
                invitations: (prev.invitations || []).map((inv) =>
                  inv.id === selectedInvitation.id ||
                  inv.invitationNo === selectedInvitation.invitationNo
                    ? { ...inv, status: 'completed' as const }
                    : inv,
                ),
              }
            : prev,
        );
        setPrintBundleWasUndone(false);
        setPrintBundle({ minutes: res.record, mer: res.merReport || null });
        triggerAutoSnapshot(
          res.merReport
            ? `OPI Minutes ${res.record.minutesNo} + MER ${res.merReport.reportNo}`
            : `OPI Minutes ${res.record.minutesNo}`,
        );
        onDataChanged();
        await loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteMinutes = async () => {
    if (!deleteMinutesTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/opi-minutes/${deleteMinutesTarget.id}`, {
        method: 'DELETE',
      });
      notify(
        'success',
        isFa
          ? `صورتجلسه ${deleteMinutesTarget.minutesNo} حذف و وضعیت جدول جزئیات و دعوتنامه بازگردانی شد.`
          : `OPI Minutes ${deleteMinutesTarget.minutesNo} deleted and reverted.`,
      );
      if (editingMinutes?.id === deleteMinutesTarget.id) resetForm();
      if (printBundle?.minutes?.id === deleteMinutesTarget.id) setPrintBundle(null);
      setDeleteMinutesTarget(null);
      triggerAutoSnapshot(`Delete OPI Minutes ${deleteMinutesTarget.minutesNo}`);
      onDataChanged();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDeleteMer = async () => {
    if (!deleteMerTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/osdr/${deleteMerTarget.id}`, {
        method: 'DELETE',
      });
      notify(
        'success',
        isFa
          ? `گزارش مغایرت ${deleteMerTarget.reportNo} حذف و جدول جزئیات بازگردانی شد.`
          : `MER ${deleteMerTarget.reportNo} deleted and reverted.`,
      );
      if (printBundle?.mer?.id === deleteMerTarget.id) setPrintBundle(null);
      setDeleteMerTarget(null);
      triggerAutoSnapshot(`Delete MER ${deleteMerTarget.reportNo}`);
      onDataChanged();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const minutesList = useMemo(() => data?.minutes || [], [data]);
  const merList = useMemo(() => data?.osdrReports || [], [data]);

  const filteredMinutes = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return minutesList;
    return minutesList.filter((m) =>
      [m.minutesNo, m.invitationNo, m.packingListNo, m.supplier, m.location, m.merNo]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [minutesList, historySearch]);

  const filteredMers = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return merList;
    return merList.filter((r) =>
      [
        r.reportNo,
        r.opiNo,
        r.opiMinutesNo,
        r.packingListNo,
        r.supplier,
        ...r.items.map((it) => `${it.itemNo} ${it.itemCode} ${it.description}`),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [merList, historySearch]);

  const minutesPagination = useClientPagination(filteredMinutes, 50);
  const merPagination = useClientPagination(filteredMers, 50);

  const minutesReportColumns = useMemo<PrintColumnDef<OpiMinutesRecord>[]>(
    () => [
      { key: 'minutesNo', header: isFa ? 'شماره OPI' : 'OPI No.', getValue: (r) => r.minutesNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'time', header: isFa ? 'ساعت' : 'Time', getValue: (r) => r.time || '' },
      { key: 'location', header: isFa ? 'محل انجام OPI' : 'Location', getValue: (r) => r.location || '' },
      { key: 'packingListNo', header: 'Packing List No.', getValue: (r) => r.packingListNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      {
        key: 'resultStatus',
        header: isFa ? 'وضعیت مغایرت' : 'Result',
        getValue: (r) =>
          r.resultStatus === 'has_discrepancy'
            ? isFa
              ? `دارای مغایرت (${r.merNo || '-'})`
              : `Discrepancy (${r.merNo || '-'})`
            : isFa
              ? 'فاقد مغایرت'
              : 'Compliant',
      },
      { key: 'createdBy', header: isFa ? 'ثبت‌کننده' : 'Created By', getValue: (r) => r.createdBy },
    ],
    [t, isFa],
  );

  const printPortalOrientation = useMemo<'portrait' | 'landscape' | 'mixed'>(() => {
    if (printBundle?.minutes && printBundle?.mer) return 'mixed';
    if (printBundle?.mer && !printBundle?.minutes) return 'landscape';
    return 'portrait';
  }, [printBundle]);

  return (
    <div className="space-y-5" data-testid="opi-minutes-view">
      {/* Isolated Print Portal (Portrait OPI Minutes + Landscape MER in a single job when both exist) */}
      {printBundle && !printReportOpen
        ? createPortal(
            <div id="samaan-opi-minutes-print-root" data-samaan-print-portal="true">
              <style>
                {buildIsolatedPrintPortalCss('samaan-opi-minutes-print-root', {
                  orientation: printPortalOrientation,
                  isFa,
                  marginMm: 8,
                  extraPrintCss: `
                    #samaan-opi-minutes-print-root table th,
                    #samaan-opi-minutes-print-root table td {
                      text-align: center;
                      vertical-align: middle;
                    }
                  `,
                })}
              </style>
              {printBundle.minutes && (
                <OfficialOpiMinutesSheet
                  record={printBundle.minutes}
                  formatDate={formatDate}
                  pageBreakAfter={Boolean(printBundle.mer)}
                />
              )}
              {printBundle.mer && (
                <OfficialMerSheet report={printBundle.mer} formatDate={formatDate} />
              )}
            </div>,
            document.body,
          )
        : null}

      {/* Top Mode Bar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {isFa ? MD1_OPI_MINUTES_TITLE_FA : MD1_OPI_MINUTES_TITLE_EN}
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                {formCode} · {MD1_MER_FORM_CODE}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {isFa
                ? 'انتخاب از دعوتنامه‌های باز OPI، ثبت صورتجلسه گشایش و صدور خودکار و هم‌زمان گزارش مغایرت (MER) در صورت وجود کسری یا آسیب‌دیدگی'
                : 'Select an open OPI Invitation, issue OPI Minutes of Meeting, and automatically issue linked MER on discrepancy'}
            </p>
          </div>
        </div>

        <OperationalViewModeTabs
          viewMode={viewMode}
          onChange={(mode) => {
            setViewMode(mode);
            if (mode === 'history' && editingMinutes) resetForm();
          }}
          historyCount={minutesList.length}
          isFa={isFa}
          canCreate={canEdit}
          isEditing={Boolean(editingMinutes)}
          testIdPrefix="opi-minutes"
        />
      </div>

      {/* CREATE / EDIT WORKFLOW */}
      {canEdit && viewMode === 'create' && (
        <div className="space-y-4 print:hidden">
          {!selectedInvitation || !autoFill ? (
            /* STEP 1: SELECT OPEN OPI INVITATION */
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    {isFa
                      ? `مرحله ۱: انتخاب دعوتنامه گشایش باز (${openInvitations.length} دعوتنامه در انتظار صورتجلسه)`
                      : `Step 1: Select an Open OPI Invitation (${openInvitations.length} pending)`}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {isFa
                      ? 'دعوتنامه‌هایی که قبلاً برای آن‌ها صورتجلسه صادر شده، به‌صورت خودکار از این فهرست حذف می‌شوند.'
                      : 'Invitations that already have an OPI Minutes record are automatically excluded.'}
                  </p>
                </div>

                <div className="w-full sm:w-72">
                  <SearchInputWithClear
                    value={invSearch}
                    onChange={setInvSearch}
                    placeholder={
                      isFa ? 'جستجو در شماره دعوتنامه، پکینگ، تامین‌کننده...' : 'Search invitation, packing...'
                    }
                  />
                </div>
              </div>

              {loading && openInvitations.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  {isFa ? 'در حال بارگذاری دعوتنامه‌های باز...' : 'Loading open invitations...'}
                </div>
              ) : filteredOpenInvitations.length === 0 ? (
                <div
                  data-testid="opi-minutes-no-open-invitations"
                  className="p-8 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)]/50 text-center space-y-2"
                >
                  <ClipboardCheck className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? 'هیچ دعوتنامه گشایش بازی برای صدور صورتجلسه یافت نشد.'
                      : 'No open OPI Invitations available.'}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isFa
                      ? 'ابتدا در بخش «دعوتنامه گشایش بسته‌ها» یک دعوتنامه صادر کنید یا از تب «سابقه فرم‌ها» صورتجلسه‌های ثبت‌شده را مشاهده نمایید.'
                      : 'Issue an OPI Invitation first, or check Form History for existing minutes.'}
                  </p>
                </div>
              ) : (
                <StickyTableWrapper maxHeightClass="max-h-[56vh]">
                  <table className="w-full text-xs border-collapse" data-testid="opi-open-invitations-table">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 text-start">{isFa ? 'شماره دعوتنامه OPI' : 'Invitation No.'}</th>
                        <th className="p-2.5 text-center">{isFa ? 'تاریخ' : 'Date'}</th>
                        <th className="p-2.5 text-center">{isFa ? 'ساعت' : 'Time'}</th>
                        <th className="p-2.5 text-start">{isFa ? 'محل انجام OPI' : 'Location'}</th>
                        <th className="p-2.5 text-start">{isFa ? 'تامین‌کننده' : 'Supplier'}</th>
                        <th className="p-2.5 text-start">{isFa ? 'شماره پکینگ‌ها' : 'Packing Lists'}</th>
                        <th className="p-2.5 text-center">{isFa ? 'ردیف‌ها' : 'Items'}</th>
                        <th className="p-2.5 text-center">{isFa ? 'انتخاب' : 'Select'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {filteredOpenInvitations.map((inv) => (
                        <tr
                          key={inv.id}
                          data-testid={`open-inv-row-${inv.invitationNo}`}
                          onClick={() => handleSelectInvitation(inv)}
                          className="hover:bg-[var(--accent-soft)]/40 cursor-pointer transition-colors"
                        >
                          <td className="p-2.5 font-mono font-bold text-[var(--accent-primary)] tabular-nums" dir="ltr">
                            {inv.invitationNo}
                          </td>
                          <td className="p-2.5 text-center tabular-nums" dir="ltr">
                            {formatDate(inv.date)}
                          </td>
                          <td className="p-2.5 text-center tabular-nums" dir="ltr">
                            {inv.time || '-'}
                          </td>
                          <td className="p-2.5 bidi-plaintext">{inv.location || '-'}</td>
                          <td className="p-2.5 bidi-plaintext">{inv.supplier || '-'}</td>
                          <td className="p-2.5 font-mono text-[11px]" dir="ltr">
                            {(inv.packingNos || []).join(' ، ') || '-'}
                          </td>
                          <td className="p-2.5 text-center font-bold tabular-nums">
                            {inv.items?.length || inv.packingNos?.length || 0}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              data-testid={`select-open-inv-btn-${inv.invitationNo}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectInvitation(inv);
                              }}
                              className="h-7 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-[11px] font-bold inline-flex items-center gap-1"
                            >
                              <span>{isFa ? 'انتخاب' : 'Select'}</span>
                              {isFa ? <ArrowLeft className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </StickyTableWrapper>
              )}
            </div>
          ) : (
            /* STEP 2: COMPLETE MINUTES, OPTIONAL REMARKS & CONDITIONAL MER */
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
            >
              {/* Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 flex-wrap">
                  {!editingMinutes && (
                    <button
                      type="button"
                      data-testid="opi-minutes-change-inv-btn"
                      onClick={() => resetForm()}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>{isFa ? 'تغییر دعوتنامه' : 'Change Invitation'}</span>
                    </button>
                  )}
                  <span className="text-xs font-extrabold text-[var(--text-primary)]">
                    {isFa ? 'دعوتنامه انتخاب‌شده:' : 'Selected Invitation:'}{' '}
                    <span dir="ltr" className="font-mono text-[var(--accent-primary)]">
                      {autoFill.invitationNo}
                    </span>
                  </span>
                  {editingMinutes && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                      {isFa ? 'حالت ویرایش صورتجلسه' : 'Editing Minutes'}
                    </span>
                  )}
                </div>

                {editingMinutes && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t.controls.cancel}</span>
                  </button>
                )}
              </div>

              {/* Auto-Filled OPI Minutes Metadata Strip */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-[11.5px]">
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'شماره OPI / دعوتنامه' : 'OPI / Inv. No.'}
                  </span>
                  <strong dir="ltr" className="font-mono text-[var(--accent-primary)]">
                    {autoFill.invitationNo}
                  </strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'تاریخ و ساعت OPI' : 'Date & Time'}
                  </span>
                  <strong dir="ltr" className="tabular-nums">
                    {formatDate(autoFill.date)} {autoFill.time ? `· ${autoFill.time}` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'محل انجام OPI' : 'Location'}
                  </span>
                  <strong className="bidi-plaintext">{autoFill.location || '-'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'تامین‌کننده' : 'Supplier'}
                  </span>
                  <strong className="bidi-plaintext">{autoFill.supplier || '-'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'سیستم / جزیره / واحد' : 'System / Island / Unit'}
                  </span>
                  <strong className="bidi-plaintext">
                    {[autoFill.system, autoFill.island, autoFill.unit].filter(Boolean).join(' / ') || '-'}
                  </strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'پروژه' : 'Project'}
                  </span>
                  <strong>{autoFill.projectBareName || '-'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'شماره قرارداد/درخواست خرید' : 'Contract / PR No.'}
                  </span>
                  <strong dir="ltr" className="font-mono">
                    {autoFill.contractNo || '-'}
                  </strong>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'شماره بسته خرید' : 'Purchase Package No.'}
                  </span>
                  <strong dir="ltr" className="font-mono">
                    {autoFill.purchasePackageNo || '-'}
                  </strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[var(--text-muted)] block text-[10.5px]">
                    {isFa ? 'پکینگ لیست‌ها' : 'Packing Lists'}
                  </span>
                  <strong dir="ltr" className="font-mono">
                    {autoFill.packingListNo || '-'}
                  </strong>
                </div>
              </div>

              {/* Invitation Packages Table with Optional Per-Row Remarks */}
              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-[var(--text-primary)]">
                  {isFa
                    ? `بسته‌های دعوتنامه (${autoFill.items.length} ردیف) — امکان درج توضیحات اختیاری برای هر ردیف`
                    : `Invitation Packages (${autoFill.items.length} rows) — Optional Per-Row Remarks`}
                </h4>
                <StickyTableWrapper maxHeightClass="max-h-[260px]">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-center w-12">Item No.</th>
                        <th className="p-2 text-start">Packing List No.</th>
                        <th className="p-2 text-start">Package No.</th>
                        <th className="p-2 text-start">{isFa ? 'شرح (کالا/تجهیز)' : 'Description'}</th>
                        <th className="p-2 text-center">{isFa ? 'واحد (UOM)' : 'UOM'}</th>
                        <th className="p-2 text-start min-w-[200px]">{isFa ? 'توضیحات (اختیاری)' : 'Remarks'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {autoFill.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-center tabular-nums font-semibold">{idx + 1}</td>
                          <td className="p-2 font-mono tabular-nums" dir="ltr">
                            {it.packingListNo}
                          </td>
                          <td className="p-2 font-mono tabular-nums" dir="ltr">
                            {it.packageNo}
                          </td>
                          <td className="p-2 bidi-plaintext">{it.description}</td>
                          <td className="p-2 text-center">{it.uom}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              data-testid={`opi-minutes-row-remark-${idx}`}
                              value={rowRemarks[idx] ?? it.remarks ?? ''}
                              onChange={(e) =>
                                setRowRemarks((prev) => ({ ...prev, [idx]: e.target.value }))
                              }
                              placeholder={isFa ? 'توضیحات...' : 'Remarks...'}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </StickyTableWrapper>
              </div>

              {/* Outcome Selection (2 Verbatim Radio Cards) */}
              <div className="space-y-2.5">
                <label className="block text-xs font-extrabold text-[var(--text-primary)]">
                  {isFa ? 'نتیجه گشایش و بازرسی بسته‌ها *' : 'Inspection Outcome *'}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="opi-outcome-compliant"
                    onClick={() => setResultStatus('compliant')}
                    className={`p-3.5 rounded-xl border text-start flex items-start gap-3 transition-all ${
                      resultStatus === 'compliant'
                        ? 'border-emerald-500 bg-emerald-500/10 text-[var(--text-primary)] shadow-xs'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        resultStatus === 'compliant'
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-[var(--text-muted)]'
                      }`}
                    >
                      {resultStatus === 'compliant' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{MD1_OPI_MINUTES_COMPLIANT_LABEL}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isFa
                          ? 'شماره و تاریخ OPI روی تمام ردیف‌های جزئیات این پکینگ‌ها ثبت شده و صورتجلسه صادر می‌شود.'
                          : 'Syncs OPI No. & Date to all Detailed rows and issues the OPI Minutes.'}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="opi-outcome-discrepancy"
                    onClick={() => setResultStatus('has_discrepancy')}
                    className={`p-3.5 rounded-xl border text-start flex items-start gap-3 transition-all ${
                      resultStatus === 'has_discrepancy'
                        ? 'border-amber-500 bg-amber-500/10 text-[var(--text-primary)] shadow-xs'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        resultStatus === 'has_discrepancy'
                          ? 'border-amber-600 bg-amber-600'
                          : 'border-[var(--text-muted)]'
                      }`}
                    >
                      {resultStatus === 'has_discrepancy' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isFa
                            ? 'محموله‌ی بالا دارای مغایرت است.'
                            : 'Shipment has discrepancy — issue linked MER report'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isFa
                          ? 'اقلام دارای کسری یا مغایرت/آسیب‌دیدگی را زیر انتخاب کنید تا فرم MER هم‌زمان با صورتجلسه صادر و چاپ شود.'
                          : 'Select discrepant Detailed rows below to issue and print the official MER form together with Minutes.'}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* CONDITIONAL MER DISCREPANCY BUILDER (MD1EX-FQP02/12-03) */}
              {resultStatus === 'has_discrepancy' && (
                <div
                  data-testid="opi-mer-builder"
                  className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileWarning className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <h4 className="text-xs font-extrabold text-[var(--text-primary)]">
                          {isFa
                            ? `${MD1_MER_TITLE_FA} (${MD1_MER_FORM_CODE})`
                            : `${MD1_MER_TITLE_EN} (${MD1_MER_FORM_CODE})`}
                        </h4>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {isFa
                            ? `ردیف‌های دارای کسری یا مغایرت/آسیب‌دیدگی را تیک بزنید (${selectedMerCount} قلم انتخاب‌شده از ${invitationDetailedRows.length} ردیف جزئیات)`
                            : `Check discrepant items (${selectedMerCount} selected of ${invitationDetailedRows.length} Detailed rows)`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div>
                        <label className="block text-[10.5px] font-semibold text-[var(--text-secondary)] mb-0.5">
                          {isFa ? 'شماره گزارش MER (خودکار و یکتا) *' : 'MER Report No. *'}
                        </label>
                        <input
                          type="text"
                          required
                          data-testid="mer-report-no-input"
                          dir="ltr"
                          value={merReportNo}
                          onChange={(e) => {
                            setMerReportNo(e.target.value);
                            setMerReportNoTouched(true);
                          }}
                          placeholder={suggestedMerNo}
                          className="h-9 w-44 px-3 rounded-lg border border-amber-500/50 bg-[var(--bg-surface)] text-xs font-mono font-bold tabular-nums text-left focus:outline-none focus:border-amber-600"
                        />
                      </div>

                      <div className="w-56 self-end">
                        <SearchInputWithClear
                          value={merRowSearch}
                          onChange={setMerRowSearch}
                          placeholder={isFa ? 'فیلتر اقلام جزئیات...' : 'Filter Detailed rows...'}
                        />
                      </div>
                    </div>
                  </div>

                  {invitationDetailedRows.length === 0 ? (
                    <div className="p-6 text-center rounded-xl border border-dashed border-amber-500/40 bg-[var(--bg-surface)] text-xs text-amber-800 dark:text-amber-300">
                      {isFa
                        ? 'هیچ ردیفی در جدول «جزئیات تجهیزات» برای پکینگ‌های این دعوتنامه ثبت نشده است. برای صدور گزارش MER ابتدا اقلام این پکینگ باید در جزئیات تجهیزات موجود باشند.'
                        : 'No Detailed Equipment rows found for the packings in this invitation.'}
                    </div>
                  ) : (
                    <StickyTableWrapper maxHeightClass="max-h-[360px]">
                      <table className="w-full text-xs border-collapse" data-testid="mer-detailed-picker-table">
                        <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                          <tr>
                            <th className="p-2 text-center w-10">{isFa ? 'انتخاب' : 'Sel'}</th>
                            <th className="p-2 text-start">{isFa ? 'شماره آیتم' : 'Package Item'}</th>
                            <th className="p-2 text-start">{isFa ? 'کد کالا (تگ)' : 'Tag No.'}</th>
                            <th className="p-2 text-start">{isFa ? 'پکینگ / نگله' : 'PL/Package No.'}</th>
                            <th className="p-2 text-start">{isFa ? 'شرح کالا' : 'Description'}</th>
                            <th className="p-2 text-center">{isFa ? 'واحد' : 'UOM'}</th>
                            <th className="p-2 text-center">{isFa ? 'مقدار پکینگ' : 'Pkg Qty'}</th>
                            <th className="p-2 text-start min-w-[130px]">{isFa ? 'نوع مغایرت' : 'Category'}</th>
                            <th className="p-2 text-center w-24">{isFa ? 'تعداد مغایرت/کسری' : 'Discrepant Qty'}</th>
                            <th className="p-2 text-center w-20">{isFa ? 'مقدار دریافتی' : 'Received Qty'}</th>
                            <th className="p-2 text-center w-24">{isFa ? 'مغایرت' : 'Discrepancy'}</th>
                            <th className="p-2 text-start min-w-[140px]">{isFa ? 'توضیحات' : 'Remark'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
                          {filteredMerDetailedRows.map((row) => {
                            const draft = merDrafts[row.id];
                            const checked = Boolean(draft?.checked);
                            const pkgQty = Number(row.packingQty ?? 0);
                            const discNum = Number(draft?.discrepantQty === '' ? 0 : draft?.discrepantQty ?? 0);
                            const recvQty = computeMerReceivedQty(
                              pkgQty,
                              draft?.category || 'shortage',
                              Number.isFinite(discNum) && discNum >= 0 ? discNum : 0,
                            );

                            return (
                              <tr
                                key={row.id}
                                data-testid={`mer-row-${row.id}`}
                                className={checked ? 'bg-amber-500/10' : 'hover:bg-[var(--bg-subtle)]/40'}
                              >
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    data-testid={`mer-check-${row.id}`}
                                    checked={checked}
                                    onChange={() => toggleMerRow(row)}
                                    className="w-4 h-4 accent-amber-600 cursor-pointer"
                                  />
                                </td>
                                <td className="p-2 font-mono tabular-nums" dir="ltr">
                                  {row.itemNo || '-'}
                                </td>
                                <td className="p-2 font-mono tabular-nums" dir="ltr">
                                  {row.itemCode || '-'}
                                </td>
                                <td className="p-2 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                                  {[row.shipmentNo, row.packageNo].filter(Boolean).join(' / ')}
                                </td>
                                <td className="p-2 max-w-[200px]">
                                  <div className="line-clamp-2 bidi-plaintext">
                                    {row.description || row.generalDescription}
                                  </div>
                                </td>
                                <td className="p-2 text-center">{row.countingUnit || '-'}</td>
                                <td className="p-2 text-center font-bold tabular-nums">{pkgQty}</td>
                                <td className="p-2">
                                  {checked ? (
                                    <select
                                      data-testid={`mer-cat-${row.id}`}
                                      value={draft.category}
                                      onChange={(e) =>
                                        updateMerDraft(row.id, {
                                          category: e.target.value as MerDiscrepancyCategory,
                                        })
                                      }
                                      className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold"
                                    >
                                      <option value="shortage">{isFa ? 'کسری' : 'Shortage'}</option>
                                      <option value="damaged">{isFa ? 'مغایرت / آسیب‌دیدگی' : 'Discrepancy / Damaged'}</option>
                                    </select>
                                  ) : (
                                    <span className="text-[var(--text-muted)]">-</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {checked ? (
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      data-testid={`mer-qty-${row.id}`}
                                      dir="ltr"
                                      value={draft.discrepantQty}
                                      onChange={(e) =>
                                        updateMerDraft(row.id, { discrepantQty: e.target.value })
                                      }
                                      className="w-20 h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono font-bold text-center tabular-nums"
                                    />
                                  ) : (
                                    <span className="text-[var(--text-muted)] block text-center">-</span>
                                  )}
                                </td>
                                <td className="p-2 text-center font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {checked ? recvQty : '-'}
                                </td>
                                <td className="p-2 text-center">
                                  {checked ? (
                                    <span
                                      data-testid={`mer-reason-${row.id}`}
                                      dir="ltr"
                                      className="inline-flex items-center justify-center min-w-[44px] h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-mono font-bold tabular-nums text-[var(--text-primary)]"
                                    >
                                      {draft.discrepantQty || '0'}
                                    </span>
                                  ) : (
                                    <span className="text-[var(--text-muted)]">-</span>
                                  )}
                                </td>
                                <td className="p-2">
                                  {checked ? (
                                    <input
                                      type="text"
                                      data-testid={`mer-remark-${row.id}`}
                                      value={draft.remark}
                                      onChange={(e) =>
                                        updateMerDraft(row.id, { remark: e.target.value })
                                      }
                                      placeholder={isFa ? 'توضیحات...' : 'Remark...'}
                                      className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                                    />
                                  ) : (
                                    <span className="text-[var(--text-muted)]">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </StickyTableWrapper>
                  )}
                </div>
              )}

              {/* Other Notes */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'سایر توضیحات صورتجلسه (اختیاری)' : 'Other Notes (Optional)'}
                </label>
                <textarea
                  rows={2}
                  data-testid="opi-minutes-notes-input"
                  value={otherNotes}
                  onChange={(e) => setOtherNotes(e.target.value)}
                  placeholder={isFa ? 'سایر توضیحات...' : 'Other notes...'}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              {/* Submit Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  data-testid="opi-minutes-submit-btn"
                  disabled={submitting}
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isFa
                        ? 'در حال صدور...'
                        : 'Issuing...'
                      : resultStatus === 'has_discrepancy'
                        ? editingMinutes
                          ? isFa
                            ? 'ذخیره ویرایش صورتجلسه + گزارش MER'
                            : 'Save Minutes + MER Changes'
                          : isFa
                            ? 'صدور صورتجلسه + گزارش مغایرت (MER) و پیش‌نمایش چاپ'
                            : 'Issue Minutes + Linked MER & Print Preview'
                        : editingMinutes
                          ? isFa
                            ? 'ذخیره ویرایش صورتجلسه'
                            : 'Save Minutes Changes'
                          : isFa
                            ? 'صدور صورتجلسه گشایش و پیش‌نمایش چاپ'
                            : 'Issue OPI Minutes & Print Preview'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* HISTORY VIEW (OPI Minutes & Linked MER Reports) */}
      {viewMode === 'history' && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Sub-tabs for Minutes vs MER */}
            <div className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-1 gap-1">
              <button
                type="button"
                data-testid="opi-history-tab-minutes"
                onClick={() => setHistorySubTab('minutes')}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                  historySubTab === 'minutes'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isFa ? `صورتجلسه‌های گشایش (${minutesList.length})` : `OPI Minutes (${minutesList.length})`}
              </button>
              <button
                type="button"
                data-testid="opi-history-tab-mer"
                onClick={() => setHistorySubTab('mer')}
                className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                  historySubTab === 'mer'
                    ? 'bg-amber-600 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isFa ? `گزارش‌های مغایرت MER (${merList.length})` : `MER Reports (${merList.length})`}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-64 sm:w-72">
                <SearchInputWithClear
                  value={historySearch}
                  onChange={setHistorySearch}
                  placeholder={isFa ? 'جستجو در شماره OPI، MER، پکینگ...' : 'Search OPI, MER, packing...'}
                />
              </div>

              {historySubTab === 'minutes' && (
                <button
                  type="button"
                  onClick={() => setPrintReportOpen(true)}
                  disabled={filteredMinutes.length === 0}
                  className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{isFa ? 'چاپ فهرست' : 'Print List'}</span>
                </button>
              )}
            </div>
          </div>

          {historySubTab === 'minutes' ? (
            <>
              <StickyTableWrapper maxHeightClass="max-h-[60vh]">
                <table className="w-full text-xs border-collapse" data-testid="opi-minutes-history-table">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 text-center w-10">#</th>
                      <th className="p-2.5 text-start">{isFa ? 'شماره OPI' : 'OPI No.'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'تاریخ' : 'Date'}</th>
                      <th className="p-2.5 text-start">{isFa ? 'محل انجام OPI' : 'Location'}</th>
                      <th className="p-2.5 text-start">{isFa ? 'تامین‌کننده' : 'Supplier'}</th>
                      <th className="p-2.5 text-start">{isFa ? 'پکینگ لیست' : 'Packing List'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'وضعیت' : 'Status'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'اسکن امضاشده' : 'Signed Scan'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'عملیات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {loading && minutesList.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-[var(--text-muted)]">
                          {isFa ? 'در حال بارگذاری...' : 'Loading...'}
                        </td>
                      </tr>
                    ) : minutesPagination.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-[var(--text-muted)]">
                          {isFa ? 'هیچ صورتجلسه‌ای ثبت نشده است.' : 'No OPI Minutes recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      minutesPagination.pageItems.map((rec, idx) => {
                        const linkedMer = findLinkedMer(rec);
                        return (
                          <tr
                            key={rec.id}
                            data-testid={`opi-minutes-history-row-${rec.minutesNo}`}
                            onClick={() =>
                              setScanTarget({
                                collection: 'opiMinutes',
                                id: rec.id,
                                label: rec.minutesNo,
                                signedScan: rec.signedScan,
                              })
                            }
                            className="hover:bg-[var(--bg-subtle)]/50 cursor-pointer transition-colors"
                          >
                            <td className="p-2.5 text-center tabular-nums text-[var(--text-muted)]">
                              {(minutesPagination.page - 1) * minutesPagination.pageSize + idx + 1}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-[var(--accent-primary)] tabular-nums" dir="ltr">
                              {rec.minutesNo}
                            </td>
                            <td className="p-2.5 text-center tabular-nums" dir="ltr">
                              {formatDate(rec.date)}
                            </td>
                            <td className="p-2.5 bidi-plaintext">{rec.location || '-'}</td>
                            <td className="p-2.5 bidi-plaintext">{rec.supplier || '-'}</td>
                            <td className="p-2.5 font-mono text-[11px]" dir="ltr">
                              {rec.packingListNo || '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              {rec.resultStatus === 'has_discrepancy' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span dir="ltr" className="font-mono">
                                    {rec.merNo || (isFa ? 'دارای مغایرت' : 'MER')}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{isFa ? 'فاقد مغایرت' : 'Compliant'}</span>
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <SignedScanRowButton
                                signedScan={rec.signedScan}
                                recordLabel={rec.minutesNo}
                                onClick={() =>
                                  setScanTarget({
                                    collection: 'opiMinutes',
                                    id: rec.id,
                                    label: rec.minutesNo,
                                    signedScan: rec.signedScan,
                                  })
                                }
                              />
                            </td>
                            <td
                              className="p-2.5 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  data-testid={`opi-minutes-print-btn-${rec.minutesNo}`}
                                  onClick={() => {
                                    setPrintBundleWasUndone(false);
                                    setPrintBundle({ minutes: rec, mer: linkedMer });
                                  }}
                                  title={
                                    linkedMer
                                      ? isFa
                                        ? 'چاپ صورتجلسه و گزارش MER پیوست'
                                        : 'Print Minutes & Linked MER'
                                      : isFa
                                        ? 'پیش‌نمایش و چاپ صورتجلسه'
                                        : 'Print OPI Minutes'
                                  }
                                  className="p-1.5 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                {canEdit && (
                                  <>
                                    <button
                                      type="button"
                                      data-testid={`opi-minutes-edit-btn-${rec.minutesNo}`}
                                      onClick={() => startEditMinutes(rec)}
                                      title={isFa ? 'ویرایش' : 'Edit'}
                                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`opi-minutes-delete-btn-${rec.minutesNo}`}
                                      onClick={() => setDeleteMinutesTarget(rec)}
                                      title={isFa ? 'حذف' : 'Delete'}
                                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </StickyTableWrapper>

              <TablePaginationBar
                page={minutesPagination.page}
                totalPages={minutesPagination.totalPages}
                total={minutesPagination.total}
                pageSize={minutesPagination.pageSize}
                onPageChange={minutesPagination.setPage}
                onPageSizeChange={minutesPagination.setPageSize}
                lang={prefs.language}
              />
            </>
          ) : (
            <>
              <StickyTableWrapper maxHeightClass="max-h-[60vh]">
                <table className="w-full text-xs border-collapse" data-testid="mer-history-table">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 text-center w-10">#</th>
                      <th className="p-2.5 text-start">{isFa ? 'شماره MER' : 'MER No.'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'تاریخ' : 'Date'}</th>
                      <th className="p-2.5 text-start">{isFa ? 'شماره OPI' : 'OPI No.'}</th>
                      <th className="p-2.5 text-start">{isFa ? 'تامین‌کننده' : 'Supplier'}</th>
                      <th className="p-2.5 text-start">Packing List No.</th>
                      <th className="p-2.5 text-center">{isFa ? 'اقلام مغایرت' : 'Items'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'اسکن امضاشده' : 'Signed Scan'}</th>
                      <th className="p-2.5 text-center">{isFa ? 'عملیات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {merPagination.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-[var(--text-muted)]">
                          {isFa ? 'هیچ گزارش مغایرتی (MER) ثبت نشده است.' : 'No MER reports recorded yet.'}
                        </td>
                      </tr>
                    ) : (
                      merPagination.pageItems.map((rep, idx) => (
                        <tr
                          key={rep.id}
                          data-testid={`mer-history-row-${rep.reportNo}`}
                          onClick={() =>
                            setScanTarget({
                              collection: 'osdr',
                              id: rep.id,
                              label: rep.reportNo,
                              signedScan: rep.signedScan,
                            })
                          }
                          className="hover:bg-[var(--bg-subtle)]/50 cursor-pointer transition-colors"
                        >
                          <td className="p-2.5 text-center tabular-nums text-[var(--text-muted)]">
                            {(merPagination.page - 1) * merPagination.pageSize + idx + 1}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums" dir="ltr">
                            {rep.reportNo}
                          </td>
                          <td className="p-2.5 text-center tabular-nums" dir="ltr">
                            {formatDate(rep.date)}
                          </td>
                          <td className="p-2.5 font-mono tabular-nums" dir="ltr">
                            {rep.opiNo || rep.opiMinutesNo || '-'}
                          </td>
                          <td className="p-2.5 bidi-plaintext">{rep.supplier || '-'}</td>
                          <td className="p-2.5 font-mono text-[11px]" dir="ltr">
                            {rep.packingListNo || '-'}
                          </td>
                          <td className="p-2.5 text-center font-bold tabular-nums">{rep.items.length}</td>
                          <td className="p-2.5 text-center">
                            <SignedScanRowButton
                              signedScan={rep.signedScan}
                              recordLabel={rep.reportNo}
                              onClick={() =>
                                setScanTarget({
                                  collection: 'osdr',
                                  id: rep.id,
                                  label: rep.reportNo,
                                  signedScan: rep.signedScan,
                                })
                              }
                            />
                          </td>
                          <td
                            className="p-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                data-testid={`mer-print-btn-${rep.reportNo}`}
                                onClick={() => {
                                  setPrintBundleWasUndone(false);
                                  setPrintBundle({ minutes: null, mer: rep });
                                }}
                                title={isFa ? 'چاپ گزارش مغایرت MER' : 'Print MER Report'}
                                className="p-1.5 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  data-testid={`mer-edit-btn-${rep.reportNo}`}
                                  onClick={() => startEditMer(rep)}
                                  title={isFa ? 'ویرایش گزارش MER' : 'Edit MER Report'}
                                  className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  data-testid={`mer-delete-btn-${rep.reportNo}`}
                                  onClick={() => setDeleteMerTarget(rep)}
                                  title={isFa ? 'حذف گزارش MER' : 'Delete MER'}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </StickyTableWrapper>

              <TablePaginationBar
                page={merPagination.page}
                totalPages={merPagination.totalPages}
                total={merPagination.total}
                pageSize={merPagination.pageSize}
                onPageChange={merPagination.setPage}
                onPageSizeChange={merPagination.setPageSize}
                lang={prefs.language}
              />
            </>
          )}
        </div>
      )}

      {/* Simultaneous Official Print Preview Modal (OPI Minutes + Linked MER) with Post-Print Undo & Redo */}
      {printBundle && (
        <div
          data-testid="opi-minutes-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
        >
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Printer className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  {printBundle.minutes && printBundle.mer
                    ? isFa
                      ? `پیش‌نمایش چاپ هم‌زمان صورتجلسه ${printBundle.minutes.minutesNo} و گزارش MER ${printBundle.mer.reportNo}`
                      : `Combined Print Preview — Minutes ${printBundle.minutes.minutesNo} & MER ${printBundle.mer.reportNo}`
                    : printBundle.minutes
                      ? isFa
                        ? `پیش‌نمایش چاپ صورتجلسه گشایش — ${printBundle.minutes.minutesNo} (${formCode})`
                        : `OPI Minutes Preview — ${printBundle.minutes.minutesNo} (${formCode})`
                      : isFa
                        ? `پیش‌نمایش چاپ گزارش مغایرت — ${printBundle.mer?.reportNo} (${MD1_MER_FORM_CODE})`
                        : `MER Preview — ${printBundle.mer?.reportNo} (${MD1_MER_FORM_CODE})`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {/* Post-Print Undo & Redo Controls */}
                {canEdit && (
                  <div
                    dir="ltr"
                    className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5"
                  >
                    <button
                      type="button"
                      data-testid="opi-minutes-preview-undo-btn"
                      disabled={!historyStatus.canUndo || historyBusy}
                      onClick={() => void performUndo()}
                      title={
                        isFa
                          ? 'واگرد (لغو صدور و بازگردانی وضعیت جدول جزئیات)'
                          : 'Undo (revert issuance & Detailed table)'
                      }
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد' : 'Undo'}</span>
                    </button>
                    <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
                    <button
                      type="button"
                      data-testid="opi-minutes-preview-redo-btn"
                      disabled={!historyStatus.canRedo || historyBusy}
                      onClick={() => void performRedo()}
                      title={isFa ? 'انجام مجدد' : 'Redo'}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="opi-minutes-preview-print-btn"
                  disabled={printBundleWasUndone}
                  onClick={() => triggerAppPrint()}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {printBundle.minutes && printBundle.mer
                      ? isFa
                        ? 'چاپ صورتجلسه + گزارش MER'
                        : 'Print Minutes + MER'
                      : printBundle.minutes
                        ? isFa
                          ? 'چاپ صورتجلسه (A4 عمودی)'
                          : 'Print Minutes (A4 Portrait)'
                        : isFa
                          ? 'چاپ گزارش MER (A4 افقی)'
                          : 'Print MER (A4 Landscape)'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="opi-minutes-preview-close-btn"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => {
                    setPrintBundle(null);
                    setPrintBundleWasUndone(false);
                  }}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {printBundleWasUndone && (
              <div
                data-testid="opi-minutes-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {isFa
                  ? 'صدور این فرم با دکمه واگرد (Undo) لغو و جدول جزئیات به حالت قبل بازگردانده شد. برای بازگرداندن آن، روی «انجام مجدد (Redo)» کلیک کنید.'
                  : 'Issuance was undone and Detailed Equipment was restored. Click Redo to reapply it.'}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900 space-y-6">
              {printBundle.minutes && (
                <div className="max-w-[820px] mx-auto bg-white p-5 rounded-xl shadow-md">
                  <OfficialOpiMinutesSheet
                    record={printBundle.minutes}
                    formatDate={formatDate}
                  />
                </div>
              )}
              {printBundle.mer && (
                <div className="max-w-[1120px] mx-auto bg-white p-5 rounded-xl shadow-md">
                  <OfficialMerSheet report={printBundle.mer} formatDate={formatDate} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signed Scan Modal (supports both OPI Minutes and MER reports) */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection={scanTarget.collection}
          recordId={scanTarget.id}
          recordLabel={scanTarget.label}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={() => {
            void loadData();
          }}
        />
      )}

      {/* Delete Minutes Confirmation */}
      <ConfirmActionModal
        open={Boolean(deleteMinutesTarget)}
        title={isFa ? 'حذف صورتجلسه گشایش و بازرسی' : 'Delete OPI Minutes'}
        message={
          isFa
            ? `آیا از حذف صورتجلسه شماره «${deleteMinutesTarget?.minutesNo || ''}» اطمینان دارید؟ شماره OPI (و در صورت وجود، گزارش MER پیوست و اطلاعات مغایرت آن) از جدول جزئیات بازگردانی و دعوتنامه مجدداً باز خواهد شد.`
            : `Are you sure you want to delete OPI Minutes "${deleteMinutesTarget?.minutesNo || ''}"? Detailed Equipment and any linked MER will be reverted and the invitation reopened.`
        }
        confirmLabel={isFa ? 'بله، حذف شود' : 'Delete'}
        danger
        onCancel={() => setDeleteMinutesTarget(null)}
        onConfirm={handleConfirmDeleteMinutes}
      />

      {/* Delete MER Confirmation */}
      <ConfirmActionModal
        open={Boolean(deleteMerTarget)}
        title={isFa ? 'حذف گزارش مغایرت (MER)' : 'Delete MER Report'}
        message={
          isFa
            ? `آیا از حذف گزارش مغایرت شماره «${deleteMerTarget?.reportNo || ''}» اطمینان دارید؟ اطلاعات MER ثبت‌شده در جدول جزئیات پاک و مقادیر به حالت قبل بازگردانده می‌شود.`
            : `Are you sure you want to delete MER "${deleteMerTarget?.reportNo || ''}"? Synced MER fields in Detailed Equipment will be reverted.`
        }
        confirmLabel={isFa ? 'بله، حذف شود' : 'Delete'}
        danger
        onCancel={() => setDeleteMerTarget(null)}
        onConfirm={handleConfirmDeleteMer}
      />

      {/* Standalone MER Edit Modal (for MER reports without a linked OPI Minutes) */}
      {editingStandaloneMer && (
        <div
          data-testid="standalone-mer-edit-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
        >
          <form
            onSubmit={handleSaveStandaloneMer}
            className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-600 shrink-0" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {isFa
                    ? `ویرایش گزارش مغایرت (MER) — ${editingStandaloneMer.reportNo}`
                    : `Edit MER Report — ${editingStandaloneMer.reportNo}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingStandaloneMer(null)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره گزارش مغایرت (MER) *' : 'MER Report No. *'}
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    data-testid="standalone-mer-no-input"
                    value={standaloneMerReportNo}
                    onChange={(e) => setStandaloneMerReportNo(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono font-bold tabular-nums text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'تاریخ گزارش' : 'Report Date'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={standaloneMerDate}
                    onChange={(e) => setStandaloneMerDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums text-left"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="p-2 text-start">{isFa ? 'کد / آیتم' : 'Item / Tag'}</th>
                      <th className="p-2 text-start">{isFa ? 'شرح کالا' : 'Description'}</th>
                      <th className="p-2 text-center">{isFa ? 'مقدار پکینگ' : 'Pkg Qty'}</th>
                      <th className="p-2 text-start">{isFa ? 'نوع مغایرت' : 'Category'}</th>
                      <th className="p-2 text-center">{isFa ? 'تعداد مغایرت/کسری' : 'Discrepant Qty'}</th>
                      <th className="p-2 text-center">{isFa ? 'مقدار دریافتی' : 'Received Qty'}</th>
                      <th className="p-2 text-start">{isFa ? 'توضیحات' : 'Remark'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {standaloneMerItems.map((entry, idx) => {
                      const pkgQty = Number(entry.item.packingQty ?? 0);
                      const discNum = Number(entry.discrepantQty === '' ? 0 : entry.discrepantQty);
                      const recvQty = computeMerReceivedQty(
                        pkgQty,
                        entry.category,
                        Number.isFinite(discNum) && discNum >= 0 ? discNum : 0,
                      );
                      return (
                        <tr key={`${entry.item.detailedId}-${idx}`}>
                          <td className="p-2 font-mono tabular-nums" dir="ltr">
                            {entry.item.itemNo || entry.item.itemCode || '-'}
                          </td>
                          <td className="p-2 bidi-plaintext max-w-[200px] truncate">
                            {entry.item.description || '-'}
                          </td>
                          <td className="p-2 text-center font-mono tabular-nums" dir="ltr">
                            {pkgQty}
                          </td>
                          <td className="p-2">
                            <select
                              value={entry.category}
                              onChange={(e) => {
                                const nextCat = e.target.value as MerDiscrepancyCategory;
                                setStandaloneMerItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, category: nextCat } : it,
                                  ),
                                );
                              }}
                              className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                            >
                              <option value="shortage">{isFa ? 'کسری (Shortage)' : 'Shortage'}</option>
                              <option value="damaged">
                                {isFa ? 'مغایرت / آسیب‌دیدگی' : 'Discrepancy / Damaged'}
                              </option>
                            </select>
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              dir="ltr"
                              value={entry.discrepantQty}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStandaloneMerItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, discrepantQty: val } : it,
                                  ),
                                );
                              }}
                              className="w-20 h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono text-center tabular-nums"
                            />
                          </td>
                          <td className="p-2 text-center font-mono font-bold tabular-nums" dir="ltr">
                            {recvQty}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={entry.remarks}
                              onChange={(e) => {
                                const val = e.target.value;
                                setStandaloneMerItems((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, remarks: val } : it)),
                                );
                              }}
                              className="w-full h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {isFa ? 'سایر توضیحات' : 'Notes'}
                </label>
                <textarea
                  rows={2}
                  value={standaloneMerNotes}
                  onChange={(e) => setStandaloneMerNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingStandaloneMer(null)}
                className="h-9 px-3.5 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingStandaloneMer}
                data-testid="standalone-mer-save-btn"
                className="h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold"
              >
                {savingStandaloneMer
                  ? isFa
                    ? 'در حال ذخیره...'
                    : 'Saving...'
                  : isFa
                    ? 'ذخیره ویرایش گزارش MER'
                    : 'Save MER Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Minutes History Print Report */}
      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={isFa ? 'گزارش سوابق صورتجلسه‌های گشایش و بازرسی (OPI)' : 'OPI Minutes History Report'}
        rows={filteredMinutes}
        columns={minutesReportColumns}
      />
    </div>
  );
};
