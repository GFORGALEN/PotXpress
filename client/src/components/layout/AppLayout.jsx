import { useState, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Sidebar } from './Sidebar.jsx';
import { TopNavbar } from './TopNavbar.jsx';
import {
  MobileBottomNavigation,
  MobileDrawer,
} from './MobileNavigation.jsx';
import { PageErrorBoundary } from '../error/PageErrorBoundary.jsx';
import { ConnectionStatus } from '../error/ConnectionStatus.jsx';

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const routeKey = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );
  const isDashboard = location.pathname === '/';

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <TopNavbar onOpenMenu={() => setMobileMenuOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className={isDashboard
          ? 'min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-28 sm:px-4 sm:py-4 lg:px-5 xl:pb-5'
          : 'min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-28 sm:px-6 sm:py-6 lg:px-8 xl:py-7 xl:pb-8'}>
          {!isDashboard ? (
            <div className="mb-3 flex justify-end">
              <ConnectionStatus />
            </div>
          ) : null}
          <PageErrorBoundary routeKey={routeKey}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
      <MobileBottomNavigation />
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}
