import { recordService } from '../services/record.service.js';
import { ok } from '../utils/response.js';

export async function listRecordsController(req, res) {
  const result = await recordService.list(req.params.storeId, req.query);
  return ok(res, result, '已获取计时记录');
}

export async function getRecordController(req, res) {
  const record = await recordService.getById(
    req.params.storeId,
    req.params.recordId,
  );
  return ok(res, { record }, '已获取计时记录详情');
}

export async function exportRecordsController(req, res) {
  const { date, csv } = await recordService.export(
    req.params.storeId,
    req.query,
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="records-${date}.csv"`,
  );
  return res.status(200).send(csv);
}

export async function listAuditLogsController(req, res) {
  const logs = await recordService.listAuditLogs(
    req.params.storeId,
    req.query,
  );
  return ok(res, { logs }, '已获取操作日志');
}
