import { recordService } from '../services/record.service.js';
import { ok } from '../utils/response.js';

export async function listRecordsController(req, res) {
  const result = await recordService.list(
    req.params.storeId,
    req.validated.query,
  );
  return ok(res, result, '已获取计时记录');
}

export async function getRecordController(req, res) {
  const record = await recordService.getById(
    req.params.storeId,
    req.params.recordId,
  );
  return ok(res, { record }, '已获取计时记录详情');
}

export async function deleteRecordController(req, res) {
  const [record] = await recordService.deleteRecords(
    req.params.storeId,
    [req.params.recordId],
    req.user,
  );
  return ok(res, { record }, '计时记录已删除');
}

export async function deleteRecordsController(req, res) {
  const records = await recordService.deleteRecords(
    req.params.storeId,
    req.body.ids,
    req.user,
  );
  return ok(res, { records, count: records.length }, `已删除 ${records.length} 条计时记录`);
}

export async function exportRecordsController(req, res) {
  const { date, csv } = await recordService.export(
    req.params.storeId,
    req.validated.query,
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
    req.validated.query,
  );
  return ok(res, { logs }, '已获取操作日志');
}

export async function deleteAuditLogController(req, res) {
  const log = await recordService.deleteAuditLog(
    req.params.storeId,
    req.params.logId,
  );
  return ok(res, { log }, '操作日志已删除');
}

export async function deleteAuditLogsController(req, res) {
  const logs = await recordService.deleteAuditLogs(
    req.params.storeId,
    req.body.ids,
  );
  return ok(res, { logs, count: logs.length }, `已删除 ${logs.length} 条操作日志`);
}
