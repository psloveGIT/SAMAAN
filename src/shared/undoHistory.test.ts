import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WarehouseHistoryManager, type UndoableDatabaseSlice } from './undoHistory.ts';
import type { CategoryStore, DetailedEntry, GeneralEntry, TrashRecord } from './types.ts';

function makeEmptyCategories(): CategoryStore {
  return {
    island: [],
    system: [],
    subSystem: [],
    unit: [],
    supplier: [],
    dispatchLocation: [],
    origin: [],
    storageLocation: [],
    carrierContractor: [],
    countingUnit: [],
    packageType: [],
    generalDescription: [],
    stocktakeStatus: [],
    transitStatus: ['در دست ارسال', 'در دست بازرسی', 'رسیده'],
    receiver: [],
    merStatus: [],
    repStatus: [],
    balanceStatus: [],
    chemicalType: [],
  };
}

function makeSlice(): UndoableDatabaseSlice {
  return {
    general: [],
    detailed: [],
    transit: [],
    trash: [],
    categories: makeEmptyCategories(),
    packingMeta: {},
  };
}

function makeDetailed(id: string, desc: string, packingQty = 10): DetailedEntry {
  return {
    id,
    rowNo: '1',
    island: 'A',
    system: 'SYS-1',
    subSystem: 'SUB-1',
    unit: 'U1',
    shipmentNo: 'PK-100',
    supplier: 'SUP-1',
    origin: 'IR',
    arrivalDate: '2026-01-01',
    packageNo: '1',
    itemNo: '1',
    description: desc,
    itemCode: 'ITEM-1',
    countingUnit: 'عدد',
    packingQty,
    stocktakeQty: packingQty,
    storageLocation: 'WH-1',
    generalDescription: 'Pipe',
    stocktakeStatus: '',
    receiver: 'Ali',
    merStatus: '',
    repStatus: '',
    balanceStatus: '',
    chemicalType: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin',
  } as unknown as DetailedEntry;
}

