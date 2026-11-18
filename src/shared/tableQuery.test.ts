import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileColFilters,
  createGeneralDetailedLinker,
  EMPTY_CELL_TOKEN,
  matchesCompiledColFilters,
  matchesPackagePartial,
  matchesPreparedPackage,
  preparePackageInfo,
  sortRowsByColumn,
} from './tableQuery.ts';
import type { DetailedEntry, GeneralEntry } from './types.ts';

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

function makeGeneral(overrides: Partial<GeneralEntry>): GeneralEntry {
  return {
    id: overrides.id || 'g-1',
    rowNo: '1',
    arrivalDate: '2025-05-01',
    supplier: 'Supplier A',
    dispatchLocation: 'Tehran',
    packingListNo: 'PK-100',
    packageNo: '1',
    packageType: 'صندوق چوبی',
    itemCount: 1,
    itemDescription: 'Gate Valve',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: '',
    releaseNo: '',
    releaseDate: '',
    island: 'Turbin',
    system: 'SYS',
    subSystem: 'SUB',
    unit: 'U1',
    grossWeight: 100,
    netWeight: 90,
    lengthCm: 1,
    widthCm: 1,
    heightCm: 1,
    billOfLadingNo: '',
    vehicleNo: '',
    weighbridgeWeight: null,
    freightCost: null,
    opiInvitationNo: '',
    opiInvitationDate: '',
    driverName: '',
    createdAt: '',
    updatedAt: '',
    createdBy: 'tester',
    ...overrides,
  };
}

test('matchesPreparedPackage matches matchesPackagePartial across positive and negative cases', () => {
  const cases: Array<[string, string, boolean]> = [
    ['1', '1', true],
    ['01', '1', true],
    ['1', 'PKG-01', true],
    ['PKG-01', '1', true],
    ['1', '1-2', true],
    ['2', '1/2', true],
    ['12', 'BOX12', true],
    ['BOX-12-A', '12', true],
    ['۱۰', 'PKG-10', true],
    ['10', '1', false],
    ['11', '1', false],
    ['120', '12', false],
    ['', '1', false],
  ];
  for (const [cand, query, expected] of cases) {
    assert.equal(matchesPackagePartial(cand, query), expected, `${cand} vs ${query}`);
    assert.equal(
      matchesPreparedPackage(preparePackageInfo(cand), preparePackageInfo(query)),
      expected,
      `prepared ${cand} vs ${query}`,
    );
  }
});

test('createGeneralDetailedLinker links shortages, damages, MER discrepancies, REP/substitutions, and respects onlyForPkNorms', () => {
  const detailedRows: DetailedEntry[] = [
    makeDetailed({ id: 'd1', shipmentNo: 'PK-1', packageNo: 'PKG-01', packingQty: 10, actualQty: 8 }), // shortage
    makeDetailed({ id: 'd2', shipmentNo: 'pk-1', packageNo: '02', packingQty: 5, actualQty: 5, damagedQty: 1 }), // damaged + discrepancy
    makeDetailed({ id: 'd3', shipmentNo: 'PK-2', packageNo: '1', repNo: 'REP-11', repStatus: 'باز' }), // replaced
    makeDetailed({ id: 'd4', shipmentNo: 'PK-3', packageNo: '5', merNo: 'MER-9', merStatus: 'در جریان' }), // discrepancy only
    makeDetailed({ id: 'd5', shipmentNo: 'PK-4', packageNo: '10', packingQty: 4, actualQty: 4 }), // substituted via table
  ];
  const substitutedIds = new Set<string>(['d5']);

  const resolveAll = createGeneralDetailedLinker(detailedRows, substitutedIds);

  const l1 = resolveAll('PK-1', '1-2');
  assert.equal(l1.detailedCount, 2);
  assert.equal(l1.hasLinkedShortage, true);
  assert.equal(l1.hasLinkedDamaged, true);
  assert.equal(l1.hasLinkedDiscrepancy, true);
  assert.equal(l1.hasLinkedReplaced, false);

  const l2 = resolveAll('PK-2', '1');
  assert.equal(l2.detailedCount, 1);
  assert.equal(l2.hasLinkedShortage, false);
  assert.equal(l2.hasLinkedDamaged, false);
  assert.equal(l2.hasLinkedDiscrepancy, false);
  assert.equal(l2.hasLinkedReplaced, true);

  const l3 = resolveAll('PK-3', '5');
  assert.equal(l3.detailedCount, 1);
  assert.equal(l3.hasLinkedDiscrepancy, true);
  assert.equal(l3.hasLinkedShortage, false);

  const l4 = resolveAll('PK-4', '10');
  assert.equal(l4.detailedCount, 1);
  assert.equal(l4.hasLinkedReplaced, true);

  // Non-matching package number ("1" must NOT match "10")
  const noFalsePositive = resolveAll('PK-4', '1');
  assert.equal(noFalsePositive.detailedCount, 0);

  // Scoped linker matches full linker on included packing lists
  const resolvePage = createGeneralDetailedLinker(detailedRows, substitutedIds, new Set(['pk-1']));
  assert.deepEqual(resolvePage('PK-1', '1-2'), l1);
  assert.equal(resolvePage('PK-2', '1').detailedCount, 0);
});

test('createGeneralDetailedLinker handles 3,000 General x 3,000 Detailed rows in under 250ms', () => {
  const generalRows: GeneralEntry[] = [];
  const detailedRows: DetailedEntry[] = [];

  for (let i = 0; i < 3000; i += 1) {
    const pk = `PK-${Math.floor(i / 3) + 1}`;
    const pkg = String((i % 5) + 1);
    generalRows.push(makeGeneral({ id: `g-${i}`, packingListNo: pk, packageNo: `PKG-${pkg}` }));
    detailedRows.push(
      makeDetailed({
        id: `d-${i}`,
        shipmentNo: pk,
        packageNo: pkg,
        packingQty: 10,
        actualQty: i % 10 === 0 ? 8 : 10,
      }),
    );
  }

  const start = performance.now();
  const resolveLinked = createGeneralDetailedLinker(detailedRows, new Set<string>());
  let shortageMatches = 0;
  for (let i = 0; i < generalRows.length; i += 1) {
    const res = resolveLinked(generalRows[i].packingListNo, generalRows[i].packageNo);
    if (res.hasLinkedShortage) shortageMatches += 1;
  }
  const elapsedMs = performance.now() - start;

  assert.ok(shortageMatches > 0, 'Expected linked shortages to be detected');
  assert.ok(elapsedMs < 250, `Expected <250ms for 3000x3000 link pass, got ${elapsedMs.toFixed(1)}ms`);
});

test('compileColFilters and sortRowsByColumn handle blanks, dates, and Persian numeric order', () => {
  const rows = [
    { id: '1', rowNo: '10', arrivalDate: '2025-05-10', supplier: 'Alpha' },
    { id: '2', rowNo: '2', arrivalDate: '', supplier: '' },
    { id: '3', rowNo: '۱', arrivalDate: '2025-05-02', supplier: 'Beta' },
  ];

  const sortedAsc = sortRowsByColumn(rows, 'rowNo', 'asc');
  assert.deepEqual(
    sortedAsc.map((r) => r.id),
    ['3', '2', '1'],
  );

  const compiled = compileColFilters({ supplier: ['Alpha', EMPTY_CELL_TOKEN] });
  const filtered = rows.filter((r) => matchesCompiledColFilters(r, compiled, 'jalali'));
  assert.deepEqual(
    filtered.map((r) => r.id),
    ['1', '2'],
  );
});
