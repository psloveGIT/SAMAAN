import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Printer, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { DetailedComputed, MivDocType, MivDocumentRecord } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface MivApiResponse {
  documents: MivDocumentRecord[];
  detailedItems: DetailedComputed[];
}

interface MivViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

export const MivView: React.FC<MivViewProps> = ({ refreshSignal, onDataChanged }) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [data, setData] = useState<MivApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [docType, setDocType] = useState<MivDocType>('miv_contractor');
  const [docNo, setDocNo] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [party, setParty] = useState('');
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [printDoc, setPrintDoc] = useState<MivDocumentRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<MivApiResponse>('/api/miv');
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

  const docTypeLabel = (type: MivDocType) => {
    if (type === 'miv_contractor') {
      return isFa ? 'حواله مصرف پیمانکار (MIV Contractor)' : 'MIV Contractor Issue';
    }
    if (type === 'smr_contractor') {
      return isFa ? 'برگشت به انبار پیمانکار (SMR Contractor)' : 'SMR Contractor Return';
    }
    if (type === 'smr_mapna') {
      return isFa ? 'برگشت از پیمانکار به مپنا (SMR MAPNA)' : 'SMR Return to MAPNA';
    }
    return isFa ? 'تحویل/مصرف مپنا (MIV MAPNA)' : 'MIV MAPNA Issue';
  };

  const getAvailableQty = (item: DetailedComputed, type: MivDocType) => {
    if (type === 'miv_contractor' || type === 'smr_mapna') {
      return item.contractorInventory;
    }
    if (type === 'miv_mapna') {
      return item.mapnaInventory;
    }
    return item.mivContractorQty || 0;
  };

  const eligibleItems = useMemo(() => {
    const all = (data?.detailedItems || []).filter((d) => {
      if (docType === 'miv_contractor' || docType === 'smr_mapna') return d.contractorInventory > 0;
      if (docType === 'miv_mapna') return !d.opiPending && d.mapnaInventory > 0;
      return !d.opiPending;
    });
    const q = itemSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) =>
      [d.shipmentNo, d.packageNo, d.itemNo, d.description, d.generalDescription, d.itemCode]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [data, docType, itemSearch]);

  const selectedEntries = useMemo(() => {
    return Object.entries(qtyMap)
      .map(([detailedId, val]) => ({ detailedId, qty: Number(val) }))
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
  }, [qtyMap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEntries.length === 0) {
      notify('warning', isFa ? 'برای حداقل یک قلم مقدار وارد کنید.' : 'Enter quantity for at least one item.');
      return;
    }

    try {
      const res = await apiRequest<{ document: MivDocumentRecord }>('/api/miv', {
        method: 'POST',
        body: JSON.stringify({
          docType,
          docNo,
          date,
          party,
          notes,
          items: selectedEntries,
        }),
      });
      notify(
        'success',
        isFa
          ? `فرم ${res.document.docNo} ثبت و موجودی اقلام به‌روزرسانی شد.`
          : `Document ${res.document.docNo} saved.`,
      );
      setDocNo('');
      setParty('');
      setNotes('');
      setQtyMap({});
      setPrintDoc(res.document);
      triggerAutoSnapshot(`MIV ${res.document.docNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className={`${printDoc ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4`}
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isFa ? 'ثبت حواله MIV و فرم برگشت SMR' : 'Issue MIV / SMR Document'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'نوع فرم' : 'Document Type'} *
              </label>
              <select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value as MivDocType);
                  setQtyMap({});
                }}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="miv_contractor">{docTypeLabel('miv_contractor')}</option>
                <option value="smr_contractor">{docTypeLabel('smr_contractor')}</option>
                <option value="smr_mapna">{docTypeLabel('smr_mapna')}</option>
                <option value="miv_mapna">{docTypeLabel('miv_mapna')}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'شماره فرم / حواله' : 'Document No.'} *
              </label>
              <input
                type="text"
                required
                dir={isFa && !docNo ? 'rtl' : 'ltr'}
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                  isFa && !docNo ? 'text-right' : 'text-left'
                }`}
              />
            </div>

            <JalaliDateInput
              label={`${isFa ? 'تاریخ فرم' : 'Document Date'} *`}
              value={date}
              onChange={setDate}
            />

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'پیمانکار / واحد تحویل‌گیرنده' : 'Contractor / Party'}
              </label>
              <input
                type="text"
                dir={!party ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                value={party}
                onChange={(e) => setParty(e.target.value)}
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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)]">
                {isFa ? 'انتخاب اقلام و تعداد' : 'Select Items & Quantities'}
              </div>
              <div className="flex items-center h-8 w-64 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <input
                  type="text"
                  dir={!itemSearch ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder={t.controls.searchPlaceholder}
                  className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] sticky top-0">
                  <tr>
                    <th className="py-2 px-3 text-start">{t.headers.shipmentNo}</th>
                    <th className="py-2 px-3 text-start">{t.headers.packageNo}</th>
                    <th className="py-2 px-3 text-start">{t.headers.itemNo}</th>
                    <th className="py-2 px-3 text-start">{t.headers.description}</th>
                    <th className="py-2 px-3 text-end">
                      {docType === 'miv_mapna'
                        ? t.headers.mapnaInventory
                        : docType === 'smr_contractor'
                          ? t.headers.mivContractorQty
                          : t.headers.contractorInventory}
                    </th>
                    <th className="py-2 px-3 text-start">{isFa ? 'تعداد' : 'Qty'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {eligibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                        {t.controls.noData}
                      </td>
                    </tr>
                  ) : (
                    eligibleItems.map((item) => {
                      const avail = getAvailableQty(item, docType);
                      return (
                        <tr key={item.id} className="hover:bg-[var(--bg-subtle)]/40">
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.shipmentNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.packageNo}</td>
                          <td className="py-2 px-3 tabular-nums" dir="ltr">{item.itemNo}</td>
                          <td className="py-2 px-3 max-w-[240px] truncate bidi-plaintext">
                            {item.description || item.generalDescription}
                          </td>
                          <td className="py-2 px-3 text-end font-semibold text-[var(--accent-primary)] tabular-nums">
                            {avail} {item.countingUnit}
                          </td>
                          <td className="py-2 px-3 w-36">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                max={docType !== 'smr_contractor' ? avail : undefined}
                                dir={isFa && !qtyMap[item.id] ? 'rtl' : 'ltr'}
                                value={qtyMap[item.id] || ''}
                                onChange={(e) =>
                                  setQtyMap((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                placeholder="0"
                                className={`w-24 h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
                                  isFa && !qtyMap[item.id] ? 'text-right' : 'text-left'
                                }`}
                              />
                              {avail > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQtyMap((prev) => ({ ...prev, [item.id]: String(avail) }))
                                  }
                                  className="px-2 h-8 rounded bg-[var(--bg-subtle)] text-[10px] font-semibold"
                                >
                                  {isFa ? 'کل' : 'Max'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {isFa
                ? `${selectedEntries.length.toLocaleString('fa-IR')} قلم انتخاب‌شده`
                : `${selectedEntries.length} items selected`}
            </span>
            <button
              type="submit"
              className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isFa ? 'ثبت سند و چاپ فرم' : 'Save & Print Document'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Document History */}
      <div className={`${printDoc ? 'print:hidden' : ''} rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden`}>
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-bold">{isFa ? 'سوابق حواله‌های MIV و SMR' : 'MIV & SMR History'}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-4 text-start">{isFa ? 'نوع فرم' : 'Type'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'شماره سند' : 'Doc No.'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'تاریخ' : 'Date'}</th>
                <th className="py-2.5 px-4 text-start">{isFa ? 'طرف مقابل / پیمانکار' : 'Party'}</th>
                <th className="py-2.5 px-4 text-end">{isFa ? 'تعداد اقلام' : 'Items'}</th>
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
              ) : (data?.documents || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                (data?.documents || []).map((doc) => (
                  <tr key={doc.id} className="hover:bg-[var(--bg-subtle)]/50">
                    <td className="py-2.5 px-4 font-medium">{docTypeLabel(doc.docType)}</td>
                    <td className="py-2.5 px-4 font-semibold tabular-nums" dir="ltr">{doc.docNo}</td>
                    <td className="py-2.5 px-4 tabular-nums" dir="ltr">{formatDate(doc.date)}</td>
                    <td className="py-2.5 px-4 bidi-plaintext">{doc.party || '-'}</td>
                    <td className="py-2.5 px-4 text-end tabular-nums">{doc.items.length}</td>
                    <td className="py-2.5 px-4 text-end">
                      <button
                        type="button"
                        onClick={() => setPrintDoc(doc)}
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

      {/* Printable MIV / SMR Sheet */}
      {printDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 max-h-[92vh] overflow-y-auto print-sheet">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 print:hidden">
              <h3 className="text-sm font-bold">{isFa ? 'پیش‌نمایش فرم چاپی' : 'Printable Form'}</h3>
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
                  onClick={() => setPrintDoc(null)}
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
                  <div className="text-[11px] opacity-80">{docTypeLabel(printDoc.docType)}</div>
                </div>
                <div className="text-end tabular-nums">
                  <div>
                    <span className="font-semibold">{isFa ? 'شماره سند:' : 'Doc No.:'} </span>
                    <span dir="ltr">{printDoc.docNo}</span>
                  </div>
                  <div>
                    <span className="font-semibold">{isFa ? 'تاریخ:' : 'Date:'} </span>
                    <span dir="ltr">{formatDate(printDoc.date)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <span className="font-semibold">{isFa ? 'پیمانکار / طرف حساب:' : 'Party:'} </span>
                  <span className="bidi-plaintext">{printDoc.party || '-'}</span>
                </div>
                <div>
                  <span className="font-semibold">{isFa ? 'تنظیم‌کننده:' : 'Prepared By:'} </span>
                  <span>{printDoc.createdBy}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-current text-xs">
                <thead>
                  <tr>
                    <th className="border border-current py-1.5 px-2 text-center">#</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.shipmentNo}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.packageNo}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.itemNo}</th>
                    <th className="border border-current py-1.5 px-2 text-start">{t.headers.description}</th>
                    <th className="border border-current py-1.5 px-2 text-end">{isFa ? 'مقدار' : 'Qty'}</th>
                  </tr>
                </thead>
                <tbody>
                  {printDoc.items.map((line, i) => (
                    <tr key={`${line.detailedId}-${i}`}>
                      <td className="border border-current py-1.5 px-2 text-center tabular-nums">{i + 1}</td>
                      <td className="border border-current py-1.5 px-2 tabular-nums" dir="ltr">{line.shipmentNo}</td>
                      <td className="border border-current py-1.5 px-2 tabular-nums" dir="ltr">{line.packageNo}</td>
                      <td className="border border-current py-1.5 px-2 tabular-nums" dir="ltr">{line.itemNo}</td>
                      <td className="border border-current py-1.5 px-2 bidi-plaintext">{line.description}</td>
                      <td className="border border-current py-1.5 px-2 text-end font-bold tabular-nums">{line.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {printDoc.notes && (
                <div>
                  <span className="font-semibold">{t.headers.notes}: </span>
                  <span className="bidi-plaintext">{printDoc.notes}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 pt-8 text-center">
                <div className="border-t border-current pt-2">{isFa ? 'تحویل‌دهنده' : 'Issued By'}</div>
                <div className="border-t border-current pt-2">{isFa ? 'تحویل‌گیرنده' : 'Received By'}</div>
                <div className="border-t border-current pt-2">{isFa ? 'تاییدیه مدیریت انبار' : 'Approved By'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
