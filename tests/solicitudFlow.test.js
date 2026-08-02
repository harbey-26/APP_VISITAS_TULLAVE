import { describe, it, expect } from 'vitest';
import {
    TRANSICIONES, puedeTransicionar, ESTADOS_ABIERTOS, SOLICITUD_ESTADOS,
    vencimientoDP, nivelAlertaDP, urgenciaVencimiento, compararBandeja,
    pasoReparacionSiguiente,
} from '../src/utils/solicitudFlow.js';

describe('máquina de estados (#33)', () => {
    it('el flujo feliz avanza en orden', () => {
        expect(puedeTransicionar('RECIBIDA', 'EN_REVISION')).toBe(true);
        expect(puedeTransicionar('EN_REVISION', 'EN_GESTION')).toBe(true);
        expect(puedeTransicionar('EN_GESTION', 'PENDIENTE_TERCERO')).toBe(true);
        expect(puedeTransicionar('PENDIENTE_TERCERO', 'FINALIZADA')).toBe(true);
        expect(puedeTransicionar('FINALIZADA', 'ARCHIVADA')).toBe(true);
    });
    it('no se saltan pasos (Recibida → Finalizada prohibido)', () => {
        expect(puedeTransicionar('RECIBIDA', 'FINALIZADA')).toBe(false);
        expect(puedeTransicionar('RECIBIDA', 'EN_GESTION')).toBe(false);
        expect(puedeTransicionar('EN_REVISION', 'FINALIZADA')).toBe(false);
    });
    it('se puede retroceder y reabrir', () => {
        expect(puedeTransicionar('EN_GESTION', 'EN_REVISION')).toBe(true);
        expect(puedeTransicionar('EN_REVISION', 'RECIBIDA')).toBe(true);
        expect(puedeTransicionar('FINALIZADA', 'EN_GESTION')).toBe(true);
    });
    it('archivada es terminal', () => {
        expect(TRANSICIONES.ARCHIVADA).toEqual([]);
    });
    it('todo estado declarado existe en el catálogo', () => {
        for (const [desde, destinos] of Object.entries(TRANSICIONES)) {
            expect(SOLICITUD_ESTADOS[desde], desde).toBeDefined();
            for (const d of destinos) expect(SOLICITUD_ESTADOS[d], d).toBeDefined();
        }
        expect(ESTADOS_ABIERTOS).not.toContain('FINALIZADA');
        expect(ESTADOS_ABIERTOS).not.toContain('ARCHIVADA');
    });
});

describe('derechos de petición (#41)', () => {
    it('vencimiento general: 15 días hábiles desde la radicación', () => {
        expect(vencimientoDP('2026-07-31', 'GENERAL')).toBe('2026-08-25');
    });
    it('documentos 10 hábiles, consultas 30 hábiles (saltando festivos de agosto)', () => {
        // 7 ago (Boyacá) y 17 ago (Asunción trasladada) no cuentan
        expect(vencimientoDP('2026-07-31', 'DOCUMENTOS')).toBe('2026-08-18');
        expect(vencimientoDP('2026-07-31', 'CONSULTA')).toBe('2026-09-15');
    });
    it('niveles de alerta por cercanía al vencimiento', () => {
        const base = { fechaRadicacion: '2026-07-31', fechaVencimiento: '2026-08-25' };
        expect(nivelAlertaDP({ ...base, hoy: '2026-08-03' })).toBeNull();          // recién radicado
        expect(nivelAlertaDP({ ...base, hoy: '2026-08-13' })).toBe('MITAD');       // ~8 de 15 hábiles
        expect(nivelAlertaDP({ ...base, hoy: '2026-08-23' })).toBe('TRES_DIAS');
        expect(nivelAlertaDP({ ...base, hoy: '2026-08-25' })).toBe('VENCE_HOY');
        expect(nivelAlertaDP({ ...base, hoy: '2026-08-26' })).toBe('VENCIDO');
    });
});

describe('urgencia y bandeja (#43)', () => {
    const hoy = '2026-08-02';
    it('clasifica por vencimiento', () => {
        expect(urgenciaVencimiento('2026-08-01', hoy)).toBe('VENCIDA');
        expect(urgenciaVencimiento('2026-08-04', hoy)).toBe('POR_VENCER');
        expect(urgenciaVencimiento('2026-09-01', hoy)).toBe('VIGENTE');
        expect(urgenciaVencimiento(null, hoy)).toBe('SIN_TERMINO');
    });
    it('ordena: vencidas, por vencer, prioridad, fecha', () => {
        const lista = [
            { id: 'sinTermino', prioridad: 'ALTA', fechaVencimiento: null },
            { id: 'vencida', prioridad: 'BAJA', fechaVencimiento: '2026-07-30' },
            { id: 'porVencerMedia', prioridad: 'MEDIA', fechaVencimiento: '2026-08-04' },
            { id: 'porVencerAlta', prioridad: 'ALTA', fechaVencimiento: '2026-08-05' },
            { id: 'vigente', prioridad: 'ALTA', fechaVencimiento: '2026-09-10' },
        ];
        const orden = [...lista].sort((a, b) => compararBandeja(a, b, hoy)).map((s) => s.id);
        expect(orden).toEqual(['vencida', 'porVencerAlta', 'porVencerMedia', 'vigente', 'sinTermino']);
    });
});

describe('pasos de reparación (#36)', () => {
    it('avanza en orden y termina', () => {
        expect(pasoReparacionSiguiente('CASO_CREADO')).toBe('FOTOS_ADJUNTAS');
        expect(pasoReparacionSiguiente('TECNICO_ASIGNADO')).toBe('REPARACION_FINALIZADA');
        expect(pasoReparacionSiguiente('REPARACION_FINALIZADA')).toBeNull();
    });
});
