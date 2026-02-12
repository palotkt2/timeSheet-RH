'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MultiPlantDashboard from '@/components/MultiPlantDashboard';
import type { UserRole } from '@/types';

interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
}

export default function MultiPlantPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Verify session via cookie-based auth check
    fetch('/api/auth/check')
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then((data) => {
        if (data.success && data.user) {
          setUser(data.user);
          // Keep localStorage in sync for client-side reads
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          throw new Error('Invalid session');
        }
      })
      .catch(() => {
        localStorage.removeItem('user');
        router.push('/login');
      });
  }, [router]);

  if (!user) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            border: '4px solid #1e40af',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return <MultiPlantDashboard userName={user.name} userRole={user.role} />;
}
