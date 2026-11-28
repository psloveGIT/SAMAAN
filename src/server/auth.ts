import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { validateAndFormatIranPhone } from '../shared/iranPhone.ts';
import { normalizeDigits } from '../shared/jalali.ts';
import type {
  AdminManagedUser,
  AppUserRole,
  AppUserStatus,
  UserAccount,
  UserPreferences,
  UserRole,
} from '../shared/types.ts';
import { getPool, type StorageMode, withTransaction } from './db.ts';
import type { SmsOtpPurpose } from './smsService.ts';

export interface StoredUser extends UserAccount {
  passwordHash: string;
}

export interface AppUserRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passwordHash: string;
  role: AppUserRole;
  status: AppUserStatus;
  phoneVerified: boolean;
  totpSecretEnc: string | null;
  totpEnabled: boolean;
  requestedEmployerId: string | null;
  requestedProjectIds: string[];
  preferences: UserPreferences;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface UserProjectAccessRecord {
  userId: string;
  projectId: string;
  assignedBy: string | null;
  assignedAt: string;
}

export interface SmsOtpRecord {
  id: string;
  phone: string;
  purpose: SmsOtpPurpose;
  codeHash: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthenticatedAppUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  role: AppUserRole;
  status: AppUserStatus;
  phoneVerified: boolean;
  totpEnabled: boolean;
  assignedProjectIds: string[];
  preferences: UserPreferences;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthedRequest extends Request {
  /** Global authenticated user from `app_users` & `auth_sessions` */
  user?: AuthenticatedAppUser;
  /** Compatible warehouse operational user view for all existing routes */
  currentUser?: StoredUser;
  /** Set by project-scoping middleware when an authenticated regular user lacks access to X-Samaan-Project */
  projectAccessDenied?: boolean;
  /** Active project ID resolved from X-Samaan-Project */
  activeProjectId?: string;
}

export const SESSION_COOKIE = 'samaan_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const OTP_TTL_SECONDS = 300; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
const TOTP_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'fa',
  calendar: 'jalali',
  theme: 'light',
  eyeComfort: false,
  spellCheck: true,
};

let ephemeralDevKey: Buffer | null = null;
let warnedMissingEncKey = false;

/**
 * Derives a 32-byte key for AES-256-GCM TOTP secret encryption and HMAC OTP hashing
 * from `AUTH_ENCRYPTION_KEY` in `.env` (never hardcoded).
 */
export function resolveEncryptionKey(keyOverride?: string): Buffer {
  const raw = (keyOverride ?? process.env.AUTH_ENCRYPTION_KEY ?? '').trim();
  if (raw.length > 0) {
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_ENCRYPTION_KEY must be configured in production environment.');
  }
  if (!ephemeralDevKey) {
    ephemeralDevKey = crypto.randomBytes(32);
    if (!warnedMissingEncKey) {
      warnedMissingEncKey = true;
      console.warn(
        '[auth] AUTH_ENCRYPTION_KEY is not set; using an ephemeral in-memory key for development only.',
      );
    }
  }
  return ephemeralDevKey;
}

// ---------------- PASSWORD HASHING (SCRYPT) ----------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

// ---------------- AES-256-GCM FOR TOTP SECRETS ----------------

export function encryptTotpSecret(plaintext: string, keyOverride?: string): string {
  const key = resolveEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(encoded: string, keyOverride?: string): string {
  const parts = String(encoded || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted TOTP secret format.');
  }
  const [, ivHex, tagHex, dataHex] = parts;
  const key = resolveEncryptionKey(keyOverride);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ---------------- OFFLINE TOTP 2FA (OTPLIB + LOCAL QRCODE) ----------------

export async function generateTotpSetup(params: {
  accountLabel: string;
  issuer?: string;
}): Promise<{ secret: string; otpauthUri: string; qrDataUrl: string }> {
  const issuer = params.issuer || 'SAMAAN';
  const secret = generateSecret();
  const otpauthUri = generateURI({
    issuer,
    label: params.accountLabel,
    secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  return { secret, otpauthUri, qrDataUrl };
}

export function verifyTotpCode(secret: string, rawToken: string | undefined | null): boolean {
  const token = normalizeDigits(String(rawToken || '')).replace(/[\s-]+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({
      token,
      secret,
      epochTolerance: 30,
    });
    return Boolean(result && result.valid);
  } catch {
    return false;
  }
}

// ---------------- SESSION & OTP HASHING + CHALLENGE TOKENS ----------------

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function hashOtpCode(
  phone: string,
  purpose: SmsOtpPurpose,
  code: string,
  keyOverride?: string,
): string {
  const key = resolveEncryptionKey(keyOverride);
  return crypto
    .createHmac('sha256', key)
    .update(`${purpose}:${phone}:${code}`, 'utf8')
    .digest('hex');
}

export function signTotpChallengeToken(
  userId: string,
  method: 'password' | 'sms',
  keyOverride?: string,
): string {
  const key = resolveEncryptionKey(keyOverride);
  const exp = Date.now() + TOTP_CHALLENGE_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ uid: userId, method, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyTotpChallengeToken(
  token: string,
  keyOverride?: string,
): { uid: string; method: 'password' | 'sms' } | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const key = resolveEncryptionKey(keyOverride);
  const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      method?: 'password' | 'sms';
      exp?: number;
    };
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { uid: parsed.uid, method: parsed.method === 'sms' ? 'sms' : 'password' };
  } catch {
    return null;
  }
}

// Legacy HMAC session token helpers preserved for unit test / migration compatibility
export function signSessionToken(userId: string, secret: string, username?: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ uid: userId, uname: username || '', exp })).toString(
    'base64url',
  );
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
): { uid: string; uname?: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      uname?: string;
      exp: number;
    };
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { uid: parsed.uid, uname: parsed.uname };
  } catch {
    return null;
  }
}

