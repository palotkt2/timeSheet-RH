'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Divider,
  Autocomplete,
} from '@mui/material';
import { UserPlus, Server, Clock, X } from 'lucide-react';

interface PlantOption {
  id: number;
  name: string;
  ip_address: string;
}

interface ShiftOption {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  source_plant_id: number;
}

interface RegisterResult {
  plant_id: number;
  plant_name: string;
  registered: boolean;
  shiftAssigned: boolean;
  error?: string;
}

interface DepartmentOption {
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmployeeRegisterDialog({
  open,
  onClose,
  onSuccess,
}: Props) {
  const [form, setForm] = useState({
    employee_number: '',
    employee_name: '',
    employee_role: 'employee',
    department: '',
  });
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [selectedPlants, setSelectedPlants] = useState<Set<number>>(new Set());
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [selectedShift, setSelectedShift] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<RegisterResult[] | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // Load plants and shifts
  useEffect(() => {
    if (!open) return;
    // Reset state
    setForm({
      employee_number: '',
      employee_name: '',
      employee_role: 'employee',
      department: '',
    });
    setSelectedPlants(new Set());
    setSelectedShift('');
    setError('');
    setResults(null);

    Promise.all([
      fetch('/api/plants').then((r) => r.json()),
      fetch('/api/multi-plant/shifts').then((r) => r.json()),
    ]).then(([plantsData, shiftsData]) => {
      if (plantsData.success) {
        const activePlants = (plantsData.plants as PlantOption[]).filter(
          (p: PlantOption & { is_active?: number }) => p.is_active !== 0,
        );
        setPlants(activePlants);
        // Pre-select all plants
        setSelectedPlants(new Set(activePlants.map((p: PlantOption) => p.id)));
      }
      // Get unique shift names from the shifts table (global shifts)
      if (shiftsData.success && shiftsData.shiftNames) {
        // We need the shift IDs from the shifts table, not from assignments
        // Fetch from the DB via a different approach - use shift names
        fetchShiftDefinitions();
      }
    });

    // Fetch departments from all active plants
    setLoadingDepts(true);
    fetch('/api/multi-plant/departments')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.departments) {
          setDepartments(data.departments as DepartmentOption[]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDepts(false));
  }, [open]);

  const fetchShiftDefinitions = async () => {
    try {
      // We'll use the shift names from the sync endpoint
      const res = await fetch('/api/multi-plant/shifts');
      const data = await res.json();
      if (data.success && data.shiftNames) {
        // Build a unique list from shiftNames
        const names = data.shiftNames as Array<{
          shift_name: string;
          start_time: string;
          end_time: string;
        }>;
        // We need IDs, so let's get them differently
        // Actually, we get shift definitions from the local DB
        // via a new lightweight query. For now we use shiftNames.
        // We'll pass shift_name to the API and resolve there.
        setShifts(
          names.map((s, idx) => ({
            id: idx + 1,
            name: s.shift_name,
            start_time: s.start_time,
            end_time: s.end_time,
            source_plant_id: 0,
          })),
        );
      }
    } catch {
      // Non-critical: shifts dropdown will be empty
    }
  };

  const togglePlant = (plantId: number) => {
    setSelectedPlants((prev) => {
      const next = new Set(prev);
      if (next.has(plantId)) next.delete(plantId);
      else next.add(plantId);
      return next;
    });
  };

  const selectAllPlants = () => {
    if (selectedPlants.size === plants.length) {
      setSelectedPlants(new Set());
    } else {
      setSelectedPlants(new Set(plants.map((p) => p.id)));
    }
  };

  const handleSubmit = async () => {
    setError('');
    setResults(null);

    if (!form.employee_number.trim() || !form.employee_name.trim()) {
      setError('Número y nombre del empleado son requeridos');
      return;
    }
    if (selectedPlants.size === 0) {
      setError('Debe seleccionar al menos un checador');
      return;
    }

    setSaving(true);
    try {
      // Resolve shift_id: find the actual shift ID in the local DB
      // We'll pass shift name and let the API resolve it
      let shiftId: number | undefined;
      if (selectedShift !== '') {
        const shift = shifts[Number(selectedShift) - 1];
        if (shift) {
          // We need the actual DB ID. Fetch it by name.
          const shiftRes = await fetch(
            `/api/multi-plant/employees/register/shifts?name=${encodeURIComponent(shift.name)}`,
          );
          const shiftData = await shiftRes.json();
          if (shiftData.success && shiftData.shift_id) {
            shiftId = shiftData.shift_id;
          }
        }
      }

      const res = await fetch('/api/multi-plant/employees/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          is_new_department:
            form.department !== '' &&
            !departments.some((d) => d.code === form.department),
          plant_ids: Array.from(selectedPlants),
          shift_id: shiftId,
        }),
      });
      const data = await res.json();

