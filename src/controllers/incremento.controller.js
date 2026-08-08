import prisma from '../utils/prisma.js';
import { z } from 'zod';
import crypto from 'crypto';
import {
    pctAplicable, calcularNuevoCanon, proximoAniversario, aniversariosEnRadar,
    diasHasta, hoyISO, semaforo, grupoDashboard, validarFichaParaCarta, num,
} from '../utils/incrementoCalc.js';
import { correoIncremento } from '../utils/incrementoDocument.js';
import { generateIncrementoPdf, incrementoFileName } from '../utils/incrementoPdf.js';
import { sendEmailWithPdf } from '../utils/gmail.js';
import { sendPersonalNotification, notifyAdmins } from '../utils/notify.js';
import { EMAIL_COOLDOWN_MS, emailCooldownRemainingMs, emailCooldownMessage } from '../utils/emailCooldown.js';
import { publicBaseUrl } from '../utils/publicBaseUrl.js';
import { esStaff } from '../utils/roles.js';

// I1: Módulo de incrementos de canon. FichaIncremento = contrato vivo en
// seguimiento (auto-alta al aprobar contratos ARRENDAMIENTO, backfill de los
// existentes o importación CSV de los históricos de Wasi). Incremento = la
// tarea anual: PENDIENTE → ENVIADA (carta) → APLICADA (nuevo canon en la
// ficha). El cron de detectarAniversarios crea las tareas con anticipación.
// Permisos: admin todo; el agente ve y envía las de sus contratos.

// Con cuántos días de anticipación se crea la tarea de incremento (#47).
export const ANTICIPACION_DIAS = Number(process.env.INCREMENTO_ANTICIPACION_DIAS) || 90;

const fichaSchema = z.object({
    codigoWasi: z.string().trim().max(40).optional().nullable(),
    arrendatarioNombre: z.string().trim().min(1, 'Falta el nombre del arrendatario').max(160),
    arrendatarioCedula: z.string().trim().max(30).optional().nullable(),
    arrendatarioEmail: z.string().trim().max(160).optional().nullable(),
    arrendatarioCelular: z.string().trim().max(30).optional().nullable(),
    direccion: z.string().trim().max(300).optional().nullable(),
    fechaInicioContrato: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de inicio inválida (YYYY-MM-DD)'),
    canonActual: z.coerce.number().int().positive('El canon debe ser mayor a cero'),
    tipoIndice: z.enum(['IPC', 'IPC_PLUS', 'FIJO']).optional(),
    puntosAdicionales: z.coerce.number().min(0).max(50).optional(),
    pctFijo: z.coerce.number().min(0).max(100).optional(),
    userId: z.coerce.number().int().positive().optional().nullable(),
    activa: z.boolean().optional(),
    notas: z.string().trim().max(500).optional().nullable(),
});

function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

const isAdmin = (req) => req.user.role === 'ADMIN';
const isStaff = (req) => esStaff(req.user.role); // admin o asistente: solo VISIBILIDAD

const includeFicha = {
    user: { select: { id: true, name: true } },
    contract: { select: { id: true, type: true, status: true } },
};

const includeIncremento = {
    ficha: { include: includeFicha },
};

// Índices por año de aplicación: { 2026: { anio, pct, fuente } }
async function mapaIndices() {
    const indices = await prisma.indiceAnual.findMany();
    return Object.fromEntries(indices.map((i) => [i.anio, i]));
}

