export const AUDIT_ACTION_LABELS = Object.freeze({
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'auth.password_change': '修改密码',
  'timer.start': '开始计时',
  'timer.pause': '暂停计时',
  'timer.resume': '继续计时',
  'timer.adjust': '调整计时',
  'timer.reset': '重置清台',
  'timer.acknowledge': '确认超时',
  'table.create': '创建桌台',
  'table.batch_create': '批量创建桌台',
  'table.update': '更新桌台',
  'table.delete': '停用桌台',
  'table_group.create': '创建拼桌组',
  'table_group.delete': '解除拼桌组',
  'layout.save': '保存布局',
  'setting.update': '更新设置',
  'store.create': '创建门店',
  'store.update': '更新门店',
  'user.create': '创建用户',
  'user.update': '更新用户',
});

export function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
