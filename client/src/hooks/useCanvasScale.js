import { useLayoutEffect, useMemo, useState } from 'react';

export function useCanvasScale(viewportRef, canvas) {
  const [viewportSize, setViewportSize] = useState({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return undefined;
    }

    const updateSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setViewportSize({
        width: Math.max(0, bounds.width),
        height: Math.max(0, bounds.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportRef]);

  return useMemo(() => {
    const virtualWidth = canvas?.virtualWidth ?? 1600;
    const virtualHeight = canvas?.virtualHeight ?? 900;
    const widthScale = viewportSize.width / virtualWidth;
    const heightScale = viewportSize.height / virtualHeight;
    const fitScale = Math.max(
      0.01,
      Math.min(widthScale || 1, heightScale || 1),
    );

    return {
      fitScale,
      width: virtualWidth * fitScale,
      height: virtualHeight * fitScale,
      actualSizeScale: 1 / fitScale,
    };
  }, [canvas?.virtualHeight, canvas?.virtualWidth, viewportSize]);
}
