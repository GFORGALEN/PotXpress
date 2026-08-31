export function shouldLockCanvasPan({ editing, immersive }) {
  return Boolean(immersive && !editing);
}

export function shouldUseNativeFullscreen({ maxTouchPoints = 0, coarsePointer = false }) {
  return maxTouchPoints <= 0 && !coarsePointer;
}

export function isImmersiveViewportReady(containerSize, viewportSize, tolerance = 2) {
  if (!containerSize?.width || !containerSize?.height
    || !viewportSize?.width || !viewportSize?.height) return false;
  return containerSize.width >= viewportSize.width - tolerance
    && containerSize.height >= viewportSize.height - tolerance;
}
