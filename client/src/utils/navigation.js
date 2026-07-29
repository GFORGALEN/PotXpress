import {
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';

export const ROLE_LABELS = Object.freeze({
  system_admin: '系统管理员',
  store_admin: '门店管理员',
  store_staff: '门店员工',
});

export const NAV_ITEMS = Object.freeze([
  {
    to: '/',
    label: '桌台看板',
    shortLabel: '看板',
    icon: LayoutDashboard,
    roles: ['system_admin', 'store_admin', 'store_staff'],
    requiresStore: true,
  },
  {
    to: '/admin/records',
    label: '今日记录',
    shortLabel: '记录',
    icon: ClipboardList,
    roles: ['system_admin', 'store_admin', 'store_staff'],
    requiresStore: true,
  },
  {
    to: '/admin/tables',
    label: '桌台管理',
    icon: ListChecks,
    roles: ['system_admin', 'store_admin'],
    requiresStore: true,
  },
  {
    to: '/admin/settings',
    label: '门店设置',
    icon: Settings,
    roles: ['system_admin', 'store_admin'],
    requiresStore: true,
  },
  {
    to: '/admin/audit-logs',
    label: '操作日志',
    icon: ShieldCheck,
    roles: ['system_admin', 'store_admin'],
    requiresStore: true,
  },
  {
    to: '/admin/stores',
    label: '门店管理',
    icon: Store,
    roles: ['system_admin'],
    requiresStore: false,
  },
  {
    to: '/admin/users',
    label: '用户管理',
    icon: Users,
    roles: ['system_admin'],
    requiresStore: false,
  },
]);

export function navigationForRole(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
