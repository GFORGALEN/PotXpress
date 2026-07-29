import { BaseRepository } from './base.repository.js';

class TableRepository extends BaseRepository {
  constructor() {
    super('tables.json', { notFoundCode: 'TABLE_NOT_FOUND' });
  }

  async findByStoreId(storeId) {
    return this.find((table) => table.storeId === storeId);
  }
}

export const tableRepository = new TableRepository();
