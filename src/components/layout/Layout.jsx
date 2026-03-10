import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_URL } from '../../config';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition, startBackgroundTracking, stopBackgroundTracking } from '../../utils/geo';
import { LocalNotifications } from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
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
    const toast = useToast();
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

    // Notificaciones 8am–5pm con mensaje según la hora (solo APK)
    // Usa `at` con fechas exactas (7 días) en lugar de `on` (repeating inexacto en Android 6+)
    useEffect(() => {
        if (!token || !Capacitor.isNativePlatform()) return;
        const NOTIF_MESSAGES = {
            8:  'Buenos días — confirma tu ubicación para iniciar la jornada.',
            9:  'Son las 9am — abre la app para registrar tu posición.',
            10: 'Son las 10am — abre la app para registrar tu posición.',
            11: 'Son las 11am — abre la app para registrar tu posición.',
            12: 'Mediodía — registra tu ubicación antes de almorzar.',
            13: 'Son las 1pm — abre la app para registrar tu posición.',
            14: 'Son las 2pm — abre la app para registrar tu posición.',
            15: 'Son las 3pm — abre la app para registrar tu posición.',
            16: 'Son las 4pm — abre la app para registrar tu posición.',
            17: 'Fin de jornada — registra tu última ubicación del día.',
        };
        const WORK_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
        const scheduleReminders = async () => {
            try {
                const perm = await LocalNotifications.requestPermissions();
                if (perm.display !== 'granted') return;
                await LocalNotifications.createChannel({
                    id: 'visittrack',
                    name: 'VisitTrack Recordatorios',
                    importance: 4,
                    vibration: true,
                });
                // Cancelar recordatorios anteriores (IDs 1001–1070: 7 días × 10 horas)
                await LocalNotifications.cancel({
                    notifications: Array.from({ length: 70 }, (_, i) => ({ id: 1001 + i }))
                });
                // Programar cada hora de los próximos 7 días con fecha exacta
                const now = new Date();
                const notifications = [];
                let id = 1001;
                for (let day = 0; day < 7; day++) {
                    for (const hour of WORK_HOURS) {
                        const fireAt = new Date(now);
                        fireAt.setDate(now.getDate() + day);
                        fireAt.setHours(hour, 0, 0, 0);
                        if (fireAt > now) {
                            notifications.push({
                                id: id++,
                                title: 'VisitTrack — Confirma tu ubicación',
                                body: NOTIF_MESSAGES[hour],
                                schedule: { at: fireAt, allowWhileIdle: true },
                                channelId: 'visittrack',
                            });
                        }
                    }
                }
                if (notifications.length > 0) {
                    await LocalNotifications.schedule({ notifications });
                    console.log(`[Notif] ${notifications.length} recordatorios programados`);
                }
            } catch (e) { console.warn('[Notif]', e); }
        };
        scheduleReminders();
        return () => {
            LocalNotifications.cancel({
                notifications: Array.from({ length: 70 }, (_, i) => ({ id: 1001 + i }))
            }).catch(() => {});
        };
    }, [token]);

    // Al tocar la notificación local → ir a /agenda y registrar ubicación inmediatamente (solo APK)
    useEffect(() => {
        if (!Capacitor.isNativePlatform() || !token) return;
        const sub = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
            navigate('/agenda');
            // Si es notificación horaria (IDs 1001-1070) → registrar ubicación al instante
            if (action.notification?.id >= 1001) {
                getCurrentPosition()
                    .then(pos => fetch(`${API_URL}/api/users/location`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ lat: pos.lat, lng: pos.lng }),
                    }))
                    .catch(() => {});
            }
        });
        return () => { sub.then(l => l.remove()).catch(() => {}); };
    }, [navigate, token]);

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

        // Notificación FCM recibida con la app en primer plano → mostrar toast
        const sub = FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
            toast.info(`📢 ${notification.title}: ${notification.body}`);
        });
        return () => { sub.then(l => l.remove()).catch(() => {}); };
    }, [token]);

    // Polling de comunicados: verifica cada 60s si hay mensajes nuevos del admin
    useEffect(() => {
        if (!token) return;
        const checkBroadcasts = async () => {
            try {
                const res = await fetch(`${API_URL}/api/broadcasts/pending`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) return;
                const pending = await res.json();
                for (const broadcast of pending) {
                    // Marcar como visto antes de mostrar (evita duplicados)
                    await fetch(`${API_URL}/api/broadcasts/${broadcast.id}/read`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    // Toast inmediato: visible en web Y en APK cuando la app está en primer plano
                    // (FCM maneja la notificación push en background — no se usa LocalNotifications aquí)
                    toast.info(`📢 ${broadcast.title}: ${broadcast.body}`);
                }
            } catch { /* silencioso */ }
        };
        checkBroadcasts();
        const interval = setInterval(checkBroadcasts, 60000);
        return () => clearInterval(interval);
    }, [token, toast]);

    // GPS: APK usa Foreground Service nativo (background); web usa setInterval 30 s
    useEffect(() => {
        if (!token) return;

        const sendCoords = ({ lat, lng }) => {
            fetch(`${API_URL}/api/users/location`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng })
            })
            .then(res => { if (res.status === 401) logout(); })
            .catch(() => {});
        };

        let watchId = null;

        if (Capacitor.isNativePlatform()) {
            // APK: Foreground Service nativo — continúa con pantalla apagada
            startBackgroundTracking(sendCoords).then(id => { watchId = id; });
            return () => { if (watchId) stopBackgroundTracking(watchId); };
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

    const isMobileActive = (path) =>
        location.pathname.startsWith(path);

    const NavItem = ({ to, icon: Icon, label }) => {
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
                <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                    {user?.name?.charAt(0) || 'U'}
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
            <aside className={`
                fixed lg:sticky top-0 left-0 h-[100dvh] w-72 lg:w-64
                bg-slate-900 z-50 flex flex-col
                transform transition-transform duration-300 ease-in-out
                rounded-r-3xl lg:rounded-none
                shadow-[8px_0_40px_rgba(0,0,0,0.45)] lg:shadow-none
                border-r border-white/5
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
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
                <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
                    <p className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Principal
                    </p>
                    <NavItem to="/agenda" icon={Calendar} label="Agenda" />

                    {isAdmin && (
                        <>
                            <p className="px-3 mt-5 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Administración
                            </p>
                            <NavItem to="/dashboard"  icon={LayoutDashboard} label="Dashboard"  />
                            <NavItem to="/properties" icon={MapPin}          label="Inmuebles"  />
                            <NavItem to="/users"      icon={Users}           label="Usuarios"   />
                            <NavItem to="/tracking"   icon={Radio}           label="Rastreo"    />
                        </>
                    )}
                </nav>

                {/* Perfil + Logout */}
                <div className="flex-shrink-0 p-4">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 mb-3">
                        <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
                            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* ── Contenido principal ───────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0 min-h-[100dvh]">
                {/* Espaciador para el header fijo móvil (altura = safe-area + 3.5rem) */}
                <div
                    className="lg:hidden flex-shrink-0"
                    style={{ height: 'calc(max(env(safe-area-inset-top), 1.75rem) + 3.5rem)' }}
                />
                <div className="flex-1 p-4 lg:p-8 overflow-y-auto pb-32 lg:pb-8">
                    <div className="max-w-5xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>

            {/* ── Barra de navegación inferior (solo móvil) ─────────────── */}
            {/* paddingBottom: max() garantiza espacio sobre los botones del sistema Android */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 flex items-stretch shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
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
