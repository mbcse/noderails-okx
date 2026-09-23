import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// Apply admin auth to all routes
router.use(adminAuth);

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

// Generate secure API key
function generateApiKey(): string {
  const prefix = 'idx';
  const key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '').substring(0, 16);
  return `${prefix}_${key}`;
}

// GET /api/admin/projects - List all projects
router.get('/', async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            contracts: true,
            webhooks: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
    });
  }
});

// GET /api/admin/projects/:id - Get project by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        contracts: {
          select: {
            id: true,
            name: true,
            address: true,
            chainId: true,
            isActive: true,
          },
        },
        webhooks: {
          select: {
            id: true,
            name: true,
            url: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            contracts: true,
            webhooks: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project',
    });
  }
});

// POST /api/admin/projects - Create new project
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createProjectSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { name } = validation.data;
    const apiKey = generateApiKey();

    const project = await prisma.project.create({
      data: {
        name,
        apiKey,
      },
    });

    res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully. Save the API key - it won\'t be shown again!',
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project',
    });
  }
});

// PUT /api/admin/projects/:id - Update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const validation = updateProjectSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: validation.data,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Project updated successfully',
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update project',
    });
  }
});

// DELETE /api/admin/projects/:id - Delete project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    await prisma.project.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete project',
    });
  }
});

// POST /api/admin/projects/:id/regenerate-key - Regenerate API key
router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const newApiKey = generateApiKey();

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { apiKey: newApiKey },
    });

    res.json({
      success: true,
      data: { apiKey: updated.apiKey },
      message: 'API key regenerated. Save the new key - it won\'t be shown again!',
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate API key',
    });
  }
});

export default router;
