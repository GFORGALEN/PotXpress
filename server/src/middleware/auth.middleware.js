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

  try {
    const payload = verifyToken(token);
    const user = await userRepository.findById(payload.userId);

    if (
      !user
      || !user.enabled
      || user.tokenVersion !== payload.tokenVersion
    ) {
      throw new AppError(401, 'UNAUTHORIZED', '登录状态已失效');
    }

    if (user.role !== 'system_admin') {
      const store = await storeRepository.findById(user.storeId);

      if (!store || !store.enabled) {
        throw new AppError(401, 'UNAUTHORIZED', '登录状态已失效');
      }
    }

    req.user = {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      storeId: user.storeId,
    };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (error?.name === 'TokenExpiredError') {
      return next(new AppError(401, 'TOKEN_EXPIRED', '登录已过期，请重新登录'));
    }

    return next(new AppError(401, 'UNAUTHORIZED', '登录状态无效'));
  }
}
