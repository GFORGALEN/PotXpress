import {
  checkDatabaseHealth,
  databasePool,
} from '../src/storage/database.js';
import { fileStore } from '../src/storage/fileStore.js';
import { runMigrations } from '../src/storage/migrations.js';

try {
  await fileStore.initStorage();
  await runMigrations();
  await checkDatabaseHealth();
  console.log('PostgreSQL 数据库迁移完成，连接正常。');
} catch (error) {
  console.error('PostgreSQL 数据库迁移失败：', error);
  process.exitCode = 1;
} finally {
  await databasePool.end().catch(() => {});
}
