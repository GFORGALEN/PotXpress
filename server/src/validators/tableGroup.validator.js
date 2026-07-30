import { z } from 'zod';
import { idSchema } from './common.validator.js';

export const tableGroupParamsSchema = z.object({
  storeId: idSchema,
  groupId: idSchema,
}).strict();

export const createTableGroupBodySchema = z.object({
  tableIds: z.array(idSchema).min(2).max(20),
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(['temporary', 'fixed']).default('temporary'),
}).strict().superRefine((value, context) => {
  if (new Set(value.tableIds).size !== value.tableIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tableIds'],
      message: '拼桌成员不能重复',
    });
  }
});
