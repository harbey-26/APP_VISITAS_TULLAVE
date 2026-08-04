import prisma from '../utils/prisma.js';
import { z } from 'zod';
import crypto from 'crypto';
import {
    puedeTransicionar, SOLICITUD_ESTADOS, ESTADOS_ABIERTOS,
    DP_TIPOS, DP_ALERTAS, vencimientoDP, nivelAlertaDP, urgenciaVencimiento,
    REPARACION_ORDEN,
    REPORTE_MEDIOS, REPORTE_PAGO_ESTADOS, puedeTransicionarReporte,
} from '../utils/solicitudFlow.js';
import { hoyISO } from '../utils/incrementoCalc.js';
import { calcularServicioPublico, validarServicioPublico } from '../utils/servicioPublicoCalc.js';
import { verificarTerminacion } from '../utils/terminacionCheck.js';
import { generateServicioPublicoPdf, servicioPublicoFileName } from '../utils/servicioPublicoPdf.js';
import { sendEmailWithPdf, sendEmailWithAttachments } from '../utils/gmail.js';
import { sendPersonalNotification, notifyAdmins } from '../utils/notify.js';
import { EMAIL_COOLDOWN_MS, emailCooldownRemainingMs, emailCooldownMessage } from '../utils/emailCooldown.js';
import { publicBaseUrl } from '../utils/publicBaseUrl.js';
import { enviarBienvenidaPortal, enviarAvisoEstado } from '../utils/portalWelcome.js';
import { bytesRealesDataUrl, nombreArchivoSeguro } from '../utils/dataUrl.js';
import { EMPRESA } from '../utils/contractTemplates.js';
import { fechaCorta } from '../utils/fechaLetras.js';

// S1: Centro de Solicitudes (epic #32). Cada solicitud es un expediente con
// radicado único, máquina de estados (solicitudFlow.js), línea de tiempo
// inmutable y adjuntos base64. `data` guarda el JSON del tipo (reparación,
// servicio público, derecho de petición, terminación) y sus automatizaciones.
// Permisos: cualquier usuario radica; cada quien ve su bandeja (asignadas +
// creadas); el admin ve todo, asigna y elimina.

// Límite por adjunto (bytes del archivo original). El body de Express admite
// 8 MB, así que un archivo de 5 MB en base64 (~6.7 MB) todavía cabe.
export const LIMITE_ADJUNTO_BYTES = 5 * 1024 * 1024;

