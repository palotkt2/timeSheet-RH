'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { RotateCw, Users, Clock, Factory } from 'lucide-react';
import type { ActiveEmployee, ActiveReportResponse } from '@/types';

export default function ActiveTab() {
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployee[]>([]);
  const [summary, setSummary] = useState<
    ActiveReportResponse['summary'] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadActiveEmployees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/multi-plant/reports/active');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al cargar empleados activos');
      }
      setActiveEmployees(data.activeEmployees || []);
      setSummary(data.summary || null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveEmployees();
  }, [loadActiveEmployees]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(loadActiveEmployees, 60000);
    return () => clearInterval(interval);
  }, [loadActiveEmployees]);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h6">Empleados Activos Multi-Planta</Typography>
          <Typography variant="body2" color="text.secondary">
            Empleados actualmente en turno de trabajo en todas las plantas
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">
              Última actualización: {lastUpdated}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={
            isLoading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <RotateCw size={18} />
            )
          }
          onClick={loadActiveEmployees}
          disabled={isLoading}
          sx={{
            bgcolor: '#1e40af',
            '&:hover': { bgcolor: '#1e3a8a' },
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          {isLoading ? 'Actualizando...' : 'Actualizar'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      {summary && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 2,
            mb: 3,
          }}
        >
          <Card
            sx={{
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users size={28} color="#22c55e" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Empleados Activos
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {summary.activeEmployees}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
          <Card
            sx={{
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users size={28} color="#3b82f6" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Empleados Hoy
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {summary.totalEmployeesToday}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
          <Card
            sx={{
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            }}
          >
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock size={28} color="#3b82f6" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Registros Hoy
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {summary.totalRecordsToday}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Active Employees Grid */}
      {activeEmployees.length > 0 ? (
        <Paper
          sx={{
            p: 2,
            borderRadius: 3,
            border: '1px solid #e5e7eb',
            boxShadow: 'none',
          }}
        >
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
            Empleados Actualmente en Turno ({activeEmployees.length})
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: '1fr 1fr',
                md: '1fr 1fr 1fr',
              },
              gap: 2,
            }}
          >
            {activeEmployees.map((employee) => (
              <Card
                key={employee.employeeNumber}
                sx={{
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  boxShadow: 'none',
                  '&:hover': {
                    borderColor: '#1e40af',
                    boxShadow: '0 2px 8px rgba(30,64,175,0.08)',
                  },
                  transition: 'all 0.2s ease',
                }}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      mb: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {employee.employeeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        #{employee.employeeNumber}
                      </Typography>
                    </Box>
                    <Chip
                      label="Activo"
                      size="small"
                      sx={{
                        bgcolor: '#dcfce7',
                        color: '#166534',
                        fontWeight: 'bold',
                        fontSize: '11px',
                      }}
                    />
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 0.5 }}
                  >
                    {employee.employeeRole} &bull; {employee.department}
                  </Typography>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      mb: 0.5,
                    }}
                  >
                    <Clock size={14} color="text.secondary" />
                    <Typography variant="body2">
                      Horas trabajadas:{' '}
                      <strong>{employee.currentWorkHours}h</strong>
                    </Typography>
                  </Box>

                  <Typography variant="caption" color="text.secondary">
                    Entrada:{' '}
                    {new Date(employee.firstEntry).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' | '}
                    Última:{' '}
                    {new Date(employee.lastActivity).toLocaleTimeString(
                      'es-MX',
                      { hour: '2-digit', minute: '2-digit' },
                    )}
                  </Typography>

                  {employee.plantsToday && employee.plantsToday.length > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        mt: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      {employee.plantsToday.map((plant) => (
                        <Chip
                          key={plant}
                          icon={<Factory size={14} />}
                          label={plant}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '10px', height: 22 }}
                        />
                      ))}
                    </Box>
                  )}

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: 'block' }}
                  >
                    Entradas: {employee.totalEntries} | Salidas:{' '}
                    {employee.totalExits}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Paper>
      ) : (
        !isLoading && (
          <Paper
            sx={{
              p: 6,
              textAlign: 'center',
              color: 'text.secondary',
              borderRadius: 3,
              border: '1px dashed #d1d5db',
              boxShadow: 'none',
            }}
          >
            <Users size={20} />
            <Typography variant="h6">No hay empleados activos</Typography>
            <Typography variant="body2">
              Actualmente no hay empleados en turno de trabajo en ninguna
              planta.
            </Typography>
          </Paper>
        )
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 2, display: 'block', textAlign: 'center' }}
      >
        Esta vista se actualiza automáticamente cada minuto
      </Typography>
    </Box>
  );
}
