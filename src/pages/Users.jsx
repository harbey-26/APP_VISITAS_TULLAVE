import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Plus, Trash2, Pencil, User as UserIcon, Shield, AlertTriangle, Users as UsersIcon } from 'lucide-react';
import { API_URL } from '../config';
import { friendlyError } from '../utils/api';
import { Card, Button, PageHeader, EmptyState, Skeleton, Modal, Field, Input, Select } from '../components/ui';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'AGENT' });

    // M2: Estado para edición
    const [editingUser, setEditingUser] = useState(null);
    const [editFormData, setEditFormData] = useState({ name: '', email: '', role: 'AGENT', password: '' });

    const { token, user: currentUser } = useAuth();
    const toast = useToast();

    const fetchUsers = async () => {
        setLoading(true); // M1
        try {
            const res = await fetch(`${API_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setUsers(await res.json());
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false); // M1
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
            toast.error(friendlyError(error)); // M2
        }
    };

    const openEdit = (u) => {
        setEditingUser(u);
        setEditFormData({ name: u.name, email: u.email, role: u.role, password: '' });
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        const body = { name: editFormData.name, email: editFormData.email, role: editFormData.role };
        if (editFormData.password) body.password = editFormData.password;

        try {
            const res = await fetch(`${API_URL}/api/users/${editingUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                setEditingUser(null);
                fetchUsers();
                toast.success('Usuario actualizado correctamente');
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al actualizar usuario');
            }
        } catch (error) {
            toast.error(friendlyError(error));
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
            toast.error(friendlyError(error)); // M2
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Gestión de Usuarios"
                subtitle={`${users.length} usuario${users.length !== 1 ? 's' : ''} registrado${users.length !== 1 ? 's' : ''}`}
            >
                <Button icon={Plus} onClick={() => setShowModal(true)} className="ml-auto md:ml-0">
                    Nuevo Usuario
                </Button>
            </PageHeader>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Card key={i} className="p-4 flex items-center gap-3">
                            <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="h-4 w-20 rounded-full" />
                            </div>
                        </Card>
                    ))}
                </div>
            ) : users.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={UsersIcon}
                        title="No hay usuarios registrados"
                        description="Crea el primer usuario para dar acceso al equipo."
                        action={<Button icon={Plus} size="sm" onClick={() => setShowModal(true)}>Nuevo Usuario</Button>}
                    />
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {users.map(u => (
                        <Card key={u.id} hover className="p-4 flex items-center justify-between group">
                            <div className="flex items-center space-x-3 min-w-0">
                                <div className={`p-3 rounded-full shrink-0 ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' : 'bg-brand-100 text-brand-600'}`}>
                                    {u.role === 'ADMIN' ? <Shield className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-800 truncate">{u.name}</h3>
                                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${
                                        u.role === 'ADMIN'
                                            ? 'bg-purple-100 text-purple-700'
                                            : 'bg-brand-100 text-brand-700'
                                    }`}>
                                        {u.role === 'ADMIN' ? 'Administrador' : 'Agente'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition shrink-0">
                                <button
                                    onClick={() => openEdit(u)}
                                    className="text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition p-2"
                                    title="Editar usuario"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                {u.id !== currentUser.id && (
                                    <button
                                        onClick={() => initiateDelete(u.id)}
                                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition p-2"
                                        title="Eliminar usuario"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create User Modal */}
            <Modal open={showModal} onClose={() => setShowModal(false)} title="Crear Nuevo Usuario">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Field label="Nombre Completo">
                        <Input type="text" required value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </Field>
                    <Field label="Correo Electrónico">
                        <Input type="email" required value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </Field>
                    <Field label="Contraseña">
                        <Input type="password" required minLength={6} placeholder="Mínimo 6 caracteres"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </Field>
                    <Field label="Rol">
                        <Select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                            <option value="AGENT">Agente Inmobiliario</option>
                            <option value="ADMIN">Administrador</option>
                        </Select>
                    </Field>
                    <Button type="submit" size="lg" className="w-full mt-2">Crear Usuario</Button>
                </form>
            </Modal>

            {/* Edit User Modal */}
            <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Editar Usuario">
                <form onSubmit={handleEditSubmit} className="space-y-4">
                    <Field label="Nombre Completo">
                        <Input type="text" required value={editFormData.name}
                            onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
                    </Field>
                    <Field label="Correo Electrónico">
                        <Input type="email" required value={editFormData.email}
                            onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} />
                    </Field>
                    <Field label="Rol">
                        <Select value={editFormData.role} onChange={e => setEditFormData({ ...editFormData, role: e.target.value })}>
                            <option value="AGENT">Agente Inmobiliario</option>
                            <option value="ADMIN">Administrador</option>
                        </Select>
                    </Field>
                    <Field label={<>Nueva Contraseña <span className="text-gray-400 font-normal">(dejar vacío para no cambiar)</span></>}>
                        <Input type="password" minLength={6} placeholder="Mínimo 6 caracteres"
                            value={editFormData.password}
                            onChange={e => setEditFormData({ ...editFormData, password: e.target.value })} />
                    </Field>
                    <Button type="submit" size="lg" className="w-full mt-2">Guardar Cambios</Button>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} maxWidth="max-w-sm">
                <div className="text-center mb-5">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">¿Eliminar usuario?</h3>
                    <p className="text-sm text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
                    <Button variant="danger" className="flex-1" onClick={confirmDelete}>Eliminar</Button>
                </div>
            </Modal>
        </div>
    );
}
