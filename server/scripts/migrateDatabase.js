import {
  checkDatabaseHealth,
  databasePool,
} from '../src/storage/database.js';
import { databaseStore } from '../src/storage/databaseStore.js';

try {
  await databaseStore.initStorage();
  await checkDatabaseHealth();
  console.log('PostgreSQL 数据库迁移完成，连接正常。');
} catch (error) {
  console.error('PostgreSQL 数据库迁移失败：', error);
  process.exitCode = 1;
} finally {
  await databasePool.end().catch(() => {});
}
