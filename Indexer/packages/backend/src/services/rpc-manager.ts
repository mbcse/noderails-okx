import {
  createPublicClient,
  http,
  PublicClient,
  Transport,
  Chain,
  HttpTransportConfig,
} from 'viem';
import * as chains from 'viem/chains';
import prisma from '../lib/prisma.js';

interface RpcHealth {
  url: string;
  isHealthy: boolean;
  latency: number;
  lastChecked: Date;
  errorCount: number;
  lastError?: string;
}

interface ChainState {
  chainId: number;
  rpcUrls: string[];
  activeRpcIndex: number;
  clients: Map<number, PublicClient>;
  health: Map<number, RpcHealth>;
  chain: Chain;
}

/** Errors that mean "this RPC won't work for a while" — switch immediately */
function shouldSwitchImmediately(error: Error): boolean {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('unauthorized') || msg.includes('api key') || msg.includes('authenticate')) return true;
  if (msg.includes('rate limit') || msg.includes('rate limit exhausted') || msg.includes('429')) return true;
  if (msg.includes('too many requests') || msg.includes('retry in')) return true;
  if (msg.includes('missing or invalid parameters') && msg.includes('ankr')) return true;
  return false;
}

class RpcManager {
  private chainStates: Map<number, ChainState> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private maxErrorsBeforeSwitch = 3;
  private healthCheckIntervalMs = 30000; // 30 seconds

  constructor() {
    // Start background health checks
    this.startHealthChecks();
  }

  // Initialize a chain with its RPC URLs (optionally restore activeRpcIndex from DB)
  async initChain(chainId: number, rpcUrls: string[], activeRpcIndex: number = 0): Promise<void> {
    const chain = this.getViemChain(chainId);
    const index = Math.min(Math.max(0, activeRpcIndex), rpcUrls.length - 1);

    const state: ChainState = {
      chainId,
      rpcUrls,
      activeRpcIndex: index,
      clients: new Map(),
      health: new Map(),
      chain,
    };

    // Initialize health tracking for each RPC
    rpcUrls.forEach((url, index) => {
      state.health.set(index, {
        url,
        isHealthy: true,
        latency: 0,
        lastChecked: new Date(),
        errorCount: 0,
      });
    });

    // Create client for active RPC
    state.clients.set(index, this.createClient(rpcUrls[index], chain));

    this.chainStates.set(chainId, state);
    console.log(`✅ RPC Manager initialized for chain ${chainId} with ${rpcUrls.length} RPC(s) (active: ${index})`);
  }

  // Get a healthy client for a chain
  async getClient(chainId: number): Promise<PublicClient> {
    let state = this.chainStates.get(chainId);

    // If chain not initialized, load from database
    if (!state) {
      const chain = await prisma.chain.findUnique({
        where: { chainId },
      });

      if (!chain) {
        throw new Error(`Chain ${chainId} not found`);
      }

      await this.initChain(chainId, chain.rpcUrls as string[], chain.activeRpcIndex);
      state = this.chainStates.get(chainId)!;
    }

    const activeIndex = state.activeRpcIndex;
    let client = state.clients.get(activeIndex);

    if (!client) {
      client = this.createClient(state.rpcUrls[activeIndex], state.chain);
      state.clients.set(activeIndex, client);
    }

    return client;
  }

  // Record a successful request
  recordSuccess(chainId: number, latency: number): void {
    const state = this.chainStates.get(chainId);
    if (!state) return;

    const health = state.health.get(state.activeRpcIndex);
    if (health) {
      health.isHealthy = true;
      health.latency = latency;
      health.lastChecked = new Date();
      health.errorCount = 0;
    }
  }

