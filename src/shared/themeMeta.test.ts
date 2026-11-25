import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDocumentThemeMeta } from './themeMeta.ts';

test('resolveDocumentThemeMeta uses only light and crisp white theme-color in Light Mode', () => {
  const meta = resolveDocumentThemeMeta('light', false);
  assert.equal(meta.colorScheme, 'only light');
  assert.equal(meta.metaColorScheme, 'light only');
  assert.equal(meta.themeColor, '#ffffff');
  assert.equal(meta.backgroundColor, '#f8fafc');
  assert.equal(meta.isDark, false);
  assert.equal(meta.isEyeComfort, false);
});

test('resolveDocumentThemeMeta uses only dark and dark navy theme-color in Dark Mode', () => {
  const meta = resolveDocumentThemeMeta('dark', false);
  assert.equal(meta.colorScheme, 'only dark');
  assert.equal(meta.metaColorScheme, 'dark only');
  assert.equal(meta.themeColor, '#0b111b');
  assert.equal(meta.backgroundColor, '#0b111b');
  assert.equal(meta.isDark, true);
  assert.equal(meta.isEyeComfort, false);
});

test('resolveDocumentThemeMeta handles Eye-Comfort Light and Dark modes accurately', () => {
  const lightEye = resolveDocumentThemeMeta('light', true);
  assert.equal(lightEye.colorScheme, 'only light');
  assert.equal(lightEye.themeColor, '#f5efe3');
  assert.equal(lightEye.isDark, false);
  assert.equal(lightEye.isEyeComfort, true);

  const darkEye = resolveDocumentThemeMeta('dark', true);
  assert.equal(darkEye.colorScheme, 'only dark');
  assert.equal(darkEye.themeColor, '#171410');
  assert.equal(darkEye.isDark, true);
  assert.equal(darkEye.isEyeComfort, true);
});
