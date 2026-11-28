import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Pencil,
  Printer,
  Redo2,
  RotateCcw,
  Scale,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { triggerAppPrint } from '../lib/print.ts';
import {
  BMR_STATUS_DEBTOR_FA,
  BMR_STATUS_SETTLED_FA,
  buildBmrHeaderAutoFill,
  buildBmrLineItem,
  computeBmrBalance,
  generateBmrDocNo,
  lookupBmrEstimateQty,
  MD1_BMR_COPY_TEXT,
  MD1_BMR_FORM_CODE,
  MD1_BMR_QA_NOTICE,
  parseOptionalQtyInput,
} from '../shared/bmr.ts';
import { getEmployerFormCode, resolveBuiltInFormDesign } from '../shared/employers.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { formatHeaderProjectTitle } from '../shared/opiInvitation.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import type {
  BmrDocumentRecord,
  BmrLineItem,
  DetailedComputed,
  GeneralEntry,
  MaterialEstimateRecord,
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
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { SubstitutionItemPicker } from './SubstitutionItemPicker.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface BalanceViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface BmrApiResponse {
  records: BmrDocumentRecord[];
  usedDocNos: string[];
}

interface BmrRowDraft {
  detailedId: string;
  plNo: string;
  packageNo: string;
  packageItemNo: string;
  tagNo: string;
  description: string;
  uom: string;
  receivedQty: number;
  deliveredQty: number;
  returnedQty: number;
  smrMapnaNo?: string;
  mtoInput: string;
  mtoAutoMatched: boolean;
  erectedInput: string;
}

const BALANCE_STATUS_PAIRS: { fa: string; en: string }[] = [
  { fa: BMR_STATUS_SETTLED_FA, en: 'Completed' },
  { fa: BMR_STATUS_DEBTOR_FA, en: 'Debtor' },
  { fa: 'تایید شده', en: 'Balanced' },
  { fa: 'در دست بررسی', en: 'Open / Pending' },
  { fa: 'مغایرت / کسری', en: 'Shortage Claim' },
  { fa: 'مختومه', en: 'Closed' },
];

export function localizeBalanceStatus(raw: string | undefined, isFa: boolean): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const lower = val.toLowerCase();
  if (val === 'مغایرت') return isFa ? 'مغایرت / کسری' : 'Shortage Claim';
  for (const pair of BALANCE_STATUS_PAIRS) {
    if (pair.fa === val || pair.en.toLowerCase() === lower) {
      return isFa ? pair.fa : pair.en;
    }
  }
  return val;
}

function formatQtyCell(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) return '';
  const n = Number(val);
  return Object.is(n, -0) ? '0' : String(n);
}

interface OfficialBmrSheetProps {
  record: BmrDocumentRecord;
}

