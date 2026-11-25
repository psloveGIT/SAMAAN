import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAutoColumnWidths } from './printAutoLayout.ts';

test('computeAutoColumnWidths allocates more width to long text columns and sums to 100%', () => {
  const res = computeAutoColumnWidths(
    [
      { key: 'no', header: 'No', kind: 'compact' },
      { key: 'desc', header: 'Description Of Material', kind: 'fluid' },
      { key: 'uom', header: 'UOM', kind: 'compact' },
      { key: 'remark', header: 'Remark', kind: 'fluid' },
    ],
    [
      ['1', 'High Pressure Steam Turbine Bearing Temperature Sensor Assembly Type-A', 'عدد', 'توضیحات تکمیلی تحویل'],
      ['2', 'Bolt M12', 'عدد', ''],
    ],
  );

  const sum = res.widthsPercent.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 0.05, `Expected sum ~100, got ${sum}`);
  // Description must be strictly wider than No and UOM
  assert.ok(res.widthsPercent[1] > res.widthsPercent[0] * 2);
  assert.ok(res.widthsPercent[1] > res.widthsPercent[2] * 2);
});

test('computeAutoColumnWidths shrinks empty columns cleanly', () => {
  const res = computeAutoColumnWidths(
    [
      { key: 'no', header: 'No', kind: 'compact' },
      { key: 'opi', header: 'OPI No.', kind: 'compact' },
      { key: 'desc', header: 'Description', kind: 'fluid' },
    ],
    [['1', '', 'Very Long Equipment Description Line 1\nSecond Line']],
  );
  assert.ok(res.widthsPercent[2] > 50);
  assert.ok(res.widthsPercent[1] < 20);
});
