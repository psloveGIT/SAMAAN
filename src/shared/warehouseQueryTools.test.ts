import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateWarehouseByField,
  getPackingListDetails,
  getWarehouseOverview,
  queryOperationalAlerts,
  searchWarehouseDocuments,
  searchWarehouseItems,
  type WarehouseQueryDb,
} from './warehouseQueryTools.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

function makeDetailed(overrides: Partial<DetailedEntry>): DetailedEntry {
  return {
    id: overrides.id || 'd-1',
    rowNo: '1',
    arrivalDate: '2025-05-01',
    supplier: 'MAPNA Piping Co',
    origin: 'Iran',
    shipmentNo: 'PL-PIPE-01',
    packageNo: 'PKG-1',
    itemNo: '1',
    generalDescription: 'Pipe',
    description: 'Seamless Carbon Steel Pipe Sch 40',
    size: '8"',
    itemCode: 'PIP-CS-008',
    packingQty: 120,
    actualQty: 120,
    damagedQty: 0,
    mtoRef: 'MTO-10',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: 'M',
    island: 'GT',
    system: 'Fuel Gas',
    subSystem: 'FG-01',
    unit: 'Unit 1',
    opiNo: 'OPI-10',
    opiDate: '2025-05-03',
    merNo: '',
    merStatus: '',
    notes: '',
    materialBalanceNo: '',
    balanceStatus: '',
    storageLocation: 'Yard-B2',
    gcvReceiptNo: '',
    receiver: '',
    gcvDeliveredQty: null,
    mivContractorNo: 'MIV-C-01',
    mivContractorDate: '2025-05-06',
    mivContractorQty: 30,
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
    itemCategory: '',
    shortageBackfills: [],
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

function makeGeneral(overrides: Partial<GeneralEntry>): GeneralEntry {
  return {
    id: overrides.id || 'g-1',
    rowNo: '1',
    arrivalDate: '2025-05-01',
    releaseNo: 'RN-1',
    releaseDate: '2025-05-01',
    supplier: 'MAPNA Piping Co',
    dispatchLocation: 'Tehran',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: 'ME-1',
    packingListNo: 'PL-PIPE-01',
    packageNo: 'PKG-1',
    itemDescription: 'Carbon Steel Pipes 8 inch',
    island: 'GT',
    system: 'Fuel Gas',
    subSystem: 'FG-01',
    unit: 'Unit 1',
    grossWeight: 5000,
    netWeight: 4600,
    lengthCm: 600,
    widthCm: 100,
    heightCm: 100,
    billOfLadingNo: 'BL-100',
    vehicleNo: '12A345',
    weighbridgeWeight: 5020,
    freightCost: 25000000,
    opiInvitationNo: '',
    opiInvitationDate: '',
    driverName: 'Ahmadi',
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    createdBy: 'admin',
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
    mapnaShippingNotice: 'SN-1',
    interimNo: '',
    interimDate: '',
    supplier: 'Siemens',
    dispatchLocation: 'Port',
    packingListNo: 'PL-TR-99',
    packageNo: 'PKG-9',
    itemDescription: 'Turbine Spare Sensors',
    system: 'GT',
    subSystem: '',
    unit: 'Unit 1',
    equipmentSupplyCode: '',
    carrierContractor: 'Kaveh',
    billOfLadingNo: 'BL-99',
    amount: 0,
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

function createFixtureDb(): WarehouseQueryDb {
  return {
    general: [
      makeGeneral({ id: 'g-1', packingListNo: 'PL-PIPE-01', packageNo: 'PKG-1', grossWeight: 5000, netWeight: 4600 }),
      makeGeneral({
        id: 'g-2',
        packingListNo: 'PL-PIPE-02',
        packageNo: 'PKG-2',
        itemDescription: 'Stainless Steel Pipe 4"',
        supplier: 'Alpha Steel',
        island: 'HRSG',
        grossWeight: 3000,
        netWeight: 2800,
      }),
    ],
    detailed: [
      // Pipe 8" row #1 (size in `size` column, 90m Main Stock, 30m Contractor Stock)
      makeDetailed({
        id: 'd-p8-1',
        shipmentNo: 'PL-PIPE-01',
        packageNo: 'PKG-1',
        itemNo: '1',
        description: 'Seamless Carbon Steel Pipe Sch 40',
        size: '8"',
        countingUnit: 'M',
        packingQty: 120,
        actualQty: 120,
        gcvDeliveredQty: 30,
        mivContractorQty: 0,
        storageLocation: 'Yard-B2',
        island: 'GT',
        supplier: 'MAPNA Piping Co',
      }),
      // Pipe 8" row #2 (size embedded in description as DN200, 60m Main Stock, 0 Contractor, 10m shortage)
      makeDetailed({
        id: 'd-p8-2',
        shipmentNo: 'PL-PIPE-01',
        packageNo: 'PKG-2',
        itemNo: '2',
        description: 'Carbon Steel Pipe DN200 Sch 80',
        size: 'DN200',
        countingUnit: 'M',
        packingQty: 70,
        actualQty: 60,
        mivContractorQty: 0,
        storageLocation: 'Yard-B4',
        island: 'GT',
        supplier: 'MAPNA Piping Co',
      }),
      // Pipe 18" row — MUST NOT falsely match "Pipe 8\""!
      makeDetailed({
        id: 'd-p18',
        shipmentNo: 'PL-PIPE-02',
        packageNo: 'PKG-5',
        itemNo: '1',
        description: 'Carbon Steel Pipe 18" Sch 40',
        size: '18"',
        countingUnit: 'M',
        packingQty: 50,
        actualQty: 50,
        mivContractorQty: 0,
        storageLocation: 'Yard-C1',
        island: 'HRSG',
        supplier: 'Alpha Steel',
      }),
      // Pipe 4" row — should only appear in closestSuggestions when searching Pipe 12"
      makeDetailed({
        id: 'd-p4',
        shipmentNo: 'PL-PIPE-02',
        packageNo: 'PKG-2',
        itemNo: '2',
        description: 'Stainless Steel Pipe',
        size: '4 inch',
        countingUnit: 'M',
        packingQty: 80,
        actualQty: 80,
        mivContractorQty: 20,
        storageLocation: 'Shed-A1',
        island: 'HRSG',
        supplier: 'Alpha Steel',
      }),
      // Gate Valve DN100
      makeDetailed({
        id: 'd-v4',
        shipmentNo: 'PL-VALVE-03',
        packageNo: 'PKG-1',
        itemNo: '1',
        generalDescription: 'Valve',
        description: 'Gate Valve Class 300',
        size: 'DN100',
        countingUnit: 'EA',
        packingQty: 10,
        actualQty: 8,
        damagedQty: 1,
        gcvDeliveredQty: 2,
        mivContractorQty: 0,
        merNo: 'MER-200',
        merStatus: 'باز',
        storageLocation: 'Shed-A2',
        island: 'BOP',
        supplier: 'Flowserve',
      }),
    ],
    transit: [makeTransit({})],
    mivDocuments: [
      {
        id: 'miv-1',
        docType: 'miv_contractor',
        docNo: 'MIV-C-01',
        date: '2025-05-06',
        party: 'Contractor Alpha',
        items: [
          {
            detailedId: 'd-p8-1',
            shipmentNo: 'PL-PIPE-01',
            packageNo: 'PKG-1',
            itemNo: '1',
            description: 'Seamless Carbon Steel Pipe Sch 40',
            qty: 30,
          },
        ],
        createdAt: '2025-05-06T00:00:00.000Z',
        createdBy: 'admin',
      },
    ],
  };
}

test('searchWarehouseItems matches Pipe 8" across both size column and DN200 without matching Pipe 18" or Pipe 4"', () => {
  const db = createFixtureDb();
  const res = searchWarehouseItems(db, { query: 'Pipe 8"', scope: 'all' }, 'fa');

  assert.equal(res.exactMatch, true);
  assert.equal(res.totalDetailedMatches, 2);
  assert.deepEqual(
    res.detailedItems.map((i) => i.size).sort(),
    ['8"', 'DN200'],
  );
  // Exact aggregated stock in meters:
  // Row 1: main=90, contractor=30, packing=120, actual=120, shortage=0
  // Row 2: main=60, contractor=0, packing=70, actual=60, shortage=10
  assert.equal(res.totalsByUnit.length, 1);
  assert.equal(res.totalsByUnit[0].unit, 'متر');
  assert.equal(res.totalsByUnit[0].mainWarehouseStockSum, 150);
  assert.equal(res.totalsByUnit[0].contractorStockSum, 30);
  assert.equal(res.totalsByUnit[0].totalSiteStockSum, 180);
  assert.equal(res.totalsByUnit[0].shortageSum, 10);
  assert.deepEqual(res.storageLocations.sort(), ['Yard-B2', 'Yard-B4']);
});

test('searchWarehouseItems understands Persian bilingual queries like "لوله ۸ اینچ" and "شیر ۴ اینچ"', () => {
  const db = createFixtureDb();

  const pipeRes = searchWarehouseItems(db, { query: 'لوله ۸ اینچ', scope: 'detailed' }, 'fa');
  assert.equal(pipeRes.totalDetailedMatches, 2);
  assert.equal(pipeRes.totalsByUnit[0].mainWarehouseStockSum, 150);

  const valveRes = searchWarehouseItems(db, { query: 'شیر ۴ اینچ', scope: 'detailed' }, 'fa');
  assert.equal(valveRes.totalDetailedMatches, 1);
  assert.equal(valveRes.detailedItems[0].description, 'Gate Valve Class 300');
  assert.equal(valveRes.totalsByUnit[0].mainWarehouseStockSum, 6);
  assert.equal(valveRes.totalsByUnit[0].contractorStockSum, 2);
});

test('searchWarehouseItems returns 0 exact matches and helpful closestSuggestions when exact size does not exist', () => {
  const db = createFixtureDb();
  const res = searchWarehouseItems(db, { query: 'Pipe 12"', scope: 'detailed' }, 'fa');

  assert.equal(res.exactMatch, false);
  assert.equal(res.totalDetailedMatches, 0);
  assert.ok(res.closestSuggestions.length >= 3, 'Should suggest other Pipe sizes found in warehouse');
  assert.ok(res.closestSuggestions.every((s) => /pipe/i.test(s.description)));
});

test('getPackingListDetails aggregates items, weights, stock, and linked MIV documents for a packing list', () => {
  const db = createFixtureDb();
  const pl = getPackingListDetails(db, 'PL-PIPE-01', 'fa');

  assert.equal(pl.found, true);
  assert.equal(pl.generalCount, 1);
  assert.equal(pl.detailedCount, 2);
  assert.equal(pl.grossWeightTons, 5);
  assert.equal(pl.netWeightTons, 4.6);
  assert.equal(pl.documents.mivDocuments.length, 1);
  assert.equal(pl.documents.mivDocuments[0].docNo, 'MIV-C-01');
});

test('aggregateWarehouseByField, queryOperationalAlerts, getWarehouseOverview, and searchWarehouseDocuments return exact metrics', () => {
  const db = createFixtureDb();

  const ov = getWarehouseOverview(db);
  assert.equal(ov.detailedRows, 5);
  assert.equal(ov.shortageItemsCount, 2);
  assert.equal(ov.openMerCount, 1);
  assert.equal(ov.documents.mivDocuments, 1);

  const byIsland = aggregateWarehouseByField(db, { groupBy: 'island', scope: 'detailed' }, 'fa');
  assert.equal(byIsland.groups[0].group, 'GT');
  assert.equal(byIsland.groups[0].rows, 2);

  const openMer = queryOperationalAlerts(db, { alertType: 'open_mer' }, 'fa');
  assert.equal(openMer.totalCount, 1);

  const docs = searchWarehouseDocuments(db, { docType: 'miv', query: 'MIV-C-01' });
  assert.equal(docs.totalMatches, 1);
});
