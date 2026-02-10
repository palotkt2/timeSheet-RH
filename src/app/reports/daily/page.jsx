'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '../../../components/ClientLayout';
import {
  FaCalendarAlt,
  FaUser,
  FaDownload,
  FaClock,
  FaUsers,
  FaExclamationTriangle,
} from 'react-icons/fa';

export default function DailyReportsPage() {
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      router.push('/login');
    }
  }, [router]);

  const generateReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let url = `/api/reports/daily?date=${selectedDate}`;
      if (employeeNumber.trim()) {
        url += `&employeeNumber=${employeeNumber.trim()}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setReportData(data);
      } else {
        throw new Error(data.error || 'Error al generar el reporte');
      }
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.message || 'Error al generar el reporte');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!reportData || !reportData.employees) {
      alert('No hay datos para exportar');
      return;
    }

    const headers = [
      'Número Empleado',
      'Nombre',
      'Rol',
      'Departamento',
      'Primera Entrada',
      'Última Salida',
      'Total Entradas',
      'Total Salidas',
      'Sesiones Válidas',
      'Horas Trabajadas',
      'Estado',
      'Entradas Sin Salida',
      'Salidas Sin Entrada',
    ];

    const csvRows = [headers.join(',')];

    reportData.employees.forEach((emp) => {
      const row = [
        emp.employeeNumber,
        `"${emp.employeeName}"`,
        emp.employeeRole,
        emp.department,
        emp.firstEntry
          ? new Date(emp.firstEntry).toLocaleString('es-MX')
          : 'N/A',
        emp.lastExit ? new Date(emp.lastExit).toLocaleString('es-MX') : 'N/A',
        emp.totalEntries,
        emp.totalExits,
        emp.validSessions || 0,
        emp.totalWorkedHours,
        emp.status,
        emp.unpairedEntries || 0,
        emp.unpairedExits || 0,
      ];
      csvRows.push(row.join(','));
    });

    // Add detailed sessions
    csvRows.push('');
    csvRows.push('DETALLE DE SESIONES DE TRABAJO');
    csvRows.push('Empleado,Nombre,Sesión,Entrada,Salida,Duración (hrs)');

    reportData.employees.forEach((emp) => {
      if (emp.workSessions && emp.workSessions.length > 0) {
        emp.workSessions.forEach((session, index) => {
          csvRows.push(
            [
              emp.employeeNumber,
              `"${emp.employeeName}"`,
              index + 1,
              new Date(session.entry).toLocaleString('es-MX'),
              new Date(session.exit).toLocaleString('es-MX'),
              session.hoursWorked,
            ].join(',')
          );
        });
      }
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `reporte-diario-mejorado-${reportData.date}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <ClientLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Reportes Diarios
          </h1>
          <p className="text-gray-600">
            Genera reportes detallados de asistencia por fecha
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaCalendarAlt className="inline mr-2" />
                Fecha
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FaUser className="inline mr-2" />
                Número de Empleado (Opcional)
              </label>
              <input
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="Ej: 001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={generateReport}
                disabled={isLoading}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {isLoading ? 'Generando...' : 'Generar Reporte'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <FaExclamationTriangle className="text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Report Results */}
        {reportData && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <FaUsers className="text-blue-500 text-2xl mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Total Empleados</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData.summary.totalEmployees}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <FaUsers className="text-green-500 text-2xl mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Presentes</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData.summary.employeesPresent}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <FaClock className="text-orange-500 text-2xl mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Activos</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData.summary.employeesActive}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center">
                  <FaClock className="text-purple-500 text-2xl mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Total Horas</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {reportData.summary.totalHoursWorked}h
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Export Button */}
            <div className="flex justify-end">
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                <FaDownload />
                Exportar CSV
              </button>
            </div>

            {/* Detailed Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Detalle de Asistencia - {reportData.date}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Empleado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Primera Entrada
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Última Salida
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Sesiones
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Horas Trabajadas
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Registros
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.employees.map((emp) => (
                      <tr key={emp.employeeNumber} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {emp.employeeName}
                            </div>
                            <div className="text-sm text-gray-500">
                              #{emp.employeeNumber} • {emp.employeeRole}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {emp.firstEntry
                            ? new Date(emp.firstEntry).toLocaleTimeString(
                                'es-MX',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {emp.lastExit
                            ? new Date(emp.lastExit).toLocaleTimeString(
                                'es-MX',
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <span className="font-medium text-green-600">
                              {emp.validSessions || 0} válidas
                            </span>
                            {(emp.unpairedEntries > 0 ||
                              emp.unpairedExits > 0) && (
                              <div className="text-xs text-orange-600">
                                {emp.unpairedEntries > 0 &&
                                  `${emp.unpairedEntries} sin salida`}
                                {emp.unpairedEntries > 0 &&
                                  emp.unpairedExits > 0 &&
                                  ', '}
                                {emp.unpairedExits > 0 &&
                                  `${emp.unpairedExits} salidas extra`}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <span className="font-medium text-lg">
                              {emp.totalWorkedHours}h
                            </span>
                            {emp.workSessions &&
                              emp.workSessions.length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {emp.workSessions.map((session, index) => (
                                    <div key={index}>
                                      {new Date(
                                        session.entry
                                      ).toLocaleTimeString('es-MX', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}{' '}
                                      -{' '}
                                      {new Date(
                                        session.exit
                                      ).toLocaleTimeString('es-MX', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}{' '}
                                      ({session.hoursWorked}h)
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              emp.status === 'En turno'
                                ? 'bg-orange-100 text-orange-800'
                                : emp.status === 'Completado'
                                ? 'bg-green-100 text-green-800'
                                : emp.status === 'Registros incompletos'
                                ? 'bg-red-100 text-red-800'
                                : emp.status === 'Salidas extras'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <div>{emp.totalEntries} entradas</div>
                            <div>{emp.totalExits} salidas</div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
