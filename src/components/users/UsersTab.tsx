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
  Chip,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  UserPlus,
  Users,
  Shield,
  Eye,
  Pencil,
  Trash2,
  KeyRound,
} from 'lucide-react';
import type { AppUser, UserRole } from '@/types';
import { ROLE_LABELS } from '@/types';

/* ── Role chip color helper ───────────────────────── */
function roleChipProps(role: UserRole) {
  switch (role) {
    case 'admin':
      return {
        bgcolor: '#fef2f2',
        color: '#991b1b',
        icon: <Shield size={14} />,
      };
    case 'supervisor':
      return { bgcolor: '#eff6ff', color: '#1e40af', icon: <Eye size={14} /> };
    case 'viewer':
      return { bgcolor: '#f0fdf4', color: '#166534', icon: <Eye size={14} /> };
  }
}

/* ── Form dialog ──────────────────────────────────── */
interface UserFormData {
  username: string;
  password: string;
  name: string;
  role: UserRole;
}

function UserDialog({
  open,
  onClose,
  onSave,
  editingUser,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: UserFormData) => Promise<void>;
  editingUser: AppUser | null;
}) {
  const [form, setForm] = useState<UserFormData>({
    username: '',
    password: '',
    name: '',
    role: 'viewer',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      if (editingUser) {
        setForm({
          username: editingUser.username,
          password: '',
          name: editingUser.name,
          role: editingUser.role,
        });
      } else {
        setForm({ username: '', password: '', name: '', role: 'viewer' });
      }
      setError('');
    }
  }, [open, editingUser]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.username.trim()) {
      setError('Nombre y usuario son requeridos');
      return;
    }
    if (!editingUser && !form.password) {
      setError('La contraseña es requerida para nuevos usuarios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2, mt: 1 }}>
            {error}
          </Alert>
        )}
        <TextField
          fullWidth
          label="Nombre completo"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          margin="dense"
          autoFocus
        />
        <TextField
          fullWidth
          label="Usuario"
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          margin="dense"
          disabled={!!editingUser}
          helperText={editingUser ? 'No se puede cambiar el usuario' : ''}
        />
        <TextField
          fullWidth
          label={
            editingUser
              ? 'Nueva contraseña (dejar vacío para no cambiar)'
              : 'Contraseña'
          }
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          margin="dense"
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>Rol</InputLabel>
          <Select
            value={form.role}
            label="Rol"
            onChange={(e) =>
              setForm((f) => ({ ...f, role: e.target.value as UserRole }))
            }
          >
            <MenuItem value="admin">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Shield size={16} /> Administrador
              </Box>
            </MenuItem>
            <MenuItem value="supervisor">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Eye size={16} /> Supervisor
              </Box>
            </MenuItem>
            <MenuItem value="viewer">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Eye size={16} /> Visor
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            bgcolor: '#1e40af',
            '&:hover': { bgcolor: '#1e3a8a' },
          }}
        >
          {saving ? 'Guardando...' : editingUser ? 'Actualizar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ── Main component ───────────────────────────────── */
export default function UsersTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [alert, setAlert] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch {
      setAlert({ type: 'error', text: 'Error al cargar usuarios' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSave = async (form: UserFormData) => {
    if (editingUser) {
      // Update
      const body: Record<string, unknown> = {
        name: form.name,
        role: form.role,
      };
      if (form.password) body.password = form.password;
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAlert({ type: 'success', text: 'Usuario actualizado' });
    } else {
      // Create
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAlert({ type: 'success', text: 'Usuario creado correctamente' });
    }
    loadUsers();
  };

  const handleToggleActive = async (user: AppUser) => {
    const newStatus = user.is_active ? 0 : 1;
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      setAlert({
        type: 'success',
        text: `Usuario ${newStatus ? 'activado' : 'desactivado'}`,
      });
      loadUsers();
    } else {
      setAlert({ type: 'error', text: data.error });
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (!confirm(`¿Eliminar al usuario "${user.name}" permanentemente?`))
      return;
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setAlert({ type: 'success', text: 'Usuario eliminado' });
      loadUsers();
    } else {
      setAlert({ type: 'error', text: data.error });
    }
  };

  return (
    <Box>
      {/* Header */}
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
            <Users size={20} />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Gestión de Usuarios
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Administra usuarios, roles y permisos del sistema
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<UserPlus size={18} />}
          onClick={() => {
            setEditingUser(null);
            setDialogOpen(true);
          }}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            bgcolor: '#1e40af',
            '&:hover': { bgcolor: '#1e3a8a' },
          }}
        >
          Nuevo Usuario
        </Button>
      </Box>

      {/* Alerts */}
      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          {alert.text}
        </Alert>
      )}

      {/* Roles legend */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {(['admin', 'supervisor', 'viewer'] as UserRole[]).map((r) => {
          const props = roleChipProps(r);
          return (
            <Paper
              key={r}
              elevation={0}
              sx={{
                px: 2,
                py: 1,
                borderRadius: 2,
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Chip
                size="small"
                label={ROLE_LABELS[r]}
                icon={props.icon}
                sx={{
                  bgcolor: props.bgcolor,
                  color: props.color,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {r === 'admin' && 'Todo + gestión de usuarios y plantas'}
                {r === 'supervisor' && 'Tiempo real, reportes, empleados'}
                {r === 'viewer' && 'Solo tiempo real y reportes (lectura)'}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      {/* Users table */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Usuario</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Rol</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Estado</TableCell>
                <TableCell>Creado</TableCell>
                <TableCell sx={{ textAlign: 'center', width: 120 }}>
                  Acciones
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">Cargando...</Typography>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      No hay usuarios registrados
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const rp = roleChipProps(u.role);
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        <Chip
                          size="small"
                          label={u.username}
                          icon={<KeyRound size={14} />}
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
                          {u.name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Chip
                          size="small"
                          label={ROLE_LABELS[u.role]}
                          icon={rp.icon}
                          sx={{
                            bgcolor: rp.bgcolor,
                            color: rp.color,
                            fontWeight: 600,
                            fontSize: '0.72rem',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={!!u.is_active}
                              onChange={() => handleToggleActive(u)}
                              color="success"
                            />
                          }
                          label={
                            <Typography
                              variant="caption"
                              sx={{
                                color: u.is_active ? '#16a34a' : '#9ca3af',
                              }}
                            >
                              {u.is_active ? 'Activo' : 'Inactivo'}
                            </Typography>
                          }
                          sx={{ m: 0 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(u.created_at).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Tooltip title="Editar">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingUser(u);
                              setDialogOpen(true);
                            }}
                            sx={{ color: '#1e40af' }}
                          >
                            <Pencil size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(u)}
                            sx={{ color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* User Form Dialog */}
      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        editingUser={editingUser}
      />
    </Box>
  );
}
