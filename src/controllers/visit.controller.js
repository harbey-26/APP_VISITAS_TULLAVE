import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { comparePassword } from '../utils/auth.js';

const prisma = new PrismaClient();

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
    const { id: userId, role } = req.user; // From auth middleware

    const { date, startDate, endDate, id, outcome } = req.query; // YYYY-MM-DD or specific ID or Outcome



    try {
        const where = {};

        // Only filter by userId if NOT admin
        if (role !== 'ADMIN') {
            where.userId = userId;
        }

        if (id) {
            // Filter by specific ID if provided
            where.id = parseInt(id);
        } else if (startDate && endDate) {
            // Filter by Date Range
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.scheduledStart = { gte: start, lte: end };
        } else if (date) {
            // Fallback to single date
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            where.scheduledStart = { gte: start, lte: end };
        }

        if (outcome) {
            where.outcome = outcome;
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
        const schema = createVisitSchema.extend({
            assignedUserId: z.number().optional()
        });
        const data = schema.parse(req.body);

        // Determine target user (Admin can assign, Agent assigns self)
        let targetUserId = req.user.id;
        if (req.user.role === 'ADMIN' && data.assignedUserId) {
            targetUserId = data.assignedUserId;
        }

        // Parse date
        const scheduledStart = new Date(data.scheduledStart);
        const durationMs = data.estimatedDuration * 60 * 1000;
        const scheduledEnd = new Date(scheduledStart.getTime() + durationMs);

        // Validation: Check for overlaps for the target user
        const overlap = await prisma.visit.findFirst({
            where: {
                userId: targetUserId,
                status: { not: 'MISSED' }, // Assume MISSED/CANCELLED doesn't block (adjust if needed)
                AND: [
                    { scheduledStart: { lt: scheduledEnd } },
                    {
                        // We need to calculate end time of existing visit to compare
                        // OR we trust that we don't need exact end-time storage if we compute it on fly?
                        // Prisma doesn't support computed columns in where easily without raw query or storing 'scheduledEnd'.
                        // Let's assume we need to check if existing visit overlaps.
                        // Since we don't store scheduledEnd in DB (only estimatedDuration), validation is trickier in pure Prisma findFirst without fetching all.
                        // Optimization: Fetch visits around that day/time and filter in code, or better:
                        // Just fetch visits that start within a range (e.g. -2 hours to +duration) to minimize fetch size.
                    }
                ]
            }
        });

        // BETTER APPROACH: Fetch visits for that user on that day to be safe and check overlaps in JS
        // to avoid complex/impossible Prisma queries without stored end_date.
        const dayStart = new Date(scheduledStart);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(scheduledStart);
        dayEnd.setHours(23, 59, 59, 999);

        const potentialOverlaps = await prisma.visit.findMany({
            where: {
                userId: targetUserId,
                status: { notIn: ['MISSED'] }, // Exclude status that doesn't block. Add 'CANCELLED' if you have it.
                scheduledStart: {
                    gte: dayStart,
                    lte: dayEnd
                }
            }
        });

        const hasConflict = potentialOverlaps.some(v => {
            const vStart = new Date(v.scheduledStart);
            const vEnd = new Date(vStart.getTime() + (v.estimatedDuration * 60 * 1000));

            // Check intersection: (StartA < EndB) and (EndA > StartB)
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
            // Dynamic Geofencing:
            // - ADMIN: 50km radius (allows remote support/testing/demos)
            // - AGENT: 1500m radius (increased from 500m to accommodate GPS/Map discrepancies)
            const { role } = req.user;
            const MAX_DISTANCE_METERS = role === 'ADMIN' ? 50000 : 1500;

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
                notes: data.notes,
                outcome: data.outcome
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
