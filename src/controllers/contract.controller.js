import prisma from '../utils/prisma.js';
import { z } from 'zod';
import crypto from 'crypto';
import { validateContractData, EDITABLE_STATUSES, REOPENABLE_STATUSES, getTemplate, EMPRESA } from '../utils/contractTemplates.js';
import { sendPersonalNotification } from '../utils/notify.js';
import { generateContractPdf, contractFileName } from '../utils/contractPdf.js';
import { sendEmailWithPdf } from '../utils/gmail.js';

// C1: Contratos diligenciados por agentes con visto bueno del admin.
// Flujo de estados: DRAFT → PENDING_APPROVAL → APPROVED | REJECTED (vuelve a
// ser editable) → SENT (fase 2). El campo data guarda el formulario como JSON
// serializado; el PDF se genera en el cliente desde esos datos.

const createContractSchema = z.object({
    type: z.enum(['ADMINISTRACION', 'ARRENDAMIENTO']),
    data: z.record(z.any()),
    visitId: z.number().optional().nullable(),
    propertyId: z.number().optional().nullable(),
});

const updateContractSchema = z.object({
    data: z.record(z.any()),
});

const reviewSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(500).optional(),
});

function parseId(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n <= 0) throw new Error('ID inválido');
    return n;
}

// Serializa el contrato para el frontend: data JSON parseado.
function serialize(contract) {
    let data = {};
    try { data = JSON.parse(contract.data); } catch { /* data corrupto → objeto vacío */ }
    return { ...contract, data };
}

const includeRefs = {
    user: { select: { id: true, name: true } },
    property: { select: { id: true, address: true, client: true } },
};

// Aviso a todos los admins (silencioso, como los errores de GPS).
async function notifyAdmins(title, body) {
    try {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
        for (const a of admins) {
            sendPersonalNotification(a.id, title, body).catch(() => {});
        }
    } catch { /* nunca interrumpe el flujo */ }
}

