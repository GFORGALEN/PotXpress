import {
  getLivenessStatus,
  getReadinessStatus,
} from '../services/health.service.js';

function sendHealth(res, {
  healthy,
  status,
  storage,
  time,
}) {
  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status,
      storage,
      time,
    },
  });
}

export async function healthController(req, res) {
  return sendHealth(res, getLivenessStatus());
}

export async function readinessController(req, res) {
  return sendHealth(res, await getReadinessStatus());
}
