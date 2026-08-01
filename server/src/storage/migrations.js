import { fileStore, METADATA_FILE } from './fileStore.js';

export const CURRENT_SCHEMA_VERSION = 5;

async function migrateVersionZeroToOne() {
  await fileStore.withFiles(
    ['users.json', METADATA_FILE],
    (drafts) => {
      drafts['users.json'] = drafts['users.json'].map((user) => ({
        ...user,
        tokenVersion: user.tokenVersion ?? 1,
      }));
      drafts[METADATA_FILE] = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
      };
    },
    {
      writeOrder: ['users.json', METADATA_FILE],
    },
  );
}

async function migrateVersionOneToTwo() {
  await fileStore.withFiles(
    [
      'tables.json',
      'tableGroups.json',
      'activeTimers.json',
      'records.json',
      METADATA_FILE,
    ],
    (drafts) => {
      drafts['tables.json'] = drafts['tables.json'].map((table) => ({
        ...table,
        shape: table.shape ?? 'rectangle',
        capacity: table.capacity ?? 4,
        area: table.area ?? '大厅',
        note: table.note ?? null,
        defaultDurationMinutes: table.defaultDurationMinutes ?? null,
      }));
      drafts['activeTimers.json'] = drafts['activeTimers.json'].map((timer) => ({
        ...timer,
        targetType: timer.targetType ?? 'table',
        groupId: timer.groupId ?? null,
        memberTableIds: timer.memberTableIds ?? [timer.tableId],
      }));
      drafts['records.json'] = drafts['records.json'].map((record) => ({
        ...record,
        targetType: record.targetType ?? 'table',
        groupId: record.groupId ?? null,
        memberTableIds: record.memberTableIds ?? [record.tableId],
      }));
      drafts[METADATA_FILE] = {
        schemaVersion: 2,
        updatedAt: new Date().toISOString(),
      };
    },
    {
      writeOrder: [
        'tables.json',
        'activeTimers.json',
        'records.json',
        METADATA_FILE,
      ],
    },
  );
}

async function migrateVersionTwoToThree() {
  await fileStore.withFiles(
    ['idempotencyKeys.json', METADATA_FILE],
    (drafts) => {
      drafts['idempotencyKeys.json'] ??= [];
      drafts[METADATA_FILE] = {
        schemaVersion: 3,
        updatedAt: new Date().toISOString(),
      };
    },
    {
      writeOrder: ['idempotencyKeys.json', METADATA_FILE],
    },
  );
}

async function migrateVersionThreeToFour() {
  await fileStore.withFiles(
    ['realtimeEvents.json', METADATA_FILE],
    (drafts) => {
      drafts['realtimeEvents.json'] ??= [];
      drafts[METADATA_FILE] = {
        schemaVersion: 4,
        updatedAt: new Date().toISOString(),
      };
    },
    {
      writeOrder: ['realtimeEvents.json', METADATA_FILE],
    },
  );
}

async function migrateVersionFourToFive() {
  await fileStore.updateJSON(METADATA_FILE, () => ({
    schemaVersion: 5,
    updatedAt: new Date().toISOString(),
  }));
}

export async function runMigrations() {
  const metadata = await fileStore.readJSON(METADATA_FILE);

  if (!Number.isInteger(metadata.schemaVersion) || metadata.schemaVersion < 0) {
    throw new Error('metadata.json 的 schemaVersion 无效');
  }

  if (metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `数据版本 ${metadata.schemaVersion} 高于程序支持的版本 ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  let version = metadata.schemaVersion;

  while (version < CURRENT_SCHEMA_VERSION) {
    if (version === 0) {
      await migrateVersionZeroToOne();
      version = 1;
      continue;
    }

    if (version === 1) {
      await migrateVersionOneToTwo();
      version = 2;
      continue;
    }

    if (version === 2) {
      await migrateVersionTwoToThree();
      version = 3;
      continue;
    }

    if (version === 3) {
      await migrateVersionThreeToFour();
      version = 4;
      continue;
    }

    if (version === 4) {
      await migrateVersionFourToFive();
      version = 5;
      continue;
    }

    throw new Error(`缺少从 schemaVersion ${version} 开始的数据迁移`);
  }
}
