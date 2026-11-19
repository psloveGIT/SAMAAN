import type {
  CategoryStore,
  DetailedEntry,
  GeneralEntry,
  PackingStatusMeta,
  TransitEntry,
  TrashRecord,
} from './types.ts';

export type HistoryRecordScope = 'general' | 'detailed' | 'transit' | 'trash';

export type HistoryChange =
  | {
      scope: HistoryRecordScope;
      op: 'insert';
      id: string;
      after: GeneralEntry | DetailedEntry | TransitEntry | TrashRecord;
    }
  | {
      scope: HistoryRecordScope;
      op: 'update';
      id: string;
      before: GeneralEntry | DetailedEntry | TransitEntry | TrashRecord;
      after: GeneralEntry | DetailedEntry | TransitEntry | TrashRecord;
    }
  | {
      scope: HistoryRecordScope;
      op: 'delete';
      id: string;
      before: GeneralEntry | DetailedEntry | TransitEntry | TrashRecord;
      index?: number;
    }
  | {
      scope: 'categories';
      before: CategoryStore;
      after: CategoryStore;
    }
  | {
      scope: 'packingMeta';
      key: string;
      before?: PackingStatusMeta;
      after?: PackingStatusMeta;
    };

export interface HistoryCommand {
  id: string;
  timestamp: string;
  labelFa: string;
  labelEn: string;
  user: string;
  changes: HistoryChange[];
}

export interface HistoryEntryPreview {
  id: string;
  timestamp: string;
  labelFa: string;
  labelEn: string;
  user: string;
  changeCount: number;
}

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  nextUndoLabelFa: string | null;
  nextUndoLabelEn: string | null;
  nextRedoLabelFa: string | null;
  nextRedoLabelEn: string | null;
  undoStack: HistoryEntryPreview[];
  redoStack: HistoryEntryPreview[];
}

export interface UndoableDatabaseSlice {
  general: GeneralEntry[];
  detailed: DetailedEntry[];
  transit: TransitEntry[];
  trash: TrashRecord[];
  categories: CategoryStore;
  packingMeta: Record<string, PackingStatusMeta>;
}

export interface ApplyHistoryResult {
  command: HistoryCommand;
  touchedScopes: Set<HistoryRecordScope | 'categories' | 'packingMeta'>;
}

function cloneObj<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val)) as T;
}

function getCollection(
  db: UndoableDatabaseSlice,
  scope: HistoryRecordScope,
): Array<{ id: string }> {
  return db[scope] as Array<{ id: string }>;
}

function applySingleChangeForward(
  db: UndoableDatabaseSlice,
  change: HistoryChange,
): void {
  if (change.scope === 'categories') {
    db.categories = cloneObj(change.after);
    return;
  }
  if (change.scope === 'packingMeta') {
    if (change.after === undefined) {
      delete db.packingMeta[change.key];
    } else {
      db.packingMeta[change.key] = cloneObj(change.after);
    }
    return;
  }

  const arr = getCollection(db, change.scope);
  if (change.op === 'insert') {
    const existingIdx = arr.findIndex((item) => item.id === change.id);
    if (existingIdx >= 0) {
      arr[existingIdx] = cloneObj(change.after);
    } else {
      arr.push(cloneObj(change.after));
    }
    return;
  }
  if (change.op === 'update') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr[idx] = cloneObj(change.after);
    } else {
      arr.push(cloneObj(change.after));
    }
    return;
  }
  if (change.op === 'delete') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
  }
}

