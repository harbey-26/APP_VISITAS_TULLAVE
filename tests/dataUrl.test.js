import { describe, it, expect } from 'vitest';
import { bytesRealesDataUrl, esPdfReal, nombreArchivoSeguro, IMAGENES_PERMITIDAS } from '../src/utils/dataUrl.js';

describe('bytesRealesDataUrl', () => {
    it('mide el peso real del contenido, no el declarado', () => {
        const contenido = Buffer.alloc(3000, 65); // 3000 bytes
        const dataUrl = `data:image/jpeg;base64,${contenido.toString('base64')}`;
        expect(bytesRealesDataUrl(dataUrl)).toBe(3000);
    });

    it('devuelve 0 si no es un data URL', () => {
        expect(bytesRealesDataUrl('no-es-data-url')).toBe(0);
        expect(bytesRealesDataUrl(null)).toBe(0);
    });
});

describe('esPdfReal', () => {
    it('acepta un PDF de verdad (magic bytes %PDF)', () => {
        const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 contenido').toString('base64')}`;
        expect(esPdfReal(pdf)).toBe(true);
    });

    it('rechaza un JPG disfrazado de PDF', () => {
        const falso = `data:application/pdf;base64,${Buffer.from('\xff\xd8\xff\xe0 jpg').toString('base64')}`;
        expect(esPdfReal(falso)).toBe(false);
    });
});

describe('nombreArchivoSeguro', () => {
    it('quita saltos de línea (inyección de cabeceras al enviarlo por correo)', () => {
        expect(nombreArchivoSeguro('a\r\nBcc: espia@malo.com\r\n.pdf')).toBe('a Bcc: espia@malo.com .pdf');
    });

    it('quita rutas', () => {
        expect(nombreArchivoSeguro('../../etc/passwd')).toBe('.._.._etc_passwd');
    });

    it('nunca queda vacío', () => {
        expect(nombreArchivoSeguro('')).toBe('documento');
        expect(nombreArchivoSeguro('\r\n')).toBe('documento');
    });
});

describe('IMAGENES_PERMITIDAS', () => {
    it('excluye SVG (puede llevar scripts)', () => {
        expect(IMAGENES_PERMITIDAS).not.toContain('image/svg+xml');
        expect(IMAGENES_PERMITIDAS).toContain('image/jpeg');
    });
});
