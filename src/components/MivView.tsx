import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History,
  Pencil,
  Printer,
  Redo2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { resolveEmployerLogoSrc } from '../lib/employerLogoCache.ts';
import { triggerAppPrint } from '../lib/print.ts';
import { formatDigitsByLang } from '../shared/docNumbering.ts';
import { roundQty } from '../shared/formulas.ts';
import { getTodayIso } from '../shared/jalali.ts';
import {
  buildMivHeaderAutoFill,
  buildMivLineRemark,
  buildMivPlantDocConfig,
  computeMivStockDeduction,
  generateMivDocumentNo,
  paginateMivRows,
  resolveContractorAbbreviation,
  sanitizeNumericQtyInput,
  type MivStockSourcePreference,
} from '../shared/miv.ts';
import {
  computeAutoColumnWidths,
  type AutoColumnDescriptor,
} from '../shared/printAutoLayout.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import type {
  DetailedComputed,
  DocumentLineItem,
  MivDocumentRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { OperationalViewModeTabs, type OperationalViewMode } from './OperationalViewModeTabs.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { SubstitutionItemPicker } from './SubstitutionItemPicker.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

const DEFAULT_MD1_LOGO_PATH = './assets/aistudio/______________8a639368.png';
const MD1_MIV_FORM_CODE = 'MD1EX-FQP02/05-03';
const MD1_MIV_QA_NOTICE =
  'توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمی باشد.';
const MD1_MIV_COPY_TEXT =
  'رونوشت: معاونت تأمین تجهیزات ، دفتر فنی مپنا، پیمانکار نصب';

interface MivApiResponse {
  documents: MivDocumentRecord[];
  detailedItems: DetailedComputed[];
}

interface MivViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export interface OfficialMivSheetProps {
  doc: MivDocumentRecord;
  detailedItems: DetailedComputed[];
  formatDate: (iso: string) => string;
}

const MIV_TABLE_COLUMNS: readonly AutoColumnDescriptor[] = [
  { key: 'no', header: 'No', kind: 'compact', minPercent: 2.8, maxPercent: 5 },
  { key: 'pkgNo', header: 'Package No.', kind: 'code', minPercent: 6, maxPercent: 12 },
  { key: 'pkgItem', header: 'Package Item', kind: 'compact', minPercent: 5, maxPercent: 9 },
  { key: 'desc', header: 'Description Of Material', kind: 'fluid', minPercent: 14, maxPercent: 28 },
  { key: 'tech', header: 'Technical info/Size', kind: 'fluid', minPercent: 7, maxPercent: 14 },
  { key: 'tag', header: 'Tag No.', kind: 'code', minPercent: 5, maxPercent: 10 },
  { key: 'code', header: 'Code No.', kind: 'code', minPercent: 5.5, maxPercent: 11 },
  { key: 'loc', header: 'Location', kind: 'code', minPercent: 5, maxPercent: 10 },
  { key: 'reqQty', header: 'Requested Quantity', kind: 'compact', minPercent: 4.5, maxPercent: 8 },
  { key: 'issQty', header: 'Issued Quantity', kind: 'compact', minPercent: 4.5, maxPercent: 8 },
  { key: 'uom', header: 'UOM', kind: 'compact', minPercent: 3.5, maxPercent: 6.5 },
  { key: 'opi', header: 'OPI No.', kind: 'compact', minPercent: 4.5, maxPercent: 8.5 },
  { key: 'remark', header: 'Remark', kind: 'fluid', minPercent: 10, maxPercent: 24 },
];

