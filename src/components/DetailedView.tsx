import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Link2,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { exportRowsToCsv } from '../lib/csvExport.ts';
import { computeSelectionFormulaSummary } from '../shared/formulas.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from '../shared/generalDescription.ts';
import { getTodayIso } from '../shared/jalali.ts';
import type {
  CategoryStore,
  DetailedComputed,
  DetailedEntry,
  SelectionFormulaSummary,
} from '../shared/types.ts';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { JalaliDateInput } from './JalaliDateInput.tsx';
import { PrintReportModal } from './PrintReportModal.tsx';
import { SelectionSummaryBar } from './SelectionSummaryBar.tsx';

interface DetailedListResponse {
  items: DetailedComputed[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filteredSummary: SelectionFormulaSummary;
}

interface GeneralSharedInfo {
  arrivalDate: string;
  supplier: string;
  dispatchLocation: string;
  island: string;
  system: string;
  subSystem: string;
  unit: string;
  packageNo: string;
  expectedItemCount?: number | null;
  existingDetailedCount?: number;
  packageCounts?: Record<string, number | null>;
  packagesForPacking?: string[];
}

interface GeneralLookupResponse {
  packings: string[];
  packagesForPacking: string[];
  shared: GeneralSharedInfo | null;
  lastDetailedDefaults: {
    shipmentNo: string;
    packageNo: string;
    countingUnit: string;
  };
}

interface PackingDetailedCheckResponse {
  packingNo: string;
  existsInGeneral: boolean;
  isClosed: boolean;
  itemNoTaken: boolean;
  nextSuggestedItemNo: string;
  linkedGeneral: GeneralSharedInfo | null;
  lastDetailedDefaults: {
    shipmentNo: string;
    packageNo: string;
    countingUnit: string;
  };
}

interface DetailedViewProps {
  categories: CategoryStore;
  refreshSignal: number;
  initialShipmentFilter?: string;
  initialPackageFilter?: string;
  autoOpenToken?: number;
  onConsumeAutoOpen?: () => void;
  onDataChanged: () => void;
}

function emptyDetailedDraft(): Partial<DetailedEntry> {
  return {
    rowNo: '',
    arrivalDate: getTodayIso(),
    supplier: '',
    origin: '',
    shipmentNo: '',
    packageNo: '',
    itemNo: '1',
    generalDescription: '',
    description: '',
    size: '',
    itemCode: '',
    packingQty: null,
    actualQty: null,
    damagedQty: null,
    mtoRef: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: '',
    island: '',
    system: '',
    subSystem: '',
    unit: '',
    opiNo: '',
    opiDate: '',
    merNo: '',
    merStatus: '',
    notes: '',
    materialBalanceNo: '',
    balanceStatus: '',
    storageLocation: '',
    gcvReceiptNo: '',
    receiver: '',
    gcvDeliveredQty: null,
    mivContractorNo: '',
    mivContractorDate: '',
    mivContractorQty: null,
    smrContractorNo: '',
    smrContractorDate: '',
    smrContractorQty: null,
    smrContractorNote: '',
    smrMapnaNo: '',
    smrMapnaDate: '',
    smrMapnaQty: null,
    smrMapnaNote: '',
    mivMapnaNo: '',
    mivMapnaDate: '',
    mivMapnaQty: null,
    stocktakeInfo: '',
    stocktakeStatus: '',
    stocktakeDate: '',
  };
}

const COUNTING_UNIT_SUGGESTIONS = ['PC', 'PCs', 'SET', 'M', 'KG', 'BOX', 'ROLL', 'PAIR'];

export const DetailedView: React.FC<DetailedViewProps> = ({
  categories,
  refreshSignal,
  initialShipmentFilter = '',
  initialPackageFilter = '',
  autoOpenToken = 0,
  onConsumeAutoOpen,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [q, setQ] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState(initialShipmentFilter);
  const [packageFilter, setPackageFilter] = useState(initialPackageFilter);
  const [island, setIsland] = useState('');
  const [system, setSystem] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [damagedOnly, setDamagedOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [hideEmptyCols, setHideEmptyCols] = useState(true);

  const [data, setData] = useState<DetailedListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMap, setSelectedMap] = useState<Record<string, DetailedComputed>>({});
  const [inspected, setInspected] = useState<DetailedComputed | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // Add/Edit Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DetailedEntry>>(emptyDetailedDraft());
  const [closedWarningVisible, setClosedWarningVisible] = useState(false);
  const [ackClosed, setAckClosed] = useState(false);
  const [rowError, setRowError] = useState('');
  const [itemNoTaken, setItemNoTaken] = useState(false);
  const [itemNoManual, setItemNoManual] = useState(false);
  const [genDescManual, setGenDescManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [knownPackings, setKnownPackings] = useState<string[]>([]);
  const [knownPackages, setKnownPackages] = useState<string[]>([]);
  const [linkedGeneral, setLinkedGeneral] = useState<GeneralSharedInfo | null>(null);

  // Safe Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState<DetailedComputed | null>(null);

  // Shortage Backfill Modal
  const [backfillTarget, setBackfillTarget] = useState<DetailedComputed | null>(null);
  const [backfillQty, setBackfillQty] = useState('');
  const [backfillDate, setBackfillDate] = useState(getTodayIso());
  const [backfillShipmentNo, setBackfillShipmentNo] = useState('');
  const [backfillPackageNo, setBackfillPackageNo] = useState('');
  const [backfillNote, setBackfillNote] = useState('');

  const lastAutoOpenTokenRef = useRef(0);

  useEffect(() => {
    setShipmentFilter(initialShipmentFilter);
    setPackageFilter(initialPackageFilter);
    setPage(1);
  }, [initialShipmentFilter, initialPackageFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        ...(q ? { q } : {}),
        ...(shipmentFilter ? { shipmentNo: shipmentFilter } : {}),
        ...(packageFilter ? { packageNo: packageFilter } : {}),
        ...(island ? { island } : {}),
        ...(system ? { system } : {}),
        ...(storageLocation ? { storageLocation } : {}),
        ...(shortageOnly ? { shortageOnly: 'true' } : {}),
        ...(damagedOnly ? { damagedOnly: 'true' } : {}),
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
      });
      const res = await apiRequest<DetailedListResponse>(`/api/detailed?${params.toString()}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    q,
    shipmentFilter,
    packageFilter,
    island,
    system,
    storageLocation,
    shortageOnly,
    damagedOnly,
    fromDate,
    toDate,
    notify,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const openCreateModal = useCallback(
    async (overrideShipment?: string, overridePackage?: string) => {
      setEditingId(null);
      setClosedWarningVisible(false);
      setAckClosed(false);
      setRowError('');
      setItemNoTaken(false);
      setItemNoManual(false);
      setGenDescManual(false);

      const base = emptyDetailedDraft();
      const targetShipment = (overrideShipment ?? shipmentFilter).trim();
      const targetPackage = (overridePackage ?? packageFilter).trim();

      try {
        const lookup = await apiRequest<GeneralLookupResponse>(
          `/api/general/lookup?packingNo=${encodeURIComponent(targetShipment)}&packageNo=${encodeURIComponent(targetPackage)}`,
        );
        setKnownPackings(lookup.packings || []);
        setKnownPackages(lookup.packagesForPacking || []);

        const finalShipment = targetShipment || lookup.lastDetailedDefaults.shipmentNo || '';
        const finalPackage =
          targetPackage ||
          (finalShipment === lookup.lastDetailedDefaults.shipmentNo
            ? lookup.lastDetailedDefaults.packageNo
            : '') ||
          '';

        const check = await apiRequest<PackingDetailedCheckResponse>(
          `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(finalShipment)}&packageNo=${encodeURIComponent(finalPackage)}`,
        );

        const shared = check.linkedGeneral;
        setLinkedGeneral(shared);
        setClosedWarningVisible(check.isClosed);

        setDraft({
          ...base,
          shipmentNo: finalShipment,
          packageNo: finalPackage,
          itemNo: check.nextSuggestedItemNo || '1',
          countingUnit: lookup.lastDetailedDefaults.countingUnit || 'PC',
          arrivalDate: shared?.arrivalDate || base.arrivalDate,
          supplier: shared?.supplier || '',
          origin: shared?.dispatchLocation || '',
          island: shared?.island || '',
          system: shared?.system || '',
          subSystem: shared?.subSystem || '',
          unit: shared?.unit || '',
          generalDescription: '',
        });
      } catch {
        setLinkedGeneral(null);
        setDraft({
          ...base,
          shipmentNo: targetShipment,
          packageNo: targetPackage,
          itemNo: '1',
          countingUnit: 'PC',
        });
      }
      setFormModalOpen(true);
    },
    [shipmentFilter, packageFilter],
  );

  // Trigger modal when user arrives from General post-save prompt
  useEffect(() => {
    if (autoOpenToken > 0 && autoOpenToken !== lastAutoOpenTokenRef.current) {
      lastAutoOpenTokenRef.current = autoOpenToken;
      onConsumeAutoOpen?.();
      if (canEdit) {
        openCreateModal(initialShipmentFilter, initialPackageFilter);
      }
    }
  }, [autoOpenToken, initialShipmentFilter, initialPackageFilter, canEdit, openCreateModal, onConsumeAutoOpen]);

  // Live check when Shipment No, Package No, or Item No changes inside the modal
  useEffect(() => {
    if (!formModalOpen) return;
    const pk = (draft.shipmentNo || '').trim();
    const pkg = (draft.packageNo || '').trim();
    const itm = (draft.itemNo || '').trim();
    if (!pk) {
      setLinkedGeneral(null);
      setKnownPackages([]);
      setItemNoTaken(false);
      setClosedWarningVisible(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const [check, lookup] = await Promise.all([
          apiRequest<PackingDetailedCheckResponse>(
            `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(pk)}&packageNo=${encodeURIComponent(pkg)}&itemNo=${encodeURIComponent(itm)}${
              editingId ? `&excludeId=${encodeURIComponent(editingId)}` : ''
            }`,
          ),
          apiRequest<GeneralLookupResponse>(
            `/api/general/lookup?packingNo=${encodeURIComponent(pk)}&packageNo=${encodeURIComponent(pkg)}`,
          ),
        ]);
        setKnownPackings(lookup.packings || []);
        setKnownPackages(lookup.packagesForPacking || []);
        setClosedWarningVisible(check.isClosed);
        setItemNoTaken(Boolean(check.itemNoTaken));
        setLinkedGeneral(check.linkedGeneral);

        if (!editingId) {
          setDraft((prev) => {
            const shared = check.linkedGeneral;
            const next = { ...prev };
            if (!itemNoManual && check.nextSuggestedItemNo) {
              next.itemNo = check.nextSuggestedItemNo;
            }
            if (shared) {
              if (shared.arrivalDate) next.arrivalDate = shared.arrivalDate;
              if (shared.supplier) next.supplier = shared.supplier;
              if (shared.dispatchLocation) next.origin = shared.dispatchLocation;
              if (shared.island) next.island = shared.island;
              if (shared.system) next.system = shared.system;
              if (shared.subSystem) next.subSystem = shared.subSystem;
              if (shared.unit) next.unit = shared.unit;
            }
            return next;
          });
        }
      } catch {
        // Ignore transient lookup issues
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [formModalOpen, draft.shipmentNo, draft.packageNo, draft.itemNo, editingId, itemNoManual]);

  const items = data?.items || [];
  const selectedRows = Object.values(selectedMap);
  const activeSummary = useMemo(() => {
    if (selectedRows.length > 0) {
      return computeSelectionFormulaSummary({ detailed: selectedRows });
    }
    return (
      data?.filteredSummary || {
        count: 0,
        grossWeightSum: 0,
        netWeightSum: 0,
        weighbridgeWeightSum: 0,
        freightCostSum: 0,
        packingQtySum: 0,
        actualQtySum: 0,
        effectiveActualQtySum: 0,
        shortageSum: 0,
        surplusSum: 0,
        damagedQtySum: 0,
        gcvDeliveredSum: 0,
        mapnaInventorySum: 0,
        contractorInventorySum: 0,
        mivContractorQtySum: 0,
        smrContractorQtySum: 0,
        smrMapnaQtySum: 0,
        mivMapnaQtySum: 0,
        transitAmountSum: 0,
      }
    );
  }, [selectedRows, data]);

  // Note: Alerts column removed cleanly; empty columns auto-hidden when hideEmptyCols=true
  const columns = useMemo(
    () => [
      { key: 'rowNo', header: t.headers.rowNo, isNum: true, isLtr: true, get: (r: DetailedComputed) => r.rowNo },
      { key: 'arrivalDate', header: t.headers.arrivalDate, isDate: true, isLtr: true, get: (r: DetailedComputed) => r.arrivalDate },
      { key: 'shipmentNo', header: t.headers.shipmentNo, isLtr: true, get: (r: DetailedComputed) => r.shipmentNo },
      { key: 'packageNo', header: t.headers.packageNo, isLtr: true, get: (r: DetailedComputed) => r.packageNo },
      { key: 'itemNo', header: t.headers.itemNo, isLtr: true, get: (r: DetailedComputed) => r.itemNo },
      { key: 'generalDescription', header: t.headers.generalDescription, get: (r: DetailedComputed) => r.generalDescription },
      { key: 'description', header: t.headers.description, get: (r: DetailedComputed) => r.description },
      { key: 'size', header: t.headers.size, isLtr: true, get: (r: DetailedComputed) => r.size },
      { key: 'itemCode', header: t.headers.itemCode, isLtr: true, get: (r: DetailedComputed) => r.itemCode },
      { key: 'mtoRef', header: t.headers.mtoRef, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mtoRef },
      { key: 'packingQty', header: t.headers.packingQty, isNum: true, isLtr: true, get: (r: DetailedComputed) => r.packingQty },
      { key: 'actualQty', header: t.headers.actualQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.actualQty },
      { key: 'shortage', header: t.headers.shortage, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => (r.shortage > 0 ? r.shortage : null) },
      { key: 'surplus', header: t.headers.surplus, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => (r.surplus > 0 ? r.surplus : null) },
      { key: 'damagedQty', header: t.headers.damagedQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.damagedQty },
      { key: 'countingUnit', header: t.headers.countingUnit, isLtr: true, get: (r: DetailedComputed) => r.countingUnit },
      { key: 'repNo', header: t.headers.repNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.repNo },
      { key: 'repStatus', header: t.headers.repStatus, hideInTable: true, get: (r: DetailedComputed) => r.repStatus },
      { key: 'repDescription', header: t.headers.repDescription, hideInTable: true, get: (r: DetailedComputed) => r.repDescription },
      { key: 'supplier', header: t.headers.supplier, get: (r: DetailedComputed) => r.supplier },
      { key: 'origin', header: t.headers.origin, hideInTable: true, get: (r: DetailedComputed) => r.origin },
      { key: 'island', header: t.headers.island, get: (r: DetailedComputed) => r.island },
      { key: 'system', header: t.headers.system, get: (r: DetailedComputed) => r.system },
      { key: 'subSystem', header: t.headers.subSystem, get: (r: DetailedComputed) => r.subSystem },
      { key: 'unit', header: t.headers.unit, get: (r: DetailedComputed) => r.unit },
      { key: 'opiNo', header: t.headers.opiNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.opiNo },
      { key: 'opiDate', header: t.headers.opiDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.opiDate },
      { key: 'merNo', header: t.headers.merNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.merNo },
      { key: 'merStatus', header: t.headers.merStatus, hideInTable: true, get: (r: DetailedComputed) => r.merStatus },
      { key: 'storageLocation', header: t.headers.storageLocation, get: (r: DetailedComputed) => r.storageLocation },
      { key: 'gcvReceiptNo', header: t.headers.gcvReceiptNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.gcvReceiptNo },
      { key: 'receiver', header: t.headers.receiver, get: (r: DetailedComputed) => r.receiver },
      { key: 'gcvDeliveredQty', header: t.headers.gcvDeliveredQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.gcvDeliveredQty },
      {
        key: 'mapnaInventory',
        header: t.headers.mapnaInventory,
        isNum: true,
        isLtr: true,
        hideInTable: true,
        get: (r: DetailedComputed) => (r.opiPending ? null : r.mapnaInventory),
      },
      { key: 'mivContractorNo', header: t.headers.mivContractorNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivContractorNo },
      { key: 'mivContractorDate', header: t.headers.mivContractorDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivContractorDate },
      { key: 'mivContractorQty', header: t.headers.mivContractorQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivContractorQty },
      {
        key: 'contractorInventory',
        header: t.headers.contractorInventory,
        isNum: true,
        isLtr: true,
        hideInTable: true,
        get: (r: DetailedComputed) => (r.contractorInventory > 0 ? r.contractorInventory : null),
      },
      { key: 'smrContractorNo', header: t.headers.smrContractorNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrContractorNo },
      { key: 'smrContractorDate', header: t.headers.smrContractorDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrContractorDate },
      { key: 'smrContractorQty', header: t.headers.smrContractorQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrContractorQty },
      { key: 'materialBalanceNo', header: t.headers.materialBalanceNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.materialBalanceNo },
      { key: 'balanceStatus', header: t.headers.balanceStatus, hideInTable: true, get: (r: DetailedComputed) => r.balanceStatus },
      { key: 'smrMapnaNo', header: t.headers.smrMapnaNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrMapnaNo },
      { key: 'smrMapnaDate', header: t.headers.smrMapnaDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrMapnaDate },
      { key: 'smrMapnaQty', header: t.headers.smrMapnaQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.smrMapnaQty },
      { key: 'mivMapnaNo', header: t.headers.mivMapnaNo, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivMapnaNo },
      { key: 'mivMapnaDate', header: t.headers.mivMapnaDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivMapnaDate },
      { key: 'mivMapnaQty', header: t.headers.mivMapnaQty, isNum: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.mivMapnaQty },
      { key: 'stocktakeStatus', header: t.headers.stocktakeStatus, hideInTable: true, get: (r: DetailedComputed) => r.stocktakeStatus || '' },
      { key: 'stocktakeDate', header: t.headers.stocktakeDate, isDate: true, isLtr: true, hideInTable: true, get: (r: DetailedComputed) => r.stocktakeDate || '' },
      { key: 'stocktakeInfo', header: t.headers.stocktakeInfo, hideInTable: true, get: (r: DetailedComputed) => r.stocktakeInfo },
      { key: 'notes', header: t.headers.notes, get: (r: DetailedComputed) => r.notes },
    ],
    [t],
  );

  // Exclude summary-only operational columns from main table and hide empty columns when hideEmptyCols=true
  const visibleColumns = useMemo(() => {
    const tableCols = columns.filter((col) => !col.hideInTable);
    if (!hideEmptyCols || items.length === 0) return tableCols;
    return tableCols.filter((col) =>
      items.some((row) => {
        const val = col.get(row);
        return val !== null && val !== undefined && String(val).trim() !== '';
      }),
    );
  }, [columns, items, hideEmptyCols]);

  const openEditModal = async (row: DetailedComputed) => {
    setEditingId(row.id);
    setDraft({ ...row });
    setRowError('');
    setAckClosed(false);
    setItemNoTaken(false);
    setItemNoManual(true);
    setGenDescManual(Boolean(row.generalDescription));
    try {
      const [check, lookup] = await Promise.all([
        apiRequest<PackingDetailedCheckResponse>(
          `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(row.shipmentNo)}&packageNo=${encodeURIComponent(row.packageNo)}&itemNo=${encodeURIComponent(row.itemNo)}&excludeId=${encodeURIComponent(row.id)}`,
        ),
        apiRequest<GeneralLookupResponse>(
          `/api/general/lookup?packingNo=${encodeURIComponent(row.shipmentNo)}&packageNo=${encodeURIComponent(row.packageNo)}`,
        ),
      ]);
      setClosedWarningVisible(check.isClosed);
      setLinkedGeneral(check.linkedGeneral);
      setKnownPackings(lookup.packings || []);
      setKnownPackages(lookup.packagesForPacking || []);
    } catch {
      setClosedWarningVisible(false);
      setLinkedGeneral(null);
    }
    setFormModalOpen(true);
  };

  const handlePackingQtyChange = (valStr: string) => {
    const qty = valStr.trim() === '' ? null : Number(valStr);
    setDraft((prev) => {
      const currentUnit = (prev.countingUnit || '').trim();
      const upper = currentUnit.toUpperCase();
      let nextUnit = currentUnit;
      if (!currentUnit || upper === 'PC' || upper === 'PCS') {
        if (qty !== null && Number.isFinite(qty)) {
          nextUnit = qty === 1 ? 'PC' : 'PCs';
        }
      }
      return { ...prev, packingQty: qty, countingUnit: nextUnit };
    });
  };

  const submitDetailedForm = async (mode: 'close' | 'next') => {
    setRowError('');
    if (!draft.shipmentNo?.trim()) {
      setRowError(isFa ? 'شماره پکینگ لیست / محموله الزامی است.' : 'Shipment / Packing List No. is required.');
      return;
    }
    if (!draft.description?.trim()) {
      setRowError(isFa ? 'شرح کالا الزامی است.' : 'Description is required.');
      return;
    }
    if (draft.packingQty === null || draft.packingQty === undefined) {
      setRowError(isFa ? 'مقدار پکینگ الزامی است.' : 'Packing Qty is required.');
      return;
    }
    if (itemNoTaken) {
      setRowError(
        isFa
          ? `شماره آیتم ${draft.itemNo} برای پکینگ «${draft.shipmentNo}» و نگله «${draft.packageNo || '-'}» تکراری است.`
          : `Item No. ${draft.itemNo} already exists for Packing "${draft.shipmentNo}" and Package "${draft.packageNo || '-'}".`,
      );
      return;
    }

    const finalGenDesc = draft.generalDescription?.trim()
      ? formatGeneralDescriptionCase(draft.generalDescription)
      : inferGeneralDescription(draft.description || '');

    setSaving(true);
    try {
      if (editingId) {
        const payload = { ...draft, generalDescription: finalGenDesc, acknowledgeClosed: ackClosed };
        delete payload.rowNo;
        await apiRequest(`/api/detailed/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('success', isFa ? 'آیتم جزئیات ویرایش شد.' : 'Detailed item updated.');
        setFormModalOpen(false);
      } else {
        const payload: Partial<DetailedEntry> & { acknowledgeClosed: boolean } = {
          arrivalDate: draft.arrivalDate,
          supplier: draft.supplier,
          origin: draft.origin,
          shipmentNo: draft.shipmentNo,
          packageNo: draft.packageNo,
          itemNo: draft.itemNo,
          generalDescription: finalGenDesc,
          description: draft.description,
          size: draft.size,
          itemCode: draft.itemCode,
          packingQty: draft.packingQty ?? null,
          actualQty: null,
          damagedQty: null,
          countingUnit: draft.countingUnit,
          island: draft.island,
          system: draft.system,
          subSystem: draft.subSystem,
          unit: draft.unit,
          storageLocation: draft.storageLocation,
          receiver: draft.receiver,
          notes: draft.notes,
          acknowledgeClosed: ackClosed,
        };
        await apiRequest('/api/detailed', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        triggerAutoSnapshot(`Detailed ${draft.shipmentNo}`);
        onDataChanged();
        loadData();

        if (mode === 'next') {
          const pk = (draft.shipmentNo || '').trim();
          const pkg = (draft.packageNo || '').trim();
          const check = await apiRequest<PackingDetailedCheckResponse>(
            `/api/packing/check?scope=detailed&packingNo=${encodeURIComponent(pk)}&packageNo=${encodeURIComponent(pkg)}`,
          ).catch(() => null);

          notify(
            'success',
            isFa
              ? `آیتم ${draft.itemNo} ثبت شد — آماده ثبت آیتم ${check?.nextSuggestedItemNo || 'بعدی'}`
              : `Item ${draft.itemNo} saved — ready for item ${check?.nextSuggestedItemNo || 'next'}`,
          );

          setLinkedGeneral(check?.linkedGeneral || linkedGeneral);
          setGenDescManual(false);
          setItemNoManual(false);
          setItemNoTaken(false);
          setDraft((prev) => ({
            ...emptyDetailedDraft(),
            shipmentNo: prev.shipmentNo,
            packageNo: prev.packageNo,
            itemNo: check?.nextSuggestedItemNo || String((Number(prev.itemNo) || 0) + 1),
            arrivalDate: prev.arrivalDate,
            supplier: prev.supplier,
            origin: prev.origin,
            island: prev.island,
            system: prev.system,
            subSystem: prev.subSystem,
            unit: prev.unit,
            countingUnit: prev.countingUnit || 'PC',
          }));
          setSaving(false);
          return;
        } else {
          notify('success', isFa ? 'آیتم جزئیات ثبت و فرم بسته شد.' : 'Detailed item saved and closed.');
          setFormModalOpen(false);
        }
      }

      if (editingId) {
        triggerAutoSnapshot(`Detailed ${draft.shipmentNo}`);
        onDataChanged();
        loadData();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'CLOSED_PACKING_WARNING') {
          setClosedWarningVisible(true);
        }
        setRowError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitDetailedForm('close');
  };

