import { Router } from 'express';
import {
  createTableGroupController,
  deleteTableGroupController,
  listTableGroupsController,
} from '../controllers/tableGroup.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { emptyQuerySchema, storeParamsSchema } from '../validators/common.validator.js';
import {
  createTableGroupBodySchema,
  tableGroupParamsSchema,
} from '../validators/tableGroup.validator.js';

export const tableGroupRouter = Router({ mergeParams: true });
const managers = requireRole('system_admin', 'store_admin');

tableGroupRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({ params: storeParamsSchema, query: emptyQuerySchema }),
  asyncHandler(storeAccess),
  asyncHandler(listTableGroupsController),
);
tableGroupRouter.post(
  '/',
  asyncHandler(authenticate),
  managers,
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
    body: createTableGroupBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(createTableGroupController),
);
tableGroupRouter.delete(
  '/:groupId',
  asyncHandler(authenticate),
  managers,
  validate({ params: tableGroupParamsSchema, query: emptyQuerySchema }),
  asyncHandler(storeAccess),
  asyncHandler(deleteTableGroupController),
);
