// C2: Envío de correos con adjunto PDF vía Gmail API, reutilizando la
// integración OAuth de Google ya conectada (utils/googleCalendar.js) — sin
// dependencias nuevas. Requiere el scope gmail.send: si la cuenta se conectó
// antes de añadirlo, hay que desconectar y reconectar Google en Ajustes.

import { getValidAccessToken } from './googleCalendar.js';
import { buildMimeMessage } from './gmailMime.js';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

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
