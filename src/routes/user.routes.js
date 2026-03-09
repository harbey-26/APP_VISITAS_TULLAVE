import { Router } from 'express';
import { getUsers, createUser, deleteUser, updateLocation, getAgentLocations, getTodayCheckIns, saveFcmToken } from '../controllers/user.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Cualquier usuario autenticado puede actualizar su ubicación y token FCM
router.patch('/location', updateLocation);
router.patch('/fcm-token', saveFcmToken);

// Las siguientes rutas solo son accesibles para administradores
router.use(requireAdmin);

router.get('/', getUsers);
router.post('/', createUser);
router.delete('/:id', deleteUser);
router.get('/locations', getAgentLocations);
router.get('/checkins/today', getTodayCheckIns);

export default router;
