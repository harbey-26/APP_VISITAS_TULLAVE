// C2: Envío de correos con adjunto PDF vía Gmail API, reutilizando la
// integración OAuth de Google ya conectada (utils/googleCalendar.js) — sin
// dependencias nuevas. Requiere el scope gmail.send: si la cuenta se conectó
// antes de añadirlo, hay que desconectar y reconectar Google en Ajustes.

import { getValidAccessToken } from './googleCalendar.js';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Codifica un header con caracteres no-ASCII (RFC 2047).
function encodeHeader(value) {
    if (/^[ -~]*$/.test(value)) return value;
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

// Parte una cadena base64 en líneas de 76 columnas (RFC 2045).
function wrap76(b64) {
    return b64.replace(/(.{76})/g, '$1\r\n');
}

// Construye el mensaje MIME (texto plano + PDF adjunto). Pura y testeable.
export function buildMimeMessage({ from, to, subject, text, pdfBase64, filename }) {
    const boundary = 'tullave_contrato_boundary';
    const lines = [
        `From: ${from ? encodeHeader(from) : 'me'}`,
        `To: ${to}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(text, 'utf8').toString('base64')),
        `--${boundary}`,
        `Content-Type: application/pdf; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(pdfBase64),
        `--${boundary}--`,
        '',
    ];
    return lines.join('\r\n');
}

// Envía el correo. Lanza Error con mensaje amigable si la integración no
// está lista (no conectada o sin el scope gmail.send).
export async function sendEmailWithPdf({ to, subject, text, pdfBuffer, filename }) {
    const session = await getValidAccessToken();
    if (!session) {
        throw new Error('Google no está conectado. Un administrador debe conectar la cuenta en Ajustes.');
    }
    if (!session.scope.includes('gmail.send')) {
        throw new Error('La cuenta de Google conectada no tiene permiso de envío de correo. Desconecta y vuelve a conectar Google en Ajustes para autorizarlo.');
    }

    const mime = buildMimeMessage({
        from: session.accountEmail,
        to,
        subject,
        text,
        pdfBase64: Buffer.from(pdfBuffer).toString('base64'),
        filename,
    });
    const raw = Buffer.from(mime, 'utf8').toString('base64url');

    const r = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
    });
    if (!r.ok) {
        const detail = await r.text();
        if (r.status === 403) {
            throw new Error('Google rechazó el envío (permisos). Desconecta y vuelve a conectar Google en Ajustes.');
        }
        throw new Error(`Gmail: ${r.status} ${detail.slice(0, 200)}`);
    }
    return r.json();
}
