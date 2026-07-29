import { Router } from 'express';
import {
  acknowledgeTimerAlertController,
  adjustTimerController,
  listTimersController,
  pauseTimerController,
  resetTimerController,
  resumeTimerController,
  startTimerController,
} from '../controllers/timer.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { storeAccess } from '../middleware/storeAccess.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  storeParamsSchema,
  storeTableParamsSchema,
} from '../validators/common.validator.js';
import {
  adjustTimerBodySchema,
  startTimerBodySchema,
} from '../validators/timer.validator.js';

export const timerListRouter = Router({ mergeParams: true });
export const tableTimerRouter = Router({ mergeParams: true });

timerListRouter.get(
  '/',
  asyncHandler(authenticate),
  validate({
    params: storeParamsSchema,
    query: emptyQuerySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(listTimersController),
);

tableTimerRouter.post(
  '/start',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: startTimerBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(startTimerController),
);
tableTimerRouter.post(
  '/pause',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: emptyBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(pauseTimerController),
);
tableTimerRouter.post(
  '/resume',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: emptyBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(resumeTimerController),
);
tableTimerRouter.post(
  '/adjust',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: adjustTimerBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(adjustTimerController),
);
tableTimerRouter.post(
  '/reset',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: emptyBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(resetTimerController),
);
tableTimerRouter.post(
  '/acknowledge-alert',
  asyncHandler(authenticate),
  validate({
    params: storeTableParamsSchema,
    query: emptyQuerySchema,
    body: emptyBodySchema,
  }),
  asyncHandler(storeAccess),
  asyncHandler(acknowledgeTimerAlertController),
);
