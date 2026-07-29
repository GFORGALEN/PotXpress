import { z } from 'zod';
import { hasAtLeastOneField, isValidTimezone } from './common.validator.js';

const nameSchema = z.string().trim().min(1).max(100);
const addressSchema = z.string().trim().max(200).nullable();
const timezoneSchema = z.string().trim().min(1).max(100)
  .refine(isValidTimezone, '必须是有效的 IANA 时区');

export const createStoreBodySchema = z.object({
  name: nameSchema,
  code: z.string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, '门店 code 只能包含字母、数字、下划线和连字符'),
  address: addressSchema.optional(),
  timezone: timezoneSchema.optional(),
}).strict();

export const updateStoreBodySchema = z.object({
  name: nameSchema.optional(),
  address: addressSchema.optional(),
  timezone: timezoneSchema.optional(),
  enabled: z.boolean().optional(),
}).strict().refine(hasAtLeastOneField, {
  message: '至少提供一个要更新的字段',
});
