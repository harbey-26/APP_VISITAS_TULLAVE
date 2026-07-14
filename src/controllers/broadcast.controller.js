import prisma from '../utils/prisma.js';
import { z } from 'zod';
import { messaging } from '../utils/firebase.js';
import { androidAlertConfig } from '../utils/fcmConfig.js';

const broadcastSchema = z.object({
    title: z.string().min(1).max(100),
    body:  z.string().min(1).max(500),
});

// Admin: crear y enviar un comunicado a todos los agentes
export const createBroadcast = async (req, res) => {
    try {
        const { title, body } = broadcastSchema.parse(req.body);
        const broadcast = await prisma.broadcast.create({
            data: { title, body },
            select: { id: true, title: true, body: true, createdAt: true },
        });

        // M6: Leer tokens de la tabla UserFcmToken (soporte multi-dispositivo)
        // M7: createBroadcast sigue siendo solo masivo (userId null); las personales usan utils/notify.js
        if (messaging) {
            const tokenRecords = await prisma.userFcmToken.findMany({ select: { token: true } });
            const tokens = tokenRecords.map(r => r.token);
            console.log(`[FCM] Enviando broadcast a ${tokens.length} dispositivo(s)`);
            if (tokens.length > 0) {
                messaging.sendEachForMulticast({
                    tokens,
                    notification: { title: `📢 ${title}`, body },
                    android: androidAlertConfig(),
                }).then(r => {
                    // M6: Podar tokens inválidos o desregistrados
                    const staleTokens = r.responses
                        .map((resp, i) => {
                            if (!resp.success) {
                                const code = resp.error?.code || '';
                                return (code.includes('registration') || code.includes('invalid')) ? tokens[i] : null;
                            }
                            return null;
                        })
                        .filter(Boolean);
                    if (staleTokens.length > 0) {
                        prisma.userFcmToken.deleteMany({ where: { token: { in: staleTokens } } }).catch(() => {});
                    }
                    console.log(`[FCM] Éxito: ${r.successCount}, Fallos: ${r.failureCount}, Podados: ${staleTokens.length}`);
                }).catch(e => console.warn('[FCM broadcast]', e.message));
            }
        } else {
            console.warn('[FCM] messaging es null — FIREBASE_SERVICE_ACCOUNT no configurada en Railway');
        }

        res.status(201).json(broadcast);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Admin: listar todos los comunicados con totales de lectura
export const getBroadcasts = async (req, res) => {
    try {
        // M7: el listado de admin muestra solo masivos (las personales son ruido aquí)
        const broadcasts = await prisma.broadcast.findMany({
            where: { userId: null },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { _count: { select: { reads: true } } },
        });
        res.json(broadcasts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Agente/Admin: bandeja de notificaciones — historial (30 días) con estado leído/no leído
// M7: incluye notificaciones masivas (userId null) y personales dirigidas al usuario
export const getInbox = async (req, res) => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const broadcasts = await prisma.broadcast.findMany({
            where: {
                createdAt: { gte: since },
                OR: [{ userId: null }, { userId: req.user.id }],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
                id: true, title: true, body: true, createdAt: true,
                reads: { where: { userId: req.user.id }, select: { id: true } },
            },
        });
        const items = broadcasts.map(b => ({
            id: b.id, title: b.title, body: b.body, createdAt: b.createdAt,
            read: b.reads.length > 0,
        }));
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Agente/Admin: marcar todas las notificaciones como leídas
export const markAllBroadcastsRead = async (req, res) => {
    try {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const unread = await prisma.broadcast.findMany({
            where: {
                createdAt: { gte: since },
                reads: { none: { userId: req.user.id } },
                OR: [{ userId: null }, { userId: req.user.id }],
            },
            select: { id: true },
        });
        for (const b of unread) {
            await prisma.broadcastRead.upsert({
                where: { broadcastId_userId: { broadcastId: b.id, userId: req.user.id } },
                update: {},
                create: { broadcastId: b.id, userId: req.user.id },
            });
        }
        res.json({ ok: true, marked: unread.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Agente: obtener comunicados de las últimas 48h que aún no ha visto
export const getPendingBroadcasts = async (req, res) => {
    try {
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const broadcasts = await prisma.broadcast.findMany({
            where: {
                createdAt: { gte: since },
                reads: { none: { userId: req.user.id } },
                OR: [{ userId: null }, { userId: req.user.id }],
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true, body: true, createdAt: true },
        });
        res.json(broadcasts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// A1: Validar IDs de URL
function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

// Agente: marcar un comunicado como visto
export const markBroadcastRead = async (req, res) => {
    let broadcastId;
    try { broadcastId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de comunicado inválido' });
    }
    try {
        await prisma.broadcastRead.upsert({
            where: { broadcastId_userId: { broadcastId, userId: req.user.id } },
            update: {},
            create: { broadcastId, userId: req.user.id },
        });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
