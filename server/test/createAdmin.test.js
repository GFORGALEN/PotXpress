import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(testDirectory, '..');

function runCreateAdmin(dataDirectory, password) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/createAdmin.js',
        '--password-stdin',
        '--username',
        'first_admin',
        '--display-name',
        '首位管理员',
      ],
      {
        cwd: serverDirectory,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATA_DIR: dataDirectory,
          SEED_DEMO_DATA: 'false',
          JWT_SECRET: 'test-secret-only-for-isolated-tests',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let standardOutput = '';
    let standardError = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      standardOutput += chunk;
    });
    child.stderr.on('data', (chunk) => {
      standardError += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({ code, standardOutput, standardError });
    });
    child.stdin.end(`${password}\n`);
  });
}

test('管理员初始化命令可创建管理员且不输出密码', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'potxpress-admin-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const password = 'initial-password-123';

  const firstRun = await runCreateAdmin(directory, password);
  assert.equal(firstRun.code, 0, firstRun.standardError);
  assert.match(firstRun.standardOutput, /系统管理员已创建/);
  assert.equal(`${firstRun.standardOutput}${firstRun.standardError}`.includes(password), false);

});
