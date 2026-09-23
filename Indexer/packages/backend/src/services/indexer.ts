import { Log } from 'viem';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import { rpcManager } from './rpc-manager.js';
import { processEventQueue } from '../lib/queues.js';
import { settingsService } from './settings.js';

/*
  Architecture:
  - One async while-loop per chain
  - Each loop: fetch logs for a block range via eth_getLogs (address filter only, no topics)
  - Filter logs by topic0 in JS using Map<address, Map<topic0, sub>> → O(1) lookup
  - Push matched logs into the process-event BullMQ queue
  - Update checkpoint in DB after each batch
*/

// address(lower) → topic0(lower) → subscription info
type Lookup = Map<string, Map<string, {
  subscriptionId: string;
  eventName: string;
  abiItem: any;
  contractAddress: string;
  filterConditions: any;
}>>;

interface CachedContract {
  id: string;
  address: string;
  name: string;
  lastBlock: bigint; // last indexed block
  subs: { id: string; eventName: string; topic0: string; abiItem: any; filterConditions: any }[];
}

const getCacheTtl = () => settingsService.getNumber('indexer.cacheTtl', 60_000); // reload contracts from DB every 60s

const IDLE_LOG_INTERVAL_MS = 5 * 60 * 1000; // log idle reason at most every 5 min

class IndexerService {
  private loops: Map<number, AbortController> = new Map();
  private cache: Map<number, CachedContract[]> = new Map();
  private cacheAt: Map<number, number> = new Map();
  private lastIdleLog: Map<string, number> = new Map();

  // ── Public API ───────────────────────────────────────────────

  async start(): Promise<void> {
    const chains = await prisma.chain.findMany({ where: { isActive: true } });
    const evmChains = chains.filter((chain) => chain.protocol === 'evm');
    for (const chain of evmChains) this.startChainLoop(chain.chainId);
    console.log(`✅ Indexer started for ${evmChains.length} EVM chain(s)`);
  }

  startChainLoop(chainId: number): void {
    if (this.loops.has(chainId)) return;
    const ctrl = new AbortController();
    this.loops.set(chainId, ctrl);
    this.loop(chainId, ctrl.signal).catch((error) => {
      console.error(`💥 Chain ${chainId} loop crashed:`, error.message);
      this.loops.delete(chainId);
    });
    console.log(`✅ Started indexer loop for chain ${chainId}`);
  }

  async stopChainLoop(chainId: number): Promise<void> {
    this.loops.get(chainId)?.abort();
    this.loops.delete(chainId);
  }

  async stop(): Promise<void> {
    for (const [, controller] of this.loops) controller.abort();
    this.loops.clear();
    console.log('✅ Indexer stopped');
  }

  invalidateCache(chainId: number): void {
    this.cacheAt.delete(chainId);
  }

  // ── While loop ───────────────────────────────────────────────

