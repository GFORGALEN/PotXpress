import { v4 as uuidv4 } from 'uuid';
import { storeRepository } from '../repositories/store.repository.js';
import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { DEFAULT_CANVAS } from '../storage/dataInitializer.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';
import { normalizeStoreCode } from '../utils/normalization.js';

const DEFAULT_TIMEZONE = 'Pacific/Auckland';

function storeAuditSnapshot(store) {
  return {
    id: store.id,
    name: store.name,
    code: store.code,
    address: store.address,
    timezone: store.timezone,
    enabled: store.enabled,
  };
}

function toPublicStore(store) {
  const { normalizedCode, ...publicStore } = store;
  return publicStore;
}

export async function listStores(user) {
  return unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'tables.json', 'activeTimers.json'],
      writeOrder: [],
    },
    ({ stores, tables, activeTimers }) => {
      const visibleStores = user.role === 'system_admin'
        ? stores.find()
        : stores.find((store) => store.id === user.storeId);

      return visibleStores.map((store) => ({
        ...toPublicStore(store),
        tableCount: tables.findByStoreId(store.id).length,
        activeTimerCount: activeTimers.findByStoreId(store.id).length,
      }));
    },
  );
}

export async function getStore(storeId) {
  const store = await storeRepository.findById(storeId);

  if (!store) {
    throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  }

  return toPublicStore(store);
}

export async function createStore(input, user) {
  const timestamp = new Date().toISOString();
  const code = input.code.trim().toUpperCase();
  const normalizedCode = normalizeStoreCode(code);
  const store = {
    id: `store_${uuidv4()}`,
    name: input.name.trim(),
    code,
    normalizedCode,
    address: input.address?.trim() || null,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'settings.json', 'layouts.json'],
      writeOrder: ['stores.json', 'settings.json', 'layouts.json'],
    },
    ({ stores, settings, layouts }) => {
      if (
        stores.findOne(
          (candidate) => normalizeStoreCode(candidate.code) === normalizedCode,
        )
      ) {
        throw new AppError(409, 'STORE_CODE_TAKEN', '门店 code 已存在');
      }

      stores.create(store);
      settings.create({
        storeId: store.id,
        defaultDurationMinutes: 90,
        warningThresholdMinutes: 10,
        timezone: store.timezone,
        soundEnabled: true,
        updatedAt: timestamp,
      });
      layouts.create({
        storeId: store.id,
        layoutVersion: 1,
        canvas: { ...DEFAULT_CANVAS },
        updatedAt: timestamp,
        updatedBy: user.userId,
      });
    },
  );

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId: store.id,
    action: 'store.create',
    targetType: 'store',
    targetId: store.id,
    dataBefore: null,
    dataAfter: storeAuditSnapshot(store),
  });

  return toPublicStore(store);
}

export async function updateStore(storeId, input, user) {
  let before;
  let updated;

  await unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'settings.json'],
      writeOrder: ['stores.json', 'settings.json'],
    },
    ({ stores, settings }) => {
      const current = stores.findById(storeId);

      if (!current) {
        throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
      }

      before = structuredClone(current);
      const timestamp = new Date().toISOString();
      updated = stores.update(storeId, {
        ...current,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.address !== undefined
          ? { address: input.address?.trim() || null }
          : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: timestamp,
      });

      if (input.timezone !== undefined) {
        const currentSettings = settings.findById(storeId);

        if (!currentSettings) {
          throw new AppError(404, 'SETTINGS_NOT_FOUND', '门店设置不存在');
        }

        settings.update(storeId, {
          ...currentSettings,
          timezone: input.timezone,
          updatedAt: timestamp,
        });
      }
    },
  );

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action: 'store.update',
    targetType: 'store',
    targetId: storeId,
    dataBefore: storeAuditSnapshot(before),
    dataAfter: storeAuditSnapshot(updated),
  });

  return toPublicStore(updated);
}
