/**
 * Unified Print Page & Safe Margin CSS Engine for SAMAAN.
 *
 * Guarantees TWO invariants for ALL current and future printable forms:
 * 1. Standard Safe Print Margins (default 12mm, minimum clamped to 10mm):
 *    Forms never touch or clip against the physical paper edge on any printer or PDF driver.
 * 2. Strict Print Portal Isolation:
 *    When printing an official form, ONLY the dedicated print portal prints — never the
 *    live application UI / sidebar / modal backdrop behind it.
 */

export const STANDARD_PRINT_MARGIN_MM = 12;
export const MIN_SAFE_PRINT_MARGIN_MM = 10;

export function normalizeSafePrintMarginMm(margin?: number | string): number {
  const parsed =
    typeof margin === 'number'
      ? margin
      : margin !== undefined
        ? Number.parseFloat(String(margin).replace(/[^\d.]/g, ''))
        : STANDARD_PRINT_MARGIN_MM;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return STANDARD_PRINT_MARGIN_MM;
  }
  return Math.max(MIN_SAFE_PRINT_MARGIN_MM, parsed);
}

/**
 * Generates a standardized @page CSS rule with safe white margins on all 4 edges
 * and optional automatic browser page numbering ("صفحه: # از #" / "Page: # of #").
 */
export function buildPrintPageRule(
  orientation: 'portrait' | 'landscape' = 'portrait',
  isFa = true,
  margin: number | string = STANDARD_PRINT_MARGIN_MM,
  options?: {
    pageName?: string;
    showBrowserPageFooter?: boolean;
  },
): string {
  const safeMm = normalizeSafePrintMarginMm(margin);
  const showFooter = options?.showBrowserPageFooter ?? true;
  const bottomMm = showFooter ? Math.max(safeMm + 3, 15) : safeMm;
  const pageSelector = options?.pageName ? `@page ${options.pageName}` : '@page';
  const contentExpr = isFa
    ? '"صفحه: " counter(page) " از " counter(pages)'
    : '"Page: " counter(page) " of " counter(pages)';

  if (!showFooter) {
    return `${pageSelector} {
    size: A4 ${orientation};
    margin: ${safeMm}mm;
  }`;
  }

  return `${pageSelector} {
    size: A4 ${orientation};
    margin: ${safeMm}mm ${safeMm}mm ${bottomMm}mm ${safeMm}mm;
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

export interface IsolatedPrintPortalOptions {
  orientation?: 'portrait' | 'landscape' | 'mixed';
  isFa?: boolean;
  marginMm?: number;
  showBrowserPageFooter?: boolean;
  extraPrintCss?: string;
}

/**
 * Generates complete, self-contained print isolation CSS for a document.body portal.
 * - On screen: completely hidden (`display: none !important`).
 * - In print: hides EVERY sibling of `body` (`#root`, modals, overlays, toasts),
 *   reveals ONLY `#${portalId}`, applies safe A4 margins, and supports mixed
 *   Portrait + Landscape sheets in a single print job (e.g. Substitution + Auto-MIV).
 */
export function buildIsolatedPrintPortalCss(
  portalId: string,
  options: IsolatedPrintPortalOptions = {},
): string {
  const {
    orientation = 'portrait',
    isFa = true,
    marginMm = STANDARD_PRINT_MARGIN_MM,
    showBrowserPageFooter = false,
    extraPrintCss = '',
  } = options;

  const safeMm = normalizeSafePrintMarginMm(marginMm);

  const pageRules =
    orientation === 'mixed'
      ? [
          buildPrintPageRule('portrait', isFa, safeMm, { showBrowserPageFooter }),
          buildPrintPageRule('portrait', isFa, safeMm, {
            pageName: 'samaan-sheet-portrait',
            showBrowserPageFooter,
          }),
          buildPrintPageRule('landscape', isFa, safeMm, {
            pageName: 'samaan-sheet-landscape',
            showBrowserPageFooter,
          }),
        ].join('\n')
      : buildPrintPageRule(orientation, isFa, safeMm, { showBrowserPageFooter });

  return `
    @media screen {
      #${portalId} {
        display: none !important;
      }
    }
    @media print {
      ${pageRules}
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
      }
      body > *:not(#${portalId}) {
        display: none !important;
      }
      #${portalId} {
        display: block !important;
        position: static !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 1.5mm !important;
        box-sizing: border-box !important;
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      #${portalId} .samaan-print-sheet-portrait {
        page: samaan-sheet-portrait;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      #${portalId} .samaan-print-sheet-landscape {
        page: samaan-sheet-landscape;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      #${portalId} .samaan-print-page-break {
        break-after: page !important;
        page-break-after: always !important;
      }
      #${portalId} table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: auto !important;
      }
      #${portalId} tr {
        height: auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      #${portalId} th,
      #${portalId} td {
        height: auto !important;
        vertical-align: middle !important;
      }
      ${extraPrintCss}
    }
  `;
}