// ---------------- IRANIAN PHONE & EMAIL NORMALIZATION ----------------

export function normalizeIranMobile(raw: string | undefined | null): {
  valid: boolean;
  normalized: string;
  errorFa?: string;
  errorEn?: string;
} {
  const res = validateAndFormatIranPhone(String(raw || ''));
  if (!res.valid || res.kind !== 'mobile') {
    return {
      valid: false,
      normalized: '',
      errorFa: 'شماره موبایل معتبر ایران وارد کنید (مانند 09123456789).',
      errorEn: 'Please enter a valid Iranian mobile number (e.g. 09123456789).',
    };
  }
  return { valid: true, normalized: res.normalized };
}

export function normalizeEmail(raw: string | undefined | null): {
  valid: boolean;
  normalized: string;
} {
  const clean = normalizeDigits(String(raw || '')).trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) && clean.length <= 160;
  return { valid, normalized: valid ? clean : '' };
}

// ---------------- COOKIES (HttpOnly, Secure, SameSite=Strict) ----------------

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      result[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      result[key] = part.slice(idx + 1).trim();
    }
  }
  return result;
}

export function buildSessionCookieAttributes(req?: Request): string {
  const xfProto = String(req?.headers['x-forwarded-proto'] || '').toLowerCase();
  const isHttps = Boolean(
    process.env.NODE_ENV === 'production' || req?.secure || xfProto.includes('https'),
  );
  return isHttps ? 'HttpOnly; SameSite=Strict; Secure' : 'HttpOnly; SameSite=Strict';
}

export function setSessionCookie(res: Response, token: string, req?: Request): void {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; ${buildSessionCookieAttributes(req)}; Max-Age=${maxAge}`,
  );
}

export function clearSessionCookie(res: Response, req?: Request): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; ${buildSessionCookieAttributes(req)}; Max-Age=0`,
  );
}

export function getSessionCookie(req: Request): string | null {
  const cookies = parseCookies(req);
  return cookies[SESSION_COOKIE] || null;
}

// ---------------- USER PROJECTION & SANITIZATION ----------------

export function appUserToAuthenticatedUser(
  u: AppUserRecord,
  assignedProjectIds: string[],
): AuthenticatedAppUser {
  const fullName = `${u.firstName} ${u.lastName}`.trim() || u.email || u.phone;
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName,
    phone: u.phone,
    email: u.email,
    role: u.role,
    status: u.status,
    phoneVerified: u.phoneVerified,
    totpEnabled: u.totpEnabled,
    assignedProjectIds: [...assignedProjectIds],
    preferences: { ...DEFAULT_PREFERENCES, ...(u.preferences || {}) },
    mustChangePassword: Boolean(u.mustChangePassword),
    createdAt: u.createdAt,
    ...(u.lastLoginAt ? { lastLoginAt: u.lastLoginAt } : {}),
  };
}

export function appUserToStoredUser(
  u: AppUserRecord,
  assignedProjectIds: string[],
): StoredUser {
  const fullName = `${u.firstName} ${u.lastName}`.trim() || u.email || u.phone;
  const legacyRole: UserRole = u.role === 'SUPERUSER' ? 'admin' : 'operator';
  return {
    id: u.id,
    username: u.email || u.phone,
    fullName,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    email: u.email,
    role: legacyRole,
    appRole: u.role,
    status: u.status,
    phoneVerified: u.phoneVerified,
    totpEnabled: u.totpEnabled,
    assignedProjectIds: [...assignedProjectIds],
    active: u.status === 'APPROVED',
    preferences: { ...DEFAULT_PREFERENCES, ...(u.preferences || {}) },
    createdAt: u.createdAt,
    ...(u.lastLoginAt ? { lastLoginAt: u.lastLoginAt } : {}),
    mustChangePassword: Boolean(u.mustChangePassword),
    passwordHash: u.passwordHash,
  };
}

