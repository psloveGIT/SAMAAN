import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type { CategoryStore, TransitEntry } from '../shared/types.ts';
import { JalaliDateInput } from './JalaliDateInput.tsx';

interface PackageLineDraft {
  id: string;
  packageNo: string;
  itemCount: string;
  itemDescription: string;
  island: string;
  system: string;
  subSystem: string;
  unit: string;
  grossWeight: string;
  netWeight: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

interface PackingCheckResult {
  packingNo: string;
  existsInGeneral: boolean;
  existsInDetailed: boolean;
  existsInTransit: boolean;
  generalPackages?: string[];
  existingPackages: string[];
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  mapnaMinutesTaken?: boolean;
  nextSuggestedRowNo: string;
}

interface PackingWizardModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onGoToDetailed?: (packingNo: string, packageNo: string) => void;
  categories: CategoryStore;
  prefillFromTransit?: TransitEntry | null;
  prefillPackingNo?: string;
}

function createEmptyLine(prefill?: TransitEntry | null): PackageLineDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    packageNo: prefill?.packageNo || '',
    itemCount: '',
    itemDescription: prefill?.itemDescription || '',
    island: '',
    system: prefill?.system || '',
    subSystem: prefill?.subSystem || '',
    unit: prefill?.unit || '',
    grossWeight: '',
    netWeight: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
  };
}

