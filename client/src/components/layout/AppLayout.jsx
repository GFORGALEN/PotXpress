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
import { isFrontDeskMode } from '../../utils/frontDeskMode.js';

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const routeKey = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );
  const isDashboard = location.pathname === '/';
  const frontDeskMode = isDashboard && isFrontDeskMode(location.search);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {frontDeskMode ? null : (
        <TopNavbar onOpenMenu={() => setMobileMenuOpen(true)} />
      )}
      <div className="flex min-h-0 flex-1">
        {frontDeskMode ? null : <Sidebar />}
        <main className={frontDeskMode
          ? 'h-full min-w-0 flex-1 overflow-hidden p-2 sm:p-3'
          : isDashboard
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
      {frontDeskMode ? null : <MobileBottomNavigation />}
      {frontDeskMode ? null : (
        <MobileDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
