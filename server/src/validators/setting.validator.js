import { z } from 'zod';
import { hasAtLeastOneField } from './common.validator.js';

export const updateSettingBodySchema = z.object({
  defaultDurationMinutes: z.number().int().min(5).max(480).optional(),
  warningThresholdMinutes: z.number().int().min(1).max(60).optional(),
  soundEnabled: z.boolean().optional(),
}).strict().refine(hasAtLeastOneField, {
  message: '至少提供一个要更新的字段',
});
