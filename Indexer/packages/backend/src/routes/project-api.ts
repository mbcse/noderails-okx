import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { extractEventsFromAbi } from '../services/abi-parser.js';
import { extractDefinitionsFromSolanaIdl, validateSolanaIdl } from '../services/solana-idl-parser.js';
import { extractDefinitionsFromSuiManifest, validateSuiManifest } from '../services/sui-package-parser.js';
import { getCurrentSolanaSlot } from '../services/solana-rpc.js';
import { getLatestCheckpoint } from '../services/sui-rpc.js';
import { fetchSolanaIdl } from '../services/solana-idl-fetcher.js';
import { fetchManifestByChainAndPackage } from '../services/sui-package-fetcher.js';
import { invalidateContractIndexerCache } from '../lib/protocol.js';
import { ensureChainIndexersRunning } from '../lib/chain-indexers.js';
import { nativeIndexerService } from '../services/native-indexer.js';
import { rpcManager } from '../services/rpc-manager.js';
import type { FilterConditions } from '../lib/filter-match.js';

// Middleware: require x-api-key and resolve project
async function requireProjectApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');
  if (!apiKey) return res.status(401).json({ success: false, error: 'Missing x-api-key' });
  const project = await prisma.project.findUnique({ where: { apiKey } });
  if (!project) return res.status(403).json({ success: false, error: 'Invalid API key' });
  (req as any).project = project;
  next();
}

/** Merge one (field, op, value) into existing filterConditions. */
function mergeCondition(existing: FilterConditions | null, field: string, op: string, value: string): FilterConditions {
  const path = field.startsWith('args.') ? field : `args.${field}`;
  let val: any = value;
  if (op === 'in' || op === 'nin') {
    try {
      val = JSON.parse(value);
    } catch {
      val = [value];
    }
  }
  return { ...(existing || {}), [path]: { [op]: val } };
}

const router = Router();
router.use(requireProjectApiKey);

// ── Chains (read-only: chains are global, managed by admin) ─────────────────

// GET /api/project/chains - List all chains (global; no project scoping)
router.get('/chains', async (req: Request, res: Response) => {
  try {
    const chains = await prisma.chain.findMany({
      where: { isActive: true },
      orderBy: { chainId: 'asc' },
    });
    res.json({ success: true, data: chains });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to list chains', details: e?.message });
  }
});

// GET /api/project/chains/:id - Get one chain by id (uuid)
router.get('/chains/:id', async (req: Request, res: Response) => {
  try {
    const chain = await prisma.chain.findUnique({ where: { id: req.params.id } });
    if (!chain) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: chain });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch chain', details: e?.message });
  }
});

// POST /api/project/chains - Not supported; chains are managed by admin
router.post('/chains', async (_req: Request, res: Response) => {
  res.status(400).json({
    success: false,
    error: 'Chains are managed by the administrator. Use GET /chains to list available chains.',
  });
});

// ── Contracts ───────────────────────────────────────────────────────────────

// GET /api/project/contracts - List contracts for the project
router.get('/contracts', async (req: Request, res: Response) => {
  const project = (req as any).project;
  try {
    const contracts = await prisma.contract.findMany({
      where: { projectId: project.id },
      include: {
        chain: { select: { id: true, name: true, chainId: true } },
        eventSubscriptions: { select: { id: true, eventName: true, isActive: true } },
      },
    });
    const serialized = contracts.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      chainId: c.chainId,
      address: c.address,
      abi: c.abi,
      name: c.name,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      startBlock: c.startBlock?.toString() ?? '0',
      chain: c.chain,
      eventSubscriptions: c.eventSubscriptions,
    }));
    res.json({ success: true, data: serialized });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to list contracts', details: e?.message });
  }
});

// GET /api/project/contracts/:contractId - Get one contract (project-scoped)
router.get('/contracts/:contractId', async (req: Request, res: Response) => {
  const project = (req as any).project;
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.contractId },
      include: {
        chain: true,
        eventSubscriptions: true,
        indexStates: true,
      },
    });
    if (!contract || contract.projectId !== project.id) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({
      success: true,
      data: {
        id: contract.id,
        projectId: contract.projectId,
        chainId: contract.chainId,
        address: contract.address,
        abi: contract.abi,
        name: contract.name,
        isActive: contract.isActive,
        createdAt: contract.createdAt,
        updatedAt: contract.updatedAt,
        startBlock: contract.startBlock?.toString() ?? '0',
        chain: contract.chain,
        eventSubscriptions: contract.eventSubscriptions,
        indexStates: contract.indexStates?.map((s) => ({
          id: s.id,
          chainId: s.chainId,
          contractId: s.contractId,
          updatedAt: s.updatedAt,
          lastIndexedBlock: s.lastIndexedBlock?.toString(),
          lastFinalizedBlock: s.lastFinalizedBlock?.toString(),
        })),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch contract', details: e?.message });
  }
});

