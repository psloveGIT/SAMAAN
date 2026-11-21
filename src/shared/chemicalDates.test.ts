import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChemicalDatesFromTexts, parseSingleDateSnippet } from './chemicalDates.ts';
import { inspectMatrixColumns, parseDetailedCsv } from './csvParser.ts';

test('extractChemicalDatesFromTexts extracts Persian Jalali production & expiration dates from notes', () => {
  const res = extractChemicalDatesFromTexts(
    ['روغن توربین ISO VG 46 — تاریخ تولید: ۱۴۰۳/۰۵/۱۲ ، تاریخ انقضاء: ۱۴۰۵/۰۵/۱۲ در انبار سرپوشیده'],
    'jalali',
  );
  assert.equal(res.productionDate, '2024-08-02');
  assert.equal(res.expirationDate, '2026-08-03');
});

test('extractChemicalDatesFromTexts extracts English Gregorian MFG and EXP dates including MM/YYYY and month names', () => {
  const res1 = extractChemicalDatesFromTexts(
    ['Epoxy Primer 20L | MFG: 2025-03-10 | EXP: 2027-03-10'],
    'jalali',
  );
  assert.equal(res1.productionDate, '2025-03-10');
  assert.equal(res1.expirationDate, '2027-03-10');

  const res2 = extractChemicalDatesFromTexts(
    ['Turbine Grease Cartridge, Prod Date: 04/2025, Best Before: Jun 2027'],
    'gregorian',
  );
  assert.equal(res2.productionDate, '2025-04-01');
  assert.equal(res2.expirationDate, '2027-06-30');
});

test('extractChemicalDatesFromTexts handles Persian named months and computes expiration from shelf life', () => {
  const res1 = extractChemicalDatesFromTexts(
    ['تولید: ۱۵ مهر ۱۴۰۳ | انقضا: مهر ۱۴۰۵'],
    'jalali',
  );
  assert.equal(res1.productionDate, '2024-10-06');
  assert.equal(res1.expirationDate, '2026-10-22');

  const res2 = extractChemicalDatesFromTexts(
    ['MFG Date: 2025-01-15; Shelf life: 24 months'],
    'gregorian',
  );
  assert.equal(res2.productionDate, '2025-01-15');
  assert.equal(res2.expirationDate, '2027-01-15');
});

test('parseSingleDateSnippet supports DD/MM/YYYY and Jalali YYYY/MM', () => {
  assert.equal(parseSingleDateSnippet('15/06/2026', 'gregorian', true), '2026-06-15');
  assert.equal(parseSingleDateSnippet('1405/03', 'jalali', true), '2026-06-21');
});

test('parseDetailedCsv automatically extracts production & expiration dates for imported chemical items', () => {
  const matrix = [
    ['ردیف', 'تاریخ ورود', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'شرح', 'مقدار پکینگ', 'توضیحات'],
    ['1', '1404/02/10', 'PL-CHEM-1', 'P-1', '1', 'Epoxy Primer Paint 20L', '10', 'تاریخ تولید: 1403/11/01 - تاریخ انقضاء: 1405/11/01'],
    ['2', '1404/02/10', 'PL-CHEM-1', 'P-1', '2', 'Turbine Lubricant Oil ISO VG 46 (MFG: 2025-02-01, EXP: 2027-02-01)', '5', ''],
  ];
  const parsed = parseDetailedCsv(matrix, 'jalali', 'tester');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].itemCategory, 'chemicals');
  assert.equal(parsed.rows[0].productionDate, '2025-01-20');
  assert.equal(parsed.rows[0].expirationDate, '2027-01-21');
  assert.equal(parsed.rows[1].itemCategory, 'chemicals');
  assert.equal(parsed.rows[1].productionDate, '2025-02-01');
  assert.equal(parsed.rows[1].expirationDate, '2027-02-01');
});

test('productionDate never maps to or reads from انبارگردانی / stocktake columns', () => {
  const matrix = [
    ['ردیف', 'تاریخ ورود', 'شماره محموله', 'شماره نگله', 'شماره آیتم', 'شرح', 'مقدار پکینگ', 'انبارگردانی', 'تاریخ انبارگردانی', 'وضعیت انبارگردانی'],
    ['1', '1404/02/10', 'PL-ST-1', 'P-1', '1', 'Epoxy Primer Paint 20L', '10', 'تولید گزارش انبارگردانی 1404/01/15', '1404/01/15', 'موجود و تایید شده'],
  ];
  const inspected = inspectMatrixColumns(matrix, 'detailed');
  assert.equal(inspected.mapping.productionDate, -1);
  assert.equal(inspected.mapping.expirationDate, -1);
  assert.equal(inspected.mapping.stocktakeInfo, 7);
  assert.equal(inspected.mapping.stocktakeDate, 8);
  assert.equal(inspected.mapping.stocktakeStatus, 9);

  const parsed = parseDetailedCsv(matrix, 'jalali', 'tester');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].itemCategory, 'chemicals');
  assert.equal(parsed.rows[0].productionDate, '');
  assert.equal(parsed.rows[0].expirationDate, '');
  assert.equal(parsed.rows[0].stocktakeStatus, 'موجود و تایید شده');
  assert.equal(parsed.rows[0].stocktakeDate, '2025-04-04');
});

