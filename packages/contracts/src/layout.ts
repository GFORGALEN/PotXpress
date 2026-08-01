import { z } from 'zod';
import { identifierSchema, isoDateSchema } from './base.js';
import {
  tableGroupSchema,
  tableLayoutSchema,
  tableShapeSchema,
} from './table.js';

export const canvasSchema = z.object({
  aspectRatio: z.string().trim().min(1).max(10),
  virtualWidth: z.number().int().min(800).max(6000),
  virtualHeight: z.number().int().min(600).max(6000),
  backgroundImage: z.null(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  gridEnabled: z.boolean(),
  snapToGrid: z.boolean(),
  gridSize: z.number().int().min(5).max(100),
  minTableWidth: z.number().int().min(20).max(2000),
  minTableHeight: z.number().int().min(20).max(2000),
  maxTableWidth: z.number().int().min(40).max(4000),
  maxTableHeight: z.number().int().min(40).max(4000),
}).passthrough();

export const decorationSchema = z.object({
  id: identifierSchema,
  type: z.enum(['wall', 'entrance', 'cashier', 'area', 'seat']),
  label: z.string().min(1).max(50),
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  widthRatio: z.number().positive().max(1),
  heightRatio: z.number().positive().max(1),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]).default(0),
  zIndex: z.number().int().nonnegative(),
}).passthrough();

export const storedLayoutSchema = z.object({
  storeId: identifierSchema,
  layoutVersion: z.number().int().positive(),
  canvas: canvasSchema,
  decorations: z.array(decorationSchema).max(100).default([]),
  updatedAt: isoDateSchema,
  updatedBy: identifierSchema.nullable(),
}).passthrough();

export const layoutTableSchema = z.object({
  tableId: identifierSchema,
  name: z.string().min(1).max(50),
  number: z.number().int().min(1).max(9999),
  enabled: z.boolean(),
  sortOrder: z.number().int().positive(),
  shape: tableShapeSchema,
  capacity: z.number().int().min(1).max(30),
  area: z.string().min(1).max(50),
  note: z.string().max(200).nullable(),
  defaultDurationMinutes: z.number().int().min(5).max(480).nullable(),
  groupId: identifierSchema.nullable(),
  groupName: z.string().min(1).max(100).nullable(),
  groupType: z.enum(['temporary', 'fixed']).nullable(),
  layout: tableLayoutSchema,
}).passthrough();

export const layoutSchema = z.object({
  layoutVersion: z.number().int().positive(),
  canvas: canvasSchema,
  decorations: z.array(decorationSchema),
  tables: z.array(layoutTableSchema),
  groups: z.array(tableGroupSchema),
}).strict();

export const saveLayoutInputSchema = z.object({
  layoutVersion: z.number().int().positive(),
  canvas: z.object({
    aspectRatio: z.string().trim().min(1).max(10).optional(),
    virtualWidth: z.number().int().min(800).max(6000).optional(),
    virtualHeight: z.number().int().min(600).max(6000).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    gridEnabled: z.boolean().optional(),
    snapToGrid: z.boolean().optional(),
    gridSize: z.number().int().min(5).max(100).optional(),
    minTableWidth: z.number().int().min(20).max(2000).optional(),
    minTableHeight: z.number().int().min(20).max(2000).optional(),
    maxTableWidth: z.number().int().min(40).max(4000).optional(),
    maxTableHeight: z.number().int().min(40).max(4000).optional(),
  }).strict(),
  decorations: z.array(decorationSchema).max(100),
  tables: z.array(z.object({
    tableId: identifierSchema,
    layout: tableLayoutSchema,
  }).strict()).max(200),
}).strict();

export const saveLayoutResultSchema = z.object({
  layoutVersion: z.number().int().positive(),
}).strict();

export type Canvas = z.infer<typeof canvasSchema>;
export type Decoration = z.infer<typeof decorationSchema>;
export type StoredLayout = z.infer<typeof storedLayoutSchema>;
export type LayoutTable = z.infer<typeof layoutTableSchema>;
export type Layout = z.infer<typeof layoutSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutInputSchema>;
export type SaveLayoutResult = z.infer<typeof saveLayoutResultSchema>;