export function sanitizeUser(user: StoredUser): UserAccount {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    appRole: user.appRole,
    status: user.status,
    phoneVerified: user.phoneVerified,
    totpEnabled: Boolean(user.totpEnabled),
    assignedProjectIds: user.assignedProjectIds ? [...user.assignedProjectIds] : [],
    active: user.active,
    preferences: user.preferences,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

// ---------------- EXPRESS RBAC MIDDLEWARE ----------------

function isEnRequest(req: Request): boolean {
  return String(req.headers['x-samaan-lang'] || '').toLowerCase() === 'en';
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const isEn = isEnRequest(req);
  if (!req.user || !req.currentUser || req.user.status !== 'APPROVED') {
    res.status(401).json({
      error: isEn ? 'Authentication required' : 'احراز هویت الزامی است',
    });
    return;
  }
  next();
}

export function requireSuperuser(req: AuthedRequest, res: Response, next: NextFunction): void {
  const isEn = isEnRequest(req);
  if (!req.user || !req.currentUser) {
    res.status(401).json({
      error: isEn ? 'Authentication required' : 'احراز هویت الزامی است',
    });
    return;
  }
  if (req.user.role !== 'SUPERUSER') {
    res.status(403).json({
      error: isEn
        ? 'Forbidden: Superuser privileges required'
        : 'دسترسی غیرمجاز: این عملیات فقط برای مدیر ارشد سامانه مجاز است',
    });
    return;
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const isEn = isEnRequest(req);
    if (!req.user || !req.currentUser || req.user.status !== 'APPROVED') {
      res.status(401).json({
        error: isEn ? 'Authentication required' : 'احراز هویت الزامی است',
      });
      return;
    }
    if (req.projectAccessDenied) {
      res.status(403).json({
        error: isEn
          ? 'Forbidden: You do not have access to this project'
          : 'دسترسی به این پروژه برای حساب کاربری شما مجاز نیست',
      });
      return;
    }
    if (!allowedRoles.includes(req.currentUser.role)) {
      res.status(403).json({
        error: isEn ? 'Insufficient permissions' : 'سطح دسترسی کافی نیست',
      });
      return;
    }
    next();
  };
}

// ---------------- AUTH REPOSITORY (POSTGRESQL + JSON FALLBACK) ----------------

interface AuthJsonState {
  users: AppUserRecord[];
  userProjectAccess: UserProjectAccessRecord[];
  smsOtps: SmsOtpRecord[];
  sessions: AuthSessionRecord[];
}

function emptyAuthJsonState(): AuthJsonState {
  return {
    users: [],
    userProjectAccess: [],
    smsOtps: [],
    sessions: [],
  };
}

interface PgAppUserRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password_hash: string;
  role: AppUserRole;
  status: AppUserStatus;
  phone_verified: boolean;
  totp_secret_enc: string | null;
  totp_enabled: boolean;
  requested_employer_id: string | null;
  requested_project_ids: unknown;
  preferences: unknown;
  must_change_password: boolean;
  last_login_at: string | Date | null;
  created_at: string | Date;
  approved_by: string | null;
  approved_at: string | Date | null;
}

function toIso(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapPgUserRow(row: PgAppUserRow): AppUserRecord {
  const reqProjs = Array.isArray(row.requested_project_ids)
    ? row.requested_project_ids.map((x) => String(x)).filter(Boolean)
    : [];
  const rawPrefs =
    row.preferences && typeof row.preferences === 'object'
      ? (row.preferences as Partial<UserPreferences>)
      : {};
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role === 'SUPERUSER' ? 'SUPERUSER' : 'USER',
    status:
      row.status === 'APPROVED' || row.status === 'REJECTED' ? row.status : 'PENDING',
    phoneVerified: Boolean(row.phone_verified),
    totpSecretEnc: row.totp_secret_enc || null,
    totpEnabled: Boolean(row.totp_enabled),
    requestedEmployerId: row.requested_employer_id || null,
    requestedProjectIds: reqProjs,
    preferences: { ...DEFAULT_PREFERENCES, ...rawPrefs },
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    approvedBy: row.approved_by || null,
    approvedAt: toIso(row.approved_at),
  };
}

export class AuthRepository {
  private mode: StorageMode = 'json';
  private poolOverride?: Pool;
  private jsonFilePath: string;
  private state: AuthJsonState = emptyAuthJsonState();
  private initialized = false;

  constructor(options?: { jsonFilePath?: string }) {
    this.jsonFilePath =
      options?.jsonFilePath || path.resolve(process.cwd(), 'data', 'samaan-auth.json');
  }

  public getMode(): StorageMode {
    return this.mode;
  }

  private getDbPool(): Pool {
    return this.poolOverride || getPool();
  }

  private loadJsonState(): void {
    try {
      if (!fs.existsSync(this.jsonFilePath)) {
        this.state = emptyAuthJsonState();
        return;
      }
      const raw = JSON.parse(fs.readFileSync(this.jsonFilePath, 'utf8')) as Partial<AuthJsonState>;
      this.state = {
        users: Array.isArray(raw.users) ? raw.users : [],
        userProjectAccess: Array.isArray(raw.userProjectAccess) ? raw.userProjectAccess : [],
        smsOtps: Array.isArray(raw.smsOtps) ? raw.smsOtps : [],
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      };
    } catch (err) {
      console.error('[auth] Failed to load JSON auth store, initializing empty:', err);
      this.state = emptyAuthJsonState();
    }
  }

  private saveJsonState(): void {
    const dir = path.dirname(this.jsonFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.jsonFilePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.jsonFilePath);
  }

