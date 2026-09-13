import { userRepository } from '../repositories/user.repository.js';
import { storeRepository } from '../repositories/store.repository.js';
import { AppError } from '../utils/appError.js';
import { verifyToken } from '../utils/jwt.js';

export async function authenticate(req, res, next) {
  const authorization = req.get('Authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', '请先登录'));
  }

  const token = authorization.slice('Bearer '.length).trim();

  if (!token) {
    return next(new AppError(401, 'UNAUTHORIZED', '请先登录'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return next(new AppError(401, 'TOKEN_EXPIRED', '登录已过期，请重新登录'));
    }

    return next(new AppError(401, 'UNAUTHORIZED', '登录状态无效'));
  }

  // Keep storage access outside the JWT parsing catch. A database timeout is a
  // temporary server failure, not proof that the caller's token is invalid.
  // Misclassifying it as 401 makes every client discard an otherwise valid
  // session during a short database or connection-pool interruption.
  const user = await userRepository.findById(payload.userId);

  if (
    !user
    || !user.enabled
    || user.tokenVersion !== payload.tokenVersion
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', '登录状态已失效'));
  }

  if (user.role !== 'system_admin') {
    const store = await storeRepository.findById(user.storeId);

    if (!store || !store.enabled) {
      return next(new AppError(401, 'UNAUTHORIZED', '登录状态已失效'));
    }
  }

  req.user = {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    storeId: user.storeId,
    tokenVersion: user.tokenVersion,
  };
  return next();
}
