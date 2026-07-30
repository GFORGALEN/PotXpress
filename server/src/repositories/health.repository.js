import { checkDatabaseHealth } from '../storage/database.js';

class HealthRepository {
  async getStorageStatus() {
    try {
      return await checkDatabaseHealth();
    } catch (error) {
      return 'fatal';
    }
  }
}

export const healthRepository = new HealthRepository();
