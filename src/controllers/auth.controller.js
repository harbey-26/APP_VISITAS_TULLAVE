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
    name: z.string().min(2)
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string()
});

export const register = async (req, res) => {
    try {
        const data = registerSchema.parse(req.body);
        data.email = data.email.toLowerCase(); // U5: normalizar email

        const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
        if (existingUser) {
            return res.status(400).json({ error: 'No se pudo completar el registro' });
        }

        const hashedPassword = await hashPassword(data.password);
        const user = await prisma.user.create({
            data: {
                ...data,
                role: 'AGENT',
                password: hashedPassword
            }
        });

        const token = generateToken(user);
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name, role: user.role });

export const refresh = async (req, res) => {
    try {
        // req.user ya fue validado por el middleware authenticate
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(401).json({ error: 'No se pudo renovar la sesión' });
        const token = generateToken(user);
        // Devuelve también el usuario para que el frontend refresque el que
        // tiene guardado (rol/nombre pueden haber cambiado desde el login)
        res.json({ token, user: publicUser(user) });
    } catch (error) {
        res.status(401).json({ error: 'No se pudo renovar la sesión' });
    }
};

// Usuario actual según la BD. El frontend lo consulta al arrancar para
// sincronizar el `user` guardado en localStorage (rol/nombre vigentes): si
// el admin cambió el rol, la UI se rearma con el correcto sin reinstalar ni
// borrar datos. Un token revocado responde 401 desde el middleware.
export const me = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
        res.json(publicUser(user));
    } catch (error) {
        res.status(500).json({ error: error.message });
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
        const { email: rawEmail, password } = loginSchema.parse(req.body);
        const email = rawEmail.toLowerCase(); // U5: normalizar email

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
