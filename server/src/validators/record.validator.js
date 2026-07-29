import { z } from 'zod';
import { idSchema } from './common.validator.js';

function isRealCalendarDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
  );
}

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须为 YYYY-MM-DD')
  .refine(isRealCalendarDate, 'date 不是有效日期');

export const recordQuerySchema = z.object({
  date: dateSchema.optional(),
  tableId: idSchema.optional(),
}).strict();

export const exportRecordQuerySchema = z.object({
  date: dateSchema.optional(),
}).strict();

export const auditLogQuerySchema = z.object({
  date: dateSchema.optional(),
  action: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
}).strict();
