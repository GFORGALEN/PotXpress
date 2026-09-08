const DEFAULT_CANVAS_OPTIONS = Object.freeze({
  backgroundImage: null,
  backgroundColor: '#f7f4ed',
  gridEnabled: true,
  snapToGrid: true,
  gridSize: 10,
  minTableWidth: 55,
  minTableHeight: 55,
  maxTableWidth: 520,
  maxTableHeight: 320,
});

function roundedRatio(value, total) {
  return Number((value / total).toFixed(6));
}

function worldLayout(canvas, [x, y, width, height], zIndex) {
  return {
    xRatio: roundedRatio(x, canvas.virtualWidth),
    yRatio: roundedRatio(y, canvas.virtualHeight),
    widthRatio: roundedRatio(width, canvas.virtualWidth),
    heightRatio: roundedRatio(height, canvas.virtualHeight),
    rotation: 0,
    zIndex,
  };
}

function defaultViewBoundsForRects(rects, [canvasWidth, canvasHeight], padding = 20) {
  const left = Math.max(0, Math.min(...rects.map(([x]) => x)) - padding);
  const top = Math.max(0, Math.min(...rects.map(([, y]) => y)) - padding);
  const right = Math.min(
    canvasWidth,
    Math.max(...rects.map(([x, , width]) => x + width)) + padding,
  );
  const bottom = Math.min(
    canvasHeight,
    Math.max(...rects.map(([, y, , height]) => y + height)) + padding,
  );
  return Object.freeze({
    xRatio: roundedRatio(left, canvasWidth),
    yRatio: roundedRatio(top, canvasHeight),
    widthRatio: roundedRatio(right - left, canvasWidth),
    heightRatio: roundedRatio(bottom - top, canvasHeight),
  });
}

function areaForName(name) {
  if (name.startsWith('外')) return '外场';
  return `${name[0]}区`;
}

function makeFloorPlan({
  key,
  store,
  size,
  aspectRatio,
  tables,
  decorations,
}) {
  const canvasSize = size;
  const tableRects = tables.map((item) => item.rect);
  const canvas = Object.freeze({
    ...DEFAULT_CANVAS_OPTIONS,
    aspectRatio,
    virtualWidth: canvasSize[0],
    virtualHeight: canvasSize[1],
    defaultViewBounds: defaultViewBoundsForRects(tableRects, canvasSize),
  });

  return Object.freeze({
    key,
    store: Object.freeze(store),
    canvas,
    tables: Object.freeze(tables.map((item, index) => Object.freeze({
      name: item.name,
      number: index + 1,
      sortOrder: index + 1,
      enabled: true,
      shape: item.shape ?? 'rectangle',
      capacity: item.capacity ?? 4,
      area: item.area ?? areaForName(item.name),
      note: null,
      defaultDurationMinutes: null,
      layout: Object.freeze(worldLayout(canvas, tableRects[index], 100 + index)),
    }))),
    decorations: Object.freeze(decorations.map((item, index) => Object.freeze({
      id: `decoration_${key}_${item.key}`,
      type: item.type,
      label: item.label,
      ...worldLayout(canvas, item.rect, item.zIndex ?? 10 + index),
    }))),
  });
}

const table = (name, rect, options = {}) => ({ name, rect, ...options });
const decoration = (key, type, label, rect, zIndex) => ({
  key,
  type,
  label,
  rect,
  zIndex,
});

const albanyTables = [
  ...Array.from({ length: 9 }, (_, index) => table(
    `A${index + 1}`,
    [920, 40 + index * 140, 125, 125],
    { shape: 'round', capacity: 2 },
  )),
  ...Array.from({ length: 4 }, (_, index) => table(
    `B${index + 1}`,
    [1200 + index * 290, 1160, 150, 150],
    { shape: 'round', capacity: 2 },
  )),
  ...Array.from({ length: 5 }, (_, index) => table(
    `C${index + 1}`,
    [2220, 80 + index * 230, 150, 150],
    { shape: 'round', capacity: 2 },
  )),
  table('D1', [1200, 120, 280, 180], { capacity: 4 }),
  table('D2', [1720, 130, 220, 160], { capacity: 2 }),
  table('D3', [1200, 430, 280, 180], { capacity: 4 }),
  table('D4', [1680, 430, 280, 180], { capacity: 4 }),
  table('D5', [1200, 740, 280, 180], { capacity: 4 }),
  table('D6', [1720, 750, 220, 160], { capacity: 2 }),
  table('D7', [1450, 960, 280, 170], { capacity: 4 }),
  table('外1', [520, 120, 260, 170], { shape: 'booth', capacity: 4 }),
  table('外2', [520, 380, 260, 170], { shape: 'booth', capacity: 4 }),
  table('外3', [520, 640, 260, 170], { shape: 'booth', capacity: 4 }),
  table('外4', [520, 900, 260, 170], { shape: 'booth', capacity: 4 }),
  table('外5', [100, 120, 240, 160], { capacity: 2 }),
  table('外6', [100, 380, 240, 160], { capacity: 2 }),
  table('外7', [100, 640, 240, 160], { capacity: 2 }),
  table('外8', [100, 900, 240, 160], { capacity: 2 }),
];

