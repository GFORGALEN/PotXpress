import { hashPassword } from '../utils/hash.js';
import { normalizeStoreCode, normalizeUsername } from '../utils/normalization.js';
import { config } from '../config.js';
import { userRepository } from '../repositories/user.repository.js';
import { writeAuditLog } from '../utils/audit.js';
import {
  displayNameSchema,
  passwordSchema,
  usernameSchema,
} from '../validators/auth.validator.js';
import { fileStore } from './fileStore.js';

const SEED_IDS = Object.freeze({
  store: 'store_demo',
  systemAdmin: 'user_admin',
  storeAdmin: 'user_demo_admin',
  storeStaff: 'user_demo_staff',
});

export const DEFAULT_CANVAS = Object.freeze({
  aspectRatio: '16:9',
  virtualWidth: 2400,
  virtualHeight: 1350,
  backgroundImage: null,
  backgroundColor: '#f5f5f5',
  gridEnabled: true,
  snapToGrid: true,
  gridSize: 15,
  minTableWidth: 120,
  minTableHeight: 90,
  maxTableWidth: 600,
  maxTableHeight: 450,
});

export async function initializeBootstrapAdmin() {
  const { username, displayName, password } = config.bootstrapAdmin;

  if (!username || !displayName || !password) {
    return null;
  }

  const existingAdmins = await userRepository.findEnabledSystemAdmins();
  if (existingAdmins.length > 0) {
    return existingAdmins[0];
  }

  const credentials = {
    username: usernameSchema.parse(username),
    displayName: displayNameSchema.parse(displayName),
    password: passwordSchema.parse(password),
  };
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

  console.log(`首位系统管理员已创建：${user.username}`);
  return user;
}

function findConflict(items, id, predicate) {
  return items.find((item) => item.id !== id && predicate(item));
}

function buildSeedTables(timestamp) {
  const positions = [
    [0.04, 0.12],
    [0.28, 0.12],
    [0.52, 0.12],
    [0.76, 0.12],
    [0.04, 0.55],
    [0.28, 0.55],
    [0.52, 0.55],
    [0.76, 0.55],
  ];

  return positions.map(([xRatio, yRatio], index) => ({
    id: `table_demo_${String(index + 1).padStart(2, '0')}`,
    storeId: SEED_IDS.store,
    name: `${index + 1}号桌`,
    number: index + 1,
    sortOrder: index + 1,
    enabled: true,
    shape: 'rectangle',
    capacity: 4,
    area: '大厅',
    note: null,
    defaultDurationMinutes: null,
    layout: {
      xRatio,
      yRatio,
      widthRatio: 0.1,
      heightRatio: 0.11,
      rotation: 0,
      zIndex: index + 1,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export async function initializeDemoData() {
  if (!config.seedDemoData) {
    return;
  }

  const timestamp = new Date().toISOString();
  const [adminHash, storeAdminHash, storeStaffHash] = await Promise.all([
    hashPassword('admin123'),
    hashPassword('admin123'),
    hashPassword('staff123'),
  ]);

  const seedStore = {
    id: SEED_IDS.store,
    name: 'PotXpress 演示门店',
    code: 'DEMO001',
    normalizedCode: normalizeStoreCode('DEMO001'),
    address: null,
    timezone: 'Pacific/Auckland',
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const seedUsers = [
    {
      id: SEED_IDS.systemAdmin,
      username: 'admin',
      normalizedUsername: normalizeUsername('admin'),
      displayName: '系统管理员',
      passwordHash: adminHash,
      role: 'system_admin',
      storeId: null,
      enabled: true,
      tokenVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: SEED_IDS.storeAdmin,
      username: 'demo_admin',
      normalizedUsername: normalizeUsername('demo_admin'),
      displayName: '演示店管理员',
      passwordHash: storeAdminHash,
      role: 'store_admin',
      storeId: SEED_IDS.store,
      enabled: true,
      tokenVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: SEED_IDS.storeStaff,
      username: 'demo_staff',
      normalizedUsername: normalizeUsername('demo_staff'),
      displayName: '演示店员工',
      passwordHash: storeStaffHash,
      role: 'store_staff',
      storeId: SEED_IDS.store,
      enabled: true,
      tokenVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  const seedTables = buildSeedTables(timestamp);

  await fileStore.withFiles(
    [
      'stores.json',
      'settings.json',
      'layouts.json',
      'tables.json',
      'users.json',
    ],
    (drafts) => {
      const stores = drafts['stores.json'];
      const settings = drafts['settings.json'];
      const layouts = drafts['layouts.json'];
      const tables = drafts['tables.json'];
      const users = drafts['users.json'];

      if (!stores.some((store) => store.id === seedStore.id)) {
        const codeConflict = findConflict(
          stores,
          seedStore.id,
          (store) => normalizeStoreCode(store.code) === seedStore.normalizedCode,
        );

        if (codeConflict) {
          throw new Error(`演示门店 code 与现有门店 ${codeConflict.id} 冲突`);
        }
        stores.push(seedStore);
      }

      if (!settings.some((entry) => entry.storeId === SEED_IDS.store)) {
        settings.push({
          storeId: SEED_IDS.store,
          defaultDurationMinutes: 90,
          warningThresholdMinutes: 10,
          timezone: 'Pacific/Auckland',
          soundEnabled: true,
          updatedAt: timestamp,
        });
      }

      if (!layouts.some((entry) => entry.storeId === SEED_IDS.store)) {
        layouts.push({
          storeId: SEED_IDS.store,
          layoutVersion: 1,
          canvas: { ...DEFAULT_CANVAS },
          decorations: [],
          updatedAt: timestamp,
          updatedBy: SEED_IDS.systemAdmin,
        });
      }

      for (const seedTable of seedTables) {
        if (tables.some((table) => table.id === seedTable.id)) {
          continue;
        }

        const numberConflict = findConflict(
          tables.filter((table) => table.storeId === SEED_IDS.store),
          seedTable.id,
          (table) => table.number === seedTable.number,
        );

        if (numberConflict) {
          throw new Error(`演示桌台编号与现有桌台 ${numberConflict.id} 冲突`);
        }
        tables.push(seedTable);
      }

      for (const seedUser of seedUsers) {
        if (users.some((user) => user.id === seedUser.id)) {
          continue;
        }

        const usernameConflict = findConflict(
          users,
          seedUser.id,
          (user) => normalizeUsername(user.username) === seedUser.normalizedUsername,
        );

        if (usernameConflict) {
          throw new Error(`演示用户名与现有用户 ${usernameConflict.id} 冲突`);
        }
        users.push(seedUser);
      }
    },
    {
      writeOrder: [
        'stores.json',
        'settings.json',
        'layouts.json',
        'tables.json',
        'users.json',
      ],
    },
  );
}
