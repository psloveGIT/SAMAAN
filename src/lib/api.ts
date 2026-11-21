import { handleStaticApiRequest, StaticEngineError } from './browserEngine.ts';

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export interface NetworkModeState {
  isOffline: boolean;
  manualOffline: boolean;
  browserOnline: boolean;
  staticFallback: boolean;
}

const MANUAL_OFFLINE_KEY = 'samaan_manual_offline_v1';

function readStoredManualOffline(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(MANUAL_OFFLINE_KEY) === '1';
    }
  } catch {
    // Ignore storage errors
  }
  return false;
}

let manualOfflineMode = readStoredManualOffline();
let staticFallbackActive = false;
const networkListeners = new Set<(state: NetworkModeState) => void>();

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function getNetworkModeState(): NetworkModeState {
  const browserOnline = isBrowserOnline();
  const isOffline = manualOfflineMode || !browserOnline || staticFallbackActive;
  return {
    isOffline,
    manualOffline: manualOfflineMode,
    browserOnline,
    staticFallback: staticFallbackActive,
  };
}

function emitNetworkModeState(): void {
  const state = getNetworkModeState();
  for (const listener of networkListeners) {
    try {
      listener(state);
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribeNetworkMode(listener: (state: NetworkModeState) => void): () => void {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

export function setManualOfflineMode(offline: boolean): NetworkModeState {
  manualOfflineMode = Boolean(offline);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MANUAL_OFFLINE_KEY, manualOfflineMode ? '1' : '0');
    }
  } catch {
    // Ignore storage errors
  }
  if (!manualOfflineMode) {
    // Allow immediate attempt to reconnect to server
    staticFallbackActive = false;
  }
  emitNetworkModeState();
  return getNetworkModeState();
}

export function isStaticFallbackMode(): boolean {
  return manualOfflineMode || !isBrowserOnline() || staticFallbackActive;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!manualOfflineMode) {
      staticFallbackActive = false;
    }
    emitNetworkModeState();
  });
  window.addEventListener('offline', () => {
    emitNetworkModeState();
  });
}

const ACTIVE_PROJECT_KEY = 'samaan_active_project_v1';

export function getActiveProjectId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const val = (localStorage.getItem(ACTIVE_PROJECT_KEY) || '').trim();
      if (val) return val;
    }
  } catch {
    // Ignore storage errors
  }
  return 'default';
}

export function setActiveProjectId(projectId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_PROJECT_KEY, (projectId || 'default').trim() || 'default');
    }
  } catch {
    // Ignore storage errors
  }
}

function getActiveLang(): 'fa' | 'en' {
  try {
    if (typeof document !== 'undefined' && document.documentElement.lang === 'en') {
      return 'en';
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('samaan_user_preferences_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { language?: string };
        if (parsed.language === 'en') return 'en';
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 'fa';
}

function notifyIfMutated(url: string, options: RequestInit): void {
  if (typeof window === 'undefined') return;
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return;
  if (
    url.startsWith('/api/auth/') ||
    url.startsWith('/api/ai/') ||
    url.startsWith('/api/history/')
  ) {
    return;
  }
  window.dispatchEvent(new CustomEvent('samaan:mutation-done', { detail: { url, method } }));
}

async function runFallback<T>(url: string, options: RequestInit, markFallback = true): Promise<T> {
  if (markFallback && !staticFallbackActive) {
    staticFallbackActive = true;
    emitNetworkModeState();
  }
  const lang = getActiveLang();
  const projectId = getActiveProjectId();
  try {
    const result = await handleStaticApiRequest<T>(url, {
      ...options,
      headers: {
        'X-Samaan-Lang': lang,
        'X-Samaan-Project': projectId,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
    notifyIfMutated(url, options);
    return result;
  } catch (err) {
    if (err instanceof StaticEngineError) {
      throw new ApiError(err.message, err.status, err.code);
    }
    throw err;
  }
}

function getTimeoutMs(url: string): number {
  if (
    url.startsWith('/api/import/') ||
    url.startsWith('/api/backup/') ||
    url.startsWith('/api/ai/') ||
    url.startsWith('/api/database/')
  ) {
    return 25000;
  }
  return 4500;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const isAiRoute = url.startsWith('/api/ai/');
  const browserOnline = isBrowserOnline();

  // Immediate offline bypass — never hang waiting on fetch when offline or manual offline is enabled
  if (manualOfflineMode || !browserOnline) {
    return runFallback<T>(url, options, false);
  }

  if (staticFallbackActive && !isAiRoute) {
    return runFallback<T>(url, options, false);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Samaan-Lang': getActiveLang(),
    'X-Samaan-Project': getActiveProjectId(),
    ...((options.headers as Record<string, string>) || {}),
  };

  let res: Response;
  const controller = typeof AbortController !== 'undefined' && !options.signal ? new AbortController() : null;
  const timeoutMs = getTimeoutMs(url);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: options.signal || controller?.signal,
    });
  } catch {
    if (timer) clearTimeout(timer);
    // No reachable backend server or timed out — fall back immediately to local engine
    return runFallback<T>(url, options, true);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return runFallback<T>(url, options, true);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return runFallback<T>(url, options, true);
  }

  // Server returned valid JSON — ensure fallback flag is cleared
  if (staticFallbackActive) {
    staticFallbackActive = false;
    emitNetworkModeState();
  }

  if (!res.ok) {
    const obj = (data || {}) as { error?: string; code?: string };
    throw new ApiError(
      obj.error || `Request failed (${res.status})`,
      res.status,
      obj.code,
      data,
    );
  }

  notifyIfMutated(url, options);
  return data as T;
}
