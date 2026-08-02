import { describe, it, expect } from 'vitest';
import {
    pctAplicable, calcularNuevoCanon, desgloseIncremento,
    aniversarioEnAnio, proximoAniversario, aniversariosEnRadar, diasHasta,
    semaforo, compararUrgencia, grupoDashboard,
    validarFichaParaCarta,
} from '../src/utils/incrementoCalc.js';

describe('pctAplicable', () => {
    it('IPC usa el índice del año tal cual', () => {
        expect(pctAplicable({ tipoIndice: 'IPC' }, { pct: 5.2 })).toBe(5.2);
    });
    it('IPC sin índice configurado queda pendiente (null)', () => {
        expect(pctAplicable({ tipoIndice: 'IPC' }, null)).toBeNull();
        expect(pctAplicable({ tipoIndice: 'IPC_PLUS', puntosAdicionales: 2 }, null)).toBeNull();
    });
    it('IPC_PLUS suma los puntos pactados', () => {
        expect(pctAplicable({ tipoIndice: 'IPC_PLUS', puntosAdicionales: 2 }, { pct: 5.2 })).toBeCloseTo(7.2);
    });
    it('FIJO usa el % pactado sin necesitar índice', () => {
        expect(pctAplicable({ tipoIndice: 'FIJO', pctFijo: 6 }, null)).toBe(6);
    });
});

describe('calcularNuevoCanon (peso exacto)', () => {
    it('ejemplo del issue #46: 1.500.000 × 5,20% = 1.578.000', () => {
        expect(calcularNuevoCanon(1500000, 5.2)).toBe(1578000);
    });
    it('redondea al peso, no a miles', () => {
        expect(calcularNuevoCanon(1234567, 5.2)).toBe(Math.round(1234567 * 1.052)); // 1298765
    });
    it('acepta canon como texto formateado', () => {
        expect(calcularNuevoCanon('1.500.000', 5.2)).toBe(1578000);
    });
    it('null si falta el porcentaje o el canon', () => {
        expect(calcularNuevoCanon(1500000, null)).toBeNull();
        expect(calcularNuevoCanon(0, 5.2)).toBeNull();
    });
});

describe('desgloseIncremento', () => {
    it('entrega canon anterior, aumento y nuevo canon', () => {
        expect(desgloseIncremento(1500000, 5.2)).toEqual({
            canonAnterior: 1500000, pct: 5.2, aumento: 78000, nuevoCanon: 1578000,
        });
    });
});

describe('aniversarios', () => {
    it('aniversario simple', () => {
        expect(aniversarioEnAnio('2025-03-15', 2026)).toBe('2026-03-15');
    });
    it('29 de febrero cae al 28 en año no bisiesto', () => {
        expect(aniversarioEnAnio('2024-02-29', 2026)).toBe('2026-02-28');
        expect(aniversarioEnAnio('2024-02-29', 2028)).toBe('2028-02-29');
    });
    it('próximo aniversario: el de este año si no ha pasado', () => {
        expect(proximoAniversario('2025-10-01', '2026-08-02')).toEqual({ fecha: '2026-10-01', periodo: 2026 });
    });
    it('próximo aniversario: el del año siguiente si ya pasó', () => {
        expect(proximoAniversario('2025-03-15', '2026-08-02')).toEqual({ fecha: '2027-03-15', periodo: 2027 });
    });
    it('el mismo día del aniversario cuenta como próximo (hoy inclusive)', () => {
        expect(proximoAniversario('2025-08-02', '2026-08-02')).toEqual({ fecha: '2026-08-02', periodo: 2026 });
    });
    it('un contrato firmado este año no tiene aniversario hasta el año entrante', () => {
        expect(proximoAniversario('2026-03-01', '2026-08-02')).toEqual({ fecha: '2027-03-01', periodo: 2027 });
    });
    it('fecha inválida → null', () => {
        expect(proximoAniversario('', '2026-08-02')).toBeNull();
    });
});

describe('aniversariosEnRadar (#47)', () => {
    const hoy = '2026-08-02';
    it('próximo aniversario dentro del horizonte', () => {
        expect(aniversariosEnRadar('2025-08-10', hoy)).toEqual([{ fecha: '2026-08-10', periodo: 2026 }]);
    });
    it('fuera del horizonte → radar vacío', () => {
        expect(aniversariosEnRadar('2025-11-15', hoy)).toEqual([]);
    });
    it('aniversario recién vencido entra al radar (retrovisor)', () => {
        expect(aniversariosEnRadar('2025-07-15', hoy)).toEqual([{ fecha: '2026-07-15', periodo: 2026 }]);
    });
    it('vencido hace más del retrovisor → ya no se crea', () => {
        expect(aniversariosEnRadar('2025-03-01', hoy)).toEqual([]);
    });
    it('vencido reciente Y próximo cercano pueden coincidir', () => {
        // inicio sept 2024: aniversario 2025 quedó atrás hace mucho; el de
        // sept 2026 está a ~45 días → solo el próximo
        expect(aniversariosEnRadar('2024-09-15', hoy)).toEqual([{ fecha: '2026-09-15', periodo: 2026 }]);
    });
    it('el contrato firmado este año no entra por retrovisor', () => {
        expect(aniversariosEnRadar('2026-07-20', hoy)).toEqual([]);
    });
});

