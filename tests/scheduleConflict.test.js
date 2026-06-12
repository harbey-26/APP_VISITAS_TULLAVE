import { describe, it, expect } from 'vitest';
import { hasScheduleConflict } from '../src/utils/scheduleConflict.js';

// Evita que un agente quede con dos visitas solapadas (createVisit/updateVisit).
const visita = (inicio, duracionMin) => ({
    scheduledStart: inicio,
    estimatedDuration: duracionMin,
});

describe('hasScheduleConflict', () => {
    const existentes = [visita('2026-06-15T10:00:00.000Z', 60)]; // 10:00–11:00

    it('detecta solapamiento parcial (empieza durante otra visita)', () => {
        expect(hasScheduleConflict(existentes, '2026-06-15T10:30:00.000Z', 60)).toBe(true);
    });

    it('detecta solapamiento cuando la nueva envuelve a la existente', () => {
        expect(hasScheduleConflict(existentes, '2026-06-15T09:30:00.000Z', 120)).toBe(true);
    });

    it('detecta solapamiento cuando la nueva queda contenida', () => {
        expect(hasScheduleConflict(existentes, '2026-06-15T10:15:00.000Z', 15)).toBe(true);
    });

    it('permite visitas consecutivas (termina 11:00, empieza 11:00)', () => {
        expect(hasScheduleConflict(existentes, '2026-06-15T11:00:00.000Z', 60)).toBe(false);
    });

    it('permite visita que termina justo cuando empieza la existente', () => {
        expect(hasScheduleConflict(existentes, '2026-06-15T09:00:00.000Z', 60)).toBe(false);
    });

    it('sin visitas existentes no hay conflicto', () => {
        expect(hasScheduleConflict([], '2026-06-15T10:00:00.000Z', 60)).toBe(false);
    });

    it('revisa contra todas las visitas del día', () => {
        const dia = [
            visita('2026-06-15T08:00:00.000Z', 30),
            visita('2026-06-15T14:00:00.000Z', 90), // 14:00–15:30
        ];
        expect(hasScheduleConflict(dia, '2026-06-15T15:00:00.000Z', 30)).toBe(true);
        expect(hasScheduleConflict(dia, '2026-06-15T15:30:00.000Z', 30)).toBe(false);
    });
});
