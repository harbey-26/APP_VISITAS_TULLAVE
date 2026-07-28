import { describe, it, expect } from 'vitest';
import {
    calcularLiquidacion, validateLiquidacionConfig, diasDelMes, diasEntre,
} from '../src/utils/liquidacionCalc.js';

// Base: caso "Fontibon" del Excel real — canon 1.300.000, julio (31 días),
// 28 días cobrados, derechos 15% + IVA, estudio 80.000 + IVA, abono 200.000.
const fontibon = {
    origen: { canonMensual: 1300000, administracionMensual: 0 },
    config: {
        fechaInicialCobro: '2026-07-05',
        fechaFinalCobro: '2026-07-31',
        diasCobrados: 28,
        admonModo: 'PROPORCIONAL',
        pctDerechos: 15,
        aplicaIvaDerechos: true,
        estudioValor: 80000,
        aplicaIvaEstudio: true,
        abonosPrevios: [{ fecha: '2026-07-01', valor: 200000, nota: 'Reserva' }],
        otros: [],
    },
};

describe('diasDelMes', () => {
    it('mes de 31, 30 y 28 días', () => {
        expect(diasDelMes('2026-07-05')).toBe(31);
        expect(diasDelMes('2026-06-10')).toBe(30);
        expect(diasDelMes('2026-02-01')).toBe(28);
    });
    it('febrero bisiesto', () => {
        expect(diasDelMes('2028-02-15')).toBe(29);
    });
    it('fecha inválida → 0', () => {
        expect(diasDelMes('')).toBe(0);
        expect(diasDelMes('no-fecha')).toBe(0);
    });
});

describe('diasEntre', () => {
    it('cuenta ambos extremos (del 5 al 31 de julio = 27 días)', () => {
        expect(diasEntre('2026-07-05', '2026-07-31')).toBe(27);
    });
    it('mismo día = 1', () => {
        expect(diasEntre('2026-07-05', '2026-07-05')).toBe(1);
    });
    it('cruza fin de mes', () => {
        expect(diasEntre('2026-07-25', '2026-08-05')).toBe(12);
    });
    it('rango invertido → 0', () => {
        expect(diasEntre('2026-07-31', '2026-07-05')).toBe(0);
    });
});

describe('calcularLiquidacion — paridad con el Excel', () => {
    it('caso Fontibon: canon 1.300.000, 28/31 días, 15% + IVA, estudio 80.000', () => {
        const r = calcularLiquidacion(fontibon);
        // Excel: canon día 41.935, canon proporcional 1.174.194 (redondeos por línea)
        expect(r.canonDia).toBe(41935);
        expect(r.subtotalProporcional).toBe(1174194);
        // Derechos 195.000 + IVA 37.050; estudio 80.000 + IVA 15.200
        const derechos = r.lineas.find((l) => l.concepto.startsWith('Derechos'));
        expect(derechos.base).toBe(195000);
        expect(derechos.iva).toBe(37050);
        const estudio = r.lineas.find((l) => l.concepto === 'Estudio aseguradora');
        expect(estudio.base).toBe(80000);
        expect(estudio.iva).toBe(15200);
        // Total 1.501.444 − abono 200.000 = 1.301.444
        expect(r.totalGeneral).toBe(1501444);
        expect(r.totalAbonos).toBe(200000);
        expect(r.saldo).toBe(1301444);
        expect(r.pagada).toBe(false);
    });

    it('caso Hayuelos: con administración, 20%, sin días proporcionales', () => {
        // Excel "Hayuelos 908": canon 1.722.073, derechos 20% = 344.415 (+IVA 65.439)
        const r = calcularLiquidacion({
            origen: { canonMensual: 1722073, administracionMensual: 0 },
            config: {
                fechaInicialCobro: '2026-08-01', fechaFinalCobro: '2026-08-01',
                diasCobrados: 0, pctDerechos: 20, aplicaIvaDerechos: true,
                estudioValor: 80000, aplicaIvaEstudio: true,
            },
        });
        const derechos = r.lineas.find((l) => l.concepto.startsWith('Derechos'));
        expect(derechos.base).toBe(344415);
        expect(derechos.iva).toBe(65439);
        expect(r.subtotalProporcional).toBe(0);
        expect(r.totalGeneral).toBe(505054); // Excel muestra 505.053 por redondeo global; por línea da 505.054
    });
});

