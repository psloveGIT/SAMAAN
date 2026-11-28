import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BMR_STATUS_DEBTOR_FA,
  BMR_STATUS_SETTLED_FA,
  buildBmrHeaderAutoFill,
  buildBmrLineItem,
  computeBmrBalance,
  generateBmrDocNo,
  lookupBmrEstimateQty,
  MD1_BMR_FORM_CODE,
  parseOptionalQtyInput,
  resolveBmrBalanceStatus,
} from './bmr.ts';

test('generateBmrDocNo applies all contractor abbreviation rules and increments from 0001', () => {
  assert.equal(MD1_BMR_FORM_CODE, 'MD1EX-FQP02/09-03');
  const proj = {
    plantAbbreviation: 'NK',
    usePlantAbbreviationInDocs: true,
    plantAbbreviationPosition: 'prefix' as const,
  };
  assert.equal(generateBmrDocNo('نصب نیرو نصب', [], proj), 'NK-NNE-BMR-0001');
  assert.equal(generateBmrDocNo('نصب نیرو نصب', ['NK-NNE-BMR-0001'], proj), 'NK-NNE-BMR-0002');
  assert.equal(generateBmrDocNo('اکسین صنعت', [], proj), 'NK-OXN-BMR-0001');
  assert.equal(generateBmrDocNo('اعلا نیرو', [], proj), 'NK-ALA-BMR-0001');
  assert.equal(generateBmrDocNo('ایران ترانسفورمر', [], proj), 'NK-IRT-BMR-0001');
  assert.equal(generateBmrDocNo('بهره‌بردار', [], proj), 'NK-OM-BMR-0001');
  assert.equal(generateBmrDocNo('پالا سازه انرژی', [], proj), 'NK-PSE-BMR-0001');
  assert.equal(generateBmrDocNo('خواجوی', [], proj), 'NK-KHJ-BMR-0001');
  assert.equal(generateBmrDocNo('توگا', [], proj), 'NK-TU-BMR-0001');
  assert.equal(generateBmrDocNo('حریق بان', [], proj), 'NK-HABA-BMR-0001');
  assert.equal(generateBmrDocNo('فابکو', [], proj), 'NK-FAB-BMR-0001');
  assert.equal(generateBmrDocNo('مکو', [], proj), 'NK-MECO-BMR-0001');
  assert.equal(generateBmrDocNo('مپنا توسعه یک', [], proj), 'NK-MD1-BMR-0001');
  assert.equal(generateBmrDocNo('کارفرما', [], proj), 'NK-MD1-BMR-0001');
  assert.equal(generateBmrDocNo('مهام شرق', [], proj), 'NK-MAHAM-BMR-0001');
  assert.equal(generateBmrDocNo('نصب نیرو ساختمان', [], proj), 'NK-NNC-BMR-0001');
  assert.equal(generateBmrDocNo('نصب نیرو نصب', [], null), 'NNE-BMR-0001');
});

