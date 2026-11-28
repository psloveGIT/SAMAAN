import test from 'node:test';
import assert from 'node:assert/strict';
import type { GeneralEntry } from './types.ts';
import {
  buildSiteEntryHeaderAutoFill,
  buildSiteEntryLineItems,
  formatSiteEntryDimensions,
  generateSiteEntryMinutesNo,
  hasSiteEntryMinutes,
  MD1_SITE_ENTRY_FORM_CODE,
} from './siteEntryMinutes.ts';

function makeGeneral(overrides: Partial<GeneralEntry> = {}): GeneralEntry {
  return {
    id: 'gen-1',
    rowNo: '1',
    arrivalDate: '2026-05-20',
    releaseNo: 'RN-405',
    releaseDate: '2026-05-20',
    supplier: 'توگا',
    requester: 'پیمانکار نصب نکا',
    dispatchLocation: 'تهران',
    employerEntryMinutesNo: '',
    mapnaEntryMinutesNo: '',
    packingListNo: 'PL-900',
    packageNo: '1',
    packageType: 'صندوق چوبی',
    packageCount: 3,
    purchasePackageNo: 'PP-77',
    itemCount: 5,
    itemDescription: 'پمپ تغذیه بویلر',
    island: 'توربین',
    system: 'سیستم خنک‌کاری',
    subSystem: 'پمپ‌ها',
    unit: 'واحد ۱',
    grossWeight: 1450,
    netWeight: 1200,
    lengthCm: 2.4,
    widthCm: 1.5,
    heightCm: 1.8,
    billOfLadingNo: 'WB-55123',
    vehicleModel: 'کفی تریلی',
    vehicleNo: '14ع985-60',
    weighbridgeWeight: 1480,
    freightCost: 25000000,
    opiInvitationNo: '',
    opiInvitationDate: '',
    driverName: 'علی رضایی',
    createdAt: '2026-05-20T08:00:00.000Z',
    updatedAt: '2026-05-20T08:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

test('buildSiteEntryHeaderAutoFill maps all MD1EX-FQP02/15-01 header rules 1-1..1-12', () => {
  const row = makeGeneral();
  const header = buildSiteEntryHeaderAutoFill([row], { name: 'نیروگاه نکا', code: 'C-1405-01' });

  assert.equal(MD1_SITE_ENTRY_FORM_CODE, 'MD1EX-FQP02/15-01');
  assert.equal(header.headerProjectTitle, 'پروژه نیروگاه نکا');
  assert.equal(header.arrivalDate, '2026-05-20');
  assert.equal(header.requester, 'پیمانکار نصب نکا');
  assert.equal(header.contractNo, 'C-1405-01');
  assert.equal(header.system, 'سیستم خنک‌کاری');
  assert.equal(header.island, 'توربین');
  assert.equal(header.unit, 'واحد ۱');
  assert.equal(header.vehicleModel, 'کفی تریلی');
  assert.equal(header.vehicleNo, '14ع985-60');
  assert.equal(header.waybillNo, 'WB-55123');
  assert.equal(header.driverName, 'علی رضایی');
  assert.deepEqual(header.generalIds, ['gen-1']);
});

test('buildSiteEntryHeaderAutoFill falls back requester to supplier and keeps blank contractNo when omitted', () => {
  const row = makeGeneral({ requester: '' });
  const header = buildSiteEntryHeaderAutoFill([row], { name: 'نکا', code: '' });
  assert.equal(header.requester, 'توگا');
  assert.equal(header.contractNo, '');
});

test('buildSiteEntryLineItems formats dimensions, packageCount, weights, and per-row remarks', () => {
  const row1 = makeGeneral({ id: 'g1', packageCount: 4 });
  const row2 = makeGeneral({
    id: 'g2',
    packageNo: '2',
    packageCount: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    netWeight: null,
    grossWeight: 800,
  });

  const items = buildSiteEntryLineItems([row1, row2], { g1: 'سالم و پلمپ' });
  assert.equal(items.length, 2);
  assert.equal(items[0].dimensions, '2.4 × 1.5 × 1.8');
  assert.equal(items[0].qty, '4');
  assert.equal(items[0].unit, 'صندوق چوبی');
  assert.equal(items[0].netWeight, '1200');
  assert.equal(items[0].grossWeight, '1450');
  assert.equal(items[0].remarks, 'سالم و پلمپ');

  assert.equal(items[1].dimensions, '');
  assert.equal(items[1].qty, '1');
  assert.equal(items[1].netWeight, '');
  assert.equal(items[1].grossWeight, '800');
  assert.equal(items[1].remarks, '');
});

test('formatSiteEntryDimensions handles partial dimensions gracefully', () => {
  assert.equal(formatSiteEntryDimensions({ lengthCm: 3, widthCm: 2, heightCm: null }), '3 × 2');
});

test('generateSiteEntryMinutesNo starts at 0001 and respects plant abbreviation', () => {
  const proj = {
    plantAbbreviation: 'NK',
    usePlantAbbreviationInDocs: true,
    plantAbbreviationPosition: 'prefix' as const,
  };
  assert.equal(generateSiteEntryMinutesNo([], proj), 'NK-SE-0001');
  assert.equal(generateSiteEntryMinutesNo(['NK-SE-0001', 'NK-SE-0002'], proj), 'NK-SE-0003');
  assert.equal(hasSiteEntryMinutes({ mapnaEntryMinutesNo: '' }), false);
  assert.equal(hasSiteEntryMinutes({ mapnaEntryMinutesNo: 'NK-SE-0001' }), true);
});
