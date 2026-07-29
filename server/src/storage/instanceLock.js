import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export class InstanceLock {
  constructor({ dataDirectory = config.dataDirectory } = {}) {
    this.dataDirectory = path.resolve(dataDirectory);
    this.lockPath = path.join(this.dataDirectory, '.potxpress.instance.lock');
    this.startedAt = null;
    this.acquired = false;
  }

  async acquire() {
    await fs.mkdir(this.dataDirectory, { recursive: true });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let handle;

      try {
        handle = await fs.open(this.lockPath, 'wx');
        this.startedAt = new Date().toISOString();
        await handle.writeFile(
          JSON.stringify({
            pid: process.pid,
            startedAt: this.startedAt,
          }),
          'utf8',
        );
        await handle.sync();
        await handle.close();
        handle = null;
        this.acquired = true;
        return;
      } catch (error) {
        if (handle) {
          await handle.close().catch(() => {});
          await fs.rm(this.lockPath, { force: true }).catch(() => {});
        }

        if (error.code !== 'EEXIST') {
          throw error;
        }

        let existing;

        try {
          existing = await this.readExistingLock();
        } catch (lockError) {
          if (lockError.code === 'ENOENT') {
            continue;
          }
          throw lockError;
        }

        if (isProcessAlive(existing.pid)) {
          throw new Error(
            `DATA_DIR 已被进程 ${existing.pid} 使用，不能启动第二个 PotXpress 实例`,
          );
        }

        if (attempt === 2) {
          throw new Error('无法清理失效的 DATA_DIR 实例锁');
        }

        await fs.rm(this.lockPath, { force: true });
      }
    }
  }

  async readExistingLock() {
    const contents = await fs.readFile(this.lockPath, 'utf8');
    let parsed;

    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new Error(
        `DATA_DIR 实例锁损坏，请人工确认没有 PotXpress 进程后删除：${this.lockPath}`,
        { cause: error },
      );
    }

    if (
      !Number.isInteger(parsed?.pid)
      || parsed.pid <= 0
      || typeof parsed.startedAt !== 'string'
      || Number.isNaN(Date.parse(parsed.startedAt))
    ) {
      throw new Error(
        `DATA_DIR 实例锁内容无效，请人工确认没有 PotXpress 进程后删除：${this.lockPath}`,
      );
    }

    return parsed;
  }

  async release() {
    if (!this.acquired) {
      return;
    }

    try {
      const existing = await this.readExistingLock().catch((error) => {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      });

      if (
        existing
        && existing.pid === process.pid
        && existing.startedAt === this.startedAt
      ) {
        await fs.rm(this.lockPath, { force: true });
      }
    } finally {
      this.acquired = false;
    }
  }
}

export const instanceLock = new InstanceLock();
