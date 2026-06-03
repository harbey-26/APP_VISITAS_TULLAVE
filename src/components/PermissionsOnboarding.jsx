import { useState } from 'react';
import {
    MapPin, Bell, BatteryCharging, ShieldCheck, CheckCircle2,
    ArrowRight, Settings, Navigation,
} from 'lucide-react';
import { Button } from './ui';
import {
    requestNotificationPermission,
    requestLocationPermission,
    openAppSettings,
} from '../utils/permissions';

export const ONBOARDING_KEY = 'visittrack_onboarding_done';

/**
 * Asistente de permisos que se muestra una sola vez en el primer arranque del
 * APK. Guía al agente para conceder notificaciones, ubicación, "Permitir todo
 * el tiempo" y desactivar la optimización de batería — sin estos permisos el
 * rastreo en segundo plano falla en silencio.
 *
 * @param {function} onDone - se invoca al terminar u omitir el asistente
 */
export default function PermissionsOnboarding({ onDone }) {
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [notifGranted, setNotifGranted] = useState(false);
    const [locGranted, setLocGranted] = useState(false);

    const finish = () => {
        try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
        onDone?.();
    };

    const next = () => setStep((s) => s + 1);

    const handleNotif = async () => {
        setBusy(true);
        const r = await requestNotificationPermission();
        setNotifGranted(r === 'granted');
        setBusy(false);
        next();
    };

    const handleLocation = async () => {
        setBusy(true);
        const r = await requestLocationPermission();
        setLocGranted(r === 'granted');
        setBusy(false);
        next();
    };

    const handleOpenSettings = async () => {
        setBusy(true);
        await openAppSettings();
        setBusy(false);
    };

    // Pasos del asistente (índice = step)
    const steps = [
        // 0 · Intro
        {
            icon: ShieldCheck,
            accent: 'bg-brand-600',
            title: 'Configuremos tu app',
            body: 'Para que el equipo pueda ver tus visitas y tu ubicación en tiempo real, necesitamos activar 4 permisos. Toma menos de un minuto.',
            primary: { label: 'Comenzar', icon: ArrowRight, onClick: next },
        },
        // 1 · Notificaciones
        {
            icon: Bell,
            accent: 'bg-amber-500',
            title: 'Notificaciones',
            body: 'Recibirás recordatorios para registrar tu ubicación durante la jornada y comunicados del administrador.',
            done: notifGranted,
            primary: { label: 'Activar notificaciones', icon: Bell, onClick: handleNotif },
        },
        // 2 · Ubicación
        {
            icon: MapPin,
            accent: 'bg-blue-500',
            title: 'Ubicación',
            body: 'La app usa tu ubicación para registrar el inicio y fin de cada visita y mostrar tu posición al equipo. En el diálogo, elige "Mientras se usa la app".',
            done: locGranted,
            primary: { label: 'Permitir ubicación', icon: Navigation, onClick: handleLocation },
        },
        // 3 · Todo el tiempo (background)
        {
            icon: Navigation,
            accent: 'bg-indigo-500',
            title: 'Permitir todo el tiempo',
            body: 'Para que el rastreo funcione con la pantalla apagada o la app minimizada, abre los ajustes → Permisos → Ubicación y elige "Permitir todo el tiempo". Sin esto, el rastreo se detiene al guardar el teléfono.',
            secondary: { label: 'Abrir ajustes', icon: Settings, onClick: handleOpenSettings },
            primary: { label: 'Ya lo configuré', icon: ArrowRight, onClick: next },
        },
        // 4 · Batería
        {
            icon: BatteryCharging,
            accent: 'bg-emerald-500',
            title: 'Optimización de batería',
            body: 'Android puede cerrar la app para ahorrar batería y cortar el rastreo. En los ajustes, busca "Batería" y elige "Sin restricciones" (o desactiva la optimización para VisitTrack).',
            secondary: { label: 'Abrir ajustes', icon: Settings, onClick: handleOpenSettings },
            primary: { label: 'Ya lo configuré', icon: ArrowRight, onClick: next },
        },
        // 5 · Listo
        {
            icon: CheckCircle2,
            accent: 'bg-emerald-500',
            title: '¡Todo listo!',
            body: 'Ya puedes empezar a registrar tus visitas. Si necesitas ajustar un permiso más adelante, encuéntralo en los ajustes del teléfono.',
            primary: { label: 'Empezar', icon: ArrowRight, onClick: finish },
        },
    ];

    const current = steps[step];
    const Icon = current.icon;
    const total = steps.length;

    return (
        <div
            className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-sm flex flex-col"
            style={{ paddingTop: 'max(env(safe-area-inset-top), 1.75rem)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
        >
            {/* Barra de progreso por pasos */}
            <div className="flex gap-1.5 px-6 pt-2">
                {steps.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-brand-500' : 'bg-white/15'}`}
                    />
                ))}
            </div>

            {/* Contenido */}
            <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
                <div className={`w-20 h-20 rounded-3xl ${current.accent} flex items-center justify-center shadow-lg mb-6`}>
                    {current.done
                        ? <CheckCircle2 className="w-10 h-10 text-white" />
                        : <Icon className="w-10 h-10 text-white" />}
                </div>

                <p className="text-xs font-bold text-brand-400 uppercase tracking-widest mb-2">
                    Paso {step + 1} de {total}
                </p>
                <h2 className="text-2xl font-bold text-white mb-3 leading-tight">
                    {current.title}
                </h2>
                <p className="text-slate-300 text-sm leading-relaxed max-w-xs">
                    {current.body}
                </p>

                {current.done && (
                    <span className="inline-flex items-center gap-1.5 mt-4 text-emerald-400 text-sm font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Permiso concedido
                    </span>
                )}
            </div>

            {/* Acciones */}
            <div className="px-7 space-y-3">
                {current.secondary && (
                    <Button
                        variant="secondary"
                        icon={current.secondary.icon}
                        loading={busy}
                        onClick={current.secondary.onClick}
                        className="w-full bg-white/10 text-white hover:bg-white/20 border-0"
                    >
                        {current.secondary.label}
                    </Button>
                )}
                <Button
                    variant="primary"
                    icon={current.primary.icon}
                    loading={busy}
                    onClick={current.primary.onClick}
                    className="w-full py-3.5"
                >
                    {current.primary.label}
                </Button>

                {/* Escape: nunca dejar al agente atrapado si un plugin falla */}
                {step < total - 1 && (
                    <button
                        onClick={finish}
                        className="w-full text-slate-400 hover:text-slate-200 text-sm font-medium py-2 transition-colors"
                    >
                        Omitir por ahora
                    </button>
                )}
            </div>
        </div>
    );
}
