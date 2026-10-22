import { AppError } from '../utils/appError.js';
import {
  acquireWriteLocks,
  canBatchResourceChanges,
  DATABASE_RESOURCES,
  databasePool,
  GROWING_RESOURCES,
  initializeDatabase,
  isConnectionLostError,
  LATEST_SCHEMA_VERSION,
  readResources,
  syncResourceChangeBatch,
  syncResourceChanges,
  withDatabaseClient,
} from './database.js';

// 服务端时间预算：必须明显小于浏览器的 15 秒等待上限，
// 让超时以明确错误返回，而不是让客户端误报"网络连接失败"。
const LOCK_TIMEOUT = '5s';
const STATEMENT_TIMEOUT = '10s';
const BUSY_ERROR_CODES = new Set([
  '55P03', // lock_not_available（lock_timeout）
  '57014', // query_canceled（statement_timeout）
]);

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

function assertBoundedRead(filename, scope) {
  if (!GROWING_RESOURCES.has(filename)) return;
  if (!scope || Object.keys(scope).length === 0) {
    throw new Error(
      `${filename} 是持续增长的历史表，读取时必须指定范围（readScopes），禁止整表读取`,
    );
  }
}

function lockKeyFor(lockScope) {
  return lockScope?.storeId ? `store:${lockScope.storeId}` : 'global';
}

function translateDatabaseError(error) {
  if (BUSY_ERROR_CODES.has(error?.code)) {
    return new AppError(503, 'DATABASE_BUSY', '系统繁忙，请稍后重试');
  }
  if (isConnectionLostError(error)) {
    // 503 不经过统一错误日志；连接中断需要留下记录便于排查数据库/连接池问题。
    console.error(`数据库连接中断：${error.message}`);
    return new AppError(503, 'DATABASE_UNAVAILABLE', '数据库暂时不可用，请稍后重试');
  }
  return error;
}

