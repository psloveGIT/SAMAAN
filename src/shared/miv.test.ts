import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMivHeaderAutoFill,
  buildMivLineRemark,
  computeMivStockDeduction,
  generateMivDocumentNo,
  paginateMivRows,
  resolveContractorAbbreviation,
  sanitizeNumericQtyInput,
} from './miv.ts';
import type { DetailedComputed, DocumentLineItem } from './types.ts';

test('resolveContractorAbbreviation covers all 15 exact MD1EX-FQP02/05-03 contractor rules', () => {
  assert.equal(resolveContractorAbbreviation('نصب نیرو نصب'), 'NNE');
  assert.equal(resolveContractorAbbreviation('اکسین صنعت'), 'OXN');
  assert.equal(resolveContractorAbbreviation('اعلا نیرو'), 'ALA');
  assert.equal(resolveContractorAbbreviation('ایران ترانسفورمر'), 'IRT');
  assert.equal(resolveContractorAbbreviation('بهره بردار'), 'OM');
  assert.equal(resolveContractorAbbreviation('بهره‌بردار'), 'OM');
  assert.equal(resolveContractorAbbreviation('بهرهبردار'), 'OM');
  assert.equal(resolveContractorAbbreviation('پالا سازه انرژی'), 'PSE');
  assert.equal(resolveContractorAbbreviation('خواجوی'), 'KHJ');
  assert.equal(resolveContractorAbbreviation('توگا'), 'TU');
  assert.equal(resolveContractorAbbreviation('حریق بان'), 'HABA');
  assert.equal(resolveContractorAbbreviation('فابکو'), 'FAB');
  assert.equal(resolveContractorAbbreviation('مکو'), 'MECO');
  assert.equal(resolveContractorAbbreviation('کارفرما'), 'MD1');
  assert.equal(resolveContractorAbbreviation('مپنا'), 'MD1');
  assert.equal(resolveContractorAbbreviation('مهام شرق'), 'MAHAM');
  assert.equal(resolveContractorAbbreviation('صبن نیرو ساختمان'), 'NNC');
  assert.equal(resolveContractorAbbreviation('صبا نیرو ساختمان'), 'NNC');
});

test('resolveContractorAbbreviation derives deterministic 2-5 letter fallback for unknown suppliers', () => {
  const s1 = resolveContractorAbbreviation('Siemens Energy');
  assert.match(s1, /^[A-Z]{2,5}$/);
  const s2 = resolveContractorAbbreviation('شرکت فراب پارس');
  assert.match(s2, /^[A-Z]{2,5}$/);
  const s3 = resolveContractorAbbreviation('ABB');
  assert.equal(s3, 'ABB');
});

test('generateMivDocumentNo formats <PLANT>-<CONTRACTOR>-MIV-#### and increments cleanly', () => {
  const first = generateMivDocumentNo('نصب نیرو نصب', [], {
    plantAbbreviation: 'NK',
    usePlantAbbreviationInDocs: true,
    plantAbbreviationPosition: 'prefix',
  });
  assert.equal(first, 'NK-NNE-MIV-0001');

  const second = generateMivDocumentNo(
    'نصب نیرو نصب',
    ['NK-NNE-MIV-0001', 'NK-OXN-MIV-0009'],
    { plantAbbreviation: 'NK', usePlantAbbreviationInDocs: true },
  );
  assert.equal(second, 'NK-NNE-MIV-0002');

  const noPlant = generateMivDocumentNo('فابکو', ['FAB-MIV-0003'], null);
  assert.equal(noPlant, 'FAB-MIV-0004');
});

test('buildMivLineRemark stacks MIV user remark underneath existing equipment notes', () => {
  assert.equal(buildMivLineRemark('توضیح تجهیز خط ۱', 'توضیح حواله'), 'توضیح تجهیز خط ۱\nتوضیح حواله');
  assert.equal(buildMivLineRemark('خط ۱\nخط ۲', 'یادداشت جدید'), 'خط ۱\nخط ۲\nیادداشت جدید');
  assert.equal(buildMivLineRemark('', 'فقط توضیح حواله'), 'فقط توضیح حواله');
  assert.equal(buildMivLineRemark('فقط توضیح تجهیز', ''), 'فقط توضیح تجهیز');
  // Avoid duplicating if already merged
  assert.equal(buildMivLineRemark('توضیح تجهیز', 'توضیح تجهیز'), 'توضیح تجهیز');
});

