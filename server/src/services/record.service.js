import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { databaseStore } from '../storage/databaseStore.js';
import { AppError } from '../utils/appError.js';
import { buildRecordsCsv } from '../utils/csv.js';
import { formatDateInTimezone } from '../utils/dateTime.js';
import { writeAuditLogBestEffort } from '../utils/audit.js';

function getStoreOrThrow(stores, storeId) {
  const store = stores.findById(storeId);

  if (!store) {
    throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
  }

  return store;
}

// 计时记录按门店本地日期查询：范围条件下推到 SQL，命中 (store_id, start_time) 索引。
function recordDayScope(storeId, { date, tableId, timezone }) {
  return {
    storeId,
    localDate: { property: 'startTime', date, timezone },
    ...(tableId ? { where: { tableId } } : {}),
    orderBy: 'startTime',
    latest: true,
  };
}

function parseAuditCursor(before) {
  const separator = before.lastIndexOf('|');
  const value = before.slice(0, separator);
  const id = before.slice(separator + 1);

  if (separator <= 0 || !id || Number.isNaN(Date.parse(value))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'before 游标格式无效');
  }

  return { value, id };
}

export class RecordService {
  constructor({ nowProvider = Date.now } = {}) {
    this.nowProvider = nowProvider;
  }

  setNowProvider(nowProvider) {
    this.nowProvider = nowProvider;
  }

  async getStore(storeId) {
    const store = await databaseStore.readById('stores.json', storeId);

    if (!store) {
      throw new AppError(404, 'STORE_NOT_FOUND', '门店不存在');
    }

    return store;
  }

  async list(storeId, query) {
    const now = this.nowProvider();
    const store = await this.getStore(storeId);
    const date = query.date ?? formatDateInTimezone(now, store.timezone);
    const records = await databaseStore.readWhere(
      'records.json',
      recordDayScope(storeId, {
        date,
        tableId: query.tableId,
        timezone: store.timezone,
      }),
    );

    return { date, records };
  }

  async getById(storeId, recordId) {
    await this.getStore(storeId);
    const [record] = await databaseStore.readWhere('records.json', {
      id: recordId,
      storeId,
    });

    if (!record) {
      throw new AppError(404, 'RECORD_NOT_FOUND', '计时记录不存在');
    }

    return record;
  }

  async listTimerInterventions(storeId, query) {
    const now = this.nowProvider();
    const store = await this.getStore(storeId);
    const date = query.date ?? formatDateInTimezone(now, store.timezone);
    const records = await databaseStore.readWhere('timerInterventionRecords.json', {
      storeId,
      localDate: { property: 'createdAt', date, timezone: store.timezone },
      ...(query.action ? { where: { action: query.action } } : {}),
      ...(query.tableId
        ? { jsonContains: { property: 'memberTableIds', value: query.tableId } }
        : {}),
      orderBy: 'createdAt',
      latest: true,
    });

    return { date, records };
  }

  async deleteRecords(storeId, recordIds, user) {
    const uniqueIds = [...new Set(recordIds)];
    const deleted = await unitOfWorkRepository.run(
      {
        resources: ['stores', 'records'],
        writeOrder: ['records'],
        storeId,
        readScopes: {
          stores: { id: storeId },
          records: { storeId, ids: uniqueIds },
        },
      },
      ({ stores, records }) => {
        getStoreOrThrow(stores, storeId);
        const matches = uniqueIds.map((id) => records.findById(id));

        if (matches.some((record) => !record || record.storeId !== storeId)) {
          throw new AppError(404, 'RECORD_NOT_FOUND', '部分计时记录不存在或不属于当前门店');
        }

        return matches.map((record) => records.delete(record.id));
      },
    );

    await writeAuditLogBestEffort({
      userId: user.userId,
      userNameSnapshot: user.displayName,
      storeId,
      action: deleted.length > 1 ? 'record.batch_delete' : 'record.delete',
      targetType: deleted.length > 1 ? 'record_batch' : 'record',
      targetId: deleted.length > 1 ? null : deleted[0].id,
      dataBefore: {
        count: deleted.length,
        recordIds: deleted.map((record) => record.id),
        tables: deleted.map((record) => record.tableNameSnapshot),
      },
      dataAfter: null,
    });

    return deleted;
  }

  async export(storeId, query) {
    const now = this.nowProvider();
    const store = await this.getStore(storeId);
    const date = query.date ?? formatDateInTimezone(now, store.timezone);
    const records = await databaseStore.readWhere(
      'records.json',
      recordDayScope(storeId, { date, timezone: store.timezone }),
    );

    return {
      date,
      csv: buildRecordsCsv(records, store.timezone),
    };
  }

  async listAuditLogs(storeId, query) {
    const store = await this.getStore(storeId);

    // 过滤、排序与 LIMIT 都在 SQL 中完成：返回 200 条就只读取 200 条。
    // 翻页：before=<上一页最后一条的 timestamp>|<id>。
    return databaseStore.readWhere('auditLogs.json', {
      storeId,
      ...(query.action ? { where: { action: query.action } } : {}),
      ...(query.date
        ? {
          localDate: {
            property: 'timestamp',
            date: query.date,
            timezone: store.timezone,
          },
        }
        : {}),
      orderBy: 'timestamp',
      latest: true,
      limit: query.limit,
      ...(query.before ? { before: parseAuditCursor(query.before) } : {}),
    });
  }

  async deleteAuditLog(storeId, logId) {
    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'auditLogs'],
        writeOrder: ['auditLogs'],
        storeId,
        readScopes: {
          stores: { id: storeId },
          auditLogs: { storeId, id: logId },
        },
      },
      ({ stores, auditLogs }) => {
        getStoreOrThrow(stores, storeId);
        const log = auditLogs.findById(logId);

        if (!log || log.storeId !== storeId) {
          throw new AppError(404, 'AUDIT_LOG_NOT_FOUND', '操作日志不存在');
        }

        return auditLogs.delete(logId);
      },
    );
  }

  async deleteAuditLogs(storeId, logIds) {
    const uniqueIds = [...new Set(logIds)];

    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'auditLogs'],
        writeOrder: ['auditLogs'],
        storeId,
        readScopes: {
          stores: { id: storeId },
          auditLogs: { storeId, ids: uniqueIds },
        },
      },
      ({ stores, auditLogs }) => {
        getStoreOrThrow(stores, storeId);
        const matches = uniqueIds.map((id) => auditLogs.findById(id));

        if (matches.some((log) => !log || log.storeId !== storeId)) {
          throw new AppError(404, 'AUDIT_LOG_NOT_FOUND', '部分操作日志不存在或不属于当前门店');
        }

        return matches.map((log) => auditLogs.delete(log.id));
      },
    );
  }
}

export const recordService = new RecordService();
