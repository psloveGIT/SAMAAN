import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  DEFAULT_PREFERENCES,
  getSessionCookie,
  hashPassword,
  requireRole,
  sanitizeUser,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './src/server/auth.ts';
import type { AuthedRequest, StoredUser } from './src/server/auth.ts';
import {
  detectCsvScope,
  inspectMatrixColumns,
  makeId,
  parseCsvMatrix,
  parseDetailedCsv,
  parseGeneralCsv,
  parseTransitCsv,
} from './src/server/csvImporter.ts';
import type { ImportScope } from './src/server/csvImporter.ts';
import { createEmptyCategories, normKey, projectManager, SamaanStore } from './src/server/store.ts';
import {
  computeDetailedEntry,
  computeSelectionFormulaSummary,
  getExpiringChemicals,
  isMerOpen,
  isRepOpen,
  normalizeIslandBucket,
  roundQty,
  toNum,
} from './src/shared/formulas.ts';
import { buildYearMonths, getMonthKeyFromIso, normalizeDigits } from './src/shared/jalali.ts';
import {
  collectUniquePackings,
  queryOpsDetailed,
  queryOpsGeneral,
  queryOpsTransit,
  slimDetailedForOps,
} from './src/shared/opsProjection.ts';
import {
  DEFAULT_TRANSIT_STATUSES,
  getTransitStatusOptions,
  inferItemClassification,
  normalizeCountingUnitToFa,
  normalizeTransitStatus,
} from './src/shared/normalizers.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from './src/shared/generalDescription.ts';
import { inferSizeFromDescription } from './src/shared/sizeExtractor.ts';
import { combineGcvRemark, GCV_PURCHASE_BY_OPTIONS } from './src/shared/gcv.ts';
import { buildDetailedMerDescription } from './src/shared/opiMinutes.ts';
import { extractEquipmentOffline } from './src/shared/smartExtractor.ts';
import { getLocalVersionPayload } from './src/shared/appVersion.ts';
import { computeOpenOpiInvitations } from './src/shared/opiInvitation.ts';
import { analyzeImportDelta, hasRecordMeaningfulChanges } from './src/shared/importDelta.ts';
import {
  applyCategoryDelete,
  applyCategoryRename,
  computeCategoryCounts,
  sanitizeCategoryStore,
} from './src/shared/categoryCascade.ts';
import {
  commitAutoWorkbook,
  commitOperationalFormImport,
  detectExtendedScope,
  EXTENDED_SCOPE_META,
  isOperationalScope,
  previewAutoWorkbook,
  previewOperationalFormImport,
  type AutoWorkbookSheetInput,
  type ExtendedImportScope,
} from './src/shared/operationalFormImport.ts';
import {
  captureAutoUndoState,
  commitAutoUndoDiff,
  resolveAutoUndoSpec,
  type HistoryChange,
} from './src/shared/undoHistory.ts';
import {
  buildActiveDupKeySets,
  buildTrashEntryDupKey,
  isTrashRestoreDuplicate,
} from './src/shared/trashRestore.ts';
import {
  matchesCustomFilters,
  matchesMultiPacking,
  parseCustomFiltersParam,
  parsePackingNosParam,
} from './src/shared/customFilters.ts';
import {
  buildDetailedDupKey,
  buildGeneralDupKey,
  buildTransitDupKey,
  buildTrashLinkedDetailedCounts,
  checkDateRangeMulti,
  collectDistinctColumnValues,
  compileColFilters,
  createGeneralDetailedLinker,
  matchesColFilters,
  matchesCompiledColFilters,
  matchesPackagePartial,
  matchesPreparedPackage,
  normDupPart,
  parseColFiltersParam,
  preparePackageInfo,
  projectTrashRowForQuery,
  resolveSiteEntryArrivalAndRelease,
  sortRowsByColumn,
} from './src/shared/tableQuery.ts';
import {
  aggregateWarehouseByField,
  getPackingListDetails,
  getWarehouseOverview,
  queryOperationalAlerts,
  searchWarehouseDocuments,
  searchWarehouseItems,
  type AggregateGroupBy,
  type DocumentSearchType,
  type OperationalAlertType,
  type SearchWarehouseItemsParams,
  type WarehouseQueryDb,
} from './src/shared/warehouseQueryTools.ts';
import { extractEntitySubjectFromQuestion } from './src/shared/localAiEngine.ts';
import { extractChemicalDatesFromTexts } from './src/shared/chemicalDates.ts';
import { isValidDigitsOnly } from './src/shared/validation.ts';
import {
  normalizeRepStatus,
  preserveMultilineText,
  validatePlantAbbreviation,
} from './src/shared/docNumbering.ts';
import {
  buildReplacementDetailedDescription,
  removeRefTokenFromList,
  stripSubstitutionBlockFromText,
} from './src/shared/substitution.ts';
import {
  appendMultilineLine,
  buildShortageReprocurementNote,
  buildSubstitutionReprocurementNote,
  shouldCloseShortage,
  shouldCloseSubstitution,
} from './src/shared/reprocurementMatch.ts';
import {
  buildMivLineRemark,
  computeMivStockDeduction,
  type MivStockSourcePreference,
} from './src/shared/miv.ts';
import {
  assertUniqueDocNo,
  getAllUsedDocNumbers,
  validateSignedScanPayload,
} from './src/shared/docUniqueness.ts';
import type {
  AuditLogEntry,
  CalendarMode,
  CategoryGroupKey,
  CustomFormSubmission,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  DeveloperEmployerRequest,
  DeveloperRequestAttachment,
  DocumentLineItem,
  EmployerCustomConfig,
  EmployerId,
  ErrorReportRecord,
  GcvDocumentRecord,
  GeneralEntry,
  ImportRejectedRecord,
  Language,
  MaterialEstimateRecord,
  MivDocType,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
  PeriodicInspectionRecord,
  PlantAbbreviationPosition,
  PurgeableSectionKey,
  DatabaseSectionSummaryItem,
  ReprocurementApplyPayload,
  ReprocurementApplyResponse,
  ShortageBackfillRecord,
  SignedScanAttachment,
  SignedScanCollectionKey,
  SiteEntryMinutesRecord,
  SubstitutionLineItem,
  SubstitutionRecord,
  TransitEntry,
  TrashRecord,
  UserPreferences,
  UserRole,
} from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

function reqLang(req: Request): Language {
  const h = String(req.headers['x-samaan-lang'] || '').toLowerCase();
  return h === 'en' ? 'en' : 'fa';
}

function errMsg(req: Request, fa: string, en: string): string {
  return reqLang(req) === 'en' ? en : fa;
}

function matchSearch(haystackParts: (string | number | null | undefined)[], q: string): boolean {
  if (!q) return true;
  const needle = normalizeDigits(q).toLowerCase().trim();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const combined = normalizeDigits(
    haystackParts.filter((p) => p !== null && p !== undefined && p !== '').join(' '),
  ).toLowerCase();
  return tokens.every((tok) => combined.includes(tok));
}

function inDateRange(isoDate: string, fromDate: string, toDate: string): boolean {
  return checkDateRangeMulti(isoDate, fromDate, toDate);
}

function appendUniqueRef(existing: string, nextRef: string): string {
  const cleanExisting = normKey(existing);
  const cleanNext = normKey(nextRef);
  if (!cleanNext) return cleanExisting;
  if (!cleanExisting) return cleanNext;
  const parts = cleanExisting.split(',').map((s) => s.trim());
  if (parts.includes(cleanNext)) return cleanExisting;
  return `${cleanExisting}, ${cleanNext}`;
}

function removeRefToken(existing: string, token: string): string {
  const cleanExisting = normKey(existing);
  const cleanToken = normKey(token);
  if (!cleanExisting || !cleanToken) return cleanExisting;
  const parts = cleanExisting
    .split(/[,،|]+/)
    .map((s) => normKey(s))
    .filter((s) => s && s !== cleanToken);
  return Array.from(new Set(parts)).join(', ');
}

function reverseMivDocument(s: SamaanStore, mivId: string): MivDocumentRecord | null {
  const idx = s.db.mivDocuments.findIndex((doc) => doc.id === mivId);
  if (idx === -1) return null;
  const [removed] = s.db.mivDocuments.splice(idx, 1);
  const now = new Date().toISOString();
  for (const oldLine of removed.items) {
    const d = s.db.detailed.find((x) => x.id === oldLine.detailedId);
    if (!d) continue;
    if (removed.docType === 'miv_contractor' || removed.docType === 'miv_mapna') {
      const hasSplit =
        typeof oldLine.deductedFromMapna === 'number' ||
        typeof oldLine.deductedFromContractor === 'number';
      const revMapna = hasSplit
        ? Math.max(0, roundQty(oldLine.deductedFromMapna || 0))
        : removed.docType === 'miv_mapna'
          ? oldLine.qty
          : 0;
      const revContractor = hasSplit
        ? Math.max(0, roundQty(oldLine.deductedFromContractor || 0))
        : removed.docType === 'miv_contractor'
          ? oldLine.qty
          : 0;

      if (revContractor > 0) {
        d.mivContractorQty = Math.max(0, roundQty(toNum(d.mivContractorQty) - revContractor));
        d.mivContractorNo = removeRefToken(d.mivContractorNo, removed.docNo);
        const remC = s.db.mivDocuments.find(
          (doc) =>
            (doc.docType === 'miv_contractor' || doc.docType === 'miv_mapna') &&
            doc.items.some(
              (it) =>
                it.detailedId === d.id &&
                (typeof it.deductedFromContractor === 'number'
                  ? it.deductedFromContractor > 0
                  : doc.docType === 'miv_contractor'),
            ),
        );
        if (d.mivContractorQty === 0 && !remC) d.mivContractorDate = '';
        else if (remC && d.mivContractorDate === removed.date) d.mivContractorDate = remC.date;
      }

      if (revMapna > 0) {
        d.mivMapnaQty = Math.max(0, roundQty(toNum(d.mivMapnaQty) - revMapna));
        d.mivMapnaNo = removeRefToken(d.mivMapnaNo, removed.docNo);
        const remM = s.db.mivDocuments.find(
          (doc) =>
            (doc.docType === 'miv_mapna' || doc.docType === 'miv_contractor') &&
            doc.items.some(
              (it) =>
                it.detailedId === d.id &&
                (typeof it.deductedFromMapna === 'number'
                  ? it.deductedFromMapna > 0
                  : doc.docType === 'miv_mapna'),
            ),
        );
        if (d.mivMapnaQty === 0 && !remM) d.mivMapnaDate = '';
        else if (remM && d.mivMapnaDate === removed.date) d.mivMapnaDate = remM.date;
      }
    } else if (removed.docType === 'smr_contractor') {
      d.smrContractorQty = Math.max(0, roundQty(toNum(d.smrContractorQty) - oldLine.qty));
      d.smrContractorNo = removeRefToken(d.smrContractorNo, removed.docNo);
      const rem = s.db.mivDocuments.find((doc) => doc.docType === 'smr_contractor' && doc.items.some((it) => it.detailedId === d.id));
      if (d.smrContractorQty === 0 && !rem) {
        d.smrContractorDate = '';
        if (d.smrContractorNote === removed.notes) d.smrContractorNote = '';
      } else if (rem && d.smrContractorDate === removed.date) {
        d.smrContractorDate = rem.date;
      }
    } else if (removed.docType === 'smr_mapna') {
      d.smrMapnaQty = Math.max(0, roundQty(toNum(d.smrMapnaQty) - oldLine.qty));
      d.smrMapnaNo = removeRefToken(d.smrMapnaNo, removed.docNo);
      const rem = s.db.mivDocuments.find((doc) => doc.docType === 'smr_mapna' && doc.items.some((it) => it.detailedId === d.id));
      if (d.smrMapnaQty === 0 && !rem) {
        d.smrMapnaDate = '';
        if (d.smrMapnaNote === removed.notes) d.smrMapnaNote = '';
      } else if (rem && d.smrMapnaDate === removed.date) {
        d.smrMapnaDate = rem.date;
      }
    }
    if (removed.docType === 'miv_contractor' || removed.docType === 'miv_mapna') {
      const remReceivers = Array.from(
        new Set(
          s.db.mivDocuments
            .filter((doc) => (doc.docType === 'miv_contractor' || doc.docType === 'miv_mapna') && doc.items.some((it) => it.detailedId === d.id))
            .map((doc) => normKey(doc.receiver || doc.party))
            .filter(Boolean),
        ),
      );
      d.mivReceiver = remReceivers.join(' , ');
    } else if (removed.docType === 'smr_contractor' || removed.docType === 'smr_mapna') {
      const remDeliverers = Array.from(
        new Set(
          s.db.mivDocuments
            .filter((doc) => (doc.docType === 'smr_contractor' || doc.docType === 'smr_mapna') && doc.items.some((it) => it.detailedId === d.id))
            .map((doc) => normKey(doc.deliveredBy))
            .filter(Boolean),
        ),
      );
      d.smrDeliverer = remDeliverers.join(' , ');
    }
    d.updatedAt = now;
  }
  return removed;
}

const ERROR_REPORTS_FILE = path.resolve(process.cwd(), 'data', 'samaan-error-reports.json');
const EMPLOYER_REQUESTS_FILE = path.resolve(process.cwd(), 'data', 'samaan-employer-requests.json');
const DEVELOPER_OUTBOX_FILE = path.resolve(process.cwd(), 'data', 'samaan-developer-outbox.json');
const ALLOWED_DEV_REQUEST_EXTS = new Set([
  '.xlsx', '.xls', '.xlsm', '.csv', '.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt',
]);

interface DeveloperOutboxEntry {
  id: string;
  kind: 'employer_request' | 'error_report';
  refId: string;
  subject: string;
  text: string;
  attachmentNames: string[];
  createdAt: string;
  deliveryStatus: 'sent' | 'queued';
  providerMessageId?: string;
}

function loadDeveloperOutboxFromDisk(): DeveloperOutboxEntry[] {
  try {
    if (!fs.existsSync(DEVELOPER_OUTBOX_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(DEVELOPER_OUTBOX_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as DeveloperOutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function saveDeveloperOutboxToDisk(entries: DeveloperOutboxEntry[]): void {
  try {
    const dir = path.dirname(DEVELOPER_OUTBOX_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${DEVELOPER_OUTBOX_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries.slice(0, 200)), 'utf8');
    fs.renameSync(tmp, DEVELOPER_OUTBOX_FILE);
  } catch (err) {
    console.error('Failed to persist developer outbox:', err);
  }
}

/**
 * Internal server-side developer dispatch.
 * Recipient email and mail provider API keys live ONLY on the server and are NEVER returned to clients.
 */
function dispatchInternalDeveloperEmail(payload: {
  kind: 'employer_request' | 'error_report';
  refId: string;
  subject: string;
  text: string;
  attachments?: Array<{ fileName: string; dataBase64: string }>;
}): void {
  const now = new Date().toISOString();
  const entry: DeveloperOutboxEntry = {
    id: makeId(),
    kind: payload.kind,
    refId: payload.refId,
    subject: payload.subject.slice(0, 240),
    text: payload.text.slice(0, 12000),
    attachmentNames: (payload.attachments || []).map((a) => a.fileName).slice(0, 5),
    createdAt: now,
    deliveryStatus: 'queued',
  };

  const existing = loadDeveloperOutboxFromDisk();
  existing.unshift(entry);
  saveDeveloperOutboxToDisk(existing);

  const notifyTo = String(process.env.DEVELOPER_NOTIFY_EMAIL || 'Mohammad.Reza.Zoghi@gmail.com').trim();
  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  const mailFrom = String(process.env.MAIL_FROM || 'SAMAAN System <onboarding@resend.dev>').trim();

  if (!notifyTo || !resendKey) {
    return;
  }

  void fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [notifyTo],
      subject: entry.subject,
      text: entry.text,
      attachments: (payload.attachments || []).slice(0, 5).map((att) => ({
        filename: att.fileName,
        content: att.dataBase64,
      })),
    }),
  })
    .then(async (resp) => {
      if (!resp.ok) return;
      const body = (await resp.json().catch(() => ({}))) as { id?: string };
      const list = loadDeveloperOutboxFromDisk();
      const target = list.find((e) => e.id === entry.id);
      if (target) {
        target.deliveryStatus = 'sent';
        if (body.id) target.providerMessageId = String(body.id);
        saveDeveloperOutboxToDisk(list);
      }
    })
    .catch(() => {
      // Kept safely queued in server outbox
    });
}

function loadErrorReportsFromDisk(): ErrorReportRecord[] {
  try {
    if (!fs.existsSync(ERROR_REPORTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(ERROR_REPORTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ErrorReportRecord[]) : [];
  } catch {
    return [];
  }
}

function saveErrorReportsToDisk(reports: ErrorReportRecord[]): void {
  try {
    const dir = path.dirname(ERROR_REPORTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${ERROR_REPORTS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(reports.slice(0, 200)), 'utf8');
    fs.renameSync(tmp, ERROR_REPORTS_FILE);
  } catch (err) {
    console.error('Failed to persist error reports:', err);
  }
}

function loadEmployerRequestsFromDisk(): DeveloperEmployerRequest[] {
  try {
    if (!fs.existsSync(EMPLOYER_REQUESTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(EMPLOYER_REQUESTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as DeveloperEmployerRequest[]) : [];
  } catch {
    return [];
  }
}

function saveEmployerRequestsToDisk(requests: DeveloperEmployerRequest[]): void {
  try {
    const dir = path.dirname(EMPLOYER_REQUESTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${EMPLOYER_REQUESTS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(requests.slice(0, 150)), 'utf8');
    fs.renameSync(tmp, EMPLOYER_REQUESTS_FILE);
  } catch (err) {
    console.error('Failed to persist employer requests:', err);
  }
}

function sanitizeRequestAttachments(raw: unknown): DeveloperRequestAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: DeveloperRequestAttachment[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Partial<DeveloperRequestAttachment>;
    const rawName = String(a.fileName || '').replace(/[/\\:*?"<>|\0]+/g, '_').trim();
    if (!rawName) continue;
    const ext = path.extname(rawName).toLowerCase();
    if (!ALLOWED_DEV_REQUEST_EXTS.has(ext)) continue;
    const b64 = typeof a.dataBase64 === 'string' ? a.dataBase64.trim() : '';
    if (!b64 || b64.length > 6_000_000) continue; // ~4.5MB max base64
    out.push({
      id: normKey(a.id) || makeId(),
      fileName: rawName.slice(0, 140),
      mimeType: normKey(a.mimeType).slice(0, 120) || 'application/octet-stream',
      sizeBytes: Number.isFinite(Number(a.sizeBytes)) ? Math.max(0, Math.min(5_000_000, Number(a.sizeBytes))) : Math.floor((b64.length * 3) / 4),
      dataBase64: b64,
    });
  }
  return out;
}

const projectAsyncStorage = new AsyncLocalStorage<SamaanStore>();

function activeProjectStore(): SamaanStore {
  return projectAsyncStorage.getStore() || projectManager.getStore('default');
}

const store = new Proxy({} as SamaanStore, {
  get(_target, prop) {
    const s = activeProjectStore();
    const val = Reflect.get(s, prop, s);
    return typeof val === 'function' ? val.bind(s) : val;
  },
  set(_target, prop, value) {
    return Reflect.set(activeProjectStore(), prop, value);
  },
});

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  // Resolve active project store from X-Samaan-Project header and attach authenticated user
  app.use((req: AuthedRequest, res, next) => {
    const rawProject = String(req.headers['x-samaan-project'] || '').trim();
    const reqStore = projectManager.getStore(rawProject || 'default');
    projectAsyncStorage.run(reqStore, () => {
      const token = getSessionCookie(req);
      if (token) {
        const parsed =
          verifySessionToken(token, projectManager.getAuthSecret()) ||
          verifySessionToken(token, reqStore.db.sessionSecret);
        if (parsed) {
          const found =
            reqStore.db.users.find((u) => u.id === parsed.uid && u.active) ||
            (parsed.uname
              ? reqStore.db.users.find(
                  (u) => u.username.toLowerCase() === parsed.uname!.toLowerCase() && u.active,
                )
              : undefined);
          if (found) req.currentUser = found;
        }
      }
      const autoUndoSpec = resolveAutoUndoSpec(req.method, req.path);
      if (autoUndoSpec && req.currentUser && ['admin', 'operator'].includes(req.currentUser.role)) {
        const snapshot = captureAutoUndoState(reqStore.db, reqStore.history, autoUndoSpec);
        const origJson = res.json.bind(res);
        let committed = false;
        const finalizeUndo = () => {
          if (committed) return;
          committed = true;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            commitAutoUndoDiff(
              reqStore.db,
              reqStore.history,
              snapshot,
              req.currentUser?.fullName || req.currentUser?.username || 'system',
            );
          }
        };
        res.json = ((body: unknown) => {
          finalizeUndo();
          return origJson(body);
        }) as typeof res.json;
        res.on('finish', finalizeUndo);
      }
      next();
    });
  });

  // ---------------- APP VERSION & RELEASE NOTES ----------------
  app.get('/api/app/version', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(getLocalVersionPayload());
  });

  // ---------------- PROJECTS (MULTI-DATABASE SWITCHER) ----------------
  app.get('/api/projects', (req: Request, res: Response) => {
    const rawProject = String(req.headers['x-samaan-project'] || '').trim();
    const activeProjectId = projectManager.resolveProjectId(rawProject);
    res.json({
      projects: projectManager.listProjects(),
      activeProjectId,
    });
  });

  app.post('/api/projects', (req: AuthedRequest, res: Response) => {
    const {
      name,
      code,
      contractRef,
      employerId,
      employerConfig,
      plantAbbreviation,
      usePlantAbbreviationInDocs,
      plantAbbreviationPosition,
      copyUsers,
    } = req.body as {
      name?: string;
      code?: string;
      contractRef?: string;
      employerId?: EmployerId;
      employerConfig?: EmployerCustomConfig;
      plantAbbreviation?: string;
      usePlantAbbreviationInDocs?: boolean;
      plantAbbreviationPosition?: PlantAbbreviationPosition;
      copyUsers?: boolean;
    };
    const cleanName = normKey(name);
    if (!cleanName) {
      res.status(400).json({ error: errMsg(req, 'نام پروژه الزامی است', 'Project name is required') });
      return;
    }
    const abbrCheck = validatePlantAbbreviation(plantAbbreviation);
    if (!abbrCheck.valid) {
      res.status(400).json({
        error: errMsg(
          req,
          abbrCheck.errorFa || 'مخفف نیروگاه نامعتبر است',
          abbrCheck.errorEn || 'Invalid plant abbreviation',
        ),
      });
      return;
    }
    if (projectManager.listProjects().some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      res.status(409).json({ error: errMsg(req, 'پروژه‌ای با این نام قبلاً ثبت شده است', 'A project with this name already exists') });
      return;
    }
    const shouldCopyUsers = Boolean(copyUsers && req.currentUser);
    const created = projectManager.createProject({
      name: cleanName,
      code,
      contractRef,
      employerId,
      employerConfig,
      plantAbbreviation: abbrCheck.normalized,
      usePlantAbbreviationInDocs: Boolean(usePlantAbbreviationInDocs && abbrCheck.normalized),
      plantAbbreviationPosition,
      copyUsersFromStore: shouldCopyUsers ? activeProjectStore() : null,
    });
    res.json({ project: created, projects: projectManager.listProjects() });
  });

  app.patch('/api/projects/:id', (req: AuthedRequest, res: Response) => {
    const targetStore = projectManager.getStore(req.params.id);
    const hasUsers = targetStore.db.users.length > 0;
    if (hasUsers && (!req.currentUser || !['admin', 'operator'].includes(req.currentUser.role))) {
      res.status(req.currentUser ? 403 : 401).json({
        error: errMsg(req, 'دسترسی برای ویرایش پروژه مجاز نیست', 'Permission denied to update project'),
      });
      return;
    }
    const {
      name,
      code,
      contractRef,
      employerId,
      employerConfig,
      plantAbbreviation,
      usePlantAbbreviationInDocs,
      plantAbbreviationPosition,
    } = req.body as {
      name?: string;
      code?: string;
      contractRef?: string;
      employerId?: EmployerId;
      employerConfig?: EmployerCustomConfig;
      plantAbbreviation?: string;
      usePlantAbbreviationInDocs?: boolean;
      plantAbbreviationPosition?: PlantAbbreviationPosition;
    };
    const existing = projectManager.getProject(req.params.id);
    if (!existing) {
      res.status(404).json({ error: errMsg(req, 'پروژه یافت نشد', 'Project not found') });
      return;
    }
    const cleanName = name !== undefined ? normKey(name) : existing.name;
    if (!cleanName) {
      res.status(400).json({ error: errMsg(req, 'نام پروژه الزامی است', 'Project name is required') });
      return;
    }
    if (plantAbbreviation !== undefined) {
      const abbrCheck = validatePlantAbbreviation(plantAbbreviation);
      if (!abbrCheck.valid) {
        res.status(400).json({
          error: errMsg(
            req,
            abbrCheck.errorFa || 'مخفف نیروگاه نامعتبر است',
            abbrCheck.errorEn || 'Invalid plant abbreviation',
          ),
        });
        return;
      }
    }
    const updated = projectManager.renameProject(req.params.id, {
      name: cleanName,
      code,
      contractRef,
      employerId,
      employerConfig,
      plantAbbreviation,
      usePlantAbbreviationInDocs,
      plantAbbreviationPosition,
    });
    if (!updated) {
      res.status(404).json({ error: errMsg(req, 'پروژه یافت نشد', 'Project not found') });
      return;
    }
    res.json({ project: updated, projects: projectManager.listProjects() });
  });

  app.delete('/api/projects/:id', (req: AuthedRequest, res: Response) => {
    const targetStore = projectManager.getStore(req.params.id);
    const hasUsers = targetStore.db.users.length > 0;
    if (hasUsers && (!req.currentUser || req.currentUser.role !== 'admin')) {
      res.status(req.currentUser ? 403 : 401).json({
        error: errMsg(req, 'حذف پروژه دارای کاربر فقط توسط مدیر کل مجاز است', 'Only administrators can delete an initialized project'),
      });
      return;
    }
    const result = projectManager.deleteProject(req.params.id);
    if (!result.ok) {
      if (result.reason === 'cannot_delete_default') {
        res.status(400).json({
          error: errMsg(req, 'پروژه پیش‌فرض قابل حذف نیست (می‌توانید نام آن را ویرایش کنید)', 'Default project cannot be deleted (you can rename it)'),
        });
        return;
      }
      res.status(404).json({ error: errMsg(req, 'پروژه یافت نشد', 'Project not found') });
      return;
    }
    res.json({ ok: true, projects: projectManager.listProjects() });
  });

  // ---------------- EMPLOYERS & CUSTOM FORM DESIGN STUDIO ----------------
  app.get('/api/employers', (_req: Request, res: Response) => {
    res.json({ employers: projectManager.listEmployers() });
  });

  app.post('/api/employers', (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    if (store.db.users.length > 0 && (!req.currentUser || !['admin', 'operator'].includes(req.currentUser.role))) {
      res.status(req.currentUser ? 403 : 401).json({
        error: errMsg(req, 'دسترسی برای ایجاد کارفرما مجاز نیست', 'Permission denied to create employer'),
      });
      return;
    }
    const created = projectManager.createEmployer(req.body);
    if (!created) {
      res.status(400).json({ error: errMsg(req, 'نام کارفرما الزامی است', 'Employer name is required') });
      return;
    }
    res.json({ employer: created, employers: projectManager.listEmployers() });
  });

  app.patch('/api/employers/:id', (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    if (store.db.users.length > 0 && (!req.currentUser || !['admin', 'operator'].includes(req.currentUser.role))) {
      res.status(req.currentUser ? 403 : 401).json({
        error: errMsg(req, 'دسترسی برای ویرایش کارفرما مجاز نیست', 'Permission denied to update employer'),
      });
      return;
    }
    const updated = projectManager.updateEmployer(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: errMsg(req, 'کارفرما یافت نشد یا نام آن نامعتبر است', 'Employer not found or invalid data') });
      return;
    }
    res.json({ employer: updated, employers: projectManager.listEmployers() });
  });

  // ---------------- ERROR REPORTS & CRASH DIAGNOSTICS ----------------
  app.get('/api/error-reports', (_req: AuthedRequest, res: Response) => {
    res.json({ reports: loadErrorReportsFromDisk() });
  });

  app.post('/api/error-reports', (req: AuthedRequest, res: Response) => {
    const raw = (req.body || {}) as Partial<ErrorReportRecord>;
    const desc = preserveMultilineText(raw.description);
    if (!desc) {
      res.status(400).json({
        error: errMsg(req, 'شرح خطا الزامی است', 'Error description is required'),
      });
      return;
    }
    const now = new Date().toISOString();
    const record: ErrorReportRecord = {
      id: normKey(raw.id) || makeId(),
      createdAt: normKey(raw.createdAt) || now,
      title: normKey(raw.title) || desc.slice(0, 60),
      category: raw.category || 'bug',
      section: normKey(raw.section) || 'general',
      severity: raw.severity || 'medium',
      description: desc.slice(0, 4000),
      stepsToReproduce: preserveMultilineText(raw.stepsToReproduce).slice(0, 2000) || undefined,
      attachLogs: Boolean(raw.attachLogs),
      logs: Array.isArray(raw.logs) ? raw.logs.slice(0, 200) : undefined,
      projectName: normKey(raw.projectName) || undefined,
      username: normKey(raw.username) || req.currentUser?.username || undefined,
      appVersion: normKey(raw.appVersion) || undefined,
      userAgent: normKey(raw.userAgent) || String(req.headers['user-agent'] || '').slice(0, 300),
      viewport: normKey(raw.viewport) || undefined,
      syncedToServer: true,
      syncedAt: now,
    };
    const existing = loadErrorReportsFromDisk().filter((r) => r.id !== record.id);
    existing.unshift(record);
    saveErrorReportsToDisk(existing);
    dispatchInternalDeveloperEmail({
      kind: 'error_report',
      refId: record.id,
      subject: `[SAMAAN Error Report] ${record.title} (${record.severity})`,
      text: [
        `Title: ${record.title}`,
        `Category: ${record.category} | Severity: ${record.severity} | Section: ${record.section}`,
        `Project: ${record.projectName || '-'} | User: ${record.username || '-'} | Version: ${record.appVersion || '-'}`,
        '',
        record.description,
        record.stepsToReproduce ? `\nSteps:\n${record.stepsToReproduce}` : '',
      ].join('\n'),
    });
    res.json({ ok: true, report: record, syncedAt: now });
  });

  // ---------------- DEVELOPER EMPLOYER & FORM REQUESTS ----------------
  app.get('/api/employer-requests', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const all = loadEmployerRequestsFromDisk();
    if (req.currentUser?.role === 'admin') {
      res.json({ requests: all });
      return;
    }
    const uid = req.currentUser?.id;
    res.json({ requests: all.filter((r) => uid && r.submittedByUserId === uid) });
  });

  app.post('/api/employer-requests', (req: AuthedRequest, res: Response) => {
    const raw = (req.body || {}) as Partial<DeveloperEmployerRequest>;
    const requesterName = normKey(raw.requesterName).slice(0, 120);
    const requesterPhone = normKey(raw.requesterPhone).slice(0, 40);
    if (!requesterName || !requesterPhone) {
      res.status(400).json({
        error: errMsg(
          req,
          'نام و شماره تماس درخواست‌کننده الزامی است.',
          'Requester name and phone number are required.',
        ),
      });
      return;
    }
    const requestType: 'missing_form' | 'new_employer' =
      raw.requestType === 'new_employer' ? 'new_employer' : 'missing_form';
    const newEmployerNameFa = normKey(raw.newEmployerNameFa).slice(0, 160);
    if (requestType === 'new_employer' && !newEmployerNameFa) {
      res.status(400).json({
        error: errMsg(
          req,
          'نام کارفرمای جدید الزامی است.',
          'New employer name is required.',
        ),
      });
      return;
    }

    const now = new Date().toISOString();
    const record: DeveloperEmployerRequest = {
      id: normKey(raw.id) || makeId(),
      createdAt: normKey(raw.createdAt) || now,
      requestType,
      targetEmployerId: normKey(raw.targetEmployerId).slice(0, 80) || undefined,
      targetEmployerName: normKey(raw.targetEmployerName).slice(0, 160) || undefined,
      sectionKeys: Array.isArray(raw.sectionKeys)
        ? raw.sectionKeys.map((s) => normKey(String(s)).slice(0, 40)).filter(Boolean).slice(0, 20)
        : [],
      requesterName,
      requesterRole: normKey(raw.requesterRole).slice(0, 120) || undefined,
      requesterPhone,
      requesterEmail: normKey(raw.requesterEmail).slice(0, 140) || undefined,
      projectName: normKey(raw.projectName).slice(0, 160) || undefined,
      newEmployerNameFa: newEmployerNameFa || undefined,
      newEmployerNameEn: normKey(raw.newEmployerNameEn).slice(0, 160) || undefined,
      newEmployerShortName: normKey(raw.newEmployerShortName).slice(0, 40) || undefined,
      newEmployerAddress: preserveMultilineText(raw.newEmployerAddress).slice(0, 400) || undefined,
      newEmployerPhone: normKey(raw.newEmployerPhone).slice(0, 40) || undefined,
      newEmployerFax: normKey(raw.newEmployerFax).slice(0, 40) || undefined,
      newEmployerPostalCode: normKey(raw.newEmployerPostalCode).slice(0, 20) || undefined,
      newEmployerEmail: normKey(raw.newEmployerEmail).slice(0, 140) || undefined,
      newEmployerSocials: normKey(raw.newEmployerSocials).slice(0, 200) || undefined,
      description: preserveMultilineText(raw.description).slice(0, 3000) || undefined,
      attachments: sanitizeRequestAttachments(raw.attachments),
      submittedByUserId: req.currentUser?.id,
      submittedByUsername: req.currentUser?.username,
      appVersion: normKey(raw.appVersion).slice(0, 40) || undefined,
      syncedToServer: true,
    };

    const existing = loadEmployerRequestsFromDisk().filter((r) => r.id !== record.id);
    existing.unshift(record);
    saveEmployerRequestsToDisk(existing);
    dispatchInternalDeveloperEmail({
      kind: 'employer_request',
      refId: record.id,
      subject:
        record.requestType === 'new_employer'
          ? `[SAMAAN] درخواست تعریف کارفرمای جدید: ${record.newEmployerNameFa || '-'}`
          : `[SAMAAN] درخواست فرم کارفرما: ${record.targetEmployerName || '-'}`,
      text: [
        `نوع درخواست: ${record.requestType}`,
        `درخواست‌کننده: ${record.requesterName} (${record.requesterPhone})`,
        record.requesterRole ? `سمت: ${record.requesterRole}` : '',
        record.requesterEmail ? `ایمیل درخواست‌کننده: ${record.requesterEmail}` : '',
        record.projectName ? `پروژه: ${record.projectName}` : '',
        record.targetEmployerName ? `کارفرمای مقصد: ${record.targetEmployerName}` : '',
        record.newEmployerNameFa ? `نام کارفرمای جدید: ${record.newEmployerNameFa}` : '',
        record.sectionKeys.length ? `بخش‌ها: ${record.sectionKeys.join(', ')}` : '',
        record.description ? `\nتوضیحات:\n${record.description}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      attachments: record.attachments.map((att) => ({
        fileName: att.fileName,
        dataBase64: att.dataBase64,
      })),
    });
    res.json({ ok: true, request: record });
  });

  app.delete('/api/employer-requests/:id', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const existing = loadEmployerRequestsFromDisk();
    const next = existing.filter((r) => r.id !== req.params.id);
    if (next.length === existing.length) {
      res.status(404).json({ error: errMsg(req, 'درخواست یافت نشد', 'Request not found') });
      return;
    }
    saveEmployerRequestsToDisk(next);
    res.json({ ok: true });
  });

  app.delete('/api/employers/:id', (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    if (store.db.users.length > 0 && (!req.currentUser || req.currentUser.role !== 'admin')) {
      res.status(req.currentUser ? 403 : 401).json({
        error: errMsg(req, 'حذف کارفرما فقط توسط مدیر کل مجاز است', 'Only administrators can delete an employer'),
      });
      return;
    }
    const result = projectManager.deleteEmployer(req.params.id);
    if (!result.ok) {
      if (result.reason === 'cannot_delete_builtin') {
        res.status(400).json({
          error: errMsg(
            req,
            'کارفرماهای پیش‌فرض سامانه قابل حذف نیستند',
            'Built-in default employers cannot be deleted',
          ),
        });
        return;
      }
      res.status(404).json({ error: errMsg(req, 'کارفرما یافت نشد', 'Employer not found') });
      return;
    }
    res.json({ ok: true, employers: projectManager.listEmployers(), projects: projectManager.listProjects() });
  });

  // ---------------- CUSTOM EMPLOYER FORM SUBMISSIONS ----------------
  app.get('/api/custom-forms', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    const formIdFilter = normKey(String(req.query.formId || ''));
    const q = normKey(String(req.query.q || ''));
    const compact = String(req.query.compact || '') === '1';
    const packingFilter = normKey(String(req.query.packing || ''));
    const limit = Math.min(500, Math.max(10, Number(req.query.limit || 120) || 120));
    const submissions = (store.db.customFormSubmissions || []).filter((sub) => {
      if (formIdFilter && sub.formId !== formIdFilter) return false;
      if (q) {
        return matchSearch([sub.formTitle, sub.docNo, sub.packingListNo, sub.notes, ...Object.values(sub.fieldValues || {})], q);
      }
      return true;
    });
    const packings = collectUniquePackings(store.db.general, store.db.detailed);
    const generalEntries = compact
      ? queryOpsGeneral(store.db.general, { compact: true, packing: packingFilter, limit })
      : [...store.db.general].reverse();
    const detailedItems = compact
      ? queryOpsDetailed(store.getDetailedComputedList(), { compact: true, packing: packingFilter, limit })
      : [...store.getDetailedComputedList()].reverse().map(slimDetailedForOps);
    res.json({
      submissions: [...submissions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      generalEntries,
      detailedItems,
      packings,
    });
  });

  app.post('/api/custom-forms', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    const body = req.body as Partial<CustomFormSubmission>;
    const formId = normKey(body.formId);
    const formTitle = normKey(body.formTitle);
    const docNo = normKey(body.docNo);
    const date = normKey(body.date);
    if (!formId || !docNo) {
      res.status(400).json({ error: errMsg(req, 'فرم و شماره سند الزامی است', 'Form ID and document number are required') });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, docNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }
    const now = new Date().toISOString();
    const record: CustomFormSubmission = {
      id: makeId(),
      formId,
      formTitle: formTitle || formId,
      docNo,
      date: date || now.slice(0, 10),
      packingListNo: normKey(body.packingListNo),
      fieldValues: body.fieldValues && typeof body.fieldValues === 'object' ? body.fieldValues : {},
      rows: Array.isArray(body.rows) ? body.rows : [],
      notes: normKey(body.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };
    if (!store.db.customFormSubmissions) store.db.customFormSubmissions = [];
    store.db.customFormSubmissions.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_CUSTOM_FORM',
      scope: 'customForm',
      targetId: record.id,
      summary: `ثبت فرم اختصاصی «${record.formTitle}» به شماره ${record.docNo}`,
    });
    store.saveImmediate();
    res.json({ submission: record });
  });

  app.patch('/api/custom-forms/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    const list = store.db.customFormSubmissions || [];
    const target = list.find((s) => s.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: errMsg(req, 'سند یافت نشد', 'Submission not found') });
      return;
    }
    const body = req.body as Partial<CustomFormSubmission>;
    if (body.docNo !== undefined) {
      const nextDocNo = normKey(body.docNo);
      const uniqCheck = assertUniqueDocNo(store.db, nextDocNo, { excludeScope: 'customForms', excludeId: target.id });
      if (!uniqCheck.ok) {
        res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
        return;
      }
      target.docNo = nextDocNo;
    }
    if (body.date !== undefined) target.date = normKey(body.date);
    if (body.packingListNo !== undefined) target.packingListNo = normKey(body.packingListNo);
    if (body.fieldValues && typeof body.fieldValues === 'object') target.fieldValues = body.fieldValues;
    if (Array.isArray(body.rows)) target.rows = body.rows;
    if (body.notes !== undefined) target.notes = normKey(body.notes);
    target.updatedAt = new Date().toISOString();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_CUSTOM_FORM',
      scope: 'customForm',
      targetId: target.id,
      summary: `ویرایش فرم اختصاصی «${target.formTitle}» به شماره ${target.docNo}`,
    });
    store.saveImmediate();
    res.json({ submission: target });
  });

  app.delete('/api/custom-forms/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const store = activeProjectStore();
    const list = store.db.customFormSubmissions || [];
    const idx = list.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'سند یافت نشد', 'Submission not found') });
      return;
    }
    const [removed] = list.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_CUSTOM_FORM',
      scope: 'customForm',
      targetId: removed.id,
      summary: `حذف فرم اختصاصی «${removed.formTitle}» به شماره ${removed.docNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- HEALTH CHECK ----------------
  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true });
  });

  // ---------------- AUTH & PREFERENCES ----------------
  app.get('/api/auth/status', (req: AuthedRequest, res: Response) => {
    res.json({
      needsSetup: store.db.users.length === 0,
      user: req.currentUser ? sanitizeUser(req.currentUser) : null,
    });
  });

  app.post('/api/auth/setup', (req: Request, res: Response) => {
    if (store.db.users.length > 0) {
      res.status(400).json({ error: errMsg(req, 'سامانه قبلاً راه‌اندازی شده است', 'System is already initialized') });
      return;
    }
    const { username, password, fullName, preferences } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      preferences?: Partial<UserPreferences>;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password || password.length < 4) {
      res.status(400).json({
        error: errMsg(req, 'نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
      });
      return;
    }
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username: cleanUser,
      fullName: (fullName || cleanUser).trim(),
      role: 'admin',
      active: true,
      passwordHash: hashPassword(password),
      preferences: { ...DEFAULT_PREFERENCES, ...(preferences || {}) },
      createdAt: new Date().toISOString(),
    };
    store.db.users.push(newUser);
    store.addAudit({
      user: sanitizeUser(newUser),
      action: 'INITIAL_ADMIN_SETUP',
      scope: 'auth',
      targetId: newUser.id,
      summary: `راه‌اندازی اولیه سیستم و ایجاد مدیر کل (${newUser.username})`,
    });
    store.saveImmediate();
    const token = signSessionToken(newUser.id, projectManager.getAuthSecret(), newUser.username);
    setSessionCookie(res, token, req);
    res.json({ user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const cleanUser = (username || '').trim().toLowerCase();
    const found = store.db.users.find((u) => u.username.toLowerCase() === cleanUser);
    if (!found || !found.active || !password || !verifyPassword(password, found.passwordHash)) {
      res.status(401).json({ error: errMsg(req, 'نام کاربری یا رمز عبور اشتباه است', 'Invalid username or password') });
      return;
    }
    found.lastLoginAt = new Date().toISOString();
    store.addAudit({
      user: sanitizeUser(found),
      action: 'LOGIN',
      scope: 'auth',
      targetId: found.id,
      summary: `ورود کاربر ${found.fullName} (${found.username})`,
    });
    store.saveImmediate();
    const token = signSessionToken(found.id, projectManager.getAuthSecret(), found.username);
    setSessionCookie(res, token, req);
    res.json({ user: sanitizeUser(found) });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res: Response) => {
    if (req.currentUser) {
      store.addAudit({
        user: sanitizeUser(req.currentUser),
        action: 'LOGOUT',
        scope: 'auth',
        targetId: req.currentUser.id,
        summary: `خروج کاربر ${req.currentUser.fullName} (${req.currentUser.username})`,
      });
      store.saveImmediate();
    }
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.patch('/api/auth/preferences', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const prefs = req.body as Partial<UserPreferences>;
    const nextShortcuts =
      prefs.shortcuts && typeof prefs.shortcuts === 'object'
        ? Object.fromEntries(
            Object.entries(prefs.shortcuts)
              .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
              .slice(0, 60),
          )
        : undefined;
    user.preferences = {
      ...user.preferences,
      ...(prefs.language ? { language: prefs.language } : {}),
      ...(prefs.calendar ? { calendar: prefs.calendar } : {}),
      ...(prefs.theme ? { theme: prefs.theme } : {}),
      ...(typeof prefs.eyeComfort === 'boolean' ? { eyeComfort: prefs.eyeComfort } : {}),
      ...(typeof prefs.spellCheck === 'boolean' ? { spellCheck: prefs.spellCheck } : {}),
      ...(nextShortcuts !== undefined ? { shortcuts: nextShortcuts } : {}),
    };
    store.saveImmediate();
    res.json({ user: sanitizeUser(user) });
  });

  // ---------------- UNDO / REDO HISTORY (بازگردانی و انجام مجدد) ----------------
  app.get('/api/history/status', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json(store.history.getStatus());
  });

  app.post('/api/history/undo', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const result = store.applyHistoryAction('undo', sanitizeUser(req.currentUser!));
    if (!result) {
      res.status(400).json({
        error: errMsg(req, 'عملیاتی برای بازگردانی وجود ندارد.', 'Nothing to undo.'),
        status: store.history.getStatus(),
      });
      return;
    }
    res.json({ ok: true, undone: { labelFa: result.labelFa, labelEn: result.labelEn }, status: result.status });
  });

  app.post('/api/history/redo', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const result = store.applyHistoryAction('redo', sanitizeUser(req.currentUser!));
    if (!result) {
      res.status(400).json({
        error: errMsg(req, 'عملیاتی برای انجام مجدد وجود ندارد.', 'Nothing to redo.'),
        status: store.history.getStatus(),
      });
      return;
    }
    res.json({ ok: true, redone: { labelFa: result.labelFa, labelEn: result.labelEn }, status: result.status });
  });

  app.post('/api/auth/change-password', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: errMsg(req, 'رمز عبور فعلی صحیح نیست', 'Current password is incorrect') });
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: errMsg(req, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد', 'New password must be at least 4 characters') });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    store.addAudit({
      user: sanitizeUser(user),
      action: 'CHANGE_OWN_PASSWORD',
      scope: 'auth',
      targetId: user.id,
      summary: `تغییر رمز عبور توسط کاربر ${user.fullName} (${user.username})`,
    });
    store.saveImmediate();
    res.json({ ok: true, user: sanitizeUser(user) });
  });

  // ---------------- USERS (ADMIN ONLY) ----------------
  app.get('/api/users', requireRole(['admin']), (_req: AuthedRequest, res: Response) => {
    res.json({ users: store.db.users.map(sanitizeUser) });
  });

  app.post('/api/users', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const { username, password, fullName, role, active, mustChangePassword } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
      active?: boolean;
      mustChangePassword?: boolean;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password || password.length < 4) {
      res.status(400).json({
        error: errMsg(req, 'نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
      });
      return;
    }
    if (store.db.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      res.status(409).json({ error: errMsg(req, 'نام کاربری تکراری است', 'Username already exists') });
      return;
    }
    const created: StoredUser = {
      id: crypto.randomUUID(),
      username: cleanUser,
      fullName: (fullName || cleanUser).trim(),
      role: role || 'operator',
      active: typeof active === 'boolean' ? active : true,
      mustChangePassword: Boolean(mustChangePassword),
      passwordHash: hashPassword(password),
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: new Date().toISOString(),
    };
    store.db.users.push(created);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_USER',
      scope: 'user',
      targetId: created.id,
      summary: `ایجاد کاربر جدید: ${created.username} با نقش ${created.role}`,
    });
    store.saveImmediate();
    res.json({ user: sanitizeUser(created) });
  });

  app.patch('/api/users/:id', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const target = store.db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: errMsg(req, 'کاربر یافت نشد', 'User not found') });
      return;
    }
    const { username, fullName, role, active, password, mustChangePassword } = req.body as {
      username?: string;
      fullName?: string;
      role?: UserRole;
      active?: boolean;
      password?: string;
      mustChangePassword?: boolean;
    };

    const nextRole = role ?? target.role;
    const nextActive = typeof active === 'boolean' ? active : target.active;
    if (target.id === req.currentUser!.id && (nextRole !== 'admin' || !nextActive)) {
      res.status(400).json({
        error: errMsg(
          req,
          'امکان غیرفعال‌سازی یا تغییر نقش حساب کاربری خودتان وجود ندارد',
          'Cannot deactivate or demote your own account',
        ),
      });
      return;
    }
    if (target.role === 'admin' && target.active && (nextRole !== 'admin' || !nextActive)) {
      const otherActiveAdmins = store.db.users.filter(
        (u) => u.id !== target.id && u.role === 'admin' && u.active,
      );
      if (otherActiveAdmins.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'حداقل یک مدیر کل فعال باید در سامانه باقی بماند',
            'At least one active admin must remain',
          ),
        });
        return;
      }
    }

    if (username !== undefined) {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        res.status(400).json({ error: errMsg(req, 'نام کاربری نمی‌تواند خالی باشد', 'Username cannot be empty') });
        return;
      }
      if (store.db.users.some((u) => u.id !== target.id && u.username.toLowerCase() === cleanUsername)) {
        res.status(409).json({ error: errMsg(req, 'نام کاربری تکراری است', 'Username already exists') });
        return;
      }
      target.username = cleanUsername;
    }
    if (fullName !== undefined) target.fullName = fullName.trim() || target.username;
    if (role !== undefined) target.role = role;
    if (typeof active === 'boolean') target.active = active;
    if (typeof mustChangePassword === 'boolean') target.mustChangePassword = mustChangePassword;

    let passwordReset = false;
    if (password !== undefined && password !== '') {
      if (password.length < 4) {
        res.status(400).json({
          error: errMsg(req, 'رمز عبور باید حداقل ۴ کاراکتر باشد', 'Password must be at least 4 characters'),
        });
        return;
      }
      target.passwordHash = hashPassword(password);
      passwordReset = true;
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: passwordReset ? 'ADMIN_RESET_PASSWORD' : 'UPDATE_USER',
      scope: 'user',
      targetId: target.id,
      summary: passwordReset
        ? `تغییر رمز عبور کاربر ${target.username} توسط مدیر`
        : `ویرایش حساب کاربری ${target.username} (نقش: ${target.role}، فعال: ${target.active ? 'بله' : 'خیر'})`,
    });
    store.saveImmediate();
    res.json({ user: sanitizeUser(target) });
  });

  app.delete('/api/users/:id', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'کاربر یافت نشد', 'User not found') });
      return;
    }
    const target = store.db.users[idx];
    if (target.id === req.currentUser!.id) {
      res.status(400).json({
        error: errMsg(req, 'امکان حذف حساب کاربری خودتان وجود ندارد', 'Cannot delete your own account'),
      });
      return;
    }
    if (target.role === 'admin' && target.active) {
      const otherActiveAdmins = store.db.users.filter(
        (u) => u.id !== target.id && u.role === 'admin' && u.active,
      );
      if (otherActiveAdmins.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'حداقل یک مدیر کل فعال باید در سامانه باقی بماند',
            'Cannot delete the last active admin',
          ),
        });
        return;
      }
    }

    store.db.users.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_USER',
      scope: 'user',
      targetId: target.id,
      summary: `حذف حساب کاربری ${target.fullName} (${target.username})`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- PACKING CHECK, LOOKUP & CLOSURE ----------------
  app.get('/api/packing/check', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(String(req.query.packingNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const itemNo = normalizeDigits(normKey(String(req.query.itemNo || '')));
    const mapnaMinutesNo = normalizeDigits(normKey(String(req.query.mapnaMinutesNo || '')));
    const scope = (String(req.query.scope || 'general') as 'general' | 'detailed' | 'transit');
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;

    const genMatches = packingNo ? store.generalByPacking.get(packingNo) || [] : [];
    const detMatches = packingNo ? store.detailedByPacking.get(packingNo) || [] : [];
    const transitMatches = packingNo ? store.transitByPacking.get(packingNo) || [] : [];
    const generalPackages = Array.from(new Set(genMatches.map((g) => normKey(g.packageNo)).filter(Boolean)));
    const existingPackages = Array.from(
      new Set([
        ...generalPackages,
        ...detMatches.map((d) => normKey(d.packageNo)).filter(Boolean),
      ]),
    );
    const meta = packingNo ? store.db.packingMeta[packingNo] : undefined;
    const linkedGeneral = packingNo ? store.getGeneralSharedInfo(packingNo, packageNo) : null;
    const tFirst = transitMatches[0];
    const linkedTransit = tFirst
      ? {
          packingListNo: tFirst.packingListNo,
          packageNo: tFirst.packageNo,
          arrivalDate: tFirst.arrivalDate,
          releaseNetNo: tFirst.releaseNetNo,
          releaseNetDate: tFirst.releaseNetDate,
          supplier: tFirst.supplier,
          dispatchLocation: tFirst.dispatchLocation,
          system: tFirst.system,
          subSystem: tFirst.subSystem,
          unit: tFirst.unit,
          billOfLadingNo: tFirst.billOfLadingNo,
          amount: tFirst.amount,
          itemDescription: tFirst.itemDescription,
        }
      : null;

    res.json({
      packingNo,
      existsInGeneral: genMatches.length > 0,
      existsInDetailed: detMatches.length > 0,
      existsInTransit: transitMatches.length > 0,
      generalCount: genMatches.length,
      detailedCount: detMatches.length,
      generalPackages,
      existingPackages,
      packageExistsUnderPacking: packageNo ? generalPackages.includes(packageNo) : false,
      isClosed: Boolean(meta?.isClosed),
      closedAt: meta?.closedAt || null,
      closedBy: meta?.closedBy || null,
      mapnaMinutesTaken: mapnaMinutesNo ? store.isMapnaMinutesTaken(mapnaMinutesNo, excludeId) : false,
      itemNoTaken: packingNo && itemNo ? store.isDetailedItemNoTaken(packingNo, packageNo, itemNo, excludeId) : false,
      nextSuggestedItemNo: packingNo ? store.getNextSuggestedItemNo(packingNo, packageNo) : '1',
      linkedGeneral,
      linkedTransit,
      lastDetailedDefaults: store.getLastDetailedDefaults(),
      rowNoTaken: false,
      nextSuggestedRowNo: store.nextSuggestedRowNo(scope),
    });
  });

  app.get('/api/general/lookup', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(String(req.query.packingNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const packings = Array.from(store.generalByPacking.keys()).sort((a, b) => a.localeCompare(b, 'fa'));
    const shared = packingNo ? store.getGeneralSharedInfo(packingNo, packageNo) : null;
    res.json({
      packings,
      packagesForPacking: shared?.packagesForPacking || [],
      shared,
      lastDetailedDefaults: store.getLastDetailedDefaults(),
    });
  });

  app.post('/api/packing/:packingNo/close', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(req.params.packingNo);
    const { note } = req.body as { note?: string };
    const now = new Date().toISOString();
    store.db.packingMeta[packingNo] = {
      packingNo,
      isClosed: true,
      closedAt: now,
      closedBy: req.currentUser!.fullName || req.currentUser!.username,
      closureNote: (note || '').trim(),
    };
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CLOSE_PACKING',
      scope: 'packing',
      targetId: packingNo,
      summary: `اعلام رسیدن کامل و بستن پکینگ لیست ${packingNo}`,
    });
    store.saveImmediate();
    res.json({ meta: store.db.packingMeta[packingNo] });
  });

  app.post('/api/packing/:packingNo/reopen', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(req.params.packingNo);
    store.db.packingMeta[packingNo] = {
      packingNo,
      isClosed: false,
    };
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'REOPEN_PACKING',
      scope: 'packing',
      targetId: packingNo,
      summary: `بازگشایی وضعیت پکینگ لیست ${packingNo}`,
    });
    store.saveImmediate();
    res.json({ meta: store.db.packingMeta[packingNo] });
  });

  // ---------------- EXCEL COLUMN DISTINCT VALUES ----------------
  app.get('/api/column-values', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const scope = String(req.query.scope || 'general');
    const column = String(req.query.column || '').trim();
    const calendar: CalendarMode = req.query.calendar === 'gregorian' ? 'gregorian' : 'jalali';
    if (!column) {
      res.json({ column: '', values: [] });
      return;
    }
    const sourceRows: Record<string, unknown>[] =
      scope === 'detailed'
        ? (store.getDetailedComputedList() as unknown as Record<string, unknown>[])
        : scope === 'transit'
          ? (store.db.transit as unknown as Record<string, unknown>[])
          : scope === 'trash'
            ? (store.db.trash.map(projectTrashRowForQuery) as unknown as Record<string, unknown>[])
            : (store.db.general as unknown as Record<string, unknown>[]);
    const values = collectDistinctColumnValues(sourceRows, column, calendar);
    res.json({ column, values });
  });

  // ---------------- GENERAL (کلی) ----------------
  app.get('/api/general', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const island = String(req.query.island || '');
    const system = String(req.query.system || '');
    const subSystem = String(req.query.subSystem || '');
    const unit = String(req.query.unit || '');
    const supplier = String(req.query.supplier || '');
    const dispatchLocation = String(req.query.dispatchLocation || '');
    const packageType = String(req.query.packageType || '');
    const packingListNo = normKey(String(req.query.packingListNo || ''));
    const packingNos = parsePackingNosParam(String(req.query.packingNos || ''));
    const customFilters = parseCustomFiltersParam(String(req.query.customFilters || ''));
    const colFilters = parseColFiltersParam(String(req.query.colFilters || ''));
    const calendar: CalendarMode = req.query.calendar === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = String(req.query.sortBy || '').trim();
    const sortDir: 'asc' | 'desc' = req.query.sortDir === 'desc' ? 'desc' : 'asc';
    const shortageOnly = String(req.query.shortageOnly || '') === 'true';
    const damagedOnly = String(req.query.damagedOnly || '') === 'true';
    const discrepancyOnly = String(req.query.discrepancyOnly || '') === 'true';
    const replacedOnly = String(req.query.replacedOnly || '') === 'true';
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const fetchAll = String(req.query.all || '') === 'true';
    const allIds = String(req.query.allIds || '') === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(req.query.pageSize || 50)));

    const substitutedIds = new Set(
      (store.db.substitutions || []).map((s) => s.detailedId).filter(Boolean),
    );
    const compiledColFilters = compileColFilters(colFilters);
    const pkFilterNorm = packingListNo ? normDupPart(packingListNo) : '';

    const baseFiltered = store.db.general.filter((g) => {
      if (island && g.island !== island) return false;
      if (system && g.system !== system) return false;
      if (subSystem && g.subSystem !== subSystem) return false;
      if (unit && g.unit !== unit) return false;
      if (supplier && g.supplier !== supplier) return false;
      if (dispatchLocation && g.dispatchLocation !== dispatchLocation) return false;
      if (packageType && (g.packageType || '') !== packageType) return false;
      if (pkFilterNorm && normDupPart(g.packingListNo) !== pkFilterNorm) return false;
      if (!matchesMultiPacking(g.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(g as unknown as Record<string, unknown>, customFilters)) return false;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(g as unknown as Record<string, unknown>, compiledColFilters, calendar)) return false;
      if (!inDateRange(g.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          g.rowNo,
          g.packingListNo,
          g.packageNo,
          g.packageType || '',
          g.itemDescription,
          g.supplier,
          g.dispatchLocation,
          g.employerEntryMinutesNo,
          g.mapnaEntryMinutesNo,
          g.releaseNo,
          g.billOfLadingNo,
          g.vehicleNo,
          g.driverName,
          g.purchasePackageNo || '',
          g.opiInvitationNo,
          g.island,
          g.system,
          g.subSystem,
          g.unit,
        ],
        q,
      );
    });

    const needsLinkedFilter = shortageOnly || damagedOnly || discrepancyOnly || replacedOnly;
    const isPackingClosed = (rawPk: string | undefined | null): boolean => {
      const pk = normKey(rawPk);
      if (!pk) return false;
      return Boolean(store.db.packingMeta[pk]?.isClosed);
    };

    if (needsLinkedFilter) {
      const resolveLinked = createGeneralDetailedLinker(store.db.detailed, substitutedIds);
      const enrichedRaw = [];
      for (let i = 0; i < baseFiltered.length; i += 1) {
        const g = baseFiltered[i];
        const linked = resolveLinked(g.packingListNo, g.packageNo);
        if (shortageOnly && !linked.hasLinkedShortage) continue;
        if (damagedOnly && !linked.hasLinkedDamaged) continue;
        if (discrepancyOnly && !linked.hasLinkedDiscrepancy) continue;
        if (replacedOnly && !linked.hasLinkedReplaced) continue;
        enrichedRaw.push({
          ...g,
          packingClosed: isPackingClosed(g.packingListNo),
          ...linked,
        });
      }

      const filtered = sortBy
        ? (sortRowsByColumn(enrichedRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as typeof enrichedRaw)
        : [...enrichedRaw].reverse();

      const total = filtered.length;
      const filteredSummary = computeSelectionFormulaSummary({ general: filtered });

      if (allIds) {
        res.json({
          ids: filtered.map((g) => g.id),
          total,
          filteredSummary,
        });
        return;
      }

      const start = (page - 1) * pageSize;
      const items = fetchAll ? filtered : filtered.slice(start, start + pageSize);

      res.json({
        items,
        total,
        page: fetchAll ? 1 : page,
        pageSize: fetchAll ? Math.max(1, total) : pageSize,
        totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
        filteredSummary,
        packingMeta: {},
      });
      return;
    }

    const sortedBase = sortBy
      ? (sortRowsByColumn(baseFiltered as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as GeneralEntry[])
      : [...baseFiltered].reverse();

    const total = sortedBase.length;
    const filteredSummary = computeSelectionFormulaSummary({ general: sortedBase });

    if (allIds) {
      res.json({
        ids: sortedBase.map((g) => g.id),
        total,
        filteredSummary,
      });
      return;
    }

    const start = (page - 1) * pageSize;
    const pageRows = fetchAll ? sortedBase : sortedBase.slice(start, start + pageSize);
    const pagePkNorms = fetchAll
      ? undefined
      : new Set(pageRows.map((g) => normDupPart(g.packingListNo)).filter(Boolean));
    const resolveLinked = createGeneralDetailedLinker(store.db.detailed, substitutedIds, pagePkNorms);

    const items = pageRows.map((g) => ({
      ...g,
      packingClosed: isPackingClosed(g.packingListNo),
      ...resolveLinked(g.packingListNo, g.packageNo),
    }));

    res.json({
      items,
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
      packingMeta: {},
    });
  });

  app.post('/api/general/batch', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      packingListNo,
      isContinuation,
      acknowledgeClosed,
      entries,
    } = req.body as {
      packingListNo?: string;
      isContinuation?: boolean;
      acknowledgeClosed?: boolean;
      entries?: Partial<GeneralEntry>[];
    };

    const pk = normKey(packingListNo);
    if (!pk) {
      res.status(400).json({ error: errMsg(req, 'شماره پکینگ لیست الزامی است', 'Packing List No. is required') });
      return;
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک نگله باید ثبت شود', 'At least one package entry is required') });
      return;
    }

    // Check duplicates in GENERAL only (so deleting from General allows re-entry even if Detailed items remain)
    const existingGen = store.generalByPacking.get(pk) || [];
    const meta = store.db.packingMeta[pk];

    if (meta?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    if (existingGen.length > 0 && !isContinuation) {
      res.status(409).json({
        code: 'DUPLICATE_PACKING_PROMPT',
        error: errMsg(
          req,
          'شماره پکینگ لیست تکراری است. آیا ادامه همان پکینگ لیست قبلی است؟',
          'Duplicate Packing List No. Is this a continuation of the existing Packing List?',
        ),
      });
      return;
    }

    const existingPackages = new Set(existingGen.map((g) => normKey(g.packageNo)).filter(Boolean));
    const batchMapnaMinutes = new Set<string>();
    const preparedGeneral: GeneralEntry[] = [];
    const now = new Date().toISOString();

    for (const raw of entries) {
      const pkgNo = normKey(raw.packageNo);
      if (!pkgNo || !normKey(raw.supplier) || !normKey(raw.dispatchLocation) || !normKey(raw.packageType) || !normKey(raw.itemDescription) || !normKey(raw.island) || !normKey(raw.system) || !normKey(raw.subSystem) || !normKey(raw.unit)) {
        res.status(400).json({
          error: errMsg(
            req,
            'فیلدهای تأمین‌کننده، محل ارسال، شماره پکینگ، شماره نگله، نوع بسته‌بندی، تعداد اقلام نگله، شرح کالا، جزیره، سیستم، ساب‌سیستم و واحد نباید خالی بمانند.',
            'Supplier, Dispatch Location, Packing List No., Package No., Package Type, Package Item Count, Description, Island, System, Sub-System, and Unit are required.',
          ),
        });
        return;
      }

      const cleanEmployerMinutes = normalizeDigits(normKey(raw.employerEntryMinutesNo));
      if (cleanEmployerMinutes && !isValidDigitsOnly(cleanEmployerMinutes)) {
        res.status(400).json({
          error: errMsg(
            req,
            'شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.',
            'Employer Entry Minutes No. must contain digits only.',
          ),
        });
        return;
      }

      if (isContinuation && existingGen.length > 0 && (!pkgNo || existingPackages.has(pkgNo))) {
        res.status(409).json({
          code: 'DUPLICATE_PACKAGE_ON_CONTINUATION',
          error: errMsg(
            req,
            `برای ادامه پکینگ لیست ${pk}، باید شماره نگله جدید و متفاوت وارد کنید (نگله «${pkgNo || '-'}» قبلاً ثبت شده است).`,
            `Continuation under Packing List ${pk} requires a new Package No. ("${pkgNo || '-'}" already exists).`,
          ),
        });
        return;
      }

      const cleanMapnaMinutes = normalizeDigits(normKey(raw.mapnaEntryMinutesNo));

      const cleanArrival = normKey(raw.arrivalDate);
      const cleanReleaseNo = normKey(raw.releaseNo);
      const cleanReleaseDate = cleanReleaseNo ? (normKey(raw.releaseDate) || cleanArrival) : cleanArrival;
      const parsedItemCount =
        raw.itemCount !== undefined && raw.itemCount !== null && Number.isFinite(Number(raw.itemCount)) && Number(raw.itemCount) > 0
          ? Math.floor(Number(raw.itemCount))
          : null;
      if (!parsedItemCount || parsedItemCount <= 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'تعداد اقلام نگله الزامی و باید عدد صحیح بزرگ‌تر از صفر باشد.',
            'Package Item Count is required and must be a positive integer.',
          ),
        });
        return;
      }

      preparedGeneral.push({
        id: makeId(),
        rowNo: '0',
        arrivalDate: cleanArrival,
        releaseNo: cleanReleaseNo,
        releaseDate: cleanReleaseDate,
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: normalizeDigits(normKey(raw.employerEntryMinutesNo)),
        mapnaEntryMinutesNo: cleanMapnaMinutes,
        packingListNo: pk,
        packageNo: pkgNo,
        packageType: normKey(raw.packageType),
        itemCount: parsedItemCount,
        itemDescription: normKey(raw.itemDescription),
        island: normKey(raw.island),
        system: normKey(raw.system),
        subSystem: normKey(raw.subSystem),
        unit: normKey(raw.unit),
        grossWeight: raw.grossWeight ?? null,
        netWeight: raw.netWeight ?? null,
        lengthCm: raw.lengthCm ?? null,
        widthCm: raw.widthCm ?? null,
        heightCm: raw.heightCm ?? null,
        billOfLadingNo: normKey(raw.billOfLadingNo),
        vehicleNo: normKey(raw.vehicleNo),
        weighbridgeWeight: raw.weighbridgeWeight ?? null,
        freightCost: raw.freightCost ?? null,
        opiInvitationNo: normKey(raw.opiInvitationNo),
        opiInvitationDate: normKey(raw.opiInvitationDate),
        driverName: normKey(raw.driverName),
        purchasePackageNo: normKey(raw.purchasePackageNo),
        createdAt: now,
        updatedAt: now,
        createdBy: req.currentUser!.username,
      });
    }

    store.db.general.unshift(...preparedGeneral);
    store.renumberScope('general');
    store.rebuildIndexes();

    store.history.push({
      labelFa: `ثبت کلی پکینگ ${pk} (${preparedGeneral.length} ردیف)`,
      labelEn: `Add General Packing ${pk} (${preparedGeneral.length} rows)`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: preparedGeneral.map((g) => ({
        scope: 'general',
        op: 'insert',
        id: g.id,
        after: g,
      })),
    });

    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: isContinuation ? 'CONTINUE_PACKING_GENERAL' : 'CREATE_PACKING_GENERAL',
      scope: 'general',
      targetId: pk,
      summary: `${isContinuation ? 'ادامه ثبت روی پکینگ لیست' : 'ثبت پکینگ لیست جدید'} ${pk} (${preparedGeneral.length} ردیف جنرال)`,
    });
    store.saveImmediate();

    res.json({
      createdGeneral: preparedGeneral,
      createdDetailedCount: 0,
      transitUpdated,
    });
  });

  app.patch('/api/general/bulk', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids, patch } = req.body as { ids?: string[]; patch?: Partial<GeneralEntry> };
    if (!Array.isArray(ids) || ids.length === 0 || !patch || typeof patch !== 'object') {
      res.status(400).json({ error: errMsg(req, 'شناسه ردیف‌ها و تغییرات الزامی است', 'Row IDs and patch data are required') });
      return;
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof GeneralEntry)[] = [
      'arrivalDate', 'releaseNo', 'releaseDate', 'supplier', 'dispatchLocation',
      'employerEntryMinutesNo', 'packageType', 'island', 'system', 'subSystem',
      'unit', 'billOfLadingNo', 'vehicleNo', 'opiInvitationNo', 'opiInvitationDate', 'driverName', 'purchasePackageNo',
    ];
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        cleanPatch[k] = normKey(String(patch[k]));
      }
    }
    if (cleanPatch.employerEntryMinutesNo && !isValidDigitsOnly(String(cleanPatch.employerEntryMinutesNo))) {
      res.status(400).json({ error: errMsg(req, 'شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.', 'Employer Entry Minutes No. must contain digits only.') });
      return;
    }
    if (patch.freightCost !== undefined && patch.freightCost !== null && Number.isFinite(Number(patch.freightCost))) {
      cleanPatch.freightCost = Number(patch.freightCost);
    }

    const now = new Date().toISOString();
    let updatedCount = 0;
    const touchedPackings = new Set<string>();
    const historyChanges: HistoryChange[] = [];
    for (const g of store.db.general) {
      if (!idSet.has(g.id)) continue;
      const before = { ...g };
      Object.assign(g, cleanPatch, { updatedAt: now });
      historyChanges.push({ scope: 'general', op: 'update', id: g.id, before, after: { ...g } });
      if (g.packingListNo) touchedPackings.add(g.packingListNo);
      updatedCount += 1;
    }

    store.renumberScope('general');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `ویرایش گروهی ${updatedCount} ردیف کلی`,
        labelEn: `Bulk Edit ${updatedCount} General Rows`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: historyChanges,
      });
    }
    let transitUpdated = 0;
    for (const pk of touchedPackings) {
      transitUpdated += store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_UPDATE_GENERAL',
      scope: 'general',
      targetId: `${updatedCount} rows`,
      summary: `ویرایش گروهی ${updatedCount} ردیف در ثبت کلی تجهیزات`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount, transitUpdated });
  });

  app.patch('/api/general/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.general.find((g) => g.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...patch } = req.body as Partial<GeneralEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.packingListNo ?? item.packingListNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    if (patch.mapnaEntryMinutesNo !== undefined) {
      patch.mapnaEntryMinutesNo = normalizeDigits(normKey(patch.mapnaEntryMinutesNo));
    }

    if (patch.employerEntryMinutesNo !== undefined) {
      const cleanEmp = normalizeDigits(normKey(patch.employerEntryMinutesNo));
      if (cleanEmp && !isValidDigitsOnly(cleanEmp)) {
        res.status(400).json({
          error: errMsg(
            req,
            'شماره صورتجلسه کارفرما فقط باید شامل عدد باشد.',
            'Employer Entry Minutes No. must contain digits only.',
          ),
        });
        return;
      }
      patch.employerEntryMinutesNo = cleanEmp;
    }

    const finalArrival = normKey(patch.arrivalDate ?? item.arrivalDate);
    const finalReleaseNo = normKey(patch.releaseNo ?? item.releaseNo);
    const finalReleaseDate = finalReleaseNo
      ? (normKey(patch.releaseDate ?? item.releaseDate) || finalArrival)
      : finalArrival;

    if (patch.packageType !== undefined) {
      patch.packageType = normKey(patch.packageType);
    }
    if (patch.purchasePackageNo !== undefined) {
      patch.purchasePackageNo = normKey(patch.purchasePackageNo);
    }
    if (patch.itemCount !== undefined) {
      patch.itemCount =
        patch.itemCount !== null && Number.isFinite(Number(patch.itemCount)) && Number(patch.itemCount) > 0
          ? Math.floor(Number(patch.itemCount))
          : null;
    }

    const beforeGeneral = { ...item };
    Object.assign(item, {
      ...patch,
      releaseNo: finalReleaseNo,
      releaseDate: finalReleaseDate,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.renumberScope('general');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `ویرایش ردیف کلی ${item.packingListNo || item.rowNo}`,
      labelEn: `Edit General Row ${item.packingListNo || item.rowNo}`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'general', op: 'update', id: item.id, before: beforeGeneral, after: { ...item } }],
    });
    const transitUpdated = store.syncTransitArrival(item.packingListNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_GENERAL',
      scope: 'general',
      targetId: `${item.packingListNo} (#${item.rowNo})`,
      summary: `ویرایش ردیف جنرال شماره ${item.rowNo} در پکینگ لیست ${item.packingListNo}`,
    });
    store.saveImmediate();
    res.json({ item, transitUpdated });
  });

  app.delete('/api/general/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.general.findIndex((g) => g.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const cascadeDetailed = String(req.query.cascadeDetailed || '') === 'true';
    const [removed] = store.db.general.splice(idx, 1);
    const now = new Date().toISOString();
    const deletedBy = req.currentUser!.fullName || req.currentUser!.username;
    const historyChanges: HistoryChange[] = [
      { scope: 'general', op: 'delete', id: removed.id, before: removed, index: idx },
    ];

    const trashEntry: TrashRecord = {
      id: makeId(),
      scope: 'general',
      deletedAt: now,
      deletedBy,
      targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
      data: removed,
    };
    store.db.trash.unshift(trashEntry);
    historyChanges.push({ scope: 'trash', op: 'insert', id: trashEntry.id, after: trashEntry });

    let trashedDetailedCount = 0;
    if (cascadeDetailed) {
      const pk = normKey(removed.packingListNo);
      const pkg = normKey(removed.packageNo);
      const remainingDetailed: DetailedEntry[] = [];
      for (let di = 0; di < store.db.detailed.length; di += 1) {
        const d = store.db.detailed[di];
        const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
        if (matches) {
          trashedDetailedCount += 1;
          const dTrash: TrashRecord = {
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          };
          store.db.trash.unshift(dTrash);
          historyChanges.push({ scope: 'detailed', op: 'delete', id: d.id, before: d, index: di });
          historyChanges.push({ scope: 'trash', op: 'insert', id: dTrash.id, after: dTrash });
        } else {
          remainingDetailed.push(d);
        }
      }
      if (trashedDetailedCount > 0) {
        store.db.detailed = remainingDetailed;
        store.renumberScope('detailed');
      }
    }

    store.renumberScope('general');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `حذف ردیف کلی ${removed.packingListNo || removed.rowNo}`,
      labelEn: `Delete General Row ${removed.packingListNo || removed.rowNo}`,
      user: deletedBy,
      changes: historyChanges,
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_GENERAL',
      scope: 'general',
      targetId: `${removed.packingListNo} (#${removed.rowNo})`,
      summary: `انتقال ردیف جنرال ${removed.rowNo} (${removed.packingListNo} / ${removed.packageNo || '-'}) به سطل بازیافت${
        trashedDetailedCount > 0 ? ` همراه با ${trashedDetailedCount} ردیف جزئیات` : ''
      }`,
    });
    store.saveImmediate();
    res.json({ ok: true, trashedDetailedCount });
  });

  // (PATCH /api/general/bulk registered above /api/general/:id to avoid route shadowing)

  app.post('/api/general/bulk-delete', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids, cascadeDetailed } = req.body as { ids?: string[]; cascadeDetailed?: boolean };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: errMsg(req, 'هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion') });
      return;
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = req.currentUser!.fullName || req.currentUser!.username;
    const removedRows: GeneralEntry[] = [];
    const historyChanges: HistoryChange[] = [];
    store.db.general = store.db.general.filter((g, gi) => {
      if (idSet.has(g.id)) {
        removedRows.push(g);
        historyChanges.push({ scope: 'general', op: 'delete', id: g.id, before: g, index: gi });
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      const tr: TrashRecord = {
        id: makeId(),
        scope: 'general',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
        data: removed,
      };
      store.db.trash.unshift(tr);
      historyChanges.push({ scope: 'trash', op: 'insert', id: tr.id, after: tr });
    }

    let trashedDetailedCount = 0;
    if (cascadeDetailed && removedRows.length > 0) {
      const pairs = new Set(
        removedRows.map((r) => `${normKey(r.packingListNo).toLowerCase()}::${normKey(r.packageNo).toLowerCase()}`),
      );
      const packingsNoPkg = new Set(
        removedRows.filter((r) => !normKey(r.packageNo)).map((r) => normKey(r.packingListNo).toLowerCase()),
      );
      store.db.detailed = store.db.detailed.filter((d, di) => {
        const pk = normKey(d.shipmentNo).toLowerCase();
        const pkg = normKey(d.packageNo).toLowerCase();
        if (pairs.has(`${pk}::${pkg}`) || packingsNoPkg.has(pk)) {
          trashedDetailedCount += 1;
          const tr: TrashRecord = {
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          };
          store.db.trash.unshift(tr);
          historyChanges.push({ scope: 'detailed', op: 'delete', id: d.id, before: d, index: di });
          historyChanges.push({ scope: 'trash', op: 'insert', id: tr.id, after: tr });
          return false;
        }
        return true;
      });
      if (trashedDetailedCount > 0) store.renumberScope('detailed');
    }

    store.renumberScope('general');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `حذف گروهی ${removedRows.length} ردیف کلی`,
        labelEn: `Bulk Delete ${removedRows.length} General Rows`,
        user: deletedBy,
        changes: historyChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_DELETE_GENERAL',
      scope: 'general',
      targetId: `${removedRows.length} rows`,
      summary: `حذف گروهی ${removedRows.length} ردیف از ثبت کلی تجهیزات (انتقال به سطل بازیافت)${
        trashedDetailedCount > 0 ? ` همراه با ${trashedDetailedCount} ردیف جزئیات` : ''
      }`,
    });
    store.saveImmediate();
    res.json({ ok: true, deletedCount: removedRows.length, trashedDetailedCount });
  });

  // ---------------- DETAILED (دیتیل / جزئیات) ----------------
  app.get('/api/detailed', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const island = String(req.query.island || '');
    const system = String(req.query.system || '');
    const subSystem = String(req.query.subSystem || '');
    const unit = String(req.query.unit || '');
    const supplier = String(req.query.supplier || '');
    const origin = String(req.query.origin || '');
    const storageLocation = String(req.query.storageLocation || '');
    const itemCategory = String(req.query.itemCategory || '');
    const shipmentNo = normKey(String(req.query.shipmentNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const packingNos = parsePackingNosParam(String(req.query.packingNos || ''));
    const customFilters = parseCustomFiltersParam(String(req.query.customFilters || ''));
    const colFilters = parseColFiltersParam(String(req.query.colFilters || ''));
    const calendar: CalendarMode = req.query.calendar === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = String(req.query.sortBy || '').trim();
    const sortDir: 'asc' | 'desc' = req.query.sortDir === 'desc' ? 'desc' : 'asc';
    const shortageOnly = String(req.query.shortageOnly || '') === 'true';
    const damagedOnly = String(req.query.damagedOnly || '') === 'true';
    const discrepancyOnly = String(req.query.discrepancyOnly || '') === 'true';
    const replacedOnly = String(req.query.replacedOnly || '') === 'true';
    const hasEmployerStock = String(req.query.hasEmployerStock || '') === 'true';
    const hasContractorStock = String(req.query.hasContractorStock || '') === 'true';
    const hasAnyStock = String(req.query.hasAnyStock || '') === 'true';
    const noGcvOnly = String(req.query.noGcvOnly || '') === 'true';
    const allowGcvReceiptNo = normKey(String(req.query.allowGcvReceiptNo || '')).toUpperCase();
    const chemicalExpiry = String(req.query.chemicalExpiry || '').trim();
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const fetchAll = String(req.query.all || '') === 'true';
    const allIds = String(req.query.allIds || '') === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(req.query.pageSize || 50)));

    const allExpiringChems = getExpiringChemicals(store.getDetailedComputedList(), 30);
    const expiredChemIds = new Set<string>();
    const expiringSoonChemIds = new Set<string>();
    for (const c of allExpiringChems) {
      if (c.daysRemaining < 0) expiredChemIds.add(c.id);
      else expiringSoonChemIds.add(c.id);
    }
    const chemicalAlertSummary = {
      expiredCount: expiredChemIds.size,
      expiringSoonCount: expiringSoonChemIds.size,
      totalAlertCount: allExpiringChems.length,
    };

    const substitutedIds = new Set(
      (store.db.substitutions || []).map((s) => s.detailedId).filter(Boolean),
    );
    const shipmentFilterNorm = shipmentNo ? normDupPart(shipmentNo) : '';
    const preparedPkgFilter = packageNo ? preparePackageInfo(packageNo) : null;
    const compiledColFilters = compileColFilters(colFilters);

    const computedRaw: DetailedComputed[] = [];
    for (const d of store.db.detailed) {
      if (island && d.island !== island) continue;
      if (system && d.system !== system) continue;
      if (subSystem && d.subSystem !== subSystem) continue;
      if (unit && d.unit !== unit) continue;
      if (supplier && d.supplier !== supplier) continue;
      if (origin && d.origin !== origin) continue;
      if (storageLocation && d.storageLocation !== storageLocation) continue;
      if (itemCategory && (itemCategory === 'standard' ? Boolean(d.itemCategory) : (d.itemCategory || '') !== itemCategory)) continue;
      if (shipmentFilterNorm && normDupPart(d.shipmentNo) !== shipmentFilterNorm) continue;
      if (preparedPkgFilter && !matchesPreparedPackage(preparePackageInfo(d.packageNo), preparedPkgFilter)) continue;
      if (!matchesMultiPacking(d.shipmentNo, packingNos)) continue;
      if (!inDateRange(d.arrivalDate, fromDate, toDate)) continue;
      if (
        !matchSearch(
          [
            d.rowNo,
            d.shipmentNo,
            d.packageNo,
            d.itemNo,
            d.generalDescription,
            d.description,
            d.itemCode,
            d.mtoRef,
            d.supplier,
            d.origin,
            d.island,
            d.system,
            d.subSystem,
            d.unit,
            d.opiNo,
            d.merNo,
            d.repNo,
            d.materialBalanceNo,
            d.balanceStatus,
            d.gcvReceiptNo,
            d.receiver,
            d.mivContractorNo,
            d.smrContractorNo,
            d.smrMapnaNo,
            d.mivMapnaNo,
            d.storageLocation,
            d.notes,
            d.stocktakeStatus,
            d.chemicalType || '',
            d.itemCategory || '',
          ],
          q,
        )
      ) {
        continue;
      }
      const comp = computeDetailedEntry(d);
      if (!matchesCustomFilters(comp as unknown as Record<string, unknown>, customFilters)) continue;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(comp as unknown as Record<string, unknown>, compiledColFilters, calendar)) continue;
      if (shortageOnly && !comp.hasShortage) continue;
      if (damagedOnly && !comp.hasDamaged) continue;
      if (
        discrepancyOnly &&
        !isMerOpen(comp) &&
        !normKey(comp.merNo) &&
        !normKey(comp.merStatus) &&
        !comp.hasShortage &&
        !comp.hasDamaged
      ) {
        continue;
      }
      if (
        replacedOnly &&
        !isRepOpen(comp) &&
        !normKey(comp.repNo) &&
        !normKey(comp.repStatus) &&
        !substitutedIds.has(comp.id)
      ) {
        continue;
      }
      if (hasEmployerStock && (comp.opiPending || comp.mapnaInventory <= 0)) continue;
      if (hasContractorStock && (comp.opiPending || comp.contractorInventory <= 0)) continue;
      if (hasAnyStock && (comp.opiPending || (comp.mapnaInventory <= 0 && comp.contractorInventory <= 0))) continue;
      if (noGcvOnly) {
        const existingGcv = normKey(d.gcvReceiptNo);
        if (existingGcv) {
          const allowed =
            Boolean(allowGcvReceiptNo) &&
            existingGcv
              .split(/[\n,،;؛|]+/)
              .map((tok) => normKey(tok).toUpperCase())
              .includes(allowGcvReceiptNo);
          if (!allowed) continue;
        }
      }
      if (chemicalExpiry === 'expired' && !expiredChemIds.has(comp.id)) continue;
      if (chemicalExpiry === 'expiring_soon' && !expiringSoonChemIds.has(comp.id)) continue;
      if (chemicalExpiry === 'all' && !expiredChemIds.has(comp.id) && !expiringSoonChemIds.has(comp.id)) continue;
      computedRaw.push(comp);
    }

    const computedAll = sortBy
      ? (sortRowsByColumn(computedRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as DetailedComputed[])
      : [...computedRaw].reverse();

    const total = computedAll.length;
    const filteredSummary = computeSelectionFormulaSummary({ detailed: computedAll });

    if (allIds) {
      res.json({
        ids: computedAll.map((d) => d.id),
        total,
        filteredSummary,
        chemicalAlertSummary,
      });
      return;
    }

    const start = (page - 1) * pageSize;
    const rawSlice = fetchAll ? computedAll : computedAll.slice(start, start + pageSize);
    const items = rawSlice.map(({ itemImage: _fullImg, ...rest }) => rest);

    res.json({
      items,
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
      chemicalAlertSummary,
    });
  });

  app.get('/api/detailed/:id/image', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    res.json({
      id: item.id,
      hasImage: Boolean(item.itemImage || item.itemImageThumb),
      itemImage: item.itemImage || '',
      itemImageThumb: item.itemImageThumb || '',
    });
  });

  app.put('/api/detailed/:id/image', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { itemImage, itemImageThumb } = req.body as { itemImage?: string; itemImageThumb?: string };
    const cleanImg = typeof itemImage === 'string' && itemImage.startsWith('data:image/') ? itemImage : '';
    const cleanThumb =
      cleanImg && typeof itemImageThumb === 'string' && itemImageThumb.startsWith('data:image/')
        ? itemImageThumb
        : cleanImg;

    const beforeDetailed = { ...item };
    if (cleanImg) {
      item.itemImage = cleanImg;
      item.itemImageThumb = cleanThumb;
    } else {
      delete item.itemImage;
      delete item.itemImageThumb;
    }
    item.updatedAt = new Date().toISOString();

    store.history.push({
      labelFa: cleanImg
        ? `تغییر تصویر آیتم جزئیات ${item.shipmentNo} (#${item.itemNo || item.rowNo})`
        : `حذف تصویر آیتم جزئیات ${item.shipmentNo} (#${item.itemNo || item.rowNo})`,
      labelEn: cleanImg
        ? `Update Photo for Detailed Item ${item.shipmentNo} (#${item.itemNo || item.rowNo})`
        : `Remove Photo for Detailed Item ${item.shipmentNo} (#${item.itemNo || item.rowNo})`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'detailed', op: 'update', id: item.id, before: beforeDetailed, after: { ...item } }],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: cleanImg ? 'UPDATE_DETAILED_IMAGE' : 'REMOVE_DETAILED_IMAGE',
      scope: 'detailed',
      targetId: `${item.shipmentNo} (#${item.rowNo})`,
      summary: cleanImg
        ? `ثبت یا ویرایش تصویر آیتم جزئیات ردیف ${item.rowNo} (${item.shipmentNo})`
        : `حذف تصویر آیتم جزئیات ردیف ${item.rowNo} (${item.shipmentNo})`,
    });
    store.saveImmediate();
    const { itemImage: _omitted, ...computedLite } = computeDetailedEntry(item);
    res.json({
      ok: true,
      hasImage: Boolean(cleanImg),
      item: computedLite,
      itemImage: cleanImg,
      itemImageThumb: cleanThumb,
    });
  });

  app.post('/api/detailed', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...raw } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(raw.shipmentNo);
    if (!pk) {
      res.status(400).json({ error: errMsg(req, 'شماره محموله / پکینگ لیست الزامی است', 'Shipment / Packing List No. is required') });
      return;
    }
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    const pkgNo = normKey(raw.packageNo);
    const itemNo = normalizeDigits(normKey(raw.itemNo)) || store.getNextSuggestedItemNo(pk, pkgNo);
    if (store.isDetailedItemNoTaken(pk, pkgNo, itemNo)) {
      res.status(409).json({
        code: 'DUPLICATE_ITEM_NO',
        error: errMsg(
          req,
          `شماره آیتم ${itemNo} برای پکینگ «${pk}» و نگله «${pkgNo || '-'}» تکراری است.`,
          `Item No. ${itemNo} already exists for Packing "${pk}" and Package "${pkgNo || '-'}".`,
        ),
      });
      return;
    }

    const shared = store.getGeneralSharedInfo(pk, pkgNo);
    const now = new Date().toISOString();
    const cleanDescription = preserveMultilineText(raw.description);
    const cleanNotes = preserveMultilineText(raw.notes);
    const cleanRepNo = normKey(raw.repNo);
    const rawGenDesc = normKey(raw.generalDescription);
    const resolvedGeneralDesc = rawGenDesc
      ? formatGeneralDescriptionCase(rawGenDesc)
      : inferGeneralDescription(cleanDescription);
    const rawChemType = normKey(raw.chemicalType);
    const inferredCls = !raw.itemCategory
      ? inferItemClassification(cleanDescription, cleanNotes, resolvedGeneralDesc)
      : { itemCategory: raw.itemCategory, chemicalType: '' };
    const resolvedItemCategory = raw.itemCategory || (rawChemType ? 'chemicals' : inferredCls.itemCategory);
    const resolvedChemType = rawChemType || (resolvedItemCategory === 'chemicals' ? inferredCls.chemicalType : '');
    let resolvedProdDate = normKey(raw.productionDate);
    let resolvedExpDate = normKey(raw.expirationDate);
    if (resolvedItemCategory === 'chemicals' && (!resolvedProdDate || !resolvedExpDate)) {
      const extDates = extractChemicalDatesFromTexts([cleanNotes, cleanDescription, resolvedGeneralDesc], 'jalali');
      if (!resolvedProdDate && extDates.productionDate) resolvedProdDate = extDates.productionDate;
      if (!resolvedExpDate && extDates.expirationDate) resolvedExpDate = extDates.expirationDate;
    }

    const created: DetailedEntry = {
      id: makeId(),
      rowNo: '0',
      arrivalDate: normKey(raw.arrivalDate) || shared?.arrivalDate || '',
      supplier: normKey(raw.supplier) || shared?.supplier || '',
      origin: normKey(raw.origin) || shared?.dispatchLocation || '',
      shipmentNo: pk,
      packageNo: pkgNo,
      itemNo,
      generalDescription: resolvedGeneralDesc,
      description: cleanDescription,
      size: normKey(raw.size) || inferSizeFromDescription(cleanDescription),
      itemCode: normKey(raw.itemCode),
      packingQty: raw.packingQty ?? null,
      actualQty:
        raw.actualQty !== null && raw.actualQty !== undefined && Number.isFinite(Number(raw.actualQty))
          ? Number(raw.actualQty)
          : (raw.packingQty ?? null),
      damagedQty: raw.damagedQty ?? null,
      mtoRef: normKey(raw.mtoRef),
      repNo: cleanRepNo,
      repStatus: normalizeRepStatus(raw.repStatus, Boolean(cleanRepNo)),
      repReprocured: normKey(raw.repReprocured),
      repDescription: preserveMultilineText(raw.repDescription),
      countingUnit: normalizeCountingUnitToFa(raw.countingUnit),
      island: normKey(raw.island) || shared?.island || '',
      system: normKey(raw.system) || shared?.system || '',
      subSystem: normKey(raw.subSystem) || shared?.subSystem || '',
      unit: normKey(raw.unit) || shared?.unit || '',
      opiNo: normKey(raw.opiNo),
      opiDate: normKey(raw.opiDate),
      merNo: normKey(raw.merNo),
      merStatus: normKey(raw.merStatus),
      merDescription: preserveMultilineText(raw.merDescription),
      notes: cleanNotes,
      materialBalanceNo: normKey(raw.materialBalanceNo),
      balanceStatus: normKey(raw.balanceStatus),
      storageLocation: normKey(raw.storageLocation),
      gcvReceiptNo: normKey(raw.gcvReceiptNo),
      receiver: normKey(raw.receiver),
      gcvDeliveredQty: raw.gcvDeliveredQty ?? null,
      mivContractorNo: normKey(raw.mivContractorNo),
      mivContractorDate: normKey(raw.mivContractorDate),
      mivContractorQty: raw.mivContractorQty ?? null,
      mivReceiver: normKey(raw.mivReceiver),
      smrContractorNo: normKey(raw.smrContractorNo),
      smrContractorDate: normKey(raw.smrContractorDate),
      smrContractorQty: raw.smrContractorQty ?? null,
      smrContractorNote: preserveMultilineText(raw.smrContractorNote),
      smrMapnaNo: normKey(raw.smrMapnaNo),
      smrMapnaDate: normKey(raw.smrMapnaDate),
      smrMapnaQty: raw.smrMapnaQty ?? null,
      smrMapnaNote: preserveMultilineText(raw.smrMapnaNote),
      smrDeliverer: normKey(raw.smrDeliverer),
      mivMapnaNo: normKey(raw.mivMapnaNo),
      mivMapnaDate: normKey(raw.mivMapnaDate),
      mivMapnaQty: raw.mivMapnaQty ?? null,
      stocktakeInfo: preserveMultilineText(raw.stocktakeInfo),
      stocktakeStatus: normKey(raw.stocktakeStatus),
      stocktakeDate: normKey(raw.stocktakeDate),
      itemCategory: resolvedItemCategory,
      chemicalType: resolvedChemType,
      productionDate: resolvedProdDate,
      expirationDate: resolvedExpDate,
      ...(typeof raw.itemImage === 'string' && raw.itemImage.startsWith('data:image/')
        ? {
            itemImage: raw.itemImage,
            itemImageThumb:
              typeof raw.itemImageThumb === 'string' && raw.itemImageThumb.startsWith('data:image/')
                ? raw.itemImageThumb
                : raw.itemImage,
          }
        : {}),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };

    store.db.detailed.unshift(created);
    store.renumberScope('detailed');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `ثبت ردیف جزئیات ${pk} / #${itemNo}`,
      labelEn: `Add Detailed Item ${pk} / #${itemNo}`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'detailed', op: 'insert', id: created.id, after: created }],
    });
    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_DETAILED',
      scope: 'detailed',
      targetId: `${pk} / ${pkgNo || '-'} (#${itemNo})`,
      summary: `ثبت آیتم جزئیات ردیف ${created.rowNo} (آیتم ${itemNo}) برای محموله ${pk} (${created.description || created.generalDescription})`,
    });
    store.saveImmediate();
    res.json({ item: computeDetailedEntry(created), transitUpdated });
  });

  app.post('/api/detailed/apply-reprocurement', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const payload = (req.body || {}) as ReprocurementApplyPayload;
    const sourceShipmentNo = normKey(payload.sourceShipmentNo);
    const sourcePackingQty = Number(payload.sourcePackingQty);
    const sourceCountingUnit = normalizeCountingUnitToFa(payload.sourceCountingUnit || '');
    if (!sourceShipmentNo || !Number.isFinite(sourcePackingQty) || sourcePackingQty <= 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره پکینگ لیست و تعداد پکینگ معتبر (بزرگتر از صفر) برای ثبت تأمین مجدد الزامی است',
          'Valid Packing List No. and positive Packing Qty are required for re-procurement linking',
        ),
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedSubstitutionRowIds = new Set<string>();
    const closedSubstitutionRowIds = new Set<string>();
    const updatedShortageRowIds = new Set<string>();
    const closedShortageRowIds = new Set<string>();
    const historyChanges: HistoryChange[] = [];
    const beforeMap = new Map<string, DetailedEntry>();
    const trackRow = (row: DetailedEntry) => {
      if (!beforeMap.has(row.id)) beforeMap.set(row.id, { ...row });
    };

    // 1) Substitution re-procurement matches -> append to Section B rows (fallback to selected row) & auto-close if qty matches
    for (const target of payload.substitutionTargets || []) {
      const selectedRow = store.db.detailed.find((d) => d.id === target.detailedId);
      if (!selectedRow) continue;
      const firstRepNo =
        normKey(target.repNo) ||
        (selectedRow.repNo || '').split(/[،,\n/]+/)[0]?.trim() ||
        '';
      const linkedSub =
        (target.substitutionId
          ? store.db.substitutions.find((s) => s.id === target.substitutionId)
          : undefined) ||
        (firstRepNo
          ? store.db.substitutions.find(
              (s) => normKey(s.docNo).toLowerCase() === firstRepNo.toLowerCase(),
            )
          : undefined) ||
        store.db.substitutions.find(
          (s) =>
            s.detailedId === selectedRow.id ||
            (s.originalItems || []).some((it) => it.detailedId === selectedRow.id) ||
            (s.substituteItems || []).some((it) => it.detailedId === selectedRow.id),
        );

      const repNoForText = linkedSub?.docNo || firstRepNo || '-';
      const noteLine = buildSubstitutionReprocurementNote(
        repNoForText,
        sourceShipmentNo,
        sourcePackingQty,
      );

      // Determine Section B Detailed rows; fallback to selectedRow if Section B has no Detailed IDs
      const sectionBIds = new Set<string>();
      if (linkedSub?.substituteItems) {
        for (const it of linkedSub.substituteItems) {
          if (it.detailedId && store.db.detailed.some((d) => d.id === it.detailedId)) {
            sectionBIds.add(it.detailedId);
          }
        }
      }
      if (sectionBIds.size === 0) {
        sectionBIds.add(selectedRow.id);
      }

      for (const bId of sectionBIds) {
        const bRow = store.db.detailed.find((d) => d.id === bId);
        if (!bRow) continue;
        trackRow(bRow);
        bRow.repDescription = appendMultilineLine(bRow.repDescription, noteLine);
        bRow.updatedAt = now;
        updatedSubstitutionRowIds.add(bRow.id);
      }

      const subLineMatch = linkedSub
        ? [...(linkedSub.substituteItems || []), ...(linkedSub.originalItems || [])].find(
            (it) => it.detailedId === selectedRow.id,
          )
        : undefined;
      const subQty = Number(subLineMatch?.qty ?? linkedSub?.qty ?? target.targetQty ?? selectedRow.packingQty ?? 0);
      if (shouldCloseSubstitution(sourcePackingQty, subQty)) {
        const closeIds = new Set<string>([selectedRow.id, ...sectionBIds]);
        if (linkedSub) {
          if (linkedSub.detailedId) closeIds.add(linkedSub.detailedId);
          for (const it of linkedSub.originalItems || []) {
            if (it.detailedId) closeIds.add(it.detailedId);
          }
        }
        for (const cId of closeIds) {
          const cRow = store.db.detailed.find((d) => d.id === cId);
          if (!cRow) continue;
          trackRow(cRow);
          cRow.repStatus = 'بسته';
          cRow.updatedAt = now;
          closedSubstitutionRowIds.add(cRow.id);
        }
      }
    }

    // 2) Shortage re-procurement matches -> append to merDescription & auto-close merStatus if packingQty == shortage + damagedQty
    for (const target of payload.shortageTargets || []) {
      const row = store.db.detailed.find((d) => d.id === target.detailedId);
      if (!row) continue;
      const computed = computeDetailedEntry(row);
      const unitLabel = sourceCountingUnit || normalizeCountingUnitToFa(row.countingUnit) || '';
      const noteLine = buildShortageReprocurementNote(
        sourcePackingQty,
        unitLabel,
        sourceShipmentNo,
      );
      trackRow(row);
      row.merDescription = appendMultilineLine(row.merDescription, noteLine);
      if (shouldCloseShortage(sourcePackingQty, computed.shortage, computed.damagedQty)) {
        row.merStatus = 'بسته';
        closedShortageRowIds.add(row.id);
      }
      row.updatedAt = now;
      updatedShortageRowIds.add(row.id);
    }

    for (const [id, before] of beforeMap.entries()) {
      const after = store.db.detailed.find((d) => d.id === id);
      if (after) {
        historyChanges.push({ scope: 'detailed', op: 'update', id, before, after: { ...after } });
      }
    }

    if (historyChanges.length > 0) {
      store.rebuildIndexes();
      store.history.push({
        labelFa: `تطبیق تأمین مجدد (${sourceShipmentNo}) برای ${historyChanges.length} ردیف`,
        labelEn: `Apply Re-procurement (${sourceShipmentNo}) to ${historyChanges.length} rows`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: historyChanges,
      });
      store.addAudit({
        user: sanitizeUser(req.currentUser!),
        action: 'APPLY_REPROCUREMENT_MATCH',
        scope: 'detailed',
        targetId: sourceShipmentNo,
        summary: `ثبت تأمین مجدد با پکینگ ${sourceShipmentNo} (تعداد ${sourcePackingQty}) برای ${updatedSubstitutionRowIds.size} ردیف جایگزینی و ${updatedShortageRowIds.size} ردیف کسری`,
      });
      store.saveImmediate();
    }

    const response: ReprocurementApplyResponse = {
      ok: true,
      updatedSubstitutionRowIds: Array.from(updatedSubstitutionRowIds),
      closedSubstitutionRowIds: Array.from(closedSubstitutionRowIds),
      updatedShortageRowIds: Array.from(updatedShortageRowIds),
      closedShortageRowIds: Array.from(closedShortageRowIds),
    };
    res.json(response);
  });

  app.patch('/api/detailed/bulk', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids, patch } = req.body as { ids?: string[]; patch?: Partial<DetailedEntry> };
    if (!Array.isArray(ids) || ids.length === 0 || !patch || typeof patch !== 'object') {
      res.status(400).json({ error: errMsg(req, 'شناسه ردیف‌ها و تغییرات الزامی است', 'Row IDs and patch data are required') });
      return;
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof DetailedEntry)[] = [
      'arrivalDate', 'supplier', 'origin', 'island', 'system', 'subSystem', 'unit',
      'countingUnit', 'storageLocation', 'receiver', 'notes', 'itemCategory',
      'chemicalType', 'productionDate', 'expirationDate', 'merStatus', 'merDescription',
      'repStatus', 'repReprocured', 'repDescription', 'balanceStatus', 'mivReceiver', 'smrDeliverer',
    ];
    const multilineBulkFields = new Set<keyof DetailedEntry>(['notes', 'merDescription', 'repDescription']);
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        if (k === 'countingUnit') {
          cleanPatch[k] = normalizeCountingUnitToFa(String(patch[k]));
        } else if (k === 'repStatus') {
          cleanPatch[k] = normalizeRepStatus(String(patch[k]));
        } else if (multilineBulkFields.has(k)) {
          cleanPatch[k] = preserveMultilineText(patch[k]);
        } else {
          cleanPatch[k] = normKey(String(patch[k]));
        }
      }
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    const historyChanges: HistoryChange[] = [];
    for (const d of store.db.detailed) {
      if (!idSet.has(d.id)) continue;
      const before = { ...d };
      Object.assign(d, cleanPatch, { updatedAt: now });
      historyChanges.push({ scope: 'detailed', op: 'update', id: d.id, before, after: { ...d } });
      updatedCount += 1;
    }
    store.renumberScope('detailed');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `ویرایش گروهی ${updatedCount} ردیف جزئیات`,
        labelEn: `Bulk Edit ${updatedCount} Detailed Rows`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: historyChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_UPDATE_DETAILED',
      scope: 'detailed',
      targetId: `${updatedCount} rows`,
      summary: `ویرایش گروهی ${updatedCount} ردیف در ثبت جزئیات تجهیزات`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  app.patch('/api/detailed/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...patch } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.shipmentNo ?? item.shipmentNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    const nextPkg = normKey(patch.packageNo ?? item.packageNo);
    const nextItemNo = normalizeDigits(normKey(patch.itemNo ?? item.itemNo));
    if (nextItemNo && store.isDetailedItemNoTaken(pk, nextPkg, nextItemNo, item.id)) {
      res.status(409).json({
        code: 'DUPLICATE_ITEM_NO',
        error: errMsg(
          req,
          `شماره آیتم ${nextItemNo} برای پکینگ «${pk}» و نگله «${nextPkg || '-'}» تکراری است.`,
          `Item No. ${nextItemNo} already exists for Packing "${pk}" and Package "${nextPkg || '-'}".`,
        ),
      });
      return;
    }

    if (patch.generalDescription !== undefined) {
      patch.generalDescription = formatGeneralDescriptionCase(patch.generalDescription);
    }
    if (patch.countingUnit !== undefined) {
      patch.countingUnit = normalizeCountingUnitToFa(patch.countingUnit);
    }
    if (patch.description !== undefined) {
      patch.description = preserveMultilineText(patch.description);
    }
    if (patch.notes !== undefined) {
      patch.notes = preserveMultilineText(patch.notes);
    }
    if (patch.repDescription !== undefined) {
      patch.repDescription = preserveMultilineText(patch.repDescription);
    }
    if (patch.merDescription !== undefined) {
      patch.merDescription = preserveMultilineText(patch.merDescription);
    }
    if (patch.smrContractorNote !== undefined) {
      patch.smrContractorNote = preserveMultilineText(patch.smrContractorNote);
    }
    if (patch.smrMapnaNote !== undefined) {
      patch.smrMapnaNote = preserveMultilineText(patch.smrMapnaNote);
    }
    if (patch.stocktakeInfo !== undefined) {
      patch.stocktakeInfo = preserveMultilineText(patch.stocktakeInfo);
    }
    if (patch.repStatus !== undefined) {
      const nextRepNo = patch.repNo !== undefined ? normKey(patch.repNo) : normKey(item.repNo);
      patch.repStatus = normalizeRepStatus(patch.repStatus, Boolean(nextRepNo));
    }

    const beforeDetailed = { ...item };
    const { itemImage: patchImage, itemImageThumb: patchThumb, ...restPatch } = patch;
    Object.assign(item, {
      ...restPatch,
      shipmentNo: pk,
      packageNo: nextPkg,
      itemNo: nextItemNo,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    if (patchImage !== undefined) {
      if (typeof patchImage === 'string' && patchImage.startsWith('data:image/')) {
        item.itemImage = patchImage;
        item.itemImageThumb =
          typeof patchThumb === 'string' && patchThumb.startsWith('data:image/')
            ? patchThumb
            : patchImage;
      } else {
        delete item.itemImage;
        delete item.itemImageThumb;
      }
    }
    store.renumberScope('detailed');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `ویرایش ردیف جزئیات ${item.shipmentNo} (#${item.rowNo})`,
      labelEn: `Edit Detailed Row ${item.shipmentNo} (#${item.rowNo})`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'detailed', op: 'update', id: item.id, before: beforeDetailed, after: { ...item } }],
    });
    const transitUpdated = store.syncTransitArrival(item.shipmentNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_DETAILED',
      scope: 'detailed',
      targetId: `${item.shipmentNo} (#${item.rowNo})`,
      summary: `ویرایش آیتم جزئیات ردیف ${item.rowNo} (${item.shipmentNo})`,
    });
    store.saveImmediate();
    res.json({ item: computeDetailedEntry(item), transitUpdated });
  });

  // Shortage Backfill / Partial Recovery (even with duplicate/separate شماره محموله & later date)
  app.post('/api/detailed/:id/backfill', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { qty, arrivalDate, shipmentNo, packageNo, note } = req.body as {
      qty?: number;
      arrivalDate?: string;
      shipmentNo?: string;
      packageNo?: string;
      note?: string;
    };
    if (!qty || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: errMsg(req, 'تعداد جبران کسری باید بزرگتر از صفر باشد', 'Fulfilled quantity must be greater than zero') });
      return;
    }
    const record: ShortageBackfillRecord = {
      id: crypto.randomUUID(),
      qty,
      arrivalDate: normKey(arrivalDate),
      shipmentNo: normKey(shipmentNo) || item.shipmentNo,
      packageNo: normKey(packageNo) || item.packageNo,
      note: normKey(note),
      recordedBy: req.currentUser!.fullName || req.currentUser!.username,
      recordedAt: new Date().toISOString(),
    };
    const beforeBackfill = { ...item, shortageBackfills: [...(item.shortageBackfills || [])] };
    item.shortageBackfills = [...(item.shortageBackfills || []), record];
    item.updatedAt = new Date().toISOString();
    store.history.push({
      labelFa: `جبران کسری ردیف ${item.rowNo} (${qty})`,
      labelEn: `Backfill Shortage Row ${item.rowNo} (${qty})`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'detailed', op: 'update', id: item.id, before: beforeBackfill, after: { ...item } }],
    });

    const computed = computeDetailedEntry(item);
    const transitUpdated = store.syncTransitArrival(record.shipmentNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BACKFILL_SHORTAGE',
      scope: 'detailed',
      targetId: `${item.shipmentNo} (#${item.rowNo})`,
      summary: `جبران کسری به مقدار ${qty} برای ردیف ${item.rowNo} (شماره محموله جدید: ${record.shipmentNo}، کسری باقیمانده: ${computed.shortage})`,
    });
    store.saveImmediate();
    res.json({ item: computed, transitUpdated });
  });

  app.delete('/api/detailed/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.detailed.findIndex((d) => d.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const [removed] = store.db.detailed.splice(idx, 1);
    const trashEntry: TrashRecord = {
      id: makeId(),
      scope: 'detailed',
      deletedAt: new Date().toISOString(),
      deletedBy: req.currentUser!.fullName || req.currentUser!.username,
      targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
      data: removed,
    };
    store.db.trash.unshift(trashEntry);
    store.renumberScope('detailed');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `حذف ردیف جزئیات ${removed.shipmentNo} (#${removed.rowNo})`,
      labelEn: `Delete Detailed Row ${removed.shipmentNo} (#${removed.rowNo})`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [
        { scope: 'detailed', op: 'delete', id: removed.id, before: removed, index: idx },
        { scope: 'trash', op: 'insert', id: trashEntry.id, after: trashEntry },
      ],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_DETAILED',
      scope: 'detailed',
      targetId: `${removed.shipmentNo} (#${removed.rowNo})`,
      summary: `انتقال ردیف جزئیات ${removed.rowNo} (${removed.shipmentNo}) به سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // (PATCH /api/detailed/bulk registered above /api/detailed/:id to avoid route shadowing)

  app.post('/api/detailed/bulk-delete', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: errMsg(req, 'هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion') });
      return;
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = req.currentUser!.fullName || req.currentUser!.username;
    const removedRows: DetailedEntry[] = [];
    const historyChanges: HistoryChange[] = [];
    store.db.detailed = store.db.detailed.filter((d, di) => {
      if (idSet.has(d.id)) {
        removedRows.push(d);
        historyChanges.push({ scope: 'detailed', op: 'delete', id: d.id, before: d, index: di });
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      const tr: TrashRecord = {
        id: makeId(),
        scope: 'detailed',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
        data: removed,
      };
      store.db.trash.unshift(tr);
      historyChanges.push({ scope: 'trash', op: 'insert', id: tr.id, after: tr });
    }
    store.renumberScope('detailed');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `حذف گروهی ${removedRows.length} ردیف جزئیات`,
        labelEn: `Bulk Delete ${removedRows.length} Detailed Rows`,
        user: deletedBy,
        changes: historyChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_DELETE_DETAILED',
      scope: 'detailed',
      targetId: `${removedRows.length} rows`,
      summary: `حذف گروهی ${removedRows.length} ردیف از ثبت جزئیات تجهیزات (انتقال به سطل بازیافت)`,
    });
    store.saveImmediate();
    res.json({ ok: true, deletedCount: removedRows.length });
  });

  // ---------------- IN-TRANSIT (در راه) ----------------
  app.get('/api/transit', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const status = String(req.query.status || '');
    const supplier = String(req.query.supplier || '');
    const system = String(req.query.system || '');
    const subSystem = String(req.query.subSystem || '');
    const unit = String(req.query.unit || '');
    const dispatchLocation = String(req.query.dispatchLocation || '');
    const carrierContractor = String(req.query.carrierContractor || '');
    const packingNos = parsePackingNosParam(String(req.query.packingNos || ''));
    const customFilters = parseCustomFiltersParam(String(req.query.customFilters || ''));
    const colFilters = parseColFiltersParam(String(req.query.colFilters || ''));
    const calendar: CalendarMode = req.query.calendar === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = String(req.query.sortBy || '').trim();
    const sortDir: 'asc' | 'desc' = req.query.sortDir === 'desc' ? 'desc' : 'asc';
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const fetchAll = String(req.query.all || '') === 'true';
    const allIds = String(req.query.allIds || '') === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(5000, Math.max(10, Number(req.query.pageSize || 50)));

    const compiledColFilters = compileColFilters(colFilters);
    const filteredRaw = store.db.transit.filter((t) => {
      if (status && t.overallStatus !== status) return false;
      if (supplier && t.supplier !== supplier) return false;
      if (system && t.system !== system) return false;
      if (subSystem && t.subSystem !== subSystem) return false;
      if (unit && t.unit !== unit) return false;
      if (dispatchLocation && t.dispatchLocation !== dispatchLocation) return false;
      if (carrierContractor && t.carrierContractor !== carrierContractor) return false;
      if (!matchesMultiPacking(t.packingListNo, packingNos)) return false;
      if (!matchesCustomFilters(t as unknown as Record<string, unknown>, customFilters)) return false;
      if (compiledColFilters.length > 0 && !matchesCompiledColFilters(t as unknown as Record<string, unknown>, compiledColFilters, calendar)) return false;
      if (!inDateRange(t.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          t.rowNo,
          t.overallStatus,
          t.packingListNo,
          t.packageNo,
          t.itemDescription,
          t.supplier,
          t.dispatchLocation,
          t.releaseNetNo,
          t.interimNo,
          t.system,
          t.subSystem,
          t.unit,
          t.equipmentSupplyCode,
          t.carrierContractor,
          t.billOfLadingNo,
        ],
        q,
      );
    });

    const filtered = sortBy
      ? (sortRowsByColumn(filteredRaw as unknown as Record<string, unknown>[], sortBy, sortDir) as unknown as TransitEntry[])
      : [...filteredRaw].reverse();

    const total = filtered.length;
    const filteredSummary = computeSelectionFormulaSummary({ transit: filtered });

    if (allIds) {
      res.json({
        ids: filtered.map((t) => t.id),
        total,
        filteredSummary,
      });
      return;
    }

    const start = (page - 1) * pageSize;
    const items = fetchAll ? filtered : filtered.slice(start, start + pageSize);

    res.json({
      items,
      total,
      page: fetchAll ? 1 : page,
      pageSize: fetchAll ? Math.max(1, total) : pageSize,
      totalPages: fetchAll ? 1 : Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
    });
  });

  app.post('/api/transit', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { rowNo: _ignoredRowNo, ...raw } = req.body as Partial<TransitEntry>;
    const now = new Date().toISOString();
    const pk = normKey(raw.packingListNo);
    const alreadyInWarehouse =
      pk && ((store.generalByPacking.get(pk)?.length || 0) > 0 || (store.detailedByPacking.get(pk)?.length || 0) > 0);

    const requestedStatus = normalizeTransitStatus(
      raw.overallStatus,
      store.db.categories.transitStatus,
    );
    const resolvedStatus = alreadyInWarehouse ? 'رسیده' : requestedStatus;

    const created: TransitEntry = {
      id: makeId(),
      rowNo: '0',
      arrivalDate: normKey(raw.arrivalDate),
      overallStatus: resolvedStatus,
      inspectionRequest: normKey(raw.inspectionRequest),
      releaseNetNo: normKey(raw.releaseNetNo),
      releaseNetDate: normKey(raw.releaseNetDate),
      mapnaShippingNotice: normKey(raw.mapnaShippingNotice),
      interimNo: normKey(raw.interimNo),
      interimDate: normKey(raw.interimDate),
      supplier: normKey(raw.supplier),
      dispatchLocation: normKey(raw.dispatchLocation),
      packingListNo: pk,
      packageNo: normKey(raw.packageNo),
      itemDescription: normKey(raw.itemDescription),
      system: normKey(raw.system),
      subSystem: normKey(raw.subSystem),
      unit: normKey(raw.unit),
      equipmentSupplyCode: normKey(raw.equipmentSupplyCode),
      carrierContractor: normKey(raw.carrierContractor),
      billOfLadingNo: normKey(raw.billOfLadingNo),
      amount: raw.amount ?? null,
      linkedGeneralPackingNo: alreadyInWarehouse ? pk : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };

    store.db.transit.unshift(created);
    store.renumberScope('transit');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `ثبت محموله در راه ${pk || created.rowNo}`,
      labelEn: `Add In-Transit Shipment ${pk || created.rowNo}`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'transit', op: 'insert', id: created.id, after: created }],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_TRANSIT',
      scope: 'transit',
      targetId: `${pk || created.rowNo}`,
      summary: `ثبت محموله در راه ${pk || created.rowNo} (${created.overallStatus})`,
    });
    store.saveImmediate();
    res.json({ item: created });
  });

  app.patch('/api/transit/bulk', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids, patch } = req.body as { ids?: string[]; patch?: Partial<TransitEntry> };
    if (!Array.isArray(ids) || ids.length === 0 || !patch || typeof patch !== 'object') {
      res.status(400).json({ error: errMsg(req, 'شناسه ردیف‌ها و تغییرات الزامی است', 'Row IDs and patch data are required') });
      return;
    }
    const idSet = new Set(ids);
    const cleanPatch: Record<string, unknown> = {};
    const stringFields: (keyof TransitEntry)[] = [
      'arrivalDate', 'overallStatus', 'inspectionRequest', 'releaseNetNo', 'releaseNetDate',
      'mapnaShippingNotice', 'interimNo', 'interimDate', 'supplier', 'dispatchLocation',
      'system', 'subSystem', 'unit', 'equipmentSupplyCode', 'carrierContractor', 'billOfLadingNo',
    ];
    for (const k of stringFields) {
      if (patch[k] !== undefined && String(patch[k]).trim() !== '') {
        cleanPatch[k] = k === 'overallStatus'
          ? normalizeTransitStatus(String(patch[k]), store.db.categories.transitStatus)
          : normKey(String(patch[k]));
      }
    }
    if (patch.amount !== undefined && patch.amount !== null && Number.isFinite(Number(patch.amount))) {
      cleanPatch.amount = Number(patch.amount);
    }

    const now = new Date().toISOString();
    let updatedCount = 0;
    const historyChanges: HistoryChange[] = [];
    for (const t of store.db.transit) {
      if (!idSet.has(t.id)) continue;
      const before = { ...t };
      Object.assign(t, cleanPatch, { updatedAt: now });
      historyChanges.push({ scope: 'transit', op: 'update', id: t.id, before, after: { ...t } });
      updatedCount += 1;
    }

    store.renumberScope('transit');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `ویرایش گروهی ${updatedCount} ردیف در راه`,
        labelEn: `Bulk Edit ${updatedCount} In-Transit Rows`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: historyChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_UPDATE_TRANSIT',
      scope: 'transit',
      targetId: `${updatedCount} rows`,
      summary: `ویرایش گروهی ${updatedCount} ردیف در بخش در راه`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  app.post('/api/transit/bulk-delete', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: errMsg(req, 'هیچ ردیفی برای حذف انتخاب نشده است', 'No rows selected for deletion') });
      return;
    }
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const deletedBy = req.currentUser!.fullName || req.currentUser!.username;
    const removedRows: TransitEntry[] = [];
    const historyChanges: HistoryChange[] = [];
    store.db.transit = store.db.transit.filter((t, ti) => {
      if (idSet.has(t.id)) {
        removedRows.push(t);
        historyChanges.push({ scope: 'transit', op: 'delete', id: t.id, before: t, index: ti });
        return false;
      }
      return true;
    });
    for (const removed of removedRows) {
      const tr: TrashRecord = {
        id: makeId(),
        scope: 'transit',
        deletedAt: now,
        deletedBy,
        targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
        data: removed,
      };
      store.db.trash.unshift(tr);
      historyChanges.push({ scope: 'trash', op: 'insert', id: tr.id, after: tr });
    }
    store.renumberScope('transit');
    store.rebuildIndexes();
    if (historyChanges.length > 0) {
      store.history.push({
        labelFa: `حذف گروهی ${removedRows.length} ردیف در راه`,
        labelEn: `Bulk Delete ${removedRows.length} In-Transit Rows`,
        user: deletedBy,
        changes: historyChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_DELETE_TRANSIT',
      scope: 'transit',
      targetId: `${removedRows.length} rows`,
      summary: `حذف گروهی ${removedRows.length} ردیف از بخش در راه (انتقال به سطل بازیافت)`,
    });
    store.saveImmediate();
    res.json({ ok: true, deletedCount: removedRows.length });
  });

  app.patch('/api/transit/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.transit.find((t) => t.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { rowNo: _ignoredRowNo, ...patch } = req.body as Partial<TransitEntry>;
    if (patch.overallStatus !== undefined) {
      patch.overallStatus = normalizeTransitStatus(
        patch.overallStatus,
        store.db.categories.transitStatus,
      );
    }
    const beforeTransit = { ...item };
    Object.assign(item, {
      ...patch,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.renumberScope('transit');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `ویرایش محموله در راه ${item.packingListNo || item.rowNo}`,
      labelEn: `Edit In-Transit ${item.packingListNo || item.rowNo}`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'transit', op: 'update', id: item.id, before: beforeTransit, after: { ...item } }],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_TRANSIT',
      scope: 'transit',
      targetId: `${item.packingListNo || item.rowNo}`,
      summary: `ویرایش محموله در راه ${item.packingListNo || item.rowNo} (${item.overallStatus})`,
    });
    store.saveImmediate();
    res.json({ item });
  });

  app.delete('/api/transit/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.transit.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const [removed] = store.db.transit.splice(idx, 1);
    const trashEntry: TrashRecord = {
      id: makeId(),
      scope: 'transit',
      deletedAt: new Date().toISOString(),
      deletedBy: req.currentUser!.fullName || req.currentUser!.username,
      targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
      data: removed,
    };
    store.db.trash.unshift(trashEntry);
    store.renumberScope('transit');
    store.rebuildIndexes();
    store.history.push({
      labelFa: `حذف محموله در راه ${removed.packingListNo || removed.rowNo}`,
      labelEn: `Delete In-Transit ${removed.packingListNo || removed.rowNo}`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [
        { scope: 'transit', op: 'delete', id: removed.id, before: removed, index: idx },
        { scope: 'trash', op: 'insert', id: trashEntry.id, after: trashEntry },
      ],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_TRANSIT',
      scope: 'transit',
      targetId: `${removed.packingListNo || removed.rowNo}`,
      summary: `انتقال ردیف در راه ${removed.packingListNo || removed.rowNo} به سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- RECYCLE BIN / TRASH (سطل بازیافت) ----------------
  app.get('/api/trash', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const scope = String(req.query.scope || '').trim();
    const q = String(req.query.q || '');
    const colFilters = parseColFiltersParam(String(req.query.colFilters || ''));
    const calendar: CalendarMode = req.query.calendar === 'gregorian' ? 'gregorian' : 'jalali';
    const sortBy = String(req.query.sortBy || '').trim();
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : req.query.sortDir === 'desc' ? 'desc' : '';
    const idsOnly = String(req.query.idsOnly || '') === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(500, Math.max(10, Number(req.query.pageSize || 50)));

    const { getLinkedCount, scopeCounts } = buildTrashLinkedDetailedCounts(store.db.trash);
    const hasColFilters = Object.keys(colFilters).length > 0;
    const compiledColFilters = hasColFilters ? compileColFilters(colFilters) : null;
    const needProjection = hasColFilters || Boolean(sortBy) || Boolean(q.trim());

    const matchedEntries: Array<{ item: TrashRecord; projected?: Record<string, unknown> }> = [];
    for (let i = 0; i < store.db.trash.length; i += 1) {
      const item = store.db.trash[i];
      if (scope && item.scope !== scope) continue;
      if (needProjection) {
        const proj = projectTrashRowForQuery(item);
        if (
          q.trim() &&
          !matchSearch(
            [
              item.targetLabel,
              item.deletedBy,
              item.scope,
              proj.packingNo,
              proj.packageNo,
              proj.itemNo,
              proj.description,
              proj.supplier,
              proj.island,
            ],
            q,
          )
        ) {
          continue;
        }
        if (compiledColFilters && !matchesCompiledColFilters(proj, compiledColFilters, calendar)) {
          continue;
        }
        matchedEntries.push({ item, projected: proj });
      } else {
        matchedEntries.push({ item });
      }
    }

    if (sortBy && sortDir) {
      const projectedList = matchedEntries.map((entry, idx) => ({
        ...(entry.projected || projectTrashRowForQuery(entry.item)),
        __origIdx: idx,
      }));
      const sorted = sortRowsByColumn(projectedList, sortBy, sortDir);
      const reordered: typeof matchedEntries = new Array(sorted.length);
      for (let i = 0; i < sorted.length; i += 1) {
        reordered[i] = matchedEntries[Number(sorted[i].__origIdx)];
      }
      matchedEntries.length = 0;
      matchedEntries.push(...reordered);
    }

    const total = matchedEntries.length;
    if (idsOnly) {
      res.json({
        ids: matchedEntries.map((e) => e.item.id),
        total,
        scopeCounts,
      });
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const slice = matchedEntries.slice(start, start + pageSize);
    const items = slice.map(({ item }) =>
      item.scope === 'general'
        ? { ...item, linkedTrashDetailedCount: getLinkedCount(item) }
        : item,
    );

    res.json({
      items,
      total,
      page: safePage,
      pageSize,
      totalPages,
      scopeCounts,
    });
  });

  app.post('/api/trash/bulk-restore', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids, restoreDetailed } = req.body as { ids?: string[]; restoreDetailed?: boolean };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: errMsg(req, 'هیچ ردیفی برای بازیابی انتخاب نشده است', 'No rows selected for restore') });
      return;
    }

    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const activeDupKeys = buildActiveDupKeySets(store.db);

    const restoredGeneral: GeneralEntry[] = [];
    const restoredDetailed: DetailedEntry[] = [];
    const restoredTransit: TransitEntry[] = [];
    const linkedGeneralPairs: Array<{ pk: string; pkg: string }> = [];
    const remainingAfterPrimary: TrashRecord[] = [];
    let restoredCount = 0;
    let restoredDetailedCount = 0;
    let skippedConflicts = 0;

    for (let i = 0; i < store.db.trash.length; i += 1) {
      const entry = store.db.trash[i];
      if (!idSet.has(entry.id)) {
        remainingAfterPrimary.push(entry);
        continue;
      }
      const dupKey = buildTrashEntryDupKey(entry.scope, entry.data);
      if (entry.scope === 'general') {
        const g = entry.data as GeneralEntry;
        if (dupKey && activeDupKeys.general.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.general.add(dupKey);
        restoredGeneral.push({ ...g, updatedAt: now });
        restoredCount += 1;
        if (restoreDetailed) {
          const pk = normKey(g.packingListNo);
          if (pk) linkedGeneralPairs.push({ pk, pkg: normKey(g.packageNo) });
        }
      } else if (entry.scope === 'detailed') {
        const d = entry.data as DetailedEntry;
        if (dupKey && activeDupKeys.detailed.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.detailed.add(dupKey);
        restoredDetailed.push({ ...d, updatedAt: now });
        restoredCount += 1;
      } else {
        const t = entry.data as TransitEntry;
        if (dupKey && activeDupKeys.transit.has(dupKey)) {
          skippedConflicts += 1;
          remainingAfterPrimary.push(entry);
          continue;
        }
        if (dupKey) activeDupKeys.transit.add(dupKey);
        restoredTransit.push({ ...t, updatedAt: now });
        restoredCount += 1;
      }
    }

    let finalRemainingTrash = remainingAfterPrimary;
    if (restoreDetailed && linkedGeneralPairs.length > 0) {
      const exactPairs = new Set<string>();
      const wholePackings = new Set<string>();
      for (const pair of linkedGeneralPairs) {
        if (pair.pkg) exactPairs.add(`${pair.pk}\u0000${pair.pkg}`);
        else wholePackings.add(pair.pk);
      }
      const nextRemaining: TrashRecord[] = [];
      for (let i = 0; i < remainingAfterPrimary.length; i += 1) {
        const tr = remainingAfterPrimary[i];
        if (tr.scope === 'detailed') {
          const d = tr.data as DetailedEntry;
          const pk = normKey(d.shipmentNo);
          const pkg = normKey(d.packageNo);
          const matches = wholePackings.has(pk) || exactPairs.has(`${pk}\u0000${pkg}`);
          if (matches) {
            const detKey = buildDetailedDupKey(d);
            if (!detKey || !activeDupKeys.detailed.has(detKey)) {
              if (detKey) activeDupKeys.detailed.add(detKey);
              restoredDetailed.push({ ...d, updatedAt: now });
              restoredDetailedCount += 1;
              continue;
            }
          }
        }
        nextRemaining.push(tr);
      }
      finalRemainingTrash = nextRemaining;
    }

    const removedTrashSet = new Set(finalRemainingTrash.map((x) => x.id));
    const restoreHistoryChanges: HistoryChange[] = [];
    for (let ti = 0; ti < store.db.trash.length; ti += 1) {
      const tr = store.db.trash[ti];
      if (!removedTrashSet.has(tr.id)) {
        restoreHistoryChanges.push({ scope: 'trash', op: 'delete', id: tr.id, before: tr, index: ti });
      }
    }
    for (const g of restoredGeneral) restoreHistoryChanges.push({ scope: 'general', op: 'insert', id: g.id, after: g });
    for (const d of restoredDetailed) restoreHistoryChanges.push({ scope: 'detailed', op: 'insert', id: d.id, after: d });
    for (const t of restoredTransit) restoreHistoryChanges.push({ scope: 'transit', op: 'insert', id: t.id, after: t });

    store.db.trash = finalRemainingTrash;
    if (restoredGeneral.length > 0) {
      store.db.general = [...restoredGeneral, ...store.db.general];
      store.renumberScope('general');
    }
    if (restoredDetailed.length > 0) {
      store.db.detailed = [...restoredDetailed, ...store.db.detailed];
      store.renumberScope('detailed');
    }
    if (restoredTransit.length > 0) {
      store.db.transit = [...restoredTransit, ...store.db.transit];
      store.renumberScope('transit');
    }
    store.rebuildIndexes();
    if (restoreHistoryChanges.length > 0) {
      store.history.push({
        labelFa: `بازیابی گروهی ${restoredCount} ردیف از سطل بازیافت`,
        labelEn: `Bulk Restore ${restoredCount} Rows from Trash`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: restoreHistoryChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_RESTORE_TRASH',
      scope: 'trash',
      targetId: `${restoredCount} rows`,
      summary: `بازیابی گروهی ${restoredCount} ردیف از سطل بازیافت${
        restoredDetailedCount > 0 ? ` همراه با ${restoredDetailedCount} ردیف جزئیات مرتبط` : ''
      }${skippedConflicts > 0 ? ` (${skippedConflicts} مورد تکراری رد شد)` : ''}`,
    });
    store.saveImmediate();
    res.json({ ok: true, restoredCount, restoredDetailedCount, skippedConflicts });
  });

  app.post('/api/trash/bulk-delete', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: errMsg(req, 'هیچ ردیفی برای حذف دائمی انتخاب نشده است', 'No rows selected for permanent deletion') });
      return;
    }
    const idSet = new Set(ids);
    const before = store.db.trash.length;
    store.db.trash = store.db.trash.filter((item) => !idSet.has(item.id));
    const deletedCount = before - store.db.trash.length;
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BULK_PURGE_TRASH',
      scope: 'trash',
      targetId: `${deletedCount} rows`,
      summary: `حذف دائمی گروهی ${deletedCount} ردیف از سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true, deletedCount });
  });

  app.post('/api/trash/:id/restore', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.trash.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'آیتم در سطل بازیافت یافت نشد', 'Trash item not found') });
      return;
    }
    const restoreDetailed = String(req.query.restoreDetailed || '') === 'true';
    const entry = store.db.trash[idx];
    let restoredDetailedCount = 0;

    const restoreSingleChanges: HistoryChange[] = [];
    if (isTrashRestoreDuplicate(entry, store.db)) {
      if (entry.scope === 'general') {
        const g = entry.data as GeneralEntry;
        res.status(409).json({
          error: errMsg(
            req,
            `این ردیف تجهیزات کلی (پکینگ ${g.packingListNo || '-'} / نگله ${g.packageNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول ثبت کلی وجود دارد.`,
            `This general row (Packing ${g.packingListNo || '-'} / Package ${g.packageNo || '-'}) already exists in the General register according to duplicate rules.`,
          ),
        });
        return;
      }
      if (entry.scope === 'detailed') {
        const d = entry.data as DetailedEntry;
        res.status(409).json({
          error: errMsg(
            req,
            `این ردیف جزئیات (محموله ${d.shipmentNo || '-'} / نگله ${d.packageNo || '-'} / آیتم ${d.itemNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول جزئیات وجود دارد.`,
            `This detailed row (Shipment ${d.shipmentNo || '-'} / Package ${d.packageNo || '-'} / Item ${d.itemNo || '-'}) already exists in the Detailed register according to duplicate rules.`,
          ),
        });
        return;
      }
      const t = entry.data as TransitEntry;
      res.status(409).json({
        error: errMsg(
          req,
          `این محموله در راه (پکینگ ${t.packingListNo || '-'} / نگله ${t.packageNo || '-'}) بر اساس قوانین تکراری، قبلاً در جدول محموله‌های در راه وجود دارد.`,
          `This in-transit row (Packing ${t.packingListNo || '-'} / Package ${t.packageNo || '-'}) already exists in the In-Transit register according to duplicate rules.`,
        ),
      });
      return;
    }

    if (entry.scope === 'general') {
      const g = entry.data as GeneralEntry;
      const restoredG = { ...g, updatedAt: new Date().toISOString() };
      store.db.trash.splice(idx, 1);
      restoreSingleChanges.push({ scope: 'trash', op: 'delete', id: entry.id, before: entry, index: idx });
      store.db.general.unshift(restoredG);
      restoreSingleChanges.push({ scope: 'general', op: 'insert', id: restoredG.id, after: restoredG });
      store.renumberScope('general');

      if (restoreDetailed) {
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const existingDetKeys = new Set<string>();
        for (const d of store.db.detailed) {
          const dk = buildDetailedDupKey(d);
          if (dk) existingDetKeys.add(dk);
        }
        const restoredLinked: DetailedEntry[] = [];
        const remainingTrash: TrashRecord[] = [];
        for (let ti = 0; ti < store.db.trash.length; ti += 1) {
          const tr = store.db.trash[ti];
          if (tr.scope === 'detailed') {
            const d = tr.data as DetailedEntry;
            const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            const detKey = buildDetailedDupKey(d);
            if (matches && (!detKey || !existingDetKeys.has(detKey))) {
              if (detKey) existingDetKeys.add(detKey);
              const restoredD = { ...d, updatedAt: new Date().toISOString() };
              restoredLinked.push(restoredD);
              restoreSingleChanges.push({ scope: 'trash', op: 'delete', id: tr.id, before: tr, index: ti });
              restoreSingleChanges.push({ scope: 'detailed', op: 'insert', id: restoredD.id, after: restoredD });
              restoredDetailedCount += 1;
              continue;
            }
          }
          remainingTrash.push(tr);
        }
        store.db.trash = remainingTrash;
        if (restoredLinked.length > 0) {
          store.db.detailed = [...restoredLinked, ...store.db.detailed];
          store.renumberScope('detailed');
        }
      }
    } else if (entry.scope === 'detailed') {
      const d = entry.data as DetailedEntry;
      const restoredD = { ...d, updatedAt: new Date().toISOString() };
      store.db.trash.splice(idx, 1);
      restoreSingleChanges.push({ scope: 'trash', op: 'delete', id: entry.id, before: entry, index: idx });
      store.db.detailed.unshift(restoredD);
      restoreSingleChanges.push({ scope: 'detailed', op: 'insert', id: restoredD.id, after: restoredD });
      store.renumberScope('detailed');
    } else {
      const t = entry.data as TransitEntry;
      const restoredT = { ...t, updatedAt: new Date().toISOString() };
      store.db.trash.splice(idx, 1);
      restoreSingleChanges.push({ scope: 'trash', op: 'delete', id: entry.id, before: entry, index: idx });
      store.db.transit.unshift(restoredT);
      restoreSingleChanges.push({ scope: 'transit', op: 'insert', id: restoredT.id, after: restoredT });
      store.renumberScope('transit');
    }

    store.rebuildIndexes();
    if (restoreSingleChanges.length > 0) {
      store.history.push({
        labelFa: `بازیابی ردیف (${entry.targetLabel})`,
        labelEn: `Restore Row (${entry.targetLabel})`,
        user: req.currentUser!.fullName || req.currentUser!.username,
        changes: restoreSingleChanges,
      });
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'RESTORE_TRASH',
      scope: 'trash',
      targetId: entry.targetLabel,
      summary: `بازیابی ردیف ${entry.scope} (${entry.targetLabel})${
        restoredDetailedCount > 0 ? ` همراه با ${restoredDetailedCount} ردیف جزئیات` : ''
      }`,
    });
    store.saveImmediate();
    res.json({ ok: true, restoredDetailedCount });
  });

  app.delete('/api/trash/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.trash.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'آیتم در سطل بازیافت یافت نشد', 'Trash item not found') });
      return;
    }
    const [purged] = store.db.trash.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'PURGE_TRASH',
      scope: 'trash',
      targetId: purged.targetLabel,
      summary: `حذف دائمی ردیف ${purged.scope} (${purged.targetLabel}) از سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- SITE ENTRY MINUTES ----------------
  app.get('/api/site-entry', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      minutes: store.db.siteEntryMinutes,
      generalEntries: [...store.db.general].reverse(),
      transitEntries: [...store.db.transit].reverse(),
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    });
  });

  app.post('/api/site-entry', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo);
    const cleanPackings = Array.from(new Set((raw.packingListNos || []).map(normKey).filter(Boolean)));
    const resolvedArrival = resolveSiteEntryArrivalAndRelease(
      cleanPackings,
      raw.releaseNoteNo,
      store.db.general,
      store.db.transit,
    );
    if (resolvedArrival.errorFa) {
      res.status(400).json({ error: errMsg(req, resolvedArrival.errorFa, resolvedArrival.errorEn || resolvedArrival.errorFa) });
      return;
    }
    const cleanDate = resolvedArrival.resolvedArrivalDate || normKey(raw.date);
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }
    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            description: normKey(it?.description),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            dimensions: normKey(it?.dimensions),
            qty: normKey(it?.qty),
            unit: normKey(it?.unit),
            netWeight: normKey(it?.netWeight),
            grossWeight: normKey(it?.grossWeight),
            remarks: normKey(it?.remarks),
          }))
          .filter(
            (it) =>
              it.description ||
              it.packingListNo ||
              it.packageNo ||
              it.dimensions ||
              it.qty ||
              it.unit ||
              it.netWeight ||
              it.grossWeight ||
              it.remarks,
          )
      : undefined;

    const record: SiteEntryMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      releaseNoteNo: resolvedArrival.resolvedReleaseNoteNo,
      projectName: normKey(raw.projectName),
      entryType: raw.entryType === 'temporary' ? 'temporary' : 'permanent',
      goodsUsage:
        raw.goodsUsage === 'site_equip' || raw.goodsUsage === 'general' ? raw.goodsUsage : 'project',
      contractNo: normKey(raw.contractNo),
      date: cleanDate,
      arrivalDate: resolvedArrival.resolvedArrivalDate || normKey(raw.arrivalDate) || cleanDate,
      packingListNos: cleanPackings,
      supplier: normKey(raw.supplier),
      unit: normKey(raw.unit),
      system: normKey(raw.system),
      island: normKey(raw.island),
      origin: normKey(raw.origin),
      carrierCompany: normKey(raw.carrierCompany),
      trafficLocation: normKey(raw.trafficLocation),
      vehicleType: normKey(raw.vehicleType),
      driverName: normKey(raw.driverName),
      vehicleNo: normKey(raw.vehicleNo),
      waybillNo: normKey(raw.waybillNo),
      items: cleanItems,
      warehouseKeeper: normKey(raw.warehouseKeeper),
      contractorManager: normKey(raw.contractorManager),
      mapnaSecurity: normKey(raw.mapnaSecurity),
      qcChecked: Boolean(raw.qcChecked),
      qcTechOffice: normKey(raw.qcTechOffice),
      hseChecked: Boolean(raw.hseChecked),
      hseOfficer: normKey(raw.hseOfficer),
      equipmentSupply: normKey(raw.equipmentSupply) || normKey(raw.mapnaRep),
      employerRep: normKey(raw.employerRep),
      mapnaRep: normKey(raw.mapnaRep) || normKey(raw.equipmentSupply),
      conditionStatus: raw.conditionStatus || 'healthy',
      notes: normKey(raw.notes),
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.siteEntryMinutes.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_SITE_ENTRY_MINUTES',
      scope: 'siteEntry',
      targetId: cleanNo,
      summary: `ثبت صورتجلسه ورود کالا به کارگاه شماره ${cleanNo} (${cleanPackings.join('، ')})`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  app.patch('/api/site-entry/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.siteEntryMinutes.find((r) => r.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'صورتجلسه ورود کالا یافت نشد', 'Site entry minutes record not found') });
      return;
    }
    const raw = req.body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(raw.minutesNo ?? rec.minutesNo);
    const cleanPackings = Array.from(
      new Set(((raw.packingListNos !== undefined ? raw.packingListNos : rec.packingListNos) || []).map(normKey).filter(Boolean)),
    );
    const resolvedArrival = resolveSiteEntryArrivalAndRelease(
      cleanPackings,
      raw.releaseNoteNo !== undefined ? raw.releaseNoteNo : rec.releaseNoteNo,
      store.db.general,
      store.db.transit,
    );
    if (resolvedArrival.errorFa) {
      res.status(400).json({ error: errMsg(req, resolvedArrival.errorFa, resolvedArrival.errorEn || resolvedArrival.errorFa) });
      return;
    }
    const cleanDate = resolvedArrival.resolvedArrivalDate || normKey(raw.date ?? rec.date);
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'siteEntry', excludeId: rec.id });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }
    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          description: normKey(it?.description),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          dimensions: normKey(it?.dimensions),
          qty: normKey(it?.qty),
          unit: normKey(it?.unit),
          netWeight: normKey(it?.netWeight),
          grossWeight: normKey(it?.grossWeight),
          remarks: normKey(it?.remarks),
        }))
        .filter(
          (it) =>
            it.description ||
            it.packingListNo ||
            it.packageNo ||
            it.dimensions ||
            it.qty ||
            it.unit ||
            it.netWeight ||
            it.grossWeight ||
            it.remarks,
        );
    }
    rec.minutesNo = cleanNo;
    rec.releaseNoteNo = resolvedArrival.resolvedReleaseNoteNo;
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.entryType === 'permanent' || raw.entryType === 'temporary') rec.entryType = raw.entryType;
    if (raw.goodsUsage === 'project' || raw.goodsUsage === 'site_equip' || raw.goodsUsage === 'general') {
      rec.goodsUsage = raw.goodsUsage;
    }
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    rec.date = cleanDate;
    rec.arrivalDate = resolvedArrival.resolvedArrivalDate || normKey(raw.arrivalDate ?? rec.arrivalDate) || cleanDate;
    rec.packingListNos = cleanPackings;
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.origin !== undefined) rec.origin = normKey(raw.origin);
    if (raw.carrierCompany !== undefined) rec.carrierCompany = normKey(raw.carrierCompany);
    if (raw.trafficLocation !== undefined) rec.trafficLocation = normKey(raw.trafficLocation);
    if (raw.vehicleType !== undefined) rec.vehicleType = normKey(raw.vehicleType);
    if (raw.driverName !== undefined) rec.driverName = normKey(raw.driverName);
    if (raw.vehicleNo !== undefined) rec.vehicleNo = normKey(raw.vehicleNo);
    if (raw.waybillNo !== undefined) rec.waybillNo = normKey(raw.waybillNo);
    if (raw.warehouseKeeper !== undefined) rec.warehouseKeeper = normKey(raw.warehouseKeeper);
    if (raw.contractorManager !== undefined) rec.contractorManager = normKey(raw.contractorManager);
    if (raw.mapnaSecurity !== undefined) rec.mapnaSecurity = normKey(raw.mapnaSecurity);
    if (raw.qcChecked !== undefined) rec.qcChecked = Boolean(raw.qcChecked);
    if (raw.qcTechOffice !== undefined) rec.qcTechOffice = normKey(raw.qcTechOffice);
    if (raw.hseChecked !== undefined) rec.hseChecked = Boolean(raw.hseChecked);
    if (raw.hseOfficer !== undefined) rec.hseOfficer = normKey(raw.hseOfficer);
    if (raw.equipmentSupply !== undefined) {
      rec.equipmentSupply = normKey(raw.equipmentSupply);
      rec.mapnaRep = normKey(raw.equipmentSupply);
    } else if (raw.mapnaRep !== undefined) {
      rec.mapnaRep = normKey(raw.mapnaRep);
    }
    if (raw.employerRep !== undefined) rec.employerRep = normKey(raw.employerRep);
    if (raw.conditionStatus) rec.conditionStatus = raw.conditionStatus;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_SITE_ENTRY_MINUTES',
      scope: 'siteEntry',
      targetId: cleanNo,
      summary: `ویرایش صورتجلسه ورود کالا به کارگاه شماره ${cleanNo} (${cleanPackings.join('، ')})`,
    });
    store.saveImmediate();
    res.json({ record: rec });
  });

  app.delete('/api/site-entry/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.siteEntryMinutes.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'صورتجلسه ورود کالا یافت نشد', 'Site entry minutes record not found') });
      return;
    }
    const [removed] = store.db.siteEntryMinutes.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_SITE_ENTRY_MINUTES',
      scope: 'siteEntry',
      targetId: removed.minutesNo,
      summary: `حذف صورتجلسه ورود کالا به کارگاه شماره ${removed.minutesNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- OPI MANAGEMENT ----------------
  app.get('/api/opi', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      invitations: store.db.opiInvitations,
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      generalEntries: [...store.db.general].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    });
  });

  app.post('/api/opi', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<OpiInvitationRecord>;
    const cleanNo = normKey(raw.invitationNo);
    const cleanDate = normKey(raw.date);
    const cleanGeneralIds = Array.from(new Set((raw.generalIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    const cleanPackings = Array.from(new Set((raw.packingNos || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || (cleanPackings.length === 0 && cleanGeneralIds.length === 0)) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره دعوتنامه، تاریخ و حداقل یک ردیف یا پکینگ لیست الزامی است',
          'Invitation No., date, and at least one row or Packing List are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const derivedPackings =
      cleanPackings.length > 0
        ? cleanPackings
        : Array.from(
            new Set(
              store.db.general
                .filter((g) => cleanGeneralIds.includes(g.id))
                .map((g) => normKey(g.packingListNo))
                .filter(Boolean),
            ),
          );

    const preserveMulti = (val: unknown) =>
      String(val ?? '')
        .replace(/\r\n/g, '\n')
        .trim();

    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            itemNo: normKey(it?.itemNo),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            description: preserveMulti(it?.description),
            uom: normKey(it?.uom),
            remarks: preserveMulti(it?.remarks),
          }))
          .filter(
            (it) =>
              it.itemNo ||
              it.packingListNo ||
              it.packageNo ||
              it.description ||
              it.uom ||
              it.remarks,
          )
          .map((it, idx) => ({
            ...it,
            itemNo: it.itemNo || String(idx + 1),
          }))
      : undefined;

    const record: OpiInvitationRecord = {
      id: makeId(),
      invitationNo: cleanNo,
      issueDate: normKey(raw.issueDate) || cleanDate,
      date: cleanDate,
      time: normKey(raw.time) || '09:00',
      packingNos: derivedPackings,
      generalIds: cleanGeneralIds.length > 0 ? cleanGeneralIds : undefined,
      location: normKey(raw.location),
      projectName: normKey(raw.projectName),
      system: normKey(raw.system),
      island: normKey(raw.island),
      unit: normKey(raw.unit),
      supplier: normKey(raw.supplier),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      items: cleanItems,
      installerContractor: normKey(raw.installerContractor),
      supplierRep: normKey(raw.supplierRep),
      equipmentSupply: normKey(raw.equipmentSupply),
      employerRep: normKey(raw.employerRep),
      notes: normKey(raw.notes),
      status: 'issued',
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.opiInvitations.unshift(record);

    // Stamp ONLY General Equipment rows (do NOT auto-stamp Detailed rows upon invitation issuance,
    // so Dashboard "دعوتنامه‌های باز" accurately tracks open invitations until Detailed opiNo is filled).
    const now = new Date().toISOString();
    const generalIdSet = new Set(cleanGeneralIds);
    for (const g of store.db.general) {
      const matched =
        generalIdSet.size > 0
          ? generalIdSet.has(g.id)
          : derivedPackings.includes(normKey(g.packingListNo));
      if (matched) {
        g.opiInvitationNo = cleanNo;
        g.opiInvitationDate = cleanDate;
        g.updatedAt = now;
      }
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ISSUE_OPI_INVITATION',
      scope: 'opi',
      targetId: cleanNo,
      summary: `صدور دعوتنامه OPI شماره ${cleanNo} برای ${derivedPackings.length} پکینگ لیست (${derivedPackings.join('، ')})`,
    });
    store.saveImmediate();
    res.json({ invitation: record });
  });

  app.patch('/api/opi/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.opiInvitations.find((x) => x.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'دعوتنامه OPI یافت نشد', 'OPI invitation not found') });
      return;
    }
    const raw = req.body as Partial<OpiInvitationRecord>;
    const cleanNo = normKey(raw.invitationNo ?? rec.invitationNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const hasExplicitGeneralIds = raw.generalIds !== undefined;
    const cleanGeneralIds = Array.from(
      new Set(
        ((hasExplicitGeneralIds ? raw.generalIds : rec.generalIds) || [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    );
    const cleanPackings = Array.from(
      new Set(((raw.packingNos !== undefined ? raw.packingNos : rec.packingNos) || []).map(normKey).filter(Boolean)),
    );
    if (!cleanNo || !cleanDate || (cleanPackings.length === 0 && cleanGeneralIds.length === 0)) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره دعوتنامه، تاریخ و حداقل یک ردیف یا پکینگ لیست الزامی است',
          'Invitation No., date, and at least one row or Packing List are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'opi', excludeId: rec.id });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const derivedPackings =
      cleanPackings.length > 0
        ? cleanPackings
        : Array.from(
            new Set(
              store.db.general
                .filter((g) => cleanGeneralIds.includes(g.id))
                .map((g) => normKey(g.packingListNo))
                .filter(Boolean),
            ),
          );

    const oldNo = normKey(rec.invitationNo);
    const oldPackings = [...rec.packingNos];
    const oldGeneralIds = new Set(rec.generalIds || []);
    const nextGeneralIds = new Set(cleanGeneralIds);
    const now = new Date().toISOString();

    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      const wasMatched =
        oldGeneralIds.size > 0
          ? oldGeneralIds.has(g.id) || normKey(g.opiInvitationNo) === oldNo
          : oldPackings.includes(pk) && normKey(g.opiInvitationNo) === oldNo;
      const isNowMatched =
        nextGeneralIds.size > 0
          ? nextGeneralIds.has(g.id)
          : derivedPackings.includes(pk);

      if (wasMatched && !isNowMatched && normKey(g.opiInvitationNo) === oldNo) {
        const fallback = store.db.opiInvitations.find(
          (inv) =>
            inv.id !== rec.id &&
            ((inv.generalIds && inv.generalIds.includes(g.id)) ||
              (!inv.generalIds?.length && inv.packingNos.includes(pk))),
        );
        g.opiInvitationNo = fallback ? fallback.invitationNo : '';
        g.opiInvitationDate = fallback ? fallback.date : '';
        g.updatedAt = now;
      }
      if (isNowMatched) {
        g.opiInvitationNo = cleanNo;
        g.opiInvitationDate = cleanDate;
        g.updatedAt = now;
      }
    }

    const preserveMulti = (val: unknown) =>
      String(val ?? '')
        .replace(/\r\n/g, '\n')
        .trim();

    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          itemNo: normKey(it?.itemNo),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          description: preserveMulti(it?.description),
          uom: normKey(it?.uom),
          remarks: preserveMulti(it?.remarks),
        }))
        .filter(
          (it) =>
            it.itemNo ||
            it.packingListNo ||
            it.packageNo ||
            it.description ||
            it.uom ||
            it.remarks,
        )
        .map((it, idx) => ({
          ...it,
          itemNo: it.itemNo || String(idx + 1),
        }));
    }

    rec.invitationNo = cleanNo;
    if (raw.issueDate !== undefined) rec.issueDate = normKey(raw.issueDate) || cleanDate;
    rec.date = cleanDate;
    if (raw.time !== undefined) rec.time = normKey(raw.time) || '09:00';
    rec.packingNos = derivedPackings;
    if (hasExplicitGeneralIds) rec.generalIds = cleanGeneralIds.length > 0 ? cleanGeneralIds : undefined;
    if (raw.location !== undefined) rec.location = normKey(raw.location);
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) rec.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.installerContractor !== undefined) rec.installerContractor = normKey(raw.installerContractor);
    if (raw.supplierRep !== undefined) rec.supplierRep = normKey(raw.supplierRep);
    if (raw.equipmentSupply !== undefined) rec.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.employerRep !== undefined) rec.employerRep = normKey(raw.employerRep);
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);
    if (raw.status === 'issued' || raw.status === 'completed') rec.status = raw.status;

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_OPI_INVITATION',
      scope: 'opi',
      targetId: cleanNo,
      summary: `ویرایش دعوتنامه OPI شماره ${cleanNo}`,
    });
    store.saveImmediate();
    res.json({ invitation: rec });
  });

  app.delete('/api/opi/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.opiInvitations.findIndex((x) => x.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'دعوتنامه OPI یافت نشد', 'OPI invitation not found') });
      return;
    }
    const [removed] = store.db.opiInvitations.splice(idx, 1);
    const oldNo = normKey(removed.invitationNo);
    const removedIds = new Set(removed.generalIds || []);
    const now = new Date().toISOString();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      const matched =
        normKey(g.opiInvitationNo) === oldNo &&
        (removedIds.size > 0 ? removedIds.has(g.id) : removed.packingNos.includes(pk));
      if (matched) {
        const fallback = store.db.opiInvitations.find(
          (inv) =>
            (inv.generalIds && inv.generalIds.includes(g.id)) ||
            (!inv.generalIds?.length && inv.packingNos.includes(pk)),
        );
        g.opiInvitationNo = fallback ? fallback.invitationNo : '';
        g.opiInvitationDate = fallback ? fallback.date : '';
        g.updatedAt = now;
      }
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_OPI_INVITATION',
      scope: 'opi',
      targetId: removed.invitationNo,
      summary: `حذف دعوتنامه OPI شماره ${removed.invitationNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- OPI MINUTES & OSDR DISCREPANCY REPORTS ----------------
  const collectMinutePackingKeys = (packingListNo: string, packingNos?: string[], items?: Array<{ packingListNo?: string }>): Set<string> => {
    const out = new Set<string>();
    const add = (raw?: string) => {
      const clean = normKey(raw);
      if (!clean) return;
      for (const tok of clean.split(/[,،;؛|\n]+/)) {
        const k = normDupPart(tok);
        if (k) out.add(k);
      }
    };
    add(packingListNo);
    for (const pk of packingNos || []) add(pk);
    for (const it of items || []) add(it?.packingListNo);
    return out;
  };

  const applyMerSyncToDetailed = (mer: OsdrReportRecord, now: string) => {
    for (const merItem of mer.items || []) {
      const d = store.db.detailed.find((x) => x.id === merItem.detailedId);
      if (!d) continue;
      d.merNo = appendUniqueRef(d.merNo, mer.reportNo);
      const desc = buildDetailedMerDescription(merItem);
      if (desc) d.merDescription = desc;
      d.merStatus = 'باز';
      if (merItem.discrepancyType === 'shortage') {
        d.actualQty = merItem.actualQty;
      } else if (merItem.discrepancyType === 'damaged') {
        d.damagedQty = merItem.damagedQty;
      }
      d.updatedAt = now;
    }
  };

  const revertMerSyncFromDetailed = (mer: OsdrReportRecord, excludeMerId: string, now: string) => {
    const otherMers = store.db.osdrReports.filter((r) => r.id !== excludeMerId);
    for (const merItem of mer.items || []) {
      const d = store.db.detailed.find((x) => x.id === merItem.detailedId);
      if (!d) continue;
      d.merNo = removeRefToken(d.merNo, mer.reportNo);
      const otherRef = otherMers.find((r) => (r.items || []).some((it) => it.detailedId === d.id));
      if (!otherRef) {
        if (!d.merNo) {
          d.merStatus = '';
          d.merDescription = '';
        }
        if (merItem.discrepancyType === 'shortage' && d.packingQty !== null && d.packingQty !== undefined) {
          d.actualQty = d.packingQty;
        } else if (merItem.discrepancyType === 'damaged') {
          d.damagedQty = 0;
        }
      }
      d.updatedAt = now;
    }
  };

  app.get('/api/opi-minutes', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      minutes: store.db.opiMinutes,
      osdrReports: store.db.osdrReports,
      invitations: store.db.opiInvitations,
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      generalEntries: [...store.db.general].reverse(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
      allUsedDocNos: getAllUsedDocNumbers(store.db),
    });
  });

  app.post('/api/opi-minutes', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<OpiMinutesRecord> & {
      merPayload?: Partial<OsdrReportRecord>;
    };

    const cleanInvNo = normKey(raw.invitationNo);
    const cleanNo = normKey(raw.minutesNo) || cleanInvNo;
    const cleanDate = normKey(raw.date);
    const rawPackingNos = Array.from(new Set((raw.packingNos || []).map(normKey).filter(Boolean)));
    const cleanPacking = normKey(raw.packingListNo) || rawPackingNos.join(' ، ');
    if (!cleanNo || !cleanDate || !cleanPacking) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و شماره پکینگ لیست الزامی است',
          'Minutes No., date, and Packing List No. are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, {
      allowPairedOpiInvitationNo: cleanInvNo || undefined,
    });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const merPayload = raw.resultStatus === 'has_discrepancy' ? raw.merPayload : undefined;
    let cleanMerNo = normKey(merPayload?.reportNo || raw.merNo);
    if (merPayload) {
      const merItems = Array.isArray(merPayload.items) ? merPayload.items : [];
      if (!cleanMerNo || merItems.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'برای صدور گزارش مغایرت (MER)، شماره گزارش و حداقل یک قلم مغایرت الزامی است',
            'MER Report No. and at least one discrepant item are required',
          ),
        });
        return;
      }
      const merUniq = assertUniqueDocNo(store.db, cleanMerNo);
      if (!merUniq.ok) {
        res.status(409).json({ error: errMsg(req, merUniq.errorFa!, merUniq.errorEn!) });
        return;
      }
      if (normKey(cleanMerNo).toUpperCase() === normKey(cleanNo).toUpperCase()) {
        res.status(409).json({
          error: errMsg(
            req,
            'شماره گزارش مغایرت (MER) نمی‌تواند با شماره صورتجلسه OPI یکسان باشد.',
            'MER Report No. cannot be identical to the OPI Minutes No.',
          ),
        });
        return;
      }
    }

    const cleanItems = Array.isArray(raw.items)
      ? raw.items
          .map((it) => ({
            itemNo: normKey(it?.itemNo),
            packingListNo: normKey(it?.packingListNo),
            packageNo: normKey(it?.packageNo),
            description: preserveMultilineText(it?.description),
            uom: normKey(it?.uom),
            remarks: preserveMultilineText(it?.remarks),
          }))
          .filter(
            (it) =>
              it.itemNo ||
              it.packingListNo ||
              it.packageNo ||
              it.description ||
              it.uom ||
              it.remarks,
          )
      : undefined;

    const now = new Date().toISOString();
    const minutesId = makeId();
    const record: OpiMinutesRecord = {
      id: minutesId,
      minutesNo: cleanNo,
      invitationId: normKey(raw.invitationId),
      invitationNo: cleanInvNo,
      date: cleanDate,
      time: normKey(raw.time),
      packingListNo: cleanPacking,
      packingNos: rawPackingNos.length > 0 ? rawPackingNos : [cleanPacking],
      packageNos: Array.from(new Set((raw.packageNos || []).map(normKey).filter(Boolean))),
      projectName: normKey(raw.projectName),
      supplier: normKey(raw.supplier),
      system: normKey(raw.system),
      island: normKey(raw.island),
      unit: normKey(raw.unit),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      items: cleanItems,
      merNo: cleanMerNo,
      location: normKey(raw.location),
      storekeeper: normKey(raw.storekeeper),
      mapnaInspector: normKey(raw.mapnaInspector),
      sellerRep: normKey(raw.sellerRep) || normKey(raw.contractorInspector),
      employerInspector: normKey(raw.employerInspector),
      contractorInspector: normKey(raw.contractorInspector) || normKey(raw.sellerRep),
      qcInspector: normKey(raw.qcInspector),
      resultStatus: raw.resultStatus || 'compliant',
      notes: preserveMultilineText(raw.notes),
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };

    if (record.invitationNo) {
      const inv = store.db.opiInvitations.find((x) => normKey(x.invitationNo) === record.invitationNo);
      if (inv) inv.status = 'completed';
    }

    // Sync OPI Invitation No. & Date into ALL Detailed Equipment rows belonging to the invitation's packings
    const opiTokenToSync = cleanInvNo || cleanNo;
    const pkKeys = collectMinutePackingKeys(cleanPacking, record.packingNos, cleanItems);
    for (const d of store.db.detailed) {
      if (!pkKeys.has(normDupPart(d.shipmentNo))) continue;
      d.opiNo = appendUniqueRef(d.opiNo, opiTokenToSync);
      d.opiDate = cleanDate;
      if ((d.actualQty === null || d.actualQty === undefined) && d.packingQty !== null && d.packingQty !== undefined) {
        d.actualQty = d.packingQty;
      }
      d.updatedAt = now;
    }

    let createdMer: OsdrReportRecord | undefined;
    if (merPayload && cleanMerNo && Array.isArray(merPayload.items) && merPayload.items.length > 0) {
      createdMer = {
        id: makeId(),
        reportNo: cleanMerNo,
        date: normKey(merPayload.date) || cleanDate,
        opiMinutesNo: cleanNo,
        opiMinutesId: minutesId,
        opiNo: cleanInvNo || cleanNo,
        opiDate: cleanDate,
        packingListNo: normKey(merPayload.packingListNo) || cleanPacking,
        projectName: normKey(merPayload.projectName) || record.projectName,
        contractNo: normKey(merPayload.contractNo) || record.contractNo,
        system: normKey(merPayload.system) || record.system,
        island: normKey(merPayload.island) || record.island,
        unit: normKey(merPayload.unit) || record.unit,
        supplier: normKey(merPayload.supplier) || record.supplier,
        items: merPayload.items,
        notes: preserveMultilineText(merPayload.notes),
        createdAt: now,
        createdBy: req.currentUser!.fullName || req.currentUser!.username,
      };
      record.linkedMerId = createdMer.id;
      record.merNo = createdMer.reportNo;
      store.db.osdrReports.unshift(createdMer);
      applyMerSyncToDetailed(createdMer, now);
    }

    store.db.opiMinutes.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_OPI_MINUTES',
      scope: 'opiMinutes',
      targetId: cleanNo,
      summary: createdMer
        ? `ثبت صورتجلسه گشایش و بازرسی شماره ${cleanNo} همراه با گزارش مغایرت MER شماره ${createdMer.reportNo}`
        : `ثبت صورتجلسه گشایش و بازرسی بسته‌ها شماره ${cleanNo} (پکینگ ${cleanPacking})`,
    });
    store.saveImmediate();
    res.json({ record, merReport: createdMer });
  });

  app.patch('/api/opi-minutes/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.opiMinutes.find((r) => r.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'صورتجلسه گشایش و بازرسی یافت نشد', 'OPI minutes record not found') });
      return;
    }
    const raw = req.body as Partial<OpiMinutesRecord> & {
      merPayload?: Partial<OsdrReportRecord> | null;
    };
    const nextInvNo = raw.invitationNo !== undefined ? normKey(raw.invitationNo) : normKey(rec.invitationNo);
    const cleanNo = normKey(raw.minutesNo ?? rec.minutesNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const nextPackingNos = Array.isArray(raw.packingNos)
      ? Array.from(new Set(raw.packingNos.map(normKey).filter(Boolean)))
      : rec.packingNos;
    const cleanPacking = normKey(raw.packingListNo ?? rec.packingListNo) || (nextPackingNos || []).join(' ، ');
    if (!cleanNo || !cleanDate || !cleanPacking) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و شماره پکینگ لیست الزامی است',
          'Minutes No., date, and Packing List No. are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, {
      excludeScope: 'opiMinutes',
      excludeId: rec.id,
      allowPairedOpiInvitationNo: nextInvNo || undefined,
    });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const existingMer =
      (rec.linkedMerId ? store.db.osdrReports.find((m) => m.id === rec.linkedMerId) : undefined) ||
      store.db.osdrReports.find((m) => m.opiMinutesId === rec.id) ||
      (rec.merNo ? store.db.osdrReports.find((m) => normKey(m.reportNo) === normKey(rec.merNo)) : undefined);

    const nextResultStatus =
      raw.resultStatus === 'compliant' || raw.resultStatus === 'has_discrepancy'
        ? raw.resultStatus
        : rec.resultStatus;

    const merPayload = nextResultStatus === 'has_discrepancy' ? raw.merPayload : null;
    if (merPayload) {
      const nextMerNo = normKey(merPayload.reportNo || raw.merNo || existingMer?.reportNo);
      const nextMerItems = Array.isArray(merPayload.items) ? merPayload.items : [];
      if (!nextMerNo || nextMerItems.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'برای صدور گزارش مغایرت (MER)، شماره گزارش و حداقل یک قلم مغایرت الزامی است',
            'MER Report No. and at least one discrepant item are required',
          ),
        });
        return;
      }
      const merUniq = assertUniqueDocNo(store.db, nextMerNo, {
        excludeScope: 'osdr',
        excludeId: existingMer?.id,
      });
      if (!merUniq.ok) {
        res.status(409).json({ error: errMsg(req, merUniq.errorFa!, merUniq.errorEn!) });
        return;
      }
    }

    const now = new Date().toISOString();
    const oldToken = normKey(rec.invitationNo) || normKey(rec.minutesNo);
    const oldPkKeys = collectMinutePackingKeys(rec.packingListNo, rec.packingNos, rec.items);

    if (Array.isArray(raw.items)) {
      rec.items = raw.items
        .map((it) => ({
          itemNo: normKey(it?.itemNo),
          packingListNo: normKey(it?.packingListNo),
          packageNo: normKey(it?.packageNo),
          description: preserveMultilineText(it?.description),
          uom: normKey(it?.uom),
          remarks: preserveMultilineText(it?.remarks),
        }))
        .filter(
          (it) =>
            it.itemNo ||
            it.packingListNo ||
            it.packageNo ||
            it.description ||
            it.uom ||
            it.remarks,
        );
    }
    rec.minutesNo = cleanNo;
    if (raw.invitationId !== undefined) rec.invitationId = normKey(raw.invitationId);
    rec.invitationNo = nextInvNo;
    rec.date = cleanDate;
    if (raw.time !== undefined) rec.time = normKey(raw.time);
    rec.packingListNo = cleanPacking;
    if (nextPackingNos) rec.packingNos = nextPackingNos;
    if (Array.isArray(raw.packageNos)) {
      rec.packageNos = Array.from(new Set(raw.packageNos.map(normKey).filter(Boolean)));
    }
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) rec.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.merNo !== undefined) rec.merNo = normKey(raw.merNo);
    if (raw.location !== undefined) rec.location = normKey(raw.location);
    if (raw.storekeeper !== undefined) rec.storekeeper = normKey(raw.storekeeper);
    if (raw.mapnaInspector !== undefined) rec.mapnaInspector = normKey(raw.mapnaInspector);
    if (raw.sellerRep !== undefined) {
      rec.sellerRep = normKey(raw.sellerRep);
      rec.contractorInspector = normKey(raw.sellerRep);
    } else if (raw.contractorInspector !== undefined) {
      rec.contractorInspector = normKey(raw.contractorInspector);
    }
    if (raw.employerInspector !== undefined) rec.employerInspector = normKey(raw.employerInspector);
    if (raw.qcInspector !== undefined) rec.qcInspector = normKey(raw.qcInspector);
    rec.resultStatus = nextResultStatus;
    if (raw.notes !== undefined) rec.notes = preserveMultilineText(raw.notes);

    // Re-sync Detailed OPI No & Date
    const nextToken = nextInvNo || cleanNo;
    const nextPkKeys = collectMinutePackingKeys(rec.packingListNo, rec.packingNos, rec.items);
    for (const d of store.db.detailed) {
      const pk = normDupPart(d.shipmentNo);
      if (oldPkKeys.has(pk) && (!nextPkKeys.has(pk) || oldToken !== nextToken)) {
        d.opiNo = removeRefToken(d.opiNo, oldToken);
        if (!d.opiNo) d.opiDate = '';
        d.updatedAt = now;
      }
      if (nextPkKeys.has(pk)) {
        d.opiNo = appendUniqueRef(d.opiNo, nextToken);
        d.opiDate = cleanDate;
        d.updatedAt = now;
      }
    }

    let updatedMer: OsdrReportRecord | undefined = existingMer;
    if (nextResultStatus === 'compliant') {
      if (existingMer) {
        revertMerSyncFromDetailed(existingMer, existingMer.id, now);
        store.db.osdrReports = store.db.osdrReports.filter((m) => m.id !== existingMer.id);
      }
      rec.merNo = '';
      rec.linkedMerId = '';
      updatedMer = undefined;
    } else if (merPayload && Array.isArray(merPayload.items) && merPayload.items.length > 0) {
      const nextMerNo = normKey(merPayload.reportNo || rec.merNo || existingMer?.reportNo);
      if (existingMer) {
        revertMerSyncFromDetailed(existingMer, existingMer.id, now);
        existingMer.reportNo = nextMerNo;
        existingMer.date = normKey(merPayload.date) || cleanDate;
        existingMer.opiMinutesNo = cleanNo;
        existingMer.opiMinutesId = rec.id;
        existingMer.opiNo = nextToken;
        existingMer.opiDate = cleanDate;
        existingMer.packingListNo = normKey(merPayload.packingListNo) || cleanPacking;
        existingMer.projectName = normKey(merPayload.projectName) || rec.projectName;
        existingMer.contractNo = normKey(merPayload.contractNo) || rec.contractNo;
        existingMer.system = normKey(merPayload.system) || rec.system;
        existingMer.island = normKey(merPayload.island) || rec.island;
        existingMer.unit = normKey(merPayload.unit) || rec.unit;
        existingMer.supplier = normKey(merPayload.supplier) || rec.supplier;
        existingMer.items = merPayload.items;
        existingMer.notes = preserveMultilineText(merPayload.notes);
        applyMerSyncToDetailed(existingMer, now);
        updatedMer = existingMer;
      } else {
        updatedMer = {
          id: makeId(),
          reportNo: nextMerNo,
          date: normKey(merPayload.date) || cleanDate,
          opiMinutesNo: cleanNo,
          opiMinutesId: rec.id,
          opiNo: nextToken,
          opiDate: cleanDate,
          packingListNo: normKey(merPayload.packingListNo) || cleanPacking,
          projectName: normKey(merPayload.projectName) || rec.projectName,
          contractNo: normKey(merPayload.contractNo) || rec.contractNo,
          system: normKey(merPayload.system) || rec.system,
          island: normKey(merPayload.island) || rec.island,
          unit: normKey(merPayload.unit) || rec.unit,
          supplier: normKey(merPayload.supplier) || rec.supplier,
          items: merPayload.items,
          notes: preserveMultilineText(merPayload.notes),
          createdAt: now,
          createdBy: req.currentUser!.fullName || req.currentUser!.username,
        };
        store.db.osdrReports.unshift(updatedMer);
        applyMerSyncToDetailed(updatedMer, now);
      }
      rec.merNo = updatedMer.reportNo;
      rec.linkedMerId = updatedMer.id;
    }

    if (rec.invitationNo) {
      const inv = store.db.opiInvitations.find((x) => normKey(x.invitationNo) === rec.invitationNo);
      if (inv) inv.status = 'completed';
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_OPI_MINUTES',
      scope: 'opiMinutes',
      targetId: cleanNo,
      summary: `ویرایش صورتجلسه گشایش و بازرسی بسته‌ها شماره ${cleanNo} (پکینگ ${cleanPacking})`,
    });
    store.saveImmediate();
    res.json({ record: rec, merReport: updatedMer });
  });

  app.delete('/api/opi-minutes/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.opiMinutes.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'صورتجلسه گشایش و بازرسی یافت نشد', 'OPI minutes record not found') });
      return;
    }
    const [removed] = store.db.opiMinutes.splice(idx, 1);
    const now = new Date().toISOString();

    // Revert Detailed OPI No. & Date for this minute's packings
    const tokenToRemove = normKey(removed.invitationNo) || normKey(removed.minutesNo);
    const pkKeys = collectMinutePackingKeys(removed.packingListNo, removed.packingNos, removed.items);
    for (const d of store.db.detailed) {
      if (!pkKeys.has(normDupPart(d.shipmentNo))) continue;
      d.opiNo = removeRefToken(d.opiNo, tokenToRemove);
      if (!d.opiNo) d.opiDate = '';
      d.updatedAt = now;
    }

    // Revert invitation status back to 'issued' if no other minute references it
    if (removed.invitationNo) {
      const stillHasMinute = store.db.opiMinutes.some(
        (m) => normKey(m.invitationNo) === normKey(removed.invitationNo),
      );
      if (!stillHasMinute) {
        const inv = store.db.opiInvitations.find((x) => normKey(x.invitationNo) === normKey(removed.invitationNo));
        if (inv) inv.status = 'issued';
      }
    }

    // Also delete & revert linked MER report if present
    const linkedMerIdx = store.db.osdrReports.findIndex(
      (m) =>
        (removed.linkedMerId && m.id === removed.linkedMerId) ||
        m.opiMinutesId === removed.id ||
        (removed.merNo && normKey(m.reportNo) === normKey(removed.merNo)),
    );
    if (linkedMerIdx !== -1) {
      const [removedMer] = store.db.osdrReports.splice(linkedMerIdx, 1);
      revertMerSyncFromDetailed(removedMer, removedMer.id, now);
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_OPI_MINUTES',
      scope: 'opiMinutes',
      targetId: removed.minutesNo,
      summary: `حذف صورتجلسه گشایش و بازرسی بسته‌ها شماره ${removed.minutesNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  app.post('/api/osdr', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<OsdrReportRecord>;
    const cleanNo = normKey(raw.reportNo);
    const cleanDate = normKey(raw.date);
    const cleanPacking = normKey(raw.packingListNo);
    const items = raw.items;
    if (!cleanNo || !cleanDate || !cleanPacking || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره گزارش مغایرت، تاریخ، شماره پکینگ و حداقل یک قلم مغایرت الزامی است',
          'Report No., date, Packing List No., and at least one discrepancy item are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const now = new Date().toISOString();
    const record: OsdrReportRecord = {
      id: makeId(),
      reportNo: cleanNo,
      date: cleanDate,
      opiMinutesNo: normKey(raw.opiMinutesNo),
      opiMinutesId: normKey(raw.opiMinutesId),
      opiNo: normKey(raw.opiNo),
      opiDate: normKey(raw.opiDate),
      packingListNo: cleanPacking,
      projectName: normKey(raw.projectName),
      contractNo: normKey(raw.contractNo),
      system: normKey(raw.system),
      island: normKey(raw.island),
      unit: normKey(raw.unit),
      supplier: normKey(raw.supplier),
      items,
      notes: preserveMultilineText(raw.notes),
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.osdrReports.unshift(record);
    applyMerSyncToDetailed(record, now);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_OSDR_REPORT',
      scope: 'osdr',
      targetId: cleanNo,
      summary: `ثبت گزارش مغایرت، کسری و آسیب‌دیدگی شماره ${cleanNo} برای پکینگ ${cleanPacking} (${items.length} قلم)`,
    });
    store.saveImmediate();
    res.json({ report: record });
  });

  app.patch('/api/osdr/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.osdrReports.find((r) => r.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'گزارش مغایرت MER یافت نشد', 'MER report not found') });
      return;
    }
    const raw = req.body as Partial<OsdrReportRecord>;
    const cleanNo = normKey(raw.reportNo ?? rec.reportNo);
    const cleanDate = normKey(raw.date ?? rec.date);
    const cleanPacking = normKey(raw.packingListNo ?? rec.packingListNo);
    const nextItems = raw.items !== undefined ? raw.items : rec.items;
    if (!cleanNo || !cleanDate || !cleanPacking || !Array.isArray(nextItems) || nextItems.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره گزارش مغایرت، تاریخ، شماره پکینگ و حداقل یک قلم مغایرت الزامی است',
          'Report No., date, Packing List No., and at least one discrepancy item are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'osdr', excludeId: rec.id });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }
    const now = new Date().toISOString();
    revertMerSyncFromDetailed(rec, rec.id, now);
    rec.reportNo = cleanNo;
    rec.date = cleanDate;
    if (raw.opiMinutesNo !== undefined) rec.opiMinutesNo = normKey(raw.opiMinutesNo);
    if (raw.opiNo !== undefined) rec.opiNo = normKey(raw.opiNo);
    if (raw.opiDate !== undefined) rec.opiDate = normKey(raw.opiDate);
    rec.packingListNo = cleanPacking;
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    rec.items = nextItems;
    if (raw.notes !== undefined) rec.notes = preserveMultilineText(raw.notes);
    applyMerSyncToDetailed(rec, now);

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_OSDR_REPORT',
      scope: 'osdr',
      targetId: cleanNo,
      summary: `ویرایش گزارش مغایرت MER شماره ${cleanNo}`,
    });
    store.saveImmediate();
    res.json({ report: rec });
  });

  app.delete('/api/osdr/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.osdrReports.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'گزارش مغایرت MER یافت نشد', 'MER report not found') });
      return;
    }
    const [removed] = store.db.osdrReports.splice(idx, 1);
    const now = new Date().toISOString();
    revertMerSyncFromDetailed(removed, removed.id, now);
    for (const min of store.db.opiMinutes) {
      if (min.linkedMerId === removed.id || (min.merNo && normKey(min.merNo) === normKey(removed.reportNo))) {
        min.linkedMerId = '';
        min.merNo = '';
        min.resultStatus = 'compliant';
      }
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_OSDR_REPORT',
      scope: 'osdr',
      targetId: removed.reportNo,
      summary: `حذف گزارش مغایرت MER شماره ${removed.reportNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- GCV RECEIPTS ----------------
  app.get('/api/gcv', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      documents: store.db.gcvDocuments,
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      generalEntries: [...store.db.general].reverse(),
      allUsedDocNos: getAllUsedDocNumbers(store.db),
    });
  });

  app.post('/api/gcv', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<GcvDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty?: number;
        technicalInfo?: string;
        tagNo?: string;
        uom?: string;
        remark?: string;
        userRemark?: string;
        equipmentNotes?: string;
      }>;
    };
    const cleanNo = normKey(raw.receiptNo);
    const purchaseByValid =
      raw.purchaseBy === 'site_admin' || raw.purchaseBy === 'contractor_supplier' || raw.purchaseBy === 'tehran_proc'
        ? raw.purchaseBy
        : undefined;
    const purchaseByLabel =
      GCV_PURCHASE_BY_OPTIONS.find((o) => o.value === purchaseByValid)?.labelFa || '';
    const cleanReceiver = normKey(raw.receiver) || normKey(raw.supplier) || purchaseByLabel || 'مصرف مستقیم';
    const items = raw.items;
    if (!cleanNo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره رسید مصرف و حداقل یک قلم کالا الزامی است',
          'Receipt No. and at least one item are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const hasActual = d.actualQty !== null && d.actualQty !== undefined && Number.isFinite(Number(d.actualQty));
      const hasPacking = d.packingQty !== null && d.packingQty !== undefined && Number.isFinite(Number(d.packingQty));
      const reqQtyNum = Number(reqItem.qty);
      const formQty =
        Number.isFinite(reqQtyNum) && reqQtyNum > 0
          ? reqQtyNum
          : hasActual
            ? Number(d.actualQty)
            : hasPacking
              ? Number(d.packingQty)
              : 0;
      const syncDeliveredQty = hasPacking ? Number(d.packingQty) : formQty;
      const eqNotes = preserveMultilineText(reqItem.equipmentNotes ?? d.notes);
      const usrRem = preserveMultilineText(reqItem.userRemark);
      const combinedRem = combineGcvRemark(eqNotes, usrRem) || preserveMultilineText(reqItem.remark);

      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty: formQty,
        syncDeliveredQty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemNo || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        equipmentNotes: eqNotes,
        userRemark: usrRem,
        remark: combinedRem,
      });
    }

    const now = new Date().toISOString();
    for (const line of lineItems) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      if ((d.actualQty === null || d.actualQty === undefined) && d.packingQty !== null && d.packingQty !== undefined) {
        d.actualQty = d.packingQty;
      }
      d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, cleanNo);
      if (normKey(raw.receiver)) d.receiver = normKey(raw.receiver);
      d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + (line.syncDeliveredQty ?? line.qty));
      d.updatedAt = now;
    }

    const doc: GcvDocumentRecord = {
      id: makeId(),
      receiptNo: cleanNo,
      date: normKey(raw.date),
      receiver: cleanReceiver,
      projectName: normKey(raw.projectName),
      purchaseRequestNo: normKey(raw.purchaseRequestNo),
      supplier: normKey(raw.supplier),
      buyerName: normKey(raw.buyerName),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      releaseNoteNo: normKey(raw.releaseNoteNo),
      purchaseBy: purchaseByValid,
      islandSystem: normKey(raw.islandSystem),
      waybillNo: normKey(raw.waybillNo),
      storekeeper: normKey(raw.storekeeper),
      receiverManager: normKey(raw.receiverManager),
      equipmentSupply: normKey(raw.equipmentSupply),
      mapnaSiteManager: normKey(raw.mapnaSiteManager),
      notes: preserveMultilineText(raw.notes),
      items: lineItems,
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.gcvDocuments.unshift(doc);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_GCV_RECEIPT',
      scope: 'gcv',
      targetId: cleanNo,
      summary: `ثبت رسید مصرف مستقیم کالا شماره ${cleanNo} (${lineItems.length} قلم کالا)`,
    });
    store.saveImmediate();
    res.json({ document: doc });
  });

  app.patch('/api/gcv/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const existing = store.db.gcvDocuments.find((doc) => doc.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: errMsg(req, 'رسید GCV یافت نشد', 'GCV document not found') });
      return;
    }
    const raw = req.body as Partial<GcvDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty?: number;
        technicalInfo?: string;
        tagNo?: string;
        uom?: string;
        remark?: string;
        userRemark?: string;
        equipmentNotes?: string;
      }>;
    };
    const cleanNo = normKey(raw.receiptNo ?? existing.receiptNo);
    const purchaseByValid =
      raw.purchaseBy === 'site_admin' || raw.purchaseBy === 'contractor_supplier' || raw.purchaseBy === 'tehran_proc'
        ? raw.purchaseBy
        : existing.purchaseBy;
    const purchaseByLabel =
      GCV_PURCHASE_BY_OPTIONS.find((o) => o.value === purchaseByValid)?.labelFa || '';
    const cleanReceiver =
      normKey(raw.receiver ?? existing.receiver) || normKey(raw.supplier ?? existing.supplier) || purchaseByLabel || 'مصرف مستقیم';
    const items = raw.items;
    if (!cleanNo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره رسید مصرف و حداقل یک قلم کالا الزامی است',
          'Receipt No. and at least one item are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'gcv', excludeId: existing.id });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const nextLines: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const hasActual = d.actualQty !== null && d.actualQty !== undefined && Number.isFinite(Number(d.actualQty));
      const hasPacking = d.packingQty !== null && d.packingQty !== undefined && Number.isFinite(Number(d.packingQty));
      const reqQtyNum = Number(reqItem.qty);
      const formQty =
        Number.isFinite(reqQtyNum) && reqQtyNum > 0
          ? reqQtyNum
          : hasActual
            ? Number(d.actualQty)
            : hasPacking
              ? Number(d.packingQty)
              : 0;
      const syncDeliveredQty = hasPacking ? Number(d.packingQty) : formQty;
      const eqNotes = preserveMultilineText(reqItem.equipmentNotes ?? d.notes);
      const usrRem = preserveMultilineText(reqItem.userRemark);
      const combinedRem = combineGcvRemark(eqNotes, usrRem) || preserveMultilineText(reqItem.remark);

      nextLines.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty: formQty,
        syncDeliveredQty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemNo || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        equipmentNotes: eqNotes,
        userRemark: usrRem,
        remark: combinedRem,
      });
    }

    const now = new Date().toISOString();
    for (const oldLine of existing.items) {
      const d = store.db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      const revertQty = oldLine.syncDeliveredQty ?? oldLine.qty;
      const nextVal = Math.max(0, roundQty(toNum(d.gcvDeliveredQty) - revertQty));
      d.gcvDeliveredQty = nextVal === 0 ? null : nextVal;
      d.gcvReceiptNo = removeRefToken(d.gcvReceiptNo, existing.receiptNo);
      d.updatedAt = now;
    }

    for (const line of nextLines) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, cleanNo);
      d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + (line.syncDeliveredQty ?? line.qty));
      d.updatedAt = now;
    }

    existing.receiptNo = cleanNo;
    if (raw.date !== undefined) existing.date = normKey(raw.date);
    existing.receiver = cleanReceiver;
    if (raw.projectName !== undefined) existing.projectName = normKey(raw.projectName);
    if (raw.purchaseRequestNo !== undefined) existing.purchaseRequestNo = normKey(raw.purchaseRequestNo);
    if (raw.supplier !== undefined) existing.supplier = normKey(raw.supplier);
    if (raw.buyerName !== undefined) existing.buyerName = normKey(raw.buyerName);
    if (raw.purchasePackageNo !== undefined) existing.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.releaseNoteNo !== undefined) existing.releaseNoteNo = normKey(raw.releaseNoteNo);
    existing.purchaseBy = purchaseByValid;
    if (raw.islandSystem !== undefined) existing.islandSystem = normKey(raw.islandSystem);
    if (raw.waybillNo !== undefined) existing.waybillNo = normKey(raw.waybillNo);
    if (raw.storekeeper !== undefined) existing.storekeeper = normKey(raw.storekeeper);
    if (raw.receiverManager !== undefined) existing.receiverManager = normKey(raw.receiverManager);
    if (raw.equipmentSupply !== undefined) existing.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.mapnaSiteManager !== undefined) existing.mapnaSiteManager = normKey(raw.mapnaSiteManager);
    if (raw.notes !== undefined) existing.notes = preserveMultilineText(raw.notes);
    existing.items = nextLines;

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_GCV_RECEIPT',
      scope: 'gcv',
      targetId: cleanNo,
      summary: `ویرایش رسید مصرف مستقیم کالا شماره ${cleanNo} (${nextLines.length} قلم کالا)`,
    });
    store.saveImmediate();
    res.json({ document: existing });
  });

  app.delete('/api/gcv/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.gcvDocuments.findIndex((doc) => doc.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'رسید GCV یافت نشد', 'GCV document not found') });
      return;
    }
    const [removed] = store.db.gcvDocuments.splice(idx, 1);
    const now = new Date().toISOString();
    for (const oldLine of removed.items) {
      const d = store.db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      const revertQty = oldLine.syncDeliveredQty ?? oldLine.qty;
      const nextVal = Math.max(0, roundQty(toNum(d.gcvDeliveredQty) - revertQty));
      d.gcvDeliveredQty = nextVal === 0 ? null : nextVal;
      d.gcvReceiptNo = removeRefToken(d.gcvReceiptNo, removed.receiptNo);
      d.updatedAt = now;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_GCV_RECEIPT',
      scope: 'gcv',
      targetId: removed.receiptNo,
      summary: `حذف رسید مصرف مستقیم کالا شماره ${removed.receiptNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- MIV & SMR ----------------
  app.get('/api/miv', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      documents: store.db.mivDocuments,
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      generalEntries: [...store.db.general].reverse(),
    });
  });

  app.post('/api/miv', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<MivDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        requestedQty?: number;
        technicalInfo?: string;
        tagNo?: string;
        codeNo?: string;
        location?: string;
        uom?: string;
        opiNo?: string;
        returnReason?: string;
        remark?: string;
        userRemark?: string;
        sourceWarehouse?: MivStockSourcePreference;
      }>;
    };
    const { docType, docNo, date, party, notes, items } = raw;
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!docType || !validTypes.includes(docType)) {
      res.status(400).json({ error: errMsg(req, 'نوع فرم معتبر نیست', 'Invalid document type') });
      return;
    }
    const cleanNo = normKey(docNo);
    const cleanDate = normKey(date);
    if (!cleanNo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: errMsg(req, 'شماره سند و حداقل یک قلم کالا الزامی است', 'Document No. and at least one item are required') });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const isMivType = docType === 'miv_contractor' || docType === 'miv_mapna';
    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: errMsg(req, 'تعداد باید بزرگتر از صفر باشد', 'Quantity must be greater than zero') });
        return;
      }
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const comp = computeDetailedEntry(d);
      let deductedFromMapna = 0;
      let deductedFromContractor = 0;

      if (isMivType) {
        const pref: MivStockSourcePreference =
          reqItem.sourceWarehouse === 'employer' || reqItem.sourceWarehouse === 'contractor'
            ? reqItem.sourceWarehouse
            : docType === 'miv_mapna'
              ? 'employer'
              : 'auto';
        const deduction = computeMivStockDeduction(qty, comp.mapnaInventory, comp.contractorInventory, pref);
        if (!deduction.valid) {
          res.status(400).json({
            error: errMsg(
              req,
              deduction.errorFa || `تعداد (${qty}) برای ${d.description || d.itemNo} از مجموع موجودی انبارهای کارفرما و پیمانکار بیشتر است.`,
              deduction.errorEn || `Qty (${qty}) exceeds combined Employer + Contractor stock.`,
            ),
          });
          return;
        }
        deductedFromMapna = deduction.deductedFromMapna;
        deductedFromContractor = deduction.deductedFromContractor;
      } else if (docType === 'smr_mapna' && qty > comp.contractorInventory) {
        res.status(400).json({
          error: errMsg(
            req,
            `تعداد (${qty}) برای ${d.description || d.itemNo} از موجودی پیمانکار (${comp.contractorInventory}) بیشتر است.`,
            `Qty (${qty}) for ${d.description || d.itemNo} exceeds Contractor stock (${comp.contractorInventory}).`,
          ),
        });
        return;
      }

      const reqQtyNum = Number(reqItem.requestedQty);
      const cleanUserRemark = preserveMultilineText(reqItem.userRemark ?? '');
      const cleanEquipNotes = preserveMultilineText(d.notes);
      const finalRemark = isMivType
        ? reqItem.userRemark !== undefined
          ? buildMivLineRemark(cleanEquipNotes, cleanUserRemark)
          : buildMivLineRemark(cleanEquipNotes, reqItem.remark)
        : preserveMultilineText(reqItem.remark);

      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: preserveMultilineText(d.description || d.generalDescription),
        qty,
        requestedQty: Number.isFinite(reqQtyNum) && reqQtyNum > 0 ? reqQtyNum : qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemNo || '',
        codeNo: normKey(reqItem.codeNo) || d.itemCode || '',
        location: normKey(reqItem.location) || d.storageLocation || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        opiNo: normKey(reqItem.opiNo) || d.opiNo || '',
        returnReason: normKey(reqItem.returnReason) || '',
        remark: finalRemark,
        userRemark: cleanUserRemark || undefined,
        equipmentNotes: cleanEquipNotes || undefined,
        sourceWarehouse: reqItem.sourceWarehouse,
        ...(isMivType ? { deductedFromMapna, deductedFromContractor } : {}),
      });
    }

    const now = new Date().toISOString();
    const cleanNotes = preserveMultilineText(notes);
    const cleanReceiver = normKey(raw.receiver || party);
    const cleanDeliveredBy = normKey(raw.deliveredBy);
    for (const line of lineItems) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      if (isMivType) {
        const fromC = Math.max(0, roundQty(line.deductedFromContractor || 0));
        const fromM = Math.max(0, roundQty(line.deductedFromMapna || 0));
        if (fromC > 0) {
          d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
          d.mivContractorDate = cleanDate || d.mivContractorDate;
          d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + fromC);
        }
        if (fromM > 0) {
          d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
          d.mivMapnaDate = cleanDate || d.mivMapnaDate;
          d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + fromM);
        }
        if (cleanReceiver) d.mivReceiver = appendUniqueRef(d.mivReceiver || '', cleanReceiver);
      } else if (docType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
        if (cleanDeliveredBy) d.smrDeliverer = appendUniqueRef(d.smrDeliverer || '', cleanDeliveredBy);
      } else if (docType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
        if (cleanDeliveredBy) d.smrDeliverer = appendUniqueRef(d.smrDeliverer || '', cleanDeliveredBy);
      }
      d.updatedAt = now;
    }

    const totalMapna = lineItems.reduce((s, l) => s + (l.deductedFromMapna || 0), 0);
    const totalContractor = lineItems.reduce((s, l) => s + (l.deductedFromContractor || 0), 0);
    const effectiveDocType: MivDocType = isMivType
      ? totalMapna > 0 && totalContractor === 0
        ? 'miv_mapna'
        : 'miv_contractor'
      : docType;

    const doc: MivDocumentRecord = {
      id: makeId(),
      docType: effectiveDocType,
      docNo: cleanNo,
      date: cleanDate,
      party: normKey(party),
      projectName: normKey(raw.projectName),
      contractNo: normKey(raw.contractNo),
      purchasePackageNo: normKey(raw.purchasePackageNo),
      supplier: normKey(raw.supplier),
      releaseNoteNo: normKey(raw.releaseNoteNo),
      islandSystem: normKey(raw.islandSystem),
      unit: normKey(raw.unit),
      receiptNo: normKey(raw.receiptNo),
      storekeeper: normKey(raw.storekeeper),
      equipmentSupply: normKey(raw.equipmentSupply),
      techOffice: normKey(raw.techOffice),
      installationDept: normKey(raw.installationDept),
      qcInspector: normKey(raw.qcInspector),
      installerRep: normKey(raw.installerRep),
      requester: normKey(raw.requester),
      receiver: normKey(raw.receiver),
      deliveredBy: cleanDeliveredBy,
      notes: cleanNotes,
      items: lineItems,
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.mivDocuments.unshift(doc);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: `CREATE_${effectiveDocType.toUpperCase()}`,
      scope: effectiveDocType.startsWith('smr') ? 'smr' : 'miv',
      targetId: cleanNo,
      summary: `ثبت فرم ${effectiveDocType} شماره ${cleanNo} برای ${lineItems.length} قلم کالا`,
    });
    store.saveImmediate();
    res.json({ document: doc });
  });

  app.patch('/api/miv/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const existing = store.db.mivDocuments.find((doc) => doc.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: errMsg(req, 'سند MIV / SMR یافت نشد', 'MIV / SMR document not found') });
      return;
    }
    const raw = req.body as Partial<MivDocumentRecord> & {
      items?: Array<{
        detailedId: string;
        qty: number;
        requestedQty?: number;
        technicalInfo?: string;
        tagNo?: string;
        codeNo?: string;
        location?: string;
        uom?: string;
        opiNo?: string;
        returnReason?: string;
        remark?: string;
        userRemark?: string;
        sourceWarehouse?: MivStockSourcePreference;
      }>;
    };
    const requestedDocType = (raw.docType || existing.docType) as MivDocType;
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!validTypes.includes(requestedDocType)) {
      res.status(400).json({ error: errMsg(req, 'نوع فرم معتبر نیست', 'Invalid document type') });
      return;
    }
    const cleanNo = normKey(raw.docNo ?? existing.docNo);
    const cleanDate = normKey(raw.date ?? existing.date);
    const items = raw.items;
    if (!cleanNo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(req, 'شماره سند و حداقل یک قلم کالا الزامی است', 'Document No. and at least one item are required'),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'miv', excludeId: existing.id });
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const oldReversalByDetailedId = new Map<string, { mapna: number; contractor: number; total: number }>();
    for (const oldLine of existing.items) {
      const prev = oldReversalByDetailedId.get(oldLine.detailedId) || { mapna: 0, contractor: 0, total: 0 };
      if (existing.docType === 'miv_contractor' || existing.docType === 'miv_mapna') {
        const hasSplit =
          typeof oldLine.deductedFromMapna === 'number' ||
          typeof oldLine.deductedFromContractor === 'number';
        const mPart = hasSplit
          ? Math.max(0, roundQty(oldLine.deductedFromMapna || 0))
          : existing.docType === 'miv_mapna'
            ? oldLine.qty
            : 0;
        const cPart = hasSplit
          ? Math.max(0, roundQty(oldLine.deductedFromContractor || 0))
          : existing.docType === 'miv_contractor'
            ? oldLine.qty
            : 0;
        prev.mapna = roundQty(prev.mapna + mPart);
        prev.contractor = roundQty(prev.contractor + cPart);
      }
      prev.total = roundQty(prev.total + oldLine.qty);
      oldReversalByDetailedId.set(oldLine.detailedId, prev);
    }

    const isMivType = requestedDocType === 'miv_contractor' || requestedDocType === 'miv_mapna';
    const nextLines: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: errMsg(req, 'تعداد باید بزرگتر از صفر باشد', 'Quantity must be greater than zero') });
        return;
      }
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const oldRev = oldReversalByDetailedId.get(d.id);
      const simulated: DetailedEntry = { ...d };
      if (oldRev) {
        if (existing.docType === 'miv_contractor' || existing.docType === 'miv_mapna') {
          simulated.mivContractorQty = Math.max(0, roundQty(toNum(simulated.mivContractorQty) - oldRev.contractor));
          simulated.mivMapnaQty = Math.max(0, roundQty(toNum(simulated.mivMapnaQty) - oldRev.mapna));
        } else if (existing.docType === 'smr_contractor') {
          simulated.smrContractorQty = Math.max(0, roundQty(toNum(simulated.smrContractorQty) - oldRev.total));
        } else if (existing.docType === 'smr_mapna') {
          simulated.smrMapnaQty = Math.max(0, roundQty(toNum(simulated.smrMapnaQty) - oldRev.total));
        }
      }
      const comp = computeDetailedEntry(simulated);
      let deductedFromMapna = 0;
      let deductedFromContractor = 0;

      if (isMivType) {
        const pref: MivStockSourcePreference =
          reqItem.sourceWarehouse === 'employer' || reqItem.sourceWarehouse === 'contractor'
            ? reqItem.sourceWarehouse
            : requestedDocType === 'miv_mapna'
              ? 'employer'
              : 'auto';
        const deduction = computeMivStockDeduction(qty, comp.mapnaInventory, comp.contractorInventory, pref);
        if (!deduction.valid) {
          res.status(400).json({
            error: errMsg(
              req,
              deduction.errorFa || `تعداد (${qty}) برای ${d.description || d.itemNo} از مجموع موجودی انبارهای کارفرما و پیمانکار بیشتر است.`,
              deduction.errorEn || `Qty (${qty}) exceeds combined Employer + Contractor stock.`,
            ),
          });
          return;
        }
        deductedFromMapna = deduction.deductedFromMapna;
        deductedFromContractor = deduction.deductedFromContractor;
      } else if (requestedDocType === 'smr_mapna' && qty > comp.contractorInventory) {
        res.status(400).json({
          error: errMsg(
            req,
            `تعداد (${qty}) برای ${d.description || d.itemNo} از موجودی پیمانکار (${comp.contractorInventory}) بیشتر است.`,
            `Qty (${qty}) for ${d.description || d.itemNo} exceeds Contractor stock (${comp.contractorInventory}).`,
          ),
        });
        return;
      }

      const reqQtyNum = Number(reqItem.requestedQty);
      const cleanUserRemark = preserveMultilineText(reqItem.userRemark ?? '');
      const cleanEquipNotes = preserveMultilineText(d.notes);
      const finalRemark = isMivType
        ? reqItem.userRemark !== undefined
          ? buildMivLineRemark(cleanEquipNotes, cleanUserRemark)
          : buildMivLineRemark(cleanEquipNotes, reqItem.remark)
        : preserveMultilineText(reqItem.remark);

      nextLines.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: preserveMultilineText(d.description || d.generalDescription),
        qty,
        requestedQty: Number.isFinite(reqQtyNum) && reqQtyNum > 0 ? reqQtyNum : qty,
        technicalInfo: normKey(reqItem.technicalInfo) || d.size || '',
        tagNo: normKey(reqItem.tagNo) || d.itemNo || '',
        codeNo: normKey(reqItem.codeNo) || d.itemCode || '',
        location: normKey(reqItem.location) || d.storageLocation || '',
        uom: normKey(reqItem.uom) || d.countingUnit || '',
        opiNo: normKey(reqItem.opiNo) || d.opiNo || '',
        returnReason: normKey(reqItem.returnReason) || '',
        remark: finalRemark,
        userRemark: cleanUserRemark || undefined,
        equipmentNotes: cleanEquipNotes || undefined,
        sourceWarehouse: reqItem.sourceWarehouse,
        ...(isMivType ? { deductedFromMapna, deductedFromContractor } : {}),
      });
    }

    const now = new Date().toISOString();
    const otherDocs = store.db.mivDocuments.filter((doc) => doc.id !== existing.id);
    const affectedDetailedIds = new Set<string>();
    for (const oldLine of existing.items) {
      const d = store.db.detailed.find((x) => x.id === oldLine.detailedId);
      if (!d) continue;
      affectedDetailedIds.add(d.id);
      if (existing.docType === 'miv_contractor' || existing.docType === 'miv_mapna') {
        const hasSplit =
          typeof oldLine.deductedFromMapna === 'number' ||
          typeof oldLine.deductedFromContractor === 'number';
        const revM = hasSplit
          ? Math.max(0, roundQty(oldLine.deductedFromMapna || 0))
          : existing.docType === 'miv_mapna'
            ? oldLine.qty
            : 0;
        const revC = hasSplit
          ? Math.max(0, roundQty(oldLine.deductedFromContractor || 0))
          : existing.docType === 'miv_contractor'
            ? oldLine.qty
            : 0;
        if (revC > 0) {
          d.mivContractorQty = Math.max(0, roundQty(toNum(d.mivContractorQty) - revC));
          d.mivContractorNo = removeRefToken(d.mivContractorNo, existing.docNo);
          if (d.mivContractorQty === 0 && !otherDocs.some((od) => (od.docType === 'miv_contractor' || od.docType === 'miv_mapna') && od.items.some((it) => it.detailedId === d.id && (it.deductedFromContractor ?? (od.docType === 'miv_contractor' ? it.qty : 0)) > 0))) {
            d.mivContractorDate = '';
          }
        }
        if (revM > 0) {
          d.mivMapnaQty = Math.max(0, roundQty(toNum(d.mivMapnaQty) - revM));
          d.mivMapnaNo = removeRefToken(d.mivMapnaNo, existing.docNo);
          if (d.mivMapnaQty === 0 && !otherDocs.some((od) => (od.docType === 'miv_mapna' || od.docType === 'miv_contractor') && od.items.some((it) => it.detailedId === d.id && (it.deductedFromMapna ?? (od.docType === 'miv_mapna' ? it.qty : 0)) > 0))) {
            d.mivMapnaDate = '';
          }
        }
      } else if (existing.docType === 'smr_contractor') {
        d.smrContractorQty = Math.max(0, roundQty(toNum(d.smrContractorQty) - oldLine.qty));
        d.smrContractorNo = removeRefToken(d.smrContractorNo, existing.docNo);
        if (d.smrContractorQty === 0 && !otherDocs.some((od) => od.docType === 'smr_contractor' && od.items.some((it) => it.detailedId === d.id))) {
          d.smrContractorDate = '';
        }
      } else if (existing.docType === 'smr_mapna') {
        d.smrMapnaQty = Math.max(0, roundQty(toNum(d.smrMapnaQty) - oldLine.qty));
        d.smrMapnaNo = removeRefToken(d.smrMapnaNo, existing.docNo);
        if (d.smrMapnaQty === 0 && !otherDocs.some((od) => od.docType === 'smr_mapna' && od.items.some((it) => it.detailedId === d.id))) {
          d.smrMapnaDate = '';
        }
      }
      d.updatedAt = now;
    }

    const totalMapna = nextLines.reduce((s, l) => s + (l.deductedFromMapna || 0), 0);
    const totalContractor = nextLines.reduce((s, l) => s + (l.deductedFromContractor || 0), 0);
    const nextDocType: MivDocType = isMivType
      ? totalMapna > 0 && totalContractor === 0
        ? 'miv_mapna'
        : 'miv_contractor'
      : requestedDocType;

    const cleanNotes = preserveMultilineText(raw.notes ?? existing.notes);
    const nextReceiver = raw.receiver !== undefined ? normKey(raw.receiver) : normKey(existing.receiver);
    const nextDeliveredBy = raw.deliveredBy !== undefined ? normKey(raw.deliveredBy) : normKey(existing.deliveredBy);
    for (const line of nextLines) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      affectedDetailedIds.add(d.id);
      if (isMivType) {
        const fromC = Math.max(0, roundQty(line.deductedFromContractor || 0));
        const fromM = Math.max(0, roundQty(line.deductedFromMapna || 0));
        if (fromC > 0) {
          d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
          d.mivContractorDate = cleanDate || d.mivContractorDate;
          d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + fromC);
        }
        if (fromM > 0) {
          d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
          d.mivMapnaDate = cleanDate || d.mivMapnaDate;
          d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + fromM);
        }
      } else if (nextDocType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
      } else if (nextDocType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
      }
      d.updatedAt = now;
    }

    existing.docType = nextDocType;
    existing.docNo = cleanNo;
    existing.date = cleanDate;
    if (raw.party !== undefined) existing.party = normKey(raw.party);
    if (raw.projectName !== undefined) existing.projectName = normKey(raw.projectName);
    if (raw.contractNo !== undefined) existing.contractNo = normKey(raw.contractNo);
    if (raw.purchasePackageNo !== undefined) existing.purchasePackageNo = normKey(raw.purchasePackageNo);
    if (raw.supplier !== undefined) existing.supplier = normKey(raw.supplier);
    if (raw.releaseNoteNo !== undefined) existing.releaseNoteNo = normKey(raw.releaseNoteNo);
    if (raw.islandSystem !== undefined) existing.islandSystem = normKey(raw.islandSystem);
    if (raw.unit !== undefined) existing.unit = normKey(raw.unit);
    if (raw.receiptNo !== undefined) existing.receiptNo = normKey(raw.receiptNo);
    if (raw.storekeeper !== undefined) existing.storekeeper = normKey(raw.storekeeper);
    if (raw.equipmentSupply !== undefined) existing.equipmentSupply = normKey(raw.equipmentSupply);
    if (raw.techOffice !== undefined) existing.techOffice = normKey(raw.techOffice);
    if (raw.installationDept !== undefined) existing.installationDept = normKey(raw.installationDept);
    if (raw.qcInspector !== undefined) existing.qcInspector = normKey(raw.qcInspector);
    if (raw.installerRep !== undefined) existing.installerRep = normKey(raw.installerRep);
    if (raw.requester !== undefined) existing.requester = normKey(raw.requester);
    existing.receiver = nextReceiver;
    existing.deliveredBy = nextDeliveredBy;
    existing.notes = cleanNotes;
    existing.items = nextLines;

    for (const detId of affectedDetailedIds) {
      const d = store.db.detailed.find((x) => x.id === detId);
      if (!d) continue;
      const mivReceivers = Array.from(
        new Set(
          store.db.mivDocuments
            .filter((doc) => (doc.docType === 'miv_contractor' || doc.docType === 'miv_mapna') && doc.items.some((it) => it.detailedId === detId))
            .map((doc) => normKey(doc.receiver || doc.party))
            .filter(Boolean),
        ),
      );
      if (existing.docType.startsWith('miv') || nextDocType.startsWith('miv')) {
        d.mivReceiver = mivReceivers.join(' , ');
      }
      const smrDeliverers = Array.from(
        new Set(
          store.db.mivDocuments
            .filter((doc) => (doc.docType === 'smr_contractor' || doc.docType === 'smr_mapna') && doc.items.some((it) => it.detailedId === detId))
            .map((doc) => normKey(doc.deliveredBy))
            .filter(Boolean),
        ),
      );
      if (existing.docType.startsWith('smr') || nextDocType.startsWith('smr')) {
        d.smrDeliverer = smrDeliverers.join(' , ');
      }
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: `UPDATE_${nextDocType.toUpperCase()}`,
      scope: nextDocType.startsWith('smr') ? 'smr' : 'miv',
      targetId: cleanNo,
      summary: `ویرایش فرم ${nextDocType} شماره ${cleanNo} (${nextLines.length} قلم کالا)`,
    });
    store.saveImmediate();
    res.json({ document: existing });
  });

  app.delete('/api/miv/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const removed = reverseMivDocument(store, req.params.id);
    if (!removed) {
      res.status(404).json({ error: errMsg(req, 'سند MIV / SMR یافت نشد', 'MIV / SMR document not found') });
      return;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: `DELETE_${removed.docType.toUpperCase()}`,
      scope: removed.docType.startsWith('smr') ? 'smr' : 'miv',
      targetId: removed.docNo,
      summary: `حذف فرم ${removed.docType} شماره ${removed.docNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- SUBSTITUTION (جایگزینی) ----------------
  const collectSubstitutionDetailedIds = (rec: SubstitutionRecord): Set<string> => {
    const ids = new Set<string>();
    if (rec.detailedId) ids.add(rec.detailedId);
    for (const it of rec.originalItems || []) {
      if (it.detailedId) ids.add(it.detailedId);
    }
    for (const it of rec.substituteItems || []) {
      if (it.detailedId) ids.add(it.detailedId);
    }
    return ids;
  };

  const cleanupSubstitutionFromDetailed = (rec: SubstitutionRecord, now: string): void => {
    const targetIds = collectSubstitutionDetailedIds(rec);
    const docLower = normKey(rec.docNo).toLowerCase();
    for (const detRow of store.db.detailed) {
      const hasDoc =
        Boolean(docLower) &&
        String(detRow.repNo || '')
          .split(/[،,]+/)
          .some((p) => p.trim().toLowerCase() === docLower);
      if (!targetIds.has(detRow.id) && !hasDoc) continue;
      detRow.repNo = removeRefTokenFromList(detRow.repNo, rec.docNo);
      detRow.repDescription = stripSubstitutionBlockFromText(
        detRow.repDescription,
        rec.docNo,
        rec.reason,
        rec.reprocureBy,
      );
      if (!normKey(detRow.repNo)) {
        detRow.repStatus = '';
        detRow.repReprocured = '';
      }
      detRow.updatedAt = now;
    }
  };

  const syncSubstitutionToDetailed = (rec: SubstitutionRecord, now: string): Set<string> => {
    const affectedIds = collectSubstitutionDetailedIds(rec);
    const exactDesc = buildReplacementDetailedDescription(rec.reason, rec.reprocureBy);
    for (const detId of affectedIds) {
      const detRow = store.db.detailed.find((x) => x.id === detId);
      if (!detRow) continue;
      detRow.repNo = appendUniqueRef(detRow.repNo, rec.docNo);
      detRow.repStatus = detRow.repStatus === 'بسته' ? 'بسته' : 'باز';
      if (rec.reprocureBy) detRow.repReprocured = rec.reprocureBy;
      if (exactDesc) {
        detRow.repDescription = appendMultilineLine(detRow.repDescription, exactDesc);
      }
      detRow.updatedAt = now;
    }
    return affectedIds;
  };

  const sanitizeSubstitutionLines = (
    rawOrigItems: unknown,
    rawSubItems: unknown,
  ): { orig: SubstitutionLineItem[]; sub: SubstitutionLineItem[] } => {
    const orig: SubstitutionLineItem[] = [];
    for (const item of Array.isArray(rawOrigItems) ? (rawOrigItems as Partial<SubstitutionLineItem>[]) : []) {
      const targetDet = store.db.detailed.find((x) => x.id === item?.detailedId);
      const qVal = Number(item?.qty);
      if (!targetDet || !Number.isFinite(qVal) || qVal <= 0) continue;
      orig.push({
        detailedId: targetDet.id,
        itemNo: normKey(item.itemNo) || targetDet.itemNo || '',
        shipmentNo: normKey(item.shipmentNo) || targetDet.shipmentNo || '',
        packageNo: normKey(item.packageNo) || targetDet.packageNo || '',
        description: preserveMultilineText(item.description) || targetDet.description || targetDet.generalDescription || '',
        itemCode: normKey(item.itemCode) || targetDet.itemCode || '',
        qty: qVal,
        countingUnit: normalizeCountingUnitToFa(targetDet.countingUnit) || 'عدد',
        drawingNo: '',
        remarks: preserveMultilineText(item.remarks),
        system: targetDet.system || '',
        island: targetDet.island || '',
        unit: targetDet.unit || '',
        supplier: targetDet.supplier || '',
        receiver: targetDet.receiver || '',
        merNo: targetDet.merNo || '',
      });
    }
    const sub: SubstitutionLineItem[] = [];
    for (const item of Array.isArray(rawSubItems) ? (rawSubItems as Partial<SubstitutionLineItem>[]) : []) {
      const targetDet = store.db.detailed.find((x) => x.id === item?.detailedId);
      const qVal = Number(item?.qty);
      if (!Number.isFinite(qVal) || qVal <= 0) continue;
      const desc = preserveMultilineText(item?.description) || targetDet?.description || targetDet?.generalDescription || '';
      if (!desc) continue;
      sub.push({
        detailedId: targetDet?.id || normKey(item?.detailedId),
        itemNo: normKey(item?.itemNo) || targetDet?.itemNo || '',
        shipmentNo: normKey(item?.shipmentNo) || targetDet?.shipmentNo || '',
        packageNo: normKey(item?.packageNo) || targetDet?.packageNo || '',
        description: desc,
        itemCode: normKey(item?.itemCode) || targetDet?.itemCode || '',
        qty: qVal,
        countingUnit: normalizeCountingUnitToFa(targetDet?.countingUnit || item?.countingUnit || '') || 'عدد',
        drawingNo: '',
        remarks: preserveMultilineText(item?.remarks),
        system: targetDet?.system || normKey(item?.system),
        island: targetDet?.island || normKey(item?.island),
        unit: targetDet?.unit || normKey(item?.unit),
        supplier: targetDet?.supplier || normKey(item?.supplier),
        receiver: targetDet?.receiver || normKey(item?.receiver),
        merNo: targetDet?.merNo || normKey(item?.merNo),
        stockSource: item?.stockSource === 'contractor' ? 'contractor' : 'mapna',
      });
    }
    return { orig, sub };
  };

  app.get('/api/substitutions', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      records: [...store.db.substitutions],
      detailedItems: [...store.getDetailedComputedList()].reverse(),
      generalEntries: [...store.db.general].reverse(),
      mivDocuments: [...store.db.mivDocuments],
    });
  });

  app.post('/api/substitutions', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<SubstitutionRecord>;
    const cleanNo = normKey(raw.docNo);
    const cleanDate = normKey(raw.date);
    const cleanReason = preserveMultilineText(raw.reason);

    const { orig: sanitizedOrigItems, sub: sanitizedSubItems } = sanitizeSubstitutionLines(
      raw.originalItems,
      raw.substituteItems,
    );

    const primaryDetailedId = sanitizedOrigItems[0]?.detailedId || raw.detailedId;
    const d = store.db.detailed.find((x) => x.id === primaryDetailedId);
    const cleanSubDesc =
      preserveMultilineText(raw.substituteDescription) ||
      sanitizedSubItems.map((i) => i.description).filter(Boolean).join(' / ');

    if (!cleanNo || !cleanDate || !d || !cleanSubDesc || !cleanReason) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره سند جایگزینی، تاریخ، کالای اصلی، مشخصات کالای جایگزین و دلیل جایگزینی الزامی است',
          'Document No., date, original item, substitute description, and reason are required',
        ),
      });
      return;
    }
    const uniqCheck = assertUniqueDocNo(store.db, cleanNo);
    if (!uniqCheck.ok) {
      res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
      return;
    }

    const numQty =
      sanitizedOrigItems.length > 0
        ? roundQty(sanitizedOrigItems.reduce((sum, i) => sum + i.qty, 0))
        : Number(raw.qty);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      res.status(400).json({ error: errMsg(req, 'تعداد جایگزینی باید بزرگتر از صفر باشد', 'Substitution quantity must be greater than zero') });
      return;
    }

    const mivDocIds = Array.isArray(raw.mivDocIds)
      ? raw.mivDocIds.map((id) => normKey(id)).filter(Boolean)
      : raw.mivDocId
        ? [normKey(raw.mivDocId)]
        : [];

    const now = new Date().toISOString();
    const record: SubstitutionRecord = {
      id: makeId(),
      docNo: cleanNo,
      date: cleanDate,
      detailedId: d.id,
      shipmentNo: d.shipmentNo,
      packageNo: d.packageNo,
      itemNo: d.itemNo,
      projectName: normKey(raw.projectName),
      contractNo: normKey(raw.contractNo),
      system: normKey(raw.system) || d.system || '',
      island: normKey(raw.island) || d.island || '',
      unit: normKey(raw.unit) || d.unit || '',
      supplier: normKey(raw.supplier) || d.supplier || '',
      supplyUrgency: normKey(raw.supplyUrgency) || 'عادی',
      installerContractor: normKey(raw.installerContractor),
      mivNo: normKey(raw.mivNo) || d.mivContractorNo || d.mivMapnaNo || '',
      mivDocId: normKey(raw.mivDocId) || mivDocIds[0] || undefined,
      mivDocIds: mivDocIds.length > 0 ? mivDocIds : undefined,
      merNcrNo: raw.merNcrNo !== undefined ? normKey(raw.merNcrNo) : d.merNo || '',
      originalDescription: d.description || d.generalDescription,
      originalItemCode: d.itemCode,
      originalDrawingNo: normKey(raw.originalDrawingNo),
      originalRemarks: preserveMultilineText(raw.originalRemarks) || sanitizedOrigItems[0]?.remarks || '',
      originalItems: sanitizedOrigItems.length > 0 ? sanitizedOrigItems : undefined,
      substitutePackageNo:
        normKey(raw.substitutePackageNo) || sanitizedSubItems[0]?.shipmentNo || '',
      substituteDescription: cleanSubDesc,
      substituteItemCode:
        normKey(raw.substituteItemCode) || sanitizedSubItems[0]?.itemCode || '',
      substituteSize: normKey(raw.substituteSize),
      substituteDrawingNo: normKey(raw.substituteDrawingNo),
      substituteRemarks: preserveMultilineText(raw.substituteRemarks) || sanitizedSubItems[0]?.remarks || '',
      substituteItems: sanitizedSubItems.length > 0 ? sanitizedSubItems : undefined,
      qty: numQty,
      countingUnit: normalizeCountingUnitToFa(d.countingUnit) || 'عدد',
      reason: cleanReason,
      supplierNotes: preserveMultilineText(raw.supplierNotes),
      reprocureBy: normKey(raw.reprocureBy),
      costBorneBy: normKey(raw.costBorneBy),
      approvedBy: normKey(raw.approvedBy),
      mapnaRep: normKey(raw.mapnaRep) || normKey(raw.approvedBy),
      installerSignatory: normKey(raw.installerSignatory),
      supplierSignatory: normKey(raw.supplierSignatory),
      status: raw.status || 'executed',
      notes: preserveMultilineText(raw.notes),
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.substitutions.unshift(record);

    const affectedIds = syncSubstitutionToDetailed(record, now);

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_SUBSTITUTION',
      scope: 'substitution',
      targetId: cleanNo,
      summary: `ثبت فرم جایگزینی شماره ${cleanNo} (${affectedIds.size} ردیف در ثبت جزئیات)`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  const handleUpdateSubstitution = (req: AuthedRequest, res: Response) => {
    const rec = store.db.substitutions.find((s) => s.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'سند جایگزینی یافت نشد', 'Substitution record not found') });
      return;
    }
    const raw = req.body as Partial<SubstitutionRecord> & { replaceMivDocs?: boolean };
    const prevSnapshot: SubstitutionRecord = JSON.parse(JSON.stringify(rec));
    const now = new Date().toISOString();

    if (raw.docNo !== undefined) {
      const cleanNo = normKey(raw.docNo);
      if (!cleanNo) {
        res.status(400).json({ error: errMsg(req, 'شماره سند جایگزینی الزامی است', 'Document No. is required') });
        return;
      }
      const uniqCheck = assertUniqueDocNo(store.db, cleanNo, { excludeScope: 'substitutions', excludeId: rec.id });
      if (!uniqCheck.ok) {
        res.status(409).json({ error: errMsg(req, uniqCheck.errorFa!, uniqCheck.errorEn!) });
        return;
      }
      rec.docNo = cleanNo;
    }
    if (raw.date !== undefined) {
      const cleanDate = normKey(raw.date);
      if (!cleanDate) {
        res.status(400).json({ error: errMsg(req, 'تاریخ سند جایگزینی الزامی است', 'Date is required') });
        return;
      }
      rec.date = cleanDate;
    }

    if (raw.originalItems !== undefined || raw.substituteItems !== undefined) {
      const { orig, sub } = sanitizeSubstitutionLines(
        raw.originalItems !== undefined ? raw.originalItems : rec.originalItems,
        raw.substituteItems !== undefined ? raw.substituteItems : rec.substituteItems,
      );
      if (raw.originalItems !== undefined) {
        if (orig.length === 0) {
          res.status(400).json({ error: errMsg(req, 'حداقل یک کالای اصلی (بخش الف) الزامی است', 'At least one original item is required') });
          return;
        }
        rec.originalItems = orig;
        const primary = store.db.detailed.find((x) => x.id === orig[0].detailedId);
        if (primary) {
          rec.detailedId = primary.id;
          rec.shipmentNo = primary.shipmentNo;
          rec.packageNo = primary.packageNo;
          rec.itemNo = primary.itemNo;
          rec.originalDescription = primary.description || primary.generalDescription;
          rec.originalItemCode = primary.itemCode;
          rec.countingUnit = normalizeCountingUnitToFa(primary.countingUnit) || 'عدد';
        }
        rec.qty = roundQty(orig.reduce((sum, i) => sum + i.qty, 0));
      }
      if (raw.substituteItems !== undefined) {
        rec.substituteItems = sub.length > 0 ? sub : undefined;
        if (sub.length > 0) {
          rec.substitutePackageNo = normKey(raw.substitutePackageNo) || sub[0].shipmentNo || '';
          rec.substituteItemCode = normKey(raw.substituteItemCode) || sub[0].itemCode || '';
          rec.substituteDescription =
            preserveMultilineText(raw.substituteDescription) ||
            sub.map((i) => i.description).filter(Boolean).join(' / ');
        }
      }
    } else if (raw.detailedId !== undefined && raw.detailedId !== rec.detailedId) {
      const d = store.db.detailed.find((x) => x.id === raw.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'کالای اصلی یافت نشد', 'Original detailed item not found') });
        return;
      }
      rec.detailedId = d.id;
      rec.shipmentNo = d.shipmentNo;
      rec.packageNo = d.packageNo;
      rec.itemNo = d.itemNo;
      rec.originalDescription = d.description || d.generalDescription;
      rec.originalItemCode = d.itemCode;
      rec.countingUnit = normalizeCountingUnitToFa(d.countingUnit) || 'عدد';
    }

    if (raw.qty !== undefined && raw.originalItems === undefined) {
      const numQty = Number(raw.qty);
      if (!Number.isFinite(numQty) || numQty <= 0) {
        res.status(400).json({ error: errMsg(req, 'تعداد جایگزینی باید بزرگتر از صفر باشد', 'Substitution quantity must be greater than zero') });
        return;
      }
      rec.qty = numQty;
    }
    if (raw.substituteDescription !== undefined) {
      const cleanSubDesc = preserveMultilineText(raw.substituteDescription);
      if (!cleanSubDesc) {
        res.status(400).json({ error: errMsg(req, 'مشخصات کالای جایگزین الزامی است', 'Substitute description is required') });
        return;
      }
      rec.substituteDescription = cleanSubDesc;
    }
    if (raw.reason !== undefined) {
      const cleanReason = preserveMultilineText(raw.reason);
      if (!cleanReason) {
        res.status(400).json({ error: errMsg(req, 'دلیل جایگزینی الزامی است', 'Reason is required') });
        return;
      }
      rec.reason = cleanReason;
    }
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.contractNo !== undefined) rec.contractNo = normKey(raw.contractNo);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.supplier !== undefined) rec.supplier = normKey(raw.supplier);
    if (raw.supplyUrgency !== undefined) rec.supplyUrgency = normKey(raw.supplyUrgency);
    if (raw.installerContractor !== undefined) rec.installerContractor = normKey(raw.installerContractor);
    if (raw.mivNo !== undefined) rec.mivNo = normKey(raw.mivNo);
    if (raw.mivDocIds !== undefined) {
      const nextIds = Array.isArray(raw.mivDocIds) ? raw.mivDocIds.map((x) => normKey(x)).filter(Boolean) : [];
      if (raw.replaceMivDocs) {
        const oldIds = new Set<string>([
          ...(prevSnapshot.mivDocIds || []),
          ...(prevSnapshot.mivDocId ? [prevSnapshot.mivDocId] : []),
        ]);
        for (const oldId of oldIds) {
          if (!nextIds.includes(oldId)) {
            reverseMivDocument(store, oldId);
          }
        }
      }
      rec.mivDocIds = nextIds.length > 0 ? nextIds : undefined;
      rec.mivDocId = nextIds[0] || undefined;
    } else if (raw.mivDocId !== undefined) {
      rec.mivDocId = normKey(raw.mivDocId) || undefined;
    }
    if (raw.merNcrNo !== undefined) rec.merNcrNo = normKey(raw.merNcrNo);
    if (raw.originalDrawingNo !== undefined) rec.originalDrawingNo = normKey(raw.originalDrawingNo);
    if (raw.originalRemarks !== undefined) rec.originalRemarks = preserveMultilineText(raw.originalRemarks);
    if (raw.substitutePackageNo !== undefined) rec.substitutePackageNo = normKey(raw.substitutePackageNo);
    if (raw.substituteItemCode !== undefined) rec.substituteItemCode = normKey(raw.substituteItemCode);
    if (raw.substituteSize !== undefined) rec.substituteSize = normKey(raw.substituteSize);
    if (raw.substituteDrawingNo !== undefined) rec.substituteDrawingNo = normKey(raw.substituteDrawingNo);
    if (raw.substituteRemarks !== undefined) rec.substituteRemarks = preserveMultilineText(raw.substituteRemarks);
    if (raw.supplierNotes !== undefined) rec.supplierNotes = preserveMultilineText(raw.supplierNotes);
    if (raw.reprocureBy !== undefined) rec.reprocureBy = normKey(raw.reprocureBy);
    if (raw.costBorneBy !== undefined) rec.costBorneBy = normKey(raw.costBorneBy);
    if (raw.approvedBy !== undefined) rec.approvedBy = normKey(raw.approvedBy);
    if (raw.mapnaRep !== undefined) rec.mapnaRep = normKey(raw.mapnaRep);
    if (raw.installerSignatory !== undefined) rec.installerSignatory = normKey(raw.installerSignatory);
    if (raw.supplierSignatory !== undefined) rec.supplierSignatory = normKey(raw.supplierSignatory);
    if (raw.status) rec.status = raw.status;
    if (raw.notes !== undefined) rec.notes = preserveMultilineText(raw.notes);

    cleanupSubstitutionFromDetailed(prevSnapshot, now);
    syncSubstitutionToDetailed(rec, now);

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_SUBSTITUTION',
      scope: 'substitution',
      targetId: rec.docNo,
      summary: `ویرایش فرم جایگزینی شماره ${rec.docNo}`,
    });
    store.saveImmediate();
    res.json({ record: rec });
  };

  app.put('/api/substitutions/:id', requireRole(['admin', 'operator']), handleUpdateSubstitution);
  app.patch('/api/substitutions/:id', requireRole(['admin', 'operator']), handleUpdateSubstitution);

  app.delete('/api/substitutions/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.substitutions.findIndex((s) => s.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'سند جایگزینی یافت نشد', 'Substitution record not found') });
      return;
    }
    const [removed] = store.db.substitutions.splice(idx, 1);
    const now = new Date().toISOString();

    // 1) Reverse all linked auto-issued MIV documents so inventory returns to exact Mapna/Contractor pool
    const linkedMivIds = new Set<string>();
    if (removed.mivDocId) linkedMivIds.add(removed.mivDocId);
    for (const mid of removed.mivDocIds || []) {
      if (mid) linkedMivIds.add(mid);
    }
    if (removed.docNo) {
      const needle = removed.docNo.toLowerCase();
      for (const mdoc of store.db.mivDocuments) {
        if ((mdoc.notes || '').toLowerCase().includes(needle)) {
          linkedMivIds.add(mdoc.id);
        }
      }
    }
    let reversedMivs = 0;
    for (const mid of linkedMivIds) {
      if (reverseMivDocument(store, mid)) {
        reversedMivs += 1;
      }
    }

    // 2) Clean substitution fields from BOTH Section A & Section B Detailed rows
    cleanupSubstitutionFromDetailed(removed, now);

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_SUBSTITUTION',
      scope: 'substitution',
      targetId: removed.docNo,
      summary: `حذف فرم جایگزینی شماره ${removed.docNo} (بازگردانی ${reversedMivs} حواله MIV و پاکسازی ثبت جزئیات)`,
    });
    store.saveImmediate();
    res.json({ ok: true, reversedMivs });
  });

  // ---------------- SIGNED FORM SCANS (ALL FORMS EXCEPT STORAGE LABELS) ----------------
  const resolveSignedScanCollection = (
    rawCollection: string,
  ): {
    items: Array<{ id: string; signedScan?: SignedScanAttachment | null }>;
    auditScope: AuditLogEntry['scope'];
  } | null => {
    const key = rawCollection as SignedScanCollectionKey;
    switch (key) {
      case 'opi':
        return { items: store.db.opiInvitations, auditScope: 'opi' };
      case 'siteEntry':
        return { items: store.db.siteEntryMinutes, auditScope: 'siteEntry' };
      case 'opiMinutes':
        return { items: store.db.opiMinutes, auditScope: 'opiMinutes' };
      case 'osdr':
        return { items: store.db.osdrReports, auditScope: 'osdr' };
      case 'substitutions':
        return { items: store.db.substitutions, auditScope: 'substitution' };
      case 'gcv':
        return { items: store.db.gcvDocuments, auditScope: 'gcv' };
      case 'miv':
        return { items: store.db.mivDocuments, auditScope: 'miv' };
      case 'periodic':
        return { items: store.db.periodicInspections, auditScope: 'periodicInspection' };
      case 'customForms':
        if (!store.db.customFormSubmissions) store.db.customFormSubmissions = [];
        return { items: store.db.customFormSubmissions, auditScope: 'customForm' };
      default:
        return null;
    }
  };

  app.put('/api/form-scans/:collection/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const resolved = resolveSignedScanCollection(req.params.collection);
    if (!resolved) {
      res.status(400).json({ error: errMsg(req, 'بخش فرم معتبر نیست', 'Invalid form collection') });
      return;
    }
    const target = resolved.items.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: errMsg(req, 'سند مورد نظر یافت نشد', 'Target form record not found') });
      return;
    }
    const rawBody = (req.body || {}) as Partial<SignedScanAttachment>;
    const validation = validateSignedScanPayload({
      ...rawBody,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.currentUser!.fullName || req.currentUser!.username,
    });
    if (!validation.ok || !validation.attachment) {
      res.status(400).json({
        error: errMsg(
          req,
          validation.errorFa || 'فایل اسکن معتبر نیست',
          validation.errorEn || 'Invalid signed scan file',
        ),
      });
      return;
    }
    target.signedScan = validation.attachment;
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPLOAD_SIGNED_SCAN',
      scope: resolved.auditScope,
      targetId: target.id,
      summary: `بارگذاری اسکن امضاشده فرم (${validation.attachment.fileName}) در بخش ${req.params.collection}`,
    });
    store.saveImmediate();
    res.json({ ok: true, signedScan: validation.attachment });
  });

  app.delete('/api/form-scans/:collection/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const resolved = resolveSignedScanCollection(req.params.collection);
    if (!resolved) {
      res.status(400).json({ error: errMsg(req, 'بخش فرم معتبر نیست', 'Invalid form collection') });
      return;
    }
    const target = resolved.items.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: errMsg(req, 'سند مورد نظر یافت نشد', 'Target form record not found') });
      return;
    }
    target.signedScan = null;
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_SIGNED_SCAN',
      scope: resolved.auditScope,
      targetId: target.id,
      summary: `حذف فایل اسکن امضاشده فرم در بخش ${req.params.collection}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- MATERIAL ESTIMATION (MTO) ----------------
  app.get('/api/estimations', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      records: store.db.materialEstimates,
      detailedItems: [...store.getDetailedComputedList()].reverse(),
    });
  });

  app.post('/api/estimations', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<MaterialEstimateRecord>;
    const cleanDesc = normKey(raw.description);
    const estQty = toNum(raw.estimatedQty) ?? 0;
    if (!cleanDesc) {
      res.status(400).json({ error: errMsg(req, 'شرح تجهیزات برآورد الزامی است', 'Estimated equipment description is required') });
      return;
    }
    if (estQty <= 0) {
      res.status(400).json({ error: errMsg(req, 'مقدار برآورد باید بزرگتر از صفر باشد', 'Estimated quantity must be greater than zero') });
      return;
    }
    const cleanGeneralDesc = normKey(raw.generalDescription)
      ? formatGeneralDescriptionCase(normKey(raw.generalDescription))
      : inferGeneralDescription(cleanDesc);
    const now = new Date().toISOString();
    const record: MaterialEstimateRecord = {
      id: makeId(),
      mtoCode: normKey(raw.mtoCode),
      generalDescription: cleanGeneralDesc,
      description: cleanDesc,
      itemCode: normKey(raw.itemCode),
      size: normKey(raw.size),
      countingUnit: normalizeCountingUnitToFa(raw.countingUnit) || 'عدد',
      estimatedQty: roundQty(estQty),
      island: normKey(raw.island),
      system: normKey(raw.system),
      subSystem: normKey(raw.subSystem),
      unit: normKey(raw.unit),
      priority: raw.priority === 'critical' ? 'critical' : 'normal',
      notes: normKey(raw.notes),
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.materialEstimates.unshift(record);
    store.registerCategoriesFromFields({
      island: record.island,
      system: record.system,
      subSystem: record.subSystem,
      unit: record.unit,
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_ESTIMATION',
      scope: 'estimation',
      targetId: record.mtoCode || record.itemCode || record.description.slice(0, 32),
      summary: `ثبت ردیف برآورد تجهیزات: ${record.description} (مقدار برآورد: ${record.estimatedQty} ${record.countingUnit})`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  app.patch('/api/estimations/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.materialEstimates.find((e) => e.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'ردیف برآورد تجهیزات یافت نشد', 'Equipment estimation record not found') });
      return;
    }
    const raw = req.body as Partial<MaterialEstimateRecord>;
    if (raw.description !== undefined) {
      const cleanDesc = normKey(raw.description);
      if (!cleanDesc) {
        res.status(400).json({ error: errMsg(req, 'شرح تجهیزات برآورد الزامی است', 'Estimated equipment description is required') });
        return;
      }
      rec.description = cleanDesc;
    }
    if (raw.generalDescription !== undefined) {
      const cleanGen = normKey(raw.generalDescription);
      rec.generalDescription = cleanGen
        ? formatGeneralDescriptionCase(cleanGen)
        : inferGeneralDescription(rec.description);
    }
    if (raw.estimatedQty !== undefined) {
      const qty = toNum(raw.estimatedQty) ?? 0;
      if (qty <= 0) {
        res.status(400).json({ error: errMsg(req, 'مقدار برآورد باید بزرگتر از صفر باشد', 'Estimated quantity must be greater than zero') });
        return;
      }
      rec.estimatedQty = roundQty(qty);
    }
    if (raw.mtoCode !== undefined) rec.mtoCode = normKey(raw.mtoCode);
    if (raw.itemCode !== undefined) rec.itemCode = normKey(raw.itemCode);
    if (raw.size !== undefined) rec.size = normKey(raw.size);
    if (raw.countingUnit !== undefined) rec.countingUnit = normalizeCountingUnitToFa(raw.countingUnit) || 'عدد';
    if (raw.island !== undefined) rec.island = normKey(raw.island);
    if (raw.system !== undefined) rec.system = normKey(raw.system);
    if (raw.subSystem !== undefined) rec.subSystem = normKey(raw.subSystem);
    if (raw.unit !== undefined) rec.unit = normKey(raw.unit);
    if (raw.priority === 'normal' || raw.priority === 'critical') rec.priority = raw.priority;
    if (raw.notes !== undefined) rec.notes = normKey(raw.notes);
    rec.updatedAt = new Date().toISOString();

    store.registerCategoriesFromFields({
      island: rec.island,
      system: rec.system,
      subSystem: rec.subSystem,
      unit: rec.unit,
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_ESTIMATION',
      scope: 'estimation',
      targetId: rec.mtoCode || rec.itemCode || rec.description.slice(0, 32),
      summary: `ویرایش ردیف برآورد تجهیزات: ${rec.description} (${rec.estimatedQty} ${rec.countingUnit})`,
    });
    store.saveImmediate();
    res.json({ record: rec });
  });

  app.delete('/api/estimations/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.materialEstimates.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'ردیف برآورد تجهیزات یافت نشد', 'Equipment estimation record not found') });
      return;
    }
    const [removed] = store.db.materialEstimates.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_ESTIMATION',
      scope: 'estimation',
      targetId: removed.mtoCode || removed.itemCode || removed.description.slice(0, 32),
      summary: `حذف ردیف برآورد تجهیزات: ${removed.description}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- MATERIAL BALANCE ----------------
  app.post('/api/balance/assign', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { detailedIds, materialBalanceNo, balanceStatus } = req.body as {
      detailedIds?: string[];
      materialBalanceNo?: string;
      balanceStatus?: string;
    };
    if (!Array.isArray(detailedIds) || detailedIds.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک آیتم انتخاب کنید', 'Select at least one item') });
      return;
    }
    const cleanNo = normKey(materialBalanceNo);
    const cleanStatus = normKey(balanceStatus);
    if (!cleanNo && !cleanStatus) {
      res.status(400).json({ error: errMsg(req, 'شماره موازنه یا وضعیت موازنه الزامی است', 'Balance No. or Balance Status is required') });
      return;
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = store.db.detailed.find((x) => x.id === id);
      if (!d) continue;
      if (cleanNo) d.materialBalanceNo = cleanNo;
      if (cleanStatus) d.balanceStatus = cleanStatus;
      d.updatedAt = now;
      updatedCount += 1;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ASSIGN_MATERIAL_BALANCE',
      scope: 'balance',
      targetId: cleanNo || cleanStatus,
      summary: `ثبت وضعیت موازنه مواد (${cleanNo || '-'} / ${cleanStatus || '-'}) برای ${updatedCount} ردیف`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  // ---------------- STOCKTAKE ----------------
  app.post('/api/stocktake/assign', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { detailedIds, stocktakeStatus, stocktakeDate, stocktakeInfo } = req.body as {
      detailedIds?: string[];
      stocktakeStatus?: string;
      stocktakeDate?: string;
      stocktakeInfo?: string;
    };
    if (!Array.isArray(detailedIds) || detailedIds.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک آیتم انتخاب کنید', 'Select at least one item') });
      return;
    }
    const cleanStatus = normKey(stocktakeStatus);
    const cleanDate = normKey(stocktakeDate);
    const cleanInfo = normKey(stocktakeInfo);
    if (!cleanStatus) {
      res.status(400).json({ error: errMsg(req, 'وضعیت انبارگردانی و بازدید ادواری الزامی است', 'Stocktake & periodic inspection status is required') });
      return;
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = store.db.detailed.find((x) => x.id === id);
      if (!d) continue;
      d.stocktakeStatus = cleanStatus;
      if (cleanDate) d.stocktakeDate = cleanDate;
      d.stocktakeInfo = cleanInfo || (cleanDate ? `${cleanStatus} (${cleanDate})` : cleanStatus);
      d.updatedAt = now;
      updatedCount += 1;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ASSIGN_STOCKTAKE',
      scope: 'stocktake',
      targetId: cleanStatus,
      summary: `ثبت وضعیت انبارگردانی و بازدید ادواری «${cleanStatus}» در تاریخ ${cleanDate || '-'} برای ${updatedCount} ردیف`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  // ---------------- PERIODIC INSPECTION CHECKLIST (بازدید ادواری انبار) ----------------
  app.get('/api/periodic-inspections', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({ records: store.db.periodicInspections });
  });

  app.post('/api/periodic-inspections', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<PeriodicInspectionRecord>;
    const cleanDate = normKey(raw.inspectionDate);
    if (!cleanDate) {
      res.status(400).json({ error: errMsg(req, 'تاریخ بازدید ادواری الزامی است', 'Inspection date is required') });
      return;
    }
    const answers = Array.isArray(raw.answers)
      ? raw.answers.map((a) => ({
          questionKey: normKey(a?.questionKey),
          status: (a?.status === '+' || a?.status === '-' ? a.status : '') as '+' | '-' | '',
          remarks: normKey(a?.remarks),
        }))
      : [];

    const record: PeriodicInspectionRecord = {
      id: makeId(),
      projectName: normKey(raw.projectName),
      inspectionDate: cleanDate,
      supervisorName: normKey(raw.supervisorName),
      inspectorsSignatory: normKey(raw.inspectorsSignatory),
      siteSupervisorSignatory: normKey(raw.siteSupervisorSignatory),
      projectManagerSignatory: normKey(raw.projectManagerSignatory),
      copyTo: normKey(raw.copyTo),
      answers,
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.periodicInspections.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_PERIODIC_INSPECTION',
      scope: 'periodicInspection',
      targetId: cleanDate,
      summary: `ثبت چک‌لیست بازدید ادواری انبار مورخ ${cleanDate}${record.projectName ? ` (${record.projectName})` : ''}`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  app.patch('/api/periodic-inspections/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.periodicInspections.find((r) => r.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'سابقه بازدید ادواری یافت نشد', 'Periodic inspection record not found') });
      return;
    }
    const raw = req.body as Partial<PeriodicInspectionRecord>;
    const cleanDate = normKey(raw.inspectionDate ?? rec.inspectionDate);
    if (!cleanDate) {
      res.status(400).json({ error: errMsg(req, 'تاریخ بازدید ادواری الزامی است', 'Inspection date is required') });
      return;
    }
    rec.inspectionDate = cleanDate;
    if (raw.projectName !== undefined) rec.projectName = normKey(raw.projectName);
    if (raw.supervisorName !== undefined) rec.supervisorName = normKey(raw.supervisorName);
    if (raw.inspectorsSignatory !== undefined) rec.inspectorsSignatory = normKey(raw.inspectorsSignatory);
    if (raw.siteSupervisorSignatory !== undefined) rec.siteSupervisorSignatory = normKey(raw.siteSupervisorSignatory);
    if (raw.projectManagerSignatory !== undefined) rec.projectManagerSignatory = normKey(raw.projectManagerSignatory);
    if (raw.copyTo !== undefined) rec.copyTo = normKey(raw.copyTo);
    if (Array.isArray(raw.answers)) {
      rec.answers = raw.answers.map((a) => ({
        questionKey: normKey(a?.questionKey),
        status: (a?.status === '+' || a?.status === '-' ? a.status : '') as '+' | '-' | '',
        remarks: normKey(a?.remarks),
      }));
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_PERIODIC_INSPECTION',
      scope: 'periodicInspection',
      targetId: cleanDate,
      summary: `ویرایش چک‌لیست بازدید ادواری انبار مورخ ${cleanDate}`,
    });
    store.saveImmediate();
    res.json({ record: rec });
  });

  app.delete('/api/periodic-inspections/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.periodicInspections.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'سابقه بازدید ادواری یافت نشد', 'Periodic inspection record not found') });
      return;
    }
    const [removed] = store.db.periodicInspections.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_PERIODIC_INSPECTION',
      scope: 'periodicInspection',
      targetId: removed.inspectionDate,
      summary: `حذف چک‌لیست بازدید ادواری مورخ ${removed.inspectionDate}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- GLOBAL SEARCH ----------------
  app.get('/api/search', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '').trim();
    const packingNos = parsePackingNosParam(String(req.query.packingNos || ''));
    const customFilters = parseCustomFiltersParam(String(req.query.customFilters || ''));
    const limit = Math.min(200, Number(queryLimit(req.query.limit)));
    if (!q && packingNos.length === 0 && customFilters.length === 0) {
      res.json({ general: [], detailed: [], transit: [] });
      return;
    }
    const general = store.db.general
      .filter((g) => {
        if (!matchesMultiPacking(g.packingListNo, packingNos)) return false;
        if (!matchesCustomFilters(g as unknown as Record<string, unknown>, customFilters)) return false;
        return matchSearch(
          [
            g.rowNo,
            g.packingListNo,
            g.packageNo,
            g.packageType || '',
            g.itemDescription,
            g.supplier,
            g.dispatchLocation,
            g.employerEntryMinutesNo,
            g.mapnaEntryMinutesNo,
            g.billOfLadingNo,
            g.vehicleNo,
            g.driverName,
            g.island,
            g.system,
            g.subSystem,
            g.unit,
          ],
          q,
        );
      })
      .reverse()
      .slice(0, limit);

    const detailed = store.db.detailed
      .filter((d) => {
        if (!matchesMultiPacking(d.shipmentNo, packingNos)) return false;
        if (
          !matchSearch(
            [
              d.rowNo,
              d.shipmentNo,
              d.packageNo,
              d.itemNo,
              d.generalDescription,
              d.description,
              d.itemCode,
              d.mtoRef,
              d.supplier,
              d.gcvReceiptNo,
              d.mivContractorNo,
              d.smrContractorNo,
              d.materialBalanceNo,
              d.balanceStatus,
              d.storageLocation,
              d.stocktakeStatus,
            ],
            q,
          )
        ) {
          return false;
        }
        return true;
      })
      .map(computeDetailedEntry)
      .filter((comp) => matchesCustomFilters(comp as unknown as Record<string, unknown>, customFilters))
      .reverse()
      .slice(0, limit);

    const transit = store.db.transit
      .filter((t) => {
        if (!matchesMultiPacking(t.packingListNo, packingNos)) return false;
        if (!matchesCustomFilters(t as unknown as Record<string, unknown>, customFilters)) return false;
        return matchSearch(
          [
            t.rowNo,
            t.packingListNo,
            t.packageNo,
            t.itemDescription,
            t.supplier,
            t.overallStatus,
            t.releaseNetNo,
            t.interimNo,
            t.billOfLadingNo,
            t.carrierContractor,
          ],
          q,
        );
      })
      .reverse()
      .slice(0, limit);

    res.json({ general, detailed, transit });
  });

  // ---------------- CATEGORIES ----------------
  app.get('/api/categories', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    sanitizeCategoryStore(store.db.categories);
    const counts = computeCategoryCounts(store.db);
    res.json({ categories: store.db.categories, counts });
  });

  app.post('/api/categories/:group', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const { value } = req.body as { value?: string };
    const cleanVal = group === 'countingUnit' ? normalizeCountingUnitToFa(value) : normKey(value);
    if (!store.db.categories[group] || !cleanVal) {
      res.status(400).json({ error: errMsg(req, 'گروه دسته‌بندی نامعتبر یا مقدار خالی است', 'Invalid category group or empty value') });
      return;
    }
    if (group === 'transitStatus' && cleanVal === 'پایان') {
      res.status(400).json({ error: errMsg(req, 'وضعیت «پایان» به‌صورت خودکار به «رسیده» تبدیل می‌شود و نیازی به افزودن آن نیست.', 'Legacy status "پایان" maps automatically to "رسیده".') });
      return;
    }
    const beforeCats = JSON.parse(JSON.stringify(store.db.categories));
    store.registerCategoryValue(group, cleanVal);
    store.history.push({
      labelFa: `افزودن دسته‌بندی «${cleanVal}»`,
      labelEn: `Add Category "${cleanVal}"`,
      user: req.currentUser!.fullName || req.currentUser!.username,
      changes: [{ scope: 'categories', before: beforeCats, after: JSON.parse(JSON.stringify(store.db.categories)) }],
    });
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ADD_CATEGORY',
      scope: 'category',
      targetId: `${group}:${cleanVal}`,
      summary: `افزودن دسته‌بندی «${cleanVal}» در گروه ${group}`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories });
  });

  app.patch('/api/categories/:group', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const { oldValue, newValue } = req.body as { oldValue?: string; newValue?: string };
    const from = normKey(oldValue);
    const to = group === 'countingUnit' ? normalizeCountingUnitToFa(newValue) : normKey(newValue);
    if (!store.db.categories[group] || !from || !to) {
      res.status(400).json({ error: errMsg(req, 'پارامترهای تغییر نام نامعتبر است', 'Invalid rename parameters') });
      return;
    }
    if (group === 'transitStatus' && (DEFAULT_TRANSIT_STATUSES as readonly string[]).includes(from)) {
      res.status(400).json({
        error: errMsg(
          req,
          'سه وضعیت اصلی در راه («در دست ارسال»، «در دست بازرسی»، «رسیده») قابل تغییر نام نیستند.',
          'The 3 core In-Transit statuses cannot be renamed.',
        ),
      });
      return;
    }

    const updatedCount = applyCategoryRename(store.db, group, from, to);
    store.rebuildIndexes(false);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'RENAME_MERGE_CATEGORY',
      scope: 'category',
      targetId: `${group}:${from}->${to}`,
      summary: `تغییر نام/ادغام «${from}» به «${to}» در ${group} (${updatedCount} رکورد به‌روزرسانی شد)`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories, updatedCount });
  });

  app.delete('/api/categories/:group', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const value = normKey(String(req.query.value || ''));
    if (!store.db.categories[group] || !value) {
      res.status(400).json({ error: errMsg(req, 'درخواست حذف نامعتبر است', 'Invalid delete request') });
      return;
    }
    if (group === 'transitStatus' && (DEFAULT_TRANSIT_STATUSES as readonly string[]).includes(value)) {
      res.status(400).json({
        error: errMsg(
          req,
          'سه وضعیت اصلی در راه («در دست ارسال»، «در دست بازرسی»، «رسیده») قابل حذف نیستند.',
          'The 3 core In-Transit statuses cannot be deleted.',
        ),
      });
      return;
    }
    const updatedCount = applyCategoryDelete(store.db, group, value);
    store.rebuildIndexes(false);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_CATEGORY',
      scope: 'category',
      targetId: `${group}:${value}`,
      summary: `حذف مقدار «${value}» از فهرست ${group} (${updatedCount} رکورد به‌روزرسانی شد)`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories, updatedCount });
  });

  // ---------------- ANALYTICS DASHBOARD ----------------
  app.get('/api/analytics', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const calendar = (String(req.query.calendar || 'jalali') as CalendarMode);
    const uniquePackings = new Set<string>();
    const uniquePackages = new Set<string>();
    let closedPackingsCount = 0;

    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) uniquePackings.add(pk);
      const ng = normKey(g.packageNo);
      if (ng) uniquePackages.add(`${pk}::${ng}`);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) uniquePackings.add(pk);
    }
    for (const pk of uniquePackings) {
      if (store.db.packingMeta[pk]?.isClosed) closedPackingsCount += 1;
    }

    const detailedComputed = store.getDetailedComputedList();
    const shortageItems = detailedComputed.filter((d) => d.hasShortage);
    const damagedItems = detailedComputed.filter((d) => d.hasDamaged);

    const generalSummary = computeSelectionFormulaSummary({ general: store.db.general });
    const detailedSummary = computeSelectionFormulaSummary({ detailed: detailedComputed });
    const transitSummary = computeSelectionFormulaSummary({ transit: store.db.transit });

    const transitByStatus: Record<string, number> = {};
    for (const t of store.db.transit) {
      const st = normKey(t.overallStatus) || 'نامشخص';
      transitByStatus[st] = (transitByStatus[st] || 0) + 1;
    }

    const byIslandMap: Record<
      string,
      {
        name: string;
        generalCount: number;
        detailedCount: number;
        shortageRowCount: number;
        shortageQty: number;
        mapnaStock: number;
        contractorStock: number;
      }
    > = {};
    for (const g of store.db.general) {
      const bucket = normalizeIslandBucket(g.island);
      if (!byIslandMap[bucket.key]) {
        byIslandMap[bucket.key] = {
          name: bucket.label,
          generalCount: 0,
          detailedCount: 0,
          shortageRowCount: 0,
          shortageQty: 0,
          mapnaStock: 0,
          contractorStock: 0,
        };
      }
      byIslandMap[bucket.key].generalCount += 1;
    }
    for (const d of detailedComputed) {
      const bucket = normalizeIslandBucket(d.island);
      if (!byIslandMap[bucket.key]) {
        byIslandMap[bucket.key] = {
          name: bucket.label,
          generalCount: 0,
          detailedCount: 0,
          shortageRowCount: 0,
          shortageQty: 0,
          mapnaStock: 0,
          contractorStock: 0,
        };
      }
      byIslandMap[bucket.key].detailedCount += 1;
      if (d.hasShortage) {
        byIslandMap[bucket.key].shortageRowCount += 1;
      }
      byIslandMap[bucket.key].shortageQty = roundQty(byIslandMap[bucket.key].shortageQty + d.shortage);
      if (!d.opiPending && d.mapnaInventory > 0) {
        byIslandMap[bucket.key].mapnaStock += 1;
      }
      if (!d.opiPending && d.contractorInventory > 0) {
        byIslandMap[bucket.key].contractorStock += 1;
      }
    }

    const monthBuckets: Record<string, { monthKey: string; generalRows: number; detailedRows: number; grossWeight: number }> = {};
    for (const g of store.db.general) {
      const mk = getMonthKeyFromIso(g.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) {
        monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      }
      monthBuckets[mk].generalRows += 1;
      monthBuckets[mk].grossWeight += g.grossWeight || 0;
    }
    for (const d of store.db.detailed) {
      const mk = getMonthKeyFromIso(d.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) {
        monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      }
      monthBuckets[mk].detailedRows += 1;
    }

    const allMonthlyBuckets = Object.values(monthBuckets).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey),
    );
    const availableYears = Array.from(
      new Set(allMonthlyBuckets.map((m) => m.monthKey.slice(0, 4)).filter((y) => /^\d{4}$/.test(y))),
    ).sort((a, b) => b.localeCompare(a));

    const requestedYear = normalizeDigits(String(req.query.year || '').trim());
    const selectedYear =
      requestedYear && availableYears.includes(requestedYear)
        ? requestedYear
        : availableYears[0] || '';

    const monthlyTrend = selectedYear
      ? buildYearMonths(selectedYear, calendar).map(
          (mk) => monthBuckets[mk] || { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 },
        )
      : allMonthlyBuckets.slice(-12);

    const openMerItems = detailedComputed
      .filter((d) => isMerOpen(d))
      .map((d) => ({
        id: d.id,
        rowNo: d.rowNo,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        merNo: d.merNo,
        merStatus: d.merStatus,
        packingQty: d.packingQty,
        actualQty: d.actualQty,
        effectiveActualQty: d.effectiveActualQty,
        damagedQty: d.damagedQty,
        shortage: d.shortage,
        countingUnit: d.countingUnit,
      }));
    const openRepItems = detailedComputed
      .filter((d) => isRepOpen(d))
      .map((d) => ({
        id: d.id,
        rowNo: d.rowNo,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        repNo: d.repNo,
        repStatus: d.repStatus,
        packingQty: d.packingQty,
        actualQty: d.actualQty,
        effectiveActualQty: d.effectiveActualQty,
        damagedQty: d.damagedQty,
        shortage: d.shortage,
        countingUnit: d.countingUnit,
      }));
    const expiringChemicals = getExpiringChemicals(detailedComputed, 30);
    const openOpiInvitations = computeOpenOpiInvitations(
      store.db.general,
      store.db.detailed,
      store.db.opiInvitations,
    );

    res.json({
      counts: {
        generalRows: store.db.general.length,
        detailedRows: store.db.detailed.length,
        transitRows: store.db.transit.length,
        uniquePackings: uniquePackings.size,
        uniquePackages: uniquePackages.size,
        closedPackings: closedPackingsCount,
        shortageItemsCount: shortageItems.length,
        damagedItemsCount: damagedItems.length,
        openMerCount: openMerItems.length,
        openRepCount: openRepItems.length,
        expiringChemicalsCount: expiringChemicals.length,
        openOpiCount: openOpiInvitations.length,
      },
      totals: {
        ...detailedSummary,
        grossWeightSum: generalSummary.grossWeightSum,
        netWeightSum: generalSummary.netWeightSum,
        weighbridgeWeightSum: generalSummary.weighbridgeWeightSum,
        freightCostSum: generalSummary.freightCostSum,
        packingsByIsland: generalSummary.packingsByIsland,
        grossWeightTons: roundQty(generalSummary.grossWeightSum / 1000),
        netWeightTons: roundQty(generalSummary.netWeightSum / 1000),
        transitAmountSum: transitSummary.transitAmountSum,
      },
      transitByStatus: Object.entries(transitByStatus).map(([status, count]) => ({ status, count })),
      openOpiInvitations,
      byIsland: Object.values(byIslandMap).sort(
        (a, b) => (b.generalCount + b.detailedCount) - (a.generalCount + a.detailedCount),
      ),
      availableYears,
      selectedYear,
      allMonthlyBuckets,
      monthlyTrend,
      topShortages: [...shortageItems].reverse().slice(0, 12),
      topDamaged: [...damagedItems].reverse().slice(0, 12),
      openMerItems: [...openMerItems].reverse().slice(0, 20),
      openRepItems: [...openRepItems].reverse().slice(0, 20),
      expiringChemicals,
    });
  });

  // ---------------- SPREADSHEET / CSV / EXCEL IMPORT ----------------
  const generalDupKey = (r: Partial<GeneralEntry>) => buildGeneralDupKey(r);

  const detailedDupKey = (r: Partial<DetailedEntry>) => buildDetailedDupKey(r);

  const transitDupKey = (r: Partial<TransitEntry>) => buildTransitDupKey(r);

  app.post('/api/import/preview', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      csvText,
      matrix: rawMatrix,
      formulaMap,
      structuredRecords,
      sheetName,
      sectionHint,
      scope,
      assumedCalendar,
      columnMapping,
    } = req.body as {
      csvText?: string;
      matrix?: string[][];
      formulaMap?: Record<string, string>;
      structuredRecords?: Record<string, unknown>[];
      sheetName?: string;
      sectionHint?: string;
      scope?: ExtendedImportScope;
      assumedCalendar?: CalendarMode;
      columnMapping?: Record<string, number>;
    };
    const matrix = Array.isArray(rawMatrix) && rawMatrix.length > 0
      ? rawMatrix
      : csvText
        ? parseCsvMatrix(csvText)
        : [];
    const hasStructured = Array.isArray(structuredRecords) && structuredRecords.length > 0;
    if (matrix.length === 0 && !hasStructured) {
      res.status(400).json({ error: errMsg(req, 'محتوای فایل ورودی خالی است', 'Input file content is empty') });
      return;
    }
    const cal = assumedCalendar || 'jalali';
    const detectedExtended: ExtendedImportScope =
      scope ||
      detectExtendedScope(matrix, sheetName, sectionHint, structuredRecords) ||
      (matrix.length > 0 ? detectCsvScope(matrix) : null) ||
      'general';

    const PREVIEW_ROW_CAP = 100;

    if (isOperationalScope(detectedExtended)) {
      const actorName = req.currentUser!.fullName || req.currentUser!.username;
      const opPrev = previewOperationalFormImport({
        db: store.db,
        scope: detectedExtended,
        matrix,
        formulaMap,
        structuredRecords,
        sheetName,
        assumedCalendar: cal,
        actorName,
      });
      res.json({
        scope: detectedExtended,
        isOperational: true,
        totalRows: opPrev.totalRows,
        skippedEmpty: opPrev.skippedEmpty,
        parseRejectedRows: [],
        duplicateRowNos: 0,
        duplicateDbCount: opPrev.duplicateDbCount,
        duplicateInFileCount: 0,
        duplicateRecordsCount: opPrev.duplicateDbCount,
        duplicateSamples: opPrev.duplicateSamples,
        estimatedLinks: opPrev.estimatedLinks,
        warnings: opPrev.warnings,
        sample: opPrev.sample,
        parsedRows: opPrev.parsedRecords.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: opPrev.parsedRecords.length > PREVIEW_ROW_CAP,
        deltaSummary: opPrev.deltaSummary,
      });
      return;
    }

    const detectedScope = detectedExtended as ImportScope;
    const columnInspection = inspectMatrixColumns(matrix, detectedScope);
    const activeMapping = columnMapping || columnInspection.mapping;

    const analyzeDuplicates = <T,>(
      rows: T[],
      existingArr: T[],
      keyFn: (item: T) => string,
      formatLabel: (item: T) => string,
    ) => {
      const dbKeys = new Set(existingArr.map(keyFn).filter(Boolean));
      const seenInFile = new Set<string>();
      const dbDuplicates: T[] = [];
      const inFileDuplicates: T[] = [];
      for (const r of rows) {
        const k = keyFn(r);
        if (!k) continue;
        if (dbKeys.has(k)) {
          dbDuplicates.push(r);
        } else if (seenInFile.has(k)) {
          inFileDuplicates.push(r);
        } else {
          seenInFile.add(k);
        }
      }
      const allDups = [...dbDuplicates, ...inFileDuplicates];
      return {
        duplicateDbCount: dbDuplicates.length,
        duplicateInFileCount: inFileDuplicates.length,
        duplicateRecordsCount: allDups.length,
        duplicateSamples: allDups.slice(0, 5).map(formatLabel),
      };
    };

    if (detectedScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, req.currentUser!.username, activeMapping);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && store.isRowNoTaken('general', r.rowNo)).length;
      const dupStats = analyzeDuplicates(
        parsed.rows as GeneralEntry[],
        store.db.general,
        generalDupKey,
        (r) => `${r.packingListNo || '-'} / ${r.packageNo || r.mapnaEntryMinutesNo || '-'}`,
      );
      const deltaAnalysis = analyzeImportDelta({
        incomingRows: parsed.rows as unknown as Record<string, unknown>[],
        existingRows: store.db.general as unknown as Record<string, unknown>[],
        getIncomingKey: (r) => generalDupKey(r as Partial<GeneralEntry>),
        getExistingKey: (r) => generalDupKey(r as Partial<GeneralEntry>),
        getKeyLabel: (r) => `${String(r.packingListNo || '-')} / ${String(r.packageNo || '-')}`,
      });
      res.json({
        scope: 'general',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        parseRejectedRows: parsed.rejectedRows,
        duplicateRowNos,
        ...dupStats,
        deltaSummary: {
          isIdentical: deltaAnalysis.isIdentical,
          newCount: deltaAnalysis.newCount,
          modifiedCount: deltaAnalysis.modifiedCount,
          unchangedCount: deltaAnalysis.unchangedCount,
          totalIncoming: deltaAnalysis.totalIncoming,
          changedFieldsSample: deltaAnalysis.changedFieldsSample,
        },
        sample: parsed.rows.slice(0, 5),
        parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
        columnInspection: { ...columnInspection, mapping: activeMapping },
      });
      return;
    }
    if (detectedScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, req.currentUser!.username, activeMapping);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && store.isRowNoTaken('detailed', r.rowNo)).length;
      const dupStats = analyzeDuplicates(
        parsed.rows as DetailedEntry[],
        store.db.detailed,
        detailedDupKey,
        (r) => `${r.shipmentNo || '-'} / ${r.packageNo || '-'} / #${r.itemNo || '-'}`,
      );
      const deltaAnalysis = analyzeImportDelta({
        incomingRows: parsed.rows as unknown as Record<string, unknown>[],
        existingRows: store.db.detailed as unknown as Record<string, unknown>[],
        getIncomingKey: (r) => detailedDupKey(r as Partial<DetailedEntry>),
        getExistingKey: (r) => detailedDupKey(r as Partial<DetailedEntry>),
        getKeyLabel: (r) => `${String(r.shipmentNo || '-')} / ${String(r.packageNo || '-')} / #${String(r.itemNo || '-')}`,
      });
      res.json({
        scope: 'detailed',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        parseRejectedRows: parsed.rejectedRows,
        duplicateRowNos,
        ...dupStats,
        deltaSummary: {
          isIdentical: deltaAnalysis.isIdentical,
          newCount: deltaAnalysis.newCount,
          modifiedCount: deltaAnalysis.modifiedCount,
          unchangedCount: deltaAnalysis.unchangedCount,
          totalIncoming: deltaAnalysis.totalIncoming,
          changedFieldsSample: deltaAnalysis.changedFieldsSample,
        },
        sample: parsed.rows.slice(0, 5),
        parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
        parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
        columnInspection: { ...columnInspection, mapping: activeMapping },
      });
      return;
    }

    const parsed = parseTransitCsv(matrix, cal, req.currentUser!.username, activeMapping);
    const dupStats = analyzeDuplicates(
      parsed.rows as TransitEntry[],
      store.db.transit,
      transitDupKey,
      (r) => `${r.packingListNo || '-'} / ${r.packageNo || '-'}`,
    );
    const deltaAnalysis = analyzeImportDelta({
      incomingRows: parsed.rows as unknown as Record<string, unknown>[],
      existingRows: store.db.transit as unknown as Record<string, unknown>[],
      getIncomingKey: (r) => transitDupKey(r as Partial<TransitEntry>),
      getExistingKey: (r) => transitDupKey(r as Partial<TransitEntry>),
      getKeyLabel: (r) => `${String(r.packingListNo || '-')} / ${String(r.packageNo || '-')}`,
    });
    res.json({
      scope: 'transit',
      totalRows: parsed.rows.length,
      skippedEmpty: parsed.skippedEmpty,
      parseRejectedRows: parsed.rejectedRows,
      duplicateRowNos: 0,
      ...dupStats,
      deltaSummary: {
        isIdentical: deltaAnalysis.isIdentical,
        newCount: deltaAnalysis.newCount,
        modifiedCount: deltaAnalysis.modifiedCount,
        unchangedCount: deltaAnalysis.unchangedCount,
        totalIncoming: deltaAnalysis.totalIncoming,
        changedFieldsSample: deltaAnalysis.changedFieldsSample,
      },
      sample: parsed.rows.slice(0, 5),
      parsedRows: parsed.rows.slice(0, PREVIEW_ROW_CAP),
      parsedRowsTruncated: parsed.rows.length > PREVIEW_ROW_CAP,
      columnInspection: { ...columnInspection, mapping: activeMapping },
    });
  });

  app.post('/api/import/commit', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      csvText,
      matrix: rawMatrix,
      formulaMap,
      structuredRecords,
      sheetName,
      sectionHint,
      scope,
      assumedCalendar,
      duplicateRecordPolicy,
      forceAddDuplicates,
      includeParserRejections,
      columnMapping,
      editedRows,
    } = req.body as {
      csvText?: string;
      matrix?: string[][];
      formulaMap?: Record<string, string>;
      structuredRecords?: Record<string, unknown>[];
      sheetName?: string;
      sectionHint?: string;
      scope?: ExtendedImportScope;
      assumedCalendar?: CalendarMode;
      duplicateRecordPolicy?: 'replace' | 'skip' | 'delta';
      forceAddDuplicates?: boolean;
      includeParserRejections?: boolean;
      columnMapping?: Record<string, number>;
      editedRows?: Record<string, unknown>[];
    };
    const matrix = Array.isArray(rawMatrix) && rawMatrix.length > 0
      ? rawMatrix
      : csvText
        ? parseCsvMatrix(csvText)
        : [];
    const hasEdited = Array.isArray(editedRows) && editedRows.length > 0;
    const hasStructured = Array.isArray(structuredRecords) && structuredRecords.length > 0;
    if (matrix.length === 0 && !hasEdited && !hasStructured) {
      res.status(400).json({ error: errMsg(req, 'محتوای فایل ورودی خالی است', 'Input file content is empty') });
      return;
    }
    const cal = assumedCalendar || 'jalali';
    const dupPolicy: 'replace' | 'skip' | 'delta' =
      duplicateRecordPolicy === 'replace'
        ? 'replace'
        : duplicateRecordPolicy === 'delta'
          ? 'delta'
          : 'skip';
    const resolvedExtended: ExtendedImportScope =
      scope ||
      detectExtendedScope(matrix, sheetName, sectionHint, structuredRecords) ||
      (matrix.length > 0 ? detectCsvScope(matrix) : null) ||
      'general';

    if (isOperationalScope(resolvedExtended)) {
      const actorName = req.currentUser!.fullName || req.currentUser!.username;
      const opResult = commitOperationalFormImport({
        db: store.db,
        scope: resolvedExtended,
        matrix,
        formulaMap,
        structuredRecords: hasEdited ? editedRows : structuredRecords,
        sheetName,
        assumedCalendar: cal,
        duplicateRecordPolicy: dupPolicy,
        actorName,
      });
      store.rebuildIndexes();
      const meta = EXTENDED_SCOPE_META[resolvedExtended];
      store.addAudit({
        user: sanitizeUser(req.currentUser!),
        action: 'IMPORT_OPERATIONAL_FORM',
        scope: 'import',
        targetId: resolvedExtended,
        summary: `ورود خودکار «${meta.labelFa}»: ${opResult.imported} جدید، ${opResult.replaced} جایگزین، ${opResult.skipped} رد شد (ارتباط با کلی: ${opResult.linkedGeneral}، جزئیات: ${opResult.linkedDetailed}، در راه: ${opResult.linkedTransit})`,
      });
      store.saveImmediate();
      res.json({
        scope: resolvedExtended,
        isOperational: true,
        imported: opResult.imported,
        replaced: opResult.replaced,
        skipped: opResult.skipped,
        unchangedSkipped: opResult.unchangedSkipped || 0,
        parseRejectedCount: 0,
        blankRowsSkipped: 0,
        transitAutoArrived: opResult.linkedTransit,
        linkedGeneral: opResult.linkedGeneral,
        linkedDetailed: opResult.linkedDetailed,
        linkedTransit: opResult.linkedTransit,
        warnings: opResult.warnings,
        rejectedRecords: [],
      });
      return;
    }

    const targetScope = resolvedExtended as ImportScope;
    const forceAdd = Boolean(forceAddDuplicates);
    const collectParseRejects = includeParserRejections !== false && matrix.length > 0;

    let imported = 0;
    let replaced = 0;
    let skipped = 0;
    let unchangedSkipped = 0;
    let blankRowsSkipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();
    const rejectedRecords: ImportRejectedRecord[] = [];
    const now = new Date().toISOString();

    if (targetScope === 'general') {
      const parseResult = matrix.length > 0
        ? parseGeneralCsv(matrix, cal, req.currentUser!.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<GeneralEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, GeneralEntry>();
      for (const g of store.db.general) {
        const k = generalDupKey(g);
        if (k) dbByKey.set(k, g);
      }
      const batchByKey = new Map<string, GeneralEntry>();
      const newItems: GeneralEntry[] = [];

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.packingListNo) || normKey(r.packageNo) || normKey(r.itemDescription));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'general',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره پکینگ لیست، شماره نگله و شرح کالا همگی خالی هستند؛ ردیف برای جلوگیری از ثبت اطلاعات ناقص رد شد.',
            reasonEn: 'Packing List No., Package No., and Item Description are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const k = generalDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.packingListNo || '-'} / ${r.packageNo || r.mapnaEntryMinutesNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'general',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `رکورد با کلید «${labelKey}» قبلاً در پایگاه داده (ردیف ${existingDb.rowNo || '-'}) ثبت شده است و با تنظیم «رد کردن تکراری‌ها» وارد نشد.`
                : `رکورد با کلید «${labelKey}» بیش از یک بار درون همین فایل تکرار شده و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `Key "${labelKey}" already exists in database (Row ${existingDb.rowNo || '-'}) and was skipped.`
                : `Key "${labelKey}" appeared earlier in the same file and was skipped.`,
              existingSummary: `${existing.packingListNo || '-'} | نگله ${existing.packageNo || '-'} | ${existing.itemDescription || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          if (dupPolicy === 'delta' && !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>)) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          if (r.packingListNo) touchedPackings.add(r.packingListNo);
          return;
        }
        const created: GeneralEntry = {
          ...r,
          createdAt: r.createdAt || now,
          updatedAt: now,
          createdBy: r.createdBy || req.currentUser!.username,
          id: makeId(),
        };
        if (k && !forceAdd) batchByKey.set(k, created);
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        newItems.push(created);
        imported += 1;
      });
      store.db.general.push(...newItems);
      store.renumberScope('general');
    } else if (targetScope === 'detailed') {
      const parseResult = matrix.length > 0
        ? parseDetailedCsv(matrix, cal, req.currentUser!.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<DetailedEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, DetailedEntry>();
      for (const d of store.db.detailed) {
        const k = detailedDupKey(d);
        if (k) dbByKey.set(k, d);
      }
      const batchByKey = new Map<string, DetailedEntry>();
      const newItems: DetailedEntry[] = [];

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.shipmentNo) || normKey(r.description) || normKey(r.generalDescription));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'detailed',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره محموله/پکینگ، شرح کلی و شرح کالا همگی خالی هستند و ردیف رد شد.',
            reasonEn: 'Shipment No., General Description, and Description are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const k = detailedDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        const genDesc = r.generalDescription || '';
        const rawChem = normKey(r.chemicalType);
        const inferredCls = !r.itemCategory
          ? inferItemClassification(r.description, r.notes, genDesc)
          : { itemCategory: r.itemCategory, chemicalType: '' };
        const resolvedItemCategory = r.itemCategory || (rawChem ? 'chemicals' : inferredCls.itemCategory);
        const resolvedChemicalType = rawChem || (resolvedItemCategory === 'chemicals' ? inferredCls.chemicalType : '');
        let resolvedProdDate = normKey(r.productionDate);
        let resolvedExpDate = normKey(r.expirationDate);
        if (resolvedItemCategory === 'chemicals' && (!resolvedProdDate || !resolvedExpDate)) {
          const extDates = extractChemicalDatesFromTexts(
            [r.notes, r.description, genDesc],
            cal,
          );
          if (!resolvedProdDate && extDates.productionDate) resolvedProdDate = extDates.productionDate;
          if (!resolvedExpDate && extDates.expirationDate) resolvedExpDate = extDates.expirationDate;
        }
        const {
          shortage: _impShortage,
          surplus: _impSurplus,
          ...cleanDetailedRow
        } = r as Omit<DetailedEntry, 'id'> & { shortage?: number | null; surplus?: number | null };
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.shipmentNo || '-'} / ${r.packageNo || '-'} / #${r.itemNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'detailed',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `قلم با کلید «${labelKey}» قبلاً در پایگاه داده (ردیف ${existingDb.rowNo || '-'}) وجود دارد و با سیاست «رد کردن تکراری‌ها» ثبت نشد.`
                : `قلم با کلید «${labelKey}» در همین فایل تکرار شده است و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `Item "${labelKey}" already exists in database (Row ${existingDb.rowNo || '-'}) and was skipped.`
                : `Item "${labelKey}" was duplicated inside the same file and skipped.`,
              existingSummary: `${existing.shipmentNo || '-'} | نگله ${existing.packageNo || '-'} | آیتم ${existing.itemNo || '-'} | ${existing.description || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          if (
            dupPolicy === 'delta' &&
            !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, {
              ...cleanDetailedRow,
              countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
              generalDescription: genDesc,
              itemCategory: resolvedItemCategory,
              chemicalType: resolvedChemicalType,
              productionDate: resolvedProdDate,
              expirationDate: resolvedExpDate,
            } as unknown as Record<string, unknown>)
          ) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...cleanDetailedRow,
            countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
            generalDescription: genDesc,
            itemCategory: resolvedItemCategory,
            chemicalType: resolvedChemicalType,
            productionDate: resolvedProdDate,
            expirationDate: resolvedExpDate,
            id: existing.id,
            rowNo: existing.rowNo,
            shortageBackfills: existing.shortageBackfills || [],
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
          return;
        }
        const created: DetailedEntry = {
          ...cleanDetailedRow,
          countingUnit: normalizeCountingUnitToFa(cleanDetailedRow.countingUnit),
          generalDescription: genDesc,
          itemCategory: resolvedItemCategory,
          chemicalType: resolvedChemicalType,
          productionDate: resolvedProdDate,
          expirationDate: resolvedExpDate,
          shortageBackfills: r.shortageBackfills || [],
          createdAt: r.createdAt || now,
          updatedAt: now,
          createdBy: r.createdBy || req.currentUser!.username,
          id: makeId(),
        };
        if (k && !forceAdd) batchByKey.set(k, created);
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        newItems.push(created);
        imported += 1;
      });
      store.db.detailed.push(...newItems);
      store.renumberScope('detailed');
    } else {
      const parseResult = matrix.length > 0
        ? parseTransitCsv(matrix, cal, req.currentUser!.username, columnMapping)
        : { rows: [], skippedEmpty: 0, rejectedRows: [] };
      blankRowsSkipped = parseResult.skippedEmpty;
      if (collectParseRejects && parseResult.rejectedRows.length > 0) {
        rejectedRecords.push(...parseResult.rejectedRows);
        skipped += parseResult.rejectedRows.length;
      }
      const parsedRows = hasEdited
        ? (editedRows as Omit<TransitEntry, 'id'>[])
        : parseResult.rows;

      const dbByKey = new Map<string, TransitEntry>();
      for (const t of store.db.transit) {
        const k = transitDupKey(t);
        if (k) dbByKey.set(k, t);
      }
      const batchByKey = new Map<string, TransitEntry>();
      const newItems: TransitEntry[] = [];

      parsedRows.forEach((r, idx) => {
        const hasAnchor = Boolean(normKey(r.packingListNo) || normKey(r.itemDescription) || normKey(r.overallStatus));
        if (!hasAnchor && !forceAdd) {
          skipped += 1;
          rejectedRecords.push({
            id: makeId(),
            scope: 'transit',
            sourceRowIndex: idx + 1,
            reasonCode: 'missing_required',
            reasonFa: 'شماره پکینگ لیست، شرح کالا و وضعیت کلی همگی خالی هستند و ردیف رد شد.',
            reasonEn: 'Packing List No., Item Description, and Overall Status are all empty.',
            canForceReplace: false,
            canForceAdd: true,
            canEditAndRetry: true,
            parsedRow: r as unknown as Record<string, unknown>,
          });
          return;
        }
        const pk = normKey(r.packingListNo);
        const alreadyArrived =
          pk &&
          ((store.generalByPacking.get(pk)?.length || 0) > 0 ||
            (store.detailedByPacking.get(pk)?.length || 0) > 0);
        const k = transitDupKey(r);
        const existingDb = k ? dbByKey.get(k) : undefined;
        const existingBatch = !existingDb && k ? batchByKey.get(k) : undefined;
        const existing = existingDb || existingBatch;
        if (existing && !forceAdd) {
          if (dupPolicy === 'skip') {
            skipped += 1;
            const labelKey = `${r.packingListNo || '-'} / ${r.packageNo || '-'}`;
            rejectedRecords.push({
              id: makeId(),
              scope: 'transit',
              sourceRowIndex: idx + 1,
              reasonCode: existingDb ? 'duplicate_db' : 'duplicate_in_file',
              reasonFa: existingDb
                ? `محموله در راه با کلید «${labelKey}» قبلاً در پایگاه داده ثبت شده و رد شد.`
                : `محموله با کلید «${labelKey}» در همین فایل تکرار شده و نسخه تکراری آن رد شد.`,
              reasonEn: existingDb
                ? `In-transit key "${labelKey}" already exists in database and was skipped.`
                : `In-transit key "${labelKey}" appeared earlier in the same file and was skipped.`,
              existingSummary: `${existing.packingListNo || '-'} | نگله ${existing.packageNo || '-'} | ${existing.itemDescription || ''}`,
              canForceReplace: true,
              canForceAdd: true,
              canEditAndRetry: true,
              parsedRow: r as unknown as Record<string, unknown>,
            });
            return;
          }
          const normalizedStatus = normalizeTransitStatus(
            r.overallStatus,
            store.db.categories.transitStatus,
          );
          const resolvedStatus = alreadyArrived ? 'رسیده' : normalizedStatus;
          if (
            dupPolicy === 'delta' &&
            !hasRecordMeaningfulChanges(existing as unknown as Record<string, unknown>, {
              ...r,
              overallStatus: resolvedStatus,
            } as unknown as Record<string, unknown>)
          ) {
            unchangedSkipped += 1;
            return;
          }
          Object.assign(existing, {
            ...r,
            id: existing.id,
            rowNo: existing.rowNo,
            overallStatus: resolvedStatus,
            linkedGeneralPackingNo: alreadyArrived ? pk : r.linkedGeneralPackingNo,
            createdAt: existing.createdAt,
            createdBy: existing.createdBy,
            updatedAt: now,
          });
          replaced += 1;
          return;
        }
        const normalizedStatus = normalizeTransitStatus(
          r.overallStatus,
          store.db.categories.transitStatus,
        );
        const resolvedStatus = alreadyArrived ? 'رسیده' : normalizedStatus;
        const created: TransitEntry = {
          ...r,
          createdAt: r.createdAt || now,
          updatedAt: now,
          createdBy: r.createdBy || req.currentUser!.username,
          id: makeId(),
          overallStatus: resolvedStatus,
          linkedGeneralPackingNo: alreadyArrived ? pk : undefined,
        };
        if (k && !forceAdd) batchByKey.set(k, created);
        newItems.push(created);
        imported += 1;
      });
      store.db.transit.push(...newItems);
      store.renumberScope('transit');
    }

    store.rebuildIndexes();
    const actorName = req.currentUser!.fullName || req.currentUser!.username;
    for (const pkRaw of touchedPackings) {
      const cleanPk = normKey(pkRaw);
      if (cleanPk && (targetScope === 'general' || targetScope === 'detailed') && !store.db.packingMeta[cleanPk]) {
        store.db.packingMeta[cleanPk] = {
          packingNo: cleanPk,
          isClosed: true,
          closedAt: now,
          closedBy: actorName,
          closureNote: 'بسته‌شدن پیش‌فرض هنگام ورود اطلاعات از فایل',
        };
      }
      transitAutoArrived += store.syncTransitArrival(pkRaw, sanitizeUser(req.currentUser!));
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: forceAdd ? 'IMPORT_RECOVERY_FORCE_ADD' : 'IMPORT_DATA',
      scope: 'import',
      targetId: targetScope,
      summary: `بارگذاری فایل (${targetScope}): ${imported} ردیف جدید، ${replaced} ردیف جایگزین و ${skipped} ردیف رد شد${
        transitAutoArrived > 0 ? `، ${transitAutoArrived} ردیف در راه به «رسیده» تغییر وضعیت داد` : ''
      }`,
    });
    store.saveImmediate();

    res.json({
      scope: targetScope,
      imported,
      replaced,
      skipped,
      unchangedSkipped,
      parseRejectedCount: collectParseRejects ? rejectedRecords.filter((r) => r.reasonCode === 'missing_required').length : 0,
      blankRowsSkipped,
      transitAutoArrived,
      rejectedRecords,
    });
  });

  app.post('/api/import/auto-workbook', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { sheets, assumedCalendar, duplicateRecordPolicy, dryRun } = req.body as {
      sheets?: AutoWorkbookSheetInput[];
      assumedCalendar?: CalendarMode;
      duplicateRecordPolicy?: 'replace' | 'skip' | 'delta';
      dryRun?: boolean;
    };
    if (!Array.isArray(sheets) || sheets.length === 0) {
      res.status(400).json({ error: errMsg(req, 'شیتی برای تحلیل و ورود ارسال نشده است', 'No sheets provided for auto-import') });
      return;
    }
    const cal = assumedCalendar || 'jalali';
    const dupPolicy: 'replace' | 'skip' | 'delta' =
      duplicateRecordPolicy === 'replace'
        ? 'replace'
        : duplicateRecordPolicy === 'delta'
          ? 'delta'
          : 'skip';
    const actorName = req.currentUser!.fullName || req.currentUser!.username;

    if (dryRun) {
      const preview = previewAutoWorkbook({
        db: store.db,
        sheets,
        assumedCalendar: cal,
        actorName,
      });
      res.json(preview);
      return;
    }

    const summary = commitAutoWorkbook({
      db: store.db,
      sheets,
      assumedCalendar: cal,
      duplicateRecordPolicy: dupPolicy,
      actorName,
    });
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'IMPORT_AUTO_WORKBOOK',
      scope: 'import',
      targetId: `${summary.sections.length}_sections`,
      summary: `ورود خودکار چندبخشی (${summary.sections.length} بخش): ${summary.totals.imported} جدید، ${summary.totals.replaced} جایگزین، ${summary.totals.skipped} رد شد (ارتباط کلی: ${summary.totals.linkedGeneral}، جزئیات: ${summary.totals.linkedDetailed}، در راه: ${summary.totals.linkedTransit})`,
    });
    store.saveImmediate();
    res.json(summary);
  });

  // ---------------- AI SMART INTAKE (FILE / DOCUMENT SCAN / VOICE COMMANDS) ----------------
  app.post('/api/ai/extract-equipment', requireRole(['admin', 'operator']), async (req: AuthedRequest, res: Response) => {
    const { target, mode, lang, mimeType, base64Data, textData } = req.body as {
      target?: 'general' | 'detailed';
      mode?: 'file' | 'scan' | 'voice';
      lang?: Language;
      mimeType?: string;
      base64Data?: string;
      textData?: string;
    };

    if (!target || (target !== 'general' && target !== 'detailed')) {
      res.status(400).json({ error: errMsg(req, 'بخش هدف نامعتبر است', 'Invalid target scope') });
      return;
    }
    if (!base64Data && !textData) {
      res.status(400).json({ error: errMsg(req, 'داده‌ای برای تحلیل ارسال نشده است', 'No input data provided for extraction') });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const offlineResult = extractEquipmentOffline({
        target,
        mode,
        textData,
        base64Data,
        mimeType,
      });
      res.json({ result: offlineResult });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const outLang = lang === 'en' ? 'en' : 'fa';
      const systemInstruction =
        target === 'general'
          ? `You are a warehouse data-entry extraction assistant for an industrial power-plant warehouse system (SAMAAN). Extract general shipment header fields and package line items accurately from the provided ${mode || 'input'}. Dates must be YYYY-MM-DD (Gregorian) if determinable or empty string. Employer Entry Minutes No. must contain digits only. Freight cost must be numeric (Rials). Dimensions must be numeric in meters. Vehicle license plate should follow Iranian plate text like "60 ایران 985 ع 14" when recognizable. For packageType, use ${outLang === 'fa' ? 'strictly Persian terms (e.g. صندوق چوبی, جعبه مشبک, پالت, باندل, کارتن)' : 'strictly English terms (e.g. Wooden Box, Crate, Pallet, Bundle, Carton)'}.`
          : `You are a warehouse data-entry extraction assistant for detailed equipment inspection records (SAMAAN). Extract equipment items (itemNo, description, generalDescription, size, itemCode, mtoRef, packingQty, countingUnit, remarks/notes, shipmentNo, packageNo) accurately from the provided ${mode || 'input'}. Omit fields not present rather than guessing fake IDs.`;

      const generalSchema = {
        type: Type.OBJECT,
        properties: {
          header: {
            type: Type.OBJECT,
            properties: {
              packingListNo: { type: Type.STRING },
              arrivalDate: { type: Type.STRING },
              supplier: { type: Type.STRING },
              dispatchLocation: { type: Type.STRING },
              employerEntryMinutesNo: { type: Type.STRING },
              mapnaEntryMinutesNo: { type: Type.STRING },
              releaseNo: { type: Type.STRING },
              releaseDate: { type: Type.STRING },
              billOfLadingNo: { type: Type.STRING },
              vehicleNo: { type: Type.STRING },
              weighbridgeWeight: { type: Type.NUMBER },
              freightCost: { type: Type.NUMBER },
              driverName: { type: Type.STRING },
              opiInvitationNo: { type: Type.STRING },
              opiInvitationDate: { type: Type.STRING },
              island: { type: Type.STRING },
              system: { type: Type.STRING },
              subSystem: { type: Type.STRING },
              unit: { type: Type.STRING },
            },
          },
          packages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                packageNo: { type: Type.STRING },
                packageType: { type: Type.STRING },
                itemCount: { type: Type.INTEGER },
                itemDescription: { type: Type.STRING },
                grossWeight: { type: Type.NUMBER },
                netWeight: { type: Type.NUMBER },
                lengthCm: { type: Type.NUMBER },
                widthCm: { type: Type.NUMBER },
                heightCm: { type: Type.NUMBER },
              },
            },
          },
          transcript: { type: Type.STRING },
        },
      };

      const detailedSchema = {
        type: Type.OBJECT,
        properties: {
          shipmentNo: { type: Type.STRING },
          packageNo: { type: Type.STRING },
          transcript: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemNo: { type: Type.STRING },
                generalDescription: { type: Type.STRING },
                description: { type: Type.STRING },
                size: { type: Type.STRING },
                itemCode: { type: Type.STRING },
                mtoRef: { type: Type.STRING },
                packingQty: { type: Type.NUMBER },
                actualQty: { type: Type.NUMBER },
                damagedQty: { type: Type.NUMBER },
                countingUnit: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
            },
          },
        },
      };

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (base64Data && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
      parts.push({
        text: textData
          ? `Extract structured ${target} warehouse equipment data from this content:\n${textData}`
          : `Analyze the attached ${mode === 'voice' ? 'voice command audio (Persian or English)' : 'document/image'} and extract structured ${target} warehouse equipment fields in JSON format.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: target === 'general' ? generalSchema : detailedSchema,
        },
      });

      const rawJson = (response.text || '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        items?: Array<{
          description?: string;
          generalDescription?: string;
          countingUnit?: string;
          itemCategory?: DetailedEntry['itemCategory'];
          chemicalType?: string;
          notes?: string;
        }>;
      };
      if (target === 'detailed' && Array.isArray(parsed.items)) {
        parsed.items = parsed.items.map((it) => {
          const inferred = !it.itemCategory
            ? inferItemClassification(it.description, it.notes, it.generalDescription)
            : { itemCategory: it.itemCategory, chemicalType: '' };
          const finalCat = it.itemCategory || (it.chemicalType ? 'chemicals' : inferred.itemCategory);
          return {
            ...it,
            countingUnit: normalizeCountingUnitToFa(it.countingUnit) || 'عدد',
            itemCategory: finalCat,
            chemicalType: it.chemicalType || (finalCat === 'chemicals' ? inferred.chemicalType : ''),
          };
        });
      }
      res.json({ result: parsed });
    } catch {
      const offlineResult = extractEquipmentOffline({
        target,
        mode,
        textData,
        base64Data,
        mimeType,
      });
      res.json({ result: offlineResult });
    }
  });

  function getLiveWarehouseQueryDb(): WarehouseQueryDb {
    return {
      general: store.db.general,
      detailed: store.db.detailed,
      detailedComputed: store.getDetailedComputedList(),
      transit: store.db.transit,
      gcvDocuments: store.db.gcvDocuments,
      mivDocuments: store.db.mivDocuments,
      opiInvitations: store.db.opiInvitations,
      opiMinutes: store.db.opiMinutes,
      siteEntryMinutes: store.db.siteEntryMinutes,
      osdrReports: store.db.osdrReports,
      substitutions: store.db.substitutions,
      materialEstimates: store.db.materialEstimates,
      periodicInspections: store.db.periodicInspections,
    };
  }

  function buildCompactWarehouseMetrics(dbSlice: WarehouseQueryDb) {
    const ov = getWarehouseOverview(dbSlice);
    return {
      generalRows: ov.generalRows,
      detailedRows: ov.detailedRows,
      transitRows: ov.transitRows,
      uniquePackings: ov.uniquePackings,
      grossWeightTons: ov.grossWeightTons,
      netWeightTons: ov.netWeightTons,
      shortageItemsCount: ov.shortageItemsCount,
      shortageQtySum: ov.shortageQtySum,
      damagedItemsCount: ov.damagedItemsCount,
      openMerCount: ov.openMerCount,
      openRepCount: ov.openRepCount,
      opiPendingCount: ov.opiPendingCount,
      expiringChemicalsCount: ov.expiringChemicalsCount,
      transitArrivedPackingsCount: ov.transitArrivedPackingsCount,
      transitShippingPackingsCount: ov.transitShippingPackingsCount,
      transitInspectionPackingsCount: ov.transitInspectionPackingsCount,
    };
  }

  function createGeminiClient(apiKey: string) {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|DEADLINE_EXCEEDED|timeout/i.test(msg);
        if (!isTransient || attempt === maxAttempts) {
          throw err;
        }
        const delayMs = attempt === 1 ? 650 : 1500;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastErr;
  }

  const WAREHOUSE_AI_TOOLS: FunctionDeclaration[] = [
    {
      name: 'search_warehouse_items',
      description:
        'Search power-plant warehouse items across Detailed Equipment, General Equipment, and In-Transit records. Supports bilingual Persian/English queries, pipe/valve sizes (e.g., 8", 8 inch, DN200, 1/2"), item codes, packing lists, suppliers, islands, systems, storage locations, categories, and stock/alert status filters. Returns EXACT aggregated stock totals grouped by counting unit across ALL matching rows (mainWarehouseStock, contractorStock, totalSiteStock, packingQty, actualQty, shortage, damagedQty) plus top matching rows and closestSuggestions when 0 exact rows match.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              'Free-text item search query such as "Pipe 8\\"", "Gate Valve DN100", "Cable 3x120", "لوله ۸ اینچ", or item description keywords.',
          },
          size: {
            type: Type.STRING,
            description: 'Optional explicit size filter such as "8\\"", "DN200", "4 inch", "1/2\\"".',
          },
          itemCode: {
            type: Type.STRING,
            description: 'Optional item code / tag / part number filter.',
          },
          packingListNo: {
            type: Type.STRING,
            description: 'Optional packing list / shipment number filter.',
          },
          supplier: {
            type: Type.STRING,
            description: 'Optional supplier/vendor name filter.',
          },
          island: {
            type: Type.STRING,
            description: 'Optional plant island filter (e.g., GT, ST, HRSG, BOP, Electrical).',
          },
          system: {
            type: Type.STRING,
            description: 'Optional system or sub-system filter.',
          },
          storageLocation: {
            type: Type.STRING,
            description: 'Optional warehouse shed / storage location filter.',
          },
          itemCategory: {
            type: Type.STRING,
            enum: ['special_tools', 'chemicals', 'spare_parts'],
            description: 'Optional specialized item category filter. Omit if not filtering by category.',
          },
          statusFilter: {
            type: Type.STRING,
            enum: ['all', 'in_stock', 'main_stock', 'contractor_stock', 'shortage', 'damaged', 'open_mer', 'open_rep', 'opi_pending'],
            description: 'Optional operational status filter.',
          },
          scope: {
            type: Type.STRING,
            enum: ['all', 'detailed', 'general', 'transit'],
            description: 'Which warehouse section(s) to search. Defaults to "all".',
          },
          limit: {
            type: Type.NUMBER,
            description: 'Max sample item rows to return (1-50, default 20). Totals are always computed across ALL matching rows.',
          },
        },
      },
    },
    {
      name: 'get_warehouse_overview',
      description:
        'Get complete live warehouse overview KPIs: unique packings, unique packages, general/detailed/transit row counts, gross/net weight in tons, total freight cost, shortages, damages, open MER/REP, pending OPI, expiring chemicals (<30 days), stock row counts, special categories, and official document counts.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'get_packing_list_details',
      description:
        'Retrieve a complete 360-degree report for a specific packing list number across General packages, Detailed items (with unit-grouped stock totals), In-Transit status, weights, shortages/MER/REP, and all linked official documents (Site Entry, OPI, OSDR, GCV, MIV/SMR, Substitutions).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          packingListNo: {
            type: Type.STRING,
            description: 'Exact or partial packing list / shipment number.',
          },
        },
        required: ['packingListNo'],
      },
    },
    {
      name: 'aggregate_warehouse_by_field',
      description:
        'Run a GROUP BY analytical breakdown of the warehouse by island, supplier, system, subSystem, unit, storageLocation, generalDescription, itemCategory, countingUnit, overallStatus (for transit), arrivalMonth, or arrivalYear.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          groupBy: {
            type: Type.STRING,
            enum: [
              'island',
              'supplier',
              'system',
              'subSystem',
              'unit',
              'storageLocation',
              'generalDescription',
              'itemCategory',
              'countingUnit',
              'overallStatus',
              'arrivalMonth',
              'arrivalYear',
            ],
            description: 'Field to group records by.',
          },
          scope: {
            type: Type.STRING,
            enum: ['detailed', 'general', 'transit'],
            description: 'Table to aggregate. Use "general" for weights/freight, "transit" for overallStatus, "detailed" for stock/shortages/locations.',
          },
          island: { type: Type.STRING, description: 'Optional island filter.' },
          supplier: { type: Type.STRING, description: 'Optional supplier filter.' },
          system: { type: Type.STRING, description: 'Optional system filter.' },
          year: { type: Type.STRING, description: 'Optional arrival year filter (e.g., "1403" or "2024").' },
          sortBy: {
            type: Type.STRING,
            enum: ['rows', 'mainStockRows', 'contractorStockRows', 'shortageRows', 'damagedRows', 'grossWeight', 'netWeight', 'freightCost'],
            description: 'Metric to sort groups descending by.',
          },
          limit: { type: Type.NUMBER, description: 'Max groups to return (default 15, max 30).' },
        },
        required: ['groupBy'],
      },
    },
    {
      name: 'query_operational_alerts',
      description:
        'List active operational alerts or special equipment groups: shortages, damaged items, open MER, open REP, pending OPI, expiring chemicals (within N days), special tools, spare parts, chemicals, or in-transit shipments by status.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          alertType: {
            type: Type.STRING,
            enum: [
              'shortages',
              'damaged',
              'open_mer',
              'open_rep',
              'opi_pending',
              'expiring_chemicals',
              'special_tools',
              'spare_parts',
              'chemicals',
              'transit_shipping',
              'transit_inspection',
              'transit_arrived',
            ],
            description: 'Type of alert or operational list to retrieve.',
          },
          island: { type: Type.STRING, description: 'Optional island filter.' },
          supplier: { type: Type.STRING, description: 'Optional supplier filter.' },
          days: { type: Type.NUMBER, description: 'Window in days for expiring_chemicals (default 30).' },
          limit: { type: Type.NUMBER, description: 'Max items to return (default 20, max 40).' },
        },
        required: ['alertType'],
      },
    },
    {
      name: 'search_warehouse_documents',
      description:
        'Search official warehouse documents: GCV receipts, MIV/SMR issuance/return vouchers, OPI invitations & minutes, Site Entry minutes, OSDR discrepancy reports, Substitution forms, Material Estimates (MTO), and Periodic Inspections.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          docType: {
            type: Type.STRING,
            enum: ['all', 'gcv', 'miv', 'opi_invitation', 'opi_minutes', 'site_entry', 'osdr', 'substitution', 'material_estimate', 'periodic_inspection'],
            description: 'Document type to search. Defaults to "all".',
          },
          query: {
            type: Type.STRING,
            description: 'Search keywords (document number, packing list number, item description, receiver, supplier).',
          },
          limit: { type: Type.NUMBER, description: 'Max documents to return (default 15).' },
        },
      },
    },
  ];

  function executeWarehouseAiTool(
    dbSlice: WarehouseQueryDb,
    toolName: string,
    args: Record<string, unknown>,
    lang: Language,
  ): Record<string, unknown> {
    if (toolName === 'get_warehouse_overview') {
      return { overview: getWarehouseOverview(dbSlice) };
    }
    if (toolName === 'search_warehouse_items') {
      const params: SearchWarehouseItemsParams = {
        query: typeof args.query === 'string' ? args.query : undefined,
        size: typeof args.size === 'string' ? args.size : undefined,
        itemCode: typeof args.itemCode === 'string' ? args.itemCode : undefined,
        packingListNo: typeof args.packingListNo === 'string' ? args.packingListNo : undefined,
        supplier: typeof args.supplier === 'string' ? args.supplier : undefined,
        island: typeof args.island === 'string' ? args.island : undefined,
        system: typeof args.system === 'string' ? args.system : undefined,
        storageLocation: typeof args.storageLocation === 'string' ? args.storageLocation : undefined,
        itemCategory:
          args.itemCategory === 'special_tools' || args.itemCategory === 'chemicals' || args.itemCategory === 'spare_parts'
            ? args.itemCategory
            : undefined,
        statusFilter:
          typeof args.statusFilter === 'string'
            ? (args.statusFilter as SearchWarehouseItemsParams['statusFilter'])
            : undefined,
        scope:
          args.scope === 'detailed' || args.scope === 'general' || args.scope === 'transit' || args.scope === 'all'
            ? args.scope
            : 'all',
        limit: typeof args.limit === 'number' ? args.limit : 20,
      };
      return { result: searchWarehouseItems(dbSlice, params, lang) };
    }
    if (toolName === 'get_packing_list_details') {
      const packingNo = typeof args.packingListNo === 'string' ? args.packingListNo : '';
      return { result: getPackingListDetails(dbSlice, packingNo, lang) };
    }
    if (toolName === 'aggregate_warehouse_by_field') {
      const groupBy = (typeof args.groupBy === 'string' ? args.groupBy : 'island') as AggregateGroupBy;
      return {
        result: aggregateWarehouseByField(
          dbSlice,
          {
            groupBy,
            scope:
              args.scope === 'detailed' || args.scope === 'general' || args.scope === 'transit'
                ? args.scope
                : undefined,
            island: typeof args.island === 'string' ? args.island : undefined,
            supplier: typeof args.supplier === 'string' ? args.supplier : undefined,
            system: typeof args.system === 'string' ? args.system : undefined,
            year: typeof args.year === 'string' ? args.year : undefined,
            sortBy: typeof args.sortBy === 'string' ? (args.sortBy as any) : undefined,
            limit: typeof args.limit === 'number' ? args.limit : 15,
          },
          lang,
        ),
      };
    }
    if (toolName === 'query_operational_alerts') {
      const alertType = (typeof args.alertType === 'string' ? args.alertType : 'shortages') as OperationalAlertType;
      return {
        result: queryOperationalAlerts(
          dbSlice,
          {
            alertType,
            island: typeof args.island === 'string' ? args.island : undefined,
            supplier: typeof args.supplier === 'string' ? args.supplier : undefined,
            days: typeof args.days === 'number' ? args.days : undefined,
            limit: typeof args.limit === 'number' ? args.limit : 20,
          },
          lang,
        ),
      };
    }
    if (toolName === 'search_warehouse_documents') {
      const docType = (typeof args.docType === 'string' ? args.docType : 'all') as DocumentSearchType;
      return {
        result: searchWarehouseDocuments(dbSlice, {
          docType,
          query: typeof args.query === 'string' ? args.query : undefined,
          limit: typeof args.limit === 'number' ? args.limit : 15,
        }),
      };
    }
    return { error: `Unknown tool: ${toolName}` };
  }

  app.post('/api/ai/assistant', requireRole(['admin', 'operator', 'viewer']), async (req: AuthedRequest, res: Response) => {
    const { prompt, lang, history } = req.body as {
      prompt?: string;
      lang?: Language;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    };
    const question = normKey(prompt);
    if (!question) {
      res.status(400).json({ error: errMsg(req, 'پرسش نمی‌تواند خالی باشد', 'Prompt cannot be empty') });
      return;
    }

    const activeLang: Language = lang === 'en' ? 'en' : 'fa';
    const dbSlice = getLiveWarehouseQueryDb();
    const metrics = buildCompactWarehouseMetrics(dbSlice);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        code: 'AI_KEY_REQUIRED',
        error: errMsg(
          req,
          'کلید GEMINI_API_KEY در تنظیمات پروژه (Settings > Secrets) ثبت نشده است. پس از افزودن کلید جمنای، دستیار هوشمند به صورت زنده فعال می‌شود.',
          'GEMINI_API_KEY is not configured in project Settings > Secrets. Add your Gemini API key there to enable live AI responses.',
        ),
        metrics,
      });
      return;
    }

    try {
      const ai = createGeminiClient(apiKey);
      const outLang = activeLang === 'en' ? 'English' : 'Persian (Farsi)';

      const systemInstruction = `You are SAMAAN's expert Power Plant Warehouse AI Analyst & Assistant.
You are directly connected to the live warehouse database through function-calling tools.

CRITICAL OPERATING RULES:
1. You may receive a pre-fetched \`LIVE_PREFETCH_DATA\` JSON block with the latest user message containing live warehouse overview metrics and/or an automatic \`search_warehouse_items\` lookup. If that pre-fetched data ALREADY completely and accurately answers the user's question (e.g., exact item matches & totalsByUnit for the item/size asked), answer directly without redundant tool calls to minimize latency!
2. Otherwise, ALWAYS call the appropriate warehouse query tool(s) BEFORE answering ANY factual question about items, inventory/stock, sizes, packing lists, suppliers, islands, storage locations, shortages, damages, MER/REP, OPI, chemicals, in-transit shipments, weights, or official documents (GCV, MIV, SMR, OSDR, Substitutions, Material Estimates). NEVER guess, fabricate, or give generic unrelated summaries!
3. When the user asks about a specific item, equipment, material, or size (for example: "موجودی Pipe 8\\"", "چند متر لوله ۸ اینچ داریم؟", "Valve DN100", "کابل 3x120"):
   - Verify via \`LIVE_PREFETCH_DATA\` or call \`search_warehouse_items\`. If 0 exact rows match and \`closestSuggestions\` is empty, try a broader keyword or bilingual synonym (e.g. "Pipe" or "لوله", or equivalent DN/inch size) via \`search_warehouse_items\`.
   - ALWAYS report the EXACT aggregated stock grouped by counting unit from \`totalsByUnit\`:
     * **Main Warehouse Stock (موجودی انبار اصلی / مپنا)**: \`mainWarehouseStockSum\`
     * **Contractor Stock (موجودی پیمانکار)**: \`contractorStockSum\`
     * **Total Site Stock (جمع کل موجودی سایت)**: \`totalSiteStockSum\`
     * Also include Packing Qty, Actual Qty, Shortage/Damaged (if any), Packing List numbers, Storage Locations, and Suppliers.
   - NEVER add quantities that have different counting units together.
   - If \`totalDetailedMatches === 0\` for the exact item/size requested (e.g., Pipe 16" does not exist in the DB), state clearly and honestly that NO matching records were found for that exact item/size, and then list any related items from \`closestSuggestions\` (e.g., other Pipe sizes found in the warehouse) so the user gets genuinely helpful information.
4. For follow-up questions in the conversation (e.g. "تامین‌کننده کدومه؟", "کدام سوله هستن؟", "آیا کسری دارند؟"), use the conversation context and call the relevant tool if you need additional fields.
5. Format answers clearly and concisely in ${outLang} using clean Markdown (short headings, bold key numbers, bullet points, and compact Markdown tables with at most 5-6 essential columns when showing multiple items). Keep technical item descriptions, codes, sizes, and packing list numbers exact as stored in the database.`;

      const prefetch: Record<string, unknown> = {
        overview: metrics,
      };
      const normQ = question.toLowerCase();
      if (/شیمیایی|انقضا|chemical|expir/i.test(normQ)) {
        prefetch.expiringChemicals = queryOperationalAlerts(
          dbSlice,
          { alertType: 'expiring_chemicals', days: 30, limit: 20 },
          activeLang,
        );
      }
      if (/کسری|اسیب|آسیب|مغایرت|خراب|mer|rep|shortage|damag|discrep/i.test(normQ)) {
        prefetch.shortages = queryOperationalAlerts(dbSlice, { alertType: 'shortages', limit: 15 }, activeLang);
        prefetch.openMer = queryOperationalAlerts(dbSlice, { alertType: 'open_mer', limit: 12 }, activeLang);
      }
      if (/جزیره|جزایر|island/i.test(normQ)) {
        prefetch.islandBreakdown = aggregateWarehouseByField(
          dbSlice,
          { groupBy: 'island', scope: 'detailed', limit: 15 },
          activeLang,
        );
      }
      const extractedSubject = extractEntitySubjectFromQuestion(question);
      if (extractedSubject) {
        prefetch.autoItemSearch = {
          subject: extractedSubject,
          ...searchWarehouseItems(dbSlice, { query: extractedSubject, scope: 'all', limit: 20 }, activeLang),
        };
      }

      const contents: Content[] = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-10)) {
          const cleanText = normKey(h?.text);
          if (!cleanText) continue;
          contents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: cleanText }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: `User Question:\n${question}\n\nLIVE_PREFETCH_DATA:\n${JSON.stringify(prefetch)}` }],
      });

      const toolsUsed: string[] = [];
      let finalAnswer = '';
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              tools: [{ functionDeclarations: WAREHOUSE_AI_TOOLS }],
            },
          }),
        );

        const modelContent = response.candidates?.[0]?.content;
        const fnCalls = response.functionCalls;

        if (fnCalls && fnCalls.length > 0 && modelContent) {
          contents.push(modelContent);
          const responseParts: Part[] = [];

          for (const call of fnCalls) {
            const toolName = call.name || '';
            toolsUsed.push(toolName);
            const toolArgs = (call.args && typeof call.args === 'object' ? call.args : {}) as Record<string, unknown>;
            const toolOutput = executeWarehouseAiTool(dbSlice, toolName, toolArgs, activeLang);
            responseParts.push({
              functionResponse: {
                id: call.id,
                name: toolName,
                response: toolOutput,
              },
            });
          }

          contents.push({
            role: 'user',
            parts: responseParts,
          });
          continue;
        }

        finalAnswer = (response.text || '').trim();
        break;
      }

      if (!finalAnswer) {
        const synthesis = await callGeminiWithRetry(() =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
        );
        finalAnswer = (synthesis.text || '').trim();
      }

      res.json({
        answer: finalAnswer,
        metrics,
        toolsUsed: Array.from(new Set(toolsUsed)),
      });
    } catch (err) {
      res.status(502).json({
        error: errMsg(
          req,
          `خطا در ارتباط با سرویس هوش مصنوعی: ${err instanceof Error ? err.message : 'Unknown error'}`,
          `AI service error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
        metrics,
      });
    }
  });

  app.post('/api/ai/analyze-warehouse', requireRole(['admin', 'operator', 'viewer']), async (req: AuthedRequest, res: Response) => {
    const { lang } = req.body as { lang?: Language };
    const activeLang: Language = lang === 'en' ? 'en' : 'fa';
    const dbSlice = getLiveWarehouseQueryDb();
    const overview = getWarehouseOverview(dbSlice);
    const metrics = buildCompactWarehouseMetrics(dbSlice);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        code: 'AI_KEY_REQUIRED',
        error: errMsg(
          req,
          'کلید GEMINI_API_KEY در تنظیمات پروژه (Settings > Secrets) ثبت نشده است.',
          'GEMINI_API_KEY is not configured in project Settings > Secrets.',
        ),
        metrics,
      });
      return;
    }

    try {
      const ai = createGeminiClient(apiKey);
      const outLang = activeLang === 'en' ? 'English' : 'Persian (Farsi)';
      const analysisContext = {
        overview,
        topShortages: queryOperationalAlerts(dbSlice, { alertType: 'shortages', limit: 8 }, activeLang).items,
        expiringChemicals: queryOperationalAlerts(dbSlice, { alertType: 'expiring_chemicals', days: 30, limit: 8 }, activeLang).items,
        openMerSample: queryOperationalAlerts(dbSlice, { alertType: 'open_mer', limit: 8 }, activeLang).items,
        islandBreakdown: aggregateWarehouseByField(dbSlice, { groupBy: 'island', scope: 'detailed', limit: 10 }, activeLang).groups,
        topSuppliers: aggregateWarehouseByField(dbSlice, { groupBy: 'supplier', scope: 'general', sortBy: 'grossWeight', limit: 8 }, activeLang).groups,
      };

      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Analyze this power-plant warehouse operational snapshot and provide an executive risk briefing and priority action items in ${outLang}:\n${JSON.stringify(analysisContext)}`,
          config: {
            systemInstruction: `You are an industrial power-plant warehouse operations auditor for SAMAAN. Output structured JSON in ${outLang} strictly grounded in the provided live metrics and breakdowns.`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                riskLevel: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                priorityActions: { type: Type.ARRAY, items: { type: Type.STRING } },
                followUpSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['summary', 'riskLevel', 'priorityActions', 'followUpSuggestions'],
            },
          },
        }),
      );
      const parsed = JSON.parse((response.text || '{}').trim());
      res.json({ analysis: parsed, metrics });
    } catch (err) {
      res.status(502).json({
        error: errMsg(
          req,
          `خطا در تحلیل هوشمند انبار: ${err instanceof Error ? err.message : 'Unknown error'}`,
          `Warehouse AI analysis error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
        metrics,
      });
    }
  });

  app.post('/api/ai/classify-item', requireRole(['admin', 'operator']), async (req: AuthedRequest, res: Response) => {
    const { description, size, itemCode, lang } = req.body as {
      description?: string;
      size?: string;
      itemCode?: string;
      lang?: Language;
    };
    const desc = normKey(description);
    if (!desc) {
      res.status(400).json({ error: errMsg(req, 'شرح کالا برای دسته‌بندی هوشمند الزامی است', 'Item description is required for AI classification') });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        code: 'AI_KEY_REQUIRED',
        error: errMsg(
          req,
          'کلید GEMINI_API_KEY در سرور تنظیم نشده است.',
          'GEMINI_API_KEY is not configured on the server.',
        ),
      });
      return;
    }

    try {
      const ai = createGeminiClient(apiKey);
      const outLang = lang === 'en' ? 'English' : 'Persian';
      const response = await callGeminiWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Classify this power-plant warehouse item:\nDescription: ${desc}\nSize: ${size || '-'}\nItem Code: ${itemCode || '-'}`,
          config: {
            systemInstruction: `You are a power-plant warehouse engineering classifier. Classify the equipment item into standard SAMAAN fields: generalDescription (Title Case English or concise category name), itemCategory ('special_tools' | 'chemicals' | 'spare_parts' | 'none'), chemicalType (only if chemical, else empty), countingUnit (e.g. EA, PC, SET, KG, L, M), and brief warehouse handling notes in ${outLang}.`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                generalDescription: { type: Type.STRING },
                itemCategory: { type: Type.STRING, enum: ['special_tools', 'chemicals', 'spare_parts', 'none'] },
                chemicalType: { type: Type.STRING },
                countingUnit: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
              required: ['generalDescription', 'itemCategory', 'chemicalType', 'countingUnit', 'notes'],
            },
          },
        }),
      );
      const parsed = JSON.parse((response.text || '{}').trim());
      if (parsed && parsed.itemCategory === 'none') {
        parsed.itemCategory = '';
      }
      if (parsed && typeof parsed.countingUnit === 'string') {
        parsed.countingUnit = normalizeCountingUnitToFa(parsed.countingUnit);
      }
      res.json({ classification: parsed });
    } catch (err) {
      res.status(502).json({
        error: errMsg(
          req,
          `خطا در دسته‌بندی هوشمند کالا: ${err instanceof Error ? err.message : 'Unknown error'}`,
          `AI classification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ),
      });
    }
  });

  // ---------------- AUDIT LOG & BACKUP ----------------
  app.get('/api/audit', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const scope = String(req.query.scope || '');
    const username = String(req.query.username || '');
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(20, Number(req.query.pageSize || 50)));

    const filtered = store.db.auditLogs.filter((log) => {
      if (scope && log.scope !== scope) return false;
      if (username && log.username !== username) return false;
      const dateOnly = log.timestamp.slice(0, 10);
      if (!inDateRange(dateOnly, fromDate, toDate)) return false;
      return matchSearch(
        [log.username, log.userFullName, log.action, log.scope, log.targetId, log.summary],
        q,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    res.json({
      items: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  app.get('/api/backup/snapshot', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json(store.exportSnapshot());
  });

  app.post('/api/backup/restore', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const snapshot = req.body as DatabaseSnapshot;
    if (!snapshot || (!Array.isArray(snapshot.general) && !Array.isArray(snapshot.detailed))) {
      res.status(400).json({ error: errMsg(req, 'فرمت فایل پشتیبان نامعتبر است', 'Invalid backup snapshot format') });
      return;
    }
    store.restoreSnapshot(snapshot, sanitizeUser(req.currentUser!));
    res.json({
      ok: true,
      counts: {
        general: store.db.general.length,
        detailed: store.db.detailed.length,
        transit: store.db.transit.length,
      },
    });
  });

  app.get('/api/database/sections-summary', requireRole(['admin']), (_req: AuthedRequest, res: Response) => {
    const categoriesCount = Object.values(store.db.categories).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
    const items: DatabaseSectionSummaryItem[] = [
      { key: 'general', count: store.db.general.length },
      { key: 'detailed', count: store.db.detailed.length },
      { key: 'transit', count: store.db.transit.length },
      { key: 'siteEntryMinutes', count: store.db.siteEntryMinutes.length },
      { key: 'opiInvitations', count: store.db.opiInvitations.length },
      { key: 'opiMinutes', count: store.db.opiMinutes.length },
      { key: 'osdrReports', count: store.db.osdrReports.length },
      { key: 'gcvDocuments', count: store.db.gcvDocuments.length },
      { key: 'mivDocuments', count: store.db.mivDocuments.length },
      { key: 'substitutions', count: store.db.substitutions.length },
      { key: 'materialEstimates', count: store.db.materialEstimates.length },
      { key: 'periodicInspections', count: store.db.periodicInspections.length },
      { key: 'customFormSubmissions', count: store.db.customFormSubmissions.length },
      { key: 'categories', count: categoriesCount },
      { key: 'trash', count: store.db.trash.length },
      { key: 'auditLogs', count: store.db.auditLogs.length },
    ];
    res.json({ items });
  });

  app.post('/api/database/purge', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const { sections: rawSections, wipeAll, confirmationText } = req.body as {
      sections?: PurgeableSectionKey[];
      wipeAll?: boolean;
      confirmationText?: string;
    };

    const allKeys: PurgeableSectionKey[] = [
      'general',
      'detailed',
      'transit',
      'siteEntryMinutes',
      'opiInvitations',
      'opiMinutes',
      'osdrReports',
      'gcvDocuments',
      'mivDocuments',
      'substitutions',
      'materialEstimates',
      'periodicInspections',
      'customFormSubmissions',
      'categories',
      'trash',
      'auditLogs',
    ];
    const validKeySet = new Set<string>(allKeys);
    const selected: PurgeableSectionKey[] = wipeAll
      ? [...allKeys]
      : Array.from(new Set((Array.isArray(rawSections) ? rawSections : []).filter((k): k is PurgeableSectionKey => validKeySet.has(k))));

    if (selected.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک بخش برای حذف انتخاب کنید.', 'Select at least one section to purge.') });
      return;
    }

    const normConfirm = String(confirmationText || '')
      .replace(/\u200c/g, ' ')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim();
    const upperConfirm = normConfirm.toUpperCase();
    const isFullWipe = Boolean(wipeAll) || selected.length === allKeys.length;
    const validConfirm = isFullWipe
      ? normConfirm === 'حذف کل پایگاه داده' || normConfirm === 'حذف کل دیتابیس' || upperConfirm === 'DELETE ALL'
      : normConfirm === 'حذف اطلاعات' ||
        upperConfirm === 'DELETE' ||
        normConfirm === 'حذف کل پایگاه داده' ||
        normConfirm === 'حذف کل دیتابیس' ||
        upperConfirm === 'DELETE ALL';

    if (!validConfirm) {
      res.status(400).json({
        error: errMsg(
          req,
          isFullWipe
            ? 'عبارت امنیتی اشتباه است. برای حذف کل پایگاه داده باید «حذف کل پایگاه داده» یا «DELETE ALL» را تایپ کنید.'
            : 'عبارت امنیتی اشتباه است. برای تایید حذف باید «حذف اطلاعات» یا «DELETE» را تایپ کنید.',
          isFullWipe
            ? 'Invalid confirmation phrase. Type "DELETE ALL" to wipe all sections.'
            : 'Invalid confirmation phrase. Type "DELETE" to confirm section purge.',
        ),
      });
      return;
    }

    const deletedCounts: Partial<Record<PurgeableSectionKey, number>> = {};
    let totalDeleted = 0;

    for (const sec of selected) {
      switch (sec) {
        case 'general':
          deletedCounts.general = store.db.general.length;
          totalDeleted += store.db.general.length;
          store.db.general = [];
          store.db.packingMeta = {};
          break;
        case 'detailed':
          deletedCounts.detailed = store.db.detailed.length;
          totalDeleted += store.db.detailed.length;
          store.db.detailed = [];
          break;
        case 'transit':
          deletedCounts.transit = store.db.transit.length;
          totalDeleted += store.db.transit.length;
          store.db.transit = [];
          break;
        case 'siteEntryMinutes':
          deletedCounts.siteEntryMinutes = store.db.siteEntryMinutes.length;
          totalDeleted += store.db.siteEntryMinutes.length;
          store.db.siteEntryMinutes = [];
          break;
        case 'opiInvitations':
          deletedCounts.opiInvitations = store.db.opiInvitations.length;
          totalDeleted += store.db.opiInvitations.length;
          store.db.opiInvitations = [];
          break;
        case 'opiMinutes':
          deletedCounts.opiMinutes = store.db.opiMinutes.length;
          totalDeleted += store.db.opiMinutes.length;
          store.db.opiMinutes = [];
          break;
        case 'osdrReports':
          deletedCounts.osdrReports = store.db.osdrReports.length;
          totalDeleted += store.db.osdrReports.length;
          store.db.osdrReports = [];
          break;
        case 'gcvDocuments':
          deletedCounts.gcvDocuments = store.db.gcvDocuments.length;
          totalDeleted += store.db.gcvDocuments.length;
          store.db.gcvDocuments = [];
          break;
        case 'mivDocuments':
          deletedCounts.mivDocuments = store.db.mivDocuments.length;
          totalDeleted += store.db.mivDocuments.length;
          store.db.mivDocuments = [];
          break;
        case 'substitutions':
          deletedCounts.substitutions = store.db.substitutions.length;
          totalDeleted += store.db.substitutions.length;
          store.db.substitutions = [];
          break;
        case 'materialEstimates':
          deletedCounts.materialEstimates = store.db.materialEstimates.length;
          totalDeleted += store.db.materialEstimates.length;
          store.db.materialEstimates = [];
          break;
        case 'periodicInspections':
          deletedCounts.periodicInspections = store.db.periodicInspections.length;
          totalDeleted += store.db.periodicInspections.length;
          store.db.periodicInspections = [];
          break;
        case 'customFormSubmissions':
          deletedCounts.customFormSubmissions = store.db.customFormSubmissions.length;
          totalDeleted += store.db.customFormSubmissions.length;
          store.db.customFormSubmissions = [];
          break;
        case 'categories': {
          const catCount = Object.values(store.db.categories).reduce((s, arr) => s + arr.length, 0);
          deletedCounts.categories = catCount;
          totalDeleted += catCount;
          store.db.categories = createEmptyCategories();
          break;
        }
        case 'trash':
          deletedCounts.trash = store.db.trash.length;
          totalDeleted += store.db.trash.length;
          store.db.trash = [];
          break;
        case 'auditLogs':
          deletedCounts.auditLogs = store.db.auditLogs.length;
          totalDeleted += store.db.auditLogs.length;
          store.db.auditLogs = [];
          break;
      }
    }

    store.rebuildIndexes(!selected.includes('categories'));
    store.history.clear();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: isFullWipe ? 'PURGE_ALL_DATABASE' : 'PURGE_DATABASE_SECTIONS',
      scope: 'backup',
      targetId: selected.join(','),
      summary: `پاکسازی امنیتی پایگاه داده توسط مدیر کل (${selected.length} بخش، مجموع ${totalDeleted} رکورد حذف شد): ${selected.join('، ')}`,
    });
    store.saveImmediate();

    res.json({
      ok: true,
      purgedSections: selected,
      deletedCounts,
      totalDeleted,
    });
  });

  // ---------------- VITE / STATIC SERVING ----------------
  const httpServer = http.createServer(app);
  if (process.env.NODE_ENV !== 'production') {
    // Evict any previously registered dev-sw.js or cached registerDevSW script cleanly in dev mode
    app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`export default function registerDevSW() {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        const urls = [reg.active?.scriptURL, reg.waiting?.scriptURL, reg.installing?.scriptURL];
        if (urls.some((u) => u && u.includes('dev-sw.js'))) {
          reg.unregister();
        }
      });
    }).catch(() => {});
  }
}`);
    });
    app.get('/dev-sw.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    } catch {}
  })());
});`);
    });

    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: hmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
      plugins: hmrDisabled
        ? [
            {
              name: 'samaan-disable-hmr-ws',
              enforce: 'post',
              transform(code, id) {
                if (
                  id.endsWith('/vite/dist/client/client.mjs') ||
                  id.endsWith('\\vite\\dist\\client\\client.mjs')
                ) {
                  return code
                    .replace(
                      'transport.connect(createHMRHandler(handleMessage));',
                      '/* HMR WebSocket disabled via DISABLE_HMR=true */',
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("send was called before connect");',
                      'else return;',
                    )
                    .replace(
                      'else throw new SendBeforeConnectError("invoke was called before connect");',
                      'else return null;',
                    );
                }
                if (id.includes('pwa-entry-point-loaded')) {
                  return 'export default function registerDevSW() {}';
                }
                return null;
              },
            },
          ]
        : [],
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          setHeaders: (res, filePath) => {
            const base = path.basename(filePath);
            if (
              base === 'index.html' ||
              base === 'sw.js' ||
              base === 'manifest.webmanifest' ||
              base === 'app-version.json'
            ) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            }
          },
        }),
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SAMAAN server running at http://0.0.0.0:${PORT}`);
  });
}

function queryLimit(val: unknown): number {
  const n = Number(val || 40);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

startServer().catch((err) => {
  console.error('Failed to start SAMAAN server:', err);
  process.exit(1);
});
