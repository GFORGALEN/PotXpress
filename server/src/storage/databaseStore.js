import { AppError } from '../utils/appError.js';
import { config } from '../config.js';
import {
  DATABASE_RESOURCES,
  databasePool,
  initializeDatabase,
  readResource,
  replaceResource,
  syncResourceChanges,
} from './database.js';

function cloneData(value) {
  return structuredClone(value);
}

function serialize(value) {
  return JSON.stringify(value);
}

function definitionFor(filename) {
  const definition = DATABASE_RESOURCES[filename];

  if (!definition) {
    throw new Error(`未知的数据库资源：${filename}`);
  }

  return definition;
}

export class DatabaseStore {
  constructor({ faultInjector = null } = {}) {
    this.lockTails = new Map();
    this.status = 'starting';
    this.fatalError = null;
    this.faultInjector = faultInjector;
  }

  getStatus() {
    return this.fatalError ? 'fatal' : this.status;
  }

  getFatalError() {
    return this.fatalError;
  }

  setFaultInjector(faultInjector) {
    this.faultInjector = faultInjector;
  }

  async initStorage() {
    try {
      await initializeDatabase();
      const metadata = await this.readJSON('metadata.json');

      if (!metadata) {
        await this.updateJSON('metadata.json', () => ({
          schemaVersion: 6,
          updatedAt: new Date().toISOString(),
        }));
      }
      this.status = 'ok';
    } catch (error) {
      this.fatalError = error;
      this.status = 'fatal';
      throw error;
    }
  }

  async recoverTransactions() {
    // PostgreSQL guarantees transaction recovery.
  }

  async readWithClient(client, filename, { forUpdate = false } = {}) {
    definitionFor(filename);
    return readResource(client, filename, { forUpdate });
  }

  async lockResourcesWithClient(client, filenames) {
    const resources = [...new Set(filenames)].sort();

    if (resources.length === 0) {
      return;
    }

    const placeholders = resources.map((_, index) => `$${index + 1}`).join(', ');
    const valuesTuples = resources.map((_, index) => `($${index + 1})`).join(', ');

    await client.query(
      `INSERT INTO resource_locks (resource_name)
       VALUES ${valuesTuples}
       ON CONFLICT (resource_name) DO NOTHING`,
      resources,
    );
    await client.query(
      `SELECT resource_name
       FROM resource_locks
       WHERE resource_name IN (${placeholders})
       ORDER BY resource_name
       FOR UPDATE`,
      resources,
    );
  }

  async readJSON(filename) {
    return this.withLocks([filename], async () => {
      const client = await databasePool.connect();
      try {
        return cloneData(await this.readWithClient(client, filename));
      } finally {
        client.release();
      }
    });
  }

  async replaceWithClient(
    client,
    filename,
    value,
    { injectFault = true } = {},
  ) {
    definitionFor(filename);

    if (injectFault && this.faultInjector) {
      await this.faultInjector({
        stage: 'before_replace',
        filename,
      });
    }

    return replaceResource(client, filename, value);
  }

  async syncWithClient(client, filename, before, after) {
    definitionFor(filename);
    if (this.faultInjector) {
      await this.faultInjector({
        stage: 'before_replace',
        filename,
      });
    }
    return syncResourceChanges(client, filename, before, after);
  }

  async updateJSON(filename, updater) {
    return this.withFiles(
      [filename],
      async (drafts) => {
        const current = drafts[filename];
        const outcome = await updater(current);
        const hasEnvelope = outcome
          && typeof outcome === 'object'
          && Object.prototype.hasOwnProperty.call(outcome, 'data');

        if (hasEnvelope) {
          drafts[filename] = outcome.data;
          return outcome.result;
        }

        if (outcome !== undefined) {
          drafts[filename] = outcome;
        }
        return drafts[filename];
      },
      { writeOrder: [filename] },
    );
  }

