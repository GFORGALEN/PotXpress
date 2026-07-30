import { v4 as uuidv4 } from 'uuid';
import { fileStore } from '../storage/fileStore.js';

const SENSITIVE_KEY_PATTERN = /password|passwordhash|token|authorization|secret/i;

function sanitizeAuditValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, nestedValue]) => [
        key,
        sanitizeAuditValue(nestedValue, seen),
      ]),
  );
}

export function buildAuditLog({
  userId,
  userNameSnapshot,
  storeId,
  action,
  targetType,
  targetId,
  dataBefore,
  dataAfter,
}, { timestamp = new Date().toISOString() } = {}) {
  return {
    id: `audit_${uuidv4()}`,
    timestamp,
    userId: userId ?? null,
    userNameSnapshot: userNameSnapshot ?? null,
    storeId: storeId ?? null,
    action,
    targetType,
    targetId: targetId ?? null,
    dataBefore: sanitizeAuditValue(dataBefore),
    dataAfter: sanitizeAuditValue(dataAfter),
  };
}

export function appendAuditLog(auditLogs, entry, options) {
  const auditLog = buildAuditLog(entry, options);
  auditLogs.create(auditLog);
  return auditLog;
}

export async function writeAuditLog(entry) {
  const auditLog = buildAuditLog(entry);

  await fileStore.updateJSON('auditLogs.json', (logs) => {
    logs.push(auditLog);
  });

  return auditLog;
}

export async function writeAuditLogBestEffort(entry) {
  try {
    return await writeAuditLog(entry);
  } catch (error) {
    console.error(`审计日志写入失败（${entry.action}）：${error.message}`);
    return null;
  }
}
