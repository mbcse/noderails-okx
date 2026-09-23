import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { adminAuth } from '../middleware/auth.js';
import { nativeIndexerService } from '../services/native-indexer.js';
import { suiNativeIndexerService } from '../services/sui-native-indexer.js';
import { isSuiAddress, normalizeSuiAddress } from '../types/sui.js';

const router = Router();
router.use(adminAuth);

function invalidateNativeWatchers(chainId: number | null): void {
  if (chainId === null) {
    nativeIndexerService.invalidateCacheAll();
    suiNativeIndexerService.invalidateCacheAll();
    return;
  }
  nativeIndexerService.invalidateCache(chainId);
  suiNativeIndexerService.invalidateCache(chainId);
}

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

async function validateWatchedAddress(address: string, chainId: number | null): Promise<string | null> {
  if (chainId === null) {
    if (EVM_ADDRESS_REGEX.test(address) || isSuiAddress(address)) return null;
    return 'Address must be a valid EVM (0x + 40 hex) or SUI (0x + 64 hex) address';
  }
  const chain = await prisma.chain.findUnique({ where: { chainId } });
  if (!chain) return 'Chain not found';
  if (chain.protocol === 'sui') {
    if (!isSuiAddress(address)) return 'Invalid SUI address (expected 0x + 64 hex)';
    return null;
  }
  if (!EVM_ADDRESS_REGEX.test(address)) return 'Invalid Ethereum address';
  return null;
}

function normalizeWatchedAddress(address: string, protocol?: string): string {
  if (protocol === 'sui' || isSuiAddress(address)) return normalizeSuiAddress(address);
  return address.toLowerCase();
}

const directionSchema = z.enum(['in', 'out', 'both']).optional().default('both');

const chainIdSchema = z.number().int().positive().nullable().optional(); // null = all chains

const createSchema = z.object({
  projectId: z.string().uuid(),
  chainId: chainIdSchema,
  address: z.string().min(1),
  direction: directionSchema,
  label: z.string().max(200).optional(),
});

const bulkCreateSchema = z.object({
  projectId: z.string().uuid(),
  chainId: chainIdSchema,
  addresses: z.array(z.string().min(1)).min(1).max(100),
  direction: directionSchema,
  label: z.string().max(200).optional(),
});

// GET /api/admin/watched-addresses - List (optional ?projectId= or ?chainId= or ?chainId=all for null)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId, chainId } = req.query;
    const where: any = {};
    if (projectId) where.projectId = projectId as string;
    if (chainId !== undefined && chainId !== '') {
      if (String(chainId).toLowerCase() === 'all') where.chainId = null;
      else where.chainId = parseInt(chainId as string, 10);
    }
    const list = await prisma.watchedAddress.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching watched addresses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch watched addresses' });
  }
});

// GET /api/admin/watched-addresses/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const row = await prisma.watchedAddress.findUnique({
      where: { id: req.params.id },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('Error fetching watched address:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch watched address' });
  }
});

// POST /api/admin/watched-addresses
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: validation.error.errors });
    }
    const { projectId, chainId, address, direction, label } = validation.data;
    const chainIdVal = chainId ?? null;
    const addressError = await validateWatchedAddress(address, chainIdVal);
    if (addressError) return res.status(400).json({ success: false, error: addressError });

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (chainIdVal !== null) {
      const chain = await prisma.chain.findUnique({ where: { chainId: chainIdVal } });
      if (!chain) return res.status(400).json({ success: false, error: 'Chain not found' });
    }
    const created = await prisma.watchedAddress.create({
      data: {
        projectId,
        chainId: chainIdVal,
        address: normalizeWatchedAddress(address),
        direction: direction ?? 'both',
        label: label ?? null,
      },
    });
    if (chainIdVal === null) invalidateNativeWatchers(null);
    else invalidateNativeWatchers(chainIdVal);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'This address is already watched for this project and chain' });
    }
    console.error('Error creating watched address:', error);
    res.status(500).json({ success: false, error: 'Failed to create watched address' });
  }
});

const updateSchema = z.object({
  direction: directionSchema.optional(),
  label: z.string().max(200).nullable().optional(),
});

// PATCH /api/admin/watched-addresses/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const row = await prisma.watchedAddress.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: validation.error.errors });
    }
    const { direction, label } = validation.data;
    const updated = await prisma.watchedAddress.update({
      where: { id: req.params.id },
      data: {
        ...(direction !== undefined && { direction }),
        ...(label !== undefined && { label: label ?? null }),
      },
    });
    if (row.chainId === null) invalidateNativeWatchers(null);
    else invalidateNativeWatchers(row.chainId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating watched address:', error);
    res.status(500).json({ success: false, error: 'Failed to update watched address' });
  }
});

// POST /api/admin/watched-addresses/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const validation = bulkCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: validation.error.errors });
    }
    const { projectId, chainId, addresses, direction, label } = validation.data;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const chainIdVal = chainId ?? null;
    if (chainIdVal !== null) {
      const chain = await prisma.chain.findUnique({ where: { chainId: chainIdVal } });
      if (!chain) return res.status(400).json({ success: false, error: 'Chain not found' });
    }
    const unique = [...new Set(addresses)];
    const created: { id: string; address: string; chainId: number | null; direction: string; label: string | null }[] = [];
    const skipped: string[] = [];
    for (const rawAddress of unique) {
      const addressError = await validateWatchedAddress(rawAddress, chainIdVal);
      if (addressError) {
        return res.status(400).json({ success: false, error: addressError, details: rawAddress });
      }
      const address = normalizeWatchedAddress(rawAddress);
      try {
        const row = await prisma.watchedAddress.create({
          data: {
            projectId,
            chainId: chainIdVal,
            address,
            direction: direction ?? 'both',
            label: label ?? null,
          },
        });
        created.push({
          id: row.id,
          address: row.address,
          chainId: row.chainId,
          direction: row.direction,
          label: row.label,
        });
      } catch (e: any) {
        if (e?.code === 'P2002') skipped.push(address);
        else throw e;
      }
    }
    if (chainIdVal === null) invalidateNativeWatchers(null);
    else invalidateNativeWatchers(chainIdVal);
    res.status(201).json({ success: true, data: { created, skipped } });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'One or more addresses already watched' });
    }
    console.error('Error bulk creating watched addresses:', error);
    res.status(500).json({ success: false, error: 'Failed to create watched addresses' });
  }
});

// DELETE /api/admin/watched-addresses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const row = await prisma.watchedAddress.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    await prisma.watchedAddress.delete({ where: { id: req.params.id } });
    if (row.chainId === null) invalidateNativeWatchers(null);
    else invalidateNativeWatchers(row.chainId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting watched address:', error);
    res.status(500).json({ success: false, error: 'Failed to delete watched address' });
  }
});

export default router;
