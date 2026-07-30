import { z } from 'zod';
import { identifierSchema, isoDateSchema } from './base.js';

export const timerAdjustmentSchema = z.object({
  type: z.enum(['add', 'subtract']),
  seconds: z.number().int().positive(),
  requestedSeconds: z.number().int().positive(),
  reason: z.string().max(100).nullable().optional(),
  by: identifierSchema,
  byNameSnapshot: z.string().min(1).max(50),
  at: isoDateSchema,
}).passthrough();

export const activeTimerSchema = z.object({
  id: identifierSchema,
  storeId: identifierSchema,
  tableId: identifierSchema,
  targetType: z.enum(['table', 'group']),
  groupId: identifierSchema.nullable(),
  memberTableIds: z.array(identifierSchema).min(1).max(20),
  tableNameSnapshot: z.string().min(1).max(50),
  tableNumberSnapshot: z.number().int().min(1).max(9999),
  startTime: isoDateSchema,
  plannedDurationSeconds: z.number().int().min(60).max(28800),
  status: z.enum(['running', 'paused']),
  pauseStartedAt: isoDateSchema.nullable(),
  totalPausedSeconds: z.number().int().nonnegative(),
  adjustments: z.array(timerAdjustmentSchema),
  overtimeAcknowledged: z.boolean(),
  startedBy: identifierSchema,
  startedByNameSnapshot: z.string().min(1).max(50),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).passthrough();

export const timerStatusSchema = z.enum([
  'running',
  'paused',
  'warning',
  'overtime',
]);

export const timerSchema = activeTimerSchema
  .omit({ status: true })
  .extend({
    status: timerStatusSchema,
    remainingSeconds: z.number().int().nonnegative(),
    overtimeSeconds: z.number().int().nonnegative(),
    effectiveEndTime: isoDateSchema,
  })
  .passthrough();

export const timerListSnapshotSchema = z.object({
  serverTime: isoDateSchema,
  eventVersion: z.number().int().nonnegative(),
  timers: z.array(timerSchema),
}).strict();

export const timerActionResultSchema = z.object({
  timer: timerSchema,
}).strict();

export type TimerAdjustment = z.infer<typeof timerAdjustmentSchema>;
export type ActiveTimer = z.infer<typeof activeTimerSchema>;
export type TimerStatus = z.infer<typeof timerStatusSchema>;
export type Timer = z.infer<typeof timerSchema>;
export type TimerListSnapshot = z.infer<typeof timerListSnapshotSchema>;
export type TimerActionResult = z.infer<typeof timerActionResultSchema>;
