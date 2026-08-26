export const SELECTED_STORE_STORAGE_KEY = 'potxpress_selected_store_id';

export function resolveEnabledStore(stores, savedStoreId) {
  const enabledStores = stores.filter((store) => store.enabled);
  return (
    enabledStores.find((store) => store.id === savedStoreId)
    ?? enabledStores[0]
    ?? null
  );
}

export function formatStoreDisplayName(name) {
  if (!name) return '';
  return name
    .replace(/^Pot\s*Xpress\s+Hotpot\s+Buffet\s+/i, '')
    .trim();
}
