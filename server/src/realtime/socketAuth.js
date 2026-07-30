import { storeRepository } from '../repositories/store.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';

export async function authorizeRealtimeSubscription({ token, storeId }) {
  if (!token || !storeId) {
    throw new AppError(401, 'UNAUTHORIZED', '实时连接缺少鉴权信息');
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw new AppError(401, 'TOKEN_EXPIRED', '登录已过期，请重新登录');
    }
    throw new AppError(401, 'UNAUTHORIZED', '登录状态无效');
  }

  const user = await userRepository.findById(payload.userId);
  if (
    !user
    || !user.enabled
    || user.tokenVersion !== payload.tokenVersion
  ) {
    throw new AppError(401, 'UNAUTHORIZED', '登录状态已失效');
  }

  const store = await storeRepository.findById(storeId);
  if (!store) {
    throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  }
  if (user.role !== 'system_admin' && user.storeId !== storeId) {
    throw new AppError(403, 'STORE_FORBIDDEN', '无权订阅该门店');
  }
  if (!store.enabled && user.role !== 'system_admin') {
    throw new AppError(403, 'STORE_DISABLED', '门店已停用');
  }

  return {
    user: {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      storeId: user.storeId,
    },
    store,
  };
}
