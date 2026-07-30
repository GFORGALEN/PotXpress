import { z } from 'zod';

export const identifierSchema = z.string().min(1).max(100);
export const isoDateSchema = z.string().datetime({ offset: true });
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const userRoleSchema = z.enum([
  'system_admin',
  'store_admin',
  'store_staff',
]);

export type Identifier = z.infer<typeof identifierSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
