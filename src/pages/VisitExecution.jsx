import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, Clock, Play, CheckCircle, ArrowLeft, User, Phone, AlertCircle, ThumbsUp, ThumbsDown, RefreshCw, UserX, XCircle, HelpCircle } from 'lucide-react';
import { API_URL } from '../config';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-800 rounded-xl">
                    <h2 className="text-xl font-bold mb-4">Algo salió mal.</h2>
                    <pre className="text-xs bg-white p-4 rounded border overflow-auto">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

const OUTCOMES = [
    { value: 'Cliente interesado',     label: 'Interesado',        icon: ThumbsUp,   color: 'border-green-400  bg-green-50  text-green-700'  },
    { value: 'Cliente no interesado',  label: 'No interesado',     icon: ThumbsDown, color: 'border-red-400    bg-red-50    text-red-700'    },
    { value: 'Requiere seguimiento',   label: 'Seguimiento',       icon: RefreshCw,  color: 'border-blue-400   bg-blue-50   text-blue-700'   },
    { value: 'Cliente no asistió',     label: 'No asistió',        icon: UserX,      color: 'border-amber-400  bg-amber-50  text-amber-700'  },
    { value: 'Cancelada',              label: 'Cancelada',         icon: XCircle,    color: 'border-gray-400   bg-gray-100  text-gray-600'   },
];

