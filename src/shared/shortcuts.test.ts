import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHORTCUT_MAP,
  eventToCombo,
  findShortcutConflict,
  isValidCustomShortcutCombo,
  matchesShortcutEvent,
  mergeUserShortcuts,
  normalizeCombo,
  splitComboKeys,
} from './shortcuts.ts';

describe('Excel-style keyboard shortcuts engine', () => {
  it('matches Ctrl+Z and Ctrl+Y on both English and Persian keyboard layouts using event.code', () => {
    // English keyboard layout
    assert.equal(
      matchesShortcutEvent({ key: 'z', code: 'KeyZ', ctrlKey: true }, 'Ctrl+Z'),
      true,
    );
    assert.equal(
      matchesShortcutEvent({ key: 'y', code: 'KeyY', ctrlKey: true }, 'Ctrl+Y'),
      true,
    );

    // Persian keyboard layout (Ctrl+ظ -> KeyZ, Ctrl+غ -> KeyY, Ctrl+ب -> KeyF)
    assert.equal(
      matchesShortcutEvent({ key: 'ظ', code: 'KeyZ', ctrlKey: true }, 'Ctrl+Z'),
      true,
    );
    assert.equal(
      matchesShortcutEvent({ key: 'غ', code: 'KeyY', ctrlKey: true }, 'Ctrl+Y'),
      true,
    );
    assert.equal(
      matchesShortcutEvent({ key: 'ب', code: 'KeyF', ctrlKey: true }, 'Ctrl+F'),
      true,
    );
    assert.equal(
      matchesShortcutEvent({ key: '۱', code: 'Digit1', altKey: true }, 'Alt+1'),
      true,
    );
  });

  it('normalizes user combo strings and detects conflicts accurately', () => {
    assert.equal(normalizeCombo('ctrl + shift + s'), 'Ctrl+Shift+S');
    assert.equal(normalizeCombo('alt+2'), 'Alt+2');
    assert.deepEqual(splitComboKeys('Ctrl+Shift+Z'), ['Ctrl', 'Shift', 'Z']);

    assert.equal(isValidCustomShortcutCombo('Ctrl+Z'), true);
    assert.equal(isValidCustomShortcutCombo('F2'), true);
    assert.equal(isValidCustomShortcutCombo('A'), false);
    assert.equal(isValidCustomShortcutCombo('Escape'), false);

    const conflict = findShortcutConflict('aiAssistant', 'Ctrl+Z', DEFAULT_SHORTCUT_MAP);
    assert.ok(conflict);
    assert.equal(conflict.id, 'undo');

    const selfNoConflict = findShortcutConflict('undo', 'Ctrl+Z', DEFAULT_SHORTCUT_MAP);
    assert.equal(selfNoConflict, null);
  });

  it('merges custom shortcuts over Excel defaults and ignores invalid overrides', () => {
    const merged = mergeUserShortcuts({
      aiAssistant: 'ctrl + shift + a',
      navDetailed: 'Alt+9',
      undo: 'A', // invalid single letter -> ignored, stays Ctrl+Z
    });
    assert.equal(merged.aiAssistant, 'Ctrl+Shift+A');
    assert.equal(merged.navDetailed, 'Alt+9');
    assert.equal(merged.undo, 'Ctrl+Z');
    assert.equal(merged.redo, 'Ctrl+Y');
  });

  it('returns null from eventToCombo when only modifier keys are pressed', () => {
    assert.equal(eventToCombo({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), null);
    assert.equal(eventToCombo({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), null);
    assert.equal(eventToCombo({ key: '/', code: 'Slash', ctrlKey: true }), 'Ctrl+/');
  });
});
