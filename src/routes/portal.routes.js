import { Router } from 'express';
import { authenticatePortal } from '../middleware/portalAuth.middleware.js';
import { limitePorIp } from '../utils/rateLimit.js';
import {
    solicitarCodigo, verificarCodigo,
    getTipos, getMisSolicitudes, getMiSolicitud, crearSolicitud, comentar,
    getRespuestaAdjunto,
} from '../controllers/portal.controller.js';

// P1: Portal de Clientes. Todas las rutas viven bajo /api/portal y usan su
// PROPIO middleware (authenticatePortal) — nunca el del equipo.
const router = Router();

// Límites por IP: el tope por correo no frena a quien rota destinatarios
// (cada código gasta un envío de la cuenta Gmail de la empresa) ni a quien
// escribe en masa con una sesión válida.
const limiteCodigos = limitePorIp({
    maximo: 10, ventanaMs: 15 * 60 * 1000,
    mensaje: 'Demasiadas solicitudes de código desde esta conexión. Espera unos minutos.',
});
const limiteVerificar = limitePorIp({
    maximo: 30, ventanaMs: 15 * 60 * 1000,
    mensaje: 'Demasiados intentos desde esta conexión. Espera unos minutos.',
});
const limiteEscritura = limitePorIp({
    maximo: 30, ventanaMs: 60 * 60 * 1000,
    mensaje: 'Demasiadas solicitudes desde esta conexión. Intenta más tarde.',
});

router.post('/auth/solicitar-codigo', limiteCodigos, solicitarCodigo);
router.post('/auth/verificar', limiteVerificar, verificarCodigo);

router.get('/tipos', authenticatePortal, getTipos);
router.get('/solicitudes', authenticatePortal, getMisSolicitudes);
router.post('/solicitudes', limiteEscritura, authenticatePortal, crearSolicitud);
router.get('/solicitudes/:id', authenticatePortal, getMiSolicitud);
router.post('/solicitudes/:id/comentario', limiteEscritura, authenticatePortal, comentar);
// #60: descarga de documentos visibles para el cliente (publicados por el
// equipo o referenciados en la respuesta). La ruta vieja se conserva por
// compatibilidad con portales ya cargados en el navegador.
router.get('/solicitudes/:id/documentos/:adjId', authenticatePortal, getRespuestaAdjunto);
router.get('/solicitudes/:id/respuesta-adjuntos/:adjId', authenticatePortal, getRespuestaAdjunto);

export default router;
