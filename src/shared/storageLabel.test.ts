import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAREHOUSE_LOCATION_RULES,
  buildMd1StorageLabelData,
  chunkStorageLabelsToA4QuadPages,
  formatStorageLabelPackageNo,
  formatStorageLabelSystem,
  resolveWarehouseFromLocation,
} from './storageLabel';

test('WAREHOUSE_LOCATION_RULES defines all 20 exact warehouse codes with S evaluated last', () => {
  assert.equal(WAREHOUSE_LOCATION_RULES.length, 20);
  assert.equal(WAREHOUSE_LOCATION_RULES[WAREHOUSE_LOCATION_RULES.length - 1].code, 'S');
});

test('resolveWarehouseFromLocation maps all 20 exact location codes accurately', () => {
  const cases: Array<[string, string]> = [
    ['W1', 'انبار روباز'],
    ['W1-A2', 'انبار روباز'],
    ['w1-s3', 'انبار روباز'],
    ['W۱-B4', 'انبار روباز'],
    ['W2-04', 'انبار باسکول'],
    ['W3-North', 'انبار ساحل'],
    ['CA-01', 'کانتینر A'],
    ['CB-12', 'کانتینر B'],
    ['CC', 'کانتینر C'],
    ['CD-Shelf2', 'کانتینر D'],
    ['CE-05', 'کانتینر E'],
    ['CF-1', 'کانتینر F'],
    ['CG-9', 'کانتینر G'],
    ['CH-2', 'کانتینر H'],
    ['CR-Inst', 'اتاق ابزار دقیق'],
    ['Mapna-Room1', 'اتاق تأمین تجهیزات'],
    ['mapna', 'اتاق تأمین تجهیزات'],
    ['PR-Chem', 'اتاق مواد شیمیایی'],
    ['S-04', 'سوله‌ی سر پوشیده'],
    ['S12', 'سوله‌ی سر پوشیده'],
    ['Meco-2', 'اتاق مکو'],
    ['Tuga-Bay1', 'اتاق توگا'],
    ['WNNC-01', 'انبار نصب نیرو ساختمان'],
    ['SITE-01', 'سایت'],
    ['site', 'سایت'],
    ['WNNE-03', 'انبار نصب نیرو نصب'],
    ['', ''],
    ['Unknown-99', ''],
  ];

  for (const [input, expected] of cases) {
    assert.equal(
      resolveWarehouseFromLocation(input),
      expected,
      `Expected "${input}" -> "${expected}"`,
    );
  }
});

test('formatStorageLabelSystem formats system outside parentheses and subSystem inside parentheses', () => {
  assert.equal(formatStorageLabelSystem('Turbine', 'Lube Oil'), 'Turbine (Lube Oil)');
  assert.equal(formatStorageLabelSystem('Boiler', ''), 'Boiler');
  assert.equal(formatStorageLabelSystem('', 'Drain'), '(Drain)');
  assert.equal(formatStorageLabelSystem('', ''), '');
});

test('formatStorageLabelPackageNo formats shipmentNo outside parentheses and packageNo inside parentheses', () => {
  assert.equal(formatStorageLabelPackageNo('PK-100', 'PKG-02'), 'PK-100 (PKG-02)');
  assert.equal(formatStorageLabelPackageNo('PK-100', ''), 'PK-100');
  assert.equal(formatStorageLabelPackageNo('', 'PKG-02'), '(PKG-02)');
  assert.equal(formatStorageLabelPackageNo('', ''), '');
});

test('buildMd1StorageLabelData maps Detailed row and project name to all 10 official fields', () => {
  const label = buildMd1StorageLabelData(
    {
      id: 'det-1',
      itemCode: 'TAG-901',
      description: 'High Pressure Steam Valve',
      system: 'Turbine',
      subSystem: 'Lube Oil',
      shipmentNo: 'PK-100',
      packageNo: 'PKG-02',
      itemNo: '01',
      storageLocation: 'W1-A2',
      supplier: 'MAPNA',
      notes: 'DRUM-44',
    },
    'نیروگاه نکا',
  );

  assert.deepEqual(label, {
    id: 'det-1',
    project: 'نیروگاه نکا',
    warehouse: 'انبار روباز',
    tagNo: 'TAG-901',
    description: 'High Pressure Steam Valve',
    system: 'Turbine (Lube Oil)',
    packageNo: 'PK-100 (PKG-02)',
    itemNo: '01',
    location: 'W1-A2',
    vendor: 'MAPNA',
    drumNumber: 'DRUM-44',
  });
});

test('chunkStorageLabelsToA4QuadPages always produces strict 4-slot A4 pages from 1 to 1000 items', () => {
  assert.deepEqual(chunkStorageLabelsToA4QuadPages([]), []);

  const onePage = chunkStorageLabelsToA4QuadPages(['A']);
  assert.equal(onePage.length, 1);
  assert.deepEqual(onePage[0], ['A', null, null, null]);

  const twoItems = chunkStorageLabelsToA4QuadPages(['A', 'B']);
  assert.equal(twoItems.length, 1);
  assert.deepEqual(twoItems[0], ['A', 'B', null, null]);

  const fiveItems = chunkStorageLabelsToA4QuadPages(['A', 'B', 'C', 'D', 'E']);
  assert.equal(fiveItems.length, 2);
  assert.deepEqual(fiveItems[0], ['A', 'B', 'C', 'D']);
  assert.deepEqual(fiveItems[1], ['E', null, null, null]);

  // 1,000 items -> exactly 250 A4 pages, every single page strictly 4 slots
  const thousand = Array.from({ length: 1000 }, (_, i) => i + 1);
  const thousandPages = chunkStorageLabelsToA4QuadPages(thousand);
  assert.equal(thousandPages.length, 250);
  for (const page of thousandPages) {
    assert.equal(page.length, 4);
    assert.ok(page.every((slot) => slot !== null));
  }

  // Copies per item (e.g. 1 item with 4 copies fills 1 full A4 sheet)
  const fourCopies = chunkStorageLabelsToA4QuadPages(['X'], 4);
  assert.equal(fourCopies.length, 1);
  assert.deepEqual(fourCopies[0], ['X', 'X', 'X', 'X']);
});
