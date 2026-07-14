// Política de recordatorios de ubicación — lógica pura (sin BD ni Firebase)
// para poder testearla. La usa el cron del servidor (locationReminders.js).
//
// Esquema de dos niveles para cumplir el check-in HORARIO:
//  1. 'ping'   (silencio ≥ 50 min): mensaje FCM data-only invisible. Si el
//     proceso del APK sigue vivo (el Foreground Service lo mantiene), la app
//     reporta la ubicación AUTOMÁTICAMENTE sin molestar al agente.
//  2. 'notify' (silencio ≥ 75 min): notificación visible con sonido/vibración
//     (canal de alta importancia) — el ping automático no funcionó y se
//     necesita acción humana. Máximo una por hora.

export const PING_AFTER_MS = 50 * 60 * 1000; // auto-reporte silencioso
export const NOTIFY_AFTER_MS = 75 * 60 * 1000; // aviso visible al agente
export const NOTIFY_THROTTLE_MS = 60 * 60 * 1000; // máx. un aviso visible por hora
export const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000; // activo en las últimas 12h (excluye día libre)

// Horario laboral TuLlave: L-V 9am–6pm, Sábado 9am–1pm, Domingo cerrado
const WORK_START_HOUR = 9;
const WORK_END_HOUR_WEEK = 18;
const WORK_END_HOUR_SAT = 13;

export function isWorkingNow(hour, day) {
    if (day === 0) return false; // domingo
    if (day === 6) return hour >= WORK_START_HOUR && hour < WORK_END_HOUR_SAT;
    return hour >= WORK_START_HOUR && hour < WORK_END_HOUR_WEEK;
}

// Hora y día en Bogotá (UTC-5, Colombia no tiene horario de verano). day: 0=domingo
export function bogotaParts(date = new Date()) {
    const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    return { hour: shifted.getUTCHours(), day: shifted.getUTCDay() };
}

/**
 * Decide qué acción tomar para un agente en silencio.
 * @param {number} msSilent - milisegundos desde su último reporte de ubicación
 * @param {number} msSinceLastNotify - ms desde el último aviso visible (Infinity si nunca)
 * @returns {'ping' | 'notify' | null}
 */
export function reminderActionFor(msSilent, msSinceLastNotify = Infinity) {
    if (msSilent > ACTIVE_WINDOW_MS) return null; // cuenta inactiva / día libre
    if (msSilent >= NOTIFY_AFTER_MS && msSinceLastNotify >= NOTIFY_THROTTLE_MS) return 'notify';
    if (msSilent >= PING_AFTER_MS) return 'ping';
    return null;
}
