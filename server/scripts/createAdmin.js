import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { displayNameSchema, passwordSchema, usernameSchema } from '../src/validators/auth.validator.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { fileStore } from '../src/storage/fileStore.js';
import { checkDataConsistency } from '../src/storage/consistencyChecker.js';
import { writeAuditLog } from '../src/utils/audit.js';
import { hashPassword } from '../src/utils/hash.js';

function parseArguments(argumentsList) {
  const options = {
    username: null,
    displayName: null,
    passwordStdin: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === '--password-stdin') {
      options.passwordStdin = true;
      continue;
    }

    const [name, inlineValue] = argument.split('=', 2);

    if (name !== '--username' && name !== '--display-name') {
      throw new Error(`未知参数：${argument}`);
    }

    const value = inlineValue ?? argumentsList[++index];

    if (!value) {
      throw new Error(`${name} 缺少值`);
    }

    if (name === '--username') {
      options.username = value;
    } else {
      options.displayName = value;
    }
  }

  return options;
}

function readHiddenLine(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('当前终端不支持隐藏输入，请改用 --password-stdin');
  }

  return new Promise((resolve, reject) => {
    const previousRawMode = stdin.isRaw;
    let value = '';

    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(Boolean(previousRawMode));
      stdin.pause();
      stdout.write('\n');
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('已取消'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }

        if (character === '\u0008' || character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= ' ') {
          value += character;
        }
      }
    };

    stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function collectCredentials(options) {
  if (options.passwordStdin) {
    if (!options.username || !options.displayName) {
      throw new Error('--password-stdin 必须同时提供 --username 和 --display-name');
    }

    stdin.setEncoding('utf8');
    let input = '';

    for await (const chunk of stdin) {
      input += chunk;
    }

    const password = input.split(/\r?\n/, 1)[0];
    return {
      username: options.username,
      displayName: options.displayName,
      password,
    };
  }

  if (!stdin.isTTY) {
    throw new Error('非交互终端必须使用 --password-stdin');
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  let username;
  let displayName;

  try {
    username = options.username ?? await terminal.question('管理员用户名：');
    displayName = options.displayName ?? await terminal.question('管理员显示名称：');
  } finally {
    terminal.close();
  }

  const password = await readHiddenLine('管理员密码（输入不会显示）：');
  const confirmation = await readHiddenLine('再次输入密码：');

  if (password !== confirmation) {
    throw new Error('两次输入的密码不一致');
  }

  return { username, displayName, password };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const rawCredentials = await collectCredentials(options);
  const credentials = {
    username: usernameSchema.parse(rawCredentials.username),
    displayName: displayNameSchema.parse(rawCredentials.displayName),
    password: passwordSchema.parse(rawCredentials.password),
  };

  try {
    await fileStore.initStorage();
    await checkDataConsistency();

    const existingAdmins = await userRepository.findEnabledSystemAdmins();

    if (existingAdmins.length > 0) {
      throw new Error('已存在启用的系统管理员，初始化命令已拒绝继续');
    }

    const passwordHash = await hashPassword(credentials.password);
    const user = await userRepository.createSystemAdmin({
      username: credentials.username,
      displayName: credentials.displayName,
      passwordHash,
    });

    try {
      await writeAuditLog({
        userId: user.id,
        userNameSnapshot: user.displayName,
        storeId: null,
        action: 'system.bootstrap_admin',
        targetType: 'user',
        targetId: user.id,
        dataBefore: null,
        dataAfter: {
          username: user.username,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(`警告：管理员已创建，但审计日志写入失败：${error.message}`);
    }

    console.log(`系统管理员已创建：${user.username}（${user.id}）`);
  } finally {
    await fileStore.drain();
  }
}

main().catch((error) => {
  console.error(`创建系统管理员失败：${error.message}`);
  process.exitCode = 1;
});
