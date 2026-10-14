import { z } from 'zod';

export const startTimerBodySchema = z.object({
  durationMinutes: z.number().int().min(5).max(480).optional(),
}).strict().default({});

export const adjustTimerBodySchema = z.object({
  deltaSeconds: z.number().int().min(-28800).max(28800)
    .refine((value) => value !== 0, 'deltaSeconds 不能为 0'),
  reason: z.string().trim().max(100).optional(),
}).strict();

export const transferTimerBodySchema = z.object({
  targetTableId: z.string().min(1).max(100),
}).strict();

export const MAX_BATCH_RESET_TIMERS = 200;

export const resetBatchTimersBodySchema = z.object({
  timerIds: z.array(z.string().min(1).max(100))
    .min(1)
    .max(MAX_BATCH_RESET_TIMERS)
    .transform((ids) => [...new Set(ids)].sort()),
  // true：只结束仍已到时的计时；false：按名单结束仍在进行的计时（提前清台）。
  onlyOverdue: z.boolean().default(true),
}).strict();
