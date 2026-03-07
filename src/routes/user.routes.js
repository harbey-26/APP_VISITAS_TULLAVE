import { Router } from 'express';
import { getUsers, createUser, deleteUser, updateLocation, getAgentLocations, getTodayCheckIns } from '../controllers/user.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Cualquier usuario autenticado puede actualizar su ubicación
router.patch('/location', updateLocation);

// Las siguientes rutas solo son accesibles para administradores
router.use(requireAdmin);

router.get('/', getUsers);
router.post('/', createUser);
router.delete('/:id', deleteUser);
router.get('/locations', getAgentLocations);
router.get('/checkins/today', getTodayCheckIns);

export default router;
