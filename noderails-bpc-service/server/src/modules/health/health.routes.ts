import express, { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { success } from '../../lib/response.js';
import { getHealthReport } from './health.service.js';

const router: express.Router = Router();

router.get(
  '/details',
  asyncHandler(async (_req, res) => {
    success(res, await getHealthReport());
  }),
);

export default router;
