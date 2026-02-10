'use client';

import React from 'react';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  LayoutDashboard,
  Factory,
  RefreshCw,
  Radio,
  CalendarDays,
  CalendarCheck,
  Users,
  UserCog,
  ShieldCheck,
  Clock,
  UsersRound,
} from 'lucide-react';
import { ROLE_PERMISSIONS } from '@/types';
import type { UserRole } from '@/types';

export const DRAWER_WIDTH = 260;

export type SidebarView =
  | 'plants'
  | 'sync'
  | 'live'
  | 'employees'
  | 'weekly'
  | 'active'
  | 'daily'
  | 'validation'
  | 'users';

interface NavItem {
  id: SidebarView;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Dashboard',
    items: [{ id: 'live', label: 'Tiempo Real', icon: <Radio size={20} /> }],
  },
  {
    title: 'Plantas',
    items: [
      { id: 'plants', label: 'Configuración', icon: <Factory size={20} /> },
      { id: 'sync', label: 'Sincronización', icon: <RefreshCw size={20} /> },
    ],
  },
  {
    title: 'Empleados',
    items: [
      {
        id: 'employees',
        label: 'Gestión de Empleados',
        icon: <UserCog size={20} />,
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        id: 'users',
        label: 'Gestión de Usuarios',
        icon: <UsersRound size={20} />,
      },
    ],
  },
  {
    title: 'Reportes',
    items: [
      {
        id: 'weekly',
        label: 'Reporte Semanal',
        icon: <CalendarDays size={20} />,
      },
      {
        id: 'daily',
        label: 'Reporte Diario',
        icon: <CalendarCheck size={20} />,
      },
      { id: 'active', label: 'Empleados Activos', icon: <Users size={20} /> },
      {
        id: 'validation',
        label: 'Validación',
        icon: <ShieldCheck size={20} />,
      },
    ],
  },
];

const VIEW_TITLES: Record<SidebarView, string> = {
  plants: 'Configuración de Plantas',
  sync: 'Sincronización',
  live: 'Monitor en Tiempo Real',
  employees: 'Gestión de Empleados',
  weekly: 'Reporte Semanal',
  active: 'Empleados Activos',
  daily: 'Reporte Diario',
  validation: 'Validación de Datos',
  users: 'Gestión de Usuarios',
};

export function getViewTitle(view: SidebarView): string {
  return VIEW_TITLES[view] || 'Dashboard';
}

interface SidebarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  userRole?: UserRole;
}

export default function Sidebar({
  activeView,
  onViewChange,
  mobileOpen,
  onMobileClose,
  userRole = 'admin',
}: SidebarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const allowedViews = ROLE_PERMISSIONS[userRole] as readonly string[];
  const filteredSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedViews.includes(item.id)),
    }))
    .filter((section) => section.items.length > 0);

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 72,
        }}
      >
        <Box
          component="img"
          src="/benchpro-logo-blue-back.svg"
          alt="BenchPro"
          sx={{
            height: 44,
            width: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
          }}
        />
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        {filteredSections.map((section) => (
          <List
            key={section.title}
            dense
            subheader={
              <ListSubheader
                sx={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  lineHeight: '36px',
                  bgcolor: 'transparent',
                  px: 2.5,
                }}
              >
                {section.title}
              </ListSubheader>
            }
          >
            {section.items.map((item) => {
              const isActive = activeView === item.id;
              return (
                <ListItemButton
                  key={item.id}
                  selected={isActive}
                  onClick={() => {
                    onViewChange(item.id);
                    if (isMobile) onMobileClose();
                  }}
                  sx={{
                    mx: 1.5,
                    mb: 0.3,
                    borderRadius: 2,
                    transition: 'all 0.15s ease',
                    ...(isActive
                      ? {
                          bgcolor: '#eff6ff',
                          borderLeft: '3px solid #1e40af',
                          '& .MuiListItemIcon-root': { color: '#1e40af' },
                          '& .MuiListItemText-primary': {
                            color: '#1e40af',
                            fontWeight: 600,
                          },
                        }
                      : {
                          borderLeft: '3px solid transparent',
                          '&:hover': {
                            bgcolor: '#f0f7ff',
                            '& .MuiListItemIcon-root': { color: '#1e40af' },
                          },
                        }),
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.855rem',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        ))}
      </Box>

      {/* Footer */}
      <Divider />
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            color: 'text.disabled',
            fontSize: '0.7rem',
          }}
        >
          <LayoutDashboard size={13} />
          <span>Consolidador Multi-Planta</span>
        </Box>
        <Box sx={{ color: 'text.disabled', fontSize: '0.65rem', mt: 0.3 }}>
          <Clock
            size={10}
            style={{ verticalAlign: 'middle', marginRight: 3 }}
          />
          Control de Tiempo RH
        </Box>
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