  const handleSubmitBackfill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backfillTarget) return;
    const qtyNum = Number(backfillQty);
    if (!qtyNum || qtyNum <= 0) return;

    try {
      await apiRequest(`/api/detailed/${backfillTarget.id}/backfill`, {
        method: 'POST',
        body: JSON.stringify({
          qty: qtyNum,
          arrivalDate: backfillDate,
          shipmentNo: backfillShipmentNo.trim() || backfillTarget.shipmentNo,
          packageNo: backfillPackageNo.trim(),
          note: backfillNote.trim(),
        }),
      });
      notify(
        'success',
        isFa ? 'جبران کسری با موفقیت ثبت شد.' : 'Shortage fulfillment recorded.',
      );
      setBackfillTarget(null);
      setBackfillQty('');
      setBackfillNote('');
      triggerAutoSnapshot(`Backfill ${backfillTarget.rowNo}`);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/detailed/${deleteTarget.id}`, { method: 'DELETE' });
      notify(
        'success',
        isFa
          ? `ردیف ${deleteTarget.rowNo} به سطل بازیافت منتقل شد.`
          : `Row ${deleteTarget.rowNo} moved to Recycle Bin.`,
      );
      setDeleteTarget(null);
      onDataChanged();
      loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    }
  };

  const toggleRow = (row: DetailedComputed) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  };

  const toggleAllOnPage = () => {
    const allSelected = items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]));
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allSelected) {
        for (const r of items) delete next[r.id];
      } else {
        for (const r of items) next[r.id] = r;
      }
      return next;
    });
  };

  const handleExport = () => {
    const rowsToExport = selectedRows.length > 0 ? selectedRows : items;
    exportRowsToCsv({
      rows: rowsToExport,
      columns: columns.map((c) => ({
        key: c.key,
        header: c.header,
        isDate: c.isDate,
        getValue: c.get,
      })),
      filename: 'samaan-detailed',
      calendar: prefs.calendar,
      hideEmptyColumns: hideEmptyCols,
    });
  };

  const numInput = (val: number | null | undefined) => (val === null || val === undefined ? '' : String(val));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center flex-1 min-w-[240px] h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 gap-2 focus-within:border-[var(--accent-primary)] overflow-hidden">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              dir={!q ? (isFa ? 'rtl' : 'ltr') : 'auto'}
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t.controls.searchPlaceholder}
              className="flex-1 min-w-0 h-full bg-transparent text-xs bidi-plaintext focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setShortageOnly((v) => !v); setPage(1); }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                shortageOnly
                  ? 'border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t.shortage.hasShortageBadge}</span>
            </button>

            <button
              type="button"
              onClick={() => { setDamagedOnly((v) => !v); setPage(1); }}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                damagedOnly
                  ? 'border-[var(--status-warning)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{t.shortage.hasDamagedBadge}</span>
            </button>

            <button
              type="button"
              onClick={() => setHideEmptyCols((v) => !v)}
              className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${
                hideEmptyCols
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>{hideEmptyCols ? t.controls.hideEmptyCols : t.controls.showAllCols}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت آیتم جزئیات' : 'Add Detailed Item'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          <input
            type="text"
            dir={isFa && !shipmentFilter ? 'rtl' : 'ltr'}
            value={shipmentFilter}
            onChange={(e) => { setShipmentFilter(e.target.value); setPage(1); }}
            placeholder={t.headers.shipmentNo}
            className={`h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
              isFa && !shipmentFilter ? 'text-right' : 'text-left'
            }`}
          />
          <input
            type="text"
            dir={isFa && !packageFilter ? 'rtl' : 'ltr'}
            value={packageFilter}
            onChange={(e) => { setPackageFilter(e.target.value); setPage(1); }}
            placeholder={t.headers.packageNo}
            className={`h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums focus:outline-none focus:border-[var(--accent-primary)] ${
              isFa && !packageFilter ? 'text-right' : 'text-left'
            }`}
          />
          <select
            value={island}
            onChange={(e) => { setIsland(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.island}: {t.controls.all}</option>
            {categories.island.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={system}
            onChange={(e) => { setSystem(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.system}: {t.controls.all}</option>
            {categories.system.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={storageLocation}
            onChange={(e) => { setStorageLocation(e.target.value); setPage(1); }}
            className="h-9 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
          >
            <option value="">{t.headers.storageLocation}: {t.controls.all}</option>
            {categories.storageLocation.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <JalaliDateInput
            value={fromDate}
            onChange={(v) => { setFromDate(v); setPage(1); }}
            placeholder={t.controls.fromDate}
          />
          <JalaliDateInput
            value={toDate}
            onChange={(v) => { setToDate(v); setPage(1); }}
            placeholder={t.controls.toDate}
          />
        </div>
      </div>

      {/* Formula Selection Summary Bar */}
      {(items.length > 0 || selectedRows.length > 0) && (
        <SelectionSummaryBar
          scope="detailed"
          selectedCount={selectedRows.length}
          summary={activeSummary}
          isFilteredFallback={selectedRows.length === 0}
          onClearSelection={() => setSelectedMap({})}
          onExportSelected={handleExport}
          onPrintSelected={() => setPrintOpen(true)}
        />
      )}

      {/* Detailed Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              <tr>
                <th className="py-2.5 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every((r) => Boolean(selectedMap[r.id]))}
                    onChange={toggleAllOnPage}
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                      col.isNum ? 'text-end' : 'text-start'
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-end font-semibold whitespace-nowrap">
                  {isFa ? 'عملیات' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.loading}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="py-12 text-center text-[var(--text-muted)]">
                    {t.controls.noData}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setInspected(row)}
                    className={`cursor-pointer hover:bg-[var(--bg-subtle)]/60 transition-colors ${
                      row.hasShortage ? 'bg-[var(--status-danger-bg)]/45' : ''
                    }`}
                  >
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedMap[row.id])}
                        onChange={() => toggleRow(row)}
                      />
                    </td>

                    {visibleColumns.map((col) => {
                      const raw = col.get(row);
                      const display = col.isDate
                        ? formatDate(String(raw || ''))
                        : typeof raw === 'number'
                          ? raw.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                          : raw || '';
                      return (
                        <td
                          key={col.key}
                          className={`py-2 px-3 whitespace-nowrap max-w-[260px] truncate tabular-nums bidi-plaintext ${
                            col.isNum ? 'text-end' : 'text-start'
                          } ${
                            col.key === 'shortage' && row.hasShortage
                              ? 'font-bold text-[var(--status-danger)]'
                              : col.key === 'damagedQty' && row.hasDamaged
                                ? 'font-bold text-[var(--status-warning)]'
                                : col.key === 'mapnaInventory'
                                  ? 'font-semibold text-[var(--accent-primary)]'
                                  : ''
                          }`}
                          title={String(display)}
                        >
                          {col.isLtr && display ? (
                            <span dir="ltr" className="inline-block">
                              {display}
                            </span>
                          ) : (
                            display
                          )}
                        </td>
                      );
                    })}

                    <td className="py-2 px-3 whitespace-nowrap text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInspected(row)}
                          title={isFa ? 'مشاهده اطلاعات کامل سطر' : 'Inspect Row Details'}
                          className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            {row.hasShortage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBackfillTarget(row);
                                  setBackfillQty(String(row.shortage));
                                  setBackfillShipmentNo(row.shipmentNo);
                                  setBackfillPackageNo(row.packageNo);
                                  setBackfillDate(getTodayIso());
                                }}
                                className="px-2 py-1 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] hover:opacity-90 text-[11px] font-semibold flex items-center gap-1"
                              >
                                <PackagePlus className="w-3 h-3" />
                                <span>{t.shortage.backfillBtn}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              title={t.controls.edit}
                              className="p-1.5 rounded-md hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              title={t.controls.delete}
                              className="p-1.5 rounded-md hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="tabular-nums">
              {isFa
                ? `صفحه ${data.page.toLocaleString('fa-IR')} از ${data.totalPages.toLocaleString('fa-IR')} (${data.total.toLocaleString('fa-IR')} رکورد)`
                : `Page ${data.page} of ${data.totalPages} (${data.total} records)`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
              <button
                type="button"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] disabled:opacity-40"
              >
                {isFa ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Item Inspector Drawer — Strictly hides empty fields */}
      {inspected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setInspected(null)}>
          <div
            className="w-full max-w-xl bg-[var(--bg-surface)] h-full overflow-y-auto p-6 border-s border-[var(--border-subtle)] space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold bidi-plaintext">
                  {inspected.description || inspected.generalDescription}
                </h3>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums bidi-plaintext">
                  {t.headers.shipmentNo}: <span dir="ltr">{inspected.shipmentNo}</span>
                  {inspected.packageNo ? (
                    <>
                      {' · '}
                      {t.headers.packageNo}: <span dir="ltr">{inspected.packageNo}</span>
                    </>
                  ) : null}
                  {inspected.itemNo ? (
                    <>
                      {' · '}
                      {t.headers.itemNo}: <span dir="ltr">{inspected.itemNo}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <button type="button" onClick={() => setInspected(null)} className="p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {inspected.opiPending && (
              <div className="p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]">
                {isFa
                  ? 'نتیجه بازرسی (مقدار واقعی) برای این قلم هنوز ثبت نشده است. برای ثبت مقدار واقعی به بخش «دعوتنامه گشایش و بازرسی بسته‌ها» مراجعه کنید.'
                  : 'Inspection results (Actual Qty) have not been recorded yet. Use Package Opening & Inspection Invitation to record inspection results.'}
              </div>
            )}

            {inspected.hasShortage && canEdit && (
              <div className="p-3.5 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-[var(--status-danger)] tabular-nums">
                  {t.shortage.remainingShortage}: {inspected.shortage}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBackfillTarget(inspected);
                    setBackfillQty(String(inspected.shortage));
                    setBackfillShipmentNo(inspected.shipmentNo);
                    setBackfillPackageNo(inspected.packageNo);
                    setBackfillDate(getTodayIso());
                    setInspected(null);
                  }}
                  className="h-8 px-3 rounded-lg bg-[var(--status-danger)] text-white text-xs font-medium"
                >
                  {t.shortage.backfillBtn}
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
                  {isFa ? 'مشخصات پایه تجهیز' : 'Primary Equipment Info'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {columns
                    .filter((c) => {
                      if (c.hideInTable) return false;
                      const val = c.get(inspected);
                      return val !== null && val !== undefined && String(val).trim() !== '';
                    })
                    .map((c) => {
                      const raw = c.get(inspected);
                      const formatted = c.isDate
                        ? formatDate(String(raw || ''))
                        : typeof raw === 'number'
                          ? raw.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                          : String(raw);
                      return (
                        <div
                          key={c.key}
                          className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                        >
                          <div className="text-[11px] text-[var(--text-muted)]">{c.header}</div>
                          <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                            {c.isLtr ? <span dir="ltr">{formatted}</span> : formatted}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {columns.some((c) => {
                if (!c.hideInTable) return false;
                const val = c.get(inspected);
                return val !== null && val !== undefined && String(val).trim() !== '';
              }) && (
                <div>
                  <div className="text-[11px] font-bold text-[var(--text-muted)] mb-2">
                    {isFa
                      ? 'وضعیت بازرسی، موجودی‌ها، حواله‌ها، موازنه و انبارگردانی'
                      : 'Inspection, Stock, Issues, Returns, Balance & Stocktake'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {columns
                      .filter((c) => {
                        if (!c.hideInTable) return false;
                        const val = c.get(inspected);
                        return val !== null && val !== undefined && String(val).trim() !== '';
                      })
                      .map((c) => {
                        const raw = c.get(inspected);
                        const formatted = c.isDate
                          ? formatDate(String(raw || ''))
                          : typeof raw === 'number'
                            ? raw.toLocaleString(isFa ? 'fa-IR' : 'en-US')
                            : String(raw);
                        return (
                          <div
                            key={c.key}
                            className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                          >
                            <div className="text-[11px] text-[var(--text-muted)]">{c.header}</div>
                            <div className="text-xs font-semibold mt-0.5 tabular-nums break-words bidi-plaintext">
                              {c.isLtr ? <span dir="ltr">{formatted}</span> : formatted}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {inspected.shortageBackfills && inspected.shortageBackfills.length > 0 && (
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <h4 className="text-xs font-bold">{t.shortage.backfillHistory}</h4>
                <div className="space-y-2">
                  {inspected.shortageBackfills.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold tabular-nums bidi-plaintext">
                          +<span dir="ltr">{b.qty}</span> · <span dir="ltr">{b.shipmentNo}</span>
                          {b.packageNo ? <span dir="ltr"> ({b.packageNo})</span> : ''}
                        </div>
                        {b.note && <div className="text-[11px] text-[var(--text-muted)] bidi-plaintext">{b.note}</div>}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums" dir="ltr">
                        {formatDate(b.arrivalDate)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shortage Backfill Modal */}
      {backfillTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{t.shortage.backfillTitle}</h3>
              <button type="button" onClick={() => setBackfillTarget(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-xs space-y-1">
              <div className="font-semibold bidi-plaintext">{backfillTarget.description || backfillTarget.generalDescription}</div>
              <div className="text-[var(--status-danger)] font-bold tabular-nums">
                {t.shortage.remainingShortage}: {backfillTarget.shortage}
              </div>
            </div>
            <form onSubmit={handleSubmitBackfill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillQty} *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  dir={isFa && !backfillQty ? 'rtl' : 'ltr'}
                  value={backfillQty}
                  onChange={(e) => setBackfillQty(e.target.value)}
                  className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums ${
                    isFa && !backfillQty ? 'text-right' : 'text-left'
                  }`}
                />
              </div>
              <JalaliDateInput
                label={t.shortage.backfillDate}
                value={backfillDate}
                onChange={setBackfillDate}
              />
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillShipmentNo}
                </label>
                <input
                  type="text"
                  dir={isFa && !backfillShipmentNo ? 'rtl' : 'ltr'}
                  value={backfillShipmentNo}
                  onChange={(e) => setBackfillShipmentNo(e.target.value)}
                  className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums ${
                    isFa && !backfillShipmentNo ? 'text-right' : 'text-left'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillPackageNo}
                </label>
                <input
                  type="text"
                  dir={isFa && !backfillPackageNo ? 'rtl' : 'ltr'}
                  value={backfillPackageNo}
                  onChange={(e) => setBackfillPackageNo(e.target.value)}
                  className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm tabular-nums ${
                    isFa && !backfillPackageNo ? 'text-right' : 'text-left'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t.shortage.backfillNote}
                </label>
                <input
                  type="text"
                  dir={!backfillNote ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                  value={backfillNote}
                  onChange={(e) => setBackfillNote(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-sm bidi-plaintext"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBackfillTarget(null)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold"
                >
                  {t.controls.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Detailed Modal */}
      {formModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold">
                  {editingId ? t.controls.edit : isFa ? 'ثبت آیتم جزئیات' : 'Add Detailed Item'}
                </h3>
                <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[11px] font-medium tabular-nums">
                  {editingId
                    ? `${t.headers.rowNo}: ${draft.rowNo}`
                    : `${t.headers.rowNo}: ${t.packing.rowNoAuto}`}
                </span>
              </div>
              <button type="button" onClick={() => setFormModalOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto space-y-4">
              {closedWarningVisible && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] space-y-2 text-xs">
                  <div className="font-bold text-[var(--status-danger)]">{t.packing.closedWarningTitle}</div>
                  <p>{t.packing.closedWarningBody}</p>
                  <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackClosed}
                      onChange={(e) => setAckClosed(e.target.checked)}
                    />
                    <span>{t.packing.acknowledgeClosed}</span>
                  </label>
                </div>
              )}

              {rowError && (
                <div className="p-3 rounded-xl border border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-xs text-[var(--status-danger)] font-medium">
                  {rowError}
                </div>
              )}

              {/* Package Item Count Progress Strip (when package itemCount is defined in General) */}
              {!editingId && linkedGeneral?.expectedItemCount ? (
                <div className="p-3 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-[var(--accent-primary)] tabular-nums">
                    {isFa
                      ? `پیشرفت ثبت اقلام نگله «${draft.packageNo || '-'}»: در حال ثبت آیتم ${(linkedGeneral.existingDetailedCount || 0) + 1} از ${linkedGeneral.expectedItemCount}`
                      : `Package "${draft.packageNo || '-'}" progress: Entering item ${(linkedGeneral.existingDetailedCount || 0) + 1} of ${linkedGeneral.expectedItemCount}`}
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {isFa
                      ? `ثبت‌شده فعلی: ${linkedGeneral.existingDetailedCount || 0} قلم`
                      : `Recorded so far: ${linkedGeneral.existingDetailedCount || 0}`}
                  </span>
                </div>
              ) : null}

              {/* General Auto-Sync Status Banner */}
              {linkedGeneral ? (
                <div className="p-3 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)] text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-[var(--status-success)]">
                    <Link2 className="w-4 h-4 shrink-0" />
                    <span>
                      {isFa
                        ? 'اطلاعات مشترک به‌صورت خودکار از بخش کلی (جنرال) فراخوانی شد'
                        : 'Shared metadata synced automatically from General'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] flex flex-wrap gap-3 tabular-nums">
                    {linkedGeneral.island && <span>{t.headers.island}: {linkedGeneral.island}</span>}
                    {linkedGeneral.system && <span>{t.headers.system}: {linkedGeneral.system}</span>}
                    {linkedGeneral.subSystem && <span>{t.headers.subSystem}: {linkedGeneral.subSystem}</span>}
                    {linkedGeneral.unit && <span>{t.headers.unit}: {linkedGeneral.unit}</span>}
                  </div>
                </div>
              ) : draft.shipmentNo?.trim() ? (
                <div className="p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)]">
                  {isFa
                    ? 'این شماره پکینگ لیست در بخش کلی یافت نشد؛ در صورت نیاز اطلاعات جزیره و سیستم را به‌صورت دستی تکمیل کنید.'
                    : 'This Packing List was not found in General yet; fill Island/System manually if needed.'}
                </div>
              ) : null}

              {/* Primary Identifiers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.shipmentNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !draft.shipmentNo ? 'rtl' : 'ltr'}
                    list="detailed-packings-datalist"
                    value={draft.shipmentNo || ''}
                    onChange={(e) => {
                      setItemNoManual(false);
                      setDraft({ ...draft, shipmentNo: e.target.value });
                    }}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !draft.shipmentNo ? 'text-right' : 'text-left'
                    }`}
                  />
                  <datalist id="detailed-packings-datalist">
                    {knownPackings.map((pk) => (
                      <option key={pk} value={pk} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packageNo}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !draft.packageNo ? 'rtl' : 'ltr'}
                    list="detailed-packages-datalist"
                    value={draft.packageNo || ''}
                    onChange={(e) => {
                      setItemNoManual(false);
                      setDraft({ ...draft, packageNo: e.target.value });
                    }}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !draft.packageNo ? 'text-right' : 'text-left'
                    }`}
                  />
                  <datalist id="detailed-packages-datalist">
                    {knownPackages.map((pkg) => (
                      <option key={pkg} value={pkg} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.itemNo} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={isFa && !draft.itemNo ? 'rtl' : 'ltr'}
                    value={draft.itemNo || ''}
                    onChange={(e) => {
                      setItemNoManual(true);
                      setDraft({ ...draft, itemNo: e.target.value });
                    }}
                    className={`w-full h-9 px-3 rounded-lg border bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !draft.itemNo ? 'text-right' : 'text-left'
                    } ${
                      itemNoTaken
                        ? 'border-[var(--status-danger)] text-[var(--status-danger)]'
                        : 'border-[var(--border-subtle)]'
                    }`}
                  />
                  {itemNoTaken && (
                    <div className="text-[10px] text-[var(--status-danger)] mt-1">
                      {isFa
                        ? 'این شماره آیتم برای این پکینگ و نگله تکراری است'
                        : 'Duplicate Item No. in this Packing & Package'}
                    </div>
                  )}
                </div>

                <JalaliDateInput
                  label={t.headers.arrivalDate}
                  value={draft.arrivalDate || ''}
                  onChange={(v) => setDraft({ ...draft, arrivalDate: v })}
                />

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.description} *
                  </label>
                  <input
                    type="text"
                    required
                    dir={!draft.description ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.description || ''}
                    onChange={(e) => {
                      const nextDesc = e.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        description: nextDesc,
                        ...(genDescManual ? {} : { generalDescription: inferGeneralDescription(nextDesc) }),
                      }));
                    }}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.generalDescription}
                  </label>
                  <input
                    type="text"
                    dir={!draft.generalDescription ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.generalDescription || ''}
                    onChange={(e) => {
                      setGenDescManual(e.target.value.trim().length > 0);
                      setDraft({ ...draft, generalDescription: e.target.value });
                    }}
                    onBlur={() => {
                      if (draft.generalDescription?.trim()) {
                        setDraft((prev) => ({
                          ...prev,
                          generalDescription: formatGeneralDescriptionCase(prev.generalDescription || ''),
                        }));
                      }
                    }}
                    placeholder={isFa ? 'تشخیص خودکار از شرح کالا (مثلاً Pipe یا IPE Beam)' : 'Auto-inferred from description (e.g., Pipe, IPE Beam)'}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.itemCode}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !draft.itemCode ? 'rtl' : 'ltr'}
                    value={draft.itemCode || ''}
                    onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !draft.itemCode ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.size}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !draft.size ? 'rtl' : 'ltr'}
                    value={draft.size || ''}
                    onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && !draft.size ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.packingQty} *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    dir={isFa && (draft.packingQty === null || draft.packingQty === undefined) ? 'rtl' : 'ltr'}
                    value={numInput(draft.packingQty)}
                    onChange={(e) => handlePackingQtyChange(e.target.value)}
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs tabular-nums ${
                      isFa && (draft.packingQty === null || draft.packingQty === undefined) ? 'text-right' : 'text-left'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.countingUnit}
                  </label>
                  <input
                    type="text"
                    dir={isFa && !draft.countingUnit ? 'rtl' : 'ltr'}
                    list="counting-unit-datalist"
                    value={draft.countingUnit || ''}
                    onChange={(e) => setDraft({ ...draft, countingUnit: e.target.value })}
                    placeholder="PC / PCs"
                    className={`w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs ${
                      isFa && !draft.countingUnit ? 'text-right' : 'text-left'
                    }`}
                  />
                  <datalist id="counting-unit-datalist">
                    {COUNTING_UNIT_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                {/* Synced Classification & Storage */}
                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.island}
                  </label>
                  <input
                    type="text"
                    dir={!draft.island ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="detailed-island-datalist"
                    value={draft.island || ''}
                    onChange={(e) => setDraft({ ...draft, island: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="detailed-island-datalist">
                    {categories.island.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.system}
                  </label>
                  <input
                    type="text"
                    dir={!draft.system ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="detailed-system-datalist"
                    value={draft.system || ''}
                    onChange={(e) => setDraft({ ...draft, system: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="detailed-system-datalist">
                    {categories.system.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.subSystem}
                  </label>
                  <input
                    type="text"
                    dir={!draft.subSystem ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="detailed-subsystem-datalist"
                    value={draft.subSystem || ''}
                    onChange={(e) => setDraft({ ...draft, subSystem: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="detailed-subsystem-datalist">
                    {categories.subSystem.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.unit}
                  </label>
                  <input
                    type="text"
                    dir={!draft.unit ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="detailed-unit-datalist"
                    value={draft.unit || ''}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="detailed-unit-datalist">
                    {categories.unit.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.supplier}
                  </label>
                  <input
                    type="text"
                    dir={!draft.supplier ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.supplier || ''}
                    onChange={(e) => setDraft({ ...draft, supplier: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.origin}
                  </label>
                  <input
                    type="text"
                    dir={!draft.origin ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.origin || ''}
                    onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.storageLocation}
                  </label>
                  <input
                    type="text"
                    dir={!draft.storageLocation ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    list="detailed-storage-datalist"
                    value={draft.storageLocation || ''}
                    onChange={(e) => setDraft({ ...draft, storageLocation: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                  <datalist id="detailed-storage-datalist">
                    {categories.storageLocation.map((v) => <option key={v} value={v} />)}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.receiver}
                  </label>
                  <input
                    type="text"
                    dir={!draft.receiver ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.receiver || ''}
                    onChange={(e) => setDraft({ ...draft, receiver: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                    {t.headers.notes}
                  </label>
                  <input
                    type="text"
                    dir={!draft.notes ? (isFa ? 'rtl' : 'ltr') : 'auto'}
                    value={draft.notes || ''}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs bidi-plaintext"
                  />
                </div>
              </div>

              {editingId ? (
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] text-[var(--text-secondary)] space-y-1">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {isFa ? 'خلاصه وضعیت عملیاتی (تغییر از بخش‌های اختصاصی):' : 'Operational Summary (managed via dedicated modules):'}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                    <span>{t.headers.opiNo}: {draft.opiNo || '-'}</span>
                    <span>{t.headers.actualQty}: {draft.actualQty ?? (isFa ? 'در انتظار OPI' : 'Pending OPI')}</span>
                    <span>{t.headers.gcvReceiptNo}: {draft.gcvReceiptNo || '-'}</span>
                    <span>{t.headers.mivContractorNo}: {draft.mivContractorNo || '-'}</span>
                    <span>{t.headers.materialBalanceNo}: {draft.materialBalanceNo || '-'}</span>
                    <span>{t.headers.stocktakeStatus}: {draft.stocktakeStatus || '-'}</span>
                  </div>
                </div>
              ) : null}

              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="h-9 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium"
                >
                  {t.controls.cancel}
                </button>
                {!editingId && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => submitDetailedForm('next')}
                    className="h-9 px-4 rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-90 text-xs font-semibold disabled:opacity-50"
                  >
                    {t.controls.saveAndNext}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {editingId ? t.controls.save : t.controls.saveAndClose}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف آیتم جزئیات' : 'Delete Detailed Item'}
        itemLabel={
          deleteTarget
            ? `${deleteTarget.shipmentNo} / ${deleteTarget.packageNo || '-'} / #${deleteTarget.itemNo || deleteTarget.rowNo} — ${
                deleteTarget.description || deleteTarget.generalDescription || ''
              }`
            : ''
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <PrintReportModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={t.nav.detailed}
        rows={selectedRows.length > 0 ? selectedRows : items}
        columns={columns.map((c) => ({
          key: c.key,
          header: c.header,
          isDate: c.isDate,
          getValue: c.get,
        }))}
        defaultSelectedKeys={visibleColumns.map((c) => c.key)}
      />
    </div>
  );
};
