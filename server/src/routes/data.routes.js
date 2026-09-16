import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { getDataOverview } from '../services/data.service.js';

export const dataRouter = Router();
dataRouter.use(authenticate, requireRole('system_admin'));
dataRouter.get('/', validate({ query: z.object({
  period: z.enum(['today', 'yesterday', '7d', '30d', 'date']).default('today'),
  date: z.iso.date().optional(),
}).strict().refine((query) => query.period === 'date' ? Boolean(query.date) : !query.date, {
  message: '指定日期时请选择日期模式并提供有效日期', path: ['date'],
}) }), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return ok(res, await getDataOverview(req.validated.query.period, req.validated.query.date));
}));