// GET /api/contracts?status=...  — agente: los suyos; admin: todos
export const getContracts = async (req, res) => {
    try {
        const where = {};
        if (req.user.role !== 'ADMIN') where.userId = req.user.id;
        if (req.query.status) where.status = String(req.query.status);
        const contracts = await prisma.contract.findMany({
            where,
            include: includeRefs,
            orderBy: { updatedAt: 'desc' },
        });
        res.json(contracts.map(serialize));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// GET /api/contracts/:id — dueño o admin
export const getContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const contract = await prisma.contract.findUnique({ where: { id }, include: includeRefs });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso para ver este contrato.' });
        }
        res.json(serialize(contract));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/contracts — crea un borrador
export const createContract = async (req, res) => {
    try {
        const parsed = createContractSchema.parse(req.body);
        if (!getTemplate(parsed.type)) return res.status(400).json({ error: 'Tipo de contrato desconocido' });

        const contract = await prisma.contract.create({
            data: {
                type: parsed.type,
                status: 'DRAFT',
                data: JSON.stringify(parsed.data),
                userId: req.user.id,
                visitId: parsed.visitId || null,
                propertyId: parsed.propertyId || null,
            },
            include: includeRefs,
        });
        res.status(201).json(serialize(contract));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/contracts/:id — edita el formulario (solo borrador/devuelto)
export const updateContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = updateContractSchema.parse(req.body);

        const contract = await prisma.contract.findUnique({ where: { id } });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso para editar este contrato.' });
        }
        if (!EDITABLE_STATUSES.includes(contract.status)) {
            return res.status(400).json({ error: 'Solo se pueden editar contratos en borrador o devueltos.' });
        }

        const updated = await prisma.contract.update({
            where: { id },
            data: { data: JSON.stringify(parsed.data) },
            include: includeRefs,
        });
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/contracts/:id/submit — enviar a revisión del admin.
// Aquí sí se exige el formulario completo (validateContractData).
export const submitContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const contract = await prisma.contract.findUnique({ where: { id }, include: includeRefs });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso sobre este contrato.' });
        }
        if (!EDITABLE_STATUSES.includes(contract.status)) {
            return res.status(400).json({ error: 'Este contrato ya fue enviado a revisión.' });
        }

        const data = serialize(contract).data;
        const errors = validateContractData(contract.type, data);
        if (errors.length > 0) {
            return res.status(400).json({ error: `Formulario incompleto: ${errors[0]}`, details: errors });
        }

        const updated = await prisma.contract.update({
            where: { id },
            data: { status: 'PENDING_APPROVAL', reviewNote: null, reviewedBy: null, reviewedAt: null },
            include: includeRefs,
        });
        notifyAdmins(
            '📄 Contrato por aprobar',
            `${contract.user?.name || 'Un agente'} envió un contrato de ${contract.type === 'ADMINISTRACION' ? 'administración' : 'arrendamiento'} para revisión.`
        );
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/contracts/:id/review — visto bueno del admin (aprueba/devuelve)
export const reviewContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const parsed = reviewSchema.parse(req.body);

        const contract = await prisma.contract.findUnique({ where: { id } });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Solo se pueden revisar contratos pendientes de aprobación.' });
        }
        if (parsed.decision === 'REJECTED' && !parsed.note) {
            return res.status(400).json({ error: 'Indica el motivo de la devolución.' });
        }

        const updated = await prisma.contract.update({
            where: { id },
            data: {
                status: parsed.decision,
                reviewNote: parsed.note || null,
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
            },
            include: includeRefs,
        });
        const msg = parsed.decision === 'APPROVED'
            ? '✅ Tu contrato fue aprobado. Ya puedes descargarlo y enviarlo al cliente.'
            : `↩️ Tu contrato fue devuelto: ${parsed.note}`;
        sendPersonalNotification(contract.userId, '📄 Revisión de contrato', msg).catch(() => {});
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /api/contracts/:id/reopen — reabrir un contrato APROBADO para corregir
// un error. Vuelve a REOPENED (editable) y limpia la aprobación previa, de modo
// que debe pasar de nuevo por el visto bueno del admin. Los contratos ya
// ENVIADOS al cliente no se reabren por ahora (conservan el link vigente).
export const reopenContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const contract = await prisma.contract.findUnique({ where: { id } });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
        if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'No tienes permiso sobre este contrato.' });
        }
        if (contract.status === 'SENT') {
            return res.status(400).json({ error: 'Este contrato ya fue enviado al cliente y no puede reabrirse.' });
        }
        if (!REOPENABLE_STATUSES.includes(contract.status)) {
            return res.status(400).json({ error: 'Solo se pueden reabrir contratos aprobados.' });
        }

        const updated = await prisma.contract.update({
            where: { id },
            data: { status: 'REOPENED', reviewNote: null, reviewedBy: null, reviewedAt: null },
            include: includeRefs,
        });
        // Si un admin reabre el contrato de un agente, avísale para que corrija
        if (contract.userId !== req.user.id) {
            sendPersonalNotification(
                contract.userId,
                '📄 Contrato reabierto',
                'Un administrador reabrió tu contrato para corregir. Edítalo y envíalo de nuevo a revisión.',
            ).catch(() => {});
        }
        res.json(serialize(updated));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// ── C2: envío al cliente (WhatsApp con link público / correo con adjunto) ──

// Solo los contratos con visto bueno del admin se pueden compartir.
const SENDABLE_STATUSES = ['APPROVED', 'SENT'];

const clientNameOf = (data) => data?.propietarioNombre || data?.arrendatarioNombre || '';
const clientEmailOf = (data) => data?.propietarioEmail || data?.arrendatarioEmail || '';

// URL base pública (Railway va detrás de proxy → x-forwarded-proto).
function publicBaseUrl(req) {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    return `${proto}://${req.get('host')}`;
}

const publicPdfPath = (token) => `/api/contracts/public/${token}/pdf`;

