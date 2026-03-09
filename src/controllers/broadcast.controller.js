import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { messaging } from '../utils/firebase.js';

const prisma = new PrismaClient();

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

        // Enviar push FCM a todos los agentes con token registrado
        if (messaging) {
            const users = await prisma.user.findMany({
                where: { fcmToken: { not: null } },
                select: { fcmToken: true },
            });
            const tokens = users.map(u => u.fcmToken).filter(Boolean);
            if (tokens.length > 0) {
                messaging.sendEachForMulticast({
                    tokens,
                    notification: { title: `📢 ${title}`, body },
                    android: { priority: 'high', notification: { channelId: 'visittrack-comunicados' } },
                }).catch(e => console.warn('[FCM broadcast]', e.message));
            }
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

// Agente: marcar un comunicado como visto
export const markBroadcastRead = async (req, res) => {
    try {
        const broadcastId = parseInt(req.params.id);
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
