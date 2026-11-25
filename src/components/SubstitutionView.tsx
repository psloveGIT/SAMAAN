import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Edit3,
  FileText,
  History,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError } from '../lib/api.ts';
import { triggerAppPrint } from '../lib/print.ts';
import { extractPlantDocConfig } from '../shared/docNumbering.ts';
import { getTodayIso } from '../shared/jalali.ts';
import { buildIsolatedPrintPortalCss } from '../shared/printPageCss.ts';
import {
  buildMivHeaderAutoFill,
  buildMivLineRemark,
  generateMivDocumentNo,
} from '../shared/miv.ts';
import {
  DEFAULT_SUPPLY_URGENCY,
  MD1_SUBSTITUTION_FORM_CODE,
  SUPPLY_URGENCY_OPTIONS,
  buildSubstitutionHeaderMeta,
  generateNextSubstitutionDocNo,
  getAvailableStockForSource,
  getDefaultStockSource,
  parseStrictPositiveNumber,
  sanitizeNumericQtyInput,
  type ReplacementStockSource,
  type SupplyUrgencyValue,
} from '../shared/substitution.ts';
import type {
  DetailedComputed,
  MivDocumentRecord,
  SubstitutionLineItem,
  SubstitutionRecord,
} from '../shared/types.ts';
import { ConfirmActionModal } from './ConfirmActionModal.tsx';
import { OfficialMivSheet } from './MivView.tsx';
import { OfficialSubstitutionSheet } from './OfficialSubstitutionSheet.tsx';
import { OperationalViewModeTabs } from './OperationalViewModeTabs.tsx';
import { SearchInputWithClear } from './SearchInputWithClear.tsx';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import { SubstitutionItemPicker } from './SubstitutionItemPicker.tsx';
import { TablePaginationBar, useClientPagination } from './TablePaginationBar.tsx';

interface SubstitutionsApiResponse {
  records: SubstitutionRecord[];
  detailedItems: DetailedComputed[];
  mivDocuments?: MivDocumentRecord[];
}

interface SubstitutionViewProps {
  refreshSignal: number;
  onDataChanged: () => void;
}

interface Step1RowDraft {
  item: DetailedComputed;
  qtyStr: string;
  remarks: string;
}

interface Step2RowDraft {
  item: DetailedComputed;
  qtyStr: string;
  remarks: string;
  stockSource: ReplacementStockSource;
}

type PrintBundleMode = 'both' | 'substitution' | 'miv';

