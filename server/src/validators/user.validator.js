import { z } from 'zod';
import { displayNameSchema, passwordSchema, usernameSchema } from './auth.validator.js';
import { hasAtLeastOneField, idSchema } from './common.validator.js';

export const userRoleSchema = z.enum(['system_admin', 'store_admin', 'store_staff']);
export const userParamsSchema = z.object({ userId: idSchema }).strict();

export const createUserBodySchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  role: userRoleSchema,
  storeId: idSchema.nullable().optional(),
}).strict();

export const updateUserBodySchema = z.object({
  displayName: displayNameSchema.optional(),
  password: passwordSchema.optional(),
  role: userRoleSchema.optional(),
  storeId: idSchema.nullable().optional(),
  enabled: z.boolean().optional(),
}).strict().refine(hasAtLeastOneField, {
  message: '至少提供一个需要更新的字段',
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(64),
  newPassword: passwordSchema,
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  message: '新密码不能与当前密码相同',
  path: ['newPassword'],
});
