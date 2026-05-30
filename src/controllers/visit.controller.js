import prisma from '../utils/prisma.js';
import { z } from 'zod';
import { comparePassword, hashPassword } from '../utils/auth.js';

// C2: Cachear el hash de MASTER_DELETE_PASSWORD al primer uso para nunca comparar plaintext
let _masterHash = null;
async function getMasterHash() {
    if (!_masterHash && process.env.MASTER_DELETE_PASSWORD) {
        _masterHash = await hashPassword(process.env.MASTER_DELETE_PASSWORD);
    }
    return _masterHash;
}

const createVisitSchema = z.object({
    propertyId: z.number(),
    scheduledStart: z.string().datetime(),
    estimatedDuration: z.number(),
    type: z.enum([
        'RENTAL_SHOWING',   // Mostrar inmueble en arriendo
        'PROPERTY_INTAKE',  // Captación de inmueble
        'HANDOVER',         // Entrega de inmueble
        'MOVE_OUT',         // Desocupación
        'INSPECTION',       // Inspección
        'OTHER'             // Otro
    ]),
    notes: z.string().optional(),
    clientName: z.string().optional(),
    clientPhone: z.string().optional()
});

const startVisitSchema = z.object({
    lat: z.number(),
    lng: z.number()
});

const finishVisitSchema = z.object({
    lat: z.number(),
    lng: z.number(),
    notes: z.string().optional(),
    outcome: z.enum([
        'Cliente interesado',
        'Cliente no interesado',
        'Requiere seguimiento',
        'Cliente no asistió',
        'Cancelada'
    ])
});

