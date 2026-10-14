function parseBoolean(value, fallback = false) {
  if (value === undefined || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function parsePort(value) {
  const port = Number(value ?? 3001);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT 必须是 0-65535 之间的整数');
  }

  return port;
}

function parsePoolSize(value) {
  const size = Number(value ?? 10);
  if (!Number.isInteger(size) || size < 1 || size > 50) {
    throw new Error('DATABASE_POOL_SIZE 必须是 1-50 之间的整数');
  }
  return size;
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') {
    return false;
  }

  if (/^[1-9]\d?$/.test(value)) {
    return Number(value);
  }

  if (['loopback', 'linklocal', 'uniquelocal'].includes(value)) {
    return value;
  }

  throw new Error('TRUST_PROXY 只能是 false、1-99 或受支持的地址范围名称');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const LOCAL_DATABASE_URL = 'postgres://potxpress:potxpress@127.0.0.1:5432/potxpress';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const bootstrapAdmin = Object.freeze({
  username: process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || null,
  displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || null,
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD || null,
});
const corsOrigins = (process.env.CORS_ORIGIN || (
  isProduction
    ? ''
    : 'http://localhost:5173,http://127.0.0.1:5173'
))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = Object.freeze({
  nodeEnv,
  isProduction,
  port: parsePort(process.env.PORT),
  jwtSecret,
  bootstrapAdmin,
  corsOrigins,
  databaseUrl: isTest
    ? (process.env.TEST_DATABASE_URL || LOCAL_DATABASE_URL)
    : (process.env.DATABASE_URL || LOCAL_DATABASE_URL),
  // 测试与生产执行同一套 SQL：每个测试进程使用真实 PostgreSQL 中的独立
  // schema，测试结束后由 test/globalSetup.js 清理。
  databaseSchema: isTest
    ? `potxpress_test_${process.pid}_${Date.now().toString(36)}`
    : null,
  databasePoolSize: parsePoolSize(process.env.DATABASE_POOL_SIZE),
  databaseSsl: isTest ? false : parseBoolean(process.env.DATABASE_SSL),
  // LISTEN 需要会话级连接。若 DATABASE_URL 指向事务模式连接池（如 Supabase
  // 6543 端口），把这里配置为直连或会话模式地址；为空时复用 DATABASE_URL。
  realtimeListenUrl: isTest ? null : (process.env.REALTIME_LISTEN_DATABASE_URL || null),
  // 后台超时结算巡检间隔；测试中关闭，由测试显式驱动结算。
  overdueSweepIntervalMilliseconds: isTest ? 0 : 30_000,
  seedDemoData: parseBoolean(process.env.SEED_DEMO_DATA, !isProduction),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
});

export function validateRuntimeConfig() {
  const bootstrapValues = Object.values(config.bootstrapAdmin);
  const hasAnyBootstrapValue = bootstrapValues.some(Boolean);
  const hasAllBootstrapValues = bootstrapValues.every(Boolean);

  if (hasAnyBootstrapValue && !hasAllBootstrapValues) {
    throw new Error(
      'BOOTSTRAP_ADMIN_USERNAME、BOOTSTRAP_ADMIN_DISPLAY_NAME 和 '
      + 'BOOTSTRAP_ADMIN_PASSWORD 必须同时配置',
    );
  }

  if (config.isProduction) {
    if (
      config.jwtSecret === 'dev-secret-change-me'
      || config.jwtSecret.length < 32
    ) {
      throw new Error('生产环境 JWT_SECRET 必须是至少 32 字符的非默认随机值');
    }
  }
}
