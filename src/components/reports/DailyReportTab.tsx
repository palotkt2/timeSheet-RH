'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Card,
  CardContent,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Download, Users, Clock, Factory } from 'lucide-react';
import type { DailyEmployee, DailyReportResponse } from '@/types';
import { formatLocalTimeShort } from '@/utils/dateUtils';

export default function DailyReportTab() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [reportData, setReportData] = useState<DailyReportResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let url = `/api/multi-plant/reports/daily?date=${selectedDate}`;
      if (employeeNumber.trim()) {
        url += `&employeeNumber=${employeeNumber.trim()}`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al generar el reporte');
      }
      setReportData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!reportData?.employees) return;

    const headers = [
      'Número Empleado',
      'Nombre',
      'Rol',
      'Departamento',
      'Primera Entrada',
      'Última Salida',
      'Total Entradas',
      'Total Salidas',
      'Sesiones Válidas',
      'Horas Trabajadas',
      'Estado',
      'Entradas Sin Salida',
      'Salidas Sin Entrada',
      'Plantas',
    ];

    const csvRows = [headers.join(',')];

    reportData.employees.forEach((emp: DailyEmployee) => {
      const row = [
        emp.employeeNumber,
        `"${emp.employeeName}"`,
        emp.employeeRole,
        emp.department,
        emp.firstEntry
          ? new Date(emp.firstEntry).toLocaleString('es-MX')
          : 'N/A',
        emp.lastExit ? new Date(emp.lastExit).toLocaleString('es-MX') : 'N/A',
        emp.totalEntries,
        emp.totalExits,
        emp.validSessions || 0,
        emp.totalWorkedHours,
        emp.status,
        emp.unpairedEntries || 0,
        emp.unpairedExits || 0,
        `"${(emp.plantsUsed || []).join(', ')}"`,
      ];
      csvRows.push(row.join(','));
    });

    // Add detailed sessions
    csvRows.push('');
    csvRows.push('DETALLE DE SESIONES DE TRABAJO');
    csvRows.push(
      'Empleado,Nombre,Sesión,Entrada,Salida,Duración (hrs),Planta(s)',
    );

    reportData.employees.forEach((emp: DailyEmployee) => {
      if (emp.workSessions && emp.workSessions.length > 0) {
        emp.workSessions.forEach((session, index) => {
          csvRows.push(
            [
              emp.employeeNumber,
              `"${emp.employeeName}"`,
              index + 1,
              new Date(session.entry).toLocaleString('es-MX'),
              new Date(session.exit).toLocaleString('es-MX'),
              session.hoursWorked,
              `"${(emp.plantsUsed || []).join(', ')}"`,
            ].join(','),
          );
        });
      }
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `reporte-diario-multiplanta-${reportData.date}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'En turno':
        return { bgcolor: '#fef3c7', color: '#92400e' };
      case 'Completado':
        return { bgcolor: '#dcfce7', color: '#166534' };
      case 'Registros incompletos':
        return { bgcolor: '#fee2e2', color: '#991b1b' };
      case 'Salidas extras':
        return { bgcolor: '#dbeafe', color: '#1e40af' };
      default:
        return { bgcolor: '#f3f4f6', color: '#374151' };
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Reporte Diario Multi-Planta
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Genera reportes detallados de asistencia por fecha consolidando todas
        las plantas
      </Typography>

      {/* Controls */}
      <Paper
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <TextField
            label="Fecha"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            label="# Empleado (Opcional)"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            size="small"
            placeholder="Ej: 001"
            sx={{ width: 160 }}
          />
          <Button
            variant="contained"
            onClick={generateReport}
            disabled={isLoading}
            startIcon={
              isLoading ? <CircularProgress size={16} color="inherit" /> : null
            }
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {isLoading ? 'Generando...' : 'Generar Reporte'}
          </Button>
          {reportData && (
            <Button
              variant="outlined"
              startIcon={<Download size={18} />}
              onClick={exportToCSV}
              sx={{
                borderColor: '#d1d5db',
                color: '#374151',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                '&:hover': { borderColor: '#1e40af', color: '#1e40af' },
              }}
            >
              Exportar CSV
            </Button>
          )}
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Report Results */}
      {reportData && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Summary Cards */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 1.5,
            }}
          >
            <Card
              sx={{
                borderRadius: 3,
                border: '1px solid #e5e7eb',
                boxShadow: 'none',
              }}
            >
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Users size={20} color="#3b82f6" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Total Empleados
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {reportData.summary.totalEmployees}
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
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Users size={20} color="#22c55e" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Presentes
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {reportData.summary.employeesPresent}
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
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Clock size={20} color="#f97316" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Activos
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {reportData.summary.employeesActive}
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
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Clock size={20} color="#3b82f6" />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Total Horas
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">
                      {reportData.summary.totalHoursWorked}h
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Detailed Table */}
          <TableContainer
            component={Paper}
            sx={{
              maxHeight: 600,
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                    }}
                  >
                    Empleado
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Primera Entrada
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Última Salida
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Sesiones
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Horas
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Estado
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f8f9fb',
                      color: '#374151',
                      borderBottom: '2px solid #e5e7eb',
                      textAlign: 'center',
                    }}
                  >
                    Registros
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#f0fdfa',
                      color: '#0d9488',
                      borderBottom: '2px solid #99f6e4',
                      textAlign: 'center',
                    }}
                  >
                    Plantas
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.employees.map((emp: DailyEmployee) => (
                  <TableRow key={emp.employeeNumber} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {emp.employeeName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        #{emp.employeeNumber} &bull; {emp.employeeRole}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {emp.firstEntry
                        ? formatLocalTimeShort(emp.firstEntry)
                        : '-'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {emp.lastExit ? formatLocalTimeShort(emp.lastExit) : '-'}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="success.main">
                        {emp.validSessions || 0} válidas
                      </Typography>
                      {((emp.unpairedEntries || 0) > 0 ||
                        (emp.unpairedExits || 0) > 0) && (
                        <Typography variant="caption" color="warning.main">
                          {(emp.unpairedEntries || 0) > 0 &&
                            `${emp.unpairedEntries} sin salida`}
                          {(emp.unpairedEntries || 0) > 0 &&
                            (emp.unpairedExits || 0) > 0 &&
                            ', '}
                          {(emp.unpairedExits || 0) > 0 &&
                            `${emp.unpairedExits} salidas extra`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" fontWeight="bold">
                        {emp.totalWorkedHours}h
                      </Typography>
                      {emp.workSessions && emp.workSessions.length > 0 && (
                        <Box>
                          {emp.workSessions.map((session, index) => (
                            <Typography
                              key={index}
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block' }}
                            >
                              {formatLocalTimeShort(session.entry)} -{' '}
                              {formatLocalTimeShort(session.exit)} (
                              {session.hoursWorked}h)
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Chip
                        label={emp.status}
                        size="small"
                        sx={{
                          ...getStatusColor(emp.status),
                          fontWeight: 'bold',
                          fontSize: '11px',
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Typography variant="caption">
                        {emp.totalEntries} ent. / {emp.totalExits} sal.
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 0.5,
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                        }}
                      >
                        {(emp.plantsUsed || []).map((plant) => (
                          <Chip
                            key={plant}
                            icon={<Factory size={12} />}
                            label={plant}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '10px', height: 20 }}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {reportData.employees.length === 0 && (
            <Alert severity="info">
              No se encontraron registros para la fecha seleccionada.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}
