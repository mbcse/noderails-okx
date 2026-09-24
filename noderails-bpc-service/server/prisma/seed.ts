import { PrismaClient } from '@prisma/client';
import { loadEvmChainsFromChainlist, type SeedChain } from './seed-data/chainlist-loader.js';
import { getNonEvmChains } from './seed-data/non-evm-chains.js';

const db = new PrismaClient();
const UPSERT_BATCH = 25;

async function upsertChains(chains: SeedChain[]): Promise<void> {
  console.log(`→ Upserting ${chains.length} chains…`);
  for (let i = 0; i < chains.length; i += UPSERT_BATCH) {
    const batch = chains.slice(i, i + UPSERT_BATCH);
    await Promise.all(
      batch.map((c) =>
        db.chain.upsert({
          where: { chainId: c.chainId },
          create: {
            chainId: c.chainId,
            chainType: c.chainType,
            name: c.name,
            displayName: c.displayName,
            nativeCurrencySymbol: c.nativeCurrencySymbol,
            nativeCurrencyDecimals: c.nativeCurrencyDecimals,
            explorerUrl: c.explorerUrl,
            coingeckoPlatformId: c.coingeckoPlatformId,
            isTestnet: c.isTestnet,
          },
          update: {
            chainType: c.chainType,
            displayName: c.displayName,
            nativeCurrencySymbol: c.nativeCurrencySymbol,
            nativeCurrencyDecimals: c.nativeCurrencyDecimals,
            explorerUrl: c.explorerUrl,
            isTestnet: c.isTestnet,
          },
        }),
      ),
    );
    if ((i + UPSERT_BATCH) % 500 === 0 || i + UPSERT_BATCH >= chains.length) {
      console.log(`  chains ${Math.min(i + UPSERT_BATCH, chains.length)}/${chains.length}`);
    }
  }
}

async function upsertRpcEndpoints(chains: SeedChain[]): Promise<void> {
  const rows = chains.flatMap((c) =>
    c.rpcUrls.map((url, idx) => ({
      chainId: c.chainId,
      url,
      priority: (idx + 1) * 10,
    })),
  );

  console.log(`→ Upserting ${rows.length} RPC endpoints (LeanRPC priority 10 for EVM)…`);
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    await Promise.all(
      batch.map((r) =>
        db.rpcEndpoint.upsert({
          where: { chainId_url: { chainId: r.chainId, url: r.url } },
          create: r,
          update: { priority: r.priority, isEnabled: true },
        }),
      ),
    );
    if ((i + UPSERT_BATCH) % 1000 === 0 || i + UPSERT_BATCH >= rows.length) {
      console.log(`  rpcs ${Math.min(i + UPSERT_BATCH, rows.length)}/${rows.length}`);
    }
  }
}

