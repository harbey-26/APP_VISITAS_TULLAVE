import { useEffect, useState } from 'react';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { Radio, MapPin, Clock, AlertCircle } from 'lucide-react';

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

function StatusBadge({ agent }) {
    const active = isActive(agent.lastSeenAt);
    const mins = getMinutesSince(agent.lastSeenAt);

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
    return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            Desconectado
        </span>
    );
}

export default function Tracking() {
    const { token } = useAuth();
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });
    const [agents, setAgents] = useState([]);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);
    const [selectedAgent, setSelectedAgent] = useState(null);

    const loadAgents = async () => {
        try {
            const res = await fetch(`${API_URL}/api/users/locations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
                setLastUpdate(new Date());
                setError(null);
            }
        } catch {
            setError('No se pudo obtener la ubicación de los agentes.');
        }
    };

    useEffect(() => {
        loadAgents();
        const interval = setInterval(loadAgents, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [token]);

    const agentsWithLocation = agents.filter(a => a.lastLat && a.lastLng);
    const agentsWithoutLocation = agents.filter(a => !a.lastLat || !a.lastLng);

    const mapCenter = selectedAgent && selectedAgent.lastLat
        ? { lat: selectedAgent.lastLat, lng: selectedAgent.lastLng }
        : agentsWithLocation.length > 0
            ? { lat: agentsWithLocation[0].lastLat, lng: agentsWithLocation[0].lastLng }
            : BOGOTA;

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
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
                <button
                    onClick={loadAgents}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium border border-brand-200 hover:border-brand-400 px-3 py-1.5 rounded-lg transition"
                >
                    Actualizar
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
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
                        >
                            {agentsWithLocation.map(agent => {
                                const active = isActive(agent.lastSeenAt);
                                const subtitle = active && agent.connectedSince
                                    ? `Activo — conectado hace ${formatDuration(agent.connectedSince)}`
                                    : active && agent.lastSeenAt
                                        ? `Activo desde las ${new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                        : agent.lastSeenAt
                                            ? `Desconectado a las ${new Date(agent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : '';
                                return (
                                    <Marker
                                        key={agent.id}
                                        position={{ lat: agent.lastLat, lng: agent.lastLng }}
                                        title={`${agent.name}${subtitle ? ' — ' + subtitle : ''}`}
                                        onClick={() => setSelectedAgent(agent)}
                                    />
                                );
                            })}
                        </GoogleMap>
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
