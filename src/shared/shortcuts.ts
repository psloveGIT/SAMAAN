export type ShortcutCategory = 'editing' | 'navigation' | 'table' | 'workspace';

export type ShortcutActionId =
  | 'undo'
  | 'redo'
  | 'save'
  | 'find'
  | 'newPacking'
  | 'print'
  | 'exportExcel'
  | 'clearFilters'
  | 'refreshData'
  | 'aiAssistant'
  | 'shortcutsSettings'
  | 'navDashboard'
  | 'navGeneral'
  | 'navDetailed'
  | 'navTransit'
  | 'navGlobalSearch'
  | 'navCategories'
  | 'navTrash'
  | 'toggleTheme'
  | 'toggleLanguage';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  category: ShortcutCategory;
  labelFa: string;
  labelEn: string;
  descriptionFa: string;
  descriptionEn: string;
  defaultCombo: string;
  /** Whether the shortcut should fire even when focus is inside an input/textarea */
  allowInInputs?: boolean;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Editing & Undo/Redo (Excel Standard)
  {
    id: 'undo',
    category: 'editing',
    labelFa: 'بازگردانی آخرین عملیات (Undo)',
    labelEn: 'Undo Last Action',
    descriptionFa: 'لغو و بازگردانی آخرین تغییر ثبت‌شده در داده‌های انبار (مشابه اکسل)',
    descriptionEn: 'Revert the last recorded warehouse data change (like Excel)',
    defaultCombo: 'Ctrl+Z',
    allowInInputs: false,
  },
  {
    id: 'redo',
    category: 'editing',
    labelFa: 'انجام مجدد عملیات (Redo)',
    labelEn: 'Redo Action',
    descriptionFa: 'اعمال مجدد آخرین تغییری که بازگردانی شده است (مشابه اکسل)',
    descriptionEn: 'Re-apply the most recently undone change (like Excel)',
    defaultCombo: 'Ctrl+Y',
    allowInInputs: false,
  },
  {
    id: 'save',
    category: 'editing',
    labelFa: 'ذخیره فرم یا پنجره فعال',
    labelEn: 'Save Active Form / Dialog',
    descriptionFa: 'ثبت و ذخیره سریع فرم یا پنجره ویرایش باز (مشابه Ctrl+S در اکسل)',
    descriptionEn: 'Quickly submit and save the currently open edit dialog or form',
    defaultCombo: 'Ctrl+S',
    allowInInputs: true,
  },
  {
    id: 'newPacking',
    category: 'editing',
    labelFa: 'ثبت پکینگ / ورود جدید',
    labelEn: 'New Packing / Entry',
    descriptionFa: 'باز کردن فرم ثبت پکینگ لیست یا ورود جدید تجهیزات',
    descriptionEn: 'Open the New Packing List / Equipment Entry modal',
    defaultCombo: 'Alt+N',
    allowInInputs: true,
  },

  // Table & Search Actions
  {
    id: 'find',
    category: 'table',
    labelFa: 'جست‌وجو در صفحه یا جست‌وجوی سراسری',
    labelEn: 'Find / Focus Search',
    descriptionFa: 'انتقال مکان‌نما به کادر جست‌وجوی صفحه فعلی یا باز کردن جست‌وجوی سراسری',
    descriptionEn: 'Focus the active view search input or jump to Global Search',
    defaultCombo: 'Ctrl+F',
    allowInInputs: true,
  },
  {
    id: 'exportExcel',
    category: 'table',
    labelFa: 'خروجی اکسل جدول فعال',
    labelEn: 'Export Active Table to Excel',
    descriptionFa: 'دریافت فایل اکسل از داده‌های فیلترشده در صفحه فعلی',
    descriptionEn: 'Export the currently filtered rows in the active table to Excel',
    defaultCombo: 'Ctrl+E',
    allowInInputs: false,
  },
  {
    id: 'print',
    category: 'table',
    labelFa: 'چاپ / گزارش‌گیری',
    labelEn: 'Print / Report',
    descriptionFa: 'باز کردن پنجره چاپ و گزارش‌گیری جدول یا فرم فعال',
    descriptionEn: 'Open print dialog or printable report for the active view',
    defaultCombo: 'Ctrl+P',
    allowInInputs: true,
  },
  {
    id: 'clearFilters',
    category: 'table',
    labelFa: 'پاک کردن فیلترهای جدول',
    labelEn: 'Clear Table Filters',
    descriptionFa: 'حذف سریع تمامی فیلترهای ستون‌ها و جست‌وجو در صفحه فعلی',
    descriptionEn: 'Reset all active column filters and search queries in the current table',
    defaultCombo: 'Alt+C',
    allowInInputs: false,
  },
  {
    id: 'refreshData',
    category: 'table',
    labelFa: 'بروزرسانی داده‌ها',
    labelEn: 'Refresh Data',
    descriptionFa: 'بارگذاری مجدد اطلاعات صفحه فعال از پایگاه داده',
    descriptionEn: 'Reload the active view data from the database',
    defaultCombo: 'Alt+R',
    allowInInputs: true,
  },

  // Quick Navigation
  {
    id: 'navDashboard',
    category: 'navigation',
    labelFa: 'رفتن به داشبورد تحلیلی',
    labelEn: 'Go to Analytics Dashboard',
    descriptionFa: 'انتقال سریع به نمای داشبورد تحلیلی و شاخص‌های کلیدی',
    descriptionEn: 'Switch to the Analytics Dashboard view',
    defaultCombo: 'Alt+1',
    allowInInputs: true,
  },
  {
    id: 'navGeneral',
    category: 'navigation',
    labelFa: 'رفتن به ثبت کلی تجهیزات',
    labelEn: 'Go to General Equipment',
    descriptionFa: 'انتقال سریع به جدول ثبت کلی تجهیزات',
    descriptionEn: 'Switch to the General Equipment register',
    defaultCombo: 'Alt+2',
    allowInInputs: true,
  },
  {
    id: 'navDetailed',
    category: 'navigation',
    labelFa: 'رفتن به ثبت جزئیات تجهیزات',
    labelEn: 'Go to Detailed Equipment',
    descriptionFa: 'انتقال سریع به جدول جزئیات اقلام تجهیزات',
    descriptionEn: 'Switch to the Detailed Equipment register',
    defaultCombo: 'Alt+3',
    allowInInputs: true,
  },
  {
    id: 'navTransit',
    category: 'navigation',
    labelFa: 'رفتن به تجهیزات در راه',
    labelEn: 'Go to In-Transit Equipment',
    descriptionFa: 'انتقال سریع به بخش پیگیری محموله‌های در راه',
    descriptionEn: 'Switch to the In-Transit Equipment view',
    defaultCombo: 'Alt+4',
    allowInInputs: true,
  },
  {
    id: 'navGlobalSearch',
    category: 'navigation',
    labelFa: 'رفتن به جست‌وجوی سراسری',
    labelEn: 'Go to Global Search',
    descriptionFa: 'باز کردن صفحه جست‌وجوی سراسری در کل سامانه',
    descriptionEn: 'Open the cross-register Global Search view',
    defaultCombo: 'Alt+5',
    allowInInputs: true,
  },
  {
    id: 'navCategories',
    category: 'navigation',
    labelFa: 'رفتن به مدیریت دسته‌بندی‌ها',
    labelEn: 'Go to Categories',
    descriptionFa: 'انتقال سریع به بخش مدیریت دسته‌بندی‌ها و مقادیر پایه',
    descriptionEn: 'Switch to Categories & Master Lists management',
    defaultCombo: 'Alt+6',
    allowInInputs: true,
  },
  {
    id: 'navTrash',
    category: 'navigation',
    labelFa: 'رفتن به سطل بازیافت',
    labelEn: 'Go to Recycle Bin',
    descriptionFa: 'انتقال سریع به بخش سطل بازیافت و بازیابی رکوردهای حذف‌شده',
    descriptionEn: 'Switch to the Recycle Bin view',
    defaultCombo: 'Alt+7',
    allowInInputs: true,
  },

  // Workspace & Tools
  {
    id: 'aiAssistant',
    category: 'workspace',
    labelFa: 'باز / بسته کردن دستیار هوشمند',
    labelEn: 'Toggle AI Assistant',
    descriptionFa: 'باز یا بسته کردن پنل دستیار هوشمند تحلیل انبار',
    descriptionEn: 'Open or close the SAMAAN AI Assistant drawer',
    defaultCombo: 'Ctrl+K',
    allowInInputs: true,
  },
  {
    id: 'shortcutsSettings',
    category: 'workspace',
    labelFa: 'راهنما و تنظیمات کلیدهای میانبر',
    labelEn: 'Keyboard Shortcuts Settings',
    descriptionFa: 'باز کردن پنجره مشاهده و شخصی‌سازی کلیدهای میانبر',
    descriptionEn: 'Open the Keyboard Shortcuts reference & customization modal',
    defaultCombo: 'Ctrl+/',
    allowInInputs: true,
  },
  {
    id: 'toggleTheme',
    category: 'workspace',
    labelFa: 'تغییر حالت روشن / تاریک',
    labelEn: 'Toggle Light / Dark Theme',
    descriptionFa: 'جابه‌جایی سریع بین پوسته روشن و تاریک سامانه',
    descriptionEn: 'Switch between Light and Dark theme modes',
    defaultCombo: 'Alt+T',
    allowInInputs: false,
  },
  {
    id: 'toggleLanguage',
    category: 'workspace',
    labelFa: 'تغییر زبان (فارسی / انگلیسی)',
    labelEn: 'Toggle Language (FA / EN)',
    descriptionFa: 'جابه‌جایی سریع زبان رابط کاربری بین فارسی و انگلیسی',
    descriptionEn: 'Switch UI language between Persian and English',
    defaultCombo: 'Alt+L',
    allowInInputs: false,
  },
];

