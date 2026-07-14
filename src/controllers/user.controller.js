import prisma from '../utils/prisma.js';
import { z } from 'zod';
import { hashPassword } from '../utils/auth.js';

const locationSchema = z.object({
    lat: z.number(),
    lng: z.number()
});

// A5: Rate limit en BD — usa lastSeenAt del usuario para persistir entre reinicios
const LOCATION_MIN_INTERVAL_MS = 10_000;

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    phone: z.string().trim().optional(),
    role: z.enum(['AGENT', 'ADMIN'])
});

export const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
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
                phone: data.phone || null,
                password: passwordHash
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
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
        const { lat, lng } = locationSchema.parse(req.body);
        const now = new Date();

        // A5: Rate limit en BD — leer lastSeenAt antes de actualizar
        const record = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { lastSeenAt: true }
        });
        if (record?.lastSeenAt && now - record.lastSeenAt < LOCATION_MIN_INTERVAL_MS) {
            return res.status(429).json({ error: 'Actualización de ubicación demasiado frecuente' });
        }
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

// Colombia es siempre UTC-5 (sin horario de verano)
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function hourInBogota(date) {
    return Math.floor(((new Date(date).getTime() - BOGOTA_OFFSET_MS) / (60 * 60 * 1000)) % 24 + 24) % 24;
}

function todayBoundsBogota() {
    const nowBogotaMs = Date.now() - BOGOTA_OFFSET_MS;
    const midnightBogotaMs = nowBogotaMs - (nowBogotaMs % (24 * 60 * 60 * 1000));
    const start = new Date(midnightBogotaMs + BOGOTA_OFFSET_MS); // convierte de vuelta a UTC
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export const getTodayCheckIns = async (req, res) => {
    try {
        const { start, end } = todayBoundsBogota();

        const logs = await prisma.locationLog.findMany({
            where: { createdAt: { gte: start, lt: end } },
            select: { userId: true, createdAt: true }
        });

        const byUser = {};
        logs.forEach(({ userId, createdAt }) => {
            if (!byUser[userId]) byUser[userId] = [];
            const h = hourInBogota(createdAt);
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
            select: {
                id: true, name: true, lastLat: true, lastLng: true, lastSeenAt: true, connectedSince: true,
                // Dispositivos con push registrado — 0 = ese agente NO recibe notificaciones
                _count: { select: { fcmTokens: true } },
            }
        });
        res.json(agents.map(({ _count, ...a }) => ({ ...a, notifDevices: _count.fcmTokens })));
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
    phone: z.string().trim().optional(),
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
        // Teléfono vacío → null (limpiar el campo)
        if (data.phone !== undefined) {
            updateData.phone = data.phone || null;
        }

        // Hardening: un admin NO puede modificar a otro admin (role/password/email),
        // así se evita escalada lateral o golpes mutuos entre admins. El propio
        // admin sí puede modificarse a sí mismo. Promover agente → admin requiere
        // acción manual en BD para evitar accidentes.
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true },
        });
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (target.role === 'ADMIN' && target.id !== req.user.id) {
            return res.status(403).json({ error: 'No puedes modificar a otro administrador.' });
        }
        if (updateData.role === 'ADMIN' && target.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Promover a admin requiere acción manual en base de datos.' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, name: true, phone: true, role: true }
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
        // Hardening: un admin no puede eliminar a otro admin (proteger la cuenta
        // raíz contra golpes mutuos y bloqueo accidental).
        const target = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true },
        });
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (target.role === 'ADMIN') {
            return res.status(403).json({ error: 'No se puede eliminar a otro administrador.' });
        }
        await prisma.user.delete({ where: { id: userId } });
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
