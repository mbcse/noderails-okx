import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { adminAuth } from '../middleware/auth.js';
import { rpcManager } from '../services/rpc-manager.js';
import { nativeIndexerService } from '../services/native-indexer.js';
import { startChainIndexers, stopChainIndexers } from '../lib/chain-indexers.js';
import { testSuiRpc } from '../services/sui-rpc.js';

function isEvmProtocol(protocol: string): boolean {
  return protocol === 'evm';
}

const router = Router();

// Apply admin auth to all routes
router.use(adminAuth);

// Validation schemas
const createChainSchema = z.object({
  protocol: z.enum(['evm', 'solana', 'sui']).default('evm'),
  chainId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  rpcUrls: z.array(z.string().url()).min(1),
  graphqlUrls: z.array(z.string().url()).optional(),
  blockTime: z.number().int().positive().optional().default(12000),
  finalityBlocks: z.number().int().min(0).optional().default(64),
});

const updateChainSchema = z.object({
  protocol: z.enum(['evm', 'solana', 'sui']).optional(),
  name: z.string().min(1).max(100).optional(),
  rpcUrls: z.array(z.string().url()).min(1).optional(),
  graphqlUrls: z.array(z.string().url()).optional(),
  blockTime: z.number().int().positive().optional(),
  finalityBlocks: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  activeRpcIndex: z.number().int().min(0).optional(),
});

// GET /api/admin/chains - List all chains
router.get('/', async (req: Request, res: Response) => {
  try {
    const chains = await prisma.chain.findMany({
      orderBy: { chainId: 'asc' },
    });

    // Add RPC health info
    const chainsWithHealth = chains.map((chain) => ({
      ...chain,
      rpcHealth: rpcManager.getChainHealth(chain.chainId),
    }));

    res.json({
      success: true,
      data: chainsWithHealth,
    });
  } catch (error) {
    console.error('Error fetching chains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chains',
    });
  }
});

// GET /api/admin/chains/native-index-state - Native indexer cursor + current block per chain
router.get('/native-index-state', async (req: Request, res: Response) => {
  try {
    const activeChains = await prisma.chain.findMany({
      where: { isActive: true },
      select: { chainId: true, name: true, finalityBlocks: true },
    });
    const states = await prisma.nativeIndexState.findMany({
      where: { chainId: { in: activeChains.map((c) => c.chainId) } },
      select: { chainId: true, lastIndexedBlock: true },
    });
    const stateByChain = new Map(states.map((s) => [s.chainId, s]));

    const result: Array<{
      chainId: number;
      name: string;
      lastIndexedBlock: string;
      currentBlock: string | null;
      safeBlock: string | null;
      behindBy: number | null;
      status: 'caught up' | 'indexing' | 'unknown';
    }> = [];

    for (const chain of activeChains) {
      const state = stateByChain.get(chain.chainId);
      const lastIndexedBlock = state?.lastIndexedBlock ?? null;
      let currentBlock: bigint | null = null;
      try {
        const client = await rpcManager.getClient(chain.chainId);
        currentBlock = await client.getBlockNumber();
      } catch {
        // RPC may be down
      }
      const safeBlock = currentBlock !== null ? currentBlock - BigInt(chain.finalityBlocks) : null;
      const lastNum = lastIndexedBlock !== null ? Number(lastIndexedBlock) : null;
      const safeNum = safeBlock !== null ? Number(safeBlock) : null;
      let behindBy: number | null = null;
      let status: 'caught up' | 'indexing' | 'unknown' = 'unknown';
      if (lastNum !== null && safeNum !== null) {
        behindBy = Math.max(0, safeNum - lastNum);
        status = behindBy === 0 ? 'caught up' : 'indexing';
      }

      result.push({
        chainId: chain.chainId,
        name: chain.name,
        lastIndexedBlock: lastIndexedBlock?.toString() ?? '—',
        currentBlock: currentBlock !== null ? currentBlock.toString() : null,
        safeBlock: safeBlock !== null ? safeBlock.toString() : null,
        behindBy,
        status,
      });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching native index state:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch native index state' });
  }
});

// GET /api/admin/chains/:id - Get chain by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
      include: {
        contracts: {
          select: {
            id: true,
            name: true,
            address: true,
            isActive: true,
          },
        },
        _count: {
          select: { contracts: true },
        },
      },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    res.json({
      success: true,
      data: {
        ...chain,
        rpcHealth: rpcManager.getChainHealth(chain.chainId),
      },
    });
  } catch (error) {
    console.error('Error fetching chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chain',
    });
  }
});

