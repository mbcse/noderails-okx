import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import { config } from '../config/index.js';
import { rpcManager } from './rpc-manager.js';
import { webhookDeliveryQueue } from '../lib/queues.js';
import { settingsService } from './settings.js';

/*
  Native (ETH) transfer indexer:
  - One async loop per chain
  - Each iteration: fetch a small block range with getBlock(includeTransactions: true)
  - For each tx with value > 0, check if from/to in watched address set
  - Upsert NativeTransfer, then fan-out to webhooks that subscribe to native
*/

const getCacheTtl = () => settingsService.getNumber('nativeIndexer.cacheTtl', 60_000);
const IDLE_LOG_INTERVAL_MS = 5 * 60 * 1000;

// address (lowercase) -> list of { projectId, direction } (direction: "in" | "out" | "both")
type WatchedEntry = { projectId: string; direction: string };
type WatchedMap = Map<string, WatchedEntry[]>;

class NativeIndexerService {
  private loops: Map<number, AbortController> = new Map();
  private watchedCache: Map<number, WatchedMap> = new Map();
  private cacheAt: Map<number, number> = new Map();
  private lastIdleLog: Map<string, number> = new Map();

  async start(): Promise<void> {
    const chains = await prisma.chain.findMany({ where: { isActive: true } });
    const evmChains = chains.filter((chain) => chain.protocol === 'evm');
    for (const chain of evmChains) this.startChainLoop(chain.chainId);
    console.log(`✅ Native indexer started for ${evmChains.length} EVM chain(s)`);
  }

  startChainLoop(chainId: number): void {
    if (this.loops.has(chainId)) return;
    const ctrl = new AbortController();
    this.loops.set(chainId, ctrl);
    this.loop(chainId, ctrl.signal).catch((error) => {
      console.error(`💥 Native chain ${chainId} loop crashed:`, error.message);
      this.loops.delete(chainId);
    });
    console.log(`✅ Started native indexer loop for chain ${chainId}`);
  }

  stopChainLoop(chainId: number): void {
    this.loops.get(chainId)?.abort();
    this.loops.delete(chainId);
    this.watchedCache.delete(chainId);
    this.cacheAt.delete(chainId);
  }

  async stop(): Promise<void> {
    for (const [, controller] of this.loops) controller.abort();
    this.loops.clear();
    this.watchedCache.clear();
    this.cacheAt.clear();
    console.log('✅ Native indexer stopped');
  }

  invalidateCache(chainId: number): void {
    this.cacheAt.delete(chainId);
    this.watchedCache.delete(chainId);
  }

  /** Call when a watched address with chainId=null (all chains) is added/updated/deleted */
  invalidateCacheAll(): void {
    this.cacheAt.clear();
    this.watchedCache.clear();
  }

  private maybeLogIdle(chainId: number, key: string, log: () => void): void {
    const k = `${chainId}:${key}`;
    const last = this.lastIdleLog.get(k) ?? 0;
    if (Date.now() - last < IDLE_LOG_INTERVAL_MS) return;
    this.lastIdleLog.set(k, Date.now());
    log();
  }

