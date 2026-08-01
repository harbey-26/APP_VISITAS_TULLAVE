// C2: interpretación de los errores de la API de Gmail al enviar correos.
// Módulo puro (sin prisma ni red) para poder testearse sin BD — utils/gmail.js
// lo consume. Un 403 de Gmail puede significar causas muy distintas (API no
// habilitada, token sin scope, límite de envío…) y cada una tiene una solución
// diferente, así que el mensaje al usuario debe distinguirlas (issue #31).

// Extrae razón y mensaje del cuerpo de error de Google (formato clásico
// error.errors[].reason y formato nuevo error.status / error.details[].reason).
function parseGoogleError(detailText) {
    try {
        const err = JSON.parse(detailText)?.error || {};
        const reasons = [
            err.status,
            ...(err.errors || []).map((e) => e.reason),
            ...(err.details || []).map((d) => d.reason),
        ].filter(Boolean);
        return { message: err.message || '', reasons };
    } catch {
        return { message: String(detailText || '').slice(0, 200), reasons: [] };
    }
}

// Devuelve un mensaje accionable en español según la causa real del rechazo.
export function explainGmailSendError(status, detailText) {
    const { message, reasons } = parseGoogleError(detailText);
    const has = (r) => reasons.includes(r);
    const msgHas = (s) => message.toLowerCase().includes(s.toLowerCase());

    if (has('SERVICE_DISABLED') || has('accessNotConfigured') || msgHas('has not been used in project') || msgHas('it is disabled')) {
        return 'La API de Gmail no está habilitada en el proyecto de Google Cloud. Un administrador debe habilitarla en console.cloud.google.com (APIs y servicios → Biblioteca → Gmail API → Habilitar). No hace falta reconectar la cuenta.';
    }
    if (has('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || has('insufficientPermissions') || msgHas('insufficient authentication scopes')) {
        return 'La cuenta de Google conectada no autorizó el envío de correo (falta el permiso gmail.send). Un administrador debe desconectar y volver a conectar Google en Ajustes, marcando la casilla "Enviar correo electrónico en tu nombre" en la pantalla de Google.';
    }
    if (has('dailyLimitExceeded') || has('rateLimitExceeded') || has('RESOURCE_EXHAUSTED') || msgHas('limit exceeded')) {
        return 'Google rechazó el envío por límite de correos alcanzado. Intenta de nuevo más tarde.';
    }
    if (msgHas('Delegation denied')) {
        return 'Google rechazó el envío: la cuenta conectada no puede enviar como el remitente configurado. Un administrador debe reconectar Google en Ajustes con la cuenta correcta.';
    }
    if (status === 401 || has('UNAUTHENTICATED')) {
        return 'La sesión de Google expiró o fue revocada. Un administrador debe desconectar y volver a conectar Google en Ajustes.';
    }
    return `Google rechazó el envío (${status}${message ? `: ${message.slice(0, 150)}` : ''}). Revisa los logs del servidor para el detalle.`;
}
