import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapPin, Clock, Play, Square, CheckCircle } from 'lucide-react';
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
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-800 rounded-xl">
                    <h2 className="text-xl font-bold mb-4">Algo salió mal.</h2>
                    <pre className="text-xs bg-white p-4 rounded border overflow-auto">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.error && this.state.error.stack}
                    </pre>
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
    const [visit, setVisit] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [notes, setNotes] = useState('');
    const [currentPos, setCurrentPos] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    // Fetch visit details
    useEffect(() => {
        const fetchVisit = async () => {
            try {
                const res = await fetch(`/api/visits?id=${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const visits = await res.json();
                    console.log('Visits fetched:', visits);
                    const v = visits.find(v => v.id === parseInt(id));
                    console.log('Target visit:', v);

                    if (v) {
                        setVisit(v);
                        if (v.notes) setNotes(v.notes);

                        // Set initial position if available or default to Bogota
                        if (v.checkInLat && v.checkInLng) {
                            setCurrentPos([v.checkInLat, v.checkInLng]);
                        } else if (v.property?.lat && v.property?.lng) {
                            setCurrentPos([v.property.lat, v.property.lng]);
                        } else {
                            setCurrentPos([4.6097, -74.0817]); // Default Bogota
                        }
                    } else {
                        console.error('Visit not found in filtered list');
                    }
                }
            } catch (error) {
                console.error(error);
            }
        };
        fetchVisit();
    }, [id, token]);

    // Timer logic
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

    const getCurrentLocation = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) reject(new Error('Geolocalización no soportada'));
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    console.log(`Ubicación obtenida con precisión de ${pos.coords.accuracy} metros.`);
                    resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => reject(err),
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    };

    const handleStart = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const { lat, lng } = await getCurrentLocation();
            setCurrentPos([lat, lng]);

            const res = await fetch(`/api/visits/${id}/start`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ lat, lng })
            });

            if (res.ok) {
                const updated = await res.json();
                setVisit(updated);
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
        setLoading(true);
        setErrorMsg(null);
        try {
            const { lat, lng } = await getCurrentLocation();

            const res = await fetch(`/api/visits/${id}/finish`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ lat, lng, notes })
            });

            if (res.ok) {
                const updated = await res.json();
                setVisit(updated);
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

    // Safe date formatter
    const safeFormatTime = (dateString) => {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Hora inválida';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Hora inválida';
        }
    };

    if (!visit) return <div className="p-4 text-center mt-10">Cargando información de la visita...</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-140px)]">
            <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 flex-none">
                <h2 className="text-2xl font-bold mb-2">{visit.property?.address}</h2>
                <div className="flex items-center text-gray-500 mb-4">
                    <Clock className="w-5 h-5 mr-2" />
                    <span>Programada: {safeFormatTime(visit.scheduledStart)}</span>
                </div>

                <div className="flex justify-center py-6">
                    <div className="text-5xl font-mono font-bold tracking-wider text-gray-800">
                        {visit.status === 'IN_PROGRESS' ? formatTime(elapsed) :
                            visit.status === 'COMPLETED' ? 'Terminada' : '00:00:00'}
                    </div>
                </div>
            </div>

            <div className="flex-1 space-y-4 flex flex-col">
                {/* Map View */}
                <div className="bg-gray-200 rounded-xl overflow-hidden h-48 w-full relative z-0">
                    {currentPos && currentPos[0] && currentPos[1] ? (
                        <MapContainer center={currentPos} zoom={15} style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            />
                            <Marker position={currentPos}>
                                <Popup>
                                    {visit.property?.address}
                                </Popup>
                            </Marker>
                            {visit.checkInLat && (
                                <Marker position={[visit.checkInLat, visit.checkInLng]}>
                                    <Popup>Inicio de Visita</Popup>
                                </Marker>
                            )}
                        </MapContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            Loading map or location unavailable...
                        </div>
                    )}
                </div>

                {visit.status === 'IN_PROGRESS' && (
                    <textarea
                        className="w-full p-3 border rounded-xl h-32 resize-none focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        placeholder="Agregar notas de la visita..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                )}
            </div>

            <div className="mt-6 flex-none space-y-4">
                {errorMsg && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 text-center text-sm font-medium">
                        {errorMsg}
                    </div>
                )}

                {visit.status === 'PENDING' && (
                    <button
                        onClick={handleStart}
                        disabled={loading}
                        className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-700 flex items-center justify-center shadow-lg transform active:scale-95 transition"
                    >
                        <Play className="w-6 h-6 mr-2" />
                        Iniciar Visita
                    </button>
                )}

                {visit.status === 'IN_PROGRESS' && (
                    <button
                        onClick={handleFinish}
                        disabled={loading}
                        className="w-full bg-red-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-red-600 flex items-center justify-center shadow-lg transform active:scale-95 transition"
                    >
                        <Square className="w-6 h-6 mr-2 fill-current" />
                        Finalizar Visita
                    </button>
                )}

                {visit.status === 'COMPLETED' && (
                    <div className="text-center text-green-600 font-bold flex items-center justify-center p-4 bg-green-50 rounded-xl">
                        <CheckCircle className="w-6 h-6 mr-2" />
                        Visita Completada
                    </div>
                )}
            </div>
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
