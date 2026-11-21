export type ImportDeltaRowStatus = 'new' | 'modified' | 'unchanged';

export interface ImportDeltaSampleItem {
  keyLabel: string;
  changedFields: string[];
}

export interface ImportDeltaSummary {
  isIdentical: boolean;
  newCount: number;
  modifiedCount: number;
  unchangedCount: number;
  totalIncoming: number;
  changedFieldsSample: ImportDeltaSampleItem[];
}

export interface ImportDeltaAnalysis extends ImportDeltaSummary {
  rowStatuses: ImportDeltaRowStatus[];
}

export const DEFAULT_DELTA_IGNORED_KEYS = new Set<string>([
  'id',
  'rowNo',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'shortageBackfills',
  'itemImage',
  'itemImageThumb',
  'imageUrl',
  'sourceRow',
  'warnings',
  'duplicateRowIndexes',
  'rowIndex',
]);

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDeltaText(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx >= 0) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx >= 0) {
      out += String(aIdx);
      continue;
    }
    if (ch === 'ي' || ch === 'ى') {
      out += 'ی';
    } else if (ch === 'ك') {
      out += 'ک';
    } else if (ch === 'ة') {
      out += 'ه';
    } else if (ch === '\u200c' || ch === '\u00a0') {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function normalizeDeltaValue(val: unknown, ignoredKeys: Set<string> = DEFAULT_DELTA_IGNORED_KEYS): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    // Normalize -0 and floating point noise
    const rounded = Math.round(val * 1_000_000) / 1_000_000;
    return rounded === 0 ? '0' : String(rounded);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  if (typeof val === 'string') {
    const cleaned = normalizeDeltaText(val);
    if (!cleaned) return '';
    // Normalize pure numeric strings unless they have meaningful leading zeros (e.g., "0012")
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(cleaned)) {
      const n = Number(cleaned);
      if (Number.isFinite(n)) {
        const rounded = Math.round(n * 1_000_000) / 1_000_000;
        return rounded === 0 ? '0' : String(rounded);
      }
    }
    return cleaned;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    return JSON.stringify(val.map((item) => normalizeDeltaValue(item, ignoredKeys)));
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => !ignoredKeys.has(k) && obj[k] !== undefined)
      .sort();
    if (keys.length === 0) return '';
    const canonical: Record<string, string> = {};
    let hasNonEmpty = false;
    for (const k of keys) {
      const nv = normalizeDeltaValue(obj[k], ignoredKeys);
      if (nv !== '') {
        canonical[k] = nv;
        hasNonEmpty = true;
      }
    }
    return hasNonEmpty ? JSON.stringify(canonical) : '';
  }
  return normalizeDeltaText(String(val));
}

export function diffRecordFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
  ignoredKeys: Set<string> = DEFAULT_DELTA_IGNORED_KEYS,
): string[] {
  if (!existing || !incoming) return [];
  const changed: string[] = [];
  for (const key of Object.keys(incoming)) {
    if (ignoredKeys.has(key)) continue;
    const inVal = incoming[key];
    if (inVal === undefined) continue;
    const exVal = existing[key];
    const normIn = normalizeDeltaValue(inVal, ignoredKeys);
    const normEx = normalizeDeltaValue(exVal, ignoredKeys);
    // An omitted/blank column in a re-uploaded file should not falsely flag
    // fields that were auto-enriched or populated in the DB as "modified".
    if (normIn === '' && normEx !== '') continue;
    if (normIn !== normEx) {
      changed.push(key);
    }
  }
  return changed;
}

export function hasRecordMeaningfulChanges(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
  ignoredKeys: Set<string> = DEFAULT_DELTA_IGNORED_KEYS,
): boolean {
  return diffRecordFields(existing, incoming, ignoredKeys).length > 0;
}

export function analyzeImportDelta<
  TExisting extends Record<string, unknown>,
  TIncoming extends Record<string, unknown>,
>(params: {
  incomingRows: TIncoming[];
  existingRows: TExisting[];
  getIncomingKey: (row: TIncoming, index: number) => string;
  getExistingKey: (row: TExisting) => string;
  getKeyLabel?: (row: TIncoming, key: string, index: number) => string;
  ignoredKeys?: Set<string>;
  maxSamples?: number;
}): ImportDeltaAnalysis {
  const {
    incomingRows,
    existingRows,
    getIncomingKey,
    getExistingKey,
    getKeyLabel,
    ignoredKeys = DEFAULT_DELTA_IGNORED_KEYS,
    maxSamples = 15,
  } = params;

  const existingByKey = new Map<string, TExisting>();
  for (const ex of existingRows) {
    const k = normalizeDeltaText(getExistingKey(ex)).toLowerCase();
    if (k && !existingByKey.has(k)) {
      existingByKey.set(k, ex);
    }
  }

  let newCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;
  const changedFieldsSample: ImportDeltaSampleItem[] = [];
  const rowStatuses: ImportDeltaRowStatus[] = [];

  for (let i = 0; i < incomingRows.length; i += 1) {
    const row = incomingRows[i];
    const rawKey = getIncomingKey(row, i);
    const normKey = normalizeDeltaText(rawKey).toLowerCase();
    const existing = normKey ? existingByKey.get(normKey) : undefined;
    if (!existing) {
      newCount += 1;
      rowStatuses.push('new');
      continue;
    }
    const changedFields = diffRecordFields(existing, row, ignoredKeys);
    if (changedFields.length === 0) {
      unchangedCount += 1;
      rowStatuses.push('unchanged');
    } else {
      modifiedCount += 1;
      rowStatuses.push('modified');
      if (changedFieldsSample.length < maxSamples) {
        const keyLabel = getKeyLabel ? getKeyLabel(row, rawKey, i) : rawKey || `#${i + 1}`;
        changedFieldsSample.push({ keyLabel, changedFields });
      }
    }
  }

  return {
    isIdentical: incomingRows.length > 0 && newCount === 0 && modifiedCount === 0,
    newCount,
    modifiedCount,
    unchangedCount,
    totalIncoming: incomingRows.length,
    changedFieldsSample,
    rowStatuses,
  };
}

/**
 * Fast synchronous deterministic fingerprint for an imported file's sheet matrices
 * so re-uploading the exact same file can be flagged immediately.
 */
export function computeImportContentFingerprint(
  fileName: string,
  sheets: Record<string, unknown[][]>,
): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      const c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + (i & 0xff);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
  };
  const sheetNames = Object.keys(sheets).sort();
  feed(`sheets:${sheetNames.length}|`);
  for (const name of sheetNames) {
    const rows = Array.isArray(sheets[name]) ? sheets[name] : [];
    feed(`#${name}:${rows.length}|`);
    // Sample densely for small files and uniformly for huge files (>4000 rows) to stay <20ms
    const step = rows.length > 4000 ? Math.ceil(rows.length / 4000) : 1;
    for (let r = 0; r < rows.length; r += step) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c += 1) {
        const cell = row[c];
        if (cell !== null && cell !== undefined && cell !== '') {
          feed(`${r},${c}=${String(cell)};`);
        }
      }
    }
    // Always include last row so appending 1 row at the end changes fingerprint
    if (rows.length > 1) {
      const last = rows[rows.length - 1];
      if (Array.isArray(last)) {
        feed(`last:${last.map((x) => (x == null ? '' : String(x))).join('|')}`);
      }
    }
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}:${sheetNames.length}:${fileName.trim().toLowerCase()}`;
}
