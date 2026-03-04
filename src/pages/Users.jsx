import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Plus, Trash2, X, User as UserIcon, Shield, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'AGENT'
    });
    const { token, user: currentUser } = useAuth();
    const toast = useToast();

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setUsers(await res.json());
            }
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setShowModal(false);
                fetchUsers();
                setFormData({ name: '', email: '', password: '', role: 'AGENT' });
                toast.success('Usuario creado correctamente');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al crear usuario');
            }
        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    };

    const initiateDelete = (id) => {
        setDeleteTargetId(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        try {
            const res = await fetch(`${API_URL}/api/users/${deleteTargetId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setShowDeleteModal(false);
                fetchUsers();
                toast.success('Usuario eliminado');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al eliminar');
            }
        } catch (error) {
            toast.error('Error: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Gestión de Usuarios</h2>
                    <p className="text-sm text-gray-500">{users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-brand-600 text-white shadow-lg hover:bg-brand-700 transition flex items-center gap-2 px-4 py-2 rounded-lg"
                >
                    <Plus className="w-5 h-5" />
                    <span className="hidden sm:inline font-medium">Nuevo Usuario</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map(u => (
                    <div key={u.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group">
                        <div className="flex items-center space-x-3">
                            <div className={`p-3 rounded-full ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                {u.role === 'ADMIN' ? <Shield className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">{u.name}</h3>
                                <p className="text-sm text-gray-500">{u.email}</p>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 inline-block ${
                                    u.role === 'ADMIN'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                }`}>
                                    {u.role === 'ADMIN' ? 'Administrador' : 'Agente'}
                                </span>
                            </div>
                        </div>

                        {u.id !== currentUser.id && (
                            <button
                                onClick={() => initiateDelete(u.id)}
                                className="text-gray-300 hover:text-red-500 transition p-2 opacity-0 group-hover:opacity-100"
                                title="Eliminar usuario"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ))}

                {users.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-gray-400">
                        No hay usuarios registrados.
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">Crear Nuevo Usuario</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                                <input
                                    type="email"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                                <input
                                    type="password"
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                <select
                                    className="w-full p-2 border rounded-lg bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <option value="AGENT">Agente Inmobiliario</option>
                                    <option value="ADMIN">Administrador</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 mt-4 shadow-md transition"
                            >
                                Crear Usuario
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl">
                        <div className="text-center mb-5">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">¿Eliminar usuario?</h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition"
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
