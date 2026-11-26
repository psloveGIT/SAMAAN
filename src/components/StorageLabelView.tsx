import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilterX,
  Grid2x2,
  Printer,
  Square,
  Tag,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { resolveEmployerLogoSrc } from '../lib/employerLogoCache.ts';
import { triggerAppPrint } from '../lib/print.ts';
import {
  DETAILED_FILTER_FIELDS,
  type CustomFieldFilter,
} from '../shared/customFilters.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import {
  MD1_STORAGE_LABEL_FORM_CODE,
  MD1_STORAGE_LABEL_QA_NOTICE,
  buildMd1StorageLabelData,
  chunkStorageLabelsToA4QuadPages,
  resolveWarehouseFromLocation,
  type Md1StorageLabelData,
  type QuadA4Page,
} from '../shared/storageLabel.ts';
import type { DetailedComputed } from '../shared/types.ts';
import { ExcelColumnFilter } from './ExcelColumnFilter.tsx';
import { MultiPackingAndFieldFilter } from './MultiPackingAndFieldFilter.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { TablePaginationBar } from './TablePaginationBar.tsx';

interface StorageLabelViewProps {
  refreshSignal: number;
}

interface StorageLabelListResponse {
  items: DetailedComputed[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_MD1_LOGO_PATH = './assets/aistudio/______________8a639368.png';

interface Md1StorageLabelCardProps {
  data: Md1StorageLabelData;
  logoSrc: string;
  compact?: boolean;
}

/**
 * Exact official MD1 Storage Label form (MD1EX-FQP02/14-01) sized for quarter-A4 (2x2 grid per A4 page).
 */
const Md1StorageLabelCard: React.FC<Md1StorageLabelCardProps> = ({
  data,
  logoSrc,
  compact = false,
}) => {
  const fontSize = compact ? '9px' : '9.5px';
  const labelWidth = compact ? '74px' : '82px';
  const rowPad = compact ? '2.5px 5px' : '3px 6px';

  const rows: Array<{ label: string; value: string; isMultiline?: boolean }> = [
    { label: 'Tag No.:', value: data.tagNo },
    { label: 'Description:', value: data.description, isMultiline: true },
    { label: 'SYSTEM:', value: data.system },
    { label: 'Package No.:', value: data.packageNo },
    { label: 'Item No.:', value: data.itemNo },
    { label: 'Location:', value: data.location },
    { label: 'VENDOR:', value: data.vendor },
    { label: 'Drum number:', value: data.drumNumber },
  ];

  return (
    <div
      dir="ltr"
      data-testid="md1-storage-label-card"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        border: '1.6px solid #000000',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Row 1: Official MD1 Header with Logo + Bilingual Titles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 68px',
          borderBottom: '1.2px solid #000000',
          minHeight: compact ? '54px' : '60px',
          alignItems: 'center',
        }}
      >
        <div
          dir="rtl"
          style={{
            textAlign: 'center',
            padding: compact ? '3px 5px' : '4px 6px',
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontSize: compact ? '8.5px' : '9px', fontWeight: 800 }}>
            شركت احداث و توسعه نيروگاه‌هاي مپنا – توسعه يك (MD1)
          </div>
          <div style={{ fontSize: compact ? '8px' : '8.5px', fontWeight: 700, marginTop: '1px' }}>
            پروژه {data.project || '.................'}
          </div>
          <div style={{ fontSize: compact ? '9px' : '9.5px', fontWeight: 800, marginTop: '1px' }}>
            برچسب انبارش کالا
          </div>
          <div
            dir="ltr"
            style={{ fontSize: compact ? '8.5px' : '9px', fontWeight: 700, letterSpacing: '0.02em' }}
          >
            Storage Label
          </div>
        </div>
        <div
          style={{
            height: '100%',
            borderLeft: '1.2px solid #000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            backgroundColor: '#ffffff',
          }}
        >
          {logoSrc && (
            <img
              src={logoSrc}
              alt="MD1 Logo"
              style={{
                maxWidth: '100%',
                maxHeight: compact ? '44px' : '50px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}
        </div>
      </div>

      {/* Row 2: Project | Warehouse */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '1px solid #000000',
          fontSize,
          minHeight: compact ? '21px' : '23px',
        }}
      >
        <div
          style={{
            borderRight: '1px solid #000000',
            padding: rowPad,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            minWidth: 0,
          }}
        >
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>Project:</span>
          <span
            dir="auto"
            style={{
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data.project}
          </span>
        </div>
        <div
          style={{
            padding: rowPad,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            minWidth: 0,
          }}
        >
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>Warehouse:</span>
          <span
            dir="rtl"
            style={{
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data.warehouse}
          </span>
        </div>
      </div>

      {/* Rows 3-10: Official Key-Value Rows */}
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'grid',
            gridTemplateColumns: `${labelWidth} 1fr`,
            borderBottom: '1px solid #000000',
            fontSize,
            minHeight: r.isMultiline ? (compact ? '28px' : '32px') : compact ? '18px' : '20px',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              padding: rowPad,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderRight: '1px solid #000000',
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#f8fafc',
            }}
          >
            {r.label}
          </div>
          <div
            dir="auto"
            style={{
              padding: rowPad,
              fontWeight: 600,
              lineHeight: 1.26,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-line',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {r.value}
          </div>
        </div>
      ))}

      {/* Rows 11-17: Blank Notes / Stamp Box (flex fills remaining quarter-A4 height evenly) */}
      <div
        style={{
          flex: 1,
          minHeight: compact ? '28px' : '34px',
          borderBottom: '1px solid #000000',
          backgroundColor: '#ffffff',
        }}
      />

      {/* Row 18: Q.A Notice */}
      <div
        style={{
          padding: compact ? '2px 5px' : '2.5px 6px',
          fontSize: compact ? '6.5px' : '7px',
          lineHeight: 1.25,
          textAlign: 'center',
          borderBottom: '1px solid #000000',
          fontWeight: 600,
        }}
      >
        {MD1_STORAGE_LABEL_QA_NOTICE}
      </div>

      {/* Row 19: Form Code Footer */}
      <div
        style={{
          padding: compact ? '2px 5px' : '2.5px 6px',
          fontSize: compact ? '7.5px' : '8px',
          fontWeight: 800,
          textAlign: 'left',
          letterSpacing: '0.03em',
          backgroundColor: '#f8fafc',
        }}
      >
        {MD1_STORAGE_LABEL_FORM_CODE}
      </div>
    </div>
  );
};

interface QuadA4PageSheetProps {
  slots: QuadA4Page<Md1StorageLabelData>;
  logoSrc: string;
  mode: 'preview' | 'print';
  pageNumber?: number;
  totalPages?: number;
  isFa?: boolean;
}

/**
 * Renders a strict 2x2 quad-slot A4 sheet (4 labels per A4 page with clean cutting spacing).
 */
const QuadA4PageSheet: React.FC<QuadA4PageSheetProps> = ({
  slots,
  logoSrc,
  mode,
  pageNumber,
  totalPages,
  isFa = true,
}) => {
  const isPrint = mode === 'print';
  return (
    <div
      data-testid={isPrint ? 'storage-label-print-page' : 'storage-label-preview-a4-page'}
      className={isPrint ? 'samaan-label-quad-page' : 'mx-auto bg-white text-black shadow-lg border border-slate-300 relative'}
      style={
        isPrint
          ? {
              width: '100%',
              maxWidth: '184mm',
              height: '266mm',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
              gap: '5mm',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
            }
          : {
              width: '100%',
              maxWidth: '794px',
              aspectRatio: '210 / 297',
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
              gap: '16px',
              boxSizing: 'border-box',
            }
      }
    >
      {slots.map((slot, slotIdx) => (
        <div
          key={slot ? `${slot.id}-${slotIdx}` : `empty-${slotIdx}`}
          data-testid={slot ? 'quad-slot-filled' : 'quad-slot-empty'}
          style={{
            minWidth: 0,
            minHeight: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {slot ? (
            <Md1StorageLabelCard data={slot} logoSrc={logoSrc} compact={!isPrint} />
          ) : !isPrint ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '1px dashed #cbd5e1',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: '11px',
                backgroundColor: '#f8fafc',
              }}
            >
              {isFa ? `جایگاه خالی ${slotIdx + 1} از ۴` : `Empty Slot ${slotIdx + 1} of 4`}
            </div>
          ) : null}
        </div>
      ))}

      {!isPrint && pageNumber !== undefined && totalPages !== undefined && (
        <div
          dir={isFa ? 'rtl' : 'ltr'}
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap"
        >
          {isFa
            ? `برگه A4 شماره ${pageNumber.toLocaleString('fa-IR')} از ${totalPages.toLocaleString('fa-IR')}`
            : `A4 Sheet ${pageNumber} of ${totalPages}`}
        </div>
      )}
    </div>
  );
};

export const StorageLabelView: React.FC<StorageLabelViewProps> = ({ refreshSignal }) => {
  const { prefs, t, notify, activeProject, activeEmployer } = useApp();
  const isFa = prefs.language === 'fa';

  // Filters matching Detailed Equipment
  const [q, setQ] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<CustomFieldFilter[]>([]);
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Server/offline list response
  const [data, setData] = useState<StorageLabelListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Multi-row selection (persists across pages & filters)
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});
  const [selectingAll, setSelectingAll] = useState(false);

  // Print & Preview options
  const [copiesPerRow, setCopiesPerRow] = useState<1 | 2 | 4>(1);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  const loadSeqRef = useRef(0);

  const projectName = (activeProject?.name || '').trim();
  const logoSrc = useMemo(() => {
    const rawLogo =
      activeEmployer?.logos?.[0]?.dataUrl || DEFAULT_MD1_LOGO_PATH;
    return resolveEmployerLogoSrc(rawLogo);
  }, [activeEmployer]);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (selectedPackings.length > 0) {
      params.set('packingNos', JSON.stringify(selectedPackings));
    }
    if (customFilters.length > 0) {
      params.set('customFilters', JSON.stringify(customFilters));
    }
    if (Object.keys(colFilters).length > 0) {
      params.set('colFilters', JSON.stringify(colFilters));
      params.set('calendar', prefs.calendar);
    }
    if (sortBy && sortDir) {
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
    }
    return params;
  }, [q, selectedPackings, customFilters, colFilters, prefs.calendar, sortBy, sortDir]);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const params = buildFilterParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await apiRequest<StorageLabelListResponse>(`/api/detailed?${params.toString()}`);
      if (seq === loadSeqRef.current) {
        setData(res);
      }
    } catch (err) {
      if (seq === loadSeqRef.current && err instanceof ApiError) {
        notify('error', err.message);
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [buildFilterParams, page, pageSize, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, q ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [loadData, refreshSignal, q]);

  const rows = data?.items || [];
  const totalRows = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const hasActiveFilters = Boolean(
    q.trim() ||
      selectedPackings.length > 0 ||
      customFilters.length > 0 ||
      Object.keys(colFilters).length > 0 ||
      sortBy,
  );

  const handleClearFilters = () => {
    setQ('');
    setSelectedPackings([]);
    setCustomFilters([]);
    setColFilters({});
    setSortBy('');
    setSortDir('');
    setPage(1);
  };

  const handleApplyColFilter = useCallback((colKey: string, allowed: string[] | undefined) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (allowed === undefined) {
        delete next[colKey];
      } else {
        next[colKey] = allowed;
      }
      return next;
    });
    setPage(1);
  }, []);

  const handleSortChange = useCallback((colKey: string, dir: 'asc' | 'desc' | null) => {
    if (!dir) {
      setSortBy('');
      setSortDir('');
    } else {
      setSortBy(colKey);
      setSortDir(dir);
    }
    setPage(1);
  }, []);

  // Selection helpers
  const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectedCount = selectedList.length;

  const allPageSelected =
    rows.length > 0 && rows.every((item) => Boolean(selectedMap[item.id]));

  const toggleOne = (item: DetailedComputed) => {
    setSelectedMap((prev) => {
      if (prev[item.id]) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: item };
    });
  };

  const togglePageSelection = () => {
    if (rows.length === 0) return;
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allPageSelected) {
        for (const r of rows) delete next[r.id];
      } else {
        for (const r of rows) next[r.id] = r;
      }
      return next;
    });
  };

  const handleSelectAllFiltered = async () => {
    if (totalRows === 0) return;
    setSelectingAll(true);
    try {
      const params = buildFilterParams();
      params.set('all', 'true');
      const res = await apiRequest<StorageLabelListResponse>(`/api/detailed?${params.toString()}`);
      const nextMap: Record<string, DetailedComputed> = {};
      for (const item of res.items || []) {
        nextMap[item.id] = item;
      }
      setSelectedMap(nextMap);
      notify(
        'success',
        isFa
          ? `${Object.keys(nextMap).length.toLocaleString('fa-IR')} ردیف فیلترشده برای چاپ انتخاب شد.`
          : `${Object.keys(nextMap).length} filtered rows selected for printing.`,
      );
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSelectingAll(false);
    }
  };

  const clearSelection = () => {
    setSelectedMap({});
  };

  // Transform selected rows to exact MD1EX-FQP02/14-01 label payloads & strict 4-up A4 pages
  const selectedLabelData = useMemo(
    () => selectedList.map((item) => buildMd1StorageLabelData(item, projectName)),
    [selectedList, projectName],
  );

  const quadPages = useMemo(
    () => chunkStorageLabelsToA4QuadPages(selectedLabelData, copiesPerRow),
    [selectedLabelData, copiesPerRow],
  );

  const totalLabelsToPrint = selectedLabelData.length * copiesPerRow;

  // Keep preview page index in bounds
  useEffect(() => {
    if (previewPageIndex >= quadPages.length) {
      setPreviewPageIndex(Math.max(0, quadPages.length - 1));
    }
  }, [quadPages.length, previewPageIndex]);

  const handlePrintLabels = () => {
    if (selectedCount === 0) {
      notify(
        'warning',
        isFa
          ? 'ابتدا حداقل یک ردیف را برای چاپ برچسب علامت بزنید.'
          : 'Select at least one row to print storage labels.',
      );
      return;
    }
    triggerAppPrint({ title: 'Storage-Labels' });
  };

  const handleOpenPreview = () => {
    if (selectedCount === 0) {
      notify(
        'warning',
        isFa
          ? 'ابتدا حداقل یک ردیف را برای پیش‌نمایش چاپ علامت بزنید.'
          : 'Select at least one row to preview storage labels.',
      );
      return;
    }
    setPreviewPageIndex(0);
    setPreviewModalOpen(true);
  };

  // Dedicated Print Portal (Strict 2x2 A4 pages, 4 labels per A4 sheet whether 1 or 1,000 rows)
  const printPortal =
    quadPages.length > 0
        ? createPortal(
          <div id="samaan-label-print-root" data-samaan-print-portal="true" dir="ltr">
            <style>{`
              ${buildIsolatedPrintPortalCss('samaan-label-print-root', {
                orientation: 'portrait',
                isFa,
                showBrowserPageFooter: false,
              })}
              @media print {
                .samaan-label-quad-page {
                  page-break-after: always;
                  break-after: page;
                  page-break-inside: avoid;
                  break-inside: avoid;
                  margin: 0 auto !important;
                }
                .samaan-label-quad-page:last-child {
                  page-break-after: auto;
                  break-after: auto;
                }
              }
            `}</style>
            {quadPages.map((slots, idx) => (
              <QuadA4PageSheet
                key={idx}
                slots={slots}
                logoSrc={logoSrc}
                mode="print"
                isFa={isFa}
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  const samplePreviewCard = useMemo(() => {
    const first = selectedList[0] || rows[0];
    if (!first) return null;
    return buildMd1StorageLabelData(first, projectName);
  }, [selectedList, rows, projectName]);

  const filterColumns: Array<{
    key: string;
    label: string;
    ltr?: boolean;
  }> = [
    { key: 'itemCode', label: t.headers.itemCode, ltr: true },
    { key: 'description', label: t.headers.description },
    { key: 'system', label: t.headers.system },
    { key: 'subSystem', label: t.headers.subSystem },
    { key: 'shipmentNo', label: t.headers.shipmentNo, ltr: true },
    { key: 'packageNo', label: t.headers.packageNo, ltr: true },
    { key: 'itemNo', label: t.headers.itemNo, ltr: true },
    { key: 'storageLocation', label: t.headers.storageLocation, ltr: true },
    { key: 'supplier', label: t.headers.supplier },
    { key: 'notes', label: t.headers.merNotes },
  ];

  return (
    <div className="space-y-4">
      {printPortal}

      {/* Top Action Header */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] tracking-tight">
              {isFa ? 'برچسب انبارش کالا' : 'Warehouse Storage Label'}
            </h2>
            <span
              dir="ltr"
              className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-bold text-[var(--text-secondary)] tabular-nums"
            >
              {MD1_STORAGE_LABEL_FORM_CODE}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {isFa ? 'پروژه فعال:' : 'Active Project:'}{' '}
              <strong className="text-[var(--text-primary)]">
                {projectName || (isFa ? 'تعریف‌نشده' : 'Not set')}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Grid2x2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>
                {isFa
                  ? 'چاپ استاندارد ۴ برچسب در هر برگه A4 با فاصله برش'
                  : 'Standard 4-up A4 sheet layout (2×2 grid with spacing)'}
              </span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Copies per row selector */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 h-9">
            <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">
              {isFa ? 'کپی از هر ردیف:' : 'Copies:'}
            </span>
            <select
              aria-label={isFa ? 'تعداد کپی از هر ردیف' : 'Copies per row'}
              value={copiesPerRow}
              onChange={(e) => setCopiesPerRow(Number(e.target.value) as 1 | 2 | 4)}
              className="bg-transparent text-xs font-bold text-[var(--text-primary)] focus:outline-none tabular-nums"
            >
              <option value={1}>{isFa ? '۱ عدد' : '1x'}</option>
              <option value={2}>{isFa ? '۲ عدد' : '2x'}</option>
              <option value={4}>{isFa ? '۴ عدد (۱ برگه کامل)' : '4x (Full A4)'}</option>
            </select>
          </div>

          <button
            type="button"
            data-testid="storage-label-preview-btn"
            onClick={handleOpenPreview}
            disabled={selectedCount === 0}
            className="h-9 px-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            <Eye className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>
              {isFa
                ? `پیش‌نمایش A4${quadPages.length > 0 ? ` (${quadPages.length.toLocaleString('fa-IR')} برگه)` : ''}`
                : `A4 Preview${quadPages.length > 0 ? ` (${quadPages.length} sh.)` : ''}`}
            </span>
          </button>

          <button
            type="button"
            data-testid="storage-label-print-btn"
            onClick={handlePrintLabels}
            disabled={selectedCount === 0}
            className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isFa
                ? `چاپ برچسب‌ها (${totalLabelsToPrint.toLocaleString('fa-IR')})`
                : `Print Labels (${totalLabelsToPrint})`}
            </span>
          </button>
        </div>
      </div>

      {/* Detailed-Equipment-Grade Filter Bar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[230px]">
            <SearchInputWithClear
              value={q}
              onChange={(val) => {
                setQ(val);
                setPage(1);
              }}
              placeholder={
                isFa
                  ? 'جستجو در کد کالا، شرح، سیستم، شماره محموله/نگله، محل نگهداری، تأمین‌کننده یا توضیحات تجهیز...'
                  : 'Search Tag No., Description, System, Packing, Location, Vendor, Equipment Notes...'
              }
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--status-danger)] inline-flex items-center gap-1.5"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>{t.controls.clearFilters}</span>
            </button>
          )}
        </div>

        <MultiPackingAndFieldFilter
          fields={DETAILED_FILTER_FIELDS}
          selectedPackings={selectedPackings}
          onChangePackings={(next) => {
            setSelectedPackings(next);
            setPage(1);
          }}
          customFilters={customFilters}
          onChangeCustomFilters={(next) => {
            setCustomFilters(next);
            setPage(1);
          }}
          compact
        />

        {/* Selection Bar */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePageSelection}
              disabled={rows.length === 0}
              className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11.5px] font-medium inline-flex items-center gap-1.5 disabled:opacity-45"
            >
              {allPageSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              ) : (
                <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
              <span>{isFa ? 'انتخاب این صفحه' : 'Select This Page'}</span>
            </button>

            <button
              type="button"
              data-testid="storage-label-select-all-filtered"
              onClick={handleSelectAllFiltered}
              disabled={totalRows === 0 || selectingAll}
              className="h-8 px-2.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)]/50 hover:bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>
                {selectingAll
                  ? isFa
                    ? 'در حال انتخاب همه...'
                    : 'Selecting all...'
                  : isFa
                    ? `انتخاب همه ردیف‌های فیلترشده (${totalRows.toLocaleString('fa-IR')})`
                    : `Select All Filtered (${totalRows})`}
              </span>
            </button>

            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.clearSelection}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11.5px] text-[var(--text-secondary)] tabular-nums">
            <span>
              {isFa
                ? `ردیف‌های انتخاب‌شده: ${selectedCount.toLocaleString('fa-IR')}`
                : `Selected rows: ${selectedCount}`}
            </span>
            {selectedCount > 0 && (
              <span className="font-bold text-[var(--accent-primary)]">
                {isFa
                  ? `${totalLabelsToPrint.toLocaleString('fa-IR')} برچسب ← ${quadPages.length.toLocaleString('fa-IR')} برگه A4`
                  : `${totalLabelsToPrint} labels → ${quadPages.length} A4 pages`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Filterable Equipment Selection Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <StickyTableWrapper>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="py-2.5 px-3 text-center w-10">
                  <input
                    type="checkbox"
                    aria-label={isFa ? 'انتخاب همه ردیف‌های صفحه' : 'Select all rows on page'}
                    checked={allPageSelected}
                    onChange={togglePageSelection}
                    className="w-4 h-4 accent-[var(--accent-primary)] cursor-pointer"
                  />
                </th>
                {filterColumns.map((col) => (
                  <th key={col.key} className="py-2.5 px-2.5 text-center whitespace-nowrap">
                    <ExcelColumnFilter
                      scope="detailed"
                      colKey={col.key}
                      label={col.label}
                      calendar={prefs.calendar}
                      lang={prefs.language}
                      activeValues={colFilters[col.key]}
                      sortDir={sortBy === col.key ? (sortDir || null) : null}
                      refreshSignal={refreshSignal}
                      onSortChange={handleSortChange}
                      onApplyFilter={handleApplyColFilter}
                    />
                  </th>
                ))}
                <th className="py-2.5 px-2 text-center whitespace-nowrap font-bold text-[var(--accent-primary)]">
                  {isFa ? 'انبار (خودکار)' : 'Warehouse (Auto)'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td
                    colSpan={filterColumns.length + 2}
                    className="py-12 text-center text-[var(--text-muted)]"
                  >
                    {t.controls.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={filterColumns.length + 2}
                    className="py-12 text-center text-[var(--text-muted)]"
                  >
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const isChecked = Boolean(selectedMap[item.id]);
                  const autoWarehouse = resolveWarehouseFromLocation(item.storageLocation);
                  return (
                    <tr
                      key={item.id}
                      data-testid={`storage-label-row-${item.itemCode || item.id}`}
                      onClick={() => toggleOne(item)}
                      className={`cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[var(--accent-soft)]/55 hover:bg-[var(--accent-soft)]/75'
                          : 'hover:bg-[var(--bg-subtle)]/50'
                      }`}
                    >
                      <td
                        className="py-2 px-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${isFa ? 'انتخاب ردیف' : 'Select row'} ${item.itemCode || item.shipmentNo}`}
                          checked={isChecked}
                          onChange={() => toggleOne(item)}
                          className="w-4 h-4 accent-[var(--accent-primary)] cursor-pointer"
                        />
                      </td>
                      <td className="py-2 px-2 text-center font-semibold tabular-nums whitespace-pre-line" dir="ltr">
                        {item.itemCode || '—'}
                      </td>
                      <td className="py-2 px-2 text-start max-w-[220px] whitespace-pre-line break-words bidi-plaintext" title={item.description}>
                        {item.description || '—'}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-pre-line bidi-plaintext">
                        {item.system || '—'}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-pre-line bidi-plaintext">
                        {item.subSystem || '—'}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums whitespace-pre-line" dir="ltr">
                        {item.shipmentNo || '—'}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums whitespace-pre-line" dir="ltr">
                        {item.packageNo || '—'}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums whitespace-pre-line" dir="ltr">
                        {item.itemNo || '—'}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums whitespace-pre-line font-medium" dir="ltr">
                        {item.storageLocation || '—'}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-pre-line bidi-plaintext">
                        {item.supplier || '—'}
                      </td>
                      <td className="py-2 px-2 text-center max-w-[160px] whitespace-pre-line break-words bidi-plaintext" title={item.notes}>
                        {item.notes || '—'}
                      </td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        {autoWarehouse ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold text-[11px]">
                            {autoWarehouse}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </StickyTableWrapper>

        <TablePaginationBar
          page={page}
          totalPages={totalPages}
          total={totalRows}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          lang={prefs.language}
        />
      </div>

      {/* Compact Live Sample Card Preview (single card view below table) */}
      {samplePreviewCard && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[var(--text-primary)]">
              {selectedCount > 0
                ? isFa
                  ? `پیش‌نمایش برچسب اول از ${selectedCount.toLocaleString('fa-IR')} ردیف انتخاب‌شده`
                  : `Live Preview of First Selected Label (${selectedCount} selected)`
                : isFa
                  ? 'پیش‌نمایش نمونه برچسب انبارش کالا (ردیف‌های موردنظر را برای چاپ تیک بزنید)'
                  : 'Sample Storage Label Preview (check rows above to print)'}
            </h3>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleOpenPreview}
                className="text-xs font-semibold text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>
                  {isFa ? 'مشاهده کامل چیدمان ۴عددی A4' : 'View Full 4-Up A4 Sheet'}
                </span>
              </button>
            )}
          </div>

          <div className="max-w-[390px] aspect-[99/141] mx-auto sm:mx-0">
            <Md1StorageLabelCard data={samplePreviewCard} logoSrc={logoSrc} compact />
          </div>
        </div>
      )}

      {/* Full A4 4-Up Print Preview Modal */}
      {previewModalOpen && quadPages.length > 0 && (
        <div
          data-testid="storage-label-preview-modal"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
        >
          <div className="w-full max-w-4xl max-h-[94vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Grid2x2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <span className="font-bold text-xs sm:text-sm text-[var(--text-primary)] truncate">
                  {isFa ? (
                    <>
                      پیش‌نمایش برگه <span dir="ltr">A4</span> (۴ برچسب در هر برگه) ·{' '}
                      {totalLabelsToPrint.toLocaleString('fa-IR')} برچسب در{' '}
                      {quadPages.length.toLocaleString('fa-IR')} برگه
                    </>
                  ) : (
                    `4-Up A4 Print Preview — ${totalLabelsToPrint} labels across ${quadPages.length} A4 sheets`
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {quadPages.length > 1 && (
                  <div className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 h-8 text-xs tabular-nums">
                    <button
                      type="button"
                      aria-label={isFa ? 'برگه قبلی' : 'Previous page'}
                      disabled={previewPageIndex <= 0}
                      onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                      className="p-1 rounded hover:bg-[var(--bg-subtle)] disabled:opacity-35"
                    >
                      {isFa ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                    </button>
                    <span className="px-1.5 font-semibold">
                      {(previewPageIndex + 1).toLocaleString(isFa ? 'fa-IR' : 'en-US')} /{' '}
                      {quadPages.length.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
                    </span>
                    <button
                      type="button"
                      aria-label={isFa ? 'برگه بعدی' : 'Next page'}
                      disabled={previewPageIndex >= quadPages.length - 1}
                      onClick={() => setPreviewPageIndex((p) => Math.min(quadPages.length - 1, p + 1))}
                      className="p-1 rounded hover:bg-[var(--bg-subtle)] disabled:opacity-35"
                    >
                      {isFa ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="storage-label-modal-print-btn"
                  onClick={handlePrintLabels}
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isFa ? 'چاپ برگه A4' : 'Print A4'}</span>
                </button>

                <button
                  type="button"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => setPreviewModalOpen(false)}
                  className="h-9 w-9 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal A4 Sheet Body */}
            <div className="flex-1 overflow-y-auto bg-slate-200 dark:bg-slate-900 p-5 pb-10">
              <QuadA4PageSheet
                slots={quadPages[previewPageIndex]}
                logoSrc={logoSrc}
                mode="preview"
                pageNumber={previewPageIndex + 1}
                totalPages={quadPages.length}
                isFa={isFa}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
