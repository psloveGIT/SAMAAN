import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Columns3,
  Download,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Link2,
  Loader2,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest, ApiError, isStaticFallbackMode } from '../lib/api.ts';
import { StickyTableWrapper } from './StickyTableWrapper.tsx';
import {
  deleteIndexedDbSnapshot,
  downloadJsonBackup,
  getIndexedDbSnapshotPayload,
  listIndexedDbSnapshots,
  saveSnapshotToIndexedDb,
} from '../lib/indexedDbBackup.ts';
import type { LocalBackupSnapshotMeta } from '../lib/indexedDbBackup.ts';
import type { ImportColumnDef } from '../shared/csvParser.ts';
import {
  ALL_EXTENDED_SCOPES,
  EXTENDED_SCOPE_META,
  isOperationalScope,
  type AutoWorkbookCommitSummary,
  type AutoWorkbookPreviewSection,
  type ExtendedImportScope,
  type OperationalLinkCounts,
} from '../shared/operationalFormImport.ts';
import {
  computeImportContentFingerprint,
  type ImportDeltaSummary,
} from '../shared/importDelta.ts';
import { formatIsoDate } from '../shared/jalali.ts';
import { parseSpreadsheetFile, type StructuredSheetPayload } from '../shared/spreadsheetImport.ts';
import type {
  CalendarMode,
  DatabaseSnapshot,
  ImportRejectedRecord,
  ImportRejectionReasonCode,
} from '../shared/types.ts';

interface StoredUploadHistoryEntry {
  fingerprint: string;
  fileName: string;
  uploadedAt: string;
}

interface BackupViewProps {
  onRestored: () => void;
}

interface ColumnInspectionPayload {
  scope: 'general' | 'detailed' | 'transit';
  dataStartIndex: number;
  fileColumns: Array<{ index: number; header: string; samples: string[] }>;
  targetFields: ImportColumnDef[];
  mapping: Record<string, number>;
}

interface PreviewResponse {
  scope: ExtendedImportScope;
  isOperational?: boolean;
  totalRows: number;
  skippedEmpty: number;
  parseRejectedRows?: ImportRejectedRecord[];
  duplicateRowNos: number;
  duplicateDbCount?: number;
  duplicateInFileCount?: number;
  duplicateRecordsCount: number;
  duplicateSamples: string[];
  estimatedLinks?: OperationalLinkCounts;
  warnings?: string[];
  sample: Record<string, unknown>[];
  parsedRows?: Record<string, unknown>[];
  parsedRowsTruncated?: boolean;
  columnInspection?: ColumnInspectionPayload;
  deltaSummary?: ImportDeltaSummary;
}

interface CommitResponse {
  scope: ExtendedImportScope;
  isOperational?: boolean;
  imported: number;
  replaced: number;
  skipped: number;
  unchangedSkipped?: number;
  parseRejectedCount?: number;
  blankRowsSkipped?: number;
  transitAutoArrived: number;
  linkedGeneral?: number;
  linkedDetailed?: number;
  linkedTransit?: number;
  warnings?: string[];
  rejectedRecords?: ImportRejectedRecord[];
}

interface ImportLogSessionEntry {
  id: string;
  timestamp: string;
  sourceLabel: string;
  scope: ExtendedImportScope;
  imported: number;
  replaced: number;
  skipped: number;
  unchangedSkipped?: number;
  blankRowsSkipped: number;
  transitAutoArrived: number;
  linkedGeneral?: number;
  linkedDetailed?: number;
  linkedTransit?: number;
  rejectedReasons: Array<{
    sourceRowIndex?: number;
    reasonCode: ImportRejectionReasonCode;
    reasonText: string;
    summary: string;
  }>;
}

function getScopeDisplayLabel(scope: ExtendedImportScope, isFa: boolean): string {
  const meta = EXTENDED_SCOPE_META[scope];
  if (!meta) return scope;
  return isFa ? meta.labelFa : meta.labelEn;
}

