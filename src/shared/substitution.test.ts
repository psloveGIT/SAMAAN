import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SUPPLY_URGENCY,
  MD1_SUBSTITUTION_COPY_TEXT,
  MD1_SUBSTITUTION_FORM_CODE,
  MD1_SUBSTITUTION_QA_NOTICE,
  buildReplacementAgreementText,
  buildReplacementCauseLines,
  buildSubstitutionHeaderMeta,
  generateNextAutoMivDocNo,
  generateNextSubstitutionDocNo,
  getAvailableStockForSource,
  getDefaultStockSource,
  hasAvailableSiteStock,
  parseStrictPositiveNumber,
  resolveSupplierPrefix,
  sanitizeNumericQtyInput,
} from './substitution';

test('resolveSupplierPrefix implements exact MD1 rules for TUGA, MECO, PARS and smart 2-letter abbreviations for other suppliers', () => {
  assert.equal(resolveSupplierPrefix('TUGA'), 'TU');
  assert.equal(resolveSupplierPrefix('tuga turbine co'), 'TU');
  assert.equal(resolveSupplierPrefix('شرکت توگا'), 'TU');

  assert.equal(resolveSupplierPrefix('MECO'), 'ME');
  assert.equal(resolveSupplierPrefix('Meco Electric'), 'ME');
  assert.equal(resolveSupplierPrefix('مکو'), 'ME');

  assert.equal(resolveSupplierPrefix('PARS'), 'PS');
  assert.equal(resolveSupplierPrefix('Pars Generator'), 'PS');
  assert.equal(resolveSupplierPrefix('ژنراتور پارس'), 'PS');

  // Other suppliers -> deterministic 2-letter uppercase English abbreviation
  assert.equal(resolveSupplierPrefix('MAPNA'), 'MP');
  assert.equal(resolveSupplierPrefix('Siemens Energy'), 'SI');
  assert.equal(resolveSupplierPrefix('ABB'), 'AB');
  assert.equal(resolveSupplierPrefix('General Electric'), 'GE');
  assert.equal(resolveSupplierPrefix('شرکت فولاد مبارکه'), 'SF');
  assert.equal(resolveSupplierPrefix(''), 'GN');
  assert.match(resolveSupplierPrefix('شرکت تجهیز نیرو'), /^[A-Z]{2}$/);
});

test('generateNextSubstitutionDocNo formats XX-#### and increments per prefix independently', () => {
  assert.equal(generateNextSubstitutionDocNo('TUGA', []), 'TU-0001');
  assert.equal(generateNextSubstitutionDocNo('MECO', ['TU-0001', 'TU-0002']), 'ME-0001');
  assert.equal(generateNextSubstitutionDocNo('TUGA', ['TU-0001', 'TU-0002', 'ME-0005']), 'TU-0003');
  assert.equal(generateNextSubstitutionDocNo('PARS', ['PS-0009', 'TU-0004']), 'PS-0010');
  // Supports Persian digits in existing records
  assert.equal(generateNextSubstitutionDocNo('TUGA', ['TU-۰۰۱۲']), 'TU-0013');
});

test('generateNextAutoMivDocNo creates unique sequential MIV numbers', () => {
  assert.equal(generateNextAutoMivDocNo([]), 'MIV-0001');
  assert.equal(generateNextAutoMivDocNo(['MIV-0001', 'MIV-0002']), 'MIV-0003');
  assert.equal(generateNextAutoMivDocNo(['MIV-0005', 'CUSTOM-9']), 'MIV-0006');
  assert.equal(generateNextAutoMivDocNo(['MIV-۰۰۰۳']), 'MIV-0004');
});

test('parseStrictPositiveNumber and sanitizeNumericQtyInput strictly enforce positive numbers', () => {
  assert.equal(parseStrictPositiveNumber('5'), 5);
  assert.equal(parseStrictPositiveNumber('۱۲'), 12);
  assert.equal(parseStrictPositiveNumber('2.5'), 2.5);
  assert.equal(parseStrictPositiveNumber('۳.۵'), 3.5);
  assert.equal(parseStrictPositiveNumber('0'), null);
  assert.equal(parseStrictPositiveNumber('-3'), null);
  assert.equal(parseStrictPositiveNumber('abc'), null);
  assert.equal(parseStrictPositiveNumber('5pcs'), null);
  assert.equal(parseStrictPositiveNumber(''), null);

  assert.equal(sanitizeNumericQtyInput('۱۲abc۳.۴.۵'), '123.45');
  assert.equal(sanitizeNumericQtyInput('عدد 25'), '25');
});

