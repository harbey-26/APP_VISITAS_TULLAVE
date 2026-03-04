import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Download, TrendingUp, CheckCircle2 } from 'lucide-react';
import { API_URL } from '../config';

const TYPE_CONFIG = {
    RENTAL_SHOWING:  { label: 'Mostrar en arriendo', color: 'bg-blue-500'   },
    PROPERTY_INTAKE: { label: 'Captación',           color: 'bg-green-500'  },
    HANDOVER:        { label: 'Entrega',              color: 'bg-purple-500' },
    MOVE_OUT:        { label: 'Desocupación',         color: 'bg-orange-500' },
    INSPECTION:      { label: 'Inspección',           color: 'bg-amber-500'  },
    OTHER:           { label: 'Otro',                 color: 'bg-gray-400'   },
};

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalVisits: 0,
        completedVisits: 0,
        averageDuration: 0,
        successRate: 0,
        visitsByType: {}
    });
    const [completeList, setCompleteList] = useState([]);

    const today = new Date().toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: today, end: today });
    const [outcomeFilter, setOutcomeFilter] = useState('');

    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end });
                if (outcomeFilter) params.append('outcome', outcomeFilter);

                const res = await fetch(`${API_URL}/api/visits?${params.toString()}`, {
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

                    const successRate = visits.length
                        ? Math.round((completed.length / visits.length) * 100)
                        : 0;

                    setStats({
                        totalVisits: visits.length,
                        completedVisits: completed.length,
                        averageDuration: completed.length ? Math.round(totalDuration / completed.length) : 0,
                        successRate,
                        visitsByType: byType
                    });
                }
            } catch (error) {
                console.error(error);
            }
        };
        fetchStats();
    }, [token, dateRange, outcomeFilter]);

    const translateType = (type) => TYPE_CONFIG[type]?.label || type;

    const translateStatus = (status) => {
        switch (status) {
            case 'PENDING':     return 'Pendiente';
            case 'IN_PROGRESS': return 'En Curso';
            case 'COMPLETED':   return 'Completada';
            case 'MISSED':      return 'No Realizada';
            default:            return status;
        }
    };

    const getStatusBadge = (status) => {
        const color =
            status === 'COMPLETED'  ? 'bg-green-100 text-green-800'  :
            status === 'IN_PROGRESS'? 'bg-blue-100 text-blue-800'    :
            status === 'PENDING'    ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800';
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
                {translateStatus(status)}
            </span>
        );
    };

    const handleExport = () => {
        if (!completeList.length) return;

        const headers = ['ID,Inmueble,Cliente,Telefono,Tipo,Estado,Fecha,Hora,Duracion Real (min),Resultado,Notas'];
        const rows = completeList.map(v => {
            const date = new Date(v.scheduledStart).toLocaleDateString('es-CO');
            const time = new Date(v.scheduledStart).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            const duration = v.actualStart && v.actualEnd
                ? Math.round((new Date(v.actualEnd) - new Date(v.actualStart)) / 60000)
                : 0;
            const safeString = (str) => `"${(str || '').replace(/"/g, '""')}"`;
            return [
                v.id, safeString(v.property?.address), safeString(v.clientName), safeString(v.clientPhone),
                translateType(v.type), translateStatus(v.status), date, time, duration,
                safeString(v.outcome), safeString(v.notes)
            ].join(',');
        });

        const csvContent = headers.concat(rows).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_visitas_${dateRange.start}_al_${dateRange.end}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const metricCards = [
        {
            label: 'Total Visitas',
            value: stats.totalVisits,
            icon: Calendar,
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
        },
        {
            label: 'Completadas',
            value: stats.completedVisits,
            icon: CheckCircle2,
            iconBg: 'bg-green-100',
            iconColor: 'text-green-600',
        },
        {
            label: 'Duración Prom.',
            value: `${stats.averageDuration} min`,
            icon: Clock,
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-600',
        },
        {
            label: 'Tasa de Éxito',
            value: `${stats.successRate}%`,
            icon: TrendingUp,
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-600',
        },
    ];

    return (
        <div className="space-y-8">

            {/* Header + Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Panel Administrativo</h2>
                    <p className="text-gray-500 text-sm">Resumen de operaciones</p>
                </div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 bg-white p-3 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 w-14 md:w-auto shrink-0">Desde:</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-300 rounded-lg text-sm p-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none flex-1"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 w-14 md:w-auto shrink-0">Hasta:</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-300 rounded-lg text-sm p-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none flex-1"
                        />
                    </div>
                    <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-3">
                        <span className="text-sm text-gray-500 w-14 md:w-auto shrink-0">Resultado:</span>
                        <select
                            value={outcomeFilter}
                            onChange={(e) => setOutcomeFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg text-sm p-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white flex-1"
                        >
                            <option value="">Todos</option>
                            <option value="Cliente interesado">Cliente interesado</option>
                            <option value="Cliente no interesado">Cliente no interesado</option>
                            <option value="Requiere seguimiento">Requiere seguimiento</option>
                            <option value="Cliente no asistió">Cliente no asistió</option>
                            <option value="Cancelada">Cancelada</option>
                        </select>
                    </div>
                    <button
                        onClick={handleExport}
                        title="Exportar CSV"
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 hover:bg-blue-50 rounded-lg transition self-end md:self-center border border-transparent hover:border-blue-100"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Exportar</span>
                    </button>
                </div>
            </div>

            {/* Metric Cards — 4 columns */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
                    <div key={label} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className={`p-3 ${iconBg} ${iconColor} rounded-xl shrink-0`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-gray-500 truncate">{label}</p>
                            <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart: Visits by type */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-base mb-5 text-gray-800">Visitas por Tipo</h3>
                    {Object.keys(stats.visitsByType).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Sin datos en este período</p>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(stats.visitsByType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => {
                                    const conf = TYPE_CONFIG[type] || TYPE_CONFIG.OTHER;
                                    return (
                                        <div key={type}>
                                            <div className="flex justify-between text-sm mb-1.5">
                                                <span className="font-medium text-gray-700">{conf.label}</span>
                                                <span className="text-gray-500 font-semibold">{count}</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                                                <div
                                                    className={`${conf.color} h-2.5 rounded-full transition-all duration-500`}
                                                    style={{ width: `${(count / stats.totalVisits) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Detailed Visit Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h3 className="font-bold text-base text-gray-800">Registro Detallado</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Fecha</th>
                                    <th className="px-4 py-3 font-semibold">Inmueble</th>
                                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Agente</th>
                                    <th className="px-4 py-3 font-semibold hidden lg:table-cell">Tipo</th>
                                    <th className="px-4 py-3 font-semibold">Estado</th>
                                    <th className="px-4 py-3 font-semibold hidden md:table-cell">Duración</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {completeList.map(visit => (
                                    <tr
                                        key={visit.id}
                                        onClick={() => navigate(`/visit/${visit.id}`)}
                                        className="hover:bg-gray-50 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <p className="font-medium text-gray-800">
                                                {new Date(visit.scheduledStart).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 max-w-[180px]">
                                            <p className="font-medium text-gray-900 truncate">{visit.property?.address || '—'}</p>
                                            {visit.clientName && (
                                                <p className="text-xs text-gray-400 truncate">{visit.clientName}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                                            {visit.user?.name || '—'}
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            {TYPE_CONFIG[visit.type] ? (
                                                <span className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${TYPE_CONFIG[visit.type].color}`} />
                                                    <span className="text-gray-600">{TYPE_CONFIG[visit.type].label}</span>
                                                </span>
                                            ) : visit.type}
                                        </td>
                                        <td className="px-4 py-3">{getStatusBadge(visit.status)}</td>
                                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                                            {visit.actualStart && visit.actualEnd
                                                ? `${Math.round((new Date(visit.actualEnd) - new Date(visit.actualStart)) / 60000)} min`
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                                {completeList.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-400 text-sm">
                                            No hay registros en este período
                                        </td>
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