  // Record a failed request and potentially switch RPC
  async recordFailure(chainId: number, error: Error): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state) return;

    const health = state.health.get(state.activeRpcIndex);
    if (health) {
      health.lastError = error.message;
      health.lastChecked = new Date();

      // Switch immediately on auth/rate-limit type errors
      if (shouldSwitchImmediately(error)) {
        health.isHealthy = false;
        health.errorCount = Math.max(health.errorCount + 1, this.maxErrorsBeforeSwitch);
        await this.switchToNextRpc(chainId);
        return;
      }

      health.errorCount++;
      if (health.errorCount >= this.maxErrorsBeforeSwitch) {
        health.isHealthy = false;
        await this.switchToNextRpc(chainId);
      }
    }
  }

  // Switch to the next RPC (round-robin). Always rotate so we cycle through all URLs.
  private async switchToNextRpc(chainId: number): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state || state.rpcUrls.length <= 1) return;

    const startIndex = state.activeRpcIndex;
    const nextIndex = (startIndex + 1) % state.rpcUrls.length;

    state.activeRpcIndex = nextIndex;

    if (!state.clients.has(nextIndex)) {
      state.clients.set(
        nextIndex,
        this.createClient(state.rpcUrls[nextIndex], state.chain),
      );
    }

    await prisma.chain.update({
      where: { chainId },
      data: { activeRpcIndex: nextIndex },
    });

    const nextUrl = state.rpcUrls[nextIndex];
    const host = (() => { try { return new URL(nextUrl).hostname; } catch { return nextUrl.slice(0, 40); } })();
    console.log(
      `⚠️ Chain ${chainId}: Switched from RPC ${startIndex} to ${nextIndex} (${host})`,
    );
  }

  // Test all RPCs for a chain
  async testAllRpcs(chainId: number): Promise<RpcHealth[]> {
    const state = this.chainStates.get(chainId);
    if (!state) {
      throw new Error(`Chain ${chainId} not initialized`);
    }

    const results: RpcHealth[] = [];

    for (let i = 0; i < state.rpcUrls.length; i++) {
      const url = state.rpcUrls[i];
      const health: RpcHealth = {
        url,
        isHealthy: false,
        latency: 0,
        lastChecked: new Date(),
        errorCount: 0,
      };

      try {
        const client = this.createClient(url, state.chain);
        const start = Date.now();
        await client.getBlockNumber();
        health.latency = Date.now() - start;
        health.isHealthy = true;
      } catch (error: any) {
        health.lastError = error.message;
        health.isHealthy = false;
      }

      state.health.set(i, health);
      results.push(health);
    }

    return results;
  }

  // Get health status for a chain
  getChainHealth(chainId: number): {
    activeRpcIndex: number;
    rpcs: RpcHealth[];
  } | null {
    const state = this.chainStates.get(chainId);
    if (!state) return null;

    return {
      activeRpcIndex: state.activeRpcIndex,
      rpcs: Array.from(state.health.values()),
    };
  }

  // Remove chain from manager
  removeChain(chainId: number): void {
    this.chainStates.delete(chainId);
  }

  // Add new RPC URLs to an existing chain dynamically
  async addRpcUrls(chainId: number, newUrls: string[]): Promise<void> {
    const state = this.chainStates.get(chainId);
    if (!state) {
      // Chain not initialized, just init with new URLs
      await this.initChain(chainId, newUrls);
      return;
    }

    // Add only URLs that don't already exist
    const existingUrls = new Set(state.rpcUrls);
    const urlsToAdd = newUrls.filter((url) => !existingUrls.has(url));

    if (urlsToAdd.length === 0) return;

    const startIndex = state.rpcUrls.length;
    state.rpcUrls.push(...urlsToAdd);

    // Initialize health tracking for new RPCs
    urlsToAdd.forEach((url, i) => {
      state.health.set(startIndex + i, {
        url,
        isHealthy: true,
        latency: 0,
        lastChecked: new Date(),
        errorCount: 0,
      });
    });

    console.log(`✅ Added ${urlsToAdd.length} new RPC(s) to chain ${chainId}`);
  }

  // Remove an RPC URL from a chain
  async removeRpcUrl(chainId: number, urlToRemove: string): Promise<boolean> {
    const state = this.chainStates.get(chainId);
    if (!state) return false;

    const index = state.rpcUrls.indexOf(urlToRemove);
    if (index === -1) return false;

    // Don't allow removing the last RPC
    if (state.rpcUrls.length <= 1) {
      throw new Error('Cannot remove the last RPC URL');
    }

    // If removing the active RPC, switch first
    if (index === state.activeRpcIndex) {
      const nextIndex = (index + 1) % state.rpcUrls.length;
      state.activeRpcIndex = nextIndex > index ? nextIndex - 1 : nextIndex;
    } else if (index < state.activeRpcIndex) {
      // Adjust active index if removing an earlier RPC
      state.activeRpcIndex--;
    }

    // Remove the RPC
    state.rpcUrls.splice(index, 1);
    state.health.delete(index);
    state.clients.delete(index);

    // Rebuild health and client maps with corrected indices
    const newHealth = new Map<number, RpcHealth>();
    const newClients = new Map<number, PublicClient>();
    
    let newIndex = 0;
    for (const [oldIndex, health] of state.health) {
      if (oldIndex !== index) {
        newHealth.set(newIndex, health);
        const client = state.clients.get(oldIndex);
        if (client) newClients.set(newIndex, client);
        newIndex++;
      }
    }
    
    state.health = newHealth;
    state.clients = newClients;

    console.log(`✅ Removed RPC from chain ${chainId}: ${urlToRemove}`);
    return true;
  }

  // Update the full RPC list for a chain (replaces all)
  async updateRpcUrls(chainId: number, newUrls: string[]): Promise<void> {
    if (newUrls.length === 0) {
      throw new Error('At least one RPC URL is required');
    }

    const state = this.chainStates.get(chainId);
    if (!state) {
      await this.initChain(chainId, newUrls);
      return;
    }

    // Reset state with new URLs
    state.rpcUrls = newUrls;
    state.activeRpcIndex = 0;
    state.clients.clear();
    state.health.clear();

    // Initialize health tracking for all RPCs
    newUrls.forEach((url, index) => {
      state.health.set(index, {
        url,
        isHealthy: true,
        latency: 0,
        lastChecked: new Date(),
        errorCount: 0,
      });
    });

    // Create client for active RPC
    state.clients.set(0, this.createClient(newUrls[0], state.chain));

    console.log(`✅ Updated RPC list for chain ${chainId} with ${newUrls.length} URL(s)`);
  }

  // Create a viem client for an RPC URL
  private createClient(rpcUrl: string, chain: Chain): PublicClient {
    return createPublicClient({
      chain,
      transport: http(rpcUrl, {
        timeout: 30000,
        retryCount: 0, // We handle retries ourselves
      }),
      batch: {
        multicall: true,
      },
    });
  }

  // Get viem chain config by chainId
  private getViemChain(chainId: number): Chain {
    // Find matching chain from viem's chain list
    const allChains = Object.values(chains);
    const found = allChains.find((c) => c.id === chainId);

    if (found) return found;

    // Create custom chain config if not found
    return {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [''] },
      },
    } as Chain;
  }

  // Start background health checks
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [chainId, state] of this.chainStates) {
        try {
          const client = await this.getClient(chainId);
          const start = Date.now();
          await client.getBlockNumber();
          this.recordSuccess(chainId, Date.now() - start);
        } catch (error: any) {
          await this.recordFailure(chainId, error);
        }
      }
    }, this.healthCheckIntervalMs);
  }

  // Stop health checks (for cleanup)
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Initialize all chains from database
  async initAllChains(): Promise<void> {
    const chains = await prisma.chain.findMany({
      where: { isActive: true, protocol: 'evm' },
    });

    for (const chain of chains) {
      await this.initChain(chain.chainId, chain.rpcUrls as string[], chain.activeRpcIndex);
    }

    console.log(`✅ RPC Manager: Initialized ${chains.length} chain(s)`);
  }
}

// Export singleton instance
export const rpcManager = new RpcManager();
