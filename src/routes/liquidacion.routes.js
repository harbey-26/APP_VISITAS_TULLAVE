import { Router } from 'express';
import {
    getLiquidaciones, getLiquidacion, createLiquidacion, updateLiquidacion,
    syncContrato, submitLiquidacion, reviewLiquidacion, reopenLiquidacion,
    addPago, deletePago, shareLiquidacion, emailLiquidacion,
    publicLiquidacionPdf, deleteLiquidacion, solicitarFechas,
} from '../controllers/liquidacion.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Pública (sin JWT): el arrendatario abre el PDF desde el link tokenizado
// de WhatsApp/correo. Va ANTES del authenticate.
router.get('/public/:token/pdf', publicLiquidacionPdf);

router.use(authenticate);

router.get('/', getLiquidaciones);
router.post('/', createLiquidacion);
router.get('/:id', getLiquidacion);
router.patch('/:id', updateLiquidacion);
router.post('/:id/sync-contrato', syncContrato);
router.post('/:id/solicitar-fechas', solicitarFechas);
router.patch('/:id/submit', submitLiquidacion);
router.patch('/:id/review', requireAdmin, reviewLiquidacion);
router.patch('/:id/reopen', reopenLiquidacion);
router.post('/:id/pagos', addPago);
router.delete('/:id/pagos/:pagoId', requireAdmin, deletePago);
router.post('/:id/share', shareLiquidacion);
router.post('/:id/email', emailLiquidacion);
router.delete('/:id', deleteLiquidacion);

export default router;
