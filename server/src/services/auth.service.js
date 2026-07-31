import { userRepository } from '../repositories/user.repository.js';
import { storeRepository } from '../repositories/store.repository.js';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLog } from '../utils/audit.js';
import { comparePassword, hashPassword } from '../utils/hash.js';
import { signToken } from '../utils/jwt.js';
import { kioskKeyForStore } from '../utils/kiosk.js';

const dummyHashPromise = hashPassword('potxpress-dummy-password');

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    storeId: user.storeId,
  };
}

async function writeAuthAuditBestEffort(entry) {
  try {
    await writeAuditLog(entry);
  } catch (error) {
    console.error(`认证审计日志写入失败：${error.message}`);
  }
}

export async function login({ username, password }) {
  const user = await userRepository.findByUsername(username);
  const hashToCompare = user?.passwordHash ?? await dummyHashPromise;
  const passwordMatches = await comparePassword(password, hashToCompare);
  let storeEnabled = true;

  if (user && user.role !== 'system_admin') {
    const store = await storeRepository.findById(user.storeId);
    storeEnabled = Boolean(store?.enabled);
  }

  if (!user || !passwordMatches || !user.enabled || !storeEnabled) {
    throw new AppError(401, 'UNAUTHORIZED', '用户名或密码错误');
  }

  const safeUser = toSafeUser(user);
  const token = signToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
  });

  await writeAuthAuditBestEffort({
    userId: user.id,
    userNameSnapshot: user.displayName,
    storeId: user.storeId,
    action: 'auth.login',
    targetType: 'user',
    targetId: user.id,
    dataBefore: null,
    dataAfter: { username: user.username },
  });

  return { token, user: safeUser };
}

export async function kioskLogin({ key }) {
  const stores = await storeRepository.find();
  const store = stores.find(
    (candidate) => candidate.enabled && kioskKeyForStore(candidate.id) === key,
  ) ?? null;

  if (!store) {
    throw new AppError(401, 'KIOSK_KEY_INVALID', '店员入口链接无效或已失效');
  }

  const user = await userRepository.findEnabledStaffByStore(store.id);
  if (!user) {
    throw new AppError(409, 'KIOSK_STAFF_MISSING', '该门店还没有启用的店员账号');
  }

  const safeUser = toSafeUser(user);
  const token = signToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
  });

  await writeAuthAuditBestEffort({
    userId: user.id,
    userNameSnapshot: user.displayName,
    storeId: user.storeId,
    action: 'auth.kiosk_login',
    targetType: 'user',
    targetId: user.id,
    dataBefore: null,
    dataAfter: { username: user.username },
  });

  return { token, user: safeUser };
}

export async function logout(user) {
  await writeAuthAuditBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId: user.storeId,
    action: 'auth.logout',
    targetType: 'user',
    targetId: user.userId,
    dataBefore: null,
    dataAfter: null,
  });
}

export async function changePassword(user, input) {
  const passwordHash = await hashPassword(input.newPassword);
  await unitOfWorkRepository.run(
    { resources: ['users'], writeOrder: ['users'] },
    async ({ users }) => {
      const latest = users.findById(user.userId);
      if (!latest || !latest.enabled) {
        throw new AppError(401, 'UNAUTHORIZED', '登录状态已失效');
      }
      if (!await comparePassword(input.currentPassword, latest.passwordHash)) {
        throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', '当前密码不正确');
      }
      users.update(latest.id, {
        ...latest,
        passwordHash,
        tokenVersion: latest.tokenVersion + 1,
        updatedAt: new Date().toISOString(),
      });
    },
  );

  await writeAuthAuditBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId: user.storeId,
    action: 'auth.password_change',
    targetType: 'user',
    targetId: user.userId,
    dataBefore: null,
    dataAfter: { sessionsInvalidated: true },
  });
}
