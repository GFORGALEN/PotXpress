import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_HIDDEN_INTERVAL = 15000;

export function usePolling(
  fetchFn,
  intervalMs,
  {
    enabled = true,
    hiddenIntervalMs = DEFAULT_HIDDEN_INTERVAL,
    onSuccess,
    onError,
    registerController,
  } = {},
) {
  const fetchRef = useRef(fetchFn);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  const registerRef = useRef(registerController);
  const refreshRef = useRef(() => {});

  useEffect(() => {
    fetchRef.current = fetchFn;
    successRef.current = onSuccess;
    errorRef.current = onError;
    registerRef.current = registerController;
  });

  useEffect(() => {
    if (!enabled) {
      refreshRef.current = () => {};
      return undefined;
    }

    let disposed = false;
    let timeoutId = null;
    let controller = null;
    let unregisterController = null;
    let inFlight = false;
    let queued = false;

    const clearScheduledRun = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const schedule = () => {
      if (disposed) {
        return;
      }

      clearScheduledRun();
      const delay = document.hidden ? hiddenIntervalMs : intervalMs;
      timeoutId = setTimeout(() => {
        run();
      }, delay);
    };

    const run = async () => {
      if (disposed) {
        return;
      }

      if (inFlight) {
        queued = true;
        return;
      }

      clearScheduledRun();
      inFlight = true;
      controller = new AbortController();
      unregisterController = registerRef.current?.(controller) ?? null;

      try {
        const result = await fetchRef.current({
          signal: controller.signal,
        });

        if (!disposed) {
          successRef.current?.(result);
        }
      } catch (error) {
        if (!disposed && error.code !== 'REQUEST_CANCELED') {
          errorRef.current?.(error);
        }
      } finally {
        unregisterController?.();
        unregisterController = null;
        controller = null;
        inFlight = false;

        if (!disposed && queued) {
          queued = false;
          run();
        } else {
          schedule();
        }
      }
    };

    const handleVisibilityChange = () => {
      clearScheduledRun();

      if (document.hidden) {
        schedule();
      } else {
        run();
      }
    };

    refreshRef.current = run;
    document.addEventListener('visibilitychange', handleVisibilityChange);
    run();

    return () => {
      disposed = true;
      clearScheduledRun();
      controller?.abort();
      unregisterController?.();
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
      refreshRef.current = () => {};
    };
  }, [enabled, fetchFn, hiddenIntervalMs, intervalMs]);

  return useCallback(() => refreshRef.current(), []);
}
