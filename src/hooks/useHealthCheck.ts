import { useState, useEffect, useCallback, useRef } from 'react';
import type { Plant, ConnectionTestResult } from '@/types';

export interface HealthStatus {
  plantId: number;
  isOnline: boolean;
  lastCheck: Date;
  result?: ConnectionTestResult;
}

const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos

/**
 * Hook para monitorear el estado de salud (health check/ping) de todas las plantas.
 * Realiza un test de conexión cada 5 minutos para cada planta.
 */
export function useHealthCheck(plants: Plant[]) {
  const [healthStatus, setHealthStatus] = useState<
    Record<number, HealthStatus>
  >({});
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const checkPlantHealth = useCallback(
    async (plant: Plant): Promise<HealthStatus> => {
      try {
        const res = await fetch(`/api/plants/${plant.id}/test`, {
          method: 'POST',
          signal: AbortSignal.timeout(10000), // 10 segundos timeout
        });
        const result = await res.json();

        return {
          plantId: plant.id,
          isOnline: result.success,
          lastCheck: new Date(),
          result,
        };
      } catch (error) {
        return {
          plantId: plant.id,
          isOnline: false,
          lastCheck: new Date(),
          result: {
            success: false,
            message:
              error instanceof Error ? error.message : 'Error de conexión',
          },
        };
      }
    },
    [],
  );

  const checkAllPlants = useCallback(async () => {
    if (plants.length === 0 || !mountedRef.current) return;

    setIsChecking(true);

    try {
      const results = await Promise.all(
        plants.map((plant) => checkPlantHealth(plant)),
      );

      if (!mountedRef.current) return;

      const statusMap: Record<number, HealthStatus> = {};
      results.forEach((status) => {
        statusMap[status.plantId] = status;
      });

      setHealthStatus(statusMap);
    } catch (error) {
      console.error('Error checking plant health:', error);
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [plants, checkPlantHealth]);

  const startHealthCheck = useCallback(() => {
    // Check inmediato al iniciar
    checkAllPlants();

    // Configurar intervalo de 5 minutos
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      checkAllPlants();
    }, HEALTH_CHECK_INTERVAL);
  }, [checkAllPlants]);

  const stopHealthCheck = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Iniciar health check automático cuando hay plantas
  useEffect(() => {
    if (plants.length > 0) {
      startHealthCheck();
    }

    return () => {
      stopHealthCheck();
    };
  }, [plants.length, startHealthCheck, stopHealthCheck]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopHealthCheck();
    };
  }, [stopHealthCheck]);

  return {
    healthStatus,
    isChecking,
    checkAllPlants,
    startHealthCheck,
    stopHealthCheck,
  };
}
