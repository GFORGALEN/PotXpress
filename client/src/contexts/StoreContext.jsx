import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getStore, listStores } from '../api/stores.js';
import { useAuth } from './AuthContext.jsx';
import {
  resolveEnabledStore,
  SELECTED_STORE_STORAGE_KEY,
} from '../utils/storeSelection.js';

export const STORE_CHANGING_EVENT = 'potxpress:store-changing';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [stores, setStores] = useState([]);
  const [currentStore, setCurrentStore] = useState(null);
  const [storeEpoch, setStoreEpoch] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadGenerationRef = useRef(0);
  const loadControllerRef = useRef(null);
  const storeRequestControllersRef = useRef(new Set());

  const clearStoreScope = useCallback(() => {
    for (const controller of storeRequestControllersRef.current) {
      controller.abort();
    }
    storeRequestControllersRef.current.clear();
    window.dispatchEvent(new Event(STORE_CHANGING_EVENT));
    setStoreEpoch((value) => value + 1);
  }, []);

  const registerStoreRequest = useCallback((controller) => {
    storeRequestControllersRef.current.add(controller);
    return () => {
      storeRequestControllersRef.current.delete(controller);
    };
  }, []);

  const applyStore = useCallback((store, { persist = true } = {}) => {
    clearStoreScope();
    setCurrentStore(store);

    if (persist && store?.enabled) {
      localStorage.setItem(SELECTED_STORE_STORAGE_KEY, store.id);
    }
  }, [clearStoreScope]);

  const loadStores = useCallback(async () => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      if (!user) {
        clearStoreScope();
        setStores([]);
        setCurrentStore(null);
        return;
      }

      if (user.role === 'system_admin') {
        const nextStores = await listStores({ signal: controller.signal });

        if (generation !== loadGenerationRef.current) {
          return;
        }

        const selected = resolveEnabledStore(
          nextStores,
          localStorage.getItem(SELECTED_STORE_STORAGE_KEY),
        );
        setStores(nextStores);
        setCurrentStore(selected);

        if (selected) {
          localStorage.setItem(SELECTED_STORE_STORAGE_KEY, selected.id);
        } else {
          localStorage.removeItem(SELECTED_STORE_STORAGE_KEY);
        }
        return;
      }

      const store = await getStore(user.storeId, {
        signal: controller.signal,
      });

      if (generation !== loadGenerationRef.current) {
        return;
      }

      setStores([store]);
      setCurrentStore(store);
    } catch (requestError) {
      if (
        requestError.code !== 'REQUEST_CANCELED'
        && generation === loadGenerationRef.current
      ) {
        setError(requestError);
        setStores([]);
        setCurrentStore(null);
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [clearStoreScope, user]);

  useEffect(() => {
    loadStores();
    return () => {
      loadControllerRef.current?.abort();
    };
  }, [loadStores]);

  const selectStore = useCallback((storeId, options = {}) => {
    if (user?.role !== 'system_admin') {
      return false;
    }

    const store = stores.find((candidate) => candidate.id === storeId);

    if (!store || (!store.enabled && !options.allowDisabled)) {
      return false;
    }

    applyStore(store, { persist: store.enabled });
    return true;
  }, [applyStore, stores, user?.role]);

  const value = useMemo(
    () => ({
      stores,
      currentStore,
      selectedStoreId: currentStore?.id ?? null,
      storeEpoch,
      loading,
      error,
      selectStore,
      refreshStores: loadStores,
      registerStoreRequest,
    }),
    [
      currentStore,
      error,
      loadStores,
      loading,
      registerStoreRequest,
      selectStore,
      storeEpoch,
      stores,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error('useStore 必须在 StoreProvider 内使用');
  }

  return context;
}
