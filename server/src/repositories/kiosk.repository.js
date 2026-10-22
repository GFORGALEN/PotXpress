import {
  databasePool,
  rollbackTransaction,
  withDatabaseClient,
} from '../storage/database.js';
import { AppError } from '../utils/appError.js';
import {
  kioskHashesMatch,
  kioskKeyForStore,
  kioskKeyHash,
} from '../utils/kiosk.js';

class KioskRepository {
  /**
   * 启动时校准所有门店的 kiosk 摘要：新门店补齐摘要；更换 JWT_SECRET 后
   * 摘要随之更新，旧链接全部失效（与升级前的语义一致）。门店数量有上限。
   */
  async syncKeyHashes() {
    const { rows } = await databasePool.query(
      'SELECT id, kiosk_key_version, kiosk_key_hash FROM stores',
    );
    for (const row of rows) {
      const expected = kioskKeyHash(kioskKeyForStore(row.id, row.kiosk_key_version));
      if (row.kiosk_key_hash !== expected) {
        await databasePool.query(
          'UPDATE stores SET kiosk_key_hash = $2 WHERE id = $1 AND kiosk_key_version = $3',
          [row.id, expected, row.kiosk_key_version],
        );
      }
    }
  }

  /** 按摘要索引查找门店，不再遍历所有门店逐个计算 HMAC。 */
  async findStoreIdByKey(key) {
    const hash = kioskKeyHash(key);
    const { rows } = await databasePool.query(
      'SELECT id, kiosk_key_hash FROM stores WHERE kiosk_key_hash = $1 AND enabled = TRUE',
      [hash],
    );
    const row = rows[0];
    return row && kioskHashesMatch(row.kiosk_key_hash, hash) ? row.id : null;
  }

  async getKey(storeId) {
    const { rows } = await databasePool.query(
      'SELECT kiosk_key_version, kiosk_key_hash FROM stores WHERE id = $1',
      [storeId],
    );
    const row = rows[0];
    if (!row) throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');

    const key = kioskKeyForStore(storeId, row.kiosk_key_version);
    if (row.kiosk_key_hash !== kioskKeyHash(key)) {
      await databasePool.query(
        'UPDATE stores SET kiosk_key_hash = $2 WHERE id = $1 AND kiosk_key_version = $3',
        [storeId, kioskKeyHash(key), row.kiosk_key_version],
      );
    }
    return { key, version: row.kiosk_key_version };
  }

  /** 只作废这一家门店的店员入口链接，不影响其他门店和已登录用户。 */
  async rotateKey(storeId) {
    return withDatabaseClient(async (client) => {
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `UPDATE stores SET kiosk_key_version = kiosk_key_version + 1
           WHERE id = $1 RETURNING kiosk_key_version`,
          [storeId],
        );
        if (!rows[0]) throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');

        const version = rows[0].kiosk_key_version;
        const key = kioskKeyForStore(storeId, version);
        await client.query(
          'UPDATE stores SET kiosk_key_hash = $2 WHERE id = $1',
          [storeId, kioskKeyHash(key)],
        );
        await client.query('COMMIT');
        return { key, version };
      } catch (error) {
        await rollbackTransaction(client, error);
        throw error;
      }
    });
  }
}

export const kioskRepository = new KioskRepository();
