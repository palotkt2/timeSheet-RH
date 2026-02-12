'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  TablePagination,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  TableSortLabel,
} from '@mui/material';
import { Clock, Search, Save, X, Undo2, Filter, RefreshCw } from 'lucide-react';

/* ─────── Types ─────── */

interface ShiftDef {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  days: string;
  custom_hours: string;
  source_plant_id: number;
}

interface EmployeeAssignment {
  employee_number: string;
  employee_name: string;
  employee_role: string | null;
  department: string | null;
  shift_name: string | null;
  start_time: string | null;
  end_time: string | null;
  days: string | null;
  is_manual: number;
  source_plant_id: number | null;
  plant_name: string | null;
  shift_id: number | null;
  assignment_count: number;
}

type SortField =
  | 'employee_number'
  | 'employee_name'
  | 'shift_name'
  | 'start_time'
  | 'is_manual';
type SortDir = 'asc' | 'desc';

/* ─────── Helpers ─────── */

function formatDays(daysJson: string | null): string {
  if (!daysJson) return 'L-V';
  try {
    const arr: number[] = JSON.parse(daysJson);
    const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    if (arr.length === 7) return 'Todos';
    if (
      arr.length === 5 &&
      arr.includes(1) &&
      arr.includes(2) &&
      arr.includes(3) &&
      arr.includes(4) &&
      arr.includes(5)
    )
      return 'L-V';
    if (arr.length === 2 && arr.includes(0) && arr.includes(6)) return 'S-D';
    return arr.map((d) => names[d]).join(', ');
  } catch {
    return daysJson;
  }
}

/* ─────── Component ─────── */

