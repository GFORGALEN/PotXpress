import { createHmac } from 'node:crypto';
import { config } from '../config.js';

// 店员入口（kiosk）链接的 key 由门店 id + 服务端密钥派生，
// 不落地存储、不可猜测，轮换 JWT_SECRET 会同时作废旧链接。
export function kioskKeyForStore(storeId) {
  return createHmac('sha256', config.jwtSecret)
    .update(`kiosk:${storeId}`)
    .digest('base64url')
    .slice(0, 32);
}
