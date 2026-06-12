import { describe, it, expect } from 'vitest';
import { buildWhatsAppUrl } from '../src/utils/phone.js';

// Botón de WhatsApp en Agenda y detalle de visita.
describe('buildWhatsAppUrl', () => {
    it('antepone 57 a móviles colombianos de 10 dígitos', () => {
        expect(buildWhatsAppUrl('3001234567')).toBe('https://wa.me/573001234567');
    });

    it('normaliza espacios y guiones', () => {
        expect(buildWhatsAppUrl('300 123-45 67')).toBe('https://wa.me/573001234567');
    });

    it('respeta números que ya traen indicativo', () => {
        expect(buildWhatsAppUrl('+57 300 1234567')).toBe('https://wa.me/573001234567');
    });

    it('no toca números que no parecen móvil colombiano', () => {
        expect(buildWhatsAppUrl('6011234567')).toBe('https://wa.me/6011234567');
    });

    it('tolera valores vacíos', () => {
        expect(buildWhatsAppUrl('')).toBe('https://wa.me/');
        expect(buildWhatsAppUrl(null)).toBe('https://wa.me/');
    });
});
