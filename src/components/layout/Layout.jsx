import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Calendar,
    LogOut,
    MapPin,
    BarChart2,
    Users,
    Menu,
    X,
    LayoutDashboard
} from 'lucide-react';

export default function Layout() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path) => {
        return location.pathname.startsWith(path)
            ? 'bg-brand-600 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-brand-600';
    };

    const NavItem = ({ to, icon: Icon, label }) => (
        <Link
            to={to}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive(to)}`}
        >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
        </Link>
    );

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-white z-30 border-b px-4 py-3 flex justify-between items-center h-16 shadow-sm">
                <div className="flex items-center space-x-3">
                    <button onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu className="w-6 h-6 text-gray-600" />
                    </button>
                    <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside className={`
                fixed lg:sticky top-0 left-0 h-[100dvh] w-72 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-xl lg:shadow-none
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo Section */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center h-20">
                    <img src="/logo.png" alt="Tu Llave Inmobiliaria" className="h-10 w-auto" />
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    {/* Common Links */}
                    <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Principal</p>
                    <NavItem to="/agenda" icon={Calendar} label="Agenda" />

                    {/* Admin Links */}
                    {user?.role === 'ADMIN' && (
                        <>
                            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">Administración</p>
                            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                            <NavItem to="/properties" icon={MapPin} label="Inmuebles" />
                            <NavItem to="/users" icon={Users} label="Usuarios" />
                        </>
                    )}
                </nav>

                {/* User Profile Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3 mb-3 px-2">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 min-h-[100dvh]">
                <div className="h-16 lg:hidden" /> {/* Spacer for Mobile Header */}
                <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
                    <div className="max-w-5xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
