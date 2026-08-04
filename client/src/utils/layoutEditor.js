const CANVAS_FIELDS = [
  'aspectRatio',
  'virtualWidth',
  'virtualHeight',
  'backgroundImage',
  'backgroundColor',
  'gridEnabled',
  'snapToGrid',
  'gridSize',
  'minTableWidth',
  'minTableHeight',
  'maxTableWidth',
  'maxTableHeight',
];

const EDITABLE_CANVAS_FIELDS = [
  'aspectRatio',
  'virtualWidth',
  'virtualHeight',
  'backgroundColor',
  'gridEnabled',
  'snapToGrid',
  'gridSize',
  'minTableWidth',
  'minTableHeight',
  'maxTableWidth',
  'maxTableHeight',
];

// 画布尺寸预设档位。切换尺寸时必须按比例缩放桌台尺寸约束，
// 否则已有桌台换算成新画布的虚拟像素后可能超出 maxTableWidth 校验。
export const CANVAS_SIZE_PRESETS = [
  { label: '小 1600×900', aspectRatio: '16:9', virtualWidth: 1600, virtualHeight: 900 },
  { label: '中 2400×1350', aspectRatio: '16:9', virtualWidth: 2400, virtualHeight: 1350 },
  { label: '大 3200×1800', aspectRatio: '16:9', virtualWidth: 3200, virtualHeight: 1800 },
  { label: '超大 4800×2700', aspectRatio: '16:9', virtualWidth: 4800, virtualHeight: 2700 },
  { label: '方形 2000×2000', aspectRatio: '1:1', virtualWidth: 2000, virtualHeight: 2000 },
  { label: '条形 3000×1200', aspectRatio: '5:2', virtualWidth: 3000, virtualHeight: 1200 },
];

export function buildCanvasResizePatch(canvas, preset) {
  const scaleX = preset.virtualWidth / canvas.virtualWidth;
  const scaleY = preset.virtualHeight / canvas.virtualHeight;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  return {
    aspectRatio: preset.aspectRatio,
    virtualWidth: preset.virtualWidth,
    virtualHeight: preset.virtualHeight,
    minTableWidth: clamp(Math.round(canvas.minTableWidth * scaleX), 20, 2000),
    minTableHeight: clamp(Math.round(canvas.minTableHeight * scaleY), 20, 2000),
    maxTableWidth: clamp(Math.round(canvas.maxTableWidth * scaleX), 40, 4000),
    maxTableHeight: clamp(Math.round(canvas.maxTableHeight * scaleY), 40, 4000),
    gridSize: clamp(Math.round(canvas.gridSize * scaleX), 5, 100),
  };
}

export function roundRatio(value) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

export function normalizeTableLayout(layout) {
  const widthRatio = roundRatio(layout.widthRatio);
  const heightRatio = roundRatio(layout.heightRatio);

  return {
    xRatio: roundRatio(Math.min(layout.xRatio, 1 - widthRatio)),
    yRatio: roundRatio(Math.min(layout.yRatio, 1 - heightRatio)),
    widthRatio,
    heightRatio,
    rotation: Number((layout.rotation ?? 0).toFixed(6)),
    zIndex: Math.max(1, Math.round(layout.zIndex ?? 1)),
  };
}

export function normalizeDecoration(item) {
  const widthRatio = Math.max(0.001, roundRatio(item.widthRatio));
  const heightRatio = Math.max(0.001, roundRatio(item.heightRatio));
  return {
    ...item,
    xRatio: roundRatio(Math.min(item.xRatio, 1 - widthRatio)),
    yRatio: roundRatio(Math.min(item.yRatio, 1 - heightRatio)),
    widthRatio,
    heightRatio,
    rotation: [0, 90, 180, 270].includes(item.rotation)
      ? item.rotation
      : 0,
    zIndex: Math.max(0, Math.round(item.zIndex ?? 1)),
  };
}

