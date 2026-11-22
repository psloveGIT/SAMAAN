import { handleStaticApiRequest, StaticEngineError } from './browserEngine.ts';
import {
  deriveNetworkModeState,
  networkModeStatesEqual,
  runConnectivityProbe,
  type NetworkModeState,
} from '../shared/networkStatus.ts';

export type { NetworkModeState };

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

const LEGACY_MANUAL_OFFLINE_KEY = 'samaan_manual_offline_v1';

// Clear any legacy manual offline flag so connectivity is strictly automatic
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_MANUAL_OFFLINE_KEY);
  }
} catch {
  // Ignore storage errors
}

function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

let apiReachable = isBrowserOnline();
let hostReachable = isBrowserOnline();
let probeInFlight: Promise<boolean> | null = null;
let probeSeq = 0;
let lastEmittedState: NetworkModeState = deriveNetworkModeState({
  browserOnline: isBrowserOnline(),
  apiReachable,
  hostReachable,
});
const networkListeners = new Set<(state: NetworkModeState) => void>();

export function getNetworkModeState(): NetworkModeState {
  return deriveNetworkModeState({
    browserOnline: isBrowserOnline(),
    apiReachable,
    hostReachable,
  });
}

function emitNetworkModeStateIfChanged(): void {
  const next = getNetworkModeState();
  if (networkModeStatesEqual(lastEmittedState, next)) {
    return;
  }
  lastEmittedState = next;
  for (const listener of networkListeners) {
    try {
      listener(next);
    } catch {
      // Ignore listener errors
    }
  }
}

function setConnectivity(nextApiReachable: boolean, nextHostReachable: boolean): void {
  apiReachable = nextApiReachable;
  hostReachable = nextHostReachable;
  emitNetworkModeStateIfChanged();
}

export function subscribeNetworkMode(listener: (state: NetworkModeState) => void): () => void {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

export function isStaticFallbackMode(): boolean {
  return getNetworkModeState().staticFallback;
}

/**
 * Automatically probes server/host reachability (/api/health with ./app-version.json fallback)
 * and updates online/offline state. Strictly automatic — never manually toggled.
 */
export async function probeServerConnection(force = false): Promise<boolean> {
  if (!isBrowserOnline()) {
    probeSeq += 1;
    setConnectivity(false, false);
    return false;
  }
  if (probeInFlight && !force) {
    return probeInFlight;
  }

  const seq = ++probeSeq;
  const run = (async () => {
    try {
      const result = await runConnectivityProbe({
        browserOnline: isBrowserOnline(),
      });
      // Ignore stale probe results superseded by a newer online/offline event
      if (seq !== probeSeq) {
        return !getNetworkModeState().isOffline;
      }
      setConnectivity(result.apiReachable, result.hostReachable);
      return result.apiReachable || result.hostReachable;
    } finally {
      if (seq === probeSeq) {
        probeInFlight = null;
      }
    }
  })();

  probeInFlight = run;
  return run;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    probeSeq += 1;
    // Reflect browser reconnect immediately, then confirm live host/API reachability
    setConnectivity(apiReachable, true);
    void probeServerConnection(true);
  });
  window.addEventListener('offline', () => {
    probeSeq += 1;
    setConnectivity(false, false);
  });
  window.addEventListener('focus', () => {
    void probeServerConnection(false);
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void probeServerConnection(false);
      }
    });
  }
  // Initial connectivity verification and light periodic check in both online and offline states
  void probeServerConnection(true);
  setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void probeServerConnection(false);
    }
  }, 15000);
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

async function runFallback<T>(
  url: string,
  options: RequestInit,
  reason: 'none' | 'static_host' | 'network_error' = 'static_host',
): Promise<T> {
  if (reason === 'static_host') {
    setConnectivity(false, hostReachable);
  } else if (reason === 'network_error') {
    setConnectivity(false, false);
    if (isBrowserOnline()) {
      void probeServerConnection(true);
    }
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
    url.startsWith('/api/database/')
  ) {
    return 120000;
  }
  if (url.startsWith('/api/ai/')) {
    return 60000;
  }
  return 6000;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const isAiRoute = url.startsWith('/api/ai/');
  const isHeavyRoute =
    url.startsWith('/api/import/') ||
    url.startsWith('/api/backup/') ||
    url.startsWith('/api/database/');
  const browserOnline = isBrowserOnline();

  // Immediate offline bypass — never hang waiting on fetch when the device is offline
  if (!browserOnline) {
    setConnectivity(false, false);
    return runFallback<T>(url, options, 'none');
  }

  if (!apiReachable && !isAiRoute) {
    return runFallback<T>(url, options, 'none');
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
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: options.signal || controller?.signal,
    });
  } catch (err) {
    if (timer) clearTimeout(timer);
    // If a large online import/backup/AI request timed out while device is online, throw a clear timeout error
    // instead of hanging the main browser thread inside the local fallback engine.
    if (timedOut && isBrowserOnline() && (isHeavyRoute || isAiRoute)) {
      const lang = getActiveLang();
      throw new ApiError(
        lang === 'en'
          ? 'The server took too long to process this request. Please retry or split large files into smaller batches.'
          : 'زمان پاسخ‌گویی سرور به پایان رسید. لطفاً مجدداً تلاش کنید یا در فایل‌های بسیار حجیم شیت‌ها را مرحله‌به‌مرحله وارد نمایید.',
        504,
        'REQUEST_TIMEOUT',
      );
    }
    // User-initiated external abort
    if (options.signal?.aborted && err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    // Unreachable backend server — fall back seamlessly to local offline engine
    return runFallback<T>(url, options, 'network_error');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return runFallback<T>(url, options, 'static_host');
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return runFallback<T>(url, options, 'static_host');
  }

  // Server returned valid JSON — mark API and host reachable
  if (!apiReachable || !hostReachable) {
    setConnectivity(true, true);
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
