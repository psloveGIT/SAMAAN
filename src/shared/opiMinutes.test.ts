import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDetailedMerDescription,
  buildMerReportItem,
  buildOpiMinutesAutoFill,
  computeMerReceivedQty,
  filterOpenInvitationsForMinutes,
  findDetailedRowsForInvitation,
  generateMerReportNo,
} from './opiMinutes.ts';
import { assertUniqueDocNo } from './docUniqueness.ts';
import type { GeneralEntry, OpiInvitationRecord, OpiMinutesRecord, OsdrReportRecord } from './types.ts';

function makeInvitation(overrides: Partial<OpiInvitationRecord> = {}): OpiInvitationRecord {
  return {
    id: overrides.id || 'inv-1',
    invitationNo: overrides.invitationNo || 'NK-TU-0001',
    date: overrides.date || '2026-05-10',
    time: overrides.time || '09:30',
    packingNos: overrides.packingNos || ['PK-100'],
    location: overrides.location || 'انبار سرپوشیده ۱',
    supplier: overrides.supplier || 'TUGA',
    system: overrides.system || 'Gas Turbine',
    island: overrides.island || 'GT',
    unit: overrides.unit || 'U1',
    purchasePackageNo: overrides.purchasePackageNo || 'PO-77',
    items: overrides.items || [
      {
        itemNo: '1',
        packingListNo: 'PK-100',
        packageNo: '1',
        description: 'Turbine Bearings',
        uom: 'صندوق',
        remarks: '',
      },
    ],
    status: 'issued',
    createdAt: '',
    createdBy: 'admin',
    ...overrides,
  };
}

test('filterOpenInvitationsForMinutes hides invitations that already have an OPI Minute issued or completed status', () => {
  const inv1 = makeInvitation({ id: 'inv-1', invitationNo: 'NK-TU-0001' });
  const inv2 = makeInvitation({ id: 'inv-2', invitationNo: 'NK-TU-0002' });
  const inv3 = makeInvitation({ id: 'inv-3', invitationNo: 'NK-TU-0003', status: 'completed' });
  const min1 = {
    id: 'min-1',
    invitationId: 'inv-1',
    minutesNo: 'NK-TU-0001',
    invitationNo: 'NK-TU-0001',
  } as OpiMinutesRecord;

  assert.deepEqual(
    filterOpenInvitationsForMinutes([inv1, inv2, inv3], [min1]).map((i) => i.id),
    ['inv-2'],
  );
  // Editing min1 keeps inv1 available even if completed
  assert.deepEqual(
    filterOpenInvitationsForMinutes(
      [{ ...inv1, status: 'completed' }, inv2, inv3],
      [min1],
      'min-1',
    ).map((i) => i.id),
    ['inv-1', 'inv-2'],
  );
});

test('buildOpiMinutesAutoFill maps Rules 1-1 through 1-20 accurately', () => {
  const inv = makeInvitation();
  const gen = {
    id: 'g-1',
    packingListNo: 'PK-100',
    packageNo: '1',
    supplier: 'TUGA',
    system: 'Gas Turbine',
    island: 'GT',
    unit: 'U1',
    purchasePackageNo: 'PO-77',
    itemDescription: 'Turbine Bearings',
    packageType: 'صندوق',
  } as GeneralEntry;

  const filled = buildOpiMinutesAutoFill(
    inv,
    [gen],
    { name: 'پروژه نکا', contractRef: 'CNT-1404-09' },
    { 0: 'سالم تحویل شد' },
  );

  assert.equal(filled.headerProjectTitle, 'پروژه نکا');
  assert.equal(filled.projectBareName, 'نکا');
  assert.equal(filled.minutesNo, 'NK-TU-0001');
  assert.equal(filled.invitationNo, 'NK-TU-0001');
  assert.equal(filled.contractNo, 'CNT-1404-09');
  assert.equal(filled.supplier, 'TUGA');
  assert.equal(filled.items[0].remarks, 'سالم تحویل شد');
});

test('generateMerReportNo uses <PLANT>-<SUPPLIER>-#### and skips already-used numbers globally', () => {
  const merNo = generateMerReportNo(
    'TUGA',
    ['NK-TU-0001', 'NK-GCV-0001'],
    { plantAbbreviation: 'NK', usePlantAbbreviationInDocs: true, plantAbbreviationPosition: 'prefix' },
  );
  assert.equal(merNo, 'NK-TU-0002');

  const mecoMer = generateMerReportNo(
    'MECO',
    ['NK-ME-0001'],
    { plantAbbreviation: 'NK', usePlantAbbreviationInDocs: true, plantAbbreviationPosition: 'prefix' },
  );
  assert.equal(mecoMer, 'NK-ME-0002');

  const parsMer = generateMerReportNo(
    'PARS',
    [],
    { plantAbbreviation: 'NK', usePlantAbbreviationInDocs: true, plantAbbreviationPosition: 'prefix' },
  );
  assert.equal(parsMer, 'NK-PS-0001');
});

