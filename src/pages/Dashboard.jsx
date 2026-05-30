import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Download, TrendingUp, CheckCircle, ChevronLeft, ChevronRight, FileText, Users, Trophy, BarChart2 } from 'lucide-react';
import { API_URL } from '../config';
import { VISIT_TYPE_CONFIG, STATUS_CONFIG } from '../utils/visitTypes';
import { friendlyError } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { DonutChart } from '../components/ui';

const TABLE_LIMIT = 50;

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'agents'
    const [stats, setStats] = useState({
        totalVisits: 0, completedVisits: 0, averageDuration: 0, conversionRate: 0, visitsByType: {}
    });
    const [visitList, setVisitList] = useState([]);
    const [tablePage, setTablePage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [agentStats, setAgentStats] = useState([]);
    const [loadingAgents, setLoadingAgents] = useState(false);

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
    const toast = useToast();
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

    useEffect(() => {
        if (activeTab !== 'agents') return;
        const fetchAgents = async () => {
            setLoadingAgents(true);
            try {
                const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end });
                const res = await fetch(`${API_URL}/api/visits/stats/agents?${params}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) setAgentStats(await res.json());
            } catch (error) {
                console.error(friendlyError(error));
            } finally {
                setLoadingAgents(false);
            }
        };
        fetchAgents();
    }, [token, dateRange, activeTab]);

    const getStatusBadge = (status) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />}
                {cfg.label}
            </span>
        );
    };

    const translateType = (type) => VISIT_TYPE_CONFIG[type]?.label ?? type;

    const EXPORT_LIMIT = 5000;

    const handleExport = async () => {
        try {
            const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end, page: 1, limit: EXPORT_LIMIT });
            if (outcomeFilter) params.append('outcome', outcomeFilter);
            const res = await fetch(`${API_URL}/api/visits?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const allVisits = Array.isArray(data) ? data : (data.visits ?? []);
            if (!allVisits.length) return;
            if (allVisits.length >= EXPORT_LIMIT) {
                toast.info(`Export limitado a ${EXPORT_LIMIT} registros. Ajusta el rango de fechas para ver todo.`);
            }

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

    const handleExportPDF = async () => {
        try {
            const params = new URLSearchParams({ startDate: dateRange.start, endDate: dateRange.end, page: 1, limit: EXPORT_LIMIT });
            if (outcomeFilter) params.append('outcome', outcomeFilter);
            const res = await fetch(`${API_URL}/api/visits?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const allVisits = Array.isArray(data) ? data : (data.visits ?? []);
            if (!allVisits.length) { toast.info('No hay visitas en el período seleccionado.'); return; }
            if (allVisits.length >= EXPORT_LIMIT) {
                toast.info(`Export limitado a ${EXPORT_LIMIT} registros. Ajusta el rango de fechas para ver todo.`);
            }

            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            // ── Cabecera ──────────────────────────────────────────────
            doc.setFillColor(227, 28, 37); // brand-600 #e31c25
            doc.rect(0, 0, 297, 22, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('TuLlave Inmobiliaria — Reporte de Visitas', 14, 10);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const rangeLabel = dateRange.start === dateRange.end
                ? dateRange.start
                : `${dateRange.start} al ${dateRange.end}`;
            doc.text(`Período: ${rangeLabel}   ·   Generado: ${new Date().toLocaleDateString('es-CO')}`, 14, 17);

            // ── Tarjetas de métricas ───────────────────────────────────
            doc.setTextColor(30, 30, 30);
            const cards = [
                { label: 'Total Visitas',    value: String(stats.totalVisits) },
                { label: 'Completadas',      value: String(stats.completedVisits) },
                { label: 'Duración Prom.',   value: `${stats.averageDuration} min` },
                { label: 'Conversión',       value: `${stats.conversionRate}%` },
            ];
            const cardW = 60, cardH = 16, cardY = 26, gap = 4;
            cards.forEach((c, i) => {
                const x = 14 + i * (cardW + gap);
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(c.label.toUpperCase(), x + 3, cardY + 5);
                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 30, 30);
                doc.text(c.value, x + 3, cardY + 13);
            });

            // ── Tabla de visitas ───────────────────────────────────────
            const translateStatus = (s) => STATUS_CONFIG[s]?.label ?? s;
            const rows = allVisits.map(v => [
                v.id,
                v.property?.address || '',
                v.clientName || '',
                v.user?.name || '',
                translateType(v.type),
                translateStatus(v.status),
                new Date(v.scheduledStart).toLocaleDateString('es-CO'),
                new Date(v.scheduledStart).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
                v.actualStart && v.actualEnd
                    ? Math.round((new Date(v.actualEnd) - new Date(v.actualStart)) / 60000)
                    : '',
                v.outcome || '',
            ]);

            autoTable(doc, {
                startY: cardY + cardH + 6,
                head: [['#', 'Inmueble', 'Cliente', 'Agente', 'Tipo', 'Estado', 'Fecha', 'Hora', 'Dur. (min)', 'Resultado']],
                body: rows,
                styles: { fontSize: 7.5, cellPadding: 2.5, overflow: 'linebreak' },
                headStyles: { fillColor: [227, 28, 37], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { cellWidth: 10 },
                    1: { cellWidth: 52 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 28 },
                    4: { cellWidth: 28 },
                    5: { cellWidth: 22 },
                    6: { cellWidth: 20 },
                    7: { cellWidth: 14 },
                    8: { cellWidth: 18 },
                    9: { cellWidth: 40 },
                },
                didDrawPage: (hookData) => {
                    // Pie de página
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(7);
                    doc.setTextColor(150);
                    doc.text(
                        `Página ${hookData.pageNumber} de ${pageCount}`,
                        doc.internal.pageSize.width - 14,
                        doc.internal.pageSize.height - 6,
                        { align: 'right' }
                    );
                }
            });

            doc.save(`reporte_visitas_${dateRange.start}_al_${dateRange.end}.pdf`);
        } catch (error) {
            toast.error('No se pudo generar el PDF. Intenta de nuevo.');
            console.error(error);
        }
    };

    const metricCards = [
        {
            label: 'Total Visitas',
            value: stats.totalVisits,
            icon: <Calendar className="w-6 h-6" />,
            iconBg: 'bg-brand-100 text-brand-600',
            stripe: 'bg-brand-600',
        },
        {
            label: 'Completadas',
            value: stats.completedVisits,
            icon: <CheckCircle className="w-6 h-6" />,
            iconBg: 'bg-emerald-100 text-emerald-700',
            stripe: 'bg-emerald-500',
        },
        {
            label: 'Duración Prom.',
            value: `${stats.averageDuration} min`,
            icon: <Clock className="w-6 h-6" />,
            iconBg: 'bg-slate-100 text-slate-600',
            stripe: 'bg-slate-400',
        },
        {
            label: 'Tasa de Conversión',
            value: `${stats.conversionRate}%`,
            icon: <TrendingUp className="w-6 h-6" />,
            iconBg: 'bg-amber-100 text-amber-700',
            subtitle: 'Clientes interesados',
            stripe: 'bg-amber-500',
        },
    ];

    // U2: Skeleton en lugar de spinner
    if (loading) return (
        <div className="space-y-8 animate-pulse">
            <div className="h-7 bg-gray-200 rounded-lg w-56" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="h-1.5 bg-gray-200 w-full" />
                        <div className="p-4 flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-200 rounded-xl shrink-0" />
                            <div className="space-y-2 flex-1">
                                <div className="h-3 bg-gray-200 rounded w-20" />
                                <div className="h-7 bg-gray-200 rounded w-14" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-100 space-y-5">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="space-y-2">
                            <div className="flex justify-between">
                                <div className="h-3 bg-gray-200 rounded w-24" />
                                <div className="h-3 bg-gray-200 rounded w-8" />
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full w-full" />
                        </div>
                    ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 lg:col-span-2">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <div className="h-4 bg-gray-200 rounded w-36" />
                    </div>
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="px-4 py-3 flex gap-4 border-b border-gray-50 last:border-0">
                            <div className="h-4 bg-gray-200 rounded w-16" />
                            <div className="h-4 bg-gray-200 rounded flex-1" />
                            <div className="h-4 bg-gray-200 rounded w-20" />
                            <div className="h-4 bg-gray-200 rounded w-16" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header + Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Panel Administrativo</h2>
                    <p className="text-gray-500 text-sm">Resumen de operaciones</p>
                    <div className="flex items-center gap-1 mt-3 bg-gray-100 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'general' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <BarChart2 className="w-4 h-4" /> General
                        </button>
                        <button
                            onClick={() => setActiveTab('agents')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'agents' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Users className="w-4 h-4" /> Por Agente
                        </button>
                    </div>
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
                    <div className="flex items-center gap-2 self-end md:self-auto">
                        <button
                            onClick={handleExport}
                            title="Exportar CSV"
                            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 px-3 py-1.5 hover:bg-brand-50 rounded-lg transition font-medium border border-brand-200 hover:border-brand-400"
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden md:inline">CSV</span>
                        </button>
                        <button
                            onClick={handleExportPDF}
                            title="Exportar PDF"
                            className="flex items-center gap-1.5 text-sm text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition font-medium shadow-sm"
                        >
                            <FileText className="w-4 h-4" />
                            <span className="hidden md:inline">PDF</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Vista Por Agente */}
            {activeTab === 'agents' && (
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-base text-gray-800 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-amber-500" /> Rendimiento por Agente
                        </h3>
                        <span className="text-xs text-gray-400">{agentStats.length} agente{agentStats.length !== 1 ? 's' : ''}</span>
                    </div>
                    {loadingAgents ? (
                        <div className="divide-y divide-gray-50 animate-pulse">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="px-6 py-4 flex items-center gap-4">
                                    <div className="w-8 h-8 bg-gray-200 rounded-full shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 bg-gray-200 rounded w-32" />
                                        <div className="h-2 bg-gray-200 rounded w-48" />
                                    </div>
                                    <div className="h-4 bg-gray-200 rounded w-16" />
                                </div>
                            ))}
                        </div>
                    ) : agentStats.length === 0 ? (
                        <div className="px-6 py-12 text-center text-gray-400 text-sm">
                            Sin datos de agentes en el período seleccionado
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-3">#</th>
                                        <th className="px-4 py-3">Agente</th>
                                        <th className="px-4 py-3 text-center">Total</th>
                                        <th className="px-4 py-3 text-center">Completadas</th>
                                        <th className="px-4 py-3 text-center">No atendidas</th>
                                        <th className="px-4 py-3 text-center">Conversión</th>
                                        <th className="px-4 py-3 text-center">Dur. Prom.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {agentStats.map((agent, idx) => {
                                        const completionRate = agent.totalVisits ? Math.round((agent.completedVisits / agent.totalVisits) * 100) : 0;
                                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                                        return (
                                            <tr key={agent.userId} className="hover:bg-gray-50 transition">
                                                <td className="px-6 py-3 text-center">
                                                    {medal
                                                        ? <span className="text-base">{medal}</span>
                                                        : <span className="text-xs text-gray-400 font-semibold">{idx + 1}</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                                                            <span className="text-brand-700 font-bold text-sm">{agent.name.charAt(0).toUpperCase()}</span>
                                                        </div>
                                                        <span className="font-semibold text-gray-800">{agent.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center font-semibold text-gray-700">{agent.totalVisits}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="font-semibold text-emerald-700">{agent.completedVisits}</span>
                                                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${completionRate}%` }} />
                                                        </div>
                                                        <span className="text-xs text-gray-400">{completionRate}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-semibold ${agent.missedVisits > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                                        {agent.missedVisits}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${agent.conversionRate >= 50 ? 'bg-emerald-100 text-emerald-700' : agent.conversionRate >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {agent.conversionRate}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-600">
                                                    {agent.averageDuration > 0 ? `${agent.averageDuration} min` : <span className="text-gray-300">—</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Vista General */}
            {activeTab === 'general' && <>
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((card) => (
                    <div key={card.label} className="bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-shadow border border-gray-100 overflow-hidden">
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
                {/* Visitas por Tipo — gráfica de dona */}
                <div className="bg-white p-6 rounded-2xl shadow-card border border-gray-100">
                    <h3 className="font-bold text-base text-gray-800 mb-5">Visitas por Tipo</h3>
                    {Object.keys(stats.visitsByType).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-12">Sin datos para el período</p>
                    ) : (
                        <DonutChart
                            centerLabel="visitas"
                            data={Object.entries(stats.visitsByType)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => {
                                    const cfg = VISIT_TYPE_CONFIG[type] || VISIT_TYPE_CONFIG.OTHER;
                                    return { label: cfg.label, value: count, color: cfg.barColor };
                                })}
                        />
                    )}
                </div>

                {/* Tabla detallada */}
                <div className="bg-white rounded-2xl shadow-card border border-gray-100 lg:col-span-2 overflow-hidden">
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
            </>}
        </div>
    );
}
