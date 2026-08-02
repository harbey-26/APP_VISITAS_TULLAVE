import { Router } from 'express';
import { authenticatePortal } from '../middleware/portalAuth.middleware.js';
import {
    solicitarCodigo, verificarCodigo,
    getTipos, getMisSolicitudes, getMiSolicitud, crearSolicitud, comentar,
} from '../controllers/portal.controller.js';

// P1: Portal de Clientes. Todas las rutas viven bajo /api/portal y usan su
// PROPIO middleware (authenticatePortal) — nunca el del equipo.
const router = Router();

router.post('/auth/solicitar-codigo', solicitarCodigo);
router.post('/auth/verificar', verificarCodigo);

router.get('/tipos', authenticatePortal, getTipos);
router.get('/solicitudes', authenticatePortal, getMisSolicitudes);
router.post('/solicitudes', authenticatePortal, crearSolicitud);
router.get('/solicitudes/:id', authenticatePortal, getMiSolicitud);
router.post('/solicitudes/:id/comentario', authenticatePortal, comentar);

export default router;
