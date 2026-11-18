import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDetailedEntries, sortGeneralEntries, sortTransitEntries } from './sorting.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

function makeGen(overrides: Partial<GeneralEntry>): GeneralEntry {
  return {
    id: overrides.id ?? '',
    rowNo: '1',
    arrivalDate: '2025-05-01',
    supplier: 'S',
    dispatchLocation: 'D',
    packingListNo: 'PK-1',
    packageNo: '1',
    packageType: 'صندوق چوبی',
    itemCount: 1,
    itemDescription: 'Desc',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: '',
    releaseNo: '',
    releaseDate: '',
    island: 'I',
    system: 'Sys',
    subSystem: 'Sub',
    unit: 'U',
    grossWeight: 1,
    netWeight: 1,
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
    createdBy: 'u',
    ...overrides,
  };
}

test('sortGeneralEntries handles missing ids/createdAt and natural Persian numerals safely', () => {
  const rows: GeneralEntry[] = [
    makeGen({ id: undefined as unknown as string, packingListNo: 'PK-10', packageNo: '۲' }),
    makeGen({ id: 'a', packingListNo: 'PK-2', packageNo: '10' }),
    makeGen({ id: 'b', packingListNo: 'PK-2', packageNo: '۲' }),
  ];

  sortGeneralEntries(rows);
  assert.deepEqual(
    rows.map((r) => `${r.packingListNo}:${r.packageNo}`),
    ['PK-2:۲', 'PK-2:10', 'PK-10:۲'],
  );
});

test('sortDetailedEntries and sortTransitEntries handle missing ids without throwing', () => {
  const dRows = [
    { id: undefined as unknown as string, arrivalDate: '2025-05-02', shipmentNo: 'PK-2', packageNo: '1', itemNo: '2', createdAt: '' },
    { id: 'd1', arrivalDate: '2025-05-01', shipmentNo: 'PK-1', packageNo: '1', itemNo: '1', createdAt: '' },
  ] as unknown as DetailedEntry[];
  sortDetailedEntries(dRows);
  assert.equal(dRows[0].shipmentNo, 'PK-1');

  const tRows = [
    { id: undefined as unknown as string, overallStatus: '', arrivalDate: '2025-05-02', packingListNo: 'PK-2', packageNo: '1', createdAt: '' },
    { id: 't1', overallStatus: 'رسیده کامل', arrivalDate: '2025-05-01', packingListNo: 'PK-1', packageNo: '1', createdAt: '' },
  ] as unknown as TransitEntry[];
  sortTransitEntries(tRows);
  assert.equal(tRows[0].id, 't1');
});

test('sortGeneralEntries sorts 5,000 entries under 200ms', () => {
  const rows: GeneralEntry[] = [];
  for (let i = 0; i < 5000; i += 1) {
    rows.push(
      makeGen({
        id: `g-${5000 - i}`,
        arrivalDate: `2025-0${(i % 9) + 1}-1${i % 9}`,
        packingListNo: `PK-${(i * 17) % 1200}`,
        packageNo: `PKG-${(i % 20) + 1}`,
      }),
    );
  }
  const start = performance.now();
  sortGeneralEntries(rows);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 200, `Expected <200ms to sort 5,000 rows, got ${elapsed.toFixed(1)}ms`);
});
