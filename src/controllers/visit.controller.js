import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { comparePassword } from '../utils/auth.js';

const prisma = new PrismaClient();

const createVisitSchema = z.object({
    propertyId: z.number(),
    scheduledStart: z.string().datetime(),
    estimatedDuration: z.number(),
    type: z.enum(['SHOWING', 'APPRAISAL', 'INSPECTION']),
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
    notes: z.string().optional()
});

export const getVisits = async (req, res) => {
    const { id: userId, role } = req.user; // From auth middleware
    const { date, id } = req.query; // YYYY-MM-DD or specific ID

    try {
        const where = {};

        // Only filter by userId if NOT admin
        if (role !== 'ADMIN') {
            where.userId = userId;
        }

        if (id) {
            // Filter by specific ID if provided
            where.id = parseInt(id);
        } else if (date) {
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        }

        const visits = await prisma.visit.findMany({
            where,
            include: { property: true },
            orderBy: { scheduledStart: 'asc' }
        });
        res.json(visits);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createVisit = async (req, res) => {
    try {
        const data = createVisitSchema.parse(req.body);

        // Parse date
        const scheduledStart = new Date(data.scheduledStart);

        const visit = await prisma.visit.create({
            data: {
                userId: req.user.id,
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


// Helper: Calculate distance in meters
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
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

export const startVisit = async (req, res) => {
    const { id } = req.params;
    try {
        const data = startVisitSchema.parse(req.body);

        // Fetch visit with property location
        const visit = await prisma.visit.findUnique({
            where: { id: parseInt(id) },
            include: { property: true }
        });

        if (!visit) {
            return res.status(404).json({ error: 'Visita no encontrada' });
        }

        if (visit.property && visit.property.lat && visit.property.lng) {
            const distance = getDistanceInMeters(data.lat, data.lng, visit.property.lat, visit.property.lng);
            const MAX_DISTANCE_METERS = 500;

            if (distance > MAX_DISTANCE_METERS) {
                return res.status(400).json({
                    error: `Estás demasiado lejos de la propiedad (${Math.round(distance)}m). Debes estar a menos de ${MAX_DISTANCE_METERS}m.`
                });
            }
        }

        const updatedVisit = await prisma.visit.update({
            where: { id: parseInt(id) },
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

        const visit = await prisma.visit.update({
            where: { id: parseInt(id) },
            data: {
                status: 'COMPLETED',
                actualEnd: new Date(),
                checkOutLat: data.lat,
                checkOutLng: data.lng,
                notes: data.notes
            }
        });
        res.json(visit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteVisit = async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Debes ingresar tu contraseña para confirmar.' });
    }

    let isAuthorized = false;

    // 1. Check specific requested password
    if (password === 'Daniel2809') {
        isAuthorized = true;
    } else {
        // 2. Fallback: Check User Login Password
        try {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (user) {
                isAuthorized = await comparePassword(password, user.password);
            }
        } catch (error) {
            console.error('Error verifying password:', error);
        }
    }

    if (!isAuthorized) {
        return res.status(403).json({ error: 'Contraseña incorrecta' });
    }

    try {
        await prisma.visit.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Visita eliminada correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