// POST /api/project/contracts - Add contract (creates event subscriptions + index state)
router.post('/contracts', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { chainId, address, abi, name, startBlock, protocol = 'evm' } = req.body;
  if (!chainId || !address || !abi) {
    return res.status(400).json({ success: false, error: 'chainId, address/programId, and abi/idl required' });
  }

  const parsedAbi = Array.isArray(abi) ? abi : (() => {
    try { return typeof abi === 'string' ? JSON.parse(abi) : abi; } catch { return null; }
  })();
  if (protocol === 'evm' && (!Array.isArray(parsedAbi) || parsedAbi.length === 0)) {
    return res.status(400).json({ success: false, error: 'abi must be a non-empty JSON array for EVM contracts' });
  }
  if (protocol === 'solana') {
    const idlCheck = validateSolanaIdl(parsedAbi);
    if (!idlCheck.valid) {
      return res.status(400).json({ success: false, error: 'Invalid Solana IDL', details: idlCheck.errors });
    }
  }
  if (protocol === 'sui') {
    const manifestCheck = validateSuiManifest(parsedAbi);
    if (!manifestCheck.valid) {
      return res.status(400).json({ success: false, error: 'Invalid SUI manifest', details: manifestCheck.errors });
    }
  }

  try {
    const chain = await prisma.chain.findUnique({ where: { chainId: Number(chainId) } });
    if (!chain) return res.status(400).json({ success: false, error: 'Chain not found; add the chain in the admin first.' });
    if (chain.protocol !== protocol) {
      return res.status(400).json({
        success: false,
        error: `Chain uses protocol "${chain.protocol}" but contract protocol is "${protocol}".`,
      });
    }
    if (!chain.isActive) {
      return res.status(400).json({ success: false, error: 'Chain is inactive. Activate it before adding contracts.' });
    }

    const events = protocol === 'sui'
      ? extractDefinitionsFromSuiManifest(parsedAbi).map((definition) => ({
          name: definition.name,
          signature: definition.signature,
          topic0: definition.topic0,
          abiItem: definition.raw,
        }))
      : protocol === 'solana'
      ? extractDefinitionsFromSolanaIdl(parsedAbi).map((event) => ({
          name: event.name,
          signature: event.signature,
          topic0: event.topic0,
          abiItem: event.raw,
        }))
      : extractEventsFromAbi(parsedAbi);
    if (events.length === 0) return res.status(400).json({ success: false, error: 'No decodable events found in the provided ABI/IDL' });

    let startBlockNum = Number(startBlock);
    if (Number.isNaN(startBlockNum) || startBlockNum < 0) {
      try {
        if (protocol === 'sui') {
          startBlockNum = Number(await getLatestCheckpoint(chain));
        } else if (protocol === 'solana') {
          startBlockNum = Number(await getCurrentSolanaSlot(chain));
        } else {
          const client = await rpcManager.getClient(Number(chainId));
          startBlockNum = Number(await client.getBlockNumber());
        }
      } catch {
        startBlockNum = 0;
      }
    }

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          projectId: project.id,
          chainId: Number(chainId),
          protocol,
          address: protocol === 'evm' || protocol === 'sui' ? address.toLowerCase() : address,
          abi: parsedAbi,
          name: name || 'Contract',
          startBlock: BigInt(startBlockNum),
        },
      });
      await tx.eventSubscription.createMany({
        data: events.map((e) => ({
          contractId: created.id,
          eventName: e.name,
          eventSignature: e.signature,
          topic0: e.topic0,
          abiItem: e.abiItem,
          isActive: true,
        })),
      });
      await tx.indexState.create({
        data: {
          chainId: Number(chainId),
          contractId: created.id,
          lastIndexedBlock: BigInt(startBlockNum),
        },
      });
      return tx.contract.findUnique({
        where: { id: created.id },
        include: { chain: true, eventSubscriptions: true, indexStates: true },
      });
    });

    invalidateContractIndexerCache(protocol, Number(chainId));
    await ensureChainIndexersRunning(chain.protocol, Number(chainId), chain.isActive);
    const c = contract!;
    res.status(201).json({
      success: true,
      data: {
        id: c.id,
        projectId: c.projectId,
        chainId: c.chainId,
        address: c.address,
        abi: c.abi,
        name: c.name,
        isActive: c.isActive,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        startBlock: c.startBlock?.toString() ?? '0',
        chain: c.chain,
        eventSubscriptions: c.eventSubscriptions,
        indexStates: c.indexStates?.map((s) => ({
          ...s,
          lastIndexedBlock: s.lastIndexedBlock?.toString(),
          lastFinalizedBlock: s.lastFinalizedBlock?.toString(),
        })),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to add contract', details: e?.message });
  }
});

