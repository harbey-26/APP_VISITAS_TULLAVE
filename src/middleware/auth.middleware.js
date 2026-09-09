import { verifyToken } from '../utils/auth.js';
import prisma from '../utils/prisma.js';
import { esStaff } from '../utils/roles.js';

// A8: ¿la versión de sesión del token sigue vigente en BD? (false si el
// usuario ya no existe). Para validadores de token fuera de este middleware.
export const tokenVersionOk = async (decoded) => {
    const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { tokenVersion: true },
    });
    return !!user && (decoded.tv ?? 0) === user.tokenVersion;
};

export const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token de autenticación no proporcionado' });

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (e) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // A8: revocación de sesiones — el token lleva la versión con la que se
    // emitió (`tv`); cambiar la contraseña la incrementa en BD y todos los
    // tokens anteriores quedan inválidos al instante (también los de un
    // usuario eliminado). Los tokens previos a este cambio no traen `tv`
    // (cuenta como 0, la versión inicial de todos los usuarios).
    //
    // El ROL se toma SIEMPRE de la BD, no del token: el JWT lleva el rol con
    // el que se emitió y, si el admin cambia el rol del usuario (agente →
    // asistente), la sesión abierta seguía actuando con el rol viejo hasta
    // renovarse (un asistente agendaba visitas a su propio nombre, o su UI de
    // agente chocaba con un backend que ya lo trataba como asistente).
    let current;
    try {
        current = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { tokenVersion: true, role: true },
        });
    } catch (e) {
        // BD caída ≠ sesión inválida: 503 evita desloguear a todos por un parpadeo
        return res.status(503).json({ error: 'Servicio no disponible, intenta de nuevo' });
    }
    if (!current || (decoded.tv ?? 0) !== current.tokenVersion) {
        return res.status(401).json({ error: 'Sesión revocada. Inicia sesión de nuevo.' });
    }

    req.user = { ...decoded, role: current.role };
    next();
};

export const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de administrador' });
    }
    next();
};

// Staff = ADMIN o ASISTENTE: visibilidad de administrador (dashboard, rastreo,
// listados globales). Las acciones que autorizan siguen bajo requireAdmin.
export const requireStaff = (req, res, next) => {
    if (!req.user || !esStaff(req.user.role)) {
        return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de administrador o asistente' });
    }
    next();
};

