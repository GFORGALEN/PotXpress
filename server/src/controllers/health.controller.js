import { getHealthStatus } from '../services/health.service.js';

export function healthController(req, res) {
  const {
    healthy,
    status,
    storage,
    time,
  } = getHealthStatus();

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status,
      storage,
      time,
    },
  });
}
