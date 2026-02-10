'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MultiPlantDashboard from '@/components/MultiPlantDashboard';

interface User {
  username: string;
  name: string;
  role: string;
}

export default function MultiPlantPage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsedUser: User = JSON.parse(userData);
      setUser(parsedUser);
      if (parsedUser.role !== 'admin' && parsedUser.role !== 'administrator') {
        router.push('/dashboard');
      }
    } else {
      router.push('/login');
    }
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

  return <MultiPlantDashboard userName={user.name} />;
}
