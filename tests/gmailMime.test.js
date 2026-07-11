import { describe, it, expect } from 'vitest';
import { buildMimeMessage } from '../src/utils/gmail.js';

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
        expect(mime.endsWith('--tullave_contrato_boundary--\r\n')).toBe(true);
    });

    it('codifica el subject con tildes en RFC 2047', () => {
        const mime = buildMimeMessage(base);
        expect(mime).toContain('Subject: =?UTF-8?B?');
        const encoded = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1];
        expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(base.subject);
    });

    it('el cuerpo va en base64 y decodifica al texto original', () => {
        const mime = buildMimeMessage(base);
        const parts = mime.split('--tullave_contrato_boundary');
        const textPart = parts[1];
        const b64 = textPart.split('\r\n\r\n')[1].replace(/\r\n/g, '');
        expect(Buffer.from(b64, 'base64').toString('utf8')).toBe(base.text);
    });

    it('subject ASCII queda sin codificar', () => {
        const mime = buildMimeMessage({ ...base, subject: 'Contrato TuLlave' });
        expect(mime).toContain('Subject: Contrato TuLlave');
    });
});
