import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CornerUpLeft,
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
import { getTodayIso } from '../shared/jalali.ts';
import { formatHeaderProjectTitle } from '../shared/opiInvitation.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import {
  buildSmrHeaderAutoFill,
  generateSmrDocNo,
  getSmrMaxReturnQty,
  MD1_SMR_COMPANY_NAME,
  MD1_SMR_COPY_TEXT,
  MD1_SMR_FORM_CODE,
  MD1_SMR_QA_NOTICE,
  MD1_SMR_TITLE_EN,
  MD1_SMR_TITLE_FA,
  resolveSmrRowReason,
  validateSmrReturnQty,
  type SmrReasonMode,
  type SmrWarehouseTarget,
} from '../shared/smr.ts';
import type {
  DetailedComputed,
  DocumentLineItem,
  GeneralEntry,
  MivDocType,
  MivDocumentRecord,
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

interface MivApiResponse {
  documents: MivDocumentRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  packings?: string[];
  totalDetailedCount?: number;
}

interface SmrViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface OfficialSmrSheetProps {
  doc: MivDocumentRecord;
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  formatDate: (iso: string) => string;
}

export const OfficialSmrSheet: React.FC<OfficialSmrSheetProps> = ({
  doc,
  detailedItems,
  generalEntries = [],
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'smr');
  const isMd1Default = activeEmployer.id === 'mapna-md1' && !design.template;
  const formCode = isMd1Default ? MD1_SMR_FORM_CODE : design.docCode || MD1_SMR_FORM_CODE;

  const effectiveDesign = useMemo(
    () =>
      isMd1Default
        ? {
            ...design,
            companyTitle: MD1_SMR_COMPANY_NAME,
            titleFa: MD1_SMR_TITLE_FA,
            titleEn: MD1_SMR_TITLE_EN,
            docCode: MD1_SMR_FORM_CODE,
            footerCopyText: MD1_SMR_COPY_TEXT,
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
    return buildSmrHeaderAutoFill(matched, generalEntries, activeProject, doc.date);
  }, [doc.items, doc.date, detailedById, generalEntries, activeProject]);

  const resolvedPurchasePkg = (doc.purchasePackageNo || '').trim() || fallbackHeader.purchasePackageNo;
  const resolvedSupplier = (doc.supplier || '').trim() || fallbackHeader.supplier;
  const resolvedIsland = (doc.islandSystem || '').trim() || fallbackHeader.island;
  const resolvedInstaller = (doc.party || '').trim() || fallbackHeader.installerContractor;
  const resolvedReleaseNote = (doc.releaseNoteNo || '').trim() || fallbackHeader.releaseNoteNo;

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, doc.items.length);
  const paddedRows: (DocumentLineItem | null)[] = [
    ...doc.items,
    ...Array.from({ length: Math.max(0, totalDisplayRows - doc.items.length) }, () => null),
  ];

  return (
    <div
      dir="rtl"
      data-testid="official-smr-sheet"
      className={effectiveDesign.orientation === 'portrait' ? 'samaan-a4-portrait' : 'samaan-a4-landscape'}
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
        />
        <OfficialExtraMetaStrip
          design={effectiveDesign}
          inset
          borderColor={effectiveDesign.accentColor}
        />

        {/* Metadata Strip Row 1 (3 bordered cells RTL: شماره بسته خرید | تامین کننده | جزیره) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '34.2% 31.4% 34.4%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {resolvedPurchasePkg}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{resolvedSupplier}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{resolvedIsland}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (4 bordered cells RTL: پیمانکار نصب | Realised Note No. | SMR No. | SMR Date) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '24.5% 25.5% 24% 26%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            minHeight: '34px',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'right' }}>
            <strong style={{ fontWeight: 700 }}>پیمانکار نصب: </strong>
            <span className="bidi-plaintext">{resolvedInstaller}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>Realised Note No.: </strong>
            <span className="tabular-nums">{resolvedReleaseNote}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>SMR No.: </strong>
            <span className="tabular-nums" style={{ fontWeight: 700 }}>
              {doc.docNo}
            </span>
          </div>
          <div dir="ltr" style={{ padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>SMR Date: </strong>
            <span className="tabular-nums">{formatDate(doc.date)}</span>
          </div>
        </div>

        {/* 9-Column LTR Table matching MD1EX-FQP02/08-03 verbatim */}
        <table
          dir="ltr"
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.3px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#ffffff', fontWeight: 700 }}>
              <th className="samaan-col-compact" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Item No.
              </th>
              <th className="samaan-col-code" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Packing List No.
              </th>
              <th className="samaan-col-code" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Package item.
              </th>
              <th className="samaan-col-code" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Tag No.
              </th>
              <th className="samaan-col-fluid" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 6px', fontSize: '10px' }}>
                شرح
              </th>
              <th className="samaan-col-compact" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                UOM
              </th>
              <th className="samaan-col-compact" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Returned Quantity
              </th>
              <th className="samaan-col-code" style={{ borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 4px', lineHeight: 1.35 }}>
                <div>دلیل عودت</div>
                <div>(ارجاع)</div>
              </th>
              <th className="samaan-col-fluid" style={{ borderBottom: '1px solid #000000', padding: '5px 6px', fontSize: '10px' }}>
                توضیحات
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => {
              const detailed = row ? detailedById.get(row.detailedId) : undefined;
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              const pkgItemText = row ? (row.itemNo || row.packageNo || '').trim() : '';
              const tagText = row ? row.tagNo || detailed?.itemCode || '' : '';
              const uomText = row ? row.uom || detailed?.countingUnit || '' : '';
              const reasonText = row ? row.returnReason || '' : '';
              const remarkText = row
                ? row.remark || (idx === 0 && doc.notes ? doc.notes : '')
                : '';

              return (
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`}>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {row ? idx + 1 : '\u00A0'}
                  </td>
                  <td
                    className="tabular-nums samaan-col-code"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {row?.shipmentNo || ''}
                  </td>
                  <td
                    className="tabular-nums samaan-col-code"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {pkgItemText}
                  </td>
                  <td
                    className="tabular-nums samaan-col-code"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {tagText}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-fluid"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 6px' }}
                  >
                    {row?.description || ''}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-compact"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {uomText}
                  </td>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px', fontWeight: 700 }}
                  >
                    {row ? row.qty : ''}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-code"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 4px' }}
                  >
                    {reasonText}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-fluid"
                    style={{ borderBottom: rowBottomBorder, padding: '4px 6px' }}
                  >
                    {remarkText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Separate Lower Approval Frame */}
      <div className="samaan-keep-together" style={{ border: '1.8px solid #000000', marginTop: '10px' }}>
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

        {/* 5 Equal Approval Boxes RTL */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            minHeight: '80px',
            borderBottom: '1px solid #000000',
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
              <div style={{ fontWeight: 700 }}>
                {isMd1Default ? 'تأمین تجهیزات توسعه یک:' : `${activeEmployer.equipmentSupplyLabel}:`}
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.equipmentSupply || ''}
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
              <div style={{ fontWeight: 700 }}>دفتر فنی:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.techOffice || ''}
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
              <div style={{ fontWeight: 700 }}>QC:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.qcInspector || ''}
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
              <div style={{ fontWeight: 700 }}>پیمانکار نصب:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {[doc.installerRep || resolvedInstaller, doc.deliveredBy ? `تحویل آورنده: ${doc.deliveredBy}` : '']
                .filter(Boolean)
                .join(' — ')}
            </div>
          </div>
        </div>

        {(effectiveDesign.template?.signatures?.length || !effectiveDesign.showSignatures) && (
          <OfficialFormSignatures
            signatures={effectiveDesign.signatures}
            showSignatures={effectiveDesign.showSignatures}
            borderColor={effectiveDesign.accentColor}
          />
        )}

        {/* Right-aligned QA Control Notice */}
        <div
          dir="rtl"
          style={{
            padding: '4px 10px',
            fontSize: '8.5px',
            fontWeight: 700,
            textAlign: 'right',
          }}
        >
          {effectiveDesign.template?.introText || MD1_SMR_QA_NOTICE}
        </div>
      </div>

      {/* Boxed Bottom Footer Strip */}
      <div
        style={{
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          border: '1px solid #000000',
          fontSize: '9px',
          fontWeight: 700,
        }}
      >
        <div>{effectiveDesign.template?.footerCopyText || MD1_SMR_COPY_TEXT}</div>
        {(formCode || effectiveDesign.revisionText) && (
          <div dir="ltr" className="tabular-nums">
            {[formCode, effectiveDesign.revisionText].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
};

export const SmrView: React.FC<SmrViewProps> = ({ refreshSignal, onDataChanged }) => {
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
    refreshHistoryStatus,
  } = useApp();
  const canUndo = historyStatus.canUndo && !historyBusy;
  const canRedo = historyStatus.canRedo && !historyBusy;
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const formCode = getEmployerFormCode(activeEmployer, '08-03');

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<MivApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: Target warehouse FIRST + Detailed row selection
  const [docType, setDocType] = useState<SmrWarehouseTarget>('smr_mapna');
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});

  // Step 2: Quantities, Reason Mode (shared vs per-row), Remarks, Optional Header Overrides
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [reasonMode, setReasonMode] = useState<SmrReasonMode>('shared');
  const [sharedReason, setSharedReason] = useState('');
  const [perRowReasonMap, setPerRowReasonMap] = useState<Record<string, string>>({});
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});

  const [docNo, setDocNo] = useState('');
  const [docNoTouched, setDocNoTouched] = useState(false);
  const [date, setDate] = useState(getTodayIso());
  const [showHeaderOverrides, setShowHeaderOverrides] = useState(false);

  const [supplierOverride, setSupplierOverride] = useState('');
  const [purchasePkgOverride, setPurchasePkgOverride] = useState('');
  const [islandOverride, setIslandOverride] = useState('');
  const [installerOverride, setInstallerOverride] = useState('');
  const [releaseNoteOverride, setReleaseNoteOverride] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [storekeeper, setStorekeeper] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [techOffice, setTechOffice] = useState('');
  const [qcInspector, setQcInspector] = useState('');
  const [installerRep, setInstallerRep] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit / History / Print / Scan states
  const [editingDoc, setEditingDoc] = useState<MivDocumentRecord | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MivDocumentRecord | null>(null);
  const [printDoc, setPrintDoc] = useState<MivDocumentRecord | null>(null);
  const [scanTarget, setScanTarget] = useState<MivDocumentRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<MivApiResponse>('/api/miv');
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

  const smrDocuments = useMemo(
    () => (data?.documents || []).filter((d) => d.docType.startsWith('smr_')),
    [data],
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return smrDocuments;
    return smrDocuments.filter((doc) =>
      [
        doc.docNo,
        doc.party,
        doc.supplier,
        doc.purchasePackageNo,
        doc.islandSystem,
        doc.releaseNoteNo,
        doc.deliveredBy,
        doc.notes,
        ...doc.items.map((it) => `${it.shipmentNo} ${it.packageNo} ${it.itemNo} ${it.description}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [smrDocuments, historySearch]);

  const smrPagination = useClientPagination(filteredHistory, 25);

  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const autoHeader = useMemo(
    () => buildSmrHeaderAutoFill(selectedList, data?.generalEntries || [], activeProject, date),
    [selectedList, data?.generalEntries, activeProject, date],
  );

  const effectiveSupplier = supplierOverride.trim() || autoHeader.supplier;
  const effectivePurchasePkg = purchasePkgOverride.trim() || autoHeader.purchasePackageNo;
  const effectiveIsland = islandOverride.trim() || autoHeader.island;
  const effectiveInstaller = installerOverride.trim() || autoHeader.installerContractor;
  const effectiveReleaseNote = releaseNoteOverride.trim() || autoHeader.releaseNoteNo;

  const suggestedDocNo = useMemo(
    () =>
      generateSmrDocNo(
        effectiveInstaller,
        smrDocuments.map((d) => d.docNo),
        activeProject,
      ),
    [effectiveInstaller, smrDocuments, activeProject],
  );

  useEffect(() => {
    if (!editingDoc && !docNoTouched && suggestedDocNo) {
      setDocNo(suggestedDocNo);
    }
  }, [editingDoc, docNoTouched, suggestedDocNo]);

  // Keep print preview synced with live DB (so post-print Undo/Redo immediately reflects!)
  const printDocWasUndone = useMemo(() => {
    if (!printDoc || !data) return false;
    return !data.documents.some((d) => d.id === printDoc.id);
  }, [printDoc, data]);

  useEffect(() => {
    if (!printDoc || !data) return;
    const fresh = data.documents.find((d) => d.id === printDoc.id);
    if (fresh && fresh !== printDoc) {
      setPrintDoc(fresh);
    }
  }, [data, printDoc]);

  const docTypeLabel = useCallback(
    (type: MivDocType) => {
      if (type === 'smr_contractor') {
        return isFa ? 'انبار پیمانکار' : 'Contractor Warehouse';
      }
      return isFa
        ? `انبار کارفرما (${activeEmployer.isConfigured ? activeEmployer.shortName : 'اصلی'})`
        : 'Employer / Main Warehouse';
    },
    [isFa, activeEmployer.isConfigured, activeEmployer.shortName],
  );

  const handleToggleRow = useCallback((item: DetailedComputed) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = item;
        setQtyMap((qPrev) => {
          if (qPrev[item.id] !== undefined) return qPrev;
          const maxQty = getSmrMaxReturnQty(item);
          return { ...qPrev, [item.id]: maxQty > 0 ? String(maxQty) : '1' };
        });
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
        for (const r of rows) {
          next[r.id] = r;
        }
      }
      return next;
    });
    if (!allSelected) {
      setQtyMap((qPrev) => {
        const next = { ...qPrev };
        for (const r of rows) {
          if (next[r.id] === undefined) {
            const maxQty = getSmrMaxReturnQty(r);
            next[r.id] = maxQty > 0 ? String(maxQty) : '1';
          }
        }
        return next;
      });
    }
  }, []);

  const resetWizard = () => {
    setEditingDoc(null);
    setStep(1);
    setSelectedMap({});
    setQtyMap({});
    setReasonMode('shared');
    setSharedReason('');
    setPerRowReasonMap({});
    setRemarkMap({});
    setDocNo('');
    setDocNoTouched(false);
    setDate(getTodayIso());
    setShowHeaderOverrides(false);
    setSupplierOverride('');
    setPurchasePkgOverride('');
    setIslandOverride('');
    setInstallerOverride('');
    setReleaseNoteOverride('');
    setDeliveredBy('');
    setStorekeeper('');
    setEquipmentSupply('');
    setTechOffice('');
    setQcInspector('');
    setInstallerRep('');
    setNotes('');
  };

  const startEdit = (doc: MivDocumentRecord) => {
    setViewMode('create');
    setEditingDoc(doc);
    setDocType(doc.docType === 'smr_contractor' ? 'smr_contractor' : 'smr_mapna');
    setStep(2);
    setDocNo(doc.docNo);
    setDocNoTouched(true);
    setDate(doc.date || getTodayIso());
    setSupplierOverride(doc.supplier || '');
    setPurchasePkgOverride(doc.purchasePackageNo || '');
    setIslandOverride(doc.islandSystem || '');
    setInstallerOverride(doc.party || '');
    setReleaseNoteOverride(doc.releaseNoteNo || '');
    setDeliveredBy(doc.deliveredBy || '');
    setStorekeeper(doc.storekeeper || '');
    setEquipmentSupply(doc.equipmentSupply || '');
    setTechOffice(doc.techOffice || '');
    setQcInspector(doc.qcInspector || '');
    setInstallerRep(doc.installerRep || '');
    setNotes(doc.notes || '');

    const detById = new Map((data?.detailedItems || []).map((d) => [d.id, d]));
    const nextSel: Record<string, DetailedComputed> = {};
    const nextQty: Record<string, string> = {};
    const nextReasons: Record<string, string> = {};
    const nextRemarks: Record<string, string> = {};
    const uniqueReasons = new Set<string>();

    for (const it of doc.items) {
      const det = detById.get(it.detailedId);
      if (det) nextSel[det.id] = det;
      nextQty[it.detailedId] = String(it.qty);
      const r = (it.returnReason || '').trim();
      if (r) {
        nextReasons[it.detailedId] = r;
        uniqueReasons.add(r);
      }
      if (it.remark) nextRemarks[it.detailedId] = it.remark;
    }

    setSelectedMap(nextSel);
    setQtyMap(nextQty);
    setRemarkMap(nextRemarks);
    if (uniqueReasons.size <= 1) {
      setReasonMode('shared');
      setSharedReason(Array.from(uniqueReasons)[0] || '');
      setPerRowReasonMap(nextReasons);
    } else {
      setReasonMode('per_row');
      setSharedReason('');
      setPerRowReasonMap(nextReasons);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Validate all selected rows live
  const rowValidations = useMemo(() => {
    const map: Record<string, ReturnType<typeof validateSmrReturnQty>> = {};
    for (const row of selectedList) {
      const qty = Number(qtyMap[row.id]);
      map[row.id] = validateSmrReturnQty(qty, row);
    }
    return map;
  }, [selectedList, qtyMap]);

  const hasQtyErrors = useMemo(
    () => selectedList.some((row) => !rowValidations[row.id]?.ok),
    [selectedList, rowValidations],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedList.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم از جدول جزئیات تجهیزات انتخاب کنید.' : 'Select at least one Detailed item.');
      return;
    }

    for (const row of selectedList) {
      const check = rowValidations[row.id];
      if (!check?.ok) {
        notify('error', isFa ? check.errorFa || 'مقدار برگشتی نامعتبر است.' : check.errorEn || 'Invalid return quantity.');
        return;
      }
    }

    const cleanDocNo = docNo.trim() || suggestedDocNo;
    if (!cleanDocNo) {
      notify('error', isFa ? 'شماره فرم ارجاع (SMR No.) الزامی است.' : 'SMR No. is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payloadItems = selectedList.map((row) => ({
        detailedId: row.id,
        qty: Number(qtyMap[row.id]),
        tagNo: row.itemCode || '',
        uom: row.countingUnit || '',
        returnReason: resolveSmrRowReason(reasonMode, sharedReason, perRowReasonMap, row.id),
        remark: (remarkMap[row.id] || '').trim(),
      }));

      const payload = {
        docType,
        docNo: cleanDocNo,
        date,
        party: effectiveInstaller,
        projectName: activeProject?.name || '',
        purchasePackageNo: effectivePurchasePkg,
        supplier: effectiveSupplier,
        islandSystem: effectiveIsland,
        releaseNoteNo: effectiveReleaseNote,
        storekeeper: storekeeper.trim(),
        equipmentSupply: equipmentSupply.trim(),
        techOffice: techOffice.trim(),
        qcInspector: qcInspector.trim(),
        installerRep: installerRep.trim() || effectiveInstaller,
        deliveredBy: deliveredBy.trim(),
        notes: notes.trim(),
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
            ? `فرم ارجاع شماره ${res.document.docNo} ویرایش و در جدول جزئیات تجهیزات به‌روزرسانی شد.`
            : `SMR ${res.document.docNo} updated.`
          : isFa
            ? `فرم ارجاع شماره ${res.document.docNo} صادر و در جدول جزئیات تجهیزات ثبت شد.`
            : `SMR ${res.document.docNo} issued and synced to Detailed Equipment.`,
      );
      resetWizard();
      setPrintDoc(res.document);
      triggerAutoSnapshot(`${editingDoc ? 'Edit ' : ''}SMR ${res.document.docNo}`);
      onDataChanged();
      await Promise.all([loadData(), refreshHistoryStatus()]);
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
          ? `فرم ارجاع شماره ${deleteTarget.docNo} حذف و موجودی اقلام بازگردانی شد.`
          : `SMR ${deleteTarget.docNo} deleted.`,
      );
      if (editingDoc?.id === deleteTarget.id) resetWizard();
      if (printDoc?.id === deleteTarget.id) setPrintDoc(null);
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete SMR ${deleteTarget.docNo}`);
      onDataChanged();
      await Promise.all([loadData(), refreshHistoryStatus()]);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handlePreviewUndo = async () => {
    const ok = await performUndo();
    if (ok) {
      onDataChanged();
      await loadData();
    }
  };

  const handlePreviewRedo = async () => {
    const ok = await performRedo();
    if (ok) {
      onDataChanged();
      await loadData();
    }
  };

  const historyColumns = useMemo<PrintColumnDef<MivDocumentRecord>[]>(
    () => [
      { key: 'docNo', header: 'SMR No.', getValue: (r) => r.docNo },
      { key: 'date', header: 'SMR Date', isDate: true, getValue: (r) => r.date },
      { key: 'docType', header: isFa ? 'انبار مقصد' : 'Target Warehouse', getValue: (r) => docTypeLabel(r.docType) },
      { key: 'purchasePackageNo', header: isFa ? 'شماره بسته خرید' : 'Purchase Package', getValue: (r) => r.purchasePackageNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'islandSystem', header: isFa ? 'جزیره' : 'Island', getValue: (r) => r.islandSystem || '' },
      { key: 'party', header: isFa ? 'پیمانکار نصب' : 'Installer', getValue: (r) => r.party || '' },
      { key: 'releaseNoteNo', header: 'Realised Note No.', getValue: (r) => r.releaseNoteNo || '' },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => r.items.length },
    ],
    [isFa, docTypeLabel, t.headers.supplier],
  );

  return (
    <div className="space-y-5 samaan-animate-in">
      {/* Isolated A4 Landscape Portal for Official MD1EX-FQP02/08-03 SMR Sheet */}
      {printDoc && !printReportOpen
        ? createPortal(
            <div id="samaan-smr-print-root" data-samaan-print-portal="true">
              <style>
                {buildIsolatedPrintPortalCss('samaan-smr-print-root', {
                  orientation: 'landscape',
                  isFa,
                  marginMm: 8,
                  extraPrintCss: `
                    #samaan-smr-print-root table th,
                    #samaan-smr-print-root table td {
                      text-align: center;
                      vertical-align: middle;
                    }
                  `,
                })}
              </style>
              <OfficialSmrSheet
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
            <CornerUpLeft className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {isFa ? MD1_SMR_TITLE_FA : MD1_SMR_TITLE_EN}
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                {formCode}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {isFa
                ? 'انتخاب انبار مقصد (کارفرما / پیمانکار)، فیلتر اقلام از جزئیات تجهیزات و صدور فرم رسمی A4 افقی ارجاع قطعات مازاد'
                : 'Choose target warehouse, filter Detailed Equipment items, and issue official A4 Landscape SMR form'}
            </p>
          </div>
        </div>

        <OperationalViewModeTabs
          viewMode={viewMode}
          onChange={setViewMode}
          historyCount={smrDocuments.length}
          isFa={isFa}
          canCreate={canEdit}
          isEditing={Boolean(editingDoc)}
          testIdPrefix="smr"
        />
      </div>

      {/* CREATE / EDIT 2-STEP WIZARD */}
      {canEdit && viewMode === 'create' && (
        <div className="space-y-4">
          {/* Stepper Indicator */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setStep(1)}
                data-testid="smr-step-1-tab"
                className={`h-8 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                  step === 1
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="tabular-nums">{isFa ? '۱' : '1'}</span>
                <span>{isFa ? 'انبار مقصد و انتخاب اقلام جزئیات' : 'Warehouse & Select Detailed Items'}</span>
              </button>
              <span className="text-[var(--text-muted)]">{isFa ? '←' : '→'}</span>
              <button
                type="button"
                disabled={selectedList.length === 0}
                onClick={() => selectedList.length > 0 && setStep(2)}
                data-testid="smr-step-2-tab"
                className={`h-8 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                  step === 2
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="tabular-nums">{isFa ? '۲' : '2'}</span>
                <span>{isFa ? 'تعداد برگشتی، دلیل عودت و صدور فرم' : 'Quantities, Return Reason & Issue'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {editingDoc && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold tabular-nums">
                  {isFa ? `در حال ویرایش: ${editingDoc.docNo}` : `Editing: ${editingDoc.docNo}`}
                </span>
              )}
              {(selectedList.length > 0 || editingDoc) && (
                <button
                  type="button"
                  onClick={resetWizard}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1 text-[var(--text-secondary)]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isFa ? 'شروع مجدد' : 'Reset'}</span>
                </button>
              )}
            </div>
          </div>

          {/* STEP 1: Target Warehouse FIRST + Detailed Picker */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Target Warehouse Chooser */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {isFa
                    ? 'گام اول: متریال مازاد به کدام انبار عودت (برگشت) داده می‌شود؟ *'
                    : 'First: Which warehouse is the surplus material being returned to? *'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="smr-target-mapna"
                    onClick={() => setDocType('smr_mapna')}
                    className={`text-start p-3.5 rounded-xl border transition-all ${
                      docType === 'smr_mapna'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {isFa
                          ? `برگشت به انبار کارفرما (${activeEmployer.isConfigured ? activeEmployer.shortName : 'اصلی'})`
                          : 'Return to Employer / Main Warehouse'}
                      </span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          docType === 'smr_mapna'
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                            : 'border-[var(--border-strong)]'
                        }`}
                      >
                        {docType === 'smr_mapna' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      {isFa
                        ? 'ثبت خودکار در ستون‌های «شماره برگشتی به انبار کارفرما» و «تعداد برگشتی به انبار کارفرما» در بخش جزئیات تجهیزات'
                        : 'Syncs to Employer Warehouse Return No. and Return Quantity in Detailed Equipment'}
                    </p>
                  </button>

                  <button
                    type="button"
                    data-testid="smr-target-contractor"
                    onClick={() => setDocType('smr_contractor')}
                    className={`text-start p-3.5 rounded-xl border transition-all ${
                      docType === 'smr_contractor'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        {isFa ? 'برگشت به انبار پیمانکار' : 'Return to Contractor Warehouse'}
                      </span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          docType === 'smr_contractor'
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                            : 'border-[var(--border-strong)]'
                        }`}
                      >
                        {docType === 'smr_contractor' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      {isFa
                        ? 'ثبت خودکار در ستون‌های «شماره برگشتی به انبار پیمانکار» و «تعداد برگشتی به انبار پیمانکار» در بخش جزئیات تجهیزات'
                        : 'Syncs to Contractor Warehouse Return No. and Return Quantity in Detailed Equipment'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Detailed Equipment Filterable Picker */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? 'گام دوم: فیلتر و انتخاب ردیف‌های مورد نظر از بخش جزئیات تجهیزات'
                      : 'Filter & Select Items from Detailed Equipment'}
                  </div>
                  <button
                    type="button"
                    disabled={selectedList.length === 0}
                    onClick={() => setStep(2)}
                    data-testid="smr-next-step-btn"
                    className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <span>
                      {isFa
                        ? `ادامه با ${selectedList.length.toLocaleString('fa-IR')} قلم انتخابی`
                        : `Continue (${selectedList.length} selected)`}
                    </span>
                    {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>

                <SubstitutionItemPicker
                  refreshSignal={refreshSignal}
                  selectedMap={selectedMap}
                  onToggleRow={handleToggleRow}
                  onTogglePage={handleTogglePage}
                  testIdPrefix="smr-picker"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Returned Quantities, Shared/Per-Row Reason, Auto-Filled Header & Submit */}
          {step === 2 && (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
            >
              {/* Top Strip: Target Warehouse Badge, SMR No., SMR Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="p-3 rounded-xl border border-[var(--accent-primary)]/35 bg-[var(--accent-soft)] flex flex-col justify-between">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {isFa ? 'انبار مقصد عودت' : 'Target Warehouse'}
                  </div>
                  <div className="text-xs font-bold text-[var(--accent-primary)] mt-1">
                    {docTypeLabel(docType)}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="block text-xs font-bold text-[var(--text-primary)]">
                      SMR No. *
                    </label>
                    {!editingDoc && (
                      <button
                        type="button"
                        onClick={() => {
                          setDocNo(suggestedDocNo);
                          setDocNoTouched(false);
                        }}
                        className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline tabular-nums"
                        dir="ltr"
                      >
                        {suggestedDocNo}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    data-testid="smr-doc-no-input"
                    value={docNo}
                    onChange={(e) => {
                      setDocNo(e.target.value);
                      setDocNoTouched(true);
                    }}
                    placeholder={suggestedDocNo}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-mono tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <JalaliDateInput
                  label="SMR Date *"
                  value={date}
                  onChange={setDate}
                />
              </div>

              {/* Return Reason Mode Toggle: Shared vs Per-Row */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? 'نحوه ثبت «دلیل عودت (ارجاع)»:' : 'Return Reason Mode:'}
                  </span>
                  <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 text-xs">
                    <button
                      type="button"
                      data-testid="smr-reason-mode-shared"
                      onClick={() => setReasonMode('shared')}
                      className={`h-7 px-3 rounded-md font-semibold transition-colors ${
                        reasonMode === 'shared'
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {isFa ? 'دلیل مشترک برای تمام ردیف‌ها' : 'Same Reason for All Rows'}
                    </button>
                    <button
                      type="button"
                      data-testid="smr-reason-mode-per-row"
                      onClick={() => setReasonMode('per_row')}
                      className={`h-7 px-3 rounded-md font-semibold transition-colors ${
                        reasonMode === 'per_row'
                          ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {isFa ? 'دلیل جداگانه برای هر ردیف' : 'Separate Reason per Row'}
                    </button>
                  </div>
                </div>

                {reasonMode === 'shared' && (
                  <input
                    type="text"
                    data-testid="smr-shared-reason-input"
                    value={sharedReason}
                    onChange={(e) => setSharedReason(e.target.value)}
                    placeholder={
                      isFa
                        ? 'دلیل عودت مشترک (مثال: مازاد بر نیاز اجرایی، تغییر نقشه، عدم انطباق...)'
                        : 'Shared return reason (e.g., Surplus after installation, Drawing revision...)'
                    }
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                )}
              </div>

              {/* Auto-Filled Header Preview + Collapsible Overrides */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? 'مشخصات سربرگ (فراخوانی خودکار از بخش کلی و جزئیات تجهیزات)'
                      : 'Header Fields (Auto-filled from General & Detailed Equipment)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHeaderOverrides((v) => !v)}
                    className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                  >
                    {showHeaderOverrides ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{isFa ? 'ویرایش سربرگ و امضاءکنندگان (اختیاری)' : 'Edit Header & Signatories'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'تامین‌کننده' : 'Supplier'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveSupplier || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'شماره بسته خرید' : 'Purchase Pkg'}</div>
                    <div className="font-semibold mt-0.5 tabular-nums truncate" dir="ltr">
                      {effectivePurchasePkg || '—'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'جزیره' : 'Island'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveIsland || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'پیمانکار نصب' : 'Installer'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveInstaller || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">Realised Note No.</div>
                    <div className="font-semibold mt-0.5 tabular-nums truncate" dir="ltr">
                      {effectiveReleaseNote || '—'}
                    </div>
                  </div>
                </div>

                {showHeaderOverrides && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'پیمانکار نصب' : 'Installer Contractor'}
                      </label>
                      <input
                        type="text"
                        value={installerOverride}
                        onChange={(e) => setInstallerOverride(e.target.value)}
                        placeholder={autoHeader.installerContractor || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'تامین‌کننده' : 'Supplier'}
                      </label>
                      <input
                        type="text"
                        value={supplierOverride}
                        onChange={(e) => setSupplierOverride(e.target.value)}
                        placeholder={autoHeader.supplier || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شماره بسته خرید' : 'Purchase Package No.'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={purchasePkgOverride}
                        onChange={(e) => setPurchasePkgOverride(e.target.value)}
                        placeholder={autoHeader.purchasePackageNo || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'جزیره' : 'Island'}
                      </label>
                      <input
                        type="text"
                        value={islandOverride}
                        onChange={(e) => setIslandOverride(e.target.value)}
                        placeholder={autoHeader.island || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Realised Note No.
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={releaseNoteOverride}
                        onChange={(e) => setReleaseNoteOverride(e.target.value)}
                        placeholder={autoHeader.releaseNoteNo || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نام تحویل آورنده' : 'Returned By'}
                      </label>
                      <input
                        type="text"
                        value={deliveredBy}
                        onChange={(e) => setDeliveredBy(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'انباردار' : 'Storekeeper'}
                      </label>
                      <input
                        type="text"
                        value={storekeeper}
                        onChange={(e) => setStorekeeper(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'تأمین تجهیزات توسعه یک' : 'Equipment Supply'}
                      </label>
                      <input
                        type="text"
                        value={equipmentSupply}
                        onChange={(e) => setEquipmentSupply(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'دفتر فنی' : 'Technical Office'}
                      </label>
                      <input
                        type="text"
                        value={techOffice}
                        onChange={(e) => setTechOffice(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        QC
                      </label>
                      <input
                        type="text"
                        value={qcInspector}
                        onChange={(e) => setQcInspector(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نماینده پیمانکار نصب' : 'Installer Rep'}
                      </label>
                      <input
                        type="text"
                        value={installerRep}
                        onChange={(e) => setInstallerRep(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'توضیحات کلی' : 'General Notes'}
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Items Table: Returned Qty (validated <= actualQty), Per-Row Reason (if per_row), Remarks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `اقلام انتخاب‌شده برای ارجاع (${selectedList.length.toLocaleString('fa-IR')} قلم)`
                      : `Selected Items to Return (${selectedList.length})`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                  >
                    {isFa ? 'تغییر انتخاب اقلام' : 'Modify Selection'}
                  </button>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2 px-2.5 text-center w-9">#</th>
                        <th className="py-2 px-2.5 text-start">Packing List No.</th>
                        <th className="py-2 px-2.5 text-center">Package item.</th>
                        <th className="py-2 px-2.5 text-start">Tag No.</th>
                        <th className="py-2 px-2.5 text-start">{isFa ? 'شرح' : 'Description'}</th>
                        <th className="py-2 px-2.5 text-center">UOM</th>
                        <th className="py-2 px-2.5 text-center">{isFa ? 'مقدار واقعی' : 'Actual Qty'}</th>
                        <th className="py-2 px-2.5 text-center min-w-[130px]">Returned Qty *</th>
                        {reasonMode === 'per_row' && (
                          <th className="py-2 px-2.5 text-start min-w-[175px]">
                            {isFa ? 'دلیل عودت (ارجاع)' : 'Return Reason'}
                          </th>
                        )}
                        <th className="py-2 px-2.5 text-start min-w-[170px]">
                          {isFa ? 'توضیحات (اختیاری)' : 'Remarks'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {selectedList.map((row, idx) => {
                        const maxQty = getSmrMaxReturnQty(row);
                        const validation = rowValidations[row.id];
                        const isInvalid = validation && !validation.ok;
                        return (
                          <tr key={row.id} className={isInvalid ? 'bg-[var(--status-danger-bg)]/40' : ''}>
                            <td className="py-2 px-2.5 text-center tabular-nums">{idx + 1}</td>
                            <td className="py-2 px-2.5 font-mono tabular-nums" dir="ltr">
                              {row.shipmentNo || '—'}
                            </td>
                            <td className="py-2 px-2.5 text-center font-mono tabular-nums" dir="ltr">
                              {row.itemNo || row.packageNo || '—'}
                            </td>
                            <td className="py-2 px-2.5 font-mono tabular-nums" dir="ltr">
                              {row.itemCode || '—'}
                            </td>
                            <td className="py-2 px-2.5 font-medium max-w-[210px] truncate" title={row.description}>
                              {row.description || row.generalDescription || '—'}
                            </td>
                            <td className="py-2 px-2.5 text-center">{row.countingUnit || '—'}</td>
                            <td className="py-2 px-2.5 text-center font-semibold tabular-nums" dir="ltr">
                              {maxQty}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="number"
                                step="any"
                                min="0.0001"
                                max={maxQty > 0 ? maxQty : undefined}
                                dir="ltr"
                                data-testid={`smr-qty-input-${idx}`}
                                value={qtyMap[row.id] ?? ''}
                                onChange={(e) =>
                                  setQtyMap((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                className={`w-full h-8 px-2 rounded-lg border text-xs text-center font-bold tabular-nums focus:outline-none ${
                                  isInvalid
                                    ? 'border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] focus:border-[var(--accent-primary)]'
                                }`}
                              />
                              {isInvalid && (
                                <div
                                  data-testid={`smr-qty-error-${idx}`}
                                  className="text-[10px] text-[var(--status-danger)] mt-0.5 leading-tight"
                                >
                                  {isFa ? `حداکثر مجاز: ${maxQty}` : `Max: ${maxQty}`}
                                </div>
                              )}
                            </td>
                            {reasonMode === 'per_row' && (
                              <td className="py-1.5 px-2.5">
                                <input
                                  type="text"
                                  data-testid={`smr-row-reason-${idx}`}
                                  value={perRowReasonMap[row.id] || ''}
                                  onChange={(e) =>
                                    setPerRowReasonMap((prev) => ({ ...prev, [row.id]: e.target.value }))
                                  }
                                  placeholder={isFa ? 'دلیل عودت این ردیف...' : 'Reason...'}
                                  className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                              </td>
                            )}
                            <td className="py-1.5 px-2.5">
                              <input
                                type="text"
                                data-testid={`smr-row-remark-${idx}`}
                                value={remarkMap[row.id] || ''}
                                onChange={(e) =>
                                  setRemarkMap((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                placeholder={isFa ? 'توضیحات اختیاری...' : 'Optional remark...'}
                                className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Footer */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  {isFa ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  <span>{isFa ? 'بازگشت به انتخاب اقلام' : 'Back to Selection'}</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting || hasQtyErrors}
                  data-testid="smr-submit-btn"
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {editingDoc
                      ? isFa
                        ? 'ذخیره تغییرات و مشاهده فرم چاپ'
                        : 'Save Changes & Print Preview'
                      : isFa
                        ? 'صدور فرم ارجاع مازاد (SMR) و چاپ'
                        : 'Issue SMR & Print Preview'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* HISTORY VIEW */}
      {viewMode === 'history' && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <SearchInputWithClear
                value={historySearch}
                onChange={setHistorySearch}
                placeholder={isFa ? 'جستجو در فرم‌های ارجاع صادرشده...' : 'Search issued SMR forms...'}
              />
            </div>
            <button
              type="button"
              onClick={() => setPrintReportOpen(true)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'چاپ فهرست فرم‌های ارجاع' : 'Print SMR List'}</span>
            </button>
          </div>

          <StickyTableWrapper>
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-3 text-start">SMR No.</th>
                  <th className="py-2.5 px-3 text-start">SMR Date</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'انبار مقصد' : 'Target Warehouse'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'پیمانکار نصب' : 'Installer'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'تامین‌کننده' : 'Supplier'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'جزیره' : 'Island'}</th>
                  <th className="py-2.5 px-3 text-center">{isFa ? 'اقلام' : 'Items'}</th>
                  <th className="py-2.5 px-3 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                      {t.controls.loading}
                    </td>
                  </tr>
                ) : smrPagination.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                      {isFa ? 'هنوز فرم ارجاع مازادی صادر نشده است.' : 'No SMR documents issued yet.'}
                    </td>
                  </tr>
                ) : (
                  smrPagination.pageItems.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="py-2.5 px-3 font-mono font-bold tabular-nums" dir="ltr">
                        {doc.docNo}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                        {formatDate(doc.date)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                            doc.docType === 'smr_mapna'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {docTypeLabel(doc.docType)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 bidi-plaintext max-w-[160px] truncate">
                        {doc.party || '—'}
                      </td>
                      <td className="py-2.5 px-3 bidi-plaintext max-w-[160px] truncate">
                        {doc.supplier || '—'}
                      </td>
                      <td className="py-2.5 px-3 bidi-plaintext">{doc.islandSystem || '—'}</td>
                      <td className="py-2.5 px-3 text-center font-semibold tabular-nums">
                        {doc.items.length}
                      </td>
                      <td className="py-2.5 px-3 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPrintDoc(doc)}
                            title={isFa ? 'مشاهده و چاپ فرم' : 'View & Print'}
                            aria-label={isFa ? 'چاپ' : 'Print'}
                            data-testid={`smr-print-${doc.id}`}
                            className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--accent-primary)]"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <SignedScanRowButton
                            signedScan={doc.signedScan}
                            onClick={() => setScanTarget(doc)}
                          />
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(doc)}
                                title={t.controls.edit}
                                aria-label={t.controls.edit}
                                data-testid={`smr-edit-${doc.id}`}
                                className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(doc)}
                                title={t.controls.delete}
                                aria-label={t.controls.delete}
                                data-testid={`smr-delete-${doc.id}`}
                                className="p-1.5 rounded-lg border border-[var(--status-danger)]/30 hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
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
            page={smrPagination.page}
            totalPages={smrPagination.totalPages}
            total={smrPagination.total}
            pageSize={smrPagination.pageSize}
            onPageChange={smrPagination.setPage}
            onPageSizeChange={smrPagination.setPageSize}
            lang={prefs.language}
          />
        </div>
      )}

      {/* Print Preview Modal with Post-Print Undo / Redo */}
      {printDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5 print:hidden"
          onClick={() => setPrintDoc(null)}
          data-testid="smr-print-preview-modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <CornerUpLeft className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'پیش‌نمایش و چاپ فرم ارجاع قطعات، کالا و تجهیزات مازاد' : 'SMR Print Preview'}</span>
                <span className="font-mono text-[var(--accent-primary)] tabular-nums" dir="ltr">
                  {printDoc.docNo}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={() => void handlePreviewUndo()}
                      data-testid="smr-preview-undo-btn"
                      title={isFa ? 'واگرد (Undo) حتی پس از چاپ' : 'Undo (even after print)'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1 disabled:opacity-40"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'واگرد' : 'Undo'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={() => void handlePreviewRedo()}
                      data-testid="smr-preview-redo-btn"
                      title={isFa ? 'انجام مجدد (Redo)' : 'Redo'}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1 disabled:opacity-40"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => triggerAppPrint()}
                  data-testid="smr-preview-print-btn"
                  className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ متریال' : 'Print'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintDoc(null)}
                  aria-label={isFa ? 'بستن' : 'Close'}
                  title={isFa ? 'بستن' : 'Close'}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {printDocWasUndone && (
              <div
                data-testid="smr-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {isFa
                  ? 'صدور این فرم ارجاع با دکمه واگرد (Undo) لغو و جدول جزئیات تجهیزات به حالت قبل بازگردانده شد. برای بازگرداندن آن، روی «انجام مجدد (Redo)» کلیک کنید.'
                  : 'This SMR was undone and Detailed Equipment was restored. Click Redo to reapply it.'}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900">
              <div className="max-w-[1120px] mx-auto bg-white p-5 rounded-xl shadow-md">
                <OfficialSmrSheet
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

      {/* Signed Scan Modal */}
      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="miv"
          recordId={scanTarget.id}
          recordLabel={scanTarget.docNo}
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
        title={isFa ? 'حذف فرم ارجاع مازاد (SMR)' : 'Delete SMR Document'}
        message={
          isFa
            ? `آیا از حذف فرم ارجاع شماره «${deleteTarget?.docNo || ''}» اطمینان دارید؟ شماره و تعداد برگشتی از جدول جزئیات تجهیزات بازگردانی خواهد شد.`
            : `Delete SMR "${deleteTarget?.docNo || ''}"? Its numbers and returned quantities will be reverted in Detailed Equipment.`
        }
        confirmLabel={isFa ? 'بله، حذف شود' : 'Delete'}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      {/* History List Print Report */}
      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={isFa ? 'فهرست فرم‌های ارجاع قطعات و تجهیزات مازاد (SMR)' : 'SMR Documents List'}
        rows={filteredHistory}
        columns={historyColumns}
        defaultSelectedKeys={historyColumns.map((c) => c.key)}
      />
    </div>
  );
};
