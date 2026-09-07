const RATIO_PRECISION = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function restoreExactGridValue(value, canvas) {
  if (!canvas.snapToGrid || !canvas.gridSize) return value;
  const snapped = Math.round(value / canvas.gridSize) * canvas.gridSize;
  // Six-decimal ratios can introduce a few thousandths of a world unit.
  // Recover an exact grid point only inside that serialization-error window;
  // legacy off-grid positions remain untouched.
  return Math.abs(value - snapped) <= 0.01 ? snapped : value;
}

export function roundRatio(value) {
  return Number(clamp(value, 0, 1).toFixed(RATIO_PRECISION));
}

/**
 * API boundary adapter: persisted ratios become React Flow world coordinates.
 */
export function apiLayoutToWorld(layout, canvas) {
  return {
    x: restoreExactGridValue(layout.xRatio * canvas.virtualWidth, canvas),
    y: restoreExactGridValue(layout.yRatio * canvas.virtualHeight, canvas),
    width: restoreExactGridValue(layout.widthRatio * canvas.virtualWidth, canvas),
    height: restoreExactGridValue(layout.heightRatio * canvas.virtualHeight, canvas),
    rotation: layout.rotation ?? 0,
    zIndex: Math.max(0, Math.round(layout.zIndex ?? 1)),
  };
}

/**
 * API boundary adapter: React Flow world coordinates become persisted ratios.
 */
export function worldLayoutToApi(layout, canvas) {
  const widthRatio = roundRatio(layout.width / canvas.virtualWidth);
  const heightRatio = roundRatio(layout.height / canvas.virtualHeight);

  return {
    xRatio: roundRatio(Math.min(
      layout.x / canvas.virtualWidth,
      1 - widthRatio,
    )),
    yRatio: roundRatio(Math.min(
      layout.y / canvas.virtualHeight,
      1 - heightRatio,
    )),
    widthRatio,
    heightRatio,
    rotation: Number((layout.rotation ?? 0).toFixed(6)),
    zIndex: Math.max(0, Math.round(layout.zIndex ?? 1)),
  };
}

export function apiDecorationToWorld(item, canvas) {
  const {
    xRatio,
    yRatio,
    widthRatio,
    heightRatio,
    ...metadata
  } = item;
  const worldItem = {
    ...metadata,
    ...apiLayoutToWorld({
      xRatio,
      yRatio,
      widthRatio,
      heightRatio,
      rotation: item.rotation,
      zIndex: item.zIndex,
    }, canvas),
  };
  return item.type === 'wall'
    ? clampWorldLayout(normalizeWallGeometry(worldItem), canvas)
    : worldItem;
}

export function worldDecorationToApi(item, canvas) {
  const normalizedItem = normalizeWallGeometry(item);
  const {
    x,
    y,
    width,
    height,
    ...metadata
  } = normalizedItem;
  return {
    ...metadata,
    ...worldLayoutToApi({
      x,
      y,
      width,
      height,
      rotation: item.rotation,
      zIndex: item.zIndex,
    }, canvas),
  };
}

function normalizedRotation(rotation = 0) {
  return ((Number(rotation) % 360) + 360) % 360;
}

/**
 * Walls are visually identical after a half turn. Store quarter turns as
 * real axis-aligned geometry so the React Flow node, selection outline and
 * resize handles occupy the same rectangle as the visible wall.
 */
export function normalizeWallGeometry(item) {
  if (item?.type !== 'wall') return item;
  const rotation = normalizedRotation(item.rotation);
  if (Math.abs(rotation % 90) > 0.000001) return item;
  if (rotation === 90 || rotation === 270) {
    return {
      ...item,
      x: item.x + (item.width - item.height) / 2,
      y: item.y + (item.height - item.width) / 2,
      width: item.height,
      height: item.width,
      rotation: 0,
    };
  }
  return rotation === 0 ? item : { ...item, rotation: 0 };
}

