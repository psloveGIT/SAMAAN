import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Pencil,
  Printer,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { triggerAppPrint } from '../lib/print.ts';
import { getEmployerFormCode, resolveBuiltInFormDesign } from '../shared/employers.ts';
import {
  buildGcvHeaderAutoFill,
  checkGcvRowsCompatibility,
  combineGcvRemark,
  formatGcvPlPackageNo,
  GCV_PURCHASE_BY_OPTIONS,
  generateGcvReceiptNo,
  getGcvRowGroupProfile,
  MD1_GCV_COMPANY_NAME,
  MD1_GCV_COPY_TEXT,
  MD1_GCV_FORM_CODE,
  MD1_GCV_QA_NOTICE,
  MD1_GCV_TITLE_EN,
  MD1_GCV_TITLE_FA,
  resolveGcvQuantities,
  type GcvPurchaseByOption,
} from '../shared/gcv.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { formatHeaderProjectTitle } from '../shared/opiInvitation.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import type {
  DetailedComputed,
  DocumentLineItem,
  GcvDocumentRecord,
  GeneralEntry,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { BuiltInSheetHeaderRow, OfficialExtraMetaStrip } from './OfficialSheetHeader.tsx';
import {
  OperationalViewModeTabs,
  type OperationalViewMode,
} from './OperationalViewModeTabs.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { SubstitutionItemPicker } from './SubstitutionItemPicker.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface GcvApiResponse {
  documents: GcvDocumentRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  allUsedDocNos?: string[];
}

interface GcvViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const GcvRadioCircle: React.FC<{ checked?: boolean }> = ({ checked }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '12px',
      height: '12px',
      borderRadius: '9999px',
      border: '1.3px solid #000000',
      backgroundColor: checked ? '#000000' : '#ffffff',
      flexShrink: 0,
    }}
  />
);

interface OfficialGcvSheetProps {
  doc: GcvDocumentRecord;
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  formatDate: (iso: string) => string;
}

export const OfficialGcvSheet: React.FC<OfficialGcvSheetProps> = ({
  doc,
  detailedItems,
  generalEntries = [],
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'gcv');
  const isMd1Default = activeEmployer.id === 'mapna-md1' && !design.template;
  const formCode = isMd1Default ? MD1_GCV_FORM_CODE : design.docCode || MD1_GCV_FORM_CODE;

  const effectiveDesign = useMemo(
    () =>
      isMd1Default
        ? {
            ...design,
            companyTitle: MD1_GCV_COMPANY_NAME,
            titleFa: MD1_GCV_TITLE_FA,
            titleEn: MD1_GCV_TITLE_EN,
            docCode: MD1_GCV_FORM_CODE,
            footerCopyText: MD1_GCV_COPY_TEXT,
          }
        : design,
    [design, isMd1Default],
  );

  const projectHeaderTitle = formatHeaderProjectTitle(doc.projectName || activeProject?.name);

  const detailedById = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of detailedItems) map.set(d.id, d);
    return map;
  }, [detailedItems]);

  const fallbackHeader = useMemo(() => {
    const matched = doc.items
      .map((line) => detailedById.get(line.detailedId))
      .filter((x): x is DetailedComputed => Boolean(x));
    return buildGcvHeaderAutoFill(matched, generalEntries, activeProject);
  }, [doc.items, detailedById, generalEntries, activeProject]);

  const resolvedReleaseNoteNo = (doc.releaseNoteNo || '').trim() || fallbackHeader.releaseNoteNo;
  const resolvedSupplier = (doc.supplier || '').trim() || fallbackHeader.supplier;
  const resolvedWaybillNo = (doc.waybillNo || '').trim() || fallbackHeader.waybillNo;
  const resolvedIslandSystem = (doc.islandSystem || '').trim() || fallbackHeader.islandSystem;

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, doc.items.length);
  const paddedRows: Array<DocumentLineItem | null> = [
    ...doc.items,
    ...Array.from({ length: Math.max(0, totalDisplayRows - doc.items.length) }, () => null),
  ];

  const purchaseByLabel = (opt: GcvPurchaseByOption) =>
    GCV_PURCHASE_BY_OPTIONS.find((o) => o.value === opt)?.labelFa || '';

  return (
    <div
      dir="rtl"
      data-testid="official-gcv-sheet"
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
          leftMetaNoPadding
          leftMetaSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                fontSize: '10px',
                fontWeight: 700,
                textAlign: 'right',
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '6px 8px',
                  borderBottom: '1px solid #000000',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>شماره:</span>
                <span dir="ltr" className="tabular-nums" style={{ fontWeight: 800 }}>
                  {doc.receiptNo}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '6px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>تاریخ:</span>
                <span dir="ltr" className="tabular-nums">
                  {formatDate(doc.date)}
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

        {/* Metadata Strip Row 1 (5 columns RTL: درخواست خرید | تامین کننده | کارشناس خرید | شماره بسته خرید | Realised Note No.) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.05fr 1.15fr 1.1fr 1.1fr 1.15fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.6px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>درخواست خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {doc.purchaseRequestNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{resolvedSupplier || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>کارشناس خرید: </strong>
            <span className="bidi-plaintext">{doc.buyerName || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {doc.purchasePackageNo || ''}
            </span>
          </div>
          <div dir="ltr" style={{ padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>Realised Note No.: </strong>
            <span className="tabular-nums">{resolvedReleaseNoteNo || ''}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (3 columns RTL with vertical dividers: خرید توسط | جزیره:/سیستم: | شماره بارنامه:) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            alignItems: 'stretch',
            borderBottom: '1px solid #000000',
            fontSize: '9.6px',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <strong style={{ fontWeight: 700 }}>خرید توسط:</strong>
            {(['tehran_proc', 'site_admin', 'contractor_supplier'] as const).map((opt) => (
              <span
                key={opt}
                data-testid={`gcv-sheet-purchaseby-${opt}`}
                data-checked={doc.purchaseBy === opt ? 'true' : 'false'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <GcvRadioCircle checked={doc.purchaseBy === opt} />
                <span>{purchaseByLabel(opt)}</span>
              </span>
            ))}
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '4px',
            }}
          >
            <strong style={{ fontWeight: 700 }}>جزیره/سیستم: </strong>
            <span className="bidi-plaintext">{resolvedIslandSystem || ''}</span>
          </div>

          <div
            style={{
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '4px',
            }}
          >
            <strong style={{ fontWeight: 700 }}>شماره بارنامه: </strong>
            <span dir="ltr" className="tabular-nums">
              {resolvedWaybillNo || ''}
            </span>
          </div>
        </div>

        {/* 9-Column LTR Items Table */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.2px',
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
                Item No.
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
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  textAlign: 'center',
                }}
              >
                Technical info/Size
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
                Quantity
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
            {paddedRows.map((row, idx) => {
              const detailed = row ? detailedById.get(row.detailedId) : undefined;
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              // Rule 1-12: PL/Package No. = shipmentNo/packageNo
              const plText = row
                ? formatGcvPlPackageNo(
                    row.shipmentNo || detailed?.shipmentNo,
                    row.packageNo || detailed?.packageNo,
                  )
                : '';
              // Rule 1-13: Package Item = Detailed itemNo ("شماره آیتم")
              const pkgItemText = row ? (row.itemNo || detailed?.itemNo || '') : '';
              // Rule 1-14: Description = Detailed description ("شرح")
              const descText = row
                ? row.description || detailed?.description || detailed?.generalDescription || ''
                : '';
              // Rule 1-15: Technical info/Size = Detailed size ("اندازه")
              const techText = row ? (row.technicalInfo || detailed?.size || '') : '';
              // Rule 1-16: Tag No. = Detailed itemCode ("کد کالا")
              const tagText = row ? (row.tagNo || detailed?.itemCode || '') : '';
              // Rule 1-17: UOM = Detailed countingUnit ("واحد شمارش")
              const uomText = row ? (row.uom || detailed?.countingUnit || '') : '';
              // Rule 1-20: Remark = Detailed equipment notes + userRemark stacked underneath
              const remarkText = row
                ? combineGcvRemark(
                    row.equipmentNotes !== undefined ? row.equipmentNotes : detailed?.notes,
                    row.userRemark,
                  ) ||
                  row.remark ||
                  ''
                : '';

              return (
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`}>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row ? idx + 1 : '\u00A0'}
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
                    {plText}
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
                    {pkgItemText}
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
                    {descText}
                  </td>
                  <td
                    dir="auto"
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {techText}
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
                    {tagText}
                  </td>
                  <td
                    dir="auto"
                    className="bidi-plaintext samaan-col-compact"
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '4px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {uomText}
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
                    {row ? row.qty : ''}
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
                    {remarkText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lower Approval, QA Notice & Enclosed Footer Frame */}
      <div
        className="samaan-keep-together"
        style={{
          border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}`,
          marginTop: '10px',
        }}
      >
        {/* Row 1: امضاء */}
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

        {/* Row 2: 2 Group Headers (verbatim MD1EX-FQP02/11-03) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '10px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '4px 8px' }}>
            تحویل گیرنده / پیمانکار نصب
          </div>
          <div style={{ padding: '4px 8px' }}>
            {isMd1Default ? 'شرکت توسعه یک مپنا' : activeEmployer.companyFullName}
          </div>
        </div>

        {/* Row 3: 4 Equal Signature Boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            minHeight: '72px',
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
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.storekeeper || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>مدیر پروژه / سرپرست کارگاه/ دفتر فنی:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.receiverManager || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>تأمین تجهیزات:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.equipmentSupply || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>مدیر پروژه/ سرپرست کارگاه:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.mapnaSiteManager || ''}
            </div>
          </div>
        </div>

        {/* Row 4: Right-Aligned QA Notice */}
        <div
          dir="rtl"
          data-testid="gcv-qa-notice"
          style={{
            padding: '4px 10px',
            fontSize: '8.5px',
            fontWeight: 600,
            textAlign: 'right',
            borderBottom: '1px solid #000000',
          }}
        >
          {effectiveDesign.template?.introText || MD1_GCV_QA_NOTICE}
        </div>

        {/* Row 5: Enclosed Copy & Form Code Footer */}
        <div
          dir="rtl"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            fontSize: '8.8px',
            fontWeight: 700,
          }}
        >
          <span>{effectiveDesign.footerCopyText || MD1_GCV_COPY_TEXT}</span>
          <span dir="ltr" className="tabular-nums">
            {[formCode, effectiveDesign.revisionText].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
};

