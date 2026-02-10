'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from '@mui/material';
import {
  Users,
  Search,
  Pencil,
  Save,
  X,
  Upload,
  Download,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

interface EmployeeName {
  employee_number: string;
  employee_name: string;
  employee_role: string | null;
  department: string | null;
  source_plant_id: number | null;
  updated_at: string;
}

export default function EmployeesTab() {
  const [employees, setEmployees] = useState<EmployeeName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    employee_name: '',
    employee_role: '',
    department: '',
  });
  const [alert, setAlert] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const loadEmployees = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/multi-plant/employees');
      const data = await res.json();
      if (data.success) setEmployees(data.employees);
    } catch {
      setAlert({ type: 'error', text: 'Error al cargar empleados' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const startEdit = (emp: EmployeeName) => {
    setEditingId(emp.employee_number);
    setEditForm({
      employee_name: emp.employee_name,
      employee_role: emp.employee_role || '',
      department: emp.department || '',
    });
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.employee_name.trim()) return;
    try {
      const res = await fetch('/api/multi-plant/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_number: editingId,
          employee_name: editForm.employee_name.trim(),
          employee_role: editForm.employee_role.trim() || null,
          department: editForm.department.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', text: 'Empleado actualizado' });
        setEditingId(null);
        loadEmployees();
      } else {
        setAlert({ type: 'error', text: data.error });
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al guardar' });
    }
  };

  const handleImportCSV = async () => {
    if (!csvText.trim()) return;
    try {
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              cur += ch;
            }
          } else {
            if (ch === '"') {
              inQuotes = true;
            } else if (ch === ',') {
              result.push(cur.trim());
              cur = '';
            } else {
              cur += ch;
            }
          }
        }
        result.push(cur.trim());
        return result;
      };
      const lines = csvText
        .trim()
        .split('\n')
        .filter((l) => l.trim());
      const employees = lines
        .map((line) => {
          const parts = parseCsvLine(line);
          return {
            employee_number: parts[0],
            employee_name: parts[1] || `Empleado #${parts[0]}`,
            employee_role: parts[2] || null,
            department: parts[3] || null,
          };
        })
        .filter((e) => e.employee_number);

      const res = await fetch('/api/multi-plant/employees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees }),
      });
      const data = await res.json();
      if (data.success) {
        setAlert({ type: 'success', text: data.message });
        setImportOpen(false);
        setCsvText('');
        loadEmployees();
      } else {
        setAlert({ type: 'error', text: data.error });
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al importar' });
    }
  };

  const csvField = (v: string) => {
    if (/[,"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const exportCSV = () => {
    const header = 'Número,Nombre,Puesto,Departamento';
    const rows = employees.map((e) =>
      [
        e.employee_number,
        e.employee_name,
        e.employee_role || '',
        e.department || '',
      ]
        .map(csvField)
        .join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'empleados.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const syncFromPlants = async () => {
    try {
      setIsSyncing(true);
      const res = await fetch('/api/multi-plant/employees/sync-from-plants', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setAlert({
          type: 'success',
          text:
            data.message +
            (data.stats.stillUnnamed > 0
              ? ` (${data.stats.stillUnnamed} aún sin nombre real)`
              : ''),
        });
        loadEmployees();
      } else {
        setAlert({ type: 'error', text: data.error });
      }
    } catch {
      setAlert({ type: 'error', text: 'Error al sincronizar nombres' });
    } finally {
      setIsSyncing(false);
    }
  };

  const filtered = employees.filter(
    (e) =>
      e.employee_number.includes(search) ||
      e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.department &&
        e.department.toLowerCase().includes(search.toLowerCase())),
  );

  const paginatedRows =
    rowsPerPage > 0
      ? filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
      : filtered;

  const unnamed = employees.filter((e) =>
    e.employee_name.startsWith('Empleado #'),
  ).length;

  return (
    <Box>
      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {alert.text}
        </Alert>
      )}

      {!isLoading && unnamed > 0 && unnamed === employees.length && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
            Todos los empleados tienen nombres genéricos
          </Typography>
          <Typography variant="body2">
            Puedes asignar nombres reales de 3 formas: <strong>1)</strong> Haz
            clic en el ícono de lápiz para editar uno por uno,{' '}
            <strong>2)</strong> Usa &quot;Importar CSV&quot; para cargar nombres
            masivamente (formato: número,nombre,puesto,departamento),{' '}
            <strong>3)</strong> Usa &quot;Sync Nombres&quot; para obtener
            nombres de las plantas remotas.
          </Typography>
        </Alert>
      )}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Chip
            icon={<Users size={16} />}
            label={`${employees.length} empleados`}
            sx={{
              fontWeight: 600,
              bgcolor: '#eff6ff',
              color: '#1e40af',
              border: 'none',
              '& .MuiChip-icon': { color: '#1e40af' },
            }}
          />
          {unnamed > 0 && (
            <Chip
              icon={<UserCheck size={16} />}
              label={`${unnamed} sin nombre`}
              sx={{
                fontWeight: 600,
                bgcolor: '#fef3c7',
                color: '#92400e',
                border: 'none',
                '& .MuiChip-icon': { color: '#92400e' },
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={
              isSyncing ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <RefreshCw size={16} />
              )
            }
            onClick={syncFromPlants}
            disabled={isSyncing}
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            {isSyncing ? 'Sincronizando...' : 'Sync Nombres'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Upload size={16} />}
            onClick={() => setImportOpen(true)}
            sx={{
              borderColor: '#d1d5db',
              color: '#374151',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              '&:hover': { borderColor: '#1e40af', color: '#1e40af' },
            }}
          >
            Importar CSV
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download size={16} />}
            onClick={exportCSV}
            disabled={employees.length === 0}
            sx={{
              borderColor: '#d1d5db',
              color: '#374151',
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              '&:hover': { borderColor: '#1e40af', color: '#1e40af' },
            }}
          >
            Exportar CSV
          </Button>
        </Box>
      </Box>

      <TextField
        placeholder="Buscar por número, nombre o departamento..."
        size="small"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        sx={{
          mb: 2,
          maxWidth: 400,
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            bgcolor: 'white',
          },
        }}
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} color="#9ca3af" />
            </InputAdornment>
          ),
        }}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : filtered.length === 0 ? (
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px dashed #d1d5db',
            boxShadow: 'none',
          }}
        >
          <Users size={48} color="#9ca3af" />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {employees.length === 0
              ? 'No hay empleados registrados. Sincroniza una planta para que se registren automáticamente.'
              : 'No se encontraron resultados para la búsqueda.'}
          </Typography>
        </Paper>
      ) : (
        <>
          <TableContainer
            component={Paper}
            sx={{
              maxHeight: 'calc(100vh - 280px)',
              minHeight: 400,
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: 'none',
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {[
                    { label: '# Empleado', width: 100 },
                    { label: 'Nombre', width: undefined },
                    { label: 'Puesto', width: 160 },
                    { label: 'Departamento', width: 180 },
                    { label: 'Acciones', width: 80, align: 'center' as const },
                  ].map((col) => (
                    <TableCell
                      key={col.label}
                      sx={{
                        width: col.width,
                        textAlign: col.align || 'left',
                        fontSize: '0.8rem',
                      }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedRows.map((emp) => (
                  <TableRow key={emp.employee_number} hover>
                    <TableCell>
                      <Chip
                        label={emp.employee_number}
                        size="small"
                        sx={{
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          bgcolor: '#f3f4f6',
                          fontSize: '0.75rem',
                          border: 'none',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === emp.employee_number ? (
                        <TextField
                          size="small"
                          value={editForm.employee_name}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              employee_name: e.target.value,
                            }))
                          }
                          autoFocus
                          fullWidth
                          sx={{ '& input': { py: 0.5 } }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            color: emp.employee_name.startsWith('Empleado #')
                              ? '#9ca3af'
                              : '#111827',
                            fontStyle: emp.employee_name.startsWith(
                              'Empleado #',
                            )
                              ? 'italic'
                              : 'normal',
                            fontWeight: emp.employee_name.startsWith(
                              'Empleado #',
                            )
                              ? 400
                              : 500,
                          }}
                        >
                          {emp.employee_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === emp.employee_number ? (
                        <TextField
                          size="small"
                          value={editForm.employee_role}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              employee_role: e.target.value,
                            }))
                          }
                          fullWidth
                          placeholder="Puesto"
                          sx={{ '& input': { py: 0.5 } }}
                        />
                      ) : emp.employee_role ? (
                        <Chip
                          label={emp.employee_role}
                          size="small"
                          sx={{
                            fontWeight: 500,
                            fontSize: '0.72rem',
                            bgcolor: '#f0fdf4',
                            color: '#166534',
                            border: 'none',
                            height: 24,
                          }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === emp.employee_number ? (
                        <TextField
                          size="small"
                          value={editForm.department}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              department: e.target.value,
                            }))
                          }
                          fullWidth
                          placeholder="Departamento"
                          sx={{ '& input': { py: 0.5 } }}
                        />
                      ) : emp.department ? (
                        <Chip
                          label={emp.department}
                          size="small"
                          sx={{
                            fontWeight: 500,
                            fontSize: '0.72rem',
                            bgcolor: '#eff6ff',
                            color: '#1e40af',
                            border: 'none',
                            height: 24,
                          }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {editingId === emp.employee_number ? (
                        <Box
                          sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 0.5,
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={saveEdit}
                            sx={{
                              color: '#16a34a',
                              '&:hover': { bgcolor: '#f0fdf4' },
                            }}
                          >
                            <Save size={16} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setEditingId(null)}
                            sx={{
                              color: '#dc2626',
                              '&:hover': { bgcolor: '#fef2f2' },
                            }}
                          >
                            <X size={16} />
                          </IconButton>
                        </Box>
                      ) : (
                        <IconButton
                          size="small"
                          onClick={() => startEdit(emp)}
                          sx={{
                            color: '#6b7280',
                            '&:hover': { color: '#1e40af', bgcolor: '#eff6ff' },
                          }}
                        >
                          <Pencil size={16} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filtered.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[25, 50, 100, { label: 'Todos', value: -1 }]}
            labelRowsPerPage="Filas por página:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} de ${count}`
            }
            sx={{
              borderTop: '1px solid #e5e7eb',
              '& .MuiTablePagination-toolbar': { minHeight: 44 },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows':
                {
                  fontSize: '0.8rem',
                },
            }}
          />
        </>
      )}

      {/* Import CSV Dialog */}
      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
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
          }}
        >
          <Typography variant="h6" component="span" fontWeight={600}>
            Importar Empleados (CSV)
          </Typography>
          <IconButton
            onClick={() => setImportOpen(false)}
            sx={{ color: 'white' }}
          >
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Formato: <strong>número,nombre,puesto,departamento</strong> (una
            línea por empleado). Puesto y departamento son opcionales.
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mb: 1, display: 'block' }}
          >
            Ejemplo:
          </Typography>
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              bgcolor: '#f8f9fb',
              fontFamily: 'monospace',
              fontSize: 12,
              borderRadius: 2,
              border: '1px solid #e5e7eb',
            }}
          >
            0055,Juan Pérez,Operador,Producción
            <br />
            0061,María García,Supervisor,Calidad
            <br />
            0070,Carlos López,,Mantenimiento
          </Paper>
          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder="Pega aquí el CSV..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            sx={{
              fontFamily: 'monospace',
              '& textarea': { fontFamily: 'monospace', fontSize: 13 },
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setImportOpen(false)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              color: '#6b7280',
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleImportCSV}
            disabled={!csvText.trim()}
            sx={{
              bgcolor: '#1e40af',
              '&:hover': { bgcolor: '#1e3a8a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Importar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