async function seedTokensAndPrices(): Promise<void> {
  const tokens = [
    { chainId: 1, contractAddress: 'native', symbol: 'ETH', name: 'Ether', decimals: 18, isNative: true, coingeckoId: 'ethereum' },
    { chainId: 1, contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin', defillamaId: 'coingecko:usd-coin' },
    { chainId: 137, contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { chainId: 8453, contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { chainId: 103, contractAddress: 'native', symbol: 'SOL', name: 'Solana', decimals: 9, isNative: true, coingeckoId: 'solana' },
    { chainId: 103, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6, coingeckoId: 'usd-coin' },
    { chainId: 202, contractAddress: 'native', symbol: 'SUI', name: 'Sui', decimals: 9, isNative: true, coingeckoId: 'sui' },
    {
      chainId: 202,
      contractAddress: '0x6246b194af4b8e2795f72e4d7276e99fb01fee20845a47cf90f4d259552540f2::sui_usdc::SUI_USDC',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
    { chainId: 203, contractAddress: 'native', symbol: 'SUI', name: 'Sui', decimals: 9, isNative: true, coingeckoId: 'sui' },
    {
      chainId: 203,
      contractAddress: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
    },
  ];

  for (const t of tokens) {
    const tokenKey = `${t.symbol.toUpperCase()}-${t.chainId}`;
    await db.token.upsert({
      where: { chainId_contractAddress: { chainId: t.chainId, contractAddress: t.contractAddress } },
      create: { ...t, tokenKey },
      update: { symbol: t.symbol, coingeckoId: t.coingeckoId, defillamaId: t.defillamaId, tokenKey },
    });
  }

  const priceSources = [
    { slug: 'coingecko', name: 'CoinGecko', type: 'CEX' as const, priority: 10, rateLimitPerMin: 30, apiKeyEnvVar: 'COINGECKO_API_KEY' },
    { slug: 'cryptocompare', name: 'CryptoCompare', type: 'CEX' as const, priority: 20, rateLimitPerMin: 50, apiKeyEnvVar: 'CRYPTOCOMPARE_API_KEY' },
    { slug: 'coincap', name: 'CoinCap', type: 'CEX' as const, priority: 25, rateLimitPerMin: 200, apiKeyEnvVar: 'COINCAP_API_KEY' },
    { slug: 'kraken', name: 'Kraken Public', type: 'CEX' as const, priority: 28, rateLimitPerMin: 60 },
    { slug: 'binance', name: 'Binance Public', type: 'CEX' as const, priority: 30, rateLimitPerMin: 60 },
    { slug: 'defillama', name: 'DefiLlama', type: 'DEX' as const, priority: 15, rateLimitPerMin: 60 },
    { slug: 'geckoterminal', name: 'GeckoTerminal', type: 'DEX' as const, priority: 25, rateLimitPerMin: 30 },
    { slug: 'dexscreener', name: 'DexScreener', type: 'DEX' as const, priority: 35, rateLimitPerMin: 60 },
    { slug: 'jupiter', name: 'Jupiter', type: 'DEX' as const, priority: 20, rateLimitPerMin: 60 },
    { slug: 'frankfurter', name: 'Frankfurter FX', type: 'FX' as const, priority: 50, rateLimitPerMin: 60 },
  ];

  for (const s of priceSources) {
    await db.priceSource.upsert({
      where: { slug: s.slug },
      create: s,
      update: { priority: s.priority, rateLimitPerMin: s.rateLimitPerMin },
    });
  }

  const mappings = [
    { slug: 'coingecko', assetKey: 'ETH', sourceAssetId: 'ethereum' },
    { slug: 'coingecko', assetKey: 'SOL', sourceAssetId: 'solana' },
    { slug: 'coingecko', assetKey: 'SUI', sourceAssetId: 'sui' },
    { slug: 'coingecko', assetKey: 'USDC', sourceAssetId: 'usd-coin' },
  ];

  for (const m of mappings) {
    const source = await db.priceSource.findUnique({ where: { slug: m.slug } });
    if (!source) continue;
    await db.priceSourceMapping.upsert({
      where: { priceSourceId_assetKey: { priceSourceId: source.id, assetKey: m.assetKey } },
      create: { priceSourceId: source.id, assetKey: m.assetKey, sourceAssetId: m.sourceAssetId },
      update: { sourceAssetId: m.sourceAssetId },
    });
  }
}

async function main() {
  console.log('Loading EVM chains from chainlist.org…');
  const evmChains = await loadEvmChainsFromChainlist();
  const nonEvmChains = getNonEvmChains();
  const allChains = [...evmChains, ...nonEvmChains];

  const rpcTotal = allChains.reduce((n, c) => n + c.rpcUrls.length, 0);
  console.log(`Found ${evmChains.length} EVM + ${nonEvmChains.length} Solana/Sui chains (${rpcTotal} RPC URLs)`);

  await upsertChains(allChains);
  await upsertRpcEndpoints(allChains);

  console.log('→ Seeding tokens & price sources…');
  await seedTokensAndPrices();

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
