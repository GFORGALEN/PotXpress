import { healthRepository } from '../repositories/health.repository.js';

export function getHealthStatus() {
  const storage = healthRepository.getStorageStatus();
  const healthy = storage !== 'fatal';

  return {
    healthy,
    status: healthy ? 'up' : 'down',
    storage,
    time: new Date().toISOString(),
  };
}
