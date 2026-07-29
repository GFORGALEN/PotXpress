import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { emptyQuerySchema } from '../validators/common.validator.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  validate({ query: emptyQuerySchema }),
  healthController,
);
