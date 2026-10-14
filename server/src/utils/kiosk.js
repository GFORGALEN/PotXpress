import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// 店员入口（kiosk）链接的 key 由 门店 id + 门店密钥版本 + 服务端密钥 派生。
// - 每个门店有独立的 kiosk_key_version：轮换某店版本只作废该店链接。
// - 版本 0 沿用旧格式，已发出的链接在升级后继续有效，直到被轮换。
// - 数据库只保存 key 的 SHA-256 摘要，用于按索引查找，不保存 key 本身。
export function kioskKeyForStore(storeId, version = 0) {
  const message = version === 0 ? `kiosk:${storeId}` : `kiosk:${storeId}:${version}`;
  return createHmac('sha256', config.jwtSecret)
    .update(message)
    .digest('base64url')
    .slice(0, 32);
}

export function kioskKeyHash(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function kioskHashesMatch(left, right) {
  const leftBuffer = Buffer.from(String(left), 'hex');
  const rightBuffer = Buffer.from(String(right), 'hex');
  return leftBuffer.length === rightBuffer.length
    && leftBuffer.length > 0
    && timingSafeEqual(leftBuffer, rightBuffer);
}
