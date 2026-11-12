import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  DEFAULT_PREFERENCES,
  getSessionCookie,
  hashPassword,
  requireRole,
  sanitizeUser,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './src/server/auth.ts';
import type { AuthedRequest, StoredUser } from './src/server/auth.ts';
import {
  detectCsvScope,
  makeId,
  parseCsvMatrix,
  parseDetailedCsv,
  parseGeneralCsv,
  parseTransitCsv,
} from './src/server/csvImporter.ts';
import type { ImportScope } from './src/server/csvImporter.ts';
import { normKey, store } from './src/server/store.ts';
import {
  computeDetailedEntry,
  computeSelectionFormulaSummary,
} from './src/shared/formulas.ts';
import { getMonthKeyFromIso, normalizeDigits } from './src/shared/jalali.ts';
import type {
  CalendarMode,
  CategoryGroupKey,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  GeneralEntry,
  ShortageBackfillRecord,
  TransitEntry,
  UserPreferences,
  UserRole,
} from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

function matchSearch(haystackParts: (string | number | null | undefined)[], q: string): boolean {
  if (!q) return true;
  const needle = normalizeDigits(q).toLowerCase().trim();
  if (!needle) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const combined = normalizeDigits(
    haystackParts.filter((p) => p !== null && p !== undefined && p !== '').join(' '),
  ).toLowerCase();
  return tokens.every((tok) => combined.includes(tok));
}

