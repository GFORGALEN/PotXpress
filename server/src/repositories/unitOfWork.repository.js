import { fileStore } from '../storage/fileStore.js';

const REPOSITORY_DEFINITIONS = Object.freeze({
  stores: { filename: 'stores.json', idField: 'id' },
  users: { filename: 'users.json', idField: 'id' },
  tables: { filename: 'tables.json', idField: 'id' },
  activeTimers: { filename: 'activeTimers.json', idField: 'id' },
  records: { filename: 'records.json', idField: 'id' },
  settings: { filename: 'settings.json', idField: 'storeId' },
  auditLogs: { filename: 'auditLogs.json', idField: 'id' },
  layouts: { filename: 'layouts.json', idField: 'storeId' },
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
  async run({ lockFiles, writeOrder = [] }, callback) {
    return fileStore.withFiles(
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
      { writeOrder },
    );
  }
}

export const unitOfWorkRepository = new UnitOfWorkRepository();
