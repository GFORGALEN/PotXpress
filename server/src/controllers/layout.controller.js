import { getLayout, saveLayout } from '../services/layout.service.js';
import { ok } from '../utils/response.js';

export async function getLayoutController(req, res) {
  const layout = await getLayout(req.params.storeId);
  return ok(res, layout, '已获取门店布局');
}

export async function saveLayoutController(req, res) {
  const result = await saveLayout(
    req.params.storeId,
    req.body,
    req.user,
  );
  return ok(res, result, '布局已保存');
}