function VisitExecutionContent() {
    const { id } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();
    const [visit, setVisit] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [currentPos, setCurrentPos] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [outcome, setOutcome] = useState('');

    useEffect(() => {
        const fetchVisit = async () => {
            try {
                const res = await fetch(`${API_URL}/api/visits?id=${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const visits = await res.json();
                    const v = visits.find(v => v.id === parseInt(id));
                    if (v) {
                        setVisit(v);
                        if (v.notes) setNotes(v.notes);
                        if (v.checkInLat && v.checkInLng) {
                            setCurrentPos([v.checkInLat, v.checkInLng]);
                        } else if (v.property?.lat && v.property?.lng) {
                            setCurrentPos([v.property.lat, v.property.lng]);
                        } else {
                            setCurrentPos([4.6097, -74.0817]);
                        }
                    }
                }
            } catch (error) {
                console.error(error);
            }
        };
        fetchVisit();
    }, [id, token]);

    useEffect(() => {
        let interval;
        if (visit?.status === 'IN_PROGRESS' && visit.actualStart) {
            const startTime = new Date(visit.actualStart).getTime();
            interval = setInterval(() => {
                setElapsed(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [visit]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getCurrentLocation = () =>
        new Promise((resolve, reject) => {
            if (!navigator.geolocation) reject(new Error('Geolocalización no soportada'));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });

    const handleStart = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const { lat, lng } = await getCurrentLocation();
            setCurrentPos([lat, lng]);

            const res = await fetch(`${API_URL}/api/visits/${id}/start`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            });

            if (res.ok) {
                setVisit(await res.json());
            } else {
                const errData = await res.json();
                throw new Error(errData.error || 'Error desconocido al iniciar visita');
            }
        } catch (error) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFinish = async () => {
        if (!outcome) {
            setErrorMsg('Debes seleccionar un resultado para finalizar la visita.');
            return;
        }
        setLoading(true);
        setErrorMsg(null);
        try {
            const { lat, lng } = await getCurrentLocation();
            const res = await fetch(`${API_URL}/api/visits/${id}/finish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng, notes, outcome })
            });

            if (res.ok) {
                setVisit(await res.json());
                navigate('/agenda');
            } else {
                const errData = await res.json();
                throw new Error(errData.error || 'Error desconocido al finalizar visita');
            }
        } catch (error) {
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    const safeFormatTime = (dateString) => {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Hora inválida';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return 'Hora inválida';
        }
    };

    if (!visit) return (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm">Cargando visita...</p>
        </div>
    );

    const isInProgress = visit.status === 'IN_PROGRESS';
    const isCompleted  = visit.status === 'COMPLETED';
    const isPending    = visit.status === 'PENDING';

    return (
        <div className="space-y-4 pb-24 lg:pb-8">

            {/* Back + Header card */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
                <button
                    onClick={() => navigate('/agenda')}
                    className="flex items-center text-gray-400 hover:text-brand-600 mb-4 transition-colors text-sm font-medium gap-1"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Regresar a Agenda
                </button>

                {/* Status pill */}
                <div className="flex items-center gap-2 mb-3">
                    {isInProgress && (
                        <span className="flex items-center gap-1.5 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            En Curso
                        </span>
                    )}
                    {isPending && (
                        <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full">
                            Pendiente
                        </span>
                    )}
                    {isCompleted && (
                        <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Completada
                        </span>
                    )}
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-1">
                    {visit.property?.address || 'Sin dirección'}
                </h2>

                <div className="flex items-center text-gray-500 text-sm gap-1 mb-3">
                    <Clock className="w-4 h-4" />
                    <span>Programada: {safeFormatTime(visit.scheduledStart)}</span>
                    <span className="text-gray-300">·</span>
                    <span>{visit.estimatedDuration} min estimados</span>
                </div>

                {/* Client info */}
                {(visit.clientName || visit.clientPhone) && (
                    <div className="flex flex-wrap gap-4 text-sm bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                        {visit.clientName && (
                            <span className="flex items-center gap-1.5 text-gray-700">
                                <User className="w-4 h-4 text-gray-400" />
                                {visit.clientName}
                            </span>
                        )}
                        {visit.clientPhone && (
                            <a
                                href={`tel:${visit.clientPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 text-brand-600 font-medium hover:underline"
                            >
                                <Phone className="w-4 h-4" />
                                {visit.clientPhone}
                            </a>
                        )}
                    </div>
                )}

                {/* Timer */}
                <div className="flex justify-center py-6">
                    <div className={`text-5xl font-mono font-bold tracking-wider ${isInProgress ? 'text-brand-600' : 'text-gray-400'}`}>
                        {isInProgress ? formatTime(elapsed) : isCompleted ? 'Completada' : '00:00:00'}
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="bg-gray-200 rounded-xl overflow-hidden h-52 w-full relative z-0 shadow-sm">
                {currentPos && currentPos[0] && currentPos[1] ? (
                    <MapContainer center={currentPos} zoom={15} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        />
                        <Marker position={currentPos}>
                            <Popup>{visit.property?.address}</Popup>
                        </Marker>
                        {visit.checkInLat && (
                            <Marker position={[visit.checkInLat, visit.checkInLng]}>
                                <Popup>Check-in</Popup>
                            </Marker>
                        )}
                    </MapContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                        <MapPin className="w-5 h-5" />
                        <span className="text-sm">Ubicación no disponible</span>
                    </div>
                )}
            </div>

            {/* Outcome selector (in progress) */}
            {isInProgress && (
                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Resultado de la Visita</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {OUTCOMES.map(opt => {
                                const Icon = opt.icon;
                                const selected = outcome === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { setOutcome(opt.value); setErrorMsg(null); }}
                                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition ${
                                            selected
                                                ? opt.color + ' shadow-sm scale-[1.02]'
                                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                            Comentarios <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <textarea
                            className="w-full p-3 border rounded-xl h-28 resize-none focus:ring-2 focus:ring-brand-500 focus:outline-none text-sm"
                            placeholder="Escribe tus observaciones aquí..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* Completed summary */}
            {isCompleted && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 space-y-3">
                    <div className="flex items-center gap-2 text-green-700 font-bold">
                        <CheckCircle className="w-5 h-5" />
                        Visita Completada
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-green-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resultado</p>
                        <p className="text-gray-900 font-medium">{visit.outcome || 'Sin resultado registrado'}</p>
                    </div>
                    {visit.notes && (
                        <div className="bg-white p-3 rounded-lg border border-green-100">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Comentarios</p>
                            <p className="text-gray-700 italic">"{visit.notes}"</p>
                        </div>
                    )}
                </div>
            )}

            {/* Error message */}
            {errorMsg && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {errorMsg}
                </div>
            )}

            {/* Action buttons */}
            {isPending && (
                <button
                    onClick={handleStart}
                    disabled={loading}
                    className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-700 flex items-center justify-center shadow-lg active:scale-95 transition disabled:opacity-60"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Obteniendo ubicación...
                        </span>
                    ) : (
                        <>
                            <Play className="w-6 h-6 mr-2 fill-current" />
                            Iniciar Visita
                        </>
                    )}
                </button>
            )}

            {isInProgress && (
                <button
                    onClick={handleFinish}
                    disabled={loading || !outcome}
                    className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 flex items-center justify-center shadow-lg active:scale-95 transition disabled:opacity-50"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Finalizando...
                        </span>
                    ) : (
                        <>
                            <CheckCircle className="w-6 h-6 mr-2" />
                            Finalizar Visita
                            {!outcome && <span className="ml-2 text-sm opacity-70">(elige resultado)</span>}
                        </>
                    )}
                </button>
            )}
        </div>
    );
}

export default function VisitExecution() {
    return (
        <ErrorBoundary>
            <VisitExecutionContent />
        </ErrorBoundary>
    );
}
