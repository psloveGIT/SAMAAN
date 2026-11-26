import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEmployerFormSectionsSummary,
  resolveOperationalSectionAccess,
} from './formAccess.ts';

test('mapna-md1 unlocks storageLabel, substitution, miv, and opi while locking undefined sections', () => {
  const md1 = { id: 'mapna-md1', uploadedForms: [] };
  assert.equal(resolveOperationalSectionAccess(md1, 'storageLabel').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'substitution').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'miv').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'opi').hasAccess, true);
  assert.equal(resolveOperationalSectionAccess(md1, 'gcv').hasAccess, false);
  assert.equal(resolveOperationalSectionAccess(md1, 'smr').hasAccess, false);
  assert.equal(resolveOperationalSectionAccess(md1, 'siteEntry').hasAccess, false);
  assert.equal(getEmployerFormSectionsSummary(md1).unlockedCount, 4);
});

test('mapna-md2, mapna-md3, and undefined employers strictly lock opi, substitution, and all other forms', () => {
  for (const empId of ['mapna-md2', 'mapna-md3', 'custom-other', '']) {
    const emp = { id: empId, uploadedForms: [] };
    assert.equal(resolveOperationalSectionAccess(emp, 'opi').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'substitution').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'miv').hasAccess, false);
    assert.equal(resolveOperationalSectionAccess(emp, 'storageLabel').hasAccess, false);
    assert.equal(getEmployerFormSectionsSummary(emp).unlockedCount, 0);
  }
});
