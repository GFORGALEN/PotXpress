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
    const epsilon = 0.01;

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
      width < canvas.minTableWidth - epsilon
      || width > canvas.maxTableWidth + epsilon
      || height < canvas.minTableHeight - epsilon
      || height > canvas.maxTableHeight + epsilon
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
      resources: ['layouts', 'tables', 'tableGroups'],
      writeOrder: [],
    },
    ({ layouts, tables, tableGroups }) => {
      const layout = getLayoutOrThrow(layouts, storeId);
      const storeTables = tables.findByStoreId(storeId)
        .sort(
          (left, right) => (
            left.sortOrder - right.sortOrder || left.number - right.number
          ),
        );
      const groups = tableGroups.findByStoreId(storeId)
        .filter((group) => group.enabled);
      const groupByTableId = new Map(
        groups.flatMap((group) => (
          group.tableIds.map((tableId) => [tableId, group])
        )),
      );

      return {
        layoutVersion: layout.layoutVersion,
        canvas: layout.canvas,
        decorations: layout.decorations ?? [],
        tables: storeTables.map((table) => ({
          tableId: table.id,
          name: table.name,
          number: table.number,
          enabled: table.enabled,
          sortOrder: table.sortOrder,
          shape: table.shape,
          capacity: table.capacity,
          area: table.area,
          note: table.note,
          defaultDurationMinutes: table.defaultDurationMinutes,
          groupId: groupByTableId.get(table.id)?.id ?? null,
          groupName: groupByTableId.get(table.id)?.name ?? null,
          groupType: groupByTableId.get(table.id)?.type ?? null,
          layout: table.layout,
        })),
        groups,
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
      resources: [
        'stores',
        'layouts',
        'tables',
        'activeTimers',
        'tableGroups',
        'records',
      ],
      writeOrder: ['tables', 'layouts'],
    },
    ({
      stores,
      layouts,
      tables,
      activeTimers,
      tableGroups,
      records,
    }) => {
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
      const deletedTableIds = [...new Set(input.deletedTableIds ?? [])];
      const deletedIdSet = new Set(deletedTableIds);
      const deletedTables = deletedTableIds.map((tableId) => (
        storeTables.find((table) => table.id === tableId)
      ));

      if (deletedTables.some((table) => !table)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          '待删除桌台不存在或不属于当前门店',
          { deletedTableIds },
        );
      }

      const activeTableIds = new Set(
        activeTimers.findByStoreId(storeId).flatMap(
          (timer) => timer.memberTableIds ?? [timer.tableId],
        ),
      );
      const groupedTableIds = new Set(
        tableGroups.findByStoreId(storeId)
          .filter((group) => group.enabled)
          .flatMap((group) => group.tableIds),
      );
      const recordedTableIds = new Set(
        records.findByStoreId(storeId).flatMap(
          (record) => record.memberTableIds ?? [record.tableId],
        ),
      );
      const blockedActive = deletedTableIds.filter((id) => activeTableIds.has(id));
      const blockedGrouped = deletedTableIds.filter((id) => groupedTableIds.has(id));
      const blockedHistory = deletedTableIds.filter((id) => recordedTableIds.has(id));

      if (blockedActive.length) {
        throw new AppError(409, 'TABLE_HAS_ACTIVE_TIMER', '待删除桌台正在计时，请先重置清台', {
          tableIds: blockedActive,
        });
      }
      if (blockedGrouped.length) {
        throw new AppError(409, 'TABLE_IN_GROUP', '待删除桌台属于拼桌组，请先解除拼桌', {
          tableIds: blockedGrouped,
        });
      }
      if (blockedHistory.length) {
        throw new AppError(409, 'TABLE_HAS_HISTORY', '已有计时历史的桌台只能停用，不能永久删除', {
          tableIds: blockedHistory,
        });
      }

      const remainingTables = storeTables.filter((table) => !deletedIdSet.has(table.id));
      const nextCanvas = {
        ...currentLayout.canvas,
        ...input.canvas,
      };

      if (
        nextCanvas.minTableWidth > nextCanvas.maxTableWidth
        || nextCanvas.minTableHeight > nextCanvas.maxTableHeight
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          '画布桌台尺寸约束不合法：最小值不能大于最大值',
        );
      }

      validateSubmittedTables(input.tables, remainingTables, nextCanvas);
      const submittedById = new Map(
        input.tables.map((item) => [item.tableId, item.layout]),
      );
      const timestamp = new Date().toISOString();

      for (const tableId of deletedTableIds) {
        tables.delete(tableId);
      }

      for (const table of remainingTables) {
        tables.update(table.id, {
          ...table,
          layout: submittedById.get(table.id),
          updatedAt: timestamp,
        });
      }

      before = {
        layoutVersion: currentLayout.layoutVersion,
        canvas: currentLayout.canvas,
        decorations: currentLayout.decorations ?? [],
        tableCount: storeTables.length,
        deletedTableIds: [],
      };
      savedVersion = currentLayout.layoutVersion + 1;
      layouts.update(storeId, {
        ...currentLayout,
        layoutVersion: savedVersion,
        canvas: nextCanvas,
        decorations: input.decorations,
        updatedAt: timestamp,
        updatedBy: user.userId,
      });
      after = {
        layoutVersion: savedVersion,
        canvas: nextCanvas,
        decorations: input.decorations,
        tableCount: remainingTables.length,
        deletedTableIds,
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
