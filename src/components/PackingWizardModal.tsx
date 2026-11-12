import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
  rowNo: string;
  packageNo: string;
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
  // Optional linked Detailed material fields
  addDetailed: boolean;
  itemCode: string;
  mtoRef: string;
  packingQty: string;
  actualQty: string;
  damagedQty: string;
  storageLocation: string;
}

interface PackingCheckResult {
  packingNo: string;
  existsInGeneral: boolean;
  existsInDetailed: boolean;
  existsInTransit: boolean;
  existingPackages: string[];
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  nextSuggestedRowNo: string;
}

interface PackingWizardModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: CategoryStore;
  prefillFromTransit?: TransitEntry | null;
  prefillPackingNo?: string;
}

function createEmptyLine(rowNo: string, prefill?: TransitEntry | null): PackageLineDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rowNo,
    packageNo: prefill?.packageNo || '',
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
    addDetailed: false,
    itemCode: '',
    mtoRef: '',
    packingQty: '',
    actualQty: '',
    damagedQty: '',
    storageLocation: '',
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
  categories,
  prefillFromTransit,
  prefillPackingNo,
}) => {
  const { prefs, t, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';

  // Header (Packing-level) fields — Note: کد استراتژی, توضیحات, مدارک صورت وضعبت intentionally omitted
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
  const [opiInvitationNo, setOpiInvitationNo] = useState('');
  const [opiInvitationDate, setOpiInvitationDate] = useState('');
  const [driverName, setDriverName] = useState('');

  const [lines, setLines] = useState<PackageLineDraft[]>([]);
  const [checkInfo, setCheckInfo] = useState<PackingCheckResult | null>(null);
  const [isContinuation, setIsContinuation] = useState(false);
  const [acknowledgeClosed, setAcknowledgeClosed] = useState(false);
  const [rowValidationErrors, setRowValidationErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setRowValidationErrors({});
    setIsContinuation(Boolean(prefillPackingNo));
    setAcknowledgeClosed(false);

    const pkInit = prefillFromTransit?.packingListNo || prefillPackingNo || '';
    setPackingListNo(pkInit);
    setArrivalDate(prefillFromTransit?.arrivalDate || getTodayIso());
    setReleaseNo(prefillFromTransit?.releaseNetNo || '');
    setReleaseDate(prefillFromTransit?.releaseNetDate || '');
    setSupplier(prefillFromTransit?.supplier || '');
    setDispatchLocation(prefillFromTransit?.dispatchLocation || '');
    setEmployerEntryMinutesNo('');
    setMapnaEntryMinutesNo('');
    setBillOfLadingNo(prefillFromTransit?.billOfLadingNo || '');
    setVehicleNo('');
    setWeighbridgeWeight('');
    setFreightCost(prefillFromTransit?.amount ? String(prefillFromTransit.amount) : '');
    setOpiInvitationNo('');
    setOpiInvitationDate('');
    setDriverName('');

    apiRequest<PackingCheckResult>(
      `/api/packing/check?scope=general&packingNo=${encodeURIComponent(pkInit)}`,
    )
      .then((res) => {
        setCheckInfo(res);
        setLines([createEmptyLine(res.nextSuggestedRowNo, prefillFromTransit)]);
      })
      .catch(() => {
        setLines([createEmptyLine('1', prefillFromTransit)]);
      });
  }, [open, prefillFromTransit, prefillPackingNo]);

  // Live check whenever Packing List No. changes
  useEffect(() => {
    if (!open) return;
    const trimmed = packingListNo.trim();
    const timer = setTimeout(() => {
      apiRequest<PackingCheckResult>(
        `/api/packing/check?scope=general&packingNo=${encodeURIComponent(trimmed)}`,
      )
        .then((res) => {
          setCheckInfo(res);
          if (!res.existsInGeneral && !res.existsInDetailed) {
            setIsContinuation(false);
          }
          if (!res.isClosed) {
            setAcknowledgeClosed(false);
          }
        })
        .catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [packingListNo, open]);

  if (!open) return null;

  const isDuplicatePacking =
    Boolean(checkInfo) && (checkInfo!.existsInGeneral || checkInfo!.existsInDetailed);

  const handleRowNoBlur = async (lineId: string, rowNo: string) => {
    const clean = rowNo.trim();
    if (!clean) return;
    // Local duplicate check inside current draft lines
    const localDup = lines.some((l) => l.id !== lineId && l.rowNo.trim() === clean);
    if (localDup) {
      setRowValidationErrors((prev) => ({ ...prev, [lineId]: t.packing.rowNoDuplicate }));
      return;
    }
    try {
      const res = await apiRequest<{ rowNoTaken: boolean }>(
        `/api/packing/check?scope=general&rowNo=${encodeURIComponent(clean)}`,
      );
      setRowValidationErrors((prev) => {
        const next = { ...prev };
        if (res.rowNoTaken) {
          next[lineId] = t.packing.rowNoDuplicate;
        } else {
          delete next[lineId];
        }
        return next;
      });
    } catch {
      // Ignore network hiccup
    }
  };

  const addPackageLine = () => {
    const usedNums = lines
      .map((l) => Number(l.rowNo))
      .filter((n) => Number.isInteger(n) && n > 0);
    const baseNext = Number(checkInfo?.nextSuggestedRowNo || '1');
    const nextNum = Math.max(baseNext, ...(usedNums.length ? usedNums : [0])) + (usedNums.length ? 1 : 0);
    setLines((prev) => [...prev, createEmptyLine(String(nextNum))]);
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

    if (Object.keys(rowValidationErrors).length > 0) {
      setFormError(t.packing.rowNoDuplicate);
      return;
    }

    // Validate distinct packageNo on continuation
    if (isContinuation && checkInfo?.existingPackages.length) {
      for (const l of lines) {
        const pkg = l.packageNo.trim();
        if (!pkg || checkInfo.existingPackages.includes(pkg)) {
          setFormError(t.packing.duplicatePackageError);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const entries = lines.map((l) => ({
        rowNo: l.rowNo.trim(),
        arrivalDate,
        releaseNo,
        releaseDate,
        supplier,
        dispatchLocation,
        employerEntryMinutesNo,
        mapnaEntryMinutesNo,
        packingListNo: pk,
        packageNo: l.packageNo.trim(),
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
        opiInvitationNo,
        opiInvitationDate,
        driverName,
      }));

      const detailedItems = lines
        .filter((l) => l.addDetailed)
        .map((l, idx) => ({
          arrivalDate,
          supplier,
          origin: dispatchLocation,
          shipmentNo: pk,
          packageNo: l.packageNo.trim(),
          itemNo: String(idx + 1),
          generalDescription: l.itemDescription.trim(),
          description: l.itemDescription.trim(),
          itemCode: l.itemCode.trim(),
          mtoRef: l.mtoRef.trim(),
          packingQty: toOptionalNum(l.packingQty),
          actualQty: toOptionalNum(l.actualQty),
          damagedQty: toOptionalNum(l.damagedQty),
          island: l.island.trim(),
          system: l.system.trim(),
          subSystem: l.subSystem.trim(),
          unit: l.unit.trim(),
          storageLocation: l.storageLocation.trim(),
          opiNo: opiInvitationNo,
          opiDate: opiInvitationDate,
        }));

      const res = await apiRequest<{ transitUpdated: number }>('/api/general/batch', {
        method: 'POST',
        body: JSON.stringify({
          packingListNo: pk,
          isContinuation,
          acknowledgeClosed,
          entries,
          detailedItems,
        }),
      });

      notify(
        'success',
        isFa
          ? `پکینگ لیست ${pk} با ${entries.length} نگله/آیتم ثبت شد${
              res.transitUpdated > 0 ? ' و وضعیت در راه به «رسیده» تغییر یافت' : ''
            }.`
          : `Packing List ${pk} saved (${entries.length} rows)${
              res.transitUpdated > 0 ? ' and In-Transit updated to Arrived' : ''
            }.`,
      );
      triggerAutoSnapshot(`Packing ${pk}`);
      onSaved();
      onClose();
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
                ? 'ساختار سلسله‌مراتبی پکینگ ← نگله ← اقلام (با پیوند مستقیم به بخش جزئیات)'
                : 'Hierarchical Packing → Package (نگله) → Items entry (linked to Detailed)'}
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Validation & Domain Alerts */}
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
                  {checkInfo!.existingPackages.length > 0 && (
                    <div className="text-xs text-[var(--text-secondary)] mt-1.5 tabular-nums">
                      {isFa ? 'نگله‌های ثبت‌شده قبلی:' : 'Existing packages:'}{' '}
                      <span className="font-semibold">{checkInfo!.existingPackages.join(' · ')}</span>
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
                {checkInfo!.existingPackages.length > 0 && (
                  <span className="text-[var(--text-secondary)] ms-2 tabular-nums">
                    ({isFa ? 'نگله‌های موجود:' : 'Existing packages:'}{' '}
                    {checkInfo!.existingPackages.join('، ')})
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
                dir="ltr"
                value={packingListNo}
                onChange={(e) => setPackingListNo(e.target.value)}
                placeholder="8000001604"
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
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
                list="samaan-suppliers"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.dispatchLocation}
              </label>
              <input
                type="text"
                list="samaan-dispatch"
                value={dispatchLocation}
                onChange={(e) => setDispatchLocation(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.employerEntryMinutesNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={employerEntryMinutesNo}
                onChange={(e) => setEmployerEntryMinutesNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.mapnaEntryMinutesNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={mapnaEntryMinutesNo}
                onChange={(e) => setMapnaEntryMinutesNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.releaseNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={releaseNo}
                onChange={(e) => setReleaseNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <JalaliDateInput
              label={t.headers.releaseDate}
              value={releaseDate}
              onChange={setReleaseDate}
            />

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.billOfLadingNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={billOfLadingNo}
                onChange={(e) => setBillOfLadingNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.vehicleNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.weighbridgeWeight}
              </label>
              <input
                type="text"
                dir="ltr"
                value={weighbridgeWeight}
                onChange={(e) => setWeighbridgeWeight(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.freightCost}
              </label>
              <input
                type="text"
                dir="ltr"
                value={freightCost}
                onChange={(e) => setFreightCost(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.opiInvitationNo}
              </label>
              <input
                type="text"
                dir="ltr"
                value={opiInvitationNo}
                onChange={(e) => setOpiInvitationNo(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <JalaliDateInput
              label={t.headers.opiInvitationDate}
              value={opiInvitationDate}
              onChange={setOpiInvitationDate}
            />

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {t.headers.driverName}
              </label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Packages & Items Section */}
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-bold">{t.packing.packagesSection}</h4>
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
                        {t.headers.rowNo} *
                      </label>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={line.rowNo}
                        onChange={(e) => updateLine(line.id, { rowNo: e.target.value })}
                        onBlur={(e) => handleRowNoBlur(line.id, e.target.value)}
                        className={`w-full h-9 px-3 rounded-lg border bg-[var(--bg-surface)] text-sm tabular-nums focus:outline-none ${
                          rowValidationErrors[line.id]
                            ? 'border-[var(--status-danger)]'
                            : 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                        }`}
                      />
                      {rowValidationErrors[line.id] && (
                        <p className="text-[11px] text-[var(--status-danger)] mt-1">
                          {rowValidationErrors[line.id]}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.packageNo} *
                      </label>
                      <input
                        type="text"
                        required
                        dir="ltr"
                        value={line.packageNo}
                        onChange={(e) => updateLine(line.id, { packageNo: e.target.value })}
                        placeholder="1000004794-28"
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.itemDescription} *
                      </label>
                      <input
                        type="text"
                        required
                        value={line.itemDescription}
                        onChange={(e) => updateLine(line.id, { itemDescription: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.island}
                      </label>
                      <input
                        type="text"
                        list="samaan-islands"
                        value={line.island}
                        onChange={(e) => updateLine(line.id, { island: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.system}
                      </label>
                      <input
                        type="text"
                        list="samaan-systems"
                        value={line.system}
                        onChange={(e) => updateLine(line.id, { system: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.subSystem}
                      </label>
                      <input
                        type="text"
                        list="samaan-subsystems"
                        value={line.subSystem}
                        onChange={(e) => updateLine(line.id, { subSystem: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.unit}
                      </label>
                      <input
                        type="text"
                        list="samaan-units"
                        value={line.unit}
                        onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.grossWeight}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={line.grossWeight}
                        onChange={(e) => updateLine(line.id, { grossWeight: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                        {t.headers.netWeight}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={line.netWeight}
                        onChange={(e) => updateLine(line.id, { netWeight: e.target.value })}
                        className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 sm:col-span-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                          {t.headers.lengthCm}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={line.lengthCm}
                          onChange={(e) => updateLine(line.id, { lengthCm: e.target.value })}
                          className="w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                          {t.headers.widthCm}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={line.widthCm}
                          onChange={(e) => updateLine(line.id, { widthCm: e.target.value })}
                          className="w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                          {t.headers.heightCm}
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={line.heightCm}
                          onChange={(e) => updateLine(line.id, { heightCm: e.target.value })}
                          className="w-full h-9 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Optional Quick Detailed Link */}
                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={line.addDetailed}
                        onChange={(e) => updateLine(line.id, { addDetailed: e.target.checked })}
                      />
                      <span>{t.packing.alsoAddDetailed}</span>
                    </label>

                    {line.addDetailed && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.itemCode}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={line.itemCode}
                            onChange={(e) => updateLine(line.id, { itemCode: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.mtoRef}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={line.mtoRef}
                            onChange={(e) => updateLine(line.id, { mtoRef: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.packingQty}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={line.packingQty}
                            onChange={(e) => updateLine(line.id, { packingQty: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.actualQty}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={line.actualQty}
                            onChange={(e) => updateLine(line.id, { actualQty: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.damagedQty}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={line.damagedQty}
                            onChange={(e) => updateLine(line.id, { damagedQty: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                            {t.headers.storageLocation}
                          </label>
                          <input
                            type="text"
                            list="samaan-storage"
                            value={line.storageLocation}
                            onChange={(e) => updateLine(line.id, { storageLocation: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                          />
                        </div>
                      </div>
                    )}
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
          <datalist id="samaan-storage">
            {categories.storageLocation.map((v) => <option key={v} value={v} />)}
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
            disabled={submitting}
            onClick={handleSubmit}
            className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {t.controls.save}
          </button>
        </div>
      </div>
    </div>
  );
};
