import crypto from 'node:crypto';
import { AppError } from './appError.js';

const IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~:+-]{8,128}$/;

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

function fingerprint(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function entryId(userId, key) {
  const digest = crypto
    .createHash('sha256')
    .update(`${userId}\0${key}`)
    .digest('hex');
  return `idemp_${digest}`;
}

export function readIdempotencyKey(req) {
  const key = req.get('Idempotency-Key');

  if (key === undefined) {
    return null;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key 必须为 8-128 位字母、数字或安全符号',
    );
  }

  return key;
}

export function runIdempotentMutation({
  idempotencyKeys,
  key,
  user,
  storeId,
  operation,
  request,
  now = Date.now(),
  execute,
}) {
  if (!key) {
    return {
      value: execute(),
      replayed: false,
    };
  }

  for (const expired of idempotencyKeys.find(
    (entry) => Date.parse(entry.expiresAt) <= now,
  )) {
    idempotencyKeys.delete(expired.id);
  }

  const requestFingerprint = fingerprint({
    operation,
    storeId,
    request,
  });
  const existing = idempotencyKeys.findOne(
    (entry) => entry.userId === user.userId && entry.key === key,
  );

  if (existing) {
    if (
      existing.operation !== operation
      || existing.requestFingerprint !== requestFingerprint
    ) {
      throw new AppError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        '该 Idempotency-Key 已用于不同请求',
      );
    }

    return {
      value: structuredClone(existing.response),
      replayed: true,
    };
  }

  const value = execute();
  const timestamp = new Date(now).toISOString();
  idempotencyKeys.create({
    id: entryId(user.userId, key),
    userId: user.userId,
    storeId: storeId ?? null,
    key,
    operation,
    requestFingerprint,
    response: structuredClone(value),
    createdAt: timestamp,
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MILLISECONDS).toISOString(),
  });

  return {
    value,
    replayed: false,
  };
}
