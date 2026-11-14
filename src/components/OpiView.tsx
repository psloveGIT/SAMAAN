import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

const MD1_STACKED_LOGO = '/assets/aistudio/______________________________65f1164c.png';

const buildOpiItemsForPackings = (
  packings: string[],
  detailedItems: DetailedComputed[],
  generalEntries: GeneralEntry[],
): OpiInvitationLineItem[] => {
  const rows: OpiInvitationLineItem[] = [];
  for (const pk of packings) {
    const detMatches = detailedItems.filter((d) => (d.shipmentNo || '').trim() === pk);
    if (detMatches.length > 0) {
      for (const d of detMatches) {
        rows.push({
          itemNo: d.itemNo || '',
          packingListNo: d.shipmentNo || pk,
          packageNo: d.packageNo || '',
          description: d.description || d.generalDescription || '',
          uom: d.countingUnit || '',
          remarks: d.notes || '',
        });
      }
    } else {
      const genMatches = generalEntries.filter((g) => (g.packingListNo || '').trim() === pk);
      if (genMatches.length > 0) {
        genMatches.forEach((g, idx) => {
          rows.push({
            itemNo: String(idx + 1),
            packingListNo: g.packingListNo || pk,
            packageNo: g.packageNo || '',
            description: g.itemDescription || '',
            uom: 'بسته',
            remarks: '',
          });
        });
      } else {
        rows.push({
          itemNo: '',
          packingListNo: pk,
          packageNo: '',
          description: '',
          uom: '',
          remarks: '',
        });
      }
    }
  }
  return rows;
};

interface OfficialOpiSheetProps {
  record: OpiInvitationRecord;
  detailedItems: DetailedComputed[];
  generalEntries: GeneralEntry[];
  formatDate: (iso: string) => string;
}

