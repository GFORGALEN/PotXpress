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
  return {
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
}

export function worldDecorationToApi(item, canvas) {
  const {
    x,
    y,
    width,
    height,
    ...metadata
  } = item;
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

export function getWorldContentBounds(items, canvas, paddingRatio = 0.025) {
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
  const padding = Math.max(
    24,
    Math.max(raw.right - raw.left, raw.bottom - raw.top) * paddingRatio,
  );
  const left = clamp(raw.left - padding, 0, canvas.virtualWidth);
  const top = clamp(raw.top - padding, 0, canvas.virtualHeight);
  const right = clamp(raw.right + padding, left + 1, canvas.virtualWidth);
  const bottom = clamp(raw.bottom + padding, top + 1, canvas.virtualHeight);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function fitViewportToBounds(
  bounds,
  viewportSize,
  { padding = 24, minZoom = 0.05, maxZoom = 4 } = {},
) {
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = clamp(Math.min(
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
  ), minZoom, maxZoom);

  return {
    x: viewportSize.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewportSize.height / 2 - (bounds.y + bounds.height / 2) * zoom,
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
