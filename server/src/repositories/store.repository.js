import { fileStore } from '../storage/fileStore.js';

class StoreRepository {
  async findById(storeId) {
    const stores = await fileStore.readJSON('stores.json');
    return stores.find((store) => store.id === storeId) ?? null;
  }
}

export const storeRepository = new StoreRepository();
