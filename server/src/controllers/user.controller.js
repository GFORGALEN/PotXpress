import { createUser, listUsers, updateUser } from '../services/user.service.js';
import { ok } from '../utils/response.js';

export async function listUsersController(req, res) {
  return ok(res, { users: await listUsers() }, '已获取用户列表');
}

export async function createUserController(req, res) {
  return ok(res, { user: await createUser(req.body, req.user) }, '用户已创建', 201);
}

export async function updateUserController(req, res) {
  const user = await updateUser(req.params.userId, req.body, req.user);
  return ok(res, { user }, '用户已更新');
}
