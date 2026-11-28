import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardSignature,
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
  buildSiteEntryHeaderAutoFill,
  buildSiteEntryLineItems,
  generateSiteEntryMinutesNo,
  hasSiteEntryMinutes,
  MD1_SITE_ENTRY_COMPANY_NAME,
  MD1_SITE_ENTRY_COPY_TEXT,
  MD1_SITE_ENTRY_FORM_CODE,
  MD1_SITE_ENTRY_QA_NOTICE,
  MD1_SITE_ENTRY_TITLE_FA,
  SITE_ENTRY_GOODS_USAGE_OPTIONS,
  type SiteEntryGoodsUsage,
} from '../shared/siteEntryMinutes.ts';
import type {
  GeneralEntry,
  SiteEntryLineItem,
  SiteEntryMinutesRecord,
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
import { OpiGeneralPicker } from './OpiGeneralPicker.tsx';
import { PrintReportModal, type PrintColumnDef } from './PrintReportModal.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { SignedScanModal, SignedScanRowButton } from './SignedFormScanManager.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface SiteEntryApiResponse {
  minutes: SiteEntryMinutesRecord[];
  generalEntries: GeneralEntry[];
  packings: string[];
}

interface SiteEntryMinutesViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

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
  dots = '. . . . . . . . . . . . . . .',
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
        minWidth: '64px',
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

export const OfficialSiteEntrySheet: React.FC<OfficialSheetProps> = ({
  record,
  generalEntries,
  formatDate,
}) => {
  const { activeEmployer, activeProject } = useApp();
  const design = resolveBuiltInFormDesign(activeEmployer, 'siteEntry');
  const isMd1Default = activeEmployer.id === 'mapna-md1' && !design.template;
  const formCode = isMd1Default ? MD1_SITE_ENTRY_FORM_CODE : design.docCode || MD1_SITE_ENTRY_FORM_CODE;

  const effectiveDesign = useMemo(
    () =>
      isMd1Default
        ? {
            ...design,
            companyTitle: MD1_SITE_ENTRY_COMPANY_NAME,
            titleFa: MD1_SITE_ENTRY_TITLE_FA,
            docCode: MD1_SITE_ENTRY_FORM_CODE,
            footerCopyText: MD1_SITE_ENTRY_COPY_TEXT,
          }
        : design,
    [design, isMd1Default],
  );

  const resolvedItems = useMemo(() => {
    if (record.items && record.items.length > 0) return record.items;
    const matched = generalEntries.filter((g) =>
      (record.packingListNos || []).includes((g.packingListNo || '').trim()),
    );
    return buildSiteEntryLineItems(matched);
  }, [record, generalEntries]);

  const minRows = 10;
  const totalDisplayRows = Math.max(minRows, resolvedItems.length);
  const paddedRows: (SiteEntryLineItem | null)[] = [
    ...resolvedItems,
    ...Array.from({ length: Math.max(0, totalDisplayRows - resolvedItems.length) }, () => null),
  ];

  const entryType = record.entryType || 'permanent';
  const goodsUsage = record.goodsUsage || 'project';
  const equipmentSupplyName = record.equipmentSupply || record.mapnaRep || '';
  const projectHeaderTitle = formatHeaderProjectTitle(record.projectName || activeProject?.name);
  const displayContractNo =
    (record.contractNo || '').trim() || activeProject?.contractRef || activeProject?.code || '';
  const displayDate = record.arrivalDate || record.date;

  return (
    <div
      dir="rtl"
      data-testid="official-site-entry-sheet"
      className={`site-entry-official-sheet ${
        effectiveDesign.orientation === 'landscape' ? 'samaan-a4-landscape' : 'samaan-a4-portrait'
      }`}
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ border: `1.8px solid ${effectiveDesign.accentColor || '#000000'}` }}>
        <BuiltInSheetHeaderRow
          employer={activeEmployer}
          design={effectiveDesign}
          projectTitle={projectHeaderTitle}
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
        <OfficialExtraMetaStrip
          design={effectiveDesign}
          inset
          borderColor={effectiveDesign.accentColor}
        />

        {/* Release Note No & Arrival Notice No Strip */}
        <div
          dir="ltr"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: '1.5px solid #000000',
            padding: '4px 10px',
            fontSize: '10.2px',
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
          {/* Row 1: Requester/Contractor | Contract No | Arrival Date */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.65fr 1fr 0.85fr',
              gap: '8px',
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>نام پیمانکار/درخواست کننده: </span>
              <span className="bidi-plaintext">{record.supplier || ''}</span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>شماره قرارداد: </span>
              <span dir="ltr" className="tabular-nums">
                {displayContractNo}
              </span>
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>تاریخ: </span>
              <span dir="ltr" className="tabular-nums">
                {displayDate ? formatDate(displayDate) : ''}
              </span>
            </div>
          </div>

          {/* Row 2: Goods Usage | Unit / System / Island */}
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
              <span style={{ fontWeight: 700 }}>کاربرد کالا:</span>
              <span data-testid="site-entry-usage-project" data-checked={goodsUsage === 'project' ? 'true' : 'false'}>
                <FormCheckSquare checked={goodsUsage === 'project'} label="کالای پروژه" />
              </span>
              <span data-testid="site-entry-usage-site_equip" data-checked={goodsUsage === 'site_equip' ? 'true' : 'false'}>
                <FormCheckSquare checked={goodsUsage === 'site_equip'} label="کالای تجهیز کارگاه" />
              </span>
              <span data-testid="site-entry-usage-general" data-checked={goodsUsage === 'general' ? 'true' : 'false'}>
                <FormCheckSquare checked={goodsUsage === 'general'} label="مصرف عمومی" />
              </span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '18px' }}>
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

          {/* Row 3: Origin | Arrival Date | Carrier | Unloading Location */}
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
                {displayDate ? formatDate(displayDate) : ''}
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

          {/* Row 4 & 5: Vehicle model appears in BOTH vehicle specification slots (Rule 1-9) */}
          <div style={{ marginTop: '2px' }}>
            <span style={{ fontWeight: 700 }}>مشخصات وسیله نقلیه حامل کالا / تجهیز: </span>
            <span className="bidi-plaintext" style={{ fontWeight: 700 }}>
              {record.vehicleType || ''}
            </span>
          </div>
          <div>
            <span>وسیله نقلیه </span>
            <DotValue value={record.vehicleType} dots=". . . . . . . . . . . . . . ." />
            <span> به شماره پلاک </span>
            <DotValue value={record.vehicleNo} dots=". . . . . . . . . . . . ." />
            <span> با شماره بارنامه </span>
            <DotValue value={record.waybillNo} dots=". . . . . . . . . . . . ." />
            <span> همراه با راننده آن آقای </span>
            <DotValue value={record.driverName} dots=". . . . . . . . . . . . . . ." />
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
            {paddedRows.map((row, idx) => {
              const rowBottom = idx === paddedRows.length - 1 ? 'none' : '1px solid #000000';
              return (
                <tr key={idx}>
                  <td
                    className="tabular-nums samaan-col-compact"
                    style={{
                      borderBottom: rowBottom,
                      borderLeft: '1px solid #000000',
                      padding: '4px 4px',
                      fontSize: '9px',
                    }}
                  >
                    {row ? idx + 1 : '\u00A0'}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
                      borderLeft: '1px solid #000000',
                      padding: '4px 4px',
                    }}
                  >
                    {row?.qty || ''}
                  </td>
                  <td
                    className="samaan-col-compact"
                    style={{
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
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
                      borderBottom: rowBottom,
                      borderLeft: '1px solid #000000',
                      padding: '4px 4px',
                    }}
                  >
                    {row?.grossWeight || ''}
                  </td>
                  <td
                    className="bidi-plaintext samaan-col-fluid"
                    style={{
                      borderBottom: rowBottom,
                      padding: '4px 5px',
                    }}
                  >
                    {row?.remarks || ''}
                  </td>
                </tr>
              );
            })}
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
            <div style={{ fontWeight: 700 }}>انباردار / پیمانکار:</div>
            <div style={{ marginTop: '3px' }}>{record.warehouseKeeper || ''}</div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>مدیر پروژه / سرپرست کارگاه پیمانکار:</div>
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
        {effectiveDesign.template?.signatures?.length || !effectiveDesign.showSignatures ? (
          <OfficialFormSignatures
            signatures={effectiveDesign.signatures}
            showSignatures={effectiveDesign.showSignatures}
            borderColor={effectiveDesign.accentColor}
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
                <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء:</div>
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
                <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء:</div>
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
                <div style={{ fontWeight: 700 }}>تأمین تجهیزات</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>نام، تاریخ و امضاء:</div>
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
                نماینده کارفرما / نماینده دستگاه نظارت:
              </div>
              <div style={{ fontSize: '8.5px', marginTop: '6px' }}>{record.employerRep || ''}</div>
            </div>
          </div>
        )}

        {/* QA Explanatory Notes Box */}
        <div
          dir="rtl"
          style={{
            padding: '5px 10px 6px',
            fontSize: '8.2px',
            lineHeight: 1.7,
            textAlign: 'right',
          }}
        >
          {effectiveDesign.template?.introText ? (
            <div style={{ fontWeight: 600 }}>{effectiveDesign.template.introText}</div>
          ) : (
            <>
              <div>
                توضیح ۱: واحد تأمین تجهیزات و انبار در صورت لزوم می‌بایست تأییدیه واحدهای دفتر فنی، کنترل کیفیت و HSE را اخذ نماید.
              </div>
              <div>
                توضیح ۲: در خصوص کالا و تجهیزاتی که مربوط به تجهیز کارگاه بوده و یا از نظر ایمنی مطابق نظر سرپرست HSE پروژه حائز اهمیت است کنترل و تأیید واحد HSE الزامی می‌باشد.
              </div>
              <div>
                توضیح ۳: تأیید کنترل کیفی به منزله تأیید ورود کالا به کارگاه می‌باشد و به معنای تأیید نهایی نیست؛ مسئولیت اصلی کیفیت کالا از نظر ظاهری و انطباق با مشخصات در طول دوران ساخت، نصب، راه‌اندازی و بهره‌برداری بر عهده مسئول اجرایی کار می‌باشد.
              </div>
              <div>
                توضیح ۴: فرم مذکور می‌بایست توسط {activeEmployer.securityLabel} امضاء و سپس ممهور گردد.
              </div>
            </>
          )}
          <div dir="rtl" style={{ fontWeight: 700, textAlign: 'right', marginTop: '2px' }}>
            {MD1_SITE_ENTRY_QA_NOTICE}
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
          padding: '4px 8px',
          border: '1px solid #000000',
          fontSize: '8.5px',
          fontWeight: 700,
        }}
      >
        <div>
          {effectiveDesign.template?.footerCopyText || MD1_SITE_ENTRY_COPY_TEXT}
        </div>
        {(formCode || effectiveDesign.revisionText) && (
          <div dir="ltr" className="tabular-nums">
            {[formCode, effectiveDesign.revisionText].filter(Boolean).join(' · ')}
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
  const formCode = getEmployerFormCode(activeEmployer, '15-01');

  const [viewMode, setViewMode] = useState<OperationalViewMode>(canEdit ? 'create' : 'history');
  const [step, setStep] = useState<1 | 2>(1);
  const [data, setData] = useState<SiteEntryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 1: General row selection + status filter
  const [entryFilterMode, setEntryFilterMode] = useState<'all' | 'without_minutes' | 'with_minutes'>('all');
  const [selectedMap, setSelectedMap] = useState<Record<string, GeneralEntry>>({});

  // Step 2: Goods usage, remarks, optional header overrides
  const [goodsUsage, setGoodsUsage] = useState<SiteEntryGoodsUsage>('project');
  const [entryType, setEntryType] = useState<'permanent' | 'temporary'>('permanent');
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [minutesNo, setMinutesNo] = useState('');
  const [minutesNoTouched, setMinutesNoTouched] = useState(false);
  const [showHeaderOverrides, setShowHeaderOverrides] = useState(false);

  // Optional header override states (blank = use auto-filled value)
  const [arrivalDateOverride, setArrivalDateOverride] = useState('');
  const [requesterOverride, setRequesterOverride] = useState('');
  const [contractNoOverride, setContractNoOverride] = useState('');
  const [systemOverride, setSystemOverride] = useState('');
  const [islandOverride, setIslandOverride] = useState('');
  const [unitOverride, setUnitOverride] = useState('');
  const [vehicleModelOverride, setVehicleModelOverride] = useState('');
  const [vehicleNoOverride, setVehicleNoOverride] = useState('');
  const [waybillNoOverride, setWaybillNoOverride] = useState('');
  const [driverNameOverride, setDriverNameOverride] = useState('');
  const [releaseNoteOverride, setReleaseNoteOverride] = useState('');
  const [originOverride, setOriginOverride] = useState('');
  const [carrierCompany, setCarrierCompany] = useState('');
  const [trafficLocation, setTrafficLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit / History / Print / Scan states
  const [editingRecord, setEditingRecord] = useState<SiteEntryMinutesRecord | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SiteEntryMinutesRecord | null>(null);
  const [printSheet, setPrintSheet] = useState<SiteEntryMinutesRecord | null>(null);
  const [scanTarget, setScanTarget] = useState<SiteEntryMinutesRecord | null>(null);
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
    void loadData();
  }, [loadData, refreshSignal]);

  const minutesList = useMemo(() => data?.minutes || [], [data]);
  const generalEntries = useMemo(() => data?.generalEntries || [], [data]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return minutesList;
    return minutesList.filter((m) =>
      [
        m.minutesNo,
        m.supplier,
        m.vehicleType,
        m.vehicleNo,
        m.driverName,
        m.waybillNo,
        ...(m.packingListNos || []),
        m.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [minutesList, historySearch]);

  const minutesPagination = useClientPagination(filteredHistory, 25);

  const pickerRows = useMemo(() => {
    if (entryFilterMode === 'without_minutes') {
      return generalEntries.filter((g) => !hasSiteEntryMinutes(g) || Boolean(selectedMap[g.id]));
    }
    if (entryFilterMode === 'with_minutes') {
      return generalEntries.filter((g) => hasSiteEntryMinutes(g) || Boolean(selectedMap[g.id]));
    }
    return generalEntries;
  }, [generalEntries, entryFilterMode, selectedMap]);

  const missingCount = useMemo(
    () => generalEntries.filter((g) => !hasSiteEntryMinutes(g)).length,
    [generalEntries],
  );

  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const autoHeader = useMemo(
    () => buildSiteEntryHeaderAutoFill(selectedList, activeProject),
    [selectedList, activeProject],
  );

  const suggestedMinutesNo = useMemo(
    () =>
      generateSiteEntryMinutesNo(
        minutesList.map((m) => m.minutesNo),
        activeProject,
      ),
    [minutesList, activeProject],
  );

  // Auto-populate suggested minutesNo on new creation unless user typed custom one
  useEffect(() => {
    if (!editingRecord && !minutesNoTouched && suggestedMinutesNo) {
      setMinutesNo(suggestedMinutesNo);
    }
  }, [editingRecord, minutesNoTouched, suggestedMinutesNo]);

  // Keep print preview synced with live DB (so post-print Undo/Redo immediately reflects!)
  const printRecordWasUndone = useMemo(() => {
    if (!printSheet || !data) return false;
    return !data.minutes.some((m) => m.id === printSheet.id);
  }, [printSheet, data]);

  useEffect(() => {
    if (!printSheet || !data) return;
    const fresh = data.minutes.find((m) => m.id === printSheet.id);
    if (fresh && fresh !== printSheet) {
      setPrintSheet(fresh);
    }
  }, [data, printSheet]);

  const handleToggleRow = useCallback((row: GeneralEntry) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  }, []);

  const handleToggleBatch = useCallback((rows: GeneralEntry[], allSelected: boolean) => {
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

  const resetWizard = () => {
    setEditingRecord(null);
    setStep(1);
    setSelectedMap({});
    setRemarksMap({});
    setGoodsUsage('project');
    setEntryType('permanent');
    setMinutesNo(suggestedMinutesNo);
    setMinutesNoTouched(false);
    setShowHeaderOverrides(false);
    setArrivalDateOverride('');
    setRequesterOverride('');
    setContractNoOverride('');
    setSystemOverride('');
    setIslandOverride('');
    setUnitOverride('');
    setVehicleModelOverride('');
    setVehicleNoOverride('');
    setWaybillNoOverride('');
    setDriverNameOverride('');
    setReleaseNoteOverride('');
    setOriginOverride('');
    setCarrierCompany('');
    setTrafficLocation('');
    setNotes('');
  };

  const startEdit = (rec: SiteEntryMinutesRecord) => {
    setViewMode('create');
    setEditingRecord(rec);
    setStep(2);
    setGoodsUsage(rec.goodsUsage || 'project');
    setEntryType(rec.entryType || 'permanent');
    setMinutesNo(rec.minutesNo || '');
    setMinutesNoTouched(true);
    setArrivalDateOverride(rec.arrivalDate || rec.date || '');
    setRequesterOverride(rec.supplier || '');
    setContractNoOverride(rec.contractNo || '');
    setSystemOverride(rec.system || '');
    setIslandOverride(rec.island || '');
    setUnitOverride(rec.unit || '');
    setVehicleModelOverride(rec.vehicleType || '');
    setVehicleNoOverride(rec.vehicleNo || '');
    setWaybillNoOverride(rec.waybillNo || '');
    setDriverNameOverride(rec.driverName || '');
    setReleaseNoteOverride(rec.releaseNoteNo || '');
    setOriginOverride(rec.origin || '');
    setCarrierCompany(rec.carrierCompany || '');
    setTrafficLocation(rec.trafficLocation || '');
    setNotes(rec.notes || '');

    // Reconstruct selectedMap & remarksMap from generalIds / items
    const nextSel: Record<string, GeneralEntry> = {};
    const nextRemarks: Record<string, string> = {};
    const genById = new Map(generalEntries.map((g) => [g.id, g]));
    for (const it of rec.items || []) {
      let matched = it.generalId ? genById.get(it.generalId) : undefined;
      if (!matched) {
        matched = generalEntries.find(
          (g) =>
            (g.packingListNo || '').trim() === (it.packingListNo || '').trim() &&
            (!it.packageNo || (g.packageNo || '').trim() === (it.packageNo || '').trim()),
        );
      }
      if (matched) {
        nextSel[matched.id] = matched;
        if (it.remarks) nextRemarks[matched.id] = it.remarks;
      }
    }
    if (Object.keys(nextSel).length === 0 && rec.generalIds) {
      for (const gid of rec.generalIds) {
        const g = genById.get(gid);
        if (g) nextSel[g.id] = g;
      }
    }
    setSelectedMap(nextSel);
    setRemarksMap(nextRemarks);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const effectiveArrivalDate = arrivalDateOverride.trim() || autoHeader.arrivalDate || getTodayIso();
  const effectiveRequester = requesterOverride.trim() || autoHeader.requester;
  const effectiveContractNo = contractNoOverride.trim() || autoHeader.contractNo;
  const effectiveSystem = systemOverride.trim() || autoHeader.system;
  const effectiveIsland = islandOverride.trim() || autoHeader.island;
  const effectiveUnit = unitOverride.trim() || autoHeader.unit;
  const effectiveVehicleModel = vehicleModelOverride.trim() || autoHeader.vehicleModel;
  const effectiveVehicleNo = vehicleNoOverride.trim() || autoHeader.vehicleNo;
  const effectiveWaybillNo = waybillNoOverride.trim() || autoHeader.waybillNo;
  const effectiveDriverName = driverNameOverride.trim() || autoHeader.driverName;
  const effectiveReleaseNote = releaseNoteOverride.trim() || autoHeader.releaseNoteNo;
  const effectiveOrigin = originOverride.trim() || autoHeader.origin;

  const builtLineItems = useMemo(
    () => buildSiteEntryLineItems(selectedList, remarksMap),
    [selectedList, remarksMap],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMinutesNo = minutesNo.trim() || suggestedMinutesNo;
    if (!cleanMinutesNo) {
      notify('error', isFa ? 'شماره صورتجلسه ورود الزامی است.' : 'Site Entry Minutes No. is required.');
      return;
    }
    if (selectedList.length === 0) {
      notify('error', isFa ? 'حداقل یک ردیف از جدول کلی تجهیزات انتخاب کنید.' : 'Select at least one General Equipment row.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        minutesNo: cleanMinutesNo,
        releaseNoteNo: effectiveReleaseNote,
        entryType,
        goodsUsage,
        date: effectiveArrivalDate,
        arrivalDate: effectiveArrivalDate,
        projectName: activeProject?.name || '',
        contractNo: effectiveContractNo,
        packingListNos: autoHeader.packingListNos,
        generalIds: autoHeader.generalIds,
        supplier: effectiveRequester,
        unit: effectiveUnit,
        system: effectiveSystem,
        island: effectiveIsland,
        origin: effectiveOrigin,
        carrierCompany: carrierCompany.trim(),
        trafficLocation: trafficLocation.trim(),
        vehicleType: effectiveVehicleModel,
        driverName: effectiveDriverName,
        vehicleNo: effectiveVehicleNo,
        waybillNo: effectiveWaybillNo,
        weighbridgeWeight: autoHeader.weighbridgeWeight,
        conditionStatus: 'healthy' as const,
        items: builtLineItems,
        notes: notes.trim(),
      };

      const res = editingRecord
        ? await apiRequest<{ record: SiteEntryMinutesRecord }>(`/api/site-entry/${editingRecord.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ record: SiteEntryMinutesRecord }>('/api/site-entry', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingRecord
          ? isFa
            ? `صورتجلسه ورود شماره ${res.record.minutesNo} ویرایش و در جدول کلی تجهیزات به‌روزرسانی شد.`
            : `Site Entry Minutes ${res.record.minutesNo} updated.`
          : isFa
            ? `صورتجلسه ورود شماره ${res.record.minutesNo} صادر و در ستون «شماره صورتجلسه ورود انبار» ثبت شد.`
            : `Site Entry Minutes ${res.record.minutesNo} issued and synced to General Equipment.`,
      );
      resetWizard();
      setPrintSheet(res.record);
      triggerAutoSnapshot(`${editingRecord ? 'Edit ' : ''}Site Entry ${res.record.minutesNo}`);
      onDataChanged();
      await Promise.all([loadData(), refreshHistoryStatus()]);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/site-entry/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `صورتجلسه ورود شماره ${deleteTarget.minutesNo} حذف و شماره آن از جدول کلی تجهیزات پاک شد.`
          : `Site Entry Minutes ${deleteTarget.minutesNo} deleted.`,
      );
      if (editingRecord?.id === deleteTarget.id) resetWizard();
      if (printSheet?.id === deleteTarget.id) setPrintSheet(null);
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete Site Entry ${deleteTarget.minutesNo}`);
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

  const historyColumns = useMemo<PrintColumnDef<SiteEntryMinutesRecord>[]>(
    () => [
      { key: 'minutesNo', header: isFa ? 'شماره صورتجلسه' : 'Minutes No.', getValue: (r) => r.minutesNo },
      { key: 'arrivalDate', header: isFa ? 'تاریخ ورود' : 'Arrival Date', isDate: true, getValue: (r) => r.arrivalDate || r.date },
      { key: 'supplier', header: isFa ? 'پیمانکار / درخواست‌کننده' : 'Requester', getValue: (r) => r.supplier || '' },
      {
        key: 'goodsUsage',
        header: isFa ? 'کاربرد کالا' : 'Goods Usage',
        getValue: (r) =>
          SITE_ENTRY_GOODS_USAGE_OPTIONS.find((o) => o.value === r.goodsUsage)?.[isFa ? 'labelFa' : 'labelEn'] || '',
      },
      { key: 'vehicleType', header: isFa ? 'مدل وسیله نقلیه' : 'Vehicle Model', getValue: (r) => r.vehicleType || '' },
      { key: 'vehicleNo', header: isFa ? 'شماره پلاک' : 'Plate No.', getValue: (r) => r.vehicleNo || '' },
      { key: 'waybillNo', header: isFa ? 'شماره بارنامه' : 'Waybill No.', getValue: (r) => r.waybillNo || '' },
      { key: 'driverName', header: isFa ? 'نام راننده' : 'Driver', getValue: (r) => r.driverName || '' },
      { key: 'packings', header: isFa ? 'پکینگ لیست‌ها' : 'Packing Lists', getValue: (r) => (r.packingListNos || []).join('، ') },
      { key: 'itemCount', header: isFa ? 'تعداد ردیف' : 'Rows', getValue: (r) => (r.items || []).length },
    ],
    [isFa],
  );

  return (
    <div className="space-y-5 samaan-animate-in">
      {/* Isolated A4 Portrait Print Portal */}
      {printSheet && !printReportOpen
        ? createPortal(
            <div id="samaan-site-entry-print-root" data-samaan-print-portal="true">
              <style>
                {buildIsolatedPrintPortalCss('samaan-site-entry-print-root', {
                  orientation: 'portrait',
                  isFa,
                  marginMm: 8,
                  extraPrintCss: `
                    #samaan-site-entry-print-root table th,
                    #samaan-site-entry-print-root table td {
                      text-align: center;
                      vertical-align: middle;
                    }
                  `,
                })}
              </style>
              <OfficialSiteEntrySheet
                record={printSheet}
                generalEntries={generalEntries}
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
            <ClipboardSignature className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                {isFa ? MD1_SITE_ENTRY_TITLE_FA : 'Site Material Entry Minutes'}
              </h2>
              <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
                {formCode}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {isFa
                ? 'فیلتر و انتخاب ردیف‌های بخش کلی تجهیزات، تعیین کاربرد کالا و صدور صورتجلسه رسمی ورود به کارگاه با همگام‌سازی خودکار'
                : 'Filter and select General Equipment rows, set goods usage & remarks, and issue official Site Entry Minutes'}
            </p>
          </div>
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

      {/* CREATE / EDIT 2-STEP WIZARD */}
      {canEdit && viewMode === 'create' && (
        <div className="space-y-4">
          {/* Stepper Indicator */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setStep(1)}
                data-testid="site-entry-step-1-tab"
                className={`h-8 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                  step === 1
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="tabular-nums">{isFa ? '۱' : '1'}</span>
                <span>{isFa ? 'فیلتر و انتخاب ردیف‌های کلی تجهیزات' : 'Filter & Select General Rows'}</span>
              </button>
              <span className="text-[var(--text-muted)]">{isFa ? '←' : '→'}</span>
              <button
                type="button"
                disabled={selectedList.length === 0}
                onClick={() => selectedList.length > 0 && setStep(2)}
                data-testid="site-entry-step-2-tab"
                className={`h-8 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                  step === 2
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-canvas)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                <span className="tabular-nums">{isFa ? '۲' : '2'}</span>
                <span>{isFa ? 'کاربرد کالا، توضیحات ردیف‌ها و صدور صورتجلسه' : 'Goods Usage, Remarks & Issue'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {editingRecord && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold tabular-nums">
                  {isFa ? `در حال ویرایش: ${editingRecord.minutesNo}` : `Editing: ${editingRecord.minutesNo}`}
                </span>
              )}
              {(selectedList.length > 0 || editingRecord) && (
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

          {/* STEP 1: Filter & Select General Equipment Rows */}
          {step === 1 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setEntryFilterMode('all')}
                    className={`h-8 px-3 rounded-lg border font-medium transition-colors ${
                      entryFilterMode === 'all'
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {isFa
                      ? `همه ردیف‌ها (${generalEntries.length.toLocaleString('fa-IR')})`
                      : `All Rows (${generalEntries.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryFilterMode('without_minutes')}
                    data-testid="site-entry-filter-missing"
                    className={`h-8 px-3 rounded-lg border font-medium transition-colors ${
                      entryFilterMode === 'without_minutes'
                        ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {isFa
                      ? `فاقد صورتجلسه ورود (${missingCount.toLocaleString('fa-IR')})`
                      : `Missing Entry Minutes (${missingCount})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryFilterMode('with_minutes')}
                    className={`h-8 px-3 rounded-lg border font-medium transition-colors ${
                      entryFilterMode === 'with_minutes'
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {isFa
                      ? `دارای صورتجلسه (${(generalEntries.length - missingCount).toLocaleString('fa-IR')})`
                      : `Issued (${generalEntries.length - missingCount})`}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={selectedList.length === 0}
                  onClick={() => setStep(2)}
                  data-testid="site-entry-next-step-btn"
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <span>
                    {isFa
                      ? `ادامه با ${selectedList.length.toLocaleString('fa-IR')} ردیف انتخابی`
                      : `Continue (${selectedList.length} selected)`}
                  </span>
                  {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

              <OpiGeneralPicker
                rows={pickerRows}
                loading={loading}
                selectedMap={selectedMap}
                onToggleRow={handleToggleRow}
                onToggleBatch={handleToggleBatch}
                refreshSignal={refreshSignal}
                testIdPrefix="site-entry-picker"
                showSiteEntryStatus
                emptyMessage={
                  isFa
                    ? 'هیچ ردیفی در جدول ثبت کلی تجهیزات با این وضعیت یافت نشد.'
                    : 'No General Equipment rows match this filter.'
                }
              />
            </div>
          )}

          {/* STEP 2: Goods Usage, Per-Row Remarks, Auto-Filled Metadata & Issue */}
          {step === 2 && (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-5"
            >
              {/* Goods Usage Selector (Required) + Entry Type + Minutes No */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-2">
                  <label className="block text-xs font-bold text-[var(--text-primary)]">
                    {isFa ? 'کاربرد کالا *' : 'Goods Usage *'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {SITE_ENTRY_GOODS_USAGE_OPTIONS.map((opt) => {
                      const active = goodsUsage === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-testid={`site-entry-usage-btn-${opt.value}`}
                          onClick={() => setGoodsUsage(opt.value)}
                          className={`p-3 rounded-xl border text-start transition-all flex items-center justify-between gap-2 ${
                            active
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                          }`}
                        >
                          <span className="text-xs font-bold">
                            {isFa ? opt.labelFa : opt.labelEn}
                          </span>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              active
                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
                                : 'border-[var(--border-strong)]'
                            }`}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-[var(--text-primary)]">
                      {isFa ? 'شماره صورتجلسه ورود *' : 'Site Entry Minutes No. *'}
                    </label>
                    {!editingRecord && (
                      <button
                        type="button"
                        onClick={() => {
                          setMinutesNo(suggestedMinutesNo);
                          setMinutesNoTouched(false);
                        }}
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
                    dir="ltr"
                    data-testid="site-entry-minutes-no-input"
                    value={minutesNo}
                    onChange={(e) => {
                      setMinutesNo(e.target.value);
                      setMinutesNoTouched(true);
                    }}
                    placeholder={suggestedMinutesNo}
                    className="w-full h-10 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm font-mono tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <div className="flex items-center gap-3 text-xs pt-0.5">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="entryType"
                        checked={entryType === 'permanent'}
                        onChange={() => setEntryType('permanent')}
                      />
                      <span>{isFa ? 'ورود دائم' : 'Permanent'}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="entryType"
                        checked={entryType === 'temporary'}
                        onChange={() => setEntryType('temporary')}
                      />
                      <span>{isFa ? 'ورود موقت' : 'Temporary'}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Auto-Filled Summary Card + Collapsible Overrides */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? 'مشخصات سربرگ و حمل‌ونقل (فراخوانی خودکار از بخش کلی تجهیزات و پروژه)'
                      : 'Header & Transport Details (Auto-filled from General Equipment & Project)'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHeaderOverrides((v) => !v)}
                    className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                  >
                    {showHeaderOverrides ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{isFa ? 'ویرایش فیلدهای سربرگ (اختیاری)' : 'Edit Header Fields (Optional)'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'پروژه' : 'Project'}</div>
                    <div className="font-semibold mt-0.5 truncate">{autoHeader.headerProjectTitle || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'تاریخ ورود' : 'Arrival Date'}</div>
                    <div className="font-semibold mt-0.5 tabular-nums" dir="ltr">
                      {effectiveArrivalDate ? formatDate(effectiveArrivalDate) : '—'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Requester'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveRequester || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'شماره قرارداد' : 'Contract No.'}</div>
                    <div className="font-semibold mt-0.5 tabular-nums" dir="ltr">{effectiveContractNo || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'جزیره / سیستم / واحد' : 'Island / System / Unit'}</div>
                    <div className="font-semibold mt-0.5 truncate">
                      {[effectiveIsland, effectiveSystem, effectiveUnit].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'مدل وسیله نقلیه' : 'Vehicle Model'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveVehicleModel || '—'}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'پلاک / بارنامه' : 'Plate / Waybill'}</div>
                    <div className="font-semibold mt-0.5 truncate tabular-nums">
                      {[effectiveVehicleNo, effectiveWaybillNo].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="text-[var(--text-muted)]">{isFa ? 'نام راننده' : 'Driver'}</div>
                    <div className="font-semibold mt-0.5 truncate">{effectiveDriverName || '—'}</div>
                  </div>
                </div>

                {showHeaderOverrides && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs">
                    <JalaliDateInput
                      label={isFa ? 'تاریخ ورود' : 'Arrival Date'}
                      value={effectiveArrivalDate}
                      onChange={setArrivalDateOverride}
                    />
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نام پیمانکار / درخواست‌کننده' : 'Requester / Contractor'}
                      </label>
                      <input
                        type="text"
                        value={requesterOverride}
                        onChange={(e) => setRequesterOverride(e.target.value)}
                        placeholder={autoHeader.requester || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شماره قرارداد' : 'Contract No.'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={contractNoOverride}
                        onChange={(e) => setContractNoOverride(e.target.value)}
                        placeholder={autoHeader.contractNo || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'مدل وسیله نقلیه' : 'Vehicle Model'}
                      </label>
                      <input
                        type="text"
                        value={vehicleModelOverride}
                        onChange={(e) => setVehicleModelOverride(e.target.value)}
                        placeholder={autoHeader.vehicleModel || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شماره پلاک' : 'Vehicle Plate'}
                      </label>
                      <input
                        type="text"
                        value={vehicleNoOverride}
                        onChange={(e) => setVehicleNoOverride(e.target.value)}
                        placeholder={autoHeader.vehicleNo || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شماره بارنامه' : 'Waybill No.'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={waybillNoOverride}
                        onChange={(e) => setWaybillNoOverride(e.target.value)}
                        placeholder={autoHeader.waybillNo || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'نام راننده' : 'Driver Name'}
                      </label>
                      <input
                        type="text"
                        value={driverNameOverride}
                        onChange={(e) => setDriverNameOverride(e.target.value)}
                        placeholder={autoHeader.driverName || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        Release Note No.
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
                        {isFa ? 'مبدا' : 'Origin'}
                      </label>
                      <input
                        type="text"
                        value={originOverride}
                        onChange={(e) => setOriginOverride(e.target.value)}
                        placeholder={autoHeader.origin || ''}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'شرکت حمل کننده' : 'Carrier Company'}
                      </label>
                      <input
                        type="text"
                        value={carrierCompany}
                        onChange={(e) => setCarrierCompany(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'محل تردد / تخلیه و بارگیری' : 'Unloading Location'}
                      </label>
                      <input
                        type="text"
                        value={trafficLocation}
                        onChange={(e) => setTrafficLocation(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                        {isFa ? 'توضیحات کلی فرم' : 'General Form Notes'}
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

              {/* Selected Rows Table with Per-Row Remarks Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {isFa
                      ? `اقلام انتخاب‌شده (${builtLineItems.length.toLocaleString('fa-IR')} ردیف) — توضیحات اختیاری هر ردیف`
                      : `Selected Rows (${builtLineItems.length}) — Optional Per-Row Remarks`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                  >
                    {isFa ? 'تغییر انتخاب ردیف‌ها' : 'Modify Selection'}
                  </button>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2 px-2.5 text-center w-10">#</th>
                        <th className="py-2 px-2.5 text-start">{isFa ? 'شرح' : 'Description'}</th>
                        <th className="py-2 px-2.5 text-start">{isFa ? 'شماره لیست بسته' : 'Packing List'}</th>
                        <th className="py-2 px-2.5 text-start">{isFa ? 'شماره بسته' : 'Package No.'}</th>
                        <th className="py-2 px-2.5 text-center">{isFa ? 'ابعاد' : 'Dimensions'}</th>
                        <th className="py-2 px-2.5 text-center">{isFa ? 'تعداد' : 'Qty'}</th>
                        <th className="py-2 px-2.5 text-center">{isFa ? 'واحد' : 'Unit'}</th>
                        <th className="py-2 px-2.5 text-center">{isFa ? 'خالص / ناخالص' : 'Net / Gross'}</th>
                        <th className="py-2 px-2.5 text-start min-w-[210px]">{isFa ? 'توضیحات (اختیاری)' : 'Remarks (Optional)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {builtLineItems.map((it, idx) => (
                        <tr key={it.generalId || idx}>
                          <td className="py-2 px-2.5 text-center tabular-nums">{idx + 1}</td>
                          <td className="py-2 px-2.5 font-medium max-w-[220px] truncate" title={it.description}>
                            {it.description || '—'}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums" dir="ltr">
                            {it.packingListNo || '—'}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums" dir="ltr">
                            {it.packageNo || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-center tabular-nums" dir="ltr">
                            {it.dimensions || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-center font-bold tabular-nums">{it.qty || '1'}</td>
                          <td className="py-2 px-2.5 text-center">{it.unit || '—'}</td>
                          <td className="py-2 px-2.5 text-center tabular-nums" dir="ltr">
                            {[it.netWeight || '—', it.grossWeight || '—'].join(' / ')}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              data-testid={`site-entry-remark-${idx}`}
                              value={it.generalId ? remarksMap[it.generalId] || '' : it.remarks}
                              onChange={(e) => {
                                const gid = it.generalId;
                                if (!gid) return;
                                setRemarksMap((prev) => ({ ...prev, [gid]: e.target.value }));
                              }}
                              placeholder={isFa ? 'توضیحات این ردیف...' : 'Row remark...'}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                          </td>
                        </tr>
                      ))}
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
                  <span>{isFa ? 'بازگشت به انتخاب ردیف‌ها' : 'Back to Selection'}</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  data-testid="site-entry-submit-btn"
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {editingRecord
                      ? isFa
                        ? 'ذخیره تغییرات و مشاهده فرم چاپ'
                        : 'Save Changes & Print Preview'
                      : isFa
                        ? 'صدور صورتجلسه ورود و چاپ متریال'
                        : 'Issue Site Entry Minutes & Preview'}
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
                placeholder={isFa ? 'جستجو در صورتجلسات صادرشده...' : 'Search issued Site Entry Minutes...'}
              />
            </div>
            <button
              type="button"
              onClick={() => setPrintReportOpen(true)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isFa ? 'چاپ فهرست صورتجلسات' : 'Print Minutes List'}</span>
            </button>
          </div>

          <StickyTableWrapper>
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                <tr>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'شماره صورتجلسه' : 'Minutes No.'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'تاریخ ورود' : 'Arrival Date'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'پیمانکار / درخواست‌کننده' : 'Requester'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'کاربرد کالا' : 'Usage'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'وسیله نقلیه / پلاک' : 'Vehicle'}</th>
                  <th className="py-2.5 px-3 text-start">{isFa ? 'پکینگ لیست‌ها' : 'Packings'}</th>
                  <th className="py-2.5 px-3 text-center">{isFa ? 'ردیف‌ها' : 'Rows'}</th>
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
                ) : minutesPagination.pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                      {isFa ? 'هنوز صورتجلسه ورودی صادر نشده است.' : 'No Site Entry Minutes issued yet.'}
                    </td>
                  </tr>
                ) : (
                  minutesPagination.pageItems.map((rec) => {
                    const usageOpt = SITE_ENTRY_GOODS_USAGE_OPTIONS.find((o) => o.value === rec.goodsUsage);
                    return (
                      <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="py-2.5 px-3 font-mono font-bold tabular-nums" dir="ltr">
                          {rec.minutesNo}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                          {formatDate(rec.arrivalDate || rec.date)}
                        </td>
                        <td className="py-2.5 px-3 bidi-plaintext max-w-[180px] truncate">
                          {rec.supplier || '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {usageOpt ? (isFa ? usageOpt.labelFa : usageOpt.labelEn) : '—'}
                        </td>
                        <td className="py-2.5 px-3 bidi-plaintext max-w-[190px] truncate">
                          {[rec.vehicleType, rec.vehicleNo].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums max-w-[160px] truncate" dir="ltr">
                          {(rec.packingListNos || []).join(', ') || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center tabular-nums font-semibold">
                          {(rec.items || []).length}
                        </td>
                        <td className="py-2.5 px-3 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPrintSheet(rec)}
                              title={isFa ? 'مشاهده و چاپ صورتجلسه' : 'View & Print'}
                              aria-label={isFa ? 'چاپ' : 'Print'}
                              data-testid={`site-entry-print-${rec.id}`}
                              className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--accent-primary)]"
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
                                  onClick={() => startEdit(rec)}
                                  title={t.controls.edit}
                                  aria-label={t.controls.edit}
                                  data-testid={`site-entry-edit-${rec.id}`}
                                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(rec)}
                                  title={t.controls.delete}
                                  aria-label={t.controls.delete}
                                  data-testid={`site-entry-delete-${rec.id}`}
                                  className="p-1.5 rounded-lg border border-[var(--status-danger)]/30 hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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

      {/* Print Preview Modal with Post-Print Undo / Redo */}
      {printSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5 print:hidden"
          onClick={() => setPrintSheet(null)}
          data-testid="site-entry-print-preview-modal"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ClipboardSignature className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>{isFa ? 'پیش‌نمایش و چاپ صورتجلسه ورود کالا به کارگاه' : 'Site Entry Minutes Print Preview'}</span>
                <span className="font-mono text-[var(--accent-primary)] tabular-nums" dir="ltr">
                  {printSheet.minutesNo}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={() => void handlePreviewUndo()}
                      data-testid="site-entry-preview-undo-btn"
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
                      data-testid="site-entry-preview-redo-btn"
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
                  data-testid="site-entry-preview-print-btn"
                  className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isFa ? 'چاپ متریال' : 'Print'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintSheet(null)}
                  aria-label={isFa ? 'بستن' : 'Close'}
                  title={isFa ? 'بستن' : 'Close'}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {printRecordWasUndone && (
              <div
                data-testid="site-entry-preview-undone-banner"
                className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300"
              >
                {isFa
                  ? 'صدور این صورتجلسه با دکمه واگرد (Undo) لغو و ستون «شماره صورتجلسه ورود انبار» به حالت قبل بازگردانده شد. برای بازگرداندن آن، روی «انجام مجدد (Redo)» کلیک کنید.'
                  : 'This Site Entry Minutes was undone and General Equipment was restored. Click Redo to reapply it.'}
              </div>
            )}

            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-900">
              <div className="max-w-[820px] mx-auto bg-white p-5 rounded-xl shadow-md">
                <OfficialSiteEntrySheet
                  record={printSheet}
                  generalEntries={generalEntries}
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
          collection="siteEntry"
          recordId={scanTarget.id}
          recordLabel={scanTarget.minutesNo}
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
        title={isFa ? 'حذف صورتجلسه ورود کالا به کارگاه' : 'Delete Site Entry Minutes'}
        message={
          isFa
            ? `آیا از حذف صورتجلسه ورود شماره «${deleteTarget?.minutesNo || ''}» اطمینان دارید؟ شماره این صورتجلسه از ستون «شماره صورتجلسه ورود انبار» در جدول کلی تجهیزات پاک خواهد شد.`
            : `Delete Site Entry Minutes "${deleteTarget?.minutesNo || ''}"? Its number will be removed from General Equipment.`
        }
        confirmLabel={isFa ? 'بله، حذف شود' : 'Delete'}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* History List Print Report */}
      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={isFa ? 'فهرست صورتجلسات ورود کالا به کارگاه' : 'Site Entry Minutes List'}
        rows={filteredHistory}
        columns={historyColumns}
        defaultSelectedKeys={historyColumns.map((c) => c.key)}
      />
    </div>
  );
};
