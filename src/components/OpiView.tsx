import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileText, Printer, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { DetailedComputed, OpiInvitationRecord } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface OpiApiResponse {
  invitations: OpiInvitationRecord[];
  detailedItems: DetailedComputed[];
  packings: string[];
}

interface ResultRowDraft {
  selected: boolean;
  actualQty: string;
  damagedQty: string;
  repNo: string;
  repStatus: string;
  repDescription: string;
  notes: string;
}

interface OpiViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const OpiView: React.FC<OpiViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [tab, setTab] = useState<'invitation' | 'results'>('invitation');
  const [data, setData] = useState<OpiApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Invitation Form State
  const [invitationNo, setInvitationNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [time, setTime] = useState('09:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [packingSearch, setPackingSearch] = useState('');
  const [selectedPackings, setSelectedPackings] = useState<string[]>([]);

  // Print Invitation Preview
  const [printInvitation, setPrintInvitation] = useState<OpiInvitationRecord | null>(null);

  // OPI Results Recording State
  const [resultInvitationId, setResultInvitationId] = useState('');
  const [resultPackingFilter, setResultPackingFilter] = useState('');
  const [resultOpiNo, setResultOpiNo] = useState('');
  const [resultOpiDate, setResultOpiDate] = useState(getTodayIso());
  const [rowDrafts, setRowDrafts] = useState<Record<string, ResultRowDraft>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<OpiApiResponse>('/api/opi');
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
    setSelectedPackings((prev) =>
      prev.includes(pk) ? prev.filter((x) => x !== pk) : [...prev, pk],
    );
  };

  const handleIssueInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPackings.length === 0) {
      notify('warning', isFa ? 'حداقل یک پکینگ لیست انتخاب کنید.' : 'Select at least one Packing List.');
      return;
    }
    try {
      const res = await apiRequest<{ invitation: OpiInvitationRecord }>('/api/opi', {
        method: 'POST',
        body: JSON.stringify({
          invitationNo,
          date,
          time,
          packingNos: selectedPackings,
          location,
          notes,
        }),
      });
      notify(
        'success',
        isFa
          ? `دعوتنامه OPI شماره ${res.invitation.invitationNo} صادر شد.`
          : `OPI Invitation ${res.invitation.invitationNo} issued.`,
      );
      setInvitationNo('');
      setLocation('');
      setNotes('');
      setSelectedPackings([]);
      setPrintInvitation(res.invitation);
      triggerAutoSnapshot(`OPI ${res.invitation.invitationNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  // Filtered detailed items for recording OPI results
  const selectedInvitation = useMemo(
    () => (data?.invitations || []).find((inv) => inv.id === resultInvitationId) || null,
    [data, resultInvitationId],
  );

  const itemsForResults = useMemo(() => {
    const all = data?.detailedItems || [];
    return all.filter((d) => {
      if (selectedInvitation && !selectedInvitation.packingNos.includes(d.shipmentNo)) {
        return false;
      }
      if (resultPackingFilter && d.shipmentNo !== resultPackingFilter) {
        return false;
      }
      return true;
    });
  }, [data, selectedInvitation, resultPackingFilter]);

  useEffect(() => {
    if (selectedInvitation) {
      setResultOpiNo(selectedInvitation.invitationNo);
      setResultOpiDate(selectedInvitation.date || getTodayIso());
    }
  }, [selectedInvitation]);

  const getDraft = (item: DetailedComputed): ResultRowDraft => {
    return (
      rowDrafts[item.id] || {
        selected: item.actualQty === null,
        actualQty:
          item.actualQty !== null && item.actualQty !== undefined
            ? String(item.actualQty)
            : item.packingQty !== null && item.packingQty !== undefined
              ? String(item.packingQty)
              : '',
        damagedQty: item.damagedQty ? String(item.damagedQty) : '',
        repNo: item.repNo || '',
        repStatus: item.repStatus || '',
        repDescription: item.repDescription || '',
        notes: item.notes || '',
      }
    );
  };

  const updateDraft = (id: string, item: DetailedComputed, patch: Partial<ResultRowDraft>) => {
    setRowDrafts((prev) => ({
      ...prev,
      [id]: { ...getDraft(item), ...patch },
    }));
  };

  const handleSaveResults = async (e: React.FormEvent) => {
    e.preventDefault();
    const results = itemsForResults
      .map((item) => {
        const d = getDraft(item);
        if (!d.selected) return null;
        const actualNum = d.actualQty.trim() === '' ? null : Number(d.actualQty);
        const damagedNum = d.damagedQty.trim() === '' ? null : Number(d.damagedQty);
        return {
          detailedId: item.id,
          actualQty: actualNum,
          damagedQty: damagedNum,
          repNo: d.repNo,
          repStatus: d.repStatus,
          repDescription: d.repDescription,
          notes: d.notes,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (results.length === 0) {
      notify('warning', isFa ? 'حداقل یک قلم را انتخاب کنید.' : 'Select at least one item.');
      return;
    }

    try {
      const res = await apiRequest<{ updatedCount: number }>('/api/opi/results', {
        method: 'POST',
        body: JSON.stringify({
          invitationId: resultInvitationId || undefined,
          opiNo: resultOpiNo,
          opiDate: resultOpiDate,
          results,
        }),
      });
      notify(
        'success',
        isFa
          ? `نتیجه OPI برای ${res.updatedCount} قلم ثبت و موجودی محاسبه شد.`
          : `OPI results saved for ${res.updatedCount} items.`,
      );
      setRowDrafts({});
      triggerAutoSnapshot(`OPI Results ${resultOpiNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className={`${printInvitation ? 'print:hidden' : ''} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={() => setTab('invitation')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            tab === 'invitation'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isFa ? 'صدور دعوتنامه OPI و فرم چاپی' : 'Issue OPI Invitation'}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('results')}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            tab === 'results'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>{isFa ? 'ثبت نتایج بازرسی (مقدار واقعی و آسیب‌دیده)' : 'Record OPI Inspection Results'}</span>
        </button>
      </div>

      {/* TAB 1: Issue OPI Invitation */}
      {tab === 'invitation' && (
        <div className={`space-y-6 ${printInvitation ? 'print:hidden' : ''}`}>
          {canEdit && (
            <form
              onSubmit={handleIssueInvitation}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
            >
              <h3 className="text-sm font-bold">
                {isFa ? 'صدور دعوتنامه جدید بازرسی بازگشایی (OPI)' : 'Issue New OPI Invitation'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.opiInvitationNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !invitationNo ? 'rtl' : 'ltr'}
                    value={invitationNo}
                    onChange={(e) => setInvitationNo(e.target.value)}
                    placeholder="OPI-2026-001"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !invitationNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <JalaliDateInput
                  label={`${t.headers.opiInvitationDate} *`}
                  value={date}
                  onChange={setDate}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {isFa ? 'ساعت بازرسی' : 'Inspection Time'} *
                  </label>
                  <input
                    type="time"
                    required
                    dir="ltr"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-left tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
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
                    placeholder={isFa ? 'انبار مرکزی سایت...' : 'Site Warehouse...'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {/* Multi-Select Packing Lists */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    {isFa
                      ? `انتخاب پکینگ لیست‌ها (${selectedPackings.length.toLocaleString('fa-IR')} مورد انتخاب‌شده)`
                      : `Select Packing Lists (${selectedPackings.length} selected)`}
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

                <div className="max-h-48 overflow-y-auto p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
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
                  <FileText className="w-4 h-4" />
                  <span>{isFa ? 'ثبت دعوتنامه و نمایش فرم چاپی' : 'Issue & Preview Form'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Issued Invitations History */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {isFa ? 'دعوتنامه‌های OPI صادرشده' : 'Issued OPI Invitations'}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.opiInvitationNo}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.opiInvitationDate}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'ساعت' : 'Time'}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{t.headers.packingListNo}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'محل' : 'Location'}</th>
                    <th className="py-2.5 px-4 text-start font-semibold">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-4 text-end font-semibold">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.loading}
                      </td>
                    </tr>
                  ) : (data?.invitations || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    (data?.invitations || []).map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--bg-subtle)]/50">
                        <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">
                          {inv.invitationNo}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                          {formatDate(inv.date)}
                        </td>
                        <td className="py-2.5 px-4 tabular-nums" dir="ltr">
                          {inv.time}
                        </td>
                        <td className="py-2.5 px-4 bidi-plaintext" dir="ltr">
                          {inv.packingNos.join(', ')}
                        </td>
                        <td className="py-2.5 px-4 bidi-plaintext">{inv.location || '-'}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              inv.status === 'completed'
                                ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                                : 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                            }`}
                          >
                            {inv.status === 'completed'
                              ? isFa
                                ? 'ثبت نتیجه شده'
                                : 'Completed'
                              : isFa
                                ? 'صادرشده'
                                : 'Issued'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPrintInvitation(inv)}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-[11px] font-medium flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>{t.controls.print}</span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResultInvitationId(inv.id);
                                  setResultPackingFilter('');
                                  setTab('results');
                                }}
                                className="h-7 px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold"
                              >
                                {isFa ? 'ثبت نتایج' : 'Record Results'}
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

      {/* TAB 2: Record OPI Inspection Results */}
      {tab === 'results' && (
        <form onSubmit={handleSaveResults} className={`space-y-4 ${printInvitation ? 'print:hidden' : ''}`}>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'فیلتر بر اساس دعوتنامه OPI' : 'Filter by OPI Invitation'}
              </label>
              <select
                value={resultInvitationId}
                onChange={(e) => setResultInvitationId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{t.controls.all}</option>
                {(data?.invitations || []).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invitationNo} ({formatDate(inv.date)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.packingListNo}
              </label>
              <select
                value={resultPackingFilter}
                onChange={(e) => setResultPackingFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="">{t.controls.all}</option>
                {(data?.packings || []).map((pk) => (
                  <option key={pk} value={pk}>
                    {pk}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {t.headers.opiNo}
              </label>
              <input
                type="text"
                dir={isFa && !resultOpiNo ? 'rtl' : 'ltr'}
                value={resultOpiNo}
                onChange={(e) => setResultOpiNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !resultOpiNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={t.headers.opiDate}
              value={resultOpiDate}
              onChange={setResultOpiDate}
            />
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2.5 px-3 w-9">{isFa ? 'ثبت' : 'Apply'}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.shipmentNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.packageNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.itemNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.description}</th>
                    <th className="py-2.5 px-3 text-end">{t.headers.packingQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.actualQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.damagedQty}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repNo}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repStatus}</th>
                    <th className="py-2.5 px-3 text-start">{t.headers.repDescription}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {itemsForResults.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    itemsForResults.map((item) => {
                      const d = getDraft(item);
                      return (
                        <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-2 px-3">
                            <input
                              type="checkbox"
                              checked={d.selected}
                              onChange={(e) => updateDraft(item.id, item, { selected: e.target.checked })}
                            />
                          </td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                          <td className="py-2 px-3 max-w-[200px] truncate bidi-plaintext" title={item.description}>
                            {item.description || item.generalDescription}
                          </td>
                          <td className="py-2 px-3 text-end tabular-nums font-semibold">
                            {item.packingQty ?? '-'} {item.countingUnit}
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="number"
                              step="any"
                              dir={isFa && !d.actualQty ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.actualQty}
                              onChange={(e) =>
                                updateDraft(item.id, item, { actualQty: e.target.value, selected: true })
                              }
                              className={`w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                                isFa && !d.actualQty ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-24">
                            <input
                              type="number"
                              step="any"
                              dir={isFa && !d.damagedQty ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.damagedQty}
                              onChange={(e) =>
                                updateDraft(item.id, item, { damagedQty: e.target.value, selected: true })
                              }
                              className={`w-20 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                                isFa && !d.damagedQty ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="text"
                              dir={isFa && !d.repNo ? 'rtl' : 'ltr'}
                              disabled={!canEdit}
                              value={d.repNo}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repNo: e.target.value, selected: true })
                              }
                              className={`w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs ${
                                isFa && !d.repNo ? 'text-right' : 'text-left'
                              }`}
                            />
                          </td>
                          <td className="py-2 px-3 w-28">
                            <input
                              type="text"
                              dir={!d.repStatus ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              disabled={!canEdit}
                              value={d.repStatus}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repStatus: e.target.value, selected: true })
                              }
                              className="w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                            />
                          </td>
                          <td className="py-2 px-3 w-40">
                            <input
                              type="text"
                              dir={!d.repDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                              disabled={!canEdit}
                              value={d.repDescription}
                              onChange={(e) =>
                                updateDraft(item.id, item, { repDescription: e.target.value, selected: true })
                              }
                              className="w-36 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {canEdit && itemsForResults.length > 0 && (
              <div className="p-4 border-t border-[var(--border-subtle)] flex justify-end">
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isFa ? 'ثبت نتایج OPI و محاسبه کسری/موجودی' : 'Save OPI Results & Compute Balances'}</span>
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* Printable OPI Invitation Sheet Modal */}
      {printInvitation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">{isFa ? 'پیش‌نمایش فرم دعوتنامه OPI' : 'OPI Invitation Form Preview'}</h3>
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
                  onClick={() => setPrintInvitation(null)}
                  className="p-1.5 rounded-lg border border-[var(--border-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Formal Printable Header */}
            <div className="border-2 border-current rounded-lg p-5 space-y-5 text-xs">
              <div className="flex items-center justify-between border-b border-current pb-3">
                <div>
                  <div className="text-base font-bold">{t.brandFull}</div>
                  <div className="text-[11px] opacity-80">
                    {isFa ? 'فرم رسمی دعوتنامه بازرسی بازگشایی کالا (OPI)' : 'Official Open Package Inspection (OPI) Invitation'}
                  </div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{t.headers.opiInvitationNo}: </span>
                    <span dir="ltr">{printInvitation.invitationNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{t.headers.opiInvitationDate}: </span>
                    <span dir="ltr">{formatDate(printInvitation.date)}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'ساعت' : 'Time'}: </span>
                    <span dir="ltr">{printInvitation.time}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-semibold">{isFa ? 'محل بازرسی:' : 'Location:'} </span>
                  <span className="bidi-plaintext">{printInvitation.location || (isFa ? 'انبار سایت' : 'Site Warehouse')}</span>
                </div>
                <div>
                  <span className="font-semibold">{isFa ? 'صادرکننده:' : 'Issued By:'} </span>
                  <span>{printInvitation.createdBy}</span>
                </div>
              </div>

              <div>
                <div className="font-bold mb-2">
                  {isFa ? 'فهرست پکینگ لیست‌های مشمول بازرسی:' : 'Included Packing Lists:'}
                </div>
                <table className="w-full border-collapse border border-current text-xs">
                  <thead>
                    <tr>
                      <th className="border border-current py-1.5 px-2 w-12 text-center">#</th>
                      <th className="border border-current py-1.5 px-3 text-start">{t.headers.packingListNo}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printInvitation.packingNos.map((pk, idx) => (
                      <tr key={pk}>
                        <td className="border border-current py-1.5 px-2 text-center tabular-nums">{idx + 1}</td>
                        <td className="border border-current py-1.5 px-3 tabular-nums" dir="ltr">{pk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {printInvitation.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printInvitation.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 pt-8 text-center">
                <div className="border-t border-current pt-2">
                  {isFa ? 'امضاء مسئول انبار' : 'Warehouse Supervisor'}
                </div>
                <div className="border-t border-current pt-2">
                  {isFa ? 'امضاء کنترل کیفیت / بازرسی' : 'QA / QC Inspector'}
                </div>
                <div className="border-t border-current pt-2">
                  {isFa ? 'امضاء نماینده کارفرما / مپنا' : 'Client / MAPNA Representative'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
