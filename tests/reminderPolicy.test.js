import { describe, it, expect } from 'vitest';
import {
    isWorkingNow, bogotaParts, reminderActionFor,
    PING_AFTER_MS, NOTIFY_AFTER_MS, NOTIFY_THROTTLE_MS, ACTIVE_WINDOW_MS,
} from '../src/utils/reminderPolicy.js';

const MIN = 60 * 1000;

describe('isWorkingNow', () => {
    it('L-V trabaja de 9am a 5:59pm', () => {
        expect(isWorkingNow(9, 1)).toBe(true);   // lunes 9am
        expect(isWorkingNow(17, 5)).toBe(true);  // viernes 5pm
        expect(isWorkingNow(18, 3)).toBe(false); // miércoles 6pm
        expect(isWorkingNow(8, 2)).toBe(false);  // martes 8am
    });

    it('sábado trabaja de 9am a 12:59pm', () => {
        expect(isWorkingNow(9, 6)).toBe(true);
        expect(isWorkingNow(12, 6)).toBe(true);
        expect(isWorkingNow(13, 6)).toBe(false);
    });

    it('domingo cerrado', () => {
        expect(isWorkingNow(10, 0)).toBe(false);
    });
});

describe('bogotaParts', () => {
    it('convierte UTC a hora de Bogotá (UTC-5)', () => {
        // 15:00 UTC = 10:00 Bogotá, un martes
        const { hour, day } = bogotaParts(new Date('2026-07-14T15:00:00Z'));
        expect(hour).toBe(10);
        expect(day).toBe(2);
    });

    it('cruza la medianoche correctamente', () => {
        // 03:00 UTC del miércoles = 22:00 Bogotá del martes
        const { hour, day } = bogotaParts(new Date('2026-07-15T03:00:00Z'));
        expect(hour).toBe(22);
        expect(day).toBe(2);
    });
});

describe('reminderActionFor — check-in horario', () => {
    it('sin acción antes de los 50 min de silencio', () => {
        expect(reminderActionFor(30 * MIN)).toBe(null);
        expect(reminderActionFor(PING_AFTER_MS - 1)).toBe(null);
    });

    it('ping silencioso entre 50 y 75 min (auto-reporte sin molestar)', () => {
        expect(reminderActionFor(PING_AFTER_MS)).toBe('ping');
        expect(reminderActionFor(60 * MIN)).toBe('ping');
        expect(reminderActionFor(NOTIFY_AFTER_MS - 1)).toBe('ping');
    });

    it('aviso visible desde 75 min — llega ANTES de perder el segundo check-in', () => {
        expect(reminderActionFor(NOTIFY_AFTER_MS)).toBe('notify');
        expect(reminderActionFor(2 * 60 * MIN)).toBe('notify');
        // El esquema anterior avisaba a las 2h: ya se habían perdido 1-2 horas.
        expect(NOTIFY_AFTER_MS).toBeLessThan(2 * 60 * MIN);
    });

    it('el aviso visible se limita a uno por hora (cae a ping mientras tanto)', () => {
        const recienAvisado = 10 * MIN; // avisó hace 10 min
        expect(reminderActionFor(90 * MIN, recienAvisado)).toBe('ping');
        expect(reminderActionFor(90 * MIN, NOTIFY_THROTTLE_MS)).toBe('notify');
    });

    it('cuenta inactiva (>12h sin reportar) no recibe nada — día libre', () => {
        expect(reminderActionFor(ACTIVE_WINDOW_MS + 1)).toBe(null);
        expect(reminderActionFor(24 * 60 * MIN)).toBe(null);
    });
});
