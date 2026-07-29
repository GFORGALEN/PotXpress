import { Router } from 'express';
import {
  createStoreController,
  getStoreController,
  listStoresController,
  updateStoreController,
} from '../controllers/store.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyQuerySchema,
  storeParamsSchema,
} from '../validators/common.validator.js';
import {
  createStoreBodySchema,
  updateStoreBodySchema,
} from '../validators/store.validator.js';

export const storeRouter = Router();

storeRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({ query: emptyQuerySchema }),
  asyncHandler(listStoresController),
);
storeRouter.post(
  '/',
  asyncHandler(authenticate),
  requireRole('system_admin'),
  validate({
    body: createStoreBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(createStoreController),
);
storeRouter.get(
  '/:storeId',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(getStoreController),
);
storeRouter.patch(
  '/:storeId',
  asyncHandler(authenticate),
  requireRole('system_admin'),
  validate({
    params: storeParamsSchema,
    body: updateStoreBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(updateStoreController),
);
