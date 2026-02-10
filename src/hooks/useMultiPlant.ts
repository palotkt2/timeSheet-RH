import { useState, useCallback } from 'react';
import type {
  Plant,
  PlantFormData,
  SyncStatus,
  SyncResult,
  SyncAllResult,
  ConnectionTestResult,
} from '@/types';

/**
 * Hook for managing plants (CRUD) and sync operations.
 */
export function useMultiPlant() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const loadPlants = useCallback(async (): Promise<Plant[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plants');
      const data = await res.json();
      if (data.success) {
        setPlants(data.plants);
      } else {
        throw new Error(data.error);
      }
      return data.plants;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addPlant = useCallback(
    async (plantData: PlantFormData): Promise<Plant> => {
      setError(null);
      try {
        const res = await fetch('/api/plants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plantData),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setPlants((prev) => [...prev, data.plant]);
        return data.plant;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
        throw err;
      }
    },
    [],
  );

  const updatePlant = useCallback(
    async (id: number, plantData: Partial<PlantFormData>): Promise<Plant> => {
      setError(null);
      try {
        const res = await fetch(`/api/plants/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plantData),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setPlants((prev) => prev.map((p) => (p.id === id ? data.plant : p)));
        return data.plant;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
        throw err;
      }
    },
    [],
  );

  const deletePlant = useCallback(async (id: number): Promise<string> => {
    setError(null);
    try {
      const res = await fetch(`/api/plants/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPlants((prev) => prev.filter((p) => p.id !== id));
      return data.message;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      throw err;
    }
  }, []);

  const testConnection = useCallback(
    async (id: number): Promise<ConnectionTestResult> => {
      try {
        const res = await fetch(`/api/plants/${id}/test`, { method: 'POST' });
        const data = await res.json();
        return data;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        return { success: false, message };
      }
    },
    [],
  );

  const syncPlant = useCallback(
    async (
      id: number,
      startDate: string,
      endDate: string,
    ): Promise<SyncResult> => {
      setSyncStatus({ type: 'single', plantId: id, status: 'syncing' });
      try {
        const res = await fetch(`/api/plants/${id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setSyncStatus({
          type: 'single',
          plantId: id,
          status: 'done',
          result: data,
        });
        await loadPlants();
        return data;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        setSyncStatus({
          type: 'single',
          plantId: id,
          status: 'error',
          error: message,
        });
        throw err;
      }
    },
    [loadPlants],
  );

  const syncAll = useCallback(
    async (startDate: string, endDate: string): Promise<SyncAllResult> => {
      setSyncStatus({ type: 'all', status: 'syncing' });
      try {
        const res = await fetch('/api/plants/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setSyncStatus({ type: 'all', status: 'done', result: data });
        await loadPlants();
        return data;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        setSyncStatus({ type: 'all', status: 'error', error: message });
        throw err;
      }
    },
    [loadPlants],
  );

  return {
    plants,
    isLoading,
    error,
    syncStatus,
    loadPlants,
    addPlant,
    updatePlant,
    deletePlant,
    testConnection,
    syncPlant,
    syncAll,
  };
}
