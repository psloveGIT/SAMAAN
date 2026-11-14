import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  GeneralEntry,
  SubstitutionRecord,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

const MD1_STACKED_LOGO = '/assets/aistudio/______________________________65f1164c.png';

interface SubstitutionsApiResponse {
  records: SubstitutionRecord[];
  detailedItems: DetailedComputed[];
  generalEntries?: GeneralEntry[];
}

interface SubstitutionViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface OfficialRepSheetProps {
  rec: SubstitutionRecord;
  formatDate: (iso: string) => string;
}

const OfficialRepSheet: React.FC<OfficialRepSheetProps> = ({ rec, formatDate }) => {
  const unitDisplay = rec.unit?.trim() || '..................';
  const origPackageText = [rec.shipmentNo, rec.packageNo].filter(Boolean).join(' / ');
  const subPackageText = rec.substitutePackageNo?.trim() || origPackageText;
  const subDescText = `${rec.substituteDescription}${rec.substituteSize ? ` (${rec.substituteSize})` : ''}`;

  const renderSectionTable = (
    itemIndex: number,
    pkgText: string,
    descText: string,
    tagNo: string,
    qtyText: string,
    drawingNo: string,
    remarksText: string,
  ) => (
    <table
      dir="rtl"
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontSize: '9.5px',
      }}
    >
      <thead>
        <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 700 }}>
          <th style={{ width: '6%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}>
            <span dir="ltr">Item No.</span>
          </th>
          <th style={{ width: '11%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '4px 3px', lineHeight: 1.3 }}>
            <div>شماره بسته</div>
            <div dir="ltr">(PN)</div>
          </th>
          <th style={{ width: '27%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 4px' }}>
            شرح مواد/ تجهیزات
          </th>
          <th style={{ width: '7%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '4px 3px' }}>
            <span dir="ltr">Tag No.</span>
          </th>
          <th style={{ width: '7%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}>
            تعداد
          </th>
          <th style={{ width: '19%', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 4px' }}>
            شماره نقشه
          </th>
          <th style={{ width: '23%', borderBottom: '1px solid #000000', padding: '5px 4px' }}>
            توضیحات
          </th>
        </tr>
      </thead>
      <tbody>
        <tr style={{ height: '62px' }}>
          <td
            className="tabular-nums"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px' }}
          >
            {itemIndex}
          </td>
          <td
            dir="ltr"
            className="tabular-nums"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px', wordBreak: 'break-word' }}
          >
            {pkgText}
          </td>
          <td
            className="bidi-plaintext"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 6px', wordBreak: 'break-word' }}
          >
            {descText}
          </td>
          <td
            dir="ltr"
            className="tabular-nums"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px', wordBreak: 'break-word' }}
          >
            {tagNo}
          </td>
          <td
            className="tabular-nums"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 3px', fontWeight: 700 }}
          >
            {qtyText}
          </td>
          <td
            dir="ltr"
            className="tabular-nums"
            style={{ borderBottom: '1px solid #000000', borderLeft: '1px solid #000000', padding: '5px 4px', wordBreak: 'break-word' }}
          >
            {drawingNo}
          </td>
          <td
            className="bidi-plaintext"
            style={{ borderBottom: '1px solid #000000', padding: '5px 6px', wordBreak: 'break-word' }}
          >
            {remarksText}
          </td>
        </tr>
      </tbody>
    </table>
  );

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
      {/* Unified Outer Box */}
      <div style={{ border: '1.8px solid #000000' }}>
        {/* Header Row (Single unified white strip with no vertical lines) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '118px 1fr 170px',
            alignItems: 'stretch',
            borderBottom: '1.5px solid #000000',
            padding: '6px 10px',
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
              پروژه {rec.projectName?.trim() || '...............................'}
            </div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, marginTop: '2px' }}>
              جایگزینی
            </div>
            <div dir="ltr" style={{ fontSize: '11.5px', fontWeight: 700, marginTop: '2px' }}>
              Replacement Form
            </div>
          </div>

          {/* Left: شماره جایگزینی & تاریخ */}
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
              <span>شماره جایگزینی:</span>
              <span dir="ltr" className="tabular-nums">
                {rec.docNo}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
              <span>تاریخ:</span>
              <span dir="ltr" className="tabular-nums">
                {formatDate(rec.date)}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata Row 1 (5 columns RTL: شماره قرارداد/درخواست خرید | سیستم | جزیره | واحد | تامین کننده) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.9fr 0.9fr 0.85fr 1.25fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.5px',
            textAlign: 'right',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px', lineHeight: 1.45 }}>
            <strong style={{ fontWeight: 700 }}>شماره قرارداد/ درخواست خرید: </strong>
            <span dir="ltr" className="tabular-nums">
              {rec.contractNo || ''}
            </span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>سیستم: </strong>
            <span className="bidi-plaintext">{rec.system || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>جزیره: </strong>
            <span className="bidi-plaintext">{rec.island || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>واحد: </strong>
            <span className="bidi-plaintext">{rec.unit || ''}</span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>تامین کننده: </strong>
            <span className="bidi-plaintext">{rec.supplier || ''}</span>
          </div>
        </div>

        {/* Metadata Row 2 (4 columns RTL: فوریت تامین | پیمانکار نصب | شماره حواله | شماره NCR/MER) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1.15fr 1fr 1.25fr',
            borderBottom: '1px solid #000000',
            fontSize: '9.5px',
            textAlign: 'right',
            minHeight: '38px',
          }}
        >
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>فوریت تامین (عادی/اضطراری): </strong>
            <span className="bidi-plaintext">{rec.supplyUrgency || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>پیمانکار نصب: </strong>
            <span className="bidi-plaintext">{rec.installerContractor || ''}</span>
          </div>
          <div style={{ borderLeft: '1px solid #000000', padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>شماره حواله: </strong>
            <span dir="ltr" className="tabular-nums">
              {rec.mivNo || ''}
            </span>
          </div>
          <div style={{ padding: '5px 7px' }}>
            <strong style={{ fontWeight: 700 }}>
              شماره <span dir="ltr">NCR/MER</span>:{' '}
            </strong>
            <span dir="ltr" className="tabular-nums">
              {rec.merNcrNo || ''}
            </span>
          </div>
        </div>

        {/* Section الف Statement */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '8px 10px',
            fontSize: '10px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          الف- مواد / تجهیزات مشخص شده در ذیل مربوط به واحد شماره {unitDisplay} نیازمند تعویض می‌باشند:
        </div>

        {/* Section الف Table */}
        {renderSectionTable(
          1,
          origPackageText,
          rec.originalDescription,
          rec.originalItemCode || '',
          `${rec.qty} ${rec.countingUnit}`,
          rec.originalDrawingNo || '',
          rec.originalRemarks || '',
        )}

        {/* Section ب Statement */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '8px 10px',
            fontSize: '10px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          ب - مواد / تجهیزات مشخص شده ما فوق با اقلام ذیل جهت واحد شماره {unitDisplay} تعویض شدند:
        </div>

        {/* Section ب Table */}
        {renderSectionTable(
          1,
          subPackageText,
          subDescText,
          rec.substituteItemCode || '',
          `${rec.qty} ${rec.countingUnit}`,
          rec.substituteDrawingNo || '',
          rec.substituteRemarks || rec.notes || '',
        )}

        {/* علت تعویض */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            minHeight: '58px',
            padding: '6px 10px',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 700 }}>علت تعویض:</div>
          <div className="bidi-plaintext" style={{ marginTop: '4px', lineHeight: 1.7 }}>
            {rec.reason}
          </div>
        </div>

        {/* توضیحات تامین کننده */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            minHeight: '72px',
            padding: '6px 10px',
            fontSize: '9.8px',
            textAlign: 'right',
          }}
        >
          <div style={{ fontWeight: 700 }}>توضیحات تامین کننده:</div>
          {rec.supplierNotes && (
            <div className="bidi-plaintext" style={{ marginTop: '4px', lineHeight: 1.7 }}>
              {rec.supplierNotes}
            </div>
          )}
        </div>

        {/* Agreement Statement & 3 Signatures */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '10px 12px 14px',
            fontSize: '9.8px',
            lineHeight: 2,
            textAlign: 'justify',
          }}
        >
          <div>
            امضاء کنندگان ذیل توافق و تایید نمودند که مواد/ تجهیزات تعیین شده در(ب) می‌توانند به جای اقلام قید شده در(الف) مورد استفاده قرار بگیرند، از سوی دیگر مواد/ تجهیزات جایگزین می‌بایست توسط{' '}
            <span
              className="bidi-plaintext"
              style={{
                fontWeight: 700,
                display: 'inline-block',
                minWidth: '140px',
                textAlign: 'center',
              }}
            >
              {rec.reprocureBy?.trim() || '...................................................'}
            </span>{' '}
            مجدداً تهیه شده و هزینه‌های ذیربط توسط{' '}
            <span
              className="bidi-plaintext"
              style={{
                fontWeight: 700,
                display: 'inline-block',
                minWidth: '150px',
                textAlign: 'center',
              }}
            >
              {rec.costBorneBy?.trim() || '.......................................................'}
            </span>{' '}
            می‌بایست پرداخت شوند.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              marginTop: '20px',
              minHeight: '42px',
              fontSize: '9.8px',
              fontWeight: 700,
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <div>توسعه یک مپنا:</div>
              {(rec.mapnaRep || rec.approvedBy) && (
                <div className="bidi-plaintext" style={{ fontWeight: 500, fontSize: '9.2px', marginTop: '4px' }}>
                  {rec.mapnaRep || rec.approvedBy}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div>پیمانکار نصب/ راه اندازی:</div>
              {(rec.installerSignatory || rec.installerContractor) && (
                <div className="bidi-plaintext" style={{ fontWeight: 500, fontSize: '9.2px', marginTop: '4px' }}>
                  {rec.installerSignatory || rec.installerContractor}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'left', paddingLeft: '24px' }}>
              <div>تامین کننده:</div>
              {(rec.supplierSignatory || rec.supplier) && (
                <div className="bidi-plaintext" style={{ fontWeight: 500, fontSize: '9.2px', marginTop: '4px' }}>
                  {rec.supplierSignatory || rec.supplier}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* QA Control Notice */}
        <div
          style={{
            borderBottom: '1px solid #000000',
            padding: '3px 10px',
            fontSize: '8.5px',
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          توجه : این فرم تحت کنترل واحد QA میباشد و هرگونه تغییر در آن غیر مجاز بوده و منوط به اخذ مجوز از واحد QA میباشد.
        </div>

        {/* Bottom Footer Strip INSIDE outer frame */}
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
          <div>رونوشت: معاونت تامین ، فروشنده، پیمانکار نصب</div>
          <div dir="ltr" className="tabular-nums">
            MD1EX-FQP02/10-03
          </div>
        </div>
      </div>
    </div>
  );
};

export const SubstitutionView: React.FC<SubstitutionViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<SubstitutionsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [projectName, setProjectName] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [system, setSystem] = useState('');
  const [island, setIsland] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplyUrgency, setSupplyUrgency] = useState('عادی');
  const [installerContractor, setInstallerContractor] = useState('');
  const [mivNo, setMivNo] = useState('');
  const [merNcrNo, setMerNcrNo] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [originalDrawingNo, setOriginalDrawingNo] = useState('');
  const [originalRemarks, setOriginalRemarks] = useState('');

  const [substitutePackageNo, setSubstitutePackageNo] = useState('');
  const [substituteDescription, setSubstituteDescription] = useState('');
  const [substituteItemCode, setSubstituteItemCode] = useState('');
  const [substituteSize, setSubstituteSize] = useState('');
  const [substituteDrawingNo, setSubstituteDrawingNo] = useState('');
  const [substituteRemarks, setSubstituteRemarks] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [reprocureBy, setReprocureBy] = useState('');
  const [costBorneBy, setCostBorneBy] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [installerSignatory, setInstallerSignatory] = useState('');
  const [supplierSignatory, setSupplierSignatory] = useState('');
  const [status, setStatus] = useState<SubstitutionRecord['status']>('pending');
  const [notes, setNotes] = useState('');

  const [printRec, setPrintRec] = useState<SubstitutionRecord | null>(null);
  const [printReportOpen, setPrintReportOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<SubstitutionsApiResponse>('/api/substitutions');
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

  const filteredItems = useMemo(() => {
    const all = data?.detailedItems || [];
    const q = itemSearch.trim().toLowerCase();
    if (!q) return all.slice(0, 80);
    return all
      .filter((d) =>
        [d.shipmentNo, d.packageNo, d.itemNo, d.description, d.generalDescription, d.itemCode]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 80);
  }, [data, itemSearch]);

  const selectedOriginal = useMemo(
    () => (data?.detailedItems || []).find((d) => d.id === selectedItemId) || null,
    [data, selectedItemId],
  );

  const statusLabel = useCallback(
    (s: SubstitutionRecord['status']) => {
      if (s === 'executed') return isFa ? 'اجرا و تحویل شده' : 'Executed';
      if (s === 'approved') return isFa ? 'تایید مهندسی' : 'Approved';
      return isFa ? 'در انتظار تایید' : 'Pending Approval';
    },
    [isFa],
  );

  const handleSelectOriginal = (id: string) => {
    setSelectedItemId(id);
    const found = (data?.detailedItems || []).find((x) => x.id === id);
    if (!found) return;

    const genMatch =
      (data?.generalEntries || []).find(
        (g) =>
          (g.packingListNo || '').trim() === (found.shipmentNo || '').trim() &&
          (g.packageNo || '').trim() === (found.packageNo || '').trim(),
      ) ||
      (data?.generalEntries || []).find(
        (g) => (g.packingListNo || '').trim() === (found.shipmentNo || '').trim(),
      );

    if (!qty && found.packingQty) setQty(String(found.packingQty));
    if (!system.trim() && (found.system || genMatch?.system)) setSystem(found.system || genMatch?.system || '');
    if (!island.trim() && (found.island || genMatch?.island)) setIsland(found.island || genMatch?.island || '');
    if (!unit.trim() && (found.unit || genMatch?.unit)) setUnit(found.unit || genMatch?.unit || '');
    if (!supplier.trim() && (found.supplier || genMatch?.supplier)) setSupplier(found.supplier || genMatch?.supplier || '');
    if (!mivNo.trim() && (found.mivContractorNo || found.mivMapnaNo)) {
      setMivNo(found.mivContractorNo || found.mivMapnaNo || '');
    }
    if (!merNcrNo.trim() && (found.merNo || found.repNo)) {
      setMerNcrNo(found.merNo || found.repNo || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      notify('warning', isFa ? 'لطفاً کالای اصلی را انتخاب کنید.' : 'Select the original item.');
      return;
    }

    try {
      const res = await apiRequest<{ record: SubstitutionRecord }>('/api/substitutions', {
        method: 'POST',
        body: JSON.stringify({
          docNo,
          date,
          detailedId: selectedItemId,
          projectName,
          contractNo,
          system,
          island,
          unit,
          supplier,
          supplyUrgency,
          installerContractor,
          mivNo,
          merNcrNo,
          originalDrawingNo,
          originalRemarks,
          substitutePackageNo,
          substituteDescription,
          substituteItemCode,
          substituteSize,
          substituteDrawingNo,
          substituteRemarks,
          qty: Number(qty),
          reason,
          supplierNotes,
          reprocureBy,
          costBorneBy,
          approvedBy,
          mapnaRep: approvedBy,
          installerSignatory: installerSignatory || installerContractor,
          supplierSignatory: supplierSignatory || supplier,
          status,
          notes,
        }),
      });
      notify(
        'success',
        isFa
          ? `فرم جایگزینی شماره ${res.record.docNo} ثبت شد.`
          : `Substitution record ${res.record.docNo} saved.`,
      );
      setDocNo('');
      setContractNo('');
      setSystem('');
      setIsland('');
      setUnit('');
      setSupplier('');
      setSupplyUrgency('عادی');
      setInstallerContractor('');
      setMivNo('');
      setMerNcrNo('');
      setSelectedItemId('');
      setOriginalDrawingNo('');
      setOriginalRemarks('');
      setSubstitutePackageNo('');
      setSubstituteDescription('');
      setSubstituteItemCode('');
      setSubstituteSize('');
      setSubstituteDrawingNo('');
      setSubstituteRemarks('');
      setQty('');
      setReason('');
      setSupplierNotes('');
      setReprocureBy('');
      setCostBorneBy('');
      setApprovedBy('');
      setInstallerSignatory('');
      setSupplierSignatory('');
      setStatus('pending');
      setNotes('');
      setPrintRec(res.record);
      triggerAutoSnapshot(`Substitution ${res.record.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleUpdateStatus = async (rec: SubstitutionRecord, nextStatus: SubstitutionRecord['status']) => {
    try {
      await apiRequest(`/api/substitutions/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      notify('success', isFa ? 'وضعیت جایگزینی به‌روزرسانی شد.' : 'Substitution status updated.');
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<CsvColumnDef<SubstitutionRecord>[]>(
    () => [
      { key: 'docNo', header: isFa ? 'شماره جایگزینی' : 'Rep No.', getValue: (r) => r.docNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'projectName', header: isFa ? 'پروژه' : 'Project', getValue: (r) => r.projectName || '' },
      { key: 'contractNo', header: isFa ? 'شماره قرارداد' : 'Contract No.', getValue: (r) => r.contractNo || '' },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'originalDescription', header: isFa ? 'کالای اصلی (الف)' : 'Original Item (A)', getValue: (r) => r.originalDescription },
      { key: 'originalItemCode', header: isFa ? 'Tag کالای اصلی' : 'Original Tag', getValue: (r) => r.originalItemCode },
      { key: 'substituteDescription', header: isFa ? 'کالای جایگزین (ب)' : 'Substitute Item (B)', getValue: (r) => r.substituteDescription },
      { key: 'substituteItemCode', header: isFa ? 'Tag جایگزین' : 'Substitute Tag', getValue: (r) => r.substituteItemCode },
      { key: 'qty', header: isFa ? 'تعداد' : 'Qty', getValue: (r) => r.qty },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'reason', header: isFa ? 'علت تعویض' : 'Reason', getValue: (r) => r.reason },
      { key: 'status', header: isFa ? 'وضعیت' : 'Status', getValue: (r) => statusLabel(r.status) },
      { key: 'approvedBy', header: isFa ? 'تاییدکننده' : 'Approved By', getValue: (r) => r.approvedBy || '' },
    ],
    [t, isFa, statusLabel],
  );

  return (
    <div className="space-y-6">
      {/* Dedicated A4 Portrait Portal for Official MD1EX-FQP02/10-03 Replacement Form */}
      {printRec && !printReportOpen
        ? createPortal(
            <div id="samaan-rep-print-root">
              <style>{`
                @media screen {
                  #samaan-rep-print-root { display: none !important; }
                }
                @media print {
                  @page {
                    size: A4 portrait;
                    margin: 7mm;
                  }
                  body > *:not(#samaan-rep-print-root) {
                    display: none !important;
                  }
                  #samaan-rep-print-root {
                    display: block !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    width: 100%;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                  #samaan-rep-print-root table th,
                  #samaan-rep-print-root table td {
                    text-align: center;
                    vertical-align: middle;
                  }
                }
              `}</style>
              <OfficialRepSheet rec={printRec} formatDate={formatDate} />
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
              <ArrowLeftRight className="w-4 h-4 text-[var(--accent-primary)]" />
              <span>{isFa ? 'ثبت درخواست و مجوز جایگزینی تجهیزات (REP)' : 'Register Equipment Substitution Form (REP)'}</span>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]" dir="ltr">
              MD1EX-FQP02/10-03
            </span>
          </div>

          {/* Row 1: Doc No, Date, Project, Contract */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره جایگزینی (REP No.)' : 'Replacement No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="REP-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !docNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ جایگزینی' : 'Date'} *`}
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

          {/* Row 2: Search & Original Item Selection */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-4">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'جستجوی کالای اصلی (الف)' : 'Search Original Item (A)'}
              </label>
              <div className="flex items-center h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  dir={!itemSearch ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={isFa ? 'پکینگ، شرح یا کد کالا...' : 'Packing, desc or code...'}
                  className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
                />
              </div>
            </div>

            <div className="lg:col-span-8">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انتخاب کالای اصلی نیازمند تعویض (بخش الف)' : 'Select Original Item (Section A)'} *
              </label>
              <select
                required
                value={selectedItemId}
                onChange={(e) => handleSelectOriginal(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{isFa ? 'یک کالا انتخاب کنید...' : 'Select item...'}</option>
                {filteredItems.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shipmentNo} / {d.packageNo} #{d.itemNo} — {(d.description || d.generalDescription).slice(0, 50)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedOriginal && (
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs flex flex-wrap items-center gap-x-5 gap-y-1">
              <span>
                <strong className="text-[var(--text-muted)]">{t.headers.description}:</strong>{' '}
                <span className="bidi-plaintext">{selectedOriginal.description || selectedOriginal.generalDescription}</span>
              </span>
              {selectedOriginal.itemCode && (
                <span>
                  <strong className="text-[var(--text-muted)]">{t.headers.itemCode}:</strong>{' '}
                  <span dir="ltr" className="tabular-nums">{selectedOriginal.itemCode}</span>
                </span>
              )}
              <span>
                <strong className="text-[var(--text-muted)]">{t.headers.countingUnit}:</strong>{' '}
                {selectedOriginal.countingUnit || 'PC'}
              </span>
            </div>
          )}

          {/* Row 3: System, Island, Unit, Supplier, Urgency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                {isFa ? 'فوریت تامین (عادی/اضطراری)' : 'Supply Urgency'}
              </label>
              <select
                value={supplyUrgency}
                onChange={(e) => setSupplyUrgency(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="عادی">{isFa ? 'عادی' : 'Normal'}</option>
                <option value="اضطراری">{isFa ? 'اضطراری' : 'Urgent'}</option>
              </select>
            </div>
          </div>

          {/* Row 4: Installer, MIV No, NCR/MER No, Original Drawing, Original Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پیمانکار نصب' : 'Installer Contractor'}
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
                {isFa ? 'شماره حواله' : 'MIV No.'}
              </label>
              <input
                type="text"
                dir={isFa && !mivNo ? 'rtl' : 'ltr'}
                value={mivNo}
                onChange={(e) => setMivNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !mivNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره NCR/MER' : 'NCR/MER No.'}
              </label>
              <input
                type="text"
                dir={isFa && !merNcrNo ? 'rtl' : 'ltr'}
                value={merNcrNo}
                onChange={(e) => setMerNcrNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !merNcrNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره نقشه کالای اصلی (الف)' : 'Original Drawing No.'}
              </label>
              <input
                type="text"
                dir={isFa && !originalDrawingNo ? 'rtl' : 'ltr'}
                value={originalDrawingNo}
                onChange={(e) => setOriginalDrawingNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !originalDrawingNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'توضیحات کالای اصلی (الف)' : 'Original Remarks'}
              </label>
              <input
                type="text"
                dir={!originalRemarks ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={originalRemarks}
                onChange={(e) => setOriginalRemarks(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Row 5: Substitute Item (Section ب) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شرح کالای جایگزین (بخش ب)' : 'Substitute Description (B)'} *
              </label>
              <input
                type="text"
                required
                dir={!substituteDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={substituteDescription}
                onChange={(e) => setSubstituteDescription(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره بسته جایگزین (PN)' : 'Substitute PN'}
              </label>
              <input
                type="text"
                dir={isFa && !substitutePackageNo ? 'rtl' : 'ltr'}
                value={substitutePackageNo}
                onChange={(e) => setSubstitutePackageNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !substitutePackageNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'Tag No. جایگزین' : 'Substitute Tag No.'}
              </label>
              <input
                type="text"
                dir={isFa && !substituteItemCode ? 'rtl' : 'ltr'}
                value={substituteItemCode}
                onChange={(e) => setSubstituteItemCode(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !substituteItemCode ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'سایز / مشخصات جایگزین' : 'Substitute Size'}
              </label>
              <input
                type="text"
                dir={!substituteSize ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={substituteSize}
                onChange={(e) => setSubstituteSize(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تعداد' : 'Qty'} *
              </label>
              <input
                type="number"
                step="any"
                min="0.0001"
                required
                dir={isFa && !qty ? 'rtl' : 'ltr'}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !qty ? 'text-right' : 'text-left'
                }`}
              />
            </div>
          </div>

          {/* Row 6: Substitute Drawing, Substitute Remarks, Reason, Supplier Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره نقشه جایگزین (ب)' : 'Substitute Drawing No.'}
              </label>
              <input
                type="text"
                dir={isFa && !substituteDrawingNo ? 'rtl' : 'ltr'}
                value={substituteDrawingNo}
                onChange={(e) => setSubstituteDrawingNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !substituteDrawingNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'توضیحات جایگزین (ب)' : 'Substitute Remarks'}
              </label>
              <input
                type="text"
                dir={!substituteRemarks ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={substituteRemarks}
                onChange={(e) => setSubstituteRemarks(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'علت تعویض' : 'Reason for Replacement'} *
              </label>
              <input
                type="text"
                required
                dir={!reason ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isFa ? 'کسری موجودی / تغییر فنی مهندسی...' : 'Shortage / Engineering change...'}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'توضیحات تامین کننده' : 'Supplier Notes'}
              </label>
              <input
                type="text"
                dir={!supplierNotes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={supplierNotes}
                onChange={(e) => setSupplierNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Row 7: Re-procurement / Cost Responsibilities & Signatories */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تهیه مجدد توسط' : 'Re-procured By'}
              </label>
              <input
                type="text"
                dir={!reprocureBy ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={reprocureBy}
                onChange={(e) => setReprocureBy(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پرداخت هزینه توسط' : 'Cost Borne By'}
              </label>
              <input
                type="text"
                dir={!costBorneBy ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={costBorneBy}
                onChange={(e) => setCostBorneBy(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'امضا توسعه یک مپنا' : 'MAPNA MD1 Signatory'}
              </label>
              <input
                type="text"
                dir={!approvedBy ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'امضا پیمانکار نصب/راه‌اندازی' : 'Installer Signatory'}
              </label>
              <input
                type="text"
                dir={!installerSignatory ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={installerSignatory}
                onChange={(e) => setInstallerSignatory(e.target.value)}
                placeholder={installerContractor || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'امضا تامین کننده' : 'Supplier Signatory'}
              </label>
              <input
                type="text"
                dir={!supplierSignatory ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={supplierSignatory}
                onChange={(e) => setSupplierSignatory(e.target.value)}
                placeholder={supplier || ''}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'وضعیت جایگزینی' : 'Status'}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SubstitutionRecord['status'])}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="pending">{statusLabel('pending')}</option>
                <option value="approved">{statusLabel('approved')}</option>
                <option value="executed">{statusLabel('executed')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
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

            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFa ? 'ثبت سند جایگزینی و چاپ' : 'Save & Print Substitution'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Substitutions History */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق جایگزینی تجهیزات (REP)' : 'Equipment Substitution History'}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv({
                  rows: data?.records || [],
                  columns: reportColumns,
                  filename: 'samaan-substitutions',
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
                <th className="py-2.5 px-3">{isFa ? 'شماره جایگزینی' : 'Rep No.'}</th>
                <th className="py-2.5 px-3">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-3">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3">{isFa ? 'کالای اصلی (الف)' : 'Original (A)'}</th>
                <th className="py-2.5 px-3">{isFa ? 'کالای جایگزین (ب)' : 'Substitute (B)'}</th>
                <th className="py-2.5 px-3">{isFa ? 'تعداد' : 'Qty'}</th>
                <th className="py-2.5 px-3">{isFa ? 'وضعیت' : 'Status'}</th>
                <th className="py-2.5 px-3">{isFa ? 'عملیات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : (data?.records || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                (data?.records || []).map((rec) => (
                  <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-3 font-semibold tabular-nums" dir="ltr">
                      {rec.docNo}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                      {formatDate(rec.date)}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                      {rec.shipmentNo} / {rec.packageNo} #{rec.itemNo}
                    </td>
                    <td className="py-2.5 px-3 max-w-[180px] truncate bidi-plaintext">
                      {rec.originalDescription}
                    </td>
                    <td className="py-2.5 px-3 max-w-[180px] truncate bidi-plaintext">
                      {rec.substituteDescription}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-semibold">
                      {rec.qty} {rec.countingUnit}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          rec.status === 'executed'
                            ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                            : rec.status === 'approved'
                              ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                              : 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                        }`}
                      >
                        {statusLabel(rec.status)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="inline-flex items-center gap-1.5">
                        {canEdit && rec.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(rec, 'approved')}
                            className="h-7 px-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold"
                          >
                            {isFa ? 'تایید' : 'Approve'}
                          </button>
                        )}
                        {canEdit && rec.status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(rec, 'executed')}
                            className="h-7 px-2 rounded-lg bg-[var(--status-success-bg)] text-[var(--status-success)] text-[11px] font-semibold"
                          >
                            {isFa ? 'اجرا شد' : 'Execute'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrintRec(rec)}
                          className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{t.controls.print}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Official MD1EX-FQP02/10-03 Replacement Form Modal */}
      {printRec && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4 max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold">
                  {isFa ? 'فرم رسمی جایگزینی تجهیزات (Replacement Form)' : 'Official Equipment Substitution Form'}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                  MD1EX-FQP02/10-03 · {printRec.docNo}
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
                  onClick={() => setPrintRec(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 bg-neutral-200/70 dark:bg-neutral-900/60 p-4 rounded-xl">
              <div className="mx-auto max-w-[790px] bg-white p-5 shadow-lg rounded-sm">
                <OfficialRepSheet rec={printRec} formatDate={formatDate} />
              </div>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printReportOpen}
        onClose={() => setPrintReportOpen(false)}
        title={t.nav.substitution}
        columns={reportColumns}
        rows={data?.records || []}
      />
    </div>
  );
};
