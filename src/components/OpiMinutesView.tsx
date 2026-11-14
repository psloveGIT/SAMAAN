import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileWarning,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { MD1_STACKED_LOGO } from '../lib/assets.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  GeneralEntry,
  OpiInvitationLineItem,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

const buildMomItemsForPacking = (
  packingListNo: string,
  selectedPackages: string[],
  detailedItems: DetailedComputed[],
  generalEntries: GeneralEntry[],
): OpiInvitationLineItem[] => {
  if (!packingListNo) return [];
  const detMatches = detailedItems.filter((d) => {
    if ((d.shipmentNo || '').trim() !== packingListNo) return false;
    if (selectedPackages.length > 0 && !selectedPackages.includes(d.packageNo)) return false;
    return true;
  });
  if (detMatches.length > 0) {
    return detMatches.map((d) => ({
      itemNo: d.itemNo || '',
      packingListNo: d.shipmentNo || packingListNo,
      packageNo: d.packageNo || '',
      description: d.description || d.generalDescription || '',
      uom: d.countingUnit || '',
      remarks: d.notes || '',
    }));
  }
  const genMatches = generalEntries.filter((g) => {
    if ((g.packingListNo || '').trim() !== packingListNo) return false;
    if (selectedPackages.length > 0 && !selectedPackages.includes(g.packageNo)) return false;
    return true;
  });
  return genMatches.map((g, idx) => ({
    itemNo: String(idx + 1),
    packingListNo: g.packingListNo || packingListNo,
    packageNo: g.packageNo || '',
    description: g.itemDescription || '',
    uom: 'بسته',
    remarks: '',
  }));
};

const MomCheckSquare: React.FC<{ checked?: boolean }> = ({ checked }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '12px',
      height: '12px',
      border: '1.3px solid #000000',
      backgroundColor: '#ffffff',
      flexShrink: 0,
    }}
  >
    {checked && (
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path
          d="M1.5 5.2L4 7.7L8.5 2.3"
          stroke="#000000"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);

interface OfficialOpiMinutesSheetProps {
  record: OpiMinutesRecord;
  detailedItems: DetailedComputed[];
  generalEntries: GeneralEntry[];
  formatDate: (iso: string) => string;
}

const OfficialOpiMinutesSheet: React.FC<OfficialOpiMinutesSheetProps> = ({
  record,
  detailedItems,
  generalEntries,
  formatDate,
}) => {
  const resolvedItems = useMemo(() => {
    if (record.items && record.items.length > 0) return record.items;
    return buildMomItemsForPacking(
      record.packingListNo,
      record.packageNos || [],
      detailedItems,
      generalEntries,
    );
  }, [record, detailedItems, generalEntries]);

  const minRows = 8;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: (OpiInvitationLineItem | null)[] = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
  ];

  const sellerName = record.sellerRep || record.contractorInspector || '';

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
        {/* Header Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 190px',
            borderBottom: '1.5px solid #000000',
          }}
        >
          {/* Right + Center: Logo + Title */}
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
                صورتجلسه گشایش و بازرسی بسته ها
              </div>
              <div dir="ltr" style={{ fontSize: '12px', fontWeight: 700 }}>
                OPI – Minutes Of Meeting
              </div>
            </div>
          </div>

          {/* Left Box: OPI No & OPI Date */}
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
              <div>شماره OPI :</div>
              <div dir="ltr" className="tabular-nums" style={{ marginTop: '2px', textAlign: 'left' }}>
                {record.minutesNo}
              </div>
            </div>
            <div>
              <div>تاریخ OPI :</div>
              <div dir="ltr" className="tabular-nums" style={{ marginTop: '2px', textAlign: 'left' }}>
                {formatDate(record.date)}
              </div>
            </div>
          </div>
        </div>

        {/* Metadata Strip Row 1 (Exact PDF RTL order: تامین کننده | سیستم | جزیره | واحد | پروژه) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{record.supplier || ''}</span>
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
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span className="bidi-plaintext">{record.projectName || ''}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (RTL: شماره قرارداد/درخواست خرید | شماره دعوتنامه OPI | شماره بسته خرید) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره قرارداد/درخواست خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.contractNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره دعوتنامه OPI: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.invitationNo || ''}
            </span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره بسته خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {record.purchasePackageNo || ''}
            </span>
          </div>
        </div>

        {/* Items Table (LTR column order matching PDF: Item No., Packing List No., Package No., شرح (کالا/تجهیز), واحد (UOM), توضیحات) */}
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
            <tr style={{ backgroundColor: '#e5e7eb' }}>
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
                  width: '14%',
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
                  width: '36%',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  padding: '5px 6px',
                  fontWeight: 700,
                }}
              >
                شرح (کالا/تجهیز)
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

        {/* Time / Date / Location Strip (RTL: ساعت | تاریخ | محل انجام OPI) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            fontSize: '10.2px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>ساعت</div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 6px' }}>تاریخ</div>
          <div style={{ padding: '5px 6px' }}>محل انجام OPI</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            minHeight: '30px',
            borderBottom: '1px solid #000000',
            fontSize: '10px',
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
              padding: '4px 6px',
            }}
          >
            {record.time || ''}
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
              padding: '4px 6px',
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
              padding: '4px 6px',
            }}
          >
            {record.location || ''}
          </div>
        </div>

        {/* Statement, Discrepancy Checkboxes & Other Notes */}
        <div
          style={{
            padding: '10px 14px 16px',
            fontSize: '10px',
            lineHeight: 2,
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            بسته (Package) های بالا در حضور نمایندگان کارفرما، مشاور، مپنا و انباردار OPI شد و اقلام موجود برابر با Packing List های پیوست، تحویل انبارگردید.
          </div>

          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              paddingRight: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span>محموله ی بالا فاقد هرگونه مغایرت و آسیب دیدگی می باشد.</span>
              <MomCheckSquare checked={record.resultStatus === 'compliant'} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span>
                محموله ی بالا دارای مغایرت، برابر فرم{' '}
                <span
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    fontWeight: 700,
                    display: 'inline-block',
                    minWidth: '100px',
                    textAlign: 'center',
                    borderBottom: record.merNo ? '1px dotted #000' : 'none',
                  }}
                >
                  {record.merNo?.trim() || '........................'}
                </span>{' '}
                <span dir="ltr">MER No.</span> می باشد.
              </span>
              <MomCheckSquare checked={record.resultStatus === 'has_discrepancy'} />
            </div>
          </div>

          <div style={{ marginTop: '12px', minHeight: '72px' }}>
            <div style={{ fontWeight: 700 }}>سایر توضیحات:</div>
            {record.notes && (
              <div className="bidi-plaintext" style={{ marginTop: '4px', fontSize: '9.8px' }}>
                {record.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Separate Lower Signature Frame */}
      <div style={{ border: '1.8px solid #000000', marginTop: '12px' }}>
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
          امضا
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            minHeight: '80px',
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
            <div style={{ fontSize: '9px' }}>{record.storekeeper || ''}</div>
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
            <div style={{ fontSize: '9px' }}>{record.mapnaInspector || ''}</div>
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
              <div style={{ fontWeight: 700 }}>فروشنده:</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '9px' }}>{sellerName}</div>
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
            <div style={{ fontSize: '9px' }}>{record.employerInspector || ''}</div>
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
          <div>رونوشت: معاونت تأمین تجهیزات، فروشنده، دستگاه نظارت، کارفرما</div>
          <div dir="ltr" className="tabular-nums">
            MD1EX-FQP02/06-03
          </div>
        </div>
      </div>
    </div>
  );
};