export default function ShiftsTab() {
  const [employees, setEmployees] = useState<EmployeeAssignment[]>([]);
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterManual, setFilterManual] = useState<string>('all');
  const [alert, setAlert] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortField, setSortField] = useState<SortField>('employee_number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Dialog state for assigning shift
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmployee, setAssignEmployee] =
    useState<EmployeeAssignment | null>(null);
  const [selectedShift, setSelectedShift] = useState<string>('');

  // Bulk assignment
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkShift, setBulkShift] = useState<string>('');
  const [bulkEmployees, setBulkEmployees] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/multi-plant/shift-assignments');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.employees);
        setShifts(data.shifts);
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al cargar datos' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-clear alerts
  useEffect(() => {
    if (alert) {
      const t = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(t);
    }
  }, [alert]);

  /* ─── Sorting ─── */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  /* ─── Filtered & sorted data ─── */
  const filtered = useMemo(() => {
    let list = [...employees];

    // Text search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.employee_number.includes(q) ||
          (e.employee_name && e.employee_name.toLowerCase().includes(q)) ||
          (e.shift_name && e.shift_name.toLowerCase().includes(q)),
      );
    }

    // Shift filter
    if (filterShift === 'none') {
      list = list.filter((e) => !e.shift_name);
    } else if (filterShift !== 'all') {
      list = list.filter((e) => e.shift_name === filterShift);
    }

    // Manual filter
    if (filterManual === 'manual') {
      list = list.filter((e) => e.is_manual === 1);
    } else if (filterManual === 'synced') {
      list = list.filter((e) => e.is_manual === 0 && e.shift_name);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === 'string' && typeof bv === 'string')
        cmp = av.localeCompare(bv);
      else cmp = (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [employees, search, filterShift, filterManual, sortField, sortDir]);

  const paginated = filtered.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  /* ─── Unique shift names for filter ─── */
  const uniqueShiftNames = useMemo(() => {
    const names = new Set<string>();
    employees.forEach((e) => {
      if (e.shift_name) names.add(e.shift_name);
    });
    return Array.from(names).sort();
  }, [employees]);

  /* ─── Assign shift ─── */
  const openAssign = (emp: EmployeeAssignment) => {
    setAssignEmployee(emp);
    setSelectedShift('');
    setAssignOpen(true);
  };

  const doAssign = async () => {
    if (!assignEmployee || !selectedShift) return;

    const shift = shifts.find(
      (s) => `${s.name}|${s.start_time}|${s.end_time}` === selectedShift,
    );
    if (!shift) return;

    try {
      const res = await fetch('/api/multi-plant/shift-assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_number: assignEmployee.employee_number,
          shift_name: shift.name,
          start_time: shift.start_time,
          end_time: shift.end_time,
          days: shift.days,
          shift_id: shift.id,
          source_plant_id: shift.source_plant_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', text: data.message });
        setAssignOpen(false);
        loadData();
      } else {
        setAlert({ type: 'error', text: data.error });
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al asignar turno' });
    }
  };

  /* ─── Remove manual override ─── */
  const removeOverride = async (empNumber: string) => {
    if (!confirm(`¿Quitar asignación manual de ${empNumber}?`)) return;
    try {
      const res = await fetch('/api/multi-plant/shift-assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_number: empNumber }),
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', text: data.message });
        loadData();
      } else {
        setAlert({ type: 'error', text: data.error });
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al quitar override' });
    }
  };

  /* ─── Bulk assign ─── */
  const doBulkAssign = async () => {
    if (!bulkShift || !bulkEmployees.trim()) return;

    const shift = shifts.find(
      (s) => `${s.name}|${s.start_time}|${s.end_time}` === bulkShift,
    );
    if (!shift) return;

    const empNumbers = bulkEmployees
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (empNumbers.length === 0) return;

    let ok = 0;
    let fail = 0;

    for (const empNum of empNumbers) {
      try {
        const res = await fetch('/api/multi-plant/shift-assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_number: empNum,
            shift_name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time,
            days: shift.days,
            shift_id: shift.id,
            source_plant_id: shift.source_plant_id,
          }),
        });
        const data = await res.json();
        if (data.success) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }

    setAlert({
      type: fail === 0 ? 'success' : 'error',
      text: `Asignación masiva: ${ok} exitosas, ${fail} errores`,
    });
    setBulkOpen(false);
    setBulkEmployees('');
    loadData();
  };

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const total = employees.length;
    const assigned = employees.filter((e) => e.shift_name).length;
    const manual = employees.filter((e) => e.is_manual === 1).length;
    const unassigned = total - assigned;
    return { total, assigned, manual, unassigned };
  }, [employees]);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock size={24} />
          <Typography variant="h5" fontWeight={700}>
            Asignación de Turnos
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshCw size={16} />}
            onClick={loadData}
          >
            Actualizar
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setBulkOpen(true)}
          >
            Asignación Masiva
          </Button>
        </Box>
      </Box>

      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {alert.text}
        </Alert>
      )}

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Paper sx={{ px: 2, py: 1.5, borderRadius: 2, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">
            Total Empleados
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {stats.total}
          </Typography>
        </Paper>
        <Paper sx={{ px: 2, py: 1.5, borderRadius: 2, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">
            Con Turno Asignado
          </Typography>
          <Typography variant="h6" fontWeight={700} color="success.main">
            {stats.assigned}
          </Typography>
        </Paper>
        <Paper sx={{ px: 2, py: 1.5, borderRadius: 2, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">
            Asignación Manual
          </Typography>
          <Typography variant="h6" fontWeight={700} color="info.main">
            {stats.manual}
          </Typography>
        </Paper>
        <Paper sx={{ px: 2, py: 1.5, borderRadius: 2, flex: 1, minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary">
            Sin Turno
          </Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            color={stats.unassigned > 0 ? 'warning.main' : 'text.secondary'}
          >
            {stats.unassigned}
          </Typography>
        </Paper>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <TextField
            placeholder="Buscar por número o nombre..."
            size="small"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Turno</InputLabel>
            <Select
              value={filterShift}
              label="Turno"
              onChange={(e) => {
                setFilterShift(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="all">Todos los turnos</MenuItem>
              <MenuItem value="none">Sin turno asignado</MenuItem>
              {uniqueShiftNames.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Origen</InputLabel>
            <Select
              value={filterManual}
              label="Origen"
              onChange={(e) => {
                setFilterManual(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="manual">Solo manuales</MenuItem>
              <MenuItem value="synced">Solo sincronizados</MenuItem>
            </Select>
          </FormControl>

          <Chip
            icon={<Filter size={14} />}
            label={`${filtered.length} resultados`}
            size="small"
            variant="outlined"
          />
        </Box>
      </Paper>

      {/* Table */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 400px)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>
                  <TableSortLabel
                    active={sortField === 'employee_number'}
                    direction={
                      sortField === 'employee_number' ? sortDir : 'asc'
                    }
                    onClick={() => handleSort('employee_number')}
                  >
                    # Empleado
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'employee_name'}
                    direction={sortField === 'employee_name' ? sortDir : 'asc'}
                    onClick={() => handleSort('employee_name')}
                  >
                    Nombre
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>
                  <TableSortLabel
                    active={sortField === 'shift_name'}
                    direction={sortField === 'shift_name' ? sortDir : 'asc'}
                    onClick={() => handleSort('shift_name')}
                  >
                    Turno Asignado
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: 90 }}>
                  <TableSortLabel
                    active={sortField === 'start_time'}
                    direction={sortField === 'start_time' ? sortDir : 'asc'}
                    onClick={() => handleSort('start_time')}
                  >
                    Horario
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: 90 }}>Días</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>
                  <TableSortLabel
                    active={sortField === 'is_manual'}
                    direction={sortField === 'is_manual' ? sortDir : 'asc'}
                    onClick={() => handleSort('is_manual')}
                  >
                    Origen
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: 120 }} align="center">
                  Acciones
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginated.map((emp) => (
                <TableRow
                  key={emp.employee_number}
                  hover
                  sx={{
                    bgcolor: !emp.shift_name
                      ? 'rgba(255,152,0,0.04)'
                      : emp.is_manual
                        ? 'rgba(33,150,243,0.04)'
                        : undefined,
                  }}
                >
                  <TableCell>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      fontFamily="monospace"
                    >
                      {emp.employee_number}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {emp.employee_name || '—'}
                    </Typography>
                    {emp.department && (
                      <Typography variant="caption" color="text.secondary">
                        {emp.department}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {emp.shift_name ? (
                      <Typography variant="body2">{emp.shift_name}</Typography>
                    ) : (
                      <Typography
                        variant="body2"
                        color="warning.main"
                        fontStyle="italic"
                      >
                        Sin turno
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {emp.start_time && emp.end_time ? (
                      <Typography
                        variant="body2"
                        fontFamily="monospace"
                        fontSize="0.8rem"
                      >
                        {emp.start_time} - {emp.end_time}
                      </Typography>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontSize="0.8rem">
                      {formatDays(emp.days)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {emp.shift_name ? (
                      emp.is_manual ? (
                        <Chip
                          label="Manual"
                          size="small"
                          color="info"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      ) : (
                        <Tooltip title={emp.plant_name || ''}>
                          <Chip
                            label="Sincronizado"
                            size="small"
                            color="default"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Tooltip>
                      )
                    ) : null}
                  </TableCell>
                  <TableCell align="center">
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title="Asignar turno">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => openAssign(emp)}
                        >
                          <Save size={16} />
                        </IconButton>
                      </Tooltip>
                      {emp.is_manual === 1 && (
                        <Tooltip title="Quitar asignación manual">
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => removeOverride(emp.employee_number)}
                          >
                            <Undo2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No se encontraron empleados
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 200]}
          labelRowsPerPage="Filas por página"
        />
      </Paper>

      {/* ─── Assign Shift Dialog ─── */}
      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock size={20} />
          Asignar Turno
        </DialogTitle>
        <DialogContent>
          {assignEmployee && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Empleado:{' '}
                <strong>
                  {assignEmployee.employee_number} —{' '}
                  {assignEmployee.employee_name}
                </strong>
              </Typography>
              {assignEmployee.shift_name && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Turno actual:{' '}
                  <strong>
                    {assignEmployee.shift_name} ({assignEmployee.start_time} -{' '}
                    {assignEmployee.end_time})
                  </strong>
                  {assignEmployee.is_manual ? ' (manual)' : ' (sincronizado)'}
                </Typography>
              )}
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Seleccionar turno</InputLabel>
                <Select
                  value={selectedShift}
                  label="Seleccionar turno"
                  onChange={(e) => setSelectedShift(e.target.value)}
                >
                  {shifts.map((s) => {
                    const key = `${s.name}|${s.start_time}|${s.end_time}`;
                    return (
                      <MenuItem key={key} value={key}>
                        <Box>
                          <Typography variant="body2">{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.start_time} - {s.end_time} | {formatDays(s.days)}
                          </Typography>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAssignOpen(false)}
            startIcon={<X size={16} />}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={doAssign}
            disabled={!selectedShift}
            startIcon={<Save size={16} />}
          >
            Asignar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Bulk Assign Dialog ─── */}
      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Clock size={20} />
          Asignación Masiva de Turno
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Seleccionar turno</InputLabel>
              <Select
                value={bulkShift}
                label="Seleccionar turno"
                onChange={(e) => setBulkShift(e.target.value)}
              >
                {shifts.map((s) => {
                  const key = `${s.name}|${s.start_time}|${s.end_time}`;
                  return (
                    <MenuItem key={key} value={key}>
                      <Box>
                        <Typography variant="body2">{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.start_time} - {s.end_time} | {formatDays(s.days)}
                        </Typography>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              multiline
              rows={6}
              label="Números de empleado"
              placeholder="Ingresa los números de empleado, uno por línea o separados por comas.&#10;Ejemplo:&#10;0812&#10;0304&#10;1237"
              value={bulkEmployees}
              onChange={(e) => setBulkEmployees(e.target.value)}
              helperText="Un número por línea, o separados por comas"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkOpen(false)}
            startIcon={<X size={16} />}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={doBulkAssign}
            disabled={!bulkShift || !bulkEmployees.trim()}
            startIcon={<Save size={16} />}
          >
            Asignar a Todos
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
