import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileWarning,
  Printer,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  DetailedComputed,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
} from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

interface OpiMinutesApiResponse {
  minutes: OpiMinutesRecord[];
  osdrReports: OsdrReportRecord[];
  invitations: OpiInvitationRecord[];
  detailedItems: DetailedComputed[];
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
  const [packingListNo, setPackingListNo] = useState('');
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [mapnaInspector, setMapnaInspector] = useState('');
  const [employerInspector, setEmployerInspector] = useState('');
  const [contractorInspector, setContractorInspector] = useState('');
  const [qcInspector, setQcInspector] = useState('');
  const [resultStatus, setResultStatus] = useState<'compliant' | 'has_discrepancy'>('compliant');
  const [notes, setNotes] = useState('');
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

  // Auto-fill packingListNo / location / date when linking an invitation
  const handleInvitationChange = (invNo: string) => {
    setInvitationNo(invNo);
    if (!invNo) return;
    const inv = (data?.invitations || []).find((i) => i.invitationNo === invNo);
    if (inv) {
      if (inv.packingNos.length > 0 && !packingListNo) {
        setPackingListNo(inv.packingNos[0]);
      }
      if (inv.location && !location) setLocation(inv.location);
      if (inv.date) setDate(inv.date);
    }
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
    setSelectedPackages((prev) =>
      prev.includes(pkg) ? prev.filter((x) => x !== pkg) : [...prev, pkg],
    );
  };

