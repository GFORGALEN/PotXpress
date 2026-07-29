import { AppError } from '../utils/appError.js';

export function requireRole(...roles) {
  const allowedRoles = new Set(roles);

  return function roleMiddleware(req, res, next) {
    if (!req.user || !allowedRoles.has(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', '无权限执行此操作'));
    }

    return next();
  };
}