const OfficialBmrSheet: React.FC<OfficialBmrSheetProps> = ({ record }) => {
  const { activeEmployer, activeProject, formatDate } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'balance');
  const formCode = design.docCode || MD1_BMR_FORM_CODE;
  const displayProjectName = record.projectName?.trim() || activeProject?.name || '';
  const headerProjectTitle = formatHeaderProjectTitle(displayProjectName || '..................');
  const displayDate = record.date ? formatDate(record.date) : '';

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, record.items.length);
  const paddedRows: (BmrLineItem | null)[] = [
    ...record.items,
    ...Array.from({ length: Math.max(0, totalDisplayRows - record.items.length) }, () => null),
  ];

  return (
    <div
      dir="rtl"
      data-testid="official-bmr-sheet"
      className={design.orientation === 'landscape' ? 'samaan-a4-landscape' : 'samaan-a4-portrait'}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Upper Main Frame */}
      <div style={{ border: `1.8px solid ${design.accentColor || '#000000'}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={design}
          projectTitle={headerProjectTitle}
          leftMetaNoPadding
          leftMetaSlot={
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                height: '100%',
                fontSize: '9.8px',
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  padding: '6px 9px',
                  borderBottom: `1px solid ${design.accentColor || '#000000'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <strong style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>شماره:</strong>
                <span
                  dir="ltr"
                  style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', fontSize: '9.6px' }}
                >
                  {record.bmrNo || '—'}
                </span>
              </div>
              <div
                style={{
                  padding: '6px 9px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <strong style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>تاریخ:</strong>
                <span dir="ltr" style={{ fontWeight: 600 }}>
                  {displayDate || '—'}
                </span>
              </div>
            </div>
          }
        />
        <OfficialExtraMetaStrip design={design} inset borderColor={design.accentColor || '#000000'} />

        {/* Metadata Strip Row 1 (4 bordered cells RTL: سیستم | جزیره | واحد | پروژه) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '26.5% 20.3% 25.5% 27.7%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>سیستم: </strong>
            <span className="bidi-plaintext">{record.system}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{record.island}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{record.unit}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span className="bidi-plaintext">{displayProjectName}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (2 bordered cells RTL: پیمانکار نصب | تامین کننده) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '46.8% 53.2%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>پیمانکار نصب: </strong>
            <span className="bidi-plaintext">{record.installerContractor}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{record.supplier}</span>
          </div>
        </div>

        {/* 13-Column LTR Table */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '8.7px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}
              >
                No.
              </th>
              <th
                className="samaan-col-code"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                PL No.
              </th>
              <th
                className="samaan-col-code"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Package No.
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Package Item No.
              </th>
              <th
                className="samaan-col-code"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Tag No.
              </th>
              <th
                className="samaan-col-fluid"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 5px' }}
              >
                Description
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                UOM
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Received Qty
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Total Delivered Qty
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Total Returned Qty
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Total MTO Qty
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px' }}
              >
                Total Erected Qty
              </th>
              <th
                className="samaan-col-compact"
                style={{ borderBottom: '1px solid #000000', padding: '5px 3px' }}
              >
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => {
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              return (
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`} style={{ height: '24px' }}>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px',
                      height: '24px',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                  >
                    {row ? idx + 1 : '\u00a0'}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row?.plNo || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row?.packageNo || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row?.packageItemNo || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row?.tagNo || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 5px',
                      textAlign: 'left',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                    }}
                  >
                    {row?.description || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                    }}
                  >
                    {row?.uom || ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.receivedQty) : ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.deliveredQty) : ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.returnedQty) : ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.mtoQty) : ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      borderRight: '1px solid #000000',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.erectedQty) : ''}
                  </td>
                  <td
                    style={{
                      borderBottom: rowBottomBorder,
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row ? formatQtyCell(row.balance) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Signatures Section */}
      {design.template?.signatures?.length || !design.showSignatures ? (
        <div style={{ marginTop: '6px' }}>
          <OfficialFormSignatures
            signatures={design.signatures}
            showSignatures={design.showSignatures}
            borderColor={design.accentColor || '#000000'}
          />
        </div>
      ) : (
        <div
          style={{
            marginTop: '6px',
            border: `1.5px solid ${design.accentColor || '#000000'}`,
            pageBreakInside: 'avoid',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              fontWeight: 800,
              fontSize: '10.5px',
              padding: '3px 6px',
              borderBottom: '1px solid #000000',
              backgroundColor: '#f3f4f6',
            }}
          >
            امضاء
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              fontSize: '9.5px',
            }}
          >
            {[
              { label: 'انباردار', name: record.storekeeper },
              { label: 'تأمین تجهیزات توسعه یک', name: record.equipmentSupply },
              { label: 'دفتر فنی', name: record.techOffice },
              { label: 'واحد نصب', name: record.installationUnit },
              { label: 'مدیر پروژه پیمانکار نصب', name: record.contractorPm },
            ].map((sig, idx) => (
              <div
                key={sig.label}
                style={{
                  borderLeft: idx < 4 ? '1px solid #000000' : 'none',
                  padding: '5px 7px',
                  minHeight: '68px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontWeight: 700, textAlign: 'center' }}>{sig.label}</div>
                {sig.name ? (
                  <div style={{ textAlign: 'center', fontWeight: 600, fontSize: '9px' }}>
                    {sig.name}
                  </div>
                ) : (
                  <div style={{ height: '18px' }} />
                )}
                <div style={{ fontSize: '8.5px', textAlign: 'right', color: '#111827' }}>
                  تاریخ و امضاء:
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QA Control Notice (Right-Aligned, Strictly Persian ی/ک) */}
      <div
        style={{
          marginTop: '5px',
          fontSize: '8.8px',
          fontWeight: 600,
          textAlign: 'right',
          lineHeight: 1.5,
        }}
      >
        {MD1_BMR_QA_NOTICE}
      </div>

      {/* Boxed Footer: Copy Text + Official Form Code */}
      <div
        style={{
          marginTop: '4px',
          border: `1.2px solid ${design.accentColor || '#000000'}`,
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontSize: '9px',
          fontWeight: 600,
        }}
      >
        <span>{design.footerCopyText || MD1_BMR_COPY_TEXT}</span>
        <span dir="ltr" style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>
          {formCode}
        </span>
      </div>
    </div>
  );
};

export const BalanceView: React.FC<BalanceViewProps> = ({ refreshSignal, onDataChanged }) => {
  const {
    user,
    prefs,
    activeEmployer,
    activeProject,
    notify,
    formatDate,
    historyStatus,
    historyBusy,
    performUndo,
    performRedo,
    refreshHistoryStatus,
  } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const formCode = getEmployerFormCode(activeEmployer, '09-03', 'balance') || MD1_BMR_FORM_CODE;

  // Mode & Wizard Step
  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // Remote Data
  const [records, setRecords] = useState<BmrDocumentRecord[]>([]);
  const [usedDocNos, setUsedDocNos] = useState<string[]>([]);
  const [estimates, setEstimates] = useState<MaterialEstimateRecord[]>([]);
  const [generalEntries, setGeneralEntries] = useState<GeneralEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerRefresh, setPickerRefresh] = useState(0);

  // Step 1 Selection
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});

  // Step 2 Form State
  const [bmrNo, setBmrNo] = useState('');
  const [bmrNoManuallyEdited, setBmrNoManuallyEdited] = useState(false);
  const [date, setDate] = useState(getTodayIso());
  const [projectName, setProjectName] = useState(activeProject?.name || '');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [unit, setUnit] = useState('');
  const [installerContractor, setInstallerContractor] = useState('');
  const [supplier, setSupplier] = useState('');
  const [rowDrafts, setRowDrafts] = useState<BmrRowDraft[]>([]);
  const [showSignatories, setShowSignatories] = useState(false);
  const [storekeeper, setStorekeeper] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [techOffice, setTechOffice] = useState('');
  const [installationUnit, setInstallationUnit] = useState('');
  const [contractorPm, setContractorPm] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History Filters & Modals
  const [historySearch, setHistorySearch] = useState('');
  const [previewRecord, setPreviewRecord] = useState<BmrDocumentRecord | null>(null);
  const [scanTarget, setScanTarget] = useState<BmrDocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BmrDocumentRecord | null>(null);
  const [reportPrintOpen, setReportPrintOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bmrRes, estRes, genRes] = await Promise.all([
        apiRequest<BmrApiResponse>('/api/balance'),
        apiRequest<{ records: MaterialEstimateRecord[] }>('/api/estimations'),
        apiRequest<{ items: GeneralEntry[] }>('/api/general?page=1&pageSize=10000'),
      ]);
      setRecords(bmrRes.records || []);
      setUsedDocNos(bmrRes.usedDocNos || []);
      setEstimates(estRes.records || []);
      setGeneralEntries(genRes.items || []);
    } catch (err) {
      notify(
        'error',
        err instanceof ApiError ? err.message : isFa ? 'خطا در بارگذاری گزارش‌های موازنه' : 'Failed to load BMR data',
      );
    } finally {
      setLoading(false);
    }
  }, [isFa, notify]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  // Keep previewRecord in sync if edited or refreshed
  useEffect(() => {
    if (!previewRecord) return;
    const fresh = records.find((r) => r.id === previewRecord.id);
    if (fresh && fresh.updatedAt !== previewRecord.updatedAt) {
      setPreviewRecord(fresh);
    }
  }, [records, previewRecord]);

  const previewRecordExists = useMemo(
    () => (previewRecord ? records.some((r) => r.id === previewRecord.id) : true),
    [previewRecord, records],
  );

  // Keep auto-generated BMR No. synced when contractor changes (unless user manually edited it or editing an existing record)
  useEffect(() => {
    if (editingRecordId || bmrNoManuallyEdited || wizardStep !== 2) return;
    const nextNo = generateBmrDocNo(installerContractor, usedDocNos, activeProject);
    setBmrNo(nextNo);
  }, [installerContractor, usedDocNos, activeProject, editingRecordId, bmrNoManuallyEdited, wizardStep]);

  const selectedItemsList = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const handleToggleRow = useCallback((item: DetailedComputed) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = item;
      }
      return next;
    });
  }, []);

  const handleTogglePage = useCallback((rows: DetailedComputed[], allSelected: boolean) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allSelected) {
        for (const r of rows) delete next[r.id];
      } else {
        for (const r of rows) next[r.id] = r;
      }
      return next;
    });
  }, []);

  const resetWizard = useCallback(() => {
    setEditingRecordId(null);
    setWizardStep(1);
    setSelectedMap({});
    setRowDrafts([]);
    setBmrNo('');
    setBmrNoManuallyEdited(false);
    setDate(getTodayIso());
    setProjectName(activeProject?.name || '');
    setSystem('');
    setIsland('');
    setUnit('');
    setInstallerContractor('');
    setSupplier('');
    setStorekeeper('');
    setEquipmentSupply('');
    setTechOffice('');
    setInstallationUnit('');
    setContractorPm('');
    setNotes('');
    setShowSignatories(false);
  }, [activeProject?.name]);

  const handleProceedToStep2 = useCallback(() => {
    if (selectedItemsList.length === 0) {
      notify(
        'error',
        isFa ? 'ابتدا حداقل یک ردیف از جدول جزئیات انتخاب کنید.' : 'Select at least one detailed row first.',
      );
      return;
    }

    const header = buildBmrHeaderAutoFill(selectedItemsList, generalEntries, activeProject);
    if (!editingRecordId) {
      setProjectName(header.projectName || activeProject?.name || '');
      setSystem(header.system);
      setIsland(header.island);
      setUnit(header.unit);
      setInstallerContractor(header.installerContractor);
      setSupplier(header.supplier);
      setDate(header.date);
      setBmrNo(generateBmrDocNo(header.installerContractor, usedDocNos, activeProject));
      setBmrNoManuallyEdited(false);
    }

    // Preserve any existing drafts for rows already present
    const prevDraftById = new Map<string, BmrRowDraft>(rowDrafts.map((d) => [d.detailedId, d]));
    const nextDrafts: BmrRowDraft[] = selectedItemsList.map((row) => {
      const existingDraft = prevDraftById.get(row.id);
      const estLookup = lookupBmrEstimateQty(row, estimates);
      const baseItem = buildBmrLineItem(row, estimates);
      if (existingDraft) {
        return {
          ...existingDraft,
          plNo: baseItem.plNo,
          packageNo: baseItem.packageNo,
          packageItemNo: baseItem.packageItemNo,
          tagNo: baseItem.tagNo,
          description: baseItem.description,
          uom: baseItem.uom,
          receivedQty: baseItem.receivedQty,
          deliveredQty: baseItem.deliveredQty,
          returnedQty: baseItem.returnedQty,
          smrMapnaNo: baseItem.smrMapnaNo,
        };
      }
      return {
        detailedId: row.id,
        plNo: baseItem.plNo,
        packageNo: baseItem.packageNo,
        packageItemNo: baseItem.packageItemNo,
        tagNo: baseItem.tagNo,
        description: baseItem.description,
        uom: baseItem.uom,
        receivedQty: baseItem.receivedQty,
        deliveredQty: baseItem.deliveredQty,
        returnedQty: baseItem.returnedQty,
        smrMapnaNo: baseItem.smrMapnaNo,
        mtoInput: estLookup.mtoQty !== null ? String(estLookup.mtoQty) : '',
        mtoAutoMatched: estLookup.matchedBy !== 'none',
        erectedInput: '',
      };
    });

    setRowDrafts(nextDrafts);
    setWizardStep(2);
  }, [
    selectedItemsList,
    generalEntries,
    activeProject,
    editingRecordId,
    usedDocNos,
    rowDrafts,
    estimates,
    notify,
    isFa,
  ]);

  const updateRowDraft = useCallback(
    (detailedId: string, field: 'mtoInput' | 'erectedInput', value: string) => {
      setRowDrafts((prev) =>
        prev.map((row) =>
          row.detailedId === detailedId
            ? {
                ...row,
                [field]: value,
                ...(field === 'mtoInput' ? { mtoAutoMatched: false } : {}),
              }
            : row,
        ),
      );
    },
    [],
  );

  const removeRowDraft = useCallback((detailedId: string) => {
    setRowDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.detailedId !== detailedId);
    });
    setSelectedMap((prev) => {
      const next = { ...prev };
      delete next[detailedId];
      return next;
    });
  }, []);

  // Compute live line items & summary
  const computedLineItems = useMemo(() => {
    return rowDrafts.map((draft) => {
      const mtoQty = parseOptionalQtyInput(draft.mtoInput);
      const erectedQty = parseOptionalQtyInput(draft.erectedInput);
      const calc = computeBmrBalance({
        deliveredQty: draft.deliveredQty,
        returnedQty: draft.returnedQty,
        mtoQty,
        erectedQty,
      });
      const item: BmrLineItem = {
        detailedId: draft.detailedId,
        plNo: draft.plNo,
        packageNo: draft.packageNo,
        packageItemNo: draft.packageItemNo,
        tagNo: draft.tagNo,
        description: draft.description,
        uom: draft.uom,
        receivedQty: draft.receivedQty,
        deliveredQty: draft.deliveredQty,
        returnedQty: draft.returnedQty,
        smrMapnaNo: draft.smrMapnaNo,
        mtoQty,
        erectedQty,
        balance: calc.balance,
        balanceStatus: calc.statusFa,
      };
      return { draft, item, calc };
    });
  }, [rowDrafts]);

  const liveSummary = useMemo(() => {
    let settled = 0;
    let debtor = 0;
    for (const c of computedLineItems) {
      if (c.item.balanceStatus === BMR_STATUS_SETTLED_FA) settled += 1;
      else debtor += 1;
    }
    return { total: computedLineItems.length, settled, debtor };
  }, [computedLineItems]);

  const handleSubmit = async () => {
    const cleanBmrNo = bmrNo.trim();
    if (!cleanBmrNo) {
      notify('error', isFa ? 'شماره گزارش موازنه الزامی است.' : 'BMR No. is required.');
      return;
    }
    if (computedLineItems.length === 0) {
      notify('error', isFa ? 'حداقل یک ردیف تجهیز برای صدور گزارش الزامی است.' : 'At least one row is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        bmrNo: cleanBmrNo,
        date: date.trim() || getTodayIso(),
        projectName: projectName.trim(),
        system: system.trim(),
        island: island.trim(),
        unit: unit.trim(),
        installerContractor: installerContractor.trim(),
        supplier: supplier.trim(),
        items: computedLineItems.map((c) => c.item),
        storekeeper: storekeeper.trim(),
        equipmentSupply: equipmentSupply.trim(),
        techOffice: techOffice.trim(),
        installationUnit: installationUnit.trim(),
        contractorPm: contractorPm.trim(),
        notes: notes.trim(),
      };

      const res = editingRecordId
        ? await apiRequest<{ record: BmrDocumentRecord }>(`/api/balance/${encodeURIComponent(editingRecordId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ record: BmrDocumentRecord }>('/api/balance', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingRecordId
          ? isFa
            ? `گزارش موازنه ${res.record.bmrNo} با موفقیت ویرایش و در جدول جزئیات به‌روزرسانی شد.`
            : `BMR ${res.record.bmrNo} updated and synced to Detailed Equipment.`
          : isFa
            ? `گزارش موازنه ${res.record.bmrNo} صادر و در جدول جزئیات ثبت شد.`
            : `BMR ${res.record.bmrNo} issued and synced to Detailed Equipment.`,
      );

      await Promise.all([loadData(), refreshHistoryStatus()]);
      setPickerRefresh((n) => n + 1);
      onDataChanged();
      setPreviewRecord(res.record);
      resetWizard();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : isFa ? 'خطا در ثبت گزارش موازنه' : 'Failed to save BMR');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = useCallback(
    (rec: BmrDocumentRecord) => {
      setEditingRecordId(rec.id);
      setBmrNo(rec.bmrNo);
      setBmrNoManuallyEdited(true);
      setDate(rec.date || getTodayIso());
      setProjectName(rec.projectName || activeProject?.name || '');
      setSystem(rec.system || '');
      setIsland(rec.island || '');
      setUnit(rec.unit || '');
      setInstallerContractor(rec.installerContractor || '');
      setSupplier(rec.supplier || '');
      setStorekeeper(rec.storekeeper || '');
      setEquipmentSupply(rec.equipmentSupply || '');
      setTechOffice(rec.techOffice || '');
      setInstallationUnit(rec.installationUnit || '');
      setContractorPm(rec.contractorPm || '');
      setNotes(rec.notes || '');
      setShowSignatories(
        Boolean(rec.storekeeper || rec.equipmentSupply || rec.techOffice || rec.installationUnit || rec.contractorPm || rec.notes),
      );
      setRowDrafts(
        rec.items.map((it) => ({
          detailedId: it.detailedId,
          plNo: it.plNo,
          packageNo: it.packageNo,
          packageItemNo: it.packageItemNo,
          tagNo: it.tagNo,
          description: it.description,
          uom: it.uom,
          receivedQty: it.receivedQty,
          deliveredQty: it.deliveredQty,
          returnedQty: it.returnedQty,
          smrMapnaNo: it.smrMapnaNo,
          mtoInput: it.mtoQty === null || it.mtoQty === undefined ? '' : String(it.mtoQty),
          mtoAutoMatched: false,
          erectedInput: it.erectedQty === null || it.erectedQty === undefined ? '' : String(it.erectedQty),
        })),
      );
      setViewMode('create');
      setWizardStep(2);
    },
    [activeProject?.name],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/balance/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `گزارش موازنه ${deleteTarget.bmrNo} حذف شد و ستون‌های مرتبط در جزئیات پاک‌سازی گردید.`
          : `BMR ${deleteTarget.bmrNo} deleted and Detailed columns cleared.`,
      );
      if (previewRecord?.id === deleteTarget.id) setPreviewRecord(null);
      setDeleteTarget(null);
      await Promise.all([loadData(), refreshHistoryStatus()]);
      setPickerRefresh((n) => n + 1);
      onDataChanged();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : isFa ? 'خطا در حذف گزارش موازنه' : 'Failed to delete BMR');
    }
  };

  const handlePreviewUndo = async () => {
    await performUndo();
    await Promise.all([loadData(), refreshHistoryStatus()]);
    setPickerRefresh((n) => n + 1);
    onDataChanged();
  };

  const handlePreviewRedo = async () => {
    await performRedo();
    await Promise.all([loadData(), refreshHistoryStatus()]);
    setPickerRefresh((n) => n + 1);
    onDataChanged();
  };

  const handlePrintSheet = () => {
    triggerAppPrint({ title: previewRecord?.bmrNo ? `BMR-${previewRecord.bmrNo}` : 'BMR-Report' });
  };

  // History filtering & pagination
  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const hay = [
        r.bmrNo,
        r.date,
        r.system,
        r.island,
        r.unit,
        r.installerContractor,
        r.supplier,
        r.projectName,
        ...r.items.map((it) => `${it.plNo} ${it.packageNo} ${it.tagNo} ${it.description}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, historySearch]);

  const historyPagination = useClientPagination(filteredHistory, 15);

  const historyMetrics = useMemo(() => {
    let totalRows = 0;
    let settledRows = 0;
    let debtorRows = 0;
    for (const rec of records) {
      for (const it of rec.items) {
        totalRows += 1;
        if (it.balanceStatus === BMR_STATUS_SETTLED_FA) settledRows += 1;
        else debtorRows += 1;
      }
    }
    return { docs: records.length, totalRows, settledRows, debtorRows };
  }, [records]);

  const reportPrintColumns: PrintColumnDef<BmrDocumentRecord>[] = useMemo(
    () => [
      { key: 'bmrNo', header: isFa ? 'شماره گزارش موازنه' : 'BMR No.', getValue: (r) => r.bmrNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', getValue: (r) => formatDate(r.date) },
      { key: 'system', header: isFa ? 'سیستم' : 'System', getValue: (r) => r.system || '-' },
      { key: 'island', header: isFa ? 'جزیره' : 'Island', getValue: (r) => r.island || '-' },
      { key: 'unit', header: isFa ? 'واحد' : 'Unit', getValue: (r) => r.unit || '-' },
      {
        key: 'installerContractor',
        header: isFa ? 'پیمانکار نصب' : 'Installer Contractor',
        getValue: (r) => r.installerContractor || '-',
      },
      { key: 'supplier', header: isFa ? 'تامین کننده' : 'Supplier', getValue: (r) => r.supplier || '-' },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => String(r.items.length) },
      {
        key: 'summary',
        header: isFa ? 'وضعیت موازنه' : 'Balance Summary',
        getValue: (r) => {
          const s = r.items.filter((i) => i.balanceStatus === BMR_STATUS_SETTLED_FA).length;
          const d = r.items.length - s;
          return isFa ? `${s} اتمام / ${d} بدهکار` : `${s} Completed / ${d} Debtor`;
        },
      },
    ],
    [isFa, formatDate],
  );

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-600/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate">
                {isFa ? 'گزارش موازنه و کنترل مصرف مواد' : 'Balance of Material Report (BMR)'}
              </h2>
              <span
                dir="ltr"
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                {formCode}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isFa
                ? 'صدور فرم رسمی موازنه و کنترل مصرف مواد، محاسبه خودکار بالانس و ثبت خودکار شماره و وضعیت موازنه در جزئیات تجهیزات'
                : 'Issue official Balance of Material Reports, compute balances automatically, and sync status directly to Detailed Equipment'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'history' && records.length > 0 && (
            <button
              type="button"
              onClick={() => setReportPrintOpen(true)}
              className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-600" />
              <span>{isFa ? 'چاپ فهرست' : 'Print List'}</span>
            </button>
          )}
          <OperationalViewModeTabs
            mode={viewMode}
            onChange={(m) => {
              setViewMode(m);
              if (m === 'create' && editingRecordId) {
                resetWizard();
              }
            }}
            historyCount={records.length}
            canEdit={canEdit}
            isEditing={Boolean(editingRecordId)}
            createLabelFa={editingRecordId ? 'ویرایش گزارش موازنه' : 'صدور گزارش موازنه جدید'}
            createLabelEn={editingRecordId ? 'Edit BMR' : 'New BMR Report'}
            historyLabelFa="سابقه گزارش‌های موازنه"
            historyLabelEn="BMR History"
            testIdPrefix="bmr"
          />
        </div>
      </div>

      {/* CREATE / EDIT WIZARD */}
      {viewMode === 'create' && canEdit && (
        <div className="space-y-4">
          {/* Step Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3 text-xs font-bold">
              <button
                type="button"
                onClick={() => !editingRecordId && setWizardStep(1)}
                disabled={Boolean(editingRecordId)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors ${
                  wizardStep === 1
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/15 flex items-center justify-center text-[11px] tabular-nums">
                  1
                </span>
                <span>{isFa ? 'انتخاب اقلام از جزئیات تجهیزات' : 'Select Detailed Equipment'}</span>
              </button>

              <span className="text-[var(--text-tertiary)]">{isFa ? '←' : '→'}</span>

              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 1 && selectedItemsList.length > 0) handleProceedToStep2();
                }}
                disabled={wizardStep === 1 && selectedItemsList.length === 0}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-colors ${
                  wizardStep === 2
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] disabled:opacity-50'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/15 flex items-center justify-center text-[11px] tabular-nums">
                  2
                </span>
                <span>{isFa ? 'تکمیل مقادیر MTO / Erected و صدور فرم' : 'Review MTO / Erected & Issue'}</span>
              </button>
            </div>

            {editingRecordId && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                  {isFa ? `در حال ویرایش گزارش ${bmrNo}` : `Editing BMR ${bmrNo}`}
                </span>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'انصراف از ویرایش' : 'Cancel Edit'}</span>
                </button>
              </div>
            )}
          </div>

          {/* STEP 1: ITEM PICKER */}
          {wizardStep === 1 && (
            <div className="space-y-3">
              {/* Selection Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `ردیف‌های انتخاب‌شده برای موازنه: ${selectedItemsList.length}`
                      : `Selected rows for BMR: ${selectedItemsList.length}`}
                  </span>
                  {selectedItemsList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedMap({})}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      {isFa ? 'پاک کردن انتخاب‌ها' : 'Clear selection'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  data-testid="bmr-next-step-btn"
                  disabled={selectedItemsList.length === 0}
                  onClick={handleProceedToStep2}
                  className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-45 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <span>{isFa ? 'ادامه و تنظیم مقادیر موازنه' : 'Continue to Balance Quantities'}</span>
                  {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

              <SubstitutionItemPicker
                refreshSignal={refreshSignal + pickerRefresh}
                selectedMap={selectedMap}
                onToggleRow={handleToggleRow}
                onTogglePage={handleTogglePage}
                testIdPrefix="bmr-picker"
              />
            </div>
          )}

          {/* STEP 2: HEADER + MTO / ERECTED / LIVE BALANCE TABLE */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              {/* Header Fields Card */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                  <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                    {isFa ? 'مشخصات سربرگ گزارش موازنه' : 'BMR Header Information'}
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                      {isFa ? `اتمام: ${liveSummary.settled}` : `Completed: ${liveSummary.settled}`}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 font-bold tabular-nums">
                      {isFa ? `بدهکار: ${liveSummary.debtor}` : `Debtor: ${liveSummary.debtor}`}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* BMR No */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'شماره گزارش موازنه (BMR No.) *' : 'BMR No. *'}
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        data-testid="bmr-doc-no-input"
                        value={bmrNo}
                        onChange={(e) => {
                          setBmrNo(e.target.value);
                          setBmrNoManuallyEdited(true);
                        }}
                        placeholder="NK-NNE-BMR-0001"
                        className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                      />
                      {!editingRecordId && (
                        <button
                          type="button"
                          title={isFa ? 'تولید مجدد شماره خودکار' : 'Regenerate auto number'}
                          onClick={() => {
                            setBmrNoManuallyEdited(false);
                            setBmrNo(generateBmrDocNo(installerContractor, usedDocNos, activeProject));
                          }}
                          className="h-9 w-9 shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'تاریخ صدور' : 'Issue Date'}
                    </label>
                    <JalaliDateInput value={date} onChange={setDate} />
                  </div>

                  {/* Installer Contractor */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'پیمانکار نصب (تحویل گیرنده)' : 'Installer Contractor'}
                    </label>
                    <input
                      type="text"
                      data-testid="bmr-contractor-input"
                      value={installerContractor}
                      onChange={(e) => setInstallerContractor(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Supplier */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'تامین کننده' : 'Supplier'}
                    </label>
                    <input
                      type="text"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  {/* System */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'سیستم' : 'System'}
                    </label>
                    <input
                      type="text"
                      value={system}
                      onChange={(e) => setSystem(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Island */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'جزیره' : 'Island'}
                    </label>
                    <input
                      type="text"
                      value={island}
                      onChange={(e) => setIsland(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Unit */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'واحد' : 'Unit'}
                    </label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>

                  {/* Project */}
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'پروژه' : 'Project'}
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                {/* Collapsible Signatories & Notes */}
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setShowSignatories((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {showSignatories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <span>{isFa ? 'نام امضاکنندگان و توضیحات تکمیلی (اختیاری)' : 'Signatories & Notes (Optional)'}</span>
                  </button>

                  {showSignatories && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'انباردار' : 'Storekeeper'}
                        </label>
                        <input
                          type="text"
                          value={storekeeper}
                          onChange={(e) => setStorekeeper(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'تأمین تجهیزات توسعه یک' : 'MD1 Equipment Supply'}
                        </label>
                        <input
                          type="text"
                          value={equipmentSupply}
                          onChange={(e) => setEquipmentSupply(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'دفتر فنی' : 'Technical Office'}
                        </label>
                        <input
                          type="text"
                          value={techOffice}
                          onChange={(e) => setTechOffice(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'واحد نصب' : 'Installation Unit'}
                        </label>
                        <input
                          type="text"
                          value={installationUnit}
                          onChange={(e) => setInstallationUnit(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'مدیر پروژه پیمانکار نصب' : 'Installer Contractor PM'}
                        </label>
                        <input
                          type="text"
                          value={contractorPm}
                          onChange={(e) => setContractorPm(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                          {isFa ? 'توضیحات داخلی (در سابقه)' : 'Internal Notes'}
                        </label>
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Formula Legend */}
              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5 text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-2">
                <span>
                  {isFa
                    ? 'فرمول موازنه: Balance = Total Delivered Qty − Total Returned Qty − Total Erected Qty (در صورت خالی بودن Erected از Total MTO Qty استفاده می‌شود). مقدار ۰ ⟵ وضعیت «اتمام» و هر عدد مثبت یا منفی ⟵ وضعیت «بدهکار».'
                    : 'Formula: Balance = Total Delivered Qty − Total Returned Qty − Total Erected Qty (falls back to Total MTO Qty if Erected is blank). Balance = 0 → Completed; any positive/negative non-zero value → Debtor.'}
                </span>
              </div>

              {/* Editable Line Items Table */}
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
                <StickyTableWrapper className="max-h-[56vh]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                        <th className="px-2.5 py-2.5 text-center font-bold">#</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">PL No.</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Pkg / Item</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Tag No.</th>
                        <th className="px-2.5 py-2.5 text-start font-bold min-w-[180px]">
                          {isFa ? 'شرح کالا (Description)' : 'Description'}
                        </th>
                        <th className="px-2.5 py-2.5 text-center font-bold">UOM</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Received Qty</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Delivered Qty</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Returned Qty</th>
                        <th className="px-2.5 py-2.5 text-center font-bold min-w-[110px]">Total MTO Qty</th>
                        <th className="px-2.5 py-2.5 text-center font-bold min-w-[110px]">Total Erected Qty</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">Balance</th>
                        <th className="px-2.5 py-2.5 text-center font-bold">
                          {isFa ? 'وضعیت بالانس' : 'Status'}
                        </th>
                        <th className="px-2 py-2.5 text-center font-bold w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {computedLineItems.map(({ draft, item }, idx) => {
                        const isSettled = item.balanceStatus === BMR_STATUS_SETTLED_FA;
                        return (
                          <tr key={draft.detailedId} className="hover:bg-[var(--bg-subtle)]/40">
                            <td className="px-2.5 py-2 text-center font-bold tabular-nums">{idx + 1}</td>
                            <td className="px-2.5 py-2 text-center font-mono text-[11px]" dir="ltr">
                              {draft.plNo || '-'}
                            </td>
                            <td className="px-2.5 py-2 text-center font-mono text-[11px]" dir="ltr">
                              {draft.packageNo || '-'}
                              {draft.packageItemNo ? ` / ${draft.packageItemNo}` : ''}
                            </td>
                            <td className="px-2.5 py-2 text-center font-mono text-[11px]" dir="ltr">
                              {draft.tagNo || '-'}
                            </td>
                            <td className="px-2.5 py-2 text-start text-[var(--text-primary)] max-w-[260px]">
                              <div className="line-clamp-2">{draft.description || '-'}</div>
                            </td>
                            <td className="px-2.5 py-2 text-center">{draft.uom || '-'}</td>
                            <td className="px-2.5 py-2 text-center font-semibold tabular-nums">
                              {draft.receivedQty}
                            </td>
                            <td className="px-2.5 py-2 text-center font-semibold tabular-nums">
                              {draft.deliveredQty}
                            </td>
                            <td className="px-2.5 py-2 text-center tabular-nums">
                              <div className="font-semibold">{draft.returnedQty}</div>
                              {draft.smrMapnaNo && (
                                <div className="text-[10px] font-mono text-[var(--text-tertiary)]" dir="ltr">
                                  {draft.smrMapnaNo}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  dir="ltr"
                                  data-testid={`bmr-mto-input-${idx}`}
                                  value={draft.mtoInput}
                                  onChange={(e) => updateRowDraft(draft.detailedId, 'mtoInput', e.target.value)}
                                  placeholder="—"
                                  className="w-24 h-8 px-2 text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                                />
                                {draft.mtoAutoMatched && (
                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                                    {isFa ? 'از برآورد' : 'From MTO'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                dir="ltr"
                                data-testid={`bmr-erected-input-${idx}`}
                                value={draft.erectedInput}
                                onChange={(e) => updateRowDraft(draft.detailedId, 'erectedInput', e.target.value)}
                                placeholder="—"
                                className="w-24 h-8 px-2 text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                              />
                            </td>
                            <td
                              data-testid={`bmr-balance-val-${idx}`}
                              dir="ltr"
                              className={`px-2.5 py-2 text-center font-extrabold tabular-nums ${
                                isSettled
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {formatQtyCell(item.balance)}
                            </td>
                            <td className="px-2.5 py-2 text-center">
                              <span
                                data-testid={`bmr-status-badge-${idx}`}
                                className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                  isSettled
                                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {localizeBalanceStatus(item.balanceStatus, isFa)}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {computedLineItems.length > 1 && (
                                <button
                                  type="button"
                                  title={isFa ? 'حذف ردیف از این فرم' : 'Remove row'}
                                  onClick={() => removeRowDraft(draft.detailedId)}
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-rose-600 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </StickyTableWrapper>
              </div>

              {/* Step 2 Action Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4">
                <button
                  type="button"
                  onClick={() => {
                    if (editingRecordId) {
                      resetWizard();
                      setViewMode('history');
                    } else {
                      setWizardStep(1);
                    }
                  }}
                  className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-bold text-[var(--text-primary)] flex items-center gap-2"
                >
                  {isFa ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  <span>
                    {editingRecordId
                      ? isFa
                        ? 'بازگشت به سابقه'
                        : 'Back to History'
                      : isFa
                        ? 'بازگشت به انتخاب اقلام'
                        : 'Back to Selection'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="bmr-submit-btn"
                  disabled={submitting || computedLineItems.length === 0}
                  onClick={() => void handleSubmit()}
                  className="h-10 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isFa
                        ? 'در حال صدور و ثبت...'
                        : 'Issuing...'
                      : editingRecordId
                        ? isFa
                          ? 'ذخیره ویرایش گزارش موازنه و پیش‌نمایش چاپ'
                          : 'Save BMR Changes & Preview'
                        : isFa
                          ? 'صدور گزارش موازنه، ثبت در جزئیات و پیش‌نمایش چاپ'
                          : 'Issue BMR, Sync Detailed & Preview'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORY VIEW */}
      {viewMode === 'history' && (
        <div className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3.5">
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {isFa ? 'تعداد گزارش‌های صادرشده' : 'Issued BMR Reports'}
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
                {historyMetrics.docs}
              </div>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3.5">
              <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {isFa ? 'کل ردیف‌های موازنه‌شده' : 'Total Balanced Rows'}
              </div>
              <div className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums mt-1">
                {historyMetrics.totalRows}
              </div>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3.5">
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {isFa ? 'ردیف‌های وضعیت اتمام (0)' : 'Completed Rows (0)'}
              </div>
              <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                {historyMetrics.settledRows}
              </div>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3.5">
              <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                {isFa ? 'ردیف‌های وضعیت بدهکار' : 'Debtor Rows'}
              </div>
              <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums mt-1">
                {historyMetrics.debtorRows}
              </div>
            </div>
          </div>

          {/* Search & Table Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
            <div className="p-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="w-full sm:w-80">
                <SearchInputWithClear
                  value={historySearch}
                  onChange={setHistorySearch}
                  placeholder={
                    isFa
                      ? 'جستجو بر اساس شماره BMR، پیمانکار، سیستم، تگ یا پکینگ...'
                      : 'Search by BMR No., contractor, system, tag, or PL...'
                  }
                />
              </div>
              <div className="text-xs text-[var(--text-secondary)] tabular-nums">
                {isFa ? `نمایش ${filteredHistory.length} گزارش` : `Showing ${filteredHistory.length} reports`}
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-xs text-[var(--text-secondary)]">
                {isFa ? 'در حال بارگذاری...' : 'Loading...'}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Scale className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {isFa ? 'هنوز گزارش موازنه‌ای صادر نشده است' : 'No BMR reports issued yet'}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {isFa
                    ? 'برای صدور اولین گزارش موازنه و کنترل مصرف مواد، به تب صدور گزارش جدید بروید.'
                    : 'Switch to New BMR Report to issue your first material balance report.'}
                </p>
              </div>
            ) : (
              <>
                <StickyTableWrapper className="max-h-[60vh]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                        <th className="px-3 py-2.5 text-center font-bold">#</th>
                        <th className="px-3 py-2.5 text-start font-bold">
                          {isFa ? 'شماره گزارش موازنه' : 'BMR No.'}
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">{isFa ? 'تاریخ' : 'Date'}</th>
                        <th className="px-3 py-2.5 text-start font-bold">
                          {isFa ? 'سیستم / جزیره / واحد' : 'System / Island / Unit'}
                        </th>
                        <th className="px-3 py-2.5 text-start font-bold">
                          {isFa ? 'پیمانکار نصب' : 'Installer Contractor'}
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          {isFa ? 'تعداد اقلام' : 'Items'}
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          {isFa ? 'نتیجه موازنه' : 'Balance Result'}
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          {isFa ? 'عملیات' : 'Actions'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {historyPagination.pageItems.map((rec, idx) => {
                        const settledCount = rec.items.filter(
                          (it) => it.balanceStatus === BMR_STATUS_SETTLED_FA,
                        ).length;
                        const debtorCount = rec.items.length - settledCount;
                        return (
                          <tr
                            key={rec.id}
                            data-testid={`bmr-history-row-${rec.bmrNo}`}
                            className="hover:bg-[var(--bg-subtle)]/40"
                          >
                            <td className="px-3 py-2.5 text-center tabular-nums text-[var(--text-secondary)]">
                              {(historyPagination.page - 1) * historyPagination.pageSize + idx + 1}
                            </td>
                            <td className="px-3 py-2.5 text-start font-mono font-bold text-[var(--text-primary)]" dir="ltr">
                              {rec.bmrNo}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-[var(--text-secondary)]">
                              {formatDate(rec.date)}
                            </td>
                            <td className="px-3 py-2.5 text-start text-[var(--text-primary)]">
                              {[rec.system, rec.island, rec.unit].filter(Boolean).join(' / ') || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-start text-[var(--text-primary)]">
                              {rec.installerContractor || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold tabular-nums">
                              {rec.items.length}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                                {settledCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold tabular-nums">
                                    {isFa ? `${settledCount} اتمام` : `${settledCount} Done`}
                                  </span>
                                )}
                                {debtorCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-500/12 text-rose-700 dark:text-rose-400 text-[11px] font-bold tabular-nums">
                                    {isFa ? `${debtorCount} بدهکار` : `${debtorCount} Debtor`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  data-testid={`bmr-row-print-${rec.id}`}
                                  title={isFa ? 'مشاهده و چاپ فرم رسمی' : 'View & Print Official Form'}
                                  aria-label={isFa ? 'مشاهده و چاپ فرم رسمی' : 'View & Print Official Form'}
                                  onClick={() => setPreviewRecord(rec)}
                                  className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-400 flex items-center justify-center text-[var(--text-secondary)] transition-colors"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <SignedScanRowButton
                                  signedScan={rec.signedScan}
                                  onClick={() => setScanTarget(rec)}
                                />
                                {canEdit && (
                                  <>
                                    <button
                                      type="button"
                                      data-testid={`bmr-row-edit-${rec.id}`}
                                      title={isFa ? 'ویرایش گزارش موازنه' : 'Edit BMR'}
                                      aria-label={isFa ? 'ویرایش گزارش موازنه' : 'Edit BMR'}
                                      onClick={() => handleStartEdit(rec)}
                                      className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-400 flex items-center justify-center text-[var(--text-secondary)] transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      data-testid={`bmr-row-delete-${rec.id}`}
                                      title={isFa ? 'حذف گزارش موازنه' : 'Delete BMR'}
                                      aria-label={isFa ? 'حذف گزارش موازنه' : 'Delete BMR'}
                                      onClick={() => setDeleteTarget(rec)}
                                      className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-rose-500/10 hover:text-rose-600 flex items-center justify-center text-[var(--text-secondary)] transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </StickyTableWrapper>

                <TablePaginationBar
                  page={historyPagination.page}
                  totalPages={historyPagination.totalPages}
                  pageSize={historyPagination.pageSize}
                  total={filteredHistory.length}
                  lang={prefs.language}
                  onPageChange={historyPagination.setPage}
                  onPageSizeChange={historyPagination.setPageSize}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* PRINT PREVIEW MODAL WITH POST-PRINT UNDO / REDO */}
      {previewRecord && (
        <div
          data-testid="bmr-print-preview-modal"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 no-print"
        >
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-[1160px] max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60">
              <div className="flex items-center gap-2 min-w-0">
                <Scale className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                  {isFa ? 'پیش‌نمایش فرم رسمی گزارش موازنه و کنترل مصرف مواد' : 'Official BMR Form Preview'}
                </span>
                <span
                  dir="ltr"
                  className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                >
                  {previewRecord.bmrNo}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      data-testid="bmr-preview-undo-btn"
                      disabled={historyBusy || !historyStatus.canUndo}
                      onClick={() => void handlePreviewUndo()}
                      title={isFa ? 'بازگردانی عملیات (Undo)' : 'Undo'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-40 text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'بازگردانی' : 'Undo'}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="bmr-preview-redo-btn"
                      disabled={historyBusy || !historyStatus.canRedo}
                      onClick={() => void handlePreviewRedo()}
                      title={isFa ? 'اجرای مجدد (Redo)' : 'Redo'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] disabled:opacity-40 text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'جلو بردن' : 'Redo'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  data-testid="bmr-print-btn"
                  onClick={handlePrintSheet}
                  className="h-8 px-3.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ متریال' : 'Print Material'}</span>
                </button>

                <button
                  type="button"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => setPreviewRecord(null)}
                  className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--text-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Undone Banner */}
            {!previewRecordExists && (
              <div
                data-testid="bmr-preview-undone-banner"
                className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center justify-between gap-2"
              >
                <span>
                  {isFa
                    ? 'این گزارش موازنه با دستور بازگردانی (Undo) از پایگاه داده برگردانده شد. برای بازیابی آن می‌توانید دکمه «جلو بردن (Redo)» را بزنید.'
                    : 'This BMR report was reverted via Undo. Click Redo to restore it.'}
                </span>
              </div>
            )}

            {/* Printable Preview Canvas */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900/70">
              <div className="mx-auto max-w-[1060px] bg-white shadow-lg p-5 sm:p-7 rounded-lg">
                <OfficialBmrSheet record={previewRecord} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ISOLATED PRINT PORTAL */}
      {previewRecord &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="samaan-bmr-print-root" className="hidden print:block">
            <style>{buildIsolatedPrintPortalCss('samaan-bmr-print-root', { orientation: 'landscape' })}</style>
            <OfficialBmrSheet record={previewRecord} />
          </div>,
          document.body,
        )}

      {/* SIGNED SCAN ARCHIVE MODAL */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="balance"
          recordId={scanTarget.id}
          recordLabel={`${isFa ? 'گزارش موازنه و کنترل مصرف مواد' : 'BMR'} — ${scanTarget.bmrNo}`}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={() => {
            void loadData();
            onDataChanged();
          }}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف گزارش موازنه و کنترل مصرف مواد' : 'Delete BMR Report'}
        itemLabel={deleteTarget?.bmrNo}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف گزارش موازنه «${deleteTarget.bmrNo}» اطمینان دارید؟ شماره و وضعیت بالانس متریال برای ردیف‌های مرتبط در جدول جزئیات نیز به‌روزرسانی/پاک‌سازی خواهد شد.`
              : `Are you sure you want to delete BMR "${deleteTarget.bmrNo}"? Linked material balance columns in Detailed Equipment will also be updated/cleared.`
            : ''
        }
        confirmLabel={isFa ? 'حذف گزارش' : 'Delete Report'}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* HISTORY TABLE PRINT REPORT MODAL */}
      <PrintReportModal
        open={reportPrintOpen}
        onClose={() => setReportPrintOpen(false)}
        title={isFa ? 'گزارش فهرست گزارش‌های موازنه و کنترل مصرف مواد (BMR)' : 'Balance of Material Reports List'}
        rows={filteredHistory}
        columns={reportPrintColumns}
      />
    </div>
  );
};
