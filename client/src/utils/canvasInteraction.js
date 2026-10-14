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
    // v4 invalidates cameras saved while vertical spacing still had a cap.
    // Restoring that camera would preserve the previous empty lower band.
    'v4',
    encodeURIComponent(storeId),
    immersiveDeviceOrientation(viewportSize),
  ].join(':');
}

export function updateMarqueeSelectionIds(
  currentIds = [],
  changes = [],
  selectableIds,
) {
  const nextIds = new Set(currentIds);
  for (const change of changes) {
    if (change.type !== 'select'
      || (selectableIds && !selectableIds.has(change.id))) continue;
    if (change.selected) nextIds.add(change.id);
    else nextIds.delete(change.id);
  }
  return [...nextIds];
}

export function interactionPointerId(event) {
  const sourceEvent = event?.sourceEvent ?? event?.nativeEvent ?? event;
  if (Number.isFinite(sourceEvent?.pointerId)) return sourceEvent.pointerId;
  const touch = sourceEvent?.changedTouches?.[0] ?? sourceEvent?.touches?.[0];
  return Number.isFinite(touch?.identifier) ? touch.identifier : null;
}

export function shouldRecoverAbortedInteraction(event, activePointerId) {
  const sourceEvent = event?.nativeEvent ?? event;
  if (sourceEvent?.type === 'touchend') {
    // A second finger ending must not terminate the first finger's drag.
    return (sourceEvent.touches?.length ?? 0) === 0;
  }
  const eventPointerId = interactionPointerId(sourceEvent);
  if (activePointerId !== null && activePointerId !== undefined
    && eventPointerId !== null) {
    return eventPointerId === activePointerId;
  }
  return sourceEvent?.isPrimary !== false;
}

export function immersiveFontSizeStorageKey(storeId, viewportSize) {
  if (!storeId) return null;
  // Font size is independent of camera geometry. Keep the existing key so a
  // camera migration does not discard the operator's readability setting.
  return [
    'potxpress',
    'immersive-view',
    'v1',
    encodeURIComponent(storeId),
    immersiveDeviceOrientation(viewportSize),
    'font-size',
  ].join(':');
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
    // 中心以比例保存；记录当时的画布尺寸，画布改尺寸后仍能换算回
    // 原来的世界坐标（桌台世界坐标不随画布尺寸变化）。
    canvasWidth: canvas.virtualWidth,
    canvasHeight: canvas.virtualHeight,
  };
}

function snapshotCanvasSize(snapshot, canvas) {
  const hasSize = Number.isFinite(snapshot?.canvasWidth)
    && snapshot.canvasWidth > 0
    && Number.isFinite(snapshot?.canvasHeight)
    && snapshot.canvasHeight > 0;
  return hasSize
    ? { width: snapshot.canvasWidth, height: snapshot.canvasHeight }
    : { width: canvas.virtualWidth, height: canvas.virtualHeight };
}

/**
 * 旧版快照没有画布尺寸：按当前已保存画布补齐，供写回 localStorage。
 * 已带尺寸或无效的快照返回 null。
 */
export function upgradeImmersiveDeviceViewSnapshot(snapshot, canvas) {
  if (snapshot?.version !== 1
    || !Number.isFinite(snapshot.centerXRatio)
    || !Number.isFinite(snapshot.centerYRatio)
    || !Number.isFinite(canvas?.virtualWidth)
    || !Number.isFinite(canvas?.virtualHeight)) return null;
  if (Number.isFinite(snapshot.canvasWidth)
    && Number.isFinite(snapshot.canvasHeight)) return null;
  return {
    ...snapshot,
    canvasWidth: canvas.virtualWidth,
    canvasHeight: canvas.virtualHeight,
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
  const savedSize = snapshotCanvasSize(snapshot, canvas);
  const centerX = Math.min(
    centerXRatio * savedSize.width,
    canvas.virtualWidth,
  );
  const centerY = Math.min(
    centerYRatio * savedSize.height,
    canvas.virtualHeight,
  );
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
