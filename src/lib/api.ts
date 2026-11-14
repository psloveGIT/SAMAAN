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

let staticFallbackActive = false;

export function isStaticFallbackMode(): boolean {
  return staticFallbackActive;
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

async function runFallback<T>(url: string, options: RequestInit): Promise<T> {
  staticFallbackActive = true;
  const lang = getActiveLang();
  try {
    return await handleStaticApiRequest<T>(url, {
      ...options,
      headers: {
        'X-Samaan-Lang': lang,
        ...((options.headers as Record<string, string>) || {}),
      },
    });
  } catch (err) {
    if (err instanceof StaticEngineError) {
      throw new ApiError(err.message, err.status, err.code);
    }
    throw err;
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  if (staticFallbackActive) {
    return runFallback<T>(url, options);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Samaan-Lang': getActiveLang(),
    ...((options.headers as Record<string, string>) || {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    // No reachable backend server (e.g. GitHub Pages static host)
    return runFallback<T>(url, options);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // GitHub Pages returns HTML 404 for /api/* routes
    return runFallback<T>(url, options);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return runFallback<T>(url, options);
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

  return data as T;
}
