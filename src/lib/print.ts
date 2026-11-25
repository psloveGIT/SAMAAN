/**
 * Centralized cross-platform print utility.
 *
 * Solves iOS Installed Standalone PWA printing bug where calling `window.print()`
 * directly inside iOS Home-Screen WebApp (`navigator.standalone === true`) is silently
 * ignored by WebKit.
 *
 * Strategy:
 * 1. On standard browsers (Desktop, Safari tab, Android Chrome), call `window.print()`.
 * 2. On iOS installed standalone PWA:
 *    - Build a self-contained same-origin hidden print `<iframe>` cloning active stylesheets,
 *      inline `<style>` rules, and the active printable document DOM (ensuring print CSS is applied).
 *    - Trigger `iframe.contentWindow.focus()`, `iframe.contentWindow.print()`, and
 *      `document.execCommand('print', false)` fallback.
 *    - If iOS WebKit suppresses native print dialog (detected when print returns immediately
 *      without firing `beforeprint` / blocking), automatically present a clean in-app iOS
 *      Print / Share / Save Printable HTML bar so the user can share to AirPrint / Save PDF
 *      via iOS Share Sheet (`navigator.share`) or download the standalone printable HTML file.
 */

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOSUA = /iPad|iPhone|iPod/i.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return isIOSUA || isIPadOS;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  }
  return false;
}

export function isIosStandalonePwa(): boolean {
  return isIosDevice() && isStandalonePwa();
}

function collectHeadStylesHtml(): string {
  const parts: string[] = [];
  const headNodes = document.querySelectorAll('head style, head link[rel="stylesheet"]');
  headNodes.forEach((node) => {
    if (node.tagName === 'STYLE') {
      parts.push(`<style>${node.textContent || ''}</style>`);
    } else if (node.tagName === 'LINK') {
      const href = (node as HTMLLinkElement).href;
      if (href) {
        parts.push(`<link rel="stylesheet" href="${href.replace(/"/g, '&quot;')}" />`);
      }
    }
  });
  return parts.join('\n');
}

function buildStandalonePrintableHtml(title?: string): string {
  const safeTitle = (title || document.title || 'SAMAAN Print').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dir = document.documentElement.getAttribute('dir') || 'rtl';
  const lang = document.documentElement.getAttribute('lang') || 'fa';
  const styles = collectHeadStylesHtml();

  // Prefer explicit active print portal mounted on document.body so app UI never leaks into printed output
  const explicitPortal = document.body.querySelector(
    '[data-samaan-print-portal="true"], #samaan-substitution-print-root, #samaan-miv-print-root, #samaan-label-print-root, #samaan-print-root, [id$="-print-root"]',
  ) as HTMLElement | null;

  let bodyHtml = '';
  if (explicitPortal) {
    const portalClone = explicitPortal.cloneNode(true) as HTMLElement;
    portalClone.classList.remove('hidden');
    portalClone.style.display = 'block';
    bodyHtml = portalClone.outerHTML;
  } else {
    const rootClone = document.body.cloneNode(true) as HTMLElement;
    rootClone
      .querySelectorAll('script, noscript, iframe, .no-print, [data-ios-print-overlay="true"]')
      .forEach((el) => el.remove());
    bodyHtml = rootClone.innerHTML;
  }

  const printOverrideCss = `
    <style>
      @page {
        margin: 12mm;
      }
      @media screen, print {
        html, body {
          background: #ffffff !important;
          color: #0f172a !important;
          color-scheme: only light !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body {
          padding: 6mm !important;
          box-sizing: border-box !important;
        }
        @media print {
          body {
            padding: 1.5mm !important;
          }
        }
        [data-samaan-print-portal="true"],
        [id$="-print-root"] {
          display: block !important;
          width: 100% !important;
        }
        .no-print, .print\\:hidden { display: none !important; }
        .print\\:block { display: block !important; }
        .print\\:static { position: static !important; }
        .print\\:p-0 { padding: 0 !important; }
        .print\\:m-0 { margin: 0 !important; }
        .print\\:shadow-none { box-shadow: none !important; }
        .print\\:border-0 { border: 0 !important; }
        .print\\:bg-white { background: #ffffff !important; }
      }
    </style>
  `;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}" class="light" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${safeTitle}</title>
  ${styles}
  ${printOverrideCss}
</head>
<body class="bg-white text-slate-900">
  ${bodyHtml}
