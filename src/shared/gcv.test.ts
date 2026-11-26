import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGcvHeaderAutoFill,
  buildGcvLineItems,
  combineGcvRemark,
  filterEligibleDetailedForGcv,
  formatIslandSystemPairs,
  generateGcvReceiptNo,
  resolveGcvQuantities,
} from './gcv.ts';

test('filterEligibleDetailedForGcv excludes rows that already have a GCV receipt no except when editing', () => {
  const rows = [
    { id: '1', gcvReceiptNo: '' },
    { id: '2', gcvReceiptNo: 'NK-GCV-0001' },
    { id: '3', gcvReceiptNo: 'NK-GCV-0002' },
  ];
  assert.deepEqual(
    filterEligibleDetailedForGcv(rows).map((r) => r.id),
    ['1'],
  );
  assert.deepEqual(
    filterEligibleDetailedForGcv(rows, 'nk-gcv-0001').map((r) => r.id),
    ['1', '2'],
  );
});

test('buildGcvHeaderAutoFill formats project title, supplier, releaseNoteNo, island/system, and waybillNo', () => {
  const header = buildGcvHeaderAutoFill(
    [
      {
        shipmentNo: 'PK-501',
        packageNo: '1',
        supplier: 'TUGA',
        island: 'توربین',
        system: 'Lube Oil',
      },
      {
        shipmentNo: 'PK-501',
        packageNo: '2',
        supplier: 'TUGA',
        island: 'بویلر',
        system: 'Steam',
      },
    ],
    [
      {
        packingListNo: 'PK-501',
        packageNo: '1',
        releaseNo: 'RN-900',
        billOfLadingNo: 'BL-7712',
        supplier: 'TUGA',
      },
      {
        packingListNo: 'PK-501',
        packageNo: '2',
        releaseNo: 'RN-901',
        billOfLadingNo: 'BL-7712',
        supplier: 'TUGA',
      },
    ],
    { name: 'پروژه نکا' },
  );

  assert.equal(header.headerProjectTitle, 'پروژه نکا');
  assert.equal(header.supplier, 'TUGA');
  assert.equal(header.releaseNoteNo, 'RN-900 ، RN-901');
  assert.equal(header.islandSystem, 'توربین/Lube Oil ، بویلر/Steam');
  assert.equal(header.waybillNo, 'BL-7712');
});

test('combineGcvRemark stacks equipment notes on top of user remark without duplicates', () => {
  assert.equal(combineGcvRemark('توضیح تجهیز', 'مصرف فوری در واحد یک'), 'توضیح تجهیز\nمصرف فوری در واحد یک');
  assert.equal(combineGcvRemark('', 'فقط توضیح کاربر'), 'فقط توضیح کاربر');
  assert.equal(combineGcvRemark('فقط توضیح تجهیز', ''), 'فقط توضیح تجهیز');
  assert.equal(combineGcvRemark('یکسان', 'یکسان'), 'یکسان');
});

test('buildGcvLineItems follows exact MD1EX-FQP02/11-03 column mappings (Rules 1-12..1-20)', () => {
  const lines = buildGcvLineItems(
    [
      {
        id: 'd1',
        shipmentNo: 'PK-99',
        packageNo: 'PKG-04',
        itemNo: '12',
        description: 'GATE VALVE DN50',
        generalDescription: 'Valve',
        size: 'DN50 PN16',
        countingUnit: 'عدد',
        packingQty: 10,
        actualQty: 8,
        notes: 'توضیح فنی تجهیز',
      },
    ],
    { d1: 'تحویل مستقیم به خط نصب' },
  );

  assert.equal(lines.length, 1);
  assert.equal(lines[0].shipmentNo, 'PK-99'); // 1-12 PL/Package No.
  assert.equal(lines[0].packageNo, 'PKG-04'); // 1-13 Package Item
  assert.equal(lines[0].description, 'GATE VALVE DN50'); // 1-14 Description
  assert.equal(lines[0].technicalInfo, 'DN50 PN16'); // 1-15 Technical info/Size
  assert.equal(lines[0].tagNo, '12'); // 1-16 Tag No. = Detailed itemNo
  assert.equal(lines[0].uom, 'عدد'); // 1-17 UOM
  assert.equal(lines[0].qty, 8); // 1-18 Quantity = actualQty
  assert.equal(lines[0].remark, 'توضیح فنی تجهیز\nتحویل مستقیم به خط نصب'); // 1-20 Remark stacked
  assert.deepEqual(resolveGcvQuantities({ packingQty: 10, actualQty: 8 }), {
    formQty: 8,
    syncDeliveredQty: 10,
  });
});

test('formatIslandSystemPairs and generateGcvReceiptNo avoid duplicates and respect plant code', () => {
  assert.equal(
    formatIslandSystemPairs([
      { island: 'GT', system: 'Fuel' },
      { island: 'GT', system: 'Fuel' },
    ]),
    'GT/Fuel',
  );

  const nextNo = generateGcvReceiptNo(['NK-GCV-0001', 'NK-GCV-0002'], {
    plantAbbreviation: 'NK',
    usePlantAbbreviationInDocs: true,
    plantAbbreviationPosition: 'prefix',
  });
  assert.equal(nextNo, 'NK-GCV-0003');
});
