import { z } from 'zod';
import { hasAtLeastOneField } from './common.validator.js';

const tableNameSchema = z.string().trim().min(1).max(50);
const tableNumberSchema = z.number().int().min(1).max(9999);
const tableShapeSchema = z.enum(['round', 'square', 'rectangle', 'booth']);
const tableAreaSchema = z.string().trim().min(1).max(50);
const tableNoteSchema = z.string().trim().max(200).nullable();
const tableCapacitySchema = z.number().int().min(1).max(30);
const defaultDurationSchema = z.number().int().min(5).max(480).nullable();

export const createTableBodySchema = z.object({
  name: tableNameSchema,
  number: tableNumberSchema,
  shape: tableShapeSchema.optional(),
  capacity: tableCapacitySchema.optional(),
  area: tableAreaSchema.optional(),
  note: tableNoteSchema.optional(),
  defaultDurationMinutes: defaultDurationSchema.optional(),
}).strict();

export const createTableBatchBodySchema = z.object({
  startNumber: tableNumberSchema,
  count: z.number().int().min(1).max(50),
  namePattern: z.string().min(1).max(50).optional(),
  areaCode: z.string().trim().min(1).max(10).optional(),
  area: tableAreaSchema.optional(),
  shape: tableShapeSchema.optional(),
  capacity: tableCapacitySchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.startNumber + value.count - 1 > 9999) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['count'],
      message: '批量创建后的最大桌台编号不能超过 9999',
    });
  }
});

export const deleteTableBatchBodySchema = z.object({
  tableIds: z.array(z.string().min(1).max(100)).min(1).max(100),
}).strict();

export const updateTableBodySchema = z.object({
  name: tableNameSchema.optional(),
  number: tableNumberSchema.optional(),
  sortOrder: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  shape: tableShapeSchema.optional(),
  capacity: tableCapacitySchema.optional(),
  area: tableAreaSchema.optional(),
  note: tableNoteSchema.optional(),
  defaultDurationMinutes: defaultDurationSchema.optional(),
}).strict().refine(hasAtLeastOneField, {
  message: '至少提供一个要更新的字段',
});
