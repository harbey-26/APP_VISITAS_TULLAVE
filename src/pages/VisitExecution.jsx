import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, Clock, Play, CheckCircle, ArrowLeft, User, Phone, AlertCircle, Camera, Trash2, ImageIcon } from 'lucide-react';
import { API_URL } from '../config';
import { STATUS_CONFIG } from '../utils/visitTypes';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { MAP_STYLE } from '../utils/mapStyles';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-64 gap-4 p-8 text-center">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 mb-1">Ocurrió un error inesperado</h2>
                        <p className="text-sm text-gray-500">Regresa a la agenda e intenta de nuevo. Si el problema persiste, contacta al administrador.</p>
                    </div>
                    <button
                        onClick={() => window.location.href = '/agenda'}
                        className="text-sm text-brand-600 font-medium hover:underline flex items-center gap-1"
                    >
                        ← Volver a Agenda
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function VisitExecutionContent() {
    const { id } = useParams();
    const { token } = useAuth();
    const navigate = useNavigate();
    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });
    const [visit, setVisit] = useState(null);
    const [fetchError, setFetchError] = useState(null); // M3
    const [elapsed, setElapsed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [currentPos, setCurrentPos] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [outcome, setOutcome] = useState('');
    const [showFinishModal, setShowFinishModal] = useState(false);

    // M1: Fotos de visita
    const [images, setImages] = useState([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef(null);

    const fetchImages = async () => {
        try {
            const res = await fetch(`${API_URL}/api/visits/${id}/images`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setImages(await res.json());
        } catch (_) { /* silencioso */ }
    };

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
                        // Inicializar elapsed desde el servidor para que sea correcto al cargar o volver de otra pestaña
                        if (v.status === 'IN_PROGRESS' && v.actualStart) {
                            setElapsed(Math.floor((Date.now() - new Date(v.actualStart).getTime()) / 1000));
                        }
                        if (v.property?.lat && v.property?.lng) {
                            setCurrentPos({ lat: v.property.lat, lng: v.property.lng });
                        } else {
                            setCurrentPos({ lat: 4.6097, lng: -74.0817 });
                        }
                    } else {
                        // M3: Visita no encontrada — mostrar error en lugar de spinner infinito
                        setFetchError('Visita no encontrada. Puede haber sido eliminada.');
                    }
                } else {
                    setFetchError('No se pudo cargar la visita. Intenta de nuevo.');
                }
            } catch (error) {
                setFetchError('Sin conexión. Verifica tu internet.');
            }
        };
        fetchVisit();
        fetchImages();
    }, [id, token]);

    // Timer — calcula siempre desde actualStart del servidor
    useEffect(() => {
        let interval;
        if (visit?.status === 'IN_PROGRESS' && visit.actualStart) {
            const startTime = new Date(visit.actualStart).getTime();
            const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
            interval = setInterval(tick, 1000);
            // Recalcular inmediatamente al volver de otra pestaña (los intervalos se pausan en background)
            const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
            document.addEventListener('visibilitychange', onVisible);
            return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
        }
        return () => clearInterval(interval);
    }, [visit]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Progreso en porcentaje (elapsed vs estimatedDuration en segundos)
    const progressPercent = visit?.estimatedDuration
        ? Math.min(100, Math.round((elapsed / (visit.estimatedDuration * 60)) * 100))
        : 0;

    // Color de la barra según progreso
    const progressColor = progressPercent >= 100
        ? 'bg-red-500'
        : progressPercent >= 80
            ? 'bg-yellow-500'
            : 'bg-green-500';

    const getCurrentLocation = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) reject(new Error('Geolocalización no soportada'));
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    };

    const handleStart = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const { lat, lng } = await getCurrentLocation();
            const res = await fetch(`${API_URL}/api/visits/${id}/start`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            });
            if (res.ok) {
                const updated = await res.json();
                // Preserve property data (startVisit response doesn't include it)
                setVisit(prev => ({ ...updated, property: prev.property }));
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

    // M1: Manejar selección de foto
    const handlePhotoSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setUploadingPhoto(true);
        setErrorMsg(null);
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await fetch(`${API_URL}/api/visits/${id}/images`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ data: base64 })
            });
            if (res.ok) {
                await fetchImages();
            } else {
                const err = await res.json();
                setErrorMsg(err.error || 'Error al subir imagen');
            }
        } catch (_) {
            setErrorMsg('No se pudo subir la imagen. Intenta de nuevo.');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleDeleteImage = async (imageId) => {
        try {
            const res = await fetch(`${API_URL}/api/visits/${id}/images/${imageId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setImages(prev => prev.filter(img => img.id !== imageId));
        } catch (_) { /* silencioso */ }
    };

    const safeFormatTime = (dateString) => {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Hora inválida';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Hora inválida';
        }
    };

    // M3: Mostrar error si la visita no existe o falló la carga
    if (fetchError) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 p-6">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <p className="text-gray-700 font-semibold text-center">{fetchError}</p>
            <button
                onClick={() => navigate('/agenda')}
                className="flex items-center gap-2 text-brand-600 font-medium hover:underline text-sm"
            >
                <ArrowLeft className="w-4 h-4" /> Volver a Agenda
            </button>
        </div>
    );

    if (!visit) return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Cargando visita...</p>
        </div>
    );

    return (
        <div className="flex flex-col gap-4 max-w-lg mx-auto">
            {/* Header card */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <button
                    onClick={() => navigate('/agenda')}
                    className="flex items-center text-gray-400 hover:text-brand-600 mb-4 transition-colors text-sm font-medium"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Regresar a Agenda
                </button>

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {visit.property?.address || 'Dirección desconocida'}
                </h2>
                {STATUS_CONFIG[visit.status] && (
                    <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold mb-3 ${STATUS_CONFIG[visit.status].bg} ${STATUS_CONFIG[visit.status].text}`}>
                        {STATUS_CONFIG[visit.status].label}
                    </span>
                )}
                <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-4">
                    <Clock className="w-4 h-4" />
                    <span>Programada: {safeFormatTime(visit.scheduledStart)}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span>{visit.estimatedDuration} min estimados</span>
                </div>

                {/* Info del cliente */}
                {(visit.clientName || visit.clientPhone) && (
                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex flex-col sm:flex-row gap-3">
                        {visit.clientName && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                    <User className="w-4 h-4 text-brand-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Cliente</p>
                                    <p className="font-semibold">{visit.clientName}</p>
                                </div>
                            </div>
                        )}
                        {visit.clientPhone && (
                            <a
                                href={`tel:${visit.clientPhone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 text-sm text-gray-700 hover:text-brand-600 transition sm:ml-auto"
                            >
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <Phone className="w-4 h-4 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Teléfono</p>
                                    <p className="font-semibold">{visit.clientPhone}</p>
                                </div>
                            </a>
                        )}
                    </div>
                )}

                {/* Timer */}
                <div className="mt-4 text-center">
                    {visit.status === 'COMPLETED' ? (
                        <div className="text-3xl font-bold text-green-600 tracking-wide">
                            Finalizada
                        </div>
                    ) : (
                        <div className={`text-5xl font-mono font-bold tracking-wider ${
                            visit.status === 'IN_PROGRESS' && progressPercent >= 100
                                ? 'text-red-500'
                                : visit.status === 'IN_PROGRESS' && progressPercent >= 80
                                    ? 'text-yellow-500'
                                    : 'text-gray-800'
                        }`}>
                            {visit.status === 'IN_PROGRESS' ? formatTime(elapsed) : '00:00:00'}
                        </div>
                    )}

                    {/* Barra de progreso — solo en curso */}
                    {visit.status === 'IN_PROGRESS' && (
                        <div className="mt-3 px-2">
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className={`h-2.5 rounded-full transition-all duration-1000 ${progressColor}`}
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>0 min</span>
                                <span className={progressPercent >= 100 ? 'text-red-500 font-semibold' : ''}>
                                    {progressPercent >= 100
                                        ? `+${Math.round((elapsed - visit.estimatedDuration * 60) / 60)} min extra`
                                        : `${visit.estimatedDuration} min`}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mapa */}
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                <div className="h-52 relative z-0">
                    {currentPos ? (
                        isLoaded ? (
                            <GoogleMap
                                mapContainerStyle={{ height: '100%', width: '100%' }}
                                center={currentPos}
                                zoom={15}
                                options={{ styles: MAP_STYLE, disableDefaultUI: true, zoomControl: true }}
                            >
                                {/* Marker: propiedad geocodificada */}
                                {visit.property?.lat && visit.property?.lng && (
                                    <Marker
                                        position={{ lat: visit.property.lat, lng: visit.property.lng }}
                                        title={`Inmueble: ${visit.property.address}`}
                                    />
                                )}
                                {/* Marker: check-in del agente */}
                                {visit.checkInLat && visit.checkInLng && (
                                    <Marker
                                        position={{ lat: visit.checkInLat, lng: visit.checkInLng }}
                                        title="Inicio de visita"
                                    />
                                )}
                                {/* Marker: check-out del agente */}
                                {visit.checkOutLat && visit.checkOutLng && (
                                    <Marker
                                        position={{ lat: visit.checkOutLat, lng: visit.checkOutLng }}
                                        title="Fin de visita"
                                    />
                                )}
                            </GoogleMap>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                                <MapPin className="w-6 h-6" />
                                <span className="text-sm">Cargando mapa...</span>
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                            <MapPin className="w-6 h-6" />
                            <span className="text-sm">Ubicación no disponible</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Resultado y comentarios — solo en progreso */}
            {visit.status === 'IN_PROGRESS' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Resultado de la Visita <span className="text-red-400">*</span>
                        </label>
                        <select
                            className="w-full p-3 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                        >
                            <option value="">Seleccionar resultado...</option>
                            <option value="Cliente interesado">Cliente interesado</option>
                            <option value="Cliente no interesado">Cliente no interesado</option>
                            <option value="Requiere seguimiento">Requiere seguimiento</option>
                            <option value="Cliente no asistió">Cliente no asistió</option>
                            <option value="Cancelada">Cancelada</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Comentarios</label>
                        <textarea
                            className="w-full p-3 border border-gray-200 rounded-xl h-28 resize-none focus:ring-2 focus:ring-brand-500 focus:outline-none text-sm"
                            placeholder="Observaciones, detalles de la visita..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {/* Resultado si completada */}
            {visit.status === 'COMPLETED' && (
                <div className="bg-green-50 rounded-2xl p-4 border border-green-100 space-y-3">
                    <div className="text-center text-green-600 font-bold flex items-center justify-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Visita Completada
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-green-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resultado</p>
                        <p className="text-gray-900 font-medium">{visit.outcome || 'Sin resultado registrado'}</p>
                    </div>
                    {visit.notes && (
                        <div className="bg-white p-3 rounded-xl border border-green-100">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Comentarios</p>
                            <p className="text-gray-600 italic text-sm">"{visit.notes}"</p>
                        </div>
                    )}
                </div>
            )}

            {/* M1: Sección de fotos — disponible en progreso y completada */}
            {(visit.status === 'IN_PROGRESS' || visit.status === 'COMPLETED') && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-semibold text-gray-700">
                                Fotos ({images.length})
                            </span>
                        </div>
                        {visit.status === 'IN_PROGRESS' && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingPhoto}
                                className="flex items-center gap-1.5 text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 transition disabled:opacity-60"
                            >
                                {uploadingPhoto ? (
                                    <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Camera className="w-3.5 h-3.5" />
                                )}
                                {uploadingPhoto ? 'Subiendo...' : 'Tomar foto'}
                            </button>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handlePhotoSelect}
                        />
                    </div>
                    {images.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No hay fotos aún.</p>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {images.map(img => (
                                <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-gray-100">
                                    <img
                                        src={img.url}
                                        alt="Foto de visita"
                                        className="w-full h-full object-cover"
                                    />
                                    {visit.status === 'IN_PROGRESS' && (
                                        <button
                                            onClick={() => handleDeleteImage(img.id)}
                                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Error message */}
            {errorMsg && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 flex items-start gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Action buttons */}
            {visit.status === 'PENDING' && (
                <button
                    onClick={handleStart}
                    disabled={loading}
                    className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-700 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition disabled:opacity-60"
                >
                    {loading ? (
                        <div className="w-6 h-6 border-3 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Play className="w-6 h-6" />
                    )}
                    {loading ? 'Obteniendo ubicación...' : 'Iniciar Visita'}
                </button>
            )}

            {visit.status === 'IN_PROGRESS' && (
                <button
                    onClick={() => setShowFinishModal(true)}
                    disabled={loading}
                    className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition disabled:opacity-60"
                >
                    {loading ? (
                        <div className="w-6 h-6 border-3 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <CheckCircle className="w-6 h-6" />
                    )}
                    {loading ? 'Guardando...' : 'Finalizar Visita'}
                </button>
            )}
            {showFinishModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">Finalizar Visita</h3>
                        <p className="text-gray-500 mb-5 text-sm text-center">¿Confirmas que deseas finalizar la visita? Esta acción no se puede deshacer.</p>
                        {outcome && (
                            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Resultado registrado</p>
                                <p className="text-gray-800 font-medium">{outcome}</p>
                            </div>
                        )}
                        <div className="flex space-x-3">
                            <button
                                onClick={() => setShowFinishModal(false)}
                                className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => { setShowFinishModal(false); handleFinish(); }}
                                disabled={loading}
                                className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition disabled:opacity-70"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
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
