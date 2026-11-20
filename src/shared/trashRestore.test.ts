import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActiveDupKeySets,
  buildTrashEntryDupKey,
  isTrashRestoreDuplicate,
} from './trashRestore.ts';
import type {
  DetailedEntry,
  GeneralEntry,
  TransitEntry,
  TrashRecord,
} from './types.ts';

function makeDetailed(overrides: Partial<DetailedEntry> = {}): DetailedEntry {
  return {
    id: overrides.id || 'd-1',
    rowNo: '1',
    arrivalDate: '2025-02-01',
    supplier: 'MAPNA',
    origin: 'Karaj',
    shipmentNo: 'PK-100',
    packageNo: 'BOX-1',
    itemNo: '1',
    generalDescription: 'Pipe',
    description: 'Carbon Steel Pipe 8 inch',
    size: '8"',
    itemCode: 'CS-PIPE-8',
    mtoRef: '',
    packingQty: 10,
    actualQty: 10,
    damagedQty: 0,
    countingUnit: 'عدد',
    island: 'BOP',
    system: 'CW',
    subSystem: 'CW-01',
    unit: 'U1',
    storageLocation: 'Yard A',
    opiNo: '',
    opiDate: '',
    merNo: '',
    merStatus: '',
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
    materialBalanceNo: '',
    balanceStatus: '',
    smrMapnaNo: '',
    smrMapnaDate: '',
    smrMapnaQty: null,
    smrMapnaNote: '',
    mivMapnaNo: '',
    mivMapnaDate: '',
    mivMapnaQty: null,
    stocktakeInfo: '',
    stocktakeStatus: '',
    stocktakeDate: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    itemCategory: '',
    chemicalType: '',
    productionDate: '',
    expirationDate: '',
    notes: '',
    shortageBackfills: [],
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

function makeGeneral(overrides: Partial<GeneralEntry> = {}): GeneralEntry {
  return {
    id: overrides.id || 'g-1',
    rowNo: '1',
    arrivalDate: '2025-02-01',
    releaseNo: '',
    releaseDate: '',
    supplier: 'MAPNA',
    dispatchLocation: 'Karaj',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: 'SE-1',
    packingListNo: 'PK-100',
    packageNo: 'BOX-1',
    packageType: 'صندوق چوبی',
    itemCount: 5,
    itemDescription: 'Main Valves',
    island: 'BOP',
    system: 'CW',
    subSystem: 'CW-01',
    unit: 'U1',
    grossWeight: 500,
    netWeight: 420,
    lengthCm: 120,
    widthCm: 80,
    heightCm: 90,
    billOfLadingNo: 'BL-1',
    vehicleNo: '12A345',
    weighbridgeWeight: 505,
    freightCost: 5000000,
    opiInvitationNo: '',
    opiInvitationDate: '',
    driverName: 'Ali',
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

function makeTransit(overrides: Partial<TransitEntry> = {}): TransitEntry {
  return {
    id: overrides.id || 't-1',
    rowNo: '1',
    overallStatus: 'در دست ارسال',
    arrivalDate: '2025-02-01',
    inspectionRequest: '',
    releaseNetNo: 'RN-1',
    releaseNetDate: '',
    mapnaShippingNotice: 'SN-1',
    interimNo: 'IN-1',
    interimDate: '',
    packingListNo: 'PK-100',
    packageNo: 'BOX-1',
    itemDescription: 'Cable Drum',
    equipmentSupplyCode: '',
    supplier: 'MAPNA',
    dispatchLocation: 'Bandar Abbas',
    system: 'EL',
    subSystem: 'EL-01',
    unit: 'U1',
    billOfLadingNo: 'BL-99',
    carrierContractor: 'Carrier A',
    amount: 1000000,
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

test('Detailed restore allows rows sharing (shipmentNo, packageNo, itemNo) when description or itemCode differs', () => {
  const active = makeDetailed({
    id: 'd-active',
    shipmentNo: 'PK-100',
    packageNo: 'BOX-1',
    itemNo: '1',
    description: 'Carbon Steel Pipe 8 inch',
    itemCode: 'CS-PIPE-8',
  });
  const deletedDifferentDesc = makeDetailed({
    id: 'd-deleted',
    shipmentNo: 'PK-100',
    packageNo: 'BOX-1',
    itemNo: '1',
    description: 'Flange Gasket 8 inch',
    itemCode: 'FLG-GSK-8',
  });
  const trashEntry: TrashRecord = {
    id: 'tr-1',
    scope: 'detailed',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: deletedDifferentDesc,
  };

  assert.equal(
    isTrashRestoreDuplicate(trashEntry, { general: [], detailed: [active], transit: [] }),
    false,
  );
});

test('Detailed restore detects exact duplicate matching buildDetailedDupKey', () => {
  const active = makeDetailed({ id: 'd-active' });
  const deletedExact = makeDetailed({ id: 'd-deleted' });
  const trashEntry: TrashRecord = {
    id: 'tr-2',
    scope: 'detailed',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: deletedExact,
  };

  assert.equal(
    isTrashRestoreDuplicate(trashEntry, { general: [], detailed: [active], transit: [] }),
    true,
  );
});

test('General restore applies buildGeneralDupKey consistently (blocks exact dup, allows distinct package/description)', () => {
  const active = makeGeneral({ id: 'g-active', packageNo: 'BOX-1' });
  const exactTrash: TrashRecord = {
    id: 'tr-g1',
    scope: 'general',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: makeGeneral({ id: 'g-del-1', packageNo: 'BOX-1' }),
  };
  const distinctTrash: TrashRecord = {
    id: 'tr-g2',
    scope: 'general',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: makeGeneral({ id: 'g-del-2', packageNo: 'BOX-2' }),
  };

  assert.equal(
    isTrashRestoreDuplicate(exactTrash, { general: [active], detailed: [], transit: [] }),
    true,
  );
  assert.equal(
    isTrashRestoreDuplicate(distinctTrash, { general: [active], detailed: [], transit: [] }),
    false,
  );
});

test('Transit restore applies buildTransitDupKey consistently and buildActiveDupKeySets indexes all 3 scopes', () => {
  const activeT = makeTransit({ id: 't-active', billOfLadingNo: 'BL-99' });
  const exactTrash: TrashRecord = {
    id: 'tr-t1',
    scope: 'transit',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: makeTransit({ id: 't-del-1', billOfLadingNo: 'BL-99' }),
  };
  const distinctTrash: TrashRecord = {
    id: 'tr-t2',
    scope: 'transit',
    deletedAt: '2025-02-02T00:00:00.000Z',
    deletedBy: 'admin',
    targetLabel: 'PK-100',
    data: makeTransit({ id: 't-del-2', billOfLadingNo: 'BL-100' }),
  };

  const sets = buildActiveDupKeySets({ general: [], detailed: [], transit: [activeT] });
  assert.equal(sets.transit.has(buildTrashEntryDupKey('transit', exactTrash.data)), true);
  assert.equal(sets.transit.has(buildTrashEntryDupKey('transit', distinctTrash.data)), false);
  assert.equal(
    isTrashRestoreDuplicate(exactTrash, { general: [], detailed: [], transit: [activeT] }),
    true,
  );
  assert.equal(
    isTrashRestoreDuplicate(distinctTrash, { general: [], detailed: [], transit: [activeT] }),
    false,
  );
});
