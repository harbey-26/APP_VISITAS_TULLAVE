import { Router } from 'express';
import { getProperties, createProperty, updateProperty, deleteProperty } from '../controllers/property.controller.js';
import { verifyToken } from '../utils/auth.js';

const router = Router();

// Middleware auth
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        verifyToken(token);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

router.use(authenticate);

router.get('/', getProperties);
router.post('/', createProperty);
router.put('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;
