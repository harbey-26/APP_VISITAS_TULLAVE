import { describe, it, expect } from 'vitest';
import { calcularServicioPublico, validarServicioPublico } from '../src/utils/servicioPublicoCalc.js';

describe('calcularServicioPublico (#37)', () => {
    it('prorrateo típico: entrega a mitad del período', () => {
        // Factura de agua del 1 al 30 de junio (30 días), $150.000.
        // Entrega del inmueble el 16 de junio → propietario 1-15 (15 días),
        // arrendatario 16-30 (15 días). $5.000/día → $75.000 y $75.000.
        const r = calcularServicioPublico({
            valorTotal: 150000,
            fechaInicialPeriodo: '2026-06-01',
            fechaFinalPeriodo: '2026-06-30',
            fechaEntrega: '2026-06-16',
        });
        expect(r.diasPeriodo).toBe(30);
        expect(r.valorDiario).toBe(5000);
        expect(r.diasPropietario).toBe(15);
        expect(r.diasArrendatario).toBe(15);
        expect(r.valorPropietario).toBe(75000);
        expect(r.valorArrendatario).toBe(75000);
        expect(r.completo).toBe(true);
    });
    it('el redondeo siempre cuadra con el total', () => {
        const r = calcularServicioPublico({
            valorTotal: 100000,
            fechaInicialPeriodo: '2026-06-01',
            fechaFinalPeriodo: '2026-06-30',   // 30 días → 3333,33/día
            fechaEntrega: '2026-06-11',        // 10 días propietario
        });
        expect(r.valorPropietario + r.valorArrendatario).toBe(100000);
        expect(r.valorPropietario).toBe(33333);
        expect(r.valorArrendatario).toBe(66667);
    });
    it('entrega antes del período → todo al arrendatario', () => {
        const r = calcularServicioPublico({
            valorTotal: 90000, fechaInicialPeriodo: '2026-06-01',
            fechaFinalPeriodo: '2026-06-30', fechaEntrega: '2026-05-15',
        });
        expect(r.diasPropietario).toBe(0);
        expect(r.valorArrendatario).toBe(90000);
    });
    it('entrega después del período → todo al propietario', () => {
        const r = calcularServicioPublico({
            valorTotal: 90000, fechaInicialPeriodo: '2026-06-01',
            fechaFinalPeriodo: '2026-06-30', fechaEntrega: '2026-07-05',
        });
        expect(r.diasArrendatario).toBe(0);
        expect(r.valorPropietario).toBe(90000);
    });
    it('entrega exactamente el primer día → todo al arrendatario', () => {
        const r = calcularServicioPublico({
            valorTotal: 90000, fechaInicialPeriodo: '2026-06-01',
            fechaFinalPeriodo: '2026-06-30', fechaEntrega: '2026-06-01',
        });
        expect(r.diasPropietario).toBe(0);
        expect(r.diasArrendatario).toBe(30);
    });
    it('datos incompletos → ceros sin lanzar', () => {
        const r = calcularServicioPublico({});
        expect(r.completo).toBe(false);
        expect(r.valorPropietario).toBe(0);
    });
});

describe('validarServicioPublico', () => {
    it('config completa pasa', () => {
        expect(validarServicioPublico({
            servicio: 'Acueducto', valorTotal: 150000,
            fechaInicialPeriodo: '2026-06-01', fechaFinalPeriodo: '2026-06-30',
            fechaEntrega: '2026-06-16',
        })).toEqual([]);
    });
    it('reporta faltantes', () => {
        expect(validarServicioPublico({}).length).toBe(5);
    });
});