test('buildMerReportItem computes Received Quantity = Package - Discrepant for shortage and = Discrepant for damaged', () => {
  const shortageItem = buildMerReportItem({
    detailed: {
      id: 'd1',
      shipmentNo: 'PK-100',
      packageNo: '2',
      itemNo: '5',
      itemCode: 'TAG-55',
      description: 'Control Valve',
      generalDescription: 'Valve',
      countingUnit: 'عدد',
      packingQty: 10,
    },
    category: 'shortage',
    discrepantQty: 3,
    discrepancyText: 'کسری در بسته‌بندی',
    remark: 'پیگیری از سازنده',
  });
  assert.equal(shortageItem.packingQty, 10);
  assert.equal(shortageItem.actualQty, 7);
  assert.equal(shortageItem.discrepantQty, 3);
  assert.equal(shortageItem.discrepancyReason, '3');
  assert.equal(shortageItem.shortage, 3);
  assert.equal(shortageItem.damagedQty, 0);
  assert.equal(buildDetailedMerDescription(shortageItem), 'کسری (3) - پیگیری از سازنده');

  const damagedAll = buildMerReportItem({
    detailed: {
      id: 'd2',
      shipmentNo: 'PK-100',
      packageNo: '2',
      itemNo: '6',
      itemCode: 'TAG-56',
      description: 'Gasket Set',
      generalDescription: 'Gasket',
      countingUnit: 'ست',
      packingQty: 4,
    },
    category: 'damaged',
    discrepantQty: 4,
    discrepancyText: 'آسیب‌دیدگی کامل بسته',
  });
  assert.equal(damagedAll.actualQty, 4);
  assert.equal(damagedAll.discrepantQty, 4);
  assert.equal(damagedAll.discrepancyReason, '4');
  assert.equal(damagedAll.damagedQty, 4);
  assert.equal(damagedAll.shortage, 0);

  assert.equal(computeMerReceivedQty(10, 'shortage', 3), 7);
  assert.equal(computeMerReceivedQty(4, 'damaged', 4), 4);
  assert.equal(computeMerReceivedQty(4, 'damaged', 2), 2);
});

test('findDetailedRowsForInvitation matches Detailed rows across all invitation packings', () => {
  const inv = makeInvitation({ packingNos: ['PK-100', 'PK-200'] });
  const rows = [
    { id: '1', shipmentNo: 'PK-100', packageNo: '1' },
    { id: '2', shipmentNo: 'pk-200', packageNo: '3' },
    { id: '3', shipmentNo: 'PK-999', packageNo: '1' },
  ];
  assert.deepEqual(
    findDetailedRowsForInvitation(inv, rows).map((r) => r.id),
    ['1', '2'],
  );
});

test('assertUniqueDocNo enforces per-section uniqueness independently (MER starts from 0001 even if OPI used NK-TU-0001)', () => {
  const db = {
    opiInvitations: [makeInvitation({ id: 'inv-1', invitationNo: 'NK-TU-0001' })],
    opiMinutes: [] as OpiMinutesRecord[],
    osdrReports: [] as OsdrReportRecord[],
  };
  // MER scope is independent of OPI Invitations -> NK-TU-0001 is allowed in MER!
  assert.equal(assertUniqueDocNo(db, 'NK-TU-0001', { scope: 'osdr' }).ok, true);
  // Duplicate inside OPI Invitations is blocked
  assert.equal(assertUniqueDocNo(db, 'NK-TU-0001', { scope: 'opi' }).ok, false);
  // OPI Minute can share its paired invitation no when no OPI Minute has it yet
  assert.equal(
    assertUniqueDocNo(db, 'NK-TU-0001', { scope: 'opiMinutes', allowPairedOpiInvitationNo: 'NK-TU-0001' }).ok,
    true,
  );
  // Duplicate inside OPI Minutes is blocked
  db.opiMinutes.push({ id: 'min-1', minutesNo: 'NK-TU-0001' } as OpiMinutesRecord);
  assert.equal(
    assertUniqueDocNo(db, 'NK-TU-0001', { scope: 'opiMinutes', allowPairedOpiInvitationNo: 'NK-TU-0001' }).ok,
    false,
  );
  // Duplicate inside MER (osdr) is blocked once used in osdrReports
  db.osdrReports.push({ id: 'mer-1', reportNo: 'NK-TU-0001' } as OsdrReportRecord);
  assert.equal(assertUniqueDocNo(db, 'NK-TU-0001', { scope: 'osdr' }).ok, false);
});
