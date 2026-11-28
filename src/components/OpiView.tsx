import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Pencil,
  Printer,
  Redo2,
  RotateCcw,
  Settings2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { triggerAppPrint } from '../lib/print.ts';
import { extractPlantDocConfig } from '../shared/docNumbering.ts';
import { resolveBuiltInFormDesign } from '../shared/employers.ts';
import { getTodayIso } from '../shared/jalali.ts';
import {
  buildOpiInvitationHeaderAutoFill,
  buildOpiInvitationLineItems,
  filterEligibleGeneralForOpi,
  formatHeaderProjectTitle,
  generateOpiInvitationNo,
  MD1_OPI_INVITATION_FORM_CODE,
  OPI_FIXED_LOCATIONS,
  stripProjectWord,
} from '../shared/opiInvitation.ts';
import { computeAutoColumnWidths, type AutoColumnDescriptor } from '../shared/printAutoLayout.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import type {
  DetailedComputed,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import {
  BuiltInSheetHeaderRow,
  OfficialExtraMetaStrip,
  OfficialFormSignatures,
} from './OfficialSheetHeader.tsx';
import {
  OperationalViewModeTabs,
  type OperationalViewMode,
} from './OperationalViewModeTabs.tsx';
import { OpiGeneralPicker } from './OpiGeneralPicker.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

const OPI_TABLE_COLUMNS: AutoColumnDescriptor[] = [
  { key: 'itemNo', header: 'Item No.', kind: 'compact', minPercent: 6, maxPercent: 9 },
  { key: 'packingListNo', header: 'Packing List No.', kind: 'code', minPercent: 13, maxPercent: 20 },
  { key: 'packageNo', header: 'Package No.', kind: 'code', minPercent: 10, maxPercent: 16 },
  { key: 'description', header: 'شرح کالا', kind: 'fluid', minPercent: 24, maxPercent: 40 },
  { key: 'uom', header: 'واحد (UOM)', kind: 'compact', minPercent: 9, maxPercent: 15 },
  { key: 'remarks', header: 'توضیحات', kind: 'fluid', minPercent: 14, maxPercent: 30 },
];

interface OfficialOpiSheetProps {
  record: OpiInvitationRecord;
  generalEntries: GeneralEntry[];
  formatDate: (iso: string) => string;
}

