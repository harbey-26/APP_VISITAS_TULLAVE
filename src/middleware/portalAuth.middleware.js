import { verifyPortalToken } from '../utils/portalAuth.js';

// P1: autenticación del Portal de Clientes. Deja el correo verificado en
// req.portal.email — NUNCA setea req.user: las rutas del portal no comparten
// middleware ni permisos con las del equipo.
export const authenticatePortal = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Sesión no iniciada' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = verifyPortalToken(token);
        req.portal = { email: decoded.email };
        next();
    } catch {
        return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
};