export function rotateDecorationClockwise(item) {
  if (item?.type !== 'wall') {
    return { rotation: (normalizedRotation(item?.rotation) + 90) % 360 };
  }
  return {
    x: item.x + (item.width - item.height) / 2,
    y: item.y + (item.height - item.width) / 2,
    width: item.height,
    height: item.width,
    rotation: 0,
  };
}

export function clampWorldLayout(layout, canvas) {
  const width = clamp(layout.width, 1, canvas.virtualWidth);
  const height = clamp(layout.height, 1, canvas.virtualHeight);
  return {
    ...layout,
    x: clamp(layout.x, 0, Math.max(0, canvas.virtualWidth - width)),
    y: clamp(layout.y, 0, Math.max(0, canvas.virtualHeight - height)),
    width,
    height,
  };
}

export function getWorldContentBounds(
  items,
  canvas,
  paddingRatio = 0.025,
  clampToCanvas = true,
) {
  if (!items.length) {
    return {
      x: 0,
      y: 0,
      width: canvas.virtualWidth,
      height: canvas.virtualHeight,
    };
  }

  const raw = items.reduce((bounds, item) => ({
    left: Math.min(bounds.left, item.x),
    top: Math.min(bounds.top, item.y),
    right: Math.max(bounds.right, item.x + item.width),
    bottom: Math.max(bounds.bottom, item.y + item.height),
  }), {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });
  // An explicit zero is used by the tablet fullscreen camera: the screen
  // inset already supplies its visual margin, so world-space padding would
  // needlessly make every table smaller.
  const padding = paddingRatio <= 0
    ? 0
    : Math.max(
      24,
      Math.max(raw.right - raw.left, raw.bottom - raw.top) * paddingRatio,
    );
  const left = clampToCanvas
    ? clamp(raw.left - padding, 0, canvas.virtualWidth)
    : raw.left - padding;
  const top = clampToCanvas
    ? clamp(raw.top - padding, 0, canvas.virtualHeight)
    : raw.top - padding;
  const right = clampToCanvas
    ? clamp(raw.right + padding, left + 1, canvas.virtualWidth)
    : raw.right + padding;
  const bottom = clampToCanvas
    ? clamp(raw.bottom + padding, top + 1, canvas.virtualHeight)
    : raw.bottom + padding;

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Build a display-only Y-axis projection that spreads a wide floor plan over
 * a taller fullscreen viewport. Only positions move; table dimensions stay
 * unchanged, so round tables remain round and saved layouts are untouched.
 */
export function createVerticalFillProjection(
  items,
  viewportSize,
  {
    padding = 8,
  } = {},
) {
  if (!items?.length || !viewportSize?.width || !viewportSize?.height) {
    return { originY: 0, positionScale: 1 };
  }
  const bounds = items.reduce((result, item) => ({
    left: Math.min(result.left, item.x),
    top: Math.min(result.top, item.y),
    right: Math.max(result.right, item.x + item.width),
    bottom: Math.max(result.bottom, item.y + item.height),
  }), {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  });
  const insets = typeof padding === 'number'
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : {
      top: padding.top ?? padding.y ?? 0,
      right: padding.right ?? padding.x ?? 0,
      bottom: padding.bottom ?? padding.y ?? 0,
      left: padding.left ?? padding.x ?? 0,
    };
  const availableWidth = Math.max(
    1,
    viewportSize.width - insets.left - insets.right,
  );
  const availableHeight = Math.max(
    1,
    viewportSize.height - insets.top - insets.bottom,
  );
  const width = Math.max(1, bounds.right - bounds.left);
  const currentHeight = Math.max(1, bounds.bottom - bounds.top);
  const widthFitZoom = availableWidth / width;
  const requestedHeight = availableHeight / widthFitZoom;
  if (requestedHeight <= currentHeight + 0.000001) {
    return { originY: bounds.top, positionScale: 1 };
  }

  const bottomAtScale = (positionScale) => Math.max(...items.map((item) => (
    bounds.top + (item.y - bounds.top) * positionScale + item.height
  )));
  const targetBottom = bounds.top + requestedHeight;
  let low = 1;
  let high = 1;
  while (bottomAtScale(high) < targetBottom && high < 1024) high *= 2;
  if (high >= 1024 && bottomAtScale(high) < targetBottom) {
    return { originY: bounds.top, positionScale: 1 };
  }
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    if (bottomAtScale(middle) < targetBottom) low = middle;
    else high = middle;
  }
  return {
    originY: bounds.top,
    positionScale: (low + high) / 2,
  };
}

