import { describe, it, expect } from 'vitest';
import { PORTAL_URL, mensajePortal } from '../src/utils/portalShare.js';

describe('mensajePortal', () => {
    it('siempre incluye el link del portal', () => {
        expect(mensajePortal()).toContain(PORTAL_URL);
        expect(mensajePortal({ nombre: 'Ana', radicado: 'SOL-2026-0001', email: 'ana@mail.com' }))
            .toContain(PORTAL_URL);
    });

    it('con radicado y correo apunta al expediente del cliente', () => {
        const msg = mensajePortal({ nombre: 'Ana Pérez', radicado: 'SOL-2026-0007', email: 'ana@mail.com' });
        expect(msg).toContain('Hola Ana Pérez');
        expect(msg).toContain('SOL-2026-0007');
        expect(msg).toContain('su correo ana@mail.com');
    });

    it('sin correo NO promete ver el expediente (invitación general)', () => {
        const msg = mensajePortal({ nombre: 'Ana', radicado: 'SOL-2026-0007' });
        expect(msg).not.toContain('SOL-2026-0007');
        expect(msg).toContain('radicar solicitudes');
    });

    it('sin nombre saluda de forma genérica', () => {
        expect(mensajePortal()).toContain('Hola 👋');
    });
});
