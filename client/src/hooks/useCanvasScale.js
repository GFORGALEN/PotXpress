import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export function useCanvasScale(viewportRef, canvas, lockScale = false) {
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

  const lockedFitScaleRef = useRef(null);

  return useMemo(() => {
    const virtualWidth = canvas?.virtualWidth ?? 1600;
    const virtualHeight = canvas?.virtualHeight ?? 900;
    const widthScale = viewportSize.width / virtualWidth;
    const heightScale = viewportSize.height / virtualHeight;
    const naturalFitScale = Math.max(
      0.01,
      Math.min(widthScale || 1, heightScale || 1),
    );
    if (!lockScale) {
      lockedFitScaleRef.current = null;
    } else if (
      lockedFitScaleRef.current === null
      && viewportSize.width > 0
      && viewportSize.height > 0
    ) {
      lockedFitScaleRef.current = naturalFitScale;
    }
    const fitScale = lockScale
      ? lockedFitScaleRef.current ?? naturalFitScale
      : naturalFitScale;

    return {
      fitScale,
      width: virtualWidth * fitScale,
      height: virtualHeight * fitScale,
      actualSizeScale: 1 / fitScale,
      viewportSize,
    };
  }, [canvas?.virtualHeight, canvas?.virtualWidth, lockScale, viewportSize]);
}
