import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, Plus, X, Trash2, User, Home, Calendar, CalendarX, ChevronRight, UserX, UserCheck, CheckCircle, List, Map as MapIcon, Phone, MessageCircle, Pencil, MapPin, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';
import { useToast } from '../context/ToastContext';
import { VISIT_TYPE_CONFIG, STATUS_CONFIG, MODALITY_CONFIG, getLateStartMinutes } from '../utils/visitTypes';
import { friendlyError } from '../utils/api';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { MAP_STYLE } from '../utils/mapStyles';
import { MAPS_LOADER_OPTIONS } from '../utils/mapsLoader';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { Button, Modal, Select, Input } from '../components/ui';
import { visitMarkerIcon, agentMarkerIcon } from '../utils/mapMarkers';
import { buildWhatsAppUrl, buildConfirmationMessage } from '../utils/phone';

const BOGOTA = { lat: 4.6097, lng: -74.0817 };

// Un agente se considera "activo" si reportó ubicación hace ≤ 5 minutos.
function isAgentActive(lastSeenAt) {
    if (!lastSeenAt) return false;
    return (Date.now() - new Date(lastSeenAt).getTime()) / 60000 <= 5;
}

// Mapa de agenda con card overlay (evita el iframe de InfoWindow)
function AgendaMapView({ visits, agents = [], onVisitClick }) {
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const [selectedVisit, setSelectedVisit] = useState(null);
    const [selectedAgent, setSelectedAgent] = useState(null);

    const { isLoaded } = useJsApiLoader(MAPS_LOADER_OPTIONS);

    const visitsWithCoords = visits.filter(v => v.property?.lat && v.property?.lng);
    const agentsWithCoords = agents.filter(a => a.lastLat != null && a.lastLng != null);
    const center = visitsWithCoords[0]
        ? { lat: visitsWithCoords[0].property.lat, lng: visitsWithCoords[0].property.lng }
        : agentsWithCoords[0]
            ? { lat: agentsWithCoords[0].lastLat, lng: agentsWithCoords[0].lastLng }
            : BOGOTA;

    const createMarkers = (map) => {
        markersRef.current.forEach(m => m.setMap(null));
        markersRef.current = [];
        if (!window.google?.maps) return;

        const bounds = new window.google.maps.LatLngBounds();

        visitsWithCoords.forEach(visit => {
            const typeCfg = VISIT_TYPE_CONFIG[visit.type] || VISIT_TYPE_CONFIG.OTHER;
            const pos = { lat: visit.property.lat, lng: visit.property.lng };
            const marker = new window.google.maps.Marker({
                map,
                position: pos,
                title: visit.property.address,
                icon: visitMarkerIcon(window.google, {
                    color: typeCfg.barColor || '#e31c25',
                    status: visit.status,
                }),
            });
            marker.addListener('click', () => { setSelectedAgent(null); setSelectedVisit(visit); });
            markersRef.current.push(marker);
            bounds.extend(pos);
        });

        // #3: Marcadores de agentes (gota indigo con inicial) — distintos de las
        // visitas para que el admin vea de un vistazo si están cerca del punto.
        agentsWithCoords.forEach(agent => {
            const pos = { lat: agent.lastLat, lng: agent.lastLng };
            const active = isAgentActive(agent.lastSeenAt);
            const marker = new window.google.maps.Marker({
                map,
                position: pos,
                title: agent.name,
                zIndex: 999, // por encima de los pines de visita
                icon: agentMarkerIcon(window.google, {
                    initial: (agent.name || '?').charAt(0),
                    active,
                }),
            });
            marker.addListener('click', () => { setSelectedVisit(null); setSelectedAgent(agent); });
            markersRef.current.push(marker);
            bounds.extend(pos);
        });

        const totalPoints = visitsWithCoords.length + agentsWithCoords.length;
        if (totalPoints === 1) {
            // Un solo punto: centrar y usar zoom 16 (igual que VisitExecution)
            map.setCenter(bounds.getCenter());
            map.setZoom(16);
        } else if (totalPoints > 1) {
            map.fitBounds(bounds, 60); // padding 60px
        }
    };

    const handleMapLoad = (map) => {
        mapRef.current = map;
        createMarkers(map);
        map.addListener('click', () => { setSelectedVisit(null); setSelectedAgent(null); });
    };

    useEffect(() => {
        if (mapRef.current) createMarkers(mapRef.current);
    }, [visits, agents]);

    if (!isLoaded) return (
        <div className="flex items-center justify-center h-full bg-gray-50">
            <p className="text-gray-400 text-sm">Cargando mapa...</p>
        </div>
    );

    if (visitsWithCoords.length === 0 && agentsWithCoords.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 gap-3">
            <MapIcon className="w-10 h-10 text-gray-300" />
            <p className="text-gray-400 text-sm">Sin visitas con ubicación para mostrar</p>
        </div>
    );

    const selTypeCfg = selectedVisit ? (VISIT_TYPE_CONFIG[selectedVisit.type] || VISIT_TYPE_CONFIG.OTHER) : null;
    const selStatusCfg = selectedVisit ? (STATUS_CONFIG[selectedVisit.status] || STATUS_CONFIG.PENDING) : null;

    return (
        <div className="relative w-full h-full">
            <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={16}
                options={{ styles: MAP_STYLE, zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
                onLoad={handleMapLoad}
            />
            {/* Leyenda — tipos de visita presentes + agentes (admin) */}
            {(visitsWithCoords.length > 0 || agentsWithCoords.length > 0) && (
                <div className="absolute top-3 left-3 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-100 px-3 py-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 max-w-[78%] text-[11px]">
                    {[...new Set(visitsWithCoords.map(v => v.type))].map(t => {
                        const cfg = VISIT_TYPE_CONFIG[t] || VISIT_TYPE_CONFIG.OTHER;
                        return (
                            <span key={t} className="flex items-center gap-1.5 font-semibold text-gray-600 whitespace-nowrap">
                                <span className="w-2.5 h-2.5 rounded-full ring-1 ring-white shadow" style={{ backgroundColor: cfg.barColor }} />
                                {cfg.label}
                            </span>
                        );
                    })}
                    {agentsWithCoords.length > 0 && (
                        <span className="flex items-center gap-1.5 font-semibold text-indigo-700 whitespace-nowrap">
                            <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 ring-1 ring-white shadow text-white text-[8px] font-bold flex items-center justify-center leading-none">A</span>
                            Agentes
                        </span>
                    )}
                </div>
            )}
            {/* #3: Card del agente seleccionado */}
            {selectedAgent && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-10 animate-slide-up">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold ${isAgentActive(selectedAgent.lastSeenAt) ? 'bg-indigo-600' : 'bg-gray-400'}`}>
                                {(selectedAgent.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="font-bold text-gray-900 leading-snug truncate">{selectedAgent.name}</p>
                                <p className="text-sm text-gray-500 flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isAgentActive(selectedAgent.lastSeenAt) ? 'bg-green-500' : 'bg-gray-400'}`} />
                                    {isAgentActive(selectedAgent.lastSeenAt)
                                        ? 'Activo ahora'
                                        : selectedAgent.lastSeenAt
                                            ? `Última vez: ${new Date(selectedAgent.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : 'Sin reporte de ubicación'}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setSelectedAgent(null)} className="text-gray-400 hover:text-gray-600 shrink-0 p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
            {/* Card overlay — fuera del iframe de Maps, navegación React normal */}
            {selectedVisit && (
                <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-10 animate-slide-up">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-extrabold tabular-nums text-gray-900">
                                    {new Date(selectedVisit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(selectedVisit.scheduledStart).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selTypeCfg.bg} ${selTypeCfg.text}`}>
                                    {selTypeCfg.label}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selStatusCfg.bg} ${selStatusCfg.text}`}>
                                    {selStatusCfg.label}
                                </span>
                                {selectedVisit.modality === 'PHONE' && (
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${MODALITY_CONFIG.PHONE.bg} ${MODALITY_CONFIG.PHONE.text}`}>
                                        <Phone className="w-3 h-3" />
                                        {MODALITY_CONFIG.PHONE.label}
                                    </span>
                                )}
                            </div>
                            <p className="font-bold text-gray-900 leading-snug truncate">{selectedVisit.property.address}</p>
                            {selectedVisit.property.client && selectedVisit.property.client !== 'Cliente General' && (
                                <p className="flex items-center gap-1 text-sm text-gray-500 mt-0.5 truncate">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    {selectedVisit.property.client}
                                </p>
                            )}
                            {selectedVisit.clientName && (
                                <p className="text-sm text-gray-500 mt-0.5">{selectedVisit.clientName}</p>
                            )}
                        </div>
                        <button onClick={() => setSelectedVisit(null)} className="text-gray-400 hover:text-gray-600 shrink-0 p-1">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <Button onClick={() => onVisitClick(selectedVisit.id)} className="mt-3 w-full">
                        Abrir visita →
                    </Button>
                </div>
            )}
        </div>
    );
}

