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

export const authRouter = Router();

authRouter.post(
  '/login',
  loginRateLimit,
  validate({ body: loginBodySchema }),
  asyncHandler(loginController),
);
authRouter.get('/me', asyncHandler(authenticate), asyncHandler(meController));
authRouter.post(
  '/logout',
  asyncHandler(authenticate),
  asyncHandler(logoutController),
);
