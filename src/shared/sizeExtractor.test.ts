import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSizeFromDescription } from './sizeExtractor.ts';

test('inferSizeFromDescription extracts pipe DN, inch, and schedule sizes', () => {
  assert.equal(inferSizeFromDescription('GATE VALVE DN50 PN16 A105'), 'DN50 PN16');
  assert.equal(inferSizeFromDescription('PIPE 2" SCH80 SMLS A106 GR.B'), '2" SCH80');
  assert.equal(inferSizeFromDescription('ELBOW 90 DEG 1-1/2" 300#'), '1-1/2" 300#');
  assert.equal(inferSizeFromDescription('REDUCER DN100x80'), 'DN100x80');
});

test('inferSizeFromDescription extracts metric bolts, cables, steel profiles, and dimensions', () => {
  assert.equal(inferSizeFromDescription('HEX BOLT M12x40 DIN933 GALV'), 'M12x40');
  assert.equal(inferSizeFromDescription('POWER CABLE NYY 3x2.5mm2 0.6/1KV'), '3x2.5mm2');
  assert.equal(inferSizeFromDescription('STRUCTURAL BEAM IPE 200 ST37'), 'IPE 200');
  assert.equal(inferSizeFromDescription('ANGLE BAR L50x50x5 ST37'), 'L50X50X5');
  assert.equal(inferSizeFromDescription('STEEL PLATE 1200x2400x10 mm A36'), '1200x2400x10mm');
  assert.equal(inferSizeFromDescription('شیر کشویی ۲ اینچ فشار قوی'), '2 اینچ');
  assert.equal(inferSizeFromDescription('واشر لاستیکی Ø50'), 'Ø50');
});

test('inferSizeFromDescription returns empty string when description has no size', () => {
  assert.equal(inferSizeFromDescription('ELECTRIC MOTOR CONTROL PANEL'), '');
  assert.equal(inferSizeFromDescription(''), '');
  assert.equal(inferSizeFromDescription(null), '');
});
