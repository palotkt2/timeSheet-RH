import { useState, useCallback, useEffect, useRef } from 'react';
import type { LiveDataResponse } from '@/types';

/**
 * Hook for real-time multi-plant employee status.
 * Auto-refreshes every 30 seconds.
 */
export function useMultiPlantLive() {
  const [liveData, setLiveData] = useState<LiveDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLive = useCallback(async (): Promise<LiveDataResponse | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/multi-plant/live');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLiveData(data);
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startAutoRefresh = useCallback(
    (intervalMs = 30000) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      loadLive();
      intervalRef.current = setInterval(loadLive, intervalMs);
    },
    [loadLive],
  );

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    liveData,
    isLoading,
    error,
    loadLive,
    startAutoRefresh,
    stopAutoRefresh,
  };
}
