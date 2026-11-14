import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Download,
  Edit3,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv, type CsvColumnDef } from '../lib/csvExport.ts';
import { roundQty } from '../shared/formulas.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from '../shared/generalDescription.ts';
import type {
  CategoryStore,
  DetailedComputed,
  MaterialEstimateRecord,
} from '../shared/types.ts';
import { PrintReportModal } from './PrintReportModal.tsx';

interface MaterialEstimationViewProps {
  categories: CategoryStore;
  refreshSignal: number;
  onDataChanged: () => void;
}

type SupplyStatus = 'fulfilled' | 'partial' | 'not_supplied';

interface EnrichedEstimate extends MaterialEstimateRecord {
  matchedCount: number;
  packingQtySum: number;
  actualReceivedQty: number;
  mapnaStockSum: number;
  issuedSum: number;
  remainingNeed: number;
  surplusOverEstimate: number;
  coveragePct: number;
  supplyStatus: SupplyStatus;
}

function normMatch(val: string | undefined | null): string {
  return (val || '').trim().toLowerCase();
}

export const MaterialEstimationView: React.FC<MaterialEstimationViewProps> = ({
  categories,
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [records, setRecords] = useState<MaterialEstimateRecord[]>([]);
  const [detailedItems, setDetailedItems] = useState<DetailedComputed[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SupplyStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'normal'>('all');
  const [islandFilter, setIslandFilter] = useState('');
  const [printOpen, setPrintOpen] = useState(false);

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaterialEstimateRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedEstimate | null>(null);

  // Form fields
  const [prefillId, setPrefillId] = useState('');
  const [mtoCode, setMtoCode] = useState('');
  const [description, setDescription] = useState('');
  const [generalDescription, setGeneralDescription] = useState('');
  const [generalDescManuallyEdited, setGeneralDescManuallyEdited] = useState(false);
  const [itemCode, setItemCode] = useState('');
  const [size, setSize] = useState('');
  const [estimatedQty, setEstimatedQty] = useState('');
  const [countingUnit, setCountingUnit] = useState('PC');
  const [island, setIsland] = useState('');
  const [system, setSystem] = useState('');
  const [subSystem, setSubSystem] = useState('');
  const [unit, setUnit] = useState('');
  const [priority, setPriority] = useState<'normal' | 'critical'>('normal');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        records: MaterialEstimateRecord[];
        detailedItems: DetailedComputed[];
      }>('/api/estimations');
      setRecords(res.records || []);
      setDetailedItems(res.detailedItems || []);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const enriched = useMemo<EnrichedEstimate[]>(() => {
    return records.map((rec) => {
      const recItemCode = normMatch(rec.itemCode);
      const recMtoCode = normMatch(rec.mtoCode);
      const recDesc = normMatch(rec.description);
      const recSize = normMatch(rec.size);

      const matched = detailedItems.filter((d) => {
        if (recItemCode) {
          return normMatch(d.itemCode) === recItemCode;
        }
        if (recMtoCode) {
          return normMatch(d.mtoRef) === recMtoCode;
        }
        if (!recDesc || normMatch(d.description) !== recDesc) {
          return false;
        }
        if (recSize && normMatch(d.size) && normMatch(d.size) !== recSize) {
          return false;
        }
        return true;
      });

      let packingQtySum = 0;
      let actualReceivedQty = 0;
      let mapnaStockSum = 0;
      let issuedSum = 0;

      for (const d of matched) {
        packingQtySum += d.packingQty ?? 0;
        if (!d.opiPending) {
          actualReceivedQty += d.effectiveActualQty;
        }
        mapnaStockSum += d.mapnaInventory;
        issuedSum += (d.gcvDeliveredQty ?? 0) + (d.mivMapnaQty ?? 0) + (d.mivContractorQty ?? 0);
      }

      packingQtySum = roundQty(packingQtySum);
      actualReceivedQty = roundQty(actualReceivedQty);
      mapnaStockSum = roundQty(mapnaStockSum);
      issuedSum = roundQty(issuedSum);

      const remainingNeed = Math.max(0, roundQty(rec.estimatedQty - actualReceivedQty));
      const surplusOverEstimate = Math.max(0, roundQty(actualReceivedQty - rec.estimatedQty));
      const coveragePct =
        rec.estimatedQty > 0
          ? Math.min(100, Math.round((actualReceivedQty / rec.estimatedQty) * 100))
          : 0;

      let supplyStatus: SupplyStatus = 'not_supplied';
      if (actualReceivedQty >= rec.estimatedQty && rec.estimatedQty > 0) {
        supplyStatus = 'fulfilled';
      } else if (actualReceivedQty > 0 || packingQtySum > 0) {
        supplyStatus = 'partial';
      }

      return {
        ...rec,
        matchedCount: matched.length,
        packingQtySum,
        actualReceivedQty,
        mapnaStockSum,
        issuedSum,
        remainingNeed,
        surplusOverEstimate,
        coveragePct,
        supplyStatus,
      };
    });
  }, [records, detailedItems]);

  const kpis = useMemo(() => {
    let fulfilled = 0;
    let partial = 0;
    let notSupplied = 0;
    for (const r of enriched) {
      if (r.supplyStatus === 'fulfilled') fulfilled += 1;
      else if (r.supplyStatus === 'partial') partial += 1;
      else notSupplied += 1;
    }
    return {
      total: enriched.length,
      fulfilled,
      partial,
      notSupplied,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const cleanQ = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (statusFilter !== 'all' && r.supplyStatus !== statusFilter) return false;
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
      if (islandFilter && r.island !== islandFilter) return false;
      if (!cleanQ) return true;
      const haystack = [
        r.mtoCode,
        r.generalDescription,
        r.description,
        r.itemCode,
        r.size,
        r.island,
        r.system,
        r.subSystem,
        r.unit,
        r.notes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(cleanQ);
    });
  }, [enriched, q, statusFilter, priorityFilter, islandFilter]);

  const uniqueDetailedTemplates = useMemo(() => {
    const seen = new Set<string>();
    const list: DetailedComputed[] = [];
    for (const d of detailedItems) {
      const key = `${normMatch(d.itemCode)}::${normMatch(d.description)}::${normMatch(d.size)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(d);
    }
    return list;
  }, [detailedItems]);

  const fmtNum = (val: number) =>
    isFa ? val.toLocaleString('fa-IR') : val.toLocaleString('en-US');

  const statusLabel = (s: SupplyStatus) => {
    if (s === 'fulfilled') return isFa ? 'تامین کامل' : 'Fulfilled';
    if (s === 'partial') return isFa ? 'تامین ناقص / در جریان' : 'Partial';
    return isFa ? 'تامین‌نشده' : 'Not Supplied';
  };

  const priorityLabel = (p: 'normal' | 'critical') =>
    p === 'critical'
      ? isFa ? 'حیاتی / فوری' : 'Critical'
      : isFa ? 'عادی' : 'Normal';

  const openCreateModal = () => {
    setEditingRecord(null);
    setPrefillId('');
    setMtoCode('');
    setDescription('');
    setGeneralDescription('');
    setGeneralDescManuallyEdited(false);
    setItemCode('');
    setSize('');
    setEstimatedQty('');
    setCountingUnit('PC');
    setIsland('');
    setSystem('');
    setSubSystem('');
    setUnit('');
    setPriority('normal');
    setNotes('');
    setFormOpen(true);
  };

  const openEditModal = (rec: MaterialEstimateRecord) => {
    setEditingRecord(rec);
    setPrefillId('');
    setMtoCode(rec.mtoCode || '');
    setDescription(rec.description || '');
    setGeneralDescription(rec.generalDescription || '');
    setGeneralDescManuallyEdited(true);
    setItemCode(rec.itemCode || '');
    setSize(rec.size || '');
    setEstimatedQty(String(rec.estimatedQty));
    setCountingUnit(rec.countingUnit || 'PC');
    setIsland(rec.island || '');
    setSystem(rec.system || '');
    setSubSystem(rec.subSystem || '');
    setUnit(rec.unit || '');
    setPriority(rec.priority || 'normal');
    setNotes(rec.notes || '');
    setFormOpen(true);
  };

  const handlePrefillChange = (detailedId: string) => {
    setPrefillId(detailedId);
    const d = detailedItems.find((x) => x.id === detailedId);
    if (!d) return;
    setDescription(d.description || '');
    const inferred = d.generalDescription
      ? formatGeneralDescriptionCase(d.generalDescription)
      : inferGeneralDescription(d.description || '');
    setGeneralDescription(inferred);
    setGeneralDescManuallyEdited(false);
    setItemCode(d.itemCode || '');
    setMtoCode(d.mtoRef || '');
    setSize(d.size || '');
    setCountingUnit(d.countingUnit || 'PC');
    setIsland(d.island || '');
    setSystem(d.system || '');
    setSubSystem(d.subSystem || '');
    setUnit(d.unit || '');
    if (!estimatedQty && d.packingQty) {
      setEstimatedQty(String(d.packingQty));
    }
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (!generalDescManuallyEdited) {
      setGeneralDescription(inferGeneralDescription(val));
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = Number(estimatedQty);
    if (!description.trim()) {
      notify(
        'warning',
        isFa ? 'شرح متریال برآورد را وارد کنید.' : 'Enter material description.',
      );
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      notify(
        'warning',
        isFa ? 'مقدار برآورد باید بزرگتر از صفر باشد.' : 'Estimated quantity must be greater than zero.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        mtoCode,
        description,
        generalDescription: generalDescription
          ? formatGeneralDescriptionCase(generalDescription)
          : inferGeneralDescription(description),
        itemCode,
        size,
        estimatedQty: qtyNum,
        countingUnit: countingUnit.trim() || 'PC',
        island,
        system,
        subSystem,
        unit,
        priority,
        notes,
      };

      if (editingRecord) {
        await apiRequest(`/api/estimations/${editingRecord.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'ردیف برآورد متریال ویرایش شد.' : 'Estimation line updated.');
        triggerAutoSnapshot(`Update Estimation ${mtoCode || itemCode || description.slice(0, 20)}`);
      } else {
        await apiRequest('/api/estimations', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'ردیف برآورد متریال ثبت شد.' : 'Estimation line added.');
        triggerAutoSnapshot(`Create Estimation ${mtoCode || itemCode || description.slice(0, 20)}`);
      }

      setFormOpen(false);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/estimations/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', isFa ? 'ردیف برآورد متریال حذف شد.' : 'Estimation line deleted.');
      setDeleteTarget(null);
      triggerAutoSnapshot(`Delete Estimation ${deleteTarget.mtoCode || deleteTarget.description.slice(0, 20)}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const reportColumns = useMemo<CsvColumnDef<EnrichedEstimate>[]>(
    () => [
      { key: 'mtoCode', header: 'MTO', getValue: (r) => r.mtoCode },
      { key: 'generalDescription', header: t.headers.generalDescription, getValue: (r) => r.generalDescription },
      { key: 'description', header: t.headers.description, getValue: (r) => r.description },
      { key: 'itemCode', header: t.headers.itemCode, getValue: (r) => r.itemCode },
      { key: 'size', header: t.headers.size, getValue: (r) => r.size },
      { key: 'countingUnit', header: t.headers.countingUnit, getValue: (r) => r.countingUnit },
      { key: 'estimatedQty', header: isFa ? 'مقدار برآورد' : 'Estimated Qty', getValue: (r) => r.estimatedQty },
      { key: 'packingQtySum', header: t.headers.packingQty, getValue: (r) => r.packingQtySum },
      { key: 'actualReceivedQty', header: isFa ? 'تامین‌شده واقعی (OPI)' : 'Actual Received (OPI)', getValue: (r) => r.actualReceivedQty },
      { key: 'remainingNeed', header: isFa ? 'کسری تا برآورد' : 'Remaining Need', getValue: (r) => r.remainingNeed },
      { key: 'mapnaStockSum', header: t.headers.mapnaInventory, getValue: (r) => r.mapnaStockSum },
      { key: 'issuedSum', header: isFa ? 'مصرف / تحویل‌شده' : 'Issued / Consumed', getValue: (r) => r.issuedSum },
      { key: 'coveragePct', header: isFa ? 'درصد پوشش' : 'Coverage %', getValue: (r) => `${r.coveragePct}%` },
      { key: 'supplyStatus', header: isFa ? 'وضعیت تامین' : 'Supply Status', getValue: (r) => statusLabel(r.supplyStatus) },
      { key: 'priority', header: isFa ? 'اولویت' : 'Priority', getValue: (r) => priorityLabel(r.priority) },
      { key: 'island', header: t.headers.island, getValue: (r) => r.island },
      { key: 'system', header: t.headers.system, getValue: (r) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, getValue: (r) => r.subSystem },
      { key: 'unit', header: t.headers.unit, getValue: (r) => r.unit },
      { key: 'notes', header: t.headers.notes, getValue: (r) => r.notes || '' },
    ],
    [t, isFa],
  );

  return (
    <div className="space-y-4">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            {isFa ? 'کل ردیف‌های برآورد (MTO)' : 'Total MTO Lines'}
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {fmtNum(kpis.total)}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            {isFa ? 'تامین کامل' : 'Fulfilled'}
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--status-success)]">
            {fmtNum(kpis.fulfilled)}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            {isFa ? 'تامین ناقص / در جریان' : 'Partial Supply'}
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--status-warning)]">
            {fmtNum(kpis.partial)}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-[11px] font-medium text-[var(--text-muted)]">
            {isFa ? 'تامین‌نشده (نیازمند خرید)' : 'Not Supplied'}
          </div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-[var(--status-danger)]">
            {fmtNum(kpis.notSupplied)}
          </div>
        </div>
      </div>

      {/* Filters & Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="flex items-center flex-1 min-w-[220px] max-w-md h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                isFa
                  ? 'جستجو در کد MTO، کد کالا، شرح متریال، سیستم...'
                  : 'Search MTO code, item code, description, system...'
              }
              className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | SupplyStatus)}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="all">{isFa ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
            <option value="fulfilled">{isFa ? 'تامین کامل' : 'Fulfilled'}</option>
            <option value="partial">{isFa ? 'تامین ناقص / در جریان' : 'Partial'}</option>
            <option value="not_supplied">{isFa ? 'تامین‌نشده' : 'Not Supplied'}</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | 'critical' | 'normal')}
            className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="all">{isFa ? 'همه اولویت‌ها' : 'All Priorities'}</option>
            <option value="critical">{isFa ? 'حیاتی / فوری' : 'Critical'}</option>
            <option value="normal">{isFa ? 'عادی' : 'Normal'}</option>
          </select>

          {categories.island.length > 0 && (
            <select
              value={islandFilter}
              onChange={(e) => setIslandFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
            >
              <option value="">{isFa ? 'همه جزیره‌ها' : 'All Islands'}</option>
              {categories.island.map((isl) => (
                <option key={isl} value={isl}>
                  {isl}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToCsv({
                filename: 'samaan-material-estimation',
                columns: reportColumns,
                rows: filtered,
                calendar: prefs.calendar,
              })
            }
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

          {canEdit && (
            <button
              type="button"
              onClick={openCreateModal}
              className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isFa ? 'افزودن ردیف برآورد' : 'Add Estimation Line'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Comparison Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">MTO</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{t.headers.generalDescription}</th>
                <th className="py-2.5 px-3 text-start min-w-[220px]">{t.headers.description}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{t.headers.itemCode}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{t.headers.size}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{isFa ? 'برآورد (MTO)' : 'Estimated'}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{isFa ? 'تامین پکینگ' : 'Packing Qty'}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{isFa ? 'رسیده واقعی (OPI)' : 'Actual (OPI)'}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{isFa ? 'کسری تا برآورد' : 'Remaining Need'}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{t.headers.mapnaInventory}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap min-w-[130px]">{isFa ? 'پوشش تامین' : 'Coverage'}</th>
                <th className="py-2.5 px-3 text-start whitespace-nowrap">{isFa ? 'جزیره / سیستم' : 'Island / System'}</th>
                {canEdit && (
                  <th className="py-2.5 px-3 text-end whitespace-nowrap">{isFa ? 'عملیات' : 'Actions'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 13 : 12} className="py-10 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 13 : 12} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                      <Calculator className="w-7 h-7 opacity-40" />
                      <div className="text-xs font-medium">
                        {isFa
                          ? 'هنوز ردیفی در برآورد متریال ثبت نشده است.'
                          : 'No material estimation lines recorded yet.'}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={openCreateModal}
                          className="mt-1 h-8 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isFa ? 'ثبت اولین ردیف برآورد' : 'Add First MTO Line'}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const statusColor =
                    r.supplyStatus === 'fulfilled'
                      ? 'text-[var(--status-success)]'
                      : r.supplyStatus === 'partial'
                        ? 'text-[var(--status-warning)]'
                        : 'text-[var(--status-danger)]';
                  const barColor =
                    r.supplyStatus === 'fulfilled'
                      ? 'bg-[var(--status-success)]'
                      : r.supplyStatus === 'partial'
                        ? 'bg-[var(--status-warning)]'
                        : 'bg-[var(--status-danger)]';

                  return (
                    <tr key={r.id} className="hover:bg-[var(--bg-subtle)]/40">
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums bidi-plaintext font-medium">
                        {r.mtoCode || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap bidi-plaintext text-[var(--text-secondary)]">
                        {r.generalDescription || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium bidi-plaintext">{r.description}</div>
                        {r.priority === 'critical' && (
                          <div className="text-[11px] font-semibold text-[var(--status-danger)] mt-0.5">
                            {isFa ? 'اولویت: حیاتی / فوری' : 'Priority: Critical'}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums bidi-plaintext">
                        {r.itemCode || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums bidi-plaintext">
                        {r.size || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums font-bold">
                        {fmtNum(r.estimatedQty)} <span className="text-[10px] font-normal text-[var(--text-muted)]">{r.countingUnit}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {fmtNum(r.packingQtySum)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums font-semibold">
                        {fmtNum(r.actualReceivedQty)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {r.remainingNeed > 0 ? (
                          <span className="font-bold text-[var(--status-danger)]">{fmtNum(r.remainingNeed)}</span>
                        ) : r.surplusOverEstimate > 0 ? (
                          <span className="text-[var(--status-success)] font-medium">
                            {isFa ? `+${fmtNum(r.surplusOverEstimate)} مازاد` : `+${fmtNum(r.surplusOverEstimate)} excess`}
                          </span>
                        ) : (
                          <span className="text-[var(--status-success)] font-medium">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {fmtNum(r.mapnaStockSum)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className={`text-[11px] font-semibold ${statusColor}`}>
                          {statusLabel(r.supplyStatus)} ({fmtNum(r.coveragePct)}%)
                        </div>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${r.coveragePct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-secondary)]">
                        {[r.island, r.system].filter(Boolean).join(' / ') || '—'}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 px-3 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(r)}
                              title={t.controls.edit}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent-primary)]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              title={t.controls.delete}
                              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Estimation Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setFormOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingRecord
                  ? isFa ? 'ویرایش ردیف برآورد متریال' : 'Edit Material Estimation'
                  : isFa ? 'ثبت ردیف جدید برآورد متریال' : 'New Material Estimation Line'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto space-y-4">
              {!editingRecord && uniqueDetailedTemplates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {isFa
                      ? 'انتخاب سریع از اقلام ثبت‌شده انبار (اختیاری)'
                      : 'Quick Prefill from Detailed Equipment (Optional)'}
                  </label>
                  <select
                    value={prefillId}
                    onChange={(e) => handlePrefillChange(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="">
                      {isFa ? '— ورود دستی مشخصات جدید —' : '— Manual Entry —'}
                    </option>
                    {uniqueDetailedTemplates.map((d) => (
                      <option key={d.id} value={d.id}>
                        {[d.itemCode, d.description, d.size].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.description} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!description ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    placeholder={isFa ? 'مثلاً PIPE 2" SCH80 SMLS A106 GR.B' : 'e.g. PIPE 2" SCH80 SMLS A106 GR.B'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.generalDescription}
                  </label>
                  <input
                    type="text"
                    dir={!generalDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={generalDescription}
                    onChange={(e) => {
                      setGeneralDescManuallyEdited(true);
                      setGeneralDescription(e.target.value);
                    }}
                    placeholder={isFa ? 'تشخیص خودکار یا دستی' : 'Auto-inferred or custom'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'کد MTO / مرجع مهندسی' : 'MTO Code / Ref'}
                  </label>
                  <input
                    type="text"
                    dir={!mtoCode ? (isFa ? 'rtl' : 'ltr') : 'ltr'}
                    value={mtoCode}
                    onChange={(e) => setMtoCode(e.target.value)}
                    placeholder={isFa ? 'مثلاً MTO-PP-104' : 'e.g. MTO-PP-104'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.itemCode}
                  </label>
                  <input
                    type="text"
                    dir={!itemCode ? (isFa ? 'rtl' : 'ltr') : 'ltr'}
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    placeholder={isFa ? 'کد کالا برای تطبیق خودکار' : 'Item code for auto-matching'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.size}
                  </label>
                  <input
                    type="text"
                    dir={!size ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder={isFa ? 'سایز (اختیاری)' : 'Size (optional)'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'مقدار برآورد *' : 'Estimated Qty *'}
                  </label>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    required
                    dir="ltr"
                    value={estimatedQty}
                    onChange={(e) => setEstimatedQty(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums text-left focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.countingUnit}
                  </label>
                  <input
                    type="text"
                    dir={!countingUnit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={countingUnit}
                    onChange={(e) => setCountingUnit(e.target.value)}
                    placeholder="PC / M / KG / SET"
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {isFa ? 'اولویت تامین' : 'Priority'}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'critical')}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                  >
                    <option value="normal">{isFa ? 'عادی' : 'Normal'}</option>
                    <option value="critical">{isFa ? 'حیاتی / فوری' : 'Critical'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.island}
                  </label>
                  <input
                    type="text"
                    list="est-island-list"
                    dir={!island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={island}
                    onChange={(e) => setIsland(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <datalist id="est-island-list">
                    {categories.island.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.system}
                  </label>
                  <input
                    type="text"
                    list="est-system-list"
                    dir={!system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={system}
                    onChange={(e) => setSystem(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <datalist id="est-system-list">
                    {categories.system.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.subSystem}
                  </label>
                  <input
                    type="text"
                    list="est-subsystem-list"
                    dir={!subSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={subSystem}
                    onChange={(e) => setSubSystem(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <datalist id="est-subsystem-list">
                    {categories.subSystem.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t.headers.unit}
                  </label>
                  <input
                    type="text"
                    list="est-unit-list"
                    dir={!unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                  <datalist id="est-unit-list">
                    {categories.unit.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
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
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--status-danger)]">
                {isFa ? 'حذف ردیف برآورد متریال' : 'Delete Estimation Line'}
              </h3>
              <button type="button" onClick={() => setDeleteTarget(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isFa
                ? `آیا از حذف ردیف برآورد «${deleteTarget.description}» اطمینان دارید؟`
                : `Are you sure you want to delete "${deleteTarget.description}" from Material Estimation?`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {t.controls.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-9 px-4 rounded-lg bg-[var(--status-danger)] text-white text-xs font-semibold hover:opacity-90"
              >
                {t.controls.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.materialEstimation}
        columns={reportColumns}
        rows={filtered}
      />
    </div>
  );
};
