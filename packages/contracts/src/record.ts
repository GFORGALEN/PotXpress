import { z } from 'zod';
import {
  dateSchema,
  identifierSchema,
  isoDateSchema,
} from './base.js';
import { timerAdjustmentSchema } from './timer.js';

export const recordSchema = z.object({
  id: identifierSchema,
  timerId: identifierSchema,
  storeId: identifierSchema,
  tableId: identifierSchema,
  targetType: z.enum(['table', 'group']),
  groupId: identifierSchema.nullable(),
  memberTableIds: z.array(identifierSchema).min(1).max(20),
  tableNameSnapshot: z.string().min(1).max(50),
  tableNumberSnapshot: z.number().int().min(1).max(9999),
  startTime: isoDateSchema,
  plannedEndTime: isoDateSchema,
  effectiveEndTimeAtReset: isoDateSchema,
  actualEndTime: isoDateSchema,
  plannedDurationSeconds: z.number().int().min(60).max(28800),
  actualDurationSeconds: z.number().int().nonnegative(),
  totalPausedSeconds: z.number().int().nonnegative(),
  adjustments: z.array(timerAdjustmentSchema),
  startedBy: identifierSchema,
  startedByNameSnapshot: z.string().min(1).max(50),
  resetBy: identifierSchema,
  resetByNameSnapshot: z.string().min(1).max(50),
  finalStatus: z.literal('reset'),
  createdAt: isoDateSchema,
}).passthrough();

export const recordListSchema = z.object({
  date: dateSchema,
  records: z.array(recordSchema),
}).strict();

export const timerResetResultSchema = z.object({
  record: recordSchema,
  tableStatus: z.literal('idle'),
}).strict();

export type Record = z.infer<typeof recordSchema>;
export type RecordList = z.infer<typeof recordListSchema>;
export type TimerResetResult = z.infer<typeof timerResetResultSchema>;