const OfficialOpiInvitationSheet: React.FC<OfficialOpiSheetProps> = ({
  record,
  detailedItems,
  generalEntries,
  formatDate,
}) => {
  const resolvedItems = useMemo(() => {
    if (record.items && record.items.length > 0) return record.items;
    return buildOpiItemsForPackings(record.packingNos || [], detailedItems, generalEntries);
  }, [record, detailedItems, generalEntries]);

  const minRows = 11;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: (OpiInvitationLineItem | null)[] = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
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
      {/* Main Upper Frame */}
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Header Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 190px',
            borderBottom: '1.5px solid #000000',
          }}
        >
          {/* Right + Center: Logo + Centered Title */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '118px 1fr',
              alignItems: 'center',
              padding: '6px 8px',
            }}
          >
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
                style={{ height: '56px', width: 'auto', objectFit: 'contain', display: 'block' }}
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

            <div
              style={{
                textAlign: 'center',
                lineHeight: 1.55,
                padding: '2px 8px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700 }}>
                شرکت احداث و توسعه نیروگاه های مپنا – توسعه یک (MD1)
              </div>
              <div style={{ fontSize: '11.5px', fontWeight: 700 }}>
                پروژه {record.projectName?.trim() || '..................'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '2px' }}>
                دعوتنامه گشایش و بازرسی بسته ها
              </div>
              <div dir="ltr" style={{ fontSize: '12px', fontWeight: 700 }}>
                OPI Invitation
              </div>
            </div>
          </div>

          {/* Left Box: Invitation No & Issue Date */}
          <div
            style={{
              borderRight: '1.5px solid #000000',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '10px',
              fontWeight: 700,
              textAlign: 'right',
            }}
          >
            <div>
              <div>شماره دعوتنامه:</div>
              <div dir="ltr" className="tabular-nums" style={{ marginTop: '2px', textAlign: 'left' }}>
                {record.invitationNo}
              </div>
            </div>
            <div>
              <div>تاریخ:</div>
              <div dir="ltr" className="tabular-nums" style={{ marginTop: '2px', textAlign: 'left' }}>
                {formatDate(record.issueDate || record.date)}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Strip Row 1 */}
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
            <span className="bidi-plaintext">{record.projectName || ''}</span>
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

        {/* Metadata Strip Row 2 */}
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
            <span dir="ltr" className="tabular-nums">
              {record.contractNo || ''}
            </span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.purchasePackageNo || ''}
            </span>
          </div>
        </div>

        {/* Formal Request Text */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '7px 10px',
            fontSize: '10.3px',
            fontWeight: 600,
            lineHeight: 1.85,
            textAlign: 'right',
          }}
        >
          بدینوسیله از نمایندگان محترم کارفرما، مشاور، تامین کننده و پیمانکار نصاب صمیمانه تقاضا میشود در بازگشایی (OPI) اقلام مشروحه ذیل در مکان و زمان قید شده همکاری نمایند.
        </div>

        {/* Items Table (LTR column order matching PDF: Item No., Packing List No., Package No., شرح کالا, واحد (UOM), توضیحات) */}
        <table
          dir="ltr"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.5px',
            tableLayout: 'fixed',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  width: '7%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 3px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                Item
                <br />
                No.
              </th>
              <th
                style={{
                  width: '15%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                Packing List
                <br />
                No.
              </th>
              <th
                style={{
                  width: '13%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                Package
                <br />
                No.
              </th>
              <th
                dir="rtl"
                style={{
                  width: '35%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                }}
              >
                شرح کالا
              </th>
              <th
                dir="rtl"
                style={{
                  width: '9%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 3px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                واحد
                <br />
                <span dir="ltr">(UOM)</span>
              </th>
              <th
                dir="rtl"
                style={{
                  width: '21%',
                  borderBottom: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                }}
              >
                توضیحات
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => (
              <tr key={idx} style={{ height: '27px' }}>
                <td
                  className="tabular-nums"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '3px 3px',
                  }}
                >
                  {row?.itemNo || ''}
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    borderBottom: '1px solid #000000',
                    borderRight: '1px solid #000000',
                    padding: '3px 4px',
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
                    padding: '3px 4px',
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
                    padding: '3px 5px',
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
                    padding: '3px 3px',
                  }}
                >
                  {row?.uom || ''}
                </td>
                <td
                  dir="auto"
                  className="bidi-plaintext"
                  style={{
                    borderBottom: '1px solid #000000',
                    padding: '3px 5px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.remarks || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Time / Date / Location Footer Table (RTL: زمان | تاریخ | مکان) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            fontSize: '10.5px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>زمان</div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>تاریخ</div>
          <div style={{ padding: '5px 6px' }}>مکان</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            minHeight: '52px',
            fontSize: '10.5px',
            fontWeight: 600,
            textAlign: 'center',
            alignItems: 'center',
          }}
        >
          <div
            dir="ltr"
            className="tabular-nums"
            style={{
              borderLeft: '1px solid #000000',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
            }}
          >
            {record.time}
          </div>
          <div
            dir="ltr"
            className="tabular-nums"
            style={{
              borderLeft: '1px solid #000000',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
            }}
          >
            {formatDate(record.date)}
          </div>
          <div
            className="bidi-plaintext"
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
            }}
          >
            {record.location || ''}
          </div>
        </div>
      </div>

      {/* Separate Lower Approval Frame */}
      <div style={{ border: '1.8px solid #000000', marginTop: '14px' }}>
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            minHeight: '86px',
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
              <div style={{ fontWeight: 700 }}>تامین تجهیزات توسعه یک:</div>
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

        <div
          style={{
            padding: '2px 8px 4px',
            fontSize: '8.3px',
            fontWeight: 600,
            textAlign: 'left',
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
          <div>رونوشت : معاونت تأمین تجهیزات ؛ کارفرما، مشاور، تامین کننده</div>
          <div dir="ltr" className="tabular-nums">
            MD1EX-FQP02/02-03
          </div>
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

interface ResultRowDraft {
  selected: boolean;
  actualQty: string;
  damagedQty: string;
  repNo: string;
  repStatus: string;
  repDescription: string;
  notes: string;
}

interface OpiViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const OpiView: React.FC<OpiViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [tab, setTab] = useState<'invitation' | 'results'>('invitation');
  const [data, setData] = useState<OpiApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Invitation Form State
  const [invitationNo, setInvitationNo] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayIso());
  const [date, setDate] = useState(getTodayIso());
  const [time, setTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [projectName, setProjectName] = useState('');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [items, setItems] = useState<OpiInvitationLineItem[]>([]);
  const [installerContractor, setInstallerContractor] = useState('');
  const [supplierRep, setSupplierRep] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [employerRep, setEmployerRep] = useState('');
  const [notes, setNotes] = useState('');
  const [packingSearch, setPackingSearch] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);

  // Print Invitation Preview & Report Modals
  const [printInvitation, setPrintInvitation] = useState<OpiInvitationRecord | null>(null);
  const [printInvTableOpen, setPrintInvTableOpen] = useState(false);
  const [printItemsTableOpen, setPrintItemsTableOpen] = useState(false);

  // OPI Results Recording State
  const [resultInvitationId, setResultInvitationId] = useState('');
  const [resultPackingFilter, setResultPackingFilter] = useState('');
  const [resultOpiNo, setResultOpiNo] = useState('');
  const [resultOpiDate, setResultOpiDate] = useState(getTodayIso());
  const [rowDrafts, setRowDrafts] = useState<Record<string, ResultRowDraft>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<OpiApiResponse>('/api/opi');
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

  const filteredPackings = useMemo(() => {
    const all = data?.packings || [];
    const needle = packingSearch.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((p) => p.toLowerCase().includes(needle));
  }, [data, packingSearch]);

  const togglePacking = (pk: string) => {
    const isRemoving = selectedPackings.includes(pk);
    const nextPackings = isRemoving
      ? selectedPackings.filter((x) => x !== pk)
      : [...selectedPackings, pk];

    setSelectedPackings(nextPackings);

    const detItems = data?.detailedItems || [];
    const genEntries = data?.generalEntries || [];
    if (!isRemoving) {
      const genMatch = genEntries.find((g) => (g.packingListNo || '').trim() === pk);
      const detMatch = detItems.find((d) => (d.shipmentNo || '').trim() === pk);
      if (!system && (genMatch?.system || detMatch?.system)) {
        setSystem(genMatch?.system || detMatch?.system || '');
      }
      if (!island && (genMatch?.island || detMatch?.island)) {
        setIsland(genMatch?.island || detMatch?.island || '');
      }
      if (!unit && (genMatch?.unit || detMatch?.unit)) {
        setUnit(genMatch?.unit || detMatch?.unit || '');
      }
      if (!supplier && (genMatch?.supplier || detMatch?.supplier)) {
        setSupplier(genMatch?.supplier || detMatch?.supplier || '');
      }
      const addedRows = buildOpiItemsForPackings([pk], detItems, genEntries);
      setItems((prev) => [...prev, ...addedRows]);
    } else {
      setItems((prev) => prev.filter((it) => it.packingListNo !== pk));
    }
  };

  const updateItemField = (index: number, key: keyof OpiInvitationLineItem, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  };

  const addBlankItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        itemNo: '',
        packingListNo: selectedPackings[0] || '',
        packageNo: '',
        description: '',
        uom: '',
        remarks: '',
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPackings.length === 0) {
      notify('warning', isFa ? 'حداقل یک پکینگ لیست انتخاب کنید.' : 'Select at least one Packing List.');
      return;
    }
    try {
      const res = await apiRequest<{ invitation: OpiInvitationRecord }>('/api/opi', {
        method: 'POST',
        body: JSON.stringify({
          invitationNo,
          issueDate,
          date,
          time,
          packingNos: selectedPackings,
          location,
          projectName,
          system,
          island,
          unit,
          supplier,
          contractNo,
          purchasePackageNo,
          items,
          installerContractor,
          supplierRep,
          equipmentSupply,
          employerRep,
          notes,
        }),
      });
      notify(
        'success',
        isFa
          ? `دعوتنامه گشایش و بازرسی شماره ${res.invitation.invitationNo} صادر شد.`
          : `Inspection Invitation ${res.invitation.invitationNo} issued.`,
      );
      setInvitationNo('');
      setLocation('');
      setContractNo('');
      setPurchasePackageNo('');
      setSystem('');
      setIsland('');
      setUnit('');
      setSupplier('');
      setItems([]);
      setInstallerContractor('');
      setSupplierRep('');
      setEquipmentSupply('');
      setEmployerRep('');
      setNotes('');
      setSelectedPackings([]);
      setPrintInvitation(res.invitation);
      triggerAutoSnapshot(`OPI ${res.invitation.invitationNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Filtered detailed items for recording OPI results
  const selectedInvitation = useMemo(
    () => (data?.invitations || []).find((inv) => inv.id === resultInvitationId) || null,
    [data, resultInvitationId],
  );

  const itemsForResults = useMemo(() => {
    const all = data?.detailedItems || [];
    return all.filter((d) => {
      if (selectedInvitation && !selectedInvitation.packingNos.includes(d.shipmentNo)) {
        return false;
      }
      if (resultPackingFilter && d.shipmentNo !== resultPackingFilter) {
        return false;
      }
      return true;
    });
  }, [data, selectedInvitation, resultPackingFilter]);

  useEffect(() => {
    if (selectedInvitation) {
      setResultOpiNo(selectedInvitation.invitationNo);
      setResultOpiDate(selectedInvitation.date || getTodayIso());
    }
  }, [selectedInvitation]);

  const getDraft = (item: DetailedComputed): ResultRowDraft => {
    return (
      rowDrafts[item.id] || {
        selected: item.actualQty === null,
        actualQty:
          item.actualQty !== null && item.actualQty !== undefined
            ? String(item.actualQty)
            : item.packingQty !== null && item.packingQty !== undefined
              ? String(item.packingQty)
              : '',
        damagedQty: item.damagedQty ? String(item.damagedQty) : '',
        repNo: item.repNo || '',
        repStatus: item.repStatus || '',
        repDescription: item.repDescription || '',
        notes: item.notes || '',
      }
    );
  };

  const updateDraft = (id: string, item: DetailedComputed, patch: Partial<ResultRowDraft>) => {
    setRowDrafts((prev) => ({
      ...prev,
      [id]: { ...getDraft(item), ...patch },
    }));
  };

  const handleSaveResults = async (e: React.FormEvent) => {
    e.preventDefault();
    const results = itemsForResults
      .map((item) => {
        const d = getDraft(item);
        if (!d.selected) return null;
        const actualNum = d.actualQty.trim() === '' ? null : Number(d.actualQty);
        const damagedNum = d.damagedQty.trim() === '' ? null : Number(d.damagedQty);
        return {
          detailedId: item.id,
          actualQty: actualNum,
          damagedQty: damagedNum,
          repNo: d.repNo,
          repStatus: d.repStatus,
          repDescription: d.repDescription,
          notes: d.notes,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (results.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم را انتخاب کنید.' : 'Select at least one item.');
      return;
    }

    try {
      const res = await apiRequest<{ updatedCount: number }>('/api/opi/results', {
        method: 'POST',
        body: JSON.stringify({
          invitationId: resultInvitationId || undefined,
          opiNo: resultOpiNo,
          opiDate: resultOpiDate,
          results,
        }),
      });
      notify(
        'success',
        isFa
          ? `نتیجه بازرسی برای ${res.updatedCount.toLocaleString('fa-IR')} قلم ثبت و موجودی محاسبه شد.`
          : `Inspection results saved for ${res.updatedCount} items.`,
      );
      setRowDrafts({});
      triggerAutoSnapshot(`OPI Results ${resultOpiNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const invReportColumns = useMemo<CsvColumnDef<OpiInvitationRecord>[]>(
    () => [
      { key: 'invitationNo', header: t.headers.opiInvitationNo, getValue: (r) => r.invitationNo },
      { key: 'date', header: t.headers.opiInvitationDate, isDate: true, getValue: (r) => r.date },
      { key: 'time', header: isFa ? 'ساعت' : 'Time', getValue: (r) => r.time },
      { key: 'packingNos', header: t.headers.packingListNo, getValue: (r) => r.packingNos.join(', ') },
      { key: 'location', header: isFa ? 'محل' : 'Location', getValue: (r) => r.location || '' },
      {
        key: 'status',
        header: isFa ? 'وضعیت' : 'Status',
        getValue: (r) =>
          r.status === 'completed' ? (isFa ? 'ثبت نتیجه شده' : 'Completed') : (isFa ? 'صادرشده' : 'Issued'),
      },
      { key: 'createdBy', header: isFa ? 'صادرکننده' : 'Issued By', getValue: (r) => r.createdBy },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa],
  );

  const itemReportColumns = useMemo<CsvColumnDef<DetailedComputed>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'description', header: t.headers.description, getValue: (r) => r.description || r.generalDescription },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'packingQty', header: t.headers.packingQty, getValue: (r) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, getValue: (r) => r.actualQty },
      { key: 'damagedQty', header: t.headers.damagedQty, getValue: (r) => r.damagedQty },
      { key: 'shortage', header: t.headers.shortage, getValue: (r) => r.shortage },
      { key: 'opiNo', header: t.headers.opiNo, getValue: (r) => r.opiNo },
      { key: 'opiDate', header: t.headers.opiDate, isDate: true, getValue: (r) => r.opiDate },
      { key: 'repNo', header: t.headers.repNo, getValue: (r) => r.repNo },
      { key: 'repStatus', header: t.headers.repStatus, getValue: (r) => r.repStatus },
    ],
    [t],
  );

  const opiPrintPortal =
    printInvitation && !printInvTableOpen && !printItemsTableOpen
      ? createPortal(
          <div id="samaan-opi-print-root">
            <style>{`
              @media screen {
                #samaan-opi-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 7mm;
                }
                body > *:not(#samaan-opi-print-root) {
                  display: none !important;
                }
                #samaan-opi-print-root {
                  display: block !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  width: 100%;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                #samaan-opi-print-root table th,
                #samaan-opi-print-root table td {
                  text-align: center;
                  vertical-align: middle;
                }
              }
            `}</style>
            <OfficialOpiInvitationSheet
              record={printInvitation}
              detailedItems={data?.detailedItems || []}
              generalEntries={data?.generalEntries || []}
              formatDate={formatDate}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-6">
      {opiPrintPortal}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('invitation')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            tab === 'invitation'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isFa ? 'دعوتنامه گشایش و بازرسی بسته‌ها' : 'Package Opening & Inspection Invitation'}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('results')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            tab === 'results'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>{isFa ? 'ثبت نتایج بازرسی (مقدار واقعی و آسیب‌دیده)' : 'Record Inspection Results'}</span>
        </button>
      </div>

      {/* TAB 1: Issue OPI Invitation */}
      {tab === 'invitation' && (
        <div className="space-y-6">
          {canEdit && (
            <form
              onSubmit={handleIssueInvitation}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  {isFa ? 'صدور دعوتنامه جدید گشایش و بازرسی بسته‌ها' : 'Issue New Package Opening & Inspection Invitation'}
                </h3>
                <span dir="ltr" className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
                  MD1EX-FQP02/02-03
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.opiInvitationNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !invitationNo ? 'rtl' : 'ltr'}
                    value={invitationNo}
                    onChange={(e) => setInvitationNo(e.target.value)}
                    placeholder="OPI-2026-001"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !invitationNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <JalaliDateInput
                  label={isFa ? 'تاریخ صدور دعوتنامه' : 'Issue Date'}
                  value={issueDate}
                  onChange={setIssueDate}
                />

                <JalaliDateInput
                  label={`${isFa ? 'تاریخ بازرسی' : 'Inspection Date'} *`}
                  value={date}
                  onChange={setDate}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'ساعت بازرسی' : 'Inspection Time'} *
                  </label>
                  <input
                    type="time"
                    required
                    dir="ltr"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-left tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'مکان بازرسی' : 'Inspection Location'}
                  </label>
                  <input
                    type="text"
                    dir={!location ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={isFa ? 'انبار مرکزی سایت...' : 'Site Warehouse...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {/* Project, System, Island, Unit, Supplier, Contract, Purchase Package */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'پروژه' : 'Project'}
                  </label>
                  <input
                    type="text"
                    dir={!projectName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
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
                    {isFa ? 'شماره قرارداد' : 'Contract No.'}
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
                    {t.headers.system}
                  </label>
                  <input
                    type="text"
                    dir={!system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.island}
                  </label>
                  <input
                    type="text"
                    dir={!island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={island}
                    onChange={(e) => setIsland(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.unit}
                  </label>
                  <input
                    type="text"
                    dir={!unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {/* Multi-Select Packing Lists */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    {isFa
                      ? `انتخاب پکینگ لیست‌ها (${selectedPackings.length.toLocaleString('fa-IR')} مورد انتخاب‌شده)`
                      : `Select Packing Lists (${selectedPackings.length} selected)`}
                  </label>
                  <div className="flex items-center h-8 w-64 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    <input
                      type="text"
                      dir={isFa && !packingSearch ? 'rtl' : 'ltr'}
                      value={packingSearch}
                      onChange={(e) => setPackingSearch(e.target.value)}
                      placeholder={isFa ? 'فیلتر شماره پکینگ...' : 'Filter packing no...'}
                      className={`flex-1 min-w-0 h-full bg-transparent text-xs focus:outline-none ${
                        isFa && !packingSearch ? 'text-right' : 'text-left'
                      }`}
                    />
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {filteredPackings.length === 0 ? (
                    <div className="col-span-full text-center py-4 text-xs text-[var(--text-muted)]">
                      {t.controls.noData}
                    </div>
                  ) : (
                    filteredPackings.map((pk) => {
                      const checked = selectedPackings.includes(pk);
                      return (
                        <label
                          key={pk}
                          className={`px-2.5 py-2 rounded-lg border text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                            checked
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePacking(pk)}
                          />
                          <span dir="ltr" className="truncate tabular-nums">
                            {pk}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Editable Line Items for OPI Invitation Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    {isFa ? 'اقلام جدول دعوتنامه (قابل ویرایش پیش از چاپ)' : 'Invitation Table Items'}
                  </span>
                  <button
                    type="button"
                    onClick={addBlankItemRow}
                    className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isFa ? 'افزودن ردیف' : 'Add Row'}</span>
                  </button>
                </div>

                {items.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                    <table className="w-full text-[11px]">
                      <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                        <tr>
                          <th className="py-2 px-2 w-20">Item No.</th>
                          <th className="py-2 px-2 min-w-[110px]">Packing List No.</th>
                          <th className="py-2 px-2 min-w-[90px]">Package No.</th>
                          <th className="py-2 px-2 min-w-[180px]">{isFa ? 'شرح کالا' : 'Description'}</th>
                          <th className="py-2 px-2 w-24">{isFa ? 'واحد (UOM)' : 'UOM'}</th>
                          <th className="py-2 px-2 min-w-[120px]">{isFa ? 'توضیحات' : 'Remarks'}</th>
                          <th className="py-2 px-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="p-1">
                              <input
                                type="text"
                                dir="ltr"
                                value={it.itemNo}
                                onChange={(e) => updateItemField(idx, 'itemNo', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                dir="ltr"
                                value={it.packingListNo}
                                onChange={(e) => updateItemField(idx, 'packingListNo', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                dir="ltr"
                                value={it.packageNo}
                                onChange={(e) => updateItemField(idx, 'packageNo', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={it.description}
                                onChange={(e) => updateItemField(idx, 'description', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px]"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={it.uom}
                                onChange={(e) => updateItemField(idx, 'uom', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px]"
                              />
                            </td>
                            <td className="p-1">
                              <input
                                type="text"
                                value={it.remarks}
                                onChange={(e) => updateItemField(idx, 'remarks', e.target.value)}
                                className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px]"
                              />
                            </td>
                            <td className="p-1">
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="p-1 rounded text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                aria-label="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Approvers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'پیمانکار (نصاب)' : 'Installer Contractor'}
                  </label>
                  <input
                    type="text"
                    dir={!installerContractor ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={installerContractor}
                    onChange={(e) => setInstallerContractor(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نماینده تامین کننده' : 'Supplier Rep.'}
                  </label>
                  <input
                    type="text"
                    dir={!supplierRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={supplierRep}
                    onChange={(e) => setSupplierRep(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'تامین تجهیزات توسعه یک' : 'MD1 Equipment Supply'}
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
                    {isFa ? 'دستگاه نظارت یا کارفرما' : 'Supervision / Employer'}
                  </label>
                  <input
                    type="text"
                    dir={!employerRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={employerRep}
                    onChange={(e) => setEmployerRep(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  {t.headers.notes}
                </label>
                <input
                  type="text"
                  dir={!notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>{isFa ? 'ثبت دعوتنامه و نمایش فرم چاپی' : 'Issue & Preview Form'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Issued Invitations History */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                {isFa ? 'دعوتنامه‌های گشایش و بازرسی صادرشده' : 'Issued Invitations'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv({
                      rows: data?.invitations || [],
                      columns: invReportColumns,
                      filename: 'samaan-opi-invitations',
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
                  onClick={() => setPrintInvTableOpen(true)}
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
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.opiInvitationNo}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.opiInvitationDate}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'ساعت' : 'Time'}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.packingListNo}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'محل' : 'Location'}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-4 text-end font-semibold">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.loading}
                      </td>
                    </tr>
                  ) : (data?.invitations || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    (data?.invitations || []).map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                          {inv.invitationNo}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                          {formatDate(inv.date)}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                          {inv.time}
                        </td>
                        <td className="py-2.5 px-4 bidi-plaintext" dir="ltr">
                          {inv.packingNos.join(', ')}
                        </td>
                        <td className="py-2.5 px-4 bidi-plaintext">{inv.location || '-'}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              inv.status === 'completed'
                                ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                                : 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                            }`}
                          >
                            {inv.status === 'completed'
                              ? isFa
                                ? 'ثبت نتیجه شده'
                                : 'Completed'
                              : isFa
                                ? 'صادرشده'
                                : 'Issued'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintInvitation(inv)}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{t.controls.print}</span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResultInvitationId(inv.id);
                                  setResultPackingFilter('');
                                  setTab('results');
                                }}
                                className="h-7 px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold"
                              >
                                {isFa ? 'ثبت نتایج' : 'Record Results'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Record OPI Inspection Results */}
      {tab === 'results' && (
        <form onSubmit={handleSaveResults} className={`space-y-4 ${printInvitation ? 'print:hidden' : ''}`}>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'فیلتر بر اساس دعوتنامه' : 'Filter by Invitation'}
              </label>
              <select
                value={resultInvitationId}
                onChange={(e) => setResultInvitationId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{t.controls.all}</option>
                {(data?.invitations || []).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invitationNo} ({formatDate(inv.date)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.packingListNo}
              </label>
              <select
                value={resultPackingFilter}
                onChange={(e) => setResultPackingFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{t.controls.all}</option>
                {(data?.packings || []).map((pk) => (
                  <option key={pk} value={pk}>
                    {pk}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.opiNo}
              </label>
              <input
                type="text"
                dir={isFa && !resultOpiNo ? 'rtl' : 'ltr'}
                value={resultOpiNo}
                onChange={(e) => setResultOpiNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !resultOpiNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={t.headers.opiDate}
              value={resultOpiDate}
              onChange={setResultOpiDate}
            />
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa ? 'اقلام مشمول بازرسی گشایش' : 'Items for Opening Inspection'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv({
                      rows: itemsForResults,
                      columns: itemReportColumns,
                      filename: 'samaan-opi-inspection-items',
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
                  onClick={() => setPrintItemsTableOpen(true)}
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
                    <th className="py-2.5 px-3 w-9">{isFa ? 'ثبت' : 'Apply'}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.packageNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.itemNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.description}</th>
                    <th className="py-2.5 px-3 text-end">{t.headers.packingQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.actualQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.damagedQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repStatus}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repDescription}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {itemsForResults.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    itemsForResults.map((item) => {
                      const d = getDraft(item);
                      return (
                        <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={d.selected}
                              onChange={(e) => updateDraft(item.id, item, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                          <td className="py-2 px-3 max-w-[200px] truncate bidi-plaintext" title={item.description}>
                            {item.description || item.generalDescription}
                          </td>
                          <td className="py-2 px-3 text-end tabular-nums font-semibold">
                            {item.packingQty ?? '-'} {item.countingUnit}
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="number"
                              step="any"
                              dir={isFa && !d.actualQty ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.actualQty}
                              onChange={(e) =>
                                updateDraft(item.id, item, { actualQty: e.target.value, selected: true })
                              }
                              className={`w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                                isFa && !d.actualQty ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-24">
                            <input
                              type="number"
                              step="any"
                              dir={isFa && !d.damagedQty ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.damagedQty}
                              onChange={(e) =>
                                updateDraft(item.id, item, { damagedQty: e.target.value, selected: true })
                              }
                              className={`w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                                isFa && !d.damagedQty ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="text"
                              dir={isFa && !d.repNo ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.repNo}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repNo: e.target.value, selected: true })
                              }
                              className={`w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs ${
                                isFa && !d.repNo ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="text"
                              dir={!d.repStatus ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              disabled={!canEdit}
                              value={d.repStatus}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repStatus: e.target.value, selected: true })
                              }
                              className="w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                            />
                          </td>
                          <td className="py-2 px-3 w-40">
                            <input
                              type="text"
                              dir={!d.repDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              disabled={!canEdit}
                              value={d.repDescription}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repDescription: e.target.value, selected: true })
                              }
                              className="w-36 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {canEdit && itemsForResults.length > 0 && (
              <div className="p-4 border-t border-[var(--border-subtle)] flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isFa ? 'ثبت نتایج بازرسی و محاسبه کسری/موجودی' : 'Save Inspection Results & Compute Balances'}</span>
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* Printable Official MD1EX-FQP02/02-03 OPI Invitation Modal */}
      {printInvitation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'دعوتنامه گشایش و بازرسی بسته‌ها (OPI Invitation)' : 'OPI Invitation Preview'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/02-03 · {printInvitation.invitationNo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ فرم (A4)' : 'Print Form (A4)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintInvitation(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto max-w-[790px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialOpiInvitationSheet
                  record={printInvitation}
                  detailedItems={data?.detailedItems || []}
                  generalEntries={data?.generalEntries || []}
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
        title={isFa ? 'فهرست دعوتنامه‌های گشایش و بازرسی بسته‌ها' : 'Issued OPI Invitations'}
        columns={invReportColumns}
        rows={data?.invitations || []}
      />

      <PrintReportModal
        open={printItemsTableOpen}
        onClose={() => setPrintItemsTableOpen(false)}
        title={isFa ? 'گزارش اقلام و نتایج بازرسی گشایش بسته‌ها' : 'OPI Inspection Items Report'}
        columns={itemReportColumns}
        rows={itemsForResults}
      />
    </div>
  );
};
