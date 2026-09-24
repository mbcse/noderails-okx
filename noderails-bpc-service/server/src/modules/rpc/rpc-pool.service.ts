import { createPublicClient, http, type PublicClient } from 'viem';
import { Connection } from '@solana/web3.js';
import { SuiClient } from '@mysten/sui/client';
import type { ChainType, RpcEndpoint } from '@prisma/client';
import { getDatabaseClient } from '../../lib/db.js';
import { BlockchainError } from '../../lib/constants.js';
import type { Logger } from '../../lib/logger.js';

export type ChainClient = PublicClient | Connection | SuiClient;

const CIRCUIT_BREAKER_THRESHOLD = 3;
const RPC_TIMEOUT_MS = 15_000;

/** Per-chain round-robin cursor — rotates healthy RPC starting point across requests. */
const roundRobinCursor = new Map<number, number>();

function isRetryableError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('rate limit')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms),
    ),
  ]);
}

export function createChainClient(chainType: ChainType, url: string): ChainClient {
  switch (chainType) {
    case 'EVM':
      return createPublicClient({ transport: http(url, { timeout: RPC_TIMEOUT_MS }) });
    case 'SOLANA':
      return new Connection(url, { commitment: 'confirmed', confirmTransactionInitialTimeout: RPC_TIMEOUT_MS });
    case 'SUI':
      return new SuiClient({ url });
    default:
      throw new BlockchainError(`Unsupported chain type: ${chainType}`);
  }
}

async function pingEndpoint(
  chainType: ChainType,
  url: string,
): Promise<void> {
  const client = createChainClient(chainType, url);
  switch (chainType) {
    case 'EVM':
      await (client as PublicClient).getBlockNumber();
      break;
    case 'SOLANA':
      await (client as Connection).getSlot();
      break;
    case 'SUI':
      await (client as SuiClient).getLatestCheckpointSequenceNumber();
      break;
  }
}

export async function listEndpointsForChain(chainId: number): Promise<RpcEndpoint[]> {
  const db = getDatabaseClient();
  return db.rpcEndpoint.findMany({
    where: { chainId, isEnabled: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

function selectEndpoints(endpoints: RpcEndpoint[]): RpcEndpoint[] {
  const healthy = endpoints.filter((e) => e.consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD);
  return healthy.length > 0 ? healthy : endpoints;
}

/** Round-robin starting order among healthy endpoints, then sequential failover. */
function orderEndpointsRoundRobin(chainId: number, endpoints: RpcEndpoint[]): RpcEndpoint[] {
  if (endpoints.length <= 1) return endpoints;

  const cursor = roundRobinCursor.get(chainId) ?? 0;
  const start = cursor % endpoints.length;
  roundRobinCursor.set(chainId, cursor + 1);

  return [...endpoints.slice(start), ...endpoints.slice(0, start)];
}

async function markSuccess(endpointId: string): Promise<void> {
  const db = getDatabaseClient();
  await db.rpcEndpoint.update({
    where: { id: endpointId },
    data: {
      consecutiveFailures: 0,
      lastHealthAt: new Date(),
      lastHealthStatus: 'HEALTHY',
      lastError: null,
    },
  });
}

async function markFailure(endpointId: string, error: string): Promise<void> {
  const db = getDatabaseClient();
  await db.rpcEndpoint.update({
    where: { id: endpointId },
    data: {
      consecutiveFailures: { increment: 1 },
      lastHealthAt: new Date(),
      lastHealthStatus: 'UNHEALTHY',
      lastError: error.slice(0, 500),
    },
  });
}

export interface RpcExecutionResult<T> {
  result: T;
  endpointId: string;
  endpointUrl: string;
}

export async function executeWithFailover<T>(
  chainId: number,
  chainType: ChainType,
  fn: (client: ChainClient, endpoint: RpcEndpoint) => Promise<T>,
  logger?: Logger,
): Promise<RpcExecutionResult<T>> {
  const endpoints = orderEndpointsRoundRobin(
    chainId,
    selectEndpoints(await listEndpointsForChain(chainId)),
  );
  if (endpoints.length === 0) {
    throw new BlockchainError(`No RPC endpoints configured for chain ${chainId}`);
  }

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const client = createChainClient(chainType, endpoint.url);
      const result = await withTimeout(fn(client, endpoint), RPC_TIMEOUT_MS);
      await markSuccess(endpoint.id);
      return { result, endpointId: endpoint.id, endpointUrl: endpoint.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(message);
      await markFailure(endpoint.id, message);
      logger?.warn('RPC endpoint failed, trying next', {
        chainId,
        endpointId: endpoint.id,
        error: message,
        retryable: isRetryableError(err),
      });
      if (!isRetryableError(err) && endpoints.length === 1) break;
    }
  }

  throw new BlockchainError(
    `All RPC endpoints failed for chain ${chainId}: ${lastError?.message ?? 'unknown error'}`,
  );
}

export async function testRpcEndpoint(endpointId: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const db = getDatabaseClient();
  const endpoint = await db.rpcEndpoint.findUnique({
    where: { id: endpointId },
    include: { chain: true },
  });
  if (!endpoint) throw new BlockchainError('RPC endpoint not found');

  const start = Date.now();
  try {
    await pingEndpoint(endpoint.chain.chainType, endpoint.url);
    await markSuccess(endpoint.id);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailure(endpoint.id, message);
    return { ok: false, latencyMs: Date.now() - start, error: message };
  }
}
