'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Card,
  CardContent,
  CircularProgress,
  Avatar,
  Chip,
  alpha,
} from '@mui/material';
import {
  RefreshCw,
  Factory,
  Calendar,
  Terminal,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Plant, SyncStatus } from '@/types';
import { formatLocalDate } from '@/utils/dateUtils';

interface SyncLogEntry {
  time: string;
  message: string;
  type: 'success' | 'error';
  details?: Array<{
    success: boolean;
    plantName: string;
    stats?: { inserted: number; duplicates: number };
    error?: string;
  }>;
}

interface SyncTabProps {
  plants: Plant[];
  syncStatus: SyncStatus | null;
  onSyncPlant: (
    plantId: number,
    startDate: string,
    endDate: string,
  ) => Promise<unknown>;
  onSyncAll: (startDate: string, endDate: string) => Promise<unknown>;
}

export default function SyncTab({
  plants,
  syncStatus,
  onSyncPlant,
  onSyncAll,
}: SyncTabProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const isSyncing = syncStatus?.status === 'syncing';

  useEffect(() => {
    const today = new Date();
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
    setStartDate(formatLocalDate(monday));
    setEndDate(formatLocalDate(today));
  }, []);

  useEffect(() => {
    if (syncStatus?.status === 'done' && syncStatus.result) {
      const timestamp = new Date().toLocaleTimeString();
      const res = syncStatus.result as Record<string, unknown>;
      if (syncStatus.type === 'all') {
        setSyncLog((prev) => [
          {
            time: timestamp,
            message: String(res.message ?? ''),
            type: 'success' as const,
            details: res.results as SyncLogEntry['details'],
          },
          ...prev,
        ]);
      } else {
        const stats = res.stats as
          | { inserted: number; fetched: number }
          | undefined;
        setSyncLog((prev) => [
          {
            time: timestamp,
            message: `${res.plant}: ${stats?.inserted ?? 0} nuevos de ${stats?.fetched ?? 0} registros`,
            type: 'success' as const,
          },
          ...prev,
        ]);
      }
    } else if (syncStatus?.status === 'error') {
      setSyncLog((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          message: `Error: ${syncStatus.error}`,
          type: 'error' as const,
        },
        ...prev,
      ]);
    }
  }, [syncStatus]);

  const handleSyncPlant = async (plantId: number) => {
    if (!startDate || !endDate) return;
    try {
      await onSyncPlant(plantId, startDate, endDate);
    } catch {
      /* handled via syncStatus */
    }
  };

  const handleSyncAll = async () => {
    if (!startDate || !endDate) return;
    try {
      await onSyncAll(startDate, endDate);
    } catch {
      /* handled via syncStatus */
    }
  };

  return (
    <Box>
      {/* ── Date Range & Sync All ─────────────────── */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 3,
          border: '1px solid #e5e7eb',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Calendar size={18} color="#1e40af" />
          <Typography variant="subtitle2" fontWeight={700}>
            Rango de Fechas
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <TextField
            label="Fecha Inicio"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <TextField
            label="Fecha Fin"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <Button
            variant="contained"
            startIcon={
              isSyncing ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshCw size={16} />
              )
            }
            onClick={handleSyncAll}
            disabled={
              isSyncing || !startDate || !endDate || plants.length === 0
            }
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
            }}
          >
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Todas'}
          </Button>
        </Box>
      </Paper>

      {/* ── Per-plant Cards ───────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        {plants.map((plant) => (
          <Paper
            key={plant.id}
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              transition: 'border-color 0.15s, box-shadow 0.15s',
              '&:hover': {
                borderColor: '#93c5fd',
                boxShadow: '0 2px 12px rgba(30,64,175,0.06)',
              },
            }}
          >
            <Avatar
              sx={{
                bgcolor: '#eff6ff',
                color: '#1e40af',
                width: 44,
                height: 44,
              }}
            >
              <Factory size={20} />
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {plant.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                fontFamily="monospace"
              >
                {plant.ip_address}:{plant.port}
              </Typography>
              {plant.last_sync && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ fontSize: '0.68rem' }}
                >
                  Último sync: {new Date(plant.last_sync).toLocaleString()}
                </Typography>
              )}
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshCw size={14} />}
              onClick={() => handleSyncPlant(plant.id)}
              disabled={isSyncing || !startDate || !endDate}
              sx={{
                borderColor: '#1e40af',
                color: '#1e40af',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                '&:hover': { bgcolor: '#eff6ff' },
              }}
            >
              Sync
            </Button>
          </Paper>
        ))}
      </Box>

      {/* ── Sync Log ──────────────────────────────── */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            bgcolor: '#f8f9fb',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Terminal size={16} color="#6b7280" />
          <Typography
            variant="subtitle2"
            fontWeight={700}
            color="text.secondary"
          >
            Log de Sincronización
          </Typography>
          {syncLog.length > 0 && (
            <Chip
              label={syncLog.length}
              size="small"
              sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
            />
          )}
        </Box>
        <Box
          sx={{
            p: 2,
            maxHeight: 300,
            overflow: 'auto',
            bgcolor: '#0f172a',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          }}
        >
          {syncLog.length === 0 ? (
            <Typography
              variant="body2"
              sx={{
                color: '#475569',
                fontStyle: 'italic',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
              }}
            >
              $ Esperando comandos de sincronización...
            </Typography>
          ) : (
            syncLog.map((log, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Typography
                    component="span"
                    sx={{
                      color: '#64748b',
                      fontSize: '0.75rem',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    [{log.time}]
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      color: log.type === 'error' ? '#f87171' : '#4ade80',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                    }}
                  >
                    {log.message}
                  </Typography>
                </Box>
                {log.details && (
                  <Box sx={{ ml: 3, mt: 0.5 }}>
                    {log.details.map((d, j) => (
                      <Box
                        key={j}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          fontSize: '0.75rem',
                          fontFamily: 'inherit',
                          color: d.success ? '#86efac' : '#fca5a5',
                          mb: 0.2,
                        }}
                      >
                        {d.success ? (
                          <CheckCircle2 size={12} color="#86efac" />
                        ) : (
                          <XCircle size={12} color="#fca5a5" />
                        )}
                        <span>
                          {d.success
                            ? `${d.plantName}: ${d.stats?.inserted} nuevos, ${d.stats?.duplicates} duplicados`
                            : `${d.plantName}: ${d.error}`}
                        </span>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))
          )}
        </Box>
      </Paper>
    </Box>
  );
}