interface OpiMinutesApiResponse {
  minutes: OpiMinutesRecord[];
  osdrReports: OsdrReportRecord[];
  invitations: OpiInvitationRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
  packings: string[];
}

interface OpiMinutesViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const OpiMinutesView: React.FC<OpiMinutesViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [subTab, setSubTab] = useState<'minutes' | 'osdr'>('minutes');
  const [data, setData] = useState<OpiMinutesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // OPI Minutes Form
  const [minutesNo, setMinutesNo] = useState('');
  const [invitationNo, setInvitationNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [time, setTime] = useState('09:00');
  const [packingListNo, setPackingListNo] = useState('');
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [projectName, setProjectName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [unit, setUnit] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [purchasePackageNo, setPurchasePackageNo] = useState('');
  const [merNo, setMerNo] = useState('');
  const [items, setItems] = useState<OpiInvitationLineItem[]>([]);
  const [location, setLocation] = useState('');
  const [storekeeper, setStorekeeper] = useState('');
  const [mapnaInspector, setMapnaInspector] = useState('');
  const [sellerRep, setSellerRep] = useState('');
  const [employerInspector, setEmployerInspector] = useState('');
  const [qcInspector, setQcInspector] = useState('');
  const [resultStatus, setResultStatus] = useState<'compliant' | 'has_discrepancy'>('compliant');
  const [notes, setNotes] = useState('');
  const [editingMinutes, setEditingMinutes] = useState<OpiMinutesRecord | null>(null);
  const [deleteMinutesTarget, setDeleteMinutesTarget] = useState<OpiMinutesRecord | null>(null);
  const [printMinutes, setPrintMinutes] = useState<OpiMinutesRecord | null>(null);
  const [printMinutesTableOpen, setPrintMinutesTableOpen] = useState(false);

  // OSDR Form
  const [osdrReportNo, setOsdrReportNo] = useState('');
  const [osdrDate, setOsdrDate] = useState(getTodayIso());
  const [osdrMinutesNo, setOsdrMinutesNo] = useState('');
  const [osdrPackingNo, setOsdrPackingNo] = useState('');
  const [osdrSupplier, setOsdrSupplier] = useState('');
  const [osdrNotes, setOsdrNotes] = useState('');
  const [osdrSelectedIds, setOsdrSelectedIds] = useState<Record<string, boolean>>({});
  const [osdrRemarks, setOsdrRemarks] = useState<Record<string, string>>({});
  const [editingOsdr, setEditingOsdr] = useState<OsdrReportRecord | null>(null);
  const [deleteOsdrTarget, setDeleteOsdrTarget] = useState<OsdrReportRecord | null>(null);
  const [printOsdr, setPrintOsdr] = useState<OsdrReportRecord | null>(null);
  const [printOsdrTableOpen, setPrintOsdrTableOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<OpiMinutesApiResponse>('/api/opi-minutes');
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

  const syncFromPacking = useCallback(
    (pk: string, pkgs: string[]) => {
      if (!pk) {
        setItems([]);
        setSupplier('');
        setSystem('');
        setIsland('');
        setUnit('');
        setLocation('');
        setContractNo('');
        setMerNo('');
        return;
      }
      const detItems = data?.detailedItems || [];
      const genEntries = data?.generalEntries || [];
      const genMatch = genEntries.find((g) => (g.packingListNo || '').trim() === pk);
      const detMatch = detItems.find((d) => (d.shipmentNo || '').trim() === pk);

      setSupplier(genMatch?.supplier || detMatch?.supplier || '');
      setSystem(genMatch?.system || detMatch?.system || '');
      setIsland(genMatch?.island || detMatch?.island || '');
      setUnit(genMatch?.unit || detMatch?.unit || '');
      setLocation(detMatch?.storageLocation || genMatch?.dispatchLocation || '');
      setContractNo(detMatch?.mtoRef || '');
      setMerNo(detMatch?.merNo || '');
      if (!editingMinutes) {
        const autoInv = genMatch?.opiInvitationNo || detMatch?.opiNo || '';
        if (autoInv) setInvitationNo(autoInv);
      }
      setItems(buildMomItemsForPacking(pk, pkgs, detItems, genEntries));
    },
    [data, editingMinutes],
  );

  // Auto-fill packingListNo / location / date / metadata when linking an invitation
  const handleInvitationChange = (invNo: string) => {
    setInvitationNo(invNo);
    if (!invNo) return;
    const inv = (data?.invitations || []).find((i) => i.invitationNo === invNo);
    if (inv) {
      if (inv.location) setLocation(inv.location);
      if (inv.date) setDate(inv.date);
      if (inv.time) setTime(inv.time);
      if (inv.projectName) setProjectName(inv.projectName);
      if (inv.supplier) setSupplier(inv.supplier);
      if (inv.system) setSystem(inv.system);
      if (inv.island) setIsland(inv.island);
      if (inv.unit) setUnit(inv.unit);
      if (inv.contractNo) setContractNo(inv.contractNo);
      if (inv.purchasePackageNo) setPurchasePackageNo(inv.purchasePackageNo);
      if (inv.packingNos.length > 0) {
        const pk = inv.packingNos[0];
        setPackingListNo(pk);
        setSelectedPackages([]);
        if (inv.items && inv.items.length > 0) {
          setItems(inv.items);
        } else {
          syncFromPacking(pk, []);
        }
      } else if (inv.items && inv.items.length > 0) {
        setItems(inv.items);
      }
    }
  };

  const resetMinutesForm = () => {
    setEditingMinutes(null);
    setMinutesNo('');
    setInvitationNo('');
    setDate(getTodayIso());
    setTime('09:00');
    setPackingListNo('');
    setSelectedPackages([]);
    setProjectName('');
    setSupplier('');
    setSystem('');
    setIsland('');
    setUnit('');
    setContractNo('');
    setPurchasePackageNo('');
    setMerNo('');
    setItems([]);
    setLocation('');
    setStorekeeper('');
    setMapnaInspector('');
    setSellerRep('');
    setEmployerInspector('');
    setQcInspector('');
    setResultStatus('compliant');
    setNotes('');
  };

  const startEditMinutes = (rec: OpiMinutesRecord) => {
    setEditingMinutes(rec);
    setMinutesNo(rec.minutesNo || '');
    setInvitationNo(rec.invitationNo || '');
    setDate(rec.date || getTodayIso());
    setTime(rec.time || '09:00');
    setPackingListNo(rec.packingListNo || '');
    setSelectedPackages(rec.packageNos || []);
    setProjectName(rec.projectName || '');
    setSupplier(rec.supplier || '');
    setSystem(rec.system || '');
    setIsland(rec.island || '');
    setUnit(rec.unit || '');
    setContractNo(rec.contractNo || '');
    setPurchasePackageNo(rec.purchasePackageNo || '');
    setMerNo(rec.merNo || '');
    setItems(
      rec.items && rec.items.length > 0
        ? rec.items
        : buildMomItemsForPacking(
            rec.packingListNo,
            rec.packageNos || [],
            data?.detailedItems || [],
            data?.generalEntries || [],
          ),
    );
    setLocation(rec.location || '');
    setStorekeeper(rec.storekeeper || '');
    setMapnaInspector(rec.mapnaInspector || '');
    setSellerRep(rec.sellerRep || rec.contractorInspector || '');
    setEmployerInspector(rec.employerInspector || '');
    setQcInspector(rec.qcInspector || '');
    setResultStatus(rec.resultStatus || 'compliant');
    setNotes(rec.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const packagesForSelectedPacking = useMemo(() => {
    if (!packingListNo) return [];
    const set = new Set<string>();
    for (const d of data?.detailedItems || []) {
      if (d.shipmentNo === packingListNo && d.packageNo) set.add(d.packageNo);
    }
    return Array.from(set);
  }, [data, packingListNo]);

  const togglePackage = (pkg: string) => {
    const next = selectedPackages.includes(pkg)
      ? selectedPackages.filter((x) => x !== pkg)
      : [...selectedPackages, pkg];
    setSelectedPackages(next);
    if (packingListNo) {
      setItems(
        buildMomItemsForPacking(
          packingListNo,
          next,
          data?.detailedItems || [],
          data?.generalEntries || [],
        ),
      );
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
        packingListNo: packingListNo || '',
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

  const handleSaveMinutes = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      minutesNo,
      invitationNo,
      date,
      time,
      packingListNo,
      packageNos: selectedPackages.length > 0 ? selectedPackages : packagesForSelectedPacking,
      projectName,
      supplier,
      system,
      island,
      unit,
      contractNo,
      purchasePackageNo,
      items,
      merNo,
      location,
      storekeeper,
      mapnaInspector,
      sellerRep,
      employerInspector,
      contractorInspector: sellerRep,
      qcInspector,
      resultStatus,
      notes,
    };

    try {
      if (editingMinutes) {
        const res = await apiRequest<{ record: OpiMinutesRecord }>(`/api/opi-minutes/${editingMinutes.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `صورتجلسه گشایش شماره ${res.record.minutesNo} ویرایش شد.`
            : `Inspection Minutes ${res.record.minutesNo} updated.`,
        );
        resetMinutesForm();
        setPrintMinutes(res.record);
        triggerAutoSnapshot(`Edit OPI Minutes ${res.record.minutesNo}`);
        onDataChanged();
        loadData();
      } else {
        const res = await apiRequest<{ record: OpiMinutesRecord }>('/api/opi-minutes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `صورتجلسه گشایش و بازرسی شماره ${res.record.minutesNo} ثبت شد.`
            : `Inspection Minutes ${res.record.minutesNo} saved.`,
        );
        resetMinutesForm();
        setPrintMinutes(res.record);
        triggerAutoSnapshot(`OPI Minutes ${res.record.minutesNo}`);
        onDataChanged();
        loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDeleteMinutes = async () => {
    if (!deleteMinutesTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/opi-minutes/${deleteMinutesTarget.id}`, {
        method: 'DELETE',
      });
      notify(
        'success',
        isFa
          ? `صورتجلسه شماره ${deleteMinutesTarget.minutesNo} حذف شد.`
          : `Inspection Minutes ${deleteMinutesTarget.minutesNo} deleted.`,
      );
      if (editingMinutes?.id === deleteMinutesTarget.id) resetMinutesForm();
      if (printMinutes?.id === deleteMinutesTarget.id) setPrintMinutes(null);
      setDeleteMinutesTarget(null);
      triggerAutoSnapshot(`Delete OPI Minutes ${deleteMinutesTarget.minutesNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Discrepancy items eligible for OSDR
  const discrepancyItems = useMemo(() => {
    const editingItemIds = new Set((editingOsdr?.items || []).map((i) => i.detailedId));
    const all = (data?.detailedItems || []).filter(
      (d) => d.hasShortage || d.hasDamaged || d.surplus > 0 || editingItemIds.has(d.id),
    );
    if (!osdrPackingNo) return all;
    return all.filter((d) => d.shipmentNo === osdrPackingNo);
  }, [data, osdrPackingNo, editingOsdr]);

  const getDiscrepancyType = (d: DetailedComputed): OsdrReportItem['discrepancyType'] => {
    if (d.shortage > 0 && d.damagedQty && d.damagedQty > 0) return 'shortage_and_damaged';
    if (d.shortage > 0) return 'shortage';
    if (d.damagedQty && d.damagedQty > 0) return 'damaged';
    return 'surplus';
  };

  const discrepancyTypeLabel = useCallback(
    (tp: OsdrReportItem['discrepancyType']) => {
      if (tp === 'shortage_and_damaged') return isFa ? 'کسری و آسیب‌دیدگی' : 'Shortage & Damaged';
      if (tp === 'shortage') return isFa ? 'کسری (Shortage)' : 'Shortage';
      if (tp === 'damaged') return isFa ? 'آسیب‌دیدگی (Damaged)' : 'Damaged';
      return isFa ? 'اضافی (Overage)' : 'Overage / Surplus';
    },
    [isFa],
  );

  const handlePackingChangeForOsdr = (pk: string) => {
    setOsdrPackingNo(pk);
    if (!pk) {
      setOsdrSupplier('');
      setOsdrMinutesNo('');
      return;
    }
    const sampleDet = (data?.detailedItems || []).find((d) => d.shipmentNo === pk && d.supplier);
    const sampleGen = (data?.generalEntries || []).find((g) => (g.packingListNo || '').trim() === pk && g.supplier);
    setOsdrSupplier(sampleDet?.supplier || sampleGen?.supplier || '');
    const matchingMin = (data?.minutes || []).find((m) => m.packingListNo === pk);
    setOsdrMinutesNo(matchingMin?.minutesNo || '');
  };

  const resetOsdrForm = () => {
    setEditingOsdr(null);
    setOsdrReportNo('');
    setOsdrDate(getTodayIso());
    setOsdrMinutesNo('');
    setOsdrPackingNo('');
    setOsdrSupplier('');
    setOsdrNotes('');
    setOsdrSelectedIds({});
    setOsdrRemarks({});
  };

  const startEditOsdr = (rep: OsdrReportRecord) => {
    setEditingOsdr(rep);
    setOsdrReportNo(rep.reportNo || '');
    setOsdrDate(rep.date || getTodayIso());
    setOsdrMinutesNo(rep.opiMinutesNo || '');
    setOsdrPackingNo(rep.packingListNo || '');
    setOsdrSupplier(rep.supplier || '');
    setOsdrNotes(rep.notes || '');
    const nextSel: Record<string, boolean> = {};
    const nextRem: Record<string, string> = {};
    for (const item of rep.items || []) {
      nextSel[item.detailedId] = true;
      if (item.remarks) nextRem[item.detailedId] = item.remarks;
    }
    setOsdrSelectedIds(nextSel);
    setOsdrRemarks(nextRem);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveOsdr = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = discrepancyItems.filter((d) => osdrSelectedIds[d.id]);
    if (chosen.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم دارای مغایرت را انتخاب کنید.' : 'Select at least one discrepancy item.');
      return;
    }

    const itemsPayload: OsdrReportItem[] = chosen.map((d) => ({
      detailedId: d.id,
      shipmentNo: d.shipmentNo,
      packageNo: d.packageNo,
      itemNo: d.itemNo,
      description: d.description || d.generalDescription,
      itemCode: d.itemCode,
      countingUnit: d.countingUnit || 'PC',
      packingQty: d.packingQty || 0,
      actualQty: d.actualQty || 0,
      shortage: d.shortage,
      surplus: d.surplus,
      damagedQty: d.damagedQty || 0,
      discrepancyType: getDiscrepancyType(d),
      remarks: osdrRemarks[d.id] || '',
    }));

    const payload = {
      reportNo: osdrReportNo,
      date: osdrDate,
      opiMinutesNo: osdrMinutesNo,
      packingListNo: osdrPackingNo || chosen[0].shipmentNo,
      supplier: osdrSupplier || chosen[0].supplier,
      items: itemsPayload,
      notes: osdrNotes,
    };

    try {
      if (editingOsdr) {
        const res = await apiRequest<{ report: OsdrReportRecord }>(`/api/osdr/${editingOsdr.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `گزارش مغایرت شماره ${res.report.reportNo} ویرایش شد.`
            : `OSDR Report ${res.report.reportNo} updated.`,
        );
        resetOsdrForm();
        setPrintOsdr(res.report);
        triggerAutoSnapshot(`Edit OSDR ${res.report.reportNo}`);
        onDataChanged();
        loadData();
      } else {
        const res = await apiRequest<{ report: OsdrReportRecord }>('/api/osdr', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `گزارش مغایرت، کسری و آسیب‌دیدگی شماره ${res.report.reportNo} ثبت شد.`
            : `OSDR Report ${res.report.reportNo} issued.`,
        );
        resetOsdrForm();
        setPrintOsdr(res.report);
        triggerAutoSnapshot(`OSDR ${res.report.reportNo}`);
        onDataChanged();
        loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDeleteOsdr = async () => {
    if (!deleteOsdrTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/osdr/${deleteOsdrTarget.id}`, {
        method: 'DELETE',
      });
      notify(
        'success',
        isFa
          ? `گزارش مغایرت شماره ${deleteOsdrTarget.reportNo} حذف شد.`
          : `OSDR Report ${deleteOsdrTarget.reportNo} deleted.`,
      );
      if (editingOsdr?.id === deleteOsdrTarget.id) resetOsdrForm();
      if (printOsdr?.id === deleteOsdrTarget.id) setPrintOsdr(null);
      setDeleteOsdrTarget(null);
      triggerAutoSnapshot(`Delete OSDR ${deleteOsdrTarget.reportNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const minutesColumns = useMemo<CsvColumnDef<OpiMinutesRecord>[]>(
    () => [
      { key: 'minutesNo', header: isFa ? 'شماره صورتجلسه' : 'Minutes No.', getValue: (r) => r.minutesNo },
      { key: 'invitationNo', header: t.headers.opiInvitationNo, getValue: (r) => r.invitationNo || '' },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'packingListNo', header: t.headers.packingListNo, getValue: (r) => r.packingListNo },
      { key: 'packageNos', header: t.headers.packageNo, getValue: (r) => r.packageNos.join(', ') },
      {
        key: 'resultStatus',
        header: isFa ? 'نتیجه بازرسی' : 'Inspection Result',
        getValue: (r) =>
          r.resultStatus === 'compliant'
            ? isFa ? 'منطبق با پکینگ لیست' : 'Compliant'
            : isFa ? 'دارای مغایرت / کسری / آسیب' : 'Has Discrepancy',
      },
      { key: 'mapnaInspector', header: isFa ? 'نماینده مپنا' : 'MAPNA Inspector', getValue: (r) => r.mapnaInspector || '' },
      { key: 'employerInspector', header: isFa ? 'نماینده کارفرما' : 'Employer Inspector', getValue: (r) => r.employerInspector || '' },
      { key: 'qcInspector', header: isFa ? 'بازرس QC' : 'QC Inspector', getValue: (r) => r.qcInspector || '' },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa],
  );

  const osdrColumns = useMemo<CsvColumnDef<OsdrReportRecord>[]>(
    () => [
      { key: 'reportNo', header: isFa ? 'شماره گزارش (OSDR)' : 'OSDR No.', getValue: (r) => r.reportNo },
      { key: 'date', header: isFa ? 'تاریخ گزارش' : 'Report Date', isDate: true, getValue: (r) => r.date },
      { key: 'packingListNo', header: t.headers.packingListNo, getValue: (r) => r.packingListNo },
      { key: 'opiMinutesNo', header: isFa ? 'شماره صورتجلسه' : 'Minutes No.', getValue: (r) => r.opiMinutesNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'itemsCount', header: isFa ? 'تعداد اقلام مغایرت' : 'Discrepancy Items', getValue: (r) => r.items.length },
      {
        key: 'summary',
        header: isFa ? 'خلاصه اقلام' : 'Items Summary',
        getValue: (r) =>
          r.items
            .map((i) => `${i.packageNo}#${i.itemNo}: ${discrepancyTypeLabel(i.discrepancyType)}`)
            .join(' | '),
      },
      { key: 'createdBy', header: isFa ? 'تنظیم‌کننده' : 'Created By', getValue: (r) => r.createdBy },
    ],
    [t, isFa, discrepancyTypeLabel],
  );

  const anyPrintModalOpen = Boolean(printMinutes || printOsdr);

  const minutesPrintPortal =
    printMinutes && !printMinutesTableOpen && !printOsdrTableOpen
      ? createPortal(
          <div id="samaan-mom-print-root">
            <style>{`
              @media screen {
                #samaan-mom-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 7mm;
                }
                body > *:not(#samaan-mom-print-root) {
                  display: none !important;
                }
                #samaan-mom-print-root {
                  display: block !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  width: 100%;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                #samaan-mom-print-root table th,
                #samaan-mom-print-root table td {
                  text-align: center;
                  vertical-align: middle;
                }
              }
            `}</style>
            <OfficialOpiMinutesSheet
              record={printMinutes}
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
      {minutesPrintPortal}

      {/* Sub-navigation Tabs */}
      <div className={`${printOsdr ? 'print:hidden' : ''} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={() => setSubTab('minutes')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            subTab === 'minutes'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>{isFa ? 'صورتجلسه گشایش و بازرسی بسته‌ها' : 'Opening & Inspection Minutes'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('osdr')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            subTab === 'osdr'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <FileWarning className="w-4 h-4" />
          <span>{isFa ? 'گزارش مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'Discrepancy, Shortage & Damage Report (OSDR)'}</span>
        </button>
      </div>

      {/* SUB-TAB 1: OPI MINUTES */}
      {subTab === 'minutes' && (
        <div className="space-y-6">
          {canEdit && (
            <form
              onSubmit={handleSaveMinutes}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold">
                    {isFa ? 'ثبت صورتجلسه گشایش و بازرسی بسته‌ها' : 'Record Package Opening & Inspection Minutes'}
                  </h3>
                  {editingMinutes && (
                    <span className="px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-semibold">
                      {isFa ? `حالت ویرایش: ${editingMinutes.minutesNo}` : `Editing: ${editingMinutes.minutesNo}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingMinutes && (
                    <button
                      type="button"
                      onClick={resetMinutesForm}
                      className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{t.controls.cancel}</span>
                    </button>
                  )}
                  <span dir="ltr" className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
                    MD1EX-FQP02/06-03
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره OPI / صورتجلسه' : 'OPI Minutes No.'} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !minutesNo ? 'rtl' : 'ltr'}
                    value={minutesNo}
                    onChange={(e) => setMinutesNo(e.target.value)}
                    placeholder="OPM-1405-001"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !minutesNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <JalaliDateInput
                  label={`${isFa ? 'تاریخ OPI' : 'OPI Date'} *`}
                  value={date}
                  onChange={setDate}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'ساعت' : 'Time'}
                  </label>
                  <input
                    type="time"
                    dir="ltr"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-left tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره دعوتنامه OPI' : 'OPI Invitation No.'}
                  </label>
                  <select
                    value={invitationNo}
                    onChange={(e) => handleInvitationChange(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="">{isFa ? 'انتخاب اختیاری...' : 'Optional...'}</option>
                    {(data?.invitations || []).map((inv) => (
                      <option key={inv.id} value={inv.invitationNo}>
                        {inv.invitationNo} ({formatDate(inv.date)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packingListNo} *
                  </label>
                  <select
                    required
                    value={packingListNo}
                    onChange={(e) => {
                      const nextPk = e.target.value;
                      setPackingListNo(nextPk);
                      setSelectedPackages([]);
                      syncFromPacking(nextPk, []);
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="">{isFa ? 'انتخاب پکینگ لیست...' : 'Select Packing List...'}</option>
                    {(data?.packings || []).map((pk) => (
                      <option key={pk} value={pk}>
                        {pk}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Project, Supplier, System, Island, Unit, Contract, Purchase Package */}
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
                    {isFa ? 'شماره قرارداد / درخواست خرید' : 'Contract / PR No.'}
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

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'محل انجام OPI' : 'OPI Location'}
                  </label>
                  <input
                    type="text"
                    dir={!location ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {packagesForSelectedPacking.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[var(--text-secondary)]">
                    {isFa ? 'انتخاب نگله‌های بازرسی‌شده (در صورت خالی بودن، همه نگله‌ها لحاظ می‌شوند):' : 'Inspected Packages:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {packagesForSelectedPacking.map((pkg) => {
                      const checked = selectedPackages.includes(pkg);
                      return (
                        <label
                          key={pkg}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer flex items-center gap-1.5 ${
                            checked
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePackage(pkg)}
                          />
                          <span dir="ltr" className="tabular-nums">{pkg}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Editable Line Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    {isFa ? 'اقلام جدول صورتجلسه (قابل ویرایش پیش از چاپ)' : 'Minutes Table Items'}
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
                          <th className="py-2 px-2 min-w-[180px]">{isFa ? 'شرح (کالا/تجهیز)' : 'Description'}</th>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نتیجه کلی بازرسی' : 'Overall Result'} *
                  </label>
                  <select
                    value={resultStatus}
                    onChange={(e) => setResultStatus(e.target.value as 'compliant' | 'has_discrepancy')}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
                  >
                    <option value="compliant">
                      {isFa ? 'فاقد هرگونه مغایرت و آسیب‌دیدگی' : 'Compliant / No Discrepancy'}
                    </option>
                    <option value="has_discrepancy">
                      {isFa ? 'دارای مغایرت (مطابق فرم MER)' : 'Has Discrepancy (Per MER Form)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره فرم MER (در صورت مغایرت)' : 'MER No. (if discrepancy)'}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !merNo ? 'rtl' : 'ltr'}
                    value={merNo}
                    onChange={(e) => setMerNo(e.target.value)}
                    placeholder="MER-..."
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !merNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

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
                    dir={!mapnaInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={mapnaInspector}
                    onChange={(e) => setMapnaInspector(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'فروشنده' : 'Seller / Vendor'}
                  </label>
                  <input
                    type="text"
                    dir={!sellerRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={sellerRep}
                    onChange={(e) => setSellerRep(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'دستگاه نظارت یا کارفرما' : 'Supervision / Employer'}
                  </label>
                  <input
                    type="text"
                    dir={!employerInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={employerInspector}
                    onChange={(e) => setEmployerInspector(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  {isFa ? 'سایر توضیحات' : t.headers.notes}
                </label>
                <input
                  type="text"
                  dir={!notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                {editingMinutes && (
                  <button
                    type="button"
                    onClick={resetMinutesForm}
                    className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>{t.controls.cancel}</span>
                  </button>
                )}
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {editingMinutes
                      ? isFa
                        ? 'ذخیره تغییرات صورتجلسه'
                        : 'Update Minutes'
                      : isFa
                        ? 'ثبت صورتجلسه گشایش و چاپ فرم'
                        : 'Save Minutes & Preview'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Minutes History Table */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                {isFa ? 'صورتجلسه‌های گشایش و بازرسی ثبت‌شده' : 'Recorded Opening & Inspection Minutes'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv({
                      rows: data?.minutes || [],
                      columns: minutesColumns,
                      filename: 'samaan-opi-minutes',
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
                  onClick={() => setPrintMinutesTableOpen(true)}
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
                    <th className="py-2.5 px-4 text-start">{isFa ? 'شماره صورتجلسه' : 'Minutes No.'}</th>
                    <th className="py-2.5 px-4 text-start">{isFa ? 'تاریخ' : 'Date'}</th>
                    <th className="py-2.5 px-4 text-start">{t.headers.packingListNo}</th>
                    <th className="py-2.5 px-4 text-start">{t.headers.packageNo}</th>
                    <th className="py-2.5 px-4 text-start">{isFa ? 'نتیجه' : 'Result'}</th>
                    <th className="py-2.5 px-4 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.loading}
                      </td>
                    </tr>
                  ) : (data?.minutes || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    (data?.minutes || []).map((rec) => (
                      <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">{rec.minutesNo}</td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">{formatDate(rec.date)}</td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">{rec.packingListNo}</td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                          {rec.packageNos.length > 0 ? rec.packageNos.join(', ') : '-'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              rec.resultStatus === 'compliant'
                                ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                                : 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                            }`}
                          >
                            {rec.resultStatus === 'compliant'
                              ? isFa ? 'منطبق' : 'Compliant'
                              : isFa ? 'دارای مغایرت' : 'Discrepancy'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintMinutes(rec)}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{t.controls.print}</span>
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditMinutes(rec)}
                                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                  title={t.controls.edit}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteMinutesTarget(rec)}
                                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                                  title={t.controls.delete}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {rec.resultStatus === 'has_discrepancy' && canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  handlePackingChangeForOsdr(rec.packingListNo);
                                  setOsdrMinutesNo(rec.minutesNo);
                                  setSubTab('osdr');
                                }}
                                className="h-7 px-2.5 rounded-lg bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-semibold"
                              >
                                {isFa ? 'صدور OSDR' : 'Issue OSDR'}
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

      {/* SUB-TAB 2: OSDR DISCREPANCY REPORT */}
      {subTab === 'osdr' && (
        <div className={`space-y-6 ${anyPrintModalOpen ? 'print:hidden' : ''}`}>
          {canEdit && (
            <form
              onSubmit={handleSaveOsdr}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                  <span>{isFa ? 'صدور گزارش مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'Issue OSDR Discrepancy Report'}</span>
                  {editingOsdr && (
                    <span className="px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-semibold">
                      {isFa ? `حالت ویرایش: ${editingOsdr.reportNo}` : `Editing: ${editingOsdr.reportNo}`}
                    </span>
                  )}
                </div>
                {editingOsdr && (
                  <button
                    type="button"
                    onClick={resetOsdrForm}
                    className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t.controls.cancel}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره گزارش (OSDR)' : 'OSDR Report No.'} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !osdrReportNo ? 'rtl' : 'ltr'}
                    value={osdrReportNo}
                    onChange={(e) => setOsdrReportNo(e.target.value)}
                    placeholder="OSDR-1405-001"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !osdrReportNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <JalaliDateInput
                  label={`${isFa ? 'تاریخ گزارش' : 'Report Date'} *`}
                  value={osdrDate}
                  onChange={setOsdrDate}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packingListNo} *
                  </label>
                  <select
                    required
                    value={osdrPackingNo}
                    onChange={(e) => handlePackingChangeForOsdr(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="">{isFa ? 'انتخاب پکینگ لیست...' : 'Select Packing List...'}</option>
                    {(data?.packings || []).map((pk) => (
                      <option key={pk} value={pk}>
                        {pk}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره صورتجلسه گشایش' : 'Related OPI Minutes'}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !osdrMinutesNo ? 'rtl' : 'ltr'}
                    value={osdrMinutesNo}
                    onChange={(e) => setOsdrMinutesNo(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !osdrMinutesNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.supplier}
                  </label>
                  <input
                    type="text"
                    dir={!osdrSupplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={osdrSupplier}
                    onChange={(e) => setOsdrSupplier(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  {isFa
                    ? 'اقلام دارای کسری، اضافی یا آسیب‌دیدگی (جهت درج در گزارش مغایرت انتخاب کنید):'
                    : 'Items with Shortage, Overage, or Damage (select to include in OSDR):'}
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0">
                      <tr>
                        <th className="py-2 px-3 w-9">{isFa ? 'درج' : 'Add'}</th>
                        <th className="py-2 px-3 text-start">{t.headers.shipmentNo}</th>
                        <th className="py-2 px-3 text-start">{t.headers.packageNo}</th>
                        <th className="py-2 px-3 text-start">{t.headers.itemNo}</th>
                        <th className="py-2 px-3 text-start">{t.headers.description}</th>
                        <th className="py-2 px-3 text-end">{t.headers.packingQty}</th>
                        <th className="py-2 px-3 text-end">{t.headers.actualQty}</th>
                        <th className="py-2 px-3 text-end">{t.headers.shortage}</th>
                        <th className="py-2 px-3 text-end">{t.headers.damagedQty}</th>
                        <th className="py-2 px-3 text-start">{isFa ? 'نوع مغایرت' : 'Discrepancy Type'}</th>
                        <th className="py-2 px-3 text-start">{isFa ? 'توضیحات فنی' : 'Remarks'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {discrepancyItems.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-[var(--text-muted)]">
                            {isFa
                              ? 'قلمی دارای کسری، اضافی یا آسیب‌دیدگی برای این انتخاب یافت نشد.'
                              : 'No shortage, surplus, or damaged items found for this filter.'}
                          </td>
                        </tr>
                      ) : (
                        discrepancyItems.map((item) => {
                          const discType = getDiscrepancyType(item);
                          return (
                            <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={Boolean(osdrSelectedIds[item.id])}
                                  onChange={(e) =>
                                    setOsdrSelectedIds((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.checked,
                                    }))
                                  }
                                />
                              </td>
                              <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                              <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                              <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                              <td className="py-2 px-3 max-w-[180px] truncate bidi-plaintext">
                                {item.description || item.generalDescription}
                              </td>
                              <td className="py-2 px-3 text-end tabular-nums">{item.packingQty ?? 0}</td>
                              <td className="py-2 px-3 text-end tabular-nums">{item.actualQty ?? 0}</td>
                              <td className="py-2 px-3 text-end tabular-nums font-bold text-[var(--status-danger)]">
                                {item.shortage > 0 ? item.shortage : '-'}
                              </td>
                              <td className="py-2 px-3 text-end tabular-nums font-bold text-[var(--status-warning)]">
                                {item.damagedQty || '-'}
                              </td>
                              <td className="py-2 px-3 font-medium">{discrepancyTypeLabel(discType)}</td>
                              <td className="py-2 px-3 w-44">
                                <input
                                  type="text"
                                  dir={!osdrRemarks[item.id] ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                                  value={osdrRemarks[item.id] || ''}
                                  onChange={(e) => {
                                    setOsdrRemarks((prev) => ({ ...prev, [item.id]: e.target.value }));
                                    setOsdrSelectedIds((prev) => ({ ...prev, [item.id]: true }));
                                  }}
                                  placeholder={isFa ? 'شرح مغایرت...' : 'Remark...'}
                                  className="w-40 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
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

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  {t.headers.notes}
                </label>
                <input
                  type="text"
                  dir={!osdrNotes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={osdrNotes}
                  onChange={(e) => setOsdrNotes(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                {editingOsdr && (
                  <button
                    type="button"
                    onClick={resetOsdrForm}
                    className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>{t.controls.cancel}</span>
                  </button>
                )}
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <FileWarning className="w-4 h-4" />
                  <span>
                    {editingOsdr
                      ? isFa
                        ? 'ذخیره تغییرات گزارش OSDR'
                        : 'Update OSDR Report'
                      : isFa
                        ? 'ثبت گزارش مغایرت (OSDR) و نمایش فرم چاپی'
                        : 'Issue OSDR & Preview Sheet'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* OSDR History Table */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                {isFa ? 'سوابق گزارش‌های مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'Issued OSDR Reports'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportRowsToCsv({
                      rows: data?.osdrReports || [],
                      columns: osdrColumns,
                      filename: 'samaan-osdr-reports',
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
                  onClick={() => setPrintOsdrTableOpen(true)}
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
                    <th className="py-2.5 px-4 text-start">{isFa ? 'شماره OSDR' : 'OSDR No.'}</th>
                    <th className="py-2.5 px-4 text-start">{isFa ? 'تاریخ' : 'Date'}</th>
                    <th className="py-2.5 px-4 text-start">{t.headers.packingListNo}</th>
                    <th className="py-2.5 px-4 text-start">{t.headers.supplier}</th>
                    <th className="py-2.5 px-4 text-end">{isFa ? 'تعداد اقلام مغایرت' : 'Items'}</th>
                    <th className="py-2.5 px-4 text-end">{t.controls.print}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.loading}
                      </td>
                    </tr>
                  ) : (data?.osdrReports || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    (data?.osdrReports || []).map((rep) => (
                      <tr key={rep.id} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">{rep.reportNo}</td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">{formatDate(rep.date)}</td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">{rep.packingListNo}</td>
                        <td className="py-2.5 px-4 bidi-plaintext">{rep.supplier || '-'}</td>
                        <td className="py-2.5 px-4 text-end tabular-nums font-bold text-[var(--status-danger)]">
                          {rep.items.length}
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintOsdr(rep)}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{t.controls.print}</span>
                            </button>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditOsdr(rep)}
                                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                  title={t.controls.edit}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteOsdrTarget(rep)}
                                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
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
            </div>
          </div>
        </div>
      )}

      {/* Printable Official MD1EX-FQP02/06-03 OPI Minutes Modal */}
      {printMinutes && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">{t.nav.opiMinutes}</h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/06-03 · {printMinutes.minutesNo}
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
                  onClick={() => setPrintMinutes(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto max-w-[790px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialOpiMinutesSheet
                  record={printMinutes}
                  detailedItems={data?.detailedItems || []}
                  generalEntries={data?.generalEntries || []}
                  formatDate={formatDate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable OSDR Modal */}
      {printOsdr && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">
                {isFa ? 'پیش‌نمایش گزارش مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'Printable OSDR Report'}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{t.controls.print}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintOsdr(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="border-2 border-current rounded-lg p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-current pb-3">
                <div>
                  <div className="text-base font-bold">{t.brandFull}</div>
                  <div className="text-[11px] opacity-80">
                    {isFa
                      ? 'گزارش مغایرت، کسری و آسیب‌دیدگی کالا (Overage, Shortage & Damage Report - OSDR)'
                      : 'Overage, Shortage & Damage Report (OSDR)'}
                  </div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{isFa ? 'شماره گزارش:' : 'Report No.:'} </span>
                    <span dir="ltr">{printOsdr.reportNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'تاریخ:' : 'Date:'} </span>
                    <span dir="ltr">{formatDate(printOsdr.date)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="font-semibold">{t.headers.packingListNo}: </span>
                  <span dir="ltr" className="tabular-nums">{printOsdr.packingListNo}</span>
                </div>
                <div>
                  <span className="font-semibold">{isFa ? 'صورتجلسه گشایش:' : 'OPI Minutes:'} </span>
                  <span dir="ltr" className="tabular-nums">{printOsdr.opiMinutesNo || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.supplier}: </span>
                  <span className="bidi-plaintext">{printOsdr.supplier || '-'}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-current text-xs">
                <thead>
                  <tr>
                    <th className="border border-current py-1.5 px-2 text-center">#</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.packageNo}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.itemNo}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.description}</th>
                    <th className="border border-current py-1.5 px-2 text-end">{t.headers.packingQty}</th>
                    <th className="border border-current py-1.5 px-2 text-end">{t.headers.actualQty}</th>
                    <th className="border border-current py-1.5 px-2 text-end">{t.headers.shortage}</th>
                    <th className="border border-current py-1.5 px-2 text-end">{t.headers.damagedQty}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{isFa ? 'توضیحات' : 'Remarks'}</th>
                  </tr>
                </thead>
                <tbody>
                  {printOsdr.items.map((line, i) => (
                    <tr key={`${line.detailedId}-${i}`}>
                      <td className="border border-current py-1.5 px-2 text-center tabular-nums">{i + 1}</td>
                      <td className="border border-current py-1.5 px-2 tabular-nums" dir="ltr">{line.packageNo}</td>
                      <td className="border border-current py-1.5 px-2 tabular-nums" dir="ltr">{line.itemNo}</td>
                      <td className="border border-current py-1.5 px-2 bidi-plaintext">{line.description}</td>
                      <td className="border border-current py-1.5 px-2 text-end tabular-nums">{line.packingQty}</td>
                      <td className="border border-current py-1.5 px-2 text-end tabular-nums">{line.actualQty}</td>
                      <td className="border border-current py-1.5 px-2 text-end font-bold tabular-nums">{line.shortage || '-'}</td>
                      <td className="border border-current py-1.5 px-2 text-end font-bold tabular-nums">{line.damagedQty || '-'}</td>
                      <td className="border border-current py-1.5 px-2 bidi-plaintext">
                        {discrepancyTypeLabel(line.discrepancyType)}
                        {line.remarks ? ` - ${line.remarks}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {printOsdr.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printOsdr.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 pt-8 text-center">
                <div className="border-t border-current pt-2">{isFa ? 'مسئول انبار' : 'Warehouse Supervisor'}</div>
                <div className="border-t border-current pt-2">{isFa ? 'کنترل کیفیت / بازرسی' : 'QA / QC Inspector'}</div>
                <div className="border-t border-current pt-2">{isFa ? 'نماینده کارفرما / مپنا' : 'Client / MAPNA Rep.'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printMinutesTableOpen}
        onClose={() => setPrintMinutesTableOpen(false)}
        title={t.nav.opiMinutes}
        columns={minutesColumns}
        rows={data?.minutes || []}
      />

      <PrintReportModal
        open={printOsdrTableOpen}
        onClose={() => setPrintOsdrTableOpen(false)}
        title={isFa ? 'گزارش مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'OSDR Reports'}
        columns={osdrColumns}
        rows={data?.osdrReports || []}
      />

      <ConfirmActionModal
        open={Boolean(deleteMinutesTarget)}
        title={isFa ? 'حذف صورتجلسه گشایش و بازرسی' : 'Delete OPI Minutes'}
        message={
          deleteMinutesTarget
            ? isFa
              ? `آیا از حذف صورتجلسه شماره ${deleteMinutesTarget.minutesNo} اطمینان دارید؟`
              : `Delete OPI Minutes ${deleteMinutesTarget.minutesNo}?`
            : ''
        }
        onConfirm={handleConfirmDeleteMinutes}
        onCancel={() => setDeleteMinutesTarget(null)}
      />

      <ConfirmActionModal
        open={Boolean(deleteOsdrTarget)}
        title={isFa ? 'حذف گزارش مغایرت (OSDR)' : 'Delete OSDR Report'}
        message={
          deleteOsdrTarget
            ? isFa
              ? `آیا از حذف گزارش OSDR شماره ${deleteOsdrTarget.reportNo} اطمینان دارید؟`
              : `Delete OSDR Report ${deleteOsdrTarget.reportNo}?`
            : ''
        }
        onConfirm={handleConfirmDeleteOsdr}
        onCancel={() => setDeleteOsdrTarget(null)}
      />
    </div>
  );
};
