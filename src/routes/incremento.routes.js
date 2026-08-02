import { Router } from 'express';
import {
    getFichas, createFicha, updateFicha, deleteFicha,
    backfillFichas, importarFichas,
    getIndices, setIndice,
    detectarAhora, procesarMes,
    getIncrementos, getIncremento, updateIncremento,
    shareIncremento, emailIncremento, publicIncrementoPdf,
    aplicarIncremento, anularIncremento,
} from '../controllers/incremento.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// Pública (sin JWT): el arrendatario abre la carta desde el link tokenizado
// de WhatsApp/correo. Va ANTES del authenticate.
router.get('/public/:token/pdf', publicIncrementoPdf);

router.use(authenticate);

// Fichas (la base de incrementos, #45)
router.get('/fichas', getFichas);
router.post('/fichas', requireAdmin, createFicha);
router.post('/fichas/backfill', requireAdmin, backfillFichas);
router.post('/fichas/importar', requireAdmin, importarFichas);
router.patch('/fichas/:id', requireAdmin, updateFicha);
router.delete('/fichas/:id', requireAdmin, deleteFicha);

// Índices IPC por año (#46)
router.get('/indices', getIndices);
router.put('/indices/:anio', requireAdmin, setIndice);

// Detección y procesamiento masivo (#47, #54)
router.post('/detectar', requireAdmin, detectarAhora);
router.post('/procesar-mes', requireAdmin, procesarMes);

// Incrementos (tareas anuales)
router.get('/', getIncrementos);
router.get('/:id', getIncremento);
router.patch('/:id/aplicar', requireAdmin, aplicarIncremento);
router.patch('/:id/anular', requireAdmin, anularIncremento);
router.patch('/:id', requireAdmin, updateIncremento);
router.post('/:id/share', shareIncremento);
router.post('/:id/email', emailIncremento);

export default router;
