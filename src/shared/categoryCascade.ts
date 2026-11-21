import { getTransitStatusOptions } from './normalizers.ts';
import type {
  CategoryGroupKey,
  CategoryStore,
  DetailedEntry,
  GcvDocumentRecord,
  GeneralEntry,
  MaterialEstimateRecord,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
} from './types.ts';

export interface CategoryCascadeDb {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  categories: CategoryStore;
  siteEntryMinutes?: SiteEntryMinutesRecord[];
  opiInvitations?: OpiInvitationRecord[];
  opiMinutes?: OpiMinutesRecord[];
  osdrReports?: OsdrReportRecord[];
  gcvDocuments?: GcvDocumentRecord[];
  mivDocuments?: MivDocumentRecord[];
  substitutions?: SubstitutionRecord[];
  materialEstimates?: MaterialEstimateRecord[];
}

function normToken(v: string | undefined | null): string {
  return (v || '').replace(/[^\S\r\n]+/g, ' ').trim();
}

/**
 * Splits a potentially multi-line cell value (e.g. "Air Intake\nTurbine\nExhaust\nAuxiliary")
 * into individual, clean, deduplicated category tokens.
 */
export function splitCategoryTokens(rawVal: string | undefined | null): string[] {
  const raw = rawVal || '';
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const clean = normToken(line);
    if (!clean || clean === '-' || clean === '—') continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

/**
 * Registers one or more category tokens (splitting stacked multi-line values)
 * into the target CategoryStore group.
 */
export function registerCategoryTokens(
  categories: CategoryStore,
  group: CategoryGroupKey,
  rawVal: string | undefined | null,
): void {
  const arr = categories[group];
  if (!arr) return;
  const tokens = splitCategoryTokens(rawVal);
  if (tokens.length === 0) return;
  let added = false;
  for (const token of tokens) {
    if (group === 'transitStatus' && token === 'پایان') continue;
    if (!arr.includes(token)) {
      arr.push(token);
      added = true;
    }
  }
  if (added && group !== 'transitStatus') {
    arr.sort((a, b) => a.localeCompare(b, 'fa'));
  }
}

/**
 * Splits any existing multi-line values stored inside `categories` into separate entries.
 */
export function sanitizeCategoryStore(categories: CategoryStore): void {
  const groups = Object.keys(categories) as CategoryGroupKey[];
  for (const group of groups) {
    const existing = Array.isArray(categories[group]) ? categories[group] : [];
    const seen = new Set<string>();
    const cleanList: string[] = [];
    for (const item of existing) {
      for (const token of splitCategoryTokens(item)) {
        if (group === 'transitStatus' && token === 'پایان') continue;
        if (!seen.has(token)) {
          seen.add(token);
          cleanList.push(token);
        }
      }
    }
    if (group === 'transitStatus') {
      categories[group] = getTransitStatusOptions(cleanList);
    } else {
      cleanList.sort((a, b) => a.localeCompare(b, 'fa'));
      categories[group] = cleanList;
    }
  }
}

/**
 * Computes usage counts for every category group across core and operational tables,
 * counting each line of a multi-line cell individually.
 */
export function computeCategoryCounts(
  db: CategoryCascadeDb,
): Record<CategoryGroupKey, Record<string, number>> {
  const counts: Record<CategoryGroupKey, Record<string, number>> = {
    island: {},
    system: {},
    subSystem: {},
    unit: {},
    supplier: {},
    dispatchLocation: {},
    origin: {},
    storageLocation: {},
    carrierContractor: {},
    countingUnit: {},
    packageType: {},
    generalDescription: {},
    stocktakeStatus: {},
    transitStatus: {},
    receiver: {},
    merStatus: {},
    repStatus: {},
    balanceStatus: {},
    chemicalType: {},
  };

  const bump = (group: CategoryGroupKey, rawVal: string | undefined | null) => {
    for (const token of splitCategoryTokens(rawVal)) {
      counts[group][token] = (counts[group][token] || 0) + 1;
    }
  };

  for (const g of db.general) {
    bump('island', g.island);
    bump('system', g.system);
    bump('subSystem', g.subSystem);
    bump('unit', g.unit);
    bump('supplier', g.supplier);
    bump('dispatchLocation', g.dispatchLocation);
    bump('packageType', g.packageType);
  }
  for (const d of db.detailed) {
    bump('island', d.island);
    bump('system', d.system);
    bump('subSystem', d.subSystem);
    bump('unit', d.unit);
    bump('supplier', d.supplier);
    bump('origin', d.origin);
    bump('storageLocation', d.storageLocation);
    bump('countingUnit', d.countingUnit);
    bump('generalDescription', d.generalDescription);
    bump('stocktakeStatus', d.stocktakeStatus);
    bump('receiver', d.receiver);
    bump('merStatus', d.merStatus);
    bump('repStatus', d.repStatus);
    bump('balanceStatus', d.balanceStatus);
    bump('chemicalType', d.chemicalType);
  }
  for (const t of db.transit) {
    bump('system', t.system);
    bump('subSystem', t.subSystem);
    bump('unit', t.unit);
    bump('supplier', t.supplier);
    bump('dispatchLocation', t.dispatchLocation);
    bump('carrierContractor', t.carrierContractor);
    bump('transitStatus', t.overallStatus);
  }
  for (const m of db.materialEstimates || []) {
    bump('island', m.island);
    bump('system', m.system);
    bump('subSystem', m.subSystem);
    bump('unit', m.unit);
    bump('countingUnit', m.countingUnit);
  }
  for (const s of db.substitutions || []) {
    bump('countingUnit', s.countingUnit);
  }
  for (const sem of db.siteEntryMinutes || []) {
    bump('supplier', sem.supplier);
    bump('dispatchLocation', sem.origin);
  }
  for (const inv of db.opiInvitations || []) {
    bump('supplier', inv.supplier);
  }
  for (const min of db.opiMinutes || []) {
    bump('supplier', min.supplier);
  }
  for (const osdr of db.osdrReports || []) {
    bump('supplier', osdr.supplier);
  }
  for (const gcv of db.gcvDocuments || []) {
    bump('supplier', gcv.supplier);
    bump('receiver', gcv.receiver);
  }
  for (const miv of db.mivDocuments || []) {
    bump('receiver', miv.receiver);
    bump('receiver', miv.party);
  }

  return counts;
}

/**
 * Replaces or removes a token within a single-line or multi-line cell value.
 * Returns `{ changed, value }`.
 */
function transformCellValue(
  currentRaw: string | undefined | null,
  fromToken: string,
  toToken: string | null,
): { changed: boolean; value: string } {
  const current = currentRaw || '';
  if (!current.trim()) return { changed: false, value: current };

  // Fast path: single-line exact match after trim
  if (!current.includes('\n') && !current.includes('\r')) {
    if (normToken(current) === fromToken) {
      return { changed: true, value: toToken ?? '' };
    }
    return { changed: false, value: current };
  }

  // Multi-line cell: transform line-by-line while preserving other lines and deduplicating
  const lines = current.split(/\r?\n/);
  let changed = false;
  const nextLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clean = normToken(line);
    if (!clean) continue;
    if (clean === fromToken) {
      changed = true;
      if (toToken && !seen.has(toToken)) {
        seen.add(toToken);
        nextLines.push(toToken);
      }
    } else if (!seen.has(clean)) {
      seen.add(clean);
      nextLines.push(clean);
    }
  }
  if (!changed) return { changed: false, value: current };
  return { changed: true, value: nextLines.join('\n') };
}

