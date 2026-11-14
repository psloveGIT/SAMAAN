import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, FileSpreadsheet, Printer, Scale, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { MD1_STACKED_LOGO } from '../lib/assets.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { roundQty, toNum } from '../shared/formulas.ts';
import type { DetailedComputed, MaterialEstimateRecord } from '../shared/types.ts';
import { PrintReportModal } from './PrintReportModal.tsx';

interface BalanceViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

const BALANCE_STATUS_PAIRS: { fa: string; en: string }[] = [
  { fa: 'تایید شده', en: 'Balanced' },
  { fa: 'در دست بررسی', en: 'Open / Pending' },
  { fa: 'مغایرت / کسری', en: 'Shortage Claim' },
  { fa: 'مختومه', en: 'Closed' },
];

export function localizeBalanceStatus(raw: string | undefined, isFa: boolean): string {
  const val = (raw || '').trim();
  if (!val) return '';
  const lower = val.toLowerCase();
  if (val === 'مغایرت') return isFa ? 'مغایرت / کسری' : 'Shortage Claim';
  for (const pair of BALANCE_STATUS_PAIRS) {
    if (pair.fa === val || pair.en.toLowerCase() === lower) {
      return isFa ? pair.fa : pair.en;
    }
  }
  return val;
}

interface BmrFormMeta {
  projectName: string;
  system: string;
  island: string;
  unit: string;
  installerContractor: string;
  supplier: string;
  storekeeper: string;
  equipmentSupply: string;
  techOffice: string;
  installationUnit: string;
  contractorPm: string;
}

interface OfficialBmrSheetProps {
  rows: DetailedComputed[];
  estimates: MaterialEstimateRecord[];
  meta: BmrFormMeta;
}

