import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/, '用户名只能包含字母、数字、点、下划线和连字符');

export const displayNameSchema = z.string().trim().min(1).max(50);
export const passwordSchema = z.string().min(8).max(64);

export const loginBodySchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(64),
}).strict();

export const kioskBodySchema = z.object({
  key: z.string().trim().min(8).max(128),
}).strict();
