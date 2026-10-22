import { healthRepository } from '../repositories/health.repository.js';

function healthStatus(storage, healthy) {
  return {
    healthy,
    status: healthy ? 'up' : 'down',
    storage,
    time: new Date().toISOString(),
  };
}

/**
 * 存活检查（Render 的 healthCheckPath）：能回答就说明进程在运行、事件循环
 * 能处理请求。这里不访问数据库——数据库短暂变慢或断开时若让它失败，Render
 * 会重启实例，把一次数据库抖动放大成整站中断，而重启也修不好数据库。
 */
export function getLivenessStatus() {
  const storage = healthRepository.getStorageState();
  return healthStatus(storage, storage !== 'fatal');
}

/** 就绪检查：包含一次数据库往返，供界面或外部监控判断当前能否读写。 */
export async function getReadinessStatus() {
  const storage = healthRepository.getStorageState() === 'fatal'
    ? 'fatal'
    : await healthRepository.checkDatabase();
  return healthStatus(storage, storage === 'ok');
}
