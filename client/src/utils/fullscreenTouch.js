export const FULLSCREEN_TOUCH_SCROLL_SELECTOR = '[data-potx-touch-scroll]';

export function isFullscreenTouchScrollTarget(target) {
  return Boolean(
    target
    && typeof target.closest === 'function'
    && target.closest(FULLSCREEN_TOUCH_SCROLL_SELECTOR),
  );
}
