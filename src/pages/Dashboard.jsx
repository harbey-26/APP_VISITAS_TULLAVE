import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BarChart, Users, Calendar, Clock, Download } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalVisits: 0,
        completedVisits: 0,
        averageDuration: 0,
        visitsByType: {}
    });
    const [completeList, setCompleteList] = useState([]);
    const { token } = useAuth();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/visits', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const visits = await res.json();
                    setCompleteList(visits);

                    const completed = visits.filter(v => v.status === 'COMPLETED');
                    const totalDuration = completed.reduce((acc, v) => acc + (v.estimatedDuration || 0), 0);

                    const byType = visits.reduce((acc, v) => {
                        acc[v.type] = (acc[v.type] || 0) + 1;
                        return acc;
                    }, {});

                    setStats({
                        totalVisits: visits.length,
                        completedVisits: completed.length,
                        averageDuration: completed.length ? Math.round(totalDuration / completed.length) : 0,
                        visitsByType: byType
                    });
                }
            } catch (error) {
                console.error(error);
            }
        };
        fetchStats();
    }, [token]);

    const translateType = (type) => {
        switch (type) {
            case 'SHOWING': return 'Visita Comercial';
            case 'APPRAISAL': return 'Avalúo';
            case 'INSPECTION': return 'Inspección';
            default: return type;
        }
    };

    const translateStatus = (status) => {
        switch (status) {
            case 'PENDING': return 'Pendiente';
            case 'IN_PROGRESS': return 'En Curso';
            case 'COMPLETED': return 'Completada';
            case 'MISSED': return 'No Realizada';
            default: return status;
        }
    };

    const getStatusBadge = (status) => {
        const color = status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
            status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
        return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${color}`}>{translateStatus(status)}</span>;
    };

    const handleExport = () => {
        if (!completeList.length) return;

        const headers = ['ID,Inmueble,Cliente,Telefono,Tipo,Estado,Fecha,Hora,Duracion Real (min),Notas'];
        const rows = completeList.map(v => {
            const date = new Date(v.scheduledStart).toLocaleDateString('es-CO');
            const time = new Date(v.scheduledStart).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            const duration = v.actualStart && v.actualEnd
                ? Math.round((new Date(v.actualEnd) - new Date(v.actualStart)) / 60000)
                : 0;

            const safeString = (str) => `"${(str || '').replace(/"/g, '""')}"`;

            return [
                v.id,
                safeString(v.property?.address),
                safeString(v.clientName),
                safeString(v.clientPhone),
                translateType(v.type),
                translateStatus(v.status),
                date,
                time,
                duration,
                safeString(v.notes)
            ].join(',');
        });

        const csvContent = headers.concat(rows).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_visitas_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Panel Administrativo</h2>
                <button
                    onClick={handleExport}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-2 rounded-lg"
                >
                    <Download className="w-5 h-5" />
                    <span>Exportar Reporte</span>
                </button>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* ... same cards as before ... */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                        <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total Visitas</p>
                        <p className="text-2xl font-bold">{stats.totalVisits}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Completadas</p>
                        <p className="text-2xl font-bold">{stats.completedVisits}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Duración Prom.</p>
                        <p className="text-2xl font-bold">{stats.averageDuration}m</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Charts Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-1">
                    <h3 className="font-bold text-lg mb-4">Visitas por Tipo</h3>
                    <div className="space-y-4">
                        {Object.entries(stats.visitsByType).map(([type, count]) => (
                            <div key={type}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">{translateType(type)}</span>
                                    <span className="text-gray-500">{count}</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full"
                                        style={{ width: `${(count / stats.totalVisits) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Detailed Table Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2 overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="font-bold text-lg">Registro Detallado de Visitas</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">Fecha</th>
                                    <th className="px-6 py-3">Inmueble</th>
                                    <th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Estado</th>
                                    <th className="px-6 py-3">Duración</th>
                                </tr>
                            </thead>
                            <tbody>
                                {completeList.map(visit => (
                                    <tr key={visit.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            {new Date(visit.scheduledStart).toLocaleDateString()}
                                            <br />
                                            <span className="text-gray-500 text-xs">{new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {visit.property?.address}
                                        </td>
                                        <td className="px-6 py-4">{translateType(visit.type)}</td>
                                        <td className="px-6 py-4">{getStatusBadge(visit.status)}</td>
                                        <td className="px-6 py-4">
                                            {visit.actualStart && visit.actualEnd ?
                                                `${Math.round((new Date(visit.actualEnd) - new Date(visit.actualStart)) / 60000)} min` :
                                                '-'}
                                        </td>
                                    </tr>
                                ))}
                                {completeList.length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No hay registros aún</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
