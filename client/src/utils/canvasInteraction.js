export function shouldLockCanvasPan({ editing, immersive }) {
  return Boolean(immersive && !editing);
}

export function shouldUseNativeFullscreen({ requestFullscreen } = {}) {
  return typeof requestFullscreen === 'function';
}

export function shouldExitCanvasFocusAfterFullscreenChange({
  wasNativeFullscreenActive,
  fullscreenElement,
  fullscreenRoot,
} = {}) {
  return Boolean(
    wasNativeFullscreenActive
      && fullscreenElement !== fullscreenRoot,
  );
}

export function immersiveDeviceOrientation(viewportSize = {}) {
  return viewportSize.width >= viewportSize.height ? 'landscape' : 'portrait';
}

export function shouldDecorationAffectImmersiveFit(decoration = {}) {
  return decoration.type !== 'area';
}

export function immersiveDeviceViewStorageKey(storeId, viewportSize) {
  if (!storeId) return null;
  return [
    'potxpress',
    'immersive-view',
    'v1',
    encodeURIComponent(storeId),
    immersiveDeviceOrientation(viewportSize),
  ].join(':');
}

export function immersiveFontSizeStorageKey(storeId, viewportSize) {
  const deviceViewKey = immersiveDeviceViewStorageKey(storeId, viewportSize);
  return deviceViewKey ? `${deviceViewKey}:font-size` : null;
}

export function createImmersiveDeviceViewSnapshot(
  viewport,
  viewportSize,
  canvas,
) {
  if (!viewportSize?.width || !viewportSize?.height || !viewport?.zoom
    || !canvas?.virtualWidth || !canvas?.virtualHeight) return null;
  return {
    version: 1,
    centerXRatio: (
      (viewportSize.width / 2 - viewport.x) / viewport.zoom
    ) / canvas.virtualWidth,
    centerYRatio: (
      (viewportSize.height / 2 - viewport.y) / viewport.zoom
    ) / canvas.virtualHeight,
    zoom: viewport.zoom,
  };
}

export function restoreImmersiveDeviceViewport(
  snapshot,
  viewportSize,
  canvas,
  { minZoom = 0.05, maxZoom = 4 } = {},
) {
  if (snapshot?.version !== 1
    || !Number.isFinite(snapshot.centerXRatio)
    || !Number.isFinite(snapshot.centerYRatio)
    || !Number.isFinite(snapshot.zoom)
    || snapshot.zoom <= 0
    || !Number.isFinite(viewportSize?.width)
    || viewportSize.width <= 0
    || !Number.isFinite(viewportSize?.height)
    || viewportSize.height <= 0
    || !Number.isFinite(canvas?.virtualWidth)
    || canvas.virtualWidth <= 0
    || !Number.isFinite(canvas?.virtualHeight)
    || canvas.virtualHeight <= 0) return null;
  const centerXRatio = Math.max(0, Math.min(1, snapshot.centerXRatio));
  const centerYRatio = Math.max(0, Math.min(1, snapshot.centerYRatio));
  const zoom = Math.max(minZoom, Math.min(maxZoom, snapshot.zoom));
  const centerX = centerXRatio * canvas.virtualWidth;
  const centerY = centerYRatio * canvas.virtualHeight;
  return {
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
    zoom,
  };
}

export function isImmersiveViewportReady(containerSize, viewportSize, tolerance = 2) {
  if (!containerSize?.width || !containerSize?.height
    || !viewportSize?.width || !viewportSize?.height) return false;
  return containerSize.width >= viewportSize.width - tolerance
    && containerSize.height >= viewportSize.height - tolerance;
}
