import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_EMPLOYER_DEFAULT_FORMS,
  OPERATIONAL_FORM_SECTION_KEYS,
  OPERATIONAL_FORM_SECTIONS,
  getEmployerFormSectionsSummary,
  isOperationalFormSection,
  resolveOperationalSectionAccess,
} from './formAccess';
import {
  BUILT_IN_EMPLOYERS,
  DEFAULT_UPLOADED_FORM_PRINT_SETTINGS,
  sanitizeUploadedForm,
} from './employers';
import type { EmployerProfile, EmployerUploadedForm } from './types';

function makeUploadedForm(
  id: string,
  targetAppSection: EmployerUploadedForm['targetAppSection'],
): EmployerUploadedForm {
  const now = '2026-05-27T00:00:00.000Z';
  return {
    id,
    titleFa: `فرم تست ${id}`,
    fileName: `${id}.xlsx`,
    fileType: 'excel',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileDataBase64: 'UEsDBAoAAAAAA',
    dataSource: 'general',
    targetAppSection,
    targetSectionConfirmed: true,
    printSettings: { ...DEFAULT_UPLOADED_FORM_PRINT_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

test('OPERATIONAL_FORM_SECTIONS contains exactly the 9 warehouse operational form sections', () => {
  assert.equal(OPERATIONAL_FORM_SECTION_KEYS.length, 9);
  assert.equal(OPERATIONAL_FORM_SECTIONS.length, 9);
  assert.equal(isOperationalFormSection('siteEntry'), true);
  assert.equal(isOperationalFormSection('storageLabel'), true);
  assert.equal(isOperationalFormSection('dashboard'), false);
  assert.equal(isOperationalFormSection('general'), false);
});

test('MD1 has built-in storageLabel active (1/9) while MD2, MD3 and custom employers start with 0/9 active sections until forms are uploaded', () => {
  assert.deepEqual(BUILT_IN_EMPLOYER_DEFAULT_FORMS['mapna-md1'], ['storageLabel']);
  assert.deepEqual(BUILT_IN_EMPLOYER_DEFAULT_FORMS['mapna-md2'], []);
  assert.deepEqual(BUILT_IN_EMPLOYER_DEFAULT_FORMS['mapna-md3'], []);

  for (const emp of BUILT_IN_EMPLOYERS) {
    const summary = getEmployerFormSectionsSummary(emp);
    assert.equal(summary.totalCount, 9);
    if (emp.id === 'mapna-md1') {
      assert.equal(summary.unlockedCount, 1);
      assert.equal(summary.lockedCount, 8);
      for (const sec of summary.sections) {
        if (sec.sectionKey === 'storageLabel') {
          assert.equal(sec.hasAccess, true);
          assert.equal(sec.mode, 'builtin');
        } else {
          assert.equal(sec.hasAccess, false);
          assert.equal(sec.mode, 'locked');
        }
      }
    } else {
      assert.equal(summary.unlockedCount, 0);
      assert.equal(summary.lockedCount, 9);
      for (const sec of summary.sections) {
        assert.equal(sec.hasAccess, false);
        assert.equal(sec.mode, 'locked');
      }
    }
  }

  const customEmployer: Pick<EmployerProfile, 'id' | 'uploadedForms'> = {
    id: 'emp-custom-neka',
    uploadedForms: [],
  };
  const customSummary = getEmployerFormSectionsSummary(customEmployer);
  assert.equal(customSummary.unlockedCount, 0);
  assert.equal(customSummary.lockedCount, 9);
});

test('Uploading a form for one section unlocks ONLY that specific section for MD2, MD3, and custom employers', () => {
  const md2WithSiteEntry = {
    id: 'mapna-md2',
    uploadedForms: [makeUploadedForm('u-se', 'siteEntry')],
  };

  const seAccess = resolveOperationalSectionAccess(md2WithSiteEntry, 'siteEntry');
  assert.equal(seAccess.hasAccess, true);
  assert.equal(seAccess.mode, 'uploaded');
  assert.equal(seAccess.uploadedForms.length, 1);

  const mivAccess = resolveOperationalSectionAccess(md2WithSiteEntry, 'miv');
  assert.equal(mivAccess.hasAccess, false);
  assert.equal(mivAccess.mode, 'locked');

  const summary = getEmployerFormSectionsSummary(md2WithSiteEntry);
  assert.equal(summary.unlockedCount, 1);
  assert.equal(summary.lockedCount, 8);

  // Custom employer uploading 2 sections unlocks those 2 and keeps remaining 7 locked
  const customWithTwo = {
    id: 'emp-custom-xyz',
    uploadedForms: [
      makeUploadedForm('u-gcv', 'gcv'),
      makeUploadedForm('u-smr', 'smr'),
      makeUploadedForm('u-standalone', 'custom_standalone'),
    ],
  };
  const customSummary = getEmployerFormSectionsSummary(customWithTwo);
  assert.equal(customSummary.unlockedCount, 2);
  assert.equal(customSummary.lockedCount, 7);
  assert.equal(resolveOperationalSectionAccess(customWithTwo, 'gcv').mode, 'uploaded');
  assert.equal(resolveOperationalSectionAccess(customWithTwo, 'smr').mode, 'uploaded');
  assert.equal(resolveOperationalSectionAccess(customWithTwo, 'opi').mode, 'locked');
});

test('sanitizeUploadedForm preserves targetAppSection, targetSectionConfirmed, and all operational dataSources', () => {
  const raw = {
    ...makeUploadedForm('u-miv-1', 'miv'),
    dataSource: 'miv',
    dataSources: ['miv', 'detailed', 'general'],
    targetAppSection: 'miv',
    targetSectionConfidence: 'high',
    targetSectionReasonFa: 'تطبیق مستقیم با حواله انبار',
    targetSectionConfirmed: true,
  };
  const cleaned = sanitizeUploadedForm(raw);
  assert.ok(cleaned);
  assert.equal(cleaned.targetAppSection, 'miv');
  assert.equal(cleaned.targetSectionConfirmed, true);
  assert.equal(cleaned.targetSectionConfidence, 'high');
  assert.equal(cleaned.dataSource, 'miv');
  assert.deepEqual(cleaned.dataSources, ['miv', 'detailed', 'general']);
});
