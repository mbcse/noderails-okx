#!/usr/bin/env node
/**
 * Quick smoke test for BPC public API.
 * Usage: pnpm test:api              (production)
 *        pnpm test:api:local         (localhost)
 *        BPC_URL=... node scripts/test-api.mjs
 */

const PRODUCTION_URL = 'https://bpc.example.local';
const BASE = process.env.BPC_URL ?? PRODUCTION_URL;
const TIMEOUT_MS = Number(process.env.BPC_TEST_TIMEOUT_MS ?? 30_000);
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const SUI_WALLET = '0x52e73d9229421d066f80ea7fa3e65f2e31ea74972c170ddb7b57216fd1d5bd4d';
const SUI_TESTNET_WALLET = '0x29116c5ca6dea0c376ec2e7af8b5d18247a097a6fdf00864a195fae357a2a71a';
const SUI_TESTNET_USDC =
  '0x6246b194af4b8e2795f72e4d7276e99fb01fee20845a47cf90f4d259552540f2::sui_usdc::SUI_USDC';
const SUI_USDC_COIN =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const tests = [
  { name: 'Liveness', method: 'GET', path: '/health' },
  { name: 'Health details', method: 'GET', path: '/v1/health/details' },
  { name: 'Price - ETH', method: 'GET', path: '/v1/prices?asset=ETH&currency=USD' },
  { name: 'Price - USDC-137', method: 'GET', path: '/v1/prices?asset=USDC-137&currency=USD' },
  {
    name: 'Price - fiat conversion',
    method: 'GET',
    path: '/v1/prices?asset=ETH&currency=USD&amountFiat=100',
  },
  {
    name: 'Price - batch',
    method: 'POST',
    path: '/v1/prices/batch',
    body: [{ asset: 'ETH', currency: 'USD' }, { asset: 'USDC-137', currency: 'USD' }],
  },
  {
    name: 'Balance - ETH native',
    method: 'GET',
    path: `/v1/balance?chainId=1&address=${VITALIK}&token=native`,
  },
  {
    name: 'Balance - with price',
    method: 'GET',
    path: `/v1/balance?chainId=1&address=${VITALIK}&token=native&includePrice=true&currency=USD`,
  },
  {
    name: 'Balance - SUI native (chainId 203)',
    method: 'GET',
    path: `/v1/balance?chainId=203&address=${SUI_WALLET}&token=native`,
  },
  {
    name: 'Balance - Sui USDC + USD price (chainId 203)',
    method: 'GET',
    path: `/v1/balance?chainId=203&address=${SUI_WALLET}&token=${encodeURIComponent(SUI_USDC_COIN)}&includePrice=true&currency=USD`,
  },
  {
    name: 'Balance - Sui testnet USDC (chainId 202)',
    method: 'GET',
    path: `/v1/balance?chainId=202&address=${SUI_TESTNET_WALLET}&token=${encodeURIComponent(SUI_TESTNET_USDC)}&includePrice=true&currency=USD`,
  },
];

async function run({ name, method, path, body }) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  process.stdout.write(`→ ${name}… `);

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = { parseError: true };
  }

  const ok = res.ok && json?.success !== false;
  const ms = Date.now() - started;
  console.log(ok ? 'ok' : 'fail', `(${ms}ms)`);
  console.log(`  ${method} ${url}`);
  console.log(`  ${res.status} ${JSON.stringify(json, null, 2).split('\n').join('\n  ')}`);
  return ok;
}

console.log(`BPC API smoke test → ${BASE} (timeout ${TIMEOUT_MS}ms per request)\n`);

let passed = 0;
for (const test of tests) {
  try {
    if (await run(test)) passed++;
  } catch (err) {
    console.log('fail');
    console.log(`\n✗ ${test.name}`);
    console.log(`  ${test.method} ${BASE}${test.path}`);
    console.log(`  ERROR: ${err.message}`);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.log('\n  Server not running? Local: pnpm test:api:local');
      break;
    }
    if (err.name === 'TimeoutError') {
      console.log(`  Request exceeded ${TIMEOUT_MS}ms — server may be overloaded or an upstream RPC timed out.`);
    }
  }
}

console.log(`\n${passed}/${tests.length} passed\n`);
process.exit(passed === tests.length ? 0 : 1);
