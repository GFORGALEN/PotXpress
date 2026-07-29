import { Router } from 'express';
import {
  getSettingsController,
  updateSettingsController,
} from '../controllers/setting.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyQuerySchema,
  storeParamsSchema,
} from '../validators/common.validator.js';
import { updateSettingBodySchema } from '../validators/setting.validator.js';

export const settingRouter = Router({ mergeParams: true });

settingRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(getSettingsController),
);
settingRouter.patch(
  '/',
  asyncHandler(authenticate),
  requireRole('system_admin', 'store_admin'),
  validate({
    params: storeParamsSchema,
    body: updateSettingBodySchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(updateSettingsController),
);
