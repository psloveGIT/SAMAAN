import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRANSIT_STATUSES,
  formatCountingUnit,
  getTransitStatusOptions,
  inferItemClassification,
  isTransitArrivedStatus,
  normalizeCountingUnitToFa,
  normalizeTransitStatus,
} from './normalizers.ts';

test('normalizeCountingUnitToFa converts common English industrial abbreviations to Persian', () => {
  assert.equal(normalizeCountingUnitToFa('PC'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('PCs'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('PCS.'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('PC(s)'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('EA'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('NO'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('NOS'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('M'), 'متر');
  assert.equal(normalizeCountingUnitToFa('MTR'), 'متر');
  assert.equal(normalizeCountingUnitToFa('meter'), 'متر');
  assert.equal(normalizeCountingUnitToFa('M2'), 'مترمربع');
  assert.equal(normalizeCountingUnitToFa('SQ.M'), 'مترمربع');
  assert.equal(normalizeCountingUnitToFa('M³'), 'مترمکعب');
  assert.equal(normalizeCountingUnitToFa('CBM'), 'مترمکعب');
  assert.equal(normalizeCountingUnitToFa('SET'), 'ست');
  assert.equal(normalizeCountingUnitToFa('KG'), 'کیلوگرم');
  assert.equal(normalizeCountingUnitToFa('KGS'), 'کیلوگرم');
  assert.equal(normalizeCountingUnitToFa('L'), 'لیتر');
  assert.equal(normalizeCountingUnitToFa('LTR'), 'لیتر');
  assert.equal(normalizeCountingUnitToFa('PAIR'), 'جفت');
  assert.equal(normalizeCountingUnitToFa('BOX'), 'جعبه');
  assert.equal(normalizeCountingUnitToFa('ROLL'), 'رول');
  assert.equal(normalizeCountingUnitToFa('SHEET'), 'ورق');
  assert.equal(normalizeCountingUnitToFa('KIT'), 'کیت');
  assert.equal(normalizeCountingUnitToFa('PKG'), 'بسته');
  assert.equal(normalizeCountingUnitToFa('CTN'), 'کارتن');
  assert.equal(normalizeCountingUnitToFa('DRUM'), 'بشکه');
  assert.equal(normalizeCountingUnitToFa('BAG'), 'کیسه');
  assert.equal(normalizeCountingUnitToFa('LENGTH'), 'شاخه');
  assert.equal(normalizeCountingUnitToFa('PALLET'), 'پالت');
  assert.equal(normalizeCountingUnitToFa('TON'), 'تن');
  assert.equal(normalizeCountingUnitToFa('REEL'), 'قرقره');
  // Extended industrial units requested by testers
  assert.equal(normalizeCountingUnitToFa('BLOCK'), 'بلوک');
  assert.equal(normalizeCountingUnitToFa('Block(s)'), 'بلوک');
  assert.equal(normalizeCountingUnitToFa('CC'), 'سی‌سی');
  assert.equal(normalizeCountingUnitToFa('CELL'), 'سلول');
  assert.equal(normalizeCountingUnitToFa('MM2'), 'میلی‌مترمربع');
  assert.equal(normalizeCountingUnitToFa('mm2'), 'میلی‌مترمربع');
  assert.equal(normalizeCountingUnitToFa('mm²'), 'میلی‌مترمربع');
  assert.equal(normalizeCountingUnitToFa('CM2'), 'سانتی‌مترمربع');
  assert.equal(normalizeCountingUnitToFa('CM3'), 'سانتی‌مترمکعب');
  assert.equal(normalizeCountingUnitToFa('ML'), 'میلی‌لیتر');
  assert.equal(normalizeCountingUnitToFa('CYL'), 'سیلندر');
  assert.equal(normalizeCountingUnitToFa('GAL'), 'گالن');
  assert.equal(normalizeCountingUnitToFa('PC/SET'), 'عدد/ست');
});

test('normalizeCountingUnitToFa preserves already Persian units and unknown tokens', () => {
  assert.equal(normalizeCountingUnitToFa('عدد'), 'عدد');
  assert.equal(normalizeCountingUnitToFa('متر'), 'متر');
  assert.equal(normalizeCountingUnitToFa('کیلو گرم'), 'کیلوگرم');
  assert.equal(normalizeCountingUnitToFa('دستگاه'), 'دستگاه');
  assert.equal(normalizeCountingUnitToFa('کپسول'), 'کپسول');
  assert.equal(normalizeCountingUnitToFa(''), '');
  assert.equal(normalizeCountingUnitToFa('-'), '');
});

test('formatCountingUnit respects active UI language', () => {
  assert.equal(formatCountingUnit('PCs', 'fa'), 'عدد');
  assert.equal(formatCountingUnit('MTR', 'fa'), 'متر');
  assert.equal(formatCountingUnit('BLOCK', 'fa'), 'بلوک');
  assert.equal(formatCountingUnit('mm2', 'fa'), 'میلی‌مترمربع');
  assert.equal(formatCountingUnit('PCs', 'en'), 'PCs');
  assert.equal(formatCountingUnit('عدد', 'fa'), 'عدد');
  assert.equal(formatCountingUnit('عدد', 'en'), 'PC');
  assert.equal(formatCountingUnit('بلوک', 'en'), 'BLOCK');
  assert.equal(formatCountingUnit('سلول', 'en'), 'CELL');
  assert.equal(formatCountingUnit('سی‌سی', 'en'), 'CC');
  assert.equal(formatCountingUnit('میلی‌مترمربع', 'en'), 'mm²');
});

test('inferItemClassification accurately detects chemicals, special tools, and spare parts while guarding hardware false positives', () => {
  const epoxy = inferItemClassification('Two Component Epoxy Primer Paint 20L', '');
  assert.equal(epoxy.itemCategory, 'chemicals');
  assert.ok(epoxy.chemicalType.length > 0);

  const oil = inferItemClassification('ISO VG 46 Turbine Oil Drum', '');
  assert.equal(oil.itemCategory, 'chemicals');
  assert.equal(oil.chemicalType, 'روغن صنعتی / روان‌کار');

  const sf6 = inferItemClassification('SF6 Gas Cylinder 50kg', '');
  assert.equal(sf6.itemCategory, 'chemicals');

  const wrench = inferItemClassification('Hydraulic Torque Wrench 1000 Nm', '');
  assert.equal(wrench.itemCategory, 'special_tools');
  assert.equal(wrench.chemicalType, '');

  const persianTool = inferItemClassification('آچار گشتاور مخصوص نصب توربین', '');
  assert.equal(persianTool.itemCategory, 'special_tools');

  const spareKit = inferItemClassification('Mechanical Seal Kit for Boiler Feed Pump', '2-Year Spare Parts');
  assert.equal(spareKit.itemCategory, 'spare_parts');

  const explicitNote = inferItemClassification('Stainless Bolt M16', 'لوازم یدکی بهره‌برداری');
  assert.equal(explicitNote.itemCategory, 'spare_parts');

  // Hardware false-positive guards (must NOT be misclassified as chemicals)
  assert.equal(inferItemClassification('Lube Oil Filter Element 10 Micron', '').itemCategory, '');
  assert.equal(inferItemClassification('Main Lube Oil Pump Assembly', '').itemCategory, '');
  assert.equal(inferItemClassification('Gas Turbine Rotor Blade', '').itemCategory, '');
  assert.equal(inferItemClassification('Epoxy Coated Carbon Steel Pipe DN200', '').itemCategory, '');
  assert.equal(inferItemClassification('Gate Valve 6 inch ANSI 300', '').itemCategory, '');
});

test('normalizeTransitStatus maps legacy and synonym statuses to the 3 canonical categories', () => {
  assert.deepEqual([...DEFAULT_TRANSIT_STATUSES], ['در دست ارسال', 'در دست بازرسی', 'رسیده']);

  // Canonical
  assert.equal(normalizeTransitStatus('در دست ارسال'), 'در دست ارسال');
  assert.equal(normalizeTransitStatus('در دست بازرسی'), 'در دست بازرسی');
  assert.equal(normalizeTransitStatus('رسیده'), 'رسیده');

  // Legacy 'پایان' & arrived variants -> 'رسیده'
  assert.equal(normalizeTransitStatus('پایان'), 'رسیده');
  assert.equal(normalizeTransitStatus('تکمیل شده'), 'رسیده');
  assert.equal(normalizeTransitStatus('تحویل به انبار'), 'رسیده');
  assert.equal(normalizeTransitStatus('Arrived'), 'رسیده');
  assert.equal(normalizeTransitStatus('Finished'), 'رسیده');
  assert.equal(isTransitArrivedStatus('پایان'), true);
  assert.equal(isTransitArrivedStatus('رسیده'), true);

  // Inspection variants -> 'در دست بازرسی'
  assert.equal(normalizeTransitStatus('در حال بازرسی'), 'در دست بازرسی');
  assert.equal(normalizeTransitStatus('بازرسی فنی'), 'در دست بازرسی');
  assert.equal(normalizeTransitStatus('Under Inspection'), 'در دست بازرسی');

  // Dispatch / shipping / unknown / empty -> 'در دست ارسال'
  assert.equal(normalizeTransitStatus('در دست حمل'), 'در دست ارسال');
  assert.equal(normalizeTransitStatus('در راه'), 'در دست ارسال');
  assert.equal(normalizeTransitStatus('In Transit'), 'در دست ارسال');
  assert.equal(normalizeTransitStatus(''), 'در دست ارسال');
  assert.equal(normalizeTransitStatus('نامشخص'), 'در دست ارسال');
});

test('normalizeTransitStatus preserves user-added custom categories while still rejecting legacy پایان', () => {
  const custom = [...DEFAULT_TRANSIT_STATUSES, 'ترخیص گمرکی', 'معلق'];
  assert.equal(normalizeTransitStatus('ترخیص گمرکی', custom), 'ترخیص گمرکی');
  assert.equal(normalizeTransitStatus('معلق', custom), 'معلق');
  assert.equal(normalizeTransitStatus('پایان', [...custom, 'پایان']), 'رسیده');

  const options = getTransitStatusOptions(['پایان', 'ترخیص گمرکی', 'در دست ارسال']);
  assert.deepEqual(options, ['در دست ارسال', 'در دست بازرسی', 'رسیده', 'ترخیص گمرکی']);
});
