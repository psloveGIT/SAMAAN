export interface AutoColumnDescriptor {
  key: string;
  header: string;
  kind?: 'compact' | 'code' | 'fluid';
  minPercent?: number;
  maxPercent?: number;
}

export interface AutoColumnLayoutResult {
  widthsPercent: number[];
  recommendedFontPx: number;
}

function longestLineLength(text: string | number | null | undefined): number {
  if (text === null || text === undefined) return 0;
  const s = String(text).replace(/\r\n/g, '\n');
  if (!s.trim()) return 0;
  return s.split('\n').reduce((max, line) => Math.max(max, line.trim().length), 0);
}

/**
 * Computes content-proportional column widths (summing to 100%) for printable tables
 * so every column automatically expands or shrinks to fit its actual header & cell values.
 */
export function computeAutoColumnWidths(
  columns: readonly AutoColumnDescriptor[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
  options?: { baseFontPx?: number; minFontPx?: number },
): AutoColumnLayoutResult {
  if (columns.length === 0) {
    return { widthsPercent: [], recommendedFontPx: options?.baseFontPx ?? 9 };
  }

  const rawWeights: number[] = columns.map((col, colIdx) => {
    const headerLen = longestLineLength(col.header);
    let maxDataLen = 0;
    let totalDataLen = 0;
    let nonEmptyCount = 0;

    for (let r = 0; r < rows.length; r += 1) {
      const len = longestLineLength(rows[r]?.[colIdx]);
      if (len > 0) {
        nonEmptyCount += 1;
        totalDataLen += len;
        if (len > maxDataLen) maxDataLen = len;
      }
    }

    const avgDataLen = nonEmptyCount > 0 ? totalDataLen / nonEmptyCount : 0;
    const effectiveDataLen = maxDataLen * 0.7 + avgDataLen * 0.3;

    if (col.kind === 'compact') {
      return Math.max(3, Math.min(12, Math.max(headerLen * 0.65, effectiveDataLen + 1.5)));
    }
    if (col.kind === 'code') {
      return Math.max(5, Math.min(20, Math.max(headerLen * 0.75, effectiveDataLen + 2)));
    }
    // Fluid text columns (Description, Remark, Notes, Technical info)
    const base = Math.max(headerLen * 0.85, effectiveDataLen + 3);
    return Math.max(8, Math.min(48, base));
  });

  // Normalize to 100% while respecting optional minPercent/maxPercent bounds
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0) || 1;
  let widths = rawWeights.map((w, idx) => {
    const col = columns[idx];
    const pct = (w / totalWeight) * 100;
    const minP = col.minPercent ?? (col.kind === 'compact' ? 3 : col.kind === 'code' ? 5 : 9);
    const maxP = col.maxPercent ?? (col.kind === 'compact' ? 11 : col.kind === 'code' ? 18 : 42);
    return Math.min(maxP, Math.max(minP, pct));
  });

  // Final proportional normalization so total === 100%
  const clampedSum = widths.reduce((sum, w) => sum + w, 0) || 1;
  widths = widths.map((w) => Number(((w / clampedSum) * 100).toFixed(2)));

  // Adjust rounding drift on the widest column
  const finalSum = widths.reduce((sum, w) => sum + w, 0);
  if (widths.length > 0 && Math.abs(finalSum - 100) > 0.01) {
    let widestIdx = 0;
    for (let i = 1; i < widths.length; i += 1) {
      if (widths[i] > widths[widestIdx]) widestIdx = i;
    }
    widths[widestIdx] = Number((widths[widestIdx] + (100 - finalSum)).toFixed(2));
  }

  const baseFont = options?.baseFontPx ?? 9;
  const minFont = options?.minFontPx ?? 7.2;
  let recommendedFontPx = baseFont;
  if (columns.length >= 13) recommendedFontPx = Math.max(minFont, baseFont - 0.6);
  else if (columns.length >= 10) recommendedFontPx = Math.max(minFont, baseFont - 0.3);

  return { widthsPercent: widths, recommendedFontPx };
}
