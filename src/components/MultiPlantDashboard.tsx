'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Box, Alert, CircularProgress } from '@mui/material';

import { useMultiPlant } from '@/hooks/useMultiPlant';
import { useMultiPlantLive } from '@/hooks/useMultiPlantLive';

import ClientLayout from '@/components/ui/ClientLayout';
import LiveTab from '@/components/dashboard/LiveTab';

import type { SidebarView } from '@/components/ui/Sidebar';
import type { Plant, PlantFormData, AlertMessage, UserRole } from '@/types';

const Loading = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
    <CircularProgress size={36} />
  </Box>
);

const PlantsTab = dynamic(() => import('@/components/plants/PlantsTab'), {
  loading: Loading,
});
const PlantConfigDialog = dynamic(
  () => import('@/components/plants/PlantConfigDialog'),
  { ssr: false },
);
const SyncTab = dynamic(() => import('@/components/dashboard/SyncTab'), {
  loading: Loading,
});
const WeeklyReportTab = dynamic(
  () => import('@/components/reports/WeeklyReportTab'),
  { loading: Loading },
);
const ActiveTab = dynamic(() => import('@/components/reports/ActiveTab'), {
  loading: Loading,
});
const DailyReportTab = dynamic(
  () => import('@/components/reports/DailyReportTab'),
  { loading: Loading },
);
const ValidationTab = dynamic(
  () => import('@/components/reports/ValidationTab'),
  { loading: Loading },
);
const EmployeesTab = dynamic(
  () => import('@/components/employees/EmployeesTab'),
  { loading: Loading },
);
const UsersTab = dynamic(() => import('@/components/users/UsersTab'), {
  loading: Loading,
});
const ShiftsTab = dynamic(() => import('@/components/shifts/ShiftsTab'), {
  loading: Loading,
});

interface MultiPlantDashboardProps {
  userName?: string;
  userRole?: UserRole;
}

export default function MultiPlantDashboard({
  userName = 'Admin',
  userRole = 'admin',
}: MultiPlantDashboardProps) {
  const [activeView, setActiveView] = useState<SidebarView>('live');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [alertMsg, setAlertMsg] = useState<AlertMessage | null>(null);

  const {
    plants,
    isLoading,
    error,
    loadPlants,
    addPlant,
    updatePlant,
    deletePlant,
    testConnection,
    syncPlant,
    syncAll,
    syncStatus,
  } = useMultiPlant();

  const {
    liveData,
    isLoading: liveLoading,
    loadLive,
    startAutoRefresh,
    stopAutoRefresh,
  } = useMultiPlantLive();

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  const handleAddPlant = () => {
    setEditingPlant(null);
    setDialogOpen(true);
  };

  const handleEditPlant = (plant: Plant) => {
    setEditingPlant(plant);
    setDialogOpen(true);
  };

  const handleDeletePlant = async (plant: Plant) => {
    if (
      !confirm(`¿Eliminar "${plant.name}" y todos sus registros sincronizados?`)
    )
      return;
    try {
      const msg = await deletePlant(plant.id);
      setAlertMsg({ type: 'success', text: msg });
    } catch (e: unknown) {
      setAlertMsg({
        type: 'error',
        text: e instanceof Error ? e.message : 'Error desconocido',
      });
    }
  };

  const handleSavePlant = async (data: PlantFormData) => {
    try {
      if (editingPlant) {
        await updatePlant(editingPlant.id, data);
        setAlertMsg({
          type: 'success',
          text: 'Planta actualizada correctamente',
        });
      } else {
        await addPlant(data);
        setAlertMsg({ type: 'success', text: 'Planta agregada correctamente' });
      }
      setDialogOpen(false);
    } catch (e: unknown) {
      setAlertMsg({
        type: 'error',
        text: e instanceof Error ? e.message : 'Error desconocido',
      });
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'plants':
        return (
          <PlantsTab
            plants={plants}
            isLoading={isLoading}
            onAdd={handleAddPlant}
            onEdit={handleEditPlant}
            onDelete={handleDeletePlant}
            onTest={testConnection}
          />
        );
      case 'sync':
        return (
          <SyncTab
            plants={plants}
            syncStatus={syncStatus}
            onSyncPlant={syncPlant}
            onSyncAll={syncAll}
          />
        );
      case 'live':
        return (
          <LiveTab
            liveData={liveData}
            isLoading={liveLoading}
            onRefresh={loadLive}
            startAutoRefresh={startAutoRefresh}
            stopAutoRefresh={stopAutoRefresh}
          />
        );
      case 'weekly':
        return <WeeklyReportTab />;
      case 'active':
        return <ActiveTab />;
      case 'daily':
        return <DailyReportTab />;
      case 'validation':
        return <ValidationTab />;
      case 'employees':
        return <EmployeesTab />;
      case 'shifts':
        return <ShiftsTab />;
      case 'users':
        return <UsersTab />;
      default:
        return null;
    }
  };

  return (
    <ClientLayout
      activeView={activeView}
      onViewChange={setActiveView}
      userName={userName}
      userRole={userRole}
    >
      <Box>
        {alertMsg && (
          <Alert
            severity={alertMsg.type}
            onClose={() => setAlertMsg(null)}
            sx={{ mb: 2, borderRadius: 2 }}
          >
            {alertMsg.text}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {renderView()}

        <PlantConfigDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSave={handleSavePlant}
          plant={editingPlant}
        />
      </Box>
    </ClientLayout>
  );
}