function summarizeOperationalRow(
  scope: ExtendedImportScope,
  row: Record<string, unknown>,
  isFa: boolean,
  calendar: CalendarMode,
): { primary: string; secondary: string; badge?: string } {
  const s = (k: string) => (row[k] === null || row[k] === undefined ? '' : String(row[k]));
  const d = (k: string) => {
    const raw = s(k);
    return raw ? formatIsoDate(raw, calendar) : '';
  };
  const itemsLen = Array.isArray(row.items) ? row.items.length : Array.isArray(row.answers) ? row.answers.length : Array.isArray(row.rows) ? row.rows.length : 0;
  switch (scope) {
    case 'siteEntryMinutes':
      return {
        primary: s('minutesNo') || '-',
        secondary: `${Array.isArray(row.packingListNos) ? (row.packingListNos as string[]).join('، ') : ''} · ${s('supplier') || d('date')}`,
        badge: itemsLen > 0 ? (isFa ? `${itemsLen} قلم` : `${itemsLen} items`) : undefined,
      };
    case 'opiInvitations':
      return {
        primary: s('invitationNo') || '-',
        secondary: `${Array.isArray(row.packingNos) ? (row.packingNos as string[]).join('، ') : ''} · ${d('date')}`,
        badge: s('location') || undefined,
      };
    case 'opiMinutes':
      return {
        primary: s('minutesNo') || '-',
        secondary: `${s('packingListNo')} · ${d('date')}${s('merNo') ? ` · MER: ${s('merNo')}` : ''}`,
        badge: s('resultStatus') === 'has_discrepancy' ? (isFa ? 'دارای مغایرت' : 'Discrepancy') : (isFa ? 'تطابق کامل' : 'Compliant'),
      };
    case 'osdrReports':
      return {
        primary: s('reportNo') || '-',
        secondary: `${s('packingListNo')} · ${s('supplier') || d('date')}`,
        badge: isFa ? `${itemsLen} قلم مغایرت` : `${itemsLen} items`,
      };
    case 'gcvDocuments':
      return {
        primary: s('receiptNo') || '-',
        secondary: `${s('receiver')} · ${d('date')}`,
        badge: isFa ? `${itemsLen} قلم` : `${itemsLen} items`,
      };
    case 'mivDocuments':
      return {
        primary: s('docNo') || '-',
        secondary: `${s('party') || s('receiver') || '-'} · ${d('date')}`,
        badge: `${s('docType')} (${itemsLen})`,
      };
    case 'substitutions':
      return {
        primary: s('docNo') || '-',
        secondary: `${s('shipmentNo')} · ${s('substituteDescription') || s('originalDescription')}`,
        badge: s('status') || undefined,
      };
    case 'materialEstimates':
      return {
        primary: s('mtoCode') || s('itemCode') || '-',
        secondary: `${s('description')} (${s('size') || '-'})`,
        badge: `${s('estimatedQty')} ${s('countingUnit')}`,
      };
    case 'materialBalance':
      return {
        primary: s('bmrNo') || '-',
        secondary: `${s('shipmentNo') || '-'} · ${s('description') || '-'}`,
        badge: s('status') || (itemsLen > 0 ? (isFa ? `${itemsLen} قلم` : `${itemsLen} items`) : undefined),
      };
    case 'periodicInspections':
      return {
        primary: d('inspectionDate') || '-',
        secondary: `${s('projectName') || '-'} · ${s('supervisorName') || '-'}`,
        badge: isFa ? `${itemsLen} بند چک‌لیست` : `${itemsLen} checks`,
      };
    case 'stocktake':
      return {
        primary: `${s('shipmentNo') || s('itemCode') || '-'}${s('itemNo') ? ` / #${s('itemNo')}` : ''}`,
        secondary: `${s('stocktakeStatus')} · ${d('stocktakeDate')}`,
        badge: s('storageLocation') || undefined,
      };
    case 'customFormSubmissions':
      return {
        primary: `${s('formTitle')} · ${s('docNo')}`,
        secondary: `${s('packingListNo') ? `پکینگ: ${s('packingListNo')} · ` : ''}${d('date')}`,
        badge: itemsLen > 0 ? (isFa ? `${itemsLen} ردیف` : `${itemsLen} rows`) : undefined,
      };
    default:
      return { primary: '-', secondary: '' };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function editableFieldsForScope(scope: 'general' | 'detailed' | 'transit'): string[] {
  if (scope === 'general') {
    return [
      'packingListNo',
      'packageNo',
      'packageType',
      'itemCount',
      'itemDescription',
      'supplier',
      'dispatchLocation',
      'arrivalDate',
      'island',
      'system',
      'subSystem',
      'unit',
      'grossWeight',
      'netWeight',
      'lengthCm',
      'widthCm',
      'heightCm',
      'billOfLadingNo',
      'vehicleNo',
      'driverName',
      'freightCost',
    ];
  }
  if (scope === 'detailed') {
    return [
      'shipmentNo',
      'packageNo',
      'itemNo',
      'generalDescription',
      'description',
      'size',
      'itemCode',
      'packingQty',
      'actualQty',
      'shortage',
      'surplus',
      'countingUnit',
      'itemCategory',
      'chemicalType',
      'productionDate',
      'expirationDate',
      'arrivalDate',
    ];
  }
  return [
    'packingListNo',
    'packageNo',
    'overallStatus',
    'arrivalDate',
    'supplier',
    'dispatchLocation',
    'itemDescription',
    'releaseNetNo',
    'billOfLadingNo',
    'amount',
  ];
}

function quickFixFieldsForRejectedScope(scope: 'general' | 'detailed' | 'transit'): {
  key: string;
  labelFa: string;
  labelEn: string;
}[] {
  if (scope === 'general') {
    return [
      { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.' },
      { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
      { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description' },
      { key: 'supplier', labelFa: 'تامین‌کننده', labelEn: 'Supplier' },
    ];
  }
  if (scope === 'detailed') {
    return [
      { key: 'shipmentNo', labelFa: 'شماره محموله / پکینگ', labelEn: 'Shipment No.' },
      { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
      { key: 'itemNo', labelFa: 'شماره آیتم', labelEn: 'Item No.' },
      { key: 'description', labelFa: 'شرح کالا', labelEn: 'Description' },
    ];
  }
  return [
    { key: 'packingListNo', labelFa: 'شماره پکینگ لیست', labelEn: 'Packing List No.' },
    { key: 'packageNo', labelFa: 'شماره نگله', labelEn: 'Package No.' },
    { key: 'overallStatus', labelFa: 'وضعیت کلی', labelEn: 'Overall Status' },
    { key: 'itemDescription', labelFa: 'شرح کالا', labelEn: 'Item Description' },
  ];
}

function reasonBadgeText(code: ImportRejectionReasonCode, isFa: boolean): string {
  switch (code) {
    case 'duplicate_db':
      return isFa ? 'تکراری در پایگاه داده' : 'Duplicate in DB';
    case 'duplicate_in_file':
      return isFa ? 'تکراری درون فایل' : 'Duplicate in File';
    case 'missing_required':
      return isFa ? 'نقص فیلدهای کلیدی' : 'Missing Key Fields';
    default:
      return isFa ? 'داده نامعتبر' : 'Invalid Data';
  }
}

export const BackupView: React.FC<BackupViewProps> = ({ onRestored }) => {
  const { prefs, user, notify, formatTimestamp, triggerAutoSnapshot, activeProjectId, activeProject } = useApp();
  const isFa = prefs.language === 'fa';
  const isAdmin = user?.role === 'admin';
  const canImport = user?.role === 'admin' || user?.role === 'operator';

  // Offline Backup & Restore state (lightweight metadata only — instant render!)
  const [snapshots, setSnapshots] = useState<LocalBackupSnapshotMeta[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [loadingSnapId, setLoadingSnapId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Unified 3-Step Guided Spreadsheet / CSV / JSON Import Wizard State
  const [importStep, setImportStep] = useState<0 | 1 | 2 | 3>(0);
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [checkedSheets, setCheckedSheets] = useState<string[]>([]);
  const [sheetsMap, setSheetsMap] = useState<Record<string, string[][]>>({});
  const [sheetFormulasMap, setSheetFormulasMap] = useState<Record<string, Record<string, string>>>({});
  const [structuredSheetsMap, setStructuredSheetsMap] = useState<Record<string, StructuredSheetPayload>>({});
  const [assumedCalendar, setAssumedCalendar] = useState<'jalali' | 'gregorian'>('jalali');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'delta' | 'replace' | 'skip'>('delta');
  const [analyzingSheets, setAnalyzingSheets] = useState(false);
  const [currentFileFingerprint, setCurrentFileFingerprint] = useState<string>('');
  const [previousUploadMatch, setPreviousUploadMatch] = useState<{ fileName: string; uploadedAt: string } | null>(null);
  const uploadHistoryStorageKey = `samaan_import_history_v1_${activeProjectId}`;

  // Step 2: Detected multi-section candidates per selected sheet & user-confirmed target scopes
  const [autoWorkbookPreview, setAutoWorkbookPreview] = useState<AutoWorkbookPreviewSection[]>([]);
  const [selectedScopesBySheet, setSelectedScopesBySheet] = useState<Record<string, ExtendedImportScope[]>>({});

  // Step 3: Confirmed (sheetName, scope) tasks, lazy per-task preview, column mapping & edited rows
  const [confirmedTasks, setConfirmedTasks] = useState<Array<{ taskKey: string; sheetName: string; scope: ExtendedImportScope }>>([]);
  const [activeTaskKey, setActiveTaskKey] = useState<string>('');
  const [loadingTaskKey, setLoadingTaskKey] = useState<string | null>(null);
  const [taskPreviews, setTaskPreviews] = useState<Record<string, PreviewResponse>>({});
  const [taskMappings, setTaskMappings] = useState<Record<string, Record<string, number>>>({});
  const [taskEditedRows, setTaskEditedRows] = useState<Record<string, Record<string, unknown>[]>>({});
  const [dirtyEditedTasks, setDirtyEditedTasks] = useState<Record<string, boolean>>({});
  const [mappingExpanded, setMappingExpanded] = useState(true);
  const [rowsConfirmed, setRowsConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoWorkbookResult, setAutoWorkbookResult] = useState<AutoWorkbookCommitSummary | null>(null);

  // Import Log & Rejected Records Recovery State (persisted per active project in sessionStorage)
  const logsStorageKey = `samaan_import_logs_${activeProjectId}`;
  const pendingStorageKey = `samaan_import_pending_${activeProjectId}`;

  const [importLogs, setImportLogs] = useState<ImportLogSessionEntry[]>(() => {
    try {
      const raw = sessionStorage.getItem(logsStorageKey);
      return raw ? (JSON.parse(raw) as ImportLogSessionEntry[]) : [];
    } catch {
      return [];
    }
  });

  const [pendingRejected, setPendingRejected] = useState<ImportRejectedRecord[]>(() => {
    try {
      const raw = sessionStorage.getItem(pendingStorageKey);
      return raw ? (JSON.parse(raw) as ImportRejectedRecord[]) : [];
    } catch {
      return [];
    }
  });

  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const rawLogs = sessionStorage.getItem(logsStorageKey);
      const rawPend = sessionStorage.getItem(pendingStorageKey);
      setImportLogs(rawLogs ? (JSON.parse(rawLogs) as ImportLogSessionEntry[]) : []);
      setPendingRejected(rawPend ? (JSON.parse(rawPend) as ImportRejectedRecord[]) : []);
    } catch {
      setImportLogs([]);
      setPendingRejected([]);
    }
  }, [logsStorageKey, pendingStorageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(logsStorageKey, JSON.stringify(importLogs.slice(0, 15)));
    } catch {
      // ignore storage quota
    }
  }, [importLogs, logsStorageKey]);

  useEffect(() => {
    try {
      // Cap persisted rejected items to avoid synchronous JSON bloat on mount
      sessionStorage.setItem(pendingStorageKey, JSON.stringify(pendingRejected.slice(0, 150)));
    } catch {
      // ignore storage quota
    }
  }, [pendingRejected, pendingStorageKey]);

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    try {
      const list = await listIndexedDbSnapshots(activeProjectId);
      setSnapshots(list);
    } catch {
      // IndexedDB unavailable
    } finally {
      setSnapshotsLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const loadTaskPreview = useCallback(
    async (
      taskKey: string,
      sheetNameParam: string,
      scopeVal: ExtendedImportScope,
      calVal: 'jalali' | 'gregorian',
      explicitMapping?: Record<string, number>,
    ) => {
      const matrix = sheetsMap[sheetNameParam] || [];
      const formulaMap = sheetFormulasMap[sheetNameParam];
      const structPayload = structuredSheetsMap[sheetNameParam];
      const hasStruct = Boolean(structPayload?.records && structPayload.records.length > 0);
      if (matrix.length === 0 && !hasStruct) return;
      setLoadingTaskKey(taskKey);
      try {
        const res = await apiRequest<PreviewResponse>('/api/import/preview', {
          method: 'POST',
          body: JSON.stringify({
            matrix,
            ...(formulaMap && Object.keys(formulaMap).length > 0 ? { formulaMap } : {}),
            ...(hasStruct ? { structuredRecords: structPayload!.records, sectionHint: structPayload!.sectionHint } : {}),
            sheetName: sheetNameParam,
            scope: scopeVal,
            assumedCalendar: calVal,
            ...(explicitMapping ? { columnMapping: explicitMapping } : {}),
          }),
        });
        setTaskPreviews((prev) => ({ ...prev, [taskKey]: res }));
        if (res.columnInspection?.mapping || explicitMapping) {
          setTaskMappings((prev) => ({
            ...prev,
            [taskKey]: res.columnInspection?.mapping || explicitMapping || {},
          }));
        }
        setTaskEditedRows((prev) => ({
          ...prev,
          [taskKey]: res.parsedRows || res.sample || [],
        }));
        setDirtyEditedTasks((prev) => ({ ...prev, [taskKey]: false }));
      } catch (err) {
        if (err instanceof ApiError) notify('error', err.message);
      } finally {
        setLoadingTaskKey((cur) => (cur === taskKey ? null : cur));
      }
    },
    [notify, sheetsMap, sheetFormulasMap, structuredSheetsMap],
  );

  // Step 0 -> Step 1: Parse file and ONLY ask user which sheet(s) to import (NEVER auto-preview/import Sheet 1!)
  const handleSelectDataFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAutoWorkbookResult(null);
    setAutoWorkbookPreview([]);
    setSelectedScopesBySheet({});
    setConfirmedTasks([]);
    setActiveTaskKey('');
    setTaskPreviews({});
    setTaskMappings({});
    setTaskEditedRows({});
    setDirtyEditedTasks({});
    setRowsConfirmed(false);
    setCurrentFileFingerprint('');
    setPreviousUploadMatch(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const nextStructMap = parsed.structuredSheets || {};
      const fingerprint = computeImportContentFingerprint(parsed.fileName, parsed.sheets);
      setCurrentFileFingerprint(fingerprint);
      try {
        const rawHist = localStorage.getItem(uploadHistoryStorageKey);
        const hist: StoredUploadHistoryEntry[] = rawHist ? JSON.parse(rawHist) : [];
        const matched = hist.find((h) => h.fingerprint === fingerprint);
        setPreviousUploadMatch(matched ? { fileName: matched.fileName, uploadedAt: matched.uploadedAt } : null);
      } catch {
        setPreviousUploadMatch(null);
      }
      setFileName(parsed.fileName);
      setSheetNames(parsed.sheetNames);
      setSheetsMap(parsed.sheets);
      setSheetFormulasMap(parsed.sheetFormulas || {});
      setStructuredSheetsMap(nextStructMap);
      // Single-sheet files (e.g. CSV) pre-check that 1 sheet for convenience; multi-sheet workbooks ask the user explicitly!
      setCheckedSheets(parsed.sheetNames.length === 1 ? [parsed.sheetNames[0]] : []);
      setImportStep(1);
    } catch (err) {
      notify(
        'error',
        err instanceof Error
          ? err.message
          : isFa
            ? 'خطا در خواندن فایل ورودی.'
            : 'Failed to parse input file.',
      );
    }
  };

  const toggleCheckedSheet = (sheetName: string) => {
    setCheckedSheets((prev) =>
      prev.includes(sheetName) ? prev.filter((s) => s !== sheetName) : [...prev, sheetName],
    );
  };

  // Build a fast representative sample for Step 1 -> Step 2 scope detection when a sheet has > 1,500 rows.
  // Preserves header rows, top data rows, evenly distributed rows across the file, AND non-empty samples
  // for every sparse operational column (OPI/GCV/MIV/SMR/REP/BMR) so Step 1 -> Step 2 completes in < 1s
  // instead of serializing 30MB+ JSON and freezing the browser! Full data is still used in Step 3 & Step 4.
  const buildFastDetectionPayload = (
    name: string,
    fullMatrix: string[][],
    fullFormulas?: Record<string, string>,
  ): { matrix: string[][]; formulaMap?: Record<string, string> } => {
    const MAX_FAST_ROWS = 1500;
    if (fullMatrix.length <= MAX_FAST_ROWS) {
      return {
        matrix: fullMatrix,
        ...(fullFormulas && Object.keys(fullFormulas).length > 0 ? { formulaMap: fullFormulas } : {}),
      };
    }

    const pickedIndices = new Set<number>();
    // 1. Always keep first 6 header/top rows + first 350 data rows
    const headCount = Math.min(360, fullMatrix.length);
    for (let r = 0; r < headCount; r += 1) pickedIndices.add(r);

    // 2. Ensure every column has at least 3 non-empty sample rows represented (catches sparse operational cols like REP/BMR/SMR)
    const maxCols = Math.min(120, Math.max(fullMatrix[0]?.length || 0, fullMatrix[1]?.length || 0, fullMatrix[2]?.length || 0));
    const colHits = new Uint8Array(maxCols);
    let colsCovered = 0;
    for (let r = headCount; r < fullMatrix.length && pickedIndices.size < 950; r += 1) {
      const row = fullMatrix[r];
      if (!row) continue;
      let needed = false;
      for (let c = 0; c < Math.min(maxCols, row.length); c += 1) {
        if (colHits[c] < 3 && row[c] && String(row[c]).trim() !== '') {
          colHits[c] += 1;
          if (colHits[c] === 3) colsCovered += 1;
          needed = true;
        }
      }
      if (needed) pickedIndices.add(r);
      if (colsCovered >= maxCols && maxCols > 0) break;
    }

    // 3. Fill remaining budget up to ~1,300 rows evenly across the entire sheet
    const targetTotal = 1300;
    const remainingBudget = Math.max(0, targetTotal - pickedIndices.size);
    if (remainingBudget > 0 && fullMatrix.length > headCount) {
      const stride = Math.max(1, Math.floor((fullMatrix.length - headCount) / remainingBudget));
      for (let r = headCount; r < fullMatrix.length && pickedIndices.size < targetTotal; r += stride) {
        pickedIndices.add(r);
      }
    }

    const sortedIndices = Array.from(pickedIndices).sort((a, b) => a - b);
    const sampledMatrix: string[][] = [];
    const oldToNewRow = new Map<number, number>();
    for (let i = 0; i < sortedIndices.length; i += 1) {
      const oldIdx = sortedIndices[i];
      oldToNewRow.set(oldIdx, i);
      sampledMatrix.push(fullMatrix[oldIdx]);
    }

    let remappedFormulas: Record<string, string> | undefined;
    if (fullFormulas && Object.keys(fullFormulas).length > 0) {
      remappedFormulas = {};
      for (const [k, f] of Object.entries(fullFormulas)) {
        const sep = k.indexOf(':');
        if (sep <= 0) continue;
        const oldR = Number(k.slice(0, sep));
        const newR = oldToNewRow.get(oldR);
        if (newR !== undefined) {
          remappedFormulas[`${newR}:${k.slice(sep + 1)}`] = f;
        }
      }
    }

    void name;
    return {
      matrix: sampledMatrix,
      ...(remappedFormulas && Object.keys(remappedFormulas).length > 0 ? { formulaMap: remappedFormulas } : {}),
    };
  };

  // Step 1 -> Step 2: Detect ALL candidate target sections ONLY for the sheets checked by the user
  const handleAnalyzeSelectedSheets = async (
    sheetsToAnalyze: string[] = checkedSheets,
    calVal: 'jalali' | 'gregorian' = assumedCalendar,
  ) => {
    if (sheetsToAnalyze.length === 0) {
      notify('error', isFa ? 'لطفاً حداقل یک شیت از فایل را انتخاب کنید.' : 'Please select at least one sheet.');
      return;
    }
    setAnalyzingSheets(true);
    // Yield a frame so the loading spinner paints immediately before sampling large sheets
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    try {
      const payloadSheets = sheetsToAnalyze.map((nm) => {
        const fullMatrix = sheetsMap[nm] || [];
        const sampled = buildFastDetectionPayload(nm, fullMatrix, sheetFormulasMap[nm]);
        return {
          name: nm,
          matrix: sampled.matrix,
          ...(sampled.formulaMap ? { formulaMap: sampled.formulaMap } : {}),
          ...(structuredSheetsMap[nm]?.records?.length
            ? {
                structuredRecords: structuredSheetsMap[nm].records.slice(0, 1200),
                sectionHint: structuredSheetsMap[nm].sectionHint,
              }
            : {}),
        };
      });
      const res = await apiRequest<{ detectedSheets: AutoWorkbookPreviewSection[] }>('/api/import/auto-workbook', {
        method: 'POST',
        body: JSON.stringify({
          sheets: payloadSheets,
          assumedCalendar: calVal,
          dryRun: true,
        }),
      });
      const detected = (res.detectedSheets || []).map((sec) => {
        const fullMatrixLen = sheetsMap[sec.sheetName]?.length || 0;
        if (fullMatrixLen <= 1500) return sec;
        const approxFullDataRows = Math.max(0, fullMatrixLen - 1);
        const fixCoreCount = (scope: ExtendedImportScope | null, count: number) =>
          scope === 'general' || scope === 'detailed' || scope === 'transit'
            ? Math.max(count, approxFullDataRows)
            : count;
        return {
          ...sec,
          rowCount: fixCoreCount(sec.scope, sec.rowCount),
          candidates: (sec.candidates || []).map((c) => ({
            ...c,
            rowCount: fixCoreCount(c.scope, c.rowCount),
          })),
        };
      });
      setAutoWorkbookPreview(detected);
      const initScopes: Record<string, ExtendedImportScope[]> = {};
      for (const sec of detected) {
        if (sec.scope) {
          const initial: ExtendedImportScope[] = [sec.scope];
          const candSet = new Set((sec.candidates || []).map((c) => c.scope));
          // Auto-pair OPI Invitations <-> OPI Minutes when either is detected on the sheet
          if (sec.scope === 'opiInvitations' && candSet.has('opiMinutes')) {
            initial.push('opiMinutes');
          } else if (sec.scope === 'opiMinutes' && candSet.has('opiInvitations')) {
            initial.push('opiInvitations');
          }
          initScopes[sec.sheetName] = initial;
        } else {
          initScopes[sec.sheetName] = [];
        }
      }
      setSelectedScopesBySheet(initScopes);
      setImportStep(2);
    } catch (err) {
      if (err instanceof ApiError) {
        notify('error', err.message);
      } else {
        notify('error', isFa ? 'خطا در تحلیل شیت‌های انتخاب‌شده.' : 'Failed to analyze selected sheets.');
      }
    } finally {
      setAnalyzingSheets(false);
    }
  };

  const toggleSheetTargetScope = (sheetName: string, scope: ExtendedImportScope) => {
    setSelectedScopesBySheet((prev) => {
      const current = prev[sheetName] || [];
      const isSelected = current.includes(scope);
      let next = isSelected ? current.filter((s) => s !== scope) : [...current, scope];
      // Keep OPI Invitations & OPI Minutes paired so their counts and packing lists remain identical
      const sheetPreview = autoWorkbookPreview.find((s) => s.sheetName === sheetName);
      const candSet = new Set((sheetPreview?.candidates || []).map((c) => c.scope));
      if (scope === 'opiInvitations' && candSet.has('opiMinutes')) {
        next = isSelected
          ? next.filter((s) => s !== 'opiMinutes')
          : Array.from(new Set([...next, 'opiMinutes']));
      } else if (scope === 'opiMinutes' && candSet.has('opiInvitations')) {
        next = isSelected
          ? next.filter((s) => s !== 'opiInvitations')
          : Array.from(new Set([...next, 'opiInvitations']));
      }
      return { ...prev, [sheetName]: next };
    });
  };

  const addManualScopeToSheet = (sheetName: string, scope: ExtendedImportScope) => {
    setSelectedScopesBySheet((prev) => {
      const current = prev[sheetName] || [];
      if (current.includes(scope)) return prev;
      const next = [...current, scope];
      if (scope === 'opiInvitations' && !next.includes('opiMinutes')) {
        next.push('opiMinutes');
      } else if (scope === 'opiMinutes' && !next.includes('opiInvitations')) {
        next.push('opiInvitations');
      }
      return { ...prev, [sheetName]: next };
    });
  };

  // Step 2 -> Step 3: Build confirmed (sheetName, scope) tasks in dependency order and preview the first task
  const handleProceedToReview = async () => {
    const tasks: Array<{ taskKey: string; sheetName: string; scope: ExtendedImportScope }> = [];
    for (const sheetName of checkedSheets) {
      const scopes = selectedScopesBySheet[sheetName] || [];
      for (const scope of scopes) {
        tasks.push({
          taskKey: `${sheetName}::${scope}`,
          sheetName,
          scope,
        });
      }
    }
    if (tasks.length === 0) {
      notify(
        'error',
        isFa
          ? 'حداقل یک بخش مقصد را برای شیت‌های انتخاب‌شده تایید کنید.'
          : 'Please select at least one target section to continue.',
      );
      return;
    }
    tasks.sort((a, b) => EXTENDED_SCOPE_META[a.scope].order - EXTENDED_SCOPE_META[b.scope].order);
    setConfirmedTasks(tasks);
    setTaskPreviews({});
    setTaskMappings({});
    setTaskEditedRows({});
    setRowsConfirmed(false);
    setActiveTaskKey(tasks[0].taskKey);
    setImportStep(3);
    await loadTaskPreview(tasks[0].taskKey, tasks[0].sheetName, tasks[0].scope, assumedCalendar);
  };

  const handleSelectReviewTask = async (task: { taskKey: string; sheetName: string; scope: ExtendedImportScope }) => {
    setActiveTaskKey(task.taskKey);
    if (!taskPreviews[task.taskKey]) {
      await loadTaskPreview(task.taskKey, task.sheetName, task.scope, assumedCalendar, taskMappings[task.taskKey]);
    }
  };

  const handleCalendarChange = async (nextCal: 'jalali' | 'gregorian') => {
    setAssumedCalendar(nextCal);
    if (importStep === 2 && checkedSheets.length > 0) {
      await handleAnalyzeSelectedSheets(checkedSheets, nextCal);
    } else if (importStep === 3 && activeTaskKey) {
      setTaskPreviews({});
      setTaskEditedRows({});
      const activeTask = confirmedTasks.find((t) => t.taskKey === activeTaskKey);
      if (activeTask) {
        await loadTaskPreview(activeTask.taskKey, activeTask.sheetName, activeTask.scope, nextCal, taskMappings[activeTask.taskKey]);
      }
    }
  };

  const handleMappingChange = async (fieldKey: string, colIdx: number) => {
    const activeTask = confirmedTasks.find((t) => t.taskKey === activeTaskKey);
    const activePreview = activeTaskKey ? taskPreviews[activeTaskKey] : undefined;
    if (!activeTask || !activePreview || activePreview.isOperational) return;
    const nextMap: Record<string, number> = {
      ...(taskMappings[activeTaskKey] || activePreview.columnInspection?.mapping || {}),
      [fieldKey]: colIdx,
    };
    setTaskMappings((prev) => ({ ...prev, [activeTaskKey]: nextMap }));
    await loadTaskPreview(activeTask.taskKey, activeTask.sheetName, activeTask.scope, assumedCalendar, nextMap);
  };

  const handleCellEdit = (rowIndex: number, key: string, value: string, isNumeric?: boolean) => {
    if (!activeTaskKey) return;
    if (taskPreviews[activeTaskKey]?.parsedRowsTruncated) return;
    setDirtyEditedTasks((prev) => ({ ...prev, [activeTaskKey]: true }));
    setTaskEditedRows((prev) => {
      const current = prev[activeTaskKey] || [];
      return {
        ...prev,
        [activeTaskKey]: current.map((row, i) => {
          if (i !== rowIndex) return row;
          if (isNumeric) {
            const cleaned = value.trim();
            return { ...row, [key]: cleaned === '' ? null : Number(cleaned) };
          }
          return { ...row, [key]: value };
        }),
      };
    });
  };

  const handleRemovePreviewRow = (rowIndex: number) => {
    if (!activeTaskKey) return;
    if (taskPreviews[activeTaskKey]?.parsedRowsTruncated) return;
    setDirtyEditedTasks((prev) => ({ ...prev, [activeTaskKey]: true }));
    setTaskEditedRows((prev) => ({
      ...prev,
      [activeTaskKey]: (prev[activeTaskKey] || []).filter((_, i) => i !== rowIndex),
    }));
  };

  const recordLogSession = (
    res: CommitResponse,
    sourceLabel: string,
    useFa: boolean,
  ) => {
    const rejected = res.rejectedRecords || [];
    const entry: ImportLogSessionEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      sourceLabel,
      scope: res.scope,
      imported: res.imported,
      replaced: res.replaced,
      skipped: res.skipped,
      unchangedSkipped: res.unchangedSkipped || 0,
      blankRowsSkipped: res.blankRowsSkipped || 0,
      transitAutoArrived: res.transitAutoArrived,
      linkedGeneral: res.linkedGeneral,
      linkedDetailed: res.linkedDetailed,
      linkedTransit: res.linkedTransit,
      rejectedReasons: rejected.map((r) => ({
        sourceRowIndex: r.sourceRowIndex,
        reasonCode: r.reasonCode,
        reasonText: useFa ? r.reasonFa : r.reasonEn,
        summary:
          r.existingSummary ||
          r.rawRow?.join(' | ') ||
          String(
            r.parsedRow.packingListNo ||
              r.parsedRow.shipmentNo ||
              r.parsedRow.itemDescription ||
              r.parsedRow.description ||
              '-',
          ),
      })),
    };
    setImportLogs((prev) => [entry, ...prev].slice(0, 20));
  };

  // Step 3 Final Commit: executes ONLY user-confirmed (sheetName, scope) tasks in strict dependency order
  const handleCommitWizardTasks = async () => {
    if (confirmedTasks.length === 0) return;
    const currentFile = fileName || (isFa ? 'فایل ورودی' : 'Uploaded File');
    setImporting(true);
    try {
      const committedSections: AutoWorkbookCommitSummary['sections'] = [];
      const allRejected: ImportRejectedRecord[] = [];

      for (const task of confirmedTasks) {
        const matrix = sheetsMap[task.sheetName] || [];
        const formulaMap = sheetFormulasMap[task.sheetName];
        const structPayload = structuredSheetsMap[task.sheetName];
        const hasStruct = Boolean(structPayload?.records?.length);
        const isOp = isOperationalScope(task.scope);
        const customMap = taskMappings[task.taskKey];
        const edited = taskEditedRows[task.taskKey];
        const shouldSendEdited =
          !isOp &&
          Boolean(dirtyEditedTasks[task.taskKey]) &&
          !taskPreviews[task.taskKey]?.parsedRowsTruncated &&
          Boolean(edited && edited.length > 0);

        const res = await apiRequest<CommitResponse>('/api/import/commit', {
          method: 'POST',
          body: JSON.stringify({
            matrix,
            ...(formulaMap && Object.keys(formulaMap).length > 0 ? { formulaMap } : {}),
            ...(hasStruct ? { structuredRecords: structPayload!.records, sectionHint: structPayload!.sectionHint } : {}),
            sheetName: task.sheetName,
            scope: task.scope,
            assumedCalendar,
            duplicateRecordPolicy: duplicatePolicy,
            includeParserRejections: !isOp,
            ...(!isOp && customMap ? { columnMapping: customMap } : {}),
            ...(shouldSendEdited ? { editedRows: edited } : {}),
          }),
        });

        if (res.rejectedRecords && res.rejectedRecords.length > 0) {
          allRejected.push(...res.rejectedRecords);
        }

        recordLogSession(
          res,
          `${currentFile}${sheetNames.length > 1 ? ` [${task.sheetName}]` : ''}`,
          isFa,
        );

        committedSections.push({
          sheetName: task.sheetName,
          scope: res.scope,
          isOperational: isOp,
          imported: res.imported,
          replaced: res.replaced,
          skipped: res.skipped,
          unchangedSkipped: res.unchangedSkipped || 0,
          linkedGeneral: res.linkedGeneral || 0,
          linkedDetailed: res.linkedDetailed || 0,
          linkedTransit: res.linkedTransit || res.transitAutoArrived || 0,
          warnings: res.warnings || [],
        });
      }

      const totals = committedSections.reduce(
        (acc, s) => ({
          imported: acc.imported + s.imported,
          replaced: acc.replaced + s.replaced,
          skipped: acc.skipped + s.skipped,
          unchangedSkipped: (acc.unchangedSkipped || 0) + (s.unchangedSkipped || 0),
          linkedGeneral: acc.linkedGeneral + s.linkedGeneral,
          linkedDetailed: acc.linkedDetailed + s.linkedDetailed,
          linkedTransit: acc.linkedTransit + s.linkedTransit,
        }),
        {
          imported: 0,
          replaced: 0,
          skipped: 0,
          unchangedSkipped: 0,
          linkedGeneral: 0,
          linkedDetailed: 0,
          linkedTransit: 0,
        },
      );

      // Persist file fingerprint in localStorage so future re-uploads of the exact same file are recognized
      if (currentFileFingerprint) {
        try {
          const rawHist = localStorage.getItem(uploadHistoryStorageKey);
          const hist: StoredUploadHistoryEntry[] = rawHist ? JSON.parse(rawHist) : [];
          const filtered = hist.filter((h) => h.fingerprint !== currentFileFingerprint);
          const updated: StoredUploadHistoryEntry[] = [
            { fingerprint: currentFileFingerprint, fileName: currentFile, uploadedAt: new Date().toISOString() },
            ...filtered,
          ].slice(0, 40);
          localStorage.setItem(uploadHistoryStorageKey, JSON.stringify(updated));
        } catch {
          // ignore localStorage quota errors
        }
      }

      setAutoWorkbookResult({ ok: true, sections: committedSections, totals });
      setPendingRejected(allRejected);

      // Clean reset of file wizard state while keeping result banner visible
      setImportStep(0);
      setFileName('');
      setCurrentFileFingerprint('');
      setPreviousUploadMatch(null);
      setSheetNames([]);
      setCheckedSheets([]);
      setSheetsMap({});
      setStructuredSheetsMap({});
      setAutoWorkbookPreview([]);
      setSelectedScopesBySheet({});
      setConfirmedTasks([]);
      setActiveTaskKey('');
      setTaskPreviews({});
      setTaskMappings({});
      setTaskEditedRows({});
      setRowsConfirmed(false);

      const unchangedCount = totals.unchangedSkipped || 0;
      const allUnchanged = totals.imported === 0 && totals.replaced === 0 && unchangedCount > 0;
      notify(
        allUnchanged ? 'info' : totals.skipped > unchangedCount ? 'info' : 'success',
        allUnchanged
          ? isFa
            ? `هیچ تغییری برای ثبت وجود نداشت (${unchangedCount.toLocaleString('fa-IR')} ردیف بدون تغییر نادیده گرفته شد).`
            : `No changes to apply (${unchangedCount} unchanged row(s) skipped).`
          : isFa
            ? `بازیابی ${committedSections.length} بخش تکمیل شد: ${totals.imported} جدید، ${totals.replaced} بروزرسانی/جایگزین${unchangedCount > 0 ? `، ${unchangedCount} بدون تغییر` : ''}${totals.skipped - unchangedCount > 0 ? `، ${totals.skipped - unchangedCount} رد شده` : ''}.`
            : `Import completed (${committedSections.length} sections): ${totals.imported} imported, ${totals.replaced} updated${unchangedCount > 0 ? `, ${unchangedCount} unchanged` : ''}${totals.skipped - unchangedCount > 0 ? `, ${totals.skipped - unchangedCount} skipped` : ''}.`,
      );
      triggerAutoSnapshot(`Import (${committedSections.length} sections)`);
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setImporting(false);
    }
  };

  // Inline editing inside the Rejection Log
  const handleRejectedFieldChange = (id: string, key: string, value: string) => {
    setPendingRejected((prev) =>
      prev.map((rec) =>
        rec.id === id
          ? {
              ...rec,
              parsedRow: {
                ...rec.parsedRow,
                [key]: value,
              },
            }
          : rec,
      ),
    );
  };

  // Recover a single rejected row (either Replace existing OR Force-Add as new)
  const handleRecoverSingleRow = async (
    rec: ImportRejectedRecord,
    mode: 'replace' | 'force_add',
  ) => {
    setRecoveringId(rec.id);
    try {
      const res = await apiRequest<CommitResponse>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          matrix: [],
          scope: rec.scope,
          assumedCalendar,
          duplicateRecordPolicy: mode === 'replace' ? 'replace' : 'skip',
          forceAddDuplicates: mode === 'force_add',
          includeParserRejections: false,
          editedRows: [rec.parsedRow],
        }),
      });
      if ((res.imported + res.replaced) > 0) {
        setPendingRejected((prev) => prev.filter((item) => item.id !== rec.id));
        recordLogSession(
          res,
          isFa
            ? `بازثبت از لاگ (ردیف ${rec.sourceRowIndex || '-'})`
            : `Recovered from log (Row ${rec.sourceRowIndex || '-'})`,
          isFa,
        );
        notify(
          'success',
          mode === 'replace'
            ? isFa ? 'رکورد در پایگاه داده با مقادیر جدید جایگزین شد.' : 'Existing DB record replaced.'
            : isFa ? 'رکورد با موفقیت به پایگاه داده اضافه شد.' : 'Record added to database.',
        );
        triggerAutoSnapshot(`Recovery Import (${rec.scope})`);
        onRestored();
      } else {
        notify(
          'error',
          isFa
            ? 'ثبت رکورد انجام نشد. لطفاً فیلدهای کلیدی را بررسی کنید.'
            : 'Could not import row. Check key fields.',
        );
      }
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setRecoveringId(null);
    }
  };

  // Bulk recovery for all pending rejected items
  const handleRecoverBulk = async (mode: 'replace_duplicates' | 'force_add_all') => {
    const targets =
      mode === 'replace_duplicates'
        ? pendingRejected.filter((r) => r.canForceReplace)
        : pendingRejected;
    if (targets.length === 0) return;
    setRecoveringId('__bulk__');
    try {
      const scopeGroups = new Map<'general' | 'detailed' | 'transit', ImportRejectedRecord[]>();
      for (const item of targets) {
        const arr = scopeGroups.get(item.scope) || [];
        arr.push(item);
        scopeGroups.set(item.scope, arr);
      }
      let totalAdded = 0;
      let totalReplaced = 0;
      const handledIds = new Set<string>();

      for (const [grpScope, items] of scopeGroups.entries()) {
        const res = await apiRequest<CommitResponse>('/api/import/commit', {
          method: 'POST',
          body: JSON.stringify({
            matrix: [],
            scope: grpScope,
            assumedCalendar,
            duplicateRecordPolicy: mode === 'replace_duplicates' ? 'replace' : 'skip',
            forceAddDuplicates: mode === 'force_add_all',
            includeParserRejections: false,
            editedRows: items.map((x) => x.parsedRow),
          }),
        });
        totalAdded += res.imported;
        totalReplaced += res.replaced;
        recordLogSession(
          res,
          mode === 'replace_duplicates'
            ? isFa ? 'جایگزینی دسته‌جمعی رکوردهای رد شده' : 'Bulk Replace Rejected Rows'
            : isFa ? 'افزودن دسته‌جمعی رکوردهای رد شده' : 'Bulk Force-Add Rejected Rows',
          isFa,
        );
        if (res.imported + res.replaced > 0) {
          items.forEach((x) => handledIds.add(x.id));
        }
      }

      setPendingRejected((prev) => prev.filter((item) => !handledIds.has(item.id)));
      notify(
        'success',
        isFa
          ? `بازثبت گروهی انجام شد: ${totalAdded} ردیف جدید و ${totalReplaced} جایگزینی ثبت شد.`
          : `Bulk recovery complete: ${totalAdded} added, ${totalReplaced} replaced.`,
      );
      triggerAutoSnapshot('Bulk Import Recovery');
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setRecoveringId(null);
    }
  };

  const handleDismissRejected = (id?: string) => {
    if (!id) {
      setPendingRejected([]);
      notify('info', isFa ? 'رکوردهای رد شده نادیده گرفته شدند و به پایگاه داده اضافه نشدند.' : 'Rejected records dismissed.');
      return;
    }
    setPendingRejected((prev) => prev.filter((item) => item.id !== id));
  };

  const clearImportSelection = () => {
    setImportStep(0);
    setFileName('');
    setSheetNames([]);
    setCheckedSheets([]);
    setSheetsMap({});
    setStructuredSheetsMap({});
    setAutoWorkbookPreview([]);
    setSelectedScopesBySheet({});
    setConfirmedTasks([]);
    setActiveTaskKey('');
    setTaskPreviews({});
    setTaskMappings({});
    setTaskEditedRows({});
    setRowsConfirmed(false);
    setAutoWorkbookResult(null);
  };

  const handleManualSnapshot = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      await saveSnapshotToIndexedDb(
        snapshot,
        'manual',
        isFa ? 'اسنپ‌شات دستی مدیر/کاربر' : 'Manual Snapshot',
        activeProjectId,
      );
      notify('success', isFa ? 'نسخه پشتیبان ذخیره شد.' : 'Snapshot saved.');
      void loadSnapshots();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadLiveJson = async () => {
    setBusy(true);
    try {
      const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
      const safeSlug = (activeProject?.code || activeProjectId).replace(/[^a-zA-Z0-9_-]+/g, '-');
      downloadJsonBackup(snapshot, `samaan-backup-${safeSlug}`);
      notify('success', isFa ? 'فایل پشتیبان دانلود شد.' : 'Backup file downloaded.');
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSnapshotById = async (snapId: string) => {
    setLoadingSnapId(snapId);
    try {
      const payload = await getIndexedDbSnapshotPayload(snapId);
      if (!payload) {
        notify('error', isFa ? 'محتوای این نسخه پشتیبان یافت نشد.' : 'Snapshot payload not found.');
        return;
      }
      downloadJsonBackup(payload, 'samaan-snapshot');
    } catch {
      notify('error', isFa ? 'خطا در خواندن نسخه پشتیبان.' : 'Failed to load snapshot payload.');
    } finally {
      setLoadingSnapId(null);
    }
  };

  const handleRestoreSnapshot = async (snapshot: DatabaseSnapshot) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await apiRequest('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(snapshot),
      });
      notify('success', isFa ? 'اطلاعات از نسخه پشتیبان بازیابی شد.' : 'Data restored from backup.');
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshotById = async (snapId: string) => {
    if (!isAdmin) return;
    setLoadingSnapId(snapId);
    try {
      const payload = await getIndexedDbSnapshotPayload(snapId);
      if (!payload) {
        notify('error', isFa ? 'محتوای این نسخه پشتیبان یافت نشد.' : 'Snapshot payload not found.');
        return;
      }
      await handleRestoreSnapshot(payload);
    } finally {
      setLoadingSnapId(null);
    }
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as DatabaseSnapshot;
      await handleRestoreSnapshot(parsed);
    } catch {
      notify('error', isFa ? 'فایل پشتیبان معتبر نیست.' : 'Invalid backup JSON file.');
      setBusy(false);
    }
  };

  const activeTask = confirmedTasks.find((t) => t.taskKey === activeTaskKey) || null;
  const activePreview = activeTaskKey ? taskPreviews[activeTaskKey] : undefined;
  const activeEditedRows = activeTaskKey ? taskEditedRows[activeTaskKey] || [] : [];
  const activeMapping = activeTaskKey ? taskMappings[activeTaskKey] : undefined;
  const inspection = activePreview && !activePreview.isOperational ? activePreview.columnInspection : undefined;
  const activeFieldDefs =
    inspection && activePreview && !activePreview.isOperational
      ? editableFieldsForScope(activePreview.scope as 'general' | 'detailed' | 'transit')
          .map((k) => inspection.targetFields.find((tf) => tf.key === k))
          .filter((tf): tf is ImportColumnDef => Boolean(tf))
      : [];

  const totalSelectedTargetCount = checkedSheets.reduce(
    (sum, s) => sum + (selectedScopesBySheet[s]?.length || 0),
    0,
  );

  const hasReplaceablePending = pendingRejected.some((r) => r.canForceReplace);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Section 1: Clean 3-Step Guided Import Wizard (Select Sheets -> Confirm Target Sections -> Review & Commit) */}
      {canImport && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-6 space-y-5">
          {/* Header & File Upload Action */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>
                  {isFa
                    ? 'ورود و بازیابی اطلاعات از فایل (Excel، CSV، JSON)'
                    : 'Import & Restore Data from File (Excel, CSV, JSON)'}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {isFa
                  ? 'ابتدا شیت‌های دلخواه فایل را انتخاب کنید، سپس بخش‌های مقصد هر شیت را تایید نمایید و در پایان ستون‌ها را بررسی و ثبت کنید.'
                  : 'Step 1: Pick sheets · Step 2: Confirm target sections per sheet · Step 3: Verify columns and commit.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={assumedCalendar}
                onChange={(e) => void handleCalendarChange(e.target.value as 'jalali' | 'gregorian')}
                title={isFa ? 'تقویم تاریخ‌های فایل ورودی' : 'Source Date Calendar'}
                className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs font-medium"
              >
                <option value="jalali">{isFa ? 'تقویم فایل: شمسی' : 'Calendar: Jalali'}</option>
                <option value="gregorian">{isFa ? 'تقویم فایل: میلادی' : 'Calendar: Gregorian'}</option>
              </select>
              {fileName && (
                <button
                  type="button"
                  onClick={clearImportSelection}
                  className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
                >
                  {isFa ? 'بستن فایل' : 'Close File'}
                </button>
              )}
              <label className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'انتخاب فایل اکسل / CSV / JSON' : 'Choose Excel / CSV / JSON'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.ods,.csv,.tsv,.json,.txt"
                  onChange={handleSelectDataFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Clean 3-Step Progress Indicator when a file is loaded */}
          {importStep > 0 && fileName && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {[
                  { n: 1 as const, label: isFa ? '۱. انتخاب شیت‌ها' : '1. Select Sheets' },
                  { n: 2 as const, label: isFa ? '۲. تایید بخش‌های مقصد' : '2. Confirm Target Sections' },
                  { n: 3 as const, label: isFa ? '۳. تطبیق ستون‌ها و ثبت نهایی' : '3. Review & Commit' },
                ].map((st, idx) => {
                  const isCurrent = importStep === st.n;
                  const isDone = importStep > st.n;
                  return (
                    <React.Fragment key={st.n}>
                      {idx > 0 && <span className="text-[var(--text-muted)]">←</span>}
                      <button
                        type="button"
                        disabled={st.n > importStep}
                        onClick={() => {
                          if (st.n < importStep) setImportStep(st.n);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          isCurrent
                            ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow-sm'
                            : isDone
                              ? 'bg-[var(--status-success-bg)] text-[var(--status-success)] hover:opacity-90 cursor-pointer'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                        }`}
                      >
                        {isDone && <Check className="w-3.5 h-3.5" />}
                        <span>{st.label}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="text-[11px] font-medium text-[var(--text-secondary)] truncate max-w-[260px]" title={fileName}>
                {isFa ? `فایل: ${fileName}` : `File: ${fileName}`}
              </div>
            </div>
          )}

          {/* STEP 1: Ask User Which Sheet(s) to Import */}
          {importStep === 1 && fileName && (
            <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-4">
              {previousUploadMatch && (
                <div
                  data-testid="previous-upload-notice"
                  className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    {isFa
                      ? `این فایل (با همین محتوا) قبلاً در تاریخ ${formatTimestamp(previousUploadMatch.uploadedAt)} بارگذاری شده است. در مرحله ۳ وضعیت تغییرات به‌صورت هوشمند بررسی خواهد شد.`
                      : `This exact file content was already uploaded on ${formatTimestamp(previousUploadMatch.uploadedAt)}. Step 3 will automatically inspect any changes against current records.`}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">
                    {isFa
                      ? 'از کدام شیت‌های این فایل می‌خواهید اطلاعات بازیابی کنید؟'
                      : 'Which sheet(s) from this file would you like to import?'}
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {isFa
                      ? 'تنها شیت‌هایی که تیک بزنید بررسی و بازیابی می‌شوند. هیچ شیتی بدون انتخاب شما پردازش نخواهد شد.'
                      : 'Only checked sheets will be analyzed and imported. Unchecked sheets are completely ignored.'}
                  </p>
                </div>
                {sheetNames.length > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setCheckedSheets([...sheetNames])}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] font-medium"
                    >
                      {isFa ? 'انتخاب همه شیت‌ها' : 'Select All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCheckedSheets([])}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] font-medium text-[var(--text-secondary)]"
                    >
                      {isFa ? 'لغو انتخاب همه' : 'Clear All'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {sheetNames.map((sName) => {
                  const isChecked = checkedSheets.includes(sName);
                  const mat = sheetsMap[sName] || [];
                  const structRows = structuredSheetsMap[sName]?.records?.length || 0;
                  const estRows = structRows || Math.max(0, mat.length - 1);
                  return (
                    <label
                      key={sName}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                        isChecked
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70 shadow-sm'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/40'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheckedSheet(sName)}
                          className="w-4 h-4 rounded accent-[var(--accent-primary)] shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-[var(--text-primary)] truncate">
                            {sName}
                          </span>
                          <span className="block text-[11px] text-[var(--text-muted)] tabular-nums">
                            {isFa
                              ? `حدود ${estRows.toLocaleString('fa-IR')} ردیف داده`
                              : `~${estRows} data rows`}
                          </span>
                        </span>
                      </span>
                      {isChecked && <CheckCircle2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />}
                    </label>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                  {isFa
                    ? `${checkedSheets.length.toLocaleString('fa-IR')} شیت از ${sheetNames.length.toLocaleString('fa-IR')} شیت انتخاب شده`
                    : `${checkedSheets.length} of ${sheetNames.length} sheet(s) selected`}
                </span>
                <button
                  type="button"
                  disabled={checkedSheets.length === 0 || analyzingSheets}
                  onClick={() => void handleAnalyzeSelectedSheets()}
                  className="h-9 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  {analyzingSheets ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {analyzingSheets
                      ? isFa ? 'در حال تحلیل شیت‌های انتخاب‌شده...' : 'Analyzing Selected Sheets...'
                      : isFa ? 'ادامه: تشخیص هوشمند بخش‌های مقصد' : 'Next: Detect Target Sections'}
                  </span>
                  {!analyzingSheets && (isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />)}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Confirm Target Section(s) for Each Selected Sheet (supports 1 or MULTIPLE sections per sheet!) */}
          {importStep === 2 && fileName && (
            <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>
                    {isFa
                      ? 'تایید بخش‌های مقصد نرم‌افزار برای هر شیت انتخاب‌شده'
                      : 'Confirm Target Software Section(s) for Each Selected Sheet'}
                  </span>
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {isFa
                    ? 'یک شیت می‌تواند حاوی اطلاعات یک بخش یا همزمان چند بخش مختلف باشد (مثلاً جدول جزئیات + انبارگردانی + رسید/حواله). برای هر شیت، بخش یا بخش‌هایی که می‌خواهید بازیابی شوند را تیک بزنید یا در صورت نیاز بخش دیگری اضافه کنید.'
                    : 'A single sheet can contain data for one or multiple sections (e.g. Detailed + Stocktake + GCV/MIV). Check the section(s) you want each sheet to populate, or add any other section manually.'}
                </p>
              </div>

              <div className="space-y-3">
                {autoWorkbookPreview.map((sec) => {
                  const chosenScopes = selectedScopesBySheet[sec.sheetName] || [];
                  const detectedCandidates = sec.candidates || [];
                  const detectedScopeSet = new Set(detectedCandidates.map((c) => c.scope));
                  const manualExtraScopes = chosenScopes.filter((sc) => !detectedScopeSet.has(sc));

                  return (
                    <div
                      key={sec.sheetName}
                      className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">{sec.sheetName}</span>
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            ({isFa ? `${chosenScopes.length.toLocaleString('fa-IR')} بخش انتخاب‌شده` : `${chosenScopes.length} selected`})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value as ExtendedImportScope | '';
                              if (val) addManualScopeToSheet(sec.sheetName, val);
                            }}
                            className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] font-medium"
                          >
                            <option value="">
                              {isFa ? '+ افزودن بخش دیگر برای این شیت...' : '+ Add another section to this sheet...'}
                            </option>
                            <optgroup label={isFa ? 'جداول پایه انبار' : 'Core Tables'}>
                              {(['transit', 'general', 'detailed'] as ExtendedImportScope[])
                                .filter((sc) => !chosenScopes.includes(sc))
                                .map((sc) => (
                                  <option key={sc} value={sc}>
                                    {getScopeDisplayLabel(sc, isFa)}
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label={isFa ? 'فرم‌های عملیاتی و اختصاصی کارفرما' : 'Operational & Custom Forms'}>
                              {ALL_EXTENDED_SCOPES.filter((sc) => isOperationalScope(sc) && !chosenScopes.includes(sc)).map((sc) => (
                                <option key={sc} value={sc}>
                                  {getScopeDisplayLabel(sc, isFa)}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>

                      {detectedCandidates.length === 0 && manualExtraScopes.length === 0 ? (
                        <div className="p-3 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)]/40 text-xs text-[var(--status-warning)]">
                          {isFa
                            ? 'بخش مقصد این شیت به‌صورت خودکار شناسایی نشد. لطفاً از منوی «افزودن بخش دیگر» در بالا، بخش مورد نظر را انتخاب کنید.'
                            : 'No section was auto-detected for this sheet. Choose a target section from the dropdown above.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {detectedCandidates.map((cand) => {
                            const active = chosenScopes.includes(cand.scope);
                            const linksTotal =
                              cand.estimatedLinks.general +
                              cand.estimatedLinks.detailed +
                              cand.estimatedLinks.transit;
                            return (
                              <label
                                key={cand.scope}
                                className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                                  active
                                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]/70 shadow-sm'
                                    : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--accent-primary)]/40'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      onChange={() => toggleSheetTargetScope(sec.sheetName, cand.scope)}
                                      className="w-4 h-4 rounded accent-[var(--accent-primary)] shrink-0 mt-0.5"
                                    />
                                    <span className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                                      {getScopeDisplayLabel(cand.scope, isFa)}
                                    </span>
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                      cand.isPrimary
                                        ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)]'
                                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {cand.isPrimary
                                      ? isFa ? 'پیشنهاد اصلی' : 'Primary'
                                      : isFa ? 'بخش مرتبط' : 'Detected'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 ps-6 text-[10px] text-[var(--text-secondary)] tabular-nums">
                                  <span>
                                    {isFa
                                      ? `${cand.rowCount.toLocaleString('fa-IR')} ردیف/سند`
                                      : `${cand.rowCount} record(s)`}
                                  </span>
                                  {cand.duplicateDbCount > 0 && (
                                    <span className="text-[var(--status-warning)] font-medium">
                                      · {isFa ? `${cand.duplicateDbCount.toLocaleString('fa-IR')} تکراری` : `${cand.duplicateDbCount} dup`}
                                    </span>
                                  )}
                                  {linksTotal > 0 && (
                                    <span className="inline-flex items-center gap-0.5 text-[var(--accent-primary)] font-medium">
                                      <Link2 className="w-3 h-3" />
                                      {isFa ? `${linksTotal.toLocaleString('fa-IR')} ارتباط` : `${linksTotal} links`}
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}

                          {manualExtraScopes.map((sc) => (
                            <label
                              key={sc}
                              className="p-3 rounded-xl border border-[var(--accent-primary)] bg-[var(--accent-soft)]/70 cursor-pointer space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked
                                    onChange={() => toggleSheetTargetScope(sec.sheetName, sc)}
                                    className="w-4 h-4 rounded accent-[var(--accent-primary)] shrink-0 mt-0.5"
                                  />
                                  <span className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                                    {getScopeDisplayLabel(sc, isFa)}
                                  </span>
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent-primary)] text-[10px] font-semibold shrink-0">
                                  {isFa ? 'انتخاب دستی' : 'Manual'}
                                </span>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setImportStep(1)}
                  className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت به انتخاب شیت‌ها' : 'Back to Sheets'}</span>
                </button>
                <button
                  type="button"
                  disabled={totalSelectedTargetCount === 0}
                  onClick={() => void handleProceedToReview()}
                  className="h-9 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  <Columns3 className="w-4 h-4" />
                  <span>
                    {isFa
                      ? `ادامه: تطبیق ستون‌ها و پیش‌نمایش (${totalSelectedTargetCount.toLocaleString('fa-IR')} بخش)`
                      : `Next: Verify Columns & Preview (${totalSelectedTargetCount})`}
                  </span>
                  {isFa ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Column Mapping, Pre-Import Review & Final Commit (ONLY for confirmed tasks!) */}
          {importStep === 3 && fileName && confirmedTasks.length > 0 && (
            <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-4">
              {/* Task Tabs for Confirmed (Sheet -> Section) Pairs */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  {confirmedTasks.map((task) => {
                    const isActive = task.taskKey === activeTaskKey;
                    const cached = taskPreviews[task.taskKey];
                    return (
                      <button
                        key={task.taskKey}
                        type="button"
                        onClick={() => void handleSelectReviewTask(task)}
                        className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          isActive
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow-sm'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50'
                        }`}
                      >
                        <span>{getScopeDisplayLabel(task.scope, isFa)}</span>
                        {sheetNames.length > 1 && (
                          <span className={`text-[10px] ${isActive ? 'opacity-85' : 'text-[var(--text-muted)]'}`}>
                            ({task.sheetName})
                          </span>
                        )}
                        {cached && (
                          <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${isActive ? 'bg-white/20' : 'bg-[var(--bg-subtle)]'}`}>
                            {cached.totalRows.toLocaleString(isFa ? 'fa-IR' : 'en-US')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {inspection && (
                  <button
                    type="button"
                    onClick={() => setMappingExpanded((v) => !v)}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium flex items-center gap-1.5"
                  >
                    <Columns3 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{mappingExpanded ? (isFa ? 'بستن تطبیق ستون‌ها' : 'Hide Mapping') : (isFa ? 'تطبیق ستون‌ها' : 'Column Mapping')}</span>
                  </button>
                )}
              </div>

              {loadingTaskKey === activeTaskKey || !activePreview ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                  <span>{isFa ? 'در حال آماده‌سازی پیش‌نمایش و تطبیق ستون‌ها...' : 'Loading preview and column mapping...'}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Active Task Summary */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold flex flex-wrap items-center gap-1.5">
                      <span>{activeTask?.sheetName}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <span className="text-[var(--accent-primary)] font-bold">
                        {getScopeDisplayLabel(activePreview.scope, isFa)}
                      </span>
                      {activePreview.isOperational && activePreview.estimatedLinks && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold tabular-nums">
                          <Link2 className="w-3 h-3" />
                          {isFa
                            ? `ارتباط خودکار: کلی ${activePreview.estimatedLinks.general} · جزئیات ${activePreview.estimatedLinks.detailed} · در راه ${activePreview.estimatedLinks.transit}`
                            : `Auto-Links: G ${activePreview.estimatedLinks.general} · D ${activePreview.estimatedLinks.detailed} · T ${activePreview.estimatedLinks.transit}`}
                        </span>
                      )}
                    </div>
                    <span className="text-[var(--text-secondary)] tabular-nums font-medium">
                      {isFa
                        ? `${activeEditedRows.length.toLocaleString('fa-IR')} ردیف/سند آماده ثبت`
                        : `${activeEditedRows.length} record(s) ready`}
                    </span>
                  </div>

                  {/* Smart Delta Change-Detection Banner (top of Step 3 for immediate visibility) */}
                  {activePreview.deltaSummary && (
                    activePreview.deltaSummary.isIdentical ? (
                      <div
                        data-testid="import-delta-banner"
                        className="p-3.5 rounded-xl border border-emerald-500/50 bg-emerald-500/10 space-y-1 text-xs"
                      >
                        <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            {isFa
                              ? `هیچ تغییری نسبت به اطلاعات ثبت‌شده قبلی در این فایل وجود ندارد (فایل بدون تغییر است — ۰ ردیف جدید و ۰ تغییر، ${activePreview.deltaSummary.unchangedCount.toLocaleString('fa-IR')} ردیف یکسان).`
                              : `No changes detected compared to existing records (0 new, 0 modified, ${activePreview.deltaSummary.unchangedCount} identical).`}
                          </span>
                        </div>
                      </div>
                    ) : (activePreview.deltaSummary.modifiedCount > 0 || activePreview.deltaSummary.unchangedCount > 0) ? (
                      <div
                        data-testid="import-delta-banner"
                        className="p-3.5 rounded-xl border border-sky-500/45 bg-sky-500/10 space-y-2 text-xs"
                      >
                        <div className="font-bold text-sky-800 dark:text-sky-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
                            <span>
                              {isFa
                                ? 'گزارش مقایسه هوشمند تغییرات فایل با پایگاه داده فعلی'
                                : 'Smart Delta Analysis vs. Current Database'}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tabular-nums">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              {isFa
                                ? `جدید: ${activePreview.deltaSummary.newCount.toLocaleString('fa-IR')}`
                                : `New: ${activePreview.deltaSummary.newCount}`}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300">
                              {isFa
                                ? `تغییریافته: ${activePreview.deltaSummary.modifiedCount.toLocaleString('fa-IR')}`
                                : `Modified: ${activePreview.deltaSummary.modifiedCount}`}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                              {isFa
                                ? `بدون تغییر: ${activePreview.deltaSummary.unchangedCount.toLocaleString('fa-IR')}`
                                : `Unchanged: ${activePreview.deltaSummary.unchangedCount}`}
                            </span>
                          </span>
                        </div>
                        {activePreview.deltaSummary.changedFieldsSample.length > 0 && (
                          <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
                            <div className="font-semibold text-[var(--text-primary)]">
                              {isFa ? 'نمونه ردیف‌های تغییریافته:' : 'Sample modified records:'}
                            </div>
                            <div className="flex flex-wrap gap-1.5" dir="ltr">
                              {activePreview.deltaSummary.changedFieldsSample.slice(0, 6).map((item, idx) => (
                                <span
                                  key={`${item.keyLabel}-${idx}`}
                                  className="px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[10px] font-mono"
                                >
                                  {item.keyLabel}: {item.changedFields.join(', ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null
                  )}

                  {/* Interactive Column Mapping Confirmation Form (for Core tables) */}
                  {inspection && mappingExpanded && (
                    <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">
                          {isFa
                            ? 'تایید و اصلاح تطبیق ستون‌های فایل با فیلدهای نرم‌افزار'
                            : 'Verify & Adjust Source Column Mapping'}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {isFa
                            ? 'در صورت متفاوت بودن نام ستون‌ها در فایل شما، ستون متناظر را برای هر فیلد بررسی یا اصلاح کنید.'
                            : 'Review or adjust which file column maps to each system field.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
                        {inspection.targetFields.map((tf) => {
                          const mappedIdx = (activeMapping || inspection.mapping)[tf.key] ?? -1;
                          return (
                            <div
                              key={tf.key}
                              className={`p-2 rounded-lg border text-[11px] space-y-1 ${
                                tf.required && mappedIdx < 0
                                  ? 'border-[var(--status-warning)] bg-[var(--status-warning-bg)]/40'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]'
                              }`}
                            >
                              <div className="font-semibold flex items-center justify-between gap-1">
                                <span>
                                  {isFa ? tf.labelFa : tf.labelEn}
                                  {tf.required ? ' *' : ''}
                                </span>
                                {mappedIdx >= 0 && (
                                  <span className="text-[10px] text-[var(--status-success)]">✓</span>
                                )}
                              </div>
                              <select
                                value={mappedIdx}
                                onChange={(e) => void handleMappingChange(tf.key, Number(e.target.value))}
                                className="w-full h-8 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px]"
                              >
                                <option value={-1}>
                                  {isFa ? '-- بدون نگاشت (نادیده گرفتن) --' : '-- Unmapped (Ignore) --'}
                                </option>
                                {inspection.fileColumns.map((fc) => (
                                  <option key={fc.index} value={fc.index}>
                                    {isFa ? `ستون ${fc.index + 1}` : `Col ${fc.index + 1}`}: {fc.header}
                                    {fc.samples[0] ? ` (${fc.samples[0].slice(0, 22)})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Parser Incomplete Rows Notice */}
                  {(activePreview.parseRejectedRows?.length || 0) > 0 && (
                    <div className="p-3 rounded-xl border border-[var(--status-danger)]/50 bg-[var(--status-danger-bg)]/40 space-y-1 text-xs">
                      <div className="font-bold text-[var(--status-danger)] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {isFa
                            ? `${activePreview.parseRejectedRows!.length.toLocaleString('fa-IR')} ردیف دارای مقدار بودند اما فیلدهای کلیدی آن‌ها خالی بود.`
                            : `${activePreview.parseRejectedRows!.length} row(s) missed required identifier fields.`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Duplicate Warning (shown when duplicates exist and file is not completely identical) */}
                  {activePreview.duplicateRecordsCount > 0 && !activePreview.deltaSummary?.isIdentical && (
                    <div className="p-3 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] space-y-1.5 text-xs">
                      <div className="font-bold text-[var(--status-warning)] flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          {isFa
                            ? `${activePreview.duplicateRecordsCount.toLocaleString('fa-IR')} رکورد تکراری شناسایی شد (${(activePreview.duplicateDbCount ?? activePreview.duplicateRecordsCount).toLocaleString('fa-IR')} در پایگاه داده، ${(activePreview.duplicateInFileCount ?? 0).toLocaleString('fa-IR')} درون فایل).`
                            : `${activePreview.duplicateRecordsCount} duplicate record(s) found.`}
                        </span>
                      </div>
                      {activePreview.duplicateSamples.length > 0 && (
                        <div className="text-[11px] text-[var(--text-secondary)] tabular-nums" dir="ltr">
                          {activePreview.duplicateSamples.join(' | ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pre-Import Editable Rows Review Table (Core Tables) */}
                  {activeEditedRows.length > 0 && activeFieldDefs.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[var(--text-primary)]">
                          {activePreview.parsedRowsTruncated
                            ? isFa
                              ? 'پیش‌نمایش نمونه داده‌ها (تمام ردیف‌های فایل هنگام ثبت اعمال می‌شوند)'
                              : 'Sample Row Preview (all file rows will be imported on commit)'
                            : isFa
                              ? 'پیش‌نمایش داده‌ها (قابل ویرایش پیش از ثبت)'
                              : 'Pre-Import Row Preview (Editable)'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {isFa
                            ? `نمایش ${Math.min(activeEditedRows.length, 25).toLocaleString('fa-IR')} از ${(activePreview.totalRows || activeEditedRows.length).toLocaleString('fa-IR')} ردیف`
                            : `Showing ${Math.min(activeEditedRows.length, 25)} of ${activePreview.totalRows || activeEditedRows.length} rows`}
                        </span>
                      </div>

                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
                        <StickyTableWrapper maxHeightClass="max-h-72">
                          <table className="w-full text-[11px]">
                            <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                              <tr>
                                <th className="py-2 px-2">#</th>
                                {activeFieldDefs.map((tf) => (
                                  <th key={tf.key} className="py-2 px-2 whitespace-nowrap font-semibold">
                                    {isFa ? tf.labelFa : tf.labelEn}
                                  </th>
                                ))}
                                {!activePreview.parsedRowsTruncated && (
                                  <th className="py-2 px-2">{isFa ? 'حذف' : 'Remove'}</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-subtle)]">
                              {activeEditedRows.slice(0, 25).map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-[var(--bg-subtle)]/40">
                                  <td className="py-1.5 px-2 tabular-nums text-[var(--text-muted)]">{rIdx + 1}</td>
                                  {activeFieldDefs.map((tf) => {
                                    const rawVal = row[tf.key];
                                    const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
                                    return (
                                      <td key={tf.key} className="py-1 px-1.5 min-w-[110px]">
                                        <input
                                          type={tf.isNumeric ? 'number' : 'text'}
                                          step={tf.isNumeric ? 'any' : undefined}
                                          value={strVal}
                                          readOnly={Boolean(activePreview.parsedRowsTruncated)}
                                          onChange={(e) => handleCellEdit(rIdx, tf.key, e.target.value, tf.isNumeric)}
                                          className="w-full h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                                        />
                                      </td>
                                    );
                                  })}
                                  {!activePreview.parsedRowsTruncated && (
                                    <td className="py-1 px-2">
                                      <button
                                        type="button"
                                        onClick={() => handleRemovePreviewRow(rIdx)}
                                        className="p-1 rounded text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                                        title={isFa ? 'حذف ردیف از ورود' : 'Remove row'}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </StickyTableWrapper>
                      </div>
                    </div>
                  )}

                  {/* Operational Form Parsed Documents Preview */}
                  {activePreview.isOperational && activeEditedRows.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[var(--text-primary)]">
                          {isFa
                            ? `پیش‌نمایش اسناد استخراج‌شده برای بخش «${getScopeDisplayLabel(activePreview.scope, true)}»`
                            : `Extracted Documents for "${getScopeDisplayLabel(activePreview.scope, false)}"`}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {isFa
                            ? `نمایش ${Math.min(activeEditedRows.length, 20).toLocaleString('fa-IR')} از ${activeEditedRows.length.toLocaleString('fa-IR')} سند`
                            : `Showing ${Math.min(activeEditedRows.length, 20)} of ${activeEditedRows.length} documents`}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-64 overflow-y-auto">
                        {activeEditedRows.slice(0, 20).map((row, idx) => {
                          const sum = summarizeOperationalRow(activePreview.scope, row, isFa, prefs.calendar);
                          return (
                            <div key={idx} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <div className="font-bold text-[var(--text-primary)] truncate">
                                  {idx + 1}. {sum.primary}
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary)] truncate">{sum.secondary}</div>
                              </div>
                              {sum.badge && (
                                <span className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[11px] font-medium text-[var(--text-primary)] shrink-0">
                                  {sum.badge}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Unified Duplicate Policy + Confirmation + Commit Bar */}
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {isFa ? 'برخورد با رکوردهای تکراری و تغییرات:' : 'Sync & Duplicate Policy:'}
                    </span>
                    <label className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-primary)] cursor-pointer">
                      <input
                        type="radio"
                        name="wizardDupPolicy"
                        data-testid="dup-policy-delta"
                        checked={duplicatePolicy === 'delta'}
                        onChange={() => setDuplicatePolicy('delta')}
                      />
                      <span>
                        {isFa
                          ? 'همگام‌سازی هوشمند تغییرات (ثبت جدیدها + بروزرسانی تغییریافته‌ها، بدون تغییرها نادیده گرفته شوند)'
                          : 'Smart Delta Sync (add new + update changed, skip unchanged)'}
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="wizardDupPolicy"
                        data-testid="dup-policy-skip"
                        checked={duplicatePolicy === 'skip'}
                        onChange={() => setDuplicatePolicy('skip')}
                      />
                      <span>{isFa ? 'رد کردن تکراری‌ها و ثبت در لاگ' : 'Skip Duplicates & Log'}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
                      <input
                        type="radio"
                        name="wizardDupPolicy"
                        data-testid="dup-policy-replace"
                        checked={duplicatePolicy === 'replace'}
                        onChange={() => setDuplicatePolicy('replace')}
                      />
                      <span>{isFa ? 'جایگزینی کامل با اطلاعات فایل' : 'Replace All Existing'}</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rowsConfirmed}
                      onChange={(e) => setRowsConfirmed(e.target.checked)}
                      className="rounded border-[var(--border-strong)]"
                    />
                    <span>
                      {isFa
                        ? `تایید می‌کنم ${confirmedTasks.length.toLocaleString('fa-IR')} بخش انتخاب‌شده بررسی شده و در نرم‌افزار ثبت شوند.`
                        : `I confirm importing the ${confirmedTasks.length} selected section(s) into the system.`}
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportStep(2)}
                      className="h-9 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                    >
                      {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      <span>{isFa ? 'بازگشت به بخش‌ها' : 'Back to Sections'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={importing || !rowsConfirmed}
                      onClick={() => void handleCommitWizardTasks()}
                      className="h-9 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                    >
                      {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>
                        {importing
                          ? isFa ? 'در حال ثبت و ارتباط‌دهی...' : 'Importing...'
                          : isFa
                            ? `تأیید و ثبت نهایی (${confirmedTasks.length.toLocaleString('fa-IR')} بخش)`
                            : `Confirm & Import (${confirmedTasks.length})`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Unified Completion Result Summary */}
          {autoWorkbookResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/45 space-y-2.5 text-xs">
              <div className="font-bold text-[var(--status-success)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? `ثبت ${autoWorkbookResult.sections.length.toLocaleString('fa-IR')} بخش با موفقیت انجام شد: ${autoWorkbookResult.totals.imported.toLocaleString('fa-IR')} جدید · ${autoWorkbookResult.totals.replaced.toLocaleString('fa-IR')} بروزرسانی/جایگزین${(autoWorkbookResult.totals.unchangedSkipped || 0) > 0 ? ` · ${(autoWorkbookResult.totals.unchangedSkipped || 0).toLocaleString('fa-IR')} بدون تغییر` : ''}${autoWorkbookResult.totals.skipped - (autoWorkbookResult.totals.unchangedSkipped || 0) > 0 ? ` · ${(autoWorkbookResult.totals.skipped - (autoWorkbookResult.totals.unchangedSkipped || 0)).toLocaleString('fa-IR')} رد شده` : ''}`
                    : `Imported ${autoWorkbookResult.sections.length} section(s): ${autoWorkbookResult.totals.imported} new · ${autoWorkbookResult.totals.replaced} updated${(autoWorkbookResult.totals.unchangedSkipped || 0) > 0 ? ` · ${autoWorkbookResult.totals.unchangedSkipped} unchanged` : ''}${autoWorkbookResult.totals.skipped - (autoWorkbookResult.totals.unchangedSkipped || 0) > 0 ? ` · ${autoWorkbookResult.totals.skipped - (autoWorkbookResult.totals.unchangedSkipped || 0)} skipped` : ''}`}
                </span>
              </div>
              {autoWorkbookResult.totals.linkedGeneral +
                autoWorkbookResult.totals.linkedDetailed +
                autoWorkbookResult.totals.linkedTransit >
                0 && (
                <div className="text-[11px] text-[var(--text-primary)] flex flex-wrap items-center gap-3 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent-primary)]">
                    <Link2 className="w-3.5 h-3.5" />
                    {isFa
                      ? `ارتباط‌دهی هوشمند: کلی (${autoWorkbookResult.totals.linkedGeneral}) · جزئیات (${autoWorkbookResult.totals.linkedDetailed}) · در راه (${autoWorkbookResult.totals.linkedTransit})`
                      : `Cross-Links: General (${autoWorkbookResult.totals.linkedGeneral}) · Detailed (${autoWorkbookResult.totals.linkedDetailed}) · Transit (${autoWorkbookResult.totals.linkedTransit})`}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px]">
                {autoWorkbookResult.sections.map((sec) => (
                  <div
                    key={`${sec.sheetName}-${sec.scope}`}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 tabular-nums"
                  >
                    <span className="font-semibold truncate">
                      {getScopeDisplayLabel(sec.scope, isFa)}
                      <span className="text-[10px] font-normal text-[var(--text-muted)] ms-1">({sec.sheetName})</span>
                    </span>
                    <span className="text-[var(--text-secondary)] shrink-0">
                      +{sec.imported}
                      {sec.replaced > 0 ? ` / ↻${sec.replaced}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Rejected Records Decision & Recovery Panel */}
          {pendingRejected.length > 0 && (
            <div className="p-4 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)]/60 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-[var(--status-warning)] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {isFa
                        ? `${pendingRejected.length.toLocaleString('fa-IR')} رکورد از فایل به دلایل زیر به پایگاه داده اضافه نشدند`
                        : `${pendingRejected.length} record(s) from the uploaded file were rejected`}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] font-medium">
                    {isFa
                      ? 'با این داده‌های رد شده چه کار کنیم؟ می‌توانید دلیل هر ردیف را ببینید، فیلدهای آن را ویرایش کنید، به عنوان رکورد جدید به پایگاه داده اضافه کنید، جایگزین کنید یا صرف‌نظر نمایید:'
                      : 'What should be done with these rejected records? Inspect each reason below, edit fields if needed, force-add to database, replace existing rows, or dismiss:'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hasReplaceablePending && (
                    <button
                      type="button"
                      disabled={Boolean(recoveringId)}
                      onClick={() => handleRecoverBulk('replace_duplicates')}
                      className="h-8 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>
                        {isFa ? 'جایگزینی موارد تکراری در پایگاه داده' : 'Replace Duplicate DB Rows'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(recoveringId)}
                    onClick={() => handleRecoverBulk('force_add_all')}
                    className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>
                      {isFa ? 'افزودن همه به عنوان رکورد جدید به پایگاه داده' : 'Force-Add All to Database'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(recoveringId)}
                    onClick={() => handleDismissRejected()}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs font-medium flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{isFa ? 'عدم ثبت و بستن همه' : 'Dismiss All'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pe-1">
                {pendingRejected.map((rec) => {
                  const fixFields = quickFixFieldsForRejectedScope(rec.scope);
                  const isBusyRow = recoveringId === rec.id || recoveringId === '__bulk__';
                  return (
                    <div
                      key={rec.id}
                      className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold tabular-nums text-[11px]">
                            {isFa
                              ? `ردیف ${rec.sourceRowIndex ? rec.sourceRowIndex.toLocaleString('fa-IR') : '-'}`
                              : `Row #${rec.sourceRowIndex || '-'}`}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] font-semibold text-[11px]">
                            {reasonBadgeText(rec.reasonCode, isFa)}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--text-primary)]">
                            {isFa ? rec.reasonFa : rec.reasonEn}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {rec.canForceReplace && (
                            <button
                              type="button"
                              disabled={isBusyRow}
                              onClick={() => handleRecoverSingleRow(rec, 'replace')}
                              className="h-7 px-2.5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              <RefreshCw className="w-3 h-3 text-[var(--accent-primary)]" />
                              <span>{isFa ? 'جایگزینی' : 'Replace'}</span>
                            </button>
                          )}
                          {rec.canForceAdd !== false && (
                            <button
                              type="button"
                              disabled={isBusyRow}
                              onClick={() => handleRecoverSingleRow(rec, 'force_add')}
                              className="h-7 px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 transition-colors"
                            >
                              <PlusCircle className="w-3 h-3" />
                              <span>{isFa ? 'افزودن به پایگاه داده' : 'Add to DB'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusyRow}
                            onClick={() => handleDismissRejected(rec.id)}
                            className="h-7 px-2 rounded-lg text-[11px] text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                            title={isFa ? 'صرف‌نظر کردن' : 'Dismiss'}
                          >
                            {isFa ? 'صرف‌نظر' : 'Dismiss'}
                          </button>
                        </div>
                      </div>

                      {rec.existingSummary && (
                        <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-canvas)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                          <span className="font-semibold">
                            {isFa ? 'رکورد مشابه موجود در پایگاه داده: ' : 'Matching DB record: '}
                          </span>
                          <span className="bidi-plaintext">{rec.existingSummary}</span>
                        </div>
                      )}

                      {rec.rawRow && rec.rawRow.length > 0 && (
                        <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-canvas)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                          <span className="font-semibold">
                            {isFa ? 'داده‌های خام خوانده‌شده از فایل: ' : 'Raw values from file: '}
                          </span>
                          <span className="bidi-plaintext">{rec.rawRow.join(' | ')}</span>
                        </div>
                      )}

                      {rec.canEditAndRetry !== false && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                          {fixFields.map((ff) => {
                            const cur = rec.parsedRow[ff.key];
                            const valStr = cur === null || cur === undefined ? '' : String(cur);
                            return (
                              <div key={ff.key}>
                                <label className="block text-[10px] text-[var(--text-muted)] mb-0.5">
                                  {isFa ? ff.labelFa : ff.labelEn}
                                </label>
                                <input
                                  type="text"
                                  value={valStr}
                                  onChange={(e) => handleRejectedFieldChange(rec.id, ff.key, e.target.value)}
                                  className="w-full h-7 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Import Audit Log History */}
          {importLogs.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                  <ClipboardList className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>
                    {isFa
                      ? `لاگ ورود اطلاعات از فایل (${importLogs.length.toLocaleString('fa-IR')})`
                      : `Import Activity Log (${importLogs.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setImportLogs([])}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--status-danger)]"
                >
                  {isFa ? 'پاک کردن تاریخچه لاگ' : 'Clear Log'}
                </button>
              </div>
              <div className="divide-y divide-[var(--border-subtle)] max-h-64 overflow-y-auto">
                {importLogs.map((log) => (
                  <div key={log.id} className="px-4 py-2.5 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {log.sourceLabel} ·{' '}
                        <span className="text-[var(--accent-primary)]">
                          {getScopeDisplayLabel(log.scope, isFa)}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] tabular-nums flex flex-wrap gap-3">
                      <span className="text-[var(--status-success)] font-medium">
                        {isFa ? `ثبت جدید: ${log.imported}` : `Imported: ${log.imported}`}
                      </span>
                      <span>{isFa ? `جایگزین: ${log.replaced}` : `Replaced: ${log.replaced}`}</span>
                      <span className={log.skipped > 0 ? 'text-[var(--status-danger)] font-medium' : ''}>
                        {isFa ? `رد شده: ${log.skipped}` : `Rejected: ${log.skipped}`}
                      </span>
                      {log.blankRowsSkipped > 0 && (
                        <span>
                          {isFa ? `سطر خالی: ${log.blankRowsSkipped}` : `Blank: ${log.blankRowsSkipped}`}
                        </span>
                      )}
                    </div>
                    {log.rejectedReasons.length > 0 && (
                      <div className="ps-3 border-s-2 border-[var(--status-danger)]/50 space-y-1 text-[11px] text-[var(--text-muted)]">
                        {log.rejectedReasons.slice(0, 8).map((rr, i) => (
                          <div key={i}>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {isFa
                                ? `ردیف ${rr.sourceRowIndex || '-'}`
                                : `Row #${rr.sourceRowIndex || '-'}`}
                              :
                            </span>{' '}
                            {rr.reasonText} ({rr.summary})
                          </div>
                        ))}
                        {log.rejectedReasons.length > 8 && (
                          <div>
                            {isFa
                              ? `... و ${(log.rejectedReasons.length - 8).toLocaleString('fa-IR')} مورد دیگر`
                              : `... and ${log.rejectedReasons.length - 8} more`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Offline Backups & Full JSON Restore */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold">
              {isFa ? 'پشتیبان‌گیری و بازیابی کامل پروژه (JSON و اسنپ‌شات آفلاین)' : 'Full Project Backup & Restore (JSON & Offline Snapshots)'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {isFa
                ? 'اسنپ‌شات‌ها به‌صورت خودکار پس از عملیات‌های مهم و هر ۱۰ دقیقه در حافظه آفلاین مرورگر ذخیره می‌شوند.'
                : 'Snapshots are saved automatically to local browser IndexedDB after major actions and every 10 minutes.'}
            </p>
            {isStaticFallbackMode() && (
              <p className="text-[11px] font-medium text-[var(--accent-primary)] mt-1.5">
                {isFa
                  ? 'در حال اجرا در حالت استاتیک مرورگر: برای انتقال یا اشتراک داده‌های پروژه، فایل پشتیبان JSON را دانلود کنید.'
                  : 'Running in Static Browser Mode: Download a JSON backup to transfer project data.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleManualSnapshot}
              className="h-9 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isFa ? 'ثبت اسنپ‌شات فوری' : 'Save Snapshot Now'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadLiveJson}
              className="h-9 px-4 rounded-xl border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'دانلود فایل پشتیبان (JSON)' : 'Export JSON Backup'}</span>
            </button>
            {isAdmin && (
              <label className="h-9 px-4 rounded-xl border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'بازیابی از فایل پشتیبان (JSON)' : 'Restore from JSON File'}</span>
                <input type="file" accept=".json,application/json" onChange={handleUploadRestore} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Saved Snapshots List (Instant metadata-only load; full payload fetched lazily on Restore/Download) */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 text-sm font-bold">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{isFa ? 'نسخه‌های ذخیره شده در حافظه مرورگر' : 'Saved Offline Snapshots'}</span>
          </div>
          {snapshotsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
          )}
        </div>

        {snapshotsLoading && snapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
            <span>{isFa ? 'در حال بارگذاری فهرست نسخه‌ها...' : 'Loading snapshots list...'}</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            {isFa ? 'هنوز اسنپ‌شاتی ذخیره نشده است.' : 'No offline snapshots stored yet.'}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {snapshots.map((snap) => {
              const isSnapLoading = loadingSnapId === snap.id;
              return (
                <div
                  key={snap.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-semibold flex items-center gap-2">
                      <span>{snap.label}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ({snap.trigger === 'auto' ? (isFa ? 'خودکار' : 'Auto') : (isFa ? 'دستی' : 'Manual')})
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {formatTimestamp(snap.createdAt)} · {formatBytes(snap.byteSize)} ·{' '}
                      {isFa
                        ? `جنرال: ${snap.counts.general.toLocaleString('fa-IR')} · دیتیل: ${snap.counts.detailed.toLocaleString('fa-IR')} · در راه: ${snap.counts.transit.toLocaleString('fa-IR')}`
                        : `General: ${snap.counts.general} · Detailed: ${snap.counts.detailed} · Transit: ${snap.counts.transit}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSnapLoading || busy}
                      onClick={() => handleDownloadSnapshotById(snap.id)}
                      className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      {isSnapLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>JSON</span>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        disabled={busy || isSnapLoading}
                        onClick={() => handleRestoreSnapshotById(snap.id)}
                        className="h-8 px-3 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        {isSnapLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>{isFa ? 'بازیابی' : 'Restore'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isSnapLoading}
                      onClick={async () => {
                        await deleteIndexedDbSnapshot(snap.id);
                        void loadSnapshots();
                      }}
                      className="p-1.5 rounded-lg text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                      aria-label={isFa ? `حذف اسنپ‌شات ${snap.label}` : `Delete snapshot ${snap.label}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
