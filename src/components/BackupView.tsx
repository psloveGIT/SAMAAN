import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Columns3,
  Download,
  FileSpreadsheet,
  HardDrive,
  Layers,
  Link2,
  Loader2,
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
import { formatIsoDate } from '../shared/jalali.ts';
import { parseSpreadsheetFile, type StructuredSheetPayload } from '../shared/spreadsheetImport.ts';
import type {
  CalendarMode,
  DatabaseSnapshot,
  ImportRejectedRecord,
  ImportRejectionReasonCode,
} from '../shared/types.ts';

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
  columnInspection?: ColumnInspectionPayload;
}

interface CommitResponse {
  scope: ExtendedImportScope;
  isOperational?: boolean;
  imported: number;
  replaced: number;
  skipped: number;
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
      return isFa ? 'تکراری در دیتابیس' : 'Duplicate in DB';
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

  // Unified Spreadsheet / CSV / JSON Import state (Core + All 10 Operational/Custom Forms)
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetsMap, setSheetsMap] = useState<Record<string, string[][]>>({});
  const [structuredSheetsMap, setStructuredSheetsMap] = useState<Record<string, StructuredSheetPayload>>({});
  const [importScope, setImportScope] = useState<'auto' | ExtendedImportScope>('auto');
  const [assumedCalendar, setAssumedCalendar] = useState<'jalali' | 'gregorian'>('jalali');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'replace' | 'skip'>('skip');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, number> | null>(null);
  const [editedRows, setEditedRows] = useState<Record<string, unknown>[]>([]);
  const [mappingExpanded, setMappingExpanded] = useState(true);
  const [rowsConfirmed, setRowsConfirmed] = useState(false);
  const [importResult, setImportResult] = useState<CommitResponse | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedSheets, setImportedSheets] = useState<string[]>([]);
  const [postSheetPrompt, setPostSheetPrompt] = useState<string | null>(null);

  // Multi-Sheet / Multi-Section Auto-Workbook Detection State
  const [autoWorkbookPreview, setAutoWorkbookPreview] = useState<AutoWorkbookPreviewSection[]>([]);
  const [sheetScopeOverrides, setSheetScopeOverrides] = useState<Record<string, ExtendedImportScope | 'skip'>>({});
  const [autoWorkbookResult, setAutoWorkbookResult] = useState<AutoWorkbookCommitSummary | null>(null);
  const [autoImporting, setAutoImporting] = useState(false);

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

  const runPreview = useCallback(
    async (
      matrix: string[][],
      scopeVal: 'auto' | ExtendedImportScope,
      calVal: 'jalali' | 'gregorian',
      explicitMapping?: Record<string, number>,
      sheetNameParam?: string,
      structuredParam?: StructuredSheetPayload,
    ) => {
      const hasStruct = Boolean(structuredParam?.records && structuredParam.records.length > 0);
      if ((!matrix || matrix.length === 0) && !hasStruct) return;
      try {
        const res = await apiRequest<PreviewResponse>('/api/import/preview', {
          method: 'POST',
          body: JSON.stringify({
            matrix,
            ...(hasStruct ? { structuredRecords: structuredParam!.records, sectionHint: structuredParam!.sectionHint } : {}),
            ...(sheetNameParam ? { sheetName: sheetNameParam } : {}),
            scope: scopeVal === 'auto' ? undefined : scopeVal,
            assumedCalendar: calVal,
            ...(explicitMapping ? { columnMapping: explicitMapping } : {}),
          }),
        });
        setPreview(res);
        setColumnMapping(res.columnInspection?.mapping || explicitMapping || null);
        setEditedRows(res.parsedRows || res.sample || []);
        setRowsConfirmed(Boolean(res.isOperational));
      } catch (err) {
        if (err instanceof ApiError) notify('error', err.message);
      }
    },
    [notify],
  );

  const runAutoWorkbookPreview = useCallback(
    async (
      names: string[],
      sMap: Record<string, string[][]>,
      structMap: Record<string, StructuredSheetPayload>,
      calVal: 'jalali' | 'gregorian',
    ) => {
      if (names.length === 0) {
        setAutoWorkbookPreview([]);
        return;
      }
      try {
        const payloadSheets = names.map((nm) => ({
          name: nm,
          matrix: sMap[nm] || [],
          ...(structMap[nm]?.records?.length
            ? { structuredRecords: structMap[nm].records, sectionHint: structMap[nm].sectionHint }
            : {}),
        }));
        const res = await apiRequest<{ detectedSheets: AutoWorkbookPreviewSection[] }>('/api/import/auto-workbook', {
          method: 'POST',
          body: JSON.stringify({
            sheets: payloadSheets,
            assumedCalendar: calVal,
            dryRun: true,
          }),
        });
        setAutoWorkbookPreview(res.detectedSheets || []);
        const initOverrides: Record<string, ExtendedImportScope | 'skip'> = {};
        for (const ds of res.detectedSheets || []) {
          initOverrides[ds.sheetName] = ds.scope || 'skip';
        }
        setSheetScopeOverrides(initOverrides);
      } catch {
        setAutoWorkbookPreview([]);
      }
    },
    [],
  );

  const handleSelectDataFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportResult(null);
    setAutoWorkbookResult(null);
    setAutoWorkbookPreview([]);
    setSheetScopeOverrides({});
    setPreview(null);
    setColumnMapping(null);
    setEditedRows([]);
    setRowsConfirmed(false);
    setImportedSheets([]);
    setPostSheetPrompt(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const nextStructMap = parsed.structuredSheets || {};
      setFileName(parsed.fileName);
      setSheetNames(parsed.sheetNames);
      setSheetsMap(parsed.sheets);
      setStructuredSheetsMap(nextStructMap);
      setSelectedSheet(parsed.defaultSheet);
      const matrix = parsed.sheets[parsed.defaultSheet] || [];
      const structPayload = nextStructMap[parsed.defaultSheet];
      await Promise.all([
        runPreview(matrix, importScope, assumedCalendar, undefined, parsed.defaultSheet, structPayload),
        parsed.sheetNames.length > 1
          ? runAutoWorkbookPreview(parsed.sheetNames, parsed.sheets, nextStructMap, assumedCalendar)
          : Promise.resolve(),
      ]);
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

  const handleSheetChange = async (nextSheet: string) => {
    setSelectedSheet(nextSheet);
    setImportResult(null);
    setPostSheetPrompt(null);
    setColumnMapping(null);
    const matrix = sheetsMap[nextSheet] || [];
    const structPayload = structuredSheetsMap[nextSheet];
    await runPreview(matrix, importScope, assumedCalendar, undefined, nextSheet, structPayload);
  };

  const handleScopeOrCalendarChange = async (
    nextScope: 'auto' | ExtendedImportScope,
    nextCal: 'jalali' | 'gregorian',
  ) => {
    setImportScope(nextScope);
    setAssumedCalendar(nextCal);
    setColumnMapping(null);
    const matrix = sheetsMap[selectedSheet] || [];
    const structPayload = structuredSheetsMap[selectedSheet];
    if (matrix.length > 0 || structPayload?.records?.length) {
      await runPreview(matrix, nextScope, nextCal, undefined, selectedSheet, structPayload);
    }
    if (sheetNames.length > 1) {
      await runAutoWorkbookPreview(sheetNames, sheetsMap, structuredSheetsMap, nextCal);
    }
  };

  const handleMappingChange = async (fieldKey: string, colIdx: number) => {
    if (!preview || preview.isOperational) return;
    const nextMap: Record<string, number> = {
      ...(columnMapping || preview.columnInspection?.mapping || {}),
      [fieldKey]: colIdx,
    };
    setColumnMapping(nextMap);
    const matrix = sheetsMap[selectedSheet] || [];
    if (matrix.length > 0) {
      await runPreview(matrix, preview.scope, assumedCalendar, nextMap, selectedSheet, structuredSheetsMap[selectedSheet]);
    }
  };

  const handleCellEdit = (rowIndex: number, key: string, value: string, isNumeric?: boolean) => {
    setEditedRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        if (isNumeric) {
          const cleaned = value.trim();
          return { ...row, [key]: cleaned === '' ? null : Number(cleaned) };
        }
        return { ...row, [key]: value };
      }),
    );
  };

  const handleRemovePreviewRow = (rowIndex: number) => {
    setEditedRows((prev) => prev.filter((_, i) => i !== rowIndex));
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

  const handleCommitImport = async () => {
    const matrix = sheetsMap[selectedSheet] || [];
    const structPayload = structuredSheetsMap[selectedSheet];
    const hasStruct = Boolean(structPayload?.records?.length);
    if (matrix.length === 0 && editedRows.length === 0 && !hasStruct) return;
    const currentFile = fileName || (isFa ? 'فایل ورودی' : 'Uploaded File');
    setImporting(true);
    try {
      const targetScope = preview?.scope || (importScope === 'auto' ? undefined : importScope);
      const isOp = targetScope ? isOperationalScope(targetScope) : Boolean(preview?.isOperational);
      const res = await apiRequest<CommitResponse>('/api/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          matrix,
          ...(hasStruct ? { structuredRecords: structPayload!.records, sectionHint: structPayload!.sectionHint } : {}),
          ...(selectedSheet ? { sheetName: selectedSheet } : {}),
          scope: targetScope,
          assumedCalendar,
          duplicateRecordPolicy: duplicatePolicy,
          includeParserRejections: !isOp,
          ...(!isOp && columnMapping ? { columnMapping } : {}),
          ...(editedRows.length > 0 ? { editedRows } : {}),
        }),
      });
      setImportResult(res);
      setPendingRejected(res.rejectedRecords || []);
      recordLogSession(res, `${currentFile}${sheetNames.length > 1 ? ` (${selectedSheet})` : ''}`, isFa);

      setPreview(null);
      setEditedRows([]);
      setColumnMapping(null);
      setRowsConfirmed(false);

      if (sheetNames.length > 1) {
        setImportedSheets((prev) => (prev.includes(selectedSheet) ? prev : [...prev, selectedSheet]));
        setPostSheetPrompt(selectedSheet);
      } else {
        setFileName('');
        setSheetNames([]);
        setSelectedSheet('');
        setSheetsMap({});
        setStructuredSheetsMap({});
        setPostSheetPrompt(null);
      }
      const linkSummaryFa =
        (res.linkedGeneral || 0) + (res.linkedDetailed || 0) + (res.linkedTransit || 0) > 0
          ? ` · ارتباط‌دهی: کلی ${res.linkedGeneral || 0}، جزئیات ${res.linkedDetailed || 0}، در راه ${res.linkedTransit || 0}`
          : '';
      notify(
        res.skipped > 0 ? 'info' : 'success',
        isFa
          ? `عملیات تکمیل شد (${getScopeDisplayLabel(res.scope, true)}): ${res.imported} جدید، ${res.replaced} جایگزین، ${res.skipped} رد شده${linkSummaryFa}.`
          : `Import completed (${getScopeDisplayLabel(res.scope, false)}): ${res.imported} imported, ${res.replaced} replaced, ${res.skipped} skipped.`,
      );
      triggerAutoSnapshot(`Import (${res.scope})`);
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleCommitAutoWorkbook = async () => {
    const activeSheets = sheetNames
      .map((nm) => {
        const chosen = sheetScopeOverrides[nm];
        if (chosen === 'skip') return null;
        const structPayload = structuredSheetsMap[nm];
        return {
          name: nm,
          matrix: sheetsMap[nm] || [],
          ...(structPayload?.records?.length
            ? { structuredRecords: structPayload.records, sectionHint: structPayload.sectionHint }
            : {}),
          ...(chosen ? { forcedScope: chosen } : {}),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (activeSheets.length === 0) {
      notify('error', isFa ? 'حداقل یک شیت معتبر برای ورود انتخاب کنید.' : 'Select at least one valid sheet to import.');
      return;
    }

    const currentFile = fileName || (isFa ? 'فایل چندبخشی' : 'Multi-Sheet Workbook');
    setAutoImporting(true);
    try {
      const res = await apiRequest<AutoWorkbookCommitSummary>('/api/import/auto-workbook', {
        method: 'POST',
        body: JSON.stringify({
          sheets: activeSheets,
          assumedCalendar,
          duplicateRecordPolicy: duplicatePolicy,
          dryRun: false,
        }),
      });
      setAutoWorkbookResult(res);
      for (const sec of res.sections) {
        recordLogSession(
          {
            scope: sec.scope,
            isOperational: sec.isOperational,
            imported: sec.imported,
            replaced: sec.replaced,
            skipped: sec.skipped,
            transitAutoArrived: sec.linkedTransit,
            linkedGeneral: sec.linkedGeneral,
            linkedDetailed: sec.linkedDetailed,
            linkedTransit: sec.linkedTransit,
          },
          `${currentFile} [${sec.sheetName}]`,
          isFa,
        );
      }
      setImportedSheets(res.sections.map((s) => s.sheetName));
      setPreview(null);
      setEditedRows([]);
      setPostSheetPrompt(null);
      notify(
        'success',
        isFa
          ? `ورود خودکار ${res.sections.length} بخش تکمیل شد: ${res.totals.imported} جدید، ${res.totals.replaced} جایگزین (ارتباط با کلی: ${res.totals.linkedGeneral}، جزئیات: ${res.totals.linkedDetailed}، در راه: ${res.totals.linkedTransit}).`
          : `Auto-imported ${res.sections.length} sections: ${res.totals.imported} imported, ${res.totals.replaced} replaced.`,
      );
      triggerAutoSnapshot(`Auto-Workbook (${res.sections.length} sections)`);
      onRestored();
    } catch (err) {
      if (err instanceof ApiError) notify('error', err.message);
    } finally {
      setAutoImporting(false);
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
            ? isFa ? 'رکورد در دیتابیس با مقادیر جدید جایگزین شد.' : 'Existing DB record replaced.'
            : isFa ? 'رکورد با موفقیت به دیتابیس اضافه شد.' : 'Record added to database.',
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
      notify('info', isFa ? 'رکوردهای رد شده نادیده گرفته شدند و به دیتابیس اضافه نشدند.' : 'Rejected records dismissed.');
      return;
    }
    setPendingRejected((prev) => prev.filter((item) => item.id !== id));
  };

  const clearImportSelection = () => {
    setFileName('');
    setSheetNames([]);
    setSelectedSheet('');
    setSheetsMap({});
    setStructuredSheetsMap({});
    setAutoWorkbookPreview([]);
    setSheetScopeOverrides({});
    setAutoWorkbookResult(null);
    setPreview(null);
    setColumnMapping(null);
    setEditedRows([]);
    setRowsConfirmed(false);
    setImportResult(null);
    setImportedSheets([]);
    setPostSheetPrompt(null);
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

  const inspection = preview && !preview.isOperational ? preview.columnInspection : undefined;
  const activeFieldDefs =
    inspection && preview && !preview.isOperational
      ? editableFieldsForScope(preview.scope as 'general' | 'detailed' | 'transit')
          .map((k) => inspection.targetFields.find((tf) => tf.key === k))
          .filter((tf): tf is ImportColumnDef => Boolean(tf))
      : [];

  const hasReplaceablePending = pendingRejected.some((r) => r.canForceReplace);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Section 1: Data Import from Excel / CSV / JSON with column mapping, pre-commit review, & duplicate handling */}
      {canImport && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>
                  {isFa
                    ? 'ورود و بازیابی اطلاعات از فایل (Excel، CSV، JSON)'
                    : 'Import & Restore Data from File (Excel, CSV, JSON)'}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {isFa
                  ? 'تشخیص خودکار جداول در راه، کلی و جزئیات همراه با تمامی فرم‌های عملیاتی و اختصاصی کارفرما (صورتجلسه ورود، دعوتنامه و صورتجلسه OPI، گزارش MER، رسید GCV، حواله MIV/SMR، جایگزینی، برآورد MTO، انبارگردانی و بازدید ادواری) با ارتباط‌دهی هوشمند.'
                  : 'Auto-detects Core tables (Transit, General, Detailed) and all 10 operational & custom employer forms from Excel, CSV, or JSON with automatic cross-linking.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {fileName && (
                <button
                  type="button"
                  onClick={clearImportSelection}
                  className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)] text-xs font-medium"
                >
                  {isFa ? 'پاک کردن فایل' : 'Clear File'}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'بخش مقصد' : 'Target Section'}
              </label>
              <select
                value={importScope}
                onChange={(e) =>
                  handleScopeOrCalendarChange(
                    e.target.value as 'auto' | ExtendedImportScope,
                    assumedCalendar,
                  )
                }
                className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="auto">
                  {isFa ? 'تشخیص خودکار (همه جداول و فرم‌ها)' : 'Auto-Detect (All Tables & Forms)'}
                </option>
                <optgroup label={isFa ? 'جداول پایه انبار' : 'Core Warehouse Tables'}>
                  <option value="transit">{getScopeDisplayLabel('transit', isFa)}</option>
                  <option value="general">{getScopeDisplayLabel('general', isFa)}</option>
                  <option value="detailed">{getScopeDisplayLabel('detailed', isFa)}</option>
                </optgroup>
                <optgroup label={isFa ? 'فرم‌های عملیاتی و اختصاصی کارفرما' : 'Operational & Custom Employer Forms'}>
                  {ALL_EXTENDED_SCOPES.filter((sc) => isOperationalScope(sc)).map((sc) => (
                    <option key={sc} value={sc}>
                      {getScopeDisplayLabel(sc, isFa)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                {isFa ? 'تقویم تاریخ‌های فایل' : 'Source Date Calendar'}
              </label>
              <select
                value={assumedCalendar}
                onChange={(e) =>
                  handleScopeOrCalendarChange(
                    importScope,
                    e.target.value as 'jalali' | 'gregorian',
                  )
                }
                className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
              >
                <option value="jalali">{isFa ? 'شمسی (جلالی)' : 'Jalali (Shamsi)'}</option>
                <option value="gregorian">{isFa ? 'میلادی' : 'Gregorian'}</option>
              </select>
            </div>

            {sheetNames.length > 1 && (
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  {isFa ? 'انتخاب شیت / بخش جهت پیش‌نمایش' : 'Inspect Sheet / Section'}
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs"
                >
                  {sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {importedSheets.includes(s) ? `✓ ${s}` : s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Multi-Sheet / Multi-Section Auto-Import & Cross-Linking Panel */}
          {fileName && sheetNames.length > 1 && autoWorkbookPreview.length > 0 && (
            <div className="p-4 rounded-xl border border-[var(--accent-primary)]/35 bg-[var(--accent-soft)]/55 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                    <span>
                      {isFa
                        ? `تشخیص خودکار چندبخشی: ${autoWorkbookPreview.length.toLocaleString('fa-IR')} شیت/بخش در فایل «${fileName}» شناسایی شد`
                        : `Multi-Section Auto-Detection: ${autoWorkbookPreview.length} sheets/sections found in "${fileName}"`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {isFa
                      ? 'تمامی بخش‌ها به ترتیب اولویت (در راه ← کلی ← جزئیات ← فرم‌های عملیاتی و اختصاصی) ثبت شده و به‌صورت خودکار به هم متصل می‌شوند.'
                      : 'All sections are imported in dependency order (Transit → General → Detailed → Operational & Custom Forms) with automatic cross-linking.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={duplicatePolicy}
                    onChange={(e) => setDuplicatePolicy(e.target.value as 'replace' | 'skip')}
                    className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-medium"
                    aria-label={isFa ? 'سیاست تکراری‌ها' : 'Duplicate Policy'}
                  >
                    <option value="skip">{isFa ? 'رد کردن تکراری‌ها' : 'Skip Duplicates'}</option>
                    <option value="replace">{isFa ? 'جایگزینی تکراری‌ها' : 'Replace Duplicates'}</option>
                  </select>
                  <button
                    type="button"
                    disabled={autoImporting}
                    onClick={handleCommitAutoWorkbook}
                    className="h-8 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                  >
                    {autoImporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {autoImporting
                        ? isFa ? 'در حال ثبت و ارتباط‌دهی...' : 'Importing & Linking...'
                        : isFa ? 'ورود خودکار همه بخش‌ها و ارتباط‌دهی هوشمند' : 'Auto-Import All Sections & Link'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {autoWorkbookPreview.map((sec) => {
                  const chosen = sheetScopeOverrides[sec.sheetName] ?? sec.scope ?? 'skip';
                  const isDone = importedSheets.includes(sec.sheetName);
                  const totalEstLinks = sec.estimatedLinks.general + sec.estimatedLinks.detailed + sec.estimatedLinks.transit;
                  return (
                    <div
                      key={sec.sheetName}
                      className={`p-2.5 rounded-xl border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                        isDone
                          ? 'border-[var(--status-success)] bg-[var(--status-success-bg)]/40'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 truncate">
                          {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />}
                          <span className="truncate">{sec.sheetName}</span>
                          <span className="text-[10px] font-normal text-[var(--text-muted)] tabular-nums">
                            ({isFa ? `${sec.rowCount.toLocaleString('fa-IR')} ردیف` : `${sec.rowCount} rows`})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)] tabular-nums">
                          {sec.duplicateDbCount > 0 && (
                            <span className="text-[var(--status-warning)] font-medium">
                              {isFa ? `${sec.duplicateDbCount} تکراری` : `${sec.duplicateDbCount} dup`}
                            </span>
                          )}
                          {totalEstLinks > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[var(--accent-primary)] font-medium">
                              <Link2 className="w-3 h-3" />
                              {isFa
                                ? `ارتباط: کلی ${sec.estimatedLinks.general} · جزئیات ${sec.estimatedLinks.detailed} · در راه ${sec.estimatedLinks.transit}`
                                : `Links: G ${sec.estimatedLinks.general} · D ${sec.estimatedLinks.detailed} · T ${sec.estimatedLinks.transit}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        value={chosen}
                        onChange={(e) =>
                          setSheetScopeOverrides((prev) => ({
                            ...prev,
                            [sec.sheetName]: e.target.value as ExtendedImportScope | 'skip',
                          }))
                        }
                        className="h-7 px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] max-w-[200px]"
                      >
                        <option value="skip">{isFa ? '-- نادیده گرفتن شیت --' : '-- Skip Sheet --'}</option>
                        {ALL_EXTENDED_SCOPES.map((sc) => (
                          <option key={sc} value={sc}>
                            {getScopeDisplayLabel(sc, isFa)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Multi-Section Auto-Workbook Commit Result Summary */}
          {autoWorkbookResult && (
            <div className="p-4 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/45 space-y-2.5 text-xs">
              <div className="font-bold text-[var(--status-success)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isFa
                    ? `ثبت خودکار ${autoWorkbookResult.sections.length.toLocaleString('fa-IR')} بخش با موفقیت انجام شد: ${autoWorkbookResult.totals.imported.toLocaleString('fa-IR')} جدید · ${autoWorkbookResult.totals.replaced.toLocaleString('fa-IR')} جایگزین · ${autoWorkbookResult.totals.skipped.toLocaleString('fa-IR')} رد شده`
                    : `Auto-imported ${autoWorkbookResult.sections.length} sections: ${autoWorkbookResult.totals.imported} imported · ${autoWorkbookResult.totals.replaced} replaced · ${autoWorkbookResult.totals.skipped} skipped`}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-primary)] flex flex-wrap items-center gap-3 tabular-nums">
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--accent-primary)]">
                  <Link2 className="w-3.5 h-3.5" />
                  {isFa
                    ? `مجموع ارتباط‌های هوشمند: جدول کلی (${autoWorkbookResult.totals.linkedGeneral}) · جدول جزئیات (${autoWorkbookResult.totals.linkedDetailed}) · کالاهای در راه (${autoWorkbookResult.totals.linkedTransit})`
                    : `Cross-Links Applied: General (${autoWorkbookResult.totals.linkedGeneral}) · Detailed (${autoWorkbookResult.totals.linkedDetailed}) · Transit (${autoWorkbookResult.totals.linkedTransit})`}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px]">
                {autoWorkbookResult.sections.map((sec) => (
                  <div
                    key={`${sec.sheetName}-${sec.scope}`}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 tabular-nums"
                  >
                    <span className="font-semibold truncate">{getScopeDisplayLabel(sec.scope, isFa)}</span>
                    <span className="text-[var(--text-secondary)] shrink-0">
                      +{sec.imported}
                      {sec.replaced > 0 ? ` / ↻${sec.replaced}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Sheet Continuation Prompt */}
          {postSheetPrompt && sheetNames.length > 1 && (
            <div className="p-4 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-[var(--text-primary)]">
                  {isFa
                    ? `اطلاعات شیت «${postSheetPrompt}» با موفقیت ثبت شد. آیا می‌خواهید از سایر شیت‌های این فایل نیز اطلاعات وارد کنید؟`
                    : `Sheet "${postSheetPrompt}" was imported. Would you like to import data from the remaining sheets of this workbook?`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const remaining = sheetNames.filter((s) => !importedSheets.includes(s));
                      const next = remaining[0] || sheetNames.find((s) => s !== selectedSheet) || sheetNames[0];
                      if (next) void handleSheetChange(next);
                    }}
                    className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] font-semibold"
                  >
                    {isFa ? 'بله، انتخاب شیت بعدی' : 'Yes, Import Next Sheet'}
                  </button>
                  <button
                    type="button"
                    onClick={clearImportSelection}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] font-medium"
                  >
                    {isFa ? 'خیر، بستن فایل' : 'No, Close File'}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {sheetNames.map((s) => {
                  const done = importedSheets.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void handleSheetChange(s)}
                      className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 ${
                        done
                          ? 'border-[var(--status-success)] bg-[var(--status-success-bg)] text-[var(--status-success)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]'
                      }`}
                    >
                      {done && <CheckCircle2 className="w-3 h-3" />}
                      <span>{s}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {fileName && preview && (
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold flex flex-wrap items-center gap-1.5">
                  <span>{isFa ? `پیش‌نمایش فایل: ${fileName}` : `Preview: ${fileName}`} ·</span>
                  <span className="text-[var(--accent-primary)] font-bold">
                    {getScopeDisplayLabel(preview.scope, isFa)}
                  </span>
                  {preview.isOperational && preview.estimatedLinks && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] text-[11px] font-semibold tabular-nums">
                      <Link2 className="w-3 h-3" />
                      {isFa
                        ? `ارتباط خودکار: کلی ${preview.estimatedLinks.general} · جزئیات ${preview.estimatedLinks.detailed} · در راه ${preview.estimatedLinks.transit}`
                        : `Auto-Links: G ${preview.estimatedLinks.general} · D ${preview.estimatedLinks.detailed} · T ${preview.estimatedLinks.transit}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {isFa
                      ? `${editedRows.length.toLocaleString('fa-IR')} ردیف/سند آماده ثبت`
                      : `${editedRows.length} record(s) ready`}
                  </span>
                  {inspection && (
                    <button
                      type="button"
                      onClick={() => setMappingExpanded((v) => !v)}
                      className="h-7 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-medium flex items-center gap-1"
                    >
                      <Columns3 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>{isFa ? 'تطبیق ستون‌ها' : 'Column Mapping'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Column Mapping Confirmation Form */}
              {inspection && mappingExpanded && (
                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {isFa
                          ? 'تایید و اصلاح تطبیق ستون‌های فایل با فیلدهای نرم‌افزار'
                          : 'Verify & Adjust Source Column Mapping'}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {isFa
                          ? 'در صورت متفاوت بودن نام ستون‌ها در فایل شما، ستون متناظر را از فهرست هر فیلد انتخاب کنید تا داده‌ها دقیقاً در جای درست ثبت شوند.'
                          : 'If column headers differ in your file, select the matching file column for each system field.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
                    {inspection.targetFields.map((tf) => {
                      const mappedIdx = (columnMapping || inspection.mapping)[tf.key] ?? -1;
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
                            onChange={(e) => handleMappingChange(tf.key, Number(e.target.value))}
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

              {/* Parser Incomplete Rows Notice during Preview */}
              {(preview.parseRejectedRows?.length || 0) > 0 && (
                <div className="p-3.5 rounded-xl border border-[var(--status-danger)]/50 bg-[var(--status-danger-bg)]/50 space-y-1.5 text-xs">
                  <div className="font-bold text-[var(--status-danger)] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {isFa
                        ? `${preview.parseRejectedRows!.length.toLocaleString('fa-IR')} ردیف در فایل دارای مقدار بودند اما به دلیل خالی بودن فیلدهای کلیدی هنگام خواندن رد شدند.`
                        : `${preview.parseRejectedRows!.length} non-empty row(s) missed required identifier fields during parsing.`}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {isFa
                      ? 'می‌توانید نگاشت ستون‌ها را در بالا اصلاح کنید؛ همچنین پس از ثبت فایل، این ردیف‌ها با دلیل دقیق در بخش «لاگ ورود» نمایش داده می‌شوند تا در صورت نیاز آن‌ها را ویرایش و اضافه کنید.'
                      : 'You can adjust column mappings above, or review and fix them in the Import Log right after committing.'}
                  </p>
                </div>
              )}

              {/* Duplicate Warning */}
              {preview.duplicateRecordsCount > 0 && (
                <div className="p-3.5 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-bg)] space-y-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold text-[var(--status-warning)]">
                        {isFa
                          ? `${preview.duplicateRecordsCount.toLocaleString('fa-IR')} رکورد تکراری شناسایی شد (${(preview.duplicateDbCount ?? preview.duplicateRecordsCount).toLocaleString('fa-IR')} مشابه دیتابیس، ${(preview.duplicateInFileCount ?? 0).toLocaleString('fa-IR')} تکراری درون همین فایل).`
                          : `${preview.duplicateRecordsCount} duplicate record(s) found (${preview.duplicateDbCount ?? preview.duplicateRecordsCount} in DB, ${preview.duplicateInFileCount ?? 0} within file).`}
                      </div>
                      {preview.duplicateSamples.length > 0 && (
                        <div className="text-[11px] text-[var(--text-secondary)] tabular-nums" dir="ltr">
                          {preview.duplicateSamples.join(' | ')}
                        </div>
                      )}
                      <div className="text-[11px] text-[var(--text-primary)]">
                        {isFa
                          ? 'لطفاً نحوه برخورد با رکوردهای تکراری را انتخاب کنید (در صورت انتخاب «رد کردن»، جزئیات دقیق آن‌ها در لاگ پایین ثبت شده و قابل تصمیم‌گیری مجدد خواهد بود):'
                          : 'Choose how to handle duplicates (skipped items appear in the Import Log for review and recovery):'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 ps-6">
                    <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="dupPolicy"
                        checked={duplicatePolicy === 'replace'}
                        onChange={() => setDuplicatePolicy('replace')}
                      />
                      <span>{isFa ? 'جایگزینی با اطلاعات جدید فایل' : 'Replace existing records'}</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="dupPolicy"
                        checked={duplicatePolicy === 'skip'}
                        onChange={() => setDuplicatePolicy('skip')}
                      />
                      <span>{isFa ? 'رد کردن و ثبت در لاگ برای تصمیم‌گیری' : 'Skip & Log for Review'}</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Pre-Import Editable Rows Review Table */}
              {editedRows.length > 0 && activeFieldDefs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[var(--text-primary)]">
                      {isFa
                        ? 'فرم بررسی، ویرایش و تایید ستون‌های داده‌ها پیش از ثبت'
                        : 'Pre-Import Row Review & Editing Table'}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {isFa
                        ? `نمایش ${Math.min(editedRows.length, 30).toLocaleString('fa-IR')} از ${editedRows.length.toLocaleString('fa-IR')} ردیف (قابل ویرایش مستقیم)`
                        : `Showing first ${Math.min(editedRows.length, 30)} of ${editedRows.length} rows (editable)`}
                    </span>
                  </div>

                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-x-clip">
                    <StickyTableWrapper maxHeightClass="max-h-80">
                      <table className="w-full text-[11px]">
                        <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
                        <tr>
                          <th className="py-2 px-2">#</th>
                          {activeFieldDefs.map((tf) => (
                            <th key={tf.key} className="py-2 px-2 whitespace-nowrap font-semibold">
                              {isFa ? tf.labelFa : tf.labelEn}
                            </th>
                          ))}
                          <th className="py-2 px-2">{isFa ? 'حذف' : 'Remove'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {editedRows.slice(0, 30).map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-[var(--bg-subtle)]/40">
                            <td className="py-1.5 px-2 tabular-nums text-[var(--text-muted)]">
                              {rIdx + 1}
                            </td>
                            {activeFieldDefs.map((tf) => {
                              const rawVal = row[tf.key];
                              const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
                              return (
                                <td key={tf.key} className="py-1 px-1.5 min-w-[110px]">
                                  <input
                                    type={tf.isNumeric ? 'number' : 'text'}
                                    step={tf.isNumeric ? 'any' : undefined}
                                    value={strVal}
                                    onChange={(e) => handleCellEdit(rIdx, tf.key, e.target.value, tf.isNumeric)}
                                    className="w-full h-7 px-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[11px] bidi-plaintext focus:outline-none focus:border-[var(--accent-primary)]"
                                  />
                                </td>
                              );
                            })}
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
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </StickyTableWrapper>
                  </div>
                </div>
              )}

              {/* Operational Form Parsed Documents Preview */}
              {preview.isOperational && editedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[var(--text-primary)]">
                      {isFa
                        ? `پیش‌نمایش اسناد استخراج‌شده برای بخش «${getScopeDisplayLabel(preview.scope, true)}»`
                        : `Extracted Documents for "${getScopeDisplayLabel(preview.scope, false)}"`}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {isFa
                        ? `نمایش ${Math.min(editedRows.length, 20).toLocaleString('fa-IR')} از ${editedRows.length.toLocaleString('fa-IR')} سند`
                        : `Showing ${Math.min(editedRows.length, 20)} of ${editedRows.length} documents`}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-72 overflow-y-auto">
                    {editedRows.slice(0, 20).map((row, idx) => {
                      const sum = summarizeOperationalRow(preview.scope, row, isFa, prefs.calendar);
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

              {/* Explicit Confirmation Checkbox & Commit Button */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rowsConfirmed}
                    onChange={(e) => setRowsConfirmed(e.target.checked)}
                    className="rounded border-[var(--border-strong)]"
                  />
                  <span>
                    {preview.isOperational
                      ? isFa
                        ? 'تایید می‌کنم اسناد شناسایی‌شده در بخش مربوطه ثبت شده و با جداول در راه، کلی و جزئیات ارتباط داده شوند.'
                        : 'I confirm importing these forms into their section with automatic cross-linking to Transit, General, and Detailed tables.'
                      : isFa
                        ? 'تایید می‌کنم ستون‌ها و مقادیر پیش‌نمایش بررسی شده و در ستون‌های صحیح قرار دارند.'
                        : 'I confirm that column mappings and values above have been reviewed and are accurate.'}
                  </span>
                </label>

                <button
                  type="button"
                  disabled={importing || (editedRows.length === 0 && (preview.parseRejectedRows?.length || 0) === 0) || !rowsConfirmed}
                  onClick={handleCommitImport}
                  className="h-9 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold disabled:opacity-50"
                >
                  {importing
                    ? isFa ? 'در حال ثبت...' : 'Importing...'
                    : isFa ? 'تأیید و ثبت اطلاعات در نرم‌افزار' : 'Confirm & Import Data'}
                </button>
              </div>
            </div>
          )}

          {importResult && (
            <div className="p-3.5 rounded-xl border border-[var(--status-success)] bg-[var(--status-success-bg)]/50 text-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                <span className="font-semibold tabular-nums">
                  {isFa
                    ? `نتیجه ثبت (${getScopeDisplayLabel(importResult.scope, true)}): ${importResult.imported.toLocaleString('fa-IR')} جدید · ${importResult.replaced.toLocaleString('fa-IR')} جایگزین‌شده · ${importResult.skipped.toLocaleString('fa-IR')} رد شده`
                    : `Import completed (${getScopeDisplayLabel(importResult.scope, false)}): ${importResult.imported} imported · ${importResult.replaced} replaced · ${importResult.skipped} skipped`}
                </span>
              </div>
              {((importResult.linkedGeneral || 0) + (importResult.linkedDetailed || 0) + (importResult.linkedTransit || 0) > 0) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-primary)] tabular-nums">
                  <Link2 className="w-3.5 h-3.5" />
                  {isFa
                    ? `ارتباط خودکار: کلی ${importResult.linkedGeneral || 0} · جزئیات ${importResult.linkedDetailed || 0} · در راه ${importResult.linkedTransit || 0}`
                    : `Cross-Linked: G ${importResult.linkedGeneral || 0} · D ${importResult.linkedDetailed || 0} · T ${importResult.linkedTransit || 0}`}
                </span>
              )}
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
                        ? `${pendingRejected.length.toLocaleString('fa-IR')} رکورد از فایل به دلایل زیر به دیتابیس اضافه نشدند`
                        : `${pendingRejected.length} record(s) from the uploaded file were rejected`}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] font-medium">
                    {isFa
                      ? 'با این داده‌های رد شده چه کار کنیم؟ می‌توانید دلیل هر ردیف را ببینید، فیلدهای آن را ویرایش کنید، به عنوان رکورد جدید به دیتابیس اضافه کنید، جایگزین کنید یا صرف‌نظر نمایید:'
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
                        {isFa ? 'جایگزینی موارد تکراری در دیتابیس' : 'Replace Duplicate DB Rows'}
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
                      {isFa ? 'افزودن همه به عنوان رکورد جدید به دیتابیس' : 'Force-Add All to Database'}
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
                              <span>{isFa ? 'افزودن به دیتابیس' : 'Add to DB'}</span>
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
                            {isFa ? 'رکورد مشابه موجود در دیتابیس: ' : 'Matching DB record: '}
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
