import pg from 'pg';
import { newDb } from 'pg-mem';
import { config } from '../config.js';

const { Pool } = pg;
const col = (property, name, options = {}) => ({ property, name, ...options });
const resource = (table, idField, keyColumn, columns) => ({ table, idField, keyColumn, columns });

export const DATABASE_RESOURCES = Object.freeze({
  'stores.json': resource('stores', 'id', 'id', [
    col('id', 'id'), col('name', 'name'), col('code', 'code'), col('normalizedCode', 'normalized_code'),
    col('address', 'address'), col('timezone', 'timezone'), col('enabled', 'enabled'),
    col('createdAt', 'created_at', { timestamp: true }), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
  'users.json': resource('users', 'id', 'id', [
    col('id', 'id'), col('username', 'username'), col('normalizedUsername', 'normalized_username'),
    col('displayName', 'display_name'), col('passwordHash', 'password_hash'), col('role', 'role'),
    col('storeId', 'store_id'), col('enabled', 'enabled'), col('tokenVersion', 'token_version'),
    col('createdAt', 'created_at', { timestamp: true }), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
  'tables.json': resource('restaurant_tables', 'id', 'id', [
    col('id', 'id'), col('storeId', 'store_id'), col('name', 'name'), col('number', 'number'),
    col('sortOrder', 'sort_order'), col('enabled', 'enabled'), col('shape', 'shape'),
    col('capacity', 'capacity'), col('area', 'area'), col('note', 'note'),
    col('defaultDurationMinutes', 'default_duration_minutes'), col('layout', 'layout', { json: true }),
    col('createdAt', 'created_at', { timestamp: true }), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
  'tableGroups.json': resource('table_groups', 'id', 'id', [
    col('id', 'id'), col('storeId', 'store_id'), col('name', 'name'),
    col('type', 'type'), col('enabled', 'enabled'), col('createdAt', 'created_at', { timestamp: true }),
    col('updatedAt', 'updated_at', { timestamp: true }), col('createdBy', 'created_by'),
  ]),
  'activeTimers.json': resource('active_timers', 'id', 'id', [
    col('id', 'id'), col('storeId', 'store_id'), col('tableId', 'table_id'), col('targetType', 'target_type'),
    col('groupId', 'group_id'),
    col('tableNameSnapshot', 'table_name_snapshot'), col('tableNumberSnapshot', 'table_number_snapshot'),
    col('startTime', 'start_time', { timestamp: true }), col('plannedDurationSeconds', 'planned_duration_seconds'),
    col('status', 'status'), col('pauseStartedAt', 'pause_started_at', { timestamp: true }),
    col('totalPausedSeconds', 'total_paused_seconds'),
    col('overtimeAcknowledged', 'overtime_acknowledged'), col('startedBy', 'started_by'),
    col('startedByNameSnapshot', 'started_by_name_snapshot'),
    col('createdAt', 'created_at', { timestamp: true }), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
  'records.json': resource('timer_records', 'id', 'id', [
    col('id', 'id'), col('timerId', 'timer_id'), col('storeId', 'store_id'), col('tableId', 'table_id'),
    col('targetType', 'target_type'), col('groupId', 'group_id'), col('tableNameSnapshot', 'table_name_snapshot'),
    col('tableNumberSnapshot', 'table_number_snapshot'), col('startTime', 'start_time', { timestamp: true }),
    col('plannedEndTime', 'planned_end_time', { timestamp: true }),
    col('effectiveEndTimeAtReset', 'effective_end_time_at_reset', { timestamp: true }),
    col('actualEndTime', 'actual_end_time', { timestamp: true }),
    col('plannedDurationSeconds', 'planned_duration_seconds'), col('actualDurationSeconds', 'actual_duration_seconds'),
    col('totalPausedSeconds', 'total_paused_seconds'),
    col('startedBy', 'started_by'), col('startedByNameSnapshot', 'started_by_name_snapshot'),
    col('resetBy', 'reset_by'), col('resetByNameSnapshot', 'reset_by_name_snapshot'),
    col('finalStatus', 'final_status'), col('createdAt', 'created_at', { timestamp: true }),
  ]),
  'timerInterventionRecords.json': resource('timer_intervention_records', 'id', 'id', [
    col('id', 'id'), col('timerId', 'timer_id'), col('storeId', 'store_id'),
    col('tableId', 'table_id'), col('targetType', 'target_type'), col('groupId', 'group_id'),
    col('memberTableIds', 'member_table_ids', { json: true }),
    col('tableNameSnapshot', 'table_name_snapshot'),
    col('tableNumberSnapshot', 'table_number_snapshot'), col('action', 'action'),
    col('reminderNumber', 'reminder_number'), col('thresholdSeconds', 'threshold_seconds'),
    col('overtimeSeconds', 'overtime_seconds'), col('timerRecordId', 'timer_record_id'),
    col('actorUserId', 'actor_user_id'), col('actorNameSnapshot', 'actor_name_snapshot'),
    col('createdAt', 'created_at', { timestamp: true }),
  ]),
  'settings.json': resource('store_settings', 'storeId', 'store_id', [
    col('storeId', 'store_id'), col('defaultDurationMinutes', 'default_duration_minutes'),
    col('warningThresholdMinutes', 'warning_threshold_minutes'), col('timezone', 'timezone'),
    col('soundEnabled', 'sound_enabled'), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
  'auditLogs.json': resource('audit_logs', 'id', 'id', [
    col('id', 'id'), col('timestamp', 'occurred_at', { timestamp: true }), col('userId', 'user_id'),
    col('userNameSnapshot', 'user_name_snapshot'), col('storeId', 'store_id'), col('action', 'action'),
    col('targetType', 'target_type'), col('targetId', 'target_id'),
    col('dataBefore', 'data_before', { json: true }), col('dataAfter', 'data_after', { json: true }),
  ]),
  'layouts.json': resource('store_layouts', 'storeId', 'store_id', [
    col('storeId', 'store_id'), col('layoutVersion', 'layout_version'), col('canvas', 'canvas', { json: true }),
    col('decorations', 'decorations', { json: true }), col('updatedAt', 'updated_at', { timestamp: true }),
    col('updatedBy', 'updated_by'),
  ]),
  'idempotencyKeys.json': resource('idempotency_keys', 'id', 'id', [
    col('id', 'id'), col('userId', 'user_id'), col('storeId', 'store_id'), col('key', 'idempotency_key'),
    col('operation', 'operation'), col('requestFingerprint', 'request_fingerprint'),
    col('response', 'response', { json: true }), col('createdAt', 'created_at', { timestamp: true }),
    col('expiresAt', 'expires_at', { timestamp: true }),
  ]),
  'realtimeEvents.json': resource('realtime_events', 'id', 'id', [
    col('id', 'id'), col('storeId', 'store_id'), col('version', 'version'), col('type', 'type'),
    col('entityType', 'entity_type'), col('entityId', 'entity_id'), col('payload', 'event_payload', { json: true }),
    col('createdAt', 'created_at', { timestamp: true }),
  ]),
  'metadata.json': resource('app_metadata', null, 'id', [
    col('_id', 'id'), col('schemaVersion', 'schema_version'), col('updatedAt', 'updated_at', { timestamp: true }),
  ]),
});

const adjustmentColumns = [
  col('type', 'type'), col('seconds', 'seconds'), col('requestedSeconds', 'requested_seconds'),
  col('reason', 'reason'), col('by', 'adjusted_by'), col('byNameSnapshot', 'adjusted_by_name_snapshot'),
  col('at', 'occurred_at', { timestamp: true }),
];

const CHILD_RESOURCES = Object.freeze({
  'tableGroups.json': [
    { table: 'table_group_members', parentColumn: 'group_id', property: 'tableIds', valueColumn: 'table_id' },
  ],
  'activeTimers.json': [
    { table: 'active_timer_members', parentColumn: 'timer_id', property: 'memberTableIds', valueColumn: 'table_id' },
    { table: 'active_timer_adjustments', parentColumn: 'timer_id', property: 'adjustments', columns: adjustmentColumns },
  ],
  'records.json': [
    { table: 'timer_record_members', parentColumn: 'record_id', property: 'memberTableIds', valueColumn: 'table_id' },
    { table: 'timer_record_adjustments', parentColumn: 'record_id', property: 'adjustments', columns: adjustmentColumns },
  ],
});

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL,
    normalized_code TEXT NOT NULL UNIQUE, address TEXT NULL, timezone TEXT NOT NULL, enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, normalized_username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL,
    store_id TEXT NULL REFERENCES stores(id), enabled BOOLEAN NOT NULL, token_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS restaurant_tables (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL, number INTEGER NOT NULL, sort_order INTEGER NOT NULL, enabled BOOLEAN NOT NULL,
    shape TEXT NOT NULL, capacity INTEGER NOT NULL, area TEXT NOT NULL, note TEXT NULL,
    default_duration_minutes INTEGER NULL, layout JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL, UNIQUE (store_id, number))`,
  `CREATE TABLE IF NOT EXISTS table_groups (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id),
    name TEXT NOT NULL, type TEXT NOT NULL, enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, created_by TEXT NOT NULL REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS table_group_members (group_id TEXT NOT NULL REFERENCES table_groups(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES restaurant_tables(id), position INTEGER NOT NULL,
    PRIMARY KEY (group_id, table_id), UNIQUE (group_id, position))`,
  `CREATE TABLE IF NOT EXISTS active_timers (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id),
    table_id TEXT NOT NULL REFERENCES restaurant_tables(id), target_type TEXT NOT NULL,
    group_id TEXT NULL REFERENCES table_groups(id),
    table_name_snapshot TEXT NOT NULL, table_number_snapshot INTEGER NOT NULL, start_time TIMESTAMPTZ NOT NULL,
    planned_duration_seconds INTEGER NOT NULL, status TEXT NOT NULL, pause_started_at TIMESTAMPTZ NULL,
    total_paused_seconds INTEGER NOT NULL, overtime_acknowledged BOOLEAN NOT NULL,
    started_by TEXT NOT NULL REFERENCES users(id), started_by_name_snapshot TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, UNIQUE (store_id, table_id))`,
  `CREATE TABLE IF NOT EXISTS active_timer_members (timer_id TEXT NOT NULL REFERENCES active_timers(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES restaurant_tables(id), position INTEGER NOT NULL,
    PRIMARY KEY (timer_id, table_id), UNIQUE (timer_id, position))`,
  `CREATE TABLE IF NOT EXISTS active_timer_adjustments (timer_id TEXT NOT NULL REFERENCES active_timers(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, type TEXT NOT NULL, seconds INTEGER NOT NULL, requested_seconds INTEGER NOT NULL,
    reason TEXT NULL, adjusted_by TEXT NOT NULL REFERENCES users(id), adjusted_by_name_snapshot TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (timer_id, position))`,
  `CREATE TABLE IF NOT EXISTS timer_records (id TEXT PRIMARY KEY, timer_id TEXT NOT NULL UNIQUE,
    store_id TEXT NOT NULL REFERENCES stores(id), table_id TEXT NOT NULL REFERENCES restaurant_tables(id),
    target_type TEXT NOT NULL, group_id TEXT NULL,
    table_name_snapshot TEXT NOT NULL, table_number_snapshot INTEGER NOT NULL, start_time TIMESTAMPTZ NOT NULL,
    planned_end_time TIMESTAMPTZ NOT NULL, effective_end_time_at_reset TIMESTAMPTZ NOT NULL,
    actual_end_time TIMESTAMPTZ NOT NULL, planned_duration_seconds INTEGER NOT NULL,
    actual_duration_seconds INTEGER NOT NULL, total_paused_seconds INTEGER NOT NULL,
    started_by TEXT NOT NULL, started_by_name_snapshot TEXT NOT NULL, reset_by TEXT NOT NULL,
    reset_by_name_snapshot TEXT NOT NULL, final_status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS timer_record_members (record_id TEXT NOT NULL REFERENCES timer_records(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL REFERENCES restaurant_tables(id), position INTEGER NOT NULL,
    PRIMARY KEY (record_id, table_id), UNIQUE (record_id, position))`,
  `CREATE TABLE IF NOT EXISTS timer_record_adjustments (record_id TEXT NOT NULL REFERENCES timer_records(id) ON DELETE CASCADE,
    position INTEGER NOT NULL, type TEXT NOT NULL, seconds INTEGER NOT NULL, requested_seconds INTEGER NOT NULL,
    reason TEXT NULL, adjusted_by TEXT NOT NULL, adjusted_by_name_snapshot TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (record_id, position))`,
  `CREATE TABLE IF NOT EXISTS timer_intervention_records (id TEXT PRIMARY KEY,
    timer_id TEXT NOT NULL, store_id TEXT NOT NULL REFERENCES stores(id),
    table_id TEXT NOT NULL, target_type TEXT NOT NULL,
    group_id TEXT NULL, member_table_ids JSONB NOT NULL,
    table_name_snapshot TEXT NOT NULL, table_number_snapshot INTEGER NOT NULL,
    action TEXT NOT NULL, reminder_number INTEGER NULL, threshold_seconds INTEGER NULL,
    overtime_seconds INTEGER NOT NULL, timer_record_id TEXT NULL,
    actor_user_id TEXT NULL, actor_name_snapshot TEXT NULL, created_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS store_settings (store_id TEXT PRIMARY KEY REFERENCES stores(id),
    default_duration_minutes INTEGER NOT NULL, warning_threshold_minutes INTEGER NOT NULL,
    timezone TEXT NOT NULL, sound_enabled BOOLEAN NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL,
    user_id TEXT NULL, user_name_snapshot TEXT NULL, store_id TEXT NULL, action TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id TEXT NULL, data_before JSONB NULL, data_after JSONB NULL)`,
  `CREATE TABLE IF NOT EXISTS store_layouts (store_id TEXT PRIMARY KEY REFERENCES stores(id),
    layout_version INTEGER NOT NULL, canvas JSONB NOT NULL, decorations JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL, updated_by TEXT NULL)`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, store_id TEXT NULL,
    idempotency_key TEXT NOT NULL, operation TEXT NOT NULL, request_fingerprint TEXT NOT NULL,
    response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, idempotency_key))`,
  `CREATE TABLE IF NOT EXISTS realtime_events (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id),
    version INTEGER NOT NULL, type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NULL,
    event_payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE (store_id, version))`,
  `CREATE TABLE IF NOT EXISTS app_metadata (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL)`,
];

const INDEX_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS users_store_role_idx ON users (store_id, role, enabled)',
  'CREATE INDEX IF NOT EXISTS restaurant_tables_store_sort_idx ON restaurant_tables (store_id, sort_order)',
  'CREATE INDEX IF NOT EXISTS table_groups_store_enabled_idx ON table_groups (store_id, enabled)',
  'CREATE INDEX IF NOT EXISTS active_timers_store_status_idx ON active_timers (store_id, status)',
  'CREATE INDEX IF NOT EXISTS timer_records_store_start_idx ON timer_records (store_id, start_time DESC)',
  'CREATE INDEX IF NOT EXISTS timer_interventions_store_time_idx ON timer_intervention_records (store_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS timer_interventions_timer_reminder_idx ON timer_intervention_records (timer_id, reminder_number)',
  'CREATE INDEX IF NOT EXISTS audit_logs_store_time_idx ON audit_logs (store_id, occurred_at DESC)',
  'CREATE INDEX IF NOT EXISTS audit_logs_user_time_idx ON audit_logs (user_id, occurred_at DESC)',
  'CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx ON idempotency_keys (expires_at)',
  'CREATE INDEX IF NOT EXISTS realtime_events_store_created_idx ON realtime_events (store_id, created_at DESC)',
];

function createPool() {
  if (config.useMemoryDatabase) {
    const memoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
    return new (memoryDatabase.adapters.createPg().Pool)();
  }
  return new Pool({ connectionString: config.databaseUrl, max: config.databasePoolSize,
    connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false });
}

export const databasePool = createPool();
let initializationPromise = null;

function definitionFor(filename) {
  const definition = DATABASE_RESOURCES[filename];
  if (!definition) throw new Error(`Unknown database resource: ${filename}`);
  return definition;
}

const ARRAY_JSON_PROPERTIES = new Set([
  'tableIds', 'memberTableIds', 'adjustments', 'decorations',
]);
const toDatabaseValue = (value, descriptor) => descriptor.json
  ? JSON.stringify(value ?? (ARRAY_JSON_PROPERTIES.has(descriptor.property) ? [] : null))
  : (value ?? null);
function toApiValue(value, descriptor) {
  if (descriptor.timestamp && value !== null && value !== undefined) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
  if (descriptor.json && value == null && ARRAY_JSON_PROPERTIES.has(descriptor.property)) return [];
  if (descriptor.json && typeof value === 'string') return JSON.parse(value);
  return value;
}

function hydrateResource(filename, rows) {
  const definition = definitionFor(filename);
  const values = rows.map((row) => {
    const record = Object.fromEntries(
      definition.columns
        .filter(({ property }) => property !== '_id')
        .map((descriptor) => [
          descriptor.property,
          toApiValue(row[descriptor.name], descriptor),
        ]),
    );

    for (const [index, child] of (CHILD_RESOURCES[filename] ?? []).entries()) {
      const childRows = row[`__child_${index}`] ?? [];
      record[child.property] = child.valueColumn
        ? childRows.map((childRow) => childRow[child.valueColumn])
        : childRows.map((childRow) => Object.fromEntries(
          child.columns.map((descriptor) => [
            descriptor.property,
            toApiValue(childRow[descriptor.name], descriptor),
          ]),
        ));
    }

    return record;
  });

  return definition.idField ? values : (values[0] ?? null);
}

function buildScopeClause(filename, definition, scope, parameters) {
  const clauses = [];
  const parameter = (value) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };
  const columnFor = (property) => definition.columns.find(
    (descriptor) => descriptor.property === property,
  )?.name;

  if (scope.none) clauses.push('FALSE');
  if (scope.id !== undefined) {
    clauses.push(`resource_row.${definition.keyColumn} = ${parameter(scope.id)}`);
  }
  if (scope.storeId !== undefined) {
    const storeColumn = filename === 'stores.json' ? 'id' : columnFor('storeId');
    if (!storeColumn) throw new Error(`${filename} 不支持 storeId 查询范围`);
    clauses.push(`resource_row.${storeColumn} = ${parameter(scope.storeId)}`);
  }
  if (scope.userId !== undefined) {
    const userColumn = columnFor('userId');
    if (!userColumn) throw new Error(`${filename} 不支持 userId 查询范围`);
    clauses.push(`resource_row.${userColumn} = ${parameter(scope.userId)}`);
  }
  if (scope.key !== undefined && scope.key !== null) {
    const keyColumn = columnFor('key');
    if (!keyColumn) throw new Error(`${filename} 不支持 key 查询范围`);
    clauses.push(`resource_row.${keyColumn} = ${parameter(scope.key)}`);
  }
  if (scope.startTimeFrom !== undefined) {
    const startColumn = columnFor('startTime');
    if (!startColumn) throw new Error(`${filename} 不支持 startTimeFrom 查询范围`);
    clauses.push(`resource_row.${startColumn} >= ${parameter(scope.startTimeFrom)}`);
  }
  if (scope.startTimeTo !== undefined) {
    const startColumn = columnFor('startTime');
    if (!startColumn) throw new Error(`${filename} 不支持 startTimeTo 查询范围`);
    clauses.push(`resource_row.${startColumn} < ${parameter(scope.startTimeTo)}`);
  }
  if (scope.activeTimersOnly) {
    const storePlaceholder = parameter(scope.storeId);
    clauses.push(`EXISTS (
      SELECT 1 FROM active_timers scoped_timer
      WHERE scoped_timer.id = resource_row.timer_id
        AND scoped_timer.store_id = ${storePlaceholder}
    )`);
  }
  if (scope.relatedTableId !== undefined) {
    const storePlaceholder = parameter(scope.storeId);
    const tablePlaceholder = parameter(scope.relatedTableId);
    clauses.push(`EXISTS (
      SELECT 1 FROM active_timers scoped_timer
      WHERE scoped_timer.id = resource_row.timer_id
        AND scoped_timer.store_id = ${storePlaceholder}
        AND (
          scoped_timer.table_id = ${tablePlaceholder}
          OR EXISTS (
            SELECT 1 FROM active_timer_members scoped_member
            WHERE scoped_member.timer_id = scoped_timer.id
              AND scoped_member.table_id = ${tablePlaceholder}
          )
        )
    )`);
  }

  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function buildResourceAggregate(filename, scope, parameters, alias) {
  const definition = definitionFor(filename);
  const where = buildScopeClause(filename, definition, scope, parameters);
  const childColumns = (CHILD_RESOURCES[filename] ?? []).map((child, index) => (
    `COALESCE((
      SELECT jsonb_agg(child_row ORDER BY child_row.position)
      FROM ${child.table} child_row
      WHERE child_row.${child.parentColumn} = resource_row.${definition.keyColumn}
    ), '[]'::jsonb) AS "__child_${index}"`
  ));
  const limit = Number.isInteger(scope.limit) && scope.limit > 0
    ? ` LIMIT ${scope.limit}`
    : '';
  const orderDirection = scope.latest ? 'DESC' : 'ASC';
  const orderColumn = scope.orderBy
    ? definition.columns.find(({ property }) => property === scope.orderBy)?.name
    : definition.keyColumn;
  if (!orderColumn) throw new Error(`${filename} 不支持 ${scope.orderBy} 排序`);
  const selectedColumns = ['resource_row.*', ...childColumns].join(', ');

  return `(SELECT COALESCE(jsonb_agg(scoped_resource), '[]'::jsonb)
    FROM (
      SELECT ${selectedColumns}
      FROM ${definition.table} resource_row
      ${where}
      ORDER BY resource_row.${orderColumn} ${orderDirection}${limit}
    ) scoped_resource) AS "${alias}"`;
}

export async function readResources(client, resourceScopes) {
  if (resourceScopes.length === 0) return {};

  const parameters = [];
  const aliases = resourceScopes.map((_, index) => `resource_${index}`);
  const selections = resourceScopes.map(({ filename, scope = {} }, index) => (
    buildResourceAggregate(filename, scope, parameters, aliases[index])
  ));
  const result = await client.query(`SELECT ${selections.join(', ')}`, parameters);
  const row = result.rows[0];

  return Object.fromEntries(resourceScopes.map(({ filename }, index) => [
    filename,
    hydrateResource(filename, row[aliases[index]] ?? []),
  ]));
}

export async function readResource(client, filename, { forUpdate = false } = {}) {
  const definition = definitionFor(filename);
  const result = await client.query(`SELECT * FROM ${definition.table} ORDER BY ${definition.keyColumn}${forUpdate ? ' FOR UPDATE' : ''}`);
  const values = result.rows.map((row) => Object.fromEntries(
    definition.columns.filter(({ property }) => property !== '_id')
      .map((descriptor) => [descriptor.property, toApiValue(row[descriptor.name], descriptor)]),
  ));
  const byId = new Map(values.map((record) => [record[definition.idField], record]));
  for (const child of CHILD_RESOURCES[filename] ?? []) {
    for (const record of values) record[child.property] = [];
    const children = await client.query(
      `SELECT * FROM ${child.table} ORDER BY ${child.parentColumn}, position${forUpdate ? ' FOR UPDATE' : ''}`,
    );
    for (const row of children.rows) {
      const parent = byId.get(row[child.parentColumn]);
      if (!parent) continue;
      if (child.valueColumn) parent[child.property].push(row[child.valueColumn]);
      else parent[child.property].push(Object.fromEntries(
        child.columns.map((descriptor) => [
          descriptor.property,
          toApiValue(row[descriptor.name], descriptor),
        ]),
      ));
    }
  }
  return definition.idField ? values : (values[0] ?? null);
}

export async function replaceResource(client, filename, value) {
  const definition = definitionFor(filename);
  const records = definition.idField ? value : (value == null ? [] : [{ _id: 'singleton', ...value }]);
  const names = definition.columns.map(({ name }) => name);
  const updates = names.filter((name) => name !== definition.keyColumn)
    .map((name) => `${name} = EXCLUDED.${name}`).join(', ');
  for (const record of records) {
    const id = definition.idField ? record[definition.idField] : 'singleton';
    if (!id) throw new Error(`${filename} record is missing ${definition.idField}`);
    const values = definition.columns.map((descriptor) => toDatabaseValue(
      descriptor.property === '_id' ? 'singleton' : record[descriptor.property], descriptor,
    ));
    await client.query(
      `INSERT INTO ${definition.table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (${definition.keyColumn}) DO UPDATE SET ${updates}`,
      values,
    );
  }
  for (const child of CHILD_RESOURCES[filename] ?? []) {
    await client.query(`DELETE FROM ${child.table}`);
    for (const record of records) {
      for (const [position, item] of (record[child.property] ?? []).entries()) {
        const descriptors = child.valueColumn
          ? [col('_value', child.valueColumn)]
          : child.columns;
        const childNames = [child.parentColumn, 'position', ...descriptors.map(({ name }) => name)];
        const childValues = [
          record[definition.idField],
          position,
          ...descriptors.map((descriptor) => toDatabaseValue(
            descriptor.property === '_value' ? item : item[descriptor.property],
            descriptor,
          )),
        ];
        await client.query(
          `INSERT INTO ${child.table} (${childNames.join(', ')})
           VALUES (${childNames.map((_, index) => `$${index + 1}`).join(', ')})`,
          childValues,
        );
      }
    }
  }
  const ids = records.map((record) => definition.idField ? record[definition.idField] : 'singleton');
  if (ids.length === 0) await client.query(`DELETE FROM ${definition.table}`);
  else await client.query(`DELETE FROM ${definition.table} WHERE NOT (${definition.keyColumn} = ANY($1::text[]))`, [ids]);
}

function resourceRecords(definition, value) {
  return definition.idField
    ? value
    : (value == null ? [] : [{ _id: 'singleton', ...value }]);
}

function recordKey(definition, record) {
  return definition.idField ? record[definition.idField] : 'singleton';
}

async function upsertResourceRecords(client, definition, records) {
  if (records.length === 0) return;
  const names = definition.columns.map(({ name }) => name);
  const updates = names.filter((name) => name !== definition.keyColumn)
    .map((name) => `${name} = EXCLUDED.${name}`).join(', ');
  const values = [];
  const tuples = records.map((record) => {
    const rowValues = definition.columns.map((descriptor) => toDatabaseValue(
      descriptor.property === '_id' ? 'singleton' : record[descriptor.property],
      descriptor,
    ));
    const offset = values.length;
    values.push(...rowValues);
    return `(${rowValues.map((_, index) => `$${offset + index + 1}`).join(', ')})`;
  });
  await client.query(
    `INSERT INTO ${definition.table} (${names.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (${definition.keyColumn}) DO UPDATE SET ${updates}`,
    values,
  );
}

async function replaceRecordChildren(
  client,
  filename,
  definition,
  record,
  previous = null,
) {
  const parentId = recordKey(definition, record);
  for (const child of CHILD_RESOURCES[filename] ?? []) {
    const items = record[child.property] ?? [];
    if (
      previous
      && JSON.stringify(previous[child.property] ?? []) === JSON.stringify(items)
    ) {
      continue;
    }

    if (items.length === 0) {
      if (previous) {
        await client.query(
          `DELETE FROM ${child.table} WHERE ${child.parentColumn} = $1`,
          [parentId],
        );
      }
      continue;
    }

    const descriptors = child.valueColumn
      ? [col('_value', child.valueColumn)]
      : child.columns;
    const names = [
      child.parentColumn,
      'position',
      ...descriptors.map(({ name }) => name),
    ];
    const values = [];
    const tuples = items.map((item, position) => {
      const rowValues = [
        parentId,
        position,
        ...descriptors.map((descriptor) => toDatabaseValue(
          descriptor.property === '_value' ? item : item[descriptor.property],
          descriptor,
        )),
      ];
      const offset = values.length;
      values.push(...rowValues);
      return `(${rowValues.map((_, index) => `$${offset + index + 1}`).join(', ')})`;
    });
    if (previous) {
      await client.query(
        `DELETE FROM ${child.table} WHERE ${child.parentColumn} = $1`,
        [parentId],
      );
    }

    await client.query(
      `INSERT INTO ${child.table} (${names.join(', ')})
       VALUES ${tuples.join(', ')}`,
      values,
    );
  }
}

export async function syncResourceChanges(client, filename, before, after) {
  const definition = definitionFor(filename);
  const beforeRecords = resourceRecords(definition, before);
  const afterRecords = resourceRecords(definition, after);
  const beforeById = new Map(
    beforeRecords.map((record) => [recordKey(definition, record), record]),
  );
  const afterIds = new Set();
  const changedStoreIds = new Set();
  const changedRecords = [];

  for (const record of afterRecords) {
    const id = recordKey(definition, record);
    if (!id) throw new Error(`${filename} record is missing ${definition.idField}`);
    afterIds.add(id);
    const previous = beforeById.get(id);
    if (previous && JSON.stringify(previous) === JSON.stringify(record)) {
      continue;
    }
    if (filename === 'realtimeEvents.json' && record.storeId) {
      changedStoreIds.add(record.storeId);
    }
    changedRecords.push({ record, previous: previous ?? null });
  }

  await upsertResourceRecords(
    client,
    definition,
    changedRecords.map(({ record }) => record),
  );
  for (const { record, previous } of changedRecords) {
    await replaceRecordChildren(
      client,
      filename,
      definition,
      record,
      previous,
    );
  }

  const deletedIds = beforeRecords
    .map((record) => recordKey(definition, record))
    .filter((id) => !afterIds.has(id));
  if (deletedIds.length) {
    await client.query(
      `DELETE FROM ${definition.table}
       WHERE ${definition.keyColumn} IN (${deletedIds.map((_, index) => `$${index + 1}`).join(', ')})`,
      deletedIds,
    );
  }
  if (
    filename === 'realtimeEvents.json'
    && changedStoreIds.size > 0
    && !config.useMemoryDatabase
  ) {
    await client.query(
      `DELETE FROM realtime_events
       WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (
             PARTITION BY store_id ORDER BY version DESC
           ) AS event_position
           FROM realtime_events
           WHERE store_id = ANY($1::text[])
         ) ranked_events
         WHERE event_position > 1000
       )`,
      [[...changedStoreIds]],
    );
  }
}

const BATCH_SAFE_RESOURCES = new Set([
  'auditLogs.json',
  'idempotencyKeys.json',
  'realtimeEvents.json',
]);

export function canBatchResourceChanges(filename) {
  return BATCH_SAFE_RESOURCES.has(filename);
}

export async function syncResourceChangeBatch(client, changes) {
  const parameters = [];
  const ctes = [];
  const changedRealtimeStoreIds = new Set();
  let cleanExpiredIdempotencyKeys = false;
  const changedIdempotencyIds = new Set();
  const parameter = (value) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };

  for (const [changeIndex, { filename, before, after }] of changes.entries()) {
    if (!canBatchResourceChanges(filename)) {
      throw new Error(`${filename} 不支持批量资源同步`);
    }
    const definition = definitionFor(filename);
    const beforeRecords = resourceRecords(definition, before);
    const afterRecords = resourceRecords(definition, after);
    const beforeById = new Map(
      beforeRecords.map((record) => [recordKey(definition, record), record]),
    );
    const afterIds = new Set();
    const changedRecords = [];

    for (const record of afterRecords) {
      const id = recordKey(definition, record);
      if (!id) throw new Error(`${filename} record is missing ${definition.idField}`);
      afterIds.add(id);
      const previous = beforeById.get(id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(record)) {
        changedRecords.push(record);
        if (filename === 'idempotencyKeys.json') {
          cleanExpiredIdempotencyKeys = true;
          changedIdempotencyIds.add(id);
        }
        if (filename === 'realtimeEvents.json' && record.storeId) {
          changedRealtimeStoreIds.add(record.storeId);
        }
      }
    }

    if (changedRecords.length > 0) {
      const names = definition.columns.map(({ name }) => name);
      const updates = names.filter((name) => name !== definition.keyColumn)
        .map((name) => `${name} = EXCLUDED.${name}`).join(', ');
      const tuples = changedRecords.map((record) => {
        const values = definition.columns.map((descriptor) => toDatabaseValue(
          descriptor.property === '_id' ? 'singleton' : record[descriptor.property],
          descriptor,
        ));
        return `(${values.map((value) => parameter(value)).join(', ')})`;
      });
      ctes.push(
        `resource_${changeIndex}_upsert AS (
          INSERT INTO ${definition.table} (${names.join(', ')})
          VALUES ${tuples.join(', ')}
          ON CONFLICT (${definition.keyColumn}) DO UPDATE SET ${updates}
          RETURNING ${definition.keyColumn}
        )`,
      );
    }

    const deletedIds = beforeRecords
      .map((record) => recordKey(definition, record))
      .filter((id) => !afterIds.has(id));
    if (deletedIds.length > 0) {
      ctes.push(
        `resource_${changeIndex}_delete AS (
          DELETE FROM ${definition.table}
          WHERE ${definition.keyColumn} = ANY(${parameter(deletedIds)}::text[])
          RETURNING ${definition.keyColumn}
        )`,
      );
    }
  }

  if (changedRealtimeStoreIds.size > 0) {
    ctes.push(
      `realtime_event_cleanup AS (
        DELETE FROM realtime_events
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY store_id ORDER BY version DESC
            ) AS event_position
            FROM realtime_events
            WHERE store_id = ANY(${parameter([...changedRealtimeStoreIds])}::text[])
          ) ranked_events
          WHERE event_position > 999
        )
        RETURNING id
      )`,
    );
  }
  if (cleanExpiredIdempotencyKeys) {
    ctes.push(
      `expired_idempotency_cleanup AS (
        DELETE FROM idempotency_keys
        WHERE expires_at <= NOW()
          AND NOT (id = ANY(${parameter([...changedIdempotencyIds])}::text[]))
        RETURNING id
      )`,
    );
  }

  if (ctes.length > 0) {
    await client.query(`WITH ${ctes.join(', ')} SELECT 1 AS ok`, parameters);
  }
}

async function createNormalizedSchema(client) {
  for (const statement of CREATE_STATEMENTS) await client.query(statement);
  for (const statement of INDEX_STATEMENTS) await client.query(statement);
}

async function hasLegacyPayloadSchema(client) {
  const result = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'stores' AND column_name = 'payload'`);
  return result.rowCount > 0;
}

async function migrateLegacyPayloadSchema(client) {
  const snapshots = {};
  const legacyColumns = await client.query(`SELECT table_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND column_name = 'payload'`);
  const legacyTables = new Set(legacyColumns.rows.map((row) => row.table_name));
  for (const [filename, definition] of Object.entries(DATABASE_RESOURCES)) {
    if (!legacyTables.has(definition.table)) {
      snapshots[filename] = definition.idField ? [] : null;
      continue;
    }
    const result = await client.query(`SELECT payload FROM ${definition.table} ORDER BY id`);
    const values = result.rows.map(({ payload }) => payload);
    snapshots[filename] = definition.idField ? values : (values[0] ?? null);
  }
  for (const definition of Object.values(DATABASE_RESOURCES)) {
    if (legacyTables.has(definition.table)) {
      await client.query(`DROP TABLE ${definition.table}`);
    }
  }
  await createNormalizedSchema(client);
  for (const filename of ['stores.json', 'users.json', 'tables.json', 'tableGroups.json', 'activeTimers.json',
    'records.json', 'timerInterventionRecords.json', 'settings.json', 'auditLogs.json', 'layouts.json', 'idempotencyKeys.json',
    'realtimeEvents.json', 'metadata.json']) {
    await replaceResource(client, filename, snapshots[filename]);
  }
}

export async function initializeDatabase() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const client = await databasePool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await client.query('CREATE TABLE IF NOT EXISTS resource_locks (resource_name TEXT PRIMARY KEY)');
      if (await hasLegacyPayloadSchema(client)) await migrateLegacyPayloadSchema(client);
      else await createNormalizedSchema(client);
      for (const filename of Object.keys(DATABASE_RESOURCES)) {
        await client.query(`INSERT INTO resource_locks (resource_name) VALUES ($1)
          ON CONFLICT (resource_name) DO NOTHING`, [filename]);
      }
      await client.query(`INSERT INTO schema_migrations (version) VALUES (6) ON CONFLICT (version) DO NOTHING`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })();
  try { await initializationPromise; } catch (error) { initializationPromise = null; throw error; }
}

export async function checkDatabaseHealth() {
  await databasePool.query('SELECT 1 AS ok');
  return 'ok';
}
