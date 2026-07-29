import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { TopNavbar } from './TopNavbar.jsx';
import {
  MobileBottomNavigation,
  MobileDrawer,
} from './MobileNavigation.jsx';

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <TopNavbar onOpenMenu={() => setMobileMenuOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-28 sm:px-6 sm:py-7 lg:px-8 lg:pb-8">
          <Outlet />
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
