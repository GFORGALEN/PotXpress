import { timerService } from '../services/timer.service.js';
import { readIdempotencyKey } from '../utils/idempotency.js';
import { ok } from '../utils/response.js';

function markIdempotencyReplay(res, replayed) {
  if (replayed) {
    res.set('Idempotency-Replayed', 'true');
  }
}

export async function listTimersController(req, res) {
  const result = await timerService.list(req.params.storeId);
  return ok(res, result, '已获取活动计时');
}

export async function startTimerController(req, res) {
  const { value: timer, replayed } = await timerService.start({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    durationMinutes: req.body.durationMinutes,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, { timer }, '计时已开始', 201);
}

export async function pauseTimerController(req, res) {
  const { value: timer, replayed } = await timerService.pause({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, { timer }, '计时已暂停');
}

export async function resumeTimerController(req, res) {
  const { value: timer, replayed } = await timerService.resume({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, { timer }, '计时已继续');
}

export async function adjustTimerController(req, res) {
  const { value: timer, replayed } = await timerService.adjust({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    deltaSeconds: req.body.deltaSeconds,
    reason: req.body.reason,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, { timer }, '计时时长已调整');
}

export async function resetTimerController(req, res) {
  const { value: result, replayed } = await timerService.reset({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, result, '计时已清台并生成记录');
}

export async function acknowledgeTimerAlertController(req, res) {
  const { value: timer, replayed } = await timerService.acknowledgeAlert({
    storeId: req.params.storeId,
    tableId: req.params.tableId,
    idempotencyKey: readIdempotencyKey(req),
    user: req.user,
  });
  markIdempotencyReplay(res, replayed);
  return ok(res, { timer }, '超时提醒已确认');
}
