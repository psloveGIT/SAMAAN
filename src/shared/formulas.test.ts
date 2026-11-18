import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTransitStatusBucket,
  computeDetailedEntry,
  computeSelectionFormulaSummary,
} from './formulas.ts';
import { buildYearMonths, formatDisplayNumber } from './jalali.ts';
import { matchesPackagePartial } from './tableQuery.ts';
import type { DetailedEntry, TransitEntry } from './types.ts';

function makeDetailed(overrides: Partial<DetailedEntry>): DetailedEntry {
  return {
    id: overrides.id || 'd-1',
    rowNo: '1',
    arrivalDate: '2025-05-01',
    supplier: 'Supplier A',
    origin: 'Iran',
    shipmentNo: 'PK-100',
    packageNo: '1',
    itemNo: '1',
    generalDescription: 'Valve',
    description: 'Gate Valve',
    size: '2"',
    itemCode: 'ITM-1',
    packingQty: 10,
    actualQty: 10,
    damagedQty: 0,
    mtoRef: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: 'EA',
    island: 'Turbin',
    system: 'SYS',
    subSystem: 'SUB',
    unit: 'U1',
    opiNo: '',
    opiDate: '',
    merNo: '',
    merStatus: '',
    notes: '',
    materialBalanceNo: '',
    balanceStatus: '',
    storageLocation: 'WH-1',
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
    createdBy: 'tester',
    ...overrides,
  };
}

function makeTransit(overrides: Partial<TransitEntry>): TransitEntry {
  return {
    id: overrides.id || 't-1',
    rowNo: '1',
    arrivalDate: '',
    overallStatus: 'در دست ارسال',
    inspectionRequest: '',
    releaseNetNo: '',
    releaseNetDate: '',
    mapnaShippingNotice: '',
    interimNo: '',
    interimDate: '',
    supplier: 'Supplier A',
    dispatchLocation: 'Tehran',
    packingListNo: 'PK-1',
    packageNo: '1',
    itemDescription: 'Item',
    system: 'SYS',
    subSystem: 'SUB',
    unit: 'U1',
    equipmentSupplyCode: '',
    carrierContractor: '',
    billOfLadingNo: '',
    amount: 0,
    createdAt: '',
    updatedAt: '',
    createdBy: 'tester',
    ...overrides,
  };
}

test('formatDisplayNumber uses dot "." instead of Arabic decimal separator ٫', () => {
  const faVal = formatDisplayNumber(1234.56, 'fa', { maximumFractionDigits: 2 });
  assert.ok(!faVal.includes('\u066B'), `Unexpected ٫ in ${faVal}`);
  assert.ok(!faVal.includes('/'), `Unexpected / in ${faVal}`);
  assert.ok(faVal.includes('.'), `Expected "." decimal separator in ${faVal}`);

  const enVal = formatDisplayNumber(1234.56, 'en', { maximumFractionDigits: 2 });
  assert.equal(enVal, '1,234.56');
});

test('buildYearMonths returns 12 ordered months for Jalali and Gregorian', () => {
  const jMonths = buildYearMonths('1404', 'jalali');
  assert.equal(jMonths.length, 12);
  assert.equal(jMonths[0], '1404/01');
  assert.equal(jMonths[11], '1404/12');

  const gMonths = buildYearMonths('2025', 'gregorian');
  assert.equal(gMonths.length, 12);
  assert.equal(gMonths[0], '2025-01');
  assert.equal(gMonths[11], '2025-12');
});

test('matchesPackagePartial handles General-to-Detailed partial package matching without false positives', () => {
  assert.equal(matchesPackagePartial('1', '1'), true);
  assert.equal(matchesPackagePartial('01', '1'), true);
  assert.equal(matchesPackagePartial('1', 'PKG-01'), true);
  assert.equal(matchesPackagePartial('PKG-01', '1'), true);
  assert.equal(matchesPackagePartial('1', '1-2'), true);
  assert.equal(matchesPackagePartial('2', '1/2'), true);
  assert.equal(matchesPackagePartial('12', 'BOX12'), true);
  assert.equal(matchesPackagePartial('BOX-12-A', '12'), true);
  assert.equal(matchesPackagePartial('۱۰', 'PKG-10'), true);

  // Must NOT false match 1 against 10 or 11
  assert.equal(matchesPackagePartial('10', '1'), false);
  assert.equal(matchesPackagePartial('11', '1'), false);
  assert.equal(matchesPackagePartial('120', '12'), false);
});

test('computeSelectionFormulaSummary calculates uniquePackingsCount for detailed and status packing counts for transit', () => {
  const d1 = computeDetailedEntry(makeDetailed({ id: 'd1', shipmentNo: 'PK-1', packingQty: 5 }));
  const d2 = computeDetailedEntry(makeDetailed({ id: 'd2', shipmentNo: 'pk-1', packingQty: 7 }));
  const d3 = computeDetailedEntry(makeDetailed({ id: 'd3', shipmentNo: 'PK-2', packingQty: 3 }));
  const detSummary = computeSelectionFormulaSummary({ detailed: [d1, d2, d3] });
  assert.equal(detSummary.uniquePackingsCount, 2);

  const t1 = makeTransit({ id: 't1', packingListNo: 'PK-A', overallStatus: 'رسیده' });
  const t2 = makeTransit({ id: 't2', packingListNo: 'PK-B', overallStatus: 'پایان' });
  const t3 = makeTransit({ id: 't3', packingListNo: 'pk-b', overallStatus: 'پایان' });
  const t4 = makeTransit({ id: 't4', packingListNo: 'PK-C', overallStatus: 'در دست ارسال' });
  const t5 = makeTransit({ id: 't5', packingListNo: 'PK-D', overallStatus: 'در دست بازرسی' });
  const trSummary = computeSelectionFormulaSummary({ transit: [t1, t2, t3, t4, t5] });
  assert.equal(trSummary.transitArrivedPackingsCount, 2);
  assert.equal(trSummary.transitShippingPackingsCount, 1);
  assert.equal(trSummary.transitInspectionPackingsCount, 1);

  assert.equal(classifyTransitStatusBucket('پایان'), 'arrived');
  assert.equal(classifyTransitStatusBucket('در دست ارسال'), 'shipping');
  assert.equal(classifyTransitStatusBucket('در دست بازرسی'), 'inspection');
});
