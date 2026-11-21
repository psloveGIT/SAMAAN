import { inferGeneralDescription } from './generalDescription.ts';
import { formatDisplayNumber, normalizeDigits } from './jalali.ts';
import { formatCountingUnit, inferItemClassification, normalizeCountingUnitToFa } from './normalizers.ts';
import type { Language } from './types.ts';
import {
  aggregateWarehouseByField,
  formatDetailedItemsMarkdownTable,
  getPackingListDetails,
  getWarehouseOverview,
  normKey,
  normalizeSearchText,
  parseSearchTerms,
  queryOperationalAlerts,
  searchWarehouseDocuments,
  searchWarehouseItems,
  type WarehouseOverviewMetrics,
  type WarehouseQueryDb,
} from './warehouseQueryTools.ts';

export type LocalWarehouseDbSlice = WarehouseQueryDb;

export interface LocalWarehouseAiMetrics {
  generalRows: number;
  detailedRows: number;
  transitRows: number;
  uniquePackings: number;
  grossWeightTons: number;
  netWeightTons: number;
  shortageItemsCount: number;
  shortageQtySum: number;
  damagedItemsCount: number;
  openMerCount: number;
  openRepCount: number;
  opiPendingCount: number;
  expiringChemicalsCount: number;
  transitArrivedPackingsCount: number;
  transitShippingPackingsCount: number;
  transitInspectionPackingsCount: number;
}

export interface LocalWarehouseAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  priorityActions: string[];
  followUpSuggestions: string[];
}

export interface LocalItemClassification {
  generalDescription: string;
  itemCategory: '' | 'special_tools' | 'chemicals' | 'spare_parts';
  chemicalType: string;
  countingUnit: string;
  notes: string;
}

function toCompactMetrics(ov: WarehouseOverviewMetrics): LocalWarehouseAiMetrics {
  return {
    generalRows: ov.generalRows,
    detailedRows: ov.detailedRows,
    transitRows: ov.transitRows,
    uniquePackings: ov.uniquePackings,
    grossWeightTons: ov.grossWeightTons,
    netWeightTons: ov.netWeightTons,
    shortageItemsCount: ov.shortageItemsCount,
    shortageQtySum: ov.shortageQtySum,
    damagedItemsCount: ov.damagedItemsCount,
    openMerCount: ov.openMerCount,
    openRepCount: ov.openRepCount,
    opiPendingCount: ov.opiPendingCount,
    expiringChemicalsCount: ov.expiringChemicalsCount,
    transitArrivedPackingsCount: ov.transitArrivedPackingsCount,
    transitShippingPackingsCount: ov.transitShippingPackingsCount,
    transitInspectionPackingsCount: ov.transitInspectionPackingsCount,
  };
}

// Conversational / generic warehouse framing words stripped when extracting an item/entity subject
const SUBJECT_STOP_PHRASES_FA = [
  'موجودی انبار اصلی',
  'موجودی انبار پیمانکار',
  'موجودی انبار',
  'انبار اصلی',
  'انبار پیمانکار',
  'انبار مپنا',
  'محل نگهداری',
  'در کدام انبار',
  'کدام انبار',
  'کدوم انبار',
  'در کدام سوله',
  'کدام سوله',
  'نگهداری میشود',
  'نگهداری می شود',
  'نگهداری شده',
  'بر اساس جزیره',
  'بر اساس تامین کننده',
  'بر اساس سیستم',
  'بر اساس محل نگهداری',
  'تفکیک موجودی',
  'تعداد اقلام',
  'چقدر است',
  'چند تا',
  'چند عدد',
  'چند متر',
  'چند شاخه',
  'چند ست',
  'چند کیلو',
  'چند لیتر',
  'آیا داریم',
  'داریم یا نه',
  'نشان بده',
  'گزارش بده',
  'خلاصه کن',
  'لیست کن',
  'پیدا کن',
  'جستجو کن',
  'بررسی کن',
  'بهم بگو',
  'به من بگو',
  'مورد نظر',
  'در دست ارسال',
  'در دست بازرسی',
  'در آستانه انقضا',
  'زیر 30 روز',
  'زیر یک ماه',
  'آسیب دیده',
  'اسیب دیده',
  'آسیب دیدگی',
  'پکینگ لیست',
  'پکینگ لیست ها',
  'پکینگ ها',
  'پکینگها',
  'ردیف های ثبتی',
  'ردیفهای ثبتی',
  'ردیف های',
  'ردیفهای',
  'محموله های در راه',
  'محمولههای در راه',
  'محموله های',
  'محمولههای',
  'تامین کننده',
  'تامین کنندگان',
  'وزن خالص ناخالص',
  'وزن ناخالص',
  'وزن خالص',
  'خالص ناخالص',
  'کل انبار',
  'کرایه حمل',
  'مواد شیمیایی',
  'ابزار مخصوص',
  'لوازم یدکی',
  'تاریخ انقضا',
  'در راه',
  'مقدار واقعی',
  'مقدار پکینگ',
];

