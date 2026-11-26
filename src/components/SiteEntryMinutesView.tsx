import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { triggerAppPrint } from '../lib/print.ts';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ClipboardSignature,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
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
  GeneralEntry,
  SiteEntryLineItem,
  SiteEntryMinutesRecord,
  TransitEntry,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface SiteEntryApiResponse {
  minutes: SiteEntryMinutesRecord[];
  generalEntries: GeneralEntry[];
  transitEntries?: TransitEntry[];
  detailedItems?: DetailedComputed[];
  packings: string[];
}

interface SiteEntryMinutesViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const joinUnique = (values: Array<string | undefined | null>): string => {
  const uniq = Array.from(new Set(values.map((v) => (v || '').trim()).filter(Boolean)));
  return uniq.join(' / ');
};

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
          unit: (g.packageType || '').trim() || 'بسته',
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
  const { activeEmployer, activeProject } = useApp();
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
  const design = resolveBuiltInFormDesign(activeEmployer, 'siteEntry');
  const formCode = design.docCode;
  const displayProjectName = record.projectName?.trim() || activeProject?.name || '..........';
  const displayContractNo = record.contractNo?.trim() || activeProject?.code || '';

  return (
    <div
      dir="rtl"
      className={`site-entry-official-sheet ${
        design.orientation === 'landscape' ? 'samaan-a4-landscape' : 'samaan-a4-portrait'
      }`}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ border: `1.8px solid ${design.accentColor}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={design}
          projectTitle={`پروژه ${displayProjectName}`}
          extraCenterSlot={
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
          }
        />
        <OfficialExtraMetaStrip design={design} inset borderColor={design.accentColor} />

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
                {displayContractNo}
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
          className="samaan-dynamic-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '9.5px',
          }}
        >
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                ردیف
              </th>
              <th
                rowSpan={2}
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 5px',
                  fontWeight: 700,
                }}
              >
                شرح
              </th>
              <th
                rowSpan={2}
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                شماره لیست بسته
              </th>
              <th
                rowSpan={2}
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                شماره بسته
              </th>
              <th
                rowSpan={2}
                className="samaan-col-code"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                ابعاد
              </th>
              <th
                rowSpan={2}
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                تعداد
              </th>
              <th
                rowSpan={2}
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '4px 4px',
                  fontWeight: 700,
                }}
              >
                واحد
              </th>
              <th
                colSpan={2}
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 4px',
                  fontWeight: 700,
                }}
              >
                وزن
              </th>
              <th
                rowSpan={2}
                className="samaan-col-fluid"
                style={{
                  borderBottom: '1px solid #000000',
                  padding: '4px 5px',
                  fontWeight: 700,
                }}
              >
                توضیحات
              </th>
            </tr>
            <tr>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 4px',
                  fontSize: '8.5px',
                  fontWeight: 700,
                }}
              >
                خالص
              </th>
              <th
                className="samaan-col-compact"
                style={{
                  borderBottom: '1px solid #000000',
                  borderLeft: '1px solid #000000',
                  padding: '3px 4px',
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
              <tr key={idx}>
                <td
                  className="tabular-nums samaan-col-compact"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                    fontSize: '9px',
                  }}
                >
                  {row ? idx + 1 : idx === 0 ? '1.' : '\u00A0'}
                </td>
                <td
                  className="bidi-plaintext samaan-col-fluid"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 5px',
                  }}
                >
                  {row?.description || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-code"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.packingListNo || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-code"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.packageNo || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-code"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.dimensions || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-compact"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.qty || ''}
                </td>
                <td
                  className="samaan-col-compact"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.unit || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-compact"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.netWeight || ''}
                </td>
                <td
                  dir="ltr"
                  className="tabular-nums samaan-col-compact"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    borderLeft: '1px solid #000000',
                    padding: '4px 4px',
                  }}
                >
                  {row?.grossWeight || ''}
                </td>
                <td
                  className="bidi-plaintext samaan-col-fluid"
                  style={{
                    borderBottom: idx === paddedRows.length - 1 ? 'none' : '1px solid #000000',
                    padding: '4px 5px',
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
        {(design.template?.signatures?.length || !design.showSignatures) ? (
          <OfficialFormSignatures
            signatures={design.signatures}
            showSignatures={design.showSignatures}
            borderColor={design.accentColor}
          />
        ) : (
        <div
          className="samaan-keep-together"
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
              <div style={{ fontWeight: 700 }}>{activeEmployer.securityLabel}</div>
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
        )}

        {/* QA Explanatory Notes Box */}
        <div
          style={{
            padding: '5px 10px 6px',
            fontSize: '8.2px',
            lineHeight: 1.7,
            textAlign: 'right',
          }}
        >
          {design.template?.introText ? (
            <div style={{ fontWeight: 600 }}>{design.template.introText}</div>
          ) : (
            <>
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
                توضیح 4 : فرم مذکور میبایست توسط {activeEmployer.securityLabel} امضا و سپس ممهور گردد.
              </div>
            </>
          )}
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
        <div>
          {design.template?.footerCopyText ||
            `رونوشت : 1- درخواست کننده / پیمانکار   2- ${activeEmployer.equipmentSupplyLabel}   3- ${activeEmployer.securityLabel}`}
        </div>
        {(formCode || design.revisionText) && (
          <div dir="ltr" className="tabular-nums">
            {[formCode, design.revisionText].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
};

export const SiteEntryMinutesView: React.FC<SiteEntryMinutesViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot, activeEmployer, activeProject } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';
  const formCode = getEmployerFormCode(activeEmployer, '15-01');

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [data, setData] = useState<SiteEntryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanTarget, setScanTarget] = useState<SiteEntryMinutesRecord | null>(null);
  const minutesList = useMemo(() => data?.minutes || [], [data]);
  const minutesPagination = useClientPagination(minutesList, 50);

  const [minutesNo, setMinutesNo] = useState('');
  const suggestedMinutesNo = useMemo(
    () =>
      generateNextPlantAwareDocNo(
        'AN',
        minutesList.map((m) => m.minutesNo),
        extractPlantDocConfig(activeProject),
      ),
    [minutesList, activeProject],
  );
  const [releaseNoteNo, setReleaseNoteNo] = useState('');
  const [entryType, setEntryType] = useState<'permanent' | 'temporary'>('permanent');
  const [goodsUsage, setGoodsUsage] = useState<'project' | 'site_equip' | 'general'>('project');
  const [date, setDate] = useState(getTodayIso());
  const [arrivalDate, setArrivalDate] = useState(getTodayIso());

  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [packingSearch, setPackingSearch] = useState('');
  const [showOlderPackings, setShowOlderPackings] = useState(false);

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

  const [conditionStatus, setConditionStatus] = useState<SiteEntryMinutesRecord['conditionStatus']>('healthy');
  const [notes, setNotes] = useState('');

  const [editingRecord, setEditingRecord] = useState<SiteEntryMinutesRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteEntryMinutesRecord | null>(null);
  const [printSheet, setPrintSheet] = useState<SiteEntryMinutesRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  const [packingRenderCap, setPackingRenderCap] = useState(60);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<SiteEntryApiResponse>('/api/site-entry?compact=1&limit=120');
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

  // O(N) packing metadata map (arrivalDate & priority status within last 7 days)
  const packingMetaInfo = useMemo(() => {
    const todayIso = getTodayIso();
    const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const generalByPacking = new Map<string, GeneralEntry[]>();
    for (const g of data?.generalEntries || []) {
      const pk = (g.packingListNo || '').trim();
      if (!pk) continue;
      let bucket = generalByPacking.get(pk);
      if (!bucket) {
        bucket = [];
        generalByPacking.set(pk, bucket);
      }
      bucket.push(g);
    }
    const map = new Map<string, { arrivalDate: string; isRecent: boolean; sortKey: string }>();

    for (const pk of data?.packings || []) {
      const matches = generalByPacking.get(pk) || [];
      let primaryArrival = '';
      let isRecent = false;

      for (const g of matches) {
        const arrStr = (g.arrivalDate || '').trim();
        if (!primaryArrival && arrStr) primaryArrival = arrStr;
        if (!isRecent && /^\d{4}-\d{2}-\d{2}$/.test(arrStr)) {
          const ms = Date.parse(`${arrStr}T00:00:00Z`);
          if (Number.isFinite(ms) && todayMs - ms <= sevenDaysMs && ms <= todayMs + 2 * 24 * 60 * 60 * 1000) {
            isRecent = true;
          }
        }
        if (!isRecent) {
          const createdStr = (g.createdAt || '').slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(createdStr)) {
            const ms = Date.parse(`${createdStr}T00:00:00Z`);
            if (Number.isFinite(ms) && todayMs - ms <= sevenDaysMs) {
              isRecent = true;
            }
          }
        }
      }

      const sortKey = primaryArrival || matches[0]?.createdAt?.slice(0, 10) || '0000-00-00';
      map.set(pk, { arrivalDate: primaryArrival, isRecent, sortKey });
    }
    return map;
  }, [data]);

  const { priorityPackings, olderPackings } = useMemo(() => {
    const all = [...(data?.packings || [])];
    const needle = packingSearch.trim().toLowerCase();
    const filtered = needle ? all.filter((p) => p.toLowerCase().includes(needle)) : all;

    filtered.sort((a, b) => {
      const ma = packingMetaInfo.get(a);
      const mb = packingMetaInfo.get(b);
      return (mb?.sortKey || '').localeCompare(ma?.sortKey || '') || b.localeCompare(a);
    });

    const recent: string[] = [];
    const older: string[] = [];
    for (const pk of filtered) {
      const info = packingMetaInfo.get(pk);
      if (info?.isRecent || selectedPackings.includes(pk)) {
        recent.push(pk);
      } else {
        older.push(pk);
      }
    }
    return { priorityPackings: recent, olderPackings: older };
  }, [data, packingSearch, packingMetaInfo, selectedPackings]);

  // Single arrival date enforced across selected packings
  const lockedArrivalDate = useMemo(() => {
    for (const pk of selectedPackings) {
      const arr = packingMetaInfo.get(pk)?.arrivalDate;
      if (arr) return arr;
    }
    return '';
  }, [selectedPackings, packingMetaInfo]);

  const syncMetadataFromPackings = useCallback(
    (packings: string[]) => {
      const generalEntries = data?.generalEntries || [];
      const transitEntries = data?.transitEntries || [];
      const detailedItems = data?.detailedItems || [];

      const genMatches = generalEntries.filter((g) => packings.includes((g.packingListNo || '').trim()));
      const transitMatches = transitEntries.filter(
        (tr) =>
          packings.includes((tr.packingListNo || '').trim()) ||
          packings.includes((tr.linkedGeneralPackingNo || '').trim()),
      );
      const detMatches = detailedItems.filter((d) => packings.includes((d.shipmentNo || '').trim()));

      const autoMinutesNo = joinUnique(genMatches.map((g) => g.mapnaEntryMinutesNo));
      const autoReleaseNo = joinUnique([
        ...genMatches.map((g) => g.releaseNo),
        ...transitMatches.map((tr) => tr.releaseNetNo),
      ]);
      const autoArrivalDate = genMatches.map((g) => (g.arrivalDate || '').trim()).find(Boolean) || '';
      const resolvedDate = autoArrivalDate || getTodayIso();

      setMinutesNo(autoMinutesNo);
      setReleaseNoteNo(autoReleaseNo || (packings.length > 0 ? 'تأیید صورتجلسه‌ی ورود' : ''));
      setArrivalDate(resolvedDate);
      if (autoArrivalDate) {
        setDate(autoArrivalDate);
      }
      setSupplier(joinUnique([...genMatches.map((g) => g.supplier), ...detMatches.map((d) => d.supplier)]));
      setUnit(joinUnique([...genMatches.map((g) => g.unit), ...detMatches.map((d) => d.unit)]));
      setSystem(joinUnique([...genMatches.map((g) => g.system), ...detMatches.map((d) => d.system)]));
      setIsland(joinUnique([...genMatches.map((g) => g.island), ...detMatches.map((d) => d.island)]));
      setOrigin(
        joinUnique([
          ...genMatches.map((g) => g.dispatchLocation),
          ...detMatches.map((d) => d.origin),
          ...transitMatches.map((tr) => tr.dispatchLocation),
        ]),
      );
      setCarrierCompany(joinUnique(transitMatches.map((tr) => tr.carrierContractor)));
      setDriverName(joinUnique(genMatches.map((g) => g.driverName)));
      setVehicleNo(joinUnique(genMatches.map((g) => g.vehicleNo)));
      setWaybillNo(
        joinUnique([...genMatches.map((g) => g.billOfLadingNo), ...transitMatches.map((tr) => tr.billOfLadingNo)]),
      );
    },
    [data],
  );

  const togglePacking = async (pk: string) => {
    const isRemoving = selectedPackings.includes(pk);
    if (!isRemoving) {
      const candidateArr = packingMetaInfo.get(pk)?.arrivalDate || '';
      if (lockedArrivalDate && candidateArr && candidateArr !== lockedArrivalDate) {
        notify(
          'warning',
          isFa
            ? `امکان انتخاب هم‌زمان پکینگ‌های با تاریخ ورود متفاوت وجود ندارد (${formatDate(lockedArrivalDate)} در برابر ${formatDate(candidateArr)}).`
            : `Cannot select packings with different arrival dates.`,
        );
        return;
      }
    }
    const nextPackings = isRemoving
      ? selectedPackings.filter((x) => x !== pk)
      : [...selectedPackings, pk];

    setSelectedPackings(nextPackings);

    let generalEntries = data?.generalEntries || [];
    if (!isRemoving && !generalEntries.some((g) => (g.packingListNo || '').trim() === pk)) {
      try {
        const fetched = await apiRequest<SiteEntryApiResponse>(
          `/api/site-entry?compact=1&packing=${encodeURIComponent(pk)}`,
        );
        const existingGenIds = new Set(generalEntries.map((g) => g.id));
        const mergedGeneral = [
          ...generalEntries,
          ...(fetched.generalEntries || []).filter((g) => !existingGenIds.has(g.id)),
        ];
        const existingTrIds = new Set((data?.transitEntries || []).map((t) => t.id));
        const mergedTransit = [
          ...(data?.transitEntries || []),
          ...(fetched.transitEntries || []).filter((t) => !existingTrIds.has(t.id)),
        ];
        const existingDetIds = new Set((data?.detailedItems || []).map((d) => d.id));
        const mergedDetailed = [
          ...(data?.detailedItems || []),
          ...(fetched.detailedItems || []).filter((d) => !existingDetIds.has(d.id)),
        ];
        generalEntries = mergedGeneral;
        setData((prev) =>
          prev
            ? {
                ...prev,
                generalEntries: mergedGeneral,
                transitEntries: mergedTransit,
                detailedItems: mergedDetailed,
              }
            : fetched,
        );
      } catch {
        // fallback to existing loaded slice
      }
    }
    syncMetadataFromPackings(nextPackings);
    if (!isRemoving) {
      const addedRows = buildItemsFromGeneral([pk], generalEntries);
      setItems((prev) => [...prev, ...addedRows]);
    } else {
      setItems((prev) => prev.filter((it) => it.packingListNo !== pk));
    }
  };

  const resetForm = () => {
    setEditingRecord(null);
    setMinutesNo('');
    setReleaseNoteNo('');
    setEntryType('permanent');
    setGoodsUsage('project');
    setDate(getTodayIso());
    setArrivalDate(getTodayIso());
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
    setConditionStatus('healthy');
    setNotes('');
  };

  const startEdit = (rec: SiteEntryMinutesRecord) => {
    setViewMode('create');
    setEditingRecord(rec);
    setMinutesNo(rec.minutesNo || '');
    setReleaseNoteNo(rec.releaseNoteNo || 'تأیید صورتجلسه‌ی ورود');
    setEntryType(rec.entryType || 'permanent');
    setGoodsUsage(rec.goodsUsage || 'project');
    setDate(rec.date || getTodayIso());
    setArrivalDate(rec.arrivalDate || rec.date || getTodayIso());
    setSelectedPackings(rec.packingListNos || []);
    setSupplier(rec.supplier || '');
    setUnit(rec.unit || '');
    setSystem(rec.system || '');
    setIsland(rec.island || '');
    setOrigin(rec.origin || '');
    setCarrierCompany(rec.carrierCompany || '');
    setTrafficLocation(rec.trafficLocation || '');
    setVehicleType(rec.vehicleType || '');
    setDriverName(rec.driverName || '');
    setVehicleNo(rec.vehicleNo || '');
    setWaybillNo(rec.waybillNo || '');
    setItems(
      rec.items && rec.items.length > 0
        ? rec.items
        : buildItemsFromGeneral(rec.packingListNos || [], data?.generalEntries || []),
    );
    setConditionStatus(rec.conditionStatus || 'healthy');
    setNotes(rec.notes || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const effectiveDate = lockedArrivalDate || date;
    const effectiveArrivalDate = lockedArrivalDate || arrivalDate;
    const payload = {
      minutesNo,
      releaseNoteNo: releaseNoteNo.trim() || 'تأیید صورتجلسه‌ی ورود',
      projectName: activeProject?.name || '',
      entryType,
      goodsUsage,
      contractNo: activeProject?.code || '',
      date: effectiveDate,
      arrivalDate: effectiveArrivalDate,
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
      conditionStatus,
      notes,
    };

    try {
      if (editingRecord) {
        const res = await apiRequest<{ record: SiteEntryMinutesRecord }>(`/api/site-entry/${editingRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `صورتجلسه ورود شماره ${res.record.minutesNo} با موفقیت ویرایش شد.`
            : `Site Entry Minutes ${res.record.minutesNo} updated.`,
        );
        resetForm();
        setPrintSheet(res.record);
        triggerAutoSnapshot(`Edit Site Entry ${res.record.minutesNo}`);
        onDataChanged();
        loadData();
      } else {
        const res = await apiRequest<{ record: SiteEntryMinutesRecord }>('/api/site-entry', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(
          'success',
          isFa
            ? `صورتجلسه ورود شماره ${res.record.minutesNo} با موفقیت ثبت شد.`
            : `Site Entry Minutes ${res.record.minutesNo} saved.`,
        );
        resetForm();
        setPrintSheet(res.record);
        triggerAutoSnapshot(`Site Entry ${res.record.minutesNo}`);
        onDataChanged();
        loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest<{ ok: boolean }>(`/api/site-entry/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      notify(
        'success',
        isFa
          ? `صورتجلسه ورود شماره ${deleteTarget.minutesNo} حذف شد.`
          : `Site Entry Minutes ${deleteTarget.minutesNo} deleted.`,
      );
      if (editingRecord?.id === deleteTarget.id) resetForm();
      if (printSheet?.id === deleteTarget.id) setPrintSheet(null);
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete Site Entry ${deleteTarget.minutesNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<PrintColumnDef<SiteEntryMinutesRecord>[]>(
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
          <div id="samaan-form-print-root" data-samaan-print-portal="true">
            <style>{buildIsolatedPrintPortalCss('samaan-form-print-root', {
              orientation: 'portrait',
              isFa,
              extraPrintCss: `
                #samaan-form-print-root table {
                  width: 100% !important;
                  table-layout: auto !important;
                }
                #samaan-form-print-root tr {
                  height: auto !important;
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
                #samaan-form-print-root table th,
                #samaan-form-print-root table td {
                  text-align: center;
                  vertical-align: middle;
                  height: auto !important;
                }
              `,
            })}</style>
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

      {/* Top Mode Bar: Form vs History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <ClipboardSignature className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>{t.nav.siteEntry}</span>
          {formCode && (
            <span dir="ltr" className="text-[11px] font-mono text-[var(--text-muted)]">
              {formCode}
            </span>
          )}
        </div>
        <OperationalViewModeTabs
          viewMode={viewMode}
          onChange={setViewMode}
          historyCount={minutesList.length}
          isFa={isFa}
          canCreate={canEdit}
          isEditing={Boolean(editingRecord)}
          testIdPrefix="site-entry"
        />
      </div>

      {canEdit && viewMode === 'create' && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ClipboardSignature className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.siteEntry}</span>
              {editingRecord && (
                <span className="px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-[11px] font-semibold">
                  {isFa ? `حالت ویرایش: ${editingRecord.minutesNo}` : `Editing: ${editingRecord.minutesNo}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editingRecord && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t.controls.cancel}</span>
                </button>
              )}
              {formCode && (
                <span dir="ltr" className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">
                  {formCode}
                </span>
              )}
            </div>
          </div>

          {/* Packing List Selection (Pick first to auto-fill General & Transit metadata) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa
                  ? `۱. انتخاب پکینگ لیست‌های وارده (${selectedPackings.length.toLocaleString('fa-IR')} مورد — تکمیل خودکار از بخش ثبت کلی)`
                  : `1. Select Arriving Packing Lists (${selectedPackings.length} selected — auto-fills from General)`} *
              </label>
              <SearchInputWithClear
                value={packingSearch}
                onChange={setPackingSearch}
                placeholder={isFa ? 'فیلتر شماره پکینگ...' : 'Filter packing no...'}
                className="w-64"
                inputClassName="h-8 text-xs"
              />
            </div>

            <div className="max-h-48 overflow-y-auto p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-2.5">
              {priorityPackings.length === 0 && olderPackings.length === 0 ? (
                <div className="text-center py-4 text-xs text-[var(--text-muted)]">
                  {t.controls.noData}
                </div>
              ) : (
                <>
                  {priorityPackings.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[var(--accent-primary)]">
                        {isFa
                          ? `پکینگ‌های اولویت‌دار (ثبت‌شده از امروز تا ۷ روز گذشته — ${priorityPackings.length.toLocaleString('fa-IR')} مورد)`
                          : `Priority Packings (Last 7 Days — ${priorityPackings.length})`}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        {priorityPackings.slice(0, packingRenderCap).map((pk) => {
                          const checked = selectedPackings.includes(pk);
                          const info = packingMetaInfo.get(pk);
                          const diffDate = Boolean(lockedArrivalDate && info?.arrivalDate && info.arrivalDate !== lockedArrivalDate && !checked);
                          return (
                            <label
                              key={pk}
                              title={info?.arrivalDate ? `${isFa ? 'تاریخ ورود:' : 'Arrival:'} ${formatDate(info.arrivalDate)}` : ''}
                              className={`px-2.5 py-2 rounded-lg border text-xs flex flex-col gap-0.5 transition-colors ${
                                diffDate
                                  ? 'opacity-45 cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
                                  : checked
                                    ? 'cursor-pointer border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                                    : 'cursor-pointer border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  disabled={diffDate}
                                  checked={checked}
                                  onChange={() => togglePacking(pk)}
                                />
                                <span dir="ltr" className="truncate tabular-nums">
                                  {pk}
                                </span>
                              </div>
                              {info?.arrivalDate && (
                                <span className="text-[10px] text-[var(--text-muted)] ps-5 tabular-nums">
                                  {formatDate(info.arrivalDate)}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {olderPackings.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => setShowOlderPackings((v) => !v)}
                        className="text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center gap-1"
                      >
                        <span>
                          {showOlderPackings
                            ? isFa
                              ? `پنهان‌کردن پکینگ‌های قدیمی‌تر (${olderPackings.length.toLocaleString('fa-IR')})`
                              : `Hide Older Packings (${olderPackings.length})`
                            : isFa
                              ? `نمایش پکینگ‌های قدیمی‌تر (${olderPackings.length.toLocaleString('fa-IR')} مورد)`
                              : `Show Older Packings (${olderPackings.length})`}
                        </span>
                      </button>

                      {(showOlderPackings || Boolean(packingSearch.trim()) || priorityPackings.length === 0) && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                            {olderPackings.slice(0, packingRenderCap).map((pk) => {
                              const checked = selectedPackings.includes(pk);
                              const info = packingMetaInfo.get(pk);
                              const diffDate = Boolean(lockedArrivalDate && info?.arrivalDate && info.arrivalDate !== lockedArrivalDate && !checked);
                              return (
                                <label
                                  key={pk}
                                  title={info?.arrivalDate ? `${isFa ? 'تاریخ ورود:' : 'Arrival:'} ${formatDate(info.arrivalDate)}` : ''}
                                  className={`px-2.5 py-2 rounded-lg border text-xs flex flex-col gap-0.5 transition-colors ${
                                    diffDate
                                      ? 'opacity-45 cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-subtle)]'
                                      : checked
                                        ? 'cursor-pointer border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                                        : 'cursor-pointer border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      disabled={diffDate}
                                      checked={checked}
                                      onChange={() => togglePacking(pk)}
                                    />
                                    <span dir="ltr" className="truncate tabular-nums">
                                      {pk}
                                    </span>
                                  </div>
                                  {info?.arrivalDate && (
                                    <span className="text-[10px] text-[var(--text-muted)] ps-5 tabular-nums">
                                      {formatDate(info.arrivalDate)}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          {olderPackings.length > packingRenderCap && (
                            <div className="pt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                              <span>
                                {isFa
                                  ? `نمایش ${packingRenderCap.toLocaleString('fa-IR')} از ${olderPackings.length.toLocaleString('fa-IR')} پکینگ — برای یافتن سریع‌تر از کادر فیلتر بالا استفاده کنید.`
                                  : `Showing ${packingRenderCap} of ${olderPackings.length} packings — search above to narrow down.`}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPackingRenderCap((c) => c + 60)}
                                className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent-primary)] font-semibold hover:bg-[var(--bg-subtle)]"
                              >
                                {isFa ? 'نمایش ۶۰ مورد بیشتر' : 'Show 60 more'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {lockedArrivalDate && (
              <p className="text-[11px] text-[var(--text-muted)]">
                {isFa
                  ? `فقط پکینگ‌های دارای تاریخ ورود یکسان (${formatDate(lockedArrivalDate)}) قابل انتخاب هم‌زمان هستند.`
                  : `Only packings sharing arrival date ${formatDate(lockedArrivalDate)} can be selected together.`}
              </p>
            )}
          </div>

          {/* Row 1: Core Notice Header & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="block text-[11px] text-[var(--text-secondary)]">
                  {isFa ? 'شماره صورتجلسه (Arrival Notice No.)' : 'Arrival Notice No.'} *
                </label>
                {!editingRecord && (
                  <button
                    type="button"
                    onClick={() => setMinutesNo(suggestedMinutesNo)}
                    className="text-[10px] font-mono text-[var(--accent-primary)] hover:underline tabular-nums"
                    dir="ltr"
                  >
                    {suggestedMinutesNo}
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                dir={isFa && !minutesNo ? 'rtl' : 'ltr'}
                value={minutesNo}
                onChange={(e) => setMinutesNo(e.target.value)}
                placeholder={suggestedMinutesNo}
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
                dir={!releaseNoteNo ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={releaseNoteNo}
                onChange={(e) => setReleaseNoteNo(e.target.value)}
                placeholder="تأیید صورتجلسه‌ی ورود"
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <JalaliDateInput
                label={`${isFa ? 'تاریخ صورتجلسه' : 'Minutes Date'} *`}
                disabled={Boolean(lockedArrivalDate)}
                value={lockedArrivalDate || date}
                onChange={setDate}
              />
              {lockedArrivalDate && (
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {isFa
                    ? 'تاریخ صورتجلسه بر اساس تاریخ ورود پکینگ قفل شده است.'
                    : 'Locked to the selected packing arrival date.'}
                </p>
              )}
            </div>

            <JalaliDateInput
              label={isFa ? 'تاریخ ورود به کارگاه' : 'Arrival Date'}
              disabled={Boolean(lockedArrivalDate)}
              value={lockedArrivalDate || arrivalDate}
              onChange={setArrivalDate}
            />
          </div>

          {/* Row 2: Entry Type, Goods Usage, Condition (Project & Contract inherited automatically) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

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
              <div className="rounded-lg border border-[var(--border-subtle)] overflow-x-clip">
                <StickyTableWrapper maxHeightClass="max-h-80">
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
                </StickyTableWrapper>
              </div>
            )}
          </div>

          {/* Notes & Submit */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.notes}
              </label>
              <input
                type="text"
                dir={!notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isFa ? 'توضیحات تکمیلی صورتجلسه (اختیاری)...' : 'Additional minutes notes (optional)...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              {isFa
                ? 'با انتخاب هر پکینگ لیست، مشخصات حمل، پیمانکار، مبدا، سیستم/جزیره و اقلام به‌صورت خودکار از «ثبت کلی تجهیزات» خوانده می‌شوند. بخش‌های امضاء روی نسخه چاپی به‌صورت دستی امضاء و ممهور می‌گردند.'
                : 'Selecting a Packing List automatically loads shipment, contractor, origin, system/island, and package items from General Registry. Signature blocks remain blank on the printed sheet for physical signing.'}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            {editingRecord && (
              <button
                type="button"
                onClick={resetForm}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
              >
                {t.controls.cancel}
              </button>
            )}
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {editingRecord
                  ? isFa
                    ? 'ذخیره ویرایش صورتجلسه و نمایش فرم'
                    : 'Save Changes & Preview'
                  : isFa
                    ? 'ثبت صورتجلسه ورود و نمایش فرم چاپی'
                    : 'Save Minutes & Preview Form'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Recorded History */}
      {(viewMode === 'history' || !canEdit) && (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق صورتجلسه‌های ورود کالا و تجهیزات به کارگاه' : 'Recorded Site Entry Minutes'}
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
                <th className="py-2.5 px-4">{isFa ? 'شماره صورتجلسه / AN' : 'Arrival Notice No.'}</th>
                <th className="py-2.5 px-4">Release Note</th>
                <th className="py-2.5 px-4">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4">{t.headers.packingListNo}</th>
                <th className="py-2.5 px-4">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Contractor'}</th>
                <th className="py-2.5 px-4">{t.headers.billOfLadingNo}</th>
                <th className="py-2.5 px-4">{isFa ? 'وضعیت ظاهری' : 'Condition'}</th>
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
              ) : minutesList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                minutesPagination.pageItems.map((rec) => (
                  <tr
                    key={rec.id}
                    onClick={() => setScanTarget(rec)}
                    title={isFa ? 'کلیک برای مشاهده یا بارگذاری اسکن امضاشده فرم' : 'Click to view or upload signed scan'}
                    className="hover:bg-[var(--bg-subtle)]/50 cursor-pointer"
                  >
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
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <SignedScanRowButton
                        signedScan={rec.signedScan}
                        recordLabel={rec.minutesNo}
                        onClick={() => setScanTarget(rec)}
                      />
                    </td>
                    <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPrintSheet(rec)}
                          className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{t.controls.print}</span>
                        </button>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(rec)}
                              className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                              title={t.controls.edit}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>{t.controls.edit}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(rec)}
                              className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] text-[11px] font-medium inline-flex items-center gap-1"
                              title={t.controls.delete}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{t.controls.delete}</span>
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
          page={minutesPagination.page}
          totalPages={minutesPagination.totalPages}
          total={minutesPagination.total}
          pageSize={minutesPagination.pageSize}
          onPageChange={minutesPagination.setPage}
          onPageSizeChange={minutesPagination.setPageSize}
          lang={prefs.language}
        />
      </div>
      )}

      {/* Printable Official MD1EX-FQP02/15-01 Preview Modal */}
      {printSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">{t.nav.siteEntry}</h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  {formCode ? `${formCode} · ` : ''}{printSheet.minutesNo}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerAppPrint()}
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
              <div className="mx-auto w-full max-w-[196mm] bg-white p-5 shadow-lg rounded-sm">
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

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف صورتجلسه ورود به کارگاه' : 'Delete Site Entry Minutes'}
        itemLabel={deleteTarget ? `${deleteTarget.minutesNo} · ${deleteTarget.packingListNos.join(', ')}` : ''}
        message={
          isFa
            ? 'آیا از حذف این صورتجلسه اطمینان دارید؟ این عملیات قابل بازگشت نیست.'
            : 'Are you sure you want to delete this site entry minutes record? This action cannot be undone.'
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {scanTarget && (
        <SignedScanModal
          open={Boolean(scanTarget)}
          collection="siteEntry"
          recordId={scanTarget.id}
          recordLabel={scanTarget.minutesNo}
          signedScan={scanTarget.signedScan}
          onClose={() => setScanTarget(null)}
          onUpdated={(nextScan) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    minutes: prev.minutes.map((m) =>
                      m.id === scanTarget.id ? { ...m, signedScan: nextScan } : m,
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
