import { settingRepository } from '../repositories/setting.repository.js';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';

export async function getSettings(storeId) {
  const settings = await settingRepository.findByStoreId(storeId);

  if (!settings) {
    throw new AppError(404, 'SETTINGS_NOT_FOUND', '门店设置不存在');
  }

  return settings;
}

export async function updateSettings(storeId, input, user) {
  let before;
  let updated;

  await unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'settings.json'],
      writeOrder: ['settings.json'],
    },
    ({ stores, settings }) => {
      const store = stores.findById(storeId);

      if (!store) {
        throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
      }

      if (!store.enabled) {
        throw new AppError(
          403,
          'STORE_DISABLED',
          '门店已停用，不能修改业务数据',
        );
      }

      const current = settings.findById(storeId);

      if (!current) {
        throw new AppError(404, 'SETTINGS_NOT_FOUND', '门店设置不存在');
      }

      before = structuredClone(current);
      updated = settings.update(storeId, {
        ...current,
        ...input,
        updatedAt: new Date().toISOString(),
      });
    },
  );

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action: 'settings.update',
    targetType: 'settings',
    targetId: storeId,
    dataBefore: before,
    dataAfter: updated,
  });

  return updated;
}
