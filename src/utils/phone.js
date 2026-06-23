// Construye URL wa.me a partir de un número. Normaliza: deja solo dígitos y,
// si queda en 10 dígitos empezando por 3 (móvil Colombia), antepone "57".
// Si se pasa `message`, lo añade como ?text= pre-rellenado en el chat.
// Compartido por Agenda y VisitExecution.
export function buildWhatsAppUrl(phone, message) {
    const digits = String(phone || '').replace(/\D/g, '');
    const normalized = (digits.length === 10 && digits.startsWith('3')) ? `57${digits}` : digits;
    const base = `https://wa.me/${normalized}`;
    return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// Formatea la fecha de la visita en español para el mensaje de confirmación.
function formatVisitDate(date) {
    try {
        return new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota',
            weekday: 'long', day: 'numeric', month: 'long',
            hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(new Date(date));
    } catch {
        return '';
    }
}

// Arma el mensaje de confirmación de cita que el asesor envía al cliente por
// WhatsApp. Usa los datos disponibles de la visita; omite las líneas sin dato.
// `agentName` y `agentPhone` son opcionales (nombre y celular del asesor). El
// celular se incluye porque muchas veces es el admin quien envía la confirmación
// y el cliente necesita el contacto directo del asesor que lo atenderá.
export function buildConfirmationMessage(visit, agentName, agentPhone) {
    if (!visit) return '';
    const saludo = visit.clientName ? `Hola ${visit.clientName} 👋` : 'Hola 👋';
    const fecha = visit.scheduledStart ? formatVisitDate(visit.scheduledStart) : '';
    const direccion = visit.property?.address || '';
    const conjunto = visit.property?.client || '';
    const ubicacion = [direccion, conjunto].filter(Boolean).join(', ');

    const lineas = [
        `${saludo}, le confirmo su cita con TuLlave Inmobiliaria:`,
    ];
    if (fecha) lineas.push(`📅 ${fecha}`);
    if (ubicacion) lineas.push(`📍 ${ubicacion}`);
    if (agentName) {
        const tel = agentPhone ? ` (Cel: ${agentPhone})` : '';
        lineas.push(`Lo atenderá el asesor ${agentName}${tel}.`);
    } else if (agentPhone) {
        lineas.push(`Celular del asesor: ${agentPhone}.`);
    }
    lineas.push('¿Confirma su asistencia?');

    return lineas.join('\n');
}
