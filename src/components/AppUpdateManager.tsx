import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { useApp } from '../context/AppContext.tsx';
import {
  APP_BUILD_ID,
  APP_CHANGELOG,
  APP_VERSION,
  evaluateAppUpdateState,
  filterAndSortChangelog,
  mergeChangelogs,
  type AppReleaseNote,
  type RemoteVersionPayload,
} from '../shared/appVersion.ts';

const SEEN_BUILD_KEY = 'samaan_seen_build_id_v1';
const DEFERRED_BUILD_KEY = 'samaan_deferred_build_id_v1';
const POLL_INTERVAL_MS = 60_000;
const MIN_FOCUS_CHECK_GAP_MS = 15_000;

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

async function fetchRemoteVersion(): Promise<RemoteVersionPayload | null> {
  const ts = Date.now();
  const candidates = [`/api/app/version?t=${ts}`, `./app-version.json?t=${ts}`];
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) continue;
      const data = (await res.json()) as Partial<RemoteVersionPayload>;
      if (data && typeof data.buildId === 'string' && typeof data.version === 'string') {
        return {
          version: data.version,
          buildId: data.buildId,
          releasedAt: data.releasedAt || '',
          latestRelease: data.latestRelease || APP_CHANGELOG[0],
          changelog: Array.isArray(data.changelog) && data.changelog.length > 0 ? data.changelog : APP_CHANGELOG,
        };
      }
    } catch {
      // Try next candidate quietly
    }
  }
  return null;
}