export const DEFAULT_SHORTCUT_MAP: Record<ShortcutActionId, string> = SHORTCUT_DEFINITIONS.reduce(
  (acc, def) => {
    acc[def.id] = def.defaultCombo;
    return acc;
  },
  {} as Record<ShortcutActionId, string>,
);

const MODIFIER_KEYS = new Set([
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const CODE_TO_KEY_MAP: Record<string, string> = {
  Slash: '/',
  Backslash: '\\',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Tab: 'Tab',
};

/**
 * Extracts a physical-layout-independent canonical key name from a KeyboardEvent-like object.
 * Crucial for Persian keyboard layouts where pressing Ctrl+Z produces `key: 'ظ'` while `code: 'KeyZ'`.
 */
export function extractCanonicalKey(e: { key?: string; code?: string }): string | null {
  const code = (e.code || '').trim();
  const key = (e.key || '').trim();

  if (MODIFIER_KEYS.has(code) || MODIFIER_KEYS.has(key)) {
    return null;
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3); // KeyZ -> Z
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5); // Digit1 -> 1
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return code.slice(6);
  }
  if (/^F([1-9]|1[0-2])$/.test(code)) {
    return code; // F1..F12
  }
  if (CODE_TO_KEY_MAP[code]) {
    return CODE_TO_KEY_MAP[code];
  }

  // Fallback to event.key if code is absent or non-standard
  if (!key || key === 'Unidentified' || key === 'Dead' || key === 'Process') {
    return null;
  }
  if (key.length === 1) {
    return key === ' ' ? 'Space' : key.toUpperCase();
  }
  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    return key.toUpperCase();
  }
  if (key.startsWith('Arrow')) {
    return key.slice(5);
  }
  return key;
}

