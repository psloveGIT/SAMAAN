import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDetailedEntry, getExpiringChemicals } from './formulas.ts';
import type { DetailedEntry } from './types.ts';

function makeChemEntry(overrides: Partial<DetailedEntry>): DetailedEntry {
  return {
    id: overrides.id || 'c1',
    rowNo: '1',
    arrivalDate: '2026-01-01',
    supplier: 'ChemCo',
    origin: 'IR',
    shipmentNo: 'PK-100',
    packageNo: 'BOX-1',
    itemNo: '1',
    generalDescription: 'Chemical Compound',
    description: 'Epoxy Hardener Type-B 20L Drum',
    size: '20L',
    itemCode: 'CH-01',
    packingQty: 10,
    actualQty: 10,
    damagedQty: 0,
    mtoRef: '',
    repNo: '',
    repStatus: '',
    repDescription: '',
    countingUnit: 'عدد',
    island: 'BOP',
    system: 'CW',
    subSystem: '',
    unit: '1',
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
    gcvDeliveredQty: 0,
    mivContractorNo: '',
    mivContractorDate: '',
    mivContractorQty: 0,
    smrContractorNo: '',
    smrContractorDate: '',
    smrContractorQty: 0,
    smrContractorNote: '',
    smrMapnaNo: '',
    smrMapnaDate: '',
    smrMapnaQty: 0,
    smrMapnaNote: '',
    mivMapnaNo: '',
    mivMapnaDate: '',
    mivMapnaQty: 0,
    stocktakeInfo: '',
    stocktakeStatus: '',
    stocktakeDate: '',
    itemCategory: 'chemicals',
    chemicalType: 'Epoxy',
    productionDate: '2025-01-01',
    expirationDate: '2026-05-01',
    shortageBackfills: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'tester',
    ...overrides,
  };
}

describe('getExpiringChemicals (in-stock only & expired vs near-expiry)', () => {
  const today = '2026-05-15';

  it('excludes chemicals with zero stock in both Employer and Contractor warehouses', () => {
    const consumedChem = makeChemEntry({
      id: 'consumed',
      actualQty: 10,
      gcvDeliveredQty: 10,
      mivContractorQty: 10,
      expirationDate: '2026-05-01',
    });
    const computed = computeDetailedEntry(consumedChem);
    assert.equal(computed.mapnaInventory, 0);
    assert.equal(computed.contractorInventory, 0);

    const alerts = getExpiringChemicals([consumedChem], 30, today);
    assert.equal(alerts.length, 0);
  });

  it('includes in-stock expired and near-expiry chemicals with distinct isExpired flags and primary description', () => {
    const expiredInEmployer = makeChemEntry({
      id: 'exp-1',
      description: 'Expired Catalyst Drum',
      actualQty: 5,
      expirationDate: '2026-05-05', // 10 days ago
    });
    const expiringInContractor = makeChemEntry({
      id: 'soon-1',
      description: 'Near-Expiry Grease Cartridge',
      actualQty: 4,
      gcvDeliveredQty: 4,
      mivContractorQty: 2, // contractorInventory = 2
      expirationDate: '2026-05-25', // 10 days remaining
    });
    const healthyFuture = makeChemEntry({
      id: 'ok-1',
      description: 'Fresh Lubricant',
      actualQty: 6,
      expirationDate: '2026-12-01',
    });

    const alerts = getExpiringChemicals([healthyFuture, expiringInContractor, expiredInEmployer], 30, today);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].id, 'exp-1');
    assert.equal(alerts[0].isExpired, true);
    assert.equal(alerts[0].description, 'Expired Catalyst Drum');
    assert.equal(alerts[0].mapnaInventory, 5);

    assert.equal(alerts[1].id, 'soon-1');
    assert.equal(alerts[1].isExpired, false);
    assert.equal(alerts[1].description, 'Near-Expiry Grease Cartridge');
    assert.equal(alerts[1].contractorInventory, 2);
  });
});