test('hasAvailableSiteStock accepts employer OR contractor positive stock and rejects OPI-pending or zero stock', () => {
  assert.equal(hasAvailableSiteStock({ opiPending: false, mapnaInventory: 5, contractorInventory: 0 }), true);
  assert.equal(hasAvailableSiteStock({ opiPending: false, mapnaInventory: 0, contractorInventory: 3 }), true);
  assert.equal(hasAvailableSiteStock({ opiPending: false, mapnaInventory: 2, contractorInventory: 4 }), true);
  assert.equal(hasAvailableSiteStock({ opiPending: false, mapnaInventory: 0, contractorInventory: 0 }), false);
  assert.equal(hasAvailableSiteStock({ opiPending: true, mapnaInventory: 10, contractorInventory: 0 }), false);

  assert.equal(getDefaultStockSource({ mapnaInventory: 5, contractorInventory: 0 }), 'mapna');
  assert.equal(getDefaultStockSource({ mapnaInventory: 0, contractorInventory: 3 }), 'contractor');
  assert.equal(getAvailableStockForSource({ mapnaInventory: 5, contractorInventory: 3 }, 'mapna'), 5);
  assert.equal(getAvailableStockForSource({ mapnaInventory: 5, contractorInventory: 3 }, 'contractor'), 3);
});

test('buildSubstitutionHeaderMeta maps rules 1-1 through 1-12 accurately with blanks when optional fields are absent', () => {
  const meta = buildSubstitutionHeaderMeta(
    [
      {
        system: 'Turbine',
        island: 'Gas',
        unit: 'Unit-1',
        supplier: 'TUGA',
        receiver: 'پیمانکار نصب الف',
        merNo: 'MER-12',
      },
      {
        system: 'Turbine',
        island: 'Gas',
        unit: 'Unit-2',
        supplier: 'TUGA',
        receiver: 'پیمانکار نصب الف',
        merNo: '',
      },
    ],
    {
      projectName: 'نیروگاه نکا',
      contractRef: 'C-1405-01',
      mivNo: 'MIV-0001',
    },
  );

  assert.equal(meta.projectName, 'نیروگاه نکا');
  assert.equal(meta.contractNo, 'C-1405-01');
  assert.equal(meta.system, 'Turbine');
  assert.equal(meta.island, 'Gas');
  assert.equal(meta.unit, 'Unit-1 / Unit-2');
  assert.equal(meta.supplier, 'TUGA');
  assert.equal(meta.supplyUrgency, DEFAULT_SUPPLY_URGENCY);
  assert.equal(meta.installerContractor, 'پیمانکار نصب الف');
  assert.equal(meta.mivNo, 'MIV-0001');
  assert.equal(meta.merNcrNo, 'MER-12');

  // When contractRef and merNo are empty -> stay blank
  const blankMeta = buildSubstitutionHeaderMeta(
    [{ system: 'BOP', island: 'Water', unit: 'U1', supplier: 'PARS', receiver: 'پیمانکار ب', merNo: '' }],
    { projectName: 'نکا', contractRef: '', supplyUrgency: 'اضطراری', mivNo: 'MIV-0002' },
  );
  assert.equal(blankMeta.contractNo, '');
  assert.equal(blankMeta.merNcrNo, '');
  assert.equal(blankMeta.supplyUrgency, 'اضطراری');
});

test('buildReplacementCauseLines omits old prefix and buildReplacementAgreementText matches official wording', () => {
  const lines = buildReplacementCauseLines('آسیب‌دیدگی واشر در زمان نصب', 'شرکت توگا');
  assert.deepEqual(lines, [
    'آسیب‌دیدگی واشر در زمان نصب',
    'تأمین کننده مجدد: شرکت توگا',
  ]);

  const agreement = buildReplacementAgreementText('شرکت توگا', 'پیمانکار نصب');
  assert.equal(
    agreement,
    'امضاء کنندگان ذیل توافق و تایید نمودند که مواد/ تجهیزات تعیین شده در(ب) می توانند به جای اقلام قید شده در(الف) مورد استفاده قرار بگیرند، از سوی دیگر مواد/ تجهیزات جایگزین می بایست توسط شرکت توگا مجددا تهیه شده و هزینه های ذیربط توسط پیمانکار نصب می بایست پرداخت شوند.',
  );

  assert.equal(
    generateNextSubstitutionDocNo('TUGA', ['TU-0001'], {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'prefix',
    }),
    'NK-TU-0002',
  );
  assert.equal(
    generateNextSubstitutionDocNo('TUGA', ['NK-TU-0002'], {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'before_number',
    }),
    'TU-NK-0003',
  );
  assert.equal(
    generateNextAutoMivDocNo(['MIV-0001'], {
      plantAbbreviation: 'NK',
      usePlantAbbreviationInDocs: true,
      plantAbbreviationPosition: 'prefix',
    }),
    'NK-MIV-0002',
  );

  assert.equal(MD1_SUBSTITUTION_FORM_CODE, 'MD1EX-FQP02/10-03');
  assert.ok(MD1_SUBSTITUTION_QA_NOTICE.includes('QA'));
  assert.equal(MD1_SUBSTITUTION_COPY_TEXT, 'رونوشت: معاونت تأمین، فروشنده، پیمانکار نصب');
});