export interface KeyEventLike {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Converts a KeyboardEvent into a normalized canonical shortcut combo string,
 * e.g. "Ctrl+Z", "Ctrl+Shift+Y", "Alt+1", "F5". Returns null if only modifiers were pressed.
 */
export function eventToCombo(e: KeyEventLike): string | null {
  const mainKey = extractCanonicalKey(e);
  if (!mainKey) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(mainKey);
  return parts.join('+');
}

/**
 * Normalizes a stored or user-entered combo string (e.g. "ctrl + shift + z" -> "Ctrl+Shift+Z").
 */
export function normalizeCombo(raw: string | undefined | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  const tokens = trimmed
    .split('+')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return '';

  let hasCtrl = false;
  let hasAlt = false;
  let hasShift = false;
  let mainKey = '';

  for (const tok of tokens) {
    const low = tok.toLowerCase();
    if (low === 'ctrl' || low === 'control' || low === 'cmd' || low === 'meta') {
      hasCtrl = true;
    } else if (low === 'alt' || low === 'option') {
      hasAlt = true;
    } else if (low === 'shift') {
      hasShift = true;
    } else if (tok.length === 1) {
      mainKey = tok.toUpperCase();
    } else if (/^f([1-9]|1[0-2])$/i.test(tok)) {
      mainKey = tok.toUpperCase();
    } else {
      mainKey = tok.charAt(0).toUpperCase() + tok.slice(1);
    }
  }

  if (!mainKey) return '';
  const out: string[] = [];
  if (hasCtrl) out.push('Ctrl');
  if (hasAlt) out.push('Alt');
  if (hasShift) out.push('Shift');
  out.push(mainKey);
  return out.join('+');
}

/**
 * Checks whether a shortcut combo is valid for custom binding (requires at least Ctrl/Alt or a Function key F1-F12
 * so users don't accidentally bind single typing letters like "A" or "Space").
 */
export function isValidCustomShortcutCombo(combo: string): boolean {
  const norm = normalizeCombo(combo);
  if (!norm) return false;
  const parts = norm.split('+');
  const mainKey = parts[parts.length - 1];
  const hasCtrlOrAlt = parts.includes('Ctrl') || parts.includes('Alt');
  const isFnKey = /^F([1-9]|1[0-2])$/.test(mainKey);
  if (mainKey === 'Escape') return false;
  return hasCtrlOrAlt || isFnKey;
}

/**
 * Matches a browser KeyboardEvent against a normalized shortcut combo string.
 */
export function matchesShortcutEvent(e: KeyEventLike, combo: string | undefined | null): boolean {
  const target = normalizeCombo(combo);
  if (!target) return false;
  const actual = eventToCombo(e);
  if (!actual) return false;
  return actual === target;
}

/**
 * Merges user-customized shortcuts over DEFAULT_SHORTCUT_MAP safely.
 */
export function mergeUserShortcuts(
  custom?: Record<string, string> | null,
): Record<ShortcutActionId, string> {
  const merged: Record<ShortcutActionId, string> = { ...DEFAULT_SHORTCUT_MAP };
  if (!custom || typeof custom !== 'object') return merged;

  for (const def of SHORTCUT_DEFINITIONS) {
    const val = custom[def.id];
    if (typeof val === 'string') {
      const norm = normalizeCombo(val);
      if (norm && isValidCustomShortcutCombo(norm)) {
        merged[def.id] = norm;
      } else if (val === '') {
        // Explicit empty string disables a shortcut if user clears it
        merged[def.id] = '';
      }
    }
  }
  return merged;
}

/**
 * Finds if another action already uses the given combo.
 */
export function findShortcutConflict(
  actionId: ShortcutActionId,
  newCombo: string,
  currentMap: Record<ShortcutActionId, string>,
): ShortcutDefinition | null {
  const norm = normalizeCombo(newCombo);
  if (!norm) return null;
  for (const def of SHORTCUT_DEFINITIONS) {
    if (def.id === actionId) continue;
    if (normalizeCombo(currentMap[def.id]) === norm) {
      return def;
    }
  }
  return null;
}

/**
 * Splits a combo string into individual key cap tokens for crisp visual <kbd> badges.
 */
export function splitComboKeys(combo: string | undefined | null): string[] {
  const norm = normalizeCombo(combo);
  if (!norm) return [];
  return norm.split('+');
}

/**
 * Checks whether the currently focused DOM element is an editable text field.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (target as HTMLInputElement).type.toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(type);
  }
  if (tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}
