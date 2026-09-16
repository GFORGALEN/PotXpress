import { v4 as uuidv4 } from 'uuid';
import { fileStore } from '../storage/fileStore.js';
import { databasePool } from '../storage/database.js';
import { AppError } from '../utils/appError.js';
import { normalizeUsername } from '../utils/normalization.js';

class UserRepository {
  async findAuthContext(userId) {
    const result = await databasePool.query(
      `SELECT
         users.id AS user_id,
         users.username AS user_username,
         users.normalized_username AS user_normalized_username,
         users.display_name AS user_display_name,
         users.password_hash AS user_password_hash,
         users.role AS user_role,
         users.store_id AS user_store_id,
         users.enabled AS user_enabled,
         users.token_version AS user_token_version,
         users.created_at AS user_created_at,
         users.updated_at AS user_updated_at,
         stores.id AS auth_store_id,
         stores.name AS auth_store_name,
         stores.code AS auth_store_code,
         stores.normalized_code AS auth_store_normalized_code,
         stores.address AS auth_store_address,
         stores.timezone AS auth_store_timezone,
         stores.enabled AS auth_store_enabled,
         stores.created_at AS auth_store_created_at,
         stores.updated_at AS auth_store_updated_at
       FROM users
       LEFT JOIN stores ON stores.id = users.store_id
       WHERE users.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;

    const user = {
      id: row.user_id,
      username: row.user_username,
      normalizedUsername: row.user_normalized_username,
      displayName: row.user_display_name,
      passwordHash: row.user_password_hash,
      role: row.user_role,
      storeId: row.user_store_id,
      enabled: row.user_enabled,
      tokenVersion: row.user_token_version,
      createdAt: new Date(row.user_created_at).toISOString(),
      updatedAt: new Date(row.user_updated_at).toISOString(),
    };
    const store = row.auth_store_id ? {
      id: row.auth_store_id,
      name: row.auth_store_name,
      code: row.auth_store_code,
      normalizedCode: row.auth_store_normalized_code,
      address: row.auth_store_address,
      timezone: row.auth_store_timezone,
      enabled: row.auth_store_enabled,
      createdAt: new Date(row.auth_store_created_at).toISOString(),
      updatedAt: new Date(row.auth_store_updated_at).toISOString(),
    } : null;

    return { user, store };
  }

  async findById(userId) {
    return fileStore.readById('users.json', userId);
  }

  async findByUsername(username) {
    const normalizedUsername = normalizeUsername(username);
    const users = await fileStore.readJSON('users.json');

    return users.find(
      (user) => user.normalizedUsername === normalizedUsername,
    ) ?? null;
  }

  async findEnabledSystemAdmins() {
    const users = await fileStore.readJSON('users.json');
    return users.filter(
      (user) => user.role === 'system_admin' && user.enabled,
    );
  }

  async findEnabledStaffByStore(storeId) {
    const users = await fileStore.readJSON('users.json');
    return users.find(
      (user) => user.role === 'store_staff'
        && user.storeId === storeId
        && user.enabled,
    ) ?? null;
  }

  async createSystemAdmin({
    username,
    displayName,
    passwordHash,
  }) {
    const normalizedUsername = normalizeUsername(username);
    const timestamp = new Date().toISOString();
    const user = {
      id: `user_${uuidv4()}`,
      username: username.trim(),
      normalizedUsername,
      displayName: displayName.trim(),
      passwordHash,
      role: 'system_admin',
      storeId: null,
      enabled: true,
      tokenVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await fileStore.updateJSON('users.json', (users) => {
      if (
        users.some(
          (candidate) => candidate.normalizedUsername === normalizedUsername,
        )
      ) {
        throw new AppError(409, 'USERNAME_TAKEN', '用户名已存在');
      }

      users.push(user);
    });

    return user;
  }
}

export const userRepository = new UserRepository();