export const OfficialMivSheet: React.FC<OfficialMivSheetProps> = ({
  doc,
  detailedItems,
  formatDate,
}) => {
  const { activeEmployer, activeProject, prefs } = useApp();
  const lang = prefs.language;

  const displayProjectName = (doc.projectName || activeProject?.name || '').trim();
  // Rule 1-3: strictly use contractRef/contractNo; leave empty if absent
  const displayContractNo = (doc.contractNo ?? activeProject?.contractRef ?? '').trim();

  const detailedById = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of detailedItems) map.set(d.id, d);
    return map;
  }, [detailedItems]);

  const rawLogo = activeEmployer?.logos?.[0]?.dataUrl || DEFAULT_MD1_LOGO_PATH;
  const logoSrc = resolveEmployerLogoSrc(rawLogo);

  const pages = useMemo(() => paginateMivRows(doc.items || []), [doc.items]);

  // Compute content-proportional column widths across all rows in this MIV
  const colLayout = useMemo(() => {
    const matrix = (doc.items || []).map((row, idx) => {
      const det = detailedById.get(row.detailedId);
      const pkgNo = row.shipmentNo || det?.shipmentNo || '';
      const pkgItem = row.packageNo || det?.packageNo || '';
      const desc = row.description || det?.description || '';
      const tech = row.technicalInfo || det?.size || '';
      const tag = row.tagNo || row.itemNo || det?.itemNo || '';
      const code = row.codeNo || det?.itemCode || '';
      const loc = row.location || det?.storageLocation || '';
      const reqQty = row.requestedQty ?? row.qty;
      const issQty = row.qty;
      const uom = row.uom || det?.countingUnit || '';
      const opi = row.opiNo || det?.opiNo || '';
      const remark =
        row.remark ||
        buildMivLineRemark(row.equipmentNotes ?? det?.notes, row.userRemark) ||
        '';
      return [
        String(idx + 1),
        pkgNo,
        pkgItem,
        desc,
        tech,
        tag,
        code,
        loc,
        String(reqQty),
        String(issQty),
        uom,
        opi,
        remark,
      ];
    });
    return computeAutoColumnWidths(MIV_TABLE_COLUMNS, matrix, { baseFontPx: 8.8, minFontPx: 7.4 });
  }, [doc.items, detailedById]);

  return (
    <div data-testid="official-miv-sheet" className="space-y-6 print:space-y-0">
      {pages.map((pg, pageIdx) => {
        const isLastPage = pageIdx === pages.length - 1;
        return (
          <div
            key={`miv-page-${pg.pageNumber}`}
            dir="rtl"
            data-testid={`official-miv-page-${pg.pageNumber}`}
            className={`samaan-a4-landscape ${!isLastPage ? 'samaan-print-page-break' : ''}`}
            style={{
              backgroundColor: '#ffffff',
              color: '#000000',
              fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
              width: '100%',
              boxSizing: 'border-box',
              pageBreakAfter: isLastPage ? 'auto' : 'always',
              breakAfter: isLastPage ? 'auto' : 'page',
            }}
          >
            {/* Upper Main Frame */}
            <div style={{ border: '1.8px solid #000000' }}>
              {/* Official Header: Logo (Right) | Title & Project (Center) | DocNo, Date, Page X of Y (Left) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.15fr 2.35fr 1.25fr',
                  borderBottom: '1.4px solid #000000',
                  minHeight: '72px',
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
                      style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain' }}
                    />
                  )}
                  <div style={{ fontSize: '8.4px', fontWeight: 700 }}>
                    سیستم مدیریت یکپارچه
                  </div>
                </div>

                {/* Center: Company Name, Project Name (1-1), Official Title */}
                <div
                  style={{
                    borderLeft: '1px solid #000000',
                    padding: '6px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    gap: '3px',
                  }}
                >
                  <div style={{ fontSize: '10.5px', fontWeight: 800 }}>
                    شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)
                  </div>
                  <div
                    data-testid="miv-sheet-project-title"
                    style={{ fontSize: '10.5px', fontWeight: 700 }}
                  >
                    {displayProjectName
                      ? `پروژه ${displayProjectName}`
                      : 'پروژه .........................................'}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 800, marginTop: '1px' }}>
                    درخواست کالا از انبار و حواله انبار
                  </div>
                </div>

                {/* Left: Doc No (1-22), Date (1-2), Page X of Y (1-4) */}
                <div
                  style={{
                    padding: '6px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    fontSize: '9.8px',
                    fontWeight: 700,
                    textAlign: 'right',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '6px',
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap' }}>شماره:</span>
                    <span
                      dir="ltr"
                      data-testid="miv-sheet-doc-no"
                      className="tabular-nums"
                      style={{ fontWeight: 800 }}
                    >
                      {doc.docNo}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '6px',
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap' }}>تاریخ:</span>
                    <span dir="ltr" className="tabular-nums">
                      {formatDate(doc.date)}
                    </span>
                  </div>
                  <div
                    data-testid={`miv-sheet-page-counter-${pg.pageNumber}`}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: '6px',
                    }}
                  >
                    <span>صفحه</span>
                    <span className="tabular-nums">
                      {formatDigitsByLang(pg.pageNumber, lang)} &nbsp; از &nbsp;{' '}
                      {formatDigitsByLang(pg.totalPages, lang)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadata Strip Row (1-3, 1-5, 1-6, 1-7, 1-8) with solid vertical cell dividers */}
              <div
                data-testid="miv-sheet-meta-strip"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.35fr 1.3fr 1.05fr 0.65fr 0.95fr',
                  alignItems: 'stretch',
                  borderBottom: '1px solid #000000',
                  fontSize: '9.2px',
                  textAlign: 'right',
                }}
              >
                <div
                  data-testid="miv-meta-cell-contract"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 7px',
                    borderLeft: '1px solid #000000',
                  }}
                >
                  <strong style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    شماره قرارداد/درخواست خرید:
                  </strong>
                  <span
                    dir="ltr"
                    data-testid="miv-sheet-contract-no"
                    className="tabular-nums bidi-plaintext"
                  >
                    {displayContractNo}
                  </span>
                </div>

                <div
                  data-testid="miv-meta-cell-party"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 7px',
                    borderLeft: '1px solid #000000',
                  }}
                >
                  <strong style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    پیمانکار/درخواست کننده:
                  </strong>
                  <span data-testid="miv-sheet-party" className="bidi-plaintext">
                    {doc.party || ''}
                  </span>
                </div>

                <div
                  data-testid="miv-meta-cell-system"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 7px',
                    borderLeft: '1px solid #000000',
                  }}
                >
                  <strong style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    سیستم/جزیره:
                  </strong>
                  <span data-testid="miv-sheet-system-island" className="bidi-plaintext">
                    {doc.islandSystem || ''}
                  </span>
                </div>

                <div
                  data-testid="miv-meta-cell-unit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 7px',
                    borderLeft: '1px solid #000000',
                  }}
                >
                  <strong style={{ fontWeight: 700 }}>واحد: </strong>
                  <span data-testid="miv-sheet-unit" className="bidi-plaintext">
                    {doc.unit || ''}
                  </span>
                </div>

                <div
                  data-testid="miv-meta-cell-receipt"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 7px',
                  }}
                >
                  <strong style={{ fontWeight: 700 }}>شماره رسید: </strong>
                  <span dir="ltr" data-testid="miv-sheet-receipt-no" className="tabular-nums">
                    {doc.receiptNo || ''}
                  </span>
                </div>
              </div>

              {/* 13-Column LTR Table with Content-Proportional Auto-Fit Column & Row Sizing */}
              <table
                dir="ltr"
                className="samaan-dynamic-table"
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'auto',
                  fontSize: `${colLayout.recommendedFontPx}px`,
                }}
              >
                <colgroup>
                  {colLayout.widthsPercent.map((pct, i) => (
                    <col key={MIV_TABLE_COLUMNS[i].key} style={{ width: `${pct}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
                    {MIV_TABLE_COLUMNS.map((col, idx) => (
                      <th
                        key={col.key}
                        style={{
                          borderBottom: '1px solid #000000',
                          borderRight: idx < MIV_TABLE_COLUMNS.length - 1 ? '1px solid #000000' : 'none',
                          padding: '5px 3px',
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          lineHeight: 1.25,
                        }}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(isLastPage ? pg.rows : pg.rows.filter((r) => r !== null)).map((row, rowIdx, arr) => {
                    const detailed = row ? detailedById.get(row.detailedId) : undefined;
                    const isLastRow = rowIdx === arr.length - 1;
                    const rowBottomBorder = isLastRow ? 'none' : '1px solid #000000';
                    const continuousNo = pg.startIndex + rowIdx + 1;

                    // Exact field mappings per Rules 1-9 to 1-21
                    const packageNoVal = row ? row.shipmentNo || detailed?.shipmentNo || '' : '';
                    const packageItemVal = row ? row.packageNo || detailed?.packageNo || '' : '';
                    const descVal = row ? row.description || detailed?.description || '' : '';
                    const techVal = row ? row.technicalInfo || detailed?.size || '' : '';
                    const tagVal = row ? row.tagNo || row.itemNo || detailed?.itemNo || '' : '';
                    const codeVal = row ? row.codeNo || detailed?.itemCode || '' : '';
                    const locVal = row ? row.location || detailed?.storageLocation || '' : '';
                    const reqQtyVal = row ? row.requestedQty ?? row.qty : '';
                    const issQtyVal = row ? row.qty : '';
                    const uomVal = row ? row.uom || detailed?.countingUnit || '' : '';
                    const opiVal = row ? row.opiNo || detailed?.opiNo || '' : '';
                    const remarkVal = row
                      ? row.remark ||
                        buildMivLineRemark(row.equipmentNotes ?? detailed?.notes, row.userRemark) ||
                        ''
                      : '';

                    const cellBase: React.CSSProperties = {
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 3px',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      height: 'auto',
                      minHeight: '22px',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    };

                    return (
                      <tr key={row ? `${row.detailedId}-${continuousNo}` : `empty-${pg.pageNumber}-${rowIdx}`}>
                        <td className="tabular-nums" style={cellBase}>
                          {row ? continuousNo : '\u00A0'}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {packageNoVal}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {packageItemVal}
                        </td>
                        <td
                          className="bidi-plaintext"
                          style={{
                            ...cellBase,
                            padding: '4px 5px',
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {descVal}
                        </td>
                        <td
                          className="bidi-plaintext"
                          style={{
                            ...cellBase,
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {techVal}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {tagVal}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {codeVal}
                        </td>
                        <td className="bidi-plaintext" style={cellBase}>
                          {locVal}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {reqQtyVal}
                        </td>
                        <td className="tabular-nums" style={{ ...cellBase, fontWeight: 700 }}>
                          {issQtyVal}
                        </td>
                        <td className="bidi-plaintext" style={cellBase}>
                          {uomVal}
                        </td>
                        <td className="tabular-nums" style={cellBase}>
                          {opiVal}
                        </td>
                        <td
                          className="bidi-plaintext"
                          style={{
                            ...cellBase,
                            borderRight: 'none',
                            padding: '4px 5px',
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {remarkVal}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Separate Lower Signature Frame matching attached MD1EX-FQP02/05-03 */}
            <div className="samaan-keep-together" style={{ border: '1.8px solid #000000', marginTop: '8px' }}>
              <div
                style={{
                  backgroundColor: '#e5e7eb',
                  borderBottom: '1px solid #000000',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                امضاء
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.9fr 1fr 1fr 1fr 2fr',
                  minHeight: '72px',
                  borderBottom: '1px solid #000000',
                  fontSize: '9px',
                  textAlign: 'right',
                }}
              >
                <div
                  style={{
                    borderLeft: '1px solid #000000',
                    padding: '5px 7px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>انباردار:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
                  </div>
                  <div className="bidi-plaintext">{doc.storekeeper || ''}</div>
                </div>

                <div
                  style={{
                    borderLeft: '1px solid #000000',
                    padding: '5px 7px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>تأمین تجهیزات مپنا:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
                  </div>
                  <div className="bidi-plaintext">{doc.equipmentSupply || ''}</div>
                </div>

                <div
                  style={{
                    borderLeft: '1px solid #000000',
                    padding: '5px 7px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>دفتر فنی مپنا:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
                  </div>
                  <div className="bidi-plaintext">{doc.techOffice || ''}</div>
                </div>

                <div
                  style={{
                    borderLeft: '1px solid #000000',
                    padding: '5px 7px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>بخش نصب مپنا:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
                  </div>
                  <div className="bidi-plaintext">{doc.installationDept || ''}</div>
                </div>

                {/* Left Group Box: پیمانکار / درخواست کننده */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      borderBottom: '1px solid #000000',
                      padding: '3px 6px',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    پیمانکار / درخواست کننده
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      alignItems: 'stretch',
                    }}
                  >
                    <div
                      data-testid="miv-sig-cell-requester"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '5px 7px',
                        borderLeft: '1px solid #000000',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>درخواست کننده:</div>
                        <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء</div>
                      </div>
                      <div className="bidi-plaintext">{doc.requester || doc.party || ''}</div>
                    </div>

                    <div
                      data-testid="miv-sig-cell-receiver"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '5px 7px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>تحویل گیرنده:</div>
                        <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء</div>
                      </div>
                      <div className="bidi-plaintext">{doc.receiver || ''}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* QA Control Notice — Right-aligned per official MD1EX-FQP02/05-03 */}
              <div
                dir="rtl"
                data-testid="miv-sheet-qa-notice"
                style={{
                  padding: '3.5px 10px',
                  fontSize: '8.3px',
                  fontWeight: 600,
                  textAlign: 'right',
                }}
              >
                {MD1_MIV_QA_NOTICE}
              </div>
            </div>

            {/* Bordered Bottom Footer Frame matching official MD1EX-FQP02/05-03 */}
            <div
              data-testid="miv-sheet-copy-footer"
              className="samaan-keep-together"
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1.6px solid #000000',
                backgroundColor: '#ffffff',
                padding: '4px 8px',
                fontSize: '8.8px',
                fontWeight: 700,
              }}
            >
              <div>{MD1_MIV_COPY_TEXT}</div>
              <div dir="ltr" className="tabular-nums">
                {MD1_MIV_FORM_CODE}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const MivView: React.FC<MivViewProps> = ({ refreshSignal, onDataChanged }) => {
  const {
    prefs,
    t,
    user,
    notify,
    formatDate,
    triggerAutoSnapshot,
    activeProject,
    historyStatus,
    historyBusy,
    performUndo,
    performRedo,
  } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [documents, setDocuments] = useState<MivDocumentRecord[]>([]);
  const [detailedCache, setDetailedCache] = useState<Record<string, DetailedComputed>>({});
  const [loading, setLoading] = useState(true);
  const [pickerRefresh, setPickerRefresh] = useState(0);

  // Two-step wizard: Step 1 = Filter & select in-stock rows, Step 2 = Quantities, Remarks & Header
  const [step, setStep] = useState<1 | 2>(1);
  const [editingDoc, setEditingDoc] = useState<MivDocumentRecord | null>(null);

  // Selected Detailed rows + local selection Undo/Redo stacks
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});
  const [selUndoStack, setSelUndoStack] = useState<Array<Record<string, DetailedComputed>>>([]);
  const [selRedoStack, setSelRedoStack] = useState<Array<Record<string, DetailedComputed>>>([]);

  // Per-row MIV inputs (strictly numeric qty, optional user remark, optional warehouse source)
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [userRemarkMap, setUserRemarkMap] = useState<Record<string, string>>({});
  const [sourceWarehouseMap, setSourceWarehouseMap] = useState<Record<string, MivStockSourcePreference>>({});

  // Header metadata
  const [docNo, setDocNo] = useState('');
  const [docNoTouched, setDocNoTouched] = useState(false);
  const [date, setDate] = useState(getTodayIso());
  const [party, setParty] = useState('');
  const [islandSystem, setIslandSystem] = useState('');
  const [unit, setUnit] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [storekeeper, setStorekeeper] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [techOffice, setTechOffice] = useState('');
  const [installationDept, setInstallationDept] = useState('');
  const [requester, setRequester] = useState('');
  const [receiver, setReceiver] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // View mode switcher (New MIV vs History) & optional collapsible header overrides
  const [viewMode, setViewMode] = useState<OperationalViewMode>(() => (canEdit ? 'create' : 'history'));
  const [showHeaderOverrides, setShowHeaderOverrides] = useState(false);

  // History search, print modal, delete modal
  const [historySearch, setHistorySearch] = useState('');
  const [printDoc, setPrintDoc] = useState<MivDocumentRecord | null>(null);
  const [printDocWasUndone, setPrintDocWasUndone] = useState(false);
  const [printReportOpen, setPrintReportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MivDocumentRecord | null>(null);
  const [scanTarget, setScanTarget] = useState<MivDocumentRecord | null>(null);

  const printDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    printDocIdRef.current = printDoc?.id || null;
  }, [printDoc]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<MivApiResponse>('/api/miv?compact=1&limit=150');
      const mivOnly = (res.documents || []).filter((d) => d.docType.startsWith('miv_'));
      setDocuments(mivOnly);
      if (Array.isArray(res.detailedItems) && res.detailedItems.length > 0) {
        setDetailedCache((prev) => {
          const next = { ...prev };
          for (const d of res.detailedItems) {
            next[d.id] = d;
          }
          return next;
        });
      }
      // Keep open printDoc synchronized when global Undo/Redo runs
      const openId = printDocIdRef.current;
      if (openId) {
        const matched = mivOnly.find((d) => d.id === openId);
        if (matched) {
          setPrintDoc(matched);
          setPrintDocWasUndone(false);
        } else {
          setPrintDocWasUndone(true);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  // Listen to global Undo/Redo events so MIV view & Print Preview refresh immediately even after printing
  useEffect(() => {
    const onHistoryApplied = () => {
      void loadData();
      setPickerRefresh((n) => n + 1);
    };
    window.addEventListener('samaan:history-applied', onHistoryApplied);
    return () => window.removeEventListener('samaan:history-applied', onHistoryApplied);
  }, [loadData]);

  // Local Selection Undo / Redo helpers
  const commitSelectionChange = useCallback(
    (updater: (prev: Record<string, DetailedComputed>) => Record<string, DetailedComputed>) => {
      setSelectedMap((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setSelUndoStack((u) => [...u.slice(-29), prev]);
        setSelRedoStack([]);
        return next;
      });
    },
    [],
  );

  const handleToggleRow = useCallback(
    (item: DetailedComputed) => {
      commitSelectionChange((prev) => {
        const next = { ...prev };
        if (next[item.id]) {
          delete next[item.id];
        } else {
          next[item.id] = item;
        }
        return next;
      });
      setDetailedCache((prev) => ({ ...prev, [item.id]: item }));
    },
    [commitSelectionChange],
  );

  const handleTogglePage = useCallback(
    (rows: DetailedComputed[], allSelected: boolean) => {
      commitSelectionChange((prev) => {
        const next = { ...prev };
        if (allSelected) {
          for (const r of rows) delete next[r.id];
        } else {
          for (const r of rows) next[r.id] = r;
        }
        return next;
      });
      setDetailedCache((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.id] = r;
        return next;
      });
    },
    [commitSelectionChange],
  );

  const handleSelectionUndo = () => {
    if (selUndoStack.length === 0) return;
    const prevSnap = selUndoStack[selUndoStack.length - 1];
    setSelUndoStack((u) => u.slice(0, -1));
    setSelRedoStack((r) => [...r.slice(-29), selectedMap]);
    setSelectedMap(prevSnap);
  };

  const handleSelectionRedo = () => {
    if (selRedoStack.length === 0) return;
    const nextSnap = selRedoStack[selRedoStack.length - 1];
    setSelRedoStack((r) => r.slice(0, -1));
    setSelUndoStack((u) => [...u.slice(-29), selectedMap]);
    setSelectedMap(nextSnap);
  };

  const handleSelectionClear = () => {
    if (Object.keys(selectedMap).length === 0) return;
    commitSelectionChange(() => ({}));
  };

  const selectedItems = useMemo(() => Object.values(selectedMap), [selectedMap]);

  // Edit mode: old deducted amounts per detailedId so available stock calculation adds them back
  const editingOldDeductions = useMemo(() => {
    const map = new Map<string, { mapna: number; contractor: number }>();
    if (!editingDoc) return map;
    for (const it of editingDoc.items) {
      const prev = map.get(it.detailedId) || { mapna: 0, contractor: 0 };
      const hasSplit =
        typeof it.deductedFromMapna === 'number' || typeof it.deductedFromContractor === 'number';
      if (hasSplit) {
        map.set(it.detailedId, {
          mapna: roundQty(prev.mapna + Math.max(0, it.deductedFromMapna || 0)),
          contractor: roundQty(prev.contractor + Math.max(0, it.deductedFromContractor || 0)),
        });
      } else if (editingDoc.docType === 'miv_mapna') {
        map.set(it.detailedId, {
          mapna: roundQty(prev.mapna + (it.qty || 0)),
          contractor: prev.contractor,
        });
      } else {
        map.set(it.detailedId, {
          mapna: prev.mapna,
          contractor: roundQty(prev.contractor + (it.qty || 0)),
        });
      }
    }
    return map;
  }, [editingDoc]);

  const getEffectiveStock = useCallback(
    (item: DetailedComputed) => {
      const old = editingOldDeductions.get(item.id) || { mapna: 0, contractor: 0 };
      const mapna = roundQty(Math.max(0, item.mapnaInventory) + old.mapna);
      const contractor = roundQty(Math.max(0, item.contractorInventory) + old.contractor);
      return { mapna, contractor, total: roundQty(mapna + contractor) };
    },
    [editingOldDeductions],
  );

  // Auto-computed suggested MIV document number per Rule 1-22: <PLANT>-<CONTRACTOR>-MIV-####
  const existingDocNos = useMemo(
    () =>
      documents
        .filter((d) => !editingDoc || d.id !== editingDoc.id)
        .map((d) => d.docNo),
    [documents, editingDoc],
  );

  const autoHeader = useMemo(
    () => buildMivHeaderAutoFill(selectedItems, activeProject),
    [selectedItems, activeProject],
  );

  const contractorForCode = party.trim() || autoHeader.contractorForDocNo;
  const contractorAbbrPreview = useMemo(
    () => resolveContractorAbbreviation(contractorForCode),
    [contractorForCode],
  );

  const suggestedDocNo = useMemo(
    () =>
      generateMivDocumentNo(
        contractorForCode,
        existingDocNos,
        buildMivPlantDocConfig(activeProject),
      ),
    [contractorForCode, existingDocNos, activeProject],
  );

  // Keep docNo auto-updated when not manually edited and not editing an existing doc
  useEffect(() => {
    if (!editingDoc && !docNoTouched && step === 2) {
      setDocNo(suggestedDocNo);
    }
  }, [editingDoc, docNoTouched, step, suggestedDocNo]);

  // Proceed from Step 1 to Step 2 and auto-populate header & default quantities
  const handleProceedToStep2 = () => {
    if (selectedItems.length === 0) {
      notify(
        'warning',
        isFa ? 'ابتدا حداقل یک ردیف دارای موجودی انتخاب کنید.' : 'Please select at least one in-stock item first.',
      );
      return;
    }

    const filled = buildMivHeaderAutoFill(selectedItems, activeProject);
    if (!editingDoc) {
      if (!party.trim() && filled.party) setParty(filled.party);
      if (!islandSystem.trim() && filled.islandSystem) setIslandSystem(filled.islandSystem);
      if (!unit.trim() && filled.unit) setUnit(filled.unit);
      if (!receiptNo.trim() && filled.receiptNo) setReceiptNo(filled.receiptNo);
      if (!docNoTouched) {
        const nextNo = generateMivDocumentNo(
          (party.trim() || filled.contractorForDocNo),
          existingDocNos,
          buildMivPlantDocConfig(activeProject),
        );
        setDocNo(nextNo);
      }
    }

    // Initialize default qty (1 or total stock if < 1) for newly selected items
    setQtyMap((prev) => {
      const next = { ...prev };
      for (const item of selectedItems) {
        if (next[item.id] === undefined) {
          const st = getEffectiveStock(item);
          next[item.id] = st.total >= 1 ? '1' : st.total > 0 ? String(st.total) : '';
        }
      }
      return next;
    });

    setStep(2);
  };

  // Validate all selected rows before submit
  const rowValidations = useMemo(() => {
    const map: Record<string, { valid: boolean; error?: string; mapna: number; contractor: number; total: number }> = {};
    for (const item of selectedItems) {
      const st = getEffectiveStock(item);
      const rawStr = (qtyMap[item.id] || '').trim();
      const numVal = Number(rawStr);
      const pref = sourceWarehouseMap[item.id] || 'auto';
      const check = computeMivStockDeduction(numVal, st.mapna, st.contractor, pref);
      map[item.id] = {
        valid: Boolean(rawStr) && check.valid,
        error: !rawStr
          ? isFa
            ? 'مقدار عددی الزامی است.'
            : 'Numeric quantity is required.'
          : check.valid
            ? undefined
            : isFa
              ? check.errorFa
              : check.errorEn,
        mapna: st.mapna,
        contractor: st.contractor,
        total: st.total,
      };
    }
    return map;
  }, [selectedItems, getEffectiveStock, qtyMap, sourceWarehouseMap, isFa]);

  const hasInvalidRows = useMemo(
    () => selectedItems.length === 0 || selectedItems.some((it) => !rowValidations[it.id]?.valid),
    [selectedItems, rowValidations],
  );

  const resetForm = () => {
    setEditingDoc(null);
    setStep(1);
    setSelectedMap({});
    setSelUndoStack([]);
    setSelRedoStack([]);
    setQtyMap({});
    setUserRemarkMap({});
    setSourceWarehouseMap({});
    setDocNo('');
    setDocNoTouched(false);
    setDate(getTodayIso());
    setParty('');
    setIslandSystem('');
    setUnit('');
    setReceiptNo('');
    setStorekeeper('');
    setEquipmentSupply('');
    setTechOffice('');
    setInstallationDept('');
    setRequester('');
    setReceiver('');
  };

  const startEdit = async (doc: MivDocumentRecord) => {
    // Load exact detailed items for this document so editing works even if stock is now 0
    const nextSelected: Record<string, DetailedComputed> = {};
    const missingIds: string[] = [];

    for (const it of doc.items) {
      const cached = detailedCache[it.detailedId];
      if (cached) {
        nextSelected[it.detailedId] = cached;
      } else {
        missingIds.push(it.detailedId);
      }
    }

    if (missingIds.length > 0) {
      try {
        const res = await apiRequest<{ items: DetailedComputed[] }>(
          `/api/detailed?page=1&pageSize=200`,
        );
        const byId = new Map((res.items || []).map((d) => [d.id, d]));
        for (const it of doc.items) {
          const found = byId.get(it.detailedId);
          if (found) {
            nextSelected[it.detailedId] = found;
          } else if (!nextSelected[it.detailedId]) {
            nextSelected[it.detailedId] = {
              id: it.detailedId,
              shipmentNo: it.shipmentNo,
              packageNo: it.packageNo,
              itemNo: it.itemNo,
              description: it.description,
              size: it.technicalInfo || '',
              itemCode: it.codeNo || '',
              storageLocation: it.location || '',
              countingUnit: it.uom || '',
              opiNo: it.opiNo || '',
              notes: it.equipmentNotes || '',
              mapnaInventory: 0,
              contractorInventory: 0,
            } as DetailedComputed;
          }
        }
      } catch {
        for (const it of doc.items) {
          if (!nextSelected[it.detailedId]) {
            nextSelected[it.detailedId] = {
              id: it.detailedId,
              shipmentNo: it.shipmentNo,
              packageNo: it.packageNo,
              itemNo: it.itemNo,
              description: it.description,
              size: it.technicalInfo || '',
              itemCode: it.codeNo || '',
              storageLocation: it.location || '',
              countingUnit: it.uom || '',
              opiNo: it.opiNo || '',
              notes: it.equipmentNotes || '',
              mapnaInventory: 0,
              contractorInventory: 0,
            } as DetailedComputed;
          }
        }
      }
    }

    setEditingDoc(doc);
    setSelectedMap(nextSelected);
    setSelUndoStack([]);
    setSelRedoStack([]);
    setDocNo(doc.docNo);
    setDocNoTouched(true);
    setDate(doc.date || getTodayIso());
    setParty(doc.party || '');
    setIslandSystem(doc.islandSystem || '');
    setUnit(doc.unit || '');
    setReceiptNo(doc.receiptNo || '');
    setStorekeeper(doc.storekeeper || '');
    setEquipmentSupply(doc.equipmentSupply || '');
    setTechOffice(doc.techOffice || '');
    setInstallationDept(doc.installationDept || '');
    setRequester(doc.requester || '');
    setReceiver(doc.receiver || '');

    const nextQty: Record<string, string> = {};
    const nextUserRemark: Record<string, string> = {};
    const nextSource: Record<string, MivStockSourcePreference> = {};
    for (const it of doc.items) {
      nextQty[it.detailedId] = String(it.qty);
      if (it.userRemark !== undefined) {
        nextUserRemark[it.detailedId] = it.userRemark;
      } else if (it.remark) {
        const baseNotes = (it.equipmentNotes || nextSelected[it.detailedId]?.notes || '').trim();
        if (baseNotes && it.remark.startsWith(`${baseNotes}\n`)) {
          nextUserRemark[it.detailedId] = it.remark.slice(baseNotes.length + 1);
        } else if (baseNotes && it.remark === baseNotes) {
          nextUserRemark[it.detailedId] = '';
        } else {
          nextUserRemark[it.detailedId] = it.remark;
        }
      }
      if (it.sourceWarehouse) {
        nextSource[it.detailedId] = it.sourceWarehouse;
      }
    }
    setQtyMap(nextQty);
    setUserRemarkMap(nextUserRemark);
    setSourceWarehouseMap(nextSource);
    setViewMode('create');
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم برای صدور حواله انتخاب کنید.' : 'Select at least one item.');
      return;
    }

    for (const item of selectedItems) {
      const check = rowValidations[item.id];
      if (!check?.valid) {
        notify(
          'error',
          check?.error ||
            (isFa ? 'تعداد وارد شده برای یکی از اقلام نامعتبر است.' : 'Invalid quantity for one of the items.'),
        );
        return;
      }
    }

    const finalDocNo = (docNo.trim() || suggestedDocNo).trim();
    if (!finalDocNo) {
      notify('error', isFa ? 'شماره حواله انبار الزامی است.' : 'MIV document number is required.');
      return;
    }

    // Build exact per-line payload with stacked remark (equipmentNotes + userRemark)
    let totalFromMapna = 0;
    let totalFromContractor = 0;
    const payloadItems = selectedItems.map((item) => {
      const qty = roundQty(Number(qtyMap[item.id]));
      const st = getEffectiveStock(item);
      const pref = sourceWarehouseMap[item.id] || 'auto';
      const ded = computeMivStockDeduction(qty, st.mapna, st.contractor, pref);
      totalFromMapna += ded.deductedFromMapna;
      totalFromContractor += ded.deductedFromContractor;

      const userRemark = (userRemarkMap[item.id] || '').trim();
      const mergedRemark = buildMivLineRemark(item.notes, userRemark);

      return {
        detailedId: item.id,
        qty,
        requestedQty: qty,
        technicalInfo: item.size || '',
        tagNo: item.itemNo || '',
        codeNo: item.itemCode || '',
        location: item.storageLocation || '',
        uom: item.countingUnit || '',
        opiNo: item.opiNo || '',
        remark: mergedRemark,
        userRemark,
        equipmentNotes: item.notes || '',
        sourceWarehouse: pref,
      };
    });

    const resolvedDocType =
      totalFromMapna > 0 && totalFromContractor === 0 ? 'miv_mapna' : 'miv_contractor';

    setSubmitting(true);
    try {
      const payload = {
        docType: resolvedDocType,
        docNo: finalDocNo,
        date,
        party: party.trim(),
        projectName: activeProject?.name || '',
        // Rule 1-3: strictly contractRef (empty if absent)
        contractNo: activeProject?.contractRef?.trim() || '',
        islandSystem: islandSystem.trim(),
        unit: unit.trim(),
        receiptNo: receiptNo.trim(),
        storekeeper: storekeeper.trim(),
        equipmentSupply: equipmentSupply.trim(),
        techOffice: techOffice.trim(),
        installationDept: installationDept.trim(),
        requester: requester.trim(),
        receiver: receiver.trim(),
        items: payloadItems,
      };

      const res = editingDoc
        ? await apiRequest<{ document: MivDocumentRecord }>(`/api/miv/${editingDoc.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ document: MivDocumentRecord }>('/api/miv', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingDoc
          ? isFa
            ? `حواله انبار شماره ${res.document.docNo} ویرایش و موجودی انبار به‌روزرسانی شد.`
            : `MIV ${res.document.docNo} updated and stock adjusted.`
          : isFa
            ? `حواله انبار شماره ${res.document.docNo} صادر و موجودی از انبار کسر شد.`
            : `MIV ${res.document.docNo} issued and stock deducted.`,
      );
      resetForm();
      setPrintDocWasUndone(false);
      setPrintDoc(res.document);
      triggerAutoSnapshot(`${editingDoc ? 'Edit ' : ''}MIV ${res.document.docNo}`);
      onDataChanged();
      setPickerRefresh((n) => n + 1);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/miv/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `حواله انبار شماره ${deleteTarget.docNo} حذف و موجودی اقلام به انبار بازگردانی شد.`
          : `MIV ${deleteTarget.docNo} deleted and stock restored.`,
      );
      if (editingDoc?.id === deleteTarget.id) resetForm();
      if (printDoc?.id === deleteTarget.id) setPrintDoc(null);
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete MIV ${deleteTarget.docNo}`);
      onDataChanged();
      setPickerRefresh((n) => n + 1);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Filtered History list
  const filteredDocuments = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((d) =>
      [
        d.docNo,
        d.party,
        d.islandSystem,
        d.unit,
        d.receiptNo,
        d.contractNo,
        d.createdBy,
        ...d.items.map((i) => `${i.shipmentNo} ${i.packageNo} ${i.itemNo} ${i.description} ${i.codeNo || ''}`),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [documents, historySearch]);

  const mivPagination = useClientPagination(filteredDocuments, 25);

  const historyColumns = useMemo<PrintColumnDef<MivDocumentRecord>[]>(
    () => [
      { key: 'docNo', header: isFa ? 'شماره حواله' : 'MIV Doc No.', getValue: (r) => r.docNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'party', header: isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor / Requester', getValue: (r) => r.party || '' },
      { key: 'islandSystem', header: isFa ? 'سیستم / جزیره' : 'System / Island', getValue: (r) => r.islandSystem || '' },
      { key: 'unit', header: isFa ? 'واحد' : 'Unit', getValue: (r) => r.unit || '' },
      { key: 'receiptNo', header: isFa ? 'شماره رسید' : 'Receipt No.', getValue: (r) => r.receiptNo || '' },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => r.items.length },
      {
        key: 'itemsSummary',
        header: isFa ? 'خلاصه اقلام' : 'Items Summary',
        getValue: (r) =>
          r.items.map((i) => `${i.shipmentNo}/${i.packageNo} (${i.qty})`).join(' | '),
      },
      { key: 'createdBy', header: isFa ? 'ثبت‌کننده' : 'Created By', getValue: (r) => r.createdBy },
    ],
    [isFa],
  );

  const detailedItemsList = useMemo(() => Object.values(detailedCache), [detailedCache]);

  return (
    <div className="space-y-6" data-testid="miv-view">
      {/* Dedicated A4 Landscape Print Portal for Official MD1EX-FQP02/05-03 with standard 12mm safe margins */}
      {printDoc && !printReportOpen && !printDocWasUndone
        ? createPortal(
            <div id="samaan-miv-print-root" data-samaan-print-portal="true">
              <style>
                {buildIsolatedPrintPortalCss('samaan-miv-print-root', {
                  orientation: 'landscape',
                  isFa,
                  showBrowserPageFooter: false,
                })}
              </style>
              <OfficialMivSheet
                doc={printDoc}
                detailedItems={detailedItemsList}
                formatDate={formatDate}
              />
            </div>,
            document.body,
          )
        : null}

      {/* Top Header Bar with Standardized Create / History Mode Toggle */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                {editingDoc && viewMode === 'create'
                  ? isFa
                    ? `ویرایش حواله انبار (${editingDoc.docNo})`
                    : `Edit MIV (${editingDoc.docNo})`
                  : isFa
                    ? 'درخواست کالا از انبار و حواله انبار'
                    : 'Material Issue Voucher (MIV)'}
              </h1>
              <span
                dir="ltr"
                className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] font-mono text-[11px] font-bold text-[var(--accent-primary)]"
              >
                {MD1_MIV_FORM_CODE}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {viewMode === 'history'
                ? isFa
                  ? 'مشاهده، چاپ مجدد، ویرایش و حذف حواله‌های انبار صادرشده'
                  : 'View, reprint, edit, and delete issued Material Issue Vouchers'
                : step === 1
                  ? isFa
                    ? 'مرحله ۱ از ۲: فیلتر و انتخاب اقلام دارای موجودی (انبار کارفرما و پیمانکار)'
                    : 'Step 1 of 2: Filter & select in-stock items (Employer & Contractor stock)'
                  : isFa
                    ? 'مرحله ۲ از ۲: تعیین تعداد خروجی (صرفاً عددی)، توضیحات اختیاری و صدور حواله'
                    : 'Step 2 of 2: Set numeric quantities, optional remarks, and issue MIV'}
            </p>
          </div>
        </div>

        <OperationalViewModeTabs
          mode={viewMode}
          onChange={setViewMode}
          historyCount={documents.length}
          canEdit={canEdit}
          createLabelFa="ثبت حواله جدید"
          createLabelEn="New MIV"
          historyLabelFa="سابقه فرم‌ها"
          historyLabelEn="History"
          testIdPrefix="miv"
        />
      </div>

      {/* Main Wizard Card (Create / Edit MIV) */}
      {viewMode === 'create' && canEdit && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
          {/* Step Switcher Bar */}
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/55 flex flex-wrap items-center justify-between gap-2.5">
            <div className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-[11px] font-bold">
              <button
                type="button"
                data-testid="miv-step-1-tab"
                onClick={() => setStep(1)}
                className={`h-7 px-3 rounded-lg transition-colors ${
                  step === 1
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {isFa ? '۱. انتخاب اقلام' : '1. Select Items'}
              </button>
              <button
                type="button"
                data-testid="miv-step-2-tab"
                onClick={handleProceedToStep2}
                className={`h-7 px-3 rounded-lg transition-colors ${
                  step === 2
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {isFa
                  ? `۲. تکمیل و صدور (${selectedItems.length})`
                  : `2. Complete & Issue (${selectedItems.length})`}
              </button>
            </div>

            {editingDoc && (
              <button
                type="button"
                onClick={resetForm}
                className="h-8 px-3 rounded-lg border border-[var(--status-danger)]/40 bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-semibold"
              >
                {isFa ? 'انصراف از ویرایش' : 'Cancel Edit'}
              </button>
            )}
          </div>

          {step === 1 ? (
            <div className="p-4 sm:p-5 space-y-4">
              {/* Selection Controls Toolbar (Undo / Redo / Clear / Proceed) */}
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/65 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="miv-selected-count"
                    className="text-xs font-bold text-[var(--text-primary)] tabular-nums"
                  >
                    {isFa
                      ? `اقلام انتخاب‌شده: ${selectedItems.length} ردیف`
                      : `Selected Items: ${selectedItems.length}`}
                  </span>

                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      data-testid="miv-sel-undo-btn"
                      disabled={selUndoStack.length === 0}
                      onClick={handleSelectionUndo}
                      title={isFa ? 'بازگردانی انتخاب' : 'Undo selection'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد انتخاب' : 'Undo'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="miv-sel-redo-btn"
                      disabled={selRedoStack.length === 0}
                      onClick={handleSelectionRedo}
                      title={isFa ? 'انجام مجدد انتخاب' : 'Redo selection'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'مجدد' : 'Redo'}</span>
                    </button>
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        data-testid="miv-sel-clear-btn"
                        onClick={handleSelectionClear}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)] text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{isFa ? 'پاک‌سازی انتخاب‌ها' : 'Clear'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="miv-proceed-step2-btn"
                  disabled={selectedItems.length === 0}
                  onClick={handleProceedToStep2}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>
                    {isFa
                      ? `ادامه و تعیین تعداد (${selectedItems.length} قلم)`
                      : `Continue to Quantities (${selectedItems.length})`}
                  </span>
                  {isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Detailed-Equipment-Grade In-Stock Picker (Both Employer & Contractor Stock) */}
              <SubstitutionItemPicker
                stockOnly={true}
                refreshSignal={refreshSignal + pickerRefresh}
                selectedMap={selectedMap}
                onToggleRow={handleToggleRow}
                onTogglePage={handleTogglePage}
                testIdPrefix="miv-picker"
              />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-5">
              {/* Back to Step 1 Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <button
                  type="button"
                  data-testid="miv-back-step1-btn"
                  onClick={() => setStep(1)}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت به انتخاب اقلام' : 'Back to Item Selection'}</span>
                </button>

                <div className="text-[11.5px] text-[var(--text-muted)]">
                  {isFa ? 'پروژه:' : 'Project:'}{' '}
                  <strong className="text-[var(--text-primary)]">{activeProject?.name || '—'}</strong>
                  {activeProject?.contractRef ? (
                    <>
                      {' · '}
                      {isFa ? 'شماره قرارداد:' : 'Contract:'}{' '}
                      <strong dir="ltr" className="font-mono text-[var(--text-primary)]">
                        {activeProject.contractRef}
                      </strong>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Compact Auto-Filled Header Summary Bar (values auto-populated from Project & Detailed Equipment) */}
              <div
                data-testid="miv-auto-header-summary"
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-[var(--text-muted)]">{isFa ? 'شماره حواله:' : 'MIV No.:'}</span>
                      <strong
                        dir="ltr"
                        data-testid="miv-doc-no-preview"
                        className="font-mono text-[var(--accent-primary)]"
                      >
                        {docNo.trim() || suggestedDocNo}
                      </strong>
                    </div>
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-[var(--text-muted)]">{isFa ? 'تاریخ:' : 'Date:'}</span>
                      <strong className="tabular-nums text-[var(--text-primary)]">{formatDate(date)}</strong>
                    </div>
                    {party && (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">{isFa ? 'پیمانکار:' : 'Contractor:'}</span>
                        <strong className="text-[var(--text-primary)] bidi-plaintext">{party}</strong>
                      </div>
                    )}
                    {islandSystem && (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">{isFa ? 'سیستم/جزیره:' : 'System/Island:'}</span>
                        <strong className="text-[var(--text-primary)] bidi-plaintext">{islandSystem}</strong>
                      </div>
                    )}
                    {unit && (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">{isFa ? 'واحد:' : 'Unit:'}</span>
                        <strong className="text-[var(--text-primary)] bidi-plaintext">{unit}</strong>
                      </div>
                    )}
                    {receiptNo && (
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">{isFa ? 'شماره رسید:' : 'Receipt No.:'}</span>
                        <strong dir="ltr" className="font-mono text-[var(--text-primary)]">{receiptNo}</strong>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    data-testid="miv-toggle-header-overrides-btn"
                    onClick={() => setShowHeaderOverrides((prev) => !prev)}
                    className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1"
                  >
                    <span>{isFa ? 'تنظیمات اختیاری سربرگ' : 'Optional Header Details'}</span>
                    {showHeaderOverrides ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {showHeaderOverrides && (
                  <div className="pt-2.5 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <label
                          htmlFor="miv-doc-no-input"
                          className="text-[11px] font-semibold text-[var(--text-secondary)]"
                        >
                          {isFa ? 'شماره حواله انبار *' : 'MIV Document No. *'}
                        </label>
                        <button
                          type="button"
                          data-testid="miv-regenerate-docno-btn"
                          onClick={() => {
                            setDocNoTouched(false);
                            setDocNo(suggestedDocNo);
                          }}
                          title={
                            isFa
                              ? `تولید خودکار بر اساس کد پیمانکار (${contractorAbbrPreview})`
                              : `Regenerate using contractor code (${contractorAbbrPreview})`
                          }
                          className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span dir="ltr">{suggestedDocNo}</span>
                        </button>
                      </div>
                      <input
                        id="miv-doc-no-input"
                        data-testid="miv-doc-no-input"
                        type="text"
                        required
                        dir="ltr"
                        value={docNo}
                        onChange={(e) => {
                          setDocNo(e.target.value);
                          setDocNoTouched(true);
                        }}
                        placeholder={suggestedDocNo}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <JalaliDateInput
                      label={`${isFa ? 'تاریخ حواله' : 'Date'} *`}
                      value={date}
                      onChange={setDate}
                    />

                    <div>
                      <label
                        htmlFor="miv-party-input"
                        className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {isFa ? 'پیمانکار / درخواست کننده' : 'Contractor / Requester'}
                      </label>
                      <input
                        id="miv-party-input"
                        data-testid="miv-party-input"
                        type="text"
                        value={party}
                        onChange={(e) => setParty(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="miv-system-island-input"
                        className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {isFa ? 'سیستم / جزیره' : 'System / Island'}
                      </label>
                      <input
                        id="miv-system-island-input"
                        data-testid="miv-system-island-input"
                        type="text"
                        value={islandSystem}
                        onChange={(e) => setIslandSystem(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="miv-unit-input"
                        className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {isFa ? 'واحد' : 'Unit'}
                      </label>
                      <input
                        id="miv-unit-input"
                        data-testid="miv-unit-input"
                        type="text"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="miv-receipt-input"
                        className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                      >
                        {isFa ? 'شماره رسید' : 'Receipt No.'}
                      </label>
                      <input
                        id="miv-receipt-input"
                        data-testid="miv-receipt-input"
                        type="text"
                        dir="ltr"
                        value={receiptNo}
                        onChange={(e) => setReceiptNo(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'تحویل‌گیرنده (امضاء)' : 'Receiver Signatory'}
                      </label>
                      <input
                        type="text"
                        value={receiver}
                        onChange={(e) => setReceiver(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'انباردار (امضاء)' : 'Storekeeper Signatory'}
                      </label>
                      <input
                        type="text"
                        value={storekeeper}
                        onChange={(e) => setStorekeeper(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'تأمین تجهیزات مپنا (اختیاری)' : 'Equipment Supply (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={equipmentSupply}
                        onChange={(e) => setEquipmentSupply(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'دفتر فنی مپنا (اختیاری)' : 'Tech Office (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={techOffice}
                        onChange={(e) => setTechOffice(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'بخش نصب مپنا (اختیاری)' : 'Installation Dept (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={installationDept}
                        onChange={(e) => setInstallationDept(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                        {isFa ? 'درخواست‌کننده (امضاء - اختیاری)' : 'Requester Signatory (Optional)'}
                      </label>
                      <input
                        type="text"
                        value={requester}
                        onChange={(e) => setRequester(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Items Quantities & Stacked Remarks Table */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `اقلام حواله (${selectedItems.length} ردیف) — تعداد صرفاً عددی و توضیحات اختیاری`
                      : `Selected Voucher Items (${selectedItems.length}) — Numeric Qty & Optional Remarks`}
                  </h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {isFa
                      ? 'توضیحات جدید به‌صورت خودکار در زیر «توضیحات تجهیز» قبلی در ستون Remark درج می‌شود.'
                      : 'New remarks are automatically stacked below any existing Equipment Notes in the Remark column.'}
                  </span>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                        <tr>
                          <th className="px-2.5 py-2 whitespace-nowrap">#</th>
                          <th className="px-2.5 py-2 whitespace-nowrap">{isFa ? 'محموله / نگله' : 'Pkg No / Item'}</th>
                          <th className="px-2.5 py-2 min-w-[200px]">{isFa ? 'شرح کالا و مشخصات' : 'Description & Specs'}</th>
                          <th className="px-2.5 py-2 whitespace-nowrap">{isFa ? 'موجودی مجاز' : 'Available Stock'}</th>
                          <th className="px-2.5 py-2 whitespace-nowrap min-w-[160px]">
                            {isFa ? 'تعداد خروجی *' : 'Issue Qty *'}
                          </th>
                          <th className="px-2.5 py-2 min-w-[240px]">
                            {isFa ? 'توضیحات حواله (Remark - اختیاری)' : 'MIV Remark (Optional)'}
                          </th>
                          <th className="px-2 py-2 whitespace-nowrap">{isFa ? 'حذف' : 'Remove'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {selectedItems.map((item, idx) => {
                          const v = rowValidations[item.id];
                          const hasBothStocks = v.mapna > 0 && v.contractor > 0;
                          const pref = sourceWarehouseMap[item.id] || 'auto';
                          const existingNotes = (item.notes || '').trim();

                          return (
                            <tr
                              key={item.id}
                              data-testid={`miv-selected-row-${item.id}`}
                              className={!v.valid ? 'bg-[var(--status-danger-bg)]/35' : ''}
                            >
                              <td className="px-2.5 py-2 tabular-nums font-bold text-[var(--text-muted)]">
                                {idx + 1}
                              </td>
                              <td dir="ltr" className="px-2.5 py-2 font-mono text-[11px] whitespace-nowrap">
                                <div className="font-bold text-[var(--text-primary)]">{item.shipmentNo}</div>
                                <div className="text-[var(--text-muted)]">
                                  {item.packageNo ? `Pkg: ${item.packageNo}` : '—'}
                                  {item.itemNo ? ` · Tag: ${item.itemNo}` : ''}
                                </div>
                              </td>
                              <td className="px-2.5 py-2 text-start">
                                <div className="font-semibold text-[var(--text-primary)] whitespace-pre-line bidi-plaintext">
                                  {item.description || item.generalDescription}
                                </div>
                                <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5 flex flex-wrap gap-x-2">
                                  {item.size && <span>{item.size}</span>}
                                  {item.itemCode && <span dir="ltr" className="font-mono">{item.itemCode}</span>}
                                  {item.storageLocation && <span>{item.storageLocation}</span>}
                                  {item.countingUnit && <span>({item.countingUnit})</span>}
                                </div>
                              </td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                                <div className="font-extrabold text-[var(--text-primary)]">
                                  {isFa ? `مجموع: ${v.total}` : `Total: ${v.total}`}
                                </div>
                                <div className="text-[10.5px] text-[var(--text-muted)] space-x-1 space-x-reverse">
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    {isFa ? `کارفرما: ${v.mapna}` : `Emp: ${v.mapna}`}
                                  </span>
                                  <span>·</span>
                                  <span className="text-sky-700 dark:text-sky-400">
                                    {isFa ? `پیمانکار: ${v.contractor}` : `Con: ${v.contractor}`}
                                  </span>
                                </div>
                                {hasBothStocks && (
                                  <select
                                    aria-label={isFa ? 'اولویت انبار کسر موجودی' : 'Deduction warehouse priority'}
                                    value={pref}
                                    onChange={(e) =>
                                      setSourceWarehouseMap((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value as MivStockSourcePreference,
                                      }))
                                    }
                                    className="mt-1 h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[10.5px]"
                                  >
                                    <option value="auto">{isFa ? 'کسر خودکار (ابتدا پیمانکار)' : 'Auto (Contractor first)'}</option>
                                    <option value="contractor">{isFa ? 'ابتدا انبار پیمانکار' : 'Contractor first'}</option>
                                    <option value="employer">{isFa ? 'ابتدا انبار کارفرما' : 'Employer first'}</option>
                                  </select>
                                )}
                              </td>
                              <td className="px-2.5 py-2">
                                <div className="flex items-center justify-center gap-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    dir="ltr"
                                    data-testid={`miv-qty-input-${item.id}`}
                                    aria-label={isFa ? `تعداد برای ${item.description}` : `Quantity for ${item.description}`}
                                    value={qtyMap[item.id] ?? ''}
                                    onChange={(e) => {
                                      const clean = sanitizeNumericQtyInput(e.target.value);
                                      setQtyMap((prev) => ({ ...prev, [item.id]: clean }));
                                    }}
                                    placeholder="0"
                                    className={`w-24 h-9 px-2 rounded-lg border bg-[var(--bg-canvas)] text-xs font-mono font-bold tabular-nums text-center focus:outline-none ${
                                      !v.valid
                                        ? 'border-[var(--status-danger)] text-[var(--status-danger)]'
                                        : 'border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]'
                                    }`}
                                  />
                                  <span className="text-[10.5px] font-semibold text-[var(--text-muted)] whitespace-nowrap">
                                    {item.countingUnit || (isFa ? 'عدد' : 'EA')}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-center gap-1 flex-wrap">
                                  <button
                                    type="button"
                                    data-testid={`miv-fill-emp-${item.id}`}
                                    disabled={v.mapna <= 0}
                                    onClick={() => {
                                      setQtyMap((prev) => ({ ...prev, [item.id]: String(v.mapna) }));
                                      setSourceWarehouseMap((prev) => ({ ...prev, [item.id]: 'employer' }));
                                    }}
                                    title={isFa ? `درج کل موجودی انبار کارفرما (${v.mapna})` : `Fill full Employer stock (${v.mapna})`}
                                    className="px-1.5 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-[10px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors whitespace-nowrap"
                                  >
                                    {isFa ? 'کل کارفرما' : 'All Emp'}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`miv-fill-con-${item.id}`}
                                    disabled={v.contractor <= 0}
                                    onClick={() => {
                                      setQtyMap((prev) => ({ ...prev, [item.id]: String(v.contractor) }));
                                      setSourceWarehouseMap((prev) => ({ ...prev, [item.id]: 'contractor' }));
                                    }}
                                    title={isFa ? `درج کل موجودی انبار پیمانکار (${v.contractor})` : `Fill full Contractor stock (${v.contractor})`}
                                    className="px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-[10px] font-bold text-sky-700 dark:text-sky-300 transition-colors whitespace-nowrap"
                                  >
                                    {isFa ? 'کل پیمانکار' : 'All Con'}
                                  </button>
                                </div>
                                {!v.valid && v.error && (
                                  <div
                                    data-testid={`miv-qty-error-${item.id}`}
                                    className="mt-1 text-[10.5px] font-semibold text-[var(--status-danger)] flex items-center justify-center gap-1"
                                  >
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <span>{v.error}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-start">
                                {existingNotes && (
                                  <div
                                    data-testid={`miv-existing-notes-${item.id}`}
                                    className="mb-1.5 px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[10.5px] text-[var(--text-secondary)] whitespace-pre-line"
                                  >
                                    <span className="font-bold text-[var(--text-muted)] block text-[9.5px]">
                                      {isFa ? 'توضیحات تجهیز قبلی (در بالا حفظ می‌شود):' : 'Existing Equipment Notes (kept above):'}
                                    </span>
                                    {existingNotes}
                                  </div>
                                )}
                                <textarea
                                  rows={2}
                                  data-testid={`miv-remark-input-${item.id}`}
                                  aria-label={isFa ? `توضیحات حواله برای ${item.description}` : `Remark for ${item.description}`}
                                  value={userRemarkMap[item.id] ?? ''}
                                  onChange={(e) =>
                                    setUserRemarkMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  placeholder={isFa ? 'توضیحات' : 'Remark'}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  aria-label={isFa ? 'حذف از حواله' : 'Remove from voucher'}
                                  onClick={() => handleToggleRow(item)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Submit Bar */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11.5px] text-[var(--text-muted)]">
                  {isFa
                    ? 'پس از ثبت، مقادیر به‌صورت خودکار از انبار کسر شده و پیش‌نمایش چاپ حواله باز می‌شود (Undo و Redo حتی پس از چاپ فعال است).'
                    : 'Upon issuing, stock is automatically deducted and print preview opens (Undo & Redo remain active even after printing).'}
                </span>
                <button
                  type="submit"
                  data-testid="miv-submit-btn"
                  disabled={submitting || hasInvalidRows}
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isFa
                        ? 'در حال ثبت...'
                        : 'Issuing...'
                      : editingDoc
                        ? isFa
                          ? 'ذخیره تغییرات حواله و بازگشایی چاپ'
                          : 'Save Changes & Preview'
                        : isFa
                          ? 'صدور حواله انبار، کسر موجودی و چاپ'
                          : 'Issue MIV, Deduct Stock & Print'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Issued MIV History Table (shown when user switches to Form History tab) */}
      {viewMode === 'history' && (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--accent-primary)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]" data-testid="miv-history-title">
              {isFa
                ? `سابقه حواله‌های انبار ثبت‌شده (${filteredDocuments.length})`
                : `Issued MIV History (${filteredDocuments.length})`}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-60">
              <SearchInputWithClear
                value={historySearch}
                onChange={setHistorySearch}
                placeholder={isFa ? 'جستجو در سابقه حواله‌ها...' : 'Search issued MIVs...'}
              />
            </div>

            <button
              type="button"
              onClick={() => setPrintReportOpen(true)}
              disabled={filteredDocuments.length === 0}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 text-xs font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isFa ? 'چاپ فهرست' : 'Print List'}</span>
            </button>
          </div>
        </div>

        <StickyTableWrapper maxHeightClass="max-h-[420px]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'شماره حواله' : 'MIV Doc No.'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor / Party'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'سیستم / جزیره' : 'System / Island'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'واحد' : 'Unit'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'شماره رسید' : 'Receipt No.'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'تعداد اقلام' : 'Items'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'نسخه اسکن امضاشده' : 'Signed Scan'}</th>
                <th className="px-3 py-2 whitespace-nowrap">{isFa ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : mivPagination.pageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    {isFa ? 'هنوز حواله انباری ثبت نشده است.' : 'No MIV documents issued yet.'}
                  </td>
                </tr>
              ) : (
                mivPagination.pageItems.map((doc) => (
                  <tr
                    key={doc.id}
                    data-testid={`miv-history-row-${doc.id}`}
                    onClick={() => setScanTarget(doc)}
                    title={isFa ? 'کلیک برای مشاهده یا بارگذاری اسکن امضاشده فرم' : 'Click to view or upload signed scan'}
                    className="hover:bg-[var(--bg-subtle)]/50 transition-colors cursor-pointer"
                  >
                    <td dir="ltr" className="px-3 py-2 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                      {doc.docNo}
                    </td>
                    <td dir="ltr" className="px-3 py-2 tabular-nums whitespace-nowrap text-[var(--text-secondary)]">
                      {formatDate(doc.date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-primary)] bidi-plaintext">
                      {doc.party || '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] bidi-plaintext">
                      {doc.islandSystem || '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {doc.unit || '—'}
                    </td>
                    <td dir="ltr" className="px-3 py-2 font-mono text-[var(--text-secondary)]">
                      {doc.receiptNo || '—'}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-bold text-[var(--accent-primary)]">
                      {doc.items.length}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SignedScanRowButton
                        signedScan={doc.signedScan}
                        recordLabel={doc.docNo}
                        onClick={() => setScanTarget(doc)}
                      />
                    </td>
                    <td
                      className="px-3 py-2 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          data-testid={`miv-print-btn-${doc.id}`}
                          onClick={() => {
                            setPrintDocWasUndone(false);
                            setPrintDoc(doc);
                          }}
                          title={isFa ? 'مشاهده و چاپ حواله' : 'Preview & Print'}
                          aria-label={isFa ? `چاپ ${doc.docNo}` : `Print ${doc.docNo}`}
                          className="p-1.5 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              data-testid={`miv-edit-btn-${doc.id}`}
                              onClick={() => void startEdit(doc)}
                              title={isFa ? 'ویرایش حواله' : 'Edit MIV'}
                              aria-label={isFa ? `ویرایش ${doc.docNo}` : `Edit ${doc.docNo}`}
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid={`miv-delete-btn-${doc.id}`}
                              onClick={() => setDeleteTarget(doc)}
                              title={isFa ? 'حذف حواله و بازگردانی موجودی' : 'Delete MIV & restore stock'}
                              aria-label={isFa ? `حذف ${doc.docNo}` : `Delete ${doc.docNo}`}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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
          page={mivPagination.page}
          totalPages={mivPagination.totalPages}
          pageSize={mivPagination.pageSize}
          total={mivPagination.total}
          onPageChange={mivPagination.setPage}
          onPageSizeChange={mivPagination.setPageSize}
          lang={prefs.language}
        />
      </div>
      )}

      {/* Official MIV Print Preview Modal (with Post-Print Undo & Redo Controls) */}
      {printDoc && (
        <div
          data-testid="miv-print-preview-modal"
          className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:hidden"
        >
          <div className="w-full max-w-[1160px] max-h-[94vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden">
            {/* Modal Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Printer className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  {isFa
                    ? `پیش‌نمایش چاپ حواله انبار — ${printDoc.docNo} (${MD1_MIV_FORM_CODE})`
                    : `MIV Print Preview — ${printDoc.docNo} (${MD1_MIV_FORM_CODE})`}
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
                      data-testid="miv-preview-undo-btn"
                      disabled={!historyStatus.canUndo || historyBusy}
                      onClick={() => void performUndo()}
                      title={isFa ? 'واگرد (بازگردانی حواله و موجودی)' : 'Undo (revert MIV & stock)'}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد' : 'Undo'}</span>
                    </button>
                    <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
                    <button
                      type="button"
                      data-testid="miv-preview-redo-btn"
                      disabled={!historyStatus.canRedo || historyBusy}
                      onClick={() => void performRedo()}
                      title={isFa ? 'انجام مجدد (اعمال مجدد حواله)' : 'Redo (reapply MIV)'}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="miv-preview-print-btn"
                  disabled={printDocWasUndone}
                  onClick={() => triggerAppPrint()}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ حواله (A4 افقی)' : 'Print MIV (A4 Landscape)'}</span>
                </button>

                <button
                  type="button"
                  data-testid="miv-preview-close-btn"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => {
                    setPrintDoc(null);
                    setPrintDocWasUndone(false);
                  }}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {printDocWasUndone && (
              <div
                data-testid="miv-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {isFa
                    ? 'این حواله با عملیات واگرد (Undo) بازگردانی شده و موجودی به انبار برگشته است. با دکمه «انجام مجدد (Redo)» می‌توانید دوباره آن را اعمال کنید.'
                    : 'This MIV was reverted via Undo and stock has been restored. Click Redo above to reapply it.'}
                </span>
              </div>
            )}

            <div className="p-4 sm:p-6 overflow-auto bg-slate-200/75 dark:bg-slate-900/70">
              <div className={printDocWasUndone ? 'opacity-50 pointer-events-none' : ''}>
                <OfficialMivSheet
                  doc={printDoc}
                  detailedItems={detailedItemsList}
                  formatDate={formatDate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History List Print Report Modal */}
      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={isFa ? 'گزارش سابقه حواله‌های انبار (MIV)' : 'Issued MIV Documents Report'}
        subtitle={activeProject?.name || ''}
        columns={historyColumns}
        rows={filteredDocuments}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف حواله انبار' : 'Delete MIV Document'}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف حواله شماره «${deleteTarget.docNo}» اطمینان دارید؟ مقادیر کسرشده به‌طور خودکار به موجودی انبارهای کارفرما و پیمانکار بازگردانده می‌شود.`
              : `Delete MIV "${deleteTarget.docNo}"? Deducted stock will be automatically restored to Employer/Contractor inventories.`
            : ''
        }
        confirmLabel={isFa ? 'تأیید حذف و بازگردانی موجودی' : 'Delete & Restore Stock'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Signed Form Scan Viewer / Uploader Modal */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="miv"
          recordId={scanTarget.id}
          recordLabel={scanTarget.docNo}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={(nextScan) => {
            setDocuments((prev) =>
              prev.map((d) => (d.id === scanTarget.id ? { ...d, signedScan: nextScan } : d)),
            );
            setScanTarget((prev) => (prev ? { ...prev, signedScan: nextScan } : null));
          }}
        />
      )}
    </div>
  );
};
