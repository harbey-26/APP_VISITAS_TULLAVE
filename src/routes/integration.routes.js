import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
    getCalendarStatus,
    startCalendarOAuth,
    calendarOAuthCallback,
    disconnectCalendarController,
} from '../controllers/integration.controller.js';

const router = Router();

// El callback de Google llega como navegación (sin header Authorization). Se valida
// con el JWT firmado en "state". Por eso va antes del middleware authenticate.
router.get('/google/callback', calendarOAuthCallback);

// Para iniciar OAuth desde una ventana nueva, aceptamos el JWT en ?token=...
// porque el navegador no manda Authorization en una <a target="_blank">.
router.get('/google/start', (req, res, next) => {
    const t = req.query.token;
    if (!t) return res.status(401).json({ error: 'Falta token' });
    try {
        req.user = jwt.verify(t, process.env.JWT_SECRET);
        if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admin' });
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido' });
    }
}, startCalendarOAuth);

// Resto requiere auth+admin
router.use(authenticate, requireAdmin);
router.get('/google/status', getCalendarStatus);
router.post('/google/disconnect', disconnectCalendarController);

export default router;
