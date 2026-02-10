'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '../../../components/ClientLayout';
import { FaUsers, FaClock, FaSync, FaUser, FaBuilding } from 'react-icons/fa';

export default function ActiveEmployeesPage() {
  const [user, setUser] = useState(null);
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
      loadActiveEmployees();
    } else {
      router.push('/login');
    }
  }, [router]);

  // Auto-refresh every minute
  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        loadActiveEmployees();
      }
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [user]);

  const loadActiveEmployees = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reports/active');

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setActiveEmployees(data.activeEmployees);
        setSummary(data.summary);
        setLastUpdated(new Date().toLocaleTimeString());
      } else {
        throw new Error(data.error || 'Error al cargar empleados activos');
      }
    } catch (err) {
      console.error('Error loading active employees:', err);
      setError(err.message || 'Error al cargar empleados activos');
    } finally {
      setIsLoading(false);
    }
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
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Empleados Activos
            </h1>
            <p className="text-gray-600">
              Empleados que están actualmente en turno de trabajo
            </p>
            {lastUpdated && (
              <p className="text-sm text-gray-500 mt-1">
                Última actualización: {lastUpdated}
              </p>
            )}
          </div>

          <button
            onClick={loadActiveEmployees}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <FaSync className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <FaUsers className="text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaUsers className="text-green-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Empleados Activos</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.activeEmployees}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaUsers className="text-blue-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Total Empleados Hoy</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.totalEmployeesToday}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaClock className="text-purple-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Registros Hoy</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.totalRecordsToday}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Employees */}
        {activeEmployees.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Empleados Actualmente en Turno ({activeEmployees.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
              {activeEmployees.map((employee) => (
                <div
                  key={employee.employeeNumber}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="bg-green-100 rounded-full p-2 mr-3">
                        <FaUser className="text-green-600 text-lg" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {employee.employeeName}
                        </h3>
                        <p className="text-sm text-gray-500">
                          #{employee.employeeNumber}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      Activo
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                      <FaBuilding className="mr-2 text-gray-400" />
                      <span>
                        {employee.employeeRole} • {employee.department}
                      </span>
                    </div>

                    <div className="flex items-center text-sm text-gray-600">
                      <FaClock className="mr-2 text-gray-400" />
                      <span>
                        Horas trabajadas:{' '}
                        <strong>{employee.currentWorkHours}h</strong>
                      </span>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p>
                        Primera entrada:{' '}
                        <strong>
                          {new Date(employee.firstEntry).toLocaleTimeString()}
                        </strong>
                      </p>
                      <p>
                        Última actividad:{' '}
                        <strong>
                          {new Date(employee.lastActivity).toLocaleTimeString()}
                        </strong>
                      </p>
                    </div>

                    <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                      <p>
                        Entradas: {employee.totalEntries} | Salidas:{' '}
                        {employee.totalExits}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <FaUsers className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay empleados activos
              </h3>
              <p className="text-gray-500">
                {isLoading
                  ? 'Cargando empleados activos...'
                  : 'Actualmente no hay empleados en turno de trabajo.'}
              </p>
            </div>
          </div>
        )}

        {/* Auto-refresh notice */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Esta página se actualiza automáticamente cada minuto
          </p>
        </div>
      </div>
    </ClientLayout>
  );
}
