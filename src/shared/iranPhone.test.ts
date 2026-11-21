import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAndFormatIranPhone } from './iranPhone.ts';

test('validateAndFormatIranPhone formats Iranian mobile numbers including Persian digits and +98 prefix', () => {
  const r1 = validateAndFormatIranPhone('۰۹۱۲۳۴۵۶۷۸۹');
  assert.equal(r1.valid, true);
  assert.equal(r1.kind, 'mobile');
  assert.equal(r1.formatted, '0912-345-6789');

  const r2 = validateAndFormatIranPhone('+98 912 345 6789');
  assert.equal(r2.valid, true);
  assert.equal(r2.formatted, '0912-345-6789');

  const r3 = validateAndFormatIranPhone('00989351112233');
  assert.equal(r3.valid, true);
  assert.equal(r3.formatted, '0935-111-2233');
});

test('validateAndFormatIranPhone formats Iranian landline and multi-number entries', () => {
  const r1 = validateAndFormatIranPhone('۰۲۱-۸۸۷۷۶۶۵۵');
  assert.equal(r1.valid, true);
  assert.equal(r1.kind, 'landline');
  assert.equal(r1.formatted, '021-88776655');

  const r2 = validateAndFormatIranPhone('02188776655 / 09123456789');
  assert.equal(r2.valid, true);
  assert.equal(r2.kind, 'multi');
  assert.equal(r2.formatted, '021-88776655 / 0912-345-6789');
});

test('validateAndFormatIranPhone rejects invalid non-Iranian numbers', () => {
  const bad1 = validateAndFormatIranPhone('12345');
  assert.equal(bad1.valid, false);
  assert.equal(bad1.kind, 'invalid');
  assert.ok(bad1.errorFa);

  const bad2 = validateAndFormatIranPhone('0912345678'); // 10 digits instead of 11
  assert.equal(bad2.valid, false);

  const empty = validateAndFormatIranPhone('   ');
  assert.equal(empty.valid, true);
  assert.equal(empty.kind, 'empty');
});
