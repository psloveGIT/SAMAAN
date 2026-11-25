import type { DiagnosticEventKind, DiagnosticLogEntry, ErrorReportRecord } from '../shared/types.ts';
import {
  appendDiagnosticLog,
  formatDiagnosticsAsText,
  FREEZE_THRESHOLD_MS,
  isMainThreadFreeze,
  MAX_DIAGNOSTIC_LOGS,
  MAX_STORED_ERROR_REPORTS,
} from '../shared/diagnostics.ts';
import { APP_VERSION } from '../shared/appVersion.ts';

const LOGS_STORAGE_KEY = 'samaan_diagnostic_logs_v1';
const REPORTS_STORAGE_KEY = 'samaan_error_reports_v1';

let listenersInstalled = false;
let currentSectionName = 'dashboard';
let watchdogTimer: number | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribeDiagnostics(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function setDiagnosticActiveSection(section: string): void {
  currentSectionName = section || 'dashboard';
}

export function getDiagnosticLogs(): DiagnosticLogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagnosticLogEntry[]) : [];
  } catch {
    return [];
  }
}

function saveDiagnosticLogs(logs: DiagnosticLogEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_DIAGNOSTIC_LOGS)));
  } catch {
    // storage full
  }
}

export function recordDiagnosticEvent(input: {
  kind: DiagnosticEventKind;
  severity?: DiagnosticLogEntry['severity'];
  message: string;
  stack?: string;
  details?: string;
  section?: string;
  durationMs?: number;
}): DiagnosticLogEntry {
  const entry: DiagnosticLogEntry = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    kind: input.kind,
    severity: input.severity || (input.kind === 'ui_freeze' ? 'warning' : 'error'),
    message: String(input.message || 'Unknown error').slice(0, 600),
    stack: input.stack ? String(input.stack).slice(0, 2500) : undefined,
    details: input.details ? String(input.details).slice(0, 1200) : undefined,
    section: input.section || currentSectionName,
    durationMs: input.durationMs,
    url: typeof window !== 'undefined' ? window.location.pathname + window.location.hash : undefined,
    appVersion: APP_VERSION,
  };

  const next = appendDiagnosticLog(getDiagnosticLogs(), entry, MAX_DIAGNOSTIC_LOGS);
  saveDiagnosticLogs(next);
  notifySubscribers();
  return entry;
}

export function clearDiagnosticLogs(): void {
  saveDiagnosticLogs([]);
  notifySubscribers();
}

export function getStoredErrorReports(): ErrorReportRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorReportRecord[]) : [];
  } catch {
    return [];
  }
}

function saveStoredErrorReports(reports: ErrorReportRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      REPORTS_STORAGE_KEY,
      JSON.stringify(reports.slice(0, MAX_STORED_ERROR_REPORTS)),
    );
  } catch {
    // ignore storage full
  }
}

export function upsertStoredErrorReport(report: ErrorReportRecord): ErrorReportRecord[] {
  const existing = getStoredErrorReports().filter((r) => r.id !== report.id);
  const next = [report, ...existing].slice(0, MAX_STORED_ERROR_REPORTS);
  saveStoredErrorReports(next);
  notifySubscribers();
  return next;
}

export async function submitErrorReportToServer(
  report: ErrorReportRecord,
): Promise<{ synced: boolean; serverError?: string }> {
  // Always save locally first so the report is never lost offline
  upsertStoredErrorReport(report);

  try {
    const res = await fetch('/api/error-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(report),
    });
    if (res.ok) {
      const updated: ErrorReportRecord = {
        ...report,
        syncedToServer: true,
        syncedAt: new Date().toISOString(),
      };
      upsertStoredErrorReport(updated);
      return { synced: true };
    }
    return { synced: false, serverError: `HTTP ${res.status}` };
  } catch (err) {
    return {
      synced: false,
      serverError: err instanceof Error ? err.message : 'Network unavailable',
    };
  }
}

export async function syncPendingErrorReports(): Promise<number> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const pending = getStoredErrorReports().filter((r) => !r.syncedToServer);
  if (pending.length === 0) return 0;
  let syncedCount = 0;
  for (const report of pending) {
    const res = await submitErrorReportToServer(report);
    if (res.synced) syncedCount += 1;
  }
  return syncedCount;
}

export function downloadDiagnosticsFile(options: {
  format: 'json' | 'txt';
  projectName?: string;
  reports?: ErrorReportRecord[];
  logs?: DiagnosticLogEntry[];
}): void {
  const logs = options.logs ?? getDiagnosticLogs();
  const reports = options.reports ?? getStoredErrorReports();
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-').slice(0, 19);

  if (options.format === 'json') {
    const payload = {
      app: 'SAMAAN',
      appVersion: APP_VERSION,
      generatedAt,
      projectName: options.projectName || '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      reports,
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerBlobDownload(blob, `samaan-diagnostics-${stamp}.json`);
    return;
  }

  const text = formatDiagnosticsAsText({
    appVersion: APP_VERSION,
    generatedAt,
    projectName: options.projectName,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    logs,
    reports,
  });
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, `samaan-diagnostics-${stamp}.txt`);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Installs global runtime error, unhandled promise rejection, online auto-sync,
 * and main-thread freeze/hang watchdog (>2500ms stall while tab is visible).
 */
export function installDiagnosticsListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  window.addEventListener('error', (event) => {
    // Ignore benign ResizeObserver loop notices
    const msg = String(event.message || '');
    if (msg.includes('ResizeObserver loop')) return;
    recordDiagnosticEvent({
      kind: 'runtime_error',
      severity: 'error',
      message: msg || 'Unhandled runtime error',
      stack: event.error?.stack,
      details: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : 'Unhandled promise rejection';
    recordDiagnosticEvent({
      kind: 'unhandled_rejection',
      severity: 'error',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Main-thread freeze / hang watchdog (only while document is visible to avoid background-tab throttling false positives)
  const HEARTBEAT_MS = 1000;
  let lastTick = performance.now();
  let wasHidden = document.visibilityState === 'hidden';

  document.addEventListener('visibilitychange', () => {
    wasHidden = document.visibilityState === 'hidden';
    lastTick = performance.now();
  });

  watchdogTimer = window.setInterval(() => {
    const now = performance.now();
    const elapsed = now - lastTick;
    lastTick = now;
    if (wasHidden || document.visibilityState === 'hidden') return;
    if (isMainThreadFreeze(elapsed, HEARTBEAT_MS, FREEZE_THRESHOLD_MS)) {
      recordDiagnosticEvent({
        kind: 'ui_freeze',
        severity: elapsed >= 6000 ? 'critical' : 'warning',
        message: `Main thread freeze detected (${Math.round(elapsed)}ms)`,
        durationMs: Math.round(elapsed),
        details: `Expected ${HEARTBEAT_MS}ms tick, actual ${Math.round(elapsed)}ms in section "${currentSectionName}"`,
      });
    }
  }, HEARTBEAT_MS);

  window.addEventListener('online', () => {
    void syncPendingErrorReports();
  });

  // Attempt syncing any previously queued offline reports shortly after startup
  setTimeout(() => {
    void syncPendingErrorReports();
  }, 5000);
}

export function stopDiagnosticsWatchdog(): void {
  if (watchdogTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}
