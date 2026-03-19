import { Router } from 'express';
import { login, register, refresh } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/refresh', authenticate, refresh);

export default router;
