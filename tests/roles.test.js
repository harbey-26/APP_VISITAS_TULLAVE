import { describe, it, expect } from 'vitest';
import { esStaff } from '../src/utils/roles.js';

// Staff = visibilidad global de administrador (ADMIN o ASISTENTE).
// AGENT y PORTAL nunca son staff; tampoco un rol ausente.
describe('esStaff', () => {
    it('ADMIN y ASISTENTE son staff', () => {
        expect(esStaff('ADMIN')).toBe(true);
        expect(esStaff('ASISTENTE')).toBe(true);
    });

    it('AGENT y PORTAL no son staff', () => {
        expect(esStaff('AGENT')).toBe(false);
        expect(esStaff('PORTAL')).toBe(false);
    });

    it('rol ausente o desconocido no es staff', () => {
        expect(esStaff(undefined)).toBe(false);
        expect(esStaff(null)).toBe(false);
        expect(esStaff('')).toBe(false);
        expect(esStaff('admin')).toBe(false); // sensible a mayúsculas, como la BD
    });
});
