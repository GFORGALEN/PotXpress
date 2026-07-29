import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileStore } from '../src/storage/fileStore.js';
import { InstanceLock } from '../src/storage/instanceLock.js';

async function makeTemporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'potxpress-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test('并发 updateJSON 不会丢失写入', async (t) => {
  const directory = await makeTemporaryDirectory(t);
  const store = new FileStore({ dataDirectory: directory });
  await store.initStorage();

  await Promise.all(
    Array.from({ length: 40 }, (_, index) => (
      store.updateJSON('stores.json', (stores) => {
        stores.push({ id: `store_${index}` });
      })
    )),
  );

  const stores = await store.readJSON('stores.json');
  assert.equal(stores.length, 40);
  assert.equal(new Set(stores.map((entry) => entry.id)).size, 40);
});

test('跨文件提交失败时按事务日志恢复原快照', async (t) => {
  const directory = await makeTemporaryDirectory(t);
  let injectFailure = false;
  const store = new FileStore({
    dataDirectory: directory,
    faultInjector: ({ filename, context }) => {
      if (
        injectFailure
        && filename === 'users.json'
        && context === 'transaction_commit'
      ) {
        injectFailure = false;
        throw new Error('injected commit failure');
      }
    },
  });
  await store.initStorage();
  injectFailure = true;

  await assert.rejects(
    store.withFiles(
      ['stores.json', 'users.json'],
      (drafts) => {
        drafts['stores.json'].push({ id: 'store_should_rollback' });
        drafts['users.json'].push({ id: 'user_should_rollback' });
      },
      { writeOrder: ['stores.json', 'users.json'] },
    ),
    /injected commit failure/,
  );

  assert.deepEqual(await store.readJSON('stores.json'), []);
  assert.deepEqual(await store.readJSON('users.json'), []);
  assert.equal(store.getStatus(), 'ok');
  assert.deepEqual(
    (await fs.readdir(path.join(directory, 'transactions')))
      .filter((name) => name.endsWith('.json')),
    [],
  );
});

test('数据文件损坏时自动使用最近的有效备份', async (t) => {
  const directory = await makeTemporaryDirectory(t);
  const store = new FileStore({ dataDirectory: directory });
  await store.initStorage();
  await store.updateJSON('stores.json', (stores) => {
    stores.push({ id: 'store_from_backup' });
  });
  await fs.writeFile(path.join(directory, 'stores.json'), '{broken', 'utf8');

  const stores = await store.readJSON('stores.json');
  assert.deepEqual(stores, [{ id: 'store_from_backup' }]);
  assert.equal(store.getStatus(), 'degraded');
});

test('同一 DATA_DIR 拒绝第二个进程实例锁', async (t) => {
  const directory = await makeTemporaryDirectory(t);
  const first = new InstanceLock({ dataDirectory: directory });
  const second = new InstanceLock({ dataDirectory: directory });
  await first.acquire();
  t.after(() => first.release());

  await assert.rejects(second.acquire(), /不能启动第二个 PotXpress 实例/);
});

test('损坏的实例锁不会被自动删除', async (t) => {
  const directory = await makeTemporaryDirectory(t);
  const lockPath = path.join(directory, '.potxpress.instance.lock');
  await fs.writeFile(lockPath, '{broken', 'utf8');
  const lock = new InstanceLock({ dataDirectory: directory });

  await assert.rejects(lock.acquire(), /实例锁损坏/);
  assert.equal(await fs.readFile(lockPath, 'utf8'), '{broken');
});