const albanyDecorations = [
  decoration('outdoor_area', 'area', '外场', [60, 80, 750, 1030], 1),
  decoration('main_area', 'area', '大厅', [870, 80, 1460, 1030], 2),
  decoration('divider', 'wall', '墙体', [830, 50, 20, 1080], 20),
];

// The Meadowland sketch is portrait. Rotate it counter-clockwise for the
// landscape tablet: W stays on the left, A runs across the top, C/D across
// the middle, and B/F across the bottom.
const eastTables = [
  ...Array.from({ length: 4 }, (_, index) => table(
    `A${index + 1}`,
    [650 + index * 420, 150, 240, 180],
    { capacity: 4 },
  )),
  ...Array.from({ length: 5 }, (_, index) => table(
    `B${index + 1}`,
    [80 + index * 290, 1100, 230, 170],
    { capacity: 4 },
  )),
  ...Array.from({ length: 11 }, (_, index) => table(
    `C${index + 1}`,
    [250 + index * 190, 500, 150, 150],
    { shape: 'round', capacity: 2 },
  )),
  ...Array.from({ length: 11 }, (_, index) => table(
    `D${index + 1}`,
    [250 + index * 190, 750, 150, 150],
    { shape: 'round', capacity: 2 },
  )),
  ...Array.from({ length: 5 }, (_, index) => table(
    `F${index + 1}`,
    [1580 + index * 155, 1115, 140, 140],
    { shape: 'round', capacity: 2 },
  )),
  table('W1', [320, 270, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W2', [320, 60, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W3', [60, 270, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W4', [60, 60, 220, 160], { shape: 'booth', capacity: 4 }),
];

const eastDecorations = [];

// The Browns Bay sketch uses the same counter-clockwise landscape rotation.
// Only operational tables are retained; kitchen, corridor, WC, entrance and
// other room labels intentionally do not consume tablet space.
const brownsBayTables = [
  ...Array.from({ length: 6 }, (_, index) => table(
    `A${index + 1}`,
    [60, 1080 - index * 200, 140, 145],
    { capacity: 2 },
  )),
  ...Array.from({ length: 3 }, (_, index) => table(
    `B${index + 1}`,
    [500 + index * 310, 900, 240, 160],
    { capacity: 4 },
  )),
  table('C1', [350, 80, 250, 170], { capacity: 6 }),
  table('C2', [700, 80, 250, 170], { capacity: 6 }),
  table('C3', [1050, 80, 250, 170], { capacity: 6 }),
  table('C4', [1400, 80, 250, 170], { capacity: 4 }),
  ...Array.from({ length: 3 }, (_, index) => table(
    `D${index + 1}`,
    [500 + index * 310, 1100, 240, 160],
    { capacity: 2 },
  )),
  ...Array.from({ length: 9 }, (_, index) => table(
    `A${index + 7}`,
    [250 + index * 245, 750, 150, 130],
    { capacity: 2 },
  )),
  ...Array.from({ length: 5 }, (_, index) => table(
    `A${index + 16}`,
    [500 + index * 300, 480, 160, 130],
    { capacity: 2 },
  )),
  table('W1', [1550, 1100, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W2', [1820, 1100, 220, 160], { shape: 'booth', capacity: 6 }),
  table('W3', [2090, 1100, 220, 160], { shape: 'booth', capacity: 6 }),
  table('W4', [2150, 350, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W5', [2150, 150, 220, 160], { shape: 'booth', capacity: 4 }),
  table('W6', [1830, 300, 220, 170], { shape: 'booth', capacity: 2 }),
  table('W7', [2150, 550, 220, 160], { shape: 'booth', capacity: 2 }),
];

const brownsBayDecorations = [];

export const BRANCH_FLOOR_PLANS = Object.freeze([
  makeFloorPlan({
    key: 'albany',
    store: {
      id: 'store_preview_albany',
      code: 'ALBANY',
      name: 'PotXpress Hotpot Buffet 小锅快线 – Albany',
      address: '16/8 Oracle Drive, Albany',
      timezone: 'Pacific/Auckland',
    },
    size: [2400, 1350],
    aspectRatio: '16:9',
    tables: albanyTables,
    decorations: albanyDecorations,
  }),
  makeFloorPlan({
    key: 'east',
    store: {
      id: 'store_preview_east',
      code: 'EAST',
      name: 'PotXpress Hotpot Buffet 小锅快线 – 东区 Meadowland',
      address: '9 Gooch Place, Somerville, Meadowland 2014',
      timezone: 'Pacific/Auckland',
    },
    size: [2400, 1350],
    aspectRatio: '16:9',
    tables: eastTables,
    decorations: eastDecorations,
  }),
  makeFloorPlan({
    key: 'browns_bay',
    store: {
      id: 'store_preview_browns_bay',
      code: 'BROWNSBAY',
      name: 'PotXpress Hotpot Buffet 小锅快线 – Browns Bay',
      address: '8/12 Inverness Road, Browns Bay',
      timezone: 'Pacific/Auckland',
    },
    size: [2400, 1350],
    aspectRatio: '16:9',
    tables: brownsBayTables,
    decorations: brownsBayDecorations,
  }),
]);
