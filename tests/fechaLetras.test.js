import { describe, it, expect } from 'vitest';
import { fechaCorta, fechaEnLetras, partesFecha } from '../src/utils/fechaLetras.js';

// Fechas en letras para los contratos.
describe('partesFecha', () => {
    it('parsea "YYYY-MM-DD" sin corrimiento de zona horaria', () => {
        expect(partesFecha('2026-08-01')).toEqual({ year: 2026, month: 8, day: 1 });
    });

    it('acepta Date', () => {
        expect(partesFecha(new Date(2026, 6, 31))).toEqual({ year: 2026, month: 7, day: 31 });
    });

    it('devuelve null para valores inválidos', () => {
        expect(partesFecha(null)).toBeNull();
        expect(partesFecha('')).toBeNull();
        expect(partesFecha('no-fecha')).toBeNull();
    });
});

describe('fechaCorta', () => {
    it('formato corto del contrato', () => {
        expect(fechaCorta('2026-07-09')).toBe('09 de julio de 2026');
    });

    it('vacío si la fecha es inválida', () => {
        expect(fechaCorta(null)).toBe('');
    });
});

describe('fechaEnLetras', () => {
    it('usa "primero" para el día 1', () => {
        expect(fechaEnLetras('2026-08-01')).toBe('primero (01) de agosto de dos mil veintiséis (2026)');
    });

    it('días cardinales para el resto', () => {
        expect(fechaEnLetras('2027-07-31')).toBe('treinta y uno (31) de julio de dos mil veintisiete (2027)');
    });

    it('vacío si la fecha es inválida', () => {
        expect(fechaEnLetras('')).toBe('');
    });
});
