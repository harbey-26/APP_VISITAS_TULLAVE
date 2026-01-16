import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, X, User as UserIcon, Shield } from 'lucide-react';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'AGENT'
    });
    const { token, user: currentUser } = useAuth();

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users', {
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
            const res = await fetch('/api/users', {
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
                alert('Usuario creado correctamente');
            } else {
                const err = await res.json();
                alert(err.error || 'Error al crear usuario');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este usuario?')) return;

        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                fetchUsers();
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
                <h2 className="text-xl font-bold text-gray-800">Gestión de Usuarios</h2>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-brand-600 text-white p-2 rounded-full shadow-lg hover:bg-brand-700 transition flex items-center gap-2 px-4"
                >
                    <Plus className="w-5 h-5" />
                    <span className="hidden sm:inline">Nuevo Usuario</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {users.map(u => (
                    <div key={u.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className={`p-3 rounded-full ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                {u.role === 'ADMIN' ? <Shield className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800">{u.name}</h3>
                                <p className="text-sm text-gray-500">{u.email}</p>
                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                    {u.role === 'ADMIN' ? 'Administrador' : 'Agente'}
                                </span>
                            </div>
                        </div>

                        {u.id !== currentUser.id && (
                            <button
                                onClick={() => handleDelete(u.id)}
                                className="text-gray-400 hover:text-red-500 transition p-2"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl animate-scale-in">
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
                                className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold hover:bg-brand-700 mt-4"
                            >
                                Crear Usuario
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
