import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveNetworkModeState,
  networkModeStatesEqual,
  runConnectivityProbe,
} from './networkStatus.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(status = 200): Response {
  return new Response('<!doctype html><html></html>', {
    status,
    headers: { 'content-type': 'text/html' },
  });
}

test('deriveNetworkModeState separates online host status from static fallback', () => {
  const fullStackOnline = deriveNetworkModeState({
    browserOnline: true,
    apiReachable: true,
    hostReachable: true,
  });
  assert.equal(fullStackOnline.isOffline, false);
  assert.equal(fullStackOnline.serverReachable, true);
  assert.equal(fullStackOnline.staticFallback, false);

  const staticHostOnline = deriveNetworkModeState({
    browserOnline: true,
    apiReachable: false,
    hostReachable: true,
  });
  assert.equal(staticHostOnline.isOffline, false);
  assert.equal(staticHostOnline.serverReachable, false);
  assert.equal(staticHostOnline.staticFallback, true);

  const offline = deriveNetworkModeState({
    browserOnline: false,
    apiReachable: true,
    hostReachable: true,
  });
  assert.equal(offline.isOffline, true);
  assert.equal(offline.serverReachable, false);
  assert.equal(offline.staticFallback, true);

  assert.equal(networkModeStatesEqual(fullStackOnline, staticHostOnline), false);
});

test('runConnectivityProbe returns online immediately when /api/health returns { ok: true }', async () => {
  const calls: string[] = [];
  const res = await runConnectivityProbe({
    browserOnline: true,
    now: () => 12345,
    fetchImpl: async (url) => {
      calls.push(url);
      return jsonResponse({ ok: true });
    },
  });
  assert.deepEqual(res, { apiReachable: true, hostReachable: true });
  assert.deepEqual(calls, ['/api/health?t=12345']);
});

test('runConnectivityProbe detects online static host when /api/health returns 404/HTML but app-version.json succeeds', async () => {
  const calls: string[] = [];
  const res = await runConnectivityProbe({
    browserOnline: true,
    now: () => 999,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith('/api/health')) {
        return htmlResponse(404);
      }
      return jsonResponse({ version: '2.9.1', buildId: '2026.05.25-1' });
    },
  });
  assert.deepEqual(res, { apiReachable: false, hostReachable: true });
  assert.deepEqual(calls, ['/api/health?t=999', './app-version.json?t=999']);
  const derived = deriveNetworkModeState({ browserOnline: true, ...res });
  assert.equal(derived.isOffline, false);
  assert.equal(derived.staticFallback, true);
});

test('runConnectivityProbe detects offline when browserOnline is false without fetching', async () => {
  let called = false;
  const res = await runConnectivityProbe({
    browserOnline: false,
    fetchImpl: async () => {
      called = true;
      return jsonResponse({ ok: true });
    },
  });
  assert.equal(called, false);
  assert.deepEqual(res, { apiReachable: false, hostReachable: false });
});

test('runConnectivityProbe detects offline when both /api/health and app-version.json fail with network error', async () => {
  const res = await runConnectivityProbe({
    browserOnline: true,
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  assert.deepEqual(res, { apiReachable: false, hostReachable: false });
});

test('runConnectivityProbe treats 502/503 server outage as offline', async () => {
  const res = await runConnectivityProbe({
    browserOnline: true,
    fetchImpl: async () => new Response('Bad Gateway', { status: 502 }),
  });
  assert.deepEqual(res, { apiReachable: false, hostReachable: false });
});

test('runConnectivityProbe treats live auth-proxy 401/302 (e.g. iOS standalone PWA) as online host', async () => {
  const res = await runConnectivityProbe({
    browserOnline: true,
    fetchImpl: async () => new Response('Unauthorized', { status: 401 }),
  });
  assert.deepEqual(res, { apiReachable: false, hostReachable: true });
});
