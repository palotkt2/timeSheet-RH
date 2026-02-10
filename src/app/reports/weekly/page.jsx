'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '../../../components/ClientLayout';
import { useWeeklyReports } from '../../../hooks/useWeeklyReports';
import {
  FaCalendarAlt,
  FaUser,
  FaDownload,
  FaSpinner,
  FaChartBar,
  FaExclamationTriangle,
} from 'react-icons/fa';

export default function WeeklyReportsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const {
    reportData,
    isLoading,
    error,
    dateUtils,
    calculateDayStatus,
    generateReport,
    exportToExcel,
  } = useWeeklyReports();

  const [formData, setFormData] = useState(() => {
    const today = new Date();
    const getMonday = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    };

    const thisWeekMonday = getMonday(today);
    const thisWeekFriday = new Date(
      thisWeekMonday.getTime() + 4 * 24 * 60 * 60 * 1000
    );

    return {
      startDate: thisWeekMonday.toISOString().split('T')[0],
      endDate: thisWeekFriday.toISOString().split('T')[0],
      employeeNumber: '',
      shiftId: '', // Filtro por turno
    };
  });

  const [exportLoading, setExportLoading] = useState(false);
  const [shifts, setShifts] = useState([]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      router.push('/login');
    }
  }, [router]);

  // Cargar turnos disponibles
  useEffect(() => {
    const fetchShifts = async () => {
      try {
        const response = await fetch('/api/storage/shifts');
        const data = await response.json();
        if (data.shifts) {
          setShifts(data.shifts.filter((shift) => shift.active === 1));
        }
      } catch (error) {
        console.error('Error loading shifts:', error);
      }
    };

    fetchShifts();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const setPresetRange = (preset) => {
    if (!dateUtils) return;
    const presets = dateUtils.getDatePresets();
    if (presets[preset]) {
      setFormData((prev) => ({
        ...prev,
        startDate: presets[preset].start,
        endDate: presets[preset].end,
      }));
    }
  };

  const handleGenerateReport = async () => {
    if (!formData.startDate || !formData.endDate) {
      alert('Por favor selecciona las fechas de inicio y fin.');
      return;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      alert('La fecha de inicio debe ser anterior a la fecha de fin.');
      return;
    }

    try {
      await generateReport(formData);
    } catch (err) {
      console.error('Error generating report:', err);
    }
  };

  const handleExportToExcel = async () => {
    if (!reportData?.employees?.length) {
      alert('No hay datos para exportar');
      return;
    }

    setExportLoading(true);
    try {
      await exportToExcel(reportData);
    } catch (error) {
      alert('Error al exportar el reporte');
    } finally {
      setExportLoading(false);
    }
  };

  if (!user || !dateUtils) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

  const presets = dateUtils.getDatePresets();

  return (
    <ClientLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Reporte Semanal de Asistencia
          </h1>
          <p className="text-gray-600">
            Reporte simplificado con información básica de asistencia
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(presets).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setPresetRange(key)}
                  className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaCalendarAlt className="inline mr-2" />
                Fecha de inicio
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => handleInputChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaCalendarAlt className="inline mr-2" />
                Fecha de fin
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => handleInputChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaUser className="inline mr-2" />
                Empleado (Opcional)
              </label>
              <input
                type="text"
                value={formData.employeeNumber}
                onChange={(e) =>
                  handleInputChange('employeeNumber', e.target.value)
                }
                placeholder="Ej: 001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🕐 Turno (Opcional)
              </label>
              <select
                value={formData.shiftId}
                onChange={(e) => handleInputChange('shiftId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Todos los turnos</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handleGenerateReport}
              disabled={isLoading}
              className="w-full md:w-auto px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <FaSpinner className="animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FaChartBar />
                  Generar
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <FaExclamationTriangle className="text-red-500 mr-3" />
              <div>
                <h4 className="font-medium text-red-800">Error</h4>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Período: <strong>{reportData.startDate}</strong> al{' '}
                <strong>{reportData.endDate}</strong> •{' '}
                {reportData.employees.length} empleados
              </div>
              <button
                onClick={handleExportToExcel}
                disabled={exportLoading}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exportLoading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <FaDownload />
                    Exportar a Excel
                  </>
                )}
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-blue-600">
                      <th
                        colSpan={reportData.workdays.length + 8}
                        className="px-4 py-3 text-center text-white text-lg font-bold"
                      >
                        Reporte Semanal de Asistencias y Faltas
                      </th>
                    </tr>
                    <tr className="bg-blue-500">
                      <th
                        colSpan={reportData.workdays.length + 8}
                        className="px-4 py-2 text-center text-white text-sm"
                      >
                        Período: {reportData.startDate} al {reportData.endDate}{' '}
                        — Departamento: Producción
                      </th>
                    </tr>
                    <tr className="bg-blue-700 text-white">
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600">
                        No.
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600">
                        ID Empleado
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold border border-blue-600">
                        Nombre Completo
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600">
                        Puesto
                      </th>
                      {reportData.workdays.map((day) => (
                        <th
                          key={day.date}
                          className="px-3 py-3 text-center text-xs font-semibold border border-blue-600"
                        >
                          {day.dayName}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600 bg-green-700">
                        Total Asistencias
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600 bg-red-700">
                        Total Faltas
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600 bg-yellow-700">
                        Retardos
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600 bg-orange-700">
                        Tiempo Total Retardos
                      </th>
                      <th className="px-3 py-3 text-center text-xs font-semibold border border-blue-600 bg-purple-700">
                        Horas Extras
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold border border-blue-600">
                        Observaciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.employees.map((emp, idx) => {
                      // Usar el conteo de días laborables del empleado según su turno
                      const employeeWorkdaysCount =
                        emp.employeeWorkdaysCount || reportData.workdays.length;
                      const faltas = employeeWorkdaysCount - emp.daysPresent;
                      const retardos = emp.daysLate || emp.daysIncomplete || 0;
                      const totalLateMinutes = emp.totalLateMinutes || 0;
                      const hasIssues = faltas > 0 || retardos > 0;

                      // Formatear tiempo total de retardos
                      const formatLateTime = (minutes) => {
                        if (minutes === 0) return '-';
                        const hours = Math.floor(minutes / 60);
                        const mins = minutes % 60;
                        if (hours > 0) {
                          return `${hours}h ${mins}m`;
                        }
                        return `${mins}m`;
                      };

                      // Calcular estado por día usando la función del hook
                      const getDayStatus = (date) => {
                        const dayData = emp.dailyData[date];
                        // Si no hay datos para ese día, no es laboral para el empleado
                        if (!dayData) return 'N';
                        return calculateDayStatus(
                          dayData,
                          date,
                          reportData.scheduleConfig?.schedule,
                          reportData.scheduleConfig?.holidays
                        );
                      };

                      return (
                        <tr
                          key={emp.employeeNumber}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        >
                          <td className="px-3 py-2 text-center text-sm border border-gray-300">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 text-center text-sm font-mono border border-gray-300">
                            {emp.employeeNumber}
                          </td>
                          <td className="px-3 py-2 text-left text-sm border border-gray-300">
                            {emp.employeeName}
                          </td>
                          <td className="px-3 py-2 text-center text-sm border border-gray-300">
                            {emp.employeeRole}
                          </td>
                          {reportData.workdays.map((day) => {
                            const dayData = emp.dailyData[day.date];
                            let bgColor = '';
                            let textColor = 'text-white';
                            let displayText = '';
                            let title = '';

                            // Si no hay datos para ese día
                            if (!dayData) {
                              bgColor = 'bg-gray-400';
                              displayText = 'N/L';
                              title = 'No laboral para este empleado';
                            }
                            // Si el día está marcado como no laboral para este empleado
                            else if (dayData.isWorkday === false) {
                              // Mostrar 'E' (Extra) si trabajó en su día no laboral
                              if (
                                dayData.status !== 'Ausente' &&
                                dayData.hours > 0
                              ) {
                                bgColor = 'bg-green-500';
                                displayText = 'E';
                                title = `Día extra trabajado (${dayData.hours}h)`;
                              } else {
                                bgColor = 'bg-gray-400';
                                displayText = '-';
                                title = 'Día no laboral';
                              }
                            }
                            // Día laboral normal
                            else {
                              const status = getDayStatus(day.date);
                              displayText = status;

                              if (status === 'A') {
                                bgColor = 'bg-green-500';
                                title = 'Asistencia completa';
                              } else if (status === 'R') {
                                bgColor = 'bg-yellow-500';
                                title = 'Retardo o incompleto';
                              } else if (status === 'F') {
                                bgColor = 'bg-red-500';
                                title = 'Falta';
                              } else if (status === 'H') {
                                bgColor = 'bg-blue-500';
                                title = 'Día festivo';
                              } else if (status === 'N') {
                                bgColor = 'bg-gray-400';
                                title = 'No laboral';
                              }
                            }

                            return (
                              <td
                                key={day.date}
                                title={title}
                                className={`px-3 py-2 text-center font-bold border border-gray-300 ${bgColor} ${textColor}`}
                              >
                                {displayText}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-center font-bold text-sm border border-gray-300 bg-green-100">
                            {emp.daysPresent}
                          </td>
                          <td
                            className={`px-3 py-2 text-center font-bold text-sm border border-gray-300 ${
                              faltas > 0 ? 'bg-red-100' : 'bg-gray-100'
                            }`}
                          >
                            {faltas}
                          </td>
                          <td
                            className={`px-3 py-2 text-center font-bold text-sm border border-gray-300 ${
                              retardos > 0 ? 'bg-yellow-100' : 'bg-gray-100'
                            }`}
                          >
                            {retardos}
                          </td>
                          <td
                            className={`px-3 py-2 text-center font-bold text-sm border border-gray-300 ${
                              totalLateMinutes > 0
                                ? 'bg-orange-100'
                                : 'bg-gray-100'
                            }`}
                          >
                            {formatLateTime(totalLateMinutes)}
                          </td>
                          <td
                            className={`px-3 py-2 text-center font-bold text-sm border border-gray-300 ${
                              (emp.totalOvertimeHours || 0) > 0
                                ? 'bg-purple-100'
                                : 'bg-gray-100'
                            }`}
                          >
                            {(emp.totalOvertimeHours || 0) > 0
                              ? `${emp.totalOvertimeHours}h`
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-left text-xs border border-gray-300">
                            {hasIssues ? (
                              <>
                                {faltas > 0 && (
                                  <span className="text-red-600">
                                    Falta injustificada{' '}
                                    {reportData.workdays.find(
                                      (d, i) =>
                                        getDayStatus(d.date) === 'F' &&
                                        i < reportData.workdays.length
                                    )
                                      ? reportData.workdays.find(
                                          (d) => getDayStatus(d.date) === 'F'
                                        )?.dayName
                                      : ''}
                                  </span>
                                )}
                                {retardos > 0 && faltas > 0 && ' • '}
                                {retardos > 0 && (
                                  <span className="text-yellow-600">
                                    Llegó tarde o salió temprano
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-green-600">
                                Puntual toda la semana
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-200">
                    <tr>
                      <td
                        colSpan="4"
                        className="px-3 py-2 text-right font-bold text-sm border border-gray-400"
                      >
                        TOTALES:
                      </td>
                      {reportData.workdays.map((day) => {
                        const dayTotals = reportData.employees.reduce(
                          (acc, emp) => {
                            const dayData = emp.dailyData[day.date];
                            // Contar si tiene asistencia (incluye días extra)
                            if (!dayData || dayData.status === 'Ausente')
                              return acc;
                            return acc + 1;
                          },
                          0
                        );
                        return (
                          <td
                            key={day.date}
                            className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-blue-100"
                          >
                            {dayTotals}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-green-200">
                        {reportData.employees.reduce(
                          (sum, emp) => sum + emp.daysPresent,
                          0
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-red-200">
                        {reportData.employees.reduce((sum, emp) => {
                          const employeeWorkdaysCount =
                            emp.employeeWorkdaysCount ||
                            reportData.workdays.length;
                          return (
                            sum + (employeeWorkdaysCount - emp.daysPresent)
                          );
                        }, 0)}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-yellow-200">
                        {reportData.employees.reduce(
                          (sum, emp) =>
                            sum + (emp.daysLate || emp.daysIncomplete || 0),
                          0
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-orange-200">
                        {(() => {
                          const totalMinutes = reportData.employees.reduce(
                            (sum, emp) => sum + (emp.totalLateMinutes || 0),
                            0
                          );
                          if (totalMinutes === 0) return '-';
                          const hours = Math.floor(totalMinutes / 60);
                          const mins = totalMinutes % 60;
                          if (hours > 0) {
                            return `${hours}h ${mins}m`;
                          }
                          return `${mins}m`;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center font-bold text-sm border border-gray-400 bg-purple-200">
                        {(() => {
                          const totalOvertimeHours =
                            reportData.employees.reduce(
                              (sum, emp) => sum + (emp.totalOvertimeHours || 0),
                              0
                            );
                          return totalOvertimeHours > 0
                            ? `${Math.round(totalOvertimeHours * 100) / 100}h`
                            : '-';
                        })()}
                      </td>
                      <td className="px-3 py-2 text-left text-xs border border-gray-400 italic text-gray-600">
                        Total de registros
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Leyenda de Estados:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-green-500 text-white font-bold flex items-center justify-center">
                    A
                  </span>
                  <span className="text-gray-700 font-semibold">
                    Asistencia - Cumplió su jornada completa
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-yellow-500 text-white font-bold flex items-center justify-center">
                    R
                  </span>
                  <span className="text-gray-700 font-semibold">
                    Retardo - Llegó tarde, salió temprano o jornada incompleta
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-red-500 text-white font-bold flex items-center justify-center">
                    F
                  </span>
                  <span className="text-gray-700 font-semibold">
                    Falta - No asistió ese día
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-green-500 text-white font-bold flex items-center justify-center">
                    E
                  </span>
                  <span className="text-gray-700 font-semibold">
                    Extra - Trabajó en día no laboral (100% horas extras)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-blue-500 text-white font-bold flex items-center justify-center">
                    H
                  </span>
                  <span className="text-gray-700 font-semibold">
                    Día Festivo - No laboral
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-gray-400 text-white font-bold flex items-center justify-center">
                    N
                  </span>
                  <span className="text-gray-700 font-semibold">
                    No Laboral - Según horario
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
