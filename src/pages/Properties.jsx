import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { Plus, Pencil, Trash2, MapPin, X, Building } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { friendlyError } from '../utils/api';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { MAP_STYLE } from '../utils/mapStyles';
import { MAPS_LOADER_OPTIONS } from '../utils/mapsLoader';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { Card, Button, PageHeader, EmptyState, Skeleton } from '../components/ui';

const BOGOTA = { lat: 4.6097, lng: -74.0817 };

export default function Properties() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true); // M1
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showMap, setShowMap] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        id: null,
        address: '',
        client: '',
        lat: '',
        lng: ''
    });

    // Delete State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    const { token } = useAuth();
    const toast = useToast();

    const { isLoaded } = useJsApiLoader(MAPS_LOADER_OPTIONS);

    const fetchProperties = async () => {
        setLoading(true); // M1
        try {
            const res = await fetch(`${API_URL}/api/properties`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProperties(await res.json());
            }
        } catch (error) {
            console.error('Error fetching properties:', error);
        } finally {
            setLoading(false); // M1
        }
    };

    useEffect(() => {
        fetchProperties();
    }, [token]);

    const handleOpenCreate = () => {
        setFormData({ id: null, address: '', client: '', lat: '', lng: '' });
        setIsEditing(false);
        setShowMap(false);
        setShowModal(true);
    };

    const handleOpenEdit = (prop) => {
        setFormData({
            id: prop.id,
            address: prop.address,
            client: prop.client || '',
            lat: prop.lat || '',
            lng: prop.lng || ''
        });
        setIsEditing(true);
        setShowMap(false);
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const endpoint = isEditing ? `${API_URL}/api/properties/${formData.id}` : `${API_URL}/api/properties`;
            const method = isEditing ? 'PUT' : 'POST';

            const payload = {
                address: formData.address,
                client: formData.client,
            };

            // Only send explicit coords if user typed them (rare case), otherwise standard logic applies
            // But if editing, we might want to keep existing ones unless address changed
            if (formData.lat) payload.lat = parseFloat(formData.lat);
            if (formData.lng) payload.lng = parseFloat(formData.lng);

            const res = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowModal(false);
                fetchProperties();
                toast.success(isEditing ? 'Inmueble actualizado' : 'Inmueble registrado correctamente');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al guardar');
            }
        } catch (error) {
            toast.error(friendlyError(error)); // M2
        }
    };

    const confirmDelete = async () => {
        try {
            const res = await fetch(`${API_URL}/api/properties/${deleteTargetId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setShowDeleteModal(false);
                fetchProperties();
                toast.success('Inmueble eliminado');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al eliminar');
            }
        } catch (error) {
            toast.error(friendlyError(error)); // M2
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Gestión de Inmuebles" subtitle="Administra direcciones y clientes">
                <Button icon={Plus} onClick={handleOpenCreate} className="ml-auto md:ml-0">
                    Nuevo Inmueble
                </Button>
            </PageHeader>

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="divide-y divide-gray-100">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="px-6 py-4 flex items-center gap-4">
                                <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                                <Skeleton className="h-4 flex-1 max-w-xs" />
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-4 w-20" />
                            </div>
                        ))}
                    </div>
                ) : properties.length === 0 ? (
                    <EmptyState
                        icon={Building}
                        title="No hay inmuebles registrados"
                        description="Crea tu primer inmueble para empezar a programar visitas."
                        action={<Button icon={Plus} size="sm" onClick={handleOpenCreate}>Nuevo Inmueble</Button>}
                    />
                ) : (
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                <tr>
                                    <th className="px-6 py-4">Inmueble</th>
                                    <th className="px-6 py-4">Cliente / Propietario</th>
                                    <th className="px-6 py-4">Coordenadas</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {properties.map(prop => (
                                    <tr key={prop.id} className="hover:bg-gray-50 group transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
                                                    <Building className="w-5 h-5" />
                                                </div>
                                                <span className="font-medium text-gray-900">{prop.address}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">
                                            {prop.client || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                                            {prop.lat && prop.lng ? (
                                                <div className="flex items-center text-green-600 space-x-1">
                                                    <MapPin className="w-3 h-3" />
                                                    <span>{prop.lat.toFixed(5)}, {prop.lng.toFixed(5)}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">Sin ubicación</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleOpenEdit(prop)}
                                                    className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                                                    title="Editar"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => { setDeleteTargetId(prop.id); setShowDeleteModal(true); }}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl transform transition-all animate-slide-up">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                {isEditing ? 'Editar Inmueble' : 'Nuevo Inmueble'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition" aria-label="Cerrar">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Dirección</label>
                                <AddressAutocomplete
                                    isLoaded={isLoaded}
                                    value={formData.address}
                                    required
                                    placeholder="Ej. Calle 123 # 45-67"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none transition-all text-sm"
                                    onChange={({ address, lat, lng }) => setFormData(prev => ({
                                        ...prev,
                                        address,
                                        lat: lat != null ? lat : '',
                                        lng: lng != null ? lng : '',
                                    }))}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Elige una sugerencia para fijar la ubicación exacta, o ajústala abajo en el mapa.
                                </p>
                            </div>

                            {/* Selector de ubicación en mapa */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Ubicación en mapa</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowMap(v => !v)}
                                        className="text-xs text-brand-600 font-medium hover:underline"
                                    >
                                        {showMap ? 'Ocultar mapa' : 'Seleccionar en mapa'}
                                    </button>
                                </div>
                                {showMap && (
                                    <div className="rounded-xl overflow-hidden border border-gray-200 mb-1.5" style={{ height: '200px' }}>
                                        {isLoaded ? (
                                            <GoogleMap
                                                mapContainerStyle={{ height: '100%', width: '100%' }}
                                                options={{ styles: MAP_STYLE, disableDefaultUI: true, zoomControl: true }}
                                                center={
                                                    formData.lat && formData.lng
                                                        ? { lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) }
                                                        : BOGOTA
                                                }
                                                zoom={formData.lat && formData.lng ? 15 : 12}
                                                onClick={e => setFormData(prev => ({
                                                    ...prev,
                                                    lat: e.latLng.lat().toFixed(6),
                                                    lng: e.latLng.lng().toFixed(6)
                                                }))}
                                            >
                                                {formData.lat && formData.lng && (
                                                    <Marker
                                                        position={{ lat: parseFloat(formData.lat), lng: parseFloat(formData.lng) }}
                                                        draggable
                                                        onDragEnd={e => setFormData(prev => ({
                                                            ...prev,
                                                            lat: e.latLng.lat().toFixed(6),
                                                            lng: e.latLng.lng().toFixed(6)
                                                        }))}
                                                    />
                                                )}
                                            </GoogleMap>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                                                <div className="w-4 h-4 border-2 border-gray-300 border-t-brand-600 rounded-full animate-spin" />
                                                Cargando mapa...
                                            </div>
                                        )}
                                    </div>
                                )}
                                {formData.lat && formData.lng ? (
                                    <p className="text-xs text-green-600 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />
                                        {parseFloat(formData.lat).toFixed(5)}, {parseFloat(formData.lng).toFixed(5)}
                                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, lat: '', lng: '' }))} className="ml-1 text-gray-400 hover:text-red-500 transition">✕</button>
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400">Sin coordenadas — el servidor intentará geocodificar la dirección.</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Cliente / Propietario</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent focus:outline-none transition-all text-sm"
                                    placeholder="Nombre del cliente"
                                    value={formData.client}
                                    onChange={e => setFormData({ ...formData, client: e.target.value })}
                                />
                            </div>

                            <Button type="submit" size="lg" className="w-full">
                                {isEditing ? 'Guardar Cambios' : 'Registrar Inmueble'}
                            </Button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up">
                        <div className="text-center mb-5">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">¿Eliminar Inmueble?</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Esta acción eliminará el registro de la base de datos.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteModal(false)}>
                                Cancelar
                            </Button>
                            <Button variant="danger" className="flex-1" onClick={confirmDelete}>
                                Eliminar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
