import {
  createTable,
  createTableBatch,
  deleteTable,
  listTables,
  updateTable,
} from '../services/table.service.js';
import { ok } from '../utils/response.js';

export async function listTablesController(req, res) {
  const tables = await listTables(req.params.storeId);
  return ok(res, { tables }, '已获取桌台列表');
}

export async function createTableController(req, res) {
  const table = await createTable(req.params.storeId, req.body, req.user);
  return ok(res, { table }, '桌台已创建', 201);
}

export async function createTableBatchController(req, res) {
  const tables = await createTableBatch(
    req.params.storeId,
    req.body,
    req.user,
  );
  return ok(res, { tables }, '桌台已批量创建', 201);
}

export async function updateTableController(req, res) {
  const table = await updateTable(
    req.params.storeId,
    req.params.tableId,
    req.body,
    req.user,
  );
  return ok(res, { table }, '桌台已更新');
}

export async function deleteTableController(req, res) {
  const table = await deleteTable(
    req.params.storeId,
    req.params.tableId,
    req.user,
  );
  return ok(res, { table }, '桌台已停用');
}
