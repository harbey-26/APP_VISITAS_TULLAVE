import { describe, it, expect } from 'vitest';
import { buildWhatsAppUrl, buildConfirmationMessage } from '../src/utils/phone.js';

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

    it('añade el mensaje pre-rellenado como ?text= urlencoded', () => {
        const url = buildWhatsAppUrl('3001234567', 'Hola ¿confirma?');
        expect(url).toBe('https://wa.me/573001234567?text=Hola%20%C2%BFconfirma%3F');
    });

    it('sin mensaje no agrega ?text=', () => {
        expect(buildWhatsAppUrl('3001234567', '')).toBe('https://wa.me/573001234567');
    });
});

// Mensaje de confirmación de cita que el asesor envía por WhatsApp.
describe('buildConfirmationMessage', () => {
    const visit = {
        clientName: 'Laura',
        scheduledStart: '2026-06-23T20:00:00.000Z', // 3:00 p. m. en Bogotá
        property: { address: 'Calle 123 #45-67', client: 'Conjunto Los Robles' },
    };

    it('incluye saludo con nombre, dirección y conjunto', () => {
        const msg = buildConfirmationMessage(visit, 'Carlos');
        expect(msg).toContain('Hola Laura');
        expect(msg).toContain('TuLlave Inmobiliaria');
        expect(msg).toContain('Calle 123 #45-67, Conjunto Los Robles');
        expect(msg).toContain('asesor Carlos');
        expect(msg).toContain('¿Confirma su asistencia?');
    });

    it('omite el asesor si no se pasa nombre', () => {
        const msg = buildConfirmationMessage(visit);
        expect(msg).not.toContain('asesor');
    });

    it('usa saludo genérico sin nombre de cliente', () => {
        const msg = buildConfirmationMessage({ ...visit, clientName: null }, 'Carlos');
        expect(msg).toContain('Hola 👋');
    });

    it('tolera visita nula o sin datos', () => {
        expect(buildConfirmationMessage(null)).toBe('');
        const msg = buildConfirmationMessage({});
        expect(msg).toContain('¿Confirma su asistencia?');
    });
});
