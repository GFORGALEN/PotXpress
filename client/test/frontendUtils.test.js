import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationForRole, ROLE_LABELS } from '../src/utils/navigation.js';
import {
  formatStoreDisplayName,
  resolveEnabledStore,
} from '../src/utils/storeSelection.js';
import {
  calculateClockOffset,
  deriveTimerDisplay,
  formatTimerDuration,
} from '../src/utils/timerDisplay.js';
import {
  arrangeTableSelection,
  buildLayoutSavePayload,
  findSignificantOverlaps,
  scaleTableSelection,
  serializeLayout,
} from '../src/utils/layoutEditor.js';
import {
  apiLayoutToWorld,
  fitViewportToBounds,
  isLayoutInsideBounds,
  ratioBoundsToWorld,
  viewportToWorldBounds,
  worldBoundsToRatios,
  worldLayoutToApi,
} from '../src/utils/layoutCoordinates.js';
import {
  defaultAuthenticatedPath,
  FRONT_DESK_PATH,
  isFrontDeskMode,
} from '../src/utils/frontDeskMode.js';
import {
  isImmersiveViewportReady,
  shouldExitCanvasFocusAfterFullscreenChange,
  shouldLockCanvasPan,
  shouldUseNativeFullscreen,
} from '../src/utils/canvasInteraction.js';
import { deriveServerContactHealth } from '../src/utils/connectionHealth.js';

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

