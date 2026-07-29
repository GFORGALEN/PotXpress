import { Router } from 'express';
import {
  loginController,
  logoutController,
  meController,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimit } from '../middleware/loginRateLimit.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { loginBodySchema } from '../validators/auth.validator.js';
import { emptyQuerySchema } from '../validators/common.validator.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  loginRateLimit,
  validate({ body: loginBodySchema, query: emptyQuerySchema }),
  asyncHandler(loginController),
);
authRouter.get(
  '/me',
  asyncHandler(authenticate),
  validate({ query: emptyQuerySchema }),
  asyncHandler(meController),
);
authRouter.post(
  '/logout',
  asyncHandler(authenticate),
  validate({ query: emptyQuerySchema }),
  asyncHandler(logoutController),
);
