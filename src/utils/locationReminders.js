import prisma from './prisma.js';
import { messaging } from './firebase.js';
import { androidAlertConfig } from './fcmConfig.js';
import {
    PING_AFTER_MS, ACTIVE_WINDOW_MS,
    isWorkingNow, bogotaParts, reminderActionFor,
} from './reminderPolicy.js';

// Check-in horario de ubicación — esquema de dos niveles (la lógica de tiempos
// vive en reminderPolicy.js, que tiene tests):
//   1. Silencio ≥ 50 min → PING data-only (invisible): si el proceso del APK
//      está vivo, la app reporta la ubicación sola, sin molestar al agente.
//   2. Silencio ≥ 75 min → NOTIFICACIÓN visible con sonido/vibración (canal de
//      alta importancia): el ping no bastó, se necesita que el agente abra.
// Solo en horario laboral (L-V 9-18, Sáb 9-13) y para agentes activos hoy.

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // revisar cada 10 min

// Throttle en memoria: userId -> timestamp del último aviso VISIBLE
const lastNotifiedAt = new Map();

// Poda tokens inválidos/desregistrados según la respuesta de FCM
function pruneStaleTokens(tokens, responses) {
    const stale = responses
        .map((resp, i) => (!resp.success && /registration|invalid/.test(resp.error?.code || '')) ? tokens[i] : null)
        .filter(Boolean);
    if (stale.length) {
        prisma.userFcmToken.deleteMany({ where: { token: { in: stale } } }).catch(() => {});
    }
}

async function checkSilentAgents() {
    const { hour, day } = bogotaParts();
    if (!isWorkingNow(hour, day)) return;

    const now = Date.now();
    const agents = await prisma.user.findMany({
        where: {
            role: 'AGENT',
            fcmTokens: { some: {} },
            // Silencio ≥ 50 min pero activo en las últimas 12h (excluye día libre)
            lastSeenAt: { lt: new Date(now - PING_AFTER_MS), gt: new Date(now - ACTIVE_WINDOW_MS) },
        },
        select: { id: true, name: true, lastSeenAt: true, fcmTokens: { select: { token: true } } },
    });

    for (const agent of agents) {
        const tokens = agent.fcmTokens.map(t => t.token);
        if (tokens.length === 0) continue;

        const msSilent = now - new Date(agent.lastSeenAt).getTime();
        const msSinceNotify = now - (lastNotifiedAt.get(agent.id) || 0);
        const action = reminderActionFor(msSilent, msSinceNotify);
        if (!action) continue;

        try {
            if (action === 'notify') {
                // Aviso visible: sonido + vibración + banner (canal de alta importancia)
                const r = await messaging.sendEachForMulticast({
                    tokens,
                    notification: {
                        title: 'VisitTrack — Confirma tu ubicación',
                        body: 'Llevas más de una hora sin reportar. Toca aquí para registrar tu posición.',
                    },
                    data: { type: 'location_reminder' },
                    android: androidAlertConfig(),
                });
                lastNotifiedAt.set(agent.id, now);
                pruneStaleTokens(tokens, r.responses);
                console.log(`[LocationReminder] Aviso visible a ${agent.name} (${r.successCount}/${tokens.length}, ${Math.round(msSilent / 60000)} min de silencio)`);
            } else {
                // Ping invisible (data-only): despierta la app para auto-reportar.
                // Sin `notification` para que Android entregue el mensaje al proceso
                // incluso en background (con notification iría a la bandeja del SO).
                const r = await messaging.sendEachForMulticast({
                    tokens,
                    data: { type: 'location_ping' },
                    android: { priority: 'high' },
                });
                pruneStaleTokens(tokens, r.responses);
                console.log(`[LocationReminder] Ping silencioso a ${agent.name} (${r.successCount}/${tokens.length})`);
            }
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
    console.log('[LocationReminder] Cron de check-in horario activo (ping 50 min / aviso 75 min)');
}
