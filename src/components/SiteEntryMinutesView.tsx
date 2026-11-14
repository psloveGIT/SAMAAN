import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ClipboardSignature,
  Download,
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
  GeneralEntry,
  SiteEntryLineItem,
  SiteEntryMinutesRecord,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

interface SiteEntryApiResponse {
  minutes: SiteEntryMinutesRecord[];
  generalEntries: GeneralEntry[];
  packings: string[];
}

interface SiteEntryMinutesViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const MD1_STACKED_LOGO = '/assets/aistudio/______________________________65f1164c.png';

const buildItemsFromGeneral = (
  packings: string[],
  generalEntries: GeneralEntry[],
): SiteEntryLineItem[] => {
  const rows: SiteEntryLineItem[] = [];
  for (const pk of packings) {
    const matches = generalEntries.filter((g) => (g.packingListNo || '').trim() === pk);
    if (matches.length > 0) {
      for (const g of matches) {
        const hasDims = g.lengthCm != null || g.widthCm != null || g.heightCm != null;
        const dims = hasDims
          ? `${g.lengthCm ?? '-'}×${g.widthCm ?? '-'}×${g.heightCm ?? '-'}`
          : '';
        rows.push({
          description: g.itemDescription || '',
          packingListNo: g.packingListNo || pk,
          packageNo: g.packageNo || '',
          dimensions: dims,
          qty: g.itemCount != null ? String(g.itemCount) : '1',
          unit: 'بسته',
          netWeight: g.netWeight != null ? String(g.netWeight) : '',
          grossWeight: g.grossWeight != null ? String(g.grossWeight) : '',
          remarks: '',
        });
      }
    } else {
      rows.push({
        description: '',
        packingListNo: pk,
        packageNo: '',
        dimensions: '',
        qty: '',
        unit: '',
        netWeight: '',
        grossWeight: '',
        remarks: '',
      });
    }
  }
  return rows;
};

const FormCheckSquare: React.FC<{ checked?: boolean; label: string }> = ({ checked, label }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      whiteSpace: 'nowrap',
    }}
  >
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '11px',
        height: '11px',
        border: '1.2px solid #000000',
        backgroundColor: '#ffffff',
        flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden="true">
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
    <span>{label}</span>
  </span>
);

const DotValue: React.FC<{ value?: string; dots?: string }> = ({
  value,
  dots = '. . . . . . . . . . . . . . . .',
}) => {
  const clean = (value || '').trim();
  if (!clean) {
    return (
      <span style={{ color: '#334155', letterSpacing: '1px', padding: '0 4px' }}>{dots}</span>
    );
  }
  return (
    <span
      style={{
        fontWeight: 700,
        borderBottom: '1px dotted #000000',
        padding: '0 6px',
        display: 'inline-block',
        minWidth: '72px',
        textAlign: 'center',
      }}
    >
      {clean}
    </span>
  );
};

interface OfficialSheetProps {
  record: SiteEntryMinutesRecord;
  generalEntries: GeneralEntry[];
  formatDate: (iso: string) => string;
}

