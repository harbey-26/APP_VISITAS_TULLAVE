import { Router } from 'express';
import { getVisits, getVisitStats, createVisit, startVisit, finishVisit, deleteVisit, markMissed, reassignVisit, addVisitImage, getVisitImages, deleteVisitImage } from '../controllers/visit.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/stats', requireAdmin, getVisitStats); // M3: antes del /:id para no colisionar
router.get('/', getVisits);
router.post('/', createVisit);
router.patch('/:id/start', startVisit);
router.patch('/:id/finish', finishVisit);
router.patch('/:id/missed', markMissed);                    // A2: marcar no atendida
router.patch('/:id/reassign', requireAdmin, reassignVisit); // M2: reasignar (admin)
router.get('/:id/images', getVisitImages);                  // M1: listar fotos
router.post('/:id/images', addVisitImage);                  // M1: subir foto
router.delete('/:id/images/:imageId', deleteVisitImage);    // M1: eliminar foto
router.delete('/:id', deleteVisit);

export default router;
