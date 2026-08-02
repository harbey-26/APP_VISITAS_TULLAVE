import prisma from './prisma.js';
import { sendTextEmail } from './gmail.js';
import { EMPRESA } from './contractTemplates.js';
import { SOLICITUD_ESTADOS } from './solicitudFlow.js';

// P1: Aviso de bienvenida al Portal de Clientes. Cuando el EQUIPO radica una
// solicitud con el correo del cliente (o se lo agrega/corrige después), se le
// avisa por correo que puede seguirla en el portal. Las radicadas desde el
// portal NO lo envían: el cliente ya está adentro.

// URL pública del portal: el primer origen de PORTAL_ORIGIN (el dominio
// propio). Sin la variable no hay portal desplegado → no se envía nada.
export function portalUrlPublica(env = process.env) {
    const primera = (env.PORTAL_ORIGIN || '').split(',')[0].trim();
    return primera || null;
}

// Contenido del correo — puro (testeable sin red ni BD).
export function bienvenidaPortalEmail({ nombre, radicado, asunto, email, portalUrl }) {
    return {
        subject: `Su solicitud ${radicado} quedó radicada — ${EMPRESA.razonSocial}`,
        text: [
            `Hola ${nombre},`,
            '',
            `${EMPRESA.razonSocial} le informa que su solicitud "${asunto}" quedó radicada con el número ${radicado}.`,
            '',
            'Puede consultar su avance, recibir nuestras respuestas y escribirnos en el Portal de Clientes:',
            '',
            `    ${portalUrl}`,
            '',
            `Ingrese con este mismo correo (${email}): le llegará un código de acceso de un solo uso, sin contraseñas.`,
            '',
            'Cualquier inquietud, con gusto la atendemos.',
            '',
            EMPRESA.razonSocial,
            `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
        ].join('\n'),
    };
}

// P1: aviso al cliente en cada cambio de estado — "en todo momento sabe en
// qué va" sin tener que entrar al portal. Contenido puro (testeable).
export function avisoEstadoEmail({ nombre, radicado, asunto, estado, nota, resultado, portalUrl, email }) {
    const label = SOLICITUD_ESTADOS[estado]?.label || estado;
    const esCierre = estado === 'FINALIZADA';
    const titulo = esCierre
        ? (resultado === 'CON_NOVEDAD'
            ? `Su solicitud ${radicado} fue cerrada con una novedad`
            : `Su solicitud ${radicado} fue resuelta`)
        : `Su solicitud ${radicado} está ahora: ${label}`;
    return {
        subject: `${titulo} — ${EMPRESA.razonSocial}`,
        text: [
            `Hola ${nombre},`,
            '',
            esCierre
                ? (resultado === 'CON_NOVEDAD'
                    ? `Su solicitud "${asunto}" fue cerrada con una novedad.`
                    : `¡Buenas noticias! Su solicitud "${asunto}" fue gestionada exitosamente.`)
                : `Su solicitud "${asunto}" cambió de estado y ahora está: ${label}.`,
            ...(nota ? ['', `Nota del equipo: ${nota}`] : []),
            '',
            'Puede ver el detalle y el avance completo en el Portal de Clientes:',
            '',
            `    ${portalUrl}`,
            '',
            `Ingrese con este mismo correo (${email}): le llegará un código de acceso.`,
            '',
            EMPRESA.razonSocial,
            `Tel: ${EMPRESA.celular} - ${EMPRESA.telefono} · ${EMPRESA.email}`,
        ].join('\n'),
    };
}

// Envío fire-and-forget del aviso de estado. No escribe actuación: el cambio
// de estado ya quedó en la línea de tiempo.
export async function enviarAvisoEstado(solicitud, { estado, nota, resultado }) {
    const portalUrl = portalUrlPublica();
    const email = (solicitud.solicitanteEmail || '').trim();
    if (!portalUrl || !email) return;
    try {
        const { subject, text } = avisoEstadoEmail({
            nombre: solicitud.solicitanteNombre,
            radicado: solicitud.radicado,
            asunto: solicitud.asunto,
            estado, nota, resultado, portalUrl, email,
        });
        await sendTextEmail({ to: email, subject, text });
    } catch (e) {
        console.warn(`[Portal] No se pudo avisar el estado de ${solicitud.radicado} a ${email}:`, e.message);
    }
}

// Envío fire-and-forget: nunca interrumpe la radicación (si Gmail falla,
// queda un warning en el log y ya). Deja constancia en la línea de tiempo.
export async function enviarBienvenidaPortal(solicitud) {
    const portalUrl = portalUrlPublica();
    const email = (solicitud.solicitanteEmail || '').trim();
    if (!portalUrl || !email) return;
    try {
        const { subject, text } = bienvenidaPortalEmail({
            nombre: solicitud.solicitanteNombre,
            radicado: solicitud.radicado,
            asunto: solicitud.asunto,
            email,
            portalUrl,
        });
        await sendTextEmail({ to: email, subject, text });
        await prisma.solicitudActuacion.create({
            data: {
                solicitudId: solicitud.id,
                tipo: 'AUTOMATIZACION',
                descripcion: `📧 Se envió a ${email} el aviso para seguir la solicitud en el Portal de Clientes.`,
                userId: null,
            },
        }).catch(() => {});
    } catch (e) {
        console.warn(`[Portal] No se pudo enviar la bienvenida de ${solicitud.radicado} a ${email}:`, e.message);
    }
}
