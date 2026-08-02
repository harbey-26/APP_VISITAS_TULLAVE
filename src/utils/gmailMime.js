import { randomBytes } from 'crypto';

// C2: construcción del mensaje MIME para el envío de contratos por Gmail.
// Módulo puro (sin prisma ni red) para poder testearse sin BD — utils/gmail.js
// lo consume para el envío real.

// SEGURIDAD: quita saltos de línea y caracteres de control de cualquier valor
// que vaya a una cabecera MIME. Sin esto, un dato con CRLF (correo digitado en
// un contrato, nombre de un PDF subido por el cliente) inyecta cabeceras
// arbitrarias — p. ej. un `Bcc:` que manda copia oculta a un tercero.
// Se aplica a TODOS los valores de cabecera de los tres constructores.
export function sanitizeHeader(value) {
    // eslint-disable-next-line no-control-regex -- detectar caracteres de control ES el objetivo de este saneamiento
    return String(value ?? '').replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim();
}

// Nombre de archivo seguro para Content-Disposition: sin CRLF ni comillas
// (las comillas cerrarían el filename="…" y permitirían añadir parámetros).
function sanitizeFilename(value) {
    return sanitizeHeader(value).replace(/["\\]/g, '_') || 'documento';
}

// Codifica un header con caracteres no-ASCII (RFC 2047).
function encodeHeader(rawValue) {
    const value = sanitizeHeader(rawValue);
    if (/^[ -~]*$/.test(value)) return value;
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

// Parte una cadena base64 en líneas de 76 columnas (RFC 2045).
function wrap76(b64) {
    return b64.replace(/(.{76})/g, '$1\r\n');
}

// Construye un mensaje MIME de solo texto (sin adjuntos) — P1: código OTP
// del Portal de Clientes.
export function buildTextMimeMessage({ from, to, subject, text }) {
    const lines = [
        `From: ${from ? encodeHeader(from) : 'me'}`,
        `To: ${sanitizeHeader(to)}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(text, 'utf8').toString('base64')),
        '',
    ];
    return lines.join('\r\n');
}

// P1: mensaje MIME con N adjuntos de cualquier tipo (respuesta del derecho
// de petición con sus documentos). attachments = [{ base64, filename,
// mimeType }].
export function buildMimeMessageAttachments({ from, to, subject, text, attachments = [] }) {
    const boundary = `tullave_${randomBytes(12).toString('hex')}`;
    const lines = [
        `From: ${from ? encodeHeader(from) : 'me'}`,
        `To: ${sanitizeHeader(to)}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(text, 'utf8').toString('base64')),
    ];
    for (const a of attachments) {
        lines.push(
            `--${boundary}`,
            `Content-Type: ${sanitizeHeader(a.mimeType) || 'application/octet-stream'}; name="${sanitizeFilename(a.filename)}"`,
            `Content-Disposition: attachment; filename="${sanitizeFilename(a.filename)}"`,
            'Content-Transfer-Encoding: base64',
            '',
            wrap76(a.base64),
        );
    }
    lines.push(`--${boundary}--`, '');
    return lines.join('\r\n');
}

// Construye el mensaje MIME (texto plano + PDF adjunto).
export function buildMimeMessage({ from, to, subject, text, pdfBase64, filename }) {
    const boundary = `tullave_${randomBytes(12).toString('hex')}`;
    const lines = [
        `From: ${from ? encodeHeader(from) : 'me'}`,
        `To: ${sanitizeHeader(to)}`,
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
        `Content-Type: application/pdf; name="${sanitizeFilename(filename)}"`,
        `Content-Disposition: attachment; filename="${sanitizeFilename(filename)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(pdfBase64),
        `--${boundary}--`,
        '',
    ];
    return lines.join('\r\n');
}
