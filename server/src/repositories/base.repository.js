import { databaseStore } from '../storage/databaseStore.js';

export class BaseRepository {
  constructor(filename, { idField = 'id', notFoundCode = 'RECORD_NOT_FOUND' } = {}) {
    this.filename = filename;
    this.idField = idField;
    this.notFoundCode = notFoundCode;
  }

  async findById(id) {
    return databaseStore.readById(this.filename, id);
  }

  /** 读取范围由 SQL 决定（storeId / where / ids / limit），不在应用侧过滤整表。 */
  async findWhere(scope) {
    return databaseStore.readWhere(this.filename, scope);
  }
}
