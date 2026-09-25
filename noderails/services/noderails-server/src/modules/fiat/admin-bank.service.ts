import { getDatabaseClient, type Environment } from '@noderails/database';
import { ValidationError, hashApiKey } from '@noderails/common';
import { getPlatformBankConfig, maskSecret, publishedRateCard } from './platform-bank-config.js';
import { ensureFeeWebhook } from './onboarding-fee/fee.service.js';

function asUsd(value: unknown, fallback: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) return fallback;
  return n.toFixed(2);
}

async function assertFeeApp(appId: string, apiKey: string, environment: Environment) {
  const db = getDatabaseClient();
  const app = await db.app.findUnique({ where: { id: appId } });
  if (!app) throw new ValidationError('Fee project was not found');
  if (environment === 'PRODUCTION' && app.environment !== 'PRODUCTION') {
    throw new ValidationError('Live fee project must be a production app');
  }
  if (environment === 'TEST' && app.environment !== 'TEST') {
    throw new ValidationError('Test fee project must be a test app');
  }
  const keyHash = hashApiKey(apiKey);
  const key = await db.apiKey.findFirst({
    where: { appId, keyHash, active: true, type: 'SECRET' },
  });
  if (!key) throw new ValidationError('Secret key does not belong to that project');
}

export async function getPublicFeeConfig() {
  return publicFeeConfig(await getPlatformBankConfig());
}

export function publicFeeConfig(config: Awaited<ReturnType<typeof getPlatformBankConfig>>) {
  return {
    bankFeeIndividualUsd: config.bankFeeIndividualUsd.toString(),
    bankFeeBusinessUsd: config.bankFeeBusinessUsd.toString(),
    bankFeeTestAppId: config.bankFeeTestAppId,
    bankFeeLiveAppId: config.bankFeeLiveAppId,
    bankFeeTestApiKeyMasked: maskSecret(config.bankFeeTestApiKey),
    bankFeeLiveApiKeyMasked: maskSecret(config.bankFeeLiveApiKey),
    bankFeeTestWebhookConfigured: Boolean(config.bankFeeTestWebhookSecret),
    bankFeeLiveWebhookConfigured: Boolean(config.bankFeeLiveWebhookSecret),
    rateCard: publishedRateCard(config),
  };
}

export async function updateFeeConfig(input: Record<string, unknown>) {
  const db = getDatabaseClient();
  const current = await getPlatformBankConfig();
  const data: Record<string, unknown> = {};
  if (input.bankFeeIndividualUsd !== undefined) {
    data.bankFeeIndividualUsd = asUsd(input.bankFeeIndividualUsd, current.bankFeeIndividualUsd.toString());
  }
  if (input.bankFeeBusinessUsd !== undefined) {
    data.bankFeeBusinessUsd = asUsd(input.bankFeeBusinessUsd, current.bankFeeBusinessUsd.toString());
  }
  const bpsKeys = [
    'bankOnrampFeeBps',
    'bankOfframpFeeBps',
    'bankFxUsdEurBps',
    'bankFxUsdMxnBps',
    'bankFxUsdGbpBps',
    'bankFxUsdBrlBps',
    'bankAchFeeCents',
    'bankWireFeeCents',
  ] as const;
  for (const key of bpsKeys) {
    if (input[key] !== undefined) {
      const n = Number(input[key]);
      if (!Number.isFinite(n) || n < 0 || n > 100_000) {
        throw new ValidationError(`Invalid ${key}`);
      }
      data[key] = Math.floor(n);
    }
  }
  if (input.bankGasFeeNote !== undefined) {
    data.bankGasFeeNote = typeof input.bankGasFeeNote === 'string' ? input.bankGasFeeNote.slice(0, 200) : null;
  }

  if (typeof input.bankFeeTestAppId === 'string' && typeof input.bankFeeTestApiKey === 'string') {
    await assertFeeApp(input.bankFeeTestAppId, input.bankFeeTestApiKey, 'TEST');
    data.bankFeeTestAppId = input.bankFeeTestAppId;
    data.bankFeeTestApiKey = input.bankFeeTestApiKey;
    const hook = await ensureFeeWebhook(input.bankFeeTestAppId, input.bankFeeTestApiKey, 'TEST');
    if (hook.secret) data.bankFeeTestWebhookSecret = hook.secret;
  } else if (typeof input.bankFeeTestAppId === 'string') {
    data.bankFeeTestAppId = input.bankFeeTestAppId;
  }
  if (typeof input.bankFeeTestWebhookSecret === 'string' && input.bankFeeTestWebhookSecret.length > 8) {
    data.bankFeeTestWebhookSecret = input.bankFeeTestWebhookSecret;
  }

  if (typeof input.bankFeeLiveAppId === 'string' && typeof input.bankFeeLiveApiKey === 'string') {
    await assertFeeApp(input.bankFeeLiveAppId, input.bankFeeLiveApiKey, 'PRODUCTION');
    data.bankFeeLiveAppId = input.bankFeeLiveAppId;
    data.bankFeeLiveApiKey = input.bankFeeLiveApiKey;
    const hook = await ensureFeeWebhook(input.bankFeeLiveAppId, input.bankFeeLiveApiKey, 'PRODUCTION');
    if (hook.secret) data.bankFeeLiveWebhookSecret = hook.secret;
  } else if (typeof input.bankFeeLiveAppId === 'string') {
    data.bankFeeLiveAppId = input.bankFeeLiveAppId;
  }
  if (typeof input.bankFeeLiveWebhookSecret === 'string' && input.bankFeeLiveWebhookSecret.length > 8) {
    data.bankFeeLiveWebhookSecret = input.bankFeeLiveWebhookSecret;
  }

  const updated = await db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data } as never,
    update: data as never,
  });
  return publicFeeConfig(updated);
}

export async function listGlobalAccounts() {
  const db = getDatabaseClient();
  return db.fiatVirtualAccount.findMany({
    include: {
      profile: {
        include: {
          merchant: { select: { id: true, email: true, orgName: true, businessName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
