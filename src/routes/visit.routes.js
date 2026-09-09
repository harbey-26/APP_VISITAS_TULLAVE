import { Router } from 'express';
import { getVisits, getVisitStats, getAgentStats, createVisit, updateVisit, startVisit, finishVisit, completeCallVisit, deleteVisit, markMissed, cancelVisit, confirmVisit, reassignVisit, addVisitImage, getVisitImages, deleteVisitImage, cleanupPendingVisits } from '../controllers/visit.controller.js';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/stats', requireStaff, getVisitStats);
router.get('/stats/agents', requireStaff, getAgentStats);
router.get('/', getVisits);
// #71: el ASISTENTE gestiona la agenda de todos (crear, editar, reasignar y
// CONFIRMAR la cita por WhatsApp). Sep 2026: también puede tener visitas
// asignadas y ejecutarlas, pero SOLO las suyas — iniciar, finalizar, marcar
// no atendida, cancelar, fotos y eliminar exigen "dueño o ADMIN" en cada
// controlador, así que un asistente recibe 403 en las visitas ajenas.
router.post('/', createVisit);
router.post('/cleanup-pending', requireAdmin, cleanupPendingVisits); // Depurar pendientes vencidas en bloque
router.patch('/:id', updateVisit);                                           // Editar visita (dueño/staff)
router.patch('/:id/start', startVisit);
router.patch('/:id/finish', finishVisit);
router.patch('/:id/complete-call', completeCallVisit);      // Captación por llamada (sin GPS)
router.patch('/:id/missed', markMissed);                    // A2: marcar no atendida
router.patch('/:id/cancel', cancelVisit);                   // Cancelar pendiente con motivo (avisa al admin)
router.patch('/:id/confirm', confirmVisit);                                  // Confirmar cita con el cliente (WhatsApp) — dueño/staff
router.patch('/:id/reassign', requireStaff, reassignVisit); // M2: reasignar (admin/asistente)
router.get('/:id/images', getVisitImages);                  // M1: listar fotos
router.post('/:id/images', addVisitImage); // M1: subir foto
router.delete('/:id/images/:imageId', deleteVisitImage); // M1: eliminar foto
router.delete('/:id', deleteVisit);

export default router;
