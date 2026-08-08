import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, updateLocation, getAgentLocations, getTodayCheckIns, saveFcmToken } from '../controllers/user.controller.js';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

// Cualquier usuario autenticado puede actualizar su ubicación y token FCM
router.patch('/location', updateLocation);
router.patch('/fcm-token', saveFcmToken);

// Lectura para staff (admin y asistente): listado para filtros/asignaciones,
// rastreo y check-ins. La GESTIÓN de usuarios sigue siendo solo del admin.
router.get('/', requireStaff, getUsers);
router.get('/locations', requireStaff, getAgentLocations);
router.get('/checkins/today', requireStaff, getTodayCheckIns);

// Las siguientes rutas solo son accesibles para administradores
router.use(requireAdmin);

router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
