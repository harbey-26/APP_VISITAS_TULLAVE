import prisma from '../utils/prisma.js';
import { z } from 'zod';
import { messaging } from '../utils/firebase.js';

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
        if (messaging) {
            const tokenRecords = await prisma.userFcmToken.findMany({ select: { token: true } });
            const tokens = tokenRecords.map(r => r.token);
            console.log(`[FCM] Enviando broadcast a ${tokens.length} dispositivo(s)`);
            if (tokens.length > 0) {
                messaging.sendEachForMulticast({
                    tokens,
                    notification: { title: `📢 ${title}`, body },
                    android: { priority: 'high' },
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
        const broadcasts = await prisma.broadcast.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { _count: { select: { reads: true } } },
        });
        res.json(broadcasts);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
