import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true });
const identifier = z.string().min(1).max(100);
const role = z.enum(['system_admin', 'store_admin', 'store_staff']);

export const layoutSchema = z.object({
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  widthRatio: z.number().positive().max(1),
  heightRatio: z.number().positive().max(1),
  rotation: z.literal(0),
  zIndex: z.number().int().nonnegative(),
}).passthrough();

export const canvasSchema = z.object({
  aspectRatio: z.literal('16:9'),
  virtualWidth: z.literal(1600),
  virtualHeight: z.literal(900),
  backgroundImage: z.null(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  gridEnabled: z.boolean(),
  snapToGrid: z.boolean(),
  gridSize: z.number().int().min(5).max(100),
  minTableWidth: z.literal(80),
  minTableHeight: z.literal(60),
  maxTableWidth: z.literal(400),
  maxTableHeight: z.literal(300),
}).passthrough();

export const userDataSchema = z.object({
  id: identifier,
  username: z.string().min(1).max(32),
  normalizedUsername: z.string().min(1).max(32),
  displayName: z.string().min(1).max(50),
  passwordHash: z.string().min(20),
  role,
  storeId: identifier.nullable(),
  enabled: z.boolean(),
  tokenVersion: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
}).passthrough();

export const storeDataSchema = z.object({
  id: identifier,
  name: z.string().min(1).max(100),
  code: z.string().min(2).max(20),
  normalizedCode: z.string().min(2).max(20),
  address: z.string().max(200).nullable(),
  timezone: z.string().min(1).max(100),
  enabled: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
}).passthrough();

export const tableDataSchema = z.object({
  id: identifier,
  storeId: identifier,
  name: z.string().min(1).max(50),
  number: z.number().int().min(1).max(9999),
  sortOrder: z.number().int().positive(),
  enabled: z.boolean(),
  layout: layoutSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
}).passthrough();

export const settingsDataSchema = z.object({
  storeId: identifier,
  defaultDurationMinutes: z.number().int().min(5).max(480),
  warningThresholdMinutes: z.number().int().min(1).max(60),
  timezone: z.string().min(1).max(100),
  soundEnabled: z.boolean(),
  updatedAt: isoDate,
}).passthrough();

export const storeLayoutDataSchema = z.object({
  storeId: identifier,
  layoutVersion: z.number().int().positive(),
  canvas: canvasSchema,
  updatedAt: isoDate,
  updatedBy: identifier.nullable(),
}).passthrough();

const adjustmentSchema = z.object({
  type: z.enum(['add', 'subtract']),
  seconds: z.number().int().positive(),
  requestedSeconds: z.number().int().positive(),
  reason: z.string().max(100).nullable().optional(),
  by: identifier,
  byNameSnapshot: z.string().min(1).max(50),
  at: isoDate,
}).passthrough();

export const activeTimerDataSchema = z.object({
  id: identifier,
  storeId: identifier,
  tableId: identifier,
  tableNameSnapshot: z.string().min(1).max(50),
  tableNumberSnapshot: z.number().int().min(1).max(9999),
  startTime: isoDate,
  plannedDurationSeconds: z.number().int().min(60).max(28800),
  status: z.enum(['running', 'paused']),
  pauseStartedAt: isoDate.nullable(),
  totalPausedSeconds: z.number().int().nonnegative(),
  adjustments: z.array(adjustmentSchema),
  overtimeAcknowledged: z.boolean(),
  startedBy: identifier,
  startedByNameSnapshot: z.string().min(1).max(50),
  createdAt: isoDate,
  updatedAt: isoDate,
}).passthrough();

export const recordDataSchema = z.object({
  id: identifier,
  timerId: identifier,
  storeId: identifier,
  tableId: identifier,
  tableNameSnapshot: z.string().min(1).max(50),
  tableNumberSnapshot: z.number().int().min(1).max(9999),
  startTime: isoDate,
  plannedEndTime: isoDate,
  effectiveEndTimeAtReset: isoDate,
  actualEndTime: isoDate,
  plannedDurationSeconds: z.number().int().min(60).max(28800),
  actualDurationSeconds: z.number().int().nonnegative(),
  totalPausedSeconds: z.number().int().nonnegative(),
  adjustments: z.array(adjustmentSchema),
  startedBy: identifier,
  startedByNameSnapshot: z.string().min(1).max(50),
  resetBy: identifier,
  resetByNameSnapshot: z.string().min(1).max(50),
  finalStatus: z.literal('reset'),
  createdAt: isoDate,
}).passthrough();

export const auditLogDataSchema = z.object({
  id: identifier,
  timestamp: isoDate,
  userId: identifier.nullable(),
  userNameSnapshot: z.string().min(1).max(50).nullable(),
  storeId: identifier.nullable(),
  action: z.string().min(1).max(100),
  targetType: z.string().min(1).max(100),
  targetId: identifier.nullable(),
  dataBefore: z.unknown().optional(),
  dataAfter: z.unknown().optional(),
}).passthrough();

export const metadataDataSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  updatedAt: isoDate,
}).strict();

export const fileDataSchemas = Object.freeze({
  'users.json': z.array(userDataSchema),
  'stores.json': z.array(storeDataSchema),
  'tables.json': z.array(tableDataSchema),
  'activeTimers.json': z.array(activeTimerDataSchema),
  'records.json': z.array(recordDataSchema),
  'settings.json': z.array(settingsDataSchema),
  'auditLogs.json': z.array(auditLogDataSchema),
  'layouts.json': z.array(storeLayoutDataSchema),
  'metadata.json': metadataDataSchema,
});
