import { fileStore } from '../storage/fileStore.js';

export function healthController(req, res) {
  const storage = fileStore.getStatus();
  const healthy = storage !== 'fatal';

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'up' : 'down',
      storage,
      timestamp: new Date().toISOString(),
    },
  });
}
