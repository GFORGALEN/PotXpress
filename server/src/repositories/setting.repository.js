import { BaseRepository } from './base.repository.js';

class SettingRepository extends BaseRepository {
  constructor() {
    super('settings.json', {
      idField: 'storeId',
      notFoundCode: 'SETTINGS_NOT_FOUND',
    });
  }

  async findByStoreId(storeId) {
    return this.findById(storeId);
  }
}

export const settingRepository = new SettingRepository();
