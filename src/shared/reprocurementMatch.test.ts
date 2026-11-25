import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetailedComputed, SubstitutionRecord } from './types';
import {
  appendMultilineLine,
  buildShortageReprocurementNote,
  buildSubstitutionReprocurementNote,
  matchOpenShortages,
  matchOpenSubstitutions,
  shouldCloseShortage,
  shouldCloseSubstitution,
} from './reprocurementMatch';

function makeDetailed(overrides: Partial<DetailedComputed>): DetailedComputed {
  return {
    id: overrides.id || 'd-1',
    rowNo: '1',
    arrivalDate: '2026-01-01',
    supplier: 'TUGA',
    origin: 'Iran',
    shipmentNo: 'PK-100',
    packageNo: '1',
    itemNo: '1',
    generalDescription: '',
    description: 'Turbine Valve Gasket',
    size: '',
    itemCode: 'ABC-12345678',
    packingQty: 10,
    actualQty: 10,
    damagedQty: 0,
    mtoRef: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: 'عدد',
    island: 'GT',
    system: 'SYS-1',
    subSystem: '',
    unit: '1',
    opiNo: '',
    opiDate: '',
    merNo: '',
    merStatus: '',
    merDescription: '',
    notes: '',
    materialBalanceNo: '',
    balanceStatus: '',
    storageLocation: '',
    gcvReceiptNo: '',
    receiver: '',
    gcvDeliveredQty: null,
    mivContractorNo: '',
    mivContractorDate: '',
    mivContractorQty: null,
    smrContractorNo: '',
    smrContractorDate: '',
    smrContractorQty: null,
    smrContractorNote: '',
    smrMapnaNo: '',
    smrMapnaDate: '',
    smrMapnaQty: null,
    smrMapnaNote: '',
    mivMapnaNo: '',
    mivMapnaDate: '',
    mivMapnaQty: null,
    stocktakeInfo: '',
    shortageBackfills: [],
    createdAt: '',
    updatedAt: '',
    createdBy: 'admin',
    initialShortage: 0,
    backfilledQty: 0,
    shortage: 0,
    surplus: 0,
    effectiveActualQty: 10,
    mapnaInventory: 10,
    contractorInventory: 0,
    hasShortage: false,
    hasDamaged: false,
    opiPending: false,
    hasImage: false,
    ...overrides,
  };
}

test('matchOpenSubstitutions ranks exact code, last 5 digits, and description keywords into suggested', () => {
  const rows: DetailedComputed[] = [
    makeDetailed({ id: 'd-exact', itemCode: 'TG-9945678', description: 'Seal Ring', repNo: 'TU-0001', repStatus: 'باز' }),
    makeDetailed({ id: 'd-last5', itemCode: 'XX-0045678', description: 'Other Part', repNo: 'TU-0002', repStatus: 'باز' }),
    makeDetailed({ id: 'd-desc', itemCode: 'ZZ-11111', description: 'Turbine Valve Seal', repNo: 'TU-0003', repStatus: 'باز' }),
    makeDetailed({ id: 'd-other', itemCode: 'YY-88888', description: 'Cable Tray', repNo: 'TU-0004', repStatus: 'باز' }),
    makeDetailed({ id: 'd-closed', itemCode: 'TG-9945678', description: 'Closed Sub', repNo: 'TU-0005', repStatus: 'بسته' }),
  ];

  const subs: SubstitutionRecord[] = [
    {
      id: 'sub-1',
      docNo: 'TU-0001',
      date: '2026-01-01',
      detailedId: 'd-exact',
      shipmentNo: 'PK-100',
      packageNo: '1',
      itemNo: '1',
      originalDescription: 'Seal Ring',
      originalItemCode: 'TG-9945678',
      substituteDescription: 'Seal Ring',
      substituteItemCode: 'TG-9945678',
      qty: 4,
      countingUnit: 'عدد',
      reason: 'damaged',
      status: 'executed',
      createdAt: '',
      createdBy: 'admin',
    },
  ];

  const res = matchOpenSubstitutions(
    { itemCode: 'TG-9945678', description: 'Turbine Seal' },
    rows,
    subs,
  );

  assert.deepEqual(
    res.suggested.map((r) => r.detailedId),
    ['d-exact', 'd-last5', 'd-desc'],
  );
  assert.equal(res.suggested[0].targetQty, 4);
  assert.deepEqual(
    res.others.map((r) => r.detailedId),
    ['d-other'],
  );
});

test('matchOpenShortages includes active shortage/damaged rows and excludes closed merStatus', () => {
  const rows: DetailedComputed[] = [
    makeDetailed({ id: 's-1', itemCode: 'P-12345', shortage: 3, damagedQty: 1, merStatus: 'باز' }),
    makeDetailed({ id: 's-2', itemCode: 'P-99999', description: 'Pump Bearing', shortage: 2, damagedQty: 0, merStatus: '' }),
    makeDetailed({ id: 's-closed', itemCode: 'P-12345', shortage: 3, damagedQty: 0, merStatus: 'بسته' }),
    makeDetailed({ id: 's-none', itemCode: 'P-12345', shortage: 0, damagedQty: 0, merStatus: 'باز' }),
  ];

  const res = matchOpenShortages({ itemCode: 'X-12345', description: 'Valve' }, rows);
  assert.deepEqual(res.suggested.map((r) => r.detailedId), ['s-1']);
  assert.equal(res.suggested[0].targetQty, 4);
  assert.deepEqual(res.others.map((r) => r.detailedId), ['s-2']);
});

test('exact re-procurement sentence builders, multiline append, and auto-close checks', () => {
  const subNote = buildSubstitutionReprocurementNote('NK-TU-0001', 'PK-2026-99', 5);
  assert.equal(subNote, 'شماره جایگزینی NK-TU-0001 با شماره پکینگ PK-2026-99 و به تعداد 5 تأمین گردید.');

  const shortNote = buildShortageReprocurementNote(4, 'عدد', 'PK-2026-88');
  assert.equal(shortNote, 'تعداد 4 عدد با شماره پکینگ PK-2026-88 تأمین گردید.');

  const appended = appendMultilineLine('علت قبلی\nتأمین کننده مجدد: TUGA', subNote);
  assert.equal(appended, `علت قبلی\nتأمین کننده مجدد: TUGA\n${subNote}`);
  // Idempotent on exact duplicate
  assert.equal(appendMultilineLine(appended, subNote), appended);

  assert.equal(shouldCloseSubstitution(5, 5), true);
  assert.equal(shouldCloseSubstitution(3, 5), false);
  assert.equal(shouldCloseShortage(4, 3, 1), true);
  assert.equal(shouldCloseShortage(3, 3, 1), false);
});
