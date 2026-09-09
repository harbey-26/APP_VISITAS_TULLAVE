import { Router } from 'express';
import { login, refresh, me } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', authenticate, refresh);
router.get('/me', authenticate, me);

// El registro público está deshabilitado intencionalmente: cualquiera podría
// crearse una cuenta AGENT y aparecer en la lista del admin. Para crear
// usuarios usar POST /api/users (requiere ser admin autenticado).

export default router;