function applySingleChangeReverse(
  db: UndoableDatabaseSlice,
  change: HistoryChange,
): void {
  if (change.scope === 'categories') {
    db.categories = cloneObj(change.before);
    return;
  }
  if (change.scope === 'packingMeta') {
    if (change.before === undefined) {
      delete db.packingMeta[change.key];
    } else {
      db.packingMeta[change.key] = cloneObj(change.before);
    }
    return;
  }

  const arr = getCollection(db, change.scope);
  if (change.op === 'insert') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
    return;
  }
  if (change.op === 'update') {
    const idx = arr.findIndex((item) => item.id === change.id);
    if (idx >= 0) {
      arr[idx] = cloneObj(change.before);
    } else {
      arr.push(cloneObj(change.before));
    }
    return;
  }
  if (change.op === 'delete') {
    const existingIdx = arr.findIndex((item) => item.id === change.id);
    if (existingIdx >= 0) {
      arr[existingIdx] = cloneObj(change.before);
    } else if (
      typeof change.index === 'number' &&
      change.index >= 0 &&
      change.index <= arr.length
    ) {
      arr.splice(change.index, 0, cloneObj(change.before));
    } else {
      arr.push(cloneObj(change.before));
    }
  }
}

/**
 * Delta-based in-memory Undo/Redo stack per project.
 * Stores only mutated records (insert/update/delete deltas), never cloning 25k+ rows.
 */
export class WarehouseHistoryManager {
  private undoStack: HistoryCommand[] = [];
  private redoStack: HistoryCommand[] = [];
  private readonly maxDepth: number;
  private seq = 0;

  constructor(maxDepth = 50) {
    this.maxDepth = Math.max(1, maxDepth);
  }

  public push(input: {
    labelFa: string;
    labelEn: string;
    user: string;
    changes: HistoryChange[];
  }): HistoryCommand | null {
    if (!input.changes || input.changes.length === 0) return null;
    this.seq += 1;
    const cmd: HistoryCommand = {
      id: `hist_${Date.now()}_${this.seq}`,
      timestamp: new Date().toISOString(),
      labelFa: input.labelFa,
      labelEn: input.labelEn,
      user: input.user || 'system',
      changes: input.changes.map((c) => cloneObj(c)),
    };
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    // Any new mutation clears the redo stack (standard Excel behavior)
    this.redoStack = [];
    return cmd;
  }

  public undo(db: UndoableDatabaseSlice): ApplyHistoryResult | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;

    const touchedScopes = new Set<HistoryRecordScope | 'categories' | 'packingMeta'>();
    // Apply reverse changes in reverse chronological order
    for (let i = cmd.changes.length - 1; i >= 0; i -= 1) {
      const ch = cmd.changes[i];
      applySingleChangeReverse(db, ch);
      touchedScopes.add(ch.scope);
    }

    this.redoStack.push(cmd);
    if (this.redoStack.length > this.maxDepth) {
      this.redoStack.shift();
    }
    return { command: cmd, touchedScopes };
  }

  public redo(db: UndoableDatabaseSlice): ApplyHistoryResult | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;

    const touchedScopes = new Set<HistoryRecordScope | 'categories' | 'packingMeta'>();
    // Apply forward changes in original order
    for (let i = 0; i < cmd.changes.length; i += 1) {
      const ch = cmd.changes[i];
      applySingleChangeForward(db, ch);
      touchedScopes.add(ch.scope);
    }

    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    return { command: cmd, touchedScopes };
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getStatus(previewLimit = 10): HistoryStatus {
    const topUndo = this.undoStack[this.undoStack.length - 1] || null;
    const topRedo = this.redoStack[this.redoStack.length - 1] || null;
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      nextUndoLabelFa: topUndo ? topUndo.labelFa : null,
      nextUndoLabelEn: topUndo ? topUndo.labelEn : null,
      nextRedoLabelFa: topRedo ? topRedo.labelFa : null,
      nextRedoLabelEn: topRedo ? topRedo.labelEn : null,
      undoStack: this.undoStack
        .slice(-previewLimit)
        .reverse()
        .map((c) => ({
          id: c.id,
          timestamp: c.timestamp,
          labelFa: c.labelFa,
          labelEn: c.labelEn,
          user: c.user,
          changeCount: c.changes.length,
        })),
      redoStack: this.redoStack
        .slice(-previewLimit)
        .reverse()
        .map((c) => ({
          id: c.id,
          timestamp: c.timestamp,
          labelFa: c.labelFa,
          labelEn: c.labelEn,
          user: c.user,
          changeCount: c.changes.length,
        })),
    };
  }
}
