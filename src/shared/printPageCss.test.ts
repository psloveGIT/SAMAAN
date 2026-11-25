import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SAFE_PRINT_MARGIN_MM,
  STANDARD_PRINT_MARGIN_MM,
  buildIsolatedPrintPortalCss,
  buildPrintPageRule,
  normalizeSafePrintMarginMm,
} from './printPageCss.ts';

test('normalizeSafePrintMarginMm enforces safe minimum 10mm floor and 12mm default', () => {
  assert.equal(normalizeSafePrintMarginMm(undefined), STANDARD_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm(0), STANDARD_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm('4mm'), MIN_SAFE_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm(6), MIN_SAFE_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm('14mm'), 14);
});

test('buildPrintPageRule enforces safe margins and supports named pages & footer toggle', () => {
  const defaultRule = buildPrintPageRule('portrait', true);
  assert.match(defaultRule, /size:\s*A4 portrait;/);
  assert.match(defaultRule, /margin:\s*12mm 12mm 15mm 12mm;/);
  assert.match(defaultRule, /صفحه:/);

  const clampedLandscape = buildPrintPageRule('landscape', false, '5mm', {
    pageName: 'samaan-sheet-landscape',
    showBrowserPageFooter: false,
  });
  assert.match(clampedLandscape, /@page samaan-sheet-landscape/);
  assert.match(clampedLandscape, /size:\s*A4 landscape;/);
  assert.match(clampedLandscape, /margin:\s*10mm;/);
  assert.doesNotMatch(clampedLandscape, /@bottom-center/);
});

test('buildIsolatedPrintPortalCss strictly hides app root and supports mixed portrait/landscape printing', () => {
  const css = buildIsolatedPrintPortalCss('samaan-substitution-print-root', {
    orientation: 'mixed',
    isFa: true,
    marginMm: 12,
    showBrowserPageFooter: false,
  });
  assert.match(css, /@media screen[\s\S]*#samaan-substitution-print-root\s*\{\s*display:\s*none !important;/);
  assert.match(css, /body > \*:not\(#samaan-substitution-print-root\)\s*\{\s*display:\s*none !important;/);
  assert.match(css, /@page samaan-sheet-portrait/);
  assert.match(css, /@page samaan-sheet-landscape/);
  assert.match(css, /page:\s*samaan-sheet-portrait;/);
  assert.match(css, /page:\s*samaan-sheet-landscape;/);
});
