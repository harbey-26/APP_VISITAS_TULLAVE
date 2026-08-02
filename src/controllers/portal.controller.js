import prisma from '../utils/prisma.js';
import { z } from 'zod';
import crypto from 'crypto';
import { generatePortalToken } from '../utils/portalAuth.js';
import { hashPassword } from '../utils/auth.js';
import { sendTextEmail } from '../utils/gmail.js';
import { notifyAdmins, sendPersonalNotification } from '../utils/notify.js';
import { generarRadicado, LIMITE_ADJUNTO_BYTES } from './solicitud.controller.js';
import { DP_TIPOS, vencimientoDP } from '../utils/solicitudFlow.js';
import { hoyISO } from '../utils/incrementoCalc.js';
import { EMPRESA } from '../utils/contractTemplates.js';

// P1: Portal de Clientes — módulo AISLADO del resto de la API. Los clientes
// (propietarios/arrendatarios) entran con su correo + código OTP, radican
// solicitudes y siguen su estado. Reglas de aislamiento:
//   - Auth propio (portalAuth): un token del portal no sirve en /api/* del
//     equipo ni al revés.
//   - La identidad es el CORREO verificado: el cliente solo ve solicitudes
//     cuyo solicitanteEmail coincide con su correo.
//   - Lo que sale hacia el cliente es una vista BLANQUEADA del expediente
//     (sin responsable, sin notas internas, sin data del tipo).
//   - Las radicadas desde el portal quedan con medioIngreso PORTAL y
//     creadaPor = usuario sistema "Portal de Clientes" (los admins las ven
//     en el Centro de Solicitudes como cualquier otra).

const OTP_TTL_MS = 10 * 60 * 1000;      // el código vive 10 minutos
const OTP_MAX_INTENTOS = 5;             // intentos de verificación por código
const OTP_MAX_POR_VENTANA = 3;          // códigos por correo cada 15 min
const OTP_VENTANA_MS = 15 * 60 * 1000;
const PORTAL_USER_EMAIL = 'portal@tullave.sistema';

const esDev = () => process.env.NODE_ENV !== 'production';
const normalizarEmail = (raw) => String(raw || '').trim().toLowerCase();
const hashCodigo = (email, codigo) =>
    crypto.createHash('sha256').update(`${email}:${codigo}`).digest('hex');

// Timeline: registro directo (el helper del controlador de solicitudes es
// interno). userId null = actuación del sistema/portal.
async function actuacionPortal(solicitudId, tipo, descripcion, meta = null) {
    try {
        return await prisma.solicitudActuacion.create({
            data: { solicitudId, tipo, descripcion, userId: null, meta: meta ? JSON.stringify(meta) : null },
        });
    } catch (e) {
        console.warn('[Portal] No se pudo registrar la actuación:', e.message);
        return null;
    }
}

// Usuario sistema del portal (creadaPor es FK obligatoria). Se crea una sola
// vez con rol PORTAL y contraseña aleatoria irrecuperable — no puede loguearse.
let _portalUserId = null;
async function portalUserId() {
    if (_portalUserId) return _portalUserId;
    let user = await prisma.user.findUnique({ where: { email: PORTAL_USER_EMAIL } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email: PORTAL_USER_EMAIL,
                name: 'Portal de Clientes',
                role: 'PORTAL',
                password: await hashPassword(crypto.randomBytes(32).toString('hex')),
            },
        });
    }
    _portalUserId = user.id;
    return _portalUserId;
}

// ── Auth por OTP ──