</body>
</html>`;
}

function showIosPrintFallbackOverlay(htmlContent: string, title?: string): void {
  const existing = document.getElementById('samaan-ios-print-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'samaan-ios-print-overlay';
  overlay.setAttribute('data-ios-print-overlay', 'true');
  overlay.className = 'no-print';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483640;background:rgba(15,23,42,0.62);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Vazirmatn,system-ui,sans-serif;';

  const isFa = (document.documentElement.getAttribute('lang') || 'fa') === 'fa';
  const fileName = `${(title || 'samaan-print').replace(/[^\w\u0600-\u06FF-]+/g, '_')}.html`;

  const card = document.createElement('div');
  card.dir = isFa ? 'rtl' : 'ltr';
  card.style.cssText =
    'width:100%;max-width:440px;background:#ffffff;color:#0f172a;border-radius:16px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.3);border:1px solid #e2e8f0;';

  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:8px;color:#0f172a;';
  heading.textContent = isFa ? 'چاپ سند در نسخه نصب‌شده آیفون (iOS PWA)' : 'Print Document in iOS Installed App';

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:12.5px;line-height:1.7;color:#475569;margin:0 0 16px 0;';
  desc.textContent = isFa
    ? 'در حالت برنامه نصب‌شده آیفون، سیستم‌عامل iOS گاهی پنجره چاپ مستقیم را محدود می‌کند. از دکمه‌های زیر می‌توانید سند آماده چاپ را از طریق منوی اشتراک‌گذاری آیفون (AirPrint / Save to Files) چاپ یا ذخیره نمایید:'
    : 'iOS standalone apps sometimes restrict direct native print dialogs. Use the buttons below to print/save via the iOS Share Sheet (AirPrint / Save PDF) or download the printable file:';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.style.cssText =
    'width:100%;padding:10px 14px;border-radius:10px;border:none;background:#0d7a72;color:#ffffff;font-weight:700;font-size:13px;cursor:pointer;';
  shareBtn.textContent = isFa ? 'اشتراک‌گذاری و چاپ با AirPrint / PDF' : 'Share & Print via AirPrint / PDF';
  shareBtn.onclick = async () => {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const file = new File([blob], fileName, { type: 'text/html' });
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ files: [file], title: title || 'SAMAAN Print' });
        overlay.remove();
        return;
      }
    } catch {
      // Fall through to direct download
    }
    downloadHtml();
  };

  const downloadHtml = () => {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const dlBtn = document.createElement('button');
  dlBtn.type = 'button';
  dlBtn.style.cssText =
    'width:100%;padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-weight:600;font-size:13px;cursor:pointer;';
  dlBtn.textContent = isFa ? 'دانلود فایل آماده چاپ (HTML / بازکردن در Safari)' : 'Download Printable File (Open in Safari)';
  dlBtn.onclick = () => {
    downloadHtml();
    overlay.remove();
  };

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.style.cssText =
    'width:100%;padding:8px 14px;border-radius:10px;border:none;background:transparent;color:#64748b;font-weight:600;font-size:12.5px;cursor:pointer;';
  closeBtn.textContent = isFa ? 'بستن' : 'Close';
  closeBtn.onclick = () => overlay.remove();

  actions.appendChild(shareBtn);
  actions.appendChild(dlBtn);
  actions.appendChild(closeBtn);
  card.appendChild(heading);
  card.appendChild(desc);
  card.appendChild(actions);
  overlay.appendChild(card);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  document.body.appendChild(overlay);
}

/**
 * Triggers printing across Desktop, Safari, Android Chrome, and iOS installed PWA.
 */
export function triggerAppPrint(options?: { title?: string }): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!isIosStandalonePwa()) {
    try {
      window.print();
      return;
    } catch {
      // Fall through to iframe print fallback
    }
  }

  // iOS Installed Standalone PWA path: hidden same-origin iframe print + AirPrint Share fallback
  const html = buildStandalonePrintableHtml(options?.title);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    }, 1500);
  };

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      cleanup();
      showIosPrintFallbackOverlay(html, options?.title);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let printEventFired = false;
    const onBeforePrint = () => {
      printEventFired = true;
    };
    win.addEventListener('beforeprint', onBeforePrint, { once: true });

    const invokePrint = () => {
      const t0 = Date.now();
      let execOk = false;
      try {
        win.focus();
        // On iOS standalone WKWebView, execCommand('print') on an iframe frequently succeeds where window.print() is no-op
        try {
          execOk = doc.execCommand('print', false);
        } catch {
          execOk = false;
        }
        if (!execOk) {
          win.print();
        }
      } catch {
        // Fallback below
      }
      const elapsed = Date.now() - t0;
      cleanup();

      // If iOS WKWebView silently ignored print (no beforeprint & returned in <120ms without execCommand success),
      // offer the clean AirPrint / Share Sheet / Printable HTML overlay immediately.
      if (!printEventFired && !execOk && elapsed < 120) {
        showIosPrintFallbackOverlay(html, options?.title);
      }
    };

    // Wait briefly for cloned styles/images to lay out in the iframe
    setTimeout(invokePrint, 280);
  } catch {
    cleanup();
    showIosPrintFallbackOverlay(html, options?.title);
  }
}