const SUBJECT_STOP_WORDS = new Set([
  // Persian conversational & generic domain words
  'موجودی', 'موجود', 'وضعیت', 'خلاصه', 'گزارش', 'چگونه', 'چطور', 'کدام', 'کدوم', 'چیست', 'چیه',
  'کیست', 'کیه', 'است', 'هست', 'هستند', 'باشد', 'دارد', 'دارند', 'داریم', 'دارید', 'ندارد', 'نداریم',
  'اقلام', 'قلم', 'کالا', 'کالاها', 'تجهیزات', 'انبار', 'سایت', 'پروژه', 'سامانه', 'برنامه',
  'بگو', 'بده', 'نشان', 'نشون', 'لیست', 'فهرست', 'تعداد', 'مقدار', 'جمع', 'مجموع', 'کل', 'همه',
  'چند', 'چقدر', 'چه', 'چرا', 'آیا', 'ایا', 'کجا', 'کجاست', 'کجاهست', 'کدامند', 'کدامها',
  'در', 'از', 'به', 'با', 'برای', 'روی', 'بر', 'تا', 'و', 'یا', 'را', 'رو', 'که', 'این', 'آن', 'ان',
  'یک', 'یه', 'ها', 'های', 'دارای', 'بدون', 'فقط', 'هم', 'الان', 'فعلی', 'فعلا', 'لطفا', 'میشه', 'میتونی',
  'بیشترین', 'کمترین', 'بهترین', 'مهمترین', 'فعال', 'باز', 'بسته', 'یکتا', 'جدید', 'اخیر',
  'جزیره', 'جزایر', 'سیستم', 'واحد', 'سوله', 'محل', 'نگهداری', 'انبارها',
  'مپنا', 'پیمانکار', 'کارفرما', 'پکینگ', 'پکینگها', 'پکینگهای', 'محموله', 'محمولهها', 'محمولههای',
  'نگله', 'نگلهها', 'نگلههای', 'آیتم', 'آیتمها', 'آیتمهای', 'ردیف', 'ردیفها', 'ردیفهای',
  'ثبت', 'ثبتی', 'ثبتشده', 'خالص', 'ناخالص', 'کلی', 'جزئیات', 'جزئی', 'آمار', 'امار', 'اطلاعات', 'تحلیل', 'بررسی',
  'کسری', 'مغایرت', 'مغایرتها', 'خراب', 'آسیب', 'جایگزین', 'جایگزینی', 'بازرسی', 'گشایش', 'ارسال', 'رسیده',
  'وزن', 'تن', 'کرایه', 'حمل', 'ترانزیت', 'انقضا', 'انقضاء', 'منقضی', 'روز', 'ماه', 'سال', 'لازم', 'مورد', 'موارد',
  'اسناد', 'سند', 'رسید', 'حواله', 'صورتجلسه', 'دعوتنامه', 'برآورد', 'تفکیک', 'اولویت', 'اولویتها', 'اقدام', 'اقدامات',
  'پیشنهادی', 'پیشنهاد', 'عملیاتی', 'انبارگردانی', 'موازنه', 'بالانس',
  // English conversational & generic domain words
  'what', 'which', 'where', 'who', 'when', 'how', 'much', 'many', 'is', 'are', 'was', 'were', 'be',
  'do', 'does', 'did', 'we', 'have', 'has', 'had', 'there', 'any', 'some', 'all', 'total', 'sum',
  'count', 'number', 'qty', 'quantity', 'stock', 'inventory', 'available', 'left', 'remaining',
  'show', 'list', 'give', 'tell', 'find', 'search', 'check', 'get', 'summary', 'report', 'status',
  'overview', 'breakdown', 'detail', 'details', 'detailed', 'general', 'info', 'information', 'please', 'me', 'us', 'the',
  'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'about', 'and', 'or', 'vs',
  'item', 'items', 'equipment', 'material', 'materials', 'warehouse', 'main', 'contractor', 'mapna',
  'location', 'storage', 'island', 'islands', 'supplier', 'suppliers', 'vendor', 'packing', 'packings',
  'shipment', 'shipments', 'package', 'packages', 'row', 'rows', 'recorded', 'registered', 'shortage', 'shortages', 'damaged', 'damage',
  'discrepancy', 'discrepancies', 'open', 'pending', 'active', 'expiring', 'expired', 'days', 'within',
  'transit', 'shipping', 'inspection', 'arrived', 'weight', 'gross', 'net', 'ton', 'tons', 'tonnage',
  'freight', 'cost', 'priority', 'priorities', 'actions', 'recommended', 'document', 'documents', 'provide', 'summarize',
]);

/**
 * Extracts a specific item/equipment/entity subject from a natural-language question.
 * Examples:
 *  - `موجودی Pipe 8"` -> `pipe 8"`
 *  - `موجودی Pipe 8" چقدر است و در کدام انبار نگهداری می‌شود؟` -> `pipe 8"`
 *  - `چند متر لوله ۸ اینچ داریم؟` -> `لوله 8 اینچ`
 *  - `تفکیک موجودی بر اساس جزیره چگونه است؟` -> ``
 *  - `خلاصه تعداد پکینگ‌ها، ردیف‌های ثبتی، محموله‌های در راه و وزن خالص/ناخالص کل انبار را گزارش بده.` -> ``
 */
