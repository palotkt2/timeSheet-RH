'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { LogIn, Clock } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username === 'admin' && password === 'admin') {
      const user = { username: 'admin', name: 'Administrador', role: 'admin' };
      localStorage.setItem('user', JSON.stringify(user));
      router.push('/dashboard/multi-plant');
    } else {
      setError('Usuario o contraseña incorrectos');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #0f172a 0%, #172554 50%, #1e3a8a 100%)',
      }}
    >
      <Card
        sx={{
          maxWidth: 420,
          width: '100%',
          mx: 2,
          borderRadius: 3,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                p: 1.5,
                mb: 2,
                borderRadius: 2,
              }}
            >
              <Box
                component="img"
                src="/benchpro-logo-blue-back.svg"
                alt="BenchPro"
                sx={{ height: 40, width: 'auto' }}
              />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a' }}>
              Multi-Plant Timesheet
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                mt: 0.5,
              }}
            >
              <Clock size={14} color="#1e40af" />
              <Typography variant="body2" color="text.secondary">
                Sistema de control de asistencia
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              autoFocus
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '&.Mui-focused fieldset': { borderColor: '#1e40af' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1e40af' },
              }}
            />
            <TextField
              fullWidth
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '&.Mui-focused fieldset': { borderColor: '#1e40af' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1e40af' },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              startIcon={<LogIn size={18} />}
              sx={{
                mt: 3,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 600,
                fontSize: '0.95rem',
                textTransform: 'none',
                backgroundColor: '#1e40af',
                boxShadow: '0 4px 14px rgba(30, 64, 175, 0.4)',
                '&:hover': {
                  backgroundColor: '#1e3a8a',
                  boxShadow: '0 6px 20px rgba(30, 64, 175, 0.5)',
                },
              }}
            >
              Iniciar Sesión
            </Button>
          </form>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'center', mt: 3 }}
          >
            Usuario: admin / Contraseña: admin
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
