import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Plus, X, Trash2, Calendar, User, Phone, AlertCircle } from 'lucide-react';
import { API_URL } from '../config';

const TYPE_CONFIG = {
    RENTAL_SHOWING:  { label: 'Mostrar inmueble en arriendo', color: 'border-blue-500',   badge: 'bg-blue-50 text-blue-700'   },
    PROPERTY_INTAKE: { label: 'Captación de inmueble',        color: 'border-green-500',  badge: 'bg-green-50 text-green-700'  },
    HANDOVER:        { label: 'Entrega de inmueble',           color: 'border-purple-500', badge: 'bg-purple-50 text-purple-700'},
    MOVE_OUT:        { label: 'Desocupación',                  color: 'border-orange-500', badge: 'bg-orange-50 text-orange-700'},
    INSPECTION:      { label: 'Inspección',                    color: 'border-amber-500',  badge: 'bg-amber-50 text-amber-700'  },
    OTHER:           { label: 'Otro',                          color: 'border-gray-400',   badge: 'bg-gray-100 text-gray-600'   },
};

export default function Agenda() {
    const [visits, setVisits] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteError, setDeleteError] = useState('');
    const [formError, setFormError] = useState('');

    const [properties, setProperties] = useState([]);
    const [agents, setAgents] = useState([]);
    const [isNewProperty, setIsNewProperty] = useState(false);

    const today = new Date().toISOString().split('T')[0];
    const [dateRange, setDateRange] = useState({ start: today, end: today });

    const [formData, setFormData] = useState({
        propertyId: '',
        newAddress: '',
        newClient: '',
        assignedUserId: '',
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
                setVisits(Array.isArray(data) ? data : []);
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

    useEffect(() => {
        if (token) {
            fetchVisits();
            fetchProperties();
            fetchAgents();
        }
    }, [token, user, dateRange]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        try {
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
                        lat: 4.6097,
                        lng: -74.0817
                    })
                });

                if (!propRes.ok) {
                    const errData = await propRes.json();
                    throw new Error(errData.error || 'Error al registrar inmueble');
                }

                const newProp = await propRes.json();
                await fetchProperties();
                setFormData(prev => ({ ...prev, propertyId: newProp.id, newAddress: '', newClient: '' }));
                setIsNewProperty(false);
                return;
            }

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
                    type: 'RENTAL_SHOWING',
                    notes: '',
                    clientName: '',
                    clientPhone: ''
                });
            } else {
                const err = await res.json();
                setFormError(err.error || 'Error al crear la visita');
            }
        } catch (error) {
            setFormError('Error: ' + error.message);
        }
    };

    const initiateDelete = (e, id) => {
        e.stopPropagation();
        setDeleteTargetId(id);
        setDeletePassword('');
        setDeleteError('');
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deletePassword) return;
        setDeleteError('');
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
                setDeleteError(err.error || 'Error al eliminar');
            }
        } catch (error) {
            setDeleteError('Error: ' + error.message);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'COMPLETED':  return 'bg-green-100 text-green-800';
            case 'IN_PROGRESS': return 'bg-blue-100 text-blue-800';
            case 'MISSED':     return 'bg-red-100 text-red-800';
            default:           return 'bg-yellow-100 text-yellow-800';
        }
    };

    const translateStatus = (status) => {
        switch (status) {
            case 'PENDING':     return 'Pendiente';
            case 'IN_PROGRESS': return 'En Curso';
            case 'COMPLETED':   return 'Completada';
            case 'MISSED':      return 'Fallida';
            default:            return status;
        }
    };

    const formatDate = (d) =>
        new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

    const isToday = dateRange.start === today && dateRange.end === today;

    return (
        <div className="space-y-6 relative min-h-[80vh]">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold">Visitas Programadas</h2>
                    <span className="text-sm text-gray-500 capitalize">
                        {dateRange.start === dateRange.end
                            ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                            : `${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`
                        }
                    </span>
                </div>

                {/* Filter bar + New Visit */}
                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto">
                    {/* Quick "Hoy" button */}
                    <button
                        onClick={() => setDateRange({ start: today, end: today })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            isToday
                                ? 'bg-brand-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        Hoy
                    </button>
                    <div className="w-px h-5 bg-gray-200" />
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">Del</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-300 rounded-lg text-sm p-1.5 max-w-[130px] focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">al</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-300 rounded-lg text-sm p-1.5 max-w-[130px] focus:ring-2 focus:ring-brand-500 focus:outline-none"
                        />
                    </div>
                    <button
                        onClick={() => { setShowModal(true); setFormError(''); }}
                        className="bg-brand-600 text-white px-3 py-1.5 rounded-lg shadow hover:bg-brand-700 transition flex items-center gap-1.5 text-sm font-medium ml-1"
                        title="Nueva Visita"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Nueva Visita</span>
                    </button>
                </div>
            </div>

            {/* Visit List */}
            <div className="space-y-3">
                {visits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Calendar className="w-12 h-12 mb-3 opacity-30" />
                        <p className="font-medium text-gray-500">No hay visitas programadas</p>
                        <p className="text-sm mt-1">Usa "Nueva Visita" para agendar una.</p>
                    </div>
                ) : (
                    visits.map(visit => {
                        const typeConf = TYPE_CONFIG[visit.type] || TYPE_CONFIG.OTHER;
                        return (
                            <div
                                key={visit.id}
                                onClick={() => navigate(`/visit/${visit.id}`)}
                                className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${typeConf.color} p-4 cursor-pointer hover:shadow-md transition relative`}
                            >
                                {/* Top row: time + status + delete */}
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-gray-400" />
                                        <span className="font-semibold text-gray-700">
                                            {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="text-gray-300">·</span>
                                        <span className="text-xs text-gray-500">{visit.estimatedDuration} min</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(visit.status)}`}>
                                            {translateStatus(visit.status)}
                                        </span>
                                        <button
                                            onClick={(e) => initiateDelete(e, visit.id)}
                                            className="text-gray-300 hover:text-red-500 transition p-1 rounded"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Address */}
                                <h3 className="font-bold text-base mb-1 text-gray-900">
                                    {visit.property?.address || 'Dirección desconocida'}
                                </h3>

                                {/* Type badge */}
                                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2 ${typeConf.badge}`}>
                                    {typeConf.label}
                                </span>

                                {/* Client info */}
                                {(visit.clientName || visit.clientPhone) && (
                                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                                        {visit.clientName && (
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" /> {visit.clientName}
                                            </span>
                                        )}
                                        {visit.clientPhone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {visit.clientPhone}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Agent name (admin only) */}
                                {user?.role === 'ADMIN' && visit.user?.name && (
                                    <p className="text-xs text-gray-400 mt-1">Agente: {visit.user.name}</p>
                                )}

                                <div className="flex items-center text-brand-600 font-medium text-sm mt-3">
                                    <span>Ver Detalles</span>
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* New Visit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold">Nueva Visita</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {formError && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

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

                            {/* Property Selector */}
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
                                    <div className="space-y-3">
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
                                                {Object.entries(TYPE_CONFIG).map(([key, conf]) => (
                                                    <option key={key} value={key}>{conf.label}</option>
                                                ))}
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
                                        className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 mt-4 shadow-md transition"
                                    >
                                        Agendar Visita
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="submit"
                                    className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 mt-4 shadow-md transition"
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
                        <h3 className="text-xl font-bold text-red-600 mb-1">Eliminar Visita</h3>
                        <p className="text-gray-500 mb-4 text-sm">Esta acción no se puede deshacer. Ingresa tu contraseña para confirmar.</p>

                        {deleteError && (
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>{deleteError}</span>
                            </div>
                        )}

                        <input
                            type="password"
                            placeholder="Contraseña de autorización"
                            className="w-full p-3 border rounded-xl mb-4 focus:ring-2 focus:ring-red-500 focus:outline-none"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition"
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