function mutateField<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  fromToken: string,
  toToken: string | null,
): number {
  const current = obj[key];
  if (typeof current !== 'string') return 0;
  const res = transformCellValue(current, fromToken, toToken);
  if (!res.changed) return 0;
  obj[key] = res.value as T[K];
  return 1;
}

function applyCategoryMutation(
  db: CategoryCascadeDb,
  group: CategoryGroupKey,
  fromRaw: string,
  toRaw: string | null,
): number {
  const from = normToken(fromRaw);
  const to = toRaw === null ? null : normToken(toRaw);
  if (!from) return 0;

  let updatedCount = 0;

  for (const g of db.general) {
    if (group === 'island') updatedCount += mutateField(g, 'island', from, to);
    else if (group === 'system') updatedCount += mutateField(g, 'system', from, to);
    else if (group === 'subSystem') updatedCount += mutateField(g, 'subSystem', from, to);
    else if (group === 'unit') updatedCount += mutateField(g, 'unit', from, to);
    else if (group === 'supplier') updatedCount += mutateField(g, 'supplier', from, to);
    else if (group === 'dispatchLocation') updatedCount += mutateField(g, 'dispatchLocation', from, to);
    else if (group === 'packageType') updatedCount += mutateField(g, 'packageType', from, to);
  }

  for (const d of db.detailed) {
    if (group === 'island') updatedCount += mutateField(d, 'island', from, to);
    else if (group === 'system') updatedCount += mutateField(d, 'system', from, to);
    else if (group === 'subSystem') updatedCount += mutateField(d, 'subSystem', from, to);
    else if (group === 'unit') updatedCount += mutateField(d, 'unit', from, to);
    else if (group === 'supplier') updatedCount += mutateField(d, 'supplier', from, to);
    else if (group === 'origin') updatedCount += mutateField(d, 'origin', from, to);
    else if (group === 'storageLocation') updatedCount += mutateField(d, 'storageLocation', from, to);
    else if (group === 'countingUnit') updatedCount += mutateField(d, 'countingUnit', from, to);
    else if (group === 'generalDescription') updatedCount += mutateField(d, 'generalDescription', from, to);
    else if (group === 'stocktakeStatus') updatedCount += mutateField(d, 'stocktakeStatus', from, to);
    else if (group === 'receiver') {
      updatedCount += mutateField(d, 'receiver', from, to);
      updatedCount += mutateField(d, 'mivReceiver', from, to);
    } else if (group === 'merStatus') updatedCount += mutateField(d, 'merStatus', from, to);
    else if (group === 'repStatus') updatedCount += mutateField(d, 'repStatus', from, to);
    else if (group === 'balanceStatus') updatedCount += mutateField(d, 'balanceStatus', from, to);
    else if (group === 'chemicalType') updatedCount += mutateField(d, 'chemicalType', from, to);
  }

  for (const t of db.transit) {
    if (group === 'system') updatedCount += mutateField(t, 'system', from, to);
    else if (group === 'subSystem') updatedCount += mutateField(t, 'subSystem', from, to);
    else if (group === 'unit') updatedCount += mutateField(t, 'unit', from, to);
    else if (group === 'supplier') updatedCount += mutateField(t, 'supplier', from, to);
    else if (group === 'dispatchLocation') updatedCount += mutateField(t, 'dispatchLocation', from, to);
    else if (group === 'carrierContractor') updatedCount += mutateField(t, 'carrierContractor', from, to);
    else if (group === 'transitStatus') {
      const replacement = to === null ? 'در دست ارسال' : to;
      updatedCount += mutateField(t, 'overallStatus', from, replacement);
    }
  }

  for (const m of db.materialEstimates || []) {
    if (group === 'island') updatedCount += mutateField(m, 'island', from, to);
    else if (group === 'system') updatedCount += mutateField(m, 'system', from, to);
    else if (group === 'subSystem') updatedCount += mutateField(m, 'subSystem', from, to);
    else if (group === 'unit') updatedCount += mutateField(m, 'unit', from, to);
    else if (group === 'countingUnit') updatedCount += mutateField(m, 'countingUnit', from, to);
  }

  for (const s of db.substitutions || []) {
    if (group === 'countingUnit') updatedCount += mutateField(s, 'countingUnit', from, to);
    if (group === 'repStatus') updatedCount += mutateField(s, 'notes', from, to);
  }

  for (const sem of db.siteEntryMinutes || []) {
    if (group === 'supplier') updatedCount += mutateField(sem, 'supplier', from, to);
    else if (group === 'dispatchLocation' || group === 'origin') {
      updatedCount += mutateField(sem, 'origin', from, to);
    }
  }

  for (const inv of db.opiInvitations || []) {
    if (group === 'supplier') updatedCount += mutateField(inv, 'supplier', from, to);
  }

  for (const min of db.opiMinutes || []) {
    if (group === 'supplier') updatedCount += mutateField(min, 'supplier', from, to);
  }

  for (const osdr of db.osdrReports || []) {
    if (group === 'supplier') updatedCount += mutateField(osdr, 'supplier', from, to);
  }

  for (const gcv of db.gcvDocuments || []) {
    if (group === 'supplier') updatedCount += mutateField(gcv, 'supplier', from, to);
    else if (group === 'receiver') updatedCount += mutateField(gcv, 'receiver', from, to);
    if (group === 'countingUnit' && Array.isArray(gcv.items)) {
      for (const item of gcv.items) {
        updatedCount += mutateField(item, 'uom', from, to);
      }
    }
  }

  for (const miv of db.mivDocuments || []) {
    if (group === 'receiver') {
      updatedCount += mutateField(miv, 'receiver', from, to);
      updatedCount += mutateField(miv, 'party', from, to);
    }
    if (group === 'countingUnit' && Array.isArray(miv.items)) {
      for (const item of miv.items) {
        updatedCount += mutateField(item, 'uom', from, to);
      }
    }
  }

  return updatedCount;
}

