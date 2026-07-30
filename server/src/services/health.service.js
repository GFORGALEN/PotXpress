import { healthRepository } from '../repositories/health.repository.js';

export async function getHealthStatus() {
  const storage = await healthRepository.getStorageStatus();
  const healthy = storage !== 'fatal';

  return {
    healthy,
    status: healthy ? 'up' : 'down',
    storage,
    time: new Date().toISOString(),
  };
}
