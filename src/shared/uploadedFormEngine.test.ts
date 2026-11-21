import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  clearExcelModelCache,
  detectTargetOperationalSection,
  matchTokenToFieldKey,
  parseExcelSheetModel,
} from './uploadedFormEngine.ts';

function buildBase64Workbook(ws: XLSX.WorkSheet, sheetName = 'Form'): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  const bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  return Buffer.from(bytes).toString('base64');
}

describe('uploadedFormEngine smart detection & caching', () => {
  it('detects Excel formulas (cell.f), adjacent headers, and suggested SAMAAN field keys', () => {
    clearExcelModelCache();
    const ws = XLSX.utils.aoa_to_sheet([
      ['ردیف', 'شرح کالا', 'مقدار پکینگ', 'مقدار واقعی', 'کسری'],
      [1, 'پمپ اصلی', 10, 8, { t: 'n', f: 'C2-D2', v: 2 }],
      ['جمع کل', '', { t: 'n', f: 'SUM(C2:C2)', v: 10 }, { t: 'n', f: 'SUM(D2:D2)', v: 8 }, { t: 'n', f: 'SUM(E2:E2)', v: 2 }],
    ]);
    const b64 = buildBase64Workbook(ws, 'MIV');
    const first = parseExcelSheetModel(b64, 'MIV');
    assert.ok(first.detectedFormulas.length >= 3, 'should detect at least 3 formulas');
    const shortageFormula = first.detectedFormulas.find((f) => f.cellRef === 'E2');
    assert.ok(shortageFormula, 'should detect E2 formula');
    assert.equal(shortageFormula.formula, '=C2-D2');
    assert.equal(shortageFormula.suggestedFieldKey, 'shortage');

    // Second call hits LRU cache and returns the exact same object reference
    const second = parseExcelSheetModel(b64, 'MIV');
    assert.strictEqual(second, first, 'second parse should return cached ParsedExcelModel');
  });

  it('matches expanded operational field aliases (MIV, GCV, SMR, REP, OPI, stocks)', () => {
    assert.equal(matchTokenToFieldKey('مقدار حواله'), 'mivContractorQty');
    assert.equal(matchTokenToFieldKey('شماره دعوتنامه'), 'opiNo');
    assert.equal(matchTokenToFieldKey('تاریخ دعوتنامه'), 'opiDate');
    assert.equal(matchTokenToFieldKey('شماره رسید مصرف'), 'gcvReceiptNo');
    assert.equal(matchTokenToFieldKey('تعداد رسید مصرف'), 'gcvDeliveredQty');
    assert.equal(matchTokenToFieldKey('شماره برگشتی به انبار پیمانکار'), 'smrContractorNo');
    assert.equal(matchTokenToFieldKey('تحویل گیرنده'), 'receiver');
    assert.equal(matchTokenToFieldKey('تحویل آورنده'), 'smrDeliverer');
    assert.equal(matchTokenToFieldKey('تأمین مجدد جایگزین شده'), 'repReprocured');
    assert.equal(matchTokenToFieldKey('موجودی کارفرما'), 'mapnaInventory');
    assert.equal(matchTokenToFieldKey('موجودی پیمانکار'), 'contractorInventory');
  });

  it('auto-detects target operational section from Persian/English form titles and headers', () => {
    const mivDet = detectTargetOperationalSection('فرم حواله انبار MIV-01.xlsx', ['فرم حواله انبار'], [], []);
    assert.equal(mivDet.section, 'miv');
    assert.equal(mivDet.confidence, 'high');

    const gcvDet = detectTargetOperationalSection('Receipt_GCV.xlsx', ['رسید مصرف مستقیم کالا'], [], []);
    assert.equal(gcvDet.section, 'gcv');

    const smrDet = detectTargetOperationalSection('Form_12.xlsx', ['فرم ارجاع و برگشت متریال به انبار'], [], []);
    assert.equal(smrDet.section, 'smr');

    const siteEntryDet = detectTargetOperationalSection('MD1EX-FQP02/15-01.xlsx', ['صورتجلسه ورود کالا به کارگاه'], [], []);
    assert.equal(siteEntryDet.section, 'siteEntry');

    const repDet = detectTargetOperationalSection('Substitution.xlsx', ['فرم جایگزینی تجهیزات'], [], []);
    assert.equal(repDet.section, 'substitution');
  });
});