describe('WarehouseHistoryManager delta Undo/Redo', () => {
  it('undoes and redoes insert, update, and soft-delete (move to trash) cleanly', () => {
    const db = makeSlice();
    const history = new WarehouseHistoryManager(20);

    // 1. Insert detailed row
    const row1 = makeDetailed('d1', 'Pipe 8 inch', 12);
    db.detailed.push({ ...row1 });
    history.push({
      labelFa: 'ثبت ردیف جزئیات',
      labelEn: 'Create Detailed Row',
      user: 'admin',
      changes: [{ scope: 'detailed', op: 'insert', id: 'd1', after: row1 }],
    });

    assert.equal(history.getStatus().canUndo, true);
    assert.equal(history.getStatus().canRedo, false);

    // 2. Update detailed row
    const updatedRow1 = { ...row1, description: 'Pipe 10 inch', packingQty: 20 };
    db.detailed[0] = { ...updatedRow1 };
    history.push({
      labelFa: 'ویرایش ردیف جزئیات',
      labelEn: 'Edit Detailed Row',
      user: 'admin',
      changes: [{ scope: 'detailed', op: 'update', id: 'd1', before: row1, after: updatedRow1 }],
    });

    // 3. Soft-delete detailed row to trash
    const trashRec: TrashRecord = {
      id: 'tr1',
      scope: 'detailed',
      deletedAt: '2026-01-02T00:00:00.000Z',
      deletedBy: 'admin',
      targetLabel: 'PK-100 / Pipe 10 inch',
      data: updatedRow1,
    };
    db.detailed.splice(0, 1);
    db.trash.push({ ...trashRec });
    history.push({
      labelFa: 'حذف ردیف جزئیات',
      labelEn: 'Delete Detailed Row',
      user: 'admin',
      changes: [
        { scope: 'detailed', op: 'delete', id: 'd1', before: updatedRow1, index: 0 },
        { scope: 'trash', op: 'insert', id: 'tr1', after: trashRec },
      ],
    });

    assert.equal(db.detailed.length, 0);
    assert.equal(db.trash.length, 1);

    // Undo #1 -> restores row from trash back into detailed
    const u1 = history.undo(db);
    assert.ok(u1);
    assert.equal(db.detailed.length, 1);
    assert.equal(db.trash.length, 0);
    assert.equal(db.detailed[0].description, 'Pipe 10 inch');

    // Undo #2 -> reverts description back to Pipe 8 inch
    const u2 = history.undo(db);
    assert.ok(u2);
    assert.equal(db.detailed[0].description, 'Pipe 8 inch');
    assert.equal(db.detailed[0].packingQty, 12);

    // Undo #3 -> removes inserted row completely
    const u3 = history.undo(db);
    assert.ok(u3);
    assert.equal(db.detailed.length, 0);
    assert.equal(history.getStatus().canUndo, false);
    assert.equal(history.getStatus().canRedo, true);
    assert.equal(history.getStatus().redoCount, 3);

    // Redo #1 -> re-inserts Pipe 8 inch
    const r1 = history.redo(db);
    assert.ok(r1);
    assert.equal(db.detailed.length, 1);
    assert.equal(db.detailed[0].description, 'Pipe 8 inch');

    // Redo #2 -> re-applies edit Pipe 10 inch
    const r2 = history.redo(db);
    assert.ok(r2);
    assert.equal(db.detailed[0].description, 'Pipe 10 inch');

    // Pushing a new mutation clears remaining redo stack
    const row2 = makeDetailed('d2', 'Valve 4 inch', 5);
    db.detailed.push({ ...row2 });
    history.push({
      labelFa: 'ثبت شیرآلات',
      labelEn: 'Create Valve',
      user: 'admin',
      changes: [{ scope: 'detailed', op: 'insert', id: 'd2', after: row2 }],
    });
    assert.equal(history.getStatus().canRedo, false);
    assert.equal(history.getStatus().redoCount, 0);
  });

  it('undoes and redoes categories and general batch changes with maxDepth cap', () => {
    const db = makeSlice();
    const history = new WarehouseHistoryManager(2);

    const beforeCats = JSON.parse(JSON.stringify(db.categories)) as CategoryStore;
    db.categories.supplier.push('MAPNA');
    const afterCats = JSON.parse(JSON.stringify(db.categories)) as CategoryStore;

    history.push({
      labelFa: 'افزودن تامین‌کننده',
      labelEn: 'Add Supplier',
      user: 'admin',
      changes: [{ scope: 'categories', before: beforeCats, after: afterCats }],
    });

    const g1 = { id: 'g1', rowNo: '1', packingListNo: 'PK-1' } as GeneralEntry;
    const g2 = { id: 'g2', rowNo: '2', packingListNo: 'PK-2' } as GeneralEntry;
    db.general.push(g1);
    history.push({
      labelFa: 'ثبت پکینگ ۱',
      labelEn: 'Add Packing 1',
      user: 'admin',
      changes: [{ scope: 'general', op: 'insert', id: 'g1', after: g1 }],
    });
    db.general.push(g2);
    history.push({
      labelFa: 'ثبت پکینگ ۲',
      labelEn: 'Add Packing 2',
      user: 'admin',
      changes: [{ scope: 'general', op: 'insert', id: 'g2', after: g2 }],
    });

    // maxDepth = 2 -> only the last 2 actions are retained
    assert.equal(history.getStatus().undoCount, 2);
    history.undo(db);
    assert.equal(db.general.length, 1);
    assert.equal(db.general[0].id, 'g1');
  });

  it('auto-tracks operational sections (MIV + detailed cascade, Trash permanent delete, PackingMeta) and undoes/redoes cleanly', async () => {
    const {
      resolveAutoUndoSpec,
      captureAutoUndoState,
      commitAutoUndoDiff,
    } = await import('./undoHistory.ts');

    const db = makeSlice();
    db.mivDocuments = [];
    db.detailed.push(makeDetailed('d1', 'Valve 6 inch', 10));
    const history = new WarehouseHistoryManager(20);

    // 1. MIV creation that also mutates detailed.mivContractorQty
    const mivSpec = resolveAutoUndoSpec('POST', '/api/miv');
    assert.ok(mivSpec);
    const snap1 = captureAutoUndoState(db, history, mivSpec);
    db.mivDocuments.push({
      id: 'miv-1',
      mivNo: 'MIV-100',
      items: [{ detailedId: 'd1', issuedQty: 4 }],
    } as never);
    db.detailed[0].mivContractorQty = 4;
    const cmd1 = commitAutoUndoDiff(db, history, snap1, 'admin');
    assert.ok(cmd1);
    assert.equal(cmd1.changes.length, 2);

    // Undo MIV -> removes MIV doc AND restores detailed.mivContractorQty to undefined/null
    history.undo(db);
    assert.equal(db.mivDocuments.length, 0);
    assert.equal(db.detailed[0].mivContractorQty, undefined);

    // Redo MIV -> re-applies both
    history.redo(db);
    assert.equal(db.mivDocuments.length, 1);
    assert.equal(db.detailed[0].mivContractorQty, 4);

    // 2. Permanent delete from Trash
    db.trash.push({
      id: 'tr-perm-1',
      scope: 'detailed',
      deletedAt: '2026-01-01T00:00:00.000Z',
      deletedBy: 'admin',
      targetLabel: 'PK-100',
      data: makeDetailed('d99', 'Gasket', 2),
    });
    const delSpec = resolveAutoUndoSpec('DELETE', '/api/trash/tr-perm-1');
    assert.ok(delSpec);
    const snap2 = captureAutoUndoState(db, history, delSpec);
    db.trash.splice(0, 1);
    const cmd2 = commitAutoUndoDiff(db, history, snap2, 'admin');
    assert.ok(cmd2);
    assert.equal(db.trash.length, 0);

    history.undo(db);
    assert.equal(db.trash.length, 1);
    assert.equal(db.trash[0].id, 'tr-perm-1');

    // 3. Packing close
    const closeSpec = resolveAutoUndoSpec('POST', '/api/packing/PK-100/close');
    assert.ok(closeSpec);
    const snap3 = captureAutoUndoState(db, history, closeSpec);
    db.packingMeta['PK-100'] = {
      packingNo: 'PK-100',
      isClosed: true,
      closedAt: '2026-01-01T00:00:00.000Z',
      closedBy: 'admin',
    };
    const cmd3 = commitAutoUndoDiff(db, history, snap3, 'admin');
    assert.ok(cmd3);
    assert.equal(db.packingMeta['PK-100']?.isClosed, true);

    history.undo(db);
    assert.equal(db.packingMeta['PK-100'], undefined);
    history.redo(db);
    const reopenedMeta = db.packingMeta['PK-100' as string];
    assert.equal(reopenedMeta?.isClosed, true);
  });
});

