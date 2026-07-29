import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { AppError } from '../utils/appError.js';

export const ARRAY_DATA_FILES = Object.freeze([
  'stores.json',
  'users.json',
  'tables.json',
  'activeTimers.json',
  'records.json',
  'settings.json',
  'auditLogs.json',
  'layouts.json',
]);

export const METADATA_FILE = 'metadata.json';
const ALLOWED_DATA_FILES = new Set([...ARRAY_DATA_FILES, METADATA_FILE]);
const JOURNAL_PHASES = new Set(['prepared', 'rolling_back', 'committed']);
const TEMP_FILE_PATTERN = /\.\d+\.[0-9a-f-]+\.tmp$/i;

function serializeJSON(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function cloneData(data) {
  return structuredClone(data);
}

function checksumJournal(journal) {
  const canonical = JSON.stringify({
    phase: journal.phase,
    files: journal.files,
    writeOrder: journal.writeOrder,
    before: journal.before,
    after: journal.after,
    createdAt: journal.createdAt,
  });

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class FileStore {
  constructor({ dataDirectory = config.dataDirectory, faultInjector = null } = {}) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.backupDirectory = path.join(this.dataDirectory, 'backups');
    this.transactionDirectory = path.join(this.dataDirectory, 'transactions');
    this.lockTails = new Map();
    this.faultInjector = faultInjector;
    this.storageStatus = 'ok';
    this.fatalError = null;
  }

  getStatus() {
    return this.fatalError ? 'fatal' : this.storageStatus;
  }

  getFatalError() {
    return this.fatalError;
  }

  assertHealthyForWrite() {
    if (this.fatalError) {
      throw new AppError(
        503,
        'STORAGE_FATAL',
        '存储系统处于不可写状态，请联系管理员',
      );
    }
  }

  validateFilename(filename) {
    if (!ALLOWED_DATA_FILES.has(filename)) {
      throw new Error(`不允许的数据文件名：${filename}`);
    }
  }

  dataPath(filename) {
    this.validateFilename(filename);
    return path.join(this.dataDirectory, filename);
  }

  async initStorage() {
    await fs.mkdir(this.dataDirectory, { recursive: true });
    await fs.mkdir(this.backupDirectory, { recursive: true });
    await fs.mkdir(this.transactionDirectory, { recursive: true });

    await this.cleanTemporaryFiles(this.dataDirectory);
    await this.cleanTemporaryFiles(this.transactionDirectory);

    const existedBeforeInitialization = await Promise.all(
      ARRAY_DATA_FILES.map(async (filename) => {
        try {
          await fs.access(this.dataPath(filename));
          return true;
        } catch (error) {
          if (error.code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      }),
    );

    for (const filename of ARRAY_DATA_FILES) {
      const targetPath = this.dataPath(filename);

      try {
        await fs.access(targetPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        await this.commitDataUnlocked(filename, [], { context: 'initialization' });
      }
    }

    const metadataPath = this.dataPath(METADATA_FILE);

    try {
      await fs.access(metadataPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      await this.commitDataUnlocked(
        METADATA_FILE,
        {
          schemaVersion: existedBeforeInitialization.some(Boolean) ? 0 : 1,
          updatedAt: new Date().toISOString(),
        },
        { context: 'initialization' },
      );
    }
  }

  async cleanTemporaryFiles(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && TEMP_FILE_PATTERN.test(entry.name))
        .map((entry) => fs.rm(path.join(directory, entry.name), { force: true })),
    );
  }

  async readJSON(filename) {
    this.validateFilename(filename);

    return this.withLocks([filename], () => this.readJSONUnlocked(filename));
  }

  async readJSONUnlocked(filename) {
    const targetPath = this.dataPath(filename);

    try {
      const contents = await fs.readFile(targetPath, 'utf8');
      return JSON.parse(contents);
    } catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') {
        throw error;
      }

      return this.restoreLatestBackupUnlocked(filename, error);
    }
  }

  async restoreLatestBackupUnlocked(filename, originalError) {
    const entries = await fs.readdir(this.backupDirectory, { withFileTypes: true });
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(`${filename}.`) || !entry.name.endsWith('.bak')) {
        continue;
      }

      const backupPath = path.join(this.backupDirectory, entry.name);
      const stat = await fs.stat(backupPath);
      candidates.push({ backupPath, mtimeMs: stat.mtimeMs });
    }

    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const candidate of candidates) {
      try {
        const contents = await fs.readFile(candidate.backupPath, 'utf8');
        const parsed = JSON.parse(contents);
        await this.writeRawAtomic(this.dataPath(filename), contents);
        console.error(`已从备份恢复 ${filename}：${originalError.message}`);
        this.storageStatus = 'degraded';
        return parsed;
      } catch (backupError) {
        console.error(`跳过无效备份 ${candidate.backupPath}：${backupError.message}`);
      }
    }

    const storageError = new Error(`数据文件 ${filename} 缺失或损坏，且没有可用备份`);
    storageError.cause = originalError;
    throw storageError;
  }

  async updateJSON(filename, updater) {
    this.validateFilename(filename);
    this.assertHealthyForWrite();

    return this.withLocks([filename], async () => {
      this.assertHealthyForWrite();
      const current = await this.readJSONUnlocked(filename);
      const draft = cloneData(current);
      const outcome = await updater(draft);
      const hasEnvelope = outcome
        && typeof outcome === 'object'
        && Object.prototype.hasOwnProperty.call(outcome, 'data');
      const nextData = hasEnvelope ? outcome.data : (outcome === undefined ? draft : outcome);
      const result = hasEnvelope ? outcome.result : nextData;

      await this.commitDataUnlocked(filename, nextData, { context: 'single' });
      return result;
    });
  }

  async withFiles(lockFiles, updater, { writeOrder = [] } = {}) {
    this.assertHealthyForWrite();
    const normalizedLockFiles = [...new Set(lockFiles)].sort();

    for (const filename of normalizedLockFiles) {
      this.validateFilename(filename);
    }

    for (const filename of writeOrder) {
      if (!normalizedLockFiles.includes(filename)) {
        throw new Error(`writeOrder 中的 ${filename} 未包含在 lockFiles`);
      }
    }

    return this.withLocks(normalizedLockFiles, async () => {
      this.assertHealthyForWrite();
      const beforeAll = {};

      for (const filename of normalizedLockFiles) {
        beforeAll[filename] = await this.readJSONUnlocked(filename);
      }

      const drafts = cloneData(beforeAll);
      const outcome = await updater(drafts);
      const hasEnvelope = outcome
        && typeof outcome === 'object'
        && Object.prototype.hasOwnProperty.call(outcome, 'data');
      const afterAll = hasEnvelope
        ? { ...drafts, ...outcome.data }
        : drafts;
      const result = hasEnvelope ? outcome.result : outcome;
      const actualWriteOrder = writeOrder.filter(
        (filename) => serializeJSON(beforeAll[filename]) !== serializeJSON(afterAll[filename]),
      );

      if (actualWriteOrder.length === 0) {
        return result;
      }

      const transactionId = uuidv4();
      const journalPath = path.join(this.transactionDirectory, `${transactionId}.json`);
      const journal = this.createJournal(
        actualWriteOrder,
        beforeAll,
        afterAll,
      );

      await this.writeJournal(journalPath, journal);

      try {
        for (const filename of actualWriteOrder) {
          await this.commitDataUnlocked(filename, afterAll[filename], {
            context: 'transaction_commit',
          });
        }
      } catch (commitError) {
        await this.rollbackTransaction(journalPath, journal, commitError);
      }

      try {
        const committedJournal = { ...journal, phase: 'committed' };
        await this.writeJournal(journalPath, committedJournal);
      } catch (phaseError) {
        this.markFatal(phaseError);
        throw new AppError(
          503,
          'STORAGE_FATAL',
          '事务已写入但无法完成状态确认，服务已停止写入',
        );
      }

      try {
        await fs.rm(journalPath);
      } catch (cleanupError) {
        this.markDegraded(`无法清理已提交事务 ${transactionId}`, cleanupError);
      }

      return result;
    });
  }

  createJournal(writeOrder, beforeAll, afterAll) {
    const journal = {
      phase: 'prepared',
      files: [...writeOrder],
      writeOrder: [...writeOrder],
      before: Object.fromEntries(
        writeOrder.map((filename) => [filename, beforeAll[filename]]),
      ),
      after: Object.fromEntries(
        writeOrder.map((filename) => [filename, afterAll[filename]]),
      ),
      createdAt: new Date().toISOString(),
    };

    return {
      ...journal,
      checksum: checksumJournal(journal),
    };
  }

  async rollbackTransaction(journalPath, journal, commitError) {
    let rollbackJournal;

    try {
      rollbackJournal = { ...journal, phase: 'rolling_back' };
      await this.writeJournal(journalPath, rollbackJournal);
    } catch (journalError) {
      this.markFatal(journalError);
      throw new AppError(
        503,
        'STORAGE_FATAL',
        '事务失败且无法记录回滚状态，服务已停止写入',
      );
    }

    try {
      for (const filename of [...journal.writeOrder].reverse()) {
        await this.commitDataUnlocked(filename, journal.before[filename], {
          context: 'transaction_rollback',
        });
      }
      await fs.rm(journalPath, { force: true });
    } catch (rollbackError) {
      this.markFatal(rollbackError);
      throw new AppError(
        503,
        'STORAGE_FATAL',
        '事务回滚未完成，服务已停止写入',
      );
    }

    throw commitError;
  }

  async recoverTransactions() {
    const entries = await fs.readdir(this.transactionDirectory, { withFileTypes: true });
    const journals = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const journalPath = path.join(this.transactionDirectory, entry.name);
      const contents = await fs.readFile(journalPath, 'utf8');
      const journal = JSON.parse(contents);
      this.validateJournal(journal, entry.name);
      journals.push({ journalPath, journal });
    }

    journals.sort(
      (left, right) => Date.parse(left.journal.createdAt) - Date.parse(right.journal.createdAt),
    );

    for (const { journalPath, journal } of journals) {
      if (journal.phase === 'committed') {
        await fs.rm(journalPath, { force: true });
        continue;
      }

      if (journal.phase === 'prepared') {
        for (const filename of journal.writeOrder) {
          await this.commitDataUnlocked(filename, journal.after[filename], {
            context: 'transaction_recovery_forward',
          });
        }
        await this.writeJournal(journalPath, { ...journal, phase: 'committed' });
        await fs.rm(journalPath, { force: true });
        continue;
      }

      for (const filename of [...journal.writeOrder].reverse()) {
        await this.commitDataUnlocked(filename, journal.before[filename], {
          context: 'transaction_recovery_rollback',
        });
      }
      await fs.rm(journalPath, { force: true });
    }
  }

  validateJournal(journal, journalName) {
    if (!journal || typeof journal !== 'object') {
      throw new Error(`事务日志 ${journalName} 结构无效`);
    }

    if (!JOURNAL_PHASES.has(journal.phase)) {
      throw new Error(`事务日志 ${journalName} phase 无效`);
    }

    if (
      !Array.isArray(journal.files)
      || !Array.isArray(journal.writeOrder)
      || !journal.before
      || !journal.after
      || typeof journal.createdAt !== 'string'
    ) {
      throw new Error(`事务日志 ${journalName} 缺少必要字段`);
    }

    const uniqueFiles = new Set(journal.files);

    if (
      uniqueFiles.size !== journal.files.length
      || journal.writeOrder.length !== journal.files.length
      || journal.writeOrder.some((filename) => !uniqueFiles.has(filename))
    ) {
      throw new Error(`事务日志 ${journalName} 文件集合无效`);
    }

    for (const filename of journal.files) {
      this.validateFilename(filename);

      if (
        !Object.prototype.hasOwnProperty.call(journal.before, filename)
        || !Object.prototype.hasOwnProperty.call(journal.after, filename)
      ) {
        throw new Error(`事务日志 ${journalName} 缺少 ${filename} 快照`);
      }
    }

    if (journal.checksum !== checksumJournal(journal)) {
      throw new Error(`事务日志 ${journalName} checksum 校验失败`);
    }
  }

  async writeJournal(journalPath, journal) {
    const nextJournal = {
      ...journal,
      checksum: checksumJournal(journal),
    };
    await this.writeRawAtomic(journalPath, serializeJSON(nextJournal));
  }

  async commitDataUnlocked(filename, data, { context }) {
    this.validateFilename(filename);
    this.assertHealthyForWrite();

    if (this.faultInjector) {
      await this.faultInjector({
        stage: 'before_commit',
        filename,
        context,
      });
    }

    const targetPath = this.dataPath(filename);
    await this.writeRawAtomic(targetPath, serializeJSON(data));

    try {
      const timestamp = new Date().toISOString().replaceAll(':', '-');
      const backupName = `${filename}.${timestamp}.${uuidv4()}.bak`;
      await fs.copyFile(targetPath, path.join(this.backupDirectory, backupName));
      await this.pruneBackups(filename);
    } catch (backupError) {
      this.markDegraded(`无法创建或裁剪 ${filename} 备份`, backupError);
    }
  }

  async writeRawAtomic(targetPath, contents) {
    const temporaryPath = `${targetPath}.${process.pid}.${uuidv4()}.tmp`;
    let handle;

    try {
      handle = await fs.open(temporaryPath, 'wx');
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporaryPath, targetPath);
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
      }
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async pruneBackups(filename) {
    const entries = await fs.readdir(this.backupDirectory, { withFileTypes: true });
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(`${filename}.`) || !entry.name.endsWith('.bak')) {
        continue;
      }

      const backupPath = path.join(this.backupDirectory, entry.name);

      try {
        const contents = await fs.readFile(backupPath, 'utf8');
        JSON.parse(contents);
        const stat = await fs.stat(backupPath);
        candidates.push({ backupPath, mtimeMs: stat.mtimeMs });
      } catch (error) {
        await fs.rm(backupPath, { force: true });
      }
    }

    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);

    await Promise.all(
      candidates.slice(5).map(({ backupPath }) => fs.rm(backupPath, { force: true })),
    );
  }

  async withLocks(filenames, action, index = 0) {
    if (index >= filenames.length) {
      return action();
    }

    return this.withSingleLock(
      filenames[index],
      () => this.withLocks(filenames, action, index + 1),
    );
  }

  async withSingleLock(filename, action) {
    const previous = this.lockTails.get(filename) ?? Promise.resolve();
    let releaseGate;
    const gate = new Promise((resolve) => {
      releaseGate = resolve;
    });
    const tail = previous.catch(() => {}).then(() => gate);
    this.lockTails.set(filename, tail);

    await previous.catch(() => {});

    try {
      return await action();
    } finally {
      releaseGate();
      if (this.lockTails.get(filename) === tail) {
        this.lockTails.delete(filename);
      }
    }
  }

  async drain() {
    await Promise.all([...this.lockTails.values()].map((tail) => tail.catch(() => {})));
  }

  markDegraded(message, error) {
    this.storageStatus = 'degraded';
    console.error(`${message}：${error.message}`);
  }

  markFatal(error) {
    this.fatalError = error;
    console.error(`存储系统进入 fatal 状态：${error.message}`);
  }
}

export const fileStore = new FileStore();
