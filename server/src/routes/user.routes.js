import { Router } from 'express';
import { createUserController, listUsersController, updateUserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/requireRole.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { emptyQuerySchema } from '../validators/common.validator.js';
import { createUserBodySchema, updateUserBodySchema, userParamsSchema } from '../validators/user.validator.js';

export const userRouter = Router();
userRouter.use(asyncHandler(authenticate), requireRole('system_admin'));
userRouter.get('/', validate({ query: emptyQuerySchema }), asyncHandler(listUsersController));
userRouter.post('/', validate({
  body: createUserBodySchema,
  query: emptyQuerySchema,
}), asyncHandler(createUserController));
userRouter.patch('/:userId', validate({
  params: userParamsSchema,
  body: updateUserBodySchema,
  query: emptyQuerySchema,
}), asyncHandler(updateUserController));