// POST /api/admin/chains - Create new chain
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createChainSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { protocol, chainId, name, rpcUrls, graphqlUrls, blockTime, finalityBlocks } = validation.data;

    // Check if chain already exists
    const existing = await prisma.chain.findUnique({
      where: { chainId },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Chain with chainId ${chainId} already exists`,
      });
    }

    const chain = await prisma.chain.create({
      data: {
        protocol,
        chainId,
        name,
        rpcUrls,
        graphqlUrls: graphqlUrls ?? Prisma.JsonNull,
        blockTime,
        finalityBlocks,
      },
    });

    if (isEvmProtocol(chain.protocol)) {
      await rpcManager.initChain(chain.chainId, rpcUrls as string[]);
    }

    // Start indexer loops for the new chain (if active)
    if (chain.isActive) {
      await startChainIndexers(chain.protocol, chain.chainId);
    }

    res.status(201).json({
      success: true,
      data: chain,
      message: 'Chain created successfully',
    });
  } catch (error) {
    console.error('Error creating chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create chain',
    });
  }
});

// PUT /api/admin/chains/:id - Update chain
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const validation = updateChainSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    const updated = await prisma.chain.update({
      where: { id: req.params.id },
      data: validation.data,
    });

    if (validation.data.rpcUrls && isEvmProtocol(updated.protocol)) {
      await rpcManager.updateRpcUrls(updated.chainId, validation.data.rpcUrls as string[]);
    }

    // Handle indexer workers based on active status change
    if (validation.data.isActive !== undefined) {
      if (validation.data.isActive) {
        await startChainIndexers(updated.protocol, updated.chainId);
      } else {
        await stopChainIndexers(updated.protocol, updated.chainId);
      }
    }

    res.json({
      success: true,
      data: updated,
      message: 'Chain updated successfully',
    });
  } catch (error) {
    console.error('Error updating chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update chain',
    });
  }
});

// DELETE /api/admin/chains/:id - Delete chain
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { contracts: true } } },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    if (chain._count.contracts > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete chain with active contracts. Remove contracts first.',
      });
    }

    await prisma.chain.delete({
      where: { id: req.params.id },
    });

    await stopChainIndexers(chain.protocol, chain.chainId);

    if (isEvmProtocol(chain.protocol)) {
      rpcManager.removeChain(chain.chainId);
    }

    res.json({
      success: true,
      message: 'Chain deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete chain',
    });
  }
});

// POST /api/admin/chains/:id/native-index-reset - Reset native index cursor to re-scan recent blocks (backfill)
router.post('/:id/native-index-reset', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      backfillBlocks: z.number().int().min(1).max(10000).optional().default(100),
    });
    const validation = schema.safeParse(req.body);
    const backfillBlocks = validation.success ? validation.data.backfillBlocks : 100;

    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
    });
    if (!chain) {
      return res.status(404).json({ success: false, error: 'Chain not found' });
    }
    const client = await rpcManager.getClient(chain.chainId);
    const head = await client.getBlockNumber();
    const safeBlock = head - BigInt(chain.finalityBlocks);
    const newCursor = safeBlock - BigInt(backfillBlocks);
    const lastIndexedBlock = newCursor > 0n ? newCursor : 0n;

    await prisma.nativeIndexState.upsert({
      where: { chainId: chain.chainId },
      create: { chainId: chain.chainId, lastIndexedBlock },
      update: { lastIndexedBlock },
    });
    nativeIndexerService.invalidateCache(chain.chainId);

    res.json({
      success: true,
      data: {
        chainId: chain.chainId,
        lastIndexedBlock: lastIndexedBlock.toString(),
        backfillBlocks,
        message: `Native index reset. Next run will process blocks from ${lastIndexedBlock + 1n} up to ${safeBlock}.`,
      },
    });
  } catch (error: any) {
    console.error('Error resetting native index:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to reset native index' });
  }
});

// POST /api/admin/chains/:id/test-rpc - Test RPC connection
router.post('/:id/test-rpc', async (req: Request, res: Response) => {
  try {
    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    // For Solana chains, avoid viem/rpcManager (EVM-focused). Test via JSON-RPC directly.
    if (chain.protocol === 'solana') {
      const results: Array<{ url: string; isHealthy: boolean; latency: number; lastError?: string }> = [];
      for (const url of chain.rpcUrls as string[]) {
        const start = Date.now();
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion', params: [] }),
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            results.push({ url, isHealthy: false, latency: Date.now() - start, lastError: `Status: ${resp.status} ${resp.statusText} ${text}` });
            continue;
          }

          const data: any = await resp.json().catch(() => null);
          if (data && (data.result || data.jsonrpc)) {
            results.push({ url, isHealthy: true, latency: Date.now() - start });
          } else {
            results.push({ url, isHealthy: false, latency: Date.now() - start, lastError: 'Invalid JSON-RPC response' });
          }
        } catch (err: any) {
          results.push({ url, isHealthy: false, latency: Date.now() - start, lastError: err?.message });
        }
      }

      return res.json({ success: true, data: results });
    }

    if (chain.protocol === 'sui') {
      const results = await testSuiRpc(chain);
      return res.json({
        success: true,
        data: results.map((item) => ({
          url: item.url,
          isHealthy: item.isHealthy,
          latency: item.latency,
          lastError: item.lastError,
          kind: item.kind,
        })),
      });
    }

    const health = await rpcManager.testAllRpcs(chain.chainId);

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Error testing RPC:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test RPC connections',
    });
  }
});

// POST /api/admin/chains/:id/rpcs - Add new RPC URLs dynamically
router.post('/:id/rpcs', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      urls: z.array(z.string().url()).min(1),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    // Add new URLs to database
    const currentUrls = chain.rpcUrls as string[];
    const newUrls = validation.data.urls.filter((url) => !currentUrls.includes(url));
    
    if (newUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'All URLs already exist',
      });
    }

    const updatedUrls = [...currentUrls, ...newUrls];

    await prisma.chain.update({
      where: { id: req.params.id },
      data: { rpcUrls: updatedUrls },
    });

    // Add to RPC manager (takes effect immediately)
    await rpcManager.addRpcUrls(chain.chainId, newUrls);

    res.json({
      success: true,
      data: { addedUrls: newUrls, totalUrls: updatedUrls.length },
      message: `Added ${newUrls.length} RPC URL(s)`,
    });
  } catch (error) {
    console.error('Error adding RPC URLs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add RPC URLs',
    });
  }
});

// DELETE /api/admin/chains/:id/rpcs - Remove an RPC URL
router.delete('/:id/rpcs', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      url: z.string().url(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const chain = await prisma.chain.findUnique({
      where: { id: req.params.id },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    const currentUrls = chain.rpcUrls as string[];
    
    if (currentUrls.length <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove the last RPC URL',
      });
    }

    const urlToRemove = validation.data.url;
    if (!currentUrls.includes(urlToRemove)) {
      return res.status(404).json({
        success: false,
        error: 'RPC URL not found',
      });
    }

    const updatedUrls = currentUrls.filter((url) => url !== urlToRemove);

    await prisma.chain.update({
      where: { id: req.params.id },
      data: { rpcUrls: updatedUrls },
    });

    // Remove from RPC manager (takes effect immediately)
    await rpcManager.removeRpcUrl(chain.chainId, urlToRemove);

    res.json({
      success: true,
      data: { removedUrl: urlToRemove, remainingUrls: updatedUrls.length },
      message: 'RPC URL removed',
    });
  } catch (error) {
    console.error('Error removing RPC URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove RPC URL',
    });
  }
});

export default router;
