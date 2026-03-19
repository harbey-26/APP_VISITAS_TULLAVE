import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Download, TrendingUp, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { VISIT_TYPE_CONFIG, STATUS_CONFIG } from '../utils/visitTypes';
import { friendlyError } from '../utils/api';

const TABLE_LIMIT = 50;

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalVisits: 0, completedVisits: 0, averageDuration: 0, conversionRate: 0, visitsByType: {}
    });
    const [visitList, setVisitList] = useState([]);
    const [tablePage, setTablePage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: firstOfMonth, end: today });

    const setRangeToday = () => { setTablePage(1); setDateRange({ start: today, end: today }); };
    const setRangeWeek = () => {
        const d = new Date(); d.setDate(d.getDate() - 6);
        setTablePage(1); setDateRange({ start: d.toISOString().split('T')[0], end: today });
    };
    const setRangeMonth = () => { setTablePage(1); setDateRange({ start: firstOfMonth, end: today }); };
    const [outcomeFilter, setOutcomeFilter] = useState('');

    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const baseParams = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end });
        if (outcomeFilter) baseParams.append('outcome', outcomeFilter);

        const fetchData = async () => {
            setLoading(true);
            try {
                // M3: Stats calculadas en BD — petición rápida sin descargar todas las visitas
                const statsParams = new URLSearchParams(baseParams);
                const tableParams = new URLSearchParams(baseParams);
                tableParams.append('page', tablePage);
                tableParams.append('limit', TABLE_LIMIT);

                const [statsRes, tableRes] = await Promise.all([
                    fetch(`${API_URL}/api/visits/stats?${statsParams}`, { headers: { Authorization: `Bearer ${token}` } }),
                    fetch(`${API_URL}/api/visits?${tableParams}`, { headers: { Authorization: `Bearer ${token}` } })
                ]);

                if (statsRes.ok) setStats(await statsRes.json());
                if (tableRes.ok) {
                    const data = await tableRes.json();
                    setVisitList(data.visits);
                    setTotalPages(data.totalPages || 1);
                }
            } catch (error) {
                console.error(friendlyError(error));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [token, dateRange, outcomeFilter, tablePage]);

    const getStatusBadge = (status) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                {cfg.label}
            </span>
        );
    };

    const translateType = (type) => VISIT_TYPE_CONFIG[type]?.label ?? type;

    const handleExport = async () => {
        try {
            const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end });
            if (outcomeFilter) params.append('outcome', outcomeFilter);
            const res = await fetch(`${API_URL}/api/visits?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const allVisits = await res.json();
            if (!allVisits.length) return;

        const translateStatus = (s) => STATUS_CONFIG[s]?.label ?? s;
        const headers = ['ID,Inmueble,Cliente,Telefono,Agente,Tipo,Estado,Fecha,Hora,Duracion Real (min),Resultado,Notas'];
        const rows = allVisits.map(v => {
            const date = new Date(v.scheduledStart).toLocaleDateString('es-CO');
            const time = new Date(v.scheduledStart).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
            const duration = v.actualStart && v.actualEnd
                ? Math.round((new Date(v.actualEnd) - new Date(v.actualStart)) / 60000)
                : 0;
            const safe = (str) => `"${(str || '').replace(/"/g, '""')}"`;
            return [
                v.id,
                safe(v.property?.address),
                safe(v.clientName),
                safe(v.clientPhone),
                safe(v.user?.name),
                translateType(v.type),
                translateStatus(v.status),
                date, time, duration,
                safe(v.outcome),
                safe(v.notes)
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
        } catch (error) {
            console.error(friendlyError(error));
        }
    };

    const metricCards = [
        {
            label: 'Total Visitas',
            value: stats.totalVisits,
            icon: <Calendar className="w-6 h-6" />,
            iconBg: 'bg-blue-100 text-blue-600',
            stripe: 'bg-blue-500',
        },
        {
            label: 'Completadas',
            value: stats.completedVisits,
            icon: <CheckCircle className="w-6 h-6" />,
            iconBg: 'bg-green-100 text-green-600',
            stripe: 'bg-green-500',
        },
        {
            label: 'Duración Prom.',
            value: `${stats.averageDuration} min`,
            icon: <Clock className="w-6 h-6" />,
            iconBg: 'bg-purple-100 text-purple-600',
            stripe: 'bg-purple-500',
        },
        {
            label: 'Tasa de Conversión',
            value: `${stats.conversionRate}%`,
            icon: <TrendingUp className="w-6 h-6" />,
            iconBg: 'bg-orange-100 text-orange-600',
            subtitle: 'Clientes interesados',
            stripe: 'bg-orange-500',
        },
    ];

    if (loading) return (
        <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
            <div className="w-7 h-7 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin" />
            <span className="text-sm">Cargando estadísticas...</span>
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header + Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Panel Administrativo</h2>
                    <p className="text-gray-500 text-sm">Resumen de operaciones</p>
                </div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 bg-white p-3 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto">
                    <div className="flex items-center gap-1 border-b md:border-b-0 md:border-r pb-2 md:pb-0 md:pr-2">
                        <button onClick={setRangeToday} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-brand-600 hover:text-white text-gray-600 transition font-medium whitespace-nowrap">Hoy</button>
                        <button onClick={setRangeWeek} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-brand-600 hover:text-white text-gray-600 transition font-medium whitespace-nowrap">7 días</button>
                        <button onClick={setRangeMonth} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-brand-600 hover:text-white text-gray-600 transition font-medium whitespace-nowrap">Este mes</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400 shrink-0">Desde:</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-200 rounded-lg text-sm px-2 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none flex-1 md:flex-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400 shrink-0">Hasta:</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-200 rounded-lg text-sm px-2 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none flex-1 md:flex-none"
                        />
                    </div>
                    <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l pt-2 md:pt-0 md:pl-2">
                        <span className="text-sm text-gray-400 shrink-0">Resultado:</span>
                        <select
                            value={outcomeFilter}
                            onChange={(e) => setOutcomeFilter(e.target.value)}
                            className="border border-gray-200 rounded-lg text-sm px-2 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white flex-1 md:flex-none"
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
                        className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 px-3 py-1.5 hover:bg-brand-50 rounded-lg transition font-medium self-end md:self-auto"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden md:inline">Exportar</span>
                    </button>
                </div>
            </div>

            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((card) => (
                    <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className={`h-1.5 w-full ${card.stripe}`} />
                        <div className="p-4 flex items-center gap-4">
                            <div className={`p-3 rounded-xl shrink-0 ${card.iconBg}`}>
                                {card.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs text-gray-500 truncate">{card.label}</p>
                                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                                {card.subtitle && (
                                    <p className="text-xs text-gray-400 truncate">{card.subtitle}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Visitas por Tipo — barras con colores */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-base text-gray-800 mb-5">Visitas por Tipo</h3>
                    {Object.keys(stats.visitsByType).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">Sin datos para el período</p>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(stats.visitsByType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => {
                                    const cfg = VISIT_TYPE_CONFIG[type] || VISIT_TYPE_CONFIG.OTHER;
                                    const pct = stats.totalVisits ? Math.round((count / stats.totalVisits) * 100) : 0;
                                    return (
                                        <div key={type}>
                                            <div className="flex justify-between items-center text-sm mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
                                                    <span className="font-medium text-gray-700">{cfg.label}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <span className="font-semibold text-gray-800">{count}</span>
                                                    <span className="text-xs text-gray-400">({pct}%)</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className="h-2 rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${pct}%`,
                                                        backgroundColor: cfg.barColor,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>

                {/* Tabla detallada */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-base text-gray-800">Registro Detallado</h3>
                        <span className="text-xs text-gray-400">
                            {stats.totalVisits} visita{stats.totalVisits !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3">Inmueble</th>
                                    <th className="px-4 py-3">Tipo</th>
                                    <th className="px-4 py-3">Agente</th>
                                    <th className="px-4 py-3">Estado</th>
                                    <th className="px-4 py-3">Duración</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {visitList.map(visit => {
                                    const typeCfg = VISIT_TYPE_CONFIG[visit.type] || VISIT_TYPE_CONFIG.OTHER;
                                    return (
                                        <tr
                                            key={visit.id}
                                            onClick={() => navigate(`/visit/${visit.id}`)}
                                            className="hover:bg-gray-50 cursor-pointer transition"
                                        >
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                {new Date(visit.scheduledStart).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                                <br />
                                                <span className="text-xs text-gray-400">
                                                    {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">
                                                {visit.property?.address}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeCfg.bg} ${typeCfg.text}`}>
                                                    {typeCfg.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                {visit.user?.name ?? <span className="text-gray-300 italic">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                {getStatusBadge(visit.status)}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                {visit.actualStart && visit.actualEnd
                                                    ? `${Math.round((new Date(visit.actualEnd) - new Date(visit.actualStart)) / 60000)} min`
                                                    : <span className="text-gray-300">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {visitList.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-12 text-center text-gray-400 text-sm">
                                            No hay registros para el período seleccionado
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* A3: Controles de paginación */}
                    {totalPages > 1 && (
                        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs text-gray-400">Página {tablePage} de {totalPages}</span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setTablePage(p => Math.max(1, p - 1))}
                                    disabled={tablePage === 1}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                                </button>
                                <button
                                    onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                                    disabled={tablePage === totalPages}
                                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                >
                                    <ChevronRight className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
