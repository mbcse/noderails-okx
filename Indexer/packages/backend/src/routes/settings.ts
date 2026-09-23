import { Router, Request, Response } from 'express';
import { adminAuth } from '../middleware/auth.js';
import { settingsService } from '../services/settings.js';

const router = Router();

router.use(adminAuth);

// GET /api/admin/settings - Get all settings grouped by category
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await settingsService.getAll();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// PUT /api/admin/settings - Bulk update settings
router.put('/', async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'settings object is required (key → value map)',
      });
    }

    // Validate all values are strings
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      updates[key] = String(value);
    }

    await settingsService.setMany(updates);

    res.json({
      success: true,
      message: `Updated ${Object.keys(updates).length} setting(s). Some changes require a restart.`,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

export default router;
