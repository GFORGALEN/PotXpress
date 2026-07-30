import { Router } from 'express';
import {
  exportRecordsController,
  deleteAuditLogController,
  deleteAuditLogsController,
  deleteRecordController,
  deleteRecordsController,
  getRecordController,
  listAuditLogsController,
  listRecordsController,
} from '../controllers/record.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyQuerySchema,
  idSchema,
  storeParamsSchema,
  storeRecordParamsSchema,
} from '../validators/common.validator.js';
import {
  auditLogQuerySchema,
  batchDeleteBodySchema,
  exportRecordQuerySchema,
  recordQuerySchema,
} from '../validators/record.validator.js';

export const recordRouter = Router({ mergeParams: true });
export const auditLogRouter = Router({ mergeParams: true });

recordRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: recordQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(listRecordsController),
);
recordRouter.get(
  '/export',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: exportRecordQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(exportRecordsController),
);
recordRouter.post(
  '/batch-delete',
  asyncHandler(authenticate),
  requireRole('system_admin'),
  validate({
    params: storeParamsSchema,
    body: batchDeleteBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteRecordsController),
);
recordRouter.delete(
  '/:recordId',
  asyncHandler(authenticate),
  requireRole('system_admin'),
  validate({
    params: storeRecordParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteRecordController),
);
recordRouter.get(
  '/:recordId',
  asyncHandler(authenticate),
  validate({
    params: storeRecordParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(getRecordController),
);

auditLogRouter.get(
  '/',
  asyncHandler(authenticate),
  requireRole('system_admin', 'store_admin'),
  validate({
    params: storeParamsSchema,
    query: auditLogQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(listAuditLogsController),
);
auditLogRouter.post(
  '/batch-delete',
  asyncHandler(authenticate),
  requireRole('system_admin', 'store_admin'),
  validate({
    params: storeParamsSchema,
    body: batchDeleteBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteAuditLogsController),
);
auditLogRouter.delete(
  '/:logId',
  asyncHandler(authenticate),
  requireRole('system_admin', 'store_admin'),
  validate({
    params: storeParamsSchema.extend({ logId: idSchema }),
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(deleteAuditLogController),
);
