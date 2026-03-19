import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Clock, Plus, X, Trash2, User, Phone, Home, CalendarX, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';
import { useToast } from '../context/ToastContext';
import { VISIT_TYPE_CONFIG, STATUS_CONFIG } from '../utils/visitTypes';
import { friendlyError } from '../utils/api';

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
    const toast = useToast();

    const fetchVisits = async () => {
        setLoadingVisits(true); // M1
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
        } finally {
            setLoadingVisits(false); // M1
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
        try {
            if (isNewProperty) {
                const propRes = await fetch(`${API_URL}/api/properties`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
                toast.success('Inmueble registrado correctamente');
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
                    propertyId: '', newAddress: '', newClient: '', assignedUserId: '',
                    date: new Date().toISOString().split('T')[0], time: '09:00',
                    duration: 60, type: 'RENTAL_SHOWING', notes: '', clientName: '', clientPhone: ''
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

    const formatDate = (d) =>
        new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

    const groupedVisits = groupByTimeSlot(visits);
    const hasVisits = visits.length > 0;

    return (
        <div className="space-y-6 relative min-h-[80vh]">
            {/* Header */}
            <div className="space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Visitas Programadas</h2>
                        <span className="text-sm text-gray-500 capitalize">
                            {dateRange.start === dateRange.end
                                ? new Date(dateRange.start + 'T00:00:00').toLocaleDateString('es-CO', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                })
                                : `${formatDate(dateRange.start)} – ${formatDate(dateRange.end)}`}
                        </span>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-brand-600 text-white px-4 py-2.5 rounded-xl shadow hover:bg-brand-700 transition flex items-center gap-2 font-semibold text-sm whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        Nueva Visita
                    </button>
                </div>

                <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setDateRange({ start: today, end: today })}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-brand-600 hover:text-white transition whitespace-nowrap flex-shrink-0"
                    >
                        Hoy
                    </button>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap">Del</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="border border-gray-200 rounded-lg text-xs px-1.5 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none min-w-0 w-full"
                        />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap">al</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="border border-gray-200 rounded-lg text-xs px-1.5 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none min-w-0 w-full"
                        />
                    </div>
                </div>
            </div>

            {/* U2: Skeleton mientras carga */}
            {loadingVisits && (
                <div className="space-y-3 animate-pulse">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <div className="h-1.5 bg-gray-200 w-full" />
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3">
                                        <div className="h-4 bg-gray-200 rounded w-14" />
                                        <div className="h-4 bg-gray-200 rounded w-20" />
                                    </div>
                                    <div className="h-5 bg-gray-200 rounded-full w-20" />
                                </div>
                                <div className="h-4 bg-gray-200 rounded w-3/4" />
                                <div className="h-3 bg-gray-200 rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Visit List grouped by time slot */}
            {!loadingVisits && !hasVisits ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                        <CalendarX className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-semibold text-lg">Sin visitas programadas</p>
                    <p className="text-gray-400 text-sm mt-1">
                        No hay visitas para{' '}
                        {dateRange.start === dateRange.end ? 'este día' : 'este período'}.
                    </p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="mt-5 bg-brand-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition shadow-md flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Agendar visita
                    </button>
                </div>
            ) : !loadingVisits && (
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

                                        return (
                                            <div
                                                key={visit.id}
                                                onClick={() => navigate(`/visit/${visit.id}`)}
                                                className={`bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all duration-200 overflow-hidden group ${typeConfig.border} ${isCompleted ? 'opacity-75' : ''}`}
                                            >
                                                {/* Franja de color por tipo */}
                                                <div className={`h-1.5 w-full ${typeConfig.dot}`} />

                                                <div className="p-4">
                                                    {/* Row 1: Hora + Tipo + Estado + Eliminar */}
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-1.5 text-gray-700">
                                                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                                <span className="font-bold text-sm">
                                                                    {new Date(visit.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig.bg} ${typeConfig.text}`}>
                                                                {typeConfig.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                                                                {statusConfig.label}
                                                            </span>
                                                            <button
                                                                onClick={(e) => initiateDelete(e, visit.id)}
                                                                className="text-gray-400 hover:text-red-500 transition p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors flex-shrink-0" />
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Dirección */}
                                                    <div className="flex items-start gap-2 mb-2">
                                                        <Home className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                                        <p className="font-semibold text-gray-900 text-sm leading-snug">
                                                            {visit.property?.address || 'Dirección desconocida'}
                                                        </p>
                                                    </div>

                                                    {/* Row 3: Cliente + Agente */}
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                                        {visit.clientName && (
                                                            <div className="flex items-center gap-1">
                                                                <User className="w-3 h-3" />
                                                                <span>{visit.clientName}</span>
                                                                {visit.clientPhone && (
                                                                    <span className="text-gray-400">· {visit.clientPhone}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {user?.role === 'ADMIN' && visit.user?.name && (
                                                            <div className="flex items-center gap-1">
                                                                <div className="w-4 h-4 rounded-full bg-brand-100 flex items-center justify-center">
                                                                    <span className="text-brand-600 font-bold" style={{ fontSize: '8px' }}>
                                                                        {visit.user.name.charAt(0)}
                                                                    </span>
                                                                </div>
                                                                <span className="font-medium text-brand-700">{visit.user.name}</span>
                                                            </div>
                                                        )}
                                                        {!visit.clientName && !(user?.role === 'ADMIN' && visit.user?.name) && (
                                                            <span className="text-gray-300 italic">Sin datos de cliente</span>
                                                        )}
                                                        <span className="text-gray-300">· {visit.estimatedDuration} min</span>
                                                    </div>

                                                    {/* Resultado si completada */}
                                                    {isCompleted && visit.outcome && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                                                            <span className="font-medium">Resultado:</span> {visit.outcome}
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
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Trash2 className="w-6 h-6 text-red-600" />
                        </div>
                        <h3 className="text-xl font-bold text-red-600 mb-1 text-center">Eliminar Visita</h3>
                        <p className="text-gray-500 mb-4 text-sm text-center">Esta acción no se puede deshacer. Ingresa tu contraseña para confirmar.</p>

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
