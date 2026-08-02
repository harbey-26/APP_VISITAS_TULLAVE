import { describe, it, expect } from 'vitest';
import { portalUrlPublica, bienvenidaPortalEmail, avisoEstadoEmail } from '../src/utils/portalWelcome.js';

describe('portalUrlPublica', () => {
    it('toma el primer origen de PORTAL_ORIGIN (el dominio propio)', () => {
        const env = { PORTAL_ORIGIN: 'https://portal.tullaveinmobiliariasas.com,https://x.up.railway.app' };
        expect(portalUrlPublica(env)).toBe('https://portal.tullaveinmobiliariasas.com');
    });

    it('tolera espacios alrededor de las comas', () => {
        const env = { PORTAL_ORIGIN: '  https://portal.ejemplo.com , https://otro.com' };
        expect(portalUrlPublica(env)).toBe('https://portal.ejemplo.com');
    });

    it('devuelve null sin la variable (portal no desplegado → no se envía)', () => {
        expect(portalUrlPublica({})).toBeNull();
        expect(portalUrlPublica({ PORTAL_ORIGIN: '' })).toBeNull();
    });
});

describe('bienvenidaPortalEmail', () => {
    const datos = {
        nombre: 'María Pérez',
        radicado: 'SOL-2026-0042',
        asunto: 'Fuga de agua en la cocina',
        email: 'maria@ejemplo.com',
        portalUrl: 'https://portal.tullaveinmobiliariasas.com',
    };

    it('el asunto lleva el radicado', () => {
        expect(bienvenidaPortalEmail(datos).subject).toContain('SOL-2026-0042');
    });

    it('el cuerpo lleva nombre, asunto, link del portal y el correo de acceso', () => {
        const { text } = bienvenidaPortalEmail(datos);
        expect(text).toContain('María Pérez');
        expect(text).toContain('Fuga de agua en la cocina');
        expect(text).toContain('https://portal.tullaveinmobiliariasas.com');
        expect(text).toContain('maria@ejemplo.com');
        expect(text).toContain('código de acceso');
    });
});

describe('avisoEstadoEmail', () => {
    const base = {
        nombre: 'María Pérez',
        radicado: 'SOL-2026-0042',
        asunto: 'Fuga de agua en la cocina',
        portalUrl: 'https://portal.tullaveinmobiliariasas.com',
        email: 'maria@ejemplo.com',
    };

    it('cambio de estado normal: lleva el nuevo estado y la nota del equipo', () => {
        const { subject, text } = avisoEstadoEmail({ ...base, estado: 'EN_GESTION', nota: 'Coordinando la visita del técnico' });
        expect(subject).toContain('SOL-2026-0042');
        expect(subject).toContain('En gestión');
        expect(text).toContain('En gestión');
        expect(text).toContain('Coordinando la visita del técnico');
        expect(text).toContain(base.portalUrl);
    });

    it('cierre exitoso: mensaje de resuelta', () => {
        const { subject, text } = avisoEstadoEmail({ ...base, estado: 'FINALIZADA', resultado: 'EXITOSA' });
        expect(subject).toContain('fue resuelta');
        expect(text).toContain('gestionada exitosamente');
    });

    it('cierre con novedad: lo dice claramente', () => {
        const { subject, text } = avisoEstadoEmail({ ...base, estado: 'FINALIZADA', resultado: 'CON_NOVEDAD', nota: 'Queda pendiente una segunda visita' });
        expect(subject).toContain('cerrada con una novedad');
        expect(text).toContain('cerrada con una novedad');
        expect(text).toContain('segunda visita');
    });
});
