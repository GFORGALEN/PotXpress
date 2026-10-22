import { checkDatabaseHealth } from '../storage/database.js';
import { databaseStore } from '../storage/databaseStore.js';

class HealthRepository {
  /** 进程内记录的存储状态（starting / ok / fatal），不访问数据库。 */
  getStorageState() {
    return databaseStore.getStatus();
  }

  /** 一次有时间上限的数据库往返；失败和超时都视为暂时不可用。 */
  async checkDatabase() {
    try {
      return await checkDatabaseHealth();
    } catch (error) {
      return 'unavailable';
    }
  }
}

export const healthRepository = new HealthRepository();
