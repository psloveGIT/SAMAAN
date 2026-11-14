import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, FileCheck2, Printer, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { MD1_STACKED_LOGO } from '../lib/assets.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  DocumentLineItem,
  GcvDocumentRecord,
  GeneralEntry,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

interface GcvApiResponse {
  documents: GcvDocumentRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
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
      backgroundColor: '#ffffff',
      flexShrink: 0,
    }}
  >
    {checked && (
      <span
        style={{
          width: '6.5px',
          height: '6.5px',
          borderRadius: '9999px',
          backgroundColor: '#000000',
          display: 'block',
        }}
      />
    )}
  </span>
);

interface OfficialGcvSheetProps {
  doc: GcvDocumentRecord;
  detailedItems: DetailedComputed[];
  formatDate: (iso: string) => string;
}

const OfficialGcvSheet: React.FC<OfficialGcvSheetProps> = ({
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

  const receiverMgrText = doc.receiverManager || doc.receiver || '';

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
        {/* Header Row (Single unified row with no vertical divider lines) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '125px 1fr 195px',
            alignItems: 'stretch',
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
            <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>
              رسید مصرف مستقیم کالا
            </div>
            <div dir="ltr" style={{ fontSize: '11.5px', fontWeight: 700, marginTop: '2px' }}>
              Not-Stored Goods Consumption Voucher
            </div>
          </div>

          {/* Left: Receipt No & Date */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '6px 6px',
              fontSize: '10px',
              fontWeight: 700,
              textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <span>شماره:</span>
              <span dir="ltr" className="tabular-nums">
                {doc.receiptNo}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <span>تاریخ:</span>
              <span dir="ltr" className="tabular-nums">
                {formatDate(doc.date)}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata Strip Row 1 (5 columns RTL: درخواست خرید | تامین کننده | کارشناس خرید | شماره بسته خرید | Realised Note No.) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.05fr 1.15fr 1.15fr 1.1fr 1.15fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
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
            <span className="bidi-plaintext">{doc.supplier || ''}</span>
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
            <span className="tabular-nums">{doc.releaseNoteNo || ''}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (Single continuous row RTL: خرید توسط: ○ تدارکات تهران ○ مالی- اداری کارگاه ○ پیمانکار تامین کننده | جزیره/سیستم: | شماره بارنامه:) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.8fr 1fr 1fr',
            alignItems: 'center',
            borderBottom: '1px solid #000000',
            padding: '5px 8px',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            <strong style={{ fontWeight: 700 }}>خرید توسط:</strong>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <GcvRadioCircle checked={doc.purchaseBy === 'tehran_proc'} />
              <span>تدارکات تهران</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <GcvRadioCircle checked={doc.purchaseBy === 'site_admin'} />
              <span>مالی- اداری کارگاه</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <GcvRadioCircle checked={doc.purchaseBy === 'contractor_supplier'} />
              <span>پیمانکار تامین کننده</span>
            </span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <strong style={{ fontWeight: 700 }}>جزیره/سیستم: </strong>
            <span className="bidi-plaintext">{doc.islandSystem || ''}</span>
          </div>

          <div style={{ textAlign: 'center' }}>
            <strong style={{ fontWeight: 700 }}>شماره بارنامه: </strong>
            <span dir="ltr" className="tabular-nums">
              {doc.waybillNo || ''}
            </span>
          </div>
        </div>

        {/* 9-Column LTR Items Table */}
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
            <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
              <th style={{ width: '6%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Item No.
              </th>
              <th style={{ width: '11%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                PL/Package No.
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Package Item
              </th>
              <th style={{ width: '31%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Description
              </th>
              <th style={{ width: '10%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Technical info/Size
              </th>
              <th style={{ width: '7%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Tag No.
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                UOM
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 3px' }}>
                Quantity
              </th>
              <th style={{ width: '11%', borderBottom: '1px solid #000000', padding: '5px 4px' }}>
                Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => {
              const detailed = row ? detailedById.get(row.detailedId) : undefined;
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              const plPkgText = row ? [row.shipmentNo, row.packageNo].filter(Boolean).join(' / ') : '';
              const techText = row ? (row.technicalInfo || detailed?.size || '') : '';
              const tagText = row ? (row.tagNo || detailed?.itemCode || '') : '';
              const uomText = row ? (row.uom || detailed?.countingUnit || '') : '';
              const remarkText = row ? (row.remark || (idx === 0 && doc.notes ? doc.notes : '')) : '';

              return (
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`} style={{ height: '30px' }}>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px' }}
                  >
                    {row ? idx + 1 : ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {plPkgText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px' }}
                  >
                    {row?.itemNo || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 5px', wordBreak: 'break-word' }}
                  >
                    {row?.description || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {techText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '4px 3px', wordBreak: 'break-word' }}
                  >
                    {tagText}
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

        {/* Row 2: Group Headers */}
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
            شرکت توسعه یک مپنا
          </div>
        </div>

        {/* Row 3: 4 Equal Signature Boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            minHeight: '78px',
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
              <div style={{ fontWeight: 700 }}>انباردار</div>
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
              {receiverMgrText}
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

        {/* Row 4: QA Control Note inside bottom of Approval Frame */}
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
        <div>رونوشت: معاونت تامین ، امور مالی، واحد کنترل کالا و انبار، پیمانکار نصب</div>
        <div dir="ltr" className="tabular-nums">
          MD1EX-FQP02/11-03
        </div>
      </div>
    </div>
  );
};

export const GcvView: React.FC<GcvViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<GcvApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [receiptNo, setReceiptNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [projectName, setProjectName] = useState('');
  const [receiver, setReceiver] = useState('');
  const [purchaseRequestNo, setPurchaseRequestNo] = useState('');
  const [supplier, setSupplier] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [releaseNoteNo, setReleaseNoteNo] = useState('');
  const [purchaseBy, setPurchaseBy] = useState<
    'tehran_proc' | 'site_admin' | 'contractor_supplier' | ''
  >('');
  const [islandSystem, setIslandSystem] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [storekeeper, setStorekeeper] = useState('');
  const [receiverManager, setReceiverManager] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [mapnaSiteManager, setMapnaSiteManager] = useState('');
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [remarkMap, setRemarkMap] = useState<Record<string, string>>({});
  const [printDoc, setPrintDoc] = useState<GcvDocumentRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

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
    loadData();
  }, [loadData, refreshSignal]);

  const deliverableItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter((d) => !d.opiPending && d.mapnaInventory > 0);
    const q = itemSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) =>
      [d.shipmentNo, d.packageNo, d.itemNo, d.description, d.generalDescription, d.itemCode, d.size]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [data, itemSearch]);

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
      const combinedIslandSystem = [
        item.island || genMatch?.island,
        item.system || genMatch?.system,
      ]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(' / ');
      if (!islandSystem.trim() && combinedIslandSystem) {
        setIslandSystem(combinedIslandSystem);
      }
      if (!waybillNo.trim() && genMatch?.billOfLadingNo) {
        setWaybillNo(genMatch.billOfLadingNo);
      }
      if (!releaseNoteNo.trim() && genMatch?.releaseNo) {
        setReleaseNoteNo(genMatch.releaseNo);
      }
    },
    [data?.generalEntries, supplier, islandSystem, waybillNo, releaseNoteNo],
  );

  const updateItemQty = (item: DetailedComputed, value: string) => {
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
          technicalInfo: det?.size || '',
          tagNo: det?.itemCode || '',
          uom: det?.countingUnit || '',
          remark: (remarkMap[detailedId] || '').trim(),
        };
      })
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
  }, [qtyMap, remarkMap, detailedLookup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEntries.length === 0) {
      notify(
        'warning',
        isFa ? 'برای حداقل یک قلم مقدار تحویلی وارد کنید.' : 'Enter delivery qty for at least one item.',
      );
      return;
    }

    try {
      const res = await apiRequest<{ document: GcvDocumentRecord }>('/api/gcv', {
        method: 'POST',
        body: JSON.stringify({
          receiptNo,
          date,
          projectName,
          receiver,
          purchaseRequestNo,
          supplier,
          buyerName,
          purchasePackageNo,
          releaseNoteNo,
          purchaseBy: purchaseBy || undefined,
          islandSystem,
          waybillNo,
          storekeeper,
          receiverManager: receiverManager || receiver,
          equipmentSupply,
          mapnaSiteManager,
          notes,
          items: selectedEntries,
        }),
      });
      notify(
        'success',
        isFa
          ? `رسید مصرف مستقیم کالا شماره ${res.document.receiptNo} ثبت و موجودی‌ها به‌روزرسانی شد.`
          : `Direct Material Consumption Receipt ${res.document.receiptNo} created.`,
      );
      setReceiptNo('');
      setReceiver('');
      setPurchaseRequestNo('');
      setSupplier('');
      setBuyerName('');
      setPurchasePackageNo('');
      setReleaseNoteNo('');
      setPurchaseBy('');
      setIslandSystem('');
      setWaybillNo('');
      setStorekeeper('');
      setReceiverManager('');
      setEquipmentSupply('');
      setMapnaSiteManager('');
      setNotes('');
      setQtyMap({});
      setRemarkMap({});
      setPrintDoc(res.document);
      triggerAutoSnapshot(`GCV ${res.document.receiptNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const historyColumns = useMemo<CsvColumnDef<GcvDocumentRecord>[]>(
    () => [
      { key: 'receiptNo', header: t.headers.gcvReceiptNo, getValue: (r) => r.receiptNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'projectName', header: isFa ? 'پروژه' : 'Project', getValue: (r) => r.projectName || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'releaseNoteNo', header: 'Release Note No.', getValue: (r) => r.releaseNoteNo || '' },
      { key: 'waybillNo', header: isFa ? 'شماره بارنامه' : 'Waybill No.', getValue: (r) => r.waybillNo || '' },
      { key: 'receiver', header: t.headers.receiver, getValue: (r) => r.receiver },
      { key: 'itemCount', header: isFa ? 'تعداد اقلام' : 'Items', getValue: (r) => r.items.length },
      {
        key: 'itemsSummary',
        header: isFa ? 'شرح اقلام' : 'Items Summary',
        getValue: (r) =>
          r.items.map((i) => `${i.shipmentNo}/${i.packageNo}#${i.itemNo} (${i.qty})`).join(' | '),
      },
      { key: 'createdBy', header: isFa ? 'ثبت‌کننده' : 'Created By', getValue: (r) => r.createdBy },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa],
  );

  return (
    <div className="space-y-6">
      {/* Dedicated A4 Landscape Portal for Official MD1EX-FQP02/11-03 GCV Sheet */}
      {printDoc && !printReportOpen
        ? createPortal(
            <div id="samaan-gcv-print-root">
              <style>{`
                @media screen {
                  #samaan-gcv-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 landscape;
                    margin: 7mm;
                  }
                  body > *:not(#samaan-gcv-print-root) {
                    display: none !important;
                  }
                  #samaan-gcv-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-gcv-print-root table th,
                  #samaan-gcv-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialGcvSheet
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
              <FileCheck2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'ثبت رسید مصرف مستقیم کالا (GCV)' : 'Not-Stored Goods Consumption Voucher (GCV)'}</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              MD1EX-FQP02/11-03
            </span>
          </div>

          {/* Row 1: Core Document Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.gcvReceiptNo} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !receiptNo ? 'rtl' : 'ltr'}
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="GCV-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !receiptNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ رسید' : 'Receipt Date'} *`}
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
                {t.headers.receiver} *
              </label>
              <input
                type="text"
                required
                dir={!receiver ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                placeholder={isFa ? 'تحویل گیرنده / پیمانکار نصب' : 'Receiver / Installer'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره Release Note' : 'Realised Note No.'}
              </label>
              <input
                type="text"
                dir={isFa && !releaseNoteNo ? 'rtl' : 'ltr'}
                value={releaseNoteNo}
                onChange={(e) => setReleaseNoteNo(e.target.value)}
                placeholder="RN-..."
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !releaseNoteNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 2: Procurement & Transport Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'درخواست خرید' : 'Purchase Req. No.'}
              </label>
              <input
                type="text"
                dir={isFa && !purchaseRequestNo ? 'rtl' : 'ltr'}
                value={purchaseRequestNo}
                onChange={(e) => setPurchaseRequestNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !purchaseRequestNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

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
                {isFa ? 'کارشناس خرید' : 'Buyer Name'}
              </label>
              <input
                type="text"
                dir={!buyerName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
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

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'جزیره/سیستم' : 'Island / System'}
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
                {isFa ? 'شماره بارنامه' : 'Waybill No.'}
              </label>
              <input
                type="text"
                dir={isFa && !waybillNo ? 'rtl' : 'ltr'}
                value={waybillNo}
                onChange={(e) => setWaybillNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !waybillNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 3: Purchase By + Signatures */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'خرید توسط' : 'Purchased By'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'tehran_proc', fa: 'تدارکات تهران', en: 'Tehran Proc.' },
                  { id: 'site_admin', fa: 'مالی- اداری کارگاه', en: 'Site Admin' },
                  { id: 'contractor_supplier', fa: 'پیمانکار تامین کننده', en: 'Contractor' },
                ].map((opt) => {
                  const active = purchaseBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setPurchaseBy((prev) =>
                          prev === opt.id
                            ? ''
                            : (opt.id as 'tehran_proc' | 'site_admin' | 'contractor_supplier'),
                        )
                      }
                      className={`h-9 px-2 rounded-lg border text-[11px] font-medium transition-colors truncate ${
                        active
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                      }`}
                      title={isFa ? opt.fa : opt.en}
                    >
                      {isFa ? opt.fa : opt.en}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-2">
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

            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'مدیر پروژه / سرپرست (تحویل‌گیرنده)' : 'Receiver Manager / Tech'}
              </label>
              <input
                type="text"
                dir={!receiverManager ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={receiverManager}
                onChange={(e) => setReceiverManager(e.target.value)}
                placeholder={receiver || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تأمین تجهیزات (مپنا)' : 'Equipment Supply (MAPNA)'}
              </label>
              <input
                type="text"
                dir={!equipmentSupply ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={equipmentSupply}
                onChange={(e) => setEquipmentSupply(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'مدیر پروژه / سرپرست (مپنا)' : 'MAPNA Project / Site Mgr'}
              </label>
              <input
                type="text"
                dir={!mapnaSiteManager ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={mapnaSiteManager}
                onChange={(e) => setMapnaSiteManager(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'ملاحظات / Remark عمومی' : 'General Remark / Notes'}
              </label>
              <input
                type="text"
                dir={!notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Deliverable Items Selection Table */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa
                  ? 'اقلام آماده تحویل از موجودی مپنا (دارای بازرسی ثبت‌شده)'
                  : 'Deliverable Items from MAPNA Stock (OPI Recorded)'}
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
                    <th className="py-2 px-3">{t.headers.size}</th>
                    <th className="py-2 px-3">{t.headers.mapnaInventory}</th>
                    <th className="py-2 px-3">{t.headers.gcvDeliveredQty}</th>
                    <th className="py-2 px-3">{isFa ? 'ملاحظات ردیف' : 'Remark'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {deliverableItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                        {isFa
                          ? 'موردی با موجودی مپنا و بازرسی ثبت‌شده یافت نشد.'
                          : 'No items with available MAPNA inventory found.'}
                      </td>
                    </tr>
                  ) : (
                    deliverableItems.map((item) => (
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
                          className="py-2 px-3 max-w-[230px] truncate bidi-plaintext"
                          title={item.description}
                        >
                          {item.description || item.generalDescription}
                        </td>
                        <td className="py-2 px-3 bidi-plaintext">{item.size || '-'}</td>
                        <td className="py-2 px-3 font-semibold text-[var(--accent-primary)] tabular-nums">
                          {item.mapnaInventory} {item.countingUnit}
                        </td>
                        <td className="py-2 px-3 w-36">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max={item.mapnaInventory}
                              dir={isFa && !qtyMap[item.id] ? 'rtl' : 'ltr'}
                              value={qtyMap[item.id] || ''}
                              onChange={(e) => updateItemQty(item, e.target.value)}
                              placeholder="0"
                              className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(item, String(item.mapnaInventory))}
                              className="px-2 h-8 rounded bg-[var(--bg-subtle)] text-[10px] font-semibold hover:bg-[var(--accent-soft)]"
                            >
                              {isFa ? 'کل' : 'Max'}
                            </button>
                          </div>
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
                    ))
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
              <span>{isFa ? 'ثبت رسید مصرف مستقیم کالا و صدور فرم' : 'Save Receipt & Print'}</span>
            </button>
          </div>
        </form>
      )}

      {/* GCV Document History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق رسید مصرف مستقیم کالا' : 'Recorded Direct Consumption Receipts'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv({
                  rows: data?.documents || [],
                  columns: historyColumns,
                  filename: 'samaan-gcv-receipts',
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
                <th className="py-2.5 px-4">{t.headers.gcvReceiptNo}</th>
                <th className="py-2.5 px-4">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4">{t.headers.supplier}</th>
                <th className="py-2.5 px-4">{isFa ? 'بارنامه / Release Note' : 'Waybill / Release'}</th>
                <th className="py-2.5 px-4">{t.headers.receiver}</th>
                <th className="py-2.5 px-4">{isFa ? 'تعداد اقلام' : 'Items'}</th>
                <th className="py-2.5 px-4">{isFa ? 'ثبت‌کننده' : 'Created By'}</th>
                <th className="py-2.5 px-4">{t.controls.print}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : (data?.documents || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                (data?.documents || []).map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                      {doc.receiptNo}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {formatDate(doc.date)}
                    </td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.supplier || '-'}</td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {[doc.waybillNo, doc.releaseNoteNo].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.receiver}</td>
                    <td className="py-2.5 px-4 tabular-nums">{doc.items.length}</td>
                    <td className="py-2.5 px-4">{doc.createdBy}</td>
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

      {/* Printable Official MD1EX-FQP02/11-03 Landscape Modal */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی رسید مصرف مستقیم کالا' : 'Official Not-Stored Goods Consumption Voucher'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/11-03 · {printDoc.receiptNo}
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
                <OfficialGcvSheet
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
        title={t.nav.gcv}
        columns={historyColumns}
        rows={data?.documents || []}
      />
    </div>
  );
};
