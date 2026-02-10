import { useState, useCallback, useMemo } from 'react';
import { formatLocalTimeShort } from '@/utils/dateUtils';
import { exportWeeklyReportToExcel } from '@/utils/excelExport';
import type {
  WeeklyReportResponse,
  ReportFormData,
  DailyData,
  DayStatusCode,
  DatePresets,
  ScheduleConfig,
} from '@/types';

/**
 * Hook for multi-plant weekly reports.
 */
export function useMultiPlantReports() {
  const [reportData, setReportData] = useState<WeeklyReportResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHoliday = useCallback(
    (date: string, holidays: Array<{ date: string }>): boolean => {
      if (!holidays || holidays.length === 0) return false;
      const dateStr = new Date(date + 'T00:00:00').toISOString().split('T')[0];
      return holidays.some((h) => h.date === dateStr);
    },
    [],
  );

  const isWorkday = useCallback(
    (date: string, schedule: ScheduleConfig['schedule']): boolean => {
      if (!schedule || !schedule.days) return true;
      const dayOfWeek = new Date(date + 'T00:00:00').getDay();
      const workDays: number[] = JSON.parse(schedule.days as string);
      return workDays.includes(dayOfWeek);
    },
    [],
  );

  const calculateDayStatus = useCallback(
    (
      dayData: DailyData | undefined,
      date: string,
      schedule: ScheduleConfig['schedule'],
      holidays: Array<{ date: string }>,
    ): DayStatusCode => {
      if (isHoliday(date, holidays)) return 'H';
      if (!isWorkday(date, schedule)) return 'N';
      if (!dayData || dayData.status === 'Ausente') return 'F';

      if (dayData.lateMinutes !== undefined) {
        if (dayData.lateMinutes > 0) return 'R';
        if (dayData.status === 'Sin salida' || dayData.status === 'Incompleto')
          return 'R';
        return 'A';
      }

      if (schedule) {
        const minHours = (schedule.min_hours as number) || 8;
        const toleranceMinutes = (schedule.tolerance_minutes as number) || 15;
        if (dayData.firstEntry && schedule.entry_time) {
          const entryTime = new Date(`2000-01-01T${dayData.firstEntry}`);
          const scheduledEntry = new Date(`2000-01-01T${schedule.entry_time}`);
          const toleranceMs = toleranceMinutes * 60 * 1000;
          if (entryTime.getTime() - scheduledEntry.getTime() > toleranceMs)
            return 'R';
        }
        if (dayData.hours < minHours) return 'R';
        if (dayData.status === 'Sin salida' || dayData.status === 'Incompleto')
          return 'R';
        return 'A';
      }

      if (
        dayData.status === 'Sin salida' ||
        dayData.status === 'Incompleto' ||
        dayData.hours < 6
      )
        return 'R';
      return 'A';
    },
    [isHoliday, isWorkday],
  );

  const dateUtils = useMemo(
    () => ({
      getMonday: (date: Date): Date => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
      },
      addDays: (date: Date, days: number): Date => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
      },
      formatDate: (date: Date): string => date.toISOString().split('T')[0],
      formatTime: (timestamp: string | null): string => {
        if (!timestamp) return '-';
        return formatLocalTimeShort(timestamp);
      },
      getDatePresets: function (): DatePresets {
        const today = new Date();
        const thisWeekMonday = this.getMonday(today);
        const lastWeekMonday = this.addDays(thisWeekMonday, -7);
        const thisMonthStart = new Date(
          today.getFullYear(),
          today.getMonth(),
          1,
        );
        const thisMonthEnd = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0,
        );
        return {
          thisWeek: {
            start: this.formatDate(thisWeekMonday),
            end: this.formatDate(this.addDays(thisWeekMonday, 4)),
            label: 'Esta semana',
          },
          lastWeek: {
            start: this.formatDate(lastWeekMonday),
            end: this.formatDate(this.addDays(lastWeekMonday, 4)),
            label: 'Semana pasada',
          },
          thisMonth: {
            start: this.formatDate(thisMonthStart),
            end: this.formatDate(thisMonthEnd),
            label: 'Este mes',
          },
        };
      },
    }),
    [],
  );

  const validateForm = useCallback((formData: ReportFormData): boolean => {
    const { startDate, endDate } = formData;
    if (!startDate || !endDate)
      throw new Error('Las fechas de inicio y fin son requeridas');
    if (new Date(startDate) > new Date(endDate))
      throw new Error('Fecha inicio debe ser anterior a fecha fin');
    const daysDiff = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysDiff > 90)
      throw new Error('El rango de fechas no puede ser mayor a 90 días');
    return true;
  }, []);

  const generateReport = useCallback(
    async (formData: ReportFormData): Promise<WeeklyReportResponse> => {
      setIsLoading(true);
      setError(null);
      setReportData(null);

      try {
        validateForm(formData);
        const { startDate, endDate, employeeNumber, shiftId } = formData;

        let url = `/api/multi-plant/reports/weekly?startDate=${startDate}&endDate=${endDate}`;
        if (employeeNumber?.trim())
          url += `&employeeNumber=${employeeNumber.trim()}`;
        if (shiftId?.trim()) url += `&shiftId=${shiftId.trim()}`;

        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || `Error HTTP ${response.status}`);
        if (!data.success)
          throw new Error(data.error || 'Error al generar el reporte');

        setReportData(data);
        return data;
      } catch (err: unknown) {
        console.error('Error generando reporte multi-planta:', err);
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [validateForm],
  );

  const exportToExcel = useCallback(
    async (data: WeeklyReportResponse | null): Promise<boolean> => {
      if (!data?.employees?.length)
        throw new Error('No hay datos para exportar');

      try {
        return await exportWeeklyReportToExcel({
          data,
          calculateDayStatus,
        });
      } catch (error) {
        console.error('Error al exportar:', error);
        throw error;
      }
    },
    [calculateDayStatus],
  );

  const clearData = useCallback(() => {
    setReportData(null);
    setError(null);
  }, []);

  return {
    reportData,
    isLoading,
    error,
    dateUtils,
    calculateDayStatus,
    generateReport,
    exportToExcel,
    clearData,
    validateForm,
  };
}
