import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerLocalWarehouseQuestion,
  classifyItemLocally,
  extractEntitySubjectFromQuestion,
  runLocalWarehouseAnalysis,
  type LocalWarehouseDbSlice,
} from './localAiEngine.ts';
import type { DetailedEntry, GeneralEntry, TransitEntry } from './types.ts';

function buildFixtureDb(): LocalWarehouseDbSlice {
  const general: GeneralEntry[] = [
    {
      id: 'g-1',
      rowNo: '1',
      arrivalDate: '2025-05-01',
      supplier: 'MAPNA Turbine',
      dispatchLocation: 'Karaj',
      packingListNo: 'PL-900',
      packageNo: '1',
      packageType: 'صندوق چوبی',
      itemCount: 2,
      itemDescription: 'Turbine Valve & Oil',
      employerEntryMinutesNo: '',
      mapnaEntryMinutesNo: '',
      releaseNo: '',
      releaseDate: '',
      island: 'GT',
      system: 'LUBE',
      subSystem: 'OIL',
      unit: 'U1',
      grossWeight: 2500,
      netWeight: 2000,
      lengthCm: 200,
      widthCm: 100,
      heightCm: 100,
      billOfLadingNo: 'BL-1',
      vehicleNo: '',
      weighbridgeWeight: null,
      freightCost: 50000000,
      opiInvitationNo: '',
      opiInvitationDate: '',
      driverName: '',
      createdAt: '',
      updatedAt: '',
      createdBy: 'admin',
    },
  ];

  const todayPlusTen = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  const detailed: DetailedEntry[] = [
    {
      id: 'd-1',
      rowNo: '1',
      arrivalDate: '2025-05-01',
      supplier: 'MAPNA Turbine',
      origin: 'Iran',
      shipmentNo: 'PL-900',
      packageNo: '1',
      itemNo: '1',
      generalDescription: 'شیرآلات',
      description: 'Control Valve DN100',
      size: 'DN100',
      itemCode: 'CV-100',
      packingQty: 10,
      actualQty: 7,
      damagedQty: 1,
      mtoRef: '',
      repNo: 'REP-12',
      repStatus: 'باز',
      repDescription: '',
      countingUnit: 'PCs',
      island: 'GT',
      system: 'LUBE',
      subSystem: 'OIL',
      unit: 'U1',
      opiNo: 'OPI-1',
      opiDate: '2025-05-02',
      merNo: 'MER-12',
      merStatus: 'باز',
      notes: '',
      materialBalanceNo: '',
      balanceStatus: '',
      storageLocation: 'WH-A',
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
      smrMapnaNo: '',
      smrMapnaDate: '',
      smrMapnaQty: null,
      smrMapnaNote: '',
      mivMapnaNo: '',
      mivMapnaDate: '',
      mivMapnaQty: null,
      stocktakeInfo: '',
      shortageBackfills: [],
      createdAt: '',
      updatedAt: '',
      createdBy: 'admin',
    },
    {
      id: 'd-2',
      rowNo: '2',
      arrivalDate: '2025-05-01',
      supplier: 'Chemical Co',
      origin: 'Germany',
      shipmentNo: 'PL-900',
      packageNo: '1',
      itemNo: '2',
      generalDescription: 'مواد شیمیایی',
      description: 'Epoxy Primer Paint',
      size: '20L',
      itemCode: 'CH-20',
      packingQty: 5,
      actualQty: 5,
      damagedQty: 0,
      mtoRef: '',
      repNo: '',
      repStatus: '',
      repDescription: '',
      countingUnit: 'L',
      island: 'GT',
      system: 'PAINT',
      subSystem: '',
      unit: 'U1',
      opiNo: '',
      opiDate: '',
      merNo: '',
      merStatus: '',
      notes: '',
      materialBalanceNo: '',
      balanceStatus: '',
      storageLocation: 'CHEM-1',
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
      smrMapnaNo: '',
      smrMapnaDate: '',
      smrMapnaQty: null,
      smrMapnaNote: '',
      mivMapnaNo: '',
      mivMapnaDate: '',
      mivMapnaQty: null,
      stocktakeInfo: '',
      shortageBackfills: [],
      itemCategory: 'chemicals',
      chemicalType: 'رنگ، پرایمر و تینر',
      expirationDate: todayPlusTen,
      createdAt: '',
      updatedAt: '',
      createdBy: 'admin',
    },
  ];

  const transit: TransitEntry[] = [
    {
      id: 't-1',
      rowNo: '1',
      overallStatus: 'در دست ارسال',
      arrivalDate: '',
      inspectionRequest: '',
      mapnaShippingNotice: 'SN-1',
      supplier: 'MAPNA',
      dispatchLocation: 'Karaj',
      packingListNo: 'PL-901',
      packageNo: '1',
      itemDescription: 'Pump Skid',
      system: 'WATER',
      subSystem: '',
      unit: 'U1',
      releaseNetNo: '',
      releaseNetDate: '',
      interimNo: '',
      interimDate: '',
      equipmentSupplyCode: '',
      carrierContractor: '',
      billOfLadingNo: '',
      amount: null,
      createdAt: '',
      updatedAt: '',
      createdBy: 'admin',
    },
  ];

  return { general, detailed, transit };
}

