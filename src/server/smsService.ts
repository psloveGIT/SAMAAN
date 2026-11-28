export type SmsProvider = 'mock' | 'smsir' | 'kavenegar';
export type SmsOtpPurpose = 'LOGIN' | 'REGISTER';

export interface SmsSendResult {
  sent: boolean;
  provider: SmsProvider;
  messageId?: string;
}

export interface SmsServiceConfig {
  provider: SmsProvider;
  apiKey: string;
  templateId: string;
}

export function resolveSmsConfig(env: NodeJS.ProcessEnv = process.env): SmsServiceConfig {
  const rawProvider = String(env.SMS_PROVIDER || 'mock').trim().toLowerCase();
  const provider: SmsProvider =
    rawProvider === 'smsir' || rawProvider === 'kavenegar' ? rawProvider : 'mock';
  return {
    provider,
    apiKey: String(env.SMS_API_KEY || '').trim(),
    templateId: String(env.SMS_TEMPLATE_ID || '').trim(),
  };
}

/**
 * Clean Iranian shared-pattern OTP SMS adapter.
 * Supports:
 * - `mock`: prints the OTP code to server logs for local/offline development (never exposes in HTTP body).
 * - `smsir`: SMS.ir Verify API (`https://api.sms.ir/v1/send/verify`) using shared pattern `templateId`.
 * - `kavenegar`: Kavenegar Verify Lookup API (`https://api.kavenegar.com/v1/{apiKey}/verify/lookup.json`).
 */
export async function sendPatternOtpSms(
  params: {
    phone: string;
    code: string;
    purpose: SmsOtpPurpose;
  },
  configOverride?: Partial<SmsServiceConfig>,
): Promise<SmsSendResult> {
  const baseConfig = resolveSmsConfig();
  const config: SmsServiceConfig = {
    provider: configOverride?.provider ?? baseConfig.provider,
    apiKey: configOverride?.apiKey ?? baseConfig.apiKey,
    templateId: configOverride?.templateId ?? baseConfig.templateId,
  };

  if (config.provider === 'mock') {
    console.info(
      `[SAMAAN SMS MOCK] purpose=${params.purpose} phone=${params.phone} code=${params.code} (valid 5m)`,
    );
    return {
      sent: true,
      provider: 'mock',
      messageId: `mock-${Date.now()}`,
    };
  }

  if (!config.apiKey || !config.templateId) {
    throw new Error(
      `SMS provider "${config.provider}" is configured, but SMS_API_KEY or SMS_TEMPLATE_ID is missing.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    if (config.provider === 'smsir') {
      const numericTemplateId = Number(config.templateId);
      if (!Number.isFinite(numericTemplateId) || numericTemplateId <= 0) {
        throw new Error('SMS.ir requires a numeric SMS_TEMPLATE_ID.');
      }

      const resp = await fetch('https://api.sms.ir/v1/send/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-KEY': config.apiKey,
        },
        body: JSON.stringify({
          mobile: params.phone,
          templateId: numericTemplateId,
          parameters: [{ name: 'CODE', value: params.code }],
        }),
        signal: controller.signal,
      });

      const body = (await resp.json().catch(() => ({}))) as {
        status?: number;
        message?: string;
        data?: { messageId?: string | number };
      };
      if (!resp.ok || (typeof body.status === 'number' && body.status !== 1)) {
        throw new Error(
          `SMS.ir delivery failed (HTTP ${resp.status}): ${body.message || 'Unknown gateway error'}`,
        );
      }

      return {
        sent: true,
        provider: 'smsir',
        messageId: body.data?.messageId ? String(body.data.messageId) : undefined,
      };
    }

    // Kavenegar shared-pattern Verify Lookup
    const query = new URLSearchParams({
      receptor: params.phone,
      template: config.templateId,
      token: params.code,
    });
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(config.apiKey)}/verify/lookup.json`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: query.toString(),
      signal: controller.signal,
    });

    const body = (await resp.json().catch(() => ({}))) as {
      return?: { status?: number; message?: string };
      entries?: Array<{ messageid?: string | number }>;
    };
    if (!resp.ok || (body.return?.status && body.return.status !== 200)) {
      throw new Error(
        `Kavenegar delivery failed (HTTP ${resp.status}): ${body.return?.message || 'Unknown gateway error'}`,
      );
    }

    return {
      sent: true,
      provider: 'kavenegar',
      messageId: body.entries?.[0]?.messageid ? String(body.entries[0].messageid) : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