function inDateRange(isoDate: string, fromDate: string, toDate: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!isoDate) return false;
  if (fromDate && isoDate < fromDate) return false;
  if (toDate && isoDate > toDate) return false;
  return true;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Attach authenticated user if valid cookie exists
  app.use((req: AuthedRequest, _res, next) => {
    const token = getSessionCookie(req);
    if (token) {
      const uid = verifySessionToken(token, store.db.sessionSecret);
      if (uid) {
        const found = store.db.users.find((u) => u.id === uid && u.active);
        if (found) req.currentUser = found;
      }
    }
    next();
  });

  // ---------------- AUTH & PREFERENCES ----------------
  app.get('/api/auth/status', (req: AuthedRequest, res: Response) => {
    res.json({
      needsSetup: store.db.users.length === 0,
      user: req.currentUser ? sanitizeUser(req.currentUser) : null,
    });
  });

  app.post('/api/auth/setup', (req: Request, res: Response) => {
    if (store.db.users.length > 0) {
      res.status(400).json({ error: 'System is already initialized' });
      return;
    }
    const { username, password, fullName, preferences } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      preferences?: Partial<UserPreferences>;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password || password.length < 4) {
      res.status(400).json({ error: 'Username and password (min 4 chars) are required' });
      return;
    }
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username: cleanUser,
      fullName: (fullName || cleanUser).trim(),
      role: 'admin',
      active: true,
      passwordHash: hashPassword(password),
      preferences: { ...DEFAULT_PREFERENCES, ...(preferences || {}) },
      createdAt: new Date().toISOString(),
    };
    store.db.users.push(newUser);
    store.addAudit({
      user: sanitizeUser(newUser),
      action: 'INITIAL_ADMIN_SETUP',
      scope: 'auth',
      targetId: newUser.id,
      summary: `راه‌اندازی اولیه سیستم و ایجاد مدیر کل (${newUser.username})`,
    });
    store.saveImmediate();
    const token = signSessionToken(newUser.id, store.db.sessionSecret);
    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const cleanUser = (username || '').trim().toLowerCase();
    const found = store.db.users.find((u) => u.username.toLowerCase() === cleanUser);
    if (!found || !found.active || !password || !verifyPassword(password, found.passwordHash)) {
      res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است / Invalid credentials' });
      return;
    }
    store.addAudit({
      user: sanitizeUser(found),
      action: 'LOGIN',
      scope: 'auth',
      targetId: found.id,
      summary: `ورود کاربر ${found.fullName} (${found.username})`,
    });
    store.saveImmediate();
    const token = signSessionToken(found.id, store.db.sessionSecret);
    setSessionCookie(res, token);
    res.json({ user: sanitizeUser(found) });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res: Response) => {
    if (req.currentUser) {
      store.addAudit({
        user: sanitizeUser(req.currentUser),
        action: 'LOGOUT',
        scope: 'auth',
        targetId: req.currentUser.id,
        summary: `خروج کاربر ${req.currentUser.fullName} (${req.currentUser.username})`,
      });
      store.saveImmediate();
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.patch('/api/auth/preferences', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const prefs = req.body as Partial<UserPreferences>;
    user.preferences = {
      ...user.preferences,
      ...(prefs.language ? { language: prefs.language } : {}),
      ...(prefs.calendar ? { calendar: prefs.calendar } : {}),
      ...(prefs.theme ? { theme: prefs.theme } : {}),
      ...(typeof prefs.eyeComfort === 'boolean' ? { eyeComfort: prefs.eyeComfort } : {}),
    };
    store.saveImmediate();
    res.json({ user: sanitizeUser(user) });
  });

  // ---------------- USERS (ADMIN ONLY) ----------------
  app.get('/api/users', requireRole(['admin']), (_req: AuthedRequest, res: Response) => {
    res.json({ users: store.db.users.map(sanitizeUser) });
  });

  app.post('/api/users', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const { username, password, fullName, role } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password || password.length < 4) {
      res.status(400).json({ error: 'Username and password (min 4 chars) are required' });
      return;
    }
    if (store.db.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      res.status(409).json({ error: 'نام کاربری تکراری است / Username already exists' });
      return;
    }
    const created: StoredUser = {
      id: crypto.randomUUID(),
      username: cleanUser,
      fullName: (fullName || cleanUser).trim(),
      role: role || 'operator',
      active: true,
      passwordHash: hashPassword(password),
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: new Date().toISOString(),
    };
    store.db.users.push(created);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_USER',
      scope: 'user',
      targetId: created.id,
      summary: `ایجاد کاربر جدید: ${created.username} با نقش ${created.role}`,
    });
    store.saveImmediate();
    res.json({ user: sanitizeUser(created) });
  });

  app.patch('/api/users/:id', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const target = store.db.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const { fullName, role, active, password } = req.body as {
      fullName?: string;
      role?: UserRole;
      active?: boolean;
      password?: string;
    };
    if (fullName !== undefined) target.fullName = fullName.trim();
    if (role !== undefined) target.role = role;
    if (typeof active === 'boolean') target.active = active;
    if (password && password.length >= 4) target.passwordHash = hashPassword(password);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_USER',
      scope: 'user',
      targetId: target.id,
      summary: `ویرایش حساب کاربری ${target.username} (نقش: ${target.role}، فعال: ${target.active ? 'بله' : 'خیر'})`,
    });
    store.saveImmediate();
    res.json({ user: sanitizeUser(target) });
  });

  // ---------------- PACKING CHECK & CLOSURE ----------------
  app.get('/api/packing/check', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(String(req.query.packingNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const rowNo = normalizeDigits(normKey(String(req.query.rowNo || '')));
    const scope = (String(req.query.scope || 'general') as 'general' | 'detailed' | 'transit');
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;

    const genMatches = packingNo ? store.generalByPacking.get(packingNo) || [] : [];
    const detMatches = packingNo ? store.detailedByPacking.get(packingNo) || [] : [];
    const transitMatches = packingNo ? store.transitByPacking.get(packingNo) || [] : [];
    const existingPackages = Array.from(
      new Set([
        ...genMatches.map((g) => normKey(g.packageNo)).filter(Boolean),
        ...detMatches.map((d) => normKey(d.packageNo)).filter(Boolean),
      ]),
    );
    const meta = packingNo ? store.db.packingMeta[packingNo] : undefined;

    res.json({
      packingNo,
      existsInGeneral: genMatches.length > 0,
      existsInDetailed: detMatches.length > 0,
      existsInTransit: transitMatches.length > 0,
      generalCount: genMatches.length,
      detailedCount: detMatches.length,
      existingPackages,
      packageExistsUnderPacking: packageNo ? existingPackages.includes(packageNo) : false,
      isClosed: Boolean(meta?.isClosed),
      closedAt: meta?.closedAt || null,
      closedBy: meta?.closedBy || null,
      rowNoTaken: rowNo ? store.isRowNoTaken(scope, rowNo, excludeId) : false,
      nextSuggestedRowNo: store.nextSuggestedRowNo(scope),
    });
  });

  app.post('/api/packing/:packingNo/close', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(req.params.packingNo);
    const { note } = req.body as { note?: string };
    const now = new Date().toISOString();
    store.db.packingMeta[packingNo] = {
      packingNo,
      isClosed: true,
      closedAt: now,
      closedBy: req.currentUser!.fullName || req.currentUser!.username,
      closureNote: (note || '').trim(),
    };
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CLOSE_PACKING',
      scope: 'packing',
      targetId: packingNo,
      summary: `اعلام رسیدن کامل و بستن پکینگ لیست ${packingNo}`,
    });
    store.saveImmediate();
    res.json({ meta: store.db.packingMeta[packingNo] });
  });

  app.post('/api/packing/:packingNo/reopen', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(req.params.packingNo);
    store.db.packingMeta[packingNo] = {
      packingNo,
      isClosed: false,
    };
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'REOPEN_PACKING',
      scope: 'packing',
      targetId: packingNo,
      summary: `بازگشایی وضعیت پکینگ لیست ${packingNo}`,
    });
    store.saveImmediate();
    res.json({ meta: store.db.packingMeta[packingNo] });
  });

  // ---------------- GENERAL (کلی) ----------------
  app.get('/api/general', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const island = String(req.query.island || '');
    const system = String(req.query.system || '');
    const subSystem = String(req.query.subSystem || '');
    const unit = String(req.query.unit || '');
    const supplier = String(req.query.supplier || '');
    const packingListNo = normKey(String(req.query.packingListNo || ''));
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));

    const filtered = store.db.general.filter((g) => {
      if (island && g.island !== island) return false;
      if (system && g.system !== system) return false;
      if (subSystem && g.subSystem !== subSystem) return false;
      if (unit && g.unit !== unit) return false;
      if (supplier && g.supplier !== supplier) return false;
      if (packingListNo && normKey(g.packingListNo) !== packingListNo) return false;
      if (!inDateRange(g.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          g.rowNo,
          g.packingListNo,
          g.packageNo,
          g.itemDescription,
          g.supplier,
          g.dispatchLocation,
          g.employerEntryMinutesNo,
          g.mapnaEntryMinutesNo,
          g.releaseNo,
          g.billOfLadingNo,
          g.vehicleNo,
          g.driverName,
          g.opiInvitationNo,
          g.island,
          g.system,
          g.subSystem,
          g.unit,
        ],
        q,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((g) => {
      const pk = normKey(g.packingListNo);
      const linkedDetails = pk ? store.detailedByPacking.get(pk) || [] : [];
      const detailedCount = linkedDetails.filter(
        (d) => !g.packageNo || normKey(d.packageNo) === normKey(g.packageNo),
      ).length;
      const hasShortage = linkedDetails.some((d) => computeDetailedEntry(d).hasShortage);
      return {
        ...g,
        packingClosed: Boolean(pk && store.db.packingMeta[pk]?.isClosed),
        detailedCount,
        hasLinkedShortage: hasShortage,
      };
    });

    const filteredSummary = computeSelectionFormulaSummary({ general: filtered });

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
      packingMeta: store.db.packingMeta,
    });
  });

  app.post('/api/general/batch', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      packingListNo,
      isContinuation,
      acknowledgeClosed,
      entries,
      detailedItems,
    } = req.body as {
      packingListNo?: string;
      isContinuation?: boolean;
      acknowledgeClosed?: boolean;
      entries?: Partial<GeneralEntry>[];
      detailedItems?: Partial<DetailedEntry>[];
    };

    const pk = normKey(packingListNo);
    if (!pk) {
      res.status(400).json({ error: 'شماره پکینگ لیست الزامی است / Packing List No. is required' });
      return;
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'حداقل یک نگله/آیتم باید ثبت شود / At least one package item is required' });
      return;
    }

    const existingGen = store.generalByPacking.get(pk) || [];
    const existingDet = store.detailedByPacking.get(pk) || [];
    const meta = store.db.packingMeta[pk];

    if (meta?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.',
      });
      return;
    }

    if ((existingGen.length > 0 || existingDet.length > 0) && !isContinuation) {
      res.status(409).json({
        code: 'DUPLICATE_PACKING_PROMPT',
        error: 'شماره پکینگ لیست تکراری است. آیا ادامه همان پکینگ لیست قبلی است؟',
      });
      return;
    }

    // Validate unique ردیف and distinct شماره نگله on continuation
    const existingPackages = new Set(existingGen.map((g) => normKey(g.packageNo)).filter(Boolean));
    const batchRowNos = new Set<string>();
    const preparedGeneral: GeneralEntry[] = [];
    const now = new Date().toISOString();

    for (const raw of entries) {
      const rowNo = normalizeDigits(normKey(raw.rowNo)) || store.nextSuggestedRowNo('general');
      if (store.isRowNoTaken('general', rowNo) || batchRowNos.has(rowNo)) {
        res.status(409).json({
          code: 'DUPLICATE_ROW_NO',
          error: `شماره ردیف ${rowNo} تکراری است. ستون ردیف باید یکتا باشد.`,
        });
        return;
      }
      batchRowNos.add(rowNo);

      const pkgNo = normKey(raw.packageNo);
      if (isContinuation && existingGen.length > 0 && (!pkgNo || existingPackages.has(pkgNo))) {
        res.status(409).json({
          code: 'DUPLICATE_PACKAGE_ON_CONTINUATION',
          error: `برای ادامه پکینگ لیست ${pk}، باید شماره نگله جدید و متفاوت وارد کنید (نگله «${pkgNo || '-'}» قبلاً ثبت شده است).`,
        });
        return;
      }

      preparedGeneral.push({
        id: makeId(),
        rowNo,
        arrivalDate: normKey(raw.arrivalDate),
        releaseNo: normKey(raw.releaseNo),
        releaseDate: normKey(raw.releaseDate),
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: normKey(raw.employerEntryMinutesNo),
        mapnaEntryMinutesNo: normKey(raw.mapnaEntryMinutesNo),
        packingListNo: pk,
        packageNo: pkgNo,
        itemDescription: normKey(raw.itemDescription),
        island: normKey(raw.island),
        system: normKey(raw.system),
        subSystem: normKey(raw.subSystem),
        unit: normKey(raw.unit),
        grossWeight: raw.grossWeight ?? null,
        netWeight: raw.netWeight ?? null,
        lengthCm: raw.lengthCm ?? null,
        widthCm: raw.widthCm ?? null,
        heightCm: raw.heightCm ?? null,
        billOfLadingNo: normKey(raw.billOfLadingNo),
        vehicleNo: normKey(raw.vehicleNo),
        weighbridgeWeight: raw.weighbridgeWeight ?? null,
        freightCost: raw.freightCost ?? null,
        opiInvitationNo: normKey(raw.opiInvitationNo),
        opiInvitationDate: normKey(raw.opiInvitationDate),
        driverName: normKey(raw.driverName),
        createdAt: now,
        updatedAt: now,
        createdBy: req.currentUser!.username,
      });
    }

    // Optional linked detailed items entered alongside General
    const preparedDetailed: DetailedEntry[] = [];
    const batchDetRowNos = new Set<string>();
    if (Array.isArray(detailedItems) && detailedItems.length > 0) {
      let autoCounter = Number(store.nextSuggestedRowNo('detailed'));
      for (const d of detailedItems) {
        let dRowNo = normalizeDigits(normKey(d.rowNo));
        if (!dRowNo) {
          while (store.isRowNoTaken('detailed', String(autoCounter)) || batchDetRowNos.has(String(autoCounter))) {
            autoCounter += 1;
          }
          dRowNo = String(autoCounter);
          autoCounter += 1;
        } else if (store.isRowNoTaken('detailed', dRowNo) || batchDetRowNos.has(dRowNo)) {
          res.status(409).json({
            code: 'DUPLICATE_ROW_NO',
            error: `شماره ردیف جزئیات ${dRowNo} تکراری است.`,
          });
          return;
        }
        batchDetRowNos.add(dRowNo);
        preparedDetailed.push({
          id: makeId(),
          rowNo: dRowNo,
          arrivalDate: normKey(d.arrivalDate || preparedGeneral[0].arrivalDate),
          supplier: normKey(d.supplier || preparedGeneral[0].supplier),
          origin: normKey(d.origin || preparedGeneral[0].dispatchLocation),
          shipmentNo: pk,
          packageNo: normKey(d.packageNo || preparedGeneral[0].packageNo),
          itemNo: normKey(d.itemNo),
          generalDescription: normKey(d.generalDescription || preparedGeneral[0].itemDescription),
          description: normKey(d.description || preparedGeneral[0].itemDescription),
          size: normKey(d.size),
          itemCode: normKey(d.itemCode),
          packingQty: d.packingQty ?? null,
          actualQty: d.actualQty ?? null,
          damagedQty: d.damagedQty ?? null,
          mtoRef: normKey(d.mtoRef),
          repNo: normKey(d.repNo),
          repStatus: normKey(d.repStatus),
          repDescription: normKey(d.repDescription),
          countingUnit: normKey(d.countingUnit),
          island: normKey(d.island || preparedGeneral[0].island),
          system: normKey(d.system || preparedGeneral[0].system),
          subSystem: normKey(d.subSystem || preparedGeneral[0].subSystem),
          unit: normKey(d.unit || preparedGeneral[0].unit),
          opiNo: normKey(d.opiNo || preparedGeneral[0].opiInvitationNo),
          opiDate: normKey(d.opiDate || preparedGeneral[0].opiInvitationDate),
          merNo: normKey(d.merNo),
          merStatus: normKey(d.merStatus),
          notes: normKey(d.notes),
          materialBalanceNo: normKey(d.materialBalanceNo),
          balanceStatus: normKey(d.balanceStatus),
          storageLocation: normKey(d.storageLocation),
          gcvReceiptNo: normKey(d.gcvReceiptNo),
          receiver: normKey(d.receiver),
          gcvDeliveredQty: d.gcvDeliveredQty ?? null,
          mivContractorNo: normKey(d.mivContractorNo),
          mivContractorDate: normKey(d.mivContractorDate),
          mivContractorQty: d.mivContractorQty ?? null,
          smrContractorNo: normKey(d.smrContractorNo),
          smrContractorDate: normKey(d.smrContractorDate),
          smrContractorQty: d.smrContractorQty ?? null,
          smrContractorNote: normKey(d.smrContractorNote),
          smrMapnaNo: normKey(d.smrMapnaNo),
          smrMapnaDate: normKey(d.smrMapnaDate),
          smrMapnaQty: d.smrMapnaQty ?? null,
          smrMapnaNote: normKey(d.smrMapnaNote),
          mivMapnaNo: normKey(d.mivMapnaNo),
          mivMapnaDate: normKey(d.mivMapnaDate),
          mivMapnaQty: d.mivMapnaQty ?? null,
          stocktakeInfo: normKey(d.stocktakeInfo),
          shortageBackfills: [],
          createdAt: now,
          updatedAt: now,
          createdBy: req.currentUser!.username,
        });
      }
    }

    store.db.general.unshift(...preparedGeneral);
    if (preparedDetailed.length > 0) {
      store.db.detailed.unshift(...preparedDetailed);
    }
    store.rebuildIndexes();

    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: isContinuation ? 'CONTINUE_PACKING_GENERAL' : 'CREATE_PACKING_GENERAL',
      scope: 'general',
      targetId: pk,
      summary: `${isContinuation ? 'ادامه ثبت روی پکینگ لیست' : 'ثبت پکینگ لیست جدید'} ${pk} (${preparedGeneral.length} ردیف جنرال${
        preparedDetailed.length > 0 ? ` + ${preparedDetailed.length} ردیف دیتیل` : ''
      })`,
    });
    store.saveImmediate();

    res.json({
      createdGeneral: preparedGeneral,
      createdDetailedCount: preparedDetailed.length,
      transitUpdated,
    });
  });

  app.patch('/api/general/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.general.find((g) => g.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const { acknowledgeClosed, ...patch } = req.body as Partial<GeneralEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.packingListNo ?? item.packingListNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.',
      });
      return;
    }
    if (patch.rowNo !== undefined) {
      const cleanRowNo = normalizeDigits(normKey(patch.rowNo));
      if (!cleanRowNo || store.isRowNoTaken('general', cleanRowNo, item.id)) {
        res.status(409).json({ error: 'شماره ردیف باید یکتا و غیرخالی باشد' });
        return;
      }
      item.rowNo = cleanRowNo;
    }

    Object.assign(item, {
      ...patch,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.rebuildIndexes();
    const transitUpdated = store.syncTransitArrival(item.packingListNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_GENERAL',
      scope: 'general',
      targetId: `${item.packingListNo} (#${item.rowNo})`,
      summary: `ویرایش ردیف جنرال شماره ${item.rowNo} در پکینگ لیست ${item.packingListNo}`,
    });
    store.saveImmediate();
    res.json({ item, transitUpdated });
  });

  app.delete('/api/general/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.general.findIndex((g) => g.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const [removed] = store.db.general.splice(idx, 1);
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_GENERAL',
      scope: 'general',
      targetId: `${removed.packingListNo} (#${removed.rowNo})`,
      summary: `حذف ردیف جنرال ${removed.rowNo} (${removed.packingListNo} / ${removed.packageNo})`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- DETAILED (دیتیل / جزئیات) ----------------
  app.get('/api/detailed', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const island = String(req.query.island || '');
    const system = String(req.query.system || '');
    const subSystem = String(req.query.subSystem || '');
    const unit = String(req.query.unit || '');
    const supplier = String(req.query.supplier || '');
    const storageLocation = String(req.query.storageLocation || '');
    const shipmentNo = normKey(String(req.query.shipmentNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const shortageOnly = String(req.query.shortageOnly || '') === 'true';
    const damagedOnly = String(req.query.damagedOnly || '') === 'true';
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));

    const computedAll: DetailedComputed[] = [];
    for (const d of store.db.detailed) {
      if (island && d.island !== island) continue;
      if (system && d.system !== system) continue;
      if (subSystem && d.subSystem !== subSystem) continue;
      if (unit && d.unit !== unit) continue;
      if (supplier && d.supplier !== supplier) continue;
      if (storageLocation && d.storageLocation !== storageLocation) continue;
      if (shipmentNo && normKey(d.shipmentNo) !== shipmentNo) continue;
      if (packageNo && normKey(d.packageNo) !== packageNo) continue;
      if (!inDateRange(d.arrivalDate, fromDate, toDate)) continue;
      if (
        !matchSearch(
          [
            d.rowNo,
            d.shipmentNo,
            d.packageNo,
            d.itemNo,
            d.generalDescription,
            d.description,
            d.itemCode,
            d.mtoRef,
            d.supplier,
            d.origin,
            d.island,
            d.system,
            d.subSystem,
            d.unit,
            d.opiNo,
            d.merNo,
            d.repNo,
            d.materialBalanceNo,
            d.balanceStatus,
            d.gcvReceiptNo,
            d.receiver,
            d.mivContractorNo,
            d.smrContractorNo,
            d.smrMapnaNo,
            d.mivMapnaNo,
            d.storageLocation,
          ],
          q,
        )
      ) {
        continue;
      }
      const comp = computeDetailedEntry(d);
      if (shortageOnly && !comp.hasShortage) continue;
      if (damagedOnly && !comp.hasDamaged) continue;
      computedAll.push(comp);
    }

    const total = computedAll.length;
    const start = (page - 1) * pageSize;
    const items = computedAll.slice(start, start + pageSize);
    const filteredSummary = computeSelectionFormulaSummary({ detailed: computedAll });

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
    });
  });

  app.post('/api/detailed', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { acknowledgeClosed, ...raw } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(raw.shipmentNo);
    if (!pk) {
      res.status(400).json({ error: 'شماره محموله / پکینگ لیست الزامی است' });
      return;
    }
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.',
      });
      return;
    }

    const rowNo = normalizeDigits(normKey(raw.rowNo)) || store.nextSuggestedRowNo('detailed');
    if (store.isRowNoTaken('detailed', rowNo)) {
      res.status(409).json({
        code: 'DUPLICATE_ROW_NO',
        error: `شماره ردیف ${rowNo} تکراری است. ستون ردیف باید یکتا باشد.`,
      });
      return;
    }

    const now = new Date().toISOString();
    const created: DetailedEntry = {
      id: makeId(),
      rowNo,
      arrivalDate: normKey(raw.arrivalDate),
      supplier: normKey(raw.supplier),
      origin: normKey(raw.origin),
      shipmentNo: pk,
      packageNo: normKey(raw.packageNo),
      itemNo: normKey(raw.itemNo),
      generalDescription: normKey(raw.generalDescription),
      description: normKey(raw.description),
      size: normKey(raw.size),
      itemCode: normKey(raw.itemCode),
      packingQty: raw.packingQty ?? null,
      actualQty: raw.actualQty ?? null,
      damagedQty: raw.damagedQty ?? null,
      mtoRef: normKey(raw.mtoRef),
      repNo: normKey(raw.repNo),
      repStatus: normKey(raw.repStatus),
      repDescription: normKey(raw.repDescription),
      countingUnit: normKey(raw.countingUnit),
      island: normKey(raw.island),
      system: normKey(raw.system),
      subSystem: normKey(raw.subSystem),
      unit: normKey(raw.unit),
      opiNo: normKey(raw.opiNo),
      opiDate: normKey(raw.opiDate),
      merNo: normKey(raw.merNo),
      merStatus: normKey(raw.merStatus),
      notes: normKey(raw.notes),
      materialBalanceNo: normKey(raw.materialBalanceNo),
      balanceStatus: normKey(raw.balanceStatus),
      storageLocation: normKey(raw.storageLocation),
      gcvReceiptNo: normKey(raw.gcvReceiptNo),
      receiver: normKey(raw.receiver),
      gcvDeliveredQty: raw.gcvDeliveredQty ?? null,
      mivContractorNo: normKey(raw.mivContractorNo),
      mivContractorDate: normKey(raw.mivContractorDate),
      mivContractorQty: raw.mivContractorQty ?? null,
      smrContractorNo: normKey(raw.smrContractorNo),
      smrContractorDate: normKey(raw.smrContractorDate),
      smrContractorQty: raw.smrContractorQty ?? null,
      smrContractorNote: normKey(raw.smrContractorNote),
      smrMapnaNo: normKey(raw.smrMapnaNo),
      smrMapnaDate: normKey(raw.smrMapnaDate),
      smrMapnaQty: raw.smrMapnaQty ?? null,
      smrMapnaNote: normKey(raw.smrMapnaNote),
      mivMapnaNo: normKey(raw.mivMapnaNo),
      mivMapnaDate: normKey(raw.mivMapnaDate),
      mivMapnaQty: raw.mivMapnaQty ?? null,
      stocktakeInfo: normKey(raw.stocktakeInfo),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };

    store.db.detailed.unshift(created);
    store.rebuildIndexes();
    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_DETAILED',
      scope: 'detailed',
      targetId: `${pk} (#${rowNo})`,
      summary: `ثبت آیتم جزئیات ردیف ${rowNo} برای محموله ${pk} (${created.description || created.generalDescription})`,
    });
    store.saveImmediate();
    res.json({ item: computeDetailedEntry(created), transitUpdated });
  });

  app.patch('/api/detailed/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const { acknowledgeClosed, ...patch } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.shipmentNo ?? item.shipmentNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.',
      });
      return;
    }
    if (patch.rowNo !== undefined) {
      const cleanRowNo = normalizeDigits(normKey(patch.rowNo));
      if (!cleanRowNo || store.isRowNoTaken('detailed', cleanRowNo, item.id)) {
        res.status(409).json({ error: 'شماره ردیف باید یکتا و غیرخالی باشد' });
        return;
      }
      item.rowNo = cleanRowNo;
    }

    Object.assign(item, {
      ...patch,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.rebuildIndexes();
    const transitUpdated = store.syncTransitArrival(item.shipmentNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_DETAILED',
      scope: 'detailed',
      targetId: `${item.shipmentNo} (#${item.rowNo})`,
      summary: `ویرایش آیتم جزئیات ردیف ${item.rowNo} (${item.shipmentNo})`,
    });
    store.saveImmediate();
    res.json({ item: computeDetailedEntry(item), transitUpdated });
  });

  // Shortage Backfill / Partial Recovery (even with duplicate/separate شماره محموله & later date)
  app.post('/api/detailed/:id/backfill', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const { qty, arrivalDate, shipmentNo, packageNo, note } = req.body as {
      qty?: number;
      arrivalDate?: string;
      shipmentNo?: string;
      packageNo?: string;
      note?: string;
    };
    if (!qty || !Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: 'تعداد جبران کسری باید بزرگتر از صفر باشد' });
      return;
    }
    const record: ShortageBackfillRecord = {
      id: crypto.randomUUID(),
      qty,
      arrivalDate: normKey(arrivalDate),
      shipmentNo: normKey(shipmentNo) || item.shipmentNo,
      packageNo: normKey(packageNo) || item.packageNo,
      note: normKey(note),
      recordedBy: req.currentUser!.fullName || req.currentUser!.username,
      recordedAt: new Date().toISOString(),
    };
    item.shortageBackfills = [...(item.shortageBackfills || []), record];
    item.updatedAt = new Date().toISOString();

    const computed = computeDetailedEntry(item);
    const transitUpdated = store.syncTransitArrival(record.shipmentNo, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'BACKFILL_SHORTAGE',
      scope: 'detailed',
      targetId: `${item.shipmentNo} (#${item.rowNo})`,
      summary: `جبران کسری به مقدار ${qty} برای ردیف ${item.rowNo} (شماره محموله جدید: ${record.shipmentNo}، کسری باقیمانده: ${computed.shortage})`,
    });
    store.saveImmediate();
    res.json({ item: computed, transitUpdated });
  });

  app.delete('/api/detailed/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.detailed.findIndex((d) => d.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const [removed] = store.db.detailed.splice(idx, 1);
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_DETAILED',
      scope: 'detailed',
      targetId: `${removed.shipmentNo} (#${removed.rowNo})`,
      summary: `حذف ردیف جزئیات ${removed.rowNo} (${removed.shipmentNo})`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- IN-TRANSIT (در راه) ----------------
  app.get('/api/transit', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const status = String(req.query.status || '');
    const supplier = String(req.query.supplier || '');
    const system = String(req.query.system || '');
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize || 50)));

    const filtered = store.db.transit.filter((t) => {
      if (status && t.overallStatus !== status) return false;
      if (supplier && t.supplier !== supplier) return false;
      if (system && t.system !== system) return false;
      if (!inDateRange(t.arrivalDate, fromDate, toDate)) return false;
      return matchSearch(
        [
          t.rowNo,
          t.overallStatus,
          t.packingListNo,
          t.packageNo,
          t.itemDescription,
          t.supplier,
          t.dispatchLocation,
          t.releaseNetNo,
          t.interimNo,
          t.system,
          t.subSystem,
          t.unit,
          t.equipmentSupplyCode,
          t.carrierContractor,
          t.billOfLadingNo,
        ],
        q,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    const filteredSummary = computeSelectionFormulaSummary({ transit: filtered });

    res.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      filteredSummary,
    });
  });

  app.post('/api/transit', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const raw = req.body as Partial<TransitEntry>;
    const rowNo = normalizeDigits(normKey(raw.rowNo)) || store.nextSuggestedRowNo('transit');
    if (store.isRowNoTaken('transit', rowNo)) {
      res.status(409).json({ error: `شماره ردیف ${rowNo} تکراری است` });
      return;
    }
    const now = new Date().toISOString();
    const pk = normKey(raw.packingListNo);
    const alreadyInWarehouse =
      pk && ((store.generalByPacking.get(pk)?.length || 0) > 0 || (store.detailedByPacking.get(pk)?.length || 0) > 0);

    const created: TransitEntry = {
      id: makeId(),
      rowNo,
      arrivalDate: normKey(raw.arrivalDate),
      overallStatus: alreadyInWarehouse ? 'رسیده' : normKey(raw.overallStatus) || 'در دست ارسال',
      inspectionRequest: normKey(raw.inspectionRequest),
      releaseNetNo: normKey(raw.releaseNetNo),
      releaseNetDate: normKey(raw.releaseNetDate),
      mapnaShippingNotice: normKey(raw.mapnaShippingNotice),
      interimNo: normKey(raw.interimNo),
      interimDate: normKey(raw.interimDate),
      supplier: normKey(raw.supplier),
      dispatchLocation: normKey(raw.dispatchLocation),
      packingListNo: pk,
      packageNo: normKey(raw.packageNo),
      itemDescription: normKey(raw.itemDescription),
      system: normKey(raw.system),
      subSystem: normKey(raw.subSystem),
      unit: normKey(raw.unit),
      equipmentSupplyCode: normKey(raw.equipmentSupplyCode),
      carrierContractor: normKey(raw.carrierContractor),
      billOfLadingNo: normKey(raw.billOfLadingNo),
      amount: raw.amount ?? null,
      linkedGeneralPackingNo: alreadyInWarehouse ? pk : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };

    store.db.transit.unshift(created);
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_TRANSIT',
      scope: 'transit',
      targetId: `${pk || rowNo}`,
      summary: `ثبت محموله در راه ${pk || rowNo} (${created.overallStatus})`,
    });
    store.saveImmediate();
    res.json({ item: created });
  });

  app.patch('/api/transit/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.transit.find((t) => t.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const patch = req.body as Partial<TransitEntry>;
    Object.assign(item, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_TRANSIT',
      scope: 'transit',
      targetId: `${item.packingListNo || item.rowNo}`,
      summary: `ویرایش محموله در راه ${item.packingListNo || item.rowNo} (${item.overallStatus})`,
    });
    store.saveImmediate();
    res.json({ item });
  });

  app.delete('/api/transit/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.transit.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const [removed] = store.db.transit.splice(idx, 1);
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_TRANSIT',
      scope: 'transit',
      targetId: `${removed.packingListNo || removed.rowNo}`,
      summary: `حذف ردیف در راه ${removed.packingListNo || removed.rowNo}`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- GLOBAL SEARCH ----------------
  app.get('/api/search', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(100, Number(req.query.limit || 40));
    if (!q) {
      res.json({ general: [], detailed: [], transit: [] });
      return;
    }
    const general = store.db.general
      .filter((g) =>
        matchSearch(
          [
            g.rowNo,
            g.packingListNo,
            g.packageNo,
            g.itemDescription,
            g.supplier,
            g.dispatchLocation,
            g.employerEntryMinutesNo,
            g.mapnaEntryMinutesNo,
            g.billOfLadingNo,
            g.driverName,
            g.island,
            g.system,
            g.subSystem,
          ],
          q,
        ),
      )
      .slice(0, limit);

    const detailed = store.db.detailed
      .filter((d) =>
        matchSearch(
          [
            d.rowNo,
            d.shipmentNo,
            d.packageNo,
            d.generalDescription,
            d.description,
            d.itemCode,
            d.mtoRef,
            d.supplier,
            d.gcvReceiptNo,
            d.mivContractorNo,
            d.smrContractorNo,
            d.materialBalanceNo,
            d.balanceStatus,
            d.storageLocation,
          ],
          q,
        ),
      )
      .slice(0, limit)
      .map(computeDetailedEntry);

    const transit = store.db.transit
      .filter((t) =>
        matchSearch(
          [
            t.rowNo,
            t.packingListNo,
            t.packageNo,
            t.itemDescription,
            t.supplier,
            t.overallStatus,
            t.releaseNetNo,
            t.interimNo,
            t.billOfLadingNo,
            t.carrierContractor,
          ],
          q,
        ),
      )
      .slice(0, limit);

    res.json({ general, detailed, transit });
  });

  // ---------------- CATEGORIES ----------------
  app.get('/api/categories', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const counts: Record<CategoryGroupKey, Record<string, number>> = {
      island: {},
      system: {},
      subSystem: {},
      unit: {},
      supplier: {},
      dispatchLocation: {},
      storageLocation: {},
      carrierContractor: {},
    };

    const bump = (group: CategoryGroupKey, v: string) => {
      const k = normKey(v);
      if (!k) return;
      counts[group][k] = (counts[group][k] || 0) + 1;
    };

    for (const g of store.db.general) {
      bump('island', g.island);
      bump('system', g.system);
      bump('subSystem', g.subSystem);
      bump('unit', g.unit);
      bump('supplier', g.supplier);
      bump('dispatchLocation', g.dispatchLocation);
    }
    for (const d of store.db.detailed) {
      bump('island', d.island);
      bump('system', d.system);
      bump('subSystem', d.subSystem);
      bump('unit', d.unit);
      bump('supplier', d.supplier);
      bump('dispatchLocation', d.origin);
      bump('storageLocation', d.storageLocation);
    }
    for (const t of store.db.transit) {
      bump('system', t.system);
      bump('subSystem', t.subSystem);
      bump('unit', t.unit);
      bump('supplier', t.supplier);
      bump('dispatchLocation', t.dispatchLocation);
      bump('carrierContractor', t.carrierContractor);
    }

    res.json({ categories: store.db.categories, counts });
  });

  app.post('/api/categories/:group', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const { value } = req.body as { value?: string };
    if (!store.db.categories[group] || !normKey(value)) {
      res.status(400).json({ error: 'Invalid category group or empty value' });
      return;
    }
    store.registerCategoryValue(group, value);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ADD_CATEGORY',
      scope: 'category',
      targetId: `${group}:${normKey(value)}`,
      summary: `افزودن دسته‌بندی «${normKey(value)}» در گروه ${group}`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories });
  });

  app.patch('/api/categories/:group', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const { oldValue, newValue } = req.body as { oldValue?: string; newValue?: string };
    const from = normKey(oldValue);
    const to = normKey(newValue);
    if (!store.db.categories[group] || !from || !to) {
      res.status(400).json({ error: 'Invalid rename parameters' });
      return;
    }

    // Update across all entries (supports both rename and merge)
    let updatedCount = 0;
    for (const g of store.db.general) {
      if (group === 'island' && g.island === from) { g.island = to; updatedCount += 1; }
      if (group === 'system' && g.system === from) { g.system = to; updatedCount += 1; }
      if (group === 'subSystem' && g.subSystem === from) { g.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && g.unit === from) { g.unit = to; updatedCount += 1; }
      if (group === 'supplier' && g.supplier === from) { g.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && g.dispatchLocation === from) { g.dispatchLocation = to; updatedCount += 1; }
    }
    for (const d of store.db.detailed) {
      if (group === 'island' && d.island === from) { d.island = to; updatedCount += 1; }
      if (group === 'system' && d.system === from) { d.system = to; updatedCount += 1; }
      if (group === 'subSystem' && d.subSystem === from) { d.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && d.unit === from) { d.unit = to; updatedCount += 1; }
      if (group === 'supplier' && d.supplier === from) { d.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && d.origin === from) { d.origin = to; updatedCount += 1; }
      if (group === 'storageLocation' && d.storageLocation === from) { d.storageLocation = to; updatedCount += 1; }
    }
    for (const t of store.db.transit) {
      if (group === 'system' && t.system === from) { t.system = to; updatedCount += 1; }
      if (group === 'subSystem' && t.subSystem === from) { t.subSystem = to; updatedCount += 1; }
      if (group === 'unit' && t.unit === from) { t.unit = to; updatedCount += 1; }
      if (group === 'supplier' && t.supplier === from) { t.supplier = to; updatedCount += 1; }
      if (group === 'dispatchLocation' && t.dispatchLocation === from) { t.dispatchLocation = to; updatedCount += 1; }
      if (group === 'carrierContractor' && t.carrierContractor === from) { t.carrierContractor = to; updatedCount += 1; }
    }

    store.db.categories[group] = store.db.categories[group].filter((v) => v !== from);
    store.registerCategoryValue(group, to);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'RENAME_MERGE_CATEGORY',
      scope: 'category',
      targetId: `${group}:${from}->${to}`,
      summary: `تغییر نام/ادغام «${from}» به «${to}» در ${group} (${updatedCount} رکورد به‌روزرسانی شد)`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories, updatedCount });
  });

  app.delete('/api/categories/:group', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const group = req.params.group as CategoryGroupKey;
    const value = normKey(String(req.query.value || ''));
    if (!store.db.categories[group] || !value) {
      res.status(400).json({ error: 'Invalid delete request' });
      return;
    }
    store.db.categories[group] = store.db.categories[group].filter((v) => v !== value);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_CATEGORY',
      scope: 'category',
      targetId: `${group}:${value}`,
      summary: `حذف مقدار «${value}» از فهرست ${group}`,
    });
    store.saveImmediate();
    res.json({ categories: store.db.categories });
  });

  // ---------------- ANALYTICS DASHBOARD ----------------
  app.get('/api/analytics', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const calendar = (String(req.query.calendar || 'jalali') as CalendarMode);
    const uniquePackings = new Set<string>();
    const uniquePackages = new Set<string>();
    let closedPackingsCount = 0;

    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) uniquePackings.add(pk);
      const ng = normKey(g.packageNo);
      if (ng) uniquePackages.add(`${pk}::${ng}`);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) uniquePackings.add(pk);
    }
    for (const pk of uniquePackings) {
      if (store.db.packingMeta[pk]?.isClosed) closedPackingsCount += 1;
    }

    const detailedComputed = store.getDetailedComputedList();
    const shortageItems = detailedComputed.filter((d) => d.hasShortage);
    const damagedItems = detailedComputed.filter((d) => d.hasDamaged);

    const generalSummary = computeSelectionFormulaSummary({ general: store.db.general });
    const detailedSummary = computeSelectionFormulaSummary({ detailed: detailedComputed });
    const transitSummary = computeSelectionFormulaSummary({ transit: store.db.transit });

    // Transit status breakdown
    const transitByStatus: Record<string, number> = {};
    for (const t of store.db.transit) {
      const st = normKey(t.overallStatus) || 'نامشخص';
      transitByStatus[st] = (transitByStatus[st] || 0) + 1;
    }

    // Island breakdown
    const byIslandMap: Record<string, { name: string; generalCount: number; detailedCount: number; shortageQty: number; mapnaStock: number; contractorStock: number }> = {};
    for (const g of store.db.general) {
      const isl = normKey(g.island) || 'سایر';
      if (!byIslandMap[isl]) {
        byIslandMap[isl] = { name: isl, generalCount: 0, detailedCount: 0, shortageQty: 0, mapnaStock: 0, contractorStock: 0 };
      }
      byIslandMap[isl].generalCount += 1;
    }
    for (const d of detailedComputed) {
      const isl = normKey(d.island) || 'سایر';
      if (!byIslandMap[isl]) {
        byIslandMap[isl] = { name: isl, generalCount: 0, detailedCount: 0, shortageQty: 0, mapnaStock: 0, contractorStock: 0 };
      }
      byIslandMap[isl].detailedCount += 1;
      byIslandMap[isl].shortageQty += d.shortage;
      byIslandMap[isl].mapnaStock += d.mapnaInventory;
      byIslandMap[isl].contractorStock += d.contractorInventory;
    }

    // Monthly arrival trend grouped in active calendar
    const monthBuckets: Record<string, { monthKey: string; generalRows: number; detailedRows: number; grossWeight: number }> = {};
    for (const g of store.db.general) {
      const mk = getMonthKeyFromIso(g.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) {
        monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      }
      monthBuckets[mk].generalRows += 1;
      monthBuckets[mk].grossWeight += g.grossWeight || 0;
    }
    for (const d of store.db.detailed) {
      const mk = getMonthKeyFromIso(d.arrivalDate, calendar);
      if (!mk) continue;
      if (!monthBuckets[mk]) {
        monthBuckets[mk] = { monthKey: mk, generalRows: 0, detailedRows: 0, grossWeight: 0 };
      }
      monthBuckets[mk].detailedRows += 1;
    }

    const monthlyTrend = Object.values(monthBuckets)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .slice(-12);

    res.json({
      counts: {
        generalRows: store.db.general.length,
        detailedRows: store.db.detailed.length,
        transitRows: store.db.transit.length,
        uniquePackings: uniquePackings.size,
        uniquePackages: uniquePackages.size,
        closedPackings: closedPackingsCount,
        shortageItemsCount: shortageItems.length,
        damagedItemsCount: damagedItems.length,
      },
      totals: {
        ...generalSummary,
        ...detailedSummary,
        transitAmountSum: transitSummary.transitAmountSum,
      },
      transitByStatus: Object.entries(transitByStatus).map(([status, count]) => ({ status, count })),
      byIsland: Object.values(byIslandMap).sort((a, b) => (b.generalCount + b.detailedCount) - (a.generalCount + a.detailedCount)).slice(0, 8),
      monthlyTrend,
      topShortages: shortageItems.slice(0, 8),
      topDamaged: damagedItems.slice(0, 8),
    });
  });

  // ---------------- CSV IMPORT ----------------
  app.post('/api/import/preview', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { csvText, scope, assumedCalendar } = req.body as {
      csvText?: string;
      scope?: ImportScope;
      assumedCalendar?: CalendarMode;
    };
    if (!csvText) {
      res.status(400).json({ error: 'CSV content is empty' });
      return;
    }
    const matrix = parseCsvMatrix(csvText);
    const detectedScope = scope || detectCsvScope(matrix) || 'general';
    const cal = assumedCalendar || 'jalali';

    if (detectedScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, req.currentUser!.username);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && store.isRowNoTaken('general', r.rowNo)).length;
      res.json({
        scope: 'general',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        duplicateRowNos,
        sample: parsed.rows.slice(0, 5),
      });
      return;
    }
    if (detectedScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, req.currentUser!.username);
      const duplicateRowNos = parsed.rows.filter((r) => r.rowNo && store.isRowNoTaken('detailed', r.rowNo)).length;
      res.json({
        scope: 'detailed',
        totalRows: parsed.rows.length,
        skippedEmpty: parsed.skippedEmpty,
        duplicateRowNos,
        sample: parsed.rows.slice(0, 5),
      });
      return;
    }

    const parsed = parseTransitCsv(matrix, cal, req.currentUser!.username);
    res.json({
      scope: 'transit',
      totalRows: parsed.rows.length,
      skippedEmpty: parsed.skippedEmpty,
      duplicateRowNos: 0,
      sample: parsed.rows.slice(0, 5),
    });
  });

  app.post('/api/import/commit', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { csvText, scope, assumedCalendar, duplicateRowPolicy } = req.body as {
      csvText?: string;
      scope?: ImportScope;
      assumedCalendar?: CalendarMode;
      duplicateRowPolicy?: 'auto_reassign' | 'skip';
    };
    if (!csvText) {
      res.status(400).json({ error: 'CSV content is empty' });
      return;
    }
    const matrix = parseCsvMatrix(csvText);
    const targetScope = scope || detectCsvScope(matrix) || 'general';
    const cal = assumedCalendar || 'jalali';
    const policy = duplicateRowPolicy || 'auto_reassign';

    let imported = 0;
    let skipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();

    if (targetScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, req.currentUser!.username);
      let nextAuto = Number(store.nextSuggestedRowNo('general'));
      const seen = new Set(store.generalRowNos);
      const newItems: GeneralEntry[] = [];

      for (const r of parsed.rows) {
        let rowNo = r.rowNo;
        if (!rowNo || seen.has(rowNo)) {
          if (policy === 'skip') {
            skipped += 1;
            continue;
          }
          while (seen.has(String(nextAuto))) nextAuto += 1;
          rowNo = String(nextAuto);
          nextAuto += 1;
        }
        seen.add(rowNo);
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        newItems.push({ ...r, rowNo, id: makeId() });
        imported += 1;
      }
      store.db.general.push(...newItems);
    } else if (targetScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, req.currentUser!.username);
      let nextAuto = Number(store.nextSuggestedRowNo('detailed'));
      const seen = new Set(store.detailedRowNos);
      const newItems: DetailedEntry[] = [];

      for (const r of parsed.rows) {
        let rowNo = r.rowNo;
        if (!rowNo || seen.has(rowNo)) {
          if (policy === 'skip') {
            skipped += 1;
            continue;
          }
          while (seen.has(String(nextAuto))) nextAuto += 1;
          rowNo = String(nextAuto);
          nextAuto += 1;
        }
        seen.add(rowNo);
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        newItems.push({ ...r, rowNo, id: makeId() });
        imported += 1;
      }
      store.db.detailed.push(...newItems);
    } else {
      const parsed = parseTransitCsv(matrix, cal, req.currentUser!.username);
      let nextAuto = Number(store.nextSuggestedRowNo('transit'));
      const seen = new Set(store.transitRowNos);
      const newItems: TransitEntry[] = [];

      for (const r of parsed.rows) {
        while (seen.has(String(nextAuto))) nextAuto += 1;
        const rowNo = String(nextAuto);
        seen.add(rowNo);
        nextAuto += 1;
        const pk = normKey(r.packingListNo);
        const alreadyArrived =
          pk &&
          ((store.generalByPacking.get(pk)?.length || 0) > 0 ||
            (store.detailedByPacking.get(pk)?.length || 0) > 0);
        newItems.push({
          ...r,
          rowNo,
          id: makeId(),
          overallStatus: alreadyArrived ? 'رسیده' : r.overallStatus,
          linkedGeneralPackingNo: alreadyArrived ? pk : undefined,
        });
        imported += 1;
      }
      store.db.transit.push(...newItems);
    }

    store.rebuildIndexes();
    for (const pk of touchedPackings) {
      transitAutoArrived += store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'IMPORT_CSV',
      scope: 'import',
      targetId: targetScope,
      summary: `ورود فایل CSV (${targetScope}): ${imported} ردیف ثبت شد، ${skipped} ردیف رد شد${
        transitAutoArrived > 0 ? `، ${transitAutoArrived} ردیف در راه به «رسیده» تغییر وضعیت داد` : ''
      }`,
    });
    store.saveImmediate();

    res.json({
      scope: targetScope,
      imported,
      skipped,
      transitAutoArrived,
    });
  });

  // ---------------- AUDIT LOG & BACKUP ----------------
  app.get('/api/audit', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '');
    const scope = String(req.query.scope || '');
    const username = String(req.query.username || '');
    const fromDate = String(req.query.fromDate || '');
    const toDate = String(req.query.toDate || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(20, Number(req.query.pageSize || 50)));

    const filtered = store.db.auditLogs.filter((log) => {
      if (scope && log.scope !== scope) return false;
      if (username && log.username !== username) return false;
      const dateOnly = log.timestamp.slice(0, 10);
      if (!inDateRange(dateOnly, fromDate, toDate)) return false;
      return matchSearch(
        [log.username, log.userFullName, log.action, log.scope, log.targetId, log.summary],
        q,
      );
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    res.json({
      items: filtered.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  app.get('/api/backup/snapshot', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json(store.exportSnapshot());
  });

  app.post('/api/backup/restore', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const snapshot = req.body as DatabaseSnapshot;
    if (!snapshot || (!Array.isArray(snapshot.general) && !Array.isArray(snapshot.detailed))) {
      res.status(400).json({ error: 'Invalid backup snapshot format' });
      return;
    }
    store.restoreSnapshot(snapshot, sanitizeUser(req.currentUser!));
    res.json({
      ok: true,
      counts: {
        general: store.db.general.length,
        detailed: store.db.detailed.length,
        transit: store.db.transit.length,
      },
    });
  });

  // ---------------- VITE / STATIC SERVING ----------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SAMAAN server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SAMAAN server:', err);
  process.exit(1);
});
