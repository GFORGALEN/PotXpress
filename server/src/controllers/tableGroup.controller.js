import {
  createTableGroup,
  deleteTableGroup,
  listTableGroups,
} from '../services/tableGroup.service.js';
import { readIdempotencyKey } from '../utils/idempotency.js';
import { ok } from '../utils/response.js';

function markIdempotencyReplay(res, replayed) {
  if (replayed) {
    res.set('Idempotency-Replayed', 'true');
  }
}

export async function listTableGroupsController(req, res) {
  return ok(res, { groups: await listTableGroups(req.params.storeId) }, '已获取拼桌组');
}

export async function createTableGroupController(req, res) {
  const { value: group, replayed } = await createTableGroup(
    req.params.storeId,
    req.body,
    req.user,
    readIdempotencyKey(req),
  );
  markIdempotencyReplay(res, replayed);
  return ok(res, { group }, '拼桌组已创建', 201);
}

export async function deleteTableGroupController(req, res) {
  const { value: group, replayed } = await deleteTableGroup(
    req.params.storeId,
    req.params.groupId,
    req.user,
    readIdempotencyKey(req),
  );
  markIdempotencyReplay(res, replayed);
  return ok(res, { group }, '拼桌组已解除');
}
