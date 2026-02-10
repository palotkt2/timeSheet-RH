'use client';

import React, { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { useRouter } from 'next/navigation';
import Sidebar, { DRAWER_WIDTH, getViewTitle } from './Sidebar';
import DashboardAppBar from './DashboardAppBar';
import type { SidebarView } from './Sidebar';
import type { UserRole } from '@/types';

interface ClientLayoutProps {
  children: React.ReactNode;
  activeView?: SidebarView;
  onViewChange?: (view: SidebarView) => void;
  userName?: string;
  userRole?: UserRole;
}

export default function ClientLayout({
  children,
  activeView = 'live',
  onViewChange,
  userName = 'Admin',
  userRole = 'admin',
}: ClientLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    router.push('/login');
  }, [router]);

  const handleViewChange = useCallback(
    (view: SidebarView) => {
      if (onViewChange) onViewChange(view);
    },
    [onViewChange],
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8f9fb' }}>
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        userRole={userRole}
      />

      <DashboardAppBar
        title={getViewTitle(activeView)}
        userName={userName}
        onMenuToggle={() => setMobileOpen((prev) => !prev)}
        onLogout={handleLogout}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: '56px',
          p: { xs: 2, sm: 3 },
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
