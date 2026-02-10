'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  CircularProgress,
  Avatar,
  LinearProgress,
  alpha,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  RotateCw,
  Clock,
  User,
  Factory,
  Activity,
  TrendingUp,
  UserCheck,
  LogOut as LogOutIcon,
  Zap,
  Search,
  Filter,
  X,
} from 'lucide-react';
import type { LiveDataResponse, LiveEmployeeStatus } from '@/types';

interface LiveTabProps {
  liveData: LiveDataResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  startAutoRefresh: (interval: number) => void;
  stopAutoRefresh: () => void;
}

/* ── Stat Card ───────────────────────────────────── */
function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(color, 0.15),
        bgcolor: bg,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        transition: 'transform 0.15s, box-shadow 0.15s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 20px ${alpha(color, 0.15)}`,
        },
      }}
    >
      <Avatar
        sx={{ bgcolor: alpha(color, 0.12), color, width: 48, height: 48 }}
      >
        {icon}
      </Avatar>
      <Box>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, color, lineHeight: 1.2 }}
        >
          {value}
        </Typography>
      </Box>
    </Paper>
  );
}

/* ── Plant Badge with mini bar ───────────────────── */
function PlantBadge({
  name,
  count,
  total,
}: {
  name: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <Paper
      elevation={0}
      sx={{
        px: 2,
        py: 1.2,
        borderRadius: 2,
        border: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minWidth: 180,
      }}
    >
      <Factory size={16} color="#1e40af" />
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
          {name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              bgcolor: '#e5e7eb',
              '& .MuiLinearProgress-bar': {
                bgcolor: '#1e40af',
                borderRadius: 2,
              },
            }}
          />
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            {count}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

/* ── Shift resolution: prefer DB assignment, fallback to time inference ─── */
const SHIFT_RANGES_FALLBACK = [
  { label: 'Turno Matutino', minHour: 4, maxHour: 10 },
  { label: 'Turno Vespertino', minHour: 10, maxHour: 18 },
  { label: 'Turno Nocturno', minHour: 18, maxHour: 28 },
];

function getEmployeeShift(emp: LiveEmployeeStatus): string {
  // Use assigned shift from DB if available
  if (emp.shiftName) return emp.shiftName;
  // Fallback: infer from first entry time
  const ts = emp.firstEntry || emp.lastTimestamp;
  if (!ts) return 'Sin turno';
  const d = new Date(ts);
  let h = d.getHours() + d.getMinutes() / 60;
  if (h < 4) h += 24;
  for (const s of SHIFT_RANGES_FALLBACK) {
    if (h >= s.minHour && h < s.maxHour) return s.label;
  }
  return 'Sin turno';
}

/** Color-coded chip for shift names */
function ShiftChip({ shift }: { shift: string }) {
  const s = shift.toLowerCase();
  let bgcolor = '#e0e7ff';
  let color = '#3730a3';
  if (s.includes('matutino') && !s.includes('oficina')) {
    bgcolor = '#fef9c3';
    color = '#854d0e';
  } else if (s.includes('oficina')) {
    bgcolor = '#dbeafe';
    color = '#1e40af';
  } else if (s.includes('vespertino')) {
    bgcolor = '#ffe4e6';
    color = '#9f1239';
  } else if (s.includes('nocturno')) {
    bgcolor = '#e0e7ff';
    color = '#3730a3';
  } else if (s.includes('guardia')) {
    bgcolor = '#fce7f3';
    color = '#9d174d';
  } else if (s.includes('chofer')) {
    bgcolor = '#d1fae5';
    color = '#065f46';
  } else if (s.includes('rotativo')) {
    bgcolor = '#f3e8ff';
    color = '#6b21a8';
  }
  return (
    <Chip
      label={shift}
      size="small"
      sx={{ fontWeight: 500, fontSize: '0.68rem', height: 22, bgcolor, color }}
    />
  );
}

/* ── Filter bar component ────────────────────────── */
function FilterBar({
  plantOptions,
  shiftOptions,
  plantFilter,
  setPlantFilter,
  shiftFilter,
  setShiftFilter,
  searchText,
  setSearchText,
  activeFilters,
  clearFilters,
}: {
  plantOptions: string[];
  shiftOptions: string[];
  plantFilter: string;
  setPlantFilter: (v: string) => void;
  shiftFilter: string;
  setShiftFilter: (v: string) => void;
  searchText: string;
  setSearchText: (v: string) => void;
  activeFilters: number;
  clearFilters: () => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: 3,
        border: '1px solid #e5e7eb',
        bgcolor: '#fafbfc',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
        }}
      >
        <Filter size={16} color="#6b7280" />
        <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
          Filtros
        </Typography>
        {activeFilters > 0 && (
          <Chip
            label={`${activeFilters} activo${activeFilters > 1 ? 's' : ''}`}
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
        {/* Employee search */}
        <TextField
          size="small"
          placeholder="Buscar empleado (# o nombre)..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color="#9ca3af" />
              </InputAdornment>
            ),
            ...(searchText && {
              endAdornment: (
                <InputAdornment position="end">
                  <Box
                    sx={{ cursor: 'pointer', display: 'flex' }}
                    onClick={() => setSearchText('')}
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
          <InputLabel sx={{ fontSize: '0.85rem' }}>Planta / Área</InputLabel>
          <Select
            value={plantFilter}
            label="Planta / Área"
            onChange={(e) => setPlantFilter(e.target.value)}
            sx={{ borderRadius: 2, bgcolor: '#fff', fontSize: '0.85rem' }}
          >
            <MenuItem value="">
              <em>Todas las plantas</em>
            </MenuItem>
            {plantOptions.map((p) => (
              <MenuItem key={p} value={p} sx={{ fontSize: '0.85rem' }}>
                {p}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Shift filter */}
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
          </Select>
        </FormControl>
      </Box>
    </Paper>
  );
}

export default function LiveTab({
  liveData,
  isLoading,
  onRefresh,
  startAutoRefresh,
  stopAutoRefresh,
}: LiveTabProps) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [plantFilter, setPlantFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const toggleAutoRefresh = () => {
    if (autoRefresh) {
      stopAutoRefresh();
      setAutoRefresh(false);
    } else {
      startAutoRefresh(30000);
      setAutoRefresh(true);
    }
  };

  // Derive plant options from live data
  const plantOptions = useMemo(() => {
    if (!liveData?.plantSummary) return [];
    return liveData.plantSummary.map((p) => p.name);
  }, [liveData]);

  // Derive shift options from actual employee data (DB assignments + fallback)
  const shiftOptions = useMemo(() => {
    const all = liveData?.allEmployeesToday ?? [];
    const names = new Set(all.map((emp) => getEmployeeShift(emp)));
    names.delete('Sin turno');
    return [...names].sort();
  }, [liveData]);

  // Apply filters
  const filterEmployees = useMemo(() => {
    const applyFilters = (employees: LiveEmployeeStatus[]) => {
      if (!employees) return [];
      let filtered = employees;

      // Plant filter
      if (plantFilter) {
        filtered = filtered.filter((emp) =>
          emp.plantsToday.includes(plantFilter),
        );
      }

      // Shift filter (from DB assignment or time inference)
      if (shiftFilter) {
        filtered = filtered.filter(
          (emp) => getEmployeeShift(emp) === shiftFilter,
        );
      }

      // Text search (employee number or name)
      if (searchText.trim()) {
        const q = searchText.toLowerCase().trim();
        filtered = filtered.filter(
          (emp) =>
            emp.employeeNumber.toLowerCase().includes(q) ||
            emp.employeeName.toLowerCase().includes(q),
        );
      }

      return filtered;
    };
    return applyFilters;
  }, [plantFilter, shiftFilter, searchText]);

  const filteredActive = useMemo(
    () => filterEmployees(liveData?.activeEmployees ?? []),
    [filterEmployees, liveData],
  );
  const filteredCompleted = useMemo(
    () => filterEmployees(liveData?.completedEmployees ?? []),
    [filterEmployees, liveData],
  );

  const activeFilters =
    (plantFilter ? 1 : 0) + (shiftFilter ? 1 : 0) + (searchText.trim() ? 1 : 0);
  const isFiltered = activeFilters > 0;
  const clearFilters = () => {
    setPlantFilter('');
    setShiftFilter('');
    setSearchText('');
  };

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
          <Avatar
            sx={{ bgcolor: '#eff6ff', color: '#1e40af', width: 40, height: 40 }}
          >
            <Activity size={20} />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Monitor en Tiempo Real
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Estado actual de empleados en todas las plantas
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={autoRefresh ? 'contained' : 'outlined'}
            onClick={toggleAutoRefresh}
            startIcon={autoRefresh ? <Zap size={16} /> : <Clock size={16} />}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              ...(autoRefresh
                ? {
                    bgcolor: '#16a34a',
                    '&:hover': { bgcolor: '#15803d' },
                    animation: 'pulse 2s infinite',
                    '@keyframes pulse': {
                      '0%': { boxShadow: '0 0 0 0 rgba(22,163,74,0.3)' },
                      '70%': { boxShadow: '0 0 0 6px rgba(22,163,74,0)' },
                      '100%': { boxShadow: '0 0 0 0 rgba(22,163,74,0)' },
                    },
                  }
                : {
                    borderColor: '#d1d5db',
                    color: '#6b7280',
                    '&:hover': { borderColor: '#16a34a', color: '#16a34a' },
                  }),
            }}
          >
            {autoRefresh ? 'Auto 30s' : 'Auto-Refresh'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={onRefresh}
            disabled={isLoading}
            startIcon={
              isLoading ? (
                <CircularProgress size={14} />
              ) : (
                <RotateCw size={16} />
              )
            }
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              borderColor: '#d1d5db',
              color: '#374151',
              '&:hover': { borderColor: '#1e40af', color: '#1e40af' },
            }}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

      {!liveData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={36} sx={{ color: '#1e40af' }} />
        </Box>
      ) : (
        <>
          {/* ── Summary Cards ──────────────────────────── */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 2,
              mb: 3,
            }}
          >
            <StatCard
              label="Activos Ahora"
              value={liveData.summary.currentlyActive}
              icon={<UserCheck size={22} />}
              color="#16a34a"
              bg="#f0fdf4"
            />
            <StatCard
              label="Completaron Turno"
              value={liveData.summary.completed}
              icon={<LogOutIcon size={22} />}
              color="#2563eb"
              bg="#eff6ff"
            />
            <StatCard
              label="Total Hoy"
              value={liveData.summary.totalEmployeesToday}
              icon={<TrendingUp size={22} />}
              color="#1e40af"
              bg="#f0f7ff"
            />
          </Box>

          {/* ── Plant Badges ─────────────────────────── */}
          {liveData.plantSummary && liveData.plantSummary.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
              {liveData.plantSummary.map((ps) => (
                <PlantBadge
                  key={ps.id}
                  name={ps.name}
                  count={ps.employees_today}
                  total={liveData.summary.totalEmployeesToday}
                />
              ))}
            </Box>
          )}

          {/* ── Filters ──────────────────────────────── */}
          <FilterBar
            plantOptions={plantOptions}
            shiftOptions={shiftOptions}
            plantFilter={plantFilter}
            setPlantFilter={setPlantFilter}
            shiftFilter={shiftFilter}
            setShiftFilter={setShiftFilter}
            searchText={searchText}
            setSearchText={setSearchText}
            activeFilters={activeFilters}
            clearFilters={clearFilters}
          />

          {/* ── Filter summary ───────────────────────── */}
          {isFiltered && (
            <Box
              sx={{
                mb: 2,
                px: 2,
                py: 1,
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
                Mostrando {filteredActive.length + filteredCompleted.length} de{' '}
                {liveData.summary.totalEmployeesToday} empleados
                {plantFilter && ` · ${plantFilter}`}
                {shiftFilter && ` · ${shiftFilter}`}
                {searchText.trim() && ` · "${searchText.trim()}"`}
              </Typography>
            </Box>
          )}

          {/* ── Active Employees ─────────────────────── */}
          {filteredActive.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                border: '1px solid #dcfce7',
                borderRadius: 3,
                overflow: 'hidden',
                mb: 3,
              }}
            >
              <Box
                sx={{
                  px: 2.5,
                  py: 1.5,
                  bgcolor: '#f0fdf4',
                  borderBottom: '1px solid #dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: '#22c55e',
                    animation: 'blink 1.5s infinite',
                    '@keyframes blink': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.3 },
                    },
                  }}
                />
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="#16a34a"
                >
                  Activos ({filteredActive.length}
                  {isFiltered ? ` de ${liveData.activeEmployees.length}` : ''})
                </Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {[
                        'Empleado',
                        'Nombre',
                        'Turno',
                        'Última Acción',
                        'Hora',
                        'Planta',
                        'Plantas Hoy',
                      ].map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontWeight: 600,
                            bgcolor: '#fafafa',
                            borderBottom: '2px solid #e5e7eb',
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredActive.map((emp) => (
                      <TableRow
                        key={emp.employeeNumber}
                        sx={{
                          '&:hover': { bgcolor: '#f0fdf4' },
                          transition: 'background 0.15s',
                        }}
                      >
                        <TableCell>
                          <Chip
                            label={emp.employeeNumber}
                            size="small"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              bgcolor: '#f3f4f6',
                              fontSize: '0.75rem',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {emp.employeeName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <ShiftChip shift={getEmployeeShift(emp)} />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={emp.lastAction}
                            size="small"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              ...(emp.lastAction === 'Entrada'
                                ? { bgcolor: '#dcfce7', color: '#15803d' }
                                : { bgcolor: '#fef3c7', color: '#92400e' }),
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                          >
                            {new Date(emp.lastTimestamp).toLocaleTimeString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={<Factory size={14} />}
                            label={emp.lastPlant}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 500, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}
                          >
                            {emp.plantsToday.map((p) => (
                              <Chip
                                key={p}
                                label={p}
                                size="small"
                                variant="outlined"
                                sx={{
                                  height: 22,
                                  fontSize: '0.68rem',
                                  borderColor: '#d1d5db',
                                }}
                              />
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* ── Completed Employees ──────────────────── */}
          {filteredCompleted.length > 0 && (
            <Paper
              elevation={0}
              sx={{
                border: '1px solid #dbeafe',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  px: 2.5,
                  py: 1.5,
                  bgcolor: '#eff6ff',
                  borderBottom: '1px solid #dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <LogOutIcon size={16} color="#2563eb" />
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="#2563eb"
                >
                  Completaron Turno ({filteredCompleted.length}
                  {isFiltered
                    ? ` de ${liveData.completedEmployees.length}`
                    : ''}
                  )
                </Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 350 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {[
                        'Empleado',
                        'Nombre',
                        'Turno',
                        'Checadas',
                        'Horas',
                        'Última Salida',
                        'Plantas Hoy',
                      ].map((h) => (
                        <TableCell
                          key={h}
                          sx={{
                            fontWeight: 600,
                            bgcolor: '#fafafa',
                            borderBottom: '2px solid #e5e7eb',
                          }}
                        >
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredCompleted.map((emp) => (
                      <TableRow
                        key={emp.employeeNumber}
                        sx={{
                          '&:hover': { bgcolor: '#eff6ff' },
                          transition: 'background 0.15s',
                        }}
                      >
                        <TableCell>
                          <Chip
                            label={emp.employeeNumber}
                            size="small"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              bgcolor: '#f3f4f6',
                              fontSize: '0.75rem',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {emp.employeeName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <ShiftChip shift={getEmployeeShift(emp)} />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Chip
                              label={`${emp.totalEntries}E`}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                bgcolor: '#dcfce7',
                                color: '#15803d',
                              }}
                            />
                            <Chip
                              label={`${emp.totalExits}S`}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                bgcolor: '#fef3c7',
                                color: '#92400e',
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              color:
                                (emp.workedHours ?? 0) >= 8
                                  ? '#16a34a'
                                  : '#1e40af',
                            }}
                          >
                            {(emp.workedHours ?? 0).toFixed(1)}h
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                            }}
                          >
                            {new Date(emp.lastTimestamp).toLocaleTimeString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            {emp.plantsToday.map((p) => (
                              <Chip
                                key={p}
                                label={p}
                                size="small"
                                variant="outlined"
                                sx={{
                                  height: 22,
                                  fontSize: '0.68rem',
                                  borderColor: '#d1d5db',
                                }}
                              />
                            ))}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* ── Empty State ──────────────────────────── */}
          {liveData.summary.totalEmployeesToday === 0 && !isFiltered && (
            <Paper
              elevation={0}
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 3,
                border: '1px solid #e5e7eb',
              }}
            >
              <Avatar
                sx={{
                  bgcolor: '#f3f4f6',
                  color: '#9ca3af',
                  width: 56,
                  height: 56,
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <User size={28} />
              </Avatar>
              <Typography variant="h6" color="text.secondary" fontWeight={600}>
                Sin actividad hoy
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                No hay registros de hoy en las plantas sincronizadas
              </Typography>
            </Paper>
          )}

          {/* ── No results after filter ──────────────── */}
          {isFiltered &&
            filteredActive.length === 0 &&
            filteredCompleted.length === 0 && (
              <Paper
                elevation={0}
                sx={{
                  p: 5,
                  textAlign: 'center',
                  borderRadius: 3,
                  border: '1px solid #dbeafe',
                  bgcolor: '#f8fafc',
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: '#eff6ff',
                    color: '#1e40af',
                    width: 48,
                    height: 48,
                    mx: 'auto',
                    mb: 1.5,
                  }}
                >
                  <Search size={24} />
                </Avatar>
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

          {/* ── Footer ───────────────────────────────── */}
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Clock size={12} color="#9ca3af" />
            <Typography variant="caption" color="text.secondary">
              Última actualización:{' '}
              {new Date(liveData.timestamp).toLocaleString()}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
