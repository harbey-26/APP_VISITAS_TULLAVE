import { Router } from 'express';
import { getVisits, getVisitStats, getAgentStats, createVisit, updateVisit, startVisit, finishVisit, completeCallVisit, deleteVisit, markMissed, cancelVisit, confirmVisit, reassignVisit, addVisitImage, getVisitImages, deleteVisitImage, cleanupPendingVisits } from '../controllers/visit.controller.js';
import { authenticate, requireAdmin, requireStaff, forbidAsistente } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/stats', requireStaff, getVisitStats);
router.get('/stats/agents', requireStaff, getAgentStats);
router.get('/', getVisits);
// #71: el ASISTENTE gestiona la agenda (crear, editar y reasignar visitas)
// pero NO las ejecuta ni las cierra: iniciar, finalizar, marcar no atendida,
// cancelar, confirmar, fotos y eliminar siguen vetados con forbidAsistente.
router.post('/', createVisit);
router.post('/cleanup-pending', requireAdmin, cleanupPendingVisits); // Depurar pendientes vencidas en bloque
router.patch('/:id', updateVisit);                                           // Editar visita (dueño/staff)
router.patch('/:id/start', forbidAsistente, startVisit);
router.patch('/:id/finish', forbidAsistente, finishVisit);
router.patch('/:id/complete-call', forbidAsistente, completeCallVisit);      // Captación por llamada (sin GPS)
router.patch('/:id/missed', forbidAsistente, markMissed);                    // A2: marcar no atendida
router.patch('/:id/cancel', forbidAsistente, cancelVisit);                   // Cancelar pendiente con motivo (avisa al admin)
router.patch('/:id/confirm', forbidAsistente, confirmVisit);                 // Confirmar cita con el cliente (WhatsApp)
router.patch('/:id/reassign', requireStaff, reassignVisit); // M2: reasignar (admin/asistente)
router.get('/:id/images', getVisitImages);                  // M1: listar fotos
router.post('/:id/images', forbidAsistente, addVisitImage); // M1: subir foto
router.delete('/:id/images/:imageId', forbidAsistente, deleteVisitImage); // M1: eliminar foto
router.delete('/:id', forbidAsistente, deleteVisit);

export default router;
