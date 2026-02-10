'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Chip,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { ChevronDown, X, Wifi, WifiOff, Lock } from 'lucide-react';
import type { Plant, PlantFormData, ConnectionTestResult } from '@/types';

const ADAPTER_TYPES = [
  {
    value: 'same-app' as const,
    label: 'Misma Aplicación (Next.js)',
    description: 'El checador remoto corre la misma app',
  },
  {
    value: 'generic' as const,
    label: 'Genérico / Configurable',
    description: 'API externa con mapeo de campos personalizado',
  },
];

const DEFAULT_FIELD_MAPPING = {
  endpoint: '/api/barcode-entries',
  method: 'GET',
  dateParamStart: 'startDate',
  dateParamEnd: 'endDate',
  responseDataPath: 'data',
  fields: {
    employee_number: 'barcode',
    timestamp: 'timestamp',
    action: 'action',
  },
  actionValues: { entry: ['Entrada', 'IN', '1'], exit: ['Salida', 'OUT', '0'] },
  pagination: {
    enabled: false,
    pageParam: 'page',
    limitParam: 'limit',
    limitValue: 500,
  },
};

interface PlantConfigDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: PlantFormData) => void;
  plant: Plant | null;
}

export default function PlantConfigDialog({
  open,
  onClose,
  onSave,
  plant,
}: PlantConfigDialogProps) {
  const isEditing = !!plant;
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: '3000',
    api_base_path: '/api',
    adapter_type: 'same-app' as 'same-app' | 'generic',
    auth_token: '',
    field_mapping: JSON.stringify(DEFAULT_FIELD_MAPPING, null, 2),
    use_https: false,
  });
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (plant) {
      setFormData({
        name: plant.name || '',
        ip_address: plant.ip_address || '',
        port: String(plant.port || 3000),
        api_base_path: plant.api_base_path || '/api',
        adapter_type: plant.adapter_type || 'same-app',
        auth_token: plant.auth_token || '',
        field_mapping:
          plant.field_mapping || JSON.stringify(DEFAULT_FIELD_MAPPING, null, 2),
        use_https: !!plant.use_https,
      });
    } else {
      setFormData({
        name: '',
        ip_address: '',
        port: '3000',
        api_base_path: '/api',
        adapter_type: 'same-app',
        auth_token: '',
        field_mapping: JSON.stringify(DEFAULT_FIELD_MAPPING, null, 2),
        use_https: false,
      });
    }
    setTestResult(null);
    setError('');
  }, [plant, open]);

  const handleChange =
    (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      setError('');
    };

  const handleTestConnection = async () => {
    if (!plant?.id) {
      setTestResult({
        success: false,
        message: 'Guarda la planta primero para probar la conexión',
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/plants/${plant.id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    if (!formData.ip_address.trim()) {
      setError('La dirección IP es requerida');
      return;
    }

    if (formData.adapter_type === 'generic' && formData.field_mapping) {
      try {
        JSON.parse(formData.field_mapping);
      } catch {
        setError('El mapeo de campos no es JSON válido');
        return;
      }
    }

    const data: PlantFormData = {
      ...formData,
      port: parseInt(formData.port) || 3000,
      field_mapping:
        formData.adapter_type === 'same-app' ? null : formData.field_mapping,
      use_https: formData.use_https,
    };

    onSave(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: '#1e40af',
          color: 'white',
        }}
      >
        <Typography variant="h6" component="span">
          {isEditing ? 'Editar Planta' : 'Agregar Nueva Planta'}
        </Typography>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 2,
            mt: 1,
          }}
        >
          <TextField
            label="Nombre de la Planta"
            value={formData.name}
            onChange={handleChange('name')}
            placeholder="Ej: Planta 1 Norte"
            fullWidth
            required
          />
          <TextField
            select
            label="Tipo de Adaptador"
            value={formData.adapter_type}
            onChange={handleChange('adapter_type')}
            fullWidth
          >
            {ADAPTER_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                <Box>
                  <Typography variant="body2">{t.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: 2,
            mt: 2,
          }}
        >
          <TextField
            label="Dirección IP"
            value={formData.ip_address}
            onChange={handleChange('ip_address')}
            placeholder="192.168.1.100"
            required
          />
          <TextField
            label="Puerto"
            type="number"
            value={formData.port}
            onChange={handleChange('port')}
            placeholder="3000"
          />
          <TextField
            label="Ruta Base API"
            value={formData.api_base_path}
            onChange={handleChange('api_base_path')}
            placeholder="/api"
          />
        </Box>

        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={formData.use_https}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    use_https: e.target.checked,
                  }))
                }
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Lock
                  size={18}
                  color={formData.use_https ? '#1e40af' : '#9ca3af'}
                />
                <Typography variant="body2">
                  Usar HTTPS{' '}
                  {formData.use_https &&
                    '(certificados auto-firmados aceptados)'}
                </Typography>
              </Box>
            }
          />
        </Box>

        <TextField
          label="Token de Autenticación (opcional)"
          value={formData.auth_token}
          onChange={handleChange('auth_token')}
          placeholder="Bearer token o API key"
          fullWidth
          sx={{ mt: 2 }}
        />

        {formData.adapter_type === 'generic' && (
          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}>
              <Typography variant="subtitle2">
                Mapeo de Campos (Avanzado)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 1, display: 'block' }}
              >
                Configura cómo se mapean los campos de la API del checador al
                formato estándar.
              </Typography>
              <TextField
                label="Configuración JSON"
                value={formData.field_mapping}
                onChange={handleChange('field_mapping')}
                multiline
                rows={12}
                fullWidth
                sx={{
                  fontFamily: 'monospace',
                  '& textarea': { fontFamily: 'monospace', fontSize: '12px' },
                }}
              />
            </AccordionDetails>
          </Accordion>
        )}

        {isEditing && (
          <Box sx={{ mt: 2, p: 2, bgcolor: '#eff6ff', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={isTesting}
                startIcon={
                  isTesting ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Wifi size={18} />
                  )
                }
                sx={{ borderColor: '#1e40af', color: '#1e40af' }}
              >
                {isTesting ? 'Probando...' : 'Probar Conexión'}
              </Button>
              {testResult && (
                <Chip
                  icon={
                    testResult.success ? (
                      <Wifi size={18} />
                    ) : (
                      <WifiOff size={18} />
                    )
                  }
                  label={testResult.message}
                  color={testResult.success ? 'success' : 'error'}
                  variant="outlined"
                  size="small"
                />
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{ bgcolor: '#1e40af', '&:hover': { bgcolor: '#1e3a8a' } }}
        >
          {isEditing ? 'Guardar Cambios' : 'Agregar Planta'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
