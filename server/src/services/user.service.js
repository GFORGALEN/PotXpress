import { v4 as uuidv4 } from 'uuid';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';
import { hashPassword } from '../utils/hash.js';
import { normalizeUsername } from '../utils/normalization.js';

export function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    storeId: user.storeId,
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function assertRoleStore(stores, role, storeId) {
  if (role === 'system_admin') {
    if (storeId !== null && storeId !== undefined) {
      throw new AppError(400, 'VALIDATION_ERROR', '系统管理员不能绑定门店');
    }
    return null;
  }
  if (!storeId) {
    throw new AppError(400, 'VALIDATION_ERROR', '门店用户必须绑定门店');
  }
  const store = stores.findById(storeId);
  if (!store) throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  if (!store.enabled) {
    throw new AppError(409, 'STORE_DISABLED', '不能把用户绑定到已停用门店');
  }
  return storeId;
}

const snapshot = (user) => toSafeUser(user);

export async function listUsers() {
  return unitOfWorkRepository.run(
    { resources: ['users'], writeOrder: [] },
    ({ users }) => users.find().map(toSafeUser)
      .sort((left, right) => left.username.localeCompare(right.username)),
  );
}

export async function createUser(input, actor) {
  const passwordHash = await hashPassword(input.password);
  const timestamp = new Date().toISOString();
  let created;
  await unitOfWorkRepository.run(
    { resources: ['users', 'stores'], writeOrder: ['users'] },
    ({ users, stores }) => {
      const normalizedUsername = normalizeUsername(input.username);
      if (users.findOne((user) => user.normalizedUsername === normalizedUsername)) {
        throw new AppError(409, 'USERNAME_TAKEN', '用户名已存在');
      }
      const storeId = assertRoleStore(stores, input.role, input.storeId);
      created = users.create({
        id: `user_${uuidv4()}`,
        username: input.username.trim(),
        normalizedUsername,
        displayName: input.displayName.trim(),
        passwordHash,
        role: input.role,
        storeId,
        enabled: true,
        tokenVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
  );
  await writeAuditLogBestEffort({
    userId: actor.userId,
    userNameSnapshot: actor.displayName,
    storeId: created.storeId,
    action: 'user.create',
    targetType: 'user',
    targetId: created.id,
    dataBefore: null,
    dataAfter: snapshot(created),
  });
  return toSafeUser(created);
}

export async function updateUser(userId, input, actor) {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  let before;
  let updated;
  await unitOfWorkRepository.run(
    { resources: ['users', 'stores'], writeOrder: ['users'] },
    ({ users, stores }) => {
      const current = users.findById(userId);
      if (!current) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
      const nextRole = input.role ?? current.role;
      const requestedStoreId = input.storeId !== undefined ? input.storeId : current.storeId;
      const nextStoreId = assertRoleStore(stores, nextRole, requestedStoreId);
      const nextEnabled = input.enabled ?? current.enabled;
      if (current.id === actor.userId && (nextRole !== 'system_admin' || !nextEnabled)) {
        throw new AppError(409, 'CANNOT_REVOKE_SELF', '不能停用自己或取消自己的系统管理员权限');
      }
      const removesAdmin = current.role === 'system_admin'
        && current.enabled
        && (nextRole !== 'system_admin' || !nextEnabled);
      if (removesAdmin && users.find((user) => (
        user.id !== current.id && user.role === 'system_admin' && user.enabled
      )).length === 0) {
        throw new AppError(409, 'LAST_SYSTEM_ADMIN', '必须保留至少一名启用的系统管理员');
      }
      before = structuredClone(current);
      const invalidatesSessions = Boolean(
        passwordHash
        || nextRole !== current.role
        || nextStoreId !== current.storeId
        || nextEnabled !== current.enabled,
      );
      updated = users.update(userId, {
        ...current,
        ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        role: nextRole,
        storeId: nextStoreId,
        enabled: nextEnabled,
        tokenVersion: current.tokenVersion + (invalidatesSessions ? 1 : 0),
        updatedAt: new Date().toISOString(),
      });
    },
  );
  await writeAuditLogBestEffort({
    userId: actor.userId,
    userNameSnapshot: actor.displayName,
    storeId: updated.storeId,
    action: 'user.update',
    targetType: 'user',
    targetId: updated.id,
    dataBefore: snapshot(before),
    dataAfter: snapshot(updated),
  });
  return toSafeUser(updated);
}
