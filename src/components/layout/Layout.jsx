import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Calendar, LogOut, MapPin, BarChart2, Users } from 'lucide-react';

export default function Layout() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path) => location.pathname.startsWith(path) ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500 hover:text-brand-600';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white shadow-sm px-4 py-2 flex justify-between items-center sticky top-0 z-10 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                    <img src="/logo.png" alt="Tu Llave Inmobiliaria" className="h-10 object-contain" />
                </div>
                <div className="flex items-center space-x-4">
                    <Link to="/agenda" className={`text-sm hidden sm:block font-medium ${isActive('/agenda')}`}>Agenda</Link>
                    {user?.role === 'ADMIN' && (
                        <>
                            <Link to="/users" className={`text-sm hidden sm:block font-medium ${isActive('/users')}`}>Usuarios</Link>
                            <Link to="/properties" className={`text-sm hidden sm:block font-medium ${isActive('/properties')}`}>Inmuebles</Link>
                            <Link to="/dashboard" className={`text-sm hidden sm:block font-medium ${isActive('/dashboard')}`}>Dashboard</Link>
                        </>
                    )}
                    <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
                    <span className="text-sm text-gray-500 hidden sm:block">{user?.role === 'AGENT' ? 'Agente Inmobiliario' : user?.name}</span>
                    <button onClick={handleLogout} className="text-gray-500 hover:text-red-600" title="Cerrar Sesión">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="flex-1 p-4 max-w-3xl mx-auto w-full pb-24 sm:pb-4">
                <Outlet />
            </main>

            <nav className="bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center sticky bottom-0 sm:hidden">
                <Link to="/agenda" className={`flex flex-col items-center ${isActive('/agenda')}`}>
                    <Calendar className="w-6 h-6" />
                    <span className="text-xs mt-1">Agenda</span>
                </Link>
                {user?.role === 'ADMIN' && (
                    <>
                        <Link to="/users" className={`flex flex-col items-center ${isActive('/users')}`}>
                            <Users className="w-6 h-6" />
                            <span className="text-xs mt-1">Usuarios</span>
                        </Link>
                        <Link to="/properties" className={`flex flex-col items-center ${isActive('/properties')}`}>
                            <MapPin className="w-6 h-6" />
                            <span className="text-xs mt-1">Inmuebles</span>
                        </Link>
                        <Link to="/dashboard" className={`flex flex-col items-center ${isActive('/dashboard')}`}>
                            <BarChart2 className="w-6 h-6" />
                            <span className="text-xs mt-1">Admin</span>
                        </Link>
                    </>
                )}
            </nav>
        </div>
    );
}
