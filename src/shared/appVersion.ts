export interface AppReleaseNote {
  version: string;
  buildId: string;
  releasedAt: string;
  titleFa: string;
  titleEn: string;
  changesFa: string[];
  changesEn: string[];
}

export interface RemoteVersionPayload {
  version: string;
  buildId: string;
  releasedAt: string;
  latestRelease: AppReleaseNote;
  changelog: AppReleaseNote[];
}

export const APP_VERSION = '2.5.1';
export const APP_BUILD_ID = '2026.05.20-2';
export const APP_RELEASED_AT = '2026-05-20';

export const APP_CHANGELOG: AppReleaseNote[] = [
  {
    version: '2.5.1',
    buildId: '2026.05.20-2',
    releasedAt: '2026-05-20',
    titleFa: 'بازطراحی کامل ظاهر مدرن، خلوت و کاربرپسند برنامه',
    titleEn: 'Modern Scandinavian-Industrial Visual Redesign',
    changesFa: [
      'بازطراحی کامل پالت رنگی روشن و تیره با کنتراست خوانا، سطوح مسطح مدرن و تفکیک بصری دقیق',
      'نوار شاخص‌های کلیدی (KPI) یکپارچه در داشبورد با خطوط جداکننده ظریف و سلسله‌مراتب تایپوگرافی شفاف',
      'ساده‌سازی و خلوت‌سازی منوی کناری با داک فشرده تنظیمات سریع، آواتار کاربری و مسیر راهنمای صفحه در نوار بالا',
      'جایگزینی برچسب‌های شلوغ جداول با نشانگرهای نقطه‌ای مینیمال و ارتقای نمایش تصاویر اقلام تجهیزات',
    ],
    changesEn: [
      'Redesigned Light & Dark palettes with crisp hairline borders, balanced contrast, and refined deep-teal accent',
      'Unified single-elevation KPI metric strips in Dashboard with hairline dividers and crisp tabular figures',
      'Decluttered sidebar with a compact quick-controls icon dock, user avatar row, and top-bar breadcrumbs',
      'Replaced dense table status pills with calm minimal semantic dot indicators and polished photo thumbnails',
    ],
  },
  {
    version: '2.5.0',
    buildId: '2026.05.20-1',
    releasedAt: '2026-05-20',
    titleFa: 'تصویر اقلام تجهیزات و سامانه هوشمند اطلاع‌رسانی بروزرسانی',
    titleEn: 'Equipment Item Photos & Smart Non-Intrusive Update Center',
    changesFa: [
      'افزودن قابلیت اختصاص تصویر برای هر قلم در بخش ثبت جزئیات تجهیزات با پشتیبانی از کشیدن و رها کردن (Drag & Drop) و پیش‌نمایش تمام‌صفحه با کلیک روی هر ردیف',
      'افزودن سیستم اطلاع‌رسانی هوشمند بروزرسانی برنامه با نمایش فهرست تغییرات و انتخاب «بروزرسانی همین الان» یا «بعداً» بدون ایجاد مزاحمت هنگام کار',
      'تشخیص خودکار تغییرات چه در حین باز بودن برنامه و چه پس از بستن و باز کردن مجدد نرم‌افزار',
    ],
    changesEn: [
      'Added equipment photo attachment for Detailed items with Drag & Drop upload and click-to-preview full-screen lightbox',
      'Added non-intrusive app update notification with release notes and Update Now / Later choices',
      'Automatic update detection both while the app is open and upon closing and reopening',
    ],
  },
  {
    version: '2.4.0',
    buildId: '2026.05.12-1',
    releasedAt: '2026-05-12',
    titleFa: 'بازگردانی سراسری (Undo/Redo)، صفحه‌بندی یکپارچه و بهینه‌سازی چاپ',
    titleEn: 'Universal Undo/Redo, Unified Pagination & Print Header Repetition',
    changesFa: [
      'پشتیبانی سراسری از دکمه‌های بازگردانی و انجام مجدد (Ctrl+Z / Ctrl+Y) در تمام بخش‌های نرم‌افزار',
      'افزودن کنترل انتخاب تعداد ردیف در صفحه و دکمه «انتخاب صفحه» به تمام جداول برنامه',
      'تکرار خودکار تیتر ستون‌ها در بالای تمامی صفحات خروجی چاپگر',
      'بهبود نمایش دسته‌بندی تخصصی اقلام به زبان فارسی/انگلیسی خالص و بهینه‌سازی قوانین بازیابی سطل بازیافت',
    ],
    changesEn: [
      'Universal Undo/Redo (Ctrl+Z / Ctrl+Y) support across every section of the application',
      'Added rows-per-page selector and Select Page control across all data tables',
      'Automatic repeating table headers across all printed pages',
      'Strict language-matched specialized category labels and unified duplicate validation on Recycle Bin restore',
    ],
  },
];

