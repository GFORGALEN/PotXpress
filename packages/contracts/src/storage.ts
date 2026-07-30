import { z } from 'zod';
import { storedLayoutSchema } from './layout.js';
import { recordSchema } from './record.js';
import { webSocketEventSchema } from './realtime.js';
import {
  auditLogSchema,
  idempotencyKeySchema,
  metadataSchema,
  settingsSchema,
  storeSchema,
  userSchema,
} from './support.js';
import { tableGroupSchema, tableSchema } from './table.js';
import { activeTimerSchema } from './timer.js';

export const fileDataSchemas = Object.freeze({
  'users.json': z.array(userSchema),
  'stores.json': z.array(storeSchema),
  'tables.json': z.array(tableSchema),
  'tableGroups.json': z.array(tableGroupSchema),
  'activeTimers.json': z.array(activeTimerSchema),
  'records.json': z.array(recordSchema),
  'settings.json': z.array(settingsSchema),
  'auditLogs.json': z.array(auditLogSchema),
  'layouts.json': z.array(storedLayoutSchema),
  'idempotencyKeys.json': z.array(idempotencyKeySchema),
  'realtimeEvents.json': z.array(webSocketEventSchema),
  'metadata.json': metadataSchema,
});