export class DatabaseStore {
  constructor({ faultInjector = null } = {}) {
    this.writeQueues = new Map();
    this.activeOperations = new Set();
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
      await this.updateJSON('metadata.json', (metadata) => (
        metadata?.schemaVersion === LATEST_SCHEMA_VERSION
          ? metadata
          : { schemaVersion: LATEST_SCHEMA_VERSION, updatedAt: new Date().toISOString() }
      ));
      this.status = 'ok';
    } catch (error) {
      this.fatalError = error;
      this.status = 'fatal';
      throw error;
    }
  }

  /** 读取一个"小而有上限"的配置资源（门店、用户、桌台等）。历史表必须用 readWhere。 */
  async readJSON(filename) {
    const result = await this.withFiles([filename], (drafts) => drafts[filename]);
    return result;
  }

  async readWhere(filename, scope) {
    return this.withFiles(
      [filename],
      (drafts) => drafts[filename],
      { readScopes: { [filename]: scope } },
    );
  }

  async readById(filename, id) {
    const value = await this.readWhere(filename, { id });
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  async updateJSON(filename, updater, { lockScope } = {}) {
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
      { writeOrder: [filename], lockScope },
    );
  }

  /**
   * 在一个数据库事务中读取所需资源快照、执行 updater，并只把差异写回。
   *
   * - 只读（writeOrder 为空）不加任何锁、不排队、不开事务：一条 SQL 读完。
   * - 写事务按 lockScope 加锁：{ storeId } 只锁该门店；{ none: true } 用于
   *   只追加、不依赖已有数据的写入（如审计日志）；省略时锁全局。
   * - 历史表（GROWING_RESOURCES）必须给出 readScopes 或放入 skipRead。
   */
  async withFiles(
    filenames,
    updater,
    {
      writeOrder = [],
      skipRead = [],
      readScopes = {},
      lockScope = null,
    } = {},
  ) {
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
    Object.keys(readScopes).forEach((filename) => {
      if (!resources.includes(filename)) {
        throw new Error(`readScopes 中的 ${filename} 未包含在事务资源中`);
      }
    });
    const readableResources = resources.filter(
      (filename) => !skipRead.includes(filename),
    );
    readableResources.forEach((filename) => (
      assertBoundedRead(filename, readScopes[filename])
    ));

    const isWrite = writeOrder.length > 0;
    const run = () => (isWrite ? this.runTransaction : this.runRead).call(this, {
      resources,
      readableResources,
      writeOrder,
      skipRead,
      readScopes,
      lockScope: isWrite ? (lockScope ?? { global: true }) : null,
      updater,
    });

    const operation = isWrite && !lockScope?.none
      ? this.withWriteQueue(lockKeyFor(lockScope), run)
      : this.guarded(run);
    this.activeOperations.add(operation);
    try {
      return await operation;
    } finally {
      this.activeOperations.delete(operation);
    }
  }

  /**
   * 只读：所有资源合并成一条 SQL，单条语句本身就是一致性快照，
   * 因此不需要 BEGIN/COMMIT，也不加锁——一次数据库往返。
   */
  async runRead({ readableResources, readScopes, updater }) {
    try {
      const snapshot = await readResources(
        databasePool,
        readableResources.map((filename) => ({
          filename,
          scope: readScopes[filename] ?? {},
        })),
      );
      const outcome = await updater(snapshot);
      const hasEnvelope = outcome
        && typeof outcome === 'object'
        && Object.prototype.hasOwnProperty.call(outcome, 'data');
      return hasEnvelope ? outcome.result : outcome;
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  async runTransaction(options) {
    try {
      return await withDatabaseClient(
        (client) => this.writeTransaction(client, options),
      );
    } catch (error) {
      throw translateDatabaseError(error);
    }
  }

  async writeTransaction(client, {
    resources,
    readableResources,
    writeOrder,
    skipRead,
    readScopes,
    lockScope,
    updater,
  }) {
    try {
      await client.query(
        `BEGIN; SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'; SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`,
      );
      if (!lockScope.none) {
        await acquireWriteLocks(client, lockScope);
      }

      const before = await readResources(
        client,
        readableResources.map((filename) => ({
          filename,
          scope: readScopes[filename] ?? {},
        })),
      );
      for (const filename of skipRead) before[filename] = [];

      const drafts = structuredClone(before);
      const outcome = await updater(drafts);
      const hasEnvelope = outcome
        && typeof outcome === 'object'
        && Object.prototype.hasOwnProperty.call(outcome, 'data');
      const after = hasEnvelope
        ? { ...drafts, ...outcome.data }
        : drafts;
      const result = hasEnvelope ? outcome.result : outcome;

      const pendingBatch = [];
      const flushBatch = async () => {
        if (pendingBatch.length === 0) return;
        await syncResourceChangeBatch(client, pendingBatch.splice(0));
      };
      for (const filename of writeOrder) {
        if (serialize(before[filename]) === serialize(after[filename])) continue;
        if (this.faultInjector) {
          await this.faultInjector({ stage: 'before_replace', filename });
        }
        if (canBatchResourceChanges(filename)) {
          pendingBatch.push({
            filename,
            before: before[filename],
            after: after[filename],
          });
          continue;
        }
        await flushBatch();
        await syncResourceChanges(
          client,
          filename,
          before[filename],
          after[filename],
        );
      }
      await flushBatch();

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
      throw error;
    }
  }

  async guarded(action) {
    if (this.fatalError) {
      throw new AppError(503, 'STORAGE_FATAL', '数据库存储不可用');
    }
    return action();
  }

  /**
   * 同一锁键的写事务在进程内排队，避免几十个请求同时占用连接池去等待同一把
   * 数据库锁。不同门店的写互不影响；只读事务完全不进入这里。
   */
  async withWriteQueue(key, action) {
    const previous = this.writeQueues.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => gate);
    this.writeQueues.set(key, tail);
    await previous.catch(() => {});

    try {
      return await this.guarded(action);
    } finally {
      release();
      if (this.writeQueues.get(key) === tail) {
        this.writeQueues.delete(key);
      }
    }
  }

  async drain() {
    await Promise.all(
      [...this.activeOperations].map((operation) => operation.catch(() => {})),
    );
  }
}

export const databaseStore = new DatabaseStore();
