const DEFAULT_WIDTH_RATIO = 0.1;
const DEFAULT_HEIGHT_RATIO = 0.11;
const DECIMAL_PLACES = 6;
const OVERLAP_EPSILON = 0.0000001;

function roundRatio(value) {
  return Number(value.toFixed(DECIMAL_PLACES));
}

function overlaps(left, right) {
  return !(
    left.xRatio + left.widthRatio <= right.xRatio + OVERLAP_EPSILON
    || right.xRatio + right.widthRatio <= left.xRatio + OVERLAP_EPSILON
    || left.yRatio + left.heightRatio <= right.yRatio + OVERLAP_EPSILON
    || right.yRatio + right.heightRatio <= left.yRatio + OVERLAP_EPSILON
  );
}

/**
 * 按虚拟画布网格从左到右、从上到下寻找空位。
 * 只接收数据并返回布局，不读取存储，便于在事务锁内和单元测试中复用。
 */
export function planTableLayouts({
  canvas,
  existingLayouts,
  count,
  startingZIndex,
  preferredPositions = [],
}) {
  const stepX = canvas.gridSize / canvas.virtualWidth;
  const stepY = canvas.gridSize / canvas.virtualHeight;
  const maxX = 1 - DEFAULT_WIDTH_RATIO - stepX;
  const maxY = 1 - DEFAULT_HEIGHT_RATIO - stepY;
  const occupied = existingLayouts.map((layout) => ({ ...layout }));
  const planned = [];

  for (let tableIndex = 0; tableIndex < count; tableIndex += 1) {
    let placement = null;
    const preferred = preferredPositions[tableIndex];

    if (preferred) {
      const candidate = {
        xRatio: roundRatio(Math.min(
          Math.max(preferred.xRatio, 0),
          1 - DEFAULT_WIDTH_RATIO,
        )),
        yRatio: roundRatio(Math.min(
          Math.max(preferred.yRatio, 0),
          1 - DEFAULT_HEIGHT_RATIO,
        )),
        widthRatio: DEFAULT_WIDTH_RATIO,
        heightRatio: DEFAULT_HEIGHT_RATIO,
        rotation: 0,
        zIndex: startingZIndex + tableIndex,
      };

      if (!occupied.some((layout) => overlaps(candidate, layout))) {
        placement = candidate;
      }
    }

    for (
      let rawY = stepY;
      rawY <= maxY + OVERLAP_EPSILON && !placement;
      rawY += stepY
    ) {
      for (
        let rawX = stepX;
        rawX <= maxX + OVERLAP_EPSILON;
        rawX += stepX
      ) {
        const candidate = {
          xRatio: roundRatio(rawX),
          yRatio: roundRatio(rawY),
          widthRatio: DEFAULT_WIDTH_RATIO,
          heightRatio: DEFAULT_HEIGHT_RATIO,
          rotation: 0,
          zIndex: startingZIndex + tableIndex,
        };

        if (!occupied.some((layout) => overlaps(candidate, layout))) {
          placement = candidate;
          break;
        }
      }
    }

    if (!placement) {
      return null;
    }

    occupied.push(placement);
    planned.push(placement);
  }

  return planned;
}

export function layoutsOverlap(left, right) {
  return overlaps(left, right);
}
