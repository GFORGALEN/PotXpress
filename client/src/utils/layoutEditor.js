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

export function serializeLayout(canvas, layoutMap) {
  const normalizedCanvas = Object.fromEntries(
    CANVAS_FIELDS.map((field) => [field, canvas[field] ?? null]),
  );
  const tables = [...layoutMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tableId, layout]) => ({
      tableId,
      layout: normalizeTableLayout(layout),
    }));
  return JSON.stringify({ canvas: normalizedCanvas, tables });
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
