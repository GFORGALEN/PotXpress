import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';

function getLayoutOrThrow(layouts, storeId) {
  const layout = layouts.findById(storeId);

  if (!layout) {
    throw new AppError(404, 'LAYOUT_NOT_FOUND', '门店布局不存在');
  }

  return layout;
}

function validateSubmittedTables(submittedTables, currentTables, canvas) {
  const submittedIds = new Set();

  for (const item of submittedTables) {
    if (submittedIds.has(item.tableId)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '布局中不能重复提交同一桌台',
        { tableId: item.tableId },
      );
    }
    submittedIds.add(item.tableId);
  }

  const currentIds = new Set(currentTables.map((table) => table.id));
  const missingTableIds = [...currentIds].filter((id) => !submittedIds.has(id));
  const unknownTableIds = [...submittedIds].filter((id) => !currentIds.has(id));

  if (missingTableIds.length > 0 || unknownTableIds.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      '提交的桌台集合必须与门店当前全部桌台完全一致',
      { missingTableIds, unknownTableIds },
    );
  }

  for (const item of submittedTables) {
    const { layout } = item;
    const width = layout.widthRatio * canvas.virtualWidth;
    const height = layout.heightRatio * canvas.virtualHeight;

    if (
      layout.xRatio + layout.widthRatio > 1.000001
      || layout.yRatio + layout.heightRatio > 1.000001
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '桌台布局不能超出画布边界',
        { tableId: item.tableId },
      );
    }

    if (
      width < canvas.minTableWidth
      || width > canvas.maxTableWidth
      || height < canvas.minTableHeight
      || height > canvas.maxTableHeight
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '桌台尺寸超出允许范围',
        { tableId: item.tableId },
      );
    }
  }
}

export async function getLayout(storeId) {
  return unitOfWorkRepository.run(
    {
      lockFiles: ['layouts.json', 'tables.json'],
      writeOrder: [],
    },
    ({ layouts, tables }) => {
      const layout = getLayoutOrThrow(layouts, storeId);
      const storeTables = tables.findByStoreId(storeId)
        .sort(
          (left, right) => (
            left.sortOrder - right.sortOrder || left.number - right.number
          ),
        );

      return {
        layoutVersion: layout.layoutVersion,
        canvas: layout.canvas,
        tables: storeTables.map((table) => ({
          tableId: table.id,
          name: table.name,
          number: table.number,
          enabled: table.enabled,
          sortOrder: table.sortOrder,
          layout: table.layout,
        })),
      };
    },
  );
}

export async function saveLayout(storeId, input, user) {
  let savedVersion;
  let before;
  let after;

  await unitOfWorkRepository.run(
    {
      lockFiles: ['stores.json', 'layouts.json', 'tables.json'],
      writeOrder: ['tables.json', 'layouts.json'],
    },
    ({ stores, layouts, tables }) => {
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

      const currentLayout = getLayoutOrThrow(layouts, storeId);

      if (currentLayout.layoutVersion !== input.layoutVersion) {
        throw new AppError(
          409,
          'LAYOUT_CONFLICT',
          '布局已被其他用户更新，请刷新后重试',
          {
            serverVersion: currentLayout.layoutVersion,
            serverUpdatedBy: currentLayout.updatedBy,
            serverUpdatedAt: currentLayout.updatedAt,
          },
        );
      }

      const storeTables = tables.findByStoreId(storeId);
      const nextCanvas = {
        ...currentLayout.canvas,
        ...input.canvas,
      };
      validateSubmittedTables(input.tables, storeTables, nextCanvas);
      const submittedById = new Map(
        input.tables.map((item) => [item.tableId, item.layout]),
      );
      const timestamp = new Date().toISOString();

      for (const table of storeTables) {
        tables.update(table.id, {
          ...table,
          layout: submittedById.get(table.id),
          updatedAt: timestamp,
        });
      }

      before = {
        layoutVersion: currentLayout.layoutVersion,
        canvas: currentLayout.canvas,
        tableCount: storeTables.length,
      };
      savedVersion = currentLayout.layoutVersion + 1;
      layouts.update(storeId, {
        ...currentLayout,
        layoutVersion: savedVersion,
        canvas: nextCanvas,
        updatedAt: timestamp,
        updatedBy: user.userId,
      });
      after = {
        layoutVersion: savedVersion,
        canvas: nextCanvas,
        tableCount: storeTables.length,
      };
    },
  );

  await writeAuditLogBestEffort({
    userId: user.userId,
    userNameSnapshot: user.displayName,
    storeId,
    action: 'layout.save',
    targetType: 'layout',
    targetId: storeId,
    dataBefore: before,
    dataAfter: after,
  });

  return { layoutVersion: savedVersion };
}
