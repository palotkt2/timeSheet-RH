'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  Alert,
  Card,
  CardContent,
  CircularProgress,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
} from '@mui/material';
import { FileSpreadsheet, Filter, Search, X } from 'lucide-react';
import { useMultiPlantReports } from '@/hooks/useMultiPlantReports';
import type {
  WeeklyReportResponse,
  DayStatusCode,
  EmployeeReport,
} from '@/types';

/* ── Shift resolution: prefer DB assignment, fallback to time inference ─── */
const SHIFT_RANGES_FALLBACK = [
  { label: 'Turno Matutino', minHour: 4, maxHour: 10 },
  { label: 'Turno Vespertino', minHour: 10, maxHour: 18 },
  { label: 'Turno Nocturno', minHour: 18, maxHour: 28 },
];

function _classifyHour(h: number): string | null {
  if (h < 4) h += 24;
  for (const s of SHIFT_RANGES_FALLBACK) {
    if (h >= s.minHour && h < s.maxHour) return s.label;
  }
  return null;
}

function inferEmployeeShift(
  emp: EmployeeReport,
  shiftMap?: Map<string, string>,
): string {
  // Use DB assignment if available
  const assigned = shiftMap?.get(emp.employeeNumber);
  if (assigned) return assigned;

  // Fallback: infer from entry times
  const shiftsFound = new Set<string>();
  for (const dayData of Object.values(emp.dailyData)) {
    if (dayData.firstEntry) {
      const d = new Date(dayData.firstEntry);
      const h = d.getHours() + d.getMinutes() / 60;
      const shift = _classifyHour(h);
      if (shift) shiftsFound.add(shift);
    }
  }
  if (shiftsFound.size === 0) return 'Sin turno';
  if (shiftsFound.size > 1) return 'Turno Rotativo';
  return Array.from(shiftsFound)[0];
}

const getStatusColor = (status: DayStatusCode): Record<string, string> => {
  switch (status) {
    case 'A':
      return { bgcolor: '#22c55e', color: 'white' };
    case 'A+':
      return { bgcolor: '#16a34a', color: 'white' };
    case 'R':
      return { bgcolor: '#eab308', color: 'white' };
    case 'F':
      return { bgcolor: '#ef4444', color: 'white' };
    case 'H':
      return { bgcolor: '#3b82f6', color: 'white' };
    case 'N':
      return { bgcolor: '#9ca3af', color: 'white' };
    case 'E':
      return { bgcolor: '#22c55e', color: 'white' };
    default:
      return {};
  }
};

const STATUS_LEGEND = [
  { code: 'A', label: 'Asistencia', color: '#22c55e' },
  { code: 'A+', label: 'Asistencia + Hrs Extra', color: '#16a34a' },
  { code: 'R', label: 'Retardo', color: '#eab308' },
  { code: 'F', label: 'Falta', color: '#ef4444' },
  { code: 'H', label: 'Festivo', color: '#3b82f6' },
  { code: 'N', label: 'No laboral', color: '#9ca3af' },
  { code: 'E', label: 'Extra (día no laboral)', color: '#22c55e' },
];

