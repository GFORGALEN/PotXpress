import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canvasSchema,
  decorationSchema,
  tableLayoutSchema,
} from '@potxpress/contracts';
import { BRANCH_FLOOR_PLANS } from '../src/layoutPresets/branchFloorPlans.js';

function tableNames(plan) {
  return plan.tables.map((item) => item.name);
}

function tableByName(plan, name) {
  return plan.tables.find((item) => item.name === name);
}

function overlaps(left, right) {
  return left.xRatio < right.xRatio + right.widthRatio
    && left.xRatio + left.widthRatio > right.xRatio
    && left.yRatio < right.yRatio + right.heightRatio
    && left.yRatio + left.heightRatio > right.yRatio;
}

test('branch floor plans use landscape tablet canvases and preserve table sets', () => {
  const byCode = new Map(BRANCH_FLOOR_PLANS.map((plan) => [plan.store.code, plan]));
  const albany = byCode.get('ALBANY');
  const east = byCode.get('EAST');
  const brownsBay = byCode.get('BROWNSBAY');

  assert.ok(albany.canvas.virtualWidth > albany.canvas.virtualHeight);
  assert.ok(east.canvas.virtualWidth > east.canvas.virtualHeight);
  assert.ok(brownsBay.canvas.virtualWidth > brownsBay.canvas.virtualHeight);
  assert.deepEqual(
    [albany.canvas.virtualWidth, albany.canvas.virtualHeight],
    [2400, 1350],
  );
  assert.deepEqual(
    [east.canvas.virtualWidth, east.canvas.virtualHeight],
    [2400, 1350],
  );
  assert.deepEqual(
    [brownsBay.canvas.virtualWidth, brownsBay.canvas.virtualHeight],
    [2400, 1350],
  );
  assert.equal(albany.tables.length, 33);
  assert.equal(east.tables.length, 40);
  assert.equal(brownsBay.tables.length, 37);
  assert.deepEqual(
    tableNames(albany).filter((name) => name.startsWith('外')),
    ['外1', '外2', '外3', '外4', '外5', '外6', '外7', '外8'],
  );
  assert.ok(tableNames(brownsBay).includes('W7'));
  assert.deepEqual(
    tableNames(brownsBay).filter((name) => name.startsWith('A')),
    Array.from({ length: 20 }, (_, index) => `A${index + 1}`),
  );
  assert.deepEqual(
    tableNames(brownsBay).filter((name) => name.startsWith('D')),
    ['D1', 'D2', 'D3'],
  );
  assert.equal(east.decorations.length, 0);
  assert.equal(brownsBay.decorations.length, 0);

  // Both portrait references are rotated counter-clockwise for landscape.
  assert.ok(tableByName(east, 'W1').layout.xRatio < tableByName(east, 'A1').layout.xRatio);
  assert.ok(tableByName(east, 'A1').layout.xRatio < tableByName(east, 'A4').layout.xRatio);
  assert.ok(tableByName(east, 'A1').layout.yRatio < tableByName(east, 'B1').layout.yRatio);
  assert.ok(tableByName(east, 'C1').layout.xRatio < tableByName(east, 'C11').layout.xRatio);
  assert.ok(tableByName(east, 'C1').layout.yRatio < tableByName(east, 'D1').layout.yRatio);
  assert.ok(tableByName(east, 'D1').layout.xRatio < tableByName(east, 'D11').layout.xRatio);
  assert.ok(tableByName(east, 'F1').layout.xRatio < tableByName(east, 'F5').layout.xRatio);

  assert.ok(tableByName(brownsBay, 'A6').layout.yRatio < tableByName(brownsBay, 'A1').layout.yRatio);
  assert.ok(tableByName(brownsBay, 'C1').layout.xRatio < tableByName(brownsBay, 'C4').layout.xRatio);
  assert.ok(tableByName(brownsBay, 'C1').layout.yRatio < tableByName(brownsBay, 'A7').layout.yRatio);
  assert.ok(tableByName(brownsBay, 'A7').layout.xRatio < tableByName(brownsBay, 'A15').layout.xRatio);
  assert.ok(tableByName(brownsBay, 'A16').layout.xRatio < tableByName(brownsBay, 'A20').layout.xRatio);
  assert.ok(tableByName(brownsBay, 'W1').layout.xRatio < tableByName(brownsBay, 'W3').layout.xRatio);
  for (const plan of BRANCH_FLOOR_PLANS) {
    const view = plan.canvas.defaultViewBounds;
    assert.ok(view);
    assert.ok(!plan.decorations.some(({ type }) => (
      type === 'entrance' || type === 'cashier'
    )));
    for (const { layout } of plan.tables) {
      assert.ok(layout.xRatio >= view.xRatio);
      assert.ok(layout.yRatio >= view.yRatio);
      assert.ok(
        layout.xRatio + layout.widthRatio <= view.xRatio + view.widthRatio + 0.000001,
      );
      assert.ok(
        layout.yRatio + layout.heightRatio <= view.yRatio + view.heightRatio + 0.000001,
      );
      assert.ok(layout.widthRatio * plan.canvas.virtualWidth >= 120);
      assert.ok(layout.heightRatio * plan.canvas.virtualHeight >= 120);
    }
  }
});

test('branch floor plan geometry is valid, contained, unique, and non-overlapping', () => {
  for (const plan of BRANCH_FLOOR_PLANS) {
    canvasSchema.parse(plan.canvas);
    plan.decorations.forEach((item) => decorationSchema.parse(item));
    const seenNames = new Set();
    const seenNumbers = new Set();

    for (const item of plan.tables) {
      tableLayoutSchema.parse(item.layout);
      assert.ok(!seenNames.has(item.name), `${plan.store.code}: duplicate ${item.name}`);
      assert.ok(!seenNumbers.has(item.number), `${plan.store.code}: duplicate number ${item.number}`);
      seenNames.add(item.name);
      seenNumbers.add(item.number);
      assert.ok(item.layout.xRatio + item.layout.widthRatio <= 1.000001);
      assert.ok(item.layout.yRatio + item.layout.heightRatio <= 1.000001);
    }

    for (let leftIndex = 0; leftIndex < plan.tables.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < plan.tables.length; rightIndex += 1) {
        assert.equal(
          overlaps(plan.tables[leftIndex].layout, plan.tables[rightIndex].layout),
          false,
          `${plan.store.code}: ${plan.tables[leftIndex].name} overlaps ${plan.tables[rightIndex].name}`,
        );
      }
    }
  }
});
