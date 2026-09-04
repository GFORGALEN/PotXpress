export function shouldLockCanvasPan({ editing, immersive }) {
  return Boolean(immersive && !editing);
}

export function shouldUseNativeFullscreen({ requestFullscreen } = {}) {
  return typeof requestFullscreen === 'function';
}

export function isImmersiveViewportReady(containerSize, viewportSize, tolerance = 2) {
  if (!containerSize?.width || !containerSize?.height
    || !viewportSize?.width || !viewportSize?.height) return false;
  return containerSize.width >= viewportSize.width - tolerance
    && containerSize.height >= viewportSize.height - tolerance;
}
