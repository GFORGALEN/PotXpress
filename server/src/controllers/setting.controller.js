import {
  getSettings,
  updateSettings,
} from '../services/setting.service.js';
import { ok } from '../utils/response.js';

export async function getSettingsController(req, res) {
  const settings = await getSettings(req.params.storeId);
  return ok(res, { settings }, '已获取门店设置');
}

export async function updateSettingsController(req, res) {
  const settings = await updateSettings(
    req.params.storeId,
    req.body,
    req.user,
  );
  return ok(res, { settings }, '门店设置已更新');
}
