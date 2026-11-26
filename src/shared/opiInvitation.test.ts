import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpiInvitationHeaderAutoFill,
  buildOpiInvitationLineItems,
  computeOpenOpiInvitations,
  filterEligibleGeneralForOpi,
  formatHeaderProjectTitle,
  generateOpiInvitationNo,
  stripProjectWord,
} from './opiInvitation.ts';
import type { GeneralEntry } from './types.ts';

function makeGeneralRow(overrides: Partial<GeneralEntry> = {}): GeneralEntry {
  return {
    id: overrides.id || 'g-1',
    rowNo: '1',
    arrivalDate: '2026-05-01',
    supplier: 'توگا',
    dispatchLocation: 'تهران',
    releaseNo: 'RN-1',
    releaseDate: '2026-05-01',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: 'AN-1',
    packingListNo: 'PK-100',
    packageNo: 'PKG-01',
    packageType: 'صندوق چوبی',
    purchasePackageNo: 'PO-44',
    itemCount: 5,
    itemDescription: 'پره توربین گاز',
    island: 'Power',
    system: 'GT',
    subSystem: 'Rotor',
    unit: '1',
    grossWeight: 1000,
    netWeight: 900,
    lengthCm: 100,
    widthCm: 80,
    heightCm: 70,
    billOfLadingNo: '',
    vehicleNo: '',
    weighbridgeWeight: null,
    freightCost: null,
    opiInvitationNo: '',
    opiInvitationDate: '',
    driverName: '',
    createdAt: '',
    updatedAt: '',
    createdBy: 'admin',
    ...overrides,
  };
}

test('stripProjectWord and formatHeaderProjectTitle handle Rules 1-1 and 1-5 accurately', () => {
  assert.equal(stripProjectWord('پروژه نکا'), 'نکا');
  assert.equal(stripProjectWord('نیروگاه نکا'), 'نیروگاه نکا');
  assert.equal(stripProjectWord('Project Neka'), 'Neka');
  assert.equal(formatHeaderProjectTitle('پروژه نکا'), 'پروژه نکا');
  assert.equal(formatHeaderProjectTitle('نیروگاه نکا'), 'پروژه نیروگاه نکا');
  assert.equal(formatHeaderProjectTitle(''), 'پروژه ..................');
});

test('generateOpiInvitationNo implements Rule 1-4 for TUGA, MECO, PARS, and other suppliers', () => {
  const cfg = { plantAbbreviation: 'NK', usePlantAbbreviationInDocs: true, plantAbbreviationPosition: 'prefix' as const };
  assert.equal(generateOpiInvitationNo('توگا', [], cfg), 'NK-TU-0001');
  assert.equal(generateOpiInvitationNo('TUGA', ['NK-TU-0001'], cfg), 'NK-TU-0002');
  assert.equal(generateOpiInvitationNo('MECO', [], cfg), 'NK-ME-0001');
  assert.equal(generateOpiInvitationNo('مکو', ['NK-ME-0001', 'NK-ME-0002'], cfg), 'NK-ME-0003');
  assert.equal(generateOpiInvitationNo('پارس', [], cfg), 'NK-PS-0001');
  assert.equal(generateOpiInvitationNo('PARS', ['NK-PS-0004'], cfg), 'NK-PS-0005');

  // Other supplier gets 2-letter fallback prefix
  const siemens = generateOpiInvitationNo('Siemens Energy', [], cfg);
  assert.match(siemens, /^NK-[A-Z]{2}-0001$/);

  // Without plant abbreviation
  assert.equal(generateOpiInvitationNo('TUGA', [], null), 'TU-0001');
});

