import { Router } from 'express';
import authRoutes from './auth.routes.js';
import visitRoutes from './visit.routes.js';
import propertyRoutes from './property.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.get('/', (req, res) => {
    res.send('API Root');
});

router.use('/auth', authRoutes);
router.use('/visits', visitRoutes);
router.use('/properties', propertyRoutes);
router.use('/users', userRoutes);

export default router;
