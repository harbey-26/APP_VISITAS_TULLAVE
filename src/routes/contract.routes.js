import { Router } from 'express';
import {
    getContracts, getContract, createContract, updateContract,
    submitContract, reviewContract, deleteContract,
    shareContract, emailContract, publicContractPdf,
} from '../controllers/contract.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Pública (sin JWT): el cliente final abre el PDF desde el link tokenizado
// de WhatsApp/correo. Va ANTES del authenticate.
router.get('/public/:token/pdf', publicContractPdf);

router.use(authenticate);

router.get('/', getContracts);
router.post('/', createContract);
router.get('/:id', getContract);
router.patch('/:id', updateContract);
router.patch('/:id/submit', submitContract);
router.patch('/:id/review', requireAdmin, reviewContract);
router.post('/:id/share', shareContract);
router.post('/:id/email', emailContract);
router.delete('/:id', deleteContract);

export default router;