/**
 * Renames or merges a category value across the CategoryStore and every matching table/document.
 */
export function applyCategoryRename(
  db: CategoryCascadeDb,
  group: CategoryGroupKey,
  oldValue: string,
  newValue: string,
): number {
  const from = normToken(oldValue);
  const to = normToken(newValue);
  if (!from || !to || !db.categories[group]) return 0;

  const updatedCount = applyCategoryMutation(db, group, from, to);
  db.categories[group] = db.categories[group].filter((v) => normToken(v) !== from);
  registerCategoryTokens(db.categories, group, to);
  if (group === 'transitStatus') {
    db.categories.transitStatus = getTransitStatusOptions(db.categories.transitStatus);
  }
  return updatedCount;
}

/**
 * Deletes a category value from the CategoryStore and clears/removes it from every matching table/document.
 */
export function applyCategoryDelete(
  db: CategoryCascadeDb,
  group: CategoryGroupKey,
  value: string,
): number {
  const target = normToken(value);
  if (!target || !db.categories[group]) return 0;

  const updatedCount = applyCategoryMutation(db, group, target, null);
  db.categories[group] = db.categories[group].filter((v) => normToken(v) !== target);
  if (group === 'transitStatus') {
    db.categories.transitStatus = getTransitStatusOptions(db.categories.transitStatus);
  }
  return updatedCount;
}