// Normaliza una dirección para compararla: minúsculas, sin tildes, sin
// ciudad/país y sin nada que no sea letra o número (espacios, #, guiones, comas).
// Así "Calle 18 # 110-20, Bogotá" y "calle 18 110 20" se consideran iguales.
function normalizeAddress(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\b(bogota|colombia|cundinamarca|d ?c)\b/g, '')
        .replace(/[^a-z0-9]/g, '');
}

// Distancia en metros entre dos coordenadas (Haversine). Devuelve Infinity si
// falta alguna coordenada, para que nunca cuente como "cercano".
function metersBetween(a, b) {
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Busca un inmueble ya registrado que coincida con el que se intenta crear:
// misma dirección normalizada O coordenadas a menos de 30 m (mismo edificio).
function findDuplicateProperty(properties, { address, lat, lng }) {
    const norm = normalizeAddress(address);
    if (!norm && lat == null) return null;
    return properties.find(p => {
        const sameAddress = norm && normalizeAddress(p.address) === norm;
        const sameSpot = metersBetween({ lat, lng }, { lat: p.lat, lng: p.lng }) < 30;
        return sameAddress || sameSpot;
    }) || null;
}

// Agrupa visitas en bloques horarios
function groupByTimeSlot(visits) {
    const slots = { Mañana: [], Tarde: [], Noche: [] };
    visits.forEach(v => {
        const hour = new Date(v.scheduledStart).getHours();
        if (hour < 12) slots['Mañana'].push(v);
        else if (hour < 18) slots['Tarde'].push(v);
        else slots['Noche'].push(v);
    });
    return slots;
}

export default function Agenda() {
    const [visits, setVisits] = useState([]);
    const [loadingVisits, setLoadingVisits] = useState(true); // M1
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');

    // Reassign State (M2)
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [reassignTargetId, setReassignTargetId] = useState(null);
    const [reassignAgentId, setReassignAgentId] = useState('');

    const [properties, setProperties] = useState([]);
    const [agents, setAgents] = useState([]);
    const [agentLocations, setAgentLocations] = useState([]); // #3: última ubicación de agentes en el mapa (admin)
    const [isNewProperty, setIsNewProperty] = useState(false);

    // Fechas en hora LOCAL (no UTC) para que "Hoy" sea correcto también de noche
    // en Bogotá (UTC-5), donde toISOString() ya habría saltado al día siguiente.
    const localYmd = (d) => {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const today = localYmd(new Date());
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return localYmd(d); })();
    // Semana actual de lunes a domingo
    const weekDow = (new Date().getDay() + 6) % 7; // lunes=0 … domingo=6
    const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - weekDow); return localYmd(d); })();
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + (6 - weekDow)); return localYmd(d); })();

    const datePresets = [
        { key: 'today', label: 'Hoy', start: today, end: today },
        { key: 'tomorrow', label: 'Mañana', start: tomorrow, end: tomorrow },
        { key: 'week', label: 'Esta semana', start: weekStart, end: weekEnd },
    ];

    // Persistimos el rango elegido para que, al entrar a una visita y volver,
    // se conserve el filtro (Hoy/Mañana/Esta semana/personalizado) en vez de
    // reiniciar a "Hoy" cada vez que se remonta la Agenda.
    const [dateRange, setDateRange] = useState(() => {
        try {
            const saved = JSON.parse(sessionStorage.getItem('agendaDateRange') || 'null');
            if (saved?.start && saved?.end) return saved;
        } catch { /* ignora JSON corrupto */ }
        return { start: today, end: today };
    });

    useEffect(() => {
        try { sessionStorage.setItem('agendaDateRange', JSON.stringify(dateRange)); } catch { /* sin storage */ }
    }, [dateRange]);

    // Filtro por agente (solo admin) — 'all' = todos. Persiste como el rango.
    const [agentFilter, setAgentFilter] = useState(() => {
        try { return sessionStorage.getItem('agendaAgentFilter') || 'all'; } catch { return 'all'; }
    });
    useEffect(() => {
        try { sessionStorage.setItem('agendaAgentFilter', agentFilter); } catch { /* sin storage */ }
    }, [agentFilter]);

    const [formData, setFormData] = useState({
        propertyId: '',
        newAddress: '',
        newClient: '',
        newLat: null,
        newLng: null,
        assignedUserId: '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        duration: 60,
        type: 'RENTAL_SHOWING',
        modality: 'ON_SITE',
        notes: '',
        clientName: '',
        clientPhone: '',
        clientEmail: ''
    });

    // Edición de visita
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [savingEdit, setSavingEdit] = useState(false);

    const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'

    const { token, user } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    // Cargamos el script de Maps a nivel de página para que el autocompletado de
    // Places funcione dentro de los modales aunque la vista activa sea la lista.
    const { isLoaded: mapsLoaded } = useJsApiLoader(MAPS_LOADER_OPTIONS);

    const fetchVisits = async (silent = false) => {
        if (!silent) setLoadingVisits(true); // El polling y el visibility-refresh no muestran spinner
        try {
            const query = `?startDate=${dateRange.start}&endDate=${dateRange.end}`;
            const res = await fetch(`${API_URL}/api/visits${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401) {
                // Token inválido o caducado (típico tras rotar JWT_SECRET):
                // disparamos el evento global para que AuthContext cierre sesión.
                window.dispatchEvent(new Event('auth:unauthorized'));
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setVisits(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error al cargar visitas', error);
        } finally {
            if (!silent) setLoadingVisits(false);
        }
    };

    const fetchProperties = async () => {
        try {
            const res = await fetch(`${API_URL}/api/properties`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setProperties(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    const fetchAgents = async () => {
        if (user?.role === 'ADMIN') {
            try {
                const res = await fetch(`${API_URL}/api/users`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const allUsers = await res.json();
                    setAgents(allUsers.filter(u => u.role === 'AGENT'));
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    // #3: Última ubicación registrada de los agentes (solo admin). Reusa el
    // mismo endpoint que el módulo de Rastreo. Silencioso: si falla, el mapa
    // simplemente no pinta agentes.
    const fetchAgentLocations = async () => {
        if (user?.role !== 'ADMIN') return;
        try {
            const res = await fetch(`${API_URL}/api/users/locations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setAgentLocations(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        if (token) {
            fetchVisits();
            fetchProperties();
            fetchAgents();
            fetchAgentLocations();
        }
    }, [token, user, dateRange]);

    // Mantener la lista de visitas fresca sin necesidad de cambiar de módulo:
    // - Polling silencioso cada 45 s (captura asignaciones/eliminaciones del admin)
    // - Refresh inmediato al volver del background o al ganar foco la ventana
    //   (típico cuando el agente abre la app tras recibir la push de notificación)
    useEffect(() => {
        if (!token) return;
        const tick = () => { fetchVisits(true); fetchAgentLocations(); }; // silencioso, sin spinner
        const interval = setInterval(tick, 45000);
        const onVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisibilityOrFocus);
        window.addEventListener('focus', onVisibilityOrFocus);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibilityOrFocus);
            window.removeEventListener('focus', onVisibilityOrFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, dateRange.start, dateRange.end]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (isNewProperty) {
                const propRes = await fetch(`${API_URL}/api/properties`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        address: formData.newAddress,
                        client: formData.newClient || 'Cliente General',
                        // Coordenadas exactas si el agente eligió del autocompletado;
                        // si las dejó en null, el servidor geocodifica como respaldo.
                        lat: formData.newLat,
                        lng: formData.newLng
                    })
                });
                if (!propRes.ok) {
                    const errData = await propRes.json();
                    throw new Error(errData.error || 'Error al registrar inmueble');
                }
                const newProp = await propRes.json();
                if (newProp.lat == null || newProp.lng == null) {
                    toast.error('No se pudo ubicar la dirección en el mapa. Elige una sugerencia del autocompletado para fijar la ubicación.');
                } else {
                    toast.success('Inmueble registrado correctamente');
                }
                await fetchProperties();
                setFormData(prev => ({ ...prev, propertyId: newProp.id, newAddress: '', newClient: '', newLat: null, newLng: null }));
                setIsNewProperty(false);
                return;
            }

            const scheduledStart = new Date(`${formData.date}T${formData.time}:00`).toISOString();
            const payload = {
                propertyId: parseInt(formData.propertyId),
                scheduledStart,
                estimatedDuration: parseInt(formData.duration),
                type: formData.type,
                modality: formData.modality,
                notes: formData.notes,
                clientName: formData.clientName,
                clientPhone: formData.clientPhone,
                clientEmail: formData.clientEmail
            };
            if (formData.assignedUserId) payload.assignedUserId = parseInt(formData.assignedUserId);

            const res = await fetch(`${API_URL}/api/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowModal(false);
                fetchVisits();
                setFormData({
                    propertyId: '', newAddress: '', newClient: '', newLat: null, newLng: null, assignedUserId: '',
                    date: new Date().toISOString().split('T')[0], time: '09:00',
                    duration: 60, type: 'RENTAL_SHOWING', modality: 'ON_SITE', notes: '', clientName: '', clientPhone: '', clientEmail: ''
                });
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al crear la visita');
            }
        } catch (error) {
            toast.error(friendlyError(error)); // M2
        }
    };

    const initiateDelete = (e, id) => {
        e.stopPropagation();
        setDeleteTargetId(id);
        setDeletePassword('');
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deletePassword) return;
        try {
            const res = await fetch(`${API_URL}/api/visits/${deleteTargetId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ password: deletePassword })
            });
            if (res.ok) {
                setShowDeleteModal(false);
                fetchVisits();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al eliminar');
            }
        } catch (error) {
            toast.error(friendlyError(error)); // M2
        }
    };

    // A2: Marcar visita como no atendida
    const handleMarkMissed = async (e, id) => {
        e.stopPropagation();
        try {
            const res = await fetch(`${API_URL}/api/visits/${id}/missed`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                fetchVisits();
                toast.success('Visita marcada como no atendida');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al actualizar');
            }
        } catch (error) {
            toast.error(friendlyError(error));
        }
    };

    // Marcar la cita como confirmada (al escribirle al cliente por WhatsApp).
    // Fire-and-forget: el enlace de WhatsApp abre igual aunque esto falle.
    const handleConfirmAppointment = async (id) => {
        try {
            const res = await fetch(`${API_URL}/api/visits/${id}/confirm`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                fetchVisits();
                toast.success('Cita marcada como confirmada');
            }
        } catch {
            // silencioso: lo importante es que se abrió WhatsApp
        }
    };

    // M2: Reasignar visita (admin)
    const initiateReassign = (e, id) => {
        e.stopPropagation();
        setReassignTargetId(id);
        setReassignAgentId('');
        setShowReassignModal(true);
    };

    const confirmReassign = async () => {
        if (!reassignAgentId) return;
        try {
            const res = await fetch(`${API_URL}/api/visits/${reassignTargetId}/reassign`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ assignedUserId: parseInt(reassignAgentId) })
            });
            if (res.ok) {
                setShowReassignModal(false);
                fetchVisits();
                toast.success('Visita reasignada correctamente');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al reasignar');
            }
        } catch (error) {
            toast.error(friendlyError(error));
        }
    };

    // Abrir el modal de edición con los datos actuales de la visita precargados
    const openEdit = (e, visit) => {
        e.stopPropagation();
        const start = new Date(visit.scheduledStart);
        const pad = n => String(n).padStart(2, '0');
        setEditForm({
            id: visit.id,
            // address/client solo para mostrar (lectura); no se editan aquí
            address: visit.property?.address || '',
            client: visit.property?.client || '',
            date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
            time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
            duration: visit.estimatedDuration,
            type: visit.type,
            modality: visit.modality || 'ON_SITE',
            clientName: visit.clientName || '',
            clientPhone: visit.clientPhone || '',
            clientEmail: visit.clientEmail || '',
            notes: visit.notes || '',
            assignedUserId: String(visit.user?.id ?? visit.userId ?? ''),
        });
        setShowEditModal(true);
    };

    const saveEdit = async () => {
        if (!editForm || savingEdit) return;
        setSavingEdit(true);
        try {
            // La dirección/ubicación del inmueble NO se edita desde aquí (para que
            // los agentes no la alteren). Se gestiona solo en la sección Inmuebles
            // (admin). Aquí solo se actualizan los datos de la visita.
            const scheduledStart = new Date(`${editForm.date}T${editForm.time}:00`).toISOString();
            const payload = {
                scheduledStart,
                estimatedDuration: parseInt(editForm.duration),
                type: editForm.type,
                modality: editForm.modality,
                notes: editForm.notes,
                clientName: editForm.clientName,
                clientPhone: editForm.clientPhone,
                clientEmail: editForm.clientEmail,
            };
            if (user?.role === 'ADMIN' && editForm.assignedUserId) {
                payload.assignedUserId = parseInt(editForm.assignedUserId);
            }

            const res = await fetch(`${API_URL}/api/visits/${editForm.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al guardar la visita');
            }

            setShowEditModal(false);
            setEditForm(null);
            await fetchVisits();
            toast.success('Visita actualizada correctamente');
        } catch (error) {
            toast.error(friendlyError(error));
        } finally {
            setSavingEdit(false);
        }
    };

    // El agente eligió/escribió una dirección nueva que ya coincide con un
    // inmueble registrado: en vez de duplicarlo, lo seleccionamos.
    // (No empieza con "use": no es un hook, solo un handler.)
    const selectExistingProperty = (prop) => {
        setIsNewProperty(false);
        setFormData(prev => ({
            ...prev,
            propertyId: String(prop.id),
            newAddress: '', newClient: '', newLat: null, newLng: null,
        }));
        toast.success('Seleccionamos el inmueble que ya estaba registrado.');
    };

    const formatDate = (d) =>
        new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

    // Aplica el filtro de agente (admin) sobre las visitas ya cargadas del período.
    const visibleVisits = (user?.role === 'ADMIN' && agentFilter !== 'all')
        ? visits.filter(v => String(v.user?.id ?? v.userId) === String(agentFilter))
        : visits;
    const visibleAgentLocations = (user?.role === 'ADMIN' && agentFilter !== 'all')
        ? agentLocations.filter(a => String(a.id) === String(agentFilter))
        : agentLocations;

    const groupedVisits = groupByTimeSlot(visibleVisits);
    const hasVisits = visibleVisits.length > 0;

    // Aviso de duplicado: solo mientras se registra un inmueble nuevo en el modal.
    const duplicateProperty = (showModal && isNewProperty)
        ? findDuplicateProperty(properties, { address: formData.newAddress, lat: formData.newLat, lng: formData.newLng })
        : null;

    return (
        <div className="space-y-6 relative min-h-[80vh]">
            {/* Header */}
            <div className="space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Visitas Programadas</h2>
                        <span className="text-sm text-gray-500 capitalize">
                            {dateRange.start === dateRange.end
                                ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('es-CO', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                })
                                : `${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-200 rounded-xl p-1 gap-1">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'list' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <List className="w-4 h-4" />
                                <span className="hidden sm:inline">Lista</span>
                            </button>
                            <button
                                onClick={() => setViewMode('map')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${viewMode === 'map' ? 'bg-white shadow text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <MapIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Mapa</span>
                            </button>
                        </div>
                        <Button icon={Plus} onClick={() => setShowModal(true)} className="whitespace-nowrap">
                            Nueva Visita
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-card border border-gray-200 w-full sm:w-fit">
                    {datePresets.map(p => {
                        const active = dateRange.start === p.start && dateRange.end === p.end;
                        return (
                            <button
                                key={p.key}
                                onClick={() => setDateRange({ start: p.start, end: p.end })}
                                className={`text-sm font-semibold px-3 py-2 rounded-lg active:scale-95 transition whitespace-nowrap flex-shrink-0 ${active ? 'bg-brand-600 text-white shadow' : 'bg-gray-100 text-gray-700 hover:bg-brand-600 hover:text-white'}`}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-500 whitespace-nowrap">Del</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-200 rounded-lg text-sm font-semibold text-gray-800 tabular-nums px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-500 whitespace-nowrap">al</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-200 rounded-lg text-sm font-semibold text-gray-800 tabular-nums px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none"
                        />
                    </div>

                    {/* Filtro por agente — solo admin */}
                    {user?.role === 'ADMIN' && (
                        <div className="flex items-center gap-1.5">
                            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <select
                                value={agentFilter}
                                onChange={(e) => setAgentFilter(e.target.value)}
                                className="border border-gray-200 rounded-lg text-sm font-semibold text-gray-800 px-3 py-2 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none"
                            >
                                <option value="all">Todos los agentes</option>
                                {agents.map(agent => (
                                    <option key={agent.id} value={String(agent.id)}>{agent.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* U2: Skeleton mientras carga */}
            {loadingVisits && (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
                            <div className="skeleton h-1.5 w-full rounded-none" />
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3">
                                        <div className="skeleton h-4 w-14" />
                                        <div className="skeleton h-4 w-20" />
                                    </div>
                                    <div className="skeleton h-5 w-20 rounded-full" />
                                </div>
                                <div className="skeleton h-4 w-3/4" />
                                <div className="skeleton h-3 w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Vista de mapa */}
            {!loadingVisits && viewMode === 'map' && (
                <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: '65vh' }}>
                    <AgendaMapView
                        visits={visibleVisits}
                        agents={visibleAgentLocations}
                        onVisitClick={(id) => navigate(`/visit/${id}`)}
                    />
                </div>
            )}

            {/* Visit List grouped by time slot */}
            {!loadingVisits && viewMode === 'list' && !hasVisits && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="relative mb-5">
                        <div className="w-20 h-20 bg-brand-50 rounded-3xl flex items-center justify-center">
                            <CalendarX className="w-9 h-9 text-brand-400" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-gray-100 rounded-full border-2 border-white flex items-center justify-center">
                            <Plus className="w-3 h-3 text-gray-500" />
                        </div>
                    </div>
                    <p className="text-gray-800 font-bold text-lg">
                        {agentFilter !== 'all'
                            ? 'Este agente no tiene visitas'
                            : (dateRange.start === dateRange.end ? 'Día libre de visitas' : 'Sin visitas en este período')}
                    </p>
                    <p className="text-gray-400 text-sm mt-1.5 max-w-xs">
                        {agentFilter !== 'all'
                            ? 'No hay visitas para el agente seleccionado en este período. Cambia el filtro o el rango de fechas.'
                            : `Agenda la primera visita del ${dateRange.start === dateRange.end ? 'día' : 'período'} para empezar el seguimiento.`}
                    </p>
                    <Button icon={Plus} onClick={() => setShowModal(true)} className="mt-6">
                        Agendar visita
                    </Button>
                </div>
            )}
            {!loadingVisits && viewMode === 'list' && hasVisits && (
                <div className="space-y-6">
                    {Object.entries(groupedVisits).map(([slot, slotVisits]) => {
                        if (slotVisits.length === 0) return null;
                        return (
                            <div key={slot}>
                                {/* Slot header */}
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                        {slot}
                                    </span>
                                    <div className="flex-1 h-px bg-gray-100" />
                                    <span className="text-xs text-gray-400">{slotVisits.length} visita{slotVisits.length > 1 ? 's' : ''}</span>
                                </div>

                                <div className="space-y-3">
                                    {slotVisits.map(visit => {
                                        const typeConfig = VISIT_TYPE_CONFIG[visit.type] || VISIT_TYPE_CONFIG.OTHER;
                                        const statusConfig = STATUS_CONFIG[visit.status] || STATUS_CONFIG.PENDING;
                                        const isCompleted = visit.status === 'COMPLETED';
                                        const isPastPending = visit.status === 'PENDING' && new Date(visit.scheduledStart) < new Date();
                                        const lateMin = getLateStartMinutes(visit); // #2: inició tarde

                                        return (
                                            <div
                                                key={visit.id}
                                                onClick={() => navigate(`/visit/${visit.id}`)}
                                                className={`bg-white rounded-xl border cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden group ${typeConfig.border} ${isCompleted ? 'opacity-70' : ''}`}
                                            >
                                                {/* Franja de color por tipo */}
                                                <div className={`h-1 w-full ${typeConfig.dot}`} />

                                                <div className="p-4">
                                                    {/* Row 1: Hora + Tipo */}
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                                <span className="font-extrabold text-base text-gray-900 tabular-nums">
                                                                    {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
                                                                <Calendar className="w-3 h-3" />
                                                                {new Date(visit.scheduledStart).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                            </span>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${typeConfig.bg} ${typeConfig.text}`}>
                                                                {typeConfig.label}
                                                            </span>
                                                            {visit.modality === 'PHONE' && (
                                                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${MODALITY_CONFIG.PHONE.bg} ${MODALITY_CONFIG.PHONE.text}`}>
                                                                    <Phone className="w-3 h-3" />
                                                                    {MODALITY_CONFIG.PHONE.label}
                                                                </span>
                                                            )}
                                                            {lateMin != null && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800" title={`Inició ${lateMin} min después de lo programado`}>
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    Tarde +{lateMin}m
                                                                </span>
                                                            )}
                                                            {visit.confirmedAt && ['PENDING', 'IN_PROGRESS'].includes(visit.status) && (
                                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700" title={`Confirmada el ${new Date(visit.confirmedAt).toLocaleString('es-CO')}`}>
                                                                    <CheckCircle className="w-3 h-3" />
                                                                    Confirmada
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold ${statusConfig.bg} ${statusConfig.text}`}>
                                                                {statusConfig.pulse && (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                                                                )}
                                                                {statusConfig.label}
                                                            </span>
                                                            {isPastPending && (
                                                                <button onClick={(e) => handleMarkMissed(e, visit.id)} className="text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition rounded-full w-9 h-9 md:w-7 md:h-7 flex items-center justify-center opacity-100 md:opacity-40 md:group-hover:opacity-100" title="Marcar como no atendida">
                                                                    <UserX className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                                </button>
                                                            )}
                                                            {['PENDING', 'IN_PROGRESS'].includes(visit.status) && (
                                                                <button onClick={(e) => openEdit(e, visit)} className="text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition rounded-full w-9 h-9 md:w-7 md:h-7 flex items-center justify-center opacity-100 md:opacity-40 md:group-hover:opacity-100" title="Editar visita">
                                                                    <Pencil className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                                </button>
                                                            )}
                                                            {user?.role === 'ADMIN' && ['PENDING', 'IN_PROGRESS'].includes(visit.status) && (
                                                                <button onClick={(e) => initiateReassign(e, visit.id)} className="text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition rounded-full w-9 h-9 md:w-7 md:h-7 flex items-center justify-center opacity-100 md:opacity-40 md:group-hover:opacity-100" title="Reasignar agente">
                                                                    <UserCheck className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                                </button>
                                                            )}
                                                            <button onClick={(e) => initiateDelete(e, visit.id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 transition rounded-full w-9 h-9 md:w-7 md:h-7 flex items-center justify-center opacity-100 md:opacity-40 md:group-hover:opacity-100" title="Eliminar">
                                                                <Trash2 className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                            </button>
                                                            <ChevronRight className="w-5 h-5 md:w-4 md:h-4 text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Dirección + thumbnail */}
                                                    <div className="flex items-start gap-2 mb-2.5">
                                                        <Home className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-gray-900 text-base leading-snug">
                                                                {visit.property?.address || 'Dirección desconocida'}
                                                            </p>
                                                            {visit.property?.client && visit.property.client !== 'Cliente General' && (
                                                                <p className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                                                                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                                                    {visit.property.client}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {visit.images?.[0]?.url && (
                                                            <img
                                                                src={visit.images[0].url}
                                                                alt="Foto de visita"
                                                                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-100 shadow-sm"
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Row 3: Cliente + Agente + Duración */}
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pl-6">
                                                        {visit.clientName && (
                                                            <div className="flex items-center gap-1">
                                                                <User className="w-3 h-3" />
                                                                <span className="font-medium text-gray-600">{visit.clientName}</span>
                                                                {visit.clientPhone && (
                                                                    <span className="text-gray-400">· {visit.clientPhone}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {visit.clientPhone && (
                                                            <div className="flex items-center gap-2">
                                                                <a
                                                                    href={`tel:${visit.clientPhone}`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    aria-label="Llamar"
                                                                    title="Llamar"
                                                                    className="w-10 h-10 md:w-7 md:h-7 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center transition active:scale-95 shadow-sm"
                                                                >
                                                                    <Phone className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                                </a>
                                                                <a
                                                                    href={buildWhatsAppUrl(visit.clientPhone, buildConfirmationMessage(visit, visit.user?.name))}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => { e.stopPropagation(); handleConfirmAppointment(visit.id); }}
                                                                    aria-label="Confirmar cita por WhatsApp"
                                                                    title="Confirmar cita por WhatsApp"
                                                                    className="w-10 h-10 md:w-7 md:h-7 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition active:scale-95 shadow-sm"
                                                                >
                                                                    <MessageCircle className="w-5 h-5 md:w-3.5 md:h-3.5" />
                                                                </a>
                                                            </div>
                                                        )}
                                                        {user?.role === 'ADMIN' && visit.user?.name && (
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                                                    <span className="text-brand-600 font-bold" style={{ fontSize: '8px' }}>{visit.user.name.charAt(0)}</span>
                                                                </div>
                                                                <span className="font-semibold text-brand-700">{visit.user.name}</span>
                                                            </div>
                                                        )}
                                                        {!visit.clientName && !(user?.role === 'ADMIN' && visit.user?.name) && (
                                                            <span className="text-gray-300 italic">Sin datos de cliente</span>
                                                        )}
                                                        <span className="text-gray-400">{visit.estimatedDuration} min</span>
                                                    </div>

                                                    {/* Notas del agendamiento (info para el agente) */}
                                                    {visit.notes && (
                                                        <div className="mt-2 ml-6 flex items-start gap-1.5 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                                                            <Pencil className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                                            <span className="whitespace-pre-wrap break-words">{visit.notes}</span>
                                                        </div>
                                                    )}

                                                    {/* Resultado si completada */}
                                                    {isCompleted && visit.outcome && (
                                                        <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5 pl-6">
                                                            <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                                            <span className="font-medium text-gray-700">{visit.outcome}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* New Visit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">Nueva Visita</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-500">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {user?.role === 'ADMIN' && !isNewProperty && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <label className="block text-sm font-medium text-blue-800 mb-1">Asignar Agente</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={formData.assignedUserId}
                                        onChange={e => setFormData({ ...formData, assignedUserId: e.target.value })}
                                    >
                                        <option value="">-- Auto-asignar (Yo) --</option>
                                        {agents.map(agent => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.name} ({agent.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-700">Inmueble</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsNewProperty(!isNewProperty)}
                                        className="text-xs text-brand-600 font-medium hover:underline"
                                    >
                                        {isNewProperty ? 'Cancelar registro' : 'Registrar nuevo'}
                                    </button>
                                </div>

                                {isNewProperty ? (
                                    <div className="space-y-2">
                                        <AddressAutocomplete
                                            isLoaded={mapsLoaded}
                                            value={formData.newAddress}
                                            placeholder="Dirección del inmueble"
                                            required={isNewProperty}
                                            onChange={({ address, lat, lng }) => setFormData(prev => ({
                                                ...prev,
                                                newAddress: address,
                                                newLat: lat !== undefined ? lat : prev.newLat,
                                                newLng: lng !== undefined ? lng : prev.newLng,
                                            }))}
                                        />
                                        <p className="flex items-center gap-1 text-xs text-gray-500">
                                            <MapPin className="w-3 h-3 flex-shrink-0" />
                                            {formData.newLat != null
                                                ? <span className="text-emerald-600 font-medium">Ubicación fijada en el mapa ✓</span>
                                                : <span>Elige una sugerencia para ubicar el inmueble en el mapa.</span>}
                                        </p>
                                        {duplicateProperty && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-800">
                                                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                                    Este inmueble ya está registrado
                                                </p>
                                                <p className="text-sm text-amber-700 mt-1 pl-6">
                                                    {duplicateProperty.address}
                                                    {duplicateProperty.client && duplicateProperty.client !== 'Cliente General' && (
                                                        <span className="block text-amber-600">{duplicateProperty.client}</span>
                                                    )}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => selectExistingProperty(duplicateProperty)}
                                                    className="mt-2 w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 rounded-lg transition active:scale-95"
                                                >
                                                    Usar el inmueble existente
                                                </button>
                                                <p className="text-xs text-amber-600 mt-1.5 text-center">
                                                    o continúa abajo si de verdad es otra unidad
                                                </p>
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            placeholder="Nombre del Conjunto o Edificio (Opcional)"
                                            className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                            value={formData.newClient}
                                            onChange={e => setFormData({ ...formData, newClient: e.target.value })}
                                        />
                                    </div>
                                ) : (
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                        value={formData.propertyId}
                                        onChange={e => setFormData({ ...formData, propertyId: e.target.value })}
                                        required={!isNewProperty}
                                    >
                                        <option value="">Selecciona un inmueble...</option>
                                        {properties.map(p => (
                                            <option key={p.id} value={p.id}>{p.address}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {!isNewProperty ? (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                                            <input
                                                type="date"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.date}
                                                min={today} // B2: No permitir fechas pasadas
                                                onChange={e => setFormData({ ...formData, date: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                                            <input
                                                type="time"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.time}
                                                onChange={e => setFormData({ ...formData, time: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Cliente <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.clientName}
                                                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                                placeholder="Nombre del cliente"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono Cliente <span className="text-red-500">*</span></label>
                                            <input
                                                type="tel"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.clientPhone}
                                                onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
                                                placeholder="Número de contacto"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Correo Cliente</label>
                                        <input
                                            type="email"
                                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                            value={formData.clientEmail}
                                            onChange={e => setFormData({ ...formData, clientEmail: e.target.value })}
                                            placeholder="Opcional — para enviar invitación por correo"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                            <select
                                                className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.type}
                                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                            >
                                                <option value="RENTAL_SHOWING">Mostrar en Arriendo</option>
                                                <option value="PROPERTY_INTAKE">Captación</option>
                                                <option value="HANDOVER">Entrega</option>
                                                <option value="MOVE_OUT">Desocupación</option>
                                                <option value="INSPECTION">Inspección</option>
                                                <option value="OTHER">Otro</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
                                            <input
                                                type="number"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.duration}
                                                min={1}
                                                max={480}
                                                required
                                                onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { value: 'ON_SITE', label: 'Presencial', icon: MapPin },
                                                { value: 'PHONE', label: 'Por llamada', icon: Phone },
                                            ].map(opt => {
                                                const active = formData.modality === opt.value;
                                                const Icon = opt.icon;
                                                return (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => setFormData({ ...formData, modality: opt.value })}
                                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition ${
                                                            active
                                                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <Icon className="w-4 h-4" />
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {formData.modality === 'PHONE' && (
                                            <p className="text-xs text-gray-400 mt-1.5">
                                                Las visitas por llamada se registran sin GPS ni ubicación.
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                                        <textarea
                                            className="w-full p-2 border rounded-lg h-20 resize-none focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                            value={formData.notes}
                                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                            placeholder="Información para el agente (ej.: estudio realizado, requiere para 6 meses...)"
                                        />
                                    </div>

                                    <Button type="submit" size="lg" className="w-full mt-4">
                                        Agendar Visita
                                    </Button>
                                </>
                            ) : (
                                <Button type="submit" variant="success" size="lg" className="w-full mt-4">
                                    Guardar Inmueble
                                </Button>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Visit Modal */}
            <Modal open={showEditModal} onClose={() => { setShowEditModal(false); setEditForm(null); }} title="Editar Visita" maxWidth="max-w-md">
                {editForm && (
                    <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1 space-y-4">
                        {user?.role === 'ADMIN' && (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <label className="block text-sm font-medium text-blue-800 mb-1">Agente asignado</label>
                                <Select value={editForm.assignedUserId} onChange={e => setEditForm({ ...editForm, assignedUserId: e.target.value })}>
                                    {agents.map(agent => (
                                        <option key={agent.id} value={agent.id}>{agent.name} ({agent.email})</option>
                                    ))}
                                </Select>
                            </div>
                        )}

                        {/* Inmueble en solo lectura: la dirección/ubicación no se
                            edita desde la visita (se gestiona en la sección Inmuebles). */}
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Inmueble</label>
                            <p className="flex items-start gap-1.5 font-semibold text-gray-900">
                                <Home className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                                {editForm.address || 'Sin dirección'}
                            </p>
                            {editForm.client && editForm.client !== 'Cliente General' && (
                                <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1 pl-6">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                    {editForm.client}
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1.5">La dirección solo se cambia en la sección Inmuebles.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                                <input
                                    type="date"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.date}
                                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                                <input
                                    type="time"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.time}
                                    onChange={e => setEditForm({ ...editForm, time: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Cliente <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.clientName}
                                    onChange={e => setEditForm({ ...editForm, clientName: e.target.value })}
                                    placeholder="Nombre del cliente"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono Cliente <span className="text-red-500">*</span></label>
                                <input
                                    type="tel"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.clientPhone}
                                    onChange={e => setEditForm({ ...editForm, clientPhone: e.target.value })}
                                    placeholder="Número de contacto"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Cliente</label>
                            <input
                                type="email"
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                value={editForm.clientEmail}
                                onChange={e => setEditForm({ ...editForm, clientEmail: e.target.value })}
                                placeholder="Opcional — para enviar invitación por correo"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                <select
                                    className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.type}
                                    onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                >
                                    <option value="RENTAL_SHOWING">Mostrar en Arriendo</option>
                                    <option value="PROPERTY_INTAKE">Captación</option>
                                    <option value="HANDOVER">Entrega</option>
                                    <option value="MOVE_OUT">Desocupación</option>
                                    <option value="INSPECTION">Inspección</option>
                                    <option value="OTHER">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={editForm.duration}
                                    min={1}
                                    max={480}
                                    onChange={e => setEditForm({ ...editForm, duration: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { value: 'ON_SITE', label: 'Presencial', icon: MapPin },
                                    { value: 'PHONE', label: 'Por llamada', icon: Phone },
                                ].map(opt => {
                                    const active = editForm.modality === opt.value;
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setEditForm({ ...editForm, modality: opt.value })}
                                            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition ${
                                                active
                                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                            <textarea
                                className="w-full p-2 border rounded-lg h-20 resize-none focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                value={editForm.notes}
                                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                                placeholder="Información para el agente..."
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button variant="secondary" className="flex-1" onClick={() => { setShowEditModal(false); setEditForm(null); }}>Cancelar</Button>
                            <Button className="flex-1" disabled={savingEdit} onClick={saveEdit}>
                                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Reassign Modal (M2) */}
            <Modal open={showReassignModal} onClose={() => setShowReassignModal(false)} maxWidth="max-w-sm">
                <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">Reasignar Visita</h3>
                <p className="text-gray-500 mb-4 text-sm text-center">Selecciona el nuevo agente para esta visita.</p>
                <Select className="mb-4" value={reassignAgentId} onChange={(e) => setReassignAgentId(e.target.value)}>
                    <option value="">-- Seleccionar agente --</option>
                    {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>{agent.name} ({agent.email})</option>
                    ))}
                </Select>
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowReassignModal(false)}>Cancelar</Button>
                    <Button className="flex-1" disabled={!reassignAgentId} onClick={confirmReassign}>Reasignar</Button>
                </div>
            </Modal>

            {/* Delete Modal */}
            <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} maxWidth="max-w-sm">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-red-600 mb-1 text-center">Eliminar Visita</h3>
                <p className="text-gray-500 mb-4 text-sm text-center">Esta acción no se puede deshacer. Ingresa tu contraseña para confirmar.</p>
                <Input
                    type="password"
                    placeholder="Contraseña de autorización"
                    className="mb-4"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                />
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
                    <Button variant="danger" className="flex-1" disabled={!deletePassword} onClick={confirmDelete}>Eliminar</Button>
                </div>
            </Modal>
        </div>
    );
}
