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

export const APP_VERSION = '2.12.0';
export const APP_BUILD_ID = '2026.05.28-1';
export const APP_RELEASED_AT = '2026-05-28';

export const APP_CHANGELOG: AppReleaseNote[] = [
  {
    version: '2.12.0',
    buildId: '2026.05.28-1',
    releasedAt: '2026-05-28',
    titleFa: 'بازطراحی کامل بخش برچسب انبارش کالا (MD1EX-FQP02/14-01) برای مپنا توسعه یک، چاپ ۴عددی A4 و تغییر نام ستون توضیحات تجهیز',
    titleEn: 'Redesigned MD1 Storage Label (MD1EX-FQP02/14-01) with 4-Up A4 Printing, Smart 20-Rule Warehouse Detection & Equipment Notes Rename',
    changesFa: [
      'تغییر نام بخش «تعریف و آپلود فرم‌ها» به «آپلود و تعریف فرم‌ها» در سراسر سامانه و تغییر نام ستون «توضیحات کسری/مغایرت» به «توضیحات تجهیز» در جدول ثبت جزئیات تجهیزات',
      'فعال‌سازی فرم رسمی «برچسب انبارش کالا (MD1EX-FQP02/14-01)» به‌عنوان اولین فرم پیش‌فرض کارفرمای «مپنا توسعه یک (MD1)» با حفظ قفل سایر کارفرماها تا زمان آپلود فرم اختصاصی',
      'بازطراحی کامل بخش برچسب انبارش کالا با فیلترهای پیشرفته مشابه جزئیات تجهیزات (جستجو، انتخاب چند پکینگ، فیلتر شرطی و فیلتر ستونی اکسل) و امکان انتخاب ۱ تا هزاران ردیف',
      'چیدمان دقیق و استاندارد چاپ ۴ عدد برچسب با فاصله برش در هر برگه A4 برای هر تعداد ردیف انتخاب‌شده (از ۱ ردیف تا ۱۰۰۰ ردیف)',
      'تشخیص هوشمند فارسی نام انبار (Warehouse) بر اساس ۲۰ کد محل نگهداری (W1..W3، CA..CH، CR، Mapna، PR، S، Meco، Tuga، WNNC، SITE، WNNE) و پرکردن خودکار تمام فیلدهای رسمی فرم از داده‌های پروژه و جدول جزئیات',
    ],
    changesEn: [
      'Renamed "Define & Upload Forms" to "Upload & Define Forms" across the UI and renamed "Discrepancy/Shortage Notes" to "Equipment Notes" in Detailed Equipment',
      'Activated the official Storage Label (MD1EX-FQP02/14-01) as the first built-in default form for MAPNA MD1 while keeping other employers gated until upload',
      'Redesigned Storage Labels with Detailed-Equipment-grade filtering (search, multi-packing, custom AND/OR filters, Excel column filters) and multi-row / all-filtered selection',
      'Enforced strict 4-up A4 sheet printing (2×2 grid with cutting spacing) whether 1 row or 1,000 rows are selected',
      'Added automatic 20-rule Persian Warehouse detection from Storage Location and exact field binding for Project, Tag No., Description, SYSTEM (Sub-System), Package No. (Shipment/Package), Item No., Location, VENDOR, and Drum number',
    ],
  },
  {
    version: '2.11.0',
    buildId: '2026.05.27-3',
    releasedAt: '2026-05-27',
    titleFa: 'حذف فرم‌های پیش‌فرض قبلی و فعال‌سازی سیستم کنترل دسترسی ۹ بخش فرم‌ها بر اساس کارفرما و آپلود فرم',
    titleEn: 'Removed Legacy Default Forms & Added Per-Employer 9-Section Form Access Control and Upload-to-Unlock Flow',
    changesFa: [
      'حذف کامل فرم‌های پیش‌فرض قدیمی از سامانه و آماده‌سازی ساختار تمیز برای جایگزینی بخش‌به‌بخش فرم‌های جدید کارفرمای «مپنا توسعه یک (MD1)»',
      'اعمال قفل هوشمند روی هر ۹ بخش فرم‌های عملیاتی برای کارفرماهای «مپنا توسعه دو (MD2)»، «مپنا توسعه سه (MD3)»، کارفرماهای جدید و بخش‌های بدون فرم پیش‌فرض، همراه با نمایش پیام راهنما و لینک مستقیم به بخش «تعریف و آپلود فرم»',
      'افزودن جدول وضعیت ۹ بخش فرم‌ها در تب «تعریف و آپلود فرم‌ها» با امکان آپلود مستقیم فایل فرم برای هر بخش و فعال‌سازی فوری دسترسی آن بخش بلافاصله پس از بارگذاری',
      'اصلاح ذخیره‌سازی پایدار اتصال فرم‌های آپلودی به بخش‌های عملیاتی سامانه در سمت سرور و حالت آفلاین',
    ],
    changesEn: [
      'Purged all legacy built-in default forms and prepared a clean per-section registry for replacing MD1 default forms section by section',
      'Added per-employer access gating across all 9 operational form sections for MD2, MD3, custom employers, and unconfigured sections with guided prompts to Define & Upload Forms',
      'Added a 9-section status and direct upload matrix inside the Define & Upload Forms tab that immediately unlocks each section once its form is uploaded',
      'Fixed server and offline persistence of target section bindings and data sources for uploaded employer forms',
    ],
  },
  {
    version: '2.10.1',
    buildId: '2026.05.27-2',
    releasedAt: '2026-05-27',
    titleFa: 'بازطراحی جمع‌وجور صفحه اول برای موبایل، نمایش ورژن در پایین صفحه و قوانین اعتبارسنجی دقیق تعریف کارفرمای جدید',
    titleEn: 'Compact Mobile-First Onboarding, Footer Version Display & Strict New Employer Field Validation',
    changesFa: [
      'بازطراحی مدرن، جمع‌وجور و سازگار با نمایشگرهای کوچک برای بخش انتخاب کارفرما در صفحه اول با حذف آیکون‌های بزرگ اضافی',
      'نمایش ورژن فعلی نصب‌شده روی دستگاه در پایین صفحه اول به قالب «سمان — سامانه جامع مدیریت انبارهای نیروگاهی ورژن #.#.#»',
      'اعمال قوانین دقیق اعتبارسنجی در فرم تعریف کارفرمای جدید: تلفن و فکس تک‌کادره با پیش‌شماره ثابت 98+، کد استان ۲ رقمی بدون صفر و شماره ۸ رقمی (پشتیبانی از اعداد فارسی و انگلیسی)، کدپستی دقیقاً ۱۰ رقمی، اعتبارسنجی استاندارد ایمیل، و بررسی فرمت رسمی نام کاربری اینستاگرام و لینکدین',
      'پاکسازی فرم تعریف کارفرما: حذف متن‌های نمونه (Placeholder)، حذف فیلد «نام لاتین کارفرما»، تغییر عنوان «عنوان کامل شرکت» به «عنوان کامل فارسی»، حذف توضیح قرارداد مرجع و خالی‌شدن مقدار پیش‌فرض زیرعنوان سیستم مدیریت',
    ],
    changesEn: [
      'Redesigned the first-screen employer picker into a sleek, compact, mobile-friendly layout without oversized icons',
      'Added active device version display in the first-screen footer',
      'Added strict optional validation in Define New Employer: unified +98 / ## / ######## single-box inputs for Phone and Fax (Persian & English digits, no leading zero in province code), 10-digit Postal Code, valid Email domain/TLD check, and official Instagram & LinkedIn username enforcement',
      'Cleaned up Employer Profile form: removed example placeholders, removed Latin Name field, renamed Full Company Title to Full Persian Title, removed contract-ref helper box, and cleared default Management System Subtitle',
    ],
  },
  {
    version: '2.10.0',
    buildId: '2026.05.27-1',
    releasedAt: '2026-05-27',
    titleFa: 'بازطراحی کامل بخش کارفرمایان با کارفرماهای پیش‌فرض مپنا، انتخاب کارفرما و پروژه در صفحه ورود و حذف بخش طراحی فرم',
    titleEn: 'Rebuilt Employers System with Built-in MAPNA Presets (MD1/MD2/MD3), Redesigned Onboarding & Form Designer Removal',
    changesFa: [
      'افزودن سه کارفرمای پیش‌فرض «مپنا توسعه یک (MD1)»، «مپنا توسعه دو (MD2)» و «مپنا توسعه سه (MD3)» با مشخصات کامل، کدپستی، فکس، پست الکترونیکی، شبکه‌های اجتماعی و لوگوی اختصاصی هر شرکت',
      'بازطراحی صفحه ورود و راه‌اندازی اولیه نرم‌افزار برای انتخاب مستقیم کارفرما از بین سه کارفرمای پیش‌فرض، ثبت نام پروژه (مثلاً «نیروگاه نکا») و کد / شماره قرارداد مرجع (اختیاری)',
      'افزودن گزینه «تعریف کارفرمای جدید» در صفحه ورود و بخش مدیریت پروژه‌ها با امکان بارگذاری لوگو و آپلود فرم اختصاصی برای کارفرمای جدید',
      'حذف کامل بخش اضافی «طراحی فرم» از سراسر نرم‌افزار با حفظ کامل قابلیت آپلود و پرکردن خودکار فرم‌های کارفرما',
    ],
    changesEn: [
      'Added three built-in default MAPNA employers (MD1, MD2, MD3) with full corporate metadata, contact details, social handles, and official PNG logos',
      'Redesigned initial setup and login flow to pick among the 3 built-in MAPNA employers, enter Project Name (e.g. Neka Power Plant), and set an optional Reference Contract Code',
      'Added "Define New Employer" workflow in both onboarding and Project Manager supporting custom logo upload and company form file upload',
      'Removed the redundant Form Designer across the entire application while keeping uploaded form auto-fill and printing intact',
    ],
  },
  {
    version: '2.9.2',
    buildId: '2026.05.26-1',
    releasedAt: '2026-05-26',
    titleFa: 'اصلاح کامل حالت روز و شب در اندروید و ارتقای سازگاری نصب در نسخه‌های جدید اندروید',
    titleEn: 'Fixed Android Light/Dark Mode Auto-Darkening & Modern Android PWA Compatibility',
    changesFa: [
      'رفع کامل مشکل سبز و سرمه‌ای ماندن صفحه در گوشی‌های اندرویدی هنگام تغییر حالت روز و شب؛ جلوگیری از وارونه‌سازی اجباری رنگ‌ها توسط مرورگر و سیستم‌عامل اندروید و همگام‌سازی لحظه‌ای رنگ نوار وضعیت با حالت روشن، تاریک و محافظ چشم',
      'به‌روزرسانی استاندارد فایل مانیفست وب‌اپلیکیشن (شناسه، محدوده اجرا، آیکون‌ها و هدرهای امنیتی) برای سازگاری کامل با نصب مستقیم مرورگر در نسخه‌های جدید اندروید و افزودن راهنمای نصب امن در اندروید',
    ],
    changesEn: [
      'Fixed Android Light/Dark mode turning green and navy instead of crisp white by enforcing only light / only dark color-scheme, forced-color-adjust: none, explicit body backgrounds, and dynamic theme-color meta syncing',
      'Upgraded Web App Manifest (scope-aligned id/start_url, prefer_related_applications: false, display_override, security headers) and added safe browser install guidance for modern Android devices',
    ],
  },
  {
    version: '2.9.1',
    buildId: '2026.05.25-1',
    releasedAt: '2026-05-25',
    titleFa: 'رفع مشکل ثابت ماندن آیکون وضعیت اینترنت و اصلاح پنجره راهنمای نصب در مرورگر سافاری',
    titleEn: 'Fixed Live Online/Offline Connectivity Indicator & Safari Install Guide Modal Positioning',
    changesFa: [
      'رفع کامل مشکل ثابت ماندن آیکون وضعیت اتصال روی حالت آفلاین؛ تفکیک تشخیص اتصال زنده اینترنت و میزبان برنامه از حالت اجرای محلی، افزایش پایداری بررسی خودکار اتصال و تغییر لحظه‌ای آیکون بین آنلاین و آفلاین',
      'اصلاح کامل موقعیت پنجره راهنمای نصب برنامه در مرورگر سافاری آیفون و آیپد با انتقال پنجره به لایه اصلی صفحه تا کل متن راهنما و دکمه «متوجه شدم» به‌صورت کامل و در مرکز صفحه نمایش داده شود',
    ],
    changesEn: [
      'Fixed connectivity status icon getting stuck in offline mode by separating live internet/host reachability from static API fallback and adding resilient automatic online/offline probing',
      'Fixed the iOS Safari installation guide modal rendering off-screen under the blurred top header by rendering it through a document.body portal centered within the full viewport',
    ],
  },
  {
    version: '2.9.0',
    buildId: '2026.05.24-1',
    releasedAt: '2026-05-24',
    titleFa: 'تشخیص خودکار وضعیت اتصال، ارتقای دستیار هوشمند، رفع هنگ بازیابی فایل و تاریخچه کامل نسخه‌ها از نسخه 1.0.0',
    titleEn: 'Automatic Connectivity Status, Upgraded Smart Assistant, Zero-Hang Import & Full Release History from v1.0.0',
    changesFa: [
      'تبدیل وضعیت آنلاین و آفلاین در نوار پایین به نشانگر کاملاً خودکار و غیرتعاملی با تشخیص لحظه‌ای اتصال اینترنت و سرور برنامه و تغییر خودکار آیکون',
      'ارتقای دستیار و تحلیل‌گر هوشمند انبار: اتصال آنلاین به هوش مصنوعی گوگل در سرور، عملکرد کامل و بدون خطای نشست در حالت آفلاین، و اصلاح دقیق پاسخ‌دهی پرسش مواد شیمیایی در آستانه انقضا',
      'رفع کامل هنگ و کندی هنگام تحلیل فایل‌های حجیم در مرحله تشخیص بخش‌های مقصد پشتیبان‌گیری و بازیابی با نمونه‌برداری هوشمند و کش الگوی ستون‌ها',
      'تضمین برابری قطعی تعداد، شماره سند و فهرست پکینگ‌های «دعوتنامه گشایش و بازرسی بسته‌ها» و «صورتجلسه گشایش و بازرسی بسته‌ها» هنگام ورود از فایل',
      'افزایش دقت شناسایی ستون‌ها و اسناد در بازیابی فایل: پشتیبانی از حروف عربی و کشیده، تفکیک فرمول‌های جمع در حواله و برگشتی، وراثت تاریخ ورود در رسید مصرف مستقیم، و جلوگیری از ثبت وضعیت‌ها یا تاریخ به‌جای شماره سند',
      'افزودن تاریخچه کامل تغییرات نرم‌افزار از نسخه 1.0.0 تا آخرین نسخه با قابلیت جستجو، انتخاب نسخه و مرتب‌سازی از جدیدترین یا از نسخه 1.0.0',
    ],
    changesEn: [
      'Converted the sidebar online/offline badge into a passive, automatic connectivity indicator tracking internet state and server reachability',
      'Upgraded Smart Warehouse Assistant with server-side Google Gemini integration online, seamless offline operation without session errors, and accurate chemical expiry responses',
      'Eliminated multi-minute freezes during Step 1 to Step 2 workbook analysis on large files via stratified sparse-column sampling and cached schema plans',
      'Enforced strict 1-to-1 parity between OPI Invitations and OPI Minutes (equal counts, identical numbers, and matching packing lists) on file import',
      'Hardened operational document extraction across Rules 1–7: Arabic/Kashida normalization, formula summand splitting, GCV arrivalDate fallback, and rejection of status/date values as document numbers',
      'Added full searchable and sortable version history from Version 1.0.0 through the latest release',
    ],
  },
  {
    version: '2.8.0',
    buildId: '2026.05.23-1',
    releasedAt: '2026-05-23',
    titleFa: 'پایداری کامل حالت آفلاین، صفحه‌بندی و همگام‌سازی دسته‌بندی‌ها و یکدست‌سازی زبان فارسی',
    titleEn: 'Rock-Solid Offline Stability, Paginated Cascading Categories & Clean Persian UI',
    changesFa: [
      'رفع کامل هنگ، صفحه سفید و توقف روی «در حال بارگذاری» در حالت آفلاین برای بخش‌های جایگزینی تجهیزات، گزارش موازنه و کنترل مصرف مواد، برچسب انبارش کالا، سطل بازیافت، کاربران و ثبت وقایع، و حذف و پاکسازی پایگاه داده',
      'همگام‌سازی خودکار تغییرات بخش دسته‌بندی‌ها با تمام جداول مرتبط نرم‌افزار، افزودن انتخاب تعداد ردیف در صفحه و تفکیک خودکار مقادیر چندخطی درون یک سلول به دسته‌های جداگانه',
      'جایگزینی عبارت «پایگاه داده» به‌جای «دیتابیس» در منو، حذف معادل‌های انگلیسی زائد از برچسب‌های فارسی، و حذف نوار اعلان مزاحم حالت آفلاین',
      'نمایش وضعیت منقضی در ستون «وضعیت / دسته‌بندی» جدول جزئیات برای مواد شیمیایی ناموجود منقضی‌شده بدون ایجاد هشدار در نوار هشدار اقلام دارای موجودی',
    ],
    changesEn: [
      'Fixed offline mode freezes and blank screens across Substitutions, Material Balance, Storage Labels, Recycle Bin, Users & Audit, and Database Purge',
      'Added automatic cascade updates from Categories to all linked tables, per-page pagination controls, and newline-aware multi-value category splitting during import',
      'Standardized Persian terminology across menus and labels and removed the intrusive offline banner',
      'Displayed expired status badge in the Detailed table for zero-stock expired chemicals without triggering in-stock warning banners',
    ],
  },
  {
    version: '2.7.0',
    buildId: '2026.05.22-1',
    releasedAt: '2026-05-22',
    titleFa: 'رفع کامل کندی عملیات انبار و فرم‌های شرکتی، همگام‌سازی هوشمند تغییرات فایل و ارتقای هشدارهای مواد شیمیایی',
    titleEn: 'Zero-Freeze Operations & Corporate Forms Studio, Smart Delta Import Sync & Chemical Alerts Upgrade',
    changesFa: [
      'رفع کامل هنگ و فریز در تمام ۹ بخش «عملیات انبار» و بخش «کارفرمایان و فرم‌های شرکتی» با بارگذاری سبک، کش مدل فرم و بهینه‌سازی رندر',
      'اصلاح آپلود چندتایی لوگو در گالری لوگوهای کارفرما و اعمال استاندارد فرمت شماره تلفن ایران در تمام فرم‌ها',
      'اصلاح متن تنظیمات کلیدهای میانبر و افزودن شماره‌گذاری خودکار صفحات چاپی به‌صورت «صفحه: # از #»',
      'ارتقای بخش مواد شیمیایی داشبورد و جدول جزئیات: نمایش فقط اقلام دارای موجودی با تفکیک رنگی منقضی‌شده و در شرف انقضا، نوار هشدار فشرده و قابل بستن، تغییر نام «موجودی کارفرما» و دکمه‌های فیلتر سریع موجودی کارفرما و پیمانکار',
      'ادغام مدیریت فرم‌های عملیاتی و آپلودی در یک تب واحد با تشخیص هوشمند فرمول‌ها، انتخاب چندمنبعی داده‌ها، تشخیص بخش مقصد فرم و اصلاح کامل پیش‌نمایش چاپ عمودی و افقی',
      'ارتقای بازیابی فایل: استخراج چندمقداره و چندستونه اسناد عملیاتی و تشخیص هوشمند تغییرات هنگام بارگذاری مجدد فایل',
    ],
    changesEn: [
      'Eliminated freeze and lag across all 9 Warehouse Operations views and the Employers & Corporate Forms Studio via compact queries, model caching, and deferred rendering',
      'Fixed multi-select logo upload in Client Gallery and enforced Iranian phone number formatting across all phone inputs',
      'Cleaned up Keyboard Shortcuts settings copy and added automatic print page numbering (Page: # of #)',
      'Upgraded Chemical Expiration alerts in Dashboard and Detailed view: in-stock only, distinct expired vs. near-expiry colors, compact dismissible alert bar, Employer Stock rename, and quick stock filter buttons',
      'Unified Built-in & Uploaded Corporate Forms studio tab with formula detection, multi-source data binding, target operational section confirmation, and crisp Portrait/Landscape A4 preview',
      'Upgraded Backup & Restore import with multi-value & multi-column operational document extraction and Smart Re-Upload Delta Sync',
    ],
  },
  {
    version: '2.6.0',
    buildId: '2026.05.21-1',
    releasedAt: '2026-05-21',
    titleFa: 'اصلاح دستیار هوشمند، بازآرایی گروه‌بندی‌شده ستون‌های جزئیات تجهیزات و استخراج خودکار تاریخ مواد شیمیایی',
    titleEn: 'AI Assistant Fix, Grouped Detailed Table Columns & Chemical Date Auto-Extraction',
    changesFa: [
      'رفع خطای دستیار هوشمند در گزارش خلاصه پکینگ‌ها، محموله‌های در راه و وزن خالص و ناخالص',
      'بازآرایی کامل، نام‌گذاری فارسی شفاف و گروه‌بندی رنگی دوطبقه ستون‌های جدول ثبت جزئیات تجهیزات همراه با افزودن «تأمین مجدد جایگزین شده»، «تحویل گیرنده حواله» و «تحویل آورنده»',
      'اصلاح کامل فیلتر ستون «دسته‌بندی تخصصی قلم» جهت نمایش کاملاً یکدست فارسی در حالت فارسی و انگلیسی در حالت انگلیسی',
      'افزودن انتخاب صریح انبار مقصد برگشت متریال و فیلد «نام تحویل آورنده» در فرم ارجاع و ثبت خودکار «تحویل گیرنده» از حواله',
      'استخراج خودکار تاریخ تولید و تاریخ انقضای مواد شیمیایی به تقویم شمسی و میلادی از متن و توضیحات هنگام ورود فایل‌ها',
      'بازطراحی کامل ورود فایل در پشتیبان‌گیری به ویزارد ۳ مرحله‌ای با انتخاب دستی شیت‌ها و تشخیص چندبخش هم‌زمان درون یک شیت',
      'به‌روزرسانی فوری فهرست تغییرات در اعلان بروزرسانی برنامه همزمان با شناسایی نسخه جدید',
    ],
    changesEn: [
      'Fixed Smart AI Assistant summary, weight, packing, and transit queries with direct server-side routing',
      'Reorganized, renamed, and color-grouped Detailed Equipment table columns into clean 2-tier semantic headers',
      'Fixed Item Classification column filter to render strictly Persian labels in Persian mode and English labels in English mode',
      'Added explicit target warehouse selection and Returned By field in SMR, plus automatic Receiver sync from MIV',
      'Automatic extraction of Jalali and Gregorian chemical production & expiration dates during file import',
      'Redesigned Backup & Restore file import into a 3-step guided wizard supporting explicit sheet selection and multi-section detection',
      'Immediate remote changelog sync when Service Worker detects a new app release',
    ],
  },
  {
    version: '2.5.1',
    buildId: '2026.05.20-2',
    releasedAt: '2026-05-20',
    titleFa: 'بازطراحی کامل ظاهر مدرن، خلوت و کاربرپسند برنامه',
    titleEn: 'Modern Scandinavian-Industrial Visual Redesign',
    changesFa: [
      'بازطراحی کامل پالت رنگی روشن و تیره با کنتراست خوانا، سطوح مسطح مدرن و تفکیک بصری دقیق',
      'نوار شاخص‌های کلیدی یکپارچه در داشبورد با خطوط جداکننده ظریف و سلسله‌مراتب تایپوگرافی شفاف',
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
      'افزودن قابلیت اختصاص تصویر برای هر قلم در بخش ثبت جزئیات تجهیزات با پشتیبانی از کشیدن و رها کردن و پیش‌نمایش تمام‌صفحه',
      'افزودن سیستم اطلاع‌رسانی هوشمند بروزرسانی برنامه با نمایش فهرست تغییرات و انتخاب «بروزرسانی همین الان» یا «بعداً» بدون ایجاد مزاحمت هنگام کار',
      'تشخیص خودکار تغییرات چه در حین باز بودن برنامه و چه پس از بستن و باز کردن مجدد نرم‌افزار',
    ],
    changesEn: [
      'Added equipment photo attachment for Detailed items with Drag & Drop upload and full-screen lightbox preview',
      'Added non-intrusive app update notification with release notes and Update Now / Later choices',
      'Automatic update detection both while the app is open and upon closing and reopening',
    ],
  },
  {
    version: '2.4.0',
    buildId: '2026.05.12-1',
    releasedAt: '2026-05-12',
    titleFa: 'بازگردانی سراسری عملیات، صفحه‌بندی یکپارچه و بهینه‌سازی چاپ',
    titleEn: 'Universal Undo/Redo, Unified Pagination & Print Header Repetition',
    changesFa: [
      'پشتیبانی سراسری از دکمه‌های بازگردانی و انجام مجدد در تمام بخش‌های نرم‌افزار',
      'افزودن کنترل انتخاب تعداد ردیف در صفحه و دکمه «انتخاب صفحه» به تمام جداول برنامه',
      'تکرار خودکار تیتر ستون‌ها در بالای تمامی صفحات خروجی چاپگر',
      'بهبود نمایش دسته‌بندی تخصصی اقلام و بهینه‌سازی قوانین بازیابی سطل بازیافت',
    ],
    changesEn: [
      'Universal Undo/Redo (Ctrl+Z / Ctrl+Y) support across every section of the application',
      'Added rows-per-page selector and Select Page control across all data tables',
      'Automatic repeating table headers across all printed pages',
      'Strict language-matched specialized category labels and unified duplicate validation on Recycle Bin restore',
    ],
  },
  {
    version: '2.3.0',
    buildId: '2026.05.05-1',
    releasedAt: '2026-05-05',
    titleFa: 'مدیریت کارفرمایان، استودیوی فرم‌های شرکتی و برچسب انبارش کالا',
    titleEn: 'Employers Management, Corporate Forms Studio & Warehouse Storage Labels',
    changesFa: [
      'افزودن بخش «کارفرمایان و فرم‌های شرکتی» با قابلیت تعریف پروفایل کارفرما، گالری لوگوها و طراحی و آپلود قالب فرم‌های رسمی',
      'افزودن بخش «برچسب انبارش کالا» با تولید خودکار بارکد و کد دوبعدی، چاپ دسته‌ای و نمایش مشخصات پکینگ و محل نگهداری',
      'پشتیبانی از حالت محافظت چشم و فیلتر نور آبی در کنار حالت روشن و تیره',
    ],
    changesEn: [
      'Added Employers & Corporate Forms Studio with employer profiles, logo galleries, and custom form templates',
      'Added Warehouse Storage Labels with QR/barcode generation, batch printing, and location metadata',
      'Added Eye-Care warm filter alongside Light and Dark themes',
    ],
  },
  {
    version: '2.2.0',
    buildId: '2026.04.26-1',
    releasedAt: '2026-04-26',
    titleFa: 'مدیریت چندپروژه‌ای، کلیدهای میانبر و تصحیح املای هوشمند',
    titleEn: 'Multi-Project Workspace, Customizable Shortcuts & Bilingual Spellcheck',
    changesFa: [
      'افزودن مدیریت چندپروژه‌ای با پایگاه داده مستقل برای هر پروژه، جابه‌جایی سریع میان پروژه‌ها و تخصیص کارفرما',
      'افزودن سامانه کلیدهای میانبر قابل شخصی‌سازی برای ناوبری، جستجو، ثبت ردیف و عملیات سریع جداول',
      'افزودن بررسی و تصحیح هوشمند املای فارسی و انگلیسی با فرهنگ لغت تخصصی تجهیزات نیروگاهی',
    ],
    changesEn: [
      'Added multi-project workspace management with isolated databases, quick project switching, and employer binding',
      'Added customizable keyboard shortcuts for navigation, search, record entry, and table workflows',
      'Added smart Persian & English spellcheck with power-plant technical dictionary support',
    ],
  },
  {
    version: '2.1.0',
    buildId: '2026.04.18-1',
    releasedAt: '2026-04-18',
    titleFa: 'دستیار و تحلیل‌گر هوشمند انبار و جستجوی سراسری بین‌جدولی',
    titleEn: 'Smart Warehouse AI Assistant & Cross-Table Global Search',
    changesFa: [
      'افزودن دستیار و تحلیل‌گر هوشمند انبار برای پاسخ به پرسش‌های عملیاتی، تحلیل ریسک، گزارش موجودی سایزها و پرسش‌های سریع',
      'افزودن جستجوی سراسری در تمام جداول ثبت کلی، جزئیات، تجهیزات در راه و اسناد عملیاتی',
      'پشتیبانی از شناسایی هوشمند سایز و معادل‌سازی واحدهای فنی مانند اینچ و قطر اسمی در جستجو',
    ],
    changesEn: [
      'Introduced Smart Warehouse Assistant for operational Q&A, risk analysis, size/item lookup, and quick prompts',
      'Added global cross-table search across General, Detailed, In-Transit, and operational documents',
      'Added bilingual technical size equivalence (inches / DN) during warehouse item search',
    ],
  },
  {
    version: '2.0.0',
    buildId: '2026.04.10-1',
    releasedAt: '2026-04-10',
    titleFa: 'مجموعه جامع عملیات انبار، برآورد تجهیزات و انبارگردانی ادواری',
    titleEn: 'Complete 9-Module Warehouse Operations, MTO Estimates & Periodic Stocktake',
    changesFa: [
      'راه‌اندازی کامل ۹ بخش عملیات انبار شامل صورتجلسه ورود به کارگاه، دعوتنامه و صورتجلسه گشایش و بازرسی بسته‌ها، گزارش کسری و مغایرت، رسید مصرف مستقیم، حواله انبار، فرم ارجاع کالا، جایگزینی تجهیزات و گزارش موازنه و کنترل مصرف مواد',
      'اتصال خودکار و لحظه‌ای تمام اسناد عملیاتی به موجودی کارفرما و پیمانکار در جدول ثبت جزئیات تجهیزات',
      'افزودن بخش‌های برآورد تجهیزات، انبارگردانی و بازدید ادواری انبار با خروجی چاپی رسمی',
    ],
    changesEn: [
      'Launched all 9 Warehouse Operations modules: Site Entry, OPI Invitations & Minutes, OSDR/MER, GCV, MIV, SMR, Substitutions, and Material Balance',
      'Automatic real-time cross-linking between operational documents and Employer/Contractor stock in Detailed inventory',
      'Added Material Estimation (MTO), Stocktake, and Periodic Warehouse Inspection modules with print-ready reports',
    ],
  },
  {
    version: '1.5.0',
    buildId: '2026.03.24-1',
    releasedAt: '2026-03-24',
    titleFa: 'ردیابی محموله‌های در راه، سطل بازیافت امن و پشتیبان‌گیری و بازیابی',
    titleEn: 'In-Transit Tracking, Safe Recycle Bin & Backup / Restore Engine',
    changesFa: [
      'افزودن بخش «ثبت تجهیزات در راه» با تغییر وضعیت خودکار به «رسیده» پس از ثبت محموله در انبار',
      'افزودن سطل بازیافت با قابلیت بازیابی امن ردیف‌های حذف‌شده و جلوگیری از ثبت تکراری',
      'افزودن بخش پشتیبان‌گیری و بازیابی کامل با پشتیبانی از فایل‌های جدولی و اسنپ‌شات محلی',
    ],
    changesEn: [
      'Added In-Transit Equipment tracking with automatic arrival status synchronization once received on site',
      'Added Recycle Bin with safe restore and duplicate protection',
      'Added Backup & Restore center with spreadsheet import and local offline snapshots',
    ],
  },
  {
    version: '1.2.0',
    buildId: '2026.03.10-1',
    releasedAt: '2026-03-10',
    titleFa: 'داشبورد تحلیلی جامع، دسته‌بندی‌ها، تقویم شمسی و مدیریت کاربران',
    titleEn: 'Analytical Dashboard, Categories, Jalali/Gregorian Calendar & User Audit Logs',
    changesFa: [
      'افزودن داشبورد تحلیلی با نمودارهای تفکیک جزایر، تأمین‌کنندگان، آمار کسری و آسیب‌دیدگی و پایش مواد شیمیایی',
      'افزودن بخش مدیریت دسته‌بندی‌ها برای استانداردسازی جزیره، سیستم، واحد، محل نگهداری و واحد شمارش',
      'افزودن پشتیبانی کامل دوزبانه فارسی و انگلیسی و جابه‌جایی تقویم شمسی و میلادی در سراسر سامانه',
      'افزودن مدیریت کاربران، سطوح دسترسی و ثبت تاریخچه وقایع و تغییرات',
    ],
    changesEn: [
      'Added Analytical Dashboard with island/supplier breakdowns, shortage/damage metrics, and chemical monitoring',
      'Added Categories manager for islands, systems, units, storage locations, and counting units',
      'Added full bilingual Persian/English UI and Jalali/Gregorian calendar switching',
      'Added role-based user accounts and full activity audit logging',
    ],
  },
  {
    version: '1.0.0',
    buildId: '2026.02.25-1',
    releasedAt: '2026-02-25',
    titleFa: 'انتشار اولیه سامانه جامع مدیریت انبارهای نیروگاهی سمان',
    titleEn: 'Initial Release of SAMAAN Power Plant Warehouse Management System',
    changesFa: [
      'راه‌اندازی هسته اصلی سامانه شامل «ثبت کلی تجهیزات» و «ثبت جزئیات تجهیزات» با فیلترهای ستونی و مرتب‌سازی پیشرفته',
      'محاسبه خودکار کسری، موجودی انبار کارفرما، موجودی انبار پیمانکار و جمع موجودی سایت بر اساس فرمول‌های انبارداری نیروگاهی',
      'ارتباط هوشمند میان پکینگ لیست‌های ثبت کلی و اقلام ثبت جزئیات همراه با خروجی چاپی و جدولی',
      'پشتیبانی از ذخیره‌سازی محلی و اجرای وب‌اپلیکیشن پیش‌رونده برای استفاده در محیط کارگاهی',
    ],
    changesEn: [
      'Launched core General Manifest and Detailed Equipment Inventory tables with column filtering and sorting',
      'Automated power-plant stock formulas for shortages, Employer stock, Contractor stock, and total site stock',
      'Automatic linking between General packing lists and Detailed equipment rows with print and export outputs',
      'Added local offline persistence and Progressive Web App support for field operations',
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

/**
 * Merges remote and local changelogs without losing historical releases down to v1.0.0.
 * Remote entries take precedence for matching version/buildId so fresh release notes always win.
 */
export function mergeChangelogs(
  remoteChangelog: AppReleaseNote[] | null | undefined,
  localChangelog: AppReleaseNote[] = APP_CHANGELOG,
): AppReleaseNote[] {
  const merged: AppReleaseNote[] = [];
  const seenKeys = new Set<string>();
  const addUnique = (items: AppReleaseNote[] | null | undefined) => {
    if (!Array.isArray(items)) return;
    for (const rel of items) {
      if (!rel || !rel.version) continue;
      const key = `${rel.version}|${rel.buildId || ''}`;
      const verKey = `ver:${rel.version}`;
      if (seenKeys.has(key) || seenKeys.has(verKey)) continue;
      seenKeys.add(key);
      seenKeys.add(verKey);
      merged.push(rel);
    }
  };
  addUnique(remoteChangelog);
  addUnique(localChangelog);
  return merged;
}

export function filterAndSortChangelog(
  changelog: AppReleaseNote[],
  options: {
    query?: string;
    versionFilter?: string;
    sortOrder?: 'newest' | 'oldest';
  } = {},
): AppReleaseNote[] {
  const { query = '', versionFilter = 'all', sortOrder = 'newest' } = options;
  const q = query.trim().toLowerCase();

  let list = changelog.filter((rel) => {
    if (versionFilter && versionFilter !== 'all' && rel.version !== versionFilter) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      rel.version,
      rel.releasedAt,
      rel.titleFa,
      rel.titleEn,
      ...(rel.changesFa || []),
      ...(rel.changesEn || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  if (sortOrder === 'oldest') {
    list = [...list].reverse();
  }
  return list;
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
        ? mergeChangelogs(remote.changelog, localChangelog)
        : remote?.latestRelease
          ? mergeChangelogs([remote.latestRelease], localChangelog)
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