// Serializa un incremento para el frontend: snapshot de la carta (el congelado
// si ya se envió, o el calculado en vivo), semáforo y grupo del dashboard.
function serializeIncremento(inc, indices, hoy = hoyISO()) {
    const ficha = inc.ficha;
    let snapshot = null;
    let pct = inc.indicePct;
    let nuevoCanon = inc.nuevoCanon;
    if (inc.data) {
        try { snapshot = JSON.parse(inc.data); } catch { /* data corrupto → snapshot en vivo */ }
    }
    if (!snapshot) {
        // Snapshot en vivo: para vista previa y cálculo antes del envío
        if (pct == null) pct = pctAplicable(ficha, indices[inc.periodo]);
        if (nuevoCanon == null) nuevoCanon = calcularNuevoCanon(inc.canonAnterior, pct);
        snapshot = {
            periodo: inc.periodo,
            fechaEfectiva: inc.fechaEfectiva,
            arrendatarioNombre: ficha?.arrendatarioNombre || '',
            arrendatarioCedula: ficha?.arrendatarioCedula || '',
            direccion: ficha?.direccion || '',
            codigoWasi: ficha?.codigoWasi || '',
            tipoIndice: ficha?.tipoIndice || 'IPC',
            canonAnterior: inc.canonAnterior,
            pct,
            aumento: nuevoCanon != null ? nuevoCanon - inc.canonAnterior : null,
            nuevoCanon,
            fechaCarta: hoy,
        };
    }
    return {
        ...inc,
        data: undefined,
        snapshot,
        pctVigente: snapshot.pct,
        nuevoCanonVigente: snapshot.nuevoCanon,
        sinIndice: snapshot.pct == null,
        dias: diasHasta(inc.fechaEfectiva, hoy),
        semaforo: semaforo(inc, hoy).clave,
        grupo: grupoDashboard(inc, hoy),
        faltantes: ficha ? validarFichaParaCarta(ficha) : [],
    };
}

// Construye una ficha desde el data JSON de un contrato ARRENDAMIENTO (mismo
// criterio de buildOrigen en liquidacion.controller.js).
export function fichaDesdeContrato(contract) {
    let d = {};
    try { d = JSON.parse(contract.data); } catch { /* data corrupto */ }
    const direccion = [
        d.direccionInmueble,
        d.torreInmueble && `Torre ${d.torreInmueble}`,
        d.aptoInmueble && `Apto ${d.aptoInmueble}`,
        d.conjuntoInmueble,
        d.barrioInmueble,
        d.ciudadInmueble,
    ].filter(Boolean).join(', ');
    return {
        contractId: contract.id,
        userId: contract.userId,
        codigoWasi: d.codigoWasi || null,
        arrendatarioNombre: d.arrendatarioNombre || '',
        arrendatarioCedula: d.arrendatarioCedula || null,
        arrendatarioEmail: d.arrendatarioEmail || null,
        arrendatarioCelular: d.arrendatarioCelular || null,
        direccion: direccion || null,
        fechaInicioContrato: (d.fechaInicio || '').slice(0, 10),
        canonActual: num(d.canon),
    };
}

// Alta automática al aprobar un contrato ARRENDAMIENTO (#45). Silenciosa: un
// fallo aquí nunca debe romper la aprobación del contrato.
export async function crearFichaDesdeContrato(contract) {
    try {
        if (contract.type !== 'ARRENDAMIENTO') return null;
        const ficha = fichaDesdeContrato(contract);
        if (!ficha.arrendatarioNombre || !ficha.fechaInicioContrato || ficha.canonActual <= 0) return null;
        return await prisma.fichaIncremento.create({ data: ficha });
    } catch (e) {
        if (e.code !== 'P2002') console.warn('[Incrementos] No se pudo crear la ficha:', e.message);
        return null; // P2002 = ya existe ficha para ese contrato
    }
}

// ── Fichas ──

