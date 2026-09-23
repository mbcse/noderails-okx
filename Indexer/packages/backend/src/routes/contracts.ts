import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { adminAuth } from '../middleware/auth.js';
import { extractEventsFromAbi } from '../services/abi-parser.js';
import { extractDefinitionsFromSolanaIdl, validateSolanaIdl } from '../services/solana-idl-parser.js';
import { getCurrentSolanaSlot } from '../services/solana-rpc.js';
import { extractDefinitionsFromSuiManifest, validateSuiManifest } from '../services/sui-package-parser.js';
import { getLatestCheckpoint } from '../services/sui-rpc.js';
import { fetchManifestByChainAndPackage } from '../services/sui-package-fetcher.js';
import { invalidateContractIndexerCache } from '../lib/protocol.js';
import { ensureChainIndexersRunning } from '../lib/chain-indexers.js';
import { rpcManager } from '../services/rpc-manager.js';
import { fetchSolanaIdl } from '../services/solana-idl-fetcher.js';

const router = Router();

function extractEventsForProtocol(protocol: string, abi: any) {
  if (protocol === 'sui') {
    return extractDefinitionsFromSuiManifest(abi).map((definition) => ({
      name: definition.name,
      signature: definition.signature,
      topic0: definition.topic0,
      abiItem: definition.raw,
    }));
  }
  if (protocol === 'solana') {
    return extractDefinitionsFromSolanaIdl(abi).map((definition) => ({
      name: definition.name,
      signature: definition.signature,
      topic0: definition.topic0,
      abiItem: definition.raw,
    }));
  }
  return extractEventsFromAbi(abi as any[]);
}

// Apply admin auth to all routes
router.use(adminAuth);

// Validation schemas
const createContractSchema = z.object({
  projectId: z.string().uuid(),
  chainId: z.number().int().positive(),
  protocol: z.enum(['evm', 'solana', 'sui']).default('evm'),
  address: z.string().min(1, 'Address / program id is required'),
  abi: z.union([
    z.array(z.any()).min(1, 'ABI must contain at least one item'),
    z.object({}).passthrough(),
  ]),
  startBlock: z.number().int().min(0).optional(),
  name: z.string().min(1).max(100),
  selectedEvents: z.array(z.string()).optional(), // event names to enable; rest created as inactive
}).superRefine((value, ctx) => {
  if (value.protocol === 'evm' && !Array.isArray(value.abi)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abi'],
      message: 'EVM contracts require an ABI array',
    });
  }

  if (value.protocol === 'solana' && Array.isArray(value.abi)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abi'],
      message: 'Solana programs require an IDL object',
    });
  }

  if (value.protocol === 'sui' && Array.isArray(value.abi)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abi'],
      message: 'SUI packages require a manifest object',
    });
  }

  if (value.protocol === 'evm' && !/^0x[a-fA-F0-9]{40}$/.test(value.address)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['address'],
      message: 'Invalid Ethereum address',
    });
  }

  if (value.protocol === 'solana' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.address)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['address'],
      message: 'Invalid Solana program id',
    });
  }

  if (value.protocol === 'sui' && !/^0x[a-fA-F0-9]{1,64}$/.test(value.address)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['address'],
      message: 'Invalid SUI package id',
    });
  }
});

const updateContractSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  startBlock: z.number().int().min(0).optional(),
});

// Helper to serialize BigInt fields
const serializeContract = (contract: any) => ({
  ...contract,
  startBlock: contract.startBlock?.toString() || '0',
  indexStates: contract.indexStates?.map((state: any) => ({
    ...state,
    lastIndexedBlock: state.lastIndexedBlock?.toString() || '0',
    lastFinalizedBlock: state.lastFinalizedBlock?.toString() || null,
  })),
});

