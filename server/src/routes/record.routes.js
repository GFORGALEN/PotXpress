import { Router } from 'express';
import {
  exportRecordsController,
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
  storeParamsSchema,
  storeRecordParamsSchema,
} from '../validators/common.validator.js';
import {
  auditLogQuerySchema,
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
