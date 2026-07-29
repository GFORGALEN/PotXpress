import { fileStore, METADATA_FILE } from './fileStore.js';

export const CURRENT_SCHEMA_VERSION = 1;

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

    throw new Error(`缺少从 schemaVersion ${version} 开始的数据迁移`);
  }
}
