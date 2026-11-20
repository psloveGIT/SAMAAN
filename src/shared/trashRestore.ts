import {
  buildDetailedDupKey,
  buildGeneralDupKey,
  buildTransitDupKey,
} from './tableQuery.ts';
import type {
  DetailedEntry,
  GeneralEntry,
  TransitEntry,
  TrashRecord,
} from './types.ts';

/**
 * Returns the canonical duplicate detection key for a Recycle Bin entry,
 * matching the exact rules enforced in General, Detailed, and Transit registers.
 */
export function buildTrashEntryDupKey(
  scope: TrashRecord['scope'],
  data: GeneralEntry | DetailedEntry | TransitEntry,
): string {
  if (scope === 'general') {
    return buildGeneralDupKey(data as GeneralEntry);
  }
  if (scope === 'detailed') {
    return buildDetailedDupKey(data as DetailedEntry);
  }
  return buildTransitDupKey(data as TransitEntry);
}

/**
 * Builds the active duplicate-key lookup sets for all three scopes in O(N).
 */
export function buildActiveDupKeySets(db: {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
}): {
  general: Set<string>;
  detailed: Set<string>;
  transit: Set<string>;
} {
  const general = new Set<string>();
  for (let i = 0; i < db.general.length; i += 1) {
    const key = buildGeneralDupKey(db.general[i]);
    if (key) general.add(key);
  }

  const detailed = new Set<string>();
  for (let i = 0; i < db.detailed.length; i += 1) {
    const key = buildDetailedDupKey(db.detailed[i]);
    if (key) detailed.add(key);
  }

  const transit = new Set<string>();
  for (let i = 0; i < db.transit.length; i += 1) {
    const key = buildTransitDupKey(db.transit[i]);
    if (key) transit.add(key);
  }

  return { general, detailed, transit };
}

/**
 * Checks whether restoring a single TrashRecord would duplicate an active row
 * using the canonical scope-specific duplicate rules (General / Detailed / Transit).
 */
export function isTrashRestoreDuplicate(
  entry: TrashRecord,
  activeDb: {
    general: GeneralEntry[];
    detailed: DetailedEntry[];
    transit: TransitEntry[];
  },
): boolean {
  const key = buildTrashEntryDupKey(entry.scope, entry.data);
  if (!key) return false;

  if (entry.scope === 'general') {
    for (let i = 0; i < activeDb.general.length; i += 1) {
      if (buildGeneralDupKey(activeDb.general[i]) === key) return true;
    }
    return false;
  }

  if (entry.scope === 'detailed') {
    for (let i = 0; i < activeDb.detailed.length; i += 1) {
      if (buildDetailedDupKey(activeDb.detailed[i]) === key) return true;
    }
    return false;
  }

  for (let i = 0; i < activeDb.transit.length; i += 1) {
    if (buildTransitDupKey(activeDb.transit[i]) === key) return true;
  }
  return false;
}