test('runLocalWarehouseAnalysis computes accurate metrics, risk level, and bilingual insights', () => {
  const db = buildFixtureDb();
  const resFa = runLocalWarehouseAnalysis(db, 'fa');
  assert.equal(resFa.metrics.uniquePackings, 1);
  assert.equal(resFa.metrics.shortageItemsCount, 1);
  assert.equal(resFa.metrics.damagedItemsCount, 1);
  assert.equal(resFa.metrics.openMerCount, 1);
  assert.equal(resFa.metrics.openRepCount, 1);
  assert.equal(resFa.metrics.expiringChemicalsCount, 1);
  assert.equal(resFa.metrics.grossWeightTons, 2.5);
  assert.equal(resFa.metrics.netWeightTons, 2);
  assert.equal(resFa.analysis.riskLevel, 'high');
  assert.ok(resFa.analysis.priorityActions.length >= 3);
  assert.ok(resFa.analysis.summary.includes('پکینگ لیست یکتا'));

  const resEn = runLocalWarehouseAnalysis(db, 'en');
  assert.ok(resEn.analysis.summary.includes('unique packing lists'));
  assert.equal(resEn.analysis.followUpSuggestions.length, 3);
});

test('answerLocalWarehouseQuestion answers Persian & English queries across shortages, chemicals, transit, and specific packing search', () => {
  const db = buildFixtureDb();

  const shortageAns = answerLocalWarehouseQuestion(db, 'لیست اقلام دارای کسری و آسیب‌دیدگی را بده', 'fa');
  assert.ok(shortageAns.answer.includes('PL-900'));
  assert.ok(shortageAns.answer.includes('عدد'));

  const chemAns = answerLocalWarehouseQuestion(db, 'Show expiring chemicals', 'en');
  assert.ok(chemAns.answer.includes('Epoxy Primer Paint'));

  const transitAns = answerLocalWarehouseQuestion(db, 'وضعیت تجهیزات در راه چیست؟', 'fa');
  assert.ok(transitAns.answer.includes('در دست ارسال'));

  const lookupAns = answerLocalWarehouseQuestion(db, 'PL-900', 'fa');
  assert.ok(lookupAns.answer.includes('Control Valve DN100'));
});

test('classifyItemLocally infers category, chemicalType, and language-appropriate counting unit', () => {
  const chemFa = classifyItemLocally('Epoxy Primer Paint 20L', '20L', 'CH-1', 'fa');
  assert.equal(chemFa.itemCategory, 'chemicals');
  assert.equal(chemFa.countingUnit, 'لیتر');
  assert.ok(chemFa.chemicalType.length > 0);

  const toolEn = classifyItemLocally('Hydraulic Torque Wrench Set', '1000Nm', 'TL-5', 'en');
  assert.equal(toolEn.itemCategory, 'special_tools');
  assert.equal(toolEn.countingUnit, 'SET');

  const cableFa = classifyItemLocally('Power Cable 3x120 mm2', '120mm2', 'CB-1', 'fa');
  assert.equal(cableFa.countingUnit, 'متر');
});