// GET /api/admin/contracts - List all contracts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId, chainId } = req.query;
    
    const where: any = {};
    if (projectId) where.projectId = projectId as string;
    if (chainId) where.chainId = parseInt(chainId as string, 10);

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true },
        },
        chain: {
          select: { id: true, name: true, chainId: true },
        },
        eventSubscriptions: {
          select: {
            id: true,
            eventName: true,
            eventSignature: true,
            isActive: true,
          },
        },
        indexStates: {
          select: {
            lastIndexedBlock: true,
            lastFinalizedBlock: true,
          },
        },
        _count: {
          select: { eventSubscriptions: true },
        },
      },
    });

    res.json({
      success: true,
      data: contracts.map(serializeContract),
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contracts',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/admin/contracts/:id - Get contract by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          select: { id: true, name: true },
        },
        chain: {
          select: { id: true, name: true, chainId: true },
        },
        eventSubscriptions: true,
        indexStates: true,
      },
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
    }

    res.json({
      success: true,
      data: serializeContract(contract),
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contract',
    });
  }
});

// POST /api/admin/contracts - Create new contract with ABI
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createContractSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { projectId, chainId, protocol, address, abi, name } = validation.data;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Verify chain exists
    const chain = await prisma.chain.findUnique({
      where: { chainId },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'Chain not found',
      });
    }

    if (chain.protocol !== protocol) {
      return res.status(400).json({
        success: false,
        error: `Chain "${chain.name}" uses protocol "${chain.protocol}" but contract protocol is "${protocol}". Create the contract on a matching chain.`,
      });
    }

    if (!chain.isActive) {
      return res.status(400).json({
        success: false,
        error: `Chain "${chain.name}" is inactive. Activate the chain before adding contracts.`,
      });
    }

    const extractedEvents = protocol === 'sui'
      ? (() => {
          const manifestCheck = validateSuiManifest(abi);
          if (!manifestCheck.valid) {
            throw new Error(`Invalid SUI manifest: ${manifestCheck.errors.join(', ')}`);
          }
          return extractDefinitionsFromSuiManifest(abi as any).map((definition) => ({
            name: definition.name,
            signature: definition.signature,
            topic0: definition.topic0,
            abiItem: definition.raw,
          }));
        })()
      : protocol === 'solana'
      ? (() => {
          const idlCheck = validateSolanaIdl(abi);
          if (!idlCheck.valid) {
            throw new Error(`Invalid Solana IDL: ${idlCheck.errors.join(', ')}`);
          }
          return extractDefinitionsFromSolanaIdl(abi).map((event) => ({
            name: event.name,
            signature: event.signature,
            topic0: event.topic0,
            abiItem: event.raw,
          }));
        })()
      : extractEventsFromAbi(abi as any[]);

    // If startBlock not provided, default to the current block on the chain
    let startBlock: number = validation.data.startBlock ?? 0;
    if (validation.data.startBlock === undefined) {
      try {
        if (protocol === 'sui') {
          startBlock = Number(await getLatestCheckpoint(chain));
        } else if (protocol === 'solana') {
          startBlock = Number(await getCurrentSolanaSlot(chain));
        } else {
          const client = await rpcManager.getClient(chainId);
          const currentBlock = await client.getBlockNumber();
          startBlock = Number(currentBlock);
        }
      } catch {
        startBlock = 0; // fallback if RPC is not available yet
      }
    }

    // Check for duplicate
    const existing = await prisma.contract.findUnique({
      where: {
        projectId_chainId_protocol_address: {
          projectId,
          chainId,
          protocol,
          address: protocol === 'evm' || protocol === 'sui' ? address.toLowerCase() : address,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Contract already exists for this project and chain',
      });
    }

    // Extract events from ABI / IDL
    const events = extractedEvents;

    if (events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No events found in the provided ABI',
      });
    }

    // Determine which events are active (selected by user)
    const selectedSet = validation.data.selectedEvents
      ? new Set(validation.data.selectedEvents)
      : null; // null = all active (backwards-compatible)

    const activeCount = selectedSet
      ? events.filter((e) => selectedSet.has(e.name)).length
      : events.length;

    if (activeCount === 0 && selectedSet) {
      return res.status(400).json({
        success: false,
        error: 'At least one event must be selected',
      });
    }

    // Create contract and event subscriptions in transaction
    const contract = await prisma.$transaction(async (tx) => {
      const newContract = await tx.contract.create({
        data: {
          projectId,
          chainId,
          protocol,
          address: protocol === 'evm' || protocol === 'sui' ? address.toLowerCase() : address,
          abi,
          startBlock: BigInt(startBlock),
          name,
        },
      });

      // Create event subscriptions — only selected ones are active
      await tx.eventSubscription.createMany({
        data: events.map((event) => ({
          contractId: newContract.id,
          eventName: event.name,
          eventSignature: event.signature,
          topic0: event.topic0,
          abiItem: event.abiItem,
          isActive: selectedSet ? selectedSet.has(event.name) : true,
        })),
      });

      // Create initial index state
      await tx.indexState.create({
        data: {
          chainId,
          contractId: newContract.id,
          lastIndexedBlock: BigInt(startBlock),
        },
      });

      return tx.contract.findUnique({
        where: { id: newContract.id },
        include: {
          eventSubscriptions: true,
          indexStates: true,
        },
      });
    });

    // Bust the indexer contract cache so it picks up the new contract
    invalidateContractIndexerCache(protocol, chainId);
    await ensureChainIndexersRunning(chain.protocol, chainId, chain.isActive);

    res.status(201).json({
      success: true,
      data: serializeContract(contract),
      message: `Contract created with ${activeCount} active / ${events.length} total event subscription(s)`,
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create contract',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /api/admin/contracts/:id - Update contract
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const validation = updateContractSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
    }

    const updateData: any = { ...validation.data };
    if (validation.data.startBlock !== undefined) {
      updateData.startBlock = BigInt(validation.data.startBlock);
    }

    // Use transaction to update both contract and index state
    const updated = await prisma.$transaction(async (tx) => {
      const updatedContract = await tx.contract.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          eventSubscriptions: true,
        },
      });

      // If startBlock was updated, also reset the index state
      if (validation.data.startBlock !== undefined) {
        await tx.indexState.updateMany({
          where: { contractId: req.params.id },
          data: {
            lastIndexedBlock: BigInt(validation.data.startBlock),
          },
        });
      }

      return updatedContract;
    });

    // Bust the indexer contract cache so it picks up the changes
    invalidateContractIndexerCache(contract.protocol, contract.chainId);

    res.json({
      success: true,
      data: serializeContract(updated),
      message: 'Contract updated successfully',
    });
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contract',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// DELETE /api/admin/contracts/:id - Delete contract
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
    }

    await prisma.contract.delete({
      where: { id: req.params.id },
    });

    // Bust the indexer contract cache
    invalidateContractIndexerCache(contract.protocol, contract.chainId);

    res.json({
      success: true,
      message: 'Contract deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contract',
    });
  }
});

