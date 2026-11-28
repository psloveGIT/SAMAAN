import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmployerFormSectionsSummary,
  resolveOperationalSectionAccess,
} from './formAccess.ts';

test('mapna-md1 unlocks all 9 built-in sections including siteEntry, smr, and balance', () => {
  const md1 = { id: 'mapna-md1', uploadedForms: [] };
  assert.equal(resolveOperationalSectionAccess(md1, 'storageLabel').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'substitution').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'miv').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'opi').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'gcv').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'opiMinutes').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'siteEntry').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'smr').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'balance').hasAccess, true);
  assert.equal(getEmployerFormSectionsSummary(md1).unlockedCount, 9);
});

test('mapna-md2, mapna-md3, and undefined employers strictly lock all built-in forms', () => {
  for (const empId of ['mapna-md2', 'mapna-md3', 'custom-other', '']) {
    const emp = { id: empId, uploadedForms: [] };
    assert.equal(resolveOperationalSectionAccess(emp, 'siteEntry').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'opi').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'opiMinutes').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'gcv').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'smr').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'substitution').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'miv').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'balance').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'storageLabel').hasAccess, false);
    assert.equal(getEmployerFormSectionsSummary(emp).unlockedCount, 0);
  }
});
