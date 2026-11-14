import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { DetailedComputed, SubstitutionRecord } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';

interface SubstitutionsApiResponse {
  records: SubstitutionRecord[];
  detailedItems: DetailedComputed[];
}

interface SubstitutionViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

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
  const [itemSearch, setItemSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [substituteDescription, setSubstituteDescription] = useState('');
  const [substituteItemCode, setSubstituteItemCode] = useState('');
  const [substituteSize, setSubstituteSize] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
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
          substituteDescription,
          substituteItemCode,
          substituteSize,
          qty: Number(qty),
          reason,
          approvedBy,
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
      setSelectedItemId('');
      setSubstituteDescription('');
      setSubstituteItemCode('');
      setSubstituteSize('');
      setQty('');
      setReason('');
      setApprovedBy('');
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
      { key: 'docNo', header: isFa ? 'شماره سند' : 'Doc No.', getValue: (r) => r.docNo },
      { key: 'date', header: isFa ? 'تاریخ' : 'Date', isDate: true, getValue: (r) => r.date },
      { key: 'shipmentNo', header: t.headers.shipmentNo, getValue: (r) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, getValue: (r) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, getValue: (r) => r.itemNo },
      { key: 'originalDescription', header: isFa ? 'کالای اصلی' : 'Original Item', getValue: (r) => r.originalDescription },
      { key: 'originalItemCode', header: isFa ? 'کد کالای اصلی' : 'Original Code', getValue: (r) => r.originalItemCode },
      { key: 'substituteDescription', header: isFa ? 'کالای جایگزین' : 'Substitute Item', getValue: (r) => r.substituteDescription },
      { key: 'substituteItemCode', header: isFa ? 'کد کالای جایگزین' : 'Substitute Code', getValue: (r) => r.substituteItemCode },
      { key: 'qty', header: isFa ? 'مقدار' : 'Qty', getValue: (r) => r.qty },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'reason', header: isFa ? 'دلیل جایگزینی' : 'Reason', getValue: (r) => r.reason },
      { key: 'status', header: isFa ? 'وضعیت' : 'Status', getValue: (r) => statusLabel(r.status) },
      { key: 'approvedBy', header: isFa ? 'تاییدکننده' : 'Approved By', getValue: (r) => r.approvedBy || '' },
    ],
    [t, isFa, statusLabel],
  );

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className={`${printRec ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4`}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <ArrowLeftRight className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isFa ? 'ثبت درخواست و مجوز جایگزینی کالا' : 'Register Material Substitution'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره سند جایگزینی' : 'Substitution Doc No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="SUB-1405-001"
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
                {isFa ? 'جستجو و انتخاب کالای اصلی' : 'Search Original Item'} *
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

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'انتخاب ردیف کالای اصلی' : 'Select Original Row'} *
              </label>
              <select
                required
                value={selectedItemId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedItemId(id);
                  const found = (data?.detailedItems || []).find((x) => x.id === id);
                  if (found && !qty && found.packingQty) {
                    setQty(String(found.packingQty));
                  }
                }}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{isFa ? 'یک کالا انتخاب کنید...' : 'Select item...'}</option>
                {filteredItems.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.shipmentNo} / {d.packageNo} #{d.itemNo} — {(d.description || d.generalDescription).slice(0, 42)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شرح کالای جایگزین' : 'Substitute Description'} *
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
                {isFa ? 'کد کالای جایگزین' : 'Substitute Item Code'}
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
                {isFa ? 'سایز / مشخصات فنی جایگزین' : 'Substitute Size / Spec'}
              </label>
              <input
                type="text"
                dir={!substituteSize ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={substituteSize}
                onChange={(e) => setSubstituteSize(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'مقدار جایگزین' : 'Qty'} *
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

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'دلیل جایگزینی' : 'Reason for Substitution'} *
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
                {isFa ? 'مرجع تایید مهندسی / کارفرما' : 'Approved By'}
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
      <div className={`${printRec ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">
            {isFa ? 'سوابق جایگزینی کالا و تجهیزات' : 'Material Substitution History'}
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
                <th className="py-2.5 px-3 text-start">{isFa ? 'شماره سند' : 'Doc No.'}</th>
                <th className="py-2.5 px-3 text-start">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                <th className="py-2.5 px-3 text-start">{isFa ? 'کالای اصلی' : 'Original'}</th>
                <th className="py-2.5 px-3 text-start">{isFa ? 'کالای جایگزین' : 'Substitute'}</th>
                <th className="py-2.5 px-3 text-end">{isFa ? 'مقدار' : 'Qty'}</th>
                <th className="py-2.5 px-3 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                <th className="py-2.5 px-3 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
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
                    <td className="py-2.5 px-3 font-semibold tabular-nums" dir="ltr">{rec.docNo}</td>
                    <td className="py-2.5 px-3 tabular-nums" dir="ltr">{formatDate(rec.date)}</td>
                    <td className="py-2.5 px-3 tabular-nums" dir="ltr">
                      {rec.shipmentNo} / {rec.packageNo} #{rec.itemNo}
                    </td>
                    <td className="py-2.5 px-3 max-w-[180px] truncate bidi-plaintext">{rec.originalDescription}</td>
                    <td className="py-2.5 px-3 max-w-[180px] truncate bidi-plaintext">{rec.substituteDescription}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold">
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
                    <td className="py-2.5 px-3 text-end">
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

      {/* Printable Substitution Sheet */}
      {printRec && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">{t.nav.substitution}</h3>
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
                  onClick={() => setPrintRec(null)}
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
                    {isFa ? 'برگه درخواست و مجوز جایگزینی کالا و تجهیزات' : 'Material Substitution Request & Approval Form'}
                  </div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{isFa ? 'شماره سند:' : 'Doc No.:'} </span>
                    <span dir="ltr">{printRec.docNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'تاریخ:' : 'Date:'} </span>
                    <span dir="ltr">{formatDate(printRec.date)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-semibold">{t.headers.shipmentNo}: </span>
                  <span dir="ltr" className="tabular-nums">{printRec.shipmentNo}</span>
                </div>
                <div>
                  <span className="font-semibold">{t.headers.packageNo} / {t.headers.itemNo}: </span>
                  <span dir="ltr" className="tabular-nums">{printRec.packageNo} / #{printRec.itemNo}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-current text-xs">
                <thead>
                  <tr>
                    <th className="border border-current py-1.5 px-3 text-start">{isFa ? 'بخش' : 'Section'}</th>
                    <th className="border border-current py-1.5 px-3 text-start">{t.headers.description}</th>
                    <th className="border border-current py-1.5 px-3 text-start">{t.headers.itemCode}</th>
                    <th className="border border-current py-1.5 px-3 text-end">{isFa ? 'مقدار' : 'Qty'}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-current py-1.5 px-3 font-semibold">{isFa ? 'کالای اصلی' : 'Original'}</td>
                    <td className="border border-current py-1.5 px-3 bidi-plaintext">{printRec.originalDescription}</td>
                    <td className="border border-current py-1.5 px-3 tabular-nums" dir="ltr">{printRec.originalItemCode || '-'}</td>
                    <td className="border border-current py-1.5 px-3 text-end tabular-nums">{printRec.qty} {printRec.countingUnit}</td>
                  </tr>
                  <tr>
                    <td className="border border-current py-1.5 px-3 font-semibold">{isFa ? 'کالای جایگزین' : 'Substitute'}</td>
                    <td className="border border-current py-1.5 px-3 bidi-plaintext">
                      {printRec.substituteDescription} {printRec.substituteSize ? `(${printRec.substituteSize})` : ''}
                    </td>
                    <td className="border border-current py-1.5 px-3 tabular-nums" dir="ltr">{printRec.substituteItemCode || '-'}</td>
                    <td className="border border-current py-1.5 px-3 text-end tabular-nums">{printRec.qty} {printRec.countingUnit}</td>
                  </tr>
                </tbody>
              </table>

              <div>
                <span className="font-semibold">{isFa ? 'دلیل جایگزینی:' : 'Reason:'} </span>
                <span className="bidi-plaintext">{printRec.reason}</span>
              </div>

              {printRec.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printRec.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 pt-8 text-center">
                <div className="border-t border-current pt-2">{isFa ? 'تنظیم‌کننده (انبار)' : 'Prepared By'}</div>
                <div className="border-t border-current pt-2">
                  <div>{isFa ? 'تایید فنی / مهندسی' : 'Engineering Approval'}</div>
                  <div className="text-[10px] opacity-80 mt-1">{printRec.approvedBy || ''}</div>
                </div>
                <div className="border-t border-current pt-2">{isFa ? 'مدیریت پروژه / کارفرما' : 'Project Management'}</div>
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
