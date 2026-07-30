import {
  activeTimerSchema,
  auditLogSchema,
  canvasSchema,
  fileDataSchemas,
  idempotencyKeySchema,
  metadataSchema,
  recordSchema,
  settingsSchema,
  storedLayoutSchema,
  storeSchema,
  tableGroupSchema,
  tableLayoutSchema,
  tableSchema,
  userSchema,
  webSocketEventSchema,
} from '@potxpress/contracts';

// Compatibility aliases keep the JavaScript migration incremental. New code
// should import the canonical schema names directly from @potxpress/contracts.
export const layoutSchema = tableLayoutSchema;
export const userDataSchema = userSchema;
export const storeDataSchema = storeSchema;
export const tableDataSchema = tableSchema;
export const tableGroupDataSchema = tableGroupSchema;
export const settingsDataSchema = settingsSchema;
export const storeLayoutDataSchema = storedLayoutSchema;
export const activeTimerDataSchema = activeTimerSchema;
export const recordDataSchema = recordSchema;
export const auditLogDataSchema = auditLogSchema;
export const idempotencyKeyDataSchema = idempotencyKeySchema;
export const realtimeEventDataSchema = webSocketEventSchema;
export const metadataDataSchema = metadataSchema;
export { canvasSchema, fileDataSchemas };
