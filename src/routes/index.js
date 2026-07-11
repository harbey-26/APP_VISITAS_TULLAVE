import { Router } from 'express';
import authRoutes from './auth.routes.js';
import visitRoutes from './visit.routes.js';
import propertyRoutes from './property.routes.js';
import userRoutes from './user.routes.js';
import broadcastRoutes from './broadcast.routes.js';
import integrationRoutes from './integration.routes.js';
import appRoutes from './app.routes.js';
import contractRoutes from './contract.routes.js';

const router = Router();

router.get('/', (req, res) => {
    res.send('API Root');
});

router.use('/auth', authRoutes);
router.use('/visits', visitRoutes);
router.use('/properties', propertyRoutes);
router.use('/users', userRoutes);
router.use('/broadcasts', broadcastRoutes);
router.use('/integrations', integrationRoutes);
router.use('/app', appRoutes);
router.use('/contracts', contractRoutes);

export default router;
