import { z } from 'zod';

function hasAtMostSixDecimals(value) {
  const scaled = value * 1_000_000;
  return Math.abs(scaled - Math.round(scaled)) < 0.000001;
}

const ratioSchema = z.number()
  .min(0)
  .max(1)
  .refine(hasAtMostSixDecimals, '比例最多保留 6 位小数');

const submittedLayoutSchema = z.object({
  xRatio: ratioSchema,
  yRatio: ratioSchema,
  widthRatio: ratioSchema,
  heightRatio: ratioSchema,
  rotation: z.literal(0),
  zIndex: z.number().int().nonnegative(),
}).strict();

const canvasChangesSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gridEnabled: z.boolean().optional(),
  snapToGrid: z.boolean().optional(),
  gridSize: z.number().int().min(5).max(100).optional(),
}).strict();

const decorationSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['wall', 'entrance', 'cashier', 'area']),
  label: z.string().trim().min(1).max(50),
  xRatio: ratioSchema,
  yRatio: ratioSchema,
  widthRatio: ratioSchema.refine((value) => value > 0, '宽度必须大于 0'),
  heightRatio: ratioSchema.refine((value) => value > 0, '高度必须大于 0'),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]).default(0),
  zIndex: z.number().int().nonnegative(),
}).strict();

export const saveLayoutBodySchema = z.object({
  layoutVersion: z.number().int().min(1),
  canvas: canvasChangesSchema,
  decorations: z.array(decorationSchema).max(100).default([]),
  tables: z.array(
    z.object({
      tableId: z.string().min(1).max(100),
      layout: submittedLayoutSchema,
    }).strict(),
  ).max(200),
}).strict();
