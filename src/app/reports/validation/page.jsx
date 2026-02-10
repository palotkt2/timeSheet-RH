'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '../../../components/ClientLayout';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaSearch,
  FaCalendarAlt,
  FaUser,
  FaClock,
  FaDownload,
} from 'react-icons/fa';

export default function ValidationPage() {
  const [user, setUser] = useState(null);
  const [validationResults, setValidationResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [filterType, setFilterType] = useState('all'); // all, valid, invalid
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
      loadValidationData();
    } else {
      router.push('/login');
    }
  }, [router, selectedDate]);

  const loadValidationData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/validation/hours?date=${selectedDate}`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setValidationResults(data.validationResults || []);
        setSummary(data.summary);
      } else {
        throw new Error(data.error || 'Error al cargar validación');
      }
    } catch (err) {
      console.error('Error loading validation data:', err);
      setError(err.message || 'Error al cargar validación');
    } finally {
      setIsLoading(false);
    }
  };

  const exportValidationResults = () => {
    const filteredResults = getFilteredResults();

    if (filteredResults.length === 0) {
      alert('No hay datos para exportar');
      return;
    }

    // Create CSV content
    const csvContent = [
      [
        'Empleado',
        'Número',
        'Departamento',
        'Fecha',
        'Estado',
        'Horas Trabajadas',
        'Entradas',
        'Salidas',
        'Problemas',
      ].join(','),
      ...filteredResults.map((result) =>
        [
          result.employeeName,
          result.employeeNumber,
          result.department,
          new Date(result.date).toLocaleDateString(),
          result.isValid ? 'Válido' : 'Inválido',
          result.totalHours,
          result.totalEntries,
          result.totalExits,
          result.issues.join(' | '),
        ]
          .map((field) => `"${field}"`)
          .join(',')
      ),
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `validacion_horas_${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFilteredResults = () => {
    let filtered = validationResults || [];

    // Filter by type
    if (filterType === 'valid') {
      filtered = filtered.filter((result) => result.isValid);
    } else if (filterType === 'invalid') {
      filtered = filtered.filter((result) => !result.isValid);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (result) =>
          (result.employeeName || '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          (result.employeeNumber || '').toString().includes(searchTerm)
      );
    }

    return filtered;
  };

  const getStatusColor = (isValid) => {
    return isValid ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100';
  };

  const getStatusIcon = (isValid) => {
    return isValid ? (
      <FaCheckCircle className="text-green-500" />
    ) : (
      <FaExclamationTriangle className="text-red-500" />
    );
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const filteredResults = getFilteredResults();

  return (
    <ClientLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Validación de Horas
          </h1>
          <p className="text-gray-600">
            Revisa y valida las horas trabajadas por los empleados
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha
              </label>
              <div className="relative">
                <FaCalendarAlt className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-10 w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filtro
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="valid">Válidos</option>
                <option value="invalid">Inválidos</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar
              </label>
              <div className="relative">
                <FaSearch className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nombre o número..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={exportValidationResults}
                disabled={filteredResults.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaDownload />
                Exportar CSV
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

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaUser className="text-blue-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Total Empleados</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.totalEmployees}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaCheckCircle className="text-green-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Válidos</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.validEmployees}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaExclamationTriangle className="text-red-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Inválidos</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.invalidEmployees}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <FaClock className="text-purple-500 text-2xl mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Total Registros</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {summary.totalRecords}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Table */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Cargando validación...</p>
            </div>
          </div>
        ) : filteredResults.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Resultados de Validación ({filteredResults.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Empleado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Horas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entradas/Salidas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Problemas
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredResults.map((result, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {result.employeeName}
                            </div>
                            <div className="text-sm text-gray-500">
                              #{result.employeeNumber} • {result.department}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(result.isValid)}
                          <span
                            className={`ml-2 inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                              result.isValid
                            )}`}
                          >
                            {result.isValid ? 'Válido' : 'Inválido'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {result.totalHours} horas
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {result.totalEntries} / {result.totalExits}
                      </td>
                      <td className="px-6 py-4">
                        {result.issues.length > 0 ? (
                          <div className="text-sm text-red-600">
                            <ul className="list-disc list-inside">
                              {result.issues.map((issue, idx) => (
                                <li key={idx}>{issue}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <span className="text-sm text-green-600">
                            Sin problemas
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
            <div className="text-center">
              <FaCheckCircle className="mx-auto h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron resultados
              </h3>
              <p className="text-gray-500">
                No hay datos para la fecha seleccionada o los filtros aplicados.
              </p>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
