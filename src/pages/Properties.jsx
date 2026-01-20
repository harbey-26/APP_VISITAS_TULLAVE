import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import { Plus, Pencil, Trash2, MapPin, X, Building, CheckCircle } from 'lucide-react';

export default function Properties() {
    const [properties, setProperties] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

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

    const fetchProperties = async () => {
        try {
            const res = await fetch(`${API_URL}/api/properties`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProperties(await res.json());
            }
        } catch (error) {
            console.error('Error fetching properties:', error);
        }
    };

    useEffect(() => {
        fetchProperties();
    }, [token]);

    const handleOpenCreate = () => {
        setFormData({ id: null, address: '', client: '', lat: '', lng: '' });
        setIsEditing(false);
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
            } else {
                const err = await res.json();
                alert(err.error || 'Error al guardar');
            }
        } catch (error) {
            alert('Error: ' + error.message);
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
            } else {
                const err = await res.json();
                alert(err.error || 'Error al eliminar');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Gestión de Inmuebles</h2>
                    <p className="text-gray-500 text-sm">Administra direcciones y clientes</p>
                </div>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center space-x-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 shadow-md transition"
                >
                    <Plus className="w-5 h-5" />
                    <span>Nuevo Inmueble</span>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-700 uppercase font-bold text-xs">
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
                                            <div className="p-2 bg-blue-50 text-brand-600 rounded-lg">
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
                                            <span className="text-red-400">Pendiente</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleOpenEdit(prop)}
                                                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-blue-50 rounded-lg transition"
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
                            {properties.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center py-8 text-gray-400">
                                        No hay inmuebles registrados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl transform transition-all">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                {isEditing ? 'Editar Inmueble' : 'Nuevo Inmueble'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition"
                                    placeholder="Ej. Calle 123 # 45-67"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    El sistema intentará geolocalizarla automáticamente.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente / Propietario</label>
                                <input
                                    type="text"
                                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-brand-500 focus:outline-none transition"
                                    placeholder="Nombre del cliente"
                                    value={formData.client}
                                    onChange={e => setFormData({ ...formData, client: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 shadow-lg active:scale-95 transition"
                            >
                                {isEditing ? 'Guardar Cambios' : 'Registrar Inmueble'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
                        <div className="text-center mb-4">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">¿Eliminar Inmueble?</h3>
                            <p className="text-sm text-gray-500">
                                Esta acción eliminará el registro de la base de datos.
                            </p>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg transition"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