describe('diasHasta', () => {
    it('futuro positivo, pasado negativo, hoy cero', () => {
        expect(diasHasta('2026-08-10', '2026-08-02')).toBe(8);
        expect(diasHasta('2026-07-30', '2026-08-02')).toBe(-3);
        expect(diasHasta('2026-08-02', '2026-08-02')).toBe(0);
    });
});

describe('semaforo (#52)', () => {
    const hoy = '2026-08-02';
    const pend = (fechaEfectiva) => ({ status: 'PENDIENTE', fechaEfectiva });
    it('verde: más de 60 días', () => {
        expect(semaforo(pend('2026-11-01'), hoy).clave).toBe('VERDE');
    });
    it('amarillo: entre 30 y 60 días', () => {
        expect(semaforo(pend('2026-09-15'), hoy).clave).toBe('AMARILLO');
    });
    it('naranja: menos de 30 días', () => {
        expect(semaforo(pend('2026-08-25'), hoy).clave).toBe('NARANJA');
    });
    it('rojo: debe enviarse (≤ 15 días)', () => {
        expect(semaforo(pend('2026-08-10'), hoy).clave).toBe('ROJO');
    });
    it('negro: vencido sin aplicar', () => {
        expect(semaforo(pend('2026-07-01'), hoy).clave).toBe('NEGRO');
        expect(semaforo({ status: 'ENVIADA', fechaEfectiva: '2026-07-01' }, hoy).clave).toBe('NEGRO');
    });
    it('azul: carta ya enviada, esperando la fecha', () => {
        expect(semaforo({ status: 'ENVIADA', fechaEfectiva: '2026-08-10' }, hoy).clave).toBe('AZUL');
    });
    it('aplicado y anulado tienen su propio estado', () => {
        expect(semaforo({ status: 'APLICADA', fechaEfectiva: '2026-07-01' }, hoy).clave).toBe('APLICADO');
        expect(semaforo({ status: 'ANULADA', fechaEfectiva: '2026-08-10' }, hoy).clave).toBe('ANULADO');
    });
    it('ordena por urgencia: vencido primero, luego rojo', () => {
        const lista = [pend('2026-11-01'), pend('2026-08-10'), pend('2026-07-01')];
        const ordenada = [...lista].sort((a, b) => compararUrgencia(a, b, hoy));
        expect(ordenada.map((i) => i.fechaEfectiva)).toEqual(['2026-07-01', '2026-08-10', '2026-11-01']);
    });
});

describe('grupoDashboard (#48)', () => {
    const hoy = '2026-08-02';
    it('fecha llegada y no aplicado → pendiente de aplicar', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2026-08-01' }, hoy)).toBe('PENDIENTE_APLICAR');
        expect(grupoDashboard({ status: 'ENVIADA', fechaEfectiva: '2026-08-02' }, hoy)).toBe('PENDIENTE_APLICAR');
    });
    it('≤ 7 días sin enviar → esta semana', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2026-08-08' }, hoy)).toBe('ESTA_SEMANA');
    });
    it('≤ 31 días sin enviar → este mes', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2026-08-25' }, hoy)).toBe('ESTE_MES');
    });
    it('mes calendario siguiente → próximo mes', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2026-09-20' }, hoy)).toBe('PROXIMO_MES');
    });
    it('diciembre → enero del año siguiente cuenta como próximo mes', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2027-01-10' }, '2026-12-05')).toBe('PROXIMO_MES');
    });
    it('carta enviada esperando fecha no aparece como "debe enviarse"', () => {
        expect(grupoDashboard({ status: 'ENVIADA', fechaEfectiva: '2026-08-25' }, hoy)).toBeNull();
    });
    it('lejano o cerrado → null', () => {
        expect(grupoDashboard({ status: 'PENDIENTE', fechaEfectiva: '2026-12-01' }, hoy)).toBeNull();
        expect(grupoDashboard({ status: 'APLICADA', fechaEfectiva: '2026-08-01' }, hoy)).toBeNull();
    });
});

describe('validarFichaParaCarta', () => {
    const ficha = {
        arrendatarioNombre: 'PEDRO PÉREZ', direccion: 'CL 1 # 2-3',
        canonActual: 1500000, fechaInicioContrato: '2025-08-01',
        arrendatarioEmail: '',
    };
    it('ficha completa genera carta sin correo', () => {
        expect(validarFichaParaCarta(ficha)).toEqual([]);
    });
    it('para enviar por correo exige el email', () => {
        expect(validarFichaParaCarta(ficha, { paraCorreo: true })).toEqual(['La ficha no tiene correo del arrendatario']);
    });
    it('reporta todos los faltantes', () => {
        expect(validarFichaParaCarta({}).length).toBe(4);
    });
});
