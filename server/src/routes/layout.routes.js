import { Router } from 'express';
import {
  getLayoutController,
  saveLayoutController,
} from '../controllers/layout.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyQuerySchema,
  storeParamsSchema,
} from '../validators/common.validator.js';
import { saveLayoutBodySchema } from '../validators/layout.validator.js';

export const layoutRouter = Router({ mergeParams: true });

layoutRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(getLayoutController),
);
layoutRouter.put(
  '/',
  asyncHandler(authenticate),
  requireRole('system_admin', 'store_admin'),
  validate({
    params: storeParamsSchema,
    body: saveLayoutBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(saveLayoutController),
);
