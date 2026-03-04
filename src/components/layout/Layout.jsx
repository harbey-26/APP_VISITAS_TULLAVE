import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Calendar,
    LogOut,
    MapPin,
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

    const isActive = (path) =>
        location.pathname.startsWith(path)
            ? 'bg-brand-600 text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-brand-600';

    const isMobileActive = (path) =>
        location.pathname.startsWith(path);

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

    const isAdmin = user?.role === 'ADMIN';

    // Bottom nav items: show Agenda always; admin gets Dashboard + Properties + Users
    const bottomNavItems = [
        { to: '/agenda',     icon: Calendar,       label: 'Agenda'     },
        ...(isAdmin ? [
            { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
            { to: '/properties', icon: MapPin,          label: 'Inmuebles'  },
            { to: '/users',      icon: Users,           label: 'Usuarios'   },
        ] : []),
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-white z-30 border-b px-4 py-3 flex justify-between items-center h-14 shadow-sm">
                <div className="flex items-center space-x-3">
                    <button onClick={() => setIsMobileMenuOpen(true)} aria-label="Abrir menú">
                        <Menu className="w-6 h-6 text-gray-600" />
                    </button>
                    <img src="/logo.png" alt="Logo" className="h-7 w-auto" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
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
                        className="lg:hidden text-gray-400 hover:text-gray-600 transition"
                        aria-label="Cerrar menú"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Principal</p>
                    <NavItem to="/agenda" icon={Calendar} label="Agenda" />

                    {isAdmin && (
                        <>
                            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">Administración</p>
                            <NavItem to="/dashboard"  icon={LayoutDashboard} label="Dashboard"  />
                            <NavItem to="/properties" icon={MapPin}          label="Inmuebles"  />
                            <NavItem to="/users"      icon={Users}           label="Usuarios"   />
                        </>
                    )}
                </nav>

                {/* User Profile Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3 mb-3 px-2">
                        <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg shrink-0">
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
                <div className="h-14 lg:hidden" /> {/* Spacer for Mobile Header */}
                <div className="flex-1 p-4 lg:p-8 overflow-y-auto pb-20 lg:pb-8">
                    <div className="max-w-5xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Navigation Bar */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex items-stretch shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
                {bottomNavItems.map(({ to, icon: Icon, label }) => {
                    const active = isMobileActive(to);
                    return (
                        <Link
                            key={to}
                            to={to}
                            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                                active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                            <span className={`text-[10px] font-medium leading-tight ${active ? 'text-brand-600' : ''}`}>
                                {label}
                            </span>
                            {active && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-600 rounded-b-full" />
                            )}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