const OfficialBmrSheet: React.FC<OfficialBmrSheetProps> = ({ rows, estimates, meta }) => {
  const estimateLookup = useMemo(() => {
    const byMto = new Map<string, number>();
    const byCode = new Map<string, number>();
    for (const est of estimates) {
      if (est.mtoCode) {
        byMto.set(est.mtoCode.trim().toLowerCase(), roundQty((byMto.get(est.mtoCode.trim().toLowerCase()) || 0) + toNum(est.estimatedQty)));
      }
      if (est.itemCode) {
        byCode.set(est.itemCode.trim().toLowerCase(), roundQty((byCode.get(est.itemCode.trim().toLowerCase()) || 0) + toNum(est.estimatedQty)));
      }
    }
    return { byMto, byCode };
  }, [estimates]);

  const minRows = 6;
  const totalDisplayRows = Math.max(minRows, rows.length);
  const paddedRows: (DetailedComputed | null)[] = [
    ...rows,
    ...Array.from({ length: Math.max(0, totalDisplayRows - rows.length) }, () => null),
  ];

  const getMtoQtyText = (row: DetailedComputed): string => {
    const mtoKey = (row.mtoRef || '').trim().toLowerCase();
    const codeKey = (row.itemCode || '').trim().toLowerCase();
    if (mtoKey && estimateLookup.byMto.has(mtoKey)) {
      return String(estimateLookup.byMto.get(mtoKey));
    }
    if (codeKey && estimateLookup.byCode.has(codeKey)) {
      return String(estimateLookup.byCode.get(codeKey));
    }
    if (row.mtoRef && Number.isFinite(Number(row.mtoRef))) {
      return String(Number(row.mtoRef));
    }
    return row.mtoRef || '';
  };

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
        {/* Header Row (Unified white strip with no internal vertical dividers) */}
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
              پروژه {meta.projectName.trim() || '..................'}
            </div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '2px' }}>
              گزارش موازنه و کنترل مصرف مواد
            </div>
            <div dir="ltr" style={{ fontSize: '11.5px', fontWeight: 700, marginTop: '2px' }}>
              Balance of Material Report
            </div>
          </div>

          <div />
        </div>

        {/* Metadata Strip Row 1 (4 bordered cells RTL: سیستم | جزیره | واحد | پروژه) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '26.5% 20.3% 25.5% 27.7%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>سیستم: </strong>
            <span className="bidi-plaintext">{meta.system}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{meta.island}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{meta.unit}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>پروژه: </strong>
            <span className="bidi-plaintext">{meta.projectName}</span>
          </div>
        </div>

        {/* Metadata Strip Row 2 (2 bordered cells RTL: پیمانکار نصب | تامین کننده) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '46.8% 53.2%',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>پیمانکار نصب: </strong>
            <span className="bidi-plaintext">{meta.installerContractor}</span>
          </div>
          <div style={{ padding: '5px 8px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{meta.supplier}</span>
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
                No.
              </th>
              <th style={{ width: '6.2%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                PL No.
              </th>
              <th style={{ width: '6.4%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Package No.
              </th>
              <th style={{ width: '6.6%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Package Item No.
              </th>
              <th style={{ width: '7.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Tag No.
              </th>
              <th style={{ width: '23.5%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '5px 4px' }}>
                Description
              </th>
              <th style={{ width: '5.2%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                UOM
              </th>
              <th style={{ width: '6.8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Received Qty
              </th>
              <th style={{ width: '7%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Total Delivered Qty
              </th>
              <th style={{ width: '7%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Total Returned Qty
              </th>
              <th style={{ width: '6.8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Total MTO Qty
              </th>
              <th style={{ width: '6.8%', borderBottom: '1px solid #000000', borderRight: '1px solid #000000', padding: '4px 2px' }}>
                Total Erected Qty
              </th>
              <th style={{ width: '6.4%', borderBottom: '1px solid #000000', padding: '5px 2px' }}>
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, idx) => {
              const isLast = idx === paddedRows.length - 1;
              const rowBottomBorder = isLast ? 'none' : '1px solid #000000';
              const receivedQty = row
                ? row.opiPending
                  ? row.packingQty ?? 0
                  : row.effectiveActualQty
                : '';
              const deliveredQty = row
                ? roundQty(toNum(row.gcvDeliveredQty) + toNum(row.mivMapnaQty))
                : '';
              const returnedQty = row
                ? roundQty(toNum(row.smrContractorQty) + toNum(row.smrMapnaQty))
                : '';
              const mtoQty = row ? getMtoQtyText(row) : '';
              const erectedQty = row
                ? roundQty(Math.max(0, toNum(row.mivContractorQty) - toNum(row.smrContractorQty)))
                : '';
              const balanceQty = row
                ? roundQty(row.mapnaInventory + row.contractorInventory)
                : '';

              return (
                <tr key={row ? row.id : `empty-${idx}`} style={{ height: '29px' }}>
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
                    {row?.shipmentNo || ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {row?.packageNo || ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {row?.itemNo || ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px', wordBreak: 'break-word' }}
                  >
                    {row?.itemCode || ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 4px', wordBreak: 'break-word' }}
                  >
                    {row ? row.description || row.generalDescription : ''}
                  </td>
                  <td
                    className="bidi-plaintext"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {row?.countingUnit || ''}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {receivedQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {deliveredQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {returnedQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {mtoQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, borderRight: '1px solid #000000', padding: '3px 2px' }}
                  >
                    {erectedQty}
                  </td>
                  <td
                    className="tabular-nums"
                    style={{ borderBottom: rowBottomBorder, padding: '3px 2px', fontWeight: 700 }}
                  >
                    {balanceQty}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Separate Lower Approval Frame (outer border encloses امضاء, titles, sign boxes, QA note, and footer strip) */}
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

        {/* Row 2: 5 Role Headers RTL (centered) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.8px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '4px 6px' }}>انباردار</div>
          <div style={{ borderLeft: '1px solid #000000', padding: '4px 6px' }}>تأمین تجهیزات توسعه یک</div>
          <div style={{ borderLeft: '1px solid #000000', padding: '4px 6px' }}>دفتر فنی</div>
          <div style={{ borderLeft: '1px solid #000000', padding: '4px 6px' }}>واحد نصب</div>
          <div style={{ padding: '4px 6px' }}>مدیر پروژه پیمانکار نصب</div>
        </div>

        {/* Row 3: 5 Signature Cells RTL */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
            minHeight: '64px',
            borderBottom: '1px solid #000000',
            fontSize: '9.3px',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600 }}>تاریخ و امضاء:</div>
            <div className="bidi-plaintext" style={{ fontSize: '9px' }}>
              {meta.storekeeper}
            </div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600 }}>تاریخ و امضاء:</div>
            <div className="bidi-plaintext" style={{ fontSize: '9px' }}>
              {meta.equipmentSupply}
            </div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600 }}>تاریخ و امضاء:</div>
            <div className="bidi-plaintext" style={{ fontSize: '9px' }}>
              {meta.techOffice}
            </div>
          </div>

          <div
            style={{
              borderLeft: '1px solid #000000',
              padding: '5px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600 }}>تاریخ و امضاء:</div>
            <div className="bidi-plaintext" style={{ fontSize: '9px' }}>
              {meta.installationUnit}
            </div>
          </div>

          <div
            style={{
              padding: '5px 8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontWeight: 600 }}>تاریخ و امضاء:</div>
            <div className="bidi-plaintext" style={{ fontSize: '9px' }}>
              {meta.contractorPm}
            </div>
          </div>
        </div>

        {/* Row 4: QA Control Note */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '4px 10px',
            fontSize: '8.5px',
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          توجه: این فرم تحت کنترل واحد QA میباشد و هر گونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QAمیباشد.
        </div>

        {/* Row 5: Footer Strip INSIDE outer box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            fontSize: '9px',
            fontWeight: 700,
          }}
        >
          <div>رونوشت: معاونت تامین ، پیمانکار نصب، دفتر فنی</div>
          <div dir="ltr" className="tabular-nums">
            MD1EX-FQP02/09-03
          </div>
        </div>
      </div>
    </div>
  );
};

export const BalanceView: React.FC<BalanceViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [items, setItems] = useState<DetailedComputed[]>([]);
  const [estimates, setEstimates] = useState<MaterialEstimateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [bmrModalOpen, setBmrModalOpen] = useState(false);

  const [materialBalanceNo, setMaterialBalanceNo] = useState('');
  const [balanceStatus, setBalanceStatus] = useState('');

  const [bmrMeta, setBmrMeta] = useState<BmrFormMeta>({
    projectName: '',
    system: '',
    island: '',
    unit: '',
    installerContractor: '',
    supplier: '',
    storekeeper: '',
    equipmentSupply: '',
    techOffice: '',
    installationUnit: '',
    contractorPm: '',
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
      const [detRes, estRes] = await Promise.all([
        apiRequest<{ items: DetailedComputed[] }>(`/api/detailed?${params.toString()}`),
        apiRequest<{ records: MaterialEstimateRecord[] }>('/api/estimations').catch(() => ({
          records: [] as MaterialEstimateRecord[],
        })),
      ]);
      setItems(detRes.items || []);
      setEstimates(estRes.records || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [q, shipmentFilter, notify]);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshSignal]);

  const statusPresets = useMemo(
    () => BALANCE_STATUS_PAIRS.map((p) => (isFa ? p.fa : p.en)),
    [isFa],
  );

  const filtered = useMemo(() => {
    if (!statusFilter) return items;
    if (statusFilter === '__EMPTY__') return items.filter((i) => !i.balanceStatus);
    return items.filter((i) => localizeBalanceStatus(i.balanceStatus, isFa) === statusFilter);
  }, [items, statusFilter, isFa]);

  const knownStatuses = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((i) => localizeBalanceStatus(i.balanceStatus, isFa))
            .filter(Boolean),
        ),
      ),
    [items, isFa],
  );

  const toggleAll = () => {
    const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id));
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((i) => i.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم انتخاب کنید.' : 'Select at least one item.');
      return;
    }
    if (!materialBalanceNo.trim() && !balanceStatus.trim()) {
      notify(
        'warning',
        isFa ? 'شماره موازنه یا وضعیت را وارد کنید.' : 'Enter Balance No. or Status.',
      );
      return;
    }

    try {
      const normalizedStatus = localizeBalanceStatus(balanceStatus, isFa);
      const res = await apiRequest<{ updatedCount: number }>('/api/balance/assign', {
        method: 'POST',
        body: JSON.stringify({
          detailedIds: selectedIds,
          materialBalanceNo,
          balanceStatus: normalizedStatus,
        }),
      });
      notify(
        'success',
        isFa
          ? `گزارش موازنه و کنترل مصرف مواد برای ${res.updatedCount.toLocaleString('fa-IR')} قلم ثبت شد.`
          : `Material balance assigned to ${res.updatedCount} items.`,
      );
      setSelectedIds([]);
      triggerAutoSnapshot(`Balance ${materialBalanceNo || normalizedStatus}`);
      onDataChanged();
      loadItems();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<CsvColumnDef<DetailedComputed>[]>(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, getValue: (r) => r.rowNo },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'description', header: t.headers.description, getValue: (r) => r.description || r.generalDescription },
      { key: 'itemCode', header: t.headers.itemCode, getValue: (r) => r.itemCode },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'packingQty', header: t.headers.packingQty, getValue: (r) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, getValue: (r) => r.actualQty },
      { key: 'shortage', header: t.headers.shortage, getValue: (r) => (r.shortage > 0 ? r.shortage : 0) },
      { key: 'damagedQty', header: t.headers.damagedQty, getValue: (r) => r.damagedQty },
      { key: 'mapnaInventory', header: t.headers.mapnaInventory, getValue: (r) => (r.opiPending ? '' : r.mapnaInventory) },
      { key: 'contractorInventory', header: t.headers.contractorInventory, getValue: (r) => (r.opiPending ? '' : r.contractorInventory) },
      { key: 'materialBalanceNo', header: t.headers.materialBalanceNo, getValue: (r) => r.materialBalanceNo },
      {
        key: 'balanceStatus',
        header: t.headers.balanceStatus,
        getValue: (r) => localizeBalanceStatus(r.balanceStatus, isFa),
      },
    ],
    [t, isFa],
  );

  const printRows = useMemo(
    () => (selectedIds.length > 0 ? filtered.filter((r) => selectedIds.includes(r.id)) : filtered),
    [filtered, selectedIds],
  );

  const openOfficialBmrModal = () => {
    const first = printRows[0];
    setBmrMeta((prev) => ({
      ...prev,
      system: prev.system || (first?.system || ''),
      island: prev.island || (first?.island || ''),
      unit: prev.unit || (first?.unit || ''),
      supplier: prev.supplier || (first?.supplier || ''),
    }));
    setBmrModalOpen(true);
  };

  const handleExportCsv = () => {
    exportRowsToCsv({
      rows: printRows,
      columns: reportColumns,
      filename: 'samaan-material-balance',
      calendar: prefs.calendar,
      hideEmptyColumns: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Dedicated A4 Landscape Portal for Official MD1EX-FQP02/09-03 BMR Sheet */}
      {bmrModalOpen && !printOpen
        ? createPortal(
            <div id="samaan-bmr-print-root">
              <style>{`
                @media screen {
                  #samaan-bmr-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 landscape;
                    margin: 7mm;
                  }
                  body > *:not(#samaan-bmr-print-root) {
                    display: none !important;
                  }
                  #samaan-bmr-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-bmr-print-root table th,
                  #samaan-bmr-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialBmrSheet rows={printRows} estimates={estimates} meta={bmrMeta} />
            </div>,
            document.body,
          )
        : null}

      {canEdit && (
        <form
          onSubmit={handleAssign}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Scale className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{t.nav.balance}</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              MD1EX-FQP02/09-03
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.materialBalanceNo}
              </label>
              <input
                type="text"
                dir={isFa && !materialBalanceNo ? 'rtl' : 'ltr'}
                value={materialBalanceNo}
                onChange={(e) => setMaterialBalanceNo(e.target.value)}
                placeholder="MB-2026-01"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !materialBalanceNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.balanceStatus}
              </label>
              <input
                type="text"
                dir={!balanceStatus ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                list="balance-status-datalist"
                value={balanceStatus}
                onChange={(e) => setBalanceStatus(e.target.value)}
                placeholder={isFa ? 'تایید شده / در دست بررسی...' : 'Balanced / Pending...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <datalist id="balance-status-datalist">
                {statusPresets.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>

            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isFa
                  ? `ثبت برای ${selectedIds.length.toLocaleString('fa-IR')} قلم`
                  : `Apply to ${selectedIds.length} Items`}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Filters & Selection Table */}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.balanceStatus}: {t.controls.all}</option>
            <option value="__EMPTY__">{isFa ? 'بدون وضعیت موازنه' : 'Unassigned'}</option>
            {knownStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={openOfficialBmrModal}
            className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isFa ? 'صدور فرم رسمی BMR' : 'Official BMR Form'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.controls.exportCsv}</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.controls.printReport}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                {canEdit && (
                  <th className="py-2.5 px-3 w-9">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((i) => selectedIds.includes(i.id))}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="py-2.5 px-3">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3">{t.headers.packageNo}</th>
                <th className="py-2.5 px-3">{t.headers.itemNo}</th>
                <th className="py-2.5 px-3">{t.headers.description}</th>
                <th className="py-2.5 px-3">{t.headers.packingQty}</th>
                <th className="py-2.5 px-3">{t.headers.actualQty}</th>
                <th className="py-2.5 px-3">{t.headers.shortage}</th>
                <th className="py-2.5 px-3">{t.headers.materialBalanceNo}</th>
                <th className="py-2.5 px-3">{t.headers.balanceStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const localizedStatus = localizeBalanceStatus(item.balanceStatus, isFa);
                  return (
                    <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                      {canEdit && (
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleOne(item.id)}
                          />
                        </td>
                      )}
                      <td className="py-2 px-3 tabular-nums" dir="ltr">
                        {item.shipmentNo}
                      </td>
                      <td className="py-2 px-3 tabular-nums" dir="ltr">
                        {item.packageNo}
                      </td>
                      <td className="py-2 px-3 tabular-nums" dir="ltr">
                        {item.itemNo}
                      </td>
                      <td className="py-2 px-3 max-w-[220px] truncate bidi-plaintext">
                        {item.description || item.generalDescription}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{item.packingQty ?? '-'}</td>
                      <td className="py-2 px-3 tabular-nums">{item.actualQty ?? '-'}</td>
                      <td
                        className={`py-2 px-3 tabular-nums ${
                          item.hasShortage ? 'font-bold text-[var(--status-danger)]' : ''
                        }`}
                      >
                        {item.shortage > 0 ? item.shortage : '-'}
                      </td>
                      <td className="py-2 px-3 tabular-nums font-medium" dir="ltr">
                        {item.materialBalanceNo || '-'}
                      </td>
                      <td className="py-2 px-3 bidi-plaintext">{localizedStatus || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Official MD1EX-FQP02/09-03 BMR Landscape Modal */}
      {bmrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-6xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی گزارش موازنه و کنترل مصرف مواد (BMR)' : 'Official Balance of Material Report (BMR)'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/09-03 · {printRows.length} {isFa ? 'ردیف' : 'rows'}
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
                  onClick={() => setBmrModalOpen(false)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Header & Signatory Inputs for Official BMR Form */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs shrink-0">
              <input
                type="text"
                dir={!bmrMeta.projectName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.projectName}
                onChange={(e) => setBmrMeta((p) => ({ ...p, projectName: e.target.value }))}
                placeholder={isFa ? 'پروژه...' : 'Project...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.system}
                onChange={(e) => setBmrMeta((p) => ({ ...p, system: e.target.value }))}
                placeholder={isFa ? 'سیستم...' : 'System...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.island}
                onChange={(e) => setBmrMeta((p) => ({ ...p, island: e.target.value }))}
                placeholder={isFa ? 'جزیره...' : 'Island...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.unit}
                onChange={(e) => setBmrMeta((p) => ({ ...p, unit: e.target.value }))}
                placeholder={isFa ? 'واحد...' : 'Unit...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.installerContractor ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.installerContractor}
                onChange={(e) => setBmrMeta((p) => ({ ...p, installerContractor: e.target.value }))}
                placeholder={isFa ? 'پیمانکار نصب...' : 'Installer...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.supplier}
                onChange={(e) => setBmrMeta((p) => ({ ...p, supplier: e.target.value }))}
                placeholder={isFa ? 'تامین کننده...' : 'Supplier...'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.storekeeper ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.storekeeper}
                onChange={(e) => setBmrMeta((p) => ({ ...p, storekeeper: e.target.value }))}
                placeholder={isFa ? 'امضا: انباردار' : 'Sign: Storekeeper'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.equipmentSupply ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.equipmentSupply}
                onChange={(e) => setBmrMeta((p) => ({ ...p, equipmentSupply: e.target.value }))}
                placeholder={isFa ? 'تأمین تجهیزات توسعه یک' : 'Sign: Equip Supply'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.techOffice ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.techOffice}
                onChange={(e) => setBmrMeta((p) => ({ ...p, techOffice: e.target.value }))}
                placeholder={isFa ? 'امضا: دفتر فنی' : 'Sign: Tech Office'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.installationUnit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.installationUnit}
                onChange={(e) => setBmrMeta((p) => ({ ...p, installationUnit: e.target.value }))}
                placeholder={isFa ? 'امضا: واحد نصب' : 'Sign: Installation Unit'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
              />
              <input
                type="text"
                dir={!bmrMeta.contractorPm ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={bmrMeta.contractorPm}
                onChange={(e) => setBmrMeta((p) => ({ ...p, contractorPm: e.target.value }))}
                placeholder={isFa ? 'مدیر پروژه پیمانکار نصب' : 'Contractor PM'}
                className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext sm:col-span-2"
              />
            </div>

            <div className="overflow-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto min-w-[940px] max-w-[1060px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialBmrSheet rows={printRows} estimates={estimates} meta={bmrMeta} />
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.balance}
        columns={reportColumns}
        rows={printRows}
      />
    </div>
  );
};
