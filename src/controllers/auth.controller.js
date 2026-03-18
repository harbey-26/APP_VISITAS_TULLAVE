import prisma from '../utils/prisma.js';
import { hashPassword, generateToken, comparePassword } from '../utils/auth.js';
import { z } from 'zod';

// C3: Rate limiting en memoria — máx 5 intentos fallidos por IP en 15 min
const loginAttempts = new Map();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 5;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
        loginAttempts.set(ip, { count: 0, resetAt: now + RATE_WINDOW_MS });
        return null;
    }
    if (entry.count >= MAX_FAILED) {
        return Math.ceil((entry.resetAt - now) / 1000);
    }
    return null;
}

function recordFail(ip) {
    const entry = loginAttempts.get(ip);
    if (entry) entry.count++;
}

function clearAttempts(ip) {
    loginAttempts.delete(ip);
}

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(2),
    role: z.enum(['AGENT', 'ADMIN']).optional()
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

export const register = async (req, res) => {
    try {
        const data = registerSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await hashPassword(data.password);
        const user = await prisma.user.create({
            data: {
                ...data,
                password: hashedPassword
            }
        });

        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const login = async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    // C3: Verificar rate limit antes de procesar
    const retryAfterSec = checkRateLimit(ip);
    if (retryAfterSec !== null) {
        return res.status(429).json({
            error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(retryAfterSec / 60)} minutos.`
        });
    }

    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await comparePassword(password, user.password))) {
            recordFail(ip);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        clearAttempts(ip);

        await prisma.user.update({
            where: { id: user.id },
            data: { connectedSince: new Date() }
        });

        const token = generateToken(user);
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
