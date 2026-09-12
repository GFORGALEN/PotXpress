import { z } from 'zod';
import {
  dateSchema,
  identifierSchema,
  isoDateSchema,
} from './base.js';

export const timerInterventionActionSchema = z.enum([
  'overdue_reminder',
  'auto_reset',
  'admin_bulk_reset',
]);

export const timerInterventionRecordSchema = z.object({
  id: identifierSchema,
  timerId: identifierSchema,
  storeId: identifierSchema,
  tableId: identifierSchema,
  targetType: z.enum(['table', 'group']),
  groupId: identifierSchema.nullable(),
  memberTableIds: z.array(identifierSchema).min(1).max(20),
  tableNameSnapshot: z.string().min(1).max(100),
  tableNumberSnapshot: z.number().int().min(1).max(9999),
  action: timerInterventionActionSchema,
  reminderNumber: z.number().int().min(1).max(2).nullable(),
  thresholdSeconds: z.number().int().positive().nullable(),
  overtimeSeconds: z.number().int().nonnegative(),
  timerRecordId: identifierSchema.nullable(),
  actorUserId: identifierSchema.nullable(),
  actorNameSnapshot: z.string().min(1).max(50).nullable(),
  createdAt: isoDateSchema,
}).strict();

export const timerInterventionListSchema = z.object({
  date: dateSchema,
  records: z.array(timerInterventionRecordSchema),
}).strict();

export type TimerInterventionAction = z.infer<
  typeof timerInterventionActionSchema
>;
export type TimerInterventionRecord = z.infer<
  typeof timerInterventionRecordSchema
>;
export type TimerInterventionList = z.infer<
  typeof timerInterventionListSchema
>;