  const handleSaveMinutes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ record: OpiMinutesRecord }>('/api/opi-minutes', {
        method: 'POST',
        body: JSON.stringify({
          minutesNo,
          invitationNo,
          date,
          packingListNo,
          packageNos: selectedPackages.length > 0 ? selectedPackages : packagesForSelectedPacking,
          location,
          mapnaInspector,
          employerInspector,
          contractorInspector,
          qcInspector,
          resultStatus,
          notes,
        }),
      });
      notify(
        'success',
        isFa
          ? `صورتجلسه گشایش و بازرسی شماره ${res.record.minutesNo} ثبت شد.`
          : `Inspection Minutes ${res.record.minutesNo} saved.`,
      );
      setMinutesNo('');
      setInvitationNo('');
      setSelectedPackages([]);
      setLocation('');
      setNotes('');
      setPrintMinutes(res.record);
      triggerAutoSnapshot(`OPI Minutes ${res.record.minutesNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Discrepancy items eligible for OSDR
  const discrepancyItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter(
      (d) => d.hasShortage || d.hasDamaged || d.surplus > 0,
    );
    if (!osdrPackingNo) return all;
    return all.filter((d) => d.shipmentNo === osdrPackingNo);
  }, [data, osdrPackingNo]);

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
    const sample = (data?.detailedItems || []).find((d) => d.shipmentNo === pk && d.supplier);
    if (sample && !osdrSupplier) setOsdrSupplier(sample.supplier);
    const matchingMin = (data?.minutes || []).find((m) => m.packingListNo === pk);
    if (matchingMin && !osdrMinutesNo) setOsdrMinutesNo(matchingMin.minutesNo);
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

    try {
      const res = await apiRequest<{ report: OsdrReportRecord }>('/api/osdr', {
        method: 'POST',
        body: JSON.stringify({
          reportNo: osdrReportNo,
          date: osdrDate,
          opiMinutesNo: osdrMinutesNo,
          packingListNo: osdrPackingNo || chosen[0].shipmentNo,
          supplier: osdrSupplier || chosen[0].supplier,
          items: itemsPayload,
          notes: osdrNotes,
        }),
      });
      notify(
        'success',
        isFa
          ? `گزارش مغایرت، کسری و آسیب‌دیدگی شماره ${res.report.reportNo} ثبت شد.`
          : `OSDR Report ${res.report.reportNo} issued.`,
      );
      setOsdrReportNo('');
      setOsdrNotes('');
      setOsdrSelectedIds({});
      setOsdrRemarks({});
      setPrintOsdr(res.report);
      triggerAutoSnapshot(`OSDR ${res.report.reportNo}`);
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

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className={`${anyPrintModalOpen ? 'print:hidden' : ''} flex flex-wrap items-center gap-2`}>
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
        <div className={`space-y-6 ${anyPrintModalOpen ? 'print:hidden' : ''}`}>
          {canEdit && (
            <form
              onSubmit={handleSaveMinutes}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
            >
              <h3 className="text-sm font-bold">
                {isFa ? 'ثبت صورتجلسه گشایش و بازرسی بسته‌ها' : 'Record Package Opening & Inspection Minutes'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره صورتجلسه' : 'Minutes No.'} *
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
                  label={`${isFa ? 'تاریخ بازرسی' : 'Inspection Date'} *`}
                  value={date}
                  onChange={setDate}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'شماره دعوتنامه مرتبط' : 'Related Invitation No.'}
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
                      setPackingListNo(e.target.value);
                      setSelectedPackages([]);
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
                      {isFa ? 'منطبق با اسناد و بدون مغایرت' : 'Compliant / No Discrepancy'}
                    </option>
                    <option value="has_discrepancy">
                      {isFa ? 'دارای مغایرت، کسری یا آسیب‌دیدگی (نیازمند OSDR)' : 'Discrepancy / Damage Found (Requires OSDR)'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'محل بازرسی' : 'Inspection Location'}
                  </label>
                  <input
                    type="text"
                    dir={!location ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'بازرس / نماینده مپنا' : 'MAPNA Inspector'}
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
                    {isFa ? 'نماینده کارفرما' : 'Employer Inspector'}
                  </label>
                  <input
                    type="text"
                    dir={!employerInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={employerInspector}
                    onChange={(e) => setEmployerInspector(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'نماینده پیمانکار' : 'Contractor Inspector'}
                  </label>
                  <input
                    type="text"
                    dir={!contractorInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={contractorInspector}
                    onChange={(e) => setContractorInspector(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'بازرس کنترل کیفیت (QC)' : 'QC Inspector'}
                  </label>
                  <input
                    type="text"
                    dir={!qcInspector ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={qcInspector}
                    onChange={(e) => setQcInspector(e.target.value)}
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
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isFa ? 'ثبت صورتجلسه گشایش و چاپ فرم' : 'Save Minutes & Preview'}</span>
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
              <div className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
                <span>{isFa ? 'صدور گزارش مغایرت، کسری و آسیب‌دیدگی (OSDR)' : 'Issue OSDR Discrepancy Report'}</span>
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

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <FileWarning className="w-4 h-4" />
                  <span>{isFa ? 'ثبت گزارش مغایرت (OSDR) و نمایش فرم چاپی' : 'Issue OSDR & Preview Sheet'}</span>
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
                          <button
                            type="button"
                            onClick={() => setPrintOsdr(rep)}
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
        </div>
      )}

      {/* Printable OPI Minutes Modal */}
      {printMinutes && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">{t.nav.opiMinutes}</h3>
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
                  onClick={() => setPrintMinutes(null)}
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
                  <div className="text-[11px] opacity-80">{t.nav.opiMinutes}</div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{isFa ? 'شماره صورتجلسه:' : 'Minutes No.:'} </span>
                    <span dir="ltr">{printMinutes.minutesNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'تاریخ:' : 'Date:'} </span>
                    <span dir="ltr">{formatDate(printMinutes.date)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-semibold">{t.headers.packingListNo}: </span>
                  <span dir="ltr" className="tabular-nums">{printMinutes.packingListNo}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.opiInvitationNo}: </span>
                  <span dir="ltr" className="tabular-nums">{printMinutes.invitationNo || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.packageNo}: </span>
                  <span dir="ltr" className="tabular-nums">
                    {printMinutes.packageNos.join(', ') || '-'}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">{isFa ? 'محل بازرسی:' : 'Location:'} </span>
                  <span className="bidi-plaintext">{printMinutes.location || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold">{isFa ? 'نتیجه بازرسی:' : 'Result:'} </span>
                  <span>
                    {printMinutes.resultStatus === 'compliant'
                      ? isFa ? 'منطبق با پکینگ لیست و بدون مغایرت' : 'Compliant / No Discrepancy'
                      : isFa ? 'دارای مغایرت / کسری / آسیب‌دیدگی' : 'Has Discrepancy'}
                  </span>
                </div>
              </div>

              {printMinutes.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printMinutes.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 pt-8 text-center">
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'نماینده مپنا' : 'MAPNA'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printMinutes.mapnaInspector || ''}</div>
                </div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'نماینده کارفرما' : 'Employer'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printMinutes.employerInspector || ''}</div>
                </div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'نماینده پیمانکار' : 'Contractor'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printMinutes.contractorInspector || ''}</div>
                </div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'کنترل کیفیت (QC)' : 'QC Inspector'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printMinutes.qcInspector || ''}</div>
                </div>
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
    </div>
  );
};
