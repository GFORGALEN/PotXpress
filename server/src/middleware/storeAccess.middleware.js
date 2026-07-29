import { storeRepository } from '../repositories/store.repository.js';
import { AppError } from '../utils/appError.js';

export async function storeAccess(req, res, next) {
  try {
    const { storeId } = req.params;
    const store = await storeRepository.findById(storeId);

    if (!store) {
      throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
    }

    if (
      req.user.role !== 'system_admin'
      && req.user.storeId !== storeId
    ) {
      throw new AppError(403, 'STORE_FORBIDDEN', '无权访问该门店');
    }

    if (!store.enabled && req.user.role !== 'system_admin') {
      throw new AppError(403, 'STORE_DISABLED', '门店已停用');
    }

    req.store = store;
    next();
  } catch (error) {
    next(error);
  }
}
