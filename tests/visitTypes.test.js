import { describe, it, expect } from 'vitest';
import { getLateStartMinutes, LATE_START_GRACE_MIN } from '../src/utils/visitTypes.js';

// Badge "inició tarde" en Agenda y detalle de visita (issue #13).
describe('getLateStartMinutes', () => {
    const programada = '2026-06-15T10:00:00.000Z';

    it('null si la visita no ha iniciado', () => {
        expect(getLateStartMinutes({ scheduledStart: programada, actualStart: null })).toBeNull();
        expect(getLateStartMinutes(null)).toBeNull();
    });

    it('null si inició a tiempo', () => {
        expect(getLateStartMinutes({
            scheduledStart: programada,
            actualStart: '2026-06-15T10:00:00.000Z',
        })).toBeNull();
    });

    it('null dentro de la tolerancia', () => {
        const dentroDeGracia = new Date(
            new Date(programada).getTime() + LATE_START_GRACE_MIN * 60000
        ).toISOString();
        expect(getLateStartMinutes({
            scheduledStart: programada,
            actualStart: dentroDeGracia,
        })).toBeNull();
    });

    it('devuelve los minutos de retraso pasada la tolerancia', () => {
        expect(getLateStartMinutes({
            scheduledStart: programada,
            actualStart: '2026-06-15T10:25:00.000Z',
        })).toBe(25);
    });

    it('null si inició antes de lo programado', () => {
        expect(getLateStartMinutes({
            scheduledStart: programada,
            actualStart: '2026-06-15T09:45:00.000Z',
        })).toBeNull();
    });
});
