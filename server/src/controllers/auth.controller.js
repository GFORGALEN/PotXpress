import { login, logout } from '../services/auth.service.js';
import { ok } from '../utils/response.js';

export async function loginController(req, res) {
  const result = await login(req.body);
  return ok(res, result, '登录成功');
}

export async function meController(req, res) {
  return ok(res, { user: req.user }, '已获取当前用户');
}

export async function logoutController(req, res) {
  await logout(req.user);
  return ok(res, null, '已退出登录');
}
