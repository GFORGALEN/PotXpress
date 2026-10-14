import { databaseStore } from '../storage/databaseStore.js';

const REPOSITORY_DEFINITIONS = Object.freeze({
  stores: { filename: 'stores.json', idField: 'id' },
  users: { filename: 'users.json', idField: 'id' },
  tables: { filename: 'tables.json', idField: 'id' },
  tableGroups: { filename: 'tableGroups.json', idField: 'id' },
  activeTimers: { filename: 'activeTimers.json', idField: 'id' },
  records: { filename: 'records.json', idField: 'id' },
  timerInterventionRecords: {
    filename: 'timerInterventionRecords.json',
    idField: 'id',
  },
  settings: { filename: 'settings.json', idField: 'storeId' },
  auditLogs: { filename: 'auditLogs.json', idField: 'id' },
  layouts: { filename: 'layouts.json', idField: 'storeId' },
  idempotencyKeys: { filename: 'idempotencyKeys.json', idField: 'id' },
  realtimeEvents: { filename: 'realtimeEvents.json', idField: 'id' },
});

class TransactionRepository {
  constructor(records, idField) {
    this.records = records;
    this.idField = idField;
  }

  find(predicate = () => true) {
    return this.records.filter(predicate);
  }

  findOne(predicate) {
    return this.records.find(predicate) ?? null;
  }

  findById(id) {
    return this.findOne((record) => record[this.idField] === id);
  }

  findByStoreId(storeId) {
    return this.find((record) => record.storeId === storeId);
  }

  create(record) {
    this.records.push(record);
    return record;
  }

  update(id, updater) {
    const index = this.records.findIndex((record) => record[this.idField] === id);

    if (index === -1) {
      return null;
    }

    const current = this.records[index];
    const next = typeof updater === 'function'
      ? updater(structuredClone(current))
      : { ...current, ...updater };
    this.records[index] = next;
    return next;
  }

  delete(id) {
    const index = this.records.findIndex((record) => record[this.idField] === id);

    if (index === -1) {
      return null;
    }

    return this.records.splice(index, 1)[0];
  }
}

class UnitOfWorkRepository {
  /**
   * @param {object} options
   * @param {string[]} options.resources 事务需要读取的资源
   * @param {string[]} [options.writeOrder] 需要写回的资源；为空表示只读事务
   * @param {string[]} [options.skipRead] 只追加、不需要读取的资源（如审计日志）
   * @param {object} [options.readScopes] 每个资源的 SQL 读取范围；历史表必填
   * @param {string} [options.storeId] 写事务只锁定该门店；省略时锁定全局
   */
  async run({
    resources,
    writeOrder = [],
    skipRead = [],
    readScopes = {},
    storeId = null,
  }, callback) {
    const lockFiles = resources.map((name) => {
      const definition = REPOSITORY_DEFINITIONS[name];

      if (!definition) {
        throw new Error(`未知的 unit of work 资源：${name}`);
      }

      return definition.filename;
    });
    const writeFiles = writeOrder.map((name) => {
      const definition = REPOSITORY_DEFINITIONS[name];

      if (!definition) {
        throw new Error(`未知的 unit of work 写资源：${name}`);
      }

      return definition.filename;
    });
    const skipReadFiles = skipRead.map((name) => {
      const definition = REPOSITORY_DEFINITIONS[name];

      if (!definition) {
        throw new Error(`未知的 unit of work 跳读资源：${name}`);
      }

      if (!writeOrder.includes(name)) {
        throw new Error(`跳读资源 ${name} 必须同时包含在 writeOrder 中`);
      }

      return definition.filename;
    });
    const readScopeFiles = Object.fromEntries(
      Object.entries(readScopes).map(([name, scope]) => {
        const definition = REPOSITORY_DEFINITIONS[name];

        if (!definition) {
          throw new Error(`未知的 unit of work 查询范围资源：${name}`);
        }
        if (!resources.includes(name)) {
          throw new Error(`查询范围资源 ${name} 必须同时包含在 resources 中`);
        }

        return [definition.filename, scope];
      }),
    );

    return databaseStore.withFiles(
      lockFiles,
      async (drafts) => {
        const repositories = {};

        for (const [name, definition] of Object.entries(REPOSITORY_DEFINITIONS)) {
          if (!Object.prototype.hasOwnProperty.call(drafts, definition.filename)) {
            continue;
          }

          repositories[name] = new TransactionRepository(
            drafts[definition.filename],
            definition.idField,
          );
        }

        const result = await callback(repositories);
        return { data: drafts, result };
      },
      {
        writeOrder: writeFiles,
        skipRead: skipReadFiles,
        readScopes: readScopeFiles,
        lockScope: storeId ? { storeId } : null,
      },
    );
  }
}

export const unitOfWorkRepository = new UnitOfWorkRepository();