export const AppUpdateManager: React.FC = () => {
  const { prefs, notify } = useApp();
  const isFa = prefs.language === 'fa';

  // Read initial lastSeenBuildId BEFORE persisting first-visit marker
  const [initialLastSeen] = useState<string | null>(() => {
    const existing = safeGetStorage(SEEN_BUILD_KEY);
    if (!existing) {
      // First-ever visit: record current build quietly without nagging
      safeSetStorage(SEEN_BUILD_KEY, APP_BUILD_ID);
      return null;
    }
    return existing;
  });

  const [lastSeenBuildId, setLastSeenBuildId] = useState<string | null>(initialLastSeen);
  const [deferredBuildId, setDeferredBuildId] = useState<string | null>(() => safeGetStorage(DEFERRED_BUILD_KEY));
  const [remotePayload, setRemotePayload] = useState<RemoteVersionPayload | null>(null);
  const [swNeedRefresh, setSwNeedRefresh] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checkingManual, setCheckingManual] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyVersionFilter, setHistoryVersionFilter] = useState('all');
  const [historySortOrder, setHistorySortOrder] = useState<'newest' | 'oldest'>('newest');

  const updateSwFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckAtRef = useRef<number>(0);

  const checkForUpdates = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheckAtRef.current < MIN_FOCUS_CHECK_GAP_MS) {
      return null;
    }
    lastCheckAtRef.current = now;

    if (swRegRef.current) {
      swRegRef.current.update().catch(() => {});
    }
    const payload = await fetchRemoteVersion();
    if (payload) {
      setRemotePayload(payload);
    }
    return payload;
  }, []);

  // Register Service Worker in non-intrusive prompt mode (never force-reloads mid-work)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setSwNeedRefresh(true);
          void checkForUpdates(true);
        },
        onRegisteredSW(_swUrl, reg) {
          if (reg) {
            swRegRef.current = reg;
            reg.update().catch(() => {});
          }
        },
      });
      updateSwFnRef.current = updateSW;
    } catch {
      // Safe fallback in dev or non-SW environments
    }
  }, [checkForUpdates]);

  // Poll for remote updates quietly while running & on window focus/visibility restore
  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void checkForUpdates(true);
    }, 2500);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates(false);
      }
    }, POLL_INTERVAL_MS);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdates(false);
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [checkForUpdates]);

  const evaluation = useMemo(
    () =>
      evaluateAppUpdateState({
        currentBuildId: APP_BUILD_ID,
        currentVersion: APP_VERSION,
        remotePayload,
        swNeedRefresh,
        lastSeenBuildId,
        deferredBuildId,
        localChangelog: APP_CHANGELOG,
      }),
    [remotePayload, swNeedRefresh, lastSeenBuildId, deferredBuildId],
  );

  // Broadcast subtle badge status for Layout sidebar/header indicator
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('samaan:update-status', {
        detail: {
          hasPendingUpdate: evaluation.shouldShowQuietBadge,
          mode: evaluation.mode,
          targetVersion: evaluation.targetVersion,
        },
      }),
    );
  }, [evaluation.shouldShowQuietBadge, evaluation.mode, evaluation.targetVersion]);

  // Listen for manual changelog / check-update open event from Layout
  useEffect(() => {
    const onOpenChangelog = () => {
      setHistoryModalOpen(true);
      void checkForUpdates(true);
    };
    window.addEventListener('samaan:open-changelog', onOpenChangelog);
    return () => window.removeEventListener('samaan:open-changelog', onOpenChangelog);
  }, [checkForUpdates]);

  const handleUpdateNow = async () => {
    setUpdating(true);
    try {
      const nextSeen =
        evaluation.mode === 'live_update' && remotePayload?.buildId
          ? remotePayload.buildId
          : APP_BUILD_ID;
      safeSetStorage(SEEN_BUILD_KEY, nextSeen);
      safeRemoveStorage(DEFERRED_BUILD_KEY);
      setLastSeenBuildId(nextSeen);
      setDeferredBuildId(null);

      // Clear Cache Storage so the latest bundle/assets load cleanly
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((k) => window.caches.delete(k)));
        } catch {
          // ignore cache clear issues
        }
      }

      if (swNeedRefresh && updateSwFnRef.current) {
        await updateSwFnRef.current(true);
      }

      // Trigger clean reload to apply fresh assets
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleDeferLater = () => {
    safeSetStorage(DEFERRED_BUILD_KEY, evaluation.targetBuildId);
    setDeferredBuildId(evaluation.targetBuildId);
  };

  const handleAcknowledgeReopen = () => {
    safeSetStorage(SEEN_BUILD_KEY, APP_BUILD_ID);
    safeRemoveStorage(DEFERRED_BUILD_KEY);
    setLastSeenBuildId(APP_BUILD_ID);
    setDeferredBuildId(null);
  };

  const closeHistoryModal = () => {
    if (evaluation.mode === 'reopen_whats_new') {
      handleAcknowledgeReopen();
    }
    setHistoryModalOpen(false);
  };

  const handleManualCheck = async () => {
    setCheckingManual(true);
    try {
      const payload = await checkForUpdates(true);
      const hasNew = Boolean(
        swNeedRefresh || (payload && payload.buildId && payload.buildId !== APP_BUILD_ID),
      );
      if (hasNew) {
        safeRemoveStorage(DEFERRED_BUILD_KEY);
        setDeferredBuildId(null);
        notify(
          'info',
          isFa
            ? `نسخه جدید (${payload?.version || APP_VERSION}) آماده بروزرسانی است.`
            : `Update v${payload?.version || APP_VERSION} is ready to install.`,
        );
      } else {
        notify(
          'success',
          isFa
            ? `برنامه شما در آخرین نسخه (${APP_VERSION}) به‌روز است.`
            : `You are running the latest version (v${APP_VERSION}).`,
        );
      }
    } finally {
      setCheckingManual(false);
    }
  };

  const allChangelog = useMemo(
    () => mergeChangelogs(remotePayload?.changelog, APP_CHANGELOG),
    [remotePayload],
  );

  const visibleChangelog = useMemo(
    () =>
      filterAndSortChangelog(allChangelog, {
        query: historySearch,
        versionFilter: historyVersionFilter,
        sortOrder: historySortOrder,
      }),
    [allChangelog, historySearch, historyVersionFilter, historySortOrder],
  );

  const earliestVersion = allChangelog[allChangelog.length - 1]?.version || '1.0.0';
  const latestVersion = allChangelog[0]?.version || APP_VERSION;

  const renderReleaseItems = (releases: AppReleaseNote[], compact: boolean) => (
    <div className={compact ? 'max-h-40 overflow-y-auto space-y-2.5 pe-1' : 'space-y-3'}>
      {releases.map((rel) => {
        const changes = isFa ? rel.changesFa : rel.changesEn;
        const isCurrent = rel.version === APP_VERSION;
        const isInitial = rel.version === '1.0.0';
        return (
          <div
            key={`${rel.version}-${rel.buildId}`}
            data-testid={`release-entry-${rel.version}`}
            className={
              compact
                ? 'space-y-1'
                : `rounded-xl border p-3.5 space-y-2 ${
                    isCurrent
                      ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-soft)]/35'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)]'
                  }`
            }
          >
            <div className="flex items-start justify-between gap-2 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-bold text-[var(--text-primary)] tabular-nums">
                    {isFa ? `نسخه ${rel.version}` : `v${rel.version}`}
                  </span>
                  {!compact && isCurrent && (
                    <span className="text-[10px] font-semibold text-[var(--accent-primary)]">
                      {isFa ? '• نسخه فعلی' : '• Current'}
                    </span>
                  )}
                  {!compact && isInitial && (
                    <span className="text-[10px] font-medium text-[var(--text-muted)]">
                      {isFa ? '• انتشار اولیه' : '• Initial Release'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {isFa ? rel.titleFa : rel.titleEn}
                </div>
              </div>
              {rel.releasedAt && (
                <span dir="ltr" className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0 mt-0.5">
                  {rel.releasedAt}
                </span>
              )}
            </div>
            <ul className="space-y-1 ps-4 list-disc text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {changes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Non-intrusive Corner Update Notification Card (Never steals focus or blocks forms) */}
      {evaluation.shouldShowFloatingToast && !historyModalOpen && (
        <aside
          role="status"
          aria-live="polite"
          data-testid="app-update-toast"
          className="samaan-animate-in fixed bottom-5 end-5 z-[58] w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl border border-[var(--accent-primary)]/35 bg-[var(--bg-elevated)] shadow-[var(--shadow-float)] p-4 space-y-3 print:hidden"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--text-primary)]">
                  {evaluation.mode === 'live_update'
                    ? isFa
                      ? `بروزرسانی جدید آماده است (نسخه ${evaluation.targetVersion})`
                      : `New Update Available (v${evaluation.targetVersion})`
                    : isFa
                      ? `برنامه به نسخه ${evaluation.targetVersion} بروزرسانی شد`
                      : `App Updated to v${evaluation.targetVersion}`}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {evaluation.mode === 'live_update'
                    ? isFa
                      ? 'می‌توانید همین الان یا پس از اتمام کارتان بروزرسانی کنید.'
                      : 'Update now or defer until you finish your current task.'
                    : isFa
                      ? 'تغییرات جدید اعمال شده در این نسخه را مشاهده کنید.'
                      : 'Review the latest improvements applied to the app.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeferLater}
              title={isFa ? 'بستن موقت (یادآوری بعداً)' : 'Dismiss for now'}
              className="p-1 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Collapsible Release Notes List */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 space-y-2">
            <button
              type="button"
              onClick={() => setDetailsExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-[var(--accent-primary)]"
            >
              <span>{isFa ? 'تغییرات اعمال شده' : 'What Changed'}</span>
              {detailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {detailsExpanded && renderReleaseItems(evaluation.releases, true)}
            <div className="pt-1 border-t border-[var(--border-subtle)] flex justify-end">
              <button
                type="button"
                data-testid="app-update-open-full-history-btn"
                onClick={() => setHistoryModalOpen(true)}
                className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1"
              >
                <History className="w-3 h-3" />
                <span>
                  {isFa
                    ? `مشاهده تمام تغییرات از نسخه ${earliestVersion}`
                    : `View all changes since v${earliestVersion}`}
                </span>
              </button>
            </div>
          </div>

          {/* Non-intrusive Action Buttons */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="app-update-later-btn"
              onClick={handleDeferLater}
              className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isFa ? 'بعداً' : 'Later'}</span>
            </button>

            {evaluation.mode === 'live_update' ? (
              <button
                type="button"
                data-testid="app-update-now-btn"
                disabled={updating}
                onClick={() => void handleUpdateNow()}
                className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
                <span>
                  {updating
                    ? isFa
                      ? 'در حال بروزرسانی...'
                      : 'Updating...'
                    : isFa
                      ? 'بروزرسانی همین الان'
                      : 'Update Now'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="app-update-ack-btn"
                onClick={handleAcknowledgeReopen}
                className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isFa ? 'متوجه شدم' : 'Got It'}</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* On-Demand Full Release Notes (v1.0.0 -> Latest) & Manual Update Check Modal */}
      {historyModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={closeHistoryModal}
        >
          <div
            data-testid="app-changelog-modal"
            className="samaan-animate-in w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] max-h-[88vh] flex flex-col shadow-[var(--shadow-float)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    {isFa ? 'بروزرسانی و تاریخچه کامل تغییرات برنامه' : 'App Updates & Full Release History'}
                  </h3>
                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {isFa
                      ? `نسخه فعلی نصب‌شده: ${APP_VERSION} · تاریخچه کامل از نسخه ${earliestVersion} تا ${latestVersion} (${allChangelog.length} نسخه)`
                      : `Installed: v${APP_VERSION} · Complete history v${earliestVersion} → v${latestVersion} (${allChangelog.length} releases)`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {evaluation.mode === 'live_update' ? (
                <div className="p-3.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs">
                    <div className="font-bold text-[var(--accent-primary)]">
                      {isFa
                        ? `نسخه جدید ${evaluation.targetVersion} آماده نصب است!`
                        : `New version v${evaluation.targetVersion} is ready!`}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {isFa
                        ? 'با کلیک روی دکمه بروزرسانی، آخرین نسخه بدون از دست رفتن اطلاعات بارگذاری می‌شود.'
                        : 'Click Update Now to reload with the latest changes safely.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => void handleUpdateNow()}
                    className="h-8 px-3.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-contrast)] text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
                    <span>{isFa ? 'بروزرسانی همین الان' : 'Update Now'}</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[var(--status-success)] font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {isFa ? `برنامه در آخرین نسخه (${APP_VERSION}) است.` : `Your app is up to date (v${APP_VERSION}).`}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={checkingManual}
                    onClick={() => void handleManualCheck()}
                    className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-xs font-medium flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingManual ? 'animate-spin' : ''}`} />
                    <span>{isFa ? 'بررسی بروزرسانی جدید' : 'Check for Updates'}</span>
                  </button>
                </div>
              )}

              {/* Search, Version Selector & Sort Controls (v1.0.0 -> Latest) */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    data-testid="changelog-search-input"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder={isFa ? 'جستجو در تغییرات یا شماره نسخه...' : 'Search release notes or version...'}
                    className="w-full h-8 ps-8 pe-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </div>
                <select
                  data-testid="changelog-version-select"
                  value={historyVersionFilter}
                  onChange={(e) => setHistoryVersionFilter(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="all">
                    {isFa ? `همه نسخه‌ها (${allChangelog.length})` : `All versions (${allChangelog.length})`}
                  </option>
                  {allChangelog.map((rel) => (
                    <option key={rel.version} value={rel.version}>
                      {isFa ? `نسخه ${rel.version}` : `Version ${rel.version}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="changelog-sort-toggle"
                  onClick={() => setHistorySortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
                  className="h-8 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-secondary)] flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  <span>
                    {historySortOrder === 'newest'
                      ? isFa
                        ? 'جدیدترین اول'
                        : 'Newest first'
                      : isFa
                        ? `از نسخه ${earliestVersion}`
                        : `From v${earliestVersion}`}
                  </span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--text-primary)]">
                    {isFa ? 'فهرست تغییرات نسخه‌ها' : 'Release Notes'}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {isFa
                      ? `نمایش ${visibleChangelog.length} از ${allChangelog.length} نسخه`
                      : `Showing ${visibleChangelog.length} of ${allChangelog.length} releases`}
                  </span>
                </div>
                {visibleChangelog.length > 0 ? (
                  renderReleaseItems(visibleChangelog, false)
                ) : (
                  <div className="p-6 text-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-xs text-[var(--text-muted)]">
                    {isFa ? 'تغییری مطابق جستجوی شما یافت نشد.' : 'No matching release notes found.'}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex justify-end">
              <button
                type="button"
                onClick={closeHistoryModal}
                className="h-8 px-4 rounded-lg border border-[var(--border-subtle)] text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                {isFa ? 'بستن' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

