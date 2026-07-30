import { Router } from 'express';
import {
  createTableBatchController,
  createTableController,
  deleteTableController,
  deleteTablePermanentController,
  deleteTablesBatchController,
  listTablesController,
  updateTableController,
} from '../controllers/table.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyQuerySchema,
  storeParamsSchema,
  storeTableParamsSchema,
} from '../validators/common.validator.js';
import {
  createTableBatchBodySchema,
  createTableBodySchema,
  deleteTableBatchBodySchema,
  updateTableBodySchema,
} from '../validators/table.validator.js';

export const tableRouter = Router({ mergeParams: true });
const tableManagerRoles = requireRole('system_admin', 'store_admin');

tableRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(listTablesController),
);
tableRouter.post(
  '/',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeParamsSchema,
    body: createTableBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(createTableController),
);
tableRouter.post(
  '/batch',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeParamsSchema,
    body: createTableBatchBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(createTableBatchController),
);
tableRouter.post(
  '/batch-delete',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeParamsSchema,
    body: deleteTableBatchBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteTablesBatchController),
);
tableRouter.delete(
  '/:tableId/permanent',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteTablePermanentController),
);
tableRouter.patch(
  '/:tableId',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeTableParamsSchema,
    body: updateTableBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(updateTableController),
);
tableRouter.delete(
  '/:tableId',
  asyncHandler(authenticate),
  tableManagerRoles,
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteTableController),
);
