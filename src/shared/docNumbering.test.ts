import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDigitsByLang,
  formatDocumentNumberWithPlantCode,
  generateNextPlantAwareDocNo,
  normalizeRepStatus,
  preserveMultilineText,
  sanitizePlantAbbreviation,
  validatePlantAbbreviation,
} from './docNumbering';

test('plant abbreviation sanitization & validation enforces 2-3 uppercase English letters', () => {
  assert.equal(sanitizePlantAbbreviation(' nk12-آ '), 'NK');
  assert.equal(sanitizePlantAbbreviation('bnda'), 'BND');

  assert.equal(validatePlantAbbreviation('').valid, true);
  assert.equal(validatePlantAbbreviation('NK').valid, true);
  assert.equal(validatePlantAbbreviation('nk').normalized, 'NK');
  assert.equal(validatePlantAbbreviation('BND').valid, true);
  assert.equal(validatePlantAbbreviation('N').valid, false);
  assert.equal(validatePlantAbbreviation('NEKA').valid, false);
  assert.equal(validatePlantAbbreviation('N1').valid, false);
  assert.equal(validatePlantAbbreviation('نکا').valid, false);
});

test('formatDocumentNumberWithPlantCode supports prefix, before_number, and disabled modes', () => {
  assert.equal(
    formatDocumentNumberWithPlantCode('TU', '0001', {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: false,
      plantAbbreviationPosition: 'prefix',
    }),
    'TU-0001',
  );
  assert.equal(
    formatDocumentNumberWithPlantCode('TU', '0001', {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'prefix',
    }),
    'NK-TU-0001',
  );
  assert.equal(
    formatDocumentNumberWithPlantCode('TU', '0001', {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'before_number',
    }),
    'TU-NK-0001',
  );
  assert.equal(
    formatDocumentNumberWithPlantCode('MIV', '0005', {
      plantAbbreviation: 'BND',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'before_number',
    }),
    'MIV-BND-0005',
  );
});

test('generateNextPlantAwareDocNo increments cleanly across mixed legacy and plant-coded doc numbers', () => {
  const existing = ['MIV-0001', 'NK-MIV-0002', 'MIV-NK-0003'];
  assert.equal(
    generateNextPlantAwareDocNo('MIV', existing, {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'prefix',
    }),
    'NK-MIV-0004',
  );
  assert.equal(
    generateNextPlantAwareDocNo('MIV', existing, {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'before_number',
    }),
    'MIV-NK-0004',
  );
});

test('formatDigitsByLang converts digits to Persian in fa and ASCII in en', () => {
  assert.equal(formatDigitsByLang('+98-21-82980000', 'fa'), '+۹۸-۲۱-۸۲۹۸۰۰۰۰');
  assert.equal(formatDigitsByLang('+۹۸-۲۱-۸۲۹۸۰۰۰۰', 'en'), '+98-21-82980000');
  assert.equal(formatDigitsByLang('1518614111', 'fa'), '۱۵۱۸۶۱۴۱۱۱');
});

test('preserveMultilineText preserves line breaks while collapsing excess horizontal spaces', () => {
  assert.equal(preserveMultilineText('Line 1   extra\r\n  Line 2\t\there  \n\n'), 'Line 1 extra\nLine 2 here');
  assert.equal(preserveMultilineText('  A\nB\nC  '), 'A\nB\nC');
});

test('normalizeRepStatus strictly enforces open (باز) and closed (بسته)', () => {
  assert.equal(normalizeRepStatus('', false), '');
  assert.equal(normalizeRepStatus('', true), 'باز');
  assert.equal(normalizeRepStatus('اجرا شده', true), 'باز');
  assert.equal(normalizeRepStatus('در دست بررسی', true), 'باز');
  assert.equal(normalizeRepStatus('باز', true), 'باز');
  assert.equal(normalizeRepStatus('بسته', true), 'بسته');
  assert.equal(normalizeRepStatus('closed', true), 'بسته');
  assert.equal(normalizeRepStatus('تکمیل شده', true), 'بسته');
});
