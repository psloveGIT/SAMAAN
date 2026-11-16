import React, { useEffect, useRef, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

export const OfflineIndicator: React.FC = () => {
  const { prefs } = useApp();
  const isFa = prefs.language === 'fa';
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleOffline = () => {
      wasOfflineRef.current = true;
      setIsOnline(false);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setShowReconnected(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setShowReconnected(false), 3500);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 start-4 z-[55] px-3.5 py-2 rounded-full border shadow-lg text-[11px] font-semibold flex items-center gap-2 print:hidden ${
        !isOnline
          ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning)] text-[var(--status-warning)]'
          : 'bg-[var(--status-success-bg)] border-[var(--status-success)] text-[var(--status-success)]'
      }`}
    >
      {!isOnline ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <Wifi className="w-3.5 h-3.5 shrink-0" />}
      <span>
        {!isOnline
          ? isFa
            ? 'حالت آفلاین فعال است — تغییرات به‌صورت محلی ذخیره می‌شوند'
            : 'Offline mode — data is stored locally'
          : isFa
            ? 'اتصال اینترنت برقرار شد'
            : 'Back online'}
      </span>
    </div>
  );
};