test('computeMivStockDeduction enforces combined Employer + Contractor stock cap', () => {
  const okSingleEmp = computeMivStockDeduction(3, 5, 0);
  assert.equal(okSingleEmp.valid, true);
  assert.equal(okSingleEmp.deductedFromMapna, 3);
  assert.equal(okSingleEmp.deductedFromContractor, 0);

  const okMixedSpill = computeMivStockDeduction(7, 5, 4, 'contractor');
  assert.equal(okMixedSpill.valid, true);
  assert.equal(okMixedSpill.deductedFromContractor, 4);
  assert.equal(okMixedSpill.deductedFromMapna, 3);

  const okMixedEmpFirst = computeMivStockDeduction(7, 5, 4, 'employer');
  assert.equal(okMixedEmpFirst.valid, true);
  assert.equal(okMixedEmpFirst.deductedFromMapna, 5);
  assert.equal(okMixedEmpFirst.deductedFromContractor, 2);

  const tooHigh = computeMivStockDeduction(10, 5, 4);
  assert.equal(tooHigh.valid, false);
  assert.equal(tooHigh.totalAvailable, 9);
});

test('sanitizeNumericQtyInput allows only numbers and a single decimal point', () => {
  assert.equal(sanitizeNumericQtyInput('۱۲۳'), '123');
  assert.equal(sanitizeNumericQtyInput('12abc.5xyz'), '12.5');
  assert.equal(sanitizeNumericQtyInput('۴.۵.۶'), '4.56');
  assert.equal(sanitizeNumericQtyInput('متن'), '');
});

test('buildMivHeaderAutoFill maps exact fields per 1-1, 1-3, 1-5, 1-6, 1-7, 1-8', () => {
  const sample = [
    {
      id: 'd1',
      receiver: 'نصب نیرو نصب',
      system: 'GT',
      island: 'Power',
      unit: '1',
      gcvReceiptNo: 'GCV-001',
    } as DetailedComputed,
  ];
  const filled = buildMivHeaderAutoFill(sample, { name: 'نکا', contractRef: 'CNT-1404-01' });
  assert.equal(filled.projectName, 'نکا');
  assert.equal(filled.contractNo, 'CNT-1404-01');
  assert.equal(filled.party, 'نصب نیرو نصب');
  assert.equal(filled.islandSystem, 'GT/Power');
  assert.equal(filled.unit, '1');
  assert.equal(filled.receiptNo, 'GCV-001');

  const emptyContract = buildMivHeaderAutoFill(sample, { name: 'نکا' });
  assert.equal(emptyContract.contractNo, '');

  // Receiver-only rule: supplier must NOT override missing receiver
  const supplierOnly = [
    {
      id: 'd2',
      supplier: 'توگا',
      receiver: '',
      mivReceiver: '',
      system: 'GT',
      island: 'Power',
      unit: '1',
    } as DetailedComputed,
  ];
  const noReceiverFill = buildMivHeaderAutoFill(supplierOnly, { name: 'نکا' });
  assert.equal(noReceiverFill.party, '');
  assert.equal(noReceiverFill.contractorForDocNo, '');

  // Short ASCII patterns must not falsely match inside unrelated words
  assert.notEqual(resolveContractorAbbreviation('Turbo Compressor Co'), 'TU');
  assert.notEqual(resolveContractorAbbreviation('Alstom Power'), 'ALA');
  assert.notEqual(resolveContractorAbbreviation('Komatsu Heavy'), 'OM');
  assert.equal(resolveContractorAbbreviation('TU'), 'TU');
  assert.equal(resolveContractorAbbreviation('OM'), 'OM');
});

test('paginateMivRows splits long item lists into numbered A4 pages', () => {
  const makeItem = (i: number, desc = 'Turbine Valve'): DocumentLineItem => ({
    detailedId: `id-${i}`,
    shipmentNo: `PK-${i}`,
    packageNo: `PKG-${i}`,
    itemNo: String(i),
    description: desc,
    qty: 1,
  });

  const single = paginateMivRows([makeItem(1), makeItem(2)]);
  assert.equal(single.length, 1);
  assert.equal(single[0].pageNumber, 1);
  assert.equal(single[0].totalPages, 1);
  assert.equal(single[0].rows.length, 9);

  const many = paginateMivRows(Array.from({ length: 14 }, (_, i) => makeItem(i + 1)));
  assert.equal(many.length, 2);
  assert.equal(many[0].pageNumber, 1);
  assert.equal(many[0].totalPages, 2);
  assert.equal(many[1].pageNumber, 2);
  assert.equal(many[1].totalPages, 2);
  assert.equal(many[1].startIndex, many[0].rows.filter(Boolean).length);
});