// PUT /api/admin/contracts/:id/events/:eventId - Update event subscription
router.put('/:id/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { isActive, filterConditions } = req.body;

    const eventSub = await prisma.eventSubscription.findFirst({
      where: {
        id: req.params.eventId,
        contractId: req.params.id,
      },
    });

    if (!eventSub) {
      return res.status(404).json({
        success: false,
        error: 'Event subscription not found',
      });
    }

    // Build update payload — only include fields that are actually provided
    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (filterConditions !== undefined) {
      // null clears the filter, object sets it
      updateData.filterConditions = filterConditions;
    }

    const updated = await prisma.eventSubscription.update({
      where: { id: req.params.eventId },
      data: updateData,
    });

    // Bust the indexer contract cache so it sees the subscription change
    const parentContract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      select: { chainId: true, protocol: true },
    });
    if (parentContract) {
      invalidateContractIndexerCache(parentContract.protocol, parentContract.chainId);
    }

    res.json({
      success: true,
      data: updated,
      message: filterConditions !== undefined
        ? `Filter ${filterConditions ? 'updated' : 'cleared'} for ${updated.eventName}`
        : `Event ${updated.eventName} ${isActive ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error('Error updating event subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update event subscription',
    });
  }
});

// POST /api/admin/contracts/:id/add-events - Add events from extra ABI or Solana IDL
router.post('/:id/add-events', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      abi: z.union([
        z.array(z.any()).min(1, 'ABI must contain at least one item'),
        z.object({}).passthrough(),
      ]),
      selectedEvents: z.array(z.string()).min(1, 'At least one event must be selected'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { abi: extraAbiRaw, selectedEvents } = validation.data as { abi: any; selectedEvents: string[] };
    const extraAbi = extraAbiRaw as any;

    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { eventSubscriptions: true },
    });

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    const protocol = contract.protocol || 'evm';
    const newEvents = protocol === 'sui'
      ? extractDefinitionsFromSuiManifest(extraAbi).map((definition) => ({
          name: definition.name,
          signature: definition.signature,
          topic0: definition.topic0,
          abiItem: definition.raw,
        }))
      : protocol === 'solana'
      ? extractDefinitionsFromSolanaIdl(extraAbi)
          .filter((definition) => definition.kind === 'event')
          .map((definition) => ({
            name: definition.name,
            signature: definition.signature,
            topic0: definition.topic0,
            abiItem: definition.raw,
          }))
      : extractEventsFromAbi(extraAbi);
    if (newEvents.length === 0) {
      return res.status(400).json({ success: false, error: 'No events found in the provided ABI/IDL' });
    }

    // Filter to only selected events, skip already subscribed
    const existingNames = new Set(contract.eventSubscriptions.map((s) => s.eventName));
    const selectedSet = new Set(selectedEvents);
    const toCreate = newEvents.filter(
      (e) => selectedSet.has(e.name) && !existingNames.has(e.name)
    );

    if (toCreate.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'All selected events are already subscribed or not found in ABI',
      });
    }

    // Merge new ABI/IDL items into existing contract payload
    const existingAbi = contract.abi as any;
    const mergedAbi = protocol === 'sui'
      ? {
          ...(existingAbi && typeof existingAbi === 'object' ? existingAbi : { packageId: contract.address, modules: {}, source: 'manual' }),
          ...(extraAbi && typeof extraAbi === 'object' ? extraAbi : {}),
        }
      : protocol === 'solana'
      ? {
          ...(existingAbi && typeof existingAbi === 'object' ? existingAbi : {}),
          events: [
            ...((existingAbi && typeof existingAbi === 'object' && Array.isArray(existingAbi.events)) ? existingAbi.events : []),
            ...((extraAbi && typeof extraAbi === 'object' && Array.isArray(extraAbi.events))
              ? extraAbi.events.filter((item: any) => item?.name)
              : []),
          ],
          instructions: [
            ...((existingAbi && typeof existingAbi === 'object' && Array.isArray(existingAbi.instructions)) ? existingAbi.instructions : []),
            ...((extraAbi && typeof extraAbi === 'object' && Array.isArray(extraAbi.instructions))
              ? extraAbi.instructions.filter((item: any) => item?.name)
              : []),
          ],
        }
      : [
          ...(Array.isArray(existingAbi) ? existingAbi : []),
          ...((Array.isArray(extraAbi) ? extraAbi : []).filter(
            (item: any) => !new Set((Array.isArray(existingAbi) ? existingAbi : []).map((entry: any) => `${entry.type}:${entry.name || ''}`)).has(`${item.type}:${item.name || ''}`)
          )),
        ];

    // Create subscriptions and update ABI in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update contract ABI with merged version
      await tx.contract.update({
        where: { id: contract.id },
        data: { abi: mergedAbi },
      });

      // Create new event subscriptions
      await tx.eventSubscription.createMany({
        data: toCreate.map((event) => ({
          contractId: contract.id,
          eventName: event.name,
          eventSignature: event.signature,
          topic0: event.topic0,
          abiItem: event.abiItem,
          isActive: true,
        })),
      });

      return toCreate;
    });

    invalidateContractIndexerCache(protocol, contract.chainId);

    res.status(201).json({
      success: true,
      data: { added: result.map((e) => e.name), count: result.length },
      message: `Added ${result.length} event subscription(s)`,
    });
  } catch (error) {
    console.error('Error adding events:', error);
    res.status(500).json({ success: false, error: 'Failed to add events' });
  }
});

// POST /api/admin/contracts/:id/events - Subscribe to an event from the contract ABI
router.post('/:id/events', async (req: Request, res: Response) => {
  try {
    const { eventName } = req.body;
    if (!eventName) {
      return res.status(400).json({ success: false, error: 'eventName is required' });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { eventSubscriptions: true },
    });

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    // Check if already subscribed
    const existing = contract.eventSubscriptions.find((s) => s.eventName === eventName);
    if (existing) {
      return res.status(409).json({ success: false, error: `Already subscribed to ${eventName}` });
    }

    // Find the event in the ABI
    const events = extractEventsForProtocol(contract.protocol || 'evm', contract.abi);
    const event = events.find((e) => e.name === eventName);
    if (!event) {
      return res.status(400).json({ success: false, error: `Event ${eventName} not found in contract ABI/manifest` });
    }

    const sub = await prisma.eventSubscription.create({
      data: {
        contractId: contract.id,
        eventName: event.name,
        eventSignature: event.signature,
        topic0: event.topic0,
        abiItem: event.abiItem,
        isActive: true,
      },
    });

    invalidateContractIndexerCache(contract.protocol, contract.chainId);

    res.status(201).json({
      success: true,
      data: sub,
      message: `Subscribed to ${eventName}`,
    });
  } catch (error) {
    console.error('Error subscribing to event:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe to event' });
  }
});

// DELETE /api/admin/contracts/:id/events/:eventId - Delete event subscription
router.delete('/:id/events/:eventId', async (req: Request, res: Response) => {
  try {
    const eventSub = await prisma.eventSubscription.findFirst({
      where: {
        id: req.params.eventId,
        contractId: req.params.id,
      },
    });

    if (!eventSub) {
      return res.status(404).json({
        success: false,
        error: 'Event subscription not found',
      });
    }

    await prisma.eventSubscription.delete({
      where: { id: req.params.eventId },
    });

    // Bust the indexer contract cache so it stops watching this event
    const parentContract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      select: { chainId: true, protocol: true },
    });
    if (parentContract) invalidateContractIndexerCache(parentContract.protocol, parentContract.chainId);

    res.json({
      success: true,
      message: `Event subscription ${eventSub.eventName} deleted`,
    });
  } catch (error) {
    console.error('Error deleting event subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete event subscription',
    });
  }
});

// POST /api/admin/contracts/:id/backfill - Trigger backfill for contract
router.post('/:id/backfill', async (req: Request, res: Response) => {
  try {
    const { fromBlock, toBlock } = req.body;

    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { indexStates: true },
    });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
    }

    const from = fromBlock ?? Number(contract.startBlock);

    // Reset the index state to the requested fromBlock so the chain
    // loop will re-fetch logs from there on the next iteration.
    if (contract.indexStates[0]) {
      await prisma.indexState.update({
        where: { id: contract.indexStates[0].id },
        data: { lastIndexedBlock: BigInt(from) },
      });
    }

    // Bust the indexer contract cache so it picks up the reset
    invalidateContractIndexerCache(contract.protocol, contract.chainId);

    const label = contract.protocol === 'sui' ? 'checkpoint' : contract.protocol === 'solana' ? 'slot' : 'block';
    res.json({
      success: true,
      message: `Backfill triggered — Noderails Indexer will re-process from ${label} ${from}`,
    });
  } catch (error) {
    console.error('Error triggering backfill:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger backfill',
    });
  }
});

// POST /api/admin/contracts/fetch-manifest - Fetch SUI package manifest from chain
router.post('/fetch-manifest', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      chainId: z.number().int().positive(),
      packageId: z.string().min(1),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { chainId, packageId } = validation.data;
    const chain = await prisma.chain.findUnique({ where: { chainId } });
    if (!chain) {
      return res.status(404).json({ success: false, error: `Chain ${chainId} not found` });
    }
    if (chain.protocol !== 'sui') {
      return res.status(400).json({ success: false, error: 'Manifest fetching is only available for SUI chains' });
    }

    const result = await fetchManifestByChainAndPackage(chainId, packageId);
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

// POST /api/admin/contracts/fetch-idl - Fetch Solana program IDL from on-chain
router.post('/fetch-idl', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      chainId: z.number().int().positive(),
      programId: z.string().min(1),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { chainId, programId } = validation.data;

    // Get the chain to retrieve its RPC URL
    const chain = await prisma.chain.findUnique({
      where: { chainId },
    });

    if (!chain) {
      return res.status(404).json({
        success: false,
        error: `Chain ${chainId} not found`,
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
