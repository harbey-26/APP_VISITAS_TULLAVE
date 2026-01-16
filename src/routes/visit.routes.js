import { Router } from 'express';
import { getVisits, createVisit, startVisit, finishVisit, deleteVisit } from '../controllers/visit.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getVisits);
router.post('/', createVisit);
router.patch('/:id/start', startVisit);
router.patch('/:id/finish', finishVisit);
router.delete('/:id', deleteVisit);

export default router;
