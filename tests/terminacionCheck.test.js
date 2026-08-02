import { describe, it, expect } from 'vitest';
import { verificarTerminacion } from '../src/utils/terminacionCheck.js';

const contrato = {
    fechaInicio: '2026-01-15',
    fechaVencimiento: '2027-01-15',
    canon: 1500000,
};

describe('verificarTerminacion (#42)', () => {
    it('preaviso cumplido y entrega al vencimiento: sin penalidad', () => {
        const r = verificarTerminacion(contrato, { fechaSolicitud: '2026-08-02' });
        expect(r.datosCompletos).toBe(true);
        expect(r.vigente).toBe(true);
        expect(r.preaviso.cumplido).toBe(true);       // límite 2026-10-15
        expect(r.anticipada).toBe(false);
        expect(r.clausulaPenal.aplica).toBe(false);
        expect(r.clausulaPenal.monto).toBe(0);
    });
    it('preaviso incumplido: reporta los días de retraso', () => {
        const r = verificarTerminacion(contrato, { fechaSolicitud: '2026-11-01' });
        expect(r.preaviso.cumplido).toBe(false);      // límite era 15 oct
        expect(r.preaviso.diasTarde).toBe(17);
        expect(r.observaciones.join(' ')).toContain('NO cumplido');
    });
    it('terminación anticipada: 3 cánones de penalidad', () => {
        const r = verificarTerminacion(contrato, {
            fechaSolicitud: '2026-05-01', fechaDeseada: '2026-08-31',
        });
        expect(r.anticipada).toBe(true);
        expect(r.clausulaPenal.aplica).toBe(true);
        expect(r.clausulaPenal.canones).toBe(3);
        expect(r.clausulaPenal.monto).toBe(4500000);
        // entrega en agosto con solicitud en mayo: preaviso de 3 meses NO alcanza
        expect(r.preaviso.cumplido).toBe(true);       // 2026-05-01 <= 2026-05-31 (límite)
    });
    it('contrato ya vencido: advierte sobre prórrogas', () => {
        const r = verificarTerminacion(contrato, { fechaSolicitud: '2027-03-01' });
        expect(r.vigente).toBe(false);
        expect(r.observaciones.join(' ')).toContain('prórroga');
    });
    it('fechas incompletas: no calcula y lo dice', () => {
        const r = verificarTerminacion({}, { fechaSolicitud: '2026-08-02' });
        expect(r.datosCompletos).toBe(false);
        expect(r.observaciones.length).toBe(1);
    });
});
