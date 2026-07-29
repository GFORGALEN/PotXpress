import { unitOfWorkRepository } from '../repositories/unitOfWork.repository.js';
import { AppError } from '../utils/appError.js';
import { buildRecordsCsv } from '../utils/csv.js';
import { formatDateInTimezone } from '../utils/dateTime.js';

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
}

export const recordService = new RecordService();