  public async init(params: {
    mode: StorageMode;
    poolOverride?: Pool;
    env?: NodeJS.ProcessEnv;
  }): Promise<void> {
    this.mode = params.mode;
    this.poolOverride = params.poolOverride;
    if (this.mode === 'json') {
      this.loadJsonState();
    }
    await this.seedSuperuserFromEnv(params.env || process.env);
    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Idempotently seeds the pre-defined SUPERUSER strictly from environment variables:
   * SUPERUSER_PHONE, SUPERUSER_EMAIL, SUPERUSER_PASSWORD, SUPERUSER_FIRST_NAME, SUPERUSER_LAST_NAME.
   * Never hardcodes any credentials in source code.
   */
  public async seedSuperuserFromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<{ seeded: boolean; reason?: string }> {
    const rawPhone = String(env.SUPERUSER_PHONE || '').trim();
    const rawEmail = String(env.SUPERUSER_EMAIL || '').trim();
    const rawPassword = String(env.SUPERUSER_PASSWORD || '');
    const firstName = String(env.SUPERUSER_FIRST_NAME || 'مدیر').trim() || 'مدیر';
    const lastName = String(env.SUPERUSER_LAST_NAME || 'سامانه').trim() || 'سامانه';

    if (!rawPhone || !rawEmail || !rawPassword) {
      return { seeded: false, reason: 'env_incomplete' };
    }

    const phoneCheck = normalizeIranMobile(rawPhone);
    const emailCheck = normalizeEmail(rawEmail);
    if (!phoneCheck.valid || !emailCheck.valid || rawPassword.length < 6) {
      console.warn(
        '[auth] Skipping SUPERUSER env seed: invalid SUPERUSER_PHONE, SUPERUSER_EMAIL, or password < 6 chars.',
      );
      return { seeded: false, reason: 'env_invalid' };
    }

    const existing =
      (await this.findUserByPhone(phoneCheck.normalized)) ||
      (await this.findUserByEmail(emailCheck.normalized));

    const now = new Date().toISOString();
    if (existing) {
      const passwordHash = verifyPassword(rawPassword, existing.passwordHash)
        ? existing.passwordHash
        : hashPassword(rawPassword);

      if (this.mode === 'postgres') {
        const pool = this.getDbPool();
        await pool.query(
          `UPDATE app_users
           SET first_name = $1,
               last_name = $2,
               phone = $3,
               email = $4,
               password_hash = $5,
               role = 'SUPERUSER',
               status = 'APPROVED',
               phone_verified = TRUE,
               approved_by = COALESCE(approved_by, 'env-seed'),
               approved_at = COALESCE(approved_at, $6::timestamptz)
           WHERE id = $7`,
          [
            firstName,
            lastName,
            phoneCheck.normalized,
            emailCheck.normalized,
            passwordHash,
            now,
            existing.id,
          ],
        );
      } else {
        existing.firstName = firstName;
        existing.lastName = lastName;
        existing.phone = phoneCheck.normalized;
        existing.email = emailCheck.normalized;
        existing.passwordHash = passwordHash;
        existing.role = 'SUPERUSER';
        existing.status = 'APPROVED';
        existing.phoneVerified = true;
        existing.approvedBy = existing.approvedBy || 'env-seed';
        existing.approvedAt = existing.approvedAt || now;
        this.saveJsonState();
      }
      return { seeded: true };
    }

    const id = crypto.randomUUID();
    const passwordHash = hashPassword(rawPassword);

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `INSERT INTO app_users (
           id, first_name, last_name, phone, email, password_hash,
           role, status, phone_verified, totp_enabled,
           requested_employer_id, requested_project_ids, preferences,
           must_change_password, created_at, approved_by, approved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'SUPERUSER', 'APPROVED', TRUE, FALSE, NULL, '[]'::jsonb, $7::jsonb, FALSE, $8::timestamptz, 'env-seed', $8::timestamptz)`,
        [
          id,
          firstName,
          lastName,
          phoneCheck.normalized,
          emailCheck.normalized,
          passwordHash,
          JSON.stringify(DEFAULT_PREFERENCES),
          now,
        ],
      );
    } else {
      this.state.users.push({
        id,
        firstName,
        lastName,
        phone: phoneCheck.normalized,
        email: emailCheck.normalized,
        passwordHash,
        role: 'SUPERUSER',
        status: 'APPROVED',
        phoneVerified: true,
        totpSecretEnc: null,
        totpEnabled: false,
        requestedEmployerId: null,
        requestedProjectIds: [],
        preferences: { ...DEFAULT_PREFERENCES },
        mustChangePassword: false,
        lastLoginAt: null,
        createdAt: now,
        approvedBy: 'env-seed',
        approvedAt: now,
      });
      this.saveJsonState();
    }