      if (data.results) {
        setResults(data.results);
      }
      if (data.success) {
        // Don't close immediately—show results
        setTimeout(() => {
          onSuccess();
        }, 500);
      } else {
        setError(data.error || 'Error al registrar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          bgcolor: '#1e40af',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UserPlus size={20} />
          <Typography variant="h6" component="span" fontWeight={600}>
            Registrar Empleado
          </Typography>
        </Box>
        <Button
          onClick={handleClose}
          disabled={saving}
          sx={{ color: 'white', minWidth: 'auto', p: 0.5 }}
        >
          <X size={18} />
        </Button>
      </DialogTitle>
      <DialogContent sx={{ mt: 1, pb: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, mt: 1, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {results && (
          <Alert
            severity={
              results.every((r) => r.registered) ? 'success' : 'warning'
            }
            sx={{ mb: 2, mt: 1, borderRadius: 2 }}
          >
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              Resultado del registro:
            </Typography>
            {results.map((r) => (
              <Typography key={r.plant_id} variant="body2">
                {r.registered ? '✅' : '❌'} {r.plant_name}
                {r.shiftAssigned && ' (turno asignado)'}
                {r.error && ` — ${r.error}`}
              </Typography>
            ))}
          </Alert>
        )}

        {/* Employee info */}
        <Typography
          variant="subtitle2"
          sx={{ mb: 1, color: '#374151', fontWeight: 600 }}
        >
          Datos del Empleado
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
          <TextField
            label="Número"
            size="small"
            value={form.employee_number}
            onChange={(e) =>
              setForm((f) => ({ ...f, employee_number: e.target.value }))
            }
            sx={{
              flex: '0 0 120px',
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
            autoFocus
          />
          <TextField
            label="Nombre completo"
            size="small"
            fullWidth
            value={form.employee_name}
            onChange={(e) =>
              setForm((f) => ({ ...f, employee_name: e.target.value }))
            }
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <FormControl
            size="small"
            sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          >
            <InputLabel>Puesto</InputLabel>
            <Select
              value={form.employee_role}
              label="Puesto"
              onChange={(e) =>
                setForm((f) => ({ ...f, employee_role: e.target.value }))
              }
            >
              <MenuItem value="employee">Empleado</MenuItem>
              <MenuItem value="supervisor">Supervisor</MenuItem>
              <MenuItem value="chofer">Chofer</MenuItem>
              <MenuItem value="guardia">Guardia</MenuItem>
              <MenuItem value="oficina">Oficina</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            freeSolo
            size="small"
            options={departments}
            getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name)}
            loading={loadingDepts}
            value={
              departments.find((d) => d.code === form.department) ||
              (form.department ? { code: '', name: form.department } : null)
            }
            onChange={(_e, val) => {
              if (!val) {
                setForm((f) => ({ ...f, department: '' }));
              } else if (typeof val === 'string') {
                setForm((f) => ({ ...f, department: val }));
              } else {
                setForm((f) => ({ ...f, department: val.code || val.name }));
              }
            }}
            onInputChange={(_e, val, reason) => {
              if (reason === 'input') {
                // If typed text doesn't match any existing option, store as-is
                const match = departments.find(
                  (d) => d.name.toLowerCase() === val.toLowerCase(),
                );
                setForm((f) => ({
                  ...f,
                  department: match ? match.code : val,
                }));
              }
            }}
            isOptionEqualToValue={(opt, val) =>
              typeof opt === 'string' || typeof val === 'string'
                ? false
                : opt.code === val.code && opt.name === val.name
            }
            filterOptions={(options, { inputValue }) => {
              const filtered = options.filter((o) =>
                o.name.toLowerCase().includes(inputValue.toLowerCase()),
              );
              // Offer to create a new department if typed text doesn't match
              if (
                inputValue !== '' &&
                !options.some(
                  (o) => o.name.toLowerCase() === inputValue.toLowerCase(),
                )
              ) {
                filtered.push({
                  code: '',
                  name: inputValue,
                });
              }
              return filtered;
            }}
            renderOption={(props, option) => {
              const isNew = option.code === '' && option.name !== '';
              return (
                <li {...props} key={option.code || `new-${option.name}`}>
                  {isNew ? (
                    <Typography variant="body2">
                      <strong>+ Crear:</strong> &quot;{option.name}&quot;
                    </Typography>
                  ) : (
                    <Typography variant="body2">{option.name}</Typography>
                  )}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Departamento"
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingDepts ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            sx={{ flex: 1 }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Plant selection */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Server size={16} color="#1e40af" />
          <Typography
            variant="subtitle2"
            sx={{ color: '#374151', fontWeight: 600 }}
          >
            Checadores destino
          </Typography>
          <Chip
            label={`${selectedPlants.size}/${plants.length}`}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 22,
              bgcolor: selectedPlants.size > 0 ? '#dbeafe' : '#fee2e2',
              color: selectedPlants.size > 0 ? '#1e40af' : '#dc2626',
            }}
          />
        </Box>
        <Paper
          variant="outlined"
          sx={{
            p: 1,
            mb: 2,
            borderRadius: 2,
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={
                    selectedPlants.size === plants.length && plants.length > 0
                  }
                  indeterminate={
                    selectedPlants.size > 0 &&
                    selectedPlants.size < plants.length
                  }
                  onChange={selectAllPlants}
                />
              }
              label={
                <Typography variant="body2" fontWeight={600}>
                  Seleccionar todos
                </Typography>
              }
              sx={{ borderBottom: '1px solid #e5e7eb', mb: 0.5, pb: 0.5 }}
            />
            {plants.map((plant) => (
              <FormControlLabel
                key={plant.id}
                control={
                  <Checkbox
                    size="small"
                    checked={selectedPlants.has(plant.id)}
                    onChange={() => togglePlant(plant.id)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {plant.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {plant.ip_address}
                    </Typography>
                  </Box>
                }
                sx={{ ml: 0 }}
              />
            ))}
          </FormGroup>
        </Paper>

        {/* Shift selection */}
        {shifts.length > 0 && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Clock size={16} color="#1e40af" />
              <Typography
                variant="subtitle2"
                sx={{ color: '#374151', fontWeight: 600 }}
              >
                Turno (opcional)
              </Typography>
            </Box>
            <FormControl
              fullWidth
              size="small"
              sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            >
              <InputLabel>Turno</InputLabel>
              <Select
                value={selectedShift}
                label="Turno"
                onChange={(e) =>
                  setSelectedShift(e.target.value as number | '')
                }
              >
                <MenuItem value="">Sin asignar</MenuItem>
                {shifts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} ({s.start_time} - {s.end_time})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          disabled={saving}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            color: '#6b7280',
          }}
        >
          {results ? 'Cerrar' : 'Cancelar'}
        </Button>
        {!results && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={
              saving ||
              !form.employee_number.trim() ||
              !form.employee_name.trim()
            }
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <UserPlus size={16} />
              )
            }
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {saving ? 'Registrando...' : 'Registrar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