test('store display names remove the repeated PotXpress business prefix', () => {
  assert.equal(
    formatStoreDisplayName('Pot Xpress Hotpot Buffet Dominion Road · 本地演示'),
    'Dominion Road · 本地演示',
  );
  assert.equal(formatStoreDisplayName('Albany'), 'Albany');
  assert.equal(formatStoreDisplayName(null), '');
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

test('store staff enters the simplified front-desk mode by default', () => {
  assert.equal(defaultAuthenticatedPath('store_staff'), FRONT_DESK_PATH);
  assert.equal(defaultAuthenticatedPath('store_admin'), '/');
  assert.equal(defaultAuthenticatedPath('system_admin'), '/');
  assert.equal(isFrontDeskMode('?mode=frontdesk'), true);
  assert.equal(isFrontDeskMode('?mode=frontdesk&source=kiosk'), true);
  assert.equal(isFrontDeskMode('?mode=admin'), false);
});

test('only full-screen operations lock one-finger canvas panning', () => {
  assert.equal(shouldLockCanvasPan({ editing: false, immersive: true }), true);
  assert.equal(shouldLockCanvasPan({ editing: true, immersive: true }), false);
  assert.equal(shouldLockCanvasPan({ editing: false, immersive: false }), false);
  assert.equal(shouldLockCanvasPan({ editing: true, immersive: false }), false);
});

test('native fullscreen is attempted whenever the browser exposes the API', () => {
  assert.equal(shouldUseNativeFullscreen({ requestFullscreen() {} }), true);
  assert.equal(shouldUseNativeFullscreen({ requestFullscreen: undefined }), false);
  assert.equal(shouldUseNativeFullscreen(), false);
});

test('native fullscreen exit also clears the focused canvas fallback', () => {
  const fullscreenRoot = {};
  assert.equal(shouldExitCanvasFocusAfterFullscreenChange({
    wasNativeFullscreenActive: true,
    fullscreenElement: null,
    fullscreenRoot,
  }), true);
  assert.equal(shouldExitCanvasFocusAfterFullscreenChange({
    wasNativeFullscreenActive: true,
    fullscreenElement: fullscreenRoot,
    fullscreenRoot,
  }), false);
  assert.equal(shouldExitCanvasFocusAfterFullscreenChange({
    wasNativeFullscreenActive: false,
    fullscreenElement: null,
    fullscreenRoot,
  }), false);
});

test('immersive fit waits for the canvas to reach the browser viewport', () => {
  assert.equal(isImmersiveViewportReady(
    { width: 1280, height: 640 },
    { width: 3840, height: 2160 },
  ), false);
  assert.equal(isImmersiveViewportReady(
    { width: 3839, height: 2159 },
    { width: 3840, height: 2160 },
  ), true);
});

test('server contact health counts down before showing a reconnect reminder', () => {
  const now = Date.parse('2026-08-30T12:00:00.000Z');
  assert.equal(deriveServerContactHealth(now - 89_000, now).level, 'healthy');
  assert.deepEqual(deriveServerContactHealth(now - 95_000, now), {
    level: 'warning',
    silenceSeconds: 95,
    staleInSeconds: 25,
    nextKeepaliveInSeconds: 0,
  });
  assert.deepEqual(deriveServerContactHealth(now - 125_000, now), {
    level: 'stale',
    silenceSeconds: 125,
    staleInSeconds: 0,
    nextKeepaliveInSeconds: 0,
  });
  assert.equal(
    deriveServerContactHealth(now - 7_400, now).nextKeepaliveInSeconds,
    18,
  );
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

test('deriveTimerDisplay never exceeds the server snapshot after clock correction', () => {
  const display = deriveTimerDisplay({
    status: 'running',
    remainingSeconds: 5400,
    effectiveEndTime: '2026-01-01T01:30:00.750Z',
  }, Date.parse('2026-01-01T00:00:00.000Z'));

  assert.equal(display.remainingSeconds, 5400);
  assert.equal(formatTimerDuration(display.remainingSeconds), '90:00');
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

test('layout serialization is stable across map insertion order', () => {
  const canvas = { virtualWidth: 1600, virtualHeight: 900 };
  const left = new Map([
    ['b', { x: 320, y: 0, width: 160, height: 90, rotation: 0, zIndex: 1 }],
    ['a', { x: 0, y: 0, width: 160, height: 90, rotation: 0, zIndex: 1 }],
  ]);
  const right = new Map([...left.entries()].reverse());
  assert.equal(serializeLayout(canvas, left), serializeLayout(canvas, right));
});

test('layout save payload includes all editable canvas fields', () => {
  const canvas = {
    aspectRatio: '16:9',
    virtualWidth: 2400,
    virtualHeight: 1350,
    backgroundImage: null,
    backgroundColor: '#ffffff',
    gridEnabled: true,
    snapToGrid: false,
    gridSize: 15,
    minTableWidth: 120,
    minTableHeight: 90,
    maxTableWidth: 600,
    maxTableHeight: 450,
  };
  const worldLayout = {
    x: 240,
    y: 270,
    width: 240,
    height: 135,
    rotation: 0,
    zIndex: 1,
  };
  const apiLayout = worldLayoutToApi(worldLayout, canvas);
  const payload = buildLayoutSavePayload({
    layoutVersion: 3,
    canvas,
    tables: [{ tableId: 'table-1' }],
    layoutMap: new Map([['table-1', worldLayout]]),
  });

  assert.deepEqual(payload, {
    layoutVersion: 3,
    deletedTableIds: [],
    canvas: {
      aspectRatio: '16:9',
      virtualWidth: 2400,
      virtualHeight: 1350,
      backgroundColor: '#ffffff',
      gridEnabled: true,
      snapToGrid: false,
      gridSize: 15,
      minTableWidth: 120,
      minTableHeight: 90,
      maxTableWidth: 600,
      maxTableHeight: 450,
    },
    decorations: [],
    tables: [{ tableId: 'table-1', layout: apiLayout }],
  });

  const deletionPayload = buildLayoutSavePayload({
    layoutVersion: 4,
    canvas: payload.canvas,
    tables: [{ tableId: 'table-1' }, { tableId: 'table-2' }],
    layoutMap: new Map([['table-1', worldLayout]]),
  });
  assert.deepEqual(deletionPayload.deletedTableIds, ['table-2']);
  assert.deepEqual(
    deletionPayload.tables.map((table) => table.tableId),
    ['table-1'],
  );
});

test('smart table arrangement normalizes size, alignment and edge gaps', () => {
  const entries = [
    { tableId: 'a', layout: { x: 100, y: 200, width: 100, height: 100 } },
    { tableId: 'b', layout: { x: 300, y: 220, width: 120, height: 80 } },
    { tableId: 'c', layout: { x: 550, y: 190, width: 100, height: 100 } },
  ];

  const arranged = arrangeTableSelection(entries, 'smart', 'b');
  assert.deepEqual(arranged.map(({ layout }) => ({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  })), [
    { x: 100, y: 195, width: 100, height: 100 },
    { x: 325, y: 195, width: 100, height: 100 },
    { x: 550, y: 195, width: 100, height: 100 },
  ]);
});

test('uniform table size follows the active table while preserving centers', () => {
  const entries = [
    { tableId: 'a', layout: { x: 100, y: 200, width: 100, height: 100 } },
    { tableId: 'b', layout: { x: 300, y: 220, width: 120, height: 80 } },
  ];

  const arranged = arrangeTableSelection(entries, 'uniform-size', 'b');
  assert.deepEqual(arranged.map(({ layout }) => ({
    x: layout.x,
    y: layout.y,
    width: layout.width,
    height: layout.height,
  })), [
    { x: 90, y: 210, width: 120, height: 80 },
    { x: 300, y: 220, width: 120, height: 80 },
  ]);
});

test('synchronized resize scales table sizes and spacing from the active handle', () => {
  const entries = [
    {
      tableId: 'a',
      layout: {
        x: 100, y: 200, width: 100, height: 100,
      },
    },
    {
      tableId: 'b',
      layout: {
        x: 300, y: 400, width: 200, height: 150,
      },
    },
  ];

  assert.deepEqual(
    scaleTableSelection(entries, 'a', 'right', 2, 1),
    [
      {
        tableId: 'a',
        layout: {
          x: 100, y: 200, width: 200, height: 100,
        },
      },
      {
        tableId: 'b',
        layout: {
          x: 500, y: 400, width: 400, height: 150,
        },
      },
    ],
  );
});

test('synchronized resize uses the opposite edge as its anchor', () => {
  const entries = [
    {
      tableId: 'a',
      layout: {
        x: 100, y: 100, width: 200, height: 200,
      },
    },
    {
      tableId: 'b',
      layout: {
        x: 400, y: 400, width: 100, height: 100,
      },
    },
  ];

  assert.deepEqual(
    scaleTableSelection(entries, 'a', 'topLeft', 0.5, 0.5),
    [
      {
        tableId: 'a',
        layout: {
          x: 200, y: 200, width: 100, height: 100,
        },
      },
      {
        tableId: 'b',
        layout: {
          x: 350, y: 350, width: 50, height: 50,
        },
      },
    ],
  );
});

test('overlap detection reports intersections over thirty percent', () => {
  const tables = [
    { tableId: 'a', name: '1号桌' },
    { tableId: 'b', name: '2号桌' },
  ];
  const layouts = new Map([
    ['a', { x: 0, y: 0, width: 200, height: 200 }],
    ['b', { x: 50, y: 50, width: 200, height: 200 }],
  ]);
  assert.deepEqual(findSignificantOverlaps(tables, layouts), [{
    left: '1号桌',
    right: '2号桌',
  }]);
});

test('ratio adapter survives ten save and reload cycles without drift', () => {
  const canvas = { virtualWidth: 4000, virtualHeight: 2550 };
  const initial = {
    xRatio: 0.123456,
    yRatio: 0.234567,
    widthRatio: 0.087654,
    heightRatio: 0.076543,
    rotation: 0,
    zIndex: 17,
  };
  let persisted = initial;

  for (let cycle = 0; cycle < 10; cycle += 1) {
    persisted = worldLayoutToApi(apiLayoutToWorld(persisted, canvas), canvas);
  }

  assert.deepEqual(persisted, initial);
});

test('viewport pan and zoom calculations never mutate world layout', () => {
  const canvas = { virtualWidth: 4000, virtualHeight: 2550 };
  const layout = {
    x: 720,
    y: 460,
    width: 240,
    height: 160,
    rotation: 0,
    zIndex: 3,
  };
  const before = structuredClone(layout);

  viewportToWorldBounds(
    { x: -560, y: -320, zoom: 1.75 },
    { width: 1280, height: 800 },
    canvas,
  );
  fitViewportToBounds(
    { x: 400, y: 250, width: 1800, height: 1100 },
    { width: 1280, height: 800 },
  );

  assert.deepEqual(layout, before);
});

test('resizing one world node leaves every other node byte-for-byte unchanged', () => {
  const canvas = {
    virtualWidth: 2400,
    virtualHeight: 1350,
    defaultViewBounds: null,
  };
  const a1 = { x: 240, y: 180, width: 240, height: 135, rotation: 0, zIndex: 1 };
  const a2 = apiLayoutToWorld({
    xRatio: 0.3,
    yRatio: 0.2,
    widthRatio: 0.1,
    heightRatio: 0.1,
    rotation: 0,
    zIndex: 2,
  }, canvas);
  const payload = buildLayoutSavePayload({
    layoutVersion: 1,
    canvas,
    tables: [{ tableId: 'a1' }, { tableId: 'a2' }],
    layoutMap: new Map([
      ['a1', { ...a1, width: 300, height: 180 }],
      ['a2', a2],
    ]),
  });

  assert.deepEqual(
    apiLayoutToWorld(payload.tables.find((item) => item.tableId === 'a2').layout, canvas),
    a2,
  );
});

test('grid-snapped preview, save payload and reload use the same world point', () => {
  const canvas = {
    virtualWidth: 2400,
    virtualHeight: 1350,
    snapToGrid: true,
    gridSize: 15,
  };
  const gridSize = 15;
  const snapped = {
    x: Math.round(137 / gridSize) * gridSize,
    y: Math.round(284 / gridSize) * gridSize,
    width: Math.round(247 / gridSize) * gridSize,
    height: Math.round(126 / gridSize) * gridSize,
    rotation: 0,
    zIndex: 1,
  };
  const reloaded = apiLayoutToWorld(worldLayoutToApi(snapped, canvas), canvas);

  assert.deepEqual(reloaded, snapped);
});

test('default display bounds round-trip and fit independently per viewport size', () => {
  const canvas = { virtualWidth: 4000, virtualHeight: 2550 };
  const worldBounds = { x: 600, y: 350, width: 2200, height: 1400 };
  const ratios = worldBoundsToRatios(worldBounds, canvas);
  const restored = ratioBoundsToWorld(ratios, canvas);
  const tabletLandscape = fitViewportToBounds(restored, {
    width: 1366,
    height: 768,
  });
  const tabletPortrait = fitViewportToBounds(restored, {
    width: 768,
    height: 1366,
  });

  assert.ok(Math.abs(restored.x - worldBounds.x) <= 0.002);
  assert.ok(Math.abs(restored.y - worldBounds.y) <= 0.002);
  assert.ok(Math.abs(restored.width - worldBounds.width) <= 0.002);
  assert.ok(Math.abs(restored.height - worldBounds.height) <= 0.002);
  assert.notEqual(tabletLandscape.zoom, tabletPortrait.zoom);
  assert.equal(
    (1366 / 2 - tabletLandscape.x) / tabletLandscape.zoom,
    restored.x + restored.width / 2,
  );
  assert.equal(
    (768 / 2 - tabletPortrait.x) / tabletPortrait.zoom,
    restored.x + restored.width / 2,
  );
});

test('viewport fit supports a reserved immersive header inset', () => {
  const bounds = { x: 0, y: 0, width: 1000, height: 500 };
  const fitted = fitViewportToBounds(bounds, { width: 1200, height: 800 }, {
    padding: { top: 100, right: 50, bottom: 50, left: 50 },
  });

  assert.equal(fitted.zoom, 1.1);
  assert.equal(fitted.x, 50);
  assert.equal(fitted.y, 150);
});

test('default display range reports tables outside it', () => {
  const bounds = { x: 100, y: 100, width: 800, height: 500 };
  assert.equal(isLayoutInsideBounds({
    x: 200, y: 200, width: 120, height: 90,
  }, bounds), true);
  assert.equal(isLayoutInsideBounds({
    x: 850, y: 200, width: 120, height: 90,
  }, bounds), false);
});