// Carga el contrato y valida permisos/estado para compartir. Devuelve
// { contract } o { error, status } listo para responder.
async function loadSendable(req) {
    const id = parseId(req.params.id);
    const contract = await prisma.contract.findUnique({ where: { id }, include: includeRefs });
    if (!contract) return { error: 'Contrato no encontrado', status: 404 };
    if (contract.userId !== req.user.id && req.user.role !== 'ADMIN') {
        return { error: 'No tienes permiso sobre este contrato.', status: 403 };
    }
    if (!SENDABLE_STATUSES.includes(contract.status)) {
        return { error: 'El contrato debe estar aprobado por un administrador antes de enviarse al cliente.', status: 400 };
    }
    return { contract };
}

// Genera el shareToken si no existe y marca el contrato como SENT.
async function markSent(contract) {
    const shareToken = contract.shareToken || crypto.randomBytes(24).toString('hex');
    return prisma.contract.update({
        where: { id: contract.id },
        data: { shareToken, status: 'SENT', sentAt: new Date() },
        include: includeRefs,
    });
}

// POST /api/contracts/:id/share — devuelve el link público (para WhatsApp)
export const shareContract = async (req, res) => {
    try {
        const { contract, error, status } = await loadSendable(req);
        if (error) return res.status(status).json({ error });
        const updated = await markSent(contract);
        res.json({
            ...serialize(updated),
            publicUrl: `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// POST /api/contracts/:id/email — envía el PDF adjunto al correo del cliente
export const emailContract = async (req, res) => {
    try {
        const { contract, error, status } = await loadSendable(req);
        if (error) return res.status(status).json({ error });

        const parsed = serialize(contract);
        const to = clientEmailOf(parsed.data);
        if (!to) {
            return res.status(400).json({ error: 'El contrato no tiene correo del cliente. Edítalo y agrega el correo antes de enviarlo.' });
        }

        const updated = await markSent(contract);
        const parsedSent = serialize(updated);
        const pdf = await generateContractPdf(parsedSent);
        const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

        const label = getTemplate(contract.type)?.label || 'contrato';
        const nombre = clientNameOf(parsed.data);
        const publicUrl = `${publicBaseUrl(req)}${publicPdfPath(updated.shareToken)}`;
        await sendEmailWithPdf({
            to,
            subject: `${label.charAt(0).toUpperCase()}${label.slice(1)} — TuLlave Inmobiliaria`,
            text: [
                nombre ? `Hola ${nombre},` : 'Hola,',
                '',
                `TuLlave Inmobiliaria le comparte su ${label} en el archivo adjunto.`,
                `También puede descargarlo en: ${publicUrl}`,
                '',
                'Cualquier inquietud, con gusto la atendemos.',
                '',
                EMPRESA.razonSocial,
                `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
            ].join('\n'),
            pdfBuffer,
            filename: contractFileName(parsedSent),
        });

        res.json({ ...parsedSent, emailedTo: to });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// GET /api/contracts/public/:token/pdf — SIN auth: el cliente final abre el
// PDF desde el link de WhatsApp/correo. Solo contratos ya enviados.
export const publicContractPdf = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (token.length < 32) return res.status(404).send('No encontrado');
        const contract = await prisma.contract.findUnique({ where: { shareToken: token } });
        if (!contract || contract.status !== 'SENT') return res.status(404).send('No encontrado');

        const parsed = serialize(contract);
        const pdf = await generateContractPdf(parsed);
        const buffer = Buffer.from(pdf.output('arraybuffer'));
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${contractFileName(parsed)}"`);
        res.send(buffer);
    } catch {
        res.status(500).send('Error generando el PDF');
    }
};

// DELETE /api/contracts/:id — dueño (solo editables) o admin (cualquiera)
export const deleteContract = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const contract = await prisma.contract.findUnique({ where: { id } });
        if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });

        const isAdmin = req.user.role === 'ADMIN';
        if (contract.userId !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar este contrato.' });
        }
        if (!isAdmin && !EDITABLE_STATUSES.includes(contract.status)) {
            return res.status(400).json({ error: 'Solo un administrador puede eliminar un contrato ya enviado a revisión.' });
        }

        await prisma.contract.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
