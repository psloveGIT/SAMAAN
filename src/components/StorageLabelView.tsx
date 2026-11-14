import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquare, Eye, Printer, Search, Square, Tag, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import type { DetailedComputed } from '../shared/types.ts';

const MD1_STACKED_LOGO = '/assets/aistudio/______________________________65f1164c.png';
const LABEL_META_STORAGE_KEY = 'samaan_storage_label_meta_v1';

interface StorageLabelViewProps {
  refreshSignal: number;
}

interface LabelFieldToggles {
  shipmentNo: boolean;
  packageNo: boolean;
  itemNo: boolean;
  itemCode: boolean;
  size: boolean;
  qty: boolean;
  storageLocation: boolean;
  arrivalDate: boolean;
  islandSystem: boolean;
}

interface LabelMetaConfig {
  projectName: string;
  warehouseName: string;
  drumNumber: string;
  customRemark: string;
}

interface OfficialStorageLabelSheetProps {
  item: DetailedComputed;
  meta: LabelMetaConfig;
  fields: LabelFieldToggles;
  formatDate: (iso: string) => string;
  compact?: boolean;
}

const OfficialStorageLabelSheet: React.FC<OfficialStorageLabelSheetProps> = ({
  item,
  meta,
  fields,
  formatDate,
  compact = false,
}) => {
  const pkgDisplay = [
    fields.shipmentNo ? item.shipmentNo : '',
    fields.packageNo ? item.packageNo : '',
  ]
    .filter(Boolean)
    .join(' / ');

  const systemDisplay = [
    fields.islandSystem ? item.island : '',
    item.system,
    item.subSystem,
    fields.islandSystem ? item.unit : '',
  ]
    .filter(Boolean)
    .join(' / ');

  const descBase = item.description || item.generalDescription || '';
  const descDisplay =
    fields.size && item.size ? `${descBase}${descBase ? ' ' : ''}(${item.size})` : descBase;

  const qtyValue = item.opiPending ? item.packingQty ?? '-' : item.mapnaInventory;

  const extraFooterLines: { label: string; value: string; ltr?: boolean }[] = [];
  if (fields.qty) {
    extraFooterLines.push({
      label: 'Qty:',
      value: `${qtyValue} ${item.countingUnit || ''}`.trim(),
      ltr: true,
    });
  }
  if (fields.arrivalDate && item.arrivalDate) {
    extraFooterLines.push({
      label: 'Arrival Date:',
      value: formatDate(item.arrivalDate),
      ltr: true,
    });
  }
  if (meta.customRemark.trim()) {
    extraFooterLines.push({
      label: 'Note:',
      value: meta.customRemark.trim(),
    });
  }

  const rowMinH = compact ? '23px' : '31px';
  const rowFontSize = compact ? '9.5px' : '11px';

  return (
    <div
      dir="ltr"
      style={{
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: '"Vazirmatn", "Plus Jakarta Sans", Tahoma, sans-serif',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Unified Outer Border Frame */}
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Header Row: Left 15% blank cell | Right 85% Title + Stacked MAPNA MD1 Logo */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '15% 85%',
            borderBottom: '1.5px solid #000000',
            minHeight: compact ? '78px' : '96px',
          }}
        >
          {/* Left Blank Header Cell (exact match to PDF) */}
          <div style={{ borderRight: '1.5px solid #000000' }} />

          {/* Right Header Area (Title Centered + Stacked Logo on Right) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 112px',
              alignItems: 'center',
              padding: compact ? '5px 8px' : '7px 12px',
            }}
          >
            {/* Center Bilingual Title Block */}
            <div
              dir="rtl"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                lineHeight: 1.55,
                paddingLeft: '8px',
              }}
            >
              <div style={{ fontSize: compact ? '10.5px' : '12.5px', fontWeight: 700 }}>
                شرکت احداث و توسعه نیروگاه‌های مپنا – توسعه یک (MD1)
              </div>
              <div style={{ fontSize: compact ? '10px' : '12px', fontWeight: 700 }}>
                پروژه {meta.projectName.trim() || '.................'}
              </div>
              <div style={{ fontSize: compact ? '12.5px' : '14.5px', fontWeight: 800, marginTop: '1px' }}>
                برچسب انبارش کالا
              </div>
              <div
                dir="ltr"
                style={{ fontSize: compact ? '11px' : '13px', fontWeight: 800, marginTop: '2px' }}
              >
                Storage Label
              </div>
            </div>

            {/* Right: Stacked Persian MAPNA MD1 Logo */}
            <div
              dir="rtl"
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
                alt="گروه مپنا - شرکت توسعه یک"
                style={{
                  height: compact ? '44px' : '56px',
                  width: 'auto',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
              <div
                style={{
                  fontSize: compact ? '6.5px' : '7.5px',
                  fontWeight: 700,
                  color: '#334155',
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                مستندات سیستم مدیریت یکپارچه
              </div>
            </div>
          </div>
        </div>

        {/* Gray Metadata Row: Project | Warehouse */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '58% 42%',
            backgroundColor: '#e5e7eb',
            borderBottom: '1px solid #000000',
            fontSize: rowFontSize,
            minHeight: compact ? '24px' : '30px',
          }}
        >
          <div
            style={{
              borderRight: '1px solid #000000',
              padding: compact ? '3px 8px' : '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Project:</span>
            <span className="bidi-plaintext" style={{ fontWeight: 600 }}>
              {meta.projectName.trim()}
            </span>
          </div>
          <div
            style={{
              padding: compact ? '3px 8px' : '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Warehouse:</span>
            <span className="bidi-plaintext" style={{ fontWeight: 600 }}>
              {meta.warehouseName.trim()}
            </span>
          </div>
        </div>

        {/* 7 Key-Value Rows: Tag No., Description, SYSTEM, Package No., Item No., Location, VENDOR */}
        {[
          {
            label: 'Tag No.:',
            value: fields.itemCode ? item.itemCode || '' : '',
            isLtr: true,
          },
          {
            label: 'Description:',
            value: descDisplay,
            isLtr: false,
          },
          {
            label: 'SYSTEM:',
            value: systemDisplay,
            isLtr: false,
          },
          {
            label: 'Package No.:',
            value: pkgDisplay,
            isLtr: true,
          },
          {
            label: 'Item No.:',
            value: fields.itemNo ? item.itemNo || '' : '',
            isLtr: true,
          },
          {
            label: 'Location:',
            value: fields.storageLocation ? item.storageLocation || '' : '',
            isLtr: false,
          },
          {
            label: 'VENDOR:',
            value: item.supplier || '',
            isLtr: false,
          },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '32.5% 67.5%',
              borderBottom: '1px solid #000000',
              minHeight: rowMinH,
              fontSize: rowFontSize,
            }}
          >
            <div
              style={{
                borderRight: '1px solid #000000',
                padding: compact ? '3px 8px' : '5px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                textAlign: 'left',
                fontWeight: 700,
              }}
            >
              {row.label}
            </div>
            <div
              dir={row.isLtr ? 'ltr' : 'auto'}
              className={row.isLtr ? 'tabular-nums' : 'bidi-plaintext'}
              style={{
                padding: compact ? '3px 10px' : '5px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                fontWeight: 600,
                wordBreak: 'break-word',
              }}
            >
              {row.value}
            </div>
          </div>
        ))}

        {/* Full-Width Row: Drum number: */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            borderBottom: '1px solid #000000',
            minHeight: rowMinH,
            padding: compact ? '3px 8px' : '5px 8px',
            fontSize: rowFontSize,
          }}
        >
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Drum number:</span>
          <span className="bidi-plaintext tabular-nums" style={{ fontWeight: 600 }}>
            {meta.drumNumber.trim()}
          </span>
        </div>

        {/* Large Lower Blank / Optional Details Area */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            minHeight: compact ? '56px' : '118px',
            padding: compact ? '6px 10px' : '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: '4px',
            fontSize: compact ? '9px' : '10.5px',
          }}
        >
          {extraFooterLines.map((line) => (
            <div key={line.label} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{line.label}</span>
              <span
                dir={line.ltr ? 'ltr' : 'auto'}
                className={line.ltr ? 'tabular-nums' : 'bidi-plaintext'}
                style={{ fontWeight: 600 }}
              >
                {line.value}
              </span>
            </div>
          ))}
        </div>

        {/* Notice Row */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: compact ? '3px 6px' : '4px 8px',
            fontSize: compact ? '8.5px' : '10px',
            fontWeight: 700,
            textAlign: 'left',
          }}
        >
          Notice: This form is controlled by Q.A discipline and every change have to be with Q.A permission.
        </div>

        {/* Bottom Form Code Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '32.5% 67.5%',
            fontSize: compact ? '9px' : '10.5px',
            fontWeight: 700,
          }}
        >
          <div
            style={{
              borderRight: '1px solid #000000',
              padding: compact ? '3px 8px' : '4px 8px',
              textAlign: 'left',
            }}
          >
            MD1EX-FQP02/14-01
          </div>
          <div style={{ padding: compact ? '3px 8px' : '4px 8px' }} />
        </div>
      </div>
    </div>
  );
};

function loadInitialMeta(): LabelMetaConfig {
  try {
    const raw = localStorage.getItem(LABEL_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LabelMetaConfig>;
      return {
        projectName: parsed.projectName ?? '',
        warehouseName: parsed.warehouseName ?? '',
        drumNumber: parsed.drumNumber ?? '',
        customRemark: parsed.customRemark ?? '',
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    projectName: '',
    warehouseName: '',
    drumNumber: '',
    customRemark: '',
  };
}

export const StorageLabelView: React.FC<StorageLabelViewProps> = ({ refreshSignal }) => {
  const { prefs, t, notify, formatDate } = useApp();
  const isFa = prefs.language === 'fa';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [items, setItems] = useState<DetailedComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [labelsPerPage, setLabelsPerPage] = useState<1 | 2>(1);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const [meta, setMeta] = useState<LabelMetaConfig>(loadInitialMeta);

  useEffect(() => {
    try {
      localStorage.setItem(LABEL_META_STORAGE_KEY, JSON.stringify(meta));
    } catch {
      // ignore storage errors
    }
  }, [meta]);

  const [fields, setFields] = useState<LabelFieldToggles>({
    shipmentNo: true,
    packageNo: true,
    itemNo: true,
    itemCode: true,
    size: true,
    qty: false,
    storageLocation: true,
    arrivalDate: false,
    islandSystem: false,
  });

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '200',
        ...(q ? { q } : {}),
        ...(shipmentFilter ? { shipmentNo: shipmentFilter } : {}),
      });
      const res = await apiRequest<{ items: DetailedComputed[] }>(
        `/api/detailed?${params.toString()}`,
      );
      setItems(res.items || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [q, shipmentFilter, notify]);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshSignal]);

  const knownLocations = useMemo(
    () => Array.from(new Set(items.map((i) => i.storageLocation).filter(Boolean))),
    [items],
  );

  const filtered = useMemo(() => {
    if (!locationFilter) return items;
    return items.filter((i) => i.storageLocation === locationFilter);
  }, [items, locationFilter]);

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id));
    setSelectedIds(allSelected ? [] : filtered.map((i) => i.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectedItems = useMemo(
    () => filtered.filter((i) => selectedIds.includes(i.id)),
    [filtered, selectedIds],
  );

  const labelsToRender = useMemo(
    () => (selectedItems.length > 0 ? selectedItems : filtered.slice(0, 6)),
    [selectedItems, filtered],
  );

  const toggleField = (k: keyof LabelFieldToggles) => {
    setFields((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const handlePrintLabels = () => {
    if (selectedItems.length === 0) {
      notify(
        'warning',
        isFa ? 'حداقل یک کالا را برای چاپ برچسب انتخاب کنید.' : 'Select at least one item to print labels.',
      );
      return;
    }
    window.print();
  };

  const handleOpenPreview = () => {
    if (selectedItems.length === 0) {
      notify(
        'warning',
        isFa ? 'حداقل یک کالا را برای پیش‌نمایش چاپ انتخاب کنید.' : 'Select at least one item to preview.',
      );
      return;
    }
    setPreviewModalOpen(true);
  };

  const printPages = useMemo(() => {
    const pages: DetailedComputed[][] = [];
    for (let i = 0; i < selectedItems.length; i += labelsPerPage) {
      pages.push(selectedItems.slice(i, i + labelsPerPage));
    }
    return pages;
  }, [selectedItems, labelsPerPage]);

  const printPortal =
    selectedItems.length > 0
      ? createPortal(
          <div id="samaan-label-print-root" dir="ltr">
            <style>{`
              @media screen {
                #samaan-label-print-root { display: none !important; }
              }
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 9mm;
                }
                body > *:not(#samaan-label-print-root) {
                  display: none !important;
                }
                #samaan-label-print-root {
                  display: block !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  font-family: 'Vazirmatn', 'Plus Jakarta Sans', Tahoma, sans-serif;
                }
                .samaan-label-page {
                  display: flex;
                  flex-direction: column;
                  gap: 8mm;
                  page-break-after: always;
                  break-after: page;
                }
                .samaan-label-page:last-child {
                  page-break-after: auto;
                  break-after: auto;
                }
                .samaan-label-card {
                  break-inside: avoid;
                  page-break-inside: avoid;
                }
              }
            `}</style>
            {printPages.map((pageItems, pageIdx) => (
              <div key={pageIdx} className="samaan-label-page">
                {pageItems.map((item) => (
                  <div key={item.id} className="samaan-label-card">
                    <OfficialStorageLabelSheet
                      item={item}
                      meta={meta}
                      fields={fields}
                      formatDate={formatDate}
                      compact={labelsPerPage === 2}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  const fieldToggleList: { key: keyof LabelFieldToggles; label: string }[] = [
    { key: 'shipmentNo', label: t.headers.shipmentNo },
    { key: 'packageNo', label: t.headers.packageNo },
    { key: 'itemNo', label: t.headers.itemNo },
    { key: 'itemCode', label: `${t.headers.itemCode} (Tag No.)` },
    { key: 'size', label: t.headers.size },
    { key: 'storageLocation', label: t.headers.storageLocation },
    { key: 'islandSystem', label: `${t.headers.island} / ${t.headers.unit}` },
    { key: 'qty', label: isFa ? 'تعداد در کادر پایین' : 'Qty in Bottom Box' },
    { key: 'arrivalDate', label: isFa ? 'تاریخ ورود در کادر پایین' : 'Arrival Date in Bottom Box' },
  ];

  return (
    <div className="space-y-6">
      {printPortal}

      {/* Label Configuration */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Tag className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{t.nav.storageLabel}</span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              (MD1EX-FQP02/14-01)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              {isFa ? 'چیدمان در A4 عمودی:' : 'Labels per A4 page:'}
            </span>
            <button
              type="button"
              onClick={() => setLabelsPerPage(1)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium ${
                labelsPerPage === 1
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {isFa ? '۱ برچسب در صفحه (استاندارد PDF)' : '1 per Page (PDF Standard)'}
            </button>
            <button
              type="button"
              onClick={() => setLabelsPerPage(2)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium ${
                labelsPerPage === 2
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              {isFa ? '۲ برچسب در صفحه' : '2 per Page'}
            </button>

            <button
              type="button"
              onClick={handleOpenPreview}
              className="h-9 px-3.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Eye className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'پیش‌نمایش برگ رسمی' : 'Official Preview'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintLabels}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>
                {isFa
                  ? `چاپ ${selectedItems.length.toLocaleString('fa-IR')} برچسب`
                  : `Print ${selectedItems.length} Labels`}
              </span>
            </button>
          </div>
        </div>

        {/* Official Header Metadata Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {isFa ? 'نام پروژه (Project)' : 'Project Name'}
            </label>
            <input
              type="text"
              value={meta.projectName}
              onChange={(e) => setMeta((p) => ({ ...p, projectName: e.target.value }))}
              placeholder={isFa ? 'مثال: نیروگاه ...' : 'Project name...'}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {isFa ? 'نام انبار (Warehouse)' : 'Warehouse'}
            </label>
            <input
              type="text"
              value={meta.warehouseName}
              onChange={(e) => setMeta((p) => ({ ...p, warehouseName: e.target.value }))}
              placeholder={isFa ? 'مثال: انبار مرکزی / محوطه باز' : 'Warehouse name...'}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {isFa ? 'شماره قرقره (Drum number)' : 'Drum number'}
            </label>
            <input
              type="text"
              value={meta.drumNumber}
              onChange={(e) => setMeta((p) => ({ ...p, drumNumber: e.target.value }))}
              placeholder={isFa ? 'اختیاری' : 'Optional'}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {isFa ? 'توضیحات تکمیلی کادر پایین' : 'Bottom Box Note'}
            </label>
            <input
              type="text"
              value={meta.customRemark}
              onChange={(e) => setMeta((p) => ({ ...p, customRemark: e.target.value }))}
              placeholder={isFa ? 'اختیاری (در صورت خالی بودن سفید چاپ می‌شود)' : 'Optional note'}
              className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>

        {/* Field Visibility Toggles */}
        <div className="flex flex-wrap gap-2">
          {fieldToggleList.map((f) => {
            const active = fields[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleField(f.key)}
                className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'border-[var(--accent-primary)]/40 bg-[var(--bg-canvas)] text-[var(--text-primary)] font-medium'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {active ? (
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Item Selection Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-2.5">
          <div className="flex items-center flex-1 min-w-[200px] h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.controls.searchPlaceholder}
              className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
            />
          </div>

          <input
            type="text"
            dir={isFa && !shipmentFilter ? 'rtl' : 'ltr'}
            value={shipmentFilter}
            onChange={(e) => setShipmentFilter(e.target.value)}
            placeholder={t.headers.shipmentNo}
            className={`h-9 w-44 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
              isFa && !shipmentFilter ? 'text-right' : 'text-left'
            }`}
          />

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">
              {t.headers.storageLocation}: {t.controls.all}
            </option>
            {knownLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0">
              <tr>
                <th className="py-2.5 px-3 w-9 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id))}
                    onChange={toggleAll}
                  />
                </th>
                <th className="py-2.5 px-3 text-center">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3 text-center">{t.headers.packageNo}</th>
                <th className="py-2.5 px-3 text-center">{t.headers.itemNo}</th>
                <th className="py-2.5 px-3 text-center">{t.headers.description}</th>
                <th className="py-2.5 px-3 text-center">{t.headers.itemCode}</th>
                <th className="py-2.5 px-3 text-center">{t.headers.storageLocation}</th>
                <th className="py-2.5 px-3 text-center">{isFa ? 'مقدار' : 'Qty'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                      {item.shipmentNo}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                      {item.packageNo}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                      {item.itemNo}
                    </td>
                    <td className="py-2 px-3 text-center max-w-[220px] truncate bidi-plaintext">
                      {item.description || item.generalDescription}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums" dir="ltr">
                      {item.itemCode || '-'}
                    </td>
                    <td className="py-2 px-3 text-center bidi-plaintext">
                      {item.storageLocation || '-'}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums font-semibold">
                      {item.opiPending ? item.packingQty ?? '-' : item.mapnaInventory} {item.countingUnit}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Official Label Preview */}
      {labelsToRender.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[var(--text-secondary)]">
            {selectedItems.length > 0
              ? isFa
                ? 'پیش‌نمایش برچسب‌های رسمی انتخاب‌شده (MD1EX-FQP02/14-01)'
                : 'Selected Official Storage Labels Preview'
              : isFa
              ? 'پیش‌نمایش نمونه برچسب رسمی انبارش کالا (جهت چاپ موارد موردنظر را تیک بزنید)'
              : 'Sample Official Storage Label Preview (select items above to print)'}
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {labelsToRender.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-white p-3 shadow-sm"
              >
                <OfficialStorageLabelSheet
                  item={item}
                  meta={meta}
                  fields={fields}
                  formatDate={formatDate}
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Official Print Preview Modal */}
      {previewModalOpen && selectedItems.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Tag className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>
                  {isFa
                    ? `پیش‌نمایش برگ چاپی برچسب انبارش کالا (${selectedItems.length.toLocaleString('fa-IR')} برچسب)`
                    : `Storage Label Print Preview (${selectedItems.length} labels)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintLabels}
                  className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isFa ? 'چاپ برچسب‌ها' : 'Print Labels'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="h-9 w-9 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-200 dark:bg-slate-900 p-5 space-y-6">
              {printPages.map((pageItems, pageIdx) => (
                <div
                  key={pageIdx}
                  className="mx-auto bg-white text-black shadow-lg p-6 space-y-5"
                  style={{ maxWidth: '794px' }}
                >
                  {pageItems.map((item) => (
                    <OfficialStorageLabelSheet
                      key={item.id}
                      item={item}
                      meta={meta}
                      fields={fields}
                      formatDate={formatDate}
                      compact={labelsPerPage === 2}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
