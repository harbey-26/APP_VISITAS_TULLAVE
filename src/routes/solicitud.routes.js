import { Router } from 'express';
import {
    getSolicitudes, createSolicitud, getSolicitud, updateSolicitud,
    cambiarEstado, asignarSolicitud, agregarNota,
    agregarAdjuntos, getAdjunto, toggleAdjuntoCliente, deleteSolicitud,
    getTipos, createTipo, updateTipo,
    updateData, registrarRespuesta,
    shareServicioPdf, emailServicioPdf, publicServicioPdf,
    getStats,
} from '../controllers/solicitud.controller.js';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth.middleware.js';

const router = Router();

// Pública (sin JWT): PDF de la liquidación de servicio desde el link
// tokenizado de WhatsApp/correo. Va ANTES del authenticate.
router.get('/public/:token/servicio-pdf', publicServicioPdf);

router.use(authenticate);

// Tipos (#35) y stats (#40) — antes de '/:id' para que no los capture
router.get('/tipos', getTipos);
router.post('/tipos', requireAdmin, createTipo);
router.patch('/tipos/:id', requireAdmin, updateTipo);
router.get('/stats', getStats);

// Expedientes (#34)
router.get('/', getSolicitudes);
router.post('/', createSolicitud);
router.get('/:id', getSolicitud);
router.patch('/:id', updateSolicitud);
router.delete('/:id', deleteSolicitud);

// Flujo (#33), asignación (#43) y línea de tiempo (#38)
router.patch('/:id/estado', cambiarEstado);
router.patch('/:id/asignar', requireStaff, asignarSolicitud);
router.post('/:id/notas', agregarNota);

// Adjuntos (#39)
router.post('/:id/adjuntos', agregarAdjuntos);
router.get('/:id/adjuntos/:adjId', getAdjunto);
router.patch('/:id/adjuntos/:adjId', toggleAdjuntoCliente); // #60: publicar/retirar del portal

// Automatizaciones (#36, #37, #41, #42)
router.patch('/:id/data', updateData);
router.post('/:id/respuesta', registrarRespuesta);
router.post('/:id/servicio-share', shareServicioPdf);
router.post('/:id/servicio-email', emailServicioPdf);

export default router;
