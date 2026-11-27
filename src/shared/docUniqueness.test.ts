import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertUniqueDocNo,
  collectAllUsedDocNos,
  getAllUsedDocNumbers,
  normalizeDocNoKey,
  validateSignedScanPayload,
} from './docUniqueness.ts';
import type {
  DatabaseSnapshot,
  GcvDocumentRecord,
  MivDocumentRecord,
  OpiInvitationRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
} from './types.ts';

function makeMockDb(): Partial<DatabaseSnapshot> {
  return {
    opiInvitations: [
      { id: 'opi-1', invitationNo: 'NK-TU-0001' } as OpiInvitationRecord,
    ],
    mivDocuments: [
      { id: 'miv-1', docNo: 'NK-TE-MIV-0001' } as MivDocumentRecord,
    ],
    substitutions: [
      { id: 'sub-1', docNo: 'NK-TU-0002' } as SubstitutionRecord,
    ],
    siteEntryMinutes: [
      { id: 'se-1', minutesNo: 'SE-0001' } as SiteEntryMinutesRecord,
    ],
    gcvDocuments: [
      { id: 'gcv-1', receiptNo: 'GCV-0001' } as GcvDocumentRecord,
    ],
    trash: [
      {
        id: 'tr-1',
        scope: 'detailed',
        deletedAt: '2026-01-01',
        deletedBy: 'admin',
        targetLabel: 'NK-TE-MIV-0009',
        data: { id: 'det-old', mivContractorNo: 'NK-TE-MIV-0009' } as unknown as DatabaseSnapshot['detailed'][number],
      },
    ],
  };
}

test('normalizeDocNoKey normalizes Persian/Arabic digits, case, and whitespace', () => {
  assert.equal(normalizeDocNoKey(' nk-tu-۰۰۰۱ '), 'NK-TU-0001');
  assert.equal(normalizeDocNoKey('NK-TE-MIV-٠٠٠٢'), 'NK-TE-MIV-0002');
});

test('assertUniqueDocNo enforces per-section uniqueness independently while blocking duplicates within the same section and its trash', () => {
  const db = makeMockDb();

  // Cross-form reuse is ALLOWED (OPI NK-TU-0001 does NOT block MER or MIV)
  const crossAllowed = assertUniqueDocNo(db, 'nk-tu-0001', { scope: 'osdr' });
  assert.equal(crossAllowed.ok, true);

  // Same-section duplicate in OPI is blocked
  const opiDup = assertUniqueDocNo(db, 'nk-tu-0001', { scope: 'opi' });
  assert.equal(opiDup.ok, false);
  assert.equal(opiDup.conflict?.scope, 'opi');

  // Persian-digit duplicate collision in MIV is blocked
  const persianDup = assertUniqueDocNo(db, 'NK-TE-MIV-۰۰۰۱', { scope: 'miv' });
  assert.equal(persianDup.ok, false);
  assert.equal(persianDup.conflict?.scope, 'miv');

  // Trash collision inside the same section prevents reusing deleted number (when trash entry has miv scope)
  const dbWithMivTrash = {
    ...db,
    trash: [
      {
        id: 'tr-miv-1',
        scope: 'miv' as unknown as 'detailed',
        deletedAt: '2026-01-01',
        deletedBy: 'admin',
        targetLabel: 'NK-TE-MIV-0009',
        data: { id: 'miv-old', docNo: 'NK-TE-MIV-0009' } as unknown as MivDocumentRecord,
      },
    ],
  } as unknown as Partial<DatabaseSnapshot>;
  const trashDup = assertUniqueDocNo(dbWithMivTrash, 'NK-TE-MIV-0009', { scope: 'miv' });
  assert.equal(trashDup.ok, false);
  assert.equal(trashDup.conflict?.scope, 'trash');
  // Another section (e.g. GCV) is NOT blocked by MIV trash
  assert.equal(assertUniqueDocNo(dbWithMivTrash, 'NK-TE-MIV-0009', { scope: 'gcv' }).ok, true);

  // Editing the same record with its own number succeeds
  const selfEdit = assertUniqueDocNo(db, 'NK-TE-MIV-0001', {
    scope: 'miv',
    excludeScope: 'miv',
    excludeId: 'miv-1',
  });
  assert.equal(selfEdit.ok, true);

  // Brand-new unique number succeeds
  const fresh = assertUniqueDocNo(db, 'NK-TE-MIV-0010', { scope: 'miv' });
  assert.equal(fresh.ok, true);

  assert.equal(collectAllUsedDocNos(db, { scope: 'opi' }).size, 1);
  assert.equal(getAllUsedDocNumbers(dbWithMivTrash, 'miv').includes('NK-TE-MIV-0009'), true);
});

test('validateSignedScanPayload enforces MIME allowlist, base64 integrity, and filename sanitization', () => {
  const validPdf = validateSignedScanPayload({
    fileName: '../../signed:form?.pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from('%PDF-1.4 sample').toString('base64'),
  });
  assert.equal(validPdf.ok, true);
  assert.equal(validPdf.attachment?.mimeType, 'application/pdf');
  assert.equal(validPdf.attachment?.fileName.includes('..'), true);
  assert.equal(validPdf.attachment?.fileName.includes('/'), false);
  assert.equal(validPdf.attachment?.fileName.includes(':'), false);

  const badMime = validateSignedScanPayload({
    fileName: 'evil.html',
    mimeType: 'text/html',
    dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64'),
  });
  assert.equal(badMime.ok, false);

  const badBase64 = validateSignedScanPayload({
    fileName: 'scan.png',
    mimeType: 'image/png',
    dataBase64: '!!!not-base64!!!',
  });
  assert.equal(badBase64.ok, false);
});