const solicitudSchema = z.object({
    tipo: z.string().trim().min(1).max(60).optional(),
    // #57: radicación múltiple — un expediente por tipo, vinculados (data.grupo)
    tipos: z.array(z.string().trim().min(1).max(60)).min(1).max(5).optional(),
    prioridad: z.enum(['ALTA', 'MEDIA', 'BAJA']).optional(),
    medioIngreso: z.enum(['WHATSAPP', 'CORREO', 'LLAMADA', 'PRESENCIAL', 'PORTAL', 'OTRO']),
    asunto: z.string().trim().min(1, 'Falta el asunto').max(200),
    descripcion: z.string().trim().max(3000).optional().nullable(),
    solicitanteNombre: z.string().trim().min(1, 'Falta el nombre del solicitante').max(160),
    solicitanteTipo: z.enum(['PROPIETARIO', 'ARRENDATARIO', 'TERCERO']).optional().nullable(),
    solicitanteTelefono: z.string().trim().max(30).optional().nullable(),
    // .email() no es cosmético: este valor va a la cabecera To: de los correos
    // (bienvenida, aviso de estado, respuesta del DP) — sin validar, un valor
    // con salto de línea inyecta cabeceras (Bcc a un tercero)
    solicitanteEmail: z.string().trim().email('Correo electrónico inválido').max(160).optional().nullable()
        .or(z.literal('')),
    propertyId: z.coerce.number().int().positive().optional().nullable(),
    contractId: z.coerce.number().int().positive().optional().nullable(),
    responsableId: z.coerce.number().int().positive().optional().nullable(),
    fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

const isAdmin = (req) => req.user.role === 'ADMIN';

const includeRefs = {
    creador: { select: { id: true, name: true } },
    responsable: { select: { id: true, name: true } },
    property: { select: { id: true, address: true, client: true } },
    contract: { select: { id: true, type: true, status: true, data: true } },
    // dataUrl NO va en los listados/detalle (pesado) — se descarga aparte
    adjuntos: { select: { id: true, nombre: true, mimeType: true, size: true, categoria: true, subidoPor: true, createdAt: true } },
};

const includeDetalle = {
    ...includeRefs,
    actuaciones: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    },
};

// ── Línea de tiempo (#38): registro inmutable, nunca interrumpe el flujo ──
async function registrarActuacion(solicitudId, tipo, descripcion, userId = null, meta = null) {
    try {
        return await prisma.solicitudActuacion.create({
            data: {
                solicitudId, tipo, descripcion, userId,
                meta: meta ? JSON.stringify(meta) : null,
            },
        });
    } catch (e) {
        console.warn('[Solicitudes] No se pudo registrar la actuación:', e.message);
        return null;
    }
}

// Datos del contrato vinculado (para la verificación de terminación #42).
function contratoData(solicitud) {
    if (!solicitud.contract?.data) return null;
    try { return JSON.parse(solicitud.contract.data); } catch { return null; }
}

// Serializa para el frontend: data parseado + cálculos vivos del tipo.
function serialize(sol, hoy = hoyISO()) {
    let data = {};
    try { data = sol.data ? JSON.parse(sol.data) : {}; } catch { /* data corrupto */ }
    const out = {
        ...sol,
        data,
        contract: sol.contract ? { id: sol.contract.id, type: sol.contract.type, status: sol.contract.status } : null,
        urgencia: urgenciaVencimiento(sol.fechaVencimiento, hoy),
        actuaciones: sol.actuaciones?.map((a) => {
            let meta = null;
            try { meta = a.meta ? JSON.parse(a.meta) : null; } catch { /* meta corrupto */ }
            return { ...a, meta };
        }),
    };
    if (data.servicioPublico) out.servicioCalc = calcularServicioPublico(data.servicioPublico);
    if (data.derechoPeticion) {
        out.dpAlerta = nivelAlertaDP({
            fechaRadicacion: data.derechoPeticion.fechaRadicacion,
            fechaVencimiento: sol.fechaVencimiento,
            hoy,
        });
    }
    if (data.terminacion !== undefined || sol.tipo === 'TERMINACION_DE_CONTRATO') {
        const contrato = contratoData(sol);
        out.terminacionCheck = contrato
            ? verificarTerminacion(contrato, {
                fechaSolicitud: (sol.createdAt instanceof Date ? sol.createdAt.toISOString() : String(sol.createdAt)).slice(0, 10),
                fechaDeseada: data.terminacion?.fechaDeseada,
            })
            : null;
    }
    return out;
}

// IDOR: un agente solo puede vincular SUS contratos (el expediente expone
// canon y fechas del contrato vía la verificación de terminación; sin este
// chequeo podría apuntar a cualquier contractId y leer datos ajenos).
// Devuelve el mensaje de error o null si el vínculo es válido.
async function validarContratoVinculado(contractId, req) {
    if (!contractId || isAdmin(req)) return null;
    const contract = await prisma.contract.findUnique({
        where: { id: contractId }, select: { userId: true },
    });
    if (!contract) return 'El contrato vinculado no existe.';
    if (contract.userId !== req.user.id) return 'Solo puedes vincular contratos diligenciados por ti.';
    return null;
}

// Radicado "SOL-2026-0001": consecutivo por año. Reintenta si dos radican a la
// vez (el @unique detecta la colisión). Exportado: el Portal de Clientes (P1)
// radica con el mismo consecutivo.
export async function generarRadicado() {
    const anio = new Date().getFullYear();
    const count = await prisma.solicitud.count({ where: { radicado: { startsWith: `SOL-${anio}-` } } });
    return `SOL-${anio}-${String(count + 1).padStart(4, '0')}`;
}

// ── Tipos (#35) ──

// GET /api/solicitudes/tipos — activos para el formulario; ?todas=1 (admin)
export const getTipos = async (req, res) => {
    try {
        const where = req.query.todas === '1' && isAdmin(req) ? {} : { activo: true };
        const tipos = await prisma.solicitudTipo.findMany({ where, orderBy: { orden: 'asc' } });
        res.json(tipos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// POST /api/solicitudes/tipos — solo admin. Si el tipo ya existe pero está
// DESACTIVADO, se reactiva (conserva su clave y el historial de solicitudes)
// en vez de fallar por la clave única.
export const createTipo = async (req, res) => {
    try {
        const parsed = z.object({ label: z.string().trim().min(1).max(80) }).parse(req.body);
        const clave = parsed.label.normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        const existente = await prisma.solicitudTipo.findUnique({ where: { clave } });
        if (existente) {
            if (existente.activo) return res.status(409).json({ error: 'Ya existe un tipo activo con ese nombre.' });
            const tipo = await prisma.solicitudTipo.update({
                where: { id: existente.id },
                data: { activo: true, label: parsed.label },
            });
            return res.json({ ...tipo, reactivado: true });
        }
        const max = await prisma.solicitudTipo.aggregate({ _max: { orden: true } });
        const tipo = await prisma.solicitudTipo.create({
            data: { clave, label: parsed.label, orden: (max._max.orden ?? 0) + 1 },
        });
        res.status(201).json(tipo);
    } catch (error) {
        if (error.code === 'P2002') return res.status(409).json({ error: 'Ya existe un tipo con ese nombre.' });
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/solicitudes/tipos/:id — solo admin: renombrar / activar / desactivar
export const updateTipo = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = z.object({
            label: z.string().trim().min(1).max(80).optional(),
            activo: z.boolean().optional(),
        }).parse(req.body);
        const tipo = await prisma.solicitudTipo.update({ where: { id }, data: parsed });
        res.json(tipo);
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ error: 'Tipo no encontrado' });
        res.status(400).json({ error: error.message });
    }
};

// ── CRUD del expediente (#34) ──

// GET /api/solicitudes?estado=&tipo=&responsableId=&abiertas=1
// Admin ve todo (y puede filtrar por responsable = ver cualquier bandeja);
// los demás ven su bandeja: asignadas a ellos o radicadas por ellos.
export const getSolicitudes = async (req, res) => {
    try {
        const where = {};
        if (!isAdmin(req)) {
            where.OR = [{ responsableId: req.user.id }, { creadaPor: req.user.id }];
        } else if (req.query.responsableId) {
            where.responsableId = parseId(req.query.responsableId);
        }
        if (req.query.estado) where.estado = String(req.query.estado);
        if (req.query.tipo) where.tipo = String(req.query.tipo);
        if (req.query.abiertas === '1') where.estado = { in: ESTADOS_ABIERTOS };
        const solicitudes = await prisma.solicitud.findMany({
            where,
            include: includeRefs,
            orderBy: { createdAt: 'desc' },
        });
        const hoy = hoyISO();
        res.json(solicitudes.map((s) => serialize(s, hoy)));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Automatizaciones de NACIMIENTO por tipo: término legal del DP (#41), caso de
// reparación (#36) y reporte de pago (#55). Exportada: la radicación del
// Portal de Clientes usa las mismas. `extras` trae campos del tipo que llegan
// con la radicación (dpTipo, reportePago).
export function initTipoData(tipo, extras = {}) {
    if (tipo === 'DERECHOS_DE_PETICION') {
        const dpTipo = DP_TIPOS[extras?.dpTipo] ? extras.dpTipo : 'GENERAL';
        const fechaRadicacion = hoyISO();
        return {
            fechaVencimiento: vencimientoDP(fechaRadicacion, dpTipo),
            data: { derechoPeticion: { dpTipo, fechaRadicacion, alertasEnviadas: [] } },
        };
    }
    if (tipo === 'REPARACIONES') {
        return { fechaVencimiento: null, data: { reparacion: { subEstado: 'CASO_CREADO', cotizaciones: [] } } };
    }
    if (tipo === 'REPORTE_DE_PAGO') {
        return { fechaVencimiento: null, data: { reportePago: { estado: 'REPORTADO', ...(extras?.reportePago || {}) } } };
    }
    return { fechaVencimiento: null, data: null };
}

// #57: enlaza los expedientes de una radicación múltiple — cada uno guarda el
// grupo completo en data.grupo.radicados (incluido él mismo; el frontend se
// filtra). Devuelve la descripción del vínculo para las actuaciones.
export async function vincularGrupo(solicitudes) {
    if (solicitudes.length < 2) return;
    const radicados = solicitudes.map((s) => ({ id: s.id, radicado: s.radicado, tipo: s.tipo }));
    for (const s of solicitudes) {
        let data = {};
        try { data = s.data ? JSON.parse(s.data) : {}; } catch { /* data corrupto */ }
        data.grupo = { radicados };
        await prisma.solicitud.update({ where: { id: s.id }, data: { data: JSON.stringify(data) } });
        s.data = JSON.stringify(data);
    }
}

// POST /api/solicitudes — radicar. Cualquier usuario autenticado. Con `tipos`
// (#57) crea UN expediente por tipo — cada uno con su radicado, su máquina de
// estados y sus términos propios — vinculados entre sí via data.grupo.
export const createSolicitud = async (req, res) => {
    try {
        const parsed = solicitudSchema.parse(req.body);
        const { tipos: tiposRaw, tipo: tipoUnico, ...base } = parsed;
        const tipos = [...new Set((tiposRaw?.length ? tiposRaw : [tipoUnico]).filter(Boolean))];
        if (!tipos.length) return res.status(400).json({ error: 'Falta el tipo de solicitud.' });
        const errorContrato = await validarContratoVinculado(parsed.contractId, req);
        if (errorContrato) return res.status(403).json({ error: errorContrato });

        const creadas = [];
        for (const tipo of tipos) {
            const init = initTipoData(tipo, req.body);
            // Reintento por colisión del consecutivo (dos radicando a la vez)
            let solicitud = null;
            for (let intento = 0; intento < 5 && !solicitud; intento++) {
                try {
                    solicitud = await prisma.solicitud.create({
                        data: {
                            ...base,
                            tipo,
                            radicado: await generarRadicado(),
                            creadaPor: req.user.id,
                            // El término calculado del tipo (DP) manda sobre el manual
                            fechaVencimiento: init.fechaVencimiento || base.fechaVencimiento || null,
                            data: init.data ? JSON.stringify(init.data) : null,
                        },
                        include: includeDetalle,
                    });
                } catch (e) {
                    if (e.code !== 'P2002' || intento === 4) throw e;
                }
            }
            creadas.push(solicitud);
        }
        await vincularGrupo(creadas);

        for (const solicitud of creadas) {
            const hermanos = creadas.filter((s) => s.id !== solicitud.id).map((s) => s.radicado);
            await registrarActuacion(
                solicitud.id, 'CREACION',
                `Solicitud radicada (${solicitud.radicado}) — ${solicitud.asunto}` +
                (hermanos.length ? ` · junto con ${hermanos.join(', ')}` : ''),
                req.user.id,
            );
            if (solicitud.tipo === 'DERECHOS_DE_PETICION' && solicitud.fechaVencimiento) {
                const dpTipo = JSON.parse(solicitud.data).derechoPeticion.dpTipo;
                await registrarActuacion(
                    solicitud.id, 'AUTOMATIZACION',
                    `Término legal calculado: vence el ${fechaCorta(solicitud.fechaVencimiento)} (${DP_TIPOS[dpTipo].label}, días hábiles).`,
                );
            }
        }
        // P1: si viene con correo del cliente, avisarle que puede seguirla en
        // el Portal de Clientes (fire-and-forget; UNA bienvenida por radicación)
        if (creadas[0].solicitanteEmail) enviarBienvenidaPortal(creadas[0]);

        // Radicada con responsable de una vez → notificarle (un solo FCM)
        if (base.responsableId && base.responsableId !== req.user.id) {
            sendPersonalNotification(
                base.responsableId, creadas.length > 1 ? '📋 Solicitudes asignadas' : '📋 Solicitud asignada',
                `${creadas.map((s) => s.radicado).join(', ')}: ${creadas[0].asunto} (${creadas[0].solicitanteNombre})`,
            ).catch(() => {});
            for (const solicitud of creadas) {
                await registrarActuacion(
                    solicitud.id, 'ASIGNACION',
                    `Asignada a ${solicitud.responsable?.name || 'un funcionario'}`,
                    req.user.id,
                );
            }
        }
        const conActuaciones = await prisma.solicitud.findUnique({ where: { id: creadas[0].id }, include: includeDetalle });
        res.status(201).json(serialize(conActuaciones));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Carga + permiso: admin, responsable o creador.
async function loadOwned(req, include = includeDetalle) {
    const id = parseId(req.params.id);
    const sol = await prisma.solicitud.findUnique({ where: { id }, include });
    if (!sol) return { error: 'Solicitud no encontrada', status: 404 };
    if (!isAdmin(req) && sol.responsableId !== req.user.id && sol.creadaPor !== req.user.id) {
        return { error: 'No tienes permiso sobre esta solicitud.', status: 403 };
    }
    return { sol };
}

// GET /api/solicitudes/:id — detalle con línea de tiempo
export const getSolicitud = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        res.json(serialize(sol));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/solicitudes/:id — editar campos base (no estado, no data de tipo)
export const updateSolicitud = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (sol.estado === 'ARCHIVADA') {
            return res.status(400).json({ error: 'Una solicitud archivada no se edita.' });
        }
        const parsed = solicitudSchema.partial().omit({ tipo: true }).parse(req.body);
        delete parsed.responsableId; // la asignación tiene su endpoint con notificación
        if (parsed.contractId !== undefined && parsed.contractId !== sol.contractId) {
            const errorContrato = await validarContratoVinculado(parsed.contractId, req);
            if (errorContrato) return res.status(403).json({ error: errorContrato });
        }
        const updated = await prisma.solicitud.update({
            where: { id: sol.id }, data: parsed, include: includeDetalle,
        });
        // P1: correo del cliente agregado o corregido → avisarle del portal
        // (el caso típico: se radicó sin correo y se completa después)
        const emailNuevo = (parsed.solicitanteEmail || '').trim();
        if (emailNuevo && emailNuevo.toLowerCase() !== (sol.solicitanteEmail || '').trim().toLowerCase()) {
            enviarBienvenidaPortal(updated);
        }
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/solicitudes/:id/estado — máquina de estados (#33)
export const cambiarEstado = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const parsed = z.object({
            estado: z.string(),
            nota: z.string().trim().max(500).optional(),
            // P1: resultado del cierre — visible para el cliente en su portal
            resultado: z.enum(['EXITOSA', 'CON_NOVEDAD']).optional(),
        }).parse(req.body);
        if (!SOLICITUD_ESTADOS[parsed.estado]) {
            return res.status(400).json({ error: 'Estado desconocido.' });
        }
        if (!puedeTransicionar(sol.estado, parsed.estado)) {
            return res.status(400).json({
                error: `No se puede pasar de "${SOLICITUD_ESTADOS[sol.estado].label}" a "${SOLICITUD_ESTADOS[parsed.estado].label}" — el flujo no permite saltar pasos.`,
            });
        }
        // El cierre queda en data.cierre (resultado + nota); reabrir lo borra
        let dataJson = {};
        try { dataJson = sol.data ? JSON.parse(sol.data) : {}; } catch { /* data corrupto */ }
        if (parsed.estado === 'FINALIZADA') {
            dataJson.cierre = {
                resultado: parsed.resultado || 'EXITOSA',
                nota: parsed.nota || null,
                fecha: new Date().toISOString(),
            };
        } else if (parsed.estado === 'EN_GESTION' && sol.estado === 'FINALIZADA') {
            delete dataJson.cierre; // reabierta
        }
        await prisma.solicitud.update({
            where: { id: sol.id },
            data: {
                estado: parsed.estado,
                data: JSON.stringify(dataJson),
                finalizadaAt: parsed.estado === 'FINALIZADA' ? new Date()
                    : parsed.estado === 'EN_GESTION' && sol.estado === 'FINALIZADA' ? null // reabierta
                        : sol.finalizadaAt,
            },
            include: includeDetalle,
        });
        const sufijoCierre = parsed.estado === 'FINALIZADA'
            ? (parsed.resultado === 'CON_NOVEDAD' ? ' · cerrada con novedad' : ' · gestión exitosa')
            : '';
        await registrarActuacion(
            sol.id, 'ESTADO',
            `Estado: ${SOLICITUD_ESTADOS[sol.estado].label} → ${SOLICITUD_ESTADOS[parsed.estado].label}${sufijoCierre}${parsed.nota ? ` — ${parsed.nota}` : ''}`,
            req.user.id,
            { de: sol.estado, a: parsed.estado },
        );
        // P1: avisar al cliente por correo en cada cambio de estado (si el
        // expediente tiene su correo) — fire-and-forget
        enviarAvisoEstado(sol, { estado: parsed.estado, nota: parsed.nota, resultado: parsed.resultado });

        // Notificación al responsable y al creador (a quien no hizo el cambio)
        const aviso = `${sol.radicado} pasó a "${SOLICITUD_ESTADOS[parsed.estado].label}"${parsed.nota ? `: ${parsed.nota}` : ''}`;
        for (const uid of new Set([sol.responsableId, sol.creadaPor].filter(Boolean))) {
            if (uid !== req.user.id) {
                sendPersonalNotification(uid, '📋 Solicitud actualizada', aviso).catch(() => {});
            }
        }
        const final = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
        res.json(serialize(final));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/solicitudes/:id/asignar — solo admin (#43)
export const asignarSolicitud = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = z.object({ responsableId: z.coerce.number().int().positive().nullable() }).parse(req.body);
        const sol = await prisma.solicitud.findUnique({ where: { id } });
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
        const updated = await prisma.solicitud.update({
            where: { id },
            data: { responsableId: parsed.responsableId },
            include: includeDetalle,
        });
        const nombre = updated.responsable?.name || 'sin responsable';
        await registrarActuacion(id, 'ASIGNACION', parsed.responsableId ? `Asignada a ${nombre}` : 'Quedó sin responsable', req.user.id);
        if (parsed.responsableId && parsed.responsableId !== req.user.id) {
            sendPersonalNotification(
                parsed.responsableId, '📋 Solicitud asignada',
                `${updated.radicado}: ${updated.asunto} (${updated.solicitanteNombre})`,
            ).catch(() => {});
        }
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/solicitudes/:id/notas — nota manual en la línea de tiempo (#38).
// P1: con { paraCliente: true } la nota queda VISIBLE en el Portal de
// Clientes (el responsable informa el avance); sin el flag sigue siendo
// interna, como siempre.
export const agregarNota = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const parsed = z.object({
            texto: z.string().trim().min(1, 'La nota está vacía').max(2000),
            paraCliente: z.boolean().optional(),
        }).parse(req.body);
        await registrarActuacion(sol.id, 'NOTA', parsed.texto, req.user.id, parsed.paraCliente ? { paraCliente: true } : null);
        const updated = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
        res.status(201).json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Adjuntos (#39) ──

const adjuntoSchema = z.object({
    nombre: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().max(100),
    size: z.coerce.number().int().positive(),
    categoria: z.string().trim().max(30).optional(),
    dataUrl: z.string().startsWith('data:', 'El adjunto debe venir como data URL'),
});

// POST /api/solicitudes/:id/adjuntos — { adjuntos: [...] } (múltiple)
export const agregarAdjuntos = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const adjuntos = z.array(adjuntoSchema).min(1).max(10).parse(req.body?.adjuntos);
        for (const a of adjuntos) {
            // El peso REAL manda: `size` lo declara el cliente y puede mentir
            const bytes = bytesRealesDataUrl(a.dataUrl);
            if (bytes > LIMITE_ADJUNTO_BYTES) {
                return res.status(400).json({
                    error: `"${a.nombre}" pesa ${(bytes / 1024 / 1024).toFixed(1)} MB — el máximo por archivo es ${LIMITE_ADJUNTO_BYTES / 1024 / 1024} MB.`,
                });
            }
            a.size = bytes;
            a.nombre = nombreArchivoSeguro(a.nombre);
        }
        for (const a of adjuntos) {
            await prisma.solicitudAdjunto.create({
                data: {
                    solicitudId: sol.id,
                    nombre: a.nombre,
                    mimeType: a.mimeType,
                    size: a.size,
                    categoria: a.categoria || 'OTRO',
                    dataUrl: a.dataUrl,
                    subidoPor: req.user.id,
                },
            });
            await registrarActuacion(sol.id, 'ADJUNTO', `Adjuntó "${a.nombre}"`, req.user.id, { categoria: a.categoria || 'OTRO' });
        }
        const updated = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
        res.status(201).json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/solicitudes/:id/adjuntos/:adjId — contenido (dataUrl) bajo demanda
export const getAdjunto = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req, includeRefs);
        if (error) return res.status(status).json({ error });
        const adjId = parseId(req.params.adjId);
        const adj = await prisma.solicitudAdjunto.findUnique({ where: { id: adjId } });
        if (!adj || adj.solicitudId !== sol.id) return res.status(404).json({ error: 'Adjunto no encontrado' });
        res.json(adj);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// DELETE /api/solicitudes/:id — admin, o el creador mientras siga RECIBIDA
export const deleteSolicitud = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const sol = await prisma.solicitud.findUnique({ where: { id } });
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
        const puedeBorrar = isAdmin(req) || (sol.creadaPor === req.user.id && sol.estado === 'RECIBIDA');
        if (!puedeBorrar) {
            return res.status(403).json({ error: 'Solo un administrador puede eliminar una solicitud ya en trámite.' });
        }
        await prisma.solicitud.delete({ where: { id } }); // cascade: actuaciones + adjuntos
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Automatizaciones por tipo (#36, #37, #41, #42) ──

// PATCH /api/solicitudes/:id/data — actualiza el JSON del tipo con validación
// y recálculo server-side. body = { reparacion? | servicioPublico? |
// derechoPeticion? | terminacion? } (solo la sección que cambia).
export const updateData = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        if (['FINALIZADA', 'ARCHIVADA'].includes(sol.estado)) {
            return res.status(400).json({ error: 'Esta solicitud ya está cerrada.' });
        }
        const data = serialize(sol).data;
        const cambios = [];
        let fechaVencimiento = sol.fechaVencimiento;

        if (req.body?.servicioPublico) {
            const cfg = z.object({
                servicio: z.string().trim().max(60).optional(),
                numeroFactura: z.string().trim().max(60).optional().nullable(),
                valorTotal: z.coerce.number().min(0).optional(),
                fechaInicialPeriodo: z.string().max(10).optional(),
                fechaFinalPeriodo: z.string().max(10).optional(),
                fechaEntrega: z.string().max(10).optional(),
                nota: z.string().trim().max(500).optional().nullable(),
            }).parse(req.body.servicioPublico);
            data.servicioPublico = { ...(data.servicioPublico || {}), ...cfg };
            const calc = calcularServicioPublico(data.servicioPublico);
            if (calc.completo) {
                cambios.push(`Liquidación de servicio calculada: propietario $${calc.valorPropietario.toLocaleString('es-CO')} (${calc.diasPropietario} días), arrendatario $${calc.valorArrendatario.toLocaleString('es-CO')} (${calc.diasArrendatario} días).`);
            }
        }

        if (req.body?.reparacion) {
            const cfg = z.object({
                descripcionDano: z.string().trim().max(2000).optional(),
                subEstado: z.enum(REPARACION_ORDEN).optional(),
                cotizaciones: z.array(z.object({
                    proveedor: z.string().trim().max(120),
                    monto: z.coerce.number().min(0),
                    fecha: z.string().max(10).optional().nullable(),
                    nota: z.string().trim().max(300).optional().nullable(),
                })).max(20).optional(),
                autorizacion: z.object({
                    estado: z.enum(['PENDIENTE', 'AUTORIZADO', 'RECHAZADO']),
                    fecha: z.string().max(10).optional().nullable(),
                    nota: z.string().trim().max(300).optional().nullable(),
                }).optional(),
                tecnico: z.object({
                    nombre: z.string().trim().max(120),
                    telefono: z.string().trim().max(30).optional().nullable(),
                    fechaProgramada: z.string().max(10).optional().nullable(),
                }).optional().nullable(),
            }).parse(req.body.reparacion);
            const prev = data.reparacion || {};
            data.reparacion = { ...prev, ...cfg };
            if (cfg.subEstado && cfg.subEstado !== prev.subEstado) {
                cambios.push(`Reparación: paso "${cfg.subEstado.replaceAll('_', ' ').toLowerCase()}".`);
            }
            if (cfg.autorizacion && cfg.autorizacion.estado !== prev.autorizacion?.estado) {
                cambios.push(`Autorización del propietario: ${cfg.autorizacion.estado}.`);
            }
            if (cfg.tecnico?.nombre && cfg.tecnico.nombre !== prev.tecnico?.nombre) {
                cambios.push(`Técnico asignado: ${cfg.tecnico.nombre}${cfg.tecnico.fechaProgramada ? ` (visita ${fechaCorta(cfg.tecnico.fechaProgramada)})` : ''}.`);
            }
        }

        if (req.body?.derechoPeticion) {
            const cfg = z.object({
                dpTipo: z.enum(Object.keys(DP_TIPOS)),
                fechaRadicacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            }).parse(req.body.derechoPeticion);
            const prev = data.derechoPeticion || { alertasEnviadas: [] };
            const fechaRadicacion = cfg.fechaRadicacion || prev.fechaRadicacion || hoyISO();
            data.derechoPeticion = { ...prev, ...cfg, fechaRadicacion };
            fechaVencimiento = vencimientoDP(fechaRadicacion, cfg.dpTipo);
            cambios.push(`Término recalculado (${DP_TIPOS[cfg.dpTipo].label}): vence el ${fechaCorta(fechaVencimiento)}.`);
        }

        if (req.body?.terminacion) {
            const cfg = z.object({
                fechaDeseada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
            }).parse(req.body.terminacion);
            data.terminacion = { ...(data.terminacion || {}), ...cfg };
            cambios.push('Verificación de terminación actualizada.');
        }

        // #55: datos del pago reportado + ciclo de conciliación. El estado
        // avanza solo por transiciones válidas (reportado → en verificación →
        // conciliado/rechazado); el resultado queda con auditoría de quién.
        if (req.body?.reportePago) {
            const cfg = z.object({
                valor: z.coerce.number().min(0).optional(),
                fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                medioPago: z.enum(Object.keys(REPORTE_MEDIOS)).optional(),
                referencia: z.string().trim().max(80).optional().nullable(),
                estado: z.enum(Object.keys(REPORTE_PAGO_ESTADOS)).optional(),
                nota: z.string().trim().max(500).optional().nullable(),
            }).parse(req.body.reportePago);
            const prev = data.reportePago || { estado: 'REPORTADO' };
            if (cfg.estado && cfg.estado !== prev.estado) {
                if (!puedeTransicionarReporte(prev.estado || 'REPORTADO', cfg.estado)) {
                    const de = REPORTE_PAGO_ESTADOS[prev.estado]?.label || prev.estado;
                    const a = REPORTE_PAGO_ESTADOS[cfg.estado].label;
                    return res.status(400).json({ error: `El reporte no puede pasar de "${de}" a "${a}".` });
                }
                cambios.push(`Reporte de pago: ${REPORTE_PAGO_ESTADOS[cfg.estado].label}${cfg.nota ? ` — ${cfg.nota}` : ''}.`);
            }
            data.reportePago = { ...prev, ...cfg };
            if (cfg.estado && ['CONCILIADO', 'RECHAZADO'].includes(cfg.estado)) {
                // El JWT no trae el nombre — buscarlo para la auditoría
                const quien = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
                data.reportePago.resueltoPor = quien?.name || 'el equipo';
                data.reportePago.resueltoAt = new Date().toISOString();
            }
        }

        await prisma.solicitud.update({
            where: { id: sol.id },
            data: { data: JSON.stringify(data), fechaVencimiento },
        });
        for (const c of cambios) {
            await registrarActuacion(sol.id, 'AUTOMATIZACION', c, req.user.id);
        }
        const final = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
        res.json(serialize(final));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/solicitudes/:id/respuesta — DP (#41): registrar la respuesta.
// P1: con medio CORREO el sistema ENVÍA el correo de verdad al solicitante
// (con los adjuntos elegidos vía adjuntoIds) — antes solo dejaba constancia
// y el envío era manual, lo que hacía creer que el sistema lo había mandado.
// Solo se registra la respuesta si el envío sale bien.
export const registrarRespuesta = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const parsed = z.object({
            texto: z.string().trim().min(1, 'La respuesta está vacía').max(5000),
            medio: z.enum(['CORREO', 'FISICO', 'WHATSAPP', 'OTRO']),
            fechaEnvio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            adjuntoIds: z.array(z.coerce.number().int().positive()).max(3).optional(),
        }).parse(req.body);

        // Documentos que COMPONEN la respuesta (deben ser de ESTE expediente).
        // Se guardan en data.respuesta con cualquier medio; con CORREO además
        // viajan adjuntos en el correo.
        const adjuntos = parsed.adjuntoIds?.length
            ? await prisma.solicitudAdjunto.findMany({
                where: { id: { in: parsed.adjuntoIds }, solicitudId: sol.id },
                select: { id: true, nombre: true, mimeType: true, dataUrl: true },
            })
            : [];
        if ((parsed.adjuntoIds?.length || 0) !== adjuntos.length) {
            return res.status(400).json({ error: 'Alguno de los adjuntos elegidos no pertenece a este expediente.' });
        }

        let descripcionActuacion;
        if (parsed.medio === 'CORREO') {
            const to = (sol.solicitanteEmail || '').trim();
            if (!to) {
                return res.status(400).json({ error: 'El expediente no tiene correo del solicitante: agrégalo antes de enviar la respuesta por correo.' });
            }
            await sendEmailWithAttachments({
                to,
                subject: `Respuesta a su solicitud ${sol.radicado} — ${EMPRESA.razonSocial}`,
                text: [
                    `Hola ${sol.solicitanteNombre},`,
                    '',
                    `${EMPRESA.razonSocial} da respuesta a su solicitud "${sol.asunto}" (radicado ${sol.radicado}):`,
                    '',
                    parsed.texto,
                    ...(adjuntos.length ? ['', `Se adjunta${adjuntos.length > 1 ? 'n' : ''}: ${adjuntos.map((a) => a.nombre).join(', ')}.`] : []),
                    '',
                    'Cualquier inquietud, con gusto la atendemos.',
                    '',
                    EMPRESA.razonSocial,
                    `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
                ].join('\n'),
                attachments: adjuntos.map((a) => ({
                    base64: a.dataUrl.slice(a.dataUrl.indexOf(',') + 1),
                    filename: a.nombre,
                    mimeType: a.mimeType,
                })),
            });
            descripcionActuacion = `Respuesta enviada por correo a ${to}${adjuntos.length ? ` con ${adjuntos.length} adjunto(s)` : ''}.`;
        }

        const data = serialize(sol).data;
        data.respuesta = {
            texto: parsed.texto,
            medio: parsed.medio,
            fechaEnvio: parsed.fechaEnvio || hoyISO(),
            registradaPor: req.user.id,
            // Los documentos de la respuesta quedan referenciados en el
            // expediente (y el cliente puede descargarlos desde su portal)
            adjuntos: adjuntos.map((a) => ({ id: a.id, nombre: a.nombre })),
        };
        await prisma.solicitud.update({
            where: { id: sol.id },
            data: { data: JSON.stringify(data) },
        });
        await registrarActuacion(
            sol.id, 'RESPUESTA',
            descripcionActuacion || `Respuesta registrada (enviada por ${parsed.medio.toLowerCase()} el ${fechaCorta(data.respuesta.fechaEnvio)}, por fuera del sistema)${adjuntos.length ? ` — ${adjuntos.length} documento(s) referenciados` : ''}.`,
            req.user.id,
        );
        const updated = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
        res.status(201).json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Liquidación de servicios: PDF, link público y correo (#37) ──

async function ensureShareToken(sol) {
    if (sol.shareToken) return sol;
    return prisma.solicitud.update({
        where: { id: sol.id },
        data: { shareToken: crypto.randomBytes(24).toString('hex') },
        include: includeDetalle,
    });
}

function servicioListo(sol) {
    const errores = validarServicioPublico(serialize(sol).data.servicioPublico || {});
    return errores.length === 0 ? null : errores[0];
}

// POST /api/solicitudes/:id/servicio-share — link público del PDF (WhatsApp)
export const shareServicioPdf = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const invalido = servicioListo(sol);
        if (invalido) return res.status(400).json({ error: invalido });
        const updated = await ensureShareToken(sol);
        await registrarActuacion(sol.id, 'AUTOMATIZACION', 'Se generó el link público de la liquidación de servicio.', req.user.id);
        res.json({
            ...serialize(updated),
            publicUrl: `${publicBaseUrl(req)}/api/solicitudes/public/${updated.shareToken}/servicio-pdf`,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/solicitudes/:id/servicio-email — { destinatario: 'PROPIETARIO'|'ARRENDATARIO'|'SOLICITANTE', email? }
export const emailServicioPdf = async (req, res) => {
    try {
        const { sol, error, status } = await loadOwned(req);
        if (error) return res.status(status).json({ error });
        const invalido = servicioListo(sol);
        if (invalido) return res.status(400).json({ error: invalido });
        const to = String(req.body?.email || sol.solicitanteEmail || '').trim();
        if (!to) return res.status(400).json({ error: 'No hay correo de destino: agrégalo en el expediente o en la petición.' });

        // Anti-duplicado (1 h) — mismo reclamo atómico de contratos
        const now = new Date();
        const claimed = await prisma.solicitud.updateMany({
            where: {
                id: sol.id,
                OR: [{ emailedAt: null }, { emailedAt: { lt: new Date(now.getTime() - EMAIL_COOLDOWN_MS) } }],
            },
            data: { emailedAt: now },
        });
        if (claimed.count === 0) {
            return res.status(409).json({ error: emailCooldownMessage(emailCooldownRemainingMs(sol.emailedAt)) });
        }

        try {
            const updated = await ensureShareToken(sol);
            const parsed = serialize(updated);
            const calc = parsed.servicioCalc;
            const pdf = await generateServicioPublicoPdf(parsed);
            const publicUrl = `${publicBaseUrl(req)}/api/solicitudes/public/${updated.shareToken}/servicio-pdf`;
            await sendEmailWithPdf({
                to,
                subject: `Liquidación proporcional de ${parsed.data.servicioPublico.servicio} — ${EMPRESA.razonSocial}`,
                text: [
                    `Hola ${parsed.solicitanteNombre},`,
                    '',
                    `${EMPRESA.razonSocial} le comparte la liquidación proporcional del servicio de ${parsed.data.servicioPublico.servicio} (radicado ${parsed.radicado}).`,
                    `Propietario: $${calc.valorPropietario.toLocaleString('es-CO')} (${calc.diasPropietario} días) · Arrendatario: $${calc.valorArrendatario.toLocaleString('es-CO')} (${calc.diasArrendatario} días).`,
                    `También puede descargarla en: ${publicUrl}`,
                    '',
                    'Cualquier inquietud, con gusto la atendemos.',
                    '',
                    EMPRESA.razonSocial,
                    `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
                ].join('\n'),
                pdfBuffer: Buffer.from(pdf.output('arraybuffer')),
                filename: servicioPublicoFileName(parsed),
            });
            await registrarActuacion(sol.id, 'RESPUESTA', `Liquidación de servicio enviada por correo a ${to}.`, req.user.id);
            const final = await prisma.solicitud.findUnique({ where: { id: sol.id }, include: includeDetalle });
            res.json({ ...serialize(final), emailedTo: to });
        } catch (sendError) {
            await prisma.solicitud.update({
                where: { id: sol.id },
                data: { emailedAt: sol.emailedAt },
            }).catch(() => {});
            throw sendError;
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/solicitudes/public/:token/servicio-pdf — SIN auth
export const publicServicioPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (token.length < 32) return res.status(404).send('No encontrado');
        const sol = await prisma.solicitud.findUnique({ where: { shareToken: token }, include: includeRefs });
        if (!sol) return res.status(404).send('No encontrado');
        const parsed = serialize(sol);
        if (validarServicioPublico(parsed.data.servicioPublico || {}).length > 0) {
            return res.status(404).send('No encontrado');
        }
        const pdf = await generateServicioPublicoPdf(parsed);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${servicioPublicoFileName(parsed)}"`);
        res.send(Buffer.from(pdf.output('arraybuffer')));
    } catch {
        res.status(500).send('Error generando el PDF');
    }
};

// ── Dashboard (#40) ──

// GET /api/solicitudes/stats — indicadores (admin; un agente ve los suyos)
export const getStats = async (req, res) => {
    try {
        const where = isAdmin(req) ? {} : { OR: [{ responsableId: req.user.id }, { creadaPor: req.user.id }] };
        const solicitudes = await prisma.solicitud.findMany({
            where,
            select: {
                id: true, tipo: true, estado: true, prioridad: true,
                fechaVencimiento: true, createdAt: true, finalizadaAt: true,
                responsableId: true,
            },
        });
        const hoy = hoyISO();
        const abiertas = solicitudes.filter((s) => ESTADOS_ABIERTOS.includes(s.estado));
        const cerradas = solicitudes.filter((s) => ['FINALIZADA', 'ARCHIVADA'].includes(s.estado));
        const vencidas = abiertas.filter((s) => urgenciaVencimiento(s.fechaVencimiento, hoy) === 'VENCIDA');
        const porVencer = abiertas.filter((s) => urgenciaVencimiento(s.fechaVencimiento, hoy) === 'POR_VENCER');

        // Tiempo promedio de respuesta (creación → finalización), en horas
        const conCierre = solicitudes.filter((s) => s.finalizadaAt);
        const promedioHoras = conCierre.length > 0
            ? Math.round(conCierre.reduce((sum, s) => sum + (new Date(s.finalizadaAt) - new Date(s.createdAt)), 0) / conCierre.length / 3600000)
            : null;

        const contar = (lista, campo) => {
            const out = {};
            for (const s of lista) out[s[campo]] = (out[s[campo]] || 0) + 1;
            return out;
        };

        // Tendencia: radicadas por mes (últimos 6)
        const tendencia = {};
        for (const s of solicitudes) {
            const mes = new Date(s.createdAt).toISOString().slice(0, 7);
            tendencia[mes] = (tendencia[mes] || 0) + 1;
        }

        res.json({
            abiertas: abiertas.length,
            cerradas: cerradas.length,
            vencidas: vencidas.length,
            porVencer: porVencer.length,
            promedioHoras,
            porTipo: contar(abiertas, 'tipo'),
            porEstado: contar(solicitudes, 'estado'),
            tendencia: Object.entries(tendencia).sort().slice(-6).map(([mes, total]) => ({ mes, total })),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ── Cron de alertas de vencimiento (#41) ──
// Revisa las solicitudes abiertas con término: los derechos de petición tienen
// niveles escalonados (mitad, 3 días, vence hoy, vencido); los demás tipos
// avisan una vez al vencer. Cada alerta se envía UNA sola vez
// (data.alertasEnviadas) y queda en la línea de tiempo.
export async function revisarVencimientos() {
    const hoy = hoyISO();
    const abiertas = await prisma.solicitud.findMany({
        where: { estado: { in: ESTADOS_ABIERTOS }, fechaVencimiento: { not: null } },
        include: { responsable: { select: { id: true, name: true } } },
    });
    let enviadas = 0;
    for (const sol of abiertas) {
        let data = {};
        try { data = sol.data ? JSON.parse(sol.data) : {}; } catch { /* data corrupto */ }
        const esDP = !!data.derechoPeticion;
        const alertasEnviadas = (esDP ? data.derechoPeticion.alertasEnviadas : data.alertasEnviadas) || [];

        const nivel = esDP
            ? nivelAlertaDP({ fechaRadicacion: data.derechoPeticion.fechaRadicacion, fechaVencimiento: sol.fechaVencimiento, hoy })
            : (urgenciaVencimiento(sol.fechaVencimiento, hoy) === 'VENCIDA' ? 'VENCIDO' : null);
        if (!nivel || alertasEnviadas.includes(nivel)) continue;

        const info = DP_ALERTAS[nivel] || { label: 'Término vencido', emoji: '⚫' };
        const titulo = `${info.emoji} ${sol.radicado}: ${info.label}`;
        const cuerpo = `${sol.asunto} — vence el ${fechaCorta(sol.fechaVencimiento)}.${nivel === 'VENCIDO' ? ' ¡Término vencido: riesgo jurídico!' : ''}`;
        if (sol.responsableId) sendPersonalNotification(sol.responsableId, titulo, cuerpo).catch(() => {});
        if (nivel === 'VENCIDO' || nivel === 'VENCE_HOY' || !sol.responsableId) {
            notifyAdmins(titulo, cuerpo);
        }
        await registrarActuacion(sol.id, 'ALERTA', `${info.emoji} ${info.label} (vence el ${fechaCorta(sol.fechaVencimiento)}).`);

        alertasEnviadas.push(nivel);
        if (esDP) data.derechoPeticion.alertasEnviadas = alertasEnviadas;
        else data.alertasEnviadas = alertasEnviadas;
        await prisma.solicitud.update({
            where: { id: sol.id },
            data: { data: JSON.stringify(data) },
        }).catch(() => {});
        enviadas += 1;
    }
    if (enviadas > 0) console.log(`[Solicitudes] ${enviadas} alerta(s) de vencimiento enviadas`);
    return enviadas;
}