// DELETE /api/project/contracts/:contractId
router.delete('/contracts/:contractId', async (req: Request, res: Response) => {
  const project = (req as any).project;
  try {
    const contract = await prisma.contract.findUnique({ where: { id: req.params.contractId } });
    if (!contract || contract.projectId !== project.id) return res.status(404).json({ success: false, error: 'Not found' });
    await prisma.contract.delete({ where: { id: req.params.contractId } });
    invalidateContractIndexerCache(contract.protocol, contract.chainId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to delete contract', details: e?.message });
  }
});

// ── Filters (EventSubscription.filterConditions only; no separate table) ─────

// GET /api/project/filters - List event subscriptions with filter conditions (optional ?contractId=)
router.get('/filters', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { contractId } = req.query;
  try {
    const where: any = { contract: { projectId: project.id } };
    if (contractId) where.contractId = contractId;
    const subs = await prisma.eventSubscription.findMany({
      where,
      include: { contract: { select: { id: true, name: true, address: true } } },
    });
    const data = subs.map((s) => ({
      contractId: s.contractId,
      eventName: s.eventName,
      subscriptionId: s.id,
      filterConditions: s.filterConditions,
      contract: s.contract,
    }));
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to list filters', details: e?.message });
  }
});

// GET /api/project/filters/by-subscription - Get filter conditions for one subscription (?contractId= & eventName=)
router.get('/filters/by-subscription', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { contractId, eventName } = req.query;
  if (!contractId || !eventName) {
    return res.status(400).json({ success: false, error: 'contractId and eventName required' });
  }
  try {
    const sub = await prisma.eventSubscription.findUnique({
      where: { contractId_eventName: { contractId: contractId as string, eventName: eventName as string } },
      include: { contract: { select: { id: true, name: true, address: true, projectId: true } } },
    });
    if (!sub) return res.status(404).json({ success: false, error: 'Not found' });
    if (sub.contract.projectId !== project.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({
      success: true,
      data: {
        contractId: sub.contractId,
        eventName: sub.eventName,
        subscriptionId: sub.id,
        filterConditions: sub.filterConditions,
        contract: { id: sub.contract.id, name: sub.contract.name, address: sub.contract.address },
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch filter', details: e?.message });
  }
});

// POST /api/project/filters - Add/merge one condition into EventSubscription.filterConditions
router.post('/filters', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { contractId, eventName, field, op, value } = req.body;
  if (!contractId || !eventName || !field || !op || value === undefined) {
    return res.status(400).json({ success: false, error: 'contractId, eventName, field, op, value required' });
  }
  try {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract || contract.projectId !== project.id) return res.status(404).json({ success: false, error: 'Contract not found' });
    const sub = await prisma.eventSubscription.findUnique({
      where: { contractId_eventName: { contractId, eventName } },
    });
    if (!sub) return res.status(400).json({ success: false, error: `No event subscription for "${eventName}" on this contract` });
    const filterConditions = mergeCondition(sub.filterConditions as FilterConditions | null, field, op, String(value));
    await prisma.eventSubscription.update({
      where: { id: sub.id },
      data: { filterConditions },
    });
    invalidateContractIndexerCache(contract.protocol, contract.chainId);
    res.status(201).json({
      success: true,
      data: { contractId, eventName, subscriptionId: sub.id, filterConditions },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to add filter', details: e?.message });
  }
});

// PUT /api/project/filters - Update one condition (?contractId= & eventName=; body: field, op, value)
router.put('/filters', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { contractId, eventName } = req.query;
  const { field, op, value } = req.body;
  if (!contractId || !eventName) {
    return res.status(400).json({ success: false, error: 'contractId and eventName required (query)' });
  }
  if (!field || !op || value === undefined) {
    return res.status(400).json({ success: false, error: 'field, op, value required (body)' });
  }
  try {
    const sub = await prisma.eventSubscription.findUnique({
      where: { contractId_eventName: { contractId: contractId as string, eventName: eventName as string } },
      include: { contract: true },
    });
    if (!sub) return res.status(404).json({ success: false, error: 'Not found' });
    if (sub.contract.projectId !== project.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    const filterConditions = mergeCondition(sub.filterConditions as FilterConditions | null, field, op, String(value));
    await prisma.eventSubscription.update({
      where: { id: sub.id },
      data: { filterConditions },
    });
    invalidateContractIndexerCache(sub.contract.protocol, sub.contract.chainId);
    res.json({ success: true, data: { contractId: sub.contractId, eventName: sub.eventName, subscriptionId: sub.id, filterConditions } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to update filter', details: e?.message });
  }
});

// DELETE /api/project/filters - Clear filter conditions (?contractId= & eventName=)
router.delete('/filters', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { contractId, eventName } = req.query;
  if (!contractId || !eventName) {
    return res.status(400).json({ success: false, error: 'contractId and eventName required' });
  }
  try {
    const sub = await prisma.eventSubscription.findUnique({
      where: { contractId_eventName: { contractId: contractId as string, eventName: eventName as string } },
      include: { contract: true },
    });
    if (!sub) return res.status(404).json({ success: false, error: 'Not found' });
    if (sub.contract.projectId !== project.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    await prisma.eventSubscription.update({
      where: { id: sub.id },
      data: { filterConditions: Prisma.JsonNull },
    });
    invalidateContractIndexerCache(sub.contract.protocol, sub.contract.chainId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to delete filter', details: e?.message });
  }
});

// ── Watched addresses (native transfer tracking) ─────────────────────────────

// GET /api/project/watched-addresses - List (?chainId= optional, chainId=all for "all chains")
router.get('/watched-addresses', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { chainId } = req.query;
  try {
    const where: any = { projectId: project.id };
    if (chainId !== undefined && chainId !== '') {
      if (String(chainId).toLowerCase() === 'all') where.chainId = null;
      else where.chainId = parseInt(chainId as string, 10);
    }
    const list = await prisma.watchedAddress.findMany({ where });
    res.json({ success: true, data: list });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to list watched addresses', details: e?.message });
  }
});

// GET /api/project/watched-addresses/:id - Get one (must belong to project)
router.get('/watched-addresses/:id', async (req: Request, res: Response) => {
  const project = (req as any).project;
  try {
    const row = await prisma.watchedAddress.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (row.projectId !== project.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    res.json({ success: true, data: row });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch watched address', details: e?.message });
  }
});

// POST /api/project/watched-addresses - Add (body: address, chainId? optional null=all chains, direction?, label?)
router.post('/watched-addresses', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { chainId, address, direction, label } = req.body;
  if (!address) {
    return res.status(400).json({ success: false, error: 'address required' });
  }
  const chainIdVal = chainId === undefined || chainId === null || chainId === 'all' ? null : Number(chainId);
  if (chainIdVal !== null && isNaN(chainIdVal)) {
    return res.status(400).json({ success: false, error: 'chainId must be a number or null/all for all chains' });
  }
  const dir = direction === 'in' || direction === 'out' ? direction : 'both';
  try {
    if (chainIdVal !== null) {
      const chain = await prisma.chain.findUnique({ where: { chainId: chainIdVal } });
      if (!chain) return res.status(400).json({ success: false, error: 'Chain not found; add the chain in the admin first.' });
    }
    const created = await prisma.watchedAddress.create({
      data: {
        projectId: project.id,
        chainId: chainIdVal,
        address: address.toLowerCase(),
        direction: dir,
        label: label ?? null,
      },
    });
    if (chainIdVal === null) nativeIndexerService.invalidateCacheAll();
    else nativeIndexerService.invalidateCache(chainIdVal);
    res.status(201).json({ success: true, data: created });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'This address is already watched for this project and chain' });
    }
    res.status(500).json({ success: false, error: 'Failed to add watched address', details: e?.message });
  }
});

// POST /api/project/watched-addresses/bulk - Add multiple (body: addresses[], chainId? optional null=all chains, direction?, label?)
router.post('/watched-addresses/bulk', async (req: Request, res: Response) => {
  const project = (req as any).project;
  const { chainId, addresses, direction, label } = req.body;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return res.status(400).json({ success: false, error: 'addresses[] required' });
  }
  const chainIdVal = chainId === undefined || chainId === null || chainId === 'all' ? null : Number(chainId);
  if (chainIdVal !== null && isNaN(chainIdVal)) {
    return res.status(400).json({ success: false, error: 'chainId must be a number or null/all for all chains' });
  }
  const dir = direction === 'in' || direction === 'out' ? direction : 'both';
  try {
    if (chainIdVal !== null) {
      const chain = await prisma.chain.findUnique({ where: { chainId: chainIdVal } });
      if (!chain) return res.status(400).json({ success: false, error: 'Chain not found; add the chain in the admin first.' });
    }
    const unique = [...new Set((addresses as string[]).map((a: string) => String(a).toLowerCase()))].filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
    const created: any[] = [];
    const skipped: string[] = [];
    for (const address of unique) {
      try {
        const row = await prisma.watchedAddress.create({
          data: {
            projectId: project.id,
            chainId: chainIdVal,
            address,
            direction: dir,
            label: label ?? null,
          },
        });
        created.push(row);
      } catch (e: any) {
        if (e?.code === 'P2002') skipped.push(address);
        else throw e;
      }
    }
    if (chainIdVal === null) nativeIndexerService.invalidateCacheAll();
    else nativeIndexerService.invalidateCache(chainIdVal);
    res.status(201).json({ success: true, data: { created, skipped } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to add watched addresses', details: e?.message });
  }
});

// DELETE /api/project/watched-addresses/:id
router.delete('/watched-addresses/:id', async (req: Request, res: Response) => {
  const project = (req as any).project;
  try {
    const row = await prisma.watchedAddress.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (row.projectId !== project.id) return res.status(403).json({ success: false, error: 'Forbidden' });
    await prisma.watchedAddress.delete({ where: { id: req.params.id } });
    if (row.chainId === null) nativeIndexerService.invalidateCacheAll();
    else nativeIndexerService.invalidateCache(row.chainId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: 'Failed to delete watched address', details: e?.message });
  }
});

// POST /api/project/fetch-manifest - Fetch SUI package manifest
router.post('/fetch-manifest', async (req: Request, res: Response) => {
  try {
    const { chainId, packageId } = req.body;
    if (!chainId || !packageId) {
      return res.status(400).json({ success: false, error: 'chainId and packageId are required' });
    }

    const chain = await prisma.chain.findUnique({
      where: { chainId: typeof chainId === 'string' ? parseInt(chainId, 10) : chainId },
    });

    if (!chain) {
      return res.status(404).json({ success: false, error: 'Chain not found' });
    }

    if (chain.protocol !== 'sui') {
      return res.status(400).json({ success: false, error: 'Manifest fetching is only available for SUI chains' });
    }

    const result = await fetchManifestByChainAndPackage(chain.chainId, packageId);
    if (!result.success || !result.manifest) {
      const status = result.errorCode === 'no_indexable_items' ? 400 : 404;
      return res.status(status).json({
        success: false,
        error: result.error ?? `Could not fetch manifest for package ${packageId}`,
        errorCode: result.errorCode,
      });
    }

    res.json({
      success: true,
      data: { manifest: result.manifest },
      message: 'Package manifest fetched successfully',
    });
  } catch (error: any) {
    console.error('Error fetching SUI manifest:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch manifest' });
  }
});

// POST /api/project/fetch-idl - Fetch Solana program IDL (for project API)
router.post('/fetch-idl', async (req: Request, res: Response) => {
  try {
    const { chainId, programId } = req.body;
    if (!chainId || !programId) {
      return res.status(400).json({
        success: false,
        error: 'chainId and programId are required',
      });
    }

    // Get the chain to retrieve its RPC URL
    const chain = await prisma.chain.findUnique({
      where: { chainId: typeof chainId === 'string' ? parseInt(chainId, 10) : chainId },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: `Chain not found`,
      });
    }

    if (chain.protocol !== 'solana') {
      return res.status(400).json({
        success: false,
        error: 'IDL fetching is only available for Solana chains',
      });
    }

    // Get the active RPC URL from the chain
    const rpcUrls = chain.rpcUrls as string[];
    const activeRpcIndex = chain.activeRpcIndex || 0;
    const rpcUrl = rpcUrls[Math.min(activeRpcIndex, rpcUrls.length - 1)];

    if (!rpcUrl) {
      return res.status(400).json({
        success: false,
        error: 'No RPC URL configured for this chain',
      });
    }

    // Attempt to fetch the IDL
    const idl = await fetchSolanaIdl(programId, rpcUrl);

    if (!idl) {
      return res.status(404).json({
        success: false,
        error: `Could not fetch IDL for program ${programId}. Program may not be an Anchor program or may not have on-chain IDL.`,
      });
    }

    res.json({
      success: true,
      data: { idl },
      message: 'IDL fetched successfully',
    });
  } catch (error: any) {
    console.error('Error fetching IDL:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch IDL',
    });
  }
});

export default router;
