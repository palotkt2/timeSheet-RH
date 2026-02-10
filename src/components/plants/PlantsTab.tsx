'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Tooltip,
  Avatar,
  alpha,
} from '@mui/material';
import {
  Plus,
  Pencil,
  Trash2,
  Wifi,
  WifiOff,
  Factory,
  Server,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { useHealthCheck } from '@/hooks/useHealthCheck';
import type { Plant, ConnectionTestResult } from '@/types';

interface PlantsTabProps {
  plants: Plant[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (plant: Plant) => void;
  onDelete: (plant: Plant) => void;
  onTest: (plantId: number) => Promise<ConnectionTestResult>;
}

export default function PlantsTab({
  plants,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onTest,
}: PlantsTabProps) {
  const [testResults, setTestResults] = useState<
    Record<number, ConnectionTestResult>
  >({});
  const [testing, setTesting] = useState<Record<number, boolean>>({});

  // Health check automático cada 5 minutos
  const { healthStatus, isChecking, checkAllPlants } = useHealthCheck(plants);

  const handleTest = async (plant: Plant) => {
    setTesting((prev) => ({ ...prev, [plant.id]: true }));
    const result = await onTest(plant.id);
    setTestResults((prev) => ({ ...prev, [plant.id]: result }));
    setTesting((prev) => ({ ...prev, [plant.id]: false }));
  };

  const handleManualRefresh = async () => {
    await checkAllPlants();
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={36} sx={{ color: '#1e40af' }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── Header ─────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            icon={<Factory size={14} />}
            label={`${plants.length} planta${plants.length !== 1 ? 's' : ''}`}
            variant="outlined"
            size="small"
            sx={{ fontWeight: 600 }}
          />
          {Object.keys(healthStatus).length > 0 && (
            <Chip
              icon={<Wifi size={14} />}
              label={`${Object.values(healthStatus).filter((s) => s.isOnline).length} online`}
              size="small"
              sx={{
                bgcolor: '#dcfce7',
                color: '#15803d',
                fontWeight: 600,
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Tooltip
            title={
              isChecking ? 'Verificando...' : 'Verificar todas las plantas'
            }
          >
            <Button
              variant="outlined"
              size="small"
              startIcon={
                isChecking ? (
                  <CircularProgress size={14} />
                ) : (
                  <RefreshCw size={14} />
                )
              }
              onClick={handleManualRefresh}
              disabled={isChecking}
              sx={{
                borderColor: '#d1d5db',
                color: '#6b7280',
                '&:hover': { borderColor: '#1e40af', color: '#1e40af' },
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              {isChecking ? 'Verificando...' : 'Verificar'}
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={onAdd}
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Agregar Planta
          </Button>
        </Box>
      </Box>

      {plants.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            border: '2px dashed #d1d5db',
          }}
        >
          <Avatar
            sx={{
              bgcolor: '#f3f4f6',
              color: '#9ca3af',
              width: 64,
              height: 64,
              mx: 'auto',
              mb: 2,
            }}
          >
            <Factory size={32} />
          </Avatar>
          <Typography variant="h6" color="text.secondary" fontWeight={600}>
            No hay plantas registradas
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 2 }}
          >
            Agrega una planta para comenzar a sincronizar checadas
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={onAdd}
            sx={{
              borderColor: '#1e40af',
              color: '#1e40af',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Agregar Primera Planta
          </Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 2,
          }}
        >
          {plants.map((plant) => {
            // Priorizar health check automático sobre test manual
            const health = healthStatus[plant.id];
            const manualResult = testResults[plant.id];
            const result = health?.result || manualResult;
            const isOnline = health?.isOnline ?? manualResult?.success ?? false;
            const hasStatus = health || manualResult;
            const statusColor = hasStatus
              ? isOnline
                ? '#16a34a'
                : '#ef4444'
              : '#9ca3af';

            return (
              <Paper
                key={plant.id}
                elevation={0}
                sx={{
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: hasStatus
                    ? isOnline
                      ? alpha('#16a34a', 0.3)
                      : alpha('#ef4444', 0.3)
                    : '#e5e7eb',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    borderColor: '#93c5fd',
                    boxShadow: '0 4px 16px rgba(30,64,175,0.08)',
                  },
                }}
              >
                {/* Card Header */}
                <Box
                  sx={{
                    px: 2.5,
                    py: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor: hasStatus
                        ? isOnline
                          ? '#f0fdf4'
                          : '#fef2f2'
                        : '#eff6ff',
                      color: hasStatus
                        ? isOnline
                          ? '#16a34a'
                          : '#ef4444'
                        : '#1e40af',
                      width: 44,
                      height: 44,
                    }}
                  >
                    <Factory size={22} />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
                      {plant.name}
                    </Typography>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <Globe size={12} color="#9ca3af" />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontFamily="monospace"
                      >
                        {plant.use_https ? 'https://' : ''}
                        {plant.ip_address}:{plant.port}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title={
                      health
                        ? `Última verificación: ${health.lastCheck.toLocaleTimeString()}`
                        : 'Sin verificar'
                    }
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: statusColor,
                        ...(hasStatus && isOnline
                          ? {
                              animation: 'pulse-dot 2s infinite',
                            }
                          : {}),
                      }}
                    />
                  </Tooltip>
                </Box>

                {/* Card Body - Stats */}
                <Box
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    bgcolor: '#f8f9fb',
                    borderTop: '1px solid #f0f0f0',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    gap: 3,
                  }}
                >
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.68rem' }}
                    >
                      Tipo
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      {plant.adapter_type === 'same-app'
                        ? 'Misma App'
                        : 'Genérico'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.68rem' }}
                    >
                      Registros
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      {(plant.total_entries || 0).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.68rem' }}
                    >
                      Última Sync
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ fontSize: '0.8rem' }}
                    >
                      {plant.last_sync
                        ? new Date(plant.last_sync).toLocaleDateString()
                        : 'Nunca'}
                    </Typography>
                  </Box>
                </Box>

                {/* Card Actions */}
                <Box
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <Tooltip title="Probar Conexión">
                      <IconButton
                        size="small"
                        onClick={() => handleTest(plant)}
                        disabled={testing[plant.id]}
                        sx={{
                          color: '#6b7280',
                          '&:hover': { color: '#1e40af', bgcolor: '#eff6ff' },
                        }}
                      >
                        {testing[plant.id] ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Wifi size={16} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton
                        size="small"
                        onClick={() => onEdit(plant)}
                        sx={{
                          color: '#6b7280',
                          '&:hover': { color: '#1e40af', bgcolor: '#eff6ff' },
                        }}
                      >
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton
                        size="small"
                        onClick={() => onDelete(plant)}
                        sx={{
                          color: '#6b7280',
                          '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' },
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  {hasStatus && (
                    <Chip
                      icon={
                        isOnline ? <Wifi size={14} /> : <WifiOff size={14} />
                      }
                      label={isOnline ? 'Online' : 'Offline'}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: 24,
                        ...(isOnline
                          ? { bgcolor: '#dcfce7', color: '#15803d' }
                          : { bgcolor: '#fee2e2', color: '#dc2626' }),
                      }}
                    />
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
