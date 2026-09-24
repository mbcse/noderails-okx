import { formatUnits, type Address, type PublicClient, erc20Abi } from 'viem';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { SuiClient } from '@mysten/sui/client';
import { executeWithFailover, type ChainClient } from '../rpc/rpc-pool.service.js';
import { getChain } from '../chains/chain.service.js';
import {
  EVM_NATIVE_ADDRESS,
  SOLANA_NATIVE_SENTINEL,
  SUI_NATIVE_COIN_TYPE,
  isNativeToken,
  ValidationError,
} from '../../lib/constants.js';
import type { Logger } from '../../lib/logger.js';
import {
  getAggregatedPrice,
  resolvePriceRequest,
} from '../prices/price-aggregator.service.js';
import { attachPriceInfoLogic } from './balance-enrichment.js';

export interface BalanceRequest {
  chainId: number;
  address: string;
  token?: string;
  includePrice?: boolean;
  currency?: string;
}

export interface BalancePriceInfo {
  currency: string;
  unitPrice: number;
  totalValue: string;
  sourcesUsed: string[];
  stale: boolean;
}

export interface BalanceResult {
  chainId: number;
  address: string;
  token: {
    symbol: string;
    contractAddress: string;
    decimals: number;
  };
  balanceRaw: string;
  balanceFormatted: string;
  rpcEndpointId: string;
  fetchedAt: string;
  price?: BalancePriceInfo;
  prices?: Record<string, BalancePriceInfo>;
}

function normalizeTokenAddress(token: string | undefined, chainType: string): string {
  if (!token || isNativeToken(token)) {
    if (chainType === 'SOLANA') return SOLANA_NATIVE_SENTINEL;
    if (chainType === 'SUI') return SUI_NATIVE_COIN_TYPE;
    return EVM_NATIVE_ADDRESS;
  }
  return token.trim();
}

async function fetchEvmBalance(
  client: ChainClient,
  address: string,
  tokenAddress: string,
  decimals: number,
  symbol: string,
): Promise<{ raw: bigint; formatted: string }> {
  const evm = client as PublicClient;
  const addr = address as Address;

  if (isNativeToken(tokenAddress)) {
    const raw = await evm.getBalance({ address: addr });
    return { raw, formatted: formatUnits(raw, decimals) };
  }

  const raw = await evm.readContract({
    address: tokenAddress as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [addr],
  });
  return { raw, formatted: formatUnits(raw, decimals) };
}

async function fetchSolanaBalance(
  client: ChainClient,
  address: string,
  tokenAddress: string,
  decimals: number,
): Promise<{ raw: bigint; formatted: string }> {
  const conn = client as Connection;
  const owner = new PublicKey(address);

  if (isNativeToken(tokenAddress)) {
    const lamports = await conn.getBalance(owner);
    return { raw: BigInt(lamports), formatted: formatUnits(BigInt(lamports), decimals) };
  }

  const mint = new PublicKey(tokenAddress);
  const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID);
  const info = await conn.getTokenAccountBalance(ata);
  const raw = BigInt(info.value.amount);
  return { raw, formatted: formatUnits(raw, decimals) };
}

async function fetchSuiBalance(
  client: ChainClient,
  address: string,
  coinType: string,
  decimals: number,
): Promise<{ raw: bigint; formatted: string }> {
  const sui = client as SuiClient;
  const resolvedCoinType = isNativeToken(coinType) ? SUI_NATIVE_COIN_TYPE : coinType;

  async function sumCoinObjects(): Promise<bigint> {
    let total = 0n;
    let cursor: string | null | undefined = null;
    do {
      const page = await sui.getCoins({
        owner: address,
        coinType: resolvedCoinType,
        cursor: cursor ?? undefined,
      });
      for (const coin of page.data) {
        total += BigInt(coin.balance);
      }
      cursor = page.hasNextPage ? page.nextCursor ?? null : null;
    } while (cursor);
    return total;
  }

  try {
    const result = await sui.getBalance({ owner: address, coinType: resolvedCoinType });
    const raw = BigInt(result.totalBalance);
    return { raw, formatted: formatUnits(raw, decimals) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Index store') ||
      msg.includes('Unexpected status code') ||
      msg.includes('fetch failed')
    ) {
      const raw = await sumCoinObjects();
      return { raw, formatted: formatUnits(raw, decimals) };
    }
    throw err;
  }
}

async function attachPriceInfo(
  result: Omit<BalanceResult, 'price' | 'prices'>,
  req: BalanceRequest,
  logger: Logger,
): Promise<BalanceResult> {
  return attachPriceInfoLogic(result, req, async (currency) => {
    const priceRequest = await resolvePriceRequest({
      symbol: result.token.symbol !== 'UNKNOWN' ? result.token.symbol : undefined,
      chainId: isNativeToken(result.token.contractAddress) ? undefined : req.chainId,
      contractAddress: isNativeToken(result.token.contractAddress)
        ? undefined
        : result.token.contractAddress,
      currency,
    });
    const aggregated = await getAggregatedPrice(priceRequest, logger);
    return {
      price: aggregated.price,
      sourcesUsed: aggregated.sourcesUsed,
      stale: aggregated.stale,
    };
  });
}

export async function getBalance(req: BalanceRequest, logger: Logger): Promise<BalanceResult> {
  const chain = await getChain(req.chainId);
  if (!chain.isEnabled) throw new ValidationError(`Chain ${req.chainId} is disabled`);

  const tokenAddress = normalizeTokenAddress(req.token, chain.chainType);
  let symbol = chain.nativeCurrencySymbol;
  let decimals = chain.nativeCurrencyDecimals;

  if (!isNativeToken(tokenAddress)) {
    const dbToken = chain.tokens.find(
      (t: { contractAddress: string }) =>
        t.contractAddress.toLowerCase() === tokenAddress.toLowerCase(),
    );
    if (dbToken) {
      symbol = dbToken.symbol;
      decimals = dbToken.decimals;
    } else {
      symbol = 'UNKNOWN';
      decimals = chain.chainType === 'EVM' ? 18 : 9;
    }
  }

  const exec = await executeWithFailover(
    req.chainId,
    chain.chainType,
    async (client) => {
      switch (chain.chainType) {
        case 'EVM':
          return fetchEvmBalance(client, req.address, tokenAddress, decimals, symbol);
        case 'SOLANA':
          return fetchSolanaBalance(client, req.address, tokenAddress, decimals);
        case 'SUI':
          return fetchSuiBalance(
            client,
            req.address,
            isNativeToken(tokenAddress) ? SUI_NATIVE_COIN_TYPE : tokenAddress,
            decimals,
          );
        default:
          throw new ValidationError(`Unsupported chain type: ${chain.chainType}`);
      }
    },
    logger,
  );

  const base: BalanceResult = {
    chainId: req.chainId,
    address: req.address,
    token: { symbol, contractAddress: tokenAddress, decimals },
    balanceRaw: exec.result.raw.toString(),
    balanceFormatted: exec.result.formatted,
    rpcEndpointId: exec.endpointId,
    fetchedAt: new Date().toISOString(),
  };

  return attachPriceInfo(base, req, logger);
}

export async function getBalancesBatch(
  requests: BalanceRequest[],
  logger: Logger,
): Promise<BalanceResult[]> {
  return Promise.all(requests.map((r) => getBalance(r, logger)));
}