describe('calcularLiquidacion — administración', () => {
    const conAdmon = {
        origen: { canonMensual: 1000000, administracionMensual: 300000 },
        config: {
            fechaInicialCobro: '2026-06-16', fechaFinalCobro: '2026-06-30',
            diasCobrados: 15, admonModo: 'PROPORCIONAL',
        },
    };

    it('proporcional usa divisor 30 fijo (como el Excel)', () => {
        const r = calcularLiquidacion(conAdmon);
        // canon: 1.000.000/30 × 15 = 500.000 ; admón: 300.000/30 × 15 = 150.000
        expect(r.subtotalProporcional).toBe(650000);
    });

    it('modo COMPLETA cobra el mes entero de admón', () => {
        const r = calcularLiquidacion({ ...conAdmon, config: { ...conAdmon.config, admonModo: 'COMPLETA' } });
        expect(r.subtotalProporcional).toBe(800000);
    });

    it('modo NO_COBRAR omite la línea', () => {
        const r = calcularLiquidacion({ ...conAdmon, config: { ...conAdmon.config, admonModo: 'NO_COBRAR' } });
        expect(r.subtotalProporcional).toBe(500000);
        expect(r.lineas.some((l) => l.concepto === 'Cuota de administración')).toBe(false);
    });

    it('la admón entra en la base de los derechos', () => {
        const r = calcularLiquidacion({
            ...conAdmon,
            config: { ...conAdmon.config, pctDerechos: 15 },
        });
        const derechos = r.lineas.find((l) => l.concepto.startsWith('Derechos'));
        expect(derechos.base).toBe(195000); // 15% de 1.300.000
    });
});

describe('calcularLiquidacion — otros cargos, descuentos y pagos', () => {
    it('descuento resta y no lleva IVA', () => {
        const r = calcularLiquidacion({
            origen: { canonMensual: 1000000 },
            config: {
                fechaInicialCobro: '2026-07-01', diasCobrados: 31,
                otros: [
                    { concepto: 'Aseo', valor: 50000, tipo: 'CARGO', aplicaIva: true },
                    { concepto: 'Promoción', valor: 100000, tipo: 'DESCUENTO', aplicaIva: true },
                ],
            },
        });
        const cargo = r.lineas.find((l) => l.concepto === 'Aseo');
        expect(cargo.total).toBe(59500);
        const desc = r.lineas.find((l) => l.concepto === 'Promoción');
        expect(desc.total).toBe(-100000);
        expect(r.totalGeneral).toBe(1000000 + 59500 - 100000);
    });

    it('los pagos registrados suman como abonos y pueden saldarla', () => {
        const r = calcularLiquidacion(fontibon, [
            { fecha: '2026-07-10', valor: 1000000 },
            { fecha: '2026-07-20', valor: 301444 },
        ]);
        expect(r.totalAbonos).toBe(1501444);
        expect(r.saldo).toBe(0);
        expect(r.pagada).toBe(true);
    });

    it('abonos mayores al total → saldo 0 pero saldoRaw negativo', () => {
        const r = calcularLiquidacion(fontibon, [{ valor: 2000000 }]);
        expect(r.saldo).toBe(0);
        expect(r.saldoRaw).toBeLessThan(0);
        expect(r.pagada).toBe(true);
    });

    it('config vacía no lanza y devuelve ceros', () => {
        const r = calcularLiquidacion({});
        expect(r.totalGeneral).toBe(0);
        expect(r.saldo).toBe(0);
        expect(r.pagada).toBe(false);
        expect(r.lineas).toEqual([]);
    });

    it('canon/admón como texto formateado se coercionan', () => {
        const r = calcularLiquidacion({
            origen: { canonMensual: '1.300.000', administracionMensual: '' },
            config: { fechaInicialCobro: '2026-07-05', diasCobrados: 28 },
        });
        expect(r.subtotalProporcional).toBe(1174194);
    });
});

describe('validateLiquidacionConfig', () => {
    it('config completa pasa', () => {
        expect(validateLiquidacionConfig(fontibon.config)).toEqual([]);
    });
    it('exige fechas y días', () => {
        const errors = validateLiquidacionConfig({});
        expect(errors.join(' ')).toMatch(/fecha inicial/i);
        expect(errors.join(' ')).toMatch(/fecha final/i);
        expect(errors.join(' ')).toMatch(/días cobrados/i);
    });
    it('rechaza rango de fechas invertido', () => {
        const errors = validateLiquidacionConfig({
            fechaInicialCobro: '2026-07-31', fechaFinalCobro: '2026-07-05', diasCobrados: 5,
        });
        expect(errors.join(' ')).toMatch(/posterior/i);
    });
    it('rechaza cargos sin concepto o sin valor', () => {
        const errors = validateLiquidacionConfig({
            fechaInicialCobro: '2026-07-01', fechaFinalCobro: '2026-07-31', diasCobrados: 31,
            otros: [{ concepto: '', valor: 0 }],
        });
        expect(errors.length).toBe(2);
    });
});
