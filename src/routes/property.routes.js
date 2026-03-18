import { Router } from 'express';
import { getProperties, createProperty, updateProperty, deleteProperty } from '../controllers/property.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// A4: Usar el middleware centralizado (eliminado duplicado local)
router.use(authenticate);

router.get('/', getProperties);
router.post('/', createProperty);
router.put('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;
