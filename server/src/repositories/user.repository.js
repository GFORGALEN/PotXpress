import { v4 as uuidv4 } from 'uuid';
import { fileStore } from '../storage/fileStore.js';
import { AppError } from '../utils/appError.js';
import { normalizeUsername } from '../utils/normalization.js';

class UserRepository {
  async findById(userId) {
    const users = await fileStore.readJSON('users.json');
    return users.find((user) => user.id === userId) ?? null;
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
