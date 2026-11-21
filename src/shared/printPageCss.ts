/**
 * Generates a standardized @page CSS rule with automatic multi-page numbering
 * ("صفحه: # از #" in Persian / "Page: # of #" in English) so every printed form
 * and table across the application shows accurate page counts on all pages.
 */
export function buildPrintPageRule(
  orientation: 'portrait' | 'landscape' = 'portrait',
  isFa = true,
  margin: number | string = 8,
): string {
  const parsedMm =
    typeof margin === 'number'
      ? margin
      : Number.parseFloat(String(margin).replace(/[^\d.]/g, '')) || 8;
  const bottomMm = Math.max(parsedMm + 4, 12);
  const contentExpr = isFa
    ? '"صفحه: " counter(page) " از " counter(pages)'
    : '"Page: " counter(page) " of " counter(pages)';
  return `@page {
    size: A4 ${orientation};
    margin: ${parsedMm}mm ${parsedMm}mm ${bottomMm}mm ${parsedMm}mm;
    @bottom-center {
      content: ${contentExpr};
      font-family: 'Vazirmatn', 'Plus Jakarta Sans', system-ui, sans-serif;
      font-size: 8.5pt;
      font-weight: 600;
      color: #334155;
      direction: ${isFa ? 'rtl' : 'ltr'};
    }
  }`;
}
