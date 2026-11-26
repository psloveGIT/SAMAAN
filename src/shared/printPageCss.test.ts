import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SAFE_PRINT_MARGIN_MM,
  STANDARD_PRINT_MARGIN_MM,
  buildIsolatedPrintPortalCss,
  buildPrintPageRule,
  normalizeSafePrintMarginMm,
} from './printPageCss.ts';

test('normalizeSafePrintMarginMm enforces safe minimum 6mm floor and 8mm default', () => {
  assert.equal(STANDARD_PRINT_MARGIN_MM, 8);
  assert.equal(MIN_SAFE_PRINT_MARGIN_MM, 6);
  assert.equal(normalizeSafePrintMarginMm(undefined), STANDARD_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm(0), STANDARD_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm('4mm'), MIN_SAFE_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm(5), MIN_SAFE_PRINT_MARGIN_MM);
  assert.equal(normalizeSafePrintMarginMm('10mm'), 10);
});

test('buildPrintPageRule enforces crisp white margins and supports named pages & footer toggle', () => {
  const defaultRule = buildPrintPageRule('portrait', true);
  assert.match(defaultRule, /size:\s*A4 portrait;/);
  assert.match(defaultRule, /margin:\s*8mm 8mm 11mm 8mm;/);
  assert.match(defaultRule, /background:\s*#ffffff;/);
  assert.match(defaultRule, /صفحه:/);

  const clampedLandscape = buildPrintPageRule('landscape', false, '4mm', {
    pageName: 'samaan-sheet-landscape',
    showBrowserPageFooter: false,
  });
  assert.match(clampedLandscape, /@page samaan-sheet-landscape/);
  assert.match(clampedLandscape, /size:\s*A4 landscape;/);
  assert.match(clampedLandscape, /margin:\s*6mm;/);
  assert.doesNotMatch(clampedLandscape, /@bottom-center/);
});

test('buildIsolatedPrintPortalCss enforces pure white background, hides app root, and supports mixed portrait/landscape', () => {
  const css = buildIsolatedPrintPortalCss('samaan-substitution-print-root', {
    orientation: 'mixed',
    isFa: true,
    showBrowserPageFooter: false,
  });
  assert.match(css, /@media screen[\s\S]*#samaan-substitution-print-root\s*\{\s*display:\s*none !important;/);
  assert.match(css, /color-scheme:\s*light !important;/);
  assert.match(css, /background-color:\s*#ffffff !important;/);
  assert.match(css, /padding:\s*0 !important;/);
  assert.match(css, /body > #root,\s*body > \*:not\(#samaan-substitution-print-root\)\s*\{\s*display:\s*none !important;/);
  assert.match(css, /@page samaan-sheet-portrait/);
  assert.match(css, /@page samaan-sheet-landscape/);
  assert.match(css, /page:\s*samaan-sheet-portrait;/);
  assert.match(css, /page:\s*samaan-sheet-landscape;/);
});
