export interface NetworkModeState {
  /** True when the device/app has no live network connection to the app host (drives Wifi / WifiOff icon). */
  isOffline: boolean;
  /** Raw navigator.onLine status. */
  browserOnline: boolean;
  /** True when the backend /api/health endpoint returned { ok: true } JSON. */
  serverReachable: boolean;
  /** True when API calls should fall back to local browserEngine (either offline or static host without /api/*). */
  staticFallback: boolean;
}

export interface ConnectivitySnapshot {
  browserOnline: boolean;
  apiReachable: boolean;
  hostReachable: boolean;
}

export interface ProbeResult {
  apiReachable: boolean;
  hostReachable: boolean;
}

export function deriveNetworkModeState(snapshot: ConnectivitySnapshot): NetworkModeState {
  const browserOnline = snapshot.browserOnline;
  const apiReachable = browserOnline && snapshot.apiReachable;
  const hostReachable = browserOnline && (snapshot.apiReachable || snapshot.hostReachable);
  return {
    isOffline: !hostReachable,
    browserOnline,
    serverReachable: apiReachable,
    staticFallback: !apiReachable,
  };
}

export function networkModeStatesEqual(a: NetworkModeState, b: NetworkModeState): boolean {
  return (
    a.isOffline === b.isOffline &&
    a.browserOnline === b.browserOnline &&
    a.serverReachable === b.serverReachable &&
    a.staticFallback === b.staticFallback
  );
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'manual',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isLiveProxyAuthResponse(res: Response): boolean {
  return res.type === 'opaqueredirect' || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400);
}

/**
 * Probes live connectivity in two steps:
 * 1. GET /api/health?t=<ts> — confirms full-stack Express API availability ({ ok: true }).
 * 2. If /api/health is absent (static hosting / CDN / subpath / auth-gated standalone PWA),
 *    probes ./app-version.json?t=<ts> (explicitly excluded from Service Worker cache & served no-store)
 *    to verify real live internet connectivity to the app host without falsely locking the icon to Offline.
 */
export async function runConnectivityProbe(options: {
  browserOnline: boolean;
  fetchImpl?: FetchLike;
  now?: () => number;
  apiTimeoutMs?: number;
  hostTimeoutMs?: number;
}): Promise<ProbeResult> {
  if (!options.browserOnline) {
    return { apiReachable: false, hostReachable: false };
  }

  const fetchImpl: FetchLike | undefined =
    options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    return { apiReachable: false, hostReachable: options.browserOnline };
  }

  const ts = (options.now ?? Date.now)();
  const apiTimeoutMs = options.apiTimeoutMs ?? 7000;
  const hostTimeoutMs = options.hostTimeoutMs ?? 5000;

  let proxyResponded = false;
  let serverGatewayDown = false;

  // Step 1: Probe Express backend /api/health
  try {
    const res = await fetchWithTimeout(fetchImpl, `/api/health?t=${ts}`, apiTimeoutMs);
    if (res.ok) {
      const contentType = res.headers?.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as { ok?: boolean };
        if (data?.ok) {
          return { apiReachable: true, hostReachable: true };
        }
      }
      // 200 OK with HTML (SPA fallback on static hosting) — fall through to Step 2
    } else if (isLiveProxyAuthResponse(res)) {
      proxyResponded = true;
    } else if (res.status >= 500) {
      serverGatewayDown = true;
    }
  } catch {
    // Network error or timeout — still check Step 2 in case app is mounted on a relative subpath
  }

  if (serverGatewayDown) {
    return { apiReachable: false, hostReachable: false };
  }

  // Step 2: Probe uncached static manifest/version file on the app host
  try {
    const res = await fetchWithTimeout(fetchImpl, `./app-version.json?t=${ts}`, hostTimeoutMs);
    if (res.ok) {
      const contentType = res.headers?.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = (await res.json()) as { version?: string; buildId?: string };
        if (typeof data?.version === 'string' && data.version.length > 0) {
          return { apiReachable: false, hostReachable: true };
        }
      }
    } else if (isLiveProxyAuthResponse(res)) {
      return { apiReachable: false, hostReachable: true };
    }
  } catch {
    // Network failure or timeout
  }

  if (proxyResponded) {
    return { apiReachable: false, hostReachable: true };
  }

  return { apiReachable: false, hostReachable: false };
}
