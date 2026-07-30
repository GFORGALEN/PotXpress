import { z } from 'zod';
import {
  identifierSchema,
  isoDateSchema,
  userRoleSchema,
} from './base.js';

export const userSchema = z.object({
  id: identifierSchema,
  username: z.string().min(1).max(32),
  normalizedUsername: z.string().min(1).max(32),
  displayName: z.string().min(1).max(50),
  passwordHash: z.string().min(20),
  role: userRoleSchema,
  storeId: identifierSchema.nullable(),
  enabled: z.boolean(),
  tokenVersion: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).passthrough();

export const storeSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1).max(100),
  code: z.string().min(2).max(20),
  normalizedCode: z.string().min(2).max(20),
  address: z.string().max(200).nullable(),
  timezone: z.string().min(1).max(100),
  enabled: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).passthrough();

export const settingsSchema = z.object({
  storeId: identifierSchema,
  defaultDurationMinutes: z.number().int().min(5).max(480),
  warningThresholdMinutes: z.number().int().min(1).max(60),
  timezone: z.string().min(1).max(100),
  soundEnabled: z.boolean(),
  updatedAt: isoDateSchema,
}).passthrough();

export const auditLogSchema = z.object({
  id: identifierSchema,
  timestamp: isoDateSchema,
  userId: identifierSchema.nullable(),
  userNameSnapshot: z.string().min(1).max(50).nullable(),
  storeId: identifierSchema.nullable(),
  action: z.string().min(1).max(100),
  targetType: z.string().min(1).max(100),
  targetId: identifierSchema.nullable(),
  dataBefore: z.unknown().optional(),
  dataAfter: z.unknown().optional(),
}).passthrough();

export const idempotencyKeySchema = z.object({
  id: identifierSchema,
  userId: identifierSchema,
  storeId: identifierSchema.nullable(),
  key: z.string().min(8).max(128),
  operation: z.string().min(1).max(100),
  requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  response: z.unknown(),
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema,
}).strict();

export const metadataSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
}).strict();

export type User = z.infer<typeof userSchema>;
export type Store = z.infer<typeof storeSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
