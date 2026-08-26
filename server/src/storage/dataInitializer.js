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
  aspectRatio: 'auto',
  virtualWidth: 4000,
  virtualHeight: 2550,
  backgroundImage: null,
  backgroundColor: '#f2f0ea',
  gridEnabled: true,
  snapToGrid: true,
  gridSize: 15,
  minTableWidth: 120,
  minTableHeight: 90,
  maxTableWidth: 600,
  maxTableHeight: 450,
});

const DEFAULT_DECORATIONS = Object.freeze([
  { id: 'decoration_demo_entrance_main', type: 'entrance', label: '入口', xRatio: 0.382852, yRatio: 0.000264, widthRatio: 0.104774, heightRatio: 0.070602, rotation: 0, zIndex: 63 },
  { id: 'decoration_demo_cashier', type: 'cashier', label: '收银台', xRatio: 0.663937, yRatio: 0.099438, widthRatio: 0.059766, heightRatio: 0.070602, rotation: 90, zIndex: 64 },
  { id: 'decoration_demo_entrance_side', type: 'entrance', label: '入口', xRatio: 0.292096, yRatio: 0.589671, widthRatio: 0.08, heightRatio: 0.053529, rotation: 90, zIndex: 164 },
  { id: 'decoration_demo_wall_main', type: 'wall', label: '墙体', xRatio: 0.379718, yRatio: 0.456898, widthRatio: 0.487717, heightRatio: 0.028935, rotation: 0, zIndex: 331 },
  { id: 'decoration_demo_wall_side', type: 'wall', label: '墙体', xRatio: 0.160845, yRatio: 0.459782, widthRatio: 0.149783, heightRatio: 0.023148, rotation: 0, zIndex: 332 },
]);

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
  const specifications = [
    ['A1', 'rectangle', 'A区', 0.170705, 0.193992, 0.136595, 0.081255],
    ['A2', 'rectangle', 'A区', 0.170705, 0.325738, 0.136595, 0.081255],
    ...Array.from({ length: 6 }, (_, index) => [
      `B${index + 1}`, 'round', 'B区',
      0.389888 + index * 0.076572, 0.212261, 0.056163, 0.088099,
    ]),
    ...Array.from({ length: 8 }, (_, index) => [
      `B${index + 7}`, 'round', 'B区',
      0.399521 + index * 0.067653, 0.35637, 0.05625, 0.088235,
    ]),
    ...Array.from({ length: 3 }, (_, index) => [
      `C${index + 1}`, 'rectangle', 'C区',
      0.431942 + index * 0.133723, 0.577214, 0.107756, 0.0887,
    ]),
    ['C4', 'rectangle', 'C区', 0.839932, 0.573674, 0.056546, 0.136398],
    ['C5', 'rectangle', 'C区', 0.839932, 0.739344, 0.056546, 0.136398],
    ['C6', 'rectangle', 'C区', 0.71092, 0.785702, 0.097088, 0.080333],
    ['C7', 'rectangle', 'C区', 0.56767, 0.785702, 0.097088, 0.080333],
    ['C8', 'rectangle', 'C区', 0.42442, 0.785702, 0.097088, 0.080333],
    ['D1', 'rectangle', 'D区', 0.176315, 0.684097, 0.112499, 0.082442],
    ['D2', 'rectangle', 'D区', 0.176315, 0.519228, 0.112499, 0.082442],
  ];

  return specifications.map(([
    name,
    shape,
    area,
    xRatio,
    yRatio,
    widthRatio,
    heightRatio,
  ], index) => ({
    id: `table_demo_${String(index + 1).padStart(2, '0')}`,
    storeId: SEED_IDS.store,
    name,
    number: index + 1,
    sortOrder: index + 1,
    enabled: true,
    shape,
    capacity: 4,
    area,
    note: null,
    defaultDurationMinutes: null,
    layout: {
      xRatio,
      yRatio,
      widthRatio,
      heightRatio,
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
    name: 'Pot Xpress Hotpot Buffet Dominion Road · 本地演示',
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
          decorations: DEFAULT_DECORATIONS.map((item) => ({ ...item })),
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
