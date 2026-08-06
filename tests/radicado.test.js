import { describe, it, expect } from 'vitest';
import { siguienteRadicado } from '../src/utils/radicado.js';

describe('siguienteRadicado', () => {
    it('arranca en 0001 cuando el año no tiene radicados', () => {
        expect(siguienteRadicado(2026, [])).toBe('SOL-2026-0001');
    });

    it('sigue el consecutivo normal', () => {
        expect(siguienteRadicado(2026, ['SOL-2026-0001', 'SOL-2026-0002'])).toBe('SOL-2026-0003');
    });

    it('NO reutiliza números tras eliminar un expediente (el bug del conteo)', () => {
        // Con count+1: 3 filas → "0004", pero 0004 ya existe → P2002 eterno
        const existentes = ['SOL-2026-0001', 'SOL-2026-0002', 'SOL-2026-0004'];
        expect(siguienteRadicado(2026, existentes)).toBe('SOL-2026-0005');
    });

    it('no depende del orden de la lista', () => {
        const existentes = ['SOL-2026-0003', 'SOL-2026-0001', 'SOL-2026-0002'];
        expect(siguienteRadicado(2026, existentes)).toBe('SOL-2026-0004');
    });

    it('sobrevive a más de 9999 radicados en el año (sin padding no hay orden lexicográfico)', () => {
        expect(siguienteRadicado(2026, ['SOL-2026-9999', 'SOL-2026-10000'])).toBe('SOL-2026-10001');
    });

    it('ignora radicados malformados sin romper', () => {
        expect(siguienteRadicado(2026, ['SOL-2026-0002', 'SOL-2026-XXXX', null])).toBe('SOL-2026-0003');
    });
});
