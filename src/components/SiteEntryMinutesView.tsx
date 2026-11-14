import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardSignature, Download, Printer, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { GeneralEntry, SiteEntryMinutesRecord } from '../shared/types.ts';
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
  const [date, setDate] = useState(getTodayIso());
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);
  const [packingSearch, setPackingSearch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [warehouseKeeper, setWarehouseKeeper] = useState('');
  const [employerRep, setEmployerRep] = useState('');
  const [mapnaRep, setMapnaRep] = useState('');
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

  // Auto-fill supplier, driver, vehicle, waybill from matching General rows when selecting packings
  const togglePacking = (pk: string) => {
    setSelectedPackings((prev) => {
      const next = prev.includes(pk) ? prev.filter((x) => x !== pk) : [...prev, pk];
      if (!prev.includes(pk) && data?.generalEntries) {
        const match = data.generalEntries.find(
          (g) => (g.packingListNo || '').trim() === pk,
        );
        if (match) {
          if (!supplier && match.supplier) setSupplier(match.supplier);
          if (!driverName && match.driverName) setDriverName(match.driverName);
          if (!vehicleNo && match.vehicleNo) setVehicleNo(match.vehicleNo);
          if (!waybillNo && match.billOfLadingNo) setWaybillNo(match.billOfLadingNo);
        }
      }
      return next;
    });
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
          date,
          packingListNos: selectedPackings,
          supplier,
          driverName,
          vehicleNo,
          waybillNo,
          warehouseKeeper,
          employerRep,
          mapnaRep,
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
      setSelectedPackings([]);
      setSupplier('');
      setDriverName('');
      setVehicleNo('');
      setWaybillNo('');
      setWarehouseKeeper('');
      setEmployerRep('');
      setMapnaRep('');
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
      { key: 'minutesNo', header: isFa ? 'شماره صورتجلسه' : 'Minutes No.', getValue: (r) => r.minutesNo },
      { key: 'date', header: isFa ? 'تاریخ ورود' : 'Entry Date', isDate: true, getValue: (r) => r.date },
      { key: 'packingListNos', header: t.headers.packingListNo, getValue: (r) => r.packingListNos.join(', ') },
      { key: 'supplier', header: t.headers.supplier, getValue: (r) => r.supplier || '' },
      { key: 'waybillNo', header: t.headers.billOfLadingNo, getValue: (r) => r.waybillNo || '' },
      { key: 'vehicleNo', header: t.headers.vehicleNo, getValue: (r) => r.vehicleNo || '' },
      { key: 'driverName', header: t.headers.driverName, getValue: (r) => r.driverName || '' },
      { key: 'conditionStatus', header: isFa ? 'وضعیت ظاهری' : 'Condition', getValue: (r) => conditionLabel(r.conditionStatus) },
      { key: 'warehouseKeeper', header: isFa ? 'انباردار' : 'Storekeeper', getValue: (r) => r.warehouseKeeper || '' },
      { key: 'employerRep', header: isFa ? 'نماینده کارفرما' : 'Employer Rep.', getValue: (r) => r.employerRep || '' },
      { key: 'mapnaRep', header: isFa ? 'نماینده مپنا' : 'MAPNA Rep.', getValue: (r) => r.mapnaRep || '' },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa, conditionLabel],
  );

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className={`${printSheet ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4`}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <ClipboardSignature className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{t.nav.siteEntry}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره صورتجلسه ورود' : 'Entry Minutes No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !minutesNo ? 'rtl' : 'ltr'}
                value={minutesNo}
                onChange={(e) => setMinutesNo(e.target.value)}
                placeholder="SEM-1405-001"
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !minutesNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ ورود به کارگاه' : 'Site Entry Date'} *`}
              value={date}
              onChange={setDate}
            />

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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
                {t.headers.vehicleNo}
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

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انباردار کارگاه' : 'Site Storekeeper'}
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
                {isFa ? 'نماینده کارفرما' : 'Employer Rep.'}
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
                {isFa ? 'نماینده مپنا' : 'MAPNA Rep.'}
              </label>
              <input
                type="text"
                dir={!mapnaRep ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={mapnaRep}
                onChange={(e) => setMapnaRep(e.target.value)}
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
              <span>{isFa ? 'ثبت صورتجلسه ورود و نمایش فرم چاپی' : 'Save Minutes & Preview Form'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Recorded History */}
      <div className={`${printSheet ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden`}>
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
                <th className="py-2.5 px-4 text-start">{isFa ? 'شماره صورتجلسه' : 'Minutes No.'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4 text-start">{t.headers.packingListNo}</th>
                <th className="py-2.5 px-4 text-start">{t.headers.supplier}</th>
                <th className="py-2.5 px-4 text-start">{t.headers.billOfLadingNo}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'وضعیت ظاهری' : 'Condition'}</th>
                <th className="py-2.5 px-4 text-end">{t.controls.print}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : (data?.minutes || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                (data?.minutes || []).map((rec) => (
                  <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">{rec.minutesNo}</td>
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
                    <td className="py-2.5 px-4 text-end">
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

      {/* Printable Formal Site Entry Minutes Modal */}
      {printSheet && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">{t.nav.siteEntry}</h3>
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
                  onClick={() => setPrintSheet(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="border-2 border-current rounded-lg p-5 space-y-5 text-xs">
              <div className="flex items-center justify-between border-b border-current pb-3">
                <div>
                  <div className="text-base font-bold">{t.brandFull}</div>
                  <div className="text-[11px] opacity-80">{t.nav.siteEntry}</div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{isFa ? 'شماره صورتجلسه:' : 'Minutes No.:'} </span>
                    <span dir="ltr">{printSheet.minutesNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'تاریخ ورود:' : 'Entry Date:'} </span>
                    <span dir="ltr">{formatDate(printSheet.date)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-semibold">{t.headers.supplier}: </span>
                  <span className="bidi-plaintext">{printSheet.supplier || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.billOfLadingNo}: </span>
                  <span dir="ltr">{printSheet.waybillNo || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.vehicleNo}: </span>
                  <span className="bidi-plaintext">{printSheet.vehicleNo || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.driverName}: </span>
                  <span className="bidi-plaintext">{printSheet.driverName || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold">{isFa ? 'وضعیت ظاهری بسته‌ها:' : 'Packaging Condition:'} </span>
                  <span>{conditionLabel(printSheet.conditionStatus)}</span>
                </div>
              </div>

              <div>
                <div className="font-bold mb-2">
                  {isFa ? 'فهرست پکینگ لیست‌های وارد شده به کارگاه:' : 'Arrived Packing Lists:'}
                </div>
                <table className="w-full border-collapse border border-current text-xs">
                  <thead>
                    <tr>
                      <th className="border border-current py-1.5 px-2 w-12 text-center">#</th>
                      <th className="border border-current py-1.5 px-3 text-start">{t.headers.packingListNo}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printSheet.packingListNos.map((pk, idx) => (
                      <tr key={pk}>
                        <td className="border border-current py-1.5 px-2 text-center tabular-nums">{idx + 1}</td>
                        <td className="border border-current py-1.5 px-3 tabular-nums" dir="ltr">{pk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {printSheet.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printSheet.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 pt-8 text-center">
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'انباردار کارگاه' : 'Site Storekeeper'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printSheet.warehouseKeeper || ''}</div>
                </div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'نماینده کارفرما' : 'Employer Representative'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printSheet.employerRep || ''}</div>
                </div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'نماینده مپنا' : 'MAPNA Representative'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printSheet.mapnaRep || ''}</div>
                </div>
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
