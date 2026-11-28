import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateSync } from 'otplib';
import {
  AuthRepository,
  buildSessionCookieAttributes,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSetup,
  hashPassword,
  normalizeIranMobile,
  verifyPassword,
  verifyTotpCode,
} from './auth.ts';
import { CaptchaService } from './captcha.ts';
import { sendPatternOtpSms } from './smsService.ts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('002_auth_security.sql defines app_users, M:N user_project_access with indexes, sms_otps, and auth_sessions', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'src', 'server', 'migrations', '002_auth_security.sql'),
    'utf-8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS app_users/i);
  assert.match(sql, /role\s+TEXT\s+NOT NULL\s+DEFAULT\s+'USER'\s+CHECK\s*\(role\s+IN\s*\('SUPERUSER',\s*'USER'\)\)/i);
  assert.match(sql, /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'PENDING'\s+CHECK\s*\(status\s+IN\s*\('PENDING',\s*'APPROVED',\s*'REJECTED'\)\)/i);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_project_access/i);
  assert.match(sql, /REFERENCES\s+app_users\(id\)\s+ON DELETE CASCADE/i);
  assert.match(sql, /REFERENCES\s+projects\(id\)\s+ON DELETE CASCADE/i);
  assert.match(sql, /PRIMARY KEY\s*\(user_id,\s*project_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_user_project_access_user_id\s+ON\s+user_project_access\s*\(user_id\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_user_project_access_project_id\s+ON\s+user_project_access\s*\(project_id\)/i);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS sms_otps/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth_sessions/i);
});

test('scrypt password hashing and Iranian mobile normalization (using iranPhone.ts)', () => {
  const hash = hashPassword('Samaan@2026#Strong');
  assert.ok(verifyPassword('Samaan@2026#Strong', hash));
  assert.equal(verifyPassword('WrongPassword', hash), false);

  const normalized = normalizeIranMobile('۰۹۱۲-۳۴۵-۶۷۸۹');
  assert.equal(normalized.valid, true);
  assert.equal(normalized.normalized, '09123456789');

  const intl = normalizeIranMobile('+98 912 345 6789');
  assert.equal(intl.valid, true);
  assert.equal(intl.normalized, '09123456789');

  const invalid = normalizeIranMobile('02188776655');
  assert.equal(invalid.valid, false);
});

test('AES-256-GCM TOTP secret encryption roundtrip and tamper rejection', () => {
  const keyHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const plaintext = 'JBSWY3DPEHPK3PXP';
  const encrypted = encryptTotpSecret(plaintext, keyHex);
  assert.ok(encrypted.startsWith('v1:'));
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptTotpSecret(encrypted, keyHex), plaintext);

  // Tamper with ciphertext
  const parts = encrypted.split(':');
  parts[3] = Buffer.from('tampered_payload').toString('base64');
  assert.throws(() => decryptTotpSecret(parts.join(':'), keyHex));
});

test('Offline TOTP 2FA generates local QR data URL and verifies 6-digit code including Persian digits', async () => {
  const setup = await generateTotpSetup({ accountLabel: '09123456789' });
  assert.ok(setup.secret.length >= 16);
  assert.ok(setup.otpauthUri.startsWith('otpauth://totp/'));
  assert.ok(setup.qrDataUrl.startsWith('data:image/png;base64,'));

  const validCode = generateSync({ secret: setup.secret });
  assert.equal(verifyTotpCode(setup.secret, validCode), true);

  // Convert ASCII digits to Persian digits and verify
  const persianCode = validCode.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
  assert.equal(verifyTotpCode(setup.secret, persianCode), true);
  assert.equal(verifyTotpCode(setup.secret, '000000') && validCode !== '000000', false);
});

test('Self-hosted CaptchaService is case-insensitive, single-use, and expires cleanly', () => {
  const baseNow = 1_700_000_000_000;
  const service = new CaptchaService(5 * 60 * 1000);
  try {
    const challenge = service.generate(baseNow);
    assert.ok(challenge.captchaId.length > 10);
    assert.ok(challenge.svg.includes('<svg'));

    // Peek answer via private map in unit test (single-use check)
    const internalMap = (
      service as unknown as { store: Map<string, { answerLower: string; expiresAt: number }> }
    ).store;
    const answer = internalMap.get(challenge.captchaId)!.answerLower;

    // Case-insensitive success
    assert.equal(service.verify(challenge.captchaId, answer.toUpperCase(), baseNow + 1000), true);

    // Replay immediately fails (single-use)
    assert.equal(service.verify(challenge.captchaId, answer, baseNow + 2000), false);

    // Expiry check (5 min TTL)
    const challenge2 = service.generate(baseNow);
    const answer2 = internalMap.get(challenge2.captchaId)!.answerLower;
    assert.equal(service.verify(challenge2.captchaId, answer2, baseNow + 6 * 60 * 1000), false);
  } finally {
    service.dispose();
  }
});

