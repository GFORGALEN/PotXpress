import { useAuth } from '../../contexts/AuthContext.jsx';
import { useStore } from '../../contexts/StoreContext.jsx';
import { LoadingSpinner } from '../common/LoadingSpinner.jsx';
import { AccessDeniedPage } from '../../pages/AccessDeniedPage.jsx';
import { SelectStorePage } from '../../pages/SelectStorePage.jsx';

export function RequireRole({
  roles,
  requiresStore = false,
  children,
}) {
  const { user } = useAuth();
  const { currentStore, loading } = useStore();

  if (!roles.includes(user.role)) {
    return <AccessDeniedPage />;
  }

  if (requiresStore && loading) {
    return <LoadingSpinner label="正在准备门店" />;
  }

  if (
    requiresStore
    && user.role === 'system_admin'
    && !currentStore
  ) {
    return <SelectStorePage />;
  }

  return children;
}