test('computeBmrBalance applies EPC conservation formula and sets اتمام for 0 and بدهکار for non-zero', () => {
  // Primary: Delivered - Returned - Erected
  const settled = computeBmrBalance({ deliveredQty: 10, returnedQty: 2, mtoQty: 8, erectedQty: 8 });
  assert.equal(settled.balance, 0);
  assert.equal(settled.statusFa, BMR_STATUS_SETTLED_FA);
  assert.equal(settled.formulaSource, 'erected');

  // Positive balance (contractor still owes surplus) -> بدهکار
  const surplusOwed = computeBmrBalance({ deliveredQty: 10, returnedQty: 0, mtoQty: 8, erectedQty: 8 });
  assert.equal(surplusOwed.balance, 2);
  assert.equal(surplusOwed.statusFa, BMR_STATUS_DEBTOR_FA);

  // Negative balance (over-erected discrepancy) -> بدهکار
  const overErected = computeBmrBalance({ deliveredQty: 10, returnedQty: 3, mtoQty: 8, erectedQty: 8 });
  assert.equal(overErected.balance, -1);
  assert.equal(overErected.statusFa, BMR_STATUS_DEBTOR_FA);

  // Secondary: Erected blank, MTO provided
  const mtoSettled = computeBmrBalance({ deliveredQty: 12, returnedQty: 2, mtoQty: 10, erectedQty: null });
  assert.equal(mtoSettled.balance, 0);
  assert.equal(mtoSettled.statusFa, BMR_STATUS_SETTLED_FA);
  assert.equal(mtoSettled.formulaSource, 'mto');

  // Tertiary: Both Erected and MTO blank -> Net delivered (Delivered - Returned)
  const netZero = computeBmrBalance({ deliveredQty: 5, returnedQty: 5, mtoQty: null, erectedQty: null });
  assert.equal(netZero.balance, 0);
  assert.equal(netZero.statusFa, BMR_STATUS_SETTLED_FA);
  assert.equal(netZero.formulaSource, 'net_delivered');

  const netPos = computeBmrBalance({ deliveredQty: 5, returnedQty: 1, mtoQty: null, erectedQty: null });
  assert.equal(netPos.balance, 4);
  assert.equal(netPos.statusFa, BMR_STATUS_DEBTOR_FA);

  assert.equal(resolveBmrBalanceStatus(0), 'اتمام');
  assert.equal(resolveBmrBalanceStatus(-0), 'اتمام');
  assert.equal(resolveBmrBalanceStatus(0.5), 'بدهکار');
  assert.equal(resolveBmrBalanceStatus(-2), 'بدهکار');
});

test('buildBmrHeaderAutoFill, lookupBmrEstimateQty, and buildBmrLineItem map rules 1-1..1-19 accurately', () => {
  const header = buildBmrHeaderAutoFill(
    [
      {
        shipmentNo: 'PL-500',
        packageNo: 'PKG-1',
        system: 'روغن‌کاری',
        island: 'توربین گاز',
        unit: 'واحد ۱',
        receiver: 'نصب نیرو نصب',
        supplier: '',
      },
    ],
    [{ packingListNo: 'PL-500', packageNo: 'PKG-1', supplier: 'توگا' }],
    { name: 'نیروگاه نکا' },
    '2026-06-08',
  );
  assert.equal(header.headerProjectTitle, 'پروژه نیروگاه نکا');
  assert.equal(header.system, 'روغن‌کاری');
  assert.equal(header.island, 'توربین گاز');
  assert.equal(header.unit, 'واحد ۱');
  assert.equal(header.installerContractor, 'نصب نیرو نصب');
  assert.equal(header.supplier, 'توگا');
  assert.equal(header.date, '2026-06-08');

  const estimates = [
    { itemCode: 'TAG-101', mtoCode: 'MTO-A', estimatedQty: 6 },
    { itemCode: 'TAG-101', mtoCode: 'MTO-B', estimatedQty: 2 },
  ];
  const lookup = lookupBmrEstimateQty({ itemCode: 'tag-101', mtoRef: '' }, estimates);
  assert.equal(lookup.matchedBy, 'itemCode');
  assert.equal(lookup.mtoQty, 8);

  const line = buildBmrLineItem(
    {
      id: 'd-1',
      shipmentNo: 'PL-500',
      packageNo: 'PKG-1',
      itemNo: '3',
      itemCode: 'TAG-101',
      description: 'شیر ایمنی فشار بالا',
      generalDescription: 'شیرآلات',
      countingUnit: 'EA',
      packingQty: 12,
      actualQty: 10,
      effectiveActualQty: 10,
      smrMapnaQty: 2,
      smrMapnaNo: 'NK-NNE-SMR-0001',
      mtoRef: '',
    },
    estimates,
    { erectedQty: 8 },
  );

  assert.equal(line.plNo, 'PL-500');
  assert.equal(line.packageNo, 'PKG-1');
  assert.equal(line.packageItemNo, '3');
  assert.equal(line.tagNo, 'TAG-101');
  assert.equal(line.receivedQty, 12);
  assert.equal(line.deliveredQty, 10);
  assert.equal(line.returnedQty, 2);
  assert.equal(line.mtoQty, 8);
  assert.equal(line.erectedQty, 8);
  assert.equal(line.balance, 0);
  assert.equal(line.balanceStatus, 'اتمام');

  assert.equal(parseOptionalQtyInput('۱۲.۵'), 12.5);
  assert.equal(parseOptionalQtyInput('  '), null);
});
