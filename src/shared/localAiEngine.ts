import {
  computeDetailedEntry,
  computeSelectionFormulaSummary,
  getExpiringChemicals,
  isMerOpen,
  isRepOpen,
  roundQty,
} from './formulas.ts';
import { inferGeneralDescription } from './generalDescription.ts';
import { formatDisplayNumber, normalizeDigits } from './jalali.ts';
import { formatCountingUnit, inferItemClassification, normalizeCountingUnitToFa } from './normalizers.ts';
import type {
  DetailedEntry,
  GeneralEntry,
  Language,
  TransitEntry,
} from './types.ts';

export interface LocalWarehouseDbSlice {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
}

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

function normKey(s: string | undefined | null): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function buildLocalWarehouseContext(db: LocalWarehouseDbSlice, queryText = '') {
  const detailedComputed = db.detailed.map(computeDetailedEntry);
  const shortageItems = detailedComputed.filter((d) => d.hasShortage);
  const damagedItems = detailedComputed.filter((d) => d.hasDamaged);
  const openMer = detailedComputed.filter((d) => isMerOpen(d));
  const openRep = detailedComputed.filter((d) => isRepOpen(d));
  const opiPending = detailedComputed.filter((d) => d.opiPending);
  const expiringChemicals = getExpiringChemicals(detailedComputed, 30);

  const uniquePackings = new Set<string>();
  const uniquePackages = new Set<string>();
  const islandCounts = new Map<string, { rows: number; mapnaRows: number; contractorRows: number }>();
  const supplierCounts = new Map<string, number>();

  for (const g of db.general) {
    const pk = normKey(g.packingListNo);
    const pkg = normKey(g.packageNo);
    if (pk) uniquePackings.add(pk);
    if (pk || pkg) uniquePackages.add(`${pk}::${pkg}`);
    const sup = normKey(g.supplier);
    if (sup) supplierCounts.set(sup, (supplierCounts.get(sup) || 0) + 1);
  }
  for (const d of detailedComputed) {
    const pk = normKey(d.shipmentNo);
    if (pk) uniquePackings.add(pk);
    const isl = normKey(d.island) || 'نامشخص';
    const cur = islandCounts.get(isl) || { rows: 0, mapnaRows: 0, contractorRows: 0 };
    cur.rows += 1;
    if (d.mapnaInventory > 0) cur.mapnaRows += 1;
    if (d.contractorInventory > 0) cur.contractorRows += 1;
    islandCounts.set(isl, cur);
  }

  const transitSummary = computeSelectionFormulaSummary({ transit: db.transit });
  const generalSummary = computeSelectionFormulaSummary({ general: db.general });
  const detailedSummary = computeSelectionFormulaSummary({ detailed: detailedComputed });

  const stopWords = new Set([
    'وضعیت', 'خلاصه', 'گزارش', 'چگونه', 'کدام', 'است', 'هستند', 'اقلام', 'انبار',
    'بگو', 'بده', 'دارای', 'برای', 'تعداد', 'لیست', 'چند', 'در', 'از', 'به', 'و', 'یا', 'را', 'با', 'کل',
    'what', 'which', 'how', 'many', 'show', 'list', 'summary', 'report', 'status', 'the', 'and', 'for', 'are', 'with', 'all', 'total',
  ]);
  const tokens = normalizeDigits(queryText || '')
    .toLowerCase()
    .split(/[\s،,.;:؟?!()[\]/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !stopWords.has(w));

  const matchedGeneral = tokens.length > 0
    ? db.general
        .filter((g) => {
          const hay = `${g.packingListNo} ${g.packageNo} ${g.itemDescription} ${g.supplier} ${g.island} ${g.system} ${g.billOfLadingNo}`.toLowerCase();
          return tokens.some((tok) => hay.includes(tok));
        })
        .slice(0, 8)
    : [];

  const matchedDetailed = tokens.length > 0
    ? detailedComputed
        .filter((d) => {
          const hay = `${d.shipmentNo} ${d.packageNo} ${d.itemNo} ${d.description} ${d.generalDescription} ${d.itemCode} ${d.island} ${d.supplier} ${d.merNo} ${d.repNo}`.toLowerCase();
          return tokens.some((tok) => hay.includes(tok));
        })
        .slice(0, 10)
    : [];

  const metrics: LocalWarehouseAiMetrics = {
    generalRows: db.general.length,
    detailedRows: db.detailed.length,
    transitRows: db.transit.length,
    uniquePackings: uniquePackings.size,
    grossWeightTons: roundQty(generalSummary.grossWeightSum / 1000),
    netWeightTons: roundQty(generalSummary.netWeightSum / 1000),
    shortageItemsCount: shortageItems.length,
    shortageQtySum: detailedSummary.shortageSum,
    damagedItemsCount: damagedItems.length,
    openMerCount: openMer.length,
    openRepCount: openRep.length,
    opiPendingCount: opiPending.length,
    expiringChemicalsCount: expiringChemicals.length,
    transitArrivedPackingsCount: transitSummary.transitArrivedPackingsCount || 0,
    transitShippingPackingsCount: transitSummary.transitShippingPackingsCount || 0,
    transitInspectionPackingsCount: transitSummary.transitInspectionPackingsCount || 0,
  };

  return {
    metrics,
    uniquePackagesCount: uniquePackages.size,
    freightCostSum: generalSummary.freightCostSum,
    shortageItems,
    damagedItems,
    openMer,
    openRep,
    opiPending,
    expiringChemicals,
    islandCounts,
    supplierCounts,
    matchedGeneral,
    matchedDetailed,
    tokens,
  };
}

export function runLocalWarehouseAnalysis(
  db: LocalWarehouseDbSlice,
  lang: Language = 'fa',
): { analysis: LocalWarehouseAnalysis; metrics: LocalWarehouseAiMetrics } {
  const ctx = buildLocalWarehouseContext(db);
  const m = ctx.metrics;
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
    ? `در انبار فعلی ${f(m.uniquePackings)} پکینگ لیست یکتا (${f(m.generalRows)} ردیف کلی و ${f(m.detailedRows)} ردیف جزئیات) با مجموع وزن ناخالص ${f(m.grossWeightTons)} تن و وزن خالص ${f(m.netWeightTons)} تن ثبت شده است. در حال حاضر ${f(m.shortageItemsCount)} قلم دارای کسری، ${f(m.damagedItemsCount)} قلم آسیب‌دیده، ${f(m.openMerCount)} مورد MER باز، ${f(m.openRepCount)} مورد REP باز و ${f(m.expiringChemicalsCount)} ماده شیمیایی با انقضای زیر ۳۰ روز فعال است.`
    : `Current warehouse inventory tracks ${f(m.uniquePackings)} unique packing lists (${f(m.generalRows)} general rows and ${f(m.detailedRows)} detailed rows) totaling ${f(m.grossWeightTons)} t gross / ${f(m.netWeightTons)} t net. Active operational alerts: ${f(m.shortageItemsCount)} shortage items, ${f(m.damagedItemsCount)} damaged items, ${f(m.openMerCount)} open MER, ${f(m.openRepCount)} open REP, and ${f(m.expiringChemicalsCount)} chemicals expiring within 30 days.`;

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
  const ctx = buildLocalWarehouseContext(db, prompt);
  const m = ctx.metrics;
  const isFa = lang !== 'en';
  const f = (n: number) => formatDisplayNumber(n, lang);
  const q = normalizeDigits(prompt || '').toLowerCase();

  const sections: string[] = [];

  const asksShortage = /کسری|آسیب|مغایرت|خراب|mer|rep|shortage|damag|discrep|replace/i.test(q);
  const asksChemical = /شیمیایی|انقضا|تاریخ\s*انقضا|chemical|expir/i.test(q);
  const asksTransit = /در راه|در دست ارسال|در دست بازرسی|رسیده|حمل|ترانزیت|transit|shipping|arrived/i.test(q);
  const asksWeight = /وزن|تن|پکینگ|نگله|کرایه|تعداد|weight|ton|packing|freight|total/i.test(q);
  const asksIsland = /جزیره|موجودی|مپنا|پیمانکار|island|stock|inventory/i.test(q);
  const asksSupplier = /تامین|تأمین|فروشنده|supplier|vendor/i.test(q);
  const asksOpi = /opi|بازرسی|گشایش|inspection/i.test(q);

  if (asksShortage) {
    const header = isFa
      ? `وضعیت کسری، آسیب‌دیدگی و پرونده‌های MER/REP:\n• اقلام دارای کسری: ${f(m.shortageItemsCount)} ردیف (جمع کسری: ${f(m.shortageQtySum)})\n• اقلام آسیب‌دیده: ${f(m.damagedItemsCount)} ردیف\n• پرونده‌های MER باز: ${f(m.openMerCount)} مورد\n• پرونده‌های REP باز: ${f(m.openRepCount)} مورد`
      : `Shortages, Damages & Open MER/REP:\n• Shortage items: ${f(m.shortageItemsCount)} rows (total qty: ${f(m.shortageQtySum)})\n• Damaged items: ${f(m.damagedItemsCount)} rows\n• Open MER: ${f(m.openMerCount)}\n• Open REP: ${f(m.openRepCount)}`;
    const topLines = ctx.shortageItems.slice(0, 6).map((d) => {
      const unit = formatCountingUnit(d.countingUnit, lang);
      return isFa
        ? `  - پکینگ ${d.shipmentNo} / نگله ${d.packageNo || '-'}: ${d.description || d.generalDescription} — کسری: ${f(d.shortage)}${unit ? ` ${unit}` : ''}`
        : `  - PL ${d.shipmentNo} / Pkg ${d.packageNo || '-'}: ${d.description || d.generalDescription} — Shortage: ${f(d.shortage)}${unit ? ` ${unit}` : ''}`;
    });
    sections.push(topLines.length > 0 ? `${header}\n${isFa ? 'مهم‌ترین موارد کسری:' : 'Top Shortages:'}\n${topLines.join('\n')}` : header);
  }

  if (asksChemical) {
    if (ctx.expiringChemicals.length === 0) {
      sections.push(
        isFa
          ? 'مواد شیمیایی در آستانه انقضا (زیر ۳۰ روز): در حال حاضر هیچ ماده شیمیایی با تاریخ انقضای زیر ۳۰ روز وجود ندارد.'
          : 'Expiring Chemicals (<30 days): No chemicals are currently expiring within 30 days.',
      );
    } else {
      const lines = ctx.expiringChemicals.slice(0, 8).map((c) =>
        isFa
          ? `  - پکینگ ${c.shipmentNo}: ${c.description} (${c.chemicalType || 'شیمیایی'}) — ${c.daysRemaining < 0 ? `منقضی‌شده (${f(Math.abs(c.daysRemaining))} روز گذشته)` : `${f(c.daysRemaining)} روز باقیمانده`}`
          : `  - PL ${c.shipmentNo}: ${c.description} (${c.chemicalType || 'Chemical'}) — ${c.daysRemaining < 0 ? `Expired (${f(Math.abs(c.daysRemaining))}d ago)` : `${f(c.daysRemaining)}d remaining`}`,
      );
      sections.push(
        `${isFa ? `مواد شیمیایی با انقضای زیر ۳۰ روز (${f(ctx.expiringChemicals.length)} مورد):` : `Chemicals Expiring Within 30 Days (${f(ctx.expiringChemicals.length)}):`}\n${lines.join('\n')}`,
      );
    }
  }

  if (asksTransit) {
    sections.push(
      isFa
        ? `خلاصه تجهیزات در راه (${f(m.transitRows)} ردیف):\n• در دست ارسال: ${f(m.transitShippingPackingsCount)} پکینگ\n• در دست بازرسی: ${f(m.transitInspectionPackingsCount)} پکینگ\n• رسیده: ${f(m.transitArrivedPackingsCount)} پکینگ`
        : `In-Transit Summary (${f(m.transitRows)} rows):\n• Shipping: ${f(m.transitShippingPackingsCount)} packings\n• Under Inspection: ${f(m.transitInspectionPackingsCount)} packings\n• Arrived: ${f(m.transitArrivedPackingsCount)} packings`,
    );
  }

  if (asksWeight) {
    sections.push(
      isFa
        ? `گزارش وزن و پکینگ‌های انبار:\n• پکینگ لیست‌های یکتا: ${f(m.uniquePackings)}\n• نگله‌های یکتا: ${f(ctx.uniquePackagesCount)}\n• ردیف‌های ثبت کلی: ${f(m.generalRows)} | ردیف‌های جزئیات: ${f(m.detailedRows)}\n• جمع وزن خالص: ${f(m.netWeightTons)} تن\n• جمع وزن ناخالص: ${f(m.grossWeightTons)} تن\n• کل مبلغ کرایه حمل: ${f(ctx.freightCostSum)} ریال`
        : `Weight & Packing Totals:\n• Unique Packing Lists: ${f(m.uniquePackings)}\n• Unique Packages: ${f(ctx.uniquePackagesCount)}\n• General Rows: ${f(m.generalRows)} | Detailed Rows: ${f(m.detailedRows)}\n• Total Net Weight: ${f(m.netWeightTons)} t\n• Total Gross Weight: ${f(m.grossWeightTons)} t\n• Total Freight Cost: ${f(ctx.freightCostSum)} IRR`,
    );
  }

  if (asksIsland && ctx.islandCounts.size > 0) {
    const topIslands = Array.from(ctx.islandCounts.entries())
      .sort((a, b) => b[1].rows - a[1].rows)
      .slice(0, 8)
      .map(([isl, st]) =>
        isFa
          ? `  - ${isl}: ${f(st.rows)} ردیف (دارای موجودی انبار اصلی: ${f(st.mapnaRows)} ردیف · موجودی پیمانکار: ${f(st.contractorRows)} ردیف)`
          : `  - ${isl}: ${f(st.rows)} rows (Main Stock rows: ${f(st.mapnaRows)} · Contractor Stock rows: ${f(st.contractorRows)})`,
      );
    sections.push(`${isFa ? 'تفکیک اقلام و موجودی بر اساس جزیره:' : 'Breakdown by Island:'}\n${topIslands.join('\n')}`);
  }

  if (asksSupplier && ctx.supplierCounts.size > 0) {
    const topSuppliers = Array.from(ctx.supplierCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([sup, cnt]) => (isFa ? `  - ${sup}: ${f(cnt)} نگله` : `  - ${sup}: ${f(cnt)} packages`));
    sections.push(`${isFa ? 'پرتکرارترین تأمین‌کنندگان:' : 'Top Suppliers:'}\n${topSuppliers.join('\n')}`);
  }

  if (asksOpi) {
    sections.push(
      isFa
        ? `وضعیت بازرسی OPI:\n• اقلام در انتظار OPI (بدون مقدار واقعی): ${f(m.opiPendingCount)} ردیف از ${f(m.detailedRows)} ردیف جزئیات.`
        : `OPI Inspection Status:\n• Pending OPI items (no actual qty yet): ${f(m.opiPendingCount)} of ${f(m.detailedRows)} detailed rows.`,
    );
  }

  if (ctx.matchedGeneral.length > 0 || ctx.matchedDetailed.length > 0) {
    const matchLines: string[] = [];
    for (const g of ctx.matchedGeneral.slice(0, 4)) {
      matchLines.push(
        isFa
          ? `  • [کلی] پکینگ ${g.packingListNo} / نگله ${g.packageNo || '-'}: ${g.itemDescription || '-'} (${g.supplier || '-'})`
          : `  • [General] PL ${g.packingListNo} / Pkg ${g.packageNo || '-'}: ${g.itemDescription || '-'} (${g.supplier || '-'})`,
      );
    }
    for (const d of ctx.matchedDetailed.slice(0, 6)) {
      const unit = formatCountingUnit(d.countingUnit, lang);
      matchLines.push(
        isFa
          ? `  • [جزئیات] پکینگ ${d.shipmentNo} / آیتم ${d.itemNo || '-'}: ${d.description || d.generalDescription} — پکینگ: ${f(d.packingQty ?? 0)}${unit ? ` ${unit}` : ''}${d.shortage > 0 ? ` (کسری: ${f(d.shortage)})` : ''}`
          : `  • [Detailed] PL ${d.shipmentNo} / Item ${d.itemNo || '-'}: ${d.description || d.generalDescription} — Qty: ${f(d.packingQty ?? 0)}${unit ? ` ${unit}` : ''}${d.shortage > 0 ? ` (Shortage: ${f(d.shortage)})` : ''}`,
      );
    }
    if (matchLines.length > 0 && ((!asksShortage && !asksChemical && !asksTransit && !asksWeight) || ctx.tokens.some((t) => /\d/.test(t)))) {
      sections.push(
        `${isFa ? 'رکوردهای مرتبط یافت‌شده در پایگاه داده:' : 'Matching Records Found:'}\n${matchLines.join('\n')}`,
      );
    }
  }

  if (sections.length === 0) {
    const { analysis } = runLocalWarehouseAnalysis(db, lang);
    sections.push(
      `${analysis.summary}\n\n${isFa ? 'اقدامات پیشنهادی:' : 'Recommended Actions:'}\n${analysis.priorityActions.map((a) => `• ${a}`).join('\n')}`,
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
