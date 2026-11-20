import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_BUILD_ID,
  APP_CHANGELOG,
  APP_VERSION,
  collectReleasesSince,
  evaluateAppUpdateState,
  type AppReleaseNote,
  type RemoteVersionPayload,
} from './appVersion.ts';

const SAMPLE_CHANGELOG: AppReleaseNote[] = [
  {
    version: '2.6.0',
    buildId: '2026.06.01-1',
    releasedAt: '2026-06-01',
    titleFa: 'نسخه ۲.۶',
    titleEn: 'Version 2.6',
    changesFa: ['تغییر جدید ۱', 'تغییر جدید ۲'],
    changesEn: ['New change 1', 'New change 2'],
  },
  {
    version: '2.5.0',
    buildId: '2026.05.20-1',
    releasedAt: '2026-05-20',
    titleFa: 'نسخه ۲.۵',
    titleEn: 'Version 2.5',
    changesFa: ['تصویر اقلام'],
    changesEn: ['Item photos'],
  },
  {
    version: '2.4.0',
    buildId: '2026.05.12-1',
    releasedAt: '2026-05-12',
    titleFa: 'نسخه ۲.۴',
    titleEn: 'Version 2.4',
    changesFa: ['بازگردانی سراسری'],
    changesEn: ['Universal undo'],
  },
];

test('evaluateAppUpdateState returns none on first visit when remote matches local', () => {
  const res = evaluateAppUpdateState({
    currentBuildId: APP_BUILD_ID,
    currentVersion: APP_VERSION,
    remotePayload: {
      version: APP_VERSION,
      buildId: APP_BUILD_ID,
      releasedAt: '2026-05-20',
      latestRelease: APP_CHANGELOG[0],
      changelog: APP_CHANGELOG,
    },
    swNeedRefresh: false,
    lastSeenBuildId: null,
    deferredBuildId: null,
  });
  assert.equal(res.mode, 'none');
  assert.equal(res.shouldShowFloatingToast, false);
  assert.equal(res.shouldShowQuietBadge, false);
});

test('evaluateAppUpdateState detects live remote update while app is open', () => {
  const remote: RemoteVersionPayload = {
    version: '2.6.0',
    buildId: '2026.06.01-1',
    releasedAt: '2026-06-01',
    latestRelease: SAMPLE_CHANGELOG[0],
    changelog: SAMPLE_CHANGELOG,
  };
  const res = evaluateAppUpdateState({
    currentBuildId: '2026.05.20-1',
    currentVersion: '2.5.0',
    remotePayload: remote,
    swNeedRefresh: false,
    lastSeenBuildId: '2026.05.20-1',
    deferredBuildId: null,
  });
  assert.equal(res.mode, 'live_update');
  assert.equal(res.targetVersion, '2.6.0');
  assert.equal(res.shouldShowFloatingToast, true);
  assert.equal(res.shouldShowQuietBadge, true);
  assert.equal(res.releases.length, 1);
  assert.equal(res.releases[0].version, '2.6.0');
});

test('evaluateAppUpdateState hides floating toast when user deferred current update', () => {
  const remote: RemoteVersionPayload = {
    version: '2.6.0',
    buildId: '2026.06.01-1',
    releasedAt: '2026-06-01',
    latestRelease: SAMPLE_CHANGELOG[0],
    changelog: SAMPLE_CHANGELOG,
  };
  const res = evaluateAppUpdateState({
    currentBuildId: '2026.05.20-1',
    currentVersion: '2.5.0',
    remotePayload: remote,
    deferredBuildId: '2026.06.01-1',
  });
  assert.equal(res.mode, 'live_update');
  assert.equal(res.isDeferred, true);
  assert.equal(res.shouldShowFloatingToast, false);
  assert.equal(res.shouldShowQuietBadge, true);
});

test('evaluateAppUpdateState detects update after closing and reopening app', () => {
  const res = evaluateAppUpdateState({
    currentBuildId: '2026.06.01-1',
    currentVersion: '2.6.0',
    remotePayload: null,
    swNeedRefresh: false,
    lastSeenBuildId: '2026.05.12-1',
    deferredBuildId: null,
    localChangelog: SAMPLE_CHANGELOG,
  });
  assert.equal(res.mode, 'reopen_whats_new');
  assert.equal(res.shouldShowFloatingToast, true);
  assert.equal(res.releases.length, 2);
  assert.deepEqual(
    res.releases.map((r) => r.version),
    ['2.6.0', '2.5.0'],
  );
});

test('evaluateAppUpdateState handles waiting service worker even without remote payload', () => {
  const res = evaluateAppUpdateState({
    currentBuildId: '2026.05.20-1',
    currentVersion: '2.5.0',
    remotePayload: null,
    swNeedRefresh: true,
    lastSeenBuildId: '2026.05.20-1',
  });
  assert.equal(res.mode, 'live_update');
  assert.equal(res.shouldShowFloatingToast, true);
  assert.equal(res.targetBuildId, '2026.05.20-1:sw');
});

test('collectReleasesSince returns latest entry if lastSeenBuildId is unknown', () => {
  const list = collectReleasesSince(SAMPLE_CHANGELOG, 'unknown-old-build');
  assert.equal(list.length, 3);
});