export default function WeeklyReportTab() {
  const {
    reportData,
    isLoading,
    error,
    dateUtils,
    generateReport,
    exportToExcel,
  } = useMultiPlantReports();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  // Client-side filters applied AFTER report loads
  const [shiftFilter, setShiftFilter] = useState('');
  const [plantFilter, setPlantFilter] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  // Load shift assignments from DB for employee → shift mapping
  const [shiftMap, setShiftMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch('/api/multi-plant/shifts')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.assignments) {
          const map = new Map<string, string>();
          for (const a of data.assignments as Array<{
            employee_number: string;
            shift_name: string;
          }>) {
            // First assignment wins (don't overwrite)
            if (!map.has(a.employee_number)) {
              map.set(a.employee_number, a.shift_name);
            }
          }
          setShiftMap(map);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const presets = dateUtils.getDatePresets();
    setStartDate(presets.thisWeek.start);
    setEndDate(presets.thisWeek.end);
  }, [dateUtils]);

  const handleGenerate = () => {
    // Clear client-side filters on new report
    setShiftFilter('');
    setPlantFilter('');
    setNameSearch('');
    generateReport({ startDate, endDate, employeeNumber }).catch(() => {});
  };

  const handlePreset = (preset: string) => {
    const presets = dateUtils.getDatePresets();
    const p = presets[preset as keyof typeof presets];
    if (p) {
      setStartDate(p.start);
      setEndDate(p.end);
    }
  };

  const handleExport = () => {
    if (reportData) exportToExcel(reportData).catch(() => {});
  };

  // Derive available plants from report data
  const availablePlants = useMemo(() => {
    if (!reportData?.employees) return [];
    const plants = new Set<string>();
    reportData.employees.forEach((emp) => {
      Object.values(emp.dailyData).forEach((d) => {
        if (d.plantsUsed) d.plantsUsed.forEach((p) => plants.add(p));
      });
    });
    return [...plants].sort();
  }, [reportData]);

  // Client-side filtered employees
  const filteredEmployees = useMemo(() => {
    if (!reportData?.employees) return [];
    let filtered = reportData.employees;

    // Shift filter (DB assignment or inferred)
    if (shiftFilter) {
      filtered = filtered.filter(
        (emp) => inferEmployeeShift(emp, shiftMap) === shiftFilter,
      );
    }

    // Plant filter
    if (plantFilter) {
      filtered = filtered.filter((emp) => {
        return Object.values(emp.dailyData).some(
          (d) => d.plantsUsed && d.plantsUsed.includes(plantFilter),
        );
      });
    }

    // Name/number search
    if (nameSearch.trim()) {
      const q = nameSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (emp) =>
          emp.employeeNumber.toLowerCase().includes(q) ||
          emp.employeeName.toLowerCase().includes(q),
      );
    }

    return filtered;
  }, [reportData, shiftFilter, plantFilter, nameSearch, shiftMap]);

  // Derive shift options from actual data
  const shiftOptions = useMemo(() => {
    if (!reportData?.employees) return [];
    const names = new Set(
      reportData.employees.map((emp) => inferEmployeeShift(emp, shiftMap)),
    );
    names.delete('Sin turno');
    return [...names].sort();
  }, [reportData, shiftMap]);

  const activeFilterCount =
    (shiftFilter ? 1 : 0) + (plantFilter ? 1 : 0) + (nameSearch.trim() ? 1 : 0);
  const hasFilters = activeFilterCount > 0;
  const clearFilters = () => {
    setShiftFilter('');
    setPlantFilter('');
    setNameSearch('');
  };

  const computeStatusCode = (
    dayData: WeeklyReportResponse['employees'][number]['dailyData'][string],
  ): DayStatusCode => {
    if (!dayData) return 'F';
    if (dayData.isNonWorkday) return dayData.status === 'Festivo' ? 'H' : 'N';
    if (dayData.isWorkday === false)
      return dayData.status !== 'Ausente' && dayData.hours > 0 ? 'E' : 'N';
    if (!dayData || dayData.status === 'Ausente') return 'F';
    if ((dayData.lateMinutes ?? 0) > 0) return 'R';
    if (dayData.status === 'Sin salida' || dayData.status === 'Incompleto')
      return 'R';
    if ((dayData.overtimeHours ?? 0) > 0) return 'A+';
    return 'A';
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Reporte Semanal Multi-Planta
      </Typography>

      {/* Generation params */}
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
            alignItems: 'center',
          }}
        >
          <TextField
            label="Fecha Inicio"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            label="Fecha Fin"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <TextField
            label="# Empleado"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            size="small"
            placeholder="Opcional"
            sx={{ width: 120 }}
          />
          <Button
            variant="contained"
            onClick={handleGenerate}
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
              startIcon={<FileSpreadsheet size={18} />}
              onClick={handleExport}
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
              Exportar Excel
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
          {['thisWeek', 'lastWeek', 'thisMonth'].map((p) => (
            <Chip
              key={p}
              label={
                dateUtils.getDatePresets()[
                  p as keyof ReturnType<typeof dateUtils.getDatePresets>
                ]?.label
              }
              size="small"
              onClick={() => handlePreset(p)}
              variant="outlined"
              clickable
            />
          ))}
        </Box>
      </Paper>

      {/* Post-report filter panel (turno, planta, búsqueda) */}
      {reportData && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 3,
            border: '1px solid #e5e7eb',
            bgcolor: '#fafbfc',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Filter size={16} color="#6b7280" />
            <Typography
              variant="subtitle2"
              fontWeight={600}
              color="text.secondary"
            >
              Filtrar resultados
            </Typography>
            {hasFilters && (
              <Chip
                label={`${activeFilterCount} activo${activeFilterCount > 1 ? 's' : ''}`}
                size="small"
                onDelete={clearFilters}
                deleteIcon={<X size={14} />}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: '#dbeafe',
                  color: '#1e40af',
                  '& .MuiChip-deleteIcon': { color: '#1e40af' },
                }}
              />
            )}
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
              gap: 1.5,
            }}
          >
            {/* Name/number search */}
            <TextField
              size="small"
              placeholder="Buscar empleado (# o nombre)..."
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} color="#9ca3af" />
                  </InputAdornment>
                ),
                ...(nameSearch && {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Box
                        sx={{ cursor: 'pointer', display: 'flex' }}
                        onClick={() => setNameSearch('')}
                      >
                        <X size={14} color="#9ca3af" />
                      </Box>
                    </InputAdornment>
                  ),
                }),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  bgcolor: '#fff',
                  fontSize: '0.85rem',
                },
              }}
            />

            {/* Plant filter */}
            <FormControl size="small">
              <InputLabel sx={{ fontSize: '0.85rem' }}>
                Planta / Área
              </InputLabel>
              <Select
                value={plantFilter}
                label="Planta / Área"
                onChange={(e) => setPlantFilter(e.target.value)}
                sx={{ borderRadius: 2, bgcolor: '#fff', fontSize: '0.85rem' }}
              >
                <MenuItem value="">
                  <em>Todas las plantas</em>
                </MenuItem>
                {availablePlants.map((p) => (
                  <MenuItem key={p} value={p} sx={{ fontSize: '0.85rem' }}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Shift filter (inferred) */}
            <FormControl size="small">
              <InputLabel sx={{ fontSize: '0.85rem' }}>Turno</InputLabel>
              <Select
                value={shiftFilter}
                label="Turno"
                onChange={(e) => setShiftFilter(e.target.value)}
                sx={{ borderRadius: 2, bgcolor: '#fff', fontSize: '0.85rem' }}
              >
                <MenuItem value="">
                  <em>Todos los turnos</em>
                </MenuItem>
                {shiftOptions.map((s) => (
                  <MenuItem key={s} value={s} sx={{ fontSize: '0.85rem' }}>
                    {s}
                  </MenuItem>
                ))}
                <MenuItem
                  value="Sin turno"
                  sx={{ fontSize: '0.85rem', fontStyle: 'italic' }}
                >
                  Sin turno
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Filter summary */}
          {hasFilters && (
            <Box
              sx={{
                mt: 1.5,
                px: 2,
                py: 0.8,
                bgcolor: '#eff6ff',
                borderRadius: 2,
                border: '1px solid #dbeafe',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Filter size={14} color="#1e40af" />
              <Typography variant="body2" color="#1e40af" fontWeight={500}>
                Mostrando {filteredEmployees.length} de{' '}
                {reportData.employees.length} empleados
                {plantFilter && ` · ${plantFilter}`}
                {shiftFilter && ` · ${shiftFilter}`}
                {nameSearch.trim() && ` · "${nameSearch.trim()}"`}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Report Summary */}
      {reportData?.summary && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 1.5,
            mb: 2,
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
              <Typography variant="caption" color="text.secondary">
                Empleados
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {hasFilters
                  ? `${filteredEmployees.length} / ${reportData.summary.totalEmployees}`
                  : reportData.summary.totalEmployees}
              </Typography>
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
              <Typography variant="caption" color="text.secondary">
                Asistencia Promedio
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {reportData.summary.averageAttendanceRate}%
              </Typography>
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
              <Typography variant="caption" color="text.secondary">
                Asistencia Perfecta
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="#16a34a">
                {reportData.summary.employeesWithPerfectAttendance}
              </Typography>
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
              <Typography variant="caption" color="text.secondary">
                Con Incidencias
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="error">
                {reportData.summary.employeesWithIssues}
              </Typography>
            </CardContent>
          </Card>
          {reportData.summary.plants && (
            <Card
              sx={{
                borderRadius: 3,
                border: '1px solid #e5e7eb',
                boxShadow: 'none',
              }}
            >
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="caption" color="text.secondary">
                  Plantas
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="#1e40af">
                  {reportData.summary.plants.length}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Legend */}
      {reportData && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {STATUS_LEGEND.map((s) => (
            <Chip
              key={s.code}
              label={`${s.code} = ${s.label}`}
              size="small"
              sx={{ bgcolor: s.color, color: 'white', fontWeight: 'bold' }}
            />
          ))}
        </Box>
      )}

      {/* Report Table */}
      {reportData?.employees && filteredEmployees.length > 0 && (
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
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                  }}
                >
                  No.
                </TableCell>
                <TableCell
                  sx={{
                    position: 'sticky',
                    left: 40,
                    zIndex: 3,
                  }}
                >
                  ID
                </TableCell>
                <TableCell
                  sx={{
                    minWidth: 160,
                    position: 'sticky',
                    left: 90,
                    zIndex: 3,
                  }}
                >
                  Nombre
                </TableCell>
                {reportData.workdays.map((d) => (
                  <TableCell
                    key={d.date}
                    sx={{
                      textAlign: 'center',
                      minWidth: 40,
                    }}
                  >
                    <Box sx={{ fontSize: '0.75rem' }}>{d.dayName}</Box>
                    <Box sx={{ fontSize: '10px', color: '#9ca3af' }}>
                      {d.dayNumber}
                    </Box>
                  </TableCell>
                ))}
                <TableCell
                  sx={{
                    fontWeight: 600,
                    bgcolor: '#f0fdf4',
                    color: '#166534',
                    borderBottom: '2px solid #bbf7d0',
                    textAlign: 'center',
                  }}
                >
                  Asist.
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    bgcolor: '#fef2f2',
                    color: '#991b1b',
                    borderBottom: '2px solid #fecaca',
                    textAlign: 'center',
                  }}
                >
                  Faltas
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    bgcolor: '#fffbeb',
                    color: '#92400e',
                    borderBottom: '2px solid #fde68a',
                    textAlign: 'center',
                  }}
                >
                  Ret.
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    bgcolor: '#eff6ff',
                    color: '#1e40af',
                    borderBottom: '2px solid #bfdbfe',
                    textAlign: 'center',
                  }}
                >
                  H.Ext.
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
              {filteredEmployees.map((emp, idx) => {
                const employeeWorkdaysCount =
                  emp.employeeWorkdaysCount || reportData.workdays.length;
                const faltas = employeeWorkdaysCount - emp.daysPresent;
                const allPlantsUsed = new Set<string>();
                Object.values(emp.dailyData).forEach((d) => {
                  if (d.plantsUsed)
                    d.plantsUsed.forEach((p) => allPlantsUsed.add(p));
                });

                return (
                  <TableRow key={emp.employeeNumber} hover>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 0,
                        bgcolor: 'white',
                        zIndex: 1,
                      }}
                    >
                      {idx + 1}
                    </TableCell>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 40,
                        bgcolor: 'white',
                        zIndex: 1,
                      }}
                    >
                      {emp.employeeNumber}
                    </TableCell>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 90,
                        bgcolor: 'white',
                        zIndex: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Tooltip
                        title={`${emp.employeeRole} — ${emp.shift} (${emp.shiftStartTime}–${emp.shiftEndTime}) | Total: ${emp.totalHours}h | Extra: ${emp.totalOvertimeHours}h | Asist: ${emp.attendanceRate}%`}
                      >
                        <span>{emp.employeeName}</span>
                      </Tooltip>
                    </TableCell>
                    {reportData.workdays.map((day) => {
                      const dayData = emp.dailyData[day.date];
                      const statusCode = computeStatusCode(dayData);
                      const hasMultiPlant =
                        dayData?.plantsUsed && dayData.plantsUsed.length > 1;
                      return (
                        <TableCell
                          key={day.date}
                          sx={{
                            textAlign: 'center',
                            p: 0.5,
                            ...getStatusColor(statusCode),
                          }}
                        >
                          <Tooltip
                            title={
                              dayData?.plantsUsed?.length
                                ? `${dayData.plantsUsed.join(', ')} | ${dayData.hours || 0}h${(dayData.overtimeHours ?? 0) > 0 ? ` (Extra: ${dayData.overtimeHours}h)` : ''}${dayData.firstEntry ? ` | ${dayData.firstEntry.split('T').pop()?.slice(0, 5) ?? ''}–${dayData.lastExit?.split('T').pop()?.slice(0, 5) ?? '?'}` : ''}`
                                : ''
                            }
                          >
                            <span
                              style={{ fontWeight: 'bold', fontSize: '12px' }}
                            >
                              {statusCode === 'A+' ? 'A' : statusCode}
                              {hasMultiPlant ? '*' : ''}
                              {statusCode === 'A+' && (
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: '9px',
                                    fontWeight: 'normal',
                                    lineHeight: 1,
                                  }}
                                >
                                  +{dayData?.overtimeHours}h
                                </span>
                              )}
                            </span>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ textAlign: 'center', bgcolor: '#dcfce7' }}>
                      {emp.daysPresent}
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        bgcolor: faltas > 0 ? '#fee2e2' : undefined,
                      }}
                    >
                      {faltas}
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        bgcolor: emp.daysLate > 0 ? '#fef3c7' : undefined,
                      }}
                    >
                      {emp.daysLate || 0}
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        bgcolor:
                          emp.totalOvertimeHours > 0 ? '#dbeafe' : undefined,
                      }}
                    >
                      {emp.totalOvertimeHours > 0 ? (
                        <Tooltip
                          title={reportData.workdays
                            .filter(
                              (d) =>
                                (emp.dailyData[d.date]?.overtimeHours ?? 0) > 0,
                            )
                            .map(
                              (d) =>
                                `${d.dayName.slice(0, 3)}: ${emp.dailyData[d.date].overtimeHours}h`,
                            )
                            .join(' + ')}
                        >
                          <span
                            style={{ cursor: 'default' }}
                          >{`${emp.totalOvertimeHours}h`}</span>
                        </Tooltip>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        textAlign: 'center',
                        bgcolor: '#ccfbf1',
                        fontSize: '11px',
                      }}
                    >
                      {[...allPlantsUsed].join(', ') || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {reportData && filteredEmployees.length === 0 && !hasFilters && (
        <Alert severity="info">
          No se encontraron registros para el rango de fechas seleccionado.
          Asegúrate de sincronizar las plantas primero.
        </Alert>
      )}

      {reportData && filteredEmployees.length === 0 && hasFilters && (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid #dbeafe',
            bgcolor: '#f8fafc',
          }}
        >
          <Typography
            variant="subtitle1"
            color="text.secondary"
            fontWeight={600}
          >
            Sin resultados para los filtros aplicados
          </Typography>
          <Button
            size="small"
            onClick={clearFilters}
            sx={{ mt: 1, textTransform: 'none', fontWeight: 600 }}
          >
            Limpiar filtros
          </Button>
        </Paper>
      )}

      {reportData && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1, display: 'block' }}
        >
          * Indica que el empleado checó en más de una planta ese día. Hover
          para ver detalle. Total de registros procesados:{' '}
          {reportData.totalRecords} | Generado: {reportData.generatedAt}
        </Typography>
      )}
    </Box>
  );
}
