import { Router } from 'express';
import { createBroadcast, getBroadcasts, getPendingBroadcasts, getInbox, markBroadcastRead, markAllBroadcastsRead } from '../controllers/broadcast.controller.js';
import { authenticate, requireStaff } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Agentes y admins: bandeja de notificaciones, pendientes y marcar como leídos
router.get('/inbox', getInbox);
router.get('/pending', getPendingBroadcasts);
router.post('/read-all', markAllBroadcastsRead);
router.post('/:id/read', markBroadcastRead);

// Staff (admin y asistente): crear y listar comunicados desde Rastreo
router.use(requireStaff);
router.post('/', createBroadcast);
router.get('/', getBroadcasts);

export default router;
