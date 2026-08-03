// ──────────────────────────────────────────────────────────────────────
// Portal de Clientes — link compartible desde el Centro de Solicitudes
// (pedido del cliente, ago 2026). El dominio es fijo (servicio Railway
// propio, DNS en Squarespace); el backend lo resuelve por PORTAL_ORIGIN,
// pero el frontend necesita la constante en build-time.
// ──────────────────────────────────────────────────────────────────────
export const PORTAL_URL = 'https://portal.tullaveinmobiliariasas.com';

// Mensaje de WhatsApp para invitar al cliente al portal. Con radicado + email
// el mensaje apunta a SU expediente (el portal identifica por correo); sin
// correo registrado la invitación es general — prometerle que verá su
// solicitud sería falso.
export function mensajePortal({ nombre, radicado, email } = {}) {
    const saludo = nombre ? `Hola ${nombre} 👋` : 'Hola 👋';
    const lineas = [
        `${saludo}, TuLlave Inmobiliaria pone a su disposición el Portal de Clientes:`,
        '',
        PORTAL_URL,
        '',
    ];
    if (radicado && email) {
        lineas.push(
            `Allí puede consultar el avance de su solicitud ${radicado}, recibir nuestras respuestas y escribirnos.`,
            `Ingrese con su correo ${email}: le llegará un código de acceso de un solo uso, sin contraseñas.`,
        );
    } else {
        lineas.push(
            'Allí puede radicar solicitudes y consultar el avance de las que tenga en curso.',
            'Ingrese con su correo electrónico: le llegará un código de acceso de un solo uso, sin contraseñas.',
        );
    }
    return lineas.join('\n');
}
