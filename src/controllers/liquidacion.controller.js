import prisma from '../utils/prisma.js';
import { z } from 'zod';
import crypto from 'crypto';
import {
    calcularLiquidacion, validateLiquidacionConfig, diasEntre, diasDelMes,
    EDITABLE_STATUSES, SENDABLE_STATUSES, referenciaPago,
} from '../utils/liquidacionCalc.js';
import { EMPRESA, mediosDePagoTexto } from '../utils/contractTemplates.js';
import { sendPersonalNotification, notifyAdmins } from '../utils/notify.js';
import { generateLiquidacionPdf, liquidacionFileName } from '../utils/liquidacionPdf.js';
import { sendEmailWithPdf } from '../utils/gmail.js';
import { EMAIL_COOLDOWN_MS, emailCooldownRemainingMs, emailCooldownMessage } from '../utils/emailCooldown.js';
import { publicBaseUrl } from '../utils/publicBaseUrl.js';

// L1: Liquidación inicial de un contrato de arrendamiento (reemplaza el Excel).
// Se crea DESDE un contrato ARRENDAMIENTO aprobado: `data.origen` es un snapshot
// de los datos del contrato (bloqueado — solo se refresca vía /sync-contrato) y
// `data.config` la configuración del cobro. Flujo: DRAFT → PENDING_APPROVAL →
// APPROVED (congela data.totales, nace la cuenta por cobrar) | REJECTED.
// Los pagos (LiquidacionPago) descuentan el saldo; al llegar a $0 → PAID.
// Compartir al cliente no cambia el estado: queda en sentAt + shareToken.

const configSchema = z.object({
    fechaInicialCobro: z.string().max(30).optional().nullable(),
    fechaFinalCobro: z.string().max(30).optional().nullable(),
    diasCobrados: z.coerce.number().int().min(0).max(366).optional(),
    admonModo: z.enum(['PROPORCIONAL', 'COMPLETA', 'NO_COBRAR']).optional(),
    pctDerechos: z.coerce.number().min(0).max(100).optional(),
    aplicaIvaDerechos: z.boolean().optional(),
    estudioValor: z.coerce.number().min(0).optional(),
    aplicaIvaEstudio: z.boolean().optional(),
    polizaValor: z.coerce.number().min(0).optional(),
    aplicaIvaPoliza: z.boolean().optional(),
    abonosPrevios: z.array(z.object({
        fecha: z.string().max(30).optional().nullable(),
        valor: z.coerce.number().min(0),
        nota: z.string().max(200).optional().nullable(),
    })).optional(),
    otros: z.array(z.object({
        concepto: z.string().max(120),
        valor: z.coerce.number().min(0),
        tipo: z.enum(['CARGO', 'DESCUENTO']),
        aplicaIva: z.boolean().optional(),
    })).optional(),
});

const pagoSchema = z.object({
    valor: z.coerce.number().int().positive('El valor del pago debe ser mayor a cero'),
    fecha: z.string().max(30),
    nota: z.string().trim().max(200).optional().nullable(),
});

function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

const includeRefs = {
    // role: el PDF firma la ENTREGA con el agente que la elaboró, o con el
    // representante legal si la hizo un admin
    user: { select: { id: true, name: true, role: true } },
    contract: { select: { id: true, type: true, status: true } },
    pagos: {
        include: { registrador: { select: { id: true, name: true } } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    },
};

// Serializa para el frontend: data parseado + cálculo vigente (la lista y el
// detalle muestran totales/saldo sin duplicar la lógica en el cliente).
function serialize(liq) {
    let data = {};
    try { data = JSON.parse(liq.data); } catch { /* data corrupto → objeto vacío */ }
    return { ...liq, data, calc: calcularLiquidacion(data, liq.pagos || []) };
}

// Montos del contrato pueden venir como texto ("1300000" o formateado).
const montoDe = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
    return isNaN(n) ? 0 : n;
};