  async withFiles(filenames, updater, { writeOrder = [], skipRead = [] } = {}) {
    const resources = [...new Set(filenames)].sort();
    resources.forEach(definitionFor);
    writeOrder.forEach((filename) => {
      if (!resources.includes(filename)) {
        throw new Error(`writeOrder 中的 ${filename} 未包含在事务资源中`);
      }
    });
    skipRead.forEach((filename) => {
      if (!writeOrder.includes(filename)) {
        throw new Error(`skipRead 中的 ${filename} 必须同时包含在 writeOrder 中`);
      }
      if (!definitionFor(filename).idField) {
        throw new Error(`skipRead 只支持数组型资源：${filename}`);
      }
    });

    return this.withLocks(resources, async () => {
      const client = await databasePool.connect();
      let before = null;
      let afterSnapshot = null;

      try {
        await client.query(
          writeOrder.length === 0 && !config.useMemoryDatabase
            ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
            : 'BEGIN',
        );
        if (writeOrder.length > 0) {
          await this.lockResourcesWithClient(client, resources);
        }
        before = {};

        for (const filename of resources) {
          // skipRead 资源在本事务中只做追加（create），跳过全表读取，
          // 避免随数据量增长的全表 SELECT * 和网络传输开销。
          if (skipRead.includes(filename)) {
            before[filename] = [];
            continue;
          }

          before[filename] = await this.readWithClient(
            client,
            filename,
            { forUpdate: writeOrder.includes(filename) },
          );
        }

        const drafts = cloneData(before);
        const outcome = await updater(drafts);
        const hasEnvelope = outcome
          && typeof outcome === 'object'
          && Object.prototype.hasOwnProperty.call(outcome, 'data');
        const after = hasEnvelope
          ? { ...drafts, ...outcome.data }
          : drafts;
        afterSnapshot = after;
        const result = hasEnvelope ? outcome.result : outcome;

        for (const filename of writeOrder) {
          if (serialize(before[filename]) !== serialize(after[filename])) {
            await this.syncWithClient(
              client,
              filename,
              before[filename],
              after[filename],
            );
          }
        }

        if (this.faultInjector) {
          await this.faultInjector({
            stage: 'before_commit',
            filenames: resources,
            writeOrder,
          });
        }

        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});

        // pg-mem does not fully emulate PostgreSQL transaction rollback.
        // Restore the captured snapshot only in the in-memory test adapter.
        if (config.useMemoryDatabase && before) {
          await client.query('BEGIN');
          try {
            for (const filename of [...writeOrder].reverse()) {
              // skipRead 资源的 before 是空数组快照，不能用 replace 恢复
              // （会清空整表）；改为把本事务追加的记录同步删除。
              if (skipRead.includes(filename)) {
                if (afterSnapshot) {
                  await this.syncWithClient(
                    client,
                    filename,
                    afterSnapshot[filename],
                    before[filename],
                  );
                }
                continue;
              }

              await this.replaceWithClient(
                client,
                filename,
                before[filename],
                { injectFault: false },
              );
            }
            await client.query('COMMIT');
          } catch (restoreError) {
            await client.query('ROLLBACK').catch(() => {});
            restoreError.cause = error;
            throw restoreError;
          }
        }

        throw error;
      } finally {
        client.release();
      }
    });
  }

  async withLocks(filenames, action, index = 0) {
    if (index >= filenames.length) return action();
    return this.withSingleLock(
      filenames[index],
      () => this.withLocks(filenames, action, index + 1),
    );
  }

  async withSingleLock(filename, action) {
    const previous = this.lockTails.get(filename) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => gate);
    this.lockTails.set(filename, tail);
    await previous.catch(() => {});

    try {
      if (this.fatalError) {
        throw new AppError(503, 'STORAGE_FATAL', '数据库存储不可用');
      }
      return await action();
    } finally {
      release();
      if (this.lockTails.get(filename) === tail) {
        this.lockTails.delete(filename);
      }
    }
  }

  async drain() {
    await Promise.all([...this.lockTails.values()].map((tail) => tail.catch(() => {})));
  }
}

export const databaseStore = new DatabaseStore();
