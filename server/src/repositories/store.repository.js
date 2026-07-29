import { BaseRepository } from './base.repository.js';

class StoreRepository extends BaseRepository {
  constructor() {
    super('stores.json', { notFoundCode: 'STORE_NOT_FOUND' });
  }

  async findByStoreId(storeId) {
    return this.findById(storeId);
  }
}

export const storeRepository = new StoreRepository();
