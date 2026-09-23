import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';

const router = Router();

// GET /api/native-transfers - List native transfers (admin or project API key)
// Query: chainId, address (from or to), fromBlock, toBlock, limit, offset
router.get('/', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;
    let projectId: string | undefined;

    if (apiKey) {
      const project = await prisma.project.findUnique({
        where: { apiKey },
        select: { id: true, isActive: true },
      });
      if (!project || !project.isActive) {
        return res.status(401).json({ success: false, error: 'Invalid or inactive API key' });
      }
      projectId = project.id;
    } else if (authHeader?.startsWith('Bearer ')) {
      // Admin: optional projectId query to filter by project's watched addresses
      projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    } else {
      return res.status(401).json({
        success: false,
        error: 'Authentication required (API key or admin token)',
      });
    }

    const { chainId, address, fromBlock, toBlock, limit = '10', offset = '0' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offsetNum = parseInt(offset as string, 10);

    const baseWhere: any = {};
    if (chainId) baseWhere.chainId = parseInt(chainId as string, 10);
    if (fromBlock) baseWhere.blockNumber = { ...baseWhere.blockNumber, gte: BigInt(fromBlock as string) };
    if (toBlock) baseWhere.blockNumber = { ...baseWhere.blockNumber, lte: BigInt(toBlock as string) };
    if (address) {
      const addr = (address as string).toLowerCase();
      baseWhere.OR = [{ from: addr }, { to: addr }];
    }

    let where: any = baseWhere;
    if (projectId) {
      const watched = await prisma.watchedAddress.findMany({
        where: { projectId },
        select: { chainId: true, address: true },
      });
      if (watched.length === 0) {
        return res.json({ success: true, data: [], total: 0, limit: limitNum, offset: offsetNum });
      }
      const projectOr = watched.flatMap((w) =>
        w.chainId != null
          ? [
              { chainId: w.chainId, from: w.address },
              { chainId: w.chainId, to: w.address },
            ]
          : [{ from: w.address }, { to: w.address }]
      );
      where = { AND: [baseWhere, { OR: projectOr }] };
    }

    const [rows, total] = await Promise.all([
      prisma.nativeTransfer.findMany({
        where,
        orderBy: { blockNumber: 'desc' },
        take: limitNum,
        skip: offsetNum,
      }),
      prisma.nativeTransfer.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      chainId: r.chainId,
      blockNumber: r.blockNumber.toString(),
      blockHash: r.blockHash,
      transactionHash: r.transactionHash,
      from: r.from,
      to: r.to,
      value: r.value,
      timestamp: r.timestamp,
      createdAt: r.createdAt,
    }));

    res.json({ success: true, data, total, limit: limitNum, offset: offsetNum });
  } catch (error) {
    console.error('Error fetching native transfers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch native transfers' });
  }
});

export default router;
