export function shouldLockCanvasPan({ editing, immersive }) {
  return Boolean(immersive && !editing);
}
