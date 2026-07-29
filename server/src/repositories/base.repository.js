import { fileStore } from '../storage/fileStore.js';
import { AppError } from '../utils/appError.js';

export class BaseRepository {
  constructor(filename, { idField = 'id', notFoundCode = 'RECORD_NOT_FOUND' } = {}) {
    this.filename = filename;
    this.idField = idField;
    this.notFoundCode = notFoundCode;
  }

  async find(predicate = () => true) {
    const records = await fileStore.readJSON(this.filename);
    return records.filter(predicate);
  }

  async findById(id) {
    const records = await fileStore.readJSON(this.filename);
    return records.find((record) => record[this.idField] === id) ?? null;
  }

  async create(record) {
    await fileStore.updateJSON(this.filename, (records) => {
      records.push(record);
    });
    return record;
  }

  async update(id, updater) {
    return fileStore.updateJSON(this.filename, async (records) => {
      const index = records.findIndex((record) => record[this.idField] === id);

      if (index === -1) {
        throw new AppError(404, this.notFoundCode, '记录不存在');
      }

      const current = records[index];
      const draft = structuredClone(current);
      const outcome = typeof updater === 'function'
        ? await updater(draft)
        : { ...current, ...updater };
      const next = outcome === undefined ? draft : outcome;
      records[index] = next;
      return { data: records, result: next };
    });
  }

  async delete(id) {
    return fileStore.updateJSON(this.filename, (records) => {
      const index = records.findIndex((record) => record[this.idField] === id);

      if (index === -1) {
        throw new AppError(404, this.notFoundCode, '记录不存在');
      }

      const [deleted] = records.splice(index, 1);
      return { data: records, result: deleted };
    });
  }
}