test('answerLocalWarehouseQuestion accurately answers "موجودی Pipe 8\"" without dumping unrelated island breakdown', () => {
  const db = buildFixtureDb();
  db.detailed.push(
    {
      ...db.detailed[0],
      id: 'd-pipe-8',
      shipmentNo: 'PL-PIPE-88',
      packageNo: 'P-8',
      itemNo: '1',
      generalDescription: 'Pipe',
      description: 'Seamless Carbon Steel Pipe Sch 40',
      size: '8"',
      itemCode: 'PIP-8',
      packingQty: 200,
      actualQty: 200,
      damagedQty: 0,
      countingUnit: 'M',
      gcvDeliveredQty: 45,
      mivContractorQty: 0,
      storageLocation: 'Yard-Pipe-8',
      merNo: '',
      merStatus: '',
      repNo: '',
      repStatus: '',
    },
    {
      ...db.detailed[0],
      id: 'd-pipe-4',
      shipmentNo: 'PL-PIPE-44',
      packageNo: 'P-4',
      itemNo: '1',
      generalDescription: 'Pipe',
      description: 'Seamless Carbon Steel Pipe Sch 40',
      size: '4"',
      itemCode: 'PIP-4',
      packingQty: 50,
      actualQty: 50,
      damagedQty: 0,
      countingUnit: 'M',
      mivContractorQty: 0,
      storageLocation: 'Yard-Pipe-4',
      merNo: '',
      merStatus: '',
      repNo: '',
      repStatus: '',
    },
  );

  // Exact match: Pipe 8" -> Main stock = 155, Contractor stock = 45, Total = 200, location = Yard-Pipe-8
  const pipe8Ans = answerLocalWarehouseQuestion(db, 'موجودی Pipe 8" چقدر است و در کدام انبار است؟', 'fa');
  assert.ok(pipe8Ans.answer.includes('Yard-Pipe-8'), 'Should cite exact storage location of Pipe 8"');
  assert.ok(pipe8Ans.answer.includes('PL-PIPE-88'), 'Should cite packing list of Pipe 8"');
  assert.ok(pipe8Ans.answer.includes('۱۵۵') || pipe8Ans.answer.includes('155'), 'Should report exact Main Stock 155m');
  assert.ok(pipe8Ans.answer.includes('۴۵') || pipe8Ans.answer.includes('45'), 'Should report exact Contractor Stock 45m');
  assert.ok(!pipe8Ans.answer.includes('Yard-Pipe-4'), 'Must NOT mix Pipe 4" into Pipe 8" answer');
  assert.ok(!pipe8Ans.answer.includes('تفکیک اقلام و موجودی بر اساس جزیره'), 'Must NOT dump unrelated island summary');

  // Non-existent Pipe 16" -> honest zero-match + closest Pipe suggestions
  const pipe16Ans = answerLocalWarehouseQuestion(db, 'موجودی Pipe 16"', 'fa');
  assert.ok(pipe16Ans.answer.includes('یافت نشد'), 'Should honestly state Pipe 16" was not found');
  assert.ok(pipe16Ans.answer.includes('PL-PIPE-88') || pipe16Ans.answer.includes('PL-PIPE-44'), 'Should offer closest Pipe suggestions');
});

test('answerLocalWarehouseQuestion handles broad Persian summary, packing, transit, and net/gross weight prompt without false item search', () => {
  const db = buildFixtureDb();
  const prompt = 'خلاصه تعداد پکینگ‌ها، ردیف‌های ثبتی، محموله‌های در راه و وزن خالص/ناخالص کل انبار را گزارش بده.';
  assert.equal(extractEntitySubjectFromQuestion(prompt), '', 'Summary prompt must not extract bogus entity tokens');

  const ans = answerLocalWarehouseQuestion(db, prompt, 'fa');
  assert.ok(!ans.answer.includes('یافت نشد'), 'Must NOT return item-not-found error');
  assert.ok(ans.answer.includes('پکینگ') || ans.answer.includes('وزن'), 'Should return warehouse overview with packings & weights');
  assert.ok(ans.answer.includes('۲') || ans.answer.includes('2.5') || ans.answer.includes('۲.۵'), 'Should include net/gross weights');
});