// Snapshot de los datos del contrato que la liquidación importa (sección A,
// bloqueada en la UI). Se congela al crear para que el PDF no cambie si luego
// editan el contrato; /sync-contrato lo refresca mientras sea editable.
function buildOrigen(contract) {
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
        codigoWasi: d.codigoWasi || '',
        arrendatarioNombre: d.arrendatarioNombre || '',
        arrendatarioCedula: d.arrendatarioCedula || '',
        arrendatarioEmail: d.arrendatarioEmail || '',
        arrendatarioCelular: d.arrendatarioCelular || '',
        direccionCompleta: direccion,
        // Componentes sueltos: de aquí sale la referencia de pago del banco
        // (conjunto + torre + apto, o dirección + barrio si no hay conjunto).
        // `direccionCompleta` sola no sirve — habría que adivinar dónde termina
        // cada parte. Ver referenciaPago() en liquidacionCalc.js
        direccionInmueble: d.direccionInmueble || '',
        torreInmueble: d.torreInmueble || '',
        aptoInmueble: d.aptoInmueble || '',
        conjuntoInmueble: d.conjuntoInmueble || '',
        barrioInmueble: d.barrioInmueble || '',
        fechaInicioContrato: d.fechaInicio || '',
        fechaFinContrato: d.fechaVencimiento || '',
        canonMensual: montoDe(d.canon),
        administracionMensual: montoDe(d.cuotaAdministracion),
        snapshotAt: new Date().toISOString(),
    };
}

// Config inicial: cobra desde la fecha de inicio del contrato hasta el último
// día de ese mes (el prorrateo típico del Excel), derechos 15% + IVA y estudio
// de aseguradora de $80.000 + IVA como valores de arranque.
function defaultConfig(origen) {
    const inicio = origen.fechaInicioContrato || '';
    let fin = '';
    if (/^\d{4}-\d{2}/.test(inicio)) {
        fin = `${inicio.slice(0, 7)}-${String(diasDelMes(inicio)).padStart(2, '0')}`;
    }
    return {
        fechaInicialCobro: inicio,
        fechaFinalCobro: fin,
        diasCobrados: inicio && fin ? diasEntre(inicio, fin) : 0,
        admonModo: 'PROPORCIONAL',
        pctDerechos: 15,
        aplicaIvaDerechos: true,
        estudioValor: 80000,
        aplicaIvaEstudio: true,
        polizaValor: 0,
        aplicaIvaPoliza: false,
        abonosPrevios: [],
        otros: [],
    };
}

