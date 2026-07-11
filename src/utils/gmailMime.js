// C2: construcción del mensaje MIME para el envío de contratos por Gmail.
// Módulo puro (sin prisma ni red) para poder testearse sin BD — utils/gmail.js
// lo consume para el envío real.

// Codifica un header con caracteres no-ASCII (RFC 2047).
function encodeHeader(value) {
    if (/^[ -~]*$/.test(value)) return value;
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

// Parte una cadena base64 en líneas de 76 columnas (RFC 2045).
function wrap76(b64) {
    return b64.replace(/(.{76})/g, '$1\r\n');
}

// Construye el mensaje MIME (texto plano + PDF adjunto).
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
