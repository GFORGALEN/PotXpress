import {
  apiDecorationToWorld,
  apiLayoutToWorld,
  clampWorldLayout,
  ratioBoundsToWorld,
  worldBoundsToRatios,
  worldDecorationToApi,
  worldLayoutToApi,
} from './layoutCoordinates.js';

export const CANVAS_SIZE_PRESETS = Object.freeze([
  { id: 'small', label: '小型', width: 1600, height: 900 },
  { id: 'medium', label: '中型', width: 2400, height: 1350 },
  { id: 'large', label: '大型', width: 3200, height: 1800 },
  { id: 'xlarge', label: '超大型', width: 4800, height: 2700 },
  { id: 'square', label: '方形', width: 2000, height: 2000 },
  { id: 'strip', label: '长条形', width: 3000, height: 1200 },
]);

// 契约允许到 50000，但比例只保留 6 位小数：超过 20000 时保存往返误差会
// 超出最小桌台尺寸与网格还原的 0.01 容差，因此界面只开放到 20000。
export const CANVAS_SIZE_LIMITS = Object.freeze({
  minWidth: 800,
  minHeight: 600,
  maxWidth: 20000,
  maxHeight: 20000,
});

const RESIZE_EPSILON = 0.000001;

export function validateCanvasSizeInput(width, height) {
  const errors = [];
  if (!Number.isInteger(width)
    || width < CANVAS_SIZE_LIMITS.minWidth
    || width > CANVAS_SIZE_LIMITS.maxWidth) {
    errors.push(`宽度需为 ${CANVAS_SIZE_LIMITS.minWidth}–${CANVAS_SIZE_LIMITS.maxWidth} 的整数`);
  }
  if (!Number.isInteger(height)
    || height < CANVAS_SIZE_LIMITS.minHeight
    || height > CANVAS_SIZE_LIMITS.maxHeight) {
    errors.push(`高度需为 ${CANVAS_SIZE_LIMITS.minHeight}–${CANVAS_SIZE_LIMITS.maxHeight} 的整数`);
  }
  return errors;
}

/**
 * 元素在画布上占用的右/下边缘：取保存用的未旋转矩形与绕中心旋转后的
 * 可见包围盒中较远的一侧。左/上方向的越界与画布宽高无关，不在此计算。
 */
export function layoutFarEdges(item) {
  const radians = ((Number(item.rotation) || 0) % 360) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const visibleWidth = item.width * cos + item.height * sin;
  const visibleHeight = item.width * sin + item.height * cos;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return {
    right: Math.max(item.x + item.width, centerX + visibleWidth / 2),
    bottom: Math.max(item.y + item.height, centerY + visibleHeight / 2),
  };
}

const DECORATION_LABELS = Object.freeze({
  wall: '墙体',
  entrance: '入口',
  cashier: '收银台',
  area: '区域',
  seat: '座位',
});

/**
 * 计算把画布改为 width×height 后的草稿。元素世界坐标和尺寸保持不变；
 * 越界的启用桌台或装饰会让本次修改被拒绝。停用桌台在画布上不可见、
 * 无法拖动，越界时移回新画布内并在结果中列出（随尺寸一起可撤回）。
 */
