import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import { installDiagnosticsListeners } from './lib/diagnostics.ts';
import { warmBuiltInEmployerLogosCache } from './lib/employerLogoCache.ts';

installDiagnosticsListeners();
void warmBuiltInEmployerLogosCache();

if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((reg) => {
        const urls = [reg.active?.scriptURL, reg.waiting?.scriptURL, reg.installing?.scriptURL];
        if (urls.some((u) => u && u.includes('dev-sw.js'))) {
          void reg.unregister();
        }
      });
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