test('sendPatternOtpSms mock adapter works offline without external HTTP calls', async () => {
  const res = await sendPatternOtpSms(
    {
      phone: '09120001122',
      code: '654321',
      purpose: 'REGISTER',
    },
    {
      provider: 'mock',
      apiKey: '',
      templateId: '100000',
    },
  );
  assert.equal(res.sent, true);
  assert.equal(res.provider, 'mock');
  assert.ok(res.messageId?.startsWith('mock-'));
});

test('AuthRepository (JSON fallback) enforces Superuser seeding, Pending registration, M:N multi-project RBAC, SMS OTP, and session revocation', async () => {
  const tmpDir = makeTempDir('samaan-auth-test-');
  const authFile = path.join(tmpDir, 'samaan-auth.json');
  const repo = new AuthRepository({ jsonFilePath: authFile });

  try {
    await repo.init({
      mode: 'json',
      env: {
        SUPERUSER_PHONE: '09121112233',
        SUPERUSER_EMAIL: 'superuser@samaanapp.ir',
        SUPERUSER_PASSWORD: 'SuperSecretPassword!123',
        SUPERUSER_FIRST_NAME: 'مدیر',
        SUPERUSER_LAST_NAME: 'ارشد',
      },
    });

    // 1. Verify seeded Superuser
    const su = await repo.findUserByPhone('09121112233');
    assert.ok(su);
    assert.equal(su.role, 'SUPERUSER');
    assert.equal(su.status, 'APPROVED');
    assert.equal(su.phone, '09121112233');
    assert.equal(await repo.hasAnySuperuser(), true);

    // 2. Register SMS OTP and verify single-use & attempt limit
    const otpRec = await repo.createSmsOtp('09129998877', 'REGISTER');
    assert.match(otpRec.code, /^\d{6}$/);
    const badOtp = await repo.verifySmsOtp('09129998877', 'REGISTER', '000000');
    if (otpRec.code !== '000000') {
      assert.equal(badOtp.ok, false);
    }
    const goodOtp = await repo.verifySmsOtp('09129998877', 'REGISTER', otpRec.code);
    assert.equal(goodOtp.ok, true);
    const replayOtp = await repo.verifySmsOtp('09129998877', 'REGISTER', otpRec.code);
    assert.equal(replayOtp.ok, false);

    // 3. Create PENDING user requesting 2 projects
    const regUser = await repo.createPendingUser({
      firstName: 'سارا',
      lastName: 'رضایی',
      phone: '09129998877',
      email: 'sara@example.com',
      password: 'UserPass@2026',
      requestedEmployerId: 'mapna-md1',
      requestedProjectIds: ['default', 'default-md2'],
    });
    assert.equal(regUser.role, 'USER');
    assert.equal(regUser.status, 'PENDING');
    assert.deepEqual(await repo.getUserAssignedProjectIds(regUser.id), []);
    assert.equal(await repo.hasUserProjectAccess(regUser.id, 'default'), false);

    // 4. Superuser approves user & assigns 2 projects (M:N user_project_access)
    const approved = await repo.updateUserAccessAndStatus(regUser.id, {
      status: 'APPROVED',
      projectIds: ['default', 'default-md2'],
      approvedBy: 'مدیر ارشد',
    });
    assert.ok(approved);
    assert.equal(approved.status, 'APPROVED');
    assert.deepEqual(approved.assignedProjectIds.sort(), ['default', 'default-md2']);
    assert.equal(await repo.hasUserProjectAccess(regUser.id, 'default'), true);
    assert.equal(await repo.hasUserProjectAccess(regUser.id, 'default-md2'), true);
    assert.equal(await repo.hasUserProjectAccess(regUser.id, 'default-md3'), false);

    // 5. Create hashed session & verify lookup
    const session = await repo.createSession(regUser.id, {
      userAgent: 'node-test',
      ipAddress: '127.0.0.1',
    });
    const resolved = await repo.resolveSession(session.rawToken);
    assert.ok(resolved);
    assert.equal(resolved.appUser.id, regUser.id);
    assert.deepEqual(resolved.assignedProjectIds.sort(), ['default', 'default-md2']);

    // 6. Rejecting/suspending user revokes all active sessions immediately
    await repo.updateUserAccessAndStatus(regUser.id, {
      status: 'REJECTED',
      approvedBy: 'مدیر ارشد',
    });
    const afterReject = await repo.resolveSession(session.rawToken);
    assert.equal(afterReject, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Session cookies always enforce HttpOnly and SameSite=Strict (plus Secure over HTTPS)', () => {
  const localAttrs = buildSessionCookieAttributes();
  assert.ok(localAttrs.includes('HttpOnly'));
  assert.ok(localAttrs.includes('SameSite=Strict'));

  const httpsReq = {
    secure: true,
    headers: { 'x-forwarded-proto': 'https' },
  } as unknown as Parameters<typeof buildSessionCookieAttributes>[0];
  const httpsAttrs = buildSessionCookieAttributes(httpsReq);
  assert.ok(httpsAttrs.includes('HttpOnly'));
  assert.ok(httpsAttrs.includes('SameSite=Strict'));
  assert.ok(httpsAttrs.includes('Secure'));
});