test('buildOpiInvitationHeaderAutoFill & buildOpiInvitationLineItems map Rules 1-1 through 1-17', () => {
  const rows = [
    makeGeneralRow({
      id: 'g1',
      packingListNo: 'PK-100',
      packageNo: 'PKG-01',
      itemDescription: 'پره توربین',
      packageType: 'جعبه چوبی',
      purchasePackageNo: 'PO-701',
      system: 'GT',
      island: 'Power',
      unit: '1',
      supplier: 'توگا',
    }),
    makeGeneralRow({
      id: 'g2',
      packingListNo: 'PK-100',
      packageNo: 'PKG-02',
      itemDescription: 'شیر سوخت',
      packageType: 'پالت فلزی',
      purchasePackageNo: 'PO-701',
      system: 'GT',
      island: 'Power',
      unit: '1',
      supplier: 'توگا',
    }),
  ];

  const hdr = buildOpiInvitationHeaderAutoFill(rows, {
    name: 'پروژه نکا',
    contractRef: 'CNT-1404-NK',
  });
  assert.equal(hdr.headerProjectTitle, 'پروژه نکا');
  assert.equal(hdr.projectBareName, 'نکا');
  assert.equal(hdr.contractNo, 'CNT-1404-NK');
  assert.equal(hdr.system, 'GT');
  assert.equal(hdr.island, 'Power');
  assert.equal(hdr.unit, '1');
  assert.equal(hdr.supplier, 'توگا');
  assert.equal(hdr.purchasePackageNo, 'PO-701');

  // Blank contractRef stays blank (Rule 1-3)
  const hdrNoContract = buildOpiInvitationHeaderAutoFill(rows, { name: 'نکا', contractRef: '' });
  assert.equal(hdrNoContract.contractNo, '');

  const items = buildOpiInvitationLineItems(rows, { g1: 'نیاز به جرثقیل', g2: '' });
  assert.equal(items.length, 2);
  assert.equal(items[0].itemNo, '1');
  assert.equal(items[0].packingListNo, 'PK-100');
  assert.equal(items[0].packageNo, 'PKG-01');
  assert.equal(items[0].description, 'پره توربین');
  assert.equal(items[0].uom, 'جعبه چوبی');
  assert.equal(items[0].remarks, 'نیاز به جرثقیل');
  assert.equal(items[1].itemNo, '2');
  assert.equal(items[1].uom, 'پالت فلزی');
  assert.equal(items[1].remarks, '');
});

test('filterEligibleGeneralForOpi includes only rows without opiInvitationNo unless editing', () => {
  const rows = [
    makeGeneralRow({ id: 'g1', opiInvitationNo: '' }),
    makeGeneralRow({ id: 'g2', opiInvitationNo: 'NK-TU-0001' }),
    makeGeneralRow({ id: 'g3', opiInvitationNo: 'NK-ME-0001' }),
  ];
  assert.deepEqual(
    filterEligibleGeneralForOpi(rows).map((r) => r.id),
    ['g1'],
  );
  assert.deepEqual(
    filterEligibleGeneralForOpi(rows, 'NK-TU-0001').map((r) => r.id),
    ['g1', 'g2'],
  );
});

test('computeOpenOpiInvitations implements Dashboard Note (تبصره) accurately', () => {
  const general = [
    // PK-100: invitation issued, ZERO detailed rows -> OPEN
    { packingListNo: 'PK-100', opiInvitationNo: 'NK-TU-0001', opiInvitationDate: '2026-05-10' },
    // PK-200: invitation issued, 2 detailed rows, only 1 has opiNo -> OPEN
    { packingListNo: 'PK-200', opiInvitationNo: 'NK-ME-0001', opiInvitationDate: '2026-05-11' },
    // PK-300: invitation issued, ALL detailed rows have opiNo -> CLOSED (not in open list)
    { packingListNo: 'PK-300', opiInvitationNo: 'NK-PS-0001', opiInvitationDate: '2026-05-12' },
    // PK-400: no invitation -> ignored
    { packingListNo: 'PK-400', opiInvitationNo: '', opiInvitationDate: '' },
  ];

  const detailed = [
    { shipmentNo: 'PK-200', opiNo: 'NK-ME-0001' },
    { shipmentNo: 'PK-200', opiNo: '' },
    { shipmentNo: 'PK-300', opiNo: 'NK-PS-0001' },
    { shipmentNo: 'PK-300', opiNo: 'NK-PS-0001' },
  ];

  const open = computeOpenOpiInvitations(general, detailed);
  assert.equal(open.length, 2);
  assert.equal(open[0].invitationNo, 'NK-ME-0001');
  assert.equal(open[0].date, '2026-05-11');
  assert.equal(open[0].totalDetailedRows, 2);
  assert.equal(open[0].linkedDetailedRows, 1);

  assert.equal(open[1].invitationNo, 'NK-TU-0001');
  assert.equal(open[1].date, '2026-05-10');
  assert.equal(open[1].totalDetailedRows, 0);
  assert.equal(open[1].linkedDetailedRows, 0);
});