export function planCanvasResize({
  canvas,
  layoutMap,
  decorations,
  tables,
  width,
  height,
}) {
  const inputErrors = validateCanvasSizeInput(width, height);
  if (inputErrors.length) {
    return { ok: false, reason: 'invalid', message: inputErrors.join('；') };
  }

  const nextCanvas = {
    ...canvas,
    aspectRatio: 'auto',
    virtualWidth: width,
    virtualHeight: height,
  };
  const tableById = new Map(tables.map((table) => [table.tableId, table]));
  const blockers = [];
  const movedDisabled = [];
  const nextLayoutMap = new Map(layoutMap);
  let requiredWidth = CANVAS_SIZE_LIMITS.minWidth;
  let requiredHeight = CANVAS_SIZE_LIMITS.minHeight;
  const exceeds = (edges) => edges.right > width + RESIZE_EPSILON
    || edges.bottom > height + RESIZE_EPSILON;
  const track = (edges, name) => {
    requiredWidth = Math.max(requiredWidth, Math.ceil(edges.right - RESIZE_EPSILON));
    requiredHeight = Math.max(requiredHeight, Math.ceil(edges.bottom - RESIZE_EPSILON));
    if (exceeds(edges)) blockers.push(name);
  };

  for (const [tableId, layout] of layoutMap) {
    const table = tableById.get(tableId);
    const name = table?.name ?? '桌台';
    const edges = layoutFarEdges(layout);
    if (table && table.enabled === false) {
      if (!exceeds(edges)) continue;
      if (layout.width > width + RESIZE_EPSILON
        || layout.height > height + RESIZE_EPSILON) {
        track(edges, `停用桌台 ${name}`);
        continue;
      }
      nextLayoutMap.set(tableId, clampWorldLayout(layout, nextCanvas));
      movedDisabled.push(name);
      continue;
    }
    track(edges, name);
  }
  for (const item of decorations) {
    track(layoutFarEdges(item), item.label || DECORATION_LABELS[item.type] || '装饰');
  }

  if (blockers.length) {
    const listed = blockers.slice(0, 6).join('、');
    return {
      ok: false,
      reason: 'out_of_bounds',
      requiredWidth,
      requiredHeight,
      blockers,
      message: `当前布局至少需要 ${requiredWidth}×${requiredHeight}，请先移动 ${listed}${blockers.length > 6 ? ` 等 ${blockers.length} 项` : ''}再缩小`,
    };
  }

  // 默认展示范围存的是比例：先按旧画布还原世界范围，再按新尺寸编码。
  let defaultViewCleared = false;
  if (canvas.defaultViewBounds) {
    const world = ratioBoundsToWorld(canvas.defaultViewBounds, canvas);
    const tolerance = Math.max(width, height) * RESIZE_EPSILON;
    if (world.x + world.width <= width + tolerance
      && world.y + world.height <= height + tolerance) {
      nextCanvas.defaultViewBounds = worldBoundsToRatios({
        x: world.x,
        y: world.y,
        width: Math.min(world.width, width - world.x),
        height: Math.min(world.height, height - world.y),
      }, nextCanvas);
    } else {
      nextCanvas.defaultViewBounds = null;
      defaultViewCleared = true;
    }
  }

  return {
    ok: true,
    nextCanvas,
    nextLayoutMap,
    movedDisabled,
    defaultViewCleared,
  };
}

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
  'defaultViewBounds',
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
  'defaultViewBounds',
];

