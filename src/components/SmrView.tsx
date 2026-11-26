import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { triggerAppPrint } from '../lib/print.ts';
import { createPortal } from 'react-dom';
import { CheckCircle2, CornerUpLeft, Pencil, Printer, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { roundQty } from '../shared/formulas.ts';
import { extractPlantDocConfig, generateNextPlantAwareDocNo } from '../shared/docNumbering.ts';
import { getEmployerFormCode, resolveBuiltInFormDesign } from '../shared/employers.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import {
  OperationalViewModeTabs,
  type OperationalViewMode,
} from './OperationalViewModeTabs.tsx';
import {
  BuiltInSheetHeaderRow,
  OfficialExtraMetaStrip,
  OfficialFormSignatures,
} from './OfficialSheetHeader.tsx';
import type {
  DetailedComputed,
  DocumentLineItem,
  GeneralEntry,
  MivDocType,
  MivDocumentRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
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

type SmrOnlyType = 'smr_contractor' | 'smr_mapna';

interface OfficialSmrSheetProps {
  doc: MivDocumentRecord;
  detailedItems: DetailedComputed[];
  formatDate: (iso: string) => string;
}

const OfficialSmrSheet: React.FC<OfficialSmrSheetProps> = ({
  doc,
  detailedItems,
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'smr');
  const formCode = design.docCode;
  const displayProjectName = doc.projectName?.trim() || activeProject?.name || '..................';

  const detailedById = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of detailedItems) map.set(d.id, d);
    return map;
  }, [detailedItems]);

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, doc.items.length);
  const paddedRows: (DocumentLineItem | null)[] = [
    ...doc.items,
    ...Array.from({ length: Math.max(0, totalDisplayRows - doc.items.length) }, () => null),
  ];

  return (
    <div
      dir="rtl"
      className={design.orientation === 'portrait' ? 'samaan-a4-portrait' : 'samaan-a4-landscape'}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Upper Main Frame */}
      <div style={{ border: `1.8px solid ${design.accentColor}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={design}
          projectTitle={`پروژه ${displayProjectName}`}
        />
        <OfficialExtraMetaStrip design={design} inset borderColor={design.accentColor} />

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
              {doc.purchasePackageNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{doc.supplier || ''}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{doc.islandSystem || ''}</span>
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
            <span className="bidi-plaintext">{doc.party || ''}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>Realised Note No.: </strong>
            <span className="tabular-nums">{doc.releaseNoteNo || ''}</span>
          </div>
          <div dir="ltr" style={{ borderLeft: '1px solid #000000', padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>SMR No.: </strong>
            <span className="tabular-nums">{doc.docNo}</span>
          </div>
          <div dir="ltr" style={{ padding: '5px 8px', textAlign: 'left' }}>
            <strong style={{ fontWeight: 700 }}>SMR Date: </strong>
            <span className="tabular-nums">{formatDate(doc.date)}</span>
          </div>
        </div>

        {/* 9-Column LTR Table */}
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
              const pkgItemText = row
                ? [row.packageNo, row.itemNo].filter(Boolean).join(' / ')
                : '';
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
      <div className="samaan-keep-together" style={{ border: '1.8px solid #000000', marginTop: '12px' }}>
        {/* Header: امضاء */}
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
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
            minHeight: '82px',
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
              <div style={{ fontWeight: 700 }}>{activeEmployer.equipmentSupplyLabel} :</div>
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
              <div style={{ fontWeight: 700 }}>پیمانکار نصب / تحویل آورنده:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {[doc.installerRep || doc.party, doc.deliveredBy ? `تحویل آورنده: ${doc.deliveredBy}` : '']
                .filter(Boolean)
                .join(' — ')}
            </div>
          </div>
        </div>

        {(design.template?.signatures?.length || !design.showSignatures) && (
          <OfficialFormSignatures
            signatures={design.signatures}
            showSignatures={design.showSignatures}
            borderColor={design.accentColor}
          />
        )}

        {/* QA Control Note inside bottom of lower frame */}
        <div
          dir="rtl"
          style={{
            padding: '4px 10px',
            fontSize: '8.5px',
            fontWeight: 600,
            textAlign: 'right',
          }}
        >
          {design.template?.introText ||
            'توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمیباشد.'}
        </div>
      </div>

      {/* Outside Bottom Footer Strip */}
      <div
        style={{
          marginTop: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
          fontSize: '9px',
          fontWeight: 700,
        }}
      >
        <div>{design.template?.footerCopyText || 'رونوشت: معاونت تأمین تجهیزات، پیمانکار نصب، دفتر فنی'}</div>
        {(formCode || design.revisionText) && (
          <div dir="ltr" className="tabular-nums">
            {[formCode, design.revisionText].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
};

export const SmrView: React.FC<SmrViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot, activeEmployer, activeProject } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const formCode = getEmployerFormCode(activeEmployer, '08-03');

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [data, setData] = useState<MivApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [docType, setDocType] = useState<SmrOnlyType>('smr_contractor');
  const [docNo, setDocNo] = useState('');
  const suggestedDocNo = useMemo(
    () =>
      generateNextPlantAwareDocNo(
        'SMR',
        (data?.documents || []).map((d) => d.docNo),
        extractPlantDocConfig(activeProject),
      ),
    [data?.documents, activeProject],
  );
  const [date, setDate] = useState(getTodayIso());
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [islandSystem, setIslandSystem] = useState('');
  const [party, setParty] = useState('');
  const [releaseNoteNo, setReleaseNoteNo] = useState('');
  const [storekeeper, setStorekeeper] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [techOffice, setTechOffice] = useState('');
  const [qcInspector, setQcInspector] = useState('');
  const [installerRep, setInstallerRep] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [printDoc, setPrintDoc] = useState<MivDocumentRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  const [editingDoc, setEditingDoc] = useState<MivDocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MivDocumentRecord | null>(null);
  const [scanTarget, setScanTarget] = useState<MivDocumentRecord | null>(null);

  const loadData = useCallback(async (opts?: { packing?: string; search?: string; stockFilter?: string }) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ compact: '1', limit: '80' });
      if (opts?.packing) qs.set('packing', opts.packing);
      if (opts?.search) qs.set('search', opts.search);
      if (opts?.stockFilter) qs.set('stockFilter', opts.stockFilter);
      const res = await apiRequest<MivApiResponse>(`/api/miv?${qs.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const sf = docType === 'smr_mapna' ? 'contractor' : '';
    const timer = window.setTimeout(() => {
      loadData({ packing: shipmentFilter, search: itemSearch.trim(), stockFilter: sf });
    }, itemSearch ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadData, refreshSignal, shipmentFilter, itemSearch, docType]);

  const docTypeLabel = useCallback(
    (type: MivDocType) => {
      if (type === 'smr_contractor') {
        return isFa ? 'برگشت به انبار پیمانکار (SMR پیمانکار)' : 'Return to Contractor Warehouse (SMR)';
      }
      return isFa
        ? `برگشت به انبار ${activeEmployer.isConfigured ? activeEmployer.shortName : 'کارفرما / اصلی'} (SMR کارفرما)`
        : 'Return to Employer/Main Warehouse (SMR)';
    },
    [isFa, activeEmployer.isConfigured, activeEmployer.shortName],
  );

  const smrDocuments = useMemo(
    () => (data?.documents || []).filter((d) => d.docType.startsWith('smr_')),
    [data],
  );
  const smrPagination = useClientPagination(smrDocuments, 50);

  const knownPackings = useMemo(() => {
    if (data?.packings && data.packings.length > 0) return data.packings;
    const set = new Set<string>();
    for (const d of data?.detailedItems || []) {
      if (d.shipmentNo) set.add(d.shipmentNo);
    }
    for (const g of data?.generalEntries || []) {
      if (g.packingListNo) set.add(g.packingListNo);
    }
    return Array.from(set);
  }, [data]);

  const oldQtyByDetailedId = useMemo(() => {
    const map = new Map<string, number>();
    if (editingDoc) {
      for (const it of editingDoc.items) {
        map.set(it.detailedId, roundQty((map.get(it.detailedId) || 0) + (it.qty || 0)));
      }
    }
    return map;
  }, [editingDoc]);

  const getAvailableQty = useCallback(
    (item: DetailedComputed, type: SmrOnlyType) => {
      const oldQty = oldQtyByDetailedId.get(item.id) || 0;
      if (type === 'smr_mapna') {
        const delta =
          editingDoc?.docType === 'smr_mapna'
            ? oldQty
            : editingDoc?.docType === 'smr_contractor'
              ? -oldQty
              : 0;
        return roundQty(item.contractorInventory + delta);
      }
      const extra = editingDoc?.docType === 'smr_contractor' ? oldQty : 0;
      return roundQty((item.mivContractorQty || 0) + extra);
    },
    [editingDoc, oldQtyByDetailedId],
  );

  const eligibleItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter((d) => {
      if (shipmentFilter && (d.shipmentNo || '').trim() !== shipmentFilter.trim()) return false;
      const avail = getAvailableQty(d, docType);
      const isExistingEditItem = oldQtyByDetailedId.has(d.id) || Boolean(qtyMap[d.id]);
      if (docType === 'smr_mapna') return avail > 0 || isExistingEditItem;
      return !d.opiPending;
    });
    const q = itemSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) =>
      [d.shipmentNo, d.packageNo, d.itemNo, d.description, d.generalDescription, d.itemCode, d.size]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [data, docType, itemSearch, shipmentFilter, getAvailableQty, oldQtyByDetailedId, qtyMap]);

  const detailedLookup = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of data?.detailedItems || []) map.set(d.id, d);
    return map;
  }, [data]);

  const autoFillFromPackingOrItem = useCallback(
    (packingNo: string, item?: DetailedComputed, overwrite = false) => {
      const targetPacking = (item?.shipmentNo || packingNo || '').trim();
      if (!targetPacking) return;
      const generalEntries = data?.generalEntries || [];
      const genMatches = generalEntries.filter(
        (g) => (g.packingListNo || '').trim() === targetPacking,
      );
      const genMatch =
        (item
          ? genMatches.find((g) => (g.packageNo || '').trim() === (item.packageNo || '').trim())
          : undefined) || genMatches[0];

      const detMatches = (data?.detailedItems || []).filter(
        (d) => (d.shipmentNo || '').trim() === targetPacking,
      );
      const refDet = item || detMatches[0];

      const nextSupplier = (refDet?.supplier || genMatch?.supplier || '').trim();
      const nextIslandSystem = Array.from(
        new Set(
          [refDet?.island || genMatch?.island, refDet?.system || genMatch?.system]
            .map((s) => (s || '').trim())
            .filter(Boolean),
        ),
      ).join(' / ');
      const nextReleaseNo = (genMatch?.releaseNo || '').trim();
      const nextPkg = (refDet?.mtoRef || '').trim();
      const nextParty = (refDet?.receiver || '').trim();

      if (nextSupplier && (overwrite || !supplier.trim())) {
        setSupplier(nextSupplier);
      }
      if (nextIslandSystem && (overwrite || !islandSystem.trim())) {
        setIslandSystem(nextIslandSystem);
      }
      if (nextReleaseNo && (overwrite || !releaseNoteNo.trim())) {
        setReleaseNoteNo(nextReleaseNo);
      }
      if (nextPkg && (overwrite || !purchasePackageNo.trim())) {
        setPurchasePackageNo(nextPkg);
      }
      if (nextParty && (overwrite || !party.trim())) {
        setParty(nextParty);
      }
    },
    [data?.generalEntries, data?.detailedItems, supplier, islandSystem, releaseNoteNo, purchasePackageNo, party],
  );

  const handlePackingFilterChange = (val: string) => {
    setShipmentFilter(val);
    if (val) {
      autoFillFromPackingOrItem(val, undefined, true);
    }
  };

  const updateReturnQty = (item: DetailedComputed, value: string) => {
    setQtyMap((prev) => ({ ...prev, [item.id]: value }));
    if (Number(value) > 0) {
      autoFillFromPackingOrItem(item.shipmentNo, item, false);
    }
  };

  const selectedEntries = useMemo(() => {
    return Object.entries(qtyMap)
      .map(([detailedId, val]) => {
        const det = detailedLookup.get(detailedId);
        return {
          detailedId,
          qty: Number(val),
          tagNo: det?.itemCode || '',
          uom: det?.countingUnit || '',
          returnReason: (reasonMap[detailedId] || '').trim(),
          remark: (remarkMap[detailedId] || '').trim(),
        };
      })
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
  }, [qtyMap, reasonMap, remarkMap, detailedLookup]);

  const resetForm = () => {
    setEditingDoc(null);
    setDocNo('');
    setPurchasePackageNo('');
    setSupplier('');
    setIslandSystem('');
    setParty('');
    setReleaseNoteNo('');
    setStorekeeper('');
    setEquipmentSupply('');
    setTechOffice('');
    setQcInspector('');
    setInstallerRep('');
    setDeliveredBy('');
    setNotes('');
    setQtyMap({});
    setReasonMap({});
    setRemarkMap({});
  };

  const startEdit = (doc: MivDocumentRecord) => {
    setViewMode('create');
    setEditingDoc(doc);
    setDocType(doc.docType === 'smr_mapna' ? 'smr_mapna' : 'smr_contractor');
    setDocNo(doc.docNo);
    setDate(doc.date);
    setParty(doc.party || '');
    setPurchasePackageNo(doc.purchasePackageNo || '');
    setSupplier(doc.supplier || '');
    setIslandSystem(doc.islandSystem || '');
    setReleaseNoteNo(doc.releaseNoteNo || '');
    setStorekeeper(doc.storekeeper || '');
    setEquipmentSupply(doc.equipmentSupply || '');
    setTechOffice(doc.techOffice || '');
    setQcInspector(doc.qcInspector || '');
    setInstallerRep(doc.installerRep || '');
    setDeliveredBy(doc.deliveredBy || '');
    setNotes(doc.notes || '');
    setShipmentFilter('');
    setItemSearch('');
    const nextQty: Record<string, string> = {};
    const nextReason: Record<string, string> = {};
    const nextRemark: Record<string, string> = {};
    for (const it of doc.items) {
      nextQty[it.detailedId] = String(it.qty);
      if (it.returnReason) nextReason[it.detailedId] = it.returnReason;
      if (it.remark) nextRemark[it.detailedId] = it.remark;
    }
    setQtyMap(nextQty);
    setReasonMap(nextReason);
    setRemarkMap(nextRemark);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEntries.length === 0) {
      notify('warning', isFa ? 'برای حداقل یک قلم مقدار وارد کنید.' : 'Enter quantity for at least one item.');
      return;
    }

    try {
      const payload = {
        docType,
        docNo,
        date,
        party,
        projectName: activeProject?.name || '',
        purchasePackageNo,
        supplier,
        islandSystem,
        releaseNoteNo,
        storekeeper,
        equipmentSupply,
        techOffice,
        qcInspector,
        installerRep: installerRep || party,
        deliveredBy,
        notes,
        items: selectedEntries,
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
            ? `فرم ارجاع شماره ${res.document.docNo} ویرایش و موجودی اقلام به‌روزرسانی شد.`
            : `Return Form ${res.document.docNo} updated.`
          : isFa
            ? `فرم ارجاع کالا شماره ${res.document.docNo} ثبت و موجودی اقلام به‌روزرسانی شد.`
            : `Return Form ${res.document.docNo} saved.`,
      );
      resetForm();
      setPrintDoc(res.document);
      triggerAutoSnapshot(`${editingDoc ? 'Edit ' : ''}SMR ${res.document.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
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
          : `Return Form ${deleteTarget.docNo} deleted.`,
      );
      if (editingDoc?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete SMR ${deleteTarget.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const historyColumns = useMemo<PrintColumnDef<MivDocumentRecord>[]>(
    () => [
      { key: 'docType', header: isFa ? 'نوع فرم' : 'Type', getValue: (r) => docTypeLabel(r.docType) },
      { key: 'docNo', header: 'SMR No.', getValue: (r) => r.docNo },
      { key: 'date', header: 'SMR Date', isDate: true, getValue: (r) => r.date },
      { key: 'projectName', header: isFa ? 'پروژه' : 'Project', getValue: (r) => r.projectName || '' },
      { key: 'purchasePackageNo', header: isFa ? 'شماره بسته خرید' : 'Purchase Package', getValue: (r) => r.purchasePackageNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'party', header: isFa ? 'پیمانکار نصب' : 'Installer Contractor', getValue: (r) => r.party || '' },
      { key: 'deliveredBy', header: isFa ? 'تحویل آورنده' : 'Returned By', getValue: (r) => r.deliveredBy || '' },
      { key: 'releaseNoteNo', header: 'Realised Note No.', getValue: (r) => r.releaseNoteNo || '' },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => r.items.length },
      {
        key: 'itemsSummary',
        header: isFa ? 'شرح اقلام' : 'Items Summary',
        getValue: (r) =>
          r.items.map((i) => `${i.shipmentNo}/${i.packageNo}#${i.itemNo} (${i.qty})`).join(' | '),
      },
      { key: 'createdBy', header: isFa ? 'تنظیم‌کننده' : 'Created By', getValue: (r) => r.createdBy },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa, docTypeLabel],
  );

  return (
    <div className="space-y-6">
      {/* Dedicated A4 Landscape Portal for Official MD1EX-FQP02/08-03 SMR Sheet */}
      {printDoc && !printReportOpen
        ? createPortal(
            <div id="samaan-smr-print-root" data-samaan-print-portal="true">
              <style>{buildIsolatedPrintPortalCss('samaan-smr-print-root', {
                orientation: 'landscape',
                isFa,
                extraPrintCss: `
                  #samaan-smr-print-root table {
                    width: 100% !important;
                    table-layout: auto !important;
                  }
                  #samaan-smr-print-root tr {
                    height: auto !important;
                    break-inside: avoid;
                    page-break-inside: avoid;
                  }
                  #samaan-smr-print-root table th,
                  #samaan-smr-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                    height: auto !important;
                  }
                `,
              })}</style>
              <OfficialSmrSheet
                doc={printDoc}
                detailedItems={data?.detailedItems || []}
                formatDate={formatDate}
              />
            </div>,
            document.body,
          )
        : null}

      {/* Top Mode Bar: Form vs History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <CornerUpLeft className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>{t.nav.smr}</span>
          {formCode && (
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              {formCode}
            </span>
          )}
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

      {canEdit && viewMode === 'create' && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CornerUpLeft className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>
                {editingDoc
                  ? isFa
                    ? `ویرایش فرم ارجاع (${editingDoc.docNo})`
                    : `Edit Return Form (${editingDoc.docNo})`
                  : t.nav.smr}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {editingDoc && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-[var(--status-danger)] hover:underline"
                >
                  {t.controls.cancel}
                </button>
              )}
              {formCode && (
                <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                  {formCode}
                </span>
              )}
            </div>
          </div>

          {/* Target Warehouse Chooser: Employer WH vs Contractor WH */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-[var(--text-primary)]">
              {isFa
                ? 'متریال به کدام انبار برگشت می‌خورد؟ *'
                : 'Which warehouse is the material being returned to? *'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDocType('smr_contractor');
                  setQtyMap({});
                }}
                className={`text-start p-3 rounded-xl border transition-all ${
                  docType === 'smr_contractor'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? 'برگشت به انبار پیمانکار' : 'Return to Contractor Warehouse'}
                  </span>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
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
                    ? 'برگشت متریال مصرف‌نشده از سایت به انبار پیمانکار — موجودی انبار پیمانکار افزایش می‌یابد و در ستون «شماره برگشتی به انبار پیمانکار» ثبت می‌شود.'
                    : 'Returns unused material to Contractor Warehouse — increases Contractor stock.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDocType('smr_mapna');
                  setQtyMap({});
                }}
                className={`text-start p-3 rounded-xl border transition-all ${
                  docType === 'smr_mapna'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `برگشت به انبار کارفرما (${activeEmployer.isConfigured ? activeEmployer.shortName : 'انبار اصلی'})`
                      : 'Return to Employer / Main Warehouse'}
                  </span>
                  <span
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
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
                    ? 'برگشت متریال از انبار پیمانکار به انبار کارفرما — موجودی کارفرما افزایش می‌یابد و در ستون «شماره برگشتی به انبار کارفرما» ثبت می‌شود.'
                    : 'Returns material from Contractor to Employer/Main Warehouse — increases Main Warehouse stock.'}
                </p>
              </button>
            </div>
          </div>

          {/* Row 1: SMR No, SMR Date, Delivered By, Purchase Package */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="block text-[11px] text-[var(--text-secondary)]">
                  {isFa ? 'شماره فرم ارجاع' : 'SMR No.'} *
                </label>
                {!editingDoc && (
                  <button
                    type="button"
                    onClick={() => setDocNo(suggestedDocNo)}
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
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder={suggestedDocNo}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !docNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ فرم ارجاع' : 'SMR Date'} *`}
              value={date}
              onChange={setDate}
            />

            <div>
              <label className="block text-[11px] font-semibold text-[var(--accent-primary)] mb-1">
                {isFa ? 'نام تحویل آورنده (ثبت در جزئیات تجهیزات)' : 'Returned By / Deliverer (Synced to Detailed)'}
              </label>
              <input
                type="text"
                dir={!deliveredBy ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                placeholder={isFa ? 'نام شخص تحویل آورنده...' : 'Person returning material...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره بسته خرید' : 'Purchase Package No.'}
              </label>
              <input
                type="text"
                dir={isFa && !purchasePackageNo ? 'rtl' : 'ltr'}
                value={purchasePackageNo}
                onChange={(e) => setPurchasePackageNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !purchasePackageNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 2: Supplier, Island, Installer Contractor, Realised Note No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.supplier}
              </label>
              <input
                type="text"
                dir={!supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'جزیره' : 'Island'}
              </label>
              <input
                type="text"
                dir={!islandSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={islandSystem}
                onChange={(e) => setIslandSystem(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پیمانکار نصب' : 'Installation Contractor'}
              </label>
              <input
                type="text"
                dir={!party ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={party}
                onChange={(e) => setParty(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Realised Note No.
              </label>
              <input
                type="text"
                dir={isFa && !releaseNoteNo ? 'rtl' : 'ltr'}
                value={releaseNoteNo}
                onChange={(e) => setReleaseNoteNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !releaseNoteNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 3: 5 Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انباردار' : 'Storekeeper'}
              </label>
              <input
                type="text"
                dir={!storekeeper ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={storekeeper}
                onChange={(e) => setStorekeeper(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? activeEmployer.equipmentSupplyLabel : `${activeEmployer.badgeCode} Equipment Supply`}
              </label>
              <input
                type="text"
                dir={!equipmentSupply ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={equipmentSupply}
                onChange={(e) => setEquipmentSupply(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'دفتر فنی' : 'Technical Office'}
              </label>
              <input
                type="text"
                dir={!techOffice ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={techOffice}
                onChange={(e) => setTechOffice(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                QC
              </label>
              <input
                type="text"
                dir={!qcInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={qcInspector}
                onChange={(e) => setQcInspector(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نماینده پیمانکار نصب' : 'Installer Contractor Rep.'}
              </label>
              <input
                type="text"
                dir={!installerRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={installerRep}
                onChange={(e) => setInstallerRep(e.target.value)}
                placeholder={party || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
              {isFa ? 'توضیحات کلی' : 'General Remarks'}
            </label>
            <input
              type="text"
              dir={!notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa ? 'انتخاب اقلام، تعداد و دلیل ارجاع' : 'Select Items, Return Quantities & Reasons'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={shipmentFilter}
                  onChange={(e) => handlePackingFilterChange(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                >
                  <option value="">{isFa ? 'فیلتر پکینگ لیست: همه' : 'Packing List: All'}</option>
                  {knownPackings.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <SearchInputWithClear
                  value={itemSearch}
                  onChange={setItemSearch}
                  placeholder={t.controls.searchPlaceholder}
                  className="w-64"
                  inputClassName="h-8 text-xs"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-clip">
              <StickyTableWrapper maxHeightClass="max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2 px-3">{t.headers.shipmentNo}</th>
                    <th className="py-2 px-3">{t.headers.packageNo}</th>
                    <th className="py-2 px-3">{t.headers.itemNo}</th>
                    <th className="py-2 px-3">{t.headers.description}</th>
                    <th className="py-2 px-3">
                      {docType === 'smr_contractor' ? t.headers.mivContractorQty : t.headers.contractorInventory}
                    </th>
                    <th className="py-2 px-3">{isFa ? 'تعداد ارجاع' : 'Return Qty'}</th>
                    <th className="py-2 px-3">{isFa ? 'دلیل عودت (ارجاع)' : 'Return Reason'}</th>
                    <th className="py-2 px-3">{isFa ? 'توضیحات ردیف' : 'Remarks'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {eligibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    eligibleItems.slice(0, 80).map((item) => {
                      const avail = getAvailableQty(item, docType);
                      return (
                        <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-2 px-3 tabular-nums" dir="ltr">
                            {item.shipmentNo}
                          </td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">
                            {item.packageNo}
                          </td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">
                            {item.itemNo}
                          </td>
                          <td
                            className="py-2 px-3 max-w-[210px] truncate bidi-plaintext"
                            title={item.description}
                          >
                            {item.description || item.generalDescription}
                          </td>
                          <td className="py-2 px-3 font-semibold text-[var(--accent-primary)] tabular-nums">
                            {avail} {item.countingUnit}
                          </td>
                          <td className="py-2 px-3 w-36">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max={docType === 'smr_mapna' ? avail : undefined}
                                dir={isFa && !qtyMap[item.id] ? 'rtl' : 'ltr'}
                                value={qtyMap[item.id] || ''}
                                onChange={(e) => updateReturnQty(item, e.target.value)}
                                placeholder="0"
                                className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                              {avail > 0 && (
                                <button
                                  type="button"
                                  onClick={() => updateReturnQty(item, String(avail))}
                                  className="px-2 h-8 rounded bg-[var(--bg-subtle)] text-[10px] font-semibold hover:bg-[var(--accent-soft)]"
                                >
                                  {isFa ? 'کل' : 'Max'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 w-36">
                            <input
                              type="text"
                              dir={!reasonMap[item.id] ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              value={reasonMap[item.id] || ''}
                              onChange={(e) =>
                                setReasonMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder={isFa ? 'دلیل ارجاع' : 'Reason'}
                              className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                          </td>
                          <td className="py-2 px-3 w-36">
                            <input
                              type="text"
                              dir={!remarkMap[item.id] ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              value={remarkMap[item.id] || ''}
                              onChange={(e) =>
                                setRemarkMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder={isFa ? 'اختیاری' : 'Optional'}
                              className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                </table>
              </StickyTableWrapper>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {isFa
                ? `${selectedEntries.length.toLocaleString('fa-IR')} قلم انتخاب‌شده`
                : `${selectedEntries.length} items selected`}
            </span>
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {editingDoc
                  ? isFa
                    ? 'ذخیره تغییرات فرم ارجاع و چاپ'
                    : 'Save Changes & Print Return Form'
                  : isFa
                    ? 'ثبت فرم ارجاع و چاپ'
                    : 'Save & Print Return Form'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Document History */}
      {(viewMode === 'history' || !canEdit) && (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق فرم ارجاع قطعات، کالا و تجهیزات (SMR)' : 'SMR Return History'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrintReportOpen(true)}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.controls.printReport}</span>
            </button>
          </div>
        </div>
        <StickyTableWrapper>
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4">{isFa ? 'نوع فرم' : 'Type'}</th>
                <th className="py-2.5 px-4">SMR No.</th>
                <th className="py-2.5 px-4">SMR Date</th>
                <th className="py-2.5 px-4">{t.headers.supplier}</th>
                <th className="py-2.5 px-4">{isFa ? 'پیمانکار نصب' : 'Contractor'}</th>
                <th className="py-2.5 px-4">{isFa ? 'تحویل آورنده' : 'Returned By'}</th>
                <th className="py-2.5 px-4">{isFa ? 'تعداد اقلام' : 'Items'}</th>
                <th className="py-2.5 px-4">{isFa ? 'نسخه اسکن امضاشده' : 'Signed Scan'}</th>
                <th className="py-2.5 px-4">{isFa ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : smrDocuments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                smrPagination.pageItems.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setScanTarget(doc)}
                    title={isFa ? 'کلیک برای مشاهده یا بارگذاری اسکن امضاشده فرم' : 'Click to view or upload signed scan'}
                    className="hover:bg-[var(--bg-subtle)]/50 cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-medium">{docTypeLabel(doc.docType)}</td>
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                      {doc.docNo}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {formatDate(doc.date)}
                    </td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.supplier || '-'}</td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.party || '-'}</td>
                    <td className="py-2.5 px-4 bidi-plaintext font-medium text-[var(--accent-primary)]">
                      {doc.deliveredBy || '-'}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">{doc.items.length}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <SignedScanRowButton
                        signedScan={doc.signedScan}
                        recordLabel={doc.docNo}
                        onClick={() => setScanTarget(doc)}
                      />
                    </td>
                    <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPrintDoc(doc)}
                          className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{t.controls.print}</span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(doc)}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)]"
                              title={t.controls.edit}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(doc)}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)]"
                              title={t.controls.delete}
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

      {/* Printable Official MD1EX-FQP02/08-03 SMR Landscape Modal */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی ارجاع قطعات، کالا و تجهیزات مازاد' : 'Official Surplus Material Return Form'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  {formCode ? `${formCode} · ` : ''}{printDoc.docNo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerAppPrint()}
                  className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ فرم (A4 افقی)' : 'Print Form (A4 Landscape)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintDoc(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto w-full max-w-[283mm] bg-white p-5 shadow-lg rounded-sm">
                <OfficialSmrSheet
                  doc={printDoc}
                  detailedItems={data?.detailedItems || []}
                  formatDate={formatDate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={t.nav.smr}
        columns={historyColumns}
        rows={smrDocuments}
      />

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'تأیید حذف فرم ارجاع (SMR)' : 'Confirm SMR Deletion'}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف فرم ارجاع «${deleteTarget.docNo}» اطمینان دارید؟ موجودی اقلام مربوطه بازگردانی خواهد شد.`
              : `Delete SMR document "${deleteTarget.docNo}"? Related inventories will be restored.`
            : ''
        }
        confirmLabel={t.controls.delete}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="miv"
          recordId={scanTarget.id}
          recordLabel={scanTarget.docNo}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={(nextScan) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    documents: prev.documents.map((d) =>
                      d.id === scanTarget.id ? { ...d, signedScan: nextScan } : d,
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
