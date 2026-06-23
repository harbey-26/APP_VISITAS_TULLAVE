import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, Clock, Play, CheckCircle, ArrowLeft, User, Phone, AlertCircle, Camera, Trash2, ImageIcon, MessageCircle, Mail } from 'lucide-react';
import { API_URL } from '../config';
import { STATUS_CONFIG, VISIT_TYPE_CONFIG, MODALITY_CONFIG, getLateStartMinutes } from '../utils/visitTypes';
import { visitMarkerIcon, dotIcon } from '../utils/mapMarkers';
import { compressImage } from '../utils/imageCompress';
import { buildWhatsAppUrl, buildConfirmationMessage } from '../utils/phone';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { MAP_STYLE } from '../utils/mapStyles';
import { MAPS_LOADER_OPTIONS } from '../utils/mapsLoader';
import { Button, Modal, Select } from '../components/ui';

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
    const { token, user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const navigate = useNavigate();
    const { isLoaded } = useJsApiLoader(MAPS_LOADER_OPTIONS);
    const [visit, setVisit] = useState(null);
    const [fetchError, setFetchError] = useState(null); // M3
    const [elapsed, setElapsed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [currentPos, setCurrentPos] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [outcome, setOutcome] = useState('');
    const [showFinishModal, setShowFinishModal] = useState(false);
    const [showCallModal, setShowCallModal] = useState(false);

    // Captación por llamada: sin GPS, sin geofencing; se registra en un solo paso.
    const isPhone = visit?.modality === 'PHONE';

    // #4: No perder datos — borrador local de resultado+comentarios y reintento al recuperar señal
    const DRAFT_KEY = `visit_draft_${id}`;
    const [pendingRetry, setPendingRetry] = useState(false);
    const draftLoadedRef = useRef(false);

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
                        // El borrador local (ediciones recientes sin guardar) tiene prioridad sobre el servidor
                        if (v.notes && !draftLoadedRef.current) setNotes(v.notes);
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

    // #4: Cargar borrador local al montar (sobrevive recargas/cierres de la app)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const draft = JSON.parse(raw);
                draftLoadedRef.current = true;
                if (draft.notes) setNotes(draft.notes);
                if (draft.outcome) setOutcome(draft.outcome);
            }
        } catch { /* json corrupto — ignorar */ }
    }, [DRAFT_KEY]);

    // #4: Guardar borrador en cada cambio mientras la visita está en curso
    useEffect(() => {
        if (visit?.status !== 'IN_PROGRESS') return;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ notes, outcome }));
        } catch { /* almacenamiento lleno — ignorar */ }
    }, [notes, outcome, visit?.status, DRAFT_KEY]);

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

        // El GPS puede fallar aparte de la red — distinguir para no reintentar en vano
        let coords;
        try {
            coords = await getCurrentLocation();
        } catch {
            setErrorMsg('No se pudo obtener tu ubicación. Verifica el GPS e intenta de nuevo.');
            setLoading(false);
            return;
        }

        let res;
        try {
            res = await fetch(`${API_URL}/api/visits/${id}/finish`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat: coords.lat, lng: coords.lng, notes, outcome })
            });
        } catch {
            // #4: Fallo de red — el borrador ya está guardado; reintentar al recuperar conexión
            setPendingRetry(true);
            setErrorMsg(null);
            setLoading(false);
            return;
        }

        if (res.ok) {
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
            setPendingRetry(false);
            setVisit(await res.json());
            navigate('/agenda');
        } else {
            let msg = 'Error desconocido al finalizar visita';
            try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
            setErrorMsg(msg);
            setLoading(false);
        }
    };

    // Registrar una visita por llamada (modalidad PHONE): un solo paso PENDING→COMPLETED,
    // sin pedir ubicación ni geofencing. Captura resultado y comentarios.
    const handleCompleteCall = async () => {
        if (!outcome) {
            setErrorMsg('Debes seleccionar un resultado para registrar la llamada.');
            return;
        }
        setLoading(true);
        setErrorMsg(null);
        let res;
        try {
            res = await fetch(`${API_URL}/api/visits/${id}/complete-call`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ notes, outcome })
            });
        } catch {
            setErrorMsg('Sin conexión. Intenta de nuevo cuando recuperes internet.');
            setLoading(false);
            return;
        }
        if (res.ok) {
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
            setVisit(await res.json());
            navigate('/agenda');
        } else {
            let msg = 'Error al registrar la llamada';
            try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
            setErrorMsg(msg);
            setLoading(false);
        }
    };

    // Marcar la cita como confirmada al escribirle al cliente por WhatsApp.
    // Fire-and-forget: el enlace abre igual aunque la petición falle.
    const handleConfirmAppointment = async () => {
        try {
            const res = await fetch(`${API_URL}/api/visits/${id}/confirm`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setVisit(prev => ({ ...prev, confirmedAt: new Date().toISOString() }));
        } catch {
            // silencioso
        }
    };

    // #4: Reintentar el envío automáticamente cuando vuelva la conexión
    const handleFinishRef = useRef();
    handleFinishRef.current = handleFinish;
    useEffect(() => {
        if (!pendingRetry) return;
        const onOnline = () => handleFinishRef.current?.();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [pendingRetry]);

    // M1: Manejar selección de foto
    const handlePhotoSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setUploadingPhoto(true);
        setErrorMsg(null);
        try {
            // Comprimir antes de subir (con respaldo al original si falla)
            const base64 = await compressImage(file);

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

    // #2: minutos de retraso del inicio real frente a lo programado (null si a tiempo)
    const lateMinutes = getLateStartMinutes(visit);

    // #1: duración real de la visita (check-in → check-out) en minutos
    const realDurationMin = visit?.actualStart && visit?.actualEnd
        ? Math.max(1, Math.round((new Date(visit.actualEnd).getTime() - new Date(visit.actualStart).getTime()) / 60000))
        : null;

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
            <div className="bg-white p-5 rounded-2xl shadow-card border border-gray-100">
                <button
                    onClick={() => navigate('/agenda')}
                    className="inline-flex items-center gap-1.5 mb-4 px-3 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 active:scale-95 transition-all text-sm font-semibold"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Regresar a Agenda
                </button>

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {visit.property?.address || 'Dirección desconocida'}
                </h2>
                {visit.property?.client && visit.property.client !== 'Cliente General' && (
                    <p className="flex items-center gap-1.5 text-gray-600 font-medium mb-2 -mt-1">
                        <MapPin className="w-4 h-4 text-brand-400 flex-shrink-0" />
                        {visit.property.client}
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {STATUS_CONFIG[visit.status] && (
                        <span className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_CONFIG[visit.status].bg} ${STATUS_CONFIG[visit.status].text}`}>
                            {STATUS_CONFIG[visit.status].label}
                        </span>
                    )}
                    {isPhone && (
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${MODALITY_CONFIG.PHONE.bg} ${MODALITY_CONFIG.PHONE.text}`}>
                            <Phone className="w-3.5 h-3.5" />
                            {MODALITY_CONFIG.PHONE.label}
                        </span>
                    )}
                    {/* #2: aviso de inicio tardío respecto a lo programado */}
                    {lateMinutes != null && (
                        <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-800">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Inició {lateMinutes} min tarde
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-4">
                    <Clock className="w-4 h-4" />
                    <span>Programada: {safeFormatTime(visit.scheduledStart)}</span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span>{visit.estimatedDuration} min estimados</span>
                </div>

                {/* Info del cliente */}
                {(visit.clientName || visit.clientPhone || visit.clientEmail) && (
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
                            <div className="flex items-center gap-2 sm:ml-auto">
                                <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                        <Phone className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">Teléfono</p>
                                        <p className="font-semibold">{visit.clientPhone}</p>
                                        {visit.confirmedAt && (
                                            <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-semibold text-emerald-600">
                                                <CheckCircle className="w-3 h-3" />
                                                Cita confirmada
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 ml-1">
                                    <a
                                        href={`tel:${visit.clientPhone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Llamar"
                                        title="Llamar"
                                        className="w-9 h-9 rounded-full bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center transition active:scale-95"
                                    >
                                        <Phone className="w-4 h-4" />
                                    </a>
                                    <a
                                        href={buildWhatsAppUrl(visit.clientPhone, buildConfirmationMessage(visit, visit.user?.name || user?.name, visit.user?.phone))}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => { e.stopPropagation(); handleConfirmAppointment(); }}
                                        aria-label="Confirmar cita por WhatsApp"
                                        title="Confirmar cita por WhatsApp"
                                        className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition active:scale-95"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </a>
                                </div>
                            </div>
                        )}
                        {visit.clientEmail && (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <Mail className="w-4 h-4 text-blue-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-gray-400">Correo</p>
                                    <a
                                        href={`mailto:${visit.clientEmail}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-semibold text-brand-600 hover:underline break-all"
                                    >
                                        {visit.clientEmail}
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Nota del agendamiento — visible antes de iniciar (cuando ya está
                    en curso, el texto se edita en el campo de Comentarios). */}
                {visit.status === 'PENDING' && !isPhone && visit.notes && (
                    <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Nota del agendamiento</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{visit.notes}</p>
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

            {/* Mapa — solo para visitas presenciales (las de llamada no tienen ubicación) */}
            {!isPhone && (
            <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-card">
                <div className="h-52 relative z-0">
                    {currentPos ? (
                        isLoaded ? (
                            <GoogleMap
                                mapContainerStyle={{ height: '100%', width: '100%' }}
                                center={currentPos}
                                zoom={15}
                                options={{ styles: MAP_STYLE, disableDefaultUI: true, zoomControl: true }}
                            >
                                {/* Marker: inmueble — pin con el color del tipo de visita */}
                                {visit.property?.lat && visit.property?.lng && (
                                    <Marker
                                        position={{ lat: visit.property.lat, lng: visit.property.lng }}
                                        title={`Inmueble: ${visit.property.address}`}
                                        zIndex={10}
                                        icon={visitMarkerIcon(window.google, {
                                            color: (VISIT_TYPE_CONFIG[visit.type] || VISIT_TYPE_CONFIG.OTHER).barColor,
                                            status: visit.status,
                                        })}
                                    />
                                )}
                                {/* Marker: check-in del agente (punto verde) */}
                                {visit.checkInLat && visit.checkInLng && (
                                    <Marker
                                        position={{ lat: visit.checkInLat, lng: visit.checkInLng }}
                                        title="Inicio de visita"
                                        icon={dotIcon(window.google, '#22c55e')}
                                    />
                                )}
                                {/* Marker: check-out del agente (punto azul) */}
                                {visit.checkOutLat && visit.checkOutLng && (
                                    <Marker
                                        position={{ lat: visit.checkOutLat, lng: visit.checkOutLng }}
                                        title="Fin de visita"
                                        icon={dotIcon(window.google, '#3b82f6')}
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
            )}

            {/* Resultado y comentarios — en progreso (presencial) o pendiente (por llamada) */}
            {(visit.status === 'IN_PROGRESS' || (visit.status === 'PENDING' && isPhone)) && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            {isPhone ? 'Resultado de la llamada' : 'Resultado de la Visita'} <span className="text-red-400">*</span>
                        </label>
                        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                            <option value="">Seleccionar resultado...</option>
                            <option value="Cliente interesado">Cliente interesado</option>
                            <option value="Cliente no interesado">Cliente no interesado</option>
                            <option value="Requiere seguimiento">Requiere seguimiento</option>
                            <option value="Cliente no asistió">Cliente no asistió</option>
                            <option value="Cancelada">Cancelada</option>
                        </Select>
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
                    {/* #1: horas reales de la visita — útiles para el administrador */}
                    <div className="bg-white p-3 rounded-xl border border-green-100 grid grid-cols-3 gap-2 text-center">
                        <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Inicio</p>
                            <p className="text-gray-900 font-bold text-sm tabular-nums">{visit.actualStart ? safeFormatTime(visit.actualStart) : '—'}</p>
                        </div>
                        <div className="border-x border-gray-100">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Terminación</p>
                            <p className="text-gray-900 font-bold text-sm tabular-nums">{visit.actualEnd ? safeFormatTime(visit.actualEnd) : '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Duración</p>
                            <p className="text-gray-900 font-bold text-sm tabular-nums">{realDurationMin != null ? `${realDurationMin} min` : '—'}</p>
                        </div>
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
                <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-semibold text-gray-700">
                                Fotos ({images.length})
                            </span>
                        </div>
                        {visit.status === 'IN_PROGRESS' && (
                            <Button
                                size="sm"
                                icon={Camera}
                                loading={uploadingPhoto}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {uploadingPhoto ? 'Subiendo...' : 'Tomar foto'}
                            </Button>
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

            {/* #4: Reintento pendiente por falta de conexión — el reporte no se perdió */}
            {pendingRetry && (
                <div className="bg-amber-50 text-amber-700 p-4 rounded-xl border border-amber-200 flex items-start gap-3 text-sm">
                    <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <span>Sin conexión. Tu reporte quedó guardado y se enviará automáticamente al recuperar internet. También puedes reintentar manualmente.</span>
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
            {visit.status === 'PENDING' && !isPhone && (
                <button
                    onClick={handleStart}
                    disabled={loading}
                    className="w-full text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #e31c25 0%, #b91c1c 100%)', boxShadow: '0 8px 24px rgba(227,28,37,0.35)' }}
                >
                    {loading ? (
                        <div className="w-6 h-6 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Play className="w-6 h-6" />
                    )}
                    {loading ? 'Obteniendo ubicación...' : 'Iniciar Visita'}
                </button>
            )}

            {/* Visita por llamada: registro en un solo paso, sin GPS */}
            {visit.status === 'PENDING' && isPhone && (
                <button
                    onClick={() => { if (!outcome) { setErrorMsg('Debes seleccionar un resultado para registrar la llamada.'); return; } setShowCallModal(true); }}
                    disabled={loading}
                    className="w-full text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
                >
                    {loading ? (
                        <div className="w-6 h-6 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Phone className="w-6 h-6" />
                    )}
                    {loading ? 'Guardando...' : 'Registrar llamada'}
                </button>
            )}

            {visit.status === 'IN_PROGRESS' && (
                <button
                    onClick={() => setShowFinishModal(true)}
                    disabled={loading}
                    className="w-full text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', boxShadow: '0 8px 24px rgba(22,163,74,0.35)' }}
                >
                    {loading ? (
                        <div className="w-6 h-6 border-[3px] border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                        <CheckCircle className="w-6 h-6" />
                    )}
                    {loading ? 'Guardando...' : pendingRetry ? 'Reintentar envío' : 'Finalizar Visita'}
                </button>
            )}
            <Modal open={showFinishModal} onClose={() => setShowFinishModal(false)} maxWidth="max-w-sm">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">Finalizar Visita</h3>
                <p className="text-gray-500 mb-5 text-sm text-center">¿Confirmas que deseas finalizar la visita? Esta acción no se puede deshacer.</p>
                {isAdmin && (
                    <p className="text-xs text-brand-600 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 mb-4 text-center font-medium">
                        Como administrador puedes finalizar sin estar en la ubicación del inmueble.
                    </p>
                )}
                {outcome && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Resultado registrado</p>
                        <p className="text-gray-800 font-medium">{outcome}</p>
                    </div>
                )}
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowFinishModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="success" className="flex-1" loading={loading} onClick={() => { setShowFinishModal(false); handleFinish(); }}>
                        Confirmar
                    </Button>
                </div>
            </Modal>

            <Modal open={showCallModal} onClose={() => setShowCallModal(false)} maxWidth="max-w-sm">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Phone className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">Registrar llamada</h3>
                <p className="text-gray-500 mb-5 text-sm text-center">Esta captación se registrará como realizada por llamada (sin ubicación). Esta acción no se puede deshacer.</p>
                {outcome && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Resultado registrado</p>
                        <p className="text-gray-800 font-medium">{outcome}</p>
                    </div>
                )}
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowCallModal(false)}>
                        Cancelar
                    </Button>
                    <Button variant="success" className="flex-1" loading={loading} onClick={() => { setShowCallModal(false); handleCompleteCall(); }}>
                        Confirmar
                    </Button>
                </div>
            </Modal>
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
