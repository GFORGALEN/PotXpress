import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationForRole, ROLE_LABELS } from '../src/utils/navigation.js';
import { resolveEnabledStore } from '../src/utils/storeSelection.js';

const stores = [
  { id: 'disabled', name: '暂停营业门店', enabled: false },
  { id: 'first', name: '皇后街店', enabled: true },
  { id: 'saved', name: '海港店', enabled: true },
];

test('resolveEnabledStore restores an enabled saved store', () => {
  assert.equal(resolveEnabledStore(stores, 'saved')?.id, 'saved');
});

test('resolveEnabledStore falls back to the first enabled store', () => {
  assert.equal(resolveEnabledStore(stores, 'disabled')?.id, 'first');
  assert.equal(resolveEnabledStore(stores, 'missing')?.id, 'first');
});

test('resolveEnabledStore returns null when no store is enabled', () => {
  assert.equal(resolveEnabledStore([{ id: 'closed', enabled: false }], 'closed'), null);
});

test('navigation exposes only routes allowed for each role', () => {
  assert.equal(navigationForRole('store_staff').length, 2);
  assert.equal(navigationForRole('store_admin').length, 5);
  assert.equal(navigationForRole('system_admin').length, 7);
  assert.deepEqual(
    navigationForRole('store_staff').map((item) => item.to),
    ['/', '/admin/records'],
  );
});

test('all supported roles have a user-facing label', () => {
  assert.deepEqual(Object.keys(ROLE_LABELS).sort(), [
    'store_admin',
    'store_staff',
    'system_admin',
  ]);
});
