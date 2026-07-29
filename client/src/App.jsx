import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/auth/RequireAuth.jsx';
import { RequireRole } from './components/auth/RequireRole.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { AccessDeniedPage } from './pages/AccessDeniedPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';

const ALL_ROLES = ['system_admin', 'store_admin', 'store_staff'];
const ADMIN_ROLES = ['system_admin', 'store_admin'];

function GuardedPage({ roles, requiresStore = false, children }) {
  return (
    <RequireRole roles={roles} requiresStore={requiresStore}>
      {children}
    </RequireRole>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={(
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        )}
      >
        <Route
          index
          element={(
            <GuardedPage roles={ALL_ROLES} requiresStore>
              <DashboardPage />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/records"
          element={(
            <GuardedPage roles={ALL_ROLES} requiresStore>
              <PlaceholderPage
                title="今日记录"
                description="记录查询与 CSV 导出将在后台页面模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/tables"
          element={(
            <GuardedPage roles={ADMIN_ROLES} requiresStore>
              <PlaceholderPage
                title="桌台管理"
                description="桌台增删改和批量创建将在后续模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/settings"
          element={(
            <GuardedPage roles={ADMIN_ROLES} requiresStore>
              <PlaceholderPage
                title="门店设置"
                description="计时默认值、提醒阈值与声音设置将在后续模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/audit-logs"
          element={(
            <GuardedPage roles={ADMIN_ROLES} requiresStore>
              <PlaceholderPage
                title="操作日志"
                description="按日期和动作筛选的审计日志将在后台页面模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/stores"
          element={(
            <GuardedPage roles={['system_admin']}>
              <PlaceholderPage
                title="门店管理"
                description="门店创建、启停与临时查看停用门店将在后续模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route
          path="admin/users"
          element={(
            <GuardedPage roles={['system_admin']}>
              <PlaceholderPage
                title="用户管理"
                description="账号、角色和密码管理将在后续模块接入。"
              />
            </GuardedPage>
          )}
        />
        <Route path="forbidden" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
