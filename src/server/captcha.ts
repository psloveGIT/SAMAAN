import crypto from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { normalizeDigits } from '../shared/jalali.ts';

export interface CaptchaChallenge {
  captchaId: string;
  svg: string;
  expiresInSeconds: number;
}

interface StoredCaptcha {
  answerLower: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_STORED_CAPTCHAS = 5000;

export class CaptchaService {
  private readonly store = new Map<string, StoredCaptcha>();
  private readonly ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.cleanupTimer = setInterval(() => {
      this.purgeExpired();
    }, 60_000);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  public purgeExpired(now = Date.now()): void {
    for (const [id, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(id);
      }
    }
  }

  public generate(now = Date.now()): CaptchaChallenge {
    this.purgeExpired(now);

    // Bound memory usage against CAPTCHA flooding
    if (this.store.size >= MAX_STORED_CAPTCHAS) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    const generated = svgCaptcha.create({
      size: 5,
      noise: 3,
      color: true,
      ignoreChars: '0oO1ilI',
      background: '#f1f5f9',
      width: 156,
      height: 48,
      fontSize: 44,
    });

    const captchaId = crypto.randomUUID();
    this.store.set(captchaId, {
      answerLower: generated.text.trim().toLowerCase(),
      expiresAt: now + this.ttlMs,
    });

    return {
      captchaId,
      svg: generated.data,
      expiresInSeconds: Math.floor(this.ttlMs / 1000),
    };
  }

  /**
   * Single-use, case-insensitive CAPTCHA verification.
   * Always deletes the stored entry upon lookup to prevent replay or brute-force retries.
   */
  public verify(
    captchaId: string | undefined | null,
    userInput: string | undefined | null,
    now = Date.now(),
  ): boolean {
    const cleanId = String(captchaId || '').trim();
    const cleanInput = normalizeDigits(String(userInput || '')).trim().toLowerCase();
    if (!cleanId || !cleanInput) return false;

    const record = this.store.get(cleanId);
    if (!record) return false;

    // Single-use: consume immediately regardless of match outcome
    this.store.delete(cleanId);

    if (record.expiresAt <= now) {
      return false;
    }

    const expectedBuf = Buffer.from(record.answerLower, 'utf8');
    const actualBuf = Buffer.from(cleanInput, 'utf8');
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  public size(): number {
    return this.store.size;
  }

  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

export const captchaService = new CaptchaService();
