import { z } from 'zod';
import { identifierSchema, isoDateSchema } from './base.js';

export const realtimeProtocolSchema = z.literal('potxpress.v1');

export const realtimeEventTypeSchema = z.enum([
  'timer.started',
  'timer.paused',
  'timer.resumed',
  'timer.adjusted',
  'timer.reset',
  'timer.alert_acknowledged',
  'table_group.created',
  'table_group.deleted',
]);

export const webSocketEventSchema = z.object({
  id: identifierSchema,
  storeId: identifierSchema,
  version: z.number().int().positive(),
  type: realtimeEventTypeSchema,
  entityType: z.enum(['timer', 'table_group']),
  entityId: identifierSchema.nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema,
}).strict();

export const authenticateMessageSchema = z.object({
  type: z.literal('authenticate'),
  token: z.string().min(1),
  storeId: identifierSchema,
  clientId: z.string().min(1).max(100).optional(),
}).strict();

export const pingMessageSchema = z.object({
  type: z.literal('ping'),
}).strict();

export const readyMessageSchema = z.object({
  type: z.literal('ready'),
  protocol: realtimeProtocolSchema,
  serverInstanceId: identifierSchema,
  storeId: identifierSchema,
  currentVersion: z.number().int().nonnegative(),
}).strict();

export const eventMessageSchema = z.object({
  type: z.literal('event'),
  serverInstanceId: identifierSchema,
  event: webSocketEventSchema,
}).strict();

export const pongMessageSchema = z.object({
  type: z.literal('pong'),
  serverTime: isoDateSchema,
}).strict();

export const webSocketErrorMessageSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }).strict(),
}).strict();

export const webSocketClientMessageSchema = z.discriminatedUnion('type', [
  authenticateMessageSchema,
  pingMessageSchema,
]);

export const webSocketServerMessageSchema = z.discriminatedUnion('type', [
  readyMessageSchema,
  eventMessageSchema,
  pongMessageSchema,
  webSocketErrorMessageSchema,
]);

export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;
export type WebSocketEvent = z.infer<typeof webSocketEventSchema>;
export type WebSocketClientMessage = z.infer<
  typeof webSocketClientMessageSchema
>;
export type WebSocketServerMessage = z.infer<
  typeof webSocketServerMessageSchema
>;
