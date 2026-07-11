import { Router } from 'express';
import {
    getContracts, getContract, createContract, updateContract,
    submitContract, reviewContract, deleteContract,
} from '../controllers/contract.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getContracts);
router.post('/', createContract);
router.get('/:id', getContract);
router.patch('/:id', updateContract);
router.patch('/:id/submit', submitContract);
router.patch('/:id/review', requireAdmin, reviewContract);
router.delete('/:id', deleteContract);

export default router;
