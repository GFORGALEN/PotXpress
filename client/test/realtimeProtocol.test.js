import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWebSocketUrl,
  calculateReconnectDelay,
  classifyEventVersion,
  isRealtimeEnvelopeForStore,
} from '../src/realtime/realtimeProtocol.js';

test('WebSocket URL follows the current page protocol and host', () => {
  assert.equal(
    buildWebSocketUrl({
      protocol: 'https:',
      host: 'app.example.com',
    }),
    'wss://app.example.com/ws',
  );
  assert.equal(
    buildWebSocketUrl({
      protocol: 'http:',
      host: '127.0.0.1:5173',
    }),
    'ws://127.0.0.1:5173/ws',
  );
});

test('event versions identify next, duplicate, gap and invalid messages', () => {
  assert.equal(classifyEventVersion(4, 5), 'next');
  assert.equal(classifyEventVersion(5, 5), 'duplicate');
  assert.equal(classifyEventVersion(5, 4), 'duplicate');
  assert.equal(classifyEventVersion(5, 8), 'gap');
  assert.equal(classifyEventVersion(5, 0), 'invalid');
  assert.equal(classifyEventVersion(5, 1.5), 'invalid');
});

test('store envelope filtering prevents old-room events from being applied', () => {
  const message = {
    type: 'event',
    event: {
      storeId: 'store_a',
      version: 1,
    },
  };
  assert.equal(isRealtimeEnvelopeForStore(message, 'store_a'), true);
  assert.equal(isRealtimeEnvelopeForStore(message, 'store_b'), false);
  assert.equal(isRealtimeEnvelopeForStore({ type: 'ready' }, 'store_a'), false);
});

test('reconnect delay uses bounded exponential backoff with jitter', () => {
  assert.equal(calculateReconnectDelay(0, () => 0), 500);
  assert.equal(calculateReconnectDelay(1, () => 0), 1000);
  assert.equal(calculateReconnectDelay(20, () => 0), 30000);
  assert.equal(calculateReconnectDelay(20, () => 1), 37500);
});
