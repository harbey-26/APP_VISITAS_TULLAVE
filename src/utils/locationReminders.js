import prisma from './prisma.js';
import { messaging } from './firebase.js';

// Recordatorio "por silencio": en horario laboral, si un agente que estuvo activo
// hoy lleva un rato sin reportar ubicación, se le envía UN push puntual. Reemplaza
// las 10 notificaciones locales fijas (menos fatiga, solo cuando falta el dato).

const CHECK_INTERVAL_MS   = 15 * 60 * 1000;      // revisar cada 15 min
const SILENCE_MIN_MS      = 2  * 60 * 60 * 1000; // sin reportar > 2h → recordar
const SILENCE_MAX_MS      = 12 * 60 * 60 * 1000; // pero activo en las últimas 12h (evita cuentas inactivas/día libre)
const REMINDER_THROTTLE_MS = 2 * 60 * 60 * 1000; // máximo un recordatorio cada 2h por agente
const WORK_START_HOUR = 8;   // 8am Bogotá
const WORK_END_HOUR   = 18;  // hasta las 5:59pm

// Throttle en memoria: userId -> timestamp del último recordatorio
const lastRemindedAt = new Map();

// Hora y día en Bogotá (UTC-5, Colombia no tiene horario de verano). day: 0=domingo
function bogotaParts(date = new Date()) {
    const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000);
    return { hour: shifted.getUTCHours(), day: shifted.getUTCDay() };
}

async function checkSilentAgents() {
    const { hour, day } = bogotaParts();
    if (day === 0) return;                                   // domingo: no molestar
    if (hour < WORK_START_HOUR || hour >= WORK_END_HOUR) return; // fuera de horario

    const now = Date.now();
    const agents = await prisma.user.findMany({
        where: {
            role: 'AGENT',
            fcmTokens: { some: {} },
            // Reportó dentro de las últimas 12h pero no en las últimas 2h → activo hoy y en silencio
            lastSeenAt: { lt: new Date(now - SILENCE_MIN_MS), gt: new Date(now - SILENCE_MAX_MS) },
        },
        select: { id: true, name: true, fcmTokens: { select: { token: true } } },
    });

    for (const agent of agents) {
        if (now - (lastRemindedAt.get(agent.id) || 0) < REMINDER_THROTTLE_MS) continue;
        const tokens = agent.fcmTokens.map(t => t.token);
        if (tokens.length === 0) continue;

        try {
            const r = await messaging.sendEachForMulticast({
                tokens,
                notification: {
                    title: 'VisitTrack — Confirma tu ubicación',
                    body: 'Llevas un rato sin reportar. Abre la app para registrar tu posición.',
                },
                data: { type: 'location_reminder' },
                android: { priority: 'high' },
            });
            lastRemindedAt.set(agent.id, now);

            // Podar tokens inválidos / desregistrados
            const stale = r.responses
                .map((resp, i) => (!resp.success && /registration|invalid/.test(resp.error?.code || '')) ? tokens[i] : null)
                .filter(Boolean);
            if (stale.length) {
                prisma.userFcmToken.deleteMany({ where: { token: { in: stale } } }).catch(() => {});
            }
            console.log(`[LocationReminder] Recordatorio enviado a ${agent.name} (${r.successCount}/${tokens.length})`);
        } catch (e) {
            console.warn('[LocationReminder]', e.message);
        }
    }
}

export function startLocationReminderCron() {
    if (!messaging) {
        console.warn('[LocationReminder] FCM desactivado — recordatorios por silencio inactivos');
        return;
    }
    setInterval(() => {
        checkSilentAgents().catch(e => console.warn('[LocationReminder]', e.message));
    }, CHECK_INTERVAL_MS);
    console.log('[LocationReminder] Cron de recordatorios por silencio activo');
}
