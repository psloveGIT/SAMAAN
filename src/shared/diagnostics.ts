import type { DiagnosticLogEntry, ErrorReportRecord } from './types.ts';

export const MAX_DIAGNOSTIC_LOGS = 200;
export const MAX_STORED_ERROR_REPORTS = 50;
export const FREEZE_THRESHOLD_MS = 2500;

/**
 * Appends a diagnostic log entry to an immutable ring buffer, keeping the most recent entries.
 */
export function appendDiagnosticLog(
  existing: readonly DiagnosticLogEntry[],
  entry: DiagnosticLogEntry,
  maxEntries = MAX_DIAGNOSTIC_LOGS,
): DiagnosticLogEntry[] {
  const next = [entry, ...existing];
  return next.slice(0, Math.max(1, maxEntries));
}

/**
 * Detects whether the elapsed interval between two heartbeat ticks indicates a main-thread freeze/hang.
 */
export function isMainThreadFreeze(
  elapsedMs: number,
  expectedIntervalMs: number,
  thresholdMs = FREEZE_THRESHOLD_MS,
): boolean {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(expectedIntervalMs)) return false;
  return elapsedMs - expectedIntervalMs >= thresholdMs;
}

/**
 * Formats diagnostic logs and/or a user error report into a readable plain-text file.
 */
export function formatDiagnosticsAsText(options: {
  appVersion: string;
  generatedAt: string;
  projectName?: string;
  userAgent?: string;
  logs: readonly DiagnosticLogEntry[];
  reports?: readonly ErrorReportRecord[];
}): string {
  const lines: string[] = [
    '============================================================',
    `SAMAAN Diagnostics & Error Report (v${options.appVersion})`,
    `Generated At: ${options.generatedAt}`,
    `Project: ${options.projectName || 'N/A'}`,
    `Client: ${options.userAgent || 'N/A'}`,
    '============================================================',
    '',
  ];

  if (options.reports && options.reports.length > 0) {
    lines.push(`--- User Error Reports (${options.reports.length}) ---`);
    for (const rep of options.reports) {
      lines.push(
        `[${rep.createdAt}] (${rep.severity.toUpperCase()}) [${rep.category}] Section: ${rep.section} | Synced: ${rep.syncedToServer ? 'YES' : 'NO'}`,
      );
      lines.push(`Title: ${rep.title}`);
      lines.push(`Description: ${rep.description}`);
      if (rep.stepsToReproduce) {
        lines.push(`Steps: ${rep.stepsToReproduce}`);
      }
      lines.push('');
    }
  }

  lines.push(`--- Automatic Diagnostic Logs (${options.logs.length}) ---`);
  if (options.logs.length === 0) {
    lines.push('(No automatic errors, crashes, or UI freezes recorded.)');
  } else {
    for (const log of options.logs) {
      lines.push(
        `[${log.timestamp}] [${log.kind.toUpperCase()}] [${log.severity.toUpperCase()}] ${log.message}`,
      );
      if (log.section) lines.push(`  Section: ${log.section}`);
      if (log.details) lines.push(`  Details: ${log.details}`);
      if (log.stack) lines.push(`  Stack:\n    ${log.stack.split('\n').slice(0, 6).join('\n    ')}`);
    }
  }

  return lines.join('\n');
}

export function sanitizeErrorReportInput(raw: {
  title?: string;
  category?: string;
  section?: string;
  severity?: string;
  description?: string;
  stepsToReproduce?: string;
}): {
  valid: boolean;
  errorFa?: string;
  errorEn?: string;
  title: string;
  category: ErrorReportRecord['category'];
  section: string;
  severity: ErrorReportRecord['severity'];
  description: string;
  stepsToReproduce: string;
} {
  const title = String(raw.title || '').trim().slice(0, 180);
  const description = String(raw.description || '').trim().slice(0, 4000);
  const stepsToReproduce = String(raw.stepsToReproduce || '').trim().slice(0, 2000);
  const section = String(raw.section || '').trim().slice(0, 100) || 'general';
  const validCategories: ErrorReportRecord['category'][] = [
    'bug',
    'ui_layout',
    'freeze_crash',
    'print_export',
    'data_sync',
    'other',
  ];
  const category = validCategories.includes(raw.category as ErrorReportRecord['category'])
    ? (raw.category as ErrorReportRecord['category'])
    : 'bug';

  const validSeverities: ErrorReportRecord['severity'][] = ['low', 'medium', 'high', 'critical'];
  const severity = validSeverities.includes(raw.severity as ErrorReportRecord['severity'])
    ? (raw.severity as ErrorReportRecord['severity'])
    : 'medium';

  if (!description || description.length < 5) {
    return {
      valid: false,
      errorFa: 'لطفاً شرح خطا یا اشکال مشاهده‌شده را (حداقل ۵ کاراکتر) وارد نمایید.',
      errorEn: 'Please describe the issue or malfunction (at least 5 characters).',
      title,
      category,
      section,
      severity,
      description,
      stepsToReproduce,
    };
  }

  return {
    valid: true,
    title: title || description.slice(0, 60),
    category,
    section,
    severity,
    description,
    stepsToReproduce,
  };
}
