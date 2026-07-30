import { Route, Routes } from 'react-router';
import { RequireAuth } from './components/auth/RequireAuth.jsx';
import { RequireRole } from './components/auth/RequireRole.jsx';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { AccessDeniedPage } from './pages/AccessDeniedPage.jsx';
import {
  AuditLogsPage,
  RecordsPage,
  SettingsPage,
  StoresAdminPage,
  TablesAdminPage,
  UsersAdminPage,
} from './pages/AdminPages.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';

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
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<GuardedPage roles={ALL_ROLES} requiresStore><DashboardPage /></GuardedPage>} />
        <Route path="admin/records" element={<GuardedPage roles={ALL_ROLES} requiresStore><RecordsPage /></GuardedPage>} />
        <Route path="admin/tables" element={<GuardedPage roles={ADMIN_ROLES} requiresStore><TablesAdminPage /></GuardedPage>} />
        <Route path="admin/settings" element={<GuardedPage roles={ADMIN_ROLES} requiresStore><SettingsPage /></GuardedPage>} />
        <Route path="admin/audit-logs" element={<GuardedPage roles={ADMIN_ROLES} requiresStore><AuditLogsPage /></GuardedPage>} />
        <Route path="admin/stores" element={<GuardedPage roles={['system_admin']}><StoresAdminPage /></GuardedPage>} />
        <Route path="admin/users" element={<GuardedPage roles={['system_admin']}><UsersAdminPage /></GuardedPage>} />
        <Route path="forbidden" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