export const getVisits = async (req, res) => {
    const { id: userId, role } = req.user;
    const { date, startDate, endDate, id, outcome, page, limit: limitParam } = req.query;

    try {
        // A2: Excluir visitas con soft delete
        const where = { deletedAt: null };

        if (role !== 'ADMIN') {
            where.userId = userId;
        }

        if (id) {
            where.id = parseInt(id);
        } else if (startDate && endDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        } else if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        }

        if (outcome) {
            where.outcome = outcome;
        }

        const include = {
            property: true,
            user: { select: { id: true, name: true } },
            images: { take: 1, orderBy: { id: 'asc' }, select: { url: true } }
        };
        const orderBy = { scheduledStart: 'asc' };

        // A3: Paginación — solo cuando se pasa el parámetro ?page
        if (page !== undefined) {
            const currentPage = Math.max(1, parseInt(page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(limitParam) || 50));
            const skip = (currentPage - 1) * limit;

            const [visits, total] = await Promise.all([
                prisma.visit.findMany({ where, include, orderBy, skip, take: limit }),
                prisma.visit.count({ where })
            ]);

            return res.json({ visits, total, page: currentPage, limit, totalPages: Math.ceil(total / limit) });
        }

        const visits = await prisma.visit.findMany({ where, include, orderBy });
        res.json(visits);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// M3: Estadísticas agregadas en BD — evita descargar miles de visitas al cliente
export const getVisitStats = async (req, res) => {
    const { startDate, endDate, outcome } = req.query;

    try {
        const where = { deletedAt: null };

        if (startDate && endDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        }
        if (outcome) where.outcome = outcome;

        const [totalVisits, completedVisits, interestedVisits, byType, completedDurations, scheduledDates] = await Promise.all([
            prisma.visit.count({ where }),
            prisma.visit.count({ where: { ...where, status: 'COMPLETED' } }),
            prisma.visit.count({ where: { ...where, outcome: 'Cliente interesado' } }),
            prisma.visit.groupBy({ by: ['type'], where, _count: { id: true } }),
            prisma.visit.findMany({
                where: { ...where, status: 'COMPLETED' },
                select: { estimatedDuration: true }
            }),
            prisma.visit.findMany({ where, select: { scheduledStart: true } })
        ]);

        const totalDuration = completedDurations.reduce((acc, v) => acc + (v.estimatedDuration || 0), 0);
        const averageDuration = completedVisits ? Math.round(totalDuration / completedVisits) : 0;
        const conversionRate = totalVisits ? Math.round((interestedVisits / totalVisits) * 100) : 0;
        const visitsByType = Object.fromEntries(byType.map(b => [b.type, b._count.id]));

        // Serie diaria: { 'YYYY-MM-DD': count } en hora local de Bogotá (UTC-5)
        const visitsByDay = {};
        for (const v of scheduledDates) {
            const d = new Date(new Date(v.scheduledStart).getTime() - 5 * 60 * 60 * 1000);
            const key = d.toISOString().split('T')[0];
            visitsByDay[key] = (visitsByDay[key] || 0) + 1;
        }

        res.json({ totalVisits, completedVisits, averageDuration, conversionRate, visitsByType, visitsByDay });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createVisit = async (req, res) => {
    try {
        const schema = createVisitSchema.extend({
            assignedUserId: z.number().optional()
        });
        const data = schema.parse(req.body);

        let targetUserId = req.user.id;
        if (req.user.role === 'ADMIN' && data.assignedUserId) {
            targetUserId = data.assignedUserId;
        }

        const scheduledStart = new Date(data.scheduledStart);
        const durationMs = data.estimatedDuration * 60 * 1000;
        const scheduledEnd = new Date(scheduledStart.getTime() + durationMs);

        const dayStart = new Date(scheduledStart);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(scheduledStart);
        dayEnd.setHours(23, 59, 59, 999);

        const potentialOverlaps = await prisma.visit.findMany({
            where: {
                userId: targetUserId,
                status: { notIn: ['MISSED'] },
                deletedAt: null,
                scheduledStart: { gte: dayStart, lte: dayEnd }
            }
        });

        const hasConflict = potentialOverlaps.some(v => {
            const vStart = new Date(v.scheduledStart);
            const vEnd = new Date(vStart.getTime() + (v.estimatedDuration * 60 * 1000));
            return (scheduledStart < vEnd && scheduledEnd > vStart);
        });

        if (hasConflict) {
            return res.status(400).json({
                error: 'El agente ya tiene una visita programada en ese horario que se solapa con la nueva.'
            });
        }

        const visit = await prisma.visit.create({
            data: {
                userId: targetUserId,
                propertyId: data.propertyId,
                scheduledStart: scheduledStart,
                estimatedDuration: data.estimatedDuration,
                type: data.type,
                notes: data.notes,
                clientName: data.clientName,
                clientPhone: data.clientPhone
            },
            include: {
                property: true
            }
        });
        res.status(201).json(visit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


// Helper: Calculate distance in meters (Haversine formula)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// C5: Validar que un ID de URL sea un entero válido
function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

// B3: Admin reducido a 5km (antes 50km) — mantiene utilidad operativa sin anular el geofencing
function getMaxDistance(role) {
    return role === 'ADMIN' ? 5000 : 1500;
}

export const startVisit = async (req, res) => {
    const { id } = req.params;
    try {
        const data = startVisitSchema.parse(req.body);

        const visit = await prisma.visit.findUnique({
            where: { id: parseId(id) },
            include: { property: true }
        });

        if (!visit || visit.deletedAt) {
            return res.status(404).json({ error: 'Visita no encontrada' });
        }

        // FIX BUG 4: Verificar que la visita pertenece al agente autenticado
        if (visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso para iniciar esta visita.' });
        }

        // FIX BUG 5: Verificar que la visita está en estado PENDING
        if (visit.status !== 'PENDING') {
            return res.status(400).json({ error: 'Solo se pueden iniciar visitas pendientes.' });
        }

        // FIX BUG 3: Bloquear si el inmueble no tiene coordenadas
        if (!visit.property?.lat || !visit.property?.lng) {
            return res.status(400).json({
                error: 'El inmueble no tiene coordenadas registradas. Contacta al administrador para configurarlas antes de iniciar la visita.'
            });
        }

        // Geofencing: verificar distancia al inmueble
        const distance = getDistanceInMeters(data.lat, data.lng, visit.property.lat, visit.property.lng);
        const maxDistance = getMaxDistance(req.user.role);

        if (distance > maxDistance) {
            return res.status(400).json({
                error: `Estás demasiado lejos de la propiedad (${Math.round(distance)}m). Debes estar a menos de ${maxDistance}m para iniciar la visita.`
            });
        }

        const updatedVisit = await prisma.visit.update({
            where: { id: parseId(id) },
            data: {
                status: 'IN_PROGRESS',
                actualStart: new Date(),
                checkInLat: data.lat,
                checkInLng: data.lng
            }
        });
        res.json(updatedVisit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};


export const finishVisit = async (req, res) => {
    const { id } = req.params;
    try {
        const data = finishVisitSchema.parse(req.body);

        // FIX BUG 1: Fetchear la visita con su propiedad para poder validar ubicación
        const visit = await prisma.visit.findUnique({
            where: { id: parseId(id) },
            include: { property: true }
        });

        if (!visit || visit.deletedAt) {
            return res.status(404).json({ error: 'Visita no encontrada' });
        }

        // FIX BUG 4: Verificar que la visita pertenece al agente autenticado
        if (visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso para finalizar esta visita.' });
        }

        // FIX BUG 5: Verificar que la visita está en estado IN_PROGRESS
        if (visit.status !== 'IN_PROGRESS') {
            return res.status(400).json({ error: 'Solo se pueden finalizar visitas que estén en curso.' });
        }

        // C1: Bloquear si el inmueble no tiene coordenadas — igual que startVisit
        if (!visit.property?.lat || !visit.property?.lng) {
            return res.status(400).json({
                error: 'El inmueble no tiene coordenadas registradas. Contacta al administrador para configurarlas antes de finalizar la visita.'
            });
        }

        // Geofencing al finalizar — el agente debe estar en el inmueble
        const distance = getDistanceInMeters(data.lat, data.lng, visit.property.lat, visit.property.lng);
        const maxDistance = getMaxDistance(req.user.role);

        if (distance > maxDistance) {
            return res.status(400).json({
                error: `Estás demasiado lejos de la propiedad (${Math.round(distance)}m). Debes estar a menos de ${maxDistance}m para finalizar la visita.`
            });
        }

        const updatedVisit = await prisma.visit.update({
            where: { id: parseId(id) },
            data: {
                status: 'COMPLETED',
                actualEnd: new Date(),
                checkOutLat: data.lat,
                checkOutLng: data.lng,
                notes: data.notes,
                outcome: data.outcome
            }
        });
        res.json(updatedVisit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAgentStats = async (req, res) => {
    const { startDate, endDate } = req.query;
    try {
        const where = { deletedAt: null };
        if (startDate && endDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        }

        const visits = await prisma.visit.findMany({
            where,
            select: {
                userId: true,
                status: true,
                outcome: true,
                estimatedDuration: true,
                user: { select: { id: true, name: true } }
            }
        });

        const agentMap = new Map();
        visits.forEach(v => {
            if (!agentMap.has(v.userId)) {
                agentMap.set(v.userId, {
                    userId: v.userId,
                    name: v.user?.name || 'Desconocido',
                    total: 0, completed: 0, missed: 0, interested: 0, totalDuration: 0
                });
            }
            const a = agentMap.get(v.userId);
            a.total++;
            if (v.status === 'COMPLETED') { a.completed++; a.totalDuration += v.estimatedDuration || 0; }
            if (v.status === 'MISSED') a.missed++;
            if (v.outcome === 'Cliente interesado') a.interested++;
        });

        const result = Array.from(agentMap.values()).map(a => ({
            userId: a.userId,
            name: a.name,
            totalVisits: a.total,
            completedVisits: a.completed,
            missedVisits: a.missed,
            conversionRate: a.total ? Math.round((a.interested / a.total) * 100) : 0,
            averageDuration: a.completed ? Math.round(a.totalDuration / a.completed) : 0,
        })).sort((a, b) => b.completedVisits - a.completedVisits);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteVisit = async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Debes ingresar tu contraseña para confirmar.' });
    }

    // C5: Validar ID
    let visitId;
    try { visitId = parseId(id); } catch {
        return res.status(400).json({ error: 'ID de visita inválido' });
    }

    let isAuthorized = false;

    // C2: Comparar con hash en lugar de plaintext
    const masterHash = await getMasterHash();
    if (masterHash && await comparePassword(password, masterHash)) {
        isAuthorized = true;
    } else {
        try {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (user) {
                isAuthorized = await comparePassword(password, user.password);
            }
        } catch {
            // Error interno — no exponer detalles
        }
    }

    if (!isAuthorized) {
        return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    try {
        // A2: Soft delete — marcar como eliminada en lugar de borrar el registro
        await prisma.visit.update({ where: { id: visitId }, data: { deletedAt: new Date() } });
        res.json({ message: 'Visita eliminada correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// A2: Marcar visita como no atendida (MISSED) — el agente o admin la marca manualmente
export const markMissed = async (req, res) => {
    let visitId;
    try { visitId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de visita inválido' });
    }
    try {
        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit || visit.deletedAt) return res.status(404).json({ error: 'Visita no encontrada' });
        if (visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sin permiso para modificar esta visita.' });
        }
        if (visit.status !== 'PENDING') {
            return res.status(400).json({ error: 'Solo se pueden marcar como no atendidas las visitas pendientes.' });
        }
        const updated = await prisma.visit.update({ where: { id: visitId }, data: { status: 'MISSED' } });
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// M2: Reasignar visita a otro agente (solo admin)
const reassignSchema = z.object({ assignedUserId: z.number().int().positive() });

export const reassignVisit = async (req, res) => {
    let visitId;
    try { visitId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de visita inválido' });
    }
    try {
        const { assignedUserId } = reassignSchema.parse(req.body);
        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit || visit.deletedAt) return res.status(404).json({ error: 'Visita no encontrada' });
        if (!['PENDING', 'IN_PROGRESS'].includes(visit.status)) {
            return res.status(400).json({ error: 'Solo se pueden reasignar visitas pendientes o en curso.' });
        }
        const newUser = await prisma.user.findUnique({ where: { id: assignedUserId } });
        if (!newUser) return res.status(404).json({ error: 'Agente no encontrado' });

        const updated = await prisma.visit.update({
            where: { id: visitId },
            data: { userId: assignedUserId },
            include: { property: true, user: { select: { id: true, name: true } } }
        });
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// M1: Subir imagen de visita (base64 data URI)
const imageSchema = z.object({ data: z.string().min(1) });

export const addVisitImage = async (req, res) => {
    let visitId;
    try { visitId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de visita inválido' });
    }
    try {
        const { data } = imageSchema.parse(req.body);
        if (!data.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Formato de imagen inválido' });
        }
        if (data.length > 2_500_000) {
            return res.status(400).json({ error: 'Imagen demasiado grande (máximo ~2MB)' });
        }
        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit || visit.deletedAt) return res.status(404).json({ error: 'Visita no encontrada' });
        if (visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sin permiso para subir imágenes en esta visita.' });
        }
        const image = await prisma.visitImage.create({ data: { visitId, url: data } });
        res.status(201).json({ id: image.id });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getVisitImages = async (req, res) => {
    let visitId;
    try { visitId = parseId(req.params.id); } catch {
        return res.status(400).json({ error: 'ID de visita inválido' });
    }
    try {
        const visit = await prisma.visit.findUnique({ where: { id: visitId } });
        if (!visit || visit.deletedAt) return res.status(404).json({ error: 'Visita no encontrada' });
        if (visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sin permiso' });
        }
        const images = await prisma.visitImage.findMany({ where: { visitId }, select: { id: true, url: true } });
        res.json(images);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteVisitImage = async (req, res) => {
    let imageId;
    try { imageId = parseId(req.params.imageId); } catch {
        return res.status(400).json({ error: 'ID de imagen inválido' });
    }
    try {
        const image = await prisma.visitImage.findUnique({
            where: { id: imageId },
            include: { visit: true }
        });
        if (!image) return res.status(404).json({ error: 'Imagen no encontrada' });
        if (image.visit.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sin permiso' });
        }
        await prisma.visitImage.delete({ where: { id: imageId } });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
