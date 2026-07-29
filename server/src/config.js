import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(sourceDirectory, '..');

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
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';
const corsOrigins = (process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:5173'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = Object.freeze({
  nodeEnv,
  isProduction,
  port: parsePort(process.env.PORT),
  jwtSecret,
  corsOrigins,
  dataDirectory: path.resolve(process.env.DATA_DIR || path.join(serverDirectory, 'data')),
  seedDemoData: parseBoolean(process.env.SEED_DEMO_DATA),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
});

export function validateRuntimeConfig() {
  if (config.isProduction) {
    if (
      config.jwtSecret === 'dev-secret-change-me'
      || config.jwtSecret.length < 32
    ) {
      throw new Error('生产环境 JWT_SECRET 必须是至少 32 字符的非默认随机值');
    }

    if (config.corsOrigins.length === 0) {
      throw new Error('生产环境必须配置 CORS_ORIGIN');
    }
  }
}
