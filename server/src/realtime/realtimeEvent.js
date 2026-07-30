import { v4 as uuidv4 } from 'uuid';

const MAX_EVENTS_PER_STORE = 1000;

export function getStoreEventVersion(realtimeEvents, storeId) {
  return realtimeEvents.findByStoreId(storeId).reduce(
    (latest, event) => Math.max(latest, event.version),
    0,
  );
}

export function appendRealtimeEvent(
  realtimeEvents,
  {
    storeId,
    type,
    entityType,
    entityId,
    payload = {},
    timestamp = new Date().toISOString(),
  },
) {
  const event = {
    id: `event_${uuidv4()}`,
    storeId,
    version: getStoreEventVersion(realtimeEvents, storeId) + 1,
    type,
    entityType,
    entityId: entityId ?? null,
    payload: structuredClone(payload),
    createdAt: timestamp,
  };
  realtimeEvents.create(event);

  const storeEvents = realtimeEvents.findByStoreId(storeId)
    .sort((left, right) => right.version - left.version);
  for (const expired of storeEvents.slice(MAX_EVENTS_PER_STORE)) {
    realtimeEvents.delete(expired.id);
  }

  return event;
}
