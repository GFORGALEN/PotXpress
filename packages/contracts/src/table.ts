import { z } from 'zod';
import { identifierSchema, isoDateSchema } from './base.js';

export const tableShapeSchema = z.enum([
  'round',
  'square',
  'rectangle',
  'booth',
]);

export const tableLayoutSchema = z.object({
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  widthRatio: z.number().positive().max(1),
  heightRatio: z.number().positive().max(1),
  rotation: z.literal(0),
  zIndex: z.number().int().nonnegative(),
}).passthrough();

export const tableSchema = z.object({
  id: identifierSchema,
  storeId: identifierSchema,
  name: z.string().min(1).max(50),
  number: z.number().int().min(1).max(9999),
  sortOrder: z.number().int().positive(),
  enabled: z.boolean(),
  shape: tableShapeSchema,
  capacity: z.number().int().min(1).max(30),
  area: z.string().min(1).max(50),
  note: z.string().max(200).nullable(),
  defaultDurationMinutes: z.number().int().min(5).max(480).nullable(),
  layout: tableLayoutSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
}).passthrough();

export const tableGroupSchema = z.object({
  id: identifierSchema,
  storeId: identifierSchema,
  name: z.string().min(1).max(100),
  tableIds: z.array(identifierSchema).min(2).max(20),
  type: z.enum(['temporary', 'fixed']),
  enabled: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  createdBy: identifierSchema,
}).passthrough();

export type TableShape = z.infer<typeof tableShapeSchema>;
export type TableLayout = z.infer<typeof tableLayoutSchema>;
export type Table = z.infer<typeof tableSchema>;
export type TableGroup = z.infer<typeof tableGroupSchema>;
