import { BaseRepository } from './base.repository.js';

class LayoutRepository extends BaseRepository {
  constructor() {
    super('layouts.json', {
      idField: 'storeId',
      notFoundCode: 'LAYOUT_NOT_FOUND',
    });
  }

  async findByStoreId(storeId) {
    return this.findById(storeId);
  }
}

export const layoutRepository = new LayoutRepository();
