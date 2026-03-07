import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition, startBackgroundTracking, stopBackgroundTracking } from '../../utils/geo';
import {
    Calendar,
    LogOut,
    MapPin,
    Radio,
    Users,
    Menu,
    X,
    LayoutDashboard
} from 'lucide-react';

export default function Layout() {
    const { logout, user, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Wake Lock: evita que la pantalla se apague para mantener el GPS activo
    useEffect(() => {
        if (!token || !('wakeLock' in navigator)) return;
        let wakeLock = null;
        const acquire = async () => {
            try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* batería baja, modo ahorro */ }
        };
        acquire();
        const onVisibility = () => { if (document.visibilityState === 'visible') acquire(); };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            wakeLock?.release();
        };
    }, [token]);

    // GPS: en APK usa rastreo nativo en background; en web usa setInterval cada 60 s
    useEffect(() => {
        if (!token) return;

        const sendCoords = ({ lat, lng }) => {
            fetch(`${API_URL}/api/users/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            }).catch(() => {});
        };

        let watchId = null;
        let interval = null;

        if (Capacitor.isNativePlatform()) {
            // APK: GPS nativo continuo en background (foreground service de Android)
            startBackgroundTracking(sendCoords).then(id => { watchId = id; });
        } else {
            // Web: setInterval cada 60 s + ping inmediato al volver al foco
            if (!navigator.geolocation) return;
            const send = () => getCurrentPosition().then(sendCoords).catch(() => {});
            send();
            interval = setInterval(send, 60000);
            const onFocus = () => { if (document.visibilityState === 'visible') send(); };
            document.addEventListener('visibilitychange', onFocus);
            return () => {
                clearInterval(interval);
                document.removeEventListener('visibilitychange', onFocus);
            };
        }

        return () => {
            if (watchId) stopBackgroundTracking(watchId);
        };
    }, [token]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isActive = (path) =>
        location.pathname.startsWith(path)
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-gray-400 hover:bg-white/10 hover:text-white';

    const isMobileActive = (path) =>
        location.pathname.startsWith(path);

    const NavItem = ({ to, icon: Icon, label }) => (
        <Link
            to={to}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive(to)}`}
        >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{label}</span>
        </Link>
    );

    const isAdmin = user?.role === 'ADMIN';

    const bottomNavItems = [
        { to: '/agenda',     icon: Calendar,        label: 'Agenda'    },
        ...(isAdmin ? [
            { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
            { to: '/properties', icon: MapPin,           label: 'Inmuebles' },
            { to: '/users',      icon: Users,            label: 'Usuarios'  },
            { to: '/tracking',   icon: Radio,            label: 'Rastreo'   },
        ] : []),
    ];

    return (
        <div className="min-h-screen bg-gray-100 flex">
            {/* Mobile Header — safe-area-inset-top para status bar de Android/iOS */}
            <div className="lg:hidden fixed top-0 left-0 right-0 bg-white z-30 border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)', minHeight: '3.5rem' }}>
                <div className="flex items-center space-x-3">
                    <button onClick={() => setIsMobileMenuOpen(true)} aria-label="Abrir menú">
                        <Menu className="w-6 h-6 text-gray-600" />
                    </button>
                    <img src="/logo.png" alt="Logo" className="h-7 w-auto" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <aside className={`
                fixed lg:sticky top-0 left-0 h-[100dvh] w-72 bg-gray-900 border-r border-white/5 z-50 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl lg:shadow-none
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo Section */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center h-20">
                    <img src="/logo.png" alt="Tu Llave Inmobiliaria" className="h-10 w-auto" />
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden text-gray-500 hover:text-gray-200 transition"
                        aria-label="Cerrar menú"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                    <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Principal</p>
                    <NavItem to="/agenda" icon={Calendar} label="Agenda" />

                    {isAdmin && (
                        <>
                            <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mt-6 mb-2">Administración</p>
                            <NavItem to="/dashboard"  icon={LayoutDashboard} label="Dashboard"  />
                            <NavItem to="/properties" icon={MapPin}          label="Inmuebles"  />
                            <NavItem to="/users"      icon={Users}           label="Usuarios"   />
                            <NavItem to="/tracking"   icon={Radio}           label="Rastreo"    />
                        </>
                    )}
                </nav>

                {/* User Profile Footer */}
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <div className="flex items-center gap-3 mb-3 px-2">
                        <div className="w-10 h-10 rounded-full bg-brand-600/25 border border-brand-500/30 flex items-center justify-center text-brand-400 font-bold text-lg shrink-0">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 min-h-[100dvh]">
                <div className="h-14 lg:hidden" />
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
                            className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
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
