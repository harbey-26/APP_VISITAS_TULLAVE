import { useEffect, useRef, useState } from 'react';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { Radio, MapPin, Clock, AlertCircle, CheckCircle2, XCircle, Megaphone, Send, X, History } from 'lucide-react';

const BOGOTA = { lat: 4.6097, lng: -74.0817 };
const REFRESH_INTERVAL = 60000;

function getMinutesSince(dateStr) {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function formatDuration(dateStr) {
    if (!dateStr) return null;
    const totalMinutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (totalMinutes < 1) return 'Menos de 1 min';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}min`;
}

function isActive(lastSeenAt) {
    if (!lastSeenAt) return false;
    return getMinutesSince(lastSeenAt) <= 2;
}

// Verifica si estamos en horario laboral (8am–5pm)
function isBusinessHours() {
    const h = new Date().getHours();
    return h >= 8 && h <= 17;
}

// Agente no respondió a la última notificación horaria (>70 min sin actualizar en horario laboral)
function missedCheckIn(lastSeenAt) {
    if (!isBusinessHours()) return false;
    if (!lastSeenAt) return true;
    return getMinutesSince(lastSeenAt) > 70;
}

function StatusBadge({ agent }) {
    const active = isActive(agent.lastSeenAt);
    const mins = getMinutesSince(agent.lastSeenAt);
    const missed = missedCheckIn(agent.lastSeenAt);

    if (mins === null) {
        return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                Sin ubicación
            </span>
        );
    }
    if (active) {
        return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
                Activo
            </span>
        );
    }
    if (missed) {
        return (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                Sin respuesta
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            Desconectado
        </span>
    );
}

const BUSINESS_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function formatHour(h) {
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export default function Tracking() {
    const { token } = useAuth();
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });
    const mapRef = useRef(null);
    const [agents, setAgents] = useState([]);
    const [checkIns, setCheckIns] = useState({});
    const [broadcasts, setBroadcasts] = useState([]);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [showBroadcastModal, setShowBroadcastModal] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [bTitle, setBTitle] = useState('');
    const [bBody, setBBody] = useState('');
    const [sending, setSending] = useState(false);
    const [sentOk, setSentOk] = useState(false);

    const loadAgents = async () => {
        try {
            const [agentsRes, checkInsRes, broadcastsRes] = await Promise.all([
                fetch(`${API_URL}/api/users/locations`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/api/users/checkins/today`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/api/broadcasts`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (agentsRes.ok) { setAgents(await agentsRes.json()); setLastUpdate(new Date()); setError(null); }
            if (checkInsRes.ok) setCheckIns(await checkInsRes.json());
            if (broadcastsRes.ok) setBroadcasts(await broadcastsRes.json());
        } catch {
            setError('No se pudo obtener la ubicación de los agentes.');
        }
    };

    const handleSendBroadcast = async () => {
        if (!bTitle.trim() || !bBody.trim()) return;
        setSending(true);
        try {
            const res = await fetch(`${API_URL}/api/broadcasts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: bTitle.trim(), body: bBody.trim() }),
            });
            if (res.ok) {
                setSentOk(true);
                setBTitle('');
                setBBody('');
                setTimeout(() => { setSentOk(false); setShowBroadcastModal(false); }, 1500);
                loadAgents();
            }
        } finally {
            setSending(false);
        }
    };

    useEffect(() => {
        loadAgents();
        const interval = setInterval(loadAgents, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [token]);

    const agentsWithLocation = agents.filter(a => a.lastLat && a.lastLng);

    // U4: Recrear markers con clustering cuando cambian los agentes o el mapa
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !window.google || agentsWithLocation.length === 0) return;

        const markers = agentsWithLocation.map(agent => {
            const active = isActive(agent.lastSeenAt);
            const subtitle = active && agent.connectedSince
                ? `Activo — conectado hace ${formatDuration(agent.connectedSince)}`
                : agent.lastSeenAt
                    ? `Última vez: ${new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '';

            const marker = new window.google.maps.Marker({
                position: { lat: agent.lastLat, lng: agent.lastLng },
                title: `${agent.name}${subtitle ? ' — ' + subtitle : ''}`,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: active ? '#22c55e' : '#ef4444',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                },
            });
            marker.addListener('click', () => setSelectedAgent(agent));
            return marker;
        });

        const clusterer = new MarkerClusterer({ map, markers });

        return () => {
            markers.forEach(m => m.setMap(null));
            clusterer.clearMarkers();
        };
    }, [mapRef.current, agentsWithLocation]);
    const agentsWithoutLocation = agents.filter(a => !a.lastLat || !a.lastLng);

    // Métricas de check-in (solo relevantes en horario laboral)
    const inBusinessHours = isBusinessHours();
    const respondieron = agents.filter(a => !missedCheckIn(a.lastSeenAt) && a.lastSeenAt);
    const sinRespuesta = agents.filter(a => missedCheckIn(a.lastSeenAt));

    const mapCenter = selectedAgent && selectedAgent.lastLat
        ? { lat: selectedAgent.lastLat, lng: selectedAgent.lastLng }
        : agentsWithLocation.length > 0
            ? { lat: agentsWithLocation[0].lastLat, lng: agentsWithLocation[0].lastLng }
            : BOGOTA;

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center">
                        <Radio className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Rastreo de Agentes</h1>
                        <p className="text-xs text-gray-400">
                            {lastUpdate
                                ? `Última actualización: ${lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                : 'Cargando...'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { setShowHistory(true); setShowBroadcastModal(false); }}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition"
                    >
                        <History className="w-3.5 h-3.5" /> Historial
                    </button>
                    <button
                        onClick={() => { setShowBroadcastModal(true); setShowHistory(false); }}
                        className="flex items-center gap-1.5 text-xs text-white font-medium bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition"
                    >
                        <Megaphone className="w-3.5 h-3.5" /> Enviar comunicado
                    </button>
                    <button
                        onClick={loadAgents}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium border border-brand-200 hover:border-brand-400 px-3 py-1.5 rounded-lg transition"
                    >
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Modal: Enviar comunicado */}
            {showBroadcastModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                                    <Megaphone className="w-4 h-4 text-white" />
                                </div>
                                <h2 className="text-base font-bold text-gray-900">Enviar comunicado</h2>
                            </div>
                            <button onClick={() => setShowBroadcastModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">
                            El mensaje llegará como notificación a <strong>todos los agentes</strong> en los próximos 60 segundos.
                        </p>
                        {sentOk ? (
                            <div className="flex flex-col items-center gap-2 py-6">
                                <CheckCircle2 className="w-10 h-10 text-green-500" />
                                <p className="text-sm font-semibold text-green-700">¡Comunicado enviado!</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3 mb-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Título</label>
                                        <input
                                            type="text"
                                            maxLength={100}
                                            placeholder="Ej: Reunión urgente a las 3pm"
                                            value={bTitle}
                                            onChange={e => setBTitle(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Mensaje</label>
                                        <textarea
                                            rows={3}
                                            maxLength={500}
                                            placeholder="Ej: Por favor confirmen asistencia respondiendo este mensaje..."
                                            value={bBody}
                                            onChange={e => setBBody(e.target.value)}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                                        />
                                        <p className="text-right text-xs text-gray-400 mt-0.5">{bBody.length}/500</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setShowBroadcastModal(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg border border-gray-200 transition">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSendBroadcast}
                                        disabled={sending || !bTitle.trim() || !bBody.trim()}
                                        className="flex items-center gap-2 text-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 px-4 py-2 rounded-lg transition font-medium"
                                    >
                                        <Send className="w-4 h-4" />
                                        {sending ? 'Enviando...' : `Enviar a ${agents.length} agente${agents.length !== 1 ? 's' : ''}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Modal: Historial de comunicados */}
            {showHistory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                    <History className="w-4 h-4 text-gray-600" />
                                </div>
                                <h2 className="text-base font-bold text-gray-900">Historial de comunicados</h2>
                            </div>
                            <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-3">
                            {broadcasts.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">No hay comunicados enviados.</p>
                            ) : broadcasts.map(b => (
                                <div key={b.id} className="border border-gray-100 rounded-xl p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-gray-900">{b.title}</p>
                                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                            {new Date(b.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{b.body}</p>
                                    <p className="text-xs text-green-600 mt-1.5 font-medium">
                                        <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                                        {b._count?.reads ?? 0} agente{(b._count?.reads ?? 0) !== 1 ? 's' : ''} lo vieron
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Grid de check-in horario */}
            {agents.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Check-in horario — hoy
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Registró</span>
                            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-400" /> No registró</span>
                            <span className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded-full bg-gray-100 inline-block border border-gray-200" /> Pendiente</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr>
                                    <th className="text-left font-semibold text-gray-500 py-1.5 pr-3 whitespace-nowrap min-w-[120px]">Agente</th>
                                    {BUSINESS_HOURS.map(h => (
                                        <th key={h} className={`text-center font-medium py-1.5 px-1 whitespace-nowrap ${new Date().getHours() === h ? 'text-brand-600' : 'text-gray-400'}`}>
                                            {formatHour(h)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {agents.map(agent => {
                                    const agentHours = checkIns[agent.id] || [];
                                    const currentHour = new Date().getHours();
                                    return (
                                        <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="py-2 pr-3 font-medium text-gray-700 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isActive(agent.lastSeenAt) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {agent.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="truncate max-w-[100px]">{agent.name}</span>
                                                </div>
                                            </td>
                                            {BUSINESS_HOURS.map(h => {
                                                const checked = agentHours.includes(h);
                                                const isPast = h < currentHour && inBusinessHours || h < currentHour;
                                                const isCurrent = h === currentHour;
                                                return (
                                                    <td key={h} className="text-center py-2 px-1">
                                                        {checked ? (
                                                            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                                                        ) : isPast ? (
                                                            <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                                                        ) : (
                                                            <span className={`w-4 h-4 rounded-full inline-block border ${isCurrent ? 'border-brand-300 bg-brand-50' : 'border-gray-200 bg-gray-50'}`} />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* Totales */}
                    <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {respondieron.length} respondieron hoy
                        </span>
                        {sinRespuesta.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                                <XCircle className="w-3.5 h-3.5" /> {sinRespuesta.length} sin registro hoy
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
                {/* Lista de agentes */}
                <div className="w-full lg:w-72 flex-shrink-0 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                        Agentes ({agents.length})
                    </p>
                    {agents.length === 0 && (
                        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center text-gray-400 text-sm">
                            No hay agentes registrados.
                        </div>
                    )}
                    {agents.map(agent => {
                        const active = isActive(agent.lastSeenAt);
                        const isSelected = selectedAgent?.id === agent.id;
                        return (
                            <button
                                key={agent.id}
                                onClick={() => setSelectedAgent(isSelected ? null : agent)}
                                className={`w-full text-left bg-white rounded-xl border p-3 transition shadow-sm hover:shadow-md ${
                                    isSelected ? 'border-brand-400 ring-1 ring-brand-300' : 'border-gray-100'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {agent.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{agent.name}</p>
                                        <div className="mt-0.5">
                                            <StatusBadge agent={agent} />
                                        </div>
                                    </div>
                                    {agent.lastLat && (
                                        <MapPin className="w-4 h-4 text-brand-500 flex-shrink-0" />
                                    )}
                                </div>
                                {/* Tiempo activo o hora de desconexión */}
                                <div className="flex items-center gap-1 mt-2 text-xs pl-12">
                                    <Clock className="w-3 h-3 flex-shrink-0" />
                                    {active && agent.connectedSince ? (
                                        <span className="text-green-600 font-medium">
                                            Conectado hace {formatDuration(agent.connectedSince)}
                                        </span>
                                    ) : active && agent.lastSeenAt ? (
                                        <span className="text-green-600 font-medium">
                                            Activo · {new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    ) : agent.lastSeenAt ? (
                                        <span className="text-gray-400">
                                            Desconectado a las {new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Sin actividad registrada</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}

                    {agentsWithoutLocation.length > 0 && (
                        <p className="text-xs text-gray-400 px-1 pt-1">
                            {agentsWithoutLocation.length} agente(s) sin ubicación registrada.
                        </p>
                    )}
                </div>

                {/* Mapa */}
                <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm" style={{ minHeight: '480px' }}>
                    {isLoaded ? (
                        <GoogleMap
                            mapContainerStyle={{ height: '100%', width: '100%', minHeight: '480px' }}
                            center={mapCenter}
                            zoom={selectedAgent ? 15 : 12}
                            onLoad={map => { mapRef.current = map; }}
                            onUnmount={() => { mapRef.current = null; }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2" style={{ minHeight: '480px' }}>
                            <Radio className="w-6 h-6" />
                            <span className="text-sm">Cargando mapa...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
