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

export async function writeAuditLog({
  userId,
  userNameSnapshot,
  storeId,
  action,
  targetType,
  targetId,
  dataBefore,
  dataAfter,
}) {
  const auditLog = {
    id: `audit_${uuidv4()}`,
    timestamp: new Date().toISOString(),
    userId: userId ?? null,
    userNameSnapshot: userNameSnapshot ?? null,
    storeId: storeId ?? null,
    action,
    targetType,
    targetId: targetId ?? null,
    dataBefore: sanitizeAuditValue(dataBefore),
    dataAfter: sanitizeAuditValue(dataAfter),
  };

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
