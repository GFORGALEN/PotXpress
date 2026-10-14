import pg from 'pg';

// 测试与生产执行同一套 SQL：每个测试文件（独立进程）在真实 PostgreSQL 中
// 使用自己的 schema（见 src/config.js 的 databaseSchema），这里负责清理。
const databaseUrl = process.env.TEST_DATABASE_URL
  || 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';

async function dropTestSchemas() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT nspname FROM pg_namespace
       WHERE nspname LIKE 'potxpress\\_test\\_%' OR nspname LIKE 'potxpress\\_lock\\_test\\_%'`,
    );
    for (const { nspname: schema } of rows) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  } finally {
    await pool.end();
  }
}

export async function globalSetup() {
  try {
    await dropTestSchemas();
  } catch (error) {
    throw new Error(
      `无法连接测试数据库 ${databaseUrl}：${error.message}\n`
      + '请先启动 PostgreSQL（docker compose up -d postgres），'
      + '或设置 TEST_DATABASE_URL 指向一个可写的测试库。',
    );
  }
}

export async function globalTeardown() {
  await dropTestSchemas();
}
