export const SELECTED_STORE_STORAGE_KEY = 'potxpress_selected_store_id';

export function resolveEnabledStore(stores, savedStoreId) {
  const enabledStores = stores.filter((store) => store.enabled);
  return (
    enabledStores.find((store) => store.id === savedStoreId)
    ?? enabledStores[0]
    ?? null
  );
}
