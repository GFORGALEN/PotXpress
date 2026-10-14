import { databaseStore } from '../storage/databaseStore.js';

// 只取该门店最新一条事件的版本号，命中 (store_id, version) 唯一索引。
export async function readStoreRealtimeVersion(storeId) {
  const [latest] = await databaseStore.readWhere('realtimeEvents.json', {
    storeId,
    orderBy: 'version',
    latest: true,
    limit: 1,
  });
  return latest?.version ?? 0;
}