function toOptionalNum(s: string): number | null {
  const cleaned = s.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const PackingWizardModal: React.FC<PackingWizardModalProps> = ({
  open,
  onClose,
  onSaved,
  onGoToDetailed,
  categories,
  prefillFromTransit,
  prefillPackingNo,
}) => {
  const { prefs, t, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';

  // Header (Packing-level) fields
  const [packingListNo, setPackingListNo] = useState('');
  const [arrivalDate, setArrivalDate] = useState(getTodayIso());
  const [releaseNo, setReleaseNo] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [dispatchLocation, setDispatchLocation] = useState('');
  const [employerEntryMinutesNo, setEmployerEntryMinutesNo] = useState('');
  const [mapnaEntryMinutesNo, setMapnaEntryMinutesNo] = useState('');
  const [billOfLadingNo, setBillOfLadingNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [weighbridgeWeight, setWeighbridgeWeight] = useState('');
  const [freightCost, setFreightCost] = useState('');
  const [driverName, setDriverName] = useState('');

  const [lines, setLines] = useState<PackageLineDraft[]>([]);
  const [checkInfo, setCheckInfo] = useState<PackingCheckResult | null>(null);
  const [isContinuation, setIsContinuation] = useState(false);
  const [acknowledgeClosed, setAcknowledgeClosed] = useState(false);
  const [mapnaDuplicateError, setMapnaDuplicateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Post-save "Go to Detailed?" prompt
  const [savedNavigationPrompt, setSavedNavigationPrompt] = useState<{
    packingNo: string;
    firstPackageNo: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setMapnaDuplicateError('');
    setSavedNavigationPrompt(null);
    setIsContinuation(Boolean(prefillPackingNo));
    setAcknowledgeClosed(false);

    const pkInit = prefillFromTransit?.packingListNo || prefillPackingNo || '';
    const arrInit = prefillFromTransit?.arrivalDate || getTodayIso();
    const relNoInit = prefillFromTransit?.releaseNetNo || '';
    setPackingListNo(pkInit);
    setArrivalDate(arrInit);
    setReleaseNo(relNoInit);
    setReleaseDate(relNoInit ? (prefillFromTransit?.releaseNetDate || arrInit) : arrInit);
    setSupplier(prefillFromTransit?.supplier || '');
    setDispatchLocation(prefillFromTransit?.dispatchLocation || '');
    setEmployerEntryMinutesNo('');
    setMapnaEntryMinutesNo('');
    setBillOfLadingNo(prefillFromTransit?.billOfLadingNo || '');
    setVehicleNo('');
    setWeighbridgeWeight('');
    setFreightCost(prefillFromTransit?.amount ? String(prefillFromTransit.amount) : '');
    setDriverName('');
    setLines([createEmptyLine(prefillFromTransit)]);

    apiRequest<PackingCheckResult>(
      `/api/packing/check?scope=general&packingNo=${encodeURIComponent(pkInit)}`,
    )
      .then((res) => setCheckInfo(res))
      .catch(() => {});
  }, [open, prefillFromTransit, prefillPackingNo]);

  // Auto-sync releaseDate to arrivalDate whenever Release Note is empty
  useEffect(() => {
    if (!releaseNo.trim()) {
      setReleaseDate(arrivalDate);
    } else if (!releaseDate) {
      setReleaseDate(arrivalDate);
    }
  }, [releaseNo, arrivalDate, releaseDate]);

  // Live check whenever Packing List No. or MAPNA Entry Minutes No. changes
  useEffect(() => {
    if (!open) return;
    const trimmed = packingListNo.trim();
    const minTrimmed = mapnaEntryMinutesNo.trim();
    const timer = setTimeout(() => {
      apiRequest<PackingCheckResult>(
        `/api/packing/check?scope=general&packingNo=${encodeURIComponent(trimmed)}&mapnaMinutesNo=${encodeURIComponent(minTrimmed)}`,
      )
        .then((res) => {
          setCheckInfo(res);
          if (!res.existsInGeneral) {
            setIsContinuation(false);
          }
          if (!res.isClosed) {
            setAcknowledgeClosed(false);
          }
          if (minTrimmed && res.mapnaMinutesTaken) {
            setMapnaDuplicateError(t.packing.mapnaMinutesDuplicateError);
          } else {
            setMapnaDuplicateError('');
          }
        })
        .catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [packingListNo, mapnaEntryMinutesNo, open, t.packing.mapnaMinutesDuplicateError]);

  if (!open) return null;

  // Duplicate check looks strictly at General so deleted-from-General packings can be re-entered
  const isDuplicatePacking = Boolean(checkInfo?.existsInGeneral);
  const existingGeneralPackages = checkInfo?.generalPackages || checkInfo?.existingPackages || [];

  const addPackageLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const updateLine = (id: string, patch: Partial<PackageLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const pk = packingListNo.trim();
    if (!pk) {
      setFormError(isFa ? 'شماره پکینگ لیست الزامی است.' : 'Packing List No. is required.');
      return;
    }

    if (isDuplicatePacking && !isContinuation) {
      setFormError(
        isFa
          ? 'شماره پکینگ لیست تکراری است. لطفاً مشخص کنید آیا ادامه پکینگ قبلی است یا شماره را اصلاح کنید.'
          : 'Duplicate Packing List No. Please confirm continuation or change the number.',
      );
      return;
    }

    if (checkInfo?.isClosed && !acknowledgeClosed) {
      setFormError(t.packing.closedWarningBody);
      return;
    }

    if (mapnaDuplicateError || checkInfo?.mapnaMinutesTaken) {
      setFormError(t.packing.mapnaMinutesDuplicateError);
      return;
    }

    if (isContinuation && existingGeneralPackages.length > 0) {
      for (const l of lines) {
        const pkg = l.packageNo.trim();
        if (!pkg || existingGeneralPackages.includes(pkg)) {
          setFormError(t.packing.duplicatePackageError);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const effectiveReleaseDate = releaseNo.trim() ? (releaseDate || arrivalDate) : arrivalDate;
      const entries = lines.map((l) => ({
        arrivalDate,
        releaseNo: releaseNo.trim(),
        releaseDate: effectiveReleaseDate,
        supplier,
        dispatchLocation,
        employerEntryMinutesNo,
        mapnaEntryMinutesNo: mapnaEntryMinutesNo.trim(),
        packingListNo: pk,
        packageNo: l.packageNo.trim(),
        itemCount: toOptionalNum(l.itemCount),
        itemDescription: l.itemDescription.trim(),
        island: l.island.trim(),
        system: l.system.trim(),
        subSystem: l.subSystem.trim(),
        unit: l.unit.trim(),
        grossWeight: toOptionalNum(l.grossWeight),
        netWeight: toOptionalNum(l.netWeight),
        lengthCm: toOptionalNum(l.lengthCm),
        widthCm: toOptionalNum(l.widthCm),
        heightCm: toOptionalNum(l.heightCm),
        billOfLadingNo,
        vehicleNo,
        weighbridgeWeight: toOptionalNum(weighbridgeWeight),
        freightCost: toOptionalNum(freightCost),
        driverName,
      }));

      const res = await apiRequest<{ transitUpdated: number }>('/api/general/batch', {
        method: 'POST',
        body: JSON.stringify({
          packingListNo: pk,
          isContinuation,
          acknowledgeClosed,
          entries,
        }),
      });

      notify(
        'success',
        isFa
          ? `پکینگ لیست ${pk} با ${entries.length} نگله ثبت شد${
              res.transitUpdated > 0 ? ' و وضعیت در راه به «رسیده» تغییر یافت' : ''
            }.`
          : `Packing List ${pk} saved (${entries.length} rows)${
              res.transitUpdated > 0 ? ' and In-Transit updated to Arrived' : ''
            }.`,
      );
      triggerAutoSnapshot(`Packing ${pk}`);
      onSaved();

      setSavedNavigationPrompt({
        packingNo: pk,
        firstPackageNo: lines[0]?.packageNo.trim() || '',
        count: entries.length,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to save packing entry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-base font-bold">{t.packing.wizardTitle}</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {isFa
                ? 'ثبت کلی (جنرال) همراه با شماره‌گذاری خودکار ردیف (۱ تا N) و انتقال مشخصات مشترک به جزئیات'
                : 'General registration with auto row numbering (1..N) and shared metadata sync to Detailed'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Post-Save Navigation Prompt ("Go to Detailed?") */}
        {savedNavigationPrompt ? (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-[var(--status-success-bg)] text-[var(--status-success)] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h4 className="text-base font-bold">{t.packing.goDetailedPromptTitle}</h4>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {t.packing.goDetailedPromptBody}
              </p>
              <div className="text-xs font-semibold text-[var(--accent-primary)] pt-1 tabular-nums bidi-plaintext">
                {t.headers.packingListNo}: {savedNavigationPrompt.packingNo}
                {savedNavigationPrompt.firstPackageNo
                  ? ` · ${t.headers.packageNo}: ${savedNavigationPrompt.firstPackageNo}`
                  : ''}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {onGoToDetailed && (
                <button
                  type="button"
                  onClick={() => {
                    const target = savedNavigationPrompt;
                    onClose();
                    onGoToDetailed(target.packingNo, target.firstPackageNo);
                  }}
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2"
                >
                  <span>{t.packing.goDetailedYes}</span>
                  {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.packing.goDetailedNo}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {checkInfo?.existsInTransit && (
                <div className="p-3.5 rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-soft)] flex items-start gap-2.5 text-xs text-[var(--accent-primary)]">
                  <Truck className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t.packing.inTransitAutoNotice}</span>
                </div>
              )}

              {isDuplicatePacking && !isContinuation && (
                <div className="p-4 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-[var(--status-warning)] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-[var(--status-warning)]">
                        {t.packing.duplicatePromptTitle}
                      </div>
                      <p className="text-xs text-[var(--text-primary)] mt-1">
                        {t.packing.duplicatePromptBody}
                      </p>
                      {existingGeneralPackages.length > 0 && (
                        <div className="text-xs text-[var(--text-secondary)] mt-1.5 tabular-nums bidi-plaintext">
                          {isFa ? 'نگله‌های ثبت‌شده قبلی:' : 'Existing packages:'}{' '}
                          <span className="font-semibold" dir="ltr">
                            {existingGeneralPackages.join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsContinuation(true)}
                      className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t.packing.confirmContinuation}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsContinuation(false);
                        setPackingListNo('');
                      }}
                      className="h-8 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-xs font-medium"
                    >
                      {t.packing.rejectContinuation}
                    </button>
                  </div>
                </div>
              )}

              {isDuplicatePacking && isContinuation && (
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[var(--accent-primary)]">
                      {isFa ? 'حالت ادامه پکینگ لیست فعال شد' : 'Continuation Mode Active'}
                    </span>
                    {existingGeneralPackages.length > 0 && (
                      <span className="text-[var(--text-secondary)] ms-2 tabular-nums">
                        ({isFa ? 'نگله‌های موجود:' : 'Existing packages:'}{' '}
                        <span dir="ltr">{existingGeneralPackages.join('، ')}</span>)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsContinuation(false)}
                    className="text-xs underline text-[var(--text-secondary)]"
                  >
                    {t.controls.cancel}
                  </button>
                </div>
              )}

              {checkInfo?.isClosed && (
                <div className="p-4 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-5 h-5 text-[var(--status-danger)] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-bold text-[var(--status-danger)]">
                        {t.packing.closedWarningTitle}
                      </div>
                      <p className="text-xs text-[var(--text-primary)] mt-1">
                        {t.packing.closedWarningBody}
                        {checkInfo.closedAt && (
                          <span className="ms-1 text-[var(--text-muted)] tabular-nums">
                            ({formatDate(checkInfo.closedAt.slice(0, 10))})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeClosed}
                      onChange={(e) => setAcknowledgeClosed(e.target.checked)}
                      className="rounded border-[var(--border-strong)]"
                    />
                    <span>{t.packing.acknowledgeClosed}</span>
                  </label>
                </div>
              )}

              {formError && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs font-medium text-[var(--status-danger)]">
                  {formError}
                </div>
              )}

              {/* Packing Header Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.packingListNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !packingListNo ? 'rtl' : 'ltr'}
                    value={packingListNo}
                    onChange={(e) => setPackingListNo(e.target.value)}
                    placeholder="8000001604"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !packingListNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={arrivalDate}
                  onChange={setArrivalDate}
                />

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.supplier}
                  </label>
                  <input
                    type="text"
                    dir={!supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="samaan-suppliers"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.dispatchLocation}
                  </label>
                  <input
                    type="text"
                    dir={!dispatchLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="samaan-dispatch"
                    value={dispatchLocation}
                    onChange={(e) => setDispatchLocation(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.employerEntryMinutesNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !employerEntryMinutesNo ? 'rtl' : 'ltr'}
                    value={employerEntryMinutesNo}
                    onChange={(e) => setEmployerEntryMinutesNo(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !employerEntryMinutesNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.mapnaEntryMinutesNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !mapnaEntryMinutesNo ? 'rtl' : 'ltr'}
                    value={mapnaEntryMinutesNo}
                    onChange={(e) => setMapnaEntryMinutesNo(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none ${
                      isFa && !mapnaEntryMinutesNo ? 'text-right' : 'text-left'
                    } ${
                      mapnaDuplicateError
                        ? 'border-[var(--status-danger)]'
                        : 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                    }`}
                  />
                  {mapnaDuplicateError && (
                    <p className="text-[11px] text-[var(--status-danger)] mt-1">{mapnaDuplicateError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.releaseNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !releaseNo ? 'rtl' : 'ltr'}
                    value={releaseNo}
                    onChange={(e) => setReleaseNo(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !releaseNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <JalaliDateInput
                    label={t.headers.releaseDate}
                    disabled={!releaseNo.trim()}
                    value={releaseNo.trim() ? releaseDate : arrivalDate}
                    onChange={setReleaseDate}
                  />
                  {!releaseNo.trim() && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {isFa
                        ? 'بدون Release Note برابر تاریخ ورود است'
                        : 'Defaults to Arrival Date when Release Note is empty'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.billOfLadingNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !billOfLadingNo ? 'rtl' : 'ltr'}
                    value={billOfLadingNo}
                    onChange={(e) => setBillOfLadingNo(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !billOfLadingNo ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.vehicleNo}
                  </label>
                  <input
                    type="text"
                    dir={!vehicleNo ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.weighbridgeWeight}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !weighbridgeWeight ? 'rtl' : 'ltr'}
                    value={weighbridgeWeight}
                    onChange={(e) => setWeighbridgeWeight(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !weighbridgeWeight ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.freightCost}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !freightCost ? 'rtl' : 'ltr'}
                    value={freightCost}
                    onChange={(e) => setFreightCost(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                      isFa && !freightCost ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.driverName}
                  </label>
                  <input
                    type="text"
                    dir={!driverName ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
              </div>

              {/* Packages & Items Section */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold">{t.packing.packagesSection}</h4>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      ({t.packing.rowNoAuto})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addPackageLine}
                    className="h-8 px-3 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.packing.addPackage}</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {lines.map((line, index) => (
                    <div
                      key={line.id}
                      className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--accent-primary)] tabular-nums">
                          #{index + 1}
                        </span>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--status-danger)]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.packageNo} *
                          </label>
                          <input
                            type="text"
                            required
                            dir={isFa && !line.packageNo ? 'rtl' : 'ltr'}
                            value={line.packageNo}
                            onChange={(e) => updateLine(line.id, { packageNo: e.target.value })}
                            placeholder="1000004794-28"
                            className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                              isFa && !line.packageNo ? 'text-right' : 'text-left'
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.itemCount}
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            dir={isFa && !line.itemCount ? 'rtl' : 'ltr'}
                            value={line.itemCount}
                            onChange={(e) => updateLine(line.id, { itemCount: e.target.value })}
                            placeholder={isFa ? 'مثلاً ۵' : 'e.g. 5'}
                            className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                              isFa && !line.itemCount ? 'text-right' : 'text-left'
                            }`}
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.itemDescription} *
                          </label>
                          <input
                            type="text"
                            required
                            dir={!line.itemDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                            value={line.itemDescription}
                            onChange={(e) => updateLine(line.id, { itemDescription: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.island}
                          </label>
                          <input
                            type="text"
                            dir={!line.island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                            list="samaan-islands"
                            value={line.island}
                            onChange={(e) => updateLine(line.id, { island: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.system}
                          </label>
                          <input
                            type="text"
                            dir={!line.system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                            list="samaan-systems"
                            value={line.system}
                            onChange={(e) => updateLine(line.id, { system: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.subSystem}
                          </label>
                          <input
                            type="text"
                            dir={!line.subSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                            list="samaan-subsystems"
                            value={line.subSystem}
                            onChange={(e) => updateLine(line.id, { subSystem: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.unit}
                          </label>
                          <input
                            type="text"
                            dir={!line.unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                            list="samaan-units"
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                            className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.grossWeight}
                          </label>
                          <input
                            type="text"
                            dir={isFa && !line.grossWeight ? 'rtl' : 'ltr'}
                            value={line.grossWeight}
                            onChange={(e) => updateLine(line.id, { grossWeight: e.target.value })}
                            className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                              isFa && !line.grossWeight ? 'text-right' : 'text-left'
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                            {t.headers.netWeight}
                          </label>
                          <input
                            type="text"
                            dir={isFa && !line.netWeight ? 'rtl' : 'ltr'}
                            value={line.netWeight}
                            onChange={(e) => updateLine(line.id, { netWeight: e.target.value })}
                            className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)] ${
                              isFa && !line.netWeight ? 'text-right' : 'text-left'
                            }`}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 sm:col-span-2">
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                              {t.headers.lengthCm}
                            </label>
                            <input
                              type="text"
                              dir={isFa && !line.lengthCm ? 'rtl' : 'ltr'}
                              value={line.lengthCm}
                              onChange={(e) => updateLine(line.id, { lengthCm: e.target.value })}
                              className={`w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums ${
                                isFa && !line.lengthCm ? 'text-right' : 'text-left'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                              {t.headers.widthCm}
                            </label>
                            <input
                              type="text"
                              dir={isFa && !line.widthCm ? 'rtl' : 'ltr'}
                              value={line.widthCm}
                              onChange={(e) => updateLine(line.id, { widthCm: e.target.value })}
                              className={`w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums ${
                                isFa && !line.widthCm ? 'text-right' : 'text-left'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                              {t.headers.heightCm}
                            </label>
                            <input
                              type="text"
                              dir={isFa && !line.heightCm ? 'rtl' : 'ltr'}
                              value={line.heightCm}
                              onChange={(e) => updateLine(line.id, { heightCm: e.target.value })}
                              className={`w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums ${
                                isFa && !line.heightCm ? 'text-right' : 'text-left'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category Datalists */}
              <datalist id="samaan-islands">
                {categories.island.map((v) => <option key={v} value={v} />)}
              </datalist>
              <datalist id="samaan-systems">
                {categories.system.map((v) => <option key={v} value={v} />)}
              </datalist>
              <datalist id="samaan-subsystems">
                {categories.subSystem.map((v) => <option key={v} value={v} />)}
              </datalist>
              <datalist id="samaan-units">
                {categories.unit.map((v) => <option key={v} value={v} />)}
              </datalist>
              <datalist id="samaan-suppliers">
                {categories.supplier.map((v) => <option key={v} value={v} />)}
              </datalist>
              <datalist id="samaan-dispatch">
                {categories.dispatchLocation.map((v) => <option key={v} value={v} />)}
              </datalist>
            </form>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                disabled={submitting || Boolean(mapnaDuplicateError)}
                onClick={handleSubmit}
                className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {t.controls.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