  private async loop(chainId: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const contracts = await this.loadContracts(chainId);
        if (contracts.length === 0) {
          this.maybeLogIdle(chainId, 'no contracts', () =>
            console.log(`📋 Chain ${chainId}: No contracts to index. Add a contract with event subscriptions (and a start block) to index events.`),
          );
          await this.sleep(config.indexer.pollInterval, signal);
          continue;
        }

        const didWork = await this.processBatch(chainId, contracts);

        if (!didWork) {
          this.maybeLogIdle(chainId, 'caught up', () =>
            console.log(`📋 Chain ${chainId}: Caught up to chain head (no new blocks to index).`),
          );
          await this.sleep(config.indexer.pollInterval, signal);
        }
      } catch (err: any) {
        if (signal.aborted) break;
        console.error(`Chain ${chainId} error:`, err.message);
        await rpcManager.recordFailure(chainId, err);
        await this.sleep(config.indexer.pollInterval, signal);
      }
    }
  }

  // ── Batch: fetch logs → filter → enqueue ─────────────────────

  private async processBatch(chainId: number, contracts: CachedContract[]): Promise<boolean> {
    const client = await rpcManager.getClient(chainId);
    const chain = await prisma.chain.findUnique({ where: { chainId } });
    if (!chain?.isActive) return false;

    const head = await client.getBlockNumber();
    const safeBlock = head - BigInt(chain.finalityBlocks);

    // Earliest block any contract still needs
    let fromBlock = safeBlock + 1n;
    for (const contract of contracts) {
      const next = contract.lastBlock + 1n;
      if (next < fromBlock) fromBlock = next;
    }
    if (fromBlock > safeBlock) return false; // all caught up

    const toBlock = (() => {
      const blockRange = settingsService.getNumber('indexer.blockRange', config.indexer.blockRange);
      const max = fromBlock + BigInt(blockRange) - 1n;
      return max > safeBlock ? safeBlock : max;
    })();

    // Build O(1) lookup: address → topic0 → subscription
    const lookup: Lookup = new Map();
    const needsUpdate: CachedContract[] = [];

    for (const contract of contracts) {
      if (contract.lastBlock >= toBlock) continue; // already past this range
      needsUpdate.push(contract);
      const addr = contract.address.toLowerCase();
      if (!lookup.has(addr)) lookup.set(addr, new Map());
      const topicMap = lookup.get(addr)!;
      for (const sub of contract.subs) {
        topicMap.set(sub.topic0.toLowerCase(), {
          subscriptionId: sub.id,
          eventName: sub.eventName,
          abiItem: sub.abiItem,
          contractAddress: contract.address,
          filterConditions: sub.filterConditions,
        });
      }
    }

    if (needsUpdate.length === 0) return false;

    // Collect all contract addresses for this range
    const addresses = needsUpdate.map((contract) => contract.address.toLowerCase() as `0x${string}`);

    // Fetch logs — pass addresses (required by public RPCs), NO topic filter
    // All topic filtering happens in JS below via the O(1) lookup map
    const logs: Log[] = await client.getLogs({
      address: addresses.length === 1 ? addresses[0] : addresses,
      fromBlock,
      toBlock,
    });
    rpcManager.recordSuccess(chainId, 0);

    // Filter in JS and enqueue matches
    if (logs.length > 0) {
      const timestamps = await this.getTimestamps(client, chainId, logs);
      let matched = 0;

      for (const log of logs) {
        const addr = log.address?.toLowerCase();
        const topic0 = log.topics[0]?.toLowerCase();
        if (!addr || !topic0) continue;

        const hit = lookup.get(addr)?.get(topic0);
        if (!hit) continue;

        matched++;
        await processEventQueue.add('process', {
          log: {
            address: log.address,
            blockNumber: log.blockNumber!.toString(),
            blockHash: log.blockHash!,
            transactionHash: log.transactionHash!,
            logIndex: log.logIndex!,
            data: log.data,
            topics: log.topics,
          },
          chainId,
          subscriptionId: hit.subscriptionId,
          eventName: hit.eventName,
          abiItem: hit.abiItem,
          contractAddress: hit.contractAddress,
          timestamp: timestamps.get(log.blockNumber!.toString()) || Date.now(),
          filterConditions: hit.filterConditions || null,
        });
      }

      if (matched > 0) {
        console.log(`📦 Chain ${chainId}: ${matched} event(s) | blocks ${fromBlock}→${toBlock}`);
      }
    }

    // Update checkpoints using the unique [chainId, contractId] — no stateId needed
    await Promise.all(
      needsUpdate.map((contract) =>
        prisma.indexState.update({
          where: { chainId_contractId: { chainId, contractId: contract.id } },
          data: { lastIndexedBlock: toBlock, lastFinalizedBlock: safeBlock },
        }),
      ),
    );

    // Keep in-memory cache in sync
    for (const contract of needsUpdate) contract.lastBlock = toBlock;

    return true;
  }

  // ── Contract cache ───────────────────────────────────────────

  private async loadContracts(chainId: number): Promise<CachedContract[]> {
    const lastLoad = this.cacheAt.get(chainId) || 0;
    if (Date.now() - lastLoad < getCacheTtl()) return this.cache.get(chainId) || [];

    const rows = await prisma.contract.findMany({
      where: { chainId, isActive: true, protocol: 'evm' },
      include: {
        eventSubscriptions: { where: { isActive: true } },
        indexStates: { where: { chainId } },
      },
    });

    const fresh: CachedContract[] = rows
      .filter((row) => row.indexStates.length > 0 && row.eventSubscriptions.length > 0)
      .map((row) => ({
        id: row.id,
        address: row.address,
        name: row.name,
        lastBlock: row.indexStates[0].lastIndexedBlock,
        subs: row.eventSubscriptions.map((eventSub) => ({
          id: eventSub.id,
          eventName: eventSub.eventName,
          topic0: eventSub.topic0,
          abiItem: eventSub.abiItem,
          filterConditions: eventSub.filterConditions,
        })),
      }));

    // Keep the higher checkpoint if we already advanced past the DB value
    const previousCache = new Map((this.cache.get(chainId) || []).map((contract) => [contract.id, contract]));
    for (const contract of fresh) {
      const previous = previousCache.get(contract.id);
      if (previous && previous.lastBlock > contract.lastBlock) contract.lastBlock = previous.lastBlock;
    }

    this.cache.set(chainId, fresh);
    this.cacheAt.set(chainId, Date.now());
    return fresh;
  }

  // ── Block timestamps (Redis-cached) ──────────────────────────

  private async getTimestamps(client: any, chainId: number, logs: Log[]): Promise<Map<string, number>> {
    const timestampMap = new Map<string, number>();
    const uniqueBlocks = [...new Set(logs.map((log) => log.blockNumber!.toString()))];

    // Batch read from Redis
    const redisKeys = uniqueBlocks.map((blockNum) => `ts:${chainId}:${blockNum}`);
    const cachedValues = redisKeys.length > 0 ? await redis.mget(...redisKeys) : [];
    const missingBlocks: string[] = [];

    for (let i = 0; i < uniqueBlocks.length; i++) {
      if (cachedValues[i]) timestampMap.set(uniqueBlocks[i], parseInt(cachedValues[i]!));
      else missingBlocks.push(uniqueBlocks[i]);
    }

    // Fetch missing from RPC
    for (const blockNum of missingBlocks) {
      const blockData = await client.getBlock({ blockNumber: BigInt(blockNum) });
      const timestampMs = Number(blockData.timestamp) * 1000;
      timestampMap.set(blockNum, timestampMs);
      await redis.set(`ts:${chainId}:${blockNum}`, timestampMs.toString(), 'EX', 86400);
    }

    return timestampMap;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private maybeLogIdle(chainId: number, key: string, log: () => void): void {
    const k = `${chainId}:${key}`;
    const last = this.lastIdleLog.get(k) ?? 0;
    if (Date.now() - last < IDLE_LOG_INTERVAL_MS) return;
    this.lastIdleLog.set(k, Date.now());
    log();
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

export const indexerService = new IndexerService();
