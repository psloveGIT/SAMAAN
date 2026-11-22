import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const { canInstall, isIOS, isInstalled, triggerInstall } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  useEffect(() => {
    if (!iosModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIosModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [iosModalOpen]);

  if (isInstalled || (!canInstall && !isIOS)) {
    return null;
  }

  const iosModal =
    iosModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-guide-title"
            data-testid="ios-install-modal"
            dir={isFa ? 'rtl' : 'ltr'}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-xs p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] print:hidden"
            onClick={() => setIosModalOpen(false)}
          >
            <div
              className="samaan-animate-in w-full max-w-sm max-h-[88dvh] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-float)] space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3
                    id="ios-install-guide-title"
                    className="text-sm font-bold text-[var(--text-primary)] truncate"
                  >
                    {isFa ? 'نصب سمان در آیفون و آیپد' : 'Install SAMAAN on iOS'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIosModalOpen(false)}
                  aria-label={isFa ? 'بستن' : 'Close'}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <Share className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <span>
                    {isFa
                      ? '۱. در مرورگر سافاری روی دکمه اشتراک‌گذاری در نوار پایین صفحه بزنید.'
                      : '1. Tap the Share button in the Safari bottom toolbar.'}
                  </span>
                </div>
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                  <PlusSquare className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <span>
                    {isFa
                      ? '۲. از فهرست بازشده گزینه «افزودن به صفحه اصلی» را انتخاب و تایید کنید.'
                      : '2. Scroll and tap "Add to Home Screen", then confirm.'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                data-testid="ios-install-modal-ack-btn"
                onClick={() => setIosModalOpen(false)}
                className="w-full h-9 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold transition-colors"
              >
                {isFa ? 'متوجه شدم' : 'Got it'}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={() => {
          if (canInstall) {
            void triggerInstall();
          } else if (isIOS) {
            setIosModalOpen(true);
          }
        }}
        title={isFa ? 'نصب اپلیکیشن سمان روی دستگاه' : 'Install SAMAAN App'}
        className="h-9 px-2.5 sm:px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
      >
        {isIOS ? (
          <Smartphone className="w-4 h-4 text-[var(--accent-primary)]" />
        ) : (
          <Download className="w-4 h-4 text-[var(--accent-primary)]" />
        )}
        <span className="hidden sm:inline">{isFa ? 'نصب برنامه' : 'Install App'}</span>
      </button>

      {iosModal}
    </>
  );
};
