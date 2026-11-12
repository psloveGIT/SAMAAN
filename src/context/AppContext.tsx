import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import { saveSnapshotToIndexedDb } from '../lib/indexedDbBackup.ts';
import { formatIsoDate, formatTimestampByCalendar } from '../shared/jalali.ts';
import { getTranslations } from '../shared/i18n.ts';
import type {
  CalendarMode,
  DatabaseSnapshot,
  Language,
  ThemeMode,
  UserAccount,
  UserPreferences,
} from '../shared/types.ts';

const PREFS_STORAGE_KEY = 'samaan_user_preferences_v1';

const INITIAL_PREFS: UserPreferences = {
  language: 'fa',
  calendar: 'jalali',
  theme: 'light',
  eyeComfort: false,
};

function readStoredPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return INITIAL_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      language: parsed.language === 'en' ? 'en' : 'fa',
      calendar: parsed.calendar === 'gregorian' ? 'gregorian' : 'jalali',
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      eyeComfort: Boolean(parsed.eyeComfort),
    };
  } catch {
    return INITIAL_PREFS;
  }
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

interface AppContextValue {
  user: UserAccount | null;
  needsSetup: boolean;
  loadingAuth: boolean;
  prefs: UserPreferences;
  t: ReturnType<typeof getTranslations>;
  setLanguage: (lang: Language) => void;
  setCalendar: (cal: CalendarMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setEyeComfort: (enabled: boolean) => void;
  refreshAuth: () => Promise<void>;
  setAuthenticatedUser: (u: UserAccount | null) => void;
  logout: () => Promise<void>;
  formatDate: (isoOrRaw: string | undefined | null) => string;
  formatTimestamp: (isoTs: string | undefined | null) => string;
  notify: (type: ToastMessage['type'], text: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  triggerAutoSnapshot: (label: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [prefs, setPrefs] = useState<UserPreferences>(readStoredPrefs);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const applyDocumentPrefs = useCallback((p: UserPreferences) => {
    const root = document.documentElement;
    root.lang = p.language;
    root.dir = p.language === 'fa' ? 'rtl' : 'ltr';
    root.classList.toggle('dark', p.theme === 'dark');
    root.classList.toggle('eye-comfort', p.eyeComfort);
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  useEffect(() => {
    applyDocumentPrefs(prefs);
  }, [prefs, applyDocumentPrefs]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const data = await apiRequest<{ needsSetup: boolean; user: UserAccount | null }>(
        '/api/auth/status',
      );
      setNeedsSetup(data.needsSetup);
      setUser(data.user);
      if (data.user?.preferences) {
        // Sync user-saved preferences when signing in if localStorage wasn't explicitly changed
        const stored = localStorage.getItem(PREFS_STORAGE_KEY);
        if (!stored) {
          setPrefs(data.user.preferences);
        }
      }
    } catch {
      setUser(null);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const updatePrefs = useCallback(
    (patch: Partial<UserPreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (user) {
          apiRequest<{ user: UserAccount }>('/api/auth/preferences', {
            method: 'PATCH',
            body: JSON.stringify(next),
          }).catch(() => {});
        }
        return next;
      });
    },
    [user],
  );

  const setLanguage = useCallback((language: Language) => updatePrefs({ language }), [updatePrefs]);
  const setCalendar = useCallback((calendar: CalendarMode) => updatePrefs({ calendar }), [updatePrefs]);
  const setTheme = useCallback((theme: ThemeMode) => updatePrefs({ theme }), [updatePrefs]);
  const setEyeComfort = useCallback((eyeComfort: boolean) => updatePrefs({ eyeComfort }), [updatePrefs]);

  const setAuthenticatedUser = useCallback((u: UserAccount | null) => {
    setUser(u);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const formatDate = useCallback(
    (isoOrRaw: string | undefined | null) => {
      if (!isoOrRaw) return '';
      return formatIsoDate(isoOrRaw, prefs.calendar);
    },
    [prefs.calendar],
  );

  const formatTimestamp = useCallback(
    (isoTs: string | undefined | null) => {
      if (!isoTs) return '';
      return formatTimestampByCalendar(isoTs, prefs.calendar, prefs.language);
    },
    [prefs.calendar, prefs.language],
  );

  const triggerAutoSnapshot = useCallback(
    async (label: string) => {
      if (!user) return;
      try {
        const snapshot = await apiRequest<DatabaseSnapshot>('/api/backup/snapshot');
        await saveSnapshotToIndexedDb(snapshot, 'auto', label);
      } catch {
        // Silent background snapshot
      }
    },
    [user],
  );

  // Automatic periodic IndexedDB snapshot every 10 minutes while signed in
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      triggerAutoSnapshot(
        prefs.language === 'fa' ? 'پشتیبان‌گیری خودکار دوره‌ای' : 'Scheduled Auto Snapshot',
      );
    }, 1000 * 60 * 10);
    return () => clearInterval(timer);
  }, [user, triggerAutoSnapshot, prefs.language]);

  const t = getTranslations(prefs.language);

  return (
    <AppContext.Provider
      value={{
        user,
        needsSetup,
        loadingAuth,
        prefs,
        t,
        setLanguage,
        setCalendar,
        setTheme,
        setEyeComfort,
        refreshAuth,
        setAuthenticatedUser,
        logout,
        formatDate,
        formatTimestamp,
        notify,
        toasts,
        dismissToast,
        triggerAutoSnapshot,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
