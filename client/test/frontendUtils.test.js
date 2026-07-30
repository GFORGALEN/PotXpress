import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationForRole, ROLE_LABELS } from '../src/utils/navigation.js';
import { resolveEnabledStore } from '../src/utils/storeSelection.js';
import {
  calculateClockOffset,
  deriveTimerDisplay,
  formatTimerDuration,
} from '../src/utils/timerDisplay.js';
import {
  buildLayoutSavePayload,
  findSignificantOverlaps,
  normalizeTableLayout,
  serializeLayout,
} from '../src/utils/layoutEditor.js';

const stores = [
  { id: 'disabled', name: '暂停营业门店', enabled: false },
  { id: 'first', name: '皇后街店', enabled: true },
  { id: 'saved', name: '海港店', enabled: true },
];

test('resolveEnabledStore restores an enabled saved store', () => {
  assert.equal(resolveEnabledStore(stores, 'saved')?.id, 'saved');
});

test('resolveEnabledStore falls back to the first enabled store', () => {
  assert.equal(resolveEnabledStore(stores, 'disabled')?.id, 'first');
  assert.equal(resolveEnabledStore(stores, 'missing')?.id, 'first');
});

test('resolveEnabledStore returns null when no store is enabled', () => {
  assert.equal(resolveEnabledStore([{ id: 'closed', enabled: false }], 'closed'), null);
});

test('navigation exposes only routes allowed for each role', () => {
  assert.equal(navigationForRole('store_staff').length, 2);
  assert.equal(navigationForRole('store_admin').length, 5);
  assert.equal(navigationForRole('system_admin').length, 7);
  assert.deepEqual(
    navigationForRole('store_staff').map((item) => item.to),
    ['/', '/admin/records'],
  );
});

test('all supported roles have a user-facing label', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), [
    'store_admin',
    'store_staff',
    'system_admin',
  ]);
});

test('deriveTimerDisplay advances running timers from a shared clock', () => {
  const timer = {
    status: 'running',
    effectiveEndTime: '2026-01-01T00:01:00.000Z',
  };

  assert.deepEqual(
    deriveTimerDisplay(timer, Date.parse('2026-01-01T00:00:30.400Z')),
    {
      status: 'running',
      remainingSeconds: 30,
      overtimeSeconds: 0,
    },
  );
  assert.deepEqual(
    deriveTimerDisplay(timer, Date.parse('2026-01-01T00:01:05.800Z')),
    {
      status: 'overtime',
      remainingSeconds: 0,
      overtimeSeconds: 5,
    },
  );
});

test('deriveTimerDisplay keeps paused time frozen', () => {
  assert.deepEqual(
    deriveTimerDisplay({
      status: 'paused',
      remainingSeconds: 127,
      effectiveEndTime: '2026-01-01T00:02:07.000Z',
    }, Date.parse('2026-01-01T12:00:00.000Z')),
    {
      status: 'paused',
      remainingSeconds: 127,
      overtimeSeconds: 0,
    },
  );
});

test('clock offset uses the request midpoint and rejects slow samples', () => {
  assert.equal(calculateClockOffset({
    serverTime: '1970-01-01T00:00:02.100Z',
    sentAt: 1000,
    receivedAt: 3000,
  }), 100);
  assert.equal(calculateClockOffset({
    serverTime: '1970-01-01T00:00:10.000Z',
    sentAt: 1000,
    receivedAt: 7001,
  }), null);
});

test('timer duration formats remaining and overtime values', () => {
  assert.equal(formatTimerDuration(65), '01:05');
  assert.equal(formatTimerDuration(125, { overtime: true }), '+02:05');
});

test('layout normalization rounds ratios and clamps positions', () => {
  assert.deepEqual(normalizeTableLayout({
    xRatio: 0.95,
    yRatio: -0.2,
    widthRatio: 0.123456789,
    heightRatio: 0.2,
    rotation: 0,
    zIndex: 2.4,
  }), {
    xRatio: 0.876543,
    yRatio: 0,
    widthRatio: 0.123457,
    heightRatio: 0.2,
    rotation: 0,
    zIndex: 2,
  });
});

test('layout serialization is stable across map insertion order', () => {
  const canvas = { virtualWidth: 1600, virtualHeight: 900 };
  const left = new Map([
    ['b', normalizeTableLayout({
      xRatio: 0.2, yRatio: 0, widthRatio: 0.1, heightRatio: 0.1,
    })],
    ['a', normalizeTableLayout({
      xRatio: 0, yRatio: 0, widthRatio: 0.1, heightRatio: 0.1,
    })],
  ]);
  const right = new Map([...left.entries()].reverse());
  assert.equal(serializeLayout(canvas, left), serializeLayout(canvas, right));
});

test('layout save payload excludes read-only canvas fields', () => {
  const layout = normalizeTableLayout({
    xRatio: 0.1,
    yRatio: 0.2,
    widthRatio: 0.1,
    heightRatio: 0.1,
    rotation: 0,
    zIndex: 1,
  });
  const payload = buildLayoutSavePayload({
    layoutVersion: 3,
    canvas: {
      aspectRatio: '16:9',
      virtualWidth: 1600,
      virtualHeight: 900,
      backgroundColor: '#ffffff',
      gridEnabled: true,
      snapToGrid: false,
      gridSize: 10,
      minTableWidth: 80,
    },
    tables: [{ tableId: 'table-1' }],
    layoutMap: new Map([['table-1', layout]]),
  });

  assert.deepEqual(payload, {
    layoutVersion: 3,
    canvas: {
      backgroundColor: '#ffffff',
      gridEnabled: true,
      snapToGrid: false,
      gridSize: 10,
    },
    decorations: [],
    tables: [{ tableId: 'table-1', layout }],
  });
});

test('overlap detection reports intersections over thirty percent', () => {
  const tables = [
    { tableId: 'a', name: '1号桌' },
    { tableId: 'b', name: '2号桌' },
  ];
  const layouts = new Map([
    ['a', { xRatio: 0, yRatio: 0, widthRatio: 0.2, heightRatio: 0.2 }],
    ['b', { xRatio: 0.05, yRatio: 0.05, widthRatio: 0.2, heightRatio: 0.2 }],
  ]);
  assert.deepEqual(findSignificantOverlaps(tables, layouts), [{
    left: '1号桌',
    right: '2号桌',
  }]);
});
