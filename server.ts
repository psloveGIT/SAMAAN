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
  roundQty,
  toNum,
} from './src/shared/formulas.ts';
import { getMonthKeyFromIso, normalizeDigits } from './src/shared/jalali.ts';
import { formatGeneralDescriptionCase, inferGeneralDescription } from './src/shared/generalDescription.ts';
import type {
  CalendarMode,
  CategoryGroupKey,
  DatabaseSnapshot,
  DetailedComputed,
  DetailedEntry,
  DocumentLineItem,
  GcvDocumentRecord,
  GeneralEntry,
  Language,
  MivDocType,
  MivDocumentRecord,
  OpiInvitationRecord,
  OpiMinutesRecord,
  OsdrReportItem,
  OsdrReportRecord,
  ShortageBackfillRecord,
  SiteEntryMinutesRecord,
  SubstitutionRecord,
  TransitEntry,
  TrashRecord,
  UserPreferences,
  UserRole,
} from './src/shared/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

function reqLang(req: Request): Language {
  const h = String(req.headers['x-samaan-lang'] || '').toLowerCase();
  return h === 'en' ? 'en' : 'fa';
}

function errMsg(req: Request, fa: string, en: string): string {
  return reqLang(req) === 'en' ? en : fa;
}

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

function appendUniqueRef(existing: string, nextRef: string): string {
  const cleanExisting = normKey(existing);
  const cleanNext = normKey(nextRef);
  if (!cleanNext) return cleanExisting;
  if (!cleanExisting) return cleanNext;
  const parts = cleanExisting.split(',').map((s) => s.trim());
  if (parts.includes(cleanNext)) return cleanExisting;
  return `${cleanExisting}, ${cleanNext}`;
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
      res.status(400).json({ error: errMsg(req, 'سامانه قبلاً راه‌اندازی شده است', 'System is already initialized') });
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
      res.status(400).json({
        error: errMsg(req, 'نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
      });
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
      res.status(401).json({ error: errMsg(req, 'نام کاربری یا رمز عبور اشتباه است', 'Invalid username or password') });
      return;
    }
    found.lastLoginAt = new Date().toISOString();
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

  app.post('/api/auth/change-password', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: errMsg(req, 'رمز عبور فعلی صحیح نیست', 'Current password is incorrect') });
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: errMsg(req, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد', 'New password must be at least 4 characters') });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    store.addAudit({
      user: sanitizeUser(user),
      action: 'CHANGE_OWN_PASSWORD',
      scope: 'auth',
      targetId: user.id,
      summary: `تغییر رمز عبور توسط کاربر ${user.fullName} (${user.username})`,
    });
    store.saveImmediate();
    res.json({ ok: true, user: sanitizeUser(user) });
  });

  // ---------------- USERS (ADMIN ONLY) ----------------
  app.get('/api/users', requireRole(['admin']), (_req: AuthedRequest, res: Response) => {
    res.json({ users: store.db.users.map(sanitizeUser) });
  });

  app.post('/api/users', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const { username, password, fullName, role, active, mustChangePassword } = req.body as {
      username?: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
      active?: boolean;
      mustChangePassword?: boolean;
    };
    const cleanUser = (username || '').trim().toLowerCase();
    if (!cleanUser || !password || password.length < 4) {
      res.status(400).json({
        error: errMsg(req, 'نام کاربری و رمز عبور (حداقل ۴ کاراکتر) الزامی است', 'Username and password (min 4 chars) are required'),
      });
      return;
    }
    if (store.db.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      res.status(409).json({ error: errMsg(req, 'نام کاربری تکراری است', 'Username already exists') });
      return;
    }
    const created: StoredUser = {
      id: crypto.randomUUID(),
      username: cleanUser,
      fullName: (fullName || cleanUser).trim(),
      role: role || 'operator',
      active: typeof active === 'boolean' ? active : true,
      mustChangePassword: Boolean(mustChangePassword),
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
      res.status(404).json({ error: errMsg(req, 'کاربر یافت نشد', 'User not found') });
      return;
    }
    const { username, fullName, role, active, password, mustChangePassword } = req.body as {
      username?: string;
      fullName?: string;
      role?: UserRole;
      active?: boolean;
      password?: string;
      mustChangePassword?: boolean;
    };

    const nextRole = role ?? target.role;
    const nextActive = typeof active === 'boolean' ? active : target.active;
    if (target.id === req.currentUser!.id && (nextRole !== 'admin' || !nextActive)) {
      res.status(400).json({
        error: errMsg(
          req,
          'امکان غیرفعال‌سازی یا تغییر نقش حساب کاربری خودتان وجود ندارد',
          'Cannot deactivate or demote your own account',
        ),
      });
      return;
    }
    if (target.role === 'admin' && target.active && (nextRole !== 'admin' || !nextActive)) {
      const otherActiveAdmins = store.db.users.filter(
        (u) => u.id !== target.id && u.role === 'admin' && u.active,
      );
      if (otherActiveAdmins.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'حداقل یک مدیر کل فعال باید در سامانه باقی بماند',
            'At least one active admin must remain',
          ),
        });
        return;
      }
    }

    if (username !== undefined) {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        res.status(400).json({ error: errMsg(req, 'نام کاربری نمی‌تواند خالی باشد', 'Username cannot be empty') });
        return;
      }
      if (store.db.users.some((u) => u.id !== target.id && u.username.toLowerCase() === cleanUsername)) {
        res.status(409).json({ error: errMsg(req, 'نام کاربری تکراری است', 'Username already exists') });
        return;
      }
      target.username = cleanUsername;
    }
    if (fullName !== undefined) target.fullName = fullName.trim() || target.username;
    if (role !== undefined) target.role = role;
    if (typeof active === 'boolean') target.active = active;
    if (typeof mustChangePassword === 'boolean') target.mustChangePassword = mustChangePassword;

    let passwordReset = false;
    if (password !== undefined && password !== '') {
      if (password.length < 4) {
        res.status(400).json({
          error: errMsg(req, 'رمز عبور باید حداقل ۴ کاراکتر باشد', 'Password must be at least 4 characters'),
        });
        return;
      }
      target.passwordHash = hashPassword(password);
      passwordReset = true;
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: passwordReset ? 'ADMIN_RESET_PASSWORD' : 'UPDATE_USER',
      scope: 'user',
      targetId: target.id,
      summary: passwordReset
        ? `تغییر رمز عبور کاربر ${target.username} توسط مدیر`
        : `ویرایش حساب کاربری ${target.username} (نقش: ${target.role}، فعال: ${target.active ? 'بله' : 'خیر'})`,
    });
    store.saveImmediate();
    res.json({ user: sanitizeUser(target) });
  });

  app.delete('/api/users/:id', requireRole(['admin']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'کاربر یافت نشد', 'User not found') });
      return;
    }
    const target = store.db.users[idx];
    if (target.id === req.currentUser!.id) {
      res.status(400).json({
        error: errMsg(req, 'امکان حذف حساب کاربری خودتان وجود ندارد', 'Cannot delete your own account'),
      });
      return;
    }
    if (target.role === 'admin' && target.active) {
      const otherActiveAdmins = store.db.users.filter(
        (u) => u.id !== target.id && u.role === 'admin' && u.active,
      );
      if (otherActiveAdmins.length === 0) {
        res.status(400).json({
          error: errMsg(
            req,
            'حداقل یک مدیر کل فعال باید در سامانه باقی بماند',
            'Cannot delete the last active admin',
          ),
        });
        return;
      }
    }

    store.db.users.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_USER',
      scope: 'user',
      targetId: target.id,
      summary: `حذف حساب کاربری ${target.fullName} (${target.username})`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- PACKING CHECK, LOOKUP & CLOSURE ----------------
  app.get('/api/packing/check', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(String(req.query.packingNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const itemNo = normalizeDigits(normKey(String(req.query.itemNo || '')));
    const mapnaMinutesNo = normalizeDigits(normKey(String(req.query.mapnaMinutesNo || '')));
    const scope = (String(req.query.scope || 'general') as 'general' | 'detailed' | 'transit');
    const excludeId = req.query.excludeId ? String(req.query.excludeId) : undefined;

    const genMatches = packingNo ? store.generalByPacking.get(packingNo) || [] : [];
    const detMatches = packingNo ? store.detailedByPacking.get(packingNo) || [] : [];
    const transitMatches = packingNo ? store.transitByPacking.get(packingNo) || [] : [];
    const generalPackages = Array.from(new Set(genMatches.map((g) => normKey(g.packageNo)).filter(Boolean)));
    const existingPackages = Array.from(
      new Set([
        ...generalPackages,
        ...detMatches.map((d) => normKey(d.packageNo)).filter(Boolean),
      ]),
    );
    const meta = packingNo ? store.db.packingMeta[packingNo] : undefined;
    const linkedGeneral = packingNo ? store.getGeneralSharedInfo(packingNo, packageNo) : null;

    res.json({
      packingNo,
      existsInGeneral: genMatches.length > 0,
      existsInDetailed: detMatches.length > 0,
      existsInTransit: transitMatches.length > 0,
      generalCount: genMatches.length,
      detailedCount: detMatches.length,
      generalPackages,
      existingPackages,
      packageExistsUnderPacking: packageNo ? generalPackages.includes(packageNo) : false,
      isClosed: Boolean(meta?.isClosed),
      closedAt: meta?.closedAt || null,
      closedBy: meta?.closedBy || null,
      mapnaMinutesTaken: mapnaMinutesNo ? store.isMapnaMinutesTaken(mapnaMinutesNo, excludeId) : false,
      itemNoTaken: packingNo && itemNo ? store.isDetailedItemNoTaken(packingNo, packageNo, itemNo, excludeId) : false,
      nextSuggestedItemNo: packingNo ? store.getNextSuggestedItemNo(packingNo, packageNo) : '1',
      linkedGeneral,
      lastDetailedDefaults: store.getLastDetailedDefaults(),
      rowNoTaken: false,
      nextSuggestedRowNo: store.nextSuggestedRowNo(scope),
    });
  });

  app.get('/api/general/lookup', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const packingNo = normKey(String(req.query.packingNo || ''));
    const packageNo = normKey(String(req.query.packageNo || ''));
    const packings = Array.from(store.generalByPacking.keys()).sort((a, b) => a.localeCompare(b, 'fa'));
    const shared = packingNo ? store.getGeneralSharedInfo(packingNo, packageNo) : null;
    res.json({
      packings,
      packagesForPacking: shared?.packagesForPacking || [],
      shared,
      lastDetailedDefaults: store.getLastDetailedDefaults(),
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
      const pkg = normKey(g.packageNo);
      const linkedDetails = pk ? store.detailedByPacking.get(pk) || [] : [];
      const matchingPkgDetails = linkedDetails.filter(
        (d) => !pkg || normKey(d.packageNo) === pkg,
      );
      const hasShortage = matchingPkgDetails.some((d) => computeDetailedEntry(d).hasShortage);
      return {
        ...g,
        packingClosed: Boolean(pk && store.db.packingMeta[pk]?.isClosed),
        detailedCount: matchingPkgDetails.length,
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
    } = req.body as {
      packingListNo?: string;
      isContinuation?: boolean;
      acknowledgeClosed?: boolean;
      entries?: Partial<GeneralEntry>[];
    };

    const pk = normKey(packingListNo);
    if (!pk) {
      res.status(400).json({ error: errMsg(req, 'شماره پکینگ لیست الزامی است', 'Packing List No. is required') });
      return;
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک نگله باید ثبت شود', 'At least one package entry is required') });
      return;
    }

    // Check duplicates in GENERAL only (so deleting from General allows re-entry even if Detailed items remain)
    const existingGen = store.generalByPacking.get(pk) || [];
    const meta = store.db.packingMeta[pk];

    if (meta?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    if (existingGen.length > 0 && !isContinuation) {
      res.status(409).json({
        code: 'DUPLICATE_PACKING_PROMPT',
        error: errMsg(
          req,
          'شماره پکینگ لیست تکراری است. آیا ادامه همان پکینگ لیست قبلی است؟',
          'Duplicate Packing List No. Is this a continuation of the existing Packing List?',
        ),
      });
      return;
    }

    const existingPackages = new Set(existingGen.map((g) => normKey(g.packageNo)).filter(Boolean));
    const batchMapnaMinutes = new Set<string>();
    const preparedGeneral: GeneralEntry[] = [];
    const now = new Date().toISOString();

    for (const raw of entries) {
      const pkgNo = normKey(raw.packageNo);
      if (isContinuation && existingGen.length > 0 && (!pkgNo || existingPackages.has(pkgNo))) {
        res.status(409).json({
          code: 'DUPLICATE_PACKAGE_ON_CONTINUATION',
          error: errMsg(
            req,
            `برای ادامه پکینگ لیست ${pk}، باید شماره نگله جدید و متفاوت وارد کنید (نگله «${pkgNo || '-'}» قبلاً ثبت شده است).`,
            `Continuation under Packing List ${pk} requires a new Package No. ("${pkgNo || '-'}" already exists).`,
          ),
        });
        return;
      }

      const cleanMapnaMinutes = normalizeDigits(normKey(raw.mapnaEntryMinutesNo));
      if (cleanMapnaMinutes) {
        const lowerKey = cleanMapnaMinutes.toLowerCase();
        if (store.isMapnaMinutesTaken(cleanMapnaMinutes) || batchMapnaMinutes.has(lowerKey)) {
          res.status(409).json({
            code: 'DUPLICATE_MAPNA_MINUTES',
            error: errMsg(
              req,
              `شماره صورتجلسه ورود مپنا «${cleanMapnaMinutes}» تکراری است و قبلاً ثبت شده است.`,
              `MAPNA Entry Minutes No. "${cleanMapnaMinutes}" already exists and must be unique.`,
            ),
          });
          return;
        }
        batchMapnaMinutes.add(lowerKey);
      }

      const cleanArrival = normKey(raw.arrivalDate);
      const cleanReleaseNo = normKey(raw.releaseNo);
      const cleanReleaseDate = cleanReleaseNo ? (normKey(raw.releaseDate) || cleanArrival) : cleanArrival;
      const parsedItemCount =
        raw.itemCount !== undefined && raw.itemCount !== null && Number.isFinite(Number(raw.itemCount)) && Number(raw.itemCount) > 0
          ? Math.floor(Number(raw.itemCount))
          : null;

      preparedGeneral.push({
        id: makeId(),
        rowNo: '0',
        arrivalDate: cleanArrival,
        releaseNo: cleanReleaseNo,
        releaseDate: cleanReleaseDate,
        supplier: normKey(raw.supplier),
        dispatchLocation: normKey(raw.dispatchLocation),
        employerEntryMinutesNo: normKey(raw.employerEntryMinutesNo),
        mapnaEntryMinutesNo: cleanMapnaMinutes,
        packingListNo: pk,
        packageNo: pkgNo,
        itemCount: parsedItemCount,
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

    store.db.general.unshift(...preparedGeneral);
    store.renumberScope('general');
    store.rebuildIndexes();

    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: isContinuation ? 'CONTINUE_PACKING_GENERAL' : 'CREATE_PACKING_GENERAL',
      scope: 'general',
      targetId: pk,
      summary: `${isContinuation ? 'ادامه ثبت روی پکینگ لیست' : 'ثبت پکینگ لیست جدید'} ${pk} (${preparedGeneral.length} ردیف جنرال)`,
    });
    store.saveImmediate();

    res.json({
      createdGeneral: preparedGeneral,
      createdDetailedCount: 0,
      transitUpdated,
    });
  });

  app.patch('/api/general/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.general.find((g) => g.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...patch } = req.body as Partial<GeneralEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.packingListNo ?? item.packingListNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    if (patch.mapnaEntryMinutesNo !== undefined) {
      const cleanMapnaMinutes = normalizeDigits(normKey(patch.mapnaEntryMinutesNo));
      if (cleanMapnaMinutes && store.isMapnaMinutesTaken(cleanMapnaMinutes, item.id)) {
        res.status(409).json({
          code: 'DUPLICATE_MAPNA_MINUTES',
          error: errMsg(
            req,
            `شماره صورتجلسه ورود مپنا «${cleanMapnaMinutes}» تکراری است.`,
            `MAPNA Entry Minutes No. "${cleanMapnaMinutes}" already exists.`,
          ),
        });
        return;
      }
      patch.mapnaEntryMinutesNo = cleanMapnaMinutes;
    }

    const finalArrival = normKey(patch.arrivalDate ?? item.arrivalDate);
    const finalReleaseNo = normKey(patch.releaseNo ?? item.releaseNo);
    const finalReleaseDate = finalReleaseNo
      ? (normKey(patch.releaseDate ?? item.releaseDate) || finalArrival)
      : finalArrival;

    if (patch.itemCount !== undefined) {
      patch.itemCount =
        patch.itemCount !== null && Number.isFinite(Number(patch.itemCount)) && Number(patch.itemCount) > 0
          ? Math.floor(Number(patch.itemCount))
          : null;
    }

    Object.assign(item, {
      ...patch,
      releaseNo: finalReleaseNo,
      releaseDate: finalReleaseDate,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.renumberScope('general');
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
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const cascadeDetailed = String(req.query.cascadeDetailed || '') === 'true';
    const [removed] = store.db.general.splice(idx, 1);
    const now = new Date().toISOString();
    const deletedBy = req.currentUser!.fullName || req.currentUser!.username;

    const trashEntry: TrashRecord = {
      id: makeId(),
      scope: 'general',
      deletedAt: now,
      deletedBy,
      targetLabel: `${removed.packingListNo || '-'} (${removed.packageNo || '-'})`,
      data: removed,
    };
    store.db.trash.unshift(trashEntry);

    let trashedDetailedCount = 0;
    if (cascadeDetailed) {
      const pk = normKey(removed.packingListNo);
      const pkg = normKey(removed.packageNo);
      const remainingDetailed: DetailedEntry[] = [];
      for (const d of store.db.detailed) {
        const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
        if (matches) {
          trashedDetailedCount += 1;
          store.db.trash.unshift({
            id: makeId(),
            scope: 'detailed',
            deletedAt: now,
            deletedBy,
            targetLabel: `${d.shipmentNo} / ${d.packageNo || '-'} / #${d.itemNo || d.rowNo}`,
            data: d,
          });
        } else {
          remainingDetailed.push(d);
        }
      }
      if (trashedDetailedCount > 0) {
        store.db.detailed = remainingDetailed;
        store.renumberScope('detailed');
      }
    }

    store.renumberScope('general');
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_GENERAL',
      scope: 'general',
      targetId: `${removed.packingListNo} (#${removed.rowNo})`,
      summary: `انتقال ردیف جنرال ${removed.rowNo} (${removed.packingListNo} / ${removed.packageNo || '-'}) به سطل بازیافت${
        trashedDetailedCount > 0 ? ` همراه با ${trashedDetailedCount} ردیف جزئیات` : ''
      }`,
    });
    store.saveImmediate();
    res.json({ ok: true, trashedDetailedCount });
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
            d.stocktakeStatus,
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
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...raw } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(raw.shipmentNo);
    if (!pk) {
      res.status(400).json({ error: errMsg(req, 'شماره محموله / پکینگ لیست الزامی است', 'Shipment / Packing List No. is required') });
      return;
    }
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    const pkgNo = normKey(raw.packageNo);
    const itemNo = normalizeDigits(normKey(raw.itemNo)) || store.getNextSuggestedItemNo(pk, pkgNo);
    if (store.isDetailedItemNoTaken(pk, pkgNo, itemNo)) {
      res.status(409).json({
        code: 'DUPLICATE_ITEM_NO',
        error: errMsg(
          req,
          `شماره آیتم ${itemNo} برای پکینگ «${pk}» و نگله «${pkgNo || '-'}» تکراری است.`,
          `Item No. ${itemNo} already exists for Packing "${pk}" and Package "${pkgNo || '-'}".`,
        ),
      });
      return;
    }

    const shared = store.getGeneralSharedInfo(pk, pkgNo);
    const now = new Date().toISOString();
    const cleanDescription = normKey(raw.description);
    const rawGenDesc = normKey(raw.generalDescription);
    const resolvedGeneralDesc = rawGenDesc
      ? formatGeneralDescriptionCase(rawGenDesc)
      : inferGeneralDescription(cleanDescription);

    const created: DetailedEntry = {
      id: makeId(),
      rowNo: '0',
      arrivalDate: normKey(raw.arrivalDate) || shared?.arrivalDate || '',
      supplier: normKey(raw.supplier) || shared?.supplier || '',
      origin: normKey(raw.origin) || shared?.dispatchLocation || '',
      shipmentNo: pk,
      packageNo: pkgNo,
      itemNo,
      generalDescription: resolvedGeneralDesc,
      description: cleanDescription,
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
      island: normKey(raw.island) || shared?.island || '',
      system: normKey(raw.system) || shared?.system || '',
      subSystem: normKey(raw.subSystem) || shared?.subSystem || '',
      unit: normKey(raw.unit) || shared?.unit || '',
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
      stocktakeStatus: normKey(raw.stocktakeStatus),
      stocktakeDate: normKey(raw.stocktakeDate),
      shortageBackfills: [],
      createdAt: now,
      updatedAt: now,
      createdBy: req.currentUser!.username,
    };

    store.db.detailed.unshift(created);
    store.renumberScope('detailed');
    store.rebuildIndexes();
    const transitUpdated = store.syncTransitArrival(pk, sanitizeUser(req.currentUser!));
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_DETAILED',
      scope: 'detailed',
      targetId: `${pk} / ${pkgNo || '-'} (#${itemNo})`,
      summary: `ثبت آیتم جزئیات ردیف ${created.rowNo} (آیتم ${itemNo}) برای محموله ${pk} (${created.description || created.generalDescription})`,
    });
    store.saveImmediate();
    res.json({ item: computeDetailedEntry(created), transitUpdated });
  });

  app.patch('/api/detailed/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.detailed.find((d) => d.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { acknowledgeClosed, rowNo: _ignoredRowNo, ...patch } = req.body as Partial<DetailedEntry> & {
      acknowledgeClosed?: boolean;
    };
    const pk = normKey(patch.shipmentNo ?? item.shipmentNo);
    if (store.db.packingMeta[pk]?.isClosed && !acknowledgeClosed) {
      res.status(409).json({
        code: 'CLOSED_PACKING_WARNING',
        error: errMsg(req, 'این پکینگ لیست قبلاً بسته/تکمیل اعلام شده است.', 'This Packing List is already marked closed.'),
      });
      return;
    }

    const nextPkg = normKey(patch.packageNo ?? item.packageNo);
    const nextItemNo = normalizeDigits(normKey(patch.itemNo ?? item.itemNo));
    if (nextItemNo && store.isDetailedItemNoTaken(pk, nextPkg, nextItemNo, item.id)) {
      res.status(409).json({
        code: 'DUPLICATE_ITEM_NO',
        error: errMsg(
          req,
          `شماره آیتم ${nextItemNo} برای پکینگ «${pk}» و نگله «${nextPkg || '-'}» تکراری است.`,
          `Item No. ${nextItemNo} already exists for Packing "${pk}" and Package "${nextPkg || '-'}".`,
        ),
      });
      return;
    }

    if (patch.generalDescription !== undefined) {
      patch.generalDescription = formatGeneralDescriptionCase(patch.generalDescription);
    }

    Object.assign(item, {
      ...patch,
      shipmentNo: pk,
      packageNo: nextPkg,
      itemNo: nextItemNo,
      rowNo: item.rowNo,
      updatedAt: new Date().toISOString(),
    });
    store.renumberScope('detailed');
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
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
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
      res.status(400).json({ error: errMsg(req, 'تعداد جبران کسری باید بزرگتر از صفر باشد', 'Fulfilled quantity must be greater than zero') });
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
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const [removed] = store.db.detailed.splice(idx, 1);
    store.db.trash.unshift({
      id: makeId(),
      scope: 'detailed',
      deletedAt: new Date().toISOString(),
      deletedBy: req.currentUser!.fullName || req.currentUser!.username,
      targetLabel: `${removed.shipmentNo} / ${removed.packageNo || '-'} / #${removed.itemNo || removed.rowNo}`,
      data: removed,
    });
    store.renumberScope('detailed');
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_DETAILED',
      scope: 'detailed',
      targetId: `${removed.shipmentNo} (#${removed.rowNo})`,
      summary: `انتقال ردیف جزئیات ${removed.rowNo} (${removed.shipmentNo}) به سطل بازیافت`,
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
    const { rowNo: _ignoredRowNo, ...raw } = req.body as Partial<TransitEntry>;
    const now = new Date().toISOString();
    const pk = normKey(raw.packingListNo);
    const alreadyInWarehouse =
      pk && ((store.generalByPacking.get(pk)?.length || 0) > 0 || (store.detailedByPacking.get(pk)?.length || 0) > 0);

    const created: TransitEntry = {
      id: makeId(),
      rowNo: '0',
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
    store.renumberScope('transit');
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_TRANSIT',
      scope: 'transit',
      targetId: `${pk || created.rowNo}`,
      summary: `ثبت محموله در راه ${pk || created.rowNo} (${created.overallStatus})`,
    });
    store.saveImmediate();
    res.json({ item: created });
  });

  app.patch('/api/transit/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const item = store.db.transit.find((t) => t.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const { rowNo: _ignoredRowNo, ...patch } = req.body as Partial<TransitEntry>;
    Object.assign(item, {
      ...patch,
      rowNo: item.rowNo,
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
      res.status(404).json({ error: errMsg(req, 'رکورد یافت نشد', 'Record not found') });
      return;
    }
    const [removed] = store.db.transit.splice(idx, 1);
    store.db.trash.unshift({
      id: makeId(),
      scope: 'transit',
      deletedAt: new Date().toISOString(),
      deletedBy: req.currentUser!.fullName || req.currentUser!.username,
      targetLabel: `${removed.packingListNo || '-'} (#${removed.rowNo})`,
      data: removed,
    });
    store.renumberScope('transit');
    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'DELETE_TRANSIT',
      scope: 'transit',
      targetId: `${removed.packingListNo || removed.rowNo}`,
      summary: `انتقال ردیف در راه ${removed.packingListNo || removed.rowNo} به سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- RECYCLE BIN / TRASH (سطل بازیافت) ----------------
  app.get('/api/trash', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const scope = String(req.query.scope || '');
    const q = String(req.query.q || '');
    const detailedTrash = store.db.trash.filter((t) => t.scope === 'detailed');
    const items = store.db.trash
      .filter((item) => {
        if (scope && item.scope !== scope) return false;
        return matchSearch([item.targetLabel, item.deletedBy, item.scope], q);
      })
      .map((item) => {
        if (item.scope !== 'general') return item;
        const g = item.data as GeneralEntry;
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const linkedTrashDetailedCount = pk
          ? detailedTrash.filter((dt) => {
              const d = dt.data as DetailedEntry;
              return normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            }).length
          : 0;
        return { ...item, linkedTrashDetailedCount };
      });
    res.json({ items });
  });

  app.post('/api/trash/:id/restore', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.trash.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'آیتم در سطل بازیافت یافت نشد', 'Trash item not found') });
      return;
    }
    const restoreDetailed = String(req.query.restoreDetailed || '') === 'true';
    const entry = store.db.trash[idx];
    let restoredDetailedCount = 0;

    if (entry.scope === 'general') {
      const g = entry.data as GeneralEntry;
      if (g.mapnaEntryMinutesNo && store.isMapnaMinutesTaken(g.mapnaEntryMinutesNo)) {
        res.status(409).json({
          error: errMsg(
            req,
            `شماره صورتجلسه ورود مپنا «${g.mapnaEntryMinutesNo}» در حال حاضر در سیستم فعال است و امکان بازیابی مستقیم وجود ندارد.`,
            `MAPNA Entry Minutes No. "${g.mapnaEntryMinutesNo}" is already active and cannot be restored directly.`,
          ),
        });
        return;
      }
      store.db.trash.splice(idx, 1);
      store.db.general.unshift({ ...g, updatedAt: new Date().toISOString() });
      store.renumberScope('general');

      if (restoreDetailed) {
        const pk = normKey(g.packingListNo);
        const pkg = normKey(g.packageNo);
        const remainingTrash: TrashRecord[] = [];
        for (const tr of store.db.trash) {
          if (tr.scope === 'detailed') {
            const d = tr.data as DetailedEntry;
            const matches = normKey(d.shipmentNo) === pk && (!pkg || normKey(d.packageNo) === pkg);
            if (matches && !(d.itemNo && store.isDetailedItemNoTaken(d.shipmentNo, d.packageNo, d.itemNo))) {
              store.db.detailed.unshift({ ...d, updatedAt: new Date().toISOString() });
              restoredDetailedCount += 1;
              continue;
            }
          }
          remainingTrash.push(tr);
        }
        store.db.trash = remainingTrash;
        if (restoredDetailedCount > 0) {
          store.renumberScope('detailed');
        }
      }
    } else if (entry.scope === 'detailed') {
      const d = entry.data as DetailedEntry;
      if (d.itemNo && store.isDetailedItemNoTaken(d.shipmentNo, d.packageNo, d.itemNo)) {
        res.status(409).json({
          error: errMsg(
            req,
            `شماره آیتم ${d.itemNo} در محموله ${d.shipmentNo} / نگله ${d.packageNo || '-'} قبلاً وجود دارد.`,
            `Item No. ${d.itemNo} already exists under Shipment ${d.shipmentNo} / Package ${d.packageNo || '-'}.`,
          ),
        });
        return;
      }
      store.db.trash.splice(idx, 1);
      store.db.detailed.unshift({ ...d, updatedAt: new Date().toISOString() });
      store.renumberScope('detailed');
    } else {
      const t = entry.data as TransitEntry;
      store.db.trash.splice(idx, 1);
      store.db.transit.unshift({ ...t, updatedAt: new Date().toISOString() });
      store.renumberScope('transit');
    }

    store.rebuildIndexes();
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'RESTORE_TRASH',
      scope: 'trash',
      targetId: entry.targetLabel,
      summary: `بازیابی ردیف ${entry.scope} (${entry.targetLabel}) از سطل بازیافت${
        restoredDetailedCount > 0 ? ` همراه با ${restoredDetailedCount} ردیف جزئیات` : ''
      }`,
    });
    store.saveImmediate();
    res.json({ ok: true, restoredDetailedCount });
  });

  app.delete('/api/trash/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const idx = store.db.trash.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: errMsg(req, 'آیتم در سطل بازیافت یافت نشد', 'Trash item not found') });
      return;
    }
    const [purged] = store.db.trash.splice(idx, 1);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'PURGE_TRASH',
      scope: 'trash',
      targetId: purged.targetLabel,
      summary: `حذف دائمی ردیف ${purged.scope} (${purged.targetLabel}) از سطل بازیافت`,
    });
    store.saveImmediate();
    res.json({ ok: true });
  });

  // ---------------- SITE ENTRY MINUTES ----------------
  app.get('/api/site-entry', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      minutes: store.db.siteEntryMinutes,
      generalEntries: store.db.general,
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    });
  });

  app.post('/api/site-entry', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      minutesNo,
      date,
      packingListNos,
      supplier,
      driverName,
      vehicleNo,
      waybillNo,
      warehouseKeeper,
      employerRep,
      mapnaRep,
      conditionStatus,
      notes,
    } = req.body as Partial<SiteEntryMinutesRecord>;
    const cleanNo = normKey(minutesNo);
    const cleanDate = normKey(date);
    const cleanPackings = Array.from(new Set((packingListNos || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Minutes No., date, and at least one Packing List are required',
        ),
      });
      return;
    }
    const record: SiteEntryMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      date: cleanDate,
      packingListNos: cleanPackings,
      supplier: normKey(supplier),
      driverName: normKey(driverName),
      vehicleNo: normKey(vehicleNo),
      waybillNo: normKey(waybillNo),
      warehouseKeeper: normKey(warehouseKeeper),
      employerRep: normKey(employerRep),
      mapnaRep: normKey(mapnaRep),
      conditionStatus: conditionStatus || 'healthy',
      notes: normKey(notes),
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.siteEntryMinutes.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_SITE_ENTRY_MINUTES',
      scope: 'siteEntry',
      targetId: cleanNo,
      summary: `ثبت صورتجلسه ورود کالا به کارگاه شماره ${cleanNo} (${cleanPackings.join('، ')})`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  // ---------------- OPI MANAGEMENT ----------------
  app.get('/api/opi', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      invitations: store.db.opiInvitations,
      detailedItems: store.getDetailedComputedList(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    });
  });

  app.post('/api/opi', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { invitationNo, date, time, packingNos, location, notes } = req.body as {
      invitationNo?: string;
      date?: string;
      time?: string;
      packingNos?: string[];
      location?: string;
      notes?: string;
    };
    const cleanNo = normKey(invitationNo);
    const cleanDate = normKey(date);
    const cleanPackings = Array.from(new Set((packingNos || []).map(normKey).filter(Boolean)));
    if (!cleanNo || !cleanDate || cleanPackings.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره دعوتنامه، تاریخ و حداقل یک پکینگ لیست الزامی است',
          'Invitation No., date, and at least one Packing List are required',
        ),
      });
      return;
    }

    const record: OpiInvitationRecord = {
      id: makeId(),
      invitationNo: cleanNo,
      date: cleanDate,
      time: normKey(time) || '09:00',
      packingNos: cleanPackings,
      location: normKey(location),
      notes: normKey(notes),
      status: 'issued',
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.opiInvitations.unshift(record);

    const now = new Date().toISOString();
    for (const g of store.db.general) {
      if (cleanPackings.includes(normKey(g.packingListNo))) {
        g.opiInvitationNo = cleanNo;
        g.opiInvitationDate = cleanDate;
        g.updatedAt = now;
      }
    }
    for (const d of store.db.detailed) {
      if (cleanPackings.includes(normKey(d.shipmentNo))) {
        d.opiNo = cleanNo;
        d.opiDate = cleanDate;
        d.updatedAt = now;
      }
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ISSUE_OPI_INVITATION',
      scope: 'opi',
      targetId: cleanNo,
      summary: `صدور دعوتنامه OPI شماره ${cleanNo} برای ${cleanPackings.length} پکینگ لیست (${cleanPackings.join('، ')})`,
    });
    store.saveImmediate();
    res.json({ invitation: record });
  });

  app.post('/api/opi/results', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { invitationId, opiNo, opiDate, results } = req.body as {
      invitationId?: string;
      opiNo?: string;
      opiDate?: string;
      results?: Array<{
        detailedId: string;
        actualQty: number | null;
        damagedQty?: number | null;
        repNo?: string;
        repStatus?: string;
        repDescription?: string;
        notes?: string;
      }>;
    };
    if (!Array.isArray(results) || results.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک قلم جهت ثبت نتیجه OPI انتخاب کنید', 'Select at least one item to record OPI results') });
      return;
    }

    const now = new Date().toISOString();
    const cleanOpiNo = normKey(opiNo);
    const cleanOpiDate = normKey(opiDate);
    let updatedCount = 0;

    for (const r of results) {
      const d = store.db.detailed.find((x) => x.id === r.detailedId);
      if (!d) continue;
      if (r.actualQty !== undefined && r.actualQty !== null && Number.isFinite(r.actualQty)) {
        d.actualQty = r.actualQty;
      }
      if (r.damagedQty !== undefined && r.damagedQty !== null && Number.isFinite(r.damagedQty)) {
        d.damagedQty = r.damagedQty;
      }
      if (cleanOpiNo) d.opiNo = cleanOpiNo;
      if (cleanOpiDate) d.opiDate = cleanOpiDate;
      if (r.repNo !== undefined) d.repNo = normKey(r.repNo);
      if (r.repStatus !== undefined) d.repStatus = normKey(r.repStatus);
      if (r.repDescription !== undefined) d.repDescription = normKey(r.repDescription);
      if (r.notes !== undefined && normKey(r.notes)) d.notes = normKey(r.notes);
      d.updatedAt = now;
      updatedCount += 1;
    }

    if (invitationId) {
      const inv = store.db.opiInvitations.find((x) => x.id === invitationId);
      if (inv) inv.status = 'completed';
    }

    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'RECORD_OPI_RESULTS',
      scope: 'opi',
      targetId: cleanOpiNo || 'OPI',
      summary: `ثبت نتایج بازرسی OPI (${cleanOpiNo || '-'}) برای ${updatedCount} قلم کالا`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  // ---------------- OPI MINUTES & OSDR DISCREPANCY REPORTS ----------------
  app.get('/api/opi-minutes', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    const packingsSet = new Set<string>();
    for (const g of store.db.general) {
      const pk = normKey(g.packingListNo);
      if (pk) packingsSet.add(pk);
    }
    for (const d of store.db.detailed) {
      const pk = normKey(d.shipmentNo);
      if (pk) packingsSet.add(pk);
    }
    res.json({
      minutes: store.db.opiMinutes,
      osdrReports: store.db.osdrReports,
      invitations: store.db.opiInvitations,
      detailedItems: store.getDetailedComputedList(),
      packings: Array.from(packingsSet).sort((a, b) => a.localeCompare(b, 'fa')),
    });
  });

  app.post('/api/opi-minutes', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      minutesNo,
      invitationNo,
      date,
      packingListNo,
      packageNos,
      location,
      mapnaInspector,
      employerInspector,
      contractorInspector,
      qcInspector,
      resultStatus,
      notes,
    } = req.body as Partial<OpiMinutesRecord>;

    const cleanNo = normKey(minutesNo);
    const cleanDate = normKey(date);
    const cleanPacking = normKey(packingListNo);
    if (!cleanNo || !cleanDate || !cleanPacking) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره صورتجلسه، تاریخ و شماره پکینگ لیست الزامی است',
          'Minutes No., date, and Packing List No. are required',
        ),
      });
      return;
    }

    const record: OpiMinutesRecord = {
      id: makeId(),
      minutesNo: cleanNo,
      invitationNo: normKey(invitationNo),
      date: cleanDate,
      packingListNo: cleanPacking,
      packageNos: Array.from(new Set((packageNos || []).map(normKey).filter(Boolean))),
      location: normKey(location),
      mapnaInspector: normKey(mapnaInspector),
      employerInspector: normKey(employerInspector),
      contractorInspector: normKey(contractorInspector),
      qcInspector: normKey(qcInspector),
      resultStatus: resultStatus || 'compliant',
      notes: normKey(notes),
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };

    if (record.invitationNo) {
      const inv = store.db.opiInvitations.find((x) => normKey(x.invitationNo) === record.invitationNo);
      if (inv) inv.status = 'completed';
    }

    store.db.opiMinutes.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_OPI_MINUTES',
      scope: 'opiMinutes',
      targetId: cleanNo,
      summary: `ثبت صورتجلسه گشایش و بازرسی بسته‌ها شماره ${cleanNo} (پکینگ ${cleanPacking})`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  app.post('/api/osdr', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { reportNo, date, opiMinutesNo, packingListNo, supplier, items, notes } = req.body as {
      reportNo?: string;
      date?: string;
      opiMinutesNo?: string;
      packingListNo?: string;
      supplier?: string;
      items?: OsdrReportItem[];
      notes?: string;
    };
    const cleanNo = normKey(reportNo);
    const cleanDate = normKey(date);
    const cleanPacking = normKey(packingListNo);
    if (!cleanNo || !cleanDate || !cleanPacking || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره گزارش مغایرت، تاریخ، شماره پکینگ و حداقل یک قلم مغایرت الزامی است',
          'Report No., date, Packing List No., and at least one discrepancy item are required',
        ),
      });
      return;
    }

    const record: OsdrReportRecord = {
      id: makeId(),
      reportNo: cleanNo,
      date: cleanDate,
      opiMinutesNo: normKey(opiMinutesNo),
      packingListNo: cleanPacking,
      supplier: normKey(supplier),
      items,
      notes: normKey(notes),
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.osdrReports.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_OSDR_REPORT',
      scope: 'osdr',
      targetId: cleanNo,
      summary: `ثبت گزارش مغایرت، کسری و آسیب‌دیدگی شماره ${cleanNo} برای پکینگ ${cleanPacking} (${items.length} قلم)`,
    });
    store.saveImmediate();
    res.json({ report: record });
  });

  // ---------------- GCV RECEIPTS ----------------
  app.get('/api/gcv', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      documents: store.db.gcvDocuments,
      detailedItems: store.getDetailedComputedList(),
    });
  });

  app.post('/api/gcv', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { receiptNo, date, receiver, notes, items } = req.body as {
      receiptNo?: string;
      date?: string;
      receiver?: string;
      notes?: string;
      items?: Array<{ detailedId: string; qty: number }>;
    };
    const cleanNo = normKey(receiptNo);
    const cleanReceiver = normKey(receiver);
    if (!cleanNo || !cleanReceiver || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره رسید، تحویل‌گیرنده و حداقل یک قلم کالا الزامی است',
          'Receipt No., receiver, and at least one item are required',
        ),
      });
      return;
    }

    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: errMsg(req, 'تعداد تحویلی باید بزرگتر از صفر باشد', 'Delivered quantity must be greater than zero') });
        return;
      }
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const comp = computeDetailedEntry(d);
      if (comp.opiPending) {
        res.status(400).json({
          error: errMsg(
            req,
            `برای آیتم ${d.itemNo || d.rowNo} (${d.description}) هنوز OPI و مقدار واقعی ثبت نشده است.`,
            `Item ${d.itemNo || d.rowNo} (${d.description}) is pending OPI / Actual Qty.`,
          ),
        });
        return;
      }
      if (qty > comp.mapnaInventory) {
        res.status(400).json({
          error: errMsg(
            req,
            `مقدار تحویلی (${qty}) برای آیتم ${d.description || d.itemNo} بیشتر از موجودی مپنا (${comp.mapnaInventory}) است.`,
            `Delivered qty (${qty}) for item ${d.description || d.itemNo} exceeds MAPNA stock (${comp.mapnaInventory}).`,
          ),
        });
        return;
      }
      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
      });
    }

    const now = new Date().toISOString();
    for (const line of lineItems) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      d.gcvReceiptNo = appendUniqueRef(d.gcvReceiptNo, cleanNo);
      d.receiver = cleanReceiver;
      d.gcvDeliveredQty = roundQty(toNum(d.gcvDeliveredQty) + line.qty);
      d.updatedAt = now;
    }

    const doc: GcvDocumentRecord = {
      id: makeId(),
      receiptNo: cleanNo,
      date: normKey(date),
      receiver: cleanReceiver,
      notes: normKey(notes),
      items: lineItems,
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.gcvDocuments.unshift(doc);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_GCV_RECEIPT',
      scope: 'gcv',
      targetId: cleanNo,
      summary: `ثبت رسید مصرف مستقیم کالا شماره ${cleanNo} برای ${cleanReceiver} (${lineItems.length} قلم کالا)`,
    });
    store.saveImmediate();
    res.json({ document: doc });
  });

  // ---------------- MIV & SMR ----------------
  app.get('/api/miv', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      documents: store.db.mivDocuments,
      detailedItems: store.getDetailedComputedList(),
    });
  });

  app.post('/api/miv', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { docType, docNo, date, party, notes, items } = req.body as {
      docType?: MivDocType;
      docNo?: string;
      date?: string;
      party?: string;
      notes?: string;
      items?: Array<{ detailedId: string; qty: number }>;
    };
    const validTypes: MivDocType[] = ['miv_contractor', 'smr_contractor', 'smr_mapna', 'miv_mapna'];
    if (!docType || !validTypes.includes(docType)) {
      res.status(400).json({ error: errMsg(req, 'نوع فرم معتبر نیست', 'Invalid document type') });
      return;
    }
    const cleanNo = normKey(docNo);
    const cleanDate = normKey(date);
    if (!cleanNo || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: errMsg(req, 'شماره سند و حداقل یک قلم کالا الزامی است', 'Document No. and at least one item are required') });
      return;
    }

    const lineItems: DocumentLineItem[] = [];
    for (const reqItem of items) {
      const qty = Number(reqItem.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: errMsg(req, 'تعداد باید بزرگتر از صفر باشد', 'Quantity must be greater than zero') });
        return;
      }
      const d = store.db.detailed.find((x) => x.id === reqItem.detailedId);
      if (!d) {
        res.status(404).json({ error: errMsg(req, 'آیتم جزئیات یافت نشد', 'Detailed item not found') });
        return;
      }
      const comp = computeDetailedEntry(d);
      if ((docType === 'miv_contractor' || docType === 'smr_mapna') && qty > comp.contractorInventory) {
        res.status(400).json({
          error: errMsg(
            req,
            `تعداد (${qty}) برای ${d.description || d.itemNo} از موجودی پیمانکار (${comp.contractorInventory}) بیشتر است.`,
            `Qty (${qty}) for ${d.description || d.itemNo} exceeds Contractor stock (${comp.contractorInventory}).`,
          ),
        });
        return;
      }
      if (docType === 'miv_mapna' && qty > comp.mapnaInventory) {
        res.status(400).json({
          error: errMsg(
            req,
            `تعداد (${qty}) برای ${d.description || d.itemNo} از موجودی مپنا (${comp.mapnaInventory}) بیشتر است.`,
            `Qty (${qty}) for ${d.description || d.itemNo} exceeds MAPNA stock (${comp.mapnaInventory}).`,
          ),
        });
        return;
      }
      lineItems.push({
        detailedId: d.id,
        shipmentNo: d.shipmentNo,
        packageNo: d.packageNo,
        itemNo: d.itemNo,
        description: d.description || d.generalDescription,
        qty,
      });
    }

    const now = new Date().toISOString();
    const cleanNotes = normKey(notes);
    for (const line of lineItems) {
      const d = store.db.detailed.find((x) => x.id === line.detailedId)!;
      if (docType === 'miv_contractor') {
        d.mivContractorNo = appendUniqueRef(d.mivContractorNo, cleanNo);
        d.mivContractorDate = cleanDate || d.mivContractorDate;
        d.mivContractorQty = roundQty(toNum(d.mivContractorQty) + line.qty);
      } else if (docType === 'smr_contractor') {
        d.smrContractorNo = appendUniqueRef(d.smrContractorNo, cleanNo);
        d.smrContractorDate = cleanDate || d.smrContractorDate;
        d.smrContractorQty = roundQty(toNum(d.smrContractorQty) + line.qty);
        if (cleanNotes) d.smrContractorNote = cleanNotes;
      } else if (docType === 'smr_mapna') {
        d.smrMapnaNo = appendUniqueRef(d.smrMapnaNo, cleanNo);
        d.smrMapnaDate = cleanDate || d.smrMapnaDate;
        d.smrMapnaQty = roundQty(toNum(d.smrMapnaQty) + line.qty);
        if (cleanNotes) d.smrMapnaNote = cleanNotes;
      } else if (docType === 'miv_mapna') {
        d.mivMapnaNo = appendUniqueRef(d.mivMapnaNo, cleanNo);
        d.mivMapnaDate = cleanDate || d.mivMapnaDate;
        d.mivMapnaQty = roundQty(toNum(d.mivMapnaQty) + line.qty);
      }
      d.updatedAt = now;
    }

    const doc: MivDocumentRecord = {
      id: makeId(),
      docType,
      docNo: cleanNo,
      date: cleanDate,
      party: normKey(party),
      notes: cleanNotes,
      items: lineItems,
      createdAt: now,
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.mivDocuments.unshift(doc);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: `CREATE_${docType.toUpperCase()}`,
      scope: docType.startsWith('smr') ? 'smr' : 'miv',
      targetId: cleanNo,
      summary: `ثبت فرم ${docType} شماره ${cleanNo} برای ${lineItems.length} قلم کالا`,
    });
    store.saveImmediate();
    res.json({ document: doc });
  });

  // ---------------- SUBSTITUTION (جایگزینی) ----------------
  app.get('/api/substitutions', requireRole(['admin', 'operator', 'viewer']), (_req: AuthedRequest, res: Response) => {
    res.json({
      records: store.db.substitutions,
      detailedItems: store.getDetailedComputedList(),
    });
  });

  app.post('/api/substitutions', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const {
      docNo,
      date,
      detailedId,
      substituteDescription,
      substituteItemCode,
      substituteSize,
      qty,
      reason,
      approvedBy,
      status,
      notes,
    } = req.body as Partial<SubstitutionRecord>;

    const cleanNo = normKey(docNo);
    const cleanDate = normKey(date);
    const cleanSubDesc = normKey(substituteDescription);
    const cleanReason = normKey(reason);
    const d = store.db.detailed.find((x) => x.id === detailedId);
    if (!cleanNo || !cleanDate || !d || !cleanSubDesc || !cleanReason) {
      res.status(400).json({
        error: errMsg(
          req,
          'شماره سند جایگزینی، تاریخ، کالای اصلی، مشخصات کالای جایگزین و دلیل جایگزینی الزامی است',
          'Document No., date, original item, substitute description, and reason are required',
        ),
      });
      return;
    }

    const numQty = Number(qty);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      res.status(400).json({ error: errMsg(req, 'تعداد جایگزینی باید بزرگتر از صفر باشد', 'Substitution quantity must be greater than zero') });
      return;
    }

    const record: SubstitutionRecord = {
      id: makeId(),
      docNo: cleanNo,
      date: cleanDate,
      detailedId: d.id,
      shipmentNo: d.shipmentNo,
      packageNo: d.packageNo,
      itemNo: d.itemNo,
      originalDescription: d.description || d.generalDescription,
      originalItemCode: d.itemCode,
      substituteDescription: cleanSubDesc,
      substituteItemCode: normKey(substituteItemCode),
      substituteSize: normKey(substituteSize),
      qty: numQty,
      countingUnit: d.countingUnit || 'PC',
      reason: cleanReason,
      approvedBy: normKey(approvedBy),
      status: status || 'pending',
      notes: normKey(notes),
      createdAt: new Date().toISOString(),
      createdBy: req.currentUser!.fullName || req.currentUser!.username,
    };
    store.db.substitutions.unshift(record);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'CREATE_SUBSTITUTION',
      scope: 'substitution',
      targetId: cleanNo,
      summary: `ثبت فرم جایگزینی شماره ${cleanNo} برای آیتم ${d.itemNo || d.rowNo} (${d.shipmentNo})`,
    });
    store.saveImmediate();
    res.json({ record });
  });

  app.patch('/api/substitutions/:id', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const rec = store.db.substitutions.find((s) => s.id === req.params.id);
    if (!rec) {
      res.status(404).json({ error: errMsg(req, 'سند جایگزینی یافت نشد', 'Substitution record not found') });
      return;
    }
    const { status, approvedBy, notes } = req.body as Partial<SubstitutionRecord>;
    if (status) rec.status = status;
    if (approvedBy !== undefined) rec.approvedBy = normKey(approvedBy);
    if (notes !== undefined) rec.notes = normKey(notes);
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'UPDATE_SUBSTITUTION',
      scope: 'substitution',
      targetId: rec.docNo,
      summary: `تغییر وضعیت جایگزینی شماره ${rec.docNo} به ${rec.status}`,
    });
    store.saveImmediate();
    res.json({ record: rec });
  });

  // ---------------- MATERIAL BALANCE ----------------
  app.post('/api/balance/assign', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { detailedIds, materialBalanceNo, balanceStatus } = req.body as {
      detailedIds?: string[];
      materialBalanceNo?: string;
      balanceStatus?: string;
    };
    if (!Array.isArray(detailedIds) || detailedIds.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک آیتم انتخاب کنید', 'Select at least one item') });
      return;
    }
    const cleanNo = normKey(materialBalanceNo);
    const cleanStatus = normKey(balanceStatus);
    if (!cleanNo && !cleanStatus) {
      res.status(400).json({ error: errMsg(req, 'شماره موازنه یا وضعیت موازنه الزامی است', 'Balance No. or Balance Status is required') });
      return;
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = store.db.detailed.find((x) => x.id === id);
      if (!d) continue;
      if (cleanNo) d.materialBalanceNo = cleanNo;
      if (cleanStatus) d.balanceStatus = cleanStatus;
      d.updatedAt = now;
      updatedCount += 1;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ASSIGN_MATERIAL_BALANCE',
      scope: 'balance',
      targetId: cleanNo || cleanStatus,
      summary: `ثبت وضعیت موازنه مواد (${cleanNo || '-'} / ${cleanStatus || '-'}) برای ${updatedCount} ردیف`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  // ---------------- STOCKTAKE ----------------
  app.post('/api/stocktake/assign', requireRole(['admin', 'operator']), (req: AuthedRequest, res: Response) => {
    const { detailedIds, stocktakeStatus, stocktakeDate, stocktakeInfo } = req.body as {
      detailedIds?: string[];
      stocktakeStatus?: string;
      stocktakeDate?: string;
      stocktakeInfo?: string;
    };
    if (!Array.isArray(detailedIds) || detailedIds.length === 0) {
      res.status(400).json({ error: errMsg(req, 'حداقل یک آیتم انتخاب کنید', 'Select at least one item') });
      return;
    }
    const cleanStatus = normKey(stocktakeStatus);
    const cleanDate = normKey(stocktakeDate);
    const cleanInfo = normKey(stocktakeInfo);
    if (!cleanStatus) {
      res.status(400).json({ error: errMsg(req, 'وضعیت انبارگردانی الزامی است', 'Stocktake status is required') });
      return;
    }
    const now = new Date().toISOString();
    let updatedCount = 0;
    for (const id of detailedIds) {
      const d = store.db.detailed.find((x) => x.id === id);
      if (!d) continue;
      d.stocktakeStatus = cleanStatus;
      if (cleanDate) d.stocktakeDate = cleanDate;
      d.stocktakeInfo = cleanInfo || (cleanDate ? `${cleanStatus} (${cleanDate})` : cleanStatus);
      d.updatedAt = now;
      updatedCount += 1;
    }
    store.addAudit({
      user: sanitizeUser(req.currentUser!),
      action: 'ASSIGN_STOCKTAKE',
      scope: 'stocktake',
      targetId: cleanStatus,
      summary: `ثبت وضعیت انبارگردانی «${cleanStatus}» در تاریخ ${cleanDate || '-'} برای ${updatedCount} ردیف`,
    });
    store.saveImmediate();
    res.json({ ok: true, updatedCount });
  });

  // ---------------- GLOBAL SEARCH ----------------
  app.get('/api/search', requireRole(['admin', 'operator', 'viewer']), (req: AuthedRequest, res: Response) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(100, Number(queryLimit(req.query.limit)));
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
            d.itemNo,
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
            d.stocktakeStatus,
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
      res.status(400).json({ error: errMsg(req, 'گروه دسته‌بندی نامعتبر یا مقدار خالی است', 'Invalid category group or empty value') });
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
      res.status(400).json({ error: errMsg(req, 'پارامترهای تغییر نام نامعتبر است', 'Invalid rename parameters') });
      return;
    }

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
      res.status(400).json({ error: errMsg(req, 'درخواست حذف نامعتبر است', 'Invalid delete request') });
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

    const transitByStatus: Record<string, number> = {};
    for (const t of store.db.transit) {
      const st = normKey(t.overallStatus) || 'نامشخص';
      transitByStatus[st] = (transitByStatus[st] || 0) + 1;
    }

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
      res.status(400).json({ error: errMsg(req, 'محتوای فایل CSV خالی است', 'CSV content is empty') });
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
    const { csvText, scope, assumedCalendar } = req.body as {
      csvText?: string;
      scope?: ImportScope;
      assumedCalendar?: CalendarMode;
      duplicateRowPolicy?: 'auto_reassign' | 'skip';
    };
    if (!csvText) {
      res.status(400).json({ error: errMsg(req, 'محتوای فایل CSV خالی است', 'CSV content is empty') });
      return;
    }
    const matrix = parseCsvMatrix(csvText);
    const targetScope = scope || detectCsvScope(matrix) || 'general';
    const cal = assumedCalendar || 'jalali';

    let imported = 0;
    const skipped = 0;
    let transitAutoArrived = 0;
    const touchedPackings = new Set<string>();

    if (targetScope === 'general') {
      const parsed = parseGeneralCsv(matrix, cal, req.currentUser!.username);
      const newItems: GeneralEntry[] = [];
      for (const r of parsed.rows) {
        if (r.packingListNo) touchedPackings.add(r.packingListNo);
        newItems.push({ ...r, id: makeId() });
        imported += 1;
      }
      store.db.general.push(...newItems);
      store.renumberScope('general');
    } else if (targetScope === 'detailed') {
      const parsed = parseDetailedCsv(matrix, cal, req.currentUser!.username);
      const newItems: DetailedEntry[] = [];
      for (const r of parsed.rows) {
        if (r.shipmentNo) touchedPackings.add(r.shipmentNo);
        newItems.push({ ...r, id: makeId() });
        imported += 1;
      }
      store.db.detailed.push(...newItems);
      store.renumberScope('detailed');
    } else {
      const parsed = parseTransitCsv(matrix, cal, req.currentUser!.username);
      const newItems: TransitEntry[] = [];
      for (const r of parsed.rows) {
        const pk = normKey(r.packingListNo);
        const alreadyArrived =
          pk &&
          ((store.generalByPacking.get(pk)?.length || 0) > 0 ||
            (store.detailedByPacking.get(pk)?.length || 0) > 0);
        newItems.push({
          ...r,
          id: makeId(),
          overallStatus: alreadyArrived ? 'رسیده' : r.overallStatus,
          linkedGeneralPackingNo: alreadyArrived ? pk : undefined,
        });
        imported += 1;
      }
      store.db.transit.push(...newItems);
      store.renumberScope('transit');
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
      res.status(400).json({ error: errMsg(req, 'فرمت فایل پشتیبان نامعتبر است', 'Invalid backup snapshot format') });
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

function queryLimit(val: unknown): number {
  const n = Number(val || 40);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

startServer().catch((err) => {
  console.error('Failed to start SAMAAN server:', err);
  process.exit(1);
});
