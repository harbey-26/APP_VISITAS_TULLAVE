import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Plus, X, Trash2 } from 'lucide-react';
import { API_URL } from '../config';

export default function Agenda() {
    const [visits, setVisits] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');

    const [properties, setProperties] = useState([]);
    const [agents, setAgents] = useState([]);
    const [isNewProperty, setIsNewProperty] = useState(false);

    // Default to Today for both
    const today = new Date().toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: today, end: today });

    const [formData, setFormData] = useState({
        propertyId: '',
        newAddress: '',
        newClient: '',
        assignedUserId: '', // For Admin to assign
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        duration: 60,
        type: 'RENTAL_SHOWING',
        notes: '',
        clientName: '',
        clientPhone: ''
    });

    const { token, user } = useAuth();
    const navigate = useNavigate();

    const fetchVisits = async () => {
        try {
            const query = `?startDate=${dateRange.start}&endDate=${dateRange.end}`;
            const res = await fetch(`${API_URL}/api/visits${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setVisits(data);
                } else {
                    console.error('API response is not an array:', data);
                    setVisits([]);
                }
            }
        } catch (error) {
            console.error('Error al cargar visitas', error);
        }
    };

    const fetchProperties = async () => {
        try {
            const res = await fetch(`${API_URL}/api/properties`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setProperties(await res.json());
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchAgents = async () => {
        // Only fetch agents if Admin
        if (user?.role === 'ADMIN') {
            try {
                const res = await fetch(`${API_URL}/api/users`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const allUsers = await res.json();
                    setAgents(allUsers.filter(u => u.role === 'AGENT')); // Or all users if admins can also have visits
                }
            } catch (error) {
                console.error(error);
            }
        }
    };

    useEffect(() => {
        if (token) {
            fetchVisits();
            fetchProperties();
            fetchAgents();
        }
    }, [token, user, dateRange]); // Reload when date range changes

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {

            // STEP 1: Create Property
            if (isNewProperty) {
                const propRes = await fetch(`${API_URL}/api/properties`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        address: formData.newAddress,
                        client: formData.newClient || 'Cliente General',
                        lat: 4.6097, // Default to Bogota
                        lng: -74.0817
                    })
                });

                if (!propRes.ok) {
                    const errData = await propRes.json();
                    throw new Error(errData.error || 'Error al registrar inmueble');
                }

                const newProp = await propRes.json();

                // Refresh list and select new property
                await fetchProperties();
                setFormData(prev => ({ ...prev, propertyId: newProp.id, newAddress: '', newClient: '' }));
                setIsNewProperty(false);
                // Stop here, user will then fill visit details
                return;
            }

            // STEP 2: Create Visit
            const scheduledStart = new Date(`${formData.date}T${formData.time}:00`).toISOString();

            const payload = {
                propertyId: parseInt(formData.propertyId),
                scheduledStart,
                estimatedDuration: parseInt(formData.duration),
                type: formData.type,
                notes: formData.notes,
                clientName: formData.clientName,
                clientPhone: formData.clientPhone
            };

            // Add assignedUserId if present and valid
            if (formData.assignedUserId) {
                payload.assignedUserId = parseInt(formData.assignedUserId);
            }

            const res = await fetch(`${API_URL}/api/visits`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowModal(false);
                fetchVisits();
                setFormData({
                    propertyId: '',
                    newAddress: '',
                    newClient: '',
                    assignedUserId: '',
                    date: new Date().toISOString().split('T')[0],
                    time: '09:00',
                    duration: 60,
                    type: 'SHOWING',
                    notes: '',
                    clientName: '',
                    clientPhone: ''
                });
            } else {
                const err = await res.json();
                alert(err.error || 'Error al crear la visita');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };


    const initiateDelete = (e, id) => {
        e.stopPropagation(); // Avoid navigating to details
        setDeleteTargetId(id);
        setDeletePassword('');
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deletePassword) return;
        try {
            const res = await fetch(`${API_URL}/api/visits/${deleteTargetId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ password: deletePassword })
            });

            if (res.ok) {
                setShowDeleteModal(false);
                fetchVisits();
            } else {
                const err = await res.json();
                alert(err.error || 'Error al eliminar');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'COMPLETED': return 'bg-green-100 text-green-800';
            case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
            case 'MISSED': return 'bg-red-100 text-red-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    const translateStatus = (status) => {
        switch (status) {
            case 'PENDING': return 'Pendiente';
            case 'IN_PROGRESS': return 'En Curso';
            case 'COMPLETED': return 'Completada';
            case 'MISSED': return 'Fallida';
            default: return status;
        }
    };

    const translateType = (type) => {
        switch (type) {
            case 'SHOWING': return 'Visita Comercial';
            case 'APPRAISAL': return 'Avalúo';
            case 'INSPECTION': return 'Inspección';
            default: return type;
        }
    };

    // Helper for date display
    const formatDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

    return (
        <div className="space-y-6 relative min-h-[80vh]">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold">Visitas Programadas</h2>
                    <span className="text-sm text-gray-500 capitalize">
                        {dateRange.start === dateRange.end
                            ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                            : `${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`
                        }
                    </span>
                </div>
                <div className="flex items-center space-x-3 bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-500">Del</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-300 rounded text-sm p-1 max-w-[130px] focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-500">al</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-300 rounded text-sm p-1 max-w-[130px] focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-brand-600 text-white p-2 rounded-full shadow hover:bg-brand-700 transition ml-2"
                        title="Nueva Visita"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {visits.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No hay visitas programadas.</p>
                ) : (
                    visits.map(visit => (
                        <div
                            key={visit.id}
                            onClick={() => navigate(`/visit/${visit.id}`)}
                            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md transition relative group"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center space-x-2">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    <span className="font-semibold text-gray-700">
                                        {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(visit.status)}`}>
                                        {translateStatus(visit.status)}
                                    </span>
                                    {/* Delete Button */}
                                    <button
                                        onClick={(e) => initiateDelete(e, visit.id)}
                                        className="text-gray-300 hover:text-red-500 transition p-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-lg mb-1">{visit.property?.address || 'Dirección desconocida'}</h3>
                            <p className="text-sm text-gray-500 mb-3">{translateType(visit.type)} • {visit.estimatedDuration} min</p>

                            <div className="flex items-center text-brand-600 font-medium text-sm">
                                <span>Ver Detalles</span>
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </div>
                        </div>
                    ))
                )}
            </div>

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

                            {/* Admin: Agent Selector */}
                            {user?.role === 'ADMIN' && (
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
                                    {!isNewProperty && (
                                        <button
                                            type="button"
                                            onClick={() => setIsNewProperty(true)}
                                            className="text-xs text-brand-600 font-medium hover:underline"
                                        >
                                            Registrar nuevo
                                        </button>
                                    )}
                                    {isNewProperty && (
                                        <button
                                            type="button"
                                            onClick={() => setIsNewProperty(false)}
                                            className="text-xs text-brand-600 font-medium hover:underline"
                                        >
                                            Cancelar registro
                                        </button>
                                    )}
                                </div>

                                {isNewProperty ? (
                                    <div className="space-y-3 animate-fade-in">
                                        <input
                                            type="text"
                                            placeholder="Dirección del inmueble"
                                            className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                            value={formData.newAddress}
                                            onChange={e => setFormData({ ...formData, newAddress: e.target.value })}
                                            required={isNewProperty}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Nombre del Cliente (Opcional)"
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
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Cliente</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.clientName}
                                                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono Cliente</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.clientPhone}
                                                onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
                                                placeholder="Opcional"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                                            <select
                                                className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                                value={formData.type}
                                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                                            >
                                                <option value="RENTAL_SHOWING">Mostrar inmueble en arriendo</option>
                                                <option value="PROPERTY_INTAKE">Captación de inmueble</option>
                                                <option value="HANDOVER">Entrega de inmueble</option>
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
                                                onChange={e => setFormData({ ...formData, duration: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 mt-4 shadow-md"
                                    >
                                        Agendar Visita
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="submit"
                                    className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 mt-4 shadow-md"
                                >
                                    Guardar Inmueble
                                </button>
                            )}
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
                        <h3 className="text-xl font-bold text-red-600 mb-2">Eliminar Visita</h3>
                        <p className="text-gray-600 mb-4 text-sm">Esta acción no se puede deshacer. Ingresa la contraseña para confirmar.</p>

                        <input
                            type="password"
                            placeholder="Contraseña de autorización"
                            className="w-full p-3 border rounded-xl mb-4 focus:ring-2 focus:ring-red-500 focus:outline-none"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                        />

                        <div className="flex space-x-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700"
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