const OfficialSiteEntrySheet: React.FC<OfficialSheetProps> = ({
  record,
  generalEntries,
  formatDate,
}) => {
  const resolvedItems = useMemo(() => {
    if (record.items && record.items.length > 0) return record.items;
    return buildItemsFromGeneral(record.packingListNos || [], generalEntries);
  }, [record, generalEntries]);

  const minRows = 11;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: (SiteEntryLineItem | null)[] = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
  ];

  const entryType = record.entryType || 'permanent';
  const goodsUsage = record.goodsUsage || 'project';
  const equipmentSupplyName = record.equipmentSupply || record.mapnaRep || '';

  return (
    <div
      dir="rtl"
      className="site-entry-official-sheet"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Header Block: Right Logo Box + Center/Left Title Box */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '124px 1fr',
            borderBottom: '1.5px solid #000000',
          }}
        >
          <div
            style={{
              borderLeft: '1.5px solid #000000',
              padding: '6px 6px 4px',
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
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700 }}>
              شرکت احداث و توسعه نیروگاه های مپنا– توسعه یک (MD1)
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, marginTop: '1px' }}>
              پروژه {record.projectName?.trim() || '..........'}
            </div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '2px' }}>
              صورتجلسه ورود کالا و تجهیزات به کارگاه
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '18px',
                fontSize: '10.5px',
                fontWeight: 700,
                marginTop: '3px',
              }}
            >
              <FormCheckSquare checked={entryType === 'permanent'} label="ورود دائم" />
              <FormCheckSquare checked={entryType === 'temporary'} label="ورود موقت" />
            </div>
          </div>
        </div>

        {/* Release Note No & Arrival Notice No Strip */}
        <div
          dir="ltr"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '1.5px solid #000000',
            padding: '4px 10px',
            fontSize: '10.5px',
            fontWeight: 700,
            alignItems: 'center',
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <span>Release Note No: </span>
            <span className="tabular-nums" style={{ fontWeight: 700 }}>
              {record.releaseNoteNo || ''}
            </span>
          </div>
          <div style={{ textAlign: 'left' }}>
            <span>Arrival Notice No: </span>
            <span className="tabular-nums" style={{ fontWeight: 700 }}>
              {record.minutesNo || ''}
            </span>
          </div>
        </div>

        {/* Contractor, Usage, Origin, Vehicle Details Box */}
        <div
          style={{
            borderBottom: '1.5px solid #000000',
            padding: '6px 10px 7px',
            fontSize: '9.8px',
            lineHeight: 1.9,
            textAlign: 'right',
          }}
        >
          {/* Row 1 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.65fr 1fr 0.85fr',
              gap: '8px',
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>نام پیمانکار/درخواست کننده: </span>
              <span>{record.supplier || ''}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>شماره قرارداد: </span>
              <span dir="ltr" className="tabular-nums">
                {record.contractNo || ''}
              </span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>تاریخ : </span>
              <span dir="ltr" className="tabular-nums">
                {formatDate(record.date)}
              </span>
            </div>
          </div>

          {/* Row 2 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>کاربرد کالا :</span>
              <FormCheckSquare checked={goodsUsage === 'project'} label="کالای پروژه" />
              <FormCheckSquare checked={goodsUsage === 'site_equip'} label="کالای تجهیزکارگاه" />
              <FormCheckSquare checked={goodsUsage === 'general'} label="مصرف عمومی" />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '20px' }}>
              <span>
                <strong style={{ fontWeight: 700 }}>واحد: </strong>
                <span className="bidi-plaintext">{record.unit || ''}</span>
              </span>
              <span>
                <strong style={{ fontWeight: 700 }}>سیستم: </strong>
                <span className="bidi-plaintext">{record.system || ''}</span>
              </span>
              <span>
                <strong style={{ fontWeight: 700 }}>جزیره: </strong>
                <span className="bidi-plaintext">{record.island || ''}</span>
              </span>
            </div>
          </div>

          {/* Row 3 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '0.85fr 0.95fr 1.05fr 1.35fr',
              gap: '8px',
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>مبدا: </span>
              <span className="bidi-plaintext">{record.origin || ''}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>تاریخ ورود: </span>
              <span dir="ltr" className="tabular-nums">
                {record.arrivalDate ? formatDate(record.arrivalDate) : ''}
              </span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>شرکت حمل کننده: </span>
              <span className="bidi-plaintext">{record.carrierCompany || ''}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>محل تردد / تخلیه و بارگیری: </span>
              <span className="bidi-plaintext">{record.trafficLocation || ''}</span>
            </div>
          </div>

          {/* Row 4 & 5: Vehicle info */}
          <div style={{ fontWeight: 700, marginTop: '2px' }}>
            مشخصات وسیله نقلیه حامل کالا / تجهیز:
          </div>
          <div>
            <span>وسیله نقلیه </span>
            <DotValue value={record.vehicleType} dots=". . . . . . . . . . . . . . . . . ." />
            <span> به شماره پلاک </span>
            <DotValue value={record.vehicleNo} dots=". . . . . . . . . . . . . ." />
            <span> با شماره بارنامه </span>
            <DotValue value={record.waybillNo} dots=". . . . . . . . . . . . . ." />
            <span> همراه با راننده آن آقای </span>
            <DotValue value={record.driverName} dots=". . . . . . . . . . . . . . . . . ." />
          </div>
        </div>

        {/* Main Equipment / Packing Table */}
        <table
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
                rowSpan={2}
                style={{
                  width: '4.5%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 2px',
                  fontWeight: 700,
                }}
              >
                ردیف
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '28.5%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                شرح
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '11%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 3px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                شماره لیست بسته
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '9%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 3px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                شماره بسته
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '9%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 3px',
                  fontWeight: 700,
                }}
              >
                ابعاد
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '6%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 2px',
                  fontWeight: 700,
                }}
              >
                تعداد
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '6%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 2px',
                  fontWeight: 700,
                }}
              >
                واحد
              </th>
              <th
                colSpan={2}
                style={{
                  width: '12%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 2px',
                  fontWeight: 700,
                }}
              >
                وزن
              </th>
              <th
                rowSpan={2}
                style={{
                  width: '14%',
                  borderBottom: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                توضیحات
              </th>
            </tr>
            <tr>
              <th
                style={{
                  width: '6%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 2px',
                  fontSize: '8.5px',
                  fontWeight: 700,
                }}
              >
                خالص
              </th>
              <th
                style={{
                  width: '6%',
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 2px',
                  fontSize: '8.5px',
                  fontWeight: 700,
                }}
              >
                ناخالص
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => (
              <tr key={idx} style={{ height: '25px' }}>
                <td
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 2px',
                    fontSize: '9px',
                  }}
                >
                  {row ? idx + 1 : idx === 0 ? '1.' : ''}
                </td>
                <td
                  className="bidi-plaintext"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 4px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.description || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 3px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.packingListNo || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 3px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.packageNo || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 3px',
                  }}
                >
                  {row?.dimensions || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 2px',
                  }}
                >
                  {row?.qty || ''}
                </td>
                <td
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 2px',
                  }}
                >
                  {row?.unit || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 2px',
                  }}
                >
                  {row?.netWeight || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '3px 2px',
                  }}
                >
                  {row?.grossWeight || ''}
                </td>
                <td
                  className="bidi-plaintext"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    padding: '3px 4px',
                    wordBreak: 'break-word',
                  }}
                >
                  {row?.remarks || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Storekeeper / Contractor PM / Notes Strip */}
        <div
          style={{
            borderTop: '1.5px solid #000000',
            borderBottom: '1.5px solid #000000',
            padding: '5px 10px',
            minHeight: '46px',
            display: 'grid',
            gridTemplateColumns: '1fr 1.25fr 1.25fr',
            gap: '10px',
            fontSize: '9.5px',
            textAlign: 'right',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>انباردار/پیمانکار:</div>
            <div style={{ marginTop: '3px' }}>{record.warehouseKeeper || ''}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>مدیرپروژه /سرپرست کارگاه پیمانکار:</div>
            <div style={{ marginTop: '3px' }}>{record.contractorManager || ''}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>توضیحات:</div>
            <div className="bidi-plaintext" style={{ marginTop: '3px' }}>
              {record.notes || ''}
            </div>
          </div>
        </div>

        {/* 5-Column Signatures Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            borderBottom: '1.5px solid #000000',
            fontSize: '9px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 5px',
              minHeight: '72px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>انتظامات مپنا</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء:</div>
            </div>
            <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{record.mapnaSecurity || ''}</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 5px',
              minHeight: '72px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>
                <FormCheckSquare checked={Boolean(record.qcChecked)} label="QC / دفتر فنی" />
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء :</div>
            </div>
            <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{record.qcTechOffice || ''}</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 5px',
              minHeight: '72px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>
                <FormCheckSquare checked={Boolean(record.hseChecked)} label="HSE" />
              </div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء :</div>
            </div>
            <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{record.hseOfficer || ''}</div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 5px',
              minHeight: '72px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>تامین تجهیزات</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء :</div>
            </div>
            <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{equipmentSupplyName}</div>
          </div>

          <div
            style={{
              padding: '5px 5px',
              minHeight: '72px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 700, lineHeight: 1.5 }}>
              نماینده کارفرما/نماینده دستگاه نظارت:
            </div>
            <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{record.employerRep || ''}</div>
          </div>
        </div>

        {/* QA Explanatory Notes Box */}
        <div
          style={{
            padding: '5px 10px 6px',
            fontSize: '8.2px',
            lineHeight: 1.7,
            textAlign: 'right',
          }}
        >
          <div>
            توضیح 1 : واحد تامین تجهیزات و انبار در صورت لزوم می بایست تائیدیه واحدهای دفتر فنی، کنترل کیفیت و HSE را اخذ نماید.
          </div>
          <div>
            توضیح 2 : درخصوص کالا و تجهیزاتی که مربوط به تجهیز کارگاه بوده و یا از نظر ایمنی مطابق نظر سرپرست HSE پروژه حائز اهمیت است کنترل و تایید واحد HSE الزامی می باشد.
          </div>
          <div>
            توضیح 3 : تائیدکنترل کیفی به منزله تائید ورود کالا به کارگاه می باشد و به معنای تائید نهایی نیست ، مسئولیت اصلی کیفیت کالا از نظر ظاهری و انطباق با مشخصات در طول دوران ساخت ،نصب، راه اندازی و بهره برداری بر عهده مسئول اجرایی کار می باشد.
          </div>
          <div>
            توضیح 4 : فرم مذکور میبایست توسط انتظامات مپنا امضا و سپس ممهور گردد.
          </div>
          <div style={{ fontWeight: 700 }}>
            توجه : این فرم تحت کنترل واحد QA میباشد و هرگونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA میباشد.
          </div>
        </div>
      </div>

      {/* Bottom Distribution & Document Control Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '4px',
          padding: '0 2px',
          fontSize: '8.5px',
          fontWeight: 700,
        }}
      >
        <div>رونوشت : 1- درخواست کننده / پیمانکار   2- تامین تجهیزات توسعه یک   3- انتظامات مپنا</div>
        <div dir="ltr" className="tabular-nums">
          MD1EX-FQP02/15-01
        </div>
      </div>
    </div>
  );
};

export const SiteEntryMinutesView: React.FC<SiteEntryMinutesViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<SiteEntryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [minutesNo, setMinutesNo] = useState('');
  const [releaseNoteNo, setReleaseNoteNo] = useState('');
  const [projectName, setProjectName] = useState('');
  const [entryType, setEntryType] = useState<'permanent' | 'temporary'>('permanent');
  const [goodsUsage, setGoodsUsage] = useState<'project' | 'site_equip' | 'general'>('project');
  const [contractNo, setContractNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [arrivalDate, setArrivalDate] = useState(getTodayIso());

  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [packingSearch, setPackingSearch] = useState('');

  const [supplier, setSupplier] = useState('');
  const [unit, setUnit] = useState('');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [origin, setOrigin] = useState('');
  const [carrierCompany, setCarrierCompany] = useState('');
  const [trafficLocation, setTrafficLocation] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [waybillNo, setWaybillNo] = useState('');

  const [items, setItems] = useState<SiteEntryLineItem[]>([]);

  const [warehouseKeeper, setWarehouseKeeper] = useState('');
  const [contractorManager, setContractorManager] = useState('');
  const [mapnaSecurity, setMapnaSecurity] = useState('');
  const [qcChecked, setQcChecked] = useState(false);
  const [qcTechOffice, setQcTechOffice] = useState('');
  const [hseChecked, setHseChecked] = useState(false);
  const [hseOfficer, setHseOfficer] = useState('');
  const [equipmentSupply, setEquipmentSupply] = useState('');
  const [employerRep, setEmployerRep] = useState('');
  const [conditionStatus, setConditionStatus] = useState<SiteEntryMinutesRecord['conditionStatus']>('healthy');
  const [notes, setNotes] = useState('');

  const [printSheet, setPrintSheet] = useState<SiteEntryMinutesRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<SiteEntryApiResponse>('/api/site-entry');
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

    const generalEntries = data?.generalEntries || [];
    if (!isRemoving) {
      const match = generalEntries.find((g) => (g.packingListNo || '').trim() === pk);
      if (match) {
        if (!releaseNoteNo && match.releaseNo) setReleaseNoteNo(match.releaseNo);
        if (!supplier && match.supplier) setSupplier(match.supplier);
        if (!unit && match.unit) setUnit(match.unit);
        if (!system && match.system) setSystem(match.system);
        if (!island && match.island) setIsland(match.island);
        if (!origin && match.dispatchLocation) setOrigin(match.dispatchLocation);
        if (match.arrivalDate) setArrivalDate(match.arrivalDate);
        if (!driverName && match.driverName) setDriverName(match.driverName);
        if (!vehicleNo && match.vehicleNo) setVehicleNo(match.vehicleNo);
        if (!waybillNo && match.billOfLadingNo) setWaybillNo(match.billOfLadingNo);
      }
      const addedRows = buildItemsFromGeneral([pk], generalEntries);
      setItems((prev) => [...prev, ...addedRows]);
    } else {
      setItems((prev) => prev.filter((it) => it.packingListNo !== pk));
    }
  };

  const updateItemField = (index: number, key: keyof SiteEntryLineItem, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  };

  const addBlankRow = () => {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        packingListNo: selectedPackings[0] || '',
        packageNo: '',
        dimensions: '',
        qty: '',
        unit: '',
        netWeight: '',
        grossWeight: '',
        remarks: '',
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const conditionLabel = useCallback(
    (status: SiteEntryMinutesRecord['conditionStatus']) => {
      if (status === 'healthy') {
        return isFa ? 'سالم و بدون آسیب ظاهری' : 'Intact / Good Condition';
      }
      if (status === 'shortage_suspected') {
        return isFa ? 'مشکوک به کسری بسته' : 'Suspected Package Shortage';
      }
      return isFa ? 'دارای آسیب ظاهری بسته‌بندی' : 'Apparent Packaging Damage';
    },
    [isFa],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPackings.length === 0) {
      notify('warning', isFa ? 'حداقل یک پکینگ لیست انتخاب کنید.' : 'Select at least one Packing List.');
      return;
    }

    try {
      const res = await apiRequest<{ record: SiteEntryMinutesRecord }>('/api/site-entry', {
        method: 'POST',
        body: JSON.stringify({
          minutesNo,
          releaseNoteNo,
          projectName,
          entryType,
          goodsUsage,
          contractNo,
          date,
          arrivalDate,
          packingListNos: selectedPackings,
          supplier,
          unit,
          system,
          island,
          origin,
          carrierCompany,
          trafficLocation,
          vehicleType,
          driverName,
          vehicleNo,
          waybillNo,
          items,
          warehouseKeeper,
          contractorManager,
          mapnaSecurity,
          qcChecked,
          qcTechOffice,
          hseChecked,
          hseOfficer,
          equipmentSupply,
          employerRep,
          mapnaRep: equipmentSupply,
          conditionStatus,
          notes,
        }),
      });
      notify(
        'success',
        isFa
          ? `صورتجلسه ورود شماره ${res.record.minutesNo} با موفقیت ثبت شد.`
          : `Site Entry Minutes ${res.record.minutesNo} saved.`,
      );
      setMinutesNo('');
      setReleaseNoteNo('');
      setContractNo('');
      setSelectedPackings([]);
      setItems([]);
      setSupplier('');
      setUnit('');
      setSystem('');
      setIsland('');
      setOrigin('');
      setCarrierCompany('');
      setTrafficLocation('');
      setVehicleType('');
      setDriverName('');
      setVehicleNo('');
      setWaybillNo('');
      setWarehouseKeeper('');
      setContractorManager('');
      setMapnaSecurity('');
      setQcChecked(false);
      setQcTechOffice('');
      setHseChecked(false);
      setHseOfficer('');
      setEquipmentSupply('');
      setEmployerRep('');
      setConditionStatus('healthy');
      setNotes('');
      setPrintSheet(res.record);
      triggerAutoSnapshot(`Site Entry ${res.record.minutesNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<CsvColumnDef<SiteEntryMinutesRecord>[]>(
    () => [
      { key: 'minutesNo', header: isFa ? 'Arrival Notice / شماره صورتجلسه' : 'Arrival Notice No.', getValue: (r) => r.minutesNo },
      { key: 'releaseNoteNo', header: 'Release Note No.', getValue: (r) => r.releaseNoteNo || '' },
      { key: 'date', header: isFa ? 'تاریخ صورتجلسه' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'arrivalDate', header: isFa ? 'تاریخ ورود' : 'Entry Date', isDate: true, getValue: (r) => r.arrivalDate || r.date },
      { key: 'packingListNos', header: t.headers.packingListNo, getValue: (r) => r.packingListNos.join(', ') },
      { key: 'supplier', header: isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor / Requester', getValue: (r) => r.supplier || '' },
      { key: 'contractNo', header: isFa ? 'شماره قرارداد' : 'Contract No.', getValue: (r) => r.contractNo || '' },
      { key: 'waybillNo', header: t.headers.billOfLadingNo, getValue: (r) => r.waybillNo || '' },
      { key: 'vehicleNo', header: t.headers.vehicleNo, getValue: (r) => r.vehicleNo || '' },
      { key: 'driverName', header: t.headers.driverName, getValue: (r) => r.driverName || '' },
      { key: 'conditionStatus', header: isFa ? 'وضعیت ظاهری' : 'Condition', getValue: (r) => conditionLabel(r.conditionStatus) },
      { key: 'warehouseKeeper', header: isFa ? 'انباردار/پیمانکار' : 'Storekeeper', getValue: (r) => r.warehouseKeeper || '' },
      { key: 'employerRep', header: isFa ? 'نماینده کارفرما' : 'Employer Rep.', getValue: (r) => r.employerRep || '' },
      { key: 'equipmentSupply', header: isFa ? 'تامین تجهیزات' : 'Equipment Supply', getValue: (r) => r.equipmentSupply || r.mapnaRep || '' },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa, conditionLabel],
  );

  // Dedicated print portal for the official MD1EX-FQP02/15-01 A4 sheet
  const formPrintPortal =
    printSheet && !printReportOpen
      ? createPortal(
          <div id="samaan-form-print-root">
            <style>{`
              @media screen {
                #samaan-form-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 7mm;
                }
                body > *:not(#samaan-form-print-root) {
                  display: none !important;
                }
                #samaan-form-print-root {
                  display: block !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  width: 100%;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                #samaan-form-print-root table th,
                #samaan-form-print-root table td {
                  text-align: center;
                  vertical-align: middle;
                }
              }
            `}</style>
            <OfficialSiteEntrySheet
              record={printSheet}
              generalEntries={data?.generalEntries || []}
              formatDate={formatDate}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-6">
      {formPrintPortal}

      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ClipboardSignature className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.siteEntry}</span>
            </div>
            <span dir="ltr" className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
              MD1EX-FQP02/15-01
            </span>
          </div>

          {/* Row 1: Core Notice Header & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره صورتجلسه (Arrival Notice No.)' : 'Arrival Notice No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !minutesNo ? 'rtl' : 'ltr'}
                value={minutesNo}
                onChange={(e) => setMinutesNo(e.target.value)}
                placeholder="AN-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !minutesNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                Release Note No.
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

            <JalaliDateInput
              label={`${isFa ? 'تاریخ صورتجلسه' : 'Minutes Date'} *`}
              value={date}
              onChange={setDate}
            />

            <JalaliDateInput
              label={isFa ? 'تاریخ ورود به کارگاه' : 'Arrival Date'}
              value={arrivalDate}
              onChange={setArrivalDate}
            />
          </div>

          {/* Row 2: Project, Contract, Entry Type, Goods Usage, Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام پروژه' : 'Project Name'}
              </label>
              <input
                type="text"
                dir={!projectName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={isFa ? 'مثال: نیروگاه ...' : 'Project name'}
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
                {isFa ? 'نوع ورود' : 'Entry Type'}
              </label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as 'permanent' | 'temporary')}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="permanent">{isFa ? 'ورود دائم' : 'Permanent Entry'}</option>
                <option value="temporary">{isFa ? 'ورود موقت' : 'Temporary Entry'}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'کاربرد کالا' : 'Goods Usage'}
              </label>
              <select
                value={goodsUsage}
                onChange={(e) =>
                  setGoodsUsage(e.target.value as 'project' | 'site_equip' | 'general')
                }
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="project">{isFa ? 'کالای پروژه' : 'Project Goods'}</option>
                <option value="site_equip">{isFa ? 'کالای تجهیز کارگاه' : 'Site Equipment'}</option>
                <option value="general">{isFa ? 'مصرف عمومی' : 'General Consumption'}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'وضعیت ظاهری بسته‌بندی' : 'Packaging Condition'} *
              </label>
              <select
                value={conditionStatus}
                onChange={(e) => setConditionStatus(e.target.value as SiteEntryMinutesRecord['conditionStatus'])}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="healthy">{conditionLabel('healthy')}</option>
                <option value="shortage_suspected">{conditionLabel('shortage_suspected')}</option>
                <option value="damaged_apparent">{conditionLabel('damaged_apparent')}</option>
              </select>
            </div>
          </div>

          {/* Row 3: Contractor, Unit, System, Island, Origin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نام پیمانکار / درخواست‌کننده' : 'Contractor / Requester'}
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
                {isFa ? 'مبدا' : 'Origin'}
              </label>
              <input
                type="text"
                dir={!origin ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Row 4: Carrier, Traffic Location, Vehicle Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شرکت حمل‌کننده' : 'Carrier Company'}
              </label>
              <input
                type="text"
                dir={!carrierCompany ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={carrierCompany}
                onChange={(e) => setCarrierCompany(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'محل تردد / تخلیه و بارگیری' : 'Unloading Location'}
              </label>
              <input
                type="text"
                dir={!trafficLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={trafficLocation}
                onChange={(e) => setTrafficLocation(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نوع وسیله نقلیه' : 'Vehicle Type'}
              </label>
              <input
                type="text"
                dir={!vehicleType ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                placeholder={isFa ? 'تریلی / کامیون / ...' : 'Truck / Trailer'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره پلاک خودرو' : t.headers.vehicleNo}
              </label>
              <input
                type="text"
                dir={!vehicleNo ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.billOfLadingNo}
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

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.driverName}
              </label>
              <input
                type="text"
                dir={!driverName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Packing List Selection */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa
                  ? `انتخاب پکینگ لیست‌های وارده (${selectedPackings.length.toLocaleString('fa-IR')} مورد)`
                  : `Select Arriving Packing Lists (${selectedPackings.length} selected)`} *
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

            <div className="max-h-40 overflow-y-auto p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
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

          {/* Editable Line Items Preview for the Form Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa ? 'اقلام جدول صورتجلسه (قابل ویرایش پیش از چاپ)' : 'Form Table Line Items'}
              </span>
              <button
                type="button"
                onClick={addBlankRow}
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
                      <th className="py-2 px-2 w-10">#</th>
                      <th className="py-2 px-2 min-w-[160px]">{isFa ? 'شرح' : 'Description'}</th>
                      <th className="py-2 px-2 min-w-[100px]">{isFa ? 'شماره لیست بسته' : 'Packing List'}</th>
                      <th className="py-2 px-2 min-w-[85px]">{isFa ? 'شماره بسته' : 'Package No.'}</th>
                      <th className="py-2 px-2 min-w-[90px]">{isFa ? 'ابعاد' : 'Dimensions'}</th>
                      <th className="py-2 px-2 w-16">{isFa ? 'تعداد' : 'Qty'}</th>
                      <th className="py-2 px-2 w-20">{isFa ? 'واحد' : 'Unit'}</th>
                      <th className="py-2 px-2 w-20">{isFa ? 'وزن خالص' : 'Net Wt'}</th>
                      <th className="py-2 px-2 w-20">{isFa ? 'وزن ناخالص' : 'Gross Wt'}</th>
                      <th className="py-2 px-2 min-w-[110px]">{isFa ? 'توضیحات' : 'Remarks'}</th>
                      <th className="py-2 px-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5 tabular-nums">{idx + 1}</td>
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
                            dir="ltr"
                            value={it.dimensions}
                            onChange={(e) => updateItemField(idx, 'dimensions', e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={it.qty}
                            onChange={(e) => updateItemField(idx, 'qty', e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={it.unit}
                            onChange={(e) => updateItemField(idx, 'unit', e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px]"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={it.netWeight}
                            onChange={(e) => updateItemField(idx, 'netWeight', e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            dir="ltr"
                            value={it.grossWeight}
                            onChange={(e) => updateItemField(idx, 'grossWeight', e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] tabular-nums"
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

          {/* Signers & Approvals Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انباردار / پیمانکار' : 'Storekeeper / Contractor'}
              </label>
              <input
                type="text"
                dir={!warehouseKeeper ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={warehouseKeeper}
                onChange={(e) => setWarehouseKeeper(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'مدیر پروژه / سرپرست کارگاه پیمانکار' : 'Contractor PM / Site Supervisor'}
              </label>
              <input
                type="text"
                dir={!contractorManager ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={contractorManager}
                onChange={(e) => setContractorManager(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انتظامات مپنا' : 'MAPNA Security'}
              </label>
              <input
                type="text"
                dir={!mapnaSecurity ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={mapnaSecurity}
                onChange={(e) => setMapnaSecurity(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تامین تجهیزات' : 'Equipment Supply'}
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
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 flex items-center justify-between">
                <span>{isFa ? 'QC / دفتر فنی' : 'QC / Tech Office'}</span>
                <label className="inline-flex items-center gap-1 cursor-pointer text-[10px]">
                  <input
                    type="checkbox"
                    checked={qcChecked}
                    onChange={(e) => setQcChecked(e.target.checked)}
                  />
                  <span>{isFa ? 'تایید' : 'Checked'}</span>
                </label>
              </label>
              <input
                type="text"
                dir={!qcTechOffice ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={qcTechOffice}
                onChange={(e) => setQcTechOffice(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1 flex items-center justify-between">
                <span>HSE</span>
                <label className="inline-flex items-center gap-1 cursor-pointer text-[10px]">
                  <input
                    type="checkbox"
                    checked={hseChecked}
                    onChange={(e) => setHseChecked(e.target.checked)}
                  />
                  <span>{isFa ? 'تایید' : 'Checked'}</span>
                </label>
              </label>
              <input
                type="text"
                dir={!hseOfficer ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={hseOfficer}
                onChange={(e) => setHseOfficer(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نماینده کارفرما / دستگاه نظارت' : 'Employer / Supervision Rep.'}
              </label>
              <input
                type="text"
                dir={!employerRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={employerRep}
                onChange={(e) => setEmployerRep(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
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
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFa ? 'ثبت صورتجلسه ورود و نمایش فرم چاپی' : 'Save Minutes & Preview Form'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Recorded History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق صورتجلسه‌های ورود کالا و تجهیزات به کارگاه' : 'Recorded Site Entry Minutes'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv({
                  rows: data?.minutes || [],
                  columns: reportColumns,
                  filename: 'samaan-site-entry-minutes',
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
                <th className="py-2.5 px-4">{isFa ? 'شماره صورتجلسه / AN' : 'Arrival Notice No.'}</th>
                <th className="py-2.5 px-4">Release Note</th>
                <th className="py-2.5 px-4">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4">{t.headers.packingListNo}</th>
                <th className="py-2.5 px-4">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor'}</th>
                <th className="py-2.5 px-4">{t.headers.billOfLadingNo}</th>
                <th className="py-2.5 px-4">{isFa ? 'وضعیت ظاهری' : 'Condition'}</th>
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
              ) : (data?.minutes || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                (data?.minutes || []).map((rec) => (
                  <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">{rec.minutesNo}</td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">{rec.releaseNoteNo || '-'}</td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">{formatDate(rec.date)}</td>
                    <td className="py-2.5 px-4 bidi-plaintext" dir="ltr">{rec.packingListNos.join(', ')}</td>
                    <td className="py-2.5 px-4 bidi-plaintext">{rec.supplier || '-'}</td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">{rec.waybillNo || '-'}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          rec.conditionStatus === 'healthy'
                            ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                            : rec.conditionStatus === 'shortage_suspected'
                              ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                              : 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                        }`}
                      >
                        {conditionLabel(rec.conditionStatus)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setPrintSheet(rec)}
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

      {/* Printable Official MD1EX-FQP02/15-01 Preview Modal */}
      {printSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">{t.nav.siteEntry}</h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/15-01 · {printSheet.minutesNo}
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
                  onClick={() => setPrintSheet(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto max-w-[790px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialSiteEntrySheet
                  record={printSheet}
                  generalEntries={data?.generalEntries || []}
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
        title={t.nav.siteEntry}
        columns={reportColumns}
        rows={data?.minutes || []}
      />
    </div>
  );
};
