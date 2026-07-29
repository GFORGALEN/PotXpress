import { z } from 'zod';

export const startTimerBodySchema = z.object({
  durationMinutes: z.number().int().min(5).max(480).optional(),
}).strict().default({});

export const adjustTimerBodySchema = z.object({
  deltaSeconds: z.number().int().min(-28800).max(28800)
    .refine((value) => value !== 0, 'deltaSeconds 不能为 0'),
  reason: z.string().trim().max(100).optional(),
}).strict();