export const SubstitutionView: React.FC<SubstitutionViewProps> = ({
  refreshSignal,
  onDataChanged,
}) => {
  const { prefs, t, user, notify, formatDate, triggerAutoSnapshot, activeProject } = useApp();
  const isFa = prefs.language === 'fa';
  const canEdit = user?.role === 'admin' || user?.role === 'operator';

  const [viewMode, setViewMode] = useState<'create' | 'history'>(() => (canEdit ? 'create' : 'history'));
  const [step, setStep] = useState<1 | 2>(1);

  // Saved records & MIV docs for auto-numbering and simultaneous re-printing
  const [records, setRecords] = useState<SubstitutionRecord[]>([]);
  const [detailedItems, setDetailedItems] = useState<DetailedComputed[]>([]);
  const [mivDocuments, setMivDocuments] = useState<MivDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');

  // Step 1 state (Section A — items needing replacement + global fields)
  const [step1Rows, setStep1Rows] = useState<Record<string, Step1RowDraft>>({});
  const [step1UndoStack, setStep1UndoStack] = useState<Array<Record<string, Step1RowDraft>>>([]);
  const [step1RedoStack, setStep1RedoStack] = useState<Array<Record<string, Step1RowDraft>>>([]);
  const [supplyUrgency, setSupplyUrgency] = useState<SupplyUrgencyValue>(DEFAULT_SUPPLY_URGENCY);
  const [reason, setReason] = useState('');
  const [reprocureBy, setReprocureBy] = useState('');
  const [costBorneBy, setCostBorneBy] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');

  // Step 2 state (Section B — in-stock replacement items)
  const [step2Rows, setStep2Rows] = useState<Record<string, Step2RowDraft>>({});
  const [step2UndoStack, setStep2UndoStack] = useState<Array<Record<string, Step2RowDraft>>>([]);
  const [step2RedoStack, setStep2RedoStack] = useState<Array<Record<string, Step2RowDraft>>>([]);
  const [editingRecord, setEditingRecord] = useState<SubstitutionRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Print preview modal state (Substitution Form + Auto-Issued MIV Voucher(s))
  const [printBundle, setPrintBundle] = useState<{
    record: SubstitutionRecord;
    mivDocs: MivDocumentRecord[];
  } | null>(null);
  const [printMode, setPrintMode] = useState<PrintBundleMode>('both');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<SubstitutionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<SubstitutionsApiResponse>('/api/substitutions');
      // Always clone arrays so React state/useMemo immediately reflects mutations in offline mode
      setRecords([...(res.records || [])]);
      setDetailedItems([...(res.detailedItems || [])]);
      setMivDocuments([...(res.mivDocuments || [])]);
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  // Derived selection maps for SubstitutionItemPicker
  const step1SelectedMap = useMemo(() => {
    const map: Record<string, DetailedComputed> = {};
    for (const [id, draft] of Object.entries(step1Rows)) {
      map[id] = draft.item;
    }
    return map;
  }, [step1Rows]);

  const step2SelectedMap = useMemo(() => {
    const map: Record<string, DetailedComputed> = {};
    for (const [id, draft] of Object.entries(step2Rows)) {
      map[id] = draft.item;
    }
    return map;
  }, [step2Rows]);

  const step1List = useMemo(() => Object.values(step1Rows), [step1Rows]);
  const step2List = useMemo(() => Object.values(step2Rows), [step2Rows]);

  const commitStep1Selection = useCallback(
    (updater: (prev: Record<string, Step1RowDraft>) => Record<string, Step1RowDraft>) => {
      setStep1Rows((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setStep1UndoStack((stack) => [...stack.slice(-29), prev]);
        setStep1RedoStack([]);
        return next;
      });
    },
    [],
  );

  const handleStep1Undo = useCallback(() => {
    setStep1UndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setStep1Rows((current) => {
        setStep1RedoStack((redo) => [...redo.slice(-29), current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const handleStep1Redo = useCallback(() => {
    setStep1RedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setStep1Rows((current) => {
        setStep1UndoStack((undo) => [...undo.slice(-29), current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const commitStep2Selection = useCallback(
    (updater: (prev: Record<string, Step2RowDraft>) => Record<string, Step2RowDraft>) => {
      setStep2Rows((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setStep2UndoStack((stack) => [...stack.slice(-29), prev]);
        setStep2RedoStack([]);
        return next;
      });
    },
    [],
  );

  const handleStep2Undo = useCallback(() => {
    setStep2UndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setStep2Rows((current) => {
        setStep2RedoStack((redo) => [...redo.slice(-29), current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const handleStep2Redo = useCallback(() => {
    setStep2RedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setStep2Rows((current) => {
        setStep2UndoStack((undo) => [...undo.slice(-29), current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const toggleStep1Row = useCallback(
    (item: DetailedComputed) => {
      commitStep1Selection((prev) => {
        if (prev[item.id]) {
          const next = { ...prev };
          delete next[item.id];
          return next;
        }
        return {
          ...prev,
          [item.id]: {
            item,
            qtyStr: '1',
            remarks: '',
          },
        };
      });
    },
    [commitStep1Selection],
  );

  const toggleStep1Page = useCallback(
    (rows: DetailedComputed[], allSelected: boolean) => {
      commitStep1Selection((prev) => {
        const next = { ...prev };
        if (allSelected) {
          for (const r of rows) delete next[r.id];
        } else {
          for (const r of rows) {
            if (!next[r.id]) {
              next[r.id] = { item: r, qtyStr: '1', remarks: '' };
            }
          }
        }
        return next;
      });
    },
    [commitStep1Selection],
  );

  const toggleStep2Row = useCallback(
    (item: DetailedComputed) => {
      commitStep2Selection((prev) => {
        if (prev[item.id]) {
          const next = { ...prev };
          delete next[item.id];
          return next;
        }
        return {
          ...prev,
          [item.id]: {
            item,
            qtyStr: '1',
            remarks: '',
            stockSource: getDefaultStockSource(item),
          },
        };
      });
    },
    [commitStep2Selection],
  );

  const toggleStep2Page = useCallback(
    (rows: DetailedComputed[], allSelected: boolean) => {
      commitStep2Selection((prev) => {
        const next = { ...prev };
        if (allSelected) {
          for (const r of rows) delete next[r.id];
        } else {
          for (const r of rows) {
            if (!next[r.id]) {
              next[r.id] = {
                item: r,
                qtyStr: '1',
                remarks: '',
                stockSource: getDefaultStockSource(r),
              };
            }
          }
        }
        return next;
      });
    },
    [commitStep2Selection],
  );

  // Plant abbreviation config for auto doc numbering
  const plantDocConfig = useMemo(() => extractPlantDocConfig(activeProject), [activeProject]);

  // Auto-calculated Substitution DocNo (XX-#### with optional plant abbreviation)
  const primarySupplier = useMemo(() => {
    for (const row of step1List) {
      if (row.item.supplier?.trim()) return row.item.supplier.trim();
    }
    return '';
  }, [step1List]);

  const autoSubDocNo = useMemo(() => {
    if (editingRecord) return editingRecord.docNo;
    return generateNextSubstitutionDocNo(
      primarySupplier,
      records.map((r) => r.docNo),
      plantDocConfig,
    );
  }, [editingRecord, primarySupplier, records, plantDocConfig]);

  // Auto-calculated MIV DocNo preview(s) using exact MD1EX-FQP02/05-03 contractor-coded numbering
  const plannedMivDocNos = useMemo(() => {
    const existingMivNos = mivDocuments.map((m) => m.docNo);
    const mapnaGroup = step2List.filter((r) => r.stockSource === 'mapna');
    const contractorGroup = step2List.filter((r) => r.stockSource === 'contractor');
    const fallbackContractor =
      step1List.find((r) => r.item.receiver?.trim())?.item.receiver?.trim() ||
      step2List.find((r) => r.item.receiver?.trim())?.item.receiver?.trim() ||
      primarySupplier ||
      '';

    const resolveGroupContractor = (rows: Step2RowDraft[]): string => {
      const hdr = buildMivHeaderAutoFill(
        rows.map((r) => r.item),
        activeProject,
      );
      return hdr.party || fallbackContractor;
    };

    const result: { mapna?: string; contractor?: string } = {};
    const used = [...existingMivNos];
    if (mapnaGroup.length > 0) {
      const no = generateMivDocumentNo(
        resolveGroupContractor(mapnaGroup),
        used,
        plantDocConfig,
      );
      result.mapna = no;
      used.push(no);
    }
    if (contractorGroup.length > 0) {
      const no = generateMivDocumentNo(
        resolveGroupContractor(contractorGroup),
        used,
        plantDocConfig,
      );
      result.contractor = no;
      used.push(no);
    }
    if (mapnaGroup.length === 0 && contractorGroup.length === 0) {
      result.mapna = generateMivDocumentNo(
        fallbackContractor,
        used,
        plantDocConfig,
      );
    }
    return result;
  }, [mivDocuments, step2List, step1List, activeProject, primarySupplier, plantDocConfig]);

  const previewMivLabel = useMemo(() => {
    if (editingRecord?.mivNo) return editingRecord.mivNo;
    return [plannedMivDocNos.mapna, plannedMivDocNos.contractor].filter(Boolean).join(' / ');
  }, [editingRecord, plannedMivDocNos]);

  const previewHeaderMeta = useMemo(
    () =>
      buildSubstitutionHeaderMeta(
        step1List.map((r) => ({
          system: r.item.system,
          island: r.item.island,
          unit: r.item.unit,
          supplier: r.item.supplier,
          receiver: r.item.receiver,
          merNo: r.item.merNo,
        })),
        {
          projectName: activeProject?.name || '',
          contractRef: activeProject?.contractRef || '',
          supplyUrgency,
          mivNo: previewMivLabel,
        },
      ),
    [step1List, activeProject?.name, activeProject?.contractRef, supplyUrgency, previewMivLabel],
  );

  const validateStep1 = (): string | null => {
    if (step1List.length === 0) {
      return isFa
        ? 'لطفاً حداقل یک ردیف از اقلام نیازمند تعویض (بخش الف) را انتخاب کنید.'
        : 'Please select at least one item needing replacement (Section A).';
    }
    for (const row of step1List) {
      const parsed = parseStrictPositiveNumber(row.qtyStr);
      if (parsed === null) {
        return isFa
          ? `لطفاً تعداد معتبر (فقط عدد بزرگتر از صفر) برای ردیف «${row.item.description || row.item.shipmentNo}» وارد کنید.`
          : `Please enter a valid positive number for "${row.item.description || row.item.shipmentNo}".`;
      }
    }
    if (!reason.trim()) {
      return isFa ? 'وارد کردن «دلیل تعویض قطعات» الزامی است.' : 'Reason for replacement is required.';
    }
    if (!reprocureBy.trim()) {
      return isFa ? 'وارد کردن «تأمین کننده مجدد» الزامی است.' : 'Re-procurement supplier is required.';
    }
    if (!costBorneBy.trim()) {
      return isFa ? 'وارد کردن «هزینه‌ی تأمین مجدد» الزامی است.' : 'Cost responsibility is required.';
    }
    return null;
  };

  const getEffectiveAvailableForStep2 = useCallback(
    (item: DetailedComputed, source: ReplacementStockSource): number => {
      const baseAvail = getAvailableStockForSource(item, source);
      if (!editingRecord?.substituteItems) return baseAvail;
      const prevAllocated = editingRecord.substituteItems
        .filter((s) => s.detailedId === item.id && (s.stockSource || 'mapna') === source)
        .reduce((acc, s) => acc + (Number(s.qty) || 0), 0);
      return baseAvail + prevAllocated;
    },
    [editingRecord],
  );

  const validateStep2 = (): string | null => {
    if (step2List.length === 0) {
      return isFa
        ? 'لطفاً حداقل یک ردیف از اقلام دارای موجودی (بخش ب) را برای جایگزینی انتخاب کنید.'
        : 'Please select at least one in-stock replacement item (Section B).';
    }
    for (const row of step2List) {
      const parsed = parseStrictPositiveNumber(row.qtyStr);
      if (parsed === null) {
        return isFa
          ? `لطفاً تعداد معتبر (فقط عدد بزرگتر از صفر) برای کالای جایگزین «${row.item.description || row.item.shipmentNo}» وارد کنید.`
          : `Please enter a valid positive number for replacement item "${row.item.description || row.item.shipmentNo}".`;
      }
      const maxAvail = getEffectiveAvailableForStep2(row.item, row.stockSource);
      if (parsed > maxAvail) {
        return isFa
          ? `تعداد درخواستی (${parsed}) برای «${row.item.description || row.item.shipmentNo}» از موجودی مجاز (${maxAvail}) بیشتر است.`
          : `Quantity (${parsed}) for "${row.item.description || row.item.shipmentNo}" exceeds available stock (${maxAvail}).`;
      }
    }
    return null;
  };

  const handleAdvanceToStep2 = () => {
    const err = validateStep1();
    if (err) {
      notify('error', err);
      return;
    }
    setStep(2);
  };

  const resetBuilder = () => {
    setStep1Rows({});
    setStep1UndoStack([]);
    setStep1RedoStack([]);
    setStep2Rows({});
    setStep2UndoStack([]);
    setStep2RedoStack([]);
    setEditingRecord(null);
    setSupplyUrgency(DEFAULT_SUPPLY_URGENCY);
    setReason('');
    setReprocureBy('');
    setCostBorneBy('');
    setSupplierNotes('');
    setStep(1);
  };

  const makeFallbackDetailedFromLine = (line: SubstitutionLineItem): DetailedComputed => ({
    id: line.detailedId || `legacy-${line.shipmentNo}-${line.itemNo}`,
    shipmentNo: line.shipmentNo || '',
    itemNo: line.itemNo || '',
    packageNo: line.packageNo || '',
    description: line.description || '',
    generalDescription: line.description || '',
    itemCode: line.itemCode || '',
    countingUnit: line.countingUnit || 'عدد',
    system: line.system || '',
    island: line.island || '',
    unit: line.unit || '',
    supplier: line.supplier || '',
    receiver: line.receiver || '',
    merNo: line.merNo || '',
    packingQty: line.qty || 1,
    actualQty: line.qty || 1,
    shortage: 0,
    surplus: 0,
    damagedQty: 0,
    mapnaInventory: line.stockSource === 'contractor' ? 0 : line.qty || 0,
    contractorInventory: line.stockSource === 'contractor' ? line.qty || 0 : 0,
    totalInventory: line.qty || 0,
    issuedToContractorQty: 0,
    returnedFromContractorQty: 0,
    returnedToMapnaQty: 0,
    issuedByMapnaQty: 0,
    createdAt: '',
    updatedAt: '',
  } as unknown as DetailedComputed);

  const handleStartEdit = (rec: SubstitutionRecord) => {
    const detailedById = new Map(detailedItems.map((d) => [d.id, d]));

    const origSource: SubstitutionLineItem[] =
      rec.originalItems && rec.originalItems.length > 0
        ? rec.originalItems
        : [
            {
              detailedId: rec.detailedId,
              itemNo: rec.itemNo || '',
              shipmentNo: rec.shipmentNo || '',
              packageNo: rec.packageNo || '',
              description: rec.originalDescription || '',
              itemCode: rec.originalItemCode || '',
              qty: rec.qty || 1,
              countingUnit: rec.countingUnit || 'عدد',
              drawingNo: rec.originalDrawingNo || '',
              remarks: rec.originalRemarks || '',
              system: rec.system || '',
              island: rec.island || '',
              unit: rec.unit || '',
              supplier: rec.supplier || '',
              receiver: rec.installerContractor || '',
              merNo: rec.merNcrNo || '',
            },
          ];

    const subSource: SubstitutionLineItem[] =
      rec.substituteItems && rec.substituteItems.length > 0
        ? rec.substituteItems
        : [];

    const nextStep1: Record<string, Step1RowDraft> = {};
    for (const line of origSource) {
      const item = detailedById.get(line.detailedId) || makeFallbackDetailedFromLine(line);
      nextStep1[item.id] = {
        item,
        qtyStr: String(line.qty || 1),
        remarks: line.remarks || '',
      };
    }

    const nextStep2: Record<string, Step2RowDraft> = {};
    for (const line of subSource) {
      const item = detailedById.get(line.detailedId) || makeFallbackDetailedFromLine(line);
      nextStep2[item.id] = {
        item,
        qtyStr: String(line.qty || 1),
        remarks: line.remarks || '',
        stockSource: line.stockSource || getDefaultStockSource(item),
      };
    }

    setEditingRecord(rec);
    setStep1Rows(nextStep1);
    setStep1UndoStack([]);
    setStep1RedoStack([]);
    setStep2Rows(nextStep2);
    setStep2UndoStack([]);
    setStep2RedoStack([]);
    setSupplyUrgency(
      (rec.supplyUrgency === 'اضطراری' ? 'اضطراری' : DEFAULT_SUPPLY_URGENCY) as SupplyUrgencyValue,
    );
    setReason(rec.reason || '');
    setReprocureBy(rec.reprocureBy || '');
    setCostBorneBy(rec.costBorneBy || '');
    setSupplierNotes(rec.supplierNotes || '');
    setStep(1);
    setViewMode('create');
  };

  const handleSubmitSubstitution = async () => {
    const err1 = validateStep1();
    if (err1) {
      notify('error', err1);
      setStep(1);
      return;
    }
    const err2 = validateStep2();
    if (err2) {
      notify('error', err2);
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const docDate = editingRecord?.date || getTodayIso();
      const targetDocNo = editingRecord?.docNo || autoSubDocNo;
      const mapnaItems = step2List.filter((r) => r.stockSource === 'mapna');
      const contractorItems = step2List.filter((r) => r.stockSource === 'contractor');

      const originalItems: SubstitutionLineItem[] = step1List.map((row) => ({
        detailedId: row.item.id,
        itemNo: row.item.itemNo || '',
        shipmentNo: row.item.shipmentNo || '',
        packageNo: row.item.packageNo || '',
        description: row.item.description || row.item.generalDescription || '',
        itemCode: row.item.itemCode || '',
        qty: parseStrictPositiveNumber(row.qtyStr)!,
        countingUnit: row.item.countingUnit || 'عدد',
        drawingNo: '',
        remarks: row.remarks.trim(),
        system: row.item.system || '',
        island: row.item.island || '',
        unit: row.item.unit || '',
        supplier: row.item.supplier || '',
        receiver: row.item.receiver || '',
        merNo: row.item.merNo || '',
      }));

      const substituteItems: SubstitutionLineItem[] = step2List.map((row, idx) => ({
        detailedId: row.item.id,
        itemNo: row.item.itemNo || '',
        shipmentNo: row.item.shipmentNo || '',
        packageNo: row.item.packageNo || '',
        description: row.item.description || row.item.generalDescription || '',
        itemCode: row.item.itemCode || '',
        qty: parseStrictPositiveNumber(row.qtyStr)!,
        countingUnit: row.item.countingUnit || 'عدد',
        drawingNo: '',
        remarks: row.remarks.trim() || originalItems[idx]?.remarks || '',
        system: row.item.system || '',
        island: row.item.island || '',
        unit: row.item.unit || '',
        supplier: row.item.supplier || '',
        receiver: row.item.receiver || '',
        merNo: row.item.merNo || '',
        stockSource: row.stockSource,
      }));

      const totalOrigQty = originalItems.reduce((acc, i) => acc + i.qty, 0);
      const islandSystem = [previewHeaderMeta.island, previewHeaderMeta.system].filter(Boolean).join(' / ');

      // Determine whether linked MIV documents need to be created / re-issued
      const prevSubSig = (editingRecord?.substituteItems || [])
        .map((s) => `${s.detailedId}:${s.qty}:${s.stockSource || 'mapna'}`)
        .sort()
        .join('|');
      const nextSubSig = substituteItems
        .map((s) => `${s.detailedId}:${s.qty}:${s.stockSource || 'mapna'}`)
        .sort()
        .join('|');
      const needsMivReissue = !editingRecord || prevSubSig !== nextSubSig;

      let issuedMivDocs: MivDocumentRecord[] = [];
      let combinedMivNo = editingRecord?.mivNo || '';
      let mivDocIds: string[] = editingRecord?.mivDocIds || (editingRecord?.mivDocId ? [editingRecord.mivDocId] : []);

      if (needsMivReissue) {
        const oldLinkedMivs = editingRecord ? resolveLinkedMivDocs(editingRecord) : [];
        // Reverse old MIVs first so stock is cleanly restored before issuing updated MIVs
        for (const oldDoc of oldLinkedMivs) {
          await apiRequest(`/api/miv/${oldDoc.id}`, { method: 'DELETE' });
        }

        const remainingMivNos = mivDocuments
          .filter((m) => !oldLinkedMivs.some((old) => old.id === m.id))
          .map((m) => m.docNo);
        const usedMivNos = [...remainingMivNos];

        const issueMivGroup = async (
          docType: 'miv_mapna' | 'miv_contractor',
          groupRows: Step2RowDraft[],
        ) => {
          if (groupRows.length === 0) return;
          // Apply exact MD1EX-FQP02/05-03 MIV header, numbering, and 13-column rules
          const mivHeader = buildMivHeaderAutoFill(
            groupRows.map((r) => r.item),
            activeProject,
          );
          const mivParty = mivHeader.party || previewHeaderMeta.installerContractor;
          const mivSystemIsland =
            mivHeader.islandSystem ||
            [previewHeaderMeta.system, previewHeaderMeta.island].filter(Boolean).join('/');
          const mivUnit = mivHeader.unit || previewHeaderMeta.unit;
          const mivReceiptNo = mivHeader.receiptNo || '';
          const mivNo = generateMivDocumentNo(
            mivParty || primarySupplier,
            usedMivNos,
            plantDocConfig,
          );
          usedMivNos.push(mivNo);

          const res = await apiRequest<{ document: MivDocumentRecord }>('/api/miv', {
            method: 'POST',
            body: JSON.stringify({
              docType,
              docNo: mivNo,
              date: docDate,
              projectName: mivHeader.projectName || previewHeaderMeta.projectName,
              contractNo: mivHeader.contractNo || previewHeaderMeta.contractNo,
              party: mivParty,
              islandSystem: mivSystemIsland,
              unit: mivUnit,
              receiptNo: mivReceiptNo,
              receiver: mivParty,
              notes: `صدور خودکار بابت فرم جایگزینی شماره ${targetDocNo}`,
              items: groupRows.map((row) => {
                const qtyVal = parseStrictPositiveNumber(row.qtyStr)!;
                const userRemark = row.remarks.trim() || `جایگزینی ${targetDocNo}`;
                const stackedRemark = buildMivLineRemark(row.item.notes, userRemark);
                return {
                  detailedId: row.item.id,
                  qty: qtyVal,
                  requestedQty: qtyVal,
                  shipmentNo: row.item.shipmentNo || '',
                  packageNo: row.item.packageNo || '',
                  technicalInfo: row.item.size || '',
                  tagNo: row.item.itemNo || '',
                  codeNo: row.item.itemCode || '',
                  location: row.item.storageLocation || '',
                  uom: row.item.countingUnit || '',
                  opiNo: row.item.opiNo || '',
                  equipmentNotes: row.item.notes || '',
                  userRemark,
                  remark: stackedRemark,
                  sourceWarehouse: docType === 'miv_mapna' ? 'employer' : 'contractor',
                };
              }),
            }),
          });
          issuedMivDocs.push(res.document);
        };

        await issueMivGroup('miv_mapna', mapnaItems);
        await issueMivGroup('miv_contractor', contractorItems);
        combinedMivNo = issuedMivDocs.map((d) => d.docNo).join(', ');
        mivDocIds = issuedMivDocs.map((d) => d.id);
      } else if (editingRecord) {
        issuedMivDocs = resolveLinkedMivDocs(editingRecord);
      }

      const payload = {
        docNo: targetDocNo,
        date: docDate,
        detailedId: originalItems[0].detailedId,
        projectName: previewHeaderMeta.projectName,
        contractNo: previewHeaderMeta.contractNo,
        system: previewHeaderMeta.system,
        island: previewHeaderMeta.island,
        unit: previewHeaderMeta.unit,
        supplier: previewHeaderMeta.supplier,
        supplyUrgency: previewHeaderMeta.supplyUrgency,
        installerContractor: previewHeaderMeta.installerContractor,
        mivNo: combinedMivNo,
        mivDocId: mivDocIds[0],
        mivDocIds,
        merNcrNo: previewHeaderMeta.merNcrNo,
        originalDrawingNo: '',
        originalRemarks: originalItems[0].remarks || '',
        originalItems,
        substitutePackageNo: substituteItems[0].shipmentNo,
        substituteDescription: substituteItems.map((i) => i.description).join(' / '),
        substituteItemCode: substituteItems[0].itemCode,
        substituteDrawingNo: '',
        substituteRemarks: substituteItems[0].remarks || '',
        substituteItems,
        qty: totalOrigQty,
        reason: reason.trim(),
        reprocureBy: reprocureBy.trim(),
        costBorneBy: costBorneBy.trim(),
        supplierNotes: supplierNotes.trim(),
        status: 'executed',
      };

      const subRes = editingRecord
        ? await apiRequest<{ record: SubstitutionRecord }>(`/api/substitutions/${editingRecord.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ record: SubstitutionRecord }>('/api/substitutions', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      notify(
        'success',
        editingRecord
          ? isFa
            ? `فرم جایگزینی ${subRes.record.docNo} با موفقیت ویرایش و اطلاعات جدول جزئیات به‌روزرسانی شد.`
            : `Substitution ${subRes.record.docNo} updated.`
          : isFa
            ? `فرم جایگزینی ${subRes.record.docNo} ثبت شد و حواله خروج از انبار (${combinedMivNo}) به صورت خودکار صادر گردید.`
            : `Substitution ${subRes.record.docNo} saved and MIV (${combinedMivNo}) issued automatically.`,
      );
      void triggerAutoSnapshot(`${editingRecord ? 'ویرایش' : 'ثبت'} فرم جایگزینی ${subRes.record.docNo}`);

      resetBuilder();
      onDataChanged();
      await loadData();

      // Open simultaneous preview modal right away
      setPrintMode(issuedMivDocs.length > 0 ? 'both' : 'substitution');
      setPrintBundle({
        record: subRes.record,
        mivDocs: issuedMivDocs,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        notify('error', err.message);
      } else {
        notify('error', isFa ? 'خطا در ثبت فرم جایگزینی یا صدور حواله.' : 'Failed to save substitution.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resolveLinkedMivDocs = useCallback(
    (rec: SubstitutionRecord): MivDocumentRecord[] => {
      const matched: MivDocumentRecord[] = [];
      const seen = new Set<string>();
      const ids = rec.mivDocIds && rec.mivDocIds.length > 0
        ? rec.mivDocIds
        : rec.mivDocId
          ? [rec.mivDocId]
          : [];
      for (const id of ids) {
        const found = mivDocuments.find((m) => m.id === id);
        if (found && !seen.has(found.id)) {
          seen.add(found.id);
          matched.push(found);
        }
      }
      if (matched.length === 0 && rec.mivNo) {
        const tokens = rec.mivNo.split(/[,،/]+/).map((s) => s.trim()).filter(Boolean);
        for (const tok of tokens) {
          const found = mivDocuments.find((m) => m.docNo === tok);
          if (found && !seen.has(found.id)) {
            seen.add(found.id);
            matched.push(found);
          }
        }
      }
      return matched;
    },
    [mivDocuments],
  );

  const openRecordPreview = (rec: SubstitutionRecord) => {
    const linked = resolveLinkedMivDocs(rec);
    setPrintMode(linked.length > 0 ? 'both' : 'substitution');
    setPrintBundle({ record: rec, mivDocs: linked });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/substitutions/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', isFa ? `فرم جایگزینی ${deleteTarget.docNo} حذف شد.` : `Deleted ${deleteTarget.docNo}.`);
      setDeleteTarget(null);
      onDataChanged();
      await loadData();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [
        r.docNo,
        r.mivNo,
        r.supplier,
        r.shipmentNo,
        r.originalDescription,
        r.substituteDescription,
        r.reason,
        r.reprocureBy,
        r.costBorneBy,
        r.installerContractor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [records, historySearch]);

  const historyPagination = useClientPagination(filteredRecords, 25);

  const handleTriggerPrint = () => {
    triggerAppPrint({ title: printBundle?.record.docNo || 'Substitution' });
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {isFa ? 'فرم درخواست جایگزینی مواد و تجهیزات' : 'Equipment Replacement Form'}
              </h1>
              <span
                dir="ltr"
                className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--accent-primary)]"
              >
                {MD1_SUBSTITUTION_FORM_CODE}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {isFa
                ? 'انتخاب اقلام معیوب/نیازمند تعویض (بخش الف)، انتخاب اقلام جایگزین دارای موجودی (بخش ب)، صدور خودکار حواله انبار و چاپ همزمان'
                : 'Select items needing replacement (Section A), pick in-stock substitutes (Section B), auto-issue MIV, and print together'}
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <OperationalViewModeTabs
          mode={viewMode}
          onChange={setViewMode}
          historyCount={records.length}
          canEdit={canEdit}
          createLabelFa="ثبت فرم جایگزینی جدید"
          createLabelEn="New Substitution"
          historyLabelFa="سابقه فرم‌ها"
          historyLabelEn="History"
          testIdPrefix="sub"
        />
      </div>

      {/* CREATE / EDIT MODE — 2-STEP GUIDED WORKFLOW */}
      {viewMode === 'create' && canEdit && (
        <div className="space-y-4">
          {editingRecord && (
            <div
              data-testid="sub-editing-banner"
              className="rounded-xl border border-amber-500/45 bg-amber-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  {isFa
                    ? `در حال ویرایش فرم جایگزینی شماره ${editingRecord.docNo} (امکان ویرایش کامل بخش الف، بخش ب و مشخصات فرم)`
                    : `Editing Substitution Form ${editingRecord.docNo} (all sections editable)`}
                </span>
              </div>
              <button
                type="button"
                data-testid="sub-cancel-edit-btn"
                onClick={() => {
                  resetBuilder();
                  setViewMode('history');
                }}
                className="h-7 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold"
              >
                {isFa ? 'انصراف از ویرایش و بازگشت' : 'Cancel Edit'}
              </button>
            </div>
          )}

          {/* Stepper Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="sub-step1-tab"
              onClick={() => setStep(1)}
              className={`p-3 rounded-xl border text-start transition-colors flex items-center justify-between gap-3 ${
                step === 1
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 ${
                    step === 1
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  ۱
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {isFa ? 'بخش الف: اقلام نیازمند تعویض و جزئیات فرم' : 'Section A: Items Needing Replacement'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {isFa
                      ? `${step1List.length} قلم انتخاب شده · شماره خودکار: ${autoSubDocNo}`
                      : `${step1List.length} selected · Auto No: ${autoSubDocNo}`}
                  </div>
                </div>
              </div>
              {step1List.length > 0 && reason.trim() && reprocureBy.trim() && costBorneBy.trim() && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
            </button>

            <button
              type="button"
              data-testid="sub-step2-tab"
              onClick={() => setStep(2)}
              className={`p-3 rounded-xl border text-start transition-colors flex items-center justify-between gap-3 ${
                step === 2
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]/50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 ${
                    step === 2
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  ۲
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {isFa ? 'بخش ب: اقلام جایگزین دارای موجودی و صدور حواله' : 'Section B: In-Stock Substitutes & Auto MIV'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {isFa
                      ? `${step2List.length} قلم جایگزین انتخاب شده · حواله خودکار: ${previewMivLabel}`
                      : `${step2List.length} selected · Auto MIV: ${previewMivLabel}`}
                  </div>
                </div>
              </div>
              {step2List.length > 0 && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            </button>
          </div>

          {/* STEP 1 CONTENT */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Step 1 Filterable Table */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      {isFa
                        ? '۱. فیلتر و انتخاب اقلام نیازمند تعویض از جزئیات تجهیزات (بخش الف)'
                        : '1. Filter & Select Items Needing Replacement (Section A)'}
                    </h2>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isFa
                        ? 'مانند بخش جزئیات تجهیزات فیلتر کنید و یک یا چند ردیف را علامت بزنید.'
                        : 'Filter just like Detailed Equipment and check one or more rows.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Selection Undo / Redo / Reset / Back toolbar */}
                    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
                      <button
                        type="button"
                        data-testid="sub-step1-undo-btn"
                        disabled={step1UndoStack.length === 0}
                        onClick={handleStep1Undo}
                        title={isFa ? 'بازگردانی آخرین انتخاب (Undo)' : 'Undo selection'}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بازگردانی' : 'Undo'}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="sub-step1-redo-btn"
                        disabled={step1RedoStack.length === 0}
                        onClick={handleStep1Redo}
                        title={isFa ? 'انجام مجدد انتخاب (Redo)' : 'Redo selection'}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                      </button>
                      {step1List.length > 0 && (
                        <button
                          type="button"
                          data-testid="sub-step1-clear-btn"
                          onClick={() => commitStep1Selection(() => ({}))}
                          title={isFa ? 'پاک‌سازی انتخاب‌های مرحله ۱' : 'Clear Step 1 selection'}
                          className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isFa ? 'بازنشانی انتخاب' : 'Reset'}</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid="sub-step1-back-history-btn"
                      onClick={() => {
                        if (editingRecord) resetBuilder();
                        setViewMode('history');
                      }}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)]"
                    >
                      {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>{isFa ? 'بازگشت به سابقه' : 'Back to History'}</span>
                    </button>

                    <span className="text-[var(--text-muted)]">{isFa ? 'شماره جایگزینی:' : 'Doc No:'}</span>
                    <span
                      dir="ltr"
                      data-testid="sub-auto-docno"
                      className="px-2.5 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] font-mono font-bold tabular-nums"
                    >
                      {autoSubDocNo}
                    </span>
                  </div>
                </div>

                <SubstitutionItemPicker
                  stockOnly={false}
                  refreshSignal={refreshSignal}
                  selectedMap={step1SelectedMap}
                  onToggleRow={toggleStep1Row}
                  onTogglePage={toggleStep1Page}
                  testIdPrefix="sub-step1"
                />
              </div>

              {/* Selected Section A Rows Editor */}
              {step1List.length > 0 && (
                <div className="rounded-2xl border border-[var(--accent-primary)]/35 bg-[var(--bg-surface)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {isFa
                        ? `اقلام انتخاب‌شده بخش الف (${step1List.length} ردیف) — تعیین تعداد (فقط عدد) و توضیحات اختصاصی هر ردیف`
                        : `Selected Section A Items (${step1List.length}) — Set numeric quantity and per-row remarks`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => commitStep1Selection(() => ({}))}
                      className="text-[11px] font-semibold text-[var(--status-danger)] hover:underline"
                    >
                      {isFa ? 'حذف همه انتخاب‌ها' : 'Clear selection'}
                    </button>
                  </div>

                  {/* Auto-derived Metadata Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[11px]">
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'تأمین‌کننده:' : 'Supplier:'}</span>
                      <span className="font-bold text-[var(--text-primary)]">{previewHeaderMeta.supplier || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'سیستم:' : 'System:'}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{previewHeaderMeta.system || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'جزیره:' : 'Island:'}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{previewHeaderMeta.island || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'واحد:' : 'Unit:'}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{previewHeaderMeta.unit || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'پیمانکار نصب:' : 'Installer:'}</span>
                      <span className="font-semibold text-[var(--text-primary)]">{previewHeaderMeta.installerContractor || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">{isFa ? 'شماره NCR/MER:' : 'MER/NCR:'}</span>
                      <span dir="ltr" className="font-mono font-semibold text-[var(--text-primary)]">{previewHeaderMeta.merNcrNo || '—'}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">{isFa ? 'شماره بسته (PN)' : 'Packing'}</th>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">{isFa ? 'آیتم' : 'Item'}</th>
                          <th className="px-2.5 py-2 text-start min-w-[180px]">{isFa ? 'شرح مواد / تجهیزات' : 'Description'}</th>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">Tag No.</th>
                          <th className="px-2.5 py-2 text-start w-28">{isFa ? 'تعداد (عدد) *' : 'Qty *'}</th>
                          <th className="px-2.5 py-2 text-start min-w-[200px]">{isFa ? 'توضیحات اختصاصی ردیف' : 'Row Remarks'}</th>
                          <th className="px-2 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {step1List.map((row) => {
                          const qtyValid = parseStrictPositiveNumber(row.qtyStr) !== null;
                          return (
                            <tr key={row.item.id}>
                              <td dir="ltr" className="px-2.5 py-2 font-mono font-semibold whitespace-nowrap">
                                {row.item.shipmentNo}
                              </td>
                              <td dir="ltr" className="px-2.5 py-2 font-mono tabular-nums whitespace-nowrap">
                                {row.item.itemNo || '—'}
                              </td>
                              <td className="px-2.5 py-2 bidi-plaintext">
                                {row.item.description || row.item.generalDescription}
                              </td>
                              <td dir="ltr" className="px-2.5 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                                {row.item.itemCode || '—'}
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  dir="ltr"
                                  data-testid={`step1-qty-${row.item.id}`}
                                  aria-label={isFa ? `تعداد ${row.item.description}` : `Qty ${row.item.description}`}
                                  value={row.qtyStr}
                                  onChange={(e) => {
                                    const cleaned = sanitizeNumericQtyInput(e.target.value);
                                    setStep1Rows((prev) => ({
                                      ...prev,
                                      [row.item.id]: { ...prev[row.item.id], qtyStr: cleaned },
                                    }));
                                  }}
                                  className={`w-24 h-8 px-2.5 rounded-lg border bg-[var(--bg-canvas)] text-xs font-mono font-bold tabular-nums focus:outline-none ${
                                    qtyValid
                                      ? 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                                      : 'border-[var(--status-danger)] text-[var(--status-danger)]'
                                  }`}
                                />
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  data-testid={`step1-remarks-${row.item.id}`}
                                  aria-label={isFa ? `توضیحات ${row.item.description}` : `Remarks ${row.item.description}`}
                                  value={row.remarks}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setStep1Rows((prev) => ({
                                      ...prev,
                                      [row.item.id]: { ...prev[row.item.id], remarks: val },
                                    }));
                                  }}
                                  placeholder={isFa ? 'توضیحات این ردیف...' : 'Remarks for this row...'}
                                  className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  aria-label={isFa ? 'حذف ردیف' : 'Remove row'}
                                  onClick={() => toggleStep1Row(row.item)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Global Substitution Details Card */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                    {isFa ? '۲. اطلاعات کلی جایگزینی و تأمین مجدد' : '2. General Replacement & Re-procurement Details'}
                  </h2>

                  {/* Supply Urgency Selector (Default: عادی) */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      {isFa ? 'فوریت تأمین:' : 'Supply Urgency:'}
                    </span>
                    <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                      {SUPPLY_URGENCY_OPTIONS.map((opt) => {
                        const active = supplyUrgency === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            data-testid={opt === 'عادی' ? 'urgency-normal' : 'urgency-urgent'}
                            onClick={() => setSupplyUrgency(opt)}
                            className={`h-7 px-3 rounded-md text-xs font-bold transition-colors ${
                              active
                                ? opt === 'اضطراری'
                                  ? 'bg-[var(--status-danger)] text-white'
                                  : 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sub-reason" className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      {isFa ? 'دلیل تعویض قطعات *' : 'Reason for Replacement *'}
                    </label>
                    <textarea
                      id="sub-reason"
                      data-testid="sub-reason-input"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={isFa ? 'شرح علت نیاز به تعویض قطعات...' : 'Describe reason for replacing parts...'}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="sub-supplier-notes" className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      {isFa ? 'توضیحات تأمین کننده (اختیاری)' : 'Supplier Remarks (Optional)'}
                    </label>
                    <textarea
                      id="sub-supplier-notes"
                      data-testid="sub-supplier-notes-input"
                      rows={2}
                      value={supplierNotes}
                      onChange={(e) => setSupplierNotes(e.target.value)}
                      placeholder={isFa ? 'در صورت نداشتن توضیح می‌تواند خالی بماند...' : 'Optional — may be left empty...'}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="sub-reprocure" className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      {isFa ? 'تأمین کننده مجدد *' : 'Re-procurement Responsible Party *'}
                    </label>
                    <input
                      id="sub-reprocure"
                      data-testid="sub-reprocure-input"
                      type="text"
                      value={reprocureBy}
                      onChange={(e) => setReprocureBy(e.target.value)}
                      placeholder={isFa ? 'مثلاً: شرکت توگا / فروشنده / پیمانکار نصب' : 'e.g. TUGA / Vendor / Contractor'}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="sub-cost" className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                      {isFa ? 'هزینه‌ی تأمین مجدد *' : 'Cost Responsibility *'}
                    </label>
                    <input
                      id="sub-cost"
                      data-testid="sub-cost-input"
                      type="text"
                      value={costBorneBy}
                      onChange={(e) => setCostBorneBy(e.target.value)}
                      placeholder={isFa ? 'مثلاً: پیمانکار نصب / فروشنده / کارفرما' : 'e.g. Installation Contractor / Supplier'}
                      className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    data-testid="sub-go-step2-btn"
                    onClick={handleAdvanceToStep2}
                    className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <span>{isFa ? 'مرحله بعد: انتخاب اقلام جایگزین دارای موجودی' : 'Next: Select In-Stock Substitutes'}</span>
                    {isFa ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 CONTENT */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      {isFa
                        ? '۳. فیلتر و انتخاب اقلام جایگزین دارای موجودی (کارفرما یا پیمانکار — بخش ب)'
                        : '3. Filter & Select In-Stock Replacement Items (Employer or Contractor — Section B)'}
                    </h2>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isFa
                        ? 'فقط اقلامی نمایش داده می‌شوند که دارای موجودی مثبت در انبار کارفرما یا انبار پیمانکار باشند. با ثبت نهایی، حواله خروج از انبار به صورت خودکار صادر می‌شود.'
                        : 'Only items with positive Employer or Contractor stock are shown. Submitting automatically issues an MIV.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Step 2 Selection Undo / Redo / Reset / Back toolbar */}
                    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
                      <button
                        type="button"
                        data-testid="sub-step2-undo-btn"
                        disabled={step2UndoStack.length === 0}
                        onClick={handleStep2Undo}
                        title={isFa ? 'بازگردانی آخرین انتخاب (Undo)' : 'Undo selection'}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'بازگردانی' : 'Undo'}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="sub-step2-redo-btn"
                        disabled={step2RedoStack.length === 0}
                        onClick={handleStep2Redo}
                        title={isFa ? 'انجام مجدد انتخاب (Redo)' : 'Redo selection'}
                        className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                        <span>{isFa ? 'انجام مجدد' : 'Redo'}</span>
                      </button>
                      {step2List.length > 0 && (
                        <button
                          type="button"
                          data-testid="sub-step2-clear-btn"
                          onClick={() => commitStep2Selection(() => ({}))}
                          title={isFa ? 'پاک‌سازی انتخاب‌های مرحله ۲' : 'Clear Step 2 selection'}
                          className="h-7 px-2 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isFa ? 'بازنشانی' : 'Reset'}</span>
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid="sub-step2-top-back-btn"
                      onClick={() => setStep(1)}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 text-[var(--text-secondary)]"
                    >
                      {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>{isFa ? 'بازگشت به مرحله ۱' : 'Back to Step 1'}</span>
                    </button>

                    <span className="text-[var(--text-muted)]">{isFa ? 'شماره حواله خودکار:' : 'Auto MIV No:'}</span>
                    <span
                      dir="ltr"
                      data-testid="sub-auto-mivno"
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-mono font-bold tabular-nums"
                    >
                      {previewMivLabel}
                    </span>
                  </div>
                </div>

                <SubstitutionItemPicker
                  stockOnly={true}
                  refreshSignal={refreshSignal}
                  selectedMap={step2SelectedMap}
                  onToggleRow={toggleStep2Row}
                  onTogglePage={toggleStep2Page}
                  testIdPrefix="sub-step2"
                />
              </div>

              {/* Selected Section B Rows Editor */}
              {step2List.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/40 bg-[var(--bg-surface)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">
                      {isFa
                        ? `اقلام جایگزین انتخاب‌شده بخش ب (${step2List.length} ردیف) — تعیین تعداد خروج و حواله انبار`
                        : `Selected Replacement Items (${step2List.length}) — Set Issue Quantity`}
                    </h3>
                    <button
                      type="button"
                      onClick={() => commitStep2Selection(() => ({}))}
                      className="text-[11px] font-semibold text-[var(--status-danger)] hover:underline"
                    >
                      {isFa ? 'حذف همه انتخاب‌ها' : 'Clear selection'}
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">{isFa ? 'شماره بسته (PN)' : 'Packing'}</th>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">{isFa ? 'آیتم' : 'Item'}</th>
                          <th className="px-2.5 py-2 text-start min-w-[180px]">{isFa ? 'شرح مواد / تجهیزات' : 'Description'}</th>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">Tag No.</th>
                          <th className="px-2.5 py-2 text-start whitespace-nowrap">{isFa ? 'محل برداشت موجودی' : 'Stock Pool'}</th>
                          <th className="px-2.5 py-2 text-center whitespace-nowrap">{isFa ? 'موجودی مجاز' : 'Available'}</th>
                          <th className="px-2.5 py-2 text-start w-28">{isFa ? 'تعداد (عدد) *' : 'Qty *'}</th>
                          <th className="px-2.5 py-2 text-start min-w-[170px]">{isFa ? 'توضیحات (اختیاری)' : 'Remarks'}</th>
                          <th className="px-2 py-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {step2List.map((row) => {
                          const hasBoth = row.item.mapnaInventory > 0 && row.item.contractorInventory > 0;
                          const maxAvail = getEffectiveAvailableForStep2(row.item, row.stockSource);
                          const parsedQty = parseStrictPositiveNumber(row.qtyStr);
                          const qtyValid = parsedQty !== null && parsedQty <= maxAvail;

                          return (
                            <tr key={row.item.id}>
                              <td dir="ltr" className="px-2.5 py-2 font-mono font-semibold whitespace-nowrap">
                                {row.item.shipmentNo}
                              </td>
                              <td dir="ltr" className="px-2.5 py-2 font-mono tabular-nums whitespace-nowrap">
                                {row.item.itemNo || '—'}
                              </td>
                              <td className="px-2.5 py-2 bidi-plaintext">
                                {row.item.description || row.item.generalDescription}
                              </td>
                              <td dir="ltr" className="px-2.5 py-2 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                                {row.item.itemCode || '—'}
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                {hasBoth ? (
                                  <select
                                    value={row.stockSource}
                                    onChange={(e) => {
                                      const src = e.target.value as ReplacementStockSource;
                                      setStep2Rows((prev) => ({
                                        ...prev,
                                        [row.item.id]: { ...prev[row.item.id], stockSource: src },
                                      }));
                                    }}
                                    className="h-8 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-semibold"
                                  >
                                    <option value="mapna">{isFa ? 'انبار کارفرما' : 'Employer'}</option>
                                    <option value="contractor">{isFa ? 'انبار پیمانکار' : 'Contractor'}</option>
                                  </select>
                                ) : (
                                  <span
                                    className={`text-[11px] font-bold ${
                                      row.stockSource === 'mapna'
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-sky-700 dark:text-sky-400'
                                    }`}
                                  >
                                    {row.stockSource === 'mapna'
                                      ? isFa
                                        ? 'انبار کارفرما'
                                        : 'Employer Stock'
                                      : isFa
                                        ? 'انبار پیمانکار'
                                        : 'Contractor Stock'}
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-center font-mono font-bold tabular-nums">
                                {maxAvail}
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  dir="ltr"
                                  data-testid={`step2-qty-${row.item.id}`}
                                  aria-label={isFa ? `تعداد جایگزین ${row.item.description}` : `Substitute qty ${row.item.description}`}
                                  value={row.qtyStr}
                                  onChange={(e) => {
                                    const cleaned = sanitizeNumericQtyInput(e.target.value);
                                    setStep2Rows((prev) => ({
                                      ...prev,
                                      [row.item.id]: { ...prev[row.item.id], qtyStr: cleaned },
                                    }));
                                  }}
                                  className={`w-24 h-8 px-2.5 rounded-lg border bg-[var(--bg-canvas)] text-xs font-mono font-bold tabular-nums focus:outline-none ${
                                    qtyValid
                                      ? 'border-[var(--border-subtle)] focus:border-[var(--accent-primary)]'
                                      : 'border-[var(--status-danger)] text-[var(--status-danger)]'
                                  }`}
                                />
                              </td>
                              <td className="px-2.5 py-2">
                                <input
                                  type="text"
                                  data-testid={`step2-remarks-${row.item.id}`}
                                  aria-label={isFa ? `توضیحات جایگزین ${row.item.description}` : `Substitute remarks ${row.item.description}`}
                                  value={row.remarks}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setStep2Rows((prev) => ({
                                      ...prev,
                                      [row.item.id]: { ...prev[row.item.id], remarks: val },
                                    }));
                                  }}
                                  placeholder={isFa ? 'توضیحات ردیف جایگزین...' : 'Remarks...'}
                                  className="w-full h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  aria-label={isFa ? 'حذف ردیف' : 'Remove row'}
                                  onClick={() => toggleStep2Row(row.item)}
                                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Final Action Bar */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="h-10 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5"
                >
                  {isFa ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                  <span>{isFa ? 'بازگشت به مرحله ۱' : 'Back to Step 1'}</span>
                </button>

                <button
                  type="button"
                  data-testid="sub-submit-btn"
                  disabled={submitting}
                  onClick={() => void handleSubmitSubstitution()}
                  className="h-10 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-[var(--accent-contrast)] text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {submitting
                      ? isFa
                        ? editingRecord
                          ? 'در حال ذخیره تغییرات فرم جایگزینی...'
                          : 'در حال صدور حواله و ثبت فرم جایگزینی...'
                        : editingRecord
                          ? 'Saving changes...'
                          : 'Issuing MIV & saving...'
                      : editingRecord
                        ? isFa
                          ? 'ذخیره تغییرات فرم جایگزینی و پیش‌نمایش چاپ'
                          : 'Save Substitution Changes & Print Preview'
                        : isFa
                          ? 'ثبت فرم جایگزینی، صدور خودکار حواله و پیش‌نمایش چاپ'
                          : 'Save Substitution, Auto-Issue MIV & Print Preview'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORY MODE */}
      {viewMode === 'history' && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[240px]">
              <SearchInputWithClear
                value={historySearch}
                onChange={(v) => {
                  setHistorySearch(v);
                  historyPagination.setPage(1);
                }}
                placeholder={
                  isFa
                    ? 'جستجو در سابقه فرم‌های جایگزینی (شماره جایگزینی، شماره حواله، شرح، تأمین‌کننده...)'
                    : 'Search saved substitutions (Doc No, MIV No, description, supplier...)'
                }
              />
            </div>
            <div className="text-xs text-[var(--text-muted)] tabular-nums">
              {isFa ? `${filteredRecords.length} فرم ثبت‌شده` : `${filteredRecords.length} records`}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
            <StickyTableWrapper maxHeightClass="max-h-[520px]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-3 py-2.5 text-start whitespace-nowrap">{isFa ? 'شماره جایگزینی' : 'Doc No.'}</th>
                    <th className="px-3 py-2.5 text-start whitespace-nowrap">{isFa ? 'تاریخ' : 'Date'}</th>
                    <th className="px-3 py-2.5 text-start whitespace-nowrap">{isFa ? 'شماره حواله' : 'MIV No.'}</th>
                    <th className="px-3 py-2.5 text-start whitespace-nowrap">{isFa ? 'تأمین‌کننده' : 'Supplier'}</th>
                    <th className="px-3 py-2.5 text-start whitespace-nowrap">{isFa ? 'فوریت' : 'Urgency'}</th>
                    <th className="px-3 py-2.5 text-start min-w-[180px]">{isFa ? 'اقلام بخش الف' : 'Section A'}</th>
                    <th className="px-3 py-2.5 text-start min-w-[180px]">{isFa ? 'اقلام جایگزین (بخش ب)' : 'Section B'}</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                        {t.controls.loading}
                      </td>
                    </tr>
                  ) : historyPagination.pageItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-[var(--text-muted)]">
                        {isFa ? 'هیچ فرم جایگزینی ثبت نشده است.' : 'No substitution records found.'}
                      </td>
                    </tr>
                  ) : (
                    historyPagination.pageItems.map((rec) => {
                      const origCount = rec.originalItems?.length || 1;
                      const subCount = rec.substituteItems?.length || 1;
                      return (
                        <tr key={rec.id} className="hover:bg-[var(--bg-subtle)]/50">
                          <td dir="ltr" className="px-3 py-2.5 font-mono font-bold text-[var(--accent-primary)] whitespace-nowrap">
                            {rec.docNo}
                          </td>
                          <td dir="ltr" className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                            {formatDate(rec.date)}
                          </td>
                          <td dir="ltr" className="px-3 py-2.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            {rec.mivNo || '—'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{rec.supplier || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={`text-[11px] font-bold ${
                                rec.supplyUrgency === 'اضطراری'
                                  ? 'text-[var(--status-danger)]'
                                  : 'text-[var(--text-secondary)]'
                              }`}
                            >
                              {rec.supplyUrgency || DEFAULT_SUPPLY_URGENCY}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 bidi-plaintext">
                            <div className="font-medium text-[var(--text-primary)] truncate max-w-[240px]">
                              {rec.originalDescription}
                            </div>
                            <div className="text-[10.5px] text-[var(--text-muted)]">
                              {isFa ? `${origCount} قلم · بسته ${rec.shipmentNo}` : `${origCount} item(s) · ${rec.shipmentNo}`}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 bidi-plaintext">
                            <div className="font-medium text-[var(--text-primary)] truncate max-w-[240px]">
                              {rec.substituteDescription}
                            </div>
                            <div className="text-[10.5px] text-[var(--text-muted)]">
                              {isFa ? `${subCount} قلم جایگزین` : `${subCount} substitute(s)`}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                data-testid={`sub-preview-btn-${rec.docNo}`}
                                onClick={() => openRecordPreview(rec)}
                                className="h-8 px-2.5 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>{isFa ? 'چاپ همزمان' : 'Print'}</span>
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  data-testid={`sub-edit-btn-${rec.docNo}`}
                                  aria-label={isFa ? `ویرایش ${rec.docNo}` : `Edit ${rec.docNo}`}
                                  title={isFa ? `ویرایش فرم ${rec.docNo}` : `Edit ${rec.docNo}`}
                                  onClick={() => handleStartEdit(rec)}
                                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                                  <span>{isFa ? 'ویرایش' : 'Edit'}</span>
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  data-testid={`sub-delete-btn-${rec.docNo}`}
                                  aria-label={isFa ? `حذف ${rec.docNo}` : `Delete ${rec.docNo}`}
                                  onClick={() => setDeleteTarget(rec)}
                                  className="p-1.5 rounded-lg text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
            </StickyTableWrapper>
            <TablePaginationBar
              page={historyPagination.page}
              totalPages={historyPagination.totalPages}
              pageSize={historyPagination.pageSize}
              total={historyPagination.total}
              onPageChange={historyPagination.setPage}
              onPageSizeChange={historyPagination.setPageSize}
              lang={prefs.language}
            />
          </div>
        </div>
      )}

      {/* SIMULTANEOUS PRINT PREVIEW MODAL (MD1EX-FQP02/10-03 + Auto-Issued MIV Voucher(s)) */}
      {printBundle && (
        <div
          data-testid="sub-print-preview-modal"
          className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden"
        >
          <div className="w-full max-w-6xl max-h-[94vh] flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden">
            {/* Modal Toolbar */}
            <div className="px-4 sm:px-5 py-3 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5 bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[var(--text-primary)] truncate">
                    {isFa
                      ? `پیش‌نمایش چاپ همزمان — فرم جایگزینی ${printBundle.record.docNo}${
                          printBundle.mivDocs.length > 0
                            ? ` + حواله خروج (${printBundle.mivDocs.map((m) => m.docNo).join(', ')})`
                            : ''
                        }`
                      : `Simultaneous Print Preview — ${printBundle.record.docNo}`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {printBundle.mivDocs.length > 0 && (
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-subtle)] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPrintMode('both')}
                      className={`h-7 px-2.5 rounded-md font-semibold transition-colors ${
                        printMode === 'both'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {isFa ? 'هر دو فرم (همزمان)' : 'Both Forms'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintMode('substitution')}
                      className={`h-7 px-2.5 rounded-md font-semibold transition-colors ${
                        printMode === 'substitution'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {isFa ? 'فقط جایگزینی' : 'Replacement Only'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintMode('miv')}
                      className={`h-7 px-2.5 rounded-md font-semibold transition-colors ${
                        printMode === 'miv'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {isFa ? 'فقط حواله خروج' : 'MIV Only'}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  data-testid="sub-print-both-btn"
                  onClick={handleTriggerPrint}
                  className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {printMode === 'both' && printBundle.mivDocs.length > 0
                      ? isFa
                        ? 'چاپ همزمان فرم جایگزینی و حواله'
                        : 'Print Both Forms'
                      : isFa
                        ? 'چاپ فرم'
                        : 'Print'}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={isFa ? 'بستن پیش‌نمایش' : 'Close preview'}
                  onClick={() => setPrintBundle(null)}
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Canvas */}
            <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-200/80 dark:bg-slate-900/70 space-y-6">
              {(printMode === 'both' || printMode === 'substitution') && (
                <div className="max-w-[820px] mx-auto bg-white p-5 sm:p-7 rounded-xl shadow-lg border border-slate-300">
                  <div className="mb-3 pb-2 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-700" />
                      {isFa ? 'برگه ۱: فرم درخواست جایگزینی مواد و تجهیزات (MD1EX-FQP02/10-03)' : 'Sheet 1: Replacement Form'}
                    </span>
                    <span dir="ltr" className="font-mono">
                      {printBundle.record.docNo}
                    </span>
                  </div>
                  <OfficialSubstitutionSheet rec={printBundle.record} formatDate={formatDate} />
                </div>
              )}

              {(printMode === 'both' || printMode === 'miv') &&
                printBundle.mivDocs.map((mivDoc, idx) => (
                  <div
                    key={mivDoc.id}
                    data-testid={`auto-miv-preview-sheet-${mivDoc.docNo}`}
                    className="max-w-[1060px] mx-auto bg-white p-5 sm:p-7 rounded-xl shadow-lg border border-slate-300"
                  >
                    <div className="mb-3 pb-2 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-emerald-700" />
                        {isFa
                          ? `برگه ${idx + 2}: حواله خروج از انبار صادرشده خودکار`
                          : `Sheet ${idx + 2}: Auto-Issued MIV Voucher`}
                      </span>
                      <span dir="ltr" className="font-mono">
                        {mivDoc.docNo}
                      </span>
                    </div>
                    <OfficialMivSheet
                      doc={mivDoc}
                      detailedItems={detailedItems}
                      formatDate={formatDate}
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED ISOLATED PRINT PORTAL — Hides live app UI completely and prints Replacement Form (A4 Portrait) + Auto-Issued MIV Voucher(s) (A4 Landscape) with safe 12mm margins */}
      {printBundle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="samaan-substitution-print-root" data-samaan-print-portal="true">
            <style>
              {buildIsolatedPrintPortalCss('samaan-substitution-print-root', {
                orientation:
                  printMode === 'miv'
                    ? 'landscape'
                    : printMode === 'substitution'
                      ? 'portrait'
                      : 'mixed',
                isFa,
                marginMm: 12,
                showBrowserPageFooter: false,
              })}
            </style>
            {(printMode === 'both' || printMode === 'substitution') && (
              <div
                className={`samaan-print-sheet-portrait ${
                  printMode === 'both' && printBundle.mivDocs.length > 0
                    ? 'samaan-print-page-break'
                    : ''
                }`}
              >
                <OfficialSubstitutionSheet rec={printBundle.record} formatDate={formatDate} />
              </div>
            )}
            {(printMode === 'both' || printMode === 'miv') &&
              printBundle.mivDocs.map((mivDoc, idx) => (
                <div
                  key={mivDoc.id}
                  className={`samaan-print-sheet-landscape ${
                    idx < printBundle.mivDocs.length - 1 ? 'samaan-print-page-break' : ''
                  }`}
                >
                  <OfficialMivSheet
                    doc={mivDoc}
                    detailedItems={detailedItems}
                    formatDate={formatDate}
                  />
                </div>
              ))}
          </div>,
          document.body,
        )}

      <ConfirmActionModal
        open={Boolean(deleteTarget)}
        title={isFa ? 'حذف فرم جایگزینی' : 'Delete Substitution Record'}
        itemLabel={deleteTarget?.docNo}
        message={
          deleteTarget
            ? isFa
              ? `آیا از حذف فرم جایگزینی شماره «${deleteTarget.docNo}» اطمینان دارید؟ با حذف این فرم، حواله خروج مرتبط نیز ابطال شده، موجودی کالاهای بخش ب به انبار بازمی‌گردد و اطلاعات جایگزینی از جدول ثبت جزئیات پاک خواهد شد.`
              : `Are you sure you want to delete substitution "${deleteTarget.docNo}"? Linked MIV vouchers will be reversed to restore stock and substitution details will be cleared from Detailed Equipment.`
            : ''
        }
        confirmLabel={isFa ? 'حذف فرم' : 'Delete'}
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
