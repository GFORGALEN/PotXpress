import {
  apiDecorationToWorld,
  apiLayoutToWorld,
  worldDecorationToApi,
  worldLayoutToApi,
} from './layoutCoordinates.js';

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
