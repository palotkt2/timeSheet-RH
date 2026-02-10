'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  MenuItem,
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
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  Users,
  Clock,
  Search,
  Factory,
} from 'lucide-react';
import type { ValidationResult, ValidationReportResponse } from '@/types';

type FilterType = 'all' | 'valid' | 'invalid';

export default function ValidationTab() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [validationResults, setValidationResults] = useState<
    ValidationResult[]
  >([]);
  const [summary, setSummary] = useState<
    ValidationReportResponse['summary'] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadValidationData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/multi-plant/reports/validation?date=${selectedDate}`,
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al cargar validación');
      }
      setValidationResults(data.validationResults || []);
      setSummary(data.summary || null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadValidationData();
  }, [loadValidationData]);

  const getFilteredResults = (): ValidationResult[] => {
    let filtered = validationResults;

    if (filterType === 'valid') {
      filtered = filtered.filter((r) => r.isValid);
    } else if (filterType === 'invalid') {
      filtered = filtered.filter((r) => !r.isValid);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.employeeName || '').toLowerCase().includes(search) ||
          (r.employeeNumber || '').toString().includes(search),
      );
    }

    return filtered;
  };

  const exportValidationResults = () => {
    const filteredResults = getFilteredResults();
    if (filteredResults.length === 0) return;

    const csvContent = [
      [
        'Empleado',
        'Número',
        'Departamento',
        'Fecha',
        'Estado',
        'Horas Trabajadas',
        'Entradas',
        'Salidas',
        'Plantas',
        'Problemas',
      ].join(','),
      ...filteredResults.map((result) =>
        [
          `"${result.employeeName}"`,
          result.employeeNumber,
          `"${result.department}"`,
          result.date,
          result.isValid ? 'Válido' : 'Inválido',
          result.totalHours,
          result.totalEntries,
          result.totalExits,
          `"${(result.plantsUsed || []).join(', ')}"`,
          `"${result.issues.join(' | ')}"`,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `validacion-multiplanta-${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredResults = getFilteredResults();

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Validación de Horas Multi-Planta
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Revisa y valida las horas trabajadas consolidando todas las plantas
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
            select
            label="Filtro"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">Todos</MenuItem>
            <MenuItem value="valid">Válidos</MenuItem>
            <MenuItem value="invalid">Inválidos</MenuItem>
          </TextField>
          <TextField
            label="Buscar"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            placeholder="Nombre o número..."
            InputProps={{
              startAdornment: <Search size={20} />,
            }}
            sx={{ minWidth: 200 }}
          />
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            onClick={exportValidationResults}
            disabled={filteredResults.length === 0}
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
        </Box>
      </Paper>

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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Users size={20} color="#3b82f6" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Total Empleados
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {summary.totalEmployees}
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
                <CheckCircle2 size={20} color="#22c55e" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Válidos
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="bold"
                    color="success.main"
                  >
                    {summary.validEmployees}
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
                <AlertTriangle size={20} color="#ef4444" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Inválidos
                  </Typography>
                  <Typography variant="h5" fontWeight="bold" color="error">
                    {summary.invalidEmployees}
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
                    Total Registros
                  </Typography>
                  <Typography variant="h5" fontWeight="bold">
                    {summary.totalRecords}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Results Table */}
      {isLoading ? (
        <Paper
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid #e5e7eb',
            boxShadow: 'none',
          }}
        >
          <CircularProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">Cargando validación...</Typography>
        </Paper>
      ) : filteredResults.length > 0 ? (
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
                <TableCell>Empleado</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Estado</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Horas</TableCell>
                <TableCell sx={{ textAlign: 'center' }}>Ent/Sal</TableCell>
                <TableCell
                  sx={{
                    bgcolor: '#f0fdfa',
                    color: '#0d9488',
                    borderBottom: '2px solid #99f6e4',
                    textAlign: 'center',
                  }}
                >
                  Plantas
                </TableCell>
                <TableCell>Problemas</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredResults.map((result, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {result.employeeName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{result.employeeNumber} &bull; {result.department}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.5,
                      }}
                    >
                      {result.isValid ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                      ) : (
                        <AlertTriangle size={16} color="#ef4444" />
                      )}
                      <Chip
                        label={result.isValid ? 'Válido' : 'Inválido'}
                        size="small"
                        sx={{
                          bgcolor: result.isValid ? '#dcfce7' : '#fee2e2',
                          color: result.isValid ? '#166534' : '#991b1b',
                          fontWeight: 'bold',
                          fontSize: '11px',
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2">
                      {result.totalHours}h
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Typography variant="body2">
                      {result.totalEntries} / {result.totalExits}
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
                      {(result.plantsUsed || []).map((plant) => (
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
                  <TableCell>
                    {result.issues.length > 0 ? (
                      <Box>
                        {result.issues.map((issue, idx) => (
                          <Typography
                            key={idx}
                            variant="caption"
                            color="error"
                            sx={{ display: 'block' }}
                          >
                            &bull; {issue}
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="success.main">
                        Sin problemas
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
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
          <CheckCircle2 size={20} />
          <Typography variant="h6">No se encontraron resultados</Typography>
          <Typography variant="body2">
            No hay datos para la fecha seleccionada o los filtros aplicados.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
