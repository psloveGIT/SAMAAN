import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCategoryDelete,
  applyCategoryRename,
  computeCategoryCounts,
  registerCategoryTokens,
  sanitizeCategoryStore,
  splitCategoryTokens,
  type CategoryCascadeDb,
} from './categoryCascade.ts';
import type { CategoryStore } from './types.ts';

function makeCategories(partial: Partial<CategoryStore> = {}): CategoryStore {
  return {
    supplier: [],
    dispatchLocation: [],
    origin: [],
    storageLocation: [],
    receiver: [],
    island: [],
    system: [],
    subSystem: [],
    unit: [],
    packageType: [],
    countingUnit: [],
    transitStatus: ['در دست ارسال', 'رسیده'],
    carrierContractor: [],
    merStatus: [],
    repStatus: [],
    balanceStatus: [],
    generalDescription: [],
    stocktakeStatus: [],
    chemicalType: [],
    ...partial,
  };
}

function makeDb(): CategoryCascadeDb {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    general: [
      {
        id: 'g1',
        rowNo: '1',
        arrivalDate: '2026-03-01',
        releaseNo: '',
        releaseDate: '',
        supplier: 'MAPNA Co',
        dispatchLocation: 'Karaj',
        employerEntryMinutesNo: '',
        mapnaEntryMinutesNo: '',
        packingListNo: 'PL-1',
        packageNo: '1',
        itemDescription: 'Turbine Parts',
        island: 'Air Intake\nTurbine\nExhaust\nAuxiliary',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
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
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    detailed: [
      {
        id: 'd1',
        rowNo: '1',
        arrivalDate: '2026-03-01',
        supplier: 'MAPNA Co',
        origin: 'Karaj',
        shipmentNo: 'PL-1',
        packageNo: '1',
        itemNo: '1',
        generalDescription: 'Valve',
        description: 'Gate Valve',
        size: '8"',
        itemCode: 'V-1',
        packingQty: 5,
        actualQty: 5,
        damagedQty: 0,
        mtoRef: '',
        repNo: '',
        repStatus: '',
        repDescription: '',
        countingUnit: 'PCS',
        island: 'Turbine',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        opiNo: '',
        opiDate: '',
        merNo: '',
        merStatus: '',
        notes: '',
        materialBalanceNo: '',
        balanceStatus: '',
        storageLocation: 'Yard A',
        gcvReceiptNo: '',
        receiver: 'Contractor A',
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
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    transit: [
      {
        id: 't1',
        rowNo: '1',
        arrivalDate: '',
        overallStatus: 'در حال بارگیری',
        inspectionRequest: '',
        releaseNetNo: '',
        releaseNetDate: '',
        mapnaShippingNotice: '',
        interimNo: '',
        interimDate: '',
        supplier: 'MAPNA Co',
        dispatchLocation: 'Karaj',
        packingListNo: 'PL-2',
        packageNo: '1',
        itemDescription: 'Cable',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        equipmentSupplyCode: '',
        carrierContractor: 'Pars',
        billOfLadingNo: '',
        amount: null,
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    siteEntryMinutes: [
      {
        id: 'se1',
        minutesNo: 'SE-1',
        date: '2026-03-01',
        entryType: 'permanent',
        goodsUsage: 'project',
        packingListNos: ['PL-1'],
        supplier: 'MAPNA Co',
        origin: 'Karaj',
        driverName: '',
        vehicleType: '',
        vehicleNo: '',
        waybillNo: '',
        conditionStatus: 'healthy',
        items: [],
        createdAt: now,
        createdBy: 'admin',
      },
    ],
    gcvDocuments: [
      {
        id: 'gcv1',
        receiptNo: 'GCV-1',
        date: '2026-03-02',
        supplier: 'MAPNA Co',
        receiver: 'Contractor A',
        items: [{ detailedId: 'd1', shipmentNo: 'PL-1', packageNo: '1', itemNo: '1', description: 'Gate Valve', uom: 'PCS', qty: 2 }],
        createdAt: now,
        createdBy: 'admin',
      },
    ],
    materialEstimates: [
      {
        id: 'mto1',
        mtoCode: 'MTO-1',
        itemCode: 'V-1',
        generalDescription: 'Valve',
        description: 'Gate Valve',
        size: '8"',
        priority: 'normal',
        countingUnit: 'PCS',
        estimatedQty: 5,
        island: 'Turbine',
        system: 'Steam',
        subSystem: 'HP',
        unit: 'Unit 1',
        createdAt: now,
        updatedAt: now,
        createdBy: 'admin',
      },
    ],
    categories: makeCategories({
      island: ['Air Intake\nTurbine\nExhaust\nAuxiliary'],
      supplier: ['MAPNA Co'],
      countingUnit: ['PCS'],
      receiver: ['Contractor A'],
      transitStatus: ['در دست ارسال', 'در حال بارگیری', 'رسیده'],
    }),
  };
}

describe('categoryCascade multi-line splitting & cascading rename/delete', () => {
  it('splits stacked multi-line cell values into distinct category tokens', () => {
    const tokens = splitCategoryTokens('Air Intake\nTurbine\nExhaust\nAuxiliary\n  Turbine  \n-');
    assert.deepEqual(tokens, ['Air Intake', 'Turbine', 'Exhaust', 'Auxiliary']);

    const cats = makeCategories();
    registerCategoryTokens(cats, 'island', 'Air Intake\r\nTurbine\r\nExhaust\r\nAuxiliary');
    assert.equal(cats.island.length, 4);
    assert.ok(cats.island.includes('Air Intake'));
    assert.ok(cats.island.includes('Turbine'));
    assert.ok(cats.island.includes('Exhaust'));
    assert.ok(cats.island.includes('Auxiliary'));
  });

  it('sanitizes legacy multi-line entries inside CategoryStore and counts each token separately', () => {
    const db = makeDb();
    sanitizeCategoryStore(db.categories);
    assert.equal(db.categories.island.length, 4);
    assert.ok(!db.categories.island.some((v) => v.includes('\n')));

    const counts = computeCategoryCounts(db);
    assert.equal(counts.island['Air Intake'], 1);
    assert.equal(counts.island['Turbine'], 3); // general (multi-line) + detailed + materialEstimates
    assert.equal(counts.island['Exhaust'], 1);
    assert.equal(counts.island['Auxiliary'], 1);
  });

  it('cascades category rename across general, detailed, transit, and operational documents including multi-line cells', () => {
    const db = makeDb();
    sanitizeCategoryStore(db.categories);

    const updatedIsland = applyCategoryRename(db, 'island', 'Turbine', 'Gas Turbine');
    assert.equal(updatedIsland, 3);
    assert.equal(db.general[0].island, 'Air Intake\nGas Turbine\nExhaust\nAuxiliary');
    assert.equal(db.detailed[0].island, 'Gas Turbine');
    assert.equal(db.materialEstimates![0].island, 'Gas Turbine');
    assert.ok(db.categories.island.includes('Gas Turbine'));
    assert.ok(!db.categories.island.includes('Turbine'));

    const updatedSupplier = applyCategoryRename(db, 'supplier', 'MAPNA Co', 'MAPNA Group');
    assert.equal(updatedSupplier, 5); // general, detailed, transit, siteEntryMinutes, gcvDocuments
    assert.equal(db.general[0].supplier, 'MAPNA Group');
    assert.equal(db.detailed[0].supplier, 'MAPNA Group');
    assert.equal(db.transit[0].supplier, 'MAPNA Group');
    assert.equal(db.siteEntryMinutes![0].supplier, 'MAPNA Group');
    assert.equal(db.gcvDocuments![0].supplier, 'MAPNA Group');

    const updatedUnit = applyCategoryRename(db, 'countingUnit', 'PCS', 'عدد');
    assert.equal(updatedUnit, 3); // detailed, materialEstimates, gcvDocuments.items[0]
    assert.equal(db.gcvDocuments![0].items[0].uom, 'عدد');
  });

  it('cascades category delete cleanly across single-line, multi-line, and transitStatus fallback fields', () => {
    const db = makeDb();
    sanitizeCategoryStore(db.categories);

    const removedExhaust = applyCategoryDelete(db, 'island', 'Exhaust');
    assert.equal(removedExhaust, 1);
    assert.equal(db.general[0].island, 'Air Intake\nTurbine\nAuxiliary');
    assert.ok(!db.categories.island.includes('Exhaust'));

    const removedTransitStatus = applyCategoryDelete(db, 'transitStatus', 'در حال بارگیری');
    assert.equal(removedTransitStatus, 1);
    assert.equal(db.transit[0].overallStatus, 'در دست ارسال');
  });
});
