import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
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

function filterRecords(records, {
  storeId,
  date,
  tableId,
  timezone,
}) {
  return records.find((record) => (
    record.storeId === storeId
    && (!tableId || record.tableId === tableId)
    && formatDateInTimezone(record.startTime, timezone) === date
  )).sort(
    (left, right) => Date.parse(right.startTime) - Date.parse(left.startTime),
  );
}

export class RecordService {
  constructor({ nowProvider = Date.now } = {}) {
    this.nowProvider = nowProvider;
  }

  setNowProvider(nowProvider) {
    this.nowProvider = nowProvider;
  }

  async list(storeId, query) {
    const now = this.nowProvider();

    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'records'],
        writeOrder: [],
      },
      ({ stores, records }) => {
        const store = getStoreOrThrow(stores, storeId);
        const date = query.date ?? formatDateInTimezone(now, store.timezone);

        return {
          date,
          records: filterRecords(records, {
            storeId,
            date,
            tableId: query.tableId,
            timezone: store.timezone,
          }),
        };
      },
    );
  }

  async getById(storeId, recordId) {
    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'records'],
        writeOrder: [],
      },
      ({ stores, records }) => {
        getStoreOrThrow(stores, storeId);
        const record = records.findById(recordId);

        if (!record || record.storeId !== storeId) {
          throw new AppError(404, 'RECORD_NOT_FOUND', '计时记录不存在');
        }

        return record;
      },
    );
  }

  async deleteRecords(storeId, recordIds, user) {
    const deleted = await unitOfWorkRepository.run(
      {
        resources: ['stores', 'records'],
        writeOrder: ['records'],
      },
      ({ stores, records }) => {
        getStoreOrThrow(stores, storeId);
        const uniqueIds = [...new Set(recordIds)];
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

    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'records'],
        writeOrder: [],
      },
      ({ stores, records }) => {
        const store = getStoreOrThrow(stores, storeId);
        const date = query.date ?? formatDateInTimezone(now, store.timezone);
        const filtered = filterRecords(records, {
          storeId,
          date,
          tableId: null,
          timezone: store.timezone,
        });

        return {
          date,
          csv: buildRecordsCsv(filtered, store.timezone),
        };
      },
    );
  }

  async listAuditLogs(storeId, query) {
    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'auditLogs'],
        writeOrder: [],
      },
      ({ stores, auditLogs }) => {
        const store = getStoreOrThrow(stores, storeId);
        const logs = auditLogs.find((entry) => (
          entry.storeId === storeId
          && (!query.action || entry.action === query.action)
          && (
            !query.date
            || formatDateInTimezone(entry.timestamp, store.timezone) === query.date
          )
        )).sort(
          (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
        );

        return logs.slice(0, query.limit);
      },
    );
  }

  async deleteAuditLog(storeId, logId) {
    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'auditLogs'],
        writeOrder: ['auditLogs'],
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
    return unitOfWorkRepository.run(
      {
        resources: ['stores', 'auditLogs'],
        writeOrder: ['auditLogs'],
      },
      ({ stores, auditLogs }) => {
        getStoreOrThrow(stores, storeId);
        const uniqueIds = [...new Set(logIds)];
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