export function extractEntitySubjectFromQuestion(prompt: string): string {
  let text = normalizeSearchText(prompt);
  if (!text) return '';

  // Remove polite / question punctuation while preserving inches `"` and technical numeric symbols (`1/2"`, `2.5`)
  text = text.replace(/[؟?!،,;؛()[\]{}:«»]/g, ' ');
  // Normalize slashes between letters (e.g. "خالص/ناخالص", "net/gross") into spaces while keeping fractions like "1/2"
  text = text.replace(/(?<=[a-z\u0600-\u06ff])\/(?=[a-z\u0600-\u06ff])/gi, ' ');
  // Strip sentence-ending or isolated dots without breaking decimal numbers like 2.5 or codes like A.100
  text = text.replace(/(?<!\d)\.(?!\d)/g, ' ');

  // Remove multi-word framing phrases first (longest first)
  const sortedPhrases = [...SUBJECT_STOP_PHRASES_FA].sort((a, b) => b.length - a.length);
  for (const phrase of sortedPhrases) {
    const normPhrase = normalizeSearchText(phrase);
    if (normPhrase) {
      text = text.split(normPhrase).join(' ');
    }
  }

  // Keep inch expressions intact before splitting words
  const preservedSizes: string[] = [];
  text = text.replace(
    /(?:^|(?<=[\s,/-]))(\d+(?:[./-]\d+)?\s*(?:"|inch(?:es)?\b|in\b|اینچی?)|dn\s*\d+|\d+(?:\.\d+)?\s*(?:mm2?|cm|kv|kw|mw|bar|psi))(?=$|[\s),.;:؟?!/-])/gi,
    (match) => {
      const idx = preservedSizes.length;
      preservedSizes.push(match.trim());
      return ` __SIZE_${idx}__ `;
    },
  );

  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const tok of tokens) {
    const sizeMatch = /^__size_(\d+)__$/i.exec(tok);
    if (sizeMatch) {
      kept.push(preservedSizes[Number(sizeMatch[1])]);
      continue;
    }
    const clean = tok.replace(/^["'`./\\-]+|["'`./\\-]+$/g, '');
    if (!clean) continue;
    if (SUBJECT_STOP_WORDS.has(clean)) continue;
    // Strip Persian plural suffixes ("ها"/"های") and check stopword base too
    const singularBase = clean.replace(/(?:های|ها)$/, '');
    if (singularBase && singularBase !== clean && SUBJECT_STOP_WORDS.has(singularBase)) continue;
    // Ignore isolated "mer" / "rep" / "opi" / "gcv" / "miv" / "smr" / "osdr" when there's no code attached
    if (/^(mer|rep|opi|gcv|miv|smr|osdr)$/i.test(clean)) continue;
    // Ignore bare numbers like "30" from "زیر 30 روز"
    if (/^\d+$/.test(clean) && !preservedSizes.length) continue;
    kept.push(clean);
  }

  return kept.join(' ').trim();
}

function extractExplicitPackingNo(prompt: string): string | null {
  const norm = normalizeSearchText(prompt);
  const m =
    /(?:پکینگ(?:\s*لیست)?|محموله|packing(?:\s*list)?|shipment|pl)\s*(?:شماره|no\.?|#|:)?\s*([a-z0-9][a-z0-9._/-]{2,})/i.exec(
      norm,
    );
  if (m && m[1] && !SUBJECT_STOP_WORDS.has(m[1])) {
    return m[1].trim();
  }
  return null;
}

export function runLocalWarehouseAnalysis(
  db: LocalWarehouseDbSlice,
  lang: Language = 'fa',
): { analysis: LocalWarehouseAnalysis; metrics: LocalWarehouseAiMetrics } {
  const ov = getWarehouseOverview(db);
  const m = toCompactMetrics(ov);
  const isFa = lang !== 'en';
  const f = (n: number) => formatDisplayNumber(n, lang);

  const riskScore =
    (m.expiringChemicalsCount > 0 ? 3 : 0) +
    (m.shortageItemsCount >= 10 ? 2 : m.shortageItemsCount > 0 ? 1 : 0) +
    (m.damagedItemsCount >= 5 ? 2 : m.damagedItemsCount > 0 ? 1 : 0) +
    (m.openMerCount + m.openRepCount >= 10 ? 2 : m.openMerCount + m.openRepCount > 0 ? 1 : 0);

  const riskLevel: 'low' | 'medium' | 'high' =
    riskScore >= 5 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

  const summary = isFa
    ? `در انبار فعلی ${f(m.uniquePackings)} پکینگ لیست یکتا (${f(m.generalRows)} ردیف کلی و ${f(m.detailedRows)} ردیف جزئیات) با مجموع وزن خالص ${f(m.netWeightTons)} تن و وزن ناخالص ${f(m.grossWeightTons)} تن ثبت شده است. در حال حاضر ${f(m.shortageItemsCount)} قلم دارای کسری، ${f(m.damagedItemsCount)} قلم آسیب‌دیده، ${f(m.openMerCount)} مورد MER باز، ${f(m.openRepCount)} مورد REP باز و ${f(m.expiringChemicalsCount)} ماده شیمیایی با انقضای زیر ۳۰ روز فعال است.`
    : `Current warehouse inventory tracks ${f(m.uniquePackings)} unique packing lists (${f(m.generalRows)} general rows and ${f(m.detailedRows)} detailed rows) totaling ${f(m.netWeightTons)} t net / ${f(m.grossWeightTons)} t gross. Active alerts: ${f(m.shortageItemsCount)} shortage items, ${f(m.damagedItemsCount)} damaged items, ${f(m.openMerCount)} open MER, ${f(m.openRepCount)} open REP, and ${f(m.expiringChemicalsCount)} chemicals expiring within 30 days.`;

  const priorityActions: string[] = [];
  if (m.expiringChemicalsCount > 0) {
    priorityActions.push(
      isFa
        ? `رسیدگی فوری به ${f(m.expiringChemicalsCount)} ماده شیمیایی در آستانه انقضا (زیر ۳۰ روز) و هماهنگی مصرف یا تمدید تاریخ انقضا.`
        : `Prioritize ${f(m.expiringChemicalsCount)} chemical item(s) expiring within 30 days for immediate issuance or shelf-life review.`,
    );
  }
  if (m.shortageItemsCount > 0) {
    priorityActions.push(
      isFa
        ? `پیگیری جبران کسری برای ${f(m.shortageItemsCount)} قلم (مجموع کسری: ${f(m.shortageQtySum)}) از طریق تأمین‌کنندگان و ثبت محموله تکمیلی.`
        : `Follow up on ${f(m.shortageItemsCount)} shortage item(s) (total shortage qty: ${f(m.shortageQtySum)}) with suppliers and record backfill deliveries.`,
    );
  }
  if (m.openMerCount > 0 || m.openRepCount > 0) {
    priorityActions.push(
      isFa
        ? `بستن پرونده‌های باز مغایرت و جایگزینی (${f(m.openMerCount)} MER باز و ${f(m.openRepCount)} REP باز) پیش از نیاز نصب.`
        : `Resolve open discrepancy/replacement cases (${f(m.openMerCount)} open MER, ${f(m.openRepCount)} open REP) ahead of erection schedule.`,
    );
  }
  if (m.opiPendingCount > 0) {
    priorityActions.push(
      isFa
        ? `برنامه‌ریزی گشایش و بازرسی (OPI) برای ${f(m.opiPendingCount)} قلم در انتظار بازرسی جهت به‌روزرسانی موجودی واقعی.`
        : `Schedule OPI inspection for ${f(m.opiPendingCount)} pending item(s) to confirm actual warehouse quantities.`,
    );
  }
  if (m.transitShippingPackingsCount > 0 || m.transitInspectionPackingsCount > 0) {
    priorityActions.push(
      isFa
        ? `پایش ${f(m.transitShippingPackingsCount)} پکینگ در دست ارسال و ${f(m.transitInspectionPackingsCount)} پکینگ در دست بازرسی برای آماده‌سازی تخلیه.`
        : `Monitor ${f(m.transitShippingPackingsCount)} shipping and ${f(m.transitInspectionPackingsCount)} under-inspection packing lists for site offloading readiness.`,
    );
  }
  if (priorityActions.length === 0) {
    priorityActions.push(
      isFa
        ? 'وضعیت عملیاتی انبار پایدار است و هیچ ریسک بحرانی فعال (کسری، آسیب‌دیدگی یا انقضای نزدیک) ثبت نشده است.'
        : 'Warehouse operations are healthy with no active critical shortages, damages, or imminent expirations.',
    );
  }

  const followUpSuggestions = isFa
    ? [
        'لیست اقلام دارای کسری و آسیب‌دیدگی کدام‌ها هستند؟',
        'تفکیک موجودی و اقلام بر اساس جزیره چگونه است؟',
        'خلاصه محموله‌های در راه و وزن کل انبار را نشان بده.',
      ]
    : [
        'List the top active shortage and damaged items.',
        'Show item breakdown and stock counts by island.',
        'Summarize in-transit packing lists and total tonnage.',
      ];

  return {
    analysis: {
      summary,
      riskLevel,
      priorityActions,
      followUpSuggestions,
    },
    metrics: m,
  };
}

export function answerLocalWarehouseQuestion(
  db: LocalWarehouseDbSlice,
  prompt: string,
  lang: Language = 'fa',
): { answer: string; metrics: LocalWarehouseAiMetrics } {
  const ov = getWarehouseOverview(db);
  const m = toCompactMetrics(ov);
  const isFa = lang !== 'en';
  const f = (n: number) => formatDisplayNumber(n, lang);
  const q = normalizeSearchText(prompt);

  // 1) Explicit packing list lookup (e.g. "پکینگ PL-100 چه وضعیتی دارد؟")
  const explicitPacking = extractExplicitPackingNo(prompt);
  if (explicitPacking) {
    const pl = getPackingListDetails(db, explicitPacking, lang);
    if (pl.found) {
      const lines: string[] = [];
      lines.push(
        isFa
          ? `### گزارش پکینگ لیست «${pl.matchedPackings.join('، ') || explicitPacking}»`
          : `### Packing List Report: "${pl.matchedPackings.join(', ') || explicitPacking}"`,
      );
      lines.push(
        isFa
          ? `- **تعداد نگله (ثبت کلی):** ${f(pl.generalCount)} | **ردیف جزئیات:** ${f(pl.detailedCount)} | **ردیف در راه:** ${f(pl.transitCount)}`
          : `- **General Packages:** ${f(pl.generalCount)} | **Detailed Rows:** ${f(pl.detailedCount)} | **Transit Rows:** ${f(pl.transitCount)}`,
      );
      if (pl.generalCount > 0) {
        lines.push(
          isFa
            ? `- **وزن خالص:** ${f(pl.netWeightTons)} تن | **وزن ناخالص:** ${f(pl.grossWeightTons)} تن`
            : `- **Net Weight:** ${f(pl.netWeightTons)} t | **Gross Weight:** ${f(pl.grossWeightTons)} t`,
        );
      }
      if (pl.suppliers.length > 0 || pl.islands.length > 0) {
        lines.push(
          isFa
            ? `- **تأمین‌کننده:** ${pl.suppliers.join('، ') || '-'} | **جزیره:** ${pl.islands.join('، ') || '-'}`
            : `- **Supplier:** ${pl.suppliers.join(', ') || '-'} | **Island:** ${pl.islands.join(', ') || '-'}`,
        );
      }
      if (pl.storageLocations.length > 0) {
        lines.push(
          isFa
            ? `- **محل‌های نگهداری:** ${pl.storageLocations.join('، ')}`
            : `- **Storage Locations:** ${pl.storageLocations.join(', ')}`,
        );
      }
      lines.push(
        isFa
          ? `- **کسری:** ${f(pl.shortageItemsCount)} ردیف | **آسیب‌دیده:** ${f(pl.damagedItemsCount)} ردیف | **MER باز:** ${f(pl.openMerCount)} | **REP باز:** ${f(pl.openRepCount)} | **در انتظار OPI:** ${f(pl.opiPendingCount)}`
          : `- **Shortages:** ${f(pl.shortageItemsCount)} | **Damaged:** ${f(pl.damagedItemsCount)} | **Open MER:** ${f(pl.openMerCount)} | **Open REP:** ${f(pl.openRepCount)} | **Pending OPI:** ${f(pl.opiPendingCount)}`,
      );
      if (pl.totalsByUnit.length > 0) {
        lines.push(isFa ? '\n**جمع موجودی به تفکیک واحد شمارش:**' : '\n**Aggregated Stock by Unit:**');
        for (const u of pl.totalsByUnit) {
          lines.push(
            isFa
              ? `- **${u.unit}** (${f(u.rowCount)} ردیف): موجودی انبار اصلی **${f(u.mainWarehouseStockSum)}** · موجودی پیمانکار **${f(u.contractorStockSum)}** · مقدار پکینگ ${f(u.packingQtySum)} · کسری ${f(u.shortageSum)}`
              : `- **${u.unit}** (${f(u.rowCount)} rows): Main Stock **${f(u.mainWarehouseStockSum)}** · Contractor Stock **${f(u.contractorStockSum)}** · Packing Qty ${f(u.packingQtySum)} · Shortage ${f(u.shortageSum)}`,
          );
        }
      }
      if (pl.detailedItems.length > 0) {
        lines.push(`\n${formatDetailedItemsMarkdownTable(pl.detailedItems.slice(0, 10), lang)}`);
      }
      return { answer: lines.join('\n'), metrics: m };
    }
  }

  // 2) Specific item / size / code / entity query (HIGHEST PRIORITY!)
  // e.g. `موجودی Pipe 8"` or `چند متر لوله ۸ اینچ داریم؟` or `Gate Valve DN100`
  const extractedSubject = extractEntitySubjectFromQuestion(prompt);
  const subjectTerms = parseSearchTerms(extractedSubject);

  if (extractedSubject && subjectTerms.length > 0) {
    const wantsOnlyShortage = /کسری|shortage/i.test(q);
    const wantsOnlyDamaged = /اسیب|آسیب|خراب|damag/i.test(q);
    const statusFilter = wantsOnlyShortage
      ? 'shortage'
      : wantsOnlyDamaged
        ? 'damaged'
        : 'all';

    const res = searchWarehouseItems(
      db,
      {
        query: extractedSubject,
        statusFilter,
        scope: 'all',
        limit: 12,
      },
      lang,
    );

    if (res.totalDetailedMatches > 0 || res.totalGeneralMatches > 0 || res.totalTransitMatches > 0) {
      const lines: string[] = [];
      lines.push(
        isFa
          ? `### نتیجه جستجوی موجودی و اطلاعات «${extractedSubject}»`
          : `### Inventory & Lookup Result for "${extractedSubject}"`,
      );

      if (res.totalDetailedMatches > 0) {
        lines.push(
          isFa
            ? `تعداد **${f(res.totalDetailedMatches)} ردیف** مطابق در بخش جزئیات تجهیزات (در **${f(res.uniquePackingsCount)} پکینگ لیست** یکتا) یافت شد.`
            : `Found **${f(res.totalDetailedMatches)} matching row(s)** in Detailed Equipment across **${f(res.uniquePackingsCount)} unique packing list(s)**.`,
        );

        lines.push(isFa ? '\n**جمع دقیق موجودی به تفکیک واحد شمارش:**' : '\n**Exact Stock Totals by Unit:**');
        for (const u of res.totalsByUnit) {
          lines.push(
            isFa
              ? `- **واحد ${u.unit}** (${f(u.rowCount)} ردیف): موجودی انبار اصلی **${f(u.mainWarehouseStockSum)} ${u.unit}** | موجودی پیمانکار **${f(u.contractorStockSum)} ${u.unit}** | کل موجودی سایت **${f(u.totalSiteStockSum)} ${u.unit}** (مقدار پکینگ: ${f(u.packingQtySum)} · مقدار واقعی: ${f(u.actualQtySum)}${u.shortageSum > 0 ? ` · کسری: ${f(u.shortageSum)}` : ''}${u.damagedQtySum > 0 ? ` · آسیب‌دیده: ${f(u.damagedQtySum)}` : ''})`
              : `- **Unit: ${u.unit}** (${f(u.rowCount)} rows): Main Warehouse Stock **${f(u.mainWarehouseStockSum)} ${u.unit}** | Contractor Stock **${f(u.contractorStockSum)} ${u.unit}** | Total Site Stock **${f(u.totalSiteStockSum)} ${u.unit}** (Packing: ${f(u.packingQtySum)} · Actual: ${f(u.actualQtySum)}${u.shortageSum > 0 ? ` · Shortage: ${f(u.shortageSum)}` : ''}${u.damagedQtySum > 0 ? ` · Damaged: ${f(u.damagedQtySum)}` : ''})`,
          );
        }

        const metaBullets: string[] = [];
        if (res.storageLocations.length > 0) {
          metaBullets.push(
            isFa
              ? `- **محل‌های نگهداری:** ${res.storageLocations.join('، ')}`
              : `- **Storage Locations:** ${res.storageLocations.join(', ')}`,
          );
        }
        if (res.suppliers.length > 0) {
          metaBullets.push(
            isFa
              ? `- **تأمین‌کنندگان:** ${res.suppliers.join('، ')}`
              : `- **Suppliers:** ${res.suppliers.join(', ')}`,
          );
        }
        if (res.islands.length > 0) {
          metaBullets.push(
            isFa
              ? `- **جزایر:** ${res.islands.join('، ')}`
              : `- **Islands:** ${res.islands.join(', ')}`,
          );
        }
        if (res.uniquePackings.length > 0) {
          metaBullets.push(
            isFa
              ? `- **پکینگ لیست‌ها:** ${res.uniquePackings.slice(0, 10).join('، ')}${res.uniquePackingsCount > 10 ? ' ...' : ''}`
              : `- **Packing Lists:** ${res.uniquePackings.slice(0, 10).join(', ')}${res.uniquePackingsCount > 10 ? ' ...' : ''}`,
          );
        }
        if (res.opiPendingRowsCount > 0) {
          metaBullets.push(
            isFa
              ? `- **تعداد ردیف در انتظار بازرسی OPI:** ${f(res.opiPendingRowsCount)} ردیف`
              : `- **Pending OPI Inspection:** ${f(res.opiPendingRowsCount)} row(s)`,
          );
        }
        if (metaBullets.length > 0) {
          lines.push(`\n${metaBullets.join('\n')}`);
        }

        lines.push(`\n${formatDetailedItemsMarkdownTable(res.detailedItems.slice(0, 10), lang)}`);
      }

      if (res.totalGeneralMatches > 0) {
        lines.push(
          isFa
            ? `\n**ثبت کلی تجهیزات:** ${f(res.totalGeneralMatches)} ردیف مطابق (جمع وزن ناخالص: ${f(res.generalGrossWeightTons)} تن · وزن خالص: ${f(res.generalNetWeightTons)} تن)`
            : `\n**General Equipment:** ${f(res.totalGeneralMatches)} matching row(s) (Gross: ${f(res.generalGrossWeightTons)} t · Net: ${f(res.generalNetWeightTons)} t)`,
        );
      }

      if (res.totalTransitMatches > 0) {
        lines.push(
          isFa
            ? `\n**تجهیزات در راه:** ${f(res.totalTransitMatches)} ردیف مطابق (${res.transitItems.slice(0, 4).map((t) => `پکینگ ${t.packingListNo}: ${t.overallStatus}`).join(' | ')})`
            : `\n**In-Transit Equipment:** ${f(res.totalTransitMatches)} matching row(s) (${res.transitItems.slice(0, 4).map((t) => `PL ${t.packingListNo}: ${t.overallStatus}`).join(' | ')})`,
        );
      }

      return { answer: lines.join('\n'), metrics: m };
    }

    // Zero exact matches — check documents too before declaring not found
    const docHits = searchWarehouseDocuments(db, { docType: 'all', query: extractedSubject, limit: 8 });
    if (docHits.totalMatches > 0) {
      const docLines = docHits.documents.map((d) =>
        isFa
          ? `- **[${String(d.type)}]** شماره ${String(d.docNo || d.mtoCode || '-')} (${String(d.date || '-')})`
          : `- **[${String(d.type)}]** No. ${String(d.docNo || d.mtoCode || '-')} (${String(d.date || '-')})`,
      );
      return {
        answer: isFa
          ? `در لیست موجودی تجهیزات ردیفی برای **«${extractedSubject}»** یافت نشد، اما **${f(docHits.totalMatches)} سند مرتبط** پیدا شد:\n${docLines.join('\n')}`
          : `No inventory rows matched **"${extractedSubject}"**, but **${f(docHits.totalMatches)} related document(s)** were found:\n${docLines.join('\n')}`,
        metrics: m,
      };
    }

    // Honest zero-match response with closest suggestions (never dump unrelated island summary!)
    const notFoundLines: string[] = [];
    notFoundLines.push(
      isFa
        ? `هیچ ردیفی با مشخصات دقیق **«${extractedSubject}»** در پایگاه داده فعلی انبار (از مجموع ${f(m.detailedRows)} ردیف جزئیات و ${f(m.generalRows)} ردیف کلی) یافت نشد.`
        : `No exact records matching **"${extractedSubject}"** were found in the current warehouse database (${f(m.detailedRows)} detailed rows and ${f(m.generalRows)} general rows searched).`,
    );

    if (res.closestSuggestions.length > 0) {
      notFoundLines.push(
        isFa
          ? '\n**اقلام مشابه یافت‌شده در انبار (سایر سایزها یا شرح‌های نزدیک):**'
          : '\n**Closest Related Items Found in Warehouse (Other Sizes / Similar Descriptions):**',
      );
      notFoundLines.push(formatDetailedItemsMarkdownTable(res.closestSuggestions.slice(0, 8), lang));
    } else {
      notFoundLines.push(
        isFa
          ? 'پیشنهاد: املای انگلیسی/فارسی شرح کالا، سایز (مثلاً `8"` یا `DN200`) یا کد کالا را بررسی کنید.'
          : 'Tip: Check the item description spelling, size notation (e.g. `8"` or `DN200`), or item code.',
      );
    }

    return { answer: notFoundLines.join('\n'), metrics: m };
  }

  // 3) General analytical / operational warehouse questions (no specific item entity)
  const sections: string[] = [];

  const asksShortage = /کسری|اسیب|آسیب|مغایرت|خراب|mer|rep|shortage|damag|discrep|replace/i.test(q);
  const asksChemical = /شیمیایی|انقضا|chemical|expir/i.test(q);
  const asksTransit = /در راه|در دست ارسال|در دست بازرسی|رسیده|ترانزیت|transit|shipping|arrived/i.test(q);
  const asksWeight = /وزن|تن|کرایه|پکینگ|نگله|weight|ton|freight|packing/i.test(q);
  const asksIsland = /جزیره|جزایر|island/i.test(q);
  const asksLocation = /سوله|محل نگهداری|انبارها|storage|location/i.test(q);
  const asksSupplier = /تامین|فروشنده|supplier|vendor/i.test(q);
  const asksOpi = /opi|بازرسی|گشایش|inspection/i.test(q);
  const asksToolsOrSpares = /ابزار مخصوص|لوازم یدکی|special tool|spare part/i.test(q);
  const asksDocs = /gcv|miv|smr|osdr|سند|اسناد|حواله|رسید|صورتجلسه|برآورد|جایگزین|document/i.test(q);

  if (asksShortage) {
    const shortages = queryOperationalAlerts(db, { alertType: 'shortages', limit: 8 }, lang);
    const header = isFa
      ? `### وضعیت کسری، آسیب‌دیدگی و پرونده‌های MER/REP\n- **اقلام دارای کسری:** ${f(m.shortageItemsCount)} ردیف (جمع کسری: ${f(m.shortageQtySum)})\n- **اقلام آسیب‌دیده:** ${f(m.damagedItemsCount)} ردیف\n- **پرونده‌های MER باز:** ${f(m.openMerCount)} مورد\n- **پرونده‌های REP باز:** ${f(m.openRepCount)} مورد`
      : `### Shortages, Damages & Open MER/REP\n- **Shortage items:** ${f(m.shortageItemsCount)} rows (total qty: ${f(m.shortageQtySum)})\n- **Damaged items:** ${f(m.damagedItemsCount)} rows\n- **Open MER:** ${f(m.openMerCount)}\n- **Open REP:** ${f(m.openRepCount)}`;
    const topItems = 'items' in shortages && Array.isArray(shortages.items) ? shortages.items : [];
    const topLines = topItems.slice(0, 6).map((it) => {
      const d = it as { shipmentNo: string; packageNo: string; description: string; generalDescription: string; shortage: number; countingUnit: string };
      return isFa
        ? `- پکینگ **${d.shipmentNo}** / نگله ${d.packageNo || '-'}: ${d.description || d.generalDescription} — کسری: **${f(d.shortage)}${d.countingUnit ? ` ${d.countingUnit}` : ''}**`
        : `- PL **${d.shipmentNo}** / Pkg ${d.packageNo || '-'}: ${d.description || d.generalDescription} — Shortage: **${f(d.shortage)}${d.countingUnit ? ` ${d.countingUnit}` : ''}**`;
    });
    sections.push(topLines.length > 0 ? `${header}\n\n${isFa ? '**مهم‌ترین موارد کسری:**' : '**Top Shortages:**'}\n${topLines.join('\n')}` : header);
  }

  if (asksChemical) {
    const exp = queryOperationalAlerts(db, { alertType: 'expiring_chemicals', days: 30, limit: 10 }, lang);
    const items = (exp.items || []) as Array<{ shipmentNo: string; description: string; chemicalType: string; daysRemaining: number }>;
    if (items.length === 0) {
      sections.push(
        isFa
          ? `### مواد شیمیایی در آستانه انقضا\nدر حال حاضر هیچ ماده شیمیایی با تاریخ انقضای زیر ۳۰ روز وجود ندارد (کل اقلام شیمیایی ثبت‌شده: ${f(ov.chemicalsCount)} ردیف).`
          : `### Expiring Chemicals (<30 Days)\nNo chemicals are expiring within 30 days (total chemical rows: ${f(ov.chemicalsCount)}).`,
      );
    } else {
      const lines = items.map((c) =>
        isFa
          ? `- پکینگ **${c.shipmentNo}**: ${c.description} (${c.chemicalType || 'شیمیایی'}) — ${c.daysRemaining < 0 ? `منقضی‌شده (${f(Math.abs(c.daysRemaining))} روز گذشته)` : `**${f(c.daysRemaining)} روز باقیمانده**`}`
          : `- PL **${c.shipmentNo}**: ${c.description} (${c.chemicalType || 'Chemical'}) — ${c.daysRemaining < 0 ? `Expired (${f(Math.abs(c.daysRemaining))}d ago)` : `**${f(c.daysRemaining)}d remaining**`}`,
      );
      sections.push(
        `${isFa ? `### مواد شیمیایی با انقضای زیر ۳۰ روز (${f(items.length)} مورد)` : `### Chemicals Expiring Within 30 Days (${f(items.length)})`}\n${lines.join('\n')}`,
      );
    }
  }

  if (asksTransit) {
    sections.push(
      isFa
        ? `### خلاصه تجهیزات در راه (${f(m.transitRows)} ردیف)\n- **در دست ارسال:** ${f(m.transitShippingPackingsCount)} پکینگ\n- **در دست بازرسی:** ${f(m.transitInspectionPackingsCount)} پکینگ\n- **رسیده:** ${f(m.transitArrivedPackingsCount)} پکینگ`
        : `### In-Transit Summary (${f(m.transitRows)} rows)\n- **Shipping:** ${f(m.transitShippingPackingsCount)} packings\n- **Under Inspection:** ${f(m.transitInspectionPackingsCount)} packings\n- **Arrived:** ${f(m.transitArrivedPackingsCount)} packings`,
    );
  }

  if (asksWeight) {
    sections.push(
      isFa
        ? `### گزارش وزن و پکینگ‌های انبار\n- **پکینگ لیست‌های یکتا:** ${f(m.uniquePackings)}\n- **نگله‌های یکتا:** ${f(ov.uniquePackages)}\n- **ردیف‌های ثبت کلی:** ${f(m.generalRows)} | **ردیف‌های جزئیات:** ${f(m.detailedRows)}\n- **جمع وزن خالص:** ${f(m.netWeightTons)} تن\n- **جمع وزن ناخالص:** ${f(m.grossWeightTons)} تن\n- **کل مبلغ کرایه حمل:** ${f(ov.freightCostSum)} ریال`
        : `### Weight & Packing Totals\n- **Unique Packing Lists:** ${f(m.uniquePackings)}\n- **Unique Packages:** ${f(ov.uniquePackages)}\n- **General Rows:** ${f(m.generalRows)} | **Detailed Rows:** ${f(m.detailedRows)}\n- **Total Net Weight:** ${f(m.netWeightTons)} t\n- **Total Gross Weight:** ${f(m.grossWeightTons)} t\n- **Total Freight Cost:** ${f(ov.freightCostSum)} IRR`,
    );
  }

  if (asksIsland) {
    const agg = aggregateWarehouseByField(db, { groupBy: 'island', scope: 'detailed', limit: 10 }, lang);
    const lines = agg.groups.map((g) => {
      const row = g as { group: string; rows: number; mainStockRows: number; contractorStockRows: number };
      return isFa
        ? `- **${row.group}:** ${f(row.rows)} ردیف (دارای موجودی انبار اصلی: **${f(row.mainStockRows)}** ردیف · موجودی پیمانکار: **${f(row.contractorStockRows)}** ردیف)`
        : `- **${row.group}:** ${f(row.rows)} rows (Main Stock: **${f(row.mainStockRows)}** rows · Contractor Stock: **${f(row.contractorStockRows)}** rows)`;
    });
    if (lines.length > 0) {
      sections.push(`${isFa ? '### تفکیک اقلام و موجودی بر اساس جزیره' : '### Breakdown by Island'}\n${lines.join('\n')}`);
    }
  }

  if (asksLocation) {
    const agg = aggregateWarehouseByField(db, { groupBy: 'storageLocation', scope: 'detailed', limit: 12 }, lang);
    const lines = agg.groups.map((g) => {
      const row = g as { group: string; rows: number; mainStockRows: number; contractorStockRows: number };
      return isFa
        ? `- **${row.group}:** ${f(row.rows)} ردیف (موجودی انبار اصلی: ${f(row.mainStockRows)} ردیف · پیمانکار: ${f(row.contractorStockRows)} ردیف)`
        : `- **${row.group}:** ${f(row.rows)} rows (Main Stock: ${f(row.mainStockRows)} · Contractor: ${f(row.contractorStockRows)})`;
    });
    if (lines.length > 0) {
      sections.push(`${isFa ? '### تفکیک اقلام بر اساس محل نگهداری' : '### Breakdown by Storage Location'}\n${lines.join('\n')}`);
    }
  }

  if (asksSupplier) {
    const agg = aggregateWarehouseByField(db, { groupBy: 'supplier', scope: 'general', sortBy: 'rows', limit: 10 }, lang);
    const lines = agg.groups.map((g) => {
      const row = g as { group: string; rows: number; uniquePackings: number; grossWeightTons: number };
      return isFa
        ? `- **${row.group}:** ${f(row.uniquePackings)} پکینگ (${f(row.rows)} نگله · وزن ناخالص: ${f(row.grossWeightTons)} تن)`
        : `- **${row.group}:** ${f(row.uniquePackings)} packings (${f(row.rows)} packages · Gross: ${f(row.grossWeightTons)} t)`;
    });
    if (lines.length > 0) {
      sections.push(`${isFa ? '### پرتکرارترین تأمین‌کنندگان' : '### Top Suppliers'}\n${lines.join('\n')}`);
    }
  }

  if (asksOpi) {
    sections.push(
      isFa
        ? `### وضعیت بازرسی OPI\n- **اقلام در انتظار OPI (بدون مقدار واقعی):** ${f(m.opiPendingCount)} ردیف از ${f(m.detailedRows)} ردیف جزئیات\n- **دعوتنامه‌های OPI ثبت‌شده:** ${f(ov.documents.opiInvitations)} | **صورتجلسات OPI:** ${f(ov.documents.opiMinutes)}`
        : `### OPI Inspection Status\n- **Pending OPI items:** ${f(m.opiPendingCount)} of ${f(m.detailedRows)} detailed rows\n- **OPI Invitations:** ${f(ov.documents.opiInvitations)} | **OPI Minutes:** ${f(ov.documents.opiMinutes)}`,
    );
  }

  if (asksToolsOrSpares) {
    sections.push(
      isFa
        ? `### اقلام تخصصی انبار\n- **ابزار مخصوص:** ${f(ov.specialToolsCount)} ردیف\n- **لوازم یدکی:** ${f(ov.sparePartsCount)} ردیف\n- **مواد شیمیایی:** ${f(ov.chemicalsCount)} ردیف`
        : `### Specialized Categories\n- **Special Tools:** ${f(ov.specialToolsCount)} rows\n- **Spare Parts:** ${f(ov.sparePartsCount)} rows\n- **Chemicals:** ${f(ov.chemicalsCount)} rows`,
    );
  }

  if (asksDocs) {
    const d = ov.documents;
    sections.push(
      isFa
        ? `### آمار اسناد و فرم‌های رسمی انبار\n- صورتجلسات ورود به سایت: ${f(d.siteEntryMinutes)}\n- دعوتنامه‌های OPI: ${f(d.opiInvitations)} | صورتجلسات OPI: ${f(d.opiMinutes)}\n- گزارش‌های مغایرت OSDR: ${f(d.osdrReports)}\n- اسناد رسید GCV: ${f(d.gcvDocuments)} | حواله‌های MIV/SMR: ${f(d.mivDocuments)}\n- فرم‌های جایگزینی: ${f(d.substitutions)} | برآورد متریال (MTO): ${f(d.materialEstimates)}`
        : `### Official Warehouse Documents Summary\n- Site Entry Minutes: ${f(d.siteEntryMinutes)}\n- OPI Invitations: ${f(d.opiInvitations)} | OPI Minutes: ${f(d.opiMinutes)}\n- OSDR Reports: ${f(d.osdrReports)}\n- GCV Receipts: ${f(d.gcvDocuments)} | MIV/SMR Issues: ${f(d.mivDocuments)}\n- Substitutions: ${f(d.substitutions)} | Material Estimates: ${f(d.materialEstimates)}`,
    );
  }

  if (sections.length === 0) {
    const { analysis } = runLocalWarehouseAnalysis(db, lang);
    sections.push(
      `${analysis.summary}\n\n${isFa ? '**اقدامات پیشنهادی:**' : '**Recommended Actions:**'}\n${analysis.priorityActions.map((a) => `- ${a}`).join('\n')}`,
    );
  }

  return {
    answer: sections.join('\n\n'),
    metrics: m,
  };
}

export function classifyItemLocally(
  description: string,
  size = '',
  itemCode = '',
  lang: Language = 'fa',
): LocalItemClassification {
  const cleanDesc = normKey(description);
  const generalDescription = inferGeneralDescription(cleanDesc);
  const { itemCategory, chemicalType } = inferItemClassification(cleanDesc, '', generalDescription);

  let rawUnit = 'PC';
  if (itemCategory === 'chemicals') {
    if (/\b(oil|liquid|coolant|thinner|acid|solvent|paint|primer|glycol)\b|روغن|مایع|رنگ|تینر|اسید|حلال/i.test(cleanDesc)) {
      rawUnit = 'L';
    } else if (/\b(grease|powder|resin|grout|salt|silica)\b|گریس|پودر|رزین|گروت|سیلیکاژل/i.test(cleanDesc)) {
      rawUnit = 'KG';
    } else if (/\b(gas|sf6|argon|nitrogen|oxygen)\b|گاز|آرگون|نیتروژن/i.test(cleanDesc)) {
      rawUnit = 'CYL';
    }
  } else if (/\b(cable|wire|pipe|hose|tubing|tape|strip|conduit)\b|کابل|سیم|لوله|شلنگ|نوار/i.test(cleanDesc)) {
    rawUnit = 'M';
  } else if (/\b(kit|set|tool\s*set|spare\s*kit|seal\s*kit|gasket\s*kit)\b|ست|کیت/i.test(cleanDesc)) {
    rawUnit = 'SET';
  } else if (/\b(sheet|plate|grating|insulation\s+board)\b|ورق|گریتینگ/i.test(cleanDesc)) {
    rawUnit = 'SHEET';
  } else if (/\b(electrode|welding\s+rod)\b|الکترود/i.test(cleanDesc)) {
    rawUnit = 'KG';
  }

  const countingUnit = lang === 'fa' ? normalizeCountingUnitToFa(rawUnit) : rawUnit;

  let notes = '';
  if (itemCategory === 'chemicals') {
    notes =
      lang === 'fa'
        ? 'نگهداری در انبار سرپوشیده با تهویه مناسب و کنترل دوره‌ای تاریخ انقضاء و MSDS.'
        : 'Store in ventilated covered chemical storage; monitor shelf life and MSDS.';
  } else if (itemCategory === 'special_tools') {
    notes =
      lang === 'fa'
        ? 'ثبت در فهرست ابزار مخصوص؛ تحویل با رسید کنترل کالیبراسیون و برگشت پس از اتمام عملیات.'
        : 'Track as special tool; verify calibration status upon issuance and return.';
  } else if (itemCategory === 'spare_parts') {
    notes =
      lang === 'fa'
        ? 'قلم یدکی؛ نگهداری در بسته‌بندی ضد رطوبت و برچسب‌گذاری کد کالا جهت دسترسی سریع.'
        : 'Spare part; keep in moisture-protected packaging with clear item code labeling.';
  } else if (size || itemCode) {
    notes =
      lang === 'fa'
        ? 'بازرسی ظاهری و انطباق سایز و کد کالا هنگام گشایش (OPI) انجام شود.'
        : 'Verify visual condition, size, and item code during OPI inspection.';
  }

  return {
    generalDescription,
    itemCategory,
    chemicalType,
    countingUnit,
    notes,
  };
}