// GET /api/liquidaciones?status=&contractId=&conSaldo=1
export const getLiquidaciones = async (req, res) => {
    try {
        const where = {};
        if (req.user.role !== 'ADMIN') where.userId = req.user.id;
        if (req.query.status) where.status = String(req.query.status);
        if (req.query.contractId) where.contractId = parseId(req.query.contractId);
        const liquidaciones = await prisma.liquidacion.findMany({
            where,
            include: includeRefs,
            orderBy: { updatedAt: 'desc' },
        });
        let result = liquidaciones.map(serialize);
        if (req.query.conSaldo === '1') {
            result = result.filter((l) => l.status === 'APPROVED' && l.calc.saldo > 0);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/liquidaciones/:id — dueño o admin
export const getLiquidacion = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const liq = await prisma.liquidacion.findUnique({ where: { id }, include: includeRefs });
        if (!liq) return res.status(404).json({ error: 'Liquidación no encontrada' });
        if (liq.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso para ver esta liquidación.' });
        }
        res.json(serialize(liq));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/liquidaciones — crea el borrador desde un contrato ARRENDAMIENTO
export const createLiquidacion = async (req, res) => {
    try {
        const contractId = parseId(req.body?.contractId);
        const contract = await prisma.contract.findUnique({ where: { id: contractId } });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso sobre este contrato.' });
        }
        if (contract.type !== 'ARRENDAMIENTO') {
            return res.status(400).json({ error: 'La liquidación inicial solo aplica a contratos de arrendamiento.' });
        }
        if (!['APPROVED', 'SENT'].includes(contract.status)) {
            return res.status(400).json({ error: 'El contrato debe estar aprobado antes de liquidarlo.' });
        }

        const origen = buildOrigen(contract);
        const liq = await prisma.liquidacion.create({
            data: {
                status: 'DRAFT',
                data: JSON.stringify({ origen, config: defaultConfig(origen) }),
                contractId,
                userId: req.user.id,
            },
            include: includeRefs,
        });
        res.status(201).json(serialize(liq));
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Este contrato ya tiene una liquidación.' });
        }
        res.status(400).json({ error: error.message });
    }
};

// Carga + permiso dueño/admin. Devuelve { liq } o { error, status }.
async function loadOwned(req) {
    const id = parseId(req.params.id);
    const liq = await prisma.liquidacion.findUnique({ where: { id }, include: includeRefs });
    if (!liq) return { error: 'Liquidación no encontrada', status: 404 };
    if (liq.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return { error: 'No tienes permiso sobre esta liquidación.', status: 403 };
    }
    return { liq };
}

// PATCH /api/liquidaciones/:id — edita SOLO la configuración del cobro.
// `origen` nunca se acepta del cliente (solo /sync-contrato lo refresca).
// Las FECHAS del cobro solo las modifica el ADMIN (el agente debe pedirlo con
// /solicitar-fechas); los días cobrados SIEMPRE se recalculan en el servidor a
// partir de las fechas (calendario real), nunca se aceptan del cliente.
// El admin también puede editar en PENDING_APPROVAL (ajusta fechas al revisar
// sin devolver la liquidación).
export const updateLiquidacion = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const isAdmin = req.user.role === 'ADMIN';
        const canEdit = EDITABLE_STATUSES.includes(liq.status)
            || (isAdmin && liq.status === 'PENDING_APPROVAL');
        if (!canEdit) {
            return res.status(400).json({ error: 'Solo se pueden editar liquidaciones en borrador o devueltas.' });
        }
        const config = configSchema.parse(req.body?.config || {});
        const data = serialize(liq).data;
        const prev = data.config || {};

        const cambioFechas = ['fechaInicialCobro', 'fechaFinalCobro'].some(
            (k) => config[k] !== undefined && config[k] !== prev[k]
        );
        if (cambioFechas && !isAdmin) {
            return res.status(403).json({
                error: 'Las fechas del cobro solo las modifica el administrador. Usa "Solicitar ajuste de fechas" para pedirlo.',
            });
        }

        const nextConfig = { ...prev, ...config };
        // Los días son siempre derivados de las fechas — con los días reales
        // de cada mes (pedido del cliente: nada de digitarlos a mano)
        nextConfig.diasCobrados = diasEntre(nextConfig.fechaInicialCobro, nextConfig.fechaFinalCobro);

        // Si el admin cambió las fechas y había una solicitud pendiente del
        // agente, queda atendida y se le avisa
        let solicitudFechas = data.solicitudFechas;
        if (cambioFechas && isAdmin) {
            if (solicitudFechas?.estado === 'PENDIENTE') {
                solicitudFechas = { ...solicitudFechas, estado: 'ATENDIDA', atendidaAt: new Date().toISOString() };
            }
            if (liq.userId !== req.user.id) {
                sendPersonalNotification(
                    liq.userId,
                    '📅 Fechas de liquidación actualizadas',
                    `El administrador ajustó el período de cobro de la liquidación de ${data.origen?.arrendatarioNombre || 'tu liquidación'}: del ${nextConfig.fechaInicialCobro} al ${nextConfig.fechaFinalCobro} (${nextConfig.diasCobrados} días).`,
                ).catch(() => {});
            }
        }

        const updated = await prisma.liquidacion.update({
            where: { id: liq.id },
            data: { data: JSON.stringify({ ...data, config: nextConfig, solicitudFechas, totales: undefined }) },
            include: includeRefs,
        });
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/liquidaciones/:id/solicitar-fechas — el agente propone otro período
// de cobro (ej.: el contrato se firmó el 20 pero el inmueble se entregó el 25).
// La solicitud queda registrada en la liquidación y el admin recibe la
// notificación; solo él puede aplicar el cambio (PATCH con las fechas).
export const solicitarFechas = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (!EDITABLE_STATUSES.includes(liq.status) && liq.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Esta liquidación ya no admite ajustes de fechas.' });
        }
        const parsed = z.object({
            fechaInicialCobro: z.string().max(30),
            fechaFinalCobro: z.string().max(30),
            motivo: z.string().trim().min(1, 'Explica el motivo del ajuste').max(300),
        }).parse(req.body);
        if (diasEntre(parsed.fechaInicialCobro, parsed.fechaFinalCobro) === 0) {
            return res.status(400).json({ error: 'El rango de fechas propuesto no es válido.' });
        }

        const data = serialize(liq).data;
        const solicitudFechas = {
            ...parsed,
            estado: 'PENDIENTE',
            solicitadaPor: req.user.id,
            solicitadaPorNombre: liq.user?.name || '',
            solicitadaAt: new Date().toISOString(),
        };
        const updated = await prisma.liquidacion.update({
            where: { id: liq.id },
            data: { data: JSON.stringify({ ...data, solicitudFechas }) },
            include: includeRefs,
        });
        notifyAdmins(
            '📅 Solicitud de ajuste de fechas',
            `${liq.user?.name || 'Un agente'} pide cambiar el período de cobro de la liquidación de ${data.origen?.arrendatarioNombre || 'un arrendatario'} a: del ${parsed.fechaInicialCobro} al ${parsed.fechaFinalCobro}. Motivo: ${parsed.motivo}`,
        );
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/liquidaciones/:id/sync-contrato — re-importa el snapshot del contrato
export const syncContrato = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (!EDITABLE_STATUSES.includes(liq.status)) {
            return res.status(400).json({ error: 'Solo se puede re-importar mientras la liquidación sea editable.' });
        }
        const contract = await prisma.contract.findUnique({ where: { id: liq.contractId } });
        if (!contract) return res.status(404).json({ error: 'El contrato de origen ya no existe.' });

        const data = serialize(liq).data;
        const updated = await prisma.liquidacion.update({
            where: { id: liq.id },
            data: { data: JSON.stringify({ ...data, origen: buildOrigen(contract) }) },
            include: includeRefs,
        });
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/liquidaciones/:id/submit — enviar a revisión del admin
export const submitLiquidacion = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (!EDITABLE_STATUSES.includes(liq.status)) {
            return res.status(400).json({ error: 'Esta liquidación ya fue enviada a revisión.' });
        }
        const data = serialize(liq).data;
        const errors = validateLiquidacionConfig(data.config);
        if (errors.length > 0) {
            return res.status(400).json({ error: `Liquidación incompleta: ${errors[0]}`, details: errors });
        }
        const updated = await prisma.liquidacion.update({
            where: { id: liq.id },
            data: { status: 'PENDING_APPROVAL', reviewNote: null, reviewedBy: null, reviewedAt: null },
            include: includeRefs,
        });
        notifyAdmins(
            '💰 Liquidación por aprobar',
            `${liq.user?.name || 'Un agente'} envió la liquidación inicial de ${data.origen?.arrendatarioNombre || 'un arrendatario'} para revisión.`
        );
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/liquidaciones/:id/review — visto bueno del admin.
// Al APROBAR se congelan los totales calculados (data.totales): son la fuente
// del PDF definitivo y de la cuenta por cobrar.
export const reviewLiquidacion = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = z.object({
            decision: z.enum(['APPROVED', 'REJECTED']),
            note: z.string().trim().max(500).optional(),
        }).parse(req.body);

        const liq = await prisma.liquidacion.findUnique({ where: { id }, include: includeRefs });
        if (!liq) return res.status(404).json({ error: 'Liquidación no encontrada' });
        if (liq.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Solo se pueden revisar liquidaciones pendientes de aprobación.' });
        }
        if (parsed.decision === 'REJECTED' && !parsed.note) {
            return res.status(400).json({ error: 'Indica el motivo de la devolución.' });
        }

        const data = serialize(liq).data;
        const newData = parsed.decision === 'APPROVED'
            ? { ...data, totales: calcularLiquidacion(data, liq.pagos) }
            : data;
        const updated = await prisma.liquidacion.update({
            where: { id },
            data: {
                status: parsed.decision,
                data: JSON.stringify(newData),
                reviewNote: parsed.note || null,
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
            },
            include: includeRefs,
        });
        const msg = parsed.decision === 'APPROVED'
            ? '✅ Tu liquidación fue aprobada. Ya puedes enviarla al arrendatario y registrar pagos.'
            : `↩️ Tu liquidación fue devuelta: ${parsed.note}`;
        sendPersonalNotification(liq.userId, '💰 Revisión de liquidación', msg).catch(() => {});
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/liquidaciones/:id/reopen — reabrir una APROBADA para corregir.
// Solo si aún no tiene pagos ni fue enviada al cliente.
export const reopenLiquidacion = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (liq.status !== 'APPROVED') {
            return res.status(400).json({ error: 'Solo se pueden reabrir liquidaciones aprobadas.' });
        }
        if (liq.pagos.length > 0) {
            return res.status(400).json({ error: 'Esta liquidación ya tiene pagos registrados y no puede reabrirse.' });
        }
        if (liq.sentAt) {
            return res.status(400).json({ error: 'Esta liquidación ya fue enviada al cliente y no puede reabrirse.' });
        }
        const data = serialize(liq).data;
        const updated = await prisma.liquidacion.update({
            where: { id: liq.id },
            data: {
                status: 'REOPENED',
                data: JSON.stringify({ ...data, totales: undefined }),
                reviewNote: null, reviewedBy: null, reviewedAt: null,
            },
            include: includeRefs,
        });
        if (liq.userId !== req.user.id) {
            sendPersonalNotification(
                liq.userId,
                '💰 Liquidación reabierta',
                'Un administrador reabrió tu liquidación para corregir. Edítala y envíala de nuevo a revisión.',
            ).catch(() => {});
        }
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/liquidaciones/:id/pagos — registra un pago del arrendatario.
// Solo liquidaciones APROBADAS (la cuenta por cobrar viva). Si el saldo llega
// a $0 la liquidación pasa a PAID.
export const addPago = async (req, res) => {
    try {
        const { liq, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (liq.status !== 'APPROVED') {
            return res.status(400).json({ error: 'Solo se registran pagos sobre liquidaciones aprobadas.' });
        }
        const parsed = pagoSchema.parse(req.body);
        const fecha = new Date(`${parsed.fecha}T12:00:00`);
        if (isNaN(fecha)) return res.status(400).json({ error: 'Fecha de pago inválida' });

        await prisma.liquidacionPago.create({
            data: {
                liquidacionId: liq.id,
                valor: parsed.valor,
                fecha,
                nota: parsed.nota || null,
                registradoPor: req.user.id,
            },
        });

        const conPagos = await prisma.liquidacion.findUnique({ where: { id: liq.id }, include: includeRefs });
        const calc = calcularLiquidacion(serialize(conPagos).data, conPagos.pagos);
        const updated = calc.pagada
            ? await prisma.liquidacion.update({
                where: { id: liq.id },
                data: { status: 'PAID', paidAt: new Date() },
                include: includeRefs,
            })
            : conPagos;

        // Aviso a la contraparte: admin registró → al agente; agente → a los admins
        const nombre = serialize(liq).data.origen?.arrendatarioNombre || 'el arrendatario';
        const detalle = `Pago de $${parsed.valor.toLocaleString('es-CO')} de ${nombre}.${calc.pagada ? ' La liquidación quedó PAGADA.' : ` Saldo: $${calc.saldo.toLocaleString('es-CO')}.`}`;
        if (req.user.role === 'ADMIN' && liq.userId !== req.user.id) {
            sendPersonalNotification(liq.userId, '💰 Pago registrado', detalle).catch(() => {});
        } else if (req.user.role !== 'ADMIN') {
            notifyAdmins('💰 Pago registrado', `${liq.user?.name || 'Un agente'}: ${detalle}`);
        }
        res.status(201).json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// DELETE /api/liquidaciones/:id/pagos/:pagoId — corrección de errores (solo admin).
// Si la liquidación estaba PAGADA y el saldo revive, vuelve a APPROVED.
export const deletePago = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const pagoId = parseId(req.params.pagoId);
        const pago = await prisma.liquidacionPago.findUnique({ where: { id: pagoId } });
        if (!pago || pago.liquidacionId !== id) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        await prisma.liquidacionPago.delete({ where: { id: pagoId } });

        let liq = await prisma.liquidacion.findUnique({ where: { id }, include: includeRefs });
        const calc = calcularLiquidacion(serialize(liq).data, liq.pagos);
        if (liq.status === 'PAID' && !calc.pagada) {
            liq = await prisma.liquidacion.update({
                where: { id },
                data: { status: 'APPROVED', paidAt: null },
                include: includeRefs,
            });
        }
        res.json(serialize(liq));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Envío al cliente (link público / correo) — solo APPROVED o PAID ──

const publicPdfPath = (token) => `/api/liquidaciones/public/${token}/pdf`;

async function loadSendable(req) {
    const { liq, error, status } = await loadOwned(req);
    if (error) return { error, status };
    if (!SENDABLE_STATUSES.includes(liq.status)) {
        return { error: 'La liquidación debe estar aprobada por un administrador antes de enviarse.', status: 400 };
    }
    return { liq };
}

// Genera shareToken si falta y marca la primera fecha de envío (sin cambiar status).
async function markShared(liq) {
    if (liq.shareToken && liq.sentAt) return liq;
    return prisma.liquidacion.update({
        where: { id: liq.id },
        data: {
            shareToken: liq.shareToken || crypto.randomBytes(24).toString('hex'),
            sentAt: liq.sentAt || new Date(),
        },
        include: includeRefs,
    });
}

// POST /api/liquidaciones/:id/share — link público (para WhatsApp)
export const shareLiquidacion = async (req, res) => {
    try {
        const { liq, error, status } = await loadSendable(req);
        if (error) return res.status(status).json({ error });
        const updated = await markShared(liq);
        res.json({
            ...serialize(updated),
            publicUrl: `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/liquidaciones/:id/email — PDF adjunto al correo del arrendatario
export const emailLiquidacion = async (req, res) => {
    try {
        const { liq, error, status } = await loadSendable(req);
        if (error) return res.status(status).json({ error });

        const parsed = serialize(liq);
        const to = parsed.data.origen?.arrendatarioEmail;
        if (!to) {
            return res.status(400).json({ error: 'El contrato de origen no tiene correo del arrendatario.' });
        }

        // Anti-duplicado: mismo reclamo atómico que en contratos (1 h de espera
        // tras un envío exitoso; si el envío falla se restaura el valor previo).
        const now = new Date();
        const claimed = await prisma.liquidacion.updateMany({
            where: {
                id: liq.id,
                OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }],
            },
            data: { emailedAt: now },
        });
        if (claimed.count === 0) {
            return res.status(409).json({ error: emailCooldownMessage(emailCooldownRemainingMs(liq.emailedAt)) });
        }

        try {
            const updated = await markShared(liq);
            const parsedSent = serialize(updated);
            const pdf = await generateLiquidacionPdf(parsedSent);
            const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

            const nombre = parsed.data.origen?.arrendatarioNombre;
            const publicUrl = `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`;
            await sendEmailWithPdf({
                to,
                subject: 'Liquidación inicial de su contrato de arrendamiento — TuLlave Inmobiliaria',
                text: [
                    nombre ? `Hola ${nombre},` : 'Hola,',
                    '',
                    'TuLlave Inmobiliaria le comparte la liquidación inicial de su contrato de arrendamiento en el archivo adjunto.',
                    `También puede descargarla en: ${publicUrl}`,
                    '',
                    ...mediosDePagoTexto(referenciaPago(parsed.data.origen)),
                    '',
                    'Cualquier inquietud, con gusto la atendemos.',
                    '',
                    EMPRESA.razonSocial,
                    `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
                ].join('\n'),
                pdfBuffer,
                filename: liquidacionFileName(parsedSent),
            });

            res.json({ ...parsedSent, emailedAt: now, emailedTo: to });
        } catch (sendError) {
            await prisma.liquidacion.update({
                where: { id: liq.id },
                data: { emailedAt: liq.emailedAt },
            }).catch(() => {});
            throw sendError;
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/liquidaciones/public/:token/pdf — SIN auth: el arrendatario abre el
// PDF desde el link de WhatsApp/correo. Solo liquidaciones ya compartidas.
export const publicLiquidacionPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (token.length < 32) return res.status(404).send('No encontrado');
        const liq = await prisma.liquidacion.findUnique({
            where: { shareToken: token },
            include: includeRefs,
        });
        if (!liq || !liq.sentAt || !SENDABLE_STATUSES.includes(liq.status)) {
            return res.status(404).send('No encontrado');
        }
        const parsed = serialize(liq);
        const pdf = await generateLiquidacionPdf(parsed);
        const buffer = Buffer.from(pdf.output('arraybuffer'));
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${liquidacionFileName(parsed)}"`);
        res.send(buffer);
    } catch {
        res.status(500).send('Error generando el PDF');
    }
};

// DELETE /api/liquidaciones/:id — dueño (solo editables) o admin (cualquiera).
// El cascade de LiquidacionPago borra los pagos.
export const deleteLiquidacion = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const liq = await prisma.liquidacion.findUnique({ where: { id } });
        if (!liq) return res.status(404).json({ error: 'Liquidación no encontrada' });

        const isAdmin = req.user.role === 'ADMIN';
        if (liq.userId !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta liquidación.' });
        }
        if (!isAdmin && !EDITABLE_STATUSES.includes(liq.status)) {
            return res.status(400).json({ error: 'Solo un administrador puede eliminar una liquidación ya enviada a revisión.' });
        }
        await prisma.liquidacion.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