export function readLayoutIntoWorld(layout) {
  return {
    canvas: structuredClone(layout.canvas),
    tables: layout.tables.map((table) => ({
      ...table,
      layout: apiLayoutToWorld(table.layout, layout.canvas),
    })),
    decorations: (layout.decorations ?? []).map((item) => (
      apiDecorationToWorld(item, layout.canvas)
    )),
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
    ? activeLayout.x + activeLayout.width
    : activeLayout.x;
  const anchorY = normalizedDirection.includes('top')
    ? activeLayout.y + activeLayout.height
    : activeLayout.y;
  const stableRatio = (value) => Number(value.toFixed(12));

  return entries.map(({ tableId, layout }) => ({
    tableId,
    layout: {
      ...layout,
      x: resizeX
        ? stableRatio(anchorX + (layout.x - anchorX) * safeScaleX)
        : layout.x,
      y: resizeY
        ? stableRatio(anchorY + (layout.y - anchorY) * safeScaleY)
        : layout.y,
      width: resizeX
        ? stableRatio(layout.width * safeScaleX)
        : layout.width,
      height: resizeY
        ? stableRatio(layout.height * safeScaleY)
        : layout.height,
    },
  }));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function selectionBounds(entries) {
  return entries.reduce((bounds, { layout }) => ({
    left: Math.min(bounds.left, layout.x),
    top: Math.min(bounds.top, layout.y),
    right: Math.max(bounds.right, layout.x + layout.width),
    bottom: Math.max(bounds.bottom, layout.y + layout.height),
  }), {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });
}

function distribute(entries, axis, bounds) {
  const horizontal = axis === 'horizontal';
  const positionKey = horizontal ? 'x' : 'y';
  const sizeKey = horizontal ? 'width' : 'height';
  const start = horizontal ? bounds.left : bounds.top;
  const end = horizontal ? bounds.right : bounds.bottom;
  const sorted = [...entries].sort((left, right) => (
    left.layout[positionKey] - right.layout[positionKey]
  ));
  const totalSize = sorted.reduce((sum, entry) => sum + entry.layout[sizeKey], 0);
  const gap = sorted.length > 1
    ? Math.max(0, (end - start - totalSize) / (sorted.length - 1))
    : 0;
  let cursor = start;

  return sorted.map((entry) => {
    const next = {
      ...entry,
      layout: {
        ...entry.layout,
        [positionKey]: cursor,
      },
    };
    cursor += entry.layout[sizeKey] + gap;
    return next;
  });
}

/**
 * Applies predictable geometry operations to a selected set of tables.
 * Smart arrange normalizes the median size, detects row/column orientation,
 * aligns the cross-axis and distributes equal edge-to-edge gaps.
 */
export function arrangeTableSelection(entries, operation, activeTableId) {
  if (entries.length < 2) return entries;

  const bounds = selectionBounds(entries);
  const activeLayout = entries.find(({ tableId }) => tableId === activeTableId)?.layout
    ?? entries[0].layout;
  let next = entries.map((entry) => ({
    ...entry,
    layout: { ...entry.layout },
  }));

  if (operation === 'uniform-size' || operation === 'smart') {
    const targetWidth = operation === 'smart'
      ? median(entries.map(({ layout }) => layout.width))
      : activeLayout.width;
    const targetHeight = operation === 'smart'
      ? median(entries.map(({ layout }) => layout.height))
      : activeLayout.height;
    next = next.map((entry) => ({
      ...entry,
      layout: {
        ...entry.layout,
        x: entry.layout.x + (entry.layout.width - targetWidth) / 2,
        y: entry.layout.y + (entry.layout.height - targetHeight) / 2,
        width: targetWidth,
        height: targetHeight,
      },
    }));
  }

  if (operation === 'align-left') {
    next = next.map((entry) => ({
      ...entry,
      layout: { ...entry.layout, x: bounds.left },
    }));
  } else if (operation === 'align-top') {
    next = next.map((entry) => ({
      ...entry,
      layout: { ...entry.layout, y: bounds.top },
    }));
  } else if (operation === 'align-center-x') {
    const center = (bounds.left + bounds.right) / 2;
    next = next.map((entry) => ({
      ...entry,
      layout: { ...entry.layout, x: center - entry.layout.width / 2 },
    }));
  } else if (operation === 'align-center-y') {
    const center = (bounds.top + bounds.bottom) / 2;
    next = next.map((entry) => ({
      ...entry,
      layout: { ...entry.layout, y: center - entry.layout.height / 2 },
    }));
  } else if (operation === 'distribute-horizontal') {
    next = distribute(next, 'horizontal', bounds);
  } else if (operation === 'distribute-vertical') {
    next = distribute(next, 'vertical', bounds);
  } else if (operation === 'smart') {
    const centerXRange = Math.max(...entries.map(({ layout }) => (
      layout.x + layout.width / 2
    ))) - Math.min(...entries.map(({ layout }) => (
      layout.x + layout.width / 2
    )));
    const centerYRange = Math.max(...entries.map(({ layout }) => (
      layout.y + layout.height / 2
    ))) - Math.min(...entries.map(({ layout }) => (
      layout.y + layout.height / 2
    )));
    const horizontal = centerXRange >= centerYRange;

    if (horizontal) {
      const centerY = (bounds.top + bounds.bottom) / 2;
      next = next.map((entry) => ({
        ...entry,
        layout: { ...entry.layout, y: centerY - entry.layout.height / 2 },
      }));
      next = distribute(next, 'horizontal', bounds);
    } else {
      const centerX = (bounds.left + bounds.right) / 2;
      next = next.map((entry) => ({
        ...entry,
        layout: { ...entry.layout, x: centerX - entry.layout.width / 2 },
      }));
      next = distribute(next, 'vertical', bounds);
    }
  }

  return next;
}

export function serializeLayout(canvas, layoutMap, decorations = []) {
  const normalizedCanvas = Object.fromEntries(
    CANVAS_FIELDS.map((field) => [field, canvas[field] ?? null]),
  );
  const tables = [...layoutMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tableId, layout]) => ({
      tableId,
      layout,
    }));
  return JSON.stringify({
    canvas: normalizedCanvas,
    tables,
    decorations: [...decorations].sort((left, right) => (
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
      EDITABLE_CANVAS_FIELDS
        .filter((field) => canvas[field] !== undefined)
        .map((field) => [field, canvas[field]]),
    ),
    decorations: decorations.map((item) => worldDecorationToApi(item, canvas)),
    tables: tables.filter((table) => layoutMap.has(table.tableId)).map((table) => ({
      tableId: table.tableId,
      layout: worldLayoutToApi(layoutMap.get(table.tableId), canvas),
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
          left.x + left.width,
          right.x + right.width,
        ) - Math.max(left.x, right.x),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(
          left.y + left.height,
          right.y + right.height,
        ) - Math.max(left.y, right.y),
      );
      const overlapArea = overlapWidth * overlapHeight;
      const smallerArea = Math.min(
        left.width * left.height,
        right.width * right.height,
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
