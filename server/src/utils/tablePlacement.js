// 新桌默认使用固定的世界尺寸（等于默认 4000×2550 画布上的 0.1×0.11），
// 这样调整画布宽高后新建桌台与已有桌台保持同样大小。
const DEFAULT_TABLE_WIDTH = 400;
const DEFAULT_TABLE_HEIGHT = 280.5;
// 限制候选格数量，避免超大画布在“没有空位”时逐格扫描过久。
const MAX_SCAN_STEPS_PER_AXIS = 300;
const DECIMAL_PLACES = 6;
const OVERLAP_EPSILON = 0.0000001;

function roundRatio(value) {
  return Number(value.toFixed(DECIMAL_PLACES));
}

function clampSize(value, min, max, canvasSize) {
  let size = value;
  if (Number.isFinite(min)) size = Math.max(min, size);
  if (Number.isFinite(max)) size = Math.min(max, size);
  return Math.min(size, canvasSize);
}

function scanStep(gridSize, canvasSize) {
  const grid = Math.max(1, gridSize || 1);
  return grid * Math.max(1, Math.ceil(canvasSize / (grid * MAX_SCAN_STEPS_PER_AXIS)));
}

/**
 * 默认桌台尺寸换算为当前画布比例；最小/最大桌台约束优先。
 */
export function defaultTableRatios(canvas) {
  const width = clampSize(
    DEFAULT_TABLE_WIDTH,
    canvas.minTableWidth,
    canvas.maxTableWidth,
    canvas.virtualWidth,
  );
  const height = clampSize(
    DEFAULT_TABLE_HEIGHT,
    canvas.minTableHeight,
    canvas.maxTableHeight,
    canvas.virtualHeight,
  );
  // 向上取整到 6 位小数，避免保存往返后低于最小桌台尺寸。
  const ceilRatio = (value) => Math.min(
    1,
    Math.ceil(value * 10 ** DECIMAL_PLACES - 1e-9) / 10 ** DECIMAL_PLACES,
  );
  return {
    widthRatio: ceilRatio(width / canvas.virtualWidth),
    heightRatio: ceilRatio(height / canvas.virtualHeight),
  };
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
  const {
    widthRatio: DEFAULT_WIDTH_RATIO,
    heightRatio: DEFAULT_HEIGHT_RATIO,
  } = defaultTableRatios(canvas);
  const stepX = scanStep(canvas.gridSize, canvas.virtualWidth) / canvas.virtualWidth;
  const stepY = scanStep(canvas.gridSize, canvas.virtualHeight) / canvas.virtualHeight;
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
