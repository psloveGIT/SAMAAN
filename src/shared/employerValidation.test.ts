import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIranFixedPhoneParts,
  sanitizeDigitsOnly,
  sanitizeInstagramInput,
  sanitizeLinkedInInput,
  sanitizeProvinceCodeInput,
  validateEmail,
  validateInstagramUsername,
  validateIranFixedPhoneParts,
  validateLinkedInUsername,
  validatePostalCode,
} from './employerValidation.ts';

test('Iran fixed phone & fax validation supports Persian and English digits with strict +98 / ## / ######## rules', () => {
  // Optional when both empty
  assert.equal(validateIranFixedPhoneParts('', '').valid, true);
  assert.equal(validateIranFixedPhoneParts('', '').normalized, '');

  // Valid English digits
  const okEn = validateIranFixedPhoneParts('21', '82980000');
  assert.equal(okEn.valid, true);
  assert.equal(okEn.normalized, '+98-21-82980000');

  // Valid Persian digits
  const okFa = validateIranFixedPhoneParts('۲۱', '۸۲۹۸۶۶۲۳');
  assert.equal(okFa.valid, true);
  assert.equal(okFa.normalized, '+98-21-82986623');

  // Rejects leading zero in province code
  assert.equal(validateIranFixedPhoneParts('02', '82980000').valid, false);
  assert.equal(validateIranFixedPhoneParts('۰۲', '82980000').valid, false);
  assert.equal(sanitizeProvinceCodeInput('021'), '21');
  assert.equal(sanitizeProvinceCodeInput('۰۲۱'), '۲۱');

  // Rejects non-8-digit subscriber number
  assert.equal(validateIranFixedPhoneParts('21', '829800').valid, false);
  assert.equal(validateIranFixedPhoneParts('21', '').valid, false);
  assert.equal(validateIranFixedPhoneParts('', '82980000').valid, false);

  // Parsing stored values
  assert.deepEqual(parseIranFixedPhoneParts('+98-21-82980000'), {
    provinceCode: '21',
    subscriber: '82980000',
  });
  assert.deepEqual(parseIranFixedPhoneParts('02182980000'), {
    provinceCode: '21',
    subscriber: '82980000',
  });
  assert.deepEqual(parseIranFixedPhoneParts('+98-21-'), {
    provinceCode: '21',
    subscriber: '',
  });
  assert.deepEqual(parseIranFixedPhoneParts('+98--8298'), {
    provinceCode: '',
    subscriber: '8298',
  });
});

test('Postal code enforces exactly 10 digits (Persian or English) and allows empty', () => {
  assert.equal(validatePostalCode('').valid, true);
  assert.equal(validatePostalCode('1518614111').valid, true);
  assert.equal(validatePostalCode('۱۵۱۸۶۱۴۱۱۱').valid, true);
  assert.equal(validatePostalCode('۱۵۱۸۶۱۴۱۱۱').normalized, '1518614111');

  assert.equal(validatePostalCode('151861411').valid, false);
  assert.equal(validatePostalCode('15186141112').valid, false);
  assert.equal(validatePostalCode('15186abc11').valid, false);
  assert.equal(sanitizeDigitsOnly('۱۵۱-abc861411199', 10), '۱۵۱8614111');
});

test('Email validation requires @ and valid domain TLD', () => {
  assert.equal(validateEmail('').valid, true);
  assert.equal(validateEmail('info@md1.mapnagroup.com').valid, true);
  assert.equal(validateEmail('contact@niroo.ir').valid, true);
  assert.equal(validateEmail('ops.team+1@plant-co.org').valid, true);

  assert.equal(validateEmail('invalid-email').valid, false);
  assert.equal(validateEmail('info@localhost').valid, false);
  assert.equal(validateEmail('info@mapna.').valid, false);
  assert.equal(validateEmail('info..1@mapna.com').valid, false);
  assert.equal(validateEmail('info @mapna.com').valid, false);
});

test('Instagram username validation enforces official Instagram rules and blocks invalid characters', () => {
  assert.equal(validateInstagramUsername('').valid, true);
  assert.equal(validateInstagramUsername('Mapna_md1').valid, true);
  assert.equal(validateInstagramUsername('mapna.power_01').valid, true);

  assert.equal(validateInstagramUsername('.mapna').valid, false);
  assert.equal(validateInstagramUsername('mapna.').valid, false);
  assert.equal(validateInstagramUsername('mapna..md1').valid, false);
  assert.equal(validateInstagramUsername('123456').valid, false);
  assert.equal(validateInstagramUsername('a').valid, false);
  assert.equal(validateInstagramUsername('مپنا').valid, false);
  assert.equal(sanitizeInstagramInput('@Mapna_md1!# '), 'Mapna_md1');
});

test('LinkedIn username validation enforces official LinkedIn handle rules', () => {
  assert.equal(validateLinkedInUsername('').valid, true);
  assert.equal(validateLinkedInUsername('mapna-md1').valid, true);
  assert.equal(validateLinkedInUsername('Mapnamd2').valid, true);

  assert.equal(validateLinkedInUsername('ab').valid, false);
  assert.equal(validateLinkedInUsername('-mapna').valid, false);
  assert.equal(validateLinkedInUsername('mapna-').valid, false);
  assert.equal(validateLinkedInUsername('mapna--md1').valid, false);
  assert.equal(validateLinkedInUsername('mapna_md1').valid, false);
  assert.equal(validateLinkedInUsername('12345').valid, false);
  assert.equal(sanitizeLinkedInInput('https://www.linkedin.com/in/mapna-md1/'), 'mapna-md1');
});
