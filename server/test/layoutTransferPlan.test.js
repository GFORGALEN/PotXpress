import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLayoutTransferPlan } from '../src/utils/layoutTransferPlan.js';

function table(id, name, number, sortOrder = number) {
  return {
    id,
    storeId: 'source',
    name,
    number,
    sortOrder,
    enabled: true,
    shape: 'rectangle',
    capacity: 4,
    area: '大厅',
    note: null,
    defaultDurationMinutes: 90,
    layout: {
      xRatio: 0.1,
      yRatio: 0.1,
      widthRatio: 0.1,
      heightRatio: 0.1,
      rotation: 0,
      zIndex: sortOrder,
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

test('桌台迁移按名称保留目标 ID，并归档目标独有桌台', () => {
  const plan = buildLayoutTransferPlan({
    sourceTables: [table('source_a1', 'A1', 4), table('source_out1', '外1', 1)],
    targetTables: [table('target_a1', 'A1', 1), table('target_a2', 'A2', 2)],
    targetStoreId: 'store_render',
    archiveTargetOnly: true,
  });

  assert.equal(plan.createdCount, 1);
  assert.equal(plan.updatedCount, 1);
  assert.equal(plan.archivedCount, 1);
  assert.equal(plan.desiredTables[0].id, 'target_a1');
  assert.equal(plan.desiredTables[0].number, 4);
  assert.match(plan.desiredTables[1].id, /^table_xfer_[0-9a-f]{32}$/);
  assert.equal(plan.archivedTables[0].id, 'target_a2');
  assert.equal(plan.archivedTables[0].enabled, false);
  assert.ok(![1, 4].includes(plan.archivedTables[0].number));
});
test('目标独有桌台必须显式允许归档', () => {
  assert.throws(
    () => buildLayoutTransferPlan({
      sourceTables: [table('source_a1', 'A1', 1)],
      targetTables: [table('target_a1', 'A1', 1), table('target_a2', 'A2', 2)],
      targetStoreId: 'store_render',
    }),
    /--archive-target-only/,
  );
});

test('源门店重名或重复桌号时拒绝迁移', () => {
  assert.throws(
    () => buildLayoutTransferPlan({
      sourceTables: [table('one', 'A1', 1), table('two', ' a1 ', 2)],
      targetTables: [],
      targetStoreId: 'store_render',
    }),
    /重名桌台/,
  );
  assert.throws(
    () => buildLayoutTransferPlan({
      sourceTables: [table('one', 'A1', 1), table('two', 'A2', 1)],
      targetTables: [],
      targetStoreId: 'store_render',
    }),
    /重复桌号/,
  );
});
