import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSmrHeaderAutoFill,
  buildSmrLineItem,
  generateSmrDocNo,
  getSmrMaxReturnQty,
  MD1_SMR_FORM_CODE,
  resolveSmrRowReason,
  validateSmrReturnQty,
} from './smr.ts';

test('generateSmrDocNo applies all contractor abbreviation rules and increments from 0001', () => {
  assert.equal(MD1_SMR_FORM_CODE, 'MD1EX-FQP02/08-03');
  const proj = {
    plantAbbreviation: 'NK',
    usePlantAbbreviationInDocs: true,
    plantAbbreviationPosition: 'prefix' as const,
  };
  assert.equal(generateSmrDocNo('نصب نیرو نصب', [], proj), 'NK-NNE-SMR-0001');
  assert.equal(generateSmrDocNo('نصب نیرو نصب', ['NK-NNE-SMR-0001'], proj), 'NK-NNE-SMR-0002');
  assert.equal(generateSmrDocNo('اکسین صنعت', [], proj), 'NK-OXN-SMR-0001');
  assert.equal(generateSmrDocNo('اعلا نیرو', [], proj), 'NK-ALA-SMR-0001');
  assert.equal(generateSmrDocNo('ایران ترانسفورمر', [], proj), 'NK-IRT-SMR-0001');
  assert.equal(generateSmrDocNo('بهره بردار', [], proj), 'NK-OM-SMR-0001');
  assert.equal(generateSmrDocNo('پالا سازه انرژی', [], proj), 'NK-PSE-SMR-0001');
  assert.equal(generateSmrDocNo('خواجوی', [], proj), 'NK-KHJ-SMR-0001');
  assert.equal(generateSmrDocNo('توگا', [], proj), 'NK-TU-SMR-0001');
  assert.equal(generateSmrDocNo('حریق بان', [], proj), 'NK-HABA-SMR-0001');
  assert.equal(generateSmrDocNo('فابکو', [], proj), 'NK-FAB-SMR-0001');
  assert.equal(generateSmrDocNo('مکو', [], proj), 'NK-MECO-SMR-0001');
  assert.equal(generateSmrDocNo('مپنا توسعه یک', [], proj), 'NK-MD1-SMR-0001');
  assert.equal(generateSmrDocNo('مهام شرق', [], proj), 'NK-MAHAM-SMR-0001');
  assert.equal(generateSmrDocNo('صبن نیرو ساختمان', [], proj), 'NK-NNC-SMR-0001');
  assert.equal(generateSmrDocNo('نصب نیرو نصب', [], null), 'NNE-SMR-0001');
});

test('buildSmrHeaderAutoFill populates supplier, purchasePackageNo, island, installer, releaseNoteNo, and date', () => {
  const header = buildSmrHeaderAutoFill(
    [
      {
        shipmentNo: 'PL-100',
        packageNo: '2',
        supplier: 'fallback-sup',
        island: 'fallback-island',
        receiver: 'شرکت نصب نیرو',
      },
    ],
    [
      {
        packingListNo: 'PL-100',
        packageNo: '2',
        supplier: 'توگا',
        purchasePackageNo: 'PP-220',
        island: 'توربین',
        releaseNo: 'RN-7788',
      },
    ],
    { name: 'نکا' },
    '2026-06-07',
  );

  assert.equal(header.headerProjectTitle, 'پروژه نکا');
  assert.equal(header.supplier, 'توگا');
  assert.equal(header.purchasePackageNo, 'PP-220');
  assert.equal(header.island, 'توربین');
  assert.equal(header.installerContractor, 'شرکت نصب نیرو');
  assert.equal(header.releaseNoteNo, 'RN-7788');
  assert.equal(header.date, '2026-06-07');
});

test('validateSmrReturnQty enforces 0 < qty <= actualQty (fallback packingQty)', () => {
  const row = {
    shipmentNo: 'PL-1',
    packageNo: '1',
    itemNo: '3',
    actualQty: 10,
    packingQty: 12,
  };
  assert.equal(getSmrMaxReturnQty(row), 10);
  assert.equal(validateSmrReturnQty(5, row).ok, true);
  assert.equal(validateSmrReturnQty(10, row).ok, true);
  assert.equal(validateSmrReturnQty(11, row).ok, false);
  assert.equal(validateSmrReturnQty(0, row).ok, false);

  const nullActualRow = { ...row, actualQty: null };
  assert.equal(getSmrMaxReturnQty(nullActualRow), 12);
  assert.equal(validateSmrReturnQty(12, nullActualRow).ok, true);
  assert.equal(validateSmrReturnQty(13, nullActualRow).ok, false);
});

test('resolveSmrRowReason supports shared and per-row reason modes and buildSmrLineItem sets itemNo & tagNo', () => {
  assert.equal(resolveSmrRowReason('shared', 'مازاد مصرف نصب', { r1: 'دیگر' }, 'r1'), 'مازاد مصرف نصب');
  assert.equal(resolveSmrRowReason('per_row', 'مازاد مصرف نصب', { r1: 'تغییر نقشه' }, 'r1'), 'تغییر نقشه');

  const line = buildSmrLineItem(
    {
      id: 'd1',
      shipmentNo: 'PL-55',
      packageNo: '4',
      itemNo: '7',
      itemCode: 'TAG-901',
      description: 'شیر کنترلی',
      generalDescription: 'شیرآلات',
      countingUnit: 'عدد',
    },
    2,
    'مازاد نصب',
    'تحویل سالم',
  );
  assert.equal(line.itemNo, '7');
  assert.equal(line.tagNo, 'TAG-901');
  assert.equal(line.uom, 'عدد');
  assert.equal(line.qty, 2);
  assert.equal(line.returnReason, 'مازاد نصب');
  assert.equal(line.remark, 'تحویل سالم');
});
