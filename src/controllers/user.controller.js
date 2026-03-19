import prisma from '../utils/prisma.js';
import { z } from 'zod';
import { hashPassword } from '../utils/auth.js';

const locationSchema = z.object({
    lat: z.number(),
    lng: z.number()
});

// M1: Rate limit en memoria — máx 1 ping de ubicación cada 10 s por usuario
const locationLastSeen = new Map();
const LOCATION_MIN_INTERVAL_MS = 10_000;

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    role: z.enum(['AGENT', 'ADMIN'])
});

export const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createUser = async (req, res) => {
    try {
        const data = createUserSchema.parse(req.body);
        const passwordHash = await hashPassword(data.password);

        const user = await prisma.user.create({
            data: {
                ...data,
                password: passwordHash
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true
            }
        });
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const updateLocation = async (req, res) => {
    try {
        const nowMs = Date.now();
        const lastMs = locationLastSeen.get(req.user.id);
        if (lastMs && nowMs - lastMs < LOCATION_MIN_INTERVAL_MS) {
            return res.status(429).json({ error: 'Actualización de ubicación demasiado frecuente' });
        }
        locationLastSeen.set(req.user.id, nowMs);

        const { lat, lng } = locationSchema.parse(req.body);
        const now = new Date();
        await prisma.user.update({
            where: { id: req.user.id },
            data: { lastLat: lat, lastLng: lng, lastSeenAt: now }
        });
        // Registrar check-in horario: máximo 1 log por hora por usuario
        const hourStart = new Date(now);
        hourStart.setMinutes(0, 0, 0);
        const existing = await prisma.locationLog.findFirst({
            where: { userId: req.user.id, createdAt: { gte: hourStart } }
        });
        if (!existing) {
            await prisma.locationLog.create({ data: { userId: req.user.id } });
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getTodayCheckIns = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const logs = await prisma.locationLog.findMany({
            where: { createdAt: { gte: todayStart, lt: todayEnd } },
            select: { userId: true, createdAt: true }
        });

        // Agrupar por usuario: { userId → Set de horas con check-in }
        const byUser = {};
        logs.forEach(({ userId, createdAt }) => {
            if (!byUser[userId]) byUser[userId] = [];
            const h = new Date(createdAt).getHours();
            if (!byUser[userId].includes(h)) byUser[userId].push(h);
        });

        res.json(byUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getAgentLocations = async (req, res) => {
    try {
        const agents = await prisma.user.findMany({
            where: { role: 'AGENT' },
            select: { id: true, name: true, lastLat: true, lastLng: true, lastSeenAt: true, connectedSince: true }
        });
        res.json(agents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const saveFcmToken = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'token requerido' });

        // M6: Upsert en tabla de tokens — un usuario puede tener múltiples dispositivos
        await prisma.userFcmToken.upsert({
            where: { token },
            update: { userId: req.user.id },
            create: { userId: req.user.id, token }
        });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    role: z.enum(['AGENT', 'ADMIN']).optional(),
    password: z.string().min(6).optional()
});

export const updateUser = async (req, res) => {
    let userId;
    try { userId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    try {
        const data = updateUserSchema.parse(req.body);
        const updateData = { ...data };
        if (data.password) {
            updateData.password = await hashPassword(data.password);
        } else {
            delete updateData.password;
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, name: true, role: true }
        });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// C5: Validar IDs de URL
function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

export const deleteUser = async (req, res) => {
    const { id } = req.params;

    let userId;
    try { userId = parseId(id); } catch {
        return res.status(400).json({ error: 'ID de usuario inválido' });
    }

    // Prevent deleting yourself
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    try {
        await prisma.user.delete({ where: { id: userId } });
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
