import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { getCurrentPosition, startBackgroundTracking, stopBackgroundTracking } from '../../utils/geo';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import PermissionsOnboarding, { ONBOARDING_KEY } from '../PermissionsOnboarding';
import {
    Calendar,
    LogOut,
    MapPin,
    Radio,
    Users,
    Menu,
    X,
    Bell,
    LayoutDashboard,
    Settings as SettingsIcon
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';

export default function Layout() {
    const { logout, user, token } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { unreadCount, refresh: refreshNotifications } = useNotifications();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Onboarding de permisos: solo en el APK y solo la primera vez
    const [showOnboarding, setShowOnboarding] = useState(
        () => Capacitor.isNativePlatform() && !localStorage.getItem(ONBOARDING_KEY)
    );

    // Detección de conectividad
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
    }, []);

    // Indicador GPS
    const [gpsLastSent, setGpsLastSent] = useState(null);

    // M4: Refs para filtro de distancia GPS
    const lastSentPosRef = useRef(null);
    const lastForceSendRef = useRef(0);

    // Refs estables para el manejador del botón Atrás (evita re-suscribir el listener)
    const menuOpenRef = useRef(isMobileMenuOpen);
    menuOpenRef.current = isMobileMenuOpen;
    const pathnameRef = useRef(location.pathname);
    pathnameRef.current = location.pathname;

    // Botón físico "Atrás" de Android (solo APK): cerrar menú → retroceder → doble toque para salir
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        let lastBack = 0;
        const sub = CapacitorApp.addListener('backButton', () => {
            if (menuOpenRef.current) {
                setIsMobileMenuOpen(false);
                return;
            }
            const path = pathnameRef.current;
            if (path !== '/agenda' && path !== '/') {
                navigate(-1);
                return;
            }
            // En la pantalla raíz: confirmar salida con doble toque
            const now = Date.now();
            if (now - lastBack < 2000) {
                CapacitorApp.exitApp();
            } else {
                lastBack = now;
                toast.info('Presiona atrás de nuevo para salir');
            }
        });
        return () => { sub.then(l => l.remove()).catch(() => {}); };
    }, [navigate, toast]);

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

    // Los recordatorios de ubicación ya NO se programan como notificaciones locales fijas.
    // Ahora son "por silencio", dirigidos desde el servidor vía FCM (src/utils/locationReminders.js):
    // solo se avisa al agente cuando lleva un rato sin reportar — menos fatiga y sin duplicados.
    // El tap del push se maneja en el efecto FCM de abajo (registra ubicación al instante).

    // Migración (una vez al abrir): limpiar las notificaciones fijas del esquema anterior
    // (IDs 1001–1070) que los APK ya instalados tienen encoladas en el SO, para que no se
    // solapen con los nuevos recordatorios por silencio durante ~7 días.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        LocalNotifications.cancel({
            notifications: Array.from({ length: 70 }, (_, i) => ({ id: 1001 + i }))
        }).catch(() => {});
    }, []);

    // FCM: registrar token del dispositivo en el servidor (solo APK)
    useEffect(() => {
        if (!token || !Capacitor.isNativePlatform()) return;
        const registerFcm = async () => {
            try {
                await FirebaseMessaging.requestPermissions();
                const { token: fcmToken } = await FirebaseMessaging.getToken();
                await fetch(`${API_URL}/api/users/fcm-token`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ token: fcmToken }),
                });
            } catch (e) { console.warn('[FCM register]', e); }
        };
        registerFcm();

        // FCM en primer plano: refrescar la bandeja de notificaciones (que deduplica y
        // dispara el toast una sola vez). El polling/toast vive en NotificationsContext.
        const recvSub = FirebaseMessaging.addListener('notificationReceived', () => {
            refreshNotifications();
        });
        // Al tocar el push (recordatorio de ubicación o comunicado) → ir a la agenda y
        // registrar la ubicación al instante (cubre arranque en frío, donde no hay resume-ping).
        const tapSub = FirebaseMessaging.addListener('notificationActionPerformed', () => {
            navigate('/agenda');
            getCurrentPosition()
                .then(pos => fetch(`${API_URL}/api/users/location`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
                }))
                .catch(() => {});
        });
        return () => {
            recvSub.then(l => l.remove()).catch(() => {});
            tapSub.then(l => l.remove()).catch(() => {});
        };
    }, [token, refreshNotifications, navigate]);

    // GPS: APK usa Foreground Service nativo (background); web usa setInterval 30 s
    useEffect(() => {
        if (!token) return;

        // M4: Haversine para calcular distancia en metros entre dos puntos GPS
        const haversineMeters = (lat1, lon1, lat2, lon2) => {
            const R = 6371e3;
            const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
            const Δφ = (lat2 - lat1) * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        const GPS_MIN_DISTANCE_M = 10;       // no enviar si movimiento < 10 m
        const GPS_FORCE_INTERVAL_MS = 2 * 60 * 1000; // forzar envío cada 2 min aunque no haya movimiento

        const sendCoords = ({ lat, lng }, force = false) => {
            const now = Date.now();
            const last = lastSentPosRef.current;
            const forceSend = force || now - lastForceSendRef.current >= GPS_FORCE_INTERVAL_MS;

            // M4: Omitir si no se movió suficiente y no ha pasado el intervalo de fuerza
            if (last && !forceSend) {
                const dist = haversineMeters(last.lat, last.lng, lat, lng);
                if (dist < GPS_MIN_DISTANCE_M) return;
            }

            lastSentPosRef.current = { lat, lng };
            lastForceSendRef.current = now;

            fetch(`${API_URL}/api/users/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            })
            .then(res => { if (res.status === 401) logout(); else setGpsLastSent(new Date()); })
            .catch(() => {});
        };

        let watchId = null;

        if (Capacitor.isNativePlatform()) {
            // APK: Foreground Service nativo — continúa con pantalla apagada
            startBackgroundTracking(sendCoords).then(id => { watchId = id; });
            // Heartbeat cada 2 min para agentes quietos (distanceFilter no dispara si no se mueven).
            // Nota: Android congela los timers JS al minimizar — este heartbeat solo corre con la
            // app en primer plano. El watcher nativo cubre el background mientras el agente se mueve.
            const heartbeat = setInterval(
                () => getCurrentPosition().then(sendCoords).catch(() => {}),
                2 * 60 * 1000
            );
            // M5: Al reabrir la app (resume), forzar un ping inmediato para que un agente quieto
            // no aparezca "desconectado" tras tener el teléfono guardado.
            const onResume = () => {
                if (document.visibilityState === 'visible') {
                    getCurrentPosition().then(pos => sendCoords(pos, true)).catch(() => {});
                }
            };
            document.addEventListener('visibilitychange', onResume);
            return () => {
                if (watchId) stopBackgroundTracking(watchId);
                clearInterval(heartbeat);
                document.removeEventListener('visibilitychange', onResume);
            };
        }

        // Web: setInterval cada 30 s + ping al volver al foco
        if (!navigator.geolocation) return;
        const send = () => getCurrentPosition().then(sendCoords).catch(() => {});
        send();
        const interval = setInterval(send, 30000);
        const onFocus = () => { if (document.visibilityState === 'visible') send(); };
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [token]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // GPS activo si hubo un ping exitoso en los últimos 2 min
    const gpsActive = gpsLastSent && (Date.now() - gpsLastSent.getTime()) < 120000;

    const isMobileActive = (path) =>
        location.pathname.startsWith(path);

    const NavItem = ({ to, icon: Icon, label, badge = 0 }) => {
        const active = location.pathname.startsWith(to);
        return (
            <Link
                to={to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 text-sm font-semibold
                    ${active
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                        : 'text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
            >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{label}</span>
                {badge > 0 && (
                    <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${active ? 'bg-white text-brand-600' : 'bg-brand-600 text-white'}`}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </Link>
        );
    };

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
        <div className="min-h-screen bg-gray-50 flex">

            {/* ── Onboarding de permisos (primer arranque del APK) ───────── */}
            {token && showOnboarding && (
                <PermissionsOnboarding onDone={() => setShowOnboarding(false)} />
            )}

            {/* ── Header móvil fijo ─────────────────────────────────────── */}
            {/* max() garantiza ≥28px aunque env() devuelva 0 (Android sin notch) */}
            <div
                className="lg:hidden fixed top-0 left-0 right-0 bg-white z-30 border-b border-gray-100 px-4 flex justify-between items-center shadow-sm"
                style={{ paddingTop: 'max(env(safe-area-inset-top), 1.75rem)', paddingBottom: '0.75rem' }}
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        aria-label="Abrir menú"
                        className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <img src="/logo.png" alt="Logo" className="h-7 w-auto" />
                </div>
                <div className="flex items-center gap-2.5">
                    {/* Indicador GPS visible — confianza para el agente */}
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${gpsActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${gpsActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        GPS
                    </span>
                    {/* Campana de notificaciones con contador */}
                    <button
                        onClick={() => navigate('/notifications')}
                        aria-label="Notificaciones"
                        className="relative w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md ${isAdmin ? 'bg-purple-600' : 'bg-brand-600'}`}>
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                </div>
            </div>

            {/* ── Backdrop del sidebar ──────────────────────────────────── */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* ── Sidebar ───────────────────────────────────────────────── */}
            <aside
                className={`
                    fixed lg:sticky top-0 left-0 h-[100dvh] w-72 lg:w-64
                    z-50 flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    rounded-r-3xl lg:rounded-none
                    shadow-[8px_0_40px_rgba(0,0,0,0.45)] lg:shadow-none
                    border-r border-white/5
                    ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
                style={{ background: 'linear-gradient(180deg, #1a1f2e 0%, #0f172a 100%)' }}
            >
                {/* Acento de marca en el tope */}
                <div className="h-0.5 w-full bg-gradient-to-r from-brand-600 via-brand-400 to-transparent flex-shrink-0" />

                {/* Logo */}
                <div
                    className="flex-shrink-0 flex justify-between items-center px-5 pb-5 border-b border-white/10"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 1.75rem)' }}
                >
                    <img src="/logo.png" alt="Tu Llave Inmobiliaria" className="h-9 w-auto" />
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/20 transition"
                        aria-label="Cerrar menú"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Navegación */}
                <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto scrollbar-thin">
                    <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Principal
                    </p>
                    <NavItem to="/agenda" icon={Calendar} label="Agenda" />
                    <NavItem to="/notifications" icon={Bell} label="Notificaciones" badge={unreadCount} />

                    {isAdmin && (
                        <>
                            <p className="px-3 mt-5 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Administración
                            </p>
                            <NavItem to="/dashboard"  icon={LayoutDashboard} label="Dashboard"  />
                            <NavItem to="/properties" icon={MapPin}          label="Inmuebles"  />
                            <NavItem to="/users"      icon={Users}           label="Usuarios"   />
                            <NavItem to="/tracking"   icon={Radio}           label="Rastreo"    />
                            <NavItem to="/settings"   icon={SettingsIcon}    label="Ajustes"    />
                        </>
                    )}
                </nav>

                {/* Perfil + Logout */}
                <div className="flex-shrink-0 p-4">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow ${isAdmin ? 'bg-purple-600' : 'bg-brand-600'}`}>
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full inline-block ${gpsActive ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                                <span className="text-[10px] text-slate-500">
                                    {gpsActive ? 'GPS activo' : 'GPS inactivo'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                    </button>
                    <p className="text-center text-[10px] text-slate-600 mt-3">
                        VisitTrack v{__APP_VERSION__}
                    </p>
                </div>
            </aside>

            {/* ── Contenido principal ───────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0 min-h-[100dvh]">
                {/* Espaciador para el header fijo móvil (altura = safe-area + 3.5rem) */}
                <div
                    className="lg:hidden flex-shrink-0"
                    style={{ height: 'calc(max(env(safe-area-inset-top), 1.75rem) + 3.5rem)' }}
                />
                {/* Banner de sin conexión */}
                {!isOnline && (
                    <div className="flex-shrink-0 bg-amber-500 text-white text-xs font-semibold text-center py-2 px-4 flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-white/80 inline-block" />
                        Sin conexión — los cambios no se guardarán hasta recuperar internet
                    </div>
                )}
                <div className="flex-1 p-4 lg:p-8 overflow-y-auto scrollbar-thin pb-40 lg:pb-8">
                    <div key={location.pathname} className="max-w-5xl mx-auto w-full animate-fade-in">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* ── Barra de navegación inferior (solo móvil) ─────────────── */}
            {/* paddingBottom: max() garantiza espacio sobre los botones del sistema Android */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 flex items-stretch shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 3.5rem)' }}
            >
                {bottomNavItems.map(({ to, icon: Icon, label }) => {
                    const active = isMobileActive(to);
                    return (
                        <Link
                            key={to}
                            to={to}
                            className={`relative flex-1 flex flex-col items-center justify-center pt-3 pb-1 gap-1 transition-colors ${
                                active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                            <span className={`text-[10px] font-semibold leading-tight ${active ? 'text-brand-600' : ''}`}>
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