export function scaleTableSelection(
  entries,
  activeTableId,
  direction,
  scaleX,
  scaleY,
) {
  if (!entries.length) return [];

  const normalizedDirection = String(direction ?? '').toLowerCase();
  const resizeX = normalizedDirection.includes('left')
    || normalizedDirection.includes('right')
    || Math.abs((scaleX ?? 1) - 1) > 0.000001;
  const resizeY = normalizedDirection.includes('top')
    || normalizedDirection.includes('bottom')
    || Math.abs((scaleY ?? 1) - 1) > 0.000001;
  const safeScaleX = resizeX && Number.isFinite(scaleX)
    ? Math.max(0.01, scaleX)
    : 1;
  const safeScaleY = resizeY && Number.isFinite(scaleY)
    ? Math.max(0.01, scaleY)
    : 1;
  const activeLayout = entries.find(({ tableId }) => (
    tableId === activeTableId
  ))?.layout ?? entries[0].layout;
  const anchorX = normalizedDirection.includes('left')
    ? activeLayout.xRatio + activeLayout.widthRatio
    : activeLayout.xRatio;
  const anchorY = normalizedDirection.includes('top')
    ? activeLayout.yRatio + activeLayout.heightRatio
    : activeLayout.yRatio;
  const stableRatio = (value) => Number(value.toFixed(12));

  return entries.map(({ tableId, layout }) => ({
    tableId,
    layout: {
      ...layout,
      xRatio: resizeX
        ? stableRatio(anchorX + (layout.xRatio - anchorX) * safeScaleX)
        : layout.xRatio,
      yRatio: resizeY
        ? stableRatio(anchorY + (layout.yRatio - anchorY) * safeScaleY)
        : layout.yRatio,
      widthRatio: resizeX
        ? stableRatio(layout.widthRatio * safeScaleX)
        : layout.widthRatio,
      heightRatio: resizeY
        ? stableRatio(layout.heightRatio * safeScaleY)
        : layout.heightRatio,
    },
  }));
}

export function serializeLayout(canvas, layoutMap, decorations = []) {
  const normalizedCanvas = Object.fromEntries(
    CANVAS_FIELDS.map((field) => [field, canvas[field] ?? null]),
  );
  const tables = [...layoutMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tableId, layout]) => ({
      tableId,
      layout: normalizeTableLayout(layout),
    }));
  return JSON.stringify({
    canvas: normalizedCanvas,
    tables,
    decorations: [...decorations].map(normalizeDecoration).sort((left, right) => (
      left.id.localeCompare(right.id)
    )),
  });
}

export function buildLayoutSavePayload({
  layoutVersion,
  canvas,
  tables,
  layoutMap,
  decorations = [],
}) {
  return {
    layoutVersion,
    deletedTableIds: tables
      .filter((table) => !layoutMap.has(table.tableId))
      .map((table) => table.tableId),
    canvas: Object.fromEntries(
      EDITABLE_CANVAS_FIELDS.map((field) => [field, canvas[field]]),
    ),
    decorations: decorations.map(normalizeDecoration),
    tables: tables.filter((table) => layoutMap.has(table.tableId)).map((table) => ({
      tableId: table.tableId,
      layout: normalizeTableLayout(layoutMap.get(table.tableId)),
    })),
  };
}

export function findSignificantOverlaps(tables, layoutMap) {
  const overlaps = [];

  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < tables.length;
      rightIndex += 1
    ) {
      const leftTable = tables[leftIndex];
      const rightTable = tables[rightIndex];
      const left = layoutMap.get(leftTable.tableId);
      const right = layoutMap.get(rightTable.tableId);

      if (!left || !right) {
        continue;
      }

      const overlapWidth = Math.max(
        0,
        Math.min(
          left.xRatio + left.widthRatio,
          right.xRatio + right.widthRatio,
        ) - Math.max(left.xRatio, right.xRatio),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(
          left.yRatio + left.heightRatio,
          right.yRatio + right.heightRatio,
        ) - Math.max(left.yRatio, right.yRatio),
      );
      const overlapArea = overlapWidth * overlapHeight;
      const smallerArea = Math.min(
        left.widthRatio * left.heightRatio,
        right.widthRatio * right.heightRatio,
      );

      if (smallerArea > 0 && overlapArea / smallerArea > 0.3) {
        overlaps.push({
          left: leftTable.name,
          right: rightTable.name,
        });
      }
    }
  }

  return overlaps;
}