  private async loop(chainId: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const watched = await this.loadWatchedMap(chainId);
        const hasWatchers = watched.size > 0;
        if (!hasWatchers) {
          this.maybeLogIdle(chainId, 'no watchers', () =>
            console.log(`📋 Chain ${chainId} (native): No watched addresses. Add watched addresses on a project to index native transfers.`),
          );
        }
        const didWork = await this.processBatch(chainId, watched);
        if (!didWork) {
          if (hasWatchers) {
            this.maybeLogIdle(chainId, 'caught up', () =>
              console.log(`📋 Chain ${chainId} (native): Caught up to chain head.`),
            );
          }
          await this.sleep(config.nativeIndexer.pollInterval, signal);
        }
      } catch (err: any) {
        if (signal.aborted) break;
        console.error(`Native chain ${chainId} error:`, err.message);
        await rpcManager.recordFailure(chainId, err);
        await this.sleep(config.nativeIndexer.pollInterval, signal);
      }
    }
  }

  private async loadWatchedMap(chainId: number): Promise<WatchedMap> {
    const lastLoad = this.cacheAt.get(chainId) || 0;
    if (Date.now() - lastLoad < getCacheTtl()) {
      return this.watchedCache.get(chainId) || new Map();
    }
    const rows = await prisma.watchedAddress.findMany({
      where: { OR: [{ chainId }, { chainId: null }] },
      select: { address: true, projectId: true, direction: true },
    });
    const map: WatchedMap = new Map();
    for (const row of rows) {
      const addr = row.address.toLowerCase();
      const list = map.get(addr) || [];
      const dir = row.direction === 'in' || row.direction === 'out' ? row.direction : 'both';
      if (!list.some((e) => e.projectId === row.projectId)) list.push({ projectId: row.projectId, direction: dir });
      map.set(addr, list);
    }
    this.watchedCache.set(chainId, map);
    this.cacheAt.set(chainId, Date.now());
    return map;
  }

  private projectIdsForDirection(entries: WatchedEntry[] | undefined, side: 'in' | 'out'): string[] {
    if (!entries) return [];
    return entries
      .filter((e) => e.direction === side || e.direction === 'both')
      .map((e) => e.projectId);
  }

  private async processBatch(chainId: number, watched: WatchedMap): Promise<boolean> {
    const client = await rpcManager.getClient(chainId);
    const chain = await prisma.chain.findUnique({ where: { chainId } });
    if (!chain?.isActive) return false;

    let cursor: bigint;
    const state = await prisma.nativeIndexState.findUnique({ where: { chainId } });
    if (state) {
      cursor = state.lastIndexedBlock;
    } else {
      const head = await client.getBlockNumber();
      const safe = head - BigInt(chain.finalityBlocks);
      cursor = safe > 0n ? safe - 1n : 0n;
      await prisma.nativeIndexState.create({
        data: { chainId, lastIndexedBlock: cursor },
      });
    }

    const head = await client.getBlockNumber();
    const safeBlock = head - BigInt(chain.finalityBlocks);
    const fromBlock = cursor + 1n;
    if (fromBlock > safeBlock) return false;

    const blockRange = settingsService.getNumber('nativeIndexer.blockRange', config.nativeIndexer.blockRange);
    const toBlock = fromBlock + BigInt(blockRange) - 1n > safeBlock ? safeBlock : fromBlock + BigInt(blockRange) - 1n;

    let matched = 0;
    let deliveriesQueued = 0;
    const timestamps = new Map<string, number>();

    for (let b = fromBlock; b <= toBlock; b++) {
      const block = await client.getBlock({
        blockNumber: b,
        includeTransactions: true,
      });
      rpcManager.recordSuccess(chainId, 0);

      const blockTs = Number(block.timestamp) * 1000;
      timestamps.set(block.number.toString(), blockTs);
      await redis.set(`ts:${chainId}:${block.number}`, blockTs.toString(), 'EX', 86400);

      const txns = block.transactions as Array<{ from: string; to?: string | null; value: bigint; hash: string }>;
      for (const tx of txns) {
        if (tx.value === 0n) continue;
        const from = tx.from?.toLowerCase();
        const to = (tx.to && tx.to.toLowerCase()) || null;
        if (!from) continue;
        const fromWatched = this.projectIdsForDirection(watched.get(from), 'out');
        const toWatched = to ? this.projectIdsForDirection(watched.get(to), 'in') : [];
        const projectIds = [...new Set([...fromWatched, ...toWatched])];
        if (projectIds.length === 0) continue;

        const transfer = await prisma.nativeTransfer.upsert({
          where: {
            chainId_transactionHash: { chainId, transactionHash: tx.hash },
          },
          create: {
            chainId,
            blockNumber: block.number,
            blockHash: block.hash,
            transactionHash: tx.hash,
            from: tx.from,
            to: tx.to ?? null,
            value: tx.value.toString(),
            timestamp: new Date(blockTs),
          },
          update: {},
        });
        matched++;

        for (const projectId of projectIds) {
          const webhooks = await prisma.webhook.findMany({
            where: {
              projectId,
              isActive: true,
              subscribeNative: true,
              OR: [{ nativeChainId: null }, { nativeChainId: chainId }],
            },
          });
          const projectWatchesFrom = (fromWatched ?? []).includes(projectId);
          const projectWatchesTo = to && (toWatched ?? []).includes(projectId);
          const payloads: { direction: 'in' | 'out'; address: string }[] = [];
          if (projectWatchesTo) payloads.push({ direction: 'in', address: to! });
          if (projectWatchesFrom) payloads.push({ direction: 'out', address: from });
          if (payloads.length === 0) continue;

          for (const webhook of webhooks) {
            for (const { direction, address } of payloads) {
              const payload = {
                type: 'native_transfer',
                id: transfer.id,
                chainId,
                blockNumber: Number(block.number),
                blockHash: block.hash,
                transactionHash: tx.hash,
                from: tx.from,
                to: tx.to ?? null,
                value: transfer.value,
                timestamp: new Date(blockTs).toISOString(),
                direction,
                address,
              };
              const delivery = await prisma.webhookDelivery.create({
                data: {
                  webhookId: webhook.id,
                  nativeTransferId: transfer.id,
                  status: 'pending',
                },
              });
              await webhookDeliveryQueue.add(
                'deliver',
                {
                  webhookId: webhook.id,
                  eventId: null,
                  nativeTransferId: transfer.id,
                  deliveryId: delivery.id,
                  payload,
                  secret: webhook.secret,
                  url: webhook.url,
                },
                {
                  attempts: settingsService.getNumber('webhook.maxRetries', config.webhook.maxRetries),
                  backoff: {
                    type: 'exponential',
                    delay: settingsService.getNumber('webhook.initialDelay', config.webhook.initialDelay),
                  },
                }
              );
              deliveriesQueued++;
            }
          }
        }
      }
    }

    await prisma.nativeIndexState.upsert({
      where: { chainId },
      create: { chainId, lastIndexedBlock: toBlock },
      update: { lastIndexedBlock: toBlock },
    });

    if (matched > 0) {
      console.log(`💸 Native chain ${chainId}: ${matched} transfer(s) | blocks ${fromBlock}→${toBlock} | ${deliveriesQueued} webhook delivery(ies) queued`);
    }
    return true;
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
}

export const nativeIndexerService = new NativeIndexerService();