// POST /api/portal/auth/solicitar-codigo — { email }
export const solicitarCodigo = async (req, res) => {
    try {
        const email = normalizarEmail(z.string().trim().min(5).max(160).email('Correo inválido').parse(req.body?.email));

        // Limpieza oportunista de códigos viejos (>1 día vencidos)
        await prisma.portalOtp.deleteMany({
            where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        }).catch(() => {});

        // Anti-abuso: máximo 3 códigos por correo cada 15 minutos
        const recientes = await prisma.portalOtp.count({
            where: { email, createdAt: { gt: new Date(Date.now() - OTP_VENTANA_MS) } },
        });
        if (recientes >= OTP_MAX_POR_VENTANA) {
            return res.status(429).json({ error: 'Ya enviamos varios códigos a ese correo. Espera unos minutos e inténtalo de nuevo.' });
        }

        const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const otp = await prisma.portalOtp.create({
            data: { email, codeHash: hashCodigo(email, codigo), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
        });
        if (esDev()) console.log(`[Portal] Código OTP para ${email}: ${codigo}`);

        try {
            await sendTextEmail({
                to: email,
                subject: `${codigo} es su código de acceso — ${EMPRESA.razonSocial}`,
                text: [
                    'Hola,',
                    '',
                    `Su código de acceso al Portal de Clientes de ${EMPRESA.razonSocial} es:`,
                    '',
                    `    ${codigo}`,
                    '',
                    'El código vence en 10 minutos. Si usted no lo solicitó, ignore este correo.',
                    '',
                    EMPRESA.razonSocial,
                    `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
                ].join('\n'),
            });
        } catch (sendError) {
            if (!esDev()) {
                // En producción sin correo no hay forma de entregar el código
                await prisma.portalOtp.delete({ where: { id: otp.id } }).catch(() => {});
                console.error('[Portal] No se pudo enviar el OTP:', sendError.message);
                return res.status(502).json({ error: 'No pudimos enviar el código a su correo. Intente de nuevo en unos minutos.' });
            }
            console.warn('[Portal] (dev) Correo no enviado, usa el código del log:', sendError.message);
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/portal/auth/verificar — { email, codigo } → { token, email, nombre }
export const verificarCodigo = async (req, res) => {
    try {
        const parsed = z.object({
            email: z.string().trim().min(5).max(160).email(),
            codigo: z.string().trim().regex(/^\d{6}$/, 'El código son 6 dígitos'),
        }).parse(req.body);
        const email = normalizarEmail(parsed.email);

        const otp = await prisma.portalOtp.findFirst({
            where: { email, usadoAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (!otp || otp.expiresAt < new Date()) {
            return res.status(400).json({ error: 'El código venció o no fue solicitado. Pide uno nuevo.' });
        }
        if (otp.intentos >= OTP_MAX_INTENTOS) {
            return res.status(400).json({ error: 'Demasiados intentos con ese código. Pide uno nuevo.' });
        }
        if (otp.codeHash !== hashCodigo(email, parsed.codigo)) {
            await prisma.portalOtp.update({ where: { id: otp.id }, data: { intentos: { increment: 1 } } });
            return res.status(400).json({ error: 'Código incorrecto. Revisa el correo e inténtalo de nuevo.' });
        }
        await prisma.portalOtp.update({ where: { id: otp.id }, data: { usadoAt: new Date() } });

        // Nombre sugerido: el de su solicitud más reciente (si existe)
        const previa = (await solicitudesDe(email))[0] || null;
        res.json({
            token: generatePortalToken(email),
            email,
            nombre: previa?.solicitanteNombre || null,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── Consultas del cliente ──

// Solicitudes cuyo solicitanteEmail coincide con el correo verificado.
// La comparación insensible a mayúsculas se hace en JS: Prisma sobre SQLite
// no soporta mode 'insensitive' y el volumen (cientos de expedientes) lo
// permite sin problema.
async function solicitudesDe(email) {
    const todas = await prisma.solicitud.findMany({
        where: { solicitanteEmail: { not: null } },
        orderBy: { createdAt: 'desc' },
    });
    return todas.filter((s) => normalizarEmail(s.solicitanteEmail) === email);
}

async function tiposMap() {
    const tipos = await prisma.solicitudTipo.findMany();
    return Object.fromEntries(tipos.map((t) => [t.clave, t.label]));
}

// Vista blanqueada para el cliente: nada de responsable, notas internas,
// data del tipo ni adjuntos — solo lo que le pertenece ver.
function itemCliente(s, tipos) {
    return {
        id: s.id,
        radicado: s.radicado,
        tipo: s.tipo,
        tipoLabel: tipos[s.tipo] || s.tipo,
        estado: s.estado,
        asunto: s.asunto,
        createdAt: s.createdAt,
        finalizadaAt: s.finalizadaAt,
    };
}

// GET /api/portal/tipos — para el formulario de radicación
export const getTipos = async (req, res) => {
    try {
        const tipos = await prisma.solicitudTipo.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } });
        res.json(tipos.map((t) => ({ clave: t.clave, label: t.label })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/portal/solicitudes — mis solicitudes
export const getMisSolicitudes = async (req, res) => {
    try {
        const [mias, tipos] = await Promise.all([solicitudesDe(req.portal.email), tiposMap()]);
        res.json(mias.map((s) => itemCliente(s, tipos)));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Carga con control de pertenencia. 404 (no 403) para no revelar que el
// expediente existe.
async function loadMia(req) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return null;
    const sol = await prisma.solicitud.findUnique({
        where: { id },
        include: { actuaciones: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!sol || normalizarEmail(sol.solicitanteEmail) !== req.portal.email) return null;
    return sol;
}

function detalleCliente(sol, tipos) {
    let data = {};
    try { data = sol.data ? JSON.parse(sol.data) : {}; } catch { /* data corrupto */ }
    const actuaciones = (sol.actuaciones || [])
        .map((a) => {
            let meta = null;
            try { meta = a.meta ? JSON.parse(a.meta) : null; } catch { /* meta corrupto */ }
            return { ...a, meta };
        })
        // El cliente ve: creación, cambios de estado, respuestas, SUS
        // comentarios/fotos y las notas que el equipo marcó "para el
        // cliente" (meta.paraCliente). Notas internas, alertas, adjuntos y
        // automatizaciones del equipo no salen del sistema.
        .filter((a) => ['CREACION', 'ESTADO', 'RESPUESTA'].includes(a.tipo)
            || (['NOTA', 'ADJUNTO'].includes(a.tipo) && (a.meta?.portal || a.meta?.paraCliente)))
        .map((a) => ({
            id: a.id,
            tipo: a.tipo,
            descripcion: a.descripcion,
            createdAt: a.createdAt,
            propia: !!a.meta?.portal,
        }));
    return {
        ...itemCliente(sol, tipos),
        descripcion: sol.descripcion,
        solicitanteNombre: sol.solicitanteNombre,
        actuaciones,
        respuesta: data.respuesta
            ? { texto: data.respuesta.texto, medio: data.respuesta.medio, fechaEnvio: data.respuesta.fechaEnvio }
            : null,
        // Cierre del caso: resultado (exitosa / con novedad) + nota del
        // cierre — el banner del portal. Solo cuando el caso está cerrado.
        cierre: ['FINALIZADA', 'ARCHIVADA'].includes(sol.estado)
            ? {
                resultado: data.cierre?.resultado || 'EXITOSA',
                nota: data.cierre?.nota || null,
            }
            : null,
        // Reparaciones (#36): el paso actual del flujo interno alimenta el
        // stepper del portal — solo el sub-estado y la fecha de visita del
        // técnico; cotizaciones y montos NUNCA salen al cliente.
        reparacion: sol.tipo === 'REPARACIONES'
            ? {
                subEstado: data.reparacion?.subEstado || 'CASO_CREADO',
                fechaVisitaTecnico: data.reparacion?.tecnico?.fechaProgramada || null,
            }
            : null,
    };
}

// GET /api/portal/solicitudes/:id — detalle con línea de tiempo blanqueada
export const getMiSolicitud = async (req, res) => {
    try {
        const sol = await loadMia(req);
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json(detalleCliente(sol, await tiposMap()));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ── Radicación desde el portal ──

// Fotos adjuntas en la radicación: SOLO imágenes, máximo 5 (decisión del
// cliente, ago 2026), mismo límite de peso de los adjuntos del equipo.
const fotoSchema = z.object({
    nombre: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().max(100).startsWith('image/', 'Solo se aceptan fotos'),
    size: z.coerce.number().int().positive(),
    dataUrl: z.string().startsWith('data:image/', 'Solo se aceptan fotos'),
});

// Dirección estructurada: MISMOS campos del contrato de arrendamiento
// (contractTemplates.js) para identificar plenamente el inmueble — pedido
// del cliente (ago 2026). Dirección, ciudad y celular son OBLIGATORIOS.
const crearSchema = z.object({
    tipo: z.string().trim().min(1).max(60),
    asunto: z.string().trim().min(3, 'Cuéntanos el asunto').max(200),
    descripcion: z.string().trim().max(3000).optional().nullable(),
    nombre: z.string().trim().min(2, 'Falta tu nombre').max(160),
    telefono: z.string().trim().min(7, 'Falta tu número de celular').max(30),
    solicitanteTipo: z.enum(['PROPIETARIO', 'ARRENDATARIO', 'TERCERO']).optional().nullable(),
    direccionInmueble: z.string().trim().min(5, 'Falta la dirección del inmueble').max(160),
    torreInmueble: z.string().trim().max(80).optional().nullable(),
    aptoInmueble: z.string().trim().max(80).optional().nullable(),
    conjuntoInmueble: z.string().trim().max(120).optional().nullable(),
    barrioInmueble: z.string().trim().max(120).optional().nullable(),
    ciudadInmueble: z.string().trim().min(2, 'Falta la ciudad').max(80),
    adjuntos: z.array(fotoSchema).max(5, 'Máximo 5 fotos').optional(),
});

// Mismo orden de composición que buildOrigen (liquidacion.controller.js):
// dirección, Torre X, Apto X, conjunto, barrio, ciudad.
export function direccionCompletaInmueble(d) {
    return [
        d.direccionInmueble,
        d.torreInmueble && `Torre ${d.torreInmueble}`,
        d.aptoInmueble && `Apto ${d.aptoInmueble}`,
        d.conjuntoInmueble,
        d.barrioInmueble,
        d.ciudadInmueble,
    ].filter(Boolean).join(', ');
}

// POST /api/portal/solicitudes
export const crearSolicitud = async (req, res) => {
    try {
        const parsed = crearSchema.parse(req.body);
        const tipoDef = await prisma.solicitudTipo.findUnique({ where: { clave: parsed.tipo } });
        if (!tipoDef || !tipoDef.activo) return res.status(400).json({ error: 'Tipo de solicitud no disponible.' });
        for (const f of parsed.adjuntos || []) {
            if (f.size > LIMITE_ADJUNTO_BYTES) {
                return res.status(400).json({
                    error: `"${f.nombre}" pesa ${(f.size / 1024 / 1024).toFixed(1)} MB — el máximo por foto es ${LIMITE_ADJUNTO_BYTES / 1024 / 1024} MB.`,
                });
            }
        }

        // La dirección compuesta va al inicio de la descripción (visible para
        // el equipo sin cambios en su UI) y los componentes sueltos quedan en
        // data.inmueble — de ahí saldrá la referencia de pago / vínculos
        // futuros, igual que en las liquidaciones.
        const direccionCompleta = direccionCompletaInmueble(parsed);
        const descripcion = [
            `Inmueble: ${direccionCompleta}`,
            parsed.descripcion || null,
        ].filter(Boolean).join('\n\n');

        // Mismas automatizaciones de nacimiento que la radicación del equipo
        let fechaVencimiento = null;
        let data = {};
        if (parsed.tipo === 'DERECHOS_DE_PETICION') {
            const fechaRadicacion = hoyISO();
            fechaVencimiento = vencimientoDP(fechaRadicacion, 'GENERAL');
            data.derechoPeticion = { dpTipo: 'GENERAL', fechaRadicacion, alertasEnviadas: [] };
        }
        if (parsed.tipo === 'REPARACIONES') {
            data.reparacion = { subEstado: 'CASO_CREADO', cotizaciones: [] };
        }
        data.inmueble = {
            direccionInmueble: parsed.direccionInmueble,
            torreInmueble: parsed.torreInmueble || '',
            aptoInmueble: parsed.aptoInmueble || '',
            conjuntoInmueble: parsed.conjuntoInmueble || '',
            barrioInmueble: parsed.barrioInmueble || '',
            ciudadInmueble: parsed.ciudadInmueble,
            direccionCompleta,
        };

        const creadaPor = await portalUserId();
        let solicitud = null;
        for (let intento = 0; intento < 5 && !solicitud; intento++) {
            try {
                solicitud = await prisma.solicitud.create({
                    data: {
                        radicado: await generarRadicado(),
                        tipo: parsed.tipo,
                        medioIngreso: 'PORTAL',
                        asunto: parsed.asunto,
                        descripcion,
                        solicitanteNombre: parsed.nombre,
                        solicitanteTipo: parsed.solicitanteTipo || null,
                        solicitanteTelefono: parsed.telefono || null,
                        solicitanteEmail: req.portal.email,
                        creadaPor,
                        fechaVencimiento,
                        data: data ? JSON.stringify(data) : null,
                    },
                });
            } catch (e) {
                if (e.code !== 'P2002' || intento === 4) throw e;
            }
        }

        await actuacionPortal(
            solicitud.id, 'CREACION',
            `Solicitud radicada (${solicitud.radicado}) desde el Portal de Clientes — ${solicitud.asunto}`,
            { portal: true },
        );
        for (const f of parsed.adjuntos || []) {
            await prisma.solicitudAdjunto.create({
                data: {
                    solicitudId: solicitud.id,
                    nombre: f.nombre,
                    mimeType: f.mimeType,
                    size: f.size,
                    categoria: 'FOTO',
                    dataUrl: f.dataUrl,
                    subidoPor: creadaPor,
                },
            });
            await actuacionPortal(solicitud.id, 'ADJUNTO', `Adjuntó la foto "${f.nombre}"`, { portal: true, categoria: 'FOTO' });
        }
        const nFotos = (parsed.adjuntos || []).length;
        notifyAdmins(
            '📥 Nueva solicitud del portal',
            `${solicitud.radicado}: ${solicitud.asunto} — ${parsed.nombre} (${tipoDef.label})${nFotos ? ` · ${nFotos} foto(s)` : ''}`,
        );

        const conActuaciones = await prisma.solicitud.findUnique({
            where: { id: solicitud.id },
            include: { actuaciones: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });
        res.status(201).json(detalleCliente(conActuaciones, await tiposMap()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/portal/solicitudes/:id/comentario — mensaje del cliente al equipo
export const comentar = async (req, res) => {
    try {
        const sol = await loadMia(req);
        if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });
        if (sol.estado === 'ARCHIVADA') {
            return res.status(400).json({ error: 'Esta solicitud ya está archivada.' });
        }
        const texto = z.string().trim().min(1, 'El comentario está vacío').max(2000).parse(req.body?.texto);

        await actuacionPortal(
            sol.id, 'NOTA',
            `💬 Comentario del cliente (${sol.solicitanteNombre}): ${texto}`,
            { portal: true },
        );
        const aviso = `${sol.radicado}: ${texto.slice(0, 100)}${texto.length > 100 ? '…' : ''}`;
        if (sol.responsableId) {
            sendPersonalNotification(sol.responsableId, '💬 Comentario del cliente', aviso).catch(() => {});
        } else {
            notifyAdmins('💬 Comentario del cliente', aviso);
        }

        const updated = await prisma.solicitud.findUnique({
            where: { id: sol.id },
            include: { actuaciones: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });
        res.status(201).json(detalleCliente(updated, await tiposMap()));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
