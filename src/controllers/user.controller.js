import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../utils/auth.js';

const locationSchema = z.object({
    lat: z.number(),
    lng: z.number()
});

const prisma = new PrismaClient();

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
        const { lat, lng } = locationSchema.parse(req.body);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() }
        });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAgentLocations = async (req, res) => {
    try {
        const agents = await prisma.user.findMany({
            where: { role: 'AGENT' },
            select: { id: true, name: true, lastLat: true, lastLng: true, lastSeenAt: true }
        });
        res.json(agents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    try {
        await prisma.user.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
