import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ClipboardList, Download, Printer, Search, X } from 'lucide-react';
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

interface MivViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

type MivOnlyType = 'miv_contractor' | 'miv_mapna';

interface OfficialMivSheetProps {
  doc: MivDocumentRecord;
  detailedItems: DetailedComputed[];
  formatDate: (iso: string) => string;
}

const OfficialMivSheet: React.FC<OfficialMivSheetProps> = ({
  doc,
  detailedItems,
  formatDate,
}) => {
  const detailedById = useMemo(() => {
    const map = new Map<string, DetailedComputed>();
    for (const d of detailedItems) map.set(d.id, d);
    return map;
  }, [detailedItems]);

  const minRows = 9;
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
        {/* Header Row (Unified white strip with no internal vertical lines) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '125px 1fr 185px',
            alignItems: 'stretch',
            borderBottom: '1.5px solid #000000',
            padding: '5px 10px',
          }}
        >
          {/* Right: Stacked Logo */}
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

          {/* Center: Titles */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              lineHeight: 1.6,
              padding: '2px 8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700 }}>
              شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
              پروژه {doc.projectName?.trim() || '......................'}
            </div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '2px' }}>
              درخواست کالا از انبار و حواله انبار
            </div>
          </div>

          {/* Left: شماره / تاریخ / صفحه ... از ... */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '4px 6px',
              fontSize: '10px',
              fontWeight: 700,
              textAlign: 'right',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <span>شماره:</span>
              <span dir="ltr" className="tabular-nums">
                {doc.docNo}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <span>تاریخ:</span>
              <span dir="ltr" className="tabular-nums">
                {formatDate(doc.date)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
              <span>صفحه</span>
              <span className="tabular-nums">1 &nbsp;&nbsp; از &nbsp;&nbsp; 1</span>
            </div>
          </div>
        </div>

        {/* Metadata Strip Row (Continuous white strip without internal vertical borders) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1.25fr 1fr 0.7fr 0.95fr',
            alignItems: 'center',
            borderBottom: '1px solid #000000',
            padding: '5px 8px',
            fontSize: '9.3px',
            textAlign: 'right',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontWeight: 700, lineHeight: 1.35, flexShrink: 0 }}>
              <div>شماره قرارداد /</div>
              <div>درخواست خرید:</div>
            </div>
            <span dir="ltr" className="tabular-nums bidi-plaintext">
              {doc.contractNo || ''}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontWeight: 700, lineHeight: 1.35, flexShrink: 0 }}>
              <div>پیمانکار /</div>
              <div>درخواست کننده:</div>
            </div>
            <span className="bidi-plaintext">{doc.party || ''}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontWeight: 700, lineHeight: 1.35, flexShrink: 0 }}>
              <div>سیستم /</div>
              <div>جزیره:</div>
            </div>
            <span className="bidi-plaintext">{doc.islandSystem || ''}</span>
          </div>

          <div>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{doc.unit || ''}</span>
          </div>

          <div>
            <strong style={{ fontWeight: 700 }}>شماره رسید: </strong>
            <span dir="ltr" className="tabular-nums">
              {doc.receiptNo || ''}
            </span>
          </div>
        </div>

        {/* 13-Column LTR Table */}
        <table
          dir="ltr"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: '8.8px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
              <th style={{ width: '3.8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 2px' }}>
                No
              </th>
              <th style={{ width: '6.2%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Package No.
              </th>
              <th style={{ width: '5.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Package Item
              </th>
              <th style={{ width: '21%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Description Of Material
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Technical info/Size
              </th>
              <th style={{ width: '5.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Tag No.
              </th>
              <th style={{ width: '5.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Code No.
              </th>
              <th style={{ width: '8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Location
              </th>
              <th style={{ width: '7.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Requested Quantity
              </th>
              <th style={{ width: '7%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Issued Quantity
              </th>
              <th style={{ width: '5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                UOM
              </th>
              <th style={{ width: '5.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                OPI No.
              </th>
              <th style={{ width: '11.5%', borderBottom: '1px solid #000000', padding: '5px 4px' }}>
                Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => {
              const detailed = row ? detailedById.get(row.detailedId) : undefined;
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              const pkgText = row ? row.packageNo || row.shipmentNo : '';
              const techText = row ? row.technicalInfo || detailed?.size || '' : '';
              const tagText = row ? row.tagNo || detailed?.itemCode || '' : '';
              const codeText = row ? row.codeNo || detailed?.itemCode || '' : '';
              const locText = row ? row.location || detailed?.storageLocation || '' : '';
              const reqQty = row ? row.requestedQty ?? row.qty : '';
              const uomText = row ? row.uom || detailed?.countingUnit || '' : '';
              const opiText = row ? row.opiNo || detailed?.opiNo || '' : '';
              const remarkText = row ? row.remark || (idx === 0 && doc.notes ? doc.notes : '') : '';

              return (
                <tr key={row ? `${row.detailedId}-${idx}` : `empty-${idx}`} style={{ height: '27px' }}>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {row ? idx + 1 : ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {pkgText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {row?.itemNo || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 4px', wordBreak: 'break-word' }}
                  >
                    {row?.description || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {techText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {tagText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {codeText}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {locText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {reqQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', fontWeight: 700 }}
                  >
                    {row ? row.qty : ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {uomText}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {opiText}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, padding: '3px 4px', wordBreak: 'break-word' }}
                  >
                    {remarkText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Separate Lower Signature Frame */}
      <div style={{ border: '1.8px solid #000000', marginTop: '10px' }}>
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

        {/* Signatures Row (5 sections RTL: انباردار | تأمین تجهیزات توسعه یک | دفتر فنی توسعه یک | بخش نصب توسعه یک | پیمانکار / درخواست کننده) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '0.9fr 1fr 1fr 1fr 2fr',
            minHeight: '78px',
            borderBottom: '1px solid #000000',
            fontSize: '9.2px',
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
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.storekeeper || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>تأمین تجهیزات توسعه یک:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.equipmentSupply || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>دفتر فنی توسعه یک:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.techOffice || ''}
            </div>
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
              <div style={{ fontWeight: 700 }}>بخش نصب توسعه یک:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }} className="bidi-plaintext">
              {doc.installationDept || ''}
            </div>
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
                padding: '5px 8px',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>درخواست کننده:</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء</div>
                </div>
                <div style={{ fontSize: '9px' }} className="bidi-plaintext">
                  {doc.requester || doc.party || ''}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>تحویل گیرنده:</div>
                  <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء</div>
                </div>
                <div style={{ fontSize: '9px' }} className="bidi-plaintext">
                  {doc.receiver || ''}
                </div>
              </div>
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
          توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمی باشد.
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
        <div>رونوشت: معاونت تأمین تجهیزات ، دفتر فنی مپنا، پیمانکار نصب</div>
        <div dir="ltr" className="tabular-nums">
          MD1EX-FQP02/05-03
        </div>
      </div>
    </div>
  );
};

export const MivView: React.FC<MivViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<MivApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [docType, setDocType] = useState<MivOnlyType>('miv_contractor');
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [projectName, setProjectName] = useState('');
  const [contractNo, setContractNo] = useState('');
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
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [reqQtyMap, setReqQtyMap] = useState<Record<string, string>>({});
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
      if (type === 'miv_contractor') {
        return isFa ? 'درخواست و حواله مصرف پیمانکار (MIV Contractor)' : 'MIV Contractor Issue';
      }
      return isFa ? 'درخواست و حواله تحویل/مصرف مپنا (MIV MAPNA)' : 'MIV MAPNA Issue';
    },
    [isFa],
  );

  const mivDocuments = useMemo(
    () => (data?.documents || []).filter((d) => d.docType.startsWith('miv_')),
    [data],
  );

  const getAvailableQty = (item: DetailedComputed, type: MivOnlyType) => {
    if (type === 'miv_contractor') return item.contractorInventory;
    return item.mapnaInventory;
  };

  const eligibleItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter((d) => {
      if (docType === 'miv_contractor') return d.contractorInventory > 0;
      return !d.opiPending && d.mapnaInventory > 0;
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

      const combinedIslandSystem = [
        item.system || genMatch?.system,
        item.island || genMatch?.island,
      ]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(' / ');

      if (!islandSystem.trim() && combinedIslandSystem) {
        setIslandSystem(combinedIslandSystem);
      }
      if (!unit.trim() && (item.unit || genMatch?.unit)) {
        setUnit(item.unit || genMatch?.unit || '');
      }
      if (!receiptNo.trim() && (item.gcvReceiptNo || genMatch?.mapnaEntryMinutesNo)) {
        setReceiptNo(item.gcvReceiptNo || genMatch?.mapnaEntryMinutesNo || '');
      }
    },
    [data?.generalEntries, islandSystem, unit, receiptNo],
  );

  const updateIssuedQty = (item: DetailedComputed, value: string) => {
    setQtyMap((prev) => ({ ...prev, [item.id]: value }));
    if (Number(value) > 0) {
      autoFillFromItem(item);
      setReqQtyMap((prev) => (prev[item.id] ? prev : { ...prev, [item.id]: value }));
    }
  };

  const selectedEntries = useMemo(() => {
    return Object.entries(qtyMap)
      .map(([detailedId, val]) => {
        const det = detailedLookup.get(detailedId);
        const qty = Number(val);
        const reqRaw = Number(reqQtyMap[detailedId]);
        return {
          detailedId,
          qty,
          requestedQty: Number.isFinite(reqRaw) && reqRaw > 0 ? reqRaw : qty,
          technicalInfo: det?.size || '',
          tagNo: det?.itemCode || '',
          codeNo: det?.itemCode || '',
          location: det?.storageLocation || '',
          uom: det?.countingUnit || '',
          opiNo: det?.opiNo || '',
          remark: (remarkMap[detailedId] || '').trim(),
        };
      })
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
  }, [qtyMap, reqQtyMap, remarkMap, detailedLookup]);

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
          contractNo,
          islandSystem,
          unit,
          receiptNo,
          storekeeper,
          equipmentSupply,
          techOffice,
          installationDept,
          requester,
          receiver,
          notes,
          items: selectedEntries,
        }),
      });
      notify(
        'success',
        isFa
          ? `حواله انبار شماره ${res.document.docNo} ثبت و موجودی اقلام به‌روزرسانی شد.`
          : `MIV Document ${res.document.docNo} saved.`,
      );
      setDocNo('');
      setContractNo('');
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
      setNotes('');
      setQtyMap({});
      setReqQtyMap({});
      setRemarkMap({});
      setPrintDoc(res.document);
      triggerAutoSnapshot(`MIV ${res.document.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const historyColumns = useMemo<CsvColumnDef<MivDocumentRecord>[]>(
    () => [
      { key: 'docType', header: isFa ? 'نوع حواله' : 'Type', getValue: (r) => docTypeLabel(r.docType) },
      { key: 'docNo', header: isFa ? 'شماره حواله' : 'Doc No.', getValue: (r) => r.docNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'projectName', header: isFa ? 'پروژه' : 'Project', getValue: (r) => r.projectName || '' },
      { key: 'contractNo', header: isFa ? 'شماره قرارداد/درخواست' : 'Contract / Req No.', getValue: (r) => r.contractNo || '' },
      { key: 'party', header: isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor / Party', getValue: (r) => r.party || '' },
      { key: 'receiptNo', header: isFa ? 'شماره رسید' : 'Receipt No.', getValue: (r) => r.receiptNo || '' },
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
      {/* Dedicated A4 Landscape Portal for Official MD1EX-FQP02/05-03 MIV Sheet */}
      {printDoc && !printReportOpen
        ? createPortal(
            <div id="samaan-miv-print-root">
              <style>{`
                @media screen {
                  #samaan-miv-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 landscape;
                    margin: 7mm;
                  }
                  body > *:not(#samaan-miv-print-root) {
                    display: none !important;
                  }
                  #samaan-miv-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-miv-print-root table th,
                  #samaan-miv-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialMivSheet
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
              <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.miv}</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              MD1EX-FQP02/05-03
            </span>
          </div>

          {/* Row 1: Type, Doc No, Date, Project, Contract */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نوع درخواست / حواله انبار' : 'Requisition / Issue Type'} *
              </label>
              <select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value as MivOnlyType);
                  setQtyMap({});
                  setReqQtyMap({});
                }}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="miv_contractor">{docTypeLabel('miv_contractor')}</option>
                <option value="miv_mapna">{docTypeLabel('miv_mapna')}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره حواله انبار' : 'MIV Doc No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="MIV-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !docNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ حواله' : 'Issue Date'} *`}
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
                {isFa ? 'شماره قرارداد / درخواست خرید' : 'Contract / Req. No.'}
              </label>
              <input
                type="text"
                dir={isFa && !contractNo ? 'rtl' : 'ltr'}
                value={contractNo}
                onChange={(e) => setContractNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !contractNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 2: Party, System/Island, Unit, Receipt No */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پیمانکار / درخواست کننده' : 'Contractor / Requester'}
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
                {isFa ? 'سیستم / جزیره' : 'System / Island'}
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
                {isFa ? 'واحد' : 'Unit'}
              </label>
              <input
                type="text"
                dir={!unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره رسید' : 'Receipt No.'}
              </label>
              <input
                type="text"
                dir={isFa && !receiptNo ? 'rtl' : 'ltr'}
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !receiptNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 3: Signatures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
                {isFa ? 'دفتر فنی توسعه یک' : 'MD1 Tech Office'}
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
                {isFa ? 'بخش نصب توسعه یک' : 'MD1 Installation Dept.'}
              </label>
              <input
                type="text"
                dir={!installationDept ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={installationDept}
                onChange={(e) => setInstallationDept(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'درخواست کننده (پیمانکار)' : 'Requester'}
              </label>
              <input
                type="text"
                dir={!requester ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                placeholder={party || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تحویل گیرنده (پیمانکار)' : 'Receiver'}
              </label>
              <input
                type="text"
                dir={!receiver ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa ? 'انتخاب اقلام، تعداد درخواستی و تعداد تحویل' : 'Select Items & Requested / Issued Quantities'}
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
                      {docType === 'miv_mapna' ? t.headers.mapnaInventory : t.headers.contractorInventory}
                    </th>
                    <th className="py-2 px-3">{isFa ? 'مقدار درخواستی' : 'Req. Qty'}</th>
                    <th className="py-2 px-3">{isFa ? 'مقدار تحویلی' : 'Issued Qty'}</th>
                    <th className="py-2 px-3">{isFa ? 'ملاحظات ردیف' : 'Remark'}</th>
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
                            className="py-2 px-3 max-w-[220px] truncate bidi-plaintext"
                            title={item.description}
                          >
                            {item.description || item.generalDescription}
                          </td>
                          <td className="py-2 px-3 font-semibold text-[var(--accent-primary)] tabular-nums">
                            {avail} {item.countingUnit}
                          </td>
                          <td className="py-2 px-3 w-24">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              dir={isFa && !reqQtyMap[item.id] ? 'rtl' : 'ltr'}
                              value={reqQtyMap[item.id] || ''}
                              onChange={(e) =>
                                setReqQtyMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder={qtyMap[item.id] || '0'}
                              className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                          </td>
                          <td className="py-2 px-3 w-36">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max={avail}
                                dir={isFa && !qtyMap[item.id] ? 'rtl' : 'ltr'}
                                value={qtyMap[item.id] || ''}
                                onChange={(e) => updateIssuedQty(item, e.target.value)}
                                placeholder="0"
                                className="w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                              {avail > 0 && (
                                <button
                                  type="button"
                                  onClick={() => updateIssuedQty(item, String(avail))}
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
              <span>{isFa ? 'ثبت حواله انبار و چاپ فرم' : 'Save & Print MIV'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Document History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق درخواست کالا و حواله انبار (MIV)' : 'MIV Issue History'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv({
                  rows: mivDocuments,
                  columns: historyColumns,
                  filename: 'samaan-miv-history',
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
                <th className="py-2.5 px-4">{isFa ? 'شماره سند' : 'Doc No.'}</th>
                <th className="py-2.5 px-4">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4">{isFa ? 'شماره قرارداد' : 'Contract'}</th>
                <th className="py-2.5 px-4">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Party'}</th>
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
              ) : mivDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                mivDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-medium">{docTypeLabel(doc.docType)}</td>
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                      {doc.docNo}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {formatDate(doc.date)}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                      {doc.contractNo || '-'}
                    </td>
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

      {/* Printable Official MD1EX-FQP02/05-03 MIV Landscape Modal */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی درخواست کالا از انبار و حواله انبار' : 'Official Material Issue Voucher (MIV)'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/05-03 · {printDoc.docNo}
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
              <div className="mx-auto min-w-[940px] max-w-[1060px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialMivSheet
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
        title={t.nav.miv}
        columns={historyColumns}
        rows={mivDocuments}
      />
    </div>
  );
};
