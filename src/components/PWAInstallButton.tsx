import React, { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC = () => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const { canInstall, isIOS, isInstalled, triggerInstall } = usePWAInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  if (isInstalled || (!canInstall && !isIOS)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (canInstall) {
            void triggerInstall();
          } else if (isIOS) {
            setIosModalOpen(true);
          }
        }}
        title={isFa ? 'نصب اپلیکیشن سمان روی دستگاه' : 'Install SAMAAN App'}
        className="h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
      >
        {isIOS ? (
          <Smartphone className="w-4 h-4 text-[var(--accent-primary)]" />
        ) : (
          <Download className="w-4 h-4 text-[var(--accent-primary)]" />
        )}
        <span className="hidden sm:inline">{isFa ? 'نصب برنامه' : 'Install App'}</span>
      </button>

      {iosModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-4 print:hidden"
          onClick={() => setIosModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {isFa ? 'نصب سمان در آیفون / آیپد' : 'Install SAMAAN on iOS'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIosModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <Share className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <span>
                  {isFa
                    ? '۱. در مرورگر Safari روی دکمه اشتراک‌گذاری (Share) در نوار پایین بزنید.'
                    : '1. Tap the Share button in the Safari bottom toolbar.'}
                </span>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                <PlusSquare className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <span>
                  {isFa
                    ? '۲. گزینه Add to Home Screen را انتخاب کرده و تایید کنید.'
                    : '2. Scroll and tap "Add to Home Screen", then confirm.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIosModalOpen(false)}
              className="w-full h-9 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-medium"
            >
              {isFa ? 'متوجه شدم' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
