import { getDatabaseClient, type Environment } from '@noderails/database';

export async function getPlatformBankConfig() {
  const db = getDatabaseClient();
  const existing = await db.platformConfig.findUnique({ where: { id: 'singleton' } });
  if (existing) return existing;
  return db.platformConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

export function feeCollectorFor(config: Awaited<ReturnType<typeof getPlatformBankConfig>>, environment: Environment) {
  if (environment === 'PRODUCTION') {
    return {
      appId: config.bankFeeLiveAppId,
      apiKey: config.bankFeeLiveApiKey,
      webhookSecret: config.bankFeeLiveWebhookSecret,
    };
  }
  return {
    appId: config.bankFeeTestAppId,
    apiKey: config.bankFeeTestApiKey,
    webhookSecret: config.bankFeeTestWebhookSecret,
  };
}

export function publishedRateCard(config: Awaited<ReturnType<typeof getPlatformBankConfig>>) {
  return {
    onrampFeeBps: config.bankOnrampFeeBps,
    offrampFeeBps: config.bankOfframpFeeBps,
    fxUsdEurBps: config.bankFxUsdEurBps,
    fxUsdMxnBps: config.bankFxUsdMxnBps,
    fxUsdGbpBps: config.bankFxUsdGbpBps,
    fxUsdBrlBps: config.bankFxUsdBrlBps,
    achFeeCents: config.bankAchFeeCents,
    wireFeeCents: config.bankWireFeeCents,
    gasFeeNote: config.bankGasFeeNote,
  };
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}
