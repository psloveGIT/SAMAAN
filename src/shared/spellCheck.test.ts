import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAllSpellCorrections,
  applySpellCorrection,
  checkTextSpelling,
} from './spellCheck.ts';

test('checkTextSpelling catches Persian typos and half-space orthography issues', () => {
  const issues = checkTextSpelling('تجهزات پکنگ بسته بندی می شود', new Set());
  assert.ok(issues.length >= 4, `Expected >=4 issues, got ${issues.length}`);

  const fixed = applyAllSpellCorrections('تجهزات پکنگ بسته بندی می شود', issues);
  assert.equal(fixed, 'تجهیزات پکینگ بسته‌بندی می‌شود');
});

test('checkTextSpelling catches English typos and preserves capitalization', () => {
  const text = 'Shoratge in warehose equipemnt inspeciton';
  const issues = checkTextSpelling(text, new Set());
  assert.equal(issues.length, 4);
  assert.equal(issues[0].suggestions[0], 'Shortage');

  const singleFix = applySpellCorrection(text, issues[0], issues[0].suggestions[0]);
  assert.ok(singleFix.startsWith('Shortage in warehose'));

  const fixedAll = applyAllSpellCorrections(text, issues);
  assert.equal(fixedAll, 'Shortage in warehouse equipment inspection');
});

test('checkTextSpelling skips technical codes, acronyms, numbers, and custom dictionary entries', () => {
  const techText = 'PL-2025 DN50 OPI MER REP HVAC M12x40 ISO9001';
  const issues = checkTextSpelling(techText, new Set());
  assert.equal(issues.length, 0);

  // Custom dictionary suppresses flagged word
  const custom = new Set(['equipemnt', 'تجهزات']);
  const suppressed = checkTextSpelling('equipemnt تجهزات', custom);
  assert.equal(suppressed.length, 0);
});
