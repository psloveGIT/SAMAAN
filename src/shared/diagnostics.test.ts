import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendDiagnosticLog,
  formatDiagnosticsAsText,
  isMainThreadFreeze,
  sanitizeErrorReportInput,
} from './diagnostics';

test('appendDiagnosticLog keeps newest entries within ring buffer capacity', () => {
  const e1 = { id: '1', timestamp: '2026-01-01T00:00:00Z', kind: 'runtime_error' as const, severity: 'error' as const, message: 'err1' };
  const e2 = { id: '2', timestamp: '2026-01-01T00:01:00Z', kind: 'ui_freeze' as const, severity: 'warning' as const, message: 'freeze' };
  const e3 = { id: '3', timestamp: '2026-01-01T00:02:00Z', kind: 'api_error' as const, severity: 'error' as const, message: 'api' };

  const buf = appendDiagnosticLog(appendDiagnosticLog([e1], e2, 2), e3, 2);
  assert.deepEqual(buf.map((x) => x.id), ['3', '2']);
});

test('isMainThreadFreeze detects stalls >= threshold beyond heartbeat interval', () => {
  assert.equal(isMainThreadFreeze(1200, 1000, 2500), false);
  assert.equal(isMainThreadFreeze(3500, 1000, 2500), true);
  assert.equal(isMainThreadFreeze(6000, 1000, 2500), true);
});

test('sanitizeErrorReportInput validates description length and normalizes fields', () => {
  assert.equal(sanitizeErrorReportInput({ description: 'hi' }).valid, false);
  const ok = sanitizeErrorReportInput({
    title: 'چاپ کار نمی‌کند',
    category: 'print_export',
    severity: 'high',
    section: 'substitution',
    description: 'دکمه چاپ در نسخه نصب‌شده آیفون واکنشی نشان نمی‌دهد.',
    stepsToReproduce: 'باز کردن فرم جایگزینی و کلیک روی چاپ',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.category, 'print_export');
  assert.equal(ok.severity, 'high');
});

test('formatDiagnosticsAsText includes version, reports, and automatic logs', () => {
  const txt = formatDiagnosticsAsText({
    appVersion: '2.14.0',
    generatedAt: '2026-11-24T00:00:00Z',
    projectName: 'Neka',
    logs: [
      { id: '1', timestamp: '2026-11-24T00:00:00Z', kind: 'ui_freeze', severity: 'warning', message: 'UI freeze 3100ms' },
    ],
  });
  assert.match(txt, /v2\.14\.0/);
  assert.match(txt, /UI_FREEZE/);
  assert.match(txt, /UI freeze 3100ms/);
});