export function projectLayoutVertically(layout, projection) {
  if (!projection || projection.positionScale === 1) return layout;
  return {
    ...layout,
    y: projection.originY
      + (layout.y - projection.originY) * projection.positionScale,
  };
}

export function fitViewportToBounds(
  bounds,
  viewportSize,
  {
    padding = 24,
    minZoom = 0.05,
    maxZoom = 4,
    alignX = 'center',
    alignY = 'center',
  } = {},
) {
  const insets = typeof padding === 'number'
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : {
      top: padding.top ?? padding.y ?? 0,
      right: padding.right ?? padding.x ?? 0,
      bottom: padding.bottom ?? padding.y ?? 0,
      left: padding.left ?? padding.x ?? 0,
    };
  const availableWidth = Math.max(
    1,
    viewportSize.width - insets.left - insets.right,
  );
  const availableHeight = Math.max(
    1,
    viewportSize.height - insets.top - insets.bottom,
  );
  const zoom = clamp(Math.min(
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
  ), minZoom, maxZoom);

  const horizontalSlack = availableWidth - bounds.width * zoom;
  const verticalSlack = availableHeight - bounds.height * zoom;
  const alignmentOffset = (alignment, slack) => {
    if (alignment === 'start') return 0;
    if (alignment === 'end') return slack;
    return slack / 2;
  };

  return {
    x: insets.left + alignmentOffset(alignX, horizontalSlack)
      - bounds.x * zoom,
    y: insets.top + alignmentOffset(alignY, verticalSlack)
      - bounds.y * zoom,
    zoom,
  };
}

export function viewportToWorldBounds(viewport, viewportSize, canvas) {
  const visibleLeft = -viewport.x / viewport.zoom;
  const visibleTop = -viewport.y / viewport.zoom;
  const visibleRight = visibleLeft + viewportSize.width / viewport.zoom;
  const visibleBottom = visibleTop + viewportSize.height / viewport.zoom;
  const left = clamp(visibleLeft, 0, canvas.virtualWidth);
  const top = clamp(visibleTop, 0, canvas.virtualHeight);
  const right = clamp(visibleRight, left, canvas.virtualWidth);
  const bottom = clamp(visibleBottom, top, canvas.virtualHeight);

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function worldBoundsToRatios(bounds, canvas) {
  const widthRatio = roundRatio(bounds.width / canvas.virtualWidth);
  const heightRatio = roundRatio(bounds.height / canvas.virtualHeight);
  return {
    xRatio: roundRatio(Math.min(
      bounds.x / canvas.virtualWidth,
      1 - widthRatio,
    )),
    yRatio: roundRatio(Math.min(
      bounds.y / canvas.virtualHeight,
      1 - heightRatio,
    )),
    widthRatio,
    heightRatio,
  };
}

export function ratioBoundsToWorld(bounds, canvas) {
  if (!bounds) return null;
  return {
    x: bounds.xRatio * canvas.virtualWidth,
    y: bounds.yRatio * canvas.virtualHeight,
    width: bounds.widthRatio * canvas.virtualWidth,
    height: bounds.heightRatio * canvas.virtualHeight,
  };
}

export function isLayoutInsideBounds(layout, bounds) {
  if (!bounds) return true;
  const epsilon = 0.000001;
  return layout.x >= bounds.x - epsilon
    && layout.y >= bounds.y - epsilon
    && layout.x + layout.width <= bounds.x + bounds.width + epsilon
    && layout.y + layout.height <= bounds.y + bounds.height + epsilon;
}
