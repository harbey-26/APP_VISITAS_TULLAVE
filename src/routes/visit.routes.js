import { Router } from 'express';
import { getVisits, getVisitStats, createVisit, startVisit, finishVisit, deleteVisit } from '../controllers/visit.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/stats', requireAdmin, getVisitStats); // M3: antes del /:id para no colisionar
router.get('/', getVisits);
router.post('/', createVisit);
router.patch('/:id/start', startVisit);
router.patch('/:id/finish', finishVisit);
router.delete('/:id', deleteVisit);

export default router;
