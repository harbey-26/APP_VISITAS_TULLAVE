import { Router } from 'express';
import { createBroadcast, getBroadcasts, getPendingBroadcasts, markBroadcastRead } from '../controllers/broadcast.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Agentes: consultar pendientes y marcar como leídos
router.get('/pending', getPendingBroadcasts);
router.post('/:id/read', markBroadcastRead);

// Solo admins: crear y listar comunicados
router.use(requireAdmin);
router.post('/', createBroadcast);
router.get('/', getBroadcasts);

export default router;