// GET /api/incrementos/fichas — admin todas; agente las de sus contratos
export const getFichas = async (req, res) => {
    try {
        const where = {};
        if (!isStaff(req)) where.userId = req.user.id;
        if (req.query.activa !== 'todas') where.activa = true;
        const [fichas, indices] = await Promise.all([
            prisma.fichaIncremento.findMany({
                where,
                include: { ...includeFicha, incrementos: { orderBy: { periodo: 'desc' } } },
                orderBy: { updatedAt: 'desc' },
            }),
            mapaIndices(),
        ]);
        const hoy = hoyISO();
        res.json(fichas.map((f) => ({
            ...f,
            proximoAniversario: proximoAniversario(f.fechaInicioContrato, hoy),
            incrementos: f.incrementos.map((i) => serializeIncremento({ ...i, ficha: f }, indices, hoy)),
            faltantes: validarFichaParaCarta(f),
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/incrementos/fichas — alta manual (solo admin)
export const createFicha = async (req, res) => {
    try {
        const data = fichaSchema.parse(req.body);
        const ficha = await prisma.fichaIncremento.create({ data, include: includeFicha });
        res.status(201).json(ficha);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/incrementos/fichas/:id — solo admin (canon, índice pactado, datos)
export const updateFicha = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const data = fichaSchema.partial().parse(req.body);
        const ficha = await prisma.fichaIncremento.update({
            where: { id }, data, include: includeFicha,
        });
        res.json(ficha);
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Ficha no encontrada' });
        res.status(400).json({ error: error.message });
    }
};

// DELETE /api/incrementos/fichas/:id — solo admin. Borra la ficha y sus
// incrementos (cascade). Para sacar del radar sin perder historial usar
// PATCH { activa: false }.
export const deleteFicha = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        await prisma.fichaIncremento.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Ficha no encontrada' });
        res.status(400).json({ error: error.message });
    }
};

// POST /api/incrementos/fichas/backfill — migración inicial (#45): crea fichas
// para todos los contratos ARRENDAMIENTO aprobados/enviados que no tengan una.
export const backfillFichas = async (req, res) => {
    try {
        const contratos = await prisma.contract.findMany({
            where: {
                type: 'ARRENDAMIENTO',
                status: { in: ['APPROVED', 'SENT'] },
                fichaIncremento: null,
            },
        });
        let creadas = 0;
        const omitidos = [];
        for (const c of contratos) {
            const ficha = await crearFichaDesdeContrato(c);
            if (ficha) creadas += 1;
            else omitidos.push({ contractId: c.id, motivo: 'Datos incompletos (nombre, fecha de inicio o canon)' });
        }
        res.json({ creadas, omitidos, revisados: contratos.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/incrementos/fichas/importar — carga masiva (#45): el frontend
// parsea el CSV y envía las filas como JSON. Deduplica por código Wasi.
const importRowSchema = fichaSchema.omit({ userId: true, activa: true });
export const importarFichas = async (req, res) => {
    try {
        const filas = z.array(z.record(z.any())).max(500, 'Máximo 500 filas por importación').parse(req.body?.filas);
        const existentes = await prisma.fichaIncremento.findMany({
            where: { codigoWasi: { not: null } },
            select: { codigoWasi: true },
        });
        const codigos = new Set(existentes.map((f) => f.codigoWasi));
        let creadas = 0;
        const errores = [];
        for (let i = 0; i < filas.length; i++) {
            try {
                const data = importRowSchema.parse(filas[i]);
                if (data.codigoWasi && codigos.has(data.codigoWasi)) {
                    errores.push({ fila: i + 1, error: `Ya existe una ficha con el código Wasi ${data.codigoWasi}` });
                    continue;
                }
                await prisma.fichaIncremento.create({ data });
                if (data.codigoWasi) codigos.add(data.codigoWasi);
                creadas += 1;
            } catch (e) {
                // Con el campo adelante: "fechaInicioContrato: Required" y no solo "Required"
                const issue = e.errors?.[0];
                const msg = issue
                    ? [issue.path?.join('.'), issue.message].filter(Boolean).join(': ')
                    : e.message;
                errores.push({ fila: i + 1, error: msg });
            }
        }
        res.json({ creadas, errores, total: filas.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Índices (IPC por año de aplicación) ──

// GET /api/incrementos/indices
export const getIndices = async (req, res) => {
    try {
        const indices = await prisma.indiceAnual.findMany({ orderBy: { anio: 'desc' } });
        res.json(indices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// PUT /api/incrementos/indices/:anio — solo admin: fija el IPC del año
export const setIndice = async (req, res) => {
    try {
        const anio = parseId(req.params.anio);
        if (anio < 2000 || anio > 2100) return res.status(400).json({ error: 'Año inválido' });
        const parsed = z.object({
            pct: z.coerce.number().min(0).max(100),
            fuente: z.string().trim().max(120).optional().nullable(),
        }).parse(req.body);
        const indice = await prisma.indiceAnual.upsert({
            where: { anio },
            update: { pct: parsed.pct, fuente: parsed.fuente || null },
            create: { anio, pct: parsed.pct, fuente: parsed.fuente || null },
        });
        res.json(indice);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Detección de aniversarios (#47) ──
// Crea la tarea de incremento de cada ficha activa cuyo aniversario cae dentro
// del horizonte. Sin duplicados (@@unique fichaId+periodo). Usada por el cron
// diario y por el procesamiento masivo (#54).
export async function detectarAniversarios({ horizonteDias = ANTICIPACION_DIAS, hoy = hoyISO() } = {}) {
    const fichas = await prisma.fichaIncremento.findMany({
        where: { activa: true },
        include: { incrementos: { select: { periodo: true } } },
    });
    const indices = await mapaIndices();
    const creados = [];
    for (const ficha of fichas) {
        // Radar: el próximo aniversario dentro del horizonte + el del período
        // actual si pasó hace poco sin gestionarse (nace VENCIDO — clave en la
        // migración inicial de contratos con aniversario recién cumplido)
        const radar = aniversariosEnRadar(ficha.fechaInicioContrato, hoy, { horizonteDias });
        for (const { fecha, periodo } of radar) {
            if (ficha.incrementos.some((i) => i.periodo === periodo)) continue; // ya existe
            const pct = pctAplicable(ficha, indices[periodo]);
            try {
                const inc = await prisma.incremento.create({
                    data: {
                        fichaId: ficha.id,
                        periodo,
                        fechaEfectiva: fecha,
                        canonAnterior: ficha.canonActual,
                        indicePct: pct,
                        nuevoCanon: calcularNuevoCanon(ficha.canonActual, pct),
                    },
                });
                creados.push({ ...inc, ficha });
            } catch (e) {
                if (e.code !== 'P2002') console.warn(`[Incrementos] Ficha ${ficha.id}:`, e.message);
            }
        }
    }
    if (creados.length > 0) {
        console.log(`[Incrementos] ${creados.length} tarea(s) de incremento creada(s) (horizonte ${horizonteDias} días)`);
    }
    return creados;
}

// POST /api/incrementos/detectar — solo admin: corre la detección ahora
export const detectarAhora = async (req, res) => {
    try {
        const creados = await detectarAniversarios();
        res.json({ creados: creados.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/incrementos/procesar-mes — botón "Procesar incrementos del mes"
// (#54): detecta los aniversarios del período, recalcula los pendientes que no
// tenían índice y devuelve el resumen para la revisión en lote.
export const procesarMes = async (req, res) => {
    try {
        const hoy = hoyISO();
        // Horizonte del procesamiento: lo que resta del mes + el mes siguiente
        // completo (así "el mes" nunca se queda corto al correrlo a fin de mes).
        const h = new Date();
        const finProximoMes = new Date(h.getFullYear(), h.getMonth() + 2, 0);
        const horizonteDias = Math.max(ANTICIPACION_DIAS, diasHasta(hoyISO(finProximoMes), hoy));

        const nuevos = await detectarAniversarios({ horizonteDias, hoy });

        // Recalcular los PENDIENTES sin índice (el admin pudo fijar el IPC después)
        const indices = await mapaIndices();
        const pendientes = await prisma.incremento.findMany({
            where: { status: 'PENDIENTE', nuevoCanon: null },
            include: includeIncremento,
        });
        let recalculados = 0;
        for (const inc of pendientes) {
            const pct = pctAplicable(inc.ficha, indices[inc.periodo]);
            const nuevoCanon = calcularNuevoCanon(inc.canonAnterior, pct);
            if (nuevoCanon != null) {
                await prisma.incremento.update({
                    where: { id: inc.id },
                    data: { indicePct: pct, nuevoCanon },
                });
                recalculados += 1;
            }
        }

        // Resumen del lote: todo lo pendiente de envío dentro del horizonte
        const abiertos = await prisma.incremento.findMany({
            where: { status: 'PENDIENTE' },
            include: includeIncremento,
        });
        const enHorizonte = abiertos.filter((i) => diasHasta(i.fechaEfectiva, hoy) <= horizonteDias);
        const listos = enHorizonte.filter((i) => i.nuevoCanon != null && validarFichaParaCarta(i.ficha).length === 0);
        const sinIndice = enHorizonte.filter((i) => i.nuevoCanon == null);
        const incompletos = enHorizonte.filter((i) => i.nuevoCanon != null && validarFichaParaCarta(i.ficha).length > 0);

        res.json({
            detectados: nuevos.length,
            recalculados,
            listos: listos.length,
            sinIndice: sinIndice.length,
            incompletos: incompletos.length,
            ids: { listos: listos.map((i) => i.id), sinIndice: sinIndice.map((i) => i.id), incompletos: incompletos.map((i) => i.id) },
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Incrementos (tareas) ──

// GET /api/incrementos?status=&periodo= — admin todos; agente los suyos
export const getIncrementos = async (req, res) => {
    try {
        const where = {};
        if (!isStaff(req)) where.ficha = { userId: req.user.id };
        if (req.query.status) where.status = String(req.query.status);
        if (req.query.periodo) where.periodo = parseId(req.query.periodo);
        const [incrementos, indices] = await Promise.all([
            prisma.incremento.findMany({
                where,
                include: includeIncremento,
                orderBy: { fechaEfectiva: 'asc' },
            }),
            mapaIndices(),
        ]);
        const hoy = hoyISO();
        res.json(incrementos.map((i) => serializeIncremento(i, indices, hoy)));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Carga + permiso dueño/admin (con { lectura: true }, también asistente:
// puede VER la carta pero no enviarla ni aplicarla). Devuelve { inc } o { error, status }.
async function loadOwnedIncremento(req, { lectura = false } = {}) {
    const id = parseId(req.params.id);
    const inc = await prisma.incremento.findUnique({ where: { id }, include: includeIncremento });
    if (!inc) return { error: 'Incremento no encontrado', status: 404 };
    const autorizado = lectura ? isStaff(req) : isAdmin(req);
    if (!autorizado && inc.ficha.userId !== req.user.id) {
        return { error: 'No tienes permiso sobre este incremento.', status: 403 };
    }
    return { inc };
}

// GET /api/incrementos/:id — detalle con snapshot (vista previa de la carta)
export const getIncremento = async (req, res) => {
    try {
        const { inc, error, status } = await loadOwnedIncremento(req, { lectura: true });
        if (error) return res.status(status).json({ error });
        res.json(serializeIncremento(inc, await mapaIndices()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/incrementos/:id — solo admin: ajustar el % aplicado (caso pactado
// distinto) o la fecha efectiva, mientras la carta no haya salido.
export const updateIncremento = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const inc = await prisma.incremento.findUnique({ where: { id }, include: includeIncremento });
        if (!inc) return res.status(404).json({ error: 'Incremento no encontrado' });
        if (inc.status !== 'PENDIENTE') {
            return res.status(400).json({ error: 'Solo se pueden ajustar incrementos pendientes (la carta aún no ha salido).' });
        }
        const parsed = z.object({
            indicePct: z.coerce.number().min(0).max(100).optional(),
            fechaEfectiva: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }).parse(req.body);
        const indicePct = parsed.indicePct ?? inc.indicePct;
        const updated = await prisma.incremento.update({
            where: { id },
            data: {
                ...(parsed.fechaEfectiva ? { fechaEfectiva: parsed.fechaEfectiva } : {}),
                indicePct,
                nuevoCanon: calcularNuevoCanon(inc.canonAnterior, indicePct),
            },
            include: includeIncremento,
        });
        res.json(serializeIncremento(updated, await mapaIndices()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Congela el snapshot de la carta y marca ENVIADA con la trazabilidad (#51).
// Los campos de envío son de solo-escritura-una-vez: si ya hay snapshot, se
// conserva (la evidencia no se edita).
async function marcarEnviada(inc, req, { enviadaA = null } = {}) {
    const indices = await mapaIndices();
    const vivo = serializeIncremento(inc, indices);
    if (vivo.snapshot.pct == null || vivo.snapshot.nuevoCanon == null) {
        throw new Error('No se puede enviar la carta sin el índice del período. Configura el IPC primero.');
    }
    // El JWT no trae el nombre — se busca para dejar la trazabilidad legible
    const remitente = await prisma.user.findUnique({
        where: { id: req.user.id }, select: { name: true },
    });
    return prisma.incremento.update({
        where: { id: inc.id },
        data: {
            status: inc.status === 'PENDIENTE' ? 'ENVIADA' : inc.status,
            data: inc.data || JSON.stringify(vivo.snapshot),
            indicePct: vivo.snapshot.pct,
            nuevoCanon: vivo.snapshot.nuevoCanon,
            cartaEnviadaAt: inc.cartaEnviadaAt || new Date(),
            enviadaPor: inc.enviadaPor || req.user.id,
            enviadaPorNombre: inc.enviadaPorNombre || remitente?.name || null,
            enviadaA: inc.enviadaA || enviadaA,
            shareToken: inc.shareToken || crypto.randomBytes(24).toString('hex'),
        },
        include: includeIncremento,
    });
}

const publicPdfPath = (token) => `/api/incrementos/public/${token}/pdf`;

// POST /api/incrementos/:id/share — link público de la carta (WhatsApp).
// Compartir SÍ marca la carta como enviada (trazabilidad del canal).
export const shareIncremento = async (req, res) => {
    try {
        const { inc, error, status } = await loadOwnedIncremento(req);
        if (error) return res.status(status).json({ error });
        if (!['PENDIENTE', 'ENVIADA', 'APLICADA'].includes(inc.status)) {
            return res.status(400).json({ error: 'Este incremento está anulado.' });
        }
        const updated = await marcarEnviada(inc, req);
        res.json({
            ...serializeIncremento(updated, await mapaIndices()),
            publicUrl: `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/incrementos/:id/email — carta en PDF al correo del arrendatario.
// Anti-duplicado: mismo reclamo atómico de contratos/liquidaciones (1 h).
export const emailIncremento = async (req, res) => {
    try {
        const { inc, error, status } = await loadOwnedIncremento(req);
        if (error) return res.status(status).json({ error });
        if (!['PENDIENTE', 'ENVIADA', 'APLICADA'].includes(inc.status)) {
            return res.status(400).json({ error: 'Este incremento está anulado.' });
        }
        const to = inc.ficha.arrendatarioEmail;
        if (!to) return res.status(400).json({ error: 'La ficha no tiene correo del arrendatario.' });

        const now = new Date();
        const claimed = await prisma.incremento.updateMany({
            where: {
                id: inc.id,
                OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }],
            },
            data: { emailedAt: now },
        });
        if (claimed.count === 0) {
            return res.status(409).json({ error: emailCooldownMessage(emailCooldownRemainingMs(inc.emailedAt)) });
        }

        try {
            const updated = await marcarEnviada(inc, req, { enviadaA: to });
            const parsed = serializeIncremento(updated, await mapaIndices());
            const pdf = await generateIncrementoPdf(parsed);
            const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
            const publicUrl = `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`;
            const { subject, text } = correoIncremento(parsed.snapshot, publicUrl);
            await sendEmailWithPdf({ to, subject, text, pdfBuffer, filename: incrementoFileName(parsed) });

            // Aviso a la contraparte del envío (trazabilidad viva)
            const nombre = parsed.snapshot.arrendatarioNombre;
            if (isAdmin(req) && inc.ficha.userId && inc.ficha.userId !== req.user.id) {
                sendPersonalNotification(inc.ficha.userId, '📈 Carta de incremento enviada',
                    `Se envió la carta de incremento ${inc.periodo} de ${nombre} a ${to}.`).catch(() => {});
            } else if (!isAdmin(req)) {
                notifyAdmins('📈 Carta de incremento enviada',
                    `${updated.enviadaPorNombre || 'Un agente'} envió la carta de incremento ${inc.periodo} de ${nombre} a ${to}.`);
            }
            res.json({ ...parsed, emailedAt: now, emailedTo: to });
        } catch (sendError) {
            await prisma.incremento.update({
                where: { id: inc.id },
                data: { emailedAt: inc.emailedAt },
            }).catch(() => {});
            throw sendError;
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/incrementos/public/:token/pdf — SIN auth: el arrendatario abre la
// carta desde el link de WhatsApp/correo. Solo cartas ya enviadas.
export const publicIncrementoPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (token.length < 32) return res.status(404).send('No encontrado');
        const inc = await prisma.incremento.findUnique({
            where: { shareToken: token },
            include: includeIncremento,
        });
        if (!inc || !inc.cartaEnviadaAt || inc.status === 'ANULADA') {
            return res.status(404).send('No encontrado');
        }
        const parsed = serializeIncremento(inc, await mapaIndices());
        const pdf = await generateIncrementoPdf(parsed);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${incrementoFileName(parsed)}"`);
        res.send(Buffer.from(pdf.output('arraybuffer')));
    } catch {
        res.status(500).send('Error generando el PDF');
    }
};

// PATCH /api/incrementos/:id/aplicar — solo admin: aplica el nuevo canon a la
// ficha y cierra el ciclo. La aplicación AUTOMÁTICA en la fecha efectiva
// (liquidación, cartera, pago propietario) es el issue #50, pendiente de esos
// módulos; este endpoint es el cierre manual con trazabilidad.
export const aplicarIncremento = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const inc = await prisma.incremento.findUnique({ where: { id }, include: includeIncremento });
        if (!inc) return res.status(404).json({ error: 'Incremento no encontrado' });
        if (inc.status === 'APLICADA') {
            return res.status(400).json({ error: 'Este incremento ya fue aplicado.' });
        }
        if (inc.status === 'ANULADA') {
            return res.status(400).json({ error: 'Este incremento está anulado.' });
        }
        if (inc.nuevoCanon == null) {
            return res.status(400).json({ error: 'No hay nuevo canon calculado. Configura el índice del período primero.' });
        }
        // Atómico: el canon de la ficha y el cierre del incremento van juntos
        const [, updated] = await prisma.$transaction([
            prisma.fichaIncremento.update({
                where: { id: inc.fichaId },
                data: { canonActual: inc.nuevoCanon },
            }),
            prisma.incremento.update({
                where: { id },
                data: { status: 'APLICADA', aplicadoAt: new Date(), aplicadoPor: req.user.id },
                include: includeIncremento,
            }),
        ]);
        if (inc.ficha.userId && inc.ficha.userId !== req.user.id) {
            sendPersonalNotification(inc.ficha.userId, '📈 Incremento aplicado',
                `El canon de ${inc.ficha.arrendatarioNombre} pasó de $${inc.canonAnterior.toLocaleString('es-CO')} a $${inc.nuevoCanon.toLocaleString('es-CO')} (período ${inc.periodo}).`).catch(() => {});
        }
        res.json(serializeIncremento(updated, await mapaIndices()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/incrementos/:id/anular — solo admin, con motivo (ej.: el contrato
// terminó antes del aniversario).
export const anularIncremento = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = z.object({
            motivo: z.string().trim().min(1, 'Indica el motivo de la anulación').max(300),
        }).parse(req.body);
        const inc = await prisma.incremento.findUnique({ where: { id } });
        if (!inc) return res.status(404).json({ error: 'Incremento no encontrado' });
        if (inc.status === 'APLICADA') {
            return res.status(400).json({ error: 'Un incremento ya aplicado no se puede anular.' });
        }
        const updated = await prisma.incremento.update({
            where: { id },
            data: { status: 'ANULADA', anuladoMotivo: parsed.motivo },
            include: includeIncremento,
        });
        res.json(serializeIncremento(updated, await mapaIndices()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
