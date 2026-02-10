'use client';

import React from 'react';
import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  IconButton,
  Chip,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Menu, LogOut, User } from 'lucide-react';
import { DRAWER_WIDTH } from './Sidebar';

interface DashboardAppBarProps {
  title: string;
  userName?: string;
  onMenuToggle: () => void;
  onLogout: () => void;
}

export default function DashboardAppBar({
  title,
  userName = 'Admin',
  onMenuToggle,
  onLogout,
}: DashboardAppBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <MuiAppBar
      position="fixed"
      elevation={0}
      sx={{
        width: isMobile ? '100%' : `calc(100% - ${DRAWER_WIDTH}px)`,
        ml: isMobile ? 0 : `${DRAWER_WIDTH}px`,
        bgcolor: '#fff',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ minHeight: '56px !important', gap: 1 }}>
        {isMobile && (
          <IconButton
            edge="start"
            onClick={onMenuToggle}
            sx={{ color: '#1e40af' }}
          >
            <Menu size={22} />
          </IconButton>
        )}

        <Typography
          variant="h6"
          noWrap
          sx={{
            flexGrow: 1,
            fontWeight: 600,
            fontSize: '1.05rem',
            color: '#0f172a',
          }}
        >
          {title}
        </Typography>

        <Chip
          icon={<User size={14} />}
          label={userName}
          size="small"
          variant="outlined"
          sx={{
            borderColor: '#e5e7eb',
            '& .MuiChip-icon': { color: '#1e40af' },
            fontWeight: 500,
            fontSize: '0.8rem',
          }}
        />

        <IconButton
          size="small"
          onClick={onLogout}
          sx={{
            color: '#9ca3af',
            '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' },
            transition: 'all 0.15s ease',
          }}
          title="Cerrar sesión"
        >
          <LogOut size={18} />
        </IconButton>
      </Toolbar>
    </MuiAppBar>
  );
}