export const GcvView: React.FC<GcvViewProps> = ({ refreshSignal, onDataChanged }) => {
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
  const formCode = getEmployerFormCode(activeEmployer, '11-03') || MD1_GCV_FORM_CODE;

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<GcvApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 Selection state + Selection Undo/Redo stack
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});
  const [selectionPast, setSelectionPast] = useState<Array<Record<string, DetailedComputed>>>([]);
  const [selectionFuture, setSelectionFuture] = useState<Array<Record<string, DetailedComputed>>>([]);

  // Step 2 Form inputs
  const [receiptNo, setReceiptNo] = useState('');
  const [receiptNoTouched, setReceiptNoTouched] = useState(false);
  const [date, setDate] = useState(getTodayIso());
  const [purchaseRequestNo, setPurchaseRequestNo] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [purchaseBy, setPurchaseBy] = useState<GcvPurchaseByOption | ''>('');
  const [userRemarkMap, setUserRemarkMap] = useState<Record<string, string>>({});

  // Optional header overrides (collapsed by default — auto-filled from Detailed + General)
  const [showAdvancedHeader, setShowAdvancedHeader] = useState(false);
  const [supplierOverride, setSupplierOverride] = useState('');
  const [releaseNoteOverride, setReleaseNoteOverride] = useState('');
  const [islandSystemOverride, setIslandSystemOverride] = useState('');
  const [waybillOverride, setWaybillOverride] = useState('');

  // History / Edit / Delete / Print / Scan state
  const [historySearch, setHistorySearch] = useState('');
  const [editingDoc, setEditingDoc] = useState<GcvDocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GcvDocumentRecord | null>(null);
  const [printDoc, setPrintDoc] = useState<GcvDocumentRecord | null>(null);
  const [printDocWasUndone, setPrintDocWasUndone] = useState(false);
  const [printReportOpen, setPrintReportOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<GcvDocumentRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<GcvApiResponse>('/api/gcv');
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

  // Keep Print Preview modal synced with Undo/Redo
  useEffect(() => {
    if (!printDoc || !data) return;
    const found = (data.documents || []).find((d) => d.id === printDoc.id);
    if (found) {
      setPrintDocWasUndone(false);
      if (found !== printDoc) setPrintDoc(found);
    } else {
      setPrintDocWasUndone(true);
    }
  }, [data, printDoc]);

  // Keep scanTarget synced after upload/delete
  useEffect(() => {
    if (!scanTarget || !data) return;
    const updated = (data.documents || []).find((d) => d.id === scanTarget.id);
    if (updated && updated.signedScan !== scanTarget.signedScan) {
      setScanTarget(updated);
    }
  }, [data, scanTarget]);

  const suggestedReceiptNo = useMemo(
    () =>
      generateGcvReceiptNo(
        (data?.documents || []).map((d) => d.receiptNo),
        activeProject,
      ),
    [data?.documents, activeProject],
  );

  // Auto-populate unique receipt number when creating a new GCV
  useEffect(() => {
    if (!editingDoc && !receiptNoTouched && suggestedReceiptNo) {
      setReceiptNo(suggestedReceiptNo);
    }
  }, [editingDoc, receiptNoTouched, suggestedReceiptNo]);

  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const activeGroupProfile = useMemo(
    () =>
      selectedList.length > 0
        ? getGcvRowGroupProfile(selectedList[0], data?.generalEntries || [])
        : null,
    [selectedList, data?.generalEntries],
  );

  const autoFilledHeader = useMemo(
    () => buildGcvHeaderAutoFill(selectedList, data?.generalEntries || [], activeProject),
    [selectedList, data?.generalEntries, activeProject],
  );

  const effectiveSupplier = supplierOverride.trim() || autoFilledHeader.supplier;
  const effectiveReleaseNote = releaseNoteOverride.trim() || autoFilledHeader.releaseNoteNo;
  const effectiveIslandSystem = islandSystemOverride.trim() || autoFilledHeader.islandSystem;
  const effectiveWaybill = waybillOverride.trim() || autoFilledHeader.waybillNo;

  // Selection history helpers
  const commitSelection = useCallback(
    (next: Record<string, DetailedComputed>) => {
      setSelectionPast((prev) => [...prev.slice(-29), selectedMap]);
      setSelectionFuture([]);
      setSelectedMap(next);
    },
    [selectedMap],
  );

  const handleToggleRow = useCallback(
    (item: DetailedComputed) => {
      const next = { ...selectedMap };
      if (next[item.id]) {
        delete next[item.id];
        commitSelection(next);
        return;
      }
      const candidateList = [...Object.values(next), item];
      const check = checkGcvRowsCompatibility(candidateList, data?.generalEntries || []);
      if (!check.compatible) {
        notify(
          'warning',
          isFa
            ? `اقلام یک رسید مصرف باید در فیلدهای تاریخ ورود، شماره بارنامه، سیستم، ساب سیستم، جزیره، تأمین‌کننده و واحد یکسان باشند. مغایرت در: ${check.mismatchedLabelsFa.join('، ')}`
            : `All GCV items must share identical group fields. Mismatch in: ${check.mismatchedLabelsFa.join(', ')}`,
        );
        return;
      }
      next[item.id] = item;
      commitSelection(next);
    },
    [selectedMap, commitSelection, data?.generalEntries, notify, isFa],
  );

  const handleTogglePage = useCallback(
    (rows: DetailedComputed[], allSelected: boolean) => {
      const next = { ...selectedMap };
      if (allSelected) {
        for (const r of rows) delete next[r.id];
        commitSelection(next);
        return;
      }
      let skipped = 0;
      const skippedFields = new Set<string>();
      for (const r of rows) {
        if (next[r.id]) continue;
        const candidateList = [...Object.values(next), r];
        const check = checkGcvRowsCompatibility(candidateList, data?.generalEntries || []);
        if (check.compatible) {
          next[r.id] = r;
        } else {
          skipped += 1;
          for (const lbl of check.mismatchedLabelsFa) skippedFields.add(lbl);
        }
      }
      if (skipped > 0) {
        notify(
          'warning',
          isFa
            ? `${skipped} ردیف به دلیل یکسان نبودن فیلدهای گروه (${Array.from(skippedFields).join('، ')}) انتخاب نشد.`
            : `${skipped} row(s) skipped due to differing GCV group fields.`,
        );
      }
      commitSelection(next);
    },
    [selectedMap, commitSelection, data?.generalEntries, notify, isFa],
  );

  const handleSelectionUndo = () => {
    if (selectionPast.length === 0) return;
    const prev = selectionPast[selectionPast.length - 1];
    setSelectionPast((p) => p.slice(0, -1));
    setSelectionFuture((f) => [selectedMap, ...f.slice(0, 29)]);
    setSelectedMap(prev);
  };

  const handleSelectionRedo = () => {
    if (selectionFuture.length === 0) return;
    const next = selectionFuture[0];
    setSelectionFuture((f) => f.slice(1));
    setSelectionPast((p) => [...p.slice(-29), selectedMap]);
    setSelectedMap(next);
  };

  const handleClearSelection = () => {
    if (selectedList.length === 0) return;
    commitSelection({});
  };

  const resetForm = useCallback(() => {
    setEditingDoc(null);
    setStep(1);
    setSelectedMap({});
    setSelectionPast([]);
    setSelectionFuture([]);
    setReceiptNo('');
    setReceiptNoTouched(false);
    setDate(getTodayIso());
    setPurchaseRequestNo('');
    setBuyerName('');
    setPurchasePackageNo('');
    setPurchaseBy('');
    setUserRemarkMap({});
    setShowAdvancedHeader(false);
    setSupplierOverride('');
    setReleaseNoteOverride('');
    setIslandSystemOverride('');
    setWaybillOverride('');
  }, []);

  const startEdit = (doc: GcvDocumentRecord) => {
    setViewMode('create');
    setEditingDoc(doc);
    setReceiptNo(doc.receiptNo || '');
    setReceiptNoTouched(true);
    setDate(doc.date || getTodayIso());
    setPurchaseRequestNo(doc.purchaseRequestNo || '');
    setBuyerName(doc.buyerName || '');
    setPurchasePackageNo(doc.purchasePackageNo || '');
    setPurchaseBy(doc.purchaseBy || '');
    setSupplierOverride(doc.supplier || '');
    setReleaseNoteOverride(doc.releaseNoteNo || '');
    setIslandSystemOverride(doc.islandSystem || '');
    setWaybillOverride(doc.waybillNo || '');

    const detById = new Map<string, DetailedComputed>();
    for (const d of data?.detailedItems || []) detById.set(d.id, d);

    const nextSelected: Record<string, DetailedComputed> = {};
    const nextRemarks: Record<string, string> = {};
    for (const line of doc.items || []) {
      const det = detById.get(line.detailedId);
      if (det) {
        nextSelected[det.id] = det;
      }
      if (line.userRemark !== undefined) {
        nextRemarks[line.detailedId] = line.userRemark;
      } else if (line.remark) {
        const eqNotes = (det?.notes || '').trim();
        if (eqNotes && line.remark.startsWith(`${eqNotes}\n`)) {
          nextRemarks[line.detailedId] = line.remark.slice(eqNotes.length + 1);
        } else if (line.remark !== eqNotes) {
          nextRemarks[line.detailedId] = line.remark;
        }
      }
    }
    setSelectedMap(nextSelected);
    setSelectionPast([]);
    setSelectionFuture([]);
    setUserRemarkMap(nextRemarks);
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedList.length === 0) {
      notify(
        'warning',
        isFa ? 'ابتدا حداقل یک قلم کالا را انتخاب کنید.' : 'Please select at least one item first.',
      );
      setStep(1);
      return;
    }
    const finalReceiptNo = (receiptNo || suggestedReceiptNo).trim();
    if (!finalReceiptNo) {
      notify(
        'warning',
        isFa ? 'شماره رسید مصرف الزامی است.' : 'Receipt number is required.',
      );
      return;
    }
    if (!purchaseBy) {
      notify(
        'warning',
        isFa
          ? 'لطفاً گزینه «خرید توسط» (تدارکات تهران / مالی- اداری کارگاه / پیمانکار تامین کننده) را انتخاب کنید.'
          : 'Please select a "Purchased By" option.',
      );
      return;
    }

    const lineItemsPayload = selectedList.map((d) => {
      const { formQty } = resolveGcvQuantities(d);
      const eqNotes = (d.notes || '').trim();
      const usrRem = (userRemarkMap[d.id] || '').trim();
      return {
        detailedId: d.id,
        qty: formQty,
        technicalInfo: (d.size || '').trim(),
        tagNo: (d.itemCode || '').trim(),
        uom: (d.countingUnit || '').trim(),
        equipmentNotes: eqNotes,
        userRemark: usrRem,
        remark: combineGcvRemark(eqNotes, usrRem),
      };
    });

    const payload = {
      receiptNo: finalReceiptNo,
      date: date || getTodayIso(),
      projectName: activeProject?.name || '',
      purchaseRequestNo: purchaseRequestNo.trim(),
      supplier: effectiveSupplier,
      buyerName: buyerName.trim(),
      purchasePackageNo: purchasePackageNo.trim(),
      releaseNoteNo: effectiveReleaseNote,
      purchaseBy,
      islandSystem: effectiveIslandSystem,
      waybillNo: effectiveWaybill,
      items: lineItemsPayload,
    };

    setSubmitting(true);
    try {
      if (editingDoc) {
        const res = await apiRequest<{ document: GcvDocumentRecord }>(`/api/gcv/${editingDoc.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `رسید مصرف مستقیم کالا شماره ${res.document.receiptNo} ویرایش و در جدول جزئیات به‌روزرسانی شد.`
            : `GCV ${res.document.receiptNo} updated and Detailed Equipment synced.`,
        );
        resetForm();
        setPrintDocWasUndone(false);
        setPrintDoc(res.document);
        triggerAutoSnapshot(`Edit GCV ${res.document.receiptNo}`);
        onDataChanged();
        await loadData();
      } else {
        const res = await apiRequest<{ document: GcvDocumentRecord }>('/api/gcv', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `رسید مصرف مستقیم کالا شماره ${res.document.receiptNo} صادر و در جدول جزئیات ثبت شد.`
            : `GCV ${res.document.receiptNo} issued and synced to Detailed Equipment.`,
        );
        resetForm();
        setPrintDocWasUndone(false);
        setPrintDoc(res.document);
        triggerAutoSnapshot(`GCV ${res.document.receiptNo}`);
        onDataChanged();
        await loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/gcv/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `رسید مصرف مستقیم شماره ${deleteTarget.receiptNo} حذف و مقادیر جدول جزئیات بازگردانی شد.`
          : `GCV ${deleteTarget.receiptNo} deleted and Detailed Equipment restored.`,
      );
      if (editingDoc?.id === deleteTarget.id) resetForm();
      if (printDoc?.id === deleteTarget.id) setPrintDoc(null);
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete GCV ${deleteTarget.receiptNo}`);
      onDataChanged();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const documentsList = useMemo(() => data?.documents || [], [data]);

  const filteredDocuments = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return documentsList;
    return documentsList.filter((doc) =>
      [
        doc.receiptNo,
        doc.purchaseRequestNo,
        doc.supplier,
        doc.buyerName,
        doc.purchasePackageNo,
        doc.releaseNoteNo,
        doc.islandSystem,
        doc.waybillNo,
        ...doc.items.map((i) => `${i.shipmentNo} ${i.packageNo} ${i.tagNo || i.itemNo} ${i.description}`),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [documentsList, historySearch]);

  const docsPagination = useClientPagination(filteredDocuments, 50);

  const purchaseByDisplay = (val?: string) => {
    const found = GCV_PURCHASE_BY_OPTIONS.find((o) => o.value === val);
    return found ? (isFa ? found.labelFa : found.labelEn) : '-';
  };

  const historyColumns = useMemo<PrintColumnDef<GcvDocumentRecord>[]>(
    () => [
      { key: 'receiptNo', header: isFa ? 'شماره رسید مصرف' : 'GCV No.', getValue: (r) => r.receiptNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      {
        key: 'purchaseRequestNo',
        header: isFa ? 'درخواست خرید' : 'Purchase Req.',
        getValue: (r) => r.purchaseRequestNo || '',
      },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'buyerName', header: isFa ? 'کارشناس خرید' : 'Buyer', getValue: (r) => r.buyerName || '' },
      {
        key: 'purchasePackageNo',
        header: isFa ? 'شماره بسته خرید' : 'Purchase Pkg.',
        getValue: (r) => r.purchasePackageNo || '',
      },
      { key: 'releaseNoteNo', header: 'Realised Note No.', getValue: (r) => r.releaseNoteNo || '' },
      {
        key: 'purchaseBy',
        header: isFa ? 'خرید توسط' : 'Purchased By',
        getValue: (r) => purchaseByDisplay(r.purchaseBy),
      },
      {
        key: 'islandSystem',
        header: isFa ? 'جزیره/سیستم' : 'Island/System',
        getValue: (r) => r.islandSystem || '',
      },
      { key: 'waybillNo', header: isFa ? 'شماره بارنامه' : 'Waybill No.', getValue: (r) => r.waybillNo || '' },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => r.items.length },
      { key: 'createdBy', header: isFa ? 'ثبت‌کننده' : 'Created By', getValue: (r) => r.createdBy },
    ],
    [t, isFa],
  );

  return (
    <div className="space-y-5" data-testid="gcv-view">
      {/* Isolated A4 Landscape Print Portal (Pure white 8mm margins, zero gray border) */}
      {printDoc && !printReportOpen
        ? createPortal(
            <div id="samaan-gcv-print-root" data-samaan-print-portal="true">
              <style>
                {buildIsolatedPrintPortalCss('samaan-gcv-print-root', {
                  orientation: 'landscape',
                  isFa,
                  marginMm: 8,
                  extraPrintCss: `
                    #samaan-gcv-print-root table th,
                    #samaan-gcv-print-root table td {
                      text-align: center;
                      vertical-align: middle;
                    }
                  `,
                })}
              </style>
              <OfficialGcvSheet
                doc={printDoc}
                detailedItems={data?.detailedItems || []}
                generalEntries={data?.generalEntries || []}
                formatDate={formatDate}
              />
            </div>,
            document.body,
          )
        : null}

      {/* Top Mode Bar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <FileCheck2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {isFa ? MD1_GCV_TITLE_FA : MD1_GCV_TITLE_EN}
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                {formCode}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {isFa
                ? 'انتخاب اقلام فاقد شماره رسید مصرف از جدول جزئیات، تکمیل مشخصات خرید و صدور فرم رسمی A4 افقی'
                : 'Select Detailed items without a GCV receipt number, complete procurement info, and issue official A4 Landscape voucher'}
            </p>
          </div>
        </div>

        <OperationalViewModeTabs
          viewMode={viewMode}
          onChange={(mode) => {
            setViewMode(mode);
            if (mode === 'history' && editingDoc) {
              resetForm();
            }
          }}
          historyCount={documentsList.length}
          isFa={isFa}
          canCreate={canEdit}
          isEditing={Boolean(editingDoc)}
          testIdPrefix="gcv"
        />
      </div>

      {/* CREATE / EDIT WORKFLOW */}
      {canEdit && viewMode === 'create' && (
        <div className="space-y-4 print:hidden">
          {/* Step Indicator & Editing Banner */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                data-testid="gcv-step-1-tab"
                onClick={() => setStep(1)}
                className={`h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                  step === 1
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/15 inline-flex items-center justify-center text-[11px] tabular-nums">
                  1
                </span>
                <span>{isFa ? 'فیلتر و انتخاب اقلام (فاقد رسید مصرف)' : '1. Filter & Select Items'}</span>
              </button>

              <span className="text-[var(--text-muted)] text-xs">→</span>

              <button
                type="button"
                data-testid="gcv-step-2-tab"
                disabled={selectedList.length === 0}
                onClick={() => setStep(2)}
                className={`h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-45 ${
                  step === 2
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/15 inline-flex items-center justify-center text-[11px] tabular-nums">
                  2
                </span>
                <span>{isFa ? 'اطلاعات خرید، توضیحات و صدور فرم' : '2. Procurement Info & Issue'}</span>
              </button>

              {editingDoc && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                  {isFa ? `در حال ویرایش: ${editingDoc.receiptNo}` : `Editing: ${editingDoc.receiptNo}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {editingDoc && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t.controls.cancel}</span>
                </button>
              )}
              <span
                data-testid="gcv-selected-count"
                className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-extrabold tabular-nums"
              >
                {isFa ? `${selectedList.length} قلم انتخاب‌شده` : `${selectedList.length} Selected`}
              </span>
            </div>
          </div>

          {/* STEP 1: Filter & Select Detailed Items without GCV Receipt No. */}
          {step === 1 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
              {/* Selection Undo / Redo / Clear & Next Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="gcv-sel-undo-btn"
                    disabled={selectionPast.length === 0}
                    onClick={handleSelectionUndo}
                    className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>{isFa ? 'واگرد انتخاب' : 'Undo'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="gcv-sel-redo-btn"
                    disabled={selectionFuture.length === 0}
                    onClick={handleSelectionRedo}
                    className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                    <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="gcv-sel-clear-btn"
                    disabled={selectedList.length === 0}
                    onClick={handleClearSelection}
                    className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-semibold inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isFa ? 'پاک کردن انتخاب‌ها' : 'Clear'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  data-testid="gcv-next-step-btn"
                  disabled={selectedList.length === 0}
                  onClick={() => setStep(2)}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <span>
                    {isFa
                      ? `ادامه به مرحله ۲ (${selectedList.length} قلم)`
                      : `Continue to Step 2 (${selectedList.length})`}
                  </span>
                  {isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>

              {activeGroupProfile && (
                <div
                  data-testid="gcv-group-lock-strip"
                  className="p-2.5 rounded-xl border border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]/50 text-[11px] flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-primary)]"
                >
                  <strong className="text-[var(--accent-primary)]">
                    {isFa ? 'گروه مجاز انتخاب هم‌زمان:' : 'Locked GCV Group:'}
                  </strong>
                  <span>{isFa ? 'تاریخ ورود:' : 'Arrival:'} <strong dir="ltr">{activeGroupProfile.arrivalDate ? formatDate(activeGroupProfile.arrivalDate) : '—'}</strong></span>
                  <span>{isFa ? 'بارنامه:' : 'Waybill:'} <strong dir="ltr">{activeGroupProfile.billOfLadingNo || '—'}</strong></span>
                  <span>{isFa ? 'سیستم:' : 'System:'} <strong>{activeGroupProfile.system || '—'}</strong></span>
                  <span>{isFa ? 'ساب سیستم:' : 'Sub-System:'} <strong>{activeGroupProfile.subSystem || '—'}</strong></span>
                  <span>{isFa ? 'جزیره:' : 'Island:'} <strong>{activeGroupProfile.island || '—'}</strong></span>
                  <span>{isFa ? 'تأمین‌کننده:' : 'Supplier:'} <strong>{activeGroupProfile.supplier || '—'}</strong></span>
                  <span>{isFa ? 'واحد:' : 'Unit:'} <strong>{activeGroupProfile.unit || '—'}</strong></span>
                </div>
              )}

              {/* Detailed-Equipment-grade Picker filtered to rows with NO gcvReceiptNo */}
              <SubstitutionItemPicker
                noGcvOnly={true}
                allowGcvReceiptNo={editingDoc?.receiptNo || ''}
                refreshSignal={refreshSignal}
                selectedMap={selectedMap}
                onToggleRow={handleToggleRow}
                onTogglePage={handleTogglePage}
                testIdPrefix="gcv-picker"
              />
            </div>
          )}

          {/* STEP 2: Procurement Inputs, Per-Row Remarks & Issue */}
          {step === 2 && (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <button
                  type="button"
                  data-testid="gcv-back-step-btn"
                  onClick={() => setStep(1)}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت به انتخاب اقلام' : 'Back to Selection'}</span>
                </button>

                <div className="text-xs text-[var(--text-secondary)]">
                  {isFa
                    ? 'فیلدهای سربرگ از جدول جزئیات و ثبت کلی به‌صورت خودکار پر می‌شوند؛ فقط اطلاعات خرید زیر را وارد نمایید.'
                    : 'Header metadata auto-fills from Detailed & General tables; complete the procurement fields below.'}
                </div>
              </div>

              {/* Primary Required Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      {isFa ? 'شماره رسید مصرف (یکتا) *' : 'GCV No. (Unique) *'}
                    </label>
                    {!editingDoc && suggestedReceiptNo && receiptNo !== suggestedReceiptNo && (
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptNo(suggestedReceiptNo);
                          setReceiptNoTouched(false);
                        }}
                        className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline"
                        dir="ltr"
                      >
                        {suggestedReceiptNo}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    data-testid="gcv-receipt-no-input"
                    dir="ltr"
                    value={receiptNo}
                    onChange={(e) => {
                      setReceiptNo(e.target.value);
                      setReceiptNoTouched(true);
                    }}
                    placeholder={suggestedReceiptNo}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums text-left focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <JalaliDateInput
                  label={`${isFa ? 'تاریخ رسید (پیش‌فرض: امروز)' : 'Receipt Date'} *`}
                  value={date}
                  onChange={setDate}
                />

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'درخواست خرید' : 'Purchase Request No.'}
                  </label>
                  <input
                    type="text"
                    data-testid="gcv-pr-input"
                    dir="auto"
                    value={purchaseRequestNo}
                    onChange={(e) => setPurchaseRequestNo(e.target.value)}
                    placeholder={isFa ? 'شماره درخواست خرید...' : 'PR No...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کارشناس خرید' : 'Buyer Name'}
                  </label>
                  <input
                    type="text"
                    data-testid="gcv-buyer-input"
                    dir="auto"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder={isFa ? 'نام کارشناس خرید...' : 'Buyer name...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره بسته خرید' : 'Purchase Package No.'}
                  </label>
                  <input
                    type="text"
                    data-testid="gcv-pkg-input"
                    dir="auto"
                    value={purchasePackageNo}
                    onChange={(e) => setPurchasePackageNo(e.target.value)}
                    placeholder={isFa ? 'شماره بسته خرید...' : 'Package No...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {/* Purchase By Radio Cards (Rule 1-8) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--text-primary)]">
                  {isFa ? 'خرید توسط (انتخاب یک گزینه الزامی است) *' : 'Purchased By (Required) *'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {GCV_PURCHASE_BY_OPTIONS.map((opt) => {
                    const selected = purchaseBy === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`gcv-purchaseby-${opt.value}`}
                        onClick={() => setPurchaseBy(opt.value)}
                        className={`h-11 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2.5 transition-all ${
                          selected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] shadow-xs'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                              : 'border-[var(--text-muted)]'
                          }`}
                        >
                          {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span>{isFa ? opt.labelFa : opt.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Compact Auto-Filled Header Strip + Optional Override Drawer */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px]">
                    <span>
                      <strong className="text-[var(--text-muted)]">{isFa ? 'پروژه:' : 'Project:'} </strong>
                      <span className="font-bold text-[var(--text-primary)]">
                        {autoFilledHeader.headerProjectTitle}
                      </span>
                    </span>
                    <span>
                      <strong className="text-[var(--text-muted)]">{isFa ? 'تامین کننده:' : 'Supplier:'} </strong>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {effectiveSupplier || '-'}
                      </span>
                    </span>
                    <span>
                      <strong className="text-[var(--text-muted)]">Realised Note No.: </strong>
                      <span dir="ltr" className="font-mono font-semibold text-[var(--text-primary)]">
                        {effectiveReleaseNote || '-'}
                      </span>
                    </span>
                    <span>
                      <strong className="text-[var(--text-muted)]">{isFa ? 'جزیره/سیستم:' : 'Island/System:'} </strong>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {effectiveIslandSystem || '-'}
                      </span>
                    </span>
                    <span>
                      <strong className="text-[var(--text-muted)]">{isFa ? 'شماره بارنامه:' : 'Waybill:'} </strong>
                      <span dir="ltr" className="font-mono font-semibold text-[var(--text-primary)]">
                        {effectiveWaybill || '-'}
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedHeader((v) => !v)}
                    className="text-[11px] font-semibold text-[var(--accent-primary)] inline-flex items-center gap-1 hover:underline shrink-0"
                  >
                    <span>{isFa ? 'اصلاح اختیاری سربرگ' : 'Optional Overrides'}</span>
                    {showAdvancedHeader ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {showAdvancedHeader && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                    <div>
                      <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                        {isFa ? 'تامین کننده' : 'Supplier'}
                      </label>
                      <input
                        type="text"
                        value={supplierOverride}
                        onChange={(e) => setSupplierOverride(e.target.value)}
                        placeholder={autoFilledHeader.supplier || '-'}
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                        Realised Note No.
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={releaseNoteOverride}
                        onChange={(e) => setReleaseNoteOverride(e.target.value)}
                        placeholder={autoFilledHeader.releaseNoteNo || '-'}
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                        {isFa ? 'جزیره/سیستم' : 'Island/System'}
                      </label>
                      <input
                        type="text"
                        value={islandSystemOverride}
                        onChange={(e) => setIslandSystemOverride(e.target.value)}
                        placeholder={autoFilledHeader.islandSystem || '-'}
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[var(--text-muted)] mb-1">
                        {isFa ? 'شماره بارنامه' : 'Waybill No.'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={waybillOverride}
                        onChange={(e) => setWaybillOverride(e.target.value)}
                        placeholder={autoFilledHeader.waybillNo || '-'}
                        className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Items Review + Per-Row Optional Remark */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold text-[var(--text-primary)]">
                    {isFa
                      ? `اقلام انتخاب‌شده برای درج در رسید مصرف (${selectedList.length} قلم)`
                      : `Selected Items (${selectedList.length})`}
                  </h3>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {isFa
                      ? 'توضیحات دلخواه هر ردیف زیر «توضیحات تجهیز» در ستون Remark فرم چاپ می‌شود.'
                      : 'Optional per-row remarks stack underneath Equipment Notes in the form Remark column.'}
                  </span>
                </div>

                <StickyTableWrapper maxHeightClass="max-h-[360px]">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-center w-10">#</th>
                        <th className="p-2 text-start">PL/Package No.</th>
                        <th className="p-2 text-start">Package Item</th>
                        <th className="p-2 text-start">{isFa ? 'شرح (Description)' : 'Description'}</th>
                        <th className="p-2 text-start">{isFa ? 'اندازه (Size)' : 'Size'}</th>
                        <th className="p-2 text-start">Tag No.</th>
                        <th className="p-2 text-center">UOM</th>
                        <th className="p-2 text-center">{isFa ? 'مقدار واقعی (فرم)' : 'Qty (Form)'}</th>
                        <th className="p-2 text-center">{isFa ? 'مقدار پکینگ (ثبت جزئیات)' : 'Packing (Sync)'}</th>
                        <th className="p-2 text-start min-w-[200px]">
                          {isFa ? 'توضیحات ردیف (اختیاری)' : 'Row Remark (Optional)'}
                        </th>
                        <th className="p-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {selectedList.map((item, idx) => {
                        const { formQty, syncDeliveredQty } = resolveGcvQuantities(item);
                        return (
                          <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                            <td className="p-2 text-center tabular-nums font-semibold">{idx + 1}</td>
                            <td className="p-2 font-mono tabular-nums" dir="ltr">
                              {formatGcvPlPackageNo(item.shipmentNo, item.packageNo) || '-'}
                            </td>
                            <td className="p-2 font-mono tabular-nums" dir="ltr">
                              {item.itemNo || '-'}
                            </td>
                            <td className="p-2 max-w-[220px]">
                              <div className="line-clamp-2 bidi-plaintext">
                                {item.description || item.generalDescription}
                              </div>
                            </td>
                            <td className="p-2 bidi-plaintext">{item.size || '-'}</td>
                            <td className="p-2 font-mono tabular-nums" dir="ltr">
                              {item.itemCode || '-'}
                            </td>
                            <td className="p-2 text-center">{item.countingUnit || '-'}</td>
                            <td className="p-2 text-center font-extrabold tabular-nums text-[var(--accent-primary)]">
                              {formQty}
                            </td>
                            <td className="p-2 text-center font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {syncDeliveredQty}
                            </td>
                            <td className="p-2 space-y-1">
                              {item.notes?.trim() && (
                                <div className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-canvas)] px-2 py-0.5 rounded border border-[var(--border-subtle)] line-clamp-1">
                                  {isFa ? `توضیحات تجهیز: ${item.notes}` : `Equip. Note: ${item.notes}`}
                                </div>
                              )}
                              <input
                                type="text"
                                data-testid={`gcv-row-remark-${item.id}`}
                                value={userRemarkMap[item.id] || ''}
                                onChange={(e) =>
                                  setUserRemarkMap((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder={isFa ? 'توضیحات...' : 'Remark...'}
                                className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRow(item)}
                                title={isFa ? 'حذف از فهرست' : 'Remove'}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </StickyTableWrapper>
              </div>

              {/* Submit Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold"
                >
                  {isFa ? 'شروع مجدد' : 'Reset'}
                </button>
                <button
                  type="submit"
                  data-testid="gcv-submit-btn"
                  disabled={submitting}
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isFa
                        ? 'در حال صدور...'
                        : 'Issuing...'
                      : editingDoc
                        ? isFa
                          ? 'ذخیره ویرایش و پیش‌نمایش چاپ'
                          : 'Save Changes & Print Preview'
                        : isFa
                          ? 'صدور رسید مصرف مستقیم و پیش‌نمایش چاپ'
                          : 'Issue Direct Consumption Voucher & Preview'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* HISTORY VIEW */}
      {viewMode === 'history' && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <SearchInputWithClear
                value={historySearch}
                onChange={setHistorySearch}
                placeholder={
                  isFa
                    ? 'جستجو در شماره رسید، درخواست خرید، تامین‌کننده، پکینگ...'
                    : 'Search GCV No., PR, supplier, packing...'
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintReportOpen(true)}
                disabled={filteredDocuments.length === 0}
                className="h-9 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] disabled:opacity-45 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>{isFa ? 'چاپ فهرست سوابق' : 'Print History List'}</span>
              </button>
            </div>
          </div>

          <StickyTableWrapper maxHeightClass="max-h-[62vh]">
            <table className="w-full text-xs border-collapse" data-testid="gcv-history-table">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 text-center w-10">#</th>
                  <th className="p-2.5 text-start">{isFa ? 'شماره رسید مصرف' : 'GCV No.'}</th>
                  <th className="p-2.5 text-center">{isFa ? 'تاریخ' : 'Date'}</th>
                  <th className="p-2.5 text-start">{isFa ? 'درخواست خرید' : 'Purchase Req.'}</th>
                  <th className="p-2.5 text-start">{isFa ? 'تامین کننده' : 'Supplier'}</th>
                  <th className="p-2.5 text-start">{isFa ? 'کارشناس خرید' : 'Buyer'}</th>
                  <th className="p-2.5 text-start">{isFa ? 'خرید توسط' : 'Purchased By'}</th>
                  <th className="p-2.5 text-center">{isFa ? 'تعداد اقلام' : 'Items'}</th>
                  <th className="p-2.5 text-center">{isFa ? 'اسکن امضاشده' : 'Signed Scan'}</th>
                  <th className="p-2.5 text-center">{isFa ? 'عملیات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {loading && documentsList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-[var(--text-muted)]">
                      {isFa ? 'در حال بارگذاری...' : 'Loading...'}
                    </td>
                  </tr>
                ) : docsPagination.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-[var(--text-muted)]">
                      {isFa
                        ? 'هیچ رسید مصرف مستقیمی ثبت نشده است.'
                        : 'No Direct Consumption Vouchers recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  docsPagination.pageItems.map((doc, idx) => (
                    <tr
                      key={doc.id}
                      data-testid={`gcv-history-row-${doc.receiptNo}`}
                      onClick={() => setScanTarget(doc)}
                      title={
                        isFa
                          ? 'برای مشاهده یا بارگذاری اسکن امضاشده این فرم کلیک کنید'
                          : 'Click to view or upload signed scan'
                      }
                      className="hover:bg-[var(--bg-subtle)]/50 cursor-pointer transition-colors"
                    >
                      <td className="p-2.5 text-center tabular-nums text-[var(--text-muted)]">
                        {(docsPagination.page - 1) * docsPagination.pageSize + idx + 1}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-[var(--accent-primary)] tabular-nums" dir="ltr">
                        {doc.receiptNo}
                      </td>
                      <td className="p-2.5 text-center tabular-nums" dir="ltr">
                        {formatDate(doc.date)}
                      </td>
                      <td className="p-2.5 tabular-nums">{doc.purchaseRequestNo || '-'}</td>
                      <td className="p-2.5 bidi-plaintext">{doc.supplier || '-'}</td>
                      <td className="p-2.5 bidi-plaintext">{doc.buyerName || '-'}</td>
                      <td className="p-2.5">{purchaseByDisplay(doc.purchaseBy)}</td>
                      <td className="p-2.5 text-center font-bold tabular-nums">{doc.items.length}</td>
                      <td className="p-2.5 text-center">
                        <SignedScanRowButton
                          signedScan={doc.signedScan}
                          recordLabel={doc.receiptNo}
                          onClick={() => setScanTarget(doc)}
                        />
                      </td>
                      <td
                        className="p-2.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`gcv-print-btn-${doc.receiptNo}`}
                            onClick={() => {
                              setPrintDocWasUndone(false);
                              setPrintDoc(doc);
                            }}
                            title={isFa ? 'پیش‌نمایش و چاپ فرم رسمی' : 'Print Official Form'}
                            className="p-1.5 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                data-testid={`gcv-edit-btn-${doc.receiptNo}`}
                                onClick={() => startEdit(doc)}
                                title={isFa ? 'ویرایش' : 'Edit'}
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                data-testid={`gcv-delete-btn-${doc.receiptNo}`}
                                onClick={() => setDeleteTarget(doc)}
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
                  ))
                )}
              </tbody>
            </table>
          </StickyTableWrapper>

          <TablePaginationBar
            page={docsPagination.page}
            totalPages={docsPagination.totalPages}
            total={docsPagination.total}
            pageSize={docsPagination.pageSize}
            onPageChange={docsPagination.setPage}
            onPageSizeChange={docsPagination.setPageSize}
            lang={prefs.language}
          />
        </div>
      )}

      {/* Printable Official MD1EX-FQP02/11-03 Preview Modal with Post-Print Undo & Redo */}
      {printDoc && (
        <div
          data-testid="gcv-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
        >
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Printer className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  {isFa
                    ? `پیش‌نمایش چاپ رسید مصرف مستقیم کالا — ${printDoc.receiptNo} (${formCode})`
                    : `GCV Print Preview — ${printDoc.receiptNo} (${formCode})`}
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
                      data-testid="gcv-preview-undo-btn"
                      disabled={!historyStatus.canUndo || historyBusy}
                      onClick={() => void performUndo()}
                      title={
                        isFa
                          ? 'واگرد (لغو صدور رسید مصرف و بازگردانی وضعیت جدول جزئیات)'
                          : 'Undo (revert GCV & Detailed table)'
                      }
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد' : 'Undo'}</span>
                    </button>
                    <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
                    <button
                      type="button"
                      data-testid="gcv-preview-redo-btn"
                      disabled={!historyStatus.canRedo || historyBusy}
                      onClick={() => void performRedo()}
                      title={isFa ? 'انجام مجدد (اعمال مجدد رسید مصرف)' : 'Redo (reapply GCV)'}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="gcv-preview-print-btn"
                  disabled={printDocWasUndone}
                  onClick={() => triggerAppPrint()}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ متریال / رسید (A4 افقی)' : 'Print Voucher (A4 Landscape)'}</span>
                </button>

                <button
                  type="button"
                  data-testid="gcv-preview-close-btn"
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
                data-testid="gcv-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {isFa
                  ? 'صدور این رسید مصرف با دکمه واگرد (Undo) لغو و جدول جزئیات به حالت قبل بازگردانده شد. برای بازگرداندن آن، روی «انجام مجدد (Redo)» کلیک کنید.'
                  : 'This GCV was undone and Detailed Equipment was restored. Click Redo to reapply it.'}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900">
              <div className="max-w-[1120px] mx-auto bg-white p-5 rounded-xl shadow-md">
                <OfficialGcvSheet
                  doc={printDoc}
                  detailedItems={data?.detailedItems || []}
                  generalEntries={data?.generalEntries || []}
                  formatDate={formatDate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signed Form Scan Modal */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="gcv"
          recordId={scanTarget.id}
          recordLabel={scanTarget.receiptNo}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={() => {
            void loadData();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف رسید مصرف مستقیم کالا' : 'Delete Direct Consumption Voucher'}
        message={
          isFa
            ? `آیا از حذف رسید مصرف شماره «${deleteTarget?.receiptNo || ''}» اطمینان دارید؟ شماره رسید مصرف و تعداد رسید مصرف از جدول جزئیات تجهیزات پاک خواهد شد.`
            : `Are you sure you want to delete GCV "${deleteTarget?.receiptNo || ''}"? Its receipt number and delivered quantity will be reverted in Detailed Equipment.`
        }
        confirmLabel={isFa ? 'بله، حذف شود' : 'Delete'}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* History List Print Report */}
      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={isFa ? 'گزارش سوابق رسید مصرف مستقیم کالا (GCV)' : 'Direct Consumption Vouchers History'}
        rows={filteredDocuments}
        columns={historyColumns}
      />
    </div>
  );
};
