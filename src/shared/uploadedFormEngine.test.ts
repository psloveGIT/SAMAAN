import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import {
  buildRenderedExcelGrid,
  clearExcelModelCache,
  detectTargetOperationalSection,
  matchTokenToFieldKey,
  parseExcelSheetModel,
} from './uploadedFormEngine.ts';
import type { EmployerUploadedForm } from './types.ts';

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

  it('preserves narrow micro-grid column widths and clones horizontal merges onto injected rows', () => {
    clearExcelModelCache();
    // 10-column micro-grid with narrow columns (wch: 2.5 -> ~22px, NOT inflated to 42px) and merged row cells
    const aoa: (string | number)[][] = [
      ['عنوان فرم شرکتی', '', '', '', '', '', '', '', '', ''],
      ['ردیف', '', 'شرح کالا', '', '', '', '', '', 'تعداد', ''],
      ['{{row}}', '', '{{description}}', '', '', '', '', '', '{{qty}}', ''],
      ['امضاء', '', '', '', '', '', '', '', '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = Array.from({ length: 10 }, () => ({ wch: 2.5 }));
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
      { s: { r: 1, c: 2 }, e: { r: 1, c: 7 } },
      { s: { r: 1, c: 8 }, e: { r: 1, c: 9 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 7 } },
      { s: { r: 2, c: 8 }, e: { r: 2, c: 9 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
    ];
    const b64 = buildBase64Workbook(ws, 'MicroGrid');
    const parsed = parseExcelSheetModel(b64, 'MicroGrid');
    assert.equal(parsed.colWidthsPx.length, 10);
    // Narrow micro-grid columns should stay below 35px (no artificial 42px inflation)
    assert.ok(parsed.colWidthsPx[0] <= 30 && parsed.colWidthsPx[0] >= 12, `Expected narrow col width, got ${parsed.colWidthsPx[0]}`);

    const form: EmployerUploadedForm = {
      id: 'uf-1',
      titleFa: 'فرم آزمایشی',
      fileType: 'excel',
      fileName: 'micro.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileDataBase64: b64,
      sheetName: 'MicroGrid',
      dataSource: 'detailed',
      tableStartRowIndex: 2,
      tableColumnBindings: [
        { colIndex: 0, headerLabel: 'ردیف', fieldKey: 'row' },
        { colIndex: 2, headerLabel: 'شرح کالا', fieldKey: 'description' },
        { colIndex: 8, headerLabel: 'تعداد', fieldKey: 'qty' },
      ],
      printSettings: {
        orientation: 'portrait',
        scalePercent: 100,
        fontSizePt: 9,
        minRowHeightPx: 22,
        marginTopMm: 8,
        marginRightMm: 8,
        marginBottomMm: 8,
        marginLeftMm: 8,
        autoRowHeight: true,
        fitToPageWidth: true,
        showGridlines: true,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const grid = buildRenderedExcelGrid(
      form,
      {},
      [
        { row: '1', description: 'First Valve', qty: '5' },
        { row: '2', description: 'Second Pump With Very Long Technical Description', qty: '12' },
        { row: '3', description: 'Third Flange', qty: '8' },
      ],
    );
    // Original 4 rows + 2 newly injected rows = 6 rows
    assert.equal(grid.displayRows.length, 6);
    assert.equal(grid.displayRows[3][2], 'Second Pump With Very Long Technical Description');
    // Row 3 (injected item #2) must clone template row 2's colSpan=6 merge (c: 2..7)
    const injectedRow2Merge = grid.effectiveMerges.find((m) => m.s.r === 3 && m.s.c === 2);
    assert.ok(injectedRow2Merge, 'Injected row 2 should clone template horizontal merge at col 2');
    assert.equal(injectedRow2Merge.e.c, 7, 'Injected row horizontal merge should span cols 2..7 (colSpan=6)');
    // Footer row shifted down to index 5 and kept its 10-column merge
    assert.equal(grid.displayRows[5][0], 'امضاء');
    const footerMerge = grid.effectiveMerges.find((m) => m.s.r === 5 && m.s.c === 0);
    assert.ok(footerMerge && footerMerge.e.c === 9, 'Footer row should preserve 10-column merge at shifted row 5');
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