export function getLocalVersionPayload(): RemoteVersionPayload {
  return {
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    releasedAt: APP_RELEASED_AT,
    latestRelease: APP_CHANGELOG[0],
    changelog: APP_CHANGELOG,
  };
}

export interface UpdateEvaluationInput {
  currentBuildId: string;
  currentVersion: string;
  remotePayload?: RemoteVersionPayload | null;
  swNeedRefresh?: boolean;
  lastSeenBuildId?: string | null;
  deferredBuildId?: string | null;
  localChangelog?: AppReleaseNote[];
}

export type UpdateStatusMode = 'none' | 'live_update' | 'reopen_whats_new';

export interface UpdateEvaluationResult {
  mode: UpdateStatusMode;
  targetBuildId: string;
  targetVersion: string;
  isDeferred: boolean;
  shouldShowFloatingToast: boolean;
  shouldShowQuietBadge: boolean;
  releases: AppReleaseNote[];
}

export function collectReleasesSince(
  changelog: AppReleaseNote[],
  lastSeenBuildId: string | null | undefined,
): AppReleaseNote[] {
  if (!changelog || changelog.length === 0) return [];
  if (!lastSeenBuildId) return [changelog[0]];
  const collected: AppReleaseNote[] = [];
  for (const rel of changelog) {
    if (rel.buildId === lastSeenBuildId) break;
    collected.push(rel);
  }
  return collected.length > 0 ? collected : [changelog[0]];
}

export function evaluateAppUpdateState(input: UpdateEvaluationInput): UpdateEvaluationResult {
  const localChangelog = input.localChangelog && input.localChangelog.length > 0
    ? input.localChangelog
    : APP_CHANGELOG;

  const remote = input.remotePayload || null;
  const remoteDiffers = Boolean(remote && remote.buildId && remote.buildId !== input.currentBuildId);
  const swPending = Boolean(input.swNeedRefresh);

  // Case 1: Live update available while app is open (new server/build manifest OR waiting service worker)
  if (remoteDiffers || swPending) {
    const targetBuildId = remoteDiffers
      ? remote!.buildId
      : `${input.currentBuildId}:sw`;
    const targetVersion = remoteDiffers
      ? remote!.version
      : input.currentVersion;
    const sourceChangelog =
      remote && Array.isArray(remote.changelog) && remote.changelog.length > 0
        ? remote.changelog
        : remote?.latestRelease
          ? [remote.latestRelease]
          : localChangelog;

    const releases = collectReleasesSince(sourceChangelog, input.currentBuildId);
    const isDeferred = Boolean(input.deferredBuildId && input.deferredBuildId === targetBuildId);

    return {
      mode: 'live_update',
      targetBuildId,
      targetVersion,
      isDeferred,
      shouldShowFloatingToast: !isDeferred,
      shouldShowQuietBadge: true,
      releases,
    };
  }

  // Case 2: User closed and reopened the app after an update was deployed
  if (input.lastSeenBuildId && input.lastSeenBuildId !== input.currentBuildId) {
    const targetBuildId = input.currentBuildId;
    const isDeferred = Boolean(input.deferredBuildId && input.deferredBuildId === targetBuildId);
    const releases = collectReleasesSince(localChangelog, input.lastSeenBuildId);

    return {
      mode: 'reopen_whats_new',
      targetBuildId,
      targetVersion: input.currentVersion,
      isDeferred,
      shouldShowFloatingToast: !isDeferred,
      shouldShowQuietBadge: true,
      releases,
    };
  }

  return {
    mode: 'none',
    targetBuildId: input.currentBuildId,
    targetVersion: input.currentVersion,
    isDeferred: false,
    shouldShowFloatingToast: false,
    shouldShowQuietBadge: false,
    releases: [localChangelog[0]],
  };
}
