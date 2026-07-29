import {
  createStore,
  getStore,
  listStores,
  updateStore,
} from '../services/store.service.js';
import { ok } from '../utils/response.js';

export async function listStoresController(req, res) {
  const stores = await listStores(req.user);
  return ok(res, { stores }, '已获取门店列表');
}

export async function createStoreController(req, res) {
  const store = await createStore(req.body, req.user);
  return ok(res, { store }, '门店已创建', 201);
}

export async function getStoreController(req, res) {
  const store = await getStore(req.params.storeId);
  return ok(res, { store }, '已获取门店详情');
}

export async function updateStoreController(req, res) {
  const store = await updateStore(req.params.storeId, req.body, req.user);
  return ok(res, { store }, '门店已更新');
}
