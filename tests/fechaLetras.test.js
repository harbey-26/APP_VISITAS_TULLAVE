import { describe, it, expect } from 'vitest';
import { fechaCorta, fechaEnLetras, finDePeriodo, partesFecha, sumarMeses } from '../src/utils/fechaLetras.js';

// Cálculo automático de la fecha de vencimiento (#23).
describe('sumarMeses', () => {
    it('suma meses a una fecha (aniversario)', () => {
        expect(sumarMeses('2026-07-13', 12)).toBe('2027-07-13');
        expect(sumarMeses('2026-08-01', 12)).toBe('2027-08-01');
        expect(sumarMeses('2026-01-15', 6)).toBe('2026-07-15');
    });

    it('ajusta al último día si el día no existe en el mes destino', () => {
        expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28'); // no hay 31 de feb
    });

    it('devuelve vacío con datos incompletos', () => {
        expect(sumarMeses('', 12)).toBe('');
        expect(sumarMeses('2026-07-13', 0)).toBe('');
        expect(sumarMeses('2026-07-13', '')).toBe('');
    });
});

// Fecha de terminación del contrato: el período INCLUYE el día de inicio,
// así que termina la víspera del aniversario (24-ago + 12 meses → 23-ago).
describe('finDePeriodo', () => {
    it('termina un día antes del aniversario', () => {
        expect(finDePeriodo('2026-08-24', 12)).toBe('2027-08-23');
        expect(finDePeriodo('2026-07-13', 12)).toBe('2027-07-12');
        expect(finDePeriodo('2026-01-15', 6)).toBe('2026-07-14');
    });

    it('inicio el día 1 → termina el último día del mes anterior', () => {
        expect(finDePeriodo('2026-09-01', 12)).toBe('2027-08-31');
        expect(finDePeriodo('2026-03-01', 1)).toBe('2026-03-31');
    });

    it('si el día de inicio no existe en el mes destino, termina a fin de ese mes', () => {
        expect(finDePeriodo('2026-01-31', 1)).toBe('2026-02-28'); // no hay 31 de feb
        expect(finDePeriodo('2024-01-30', 1)).toBe('2024-02-29'); // bisiesto
    });

    it('devuelve vacío con datos incompletos', () => {
        expect(finDePeriodo('', 12)).toBe('');
        expect(finDePeriodo('2026-08-24', 0)).toBe('');
        expect(finDePeriodo('2026-08-24', '')).toBe('');
    });
});

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
