import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeImportDelta,
  computeImportContentFingerprint,
  diffRecordFields,
  hasRecordMeaningfulChanges,
  normalizeDeltaValue,
} from './importDelta.ts';

describe('importDelta', () => {
  it('normalizes Persian/Arabic digits, Yeh/Kaf, whitespace, and numeric strings', () => {
    assert.equal(normalizeDeltaValue('۱۲۳'), normalizeDeltaValue(123));
    assert.equal(normalizeDeltaValue('10.00'), normalizeDeltaValue(10));
    assert.equal(normalizeDeltaValue('كالا ي شماره ۱'), normalizeDeltaValue('کالا ی شماره 1'));
    assert.equal(normalizeDeltaValue('0012'), '0012');
    assert.notEqual(normalizeDeltaValue('0012'), normalizeDeltaValue('12'));
    assert.equal(normalizeDeltaValue(null), '');
    assert.equal(normalizeDeltaValue('   '), '');
  });

  it('ignores volatile metadata fields like id, rowNo, createdAt, updatedAt, itemImage', () => {
    const existing = {
      id: 'db-1',
      rowNo: 5,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      itemImage: 'data:image/png;base64,AAA',
      packingNo: 'PK-100',
      itemNo: '1',
      packingQty: 10,
      description: 'Gate Valve 8"',
    };
    const incoming = {
      id: 'temp-99',
      rowNo: 1,
      updatedAt: '2026-05-22',
      packingNo: 'PK-100',
      itemNo: '۱',
      packingQty: '10',
      description: 'Gate Valve 8"',
    };
    assert.deepEqual(diffRecordFields(existing, incoming), []);
    assert.equal(hasRecordMeaningfulChanges(existing, incoming), false);
  });

  it('detects identical re-upload with zero changes', () => {
    const existingRows = [
      { id: '1', packingNo: 'PK-1', itemNo: '1', description: 'Pump A', packingQty: 4, mapnaInventory: 4 },
      { id: '2', packingNo: 'PK-1', itemNo: '2', description: 'Valve B', packingQty: 8, mapnaInventory: 6 },
    ];
    const incomingRows = [
      { packingNo: 'PK-1', itemNo: '1', description: 'Pump A', packingQty: 4, mapnaInventory: 4 },
      { packingNo: 'PK-1', itemNo: '2', description: 'Valve B', packingQty: 8, mapnaInventory: 6 },
    ];
    const result = analyzeImportDelta({
      incomingRows,
      existingRows,
      getIncomingKey: (r) => `${r.packingNo}::${r.itemNo}`,
      getExistingKey: (r) => `${r.packingNo}::${r.itemNo}`,
    });
    assert.equal(result.isIdentical, true);
    assert.equal(result.newCount, 0);
    assert.equal(result.modifiedCount, 0);
    assert.equal(result.unchangedCount, 2);
    assert.deepEqual(result.rowStatuses, ['unchanged', 'unchanged']);
  });

  it('distinguishes new, modified, and unchanged rows and reports exact changed fields', () => {
    const existingRows = [
      { id: '1', packingNo: 'PK-1', itemNo: '1', description: 'Pump A', packingQty: 4, mivQty: 0 },
      { id: '2', packingNo: 'PK-1', itemNo: '2', description: 'Valve B', packingQty: 8, mivQty: 2 },
    ];
    const incomingRows = [
      { packingNo: 'PK-1', itemNo: '1', description: 'Pump A', packingQty: 4, mivQty: 0 }, // unchanged
      { packingNo: 'PK-1', itemNo: '2', description: 'Valve B', packingQty: 8, mivQty: 5 }, // modified (mivQty)
      { packingNo: 'PK-2', itemNo: '1', description: 'Motor C', packingQty: 1, mivQty: 0 }, // new
    ];
    const result = analyzeImportDelta({
      incomingRows,
      existingRows,
      getIncomingKey: (r) => `${r.packingNo}::${r.itemNo}`,
      getExistingKey: (r) => `${r.packingNo}::${r.itemNo}`,
      getKeyLabel: (r) => `${r.packingNo} / ${r.itemNo}`,
    });
    assert.equal(result.isIdentical, false);
    assert.equal(result.unchangedCount, 1);
    assert.equal(result.modifiedCount, 1);
    assert.equal(result.newCount, 1);
    assert.deepEqual(result.rowStatuses, ['unchanged', 'modified', 'new']);
    assert.equal(result.changedFieldsSample.length, 1);
    assert.equal(result.changedFieldsSample[0].keyLabel, 'PK-1 / 2');
    assert.deepEqual(result.changedFieldsSample[0].changedFields, ['mivQty']);
  });

  it('produces identical content fingerprints for identical workbooks and different fingerprints when a cell changes', () => {
    const fp1 = computeImportContentFingerprint('master.xlsx', {
      Sheet1: [['PK', 'Qty'], ['PK-1', 10]],
    });
    const fp2 = computeImportContentFingerprint('master.xlsx', {
      Sheet1: [['PK', 'Qty'], ['PK-1', 10]],
    });
    const fp3 = computeImportContentFingerprint('master.xlsx', {
      Sheet1: [['PK', 'Qty'], ['PK-1', 11]],
    });
    assert.equal(fp1, fp2);
    assert.notEqual(fp1, fp3);
  });
});
