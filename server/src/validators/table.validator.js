import { z } from 'zod';
import { hasAtLeastOneField } from './common.validator.js';

const tableNameSchema = z.string().trim().min(1).max(50);
const tableNumberSchema = z.number().int().min(1).max(9999);

export const createTableBodySchema = z.object({
  name: tableNameSchema,
  number: tableNumberSchema,
}).strict();

export const createTableBatchBodySchema = z.object({
  startNumber: tableNumberSchema,
  count: z.number().int().min(1).max(50),
  namePattern: z.string().min(1).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (value.startNumber + value.count - 1 > 9999) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['count'],
      message: '批量创建后的最大桌台编号不能超过 9999',
    });
  }
});

export const updateTableBodySchema = z.object({
  name: tableNameSchema.optional(),
  number: tableNumberSchema.optional(),
  sortOrder: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
}).strict().refine(hasAtLeastOneField, {
  message: '至少提供一个要更新的字段',
});
