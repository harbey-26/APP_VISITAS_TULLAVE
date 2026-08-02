import { describe, it, expect } from 'vitest';
import { buildMimeMessage, buildMimeMessageAttachments } from '../src/utils/gmailMime.js';

// El boundary es aleatorio por mensaje (defensa ante inyección MIME): los
// tests lo leen de la cabecera en vez de asumir un valor fijo.
const boundaryDe = (mime) => mime.match(/boundary="([^"]+)"/)[1];

// Mensaje MIME del envío de contratos por correo (Gmail API).
describe('buildMimeMessage', () => {
    const base = {
        from: 'info@tullaveinmobiliaria.com.co',
        to: 'cliente@example.com',
        subject: 'Contrato de arrendamiento — TuLlave Inmobiliaria',
        text: 'Hola María,\n\nAdjuntamos su contrato.',
        pdfBase64: Buffer.from('%PDF-1.3 fake').toString('base64'),
        filename: 'contrato_arrendamiento_maria_2026-07-10.pdf',
    };

    it('incluye destinatario, multipart y el adjunto PDF', () => {
        const mime = buildMimeMessage(base);
        expect(mime).toContain('To: cliente@example.com');
        expect(mime).toContain('Content-Type: multipart/mixed;');
        expect(mime).toContain('Content-Type: application/pdf; name="contrato_arrendamiento_maria_2026-07-10.pdf"');
        expect(mime).toContain('Content-Disposition: attachment;');
        expect(mime).toContain(base.pdfBase64);
        expect(mime.endsWith(`--${boundaryDe(mime)}--\r\n`)).toBe(true);
    });

    it('codifica el subject con tildes en RFC 2047', () => {
        const mime = buildMimeMessage(base);
        expect(mime).toContain('Subject: =?UTF-8?B?');
        const encoded = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1];
        expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(base.subject);
    });

    it('el cuerpo va en base64 y decodifica al texto original', () => {
        const mime = buildMimeMessage(base);
        const parts = mime.split(`--${boundaryDe(mime)}`);
        const textPart = parts[1];
        const b64 = textPart.split('\r\n\r\n')[1].replace(/\r\n/g, '');
        expect(Buffer.from(b64, 'base64').toString('utf8')).toBe(base.text);
    });

    it('subject ASCII queda sin codificar', () => {
        const mime = buildMimeMessage({ ...base, subject: 'Contrato TuLlave' });
        expect(mime).toContain('Subject: Contrato TuLlave');
    });
});

describe('buildMimeMessageAttachments', () => {
    const base = {
        from: 'oficina@tullave.com',
        to: 'cliente@ejemplo.com',
        subject: 'Respuesta a su solicitud SOL-2026-0001',
        text: 'Adjuntamos la respuesta.',
        attachments: [
            { base64: Buffer.from('PDF').toString('base64'), filename: 'respuesta.pdf', mimeType: 'application/pdf' },
            { base64: Buffer.from('IMG').toString('base64'), filename: 'evidencia.jpg', mimeType: 'image/jpeg' },
        ],
    };

    it('incluye cada adjunto con su tipo y nombre', () => {
        const mime = buildMimeMessageAttachments(base);
        expect(mime).toContain('Content-Type: application/pdf; name="respuesta.pdf"');
        expect(mime).toContain('Content-Disposition: attachment; filename="respuesta.pdf"');
        expect(mime).toContain('Content-Type: image/jpeg; name="evidencia.jpg"');
    });

    it('sin adjuntos produce un mensaje válido de solo texto', () => {
        const mime = buildMimeMessageAttachments({ ...base, attachments: [] });
        expect(mime).toContain('Content-Type: multipart/mixed');
        expect(mime).not.toContain('Content-Disposition: attachment');
        expect(mime).toContain(`--${boundaryDe(mime)}--`);
    });

    it('el cierre del boundary va después del último adjunto', () => {
        const mime = buildMimeMessageAttachments(base);
        expect(mime.trimEnd().endsWith(`--${boundaryDe(mime)}--`)).toBe(true);
    });
});

describe('seguridad de cabeceras MIME', () => {
    const base = {
        from: 'oficina@tullave.com', to: 'cliente@ejemplo.com',
        subject: 'Respuesta', text: 'cuerpo',
    };

    it('un CRLF en el destinatario NO inyecta cabeceras (Bcc a un tercero)', () => {
        const mime = buildMimeMessageAttachments({
            ...base, to: 'cliente@ejemplo.com\r\nBcc: espia@malo.com', attachments: [],
        });
        expect(/^Bcc:/m.test(mime)).toBe(false);
        expect(mime).toContain('To: cliente@ejemplo.com Bcc: espia@malo.com');
    });

    it('un CRLF en el nombre del adjunto NO inyecta cabeceras', () => {
        const mime = buildMimeMessageAttachments({
            ...base,
            attachments: [{ base64: 'AAAA', mimeType: 'application/pdf', filename: 'a\r\nX-Inyectado: si\r\n.pdf' }],
        });
        expect(/^X-Inyectado:/m.test(mime)).toBe(false);
    });

    it('las comillas en el nombre del adjunto se escapan', () => {
        const mime = buildMimeMessageAttachments({
            ...base,
            attachments: [{ base64: 'AAAA', mimeType: 'application/pdf', filename: 'x".pdf' }],
        });
        expect(mime).toContain('filename="x_.pdf"');
    });

    it('un CRLF en el asunto NO parte la cabecera', () => {
        const mime = buildMimeMessage({
            ...base, subject: 'Hola\r\nBcc: espia@malo.com', pdfBase64: 'AAAA', filename: 'x.pdf',
        });
        expect(/^Bcc:/m.test(mime)).toBe(false);
    });

    it('cada mensaje usa un boundary distinto', () => {
        const a = buildMimeMessageAttachments({ ...base, attachments: [] });
        const b = buildMimeMessageAttachments({ ...base, attachments: [] });
        expect(boundaryDe(a)).not.toBe(boundaryDe(b));
    });
});