    return { seeded: true };
  }

  public async hasAnySuperuser(): Promise<boolean> {
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM app_users WHERE role = 'SUPERUSER' AND status = 'APPROVED'`,
      );
      return Number(res.rows[0]?.cnt || 0) > 0;
    }
    return this.state.users.some((u) => u.role === 'SUPERUSER' && u.status === 'APPROVED');
  }

  /**
   * One-time initial Superuser bootstrap strictly allowed ONLY when zero superusers exist
   * (e.g., when SUPERUSER_* env vars have not been provided yet in local preview).
   */
  public async bootstrapInitialSuperuser(input: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
    preferences?: Partial<UserPreferences>;
  }): Promise<AppUserRecord> {
    const alreadyExists = await this.hasAnySuperuser();
    if (alreadyExists) {
      throw new Error('SUPERUSER_ALREADY_EXISTS');
    }
    const now = new Date().toISOString();
    const record: AppUserRecord = {
      id: crypto.randomUUID(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone,
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      role: 'SUPERUSER',
      status: 'APPROVED',
      phoneVerified: true,
      totpSecretEnc: null,
      totpEnabled: false,
      requestedEmployerId: null,
      requestedProjectIds: [],
      preferences: { ...DEFAULT_PREFERENCES, ...(input.preferences || {}) },
      mustChangePassword: false,
      lastLoginAt: now,
      createdAt: now,
      approvedBy: 'initial-bootstrap',
      approvedAt: now,
    };

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `INSERT INTO app_users (
           id, first_name, last_name, phone, email, password_hash,
           role, status, phone_verified, totp_enabled,
           requested_employer_id, requested_project_ids, preferences,
           must_change_password, last_login_at, created_at, approved_by, approved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'SUPERUSER', 'APPROVED', TRUE, FALSE, NULL, '[]'::jsonb, $7::jsonb, FALSE, $8::timestamptz, $8::timestamptz, 'initial-bootstrap', $8::timestamptz)`,
        [
          record.id,
          record.firstName,
          record.lastName,
          record.phone,
          record.email,
          record.passwordHash,
          JSON.stringify(record.preferences),
          now,
        ],
      );
    } else {
      this.state.users.push(record);
      this.saveJsonState();
    }
    return record;
  }

  public async findUserById(id: string): Promise<AppUserRecord | null> {
    if (!id) return null;
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `SELECT * FROM app_users WHERE id = $1 LIMIT 1`,
        [id],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    return this.state.users.find((u) => u.id === id) || null;
  }

  public async findUserByPhone(normalizedPhone: string): Promise<AppUserRecord | null> {
    if (!normalizedPhone) return null;
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `SELECT * FROM app_users WHERE phone = $1 LIMIT 1`,
        [normalizedPhone],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    return this.state.users.find((u) => u.phone === normalizedPhone) || null;
  }

  public async findUserByEmail(normalizedEmail: string): Promise<AppUserRecord | null> {
    const clean = normalizedEmail.trim().toLowerCase();
    if (!clean) return null;
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `SELECT * FROM app_users WHERE LOWER(email) = $1 LIMIT 1`,
        [clean],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    return this.state.users.find((u) => u.email.toLowerCase() === clean) || null;
  }

  public async findUserByIdentifier(rawIdentifier: string): Promise<AppUserRecord | null> {
    const trimmed = String(rawIdentifier || '').trim();
    if (!trimmed) return null;
    if (trimmed.includes('@')) {
      const emailCheck = normalizeEmail(trimmed);
      return emailCheck.valid ? this.findUserByEmail(emailCheck.normalized) : null;
    }
    const phoneCheck = normalizeIranMobile(trimmed);
    if (phoneCheck.valid) {
      return this.findUserByPhone(phoneCheck.normalized);
    }
    return this.findUserByEmail(trimmed.toLowerCase());
  }

  public async createPendingUser(input: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
    requestedEmployerId: string | null;
    requestedProjectIds: string[];
  }): Promise<AppUserRecord> {
    const now = new Date().toISOString();
    const uniqueProjects = Array.from(
      new Set(input.requestedProjectIds.map((p) => String(p).trim()).filter(Boolean)),
    );
    const record: AppUserRecord = {
      id: crypto.randomUUID(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone,
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      role: 'USER',
      status: 'PENDING',
      phoneVerified: true,
      totpSecretEnc: null,
      totpEnabled: false,
      requestedEmployerId: input.requestedEmployerId || null,
      requestedProjectIds: uniqueProjects,
      preferences: { ...DEFAULT_PREFERENCES },
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
    };

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `INSERT INTO app_users (
           id, first_name, last_name, phone, email, password_hash,
           role, status, phone_verified, totp_enabled,
           requested_employer_id, requested_project_ids, preferences,
           must_change_password, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'USER', 'PENDING', TRUE, FALSE, $7, $8::jsonb, $9::jsonb, FALSE, $10::timestamptz)`,
        [
          record.id,
          record.firstName,
          record.lastName,
          record.phone,
          record.email,
          record.passwordHash,
          record.requestedEmployerId,
          JSON.stringify(record.requestedProjectIds),
          JSON.stringify(record.preferences),
          now,
        ],
      );
    } else {
      this.state.users.push(record);
      this.saveJsonState();
    }
    return record;
  }

  public async listAllUsersWithAccess(): Promise<AdminManagedUser[]> {
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const [usersRes, accessRes] = await Promise.all([
        pool.query<PgAppUserRow>(`SELECT * FROM app_users ORDER BY created_at DESC`),
        pool.query<{ user_id: string; project_id: string }>(
          `SELECT user_id, project_id FROM user_project_access ORDER BY assigned_at ASC`,
        ),
      ]);
      const accessMap = new Map<string, string[]>();
      for (const row of accessRes.rows) {
        const list = accessMap.get(row.user_id) || [];
        list.push(row.project_id);
        accessMap.set(row.user_id, list);
      }
      return usersRes.rows.map((r) => {
        const u = mapPgUserRow(r);
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          fullName: `${u.firstName} ${u.lastName}`.trim(),
          phone: u.phone,
          email: u.email,
          role: u.role,
          status: u.status,
          phoneVerified: u.phoneVerified,
          totpEnabled: u.totpEnabled,
          requestedEmployerId: u.requestedEmployerId,
          requestedProjectIds: [...u.requestedProjectIds],
          assignedProjectIds: accessMap.get(u.id) || [],
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          approvedBy: u.approvedBy,
          approvedAt: u.approvedAt,
        };
      });
    }

    const accessMap = new Map<string, string[]>();
    for (const row of this.state.userProjectAccess) {
      const list = accessMap.get(row.userId) || [];
      list.push(row.projectId);
      accessMap.set(row.userId, list);
    }

    return [...this.state.users]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`.trim(),
        phone: u.phone,
        email: u.email,
        role: u.role,
        status: u.status,
        phoneVerified: u.phoneVerified,
        totpEnabled: u.totpEnabled,
        requestedEmployerId: u.requestedEmployerId,
        requestedProjectIds: [...u.requestedProjectIds],
        assignedProjectIds: accessMap.get(u.id) || [],
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        approvedBy: u.approvedBy,
        approvedAt: u.approvedAt,
      }));
  }

  public async getUserAssignedProjectIds(userId: string): Promise<string[]> {
    if (!userId) return [];
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<{ project_id: string }>(
        `SELECT project_id FROM user_project_access WHERE user_id = $1 ORDER BY assigned_at ASC`,
        [userId],
      );
      return res.rows.map((r) => r.project_id);
    }
    return this.state.userProjectAccess
      .filter((r) => r.userId === userId)
      .map((r) => r.projectId);
  }

  public async hasUserProjectAccess(userId: string, projectId: string): Promise<boolean> {
    if (!userId || !projectId) return false;
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<{ ok: number }>(
        `SELECT 1 AS ok FROM user_project_access WHERE user_id = $1 AND project_id = $2 LIMIT 1`,
        [userId, projectId],
      );
      return res.rows.length > 0;
    }
    return this.state.userProjectAccess.some(
      (r) => r.userId === userId && r.projectId === projectId,
    );
  }

  public async removeProjectAccessForDeletedProject(projectId: string): Promise<void> {
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(`DELETE FROM user_project_access WHERE project_id = $1`, [projectId]);
      return;
    }
    const before = this.state.userProjectAccess.length;
    this.state.userProjectAccess = this.state.userProjectAccess.filter(
      (r) => r.projectId !== projectId,
    );
    if (this.state.userProjectAccess.length !== before) {
      this.saveJsonState();
    }
  }

  public async updateUserAccessAndStatus(
    userId: string,
    input: {
      status?: AppUserStatus;
      projectIds?: string[];
      approvedBy: string;
    },
  ): Promise<AdminManagedUser | null> {
    const existing = await this.findUserById(userId);
    if (!existing) return null;

    const nextStatus = input.status ?? existing.status;
    const now = new Date().toISOString();
    const cleanProjectIds =
      input.projectIds !== undefined
        ? Array.from(new Set(input.projectIds.map((p) => String(p).trim()).filter(Boolean)))
        : null;

    if (this.mode === 'postgres') {
      await withTransaction(async (client) => {
        if (input.status !== undefined) {
          await client.query(
            `UPDATE app_users
             SET status = $1,
                 approved_by = $2,
                 approved_at = CASE WHEN $1 = 'APPROVED' THEN $3::timestamptz ELSE approved_at END
             WHERE id = $4`,
            [nextStatus, input.approvedBy, now, userId],
          );
        }

        if (cleanProjectIds !== null) {
          await client.query(`DELETE FROM user_project_access WHERE user_id = $1`, [userId]);
          for (const projId of cleanProjectIds) {
            await client.query(
              `INSERT INTO user_project_access (user_id, project_id, assigned_by, assigned_at)
               VALUES ($1, $2, $3, $4::timestamptz)
               ON CONFLICT (user_id, project_id) DO NOTHING`,
              [userId, projId, input.approvedBy, now],
            );
          }
        }

        if (nextStatus !== 'APPROVED') {
          await client.query(
            `UPDATE auth_sessions SET revoked_at = $1::timestamptz WHERE user_id = $2 AND revoked_at IS NULL`,
            [now, userId],
          );
        }
      }, this.poolOverride);
    } else {
      if (input.status !== undefined) {
        existing.status = nextStatus;
        existing.approvedBy = input.approvedBy;
        if (nextStatus === 'APPROVED') {
          existing.approvedAt = now;
        }
      }
      if (cleanProjectIds !== null) {
        this.state.userProjectAccess = this.state.userProjectAccess.filter(
          (r) => r.userId !== userId,
        );
        for (const projId of cleanProjectIds) {
          this.state.userProjectAccess.push({
            userId,
            projectId: projId,
            assignedBy: input.approvedBy,
            assignedAt: now,
          });
        }
      }
      if (nextStatus !== 'APPROVED') {
        for (const sess of this.state.sessions) {
          if (sess.userId === userId && !sess.revokedAt) {
            sess.revokedAt = now;
          }
        }
      }
      this.saveJsonState();
    }

    const updatedList = await this.listAllUsersWithAccess();
    return updatedList.find((u) => u.id === userId) || null;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query(`DELETE FROM app_users WHERE id = $1`, [userId]);
      return (res.rowCount || 0) > 0;
    }
    const idx = this.state.users.findIndex((u) => u.id === userId);
    if (idx === -1) return false;
    this.state.users.splice(idx, 1);
    this.state.userProjectAccess = this.state.userProjectAccess.filter(
      (r) => r.userId !== userId,
    );
    this.state.sessions = this.state.sessions.filter((s) => s.userId !== userId);
    this.saveJsonState();
    return true;
  }

  public async updateUserPreferences(
    userId: string,
    prefs: UserPreferences,
  ): Promise<AppUserRecord | null> {
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `UPDATE app_users SET preferences = $1::jsonb WHERE id = $2 RETURNING *`,
        [JSON.stringify(prefs), userId],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    const u = this.state.users.find((x) => x.id === userId);
    if (!u) return null;
    u.preferences = { ...prefs };
    this.saveJsonState();
    return u;
  }

  public async updateUserPassword(
    userId: string,
    newPassword: string,
    mustChangePassword = false,
  ): Promise<AppUserRecord | null> {
    const hash = hashPassword(newPassword);
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `UPDATE app_users SET password_hash = $1, must_change_password = $2 WHERE id = $3 RETURNING *`,
        [hash, mustChangePassword, userId],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    const u = this.state.users.find((x) => x.id === userId);
    if (!u) return null;
    u.passwordHash = hash;
    u.mustChangePassword = mustChangePassword;
    this.saveJsonState();
    return u;
  }

  public async setUserTotp(
    userId: string,
    secretPlaintext: string | null,
    enabled: boolean,
  ): Promise<AppUserRecord | null> {
    const encrypted = secretPlaintext ? encryptTotpSecret(secretPlaintext) : null;
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<PgAppUserRow>(
        `UPDATE app_users SET totp_secret_enc = $1, totp_enabled = $2 WHERE id = $3 RETURNING *`,
        [encrypted, enabled, userId],
      );
      return res.rows[0] ? mapPgUserRow(res.rows[0]) : null;
    }
    const u = this.state.users.find((x) => x.id === userId);
    if (!u) return null;
    u.totpSecretEnc = encrypted;
    u.totpEnabled = enabled;
    this.saveJsonState();
    return u;
  }

  public async recordUserLastLogin(userId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(`UPDATE app_users SET last_login_at = $1::timestamptz WHERE id = $2`, [
        now,
        userId,
      ]);
      return;
    }
    const u = this.state.users.find((x) => x.id === userId);
    if (u) {
      u.lastLoginAt = now;
      this.saveJsonState();
    }
  }

  // ---------------- SMS OTP STORAGE ----------------

  public async createSmsOtp(
    normalizedPhone: string,
    purpose: SmsOtpPurpose,
    ttlSeconds = OTP_TTL_SECONDS,
  ): Promise<{ id: string; code: string; expiresAt: string }> {
    const code = String(crypto.randomInt(100000, 1000000));
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const codeHash = hashOtpCode(normalizedPhone, purpose, code);

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await withTransaction(async (client) => {
        // Invalidate any previous unconsumed OTPs for the same phone + purpose
        await client.query(
          `UPDATE sms_otps
           SET consumed_at = $1::timestamptz
           WHERE phone = $2 AND purpose = $3 AND consumed_at IS NULL`,
          [now.toISOString(), normalizedPhone, purpose],
        );
        await client.query(
          `INSERT INTO sms_otps (id, phone, purpose, code_hash, attempts, expires_at, created_at)
           VALUES ($1, $2, $3, $4, 0, $5::timestamptz, $6::timestamptz)`,
          [id, normalizedPhone, purpose, codeHash, expiresAt, now.toISOString()],
        );
      }, this.poolOverride);
    } else {
      const nowIso = now.toISOString();
      for (const otp of this.state.smsOtps) {
        if (otp.phone === normalizedPhone && otp.purpose === purpose && !otp.consumedAt) {
          otp.consumedAt = nowIso;
        }
      }
      this.state.smsOtps.push({
        id,
        phone: normalizedPhone,
        purpose,
        codeHash,
        attempts: 0,
        expiresAt,
        consumedAt: null,
        createdAt: nowIso,
      });
      // Keep JSON OTP history bounded
      if (this.state.smsOtps.length > 500) {
        this.state.smsOtps = this.state.smsOtps.slice(-300);
      }
      this.saveJsonState();
    }

    return { id, code, expiresAt };
  }

  public async verifySmsOtp(
    normalizedPhone: string,
    purpose: SmsOtpPurpose,
    rawCode: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'missing' | 'expired' | 'max_attempts' | 'mismatch' }> {
    const cleanCode = normalizeDigits(String(rawCode || '')).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      return { ok: false, reason: 'mismatch' };
    }
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const candidateHash = hashOtpCode(normalizedPhone, purpose, cleanCode);

    const compareHashes = (a: string, b: string): boolean => {
      const aBuf = Buffer.from(a, 'hex');
      const bBuf = Buffer.from(b, 'hex');
      if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
      return crypto.timingSafeEqual(aBuf, bBuf);
    };

    if (this.mode === 'postgres') {
      return withTransaction(async (client) => {
        const res = await client.query<{
          id: string;
          code_hash: string;
          attempts: number;
          expires_at: string | Date;
        }>(
          `SELECT id, code_hash, attempts, expires_at
           FROM sms_otps
           WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [normalizedPhone, purpose],
        );
        const row = res.rows[0];
        if (!row) return { ok: false as const, reason: 'missing' as const };
        const expMs = new Date(row.expires_at).getTime();
        if (expMs <= now) {
          await client.query(`UPDATE sms_otps SET consumed_at = $1::timestamptz WHERE id = $2`, [
            nowIso,
            row.id,
          ]);
          return { ok: false as const, reason: 'expired' as const };
        }
        if (row.attempts >= OTP_MAX_ATTEMPTS) {
          await client.query(`UPDATE sms_otps SET consumed_at = $1::timestamptz WHERE id = $2`, [
            nowIso,
            row.id,
          ]);
          return { ok: false as const, reason: 'max_attempts' as const };
        }
        if (!compareHashes(row.code_hash, candidateHash)) {
          const nextAttempts = row.attempts + 1;
          await client.query(
            `UPDATE sms_otps
             SET attempts = $1,
                 consumed_at = CASE WHEN $1 >= $2 THEN $3::timestamptz ELSE consumed_at END
             WHERE id = $4`,
            [nextAttempts, OTP_MAX_ATTEMPTS, nowIso, row.id],
          );
          return {
            ok: false as const,
            reason: nextAttempts >= OTP_MAX_ATTEMPTS ? ('max_attempts' as const) : ('mismatch' as const),
          };
        }
        await client.query(`UPDATE sms_otps SET consumed_at = $1::timestamptz WHERE id = $2`, [
          nowIso,
          row.id,
        ]);
        return { ok: true as const };
      }, this.poolOverride);
    }

    const candidates = this.state.smsOtps
      .filter((o) => o.phone === normalizedPhone && o.purpose === purpose && !o.consumedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = candidates[0];
    if (!latest) return { ok: false, reason: 'missing' };

    if (new Date(latest.expiresAt).getTime() <= now) {
      latest.consumedAt = nowIso;
      this.saveJsonState();
      return { ok: false, reason: 'expired' };
    }
    if (latest.attempts >= OTP_MAX_ATTEMPTS) {
      latest.consumedAt = nowIso;
      this.saveJsonState();
      return { ok: false, reason: 'max_attempts' };
    }
    if (!compareHashes(latest.codeHash, candidateHash)) {
      latest.attempts += 1;
      if (latest.attempts >= OTP_MAX_ATTEMPTS) {
        latest.consumedAt = nowIso;
      }
      this.saveJsonState();
      return {
        ok: false,
        reason: latest.attempts >= OTP_MAX_ATTEMPTS ? 'max_attempts' : 'mismatch',
      };
    }

    latest.consumedAt = nowIso;
    this.saveJsonState();
    return { ok: true };
  }

  // ---------------- HASHED AUTH SESSIONS ----------------

  public async createSession(
    userId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ rawToken: string; sessionId: string; expiresAt: string }> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(rawToken);
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    const ipAddress = meta?.ipAddress ? String(meta.ipAddress).slice(0, 120) : null;
    const userAgent = meta?.userAgent ? String(meta.userAgent).slice(0, 300) : null;

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)`,
        [sessionId, userId, tokenHash, expiresAt, nowIso, ipAddress, userAgent],
      );
    } else {
      this.state.sessions.push({
        id: sessionId,
        userId,
        tokenHash,
        expiresAt,
        revokedAt: null,
        createdAt: nowIso,
        ipAddress,
        userAgent,
      });
      if (this.state.sessions.length > 1000) {
        const nowMs = Date.now();
        this.state.sessions = this.state.sessions.filter(
          (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > nowMs,
        );
      }
      this.saveJsonState();
    }

    return { rawToken, sessionId, expiresAt };
  }

  public async resolveSession(rawToken: string | null | undefined): Promise<{
    sessionId: string;
    appUser: AppUserRecord;
    assignedProjectIds: string[];
  } | null> {
    if (!rawToken || rawToken.length < 16) return null;
    const tokenHash = hashSessionToken(rawToken);
    const now = Date.now();

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      const res = await pool.query<{ session_id: string; user_id: string }>(
        `SELECT id AS session_id, user_id
         FROM auth_sessions
         WHERE token_hash = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()
         LIMIT 1`,
        [tokenHash],
      );
      const row = res.rows[0];
      if (!row) return null;
      const appUser = await this.findUserById(row.user_id);
      if (!appUser || appUser.status !== 'APPROVED') return null;
      const assignedProjectIds =
        appUser.role === 'SUPERUSER' ? [] : await this.getUserAssignedProjectIds(appUser.id);
      return { sessionId: row.session_id, appUser, assignedProjectIds };
    }

    const session = this.state.sessions.find(
      (s) => s.tokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt).getTime() > now,
    );
    if (!session) return null;
    const appUser = this.state.users.find((u) => u.id === session.userId);
    if (!appUser || appUser.status !== 'APPROVED') return null;
    const assignedProjectIds =
      appUser.role === 'SUPERUSER'
        ? []
        : this.state.userProjectAccess
            .filter((r) => r.userId === appUser.id)
            .map((r) => r.projectId);
    return { sessionId: session.id, appUser, assignedProjectIds };
  }

  public async revokeSessionByToken(rawToken: string | null | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashSessionToken(rawToken);
    const nowIso = new Date().toISOString();

    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = $1::timestamptz WHERE token_hash = $2 AND revoked_at IS NULL`,
        [nowIso, tokenHash],
      );
      return;
    }

    let changed = false;
    for (const s of this.state.sessions) {
      if (s.tokenHash === tokenHash && !s.revokedAt) {
        s.revokedAt = nowIso;
        changed = true;
      }
    }
    if (changed) {
      this.saveJsonState();
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    if (this.mode === 'postgres') {
      const pool = this.getDbPool();
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = $1::timestamptz WHERE user_id = $2 AND revoked_at IS NULL`,
        [nowIso, userId],
      );
      return;
    }
    let changed = false;
    for (const s of this.state.sessions) {
      if (s.userId === userId && !s.revokedAt) {
        s.revokedAt = nowIso;
        changed = true;
      }
    }
    if (changed) {
      this.saveJsonState();
    }
  }
}

export const authRepository = new AuthRepository();
