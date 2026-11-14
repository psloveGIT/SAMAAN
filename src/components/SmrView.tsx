import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, CornerUpLeft, Download, Printer, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  DocumentLineItem,
  GeneralEntry,
  MivDocType,
  MivDocumentRecord,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

const MD1_STACKED_LOGO = '/assets/aistudio/______________________________65f1164c.png';

interface MivApiResponse {
  documents: MivDocumentRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
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
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Upper Main Frame */}
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Header Row (Unified white strip with no vertical dividers) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr 130px',
            alignItems: 'center',
            borderBottom: '1.5px solid #000000',
            padding: '5px 10px',
          }}
        >
          {/* Right: Stacked MAPNA MD1 Logo */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <img
              src={MD1_STACKED_LOGO}
              alt="گروه مپنا - توسعه یک"
              style={{ height: '54px', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            <div
              style={{
                fontSize: '7.5px',
                fontWeight: 700,
                marginTop: '3px',
                color: '#334155',
                whiteSpace: 'nowrap',
              }}
            >
              مستندات سیستم مدیریت یکپارچه
            </div>
          </div>

          {/* Center: Form Title */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              lineHeight: 1.55,
              padding: '2px 8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700 }}>
              شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
              پروژه {doc.projectName?.trim() || '..................'}
            </div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '2px' }}>
              فرم ارجاع قطعات، کالا و تجهیزات مازاد
            </div>
            <div dir="ltr" style={{ fontSize: '12px', fontWeight: 700, marginTop: '2px' }}>
              Surplus Material Return Form
            </div>
          </div>

          <div />
        </div>

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
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: '9.3px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#ffffff', fontWeight: 700 }}>
              <th style={{ width: '4.2%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 2px' }}>
                Item No.
              </th>
              <th style={{ width: '9%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Packing List No.
              </th>
              <th style={{ width: '7.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Package item.
              </th>
              <th style={{ width: '7%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Tag No.
              </th>
              <th style={{ width: '29%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px', fontSize: '10px' }}>
                شرح
              </th>
              <th style={{ width: '5.8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                UOM
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Returned Quantity
              </th>
              <th style={{ width: '8.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 3px', lineHeight: 1.35 }}>
                <div>دلیل عودت</div>
                <div>(ارجاع)</div>
              </th>
              <th style={{ width: '21%', borderBottom: '1px solid #000000', padding: '5px 4px', fontSize: '10px' }}>
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
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`} style={{ height: '30px' }}>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 2px' }}
                  >
                    {row ? idx + 1 : ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {row?.shipmentNo || ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {pkgItemText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {tagText}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 5px', wordBreak: 'break-word' }}
                  >
                    {row?.description || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px' }}
                  >
                    {uomText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', fontWeight: 700 }}
                  >
                    {row ? row.qty : ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {reasonText}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, padding: '4px 4px', wordBreak: 'break-word' }}
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
      <div style={{ border: '1.8px solid #000000', marginTop: '12px' }}>
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
              <div style={{ fontWeight: 700 }}>تأمین تجهیزات توسعه یک :</div>
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
              {doc.installerRep || doc.party || ''}
            </div>
          </div>
        </div>

        {/* QA Control Note inside bottom of lower frame */}
        <div
          style={{
            padding: '4px 10px',
            fontSize: '8.5px',
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمیباشد.
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
        <div>رونوشت: معاونت تأمین تجهیزات، پیمانکار نصب، دفتر فنی</div>
        <div dir="ltr" className="tabular-nums">
          MD1EX-FQP02/08-03
        </div>
      </div>
    </div>
  );
};

export const SmrView: React.FC<SmrViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<MivApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [docType, setDocType] = useState<SmrOnlyType>('smr_contractor');
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [projectName, setProjectName] = useState('');
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
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [printDoc, setPrintDoc] = useState<MivDocumentRecord | null>(null);
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
    loadData();
  }, [loadData, refreshSignal]);

  const docTypeLabel = useCallback(
    (type: MivDocType) => {
      if (type === 'smr_contractor') {
        return isFa ? 'ارجاع / برگشت به انبار پیمانکار (SMR Contractor)' : 'SMR Contractor Return';
      }
      return isFa ? 'ارجاع قطعات و کالا از پیمانکار به مپنا (SMR MAPNA)' : 'SMR Return to MAPNA';
    },
    [isFa],
  );

  const smrDocuments = useMemo(
    () => (data?.documents || []).filter((d) => d.docType.startsWith('smr_')),
    [data],
  );

  const getAvailableQty = (item: DetailedComputed, type: SmrOnlyType) => {
    if (type === 'smr_mapna') return item.contractorInventory;
    return item.mivContractorQty || 0;
  };

  const eligibleItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter((d) => {
      if (docType === 'smr_mapna') return d.contractorInventory > 0;
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
  }, [data, docType, itemSearch]);

  const detailedLookup = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of data?.detailedItems || []) map.set(d.id, d);
    return map;
  }, [data]);

  const autoFillFromItem = useCallback(
    (item: DetailedComputed) => {
      const generalEntries = data?.generalEntries || [];
      const genMatch =
        generalEntries.find(
          (g) =>
            (g.packingListNo || '').trim() === (item.shipmentNo || '').trim() &&
            (g.packageNo || '').trim() === (item.packageNo || '').trim(),
        ) ||
        generalEntries.find(
          (g) => (g.packingListNo || '').trim() === (item.shipmentNo || '').trim(),
        );

      if (!supplier.trim() && (item.supplier || genMatch?.supplier)) {
        setSupplier(item.supplier || genMatch?.supplier || '');
      }
      if (!islandSystem.trim() && (item.island || genMatch?.island)) {
        setIslandSystem(item.island || genMatch?.island || '');
      }
      if (!releaseNoteNo.trim() && genMatch?.releaseNo) {
        setReleaseNoteNo(genMatch.releaseNo);
      }
    },
    [data?.generalEntries, supplier, islandSystem, releaseNoteNo],
  );

  const updateReturnQty = (item: DetailedComputed, value: string) => {
    setQtyMap((prev) => ({ ...prev, [item.id]: value }));
    if (Number(value) > 0) {
      autoFillFromItem(item);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEntries.length === 0) {
      notify('warning', isFa ? 'برای حداقل یک قلم مقدار وارد کنید.' : 'Enter quantity for at least one item.');
      return;
    }

    try {
      const res = await apiRequest<{ document: MivDocumentRecord }>('/api/miv', {
        method: 'POST',
        body: JSON.stringify({
          docType,
          docNo,
          date,
          party,
          projectName,
          purchasePackageNo,
          supplier,
          islandSystem,
          releaseNoteNo,
          storekeeper,
          equipmentSupply,
          techOffice,
          qcInspector,
          installerRep: installerRep || party,
          notes,
          items: selectedEntries,
        }),
      });
      notify(
        'success',
        isFa
          ? `فرم ارجاع کالا شماره ${res.document.docNo} ثبت و موجودی اقلام به‌روزرسانی شد.`
          : `Return Form ${res.document.docNo} saved.`,
      );
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
      setNotes('');
      setQtyMap({});
      setReasonMap({});
      setRemarkMap({});
      setPrintDoc(res.document);
      triggerAutoSnapshot(`SMR ${res.document.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const historyColumns = useMemo<CsvColumnDef<MivDocumentRecord>[]>(
    () => [
      { key: 'docType', header: isFa ? 'نوع فرم' : 'Type', getValue: (r) => docTypeLabel(r.docType) },
      { key: 'docNo', header: 'SMR No.', getValue: (r) => r.docNo },
      { key: 'date', header: 'SMR Date', isDate: true, getValue: (r) => r.date },
      { key: 'projectName', header: isFa ? 'پروژه' : 'Project', getValue: (r) => r.projectName || '' },
      { key: 'purchasePackageNo', header: isFa ? 'شماره بسته خرید' : 'Purchase Package', getValue: (r) => r.purchasePackageNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'party', header: isFa ? 'پیمانکار نصب' : 'Installer Contractor', getValue: (r) => r.party || '' },
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
            <div id="samaan-smr-print-root">
              <style>{`
                @media screen {
                  #samaan-smr-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 landscape;
                    margin: 7mm;
                  }
                  body > *:not(#samaan-smr-print-root) {
                    display: none !important;
                  }
                  #samaan-smr-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-smr-print-root table th,
                  #samaan-smr-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialSmrSheet
                doc={printDoc}
                detailedItems={data?.detailedItems || []}
                formatDate={formatDate}
              />
            </div>,
            document.body,
          )
        : null}

      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CornerUpLeft className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.smr}</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              MD1EX-FQP02/08-03
            </span>
          </div>

          {/* Row 1: Type, SMR No, SMR Date, Project, Purchase Package */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نوع فرم ارجاع' : 'Return Form Type'} *
              </label>
              <select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value as SmrOnlyType);
                  setQtyMap({});
                }}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="smr_contractor">{docTypeLabel('smr_contractor')}</option>
                <option value="smr_mapna">{docTypeLabel('smr_mapna')}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره فرم (SMR No.)' : 'SMR No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="SMR-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !docNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ فرم (SMR Date)' : 'SMR Date'} *`}
              value={date}
              onChange={setDate}
            />

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پروژه' : 'Project Name'}
              </label>
              <input
                type="text"
                dir={!projectName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={isFa ? 'نام پروژه' : 'Project name'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
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
                {isFa ? 'تأمین تجهیزات توسعه یک' : 'MD1 Equipment Supply'}
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
              <div className="flex items-center h-8 w-64 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  dir={!itemSearch ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={t.controls.searchPlaceholder}
                  className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0">
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
                    eligibleItems.map((item) => {
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
              <span>{isFa ? 'ثبت فرم ارجاع و چاپ' : 'Save & Print Return Form'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Document History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق فرم ارجاع قطعات، کالا و تجهیزات (SMR)' : 'SMR Return History'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv({
                  rows: smrDocuments,
                  columns: historyColumns,
                  filename: 'samaan-smr-history',
                  calendar: prefs.calendar,
                  hideEmptyColumns: true,
                })
              }
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.controls.exportCsv}</span>
            </button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4">{isFa ? 'نوع فرم' : 'Type'}</th>
                <th className="py-2.5 px-4">SMR No.</th>
                <th className="py-2.5 px-4">SMR Date</th>
                <th className="py-2.5 px-4">{t.headers.supplier}</th>
                <th className="py-2.5 px-4">{isFa ? 'پیمانکار نصب' : 'Contractor'}</th>
                <th className="py-2.5 px-4">{isFa ? 'تعداد اقلام' : 'Items'}</th>
                <th className="py-2.5 px-4">{t.controls.print}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : smrDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                smrDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-medium">{docTypeLabel(doc.docType)}</td>
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                      {doc.docNo}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {formatDate(doc.date)}
                    </td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.supplier || '-'}</td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.party || '-'}</td>
                    <td className="py-2.5 px-4 tabular-nums">{doc.items.length}</td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setPrintDoc(doc)}
                        className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{t.controls.print}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Official MD1EX-FQP02/08-03 SMR Landscape Modal */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی ارجاع قطعات، کالا و تجهیزات مازاد' : 'Official Surplus Material Return Form'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/08-03 · {printDoc.docNo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
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
              <div className="mx-auto min-w-[920px] max-w-[1040px] bg-white p-5 shadow-lg rounded-sm">
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
    </div>
  );
};