const OfficialOpiInvitationSheet: React.FC<OfficialOpiSheetProps> = ({
  record,
  generalEntries,
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'opi');
  const formCode = design.docCode || MD1_OPI_INVITATION_FORM_CODE;
  const rawProjectName = record.projectName?.trim() || activeProject?.name || '';
  const headerProjectTitle = formatHeaderProjectTitle(rawProjectName);
  const bareProjectName = stripProjectWord(rawProjectName);
  // Rule 1-3: strictly contractRef (stored in record.contractNo); blank when absent
  const contractDisplay = (record.contractNo ?? activeProject?.contractRef ?? '').trim();

  const resolvedItems = useMemo<OpiInvitationLineItem[]>(() => {
    if (record.items && record.items.length > 0) {
      return record.items.map((it, idx) => ({
        ...it,
        itemNo: (it.itemNo || '').trim() || String(idx + 1),
      }));
    }
    const matchedGeneral = record.generalIds?.length
      ? generalEntries.filter((g) => record.generalIds!.includes(g.id))
      : generalEntries.filter((g) => (record.packingNos || []).includes((g.packingListNo || '').trim()));
    if (matchedGeneral.length > 0) {
      return buildOpiInvitationLineItems(matchedGeneral);
    }
    return (record.packingNos || []).map((pk, idx) => ({
      itemNo: String(idx + 1),
      packingListNo: pk,
      packageNo: '',
      description: '',
      uom: '',
      remarks: '',
    }));
  }, [record, generalEntries]);

  const colLayout = useMemo(() => {
    const matrix = resolvedItems.map((it) => [
      it.itemNo,
      it.packingListNo,
      it.packageNo,
      it.description,
      it.uom,
      it.remarks,
    ]);
    return computeAutoColumnWidths(OPI_TABLE_COLUMNS, matrix, { baseFontPx: 9.5, minFontPx: 8 });
  }, [resolvedItems]);

  const minRows = 11;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: (OpiInvitationLineItem | null)[] = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
  ];

  return (
    <div
      dir="rtl"
      data-testid="official-opi-sheet"
      className={design.orientation === 'landscape' ? 'samaan-a4-landscape' : 'samaan-a4-portrait'}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Main Upper Frame */}
      <div style={{ border: `1.8px solid ${design.accentColor}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={design}
          projectTitle={headerProjectTitle}
          leftMetaSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                fontSize: '9.6px',
                fontWeight: 700,
                textAlign: 'right',
                gap: '16px',
                height: '100%',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>شماره دعوتنامه:</span>
                <span
                  dir="ltr"
                  data-testid="opi-sheet-doc-no"
                  className="tabular-nums"
                  style={{ textAlign: 'left', fontWeight: 800 }}
                >
                  {record.invitationNo}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>تاریخ:</span>
                <span
                  dir="ltr"
                  data-testid="opi-sheet-issue-date"
                  className="tabular-nums"
                  style={{ textAlign: 'left', fontWeight: 700 }}
                >
                  {formatDate(record.issueDate || record.date)}
                </span>
              </div>
            </div>
          }
        />
        <OfficialExtraMetaStrip design={design} inset borderColor={design.accentColor} />

        {/* Metadata Strip Row 1 (Rules 1-5..1-10) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1.25fr',
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span data-testid="opi-sheet-project-bare" className="bidi-plaintext">
              {bareProjectName}
            </span>
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
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{record.supplier || ''}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (Rules 1-3 & 1-11) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1.8fr',
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره قرارداد : </strong>
            <span dir="ltr" data-testid="opi-sheet-contract" className="tabular-nums">
              {contractDisplay}
            </span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" data-testid="opi-sheet-purchase-pkg" className="tabular-nums">
              {record.purchasePackageNo || ''}
            </span>
          </div>
        </div>

        {/* Formal Request Text */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '7px 10px',
            fontSize: '10.2px',
            fontWeight: 600,
            lineHeight: 1.85,
            textAlign: 'right',
          }}
        >
          بدینوسیله از نمایندگان محترم کارفرما، مشاور، تامین کننده و پیمانکار نصاب صمیمانه تقاضا می‌شود در بازگشایی (OPI) اقلام مشروحه ذیل در مکان و زمان قید شده همکاری نمایند.
        </div>

        {/* 6-Column Items Table (Rules 1-12..1-17) */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: `${colLayout.recommendedFontPx}px`,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            {colLayout.widthsPercent.map((w, idx) => (
              <col key={OPI_TABLE_COLUMNS[idx].key} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textAlign: 'center',
                }}
              >
                Item
                <br />
                No.
              </th>
              <th
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 5px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textAlign: 'center',
                }}
              >
                Packing List
                <br />
                No.
              </th>
              <th
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 5px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textAlign: 'center',
                }}
              >
                Package
                <br />
                No.
              </th>
              <th
                dir="rtl"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                  textAlign: 'center',
                }}
              >
                شرح کالا
              </th>
              <th
                dir="rtl"
                style={{
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  textAlign: 'center',
                }}
              >
                واحد
                <br />
                <span dir="ltr">(UOM)</span>
              </th>
              <th
                dir="rtl"
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
                  className="tabular-nums"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 4px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    wordBreak: 'break-word',
                  }}
                >
                  {row ? (row.itemNo?.trim() || String(idx + 1)) : '\u00A0'}
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 5px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.packingListNo || ''}
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 5px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.packageNo || ''}
                </td>
                <td
                  dir="auto"
                  className="bidi-plaintext"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 6px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.description || ''}
                </td>
                <td
                  dir="auto"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '4px 4px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.uom || ''}
                </td>
                <td
                  dir="auto"
                  className="bidi-plaintext"
                  style={{
                    borderBottom: '1px solid #000000',
                    padding: '4px 6px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.remarks || ''}
                </td>
              </tr>
            ))}
            {/* Schedule Header & Value Rows inside same 6-col LTR table so dividers align strictly with Package No.|شرح کالا and شرح کالا|واحد (UOM) */}
            <tr style={{ backgroundColor: '#e5e7eb', fontSize: '10.5px', fontWeight: 700 }}>
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
                مکان
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
                زمان
              </td>
            </tr>
            <tr style={{ fontSize: '10.5px', fontWeight: 600 }}>
              <td
                colSpan={3}
                dir="rtl"
                data-testid="opi-sheet-location"
                className="bidi-plaintext"
                style={{
                  borderRight: '1px solid #000000',
                  padding: '14px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {record.location || ''}
              </td>
              <td
                colSpan={1}
                dir="ltr"
                data-testid="opi-sheet-date"
                className="tabular-nums"
                style={{
                  borderRight: '1px solid #000000',
                  padding: '14px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {formatDate(record.date)}
              </td>
              <td
                colSpan={2}
                dir="ltr"
                data-testid="opi-sheet-time"
                className="tabular-nums"
                style={{
                  padding: '14px 6px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {record.time || ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Separate Lower Approval Frame */}
      <div className="samaan-keep-together" style={{ border: '1.8px solid #000000', marginTop: '14px' }}>
        <div
          style={{
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            padding: '5px 8px',
            fontSize: '10.5px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          تایید کنندگان:
        </div>

        {design.template?.signatures?.length || !design.showSignatures ? (
          <OfficialFormSignatures
            signatures={design.signatures}
            showSignatures={design.showSignatures}
            borderColor={design.accentColor}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              minHeight: '84px',
              fontSize: '9.5px',
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
                <div style={{ fontWeight: 700 }}>پیمانکار(نصاب):</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
              </div>
              <div style={{ fontSize: '9px' }}>{record.installerContractor || ''}</div>
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
                <div style={{ fontWeight: 700 }}>تامین کننده:</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
              </div>
              <div style={{ fontSize: '9px' }}>{record.supplierRep || ''}</div>
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
                <div style={{ fontWeight: 700 }}>{activeEmployer.equipmentSupplyLabel}:</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
              </div>
              <div style={{ fontSize: '9px' }}>{record.equipmentSupply || ''}</div>
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
              <div style={{ fontSize: '9px' }}>{record.employerRep || ''}</div>
            </div>
          </div>
        )}

        <div
          dir="rtl"
          data-testid="opi-sheet-qa-notice"
          style={{
            borderTop: '1px solid #000000',
            padding: '4px 8px',
            fontSize: '8.3px',
            fontWeight: 600,
            textAlign: 'right',
          }}
        >
          توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA میباشد.
        </div>

        <div
          style={{
            borderTop: '1px solid #000000',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '8.8px',
            fontWeight: 700,
          }}
        >
          <div>
            {design.template?.footerCopyText ||
              'رونوشت : معاونت تأمین تجهیزات ؛ کارفرما، مشاور، تامین کننده'}
          </div>
          {(formCode || design.revisionText) && (
            <div dir="ltr" className="tabular-nums">
              {[formCode, design.revisionText].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface OpiApiResponse {
  invitations: OpiInvitationRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  packings: string[];
}

interface OpiViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const OpiView: React.FC<OpiViewProps> = ({ refreshSignal, onDataChanged }) => {
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

  const [invViewMode, setInvViewMode] = useState<OperationalViewMode>(() =>
    canEdit ? 'create' : 'history',
  );
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<OpiApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerRefresh, setPickerRefresh] = useState(0);

  // Step 1 Selection + Selection Undo/Redo stacks
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneralEntry>>({});
  const [selUndoStack, setSelUndoStack] = useState<Array<Record<string, GeneralEntry>>>([]);
  const [selRedoStack, setSelRedoStack] = useState<Array<Record<string, GeneralEntry>>>([]);

  // Step 2 Form State (Schedule + Per-Row Remarks + Collapsible Optional Overrides)
  const [invitationNo, setInvitationNo] = useState('');
  const [docNoTouched, setDocNoTouched] = useState(false);
  const [issueDate, setIssueDate] = useState(getTodayIso());
  const [date, setDate] = useState(getTodayIso());
  const [time, setTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [installerContractor, setInstallerContractor] = useState('');
  const [supplierRep, setSupplierRep] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [employerRep, setEmployerRep] = useState('');
  const [notes, setNotes] = useState('');
  const [showHeaderOverrides, setShowHeaderOverrides] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // History Search, Print Invitation Preview, Post-Print Undo Sync, Edit/Delete & Report Modals
  const [historySearch, setHistorySearch] = useState('');
  const [editingInvitation, setEditingInvitation] = useState<OpiInvitationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OpiInvitationRecord | null>(null);
  const [printInvitation, setPrintInvitation] = useState<OpiInvitationRecord | null>(null);
  const [printInvWasUndone, setPrintInvWasUndone] = useState(false);
  const [printInvTableOpen, setPrintInvTableOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<OpiInvitationRecord | null>(null);

  const printInvIdRef = useRef<string | null>(null);
  useEffect(() => {
    printInvIdRef.current = printInvitation?.id || null;
  }, [printInvitation]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<OpiApiResponse>('/api/opi');
      setData(res);

      // Keep open Print Preview synchronized when global Undo/Redo runs
      const openId = printInvIdRef.current;
      if (openId) {
        const matched = (res.invitations || []).find((inv) => inv.id === openId);
        if (matched) {
          setPrintInvitation(matched);
          setPrintInvWasUndone(false);
        } else {
          setPrintInvWasUndone(true);
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

  const generalEntries = useMemo(() => data?.generalEntries || [], [data]);
  const invitationsList = useMemo(() => data?.invitations || [], [data]);

  // Eligible General Equipment rows: ONLY rows without opiInvitationNo (plus currently edited rows)
  const eligibleGeneralRows = useMemo(
    () => filterEligibleGeneralForOpi(generalEntries, editingInvitation?.invitationNo),
    [generalEntries, editingInvitation?.invitationNo],
  );

  const selectedRows = useMemo(() => Object.values(selectedMap), [selectedMap]);

  // Auto-fill header fields & official MD1 document number (<PLANT>-<SUPPLIER>-####)
  const autoHeader = useMemo(
    () => buildOpiInvitationHeaderAutoFill(selectedRows, activeProject),
    [selectedRows, activeProject],
  );

  const existingInvitationNos = useMemo(
    () =>
      invitationsList
        .filter((inv) => !editingInvitation || inv.id !== editingInvitation.id)
        .map((inv) => inv.invitationNo),
    [invitationsList, editingInvitation],
  );

  const supplierForCode = supplier.trim() || autoHeader.supplierForDocNo;
  const suggestedInvitationNo = useMemo(
    () =>
      generateOpiInvitationNo(
        supplierForCode,
        existingInvitationNos,
        extractPlantDocConfig(activeProject),
      ),
    [supplierForCode, existingInvitationNos, activeProject],
  );

  useEffect(() => {
    if (!editingInvitation && !docNoTouched && step === 2) {
      setInvitationNo(suggestedInvitationNo);
    }
  }, [editingInvitation, docNoTouched, step, suggestedInvitationNo]);

  // Selection Undo / Redo helpers
  const commitSelection = useCallback((next: Record<string, GeneralEntry>) => {
    setSelectedMap((prev) => {
      setSelUndoStack((u) => [...u.slice(-24), prev]);
      setSelRedoStack([]);
      return next;
    });
  }, []);

  const handleToggleRow = useCallback(
    (row: GeneralEntry) => {
      const next = { ...selectedMap };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      commitSelection(next);
    },
    [selectedMap, commitSelection],
  );

  const handleToggleBatch = useCallback(
    (batch: GeneralEntry[], allSelected: boolean) => {
      const next = { ...selectedMap };
      if (allSelected) {
        for (const r of batch) delete next[r.id];
      } else {
        for (const r of batch) next[r.id] = r;
      }
      commitSelection(next);
    },
    [selectedMap, commitSelection],
  );

  const handleSelectionUndo = () => {
    if (selUndoStack.length === 0) return;
    const prev = selUndoStack[selUndoStack.length - 1];
    setSelUndoStack((u) => u.slice(0, -1));
    setSelRedoStack((r) => [...r.slice(-24), selectedMap]);
    setSelectedMap(prev);
  };

  const handleSelectionRedo = () => {
    if (selRedoStack.length === 0) return;
    const next = selRedoStack[selRedoStack.length - 1];
    setSelRedoStack((r) => r.slice(0, -1));
    setSelUndoStack((u) => [...u.slice(-24), selectedMap]);
    setSelectedMap(next);
  };

  const handleSelectionClear = () => {
    if (Object.keys(selectedMap).length === 0) return;
    commitSelection({});
  };

  const handleProceedToStep2 = () => {
    if (selectedRows.length === 0) {
      notify(
        'warning',
        isFa ? 'ابتدا حداقل یک ردیف از تجهیزات کلی انتخاب کنید.' : 'Select at least one General Equipment row first.',
      );
      return;
    }
    const filled = buildOpiInvitationHeaderAutoFill(selectedRows, activeProject);
    if (!editingInvitation) {
      setSystem(filled.system);
      setIsland(filled.island);
      setUnit(filled.unit);
      setSupplier(filled.supplier);
      setPurchasePackageNo(filled.purchasePackageNo);
      setContractNo(filled.contractNo);
      setIssueDate(getTodayIso());
      if (!docNoTouched) {
        setInvitationNo(
          generateOpiInvitationNo(
            filled.supplierForDocNo,
            existingInvitationNos,
            extractPlantDocConfig(activeProject),
          ),
        );
      }
    }
    setStep(2);
  };

  const resetInvitationForm = () => {
    setEditingInvitation(null);
    setStep(1);
    setSelectedMap({});
    setSelUndoStack([]);
    setSelRedoStack([]);
    setInvitationNo('');
    setDocNoTouched(false);
    setIssueDate(getTodayIso());
    setDate(getTodayIso());
    setTime('09:00');
    setLocation('');
    setSystem('');
    setIsland('');
    setUnit('');
    setSupplier('');
    setContractNo('');
    setPurchasePackageNo('');
    setRemarksMap({});
    setInstallerContractor('');
    setSupplierRep('');
    setEquipmentSupply('');
    setEmployerRep('');
    setNotes('');
    setShowHeaderOverrides(false);
  };

  const startEditInvitation = (inv: OpiInvitationRecord) => {
    setInvViewMode('create');
    setEditingInvitation(inv);
    setInvitationNo(inv.invitationNo || '');
    setDocNoTouched(true);
    setIssueDate(inv.issueDate || getTodayIso());
    setDate(inv.date || getTodayIso());
    setTime(inv.time || '09:00');
    setLocation(inv.location || '');
    setSystem(inv.system || '');
    setIsland(inv.island || '');
    setUnit(inv.unit || '');
    setSupplier(inv.supplier || '');
    setContractNo(inv.contractNo ?? activeProject?.contractRef ?? '');
    setPurchasePackageNo(inv.purchasePackageNo || '');
    setInstallerContractor(inv.installerContractor || '');
    setSupplierRep(inv.supplierRep || '');
    setEquipmentSupply(inv.equipmentSupply || '');
    setEmployerRep(inv.employerRep || '');
    setNotes(inv.notes || '');

    // Reconstruct linked General Equipment selection & remarks
    const matchedRows = inv.generalIds?.length
      ? generalEntries.filter((g) => inv.generalIds!.includes(g.id))
      : generalEntries.filter(
          (g) =>
            (g.opiInvitationNo || '').trim().toUpperCase() === (inv.invitationNo || '').trim().toUpperCase() ||
            (inv.packingNos || []).includes((g.packingListNo || '').trim()),
        );

    const nextSelected: Record<string, GeneralEntry> = {};
    const nextRemarks: Record<string, string> = {};
    matchedRows.forEach((g, idx) => {
      nextSelected[g.id] = g;
      const savedLine =
        inv.items?.find(
          (it) =>
            (it.packingListNo || '').trim() === (g.packingListNo || '').trim() &&
            (it.packageNo || '').trim() === (g.packageNo || '').trim(),
        ) || inv.items?.[idx];
      if (savedLine?.remarks) nextRemarks[g.id] = savedLine.remarks;
    });

    setSelectedMap(nextSelected);
    setSelUndoStack([]);
    setSelRedoStack([]);
    setRemarksMap(nextRemarks);
    setStep(matchedRows.length > 0 ? 2 : 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRows.length === 0) {
      notify(
        'warning',
        isFa ? 'حداقل یک ردیف از تجهیزات کلی انتخاب کنید.' : 'Select at least one General Equipment row.',
      );
      return;
    }
    if (!date.trim()) {
      notify('warning', isFa ? 'تاریخ OPI الزامی است.' : 'OPI date is required.');
      return;
    }
    if (!time.trim()) {
      notify('warning', isFa ? 'زمان OPI الزامی است.' : 'OPI time is required.');
      return;
    }
    if (!location.trim()) {
      notify('warning', isFa ? 'مکان OPI الزامی است.' : 'OPI location is required.');
      return;
    }

    const finalDocNo = invitationNo.trim() || suggestedInvitationNo;
    const derivedPackings = Array.from(
      new Set(selectedRows.map((r) => (r.packingListNo || '').trim()).filter(Boolean)),
    );
    const generalIds = selectedRows.map((r) => r.id);
    const lineItems = buildOpiInvitationLineItems(selectedRows, remarksMap);

    const payload = {
      invitationNo: finalDocNo,
      issueDate: issueDate || getTodayIso(),
      date,
      time: time.trim(),
      packingNos: derivedPackings,
      generalIds,
      location: location.trim(),
      projectName: activeProject?.name || '',
      system: system.trim(),
      island: island.trim(),
      unit: unit.trim(),
      supplier: supplier.trim(),
      contractNo: contractNo.trim(),
      purchasePackageNo: purchasePackageNo.trim(),
      items: lineItems,
      installerContractor: installerContractor.trim(),
      supplierRep: supplierRep.trim(),
      equipmentSupply: equipmentSupply.trim(),
      employerRep: employerRep.trim(),
      notes: notes.trim(),
    };

    setSubmitting(true);
    try {
      const res = editingInvitation
        ? await apiRequest<{ invitation: OpiInvitationRecord }>(`/api/opi/${editingInvitation.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ invitation: OpiInvitationRecord }>('/api/opi', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingInvitation
          ? isFa
            ? `دعوتنامه شماره ${res.invitation.invitationNo} ویرایش و در جدول ثبت کلی به‌روزرسانی شد.`
            : `OPI Invitation ${res.invitation.invitationNo} updated.`
          : isFa
            ? `دعوتنامه گشایش و بازرسی شماره ${res.invitation.invitationNo} صادر و در جدول ثبت کلی ثبت شد.`
            : `OPI Invitation ${res.invitation.invitationNo} issued and synced to General Equipment.`,
      );
      resetInvitationForm();
      setPrintInvWasUndone(false);
      setPrintInvitation(res.invitation);
      triggerAutoSnapshot(`${editingInvitation ? 'Edit ' : ''}OPI ${res.invitation.invitationNo}`);
      onDataChanged();
      setPickerRefresh((n) => n + 1);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteInvitation = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/opi/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `دعوتنامه شماره ${deleteTarget.invitationNo} حذف شد.`
          : `Invitation ${deleteTarget.invitationNo} deleted.`,
      );
      if (editingInvitation?.id === deleteTarget.id) resetInvitationForm();
      if (printInvitation?.id === deleteTarget.id) {
        setPrintInvitation(null);
        setPrintInvWasUndone(false);
      }
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete OPI ${deleteTarget.invitationNo}`);
      onDataChanged();
      setPickerRefresh((n) => n + 1);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Filtered history list
  const filteredInvitations = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return invitationsList;
    return invitationsList.filter((inv) =>
      [
        inv.invitationNo,
        inv.date,
        inv.issueDate,
        inv.time,
        inv.location,
        inv.supplier,
        inv.system,
        inv.island,
        inv.unit,
        inv.purchasePackageNo,
        ...(inv.packingNos || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [invitationsList, historySearch]);

  const invitationsPagination = useClientPagination(filteredInvitations, 25);

  const invReportColumns = useMemo<PrintColumnDef<OpiInvitationRecord>[]>(
    () => [
      { key: 'invitationNo', header: t.headers.opiInvitationNo, getValue: (r) => r.invitationNo },
      { key: 'date', header: t.headers.opiInvitationDate, isDate: true, getValue: (r) => r.date },
      { key: 'time', header: isFa ? 'زمان' : 'Time', getValue: (r) => r.time },
      { key: 'location', header: isFa ? 'مکان' : 'Location', getValue: (r) => r.location || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'packingNos', header: t.headers.packingListNo, getValue: (r) => r.packingNos.join(', ') },
      { key: 'createdBy', header: isFa ? 'صادرکننده' : 'Issued By', getValue: (r) => r.createdBy },
    ],
    [t, isFa],
  );

  // Isolated Print Portal (portrait A4, hides #root during print)
  const opiPrintPortal =
    printInvitation && !printInvTableOpen
      ? createPortal(
          <div id="samaan-opi-print-root" data-samaan-print-portal="true">
            <style>
              {buildIsolatedPrintPortalCss('samaan-opi-print-root', {
                orientation: 'portrait',
                isFa,
                extraPrintCss: `
                  #samaan-opi-print-root table {
                    width: 100% !important;
                  }
                  #samaan-opi-print-root tr {
                    height: auto !important;
                    break-inside: avoid;
                    page-break-inside: avoid;
                  }
                  #samaan-opi-print-root table th,
                  #samaan-opi-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                    height: auto !important;
                  }
                `,
              })}
            </style>
            <OfficialOpiInvitationSheet
              record={printInvitation}
              generalEntries={generalEntries}
              formatDate={formatDate}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-5">
      {opiPrintPortal}

      {/* Top Navigation: Unified Create/History Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <OperationalViewModeTabs
          viewMode={invViewMode}
          onChange={setInvViewMode}
          historyCount={invitationsList.length}
          isFa={isFa}
          canCreate={canEdit}
          isEditing={Boolean(editingInvitation)}
          testIdPrefix="opi-invitation"
        />
      </div>

      {/* Issue & Manage OPI Invitations (MD1EX-FQP02/02-03) */}
      <div className="space-y-5">
          {canEdit && invViewMode === 'create' && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
              {/* Stepper Header */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full text-xs font-bold inline-flex items-center justify-center ${
                        step === 1
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                          : 'bg-[var(--status-success)] text-white'
                      }`}
                    >
                      1
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className={`text-xs font-bold ${
                        step === 1 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {isFa ? 'فیلتر و انتخاب بسته‌های فاقد دعوتنامه' : 'Filter & Select Eligible Packages'}
                    </button>
                  </div>

                  <span className="text-[var(--text-muted)] text-xs">/</span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-full text-xs font-bold inline-flex items-center justify-center ${
                        step === 2
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      2
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        step === 2 ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {isFa ? 'تعیین زمان، تاریخ، مکان و توضیحات و صدور' : 'Schedule, Remarks & Issue'}
                    </span>
                  </div>

                  {editingInvitation && (
                    <span className="px-2 py-0.5 rounded-md bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-bold">
                      {isFa
                        ? `ویرایش دعوتنامه ${editingInvitation.invitationNo}`
                        : `Editing ${editingInvitation.invitationNo}`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)]">
                    {MD1_OPI_INVITATION_FORM_CODE}
                  </span>
                  {editingInvitation && (
                    <button
                      type="button"
                      onClick={resetInvitationForm}
                      className="h-8 px-3 rounded-lg border border-[var(--status-danger)]/40 bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-semibold"
                    >
                      {isFa ? 'انصراف از ویرایش' : 'Cancel Edit'}
                    </button>
                  )}
                </div>
              </div>

              {step === 1 ? (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Selection Controls Bar */}
                  <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/65 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid="opi-selected-count"
                        className="text-xs font-bold text-[var(--text-primary)] tabular-nums"
                      >
                        {isFa
                          ? `ردیف‌های انتخاب‌شده: ${selectedRows.length} ردیف (از ${eligibleGeneralRows.length} ردیف فاقد دعوتنامه)`
                          : `Selected: ${selectedRows.length} (of ${eligibleGeneralRows.length} eligible)`}
                      </span>

                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          data-testid="opi-sel-undo-btn"
                          disabled={selUndoStack.length === 0}
                          onClick={handleSelectionUndo}
                          title={isFa ? 'واگرد انتخاب' : 'Undo selection'}
                          className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                          <span>{isFa ? 'واگرد انتخاب' : 'Undo'}</span>
                        </button>
                        <button
                          type="button"
                          data-testid="opi-sel-redo-btn"
                          disabled={selRedoStack.length === 0}
                          onClick={handleSelectionRedo}
                          title={isFa ? 'انجام مجدد انتخاب' : 'Redo selection'}
                          className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 text-xs font-medium text-[var(--text-secondary)] inline-flex items-center gap-1"
                        >
                          <Redo2 className="w-3.5 h-3.5" />
                          <span>{isFa ? 'مجدد' : 'Redo'}</span>
                        </button>
                        {selectedRows.length > 0 && (
                          <button
                            type="button"
                            data-testid="opi-sel-clear-btn"
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
                      data-testid="opi-proceed-step2-btn"
                      disabled={selectedRows.length === 0}
                      onClick={handleProceedToStep2}
                      className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <span>
                        {isFa
                          ? `ادامه و تعیین زمان و مکان OPI (${selectedRows.length} ردیف)`
                          : `Continue to Schedule (${selectedRows.length})`}
                      </span>
                      {isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* General Equipment Picker (Eligible rows without opiInvitationNo, newest arrival first) */}
                  <OpiGeneralPicker
                    rows={eligibleGeneralRows}
                    loading={loading}
                    selectedMap={selectedMap}
                    onToggleRow={handleToggleRow}
                    onToggleBatch={handleToggleBatch}
                    refreshSignal={refreshSignal + pickerRefresh}
                    testIdPrefix="opi-picker"
                    defaultArrivalSortDir="desc"
                    hiddenColumns={['purchasePackageNo', 'island', 'packageType']}
                  />
                </div>
              ) : (
                <form onSubmit={handleIssueInvitation} className="p-4 sm:p-5 space-y-5">
                  {/* Back to Step 1 Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                    <button
                      type="button"
                      data-testid="opi-back-step1-btn"
                      onClick={() => setStep(1)}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5"
                    >
                      {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>{isFa ? 'بازگشت به انتخاب بسته‌ها' : 'Back to Package Selection'}</span>
                    </button>

                    <div className="text-[11.5px] text-[var(--text-muted)]">
                      {isFa ? 'پروژه:' : 'Project:'}{' '}
                      <strong className="text-[var(--text-primary)]">
                        {autoHeader.projectBareName || activeProject?.name || '—'}
                      </strong>
                      {contractNo ? (
                        <>
                          {' · '}
                          {isFa ? 'شماره قرارداد:' : 'Contract:'}{' '}
                          <strong dir="ltr" className="font-mono text-[var(--text-primary)]">
                            {contractNo}
                          </strong>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Compact Auto-Filled Header Summary + Optional Overrides Drawer */}
                  <div
                    data-testid="opi-auto-header-summary"
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-[var(--text-muted)]">
                            {isFa ? 'شماره دعوتنامه:' : 'Invitation No.:'}
                          </span>
                          <strong
                            dir="ltr"
                            data-testid="opi-doc-no-preview"
                            className="font-mono text-[var(--accent-primary)]"
                          >
                            {invitationNo.trim() || suggestedInvitationNo}
                          </strong>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-[var(--text-muted)]">
                            {isFa ? 'تاریخ صدور:' : 'Issue Date:'}
                          </span>
                          <strong className="tabular-nums text-[var(--text-primary)]">
                            {formatDate(issueDate)}
                          </strong>
                        </div>
                        {supplier && (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[var(--text-muted)]">
                              {isFa ? 'تامین‌کننده:' : 'Supplier:'}
                            </span>
                            <strong className="text-[var(--text-primary)] bidi-plaintext">
                              {supplier}
                            </strong>
                          </div>
                        )}
                        {purchasePackageNo && (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[var(--text-muted)]">
                              {isFa ? 'بسته خرید:' : 'Purchase Pkg:'}
                            </span>
                            <strong dir="ltr" className="font-mono text-[var(--text-primary)]">
                              {purchasePackageNo}
                            </strong>
                          </div>
                        )}
                        {(system || island || unit) && (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[var(--text-muted)]">
                              {isFa ? 'سیستم / جزیره / واحد:' : 'System / Island / Unit:'}
                            </span>
                            <strong className="text-[var(--text-primary)] bidi-plaintext">
                              {[system, island, unit].filter(Boolean).join(' / ')}
                            </strong>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        data-testid="opi-toggle-overrides-btn"
                        onClick={() => setShowHeaderOverrides((v) => !v)}
                        className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-1.5"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        <span>
                          {isFa ? 'تنظیمات اختیاری سربرگ و امضاء' : 'Optional Header & Signatories'}
                        </span>
                        {showHeaderOverrides ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {showHeaderOverrides && (
                      <div className="pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.opiInvitationNo}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={invitationNo}
                            onChange={(e) => {
                              setDocNoTouched(true);
                              setInvitationNo(e.target.value);
                            }}
                            placeholder={suggestedInvitationNo}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono tabular-nums"
                          />
                        </div>
                        <JalaliDateInput
                          label={isFa ? 'تاریخ صدور دعوتنامه' : 'Issue Date'}
                          value={issueDate}
                          onChange={setIssueDate}
                        />
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.supplier}
                          </label>
                          <input
                            type="text"
                            value={supplier}
                            onChange={(e) => setSupplier(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.purchasePackageNo}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={purchasePackageNo}
                            onChange={(e) => setPurchasePackageNo(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.system}
                          </label>
                          <input
                            type="text"
                            value={system}
                            onChange={(e) => setSystem(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.island}
                          </label>
                          <input
                            type="text"
                            value={island}
                            onChange={(e) => setIsland(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {t.headers.unit}
                          </label>
                          <input
                            type="text"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {isFa ? 'شماره قرارداد' : 'Contract No.'}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={contractNo}
                            onChange={(e) => setContractNo(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {isFa ? 'پیمانکار (نصاب)' : 'Installer Contractor'}
                          </label>
                          <input
                            type="text"
                            value={installerContractor}
                            onChange={(e) => setInstallerContractor(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {isFa ? 'نماینده تامین‌کننده' : 'Supplier Rep.'}
                          </label>
                          <input
                            type="text"
                            value={supplierRep}
                            onChange={(e) => setSupplierRep(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {isFa ? 'تامین تجهیزات توسعه یک' : 'Equipment Supply'}
                          </label>
                          <input
                            type="text"
                            value={equipmentSupply}
                            onChange={(e) => setEquipmentSupply(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                            {isFa ? 'دستگاه نظارت یا کارفرما' : 'Supervisor / Employer'}
                          </label>
                          <input
                            type="text"
                            value={employerRep}
                            onChange={(e) => setEmployerRep(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Required OPI Schedule Bar (تاریخ، زمان و مکان OPI) */}
                  <div className="rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-soft)]/25 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                      <CalendarClock className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span>
                        {isFa
                          ? 'زمان، تاریخ و مکان برگزاری بازگشایی و بازرسی (OPI)'
                          : 'OPI Opening & Inspection Schedule'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div data-testid="opi-schedule-date-wrap">
                        <JalaliDateInput
                          label={isFa ? 'تاریخ OPI *' : 'OPI Date *'}
                          value={date}
                          onChange={setDate}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'زمان OPI *' : 'OPI Time *'}
                        </label>
                        <input
                          type="text"
                          required
                          data-testid="opi-schedule-time"
                          dir="ltr"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          placeholder="09:00"
                          className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-mono tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="opi-schedule-location-input"
                          className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          {isFa ? 'مکان OPI *' : 'OPI Location *'}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            id="opi-schedule-location-input"
                            type="text"
                            required
                            list="opi-schedule-location-presets"
                            data-testid="opi-schedule-location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder={
                              isFa
                                ? 'انتخاب از گزینه‌های پیش‌فرض یا تایپ مکان دلخواه...'
                                : 'Choose preset or type custom location...'
                            }
                            className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                          <select
                            aria-label={isFa ? 'انتخاب سریع مکان پیش‌فرض OPI' : 'Quick select preset OPI location'}
                            data-testid="opi-schedule-location-preset-select"
                            value={
                              (OPI_FIXED_LOCATIONS as readonly string[]).includes(location) ? location : ''
                            }
                            onChange={(e) => {
                              if (e.target.value) setLocation(e.target.value);
                            }}
                            className="h-9 max-w-[135px] px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-primary)]"
                          >
                            <option value="">{isFa ? 'پیش‌فرض‌ها...' : 'Presets...'}</option>
                            {OPI_FIXED_LOCATIONS.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                          </select>
                        </div>
                        <datalist id="opi-schedule-location-presets">
                          {OPI_FIXED_LOCATIONS.map((loc) => (
                            <option key={loc} value={loc} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  {/* Selected Rows Table with Optional Per-Row Remarks */}
                  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                    <div className="px-4 py-2.5 bg-[var(--bg-subtle)]/70 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {isFa
                          ? `اقلام دعوتنامه (${selectedRows.length} ردیف) — توضیحات اختیاری`
                          : `Invitation Items (${selectedRows.length} rows) — Optional Remarks`}
                      </span>
                    </div>

                    <StickyTableWrapper>
                      <table className="w-full text-xs">
                        <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                          <tr>
                            <th className="py-2 px-2.5 text-center w-12">{isFa ? 'ردیف' : '#'}</th>
                            <th className="py-2 px-2.5 text-start">Packing List No.</th>
                            <th className="py-2 px-2.5 text-start">Package No.</th>
                            <th className="py-2 px-2.5 text-start">{isFa ? 'شرح کالا' : 'Description'}</th>
                            <th className="py-2 px-2.5 text-start">{isFa ? 'واحد (UOM)' : 'UOM'}</th>
                            <th className="py-2 px-2.5 text-start min-w-[220px]">
                              {isFa ? 'توضیحات' : 'Remarks'}
                            </th>
                            <th className="py-2 px-2.5 w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {selectedRows.map((row, idx) => (
                            <tr key={row.id} className="hover:bg-[var(--bg-subtle)]/30">
                              <td className="py-2 px-2.5 text-center font-mono tabular-nums text-[var(--text-muted)]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                                {row.packingListNo}
                              </td>
                              <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap" dir="ltr">
                                {row.packageNo}
                              </td>
                              <td className="py-2 px-2.5 max-w-[260px] bidi-plaintext">
                                {row.itemDescription}
                              </td>
                              <td className="py-2 px-2.5 whitespace-nowrap bidi-plaintext">
                                {row.packageType || '—'}
                              </td>
                              <td className="py-2 px-2.5">
                                <textarea
                                  rows={1}
                                  data-testid={`opi-row-remark-${row.id}`}
                                  value={remarksMap[row.id] || ''}
                                  onChange={(e) =>
                                    setRemarksMap((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={isFa ? 'توضیحات' : 'Remark'}
                                  className="w-full min-h-[34px] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] resize-y"
                                />
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <button
                                  type="button"
                                  aria-label={isFa ? 'حذف ردیف از لیست' : 'Remove row'}
                                  onClick={() => handleToggleRow(row)}
                                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </StickyTableWrapper>
                  </div>

                  {/* Submit Footer */}
                  <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)]"
                    >
                      {isFa ? 'مرحله قبل' : 'Previous'}
                    </button>
                    <button
                      type="submit"
                      data-testid="opi-submit-btn"
                      disabled={submitting || selectedRows.length === 0}
                      className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-2 transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      <span>
                        {editingInvitation
                          ? isFa
                            ? 'ذخیره تغییرات و پیش‌نمایش چاپ'
                            : 'Save Changes & Print Preview'
                          : isFa
                            ? 'صدور دعوتنامه OPI و پیش‌نمایش چاپ'
                            : 'Issue OPI Invitation & Print Preview'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* History View (سابقه فرم‌ها) */}
          {invViewMode === 'history' && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1 min-w-[220px] max-w-md">
                  <SearchInputWithClear
                    value={historySearch}
                    onChange={(v) => {
                      setHistorySearch(v);
                      invitationsPagination.setPage(1);
                    }}
                    placeholder={
                      isFa
                        ? 'جستجو در سابقه دعوتنامه‌ها (شماره، پکینگ، تامین‌کننده، مکان)...'
                        : 'Search invitation history (no., packing, supplier, location)...'
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPrintInvTableOpen(true)}
                  className="h-9 px-3.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.controls.printReport}</span>
                </button>
              </div>

              <StickyTableWrapper>
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{t.headers.opiInvitationNo}</th>
                      <th className="py-2.5 px-3 text-start">{isFa ? 'تاریخ OPI' : 'OPI Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isFa ? 'زمان' : 'Time'}</th>
                      <th className="py-2.5 px-3 text-start">{isFa ? 'مکان' : 'Location'}</th>
                      <th className="py-2.5 px-3 text-start">{t.headers.supplier}</th>
                      <th className="py-2.5 px-3 text-start">{t.headers.packingListNo}</th>
                      <th className="py-2.5 px-3 text-center">{isFa ? 'ردیف‌ها' : 'Items'}</th>
                      <th className="py-2.5 px-3 text-start">{isFa ? 'نسخه اسکن امضاشده' : 'Signed Scan'}</th>
                      <th className="py-2.5 px-3 text-start">{isFa ? 'عملیات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {invitationsPagination.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-[var(--text-muted)]">
                          {t.controls.noData}
                        </td>
                      </tr>
                    ) : (
                      invitationsPagination.pageItems.map((inv) => (
                        <tr
                          key={inv.id}
                          data-testid={`opi-history-row-${inv.id}`}
                          onClick={() => setScanTarget(inv)}
                          title={isFa ? 'کلیک برای مشاهده یا بارگذاری اسکن امضاشده فرم' : 'Click to view or upload signed scan'}
                          className="hover:bg-[var(--bg-subtle)]/40 cursor-pointer"
                        >
                          <td className="py-2.5 px-3 font-mono font-bold tabular-nums text-[var(--accent-primary)] whitespace-nowrap" dir="ltr">
                            {inv.invitationNo}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums whitespace-nowrap" dir="ltr">
                            {formatDate(inv.date)}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums whitespace-nowrap" dir="ltr">
                            {inv.time || '—'}
                          </td>
                          <td className="py-2.5 px-3 bidi-plaintext max-w-[180px] truncate" title={inv.location}>
                            {inv.location || '—'}
                          </td>
                          <td className="py-2.5 px-3 bidi-plaintext whitespace-nowrap">
                            {inv.supplier || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums max-w-[200px] truncate" dir="ltr" title={(inv.packingNos || []).join(', ')}>
                            {(inv.packingNos || []).join(', ')}
                          </td>
                          <td className="py-2.5 px-3 text-center tabular-nums font-semibold">
                            {inv.items?.length || inv.packingNos?.length || 0}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <SignedScanRowButton
                              signedScan={inv.signedScan}
                              recordLabel={inv.invitationNo}
                              onClick={() => setScanTarget(inv)}
                            />
                          </td>
                          <td
                            className="py-2.5 px-3 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                data-testid={`opi-print-btn-${inv.id}`}
                                title={isFa ? 'پیش‌نمایش و چاپ دعوتنامه' : 'Print OPI Invitation'}
                                aria-label={isFa ? `چاپ ${inv.invitationNo}` : `Print ${inv.invitationNo}`}
                                onClick={() => {
                                  setPrintInvWasUndone(false);
                                  setPrintInvitation(inv);
                                }}
                                className="p-1.5 rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)]"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <>
                                  <button
                                    type="button"
                                    data-testid={`opi-edit-btn-${inv.id}`}
                                    title={isFa ? 'ویرایش' : 'Edit'}
                                    aria-label={isFa ? `ویرایش ${inv.invitationNo}` : `Edit ${inv.invitationNo}`}
                                    onClick={() => startEditInvitation(inv)}
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`opi-delete-btn-${inv.id}`}
                                    title={isFa ? 'حذف' : 'Delete'}
                                    aria-label={isFa ? `حذف ${inv.invitationNo}` : `Delete ${inv.invitationNo}`}
                                    onClick={() => setDeleteTarget(inv)}
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
                page={invitationsPagination.page}
                totalPages={invitationsPagination.totalPages}
                total={invitationsPagination.total}
                pageSize={invitationsPagination.pageSize}
                onPageChange={invitationsPagination.setPage}
                onPageSizeChange={invitationsPagination.setPageSize}
                lang={prefs.language}
              />
            </div>
          )}
      </div>

      {/* Printable Official MD1EX-FQP02/02-03 OPI Invitation Preview Modal with Post-Print Undo & Redo */}
      {printInvitation && (
        <div
          data-testid="opi-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
        >
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
            {/* Modal Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Printer className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                  {isFa
                    ? `پیش‌نمایش چاپ دعوتنامه OPI — ${printInvitation.invitationNo} (${MD1_OPI_INVITATION_FORM_CODE})`
                    : `OPI Invitation Print Preview — ${printInvitation.invitationNo} (${MD1_OPI_INVITATION_FORM_CODE})`}
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
                      data-testid="opi-preview-undo-btn"
                      disabled={!historyStatus.canUndo || historyBusy}
                      onClick={() => void performUndo()}
                      title={
                        isFa
                          ? 'واگرد (لغو صدور دعوتنامه و بازگردانی وضعیت جدول کلی)'
                          : 'Undo (revert invitation & General table)'
                      }
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد' : 'Undo'}</span>
                    </button>
                    <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
                    <button
                      type="button"
                      data-testid="opi-preview-redo-btn"
                      disabled={!historyStatus.canRedo || historyBusy}
                      onClick={() => void performRedo()}
                      title={isFa ? 'انجام مجدد (اعمال مجدد دعوتنامه)' : 'Redo (reapply invitation)'}
                      className="h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)] disabled:opacity-35 inline-flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="opi-preview-print-btn"
                  disabled={printInvWasUndone}
                  onClick={() => triggerAppPrint()}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-45 text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ دعوتنامه (A4 عمودی)' : 'Print Invitation (A4 Portrait)'}</span>
                </button>

                <button
                  type="button"
                  data-testid="opi-preview-close-btn"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => {
                    setPrintInvitation(null);
                    setPrintInvWasUndone(false);
                  }}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {printInvWasUndone && (
              <div
                data-testid="opi-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {isFa
                  ? 'این دعوتنامه با عملیات واگرد (Undo) بازگردانی شده و شماره دعوتنامه از جدول ثبت کلی پاک شده است. با دکمه «انجام مجدد (Redo)» می‌توانید دوباره آن را اعمال کنید.'
                  : 'This invitation was reverted via Undo and cleared from General Equipment. Click Redo above to reapply it.'}
              </div>
            )}

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-200/75 dark:bg-slate-900/70">
              <div
                className={`mx-auto w-full max-w-[196mm] bg-white p-5 shadow-lg rounded-sm ${
                  printInvWasUndone ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <OfficialOpiInvitationSheet
                  record={printInvitation}
                  generalEntries={generalEntries}
                  formatDate={formatDate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printInvTableOpen}
        onClose={() => setPrintInvTableOpen(false)}
        title={isFa ? 'فهرست دعوتنامه‌های گشایش و بازرسی بسته ها' : 'Issued OPI Invitations'}
        columns={invReportColumns}
        rows={invitationsList}
      />

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف دعوتنامه OPI' : 'Delete OPI Invitation'}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف دعوتنامه شماره ${deleteTarget.invitationNo} اطمینان دارید؟`
              : `Delete OPI Invitation ${deleteTarget.invitationNo}?`
            : ''
        }
        onConfirm={handleConfirmDeleteInvitation}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Signed Form Scan Viewer / Uploader Modal */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="opi"
          recordId={scanTarget.id}
          recordLabel={scanTarget.invitationNo}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={(nextScan) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    invitations: prev.invitations.map((item) =>
                      item.id === scanTarget.id ? { ...item, signedScan: nextScan } : item,
                    ),
                  }
                : prev,
            );
            setScanTarget((prev) => (prev ? { ...prev, signedScan: nextScan } : null));
          }}
        />
      )}
    </div>
  );
};
