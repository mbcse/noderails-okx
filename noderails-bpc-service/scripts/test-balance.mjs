#!/usr/bin/env node
/**
 * Balance API smoke tests (EVM + Solana + Sui, NodeRails chain IDs).
 * Usage: pnpm test:balance
 */

const PRODUCTION_URL = 'https://bpc.example.local';
const BASE = process.env.BPC_URL ?? PRODUCTION_URL;
const TIMEOUT_MS = Number(process.env.BPC_TEST_TIMEOUT_MS ?? 45_000);

// Well-known wallets with public balances
const ETH_WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const SOL_WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Binance hot wallet
const SOL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SUI_USDC_COIN =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_WALLET = '0x52e73d9229421d066f80ea7fa3e65f2e31ea74972c170ddb7b57216fd1d5bd4d';
const SUI_TESTNET_WALLET = '0x29116c5ca6dea0c376ec2e7af8b5d18247a097a6fdf00864a195fae357a2a71a';
const SUI_TESTNET_USDC =
  '0x6246b194af4b8e2795f72e4d7276e99fb01fee20845a47cf90f4d259552540f2::sui_usdc::SUI_USDC';

const tests = [
  {
    name: 'EVM — ETH native (chainId 1)',
    path: `/v1/balance?chainId=1&address=${ETH_WALLET}&token=native`,
  },
  {
    name: 'EVM — ETH native + USD price',
    path: `/v1/balance?chainId=1&address=${ETH_WALLET}&token=native&includePrice=true&currency=USD`,
  },
  {
    name: 'EVM — USDC on Polygon (chainId 137)',
    path: `/v1/balance?chainId=137&address=${ETH_WALLET}&token=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`,
  },
  {
    name: 'Solana — SOL native (chainId 103)',
    path: `/v1/balance?chainId=103&address=${SOL_WALLET}&token=native`,
  },
  {
    name: 'Solana — SOL + USD price (chainId 103)',
    path: `/v1/balance?chainId=103&address=${SOL_WALLET}&token=native&includePrice=true&currency=USD`,
  },
  {
    name: 'Solana — USDC SPL token (chainId 103)',
    path: `/v1/balance?chainId=103&address=${SOL_WALLET}&token=${SOL_USDC_MINT}`,
  },
  {
    name: 'Solana — USDC + USD price (chainId 103)',
    path: `/v1/balance?chainId=103&address=${SOL_WALLET}&token=${SOL_USDC_MINT}&includePrice=true&currency=USD`,
  },
  {
    name: 'Sui — SUI native (chainId 203)',
    path: `/v1/balance?chainId=203&address=${SUI_WALLET}&token=native`,
  },
  {
    name: 'Sui — USDC coin type (chainId 203)',
    path: `/v1/balance?chainId=203&address=${SUI_WALLET}&token=${encodeURIComponent(SUI_USDC_COIN)}`,
  },
  {
    name: 'Sui testnet — USDC (chainId 202)',
    path: `/v1/balance?chainId=202&address=${SUI_TESTNET_WALLET}&token=${encodeURIComponent(SUI_TESTNET_USDC)}&includePrice=true&currency=USD`,
  },
  {
    name: 'Sui — USDC + USD price (chainId 203)',
    path: `/v1/balance?chainId=203&address=${SUI_WALLET}&token=${encodeURIComponent(SUI_USDC_COIN)}&includePrice=true&currency=USD`,
  },
  {
    name: 'Batch — ETH + Solana',
    method: 'POST',
    path: '/v1/balance/batch',
    body: {
      includePrice: true,
      currency: 'USD',
      items: [
        { chainId: 1, address: ETH_WALLET, token: 'native' },
        { chainId: 103, address: SOL_WALLET, token: 'native' },
      ],
    },
  },
];

async function run(test) {
  const url = `${BASE}${test.path}`;
  const started = Date.now();
  process.stdout.write(`→ ${test.name}… `);

  const res = await fetch(url, {
    method: test.method ?? 'GET',
    headers: test.body ? { 'Content-Type': 'application/json' } : undefined,
    body: test.body ? JSON.stringify(test.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const json = await res.json().catch(() => ({}));
  const ok = res.ok && json?.success !== false;
  console.log(ok ? 'ok' : 'fail', `(${Date.now() - started}ms)`);

  if (ok && json.data) {
    if (Array.isArray(json.data)) {
      for (const row of json.data) {
        console.log(`  chainId=${row.chainId} balance=${row.balanceFormatted} ${row.token?.symbol ?? ''}`);
        if (row.price) console.log(`    USD value: ${row.price.totalValue}`);
      }
    } else {
      console.log(`  balance=${json.data.balanceFormatted} ${json.data.token?.symbol ?? ''}`);
      if (json.data.price) console.log(`  USD value: ${json.data.price.totalValue}`);
    }
  } else {
    console.log(`  ${res.status} ${JSON.stringify(json)}`);
  }

  return ok;
}

console.log(`Balance API tests → ${BASE}\n`);

let passed = 0;
for (const test of tests) {
  try {
    if (await run(test)) passed++;
  } catch (err) {
    console.log('fail');
    console.log(`  ERROR: ${err.message}`);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.log('  Start server: pnpm start:local');
      break;
    }
  }
}

console.log(`\n${passed}/${tests.length} passed\n`);
process.exit(passed === tests.length ? 0 : 1);
