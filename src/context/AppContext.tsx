import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, getActiveProjectId, setActiveProjectId as persistActiveProjectId } from '../lib/api.ts';
import { saveSnapshotToIndexedDb } from '../lib/indexedDbBackup.ts';
import { resolveEmployerProfile } from '../shared/employers.ts';
import type { ResolvedEmployerProfile } from '../shared/employers.ts';
import { formatIsoDate, formatTimestampByCalendar } from '../shared/jalali.ts';
import { getTranslations } from '../shared/i18n.ts';
import type {
  CalendarMode,
  DatabaseSnapshot,
  EmployerCustomConfig,
  EmployerId,
  EmployerProfile,
  Language,
  ProjectInfo,
  ThemeMode,
  UserAccount,
  UserPreferences,
} from '../shared/types.ts';

const PREFS_STORAGE_KEY = 'samaan_user_preferences_v1';

const INITIAL_PREFS: UserPreferences = {
  language: 'fa',
  calendar: 'jalali',
  theme: 'dark',
  eyeComfort: false,
  spellCheck: true,
};

function readStoredPrefs(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return INITIAL_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      language: parsed.language === 'en' ? 'en' : 'fa',
      calendar: parsed.calendar === 'gregorian' ? 'gregorian' : 'jalali',
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      eyeComfort: Boolean(parsed.eyeComfort),
      spellCheck: parsed.spellCheck !== false,
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
  projects: ProjectInfo[];
  employers: EmployerProfile[];
  activeProjectId: string;
  activeProject: ProjectInfo | null;
  activeEmployer: ResolvedEmployerProfile;
  refreshProjects: () => Promise<void>;
  refreshEmployers: () => Promise<void>;
  createEmployer: (input: Partial<EmployerProfile>) => Promise<EmployerProfile>;
  updateEmployer: (id: string, input: Partial<EmployerProfile>) => Promise<EmployerProfile>;
  deleteEmployer: (id: string) => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  createProject: (input: {
    name: string;
    code?: string;
    employerId?: EmployerId;
    employerConfig?: EmployerCustomConfig;
    copyUsers?: boolean;
    autoSwitch?: boolean;
  }) => Promise<ProjectInfo>;
  renameProject: (
    id: string,
    input: {
      name?: string;
      code?: string;
      employerId?: EmployerId;
      employerConfig?: EmployerCustomConfig;
    },
  ) => Promise<ProjectInfo>;
  deleteProject: (id: string) => Promise<void>;
  setLanguage: (lang: Language) => void;
  setCalendar: (cal: CalendarMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setEyeComfort: (enabled: boolean) => void;
  setSpellCheck: (enabled: boolean) => void;
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
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [employers, setEmployers] = useState<EmployerProfile[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string>(() => getActiveProjectId());

  const applyDocumentPrefs = useCallback((p: UserPreferences) => {
    const root = document.documentElement;
    root.lang = p.language;
    root.dir = p.language === 'fa' ? 'rtl' : 'ltr';
    root.classList.toggle('dark', p.theme === 'dark');
    root.classList.toggle('eye-comfort', p.eyeComfort);
    root.setAttribute('spellcheck', p.spellCheck !== false ? 'true' : 'false');
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

  const refreshProjects = useCallback(async () => {
    try {
      const res = await apiRequest<{ projects: ProjectInfo[]; activeProjectId: string }>('/api/projects');
      setProjects(res.projects || []);
      const resolved = res.activeProjectId || 'default';
      persistActiveProjectId(resolved);
      setActiveProjectIdState(resolved);
    } catch {
      // Ignore initial project fetch error
    }
  }, []);

  const refreshEmployers = useCallback(async () => {
    try {
      const res = await apiRequest<{ employers: EmployerProfile[] }>('/api/employers');
      setEmployers(res.employers || []);
    } catch {
      // Ignore initial employers fetch error
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const [projRes, empRes, data] = await Promise.all([
        apiRequest<{ projects: ProjectInfo[]; activeProjectId: string }>('/api/projects').catch(() => null),
        apiRequest<{ employers: EmployerProfile[] }>('/api/employers').catch(() => null),
        apiRequest<{ needsSetup: boolean; user: UserAccount | null }>('/api/auth/status'),
      ]);
      if (projRes) {
        setProjects(projRes.projects || []);
        const resolved = projRes.activeProjectId || 'default';
        persistActiveProjectId(resolved);
        setActiveProjectIdState(resolved);
      }
      if (empRes) {
        setEmployers(empRes.employers || []);
      }
      setNeedsSetup(data.needsSetup);
      setUser(data.user);
      if (data.user?.preferences) {
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

  const createEmployer = useCallback(async (input: Partial<EmployerProfile>) => {
    const res = await apiRequest<{ employer: EmployerProfile; employers: EmployerProfile[] }>('/api/employers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setEmployers(res.employers || []);
    return res.employer;
  }, []);

  const updateEmployer = useCallback(async (id: string, input: Partial<EmployerProfile>) => {
    const res = await apiRequest<{ employer: EmployerProfile; employers: EmployerProfile[] }>(
      `/api/employers/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
    setEmployers(res.employers || []);
    return res.employer;
  }, []);

  const deleteEmployer = useCallback(
    async (id: string) => {
      const res = await apiRequest<{ ok: boolean; employers: EmployerProfile[] }>(
        `/api/employers/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      setEmployers(res.employers || []);
      await refreshProjects();
    },
    [refreshProjects],
  );

  const switchProject = useCallback(
    async (projectId: string) => {
      const target = (projectId || 'default').trim() || 'default';
      persistActiveProjectId(target);
      setActiveProjectIdState(target);
      await refreshAuth();
    },
    [refreshAuth],
  );

  const createProject = useCallback(
    async (input: {
      name: string;
      code?: string;
      employerId?: EmployerId;
      employerConfig?: EmployerCustomConfig;
      copyUsers?: boolean;
      autoSwitch?: boolean;
    }) => {
      const res = await apiRequest<{ project: ProjectInfo; projects: ProjectInfo[] }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          code: input.code,
          employerId: input.employerId,
          employerConfig: input.employerConfig,
          copyUsers: Boolean(input.copyUsers),
        }),
      });
      setProjects(res.projects || []);
      if (input.autoSwitch !== false) {
        await switchProject(res.project.id);
      }
      return res.project;
    },
    [switchProject],
  );

  const renameProject = useCallback(
    async (
      id: string,
      input: {
        name?: string;
        code?: string;
        employerId?: EmployerId;
        employerConfig?: EmployerCustomConfig;
      },
    ) => {
      const res = await apiRequest<{ project: ProjectInfo; projects: ProjectInfo[] }>(
        `/api/projects/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(input),
        },
      );
      setProjects(res.projects || []);
      return res.project;
    },
    [],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const res = await apiRequest<{ ok: boolean; projects: ProjectInfo[] }>(
        `/api/projects/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      setProjects(res.projects || []);
      if (activeProjectId === id) {
        await switchProject('default');
      }
    },
    [activeProjectId, switchProject],
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId],
  );

  const activeEmployer = useMemo(
    () => resolveEmployerProfile(activeProject, employers),
    [activeProject, employers],
  );

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
  const setSpellCheck = useCallback((spellCheck: boolean) => updatePrefs({ spellCheck }), [updatePrefs]);

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
        await saveSnapshotToIndexedDb(snapshot, 'auto', label, activeProjectId);
      } catch {
        // Silent background snapshot
      }
    },
    [user, activeProjectId],
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

  const t = useMemo(() => getTranslations(prefs.language), [prefs.language]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      user,
      needsSetup,
      loadingAuth,
      prefs,
      t,
      projects,
      employers,
      activeProjectId,
      activeProject,
      activeEmployer,
      refreshProjects,
      refreshEmployers,
      createEmployer,
      updateEmployer,
      deleteEmployer,
      switchProject,
      createProject,
      renameProject,
      deleteProject,
      setLanguage,
      setCalendar,
      setTheme,
      setEyeComfort,
      setSpellCheck,
      refreshAuth,
      setAuthenticatedUser,
      logout,
      formatDate,
      formatTimestamp,
      notify,
      toasts,
      dismissToast,
      triggerAutoSnapshot,
    }),
    [
      user,
      needsSetup,
      loadingAuth,
      prefs,
      t,
      projects,
      employers,
      activeProjectId,
      activeProject,
      activeEmployer,
      refreshProjects,
      refreshEmployers,
      createEmployer,
      updateEmployer,
      deleteEmployer,
      switchProject,
      createProject,
      renameProject,
      deleteProject,
      setLanguage,
      setCalendar,
      setTheme,
      setEyeComfort,
      setSpellCheck,
      refreshAuth,
      setAuthenticatedUser,
      logout,
      formatDate,
      formatTimestamp,
      notify,
      toasts,
      dismissToast,
      triggerAutoSnapshot,
    ],
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
